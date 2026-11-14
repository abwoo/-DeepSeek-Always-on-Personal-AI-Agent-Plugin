import type { Notice } from '../host/notifications.js';
import { GatewayStore, GatewayError } from './store.js';
import { expoToken } from '../shared/managed-contract.js';
import { z } from 'zod';
interface Config {
  projectId?: string;
  accessToken?: string;
  enabled?: boolean;
}
interface Delivery {
  device_id: string;
  notice_id: string;
  status: string;
  ticket: string | null;
  attempts: number;
  next_at: number;
  error: string | null;
  created_at: number;
}
// Inbox remains the only result authority. A provider receipt is not evidence of a phone displaying a notification.
export class NativePush {
  private work?: Promise<void>;
  private stopped = false;
  constructor(
    private store: GatewayStore,
    private notices: () => Notice[],
    private config: Config,
    private transport: typeof fetch = fetch,
    private now = Date.now,
  ) {}
  get configured() {
    return !!(this.config.enabled && this.config.projectId && this.config.accessToken);
  }
  register(deviceId: string, input: unknown) {
    const value = z.object({ token: expoToken, projectId: z.uuid() }).strict().parse(input);
    if (!this.configured || value.projectId !== this.config.projectId)
      throw new GatewayError(503, 'native_push_not_configured');
    this.store.transaction(() => {
      // A token belongs to exactly one active paired device on this single-user authority.
      this.store.db
        .prepare('UPDATE push_devices SET active=0 WHERE token=? AND device_id<>?')
        .run(value.token, deviceId);
      this.store.db
        .prepare(
          `INSERT INTO push_devices(device_id,token,project_id,active,registered_at) VALUES(?,?,?,1,?) ON CONFLICT(device_id) DO UPDATE SET token=excluded.token,project_id=excluded.project_id,active=1,registered_at=CASE WHEN push_devices.token=excluded.token AND push_devices.active=1 THEN push_devices.registered_at ELSE excluded.registered_at END`,
        )
        .run(deviceId, value.token, value.projectId, this.now());
    });
    return { registered: true };
  }
  disable(deviceId: string) {
    this.store.db.prepare('UPDATE push_devices SET active=0 WHERE device_id=?').run(deviceId);
    return { disabled: true };
  }
  status(deviceId: string) {
    return {
      configured: this.configured,
      admissionLimitReached:
        Number(this.store.db.prepare('SELECT count(*) AS n FROM deliveries').get()!.n) >= 50000,
      registration:
        this.store.db
          .prepare('SELECT active,registered_at FROM push_devices WHERE device_id=?')
          .get(deviceId) ?? null,
      deliveries: this.store.db
        .prepare(
          'SELECT notice_id,status,attempts,next_at,error FROM deliveries WHERE device_id=? ORDER BY next_at DESC LIMIT 100',
        )
        .all(deviceId),
      acknowledgments: this.store.db
        .prepare(
          'SELECT notice_id,kind,created_at FROM push_acks WHERE device_id=? ORDER BY created_at DESC LIMIT 100',
        )
        .all(deviceId),
    };
  }
  ack(deviceId: string, input: unknown) {
    const value = z
      .object({ noticeId: z.uuid(), kind: z.enum(['opened', 'foreground_received']) })
      .strict()
      .parse(input);
    const row = this.store.db
      .prepare('SELECT status FROM deliveries WHERE device_id=? AND notice_id=?')
      .get(deviceId, value.noticeId);
    if (!row) throw new GatewayError(404, 'delivery_not_found');
    this.store.transaction(() => {
      this.store.db
        .prepare('INSERT OR IGNORE INTO push_acks VALUES(?,?,?,?)')
        .run(deviceId, value.noticeId, value.kind, this.now());
      this.store.db
        .prepare(
          "UPDATE deliveries SET status='device_acknowledged' WHERE device_id=? AND notice_id=?",
        )
        .run(deviceId, value.noticeId);
    });
    return { acknowledged: true, kind: value.kind };
  }
  tick() {
    if (this.stopped) return Promise.resolve();
    if (this.work) return this.work;
    return (this.work = this.run().finally(() => {
      this.work = undefined;
    }));
  }
  async close() {
    this.stopped = true;
    await this.work;
  }
  private async post(endpoint: 'send' | 'getReceipts', body: unknown) {
    const response = await this.transport('https://exp.host/--/api/v2/push/' + endpoint, {
      method: 'POST',
      redirect: 'error',
      signal: AbortSignal.timeout(10000),
      headers: {
        authorization: 'Bearer ' + this.config.accessToken,
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error('expo_http_' + response.status);
    return response.json();
  }
  private update(
    row: Delivery,
    status: string,
    ticket: string | null,
    error: string | null,
    nextAt: number,
  ) {
    this.store.db
      .prepare(
        "UPDATE deliveries SET status=?,ticket=?,error=?,next_at=? WHERE device_id=? AND notice_id=? AND status<>'device_acknowledged'",
      )
      .run(status, ticket, error, nextAt, row.device_id, row.notice_id);
  }
  private async run() {
    if (!this.configured || this.stopped) return;
    const now = this.now();
    const devices = this.store.db
      .prepare(
        'SELECT p.* FROM push_devices p JOIN devices d ON d.id=p.device_id WHERE p.active=1 AND d.revoked=0 AND d.expires_at>?',
      )
      .all(now);
    for (const device of devices) {
      for (const notice of this.notices().filter(
        (n) => !n.read && Date.parse(n.createdAt) >= Number(device.registered_at),
      )) {
        this.store.db
          .prepare(
            "INSERT OR IGNORE INTO deliveries(device_id,notice_id,status,next_at,created_at) SELECT ?,?,'pending',?,? WHERE (SELECT count(*) FROM deliveries)<50000",
          )
          .run(String(device.device_id), notice.id, now, now);
      }
    }
    const pending = this.store.db
      .prepare(
        `SELECT x.* FROM deliveries x JOIN push_devices p ON p.device_id=x.device_id JOIN devices d ON d.id=x.device_id WHERE x.status='pending' AND x.next_at<=? AND p.active=1 AND d.revoked=0 AND d.expires_at>? LIMIT 25`,
      )
      .all(now, now) as unknown as Delivery[];
    for (const row of pending) {
      if (this.stopped) break;
      const device = this.store.db
        .prepare('SELECT * FROM push_devices WHERE device_id=? AND active=1')
        .get(row.device_id);
      if (!device) continue;
      this.store.db
        .prepare(
          "UPDATE deliveries SET status='sending',attempts=attempts+1 WHERE device_id=? AND notice_id=? AND status='pending'",
        )
        .run(row.device_id, row.notice_id);
      try {
        const reply = await this.post('send', {
          to: device.token,
          title: 'DeepSeek Always-on',
          body: 'Your personal agent has an update. Open Inbox.',
          sound: 'default',
          channelId: 'agent-updates',
          ttl: 3600,
          data: { authorityId: this.store.authorityId, noticeId: row.notice_id },
        });
        const ticket = Array.isArray(reply.data) ? reply.data[0] : reply.data;
        if (ticket?.status === 'ok' && typeof ticket.id === 'string')
          this.update(row, 'accepted', ticket.id, null, now + 900000);
        else if (ticket?.status === 'error') {
          const error = String(ticket?.details?.error ?? 'provider_rejected').slice(0, 120);
          this.update(row, 'failed', null, error, now);
          if (error === 'DeviceNotRegistered') this.disable(row.device_id);
        } else this.update(row, 'unknown', null, 'invalid_push_ticket_outcome_unknown', now);
      } catch {
        this.update(row, 'unknown', null, 'send_outcome_unknown_no_automatic_retry', now);
      }
    }
    const receipts = this.store.db
      .prepare("SELECT * FROM deliveries WHERE status='accepted' AND next_at<=? LIMIT 100")
      .all(now) as unknown as Delivery[];
    if (!receipts.length || this.stopped) return;
    try {
      const reply = await this.post('getReceipts', { ids: receipts.map((r) => r.ticket) });
      for (const row of receipts) {
        const receipt = reply.data?.[row.ticket!];
        if (receipt?.status === 'ok') this.update(row, 'provider_confirmed', row.ticket, null, now);
        else if (receipt?.status === 'error') {
          const error = String(receipt.details?.error ?? 'provider_rejected').slice(0, 120);
          this.update(row, 'failed', row.ticket, error, now);
          if (error === 'DeviceNotRegistered') this.disable(row.device_id);
        } else if (now - row.created_at > 23 * 3600000)
          this.update(row, 'unknown', row.ticket, 'receipt_expired', now);
        else
          this.store.db
            .prepare('UPDATE deliveries SET next_at=? WHERE device_id=? AND notice_id=?')
            .run(now + 300000, row.device_id, row.notice_id);
      }
    } catch {
      for (const row of receipts)
        this.store.db
          .prepare('UPDATE deliveries SET next_at=? WHERE device_id=? AND notice_id=?')
          .run(now + 300000, row.device_id, row.notice_id);
    }
  }
}
