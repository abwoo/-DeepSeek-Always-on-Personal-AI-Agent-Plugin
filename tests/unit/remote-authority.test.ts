import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { validateAuthority } from '../../src/remote/probe-connection.js';

test('Phase 0 SDK composition uses one verified Harness/Cordis version set', () => {
  const require = createRequire(import.meta.url);
  for (const name of ['dsh', 'dsh-client-connection', 'dsh-api-gateway', 'dsh-api-session-controller', 'dsh-typert-registry']) {
    assert.equal(require(`@deepseek-ai/${name}/package.json`).version, '0.2.2-rc.3');
  }
  assert.equal(require('@deepseek-ai/cordis/package.json').version, '4.1.0');
});

test('remote transport refuses insecure authorities and credential-bearing URLs', () => {
  for (const url of [
    'http://agent.example', 'https://secret@agent.example',
    'https://agent.example/?token=secret', 'https://agent.example/#secret',
    'https://agent.example/api/', 'file:///etc/passwd',
  ]) assert.throws(() => validateAuthority(url));
  assert.equal(validateAuthority('https://agent.example').origin, 'https://agent.example');
  assert.throws(() => validateAuthority('http://127.0.0.1:4317'));
  assert.equal(validateAuthority('http://127.0.0.1:4317', true).port, '4317');
  assert.throws(() => validateAuthority('http://agent.example', true));
});
