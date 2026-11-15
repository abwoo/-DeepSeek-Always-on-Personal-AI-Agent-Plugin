import { boundedText } from './http.js';
import { requestNetwork, normalizeAddress } from './network.js';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  ControlStore,
  secret,
  digest,
  challenge,
  type Login,
  type AccountDevice,
} from './store.js';
import { AgentPool } from './pool.js';
import type { IdentityProvider, IdentityTokens } from './identity.js';
import { GatewayError } from '../managed/store.js';
import { managedOrigin } from '../shared/managed-client.js';
import {
  loginStartSchema,
  loginCompleteSchema,
  type AccountConnection,
} from '../shared/account-client.js';

export interface ControlConfig {
  publicOrigin: string;
  mobileRedirect: string;
  allowLoopback?: boolean;
  trustedProxies?: string[];
}
const allowed =
  /^\/(snapshot|export|exports(?:\?cursor=[A-Za-z0-9_.%+-]{1,160}|\/release)?|events(?:\?[^#]{1,1024})?|runs\/[0-9a-f-]+|inbox\/[0-9a-f-]+|sessions|session\/read|changes(?:\?after=\d+)?|mutate|operations\/[0-9a-f-]+|goals|devices(?:\/revoke)?|push\/(register|disable|ack|status))$/;
export function controlServer(
  store: ControlStore,
  pool: AgentPool,
  identity: IdentityProvider,
  config: ControlConfig,
) {
  const origin = managedOrigin(config.publicOrigin, config.allowLoopback),
    callback = origin + '/account/v1/callback';
  if (config.mobileRedirect !== 'deepseek-always-on://oauth/return')
    throw Error('Unapproved native redirect');
  const trustedProxies = new Set((config.trustedProxies ?? []).map(normalizeAddress));
  const rates = new Map<string, { count: number; until: number }>();
  let queued = 0,
    serial: Promise<unknown> = Promise.resolve();
  const queue = <T>(fn: () => Promise<T>) => {
    if (queued >= 32) throw new GatewayError(429, 'account_busy');
    queued++;
    const next = serial.then(fn, fn).finally(() => {
      queued--;
    });
    serial = next.catch(() => {});
    return next;
  };
  function limit(key: string, max: number) {
    const now = Date.now();
    for (const [k, v] of rates) if (v.until < now) rates.delete(k);
    if (rates.size >= 4096 && !rates.has(key)) throw new GatewayError(429, 'rate_limit');
    const r = rates.get(key) ?? { count: 0, until: now + 60000 };
    if (++r.count > max) throw new GatewayError(429, 'rate_limit');
    rates.set(key, r);
  }
  const json = (data: unknown, status = 200) =>
    Response.json(data, {
      status,
      headers: {
        'cache-control': 'no-store',
        'x-content-type-options': 'nosniff',
        'referrer-policy': 'no-referrer',
      },
    });
  async function body(req: IncomingMessage) {
    if (!String(req.headers['content-type'] ?? '').startsWith('application/json'))
      throw new GatewayError(415, 'json_required');
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const c of req) {
      size += Buffer.byteLength(c);
      if (size > 65536) throw new GatewayError(413, 'payload_too_large');
      chunks.push(Buffer.from(c));
    }
    try {
      return JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch {
      throw new GatewayError(400, 'invalid_json');
    }
  }
  function loginFor(id: string, verifier: string) {
    const row = store.db
      .prepare('SELECT * FROM logins WHERE id=? AND client_challenge=? AND expires_at>?')
      .get(id, challenge(verifier), Date.now()) as Login | undefined;
    if (!row) throw new GatewayError(401, 'login_expired');
    return row;
  }
  async function complete(data: unknown) {
    const { loginId, verifier } = loginCompleteSchema.parse(data),
      row = loginFor(loginId, verifier);
    limit('login-session:' + row.id, 90);
    if (row.status === 'pending' || row.status === 'exchanging') return json({ state: 'pending' });
    if (!row.account_id || !['authorized', 'ready'].includes(row.status))
      throw new GatewayError(409, 'login_outcome_unknown');
    store.requireAccount(row.account_id);
    if (row.status === 'ready') {
      const connection = store.open<AccountConnection>(row.result!, 'login-result');
      store.authenticate(connection.credentials.token);
      return json({ state: 'ready', connection });
    }
    const oauth = store.open<{ identity: IdentityTokens }>(row.secret, 'login');
    let plan: { connection: AccountConnection; upstreamToken: string };
    if (row.result) plan = store.open(row.result, 'login-plan');
    else {
      let allocation;
      try {
        allocation = await pool.allocate(row.account_id);
      } catch (e) {
        if (e instanceof GatewayError && e.status === 503) return json({ state: 'provisioning' });
        throw e;
      }
      const now = Date.now(),
        token = `ao_${row.id}.${secret()}`;
      plan = {
        connection: {
          origin,
          account: { id: row.account_id },
          credentials: {
            authorityId: allocation.authorityId,
            ownerId: allocation.ownerId,
            deviceId: row.id,
            token,
            expiresAt: new Date(now + 15 * 60000).toISOString(),
          },
          refreshToken: 'ar_' + secret(),
          refreshExpiresAt: new Date(now + 30 * 86400000).toISOString(),
        },
        upstreamToken: `ao_${row.id}.${secret()}`,
      };
      store.db
        .prepare('UPDATE logins SET result=? WHERE id=?')
        .run(store.seal(plan, 'login-plan'), row.id);
    }
    store.db.prepare("UPDATE logins SET status='claiming' WHERE id=?").run(row.id);
    try {
      const result = await pool.register(row.account_id, {
        id: row.id,
        token: plan.upstreamToken,
        name: row.name,
        platform: row.platform,
      });
      const c = plan.connection;
      if (
        c.credentials.authorityId !== result.credentials.authorityId ||
        c.credentials.ownerId !== result.credentials.ownerId
      )
        throw new GatewayError(409, 'authority_identity_changed');
      store.transaction(() => {
        store.db
          .prepare(
            "INSERT INTO devices(id,account_id,slot_id,token_hash,refresh_hash,secret,expires_at,refresh_expires_at,status) VALUES(?,?,?,?,?,?,?,?,'ready')",
          )
          .run(
            row.id,
            row.account_id,
            result.slotId,
            digest(c.credentials.token),
            digest(c.refreshToken),
            store.seal({ upstreamToken: plan.upstreamToken, identity: oauth.identity }, 'device'),
            Date.parse(c.credentials.expiresAt),
            Date.parse(c.refreshExpiresAt),
          );
        store.db
          .prepare("UPDATE logins SET status='ready',result=?,secret=? WHERE id=?")
          .run(store.seal(c, 'login-result'), store.seal({}, 'login'), row.id);
        store.audit(row.account_id, 'login_device_authorized');
      });
      return json({ state: 'ready', connection: c });
    } catch (e) {
      store.db
        .prepare("UPDATE logins SET status='authorized' WHERE id=? AND status='claiming'")
        .run(row.id);
      // The proof-bound plan is durable. Temporary leaf unavailability is a
      // provisioning state, not a reason to repeat OAuth or create another device.
      if (e instanceof GatewayError && e.status === 503) return json({ state: 'provisioning' });
      throw e;
    }
  }
  async function refresh(data: unknown) {
    const input = z
      .object({ deviceId: z.uuid(), refreshToken: z.string().regex(/^ar_[A-Za-z0-9_-]{43}$/) })
      .strict()
      .parse(data);
    const d = store.db
      .prepare(
        "SELECT * FROM devices WHERE id=? AND refresh_hash=? AND revoked=0 AND status='ready' AND refresh_expires_at>?",
      )
      .get(input.deviceId, digest(input.refreshToken), Date.now()) as AccountDevice | undefined;
    if (!d) throw new GatewayError(401, 'sign_in_required');
    limit('refresh:' + d.id, 30);
    limit('account-refresh:' + d.account_id, 120);
    store.requireAccount(d.account_id);
    const allocation = store.allocation(d.account_id);
    if (allocation?.status !== 'ready') throw new GatewayError(503, 'agent_unavailable');
    const saved = store.open<{ upstreamToken: string; identity: IdentityTokens }>(
      d.secret,
      'device',
    );
    if (!saved.identity.refreshToken) throw new GatewayError(401, 'sign_in_required');
    // Persist before rotating at the provider. A crash/ambiguous response requires login, never refresh-token replay.
    store.db.prepare("UPDATE devices SET status='refreshing' WHERE id=?").run(d.id);
    try {
      const next = await identity.refresh(saved.identity.refreshToken, saved.identity.subject);
      if (next.issuer !== identity.issuer || next.subject !== saved.identity.subject)
        throw new GatewayError(401, 'identity_subject_changed');
      const token = `ao_${d.id}.${secret()}`,
        refreshToken = 'ar_' + secret(),
        expires = Date.now() + 15 * 60000;
      const connection: AccountConnection = {
        origin,
        account: { id: d.account_id },
        credentials: {
          authorityId: String(allocation.authority_id),
          ownerId: String(allocation.owner_id),
          deviceId: d.id,
          token,
          expiresAt: new Date(expires).toISOString(),
        },
        refreshToken,
        refreshExpiresAt: new Date(d.refresh_expires_at).toISOString(),
      };
      store.db
        .prepare(
          "UPDATE devices SET token_hash=?,refresh_hash=?,secret=?,expires_at=?,status='ready' WHERE id=? AND revoked=0",
        )
        .run(
          digest(token),
          digest(refreshToken),
          store.seal({ upstreamToken: saved.upstreamToken, identity: next }, 'device'),
          expires,
          d.id,
        );
      store.audit(d.account_id, 'session_refreshed');
      return json(connection);
    } catch {
      store.db.prepare("UPDATE devices SET status='reauth' WHERE id=?").run(d.id);
      store.audit(d.account_id, 'refresh_requires_login');
      throw new GatewayError(401, 'sign_in_required');
    }
  }
  async function revoke(d: AccountDevice) {
    store.revoke(d.account_id, d.id);
    const saved = store.open(d.secret, 'device');
    const upstream = await pool.operator(pool.slot(d.slot_id), 'revoke', { deviceId: d.id }).then(
      () => true,
      () => false,
    );
    // External revocation is immediate even when the isolated authority/provider is temporarily unavailable.
    const provider = await (
      saved.identity.refreshToken ? identity.revoke(saved.identity.refreshToken) : Promise.resolve()
    ).then(
      () => true,
      () => false,
    );
    store.db
      .prepare(
        'UPDATE revocations SET upstream_pending=?,provider_pending=?,attempts=attempts+1,next_at=? WHERE device_id=?',
      )
      .run(upstream ? 0 : 1, provider ? 0 : 1, Date.now() + 15000, d.id);
    if (!upstream || !provider) store.audit(d.account_id, 'revocation_cleanup_pending');
    return { revoked: true, upstreamRevoked: upstream, providerRevoked: provider };
  }
  async function route(req: IncomingMessage): Promise<Response> {
    const network = requestNetwork(req, origin, trustedProxies, config.allowLoopback);
    const url = new URL(req.url ?? '/', origin);
    limit('peer:' + network.peer, 50000);
    limit('ip:' + network.client, 10000);
    if (req.method === 'GET' && url.pathname === '/health')
      return json({ ready: true, runtime: 'deepseek-harness-control', mvpReady: false });
    if (req.method === 'POST' && url.pathname === '/account/v1/login/start') {
      limit('login:' + network.client, 20);
      const input = loginStartSchema.parse(await body(req));
      store.db.prepare('DELETE FROM logins WHERE expires_at<?').run(Date.now());
      if (Number(store.db.prepare('SELECT count(*) AS n FROM logins').get()!.n) >= 4096)
        throw new GatewayError(429, 'login_capacity');
      const id = randomUUID(),
        state = secret(),
        verifier = secret(),
        nonce = secret();
      store.db
        .prepare(
          "INSERT INTO logins(id,state_hash,client_challenge,secret,platform,name,mobile,expires_at,status) VALUES(?,?,?,?,?,?,?,?,'pending')",
        )
        .run(
          id,
          digest(state),
          input.challenge,
          store.seal({ state, verifier, nonce }, 'login'),
          input.platform,
          input.name,
          input.mobile ? 1 : 0,
          Date.now() + 5 * 60000,
        );
      const authorizeUrl = await identity.authorize({
        state,
        nonce,
        verifier,
        redirectUri: callback,
      });
      if (new URL(authorizeUrl).origin !== new URL(identity.issuer).origin)
        throw new GatewayError(503, 'identity_endpoint_mismatch');
      return json({
        loginId: id,
        authorizeUrl,
        expiresAt: new Date(Date.now() + 5 * 60000).toISOString(),
      });
    }
    if (req.method === 'GET' && url.pathname === '/account/v1/callback') {
      const state = url.searchParams.get('state') ?? '';
      const login = store.db
        .prepare("SELECT * FROM logins WHERE state_hash=? AND status='pending' AND expires_at>?")
        .get(digest(state), Date.now()) as Login | undefined;
      if (!login) throw new GatewayError(401, 'login_expired');
      store.db.prepare("UPDATE logins SET status='exchanging' WHERE id=?").run(login.id);
      try {
        const secrets = store.open(login.secret, 'login');
        const verified = await identity.exchange({
          callback: url,
          state: secrets.state,
          nonce: secrets.nonce,
          verifier: secrets.verifier,
          redirectUri: callback,
        });
        if (verified.issuer !== identity.issuer)
          throw new GatewayError(401, 'identity_issuer_changed');
        const accountId = store.account(verified.issuer, verified.subject);
        limit('account-login:' + accountId, 20);
        store.db
          .prepare("UPDATE logins SET status='authorized',account_id=?,secret=? WHERE id=?")
          .run(accountId, store.seal({ identity: verified }, 'login'), login.id);
        store.audit(accountId, 'oidc_login_verified');
        if (login.mobile)
          return new Response(null, {
            status: 303,
            headers: {
              location: config.mobileRedirect + '?loginId=' + login.id,
              'cache-control': 'no-store',
              'referrer-policy': 'no-referrer',
            },
          });
        return new Response(
          '<!doctype html><meta charset="utf-8"><title>DeepSeek Always-on</title><h1>Signed in</h1><p>Return to DeepSeek Always-on. You can close this window.</p>',
          {
            headers: {
              'content-type': 'text/html; charset=utf-8',
              'cache-control': 'no-store',
              'content-security-policy': "default-src 'none'; frame-ancestors 'none'",
              'referrer-policy': 'no-referrer',
            },
          },
        );
      } catch {
        store.db.prepare("UPDATE logins SET status='failed' WHERE id=?").run(login.id);
        store.audit(null, 'oidc_login_failed');
        throw new GatewayError(401, 'login_failed');
      }
    }
    if (req.method === 'POST' && url.pathname === '/account/v1/login/complete') {
      const data = await body(req);
      return queue(() => complete(data));
    }
    if (req.method === 'POST' && url.pathname === '/account/v1/refresh') {
      const data = await body(req);
      return queue(() => refresh(data));
    }
    if (req.method === 'POST' && url.pathname === '/account/v1/logout') {
      const b = z
        .object({ deviceId: z.uuid(), refreshToken: z.string().max(100) })
        .strict()
        .parse(await body(req));
      const d = store.db
        .prepare('SELECT * FROM devices WHERE id=? AND refresh_hash=?')
        .get(b.deviceId, digest(b.refreshToken)) as AccountDevice | undefined;
      if (!d) throw new GatewayError(401, 'sign_in_required');
      return queue(async () => json(await revoke(d)));
    }
    const prefix = '/personal-agent/v1';
    if (!url.pathname.startsWith(prefix + '/')) throw new GatewayError(404, 'route_not_found');
    const path = url.pathname.slice(prefix.length) + url.search;
    if (!allowed.test(path) || !['GET', 'POST'].includes(req.method ?? ''))
      throw new GatewayError(404, 'route_not_found');
    const authorization = String(req.headers.authorization ?? '');
    if (!authorization.startsWith('Bearer ')) throw new GatewayError(401, 'sign_in_required');
    const d = store.authenticate(authorization.slice(7));
    limit('device:' + d.id, 900);
    limit('account:' + d.account_id, 3600);
    if (req.method === 'POST' && path === '/devices/revoke') {
      const input = z
        .object({ deviceId: z.uuid() })
        .strict()
        .parse(await body(req));
      const target = store.db
        .prepare('SELECT * FROM devices WHERE account_id=? AND id=?')
        .get(d.account_id, input.deviceId) as AccountDevice | undefined;
      if (!target) throw new GatewayError(404, 'device_not_found');
      return queue(async () => json(await revoke(target)));
    }
    const payload = req.method === 'POST' ? JSON.stringify(await body(req)) : undefined;
    const upstream = store.open<{ upstreamToken: string }>(d.secret, 'device');
    const response = await pool.forward(
      d.slot_id,
      upstream.upstreamToken,
      path,
      req.method!,
      payload,
    );
    // Bounded leaf API; neither arbitrary target paths nor upstream authentication headers escape.
    const text = await boundedText(response);
    return new Response(text, {
      status: response.status,
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    });
  }
  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const timer = setTimeout(() => {
      if (!res.writableEnded) {
        res.writeHead(408, { connection: 'close' });
        res.end();
        req.destroy();
      }
    }, 25000);
    timer.unref();
    try {
      const response = await route(req);
      if (!res.destroyed && !res.writableEnded) {
        res.writeHead(response.status, Object.fromEntries(response.headers));
        res.end(Buffer.from(await response.arrayBuffer()));
      }
    } catch (e) {
      if (!res.destroyed && !res.writableEnded) {
        const response = json(
          {
            error:
              e instanceof GatewayError
                ? e.code
                : e instanceof z.ZodError
                  ? 'invalid_request'
                  : 'service_unavailable',
            mvpReady: false,
          },
          e instanceof GatewayError ? e.status : e instanceof z.ZodError ? 400 : 503,
        );
        res.writeHead(response.status, Object.fromEntries(response.headers));
        res.end(Buffer.from(await response.arrayBuffer()));
      }
    } finally {
      clearTimeout(timer);
    }
  });
  server.requestTimeout = 25000;
  server.headersTimeout = 10000;
  server.maxHeadersCount = 50;
  let stopping = false,
    cleanup: Promise<unknown> = Promise.resolve();
  const cleanupTimer = setInterval(() => {
    if (stopping || queued) return;
    cleanup = queue(async () => {
      const pending = store.db
        .prepare(
          'SELECT devices.* FROM devices JOIN revocations ON devices.id=revocations.device_id WHERE (upstream_pending=1 OR provider_pending=1) AND next_at<=? ORDER BY next_at LIMIT 4',
        )
        .all(Date.now()) as unknown as AccountDevice[];
      for (const d of pending) await revoke(d);
    }).catch(() => {});
  }, 15000);
  cleanupTimer.unref();
  let executionSync: Promise<unknown> | undefined;
  const syncExecution = () => {
    if (stopping || executionSync) return;
    executionSync = pool
      .reconcileExecution()
      .catch(() => false)
      .finally(() => {
        executionSync = undefined;
      });
  };
  syncExecution();
  const executionTimer = setInterval(syncExecution, 10000);
  executionTimer.unref();
  return {
    server,
    close: async () => {
      stopping = true;
      clearInterval(cleanupTimer);
      clearInterval(executionTimer);
      await executionSync;
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await serial;
      await cleanup;
    },
  };
}
