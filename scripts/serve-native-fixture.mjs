// Loopback-only native QA fixture. Real Harness/control APIs; local identity and
// deterministic model adapters. Never a hosted service or production sign-in.
import {createServer} from 'node:https';
import {readFile,writeFile} from 'node:fs/promises';
export async function serveNativeFixture({base,connection,observer}){
 const cert=process.env.ALWAYS_ON_NATIVE_TLS_CERT,key=process.env.ALWAYS_ON_NATIVE_TLS_KEY;
 if(!cert||!key)throw Error('Native QA requires a private temporary TLS key and trusted test certificate');
 let offline=false;const metrics={};
 const server=createServer({cert:await readFile(cert),key:await readFile(key)},async(req,res)=>{
  const send=(status,data)=>{res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(data));};
  try{
   const url=new URL(req.url,'https://127.0.0.1:8443');
   if(req.method==='GET'&&url.pathname==='/engineering/bootstrap')return send(200,connection);
   if(req.method==='GET'&&url.pathname==='/engineering/state')return send(200,await observer.snapshot());
   if(req.method==='GET'&&url.pathname==='/engineering/conversation'){
    const id=url.searchParams.get('id');if(!/^session-[0-9a-f-]{36}$/.test(id??''))return send(400,{error:'invalid_fixture_session'});
    return send(200,await observer.readSession(id));
   }
   if(req.method==='GET'&&url.pathname==='/engineering/metrics')return send(200,metrics);
   if(req.method==='GET'&&url.pathname==='/engineering/ready')return send(200,{fixture:true,actualHarness:true,realIdentityProvider:false,realDeepSeek:false,realPhone:false,mvpReady:false});
   if(req.method==='POST'&&url.pathname==='/engineering/offline'){offline=url.searchParams.get('enabled')==='1';return send(200,{offline});}
   if(!['/account/v1/','/personal-agent/v1/'].some(p=>url.pathname.startsWith(p)))return send(404,{error:'route_not_found'});
   if(offline)return send(503,{error:'runtime_unavailable'});
   const metric=req.method+' '+url.pathname;metrics[metric]=(metrics[metric]??0)+1;
   const chunks=[];let size=0;
   for await(const c of req){size+=c.length;if(size>65536)return send(413,{error:'payload_too_large'});chunks.push(c);}
   const response=await fetch(base+url.pathname+url.search,{method:req.method,headers:{'content-type':'application/json',...(req.headers.authorization?{authorization:req.headers.authorization}:{})},...(req.method==='POST'?{body:Buffer.concat(chunks)}:{}),redirect:'manual',signal:AbortSignal.timeout(20000)});
   res.writeHead(response.status,{'content-type':response.headers.get('content-type')??'application/json','cache-control':'no-store',...(response.headers.has('location')?{location:response.headers.get('location')}:{})});res.end(Buffer.from(await response.arrayBuffer()));
  }catch{if(!res.headersSent)send(503,{error:'engineering_proxy_unavailable'});else res.end();}
 });
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(8443,'127.0.0.1',resolve);});
 if(process.env.ALWAYS_ON_NATIVE_READY_FILE)await writeFile(process.env.ALWAYS_ON_NATIVE_READY_FILE,JSON.stringify({actualHarness:true,authorityId:connection.credentials.authorityId,mvpReady:false}));
 console.log('Loopback native QA fixture ready; identity/model adapters only, not a production service.');
 await new Promise(resolve=>{process.once('SIGTERM',resolve);process.once('SIGINT',resolve);});
 await new Promise(resolve=>server.close(resolve));
}
