import {readFile,mkdir,writeFile} from 'node:fs/promises';
const ids=Array.from({length:22},(_,i)=>'T'+String(i+1).padStart(2,'0'));
let data;try{data=JSON.parse(await readFile('docs/evidence/v03/production.json','utf8'));}catch{}
const missing=ids.filter(id=>data?.tests?.[id]?.status!=='Pass'||data?.tests?.[id]?.level!==5||!data?.tests?.[id]?.sourceCommit||!data?.tests?.[id]?.evidence);
const service=JSON.parse(await readFile('config/public-service.json','utf8')).serviceOrigin;
if(!service)missing.push('operator-provisioned trusted service configuration');
await mkdir('test-results',{recursive:true});
await writeFile('test-results/v03-release-gate.json',JSON.stringify({status:missing.length?'blocked':'evidence_requires_operator_review',mvpReady:false,missing,sourceCommit:process.env.GITHUB_SHA??'local-working-tree',note:'Even complete file assertions require review against actual accounts, provider, native devices, signed builds, power-off and push records; this script does not fabricate or certify a production event.'},null,2));
if(missing.length){console.log('v0.3 production release BLOCKED: '+missing.join(', '));if(process.argv.includes('--require-ready'))process.exitCode=1;}
