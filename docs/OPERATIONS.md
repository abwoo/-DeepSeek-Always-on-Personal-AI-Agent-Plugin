# Operations

Run one Host writer per profile/data directory. Stop it before restoring or upgrading. Back up the **entire Harness profile**, including Sessions, credentials and native Schedule storage, and the plugin data directory. Use SQLite's online backup API or stop the Host before copying SQLite files; copying only a live main database while ignoring WAL can lose committed data. Encrypt backups and restrict them to the server owner.

On restart, in-progress/queued ledger rows become interrupted and produce Inbox notices. The alpha does not infer external-world success from missing events, does not replay an old occurrence and does not automatically retry model work. Look at the native Session before using Run now, which creates another native occurrence.

Graceful plugin teardown cancels active plugin task Agents, waits for tracked flush/notification work and pauses owned schedules without deleting task policy or memory. Plugin reactivation rearms only tasks whose persisted policy remains active. Cancelled/paused tasks do not rearm. An abrupt Host kill may leave schedules active, but they contain only a marker; absent the plugin they contain no task instruction.

The task ledger and notification outbox share local SQLite transactions. Web Push is best effort and may be delivered more than once when delivery is uncertain; Inbox is authoritative and notification tags collapse repeated generic updates. Push provider keys belong in a private environment file, never GitHub Actions logs or client bundle configuration.

Memory deletion stops future retrieval. It does not purge already logged prompts or backups. Uninstalling the bundle leaves persistent data intact. Disable/uninstall through native Harness Plugins / CLI, and remove storage only when intentionally retiring the Host and after backup.

This alpha bounds each task by lifetime runs, steps and elapsed time. Native model output limits still come from Harness configuration. It does not provide an independently enforced monetary budget; configure provider spending caps before unattended production use.
