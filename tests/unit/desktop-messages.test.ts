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

test('native skill catalogs and producer-declared model context do not appear as chat', () => {
  const events = [
    { type: 'user/message', seq: 1, data: { id: 'catalog', source: { kind: 'skill-catalog', form: 'catalog', entries: [] }, content: [{ type: 'text', text: '<system-reminder>A skill is a reusable set of task-specific instructions.</system-reminder>' }] } },
    { type: 'user/message', seq: 2, data: { id: 'instructions', source: { kind: 'skill-invocation', form: 'instructions' }, content: 'Internal skill instructions' } },
    { type: 'user/message', seq: 3, data: { id: 'snapshot', source: { kind: 'user-approval', form: 'snapshot', sections: [] }, content: 'Internal execution policy' } },
    { type: 'user/message', seq: 4, data: { id: 'notice', source: { kind: 'schedule', form: 'notice', summary: 'Reminder delivered' }, content: '<system-reminder>Internal reminder framing</system-reminder>' } },
    { type: 'user/message', seq: 5, data: { id: 'opaque', source: { kind: 'future-producer' }, content: 'Undeclared context remains readable' } },
    { type: 'user/message', seq: 6, data: { id: 'quote', source: { kind: 'user' }, content: '<system-reminder>My quoted example</system-reminder>' } },
    { type: 'assistant/message', seq: 7, data: { message: { id: 'answer', source: { kind: 'model' }, content: 'The actual model answer' } } },
  ];
  const before = JSON.stringify(events);
  assert.deepEqual(conversationRows(events).map(row => [row.role, row.text]), [
    ['context', 'Reminder delivered'],
    ['context', 'Undeclared context remains readable'],
    ['you', '<system-reminder>My quoted example</system-reminder>'],
    ['assistant', 'The actual model answer'],
  ]);
  assert.equal(JSON.stringify(events), before);
});

test('runtime-context snapshots stay in history without crowding the product conversation', () => {
  const events = [
    { type: 'user/message', seq: 1, data: { id: 'runtime', source: { kind: 'runtime-context' }, content: [{ type: 'text', text: '<system-reminder>Server path /private/host and internal tool policy</system-reminder>' }] } },
    { type: 'user/message', seq: 2, data: { id: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: '<system-reminder>This is my quoted example</system-reminder>' }] } },
    { type: 'assistant/message', seq: 3, data: { message: { id: 'reply', content: [{ type: 'text', text: 'Your real reply' }] } } },
  ];
  const before = JSON.stringify(events);
  assert.deepEqual(conversationRows(events).map((row) => [row.role, row.text]), [
    ['you', '<system-reminder>This is my quoted example</system-reminder>'],
    ['assistant', 'Your real reply'],
  ]);
  assert.equal(JSON.stringify(events), before);
});
