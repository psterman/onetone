# Cline file hooks → OneTone Soft Pad

Cline 使用 **每事件一个脚本文件**（不是 `settings.json` hooks 树）。OneTone 写入：

- `%USERPROFILE%\.cline\hooks\*.cmd`
- `%USERPROFILE%\Documents\Cline\Hooks\*.cmd`（若存在）

Probe：[`scripts/cline-hook-probe.js`](../scripts/cline-hook-probe.js) → POST `source: cline_hook`。

Marker：`--onetone-hook-id cline-activity-v1`。

## 启用

1. OneTone 运行，监听 `127.0.0.1:8796`。
2. Soft Pad 顶栏 → **状态灯（客户端 / CLI）** → 打开 **Cline** → **接入**（或 Hub 同类 Shell Hook CTA）。
3. 新开 Cline 任务并提交 prompt → chip `running` → `TaskComplete` 后 `done`。

## 事件映射（probe 归一化）

| Cline event | Soft Pad event | Soft Pad state |
|---|---|---|
| `UserPromptSubmit` / `PreToolUse` / `PostToolUse` | 同名 | `running` |
| `Notification`（permission） | `PermissionRequest` | `needs_input` |
| `TaskComplete` | `Stop` | `done` |
| `TaskCancel` / `TaskError` | `StopFailure` | `error` |

## Soft Pad Shortcuts

Hub 已提供 **Cline** Soft Pad：Shortcuts 聚焦 VS Code/Cursor 宿主并派发和弦（`can_focus`/`can_send_chord`）。天花板：无 Sessions / Resume / multi-lights。

## 自检

```powershell
node scripts/cline-hook-probe.test.js
node scripts/agent-shell-hook-probe.test.js
```

日志：`logs/cline-hook-probe.jsonl`。fail-open、退出码 0；不写 prompt/正文。
