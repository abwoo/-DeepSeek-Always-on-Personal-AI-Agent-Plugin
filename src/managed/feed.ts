import { randomUUID } from 'node:crypto';
/** Bounded transient delivery. Native Session logs remain the durable source of truth. */
export class LiveFeed {
  readonly epoch=randomUUID();
  private sequence=0;
  private rows:Array<{seq:number;sessionId:string;kind:string;data:unknown}>=[];
  private bytes=0;
  private waiters=new Set<()=>void>();
  publish(sessionId:string,kind:string,data:unknown){
    const row={seq:++this.sequence,sessionId,kind,data};
    const size=Buffer.byteLength(JSON.stringify(row));if(size>65536){this.wake();return;}
    this.rows.push(row);this.bytes+=size;
    while(this.rows.length>1000||this.bytes>2*1024*1024)this.bytes-=Buffer.byteLength(JSON.stringify(this.rows.shift()));
    this.wake();
  }
  read(epoch:string|undefined,after:number,sessionId?:string){
    const reset=epoch!==this.epoch||after>this.sequence||after<(this.rows[0]?.seq??this.sequence+1)-1;
    return {epoch:this.epoch,live:this.sequence,resetLive:reset,frames:reset?[]:this.rows.filter(r=>r.seq>after&&(!sessionId||r.sessionId===sessionId))};
  }
  wait(milliseconds:number){
    if(this.waiters.size>=64)return Promise.reject(Error('Too many active event readers'));
    return new Promise<void>(resolve=>{const done=()=>{clearTimeout(timer);this.waiters.delete(done);resolve();};const timer=setTimeout(done,milliseconds);timer.unref();this.waiters.add(done);});
  }
  wake(){for(const fn of this.waiters)fn();}
}
