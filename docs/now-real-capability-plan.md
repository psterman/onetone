# OneTone 首页「真实能力」改造 · 执行 Prompt

> 用途：交给 AI 编码代理或工程师直接执行。所有事实均已核验，附 `文件:行号`。
> 项目根：`E:/voice-pilot`

---

## 0. 背景

首页 `now` 目前是**场景管理器**：它显示 `active.helping` —— 一个写死的静态文案数组
（`prototypes/onetone-now-home/fixtures.js:7`，内容如「保持专注 / 管理通知 / 保护工作窗口」）。

这造成一个根本问题：**首页承诺「OneTone 正在帮你」，但展示的是预设文案，不是真实发生的事。**

改造目标：把首页从「**承诺**」换成「**证据**」——展示 `ActionHistory` 里今天真正执行过的动作。

数据侧**已完全就绪**，本次工作以 FE 接线为主，Rust 仅有一处必须修的持久化 bug。

---

## 1. 已核实的事实（不要重新调查，直接采信）

### 1.1 ActionHistory：数据完整，IPC 已暴露，FE 零消费

```rust
// src-tauri/src/action_history/model.rs:10-27
pub struct ActionHistoryEntry {
    pub id: u64,
    pub ts_ms: u64,           // 毫秒时间戳
    pub channel: String,      // key | voice | softPad | camera | system
    pub kind: String,         // semantic_action | session | voice_phrase | send_key | lane_nav | pad_press
    pub action_id: Option<String>,
    pub mapping_id: Option<String>,
    pub provider_id: Option<String>,
    pub slot_id: Option<String>,
    pub status: String,       // executed | pendingConfirmation | unavailable | unsupported | failed | cancelled
    pub summary: String,      // ★ 已在 Rust 侧拼成中文成品
    pub detail: Option<String>,
}
```

**`summary` 不需要前端再翻译**（`action_history/summary.rs:58-71`）：

```rust
// 有习惯名 → "摄像头 · 创作中 · 回到当前 Agent"
// 无习惯名 → "摄像头 · 回到当前 Agent"
format!("{} · {} · {}", channel_label(source_channel), map_label, act_label)
```

- `channel_label()`（`summary.rs:34-43`）已有中文映射：`key→按键`、`voice→语音`、`softPad→SoftPad`、`camera→摄像头`、`system→系统`
- `action_label()`（`summary.rs:28-32`）走 `semantic_meta_by_id(id).label_zh`，动作中文名自动获得

**IPC 命令已全部存在**（`ipc/commands/shell/action_history_cmd.rs`）：

| 命令 | 行号 | 用途 |
|---|---|---|
| `cmd_action_history_list(limit, channel, mapping_id, before_ts, hours)` | :26 | ★ 本次主要用这个 |
| `cmd_action_history_stats(hours)` | :48 | 按习惯统计 |
| `cmd_action_history_clear()` | :80 | — |
| `cmd_action_history_analyze_summary(...)` | :99 | — |

`tail()` 签名（`action_history/log.rs:210`）已支持时间窗 `hours` 与游标 `before_ts`，
返回 `ActionHistoryListResult { entries, has_more }`，**已按时间倒序**。
`MAX_TAIL_LIMIT = 200`（`model.rs:6`），`RING_CAPACITY = 500`。

**关键事实：`src/js` 全目录零处消费 action history。数据一直在记，没有任何读取方。**

### 1.2 needsYou：数据都在，缺文案投影

- `AttentionPublicSnapshot`（`agent_attention/model.rs:131`）含 `waiting_kinds` + `rows`
- `AttentionState` 五态：`NeedsInput / Working / Idle / Complete / Error`（`model.rs:16`）
- `AttentionCause`（`model.rs:38`）：`Permission → WaitingApproval`、`Elicitation / UserInput / OneToneAsk → WaitingText`
- Pending TTL 已有：`pending_confirm::list_public`（`lib.rs:120`）→ 支撑「已经等你 N 分钟」

**缺失**：`cause → 中文标题 + 行动动词` 的映射表。
原型里的 `ctaLabel{approve_rm:'查看并决定', keep_quiet:'继续别打扰'}`（`prototypes/onetone-now-home/now.html:96-101`）**目前只存在于 fixtures**。

### 1.3 两个必须修的 Rust/FE 缺口

**缺口 A · `runtimeHabitControl` 跨保存丢失（独立 bug）**

- FE 认真序列化了：`config-persist.js:1259-1268` 完整处理 `softOverride` + `pin`
- 默认值与自愈：`config-persist.js:997`、`config-persist.js:1060-1065`
- **但 `src-tauri/src/config.rs` 里完全没有 `runtime_habit_control` 字段**
  （已用 grep 核实，`runtime_habit_control` / `RuntimeHabitControl` 零命中）
- 后果：serde 反序列化时丢弃 → 存盘不写回 → 「临时选用 / 固定」徽标活不过一次保存
- 参考同类字段写法：`config.rs:2434` `follow_foreground_app_scenario`（`#[serde(default, rename = "...")]`）

**缺口 B · `assists` 存中文 label，改文案即静默失效**

- `now-model.js:276` → `m.assists = enabled`，内容是 `["保持专注", "减少消息打扰"]`
- `config.rs:1419-1422` → `pub assists: Vec<String>`（存中文）
- 链路是 **ID → label → 存 label → label → 查 ID**（`now-model.js:203-208` + `:221-230`）
- 改一次文案，用户已存的开关全部对不上，**静默全关，无报错**
- ⚠️ **Phase 3「assists 驱动执行层」前必须先修**，否则执行层会按中文串匹配动作 ID
- 现有持久化保护**做得很好，要保留**：
  - `config.rs:6020-6026`（mappings）/ `:6053-6058`（trash）保留逻辑
  - `config.rs:5926-5934` `mapping_json_has_assists()` 区分「字段缺失」与「传了空数组」
  - 测试 `merge_save_payload_preserves_assists_when_omitted`（`config.rs:8342`）
  - 测试 `merge_save_payload_allows_clearing_assists_when_explicit`（`config.rs:8358`）

### 1.4 命名约束（硬性）

`docs/HABIT_UNIFIED_CONTRACT.md:17-27` 定义了「稳定五词」，并明确：

> 禁止混用：方案、**情景**、场景方案、Soft Pad scheme、语音方案、运行场景。

但 `prototypes/onetone-now-home/` 全线使用「情景」（含 `fixtures.js:1` 注释）。

**决策留给用户，本次任务不要擅自改词。** 若要在 UI 继续用「情景」，
需先请用户确认是否把「情景」正式纳入契约五词并从 `:27` 的禁用清单中删除。

---

## 2. 任务

按顺序执行。**任务 1 / 2 / 3 彼此独立，可并行；任务 4 依赖 1。**

---

### 任务 1 · 首页接入今日时间线 ★ 最高优先级

**目标**：首页把 `helping`（静态承诺）替换为 `today`（真实记录）。

**新建文件**：`src/js/features/now/now-today.js`

遵循现有 IIFE 模块范式（对照 `now-model.js`）：

```js
/**
 * Now home — today's real actions from action history.
 * Backend already ships user-language `summary`; do NOT re-translate here.
 */
(function (global) {
  'use strict';
  ...
})(typeof window !== 'undefined' ? window : globalThis);
```

**必须实现**：

1. `loadToday(hours)` — 调用 `invoke('cmd_action_history_list', { limit: 200, hours: hours || 14 })`
2. 过滤：只保留 `status === 'executed' || status === 'pendingConfirmation'`
3. 映射为时间线条目，**直接用 `entry.summary`，不重新翻译动作名**
4. 通道图标映射：`camera→👁`、`voice→🎤`、`key→⌨️`、`softPad→●`、`system→⚙`
5. 暴露 `global.OneToneNowToday = { loadToday, CHANNEL_ICON, bucketOf }`

**参考实现（约 30 行）**：

```js
function loadToday(hours) {
  return invoke('cmd_action_history_list', { limit: 200, hours: hours || 14 })
    .then(function (res) {
      var entries = (res && res.entries) || [];
      return entries
        .filter(function (e) {
          return e.status === 'executed' || e.status === 'pendingConfirmation';
        })
        .map(function (e) {
          return {
            id: e.id,
            time: fmtTime(e.tsMs),
            text: e.summary,        // Rust 已拼好的中文成品
            src: CHANNEL_ICON[e.channel] || '•',
            channel: e.channel,
            ok: e.status === 'executed',
            actionId: e.actionId || null
          };
        });
    });
}
```

**修改** `src/js/features/now/now-model.js`：

- `projectFromRuntime()`（`:293-364`）新增 `today: []` 字段，**不要用 fixtures 覆盖**
- `helping` 语义调整：
  - `today.length > 0` → 首页显示 `today`
  - `today.length === 0` → 才回落到 `helping`（`fixtures.js:7` 那套引导文案）
  - **这保留了新手引导，又不让它冒充事实**

**修改** `src/js/features/now/now-home.js`：

- `paint()` / 渲染处插入「它今天为你做了什么」区块，位置在「我看到的你」之下、「需要你决定」之上
- 区块结构：
  - 头部：`12 次` 大数字 + 四个分类计数（减少打断 / 恢复环境 / 保护隐私 / 提醒状态）
  - 主体：时间线，每条 = `时间` + `summary` + 右侧通道图标
  - 空态：`今天还没有记录`（**不要**编造条目）
- 保留现有 `data-activate` 等交互不变

**参考原型**：`prototypes/now-real-capability.html` 视图 0。

**⚠️ 禁止**：不得硬编码任何时间、数字、summary 文本。全部来自 IPC 返回。

---

### 任务 2 · 修 `runtimeHabitControl` 持久化

**改动** `src-tauri/src/config.rs`：

1. 在 `VoiceConfig` 加字段，紧邻 `follow_foreground_app_scenario`（`:2434`）：

```rust
/// Runtime habit control: pin / temporary override. See FE runtime-habit-control.js.
#[serde(default, rename = "runtimeHabitControl")]
pub runtime_habit_control: Option<serde_json::Value>,
```

> 用 `Option<serde_json::Value>` 而非强类型 struct —— FE 侧 schema
> （`runtime-habit-control.js:92-99` 的 `pin.kind` 有 `habit` / `appHabit` 两种）
> 仍在演进，强类型会立刻僵化。等 schema 稳定后再收紧。

2. 在 `VoiceConfig::default()`（`:4465` 附近）加 `runtime_habit_control: None,`
3. 补测试：序列化往返后字段不丢

**验证**：`config-persist.js:1259-1268` 发出的 JSON 里已有该字段，
加完 Rust 字段后「临时选用 / 固定」应能跨保存存活。

---

### 任务 3 · `assists` 改为稳定 ID

**这是 Phase 3 的前置，必须在「assists 驱动执行层」之前完成。**

**改动** `src/js/features/now/now-model.js`：

```js
// 现状（错）：m.assists = enabled;  // ["保持专注", ...] ← 中文 label
// 改为：存 ID，中文只作投影
m.assists = enabledIds;   // ["focus", "quiet", "protect"]
```

- `enabledLabelsForMapping()`（`:221-230`）→ 改名 `enabledAssistIdsForMapping()`，返回 ID 数组
- `ASSIST_CATALOG`（`:185-201`）作为 ID → 中文 的投影表保留
- `resolveActionsForHabit()`（`:232-245`）改为按 ID 判定 `enabled`
- `helpingFromActions()`（`:247-253`）仍用 label 生成文案（这是投影，OK）

**改动** `src-tauri/src/config.rs`：

- `pub assists: Vec<String>`（`:1423`）**类型不变**（仍是 String），但**语义变成 ID**
- 更新注释（`:1419`）说明存的是稳定 ID 而非文案
- ⚠️ **保留** `:6020-6026` / `:6053-6058` 的保留逻辑与两个测试
- 新增测试：`assists` 存 `["focus","quiet"]` 时合并逻辑仍生效

**迁移**：需处理已存中文 label 的旧数据。建议在 `normalizeHabit()` 里做
**「查得到 ID 就用，查不到就当全开」**（fail open，与现有 `if (!m.assists.length) return all` 一致），
并在 `config.rs` 注释里记录这是临时兼容。

---

### 任务 4 · 价值分类 + needsYou 文案投影

**依赖任务 1。**

**4a · 价值分类**（纯 FE）

后端有 `stats_by_mapping`（按习惯）与 `usage_counts_last_days`（按天），
但**没有按价值类型分桶**。在 FE 建映射：

```js
// channel + action_id + status → 四个价值桶
// 减少打断 / 恢复环境 / 保护隐私 / 提醒状态
```

映射表需覆盖 `semantic.rs` 里 camera + key + voice + softPad 四通道的
全部 camera-bindable 动作（9 个，含 2 个 `pendingConfirmation`）。

**4b · needsYou 文案投影**

新建 `AttentionCause → {title, detail, ctaVerb}` 映射：

| cause | 标题 | 行动动词 |
|---|---|---|
| `Permission` | 「批准 {agent} {动作}？」 | 查看并决定 |
| `Elicitation` / `UserInput` | 「{agent} 需要你回复」 | 查看请求 |
| `Working`（长任务） | 「查看进度」 | 查看进度 |
| （用户主动） | 「继续别打扰我」 | 继续别打扰 |

「已经等你 N 分钟」从 Pending TTL 计算。

`now-model.js:360` 的 `needsYou: []` 与 `now-home.js` 对应位置改为消费该投影。

---

## 3. 验收标准

### 任务 1

- [ ] `grep -r "action_history" src/js` **有命中**（当前为零）
- [ ] 首页显示的时间线条目全部来自 `cmd_action_history_list` 返回值
- [ ] **手动清空历史后，首页显示空态而非残留数据**
- [ ] 通道图标正确区分 camera / voice / key / softPad
- [ ] `today` 为空时回落到 `helping` 引导文案
- [ ] Rust 侧**零改动**

### 任务 2

- [ ] 设「临时选用」→ 保存 → 重启 → 仍存活
- [ ] 设「固定」→ 同上
- [ ] `cargo test --lib config` 全绿

### 任务 3

- [ ] `toggleHabitAssist()` 存的是 ID 而非中文
- [ ] 旧数据（中文 label）不导致崩溃，回落全开
- [ ] 现有两个 merge 测试仍通过

### 任务 4

- [ ] 四个价值桶计数之和 = 今日 `executed` 条目数
- [ ] `Permission` 类事件显示「查看并决定」而非泛化「处理」

---

## 4. 禁止事项

1. **不得硬编码**任何时间、计数、summary 文本、状态值。所有来自 IPC。
2. **不得新增** `ActionHistoryEntry` 字段。schema 已够用。
3. **不得删除或弱化** `config.rs:5926-5934` 的「字段缺失 vs 空数组」区分。
   这是防止部分保存静默清空数据的关键。
4. **不得**在 Rust 侧翻译用户文案。`summary` 已是成品，前端只做展示。
5. **不得**擅自把「情景」改成别的词，或反向修改 `HABIT_UNIFIED_CONTRACT.md`——
   先问用户（见 §1.4）。
6. **不得**在任务 1 / 2 / 3 中夹带 presence 接入。那需要用户先决策 A/B 方案。
7. **不得**为了页面好看而把未接入的能力画成已接入。当前
   `ContextSnapshot.presence` **恒为 `Unknown`**，摄像头感知仍在
   `src/js/features/camera/camera2-workbench.js:76-88` 的 FE 内存里，不进 Rust 仲裁层。

---

## 5. 代码风格约定

对照 `src/js/features/now/now-model.js` 现有风格：

- ES5 语法：`var` / `function`，**不用**箭头函数、`const`、模板字符串
- 模块封装：`(function (global) { 'use strict'; ... })(typeof window !== 'undefined' ? window : globalThis);`
- 导出：`global.OneToneXxx = { ... }`
- 错误处理：`try { ... } catch (_) {}` 静默降级（参考 `now-model.js:284`）
- 中文注释说明「为什么」，不复述代码

**Rust 侧**：

- 字段加 `#[serde(default, rename = "camelCase")]`
- 新字段同步进 `VoiceConfig::default()`（否则编译不过）
- 测试命名沿用 `merge_save_payload_*` 风格

---

## 6. 执行顺序建议

```
任务 1（今日时间线）   ← 立刻做，用户可见价值最大
   ↓
任务 2（pin 持久化）   ← Phase 3 徽标迁移的前置
任务 3（assists ID 化） ← Phase 3 执行层的前置
   ↓
任务 4（分类 + 投影）  ← 依赖 1
   ↓
Phase 3 主体           ← 依赖 2、3
   ↓
presence 接入          ← 需用户先定 A/B
```

**任务 1 的理由**：它无前置，且是「AI 主动帮你」这件事**唯一能被用户看见的地方**。
首页其他部分（状态、建议、场景）都还在描述系统「打算做什么」，
只有这块在证明它「已经做了什么」。

---

## 7. 待用户决策（不要自行决定）

### Q1 · presence 接入方案

| 方案 | 做法 | 风险 |
|---|---|---|
| **A** | FE 算好 presence，只上报布尔值 | FE 崩溃/关闭时 presence 消失，仲裁退化为 `Unknown` |
| **B** | Rust 维护 presence 状态，FE 只做上报通道 | 需补 FE↔Rust 心跳与失效兜底 |

**倾向 B**：presence 误报 `Here` 会漏掉隐私保护（「离开保护」是真实的安全功能）。
B 方案下失效必须**降级为 `Unknown` 而非 `Here`**。

### Q2 · 「情景」是否正式纳入契约五词

`HABIT_UNIFIED_CONTRACT.md:27` 禁止使用「情景」，但现原型全线在用。
「情景」比「场景」更贴合 `activeSceneId` 的语义（描述处境而非地点）。
建议：把它正式纳入五词，并从禁用清单删除 —— 否则每个新人都会重新纠结一次命名。

### Q3 · 价值分类的桶边界

「减少打断 / 恢复环境 / 保护隐私 / 提醒状态」这四个桶是我提的草案。
需要确认是否覆盖用户真实关心的维度，以及是否要按用户可配置。
