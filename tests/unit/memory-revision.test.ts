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

test('deleted legacy/proposed version-zero memory cannot be resurrected by a stale consent/edit form', () => {
  const s = new Store(':memory:'),
    m = new MemoryService(s);
  try {
    const proposal = m.propose({
      kind: 'fact',
      content: 'Proposed fact',
      source: 'Agent suggestion',
    });
    m.remove(proposal.id);
    assert.throws(
      () =>
        m.save({
          id: proposal.id,
          kind: 'fact',
          content: 'Stale confirmation',
          source: 'User',
          consent: true,
          expectedVersion: 0,
        }),
      /another device/,
    );
    assert.equal(m.list().length, 0);
    assert.equal(m.search('fact').length, 0);
  } finally {
    s.close();
  }
});

test('Chinese cross-session lookup uses word boundaries and consent; full-width terms normalize without a domain dictionary', () => {
  const s = new Store(':memory:'),
    m = new MemoryService(s);
  try {
    const saved = m.save({
      kind: 'preference',
      content: '用户喜欢喝乌龙茶。',
      source: 'User consent',
      consent: true,
    });
    m.propose({
      kind: 'preference',
      content: '用户喜欢喝咖啡。',
      source: 'Unconfirmed suggestion',
    });
    assert.equal(m.search('我喜欢喝什么饮品？')[0]?.id, saved.id);
    assert.equal(m.search('咖啡').length, 0);
    const project = m.save({
      kind: 'project',
      content: 'EEG project context',
      source: 'User consent',
      consent: true,
    });
    assert.equal(m.search('ＥＥＧ')[0]?.id, project.id);
    m.remove(saved.id);
    assert.equal(m.search('乌龙茶').length, 0);
  } finally {
    s.close();
  }
});
