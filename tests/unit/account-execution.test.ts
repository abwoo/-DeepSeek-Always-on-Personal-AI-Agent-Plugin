import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { DatabaseSync } from 'node:sqlite';
import { ControlStore } from '../../src/control/store.js';
import { GatewayStore } from '../../src/managed/store.js';
import { Store } from '../../src/host/storage.js';
import { Notifications } from '../../src/host/notifications.js';
import { Coordinator } from '../../src/host/tasks.js';
import { ExecutionLease } from '../../src/managed/execution.js';
async function fixture() {
  const gateway = new GatewayStore(':memory:'),
    store = new Store(':memory:'),
    states = new Map<string, boolean>();
  const scheduler = {
    create: async () => {
      const id = randomUUID();
      states.set(id, true);
      return { id };
    },
    edit: async (x: any) => {
      states.set(x.id, x.patch.active);
      return { id: x.id, status: x.patch.active ? 'active' : 'paused' };
    },
    run: async () => {},
  };
  const coordinator = new Coordinator(store, scheduler, new Notifications(store));
  const a = await coordinator.create({
    title: 'Authorized periodic task',
    instruction: 'Read only',
    timing: { kind: 'every', every_seconds: 60 },
  });
  const b = await coordinator.create({
    title: 'User paused task',
    instruction: 'Read only',
    timing: { kind: 'every', every_seconds: 60 },
  });
  await coordinator.control(b.id, 'paused');
  const accountId = randomUUID();
  gateway.db.prepare("INSERT INTO meta(key,value) VALUES('account_id',?)").run(accountId);
  let cancelled = 0;
  const agent = {
    status: 'running',
    cancel: () => {
      cancelled++;
      agent.status = 'idle';
    },
  };
  const ctx = { alwaysOn: { coordinator }, agents: { list: () => [agent] } };
  const lease = new ExecutionLease(ctx as any, gateway);
  return {
    gateway,
    store,
    coordinator,
    a,
    b,
    accountId,
    ctx,
    agent,
    lease,
    states,
    cancelled: () => cancelled,
    close: async () => {
      await lease.close();
      gateway.close();
      store.close();
    },
  };
}
test('execution denial pauses owned schedules, cancels native work and preserves user task states/IDs (scheduler hook fixture)', async () => {
  const f = await fixture();
  try {
    await f.lease.apply({ accountId: f.accountId, revision: 1, enabled: true, ttlSeconds: 30 });
    assert.equal(f.lease.allowed(), true);
    assert.equal(f.states.get(f.a.scheduleId!), true);
    f.agent.status = 'running';
    await f.lease.apply({ accountId: f.accountId, revision: 2, enabled: false, ttlSeconds: 0 });
    assert.equal(f.lease.allowed(), false);
    assert.ok(f.cancelled() > 0);
    assert.equal(f.states.get(f.a.scheduleId!), false);
    assert.equal(f.coordinator.requireTask(f.a.id).state, 'active');
    assert.equal(f.coordinator.requireTask(f.b.id).state, 'paused');
    assert.equal(f.coordinator.claim(f.a.id, 'blocked', randomUUID(), 1), undefined);
    await assert.rejects(
      f.coordinator.create({
        title: 'Blocked',
        instruction: 'No work',
        timing: { kind: 'every', every_seconds: 60 },
      }),
    );
    await assert.rejects(
      f.lease.apply({ accountId: f.accountId, revision: 1, enabled: true, ttlSeconds: 30 }),
      /execution_revision_stale/,
    );
    await assert.rejects(
      f.lease.apply({ accountId: randomUUID(), revision: 3, enabled: true, ttlSeconds: 30 }),
      /authority_account_conflict/,
    );
    await f.lease.apply({ accountId: f.accountId, revision: 3, enabled: true, ttlSeconds: 30 });
    assert.equal(f.states.get(f.a.scheduleId!), true);
    assert.equal(f.states.get(f.b.scheduleId!), false);
    assert.equal(f.coordinator.requireTask(f.a.id).id, f.a.id);
    const expired = await f.lease.apply(
      { accountId: f.accountId, revision: 4, enabled: true, ttlSeconds: 30 },
      performance.now() - 31000,
    );
    assert.equal(expired.enabled, false);
    assert.equal(f.lease.allowed(), false);
  } finally {
    await f.close();
  }
});
test('expired authorization fails closed without controller contact; an old grant cannot survive Host restart', async () => {
  const f = await fixture();
  let replacement: ExecutionLease | undefined;
  try {
    await f.lease.apply({ accountId: f.accountId, revision: 1, enabled: true, ttlSeconds: 1 });
    f.agent.status = 'running';
    await delay(1400);
    assert.equal(f.lease.allowed(), false);
    assert.equal(f.states.get(f.a.scheduleId!), false);
    assert.equal(f.coordinator.claim(f.a.id, 'expired', randomUUID(), 1), undefined);
    await f.lease.apply({ accountId: f.accountId, revision: 2, enabled: true, ttlSeconds: 30 });
    await f.lease.close();
    replacement = new ExecutionLease(f.ctx as any, f.gateway);
    assert.equal(replacement.allowed(), false);
    await assert.rejects(
      replacement.apply({ accountId: f.accountId, revision: 2, enabled: true, ttlSeconds: 30 }),
      /stale/,
    );
    await replacement.apply({ accountId: f.accountId, revision: 3, enabled: true, ttlSeconds: 30 });
    assert.equal(replacement.allowed(), true);
  } finally {
    await replacement?.close();
    await f.close();
  }
});
test('account schema 1 upgrades transactionally without changing identity; execution revisions survive restart and future downgrade is refused', () => {
  const dir = mkdtempSync(join(tmpdir(), 'account-policy-')),
    path = join(dir, 'accounts.sqlite'),
    key = randomBytes(32).toString('base64');
  try {
    let s = new ControlStore(path, key);
    const account = s.account('issuer', 'owner');
    s.reserve(account, ['slot']);
    const authority = randomUUID(),
      owner = randomUUID();
    s.allocationReady(account, authority, owner);
    s.db.exec(
      'ALTER TABLE accounts DROP COLUMN suspended; DROP TABLE execution_revisions; PRAGMA user_version=1',
    );
    s.close();
    s = new ControlStore(path, key);
    assert.equal(s.db.prepare('PRAGMA user_version').get()!.user_version, 2);
    assert.equal(s.account('issuer', 'owner'), account);
    assert.equal(s.allocation(account)!.authority_id, authority);
    assert.equal(s.nextExecutionRevision(account), 1);
    s.close();
    s = new ControlStore(path, key);
    assert.equal(s.nextExecutionRevision(account), 2);
    s.db.prepare('UPDATE accounts SET suspended=1 WHERE id=?').run(account);
    assert.throws(() => s.requireAccount(account), /account_suspended/);
    s.close();
    const db = new DatabaseSync(path);
    db.exec('PRAGMA user_version=3');
    db.close();
    assert.throws(() => new ControlStore(path, key), /downgrade refused/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a non-mutating native schedule error is not accepted as pause success', async () => {
  const f = await fixture();
  try {
    await f.lease.apply({ accountId: f.accountId, revision: 1, enabled: true, ttlSeconds: 30 });
    f.coordinator.scheduler.edit = async ({ id }) => ({ id, code: 'schedule_conflict' });
    await assert.rejects(
      f.lease.apply({ accountId: f.accountId, revision: 2, enabled: false, ttlSeconds: 0 }),
      /pause not confirmed/,
    );
    assert.equal(f.lease.allowed(), false);
    assert.equal(f.coordinator.claim(f.a.id, 'must-not-run', randomUUID(), 1), undefined);
  } finally {
    await f.close();
  }
});
