# DeepSeek Always-on v0.2 implementation plan

Status: Phase 0 protocol proof implemented; native Desktop gate blocked. See [evidence and exact blockers](V02_PHASE0.md). v0.1 remains the published Web alpha.

## Architecture and migration contract

The operator provides a managed Personal Agent service; end users pair devices and do not buy or administer a VPS. This still requires an operator cloud account, persistent compute/storage, service identity, domain/TLS, backups and model billing. GitHub Actions is a build/test runner, not a continuous Personal Agent host. No cloud service has been deployed by this plan.

Managed Harness is the sole Agent Runtime and state authority. Each user's isolation boundary owns one Harness profile, one writer and durable plugin SQLite/WAL state. Desktop and Expo apps address the same authority ID + Session ID. Desktop's local Host is limited to plugin presentation and an explicitly authorized device bridge; no local shadow Agent or automatic fallback. A phone never receives a DeepSeek API key.

Preserve `src/host/{tasks,memory,notifications,storage,proactive}.ts` and native Schedule admission/Run Ledger rules. Keep v0.1 Web compatibility as an administrator/diagnostic interface; it is not the mobile deliverable. Add native push as a delivery channel after durable Inbox commit, rather than replacing Inbox or Web Push internals. Version migrations must run transactionally against backed-up state and retain task/run/session identifiers.

## Phase gates and concrete work

| Phase | Work / deliverables | Mandatory acceptance |
| --- | --- | --- |
| 0 — feasibility | Pin SDK, actual remote protocol test, Desktop native install and isolated remote panel experiment, architecture decision | Real macOS/Windows Desktop uses a real remote Session without core patches or a second loop; native install/reload/uninstall recorded. Current status: HOLD |
| 1 — Desktop | Package native panel and lifecycle; reuse slots/theme; show authority, connectivity, actual tasks/history/memory; disable local execution fallback | Each UI mutation verified by reading durable state from another authenticated client; disconnect fails visibly; re-enable retains data |
| 2 — managed Runtime | Operator provisioning, private persistent Harness processes, HTTPS identity gateway, per-user isolation, server-only provider keys, watchdog, backups, budget enforcement | Real DeepSeek task runs while Desktop is terminated; abrupt process failure produces interrupted/failed state, never false completion |
| 3 — native mobile | Separate Expo React Native project, native navigation/chat/task forms/Inbox, secure credential storage and pairing; signed iOS/Android builds | Installable device builds use the managed API; native UI, not WebView/PWA; no model key or operator token in bundle/storage/logs |
| 4 — synchronization | Typed authenticated API for Session/Tasks/Goals/Memory/Inbox, cursor snapshots/events, request IDs and mutation deduplication, reconnect and conflict rules | Same IDs and durable events visible on both devices; mutation followed by independent read; offline pending mutation cannot silently duplicate |
| 5 — proactive / push | Persist authorized goals and checkpoints; reuse native Schedule/tools, source deduplication and budget stops; native Expo push outbox/receipts and device revocation | No-change check stays silent; new result commits Inbox before push; APNs/FCM receipt and real phone lock-screen delivery correlated to run; retry does not re-run task |
| 6 — release | Device/platform matrix, security and fault injection, migration/rollback rehearsals, operator onboarding, signed builds and release evidence | Complete real-device chain below; all missing evidence blocks MVP Ready |

Every phase lands code, relevant tests and updated evidence on main with GitHub Actions. Keep new experimental adapters separate from the tested core. Do not label stub adapters as integrations. Official preview API uncertainty requires a compatibility result before dependent development.

## Shared API and state semantics (design requirements, not invented official APIs)

Use official generated Session Remote types. Build the plugin's additional authenticated API over its current persistence service. Define and validate mutation schemas on both client and server; never depend on TypeScript alone. Responses include authority ID, resource ID, version/event cursor and committed operation ID. Authorize task/memory/Inbox/device access server-side, derived from the authenticated identity rather than a client-supplied owner ID.

Snapshots plus a resumable event stream must repull on gaps/restarts. Native apps can show last-confirmed state offline but must label it stale; agent work continues only on the managed authority. Expired credentials require re-authentication. Mutating calls need durable request IDs; failures after commit are reconciled by reading the operation outcome before retry. Cross-device consistency checks compare the same task/run/session IDs, not matching names or copied chat text.

Memory save still requires explicit consent; auto extraction is a proposal. Deletion excludes it from subsequent retrieval/prompt assembly; old conversation history is not retroactively erased. Task completion remains report + native successful turn end + durable Session flush, never Schedule delivery alone. Interrupted non-idempotent actions remain needs-approval and are not blindly replayed.

## Device operations and safety

No mobile or desktop extension receives unrestricted server Shell access. A future Desktop device bridge advertises short-lived online capabilities and queues no unbounded work. Every request binds user, device, capability, canonical path scope, expiry and operation ID. Offline, revoked or permission-denied devices fail explicitly. Cloud agent cannot claim a local file was read/written while that device is off. Writes, publishing, email, purchases and destructive actions require the configured human approval; no approval can be satisfied by a passive probe. Native Harness sandbox/approval remains authoritative.

Apply run/step/time/token/cost budgets; document accounting limits and any possible single-request overshoot. Limit disk, payloads, retention and attachment sizes. Store push tokens privately per device, support revocation and redact notification text. Signed links carry no model or operator secrets. Record audit events without publishing personal memory/prompts in Actions logs.

## Evidence and release requirements

Each acceptance artifact records source commit, exact app/SDK/Cordis versions, OS/device versions, managed authority identity, correlated task/run/Session/request IDs, timestamp and redacted raw outcome. Separate deterministic fixtures, real protocol tests, actual model execution and real device observations. Unit/CI success cannot fill a missing native/device row.

Required production chain: **real phone creates task → actual Desktop plugin reads the same task → desktop computer shuts down → managed Harness executes using real DeepSeek → native notification reaches phone → phone and Desktop read the same durable Session result**.

Additional failure cases: socket reconnect and cursor gap; phone network switch; expired/revoked credentials; cross-user access denied; Host SIGKILL before/after report; duplicated delivery/mutation; provider timeout/missing usage; push failure with Inbox retained; deleted memory after restart; app/plugin upgrade and disable; offline device action rejection. Retain raw test outcomes with the release.

Outstanding operator/platform inputs: cloud service authorization and budget, domain/identity configuration, server-side DeepSeek credential, Apple Developer signing/provisioning, Expo project/EAS and APNs/FCM credentials, real iPhone/Android and macOS/Windows test access. These are prerequisites, not simulated successes. Ask for the relevant service authorization only when the preceding gate has passed; never request secrets in repository files or chat.

v0.2 remains development-only until the full production chain passes. No npm/mobile store/GitHub release may describe this work as MVP Ready on the basis of the Phase 0 transport probe.
