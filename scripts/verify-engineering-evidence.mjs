// Integrity only. Passing hashes never certifies live OAuth/provider/phone acceptance.
import {readFile,lstat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const root='docs/evidence/v03-engineering/';
const manifest=JSON.parse(await readFile(root+'manifest.json','utf8')),seen=new Set();
const safePath=new RegExp('^(?:[a-z0-9_-]+/)*[a-z0-9_-]+[.]json
for(const file of manifest.files){
 if(!safePath.test(file.path)||seen.has(file.path)||!/^[a-f0-9]{64}$/.test(file.sha256))throw Error('Invalid or duplicate evidence manifest member');
 seen.add(file.path);
 const path=root+file.path;
 if(!(await lstat(path)).isFile())throw Error('Evidence must be a regular file');
 const hash=createHash('sha256').update(await readFile(path)).digest('hex');
 if(hash!==file.sha256)throw Error('Evidence hash mismatch: '+file.path);
}
console.log(seen.size+' retained raw engineering observations match their SHA-256 hashes; production gates are independent.');
,'i');
for(const file of manifest.files){
 if(!/^(?:[a-z0-9_-]+\\/)*[a-z0-9_-]+\\.json$/i.test(file.path)||seen.has(file.path)||!/^[a-f0-9]{64}$/.test(file.sha256))throw Error('Invalid or duplicate evidence manifest member');
 seen.add(file.path);
 const path=root+file.path;
 if(!(await lstat(path)).isFile())throw Error('Evidence must be a regular file');
 const hash=createHash('sha256').update(await readFile(path)).digest('hex');
 if(hash!==file.sha256)throw Error('Evidence hash mismatch: '+file.path);
}
console.log(seen.size+' retained raw engineering observations match their SHA-256 hashes; production gates are independent.');
