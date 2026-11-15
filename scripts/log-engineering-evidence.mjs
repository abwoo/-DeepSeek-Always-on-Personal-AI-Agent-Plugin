// Small whitelisted observations only: never arbitrary logs, secrets or caller paths.
import {lstat,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const groups={
 mobile:['mobile-evidence/native-contract.json','mobile-evidence/android.json','mobile-evidence/android-emulator.json','mobile-evidence/ios.json'],
 accounts:['test-results/v03-accounts.json','test-results/v03-backup.json','test-results/control-proxy.json','test-results/mobile-component-contract.json','test-results/v03-release-gate.json'],
 runtime:['test-results/managed-authority.json','test-results/managed-container.json'],
};
const paths=groups[process.argv[2]];
if(!paths)throw Error('Unknown engineering evidence group');
for(const path of paths){
 let info;try{info=await lstat(path);}catch(e){if(e.code==='ENOENT')continue;throw e;}
 if(!info.isFile()||info.size>128*1024)throw Error('Unexpected engineering observation file');
 const raw=await readFile(path),record=JSON.parse(raw.toString('utf8'));
 console.log('ALWAYS_ON_EVIDENCE '+JSON.stringify({path,checkoutCommit:process.env.GITHUB_SHA,sha256:createHash('sha256').update(raw).digest('hex'),base64:raw.toString('base64'),record}));
}
