import type { Context } from '@deepseek-ai/cordis';
import type {} from '@deepseek-ai/dsh-agent';
import { z } from 'zod';
import { GatewayStore, GatewayError } from './store.js';
export const executionGrant = z
  .object({
    accountId: z.uuid(),
    revision: z.number().int().positive(),
    enabled: z.boolean(),
    ttlSeconds: z.number().int().min(0).max(30),
  })
  .strict();
/** Bounded authorization for the existing Harness loop; never an execution loop. */
export class ExecutionLease {
  private grant?: { revision: number; expires: number; prepared: boolean };
  private serial: Promise<unknown> = Promise.resolve();
  private pausing = false;
  private pauseAfter = 0;
  private closed = false;
  private timer: ReturnType<typeof setInterval>;
  private previousGate?: () => boolean;
  private required = process.env.ALWAYS_ON_ACCOUNT_EXECUTION_REQUIRED === '1';
  constructor(
    private ctx: Context,
    private store: GatewayStore,
  ) {
    this.previousGate = ctx.alwaysOn.coordinator.executionAllowed;
    ctx.alwaysOn.coordinator.executionAllowed = () => this.allowed();
    this.timer = setInterval(() => this.enforce(), 250);
    this.timer.unref();
    this.enforce();
  }
  private account() {
    return this.store.db.prepare("SELECT value FROM meta WHERE key='account_id'").get()?.value;
  }
  private read<T>(key: string, fallback: T): T {
    const v = this.store.db.prepare('SELECT value FROM meta WHERE key=?').get(key)?.value;
    return v ? JSON.parse(String(v)) : fallback;
  }
  private write(key: string, value: unknown) {
    this.store.db
      .prepare(
        'INSERT INTO meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',
      )
      .run(key, JSON.stringify(value));
  }
  private valid() {
    return !!this.grant && this.grant.expires > performance.now();
  }
  allowed() {
    if (this.closed) return false;
    if (!this.account() && !this.required) return true;
    return this.valid() && this.grant!.prepared;
  }
  status() {
    return {
      required: this.required || !!this.account(),
      enabled: this.allowed(),
      revision: this.read('execution_revision', 0),
      expiresAt: this.grant
        ? new Date(Date.now() + this.grant.expires - performance.now()).toISOString()
        : null,
    };
  }
  private queue<T>(work: () => Promise<T>) {
    const p = this.serial.then(work, work);
    this.serial = p.catch(() => {});
    return p;
  }
  private cancel() {
    for (const agent of this.ctx.agents.list())
      if (agent.status === 'running')
        agent.cancel({
          kind: 'hook',
          reason: 'Managed account execution suspended or renewal expired',
        });
  }
  private async schedules(enabled: boolean) {
    const c = this.ctx.alwaysOn.coordinator;
    const paused = new Set(this.read<string[]>('execution_paused_tasks', []));
    for (const task of c.tasks()) {
      if (!task.scheduleId) continue;
      if (!enabled && task.state === 'active' && !paused.has(task.id)) {
        const result = (await c.scheduler.edit({
          id: task.scheduleId,
          action: 'update',
          patch: { active: false },
        })) as { id?: string; status?: string; code?: string };
        if (result?.status === 'ended') continue;
        if (result?.id !== task.scheduleId || result?.status !== 'paused' || result.code)
          throw new Error('Native schedule pause not confirmed');
        paused.add(task.id);
        this.write('execution_paused_tasks', [...paused]);
      } else if (enabled && paused.has(task.id)) {
        if (c.requireTask(task.id).state === 'active') {
          try {
            const result = (await c.scheduler.edit({
              id: task.scheduleId,
              action: 'update',
              patch: { active: true },
            })) as { id?: string; status?: string; code?: string };
            if (
              result?.id !== task.scheduleId ||
              !['active', 'ended'].includes(result?.status ?? '') ||
              result.code
            )
              throw new Error('Native schedule restoration not confirmed');
          } catch {
            const current = c.requireTask(task.id);
            if (current.state === 'active') {
              current.state = 'error';
              current.error =
                'Account resumed but native schedule restoration needs review. No automatic task replay was performed.';
              c.store.put('tasks', task.id, current);
            }
          }
        }
        paused.delete(task.id);
        this.write('execution_paused_tasks', [...paused]);
      }
    }
  }
  private enforce() {
    if (this.closed || this.allowed() || this.valid()) return;
    if (!this.account() && !this.required) return;
    this.cancel();
    if (!this.pausing && performance.now() >= this.pauseAfter) {
      this.pausing = true;
      void this.queue(() => this.schedules(false))
        .catch(() => {
          this.pauseAfter = performance.now() + 2000;
        })
        .finally(() => {
          this.pausing = false;
        });
    }
  }
  async apply(input: unknown, receivedAt = performance.now()) {
    const policy = executionGrant.parse(input);
    if (this.account() !== policy.accountId)
      throw new GatewayError(409, 'authority_account_conflict');
    if (policy.enabled && policy.ttlSeconds < 1)
      throw new GatewayError(400, 'invalid_execution_lease');
    return this.queue(async () => {
      if (this.closed) throw new GatewayError(503, 'execution_policy_closed');
      const revision = this.read<number>('execution_revision', 0);
      if (policy.revision <= revision) throw new GatewayError(409, 'execution_revision_stale');
      this.write('execution_revision', policy.revision);
      // Grants are deliberately memory-only: every Host restart requires fresh
      // controller authorization. Denial and native schedule pause IDs persist.
      const keepAllowed = this.allowed();
      this.grant = policy.enabled
        ? {
            revision: policy.revision,
            expires: receivedAt + policy.ttlSeconds * 1000,
            prepared: keepAllowed,
          }
        : undefined;
      if (!policy.enabled) this.cancel();
      await this.schedules(policy.enabled);
      this.pauseAfter = 0;
      if (this.grant?.revision === policy.revision && this.valid()) this.grant.prepared = true;
      this.enforce();
      return {
        authorityId: this.store.authorityId,
        ownerId: this.store.ownerId,
        accountId: policy.accountId,
        ...this.status(),
      };
    });
  }
  async close() {
    const bound = !!this.account() || this.required;
    this.closed = true;
    clearInterval(this.timer);
    if (bound) this.cancel();
    await this.serial;
    // An unloaded gateway must not reopen account execution through the core.
    this.ctx.alwaysOn.coordinator.executionAllowed = bound ? () => false : this.previousGate;
  }
}
