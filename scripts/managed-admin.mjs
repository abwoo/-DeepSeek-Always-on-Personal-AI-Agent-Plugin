// Run only from the operator's private runtime console; never expose this command through the device API.
import {GatewayStore} from '../dist/managed/store.js';
import {resolve} from 'node:path';
const command=process.argv[2];const dir=process.env.ALWAYS_ON_GATEWAY_DATA_DIR;
if(!dir)throw Error('Set ALWAYS_ON_GATEWAY_DATA_DIR to the existing private authority data directory');
const store=new GatewayStore(resolve(dir,'gateway.sqlite'),false);
try{if(command==='pair-code')process.stdout.write(JSON.stringify(store.pairCode())+'\n');else if(command==='devices')process.stdout.write(JSON.stringify(store.devices())+'\n');else if(command==='revoke'&&process.argv[3])store.revoke(process.argv[3]);else throw Error('Use pair-code | devices | revoke DEVICE_ID');}finally{store.close();}
