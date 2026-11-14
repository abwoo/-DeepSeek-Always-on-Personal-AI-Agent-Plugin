import {test} from 'node:test';
import assert from 'node:assert/strict';
import {GatewayStore} from '../../src/managed/store.js';
import {randomUUID} from 'node:crypto';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
test('pair codes are single-use and device access expires/revokes without exposing tokens',()=>{
 const store=new GatewayStore(':memory:');const code=store.pairCode(1000);const c=store.claim(code.code,'Phone','ios',2000);
 assert.equal(store.authenticate(c.token,3000).id,c.deviceId);
 assert.throws(()=>store.claim(code.code,'Duplicate','ios',3000));
 assert.throws(()=>store.authenticate(c.token,Date.parse(c.expiresAt)+1));
 assert.ok(!JSON.stringify(store.devices()).includes(c.token));
 store.revoke(c.deviceId);assert.throws(()=>store.authenticate(c.token,3000));store.close();
});
test('durable operation ledger deduplicates equivalent requests and never replays a crash-unknown operation',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'ao-auth-'));const path=join(dir,'state.sqlite');let store=new GatewayStore(path);
 try{const c=store.claim(store.pairCode().code,'Device','other');const op=randomUUID();let calls=0;
 const first=await store.execute(c.deviceId,op,{action:'test',data:{a:1,b:2}},async()=>({id:++calls}));
 const second=await store.execute(c.deviceId,op,{data:{b:2,a:1},action:'test'},async()=>({id:++calls}));
 assert.deepEqual(first,second);assert.equal(calls,1);
 await assert.rejects(()=>store.execute(c.deviceId,op,{action:'different'},async()=>({})),/operation_conflict/);
 const pending=randomUUID();store.db.prepare("INSERT INTO operations VALUES(?,?,?,'pending',NULL,?)").run(c.deviceId,pending,'fingerprint',Date.now());
 const authority=store.authorityId;store.close();store=new GatewayStore(path);assert.equal(store.authorityId,authority);assert.equal(store.operation(c.deviceId,pending)?.status,'unknown');assert.equal(store.authenticate(c.token).id,c.deviceId);
 }finally{store.close();await rm(dir,{recursive:true,force:true});}
});
