import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { AccountManagedClient, type AccountConnection } from '../../src/shared/account-client.js';
const secret = () => randomBytes(32).toString('base64url');
function record(): AccountConnection {
  const deviceId = randomUUID();
  return {
    origin: 'https://account.test',
    account: { id: randomUUID() },
    credentials: {
      authorityId: randomUUID(),
      ownerId: randomUUID(),
      deviceId,
      token: `ao_${deviceId}.${secret()}`,
      expiresAt: new Date(Date.now() - 1000).toISOString(),
    },
    refreshToken: 'ar_' + secret(),
    refreshExpiresAt: new Date(Date.now() + 86400000).toISOString(),
  };
}
function rotated(previous: AccountConnection): AccountConnection {
  return {
    ...previous,
    refreshToken: 'ar_' + secret(),
    credentials: {
      ...previous.credentials,
      token: `ao_${previous.credentials.deviceId}.${secret()}`,
      expiresAt: new Date(Date.now() + 900000).toISOString(),
    },
  };
}
function deferred() {
  let resolve!: () => void;
  return {
    promise: new Promise<void>((r) => {
      resolve = r;
    }),
    resolve: () => resolve(),
  };
}
test('logout waits for rotation and secure save, revokes the latest handle and blocks concurrent reads (HTTP fixture)', async () => {
  const first = record(),
    next = rotated(first),
    entered = deferred(),
    release = deferred(),
    calls: string[] = [];
  let refreshes = 0,
    saved: AccountConnection | undefined;
  const transport: typeof fetch = async (input, init) => {
    const path = new URL(String(input)).pathname;
    if (path.endsWith('/refresh')) {
      refreshes++;
      entered.resolve();
      await release.promise;
      return Response.json(next);
    }
    if (path.endsWith('/logout')) {
      assert.equal(JSON.parse(String(init?.body)).refreshToken, next.refreshToken);
      calls.push('logout');
      return Response.json({ revoked: true });
    }
    calls.push('resource');
    return Response.json({ items: [] });
  };
  const c = new AccountManagedClient(
    first,
    async (value) => {
      saved = value;
      calls.push('save');
    },
    undefined,
    transport,
  );
  const read = assert.rejects(c.request('/devices'), /Sign-out is in progress/);
  await entered.promise;
  const logout = c.logout(),
    duplicate = c.logout();
  await assert.rejects(c.request('/devices'), /Sign-out is in progress/);
  release.resolve();
  await Promise.all([read, logout, duplicate]);
  assert.equal(refreshes, 1);
  assert.equal(saved?.refreshToken, next.refreshToken);
  assert.deepEqual(calls, ['save', 'logout']);
  await assert.rejects(c.request('/devices'), /Sign-out is in progress/);
});
test('secure-store failure never replays a rotated refresh handle; latest handle remains revocable (HTTP fixture)', async () => {
  const first = record(),
    next = rotated(first);
  let refreshes = 0,
    revoked = false;
  const transport: typeof fetch = async (input, init) => {
    if (String(input).endsWith('/refresh')) {
      refreshes++;
      return Response.json(next);
    }
    assert.ok(String(input).endsWith('/logout'));
    assert.equal(JSON.parse(String(init?.body)).refreshToken, next.refreshToken);
    revoked = true;
    return Response.json({ revoked: true });
  };
  const c = new AccountManagedClient(
    first,
    async () => {
      throw Error('Secure storage unavailable');
    },
    undefined,
    transport,
  );
  await assert.rejects(c.request('/devices'), /Secure storage unavailable/);
  await assert.rejects(c.request('/devices'), (e:any)=>e.status===401&&e.code==='sign_in_required');
  assert.equal(refreshes, 1);
  await c.logout();
  assert.equal(revoked, true);
});
test('ambiguous refresh is not replayed and failed logout stays retryable without reopening the client (HTTP fixture)', async () => {
  const first = record();
  let refreshes = 0,
    logouts = 0;
  const transport: typeof fetch = async (input) => {
    if (String(input).endsWith('/refresh')) {
      refreshes++;
      throw Error('Ambiguous refresh network loss');
    }
    logouts++;
    return logouts === 1
      ? Response.json({ error: 'unavailable' }, { status: 503 })
      : Response.json({ revoked: true });
  };
  const c = new AccountManagedClient(first, async () => {}, undefined, transport);
  await assert.rejects(c.request('/devices'), /Ambiguous refresh/);
  await assert.rejects(c.request('/devices'), (e:any)=>e.status===401&&e.code==='sign_in_required');
  await assert.rejects(c.logout(), /unavailable/);
  await assert.rejects(c.request('/devices'), /Sign-out is in progress/);
  await c.logout();
  assert.equal(refreshes, 1);
  assert.equal(logouts, 2);
});

test('a late Desktop event authentication error cannot clear a replacement account login (credential-store fixture)', async () => {
  const { AccountDesktop } = await import('../../src/desktop/account.js');
  const { ApiError } = await import('../../src/shared/managed-client.js');
  const first = record(),
    next = record(),
    entered = deferred(),
    release = deferred();
  let current: AccountConnection | null = first,
    unsets = 0;
  const ctx = {
    credentials: {
      resolve: async () => (current ? { value: JSON.stringify(current) } : null),
      unset: async () => {
        unsets++;
        current = null;
      },
    },
  };
  class Desktop extends AccountDesktop {
    protected override async client(): Promise<any> {
      return {
        credentials: first.credentials,
        events: async () => {
          entered.resolve();
          await release.promise;
          throw new ApiError(401, 'account_session_expired');
        },
      };
    }
  }
  const desktop = new Desktop(ctx as any, 'https://account.test');
  try {
    const rejected = assert.rejects(desktop.events({ after: 0 }), (e:any)=>e.status===401&&e.code==='account_session_expired');
    await entered.promise;
    current = next;
    release.resolve();
    await rejected;
    assert.equal(unsets, 0);
    assert.equal((await desktop.status()).deviceId, next.credentials.deviceId);
  } finally {
    await desktop.dispose();
  }
});

test('superseded mobile client rejects late success/401 and cannot issue new work or overwrite secure credentials (HTTP fixture)', async () => {
  for (const status of [200, 401]) {
    const original = rotated(record()),
      entered = deferred(),
      release = deferred();
    let current = true,
      requests = 0;
    const client = new AccountManagedClient(
      original,
      async () => {
        throw Error('Unexpected credential save');
      },
      undefined,
      async () => {
        requests++;
        entered.resolve();
        await release.promise;
        return Response.json(
          status === 200 ? { items: ['old-account'] } : { error: 'device_unauthorized' },
          { status },
        );
      },
      false,
      () => current,
    );
    const pending = assert.rejects(
      client.request('/devices'),
      (e: any) => e.code === 'client_replaced',
    );
    await entered.promise;
    current = false;
    release.resolve();
    await pending;
    await assert.rejects(client.request('/devices'), (e: any) => e.code === 'client_replaced');
    assert.equal(requests, 1);
  }
  const first = record(),
    next = rotated(first),
    entered = deferred(),
    release = deferred();
  let current = true,
    saves = 0,
    revoked = false;
  const client = new AccountManagedClient(
    first,
    async () => {
      saves++;
    },
    undefined,
    async (input, init) => {
      if (String(input).endsWith('/refresh')) {
        entered.resolve();
        await release.promise;
        return Response.json(next);
      }
      if (String(input).endsWith('/logout')) {
        assert.equal(JSON.parse(String(init?.body)).refreshToken, next.refreshToken);
        revoked = true;
        return Response.json({ revoked: true });
      }
      throw Error('Superseded refresh reached a resource');
    },
    false,
    () => current,
  );
  const pending = assert.rejects(
    client.request('/devices'),
    (e: any) => e.code === 'client_replaced',
  );
  await entered.promise;
  current = false;
  release.resolve();
  await pending;
  assert.equal(saves, 0);
  await client.logout();
  assert.equal(revoked, true);
});
