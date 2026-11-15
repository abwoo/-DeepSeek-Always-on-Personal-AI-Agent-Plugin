"""Run the actual native binary on a fresh Simulator runner; no Apple distribution credential or physical-device claim."""
import subprocess, json, pathlib, plistlib, time, os, tempfile
out=pathlib.Path('mobile-evidence');out.mkdir(exist_ok=True)
app=next(pathlib.Path('ios-native-build').rglob('*.app'))
bundle=plistlib.loads((app/'Info.plist').read_bytes())['CFBundleIdentifier']
evidence={'sourceCommit':os.environ['GITHUB_SHA'],'nativeSimulatorAppBuilt':True,'simulatorLaunch':False,'secureStorageStartupPassed':False,'installableOnPhysicalIPhone':False,'appleSigningCredentialsPresent':False,'realPhone':False,'realDeepSeek':False,'mvpReady':False}
udid=None
def run(args,timeout=120):
 # Simulator services can inherit stdout after the command exits. A pipe-based
 # communicate() then waits for unrelated background writers instead of command
 # completion. Capture to a regular private file while still checking exit/timeout.
 with tempfile.TemporaryFile(mode='w+') as capture:
  subprocess.run(args,stdout=capture,stderr=subprocess.STDOUT,timeout=timeout,check=True,text=True)
  capture.seek(0);return capture.read()
try:
 print('Inspecting the Xcode-signed Simulator binary and its linked simulated entitlements',flush=True)
 executable=app/plistlib.loads((app/'Info.plist').read_bytes())['CFBundleExecutable']
 (out/'code-signature.txt').write_text(run(['codesign','--display','--entitlements','-','--xml',str(app)]))
 (out/'simulated-entitlements.txt').write_text(run(['otool','-s','__TEXT','__entitlements',str(executable)]))
 run(['codesign','--verify','--deep','--strict',str(app)])
 devices=json.loads(run(['xcrun','simctl','list','devices','available','-j']))['devices']
 candidates=[(runtime,d) for runtime,items in devices.items() for d in items if 'iPhone' in d['name']]
 candidates.sort(key=lambda item:item[1]['state']!='Booted')
 runtime,device=candidates[0];udid=device['udid'];evidence.update(simulatorRuntime=runtime,simulatorDevice=device['name'],simulatorSigning='Xcode Simulator ad-hoc signature and linked simulated entitlements; no physical-device provisioning profile')
 print('Booting '+device['name']+' on '+runtime,flush=True)
 if device['state']!='Booted':run(['xcrun','simctl','boot',udid])
 run(['xcrun','simctl','bootstatus',udid,'-b'],timeout=600)
 print('Installing actual compiled application',flush=True)
 run(['xcrun','simctl','install',udid,str(app)])
 # simctl may retain its launch pipe even after SpringBoard has presented the app.
 # A timeout alone is neither app success nor app failure: verify the independent
 # launchd PID AND the actual screenshot below. Do not retry/relaunch a crashed app.
 try:
  run(['xcrun','simctl','launch',udid,bundle],timeout=120)
  evidence['launchCommandReturned']=True
 except subprocess.TimeoutExpired:
  evidence['launchCommandReturned']=False
  evidence['launchCommandTimedOut']=True
 # Independently inspect the host process executable in THIS Simulator device's
 # installed application directory, not a process name or a second simctl RPC.
 processes=run(['ps','-axo','pid=,comm='],timeout=30)
 suffix='/'+app.name+'/'+executable.name
 matches=[line.strip().split(None,1) for line in processes.splitlines() if '/'+udid+'/' in line and line.rstrip().endswith(suffix)]
 if not any(len(parts)==2 and parts[0].isdigit() and int(parts[0])>0 for parts in matches):raise RuntimeError('No running installed native application PID in the selected Simulator device')
 evidence['nativeHostProcessPidConfirmed']=True
 evidence['simulatorLaunch']=True
 time.sleep(5)
 run(['xcrun','simctl','io',udid,'screenshot',str(out/'ios-pairing.png')])
 print(run(['swift','scripts/check-ios-screen.swift',str(out/'ios-pairing.png')],timeout=180),flush=True)
 evidence['secureStorageStartupPassed']=True
 run(['tar','-czf',str(out/'ios-simulator-preview.app.tar.gz'),'-C',str(app.parent),app.name])
except Exception as error:
 evidence['failure']=str(error)
 if udid:
  try:(out/'simulator-failure.log').write_text(run(['xcrun','simctl','spawn',udid,'log','show','--style','compact','--last','3m','--predicate',f'eventMessage CONTAINS "{bundle}" OR process == "amfid"'],timeout=45)[-50000:])
  except Exception:pass
  try:run(['xcrun','simctl','io',udid,'screenshot',str(out/'ios-failure.png')])
  except Exception:pass
 raise
finally:
 (out/'ios.json').write_text(json.dumps(evidence,indent=2))
