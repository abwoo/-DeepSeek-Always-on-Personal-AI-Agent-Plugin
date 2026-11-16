import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

test('native observation retries require a valid UI and retain the original deadline and application failures', () => {
  const script = `
import ast, pathlib
module=ast.parse(pathlib.Path('scripts/mobile-android-contract.py').read_text())
selected=[node for node in module.body if isinstance(node,(ast.ClassDef,ast.FunctionDef)) and node.name in ('SnapshotUnavailable','wait')]
class Clock:
 def __init__(self):self.now=0
 def monotonic(self):return self.now
 def sleep(self,n):self.now+=n
clock=Clock();scope={'time':clock}
exec(compile(ast.Module(body=selected,type_ignores=[]),'<native observation wait>','exec'),scope)
Unavailable=scope['SnapshotUnavailable'];wait=scope['wait'];calls=0
def transient():
 global calls
 calls+=1
 if calls==1:raise Unavailable('malformed_xml')
 return 'actual valid UI observation'
assert wait(transient,3)=='actual valid UI observation'
assert calls==2 and clock.now==1
clock.now=0;calls=0
def missing():
 global calls
 calls+=1
 raise Unavailable('malformed_xml')
try:wait(missing,3)
except RuntimeError as error:assert str(error)=='Native contract observation timed out'
else:raise AssertionError('Malformed UI observations were promoted to a pass')
assert calls==3 and clock.now==3
def app_failure():raise AssertionError('actual application failure')
try:wait(app_failure,3)
except AssertionError as error:assert str(error)=='actual application failure'
else:raise AssertionError('Application failure was masked')
print('Native observation deadline and failure boundaries verified')
`;
  assert.match(execFileSync('python3', ['-c', script], { encoding: 'utf8' }), /deadline and failure boundaries verified/);
});
