import { build } from 'esbuild';
import { mkdir, copyFile, readFile, writeFile } from 'node:fs/promises';
await mkdir('packages/client', { recursive: true });
await build({
  entryPoints: ['src/shared/managed-client.ts'],
  outfile: 'packages/client/index.js',
  bundle: true,
  packages: 'external',
  platform: 'neutral',
  format: 'esm',
  target: 'es2022',
});
await build({
  entryPoints: ['src/shared/account-client.ts'],
  outfile: 'packages/client/account.js',
  bundle: true,
  packages: 'external',
  platform: 'neutral',
  format: 'esm',
  target: 'es2022',
});
for (const file of [
  'managed-client',
  'managed-contract',
  'schemas',
  'messages',
  'account-client',
  'export-contract',
])
  await copyFile(
    `dist/shared/${file}.d.ts`,
    `packages/client/${file === 'managed-client' ? 'index' : file === 'account-client' ? 'account' : file}.d.ts`,
  );

const accountTypes = await readFile('packages/client/account.d.ts', 'utf8');
await writeFile(
  'packages/client/account.d.ts',
  accountTypes.replaceAll('./managed-client.js', './index.js'),
);
