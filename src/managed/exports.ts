import { mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Store } from '../host/storage.js';
import type { GatewayStore } from './store.js';
import { GatewayError } from './store.js';
import { exportPageSchema, type ExportItem } from '../shared/export-contract.js';
const PAGE_BYTES = 128 * 1024,
  MAX_BYTES = 64 * 1024 * 1024,
  TTL = 5 * 60000;
interface Job {
  id: string;
  device: string;
  secret: string;
  expires: number;
  created: string;
  pages: number;
  records: number;
  snapshot?: Record<string, unknown>;
}
/** Short-lived private record snapshots, never credentials or native transcript files. */
export class RecordExports {
  private jobs = new Map<string, Job>();
  private starts = new Map<string, { until: number; count: number }>();
  private timer: ReturnType<typeof setInterval>;
  constructor(
    private dir: string,
    private core: Store,
    private gateway: GatewayStore,
    private now = Date.now,
  ) {
    // These files are disposable, not durable agent state. No stale export survives restart.
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    this.timer = setInterval(() => this.cleanup(), 30000);
    this.timer.unref();
  }
  cleanup() {
    for (const job of this.jobs.values()) if (job.expires <= this.now()) this.remove(job);
  }
  private remove(job: Job) {
    rmSync(join(this.dir, job.id), { recursive: true, force: true });
    this.jobs.delete(job.id);
  }
  release(device: string, id: string) {
    const job = this.jobs.get(id);
    if (job?.device === device) this.remove(job);
  }
  start(device: string, state?: Record<string, any>) {
    this.cleanup();
    const mode = state ? 'snapshot' : 'export';
    for (const [key, value] of this.starts) if (value.until <= this.now()) this.starts.delete(key);
    const entries = [
      [mode + ':device:' + device, state ? 12 : 3],
      [mode + ':account', state ? 60 : 10],
    ] as const;
    for (const [key, max] of entries)
      if ((this.starts.get(key)?.count ?? 0) >= max)
        throw new GatewayError(429, 'export_rate_limit');
    for (const [key] of entries) {
      const value = this.starts.get(key) ?? { until: this.now() + 60000, count: 0 };
      value.count++;
      this.starts.set(key, value);
    }
    for (const job of this.jobs.values())
      if (job.device === device && !!job.snapshot === !!state) this.remove(job);
    if (this.jobs.size >= 4) throw new GatewayError(429, 'export_busy');
    const job: Job = {
      id: randomUUID(),
      device,
      secret: randomBytes(32).toString('base64url'),
      expires: this.now() + TTL,
      created: new Date(this.now()).toISOString(),
      pages: 0,
      records: 0,
    };
    if (state) {
      job.snapshot = Object.fromEntries(
        Object.entries(state).filter(
          ([key]) => !['tasks', 'runs', 'memories', 'inbox', 'goals'].includes(key),
        ),
      );
    }
    const dir = join(this.dir, job.id);
    mkdirSync(dir, { mode: 0o700 });
    let items: ExportItem[] = [],
      bytes = 0,
      total = 0;
    const flush = () => {
      writeFileSync(join(dir, String(job.pages++)), JSON.stringify(items), { mode: 0o600 });
      items = [];
      bytes = 0;
    };
    try {
      // All synchronous iterators run in one event-loop turn under the documented
      // one-writer-per-profile rule: no awaited mutation can interleave capture.
      for (const kind of ['tasks', 'runs', 'memory', 'inbox', 'goals'] as const) {
        const db = kind === 'goals' ? this.gateway.db : this.core.db;
        const rows = state
          ? (state[kind === 'memory' ? 'memories' : kind] as any[]).map((data) => ({
              id: data.id,
              data: JSON.stringify(data),
            }))
          : db.prepare(`SELECT id,data FROM ${kind} ORDER BY rowid`).iterate();
        for (const row of rows) {
          const item = { kind, id: String(row.id), data: JSON.parse(String(row.data)) };
          const size = Buffer.byteLength(JSON.stringify(item)) + 1;
          if (size > PAGE_BYTES) throw new GatewayError(422, 'export_record_too_large');
          total += size;
          if (total > MAX_BYTES) throw new GatewayError(413, 'export_limit');
          if (items.length && (bytes + size > PAGE_BYTES || items.length >= 100)) flush();
          items.push(item);
          bytes += size;
          job.records++;
        }
      }
      if (items.length || !job.pages) flush();
      this.jobs.set(job.id, job);
      return this.page(job, 0);
    } catch (e) {
      rmSync(dir, { recursive: true, force: true });
      throw e;
    }
  }
  read(device: string, cursor: string, snapshot = false) {
    this.cleanup();
    const match = /^([0-9a-f-]{36})\.([A-Za-z0-9_-]{43})\.(\d{1,4})$/.exec(cursor);
    if (!match) throw new GatewayError(400, 'invalid_export_cursor');
    const job = this.jobs.get(match[1]!);
    if (
      !job ||
      !!job.snapshot !== snapshot ||
      job.device !== device ||
      !timingSafeEqual(Buffer.from(job.secret), Buffer.from(match[2]!))
    )
      throw new GatewayError(410, 'export_expired');
    const index = Number(match[3]);
    if (index >= job.pages) throw new GatewayError(400, 'invalid_export_cursor');
    return this.page(job, index);
  }
  private page(job: Job, index: number) {
    return exportPageSchema.parse({
      ...(job.snapshot ? { snapshot: job.snapshot } : {}),
      format: 'always-on.records/v1',
      authorityId: this.gateway.authorityId,
      exportId: job.id,
      createdAt: job.created,
      expiresAt: new Date(job.expires).toISOString(),
      index,
      pages: job.pages,
      records: job.records,
      items: JSON.parse(readFileSync(join(this.dir, job.id, String(index)), 'utf8')),
      next: index + 1 < job.pages ? `${job.id}.${job.secret}.${index + 1}` : null,
    });
  }
  close() {
    clearInterval(this.timer);
    for (const job of this.jobs.values()) this.remove(job);
  }
}
