# Soft Pad：WorkBuddy / Trae / Qoder（Shell Hook · Shortcuts）

共享探针 [`scripts/agent-shell-hook-probe.js`](../scripts/agent-shell-hook-probe.js) 把生命周期事件 POST 到 `127.0.0.1:8796/api/codex-app/state`。配置文件必须分端。

## 能力边界

| 能力 | 本批 |
|------|------|
| Shortcuts（映射快捷键 / Soft Pad 屏上按钮） | 支持 |
| 应用聚焦 / 按键发送 | 支持 |
| Shell Hook 主灯 | 支持 |
| Sessions / Resume / Multi-lights | **不支持** |
| Permission decide / Claude Activity | **不支持** |

默认 Soft Pad purpose：`shortcuts`。Sessions 仅 Claude / Codex。

## 前置：创建并启用 Soft Pad mapping

Hub **不会**在打开 WorkBuddy / Trae 时自动创建虚拟键盘。需：

1. 虚拟键盘 Hub 顶栏点选 WorkBuddy / Trae / Qoder
2. 点 **准备** 创建该应用的 Shortcuts pad
3. 启用虚拟键盘后，自动跟随才会在切到对应应用时切换 scheme

## 顶栏状态灯（6 盏）

Agent / 更多 面板可开关 Codex / Claude / Cursor / WorkBuddy / Trae / Qoder 的状态灯。Shell 三端默认关闭；开启后顶栏出现对应图标，并需在下方 **接入** Shell Hook 后灯才会随生命周期变化。

## Soft Pad Hub 一键接入（推荐）

1. OneTone 运行，监听 `127.0.0.1:8796`。
2. 打开 **虚拟键盘** → 顶栏选 WorkBuddy / Trae / Qoder（可先「准备」创建 Shortcuts pad）。
3. 打开 **Agent** 子页，看到 **Shell Hook** 条：
   - **尚未接入** → 点 **接入**（主路径；勿依赖「复制草案」）
   - **已接入** → **重新检测** / **撤回**
   - **探针缺失** → 异常态（不是「未配置」）；确认安装含 `agent-shell-hook-probe.js`
4. 「复制配置草案」在 **更多…** 里，仅排障用。

IPC：`cmd_shell_agent_hook_setup_status` / `install_confirm` / `uninstall`，参数 `kind` = `workbuddy` | `trae` | `qoder`。

自检：

```powershell
node scripts/agent-shell-hook-probe.test.js
```

---

## 手动合并配置（高级）

将 example 里的 `REPO_ROOT` 换成本仓库绝对路径后合并进客户端配置。

### WorkBuddy / CodeBuddy

- 目标：`~/.codebuddy/settings.json` 的 `hooks`
- 示例：[`scripts/workbuddy-hooks.example.json`](../scripts/workbuddy-hooks.example.json)
- `--source workbuddy` → `workbuddy_hook`

### Trae

- 目标：`~/.trae/hooks.json`（根对象即事件表）
- 示例：[`scripts/trae-hooks.example.json`](../scripts/trae-hooks.example.json)
- `--source trae`

### Qoder

- 目标：`~/.qoder/settings.json` 的 `hooks`
- 示例：[`scripts/qoder-hooks.example.json`](../scripts/qoder-hooks.example.json)
- `--source qoder`

| Event（归一后） | Soft Pad |
|-----------------|----------|
| UserPromptSubmit / PreToolUse / PostToolUse | running |
| PermissionRequest（含 Notification 权限类） | needs_input |
| Stop / TaskCompleted | done |
| StopFailure / PostToolUseFailure | error |
| SessionStart | 无主灯 |

## 隐私

probe 只保留 event、session/turn、cwd、model、tool/agent id。不写 prompt 或回复正文。
