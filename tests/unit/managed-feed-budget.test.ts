import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GatewayStore } from '../../src/managed/store.js';
import { LiveFeed } from '../../src/managed/feed.js';
import { AccountBudget, installAccountPolicy } from '../../src/managed/policy.js';
test('paged durable cursor never skips retained changes; future/gapped cursors require reconciliation', () => {
  const s = new GatewayStore(':memory:');
  try {
    for (let n = 0; n < 450; n++) s.change('session', String(n));
    const a = s.changes(0),
      b = s.changes(a.revision),
      c = s.changes(b.revision);
    assert.equal(a.revision, 200);
    assert.equal(b.revision, 400);
    assert.equal(c.revision, 450);
    assert.equal(a.items.length + b.items.length + c.items.length, 450);
    assert.throws(() => s.changes(999));
  } finally {
    s.close();
  }
});
test('bound account hook limits simultaneous native turns and denies shell regardless of interactive task state (hook fixture)', async () => {
  const s = new GatewayStore(':memory:'),
    handlers = new Map<string, Function>(),
    cleanups: Function[] = [];
  let guard: (exec: { name: string }) => unknown = () => undefined;
  const ctx = {
    tools: {
      guard: (fn: typeof guard) => {
        guard = fn;
      },
    },
    on: (name: string, fn: Function) => {
      handlers.set(name, fn);
    },
    effect: (setup: () => Function) => {
      cleanups.push(setup());
    },
  };
  try {
    s.db.prepare("INSERT INTO meta VALUES('account_id','explicit-account-fixture')").run();
    installAccountPolicy(ctx as any, s);
    const agent = (id: string) => ({
        session: { id },
        options: { maxTokens: 8000 },
        cancel: () => {},
      }),
      a = agent('a'),
      b = agent('b'),
      c = agent('c');
    const enter = (agent: any) =>
      handlers.get('agent/pre-step')!({ agent, turn: 1 }, async () => ({
        kind: 'enter',
        messages: [],
      }));
    await enter(a);
    await enter(b);
    await assert.rejects(() => enter(c), /concurrent-turn/);
    assert.equal(a.options.maxTokens, 2048);
    assert.ok(guard({ name: 'shell' }));
    assert.equal(guard({ name: 'web_search' }), undefined);
    handlers.get('session/event')!(a.session, { type: 'turn/end', data: { turn: 1 } });
    await enter(c);
  } finally {
    for (const cleanup of cleanups) cleanup();
    s.close();
  }
});
test('transient native deltas are bounded, scoped and reset after process epochs or overflow', () => {
  const f = new LiveFeed(),
    start = f.read(undefined, 0);
  assert.equal(start.resetLive, true);
  f.publish('a', 'text-delta', { text: 'real frame' });
  f.publish('b', 'text-delta', { text: 'other session' });
  assert.equal(f.read(f.epoch, 0, 'a').frames.length, 1);
  assert.equal(f.read(f.epoch, 0, 'a').frames[0]!.sessionId, 'a');
  for (let i = 0; i < 1100; i++) f.publish('a', 'text-delta', { text: String(i) });
  assert.equal(f.read(f.epoch, 0).resetLive, true);
  assert.equal(new LiveFeed().read(f.epoch, 1).resetLive, true);
});
test('account quotas persist admission, cap turn time/steps and fail closed on unknown model usage', () => {
  const s = new GatewayStore(':memory:'),
    b = new AccountBudget(s, 12, 1000);
  try {
    for (let n = 0; n < 8; n++) b.admit('session-a', 1, 1000);
    assert.throws(() => b.admit('session-a', 1, 1001));
    assert.throws(() => b.admit('session-a', 1, 200000));
    b.usage('session-a', 10, { inputTokens: 800, outputTokens: 200 });
    b.usage('session-a', 10, { inputTokens: 800, outputTokens: 200 });
    assert.equal(b.status().tokens, 1000);
    assert.throws(() => b.admit('session-b', 1));
    b.usage('session-a', 11);
    assert.equal(b.status().usage_unknown, 1);
  } finally {
    s.close();
  }
});
