# Operator-owned managed runtime

Build: `docker build -f deploy/managed/Dockerfile -t always-on-managed .`.

Deploy as one persistent managed container/replica. Mount private persistent volumes at `/data` (full Harness profile, core and gateway databases, Sessions) and `/config` (edge state). Provide `ALWAYS_ON_PUBLIC_ORIGIN=https://agent.example.com`, `DEEPSEEK_API_KEY`, a verified `DEEPSEEK_MODEL`, plus certificate/key paths in `ALWAYS_ON_TLS_CERT` / `ALWAYS_ON_TLS_KEY`. Mount trusted TLS material read-only. Route the public HTTPS port to container port 8443; never expose port 3080 or the Harness root/API. TLS hostname and public origin must match.

The process supervisor stops the container when either Harness or the edge exits; the hosting platform must restart failed containers. Resource limits, persistent volume capacity, backups and provider billing caps are operator responsibilities. There is no deployment account or production domain configured in this repository. Model keys are runtime secrets, never Docker build arguments or mobile configuration.

From the operator's private runtime console, `node scripts/managed-admin.mjs pair-code` issues a one-use code for the authority's data directory. `devices` lists non-secret metadata; `revoke DEVICE_ID` removes access. The helper does not boot another Harness or reset pending operations in the running gateway. Users pair an installed app and do not administer Linux.

The device API allows snapshots, approved task/memory/Inbox mutations, native Session control, goals and device management. It exposes no generic RPC proxy, Shell, filesystem browser, model/provider settings or approval-answer endpoint. Native tool sandbox/approval remains the Harness boundary. Browser-based owner administration stays private.

Current status: buildable operator template and real Harness engineering tests; not a deployed or production-audited service. Verify trusted public TLS, real provider execution, costs, recovery and actual device notifications before marking any production gate passed.
