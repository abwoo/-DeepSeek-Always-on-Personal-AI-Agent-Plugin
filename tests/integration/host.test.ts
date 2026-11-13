import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFile, type ChildProcess } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function stop(child: ChildProcess) {
  if (child.exitCode !== null) return;
  child.kill('SIGTERM');
  await new Promise<void>((done) => {
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      done();
    }, 10000);
    child.once('exit', () => {
      clearTimeout(timer);
      done();
    });
  });
}
async function run(args: string[], env: NodeJS.ProcessEnv) {
  const child = spawn(process.execPath, ['node_modules/@deepseek-ai/dsh/lib/bin.js', ...args], {
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  child.stdout.on('data', (c) => (log += c));
  child.stderr.on('data', (c) => (log += c));
  const code = await new Promise((r) => child.once('exit', r));
  assert.equal(code, 0, log.replace(/token=[^\s]+/g, 'token=REDACTED'));
}
test(
  'real Host: offline native Schedule → native Agent/tools → durable result → Inbox',
  { timeout: 180000 },
  async () => {
    const dir = await mkdtemp(join(tmpdir(), 'always-on-native-'));
    const env = {
      ...process.env,
      DSH_HOME: join(dir, 'harness'),
      ALWAYS_ON_DATA_DIR: join(dir, 'data'),
    };
    const patch = join(dir, 'fixture.yml');
    await writeFile(
      patch,
      `- id: agent-default-model\n  config:\n    provider: always-on-test\n    model: fixture\n- insert:\n    - id: always-on-test-model\n      name: '${resolve('tests/fixtures/model.mjs')}'\n`,
    );
    const packed = await promisify(execFile)(
      'npm',
      ['pack', '--ignore-scripts', '--json', '--pack-destination', dir],
      { env },
    );
    const filename = JSON.parse(packed.stdout)[0].filename;
    await run(['plugin', '--profile', 'web', 'add', join(dir, filename)], env);
    const child = spawn(
      process.execPath,
      [
        'node_modules/@deepseek-ai/dsh/lib/bin.js',
        'web',
        '--patch',
        patch,
        '--no-open',
        '--port',
        '0',
      ],
      { env, stdio: ['ignore', 'pipe', 'pipe'] },
    );
    let log = '';
    try {
      const url = await new Promise<string>((ok, bad) => {
        const timer = setTimeout(() => bad(new Error('Host startup timeout')), 40000);
        const onData = (c: Buffer) => {
          log += c;
          const m = log.match(/dsh web: (http:\/\/127\.0\.0\.1:\d+\/\?token=[^\s]+)/);
          if (m) {
            clearTimeout(timer);
            ok(m[1]!);
          }
        };
        child.stdout.on('data', onData);
        child.stderr.on('data', onData);
        child.once('exit', (code) => {
          clearTimeout(timer);
          bad(new Error('Host exited ' + code));
        });
      });
      const origin = new URL(url).origin;
      const login = await fetch(url, { redirect: 'manual' });
      const cookie = login.headers
        .getSetCookie()
        .map((x) => x.split(';')[0])
        .join('; ');
      assert.ok(cookie);
      const api = async (action?: string, data?: unknown) => {
        const res = await fetch(origin + '/api/always-on', {
          method: action ? 'POST' : 'GET',
          headers: { cookie, 'content-type': 'application/json', origin },
          ...(action ? { body: JSON.stringify({ action, data }) } : {}),
        });
        const body = await res.json();
        assert.equal(res.status, 200, JSON.stringify(body));
        return body;
      };
      assert.equal((await fetch(origin + '/api/always-on')).status, 401);
      const saved = await api('memory.save', {
        kind: 'project',
        content: 'FIXTURE_SAVED_MEMORY',
        source: 'explicit test user',
        consent: true,
      });
      const created = await api('task.create', {
        title: 'Offline fixture',
        instruction: 'EXPECT_MEMORY. Check fixture evidence once. No external services.',
        timing: { kind: 'after', after_seconds: 60 },
      });
      assert.ok(created.result.scheduleId);
      // No browser exists or participates. Native Schedule alone wakes the real Agent after 60 seconds.
      let snapshot;
      const until = Date.now() + 75000;
      while (Date.now() < until) {
        snapshot = await api();
        if (
          snapshot.runs.some(
            (r: any) =>
              r.status === 'completed' || r.status === 'failed' || r.status === 'unconfirmed',
          )
        )
          break;
        await sleep(500);
      }
      assert.equal(
        snapshot.runs[0]?.status,
        'completed',
        JSON.stringify(snapshot) + '\n' + log.replace(/token=[^\s]+/g, 'token=REDACTED'),
      );
      assert.match(snapshot.runs[0].resultReference, /^session:.+#event:/);
      assert.equal(snapshot.inbox.length, 1);
      assert.match(snapshot.inbox[0].summary, /Deterministic fixture/);
      await api('memory.delete', { id: saved.result.id });
      const second = await api('task.create', {
        title: 'New Session after deletion',
        instruction: 'EXPECT_NO_MEMORY FIXTURE_NO_CHANGE. Check without deleted context.',
        timing: { kind: 'after', after_seconds: 60 },
      });
      await api('task.run', { id: second.result.id });
      const deadline = Date.now() + 10000;
      while (Date.now() < deadline) {
        snapshot = await api();
        if (
          snapshot.runs.some((r: any) => r.taskId === second.result.id && r.status === 'completed')
        )
          break;
        await sleep(200);
      }
      assert.equal(
        snapshot.runs.find((r: any) => r.taskId === second.result.id)?.status,
        'completed',
        JSON.stringify(snapshot),
      );
      assert.equal(
        snapshot.inbox.length,
        1,
        'Native no-change result must not add an Inbox message',
      );
      assert.equal(snapshot.memories.length, 0);
    } finally {
      await stop(child);
      await rm(dir, { recursive: true, force: true });
    }
  },
);
