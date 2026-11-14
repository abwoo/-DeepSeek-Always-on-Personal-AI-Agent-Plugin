import {spawn,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
if(!process.env.ALWAYS_ON_PUBLIC_ORIGIN)throw Error('Operator must configure the public HTTPS origin');
const origin=new URL(process.env.ALWAYS_ON_PUBLIC_ORIGIN);
if(origin.protocol!=='https:'||origin.port&&origin.port!=='8443'||origin.pathname!=='/'||origin.search||origin.hash||origin.username||origin.password)throw Error('Expected an HTTPS origin on port 443 or 8443');
if(!process.env.DEEPSEEK_API_KEY||!process.env.DEEPSEEK_MODEL)throw Error('Configure server-side DEEPSEEK_API_KEY and verified DEEPSEEK_MODEL');
process.env.ALWAYS_ON_TRUSTED_PROXIES='127.0.0.1,::1,::ffff:127.0.0.1';
process.env.ALWAYS_ON_GATEWAY_ALLOW_LOOPBACK='0';
const cli=resolve('node_modules/@deepseek-ai/dsh/lib/bin.js');
const pkg=JSON.parse(await (await import('node:fs/promises')).readFile('package.json','utf8'));
const invoke=args=>promisify(execFile)(process.execPath,[cli,...args],{env:process.env,timeout:120000});
await mkdir('/data',{recursive:true});
await invoke(['plugin','--profile','web','add',resolve(`abwoo-deepseek-always-on-${pkg.version}.tgz`)]);
await invoke(['plugin','--profile','web','add',resolve('abwoo-deepseek-always-on-managed-0.2.0-dev.1.tgz')]);
await writeFile('/data/runtime.patch.yml',`- id: workspace-controller\n  config:\n    documentsDirectory: !!js process.env.ALWAYS_ON_DOCUMENTS_DIR\n- id: agent-default-model\n  config:\n    provider: deepseek-official\n    model: !!js process.env.DEEPSEEK_MODEL\n`);
if(process.env.ALWAYS_ON_TLS_CERT&&process.env.ALWAYS_ON_TLS_KEY){
 await writeFile('/data/Caddyfile',`${origin.hostname}:8443 {\n tls ${JSON.stringify(process.env.ALWAYS_ON_TLS_CERT)} ${JSON.stringify(process.env.ALWAYS_ON_TLS_KEY)}\n handle /personal-agent/v1/* {\n  request_body { max_size 64KB }\n  reverse_proxy 127.0.0.1:3080 { header_up X-Forwarded-Proto https }\n }\n handle { respond 404 }\n}\n`);
}else throw Error('Operator must provide trusted TLS certificate/key paths; no internal certificate is used for production');
const children=[];let stopping=false;
function stop(code=0){if(stopping)return;stopping=true;for(const child of children)child.kill('SIGTERM');const timer=setTimeout(()=>{for(const child of children)child.kill('SIGKILL');process.exit(code);},10000);timer.unref();Promise.all(children.map(c=>new Promise(r=>c.exitCode!==null?r():c.once('exit',r)))).then(()=>process.exit(code));}
for(const [program,args]of [[process.execPath,[cli,'web','--patch','/data/runtime.patch.yml','--host','127.0.0.1','--port','3080','--no-open']],['caddy',['run','--config','/data/Caddyfile','--adapter','caddyfile']]]){
 const child=spawn(program,args,{stdio:['ignore','pipe','pipe'],env:process.env});children.push(child);
 for(const stream of [child.stdout,child.stderr])stream.on('data',chunk=>process.stdout.write(chunk.toString().replace(/token=[^\s]+/g,'token=REDACTED')));
 child.once('exit',code=>{if(!stopping)stop(code||1);});child.once('error',()=>stop(1));
}
process.on('SIGTERM',()=>stop());process.on('SIGINT',()=>stop());
