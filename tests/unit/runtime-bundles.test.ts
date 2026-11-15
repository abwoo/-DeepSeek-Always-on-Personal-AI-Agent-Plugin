import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { prepareRuntimeBundles, runtimeBundlePaths } from '../../deploy/managed/bundles.mjs';
test('runtime package addresses change with content even when preview versions stay fixed; tampering fails before installation', () => {
  const root = mkdtempSync(join(tmpdir(), 'ao-runtime-bundles-'));
  try {
    mkdirSync(join(root, 'packages/managed'), { recursive: true });
    writeFileSync(
      join(root, 'package.json'),
      JSON.stringify({ name: '@abwoo/deepseek-always-on', version: '0.1.0-alpha.2' }),
    );
    writeFileSync(
      join(root, 'packages/managed/package.json'),
      JSON.stringify({ name: '@abwoo/deepseek-always-on-managed', version: '0.2.0-dev.1' }),
    );
    const a = join(root, 'abwoo-deepseek-always-on-0.1.0-alpha.2.tgz'),
      b = join(root, 'abwoo-deepseek-always-on-managed-0.2.0-dev.1.tgz');
    writeFileSync(a, 'core before');
    writeFileSync(b, 'gateway before');
    const first = prepareRuntimeBundles(root);
    const before = runtimeBundlePaths(root);
    writeFileSync(a, 'core after');
    writeFileSync(b, 'gateway after');
    const second = prepareRuntimeBundles(root);
    const after = runtimeBundlePaths(root);
    assert.notEqual(before[0], after[0]);
    assert.notEqual(before[1], after[1]);
    assert.equal(first[0].version, second[0].version);
    rmSync(after[1]);
    writeFileSync(after[1], 'corrupt');
    assert.throws(() => runtimeBundlePaths(root), /integrity mismatch/);
    const invalid = [...second];
    invalid[0] = { ...invalid[0], file: '../private.tgz' };
    rmSync(join(root, 'runtime-bundles.json'));
    writeFileSync(join(root, 'runtime-bundles.json'), JSON.stringify(invalid));
    assert.throws(() => runtimeBundlePaths(root), /Invalid runtime package manifest/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
