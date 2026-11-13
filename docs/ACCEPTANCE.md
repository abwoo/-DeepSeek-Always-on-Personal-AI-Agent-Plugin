# Acceptance evidence

Status: **alpha — not MVP Ready**. This file defines claims; current GitHub Actions logs are the source for actual pass/fail status at a specific commit.

| Requirement | Automated coverage | Real-world gate |
|---|---|---|
| Native plugin service/lifecycle | Real Cordis + real Harness Web launch | Installed production Host |
| Schedule API/framing | Installed native Schedule renderer | Real Harness scheduled execution passed with a deterministic model adapter; real DeepSeek remains a gate |
| Cross-device state | Two independent authenticated browser contexts | Phone and desktop on deployed HTTPS Host |
| Persistence/restart | SQLite reopen and real Host restart | Durable server disk and backup restore |
| Delivery vs execution | Report pending until native terminal and flush | Native turn, real tool execution and Session flush passed with test adapter; real DeepSeek remains a gate |
| Crash recovery | Interrupted ledger cannot become success or replay | Kill actual model turn and inspect restored native Session |
| Dedup and bounded work | Occurrence uniqueness, run limits, silent repeats | Model/permission integration and cost observation |
| Memory consent/deletion | Proposal excluded until confirmed; deletion excludes retrieval | New real model session uses current memory |
| Inbox/Push failures | Inbox persistence, expired endpoint handling | Authorized iPhone/Android system push |
| Unauthenticated HTTP | Real Harness returns 401/403 | Gateway, TLS and firewall validation |
| Mobile interface | Real Harness at 390px; desktop at 1440px | Safari iPhone and Android Chrome |
| Packaging | npm pack + uploaded tarball | npm publication requires publisher identity |

Known gaps: no configured permanent cloud server, domain, TLS gateway or real DeepSeek key in this task; no real mobile push subscription; interrupted work is never automatically retried; full token/monetary caps and native goal-service linkage are deferred; mixed reminder batches fail closed. Model reports are declarations backed by links and native logs, not independent truth validation. These gaps prevent MVP Ready.

CI must retain its logs, browser reports and screenshots as artifacts. Never copy credentials or tokenized launch URLs into public artifacts. The browser test authenticates with disposable local test credentials and no paid model calls.

Local validated evidence (2026-11-14): type checking and build passed; 20 component/native-contract tests passed; real Harness offline scheduling with the deterministic adapter passed in 67 seconds, producing a confirmed run and Inbox without a browser. Production dependency audit after updating Zod: zero reported advisories. Browser verification continues in GitHub Actions because local Chromium was blocked by the execution environment.
