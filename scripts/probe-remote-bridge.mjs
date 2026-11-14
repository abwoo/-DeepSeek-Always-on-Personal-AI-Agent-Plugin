// Real two-Host HTTP adapter contract check. No model fixture; no model success claim.
import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import assert from 'node:assert/strict';
const cli=resolve('node_modules/@deepseek-ai/dsh/lib/bin.js');
const version=JSON.parse(await (await import('node:fs/promises')).readFile('package.json','utf8')).version;
const dir=await mkdtemp(join(tmpdir(),'phase0-bridge-'));const children=[];
async function run(args,env){return promisify(execFile)(process.execPath,[cli,...args],{env,timeout:60000});}
async function boot(name,extra={}){
 const env={...process.env,DSH_HOME:join(dir,name),ALWAYS_ON_DATA_DIR:join(dir,name+'-data'),ALWAYS_ON_DOCUMENTS_DIR:join(dir,name+'-docs'),...extra};
 const child=spawn(process.execPath,[cli,'web','--patch',resolve('deploy/headless.patch.yml'),'--no-open','--port','0'],{env,stdio:['ignore','pipe','pipe']});children.push(child);
 const url=await new Promise((ok,bad)=>{let log='';const t=setTimeout(()=>bad(Error('timeout')),30000); const f=c=>{log+=c;const m=log.match(/dsh web: (http:\/\/127\.0\.0\.1:\d+\/\?token=[^\s]+)/);if(m){clearTimeout(t);ok(new URL(m[1]));}};child.stdout.on('data',f);child.stderr.on('data',f);child.on('exit',()=>{clearTimeout(t);bad(Error(log.replace(/token=\S+/g,'token=REDACTED')));});});return {url,env};
}
try{
 await run(['plugin','--profile','web','add',resolve(`abwoo-deepseek-always-on-${version}.tgz`)],{...process.env,DSH_HOME:join(dir,'authority')});
 const a=await boot('authority');
 await run(['plugin','--profile','web','add',resolve('abwoo-always-on-desktop-remote-probe-0.0.0-phase0.tgz')],{...process.env,DSH_HOME:join(dir,'proxy')});
 await run(['plugin','--profile','web','add',resolve('abwoo-deepseek-always-on-desktop-0.2.0-dev.1.tgz')],{...process.env,DSH_HOME:join(dir,'proxy')});
 const b=await boot('proxy',{ALWAYS_ON_PHASE0_REMOTE_ORIGIN:a.url.origin,ALWAYS_ON_PHASE0_REMOTE_TOKEN:a.url.searchParams.get('token'),ALWAYS_ON_PHASE0_ALLOW_LOOPBACK:'1',ALWAYS_ON_DESKTOP_OPERATOR_PREVIEW:'1',ALWAYS_ON_DESKTOP_REMOTE_ORIGIN:a.url.origin,ALWAYS_ON_DESKTOP_REMOTE_TOKEN:a.url.searchParams.get('token'),ALWAYS_ON_DESKTOP_ALLOW_LOOPBACK:'1'});
 const endpoint=b.url.origin+'/api/always-on-phase0-remote';
 assert.equal((await fetch(endpoint,{method:'POST',body:'{}'})).status,401);
 const login=await fetch(b.url,{redirect:'manual'});const cookie=login.headers.getSetCookie().map(x=>x.split(';')[0]).join('; ');
 const call=async command=>{const r=await fetch(endpoint,{method:'POST',headers:{cookie,origin:b.url.origin,'content-type':'application/json'},body:JSON.stringify(command)});const x=await r.json();assert.equal(r.status,200,JSON.stringify(x));return x;};
 const created=await call({action:'create'});assert.equal(created.authority,a.url.origin);
 const renamed=await call({action:'rename',sessionId:created.sessionId,title:'Real remote bridge proof'});assert.ok(JSON.stringify(renamed.events).includes('Real remote bridge proof'));
 const prompt=await call({action:'prompt',sessionId:created.sessionId,requestId:crypto.randomUUID(),text:'Real remote input receipt; no model success claimed.'});assert.equal(prompt.promptAccepted,true);
 const desktop = b.url.origin+'/api/always-on-desktop';
 const read = async () => {const r=await fetch(desktop+'/state',{headers:{cookie}});assert.equal(r.status,200);return r.json();};
 const mutate = async (command) => {const r=await fetch(desktop+'/state',{method:'POST',headers:{cookie,'content-type':'application/json'},body:JSON.stringify(command)});assert.equal(r.status,200,await r.clone().text());return r.json();};
 assert.equal((await fetch(desktop+'/state')).status,401);
 assert.equal((await read()).connection.authority,a.url.origin);
 const task=await mutate({action:'task.create',data:{title:'Shared Desktop task',instruction:'Read-only native bridge check.',timing:{kind:'every',every_seconds:3600}}});
 await mutate({action:'memory.save',data:{kind:'preference',content:'Explicit remote memory consent proof',source:'Integration check',consent:true}});
 const remoteLogin=await fetch(a.url,{redirect:'manual'});const remoteCookie=remoteLogin.headers.getSetCookie().map(x=>x.split(';')[0]).join('; ');
 const remoteState=await (await fetch(a.url.origin+'/api/always-on',{headers:{cookie:remoteCookie}})).json();
 assert.ok(remoteState.tasks.some(t=>t.id===task.result.id));
 assert.ok(remoteState.memories.some(m=>m.content==='Explicit remote memory consent proof'));
 const invalid=await fetch(desktop+'/state',{method:'POST',headers:{cookie,'content-type':'application/json'},body:JSON.stringify({action:'push.subscribe',data:{}})});assert.equal(invalid.status,400);
 // An actual authority shutdown must close the transport and block writes, never redirect locally.
 children[0].kill('SIGTERM');await new Promise(r=>children[0].once('exit',r));
 const offline=await fetch(desktop+'/state',{headers:{cookie}});assert.equal(offline.status,503);
 const refused=await fetch(desktop+'/state',{method:'POST',headers:{cookie,'content-type':'application/json'},body:JSON.stringify({action:'memory.save',data:{}})});assert.equal(refused.status,503);
 const evidence={desktopSharedState:true,desktopOfflineWriteRefused:true,timestamp:new Date().toISOString(),authenticatedBridge:true,sameAuthority:true,sessionId:created.sessionId,promptReceipt:true,modelSuccess:false,mvpReady:false};
 await (await import('node:fs/promises')).writeFile('.artifacts/phase0-bridge.json',JSON.stringify(evidence,null,2));
 console.log(JSON.stringify(evidence));
}finally{for(const c of children)c.kill('SIGTERM');await new Promise(r=>setTimeout(r,500));for(const c of children)if(c.exitCode===null)c.kill('SIGKILL');await rm(dir,{recursive:true,force:true});}
