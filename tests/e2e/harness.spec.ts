import { connectProbe } from '../../src/remote/probe-connection.js';
import { test, expect, type BrowserContext } from '@playwright/test';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
let child: ChildProcess, dir: string, url: string;
async function start() {
  const home = resolve('.artifacts/dsh');
  child = spawn(
    process.execPath,
    [
      'node_modules/@deepseek-ai/dsh/lib/bin.js',
      'web',
      '--patch',
      resolve('deploy/headless.patch.yml'),
      '--no-open',
      '--port',
      '4317',
    ],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        DSH_HOME: home,
        ALWAYS_ON_DATA_DIR: dir,
        ALWAYS_ON_DOCUMENTS_DIR: join(dir, 'documents'),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  url = await new Promise<string>((ok, bad) => {
    let output = '';
    const timer = setTimeout(
      () =>
        bad(
          new Error('Harness did not start: ' + output.replace(/token=[^\s]+/g, 'token=REDACTED')),
        ),
      80000,
    );
    const observe = (chunk: Buffer) => {
      output += chunk.toString();
      const match = output.match(/dsh web: (http:\/\/127\.0\.0\.1:4317\/\?token=[^\s]+)/);
      if (match) {
        clearTimeout(timer);
        ok(match[1]!);
      }
    };
    child.stdout!.on('data', observe);
    child.stderr!.on('data', observe);
    child.on('exit', (code) => {
      clearTimeout(timer);
      bad(
        new Error(
          'Harness exited ' + code + ': ' + output.replace(/token=[^\s]+/g, 'token=REDACTED'),
        ),
      );
    });
  });
}
async function stop() {
  if (!child || child.exitCode !== null) return;
  child.kill('SIGTERM');
  await new Promise<void>((ok) => {
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      ok();
    }, 10000);
    child.once('exit', () => {
      clearTimeout(timer);
      ok();
    });
  });
}
async function auth(context: BrowserContext) {
  const page = await context.newPage();
  await page.goto(url);
  // Notice acknowledgment is Host-wide, so a second device may not see it.
  for (const [title, button] of [
    ['Preview Notice', 'Continue'],
    ['Get started', 'Close'],
  ]) {
    const dialog = page.getByRole('dialog', { name: title, exact: true });
    const visible = await dialog
      .waitFor({ state: 'visible', timeout: 5000 })
      .then(() => true)
      .catch((error) => {
        if (error.name !== 'TimeoutError') throw error;
        return false;
      });
    if (visible) await dialog.getByRole('button', { name: button, exact: true }).click();
  }
  return page;
}
test.describe.configure({ mode: 'serial' });
test.beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'always-on-e2e-'));
  await start();
});
test.afterAll(async () => {
  await stop();
  await rm(dir, { recursive: true, force: true });
});
test('real Harness refuses unauthenticated plugin API', async ({ request }) => {
  const r = await request.get('http://127.0.0.1:4317/api/always-on');
  expect([401, 403]).toContain(r.status());
});
test('native sidebar loads plugin, mobile task creation and cross-device memory survive Host restart', async ({
  browser,
}) => {
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const p = await auth(phone);
  await p.locator('[data-sidebar-opener]').click();
  await p.getByText('Always-on', { exact: true }).click();
  await expect(p.getByRole('heading', { name: 'Always-on', exact: true })).toBeVisible();
  await expect(
    p.getByText('Unable to create default workspace. Use Choose workspace to select a folder.', {
      exact: true,
    }),
  ).not.toBeVisible();
  await p.getByRole('button', { name: 'Tasks', exact: true }).click();
  await p.getByLabel('Task name').fill('EEG research watch');
  await p
    .getByLabel('What should your agent check?')
    .fill('Check for new reproducible EEG methods and cite the original papers.');
  await p.getByRole('button', { name: 'Create task', exact: true }).click();
  await expect(p.getByRole('heading', { name: 'EEG research watch' })).toBeVisible();
  await p.getByRole('button', { name: 'Memory', exact: true }).click();
  await p
    .getByLabel('Information to remember')
    .fill('My research concerns reproducible EEG methods.');
  await p.getByLabel('I allow this information to be used across sessions.').check();
  await p.getByRole('button', { name: 'Save with my consent' }).click();
  await expect(p.locator('.ao pre')).toContainText('reproducible EEG');
  await p.screenshot({ path: 'test-results/mobile-harness.png', fullPage: true });
  expect(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await phone.close();
  const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const d = await auth(desktop);
  await d.getByText('Always-on', { exact: true }).click();
  await d.getByRole('button', { name: 'Memory', exact: true }).click();
  await expect(d.locator('.ao pre')).toContainText('reproducible EEG');
  await d.screenshot({ path: 'test-results/desktop-harness.png', fullPage: true });
  const before = await (await desktop.request.get('http://127.0.0.1:4317/api/always-on')).json();
  expect(before.tasks).toHaveLength(1);
  await desktop.close();
  await stop();
  await start();
  const reopened = await browser.newContext();
  await auth(reopened);
  const after = await (await reopened.request.get('http://127.0.0.1:4317/api/always-on')).json();
  expect(after.tasks[0].id).toBe(before.tasks[0].id);
  expect(after.memories[0].content).toBe(before.memories[0].content);
  await reopened.close();
});

// Real network + real published Harness; no model fixture and no Desktop claim.
test('Phase 0: independent SDK clients share one durable remote Session', async ({}, testInfo) => {
  const endpoint = new URL(url);
  const connect = () => connectProbe(endpoint.origin, endpoint.searchParams.get('token')!, true);
  await expect(connectProbe(endpoint.origin, 'invalid-token', true)).rejects.toThrow('HTTP 401');
  const a = await connect();
  const b = await connect();
  let id;
  try {
    const created = await a.session.create({});
    expect(created.ok).toBe(true);
    if (!created.ok) throw created.error;
    id = created.value.sessionId;
    const renamed = await b.session.rename({ sessionId: id, title: 'Phase 0 remote authority proof' });
    expect(renamed.ok).toBe(true);
    const events = await a.session.events({ address: { kind: 'session', sessionId: id } });
    expect(events.ok).toBe(true);
    expect(JSON.stringify(events)).toContain('Phase 0 remote authority proof');
  } finally {
    await a.close();
    await b.close();
  }
  await stop();
  await start();
  const restarted = new URL(url);
  const c = await connectProbe(restarted.origin, restarted.searchParams.get('token')!, true);
  try {
    const events = await c.session.events({ address: { kind: 'session', sessionId: id! } });
    expect(events.ok).toBe(true);
    expect(JSON.stringify(events)).toContain('Phase 0 remote authority proof');
    await testInfo.attach('phase0-protocol-evidence', {
      contentType: 'application/json',
      body: Buffer.from(JSON.stringify({
        timestamp: new Date().toISOString(),
        harness: '0.2.2-rc.3', cordis: '4.1.0',
        authority: 'disposable-loopback-Harness', sessionId: id,
        clients: 2, remoteWriteRead: true, survivedHostRestart: true,
        invalidCredentialRejected: true,
        actualDesktopTested: false, realModelTested: false,
        nativePhoneTested: false, mvpReady: false,
      }, null, 2)),
    });
  } finally { await c.close(); }
});
