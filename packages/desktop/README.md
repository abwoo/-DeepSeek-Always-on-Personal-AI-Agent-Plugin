# Always-on Desktop — v0.2 development preview

Native Cordis Host/Client extension for the official macOS/Windows DeepSeek Harness Desktop, pinned to Harness 0.2.2-rc.3 and Cordis 4.1.0. Its Personal Agent panel accesses one independent managed Harness authority, shared with the independent native Expo phone app. It never copies remote Sessions into Desktop's local Host.

Build from repository root: `npm ci`, `npm run build`, `node scripts/build-desktop.mjs`, `npm pack ./packages/desktop --ignore-scripts`. Quit the actual initialized Desktop application, then use its own bundled command:

```bash
dsh plugin --profile desktop add /absolute/path/abwoo-deepseek-always-on-desktop-0.2.0-dev.1.tgz
```

The global npm CLI does not manage Desktop's profile. Open Personal Agent and pair using the operator's HTTPS service address and one-use code. The Host plugin saves its independently revocable bearer in Harness's credentials provider; the renderer never receives it. No user model key or VPS administration is needed. A production managed service has not yet been provisioned.

Agent/tasks, explicit-consent memory, Inbox, recent native text conversations, ongoing goals and paired-device management operate against the same authority as mobile. Create a one-use code under Devices to pair another device. Remove device access revokes the credential before deleting it locally. Uncertain operations are retained for review and never automatically replayed. Dismiss after inspecting the remote task/Session, then refresh.

The former operator-token mode remains available only when `ALWAYS_ON_DESKTOP_OPERATOR_PREVIEW=1` plus its remote origin/token are explicitly configured. This is a disposable compatibility diagnostic, not the default end-user connection. Insecure loopback is allowed only with an explicit test flag; production requires trusted HTTPS.

This is a private development package, not an MVP Ready release. Full conversation attachments/history/approval answering, local file/action delegation and native Desktop notification delivery are not certified. The mobile push channel requires actual Expo/APNs/FCM configuration and physical devices. No synthesized model output or second Agent loop exists. See `docs/V02_PHASE4.md` and the release gates before distribution.
