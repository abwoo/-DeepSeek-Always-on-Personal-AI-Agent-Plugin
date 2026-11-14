# v0.2 engineering acceptance and production gates

2026-11-14 · Development preview · **MVP Ready: false**

The native/managed architecture has code and reproducible engineering evidence. It is not yet a provisioned service or a certified physical-device release. Passing unit tests, transport fixtures or simulator checks cannot satisfy the production chain by themselves.

| Scope | Observed outcome | Evidence |
|---|---|---|
| Existing core | 31 tests and 3 browser/protocol tests pass, including real Harness scheduling, durable results, crash classification, memory consent/deletion, duplicate triggers and budgets. Model behavior in the core integration case is explicitly deterministic fixture behavior. | [Core CI](https://github.com/abwoo/-DeepSeek-Always-on-Personal-AI-Agent-Plugin/actions/runs/43582100672) |
| Managed authority | Independently paired clients share actual tasks and native Session input. Operation dedupe, retained authorization, goals linked to bounded native tasks, memory CRUD, pause and revocation pass. | [Authority CI](https://github.com/abwoo/-DeepSeek-Always-on-Personal-AI-Agent-Plugin/actions/runs/43582100749), [raw protocol record](evidence/phase5/managed-authority.json) |
| Actual runtime container | Image boots behind verified test TLS; native owner/API routes stay private; device auth rejects unauthorized requests. A real container restart retains authority, device access, task, memory and Session IDs on named persistent volumes. No real-model execution is claimed. | [Container record](evidence/phase5/managed-container.json) |
| Actual macOS Desktop | Official signed app loads/removes the package; native forms mutate the shared authority. Tasks, consented memory, conversation input, goal creation, device code issuance, restart and revocation/re-pair pass. | [macOS CI](https://github.com/abwoo/-DeepSeek-Always-on-Personal-AI-Agent-Plugin/actions/runs/43582100686), [raw record](evidence/phase4/mac-plugin.json) |
| Actual Windows Desktop | Same native/API checks pass. Hosted Windows compositor capture warnings remain recorded; missing images are not fabricated. | [Windows CI](https://github.com/abwoo/-DeepSeek-Always-on-Personal-AI-Agent-Plugin/actions/runs/43582100668), [raw record](evidence/phase4/windows-plugin.json) |
| Android | Independent native APK builds and launches on an Android API 35 emulator. Actual SecureStore startup and process restart pass. The test records dismissal of a system Pixel Launcher ANR; it never dismisses an ANR of this app. Physical-device/provider/push acceptance remains open. | [Native mobile workflow](https://github.com/abwoo/-DeepSeek-Always-on-Personal-AI-Agent-Plugin/actions/runs/43581463951) |
| iOS | Native Simulator build, actual app launch and Keychain/SecureStore write/read/delete startup probe pass on iOS 26.4. Xcode links simulated entitlements and creates the Simulator signature. Physical iPhone signing and testing remain blocked. | [Native mobile workflow](https://github.com/abwoo/-DeepSeek-Always-on-Personal-AI-Agent-Plugin/actions/runs/43581463951) |
| Native push | Private persisted outbox distinguishes ticket, provider handoff, unknown sends and client acknowledgments. Labeled transport fixtures verify bookkeeping and no automatic ambiguous-send replay. Actual Expo/APNs/FCM delivery has not been accepted. | [Phase 5](V02_PHASE5.md) |
| Dependency review | Installed operator npm graph and mobile production npm graph report zero known advisories after compatible pins. Signed Desktop bundles retain older undici/MCP dependencies, requiring upstream remediation or reviewed exposure assessment. This is not a full security certification. | [Security review](V02_SECURITY.md), [audit summary](evidence/security/npm-audit-summary.json) |

Exact native compatibility is Harness **0.2.2-rc.3** and Cordis **4.1.0**. Official app installer hashes/signature checks remain in the native workflows. Operator dependency patches do not replace, modify or re-sign those official Desktop applications.

## External production blockers

- No authorized continuous cloud deployment, production domain/TLS operation or live end-user service URL has been provisioned. GitHub Actions is an engineering runner.
- Required Actions secret `ALWAYS_ON_DEEPSEEK_API_KEY` and variable `ALWAYS_ON_DEEPSEEK_MODEL` are missing. The [real-provider artifact](evidence/phase5/real-deepseek.json) explicitly records `blocked`, not model success. The eventual runtime separately needs its server-side key/model configuration.
- No authorized Expo project/APNs/FCM configuration, Apple physical signing/provisioning or actual iPhone/Android notification receipts have been supplied.
- The official Desktop dependency review and physical device/network/power-off matrix remain open. Desktop-local file/action delegation and complete remote attachment/approval UX are not certified features.

Required release chain: **physical phone creates task → actual Desktop reads the same ID → desktop computer powers off → continuously hosted Harness executes with real DeepSeek → native push reaches the physical phone → both devices read the same durable task/Session result**. Every correlation and actual result must be recorded. No v0.2 MVP Ready, store or completed npm release is justified until this passes.

Source/provenance and artifact archive hashes: [evidence manifest](evidence/v02-manifest.json). Managed/Desktop/core checks use `93c085801d0742f83e4fc44eec8b6908707f3081`; native mobile checks use `c36594fab0421375f6505aaa978254282186e80a`. The later managed database migration does not change mobile sources.

Mobile smoke evidence checks native startup and secure storage, not phone UI pairing with a production authority. Shared-state tests use real published Harness APIs and independent protocol clients; the native Desktop UI mutates and independently re-reads that authority. Do not treat those distinct observations as the full physical-phone chain.

Download/setup details: [native quickstart](V02_QUICKSTART.md). Source code and versioned engineering artifacts remain reproducible from the repository; Actions downloads expire after 14 days.
