import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Context } from '@deepseek-ai/cordis';
import {
  renderReminderFraming,
  renderRecurringReminderBatchFraming,
} from '@deepseek-ai/dsh-schedule';
import { triggers, marker } from '../../src/host/tasks.js';
import { Store } from '../../src/host/storage.js';
import { MemoryService } from '../../src/host/memory.js';
import { defineTool } from '@deepseek-ai/dsh-tools';
test('published native Schedule rendering matches the adapter, no private patch required', () => {
  const id = '12345678-1234-1234-1234-123456789abc';
  const record = {
    id: 'schedule-test' as never,
    scheduledAt: '2026-11-14T00:00:00.000Z',
    prompt: `${marker} ${id}\nManaged trigger`,
  };
  assert.equal(triggers(renderReminderFraming(record))[0]?.taskId, id);
  assert.equal(
    triggers(renderRecurringReminderBatchFraming([{ record, occurrenceAt: record.scheduledAt }]))[0]
      ?.taskId,
    id,
  );
});
test('real Cordis plugin registers and releases a service on disposal', async () => {
  const ctx = new Context();
  let disposed = false;
  await ctx.plugin({
    name: 'lifecycle-proof',
    apply(scope) {
      scope.effect(() => () => {
        disposed = true;
      });
    },
  });
  await ctx.fiber.dispose();
  assert.equal(disposed, true);
});
test('native defineTool accepts a plugin tool with canonical output', async () => {
  const tool = defineTool({
    name: 'always_on_contract',
    description: 'Contract proof',
    parameters: { query: { type: 'string', required: true } },
    output: { schema: { type: 'string' }, render: (_a, v) => [{ type: 'text', text: v }] },
    execute: async ({ query }) => query,
  });
  assert.equal(tool.name, 'always_on_contract');
});
