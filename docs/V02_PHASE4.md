# v0.2 Phase 4 — One authority across paired clients

The default Desktop product path now uses the same narrow device protocol as the independent native Expo app. Each has its own revocable credential; neither copies remote Sessions into its local Harness. The existing operator-token SDK probe remains an explicitly enabled compatibility diagnostic only.

Desktop pairing calls the published Harness credentials service from its Host plugin. The renderer sees connection metadata, never the device bearer or model key. Credential resolution occurs on every operation. The protected provider is Harness-managed storage; this implementation does not claim that every platform provider uses an OS keychain. Pairing, device listing/revocation and issuing an expiring code for a second device are in the native panel. The operator initially supplies a managed HTTPS service address and one-use code.

Tasks, memory, Inbox and native conversations share the original authoritative data. Goals are durable product records linked to bounded native Schedule tasks, not undocumented `ctx.goals` entities. Native phone and Desktop both offer goal creation; task pause/cancel remains available in Tasks. Full snapshots and explicit refresh reconcile changes across devices. Foreground mobile polling is not background execution; the sole hosted Harness performs all background work.

Both clients persist operation metadata before writes. The authority stores admission/outcome before returning a durable receipt. Transport failure leaves a reviewable pending operation, not an automatic retry; reopening reconciles committed operations and preserves uncertain ones. Dismissing metadata after review does not undo or replay an operation. Device credentials can be revoked remotely.

The native compatibility workflow now pairs the actual signed macOS/Windows Desktop product panel against a second Harness process and verifies that an independent mobile-protocol client reads the same task and real Session events. It also restarts Desktop and checks retained credential access and task identity. An independent protocol client is not physical-phone acceptance. Cloud deployment, real provider execution, phone signing/push and full physical release-chain verification remain separate gates.

Recent text conversations, task/session links and pending/running/error state are supported. Full attachments, approval-answer forwarding and desktop-local file/action delegation are intentionally unavailable. Unattended tasks retain the existing read-only tool boundary; operations requiring interactive native approval are not silently authorized.

Additional native UI acceptance creates an ongoing goal through the Desktop form and confirms the linked bounded native task from an independent protocol client. Device management issues a one-use code through the actual panel; claiming it must yield the same authority. Test-only loopback transport is explicit and is not production TLS acceptance.
