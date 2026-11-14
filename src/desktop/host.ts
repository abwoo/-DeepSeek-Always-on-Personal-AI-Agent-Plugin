import type { Context } from '@deepseek-ai/cordis';
import type {} from '@deepseek-ai/dsh-client-connection';
import type {} from '@deepseek-ai/dsh-plugin-manager';
import { PairedDesktop } from './device.js';
import { AccountDesktop } from './account.js';
import { releaseServiceOrigin } from '../shared/service-config.js';
import { z } from 'zod';
import { connectProbe, validateAuthority } from '../remote/probe-connection.js';

const id = z.string().min(1).max(256).regex(/^[^\x00-\x1f\x7f]+$/);
const sessionCommand = z.discriminatedUnion('action', [
  z.object({ action: z.literal('list') }).strict(),
  z.object({ action: z.literal('create'), creationId: id }).strict(),
  z.object({ action: z.literal('read'), sessionId: id }).strict(),
  z.object({ action: z.literal('prompt'), sessionId: id, requestId: z.uuid(), text: z.string().trim().min(1).max(12000) }).strict(),
  z.object({ action: z.literal('cancel'), sessionId: id }).strict(),
]);
const mutation = z.object({ action: z.enum(['task.create', 'task.control', 'task.run', 'memory.save', 'memory.delete', 'inbox.read']), data: z.unknown() }).strict();
type Client = Awaited<ReturnType<typeof connectProbe>>;

/** One isolated SDK client, never an Agent Runtime or a local Session store. */
export class DesktopRemote {
  private client?: Client;
  private pending?: Promise<Client>;
  private disposed = false;
  readonly authority?: string;
  constructor(private token?: string, authority?: string, private loopback = false) {
    this.authority = authority ? validateAuthority(authority, loopback).origin : undefined;
  }
  status() { return { authority: this.authority ?? null, configured: !!this.authority && !!this.token,
    connected: !this.disposed && !!this.client?.connected, credentialMode: 'operator-preview', productionPairingReady: false }; }
  async disconnect() { const c = this.client; this.client = undefined; await c?.close(); }
  async dispose() { this.disposed = true; await this.pending?.catch(() => {}); await this.disconnect(); }
  private async connect(write: boolean) {
    if (this.disposed) throw new Error('Plugin disabled');
    if (this.client?.connected) return this.client;
    if (write) throw new Error('Remote offline; refresh before writing');
    if (!this.authority || !this.token) throw new Error('Managed Host is not configured');
    if (!this.pending) this.pending = (async () => {
      await this.disconnect();
      const c = await connectProbe(this.authority!, this.token!, this.loopback);
      if (this.disposed) { await c.close(); throw new Error('Plugin disabled'); }
      this.client = c; return c;
    })().finally(() => { this.pending = undefined; });
    return this.pending;
  }
  async snapshot() {
    try {
      const c = await this.connect(false), response = await c.alwaysOn('GET');
      if (!response.ok) throw new Error('Remote state read rejected');
      const body = await response.json();
      return { ...body, pushPublicKey: null, connection: this.status() };
    } catch (error) { await this.disconnect(); throw error; }
  }
  async mutate(body: unknown) {
    const {operationId:_,...legacy} = body as Record<string,unknown>;const parsed = mutation.parse(legacy);
    const c = await this.connect(true);
    try {
      const response = await c.alwaysOn('POST', parsed);
      const result = await response.json();
      return { status: response.status, body: result };
    } catch { await this.disconnect(); throw new Error('Outcome unknown; review remote state before retrying. No automatic retry was made.'); }
  }
  async session(body: unknown) {
    const {operationId:_,...legacy} = body as Record<string,unknown>;const command = sessionCommand.parse(legacy);
    const write = !['list', 'read'].includes(command.action);
    const c = await this.connect(write);
    try {
      if (command.action === 'list') {
        const result = await c.session.list({}); if (!result.ok) throw result.error;
        return { ...result.value, connection: this.status() };
      }
      let sessionId: string;
      if (command.action === 'create') {
        const result = await c.session.create({ sessionId: command.creationId as never });
        if (!result.ok) throw result.error; sessionId = result.value.sessionId;
      } else {
        sessionId = command.sessionId;
        if (command.action === 'prompt') {
          const receipt = await c.session.prompt({ sessionId: sessionId as never, requestId: command.requestId as never,
            mode: 'queue', content: [{ type: 'text', text: command.text }] });
          if (!receipt.ok) throw receipt.error;
        }
        if (command.action === 'cancel') {
          const result = await c.session.cancel({ sessionId: sessionId as never }); if (!result.ok) throw result.error;
        }
      }
      const events = await c.session.events({ address: { kind: 'session', sessionId: sessionId as never }, maxMessages: 100 });
      if (!events.ok) throw events.error;
      const state = await c.session.state({ sessionId: sessionId as never }); if (!state.ok) throw state.error;
      return { sessionId, events: events.value, state: state.value, connection: this.status(),
        inputAccepted: command.action === 'prompt' };
    } catch { await this.disconnect(); throw new Error(write ? 'Remote operation failed or outcome unknown. Refresh to reconcile; no local fallback or automatic retry.' : 'Remote Session is unavailable. Refresh to reconnect.'); }
  }
}

export const inject = ['connection','credentials'];
export async function apply(ctx: Context) {
  const preview = process.env.ALWAYS_ON_DESKTOP_OPERATOR_PREVIEW === '1';
  const service = preview?new DesktopRemote(process.env.ALWAYS_ON_DESKTOP_REMOTE_TOKEN,process.env.ALWAYS_ON_DESKTOP_REMOTE_ORIGIN,process.env.ALWAYS_ON_DESKTOP_ALLOW_LOOPBACK==='1'):process.env.ALWAYS_ON_DESKTOP_ADVANCED_PAIRING==='1'?new PairedDesktop(ctx,process.env.ALWAYS_ON_DESKTOP_ALLOW_LOOPBACK==='1'):new AccountDesktop(ctx,releaseServiceOrigin);
  ctx.effect(() => () => service.dispose());
  const register = (path: string, methods: ('GET' | 'POST')[], handler: (request: Request) => Promise<Response>) =>
    ctx.effect(() => ctx.connection.fetch.register({ path, methods, requestBody: 'buffered', fetch:async(request)=>{
      // Profile bundle selection is authoritative even while an installed client module remains discoverable.
      const manager=ctx.get('pluginManager');
      if(manager){const bundle=(await manager.listBundles()).find(b=>b.name==='@abwoo/deepseek-always-on-desktop');if(!bundle?.enabled)return Response.json({error:'Plugin is disabled'},{status:404});}
      return handler(request);
    } }));
  const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'cache-control': 'no-store' } });
  const body = async (request: Request) => {
    if (!request.headers.get('content-type')?.startsWith('application/json')) throw new SyntaxError('JSON required');
    const text = await request.text(); if (text.length > 65536) throw new SyntaxError('Request too large');
    return JSON.parse(text);
  };
  for(const action of ['pair','forget','pending','dismiss','manage'] as const)register('/api/always-on-desktop/'+action,['POST'],async request=>{
    if(!(service instanceof PairedDesktop))return json({error:'Device pairing is unavailable in operator diagnostic mode'},409);
    try{return json(await (action==='pair'?service.pair(await body(request)):action==='forget'?service.forget():action==='dismiss'?service.dismiss(await body(request)):action==='manage'?service.manage(await body(request)):service.pending()));}catch(e){return json({error:e instanceof z.ZodError?'Invalid pairing command':e instanceof Error?e.message:'Pairing unavailable'},400);}
  });
  for(const action of ['login-start','login-complete'] as const)register('/api/always-on-desktop/'+action,['POST'],async()=>{
    if(!(service instanceof AccountDesktop))return json({error:'Account login unavailable in diagnostic mode'},409);
    try{return json(await (action==='login-start'?service.startLogin():service.finishLogin()));}catch(e){return json({error:e instanceof Error?e.message:'Sign in unavailable'},503);}
  });
  register('/api/always-on-desktop/status', ['GET'], async () => json(await service.status()));
  register('/api/always-on-desktop/events',['POST'],async request=>{
    if(!(service instanceof PairedDesktop))return json({error:'Event feed unavailable in diagnostic mode'},409);
    try{return json(await service.events(await body(request)));}catch(e){return json({error:e instanceof Error?e.message:'Event feed unavailable'},e instanceof Error&&'status'in e?Number(e.status):503);}
  });
  register('/api/always-on-desktop/state', ['GET', 'POST'], async (request) => {
    try {
      if (request.method === 'GET') return json(await service.snapshot());
      const result = await service.mutate(await body(request)); return json(result.body, result.status);
    } catch (e) { return json({ ok: false, error: e instanceof z.ZodError || e instanceof SyntaxError ? 'Invalid action' : e instanceof Error ? e.message : 'Remote unavailable', connection: await service.status() }, e instanceof z.ZodError || e instanceof SyntaxError ? 400 : 503); }
  });
  register('/api/always-on-desktop/sessions', ['POST'], async (request) => {
    try { return json(await service.session(await body(request))); }
    catch (e) { return json({ error: e instanceof z.ZodError || e instanceof SyntaxError ? 'Invalid Session command' : e instanceof Error ? e.message : 'Remote unavailable', connection: await service.status() }, e instanceof z.ZodError || e instanceof SyntaxError ? 400 : 503); }
  });
}
