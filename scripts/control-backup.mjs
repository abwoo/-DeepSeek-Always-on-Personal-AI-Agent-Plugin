// Operator maintenance utility. Quiesces the entire stack so core/gateway/control volumes form one checkpoint.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  mkdtemp,
  readFile,
  writeFile,
  mkdir,
  rm,
  readdir,
  chmod,
  appendFile,
  open,
  stat,
} from 'node:fs/promises';
import { createReadStream, createWriteStream } from 'node:fs';
import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import { join, resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
const [action, file] = process.argv.slice(2),
  keyFile = process.env.ALWAYS_ON_BACKUP_KEY_FILE;
if (!['create', 'restore'].includes(action) || !file || !keyFile)
  throw Error(
    'Operator usage: control-backup.mjs create|restore <encrypted-file>; ALWAYS_ON_BACKUP_KEY_FILE must name an offline 32-byte base64 key',
  );
if (action === 'restore' && !process.argv.includes('--replace-stopped-volumes'))
  throw Error('Restore requires --replace-stopped-volumes and an approved maintenance window');
const key = Buffer.from((await readFile(keyFile, 'utf8')).trim(), 'base64');
if (key.length !== 32) throw Error('Invalid backup key');
const volumes = [
  'control_data',
  'agent_a_data',
  'agent_a_config',
  'agent_b_data',
  'agent_b_config',
  'edge_data',
  'edge_config',
];
const run = (program, args) =>
  promisify(execFile)(program, args, { timeout: 180000, maxBuffer: 2 * 1024 * 1024 });
const project = process.env.ALWAYS_ON_BACKUP_PROJECT ?? 'always-on-v03';
if (!/^[a-z0-9][a-z0-9-]{1,60}$/.test(project)) throw Error('Invalid operator project');
const compose = (args) =>
  run('docker', [
    'compose',
    '-p',
    project,
    '-f',
    resolve(process.env.ALWAYS_ON_BACKUP_COMPOSE_FILE ?? 'deploy/control/compose.yml'),
    ...args,
  ]);
const fileHash = async (path) => {
  const h = createHash('sha256');
  for await (const part of createReadStream(path)) h.update(part);
  return h.digest('hex');
};
const deployedSha = process.env.ALWAYS_ON_DEPLOYED_SHA;
if (!/^[a-f0-9]{40}$/.test(deployedSha ?? ''))
  throw Error('An exact deployed commit SHA is required for checkpoint compatibility');
let runningServices = [], runningContainerIds = [], runtimeImages = {}, checkpoint;
const inspectStack = async () => {
  // --mount creates missing named volumes. Inspect first, before Docker can
  // turn a mistyped project into a successful-looking empty checkpoint.
  await run('docker', ['volume', 'inspect', ...volumes.map((v) => project + '_' + v)]);
  const ids = (await compose(['ps', '-a', '-q'])).stdout.trim().split(/\s+/).filter(Boolean);
  if (!ids.length) throw Error('No existing operator stack containers found');
  const containers = JSON.parse((await run('docker', ['inspect', ...ids])).stdout);
  const mounted = new Set(
    containers.flatMap((c) => c.Mounts.filter((m) => m.Type === 'volume').map((m) => m.Name)),
  );
  if (volumes.some((v) => !mounted.has(project + '_' + v)))
    throw Error('Checkpoint volumes do not match the selected stack');
  for (const v of volumes) {
    const writers = (
      await run('docker', [
        'ps',
        '--no-trunc',
        '--filter',
        'volume=' + project + '_' + v,
        '--format',
        '{{.ID}}',
      ])
    ).stdout
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    if (writers.some((id) => !ids.includes(id)))
      throw Error('Checkpoint volume has a running container outside the selected stack');
  }
  runningContainerIds = containers.filter((c) => c.State.Running).map((c) => c.Id);
  runtimeImages = {};
  for (const c of containers) {
    const service = c.Config.Labels['com.docker.compose.service'];
    if (!service || !/^sha256:[a-f0-9]{64}$/.test(c.Image) || (runtimeImages[service] && runtimeImages[service] !== c.Image))
      throw Error('Ambiguous container runtime image identity');
    runtimeImages[service] = c.Image;
  }
  runningServices = [
    ...new Set(
      containers
        .filter((c) => c.State.Running)
        .map((c) => c.Config.Labels['com.docker.compose.service']),
    ),
  ];
  const defined = new Set((await compose(['config', '--services'])).stdout.trim().split(/\s+/));
  if (runningServices.some((s) => !s || !defined.has(s) || !/^[A-Za-z0-9_-]+$/.test(s)))
    throw Error('Unknown Compose service identity');
  return containers;
};
const dir = await mkdtemp(join(tmpdir(), 'always-on-backup-')),
  archive = join(dir, 'checkpoint.tar');
let stopped = false,
  finished = false;
await chmod(dir, 0o700);
try {
  if (action === 'restore') {
    const size = (await stat(resolve(file))).size,
      handle = await open(resolve(file), 'r'),
      header = Buffer.alloc(17),
      tag = Buffer.alloc(16);
    try {
      await handle.read(header, 0, 17, 0);
      await handle.read(tag, 0, 16, size - 16);
    } finally {
      await handle.close();
    }
    if (header.subarray(0, 5).toString() !== 'AOBK1') throw Error('Unknown backup format');
    const decipher = createDecipheriv('aes-256-gcm', key, header.subarray(5, 17));
    decipher.setAAD(Buffer.from('always-on-v03-checkpoint'));
    decipher.setAuthTag(tag);
    // Authenticate the complete snapshot before stopping or modifying any existing volume.
    await pipeline(
      createReadStream(resolve(file), { start: 17, end: size - 17 }),
      decipher,
      createWriteStream(archive, { mode: 0o600 }),
    );
    const list = (await run('tar', ['-tf', archive])).stdout
      .trim()
      .split('\n')
      .map((n) => n.replace(/^\.\//, ''));
    if (
      list.some(
        (n) =>
          n && n !== '.' && n !== 'manifest.json' && !volumes.map((v) => v + '.tar').includes(n),
      )
    )
      throw Error('Unexpected backup archive members');
    await run('tar', ['-xf', archive, '-C', dir]);
    const manifest = JSON.parse(await readFile(join(dir, 'manifest.json'), 'utf8'));
    if (![1, 2].includes(manifest.format) || manifest.harness !== '0.2.2-rc.3' || manifest.cordis !== '4.1.0')
      throw Error(
        'Restore into the recorded compatible runtime first; downgrade/migration review required',
      );
    if (manifest.sourceCommit !== deployedSha)
      throw Error('Restore requires the checkpoint matching the exact deployed image/commit');
    if (manifest.format === 1 && !process.argv.includes('--allow-unverified-legacy-images'))
      throw Error('Legacy checkpoint lacks image identities; reviewed recovery requires --allow-unverified-legacy-images');
    checkpoint = manifest;
    for (const name of volumes) {
      if ((await fileHash(join(dir, name + '.tar'))) !== manifest.volumes[name])
        throw Error('Checkpoint hash mismatch');
    }
  }
  const stack = await inspectStack();
  if (action === 'restore' && checkpoint.format === 2) {
    // Verify the image Compose would actually start after restoration, including
    // retagged references. The operator-supplied source SHA alone is insufficient.
    const config = JSON.parse((await compose(['config', '--format', 'json'])).stdout);
    const recorded = checkpoint.runtimeImages;
    if (!recorded || Object.keys(recorded).sort().join() !== Object.keys(runtimeImages).sort().join())
      throw Error('Checkpoint image service set mismatch');
    for (const c of stack) {
      const service = c.Config.Labels['com.docker.compose.service'];
      if (!config.services[service]) throw Error('Checkpoint service missing from selected configuration');
      const ref = config.services[service].image ?? c.Config.Image;
      const image = JSON.parse((await run('docker', ['image', 'inspect', ref])).stdout)[0];
      if (image?.Id !== recorded[service]) throw Error('Checkpoint image mismatch; select the exact recorded runtime before restore');
    }
  }
  const stackIds = stack.map(c => c.Id);
  stopped = true;
  await compose(['stop']);
  const quiesced = JSON.parse((await run('docker', ['inspect', ...stackIds])).stdout);
  if (quiesced.some((c) => c.State.Running))
    throw Error('Stack did not stop; refusing an inconsistent checkpoint');
  const manifest = {
    format: 2,
    runtimeImages,
    createdAt: new Date().toISOString(),
    harness: '0.2.2-rc.3',
    cordis: '4.1.0',
    sourceCommit: deployedSha,
    previouslyRunningServices: runningServices,
    volumes: {},
  };
  for (const name of volumes) {
    const volume = project + '_' + name;
    if (action === 'create') {
      await run('docker', [
        'run',
        '--rm',
        '--network',
        'none',
        '--mount',
        `type=volume,src=${volume},dst=/data,readonly`,
        '--mount',
        `type=bind,src=${dir},dst=/checkpoint`,
        'node:24.22.2-bookworm-slim',
        'tar',
        '-cf',
        '/checkpoint/' + name + '.tar',
        '-C',
        '/data',
        '.',
      ]);
      manifest.volumes[name] = await fileHash(join(dir, name + '.tar'));
    } else {
      await run('docker', ['volume', 'inspect', volume]);
      await run('docker', [
        'run',
        '--rm',
        '--network',
        'none',
        '--mount',
        `type=volume,src=${volume},dst=/data`,
        '--mount',
        `type=bind,src=${dir},dst=/checkpoint,readonly`,
        'node:24.22.2-bookworm-slim',
        'node',
        '-e',
        `const fs=require('node:fs');for(const f of fs.readdirSync('/data'))fs.rmSync('/data/'+f,{recursive:true,force:true});require('node:child_process').execFileSync('tar',['-xf','/checkpoint/${name}.tar','-C','/data']);`,
      ]);
    }
  }
  if (action === 'create') {
    await writeFile(join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2), { mode: 0o600 });
    await run('tar', [
      '-cf',
      archive,
      '-C',
      dir,
      'manifest.json',
      ...volumes.map((v) => v + '.tar'),
    ]);
    const iv = randomBytes(12),
      cipher = createCipheriv('aes-256-gcm', key, iv);
    cipher.setAAD(Buffer.from('always-on-v03-checkpoint'));
    await mkdir(dirname(resolve(file)), { recursive: true, mode: 0o700 });
    await writeFile(resolve(file), Buffer.concat([Buffer.from('AOBK1'), iv]), {
      mode: 0o600,
      flag: 'wx',
    });
    await pipeline(
      createReadStream(archive),
      cipher,
      createWriteStream(resolve(file), { flags: 'a', mode: 0o600 }),
    );
    await appendFile(resolve(file), cipher.getAuthTag());
  }
  finished = true;
  console.log(
    action === 'create'
      ? 'Encrypted coordinated checkpoint saved.'
      : 'Stopped volumes restored; now verify identities, migrations and interrupted task classification.',
  );
} finally {
  try {
    if (stopped && action === 'create' && runningContainerIds.length)
      // Restart original IDs; never reconcile a changed Compose definition.
      await run('docker', ['start', ...runningContainerIds]);
    else if (stopped && action === 'restore' && finished && runningServices.length)
      await compose(['up', '-d', '--no-deps', ...runningServices]);
    else if (stopped && action === 'restore' && !finished)
      console.error('Restore incomplete: all services remain stopped. Complete the coordinated checkpoint restore before restarting.');
  } finally {
    // A failed restart must not strand the decrypted checkpoint in /tmp.
    await rm(dir, { recursive: true, force: true });
  }
}
