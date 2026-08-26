# Copilot CLI Hook → OneTone Soft Pad

这条链只同步 Copilot CLI 的生命周期灯，不采集 prompt、回复正文或账号密钥。

## 启用

1. 确认 OneTone 正在运行，且本机监听 `127.0.0.1:8796`。
2. Soft Pad Hub → Shell Agent Hooks → 选择 **Copilot CLI** → 安装确认；  
   或手动把 [`scripts/copilot-cli-hooks.example.json`](../scripts/copilot-cli-hooks.example.json) 合并进 `~/.copilot/settings.json` 的 `hooks` 树。
3. 将示例里的 `REPO_ROOT` 换成本机仓库或打包后的 `resources` 路径。
4. 新开 Copilot CLI 会话，提交一次 prompt；Soft Pad / 迷你栏 Copilot chip 应变为 `running`，Stop 后 `done`。

Installer 只写入带 `--onetone-hook-id copilot-cli-activity-v1` 的 command，卸载只删这些条目。

## 事件映射

| Copilot / Claude-like event | Soft Pad |
|---|---|
| `UserPromptSubmit` / `PreToolUse` / `PostToolUse` | `running` |
| `PermissionRequest` | `needs_input` |
| `Stop` | `done` |
| `StopFailure` | `error` |

**不做多灯**：`can_multi_agent_lights=false`。与 Claude 共用 `map_claude_event_to_state`（有锁测，改映射须重验）。

## Soft Pad Shortcuts

Hub 已提供 **Copilot CLI** Soft Pad：Shortcuts 聚焦 `copilot.exe` / 终端宿主并派发和弦。天花板：无 Sessions / Resume / multi-lights。

## 隐私与失败行为

probe 只保留 event / session / cwd / model / ts。OneTone 未启动时 fail-open、退出码 0。日志：`logs/copilot_cli-hook-probe.jsonl`（不写 `pad-status.jsonl`）。

```powershell
node scripts/copilot-cli-hook-probe.test.js
node scripts/agent-shell-hook-probe.test.js
```
