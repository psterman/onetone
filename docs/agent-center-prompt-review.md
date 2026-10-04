# Agent Center 改造 Prompt 可执行性评估

评估对象：拟交付 Cursor 执行的「Agent Center 生产化改造」Prompt
评估日期：2026-10-04
评估方式：逐条到代码库核实 Prompt 的每一处前提（不读 Prompt 自述，读代码）

## 结论

| 部分 | 评级 | 判定 |
|---|---|---|
| Registry 后端（二～六节） | **A-** | 前提全部核实为真，可直接执行 |
| UI 改造（七节） | **D** | **落点文件列错，会改到错误文档** |
| 测试与验收（八～九节） | **C+** | 命令真实存在，但缺基线、缺 3 个会被打破的测试 |
| **综合** | **B-** | **修 D1/D2/D3 + 补基线后可交付执行** |

一句话：**这份 Prompt 会产出一个能跑的后端和一个建错地方的 UI。**

---

## 一、前提核验（读代码所得，非 Prompt 自述）

### 1.1 勘察清单 21 项 —— 全部命中 ✅

`store.rs` / `snapshot.rs` / `agent_install_inventory.rs` / `model.rs` / `agent_catalog/mod.rs` /
`agent_usage.rs` / `shell_agent_usage/` / `session_events.rs` / `agent_home_cmd.rs` /
`src/index.html` / `probe-agent-dbs.py` / `agent-center-audit.md` / 两份 specs / `settings-drawer.js`
—— 全部存在。`src/js/features/agent/` 23 个文件、`src/js/features/now/` 13 个文件。

### 1.2 技术断言核验

| Prompt 断言 | 实勘结果 | 判定 |
|---|---|---|
| migration 已到 v4，新增应用 v5 | `MIGRATION_V1~V4` 确存 | ✅ 正确 |
| V4 静默吞错需修正 | `store.rs:187 let _ = conn.execute_batch(MIGRATION_V4);` | ✅ 确认 |
| `AgentKind` 16 个成员 | `soft_pad_runtime/model.rs:8`，正好 16 | ✅ 精确 |
| Hermes/OpenClaw/Marvis/Antigravity/Kimi 不在枚举 | 16 成员中确无 | ✅ 正确 |
| `provider_observed` 是既有事件类 | `agent_memory/model.rs:155 EVENT_CLASS_OBSERVED` | ✅ 存在 |
| `app_identity` 可复用 | `src-tauri/src/app_identity.rs`（1030 行） | ✅ 存在 |
| 左侧 Agent 入口存在 | `index.html:143 wbNavAgent` + `:147 wbNavAgentData` | ✅ 存在 |
| `cmd_agent_center_*` / `agent_registry` 未实现 | 全项目 0 命中 | ✅ 无重复造轮子 |
| npm 脚本 `typecheck`/`test:agent-home-pulse`/`test:agent-detect-home`/`test:islands`/`build` | 五者全部存在 | ✅ |
| 工作区脏（边界第 7 条） | `git status --porcelain` = **106 项改动** | ✅ 边界有意义 |

**结论：Prompt 的后端功课做得扎实，未发现虚假前提。**

---

## 二、致命缺陷

### D1（最硬）—— Agent 入口是**双层 iframe**，Prompt 列错了文件

```
src/index.html:4499   <iframe id="agentProtoFrame" src="agent-proto/agent-page?embed=1">
   └─> src/agent-proto/agent-page.html        （3106 行，内含 html.ot-embed 分支样式，确认 embed 生效）
         └─> :907  <iframe id="agentDataNestFrame" src="agent-data?embed=1&nest=1">
```

路由链实证：`settings-drawer.js:23` → `agent:'settingsPanelAgent'` → 上述 iframe。

**Prompt 勘察清单列了 `src/index.html` 和 `src/js/features/agent/`，唯独没有 `src/agent-proto/agent-page.html`。**

后果：实现者在 `index.html` 里找不到名册容器（只有 iframe 标签），在 `features/agent/*.js` 里造出的 DOM 挂不到 iframe 内部文档上 → 名册永远不显示，或被迫新建第三层 iframe。这是 100% 返工项。

**附带影响**：Prompt 说「跨 Agent 成本比较进入现有『数据』入口」——那个「数据」入口是 agent-page.html 的**嵌套子 iframe**，不是同级页面。名册在主 iframe、对比表在子 iframe，跨层通信必须走既有 postMessage 桥（`agent-data-bridge.js`）。Prompt 未说明这一点。

### D2 —— 已存在第三份 Registry SSOT，Prompt 全文未提

`src/js/features/agent/soft-pad-agent-registry.js`（57 行）文件头原文：

> *Agent registry SSOT for Soft Pad agent face (v12b). Mirrors `agent_catalog/mod.rs` capability honesty — update both when adding agents.*

已有 16 条 `ENTRIES`，字段 `kind / appId / connectKind / caps{topbar,keys,ambient,session}`。

新增 `agent_registry` 表后，同一个「agent 能力事实」将存在 **三处真源**：
1. `src-tauri/src/agent_catalog/mod.rs`（545 行）
2. `src/js/features/agent/soft-pad-agent-registry.js`
3. 新的 `agent_registry` 表

**顺带一个真实 bug（实证）**：前端用全小写 `workbuddy` / `minimax` / `opencode`；而 Rust `AgentKind` 带 `#[serde(rename_all = "camelCase")]`，序列化产出 `workBuddy` / `miniMax` / `openCode`。

Prompt 的 ID 规则 `kind:workbuddy` 与**前端一致、与 Rust serde 不一致**。若实现者用 `serde_json::to_string(&kind)` 生成 `agent_id`，会写出 `kind:workBuddy`，与既有 `workbuddy` 对不上 → **3/16 个 Agent 静默 upsert 出重复行**。

### D3 —— `agent_attention` 是进程内存，不是持久表

`src-tauri/src/agent_attention/store.rs` 全部是 `static Mutex<...>` / `HashMap<AgentKind, Instant>` / `AtomicU64`，**无 SQLite**。

Prompt 把它与 `agent_sessions` / `agent_events` 并列为「已有来源」合并——可读，但它是**进程内存态，重启即空**。若不明示，「需要处理」分组在冷启动首帧会为空却被渲染成「正常无待办」，与「不伪造」原则冲突。

---

## 三、会导致「测试全绿但实际坏」的缺口

### D4 —— 验证命令缺 3 个必跑项

Prompt 列 6 条命令。改 Agent 面必然触及但未列入：

| 必跑 | 原因 |
|---|---|
| `npm run test:home-default-surface` | **唯一断言首页默认面的测试**，也是 Fusion G 的守门人；Prompt 承诺不改主首页，必须用它自证 |
| `test:soft-pad-*` 全套 | `test:islands` 已含 `soft-pad-face-routing` / `soft-pad-four-panel-experience`，但名册若落到 soft pad agent face 会连带影响 |
| 孤儿测试（无任何 npm script 覆盖） | `scripts/agent-data-bridge.test.js`、`agent-page-preview-bridge.test.js`、`agent-page-settings-bridge.test.js`、`agent-install-quick-connect.test.js`、`soft-pad-mini-agents.test.js` —— **改 iframe 页面会打破它们，但 CI 不会报** |

最后一行是最隐蔽的风险：**全绿 ≠ 没坏**。

### D5 —— 缺改造前基线

Prompt 第九节要求「区分本次引入 / 工作区原有 / 环境问题」，但**没有要求在动手前先跑一遍基线**。当前工作区有 106 项脏改动，无基线则事后无法归因，这条要求会落空。

### D6 —— 「不复制第二套 Living/Continue/Recent」无可验证判据

Prompt 要求复用，但没给可断言的判据，Cursor 不会自证。可测写法：

- 断言 `cmd_agent_center_snapshot` 与 `cmd_agent_home_snapshot` 对同一 `asOf` 窗口返回**相同 session id 集合**；
- 断言前端新增文件数为 0（只允许改 `agent-page.html` + 1 个 bridge）；
- 或断言前端未新增任何 `living/continue/recent` 的 store key。

---

## 四、次要缺口（不阻塞）

- **D7** `test:agent-center` 未说明是否并入 `test:islands`。`test:islands` 才是聚合入口，不并入等于不进 CI。
- **D8** Prompt 标题「首页 Agent Center 改造」与 Summary「不放到主首页」措辞冲突，易被实现者误解。
- **D9** `index.html` 用 `data-i18n="homeWbNavAgent"`，新增文案需走同一套 i18n，Prompt 未提。
- **D10** 640×680 双层 iframe 下抽屉会溢出**子 iframe** 而非窗口，需指定抽屉挂载到 `agent-page.html` 的 `body` 且 `ot-embed` 分支已适配。

---

## 五、建议直接补进 Prompt 的修补段落

### 5.1 修 D1 —— 替换勘察清单

```text
将勘察清单中的
  - src/index.html
替换为（并保留原有 src/index.html）：
  - src/agent-proto/agent-page.html        ← Agent 名册与详情的真实落点（3106 行，由
                                             index.html:4499 的 iframe 加载，embed=1）
  - src/agent-proto/agent-data.html        ← 「数据」入口，是 agent-page.html 的嵌套子 iframe
  - src/js/features/agent/agent-data-bridge.js   ← 主/子 iframe 间 postMessage 桥，跨层通信必须复用

约束：路由链为 index.html → iframe(agent-page.html) → iframe(agent-data.html)。
Agent Center 名册与详情建在 agent-page.html 内；跨 Agent 成本比较若放入「数据」入口，
必须经 agent-data-bridge.js 通信，不得新建第二套桥。
```

### 5.2 修 D2 —— 追加 SSOT 与 ID 生成约束

```text
现有第三份 registry SSOT：src/js/features/agent/soft-pad-agent-registry.js（16 条 ENTRIES，
含 appId / connectKind / caps）。本次改造必须明确它与新 agent_registry 表的关系：
  - 选项 A（推荐）：将前端 SSOT 改为从 cmd_agent_center_snapshot 读取，删除 ENTRIES 硬编码；
  - 选项 B：保留前端 SSOT 仅服务 Soft Pad 灯效，并在文件中注明「能力真源已迁移至
    agent_registry 表，此处仅保留灯效映射」。

禁止：三处各自维护同一份能力事实。

agent_id 生成必须使用手写稳定映射表，禁止使用 serde 派生。因为
AgentKind 带 #[serde(rename_all = "camelCase")]，serde 会产出 workBuddy / miniMax / openCode，
与既有前端 workbuddy / minimax / opencode 不一致（3/16 冲突），将导致重复行。
```

### 5.3 修 D3 —— 追加 attention 语义

```text
agent_attention 为进程内存态（src-tauri/src/agent_attention/store.rs 全为 static Mutex，
无持久表），重启即空。snapshot 中「需要处理」分组须区分：
  - 冷启动且 attention 未初始化 → 显示「正在初始化」，不得渲染为「无待办」；
  - 已初始化但为空 → 才显示「无待办」。
```

### 5.4 修 D4/D5 —— 追加基线步骤

```text
第零步（编码前必做）：先完整跑一遍
  npm run typecheck && npm run test:agent-home-pulse && npm run test:agent-detect-home
  && npm run test:home-default-surface && npm run test:islands
  && npm run test:agent-detect-home
并将结果存为 BASELINE（写入交付报告）。当前工作区有 106 项未提交改动，
无基线则第九节的归因要求无法执行。

第九节验证命令补充：
  npm run test:home-default-surface          （Fusion G 守门）
  node scripts/agent-data-bridge.test.js
  node scripts/agent-page-preview-bridge.test.js
  node scripts/agent-page-settings-bridge.test.js
  node scripts/agent-install-quick-connect.test.js
  node scripts/soft-pad-mini-agents.test.js  （以上五个为孤儿测试，不被任何 npm script 覆盖）
```

### 5.5 修 D6 —— 追加可验证判据

```text
「不复制第二套 Living / Continue / Recent」须给出可断言证据，至少满足其一：
  - test-agent-center.mjs 中构造同一 asOf 窗口，断言 cmd_agent_center_snapshot 与
    cmd_agent_home_snapshot 的 session id 集合完全一致；
  - 或断言前端未新增任何 living/continue/recent 相关 store key 与渲染函数。
```

---

## 六、最终判定

**后端部分（二～六节）现在就可以交给 Cursor** —— 前提全部核实为真，无虚假断言。

**UI 部分（七节）必须先补 5.1～5.3，否则会产出「能编译、能过部分测试、但名册看不到」的结果。**

补齐后综合评级可到 **A-**，可交付执行。
