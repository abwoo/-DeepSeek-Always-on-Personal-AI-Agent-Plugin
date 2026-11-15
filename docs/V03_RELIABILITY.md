# v0.3 reliability follow-up — 2026-11-15

**Engineering follow-up, not MVP Ready.** Base main: `7b67fd283c37ecc06a97e2a90deeb56b7501af0e` (PR #1). Product changes: `0c7456246ffd755f9a515929e7eb2f25ce8805bf`; strengthened fault-injection tests: `446d7be12b88c1109b4715d2ef067b3d63b9dc1a`; native probe HTTP bootstrap: `8323d4e12f7191a0734c7f83813d0226f98ffc41`. [PR #2](https://github.com/abwoo/-DeepSeek-Always-on-Personal-AI-Agent-Plugin/pull/2). This report supplements the dated original acceptance snapshot without replacing its evidence.

## Scope and changes

| Phase | Concrete issue and resulting behavior | Files |
|---|---|---|
| B/K — device lifecycle | Logout previously raced rotating background requests. Sign-out now waits for rotation and secure save, uses the latest refresh handle, rejects further work and coalesces duplicate logout calls. A failed revoke can be explicitly retried without reopening the client. Unknown refresh is not automatically replayed. | `src/shared/account-client.ts`, `src/desktop/account.ts` |
| B/E/G — stale events | A late 401 from an old Desktop event poll could clear a new login. Failure handling now enters the mutation queue and checks the originating device ID before changing credentials. | `src/desktop/device.ts` |
| B/E/F — local closing state | Local sign-out-in-progress uses a 409 with a human-readable message, not a fabricated server 401. This prevents background error handlers from erasing credentials while revocation is still pending. Mobile copy includes Chinese. | `src/shared/managed-client.ts`, `apps/mobile/locales.ts` |
| C — provisioning recovery | Temporary private leaf registration failure retains the encrypted proof-bound plan and returns provisioning. Retry reuses the same device ID/token even if the leaf already committed and only the acknowledgement was lost. No additional OAuth round-trip is required for this case. | `src/control/server.ts`, account contract tests |
| B/E — polling bounds | Slow Desktop login completion previously admitted another request each 1.5 seconds. Only one completion request is now in flight per mounted welcome panel. This does not certify real account login. | `src/desktop/client.js` |
| H/K — memory capacity | Proposals bypassed the 500-entry limit, and a caller-supplied new ID bypassed creation checks. Approved and proposed entries now share the limit; only a genuinely existing record can be edited/confirmed at capacity. Delete frees capacity. A proposal cannot choose an existing ID, consent or revision. | `src/host/memory.ts`, memory tests |

No runtime, account ownership mapping or persistent schema/record ID is replaced. Existing memory proposals with no revision remain confirmable using revision 0. No new cloud resource, secret, dependency or Agent loop is introduced. Existing Task/Memory/Inbox/Run data and execution policies remain.

## Validation

Local `npm run check`: **48 passed, 0 failed, 0 skipped**. Desktop/managed/client builds and native mobile typecheck pass. New unit tests deliberately interleave rotation, secure-save completion, sign-out and stale events; they also exercise ambiguous network failure, secure-store failure, explicit revoke retry, proposal restrictions and quota-boundary edits/deletes.

`verify-v03-accounts.mjs` passes against **two actual published Harness processes**. It commits the first private device registration at the actual leaf, discards its acknowledgement, observes provisioning, and retries with the same persisted device ID. It also rotates an account credential through the actual controller, pauses local save, initiates concurrent sign-out, then verifies denied old access, device revocation and continued isolation of the other account. Identity is explicitly a local adapter fixture, not Auth0; no real model/physical phone is involved.

Completed GitHub Actions and artifact provenance are recorded in [the follow-up manifest](evidence/v03-reliability/manifest.json). Core 48-test/browser validation, account/native-authority contracts, managed container, signed macOS/Windows GUI lifecycle, Android native build/emulator and iOS Simulator build/launch checks all passed. Windows screenshot capture warnings remain explicit; no visual acceptance is invented. The Android emulator recorded a dismissed system-launcher ANR before its app checks; this is not a physical-device stability certification. Native build/launch tests remain Level 3 engineering observations. Unit HTTP/credential-store fixtures are Level 1; the actual two-Harness/controller contract is Level 2. None supplies Level 4/5 evidence.

## Native CI transport investigation

The first macOS run (`43673325742`) reproduced `setTypeOfService EINVAL` in Node bundled Undici. The earlier fetch-only replacement was insufficient: initializing native fetch first leaves the shared dispatcher owned by Node. A local reproducer showed that `install()` alone retained that dispatcher; explicitly setting a new pinned `undici.Agent` replaced it.

`scripts/native-probe-http.mjs` uses public `setGlobalDispatcher` and `install` before SDK/Playwright imports. It changes only the Node test process, never the signed Electron application or core source. The new regression keeps a captured reference to native fetch, initializes the old dispatcher, loads the bootstrap, then verifies 20 actual loopback HTTP responses through both captured and pinned fetch. No socket monkey patch, exception swallowing, removed assertion or runtime downgrade is used. The actual signed-app CI subsequently passed; this regression alone is not native acceptance. The bootstrap does not remediate the signed Desktop vendor dependencies; their existing security/applicability review gate remains.

## Production status and remaining work

Every T01–T22 production gate in the original matrix remains **Blocked**; this follow-up does not change a production result to Pass. The real service origin is still null. No live Auth0/cloud/model/Expo/Apple/npm authorization, physical phone notification or formal v0.3 release has been obtained. The original six post-merge main workflows passed; later source validation is separate in this manifest.

The implementation still needs the [operator authorizations and real-device chain](V03_HANDOFF.md). Large exports still have the documented 2 MiB response boundary and need a paged/streamed export path before an unrestricted data-export claim. Broader semantic conflict detection between separate memories, complete hosted account erasure/retention operations, actual distributed upgrades and authenticated native form/keyboard acceptance remain open as described in the original report. Quota/revision checks do not claim semantic contradiction detection. Disabling an account's API access still does not pause its native schedules; stopping the assigned runtime or explicitly pausing tasks is a separate action.

Next executable release work is to connect an authorized real identity/compute/provider service, rebuild configured signed clients, and run all native account/resource-isolation, provider, powered-off-computer and physical notification gates. End users never perform operator setup. Do not mark a development build as an install-and-use product.
