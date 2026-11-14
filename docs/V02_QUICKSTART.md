# v0.2 native preview: install and connect

There is no provisioned production Personal Agent service URL yet. The repository contains buildable clients and an operator runtime, not an automatically hosted service. A preview binary cannot complete pairing without an authorized managed authority. Do not provide model keys to a phone or commit signing material.

## Tested preview downloads

These Actions artifacts expire on 2026-11-28. They are development previews; no production service or physical iPhone build is included. Checksums/source run metadata are in [the evidence manifest](evidence/v02-manifest.json).

| Build | Download |
|---|---|
| Desktop plugin, macOS-verified | [Tested tarball](https://github.com/abwoo/-DeepSeek-Always-on-Personal-AI-Agent-Plugin/actions/runs/43582100686/artifacts/14108592919) |
| Desktop plugin, Windows-verified | [Tested tarball](https://github.com/abwoo/-DeepSeek-Always-on-Personal-AI-Agent-Plugin/actions/runs/43582100668/artifacts/14108369928) |
| Android development APK | [Native APK](https://github.com/abwoo/-DeepSeek-Always-on-Personal-AI-Agent-Plugin/actions/runs/43581463951/artifacts/14109095839) |
| iOS Simulator application | [Simulator only](https://github.com/abwoo/-DeepSeek-Always-on-Personal-AI-Agent-Plugin/actions/runs/43581463951/artifacts/14109001682) |

## End user flow after the service is provisioned

1. Install the tested Desktop tarball from the macOS/Windows Actions artifacts using the initialized official Desktop app's own command (quit Desktop before installing, then reopen it): `dsh plugin --profile desktop add /absolute/path/abwoo-deepseek-always-on-desktop-0.2.0-dev.1.tgz`. The global npm `dsh` manages another profile. On macOS the verified bundled command is inside `DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh`; use the actual application location.
2. Open **Personal Agent**, enter the operator's trusted HTTPS address and five-minute one-use code, and pair. The original Desktop workspace remains local; use Personal Agent for shared remote tasks/conversations. Remote IDs are not copied into that local workspace.
3. Install the independent Android preview APK. It uses a development signing key and is not a Play Store release. The current iOS artifact is for Simulator only; a physical iPhone build needs authorized Apple signing/provisioning through the operator's actual Expo project.
4. In Desktop's **Devices**, issue a code for the phone. Pair in the phone app with the same service address. Confirm task/Session IDs agree across both devices.
5. Create a bounded read-only task or ongoing goal. Use Tasks to inspect runs, pause or cancel. Save memory only after explicit consent. Conversations show actual native Session input/messages, not synthesized model output.
6. Enable native notifications from the installed phone app after the operator provisions Expo/APNs/FCM. Inbox remains authoritative if push fails. Devices can display notification delivery state and revoke access. A provider ticket is not evidence of physical receipt.

Closing a client does not stop an independently hosted Harness. This behavior has engineering evidence; the requested physical-phone → actual Desktop → Desktop power-off → real DeepSeek → native push → same result production chain has not passed.

## Operator prerequisites

Use the single-replica runtime in `deploy/managed`, with durable `/data` and `/config`, a trusted HTTPS domain/certificate, `DEEPSEEK_API_KEY` and an officially supported `DEEPSEEK_MODEL`. Issue the initial code from the private console with `node scripts/managed-admin.mjs pair-code`. End users receive an address/code and do not buy or maintain a Linux VPS.

For native push, configure `ALWAYS_ON_EXPO_PUSH_ENABLED`, `ALWAYS_ON_EXPO_PROJECT_ID`, `ALWAYS_ON_EXPO_ACCESS_TOKEN`, enhanced push security, actual APNs/FCM credentials and matching native application IDs. Mobile `EXPO_PUBLIC_EAS_PROJECT_ID` is public project metadata; it is not a provider/model secret. Android's real Google Services file and Apple physical signing are supplied through secure platform configuration.

The optional real-model Actions gate uses secret `ALWAYS_ON_DEEPSEEK_API_KEY` and variable `ALWAYS_ON_DEEPSEEK_MODEL`. It records a blocker when absent, never a fixture success. Passing a GitHub runner test does not provision a 24-hour service. Native phone signing, real devices and the official Desktop dependency review in `V02_SECURITY.md` remain release gates.

## 中文使用说明

目前还没有可直接使用的托管服务地址。Android 可下载开发预览 APK，Desktop 可下载经过原生测试的插件包；iOS 模拟器包不能装到你的 iPhone。真实 iPhone 还需要 Apple 签名配置。

服务运营者完成托管部署后，你只需在电脑的 **Personal Agent** 面板输入服务地址和一次性配对码，再从 **Devices** 给手机生成配对码。手机和电脑会读取同一托管 Harness 的任务、记忆、Inbox 和真实 Session；原生 Desktop 原有的本地工作区仍是本机数据入口。

普通用户不需要买或维护 VPS，也不需要在手机填写 DeepSeek API Key。模型密钥、推送项目和签名由运营者配置。当前缺少这些外部授权与真机证据，因此不能标记为 MVP Ready。
