import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GatewayStore } from '../../src/managed/store.js';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
test('pair codes are single-use and device access expires/revokes without exposing tokens', () => {
  const store = new GatewayStore(':memory:');
  const code = store.pairCode(1000);
  const c = store.claim(code.code, 'Phone', 'ios', 2000);
  assert.equal(store.authenticate(c.token, 3000).id, c.deviceId);
  assert.throws(() => store.claim(code.code, 'Duplicate', 'ios', 3000));
  assert.throws(() => store.authenticate(c.token, Date.parse(c.expiresAt) + 1));
  assert.ok(!JSON.stringify(store.devices()).includes(c.token));
  store.revoke(c.deviceId);
  assert.throws(() => store.authenticate(c.token, 3000));
  store.close();
});
test('durable operation ledger deduplicates equivalent requests and never replays a crash-unknown operation', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ao-auth-'));
  const path = join(dir, 'state.sqlite');
  let store = new GatewayStore(path);
  try {
    const c = store.claim(store.pairCode().code, 'Device', 'other');
    const op = randomUUID();
    let calls = 0;
    const first = await store.execute(
      c.deviceId,
      op,
      { action: 'test', data: { a: 1, b: 2 } },
      async () => ({ id: ++calls }),
    );
    const second = await store.execute(
      c.deviceId,
      op,
      { data: { b: 2, a: 1 }, action: 'test' },
      async () => ({ id: ++calls }),
    );
    assert.deepEqual(first, second);
    assert.equal(calls, 1);
    await assert.rejects(
      () => store.execute(c.deviceId, op, { action: 'different' }, async () => ({})),
      /operation_conflict/,
    );
    const pending = randomUUID();
    store.db
      .prepare("INSERT INTO operations VALUES(?,?,?,'pending',NULL,?)")
      .run(c.deviceId, pending, 'fingerprint', Date.now());
    const authority = store.authorityId;
    store.close();
    store = new GatewayStore(path);
    assert.equal(store.authorityId, authority);
    assert.equal(store.operation(c.deviceId, pending)?.status, 'unknown');
    assert.equal(store.authenticate(c.token).id, c.deviceId);
  } finally {
    store.close();
    await rm(dir, { recursive: true, force: true });
  }
});
test('gateway v1 migration preserves paired identity and committed operations while recovering interrupted push', async () => {
  const { DatabaseSync } = await import('node:sqlite');
  const dir = await mkdtemp(join(tmpdir(), 'ao-migrate-'));
  const file = join(dir, 'gateway.sqlite');
  let store = new GatewayStore(file);
  try {
    const d = store.claim(store.pairCode().code, 'Retained device', 'ios');
    const authority = store.authorityId,
      op = randomUUID();
    await store.execute(d.deviceId, op, { action: 'saved' }, async () => ({ id: 'retained' }));
    store.close();
    const legacy = new DatabaseSync(file);
    legacy.exec(
      'ALTER TABLE push_devices DROP COLUMN registered_at; ALTER TABLE deliveries DROP COLUMN created_at; DROP TABLE push_acks; PRAGMA user_version=1',
    );
    legacy
      .prepare("INSERT INTO deliveries(device_id,notice_id,status,next_at) VALUES(?,?,'sending',?)")
      .run(d.deviceId, randomUUID(), Date.now());
    legacy.close();
    store = new GatewayStore(file);
    assert.equal(store.authorityId, authority);
    assert.equal(store.authenticate(d.token).id, d.deviceId);
    assert.deepEqual(store.operation(d.deviceId, op), {
      status: 'committed',
      result: { id: 'retained' },
    });
    assert.equal(store.db.prepare('SELECT status FROM deliveries').get()!.status, 'unknown');
    assert.equal(store.db.prepare('PRAGMA user_version').get()!.user_version, 3);
  } finally {
    store.close();
    await rm(dir, { recursive: true, force: true });
  }
});
