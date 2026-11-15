// Mutates only Expo-generated Android files in a disposable CI checkout.
// Run AFTER saving the ordinary preview APK. No test CA or bootstrap enters that APK.
import {readFile,writeFile,copyFile,mkdir} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {resolve,join} from 'node:path';
const mobile=resolve('apps/mobile'), temp=process.env.RUNNER_TEMP;
if(!temp||!process.env.CI)throw Error('Native engineering build is CI-only');
const gradle=join(mobile,'android/app/build.gradle'),manifest=join(mobile,'android/app/src/main/AndroidManifest.xml');
let text=await readFile(gradle,'utf8');
if(text.includes('productFlavors')||(await readFile(manifest,'utf8')).includes('networkSecurityConfig'))throw Error('Unexpected generated Android configuration; inspect before adding QA flavor');
const dir=join(temp,'always-on-native-qa');await mkdir(dir,{recursive:true,mode:0o700});
const cert=join(dir,'cert.pem'),key=join(dir,'key.pem');
execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-days','1','-keyout',key,'-out',cert,'-subj','/CN=Always-on disposable native QA','-addext','subjectAltName=DNS:localhost,IP:127.0.0.1','-addext','basicConstraints=critical,CA:TRUE'],{stdio:'ignore'});
execFileSync('chmod',['600',key]);
const flavor=join(mobile,'android/app/src/engineering');
await mkdir(join(flavor,'res/raw'),{recursive:true});await mkdir(join(flavor,'res/xml'),{recursive:true});
await copyFile(cert,join(flavor,'res/raw/always_on_test_ca.pem'));
await writeFile(join(flavor,'res/xml/always_on_engineering_network.xml'),`<?xml version="1.0" encoding="utf-8"?>\n<network-security-config><base-config cleartextTrafficPermitted="false"><trust-anchors><certificates src="system" /></trust-anchors></base-config><domain-config cleartextTrafficPermitted="false"><domain>127.0.0.1</domain><trust-anchors><certificates src="@raw/always_on_test_ca" /></trust-anchors></domain-config></network-security-config>\n`);
await writeFile(join(flavor,'AndroidManifest.xml'),`<manifest xmlns:android="http://schemas.android.com/apk/res/android"><application android:networkSecurityConfig="@xml/always_on_engineering_network" android:label="Always-on Engineering QA" xmlns:tools="http://schemas.android.com/tools" tools:replace="android:label" /></manifest>\n`);
text=text.replace('android {',`android {\n    flavorDimensions "qa"\n    productFlavors { engineering { dimension "qa"; applicationIdSuffix ".engineering" } }`);
await writeFile(gradle,text);
await copyFile('tests/fixtures/native-mobile/entry.tsx',join(mobile,'engineering-entry.tsx'));
const pkg=JSON.parse(await readFile(join(mobile,'package.json'),'utf8'));pkg.main='./engineering-entry.tsx';await writeFile(join(mobile,'package.json'),JSON.stringify(pkg,null,2)+'\n');
// Private key path only, no key bytes. The server remains in this build job.
await writeFile(process.env.GITHUB_ENV,`ALWAYS_ON_NATIVE_TLS_CERT=${cert}\nALWAYS_ON_NATIVE_TLS_KEY=${key}\nALWAYS_ON_NATIVE_READY_FILE=${join(dir,'ready.json')}\n`,{flag:'a'});
console.log('Prepared a separate CI-only engineering flavor. Production-preview APK was built before this step.');
