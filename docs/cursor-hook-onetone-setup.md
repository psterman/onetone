# Cursor Hook → OneTone Soft Pad

这条链同步 Cursor Agent 的生命周期与可见模型标签，驱动 Soft Pad / 首页实时态。  
默认**不**采集 prompt、回复正文、思考区块、tool 入参/出参、shell 输出或文件 diff。

与 **Cursor 活动同意（vscdb Activity Provider）** 互补：Hooks 管实时 Working/Complete/Error；Activity 管历史会话与 KPI。Hooks **不是** Token / 费用接口。

## 项目内启用

1. 确认 OneTone 正在运行，且本机监听 `127.0.0.1:8796`。
2. 把 [`scripts/cursor-hooks.example.json`](../scripts/cursor-hooks.example.json) 复制为项目根目录的 `.cursor/hooks.json`，或 Soft Pad 复制 merge preview 写入用户级 `%USERPROFILE%\.cursor\hooks.json`。
3. 重载 Cursor 窗口或新开会话。
4. 提交一次 prompt；Soft Pad / 首页 Cursor 应从灰色变为执行中，工具调用时可显示短副标题，`stop` 后按结局变为完成 / 失败 / 空闲。

## Plan / Agent 模式快捷键（Soft Pad）

OneTone 在 Cursor Soft Pad 就绪时会**合并**写入 `%APPDATA%\Cursor\User\keybindings.json`（按 command 幂等覆盖，不整文件清空）：

| Soft Pad 槽位 | Cursor 命令 | 默认键 |
|---|---|---|
| `plan`（默认 PLUS） | `composerMode.plan` | `Ctrl+Alt+Shift+P` |
| `switchAgent`（默认 DOT） | `composerMode.agent` | `Ctrl+Alt+.` |

下次 Soft Pad ensure 会把这两条 command 的键拉回上表默认。可先 `Ctrl+I` 打开 Composer，再按 Soft Pad 对应键切换模式。

仓库的 `.cursor/` 默认被忽略，因此示例文件放在 `scripts/` 下，避免误提交个人 Cursor 配置。本地工作区已经可以直接使用 `.cursor/hooks.json`。

## Phase1 事件映射

| Cursor event | Soft Pad / Attention | 说明 |
|---|---|---|
| `sessionStart` | `running` / Working | 会话启动；可带 `composer_mode` |
| `beforeSubmitPrompt` | `running` / Working | 用户提交新回合 |
| `preToolUse` | `running` / Working | 工具名 + 可选截断 `agent_message` |
| `postToolUse` | `running` / Working | 工具成功，回合未结束 |
| `postToolUseFailure` | `error` / Error | 工具失败 |
| `afterFileEdit` | `running` / Working | 仅文件 basename |
| `subagentStart` | `running` / Working | 子 Agent 启动 |
| `subagentStop` | `running` 或 `error` | 看 `status` |
| `afterAgentResponse` | **保持** `running` | 中途回复，**不是**回合结束 |
| `stop` | 见下表 | 回合结局权威事件 |
| `sessionEnd` | 见下表 | 会话关闭 |

### `stop.status` / `sessionEnd.reason`

| outcome | Pad state |
|---|---|
| `completed`（或缺省） | `done` / Complete |
| `error` | `error` / Error |
| `aborted` | `idle` / Idle |
| `sessionEnd`: `user_close` / `window_close` | `idle` / Idle |

未订阅 Tab hooks（`beforeTabFileRead` / `afterTabFileEdit`）与 `workspaceOpen`（无 conversation）。  
Cursor IDE 的 lifecycle hooks 是本适配器目标；CLI / Cloud Agent 事件面可能更窄，不能把「配置存在」当作「事件一定到达」。

## 隐私白名单（probe 转发）

保留并 POST：`hook_event_name`、`conversation_id` / `session_id`、`generation_id`、`cwd`、`model`、`tool_name`、截断 `agent_message`（≤120）、`stop.status` / `sessionEnd.reason`、`workspace_roots[0]`、`file_path` basename、`composer_mode`、时间戳。

**不**转发：`prompt`、`text`（回复/思考）、`tool_input` / `tool_output`、shell `output`、`edits` 正文、`transcript_path` 内容、`user_email`。

## NeedsInput 边界

Cursor 官方 Hooks **没有**「等用户点 Run / AskQuestion」的一等事件（社区在要 `awaitingUserInput`）。  
Claude 的 `Notification` / `PermissionRequest` 也不映射到 Cursor。  
因此 Cursor Soft Pad **不会**假装有与 Claude 同级的确认灯；能力上标为不可观察，直到官方补齐。

## 模型显示

- payload 是 `model: "default"` 时，UI 显示 `Auto`。
- 其他非空值原样显示，但可信度只记为 `medium`。
- 不推断 Auto 背后最终路由到的模型。
- 无值显示 `--`。

## 失败行为

OneTone 未启动时 probe 会失败开放并以退出码 0 结束，不阻断 Cursor。  
`preToolUse` / `subagentStart` 回 `{ "permission": "allow" }`，不抢 Cursor 自身审批。

可单独验证：

```powershell
node scripts/cursor-hook-probe.test.js
```
