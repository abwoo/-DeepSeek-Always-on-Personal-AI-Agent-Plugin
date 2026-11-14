// Build the shared browser-neutral client from committed sources in EAS's monorepo archive.
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../../', import.meta.url));
if (Number(process.versions.node.split('.')[0]) < 24)
  throw Error('This pinned Harness source build requires Node 24+');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
execFileSync(npm, ['ci'], { cwd: root, stdio: 'inherit' });
execFileSync(npm, ['run', 'build'], { cwd: root, stdio: 'inherit' });
execFileSync(process.execPath, ['scripts/build-managed-client.mjs'], {
  cwd: root,
  stdio: 'inherit',
});
