// Real Caddy/TLS transport fixture, not production hosting or real OIDC.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, writeFile, readFile, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';
import https from 'node:https';
import { setTimeout as delay } from 'node:timers/promises';
import { randomBytes } from 'node:crypto';
import assert from 'node:assert/strict';
import { ControlStore, secret } from '../dist/control/store.js';
import { AgentPool } from '../dist/control/pool.js';
import { controlServer } from '../dist/control/server.js';
const command = promisify(execFile),
  dir = await mkdtemp(join(tmpdir(), 'always-on-proxy-')),
  name = 'always-on-proxy-' + secret().slice(0, 10).toLowerCase();
const store = new ControlStore(':memory:', randomBytes(32).toString('base64'));
const pool = new AgentPool(
  store,
  [0, 1].map((n) => ({
    id: 'slot-' + n,
    origin: 'https://unused-' + n + '.invalid',
    provisioningKey: secret(),
  })),
  false,
  async () => {
    throw Error('No runtime allocation in proxy fixture');
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
const reservation = createServer();
await new Promise((r) => reservation.listen(0, '127.0.0.1', r));
const port = reservation.address().port;
await new Promise((r) => reservation.close(r));
const host = 'product-fixture.invalid:' + port;
const app = controlServer(store, pool, identity, {
  publicOrigin: 'https://' + host,
  mobileRedirect: 'deepseek-always-on://oauth/return',
  trustedProxies: ['127.0.0.1'],
});
await new Promise((r) => app.server.listen(0, '127.0.0.1', r));
try {
  const config = join(dir, 'Caddyfile');
  const template = await readFile('deploy/control/Caddyfile.example', 'utf8');
  const rendered = template
    .replace('{$ALWAYS_ON_PUBLIC_HOST}', 'https://' + host)
    .replace('https://' + host + ' {', 'https://' + host + ' {\n bind 127.0.0.1\n tls internal')
    .replaceAll('control:4080', '127.0.0.1:' + app.server.address().port);
  await writeFile(config, rendered);
  await command(
    'docker',
    [
      'run',
      '-d',
      '--name',
      name,
      '--network',
      'host',
      '-v',
      config + ':/etc/caddy/Caddyfile:ro',
      'caddy:2.11.9',
    ],
    { timeout: 120000 },
  );
  let ca;
  for (let n = 0; n < 100; n++) {
    try {
      await command('docker', [
        'cp',
        name + ':/data/caddy/pki/authorities/local/root.crt',
        join(dir, 'ca.pem'),
      ]);
      ca = await readFile(join(dir, 'ca.pem'));
      break;
    } catch {
      await delay(200);
    }
  }
  assert.ok(ca, 'Actual Caddy internal test CA was not created');
  function request(source, method = 'POST', path = '/account/v1/login/start') {
    const body = JSON.stringify({
      challenge: secret(),
      name: 'Proxy network fixture',
      platform: 'other',
    });
    return new Promise((resolve, reject) => {
      const req = https.request(
        {
          hostname: '127.0.0.1',
          port,
          servername: 'product-fixture.invalid',
          ca,
          localAddress: source,
          method,
          path,
          headers: {
            host,
            'x-always-on-client-ip': '203.0.113.' + Math.floor(Math.random() * 200 + 1),
            'x-forwarded-for': '198.51.100.99',
            'content-type': 'application/json',
          },
        },
        (res) => {
          res.resume();
          res.on('end', () => resolve(res.statusCode));
        },
      );
      req.setTimeout(5000, () => req.destroy(Error('Proxy fixture timeout')));
      req.on('error', reject);
      if (method === 'POST') req.write(body);
      req.end();
    });
  }
  for (let n = 0; n < 20; n++) assert.equal(await request('127.0.0.2'), 200);
  assert.equal(await request('127.0.0.2'), 429);
  assert.equal(await request('127.0.0.3'), 200);
  assert.equal(await request('127.0.0.3', 'GET', '/health'), 404);
  assert.equal(await request('127.0.0.3', 'GET', '/api/always-on'), 404);
  await mkdir('test-results', { recursive: true });
  await writeFile(
    'test-results/control-proxy.json',
    JSON.stringify(
      {
        sourceCommit: process.env.GITHUB_SHA ?? 'local-working-tree',
        actualCaddyVersion: '2.11.9',
        repositoryCaddyTemplateUsed: true,
        ownerAndPrivateHealthRoutesNotExposed: true,
        actualTlsWithVerifiedPrivateTestCA: true,
        actualDistinctTcpClientAddresses: true,
        edgeOverwritesAttackerHeaders: true,
        independentLoginLimits: true,
        realIdentityProvider: false,
        productionDeployment: false,
        mvpReady: false,
      },
      null,
      2,
    ),
  );
  console.log('Real Caddy TLS forwarding and distinct-client login limits passed; fixture only.');
} finally {
  await command('docker', ['rm', '-f', '-v', name]).catch(() => {});
  await app.close();
  store.close();
  await rm(dir, { recursive: true, force: true });
}
