// Operator console only, not exposed by the public account API. Stop the controller before maintenance.
import {DatabaseSync} from 'node:sqlite';
import {resolve} from 'node:path';
const [action,id]=process.argv.slice(2),path=process.env.ALWAYS_ON_CONTROL_DB;
if(!path)throw Error('Operator must select the private control database path');
if(!['list','suspend-access','resume-access','disable-account','enable-account'].includes(action))throw Error('Expected list, suspend-access, resume-access, disable-account or enable-account');
if(action!=='list'&&!/^[0-9a-f-]{36}$/.test(id??''))throw Error('An exact account UUID is required');
const db=new DatabaseSync(resolve(path));
try{
 if(action==='list')console.log(JSON.stringify(db.prepare('SELECT accounts.id,accounts.disabled,allocations.slot_id,allocations.authority_id,allocations.status,allocations.error FROM accounts LEFT JOIN allocations ON accounts.id=allocations.account_id').all(),null,2));
 else if(action==='suspend-access')db.prepare("UPDATE allocations SET status='suspended' WHERE account_id=?").run(id);
 else if(action==='resume-access')db.prepare("UPDATE allocations SET status=CASE WHEN authority_id IS NULL THEN 'provisioning' ELSE 'ready' END WHERE account_id=?").run(id);
 else {db.exec('BEGIN IMMEDIATE');try{db.prepare('UPDATE accounts SET disabled=? WHERE id=?').run(action==='disable-account'?1:0,id);if(action==='disable-account'){db.prepare('UPDATE devices SET revoked=1 WHERE account_id=?').run(id);db.prepare('INSERT OR IGNORE INTO revocations(device_id) SELECT id FROM devices WHERE account_id=?').run(id);}db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}}
}finally{db.close();}
// Suspending access is NOT stopping native schedules. Stop the assigned Harness container to pause runtime execution.
