# 首页 ATR 信任缺口 — 两期设计（看得见 · 撤得回）

> 日期：2026-11-03（v2，按评审意见拆分为两期）  
> 范围：首页 Agent Task Runtime（ATR）  
> 状态：设计已确认，待实现计划

---

## 1. 背景与问题

首页 ATR 的安全底座和诚实口径已经扎实 —— 目录逃逸与 symlink 逃逸防护、基线脏文件保护、审批 token 绑定 task+patch+file hash+version、引擎能力四档分层、投递≠完成、事件 append-only。**本轮不动这些。**

缺口在"敢不敢用"这一层，三处：

### 1.1 批准前看不见改了什么

- `waiting_approval` 事件只带 `path / approvalToken / patchHash / patchVersion / targetFileHash / baselineDirty`（`engine.rs:513-526`），**不带任何内容**。
- `TaskDto` 只投影 `pending_approval_token`，`pending_patch_json` 没进 DTO（`contracts.rs:120`）。
- 前端审批卡只显示文件名（`home-agent-v2.js:2919-2961`）。
- 写入原语是全文件覆盖：`propose_changes{path,new_content}` / `apply_patch{path,new_content}`（`deepseek.rs:78-80`、`tools.rs:158-185`）。

数据已经在 SQLite 的 `pending_patch_json` 里（`store.rs:36`），只是没端上来。

### 1.2 第一次批准之后，后续写入全部静默

`approve_patch` 无条件执行 `task.permission_mode = WriteAutonomous`（`engine.rs:751-754`），随后 `continueFromPause('approved')` 继续驱动（`home-agent-v2-store.js:2354-2355`）。

后果：**多文件任务里，用户只会看到第 1 个文件的审批卡，第 2..N 个文件直接写盘**，既无 diff 也无确认。这让"批准前看得见"只兑现了第一次。

### 1.3 没有会话级撤销

首页 ATR 全域 grep `undo|撤销|回滚|rollback` **零命中**。能力矩阵写明 rollback 只在 Time Machine 且"非会话绑定"（`docs/home-agent-capability-matrix.md:106-107`）。

---

## 2. 两期拆分

| | 第一期：最小闭环 | 第二期：效率优化 |
|---|---|---|
| 目标 | **看得见 + 撤得回** | **改得省** |
| 回答的问题 | 用户是否因为"能看见 diff、能撤销"而更愿意批准 ATR 的修改 | 模型是否愿意用行级编辑；全量覆盖的 token / 延迟成本有多大 |
| 交付 | ① pending_patch 投影到前端<br>② 审批卡折叠 diff + 风险 + 修改理由<br>③ 每次成功写入记录旧内容<br>④ 任务级撤销<br>⑤ 漂移保护 + 冲突提示 + 测试 | ① `edit_file` 行区间工具<br>② 观测模型使用率与全量覆盖比例<br>③ 据观测结果决定是否要文件级撤销、更多 diff 优化 |

**拆分理由**：`edit_file` 解决的是 token 成本与延迟，不是信任问题。把它留在第二期，第一期可以更快验证核心假设 —— 可见的 diff 与可撤销的能力，是否真的提高批准意愿。第二期的观测数据（模型实际使用率、全量覆盖比例）也正是决定"要不要继续投入"所需的依据。

**第一期的数据模型必须能支撑第二期**：undo 表记录**每一次**写入（而非每个 path 的最后一条），第二期加文件级撤销时无需再迁移。

---

## 3. 第一期：看得见 + 撤得回

### 3.1 后端改动（`src-tauri/src/agent_task_runtime/`）

#### 3.1.1 真实行级 diff（新增）— 且**不改 patch_hash 算法**

现有的 `unified_replace_preview`（`tools.rs:187-189`）**不是真 diff**，把整份 old / new 各塞一行：

```text
--- a/path
+++ b/path
@@ full-file replace @@
-{整份旧内容}
+{整份新内容}
```

它能充当 `patch_hash` 输入并检测漂移，**恰恰是因为全文都在里面** —— 磁盘内容任何变化都改 hash，审批时就能检出 `patch_context_mismatch`（`tools.rs:303-309`）。

若把 preview 换成真 diff，未改动区域的漂移将不再改变 hash → **漂移检测静默退化 → 安全回退**。因此拆成两条互不干扰的路径：

| 用途 | 算法 | 覆盖范围 | 风险 |
|---|---|---|---|
| `patch_hash`（校验用） | **保持现状完全不变** | old + new 全文 | 漂移可检测（不变） |
| `diff`（展示用） | **新增真行级 diff** | 仅变更 hunk | 显示错误不影响写入正确性 |

新增 `tools::unified_line_diff(old: &str, new: &str) -> (String, DiffStats)`：

1. **前缀/后缀裁剪** —— 剥掉共有开头行与结尾行，只对中间差异区做 diff。
2. **LCS 行级 diff** —— 在裁剪区计算最长公共子序列，输出 hunk。
3. **上下文** —— 每个 hunk 保留 3 行。
4. **降级阈值** —— 任一侧行数 > 2000 时不跑 LCS，输出「整文件替换」提示（避免 O(n·m) 内存爆炸）。
5. **不引第三方 crate** —— Rust 侧当前无 diff 依赖，自实现保持依赖面不变。

`DiffStats { added: usize, removed: usize }`。

> **注意**：即便写入机制仍是全量覆盖，*显示*的 diff 依然是最小行级 diff —— 因为它由 old→new 经 LCS 得出。用户看到的是"真实改了 3 行"，而不是"整个文件被替换了 500 行"。这正是 Phase 1 不需要 `edit_file` 也能兑现"看得见"的原因。

输出格式（标准 unified diff 子集）：

```text
@@ -14,7 +14,8 @@
   const a = 1;
-  const b = compute(x);
+  const b = compute(x, 2);
+  const c = 3;
```

#### 3.1.2 `PendingPatch` 扩展与 DTO 投影

`PendingPatch`（`tools.rs:191-201`）新增 5 个字段：`rationale: String`、`risk: String`、`diff: String`、`added: u32`、`removed: u32`。

其中 `rationale` / `risk` 来自 `propose_changes` / `apply_patch` 的入参 —— 目前**没有保存**，导致审批卡无法显示"为什么改"。

`TaskDto`（`contracts.rs`）新增：

```rust
#[serde(default)]
pub pending_patch: Option<PendingPatchView>,
```

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

**View 不含 `new_content`** —— 可能很大，且 diff 已足够表达改动。

`store.rs::to_dto`（`store.rs:270` 附近）从 `pending_patch_json` 解析 `PendingPatch` → 映射为 View。

#### 3.1.3 撤销存储（迁移 v4）

`store.rs::migrate` 现有版本化机制（v1/v2/v3），新增 v4：

```sql
CREATE TABLE IF NOT EXISTS agent_task_undo (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id TEXT NOT NULL,
  path TEXT NOT NULL,
  prev_content TEXT,        -- NULL = 该文件原本不存在
  prev_hash TEXT NOT NULL,  -- 'new' = 原本不存在（复用 tools::NEW_FILE_HASH）
  new_hash TEXT NOT NULL,   -- ATR 写入后的文件 hash
  undone_at_ms INTEGER,     -- NULL = 未撤销
  created_at_ms INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_atr_undo_task ON agent_task_undo(task_id);
CREATE INDEX IF NOT EXISTS idx_atr_undo_path ON agent_task_undo(task_id, path);
```

**写入时机**：`apply_pending_patch` 成功后、事件提交之前。两条写入路径**都要覆盖**：

| 路径 | 位置 | 场景 |
|---|---|---|
| 自主写 | `engine.rs:529-551` | `write_autonomous` 模式（含"同意所有"后的后续写入） |
| 批准写 | `engine.rs:756-789` | `approve_patch` 写入 |

> 漏掉自主写路径会导致"批准之后的任务写入无法撤销" —— 这是必须覆盖的第二条路径。

`apply_pending_patch` 需要把读出的 `old` 全文一并返回（当前已在函数内读出，但没往外带，`tools.rs:273-316`）。

#### 3.1.4 撤销命令 `cmd_agent_task_undo(taskId)`

第一期只做**任务级**撤销。文件级留到第二期（数据模型已支持，届时无需迁移）。

##### 排序：必须用 `id`，不能用 `created_at_ms` ⚠️

同一个任务对同一文件可能写入多次（模型可以 `apply_patch` 两次）。`created_at_ms` 是毫秒分辨率 —— 同一毫秒内的两次写入**顺序不确定**，按它排序会取到错误的 pre-image，直接导致恢复出错误内容。

`id INTEGER PRIMARY KEY AUTOINCREMENT` 是严格的自增插入序，**用 `id DESC` 排序**。`created_at_ms` 仅作展示。

##### 恢复算法：按 path 分组，只恢复该 path 最早一条的 pre-image

任务级撤销**不是**逐条逆序写回，而是：

```text
1. 取该任务所有未撤销记录，ORDER BY id DESC
2. 按 path 分组
3. 漂移预检（见 3.1.5）：对每个 path，磁盘当前 hash 必须 == 该 path 最新一条的 new_hash
   → 任一 path 不匹配 → 整单拒绝，零写入
4. 对每个 path 组：恢复该 path **最早**一条记录的 prev_content
   （prev_hash == 'new' 则删除该文件）
   → 写回后校验磁盘 hash == 该记录的 prev_hash；不符 → `undo_verify_failed`
5. 标记已撤销
6. commit_event('undo_applied', {...})
```

**为什么用"最早一条"而不是"严格逆序逐条写回"**：

两者最终态等价 —— 严格逆序的结果是 `restore(prev_2) → restore(prev_1)`，最终落到 `prev_1`，即最早一条的 pre-image。但严格逆序会**产生中间态写盘**：文件先被写成一个从未打算停留的状态，若第二步失败，磁盘就停在那个中间态上。

按 path 折叠成单次写入后：每个 path 只写一次，中间态不出现，事务性更强，写盘次数也更少。

> 评审提出的"必须严格按逆序恢复"这一诉求，由**按 path 分组 + 组内取最早 pre-image**满足，且额外消除了中间态风险。

##### 跨任务干扰的处理

恢复某 path 后，**该 path 上所有任务的所有 undo 记录**都标记为已撤销。

原因：若任务 A 写了 X、任务 B 也写了 X，撤销 A 会把 X 还原到 A 开始前的状态，此时 B 的记录所基于的状态已不成立。若不标记，B 的撤销会在漂移预检时误报 `file_changed_since_atr`（假阳性），用户点了撤销却被告知"文件被改过"。

#### 3.1.5 漂移保护与冲突提示

**必须**：还原前校验磁盘当前 `file_hash` == 记录的 `new_hash`。不一致 → **拒绝**。

| 场景 | 行为 |
|---|---|
| 磁盘 hash == 记录 new_hash | 正常还原 |
| 磁盘 hash != 记录 new_hash | 拒绝，返回 `file_changed_since_atr` + 漂移文件清单 |

用户在 ATR 写入后手改过的文件，不能被撤销覆盖。

**任务级撤销 = 全有或全无**：第 3 步的漂移预检对**所有** path 执行，任一 path 漂移 → 整单拒绝、零写入、明确列出漂移的文件。

> 评审提出的"不能静默覆盖，也不能让用户误以为全部撤销成功" —— 通过**原子性（全有或全无）**彻底消除"部分成功"这个中间态。用户要么全撤销成功，要么什么都没变，且知道是哪几个文件挡住了。

#### 3.1.6 事件

新增 `undo_applied` 事件类型，payload 含 `paths[] / mode / restoredHash / removed(bool) / driftedPaths[]`，进入既有 append-only 事件流。

### 3.2 后端改动：批准语义（解决 §1.2）

让"批准前看得见"真正成立，需要区分"只批准这一次"和"以后都不问"。

**后端**：`approve_patch` 增加 `scope` 参数。

| scope | 语义 | 当前任务 permission_mode | 写 localStorage |
|---|---|---|---|
| `one`（默认） | 只批准这一次写入 | 保持 `write_with_approval` | 否 |
| `global` | 本任务剩余 + 以后新任务都不再询问 | `write_autonomous` | 是 |

当前实现是无条件 `task.permission_mode = WriteAutonomous`（`engine.rs:751-754`）→ 改为按 scope 决定。

**前端**（`atrActsHtml`，`home-agent-v2.js:2693-2773`）：

| 按钮 | scope | 说明 |
|---|---|---|
| 批准这一次 | `one` | 下一次写入仍会出审批卡 + diff |
| 以后都不问 | `global` | 逃生舱 |
| 拒绝方案 | — | 不变 |

**同时**：自主写入（`write_autonomous` 模式下的写入）也必须在任务时间线留下**可回看的 diff 记录** —— 即使没有事前审批卡，写入本身及其 diff 仍然出现在事件流里，用户事后能看、能撤。

> 这条不在评审给出的 Phase 1 清单里，但它是"看得见"的必要条件：否则第一次批准之后的写入完全不可见，等于 §1.2 没修。

**行为变更说明**：现有"批准补丁写入"按钮的语义从"本任务剩余不再询问"改为"只批准这一次"。这是刻意的 —— 默认应该让人看见每一次改动；"以后都不问"保留为显式逃生舱。若实际使用中反馈"多文件任务要点太多次"，第二期可加中间档（本任务剩余不再询问，但以后新任务仍询问）。

### 3.3 前端改动（`src/js/features/now/`）

#### 3.3.1 审批卡内联 diff

**插入点**：`atrMainGateHtml` 的 `st === 'waiting' && atrNeedsApproval(snap)` 分支（`home-agent-v2.js:2948-2955`），插在 `atrStagesHtml(snap)` 之后、动作按钮之前。

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
│ [批准这一次][以后都不问][拒绝方案]      │
└───────────────────────────────────────┘
```

**渲染规则**：

| 元素 | 内容 |
|---|---|
| summary（折叠态） | `路径 · +N −M 行`；新建文件显示 `新建文件 · +N 行` |
| summary 旁常驻信息 | `risk` 与 `rationale` **始终可见**，折叠/展开都不隐藏 |
| 展开后新增内容 | 逐行 diff（`+` / `-` / 上下文行 / hunk 头） |
| 行样式 | `+` 用 `var(--ha2-ok)`，`-` 用 `var(--ha2-err)`，上下文与 hunk 头用 `var(--ha2-muted)` |
| 大 diff | 总行数 > 500 时默认只渲染前 200 行，末尾给「展开全部」 |
| 新建文件 | 只渲染 `+` 行，无 `-` 行 |

**CSS**：新增 `.ha2-atr-diff` / `-sum` / `-body` / `-row` / `-row.is-add` / `-row.is-del` / `-row.is-ctx` / `-hunk`，全部沿用现有 CSS 变量（`--ha2-ink` / `--ha2-muted` / `--ha2-line` / `--ha2-accent` / `--ha2-ok` / `--ha2-err`），字体用项目已有的 `ui-monospace, SFMono-Regular, Menlo, Consolas, monospace` 栈。

#### 3.3.2 撤销入口（任务级）

- 位置：任务日志卡 `atrLogCardHtml`（`home-agent-v2.js:9269`）的"已写入文件"区 → 「撤销本任务的所有写入」（任务级，文案明确范围，避免被误解为只撤最后一次）。
- 仅当该任务存在未撤销的写入记录时显示；无记录（老任务）→ 不显示。
- 破坏性操作 → 走项目现有确认模式，**不自动撤销**；确认文案列出将被还原的文件。

#### 3.3.3 接线

| 文件 | 改动 |
|---|---|
| `home-agent-task.js` | 新增 `undo(taskId)` → `invoke('cmd_agent_task_undo', { taskId })` |
| `home-agent-v2-store.js` | 新增 `undoAgentWrite()` → 调 `A.undo` → 成功后刷新 `agentTask` + `agentTaskEvents` |
| `home-agent-v2.js` | 事件委托加 `[data-ha2-atr-undo]`；审批按钮按 scope 传参 |

`home-agent-v2.js:11953` 那行 3000+ 字符的选择器串**本轮只追加**属性，不做重构（拆分另开一轮）。

### 3.4 第一期完整数据流

**一次审批（默认 `one` scope）**

1. 模型调 `apply_patch{path, new_content, rationale, risk}`。
2. 引擎读文件、算真 diff 与增删行数 → `build_pending_patch` → `PendingPatch`（含 diff / rationale / risk），token 绑定不变。
3. 存 `pending_patch_json`，`status=waiting`，`waiting_reason=approval`。
4. `commit_event('waiting_approval', {...})`（payload 不变；diff 走 DTO，事件流是审计流不是展示流）。
5. 前端 450ms 轮询拿到 `TaskDto.pending_patch` → 审批卡渲染折叠 diff。
6. 用户展开 → 点「批准这一次」→ `cmd_agent_task_approve_patch(scope=one)`。
7. 引擎写盘 → 落 undo 行 → `commit_event('patch_applied')` → 任务**保持** `write_with_approval`。
8. 驱动继续；模型下次写入 → 再出审批卡 + diff。

**一次撤销**

1. 用户在任务卡点「撤销本次写入」→ 确认弹窗。
2. `cmd_agent_task_undo(taskId)`。
3. 引擎取记录 → 按 path 分组 → 对每个 path 做漂移预检（磁盘 hash vs 该 path 最新 new_hash）。
4. 任一漂移 → 整单拒绝，返回漂移清单，零写入。
5. 全部通过 → 按 path 恢复最早一条的 pre-image（原本不存在则删除）→ 标记已撤销 → `commit_event('undo_applied')`。
6. 前端刷新任务状态与文件表。

### 3.5 错误处理

| 情况 | 错误码 | 行为 |
|---|---|---|
| 审批时文件被外部改动 | `patch_context_mismatch`（现有） | 行为不变 |
| 撤销时文件被用户手改 | `file_changed_since_atr` | **整单拒绝**，零写入，前端列出漂移文件 |
| 老任务无 undo 记录 | `nothing_to_undo` | 前端不显示撤销按钮 |
| diff 降级（超长文件） | — | 显示「整文件替换」提示，不显示逐行 diff |
| 撤销后磁盘 hash 与 pre-image 不符 | `undo_verify_failed` | 报告异常，不静默 |

### 3.6 测试

#### Rust（`cargo test --lib agent_task_runtime` 必须全绿，不许回归）

- `unified_line_diff`：纯新增行 / 纯删除行 / 替换行 / 新建文件 / 完全无变化 / 超长文件降级。
- **`patch_hash` golden test（关键）**：固定 `(old, new)` 输入的 `patch_hash` 必须与本轮改动前**逐字节一致**。这条直接锁死"diff 不影响审批校验"这条评审要求。
- **漂移检测回归**：审批前磁盘被改动 → 仍报 `patch_context_mismatch`。
- 撤销：写两文件 → 任务级撤销 → 两文件都回到原状。
- 撤销：**同一文件连续写两次** → 撤销 → 恢复到**第一次写入前**的内容（不是中间态，也不是最后写入前）。
- 撤销：**同一毫秒内两次写入** → 撤销 → 恢复到第一次写入前（验证 `id` 排序生效）。
- 撤销冲突：ATR 写入后用户手改 → 撤销被拒、**零写入**、返回漂移清单。
- 撤销原子性：两个文件中一个漂移 → **两个都不动**，返回漂移清单。
- 撤销新建文件：撤销后该文件被删除。
- 跨任务：任务 A 与任务 B 都写同一文件 → 撤销 A 后再撤销 B → B 不误报漂移（记录已标记）。
- 自主写路径同样落 undo 行（`write_autonomous` 模式下写入后仍可撤销）。

#### FE（新增 `scripts/test-atr-diff-undo.mjs`）

- 审批卡渲染出折叠 diff + `+N −M` 摘要。
- 展开后 `+` / `-` 样式正确。
- 「批准这一次」传 scope=one；「以后都不问」传 scope=global。
- 撤销按钮接线到 `cmd_agent_task_undo`。
- 无 undo 记录时不显示撤销按钮。

#### 不回归

现有 ATR 脚本必须保持绿：`test-atr-home-edit-loop.mjs`、`test-atr-provider-switch.mjs`、`test-atr-send-conflict.mjs`、`test-atr-phase-e-flag.mjs`、`test-atr-phase-f-export.mjs`、`test-work-atr-gate7.mjs`、`test-home-resume-honesty.mjs`、`test-controller-ownership.mjs`、`test-runtime-gates.mjs`、`test-run-contracts.mjs`。

### 3.7 第一期顺带产出的观测数据

`diff` 的 `added` / `removed` 已在每次写入时算出并落进事件流，成本为零。这些数据直接回答第二期的决策问题：

- **每次写入的平均改动行数** vs **目标文件总行数** → 全量覆盖的"空转"程度（模型重发全文但实际只改 3 行时，该比值会很低）。
- **多文件任务的写入轮数** → 审批卡出现次数，验证"批准这一次"是否过于打断。

这两项作为事件字段随第一期一起落地，第二期直接拿来用。

---

## 4. 第二期：效率优化

### 4.1 `edit_file` 工具

**签名**：`edit_file{path, start_line, end_line, new_text, rationale?, risk?}`

引擎侧流程：

1. `scope::resolve_in_root` → 必须在工作区内。
2. 文件必须已存在（不存在 → 沿用 `not_found` 规则引导 `propose_changes` 创建）。
3. 读全文 → 校验 `1 <= start_line <= end_line <= total_lines`。越界 → `line_range_out_of_bounds`，错误带文件总行数，让模型可自纠。
4. `new_content = lines[..start_line-1] + new_text + lines[end_line..]`
5. **完全复用 `tools::build_pending_patch`** → 同一套 `patch_hash`、token 绑定、基线 dirty 检查、审批流。

模型只传行区间、不传全文；审批、token、hash、dirty 机制**零改动**，风险面极小。

**配套改动**：

| 位置 | 改动 |
|---|---|
| `engine.rs:663-671` `TOOL_NAMES` | 加入 `edit_file` |
| `deepseek.rs::tool_schema` | 新增 `edit_file` 的 OpenAI tools schema |
| `prompts.rs::tool_contracts_prompt` | 工具清单加入 `edit_file{path,start_line,end_line,new_text}` |
| `prompts.rs` 系统规则区（第 16-24 行） | "改已有文件优先用 `edit_file` 只传改动的行区间；只有整文件重写或新建文件才用 `propose_changes`/`apply_patch`" |

`apply_patch` 保留为整文件重写与新建文件的兜底。

### 4.2 观测与决策

第二期开始前，先用第一期产出的数据回答：

| 观测项 | 判定 | 若不达标 |
|---|---|---|
| 模型 `edit_file` 使用率 | 使用率 < 30% → prompt/schema 需加强 | 强化工具描述与 prompt 优先级 |
| 全量覆盖比例 | `apply_patch` / 全部写入 > 70% 且平均改动行占比 < 5% | 说明模型倾向全量重发，工具设计或 prompt 有问题 |
| 审批打断次数 | 多文件任务平均审批轮数 > 5 → "批准这一次"过于打断 | 加中间档 scope（本任务剩余不再询问） |

### 4.3 待定项（依据第二期观测再定）

- **文件级撤销**：数据模型已支持，第一期即按 path 分组落库。第二期只需加命令参数与 UI，无需迁移。
- **更多 diff 优化**：如颜色语法高亮、超大 diff 的虚拟滚动、hunk 折叠 —— 按实际使用反馈决定。
- **hunk 级部分批准**：需要片段级 token 与审批状态机，复杂度高。**第一期明确不做**，是否做由第二期后评估。

---

## 5. 风险与缓解

| 风险 | 影响 | 缓解 |
|---|---|---|
| **diff 实现有 bug，显示误导用户** | 用户批准了没看清的改动 | diff **仅用于展示**；写入仍是全量覆盖 + 全文 hash 校验；golden test 锁死 `patch_hash` 逐字节不变；drift 回归测试 |
| **同一文件多次写入的撤销顺序错误** | 恢复到错误内容 | 用 `id` 自增主键排序（`created_at_ms` 毫秒分辨率不可靠）；按 path 分组取最早 pre-image；专门测试覆盖"连续两次写"与"同毫秒两次写" |
| **任务级撤销部分成功被误认为全成功** | 用户以为撤干净了，实际没撤 | 撤销做成原子操作（全有或全无）：先全量漂移预检，任一漂移则零写入并列出漂移文件 |
| **撤销覆盖用户手改内容** | 丢失用户劳动 | 还原前强制校验磁盘 hash == 记录的 new_hash，不符即拒绝 |
| **漏记自主写路径** | 批准后的写入撤不回来 | 两条写入路径（`engine.rs:529-551` / `engine.rs:756-789`）都落 undo 行，并加测试 |
| **大文件 LCS 性能与内存** | 首页卡顿 | 前缀/后缀裁剪 + 2000 行降级阈值 |
| **`pending_patch_json` 体积变大** | SQLite 膨胀 | diff 只含变更 hunk；DTO 只投影 View，`new_content` 不外传 |
| **"批准这一次"过于打断** | 多文件任务体验变差 | 保留「以后都不问」逃生舱；第二期观测审批轮数，必要时加中间档 scope |
| **改动触碰大文件引发回归** | 首页其他功能受损 | 改动限定在 `agent_task_runtime` + ATR 相关 FE 段；不碰 `now-home.js` 等 |

---

## 6. 相关文件

| 层 | 路径 |
|---|---|
| Rust 运行时 | `src-tauri/src/agent_task_runtime/tools.rs`（diff / apply 返回 old）、`engine.rs`（approve scope、undo 落库）、`contracts.rs`（DTO 投影）、`store.rs`（迁移 v4、undo 表读写）、`prompts.rs` |
| IPC 命令 | `src-tauri/src/ipc/commands/shell/agent_task_runtime_cmd.rs` |
| FE 客户端 | `src/js/features/now/home-agent-task.js` |
| FE 状态 | `src/js/features/now/home-agent-v2-store.js` |
| FE 渲染 | `src/js/features/now/home-agent-v2.js` |
| CSS | `src/css/home-agent-v2.css` |
| 测试 | `scripts/test-atr-diff-undo.mjs`（新增）+ 现有 ATR 脚本 |

---

## 7. 决策记录

| 决策 | 选择 | 理由 |
|---|---|---|
| **阶段拆分** | 第一期看得见+撤得回；第二期 edit_file | `edit_file` 解决成本与延迟，不是信任问题；先验证核心假设 |
| diff 展示形态 | 审批卡内联展开，默认折叠 | 改动就在批准按钮旁边，不需跳走；折叠时不遮挡对话 |
| 撤销粒度（第一期） | 仅任务级 | 数据模型已支持 path 级，第二期加参数即可，无需迁移 |
| 撤销排序依据 | `id` 自增主键，非 `created_at_ms` | 毫秒分辨率下同毫秒多次写入顺序不确定，会恢复到错误内容 |
| 撤销恢复策略 | 按 path 分组，取最早 pre-image 单次写回 | 与严格逆序最终态等价，但消除中间态写盘风险 |
| 撤销原子性 | 全有或全无 | 彻底消除"部分成功"这一误导态 |
| hunk 级部分批准 | 第一期不做，第二期后评估 | 需片段级 token 与审批状态机，复杂度高 |
| 批准语义 | 默认「批准这一次」= scope one；「以后都不问」= scope global | 否则第一次批准之后所有写入静默，"看得见"只兑现一次 |
