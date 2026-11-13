import { randomUUID, createHash } from 'node:crypto';
import { taskSchema, findingSchema, type TaskInput, type Finding } from '../shared/schemas.js';
import type { Store } from './storage.js';
import type { Notifications } from './notifications.js';
export interface Task extends TaskInput {
  id: string;
  scheduleId?: string;
  sessionId?: string;
  state: 'configuring' | 'active' | 'paused' | 'cancelled' | 'exhausted' | 'error';
  createdAt: string;
  error?: string;
  suspendedForUnload?: boolean;
}
export interface Run {
  id: string;
  taskId: string;
  occurrence: string;
  sessionId: string;
  status:
    | 'queued'
    | 'running'
    | 'completed'
    | 'failed'
    | 'needs_approval'
    | 'interrupted'
    | 'unconfirmed';
  attempt: number;
  startedAt: string;
  finishedAt?: string;
  turn?: number;
  result?: Finding;
  resultReference?: string;
  error?: string;
  steps: number;
  deniedTool?: string;
  inputTokens?: number;
  outputTokens?: number;
  usageMissing?: boolean;
}
export interface Scheduler {
  create(input: {
    title: string;
    prompt: string;
    timing: TaskInput['timing'];
    target: { kind: 'new_once' };
  }): Promise<{ id: string; target?: { sessionId?: string } }>;
  edit(input: { id: string; action: 'update'; patch: { active: boolean } }): Promise<unknown>;
  run(input: { id: string }): Promise<unknown>;
  catalog?(): Promise<{ id: string; scheduledAt: string; status: string }[]>;
}
export const marker = '[ALWAYS_ON_TRIGGER]';
export class Coordinator {
  enabled = true;
  cancelSession?: (sessionId: string) => void;
  constructor(
    readonly store: Store,
    readonly scheduler: Scheduler,
    readonly notices: Notifications,
  ) {}
  tasks() {
    return this.store.all<Task>('tasks').map((t) => ({
      ...t,
      maxOutputTokens: t.maxOutputTokens ?? 2048,
      maxTotalTokens: t.maxTotalTokens ?? 50000,
    }));
  }
  runs() {
    return this.store.all<Run>('runs');
  }
  async create(input: unknown) {
    if (this.tasks().length >= 100) throw new Error('Host task limit (100) reached');
    const data = taskSchema.parse(input);
    const task: Task = {
      ...data,
      id: randomUUID(),
      state: 'configuring',
      createdAt: new Date().toISOString(),
    };
    this.store.put('tasks', task.id, task);
    try {
      const schedule = await this.scheduler.create({
        title: task.title,
        prompt: `${marker} ${task.id}\nManaged trigger only. Without the Always-on plugin do not act; the task instruction is held by its coordinator.`,
        timing: task.timing,
        target: { kind: 'new_once' },
      });
      task.scheduleId = schedule.id;
      task.sessionId = schedule.target?.sessionId;
      task.state = 'active';
      this.store.put('tasks', task.id, task);
      return task;
    } catch (e) {
      task.state = 'error';
      task.error = String(e);
      this.store.put('tasks', task.id, task);
      throw e;
    }
  }
  async control(id: string, state: 'active' | 'paused' | 'cancelled') {
    const t = this.requireTask(id);
    if (!t.scheduleId) throw new Error('Task is not scheduled');
    if (
      state === 'active' &&
      (t.state === 'cancelled' ||
        t.state === 'exhausted' ||
        this.runs().filter((r) => r.taskId === id).length >= t.maxRuns)
    )
      throw new Error('Run budget exhausted');
    if (state === 'active') {
      await this.scheduler.edit({ id: t.scheduleId, action: 'update', patch: { active: true } });
      t.state = state;
      this.store.put('tasks', id, t);
    } else {
      t.state = state;
      this.store.put('tasks', id, t);
      if (state === 'cancelled')
        for (const run of this.runs().filter((r) => r.taskId === id && r.status === 'running'))
          this.cancelSession?.(run.sessionId);
      await this.scheduler.edit({ id: t.scheduleId, action: 'update', patch: { active: false } });
    }
    return t;
  }
  requireTask(id: string) {
    const t = this.store.get<Task>('tasks', id);
    if (!t) throw new Error('Unknown task');
    return {
      ...t,
      maxOutputTokens: t.maxOutputTokens ?? 2048,
      maxTotalTokens: t.maxTotalTokens ?? 50000,
    };
  }
  claim(taskId: string, occurrence: string, sessionId: string, turn: number) {
    if (!this.enabled) return;
    const task = this.requireTask(taskId);
    return this.store.transaction(() => {
      if (task.state !== 'active') return;
      const prior = this.runs().filter((r) => r.taskId === taskId);
      const existing = prior.find((r) => r.occurrence === occurrence);
      if (existing && existing.status !== 'queued') return;
      if (prior.some((r) => r.sessionId === sessionId && r.status === 'running')) return;
      if (prior.length - (existing ? 1 : 0) >= task.maxRuns) {
        task.state = 'exhausted';
        this.store.put('tasks', task.id, task);
        return;
      }
      const run: Run = {
        id: existing?.id ?? randomUUID(),
        taskId,
        occurrence,
        sessionId,
        turn,
        status: 'running',
        attempt: 1,
        startedAt: new Date().toISOString(),
        steps: 0,
      };
      this.save(run);
      return run;
    });
  }
  delivered(taskId: string, occurrence: string, sessionId: string) {
    if (this.runs().some((r) => r.taskId === taskId && r.occurrence === occurrence)) return;
    this.save({
      id: randomUUID(),
      taskId,
      occurrence,
      sessionId,
      status: 'queued',
      attempt: 1,
      startedAt: new Date().toISOString(),
      steps: 0,
    });
  }
  save(r: Run) {
    this.store.run(r.id, r.taskId, r.occurrence, r);
  }
  recordUsage(sessionId: string, usage?: { inputTokens: number; outputTokens: number }) {
    const run = this.active(sessionId);
    if (!run) return;
    if (usage) {
      run.inputTokens = (run.inputTokens ?? 0) + usage.inputTokens;
      run.outputTokens = (run.outputTokens ?? 0) + usage.outputTokens;
    } else run.usageMissing = true;
    this.save(run);
  }
  guardTool(sessionId: string, name: string) {
    const r = this.active(sessionId);
    if (!r) return;
    const t = this.requireTask(r.taskId);
    const allowed = new Set([
      'always_on_report',
      'always_on_memory_search',
      ...t.allowedTools.filter((x) => ['web_search', 'web_fetch'].includes(x)),
    ]);
    if (this.enabled && allowed.has(name)) return;
    r.deniedTool = name;
    this.save(r);
    return 'Always-on unattended run: this tool is not authorized. External writes require a separate interactive session and native approval.';
  }
  active(sessionId: string) {
    return this.runs().find((r) => r.sessionId === sessionId && r.status === 'running');
  }
  report(sessionId: string, input: unknown) {
    const run = this.active(sessionId);
    if (!run) throw new Error('No active Always-on run');
    const result = findingSchema.parse(input);
    run.result = result;
    this.save(run);
    return { accepted: true, runId: run.id, notice: 'Pending durable model turn completion' };
  }
  finish(id: string, reason: string, reference?: string, detail?: string) {
    const run = this.store.get<Run>('runs', id);
    if (!run || run.status !== 'running') return;
    run.status = run.deniedTool
      ? 'needs_approval'
      : reason === 'completed'
        ? run.result
          ? 'completed'
          : 'unconfirmed'
        : reason === 'blocked'
          ? 'needs_approval'
          : 'failed';
    run.resultReference = reference;
    run.finishedAt = new Date().toISOString();
    if (run.status !== 'completed')
      run.error = run.deniedTool
        ? `Tool ${run.deniedTool} requires interactive authorization; unattended execution was denied.`
        : `Model turn: ${reason}${detail ? ': ' + detail : ''}; business result ${run.result ? 'reported' : 'not confirmed'}`;
    this.store.transaction(() => {
      this.save(run);
      const task = this.requireTask(run.taskId);
      if (run.status !== 'completed') {
        this.notices.create(run.id, task.title, run.error ?? run.status);
        return;
      }
      const result = run.result!;
      const fingerprint = createHash('sha256')
        .update(
          JSON.stringify(
            result.sources.length
              ? { sources: [...new Set(result.sources)].sort() }
              : { summary: result.summary.trim() },
          ),
        )
        .digest('hex');
      const seen = this.store.db
        .prepare('SELECT 1 FROM seen WHERE task_id=? AND fingerprint=?')
        .get(run.taskId, fingerprint);
      if (result.changed && !seen) {
        this.store.db
          .prepare('INSERT OR IGNORE INTO seen VALUES(?,?)')
          .run(run.taskId, fingerprint);
        this.notices.create(run.id, task.title, result.summary);
      }
    });
    return run;
  }
  recover() {
    for (const run of this.runs().filter((r) => r.status === 'running' || r.status === 'queued')) {
      run.status = 'interrupted';
      run.finishedAt = new Date().toISOString();
      run.error =
        'Host stopped before durable completion; no automatic replay. Inspect Session before a new run.';
      this.store.transaction(() => {
        this.save(run);
        this.notices.create(run.id, this.requireTask(run.taskId).title, run.error!);
      });
    }
  }
  async shutdown() {
    this.enabled = false;
    const entries = await this.scheduler.catalog?.();
    for (const task of this.tasks().filter((t) => t.state === 'active' && t.scheduleId)) {
      if (entries && !entries.some((e) => e.id === task.scheduleId && e.status === 'active'))
        continue;
      task.suspendedForUnload = true;
      this.store.put('tasks', task.id, task);
      await this.scheduler.edit({
        id: task.scheduleId!,
        action: 'update',
        patch: { active: false },
      });
    }
  }
}
// Parse ONLY messages whose native source is schedule. Both framing variants are pinned by compatibility tests.
export function triggers(
  text: string,
): { taskId: string; scheduleId: string; occurrence: string }[] {
  try {
    if (text.startsWith('[SCHEDULE REMINDER BATCH]')) {
      const raw = text.split('\n').find((l) => l.startsWith('reminders_json: '));
      if (!raw) return [];
      return JSON.parse(raw.slice(16)).flatMap(
        (r: { reminder_prompt: string; schedule_id: string; occurrence_at: string }) =>
          trigger(r.reminder_prompt, r.schedule_id, r.occurrence_at),
      );
    }
    const schedule = JSON.parse(text.match(/^schedule_id_json: (.+)$/m)?.[1] ?? 'null');
    const occurrence = text.match(/^occurrence_at: (.+)$/m)?.[1];
    const prompt = JSON.parse(text.match(/^reminder_prompt_json: (.+)$/m)?.[1] ?? 'null');
    return trigger(prompt, schedule, occurrence);
  } catch {
    return [];
  }
}
function trigger(prompt: unknown, schedule: unknown, occurrence: unknown) {
  if (
    typeof prompt !== 'string' ||
    typeof schedule !== 'string' ||
    typeof occurrence !== 'string' ||
    !Number.isFinite(Date.parse(occurrence))
  )
    return [];
  const id = prompt.match(/^\[ALWAYS_ON_TRIGGER\] ([0-9a-f-]{36})\n/)?.[1];
  return id ? [{ taskId: id, scheduleId: schedule, occurrence }] : [];
}
