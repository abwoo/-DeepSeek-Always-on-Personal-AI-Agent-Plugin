import {test,expect,type BrowserContext} from '@playwright/test';
import {spawn,type ChildProcess} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
let child:ChildProcess,dir:string,url:string;
async function start(){const home=resolve('.artifacts/dsh');child=spawn(process.execPath,['node_modules/@deepseek-ai/dsh/lib/bin.js','web','--no-open','--port','4317'],{cwd:process.cwd(),env:{...process.env,DSH_HOME:home,ALWAYS_ON_DATA_DIR:dir},stdio:['ignore','pipe','pipe']});url=await new Promise<string>((ok,bad)=>{let output='';const timer=setTimeout(()=>bad(new Error('Harness did not start: '+output.replace(/token=[^\s]+/g,'token=REDACTED'))),80000);const observe=(chunk:Buffer)=>{output+=chunk.toString();const match=output.match(/dsh web: (http:\/\/127\.0\.0\.1:4317\/\?token=[^\s]+)/);if(match){clearTimeout(timer);ok(match[1]!);}};child.stdout!.on('data',observe);child.stderr!.on('data',observe);child.on('exit',code=>{clearTimeout(timer);bad(new Error('Harness exited '+code+': '+output.replace(/token=[^\s]+/g,'token=REDACTED')));});});}
async function stop(){if(!child||child.exitCode!==null)return;child.kill('SIGTERM');await new Promise<void>(ok=>{const timer=setTimeout(()=>{child.kill('SIGKILL');ok();},10000);child.once('exit',()=>{clearTimeout(timer);ok();});});}
async function auth(context:BrowserContext){const page=await context.newPage();await page.goto(url);return page;}
test.describe.configure({mode:'serial'});
test.beforeAll(async()=>{dir=await mkdtemp(join(tmpdir(),'always-on-e2e-'));await start();});
test.afterAll(async()=>{await stop();await rm(dir,{recursive:true,force:true});});
test('real Harness refuses unauthenticated plugin API',async({request})=>{const r=await request.get('http://127.0.0.1:4317/api/always-on');expect([401,403]).toContain(r.status());});
test('native sidebar loads plugin, mobile task creation and cross-device memory survive Host restart',async({browser})=>{
 const phone=await browser.newContext({viewport:{width:390,height:844}});const p=await auth(phone);await p.getByText('Always-on',{exact:true}).click();await expect(p.getByRole('heading',{name:'Always-on',exact:true})).toBeVisible();
 await p.getByRole('button',{name:'Tasks',exact:true}).click();await p.getByLabel('Task name').fill('EEG research watch');await p.getByLabel('What should your agent check?').fill('Check for new reproducible EEG methods and cite the original papers.');await p.getByRole('button',{name:'Create task',exact:true}).click();await expect(p.getByRole('heading',{name:'EEG research watch'})).toBeVisible();
 await p.getByRole('button',{name:'Memory',exact:true}).click();await p.getByLabel('Information to remember').fill('My research concerns reproducible EEG methods.');await p.getByLabel('I allow this information to be used across sessions.').check();await p.getByRole('button',{name:'Save with my consent'}).click();await expect(p.locator('.ao pre')).toContainText('reproducible EEG');
 await p.screenshot({path:'test-results/mobile-harness.png',fullPage:true});expect(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();await phone.close();
 const desktop=await browser.newContext({viewport:{width:1440,height:900}});const d=await auth(desktop);await d.getByText('Always-on',{exact:true}).click();await d.getByRole('button',{name:'Memory',exact:true}).click();await expect(d.locator('.ao pre')).toContainText('reproducible EEG');await d.screenshot({path:'test-results/desktop-harness.png',fullPage:true});
 const before=await(await desktop.request.get('http://127.0.0.1:4317/api/always-on')).json();expect(before.tasks).toHaveLength(1);await desktop.close();
 await stop();await start();const reopened=await browser.newContext();await auth(reopened);const after=await(await reopened.request.get('http://127.0.0.1:4317/api/always-on')).json();expect(after.tasks[0].id).toBe(before.tasks[0].id);expect(after.memories[0].content).toBe(before.memories[0].content);await reopened.close();
});
