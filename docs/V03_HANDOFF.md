# v0.3 operator handoff and user experience

**Candidate only, not a live service or MVP Ready.** Original implementation source: `95793a60d3475be5b36a425562cb4065daba19f1`. See [acceptance](V03_ACCEPTANCE.md) and [evidence manifest](evidence/v03/manifest.json). Latest policy/proxy implementation: [stabilization](V03_STABILIZATION.md). Subsequent export, client and runtime evidence: [engineering stabilization](V03_ENGINEERING.md). Existing alpha releases remain unchanged. Ordinary users should not be asked to deploy or configure infrastructure.

## Current deliverables

- Account controller using one Auth0 OIDC code+PKCE flow, encrypted server state, rotating per-device credentials and restricted account-owned routing.
- Automatic allocation across independent persisted native Harness profiles. Native Harness remains the only Agent runtime.
- Official Desktop plugin and independent Expo/RN app, account-first screens, shared Sessions/Tasks/Goals/Memory/Inbox/Activity/Devices, bilingual themes, live native event frames and honest error/unknown/history states.
- Docker/Compose/Caddy service, AWS infrastructure candidate, migration/adoption, encrypted coordinated backup and explicit release gates.
- Tested Desktop tarballs, development APK and iOS Simulator binaries in linked Actions. These unconfigured previews are for developers, not a working hosted product. APK uses a development key; Simulator binary cannot be installed on an iPhone.

## Required operator authorizations

No secret should be pasted into a public issue, Git commit, screenshot or application settings. Supply private credentials through the authorized platform secret manager, operator secret-file mounts or repository Actions secrets as appropriate.

| Required item | Specific purpose / location | Still missing |
|---|---|---|
| Cloud account and approved regional resource budget | Review `deploy/aws/main.tf`; actual VPC/subnet/AMI/instance size, EC2/EBS/EIP/SSM; continuous compute, not Actions | Account authorization and paid-resource decision; no apply performed |
| Public service domain | DNS, trusted public HTTPS callback and client discovery | Actual domain/ownership/DNS/TLS |
| One Auth0 tenant + regular web application | Issuer/client ID in private control config; client secret in `auth0-client-secret`; exact callback `https://SERVICE/account/v1/callback`; rotating refresh/offline access | Tenant/application authorization, connections/recovery policy, two real test accounts |
| DeepSeek funded operator account | `deepseek-key` mount; actual verified `DEEPSEEK_MODEL`; provider spending limit | Key, funded usage authorization and model ID |
| Controller/leaf encryption and provisioning secrets | `control-encryption-base64`, distinct per-leaf provisioning keys and private TLS certificates; independent offline backup key | Generate/store privately during authorized deployment |
| Expo/EAS project | Public project ID in native build; server access token in `expo-token`; matching app identifiers | Authorized project and push access |
| Firebase/FCM | Matching Android application/project and service credentials in authorized Expo service | Firebase/FCM authorization and actual receipt test |
| Apple Developer/App Store Connect | Team, certificates/profiles, APNs, TestFlight; `com.abwoo.deepseekalwayson` after actual ownership check | Authorized Apple team/app/signing and physical iPhone |
| Android signing/distribution | Preserve one stable authorized key and package `com.abwoo.deepseekalwayson`; internal testing | Stable signing account/key and physical Android |
| npm publication | `@abwoo/deepseek-always-on-desktop`, reviewed version/peer compatibility and private flag change only when ready | Namespace/publication authorization and supported live install address |
| Operations/privacy | Verified alert recipient, spending policy, retention/deletion/export and backup rotation | Actual destinations/policies and production rehearsal |

## Ordered continuation after authorization

1. Review actual cloud plan/cost and obtain the relevant paid-resource approval before applying. Terraform schema validation already runs; it is not deployment. Keep encrypted remote Terraform state and a reviewed provider lock. Follow [AWS instructions](../deploy/aws/README.md) for durable volume/Docker data-root setup without formatting existing data.
2. Follow [control deployment](../deploy/control/README.md) to configure real Auth0 callback, exact trusted edge, independent private TLS leaves and secret mounts. Start two isolated Harness profiles. Verify no owner/operator API is public; do not repurpose an unverified V02 user's volume. Existing-user adoption requires stopped Host, verified account ownership and checkpoint.
3. Prove new-account automatic allocation/reuse and two real users' resource isolation. Persist authority/owner/account correlations privately in test records. Check refresh, restore, logout/re-login, revocation and queued upstream cleanup; don't infer this from a fixture test.
4. Set actual public `config/public-service.json` origin only after domain/service verification. Configure real Expo project public metadata and private APNs/FCM credentials. Rebuild both native clients from the recorded source; never ship server keys/owner token. No end-user address/code entry is introduced.
5. Configure server-side real model secret and verified model ID. Optional Actions provider gate uses `ALWAYS_ON_DEEPSEEK_API_KEY` secret and `ALWAYS_ON_DEEPSEEK_MODEL` variable. A CI provider pass alone does not prove continuous hosted execution or a physical push.
6. Keep an independent encrypted checkpoint and restore test, provider monetary cap and real alerts. Record the exact deployed SHA for the checkpoint utility; it validates existing volumes and resumes only previously running services. Use the schema-2 operator suspension/disable commands and verify the private execution acknowledgement plus native schedule status. `stop_pending` is a failure to confirm, not a stopped-runtime claim. Account authorities require fresh ≤30-second execution leases and `ALWAYS_ON_ACCOUNT_EXECUTION_REQUIRED=1`; upgrade core/managed/controller together before relying on this behavior. Already dispatched calls and infrastructure charges remain possible. See the operator deployment guide for safe rollout and exact edge trust. Rehearse migrations and whole-checkpoint rollback, never restore mapping alone.
7. Complete actual Plugins GUI public-target install/update/uninstall on signed macOS/Windows. Publish the Desktop package only after publication permission and service availability; do not relabel old alpha releases.
8. Build Android with stable authorized signing and iOS with actual Apple provisioning/TestFlight using the EAS/native project. Register signing fingerprints and matching push projects. Do not distribute the development debug APK as a durable release or Simulator app as an iPhone package.
9. On actual iPhone and Android, exercise account restore, every native form/button, long content/keyboard, offline reconnect, historical navigation and persisted backend readback. Observe the same Session/Task/Goal/Memory/Inbox IDs from actual Desktop. Test another account's denied access for every resource type.
10. Run T01–T22 with source SHA, exact builds/platforms/times and redacted evidence. Specifically phone creates Task → Desktop reads same ID → close phone and power Mac off → hosted native Schedule/DeepSeek/tool/report/terminal/flush → Inbox + Expo/APNs/FCM → phone physically receives and tap opens same historical Run/Session → Desktop shows same result. Record provider receipt and physical receipt separately.
11. Only after all real gates pass and vendor Desktop dependency applicability/remediation is reviewed, update `production.json` with genuine Level 5 evidence, execute `node scripts/verify-v03-release.mjs --require-ready`, review evidence and authorize the formal release. The script alone never creates a Ready claim.

## Expected ordinary-user flow after those gates pass

**English:** In official Harness Desktop open Plugins, install DeepSeek Always-on, enable it, open Personal Agent and choose Sign In. In the independently installed mobile app choose Sign In with the same account. The service automatically finds the same Agent. Create a task, review its allowed tools/budget and receive notifications after granting OS permission. Logout revokes this device access; hosted tasks are not deleted by removing the local plugin/app. Those tasks must be paused/cancelled explicitly.

**中文：** 在官方 Harness Desktop 的 Plugins 中安装并启用 DeepSeek Always-on，打开 Personal Agent 后登录。手机安装独立 App，登录同一个账号，就应自动连接同一个 Agent。创建任务时确认允许的工具和预算，授予系统通知权限后接收结果。注销撤销当前设备访问；卸载本地插件或 App 不会删除云端持续任务，需先明确暂停或取消。普通用户不配置服务器地址、配对码、端口或模型密钥。

**现在尚不能按此流程日常使用：** 服务尚未真正部署，Auth0/模型/推送授权未配置，iPhone 真机签名未取得。当前产物只证明对应工程构建和测试，不能代替实际手机、账号、DeepSeek 和原生推送的完整验收。
