import { readFile } from 'node:fs/promises';
const service=JSON.parse(await readFile('config/public-service.json','utf8')).serviceOrigin;
if(service){const u=new URL(service);if(u.protocol!=='https:'||u.origin!==service)throw Error('Release service must be a trusted HTTPS origin');}
import { build } from 'esbuild';
await build({ entryPoints: ['src/desktop/host.ts'], outfile: 'packages/desktop/host.mjs',
  bundle: true, packages: 'external', platform: 'node', format: 'esm', target: 'node24', define:{__ALWAYS_ON_SERVICE_ORIGIN__:JSON.stringify(service)} });
await build({ entryPoints: ['src/desktop/client.js'], outfile: 'packages/desktop/client.js',
  bundle: true, format: 'iife', target: 'es2022' });
