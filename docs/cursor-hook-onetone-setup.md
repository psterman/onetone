# Cursor Hook → OneTone Soft Pad

这条链只同步 Cursor 的生命周期与可见模型标签，不采集 prompt、回复正文、token 或账号额度。

## 项目内启用

1. 确认 OneTone 正在运行，且本机监听 `127.0.0.1:8796`。
2. 把 [`scripts/cursor-hooks.example.json`](../scripts/cursor-hooks.example.json) 复制为项目根目录的 `.cursor/hooks.json`。
3. 重载 Cursor 窗口或新开会话。
4. 提交一次 prompt；Soft Pad 的 Cursor chip 应从灰色变为蓝色，完成后变为绿色。

仓库的 `.cursor/` 默认被忽略，因此示例文件放在 `scripts/` 下，避免误提交个人 Cursor 配置。本地工作区已经可以直接使用 `.cursor/hooks.json`。

## 事件映射

| Cursor event | Soft Pad state |
|---|---|
| `beforeSubmitPrompt` | `running` |
| `subagentStart` | `running` |
| `afterAgentResponse` | `done` |
| `stop` | `done` |

Cursor IDE 的 lifecycle hooks 是本适配器目标。Cursor CLI / Cloud Agent 的 lifecycle 事件支持可能少于 IDE，不能把“配置存在”当作“事件一定到达”。

## 模型显示

- payload 是 `model: "default"` 时，UI 显示 `Auto`。
- 其他非空值原样显示，但可信度只记为 `medium`。
- 不推断 Auto 背后最终路由到的模型。
- 无值显示 `--`。

## 隐私与失败行为

probe 只保留 `hook_event_name`、会话/turn 标识、`cwd`、`model` 与时间戳。prompt 和 Agent 回复不会写入 OneTone 日志。OneTone 未启动时 probe 会失败开放并以退出码 0 结束，不阻断 Cursor。

可单独验证：

```powershell
node scripts/cursor-hook-probe.test.js
```
