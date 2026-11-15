# v0.3 implementation and release acceptance

Latest follow-up (2026-11-15): [bounded export, native-client reconciliation and managed image recovery](V03_ENGINEERING.md) (PR #4, final verification in progress), after [execution policy/proxy stabilization](V03_STABILIZATION.md) and [credential/provisioning/memory reliability](V03_RELIABILITY.md). Historical evidence snapshots below remain reproducible. All production gates remain Blocked.

Updated 2026-11-14. **Engineering candidate; MVP Ready: false.** No production account service, real DeepSeek execution, physical-phone notification, iPhone signing, TestFlight or npm publication is claimed. The default service origin is deliberately `null`; installing a development artifact alone does not provide a working hosted agent.

Baseline main: `f83c996353a52724e9a522d3f583fb9f9ed0cd8a`. Work branch: `v0.3/zero-configuration-mvp`. [PR #1](https://github.com/abwoo/-DeepSeek-Always-on-Personal-AI-Agent-Plugin/pull/1). [Audit](V03_AUDIT.md). Original engineering implementation: **`95793a60d3475be5b36a425562cb4065daba19f1`**. Its original evidence/documentation commits preserve that implementation; subsequent product changes are recorded in the follow-up above. Exact run/artifact provenance: [manifest](evidence/v03/manifest.json).

## Evidence rules and baseline

Level 1 means fixtures/unit tests, including locally signed OIDC messages. Level 2 means actual Harness processes/APIs, with deterministic model behavior explicitly identified. Level 3 means actual official Desktop or a compiled native app; Simulator/emulator observations remain distinct from physical phones. Level 4 requires actual DeepSeek output, and Level 5 requires the hosted account, real native clients/model and physical push chain. No Level 4/5 result was obtained in this iteration.

The baseline audit covered root/package manifests, all requested source/package/app/deployment paths, V02 reports, releases, artifacts and signed Desktop behavior. Original core schema 1, Tasks/Goals/Memory/Inbox/Run IDs, native Schedule and Agent loop remain. Baseline checks: 31 passed. Final local `npm run check`: **41 passed, 0 failed, 0 skipped**; Desktop build and mobile typecheck also passed. There is no configured ESLint script; TypeScript/build/tests are checked, not a fictitious lint result.

`scripts/verify-v03-release.mjs --require-ready` deliberately fails while production gates are blocked. An expected gate failure verifies honesty; it is not a production Pass. The script never certifies MVP Ready by itself.

## Phase A — native plugin distribution

**Files:** `packages/desktop/{package.json,bundle.yml,locale/*,icon.svg,README.md,LICENSE}`, `scripts/{build-desktop,probe-native-desktop}.mjs`, native Desktop workflows. Exact Harness `0.2.2-rc.3`, Cordis `4.1.0`; exports, peers and bilingual metadata corrected. Official manager resolves `locale/en.json` and `locale/zh.json`; region aliases alone hid the real package title and were fixed. Title: **DeepSeek Always-on Personal Agent**; sidebar: **Personal Agent**.

**Tests/build:** actual official signed arm64 macOS and Windows apps in Actions, real Plugins UI install/enable/disable/restart/uninstall/reinstall, six process launches, independent persistence checks. This package uses a disposable local HTTP tarball address in the actual GUI. Other support bundles use CLI, separately. Windows compositor screenshots timed out during the otherwise successful action/API checks; the warnings are retained and no visual-pass claim or replacement image is made. A stale translated test locator was corrected without removing lifecycle assertions. Node bundled fetch intermittently threw macOS `setTypeOfService EINVAL`; the probe now imports pinned patched `undici@8.12.2`, without changing the signed application.

**Remaining:** publicly published supported npm/Git target, actual version-to-version GUI upgrade and vendor risk review. Reinstall is not every upgrade path. `private: true` stays until authorized, usable publication. No official endorsement is implied. Evidence: manifest native Desktop runs, Level 3, source SHA above.

## Phase B — unified login

**Files:** `src/control/{identity,store,server,main}.ts`, `src/shared/account-client.ts`, `src/desktop/account.ts`, `packages/client/account.*`, mobile onboarding/hooks. Selected one operator-managed **Auth0 regular web application**: hosted recovery, OIDC code+S256 PKCE and rotating refresh tokens avoid password management and invented DeepSeek OAuth.

`openid-client@6.9.0` checks state/nonce/signature/issuer/audience. Server refresh/upstream secrets use AES-GCM; external device tokens are hashed, independent and short-lived. Refresh ambiguity requires re-login. Identity uses issuer+subject, never email. Desktop opens system browser and privately polls proof-bound completion; it assumes no official custom callback. Mobile uses Expo browser login and a fixed app callback with only a login identifier. Desktop renderer gets no bearer; phone uses SecureStore. No model/owner/push secret enters clients.

**Tests:** signed local OIDC fixture rejects nonce/state/audience mismatch; encrypted state, expiry, rotation, revocation; actual two-Harness routing below. **Blocked:** live Auth0 tenant/application, real callback HTTPS and actual native login. Fixture results are Level 1, not live identity. Source SHA and CI: manifest.

## Phase C — automatic isolated allocation

**Files:** `src/control/pool.ts`, control store/server, private managed operator ingress, `scripts/{verify-v03-accounts,managed-admin,control-admin}.mjs`. Preallocated isolated Harness profiles/origins reserve one account each; transactional uniqueness prevents authority/owner collisions. Capacity exhaustion stays pending/unavailable, never falls back to another account. Nonempty V02 profiles require verified operator adoption, retain IDs and revoke old devices.

**Tests:** two actual Harness processes; same account/two independent device credentials; different accounts/different authority+owner IDs; discovery reuse; foreign task/Session denied; controller restart; revoke/re-login. Identity adapter is explicitly fixture. This is Level 2, not production new-user onboarding. **Blocked:** actual identities and hosted pool. Source/CI: manifest.

## Phase D — managed runtime and recovery

**Files:** `deploy/{control,managed,aws}`, `scripts/{control-backup,verify-control-backup,verify-managed-container,verify-real-deepseek}.mjs`. Reused native container; one HTTPS edge, restricted controller and at least two private TLS leaves on separate volumes. Controller only handles identity/routing/allocation. Only 80/443 public; owner/provisioning APIs are not proxied. Separate secret mounts, exact trusted proxy, resource/restart/health configuration.

AWS candidate is EC2 + encrypted durable EBS (`prevent_destroy`) + Elastic IP + SSM; IMDSv2 deliberately denies these containers instance credentials. CI validates Terraform schema and builds the real controller image; **no apply, paid resource or cloud deployment occurred**. Actual Docker test checks restricted TLS API/device auth and restart IDs. Encrypted coordinated restore rehearsal uses seven disposable Docker volumes/SQLite fixtures, authenticates before mutation and rejects wrong key. It is not an actual production restore.

**Blocked:** compute/region/size/payment approval, real domain/TLS, IdP/model secrets, durable disk/monitoring/spending controls, real production checkpoint. `real-deepseek.json` explicitly records missing key/model. Docker/Terraform checks are engineering results; no Level 4/5. Source/CI: manifest.

## Phase E — Desktop product

**Files:** `src/desktop/{index,account,device,client}.ts/js`, reused `src/client/panel.js`. Native sidebar welcome/login/discovery, shared chat/history, Tasks/Goals/Memory/Inbox/Activity/Devices/logout, bilingual copy and offline/error/retry/unknown outcome. Manual Host/code fields require an explicit operator flag; raw Session IDs/JSON are advanced details. Local Harness workspace and hosted Personal Agent stay separate; no disconnected local shadow agent.

Run history now resolves Run ID and its native event boundary, excluding later conversation. Missing/foreign boundary on a finished run fails clearly; continuing live is explicit. Unit transport fixture checks Run→Session/cursor binding. Actual Desktop engineering UI independently rereads persisted writes and tests device revocation; legacy pairing is enabled only for those tests. **Blocked:** real account-backed Desktop login and production mutations. Source/CI: manifest, Levels 1–3 as labeled.

## Phase F — native mobile

**Files:** `apps/mobile/{App.tsx,hooks,screens,theme.tsx,ui.tsx,locales.ts,cache.ts,app.config.ts,eas.json}`, shared client build. Retained Expo 58/RN 0.88, SecureStore, notifications, metadata-only uncertain operations and ManagedClient. Split eight screens; added account restore/discovery, history/live text/tool preparation, reconnect, Devices/Settings, English/Chinese/system/light/dark. OS-encrypted bounded stale cache is account/device scoped and disables writes; logout clears it. Startup probes actual credential storage. No legacy credential auto-adoption.

**Build/tests:** actual Android APK and iOS Simulator app; Android emulator clicks Sign In (honest missing-service error), switches language/theme and restarts. iOS Simulator launches compiled app and verifies SecureStore/welcome. These are **not live account/backend acceptance**. Android uses a development debug key, not a stable release key; Simulator ad-hoc signing is not iPhone provisioning/TestFlight. **Blocked:** authorized distribution signatures, physical phones, actual login/push and all native forms/keyboard/long-text backend-correlated interactions. Source/CI: manifest, Level 3 simulator/emulator only.

## Phase G — shared state/event recovery

**Files:** `src/managed/{feed,index,store}.ts`, shared clients and native event consumers. Public Harness Session/assistant events drive durable changes and bounded real text/tool-name frames. Transient epoch/cursor, long-poll wait and full reconciliation handle overflow/restart/gap. Fixed change paging that advanced past more than 200 unreturned events. Durable native records remain authoritative; transient text/input admission never means success.

**Tests:** actual two-Harness shared Session input/events, Task/Goal/Memory, independent device auth/idempotency; unit cursor/overflow/epoch/unknown-state checks. Committed memory edit replay returns its original receipt even after a newer revision. **Blocked:** live native account/model correlation. Source/CI: manifest, Level 1/2.

## Phase H — memory and goals

**Files:** reused host memory, shared schema/panel, mobile Memory/Goals, managed goal projection. Consent and proposed/approved states preserved. Optional memory revision plus compare-and-swap protects concurrent edits without rewriting IDs; both clients send revisions. Delete excludes future retrieval/context; historical transcripts/backups/provider records are not claimed erased. Bounded retrieval treats external text as untrusted data. Goals retain native Task linkage, policy/budget/latest run/recent checkpoints; full ledger is retained.

**Tests:** real Harness memory lifecycle, stale edit rejection, committed edit replay and linked Goal. **Limits:** CAS is concurrency control, not semantic contradiction detection between separate memories. No autonomous multi-task planner/semantic conflict resolver was invented. Plugin export includes full Run Ledger but not native transcript bytes; transcript export is a separate scope. Hosted erasure/retention policy remains operator work. Production native UI tests blocked. Source/CI: manifest, Level 1/2.

## Phase I — offline execution and budget

**Files:** existing coordinator/native Schedule and `src/managed/policy.ts`. Preserved once/interval/daily tasks, report + successful native turn + Session flush completion, interruption/unknown state, deduplication, pause/cancel and no blind side-effect retry. Bound account limits: 2 concurrent turns, 8 steps/turn, 180 seconds, 300 admitted steps/day, 250,000 reported tokens/day, 2,048 output tokens/request. Unknown usage, including failed attempts, blocks further admission that day. Shell/local files/external writes are denied; no offline local-device execution is falsely promised.

**Tests:** actual native scheduled deterministic integration, recovery, concurrency, tool guard and accounting. **Blocked:** real hosted model execution with Mac powered off. Accounting is retrospective: a dispatched request/native retries/auxiliary search can exceed reported token thresholds. Actual provider monetary spending controls remain mandatory. Source/CI: manifest, Level 1/2, no Level 4.

## Phase J — proactive native push

**Files:** retained managed durable Push Outbox, Expo registration, mobile Inbox/Activity/deep links/status. Inbox authority, send/ticket/receipt/client-ack distinction, deduplication, invalid token cleanup, device revocation and generic lock-screen content preserved. Account revoke immediately denies API; failed leaf/provider cleanup retries durably. Push is not claimed disabled upstream before cleanup confirms. Historical links use the recorded Run boundary.

**Tests:** outbox state machine, ambiguous send/no replay, revoked-device rejection. **Blocked:** actual Expo project, APNs/FCM/server authorization and physical phones. No real push was sent/received. HTTP acceptance and provider receipt do not prove physical delivery. Source/CI: manifest, Level 1.

## Phase K — security, privacy and cost

**Files/tests:** control identity/store/pool/server, managed guard/feed/policy/migration, mobile storage/cache, unit account/OIDC/auth/budget/push/history tests, actual accounts/container tests. Narrow routes, ownership, expiry/revocation, bounded input/response/rate/queue, no owner proxy, consent/CAS and migration/downgrade refusal are checked. Backups encrypt independently; partial restore leaves services stopped. No plaintext passwords/model/push private keys are bundled.

Root full dependency graph and mobile production audit summaries are recorded in evidence. Overrides protect built plugin/Linux dependencies, **not the signed Desktop binary**, which contains older undici/MCP client packages. Vendor remediation/applicability remains a release gate. This is not a third-party penetration test. **Blocked:** live full-scope two-account IDOR tests, actual provider spending limits, alerts, complete hosted deletion/export/retention policy and vendor review. Source/CI: manifest.

## Phase L — distribution/release

Desktop tarballs, development-signed APK and iOS Simulator binary are traceable Actions artifacts with 14-day retention. Small observations/screenshots are committed with source/run provenance; binaries stay in Actions. Unconfigured previews are **development artifacts, not install-and-use releases**. Existing alpha releases are immutable; no v0.3.0 tag, npm release, TestFlight or MVP Ready label created.

**Blocked:** operator prerequisites in [V03_HANDOFF.md](V03_HANDOFF.md), real configured rebuild/signing/distribution, then the complete production matrix. Source/CI: manifest. No further independent feature work is substituted for missing real acceptance.

## T01–T22 production acceptance

All rows use source **`95793a60d3475be5b36a425562cb4065daba19f1`**, actual environments/evidence in the manifest and [machine-readable matrix](evidence/v03/production.json). Blocked means the required production observation has not happened, including where lower-level engineering checks pass. No fixture is promoted to Pass.

| ID | Status | Observed engineering evidence | Missing production evidence / reason |
|---|---|---|---|
| T01 | Blocked | Official macOS/Windows Plugins GUI lifecycle, local test tarball | Published supported target, usable hosted product, version upgrade |
| T02 | Blocked | Native account welcome/browser flow | Real Auth0/HTTPS and Desktop sign-in |
| T03 | Blocked | APK and iOS Simulator native build/launch | Stable Android signature, Apple/TestFlight, physical phones |
| T04 | Blocked | Expo login/restore and actual SecureStore probe | Actual native Auth0/callback/recovery |
| T05 | Blocked | Two real isolated Harness leaves, automatic reservation/reuse | New live identity gets usable hosted Agent |
| T06 | Blocked | Same-account two protocol devices share authority | Actual account Desktop/physical phone IDs |
| T07 | Blocked | Native Session input/events/live feed and bounded history | Real model reply visible in both actual clients |
| T08 | Blocked | Shared persisted Task ID and actual Desktop writes | Physical phone creation observed by account Desktop |
| T09 | Blocked | Consent/CAS/delete and actual Harness memory lifecycle | Both native account UI lifecycle with readback |
| T10 | Blocked | Real Goal→Task/checkpoint/budget projection | Native account create/pause/cancel/shared readback |
| T11 | Blocked | Expiring independent devices, revoke/re-login/cleanup tests | Actual accounts/devices and confirmed upstream push stop |
| T12 | Blocked | Missing key/model explicitly recorded | Hosted DeepSeek/tool/report/terminal/flush/output |
| T13 | Blocked | Server-owned native schedules | Continuous hosted execution with witnessed Mac power-off |
| T14 | Blocked | Durable Inbox/Push Outbox tests | Expo/APNs/FCM and physical receipt |
| T15 | Blocked | Deep links and verified historical boundary | Physical notification tap/correlated Run/Session |
| T16 | Blocked | Source/no-change deduplication tests | Real repeated/new research and actual notifications |
| T17 | Blocked | Container/controller/Desktop restart stable IDs | Deployed service and both signed devices' restart matrix |
| T18 | Blocked | Interrupted/no-false-success/no-blind-replay tests | Hosted fault injection observed by native clients |
| T19 | Blocked | Distinct real Harness owners deny foreign Task/Session | Live Auth0 accounts/all resource scopes/native IDOR |
| T20 | Blocked | Normal clients hide Host/code/key and have no local fallback | Complete configured published install→sign-in→ready |
| T21 | Blocked | Transactional migration/reinstall/disposable volume restore | Distributed signed upgrade and production rollback |
| T22 | Blocked | API/tool/budget/container tests and audit | Live security/expense/alerts and signed vendor review |

## External blockers and next work

No authorized cloud/Auth0/DeepSeek/Expo/Apple/npm credentials were found. [Handoff](V03_HANDOFF.md), [control deployment](../deploy/control/README.md) and [AWS candidate](../deploy/aws/README.md) give precise operator steps. End users never perform these operations. Once authorized, deploy the real service, register actual identities, rebuild clients with real public metadata and stable signing, then retain correlated IDs through the full physical chain. Until then release is blocked.
