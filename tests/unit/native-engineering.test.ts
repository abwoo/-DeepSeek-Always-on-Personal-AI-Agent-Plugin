import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,readdirSync,rmSync,statSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {execFileSync} from 'node:child_process';

test('native QA preparation scopes trust/bootstrap to a separate engineering flavor and never copies its TLS private key',()=>{
 const dir=mkdtempSync(join(tmpdir(),'native-engineering-')),runner=join(dir,'runner');
 try {
  const mobile=join(dir,'apps/mobile'),main=join(mobile,'android/app/src/main');
  mkdirSync(main,{recursive:true});mkdirSync(join(dir,'tests/fixtures/native-mobile'),{recursive:true});mkdirSync(runner);
  const manifest='<manifest><application android:label="Product" /></manifest>';
  writeFileSync(join(main,'AndroidManifest.xml'),manifest);
  writeFileSync(join(mobile,'android/app/build.gradle'),'android {\n}\n');
  writeFileSync(join(mobile,'package.json'),JSON.stringify({main:'node_modules/expo/AppEntry.js'}));
  writeFileSync(join(dir,'tests/fixtures/native-mobile/entry.tsx'),'// fixture bootstrap marker');
  const environment=join(dir,'env');writeFileSync(environment,'');
  execFileSync(process.execPath,[resolve('scripts/prepare-native-engineering.mjs')],{cwd:dir,env:{...process.env,CI:'true',RUNNER_TEMP:runner,GITHUB_ENV:environment},stdio:'pipe'});
  assert.equal(readFileSync(join(main,'AndroidManifest.xml'),'utf8'),manifest);
  assert.equal(JSON.parse(readFileSync(join(mobile,'package.json'),'utf8')).main,'./engineering-entry.tsx');
  const flavor=join(mobile,'android/app/src/engineering');
  const network=readFileSync(join(flavor,'res/xml/always_on_engineering_network.xml'),'utf8');
  assert.match(network,/<domain includeSubdomains="false">127\.0\.0\.1<\/domain>/);
  assert.doesNotMatch(network,/cleartextTrafficPermitted="true"|includeSubdomains="true"/);
  const resources=readdirSync(join(flavor,'res/raw'));
  assert.deepEqual(resources,['always_on_test_ca.pem']);
  const ca=readFileSync(join(flavor,'res/raw',resources[0]),'utf8');
  assert.match(ca,/BEGIN CERTIFICATE/);assert.doesNotMatch(ca,/PRIVATE KEY/);
  assert.equal(statSync(join(runner,'always-on-native-qa/key.pem')).mode&0o777,0o600);
  assert.match(readFileSync(join(mobile,'android/app/build.gradle'),'utf8'),/applicationIdSuffix "\.engineering"/);
 } finally {rmSync(dir,{recursive:true,force:true});}
});
