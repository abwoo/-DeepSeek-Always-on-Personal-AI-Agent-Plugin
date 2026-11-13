import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, chmodSync } from 'node:fs';
import { dirname } from 'node:path';
export class Store {
  readonly db: DatabaseSync;
  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(path);
    if (path !== ':memory:') chmodSync(path, 0o600);
    this.db.exec(
      'PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000; PRAGMA synchronous=FULL;',
    );
    const version = Number(this.db.prepare('PRAGMA user_version').get()?.user_version);
    if (version > 1) {
      this.db.close();
      throw new Error('Database is newer than this plugin; refusing downgrade');
    }
    this.db.exec(`CREATE TABLE IF NOT EXISTS tasks(id TEXT PRIMARY KEY, data TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS runs(id TEXT PRIMARY KEY, task_id TEXT NOT NULL REFERENCES tasks(id), occurrence TEXT NOT NULL, data TEXT NOT NULL, UNIQUE(task_id,occurrence));
   CREATE TABLE IF NOT EXISTS memory(id TEXT PRIMARY KEY, data TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS inbox(id TEXT PRIMARY KEY, data TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS subscriptions(id TEXT PRIMARY KEY, data TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS seen(task_id TEXT NOT NULL, fingerprint TEXT NOT NULL, PRIMARY KEY(task_id,fingerprint));
   PRAGMA user_version=1;`);
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
  get<T>(
    table: 'tasks' | 'runs' | 'memory' | 'inbox' | 'subscriptions',
    id: string,
  ): T | undefined {
    const row = this.db.prepare(`SELECT data FROM ${table} WHERE id=?`).get(id);
    return row ? JSON.parse(String(row.data)) : undefined;
  }
  all<T>(table: 'tasks' | 'runs' | 'memory' | 'inbox' | 'subscriptions'): T[] {
    return this.db
      .prepare(`SELECT data FROM ${table} ORDER BY rowid DESC`)
      .all()
      .map((r) => JSON.parse(String(r.data)));
  }
  put(table: 'tasks' | 'memory' | 'inbox' | 'subscriptions', id: string, value: unknown) {
    this.db
      .prepare(
        `INSERT INTO ${table}(id,data) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data`,
      )
      .run(id, JSON.stringify(value));
  }
  run(id: string, task: string, occurrence: string, value: unknown) {
    this.db
      .prepare(
        'INSERT INTO runs(id,task_id,occurrence,data) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data',
      )
      .run(id, task, occurrence, JSON.stringify(value));
  }
  delete(table: 'memory' | 'subscriptions', id: string) {
    return this.db.prepare(`DELETE FROM ${table} WHERE id=?`).run(id).changes;
  }
  close() {
    this.db.close();
  }
}
