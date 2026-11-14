import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const { localize } = createRequire(import.meta.url)('../../apps/mobile/locales.ts');
test('native bilingual labels preserve unknown text and do not duplicate selected-state markers', () => {
  assert.equal(localize('Sign in', 'zh'), '登录');
  assert.equal(localize('✓ dark', 'zh'), '✓ 深色');
  assert.equal(localize(localize('✓ dark', 'zh'), 'zh'), '✓ 深色');
  assert.equal(localize('A personal custom name', 'zh'), 'A personal custom name');
  assert.equal(localize('✓ dark', 'en'), '✓ dark');
});
