# DeepSeek Always-on — MVP plan

The current native Desktop / managed Agent / Expo roadmap is [v0.2 plan](docs/V02_PLAN.md). Its [Phase 0 native feasibility evidence](docs/V02_PHASE0.md) is verified; the original Web MVP plan below remains historical scope. v0.2 is not MVP Ready.

2026-11-14 · Version 0.1 · Native Harness / Cordis plugin

## Product and architecture

One user, one persistent Linux Harness Web Host, many browsers. iPhone/Android and macOS/Windows access the same authenticated HTTPS URL and native Sessions. Harness is the only Agent runtime. No OpenClaw, no independent chat app, no Harness core fork. The model wakes for authorized work rather than reasoning continuously.

`Browser → authenticated HTTPS gateway → Harness Web → Always-on plugin → native Schedule / Agent / Session / tools → configured DeepSeek model`

All authoritative state remains on durable Host storage. A native Desktop local Host is separate; remote Desktop synchronization is deferred.

## Scope

P0: native plugin installation/removal, always-on deployment, multi-device UI, native persistent schedules, run ledger, interrupted-run detection, consented personal memory, persistent goals represented by scheduled tasks, bounded proactive checks, source deduplication, durable Inbox, optional Web Push, authorization, read-only tool policy, limits and deployment documentation.

P1: native phone apps, SaaS billing or tenancy, independent agent frameworks, unlimited research loops, multi-agent orchestration, screen capture or always-listening, browser/terminal rewrites, cross-Host synchronization, vector databases and automatic memory consolidation.

## Modules

1. **Host integration:** Cordis lifecycle, service registration, public events, pinned package compatibility. No new Agent loop.
2. **Task coordinator:** native Schedule owns recurrence; SQLite owns task policy and per-occurrence run ledger. Track queued → running → completed / failed / needs approval / interrupted / unconfirmed. Store Session, turn, result reference, timestamps and attempts. Treat delivery, model termination and business result as different facts. Deduplicate before model work; never blindly replay side effects.
3. **Memory:** fact/preference/project/goal records with source, consent and update time. List/edit/delete, structured keyword search and a bounded current prompt section. Model proposals need explicit UI confirmation. No built-in academic terminology dictionary or external vector system.
4. **Proactivity:** user-authorized goal → native schedule → relevant memory and previous results → native model/tools → explicit result report → durable terminal confirmation → deduplicated Inbox. Silent no-change checks. Default read-only web tools; finite run/step/time budgets. Actual token and monetary caps require further implementation and must not be claimed.
5. **Notifications:** authoritative Inbox with shared read state; Web Push using a service worker, Push API and VAPID. Generic lock-screen text, provider validation, bounded retries, dead-subscription removal. iPhone Home Screen installation and permission required.
6. **Client:** native sidebar/main slots. Agent, Tasks, Memory, Inbox. Mobile single-column layout, large touch targets, host-aligned controls, English/Chinese labels. No replacement chat or second root app.

## Phases and release gates

| Phase | Work | Required evidence |
|---|---|---|
| 0 | Pin public interfaces, build bundle, install/reload/unload | Real Harness loads service and native UI without core edits |
| 1 | HTTPS, access gateway, durable volume, process restart | Same Session on phone/desktop; devices offline do not stop Host |
| 2 | Ledger, dedup, pause/resume/cancel, recovery | Offline execution, delivery vs result separation, crash classified honestly |
| 3 | Consented memory, bounded goal checks, source dedup | Cross-session memory, deletion, silent unchanged check, new finding recorded |
| 4 | Inbox, VAPID, service worker, responsive UI | Persistent cross-device messages and real authorized-device push |
| 5 | Fault injection, resource limits, packaging, docs | All P0 checks and real-device scenario evidence; then release MVP |

## Acceptance scenarios

A. Phone creates daily research task → stores on Host → closes browser → native Schedule triggers → model executes → result and run ledger flush → phone/desktop later see same result.

B. Authorized ongoing goal → first check → identical second check is silent → new relevant third check → sources and result saved → one Inbox entry → optional push → opens same task/session.

C. Host killed mid-run → restart → incomplete state recognized → inspect native log → safe bounded retry only where evidence allows → no blind external-write replay → truthful final Inbox status.

Additional gates: network reconnect; normal restart; duplicate delivery; cross-session memory; deletion; unauthorized HTTP rejection; high-risk tool denial; plugin disable; compatible update; private credentials; durable backups; API timeout; mobile and desktop layout.

## Freeze principle

Do not label v0.1.0 “MVP Ready” until the complete real-world chain has evidence: user offline → Host keeps working → completion or explicit failure → persistence → proactive delivery → continued use on another device. A mock model, passing unit tests or a green build alone is insufficient.

The initial release is an alpha until server provisioning, real DeepSeek credentials, native end-to-end model execution, real-device push, and remaining resource/compatibility gates are verified. npm and GitHub releases must describe exactly the evidence obtained.
