# Linux deployment

A GitHub Actions job does not provide always-on hosting. Provision a Linux machine with persistent storage, Node 24.9+, an HTTPS domain and an authenticated access gateway. This repository does not provision a paid server.

1. Create an unprivileged `deepseek-agent` account and private `/var/lib/deepseek-always-on` profile/data directories. Install the fixed runtime and built plugin in `/opt/deepseek-always-on` using the README commands under that account.
2. Configure DeepSeek credentials on the Host through Harness Settings. Configure optional VAPID variables in `/etc/deepseek-always-on.env` with mode 0600. Private values never belong in git or browser configuration.
3. Install the example systemd unit, adjusting its paths. It passes `deploy/headless.patch.yml` and sets `ALWAYS_ON_DOCUMENTS_DIR` to a private writable directory. This avoids native first-use workspace failures on Linux servers without an XDG Documents directory. Keep the Harness listener on **127.0.0.1** and firewall its port. Use an authenticated gateway (for example an identity-aware access proxy or private VPN) in front of the HTTPS reverse proxy. Preserve Harness token/Cookie authentication too.
4. Pass your real domain as `--public-url https://agent.example.com --trusted-host agent.example.com`. Do not put launch tokens in public logs. Serve at the origin root for this alpha.
5. Validate gateway sign-in, TLS, native Harness authentication and unauthenticated API rejection. On an iPhone, add the existing Harness Web App to Home Screen, log in and grant notifications from Inbox. Ensure your gateway permits push-click navigation and authenticated service-worker fetching.
6. Test every real-world gate in `docs/ACCEPTANCE.md`, including closing every browser, receiving a real push, and continuing the same Session from another device.

The systemd unit is a template, not evidence of deployment. Do not expose the Shell-capable Host through an unprotected reverse proxy. Back up both the Harness profile and plugin state; see operations documentation.
