// Engineering-only TLS/port/auth smoke test of the actual operator image. No real provider inference is claimed.
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, rm, copyFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import assert from 'node:assert/strict';
const dir = await mkdtemp(join(tmpdir(), 'ao-container-')),
  tls = join(dir, 'tls');
await mkdir(tls);
const run = (program, args) =>
  execFileSync(program, args, {
    encoding: 'utf8',
    timeout: 120000,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
const name = 'always-on-tls-' + Date.now(),
  base = 'https://localhost:8443',
  ca = join(dir, 'test-ca.crt');
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
  run('docker', [
    'run',
    '--detach',
    '--name',
    name,
    '--publish',
    '127.0.0.1:8443:8443',
    '--tmpfs',
    '/data:uid=1000,gid=1000,mode=700',
    '--tmpfs',
    '/config:uid=1000,gid=1000,mode=700',
    '--mount',
    `type=bind,src=${tls},dst=/run/tls,readonly`,
    '--env',
    `ALWAYS_ON_PUBLIC_ORIGIN=${base}`,
    '--env',
    'ALWAYS_ON_TLS_CERT=/run/tls/cert.pem',
    '--env',
    'ALWAYS_ON_TLS_KEY=/run/tls/key.pem',
    '--env',
    'DEEPSEEK_API_KEY=engineering-invalid-key-no-inference',
    '--env',
    'DEEPSEEK_MODEL=engineering-no-inference',
    'always-on-managed:test',
  ]);
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
  const ports=JSON.parse(run('docker',['inspect',name]))[0].HostConfig.PortBindings;assert.ok(!ports['3080/tcp']);assert.equal(ports['8443/tcp'][0].HostIp,'127.0.0.1');
  const until = Date.now() + 90000;
  let healthy = false;
  while (Date.now() < until) {
    try {
      if (request('/personal-agent/v1/health').status === 200) {
        healthy = true;
        break;
      }
    } catch {}
    await delay(1000);
  }
  assert.ok(healthy, 'Managed container did not expose its actual HTTPS device health endpoint');
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
  const evidence = {
    actualContainerStartup: true,
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
} catch(error) {
  let diagnostics='';try{diagnostics=run('docker',['logs',name]);}catch(e){diagnostics=String(e.stdout??'')+String(e.stderr??'');}
  diagnostics=diagnostics.replace(/token=[^\s]+/g,'token=REDACTED').replace(/ao_[a-f0-9-]+\.[A-Za-z0-9_-]+/g,'REDACTED_DEVICE_TOKEN');
  await mkdir('test-results',{recursive:true});await writeFile('test-results/managed-container-error.log',diagnostics);console.error(diagnostics.slice(-10000));throw error;
} finally {
  try {
    run('docker', ['rm', '--force', '--volumes', name]);
  } catch {}
  try {
    run('sudo', ['chown', '-R', `${process.getuid()}:${process.getgid()}`, tls]);
  } catch {}
  await rm(dir, { recursive: true, force: true });
}
