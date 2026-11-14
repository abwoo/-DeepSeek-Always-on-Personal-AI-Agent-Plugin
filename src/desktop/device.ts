import type { Context } from '@deepseek-ai/cordis';
import { credentialRef } from '@deepseek-ai/dsh-credentials';
import { z } from 'zod';
import { ManagedClient, ApiError, credentialsSchema, managedOrigin, type PendingOperation, type ConnectionRecord, type OperationStorage } from '../shared/managed-client.js';
import { mutationSchema,goalSchema } from '../shared/managed-contract.js';
const reference=credentialRef('ALWAYS_ON_PERSONAL_AGENT_DEVICE');
const savedSchema=z.object({origin:z.string(),credentials:credentialsSchema}).strict();
const sessionSchema=z.discriminatedUnion('action',[
 z.object({action:z.literal('list')}),z.object({action:z.literal('read'),sessionId:z.string().min(1)}),
 z.object({action:z.literal('create'),creationId:z.string().min(1),operationId:z.uuid()}),
 z.object({action:z.literal('prompt'),sessionId:z.string().min(1),requestId:z.uuid(),text:z.string().min(1)}),
 z.object({action:z.literal('cancel'),sessionId:z.string().min(1),operationId:z.uuid()})]);
export class PairedDesktop {
 private connected=false;
 private disposed=false;
 private serial:Promise<unknown>=Promise.resolve();
 constructor(private ctx:Context,private loopback=false){}
 private queue<T>(work:()=>Promise<T>){const p=this.serial.then(work,work);this.serial=p.catch(()=>{});return p;}
 private async record(){if(this.disposed)throw Error('Plugin disabled');const saved=await this.ctx.credentials.resolve(reference);if(!saved)return null;const record=savedSchema.parse(JSON.parse(saved.value));managedOrigin(record.origin,this.loopback);return record;}
 private operations(record:ConnectionRecord):OperationStorage {
  const ref=credentialRef('ALWAYS_ON_PENDING_'+record.credentials.deviceId.replaceAll('-','_'));
  const list=async():Promise<PendingOperation[]>=>{const saved=await this.ctx.credentials.resolve(ref);return saved?JSON.parse(saved.value):[];};
  const write=async(items:PendingOperation[])=>{if(items.length)await this.ctx.credentials.set(ref,JSON.stringify(items));else await this.ctx.credentials.unset(ref);};
  return {list,save:async operation=>{const items=await list();if(items.some(p=>p.operationId!==operation.operationId))throw Error('Review the previous operation before writing');await write([...items.filter(p=>p.operationId!==operation.operationId),operation]);},remove:async id=>write((await list()).filter(p=>p.operationId!==id))};
 }
 private async client(){const record=await this.record();if(!record)throw Error('Pair this Desktop with your managed Personal Agent');return new ManagedClient(record.origin,record.credentials,this.operations(record),this.loopback);}
 async status(){const record=await this.record();return {authority:record?.origin??null,authorityId:record?.credentials.authorityId,deviceId:record?.credentials.deviceId,configured:!!record,connected:this.connected,credentialMode:'device-pairing',devicePairingReady:true,mvpReady:false};}
 async pair(input:unknown){return this.queue(async()=>{const data=z.object({origin:z.string(),code:z.string(),name:z.string().min(1).max(80)}).strict().parse(input);if(await this.record())throw Error('Remove existing device access before pairing another authority');const record=await ManagedClient.pair(data.origin,data.code,data.name,process.platform==='darwin'?'macos':process.platform==='win32'?'windows':'other',this.loopback);await this.ctx.credentials.set(reference,JSON.stringify(record));this.connected=false;return this.status();});}
 async forget(){return this.queue(async()=>{const c=await this.client();try{await c.request('/devices/revoke',{deviceId:c.credentials.deviceId});}catch(e){if(!(e instanceof ApiError&&e.status===401))throw e;}await this.ctx.credentials.unset(reference);this.connected=false;return this.status();});}
 private async failure(error:unknown){this.connected=false;if(error instanceof ApiError&&error.status===401)await this.ctx.credentials.unset(reference);}
 async pending(){return this.queue(async()=>{const client=await this.client();return client.reconcile();});}
 async dismiss(input:unknown){return this.queue(async()=>{const {operationId}=z.object({operationId:z.uuid()}).strict().parse(input);const record=await this.record();if(!record)throw Error('Device not configured');await this.operations(record).remove(operationId);return {dismissed:true};});}
 async snapshot(){return this.queue(async()=>{try{const c=await this.client();const state=await c.snapshot();this.connected=true;const pendingOperations=(await c.reconcile()).filter(p=>p.status!=='committed');return {...state,pushPublicKey:null,pendingOperations,connection:await this.status()};}catch(e){await this.failure(e);throw e;}});}
 async mutate(body:unknown){return this.queue(async()=>{if(!this.connected)throw Error('Refresh before writing');const data=z.object({operationId:z.uuid(),action:z.string(),data:z.unknown()}).strict().parse(body);const command=mutationSchema.parse({operationId:data.operationId,command:{action:data.action,data:data.data}});try{const result=await(await this.client()).mutate(command.operationId,command.command);return {status:200,body:{ok:true,...result.result}};}catch(e){await this.failure(e);throw e;}});}
 async session(input:unknown){return this.queue(async()=>{const data=sessionSchema.parse(input),c=await this.client();if(!['list','read'].includes(data.action)&&!this.connected)throw Error('Refresh before writing');try{
  if(data.action==='list')return {...await c.sessions(),connection:await this.status()};
  let sessionId:string;
  if(data.action==='read')sessionId=data.sessionId;
  else if(data.action==='create'){const result=await c.mutate(data.operationId,{action:'session.create',data:{creationId:data.creationId}});sessionId=result.result.sessionId;}
  else if(data.action==='prompt'){sessionId=data.sessionId;await c.mutate(data.requestId,{action:'session.prompt',data:{sessionId,text:data.text}});}
  else {sessionId=data.sessionId;await c.mutate(data.operationId,{action:'session.cancel',data:{sessionId}});}
  const result=await c.readSession(sessionId);return {...result,connection:await this.status(),inputAccepted:data.action==='prompt'};
 }catch(e){await this.failure(e);throw e;}});}
 async manage(input:unknown){return this.queue(async()=>{const data=z.discriminatedUnion('action',[z.object({action:z.literal('devices.list')}),z.object({action:z.literal('devices.pair-code')}),z.object({action:z.literal('devices.revoke'),deviceId:z.uuid()}),z.object({action:z.literal('goals.list')}),z.object({action:z.literal('goals.create'),operationId:z.uuid(),goal:goalSchema})]).parse(input);const client=await this.client();if(data.action==='devices.list')return client.request('/devices');if(data.action==='devices.pair-code')return client.request('/devices/pair-code',{});if(data.action==='devices.revoke')return client.request('/devices/revoke',{deviceId:data.deviceId});if(data.action==='goals.list')return {items:(await client.snapshot()).goals};if(!this.connected)throw Error('Refresh before writing');return client.createGoal(data.operationId,data.goal);});}
 async dispose(){this.disposed=true;await this.serial;this.connected=false;}
}
