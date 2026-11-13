import {z} from 'zod';
import type {Coordinator} from './tasks.js';
import type {MemoryService} from './memory.js';
import type {Notifications} from './notifications.js';
export function createApi(c:Coordinator,m:MemoryService,n:Notifications,publicKey?:string){return async(request:Request)=>{try{
 if(request.method==='GET'){const native=await c.scheduler.catalog?.()??[];return Response.json({online:c.enabled,tasks:c.tasks().map(t=>({...t,nextScheduledAt:native.find(n=>n.id===t.scheduleId&&n.status==='active')?.scheduledAt})),runs:c.runs().slice(0,200),memories:m.list(),inbox:n.list().slice(0,200),pushPublicKey:publicKey??null},{headers:{'Cache-Control':'no-store'}});}
 if(request.method!=='POST')return new Response('Method not allowed',{status:405});
 if(!request.headers.get('content-type')?.startsWith('application/json'))return new Response('JSON required',{status:415});
 const body=await request.text();if(body.length>65536)return new Response('Request too large',{status:413});
 const {action,data}=z.object({action:z.string(),data:z.unknown().optional()}).parse(JSON.parse(body));let result:unknown;
 switch(action){case'task.create':result=await c.create(data);break;
 case'task.control':{const x=z.object({id:z.string(),state:z.enum(['active','paused','cancelled'])}).parse(data);result=await c.control(x.id,x.state);break;}
 case'task.run':{const t=c.requireTask(z.object({id:z.string()}).parse(data).id);if(t.state!=='active'||!t.scheduleId)throw new Error('Task is not active');result=await c.scheduler.run({id:t.scheduleId});break;}
 case'memory.save':result=m.save(data);break;
 case'memory.delete':result=m.remove(z.object({id:z.string()}).parse(data).id);break;
 case'inbox.read':n.read(z.object({id:z.string()}).parse(data).id);result={ok:true};break;
 case'push.subscribe':result=n.subscribe(data);break;
 case'push.unsubscribe':n.unsubscribe(z.object({id:z.string()}).parse(data).id);result={ok:true};break;
 default:return new Response('Unknown action',{status:400});}
 return Response.json({ok:true,result},{headers:{'Cache-Control':'no-store'}});
 }catch(e){return Response.json({ok:false,error:e instanceof Error?e.message:'Request failed'},{status:400,headers:{'Cache-Control':'no-store'}});}};}
