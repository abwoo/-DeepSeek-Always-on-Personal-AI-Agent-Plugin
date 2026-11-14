// Optional production-provider gate. No fixture model, no direct model SDK, no second Agent loop.
import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdir,mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,join} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import assert from 'node:assert/strict';
import {ManagedClient} from '../dist/shared/managed-client.js';
await mkdir('test-results',{recursive:true});
const evidence={status:'blocked',realDeepSeek:false,realPhone:false,realNativePush:false,mvpReady:false,reason:''};
if(!process.env.DEEPSEEK_API_KEY||!process.env.DEEPSEEK_MODEL){evidence.reason='Server-side GitHub Actions secret ALWAYS_ON_DEEPSEEK_API_KEY and repository variable ALWAYS_ON_DEEPSEEK_MODEL are required; no model result was simulated.';await writeFile('test-results/real-deepseek.json',JSON.stringify(evidence,null,2));console.log(evidence.reason);process.exit(0);}
const dir=await mkdtemp(join(tmpdir(),'always-on-real-'));const cli=resolve('node_modules/@deepseek-ai/dsh/lib/bin.js');
const env={...process.env,DSH_HOME:join(dir,'profile'),ALWAYS_ON_DATA_DIR:join(dir,'data'),ALWAYS_ON_DOCUMENTS_DIR:join(dir,'documents'),ALWAYS_ON_GATEWAY_ALLOW_LOOPBACK:'1'};
const patch=join(dir,'runtime.yml');await writeFile(patch,`- id: workspace-controller\n  config:\n    documentsDirectory: !!js process.env.ALWAYS_ON_DOCUMENTS_DIR\n- id: agent-default-model\n  config:\n    provider: deepseek-official\n    model: !!js process.env.DEEPSEEK_MODEL\n`);
let child;
const command=args=>promisify(execFile)(process.execPath,[cli,...args],{env,timeout:120000,maxBuffer:1024*1024});
async function stop(){if(!child||child.exitCode!==null)return;const done=new Promise(r=>child.once('exit',r));child.kill('SIGTERM');const timer=setTimeout(()=>child.kill('SIGKILL'),5000);await done;clearTimeout(timer);}
async function boot(){child=spawn(process.execPath,[cli,'web','--patch',patch,'--no-open','--port','0'],{env,stdio:['ignore','pipe','pipe']});return new Promise((ok,bad)=>{let log='';const timer=setTimeout(()=>bad(Error('host_startup_timeout')),45000);const observe=chunk=>{log=(log+chunk).slice(-50000);const match=log.match(/dsh web: (http:\/\/127\.0\.0\.1:\d+\/\?token=[^\s]+)/);if(match){clearTimeout(timer);ok(new URL(match[1]));}};child.stdout.on('data',observe);child.stderr.on('data',observe);child.once('exit',()=>{clearTimeout(timer);bad(Error('host_exited'));});});}
try{
 await command(['plugin','--profile','web','add',resolve('abwoo-deepseek-always-on-0.1.0-alpha.2.tgz')]);
 await command(['plugin','--profile','web','add',resolve('abwoo-deepseek-always-on-managed-0.2.0-dev.1.tgz')]);
 let url=await boot();const login=await fetch(url,{redirect:'manual'});const cookie=login.headers.getSetCookie().map(x=>x.split(';')[0]).join('; ');
 async function pair(name){const response=await fetch(url.origin+'/api/always-on-managed/admin',{method:'POST',headers:{cookie,'content-type':'application/json'},body:JSON.stringify({action:'pair.create'})});assert.equal(response.status,200);const {code}=await response.json();const record=await ManagedClient.pair(url.origin,code,name,'other',true);return new ManagedClient(record.origin,record.credentials,undefined,true);}
 const a=await pair('Task creator'),b=await pair('Second device protocol observer');
 const task=(await a.mutate(crypto.randomUUID(),{action:'task.create',data:{title:'Real DeepSeek offline execution gate',instruction:'This user authorizes one bounded read-only check. Call always_on_report with summary "Real DeepSeek scheduled verification completed", sources [], changed true. Do not use other tools or write files.',timing:{kind:'after',after_seconds:60},maxRuns:1,maxSteps:4,maxOutputTokens:256,maxTotalTokens:10000,timeoutSeconds:180,allowedTools:[]}})).result.result;
 let snapshot;const deadline=Date.now()+240000;
 // No browser or native app exists in this test; only read-only observation of the independently scheduled Host.
 while(Date.now()<deadline){snapshot=await b.snapshot();const run=snapshot.runs.find(r=>r.taskId===task.id);if(run&&['completed','failed','unconfirmed','interrupted'].includes(run.status))break;await delay(2000);}
 const run=snapshot.runs.find(r=>r.taskId===task.id);assert.equal(run?.status,'completed','Real provider task did not produce a confirmed durable run');assert.ok(run.resultReference?.startsWith('session:'));assert.ok(snapshot.inbox.some(n=>n.runId===run.id));
 const session=await b.readSession(run.sessionId);const events=session.events.records.filter(r=>r.type==='event').map(r=>r.event);assert.ok(events.some(e=>e.type==='assistant/message'&&e.data.usage),'No actual model usage event');assert.ok(events.some(e=>e.type==='turn/end'),'Missing native turn completion');
 await stop();url=await boot();const restarted=new ManagedClient(url.origin,b.credentials,undefined,true);const after=await restarted.snapshot();assert.equal(after.authorityId,snapshot.authorityId);assert.ok(after.runs.some(r=>r.id===run.id&&r.status==='completed'));
 Object.assign(evidence,{status:'passed',reason:'Real native Schedule and DeepSeek provider produced a durable business report and Inbox. Physical Desktop/phone/push remain separate release gates.',realDeepSeek:true,provider:'deepseek-official',model:process.env.DEEPSEEK_MODEL,authorityId:snapshot.authorityId,taskId:task.id,runId:run.id,sessionId:run.sessionId,scheduledWithoutClients:true,hostRestart:true});
}catch{evidence.status='failed';evidence.reason='The configured real-provider gate failed. No fixture fallback was used; inspect operator-side provider configuration and bounded task status.';process.exitCode=1;}
finally{await stop();await rm(dir,{recursive:true,force:true});await writeFile('test-results/real-deepseek.json',JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence));}
