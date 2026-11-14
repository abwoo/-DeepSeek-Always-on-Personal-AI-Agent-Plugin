import { z } from 'zod';
import { managedOrigin, credentialsSchema } from '../shared/managed-client.js';
import { ControlStore } from './store.js';
import { GatewayError } from '../managed/store.js';
const slotSchema=z.object({id:z.string().regex(/^[a-z0-9-]{1,48}$/),origin:z.string(),provisioningKey:z.string().min(32).max(256)}).strict();
export type Slot=z.infer<typeof slotSchema>;
/** Bounded preallocated isolated Harness pool, not an Agent runtime or inference loop. */
export class AgentPool {
  readonly slots:Slot[];
  private serial:Promise<unknown>=Promise.resolve();
  constructor(private store:ControlStore,slots:unknown,private allowLoopback=false,private transport:typeof fetch=fetch){
    this.slots=z.array(slotSchema).min(2).max(64).parse(slots);
    const ids=new Set(),origins=new Set();
    for(const s of this.slots){s.origin=managedOrigin(s.origin,allowLoopback);if(ids.has(s.id)||origins.has(s.origin))throw Error('Each pool slot requires an independent origin and ID');ids.add(s.id);origins.add(s.origin);}
  }
  slot(id:string){const s=this.slots.find(s=>s.id===id);if(!s)throw new GatewayError(503,'agent_slot_missing');return s;}
  async operator(slot:Slot,path:'inspect'|'bind'|'device'|'revoke',body:unknown={}){
    const r=await this.transport(slot.origin+'/personal-agent/v1/operator/'+path,{method:'POST',headers:{'content-type':'application/json','x-always-on-provisioning-key':slot.provisioningKey},body:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(15000)});
    if(!r.ok)throw new GatewayError(503,'agent_provisioning_unavailable');
    return r.json();
  }
  async allocate(accountId:string){
    const work=async()=>{
      const allocation=this.store.reserve(accountId,this.slots.map(s=>s.id));
      if(allocation.status==='suspended')throw new GatewayError(503,'agent_suspended');
      const slot=this.slot(String(allocation.slot_id));
      try{
        const identity=z.object({authorityId:z.uuid(),ownerId:z.uuid()}).parse(await this.operator(slot,'bind',{accountId}));
        this.store.allocationReady(accountId,identity.authorityId,identity.ownerId);
        return {slot,...identity};
      }catch(e){this.store.db.prepare('UPDATE allocations SET error=?,updated_at=? WHERE account_id=?').run('agent_provisioning_unavailable',Date.now(),accountId);throw e;}
    };
    const next=this.serial.then(work,work);this.serial=next.catch(()=>{});return next;
  }
  async register(accountId:string,input:{id:string;token:string;name:string;platform:string}){
    const allocation=await this.allocate(accountId);
    const result=credentialsSchema.parse(await this.operator(allocation.slot,'device',{accountId,...input}));
    if(result.authorityId!==allocation.authorityId||result.ownerId!==allocation.ownerId||result.deviceId!==input.id||result.token!==input.token)throw new GatewayError(409,'authority_identity_changed');
    return {credentials:result,slotId:allocation.slot.id};
  }
  async forward(slotId:string,token:string,path:string,method:string,body?:string){
    const s=this.slot(slotId);
    return this.transport(s.origin+'/personal-agent/v1'+path,{method,headers:{authorization:'Bearer '+token,'content-type':'application/json'},...(body?{body}:{}),redirect:'error',signal:AbortSignal.timeout(15000)});
  }
}
