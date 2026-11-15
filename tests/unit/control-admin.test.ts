import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { ControlStore } from '../../src/control/store.js';
test('operator suspension persists intent and reports unconfirmed runtime stop as failure; enable does not bypass a separate suspension', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'control-admin-')),
    path = join(dir, 'state.sqlite'),
    key = randomBytes(32).toString('base64');
  try {
    let store = new ControlStore(path, key);
    const id = store.account('issuer', 'operator-fixture');
    store.reserve(id, ['slot']);
    store.allocationReady(id, randomUUID(), randomUUID());
    store.close();
    const invoke = async (action: string, expected: number) => {
      const result = await promisify(execFile)(
        process.execPath,
        [resolve('scripts/control-admin.mjs'), action, id],
        {
          env: {
            ...process.env,
            ALWAYS_ON_CONTROL_DB: path,
            ALWAYS_ON_CONTROL_CONFIG: join(dir, 'not-configured.json'),
          },
        },
      ).then(
        (r) => ({ code: 0, stdout: r.stdout }),
        (e) => ({ code: e.code, stdout: e.stdout }),
      );
      assert.equal(result.code, expected);
      return JSON.parse(result.stdout);
    };
    const pending = await invoke('suspend-access', 1);
    assert.equal(pending.execution, 'stop_pending');
    assert.equal(pending.accessChangePersisted, true);
    store = new ControlStore(path, key);
    assert.throws(() => store.requireAccount(id), /account_suspended/);
    const revision = Number(
      store.db.prepare('SELECT revision FROM execution_revisions WHERE account_id=?').get(id)!
        .revision,
    );
    store.close();
    await invoke('disable-account', 1);
    await invoke('enable-account', 0);
    store = new ControlStore(path, key);
    assert.throws(() => store.requireAccount(id), /account_suspended/);
    assert.ok(
      Number(
        store.db.prepare('SELECT revision FROM execution_revisions WHERE account_id=?').get(id)!
          .revision,
      ) > revision,
    );
    store.close();
    const resumed = await invoke('resume-access', 0);
    assert.equal(resumed.execution, 'renewal_pending');
    store = new ControlStore(path, key);
    assert.ok(store.requireAccount(id));
    store.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
test('suspension before allocation prevents later account provisioning', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'control-admin-empty-')),
    path = join(dir, 'state.sqlite'),
    key = randomBytes(32).toString('base64');
  try {
    let store = new ControlStore(path, key);
    const id = store.account('issuer', 'new-account');
    store.close();
    const r = await promisify(execFile)(
      process.execPath,
      [resolve('scripts/control-admin.mjs'), 'suspend-access', id],
      { env: { ...process.env, ALWAYS_ON_CONTROL_DB: path } },
    );
    assert.equal(JSON.parse(r.stdout).execution, 'not_assigned');
    store = new ControlStore(path, key);
    assert.throws(() => store.reserve(id, ['slot']), /account_suspended/);
    store.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
