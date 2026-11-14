// Runs only against an actual official installed macOS/Windows application in disposable CI.
// Native integration and remote Session control only; never certifies model execution or MVP readiness.
import { chromium, expect } from '@playwright/test';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { dirname, join, resolve } from 'node:path';
import { connectProbe } from '../dist/remote/probe-connection.js';
const executable = process.env.ALWAYS_ON_DESKTOP_EXE;
if (!['win32', 'darwin'].includes(process.platform) || !executable) throw new Error('Real installed native Desktop required');
const output = process.platform === 'win32' ? '.artifacts/windows-desktop' : '.artifacts/macos-desktop';
await mkdir(output, { recursive: true });
const evidence = { platform: process.platform, nativePlugin: false, restartPersistence: false,
  remoteDesktopSession: false, realDeepSeek: false, realPhone: false, mvpReady: false };
let remoteProcess, observer;
async function verifyRuntime() {
  const root = process.platform === 'win32' ? join(dirname(executable), 'resources', 'app.asar', 'dsh')
    : join(dirname(executable), '..', 'Resources', 'app.asar', 'dsh');
  const script = `const fs=require('node:fs'); const path=require('node:path');
    const p=path.join(process.env.ALWAYS_ON_PHASE0_RESOURCE_ROOT,'node_modules','@deepseek-ai','cordis','package.json');
    console.log(JSON.stringify({cordis:JSON.parse(fs.readFileSync(p,'utf8')).version}));`;
  const result = await promisify(execFile)(executable, ['--expose-internals', '-e', script], {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', ALWAYS_ON_PHASE0_RESOURCE_ROOT: root }, timeout: 30000,
  });
  const versions = JSON.parse(result.stdout.trim());
  await writeFile(join(output, 'runtime-versions.json'), JSON.stringify(versions, null, 2));
  if (versions.cordis !== '4.1.0') throw new Error('Actual signed Desktop Cordis does not match pinned 4.1.0');
}
async function stopTree(child) {
  if (!child?.pid) return;
  if (process.platform === 'win32') {
    await promisify(execFile)('taskkill', ['/PID', String(child.pid), '/T', '/F']).catch(() => {});
  } else {
    // Each disposable app/Host is spawned in its own process group.
    try { process.kill(-child.pid, 'SIGTERM'); } catch {}
    await delay(1000);
    try { process.kill(-child.pid, 'SIGKILL'); } catch {}
  }
}
async function startRemote() {
  const root = join(process.env.RUNNER_TEMP, 'always-on-remote-authority');
  const env = { ...process.env, DSH_HOME: join(root, 'profile'), ALWAYS_ON_DATA_DIR: join(root, 'data'),
    ALWAYS_ON_DOCUMENTS_DIR: join(root, 'documents') };
  const cli = resolve('node_modules/@deepseek-ai/dsh/lib/bin.js');
  const version = JSON.parse(await readFile('package.json', 'utf8')).version;
  await promisify(execFile)(process.execPath, [cli, 'plugin', '--profile', 'web', 'add',
    resolve(`abwoo-deepseek-always-on-${version}.tgz`)], { env, timeout: 120000 });
  remoteProcess = spawn(process.execPath, [cli, 'web', '--patch', resolve('deploy/headless.patch.yml'), '--no-open', '--port', '0'], { env, detached: process.platform === 'darwin', stdio: ['ignore', 'pipe', 'pipe'] });
  const url = await new Promise((ok, fail) => {
    let output = '';
    const timer = setTimeout(() => fail(new Error('Real independent remote Harness startup timed out')), 90000);
    const observe = (chunk) => {
      output += chunk;
      const match = output.match(/dsh web: (http:\/\/127\.0\.0\.1:\d+\/\?token=[^\s]+)/);
      if (match) { clearTimeout(timer); ok(new URL(match[1])); }
    };
    remoteProcess.stdout.on('data', observe); remoteProcess.stderr.on('data', observe);
    remoteProcess.once('exit', (code) => {
      clearTimeout(timer);
      const safe = output.replace(/token=[^\s]+/g, 'token=REDACTED');
      fail(new Error(`Independent remote Harness exited ${code}: ${safe.slice(-5000)}`));
    });
  });
  // Operator test secret stays in server processes; no secret is sent to the renderer.
  process.env.ALWAYS_ON_PHASE0_REMOTE_ORIGIN = url.origin;
  process.env.ALWAYS_ON_PHASE0_REMOTE_TOKEN = url.searchParams.get('token');
  process.env.ALWAYS_ON_PHASE0_ALLOW_LOOPBACK = '1';
  process.env.ALWAYS_ON_DESKTOP_OPERATOR_PREVIEW = '1';
  process.env.ALWAYS_ON_DESKTOP_REMOTE_ORIGIN = url.origin;
  process.env.ALWAYS_ON_DESKTOP_REMOTE_TOKEN = url.searchParams.get('token');
  process.env.ALWAYS_ON_DESKTOP_ALLOW_LOOPBACK = '1';
  observer = await connectProbe(url.origin, url.searchParams.get('token'), true);
  evidence.remoteAuthority = url.origin;
}

async function capture(page, name) {
  await page.bringToFront();
  try {
    await page.screenshot({ path: join(output, name), timeout: 5000, animations: 'disabled' });
  } catch {
    // Windows hosted-runner compositor capture can stall even after successful UI/API checks.
    // Preserve the failure; never replace it with a fabricated image or a visual-pass claim.
    evidence.visualCaptureWarnings ??= [];
    evidence.visualCaptureWarnings.push(name);
  }
}

async function boot(action) {
  const child = spawn(executable, ['--remote-debugging-port=16927', '--remote-debugging-address=127.0.0.1'],
    { env: process.env, detached: process.platform === 'darwin', stdio: 'ignore' });
  let browser;
  try {
    const deadline = Date.now() + 90000;
    while (Date.now() < deadline) {
      try {
        const res = await fetch('http://127.0.0.1:16927/json/version', { signal: AbortSignal.timeout(2000) });
        if (res.ok) { browser = await chromium.connectOverCDP('http://127.0.0.1:16927'); break; }
      } catch {}
      if (child.exitCode !== null) throw new Error('Official Desktop exited before renderer readiness');
      await delay(500);
    }
    if (!browser) throw new Error('Official Desktop did not expose its test debugging endpoint');
    let page;
    await expect.poll(() => {
      page = browser.contexts().flatMap((c) => c.pages()).find((p) => p.url().startsWith('dsh-app://'));
      return !!page;
    }, { timeout: 60000 }).toBe(true);
    for (const [title, button] of [['Preview Notice', 'Continue'], ['Get started', 'Close']]) {
      const dialog = page.getByRole('dialog', { name: title, exact: true });
      if (await dialog.waitFor({ state: 'visible', timeout: 5000 }).then(() => true).catch((e) => {
        if (e.name !== 'TimeoutError') throw e; return false;
      })) await dialog.getByRole('button', { name: button, exact: true }).click();
    }
    await action(page);
  } finally {
    await browser?.close().catch(() => {});
    // Only this newly spawned disposable CI app tree. No user machine is touched.
    await stopTree(child);
  }
}
try {
  await verifyRuntime();
  if (process.argv.includes('--initialize')) {
    await boot(async (page) => {
      await capture(page, 'initialized.png');
    });
    evidence.profileInitialized = true;
  } else {
    await startRemote();
    let id, remoteId, personalSessionId, sharedTaskId;
    await boot(async (page) => {
      await page.getByText('Always-on', { exact: true }).click();
      await page.getByRole('button', { name: 'Tasks', exact: true }).click();
      await page.getByLabel('Task name').fill('Native Desktop persistence proof');
      await page.getByLabel('What should your agent check?').fill('Read-only compatibility probe; no model execution claimed.');
      await page.getByRole('button', { name: 'Create task', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Native Desktop persistence proof' })).toBeVisible();
      const state = await page.evaluate(async () => {
        const response = await fetch('/api/always-on');
        if (!response.ok) throw new Error('Native plugin state endpoint failed');
        return response.json();
      });
      const task = state.tasks.find((t) => t.title === 'Native Desktop persistence proof');
      if (!task?.id) throw new Error('UI mutation did not persist a task on the native Host');
      id = task.id;
      evidence.nativePlugin = true;
      await capture(page, 'native-plugin.png');
      await page.getByText('Remote Session probe', { exact: true }).click();
      await page.getByRole('button', { name: 'Create remote Session', exact: true }).click();
      await expect(page.getByTestId('remote-authority')).toHaveText(evidence.remoteAuthority);
      remoteId = await page.getByLabel('Remote Session ID').inputValue();
      await page.getByRole('button', { name: 'Rename remote Session', exact: true }).click();
      await expect(page.getByTestId('remote-events')).toContainText('Remote Desktop authority proof');
      await page.getByRole('button', { name: 'Submit remote prompt', exact: true }).click();
      await expect(page.getByTestId('remote-events')).toContainText('"promptAccepted": true');
      await expect.poll(async () => JSON.stringify(await observer.session.events({
        address: { kind: 'session', sessionId: remoteId },
      }))).toContain('Phase 0 native remote input proof');
      evidence.remoteSessionId = remoteId;
      evidence.promptReceiptOnly = true;
      await capture(page, 'native-remote-session.png');
      // Phase 1 product package: same remote state, not the local compatibility task.
      await page.getByText('Personal Agent', { exact: true }).click();
      await expect(page.getByTestId('desktop-remote-authority')).toContainText(evidence.remoteAuthority);
      await page.getByRole('button', { name: 'Tasks', exact: true }).click();
      await page.getByLabel('Task name').fill('Personal Agent shared task');
      await page.getByLabel('What should your agent check?').fill('Remote-only read-only development check.');
      await page.getByRole('button', { name: 'Create task', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Personal Agent shared task' })).toBeVisible();
      const shared = await (await observer.alwaysOn('GET')).json();
      sharedTaskId = shared.tasks.find((t) => t.title === 'Personal Agent shared task')?.id;
      if (!sharedTaskId) throw new Error('Desktop task mutation did not persist on the remote authority');
      const local = await page.evaluate(async () => (await fetch('/api/always-on')).json());
      if (local.tasks.some((t) => t.id === sharedTaskId)) throw new Error('Shared task was copied to the local Host');
      await page.getByRole('button', { name: 'Memory', exact: true }).click();
      await page.getByLabel('Information to remember').fill('Native shared memory consent check');
      await page.getByLabel('I allow this information to be used across sessions.').check();
      await page.getByRole('button', { name: 'Save with my consent' }).click();
      await expect(page.locator('.ao pre')).toContainText('Native shared memory consent check');
      const memoryState = await (await observer.alwaysOn('GET')).json();
      if (!memoryState.memories.some((m) => m.content === 'Native shared memory consent check')) throw new Error('Native memory was not saved remotely');
      await page.getByRole('button', { name: 'Conversations', exact: true }).click();
      await page.getByRole('button', { name: 'New remote conversation', exact: true }).click();
      await expect(page.getByLabel('Message your agent')).toBeVisible();
      personalSessionId = await page.getByLabel('Remote Session ID').inputValue();
      await page.getByLabel('Message your agent').fill('Phase 1 actual native conversation input');
      await page.getByRole('button', { name: 'Send to agent', exact: true }).click();
      await expect.poll(async () => JSON.stringify(await observer.session.events({address:{kind:'session',sessionId:personalSessionId}}))).toContain('Phase 1 actual native conversation input');
      evidence.desktopSharedTaskId = sharedTaskId;
      evidence.desktopSessionId = personalSessionId;
      evidence.desktopSharedMemory = true;
      await capture(page, 'personal-agent.png');
    });
    const afterDesktopExit = await observer.session.events({ address: { kind: 'session', sessionId: remoteId } });
    if (!afterDesktopExit.ok || !JSON.stringify(afterDesktopExit.value).includes('Remote Desktop authority proof')) {
      throw new Error('Independent authority lost the Session when actual Desktop exited');
    }
    evidence.remoteReadableWithDesktopStopped = true;
    await boot(async (page) => {
      await page.getByText('Always-on', { exact: true }).click();
      const state = await page.evaluate(async () => (await fetch('/api/always-on')).json());
      if (!state.tasks.some((t) => t.id === id)) throw new Error('Task lost after actual Desktop process restart');
      evidence.restartPersistence = true;
      evidence.taskId = id;
      await page.getByText('Remote Session probe', { exact: true }).click();
      await page.getByLabel('Remote Session ID').fill(remoteId);
      await page.getByRole('button', { name: 'Read remote Session', exact: true }).click();
      await expect(page.getByTestId('remote-events')).toContainText('Remote Desktop authority proof');
      await expect(page.getByTestId('remote-authority')).toHaveText(evidence.remoteAuthority);
      evidence.remoteDesktopSession = true;
      await page.getByText('Personal Agent', { exact: true }).click();
      await page.getByRole('button', { name: 'Tasks', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Personal Agent shared task' })).toBeVisible();
      const snapshot = await page.evaluate(async () => (await fetch('/api/always-on-desktop/state')).json());
      if (!snapshot.tasks.some((t) => t.id === sharedTaskId)) throw new Error('Desktop restart did not retain the same remote task ID');
      evidence.phase1SharedState = true;
    });
  }
} catch (error) {
  evidence.blocker = error.message;
  throw error;
} finally {
  await observer?.close();
  await stopTree(remoteProcess);
  await writeFile(join(output, process.argv.includes('--initialize') ? 'initialize.json' : 'plugin.json'),
    JSON.stringify({ timestamp: new Date().toISOString(), ...evidence }, null, 2));
}
