import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
test('native probe replaces the shared dispatcher even for previously captured builtin fetch (real loopback HTTP)', async () => {
  const bootstrap = new URL('../../scripts/native-probe-http.mjs', import.meta.url).href;
  const result = await promisify(execFile)(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `
    import assert from 'node:assert/strict';
    import { createServer } from 'node:http';
    const captured=globalThis.fetch;
    await captured('data:text/plain,initialize-node-dispatcher');
    const u=await import('undici');
    const initial=u.getGlobalDispatcher();
    const probe=await import(${JSON.stringify(bootstrap)});
    assert.notEqual(u.getGlobalDispatcher(),initial);
    assert.ok(u.getGlobalDispatcher() instanceof u.Agent);
    const server=createServer((req,res)=>res.end('verified-loopback'));
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    try {
      const url='http://127.0.0.1:'+server.address().port;
      const results=await Promise.all(Array.from({length:20},(_,n)=>(n%2?captured:probe.fetch)(url).then(r=>r.text())));
      assert.ok(results.every(r=>r==='verified-loopback'));
      console.log(JSON.stringify({requests:results.length,capturedBuiltinAndPinnedFetch:true}));
    } finally {await u.getGlobalDispatcher().close();await new Promise(resolve=>server.close(resolve));}
  `,
    ],
    { timeout: 15000 },
  );
  assert.deepEqual(JSON.parse(result.stdout), {
    requests: 20,
    capturedBuiltinAndPinnedFetch: true,
  });
});
