# v0.2 Phase 0 — Native Desktop / remote Session feasibility

Date: 2026-11-14. Decision: **HOLD at Phase 0. Native Desktop feasibility is not yet accepted.**

The existing v0.1 Web plugin remains available. Nothing in this report changes its release into a native-mobile or hosted product. No v0.2 release is authorized by the evidence below.

## Reproducible evidence

| Check | Actual result | Scope / limit |
| --- | --- | --- |
| Published Harness | `@deepseek-ai/dsh@0.2.2-rc.3` | Exact npm version in package-lock.json, not moving upstream master |
| Cordis | `@deepseek-ai/cordis@4.1.0` | Exact version |
| Remote connection, Gateway, Session descriptor, registry | All `0.2.2-rc.3` | Public exported `/client` and `/remote` entrypoints; no source imports or core patch |
| Independent remote clients | Two Node SDK Contexts connect over HTTP + WebSocket to one real Harness process | Loopback transport test, not a managed cloud deployment or Desktop shell test |
| Shared durable Session | A creates a Session, B renames that exact ID, A reads the title in durable events; a fresh client reads it after Host restart | No local Session store, import, fork, mirror or model fixture in this test |
| Authentication | Invalid launch token rejected with HTTP 401 | Not production device pairing / tenant authorization |
| Authority isolation | HTTPS required; HTTP only with explicit loopback test option; credentials/query/path rejected in configured origin | Credentials stay in probe process memory; cross-origin HTTP and WS rejected |
| Existing plugin integration | Existing test suite preserved and run with the new probe | Test-model integration remains labelled fixture-based |
| npm CLI Desktop installation attempt | `dsh plugin --profile desktop add "$PWD"` rejected: `profile "desktop" is managed exclusively by the Electron application` | No artificial Desktop profile created to bypass the restriction |
| macOS / Windows Desktop plugin load | **NOT RUN** | This worker is Linux; no actual macOS or Windows Electron application was executed |
| Native remote Session panel / continuation | **NOT VERIFIED** | A Node protocol proof does not demonstrate renderer integration, Desktop credentials or a remote conversation UI |
| Real DeepSeek generation | **NOT RUN** | No authorized provider credential configured for this acceptance run |

Run `npm ci && npm run check`, install the disposable Web bundle as in README, then `npm run test:e2e`. The test named `Phase 0: independent SDK clients share one durable remote Session` executes the actual published Host with no model provider. It deliberately tests durable Session control rather than claiming successful model inference. CI runs it in the existing workflow and retains the Playwright report.

The protocol implementation commit [a4b921c](https://github.com/abwoo/-DeepSeek-Always-on-Personal-AI-Agent-Plugin/commit/a4b921cf378d64445da8fd0ac2ef3ccef90dcc21) passed [GitHub Actions run 43554486983](https://github.com/abwoo/-DeepSeek-Always-on-Personal-AI-Agent-Plugin/actions/runs/43554486983): 25 unit/integration checks and 3 real Host/browser/protocol tests. Local browser execution was blocked by this worker's Chromium socket permission; Actions executed the browser tests successfully.

A separate `phase0-windows.yml` workflow now attempts the **actual signed official Windows installer** on a disposable Windows runner. It records the installer SHA-256, signer and actual bundled version; a version mismatch blocks the probe. Its native panel/task/restart/install/remove checks are narrower than the remote-Session gate. A successful native local panel probe must not be reported as a remote Desktop Session proof. Initial status: pending execution.

## Official interfaces and architecture findings

The [official Desktop reference](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.2.2-rc.3/apps/desktop/README.md) describes an Electron shell with an owned local Host, a private main-process credential and a separate Desktop plugin profile. Its renderer uses the Web client plugin platform. `platform: web` in the existing package is therefore not proof of incompatibility and should not be replaced by an invented `desktop` value.

The [Connection reference](https://github.com/deepseek-ai/deepseek-harness/tree/dsh-v0.2.2-rc.3/packages/client/connection) and published types expose `installConnection`, per-Context `fetch`, `createWebSocket`, `streamBaseUrl`, and generated Session methods. This supports testing an isolated remote connection. It does **not** establish a supported way for a plugin to replace Desktop's entire root connection. Rebinding `ctx.uiWorkspace.openSession(remoteId)` while it still targets the local Host is prohibited.

Official Desktop installers are linked from [DeepSeek downloads](https://www.deepseek.com/en/download/): [macOS ARM64](https://download.deepseek.com/desktop/dsh-latest-macos-arm64.dmg), [Windows x64](https://download.deepseek.com/desktop/dsh-latest-windows-x64.exe). Windows HEAD returned HTTP 200 on 2026-11-14, length 299595752, Last-Modified 2026-11-13 15:55:17 GMT. These are moving `latest` URLs, **not verified version pins or checksums**. They were not executed. Before acceptance, record each installed app version and SHA-256; reject a mismatch instead of treating the latest app as rc.3.

Upstream master is moving within the preview version; do not equate its code with the installed npm build. The npm CLI restriction above was observed directly. Desktop plugin management must use the supported command supplied by the actual installed application, after its profile has been initialized and with the app fully quit. Do not tell users to mutate Desktop using the global npm CLI.

## Proposed design, pending native validation

One managed Harness owns Session events, native Agent execution, Schedule, Goals, Memory, Inbox and Run Ledger. The existing local Desktop Host may act as the plugin/device transport; it must never become a second authoritative Personal Agent or execute fallback inference when the managed Host is unavailable.

A native plugin panel should use an isolated connection to the managed authority (or a narrow local Host bridge to that connection), leaving Desktop's local root connection intact. The remote panel must render the remote Session history and submit prompts to the same remote ID. A visible authority identifier and explicit offline errors prevent accidental local substitution. Reuse public Session control/projection services where supported; do not clone the Harness Agent Loop or claim the default local chat has been switched remotely.

`src/remote/probe-connection.ts` is a **development probe**, not a production device SDK. It uses the official GET `/connect?token=…&interactions=none` exchange and retains its API lifecycle socket. `interactions=none` prevents the passive probe from answering human approvals. A disconnected peer requires a new authenticated connection; this code does not implement production pairing, credential renewal, local-device actions or transparent retry of writes. Do not ship the root launch token to mobile devices. Production requires narrowly scoped, revocable device credentials behind an authenticated gateway; no DeepSeek model key leaves the managed Host.

## Remaining Phase 0 acceptance (must all pass)

1. Obtain a real macOS ARM64 and Windows x64 application build with recorded version/hash; initialize a disposable Desktop profile through the actual app.
2. Install this bundle through the Desktop-owned plugin manager/command. Demonstrate native slot load, service lifecycle, disable, re-enable and uninstall without editing Harness core.
3. Register an isolated remote connection/panel using only published APIs. Desktop must list/read a Session created on the remote Host, display its actual durable events, submit a prompt to that ID and receive its actual result. Verify remote and local IDs are not confused. The current Node probe does not satisfy this item.
4. Use a real authorized DeepSeek provider on that remote Host. Record request outcome and correlated Session/run IDs without keys or private prompt data in public artifacts.
5. Disconnect and restart Desktop. The remote Session must remain durable and accessible; revoking credentials must stop access. Disable the plugin and verify remote/device work stops as specified, with data retained.
6. Publish redacted native recordings/logs plus protocol evidence and platform/version metadata. A screenshot of the existing Web UI or deterministic fixture is insufficient.

Until these pass, Phase 1–6 implementation is held. No mobile screen development, managed billing/service provisioning, push success claim or MVP Ready label is justified by the current evidence.
