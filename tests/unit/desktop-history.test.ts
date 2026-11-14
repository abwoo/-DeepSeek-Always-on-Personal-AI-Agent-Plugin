import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { PairedDesktop } from '../../src/desktop/device.js';
import type { ManagedClient } from '../../src/shared/managed-client.js';
import { resultBeforeSeq } from '../../src/shared/managed-client.js';
test('Desktop historical reader binds the requested Run ID to its native Session boundary (transport fixture)', async () => {
  assert.throws(
    () =>
      resultBeforeSeq({
        sessionId: 'session-history',
        finishedAt: new Date().toISOString(),
        resultReference: 'session:another-session#event:42',
      }),
    /no verified historical/,
  );
  const run = {
    id: randomUUID(),
    sessionId: 'session-history',
    resultReference: 'session:session-history#event:42',
    status: 'completed',
  };
  const calls: unknown[] = [];
  class Reader extends PairedDesktop {
    constructor() {
      super({} as any);
    }
    protected override async client() {
      return {
        request: async (path: string) => {
          assert.equal(path, '/runs/' + run.id);
          return run;
        },
        readSession: async (sessionId: string, beforeSeq: number) => {
          calls.push({ sessionId, beforeSeq });
          return {
            sessionId,
            events: { records: [], cursor: 42 },
            state: { running: false, pendingInput: [] },
          };
        },
      } as unknown as ManagedClient;
    }
    override async status() {
      return {
        authority: 'https://fixture.invalid',
        authorityId: randomUUID(),
        deviceId: randomUUID(),
        configured: true,
        connected: true,
        credentialMode: 'account',
        devicePairingReady: false,
        mvpReady: false,
      };
    }
  }
  const reader = new Reader();
  try {
    const result = await reader.session({ action: 'run.read', runId: run.id });
    assert.equal(result.run.id, run.id);
    assert.deepEqual(calls, [{ sessionId: 'session-history', beforeSeq: 43 }]);
  } finally {
    await reader.dispose();
  }
});
