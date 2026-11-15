# v0.3 account/runtime and proxy stabilization

2026-11-15 · Engineering Preview · **MVP Ready: false**

This release-stabilization pass addresses the two P1 risks identified in the review of main `04751390715651240b59a88dd1b7d828ae6a2a39`. Implementation: **`811f919da757c81dc6eed256997bcabf0b1affcb`**; [PR #3](https://github.com/abwoo/-DeepSeek-Always-on-Personal-AI-Agent-Plugin/pull/3). Existing task/memory/goal/inbox/run IDs and native Harness Agent loop are retained. The earlier [acceptance snapshot](V03_ACCEPTANCE.md) and [reliability report](V03_RELIABILITY.md) are historical evidence, not overwritten test results.

## Phase B/C/D/I/K — account suspension governs real native execution

Previously suspension blocked account API requests while native schedules could keep waking the model. Account suspension and disablement now independently persist desired policy. The controller supplies a revisioned private execution lease, renewed every 10 seconds, valid for at most 30 seconds from **authority request reception**. Expiry uses a monotonic clock; old queued grants cannot renew permission at application time. A transaction reserves each revision together with the current account/allocation policy, preventing stale enabled state receiving a newer revision than a concurrent operator denial.

Account profiles start with `ALWAYS_ON_ACCOUNT_EXECUTION_REQUIRED=1` in the core and managed environment. Startup is closed before the managed plugin loads. Grants exist only in memory: restarting the authority requires fresh controller authorization. Durable revision numbers refuse older/replayed grants. The controller disappearing therefore closes model admission instead of leaving unlimited authorization.

The existing coordinator checks authorization at task creation/admission; public Agent hooks and `llm/stream` middleware stop new model steps/streams, including auxiliary model calls. Tool policy also checks permission. The watchdog requests cancellation of running native Agents and pauses owned native schedules. On resume it restores only account-paused tasks still active, retaining native schedule IDs and preserving explicit user pause/cancel. A negative native schedule API result is not accepted as success. Failed restoration becomes a visible task error; no automatic replay is claimed. The managed push worker waits while permission is denied.

Operator `suspend-access` / `disable-account` commit access policy and audit first, then request immediate authority denial. Missing/unreachable/mismatched acknowledgement reports **`execution: stop_pending`, exit 1**; it does not erase the desired denial or falsely report stopped execution. Resume/enable remain distinct and report renewal pending. Unassigned accounts retain suspension so later discovery cannot allocate around it. See [operator rollout and commands](../deploy/control/README.md).

**Limits:** cancellation cannot undo/refund an already dispatched provider request or external effect. Existing in-flight work may take time to terminate; model cost already incurred remains. VM/container charges continue. A positive policy acknowledgement confirms the closed gate and native schedule pause, not physical cloud shutdown. Older non-lease authorities cannot claim bounded fail-closed behavior: keep stopped and upgrade the complete stack before relying on this policy.

**Affected files:** `src/managed/{execution,index,policy}.ts`, `src/host/{index,tasks}.ts`, `src/control/{pool,store,server}.ts`, `scripts/control-admin.mjs`, `deploy/control/{compose.yml,Dockerfile}`, managed package peers, shared/Desktop/mobile account error feedback. No second Agent loop or private Harness patch was introduced.

## Phase B/K — trusted edge and independent login limits

The supplied topology is one directly exposed Caddy edge. Both public route groups overwrite `X-Always-On-Client-IP` with their actual TCP peer. The controller accepts one canonical IP only from the exact allowlisted proxy peer, expected public Host and HTTPS forwarded protocol. Duplicate/list/port/scoped/malformed addresses are rejected; untrusted XFF/Forwarded/custom headers cannot choose an identity bucket. Equivalent IPv6 and mapped IPv4 forms normalize to the same key.

Per-client login limits no longer combine every client behind Caddy. Peer-aggregate, verified account, device, refresh and proof-bound login-session limits are retained separately. Private container health checks use an explicit HTTP request with approved headers. Extra CDNs/load balancers require a separately reviewed/retested trust configuration; this change does not blindly enable arbitrary XFF.

**Affected files:** `src/control/{network,server}.ts`, `deploy/control/{Caddyfile.example,Dockerfile}`, `scripts/verify-control-proxy.mjs`. Actual Docker Caddy 2.11.9 with TLS/verified private test CA consumes the repository template: 20 requests from one real TCP source pass, the 21st is limited, a second source succeeds, spoofed headers do not rotate limits, and private/owner routes remain unavailable. This is actual transport verification using a local identity adapter, not a deployed public service.

## Tests, compatibility and migration

Pinned Harness **0.2.2-rc.3**, Cordis **4.1.0**. Public Agent cancellation, native Schedule edit/catalog and LLM middleware were checked against these installed APIs. An actual native scheduler limit discovered during verification is respected: its default new-session floor applies to manual triggers too; the test creates a distinct post-resume authorized task rather than changing native timing or treating a delivery receipt as model completion.

- `npm run check`: **58 passed, 0 failed, 0 skipped**, including real temporary SQLite, lease/clock/revision/restart, schema migration, operator subprocess, HTTP limiter, credential recovery, budget, consent, deduplication and interruption checks. Core browser/Harness contract: **3 passed**.
- New tests: `tests/unit/{account-execution,control-network,control-rate,control-admin}.test.ts`; existing account-control test asserts exact denial code/HTTP status independently of translated copy.
- `scripts/verify-v03-accounts.mjs`: **two actual isolated Harness processes**. A native deterministic-model task completes before pause and a new authorized task after resume. Persisted suspension pauses the actual native schedule; direct native input while suspended/expired does not reach the model adapter. Controller loss expires permission. Explicit user pause stays paused. A running native request is observed cancelled, with no completed ledger claim. Existing ownership, registration-ack loss, rotation/logout, cross-account denial and restart checks remain.
- The model adapter is explicitly deterministic; trace records only call markers, never prompt content. Local identity adapter is not Auth0. These are Levels 1–2, **not real DeepSeek Level 4**.
- Real managed Docker restart/auth/state retention and coordinated encrypted restore on seven disposable volumes pass. Restore fixture is not a production backup rehearsal.
- Control SQLite **1→2** migration is transactional: add suspension/revision state while retaining accounts, devices and allocations; future versions refuse downgrade. Core schema/record IDs unchanged; gateway remains schema 3 with policy metadata. Save a coordinated stopped encrypted checkpoint, upgrade core/managed/controller together, set required-execution flags before starting account profiles, then verify fresh policy plus native schedule state. Rollback requires matching full checkpoint and images, never old binary/new DB or independently reset mappings.

No standalone ESLint command is configured; TypeScript/build/test success is reported accurately. Local environment lacks Docker, so real Caddy/container checks were executed in Actions rather than silently substituted locally.

The review baseline `0475139` was rechecked before implementation: all six main workflows (core, accounts, managed, macOS, Windows and native mobile) had completed successfully. Exact baseline run IDs are retained in the manifest. This establishes a regression baseline without treating those engineering checks as production acceptance.

## Actions and native application evidence

Code source for the following runs is `811f919da757c81dc6eed256997bcabf0b1affcb`. [Manifest and archived observations](evidence/v03-stabilization/manifest.json) retain run/artifact IDs, hashes, environment and limitations. Historical production matrix remains unchanged; new release-gate observation still reports all 22 blocked.

| Verification | Run | Result / evidence scope |
|---|---|---|
| Core TypeScript/build, 58 tests, browser and remote Session | [43683078951](https://github.com/abwoo/-DeepSeek-Always-on-Personal-AI-Agent-Plugin/actions/runs/43683078951) | Pass; Ubuntu 24.04, actual Harness + deterministic fixture |
| Account leases, two Harness leaves, Caddy TLS, controller image, encrypted restore, Terraform | [43683078877](https://github.com/abwoo/-DeepSeek-Always-on-Personal-AI-Agent-Plugin/actions/runs/43683078877) | Pass; Ubuntu 24.04 Docker, local identity/model adapters |
| Managed device/owner API boundary and persistent container restart | [43683078958](https://github.com/abwoo/-DeepSeek-Always-on-Personal-AI-Agent-Plugin/actions/runs/43683078958) | Pass; actual containers, no cloud/provider |
| Official signed macOS Desktop | [43683078888](https://github.com/abwoo/-DeepSeek-Always-on-Personal-AI-Agent-Plugin/actions/runs/43683078888) | Pass; actual Plugins GUI install/enable/disable/restart/uninstall/reinstall, independent persistent reads |
| Official signed Windows Desktop | [43683078920](https://github.com/abwoo/-DeepSeek-Always-on-Personal-AI-Agent-Plugin/actions/runs/43683078920) | Pass; same native lifecycle/API checks; compositor screenshot warnings retained, no visual-pass claim |
| Native Android / iOS build and emulator/Simulator interaction | [43683078979](https://github.com/abwoo/-DeepSeek-Always-on-Personal-AI-Agent-Plugin/actions/runs/43683078979) | Pass; Android APK + emulator interaction/restart, iOS 26.4 Simulator compilation/launch/secure storage; no physical-device signing |

Reviewed the actual Android Chinese/dark and iOS English/light welcome screenshots: visible controls/text were laid out without observed clipping in those captured states. This does not extend visual or functional acceptance to authenticated forms, keyboard interactions, other screen sizes or physical phones.

Desktop GUI installs use an immutable local tarball fixture and legacy pairing enabled only for protocol testing; this does not prove public npm distribution or real account login. The signed vendor Desktop still bundles older Undici/MCP components: test-side dependency fixes do not patch that application. Vendor risk review remains a release gate. Native mobile artifacts use development Android signing / iOS Simulator signing, not stable Android distribution, physical iPhone provisioning or TestFlight.

## T01–T22 and external blockers

**All T01–T22 remain Blocked for production.** The complete dated matrix in [V03_ACCEPTANCE.md](V03_ACCEPTANCE.md) remains authoritative for the required physical/production observations; this pass improves engineering evidence for B/C/D/I/K without promoting a fixture to a production Pass. `config/public-service.json` is still `serviceOrigin: null`; `--require-ready` fails as intended.

Missing operator prerequisites remain specific: authorized continuously running compute + public DNS/HTTPS, live Auth0 tenant/web application and callback, server DeepSeek key/verified model + spend controls, Expo project/APNs/FCM/server push access, Apple Team/provisioning/TestFlight, stable Android signing/distribution, npm publication rights and physical iPhone/Android/Desktop testing. No purchases, production deployment, real model call, native push or signed iPhone distribution occurred. Two-slot pool capacity remains finite; large export/retention, semantic memory conflicts and complete native forms/keyboard/network acceptance remain open.

The next independent work is coordinated upgrade/restore rehearsal and additional bounded export/UI reliability where useful. Production B–D acceptance is development/deployment work once operator services are authorized, not a requirement for the user to diagnose unfinished backend code. Physical testing eventually needs the user's devices or an authorized device lab; ordinary end users still only sign in.
