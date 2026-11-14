import type { Context } from '@deepseek-ai/cordis';
import type {} from '@deepseek-ai/dsh-agent';
import type {} from '@deepseek-ai/dsh-tools';
import { GatewayStore } from './store.js';
const readOnly = new Set([
  'web_search',
  'web_fetch',
  'always_on_report',
  'always_on_memory_search',
  'always_on_memory_propose',
  'always_on_create_task',
]);
export class AccountBudget {
  constructor(
    private store: GatewayStore,
    readonly maxStepsPerDay = 300,
    readonly maxTokensPerDay = 250000,
  ) {}
  private day() {
    return new Date().toISOString().slice(0, 10);
  }
  status() {
    return (
      this.store.db.prepare('SELECT * FROM account_budget WHERE day=?').get(this.day()) ?? {
        day: this.day(),
        steps: 0,
        tokens: 0,
        usage_unknown: 0,
      }
    );
  }
  admit(sessionId: string, turn: number, now = Date.now()) {
    return this.store.transaction(() => {
      const day = this.day();
      this.store.db.prepare('INSERT OR IGNORE INTO account_budget(day) VALUES(?)').run(day);
      const daily = this.status();
      if (
        Number(daily.steps) >= this.maxStepsPerDay ||
        Number(daily.tokens) >= this.maxTokensPerDay ||
        daily.usage_unknown
      )
        throw Error('Account daily model budget exhausted or usage unconfirmed');
      const key = sessionId + ':' + turn;
      this.store.db
        .prepare('INSERT OR IGNORE INTO turn_budget(id,started_at) VALUES(?,?)')
        .run(key, now);
      const row = this.store.db.prepare('SELECT * FROM turn_budget WHERE id=?').get(key)!;
      if (Number(row.steps) >= 8 || now - Number(row.started_at) > 180000)
        throw Error('Account turn budget exceeded');
      this.store.db.prepare('UPDATE turn_budget SET steps=steps+1 WHERE id=?').run(key);
      this.store.db.prepare('UPDATE account_budget SET steps=steps+1 WHERE day=?').run(day);
      this.store.db.prepare('DELETE FROM turn_budget WHERE started_at<?').run(now - 7 * 86400000);
    });
  }
  usage(sessionId: string, seq: number, usage?: { inputTokens: number; outputTokens: number }) {
    this.store.transaction(() => {
      const id = sessionId + ':' + seq;
      if (this.store.db.prepare('SELECT id FROM budget_usage WHERE id=?').get(id)) return;
      this.store.db
        .prepare('INSERT INTO budget_usage(id,created_at) VALUES(?,?)')
        .run(id, Date.now());
      this.store.db.prepare('INSERT OR IGNORE INTO account_budget(day) VALUES(?)').run(this.day());
      if (
        !usage ||
        ![usage.inputTokens, usage.outputTokens].every((n) => Number.isSafeInteger(n) && n >= 0)
      )
        this.store.db
          .prepare('UPDATE account_budget SET usage_unknown=1 WHERE day=?')
          .run(this.day());
      else
        this.store.db
          .prepare('UPDATE account_budget SET tokens=tokens+? WHERE day=?')
          .run(usage.inputTokens + usage.outputTokens, this.day());
      this.store.db
        .prepare('DELETE FROM budget_usage WHERE created_at<?')
        .run(Date.now() - 7 * 86400000);
    });
  }
}
export function installAccountPolicy(ctx: Context, store: GatewayStore) {
  const budget = new AccountBudget(store),
    bound = () => !!store.db.prepare("SELECT value FROM meta WHERE key='account_id'").get();
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  ctx.tools.guard((exec) =>
    bound() && !readOnly.has(exec.name)
      ? 'This managed account permits read-only research and consented personal-agent tools. Local files, shell and external writes require a separate reviewed device/approval capability.'
      : undefined,
  );
  ctx.on('agent/pre-step', async ({ agent, turn }, next) => {
    if (bound()) {
      const id = agent.session.id + ':' + turn;
      if (!timers.has(id) && timers.size >= 2)
        throw Error('Managed account concurrent-turn limit reached');
      budget.admit(agent.session.id, turn);
      agent.options.maxTokens = Math.min(agent.options.maxTokens ?? 2048, 2048);
      if (!timers.has(id)) {
        const timer = setTimeout(() => {
          timers.delete(id);
          agent.cancel({ kind: 'hook', reason: 'Managed account time budget exceeded' });
        }, 180000);
        timer.unref();
        timers.set(id, timer);
      }
    }
    return next();
  });
  ctx.on('session/event', (session, event) => {
    if (!bound()) return;
    if (event.type === 'assistant/message') budget.usage(session.id, event.seq, event.data.usage);
    if (event.type === 'assistant/attempt') budget.usage(session.id, event.seq);
    if (event.type === 'turn/end') {
      const key = session.id + ':' + event.data.turn;
      clearTimeout(timers.get(key));
      timers.delete(key);
    }
  });
  ctx.effect(() => () => {
    for (const timer of timers.values()) clearTimeout(timer);
    timers.clear();
  });
  return budget;
}
