# Private native remote-Session feasibility probe

Development only. Not published to npm, not installed by the shipping Always-on bundle, and not a managed service or mobile app.

`node scripts/build-phase0-probe.mjs` builds this package's Host entry from `src/remote/probe-plugin.ts`. The native Actions workflows installs it using the official application's own command, alongside the unchanged core plugin. The probe adds a small native slot panel, not a replacement chat UI or Agent Loop.

Server-process environment: `ALWAYS_ON_PHASE0_REMOTE_ORIGIN`, `ALWAYS_ON_PHASE0_REMOTE_TOKEN`; `ALWAYS_ON_PHASE0_ALLOW_LOOPBACK=1` is permitted only for disposable integration tests. The launch token is an operator-level test secret, never sent to the renderer. This is not the production device authentication design. The narrow authenticated route supports create/read/rename/prompt only; it cannot request arbitrary RPC endpoints, files, Shell or approval answers.

The workflow runs an independent real Harness authority and an actual official Desktop process. Desktop's probe panel creates, renames and submits a prompt to a remote Session; an independent SDK observer reads the same ID/events, then rereads while Desktop is stopped. After Desktop restart, its panel reads that ID from the same authority again. The native local-task compatibility check is a separate test and does not represent a shared v0.2 task.

Both Host processes run on a disposable cloud runner, with distinct profiles/data directories and network ports. This verifies process/authority separation, not a production Internet deployment. No model fixture is used by this remote test; no model provider credential is supplied, so a queued prompt is only an input receipt. It does not certify DeepSeek generation, offline task completion, native phone delivery, macOS or MVP readiness.

Do not distribute this probe to end users. Production requires scoped, revocable device credentials and the remaining v0.2 gates.
