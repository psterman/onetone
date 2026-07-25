# 数字键盘功能区域规划

## 标准数字键盘布局
```
┌───┬───┬───┬───┐
│ / │ * │ - │ ← │
├───┼───┼───┼───┤
│ 7 │ 8 │ 9 │ + │
├───┼───┼───┤   │
│ 4 │ 5 │ 6 │   │
├───┼───┼───┼───┤
│ 1 │ 2 │ 3 │   │
├───┴───┼───┤ Ent│
│   0   │ . │   │
└───────┴───┴───┘
```

## 功能区域规划（Codex Soft Pad · 一键生效）

Codex Soft Pad 默认与 `openEditKeycap` 只暴露 **按一下就有可见结果** 的官方对齐能力（快捷键 / 口述 / 聚焦）。不提供 insertOnly slash、不提供 `claudeModel`、不自动 Enter 发 slash。

### 第一区域：常用一键区（7-8-9）
- **7键** AG00 `commandPalette`（Ctrl+K · 命令菜单）
- **8键** AG01 `newThread`（Ctrl+N · 新建对话）
- **9键** AG02 `quickChat`（Ctrl+Alt+N · 快速聊天）
- *状态灯：无 `slotId=status` 时 overlay 灯 fallback 到 AG00；灯 ≠ 点击语义（按下仍开命令菜单）*
- *过渡态：Claude Soft Pad 仍共享本 stock；Claude 主灯无 `claudeModel` 时 fallback AG01（现为 newThread 键）——后续再做 Claude 专用默认*

### 第二区域：查找 / 发送 / 取消（4-5-6）
- **4键** AG03 `quickSearch`（Ctrl+F · Find in chat）
- **5键** AG04 `stopOrSend`（Enter / 结束口述）
- **6键** AG05 `cancel`（Esc）
- *第一版可与顶栏 ACT 区能力重复（如 AG00≈ACT07）；分语义后再清*

### 第三区域：基础功能区（1-2-3）
- **1键** ACT09 `newThread`
- **2键** UNDO **空绑定**（外观保留；不进 Codex picker；heal 不写回 `undo`）
- **3键** SEARCH `quickSearch`

### 第四区域：输入控制区（0 . / * - +）
- **0键** ACT10 `pushToTalk`
- **.键** DOT 空绑定
- **/键** ACT07 `commandPalette`
- ***键** ACT06 `quickChat`
- **-键** ACT08 `cancel`
- **+键** PLUS 空绑定
- **Enter键** ACT12 `stopOrSend`

### 第五区域：特殊功能键
- **←键** / ENC — `summonCodex`（屏幕总开关）
- **主键盘方向键** ↑↓←→ — Soft Pad 左侧竖列 `NAV_*`（默认注入箭头；与小键盘 2/4/6/8 独立，靠 Windows extended 区分）
- **小键盘 8/2/4/6** — 仍映射右侧 `AG01` / `UNDO` / `AG03` / `AG05`（NumLock 开/关均走功能键，不进 NAV）

### Codex openEditKeycap 白名单
`summonCodex` · `commandPalette` · `newThread` · `quickChat` · `quickSearch` · `pushToTalk` · `stopOrSend` · `cancel` · `undo` · `openReviewTab` · `toggleReviewPanel` · `toggleSidebar` · `openSettings` · `navBack` · `navForward` · `openTerminal` · `toggleBrowserPanel` · `newBrowserTab` · `focusBrowserAddressBar`（+ 未绑定）
