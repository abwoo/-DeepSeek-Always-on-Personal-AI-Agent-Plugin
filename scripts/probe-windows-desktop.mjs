// Runs only against an actual official installed Windows application in disposable CI.
// It validates local native plugin integration, not remote Sessions or MVP readiness.
import { chromium, expect } from '@playwright/test';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, writeFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { join } from 'node:path';
const executable = process.env.ALWAYS_ON_DESKTOP_EXE;
if (process.platform !== 'win32' || !executable) throw new Error('Real installed Windows Desktop required');
const output = '.artifacts/windows-desktop';
await mkdir(output, { recursive: true });
const evidence = { platform: process.platform, nativePlugin: false, restartPersistence: false,
  remoteDesktopSession: false, realDeepSeek: false, realPhone: false, mvpReady: false };

async function boot(action) {
  const child = spawn(executable, ['--remote-debugging-port=16927', '--remote-debugging-address=127.0.0.1'],
    { env: process.env, stdio: 'ignore' });
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
    if (child.pid) await promisify(execFile)('taskkill', ['/PID', String(child.pid), '/T', '/F']).catch(() => {});
  }
}
try {
  if (process.argv.includes('--initialize')) {
    await boot(async (page) => {
      await page.screenshot({ path: join(output, 'initialized.png') });
    });
    evidence.profileInitialized = true;
  } else {
    let id;
    await boot(async (page) => {
      await page.getByText('Always-on', { exact: true }).click();
      await page.getByRole('button', { name: 'Tasks', exact: true }).click();
      await page.getByLabel('Task name').fill('Native Windows persistence proof');
      await page.getByLabel('What should your agent check?').fill('Read-only compatibility probe; no model execution claimed.');
      await page.getByRole('button', { name: 'Create task', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Native Windows persistence proof' })).toBeVisible();
      const state = await page.evaluate(async () => {
        const response = await fetch('/api/always-on');
        if (!response.ok) throw new Error('Native plugin state endpoint failed');
        return response.json();
      });
      const task = state.tasks.find((t) => t.title === 'Native Windows persistence proof');
      if (!task?.id) throw new Error('UI mutation did not persist a task on the native Host');
      id = task.id;
      evidence.nativePlugin = true;
      await page.screenshot({ path: join(output, 'native-plugin.png') });
    });
    await boot(async (page) => {
      await page.getByText('Always-on', { exact: true }).click();
      const state = await page.evaluate(async () => (await fetch('/api/always-on')).json());
      if (!state.tasks.some((t) => t.id === id)) throw new Error('Task lost after actual Desktop process restart');
      evidence.restartPersistence = true;
      evidence.taskId = id;
    });
  }
} catch (error) {
  evidence.blocker = error.message;
  throw error;
} finally {
  await writeFile(join(output, process.argv.includes('--initialize') ? 'initialize.json' : 'plugin.json'),
    JSON.stringify({ timestamp: new Date().toISOString(), ...evidence }, null, 2));
}
