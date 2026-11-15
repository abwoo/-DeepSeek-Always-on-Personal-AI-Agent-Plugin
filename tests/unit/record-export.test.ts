import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, statSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Store } from '../../src/host/storage.js';
import { GatewayStore } from '../../src/managed/store.js';
import { RecordExports } from '../../src/managed/exports.js';
import { writeRecordExport } from '../../src/shared/export-contract.js';
import { boundedText } from '../../src/control/http.js';
function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'ao-export-')),
    core = new Store(':memory:'),
    gateway = new GatewayStore(':memory:');
  let now = Date.now();
  const exports = new RecordExports(join(dir, 'exports'), core, gateway, () => now);
  return {
    dir,
    core,
    gateway,
    exports,
    advance: () => {
      now += 300001;
    },
    close: () => {
      exports.close();
      core.close();
      gateway.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}
test('large UTF-8 record export is complete, bounded, immutable, device-scoped, private and ephemeral', async () => {
  const f = fixture(),
    device = randomUUID(),
    other = randomUUID();
  try {
    f.core.transaction(() => {
      for (let n = 0; n < 310; n++)
        f.core.put('memory', 'm-' + n, {
          id: 'm-' + n,
          content: '研究'.repeat(1800),
          consent: n % 2 === 0,
        });
    });
    const first = f.exports.start(device);
    assert.ok(first.pages > 20);
    assert.equal(statSync(join(f.dir, 'exports', first.exportId)).mode & 0o777, 0o700);
    assert.equal(statSync(join(f.dir, 'exports', first.exportId, '0')).mode & 0o777, 0o600);
    assert.throws(() => f.exports.read(other, first.next!), /export_expired/);
    assert.throws(
      () => f.exports.read(device, first.next!.replace(/\.[^.]+\./, '.' + 'A'.repeat(43) + '.')),
      /export_expired/,
    );
    f.core.delete('memory', 'm-309');
    f.core.put('memory', 'm-0', { id: 'm-0', content: 'new edit' });
    const chunks: string[] = [];
    let largest = 0;
    const result = await writeRecordExport(
      async (path, body) => {
        if (path === '/exports') return first;
        if (path === '/exports/release') {
          f.exports.release(device, body.exportId);
          return { ok: true };
        }
        const p = f.exports.read(device, new URL('https://x' + path).searchParams.get('cursor')!);
        largest = Math.max(largest, Buffer.byteLength(JSON.stringify(p)));
        return p;
      },
      async (text) => {
        chunks.push(text);
      },
    );
    const value = chunks.join('');
    assert.ok(Buffer.byteLength(value) > 3 * 1024 * 1024);
    assert.ok(largest < 140 * 1024);
    const lines = value
      .trim()
      .split('\n')
      .map((x) => JSON.parse(x));
    assert.equal(lines.at(-1).complete, true);
    assert.equal(result.records, 310);
    assert.equal(new Set(lines.slice(1, -1).map((x) => x.id)).size, 310);
    assert.ok(lines.some((x) => x.id === 'm-309'));
    assert.equal(lines.find((x) => x.id === 'm-0').data.content, '研究'.repeat(1800));
    assert.equal(value.includes('token_hash'), false);
    assert.deepEqual(readdirSync(join(f.dir, 'exports')), []);
    assert.throws(() => f.exports.read(device, first.next!), /export_expired/);
    const expiring = f.exports.start(device);
    f.advance();
    assert.throws(() => f.exports.read(device, expiring.next!), /export_expired/);
    assert.deepEqual(readdirSync(join(f.dir, 'exports')), []);
  } finally {
    f.close();
  }
});
test('snapshot capacity/oversized records fail explicitly; restart never retains private export copies', () => {
  const f = fixture();
  try {
    f.core.put('memory', 'large', { id: 'large', content: 'x'.repeat(140 * 1024) });
    assert.throws(() => f.exports.start('a'), /export_record_too_large/);
    assert.deepEqual(readdirSync(join(f.dir, 'exports')), []);
    f.core.delete('memory', 'large');
    f.exports.start('a');
    f.exports.start('b');
    f.exports.start('c');
    f.exports.start('d');
    assert.throws(() => f.exports.start('e'), /export_busy/);
    const replacement = new RecordExports(join(f.dir, 'exports'), f.core, f.gateway);
    assert.deepEqual(readdirSync(join(f.dir, 'exports')), []);
    replacement.close();
  } finally {
    f.close();
  }
});
test('client never writes completion for missing/reordered pages, changed manifests or cancellation', async () => {
  const f = fixture();
  try {
    for (let n = 0; n < 101; n++)
      f.core.put('memory', 'm-' + n, { id: 'm-' + n, content: 'entry' });
    for (const fault of ['index', 'records', 'cancel']) {
      const first = f.exports.start('device'),
        out: string[] = [];
      let alive = true,
        released = false;
      await assert.rejects(() =>
        writeRecordExport(
          async (path, body) => {
            if (path === '/exports') return first;
            if (path === '/exports/release') {
              released = true;
              f.exports.release('device', body.exportId);
              return {};
            }
            const p = f.exports.read(
              'device',
              new URL('https://x' + path).searchParams.get('cursor')!,
            );
            return {
              ...p,
              ...(fault === 'index' ? { index: 0 } : fault === 'records' ? { records: 102 } : {}),
            };
          },
          async (text) => {
            out.push(text);
            if (fault === 'cancel') alive = false;
          },
          () => alive,
        ),
      );
      assert.equal(released, true);
      assert.equal(out.join('').includes('"complete":true'), false);
    }
  } finally {
    f.close();
  }
});
test('controller cancels an oversized upstream response while streaming, including UTF-8 byte accounting', async () => {
  let pulls = 0,
    cancelled = false;
  const response = new Response(
    new ReadableStream({
      pull(c) {
        pulls++;
        c.enqueue(new Uint8Array(4096));
      },
      cancel() {
        cancelled = true;
      },
    }),
  );
  await assert.rejects(() => boundedText(response, 8192), /agent_response_too_large/);
  assert.equal(cancelled, true);
  assert.ok(pulls <= 5);
  assert.equal(await boundedText(new Response('研究'), 6), '研究');
  await assert.rejects(() => boundedText(new Response('研究'), 5), /agent_response_too_large/);
});

test('paged snapshots preserve full projections, coexist with exports and reject cursor scope mixing', async () => {
  const f = fixture();
  try {
    f.core.put('memory', 'm', { id: 'm', content: 'Raw retained memory' });
    const state = {
      authorityId: f.gateway.authorityId,
      ownerId: f.gateway.ownerId,
      revision: 7,
      serverTime: new Date().toISOString(),
      online: true,
      tasks: [],
      runs: [],
      inbox: [],
      goals: [],
      memories: Array.from({ length: 110 }, (_, i) => ({
        id: 'view-' + i,
        kind: 'fact',
        content: 'Projected memory',
        source: 'User',
        consent: true,
        updatedAt: new Date().toISOString(),
      })),
    };
    const snapshot = f.exports.start('a', state),
      exported = f.exports.start('a');
    assert.ok(snapshot.next);
    assert.ok(snapshot.snapshot);
    assert.equal(exported.snapshot, undefined);
    assert.throws(() => f.exports.read('a', snapshot.next!), /export_expired/);
    assert.equal(f.exports.read('a', snapshot.next!, true).snapshot?.revision, 7);
    let releases = 0;
    const { ManagedClient } = await import('../../src/shared/managed-client.js');
    const deviceId = randomUUID();
    const client = new ManagedClient(
      'https://fixture.test',
      {
        authorityId: f.gateway.authorityId,
        ownerId: f.gateway.ownerId,
        deviceId,
        token: 'ao_' + deviceId + '.' + 'A'.repeat(43),
        expiresAt: new Date(Date.now() + 100000).toISOString(),
      },
      undefined,
      false,
      async (input, init) => {
        const u = new URL(String(input));
        if (u.pathname.endsWith('/snapshot'))
          return Response.json({ error: 'snapshot_pagination_required' }, { status: 413 });
        if (u.pathname.endsWith('/exports/release')) {
          releases++;
          f.exports.release('a', JSON.parse(String(init?.body)).exportId);
          return Response.json({ ok: true });
        }
        if (u.search)
          return Response.json(f.exports.read('a', u.searchParams.get('cursor')!, true));
        return Response.json(f.exports.start('a', state));
      },
    );
    const read = await client.snapshot();
    assert.equal(read.memories.length, 110);
    assert.equal(read.revision, 7);
    assert.equal(releases, 1);
    assert.equal(read.memories.at(-1)?.id, 'view-109');
  } finally {
    f.close();
  }
});

test('expensive export capture has a distinct device/account limit without invalidating a retained cursor', () => {
  const f = fixture();
  try {
    for (let i = 0; i < 101; i++)
      f.core.put('memory', 'm-' + i, { id: 'm-' + i, content: 'User record' });
    f.exports.start('a');
    f.exports.start('a');
    const retained = f.exports.start('a');
    assert.throws(() => f.exports.start('a'), /export_rate_limit/);
    assert.ok(f.exports.read('a', retained.next!).items.length);
    assert.ok(f.exports.start('b').exportId);
  } finally {
    f.close();
  }
});
