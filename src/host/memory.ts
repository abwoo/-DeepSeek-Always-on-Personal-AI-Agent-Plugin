import { randomUUID } from 'node:crypto';
import { memorySchema } from '../shared/schemas.js';
import type { Store } from './storage.js';
export interface Memory {id:string;kind:string;content:string;source:string;updatedAt:string;consent:boolean}
export class MemoryService {
 constructor(private store:Store){}
 save(input:unknown) {const data=memorySchema.parse(input);const id=data.id??randomUUID();const entry={...data,id,updatedAt:new Date().toISOString()};this.store.put('memory',id,entry);return entry;}
 propose(input:unknown){const data=memorySchema.omit({consent:true}).parse(input);const id=randomUUID();const entry={...data,id,consent:false,updatedAt:new Date().toISOString()};this.store.put('memory',id,entry);return entry;}
 list(){return this.store.all<Memory>('memory');}
 remove(id:string){return this.store.delete('memory',id)>0;}
 search(query:string,limit=5){const terms=query.toLowerCase().match(/[\p{L}\p{N}]+/gu)??[];return this.list().filter(m=>m.consent).map(m=>({m,score:terms.reduce((a,t)=>a+(m.content.toLowerCase().includes(t)?1:0),0)})).filter(x=>x.score>0).sort((a,b)=>b.score-a.score).slice(0,Math.min(5,Math.max(0,limit))).map(x=>x.m);}
}
