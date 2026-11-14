import { build } from 'esbuild';
await build({ entryPoints: ['src/remote/probe-plugin.ts'], outfile: 'probes/desktop-remote/host.mjs',
  bundle: true, packages: 'external', platform: 'node', format: 'esm', target: 'node24' });
