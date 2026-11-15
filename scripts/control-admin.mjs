// Operator console only. Uses the private DB and the configured private leaf API.
import { DatabaseSync } from 'node:sqlite';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const [action, id] = process.argv.slice(2),
  path = process.env.ALWAYS_ON_CONTROL_DB;
if (!path) throw Error('Operator must select the private control database path');
if (
  !['list', 'suspend-access', 'resume-access', 'disable-account', 'enable-account'].includes(action)
)
  throw Error('Expected list, suspend-access, resume-access, disable-account or enable-account');
if (action !== 'list' && !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(id ?? ''))
  throw Error('An exact account UUID is required');
const db = new DatabaseSync(resolve(path));
db.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000; PRAGMA synchronous=FULL;');
try {
  if (Number(db.prepare('PRAGMA user_version').get().user_version) !== 2)
    throw Error(
      'Upgrade the controller and lease-enforcing authorities before using this operator tool',
    );
  if (action === 'list')
    console.log(
      JSON.stringify(
        db
          .prepare(
            'SELECT accounts.id,accounts.disabled,accounts.suspended,allocations.slot_id,allocations.authority_id,allocations.status FROM accounts LEFT JOIN allocations ON accounts.id=allocations.account_id',
          )
          .all(),
        null,
        2,
      ),
    );
  else {
    const account = db.prepare('SELECT * FROM accounts WHERE id=?').get(id);
    if (!account) throw Error('Account not found');
    const stopping = action === 'suspend-access' || action === 'disable-account';
    let revision;
    db.exec('BEGIN IMMEDIATE');
    try {
      if (action === 'suspend-access' || action === 'resume-access') {
        db.prepare('UPDATE accounts SET suspended=? WHERE id=?').run(
          action === 'suspend-access' ? 1 : 0,
          id,
        );
        db.prepare(
          "UPDATE allocations SET status=CASE WHEN ?=1 THEN 'suspended' WHEN authority_id IS NULL THEN 'provisioning' ELSE 'ready' END WHERE account_id=?",
        ).run(action === 'suspend-access' ? 1 : 0, id);
      } else
        db.prepare('UPDATE accounts SET disabled=? WHERE id=?').run(
          action === 'disable-account' ? 1 : 0,
          id,
        );
      if (action === 'disable-account') {
        db.prepare('UPDATE devices SET revoked=1 WHERE account_id=?').run(id);
        db.prepare(
          'INSERT OR IGNORE INTO revocations(device_id) SELECT id FROM devices WHERE account_id=?',
        ).run(id);
      }
      revision = Number(
        db
          .prepare(
            'INSERT INTO execution_revisions(account_id,revision) VALUES(?,1) ON CONFLICT(account_id) DO UPDATE SET revision=revision+1 RETURNING revision',
          )
          .get(id).revision,
      );
      db.prepare('INSERT INTO audit(account_id,kind,created_at) VALUES(?,?,?)').run(
        id,
        'operator_' + action,
        Date.now(),
      );
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
    const slot = db.prepare('SELECT * FROM allocations WHERE account_id=?').get(id);
    let execution = slot?.authority_id ? 'renewal_pending' : 'not_assigned';
    if (stopping && slot?.authority_id) {
      execution = 'stop_pending';
      try {
        const config = JSON.parse(
          await readFile(
            process.env.ALWAYS_ON_CONTROL_CONFIG ?? '/run/config/control.json',
            'utf8',
          ),
        );
        if (resolve(config.database) !== resolve(path))
          throw Error('Configuration/database mismatch');
        const target = config.slots.find((s) => s.id === slot.slot_id),
          origin = new URL(target.origin);
        if (
          origin.protocol !== 'https:' ||
          origin.username ||
          origin.password ||
          origin.pathname !== '/' ||
          origin.search ||
          origin.hash
        )
          throw Error('Private HTTPS authority required');
        const key = (await readFile(target.provisioningKeyFile, 'utf8')).trim();
        const response = await fetch(origin.origin + '/personal-agent/v1/operator/execution', {
          method: 'POST',
          redirect: 'error',
          headers: { 'content-type': 'application/json', 'x-always-on-provisioning-key': key },
          body: JSON.stringify({ accountId: id, revision, enabled: false, ttlSeconds: 0 }),
          signal: AbortSignal.timeout(7000),
        });
        const result = await response.json();
        if (
          !response.ok ||
          result.enabled !== false ||
          result.authorityId !== slot.authority_id ||
          result.ownerId !== slot.owner_id ||
          result.accountId !== id ||
          result.revision !== revision
        )
          throw Error('Execution stop unconfirmed');
        execution = 'suspended';
      } catch {
        process.exitCode = 1;
      }
    }
    console.log(
      JSON.stringify(
        {
          accountId: id,
          action,
          revision,
          execution,
          accessChangePersisted: true,
          ...(execution === 'stop_pending'
            ? {
                note: 'Runtime stop is not confirmed. Current lease-enforcing runtimes fail closed within 30 seconds of their last grant. Inspect or stop the assigned runtime before reporting suspension complete.',
              }
            : {}),
        },
        null,
        2,
      ),
    );
  }
} finally {
  db.close();
}
