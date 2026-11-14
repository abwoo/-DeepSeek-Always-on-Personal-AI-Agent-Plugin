import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp,rm,mkdir,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import assert from 'node:assert/strict';
const dir=await mkdtemp(join(tmpdir(),'always-on-managed-'));const cli=resolve('node_modules/@deepseek-ai/dsh/lib/bin.js');
const env={...process.env,DSH_HOME:join(dir,'profile'),ALWAYS_ON_DATA_DIR:join(dir,'data'),ALWAYS_ON_GATEWAY_ALLOW_LOOPBACK:'1',ALWAYS_ON_DOCUMENTS_DIR:join(dir,'documents')};
const run=args=>promisify(execFile)(process.execPath,[cli,...args],{env,timeout:120000});
let child;
async function boot(){
 child=spawn(process.execPath,[cli,'web','--patch',resolve('deploy/headless.patch.yml'),'--no-open','--port','0'],{env,stdio:['ignore','pipe','pipe']});
 return new Promise((ok,bad)=>{let log='';const timer=setTimeout(()=>bad(Error('Host startup timeout')),45000);const f=chunk=>{log+=chunk;const m=log.match(/dsh web: (http:\/\/127\.0\.0\.1:\d+\/\?token=[^\s]+)/);if(m){clearTimeout(timer);ok(new URL(m[1]));}};child.stdout.on('data',f);child.stderr.on('data',f);child.once('exit',()=>{clearTimeout(timer);bad(Error(log.replace(/token=\S+/g,'token=REDACTED')));});});
}
async function stop(){if(!child||child.exitCode!==null)return;child.kill('SIGTERM');await new Promise(r=>{const t=setTimeout(()=>child.kill('SIGKILL'),5000);child.once('exit',()=>{clearTimeout(t);r();});});}
try{
 await run(['plugin','--profile','web','add',resolve('abwoo-deepseek-always-on-0.1.0-alpha.2.tgz')]);
 await run(['plugin','--profile','web','add',resolve('abwoo-deepseek-always-on-managed-0.2.0-dev.1.tgz')]);
 let url=await boot();let origin=url.origin;
 const login=await fetch(url,{redirect:'manual'});const cookie=login.headers.getSetCookie().map(x=>x.split(';')[0]).join('; ');
 const admin=async()=>{const r=await fetch(origin+'/api/always-on-managed/admin',{method:'POST',headers:{cookie,'content-type':'application/json'},body:JSON.stringify({action:'pair.create'})});assert.equal(r.status,200);return r.json();};
 const claim=async(name)=>{const code=await admin();const r=await fetch(origin+'/personal-agent/v1/pair/claim',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({code:code.code,name,platform:'other'})});assert.equal(r.status,200);return r.json();};
 const a=await claim('Desktop device'),b=await claim('Native mobile device');
 const api=async(credentials,path,body,expected=200)=>{const r=await fetch(origin+'/personal-agent/v1'+path,{method:body?'POST':'GET',headers:{authorization:'Bearer '+credentials.token,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});const json=await r.json();assert.equal(r.status,expected,JSON.stringify(json));return json;};
 await api({token:'bad'},'/snapshot',undefined,401);
 const id=crypto.randomUUID();const command={action:'task.create',data:{title:'Shared managed task',instruction:'Read-only test; model execution not claimed.',timing:{kind:'every',every_seconds:3600}}};
 const created=await api(a,'/mutate',{operationId:id,command});const repeated=await api(a,'/mutate',{operationId:id,command});assert.deepEqual(created.result,repeated.result);
 const snapshot=await api(b,'/snapshot');assert.equal(snapshot.tasks.length,1);assert.equal(snapshot.tasks[0].id,created.result.result.id);
 const session=await api(a,'/mutate',{operationId:crypto.randomUUID(),command:{action:'session.create',data:{creationId:'session-'+crypto.randomUUID()}}});
 await api(a,'/mutate',{operationId:crypto.randomUUID(),command:{action:'session.prompt',data:{sessionId:session.result.sessionId,text:'Real managed shared input'}}});
 const read=await api(b,'/session/read',{sessionId:session.result.sessionId});assert.ok(JSON.stringify(read.events).includes('Real managed shared input'));
 await stop();url=await boot();origin=url.origin;
 const restarted=await api(b,'/snapshot');assert.equal(restarted.authorityId,a.authorityId);assert.equal(restarted.tasks[0].id,created.result.result.id);
 const memory=(await api(a,'/mutate',{operationId:crypto.randomUUID(),command:{action:'memory.save',data:{kind:'project',content:'Consented cross-device managed memory',source:'Engineering verification',consent:true}}})).result.result;
 assert.ok((await api(b,'/snapshot')).memories.some(m=>m.id===memory.id));
 await api(a,'/mutate',{operationId:crypto.randomUUID(),command:{action:'memory.delete',data:{id:memory.id}}});assert.ok(!(await api(b,'/snapshot')).memories.some(m=>m.id===memory.id));
 const goalId=crypto.randomUUID();const goalInput={operationId:goalId,goal:{title:'Shared bounded goal',instruction:'Read-only goal; no model result claimed',everySeconds:3600,maxRuns:2,allowedTools:[]}};
 const goal=await api(a,'/goals',goalInput);const duplicateGoal=await api(a,'/goals',goalInput);assert.equal(goal.result.id,duplicateGoal.result.id);
 const withGoal=await api(b,'/snapshot');assert.ok(withGoal.goals.some(g=>g.id===goal.result.id));assert.ok(withGoal.tasks.some(t=>t.id===goal.result.taskId&&t.maxRuns===2));
 await api(a,'/mutate',{operationId:crypto.randomUUID(),command:{action:'task.control',data:{id:goal.result.taskId,state:'paused'}}});assert.equal((await api(b,'/snapshot')).tasks.find(t=>t.id===goal.result.taskId).state,'paused');
 const push=await api(b,'/push/status');assert.equal(push.configured,false);
 await api(b,'/push/register',{token:'ExpoPushToken[not-production]',projectId:crypto.randomUUID()},503);
 await api(b,'/push/ack',{noticeId:crypto.randomUUID(),kind:'opened'},404);
 await api(a,'/devices/revoke',{deviceId:b.deviceId});await api(b,'/snapshot',undefined,401);
 const evidence={realHarness:true,devicePairing:true,twoDeviceSharedTask:true,mutationDeduplication:true,sharedSession:true,consentedMemoryCrud:true,goalsShareNativeTasks:true,goalDeduplication:true,sharedPause:true,pushFailsClosedWithoutProvisioning:true,hostRestart:true,revocation:true,realDeepSeek:false,realPhone:false,mvpReady:false};await mkdir('test-results',{recursive:true});await writeFile('test-results/managed-authority.json',JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence));
}finally{await stop();await rm(dir,{recursive:true,force:true});}
