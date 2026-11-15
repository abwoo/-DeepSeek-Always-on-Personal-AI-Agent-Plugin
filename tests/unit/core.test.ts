import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../../src/host/storage.js';
import { Coordinator, marker, triggers, type Scheduler } from '../../src/host/tasks.js';
import { MemoryService } from '../../src/host/memory.js';
import { Notifications, validateSubscription } from '../../src/host/notifications.js';
import { createApi } from '../../src/host/api.js';
function fixture(path = ':memory:') {
  const store = new Store(path),
    notices = new Notifications(store);
  let count = 0;
  const edits: unknown[] = [];
  const scheduler: Scheduler = {
    create: async () => ({ id: `schedule-${++count}`, target: { sessionId: `session-${count}` } }),
    edit: async (x) => {
      edits.push(x);
      return { id: x.id, status: x.patch.active ? 'active' : 'paused' };
    },
    run: async ({ id }) => ({ id, status: 'active' }),
  };
  return {
    store,
    notices,
    scheduler,
    edits,
    c: new Coordinator(store, scheduler, notices),
    memory: new MemoryService(store),
  };
}
const input = {
  title: 'EEG methods',
  instruction: 'Check new EEG methodology papers',
  timing: { kind: 'every', every_seconds: 60 },
  allowedTools: ['web_search'],
};
test('one occurrence is admitted once, including concurrent duplicate callers', async () => {
  const f = fixture();
  const t = await f.c.create(input);
  const runs = await Promise.all(
    Array.from({ length: 8 }, () =>
      Promise.resolve(f.c.claim(t.id, '2026-11-14T00:00:00Z', 's1', 1)),
    ),
  );
  assert.equal(runs.filter(Boolean).length, 1);
  assert.equal(f.c.runs().length, 1);
  f.store.close();
});
test('delivery alone never completes a run', async () => {
  const f = fixture();
  const t = await f.c.create(input);
  const r = f.c.claim(t.id, '2026-11-14T00:00:00Z', 's1', 1)!;
  assert.equal(r.status, 'running');
  f.c.finish(r.id, 'completed');
  assert.equal(f.c.runs()[0]?.status, 'unconfirmed');
  assert.equal(f.notices.list().length, 1);
  f.store.close();
});
test('reported result is not success before durable terminal', async () => {
  const f = fixture();
  const t = await f.c.create(input);
  const r = f.c.claim(t.id, '2026-11-14T00:00:00Z', 's', 1)!;
  f.c.report('s', {
    summary: 'New validated paper',
    sources: ['https://example.org/paper'],
    changed: true,
  });
  assert.equal(f.notices.list().length, 0);
  assert.equal(f.c.active('s')?.status, 'running');
  f.c.finish(r.id, 'completed', 'session:s#event:9');
  assert.equal(f.c.runs()[0]?.status, 'completed');
  assert.equal(f.notices.list().length, 1);
  f.store.close();
});
test('same discovery is suppressed; no-change check is silent', async () => {
  const f = fixture();
  const t = await f.c.create(input);
  for (let i = 0; i < 3; i++) {
    const r = f.c.claim(t.id, `2026-11-14T00:0${i}:00Z`, 's', i)!;
    f.c.report('s', { summary: 'Paper A', sources: ['https://example.org/a'], changed: i !== 2 });
    f.c.finish(r.id, 'completed');
  }
  assert.equal(f.notices.list().length, 1);
  assert.equal(f.c.runs().length, 3);
  f.store.close();
});
test('a failed model turn never reports success despite a result tool call', async () => {
  const f = fixture();
  const t = await f.c.create(input);
  const r = f.c.claim(t.id, '2026-11-14T00:00:00Z', 's', 1)!;
  f.c.report('s', { summary: 'Draft', sources: [], changed: true });
  f.c.finish(r.id, 'error');
  assert.equal(f.c.runs()[0]?.status, 'failed');
  f.store.close();
});
test('restart preserves tasks, memory, Inbox and marks incomplete work interrupted', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'always-on-')),
    path = join(dir, 'state.sqlite');
  let f = fixture(path);
  const t = await f.c.create(input);
  const r = f.c.claim(t.id, '2026-11-14T00:00:00Z', 's', 1)!;
  f.memory.save({ kind: 'project', content: 'EEG methods', source: 'user', consent: true });
  f.store.close();
  f = fixture(path);
  f.c.recover();
  assert.equal(f.c.tasks().length, 1);
  assert.equal(f.memory.list().length, 1);
  assert.equal(f.c.runs()[0]?.status, 'interrupted');
  assert.equal(f.notices.list().length, 1);
  assert.equal(f.c.claim(t.id, r.occurrence, 's', 2), undefined);
  assert.equal(statSync(path).mode & 0o777, 0o600);
  f.store.close();
  rmSync(dir, { recursive: true });
});
test('task pause and lifetime budget close admission', async () => {
  const f = fixture();
  const t = await f.c.create({ ...input, maxRuns: 1 });
  await f.c.control(t.id, 'paused');
  assert.equal(f.c.claim(t.id, '2026-11-14T00:00:00Z', 's', 1), undefined);
  await f.c.control(t.id, 'active');
  const r = f.c.claim(t.id, '2026-11-14T00:00:00Z', 's', 1)!;
  f.c.finish(r.id, 'completed');
  assert.equal(f.c.claim(t.id, '2026-11-14T00:01:00Z', 's', 2), undefined);
  assert.equal(f.c.requireTask(t.id).state, 'exhausted');
  await assert.rejects(() => f.c.control(t.id, 'active'));
  f.store.close();
});
test('plugin shutdown pauses native schedules and retains data', async () => {
  const f = fixture();
  const t = await f.c.create(input);
  await f.c.shutdown();
  assert.equal(f.c.enabled, false);
  assert.equal(f.c.tasks().length, 1);
  assert.equal(f.c.claim(t.id, '2026-11-14T00:00:00Z', 's', 1), undefined);
  assert.deepEqual(f.edits, [{ id: t.scheduleId, action: 'update', patch: { active: false } }]);
  f.store.close();
});
test('unload checks native receipts, attempts every pause and retains uncertain states', async () => {
  const f = fixture();
  try {
    await f.c.create(input); await f.c.create(input);
    const [failing, succeeding] = f.c.tasks();
    const attempted: string[] = [];
    f.scheduler.edit = async ({ id }) => {
      attempted.push(id);
      return id === failing!.scheduleId ? { id, code: 'schedule_conflict' } : { id, status: 'paused' };
    };
    await assert.rejects(f.c.shutdown(), /could not confirm all native schedule pauses/);
    assert.deepEqual(attempted, [failing!.scheduleId, succeeding!.scheduleId]);
    assert.equal(f.c.requireTask(failing!.id).state, 'error');
    assert.equal(f.c.requireTask(failing!.id).suspendedForUnload, false);
    assert.match(f.c.requireTask(failing!.id).error!, /unconfirmed/);
    assert.equal(f.c.requireTask(succeeding!.id).suspendedForUnload, true);
    assert.equal(f.c.enabled, false);
  } finally { f.store.close(); }
});
test('catalog or transport failure cannot skip later unload pause attempts', async () => {
  const f = fixture();
  try {
    await f.c.create(input); await f.c.create(input);
    f.scheduler.catalog = async () => { throw Error('Catalog unavailable'); };
    const [failing, succeeding] = f.c.tasks();
    const attempted: string[] = [];
    f.scheduler.edit = async ({ id }) => {
      attempted.push(id);
      if (id === failing!.scheduleId) throw Error('Unknown transport outcome');
      return { id, status: 'paused' };
    };
    await assert.rejects(f.c.shutdown(), AggregateError);
    assert.deepEqual(attempted, [failing!.scheduleId, succeeding!.scheduleId]);
    assert.equal(f.c.requireTask(failing!.id).state, 'error');
    assert.equal(f.c.requireTask(succeeding!.id).suspendedForUnload, true);
    assert.equal(f.c.tasks().length, 2);
  } finally { f.store.close(); }
});
test('memory proposal cannot be retrieved before human confirmation, deletion removes future retrieval', () => {
  const f = fixture();
  const p = f.memory.propose({
    kind: 'preference',
    content: 'EEG research in English',
    source: 'chat',
  });
  assert.equal(f.memory.search('EEG').length, 0);
  f.memory.save({ id: p.id, kind: p.kind, content: p.content, source: p.source, consent: true });
  assert.equal(f.memory.search('EEG').length, 1);
  f.memory.remove(p.id);
  assert.deepEqual(f.memory.search('EEG'), []);
  assert.throws(() => f.memory.save({ kind: 'fact', content: 'x', source: 'x', consent: false }));
  f.store.close();
});
test('task validation rejects unbounded runs and sub-minute recurrence', async () => {
  const f = fixture();
  await assert.rejects(() => f.c.create({ ...input, maxRuns: Infinity }));
  await assert.rejects(() => f.c.create({ ...input, timing: { kind: 'every', every_seconds: 1 } }));
  f.store.close();
});
test('push subscription rejects SSRF and suffix lookalikes', () => {
  for (const endpoint of [
    'http://localhost/x',
    'https://127.0.0.1/x',
    'https://fcm.googleapis.com.evil.test/x',
    'https://user:pass@fcm.googleapis.com/x',
    'https://fcm.googleapis.com:8080/x',
  ])
    assert.throws(() =>
      validateSubscription({ endpoint, keys: { p256dh: 'a'.repeat(80), auth: 'a'.repeat(22) } }),
    );
});
test('push failure keeps Inbox authoritative and removes expired endpoint', async () => {
  const f = fixture();
  const send = async () => {
    throw Object.assign(new Error('Expired'), { statusCode: 410 });
  };
  const n = new Notifications(
    f.store,
    { subject: 'mailto:test@example.org', publicKey: 'public', privateKey: 'private' },
    send,
  );
  n.subscribe({
    endpoint: 'https://fcm.googleapis.com/fcm/send/test',
    keys: { p256dh: 'a'.repeat(80), auth: 'b'.repeat(22) },
  });
  n.create('r', 'Task', 'Private summary');
  await n.deliver();
  assert.equal(n.list().length, 1);
  assert.equal(n.list()[0]?.push, 'failed');
  assert.equal(f.store.all('subscriptions').length, 0);
  f.store.close();
});
test('memory/inbox mutations are shared across two API clients', async () => {
  const f = fixture();
  const api = createApi(f.c, f.memory, f.notices);
  const res = await api(
    new Request('https://host/api/always-on', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        action: 'memory.save',
        data: { kind: 'fact', content: 'Cross-device EEG context', source: 'user', consent: true },
      }),
    }),
  );
  assert.equal(res.status, 200);
  const desktop = await (await api(new Request('https://host/api/always-on'))).json();
  assert.equal(desktop.memories.length, 1);
  f.store.close();
});
test('API rejects malformed and overlarge inputs', async () => {
  const f = fixture(),
    api = createApi(f.c, f.memory, f.notices);
  assert.equal(
    (await api(new Request('https://host/api/always-on', { method: 'POST', body: '{}' }))).status,
    415,
  );
  assert.equal(
    (
      await api(
        new Request('https://host/api/always-on', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: 'x'.repeat(65537),
        }),
      )
    ).status,
    413,
  );
  f.store.close();
});
test('native framing parser handles single and batch and rejects malformed data', () => {
  const taskId = '12345678-1234-1234-1234-123456789abc';
  const prompt = `${marker} ${taskId}\nManaged trigger`;
  const text = `[SCHEDULE REMINDER]\nschedule_id_json: "s1"\noccurrence_at: 2026-11-14T00:00:00Z\nreminder_prompt_json: ${JSON.stringify(prompt)}`;
  assert.equal(triggers(text)[0]?.taskId, taskId);
  assert.equal(
    triggers(
      `[SCHEDULE REMINDER BATCH]\nreminders_json: ${JSON.stringify([{ schedule_id: 's', occurrence_at: '2026-11-14T00:00:00Z', reminder_prompt: prompt }])}`,
    ).length,
    1,
  );
  assert.deepEqual(triggers('garbage'), []);
});
test('queued receipts cannot bypass the lifetime run budget', async () => {
  const f = fixture();
  const t = await f.c.create({ ...input, maxRuns: 1 });
  let r = f.c.claim(t.id, '2026-11-14T00:00:00Z', 's', 1)!;
  f.c.finish(r.id, 'completed');
  f.c.delivered(t.id, '2026-11-14T00:01:00Z', 's');
  assert.equal(f.c.claim(t.id, '2026-11-14T00:01:00Z', 's', 2), undefined);
  f.store.close();
});
test('read-only tools stay permitted but shell attempts require approval even after a reported result', async () => {
  const f = fixture();
  const t = await f.c.create({ ...input, allowedTools: ['web_search', 'shell'] });
  const r = f.c.claim(t.id, '2026-11-14T00:00:00Z', 's', 1)!;
  assert.equal(f.c.guardTool('s', 'web_search'), undefined);
  assert.match(f.c.guardTool('s', 'shell')!, /not authorized/);
  f.c.report('s', { summary: 'Should not hide denial', sources: [], changed: true });
  f.c.finish(r.id, 'completed');
  assert.equal(f.c.runs()[0]?.status, 'needs_approval');
  f.store.close();
});
test('native token accounting is retained and missing accounting is explicit', async () => {
  const f = fixture();
  const t = await f.c.create(input);
  f.c.claim(t.id, '2026-11-14T00:00:00Z', 's', 1);
  f.c.recordUsage('s', { inputTokens: 100, outputTokens: 20 });
  f.c.recordUsage('s', { inputTokens: 200, outputTokens: 10 });
  assert.equal(f.c.active('s')?.inputTokens, 300);
  assert.equal(f.c.active('s')?.outputTokens, 30);
  f.c.recordUsage('s');
  assert.equal(f.c.active('s')?.usageMissing, true);
  f.store.close();
});
test('owner cancellation stops the active native Session and keeps an audit record', async () => {
  const f = fixture();
  const t = await f.c.create(input);
  const r = f.c.claim(t.id, '2026-11-14T00:00:00Z', 's', 1)!;
  const stopped: string[] = [];
  f.c.cancelSession = (id) => {
    stopped.push(id);
  };
  await f.c.control(t.id, 'cancelled');
  assert.deepEqual(stopped, ['s']);
  assert.equal(f.c.requireTask(t.id).state, 'cancelled');
  assert.equal(f.c.runs()[0]?.id, r.id);
  f.store.close();
});

test('native negative schedule receipts never become a successful task control or model completion', async () => {
  const f = fixture();
  try {
    const task = await f.c.create(input);
    f.scheduler.edit = async ({ id }) => ({ id, code: 'schedule_conflict' });
    const api = createApi(f.c, f.memory, f.notices);
    const response = await api(
      new Request('https://host.test/api/always-on', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'task.control', data: { id: task.id, state: 'paused' } }),
      }),
    );
    assert.equal(response.status, 400);
    assert.equal((await response.json()).code, 'schedule_not_confirmed');
    assert.equal(f.c.requireTask(task.id).state, 'error');
    assert.equal(f.c.claim(task.id, 'must-not-run', 's', 1), undefined);
    f.scheduler.edit = async ({ id }) => ({ id, status: 'active' });
    await f.c.control(task.id, 'active');
    assert.equal(f.c.requireTask(task.id).error, undefined);
    f.scheduler.run = async ({ id }) => ({ id, code: 'schedule_execution_pending' });
    await assert.rejects(() => f.c.runNow(task.id), /did not confirm/);
    assert.equal(f.c.runs().length, 0);
    f.scheduler.edit = async ({ id }) => ({ id, status: 'ended' });
    await assert.rejects(() => f.c.control(task.id, 'active'), /did not confirm/);
    assert.equal(f.c.requireTask(task.id).state, 'error');
  } finally {
    f.store.close();
  }
});
test('recent snapshots and task projections retain the full ledger while returning bounded ordered views', async () => {
  const f = fixture();
  try {
    const task = await f.c.create({ ...input, maxRuns: 1000 });
    for (let i = 0; i < 305; i++)
      f.store.run('history-' + i, task.id, 'occurrence-' + i, {
        id: 'history-' + i,
        taskId: task.id,
        occurrence: 'occurrence-' + i,
        sessionId: 'session-' + i,
        status: 'completed',
        attempt: 1,
        startedAt: new Date().toISOString(),
        steps: 1,
      });
    assert.equal(f.c.runs().length, 305);
    assert.equal(f.c.taskRuns(task.id, 20).length, 20);
    assert.equal(f.c.taskRuns(task.id, 20)[0]?.id, 'history-304');
    const api = createApi(f.c, f.memory, f.notices);
    const data = await (await api(new Request('https://host.test/api/always-on'))).json();
    assert.equal(data.runs.length, 200);
    assert.equal(data.runs[0].id, 'history-304');
    assert.equal(data.runs.at(-1).id, 'history-105');
    assert.equal(f.c.runs().length, 305);
  } finally {
    f.store.close();
  }
});
