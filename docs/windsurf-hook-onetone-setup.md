# Windsurf → OneTone Soft Pad

Windsurf（Codeium）走 **Trae Work 同款本地活跃度灯**，**不**写入 Settings → Hooks。

主灯来源：

1. `Windsurf.exe` 进程存活
2. `%APPDATA%\Windsurf`（logs / `User/globalStorage/state.vscdb` / workspaceStorage）与 `~/.codeium`、`~/.windsurf` 的近期 mtime

无 OfficialHook / Settings 接入面板。`refresh_configured = false`（与 Trae Work 一致）。

## Soft Pad Shortcuts（WorkBuddy 级）

Hub 已提供 **Windsurf** Soft Pad：Shortcuts 聚焦 `Windsurf.exe` 并派发 IDE 和弦（VS Code 系快捷键表）。天花板：无 Sessions / Resume / multi-lights。

## 启用

1. 安装并运行 Windsurf。
2. Soft Pad 顶栏 → **状态灯** → 打开 **Windsurf**（默认开）。
3. 虚拟键盘 Hub → 点选 Windsurf → **准备** 创建 Shortcuts pad。
4. 在 Windsurf 中干活时顶栏灯应跟本地活动闪忙/空闲。

## 自检

```powershell
node scripts/soft-pad-shell-hook-hub.test.js
cargo test --manifest-path src-tauri/Cargo.toml pad_status::adapters::shell_agent_process
```

勿伪造 Hook 探针；进程活动灯已够用。
