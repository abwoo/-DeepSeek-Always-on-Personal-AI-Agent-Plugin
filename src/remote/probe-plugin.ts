/** Separate, private Phase 0 package. Never installs with the shipping Always-on bundle. */
import type { Context } from '@deepseek-ai/cordis';
import type {} from '@deepseek-ai/dsh-client-connection';
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
