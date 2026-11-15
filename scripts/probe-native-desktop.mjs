// Runs only against an actual official installed macOS/Windows application in disposable CI.
// Native integration and remote Session control only; never certifies model execution or MVP readiness.
import { fetch } from './native-probe-http.mjs';
import { chromium, expect } from '@playwright/test';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { createServer } from 'node:http';
import { dirname, join, resolve } from 'node:path';
import { ManagedClient } from '../dist/shared/managed-client.js';
import { connectProbe } from '../dist/remote/probe-connection.js';
const executable = process.env.ALWAYS_ON_DESKTOP_EXE;
if (!['win32', 'darwin'].includes(process.platform) || !executable) throw new Error('Real installed native Desktop required');
const output = process.platform === 'win32' ? '.artifacts/windows-desktop' : '.artifacts/macos-desktop';
await mkdir(output, { recursive: true });
const evidence = { platform: process.platform, nativePlugin: false, restartPersistence: false,
  remoteDesktopSession: false, realDeepSeek: false, realPhone: false, mvpReady: false };
let remoteProcess, observer, phoneClient, pairingCode;
async function verifyRuntime() {
  const root = process.platform === 'win32' ? join(dirname(executable), 'resources', 'app.asar', 'dsh')
    : join(dirname(executable), '..', 'Resources', 'app.asar', 'dsh');
  const script = `const fs=require('node:fs'); const path=require('node:path');
    const p=path.join(process.env.ALWAYS_ON_PHASE0_RESOURCE_ROOT,'node_modules','@deepseek-ai','cordis','package.json');
    const read=name=>{try{return JSON.parse(fs.readFileSync(path.join(process.env.ALWAYS_ON_PHASE0_RESOURCE_ROOT,'node_modules',name,'package.json'),'utf8')).version;}catch{return null;}};console.log(JSON.stringify({cordis:JSON.parse(fs.readFileSync(p,'utf8')).version,undici:read('undici'),fflate:read('fflate'),mcpClient:read('@modelcontextprotocol/client')}));`;
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
    ALWAYS_ON_DOCUMENTS_DIR: join(root, 'documents'),ALWAYS_ON_GATEWAY_ALLOW_LOOPBACK:'1' };
  const cli = resolve('node_modules/@deepseek-ai/dsh/lib/bin.js');
  const version = JSON.parse(await readFile('package.json', 'utf8')).version;
  await promisify(execFile)(process.execPath, [cli, 'plugin', '--profile', 'web', 'add',
    resolve(`abwoo-deepseek-always-on-${version}.tgz`)], { env, timeout: 120000 });
  await promisify(execFile)(process.execPath,[cli,'plugin','--profile','web','add',resolve('abwoo-deepseek-always-on-managed-0.2.0-dev.1.tgz')],{env,timeout:120000});
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
  delete process.env.ALWAYS_ON_DESKTOP_OPERATOR_PREVIEW;
  process.env.ALWAYS_ON_DESKTOP_ADVANCED_PAIRING='1';
  process.env.ALWAYS_ON_DESKTOP_REMOTE_ORIGIN = url.origin;
  process.env.ALWAYS_ON_DESKTOP_REMOTE_TOKEN = url.searchParams.get('token');
  process.env.ALWAYS_ON_DESKTOP_ALLOW_LOOPBACK = '1';
  const login=await fetch(url,{redirect:'manual'});const cookie=login.headers.getSetCookie().map(s=>s.split(';')[0]).join('; ');
  async function pairCode(){const response=await fetch(url.origin+'/api/always-on-managed/admin',{method:'POST',headers:{cookie,'content-type':'application/json'},body:JSON.stringify({action:'pair.create'})});if(!response.ok)throw Error('Pairing admin unavailable');return (await response.json()).code;}
  const pairedPhone=await ManagedClient.pair(url.origin,await pairCode(),'Independent mobile protocol observer','other',true);
  phoneClient=new ManagedClient(pairedPhone.origin,pairedPhone.credentials,undefined,true);pairingCode=await pairCode();
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
    if(!process.argv.includes('--initialize')&&!process.argv.includes('--plugins-ui'))await expect.poll(async()=>page.evaluate(async()=>{try{return (await fetch('/api/always-on')).status;}catch{return 0;}}),{timeout:30000}).toBe(200);
    await action(page);
  } finally {
    await browser?.close().catch(() => {});
    // Only this newly spawned disposable CI app tree. No user machine is touched.
    await stopTree(child);
  }
}
async function pluginsUi() {
  const archive = await readFile(resolve('abwoo-deepseek-always-on-desktop-0.3.0-dev.1.tgz'));
  const server = createServer((req,res) => {
    if(req.url!=='/desktop.tgz'){res.writeHead(404);res.end();return;}
    res.writeHead(200,{'content-type':'application/gzip','content-length':archive.length});res.end(archive);
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const spec=`http://127.0.0.1:${server.address().port}/desktop.tgz`;
  async function guarded(work){await boot(async page=>{try{await work(page);}catch(e){await writeFile(join(output,'plugins-ui-dom.txt'),await page.locator('body').innerText());await capture(page,'plugins-ui-failure.png');throw e;}});}
  async function detail(page){await page.getByText('Plugins',{exact:true}).first().click();await page.getByRole('button',{name:'View DeepSeek Always-on Personal Agent',exact:true}).click();}
  async function install(page){
    await page.getByText('Plugins',{exact:true}).first().click();
    await page.getByRole('button',{name:'Add plugin',exact:true}).click();
    await page.getByRole('textbox',{name:'Package name or address',exact:true}).fill(spec);
    await page.getByRole('button',{name:'Install',exact:true}).click();
    const confirm=page.getByRole('button',{name:'Install',exact:true});
    if(await confirm.waitFor({state:'visible',timeout:10000}).then(()=>true).catch(()=>false))await confirm.click();
    const enable=page.getByRole('button',{name:'Enable now',exact:true});
    await enable.waitFor({state:'visible',timeout:150000});await enable.click();
    // The pinned Desktop can require a Host restart; verify actual activation on the next launch.
  }
  try {
    await guarded(async page=>{await install(page);});
    await guarded(async page=>{
      await expect(page.getByText('Personal Agent',{exact:true}).first()).toBeVisible({timeout:30000});evidence.graphicalInstallation=true;
      await detail(page);const toggle=page.getByRole('switch',{name:'Enable DeepSeek Always-on Personal Agent',exact:true});await toggle.click();await expect(toggle).not.toBeChecked();
    });
    await guarded(async page=>{
      await expect(page.getByText('Personal Agent',{exact:true})).toHaveCount(0,{timeout:30000});evidence.graphicalDisable=true;
      await detail(page);const toggle=page.getByRole('switch',{name:'Enable DeepSeek Always-on Personal Agent',exact:true});await toggle.click();await expect(toggle).toBeChecked();
    });
    await guarded(async page=>{
      await expect(page.getByText('Personal Agent',{exact:true}).first()).toBeVisible({timeout:30000});evidence.graphicalEnable=true;
      await detail(page);await capture(page,'plugins-ui.png');
      await page.getByRole('button',{name:'Uninstall DeepSeek Always-on Personal Agent',exact:true}).click();
      await page.getByRole('dialog').getByRole('button',{name:'Uninstall',exact:true}).click();
      await expect(page.getByRole('button',{name:'Add plugin',exact:true})).toBeVisible({timeout:90000});
    });
    await guarded(async page=>{await expect(page.getByText('Personal Agent',{exact:true})).toHaveCount(0,{timeout:30000});evidence.graphicalUninstall=true;await install(page);});
    await guarded(async page=>{await expect(page.getByText('Personal Agent',{exact:true}).first()).toBeVisible({timeout:30000});});
    evidence.graphicalReinstall=true;evidence.graphicalRestart=true;
    evidence.distribution='actual official Plugins UI, local HTTP immutable tarball fixture; not published npm/live service';
  }finally{await new Promise(resolve=>server.close(resolve));}
}

try {
  await verifyRuntime();
  if (process.argv.includes('--initialize')) {
    await boot(async (page) => {
      await capture(page, 'initialized.png');
    });
    evidence.profileInitialized = true;
  } else if (process.argv.includes('--plugins-ui')) {
    await pluginsUi();
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
      await page.getByLabel('HTTPS service address').fill(evidence.remoteAuthority);
      await page.getByLabel('One-use pairing code').fill(pairingCode);
      await page.getByLabel('Device name').fill('Actual native Desktop');
      await page.getByRole('button',{name:'Pair Desktop',exact:true}).click();
      await expect(page.getByTestId('desktop-remote-authority')).toContainText(evidence.remoteAuthority);
      await expect(page.getByText('Connected',{exact:true})).toBeVisible();
      const pairedStatus=await page.evaluate(async()=>(await fetch('/api/always-on-desktop/status')).json());
      if(pairedStatus.credentialMode!=='device-pairing'||!pairedStatus.deviceId)throw Error('Desktop did not use revocable device credentials');
      evidence.nativeDevicePairing=true;
      await page.getByRole('button', { name: 'Tasks', exact: true }).click();
      await page.getByLabel('Task name').fill('Personal Agent shared task');
      await page.getByLabel('What should your agent check?').fill('Remote-only read-only development check.');
      await page.getByRole('button', { name: 'Create task', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Personal Agent shared task' })).toBeVisible();
      const shared = await (await observer.alwaysOn('GET')).json();
      sharedTaskId = shared.tasks.find((t) => t.title === 'Personal Agent shared task')?.id;
      if (!sharedTaskId) throw new Error('Desktop task mutation did not persist on the remote authority');
      const phoneState=await phoneClient.snapshot();if(!phoneState.tasks.some(t=>t.id===sharedTaskId))throw Error('Mobile protocol reads a different authority');
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
      await expect(page.getByText('Connected', { exact: true })).toBeVisible();
      await expect(page.getByText('Phase 1 actual native conversation input', { exact: true })).toBeVisible();
      evidence.desktopSharedTaskId = sharedTaskId;
      evidence.desktopSessionId = personalSessionId;
      evidence.desktopSharedMemory = true;
      const sharedSession=await phoneClient.readSession(personalSessionId);if(!JSON.stringify(sharedSession).includes('Phase 1 actual native conversation input'))throw Error('Mobile protocol did not read the same Desktop Session');
      evidence.nativeDesktopAndMobileProtocolSameAuthority=true;
      await capture(page, 'personal-agent.png');
      await page.getByRole('button',{name:'Goals',exact:true}).click();
      await page.getByLabel('Goal name').fill('Native shared ongoing goal');
      await page.getByLabel('What should the agent watch?').fill('Read-only goal mutation check; no model execution claimed.');
      await page.getByRole('button',{name:'Create ongoing goal',exact:true}).click();
      await expect(page.getByRole('heading',{name:'Native shared ongoing goal',exact:true})).toBeVisible();
      const goals=await phoneClient.snapshot();const goal=goals.goals.find(g=>g.title==='Native shared ongoing goal');if(!goal||!goals.tasks.some(t=>t.id===goal.taskId&&t.maxRuns===30))throw Error('Native goal form did not create a shared bounded task');
      evidence.nativeGoalUiPersistent=true;
      await page.getByRole('button',{name:'Devices',exact:true}).click();
      await expect(page.getByRole('heading',{name:'Actual native Desktop',exact:true})).toBeVisible();
      await page.getByRole('button',{name:'Pair another device',exact:true}).click();
      await expect(page.getByText('One-use code expires',{exact:false})).toBeVisible();
      const code=await page.locator('.ao article pre').innerText();
      const another=await ManagedClient.pair(evidence.remoteAuthority,code,'Native UI pairing proof','other',true);if(another.credentials.authorityId!==phoneClient.credentials.authorityId)throw Error('Native pairing UI issued another authority');
      const extra=new ManagedClient(another.origin,another.credentials,undefined,true);await extra.request('/devices/revoke',{deviceId:extra.credentials.deviceId});
      evidence.nativeDeviceManagementUi=true;

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
      const credential=await page.evaluate(async()=>(await fetch('/api/always-on-desktop/status')).json());
      await phoneClient.request('/devices/revoke',{deviceId:credential.deviceId});
      const unauthorized=await page.evaluate(async()=>{const r=await fetch('/api/always-on-desktop/state');return r.status;});if(unauthorized!==503)throw Error('Revoked Desktop credential still accessed state');
      await expect(page.getByRole('button',{name:'Pair Desktop',exact:true})).toBeVisible({timeout:10000});
      const rePair=await phoneClient.request('/devices/pair-code',{});
      await page.getByLabel('HTTPS service address').fill(evidence.remoteAuthority);await page.getByLabel('One-use pairing code').fill(rePair.code);await page.getByLabel('Device name').fill('Repaired actual Desktop');await page.getByRole('button',{name:'Pair Desktop',exact:true}).click();
      await expect(page.getByText('Connected',{exact:true})).toBeVisible({timeout:10000});
      const restored=await page.evaluate(async()=>(await fetch('/api/always-on-desktop/state')).json());if(!restored.tasks.some(t=>t.id===sharedTaskId)||restored.connection.deviceId===credential.deviceId)throw Error('Re-pair did not restore the same authority with a new device credential');
      evidence.nativeRevocationAndRePair=true;
    });
  }
} catch (error) {
  evidence.blocker = error.message;
  throw error;
} finally {
  await observer?.close();
  await stopTree(remoteProcess);
  await writeFile(join(output, process.argv.includes('--initialize') ? 'initialize.json' : process.argv.includes('--plugins-ui') ? 'plugins-ui.json' : 'plugin.json'),
    JSON.stringify({ timestamp: new Date().toISOString(), ...evidence }, null, 2));
}
