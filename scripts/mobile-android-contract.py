"""CI engineering flavor: actual RN/OS controls + real Harness, fixture identity/model.
Never physical-phone, live OAuth/DeepSeek, APNs/FCM or production acceptance.
The ordinary preview APK is compiled separately before any test bootstrap exists.
"""
import subprocess,pathlib,time,json,re,xml.etree.ElementTree as ET,os,ssl,urllib.request,hashlib
out=pathlib.Path('mobile-evidence');out.mkdir(exist_ok=True)
package='com.abwoo.deepseekalwayson.engineering'
evidence={'sourceCommit':os.environ['GITHUB_SHA'],'nativeAndroidControls':False,'actualHarness':True,'testOnlyCredentialBootstrap':True,'realIdentityProvider':False,'realDeepSeek':False,'realPhone':False,'nativePush':False,'mvpReady':False,'observations':[]}
context=ssl.create_default_context(cafile=os.environ['ALWAYS_ON_NATIVE_TLS_CERT'])
backend=None; log=None
class SnapshotUnavailable(RuntimeError): pass

def snapshot_unavailable(kind):
 evidence['snapshotCollectionRetryCount']=evidence.get('snapshotCollectionRetryCount',0)+1
 warnings=evidence.setdefault('snapshotCollectionWarnings',[])
 if len(warnings)<20:warnings.append(kind)
 print('Native snapshot unavailable: '+kind,flush=True)
 return SnapshotUnavailable('Fresh native hierarchy unavailable: '+kind)

def adb(*args):
 result=subprocess.run(['adb',*map(str,args)],stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=35,check=True)
 if result.stderr:
  evidence['adbDiagnosticCount']=evidence.get('adbDiagnosticCount',0)+1
  observations=evidence.setdefault('adbDiagnosticObservations',[])
  if len(observations)<20:observations.append({'command':str(args[0]) if args else '', 'stderrBytes':len(result.stderr)})
 return result.stdout
def get(path='/engineering/state',post=False):
 req=urllib.request.Request('https://127.0.0.1:8443'+path,method='POST' if post else 'GET')
 with urllib.request.urlopen(req,context=context,timeout=25) as r:return json.load(r)
def wait(check,timeout=35):
 end=time.monotonic()+timeout
 while time.monotonic()<end:
  try:value=check()
  except SnapshotUnavailable:value=False
  if value:return value
  time.sleep(1)
 raise RuntimeError('Native contract observation timed out')
def tree():
 adb('shell','rm','-f','/sdcard/native-contract.xml')
 dumped=adb('shell','uiautomator','dump','/sdcard/native-contract.xml')
 if b'UI hierchary dumped to:' not in dumped:raise snapshot_unavailable('dump_not_confirmed')
 raw=adb('exec-out','cat','/sdcard/native-contract.xml')
 try:root=ET.fromstring(raw)
 except ET.ParseError:raise snapshot_unavailable('malformed_xml') from None
 if root.tag!='hierarchy':raise snapshot_unavailable('wrong_xml_root')
 text=' '.join(n.attrib.get('text','')+' '+n.attrib.get('content-desc','') for n in root.iter('node'))
 if "isn't responding" in text:
  if "Pixel Launcher isn't responding" not in text:raise RuntimeError('Application under test is not responding')
  node=next((n for n in root.iter('node') if n.attrib.get('resource-id')=='android:id/aerr_close'),None)
  if node is not None:tap_node(node);evidence['systemLauncherAnrDismissed']=True;time.sleep(1);return tree()
 return root
def bounds(n):return list(map(int,re.findall(r'-?\d+',n.attrib.get('bounds',''))))
def tap_node(n):
 b=bounds(n)
 if len(b)!=4 or b[2]<=b[0] or b[3]<=b[1]:raise RuntimeError('Native control has no reachable bounds')
 adb('shell','input','tap',(b[0]+b[2])//2,(b[1]+b[3])//2)
def words(r=None):return ' '.join(n.attrib.get('text','')+' '+n.attrib.get('content-desc','') for n in (r if r is not None else tree()).iter('node'))
def capture(name):
 # UIAutomator waits for accessibility idle. Capture pixels afterwards so a newly
 # resumed system chooser cannot leave a screenshot of the previous app frame.
 adb('shell','uiautomator','dump','/sdcard/native-contract.xml')
 (out/('native-contract-'+name+'.xml')).write_bytes(adb('exec-out','cat','/sdcard/native-contract.xml'))
 (out/('native-contract-'+name+'.png')).write_bytes(adb('exec-out','screencap','-p'))
def scroll(up=False):adb('shell','input','swipe',width//2,int(height*(.43 if up else .82)),width//2,int(height*(.82 if up else .43)),300);time.sleep(.4)
def find(label,field=False,scrolling=True):
 for attempt in range(13 if scrolling else 1):
  try:root=tree()
  except SnapshotUnavailable:
   time.sleep(.4);continue
  nodes=[n for n in root.iter('node') if (n.attrib.get('content-desc')==label or n.attrib.get('text')==label) and (not field or n.attrib.get('class')=='android.widget.EditText')]
  nodes.sort(key=lambda n:(n.attrib.get('clickable')!='true',n.attrib.get('content-desc')!=label))
  for n in nodes:
   b=bounds(n)
   if len(b)==4 and b[3]>b[1] and b[2]>b[0] and b[0]>=0 and b[2]<=width and b[1]>0 and b[3]<height:return n
  if scrolling:scroll(up=attempt>=8)
 raise RuntimeError('Native control not reachable: '+label)
def tap(label):
 n=find(label)
 end=time.monotonic()+10
 while n.attrib.get('enabled')=='false' and time.monotonic()<end:
  time.sleep(.5);n=find(label)
 if n.attrib.get('enabled')=='false':raise RuntimeError('Native control remained disabled: '+label)
 tap_node(n);time.sleep(.7)
def fill(label,value,clear=0):
 tap_node(find(label,field=True));time.sleep(.3)
 if clear:
  adb('shell','input','keyevent','123',*(['67']*clear))
  wait(lambda:find(label,field=True,scrolling=False).attrib.get('text','')=='',8)
 # ADB injects key events (not an IME paste). Pace batches and read the actual
 # native field before hiding the keyboard; never silently accept lost text.
 for offset in range(0,len(value),10):
  part=value[offset:offset+10];adb('shell','input','text',part.replace(' ','%s'))
  expected=value[:offset+len(part)]
  wait(lambda:find(label,field=True,scrolling=False).attrib.get('text','')==expected,8)
 adb('shell','input','keyevent','4');time.sleep(.4)
def top():
 for _ in range(4):scroll(up=True)
def tab(label):
 for attempt in range(9):
  try:
   n=find(label,scrolling=False);tap_node(n);time.sleep(1);top();return
  except RuntimeError:
   root=tree();tabs=[n for n in root.iter('node') if n.attrib.get('text') in ['Tasks','Goals','Chat','Memory','Inbox','Activity','Devices','Settings'] and len(bounds(n))==4]
   if not tabs:raise RuntimeError('Native navigation tabs missing')
   y=(bounds(tabs[0])[1]+bounds(tabs[0])[3])//2
   adb('shell','input','swipe',int(width*(.15 if attempt>=4 else .9)),y,int(width*(.9 if attempt>=4 else .15)),y,300)
 raise RuntimeError('Native tab not reachable: '+label)
def note(stage,**data):
 evidence['observations'].append({'stage':stage,**data});print('Native fixture observation: '+stage,flush=True)
def task(title):return next((t for t in get()['tasks'] if t['title']==title),None)
def launch():adb('shell','am','start','-n',package+'/com.abwoo.deepseekalwayson.MainActivity')
try:
 log=open(out/'native-contract-backend.log','w')
 backend=subprocess.Popen(['node','scripts/verify-v03-accounts.mjs','--native-fixture'],stdout=log,stderr=subprocess.STDOUT)
 ready=pathlib.Path(os.environ['ALWAYS_ON_NATIVE_READY_FILE'])
 wait(lambda:ready.exists() or (backend.poll() is not None and (_ for _ in ()).throw(RuntimeError('Real Harness fixture exited before readiness'))),180)
 evidence['authorityId']=json.loads(ready.read_text())['authorityId']
 apk=next(pathlib.Path('apps/mobile/android/app/build/outputs/apk/engineering/release').glob('*.apk'))
 evidence['engineeringApkSha256']=hashlib.sha256(apk.read_bytes()).hexdigest()
 adb('reverse','tcp:8443','tcp:8443');adb('shell','settings','put','system','font_scale','1.0')
 adb('install','-r',apk);launch()
 size=list(map(int,re.findall(r'\d+',adb('shell','wm','size').decode().splitlines()[-1])))
 width,height=size[-2:]
 wait(lambda:'Create a task' in words(),90);wait(lambda:'Connected' in words(),45)
 evidence['secureStoreRestoreAndVerifiedTls']=True
 capture('connected');note('Verified TLS and actual native secure storage')
 # The task must be admitted through the actual native form, never the observer API.
 fill('Task name','Native offline proof');fill('What should your agent do?','Deterministic adapter only. Report completion without research.');fill('Interval in minutes','1',clear=8)
 tap('Create task');created=wait(lambda:task('Native offline proof'));tid=created['id'];evidence['taskId']=tid
 assert created['instruction']=='Deterministic adapter only. Report completion without research.','Native task input differed from persisted text'
 note('Native task form and persisted values match',taskId=tid)
 tap('Pause');wait(lambda:task('Native offline proof')['state']=='paused')
 tap('Resume');wait(lambda:task('Native offline proof')['state']=='active')
 capture('task-persisted')
 adb('shell','am','force-stop',package)
 # No native app process exists while the genuine Harness Schedule/Agent runs.
 if subprocess.run(['adb','shell','pidof',package],capture_output=True).returncode==0:raise RuntimeError('Native app process remained running')
 run=wait(lambda:next((r for r in get()['runs'] if r['taskId']==tid and r['status']=='completed' and r.get('result')),None),105)
 evidence['offlineRunId']=run['id'];evidence['offlineNativeScheduleCompleted']=True;note('Real Harness completed the task while native app process was absent',runId=run['id'])
 launch();wait(lambda:'Create a task' in words(),50);tap('Refresh');find('Native offline proof');find('completed');evidence['sameTaskAfterNativeProcessRestart']=task('Native offline proof')['id']==tid
 # Pause repeating task before subsequent forms, preserving only the completed run.
 tap('Pause');wait(lambda:task('Native offline proof')['state']=='paused')
 tab('Memory');fill('Information to remember','Native consent proof')
 n=find('Save with my consent');assert n.attrib.get('enabled')=='false','Memory saved without consent'
 tap('I allow this information to be used across sessions.');tap('Save with my consent')
 mem=wait(lambda:next((m for m in get()['memories'] if m['content']=='Native consent proof'),None));evidence['memoryId']=mem['id']
 tap('Edit');fill('Information to remember','Native edited proof',clear=40);tap('I allow this information to be used across sessions.');tap('Save with my consent')
 wait(lambda:next((m for m in get()['memories'] if m['id']==mem['id'] and m['content']=='Native edited proof'),None));tap('Delete');wait(lambda:not any(m['id']==mem['id'] for m in get()['memories']))
 evidence['nativeMemoryConsentEditDelete']=True;note('Native memory consent, edit and deletion read back')
 tab('Goals');fill('Goal name','Native goal proof');fill('What should the agent monitor?','Deterministic bounded goal');fill('Check every N minutes','1440',clear=8);tap('Authorize bounded goal')
 goal=wait(lambda:next((g for g in get()['goals'] if g['title']=='Native goal proof'),None));evidence['goalId']=goal['id'];assert goal['instruction']=='Deterministic bounded goal'
 tap('Pause goal');wait(lambda:next(g for g in get()['goals'] if g['id']==goal['id'])['state']=='paused');tap('Resume goal');wait(lambda:next(g for g in get()['goals'] if g['id']==goal['id'])['state']=='active');evidence['nativeGoalControls']=True;note('Native goal create, pause and resume read back')
 tab('Inbox');tap('Mark read');wait(lambda:any(n['runId']==run['id'] and n['read'] for n in get()['inbox']));tap('Open task result');find('Selected task execution · completed');find(run['id']);evidence['nativeInboxRunNavigation']=True
 tab('Chat');tap('New conversation');fill('Message your agent','Native model fixture hello');tap('Send');find('Fixture check complete.');top();find('Native model fixture hello');find('Fixture check complete.');top()
 ids=[n.attrib.get('text','') for n in tree().iter('node') if re.fullmatch(r'session-[0-9a-f-]{36}',n.attrib.get('text',''))]
 assert ids,'Native selected Session ID missing';sid=ids[-1]
 conversation=get('/engineering/conversation?id='+sid)
 assert conversation['sessionId']==sid and 'Native model fixture hello' in json.dumps(conversation) and 'Fixture check complete.' in json.dumps(conversation)
 assert any(r.get('event',{}).get('type')=='user/message' and r['event'].get('data',{}).get('source',{}).get('kind')=='runtime-context' for r in conversation['events']['records']),'Native runtime history was unexpectedly removed'
 assert any(r.get('event',{}).get('type')=='user/message' and r['event'].get('data',{}).get('source',{}).get('form')=='catalog' for r in conversation['events']['records']),'Native catalog was unexpectedly removed from authoritative history'
 assert '<system-reminder>' not in words(),'Internal native runtime snapshot leaked into normal chat'
 evidence['nativeModelContextHidden']=True
 capture('chat');evidence['nativeRuntimeContextHidden']=True
 evidence['chatSessionId']=sid;evidence['nativeSharedSessionChat']=True;note('Native chat and independent reader share Session and actual fixture result',sessionId=sid)
 tab('Devices');find('Native engineering device');tap('Check notification delivery');wait(lambda:'Push service not configured' in words());evidence['nativeDeviceReadAndHonestPushStatus']=True
 # Actual FileSystem and Android Sharing modules, not browser adapters. No OS
 # receipt is promoted to external delivery: assert the chooser and cancel it.
 tab('Settings');tap('Export personal agent records')
 wait(lambda:re.search(r'(?:mResumedActivity|topResumedActivity).*?(?:ChooserActivity|ResolverActivity)',adb('shell','dumpsys','activity','activities').decode()),30)
 # A resumed Activity alone is not a rendered file-share interface.
 wait(lambda:any(n.attrib.get('package')=='com.android.intentresolver' and n.attrib.get('text')=='personal-agent-records.jsonl' for n in tree().iter('node')),30)
 evidence['nativeExportFilenameVisible']=True
 metrics=get('/engineering/metrics')
 assert metrics.get('POST /personal-agent/v1/exports',0)>0 and metrics.get('POST /personal-agent/v1/exports/release',0)>0,'Native export did not capture and finish the paged stream'
 evidence['nativeExportPagesReleased']=True
 capture('native-file-share');adb('shell','input','keyevent','4');evidence['nativeFileExportChooser']=True;note('Actual native file export opened the system share chooser')
 get('/engineering/offline?enabled=1',post=True);tap('Refresh');wait(lambda:'Offline' in words(),30);evidence['injectedTransportLossVisible']=True
 get('/engineering/offline?enabled=0',post=True);tap('Refresh');wait(lambda:'Connected' in words(),30)
 assert task('Native offline proof')['id']==tid;evidence['nativeReconnectRetainsId']=True
 capture('complete');evidence['nativeAndroidControls']=True;note('Native contract completed; production and physical gates remain blocked')
finally:
 try:capture('final')
 except Exception:pass
 # Artifact logs never include bootstrap credentials or owner tokens. The backend
 # deliberately withholds native owner logs; do not collect unrestricted logcat.
 if backend is not None:
  backend.terminate()
  try:backend.wait(timeout=20)
  except subprocess.TimeoutExpired:backend.kill();backend.wait()
 if log is not None:log.close()
 (out/'native-contract.json').write_text(json.dumps(evidence,indent=2))
