// Engineering-only TLS/port/auth smoke test of the actual operator image. No real provider inference is claimed.
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, rm, copyFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
const dir = await mkdtemp(join(tmpdir(), 'ao-container-')),
  tls = join(dir, 'tls');
await mkdir(tls);
const run = (program, args, env = process.env) =>
  execFileSync(program, args, {
    encoding: 'utf8',
    timeout: 240000,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
const name = 'always-on-tls-' + Date.now(),
  base = 'https://localhost:8443',
  ca = join(dir, 'test-ca.crt');
const project = 'ao-upgrade-' + Date.now(),
  names = [
    'control_data',
    'agent_a_data',
    'agent_a_config',
    'agent_b_data',
    'agent_b_config',
    'edge_data',
    'edge_config',
  ];
const dataVolume = project + '_agent_a_data',
  configVolume = project + '_agent_a_config',
  compose = join(dir, 'compose.yml'),
  checkpoint = join(dir, 'runtime.aobackup'),
  backupKey = join(dir, 'backup.key');
const previous = process.env.ALWAYS_ON_UPGRADE_FROM;
if (!/^[a-f0-9]{40}$/.test(previous ?? '')) throw Error('Exact previous image source SHA required');
const dc = (args) => run('docker', ['compose', '-p', project, '-f', compose, ...args]);
const backupEnv = {
  ...process.env,
  ALWAYS_ON_BACKUP_PROJECT: project,
  ALWAYS_ON_BACKUP_COMPOSE_FILE: compose,
  ALWAYS_ON_BACKUP_KEY_FILE: backupKey,
  ALWAYS_ON_DEPLOYED_SHA: previous,
};
async function setImage(image) {
  await writeFile(
    compose,
    `services:
  agent:
    image: ${image}
    container_name: ${name}
    ports: ['127.0.0.1:8443:8443']
    volumes:
      - agent_a_data:/data
      - agent_a_config:/config
      - ${JSON.stringify(tls + ':/run/tls:ro')}
    environment:
      ALWAYS_ON_PUBLIC_ORIGIN: ${base}
      ALWAYS_ON_TLS_CERT: /run/tls/cert.pem
      ALWAYS_ON_TLS_KEY: /run/tls/key.pem
      DEEPSEEK_API_KEY: engineering-invalid-key-no-inference
      DEEPSEEK_MODEL: engineering-no-inference
  hold:
    image: node:24.22.2-bookworm-slim
    command: ['node','-e','setInterval(()=>{},1000)']
    volumes:
${names
  .filter((n) => !['agent_a_data', 'agent_a_config'].includes(n))
  .map((n, i) => '      - ' + n + ':/v' + i)
  .join('\n')}
volumes:
${names.map((n) => '  ' + n + ': {}').join('\n')}
`,
  );
}
try {
  run('openssl', [
    'req',
    '-x509',
    '-newkey',
    'rsa:2048',
    '-nodes',
    '-keyout',
    join(tls, 'key.pem'),
    '-out',
    join(tls, 'cert.pem'),
    '-days',
    '1',
    '-subj',
    '/CN=localhost',
    '-addext',
    'subjectAltName=DNS:localhost',
  ]);
  await copyFile(join(tls, 'cert.pem'), ca);
  run('sudo', ['chown', '-R', '1000:1000', tls]);
  run('sudo', ['chmod', '700', tls]);
  await writeFile(backupKey, randomBytes(32).toString('base64'), { mode: 0o600 });
  await setImage('always-on-managed:previous');
  dc(['up', '-d']);
  function request(path, body, token) {
    const args = [
      '--silent',
      '--show-error',
      '--max-time',
      '10',
      '--cacert',
      ca,
      '--write-out',
      '\n%{http_code}',
      ...(token ? ['--header', 'Authorization: Bearer ' + token] : []),
      ...(body
        ? ['--header', 'content-type: application/json', '--data', JSON.stringify(body)]
        : []),
      base + path,
    ];
    const output = run('curl', args),
      split = output.lastIndexOf('\n');
    return { status: Number(output.slice(split + 1)), body: output.slice(0, split) };
  }
  const ports = JSON.parse(run('docker', ['inspect', name]))[0].HostConfig.PortBindings;
  assert.ok(!ports['3080/tcp']);
  assert.equal(ports['8443/tcp'][0].HostIp, '127.0.0.1');
  async function waitForHealth() {
    const until = Date.now() + 90000;
    while (Date.now() < until) {
      try {
        if (request('/personal-agent/v1/health').status === 200) return;
      } catch {}
      await delay(1000);
    }
    throw Error('Managed container did not expose its actual HTTPS device health endpoint');
  }
  await waitForHealth();
  assert.equal(request('/').status, 404);
  assert.equal(request('/api/always-on').status, 404);
  assert.equal(request('/personal-agent/v1/snapshot').status, 401);
  const code = JSON.parse(
    run('docker', ['exec', name, 'node', 'scripts/managed-admin.mjs', 'pair-code']),
  );
  const claimed = request('/personal-agent/v1/pair/claim', {
    code: code.code,
    name: 'TLS engineering client',
    platform: 'other',
  });
  assert.equal(claimed.status, 200);
  const credentials = JSON.parse(claimed.body);
  const snapshot = request('/personal-agent/v1/snapshot', undefined, credentials.token);
  assert.equal(snapshot.status, 200);
  assert.equal(JSON.parse(snapshot.body).authorityId, credentials.authorityId);
  function mutate(command) {
    const result = request(
      '/personal-agent/v1/mutate',
      { operationId: randomUUID(), command },
      credentials.token,
    );
    assert.equal(result.status, 200);
    return JSON.parse(result.body).result;
  }
  const task = mutate({
    action: 'task.create',
    data: {
      title: 'Container persistence check',
      instruction: 'Read-only future trigger; no model execution is claimed.',
      timing: { kind: 'every', every_seconds: 3600 },
      maxRuns: 1,
      allowedTools: [],
    },
  }).result;
  const memory = mutate({
    action: 'memory.save',
    data: {
      kind: 'project',
      content: 'Container persistence verification',
      source: 'Explicit engineering consent',
      consent: true,
    },
  }).result;
  const session = mutate({
    action: 'session.create',
    data: { creationId: 'session-' + randomUUID() },
  });
  const goalResponse = request(
    '/personal-agent/v1/goals',
    {
      operationId: randomUUID(),
      goal: {
        title: 'Retained goal across image changes',
        instruction: 'No model execution in container recovery fixture',
        everySeconds: 3600,
        allowedTools: [],
        maxRuns: 1,
      },
    },
    credentials.token,
  );
  assert.equal(goalResponse.status, 200);
  const goalId = JSON.parse(goalResponse.body).result.id;
  run(process.execPath, ['scripts/control-backup.mjs', 'create', checkpoint], backupEnv);
  await waitForHealth();
  const afterCheckpoint = mutate({
    action: 'memory.save',
    data: {
      kind: 'fact',
      content: 'Added after the old checkpoint',
      source: 'Explicit fixture consent',
      consent: true,
    },
  }).result;
  await setImage('always-on-managed:test');
  dc(['up', '-d', '--no-deps', 'agent']);
  await waitForHealth();
  // Old images do not have this endpoint. A successful bounded export plus the
  // projected goal exercises the newly installed gateway AND core task API.
  const exportResponse = request('/personal-agent/v1/exports', {}, credentials.token);
  assert.equal(exportResponse.status, 200);
  const upgraded = JSON.parse(
    request('/personal-agent/v1/snapshot', undefined, credentials.token).body,
  );
  assert.ok(upgraded.goals.some((g) => g.id === goalId));
  assert.ok(upgraded.memories.some((m) => m.id === afterCheckpoint.id));
  assert.equal(upgraded.authorityId, credentials.authorityId);
  assert.ok(upgraded.tasks.some((t) => t.id === task.id));
  request(
    '/personal-agent/v1/exports/release',
    { exportId: JSON.parse(exportResponse.body).exportId },
    credentials.token,
  );
  run('docker', ['restart', name]);
  await waitForHealth();
  const restoredResponse = request('/personal-agent/v1/snapshot', undefined, credentials.token);
  assert.equal(restoredResponse.status, 200);
  const restored = JSON.parse(restoredResponse.body);
  assert.equal(restored.authorityId, credentials.authorityId);
  assert.equal(restored.tasks.filter((t) => t.id === task.id).length, 1);
  assert.ok(restored.memories.some((m) => m.id === memory.id));
  const sessionResponse = request(
    '/personal-agent/v1/session/read',
    { sessionId: session.sessionId },
    credentials.token,
  );
  assert.equal(sessionResponse.status, 200);
  assert.equal(JSON.parse(sessionResponse.body).sessionId, session.sessionId);
  // Restore the old image with its exact matching full checkpoint, never old
  // code on newly written data. Five stack volumes contain fixtures; the two
  // agent volumes contain actual native Harness/plugin/Session state.
  await setImage('always-on-managed:previous');
  run(
    process.execPath,
    ['scripts/control-backup.mjs', 'restore', checkpoint, '--replace-stopped-volumes'],
    backupEnv,
  );
  await waitForHealth();
  const rollback = request('/personal-agent/v1/snapshot', undefined, credentials.token);
  assert.equal(rollback.status, 200);
  const old = JSON.parse(rollback.body);
  assert.equal(old.authorityId, credentials.authorityId);
  assert.ok(old.tasks.some((t) => t.id === task.id));
  assert.ok(old.memories.some((m) => m.id === memory.id));
  assert.ok(!old.memories.some((m) => m.id === afterCheckpoint.id));
  assert.ok(old.goals.some((g) => g.id === goalId));
  const oldSession = request(
    '/personal-agent/v1/session/read',
    { sessionId: session.sessionId },
    credentials.token,
  );
  assert.equal(oldSession.status, 200);
  const evidence = {
    sourceCommit: process.env.GITHUB_SHA ?? 'local-working-tree',
    previousImageCommit: previous,
    actualImageUpgrade: true,
    actualNativeStateEncryptedCheckpointRollback: true,
    preservedGoalSessionDeviceAndAuthorityAcrossImages: true,
    nativeAgentVolumes: 2,
    remainingStackVolumes: 'five disposable fixtures; not a live control/IdP deployment',
    actualContainerStartup: true,
    persistentContainerRestart: true,
    retainedDeviceAuthorization: true,
    retainedTaskMemoryAndSession: true,
    trustedTestCertificate: true,
    narrowPublicApi: true,
    ownerApiBlocked: true,
    unauthorizedDeviceRejected: true,
    operatorPairing: true,
    sameAuthority: true,
    privateHarnessPortNotPublished: true,
    realDeepSeek: false,
    productionCloudDeployment: false,
    realPhone: false,
    mvpReady: false,
  };
  await mkdir('test-results', { recursive: true });
  await writeFile('test-results/managed-container.json', JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify(evidence));
} catch (error) {
  let diagnostics = '';
  try {
    diagnostics = run('docker', ['logs', name]);
  } catch (e) {
    diagnostics = String(e.stdout ?? '') + String(e.stderr ?? '');
  }
  diagnostics = diagnostics
    .replace(/token=[^\s]+/g, 'token=REDACTED')
    .replace(/ao_[a-f0-9-]+\.[A-Za-z0-9_-]+/g, 'REDACTED_DEVICE_TOKEN');
  await mkdir('test-results', { recursive: true });
  await writeFile('test-results/managed-container-error.log', diagnostics);
  console.error(diagnostics.slice(-10000));
  throw error;
} finally {
  try {
    dc(['down', '--volumes']);
  } catch {}
  try {
    run('sudo', ['chown', '-R', `${process.getuid()}:${process.getgid()}`, tls]);
  } catch {}
  await rm(dir, { recursive: true, force: true });
}
