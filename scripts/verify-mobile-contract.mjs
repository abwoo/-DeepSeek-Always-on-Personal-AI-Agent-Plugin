import { randomUUID } from 'node:crypto';
// Actual mobile screens/hooks + actual account/Harness backend. OS controls are
// explicit browser adapters: this is NOT native application/physical-phone acceptance.
import { build } from 'esbuild';
import { createServer } from 'node:http';
import { resolve, join } from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { ManagedClient } from '../dist/shared/managed-client.js';
export async function verifyMobileContract({
  base,
  connection,
  observer,
  spare,
  otherAuthorityId,
}) {
  const fixture = resolve('tests/fixtures/mobile-ui'),
    expo = join(fixture, 'expo.ts'),
    native = join(fixture, 'native.tsx'),
    files = join(fixture, 'files.ts');
  const bundle = await build({
    entryPoints: [join(fixture, 'entry.tsx')],
    bundle: true,
    write: false,
    format: 'iife',
    platform: 'browser',
    define: { 'process.env.NODE_ENV': '"test"' },
    alias: {
      react: resolve('node_modules/react'),
      'react-dom': resolve('node_modules/react-dom'),
      'react-native': native,
      'react-native-safe-area-context': native,
      '@react-native-community/datetimepicker': native,
      '@abwoo/always-on-client': resolve('src/shared/managed-client.ts'),
      '@abwoo/always-on-client/account': resolve('src/shared/account-client.ts'),
      'expo/fetch': expo,
      ...Object.fromEntries(
        [
          'expo-secure-store',
          'expo-crypto',
          'expo-auth-session',
          'expo-web-browser',
          'expo-device',
          'expo-constants',
          'expo-notifications',
        ].map((k) => [k, expo]),
      ),
      'expo-file-system': files,
      'expo-sharing': files,
    },
  });
  const server = createServer((req, res) => {
    res.setHeader('content-type', req.url === '/app.js' ? 'text/javascript' : 'text/html');
    res.end(
      req.url === '/app.js'
        ? bundle.outputFiles[0].contents
        : '<!doctype html><html><meta charset="utf-8"><body><div id="app"></div><script src="/app.js"></script></body></html>',
    );
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const browser = await chromium.launch(
      process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
    ),
    context = await browser.newContext({ viewport: { width: 430, height: 932 } }),
    page = await context.newPage();
  const evidence = {
    sourceCommit: process.env.GITHUB_SHA ?? 'local-working-tree',
    actualMobileScreensAndHooks: true,
    actualAccountController: true,
    actualHarness: true,
    osControls: 'explicit browser adapters; not native rendering/OS storage or identity',
    realIdentityProvider: false,
    realDeepSeek: false,
    realPhone: false,
    realNativePush: false,
    mvpReady: false,
  };
  let offline = false;
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  try {
    await page.addInitScript((c) => {
      window.__initialConnection = c;
    }, connection);
    await page.route('https://service-fixture.invalid/**', async (route) => {
      if (offline) return route.abort('internetdisconnected');
      const request = route.request(),
        cors = {
          'access-control-allow-origin': '*',
          'access-control-allow-headers': 'authorization,content-type',
          'access-control-allow-methods': 'GET,POST,OPTIONS',
        };
      if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
      const u = new URL(request.url());
      const r = await fetch(base + u.pathname + u.search, {
        method: request.method(),
        headers: {
          'content-type': 'application/json',
          ...(request.headers().authorization
            ? { authorization: request.headers().authorization }
            : {}),
        },
        ...(request.method() === 'POST' ? { body: request.postData() } : {}),
        redirect: 'manual',
      });
      if (
        u.pathname === '/account/v1/callback' &&
        [302, 303].includes(r.status) &&
        r.headers.get('location')?.startsWith('deepseek-always-on://')
      )
        return route.fulfill({
          status: 200,
          headers: { ...cors, 'content-type': 'application/json' },
          body: JSON.stringify({ nativeCallback: r.headers.get('location') }),
        });
      await route.fulfill({
        status: r.status,
        headers: { ...cors, 'content-type': 'application/json' },
        body: Buffer.from(await r.arrayBuffer()),
      });
    });
    await page.goto('http://127.0.0.1:' + server.address().port);
    await expect(page.getByText('Connected', { exact: false }).first()).toBeVisible({
      timeout: 20000,
    });
    const tab = async (name) => page.getByRole('tab', { name, exact: true }).click();
    const taskTitle = 'Mobile component persisted task';
    await page.getByLabel('Task name', { exact: true }).fill(taskTitle);
    await page
      .getByLabel('What should your agent do?', { exact: true })
      .fill('Deterministic read-only mobile component check');
    await page.getByLabel('Interval in minutes', { exact: true }).fill('60');
    await page.getByLabel('Allow read-only web research', { exact: true }).uncheck();
    await page.getByRole('button', { name: 'Create task', exact: true }).click();
    await expect(page.getByText(taskTitle, { exact: true })).toBeVisible({ timeout: 20000 });
    const task = (await observer.snapshot()).tasks.find((t) => t.title === taskTitle);
    assert.ok(task);
    evidence.taskId = task.id;
    const card = page.getByText(taskTitle, { exact: true }).locator('..');
    await card.getByRole('button', { name: 'Pause', exact: true }).click();
    await expect
      .poll(async () => (await observer.snapshot()).tasks.find((t) => t.id === task.id).state)
      .toBe('paused');
    await expect(card.getByRole('button', { name: 'Resume', exact: true })).toBeVisible();
    await card.getByRole('button', { name: 'Resume', exact: true }).click();
    await expect(card.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
    await card.getByRole('button', { name: 'Run now', exact: true }).click();
    await expect
      .poll(
        async () => (await observer.snapshot()).runs.find((r) => r.taskId === task.id)?.status,
        { timeout: 20000 },
      )
      .toBe('completed');
    evidence.tasksCreatePauseResumeAndNativeRun = true;
    offline = true;
    await page.getByRole('button', { name: 'Refresh', exact: true }).click();
    await expect(
      page.getByText('Offline — last confirmed data', { exact: false }).first(),
    ).toBeVisible();
    await expect(card.getByRole('button', { name: 'Run now', exact: true })).toBeDisabled();
    offline = false;
    await page.getByRole('button', { name: 'Refresh', exact: true }).click();
    await expect(page.getByText('Connected', { exact: false }).first()).toBeVisible();
    assert.ok((await observer.snapshot()).tasks.some((t) => t.id === task.id));
    evidence.transportDisconnectAndRecovery = true;
    await tab('Goals');
    await page.getByLabel('Goal name', { exact: true }).fill('Mobile component ongoing goal');
    await page
      .getByLabel('What should the agent monitor?', { exact: true })
      .fill('Authorized fixture goal, no external inference');
    await page.getByLabel('Check every N minutes', { exact: true }).fill('120');
    await page.getByRole('button', { name: 'Authorize bounded goal', exact: true }).click();
    await expect
      .poll(async () =>
        (await observer.snapshot()).goals.some((g) => g.title === 'Mobile component ongoing goal'),
      )
      .toBe(true);
    evidence.goalCreatesNativeTask = true;
    const goal = (await observer.snapshot()).goals.find(
      (g) => g.title === 'Mobile component ongoing goal',
    );
    const goalCard = page.getByText(goal.title, { exact: true }).locator('..');
    await goalCard.getByRole('button', { name: 'Pause goal', exact: true }).click();
    await expect
      .poll(async () => (await observer.snapshot()).goals.find((g) => g.id === goal.id).state)
      .toBe('paused');
    await goalCard.getByRole('button', { name: 'Resume goal', exact: true }).click();
    await expect
      .poll(async () => (await observer.snapshot()).goals.find((g) => g.id === goal.id).state)
      .toBe('active');
    evidence.goalPauseResumePersisted = true;

    await tab('Memory');
    await page
      .getByLabel('Information to remember', { exact: true })
      .fill('Mobile component consented memory');
    await expect(
      page.getByRole('button', { name: 'Save with my consent', exact: true }),
    ).toBeDisabled();
    await page
      .getByLabel('I allow this information to be used across sessions.', { exact: true })
      .check();
    await page.getByRole('button', { name: 'Save with my consent', exact: true }).click();
    await expect(
      page.getByText('Mobile component consented memory', { exact: true }),
    ).toBeVisible();
    let memory = (await observer.snapshot()).memories.find(
      (m) => m.content === 'Mobile component consented memory',
    );
    assert.ok(memory);
    await page
      .getByText('Mobile component consented memory', { exact: true })
      .locator('..')
      .getByRole('button', { name: 'Edit', exact: true })
      .click();
    await page
      .getByLabel('Information to remember', { exact: true })
      .fill('Mobile component updated memory');
    await page
      .getByLabel('I allow this information to be used across sessions.', { exact: true })
      .check();
    await page.getByRole('button', { name: 'Save with my consent', exact: true }).click();
    await expect
      .poll(
        async () => (await observer.snapshot()).memories.find((m) => m.id === memory.id)?.content,
      )
      .toBe('Mobile component updated memory');
    evidence.memoryConsentAndRevisionEdit = true;
    await tab('Chat');
    await page.getByRole('button', { name: 'New conversation', exact: true }).click();
    await expect(page.getByLabel('Message your agent', { exact: true })).toBeVisible();
    await page
      .getByLabel('Message your agent', { exact: true })
      .fill('Actual mobile component native Session message');
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    await expect(page.getByText('Fixture check complete.', { exact: true }).first()).toBeVisible({
      timeout: 20000,
    });
    evidence.actualSharedSessionChat = true;
    await page.getByLabel('Message your agent', { exact: true }).fill('FIXTURE_PROPOSE_MEMORY');
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    await expect
      .poll(
        async () =>
          (await observer.snapshot()).memories.find(
            (m) => m.content === 'Mobile proposal requires consent',
          )?.consent,
      )
      .toBe(false);
    await tab('Memory');
    await page
      .getByText('Mobile proposal requires consent', { exact: true })
      .locator('..')
      .getByRole('button', { name: 'Review and confirm', exact: true })
      .click();
    await expect(
      page.getByRole('button', { name: 'Save with my consent', exact: true }),
    ).toBeDisabled();
    await page
      .getByLabel('I allow this information to be used across sessions.', { exact: true })
      .check();
    await page.getByRole('button', { name: 'Save with my consent', exact: true }).click();
    await expect
      .poll(
        async () =>
          (await observer.snapshot()).memories.find(
            (m) => m.content === 'Mobile proposal requires consent',
          )?.consent,
      )
      .toBe(true);
    evidence.nativeMemoryProposalNeedsExplicitUiConsent = true;
    await tab('Chat');
    await page.getByLabel('Message your agent', { exact: true }).fill('FIXTURE_HANG');
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    await expect(page.getByText('Agent running', { exact: true })).toBeVisible({ timeout: 15000 });
    await page.getByRole('button', { name: 'Cancel current turn', exact: true }).click();
    await expect(page.getByText('Agent running', { exact: true })).toHaveCount(0, {
      timeout: 15000,
    });
    evidence.nativeChatCancellationObserved = true;

    await tab('Inbox');
    const notices = (await observer.snapshot()).inbox;
    const notice = notices.find((n) => n.title === taskTitle);
    assert.ok(notice);
    await page
      .getByText(notice.title, { exact: false })
      .locator('..')
      .getByRole('button', { name: 'Mark read', exact: true })
      .click();
    await expect
      .poll(async () => (await observer.snapshot()).inbox.find((n) => n.id === notice.id).read)
      .toBe(true);
    evidence.inboxReadPersisted = true;
    await tab('Activity');
    await page.getByRole('button', { name: 'Open task result', exact: true }).first().click();
    await expect(page.getByText('Selected task execution', { exact: false })).toBeVisible();
    evidence.runHistoryNavigation = true;
    await tab('Devices');
    const target = page.getByText('Mobile component spare device', { exact: true }).locator('..');
    await expect(target).toBeVisible();
    await target.getByRole('button', { name: 'Revoke device', exact: true }).click();
    await expect
      .poll(
        async () =>
          (await observer.request('/devices')).items.find(
            (d) => d.id === spare.credentials.deviceId,
          ).revoked,
      )
      .toBe(1);
    evidence.deviceRevocationPersisted = true;
    await tab('Settings');
    await page.getByRole('button', { name: 'Export personal agent records', exact: true }).click();
    await expect
      .poll(() => page.evaluate(() => window.__exportText ?? ''))
      .toContain('"complete":true');
    assert.ok((await page.evaluate(() => window.__exportText)).includes(task.id));
    evidence.pagedExportUsesFileAdapter = true;
    await tab('Memory');
    await page
      .getByText('Mobile component updated memory', { exact: true })
      .locator('..')
      .getByRole('button', { name: 'Delete', exact: true })
      .click();
    await expect
      .poll(async () => (await observer.snapshot()).memories.some((m) => m.id === memory.id))
      .toBe(false);
    evidence.memoryDeletionPersisted = true;
    // Unsaved consent/text must not appear after sign out or process restoration.
    await page.getByLabel('Information to remember', { exact: true }).fill('UNSAVED PRIVATE FORM');
    await page
      .getByLabel('I allow this information to be used across sessions.', { exact: true })
      .check();
    await page.evaluate(() => {
      window.__failCacheChunk = true;
    });
    await observer.mutate(randomUUID(), {
      action: 'task.control',
      data: { id: task.id, state: 'paused' },
    });
    await expect
      .poll(() =>
        page.evaluate(() =>
          window
            .__secureKeys()
            .some((k) => k.startsWith('always-on.cache.') && k.endsWith('.pending')),
        ),
      )
      .toBe(true);
    await tab('Settings');
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
    assert.equal(await page.getByText('UNSAVED PRIVATE FORM', { exact: true }).count(), 0);
    evidence.signOutReturnsToWelcome = true;
    assert.equal(
      await page.evaluate(() =>
        window.__secureKeys().some((k) => k.startsWith('always-on.cache.')),
      ),
      false,
    );
    await page.evaluate(() => {
      window.__failCacheChunk = false;
    });
    evidence.interruptedCacheGenerationRemovedOnLogout = true;
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page.getByText('Connected', { exact: false }).first()).toBeVisible({
      timeout: 20000,
    });
    await tab('Memory');
    await expect(page.getByLabel('Information to remember', { exact: true })).toHaveValue('');
    await expect(
      page.getByLabel('I allow this information to be used across sessions.', { exact: true }),
    ).not.toBeChecked();
    await expect(page.getByText('UNSAVED PRIVATE FORM', { exact: true })).toHaveCount(0);
    assert.equal((await page.evaluate(() => window.__boundIdentity)).authorityId, otherAuthorityId);
    assert.notEqual(otherAuthorityId, connection.credentials.authorityId);
    evidence.fixtureSignInAndAccountSwitchClearPrivateDrafts = true;
    await tab('Settings');
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
    assert.deepEqual(errors, []);
    await mkdir('test-results', { recursive: true });
    await writeFile(
      'test-results/mobile-component-contract.json',
      JSON.stringify(evidence, null, 2),
    );
  } catch (e) {
    await mkdir('test-results', { recursive: true });
    await writeFile(
      'test-results/mobile-component-contract.json',
      JSON.stringify({ ...evidence, failure: e.message, browserErrors: errors }, null, 2),
    );
    await writeFile(
      'test-results/mobile-component-failure.txt',
      await page.locator('body').innerText(),
    );
    await page.screenshot({ path: 'test-results/mobile-component-failure.png', fullPage: true });
    throw e;
  } finally {
    await context.close();
    await browser.close();
    await new Promise((r) => server.close(r));
  }
}
