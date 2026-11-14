import type { Context } from '@deepseek-ai/cordis';
import type {} from '@deepseek-ai/dsh-host-webserver';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { resolve } from 'node:path';
import { homedir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { GatewayStore, GatewayError, hash, type Device } from './store.js';
import { NativePush } from './push.js';
import type {} from '../host/index.js';
import { nativeClient } from './native.js';
import { pairClaim, mutationSchema, opaqueId, goalSchema } from '../shared/managed-contract.js';

export const inject = ['alwaysOn','connection','webServer','sessions'];
export interface Config { dataDir?:string; publicOrigin?:string; trustedProxyAddresses?:string[]; allowLoopback?:boolean; }
export async function apply(ctx:Context,config:Config={}) {
  const dir=resolve(config.dataDir??process.env.ALWAYS_ON_GATEWAY_DATA_DIR??resolve(process.env.ALWAYS_ON_DATA_DIR??resolve(homedir(),'.deepseek-always-on'),'managed'));
  const store=new GatewayStore(resolve(dir,'gateway.sqlite'));
  ctx.effect(()=>()=>store.close());
  const native=await nativeClient(ctx);ctx.effect(()=>()=>native.close());
  const push=new NativePush(store,()=>ctx.alwaysOn.notifications.list(),{enabled:process.env.ALWAYS_ON_EXPO_PUSH_ENABLED==='1',projectId:process.env.ALWAYS_ON_EXPO_PROJECT_ID,accessToken:process.env.ALWAYS_ON_EXPO_ACCESS_TOKEN});
  const pushTimer=setInterval(()=>{void push.tick().catch(()=>ctx.logger.warn('Native push worker unavailable; Inbox retained'));},10000);pushTimer.unref();
  ctx.effect(()=>async()=>{clearInterval(pushTimer);await push.close();});
  const publicOrigin=config.publicOrigin??process.env.ALWAYS_ON_PUBLIC_ORIGIN;
  if(publicOrigin){const u=new URL(publicOrigin);if(u.protocol!=='https:'||u.username||u.password||u.pathname!=='/'||u.search||u.hash)throw new Error('Public origin must be an HTTPS origin');}
  const proxies=config.trustedProxyAddresses??(process.env.ALWAYS_ON_TRUSTED_PROXIES??'').split(',').filter(Boolean);
  const allowLoopback=config.allowLoopback??process.env.ALWAYS_ON_GATEWAY_ALLOW_LOOPBACK==='1';
  const prefix='/personal-agent/v1';
  let enabled=true,queued=0,serial:Promise<unknown>=Promise.resolve();
  const serialized=<T>(work:()=>Promise<T>)=>{if(queued>=32)throw new GatewayError(429,'authority_busy');queued++;const next=serial.then(work,work).finally(()=>{queued--;});serial=next.catch(()=>{});return next;};
  ctx.effect(()=>async()=>{enabled=false;await serial;});
  const json=(data:unknown,status=200)=>Response.json(data,{status,headers:{'cache-control':'no-store','x-content-type-options':'nosniff'}});
  const requireResult=<T>(r:{ok:true,value:T}|{ok:false,error:unknown}):T=>{if(!r.ok)throw new GatewayError(503,'native_session_unavailable');return r.value;};
  const snapshot=async()=>{
    const state=await native.core('GET');const data={...state,pushPublicKey:null,goals:store.goals()};
    const revision=store.observeSnapshot(data);return {authorityId:store.authorityId,ownerId:store.ownerId,revision,serverTime:new Date().toISOString(),...data};
  };
  const runCommand=async(device:Device,op:string,command:z.infer<typeof mutationSchema>['command'])=>{
    if(!command.action.startsWith('session.'))return {accepted:true,...await native.core('POST',command)};
    let sessionId:string;
    if(command.action==='session.create')sessionId=requireResult(await native.session.create({sessionId:command.data.creationId as never})).sessionId;
    else if(command.action==='session.prompt') {
      sessionId=command.data.sessionId;
      requireResult(await native.session.prompt({sessionId:sessionId as never,requestId:hash(`${device.id}:${op}`) as never,mode:'queue',content:[{type:'text',text:command.data.text}]}));
    } else if(command.action==='session.cancel') {sessionId=command.data.sessionId;requireResult(await native.session.cancel({sessionId:sessionId as never}));}
    else throw new GatewayError(400,'unsupported_action');
    await native.flush(sessionId);return {accepted:true,sessionId,modelSuccessClaimed:false};
  };
  const readBody=async(req:IncomingMessage)=>{
    if(!String(req.headers['content-type']??'').startsWith('application/json'))throw new GatewayError(415,'json_required');
    if(Number(req.headers['content-length']??0)>65536)throw new GatewayError(413,'payload_too_large');
    let size=0;const chunks:Buffer[]=[];
    for await(const value of req){const chunk=Buffer.from(value);size+=chunk.length;if(size>65536)throw new GatewayError(413,'payload_too_large');chunks.push(chunk);}
    try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw new GatewayError(400,'invalid_json');}
  };
  const attempts=new Map<string,{count:number,until:number}>();
  function throttle(ip:string){const now=Date.now();for(const [key,value]of attempts)if(value.until<now)attempts.delete(key);if(attempts.size>4096)throw new GatewayError(429,'rate_limit');const value=attempts.get(ip)??{count:0,until:now+60000};if(++value.count>30)throw new GatewayError(429,'rate_limit');attempts.set(ip,value);}
  const isLocal=(address:string)=>address==='::1'||address==='127.0.0.1'||address==='::ffff:127.0.0.1';
  async function route(req:IncomingMessage):Promise<Response>{
    if(!enabled)throw new GatewayError(503,'gateway_disabled');
    const remote=req.socket.remoteAddress??'';
    const tls='encrypted' in req.socket&&req.socket.encrypted;
    const proxy=proxies.includes(remote)&&req.headers['x-forwarded-proto']==='https'&&!!publicOrigin&&req.headers.host===new URL(publicOrigin).host;
    if(!tls&&!proxy&&!(allowLoopback&&isLocal(remote)))throw new GatewayError(403,'https_required');
    const url=new URL(req.url??'/', 'http://personal-agent.invalid'),path=url.pathname.slice(prefix.length);
    if(req.method==='GET'&&path==='/health')return json({ready:true,runtime:'deepseek-harness',protocol:2,mvpReady:false});
    if(req.method==='POST'&&path==='/pair/claim'){throttle(remote);const body=pairClaim.parse(await readBody(req));return json(store.claim(body.code,body.name,body.platform));}
    const authorization=String(req.headers.authorization??'');if(!authorization.startsWith('Bearer '))throw new GatewayError(401,'device_unauthorized');
    const device=store.authenticate(authorization.slice(7));
    if(req.method==='GET'&&path==='/snapshot')return serialized(async()=>{store.authenticate(authorization.slice(7));return json(await snapshot());});
    if(req.method==='GET'&&path==='/changes'){const after=z.coerce.number().int().min(0).parse(url.searchParams.get('after')??'0');await serialized(snapshot);return json({authorityId:store.authorityId,...store.changes(after)});}
    if(req.method==='GET'&&path==='/sessions')return json({authorityId:store.authorityId,...requireResult(await native.session.list({}))});
    if(req.method==='POST'&&path==='/session/read'){
      const body=z.object({sessionId:opaqueId,beforeSeq:z.number().int().min(0).optional()}).strict().parse(await readBody(req));
      const address={kind:'session' as const,sessionId:body.sessionId as never};
      const events=requireResult(await native.session.events({address,maxMessages:100,...body.beforeSeq===undefined?{}:{beforeSeq:body.beforeSeq}}));
      const state=requireResult(await native.session.state({sessionId:body.sessionId as never}));
      return json({authorityId:store.authorityId,sessionId:body.sessionId,events,state});
    }
    if(req.method==='GET'&&path.startsWith('/operations/')){
      const id=z.uuid().parse(path.slice('/operations/'.length));const operation=store.operation(device.id,id);if(!operation)throw new GatewayError(404,'operation_not_found');return json({authorityId:store.authorityId,operationId:id,...operation});
    }
    if(req.method==='POST'&&path==='/mutate'){
      const body=mutationSchema.parse(await readBody(req));
      return serialized(async()=>{store.authenticate(authorization.slice(7));const result=await store.execute(device.id,body.operationId,body.command,()=>runCommand(device,body.operationId,body.command));return json({authorityId:store.authorityId,operationId:body.operationId,operationStatus:'committed',revision:store.revision(),result});});
    }
    if(req.method==='POST'&&path==='/goals'){
      const body=z.object({operationId:z.uuid(),goal:goalSchema}).strict().parse(await readBody(req));
      return serialized(async()=>{store.authenticate(authorization.slice(7));const result=await store.execute(device.id,body.operationId,body,async()=>{
        const goalId=randomUUID();const task=await native.core('POST',{action:'task.create',data:{title:body.goal.title,instruction:body.goal.instruction,goal:`Authorized ongoing goal ${goalId}`,timing:{kind:'every',every_seconds:body.goal.everySeconds},allowedTools:body.goal.allowedTools,maxRuns:body.goal.maxRuns}});
        const goal={id:goalId,...body.goal,taskId:task.result.id,createdAt:new Date().toISOString()};store.saveGoal(goalId,goal);return goal;
      });return json({authorityId:store.authorityId,operationId:body.operationId,operationStatus:'committed',revision:store.revision(),result});});
    }
    if(req.method==='GET'&&path.startsWith('/inbox/')){const id=z.uuid().parse(path.slice('/inbox/'.length));const notice=ctx.alwaysOn.notifications.list().find(n=>n.id===id);if(!notice)throw new GatewayError(404,'notice_not_found');return json(notice);}
    if(req.method==='GET'&&path==='/push/status')return json(push.status(device.id));
    if(req.method==='POST'&&path==='/push/register')return json(push.register(device.id,await readBody(req)));
    if(req.method==='POST'&&path==='/push/disable')return json(push.disable(device.id));
    if(req.method==='POST'&&path==='/push/ack')return json(push.ack(device.id,await readBody(req)));
    if(req.method==='GET'&&path==='/devices')return json({items:store.devices()});
    if(req.method==='POST'&&path==='/devices/pair-code')return json(store.pairCode());
    if(req.method==='POST'&&path==='/devices/revoke'){
      const body=z.object({deviceId:z.uuid()}).strict().parse(await readBody(req));store.revoke(body.deviceId);return json({revoked:true});
    }
    throw new GatewayError(404,'route_not_found');
  }
  const send=async(res:ServerResponse,response:Response)=>{res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));};
  ctx.effect(()=>ctx.webServer.register({kind:'prefix',path:prefix,handler:async(req,res)=>{
    const timer=setTimeout(()=>{if(!res.writableEnded){res.writeHead(408,{'connection':'close'});res.end();req.destroy();}},15000);timer.unref();
    try{await send(res,await route(req));}catch(e){if(!res.writableEnded){const status=e instanceof GatewayError?e.status:e instanceof z.ZodError?400:503;await send(res,json({error:e instanceof GatewayError?e.code:e instanceof z.ZodError?'invalid_request':'runtime_unavailable',mvpReady:false},status));}}finally{clearTimeout(timer);}
  }}));
  ctx.effect(()=>ctx.connection.fetch.register({path:'/api/always-on-managed/admin',methods:['POST'],requestBody:'buffered',fetch:async request=>{
    try{const body=z.discriminatedUnion('action',[z.object({action:z.literal('pair.create')}).strict(),z.object({action:z.literal('devices.list')}).strict(),z.object({action:z.literal('devices.revoke'),deviceId:z.uuid()}).strict()]).parse(await request.json());
      if(body.action==='pair.create')return json(store.pairCode());if(body.action==='devices.list')return json({items:store.devices()});store.revoke(body.deviceId);return json({revoked:true});
    }catch{return json({error:'invalid_admin_command'},400);}
  }}));
}
