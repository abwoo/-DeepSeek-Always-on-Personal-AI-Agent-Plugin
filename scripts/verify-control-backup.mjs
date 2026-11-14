// Real Docker storage/encryption rehearsal using disposable fixture volumes, not a production deployment.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, writeFile, readFile, rm, mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';
import assert from 'node:assert/strict';
const dir = await mkdtemp(join(tmpdir(), 'ao-restore-')),
  project = 'ao-test-' + randomBytes(6).toString('hex'),
  image = 'node:24.22.2-bookworm-slim';
const names = [
  'control_data',
  'agent_a_data',
  'agent_a_config',
  'agent_b_data',
  'agent_b_config',
  'edge_data',
  'edge_config',
];
const run = (program, args, env = process.env) =>
  promisify(execFile)(program, args, { env, timeout: 180000, maxBuffer: 2 * 1024 * 1024 });
const compose = join(dir, 'compose.yml'),
  key = join(dir, 'backup-key'),
  encrypted = join(dir, 'snapshot.aobackup');
const env = {
  ...process.env,
  ALWAYS_ON_BACKUP_PROJECT: project,
  ALWAYS_ON_BACKUP_COMPOSE_FILE: compose,
  ALWAYS_ON_BACKUP_KEY_FILE: key,
  ALWAYS_ON_DEPLOYED_SHA: process.env.GITHUB_SHA ?? 'local-storage-fixture',
};
await writeFile(key, randomBytes(32).toString('base64'), { mode: 0o600 });
await writeFile(
  compose,
  `services:\n  hold:\n    image: ${image}\n    command: ['node', '-e', 'setInterval(()=>{},1000)']\n    volumes:\n${names.map((n, i) => `      - ${n}:/v${i}`).join('\n')}\nvolumes:\n${names.map((n) => `  ${n}: {}`).join('\n')}\n`,
);
const dockerCompose = (args) => run('docker', ['compose', '-p', project, '-f', compose, ...args]);
const mounts = names.flatMap((n, i) => ['--mount', `type=volume,src=${project}_${n},dst=/v${i}`]);
const volumeScript = async (body) =>
  (await run('docker', ['run', '--rm', '--network', 'none', ...mounts, image, 'node', '-e', body]))
    .stdout;
try {
  await dockerCompose(['up', '-d']);
  await volumeScript(
    `const fs=require('node:fs');const {DatabaseSync}=require('node:sqlite');for(let i=0;i<7;i++){fs.writeFileSync('/v'+i+'/marker','original-'+i,{mode:384});const d=new DatabaseSync('/v'+i+'/state.sqlite');d.exec("CREATE TABLE identity(id TEXT PRIMARY KEY); INSERT INTO identity VALUES('fixture-stable-id-"+i+"')");d.close();}`,
  );
  await run(process.execPath, ['scripts/control-backup.mjs', 'create', encrypted], env);
  assert.ok(!(await readFile(encrypted)).includes(Buffer.from('fixture-stable-id')));
  await volumeScript(
    `const fs=require('node:fs');for(let i=0;i<7;i++)fs.writeFileSync('/v'+i+'/marker','changed-'+i);`,
  );
  const wrong = join(dir, 'wrong-key');
  await writeFile(wrong, randomBytes(32).toString('base64'), { mode: 0o600 });
  await assert.rejects(() =>
    run(
      process.execPath,
      ['scripts/control-backup.mjs', 'restore', encrypted, '--replace-stopped-volumes'],
      { ...env, ALWAYS_ON_BACKUP_KEY_FILE: wrong },
    ),
  );
  assert.ok(
    (
      await volumeScript(`console.log(require('node:fs').readFileSync('/v0/marker','utf8'))`)
    ).includes('changed-0'),
  );
  await run(
    process.execPath,
    ['scripts/control-backup.mjs', 'restore', encrypted, '--replace-stopped-volumes'],
    env,
  );
  const results = JSON.parse(
    await volumeScript(
      `const fs=require('node:fs');const {DatabaseSync}=require('node:sqlite');console.log(JSON.stringify(Array.from({length:7},(_,i)=>{const db=new DatabaseSync('/v'+i+'/state.sqlite',{readOnly:true});const row=db.prepare('SELECT id FROM identity').get();db.close();return{marker:fs.readFileSync('/v'+i+'/marker','utf8'),id:row.id};})));`,
    ),
  );
  for (let i = 0; i < 7; i++)
    assert.deepEqual(results[i], { marker: 'original-' + i, id: 'fixture-stable-id-' + i });
  await mkdir('test-results', { recursive: true });
  await writeFile(
    'test-results/v03-backup.json',
    JSON.stringify(
      {
        sourceCommit: process.env.GITHUB_SHA ?? 'local',
        actualDockerVolumes: 7,
        coordinatedQuiescedCheckpoint: true,
        encryptedArchive: true,
        wrongKeyRejectedBeforeVolumeChanges: true,
        allFixtureFilesAndSqliteIdsRestored: true,
        productionData: false,
        actualHarnessExecution: false,
        mvpReady: false,
      },
      null,
      2,
    ),
  );
  console.log(
    'Actual Docker coordinated encryption/restore rehearsal passed on disposable fixture volumes.',
  );
} finally {
  await dockerCompose(['down', '--volumes']).catch(() => {});
  await rm(dir, { recursive: true, force: true });
}
