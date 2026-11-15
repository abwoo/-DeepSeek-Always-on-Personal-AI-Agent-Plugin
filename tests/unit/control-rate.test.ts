import http from 'node:http';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { ControlStore, secret } from '../../src/control/store.js';
import { AgentPool } from '../../src/control/pool.js';
import { controlServer } from '../../src/control/server.js';
async function fixture(trusted: boolean) {
  const store = new ControlStore(':memory:', randomBytes(32).toString('base64'));
  const pool = new AgentPool(
    store,
    [0, 1].map((n) => ({
      id: 'slot-' + n,
      origin: 'https://leaf-' + n + '.invalid',
      provisioningKey: secret(),
    })),
    false,
    async () => {
      throw Error('No leaf should be contacted');
    },
  );
  const identity = {
    issuer: 'https://identity.invalid/',
    authorize: async () => 'https://identity.invalid/authorize',
    exchange: async () => {
      throw Error('Not used');
    },
    refresh: async () => {
      throw Error('Not used');
    },
    revoke: async () => {},
  };
  const app = controlServer(store, pool, identity, {
    publicOrigin: 'https://service.test',
    mobileRedirect: 'deepseek-always-on://oauth/return',
    trustedProxies: trusted ? ['127.0.0.1'] : [],
    allowLoopback: true,
  });
  await new Promise<void>((r) => app.server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + (app.server.address() as any).port;
  const start = (ip: string): Promise<{ status: number }> =>
    new Promise((resolve, reject) => {
      const req = http.request(
        base + '/account/v1/login/start',
        {
          method: 'POST',
          headers: {
            host: 'service.test',
            'x-forwarded-proto': 'https',
            'x-always-on-client-ip': ip,
            'x-forwarded-for': secret(),
            'content-type': 'application/json',
          },
        },
        (res) => {
          res.resume();
          res.on('end', () => resolve({ status: res.statusCode! }));
        },
      );
      req.on('error', reject);
      req.end(JSON.stringify({ challenge: secret(), name: 'Rate test', platform: 'other' }));
    });
  return {
    start,
    close: async () => {
      await app.close();
      store.close();
    },
  };
}
test('clients sharing one trusted proxy have independent login limits (real HTTP with explicit edge-header fixture)', async () => {
  const f = await fixture(true);
  try {
    for (let n = 0; n < 20; n++) assert.equal((await f.start('203.0.113.1')).status, 200);
    assert.equal((await f.start('203.0.113.1')).status, 429);
    assert.equal((await f.start('203.0.113.2')).status, 200);
    assert.equal((await f.start('203.0.113.2, 198.51.100.4')).status, 400);
  } finally {
    await f.close();
  }
});
test('untrusted forwarded headers cannot rotate a direct client out of its login limit (real loopback HTTP)', async () => {
  const f = await fixture(false);
  try {
    for (let n = 0; n < 20; n++) assert.equal((await f.start('203.0.113.' + (n + 1))).status, 200);
    assert.equal((await f.start('198.51.100.1')).status, 429);
  } finally {
    await f.close();
  }
});
