// Image-owned immutable package addresses. Install both in one public CLI call
// so no profile dependency can keep pointing at a vanished previous image path.
import { readFileSync, writeFileSync, mkdirSync, existsSync, renameSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
const names = ['@abwoo/deepseek-always-on', '@abwoo/deepseek-always-on-managed'];
export function prepareRuntimeBundles(root = process.cwd()) {
  const packages = [
    readFileSync(join(root, 'package.json'), 'utf8'),
    readFileSync(join(root, 'packages/managed/package.json'), 'utf8'),
  ].map((x) => JSON.parse(x));
  mkdirSync(join(root, 'runtime-bundles'), { recursive: true });
  const manifest = packages.map((pkg, i) => {
    if (pkg.name !== names[i]) throw Error('Unexpected runtime package identity');
    const original = pkg.name.replace(/^@/, '').replace('/', '-') + '-' + pkg.version + '.tgz',
      bytes = readFileSync(join(root, original));
    const sha256 = createHash('sha256').update(bytes).digest('hex'),
      file = 'runtime-bundles/' + sha256 + '.tgz';
    if (existsSync(join(root, file))) {
      if (
        createHash('sha256')
          .update(readFileSync(join(root, file)))
          .digest('hex') !== sha256
      )
        throw Error('Existing image bundle is corrupt');
    } else writeFileSync(join(root, file), bytes, { mode: 0o444 });
    return { name: pkg.name, version: pkg.version, sha256, file };
  });
  const temp = join(root, 'runtime-bundles.json.build');
  writeFileSync(temp, JSON.stringify(manifest, null, 2), { mode: 0o444 });
  renameSync(temp, join(root, 'runtime-bundles.json'));
  return manifest;
}
export function runtimeBundlePaths(root = process.cwd()) {
  const manifest = JSON.parse(readFileSync(join(root, 'runtime-bundles.json'), 'utf8'));
  if (!Array.isArray(manifest) || manifest.length !== 2)
    throw Error('Runtime package manifest is missing');
  return manifest.map((item, i) => {
    if (
      item.name !== names[i] ||
      !/^[a-f0-9]{64}$/.test(item.sha256) ||
      item.file !== 'runtime-bundles/' + item.sha256 + '.tgz'
    )
      throw Error('Invalid runtime package manifest');
    const file = resolve(root, item.file);
    if (createHash('sha256').update(readFileSync(file)).digest('hex') !== item.sha256)
      throw Error('Runtime package integrity mismatch');
    return file;
  });
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  prepareRuntimeBundles();
