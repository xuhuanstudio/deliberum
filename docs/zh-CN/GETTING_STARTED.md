# 快速开始

这份文档说明如何从源码仓库启动 Deliberum，打开 Web 界面，配置模型服务商，并完成一次由 AI 参与者参与的讨论。

英文版本见 [Getting Started](../GETTING_STARTED.md)。

## Deliberum 是什么

Deliberum 是一个本地优先的多视角审议产品。你输入一个问题或决策主题，配置模型参与者，然后在 Web 里查看结构化讨论过程：独立观点、当前最强选项、未解决分歧、证据缺口、风险、当前结论和下一步建议。

普通用户应该从 Web 界面开始使用。daemon、ledger、runtime、原始 JSON、内部 id 等低层信息只应在 Advanced / Developer Mode 里查看。

## 你需要准备什么

- macOS 或 Ubuntu Linux。
- Node.js 24 或更高版本。
- 已启用 Corepack。
- 通过 Corepack 使用 pnpm 11。
- 如果要运行真实模型讨论，需要一个 OpenAI-compatible provider 的 API key、base URL 和 model。

GitHub CI 现在通过主 `Validate` job 覆盖 Ubuntu Linux 的完整本地启动
smoke，并通过专门的 `Local start (macos-latest)` job 覆盖 macOS。Windows
和 WSL2 可能可以运行，但在本地启动路径进入 CI 验证前，不属于 v1.1 支持平台。

## 1. 启动本地产品

在仓库根目录，推荐第一次运行时直接执行：

```bash
node scripts/start-local-product.mjs
```

这个命令会检查本地工具、安装依赖、构建 Deliberum，并启动本地 Web 服务。服务启动后，请保持这个终端窗口运行。

## 2. 手动设置替代路径

如果你想手动逐步执行，先检查本地工具。

在仓库根目录运行：

```bash
node scripts/check-local-prerequisites.mjs
```

如果命令提示 Node.js、Corepack 或 pnpm 有问题，先按提示修复，再继续下一步。

### 安装依赖并构建

```bash
corepack pnpm install
corepack pnpm doctor:local
corepack pnpm build
```

不要跳过 build。`start:local` 会直接提供构建后的 Web 界面。

### 启动本地 Deliberum

```bash
corepack pnpm start:local
```

保持这个终端窗口运行。这个命令会在 `127.0.0.1` 启动一个本地服务，提供 Web 界面，并把本地讨论数据存到 `.deliberum/deliberum.sqlite`。

如果 `3877` 端口被占用，可以换一个本地端口：

```bash
DELIBERUM_PORT=3888 corepack pnpm start:local
```

## 3. 打开 Web 界面

打开：

```text
http://127.0.0.1:3877/
```

首页应该说明 Deliberum 是一个多视角审议产品，并显示本地服务是否已连接。

如果 Web 提示本地服务不可用，请确认 `start:local` 终端仍在运行，打开命令输出里的本地 URL，然后在 Connect AI 里点击 Check again。

## 4. 连接 AI

打开：

```text
http://127.0.0.1:3877/setup/models
```

这里会打开 **Connect AI**。使用 Configure OpenAI-compatible provider，填写：

- API key；
- base URL；
- model；
- Structured review compatibility，通常保持开启。

保存配置后，点击 Verify connection。

API key 会留在本机。默认 Web 界面不应该显示已保存的 API key、provider config id、env var 名称、原始 provider 响应、原始 JSON 或内部 runtime 细节。

## 5. 选择参与者并开始讨论

provider 验证通过后，Connect AI 会显示 AI 参与者讨论是否已可用。

可以选择：

- Start focused discussion：两个模型视角。
- Start broader discussion：三个模型视角。

也可以直接打开：

```text
http://127.0.0.1:3877/runs/new?participants=model-backed
```

填写讨论问题。第一次使用时建议先用默认参与者模型选择，不要急着自定义第一视角、替代视角、补充视角、质疑者、证据核查者、风险审查者或总结撰写者。

## 6. 阅读 Discussion Room

创建讨论后进入房间，点击 Continue discussion。默认界面应该能看到：

- discussion brief；
- 模型或参与者的可读发言；
- 讨论时间线；
- 当前最强选项；
- 未解决分歧；
- 证据缺口；
- 风险；
- 当前结论；
- 下一步建议。

正常使用默认路径时，不应该要求你理解 run id、session id、ledger event、runtime profile、proposal、projection 或 raw JSON。

## 7. 继续讨论或恢复失败

在房间里使用面向用户的操作：

- Continue discussion；
- Ask for stronger options；
- Review disagreements；
- Check evidence；
- Update conclusion。

如果 provider 验证或讨论推进失败，优先使用界面上的恢复操作：

- Review setup fields；
- Try Verify connection again；
- Check model setup；
- Try Continue discussion again；
- Start a new discussion with AI；
- Start a demo discussion while fixing provider setup。

不要把 API key、完整 provider 响应、原始模型输出或本地运行数据粘贴到公开 issue 或日志里。

## 本地部署方式

普通本地使用时，优先使用源码仓库的单进程启动方式：

```bash
corepack pnpm build
corepack pnpm start:local
```

本地或预生产容器方式：

```bash
docker build -t deliberum:local .
docker run --rm \
  -p 127.0.0.1:3877:3877 \
  -v deliberum-data:/data \
  deliberum:local
```

Deliberum v1.1 不是公共托管服务，也不声明已经具备生产级多人权限、生产身份系统或分布式生产数据库支持。可信团队或远程预生产部署请看英文 [Deployment](../DEPLOYMENT.md)。

## 常见问题

| 问题 | 处理方式 |
| --- | --- |
| 前置检查失败 | 安装 Node.js 24 或更高版本，启用 Corepack，然后重新运行 `node scripts/check-local-prerequisites.mjs`。 |
| 安装或构建失败 | 依次运行 `corepack pnpm install`、`corepack pnpm doctor:local`、`corepack pnpm build`。 |
| 提示 Web build 缺失 | 重新运行 `corepack pnpm build`，再运行 `corepack pnpm start:local`。 |
| `3877` 端口被占用 | 使用 `DELIBERUM_PORT=3888 corepack pnpm start:local`，然后打开命令输出里的 URL。 |
| 本地服务不可用 | 保持 `start:local` 运行，打开命令输出里的本地 URL，然后在 Connect AI 点击 Check again。 |
| provider 验证失败 | 检查 API key、base URL、model 和 Structured review compatibility，然后再次点击 Verify connection。 |
| 真实 provider 讨论暂停或失败 | 先使用 Check model setup 或 Try Continue discussion again，再考虑改低层设置。 |

## 接下来读什么

- 产品主路径验收清单：[Basic Product Loop Completion Matrix](../BASIC_PRODUCT_LOOP.md)。
- 本地或预生产部署：[Deployment](../DEPLOYMENT.md)。
- Discussion Room 走查：[Web Discussion Room Walkthrough](../WEB_DISCUSSION_ROOM_WALKTHROUGH.md)。
- 架构细节：[Architecture](../ARCHITECTURE.md)。
- 最新发布范围：[v1.1.1 Release Notes](../V1_1_1_RELEASE_NOTES.md)。
- v1.0 历史范围：[v1.0 Release Notes](../V1_0_RELEASE_NOTES.md)。
