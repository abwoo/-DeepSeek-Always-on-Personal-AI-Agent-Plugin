import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { ControlStore, challenge, secret, digest } from '../../src/control/store.js';
import { AgentPool } from '../../src/control/pool.js';
import { controlServer } from '../../src/control/server.js';
import { GatewayStore } from '../../src/managed/store.js';
import { AccountApi } from '../../src/shared/account-client.js';
import { ManagedClient } from '../../src/shared/managed-client.js';
import type { IdentityProvider } from '../../src/control/identity.js';

test('account admission binds PKCE, isolates two identities, rotates credentials and revokes independently (labeled transport fixture)', async () => {
  const store = new ControlStore(':memory:', randomBytes(32).toString('base64'));
  const leaves = [new GatewayStore(':memory:'), new GatewayStore(':memory:')];
  const slots = leaves.map((_, i) => ({
    id: 'slot-' + i,
    origin: `https://leaf-${i}.test`,
    provisioningKey: secret(),
  }));
  const registrationIds: string[] = [];
  let unavailable = true;
  const fakeLeaf: typeof fetch = async (input, init) => {
    const u = new URL(String(input)),
      index = Number(u.hostname.match(/leaf-(\d+)/)![1]),
      s = leaves[index]!;
    const b = init?.body ? JSON.parse(String(init.body)) : {};
    if (u.pathname.endsWith('/operator/bind'))
      return Response.json({ authorityId: s.authorityId, ownerId: s.ownerId });
    if (u.pathname.endsWith('/operator/device')) {
      registrationIds.push(b.id);
      if (unavailable) {
        unavailable = false;
        return Response.json({}, { status: 503 });
      }
      return Response.json(s.installAccountDevice(b));
    }
    if (u.pathname.endsWith('/operator/revoke')) {
      s.revoke(b.deviceId);
      return Response.json({ revoked: true });
    }
    const token = String((init!.headers as any).authorization).slice(7);
    s.authenticate(token);
    if (u.pathname.endsWith('/devices')) return Response.json({ items: s.devices() });
    return Response.json({ authorityId: s.authorityId, leaf: index });
  };
  let providerRevocations = 0,
    refreshCount = 0;
  const provider: IdentityProvider = {
    issuer: 'https://identity.test/',
    authorize: async (x) => 'https://identity.test/authorize?state=' + x.state,
    exchange: async (x) => ({
      issuer: 'https://identity.test/',
      subject: x.callback.searchParams.get('code')!,
      refreshToken: 'server-private-refresh',
    }),
    refresh: async (_, subject) => {
      refreshCount++;
      return {
        issuer: 'https://identity.test/',
        subject,
        refreshToken: 'rotated-server-private-refresh',
      };
    },
    revoke: async () => {
      providerRevocations++;
    },
  };
  const pool = new AgentPool(store, slots, false, fakeLeaf);
  const app = controlServer(store, pool, provider, {
    publicOrigin: 'https://product.test',
    mobileRedirect: 'deepseek-always-on://oauth/return',
    allowLoopback: true,
  });
  await new Promise<void>((r) => app.server.listen(0, '127.0.0.1', r));
  const address = app.server.address() as any,
    base = `http://127.0.0.1:${address.port}`;
  const transport: typeof fetch = (input, init) =>
    fetch(String(input).replace('https://product.test', base), init).then(
      async (r) => new Response(await r.text(), { status: r.status, headers: r.headers }),
    );
  const api = new AccountApi('https://product.test', transport);
  async function login(subject: string) {
    const verifier = secret(),
      start = await api.start({
        challenge: challenge(verifier),
        name: 'Test device',
        platform: 'other',
      });
    await assert.rejects(() => api.complete(start.loginId, secret()), /login_expired/);
    assert.equal((await api.complete(start.loginId, verifier)).state, 'pending');
    const state = new URL(start.authorizeUrl).searchParams.get('state');
    const callback = await fetch(base + '/account/v1/callback?state=' + state + '&code=' + subject);
    assert.equal(callback.status, 200);
    let completed = await api.complete(start.loginId, verifier);
    if (subject === 'alice' && registrationIds.length === 1) {
      assert.equal(completed.state, 'provisioning');
      completed = await api.complete(start.loginId, verifier);
      assert.equal(registrationIds[0], registrationIds[1]);
      assert.equal(leaves[0]!.devices().length, 1);
    }
    assert.equal(completed.state, 'ready');
    if (completed.state !== 'ready') throw Error('Expected ready');
    assert.deepEqual(await api.complete(start.loginId, verifier), completed);
    return completed.connection;
  }
  try {
    const a = await login('alice'),
      a2 = await login('alice'),
      b = await login('bob');
    assert.equal(a.credentials.authorityId, a2.credentials.authorityId);
    assert.equal(a.account.id, a2.account.id);
    assert.notEqual(a.credentials.deviceId, a2.credentials.deviceId);
    assert.notEqual(a.credentials.authorityId, b.credentials.authorityId);
    assert.notEqual(a.credentials.ownerId, b.credentials.ownerId);
    const ca = new ManagedClient(a.origin, a.credentials, undefined, false, transport);
    const cb = new ManagedClient(b.origin, b.credentials, undefined, false, transport);
    assert.deepEqual(
      (await ca.request('/devices')).items.map((d: any) => d.id).sort(),
      [a.credentials.deviceId, a2.credentials.deviceId].sort(),
    );
    assert.deepEqual(
      (await cb.request('/devices')).items.map((d: any) => d.id),
      [b.credentials.deviceId],
    );
    await assert.rejects(
      () => ca.request('/devices/revoke', { deviceId: b.credentials.deviceId }),
      /device_not_found/,
    );
    const owner = await transport('https://product.test/api/always-on');
    assert.equal(owner.status, 404);
    const operator = await transport('https://product.test/personal-agent/v1/operator/inspect');
    assert.equal(operator.status, 404);
    await assert.rejects(() => ca.request('/devices/pair-code', {}), /route_not_found/);
    const next = await api.refresh(a);
    assert.equal(refreshCount, 1);
    assert.equal(next.credentials.authorityId, a.credentials.authorityId);
    assert.notEqual(next.refreshToken, a.refreshToken);
    await assert.rejects(() => ca.request('/devices'), /account_session_expired/);
    await assert.rejects(() => api.refresh(a), /sign_in_required/);
    await api.logout(a2);
    assert.equal(providerRevocations, 1);
    const ca2 = new ManagedClient(a2.origin, a2.credentials, undefined, false, transport);
    await assert.rejects(() => ca2.request('/devices'), /account_session_expired/);
    assert.ok((await cb.request('/devices')).items.length);
    const raw = JSON.stringify(store.db.prepare('SELECT * FROM devices').all());
    assert.ok(!raw.includes('server-private-refresh'));
    assert.ok(!raw.includes(next.refreshToken));
    assert.ok(!raw.includes(next.credentials.token));
    store.db.prepare('UPDATE accounts SET disabled=1 WHERE id=?').run(b.account.id);
    await assert.rejects(() => cb.request('/devices'), /account_disabled/);
  } finally {
    await app.close();
    store.close();
    for (const s of leaves) s.close();
  }
});

test('allocation collisions, encrypted record tampering, future schema and transaction failures fail closed', () => {
  const s = new ControlStore(':memory:', randomBytes(32).toString('base64'));
  try {
    const a = s.account('issuer-a', 'same-subject'),
      b = s.account('issuer-b', 'same-subject');
    assert.notEqual(a, b);
    assert.equal(s.reserve(a, ['one', 'two']).slot_id, 'one');
    assert.equal(s.reserve(a, ['one', 'two']).slot_id, 'one');
    assert.equal(s.reserve(b, ['one', 'two']).slot_id, 'two');
    const authority = randomUUID(),
      owner = randomUUID();
    s.allocationReady(a, authority, owner);
    assert.throws(() => s.allocationReady(b, authority, owner), /authority_already_allocated/);
    const sealed = s.seal({ secret: 'private' }, 'device');
    assert.throws(() => s.open(sealed, 'login'));
    assert.throws(() => s.open(sealed.slice(0, -5) + 'AAAAA', 'device'));
    assert.throws(() =>
      s.transaction(() => {
        s.account('issuer-c', 'rollback');
        throw Error('rollback');
      }),
    );
    assert.equal(
      s.db.prepare("SELECT count(*) AS n FROM accounts WHERE issuer='issuer-c'").get()!.n,
      0,
    );
  } finally {
    s.close();
  }
});
