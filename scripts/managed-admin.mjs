// Run only from the operator's private runtime console; never expose this command through the device API.
import { GatewayStore } from '../dist/managed/store.js';
import { resolve } from 'node:path';
const command = process.argv[2];
const dir = process.env.ALWAYS_ON_GATEWAY_DATA_DIR;
if (!dir)
  throw Error('Set ALWAYS_ON_GATEWAY_DATA_DIR to the existing private authority data directory');
const store = new GatewayStore(resolve(dir, 'gateway.sqlite'), false);
try {
  if (command === 'pair-code') process.stdout.write(JSON.stringify(store.pairCode()) + '\n');
  else if (command === 'devices') process.stdout.write(JSON.stringify(store.devices()) + '\n');
  else if (command === 'revoke' && process.argv[3]) store.revoke(process.argv[3]);
  else if(command==='adopt-account'){
    const accountId=process.argv[3];
    if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(accountId??'')||!process.argv.includes('--verified-ownership-and-stopped-host')||!process.argv.includes('--revoke-legacy-devices'))
      throw Error('Operator migration requires exact verified account UUID, stopped Host, coordinated backup and explicit legacy credential revocation flags');
    const previous=store.db.prepare("SELECT value FROM meta WHERE key='account_id'").get()?.value;
    if(previous&&previous!==accountId)throw Error('Authority is already bound to another account; reassignment refused');
    store.transaction(()=>{
      store.db.prepare("INSERT OR IGNORE INTO meta(key,value) VALUES('account_id',?)").run(accountId);
      store.db.prepare('UPDATE devices SET revoked=1').run();store.db.prepare('UPDATE push_devices SET active=0').run();store.change('operator_account_adoption');
    });
    process.stdout.write(JSON.stringify({accountId,authorityId:store.authorityId,ownerId:store.ownerId,legacyDevicesRevoked:true,dataDeleted:false})+'\n');
  }
  else throw Error('Use pair-code | devices | revoke DEVICE_ID | adopt-account ACCOUNT_ID --verified-ownership-and-stopped-host --revoke-legacy-devices');
} finally {
  store.close();
}
