import { z } from 'zod';
import {
  ApiError,
  ManagedClient,
  credentialsSchema,
  managedOrigin,
  type OperationStorage,
} from './managed-client.js';
export const accountConnectionSchema = z
  .object({
    origin: z.string(),
    credentials: credentialsSchema,
    account: z.object({ id: z.uuid() }).strict(),
    refreshToken: z.string().regex(/^ar_[A-Za-z0-9_-]{43}$/),
    refreshExpiresAt: z.iso.datetime(),
  })
  .strict();
export type AccountConnection = z.infer<typeof accountConnectionSchema>;
export const loginStartSchema = z
  .object({
    challenge: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
    name: z.string().trim().min(1).max(80),
    platform: z.enum(['ios', 'android', 'macos', 'windows', 'other']),
    mobile: z.boolean().default(false),
  })
  .strict();
export const loginCompleteSchema = z
  .object({ loginId: z.uuid(), verifier: z.string().regex(/^[A-Za-z0-9_-]{43}$/) })
  .strict();
/** Fixed operator-built service origin. No user-entered Host or issuer is accepted. */
export class AccountApi {
  readonly origin: string;
  constructor(
    origin: string,
    private transport: typeof fetch = fetch,
    private allowLoopback = false,
  ) {
    this.origin = managedOrigin(origin, allowLoopback);
  }
  async call(path: '/login/start' | '/login/complete' | '/refresh' | '/logout', body: unknown) {
    const controller = new AbortController(),
      timer = setTimeout(() => controller.abort(), 20000);
    try {
      const r = await this.transport(this.origin + '/account/v1' + path, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        redirect: 'error',
        signal: controller.signal,
      });
      if (r.url && new URL(r.url).origin !== this.origin)
        throw new ApiError(409, 'account_service_mismatch');
      const data = await r.json();
      if (!r.ok) throw new ApiError(r.status, data.error || 'account_unavailable');
      return data;
    } finally {
      clearTimeout(timer);
    }
  }
  start(input: z.input<typeof loginStartSchema>) {
    return this.call('/login/start', loginStartSchema.parse(input));
  }
  async complete(
    loginId: string,
    verifier: string,
  ): Promise<
    { state: 'pending' | 'provisioning' } | { state: 'ready'; connection: AccountConnection }
  > {
    const r = await this.call('/login/complete', loginCompleteSchema.parse({ loginId, verifier }));
    if (r.state === 'ready') {
      const c = accountConnectionSchema.parse(r.connection);
      if (managedOrigin(c.origin, this.allowLoopback) !== this.origin)
        throw new ApiError(409, 'account_service_mismatch');
      return { state: 'ready', connection: c };
    }
    if (r.state !== 'pending' && r.state !== 'provisioning')
      throw new ApiError(409, 'login_outcome_unknown');
    return { state: r.state };
  }
  async refresh(connection: AccountConnection) {
    const next = accountConnectionSchema.parse(
      await this.call('/refresh', {
        deviceId: connection.credentials.deviceId,
        refreshToken: connection.refreshToken,
      }),
    );
    if (
      next.account.id !== connection.account.id ||
      next.credentials.authorityId !== connection.credentials.authorityId ||
      next.credentials.deviceId !== connection.credentials.deviceId ||
      next.credentials.ownerId !== connection.credentials.ownerId ||
      managedOrigin(next.origin, this.allowLoopback) !== this.origin
    )
      throw new ApiError(409, 'account_identity_changed');
    return next;
  }
  logout(connection: AccountConnection) {
    return this.call('/logout', {
      deviceId: connection.credentials.deviceId,
      refreshToken: connection.refreshToken,
    });
  }
}
export class AccountManagedClient extends ManagedClient {
  private refreshing: Promise<void> | null = null;
  private connection: AccountConnection;
  private signingOut = false;
  private refreshFailed = false;
  private logoutPending: Promise<void> | null = null;
  constructor(
    record: AccountConnection,
    private save: (next: AccountConnection) => Promise<void>,
    operations?: OperationStorage,
    transport: typeof fetch = fetch,
    allowLoopback = false,
  ) {
    super(record.origin, { ...record.credentials }, operations, allowLoopback, transport);
    this.connection = accountConnectionSchema.parse(record);
    this.accountApi = new AccountApi(record.origin, transport, allowLoopback);
  }
  readonly accountApi: AccountApi;
  private async fresh() {
    if (this.signingOut) throw new ApiError(409, 'sign_out_in_progress');
    if (this.refreshFailed) throw new ApiError(401, 'sign_in_required');
    if (Date.parse(this.connection.credentials.expiresAt) > Date.now() + 60000) return;
    if (!this.refreshing)
      this.refreshing = (async () => {
        const next = await this.accountApi.refresh(this.connection);
        // Retain the rotated handle in this instance even if secure persistence
        // fails: never replay the old handle, and allow explicit revocation.
        this.connection = next;
        try {
          await this.save(next);
        } catch (e) {
          this.refreshFailed = true;
          throw e;
        }
        Object.assign(this.credentials, next.credentials);
      })()
        .catch((e) => {
          this.refreshFailed = true;
          throw e;
        })
        .finally(() => {
          this.refreshing = null;
        });
    await this.refreshing;
    if (this.signingOut) throw new ApiError(409, 'sign_out_in_progress');
  }
  override async request(path: string, body?: unknown) {
    await this.fresh();
    if (this.signingOut) throw new ApiError(409, 'sign_out_in_progress');
    return super.request(path, body);
  }
  async logout() {
    if (!this.logoutPending) {
      this.signingOut = true;
      this.logoutPending = (async () => {
        // A concurrent event/snapshot request may already be rotating credentials.
        // Revoke the resulting handle, then prevent this instance from resuming.
        await this.refreshing?.catch(() => {});
        await this.accountApi.logout(this.connection);
      })().catch((e) => {
        // A failed revocation remains retryable, but this instance cannot send
        // further work or refresh an uncertain credential in the meantime.
        this.logoutPending = null;
        throw e;
      });
    }
    await this.logoutPending;
  }
}

export { ApiError } from './managed-client.js';
