# v0.2 Phase 2 — Managed authority and device protocol

Engineering implementation underway; **production hosted/model acceptance is not complete**.

A separate native managed plugin runs inside the single Harness authority, alongside the existing Always-on core. It calls published in-process Connection/Peer and generated Session APIs; no launch token is forwarded to devices and no second Agent loop exists. Five-minute, one-use pairing codes issue independent device bearer credentials. Hashes, expiry and revocation persist in private SQLite. One profile is one owner/authority, not a multi-user SaaS.

The existing coordinator, memory, Inbox and Run Ledger remain the state authority. Typed mutations have a durable device/operation ledger. Replays return the recorded result; conflicting reuse is rejected; interrupted pending operations become unknown instead of being replayed. Session mutation acknowledgment is flushed before its operation receipt is committed, and never represents model/business completion. Read snapshots include persistent authority/owner identities and a monotonic cursor. Bounded change history requires a full snapshot after a cursor gap.

`node scripts/build-managed-test.mjs` uses a real packed Harness with two independently paired clients. It checks shared tasks and Session input, duplicate submission, Host restart with retained authorization/IDs and device revocation. It does not use a model fixture to stand in for a production model result. Unit tests separately cover one-use/expiry/revocation, durable request deduplication and crash-unknown classification.

The operator container template pins Node 24 and Caddy, binds the Harness privately and exposes only the narrow HTTPS device API. Startup requires an actual model key/model selection and trusted TLS files; it does not create a public service or configure any cloud account. Persist the complete `/data` and `/config` volumes, use exactly one writer/replica, backups, process restart and provider-side spending limits. End users receive a service URL/pairing code, not a VPS installation assignment.

Remaining external gates: operator cloud authorization, persistent compute/volume/domain/TLS setup, a server-side DeepSeek credential and verified supported model ID. No production URL exists yet. GitHub Actions is an engineering runner, not the continuously hosted service. Real DeepSeek inference and desktop-power-off completion must be recorded separately before release. **MVP Ready remains false.**
