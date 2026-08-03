# Soft Pad Phase B：用量与窗口限额

Phase B 使用独立数据源，不从 lifecycle hooks 猜 token 或额度。

## UI 文案合同

| UI 文案 | 数据源 | 含义 |
|---|---|---|
| `Nh余 N%` / `Nd余 N%` | Codex App Server `account/rateLimits/read` | 当前限额窗口约剩余量，不是账户余额 |
| `Nh余 N% · Xm重置` | 同上 + `resetsAt` 前端倒计时 | 窗口剩余 + 重置倒计时（到分钟；过期显示「待刷新」） |
| 脱敏账号 / 套餐 | `account/read` → `accountLabel` / `planType` | 后端先脱敏邮箱；套餐优先 account.planType，否则 rate-limit planType |
| `累计 N` | Codex App Server `account/usage/read` | ChatGPT 账户 token activity lifetime summary |
| `会话 N` | App Server `thread/tokenUsage/updated` | 仅 OneTone 管理/订阅的 thread；没有通知就不显示 |
| `本会话 N` | Claude OTel `claude_code.token.usage` | 当前匹配 session 的主查询 token |
| `子任务 N` | Claude OTel，`query_source != main` | 子 Agent / 辅助查询 token，和主会话分开 |
| `估算 $N` | Claude OTel `claude_code.cost.usage` | Claude Code 本地估算，不是正式账单 |

Cursor 固定显示 `用量 --`，直到存在适合桌面产品的稳定官方接口。

## 展示面（v1）

| 位置 | 展示 | 说明 |
|---|---|---|
| mini 栏 | `C 63% · 2h12m` | 单个 usage pill；完整三 provider 仍在展开 rail / tooltip |
| expanded Soft Pad | `5h余63% · 2h12m重置` / `7d余41%` | 已有 `usage.windows` |
| Soft Pad 设置页 | 脱敏账号 · 套餐 · 额度 · 重置 | 复用 `cmd_codex_micro_overlay_get_state`，无新 IPC |
| tooltip | 双窗口 + source + 上次刷新 | 已有 tooltip 扩展 |

mini pill 选择顺序：当前 `appAgent` → `needs_input` / `running` → Codex ready → 其他首个 ready。

`resetsAt` 兼容：`< 1e12` 按秒，`>= 1e12` 按毫秒。expanded overlay ~1.5s 刷新，不另起后端计时器。

## Codex

OneTone 启动后会以只读 stdio 连接运行 `codex app-server`，读取：

- `account/rateLimits/read`
- `account/usage/read`
- `account/read`（`refreshToken: false`，best-effort；失败不影响额度轮询成功）

默认每 5 分钟刷新。不会创建 thread、发送 prompt、读取 transcript 或消费 reset credit。设置 `ONETONE_AGENT_USAGE=0` 可关闭该轮询。

DTO 字段（camelCase）：`accountType`、`accountLabel`（脱敏）、`planType`。完整邮箱不写日志、不进 mini 栏。

Windows 没有共享 App Server daemon，因此 OneTone 不能旁听另一个 Codex 客户端的实时 `thread/tokenUsage/updated`。代码保留了该通知的诚实入口，供未来 OneTone-managed thread 使用；账户 lifetime token 不会冒充会话 token。

## Claude OTel

1. 确认 OneTone loopback listener 已启用并监听 `127.0.0.1:8796`。
2. 把 [`scripts/claude-otel-onetone.example.json`](../scripts/claude-otel-onetone.example.json) 中的 `env` 合并到 Claude Code 用户或项目 settings。
3. 重启 Claude Code，提交一次 prompt。
4. 最迟约 10 秒后，full overlay 应显示 Claude 本会话 token 与估算费用；mini 的 Claude 图标 tooltip 同步显示。

OneTone 的 `/v1/metrics` 只保留以下 metric：

- `claude_code.token.usage`
- `claude_code.cost.usage`

其他 metrics、logs、prompts、回复和工具参数全部忽略。示例明确设置 `OTEL_LOGS_EXPORTER=none`。

## Phase 2（未实现）

外部 CLI（`codex-rate` / `codexbar` / `claude-monitor`）只做字段补全，不覆盖 app-server 权威字段：

- Codex 账号 / 套餐 / 5h/7d：app-server 权威
- Codex 外部 CLI：只补空字段
- Claude 5h/7d：claude-monitor state/statusline
- Claude 会话 / 子任务 / 估算 $：OTel
- PATH 找不到工具：静默 skip（不标红、不提示安装）
- 外部进程：超时 + 输出大小限制 + 严格 JSON

## 新手排错

- Codex 显示“未连接”：先在终端运行 `codex --version`，并确认 Codex 已用 ChatGPT/受支持身份登录；API-key-only 不提供 account usage。Windows 桌面启动时若 PATH 不含 Codex CLI，可设置 `ONETONE_CODEX_BIN` 指向 `codex.cmd` 或完整 CLI 路径。
- Claude 显示“未连接”：确认 OneTone listener 已开启、端口没有被占用，并用 `claude --debug` 查看 OTel exporter 错误。
- Cursor 显示 `--`：这是产品边界，不是安装故障。
- 额度只写“窗口余”，不要改成“账户余额”“余额百分比”或“还能用多少 token”。
