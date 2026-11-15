# Operator-owned managed runtime

Build: `docker build -f deploy/managed/Dockerfile -t always-on-managed .`.

Deploy as one persistent managed container/replica. Mount private persistent volumes at `/data` (full Harness profile, core and gateway databases, Sessions) and `/config` (edge state). Provide `ALWAYS_ON_PUBLIC_ORIGIN=https://agent.example.com`, `DEEPSEEK_API_KEY`, a verified `DEEPSEEK_MODEL`, plus certificate/key paths in `ALWAYS_ON_TLS_CERT` / `ALWAYS_ON_TLS_KEY`. Mount trusted TLS material read-only. Route the public HTTPS port to container port 8443; never expose port 3080 or the Harness root/API. TLS hostname and public origin must match.

The process supervisor stops the container when either Harness or the edge exits; the hosting platform must restart failed containers. Resource limits, persistent volume capacity, backups and provider billing caps are operator responsibilities. There is no deployment account or production domain configured in this repository. Model keys are runtime secrets, never Docker build arguments or mobile configuration.

From the operator's private runtime console, `node scripts/managed-admin.mjs pair-code` issues a one-use code for the authority's data directory. `devices` lists non-secret metadata; `revoke DEVICE_ID` removes access. The helper does not boot another Harness or reset pending operations in the running gateway. This legacy/manual pairing route is an optional operator recovery/developer path. v0.3 ordinary users sign in through the account controller and must not enter a Host URL or code; see `deploy/control/README.md`. The single-authority template is not a multi-account deployment.

The device API allows snapshots, approved task/memory/Inbox mutations, native Session control, goals and device management. It exposes no generic RPC proxy, Shell, filesystem browser, model/provider settings or approval-answer endpoint. Native tool sandbox/approval remains the Harness boundary. Browser-based owner administration stays private.

Current status: buildable operator template and real Harness engineering tests; not a deployed or production-audited service. Verify trusted public TLS, real provider execution, costs, recovery and actual device notifications before marking any production gate passed.

For native notifications, configure `ALWAYS_ON_EXPO_PUSH_ENABLED=1`, `ALWAYS_ON_EXPO_PROJECT_ID` and server-only `ALWAYS_ON_EXPO_ACCESS_TOKEN`; enable Expo enhanced push security and provision the same project's actual APNs/FCM credentials. Mobile's public EAS project ID must match. Users opt in from the installed native app. Inbox works even when this channel is unavailable. See `docs/V02_PHASE5.md` for delivery-state meanings and explicit physical-device gates.

## Preview upgrades and rollback

Runtime plugin archives are addressed by their SHA-256 content, validated against an image-owned read-only manifest and installed together through the public Harness CLI. This avoids reusing stale plugin contents when a development semver stays unchanged. Update core, managed gateway and controller as one reviewed image set; never patch the signed Desktop or an individual persisted package file. Keep the same agent volumes and record the exact source/image digests.

Before an update, take a coordinated encrypted full-stack checkpoint using the control deployment instructions and retain the matching old image/configuration. A rollback means old image **and its matching whole checkpoint**, not an arbitrary database downgrade. CI actually exercises previous-main image → new image on retained native agent/config volumes → old-image encrypted-checkpoint restore. It uses deterministic fixtures and does not certify real production recovery.
