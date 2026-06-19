# Deliberum

Deliberum 是一个本地优先的“你 + AI 参与者”多视角审议产品。当前本地 Web 帮助你把一个问题交给已配置的 AI 参与者，从不同角度形成独立观点，再汇总为可检查的当前结论、分歧、证据缺口、风险和下一步建议。它还没有实现邀请、分享或多人加入同一个房间。

英文 README 是默认维护版本；这份中文 README 面向想快速上手的中文用户。

## 应该先看哪篇文档

- 想直接运行本地 Web 产品：看 [快速开始](docs/zh-CN/GETTING_STARTED.md)。
- 想了解英文默认路径：看 [Getting Started](docs/GETTING_STARTED.md)。
- 想了解最新发布范围：看 [v1.1.3 Release Notes](docs/V1_1_3_RELEASE_NOTES.md)。
- 想了解 v1.0 历史范围：看 [v1.0 Release Notes](docs/V1_0_RELEASE_NOTES.md)。
- 想了解本地或预生产部署：看 [Deployment](docs/DEPLOYMENT.md)。
- 想了解架构：看 [Architecture](docs/ARCHITECTURE.md)。

## 最短本地运行路径

需要：

- macOS、Ubuntu Linux 或原生 Windows；
- Node.js 24 或更高版本；
- Corepack；
- 通过 Corepack 使用 pnpm 11；
- 如果要使用真实模型讨论，需要 OpenAI-compatible provider 的 API key、base URL 和 model。

GitHub CI 现在通过主 `Validate` job 覆盖 Ubuntu Linux 的完整本地启动
smoke，并通过专门的 `Local start` 平台 job 覆盖 macOS 和原生 Windows。
WSL2 可能可以运行，但在本地启动路径进入 CI 验证前，不属于 v1.1 支持平台。

在 macOS 或 Ubuntu Linux 的仓库根目录运行：

```bash
sh scripts/start-local-product.sh
```

在原生 Windows 的仓库根目录运行：

```bash
node scripts/start-local-product.mjs
```

这些命令会先检查 Node.js 和 Corepack 是否可用，然后调用受支持的首次运行 helper，安装依赖、构建 Deliberum，并启动本地 Web 服务。保持这个终端运行，然后打开：

```text
http://127.0.0.1:3877/
```

macOS/Linux 的 shell 入口会继续调用
`node scripts/start-local-product.mjs`。

如果你想手动逐步执行，也可以运行：

```bash
node scripts/check-local-prerequisites.mjs
corepack pnpm install
corepack pnpm doctor:local
corepack pnpm build
corepack pnpm start:local
```

保持 `start:local` 终端运行，然后打开命令输出里的本地 URL。

## 在 Web 里配置模型

打开：

```text
http://127.0.0.1:3877/setup/models
```

在 Configure OpenAI-compatible provider 里填写 API key、base URL 和 model，保存后点击 Verify connection。

默认 Web 界面不应该显示 API key、provider config id、env var 名称、原始 JSON、run/session/ledger/runtime/proposal/event/internal id。低层诊断信息只应在 Advanced / Developer Mode 中查看。

## 开始一次模型讨论

provider 验证通过后，可以在 Connect AI 里选择：

- Start focused discussion：两个模型视角；
- Start broader discussion：三个模型视角。

也可以打开：

```text
http://127.0.0.1:3877/runs/new?participants=model-backed
```

填写讨论问题，创建讨论，然后在 Discussion Room 里点击 Continue discussion。

默认界面应该能看到：

- discussion brief；
- 参与者或模型的可读发言；
- 讨论时间线；
- 当前最强选项；
- 未解决分歧；
- 证据缺口；
- 风险；
- 当前结论；
- 下一步建议。

## 常见恢复动作

如果本地服务不可用，确认 `corepack pnpm start:local` 或首次运行命令仍在运行，然后在 Connect AI 点击 Check again。

如果 provider 验证失败，检查 API key、base URL、model 和 Structured review compatibility，然后再次 Verify connection。

如果真实模型讨论暂停或失败，先使用界面里的 Check model setup、Try Continue discussion again 或 Start a new model-backed discussion。

不要把 API key、完整 provider 响应、原始模型输出或本地运行数据粘贴到公开 issue、日志或文档里。

## 当前定位

Deliberum v1.1 是源码仓库形式的本地优先版本，不是公共托管服务。它不声明已经具备生产级多人权限、生产身份系统、分布式生产数据库或一键桌面安装包。当前支持路径是：本地启动服务、打开 Web、配置 OpenAI-compatible provider、验证连接、开始模型讨论、查看结论和恢复常见失败。
