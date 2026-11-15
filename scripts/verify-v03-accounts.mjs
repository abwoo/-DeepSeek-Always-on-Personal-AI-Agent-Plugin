import { serveNativeFixture } from './serve-native-fixture.mjs';
import { verifyMobileContract } from './verify-mobile-contract.mjs';
// Level 2: two actual published Harness processes. Identity is an explicitly labeled local adapter fixture.
// Never substitutes for a live Auth0 tenant, real model output or physical-device acceptance.
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, rm, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { ControlStore, secret, challenge } from '../dist/control/store.js';
import { AgentPool } from '../dist/control/pool.js';
import { controlServer } from '../dist/control/server.js';
import { AccountApi, AccountManagedClient } from '../dist/shared/account-client.js';
import { ManagedClient } from '../dist/shared/managed-client.js';
const nativeFixture = process.argv.includes('--native-fixture');
const productOrigin = nativeFixture ? 'https://127.0.0.1:8443' : 'https://service-fixture.invalid';
const root = await mkdtemp(join(tmpdir(), 'always-on-v03-')),
  cli = resolve('node_modules/@deepseek-ai/dsh/lib/bin.js');
const authorities = [];
let controller, store, base, pool, currentSlots;
let unavailableRegistration = true;
const registrationAttempts = [];
const encryption = randomBytes(32).toString('base64');
async function authority(index) {
  const provisioningKey = secret(),
    dir = join(root, 'agent-' + index);
  const env = {
    ...process.env,
    DSH_HOME: join(dir, 'profile'),
    ALWAYS_ON_DATA_DIR: join(dir, 'data'),
    ALWAYS_ON_DOCUMENTS_DIR: join(dir, 'documents'),
    ALWAYS_ON_GATEWAY_ALLOW_LOOPBACK: '1',
    ALWAYS_ON_ACCOUNT_EXECUTION_REQUIRED: '1',
    ALWAYS_ON_PROVISIONING_KEY: provisioningKey,
    ALWAYS_ON_FIXTURE_TRACE: join(dir, 'model-calls.log'),
  };
  const run = (args) =>
    promisify(execFile)(process.execPath, [cli, ...args], { env, timeout: 120000 });
  for (const file of [
    'abwoo-deepseek-always-on-0.1.0-alpha.2.tgz',
    'abwoo-deepseek-always-on-managed-0.2.0-dev.1.tgz',
  ])
    await run(['plugin', '--profile', 'web', 'add', resolve(file)]);
  const patch = join(dir, 'runtime.yml');
  await mkdir(dir, { recursive: true });
  await writeFile(
    patch,
    (await readFile('deploy/headless.patch.yml', 'utf8')) +
      `\n- id: agent-default-model\n  config:\n    provider: always-on-test\n    model: fixture\n- insert:\n    - id: suspension-fixture-model\n      name: '${resolve('tests/fixtures/model.mjs')}'\n`,
  );
  const child = spawn(
    process.execPath,
    [cli, 'web', '--patch', patch, '--no-open', '--port', '0'],
    { env, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  const entry = { child };
  authorities.push(entry);
  const url = await new Promise((ok, bad) => {
    let log = '';
    const timer = setTimeout(() => bad(Error('Real Harness startup timeout')), 60000);
    const observe = (c) => {
      log += c;
      const m = log.match(/dsh web: (http:\/\/127\.0\.0\.1:\d+\/\?token=[^\s]+)/);
      if (m) {
        clearTimeout(timer);
        ok(new URL(m[1]));
      }
    };
    child.stdout.on('data', observe);
    child.stderr.on('data', observe);
    child.once('exit', () => {
      clearTimeout(timer);
      bad(Error('Real Harness terminated during startup; owner log withheld'));
    });
  });
  return { id: 'agent-' + index, origin: url.origin, provisioningKey };
}
const identity = {
  issuer: 'https://identity-fixture.invalid/',
  authorize: async (x) => 'https://identity-fixture.invalid/authorize?state=' + x.state,
  exchange: async (x) => ({
    issuer: 'https://identity-fixture.invalid/',
    subject: x.callback.searchParams.get('code'),
    refreshToken: 'explicit-local-identity-fixture',
  }),
  refresh: async (_, subject) => ({
    issuer: 'https://identity-fixture.invalid/',
    subject,
    refreshToken: 'explicit-local-identity-fixture-rotated',
  }),
  revoke: async () => {},
};
async function boot(slots) {
  store = new ControlStore(join(root, 'accounts.sqlite'), encryption);
  const leafTransport = async (input, init) => {
    if (String(input).endsWith('/operator/device')) {
      registrationAttempts.push(JSON.parse(String(init.body)).id);
      if (unavailableRegistration) {
        unavailableRegistration = false;
        const committed = await fetch(input, init);
        assert.equal(committed.status, 200);
        await committed.arrayBuffer();
        // The actual Harness leaf committed. Lose only its acknowledgement;
        // retry must reuse the durable device plan rather than create another.
        return Response.json({ error: 'injected_temporary_unavailability' }, { status: 503 });
      }
    }
    return fetch(input, init);
  };
  currentSlots = slots;
  pool = new AgentPool(store, slots, true, leafTransport);
  controller = controlServer(store, pool, identity, {
    publicOrigin: productOrigin,
    mobileRedirect: 'deepseek-always-on://oauth/return',
    allowLoopback: true,
  });
  await new Promise((r) => controller.server.listen(0, '127.0.0.1', r));
  base = 'http://127.0.0.1:' + controller.server.address().port;
}
const transport = async (input, init) => {
  const r = await fetch(String(input).replace(productOrigin, base), init);
  return new Response(await r.text(), { status: r.status, headers: r.headers });
};
const api = new AccountApi(productOrigin, transport);
async function login(subject, name = 'Real Harness protocol observer') {
  const verifier = secret(),
    start = await api.start({
      challenge: challenge(verifier),
      name,
      platform: 'other',
    });
  const state = new URL(start.authorizeUrl).searchParams.get('state');
  const r = await fetch(base + '/account/v1/callback?state=' + state + '&code=' + subject);
  assert.equal(r.status, 200);
  let result = await api.complete(start.loginId, verifier);
  if (result.state === 'provisioning') {
    result = await api.complete(start.loginId, verifier);
    assert.equal(registrationAttempts[0], registrationAttempts[1]);
  }
  assert.equal(result.state, 'ready', JSON.stringify(result));
  return result.connection;
}
const client = (c) => new ManagedClient(c.origin, c.credentials, undefined, false, transport);
async function until(check, timeout = 20000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw Error('Actual Harness policy/model observation timed out');
}
function internalClient(connection) {
  const d = store.db
    .prepare('SELECT * FROM devices WHERE id=?')
    .get(connection.credentials.deviceId);
  const slot = currentSlots.find((s) => s.id === d.slot_id);
  const secret = store.open(d.secret, 'device');
  return new ManagedClient(
    slot.origin,
    { ...connection.credentials, token: secret.upstreamToken },
    undefined,
    true,
  );
}
async function calls(index = 0) {
  const text = await readFile(join(root, 'agent-' + index, 'model-calls.log'), 'utf8').catch(
    () => '',
  );
  return text.trim() ? text.trim().split('\n').length : 0;
}
async function execution(connection) {
  const row = store.allocation(connection.account.id);
  return pool.operator(pool.slot(row.slot_id), 'inspect');
}
async function deniedInput(connection, label, index = 0) {
  const native = internalClient(connection),
    before = await calls(index);
  const made = await native.mutate(randomUUID(), {
    action: 'session.create',
    data: { creationId: 'denial-' + randomUUID() },
  });
  const sessionId = made.result.sessionId;
  await native.mutate(randomUUID(), { action: 'session.prompt', data: { sessionId, text: label } });
  await until(async () => {
    const state = await native.readSession(sessionId);
    return !state.state.running && state.state.pendingInput.length === 0;
  });
  await new Promise((r) => setTimeout(r, 300));
  assert.equal(await calls(index), before, 'Denied authority started another native model request');
}

try {
  const slots = [await authority(0), await authority(1)];
  await boot(slots);
  if(nativeFixture) {
    const nativeConnection=await login('alice','Native engineering device');
    const observerConnection=await login('alice','Independent native QA observer');
    const observer=new AccountManagedClient(observerConnection,async()=>{},undefined,transport);
    await serveNativeFixture({base,connection:nativeConnection,observer});
  } else {
  const a = await login('alice'),
    phone = await login('alice'),
    b = await login('bob');
  assert.equal(a.credentials.authorityId, phone.credentials.authorityId);
  assert.notEqual(a.credentials.authorityId, b.credentials.authorityId);
  assert.notEqual(a.credentials.ownerId, b.credentials.ownerId);
  const desktop = client(a),
    mobile = client(phone),
    other = client(b),
    id = randomUUID();
  const created = await desktop.mutate(id, {
    action: 'task.create',
    data: {
      title: 'Account isolation proof',
      instruction: 'Deterministic test adapter only; not real DeepSeek research.',
      timing: { kind: 'every', every_seconds: 86400 },
      allowedTools: [],
    },
  });
  assert.deepEqual(
    await desktop.mutate(id, {
      action: 'task.create',
      data: {
        title: 'Account isolation proof',
        instruction: 'Deterministic test adapter only; not real DeepSeek research.',
        timing: { kind: 'every', every_seconds: 86400 },
        allowedTools: [],
      },
    }),
    created,
  );
  const task = (await mobile.snapshot()).tasks.find((t) => t.title === 'Account isolation proof');
  assert.ok(task);
  assert.equal((await other.snapshot()).tasks.length, 0);
  await assert.rejects(() =>
    other.mutate(randomUUID(), {
      action: 'task.control',
      data: { id: task.id, state: 'cancelled' },
    }),
  );
  assert.equal((await desktop.snapshot()).tasks[0].state, 'active');
  const memory = await mobile.mutate(randomUUID(), {
    action: 'memory.save',
    data: {
      kind: 'project',
      content: 'Alice-only project',
      source: 'Explicit integration consent',
      consent: true,
    },
  });
  assert.ok((await desktop.snapshot()).memories.some((m) => m.content === 'Alice-only project'));
  assert.equal((await other.snapshot()).memories.length, 0);
  const savedMemory = (await desktop.snapshot()).memories.find(
    (m) => m.content === 'Alice-only project',
  );
  const editId = randomUUID(),
    editCommand = {
      action: 'memory.save',
      data: {
        id: savedMemory.id,
        kind: 'project',
        content: 'Desktop confirmed revision',
        source: 'Explicit consent',
        consent: true,
        expectedVersion: Number(savedMemory.version ?? 0),
      },
    };
  const editReceipt = await desktop.mutate(editId, editCommand);
  assert.deepEqual(await desktop.mutate(editId, editCommand), editReceipt);
  await assert.rejects(
    () =>
      mobile.mutate(randomUUID(), {
        action: 'memory.save',
        data: {
          id: savedMemory.id,
          kind: 'project',
          content: 'Stale phone revision',
          source: 'Explicit consent',
          consent: true,
          expectedVersion: Number(savedMemory.version ?? 0),
        },
      }),
    (error) => error.code === 'memory_conflict',
  );
  assert.equal(
    (await mobile.snapshot()).memories.find((m) => m.id === savedMemory.id).content,
    'Desktop confirmed revision',
  );

  const s = await desktop.mutate(randomUUID(), {
      action: 'session.create',
      data: { creationId: 'session-' + randomUUID() },
    }),
    sessionId = s.result.sessionId;
  const initial = await mobile.events({ after: (await mobile.snapshot()).revision }, sessionId);
  const waiting = mobile.events(
    { after: initial.revision, epoch: initial.epoch, live: initial.live },
    sessionId,
  );
  await desktop.mutate(randomUUID(), {
    action: 'session.prompt',
    data: {
      sessionId,
      text: 'Real account-backed native input receipt; deterministic adapter only.',
    },
  });
  const pulse = await waiting;
  assert.ok(pulse.revision > initial.revision || pulse.live > initial.live);
  assert.equal(pulse.authorityId, a.credentials.authorityId);
  assert.ok(
    JSON.stringify(await mobile.readSession(sessionId)).includes(
      'Real account-backed native input receipt',
    ),
  );
  await assert.rejects(() => other.readSession(sessionId));
  const goal = await mobile.createGoal(randomUUID(), {
    title: 'Bounded ongoing goal',
    instruction: 'Read-only authorized context',
    everySeconds: 86400,
    maxRuns: 2,
    allowedTools: [],
  });
  assert.equal((await desktop.snapshot()).goals[0].id, goal.result.id);
  assert.equal((await other.snapshot()).goals.length, 0);
  await desktop.mutate(randomUUID(), {
    action: 'memory.delete',
    data: { id: memory.result.result.id },
  });
  assert.equal((await mobile.snapshot()).memories.length, 0);
  // Exercise the restricted account proxy with >2 MiB of real persisted UTF-8
  // records. Each page remains bounded; a second device cannot reuse its cursor.
  const largeIds = [];
  for (let i = 0; i < 210; i++) {
    const saved = await desktop.mutate(randomUUID(), {
      action: 'memory.save',
      data: {
        kind: 'project',
        content: '研究'.repeat(1800),
        source: 'Explicit export integration fixture consent',
        consent: true,
      },
    });
    largeIds.push(saved.result.result.id);
  }
  assert.equal((await desktop.snapshot()).memories.length, 210);
  const exportStart = await desktop.request('/exports', {});
  assert.ok(exportStart.pages > 10);
  await assert.rejects(
    () => mobile.request('/exports?cursor=' + encodeURIComponent(exportStart.next)),
    (e) => e.code === 'export_expired' && e.status === 410,
  );
  await desktop.request('/exports/release', { exportId: exportStart.exportId });
  let exportBytes = 0,
    exportRecords = 0;
  await desktop.exportRecords(async (chunk) => {
    exportBytes += Buffer.byteLength(chunk);
    for (const line of chunk.trim().split('\n').filter(Boolean)) {
      const item = JSON.parse(line);
      if (item.kind === 'memory') exportRecords++;
    }
  });
  assert.ok(exportBytes > 2 * 1024 * 1024);
  assert.equal(exportRecords, 210);
  for (const id of largeIds)
    await desktop.mutate(randomUUID(), { action: 'memory.delete', data: { id } });
  // Execute through the native Schedule/Agent with a clearly labeled model fixture.
  await desktop.mutate(randomUUID(), { action: 'task.run', data: { id: task.id } });
  await until(async () =>
    (await desktop.snapshot()).runs.some((r) => r.taskId === task.id && r.status === 'completed'),
  );
  await desktop.mutate(randomUUID(), {
    action: 'task.control',
    data: { id: goal.result.taskId, state: 'paused' },
  });
  store.db.prepare('UPDATE accounts SET suspended=1 WHERE id=?').run(a.account.id);
  store.db
    .prepare("UPDATE allocations SET status='suspended' WHERE account_id=?")
    .run(a.account.id);
  // Observe the production controller timer, not a direct test-only policy call.
  // Closing the model gate precedes asynchronous native Schedule edits. Inspect
  // also reads the catalog before sampling the gate, so one observation may
  // legitimately contain the old catalog plus the new denied policy. Require
  // both independent conditions within the existing deadline; neither a denial
  // flag nor an HTTP acknowledgement alone proves that the schedule paused.
  let stopped;
  await until(async () => {
    stopped = await execution(a);
    return (
      !stopped.execution.enabled &&
      stopped.schedules.find((s) => s.taskId === task.id)?.status === 'paused'
    );
  });
  assert.equal(stopped.execution.enabled, false);
  assert.equal(stopped.schedules.find((s) => s.taskId === task.id).status, 'paused');
  await assert.rejects(
    () => desktop.snapshot(),
    (e) => e.code === 'account_suspended' && e.status === 403,
  );
  await deniedInput(a, 'Must not invoke a model while this account is suspended');
  const retained = await internalClient(a).snapshot();
  assert.equal(retained.tasks.find((t) => t.id === task.id).state, 'active');
  store.db.prepare('UPDATE accounts SET suspended=0 WHERE id=?').run(a.account.id);
  store.db.prepare("UPDATE allocations SET status='ready' WHERE account_id=?").run(a.account.id);
  await until(async () => (await execution(a)).execution.enabled);
  assert.equal(
    (await execution(a)).schedules.find((s) => s.taskId === goal.result.taskId).status,
    'paused',
  );
  assert.equal((await execution(a)).schedules.find((s) => s.taskId === task.id).status, 'active');
  // Native Schedule deliberately spaces new-Session deliveries of the same task
  // by 60 seconds, including manual runs. Use a distinct authorized task here;
  // independently verify the original schedule's restored ID/status above.
  const resumedTask = await desktop.mutate(randomUUID(), {
    action: 'task.create',
    data: {
      title: 'Post-resume native proof',
      instruction: 'Deterministic adapter after account resume',
      timing: { kind: 'every', every_seconds: 86400 },
      maxRuns: 1,
    },
  });
  const resumedId = resumedTask.result.result.id;
  await desktop.mutate(randomUUID(), { action: 'task.run', data: { id: resumedId } });
  await until(async () =>
    (await desktop.snapshot()).runs.some((r) => r.taskId === resumedId && r.status === 'completed'),
  );
  const auth = a.credentials.authorityId;
  await controller.close();
  await pool.syncExecution(a.account.id, 1);
  await new Promise((r) => setTimeout(r, 1500));
  assert.equal((await execution(a)).execution.enabled, false);
  await deniedInput(a, 'Must not invoke a model after control renewal stopped');
  store.close();
  await boot(slots);
  assert.equal((await mobile.snapshot()).authorityId, auth);
  assert.ok((await mobile.snapshot()).tasks.some((t) => t.id === task.id));
  await desktop.request('/devices/revoke', { deviceId: phone.credentials.deviceId });
  await assert.rejects(() => mobile.snapshot());
  await assert.rejects(() => api.refresh(phone));
  const again = await login('alice');
  assert.equal(again.credentials.authorityId, auth);
  assert.ok((await client(again).snapshot()).tasks.some((t) => t.id === task.id));
  const forbidden = await fetch(base + '/personal-agent/v1/operator/inspect');
  assert.equal(forbidden.status, 404);
  // Rotate through the actual controller, pause local secure-save completion,
  // then sign out while the background request is in flight.
  let releaseSave, enteredSave;
  const saving = new Promise((resolve) => {
    enteredSave = resolve;
  });
  const release = new Promise((resolve) => {
    releaseSave = resolve;
  });
  const expiring = {
    ...again,
    credentials: { ...again.credentials, expiresAt: new Date(0).toISOString() },
  };
  const managed = new AccountManagedClient(
    expiring,
    async () => {
      enteredSave();
      await release;
    },
    undefined,
    transport,
  );
  const rejected = assert.rejects(managed.snapshot(), /Sign-out is in progress/);
  await saving;
  const signingOut = managed.logout();
  releaseSave();
  await Promise.all([signingOut, rejected]);
  await assert.rejects(() => client(again).snapshot());
  assert.ok(
    !(await desktop.request('/devices')).items.some(
      (d) => d.id === again.credentials.deviceId && !d.revoked,
    ),
  );
  assert.equal((await client(b).snapshot()).authorityId, b.credentials.authorityId);
  const uiConnection = await login('alice', 'Mobile component UI device');
  const spare = await login('alice', 'Mobile component spare device');
  await verifyMobileContract({
    base,
    connection: uiConnection,
    observer: desktop,
    spare,
    otherAuthorityId: b.credentials.authorityId,
  });
  const bobTask = await other.mutate(randomUUID(), {
    action: 'task.create',
    data: {
      title: 'Cancellation fixture',
      instruction: 'FIXTURE_HANG',
      timing: { kind: 'every', every_seconds: 86400 },
      maxRuns: 1,
    },
  });
  const bobId = bobTask.result.result.id,
    beforeHang = await calls(1),
    bobNative = internalClient(b);
  await other.mutate(randomUUID(), { action: 'task.run', data: { id: bobId } });
  await until(async () => (await calls(1)) > beforeHang);
  store.db.prepare('UPDATE accounts SET suspended=1 WHERE id=?').run(b.account.id);
  await pool.syncExecution(b.account.id);
  await until(async () =>
    (await bobNative.snapshot()).runs.some((r) => r.taskId === bobId && r.finishedAt),
  );
  assert.ok(
    (await bobNative.snapshot()).runs
      .filter((r) => r.taskId === bobId)
      .every((r) => r.status !== 'completed'),
  );
  await mkdir('test-results', { recursive: true });
  await writeFile(
    'test-results/v03-accounts.json',
    JSON.stringify(
      {
        sourceCommit: process.env.GITHUB_SHA ?? 'local-working-tree',
        evidenceLevel: 2,
        identity: 'explicit local adapter fixture; not live Auth0',
        actualHarnessProcesses: 2,
        deterministicModelAdapter: true,
        nativeFixtureTaskCompletesBeforeAndAfterPause: true,
        persistedSuspensionPausesNativeSchedules: true,
        suspendedDirectInputCannotReachModelAdapter: true,
        controllerLossExpiresExecutionLease: true,
        expiredDirectInputCannotReachModelAdapter: true,
        explicitUserTaskPausePreservedOnAccountResume: true,
        activeNativeRequestCancellationObserved: true,
        largeUtf8ExportThroughRestrictedAccountProxy: true,
        exportCursorBoundToDevice: true,
        automaticIsolatedAllocation: true,
        temporaryRegistrationFailureRetriedSameDevice:
          registrationAttempts[0] === registrationAttempts[1],
        committedRegistrationAcknowledgementLossRecovered: true,
        rotationConcurrentLogoutRevokesLatestHandle: true,
        sameAccountTwoIndependentDevices: true,
        crossAccountSessionAndTaskDenied: true,
        sharedTask: true,
        sharedMemoryLifecycle: true,
        crossDeviceMemoryConflictRejected: true,
        sharedNativeSessionInput: true,
        actualNativeEventFeed: true,
        sharedGoal: true,
        mutationDeduplication: true,
        controllerRestartRetainsAuthority: true,
        deviceRevocationAndRelogin: true,
        realIdentityProvider: false,
        realDeepSeek: false,
        realPhone: false,
        mvpReady: false,
      },
      null,
      2,
    ),
  );
  console.log(
    'Real two-Harness account isolation and shared state passed; live identity/provider/physical gates remain blocked.',
  );
  }
} finally {
  await controller?.close().catch(() => {});
  store?.close();
  for (const { child } of authorities) {
    if (child.exitCode === null) {
      child.kill('SIGTERM');
      await new Promise((r) => {
        const t = setTimeout(() => child.kill('SIGKILL'), 5000);
        child.once('exit', () => {
          clearTimeout(t);
          r();
        });
      });
    }
  }
  await rm(root, { recursive: true, force: true });
}
