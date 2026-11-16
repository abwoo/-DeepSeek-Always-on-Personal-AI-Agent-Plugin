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

test('ADB diagnostics cannot contaminate hierarchy XML or screenshot byte streams', () => {
  const script = `
import ast,pathlib,subprocess,types
module=ast.parse(pathlib.Path('scripts/mobile-android-contract.py').read_text())
selected=[node for node in module.body if isinstance(node,ast.FunctionDef) and node.name=='adb']
xml=b'<?xml version="1.0"?><hierarchy/>'
def run(command,**options):
 assert command==['adb','exec-out','cat','/sdcard/native-contract.xml']
 assert options['stdout']==subprocess.PIPE and options['stderr']==subprocess.PIPE
 assert options['check'] is True and options['timeout']==35
 return types.SimpleNamespace(stdout=xml,stderr=b'adb transport warning')
transport=types.SimpleNamespace(run=run,PIPE=subprocess.PIPE)
scope={'subprocess':transport,'evidence':{}}
exec(compile(ast.Module(body=selected,type_ignores=[]),'<native ADB transport>','exec'),scope)
assert scope['adb']('exec-out','cat','/sdcard/native-contract.xml')==xml
assert scope['evidence']['adbDiagnosticCount']==1
assert scope['evidence']['adbDiagnosticObservations']==[{'command':'exec-out','stderrBytes':21}]
def fail(*args,**options):raise subprocess.CalledProcessError(1,args[0],stderr=b'error')
transport.run=fail
try:scope['adb']('exec-out','cat','/sdcard/native-contract.xml')
except subprocess.CalledProcessError:pass
else:raise AssertionError('ADB failure was masked')
print('Native ADB byte and failure boundaries verified')
`;
  assert.match(execFileSync('python3', ['-c', script], { encoding: 'utf8' }), /byte and failure boundaries verified/);
});
