# v0.3 engineering stabilization — work in progress

2026-11-15. Engineering Preview; **MVP Ready: false**. [PR #4](https://github.com/abwoo/-DeepSeek-Always-on-Personal-AI-Agent-Plugin/pull/4), based on main `7f18534bda7506162e0377321150c560c21244b9`. Initial implementation `0768ad0f66de8601999f2d32f9d76e43edf44877`; extended product/runtime/contract implementation `b4b63e6aa32ce4db23f81fc59314b3a8d4c3b4fa`; authentication assertion/redacted probe follow-up `67ac405a36290ea5c4f1eae8cea617dddf15400c`. Final CI and evidence archive are being completed before merge.

## Implemented in this pass

- Private, device-bound, five-minute record export snapshots; 128 KiB/100-row pages, 64 MiB per snapshot, four concurrent snapshots and separate capture rate limits. UTF-8 byte limits and validated complete JSONL prevent a partial download being presented as complete. Export/read-state cursors cannot be mixed, guessed or transferred between devices. Restart removes disposable copies; existing records/IDs remain.
- Native phone export writes an app-private temporary file and uses Expo Sharing. Desktop exposes a genuine download through its native plugin panel. No entire history is put into a phone share-sheet message. Credentials and native transcripts are outside record export scope; historical/provider/backups/external export copies are not retroactively erased.
- Large managed snapshots transparently use bounded pages. The legacy full export refuses oversized datasets before allocation. Recent Run/Inbox projections query bounded rows; full Run Ledger is retained. Goal checkpoints use task-scoped indexed queries. Controller reads upstream responses with a byte-counting stream and cancels oversized bodies before unbounded allocation.
- Phone account/Session selection guards reject late responses after account changes, clear drafts/consent/live text/cursors, preserve a replacement login against stale credential cleanup, coalesce refresh requests and clear partially written encrypted cache generations on logout. Device navigation no longer skips its read while another action finishes. Native task timing validation, input bounds, cancellation, readback and readable errors improved.
- Deleted version-zero/legacy memory cannot be resurrected by a stale consent form. Search uses bounded Unicode word segmentation, including Chinese and full-width terms, without a domain dictionary. Native proposals still require explicit user confirmation.
- Native Schedule failures are checked as domain receipts. Unconfirmed task transitions are recorded as errors; a submitted input/report is never promoted to model/business success. No second Agent loop, framework or private signed-Desktop patch was added.
- Checkpoint tools reject absent volumes, unrelated running writers and mismatched deployed SHAs before mutation. They resume only previously running services with no dependency auto-start. Seven-volume restore fixtures also exercise actual plugin SQLite migrations and retained identities.
- Managed images address runtime tarballs by content hash, verify integrity, and install core/gateway together through the public Harness CLI. Real Docker verification upgrades from immutable previous main to the new image on the same native agent volumes, then restores the matching encrypted old checkpoint and old image. Five other stack volumes are disposable fixtures; this is not a live Auth0/control service or a production restore rehearsal.

## Code and protocol changes

| Area | Main changed paths | Compatibility / state |
|---|---|---|
| Bounded exports/sync | `src/managed/exports.ts`, `src/managed/index.ts`, `src/shared/{managed-client,export-contract}.ts`, `src/control/{server,http}.ts` | Additive device API; legacy small reads retained, oversized reads give explicit pagination errors. Temporary capture files are not authoritative records. |
| Native clients | `apps/mobile/{hooks,credentials,cache,export,forms,ui,locales}.ts*`, `apps/mobile/screens/*`, `src/desktop/{device,client}.*`, `src/client/panel.js` | Existing credentials/IDs preserved; stale callbacks are refused, unresolved outcomes are never replayed. |
| Core state | `src/host/{tasks,memory,storage}.ts` | Existing records/schema/IDs retained; version-zero stale edits rejected, native receipts checked, indexed recent reads bounded. |
| Runtime/checkpoint | `deploy/managed/{Dockerfile,bundles,supervisor}.*`, `scripts/{control-backup,verify-control-backup,verify-managed-container}.mjs` | Image-owned content-addressed bundles; all components updated together, whole-checkpoint rollback. |
| Contract tests | `scripts/verify-mobile-contract.mjs`, `tests/fixtures/mobile-ui/*`, `tests/unit/*`, `scripts/verify-v03-accounts.mjs` | Actual screens/hooks and Harness APIs; browser OS/rendering adapters clearly labeled. |
| Native QA | `scripts/{prepare-native-engineering,serve-native-fixture}.mjs`, `scripts/mobile-android-contract.py`, `tests/fixtures/native-mobile/entry.tsx`, native mobile workflow | Separate engineering APK; real native UI/OS with loopback-only test bootstrap, temporary scoped test TLS trust, no production login claim. |

## Evidence boundaries

The actual mobile React screens/hooks run against two actual Harness processes through the real account controller. Browser host adapters replace only OS services/rendering: these checks are NOT native keyboard/layout/OS storage, real OAuth, physical devices or native push acceptance. Verified paths include task/goal pause/resume/native deterministic run, explicit proposal consent, memory editing/deletion, shared chat, cancellation, Inbox read state, Run navigation, device revocation, paged export, transport fault/recovery, interrupted-cache cleanup, fixture sign-in and cross-account draft clearing.

The deterministic model fixture is explicitly labeled and uses Harness's native Agent/tool/Session loop. It is not DeepSeek output. Native production APK/Simulator builds and official signed macOS/Windows GUI tests remain separate workflows. The new Desktop download assertion checks actual exported file contents and shared IDs. Authenticated native emulator interaction coverage is being extended; no full native-form Pass is claimed from the browser adapter.

Native Android QA compiles the ordinary preview APK **before** introducing any test entry/trust. The temporary engineering flavor has a separate application ID (`com.abwoo.deepseekalwayson.engineering`); its public test CA is restricted to loopback and its private key stays in the same CI runner outside the workspace/artifacts. The backend runs the pinned real Harness/controller with explicitly local identity/model adapters. The engineering APK is unusable without that disposable backend and must never be distributed as the user product. No TLS verification bypass, production key, owner token or alternate Agent loop is introduced.

Initial native build failure at `0768ad0` exposed a duplicate translation key, fixed before the extended implementation. Initial extended core/account CI exposed assertions matching old authentication error wording; they now check the actual HTTP 401 and error code, retaining stronger assertions. These failures are not deleted or replaced by skipped tests. A fixture callback adapter was corrected to recognize the actual 303 native redirect rather than assuming 302. Test-host screenshots do not substitute for native screenshots.

An iOS smoke failure at `b4b63e6` was a 120-second `simctl launch` command timeout. Its retained failure screenshot already shows the actual account UI. The follow-up requires an independently running UIKit application PID and actual screenshot OCR after the command; command timeout itself is not accepted as success, and the app is not relaunched to hide a crash. Final rerun status is recorded below when available. Windows native visual-capture timeout warnings are retained; action/API persistence assertions passed, which does not certify the missing compositor captures.

Local dependency audits currently report zero advisories for the complete root and complete mobile dependency graphs. This does not remediate the older libraries inside the signed vendor Desktop, certify a penetration test, or pass live security gates.

## Verification ledger — final native checks pending

- Local `npm run check`: 71 passed, 0 failed/skipped, including full TypeScript/build. Mobile TypeScript and actual Hermes exports for iOS/Android passed. No ESLint script exists.
- Product source `b4b63e6`: macOS native GUI/panel/download [43704865921](https://github.com/abwoo/-DeepSeek-Always-on-Personal-AI-Agent-Plugin/actions/runs/43704865921), Windows [43704865915](https://github.com/abwoo/-DeepSeek-Always-on-Personal-AI-Agent-Plugin/actions/runs/43704865915), container upgrade/checkpoint rollback [43704865916](https://github.com/abwoo/-DeepSeek-Always-on-Personal-AI-Agent-Plugin/actions/runs/43704865916) passed.
- Assertion/probe follow-up `67ac405`: core [43705146437](https://github.com/abwoo/-DeepSeek-Always-on-Personal-AI-Agent-Plugin/actions/runs/43705146437) and account/backup/proxy/component contract [43705146491](https://github.com/abwoo/-DeepSeek-Always-on-Personal-AI-Agent-Plugin/actions/runs/43705146491) passed. These are PR checks; the raw account observations record tested merge checkout `73982e59d738c539c9eb72e06dadff5949f9df8c`, with head `67ac405`, not an invented head SHA.
- Test-only native harness bootstrap `d86bd88`: verified loopback TLS `/engineering/ready` and actual-authority `/engineering/state` locally; normal two-Harness/core CI passed. This is not a native UI result.
- Native QA isolation regression test passed locally: scoped loopback-only public CA, explicit `includeSubdomains="false"`, distinct application ID, unchanged product manifest and no copied private key. Full-suite count was 71 before this additional test; final CI verifies all 72.
- Latest native interaction runner is `2597bacf9ca2e1de3f7532a5266f64786abb53fe`; native workflow and its final observations are still pending. No pending assertion is recorded as Pass.
- `verify-v03-release.mjs --require-ready` still exits 1 intentionally: T01–T22 and actual service configuration lack production evidence.

The first engineering Android build was stopped by native lint because the scoped domain lacked explicit `includeSubdomains`. The follow-up sets it to `false`, retains lint and adds a regression test; it does not disable the release check. Independent observer credentials now read back native UI writes. The ordinary preview artifact is saved before the engineering build, and its separate onboarding smoke is allowed to run even if that extra QA build fails.

Raw small observations, artifact ZIP/file hashes and exact provenance are checkpointed in [evidence manifest](evidence/v03-engineering/manifest.json). That manifest explicitly remains in progress until the final native checks finish. A fresh [T01–T22 matrix](evidence/v03-engineering/production-blockers.json) retains every production gate as Blocked, with source/environment/reason. Historical evidence is not overwritten.

## Remaining before this pass can merge

Record final head checks, native build/probe observations, container upgrade/rollback and any further native-interaction evidence; archive small raw observations with source/run/artifact hashes; finish operator migration/retention guidance and the acceptance report. Existing production matrix T01–T22 remains **Blocked**. No v0.3 release tag, npm publication, signed iPhone build or hosted product has been delivered.

## External production prerequisites

Actual authorized compute/budget, public domain/HTTPS, Auth0 tenant/application/two accounts, funded server-side DeepSeek key and verified model, Expo/APNs/FCM, Apple team/provisioning/TestFlight, stable Android distribution signature, npm publication rights and physical-device observations are still missing. Ordinary users are not asked to configure these operator concerns. Schema/fixture/native-build success cannot certify Level 5 or MVP Ready.
