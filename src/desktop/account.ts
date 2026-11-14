import type { Context } from '@deepseek-ai/cordis';
import { credentialRef } from '@deepseek-ai/dsh-credentials';
import { randomBytes, createHash } from 'node:crypto';
import { PairedDesktop } from './device.js';
import {
  AccountApi,
  AccountManagedClient,
  accountConnectionSchema,
  type AccountConnection,
} from '../shared/account-client.js';
import { ApiError } from '../shared/managed-client.js';
const ref = credentialRef('ALWAYS_ON_ACCOUNT_V3');
export class AccountDesktop extends PairedDesktop {
  private pendingLogin?: { id: string; verifier: string; expiresAt: string };
  private accountCtx: Context;
  private cached?: AccountManagedClient;
  constructor(
    ctx: Context,
    private serviceOrigin: string | null,
  ) {
    super(ctx);
    this.accountCtx = ctx;
  }
  protected override async record() {
    const value = await this.accountCtx.credentials.resolve(ref);
    return value ? accountConnectionSchema.parse(JSON.parse(value.value)) : null;
  }
  private async save(next: AccountConnection) {
    await this.accountCtx.credentials.set(ref, JSON.stringify(next));
  }
  protected override async client() {
    const c = await this.record();
    if (!c) throw Error('Sign in to continue');
    if (
      !this.cached ||
      this.cached.credentials.deviceId !== c.credentials.deviceId ||
      this.cached.credentials.token !== c.credentials.token
    )
      this.cached = new AccountManagedClient(c, (next) => this.save(next), this.operations(c));
    return this.cached;
  }
  protected override async failure(e: unknown) {
    await super.failure(e);
    if (e instanceof ApiError && e.status === 401) await this.accountCtx.credentials.unset(ref);
  }
  override async status() {
    const record = await this.record(),
      base = await super.status();
    return {
      ...base,
      credentialMode: 'account',
      devicePairingReady: false,
      serviceReady: !!this.serviceOrigin,
      accountId: record?.account.id,
      loginPending: !!this.pendingLogin,
      loginExpiresAt: this.pendingLogin?.expiresAt,
    };
  }
  async startLogin() {
    return this.queue(async () => {
      if (!this.serviceOrigin)
        throw Error('Sign-in service is not available in this development build.');
      if (await this.record()) throw Error('Sign out before switching accounts');
      const verifier = randomBytes(32).toString('base64url'),
        api = new AccountApi(this.serviceOrigin);
      const login = await api.start({
        challenge: createHash('sha256').update(verifier).digest('base64url'),
        name: process.platform === 'darwin' ? 'My Mac' : 'My Desktop',
        platform:
          process.platform === 'darwin'
            ? 'macos'
            : process.platform === 'win32'
              ? 'windows'
              : 'other',
      });
      this.pendingLogin = { id: login.loginId, verifier, expiresAt: login.expiresAt };
      return { authorizeUrl: login.authorizeUrl, expiresAt: login.expiresAt };
    });
  }
  async finishLogin() {
    return this.queue(async () => {
      if (!this.serviceOrigin || !this.pendingLogin) throw Error('Start sign in again');
      const p = this.pendingLogin;
      if (Date.parse(p.expiresAt) <= Date.now()) {
        this.pendingLogin = undefined;
        throw Error('Sign in expired; try again');
      }
      const result = await new AccountApi(this.serviceOrigin).complete(p.id, p.verifier);
      if (result.state === 'ready') {
        await this.save(result.connection);
        this.pendingLogin = undefined;
        return { state: 'ready', connection: await this.status() };
      }
      return result;
    });
  }
  override async forget() {
    return this.queue(async () => {
      const c = await this.record();
      if (c) {
        try {
          await new AccountApi(c.origin).logout(c);
        } catch (e) {
          if (!(e instanceof ApiError && e.status === 401)) throw e;
        }
      }
      await this.accountCtx.credentials.unset(ref);
      this.pendingLogin = undefined;
      return this.status();
    });
  }
  override async pair(_input: unknown): Promise<never> {
    throw Error('Account login is the default; manual pairing is a separate operator diagnostic.');
  }
}
