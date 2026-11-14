"""Actual native emulator startup check; never a real-phone or backend/model acceptance substitute."""
import subprocess, pathlib, time, json, re, xml.etree.ElementTree as ET
out=pathlib.Path('mobile-evidence');out.mkdir(exist_ok=True)
def adb(*args):return subprocess.check_output(['adb',*args],timeout=30)
evidence={'nativeEmulatorLaunch':False,'pairingScreenVisible':False,'realPhone':False,'realDeepSeek':False,'realNativePush':False,'mvpReady':False}
try:
 apk=next(pathlib.Path('.artifacts/native-mobile').rglob('*.apk'))
 adb('install','-r',str(apk));adb('shell','am','start','-n','com.abwoo.deepseekalwayson/.MainActivity')
 deadline=time.monotonic()+60
 while time.monotonic()<deadline:
  time.sleep(2)
  try:
   adb('shell','uiautomator','dump','/sdcard/always-on-ui.xml');xml=adb('exec-out','cat','/sdcard/always-on-ui.xml');root=ET.fromstring(xml)
   text=' '.join(n.attrib.get('text','')+' '+n.attrib.get('content-desc','') for n in root.iter('node'))
   # Only the disposable OS launcher ANR is dismissible. An ANR of the app under test still fails.
   if "Pixel Launcher isn't responding" in text:
    close=next((n for n in root.iter('node') if n.attrib.get('resource-id')=='android:id/aerr_close'),None)
    if close is not None:
     bounds=list(map(int,re.findall(r'\d+',close.attrib['bounds'])))
     adb('shell','input','tap',str((bounds[0]+bounds[2])//2),str((bounds[1]+bounds[3])//2));evidence['systemLauncherAnrDismissed']=True;continue
   if 'Your Personal Agent' in text and 'Pair this device' in text:
    if 'has failed' in text.lower() or 'entitlement' in text.lower():raise RuntimeError('Native secure-storage startup failed')
    if not any(n.attrib.get('resource-id','').endswith('secure-storage-ready') for n in root.iter('node')):raise RuntimeError('Native secure-storage round trip did not confirm readiness')
    (out/'android-pairing.xml').write_bytes(xml);evidence.update(nativeEmulatorLaunch=True,pairingScreenVisible=True,secureStorageStartupPassed=True);break
  except (subprocess.CalledProcessError,ET.ParseError):pass
 if not evidence['pairingScreenVisible']:raise RuntimeError('Native pairing UI did not become visible; no success was synthesized')
 # Kill and relaunch to catch a startup/storage crash, without issuing a fake pairing credential.
 adb('shell','am','force-stop','com.abwoo.deepseekalwayson');adb('shell','am','start','-n','com.abwoo.deepseekalwayson/.MainActivity');time.sleep(3)
 adb('shell','uiautomator','dump','/sdcard/always-on-ui.xml');xml=adb('exec-out','cat','/sdcard/always-on-ui.xml')
 if b'Your Personal Agent' not in xml:raise RuntimeError('Native app did not restore the unpaired screen after process restart')
 evidence['processRestart']=True
finally:
 try:(out/'android-pairing.png').write_bytes(adb('exec-out','screencap','-p'))
 except Exception:pass
 (out/'android-emulator.json').write_text(json.dumps(evidence,indent=2))
