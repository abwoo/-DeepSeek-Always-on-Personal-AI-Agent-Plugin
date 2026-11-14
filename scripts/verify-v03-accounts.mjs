// Level 2: two actual published Harness processes. Identity is an explicitly labeled local adapter fixture.
// Never substitutes for a live Auth0 tenant, real model output or physical-device acceptance.
import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp,mkdir,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {randomBytes,randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {ControlStore,secret,challenge} from '../dist/control/store.js';
import {AgentPool} from '../dist/control/pool.js';
import {controlServer} from '../dist/control/server.js';
import {AccountApi} from '../dist/shared/account-client.js';
import {ManagedClient} from '../dist/shared/managed-client.js';
const root=await mkdtemp(join(tmpdir(),'always-on-v03-')),cli=resolve('node_modules/@deepseek-ai/dsh/lib/bin.js');
const authorities=[];let controller,store,base;
const encryption=randomBytes(32).toString('base64');
async function authority(index){
  const provisioningKey=secret(),dir=join(root,'agent-'+index);
  const env={...process.env,DSH_HOME:join(dir,'profile'),ALWAYS_ON_DATA_DIR:join(dir,'data'),ALWAYS_ON_DOCUMENTS_DIR:join(dir,'documents'),ALWAYS_ON_GATEWAY_ALLOW_LOOPBACK:'1',ALWAYS_ON_PROVISIONING_KEY:provisioningKey};
  const run=args=>promisify(execFile)(process.execPath,[cli,...args],{env,timeout:120000});
  for(const file of ['abwoo-deepseek-always-on-0.1.0-alpha.2.tgz','abwoo-deepseek-always-on-managed-0.2.0-dev.1.tgz'])await run(['plugin','--profile','web','add',resolve(file)]);
  const child=spawn(process.execPath,[cli,'web','--patch',resolve('deploy/headless.patch.yml'),'--no-open','--port','0'],{env,stdio:['ignore','pipe','pipe']});
  const entry={child};authorities.push(entry);
  const url=await new Promise((ok,bad)=>{
    let log='';const timer=setTimeout(()=>bad(Error('Real Harness startup timeout')),60000);
    const observe=c=>{log+=c;const m=log.match(/dsh web: (http:\/\/127\.0\.0\.1:\d+\/\?token=[^\s]+)/);if(m){clearTimeout(timer);ok(new URL(m[1]));}};
    child.stdout.on('data',observe);child.stderr.on('data',observe);child.once('exit',()=>{clearTimeout(timer);bad(Error('Real Harness terminated during startup; owner log withheld'));});
  });
  return {id:'agent-'+index,origin:url.origin,provisioningKey};
}
const identity={issuer:'https://identity-fixture.invalid/',authorize:async x=>'https://identity-fixture.invalid/authorize?state='+x.state,
  exchange:async x=>({issuer:'https://identity-fixture.invalid/',subject:x.callback.searchParams.get('code'),refreshToken:'explicit-local-identity-fixture'}),
  refresh:async(_,subject)=>({issuer:'https://identity-fixture.invalid/',subject,refreshToken:'explicit-local-identity-fixture-rotated'}),revoke:async()=>{}};
async function boot(slots){
  store=new ControlStore(join(root,'accounts.sqlite'),encryption);
  controller=controlServer(store,new AgentPool(store,slots,true),identity,{publicOrigin:'https://service-fixture.invalid',mobileRedirect:'deepseek-always-on://oauth/return',allowLoopback:true});
  await new Promise(r=>controller.server.listen(0,'127.0.0.1',r));base='http://127.0.0.1:'+controller.server.address().port;
}
const transport=async(input,init)=>{const r=await fetch(String(input).replace('https://service-fixture.invalid',base),init);return new Response(await r.text(),{status:r.status,headers:r.headers});};
const api=new AccountApi('https://service-fixture.invalid',transport);
async function login(subject){
  const verifier=secret(),start=await api.start({challenge:challenge(verifier),name:'Real Harness protocol observer',platform:'other'});
  const state=new URL(start.authorizeUrl).searchParams.get('state');
  const r=await fetch(base+'/account/v1/callback?state='+state+'&code='+subject);assert.equal(r.status,200);
  const result=await api.complete(start.loginId,verifier);assert.equal(result.state,'ready',JSON.stringify(result));return result.connection;
}
const client=c=>new ManagedClient(c.origin,c.credentials,undefined,false,transport);
try{
  const slots=[await authority(0),await authority(1)];await boot(slots);
  const a=await login('alice'),phone=await login('alice'),b=await login('bob');
  assert.equal(a.credentials.authorityId,phone.credentials.authorityId);assert.notEqual(a.credentials.authorityId,b.credentials.authorityId);assert.notEqual(a.credentials.ownerId,b.credentials.ownerId);
  const desktop=client(a),mobile=client(phone),other=client(b),id=randomUUID();
  const created=await desktop.mutate(id,{action:'task.create',data:{title:'Account isolation proof',instruction:'Read-only task; no model execution claimed.',timing:{kind:'every',every_seconds:86400},allowedTools:[]}});
  assert.deepEqual(await desktop.mutate(id,{action:'task.create',data:{title:'Account isolation proof',instruction:'Read-only task; no model execution claimed.',timing:{kind:'every',every_seconds:86400},allowedTools:[]}}),created);
  const task=(await mobile.snapshot()).tasks.find(t=>t.title==='Account isolation proof');assert.ok(task);assert.equal((await other.snapshot()).tasks.length,0);
  await assert.rejects(()=>other.mutate(randomUUID(),{action:'task.control',data:{id:task.id,state:'cancelled'}}));assert.equal((await desktop.snapshot()).tasks[0].state,'active');
  const memory=await mobile.mutate(randomUUID(),{action:'memory.save',data:{kind:'project',content:'Alice-only project',source:'Explicit integration consent',consent:true}});
  assert.ok((await desktop.snapshot()).memories.some(m=>m.content==='Alice-only project'));assert.equal((await other.snapshot()).memories.length,0);
  const s=await desktop.mutate(randomUUID(),{action:'session.create',data:{creationId:'session-'+randomUUID()}}),sessionId=s.result.sessionId;
  await desktop.mutate(randomUUID(),{action:'session.prompt',data:{sessionId,text:'Real account-backed native input receipt; no provider configured.'}});
  assert.ok(JSON.stringify(await mobile.readSession(sessionId)).includes('Real account-backed native input receipt'));await assert.rejects(()=>other.readSession(sessionId));
  const goal=await mobile.createGoal(randomUUID(),{title:'Bounded ongoing goal',instruction:'Read-only authorized context',everySeconds:86400,maxRuns:2,allowedTools:[]});assert.equal((await desktop.snapshot()).goals[0].id,goal.result.id);assert.equal((await other.snapshot()).goals.length,0);
  await desktop.mutate(randomUUID(),{action:'memory.delete',data:{id:memory.result.result.id}});assert.equal((await mobile.snapshot()).memories.length,0);
  const auth=a.credentials.authorityId;await controller.close();store.close();await boot(slots);
  assert.equal((await mobile.snapshot()).authorityId,auth);assert.ok((await mobile.snapshot()).tasks.some(t=>t.id===task.id));
  await desktop.request('/devices/revoke',{deviceId:phone.credentials.deviceId});await assert.rejects(()=>mobile.snapshot());await assert.rejects(()=>api.refresh(phone));
  const again=await login('alice');assert.equal(again.credentials.authorityId,auth);assert.ok((await client(again).snapshot()).tasks.some(t=>t.id===task.id));
  const forbidden=await fetch(base+'/personal-agent/v1/operator/inspect');assert.equal(forbidden.status,404);
  await mkdir('test-results',{recursive:true});await writeFile('test-results/v03-accounts.json',JSON.stringify({sourceCommit:process.env.GITHUB_SHA??'local-working-tree',evidenceLevel:2,identity:'explicit local adapter fixture; not live Auth0',actualHarnessProcesses:2,automaticIsolatedAllocation:true,sameAccountTwoIndependentDevices:true,crossAccountSessionAndTaskDenied:true,sharedTask:true,sharedMemoryLifecycle:true,sharedNativeSessionInput:true,sharedGoal:true,mutationDeduplication:true,controllerRestartRetainsAuthority:true,deviceRevocationAndRelogin:true,realIdentityProvider:false,realDeepSeek:false,realPhone:false,mvpReady:false},null,2));
  console.log('Real two-Harness account isolation and shared state passed; live identity/provider/physical gates remain blocked.');
}finally{
  await controller?.close().catch(()=>{});store?.close();
  for(const {child}of authorities){if(child.exitCode===null){child.kill('SIGTERM');await new Promise(r=>{const t=setTimeout(()=>child.kill('SIGKILL'),5000);child.once('exit',()=>{clearTimeout(t);r();});});}}
  await rm(root,{recursive:true,force:true});
}
