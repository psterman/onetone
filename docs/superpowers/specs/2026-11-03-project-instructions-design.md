# 项目说明书（Project Instructions）设计

> 日期：2026-11-03
> 状态：设计已批准，待实施
> 关联：`docs/home-agent-capability-matrix.md`（Phase3 `SKILL.md generation` / `workflow export` 当前为 `not_wired`）
> 关联：`docs/research-cli-agents.md`（各 Agent 的 hooks / 存储 / 插件现状横评）

## 1. 背景与问题

OneTone 已经把 Claude Code、Codex、Cursor、OpenCode、WorkBuddy、Trae、Qoder 等 16 种 Agent 接进同一套感知与编排层：hook 探针、`agent_registry`、`agent_memory`、`agent_lane`、Soft Pad 审批与状态灯、`project_context` 有限读取。

但这些能力只解决了「**看住 Agent**」，没有解决「**让 Agent 知道这个项目**」。

用户装好 Codex，切到自己的项目，Codex 对项目一无所知：不知道技术栈、不知道测试命令怎么跑、不知道 Windows 上的坑、不知道这个仓库三个月前在哪个模块栽过。用户于是每次都要重新交代一遍——这是「使用这些 Agent」最大的摩擦，而且完全可自动化。

各 Agent 都已经提供了一条**每次会话必读的常驻指令入口**：

| Agent | 原生入口 | 位置 |
|---|---|---|
| Codex | `AGENTS.md` | `<root>/AGENTS.md`（支持 `AGENTS.override.md`） |
| Cursor | `.cursor/rules/*.mdc` + `AGENTS.md` | 项目根与子目录均支持 |
| opencode | `AGENTS.md` | `<root>/AGENTS.md` |
| Windsurf / Cline / Copilot / Qwen Code | `AGENTS.md` 及各自变体 | 见 §7.2 |
| Gemini CLI | `GEMINI.md`（可 import 其他文件） | `<root>/GEMINI.md` |
| Claude Code | `CLAUDE.md`；**2.1.277 起在没有 `CLAUDE.md` 时原生读 `AGENTS.md`** | `<root>/CLAUDE.md` |

`AGENTS.md` 已是事实标准（Linux Foundation / Agentic AI Foundation 托管），支持面接近通用。

因此 OneTone 缺的不是「又一个 Agent」，而是**这些 Agent 的上游**：一个知道这个项目、并且能把认知写进各家原生格式的源头。

### 1.1 现状的三个硬约束

1. **记忆表是空的。** `cmd_agent_memory_upsert` 有 IPC 注册但**无任何调用方**，`memory_records` 表没有生产写入路径。目前只有事件流（ATR 任务事件、hook 事件日志、`session_events`、`checkpoints`）。
2. **不保存对话原文。** `scripts/claude-hook-probe.js` 的 `SAFE_KEYS` 是刻意白名单（`hook_event_name / session_id / turn_id / cwd / model / permission_mode / tool_name / agent_id / agent_type / stop_hook_active`），**不记 `tool_input`**，`scripts/agent-shell-hook-probe.js` 更以单测 `assert.ok(!('tool_input' in fields))` 守住这条边界。
3. **已经有成熟的「写用户配置文件」模式。** `claude_hook_setup.rs` / `cursor_hook_setup.rs` 都是：预览 → 显式用户确认 IPC → 原子写 + 备份 → 按归属标记撤回。本设计复用同一套模式。

## 2. 目标与非目标

### 2.1 目标

1. 为当前项目生成一份**结构化说明书**，并投影到各 Agent 原生认识的格式。
2. 说明书内容分三类来源：**确定性推导**、**统计信号**、**人工录入**。
3. 候选必须经**用户确认**才能进入说明书；渲染产物不得包含未确认候选。
4. 写入用户项目仓库时采用**受管区块**，绝不覆盖用户既有内容，可撤回。
5. 已确认的说明书条目必须能通过 `query_memory` 查到——使 MCP（`agent_memory_search`）天然覆盖说明书内容。

### 2.2 非目标（v1 明确不做）

- 不做 MCP server（独立议题；本设计只在数据层预留外部 Agent 写入入口）。
- 不做除 `AGENTS.md` 与 Cursor rule 之外的输出目标（见 §7.2 演进）。
- 不做各 Agent「专属段」的内容生产（留空，只保留结构）。
- 不做自动 apply——所有写盘必须经显式用户确认。
- 不做跨项目 / 全局说明书。
- 不做定时自动提炼（v1 手动触发）。
- **不放宽 `SAFE_KEYS`、不记录 `tool_input`、不保存 prompt/response 原文。**

## 3. 外部方案借鉴

只借鉴结构思想，不复制实现。

| 来源 | 借鉴内容 | OneTone 落地 |
|---|---|---|
| AGENTS.md 开放标准（Agentic AI Foundation） | 一份公共 Markdown 作为多工具公共规则源；工具专属文件只做适配 | `AGENTS.md` 为主文件，其余目标为薄适配 |
| Claude Code 2.1.277 | 无 `CLAUDE.md` 时原生读 `AGENTS.md` | 大多数情况无需创建 `CLAUDE.md` |
| Cursor Rules | `.mdc` frontmatter：`description` / `globs` / `alwaysApply`；`@path` 引用而非内联 | Cursor 目标用 `alwaysApply:false` + `@AGENTS.md` 引用，避免双份上下文 |
| Claude Code 文档 | 常驻指令有预算：CLAUDE.md 建议 < 200 行（过长降低遵从度） | 渲染产物超限时告警而非静默截断 |
| Cursor 规则最佳实践 | 「只在 Agent 反复犯同一个错时才加规则」「引用文件而非复制内容」「规则控制在 500 行内」 | 提炼只产出有证据的条目；正文引用而不复制 |
| `claude_hook_setup.rs` | 预览 → 确认 → 原子写 → 备份 → 按标记撤回 | 受管区块写入器复用同一模式 |

**一条被采纳的反面结论**：自动生成的通用规则最先被 Agent 忽略（社区称之为「规则文件是疤痕组织，而疤痕组织无法被生成」）。因此本设计不做「通用说明书生成器」，只做**有证据的候选提炼 + 人工确认**。

## 4. 关键决策记录

| # | 决策 | 选择 | 理由 |
|---|---|---|---|
| D1 | 内容来源 | 跨 Agent 教训提炼 + 人工确认 | 通用规则无差异化；只有 OneTone 知道跨 provider 的教训 |
| D2 | 数据边界 | 零放宽：不记 `tool_input` | 仓库既有设计原则「默认不保存 prompt/response 原文」；统计能力受限但边界清晰 |
| D3 | 真相源 | OneTone 存结构化条目 + 写入 git 受管区块 | 兼顾结构化元数据与开发者 git 工作流；单一真相 |
| D4 | 数据层 | 复用 `memory_records` + 新建 `instruction_candidates` | 复用既有表避免 schema 重复；`query_memory` 直接可查，MCP 闭环 |

### 4.1 D2 的诚实推论

在零放宽约束下，白名单字段能可靠回答的是「**在哪儿干活**」「**用了什么工具**」，回答不了「**改了什么文件**」「**跑错什么命令**」。

因此：

- **统计信号的作用是「候选生成器 + 提醒触发器」，不是「规则生成器」。**
- v1 的 signal 类候选**只有「热点目录」一种**（来自 `cwd` 频次）。
- 真正的约定条目主要来自**人工录入**，以及**确定性推导**（构建/测试命令、目录职责）。

这是刻意的取舍：宁可少而准，不可多而虚。

## 5. 核心数据模型

### 5.1 新表 `instruction_candidates`（migration V7）

当前 schema 版本为 V6（`store.rs` 中 `applied_v6`），本表作为 **MIGRATION_V7** 加入，沿用既有 `MIGRATION_Vn` + `schema_migrations` 记录模式。

```sql
CREATE TABLE IF NOT EXISTS instruction_candidates (
  candidate_id       TEXT PRIMARY KEY,
  project_id         TEXT NOT NULL,
  kind               TEXT NOT NULL,   -- derived | signal | manual
  section            TEXT NOT NULL,   -- overview | commands | map | invariants | boundaries | gotchas
  proposed_content   TEXT NOT NULL,
  evidence_json      TEXT,
  confidence         REAL NOT NULL DEFAULT 0.5,
  status             TEXT NOT NULL DEFAULT 'pending',  -- pending | accepted | rejected | stale
  accepted_memory_id TEXT,
  created_at_ms      INTEGER NOT NULL,
  updated_at_ms      INTEGER NOT NULL,
  UNIQUE(project_id, kind, section, proposed_content)
);
CREATE INDEX IF NOT EXISTS idx_ic_project_status
  ON instruction_candidates(project_id, status, updated_at_ms DESC);
```

`UNIQUE(project_id, kind, section, proposed_content)` 保证**重复提炼不产生重复候选**（幂等）。

`status` 四态的产出方：`pending` 由 derive 或人工录入产生；`accepted` 由用户确认产生；`rejected` 由用户拒绝产生；`stale` 由 derive 时检测到 passport 内容漂移（`evidence_json` 中的内容哈希与当前文件不一致）自动标记**已接受的条目**。

### 5.2 复用 `memory_records`（结构不变）

已确认的教训条目写入 `memory_records`：

| 列 | 取值 |
|---|---|
| `memory_type` | `'instruction'` |
| `content` | 条目正文 |
| `confidence` | 用户确认时给定；人工录入默认 `0.9` |
| `user_authored` | `1` = 人工录入；`0` = 接受提炼候选 |
| `source_event_id` | 接受候选时写入 `candidate_id`，形成可追溯链 |
| `supersedes_id` | 条目被替换时指向被替换项 |

因为 `query_memory` 直接按 `project_id` + FTS 检索 `content`，**说明书条目天然可被 MCP 的 `agent_memory_search` 查到**——这是 D4 选「复用」而非「独立表」的核心原因。

### 5.3 渲染中间表示（IR）

```text
ProjectInstructionDoc {
  project_id
  generated_at_ms
  sections: [
    { key, title, items: [ { text, origin_kind: derived|signal|manual, memory_id, confidence } ] }
  ]
}
```

- `key` 取值：`overview` / `commands` / `map` / `invariants` / `boundaries` / `gotchas`
- 渲染器**只认 IR**，不认存储细节（候选表、memory 表、passport）
- **v1 中 IR 的所有条目都来自 `memory_records`**。`derived` 只是候选的**来源标记**（`instruction_candidates.kind='derived'`），**不是渲染时的第二数据源**——凡进入说明书的条目都必须经过用户确认。
- 每条渲染项附带 `origin_kind`（`derived` | `signal` | `manual`），供 UI 说明「这条是自动提炼的，还是人写的」。

## 6. 候选提炼规则

### 6.1 三类来源

| 类 | 原料 | 产出（候选）section | 置信度基线 |
|---|---|---|---|
| `derived` | `project_context::passport` 已读白名单文件 | 候选：`overview` / `commands` / `map` | 0.8 |
| `signal` | probe jsonl 白名单字段、pad-status 事件 | 候选：`map`（热点目录） | 0.3 |
| `manual` | 用户在面板录入 | 候选：任意 | 0.9 |

三类来源**都先落为候选**，都需用户确认；确认后统一写入 `memory_records`，渲染器只渲染已确认条目。

### 6.2 derived：只抄不推断

- **overview**：项目显示名 + 一句话简介（取自 `README.md` 首段或 `package.json` 的 `description`）。
- **commands**：`package.json` 的 `scripts`（排除键名以 `publish` / `release` / `deploy` 开头的项，前缀匹配、大小写不敏感）；`Cargo.toml` 中可识别的 `test` / `lint` / `check` target。
- **map**：顶层目录清单（**只列目录名，不读目录内容**）+ `Cargo.toml` / `package.json` 中检测到的 workspace 声明。
- **铁律**：只从文件里「抄」，**不做推断**。README 没写的就不写；命令不存在就不写。

约束继承：passport 既有上限继续生效（`MAX_PASSPORT_SOURCES=8`、`MAX_PASSPORT_SOURCE_BYTES=64KB`、`MAX_PASSPORT_OUT_BYTES=4KB`）。

- **批量确认**：`derived` 类候选可一次性批量接受（用户一次确认），避免逐条确认造成摩擦；`signal` 类必须逐条接受。
- **漂移检测**：`evidence_json` 记录来源文件相对路径与内容哈希。再次 derive 时若哈希与当前文件不一致，对应已接受条目被标记 `status='stale'` 并产生提示，**不自动改写正文**。

### 6.3 signal：只做热点目录

- 输入：`claude-hook-probe.jsonl` 与 `pad-status.jsonl` 中的 `cwd` 频次（按 `project_id` 过滤）。
- 产出：热点目录 top N（默认 5），形式为「`src-tauri/` — 34 次会话」。
- **不做**：权限摩擦条目（缺工具参数，拿不到被拒对象）、工具画像条目（对 Agent 无行为约束力）、失败原因条目（属 Agent 自身能力问题，不是项目规则）。
- **触发方式**：与确定性推导在同一次 `derive` 调用中一并执行（读 `claude-hook-probe.jsonl` 与 `pad-status.jsonl`，按 `project_id` 过滤）。

### 6.4 manual：人工录入

- 入口：OneTone 面板直接写；字段 = section（单选）+ 正文 + 可选来源备注。
- 落库：直接进 `memory_records`（`user_authored=1`），同时写一条 `status='accepted'` 的候选记录用于追溯。
- 编辑与冲突：人工条目**编辑**走 `memory_records` 更新（`updated_at_ms` + `supersedes_id`），候选记录仅在新建时写入；重复内容命中 `UNIQUE(project_id, kind, section, proposed_content)` 时按「已存在」提示，不静默插入。
- 预留：外部 Agent 经 MCP 调用 `onetone_instruction_add`（属 P1 路 B，v1 不实现，仅在 schema 与命名上预留）。

## 7. 渲染层

### 7.1 渲染原则

1. **公共内容只写一份**（`AGENTS.md`），其余目标是薄适配，避免多份内容打架。
2. **引用而非复制**：正文用 `@AGENTS.md` 引用，不内联全文，避免每次会话重复消耗上下文。
3. **常驻上下文有预算**：受 Claude Code 指引（`< 200 行`）与 Cursor 指引（`< 500 行`）约束，超限时应告警而非静默截断。

### 7.2 目标清单

| 目标 | 路径 | 形式 | v1 |
|---|---|---|---|
| AGENTS.md | `<root>/AGENTS.md` | 主文件：完整正文 + 受管区块 | ✅ |
| Cursor rule | `<root>/.cursor/rules/onetone-project.mdc` | frontmatter + `@AGENTS.md` 引用 + Cursor 专属段 | ✅ |
| CLAUDE.md | `<root>/CLAUDE.md` | `@AGENTS.md` + Claude 专属段 | ⭕ 可选，仅当有 Claude 专属内容 |
| GEMINI.md | `<root>/GEMINI.md` | `@AGENTS.md` + Gemini 专属段 | ⭕ 可选，同上 |
| QWEN.md / `.clinerules/` / `.windsurf/rules/` / `.github/copilot-instructions.md` | — | — | ⏳ v2 |

`CLAUDE.md` 之所以可选：**Claude Code 2.1.277 起在没有 `CLAUDE.md` 时原生读 `AGENTS.md`**，多数情况无需创建。

### 7.3 渲染产物示例

`<root>/AGENTS.md`：

```markdown
<!-- onetone:instructions:begin -->
<!-- 由 OneTone 依据本项目的跨 Agent 历史生成。区块外内容不会被修改。 -->

# 项目约定

## 技术栈
- Rust 2021 + Tauri 2 桌面应用；前端为原生 ES5 脚本（无打包器）

## 命令
- 前端单测：`node scripts/test-<name>.mjs`
- Rust 单测：`cargo test --lib agent_task_runtime`
- 全量：`npm run test`

## 目录地图
- `src-tauri/src/` — Rust 后端（Tauri commands、agent 模块）
- `src/js/features/now/` — 首页 Agent 前端
- `scripts/` — Node 测试与探针脚本

## 硬性约束
- 权限默认全部 `not_wired`，需 flag 显式开启
- Agent Task Runtime 写盘必须经 patch 审批 token
- 不得用文本模拟 Diff 或代码执行

## 已知坑位
- `agent_memory/worker.rs` 的写锁是**进程内** Mutex，新开进程写同一个 SQLite 库会双写
- Windows 下 `PATH` 分隔符与 POSIX 工具行为不一致，探针脚本需显式处理
<!-- onetone:instructions:end -->
```

`<root>/.cursor/rules/onetone-project.mdc`：

```markdown
---
description: OneTone 生成的项目公共规则与坑位
alwaysApply: false
---

公共规则见 @AGENTS.md

## Cursor 专属
- 修改 `.cursor/rules/*.mdc` 前先确认现有 rule 的 `globs` 是否已覆盖目标路径
```

## 8. 写入层：受管区块

### 8.1 区块标记

```text
<!-- onetone:instructions:begin -->
...
<!-- onetone:instructions:end -->
```

### 8.2 四种写入情形

| 情形 | 行为 |
|---|---|
| 目标文件不存在 | 创建文件，只写受管区块 |
| 文件存在但**无**区块 | **不写**；返回 `needs_decision`，由用户明确决定是否追加区块在文件末尾 |
| 文件存在且有区块 | 替换区块内容；**区块外一字不动** |
| 文件存在且有**多个**同名区块 | 视为损坏，**拒写并报告** |

### 8.2.1 操作结果码

| 码 | 含义 | 前端行为 |
|---|---|---|
| `ok` | 已写入（或内容一致，未写盘） | 提示成功 |
| `needs_decision` | 目标文件已有用户内容且无受管区块 | 展示差异；用户明确同意后带 `consent_insert_into_existing=true` 重试 |
| `corrupt_block` | 检测到多个同名受管区块 | 拒写，提示用户手工修复 |
| `conflict` | 目标文件在预览后被外部修改 | 拒写，要求重新预览 |

### 8.3 安全写入

沿用 `claude_hook_setup.rs` 模式：

1. 生成写入预览（diff）
2. 用户显式确认（IPC 二次确认，非前端单次点击）
3. 原子写（临时文件 + rename）
4. 写前备份
5. 撤回：**只删区块，不删文件**，且只删带归属标记的区块

**红线：绝不整体覆盖用户文件。**

### 8.4 幂等

同一 IR 重复 apply：若目标区块内容与渲染结果一致，则**不写盘、不产生新备份**。

## 9. IPC 契约

命名沿用既有 `cmd_*` 风格：

| 命令 | 作用 |
|---|---|
| `cmd_project_instructions_doc` | 取 IR + 当前受管区块 diff |
| `cmd_project_instructions_candidates` | 列候选（按 status 过滤） |
| `cmd_project_instructions_candidate_decide` | accept / reject（accept 时写 `memory_records`） |
| `cmd_project_instructions_add_manual` | 人工录入，直接进 `memory_records` |
| `cmd_project_instructions_derive` | 触发一次确定性推导（写候选） |
| `cmd_project_instructions_render_preview` | 渲染预览（不改盘） |
| `cmd_project_instructions_apply_preview` | 各目标写入预览（diff） |
| `cmd_project_instructions_apply_confirm` | 显式确认后写盘；参数含 `consent_insert_into_existing`（默认 false，仅 §8.2 情形 2 需为 true） |
| `cmd_project_instructions_revert` | 撤回受管区块 |

## 10. 前端交互

新增 `src/js/features/now/home-project-instructions.js`，一个面板三区：

1. **候选审阅区**：列出 pending 候选（内容 / 类型 / 证据 / 置信度），逐条「接受 / 拒绝」。
2. **已确认条目区**：列出 `memory_records` 中 `memory_type='instruction'` 的条目，可编辑、可删除。
3. **目标分发区**：每个目标一行，显示「将写入 / 已最新 / 需你决定（已有用户内容）」，提供预览与确认。

写作约束：沿用现有 `home-*.js` 的 ES5 风格（`var` + IIFE + `global.OneTone*` 导出），不引入构建期依赖。

## 11. 测试与验收

### 11.1 Rust 单测

- 候选提炼幂等：同一输入两次 derive 产生同一候选集合，不重复插入。
- 渲染黄金文本：给定固定 IR，各目标输出为快照断言。
- 写入四情形：新建 / 无区块 / 有区块 / 多区块损坏。
- **fixture 断言：受管区块之外的内容逐字节不变。**
- **闭环断言：人工条目写入 `memory_records` 后，`query_memory` 能查到（证明 MCP 路径天然覆盖）。**
- 幂等：重复 apply 不写盘、不产生新备份。

### 11.2 前端测试

`scripts/test-home-project-instructions.mjs`，与既有 `scripts/test-home-*.mjs` 同风格。

### 11.3 验收条目

1. 不修改任何 hook probe 的 `SAFE_KEYS`，不记录 `tool_input`。
2. `memory_records` 表结构不变；仅新增 `instruction_candidates`（migration V7）。
3. 用户已有文件在受管区块外的内容逐字节不变。
4. 渲染产物不包含未经用户确认的候选。
5. 撤回后文件回到应用前状态（区块消失，其余不变）。
6. 说明书条目可被 `query_memory` 查到。

## 12. 明确不做（v1）

见 §2.2。此外：

- 不改 `claude_hook_setup.rs` / `cursor_hook_setup.rs` 的现有行为。
- 不新建 `project_instructions` 之外的 agent 侧写入口。
- 不在 v1 引入任何自动写盘路径。

## 13. 后续（不在本 spec 范围）

| 议题 | 说明 |
|---|---|
| MCP server（P0） | 让外部 Agent 主动拉取说明书与记忆；需实现 stdio/HTTP 传输与只读约束 |
| 外部 Agent 写入教训 | P1 路 B：`onetone_instruction_add` 等工具，让 Agent 发现坑位时主动登记 |
| 采集边界放宽 | 是否记录 `tool_input` 白名单子集（如路径与命令名），需独立决策 |
| 更多输出目标 | QWEN.md / Cline / Windsurf / Copilot / `.devin/rules/` |
| 记忆写入管道 | `memory_records` 至今无生产写入方；说明书条目是第一条写入路径，长期看需要通用记忆抽取 |

## 14. 实施分期建议

本 spec 可拆成两个可独立验收的批次：

1. **批次 A（后端闭环）**：数据层（migration V7 + store）、`derive` / `signals`、渲染器、受管区块写入与撤回、9 个 IPC。前端未接入时可通过 IPC 直接验收。
2. **批次 B（前端面板）**：`home-project-instructions.js` 面板三区、候选审阅交互、预览与确认流程、前端测试。

批次 A 先行的理由：受管区块写入是本设计**风险最高**的部分（用户仓库文件不可损坏），需要先有 Rust 层单测兜底再接 UI。
| 说明书新鲜度 | `derived` 条目接受后转为普通 memory 条目，会陈旧；已通过 `stale` 漂移检测给出提示，但**不自动改写正文**。是否改为「每次现算 + 用户确认差异」列入后续 |
