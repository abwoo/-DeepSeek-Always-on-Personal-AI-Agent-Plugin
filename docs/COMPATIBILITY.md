# Compatibility

Supported npm runtime: **@deepseek-ai/dsh 0.2.2-rc.3**, Node 24.9+, Cordis 4.1.0. The lockfile fixes dependency integrity. Source reference: official [dsh-v0.2.2-rc.3](https://github.com/deepseek-ai/deepseek-harness/tree/dsh-v0.2.2-rc.3). Current upstream master was also inspected at `39163dd30f703a79079e2d2446545cff3c453738`; it already has different WebServer authentication contracts. The **installed npm package declarations and native tests** are the implementation authority for this alpha, not moving master.

Public integration points: `ctx.schedule.create/edit/run/catalog`, `schedule/changed`, `agent/created`, `agent/pre-step`, `session/event`, `ctx.sessions.flush`, `ctx.tools.register/guard`, agent-scoped `systemPrompt.section`, `ctx.connection.fetch.register`, `window.__ModuleLoader__.load`, native `main` / `sidebar.panellist` slots and locale registration.

Core requires the native `sessionController` before recovering schedules: a reserved `new_once` target may not have a persisted Session yet, and native rearming validates Session-creation capability. Default supported Desktop/Web profiles provide this service; custom embeddings must compose it. Connection Fetch routes remain carrier-neutral and do not require an HTTP listener. The enforcement is verified against the pinned [0.2.2-rc.3 source at 38a6a5c](https://github.com/deepseek-ai/deepseek-harness/blob/38a6a5c965aa99ab525161efb7cc5cf1fe62fced/packages/schedule/schedule/src/index.ts), rather than moving master. See [native repair evidence](V03_NATIVE_REPAIR.md).

The adapter parses the version-pinned public reminder framing only for native schedule-sourced input and verifies the schedule/task pair. Contract tests render both reminder formats with the actual installed Schedule package. Mixed batches are refused in this alpha; each plugin-created task reserves its own Session. Keep plugin-managed Sessions dedicated to automated work.

The package has no private-core imports or patches. It registers exact authenticated owner-only Connection routes for both state operations and service-worker bytes. It does not assume the newer master WebServer `auth` option exists in the published version.

Upgrade procedure: back up data, stop Host, keep this pinned runtime, install new plugin tarball, run acceptance tests, restart. SQLite refuses a newer schema version instead of silently downgrading. Revalidate any Harness upgrade separately. Dynamic memory changes affect future assembly; historical request copies remain in native Session logs.
