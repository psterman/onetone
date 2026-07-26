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

- **无全局 pad**；mapping 选中真相 = `state.selectedMappingId`。
- 局部 UI（tab / 子页 / 预览）可留模块内。
- 空态 CTA：创建 Codex / Claude **应用场景** → 选中新 id；**默认不**自动 `activeSceneId`（除非文案为「创建并使用」）。

## 状态源目标态

| 角色 | 权威源 |
|------|--------|
| 正在使用 | `config.activeSceneId` |
| 正在编辑（习惯） | `state.selectedMappingId` |
| 语音 UI 哨兵 | 可映射到 null + 局部「配全局底座」 |
| Camera 编辑模式 | `ui.cameraEditMode` |
| Soft Pad mapping | 禁止模块私有真相 |

## 批次

- **B0**：本文档 + i18n 对齐五词。
- **B1**：Voice 代理、Soft Pad 去私有 mapping 选中、Camera 门闩、Soft Pad 空态 CTA。
- **B2+**：aside / 首页统管条 — B1 验收后再开。
