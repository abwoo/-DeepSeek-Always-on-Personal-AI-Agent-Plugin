# Managed Personal Agent gateway — development

Install this native Cordis plugin **alongside** the existing Always-on core on one persistent Harness Web profile. It reuses the public in-process Connection carrier and generated Session APIs. It does not start an Agent loop or carry an administrator launch token to clients.

The private Harness owner endpoint `POST /api/always-on-managed/admin` can issue one-use, five-minute pairing codes. Device clients claim at `/personal-agent/v1/pair/claim`; credentials are independent random bearer tokens, stored only as hashes server-side and revocable individually. One profile is one owner/authority, with up to 32 devices. This is not a multi-user SaaS gateway.

Expose only `/personal-agent/v1/*` through a trusted HTTPS edge. Never publish the Harness root or `/api` port. HTTP is rejected except explicit disposable loopback tests. Configure `ALWAYS_ON_PUBLIC_ORIGIN` and the exact `ALWAYS_ON_TRUSTED_PROXIES`; forwarded HTTPS is trusted only from those addresses with the matching public Host. Keep gateway/core/profile data on durable private storage, one writer/replica, with backups. Devices never receive the model key or owner launch token.

Mutations use durable operation IDs. Duplicate requests return the recorded result; mismatched reuse is rejected. Interrupted/uncertain operations remain unknown and are not replayed. `committed` describes an API mutation/input receipt, not task success. The original Run Ledger remains the completion authority.

Engineering tests run against the real pinned Harness. Production hosting, identity/TLS operation, model execution and real-device push are separate, still-open acceptance gates. Do not mark MVP Ready.
