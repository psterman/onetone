# 首页 ATR 信任缺口三件套 — 设计文档

> 日期：2026-11-03  
> 范围：首页 Agent Task Runtime（ATR）  
> 代号：**看得见、撤得回**  
> 状态：设计已确认（用户批准），待实现计划

---

## 1. 背景与问题

首页 ATR 已经是一个功能完整的执行体：对话/工作双段入口、引擎能力分层、`write_with_approval` 默认权限、目录逃逸与 symlink 逃逸防护、基线脏文件保护、审批 token 绑定 task+patch+file hash+version、450ms 轮询、事件 append-only、任务历史与日志导出、发送冲突三选一、阶段 pill（模型已回答 → 补丁待批 → 文件已写 → 检查结果）。

安全底座和诚实口径都做得扎实，**本轮不动**。真正的缺口在"敢不敢用"这一层，有三处：

### 1.1 批准前看不见改了什么（P0）

- 后端 `waiting_approval` 事件只带 `path / approvalToken / patchHash / patchVersion / targetFileHash / baselineDirty`（`src-tauri/src/agent_task_runtime/engine.rs:513-526`），**不带任何内容**。
- `TaskDto` 只投影 `pending_approval_token`，`pending_patch_json` 没有进入 DTO（`src-tauri/src/agent_task_runtime/contracts.rs:120`）。
- 前端审批卡只显示文件名（`src/js/features/now/home-agent-v2.js:2919-2961`）。

而模型侧的写入原语是 `propose_changes{path, new_content}` / `apply_patch{path, new_content}` —— **全文件覆盖**（`deepseek.rs:78-80`、`tools.rs:158-185`）。用户点下"批准补丁写入"时看不到任何内容变化，而模型为改一行可能需要重吐整个文件。

数据其实已经存在 SQLite 的 `pending_patch_json` 里（`store.rs:36`），只是没有端上来。

### 1.2 没有行级编辑原语（P0）

`TOOL_NAMES` 共 10 个（`engine.rs:663-671`）：`inspect_workspace / search_code / read_file / propose_changes / apply_patch / export_to_desktop / run_check / inspect_diff / request_user_input / finish`。

没有任何"只替换第 N 行到第 M 行"的工具。全量覆盖导致：token 成本 ∝ 文件大小、改动噪音 ∝ 文件大小、审批轮数 ∝ 文件数。

### 1.3 没有会话级撤销（P0）

首页 ATR 全域 grep `undo|撤销|回滚|rollback` **零命中**。能力矩阵明确写明 rollback 只在 Time Machine，且"非会话绑定"（`docs/home-agent-capability-matrix.md:106-107`）。

用户批准之后发现写坏了，首页没有"撤回这次写入"的入口。

---

## 2. 目标与非目标

### 2.1 目标

1. **批准前能看见每一行改动** —— 审批卡内联行级 diff，默认折叠可展开。
2. **模型只改该改的行** —— 新增 `edit_file` 行区间替换工具，保留 `apply_patch` 作全量兜底。
3. **写坏了能撤回来** —— 任务级一键撤销 + 文件级单撤，带漂移保护。

### 2.2 非目标（本轮明确不做）

- hunk 级部分批准（已确认 defer）。
- 不改 `editCapable` 准入机制、不改隔离沙箱、不改 provider 路由。
- 不复活调研模式（`home-research.js` product-hidden 是另一个议题）。
- **不做 `home-agent-v2.js` 巨石化拆分** —— 该文件已 13067 行 / 470KB，但本轮必须限定改动面，拆分另开一轮。
- 不改 `now-home.js` 等首页其他部分。

---

## 3. 架构总览

```text
模型 → edit_file{path, start_line, end_line, new_text}      ← 新工具
         │ 引擎：读文件 → 校验行区间 → 算 new_content → 算真 diff
         ▼
   PendingPatch { path, new_content, patch_hash, target_file_hash,
                  patch_version, approval_token, allow_dirty,
                  rationale, risk, diff, added, removed }     ← 新增 5 字段
         │ 批准写盘后落 undo 行
         ▼
   agent_task_undo (task_id, path, prev_content, prev_hash, new_hash, created_at_ms)
                                                            ← 新表（迁移 v4）
         │
         ▼  450ms 轮询
   TaskDto.pending_patch → PendingPatchView { path, diff, rationale, risk,
                                              stats, is_new_file, patch_version }
         │
         ▼
   审批卡：<details> 折叠的行级 diff
```

---

## 4. 后端设计（`src-tauri/src/agent_task_runtime/`）

### 4.1 真实行级 diff（新增）— 且**不改 patch_hash 算法**

#### 4.1.1 安全约束（设计中最关键的一条）

现有的 `unified_replace_preview`（`tools.rs:187-189`）**不是真 diff**，而是把整份 old / new 各塞一行：

```text
--- a/path
+++ b/path
@@ full-file replace @@
-{整份旧内容}
+{整份新内容}
```

它之所以能充当 `patch_hash` 的输入并检测漂移，是因为**全文都在 preview 里** —— 磁盘内容任何变化都会改 hash，审批时就能检出 `patch_context_mismatch`（`tools.rs:303-309`）。

若把 preview 直接换成真 diff，未改动区域的漂移将不再改变 hash → **漂移检测退化 → 安全回退**。因此必须拆成两条互不干扰的路径：

| 用途 | 算法 | 覆盖范围 | 风险 |
|---|---|---|---|
| `patch_hash`（校验用） | **保持现状完全不变** | old + new 全文 | 漂移可检测（不变） |
| `diff`（展示用） | **新增真行级 diff** | 仅变更 hunk | 展示错误不影响写入正确性 |

#### 4.1.2 实现

新增 `tools::unified_line_diff(old: &str, new: &str) -> (String, DiffStats)`：

1. **前缀/后缀裁剪**：剥掉两文件共有的开头行与结尾行，只对中间差异区做 diff。
2. **LCS 行级 diff**：在裁剪后的差异区上计算最长公共子序列，输出 hunk。
3. **上下文**：每个 hunk 保留 3 行上下文。
4. **降级阈值**：任一侧行数 > 2000 时不跑 LCS，输出「整文件替换」降级提示（避免 O(n·m) 内存爆炸）。
5. **不引第三方 crate** —— Rust 侧当前无 diff 依赖，自实现保持依赖面不变。

`DiffStats { added: usize, removed: usize }`。

输出格式（标准 unified diff 子集）：

```text
@@ -14,7 +14,8 @@
   const a = 1;
-  const b = compute(x);
+  const b = compute(x, 2);
+  const c = 3;
```

### 4.2 新工具 `edit_file`

**签名**：`edit_file{path, start_line, end_line, new_text, rationale?, risk?}`

**引擎侧流程**（`engine.rs::dispatch_tool` 新分支）：

1. `scope::resolve_in_root` → 路径必须在工作区内。
2. 文件必须已存在。不存在 → 沿用现有 `not_found` 规则（`engine.rs:693-702`），引导模型改用 `propose_changes` 创建。
3. 读全文 → 计算总行数 → 校验 `1 <= start_line <= end_line <= total_lines`。越界 → `line_range_out_of_bounds`，错误消息带上文件总行数，让模型能自纠。
4. `new_content = lines[..start_line-1] + new_text + lines[end_line..]`
5. **完全复用 `tools::build_pending_patch`**（`tools.rs:203-261`）→ 同一套 `patch_hash` 计算、`bind_approval_token` 绑定、基线脏文件检查、`must_read_before_apply` 约束。

**关键收益**：模型只传行区间，不传全文。审批、token、hash、dirty 机制**零改动**，风险面极小。

**配套改动**：

| 位置 | 改动 |
|---|---|
| `engine.rs:663-671` `TOOL_NAMES` | 加入 `edit_file` |
| `deepseek.rs::tool_schema` | 新增 `edit_file` 的 OpenAI tools schema |
| `prompts.rs::tool_contracts_prompt` | 工具清单加入 `edit_file{path,start_line,end_line,new_text}` |
| `prompts.rs::system_prompt`（第 16-24 行规则区） | 加规则："改已有文件优先用 `edit_file` 只传改动的行区间；只有整文件重写或新建文件才用 `propose_changes`/`apply_patch`" |

`apply_patch` 保留，作为整文件重写与新建文件的兜底路径。

### 4.3 撤销存储（迁移 v4）

`store.rs::migrate` 现有版本化机制（v1 / v2 / v3），新增 v4：

```sql
CREATE TABLE IF NOT EXISTS agent_task_undo (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id TEXT NOT NULL,
  path TEXT NOT NULL,
  prev_content TEXT,        -- NULL = 该文件原本不存在
  prev_hash TEXT NOT NULL,  -- 'new' = 原本不存在（复用 tools::NEW_FILE_HASH）
  new_hash TEXT NOT NULL,   -- ATR 写入后的文件 hash
  created_at_ms INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_atr_undo_task ON agent_task_undo(task_id);
```

**写入时机**：`tools::apply_pending_patch` 成功之后、事件提交之前。

该函数在两个分支里都已经读出了 `old` 全文并拿到了 `newFileHash`（`tools.rs:273-316`），只需把 `old` 一并返回给调用方（`prev_content`），并在 `engine.rs` 的 `apply_patch` 分支（自主写 `engine.rs:529-551`）与 `approve_patch`（`engine.rs:756-789`）两处落库。

### 4.4 撤销命令 `cmd_agent_task_undo(taskId, path?)`

**语义**：

| `path` | 粒度 | 行为 |
|---|---|---|
| 省略 | 任务级 | 按 `created_at_ms` 倒序，逐条还原本任务所有写入 |
| 给出 | 文件级 | 只还原该路径**最新**一条 undo 记录 |

**漂移保护（必须有）**：还原前校验磁盘当前 `file_hash` == 记录的 `new_hash`。不一致 → **拒绝**，返回 `file_changed_since_atr`。用户在 ATR 写入后又手改过的文件，不能被撤销覆盖。

**还原语义**：

- `prev_hash == 'new'`（该文件原本不存在）→ 删除该文件。
- 否则 → 写回 `prev_content`，并校验写后 hash == `prev_hash`。

**幂等**：已撤销过的记录不重复执行；撤销过的 undo 记录标记 `undone_at_ms`。

**事件**：新增 `undo_applied` 事件类型，payload 含 `path / mode(task|file) / restoredHash / removed(bool)`，进入既有 append-only 事件流，首页时间线可见。

### 4.5 DTO 投影

`contracts.rs::TaskDto` 新增：

```rust
#[serde(default)]
pub pending_patch: Option<PendingPatchView>,
```

新增 `PendingPatchView`：

```rust
pub struct PendingPatchView {
    pub path: String,
    pub diff: String,             // 真行级 diff，仅展示
    pub rationale: String,
    pub risk: String,
    pub added: u32,
    pub removed: u32,
    pub is_new_file: bool,
    pub patch_version: u32,
    pub patch_hash: String,
    pub target_file_hash: String,
}
```

**View 不含 `new_content`** —— 可能很大，且用户不需要看完整新文件，diff 已经足够。

`store.rs::to_dto`（`store.rs:270` 附近）从 `pending_patch_json` 解析 `PendingPatch` → 映射为 View。

`PendingPatch` 本身新增 5 个字段（`tools.rs:191-201`）：`rationale: String`、`risk: String`、`diff: String`、`added: u32`、`removed: u32`。其中 `rationale` / `risk` 来自 `propose_changes` / `edit_file` 的入参 —— 目前 `PendingPatch` 没有保存它们，导致审批卡无法显示"为什么改"。

---

## 5. 前端设计（`src/js/features/now/`）

### 5.1 审批卡内联 diff

**插入点**：`home-agent-v2.js::atrMainGateHtml` 的 `st === 'waiting' && atrNeedsApproval(snap)` 分支（当前 `home-agent-v2.js:2948-2955`），插在 `atrStagesHtml(snap)` 之后、动作按钮之前。

**结构**（沿用项目已有的 `<details>` 折叠模式，见 `.ha2-atr-think`）：

```text
┌ 编辑任务等待确认 ──────────────────┐
│ [模型已回答][补丁待批准]              │
│ src/js/features/now/xxx.js          │
│ +12 −3 行 · risk low                │
│ 理由：修复空指针                     │
│ ▸ 查看改动                    ← 默认折叠 │
│   ┌───────────────────────────────┐ │
│   │ @@ -14,7 +14,8 @@             │ │
│   │   const a = 1;                │ │
│   │ −  const b = compute(x);      │ │
│   │ +  const b = compute(x, 2);   │ │
│   │ +  const c = 3;               │ │
│   └───────────────────────────────┘ │
│ [批准补丁写入][同意所有任务][拒绝方案] │
└───────────────────────────────────────┘
```

**渲染规则**：

| 元素 | 内容 |
|---|---|
| summary（折叠态） | `路径 · +N −M 行`；新建文件显示 `新建文件 · +N 行` |
| summary 旁常驻信息 | `risk` 与 `rationale` 始终可见（折叠态也显示），折叠/展开都不隐藏 |
| 展开后新增内容 | 逐行 diff（`+` / `-` / 上下文行 / hunk 头） |
| 行样式 | `+` 前缀用 `var(--ha2-ok)`，`-` 前缀用 `var(--ha2-err)`，上下文行用 `var(--ha2-muted)`，hunk 头 `@@ ... @@` 用 `var(--ha2-muted)` |
| 大 diff | 总行数 > 500 时默认只渲染前 200 行，末尾给「展开全部」 |
| 新建文件 | 只渲染 `+` 行，无 `-` 行 |

**CSS**：新增 `.ha2-atr-diff` / `.ha2-atr-diff-sum` / `.ha2-atr-diff-body` / `.ha2-atr-diff-row` / `.ha2-atr-diff-row.is-add` / `.ha2-atr-diff-row.is-del` / `.ha2-atr-diff-row.is-ctx` / `.ha2-atr-diff-hunk`，全部沿用现有 CSS 变量（`--ha2-ink` / `--ha2-muted` / `--ha2-line` / `--ha2-accent` / `--ha2-ok` / `--ha2-err`），字体用已有的 `ui-monospace, SFMono-Regular, Menlo, Consolas, monospace` 栈。

### 5.2 撤销入口

| 粒度 | 位置 | 按钮 |
|---|---|---|
| 任务级 | 任务日志卡 `atrLogCardHtml`（`home-agent-v2.js:9269`）的"已写入文件"区 | 「撤销本次写入」 |
| 文件级 | 改动文件表 `atrFileTableHtml`（`home-agent-v2.js:2382`）每行 | 「撤销此文件」 |

两者都是**破坏性操作** → 走项目现有的确认模式，**不自动撤销**。

无可撤销记录时（老任务）→ 不显示按钮。

### 5.3 接线

| 文件 | 改动 |
|---|---|
| `home-agent-task.js` | 新增 `undo(taskId, path)` → `invoke('cmd_agent_task_undo', { taskId, path })`；`readUndoState` 辅助 |
| `home-agent-v2-store.js` | 新增 `undoAgentWrite(opts)` → 调 `A.undo` → 成功后刷新 `agentTask` + `agentTaskEvents` |
| `home-agent-v2.js` | 事件委托加 `[data-ha2-atr-undo]`（任务级）与 `[data-ha2-atr-undo-file]`（文件级），接入确认流程 |

`home-agent-v2.js:11953` 那行 3000+ 字符的选择器串**本轮只追加**两个新属性，不做重构（拆分另开一轮）。

---

## 6. 完整数据流

**一次审批（`edit_file` 路径）**

1. 模型调用 `edit_file{path, start_line, end_line, new_text, rationale, risk}`。
2. 引擎 resolve 路径、读文件、校验行区间、计算 `new_content`。
3. 引擎计算真行级 diff 与增删行数。
4. `build_pending_patch` → `PendingPatch`（含 diff / rationale / risk），token 绑定不变。
5. 存 `pending_patch_json`，`status=waiting`，`waiting_reason=approval`。
6. `commit_event('waiting_approval', {...})`（payload 不变，diff 不进事件流 —— 事件是审计流，diff 走 DTO）。
7. 前端 450ms 轮询拿到 `TaskDto.pending_patch`。
8. 审批卡渲染折叠 diff（summary 显示路径 + `+N −M`）。
9. 用户展开 → 看到行级 diff → 点「批准补丁写入」。
10. `cmd_agent_task_approve_patch` → `apply_pending_patch` 写盘 → 落 undo 行 → `commit_event('patch_applied')`。
11. `status` 变为 `verifying`。

**一次撤销**

1. 用户在改动文件表点「撤销此文件」（或任务卡点「撤销本次写入」）。
2. 确认弹窗。
3. `cmd_agent_task_undo(taskId, path?)`。
4. 引擎取 undo 记录 → 校验磁盘当前 hash == `new_hash` → 不匹配则 `file_changed_since_atr` 拒绝。
5. 匹配 → 写回 `prev_content` 或删除文件 → 标记 undo 记录 → `commit_event('undo_applied')`。
6. 前端刷新任务状态与文件表。

---

## 7. 错误处理

| 情况 | 错误码 | 行为 |
|---|---|---|
| `edit_file` 行号越界 | `line_range_out_of_bounds` | tool_error，消息带文件总行数，模型可自纠 |
| `edit_file` 目标文件不存在 | `not_found`（现有规则） | 引导模型改用 `propose_changes` 创建 |
| 审批时文件被外部改动 | `patch_context_mismatch`（现有） | 行为不变 |
| 撤销时文件被用户手改 | `file_changed_since_atr` | **拒绝覆盖**，前端提示"该文件在 ATR 写入后又被改动，未撤销" |
| 老任务无 undo 记录 | `nothing_to_undo` | 前端不显示撤销按钮 |
| diff 降级（超长文件） | — | 显示「整文件替换」提示，不显示逐行 diff |

---

## 8. 测试

### 8.1 Rust（`cargo test --lib agent_task_runtime` 必须全绿，不许回归）

- `unified_line_diff`：纯新增行 / 纯删除行 / 替换行 / 新建文件 / 完全无变化 / 超长文件降级。
- **`patch_hash` 漂移检测不因引入真 diff 而退化**（关键回归测试：审批前磁盘被改动 → 必须仍报 `patch_context_mismatch`）。
- `edit_file` 端到端：改一行 → 生成 pending patch → diff 内容正确 → 批准 → 磁盘内容正确。
- `edit_file` 行号越界 → `line_range_out_of_bounds`。
- `edit_file` 目标不存在 → `not_found`。
- undo 任务级：写两个文件 → 撤销 → 两个文件都回到原状。
- undo 文件级：只撤一个，另一个不动。
- undo 冲突：ATR 写入后用户手改 → 撤销被拒（`file_changed_since_atr`）。
- undo 新建文件：撤销后该文件被删除。

### 8.2 FE（新增 `scripts/test-atr-diff-undo.mjs`）

- 审批卡渲染出折叠 diff + `+N −M` 摘要。
- 展开后行级 `+` / `-` 样式正确。
- 撤销按钮接线到 `cmd_agent_task_undo`（任务级与文件级两条路径）。

### 8.3 不回归

现有 ATR 脚本必须保持绿：`test-atr-home-edit-loop.mjs`、`test-atr-provider-switch.mjs`、`test-atr-send-conflict.mjs`、`test-atr-phase-e-flag.mjs`、`test-atr-phase-f-export.mjs`、`test-work-atr-gate7.mjs`、`test-home-resume-honesty.mjs`、`test-controller-ownership.mjs`、`test-runtime-gates.mjs`、`test-run-contracts.mjs`。

---

## 9. 风险与缓解

| 风险 | 影响 | 缓解 |
|---|---|---|
| 真 diff 实现有 bug，显示误导用户 | 用户批准了没看清的改动 | diff **仅用于展示**；实际写入仍是全量覆盖 + 全文 hash 校验；测试逐例比对 |
| 大文件 LCS 性能与内存 | 首页卡顿 | 前缀/后缀裁剪 + 2000 行降级阈值 |
| 撤销误删用户文件 | 数据丢失 | 只删 ATR 本次创建**且** hash 未变的文件；漂移即拒绝 |
| `pending_patch_json` 体积变大 | SQLite 膨胀 | diff 存 DB 但 DTO 只投影 View，`new_content` 不外传；diff 只含变更 hunk |
| 改动触碰大文件引发回归 | 首页其他功能受损 | 改动限定在 `agent_task_runtime` + ATR 相关 FE 段；不碰 `now-home.js` 等 |
| 模型仍偏好全量 `apply_patch` | `edit_file` 形同虚设 | prompt 明确优先级；工具描述写明"改已有文件优先用 edit_file"；在验收里观测 edit_file 使用率 |

---

## 10. 相关文件

| 层 | 路径 |
|---|---|
| Rust 运行时 | `src-tauri/src/agent_task_runtime/tools.rs`（diff / edit_file / apply 返回 old）、`engine.rs`（新工具分支、undo 落库）、`contracts.rs`（DTO 投影）、`store.rs`（迁移 v4、undo 表读写）、`deepseek.rs`（tool schema）、`prompts.rs`（工具契约） |
| FE 客户端 | `src/js/features/now/home-agent-task.js` |
| FE 状态 | `src/js/features/now/home-agent-v2-store.js` |
| FE 渲染 | `src/js/features/now/home-agent-v2.js` |
| CSS | `src/css/home-agent-v2.css` |
| IPC 命令 | `src-tauri/src/ipc/commands/shell/agent_task_runtime_cmd.rs` |
| 测试 | `scripts/test-atr-diff-undo.mjs`（新增）+ 现有 ATR 脚本 |

---

## 11. 决策记录

| 决策 | 选择 | 理由 |
|---|---|---|
| diff 展示形态 | 审批卡内联展开，默认折叠 | 改动就在批准按钮旁边，不需跳走；折叠时不遮挡对话 |
| 行级编辑工具形态 | 新增独立 `edit_file`，`apply_patch` 保留兜底 | 语义清晰，工具数 10→11；prompt 与 schema 需同步改 |
| 撤销粒度 | 任务级 + 文件级两种都要 | 任务级一键回滚兜底；文件级用于只撤回一个误改 |
| hunk 级部分批准 | 本轮不做 | 需片段级 token 与审批状态机，复杂度高；先把"看得见、撤得回"做扎实 |
