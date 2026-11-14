import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {NativePush} from '../../src/managed/push.js';
import {GatewayStore} from '../../src/managed/store.js';
import type {Notice} from '../../src/host/notifications.js';
// Transport fixtures test delivery bookkeeping only. They cannot certify production push or physical receipt.
test('Expo ticket, provider receipt and device acknowledgment remain distinct, with durable deduplication',async()=>{
 const store=new GatewayStore(':memory:');const device=store.claim(store.pairCode().code,'Phone','ios');const projectId=randomUUID();let now=Date.now(),calls=0;const notices:Notice[]=[];
 const transport=(async(url:unknown,init:RequestInit)=>{calls++;const body=JSON.parse(String(init.body));if(String(url).endsWith('send')){assert.equal(body.data.authorityId,store.authorityId);assert.ok(!JSON.stringify(body).includes('private result'));return Response.json({data:{status:'ok',id:'fixture-ticket'}});}return Response.json({data:{'fixture-ticket':{status:'ok'}}});}) as typeof fetch;
 const push=new NativePush(store,()=>notices,{enabled:true,projectId,accessToken:'fixture-not-a-real-key'},transport,()=>now);
 push.register(device.deviceId,{token:'ExpoPushToken[fixture]',projectId});
 notices.push({id:randomUUID(),runId:randomUUID(),title:'private result',summary:'private result',createdAt:new Date(now+1).toISOString(),read:false,push:'disabled',attempts:0});
 await push.tick();assert.equal(push.status(device.deviceId).deliveries[0]!.status,'accepted');await push.tick();assert.equal(calls,1);
 now+=900001;await push.tick();assert.equal(push.status(device.deviceId).deliveries[0]!.status,'provider_confirmed');
 push.ack(device.deviceId,{noticeId:notices[0]!.id,kind:'opened'});assert.equal(push.status(device.deviceId).deliveries[0]!.status,'device_acknowledged');
 await push.tick();assert.equal(calls,2);store.close();
});
test('ambiguous sends never replay; revoked devices cannot receive new pushes; missing configuration fails closed',async()=>{
 const store=new GatewayStore(':memory:');const d=store.claim(store.pairCode().code,'Phone','android');const projectId=randomUUID();let now=Date.now(),calls=0;const notices:Notice[]=[];
 const unavailable=new NativePush(store,()=>notices,{});assert.throws(()=>unavailable.register(d.deviceId,{token:'ExpoPushToken[x]',projectId}),/native_push_not_configured/);
 const push=new NativePush(store,()=>notices,{enabled:true,projectId,accessToken:'fixture'},(async()=>{calls++;throw Error('ambiguous timeout');}) as typeof fetch,()=>now);
 push.register(d.deviceId,{token:'ExpoPushToken[x]',projectId});notices.push({id:randomUUID(),runId:randomUUID(),title:'x',summary:'x',createdAt:new Date(now+1).toISOString(),read:false,push:'disabled',attempts:0});
 await push.tick();assert.equal(push.status(d.deviceId).deliveries[0]!.status,'unknown');await push.tick();assert.equal(calls,1);
 store.revoke(d.deviceId);notices.push({...notices[0]!,id:randomUUID()});await push.tick();assert.equal(calls,1);assert.equal(notices.length,2);store.close();
});
