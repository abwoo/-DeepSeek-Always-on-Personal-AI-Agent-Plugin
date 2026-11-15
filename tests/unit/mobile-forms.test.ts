import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { intervalSeconds, taskTiming } = createRequire(import.meta.url)(
  '../../apps/mobile/forms.ts',
);
test('mobile timing forms reject invalid/offline-time inputs before mutation admission and preserve the IANA timezone', () => {
  for (const value of ['', '0', '-1', 'NaN', 'Infinity', '525601', '0.5'])
    assert.throws(() => intervalSeconds(value), /Enter an interval/);
  assert.equal(intervalSeconds('1.5'), 90);
  assert.equal(intervalSeconds('525600'), 31536000);
  const future = new Date(Date.now() + 86400000);
  assert.deepEqual(taskTiming('once', '', future), { kind: 'at', at: future.toISOString() });
  assert.throws(() => taskTiming('once', '', new Date(0)), /future time/);
  assert.throws(() => taskTiming('daily', '', new Date('invalid')), /valid date/);
  const daily = taskTiming('daily', '', future, 'Asia/Shanghai');
  assert.equal(daily.kind, 'daily');
  if (daily.kind === 'daily') assert.equal(daily.daily.time_zone, 'Asia/Shanghai');
});
