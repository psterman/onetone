# Aider notifications → OneTone Soft Pad（仅完成）

Aider **没有**官方 PreTool/Stop hook 系统。诚实上限：只接 `--notifications-command` / `~/.aider.conf.yml` 的 `notifications-command`，在**回合结束** POST 一次 `Stop`。

Probe：[`scripts/aider-notify-probe.js`](../scripts/aider-notify-probe.js) — **始终** POST `Stop`（忽略 stdin/argv 文本，防泄漏）。

Marker：`--onetone-hook-id aider-notify-v1`。

## 启用

1. OneTone 运行，监听 `127.0.0.1:8796`。
2. Soft Pad 顶栏 → **Aider（仅完成）** → **接入**。
3. 若 `~/.aider.conf.yml` 已有**别的** `notifications-command` 且不含 OneTone marker → 安装会拒绝（不覆盖）。

写入示例：

```yaml
notifications-command: node "REPO_ROOT/scripts/aider-notify-probe.js" --onetone-hook-id aider-notify-v1 --source aider
```

## 能力边界

| 能力 | Aider |
|------|-------|
| 回合结束 → `done` | ✅ |
| `running` / 工具执行中 | ❌ |
| `needs_input` | ❌ |
| 虚拟键盘 workflow | ❌ |

UI 与 catalog 均标明 **仅完成通知**。

## 自检

```powershell
node scripts/aider-notify-probe.test.js
```

日志：`logs/aider-hook-probe.jsonl`。
