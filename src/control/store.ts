import { DatabaseSync } from 'node:sqlite';
import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdirSync, chmodSync } from 'node:fs';
import { dirname } from 'node:path';
import { GatewayError } from '../managed/store.js';

export const digest = (s: string) => createHash('sha256').update(s).digest('hex');
export const secret = () => randomBytes(32).toString('base64url');
export const challenge = (s: string) => createHash('sha256').update(s).digest('base64url');
export interface Login {
  id: string;
  state_hash: string;
  client_challenge: string;
  secret: string;
  platform: string;
  name: string;
  mobile: number;
  expires_at: number;
  status: string;
  account_id: string | null;
  result: string | null;
}
export interface AccountDevice {
  id: string;
  account_id: string;
  slot_id: string;
  token_hash: string;
  refresh_hash: string;
  secret: string;
  expires_at: number;
  refresh_expires_at: number;
  revoked: number;
  status: string;
}
/** Identity/control data only. No prompts, task engine or model calls live here. */
export class ControlStore {
  readonly db: DatabaseSync;
  private readonly key: Buffer;
  constructor(path: string, encryptionKey: string) {
    this.key = Buffer.from(encryptionKey, 'base64');
    if (this.key.length !== 32 || this.key.toString('base64') !== encryptionKey)
      throw new Error('A canonical base64 32-byte server encryption key is required');
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(path);
    if (path !== ':memory:') chmodSync(path, 0o600);
    if (Number(this.db.prepare('PRAGMA user_version').get()!.user_version) > 1) {
      this.db.close();
      throw new Error('Newer account database; downgrade refused');
    }
    this.db.exec(
      'PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000',
    );
    this.transaction(() => {
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS accounts(id TEXT PRIMARY KEY,issuer TEXT NOT NULL,subject TEXT NOT NULL,disabled INTEGER NOT NULL DEFAULT 0,created_at INTEGER NOT NULL,UNIQUE(issuer,subject));
        CREATE TABLE IF NOT EXISTS allocations(account_id TEXT PRIMARY KEY REFERENCES accounts(id),slot_id TEXT UNIQUE NOT NULL,authority_id TEXT UNIQUE,owner_id TEXT UNIQUE,status TEXT NOT NULL,error TEXT,updated_at INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS logins(id TEXT PRIMARY KEY,state_hash TEXT UNIQUE NOT NULL,client_challenge TEXT NOT NULL,secret TEXT NOT NULL,platform TEXT NOT NULL,name TEXT NOT NULL,mobile INTEGER NOT NULL,expires_at INTEGER NOT NULL,status TEXT NOT NULL,account_id TEXT REFERENCES accounts(id),result TEXT);
        CREATE TABLE IF NOT EXISTS devices(id TEXT PRIMARY KEY,account_id TEXT NOT NULL REFERENCES accounts(id),slot_id TEXT NOT NULL,token_hash TEXT UNIQUE NOT NULL,refresh_hash TEXT UNIQUE NOT NULL,secret TEXT NOT NULL,expires_at INTEGER NOT NULL,refresh_expires_at INTEGER NOT NULL,revoked INTEGER NOT NULL DEFAULT 0,status TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS audit(seq INTEGER PRIMARY KEY AUTOINCREMENT,account_id TEXT,kind TEXT NOT NULL,created_at INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS revocations(device_id TEXT PRIMARY KEY REFERENCES devices(id),upstream_pending INTEGER NOT NULL DEFAULT 1,provider_pending INTEGER NOT NULL DEFAULT 1,attempts INTEGER NOT NULL DEFAULT 0,next_at INTEGER NOT NULL DEFAULT 0);
        PRAGMA user_version=1;
        UPDATE logins SET status='unknown' WHERE status IN ('exchanging','claiming');
        UPDATE devices SET status='reauth' WHERE status='refreshing';
      `);
    });
    // A key mismatch is an operational failure, never an excuse to erase identities.
    const check = this.db.prepare('SELECT secret FROM devices LIMIT 1').get();
    if (check) this.open(String(check.secret), 'device');
  }
  transaction<T>(fn: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const result = fn();
      this.db.exec('COMMIT');
      return result;
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
  }
  seal(value: unknown, purpose: string) {
    const iv = randomBytes(12),
      cipher = createCipheriv('aes-256-gcm', this.key, iv);
    cipher.setAAD(Buffer.from('always-on-control-v1:' + purpose));
    const bytes = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
    return [iv, cipher.getAuthTag(), bytes].map((x) => x.toString('base64url')).join('.');
  }
  open<T = any>(value: string, purpose: string): T {
    const pieces = value.split('.').map((x) => Buffer.from(x, 'base64url'));
    if (pieces.length !== 3) throw new Error('Invalid encrypted control record');
    const decipher = createDecipheriv('aes-256-gcm', this.key, pieces[0]!);
    decipher.setAAD(Buffer.from('always-on-control-v1:' + purpose));
    decipher.setAuthTag(pieces[1]!);
    return JSON.parse(
      Buffer.concat([decipher.update(pieces[2]!), decipher.final()]).toString('utf8'),
    );
  }
  audit(accountId: string | null, kind: string) {
    this.db
      .prepare('INSERT INTO audit(account_id,kind,created_at) VALUES(?,?,?)')
      .run(accountId, kind, Date.now());
    this.db.exec('DELETE FROM audit WHERE seq < (SELECT COALESCE(MAX(seq),0)-10000 FROM audit)');
  }
  account(issuer: string, subject: string): string {
    if (!subject || subject.length > 512) throw new GatewayError(401, 'identity_invalid');
    const id = randomUUID();
    this.db
      .prepare('INSERT OR IGNORE INTO accounts(id,issuer,subject,created_at) VALUES(?,?,?,?)')
      .run(id, issuer, subject, Date.now());
    const row = this.db
      .prepare('SELECT id,disabled FROM accounts WHERE issuer=? AND subject=?')
      .get(issuer, subject)!;
    if (row.disabled) throw new GatewayError(403, 'account_disabled');
    return String(row.id);
  }
  requireAccount(id: string) {
    const row = this.db.prepare('SELECT * FROM accounts WHERE id=? AND disabled=0').get(id);
    if (!row) throw new GatewayError(403, 'account_disabled');
    return row;
  }
  allocation(accountId: string) {
    return this.db.prepare('SELECT * FROM allocations WHERE account_id=?').get(accountId);
  }
  reserve(accountId: string, slotIds: string[]) {
    return this.transaction(() => {
      this.requireAccount(accountId);
      const existing = this.allocation(accountId);
      if (existing) return existing;
      const used = new Set(
        this.db
          .prepare('SELECT slot_id FROM allocations')
          .all()
          .map((x) => x.slot_id),
      );
      const slot = slotIds.find((x) => !used.has(x));
      if (!slot) throw new GatewayError(503, 'agent_capacity_pending');
      this.db
        .prepare(
          "INSERT INTO allocations(account_id,slot_id,status,updated_at) VALUES(?,?,'provisioning',?)",
        )
        .run(accountId, slot, Date.now());
      this.audit(accountId, 'allocation_reserved');
      return this.allocation(accountId)!;
    });
  }
  allocationReady(accountId: string, authorityId: string, ownerId: string) {
    const old = this.allocation(accountId);
    if (
      !old ||
      (old.authority_id && (old.authority_id !== authorityId || old.owner_id !== ownerId))
    )
      throw new GatewayError(409, 'authority_identity_changed');
    try {
      this.db
        .prepare(
          "UPDATE allocations SET authority_id=?,owner_id=?,status='ready',error=NULL,updated_at=? WHERE account_id=? AND status!='suspended'",
        )
        .run(authorityId, ownerId, Date.now(), accountId);
    } catch {
      throw new GatewayError(409, 'authority_already_allocated');
    }
  }
  authenticate(token: string, now = Date.now()): AccountDevice {
    if (!/^ao_[a-f0-9-]{36}\.[A-Za-z0-9_-]{43}$/.test(token))
      throw new GatewayError(401, 'account_session_expired');
    const d = this.db
      .prepare(
        "SELECT * FROM devices WHERE token_hash=? AND revoked=0 AND status='ready' AND expires_at>?",
      )
      .get(digest(token), now) as AccountDevice | undefined;
    if (!d) throw new GatewayError(401, 'account_session_expired');
    this.requireAccount(d.account_id);
    if (this.allocation(d.account_id)?.status !== 'ready')
      throw new GatewayError(503, 'agent_unavailable');
    return d;
  }
  revoke(accountId: string, deviceId: string) {
    const d = this.db
      .prepare('SELECT * FROM devices WHERE id=? AND account_id=?')
      .get(deviceId, accountId) as AccountDevice | undefined;
    if (!d) throw new GatewayError(404, 'device_not_found');
    this.db
      .prepare('UPDATE devices SET revoked=1 WHERE id=? AND account_id=?')
      .run(deviceId, accountId);
    this.db.prepare('INSERT OR IGNORE INTO revocations(device_id) VALUES(?)').run(deviceId);
    this.audit(accountId, 'device_revoked');
    return d;
  }
  close() {
    this.db.close();
  }
}
