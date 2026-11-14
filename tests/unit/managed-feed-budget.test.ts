import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GatewayStore } from '../../src/managed/store.js';
import { LiveFeed } from '../../src/managed/feed.js';
import { AccountBudget } from '../../src/managed/policy.js';
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
