import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../../src/host/storage.js';
import { MemoryService } from '../../src/host/memory.js';
test('two devices cannot silently overwrite a consented memory revision; old JSON keeps its identity', () => {
  const store = new Store(':memory:'),
    memory = new MemoryService(store);
  try {
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
