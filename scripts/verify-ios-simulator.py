"""Run the actual native binary on a fresh Simulator runner; no Apple distribution credential or physical-device claim."""
import subprocess, json, pathlib, plistlib, time, os
out=pathlib.Path('mobile-evidence');out.mkdir(exist_ok=True)
app=next(pathlib.Path('ios-native-build').rglob('*.app'))
bundle=plistlib.loads((app/'Info.plist').read_bytes())['CFBundleIdentifier']
evidence={'sourceCommit':os.environ['GITHUB_SHA'],'nativeSimulatorAppBuilt':True,'simulatorLaunch':False,'secureStorageStartupPassed':False,'installableOnPhysicalIPhone':False,'appleSigningCredentialsPresent':False,'realPhone':False,'realDeepSeek':False,'mvpReady':False}
udid=None
def run(args,timeout=120):return subprocess.check_output(args,stderr=subprocess.STDOUT,timeout=timeout,text=True)
try:
 print('Signing local Simulator Keychain entitlement',flush=True)
 entitlements={'application-identifier':'SIMULATOR0.'+bundle,'keychain-access-groups':['SIMULATOR0.'+bundle],'get-task-allow':True}
 ent=out/'simulator.entitlements.plist';ent.write_bytes(plistlib.dumps(entitlements))
 run(['codesign','--force','--sign','-','--entitlements',str(ent),'--generate-entitlement-der',str(app)])
 (out/'code-signature.txt').write_text(run(['codesign','--display','--entitlements','-','--xml',str(app)]))
 devices=json.loads(run(['xcrun','simctl','list','devices','available','-j']))['devices']
 candidates=[(runtime,d) for runtime,items in devices.items() for d in items if 'iPhone' in d['name']]
 candidates.sort(key=lambda item:item[1]['state']!='Booted')
 runtime,device=candidates[0];udid=device['udid'];evidence.update(simulatorRuntime=runtime,simulatorDevice=device['name'],simulatorSigning='local ad-hoc; not a physical-device provisioning profile')
 print('Booting '+device['name']+' on '+runtime,flush=True)
 if device['state']!='Booted':run(['xcrun','simctl','boot',udid])
 run(['xcrun','simctl','bootstatus',udid,'-b'],timeout=600)
 print('Installing actual compiled application',flush=True)
 run(['xcrun','simctl','install',udid,str(app)])
 run(['xcrun','simctl','launch',udid,bundle],timeout=120)
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
