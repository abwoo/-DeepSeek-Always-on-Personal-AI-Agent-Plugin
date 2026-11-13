# Compatibility

Supported npm runtime: **@deepseek-ai/dsh 0.2.2-rc.3**, Node 24.9+, Cordis 4.1.0. The lockfile fixes dependency integrity. Source reference: official [dsh-v0.2.2-rc.3](https://github.com/deepseek-ai/deepseek-harness/tree/dsh-v0.2.2-rc.3). Current upstream master was also inspected at `39163dd30f703a79079e2d2446545cff3c453738`; it already has different WebServer authentication contracts. The **installed npm package declarations and native tests** are the implementation authority for this alpha, not moving master.

Public integration points: `ctx.schedule.create/edit/run/catalog`, `schedule/changed`, `agent/created`, `agent/pre-step`, `session/event`, `ctx.sessions.flush`, `ctx.tools.register/guard`, agent-scoped `systemPrompt.section`, `ctx.connection.fetch.register`, `window.__ModuleLoader__.load`, native `main` / `sidebar.panellist` slots and locale registration.

The adapter parses the version-pinned public reminder framing only for native schedule-sourced input and verifies the schedule/task pair. Contract tests render both reminder formats with the actual installed Schedule package. Mixed batches are refused in this alpha; each plugin-created task reserves its own Session. Keep plugin-managed Sessions dedicated to automated work.

The package has no private-core imports or patches. It registers exact authenticated owner-only Connection routes for both state operations and service-worker bytes. It does not assume the newer master WebServer `auth` option exists in the published version.

Upgrade procedure: back up data, stop Host, keep this pinned runtime, install new plugin tarball, run acceptance tests, restart. SQLite refuses a newer schema version instead of silently downgrading. Revalidate any Harness upgrade separately. Dynamic memory changes affect future assembly; historical request copies remain in native Session logs.
