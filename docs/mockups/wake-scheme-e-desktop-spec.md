# 01 开启 · 方案 E（桌面化）规格

## IA 定稿

- 主视图保留 `当前口令` hero。
- hero 下方仅 `别名` section（与 02 同款 alias-card）；`+ 添加` 用二级弹窗输入。
- **01 开启页不出现** `输入目标` / 快捷键（归属按键页，非语音识别方案）。

## 交互层选择

默认采用 **Popover**（不是 Bottom Sheet）：

- 更贴合桌面端鼠标 + 键盘操作，视觉干扰更小。
- 不遮挡整个抽屉内容，便于对照主行摘要值。
- 可以就近挂在触发行，减少光标移动成本。

Bottom Sheet 保留为备选：仅当 Popover 在小窗高度下可用空间不足时再切换。

## 行为定义

- `别名` 行点击：
  - 打开 popover，内含 tags + 输入框 + `添加` 按钮。
  - `Esc` 关闭，不保存临时输入。
- 不在 01 开启页提供输入目标入口；快捷键仅在按键页 / 习惯摘要中配置。
- 键盘行为：
  - 两个摘要行可聚焦。
  - `Enter` 打开对应 popover。
  - `Esc` 关闭 popover。

## 最小改动映射

### 结构层

- [`src/index.html`](../../src/index.html)
  - `voiceWakeKindTextPane` 下，保留 `voiceWakeHeroCard`。
  - 用新的 grouped rows 结构替代现有 `voiceWakeAliasSectionLbl` + `voiceWakeInputTargetSectionLbl` 两段卡片。
  - 新增容器 ID（建议）：
    - `voiceWakeConfigGroup`
    - `voiceWakeAliasRow`
    - `voiceWakeTargetRow`
    - `voiceWakeAliasPopover`
    - `voiceWakeTargetPopover`

### 渲染层

- [`src/js/features/voice/voice-step-wake-render.js`](../../src/js/features/voice/voice-step-wake-render.js)
  - 复用已有 `renderInputTarget(vm)` 的快捷键值逻辑，额外渲染到摘要行 value。
  - 为别名摘要新增轻量渲染函数（数量 + 示例）。
  - `renderWakeSectionLabels()` 增加新行标题文案同步。

### 事件层

- [`src/js/features/voice/voice-ui-bindings.js`](../../src/js/features/voice/voice-ui-bindings.js)
  - 绑定 `voiceWakeAliasRow` / `voiceWakeTargetRow` 点击与键盘打开行为。
  - 绑定 popover 的关闭（`Esc`、点击外部）。
  - `前往按键页编辑` 继续复用已有 `hooks.setSettingsPanel('keys')`。

### 样式层

- [`src/css/voice-page-shell.css`](../../src/css/voice-page-shell.css)
  - 新增桌面 grouped rows（inset list）样式。
  - 新增 popover 皮肤，保持与现有 voice 卡片圆角/边框体系一致。

## 验收标准

- 首屏默认高度相比当前 A 方案下降明显（目标约减少 30%+）。
- 用户无需滚动即可看到：
  - 当前口令
  - 别名数量
  - 输入目标快捷键
- 加别名与改输入目标都不引入新子页面，只出现单层 popover。
