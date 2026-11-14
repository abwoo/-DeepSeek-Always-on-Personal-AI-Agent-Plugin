import { test } from 'node:test';
import assert from 'node:assert/strict';
import { conversationRows } from '../../src/desktop/messages.js';

test('native conversation shows a durable input receipt without pretending it is a model reply', () => {
  const message = { id: 'input-1', source: { kind: 'user', rpcId: 'request-1' }, content: [{ type: 'text', text: 'Check my task' }] };
  const receipt = { type: 'agent/inbox/spliced', seq: 3, data: { inserted: [message] } };
  const pending = conversationRows([receipt]);
  assert.deepEqual(pending.map((row) => [row.role, row.text]), [['received', 'Check my task']]);
  const consumed = conversationRows([receipt, { type: 'user/message', seq: 7, data: message }]);
  assert.deepEqual(consumed.map((row) => [row.role, row.text]), [['you', 'Check my task']]);
});
