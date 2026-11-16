/** Separate, private Phase 0 package. Never installs with the shipping Always-on bundle. */
import type { Context } from '@deepseek-ai/cordis';
import type {} from '@deepseek-ai/dsh-client-connection';
import type {} from '@deepseek-ai/cordis-plugin-loader';
import { z } from 'zod';
import { connectProbe } from './probe-connection.js';
// Harness SessionId is an opaque branded string, not a UUID contract.
const sessionId = z.string().min(1).max(256).regex(/^[^\x00-\x1f\x7f]+$/);
const command = z.discriminatedUnion('action', [
  z.object({ action: z.literal('create') }).strict(),
  z.object({ action: z.literal('read'), sessionId }).strict(),
  z.object({ action: z.literal('rename'), sessionId, title: z.string().trim().min(1).max(120) }).strict(),
  z.object({ action: z.literal('prompt'), sessionId, requestId: z.uuid(), text: z.string().trim().min(1).max(2000) }).strict(),
]);
export const inject = ['connection'];
export async function apply(ctx: Context) {
  const origin = process.env.ALWAYS_ON_PHASE0_REMOTE_ORIGIN;
  const token = process.env.ALWAYS_ON_PHASE0_REMOTE_TOKEN;
  if (!origin || !token) throw new Error('Phase 0 probe requires an explicitly authorized remote test Host');
  // This endpoint exists only in the separately installed disposable CI probe.
  // Read Loader state directly: Electron may not forward its Host's stderr.
  // No config, unredacted errors, absolute paths, model text or credentials leave it.
  // Stack observations contain only file basenames and line/column numbers.
  ctx.effect(() => ctx.connection.fetch.register({
    path: '/api/always-on-phase0-startup', methods: ['GET'], requestBody: 'buffered',
    async fetch() {
      const loader = ctx.get('loader');
      const entries = [];
      for (const entry of loader?.entries() ?? []) {
        if (!/^@abwoo\/(?:deepseek-always-on|deepseek-always-on-desktop|always-on-desktop-remote-probe)$/.test(entry.options.name)) continue;
        const fiber = entry.fiber;
        let failure;
        if (fiber?.state === 3) {
          try { await fiber.await(); } catch (error) {
            const e = error as Error & { code?: string };
            const reasons = {
              sqliteBusy: /database is locked|SQLITE_BUSY/i,
              closedStore: /database is not open|database.*closed/i,
              disposedContext: /disposed|inactive context/i,
              duplicateRegistration: /already registered|duplicate/i,
              missingService: /service.*not (?:found|available)|missing.*service/i,
              nullAccess: /Cannot (?:read|set) properties? of (?:undefined|null)/i,
              notFunction: /is not a function/i,
              duplicateService: /already provided|already exists/i,
            };
            const frames = String(e?.stack ?? '').split('\n').slice(1, 7).flatMap(line => {
              const match = line.match(/([a-zA-Z0-9_.-]+\.(?:m?js|ts)):(\d+):(\d+)/);
              return match ? [{ file: match[1], line: Number(match[2]), column: Number(match[3]) }] : [];
            });
            const rawMessage = String(e?.message ?? '');
            const message = /token|secret|password|cookie|authorization|bearer|pairing|credential|api.?key|private.?key/i.test(rawMessage)
              ? '[credential-related error omitted]'
              : rawMessage.replace(/(?:file:\/\/)?(?:[A-Za-z]:)?\/[^\s)'",]*/g, '[path]')
                .replace(/[A-Za-z0-9+_=-]{24,}/g, '[opaque]').slice(0, 500);
            failure = {
              message,
              type: /^(?:Error|TypeError|RangeError|SyntaxError|AggregateError|CordisError)$/.test(e?.name) ? e.name : 'unknown',
              frames,
              ...(typeof e?.code === 'string' && /^[A-Z][A-Z0-9_]{0,63}$/.test(e.code) ? { code: e.code } : {}),
              categories: Object.entries(reasons).filter(([, pattern]) => pattern.test(String(e?.message ?? ''))).map(([key]) => key),
            };
          }
        }
        entries.push({ module: entry.options.name, enabled: !entry.disabled,
          phase: fiber?.state ?? null, ...(failure ? { failure } : {}) });
      }
      const services = Object.fromEntries((['schedule', 'agents', 'sessions', 'tools',
        'systemPrompt', 'connection', 'webServer', 'sessionController', 'alwaysOn'] as const).map(key => [key, !!ctx.get(key)]));
      return Response.json({ loaderAvailable: !!loader, services, entries });
    },
  }));
  const remote = await connectProbe(origin, token, process.env.ALWAYS_ON_PHASE0_ALLOW_LOOPBACK === '1');
  ctx.effect(() => () => remote.close());
  ctx.effect(() => ctx.connection.fetch.register({
    path: '/api/always-on-phase0-remote', methods: ['POST'], requestBody: 'buffered',
    async fetch(request) {
      try {
        const text = await request.text();
        if (text.length > 8192) return Response.json({ error: 'Request too large' }, { status: 413 });
        const parsed = command.safeParse(JSON.parse(text));
        if (!parsed.success) return Response.json({ error: 'Invalid probe command' }, { status: 400 });
        const c = parsed.data;
        let id: string;
        if (c.action === 'create') {
          const created = await remote.session.create({});
          if (!created.ok) throw created.error;
          id = created.value.sessionId;
        } else {
          id = c.sessionId;
          if (c.action === 'rename') {
            const result = await remote.session.rename({ sessionId: id as never, title: c.title });
            if (!result.ok) throw result.error;
          }
          if (c.action === 'prompt') {
            const receipt = await remote.session.prompt({ sessionId: id as never, requestId: c.requestId as never,
              mode: 'queue', content: [{ type: 'text', text: c.text }] });
            if (!receipt.ok) throw receipt.error;
          }
        }
        const events = await remote.session.events({ address: { kind: 'session', sessionId: id as never } });
        if (!events.ok) throw events.error;
        return Response.json({ authority: remote.authority, sessionId: id, events: events.value,
          promptAccepted: c.action === 'prompt', modelSuccessClaimed: false, phase0Only: true });
      } catch {
        // Do not expose operator credentials, internal stack traces or remote URLs with tokens.
        return Response.json({ error: 'Remote probe failed; no local Session fallback was attempted' }, { status: 502 });
      }
    },
  }));
}
