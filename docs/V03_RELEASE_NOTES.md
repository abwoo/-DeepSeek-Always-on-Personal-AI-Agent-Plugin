# v0.3 engineering candidate notes

**Not a published v0.3.0 release. Not MVP Ready.** App implementation: `95793a60d3475be5b36a425562cb4065daba19f1`; native probe HTTP follow-up: `610ba0b51802844c646bc73d8ac9930412cc210a`. Acceptance/evidence and operator prerequisites are linked from the README. The existing Web alpha release/version is preserved.

## Engineering stabilization — 2026-11-16

Native startup now waits for SessionController before rearming reserved-session schedules, preserves existing Task/Schedule/Session identities and checks recovery receipts before reporting success. Shared Desktop/mobile chat hides native model-context catalogs/instructions/snapshots while preserving user quotations and full authoritative history. Native observation collection separates ADB diagnostics from XML/image bytes and retains original retry deadlines and application failures. Exact validation and remaining production blockers are in [the native repair record](V03_NATIVE_REPAIR.md).

## Changes

- Official Desktop Plugins metadata/package and actual macOS/Windows GUI lifecycle verification; native Personal Agent sidebar and account-first welcome.
- Single Auth0 OIDC code+PKCE identity controller with encrypted state, independent expiring/rotating device credentials, ownership checks, revocation and audit.
- Automatic account allocation to isolated persisted native Harness instances; no email merging, shared owner fallback or additional Agent loop.
- Modular independent Expo app with eight screens, bilingual themes, secure restore/cache, unknown-outcome recovery and device management.
- Real native text/tool event transport, cursor reconciliation, memory edit conflict detection, recorded Run/Session boundaries and per-account runtime budgets.
- Restricted HTTPS operator deployment, AWS IaC candidate and coordinated encrypted backup/restore tooling with disposable Docker volume rehearsal.

## Data and migration

Core schema/record IDs remain. Gateway v2→v3 migration is transactional and adds account budgets. Optional memory revision defaults legacy records to revision 0 until edited; committed operation receipts survive revision changes. Control identity/assignment state is a separate database and must be backed up/restored together with every assigned profile. Future versions reject downgrade.

Old paired installations are not silently adopted into an account. Verified stopped-host operator adoption revokes old credentials and retains Tasks/Goals/Memory/Inbox/Runs/Sessions. Ordinary logout/uninstall does not delete hosted work; cancel/pause tasks explicitly. Memory deletion stops future context use, not retrospective transcript/provider/backup erasure. Full hosted account retention/erasure operations still need a real operator policy.

## Build and acceptance scope

Actions compile Desktop tarballs, Android APK and iOS Simulator app. Native Desktop tests operate official signed apps; mobile smoke runs actual compiled apps in emulator/Simulator. Auth protocol fixtures and deterministic Harness tests are explicitly labeled. No genuine Auth0 tenant, real-provider completion, continuous cloud service, Apple provisioning/TestFlight or physical APNs/FCM receipt was produced. Android CI signing is development-only. No v0.3 npm publication or formal app distribution occurred.

All T01–T22 production gates remain Blocked in `V03_ACCEPTANCE.md`/`evidence/v03/production.json`. The release gate fails under `--require-ready` until actual evidence exists. A green Actions run is not Level 5. See `V03_HANDOFF.md` for the exact credentials/authorizations and ordered real-device continuation.
