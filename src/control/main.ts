import {readFile} from 'node:fs/promises';
import {z} from 'zod';
import {ControlStore} from './store.js';
import {auth0Identity} from './identity.js';
import {AgentPool} from './pool.js';
import {controlServer} from './server.js';
const settingsSchema=z.object({
  publicOrigin:z.url(),issuer:z.url(),clientId:z.string().min(1),
  database:z.string().min(1),encryptionKeyFile:z.string().min(1),clientSecretFile:z.string().min(1),
  trustedProxies:z.array(z.string()).default(['127.0.0.1','::1','::ffff:127.0.0.1']),
  slots:z.array(z.object({id:z.string(),origin:z.url(),provisioningKeyFile:z.string()}).strict()).min(2).max(64),
}).strict();
const settings=settingsSchema.parse(JSON.parse(await readFile(process.env.ALWAYS_ON_CONTROL_CONFIG??'/run/config/control.json','utf8')));
const readSecret=async(path:string)=>(await readFile(path,'utf8')).trim();
const store=new ControlStore(settings.database,await readSecret(settings.encryptionKeyFile));
const identity=await auth0Identity(settings.issuer,settings.clientId,await readSecret(settings.clientSecretFile));
const slots=await Promise.all(settings.slots.map(async s=>({id:s.id,origin:s.origin,provisioningKey:await readSecret(s.provisioningKeyFile)})));
const app=controlServer(store,new AgentPool(store,slots),identity,{publicOrigin:settings.publicOrigin,mobileRedirect:'deepseek-always-on://oauth/return',trustedProxies:settings.trustedProxies});
await new Promise<void>(resolve=>app.server.listen(4080,'0.0.0.0',resolve));
console.log('Always-on account control ready on private port; production device/model gates are independently required.');
let stopping=false;
async function stop(){if(stopping)return;stopping=true;await app.close();store.close();process.exit(0);}
process.on('SIGTERM',()=>{void stop();});process.on('SIGINT',()=>{void stop();});
