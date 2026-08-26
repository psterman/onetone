# OpenCode plugin → OneTone Soft Pad

OpenCode **不走** settings.json shell probe。使用仓库插件：

[`scripts/opencode-onetone-plugin/index.js`](../scripts/opencode-onetone-plugin/index.js)

POST `source: opencode_hook` 到 `127.0.0.1:8796/api/codex-app/state`。

## 启用

1. OneTone 运行，监听 `127.0.0.1:8796`。
2. Soft Pad 顶栏 → **OpenCode** → **接入**（合并 `~/.config/opencode/opencode.json` 或 `~/.opencode/opencode.json` 的 `plugin` 数组）。
3. 或手动把插件绝对路径加入 `plugin`：

```json
{
  "plugin": [
    "C:/path/to/voice-pilot/scripts/opencode-onetone-plugin/index.js"
  ]
}
```

4. 重启 OpenCode；工具调用 / session idle 应驱动 chip。

## 事件映射

| OpenCode hook / event | Soft Pad event | state |
|---|---|---|
| `tool.execute.before` | `PreToolUse` | `running` |
| `tool.execute.after` | `PostToolUse` | `running` |
| `permission.ask` | `PermissionRequest` | `needs_input` |
| `session.idle` | `Stop` | `done` |
| `session.error` | `StopFailure` | `error` |

TUI statusline **不是** Soft Pad 通道。

## Soft Pad Shortcuts

Hub 已提供 **OpenCode** Soft Pad：Shortcuts 聚焦 `opencode.exe` 并派发和弦。天花板：无 Sessions / Resume / multi-lights。

## 限制

需 Node 可用（插件内 `http.request`）。fail-open。
