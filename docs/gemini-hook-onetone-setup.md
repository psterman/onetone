# Gemini CLI Hook → OneTone Soft Pad

这条链只同步 **Gemini CLI** 生命周期灯。配置写入 `~/.gemini/settings.json` 的 `hooks`（官方 schema；旧稿 `~/.gemini/config/hooks.json` 不再作为默认）。

## 启用（CLI）

1. OneTone 运行中，监听 `127.0.0.1:8796`。
2. Soft Pad Hub → Shell Agent Hooks → **Gemini** → 安装确认；  
   或合并 [`scripts/gemini-hooks.example.json`](../scripts/gemini-hooks.example.json) 到 `~/.gemini/settings.json`。
3. 替换 `REPO_ROOT` 为实际路径；新开 `gemini` CLI 会话并触发工具调用。
4. Soft Pad / 迷你栏 Gemini chip：`BeforeTool`→`running`，`AfterAgent`→`done`。

Marker：`--onetone-hook-id gemini-activity-v1`。

## 事件映射（probe 归一化）

| Gemini CLI event | Soft Pad event | Soft Pad state |
|---|---|---|
| `BeforeAgent` | `UserPromptSubmit` | `running` |
| `BeforeTool` | `PreToolUse` | `running` |
| `AfterTool` | `PostToolUse` | `running` |
| `AfterAgent` | `Stop` | `done` |
| `SessionStart` | `SessionStart` | 无主灯 |

与 Claude 共用事件→状态映射（锁测在 `shell_agent`）。无多灯。

## Soft Pad Shortcuts

Hub 已提供 **Gemini CLI** Soft Pad（WorkBuddy 级）：Shortcuts 聚焦 `gemini.exe` / 终端宿主并派发和弦。天花板：无 Sessions / Resume / multi-lights。

## IDE mid-session（实测）

社区与官方文档表明 hooks 主要服务 **CLI**（`settings.json`）。本仓库验收以 CLI 为准。

**实测结论（请人工复测后更新本段）：**  
若在 IDE / Antigravity 中安装同款 hook 后，提交 mid-session 事件而 `logs/gemini-hook-probe.jsonl` **无对应 POST**，则记为：

> **实测 IDE 模式 hook 不触发，等 Google 修。当前仅支持 Gemini CLI。**

不要把「IDE 另验」写成默认可用。

## 隐私与失败

fail-open、退出码 0；不写 prompt/正文。日志：`logs/gemini-hook-probe.jsonl`。

```powershell
node scripts/gemini-hook-probe.test.js
```
