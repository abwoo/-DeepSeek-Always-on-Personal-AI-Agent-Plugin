import { createHash, randomUUID } from 'node:crypto';
import webpush from 'web-push';
import { z } from 'zod';
import type { Store } from './storage.js';
export interface Notice {
  id: string;
  runId: string;
  title: string;
  summary: string;
  createdAt: string;
  read: boolean;
  push: 'pending' | 'sent' | 'failed' | 'disabled';
  attempts: number;
}
const subscriptionSchema = z.object({
  endpoint: z.url(),
  expirationTime: z.number().nullable().optional(),
  keys: z.object({ p256dh: z.string().min(40).max(200), auth: z.string().min(10).max(100) }),
});
// Exact provider suffixes only; an authenticated request must not turn push into arbitrary server-side HTTP.
export function validateSubscription(input: unknown) {
  const sub = subscriptionSchema.parse(input);
  const u = new URL(sub.endpoint);
  const providers = [
    'push.apple.com',
    'push.services.mozilla.com',
    'fcm.googleapis.com',
    'notify.windows.com',
  ];
  if (
    u.protocol !== 'https:' ||
    u.port ||
    u.username ||
    u.password ||
    !providers.some((h) => u.hostname === h || u.hostname.endsWith('.' + h))
  )
    throw new Error('Unsupported push provider');
  return sub;
}
export class Notifications {
  private sending: Promise<void> | undefined;
  constructor(
    private store: Store,
    private vapid?: { subject: string; publicKey: string; privateKey: string },
    private send = webpush.sendNotification,
  ) {}
  subscribe(input: unknown) {
    const sub = validateSubscription(input);
    const id = createHash('sha256').update(sub.endpoint).digest('hex');
    this.store.put('subscriptions', id, sub);
    return { id };
  }
  unsubscribe(id: string) {
    this.store.delete('subscriptions', id);
  }
  create(runId: string, title: string, summary: string) {
    const existing = this.list().find((n) => n.runId === runId);
    if (existing) return existing;
    const n: Notice = {
      id: randomUUID(),
      runId,
      title,
      summary,
      createdAt: new Date().toISOString(),
      read: false,
      push: this.vapid ? 'pending' : 'disabled',
      attempts: 0,
    };
    this.store.put('inbox', n.id, n);
    return n;
  }
  list() {
    return this.store.all<Notice>('inbox');
  }
  read(id: string) {
    const n = this.store.get<Notice>('inbox', id);
    if (n) this.store.put('inbox', id, { ...n, read: true });
  }
  deliver() {
    if (this.sending) return this.sending;
    const p = this.deliverOnce().finally(() => {
      this.sending = undefined;
    });
    this.sending = p;
    return p;
  }
  private async deliverOnce() {
    if (!this.vapid) return;
    for (const n of this.list().filter(
      (n) => !n.read && n.attempts < 3 && (n.push === 'pending' || n.push === 'failed'),
    )) {
      let failed = false;
      const subs = this.store.all<ReturnType<typeof validateSubscription>>('subscriptions');
      for (const sub of subs) {
        try {
          await this.send(
            sub,
            JSON.stringify({
              title: 'DeepSeek Always-on',
              body: 'A task has an update. Open your inbox.',
              url: '/?alwaysOnInbox=1',
            }),
            { vapidDetails: this.vapid, TTL: 3600, timeout: 10000 },
          );
        } catch (e) {
          failed = true;
          const status = (e as { statusCode?: number }).statusCode;
          if (status === 404 || status === 410)
            this.unsubscribe(createHash('sha256').update(sub.endpoint).digest('hex'));
        }
      }
      this.store.put('inbox', n.id, {
        ...n,
        push: failed || subs.length === 0 ? 'failed' : 'sent',
        attempts: n.attempts + 1,
      });
    }
  }
}
