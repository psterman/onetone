# 习惯统管契约（B0/B1）

本文档是产品和代码的共同契约。实施顺序：**先 B0 → B1**；**暂不进入 B2**（共用 aside）。

## 产品契约

> 你可以选择一个习惯**正在使用**，也可以**编辑**另一个习惯；按键、语音、摄像头、虚拟键盘只是这个习惯里的不同**通道**。

## 三条硬规则

1. **动作策略随习惯，硬件/引擎底座留全局。**
2. **正在使用与正在编辑必须可不同。**
3. **持久编辑选中只认 `selectedMappingId`；模块内只能保留局部 UI 态。**

## 稳定五词（对外）

| 词 | 代码 / 含义 |
|----|-------------|
| **习惯** | `mappings[]` 一行 |
| **通用设置** | 对外合并称呼（见内外分层） |
| **应用场景** | 绑定应用的习惯例外；「场景」仅用于此完整短语 |
| **正在使用** | `config.activeSceneId` |
| **正在编辑** | `state.selectedMappingId` 指向的**习惯**（不覆盖全局底座编辑） |

禁止混用：方案、情景、场景方案、Soft Pad scheme、语音方案、运行场景。

## 「通用设置」内外分层

| 层 | 对内名称 | 是什么 | 随习惯切换？ |
|----|----------|--------|--------------|
| A | **默认习惯** | 无 `appTargetId` 的 baseline mapping，默认**动作策略** | 是（作为正在使用时） |
| B | **全局底座** | 硬件、校准、引擎基础（`cameraPrefs` 设备/校准/美颜、`voice*` 引擎 baseline） | **否** |

对外可合并叫「通用设置」；对内/代码注释必须分层。

## `selectedMappingId` 语义

| 值 | 含义 |
|----|------|
| `mappingId` | 正在编辑某个习惯 / 应用场景 |
| `null` | **没有**选中具体 mapping |

- 不要把 `null`、baseline mapping id、`__global__` 混成一件事。
- `__global__` 若保留，仅为语音页 **UI 哨兵** =「未选 mapping + 页面在配全局语音底座」。
- 全局底座编辑态属于**页面局部 UI**（如 `cameraEditMode:'global'`），不参与五词「正在编辑」。

## 随习惯 vs 全局底座

**随习惯 / 应用场景**：按键触发·目标·收尾、`voiceOverride`、`cameraOverride`（动作）、`appBehaviorRules`、`codexMicroPad`。

**全局底座（不进 mapping）**：摄像头设备、校准、美颜/面具；语音 SAPI/Vosk/KWS 引擎 baseline。

## Camera 写入门闩

`ui.cameraEditMode = 'global' | 'appScenario'`

- `'global'`（默认）：动作与设备/校准走 `cameraPrefs`。
- `'appScenario'`：仅识别**动作**写 `cameraOverride`；设备/校准/美颜仍写全局底座。

进入 `appScenario` 的充分条件（与导航对齐）：

```text
habitScenarioReturnPanel === 'camera' && habitScenarioReturnId
```

并同步 `selectedMappingId === habitScenarioReturnId`。

**禁止**仅因 `selectedMappingId` 碰巧指向应用场景就静默写 override。

## Soft Pad

- **无全局 pad**；编辑 Soft Pad 时 mapping 选中真相 = `state.selectedMappingId`（与主车道无关）。
- 局部 UI（tab / 子页 / 预览）可留模块内（如 `selectedScopeId`）。
- 空态 CTA：创建 Codex / Claude **应用场景** → 选中新 id；**默认不**自动 `activeSceneId`（除非文案为「创建并使用」）。
- **专用边界**：Soft Pad 服务 Agent 应用场景。Hub 主列表 = **Codex / Claude / Cursor / WorkBuddy / Trae / Qoder**（MiniMax 不进 Hub 主列表）。Cursor 诚实上限 = 官方 Lifecycle Hooks + Desktop Automation（focus/chord）；**默认** `can_observe_needs_input=false`，不凭推断参加 Auto 等待抢主控。Copilot Cloud Agent **不**参与桌面抢主控。
- **顶栏 `topbar_habit_ids`**：状态栏观察 / 跳转入口（忙闲展示、点进习惯），**不是**钉主控。运行 pin 已移除；Soft Pad 主控始终 Auto。切换 `activeSceneId`（含切到「通用」习惯）**不会**关掉 Soft Pad 键位主控——按键/语音/摄像头动作跟正在使用习惯，Soft Pad 键位跟 Auto 车道。
- **摄像头分层**：设备、校准、美颜与默认 presence action 在全局底座 `cameraPrefs`（对外可叫通用摄像头设置）；**不要**说 baseline mapping 存了 `cameraPrefs`。仅应用场景例外动作进 `cameraOverride`。

### 多 Agent 车道（Runtime Arbiter）

一块 Soft Pad 表面。**Phase 1B cutover 后**：`displayLane === dispatchLane === AppliedDecision`（同源同锁 agent_routes）。

| 模式 | 优先级 |
|------|--------|
| Auto（唯一模式） | needs_input（Attention 投影）> foreground > fallback > none |

~~Pinned / 暂时设为~~ 已从产品移除：Hub 应用标签只负责**浏览/编辑**配置；运行时始终自动跟随前台（+ waiting / fallback）。

| 概念 | 含义 |
|------|------|
| `ShadowDecision` | 1A 诊断产出；**不是**已生效路由 |
| `AppliedDecision` | 路由已原子 swap；UI「当前控制」只读它 |
| `AgentAttentionStore` | 官方 App Server / Hooks / OneTone ask 事实仓；`waiting_kinds` **仅**从此投影 |
| `dispatchReady` | `padEnabled && faceCompatible && capabilities.can_focus∧can_send_chord` |
| `PadFace` / `AgentCatalog` | 键位模板与产品身份；`app_target_id` 仅为兼容 fallback |
| `agent_routes` | 仅 Applied mapping；`lane=null` 时必须为空 |
| `system_routes` / ENC·NP | 全局系统键，独立 gate |
| FE confirming | 本地 `!receivedFirstSnapshot`，不是 Rust availability |
| `sync_hook_cache` | 仅代理 `request_soft_pad_recompute` |

FE `resolvePrimaryLaneResult` = oracle / Hub 预览（无 pin）；正式首页在 cutover 后读 Rust Applied。`cmd_soft_pad_set_follow` 保留为清 pin / Auto 兼容入口。

**waiting_kinds 规则**：AppServer / Native / 官方明确等待 Hook / OneTone ask → 可进；Inferred（FG/标题/文本）→ **只点灯，禁入**。PadStatus 24h sticky **不得**直喂 Arbiter。投影变化才 `request_soft_pad_recompute`。

### 五级诚实能力

1. Official App Server  
2. Official Lifecycle Hooks  
3. Desktop Automation（focus + chord）  
4. Inferred Status（只点灯）  
5. Official Native Hardware（Codex Micro — 体验参考，非第三方协议）

Skills 只负责 Hook 安装/配置/诊断，**不是**实时状态源。

### 状态源目标态

| 角色 | 权威源 |
|------|--------|
| 正在使用 | `config.activeSceneId` |
| 正在编辑（习惯） | `state.selectedMappingId` |
| Soft Pad 主车道（displayLane） | `resolvePrimaryLane` / `Result`（仅 padEnabled） |
| Soft Pad Hub tab | `selectedScopeId` / `pickHubDefaultScopeId`（浏览/编辑，非运行跟随） |
| Soft Pad 运行跟随 | 始终 Auto（waiting → foreground → fallback）；无暂时固定 |
| Soft Pad 编辑 mapping | `state.selectedMappingId`（禁止模块私有 mapping 真相） |
| 语音 UI 哨兵 | 可映射到 null + 局部「配全局底座」 |
| Camera 编辑模式 | `ui.cameraEditMode` |

## 批次

- **B0**：本文档 + i18n 对齐五词。
- **B1**：Voice 代理、Soft Pad 去私有 mapping 选中、Camera 门闩、Soft Pad 空态 CTA。
- **B2（首页通道表面）**：首页四卡 = **正在使用**习惯的 keys/voice/camera/softPad 摘要与入口；点卡打开对应通道配置；点下方习惯 = `activateScene`（设为正在使用）并刷新四卡。习惯卡「编辑」只改 `selectedMappingId`，不切换运行。Hub「通用设置」不再画四通道栅格（薄入口）。aside 大统管条仍可后续迭代。
- **B2+（可选）**：aside / 更深统管条 — 在 B2 首页通道验收后再开。
