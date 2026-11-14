import {build} from 'esbuild';
await build({entryPoints:['src/managed/index.ts'],outfile:'packages/managed/host.mjs',bundle:true,packages:'external',platform:'node',format:'esm',target:'node24'});
