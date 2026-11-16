# v0.3 native repair continuation

Engineering Preview. Production T01–T22 remain blocked. This report does not certify hosted identity, real DeepSeek, physical-phone push, signing or distribution.

## Shared chat repair

Native Android run [43754213125](https://github.com/abwoo/-DeepSeek-Always-on-Personal-AI-Agent-Plugin/actions/runs/43754213125) failed because the actual skill-catalog producer appeared as a Task/context message containing system-reminder instructions. Filtering only runtime-context did not cover this producer.

Shared Desktop/mobile conversation projection now uses native source semantics: model instructions, catalogs and snapshots stay in authoritative history while ordinary chat omits them; notices show their producer summary. Exact user quotations, model replies and undeclared context are preserved. Actual two-Harness account testing also checks the shared projection against genuine native catalog events.

At source `170524194f326a87c5909efd0da51a757b1168d0`, core validation passed 76 tests with zero failures/skips, plus three browser contracts. Android [native job 133027403311](https://github.com/abwoo/-DeepSeek-Always-on-Personal-AI-Agent-Plugin/actions/runs/43783993339/job/133027403311) passed real RN controls, TLS/secure storage, Task pause/resume, execution with the App absent, persisted IDs, Memory/Goal operations, shared Session chat without internal runtime text, actual native file-share chooser and reconnect. Identity/model are fixtures. Exact raw records and their hashes are indexed under `native-context-repair` in the engineering manifest; the ZIP digests are upload-reported, not independently downloaded here.

## Carrier-neutral core repair

The core declared webServer as required although its two Fetch routes use the carrier-neutral Connection registry. A real Cordis/SQLite lifecycle fixture reproduced pending phase 0 without webServer, active phase 2 with it, and missing routes after its removal. The unused dependency is removed at `6ce7fcc695a0b08f511e24e91a29fd61e39c56e9`. Regression verifies native route readiness, API reads, consented memory, independence from HTTP service lifetime and cleanup.

This is a verified independent coupling defect. It is **not yet the established cause of Issue #5**: the original native macOS 404 recurred while webServer and every other declared dependency were available.

## macOS restart investigation

The original four-restart assertions remain, with bounded reproduction expanded to twelve passes. Only the separately installed private CI probe reads Loader phases, service availability and filtered error metadata. It never ships in the Desktop bundle.

- Source 1705241: run [43783993352](https://github.com/abwoo/-DeepSeek-Always-on-Personal-AI-Agent-Plugin/actions/runs/43783993352) confirmed three restarts then failed at boot 5 with core 404 and Desktop status 200. Host stderr did not reach Electron stdout, so content-free stderr tracing was removed.
- Source 262c7bf: run [43784637728](https://github.com/abwoo/-DeepSeek-Always-on-Personal-AI-Agent-Plugin/actions/runs/43784637728) passed all four restarts; this did not establish a repair.
- Source ef38ada: run [43785326882](https://github.com/abwoo/-DeepSeek-Always-on-Personal-AI-Agent-Plugin/actions/runs/43785326882) reached boot 7 then failed. All dependencies remained available, but the core Loader fiber was failed (phase 3), while both other plugins were active. Issue #5 remains open.

Retained exact failure log observation:

```text
2026-11-16T01:23:23.0813700Z NATIVE_BOOT_FAILURE {"attempt":7,"pages":[{"origin":"dsh-app://app","pathname":"/","routes":{"/api/always-on":404,"/api/always-on-desktop/status":200},"startup":{"loaderAvailable":true,"services":{"schedule":true,"agents":true,"sessions":true,"tools":true,"systemPrompt":true,"connection":true,"webServer":true,"alwaysOn":false},"entries":[{"module":"@abwoo/deepseek-always-on","enabled":true,"phase":3,"failure":{"categories":[]}},{"module":"@abwoo/always-on-desktop-remote-probe","enabled":true,"phase":2},{"module":"@abwoo/deepseek-always-on-desktop","enabled":true,"phase":2}]}}]}
```

## Captured startup root cause and repair

The two-profile reproduction at source `9ca098572b19633ff76c1cfabae5c16891f8a8e4`, [run 43789067273, job 133043130973](https://github.com/abwoo/-DeepSeek-Always-on-Personal-AI-Agent-Plugin/actions/runs/43789067273/job/133043130973), captured the actual error at boot 10:

> This Host cannot create Sessions; choose an existing Session target.

Trigger: create a delayed native task, exit before its first delivery, then relaunch. Its `new_once` target has a reserved Session ID but no persisted Session yet. Always-on resumes the native Schedule it paused for plugin unload. Native Schedule revalidates Session-creation capability during that resume. Schedule itself was ready before `sessionController`; this rejection escaped core startup, failed its Cordis fiber and removed both APIs.

At `db00da084ae70c08dd7a8c53aac9476b63f3cd39`, core explicitly requires the native SessionController before recovery. It preserves the existing Task/Schedule/reserved Session IDs and uses the existing native edit operation. It does not recreate tasks or add an Agent runtime. A real Cordis/SQLite regression reproduces the exact old refusal with the old dependency metadata, then verifies the fixed startup waits, resumes once and survives Controller removal/restoration without changing IDs. Peer services in this regression are labeled fixtures; actual signed macOS validation remains separate.

An additional readiness barrier publishes the Always-on service only after native recovery, routes and hooks are ready. The earlier carrier-neutral HTTP dependency repair remains a separate correction.

Raw redacted failure and source locations are retained as `native-startup-diagnosis/failed-9ca0985.json` in the engineering manifest. Exception type was outside the probe's narrow name allowlist, so its recorded type is `unknown`; its actual captured message and source locations established the cause.

## Native observation collector repair

Sources ef38ada and 42bc886 failed before task forms because UIAutomator hierarchy bytes could not be parsed as XML. Their native-controls flags remain false and both raw records are retained. The collector now removes an old dump, requires confirmation of a fresh hierarchy, validates its root and retries only unavailable observations within the existing wait deadline. Invalid UI never becomes a pass; actual application assertions still propagate. A deterministic clock regression verifies these boundaries. Repaired-source native interaction validation is in progress.

## Remaining release work

Latest repaired-source native checks are in progress. Issue #5 will remain open until the targeted regression and independent signed macOS restart runs verify the repair. No MVP Ready declaration, release tag, npm publication, cloud deployment, Apple provisioning or physical push is claimed. See [operator handoff](V03_HANDOFF.md) for the real service, identity/provider credentials, signing, devices and production acceptance still required.
