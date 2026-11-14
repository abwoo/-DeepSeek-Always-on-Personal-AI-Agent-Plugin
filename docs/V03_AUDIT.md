# v0.3 baseline audit

Audited 2026-11-14. Base: `f83c996353a52724e9a522d3f583fb9f9ed0cd8a` on main. Work branch: `v0.3/zero-configuration-mvp`. Target: Zero-Configuration Personal AI Agent MVP. **MVP Ready: false.**

## Reuse and boundaries

| Component | Baseline observation | v0.3 action |
|---|---|---|
| `src/host` | Native Schedule, consented memory, persistent task/run/Inbox state, deduplication, read-only tools and bounded execution | Preserve core runtime and IDs; extend only with tests |
| `src/managed` | One owner/profile, hashed device credentials, durable idempotency, bounded snapshots, native Session APIs, persistent Expo outbox | Keep as each isolated account's authority, not a shared multi-user owner |
| `src/desktop`, `packages/desktop` | Actual signed macOS/Windows integration and paired remote writes verified; install used CLI; private package lacks distribution metadata | Verify official Plugins UI; add public metadata and account onboarding |
| `apps/mobile` | Independent Expo/RN app, native builds and SecureStore probes pass; large App, manual pairing, English/light theme | Keep native modules/credentials/API; split screens, account onboarding, themes/locales |
| `src/shared` | Validated device protocol, metadata-only pending operations, unknown outcomes not replayed | Reuse behind account discovery; add bounded event transport |
| `deploy/managed` | Actual TLS/private API and volume restart tests pass; no real deployment | Preserve image and private Harness; add account control plane and isolated pool deployment |
| Notifications | Durable Inbox-first outbox, tickets/receipts/device ack separated | Keep; actual APNs/FCM/device gate remains required |
| Memory/Goals | Consent/delete and goal-to-native-task linkage work; conflict/history UX limited | Extend metadata/retrieval without replacing storage |

## Reproducible baseline

Local `npm run check`: **31 passed, 0 failed**, including an actual Harness scheduled integration with explicitly labeled deterministic model behavior. Existing main Actions: core `43582100672`, macOS `43582100686`, Windows `43582100668`, managed/container `43582100749`; native mobile `43581463951`. See [v0.2 acceptance](V02_ACCEPTANCE.md) and its exact artifact manifest. Only published releases are `v0.1.0-alpha.1` and `v0.1.0-alpha.2`; neither is a v0.3 product release.

Pinned Harness `0.2.2-rc.3`, Cordis `4.1.0`. Official source inspected at `39163dd30f703a79079e2d2446545cff3c453738`. The Plugins UI accepts npm, Git, local paths and tarballs, offers install confirmation and enablement. Third-party update behavior must be tested, not inferred from the official-bundle update UI. The signed Desktop opens HTTP(S) new windows in the system browser; this permits an HTTPS account login with a private plugin-side completion poll, without modifying Electron or assuming a custom official callback scheme.

## Gaps and risks

No account identity, account-to-authority mapping or automatic provisioning exists at baseline. Manual address/code pairing is the default. Snapshot polling is not incremental chat. Mobile cold start and protocol-client tests do not prove physical phone login or backend mutation from mobile UI. CLI plugin installation is not T01 graphical installation. The signed official Desktop contains older undici/MCP dependencies; root npm overrides do not patch the vendor binary. Preserve this review gate.

The core and gateway SQLite files are separate. Preserve core schema and all resource IDs. Gateway schema is v2; migrations are transactional, reject future versions, preserve device hashes and committed operation outcomes, and classify interrupted pending/sending records as unknown. Existing paired devices must not silently attach to an account or another authority. A new control-plane database may map identities to isolated profiles; it must never merge unrelated users by email or share one owner between them.

## External authorization inventory

Connected GitHub can read/write this repository and run CI. No matching cloud/Auth0/Expo/Apple/npm credentials or deployment configuration are present in environment or standard credential files. No continuous-compute provider connector is available. Sites' web-worker hosting is not a persistent Node Harness Host and is not used as a substitute. No purchases or public service provisioning have occurred.

Choose **one Auth0 OIDC tenant** as operator-managed identity: mature hosted account/recovery UI, authorization code + S256 PKCE, nonce/state validation and rotating refresh tokens. Use its documented OIDC endpoints through a maintained protocol library. No DeepSeek third-party OAuth is assumed. The controller performs identity/provisioning and restricted routing only; Harness remains the sole Agent runtime. End users receive no Host configuration, pairing code, model key or operator secret.

References: [official plugin manager](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/client/ui-plugin-manager/README.md), [Auth0 PKCE](https://auth0.com/docs/get-started/authentication-and-authorization-flow/authorization-code-flow-with-pkce), [Expo authentication](https://docs.expo.dev/guides/authentication/). Local source versions and native tests, not moving master documentation alone, determine compatibility.
