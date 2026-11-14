import { build } from 'esbuild';
await build({ entryPoints: ['src/desktop/host.ts'], outfile: 'packages/desktop/host.mjs',
  bundle: true, packages: 'external', platform: 'node', format: 'esm', target: 'node24' });
await build({ entryPoints: ['src/desktop/client.js'], outfile: 'packages/desktop/client.js',
  bundle: true, format: 'iife', target: 'es2022' });
