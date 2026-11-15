import { writeRecordExport } from './export-contract.js';
export { writeRecordExport } from './export-contract.js';
export type { ExportPage } from './export-contract.js';
import {
  credentialsSchema,
  pairClaim,
  mutationSchema,
  snapshotSchema,
  goalSchema,
  type DeviceCredentials,
  type ManagedAction,
} from './managed-contract.js';
export { credentialsSchema, pairClaim, goalSchema, mutationSchema } from './managed-contract.js';
export type {
  DeviceCredentials,
  ManagedAction,
  ManagedSnapshot,
  GoalInput,
} from './managed-contract.js';
export interface PendingOperation {
  operationId: string;
  action: ManagedAction['action'] | 'goal.create';
  createdAt: string;
  resourceId?: string;
}
export interface OperationStorage {
  save(operation: PendingOperation): Promise<void>;
  remove(operationId: string): Promise<void>;
  list(): Promise<PendingOperation[]>;
}
async function fetchJson(transport: typeof fetch, url: string, init: RequestInit) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await transport(url, {
      ...init,
      signal: controller.signal,
      redirect: 'error',
    });
    if (response.url && new URL(response.url).origin !== new URL(url).origin)
      throw new ApiError(409, 'authority_mismatch');
    const data = await response.json();
    if (!response.ok) throw new ApiError(response.status, data.error || 'request_failed');
    return data;
  } finally {
    clearTimeout(timer);
  }
}
export interface ConnectionRecord {
  origin: string;
  credentials: DeviceCredentials;
}
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(
      code === 'account_suspended'
        ? 'Your account is paused. Contact the service operator to resume.'
        : code === 'account_disabled'
          ? 'Your account is disabled. Contact the service operator.'
          : code === 'sign_out_in_progress'
            ? 'Sign-out is in progress. Retry signing out if it fails.'
            : code === 'memory_conflict'
              ? 'This memory changed on another device. Refresh and review before saving.'
              : code,
    );
  }
}
export function managedOrigin(input: string, allowLoopback = false) {
  const u = new URL(input);
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname);
  if (
    u.username ||
    u.password ||
    u.search ||
    u.hash ||
    u.pathname !== '/' ||
    (u.protocol !== 'https:' && !(allowLoopback && local && u.protocol === 'http:'))
  )
    throw new Error('An HTTPS origin without credentials, path or query is required');
  return u.origin;
}
export class ManagedClient {
  readonly origin: string;
  constructor(
    origin: string,
    readonly credentials: DeviceCredentials,
    private operations?: OperationStorage,
    allowLoopback = false,
    private transport: typeof fetch = fetch,
  ) {
    this.origin = managedOrigin(origin, allowLoopback);
    credentialsSchema.parse(credentials);
  }
  static async pair(
    origin: string,
    code: string,
    name: string,
    platform: 'ios' | 'android' | 'macos' | 'windows' | 'other',
    allowLoopback = false,
    transport: typeof fetch = fetch,
  ): Promise<ConnectionRecord> {
    const base = managedOrigin(origin, allowLoopback);
    const body = pairClaim.parse({ code, name, platform });
    const result = await fetchJson(transport, base + '/personal-agent/v1/pair/claim', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    return { origin: base, credentials: credentialsSchema.parse(result) };
  }
  async request(path: string, body?: unknown) {
    if (
      !/^\/(snapshot|export|exports(?:\?cursor=[A-Za-z0-9_.%+-]{1,160}|\/release)?|events\?[^#]{1,1024}|runs\/[0-9a-f-]+|inbox\/[0-9a-f-]+|sessions|session\/read|changes(?:\?after=\d+)?|mutate|operations\/[0-9a-f-]+|goals|devices(?:\/revoke|\/pair-code)?|push\/(register|disable|ack|status))$/.test(
        path,
      )
    )
      throw new Error('Unsupported managed endpoint');
    const data = await fetchJson(this.transport, this.origin + '/personal-agent/v1' + path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        authorization: 'Bearer ' + this.credentials.token,
        'content-type': 'application/json',
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (data.authorityId && data.authorityId !== this.credentials.authorityId)
      throw new ApiError(409, 'authority_mismatch');
    return data;
  }
  exportRecords(write: (text: string) => Promise<void>, current?: () => boolean) {
    return writeRecordExport((path, body) => this.request(path, body), write, current);
  }
  async snapshot() {
    return snapshotSchema.parse(await this.request('/snapshot'));
  }
  events(cursor: { after: number; epoch?: string; live?: number }, sessionId?: string) {
    const q = new URLSearchParams({ after: String(cursor.after), live: String(cursor.live ?? 0) });
    if (cursor.epoch) q.set('epoch', cursor.epoch);
    if (sessionId) q.set('sessionId', sessionId);
    return this.request('/events?' + q);
  }
  sessions() {
    return this.request('/sessions');
  }
  readSession(sessionId: string, beforeSeq?: number) {
    return this.request('/session/read', {
      sessionId,
      ...(beforeSeq === undefined ? {} : { beforeSeq }),
    });
  }
  async mutate(operationId: string, command: ManagedAction) {
    const body = mutationSchema.parse({ operationId, command });
    const data = body.command.data as Record<string, unknown>;
    const resource = data.id ?? data.sessionId;
    const pending: PendingOperation = {
      operationId: body.operationId,
      action: body.command.action,
      createdAt: new Date().toISOString(),
      ...(typeof resource === 'string' ? { resourceId: resource } : {}),
    };
    // Persist before sending. Transport failure deliberately leaves this entry for reconciliation.
    if (this.operations) await this.operations.save(pending);
    const result = await this.request('/mutate', body);
    if (this.operations) await this.operations.remove(operationId);
    return result;
  }
  async createGoal(operationId: string, goal: import('./managed-contract.js').GoalInput) {
    const data = goalSchema.parse(goal);
    if (this.operations)
      await this.operations.save({
        operationId,
        action: 'goal.create',
        createdAt: new Date().toISOString(),
      });
    const result = await this.request('/goals', { operationId, goal: data });
    if (this.operations) await this.operations.remove(operationId);
    return result;
  }
  async reconcile() {
    const pending = (await this.operations?.list()) ?? [];
    const results = [];
    for (const operation of pending) {
      try {
        const result = await this.request('/operations/' + operation.operationId);
        if (result.status === 'committed') await this.operations?.remove(operation.operationId);
        results.push({ ...operation, status: result.status, result: result.result });
      } catch (e) {
        if (e instanceof ApiError && e.status === 404)
          results.push({ ...operation, status: 'not_recorded' });
        else throw e;
      }
    }
    // Not-recorded and unknown operations are never replayed automatically.
    return results;
  }
}

export { conversationRows } from './messages.js';

/** Native Session events use an exclusive beforeSeq cursor. Bind historical views to this run's durable terminal. */
export function resultBeforeSeq(run: {
  sessionId: string;
  resultReference?: string;
  finishedAt?: string;
}): number | undefined {
  const prefix = `session:${run.sessionId}#event:`;
  if (run.finishedAt) {
    const position = run.resultReference?.startsWith(prefix)
      ? run.resultReference.slice(prefix.length)
      : '';
    const seq = Number(position);
    if (!/^\d+$/.test(position) || !Number.isSafeInteger(seq) || seq >= Number.MAX_SAFE_INTEGER)
      throw Error(
        'This execution has no verified historical conversation boundary. Review its recorded result in Tasks.',
      );
  }
  if (!run.resultReference?.startsWith(prefix)) return undefined;
  const raw = run.resultReference.slice(prefix.length);
  if (!/^\d+$/.test(raw)) return undefined;
  const seq = Number(raw);
  return Number.isSafeInteger(seq) && seq < Number.MAX_SAFE_INTEGER ? seq + 1 : undefined;
}

export { snapshotSchema } from './managed-contract.js';
