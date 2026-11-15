import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../../src/host/storage.js';
import { MemoryService } from '../../src/host/memory.js';
test('two devices cannot silently overwrite a consented memory revision; old JSON keeps its identity', () => {
  const store = new Store(':memory:'),
    memory = new MemoryService(store);
  try {
    assert.throws(() =>
      memory.save({
        id: '',
        kind: 'fact',
        content: 'Invalid identity',
        source: 'User',
        consent: true,
      }),
    );
    const first = memory.save({
      kind: 'project',
      content: 'Original confirmed context',
      source: 'User',
      consent: true,
    });
    const updated = memory.save({
      id: first.id,
      kind: 'project',
      content: 'Desktop edit',
      source: 'User',
      consent: true,
      expectedVersion: 1,
    });
    assert.equal(updated.version, 2);
    assert.throws(
      () =>
        memory.save({
          id: first.id,
          kind: 'project',
          content: 'Stale phone edit',
          source: 'User',
          consent: true,
          expectedVersion: 1,
        }),
      /another device/,
    );
    assert.equal(memory.list()[0]!.content, 'Desktop edit');
    store.put('memory', 'legacy', {
      id: 'legacy',
      kind: 'preference',
      content: 'Existing saved preference',
      source: 'User',
      consent: true,
      updatedAt: '2026-01-01T00:00:00Z',
    });
    const upgraded = memory.save({
      id: 'legacy',
      kind: 'preference',
      content: 'Confirmed update',
      source: 'User',
      consent: true,
      expectedVersion: 0,
    });
    assert.equal(upgraded.id, 'legacy');
    assert.equal(upgraded.version, 1);
    memory.remove(first.id);
    assert.equal(memory.search('Desktop edit').length, 0);
  } finally {
    store.close();
  }
});

test('approved entries and proposals share the same quota, including explicit new IDs; deletion frees capacity', () => {
  const store = new Store(':memory:'),
    memory = new MemoryService(store);
  const input = {
    kind: 'fact',
    content: 'User-owned fact',
    source: 'Explicit consent',
    consent: true,
  };
  try {
    for (let n = 0; n < 499; n++)
      store.put('memory', 'existing-' + n, {
        ...input,
        id: 'existing-' + n,
        version: 1,
        updatedAt: new Date().toISOString(),
      });
    const proposal = memory.propose({
      kind: 'preference',
      content: 'Needs confirmation',
      source: 'Agent suggestion',
    });
    assert.equal(proposal.consent, false);
    assert.equal(memory.list().length, 500);
    assert.throws(
      () => memory.propose({ kind: 'fact', content: 'Overflow', source: 'Suggestion' }),
      /Memory limit/,
    );
    assert.throws(() => memory.save({ ...input, id: 'arbitrary-new-id' }), /Memory limit/);
    assert.throws(() => memory.save(input), /Memory limit/);
    const confirmed = memory.save({ ...input, id: proposal.id, expectedVersion: 0 });
    assert.equal(confirmed.consent, true);
    assert.equal(memory.list().length, 500);
    memory.save({ ...input, id: 'existing-0', expectedVersion: 1 });
    assert.equal(memory.remove('existing-1'), true);
    memory.propose({ kind: 'fact', content: 'New suggestion within quota', source: 'Agent' });
    assert.equal(memory.list().length, 500);
  } finally {
    store.close();
  }
});
test('a model proposal cannot select an existing memory ID or consent/revision policy', () => {
  const store = new Store(':memory:'),
    memory = new MemoryService(store);
  try {
    const input = { kind: 'fact', content: 'Suggestion', source: 'Agent' };
    for (const extra of [{ id: 'existing' }, { consent: true }, { expectedVersion: 1 }])
      assert.throws(() => memory.propose({ ...input, ...extra }));
    assert.equal(memory.list().length, 0);
  } finally {
    store.close();
  }
});
