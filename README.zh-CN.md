# DeepSeek Always-on

[最新原生启动与聊天修复](docs/V03_NATIVE_REPAIR.md) · [完整工程验证](docs/V03_ENGINEERING.md) · **MVP Ready: false**

**v0.3 开发候选版：** 已加入双端账号登录入口、账号独立 Harness 分配、原生事件更新和运营端部署／恢复工具。[实施与验收记录](docs/V03_ACCEPTANCE.md) · [运营者交接与用户流程](docs/V03_HANDOFF.md) · [基线审计](docs/V03_AUDIT.md)。**尚无已上线的登录服务，也未交付真实 iPhone 分发版或标记 MVP Ready。** 下文保留 v0.2 与已发布的 v0.1 Web alpha 记录。

**v0.2 正在开发：** 已实现托管 Harness 设备网关、可配对的原生 Desktop 面板、独立 React Native / Expo 手机工程，以及持久化原生推送队列，复用原有调度、Memory、Inbox 和 Run Ledger。**尚未部署生产服务，也未完成真实手机、真实模型和原生推送的发布验收。**

阶段记录：[托管端](docs/V02_PHASE2.md) · [手机原生应用](docs/V02_PHASE3.md) · [跨设备共享](docs/V02_PHASE4.md) · [原生通知](docs/V02_PHASE5.md) · [发布门槛](docs/V02_PLAN.md)。下文保留的 Web/PWA alpha 安装方法不代表 v0.2 原生手机 App 已交付。

[原生预览安装、配对与当前阻塞](docs/V02_QUICKSTART.md) · [安全检查范围](docs/V02_SECURITY.md)
[v0.2 验收矩阵与下载](docs/V02_ACCEPTANCE.md)

[English](README.md) · [开发计划](PLAN.md) · [验收记录](docs/ACCEPTANCE.md)

DeepSeek Harness / Cordis 原生个人智能体插件。手机和电脑访问同一个云端 Host，共享任务、记忆与收件箱。复用官方聊天、Agent、Session、Schedule 和工具，不引入独立 Agent Runtime。

**当前版本：0.1.0-alpha.2，工程验收通过，真实部署待验收，尚未标记 MVP Ready。** 仓库不等于已部署的常驻服务器。GitHub Actions 负责构建和测试；真实模型调用、托管服务和设备推送由服务运营者配置，最终用户不需要购买或维护 VPS。

**下文是旧版 Web alpha 的开发者配置，不是 v0.3 普通用户的登录安装流程。** v0.3 托管服务和 iPhone 真机分发仍待外部授权；具体事项见[交接文档](docs/V03_HANDOFF.md)。

安装要求 Node 24.9+ 与固定的 `@deepseek-ai/dsh@0.2.2-rc.3`。完整命令见英文 README。运行 `npm ci`、`npm run check`、`npm pack` 后，通过 `dsh plugin --profile web add <包路径>` 安装，再启动 `dsh web`。

官方侧栏新增「持续智能体」，包含智能体、任务、记忆、收件箱。支持一次性、按间隔和每天的任务；默认上限为总共 30 次、每次 8 个模型步骤、180 秒。后台只允许明确授权的官方网页搜索、网页读取，以及插件自身结果报告和记忆检索工具。外部发布、邮件、购买和 Shell 等操作不能通过此后台任务通道执行。

记忆需要用户明确同意。Agent 从聊天中提出的记忆先进入待确认列表，点击确认后才能跨会话检索。删除后不再用于未来检索和新的提示词组装；已经写入会话历史或模型服务商记录的内容不被追溯删除。

Inbox 为通知的权威副本。Web Push 为可选投递渠道，需要 Host 上的 VAPID 环境变量、HTTPS 与设备授权。iPhone 需要 iOS 16.4 或更新版本并添加到主屏幕。推送失败不删除结果，锁屏只显示通用更新提示。

任务成功必须同时满足：报告业务结果、原生模型回合成功结束、Session 刷盘成功。调度消息成功投递不算完成。崩溃时未完成的任务标记为中断，本版不自动重放；用户查看原生会话后可明确启动下一次执行。不承诺严格的恰好一次执行。

手机和电脑必须打开同一个 HTTPS Host。本地 Harness Desktop 与云端 Host 不自动同步。服务器部署、身份验证和私有数据目录配置见 [部署文档](deploy/README.md)。仅支持同一配置目录的单 Host 写入。

自动化测试覆盖组件、原生接口、真实 Harness 页面与重启。真实 DeepSeek 调用、持续服务器运行和真机推送的验证状态见 [验收记录](docs/ACCEPTANCE.md)。这是社区独立插件，并非 DeepSeek 官方产品。MIT 许可证。
