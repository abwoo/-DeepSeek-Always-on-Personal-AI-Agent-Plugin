# 0.1.0-alpha.2

Native DeepSeek Harness plugin with a durable run ledger, one-shot/interval/daily tasks, explicit memory consent, source-deduplicated Inbox, optional VAPID Web Push, and English/Chinese native sidebar panels.

Pinned runtime: `@deepseek-ai/dsh@0.2.2-rc.3`, Cordis 4.1.0, Node 24.9+. No core patches or replacement Agent loop.

The release package is an npm-installable tarball. Install it through `dsh plugin --profile web add <tarball>`. Registry publication is separate and requires a valid npm publisher identity.

This is a development alpha, **not MVP Ready**. A deterministic model fixture exercises the real native scheduling, Agent, tool and persistence chain in CI. Production requires a durable Host, authenticated HTTPS gateway, DeepSeek model credentials and real-device push validation. Token accounting thresholds are cooperative and do not replace a provider spending cap. Interrupted work is classified and never automatically replayed.

See the repository acceptance record and the workflow associated with the release commit for exact verification evidence.

This iteration adds an explicit Documents-directory override for headless Linux deployment and exercises a real Host SIGKILL/restart recovery path.
