# DeepSeek Always-on

**v0.3 development candidate:** account-first Desktop/mobile onboarding, isolated account-to-Harness allocation, native event updates and operator deployment/recovery tooling are implemented on the v0.3 branch. [Current implementation and release gates](docs/V03_ACCEPTANCE.md) · [Baseline audit](docs/V03_AUDIT.md). **No production sign-in service, physical iPhone release or MVP Ready claim.** v0.2 and the published v0.1 Web alpha records remain below.

**v0.2 development is in progress:** a managed Harness device gateway, paired native Desktop panel, independent React Native / Expo app and durable native-push outbox are implemented. Existing task scheduling, memory, Inbox and Run Ledger are reused. **No production hosted URL or real-phone/model/push release acceptance is claimed.**

See [managed runtime](docs/V02_PHASE2.md), [native mobile](docs/V02_PHASE3.md), [shared devices](docs/V02_PHASE4.md), [native notifications](docs/V02_PHASE5.md) and [release gates](docs/V02_PLAN.md). The original Web/PWA alpha remains available below; it is not the v0.2 native phone delivery.

[Native preview setup and current blockers](docs/V02_QUICKSTART.md) · [Security scope](docs/V02_SECURITY.md)
[v0.2 acceptance and artifacts](docs/V02_ACCEPTANCE.md)

[简体中文](README.zh-CN.md) · [Development plan](PLAN.md) · [Acceptance evidence](docs/ACCEPTANCE.md)

A native **DeepSeek Harness / Cordis plugin** for persistent personal tasks, consented memory, a shared Inbox and Web Push. One cloud Host serves your phone and computer. Harness owns the model, chat, tools, Sessions and scheduling; this plugin does not implement an Agent loop.

**Status: 0.1.0-alpha.2 — engineering acceptance passed; production validation pending, not MVP Ready.** No hosted service, DeepSeek API credit or npm publication is included in this repository. GitHub Actions is a test runner, not a continuously running Host.

## Install

Requires pnpm on PATH, Node **24.9+** and exactly **`@deepseek-ai/dsh@0.2.2-rc.3`**. Preview APIs are version-sensitive; see [compatibility](docs/COMPATIBILITY.md).

```bash
git clone https://github.com/abwoo/-DeepSeek-Always-on-Personal-AI-Agent-Plugin.git
cd -- -DeepSeek-Always-on-Personal-AI-Agent-Plugin
npm install -g pnpm@11.28.5
npm ci
npm run check
npm pack
npx --package @deepseek-ai/dsh@0.2.2-rc.3 dsh plugin --profile web add "$PWD/abwoo-deepseek-always-on-0.1.0-alpha.2.tgz"
npx --package @deepseek-ai/dsh@0.2.2-rc.3 dsh web --no-open --host 127.0.0.1 --port 8080
```

Open the launch URL locally to authenticate. Configure your DeepSeek model and credentials through Harness Settings. On a server use an authenticated HTTPS gateway; read [deployment](deploy/README.md) before exposing any endpoint. Phone and desktop must access **the same Host URL**. A local Harness Desktop installation is a different Host.

The **Always-on** sidebar entry contains Agent, Tasks, Memory and Inbox. Create a once, interval or daily task. Tasks have dedicated Harness Sessions and default to 30 lifetime runs, 8 model steps per run a 180-second timeout, a 2,048-token per-request output cap and a 50,000 reported-token per-run budget. The total-token threshold stops the next request after provider accounting arrives; one request can overshoot it. Missing accounting stops further model steps. Only explicitly selected built-in `web_search` / `web_fetch` tools plus the plugin's report/retrieval tools are permitted during an unattended run. No shell, outbound writes, purchasing, publishing or email dispatch is admitted. Unsupported actions remain interactive Harness work.

## Memory and notifications

Add a memory in the panel and explicitly consent to cross-session use. Chat's `always_on_memory_propose` tool proposes a memory; it becomes retrievable only after you confirm it in the panel. Search is keyword-based; approved memories form a small dynamic system-prompt section. Deletion stops future retrieval and prompt assembly; it does **not** erase historical model requests, backups, or provider records.

The Inbox is the authoritative notification record. Optional Web Push needs `VAPID_SUBJECT`, `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` in the Host environment. Generate a key pair on the server with `npx web-push generate-vapid-keys`; never commit private keys. Enable notifications with a user gesture in Inbox. On iPhone install the Harness Web App on your Home Screen first (iOS 16.4+). Revocation and provider failures do not remove Inbox results. Lock-screen payloads contain a generic update only.

## Reliability contract

- Native Schedule delivery is **not completion**. A run becomes completed only after `always_on_report`, a successful native `turn/end`, and successful Session flush.
- A unique task/occurrence pair prevents the same occurrence from being admitted twice. SQLite transactions persist run admission before model work.
- A crash before final confirmation marks the run interrupted on restart. This alpha never automatically replays interrupted work. Inspect the Session, then explicitly start a new occurrence if appropriate.
- No-change checks stay in run history without notifying. Repeated source sets are suppressed across runs.
- Disabling the plugin pauses its owned schedules on graceful teardown. Stored native reminders contain only a trigger, never the underlying task instruction, so an absent plugin cannot disclose the task to an uncoordinated turn.
- This is **not exactly-once execution**. The model's acknowledgment is a reported business outcome, not an independently verified external-world guarantee.

SQLite WAL state lives in `ALWAYS_ON_DATA_DIR` or the profile's `always-on/` directory. Keep the entire Harness profile and plugin data on durable, private storage. One writer Host per profile is supported. See [operations](docs/OPERATIONS.md).

## Development

```bash
npm ci
npm run check
# Installs the bundle in a disposable test profile:
DSH_HOME="$PWD/.artifacts/dsh" npx dsh plugin --profile web add "$PWD"
npx playwright install chromium
npm run test:e2e
```

E2E launches the published real Harness Web profile, installs this bundle, exercises authenticated API access, mobile UI, cross-device state and Host restart. It does not spend API credits or claim real iPhone push delivery. CI uploads the npm tarball, browser reports and screenshots. [Acceptance status](docs/ACCEPTANCE.md) separates component, native integration, browser and real-device evidence.

MIT licensed. This is an independent community plugin, not an official DeepSeek product.
