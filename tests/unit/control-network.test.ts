import { test } from 'node:test';
import assert from 'node:assert/strict';
import { requestNetwork, normalizeAddress } from '../../src/control/network.js';
const request = (peer: string, headers: Record<string, any> = {}, tls = false) =>
  ({ socket: { remoteAddress: peer, ...(tls ? { encrypted: true } : {}) }, headers }) as any;
test('trusted edge client identity requires exact peer, host and protocol; arbitrary forwarding headers cannot spoof it', () => {
  const trusted = new Set(['192.0.2.1']);
  const headers = {
    host: 'agent.test',
    'x-forwarded-proto': 'https',
    'x-always-on-client-ip': '203.0.113.4',
    'x-forwarded-for': '10.0.0.1',
  };
  assert.equal(
    requestNetwork(request('192.0.2.1', headers), 'https://agent.test', trusted).client,
    '203.0.113.4',
  );
  assert.equal(
    requestNetwork(request('198.51.100.8', headers, true), 'https://agent.test', trusted).client,
    '198.51.100.8',
  );
  assert.throws(() =>
    requestNetwork(request('198.51.100.8', headers), 'https://agent.test', trusted),
  );
  assert.throws(() =>
    requestNetwork(
      request('192.0.2.1', { ...headers, host: 'foreign.test' }),
      'https://agent.test',
      trusted,
    ),
  );
  for (const ip of [
    '1.2.3.4, 5.6.7.8',
    '1.2.3.4:443',
    '[::1]',
    '::1%lo',
    undefined,
    ['1.2.3.4', '5.6.7.8'],
  ])
    assert.throws(() =>
      requestNetwork(
        request('192.0.2.1', { ...headers, 'x-always-on-client-ip': ip }),
        'https://agent.test',
        trusted,
      ),
    );
});
test('equivalent IPv6 and mapped IPv4 representations share a limiter identity', () => {
  assert.equal(normalizeAddress('::ffff:192.0.2.4'), '192.0.2.4');
  assert.equal(normalizeAddress('0:0:0:0:0:ffff:c000:204'), '192.0.2.4');
  assert.equal(normalizeAddress('2001:0db8:0:0:0:0:0:1'), '2001:db8::1');
});
