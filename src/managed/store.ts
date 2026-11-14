import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, chmodSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomBytes, randomUUID, createHash, timingSafeEqual } from 'node:crypto';
import type { DeviceCredentials } from '../shared/managed-contract.js';
const canonical = (value:unknown):unknown => Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([key,v])=>[key,canonical(v)])):value;
export const hash = (text: string) => createHash('sha256').update(text).digest('hex');
export class GatewayError extends Error { constructor(readonly status: number, readonly code: string) { super(code); } }
export interface Device { id: string; owner_id: string; name: string; platform: string; token_hash: string; expires_at: number; revoked: number; created_at: number; }
export class GatewayStore {
  readonly db: DatabaseSync;
  readonly authorityId: string;
  readonly ownerId: string;
  constructor(path: string, recoverPending=true) {
    if (path !== ':memory:') mkdirSync(dirname(path), {recursive:true,mode:0o700});
    this.db = new DatabaseSync(path); if (path !== ':memory:') chmodSync(path,0o600);
    if(Number(this.db.prepare('PRAGMA user_version').get()!.user_version)>1){this.db.close();throw new Error('Gateway database is newer; refusing downgrade');}
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS pairings(hash TEXT PRIMARY KEY,expires_at INTEGER NOT NULL,used INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS devices(id TEXT PRIMARY KEY,owner_id TEXT NOT NULL,name TEXT NOT NULL,platform TEXT NOT NULL,token_hash TEXT NOT NULL,expires_at INTEGER NOT NULL,revoked INTEGER NOT NULL DEFAULT 0,created_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS operations(device_id TEXT NOT NULL,id TEXT NOT NULL,fingerprint TEXT NOT NULL,status TEXT NOT NULL,result TEXT,created_at INTEGER NOT NULL,PRIMARY KEY(device_id,id));
      CREATE TABLE IF NOT EXISTS changes(seq INTEGER PRIMARY KEY AUTOINCREMENT,kind TEXT NOT NULL,resource_id TEXT,created_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS goals(id TEXT PRIMARY KEY,data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS push_devices(device_id TEXT PRIMARY KEY,token TEXT NOT NULL,project_id TEXT NOT NULL,active INTEGER NOT NULL DEFAULT 1);
      CREATE TABLE IF NOT EXISTS deliveries(device_id TEXT NOT NULL,notice_id TEXT NOT NULL,status TEXT NOT NULL,ticket TEXT,attempts INTEGER NOT NULL DEFAULT 0,next_at INTEGER NOT NULL,error TEXT,PRIMARY KEY(device_id,notice_id));`);
    const ensure = (key:string) => { this.db.prepare('INSERT OR IGNORE INTO meta VALUES(?,?)').run(key,randomUUID()); return String(this.db.prepare('SELECT value FROM meta WHERE key=?').get(key)!.value); };
    this.db.exec('PRAGMA user_version=1');
    this.authorityId=ensure('authority_id'); this.ownerId=ensure('owner_id');
    if(recoverPending)this.db.exec("UPDATE operations SET status='unknown' WHERE status='pending'; UPDATE deliveries SET status='unknown',error='process_interrupted' WHERE status='sending';");
  }
  transaction<T>(fn:()=>T):T { this.db.exec('BEGIN IMMEDIATE'); try { const value=fn();this.db.exec('COMMIT');return value;}catch(e){this.db.exec('ROLLBACK');throw e;} }
  pairCode(now=Date.now()) { const code=randomBytes(24).toString('base64url');this.db.prepare('DELETE FROM pairings WHERE expires_at<? OR used=1').run(now);this.db.prepare('INSERT INTO pairings(hash,expires_at) VALUES(?,?)').run(hash(code),now+300000);return {code,expiresAt:new Date(now+300000).toISOString(),authorityId:this.authorityId}; }
  claim(code:string,name:string,platform:string,now=Date.now()):DeviceCredentials {
    return this.transaction(()=>{
      const found=this.db.prepare('SELECT * FROM pairings WHERE hash=? AND used=0 AND expires_at>?').get(hash(code),now);
      if(!found) throw new GatewayError(401,'pairing_invalid_or_expired');
      if(Number(this.db.prepare('SELECT count(*) AS n FROM devices WHERE revoked=0 AND expires_at>?' ).get(now)!.n)>=32) throw new GatewayError(409,'device_limit');
      const deviceId=randomUUID(),secret=randomBytes(32).toString('base64url'),token=`ao_${deviceId}.${secret}`,expires=now+90*86400000;
      this.db.prepare('UPDATE pairings SET used=1 WHERE hash=?').run(hash(code));
      this.db.prepare('INSERT INTO devices VALUES(?,?,?,?,?,?,0,?)').run(deviceId,this.ownerId,name,platform,hash(token),expires,now);
      this.change('device',deviceId);return {authorityId:this.authorityId,ownerId:this.ownerId,deviceId,token,expiresAt:new Date(expires).toISOString()};
    });
  }
  authenticate(token:string,now=Date.now()):Device {
    const id=token.match(/^ao_([a-f0-9-]{36})\.[A-Za-z0-9_-]{43}$/)?.[1];
    const device=id?this.db.prepare('SELECT * FROM devices WHERE id=?').get(id) as unknown as Device|undefined:undefined;
    const digest=Buffer.from(hash(token));const expected=Buffer.from(device?.token_hash??'0'.repeat(64));
    if(!timingSafeEqual(digest,expected)||!device||device.owner_id!==this.ownerId||device.revoked||device.expires_at<=now) throw new GatewayError(401,'device_unauthorized');
    return device;
  }
  devices() { return this.db.prepare('SELECT id,name,platform,expires_at,revoked,created_at FROM devices ORDER BY created_at').all(); }
  revoke(id:string) { this.transaction(()=>{this.db.prepare('UPDATE devices SET revoked=1 WHERE id=? AND owner_id=?').run(id,this.ownerId);this.db.prepare('UPDATE push_devices SET active=0 WHERE device_id=?').run(id);this.change('device_revoked',id);}); }
  change(kind:string,resourceId:string|null=null) { this.db.prepare('INSERT INTO changes(kind,resource_id,created_at) VALUES(?,?,?)').run(kind,resourceId,Date.now());this.db.prepare('DELETE FROM changes WHERE seq < (SELECT max(seq)-5000 FROM changes)').run(); }
  revision() {return Number(this.db.prepare('SELECT coalesce(max(seq),0) AS n FROM changes').get()!.n);}
  observeSnapshot(value:unknown) {const digest=hash(JSON.stringify(value));const prior=this.db.prepare("SELECT value FROM meta WHERE key='snapshot_hash'").get()?.value;if(prior!==digest)this.transaction(()=>{this.db.prepare("INSERT OR REPLACE INTO meta VALUES('snapshot_hash',?)").run(digest);this.change('snapshot');});return this.revision();}
  changes(after:number) { const floor=Number(this.db.prepare('SELECT coalesce(min(seq),0) AS n FROM changes').get()!.n);if(after>0&&after<floor-1)throw new GatewayError(410,'cursor_expired');const rows=this.db.prepare('SELECT * FROM changes WHERE seq>? ORDER BY seq LIMIT 200').all(after);return {items:rows,revision:this.revision(),hasMore:rows.length===200}; }
  operation(deviceId:string,id:string) {const row=this.db.prepare('SELECT status,result FROM operations WHERE device_id=? AND id=?').get(deviceId,id);return row?{status:row.status,result:row.result?JSON.parse(String(row.result)):null}:null;}
  async execute(deviceId:string,id:string,command:unknown,work:()=>Promise<unknown>) {
    const fingerprint=hash(JSON.stringify(canonical(command)));
    const previous=this.transaction(()=>{const row=this.db.prepare('SELECT * FROM operations WHERE device_id=? AND id=?').get(deviceId,id);if(row){if(row.fingerprint!==fingerprint)throw new GatewayError(409,'operation_conflict');return row;}if(Number(this.db.prepare('SELECT count(*) AS n FROM operations').get()!.n)>=50000)throw new GatewayError(507,'operation_storage_limit');this.db.prepare("INSERT INTO operations VALUES(?,?,?,'pending',NULL,?)").run(deviceId,id,fingerprint,Date.now());return null;});
    if(previous){if(previous.status==='committed')return JSON.parse(String(previous.result));throw new GatewayError(409,'operation_outcome_unknown');}
    try { const result=await work();const serialized=JSON.stringify(result);if(serialized.length>1048576)throw new GatewayError(503,'operation_result_too_large');this.transaction(()=>{this.db.prepare("UPDATE operations SET status='committed',result=? WHERE device_id=? AND id=?").run(serialized,deviceId,id);this.change('operation',id);});return result; }
    catch(e){this.db.prepare("UPDATE operations SET status='unknown' WHERE device_id=? AND id=?").run(deviceId,id);throw e;}
  }
  goals(){return this.db.prepare('SELECT data FROM goals').all().map(r=>JSON.parse(String(r.data)));}
  saveGoal(id:string,data:unknown){this.db.prepare('INSERT OR REPLACE INTO goals VALUES(?,?)').run(id,JSON.stringify(data));this.change('goal',id);}
  close(){this.db.close();}
}
