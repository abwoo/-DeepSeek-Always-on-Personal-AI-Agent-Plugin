# v0.3 implementation and release acceptance

**Development branch; MVP Ready: false.** Baseline audit: [V03_AUDIT.md](V03_AUDIT.md). No live identity tenant, cloud service, real provider run, signed physical iPhone or native-push receipt is implied by engineering tests.

## Phase record

| Phase | Implementation / evidence | Remaining acceptance |
|---|---|---|
| Audit | Latest main audited, reuse/migration contract recorded, 31 baseline checks passed | Complete; original evidence stays versioned |
| A — Distribution | Official Plugins implementation and pinned signed app behavior inspected | Actual GUI install/enable/disable/update/uninstall and npm authorization |
| B/C — Identity/provisioning | Not implemented at baseline | Auth0 code+PKCE, independent devices and isolated authority assignment |
| D — Hosting | v0.2 real container restart retained authorization and task/memory/Session IDs | Actual authorized cloud, HTTPS, backup/restore, real provider |
| E/F — Native clients | Existing Desktop and independent Expo app retained | Account onboarding, modular screens, actual login/UI interactions and physical signing |
| G/H/I/J — Shared state and execution | Existing protocol, memory/goal-to-task, native Schedule and push bookkeeping retained | Event transport, account isolation, real model and physical notifications |
| K/L — Security/release | Existing fail-closed tools/budgets, npm audit and explicit vendor risk gate retained | Complete security/device matrix, distributable signed builds and Level 5 |

## T01–T22 production matrix

All rows below are **Blocked at baseline**. Existing engineering observations are useful evidence, not substitutes for these final user-visible production tests.

| ID | Required result | Status | Missing proof |
|---|---|---|---|
| T01 | Official Plugins GUI installs/enables plugin | Blocked | GUI installation and supported distribution target |
| T02 | Desktop account login without manual address/code | Blocked | Live OIDC tenant and native login |
| T03 | Physical iPhone and Android install | Blocked | Signing/distribution and physical devices |
| T04 | Same-account mobile login | Blocked | Live OIDC/native callback |
| T05 | First login allocates, later login reuses Agent | Blocked | Provisioning plus live account test |
| T06 | Both actual clients share authority ID | Blocked | Actual account-backed client correlation |
| T07 | Shared native Session and real model output | Blocked | Real model and both client observations |
| T08 | Shared task ID/status | Blocked | Native phone UI plus actual Desktop |
| T09 | Shared consented memory lifecycle | Blocked | Both native client UI observations |
| T10 | Shared controlled ongoing goals | Blocked | Both native client UI observations |
| T11 | Device revocation prevents future access | Blocked | Account/device integration and live verification |
| T12 | Hosted real DeepSeek execution | Blocked | Cloud/model billing authorization |
| T13 | Execution while Mac powered off | Blocked | Continuous deployment and observed power-off |
| T14 | Physical phone native APNs/FCM receipt | Blocked | Expo/APNs/FCM credentials and actual devices |
| T15 | Tap opens same historical run/Session | Blocked | Physical push and correlated navigation |
| T16 | Repeated finding silent, new finding notifies | Blocked | Real-provider repeated checks |
| T17 | Stable IDs after service/client restarts | Blocked | Account-backed hosted restart matrix |
| T18 | Interrupted work never falsely completes/replays | Blocked | Hosted fault injection and client observation |
| T19 | Two accounts cannot read each other's resources | Blocked | Account control plane and real isolation test |
| T20 | No final-user configuration/CLI | Blocked | Whole onboarding chain |
| T21 | Supported updates retain data | Blocked | Actual distribution/signature upgrade tests |
| T22 | API/tool/budget security | Blocked | Account security tests and vendor dependency review |

Every subsequent phase record must name source SHA, CI run, actual environment, evidence level, affected files, decisions, tests and remaining gates. Level 1 fixtures, Level 2 real Harness, Level 3 native app, Level 4 real provider and Level 5 production end-to-end are separate. Only Level 5 plus all required security/recovery checks can justify `v0.3.0 MVP Ready`.

## Identity/control implementation checkpoint

Implemented in `src/control/{identity,store,pool,server}.ts`, shared account client and private managed provisioning ingress. Auth0 code+S256 PKCE/state/nonce is handled by `openid-client` with signature checks; server-only rotating identity refresh material is AES-256-GCM encrypted. Devices get independent short-lived API tokens and rotating refresh handles. Refresh ambiguity/crash requires login; uncertain mutations are not replayed. Claims reserve one isolated Harness slot per issuer+subject identity, refuse nonempty legacy authorities, bind account ownership on the authority and reject owner/authority collisions. No email-based account merging.

Local unit/protocol tests pass, including actual signed local OIDC messages with wrong nonce/state/audience rejection (Level 1 fixture, not Auth0 acceptance). `scripts/verify-v03-accounts.mjs` passes against **two real Harness processes**: same-account two-device discovery, distinct account owners, denied foreign Session/task access, shared task/memory/goal/native input, idempotency, controller restart, device revocation and re-login (Level 2; identity adapter explicitly fixture). These do not prove live Auth0, real provider or physical phone behavior.

Desktop and mobile now have account-first interfaces without ordinary Host URL or pairing fields. Desktop Host credentials remain outside the renderer; old manual pairing is an explicit operator diagnostic, never silently migrated into an account. Mobile reuses SecureStore and the existing operations ledger; eight screens and shared controller/theme/copy modules replace the monolithic App. Native builds and UI checks must pass on the new source before acceptance. Service configuration is deliberately null until an authorized trusted service exists; no invented URL is shipped.

Added account-wide admitted-step/token/turn limits using public native hooks and tool guard, while preserving task budgets. A bounded native event feed uses public Session events and assistant text/tool frames. Durable change paging now advances only to the last returned event (fixes a real >200-row cursor skip); transient streams have an epoch and force reconciliation after restart/overflow. Persistent terminal results remain authoritative.
