# v0.3 native repair — verified engineering continuation

**Engineering Preview; MVP Ready: false. Production T01–T22 remain Blocked.** PR #6 repairs the captured startup failure and native conversation leakage. It does not deliver a live account service, real-provider execution or a physical-phone release.

## Startup failure and recovery

Creating a delayed task, closing Desktop before its first delivery and reopening could leave the core API at 404 while Desktop itself remained available. [Two-profile reproduction, job 133043130973](https://github.com/abwoo/-DeepSeek-Always-on-Personal-AI-Agent-Plugin/actions/runs/43789067273/job/133043130973), captured this native error at boot 10:

> This Host cannot create Sessions; choose an existing Session target.

A `new_once` Schedule already has a reserved Session ID, but that Session may not yet exist in persistence. During recovery, native Schedule validates creation capability before rearming it. Schedule was ready before SessionController, and the rejection failed the entire core plugin. The same requirement is present in the [pinned 0.2.2-rc.3 source at 38a6a5c](https://github.com/deepseek-ai/deepseek-harness/blob/38a6a5c965aa99ab525161efb7cc5cf1fe62fced/packages/schedule/schedule/src/index.ts).

Core now explicitly waits for `sessionController`, retains the existing Task/Schedule/reserved Session identities and uses the original native edit operation. Its unused HTTP-server dependency is removed; Connection Fetch routes remain carrier-neutral. The Always-on service is published after native recovery, routing and hooks are ready.

Recovery also checks native acknowledgement identity/status/code. Negative, mismatched or still-paused resume receipts become explicit task errors rather than an active-task claim. An unconfirmed pause during interrupted creation is visible as an error. These cases retain their identities and leave the healthy API available.

Real Cordis/SQLite tests reproduce the old missing-dependency refusal, verify waiting and controller removal/restoration, and cover all four unconfirmed-receipt cases. Peer services in these lifecycle tests are fixtures; signed Desktop checks below are separate.

## Native conversation and observation repair

The previous runtime-context-only projection missed the native skill-catalog producer. Shared Desktop/mobile chat now omits model instructions, catalogs and snapshots according to native source metadata, and presents producer notice summaries. Exact user quotations, model replies, undeclared context and complete authoritative history are preserved.

The actual two-Harness account contract and Android OS controls verify that native catalogs remain in history while internal reminders disappear from ordinary chat. Native observation collection requires a fresh confirmed hierarchy, separates ADB diagnostic output from XML/image bytes, and retries unavailable observations without resetting the existing wait budget. Application assertions and persistent collection failures remain failures.

## Verified checks

| Check | Result and source | Inspectable run |
|---|---|---|
| Core unit/integration + browser | 82/82, zero skipped; 3 browser contracts; source `2a53833` | [43793514656](https://github.com/abwoo/-DeepSeek-Always-on-Personal-AI-Agent-Plugin/actions/runs/43793514656) |
| Two actual account-owned Harnesses, execution leases, proxy and coordinated backup fixtures | Passed; source `2a53833`; identity/model are fixtures | [43793514659](https://github.com/abwoo/-DeepSeek-Always-on-Personal-AI-Agent-Plugin/actions/runs/43793514659) |
| Managed authority/TLS/container fixtures | Passed; real DeepSeek remains unverified | [43793514598](https://github.com/abwoo/-DeepSeek-Always-on-Personal-AI-Agent-Plugin/actions/runs/43793514598) |
| Captured-race repair in two independent signed macOS profiles | 24 restarts each, 48 total; source `db00da0`; unchanged identity/authority assertions | [43790330720](https://github.com/abwoo/-DeepSeek-Always-on-Personal-AI-Agent-Plugin/actions/runs/43790330720) |
| Final signed macOS recovery | 4/4; source `49e64c9`; original Task/Schedule/Session IDs, active native catalog and rearmed status checked on every restart | [43794743975](https://github.com/abwoo/-DeepSeek-Always-on-Personal-AI-Agent-Plugin/actions/runs/43794743975) |
| Final signed Windows recovery | Passed; source `49e64c9`; same identity/rearming assertions | [43794744045](https://github.com/abwoo/-DeepSeek-Always-on-Personal-AI-Agent-Plugin/actions/runs/43794744045) |
| Android native forms and actual Harness state | Passed; source `2a53833`; app-absent fixture execution, shared chat, Memory/Goals/Inbox, native file/share chooser, reconnect and ordinary preview startup | [43793514641](https://github.com/abwoo/-DeepSeek-Always-on-Personal-AI-Agent-Plugin/actions/runs/43793514641) |
| iOS native Simulator build and startup | Passed in that mobile workflow; secure-storage startup checked; physical iPhone and account-backed iOS forms remain unverified | [43793514641](https://github.com/abwoo/-DeepSeek-Always-on-Personal-AI-Agent-Plugin/actions/runs/43793514641) |

Windows hosted-runner compositor capture failed for `native-plugin.png`, `native-remote-session.png` and `personal-agent.png`. Functional/API checks passed; those frames do not establish visual acceptance.

The final native probe requires both identity preservation and a genuinely active/rearmed native schedule, not merely a retained task row. Native Harness remains the only Schedule/Agent runtime. No model success is inferred from a prompt receipt.

## Evidence and retained failures

[Engineering manifest](evidence/v03-engineering/manifest.json) indexes 79 observations. Exact base64 raw records were recovered from workflow logs and are SHA-256 checked in CI. Uploaded ZIP digests are labeled as upload-reported unless an archive was independently downloaded. The core summary and two 24-restart summaries are explicitly labeled derived observations, with exact supporting log lines.

- Earlier macOS failures remain under `continuation-macos-failure`; the captured cause is retained under `native-startup-diagnosis/failed-9ca0985.json`.
- ef38ada/42bc886 Android collector failures before task forms remain under `native-context-repair`, with native-controls flags false. Later successes do not overwrite them.
- Latest raw records are under `native-final-macos`, `native-final-windows`, `native-final-mobile`, `native-final-runtime` and `native-final-accounts`.
- [Queue maintenance 43791183572](https://github.com/abwoo/-DeepSeek-Always-on-Personal-AI-Agent-Plugin/actions/runs/43791183572) cancelled only three unfinished obsolete experiments (43789878704, 43789878780, 43789705366). Completed failures were retained. The temporary maintenance workflow was removed; routine macOS checks use four restarts with superseded-run cancellation.

## Release boundary

These are engineering observations using local identity, deterministic model and disposable authorities. Development APK signing, Simulator signing and local-tarball Plugins installation are not production distribution. Real Auth0/DeepSeek, continuously hosted service, public plugin installation, physical phone/push, stable mobile signing and production security/operations acceptance remain required in the [operator handoff](V03_HANDOFF.md).

The [current production matrix](evidence/v03-engineering/production-current.json) remains fully Blocked; its T17 reason now separates the repaired engineering race from missing real-service/device restart acceptance. No v0.3 release tag, npm publication, deployment or MVP Ready claim is made.
