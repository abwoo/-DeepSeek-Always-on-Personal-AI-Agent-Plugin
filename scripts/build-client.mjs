import {build} from 'esbuild';
import {copyFile} from 'node:fs/promises';
await build({entryPoints:['src/client/index.js'],outfile:'dist/client.js',bundle:true,format:'iife',target:'es2022',minify:false});
await copyFile('src/client/always-on-sw.js','dist/always-on-sw.js');
