# 虚拟键盘方案评估（修订版）

## 当前项目架构

### 核心技术栈

```
当前项目不是旧的 C#/WPF 项目，而是基于 Tauri 的现代架构
├── src-tauri/          (Rust 后端)
│   ├── config.rs       (核心配置和数据结构)
│   ├── codex_numpad_layer.rs
│   ├── codex_micro_overlay.rs
│   └── scene_config.rs
└── src/js/            (前端 React/Preact UI)
    ├── features/agent/
    │   ├── codex-micro-pad-ui.js
    │   └── soft-pad-hub-ui.js
    ├── features/settings/
    │   └── keys-panel-ui.js
    └── features/voice/
        └── voice-schemes-ui.js
```

### 真实核心模块

| 模块 | 文件 | 状态 |
|------|------|------|
| **Soft Pad 配置** | `mapping.codexMicroPad` | ✅ 已有但未产品化 |
| **多应用场景支持** | `appTargetId` + `appBehaviorRules` | ✅ 数据结构完整 |
| **语音方案系统** | `voice-schemes-ui.js` | ✅ 成熟完善 |
| **方案切换** | 托盘菜单 + 首页 | ✅ 已有 |
| **Claude Activity 灯** | `pad_status/claude_lights.rs` | ✅ 自研聚合和诊断 |
| **虚拟键盘页** | 初步有，IA 需对齐 | ⚠️ 部分完成 |

## 重新评估功能完成度

### 之前的评估是错的

❌ 之前按 C#/WPF 项目评估
❌ "方案管理 0%" - 实际有完整的语音/habit 方案系统
❌ "场景感知 0%" - 实际有 appTargetId + 前台识别 + voice override

### 真实状态

| 模块 | 状态 | 说明 |
|------|------|------|
| **Soft Pad 配置持久化** | ✅ 已有 | 挂在 `mapping.codexMicroPad` |
| **Codex Soft Pad UI** | ✅ 较成熟 | `codex-micro-pad-ui.js` |
| **Claude Activity 灯** | ✅ 已有 | 自研聚合与诊断 |
| **虚拟键盘独立页** | ⚠️ 部分完成 | IA 还需对齐按键/语音 |
| **多应用 Soft Pad** | 📦 数据完整但未产品化 | 有数据基础 |
| **通用 KeyboardScheme** | ❌ 不建议第一刀做 | 没必要新建第二套模型 |
| **场景感知 Soft Pad** | 📦 数据有但未产品化 | 基于现有 appTargetId 扩展 |
| **可视化编辑器** | ⚠️ 部分完成 | 有预览和局部管理，未达到通用编辑器 |

## 核心架构概念

### 当前已有结构

```
Mapping (配置根)
├── appTargetId (应用目标 ID)
├── appBehaviorRules (应用行为规则)
├── codexMicroPad (Soft Pad 配置)
│   ├── keys (按键映射)
│   └── mode (模式)
└── voiceConfig (语音配置，方案体系成熟)

Scheme/Template (方案系统)
├── 语音方案（已有，很完整）
├── Habit profile（习惯配置）
└── 软键盘方案（需产品化，基于现有结构）

Scene 场景系统
├── appTargetId (应用识别)
├── 前台检测
└── voice override（语音覆盖）
```

## 重新评估技术债务

### 真实债务（不是旧 C# 项目的债务）

| 债务 | 优先级 | 说明 |
|------|--------|------|
| 虚拟键盘页 IA 对齐 | P0 | 按键/语音配置对齐，迁出 keys page 大入口 |
| Soft Pad 方案口径统一 | P1 | 用现有 mapping.appTargetId + codexMicroPad，不新建第二套模型 |
| 可视化编辑器完善 | P2 | 有基础，需完善到通用编辑器 |
| 多应用 Soft Pad 产品化 | P2 | 基于现有数据结构 |
| 导入/导出 | P2/P3 | 基于现有 mapping 导出 Soft Pad 子配置，不引入全局 KeyboardScheme |
| 更强场景感知 | P3 | 应用前台、Claude Hook 近窗、Codex FG、用户钉住、CLI latch 分层 |

### 旧 C# 项目的债务忽略

❌ RadialMenuLayerKind - 不是当前项目问题
❌ SettingsService.cs - 不是当前项目的核心结构
❌ AppSettings.cs - 不是当前项目的核心结构

## 推荐实施路径

### Phase 0: 先理解当前数据结构（前置）

先不要改代码，先写一份 `VirtualKeyboard-IA-Alignment.md`

1. 分析 `config.rs` 中的 codexMicroPad 结构
2. 分析 voice schemes 的数据结构（参考）
3. 整理 appTargetId + codexMicroPad 如何配合工作
4. 明确用户心智：按键 -> voice -> app 三栏如何联动

### Phase 1: 虚拟键盘页 IA 收口（P0）

**目标：虚拟键盘页独立入口，三栏清晰 IA**

```
首页/虚拟键盘页
├── Left: Soft Pad 配置区
│   ├── 可视化键盘预览
│   └── 按键功能编辑
├── Center: Voice 配置区 (复用现有)
│   └── voice-schemes-ui.js 嵌入
└── Right: 方案列表 + App Targets
    ├── 方案列表（复用 voice scheme UI）
    ├── App Targets（基于 appTargetId）
    └── 托盘切换（已有）

Keys Page 简化
└── 只保留硬键盘设置，软键盘全搬去虚拟键盘页
```

### Phase 2: Soft Pad 方案口径统一（P1）

**目标：不引入新的 KeyboardScheme 模型，复用现有体系**

```
扩展现有数据结构（不新建第二套模型）

Mapping.codexMicroPad 现有结构：
{
  keys: {...} 
  mode: 'numeric' | 'ai',
  appTargetId: string,  // 关联应用目标
}

只需：
1. 在 appTargetId 层面关联 codexMicroPad 配置
2. 复用 voice scheme UI 来显示软键盘方案列表
3. 不要新建 "KeyboardScheme" 新模型，避免两套体系混乱
```

### Phase 3: 可视化编辑器完善（P2）

**目标：现有基础上增强到通用编辑器**

```
现有功能
✅ 键盘预览
✅ 按键功能绑定
✅ 颜色状态显示

需新增
🔨 拖拽排序
🔨 按键配色编辑器
🔨 冲突检测提示
🔨 方案模板导入/导出（基于现有 mapping 子对象）
```

### Phase 4: 导入/导出与模板（P2/P3）

**目标：基于现有 mapping 结构，不引入全局 KeyboardScheme**

```
导出：
- 从当前 mapping 中提取 codexMicroPad + 相关 appBehaviorRules
- 导出为 JSON 文件
- 带版本号和元数据

导入：
- 读取 JSON，验证兼容
- 合并到当前 mapping，或新建 app behavior rule
- 与当前 voice scheme 保持一致的模式
```

### Phase 5: 更强场景感知（P3）

**目标：分层场景感知系统**

```
场景检测源
├── 应用前台检测（已有）
├── Claude Hook 近窗（已有）
├── Codex 前台（已有）
├── 用户主动钉住
└── CLI latch（命令行临时触发）

优先级（从上到下覆盖）
1. 用户钉住
2. CLI latch
3. Claude Hook 近窗
4. Codex 前台
5. 应用前台

配置：Soft Pad 方案按场景自动切换
```

## 用户心智模型设计（修正版）

### 核心概念

| 概念 | 类比 | 说明 |
|------|------|------|
| **方案 (Scheme)** | 遥控器预设 | 已有！参考 voice-schemes-ui.js，软键盘复用该模式 |
| **应用目标 (App Target)** | 场景/环境 | 已有！appTargetId + appBehaviorRules |
| **按键 (Key)** | 按键 | 已有 codexMicroPad.keys |
| **绑定 (Binding)** | 按键功能映射 | 已有 mapping 体系 |

### 用户工作流

**场景：日常使用**

```
1. 首页看到当前软键盘 + voice 方案
2. 虚拟键盘页：左栏软键盘预览，中栏语音，右栏方案+应用
3. 托盘快速切换方案
4. 换 App 时，自动切换到该 App 的 Soft Pad 配置
```

**场景：新建方案**

```
1. 在虚拟键盘页，从现有方案复制
2. 左栏编辑按键
3. 中栏调 voice（如果需要）
4. 右栏选择关联哪些 app targets
5. 保存或导出分享
```

## 文件位置

| 内容 | 文件路径 |
|------|---------|
| 旧评估文档 | `VirtualKeyboardSchemeAnalysis.md`（建议归档） |
| Codex Micro Pad UI | `src/js/features/agent/codex-micro-pad-ui.js` |
| 配置核心结构 | `src-tauri/src/config.rs` |
| 语音方案 UI | `src/js/features/voice/voice-schemes-ui.js` |

## 关键总结

### ✅ 不要做

- ❌ 不要新建全局 KeyboardScheme 模型（已用 voice scheme + mapping.codexMicroPad）
- ❌ 不要重构 RadialMenuLayerKind（当前项目没有这个概念）
- ❌ 不要做大而全的系统

### ✅ 应该做

- ✅ 虚拟键盘页 IA 对齐，迁入按键配置，迁出 keys page
- ✅ 复用现有 mapping.appTargetId + codexMicroPad 作为 Soft Pad 方案
- ✅ 参考 voice scheme UI，复用右栏方案列表
- ✅ 基于现有 mapping 做子配置的导入导出
- ✅ 分层场景感知（先简单，后复杂）
