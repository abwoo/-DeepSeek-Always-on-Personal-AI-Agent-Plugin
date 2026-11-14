# Always-on Desktop — Phase 1 development preview

Native Cordis Host/Client extension for the official DeepSeek Harness Desktop. This private development package adds **Personal Agent**, connected exclusively to an independently running Harness authority. It is not a released end-user product and is not MVP Ready.

The task, memory and Inbox UI is shared with the existing plugin. Its API path targets an authenticated local bridge to the remote authority, never the local task store. Conversations use the public generated Session API; execution-session links open the remote viewer rather than passing remote IDs to Desktop's local workspace. Closing Desktop leaves the remote authority independent.

Build from repository root with `npm ci`, `npm run build`, `node scripts/build-desktop.mjs`, then `npm pack ./packages/desktop --ignore-scripts`. Install through the actual Desktop application's own command with the app quit and its profile already initialized:

```bash
dsh plugin --profile desktop add /absolute/path/abwoo-deepseek-always-on-desktop-0.2.0-dev.1.tgz
```

The global npm CLI does not manage the Desktop profile. Do not publish or distribute this preview as a completed v0.2 release.

For operator-controlled integration testing only, launch the Desktop server process with `ALWAYS_ON_DESKTOP_OPERATOR_PREVIEW=1`, `ALWAYS_ON_DESKTOP_REMOTE_ORIGIN` and `ALWAYS_ON_DESKTOP_REMOTE_TOKEN`. The token is the test authority's operator launch credential, not a model key. It remains in Host-side process memory/environment; the renderer receives only connection metadata and authenticated results. HTTPS is required except disposable loopback tests explicitly setting `ALWAYS_ON_DESKTOP_ALLOW_LOOPBACK=1`. Without preview configuration, the package stays unconfigured and does not use a local Agent.

This bootstrap is **not production device pairing**. Phase 2 must provide scoped, revocable credentials and managed identity; end users must not configure an operator token or buy/maintain a VPS. Do not put any key/token in source, screenshots, client storage or chat. No phone app exists in this package.

Read-only calls can reopen a failed SDK connection. Mutations require a currently established connection and are attempted once. An uncertain transport outcome is displayed as uncertain; there is no automatic mutation retry or local fallback. Prompt IDs persist through an uncertain submission. Full mutation reconciliation/deduplication and credential rotation still need Phase 4 coverage.

Conversation rendering currently covers recent durable text messages and native running/pending/error state. It is not yet a replacement for the full Harness attachment/tool/approval UI. There is no synthesized model result, no independent Agent Loop, no local-file bridge and no native push implementation. The Inbox stays authoritative on the remote Host. Native human approval forwarding and full stream/history recovery remain release gates.
