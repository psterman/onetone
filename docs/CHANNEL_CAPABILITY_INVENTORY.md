# 通道能力统计（现网）

> 目的：先统计按键 / 语音 / 软键盘**原有能力**，再单独列「待联动到习惯」项。  
> **本阶段只统计，不改产品、不移植。**  
> 原则：能力留原页；仅跨通道「命令匹配」将来进习惯。

面板：`#settingsPanelKeys` · `#settingsPanelVoiceWake` · `#settingsPanelSoftPad`

---

## 1. 按键页能力（KEEP）

| # | 能力 | UI / 入口 | 主要存储 | 说明 |
|---|---|---|---|---|
| K1 | 起点 · 触发键录制 | `#habitKeyMapCellTrigger` | `mapping.triggerKey` | 全局开麦/听写启动 |
| K2 | 触发方式（按住/点击等） | `#keysTriggerModeHost` | 听写相关 trigger mode | 本通道 |
| K3 | 录制反馈 / 冲突 | `#keysRecordingFeedback`, `#keysTriggerConflict` | — | 诊断 |
| K4 | 录制检测探针 | `#recordProbePanel` | — | 页面/IPC/钩子 |
| K5 | 输入法 · 听写键 | `#keysCaptureKeycapHost`, `#keysCaptureHeroCard` | `targetKey` / IME 识别键 | ① |
| K6 | 输入法预设条 | `#imePresetStripMapping` | `imePresetId` 等 | 讯飞/微信/… |
| K7 | 说完后（手动/自动发送等） | `#voiceEndKeyModePanel`, `#keysFinishModeHost` | finish / autoEnter 等 | ② |
| K8 | 取消听写 | `#keysFinishPeerCancel` + cancel 宿主 | cancel 策略 | ② 旁路 |
| K9 | 开麦前对准 | `#keysAimStrategy`, `#keysAimFold` | aim 校准相关 | ② |
| K10 | 自定义快捷键 · 录 chord | `#keysCustomKeyMatchList`, `#btnKeysCustomKeyMatchAdd` | peer mapping `triggerKey` / `targetActions` | **录键能力** |
| K11 | 自定义 · 动作序列编辑 | `#keysCaptureTargetActions` | `targetActions` | 序列步骤 |
| K12 | 口头启动键分槽（若启用） | oral trigger 录制路径 | `oralCommandScheme.triggerKey`, `activationMode` | 按键能力，非说法匹配 |
| K13 | 应用上下文条 | `#keysAppContext` | 只读展示 | 当前应用 |
| K14 | 本场景动作码头（列表） | keys-scene-actions-panel | 只读/跳转编辑 | 场景动作一览 |

**识别栏六 tab（结构保留，能力归属见下）**

| Tab | 属本页能力？ | 备注 |
|---|---|---|
| 输入法 `ime` | **是** | K5–K9 |
| 自定义快捷键 `key` | **是（录制）** | K10–K11；「绑到哪条习惯命令」见联动表 |
| 口头命令 `voice` | 混有联动 | 工作室式挑绑 → 待联动 |
| 应用快捷键 `cursor` | 混有联动 | 挑应用快捷键绑命令 → 待联动 |
| 软键盘 `softPad` | 混有联动 | 加载到识别键等 → 待联动 |
| 手势 `camera` | 混有联动 | 选手势绑命令 → 待联动 |

主模块：`keys-channel-command-picker.js`, `keys-panel-ui.js`, `habit-key-mapping-table.js`, `mapping-recording.js`

---

## 2. 语音页能力（KEEP）

| # | 能力 | UI / 入口 | 主要存储 | 说明 |
|---|---|---|---|---|
| V1 | 免按键语音开关 | `#voiceWakeListeningOptInToggle` | `voiceWakeListeningOptIn` 等 | 后台听唤醒 |
| V2 | 唤醒词 / 同义说法 | `#voiceWakeCompactZh`, `#voiceWakePhraseTags` | 全局 / `voiceOverride.wakePhrases` | **arm**，非命令说法 |
| V3 | 引擎 / 模型 / 麦 | voice core / summary 控件 | 全局 voice baseline；稀疏 `voiceOverride` | 识别底座 |
| V4 | 监听策略 | 策略相关控件 | `voiceListeningStrategy` 等 | |
| V5 | 结束 / 取消 / 发送短语 | finish / cancel 卡片 | `voiceOverride.endPhrases` 等 | 一轮生命周期 |
| V6 | Setup / 模型下载 | `#voiceSetupBanner` 等 | — | 就绪 |
| V7 | 按键说话只读引用 | 展示触发键 | 读 `triggerKey` | **权威在按键页** |
| V8 | 口头命令列表/编辑器（现状） | oral / intent 相关 | `oralCommandScheme.items` | 见含混：匹配部分待联动 |

主模块：`oral-command-ui.js`, voice wake / recognize 相关 panel，全局 voice 设置

契约：`HABIT_UNIFIED_CONTRACT` — 引擎底座偏全局；习惯可有 `voiceOverride`。

---

## 3. 软键盘页能力（KEEP）

| # | 能力 | UI / 入口 | 主要存储 | 说明 |
|---|---|---|---|---|
| P1 | 设备连接 / 启用 | Soft Pad 状态条 | `codexMicroPad.enabled` 等 | |
| P2 | 布局网格 / 预览 | `#softPadPreviewHost` 等 | `codexMicroPad.keys` | 键位长什么样 |
| P3 | 恢复默认布局 | 布局操作 | 同上 | |
| P4 | 何时显示 | show tab | pad show prefs | |
| P5 | 皮肤 / 外观 | skin tab | skin prefs | |
| P6 | purpose（快捷键台/会话等） | purpose 控件 | purpose | |
| P7 | Auto 车道 / agent scope | 车道 / scope bar | Soft Pad Auto lane；`selectedScopeId` | ≠ `activeSceneId` |
| P8 | Agent / timeline 面 | face tabs | — | 工作台面 |
| P9 | 键位预览已绑命令名 | 格子上展示 | 投影 `agentBindings` | **可只读**；改匹配见联动 |

主模块：`soft-pad-hub-ui.js`, Soft Pad purpose / overlay（Rust）

契约：无全局 pad；编辑真相 = `selectedMappingId`。

---

## 4. 待联动到习惯（统计 · 尚未移植）

> 这些是「跨通道命令匹配 / 工作室」，**不是**上表 KEEP 能力。  
> 下一阶段再迁；迁时写同一字段，不拆 runtime。

| # | 现归属 | 联动内容 | 写入字段（预期） |
|---|---|---|---|
| L1 | 按键 · 口头/应用/Pad/手势 tab 作命令工作室 | 挑他通道源绑到识别/命令 | `agentBindings`, 跨通道 `captureHeroRef` |
| L2 | 按键 · Soft Pad「加载到识别键」 | Pad 键 → 识别英雄 | `captureHeroRef` |
| L3 | Soft Pad · 六通道 rail + 动作库「改按钮」 | 键位 ↔ semantic 命令 | `codexMicroPad` + `agentBindings` |
| L4 | Soft Pad · 跨通道 retarget | 同 L2 类 | 同上 |
| L5 | 语音 · `voice-bridge-keys/softpad/camera` 建绑 UI | 为他通道槽挂说法 | `oralCommandScheme.items` / voice binds |
| L6 | 语音 · intent rail 作六通道匹配台 | 说法/槽 ↔ 命令 | 同上 |
| L7 | 口头 · 「说法 ↔ 哪条命令」主编辑路径 | 命令匹配 | `oralCommandScheme.items` |
| L8 | 自定义键「应用到哪条习惯命令」 | 匹配（录键仍 K10） | Habit 绑定 + 可选 `captureHeroRef` |

---

## 5. 含混（统计时标注，移植前再拍）

| 项 | 倾向 |
|---|---|
| 口头说法编辑器 UI | 匹配 → 将来习惯；语音可留只读投影 |
| 唤醒词 vs 口头命令说法 | 唤醒 = V2 留语音；命令说法 = L7 |
| 自定义键录制 vs 应用 | 录 = K10 留按键；应用 = L8 |
| Soft Pad 点格子选命令 | 预览 = P9；选命令 = L3 |
| 通道间「去某某页」深链 | 保留为导航，不算匹配工作室 |

---

## 6. 本阶段结论

| 页 | KEEP 条目数（上表） | 待联动条目 |
|---|---|---|
| 按键 | K1–K14（输入法+录键为核心） | L1,L2,L8 及相关 |
| 语音 | V1–V8（唤醒+引擎为核心） | L5,L6,L7 |
| 软键盘 | P1–P9（布局+车道为核心） | L3,L4 |

**下一步（未开始）：** 在习惯页做联动宿主时，只实现 L1–L8，三页 KEEP 面板不删不搬。

---

## 7. 相关原型（仅示意，非现网）

- `prototypes/onetone-channel-pages-index.html`
- `prototypes/onetone-keys-capability-v2.html`
- `prototypes/onetone-voice-capability-v2.html`
- `prototypes/onetone-softpad-capability-v2.html`
- `prototypes/onetone-ia-left-nav-v2.html`
