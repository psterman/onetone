# Project Instructions（Batch A · 后端闭环）实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 OneTone 后端建立「项目说明书」能力：把项目知识提炼为候选 → 用户确认 → 存入 `memory_records` → 渲染成 `AGENTS.md` 与 Cursor `.mdc` → 写入用户仓库的受管区块。

**Architecture:** 新增顶层模块 `src-tauri/src/project_instructions/`，依赖单向 `apply ← render ← decide ← {derive, signals} ← store`。数据层复用既有 `memory_records`（`memory_type='instruction'`）并新增一张 `instruction_candidates` 表；渲染器只认中间表示 IR，不认存储细节。

**Tech Stack:** Rust 2021 / rusqlite / serde / serde_json / sha2 / Tauri 2 IPC

**Spec:** `docs/superpowers/specs/2026-11-03-project-instructions-design.md`

---

## Global Constraints

以下约束来自 spec，**每个任务隐含包含**：

1. **不修改任何 hook probe 的 `SAFE_KEYS`；不记录 `tool_input`；不保存 prompt/response 原文。**
2. **`memory_records` 表结构不变**；仅新增 `instruction_candidates`（migration **V7**，当前 schema 版本为 V6）。
3. **用户已有文件在受管区块外的内容必须逐字节不变**；绝不整体覆盖用户文件。
4. **渲染产物不得包含未经用户确认的候选。**
5. **撤回后文件回到应用前状态**（区块消失，其余不变）。
6. **说明书条目必须能被 `query_memory` 查到**（证明 MCP `agent_memory_search` 天然覆盖）。
7. 项目读取**一律走既有 `project_context` scope 路径**（用户确认 + 有限读取 + 预算 + 取消），**不得新增任何文件读取权限**，不得直接 `fs::read` 项目文件。
8. 所有写盘动作必须经**显式用户确认**（`apply_confirm`），预览与确认分离。
9. 仓库既有约定：错误码用小写下划线字符串（如 `grant_required`）；Rust 侧 `snake_case` 字段、serde `camelCase` 序列化；前端 ES5 风格（Batch B）。
10. 测试命令（`--no-default-features` 必须带：vosk / kws 需要原生库）：
    - Rust 单元测试（纯函数模块 derive / signals / render / apply）：
      `cargo test --manifest-path src-tauri/Cargo.toml --no-default-features --lib project_instructions`
    - Rust 集成测试（DB 模块 store / decide）：
      `cargo test --manifest-path src-tauri/Cargo.toml --no-default-features --test project_instructions_db`
    - Rust 验收测试（端到端矩阵）：
      `cargo test --manifest-path src-tauri/Cargo.toml --no-default-features --test project_instructions_plan`
    - **依赖数据库的测试一律放独立测试二进制**（`src-tauri/tests/` 下），不放 `src/` 内的
      `#[cfg(test)] mod tests` —— agent_memory 的 DB 连接是进程级全局的
      （`store::with_write` → `WRITE_CONN.get_or_init`），库内单测里的
      `ONETONE_AGENT_MEMORY_DB` 覆盖有竞态，会把测试数据写进**用户真实的数据库**。

### 已核实的既有 API（实施时直接用，不要重新发明）

```rust
// agent_memory::store（经 crate::agent_memory::{with_write, with_read_path} 导出）
pub fn with_write<F, T>(f: F) -> Result<T, String>
where F: FnOnce(&mut Connection) -> Result<T, String>;
pub fn with_read_path<F, T>(f: F) -> Result<T, String>
where F: FnOnce(&mut Connection) -> Result<T, String>;
pub fn now_ms() -> u64;

// agent_memory::memory（crate::agent_memory::upsert_memory）
pub fn upsert_memory(
    project_id: &str,
    session_id: Option<&str>,
    memory_type: &str,
    content: &str,
    source_event_id: Option<&str>,
    confidence: Option<f32>,
    supersedes_id: Option<&str>,
    user_authored: bool,
) -> Result<MemoryRecordDto, String>;

pub fn query_memory(project_id: &str, query: &str, limit: usize) -> Result<Vec<MemoryRecordDto>, String>;
pub fn list_recent_memory(project_id: &str, limit: usize) -> Result<Vec<MemoryRecordDto>, String>;
```

`upsert_memory` 的既有约束（必须遵守）：
- `memory_type` 白名单在 `agent_memory/memory.rs` 的 `valid_type()`，当前只允许
  `observation | decision | gotcha | task | reasoning | summary | context` —— **本计划 Task 1 会加 `instruction`**。
- `source_event_id` 为空时 **必须** `user_authored = true`，否则报错 `source_event_id required (or user_authored)`。
- `content` 上限 **2000 字符**（`MAX_CONTENT`），且 `clip_content` 会拒绝含 `sk-` / `api_key=` / `authorization: bearer` 等特征的字符串。
- `memory_id` 是确定性的：`sha256(project|type|source)`，无 source 时为 `sha256(project|type|user|content)` → 重复写入天然幂等。

```rust
// project_context（crate::project_context::*）
pub fn run_query(window: &str, args: &QueryArgs) -> Result<QueryResult, ContextError>;
pub struct QueryArgs { pub scope_id: String, pub task_scope_id: String, pub request_id: String, pub query: ContextQuery }
pub enum ContextQuery { Passport, ListFiles { relative_dir: String }, ReadExcerpt { .. }, GitChanges { .. }, GitDiff { .. }, Validate { .. } }
pub struct QueryResult { pub request_id: String, pub scope_id: String, pub task_scope_id: String,
                          pub result: QueryPayload, pub truncated: bool, pub limit_reason: Option<String>,
                          pub usage: BudgetUsage }
pub enum QueryPayload { Passport { record: EvidenceRecord }, ListFiles { items: Vec<FileListItem> }, .. }
pub struct EvidenceRecord { pub content: String, pub source_version: String, pub source_refs: Vec<SourceRef>,
                            pub truncated: bool, pub limit_reason: Option<String>, .. }
pub struct FileListItem { pub relative_path: String, pub display_path: String, pub is_dir: bool }
```

**passport body 格式**（`EvidenceRecord.content`）：每个文件一段 `## {文件名}\n```\n{文件内容}\n```\n`。
**`source_version`** = 所有来源文件内容哈希拼接后的哈希 → **可直接用作漂移检测基线**。

---

### Task 1: 存储层 —— `memory_type` 白名单 + migration V7 + 候选 CRUD

**Files:**
- Modify: `src-tauri/src/agent_memory/memory.rs`（`valid_type` 白名单加 `instruction`）
- Modify: `src-tauri/src/agent_memory/store.rs`（新增 `MIGRATION_V7` + `migrate()` 中的 `applied_v7` 分支）
- Modify: `src-tauri/src/agent_memory/mod.rs`（`pub use store::{now_ms, with_read_path, with_write};` —— `now_ms` 之前没被 re-export）
- Create: `src-tauri/src/project_instructions/mod.rs`
- Create: `src-tauri/src/project_instructions/model.rs`
- Create: `src-tauri/src/project_instructions/store.rs`
- Create: `src-tauri/tests/project_instructions_db.rs`（DB 相关测试放独立二进制，见 Step 6 的理由）
- Modify: `src-tauri/src/lib.rs`（声明 `pub mod project_instructions;`）

**Interfaces:**
- Consumes: `crate::agent_memory::{with_write, with_read_path, now_ms}`
- Produces:
  - `onetone::project_instructions::model::{Candidate, InstructionItem, InstructionSection, ProjectInstructionDoc}`
  - 常量 `KIND_DERIVED/KIND_SIGNAL/KIND_MANUAL`、`SECTION_*`、`ALL_SECTIONS`、`STATUS_*`、`MEMORY_TYPE_INSTRUCTION`
  - `onetone::project_instructions::store::{upsert_candidate, list_candidates, candidate_by_id, set_candidate_status, candidate_id_for}`

- [ ] **Step 1: 写失败测试 —— `memory_type='instruction'` 被接受**

`src-tauri/src/agent_memory/memory.rs` **目前没有** `#[cfg(test)] mod tests`（已核实），
所以要在该文件**新建**一个测试模块并放入这个用例：

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_instruction_memory_type() {
        assert!(valid_type("instruction"));
    }
}
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cargo test --manifest-path src-tauri/Cargo.toml --no-default-features --lib accepts_instruction_memory_type`
Expected: FAIL —— `valid_type("instruction")` 返回 false

- [ ] **Step 3: 最小实现 —— 扩白名单**

把 `memory.rs` 的 `valid_type` 改为：

```rust
fn valid_type(t: &str) -> bool {
    matches!(
        t,
        "observation"
            | "decision"
            | "gotcha"
            | "task"
            | "reasoning"
            | "summary"
            | "context"
            | "instruction"
    )
}
```

同时在 `memory.rs` 里**新增一个按类型读取的函数**（现有 `query_memory` / `list_recent_memory`
都做不到这件事，见下面注释里的原因）：

```rust
/// 按类型列出某项目的记忆，最新优先。
///
/// **为什么不能直接用 `query_memory(project_id, "", n)`**：
/// 空 query 会退化成 `list_recent_memory` —— 返回最近 n 条**所有类型**的记忆。
/// 项目里普通记忆一多（observation / decision / gotcha …），
/// `type='instruction'` 的行会被挤出窗口、被**静默丢弃**。
/// 说明书条目丢一条就是用户规则少一条，所以这里在 SQL 里按类型过滤。
pub fn list_memories_by_type(
    project_id: &str,
    memory_type: &str,
    limit: usize,
) -> Result<Vec<MemoryRecordDto>, String> {
    if project_id.trim().is_empty() {
        return Err("project_id required".into());
    }
    if !valid_type(memory_type) {
        return Err(format!("invalid memory_type: {memory_type}"));
    }
    let lim = limit.clamp(1, 200);
    with_read_path(|conn| {
        let mut stmt = conn
            .prepare(
                "SELECT memory_id, project_id, session_id, memory_type, content,
                        source_event_id, confidence, created_at_ms, updated_at_ms, supersedes_id,
                        COALESCE(user_authored, 0)
                 FROM memory_records
                 WHERE project_id = ?1 AND memory_type = ?2
                 ORDER BY updated_at_ms DESC, memory_id ASC
                 LIMIT ?3",
            )
            .map_err(|e| e.to_string())?;
        let mapped = stmt
            .query_map(params![project_id, memory_type, lim as i64], map_memory_row)
            .map_err(|e| e.to_string())?;
        Ok(mapped.flatten().collect())
    })
}
```

> `memory.rs` 顶部已有 `use rusqlite::params;`（`upsert_memory` 在用），无需新增 import。
> `map_memory_row` 是 `memory.rs` 内的私有函数，直接复用。

- [ ] **Step 4: 运行测试确认通过**

Run: `cargo test --manifest-path src-tauri/Cargo.toml --no-default-features --lib accepts_instruction_memory_type`
Expected: PASS

- [ ] **Step 5: 导出 `now_ms` + `list_memories_by_type`（后续每个任务都依赖）**

`now_ms` 目前**没有**从 `crate::agent_memory` 导出（`agent_memory/mod.rs:90` 只有
`pub use store::{with_read_path, with_write};`），而 `project_instructions/store.rs` 的
`use crate::agent_memory::{now_ms, with_read_path, with_write};` 需要它。

把 `src-tauri/src/agent_memory/mod.rs` 的

```rust
pub use store::{with_read_path, with_write};
```

改为

```rust
pub use store::{now_ms, with_read_path, with_write};
```

（`now_ms` 在 `agent_memory/store.rs:357` 已是 `pub fn now_ms() -> u64`，只是没被 re-export。）

再把 `agent_memory/mod.rs` 里的 memory 导出改成包含新函数：

```rust
pub use memory::{
    context_for_provider, list_memories_by_type, list_recent_memory, query_memory,
    rebuild_memory_fts, upsert_memory,
};
```

- [ ] **Step 6: 写失败测试 —— 候选表 CRUD**

**测试放在独立集成测试二进制里，不放 `src/` 内的 `#[cfg(test)] mod tests`。**

原因：`agent_memory::store::with_write` 用的是**进程级全局连接**（`WRITE_CONN.get_or_init`），
DB 路径在第一次 `with_write` 调用时被 `agent_memory_db_path()` 固定。
在库内单测里用 `std::env::set_var("ONETONE_AGENT_MEMORY_DB", ...)` 去覆盖是**有竞态**的：
同进程里既有的 agent_memory 单测（`work_descriptor` / `cursor_adapter` / `agent_center`）
随时可能先初始化连接 → 覆盖失效 → 测试数据被写进**用户真实的 agent-memory 数据库**，
而且第二次运行会因遗留状态而失败（例：drift 测试第二次返回 0）。
独立测试二进制自带进程、没有别人抢先初始化 → 覆盖必然生效，DB 每次运行都是全新临时文件。

这与仓库既有做法一致：`src-tauri/tests/agent_memory_plan_a.rs` / `_plan_b.rs` / `_plan_c.rs`
的 DB 测试都放在 `tests/` 下，靠独占进程保证隔离。

先创建 `src-tauri/tests/project_instructions_db.rs`：

```rust
//! Project Instructions —— 依赖数据库的测试（store + decide）。
//!
//! Gate: cargo test --manifest-path src-tauri/Cargo.toml --no-default-features --test project_instructions_db
//!
//! 独立二进制的原因：agent_memory 的 DB 连接是进程级全局的
//! （`store::with_write` → `WRITE_CONN.get_or_init`），
//! 只有独占进程才能保证 `ONETONE_AGENT_MEMORY_DB` 覆盖在第一次写库之前生效。

use onetone::agent_memory::now_ms;
use onetone::project_instructions::model::{
    Candidate, KIND_DERIVED, SECTION_COMMANDS, STATUS_ACCEPTED, STATUS_PENDING, STATUS_REJECTED,
};
use onetone::project_instructions::store::{
    candidate_by_id, candidate_id_for, list_candidates, set_candidate_status, upsert_candidate,
};
use std::sync::{Mutex, MutexGuard, Once};

static INIT: Once = Once::new();
static TEST_LOCK: Mutex<()> = Mutex::new(());

fn lock_db() -> MutexGuard<'static, ()> {
    INIT.call_once(|| {
        let dir = std::env::temp_dir().join(format!(
            "onetone-project-instructions-db-{}",
            std::process::id()
        ));
        let _ = std::fs::create_dir_all(&dir);
        std::env::set_var("ONETONE_AGENT_MEMORY_DB", dir.join("agent-memory.sqlite3"));
    });
    TEST_LOCK.lock().unwrap_or_else(|e| e.into_inner())
}

fn cand(project: &str, content: &str) -> Candidate {
    let now = now_ms();
    Candidate {
        candidate_id: candidate_id_for(project, KIND_DERIVED, SECTION_COMMANDS, content),
        project_id: project.into(),
        kind: KIND_DERIVED.into(),
        section: SECTION_COMMANDS.into(),
        proposed_content: content.into(),
        evidence_json: None,
        confidence: 0.8,
        status: STATUS_PENDING.into(),
        accepted_memory_id: None,
        created_at_ms: now,
        updated_at_ms: now,
    }
}

#[test]
fn upsert_is_idempotent() {
    let _g = lock_db();
    let c = cand("p1", "npm test");
    upsert_candidate(&c).unwrap();
    upsert_candidate(&c).unwrap();
    let all = list_candidates("p1", None).unwrap();
    assert_eq!(all.len(), 1, "same content must not duplicate");
}

#[test]
fn rejected_candidate_is_not_revived_by_rederive() {
    let _g = lock_db();
    let c = cand("p2", "npm run deploy");
    upsert_candidate(&c).unwrap();
    set_candidate_status(&c.candidate_id, STATUS_REJECTED, None).unwrap();
    upsert_candidate(&c).unwrap();
    let got = candidate_by_id(&c.candidate_id).unwrap().unwrap();
    assert_eq!(got.status, STATUS_REJECTED, "rejected must stay rejected");
}

#[test]
fn lists_by_status_and_project() {
    let _g = lock_db();
    let a = cand("p3", "cargo test");
    upsert_candidate(&a).unwrap();
    assert_eq!(list_candidates("p3", Some(STATUS_PENDING)).unwrap().len(), 1);
    assert_eq!(list_candidates("p3", Some(STATUS_ACCEPTED)).unwrap().len(), 0);
    assert_eq!(list_candidates("other", None).unwrap().len(), 0);
}
```

然后创建 `src-tauri/src/project_instructions/store.rs`（**只有实现，不带 `#[cfg(test)]`**）：

```rust
//! instruction_candidates 表读写（Project Instructions Batch A）

use crate::agent_memory::{now_ms, with_read_path, with_write};
use rusqlite::{params, Row};
use sha2::{Digest, Sha256};

use super::model::{Candidate, STATUS_ACCEPTED, STATUS_PENDING, STATUS_REJECTED, STATUS_STALE};

fn map_row(r: &Row<'_>) -> rusqlite::Result<Candidate> {
    Ok(Candidate {
        candidate_id: r.get(0)?,
        project_id: r.get(1)?,
        kind: r.get(2)?,
        section: r.get(3)?,
        proposed_content: r.get(4)?,
        evidence_json: r.get(5)?,
        confidence: r.get(6)?,
        status: r.get(7)?,
        accepted_memory_id: r.get(8)?,
        created_at_ms: r.get::<_, i64>(9)? as u64,
        updated_at_ms: r.get::<_, i64>(10)? as u64,
    })
}

const SELECT_COLS: &str = "candidate_id, project_id, kind, section, proposed_content, \
     evidence_json, confidence, status, accepted_memory_id, created_at_ms, updated_at_ms";

/// Deterministic id — same (project, kind, section, content) always maps to the same row.
pub fn candidate_id_for(project_id: &str, kind: &str, section: &str, content: &str) -> String {
    format!(
        "{:x}",
        Sha256::digest(format!("{project_id}|{kind}|{section}|{content}").as_bytes())
    )
}

/// Insert or refresh a candidate. `status` is NOT reset on conflict:
/// a rejected candidate must not come back to life on the next derive.
pub fn upsert_candidate(c: &Candidate) -> Result<(), String> {
    with_write(|conn| {
        conn.execute(
            "INSERT INTO instruction_candidates(
               candidate_id, project_id, kind, section, proposed_content,
               evidence_json, confidence, status, accepted_memory_id,
               created_at_ms, updated_at_ms
             ) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?10)
             ON CONFLICT(project_id, kind, section, proposed_content) DO UPDATE SET
               evidence_json = excluded.evidence_json,
               confidence    = excluded.confidence,
               updated_at_ms = excluded.updated_at_ms",
            params![
                c.candidate_id,
                c.project_id,
                c.kind,
                c.section,
                c.proposed_content,
                c.evidence_json,
                c.confidence,
                c.status,
                c.accepted_memory_id,
                c.created_at_ms as i64,
            ],
        )
        .map_err(|e| format!("upsert candidate: {e}"))?;
        Ok(())
    })
}

pub fn list_candidates(project_id: &str, status: Option<&str>) -> Result<Vec<Candidate>, String> {
    with_read_path(|conn| {
        let sql = format!(
            "SELECT {SELECT_COLS} FROM instruction_candidates
             WHERE project_id = ?1 AND (?2 IS NULL OR status = ?2)
             ORDER BY status ASC, section ASC, updated_at_ms DESC"
        );
        let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(params![project_id, status], map_row)
            .map_err(|e| e.to_string())?;
        let mut out = Vec::new();
        for r in rows {
            out.push(r.map_err(|e| e.to_string())?);
        }
        Ok(out)
    })
}

pub fn candidate_by_id(candidate_id: &str) -> Result<Option<Candidate>, String> {
    with_read_path(|conn| {
        let sql = format!("SELECT {SELECT_COLS} FROM instruction_candidates WHERE candidate_id = ?1");
        let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
        let mut rows = stmt.query_map(params![candidate_id], map_row).map_err(|e| e.to_string())?;
        match rows.next() {
            Some(r) => Ok(Some(r.map_err(|e| e.to_string())?)),
            None => Ok(None),
        }
    })
}

pub fn set_candidate_status(
    candidate_id: &str,
    status: &str,
    accepted_memory_id: Option<&str>,
) -> Result<(), String> {
    if !matches!(status, STATUS_PENDING | STATUS_ACCEPTED | STATUS_REJECTED | STATUS_STALE) {
        return Err(format!("invalid candidate status: {status}"));
    }
    with_write(|conn| {
        conn.execute(
            "UPDATE instruction_candidates
                SET status = ?2,
                    accepted_memory_id = COALESCE(?3, accepted_memory_id),
                    updated_at_ms = ?4
              WHERE candidate_id = ?1",
            params![candidate_id, status, accepted_memory_id, now_ms() as i64],
        )
        .map_err(|e| format!("set candidate status: {e}"))?;
        Ok(())
    })
}

> 本文件**不带** `#[cfg(test)] mod tests` —— store 的测试在
> `src-tauri/tests/project_instructions_db.rs`（理由见 Step 6）。
```

同时创建 `src-tauri/src/project_instructions/model.rs`：

```rust
//! 项目说明书的类型与常量（Batch A）

use serde::{Deserialize, Serialize};

pub const KIND_DERIVED: &str = "derived";
pub const KIND_SIGNAL: &str = "signal";
pub const KIND_MANUAL: &str = "manual";

pub const SECTION_OVERVIEW: &str = "overview";
pub const SECTION_COMMANDS: &str = "commands";
pub const SECTION_MAP: &str = "map";
pub const SECTION_INVARIANTS: &str = "invariants";
pub const SECTION_BOUNDARIES: &str = "boundaries";
pub const SECTION_GOTCHAS: &str = "gotchas";

pub const ALL_SECTIONS: [&str; 6] = [
    SECTION_OVERVIEW,
    SECTION_COMMANDS,
    SECTION_MAP,
    SECTION_INVARIANTS,
    SECTION_BOUNDARIES,
    SECTION_GOTCHAS,
];

pub const STATUS_PENDING: &str = "pending";
pub const STATUS_ACCEPTED: &str = "accepted";
pub const STATUS_REJECTED: &str = "rejected";
pub const STATUS_STALE: &str = "stale";

pub const MEMORY_TYPE_INSTRUCTION: &str = "instruction";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Candidate {
    pub candidate_id: String,
    pub project_id: String,
    pub kind: String,
    pub section: String,
    pub proposed_content: String,
    pub evidence_json: Option<String>,
    pub confidence: f32,
    pub status: String,
    pub accepted_memory_id: Option<String>,
    pub created_at_ms: u64,
    pub updated_at_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstructionItem {
    pub text: String,
    pub origin_kind: String,
    pub memory_id: String,
    pub confidence: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstructionSection {
    pub key: String,
    pub title: String,
    pub items: Vec<InstructionItem>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectInstructionDoc {
    pub project_id: String,
    pub generated_at_ms: u64,
    pub sections: Vec<InstructionSection>,
}
```

并创建 `src-tauri/src/project_instructions/mod.rs`：

```rust
//! 项目说明书（Project Instructions）—— Batch A 后端闭环。
//!
//! 依赖单向：apply ← render ← decide ← {derive, signals} ← store
//! 读取一律走既有 project_context scope 路径；写入必须经用户显式确认。

pub mod apply;
pub mod decide;
pub mod derive;
pub mod model;
pub mod render;
pub mod signals;
pub mod store;
pub mod targets;
```

本任务只填 `model.rs` 与 `store.rs`。其余 6 个子模块**必须先建出文件**，否则 `mod` 声明会报 `file not found for module`。
每个占位文件的内容就是下面这一行（纯注释是合法的 Rust 文件）：

```rust
// placeholder — implemented in a later task of Batch A
```

需要创建的占位文件：

- `src-tauri/src/project_instructions/apply.rs`
- `src-tauri/src/project_instructions/decide.rs`
- `src-tauri/src/project_instructions/derive.rs`
- `src-tauri/src/project_instructions/render.rs`
- `src-tauri/src/project_instructions/signals.rs`
- `src-tauri/src/project_instructions/targets.rs`

后续任务会**逐个覆盖同名文件**，不要在占位文件里额外加 `mod` / `pub use` / 测试。

在 `src-tauri/src/lib.rs` 顶部模块声明区加入：

```rust
pub mod project_instructions;
```

- [ ] **Step 7: 写失败测试 —— migration V7 建表**

在 `src-tauri/src/agent_memory/store.rs` 的 `#[cfg(test)] mod tests` 内追加：

```rust
    #[test]
    fn migration_v7_creates_instruction_candidates() {
        let conn = super::open_rw(Path::new(":memory:")).expect("open in-memory");
        super::migrate(&conn).expect("migrate");
        let n: i64 = conn
            .query_row(
                "SELECT COUNT(1) FROM sqlite_master WHERE type='table' AND name='instruction_candidates'",
                [],
                |r| r.get(0),
            )
            .expect("count tables");
        assert_eq!(n, 1, "instruction_candidates table must exist after migrate");
    }
```

- [ ] **Step 8: 运行测试确认失败**

Run: `cargo test --manifest-path src-tauri/Cargo.toml --no-default-features --lib migration_v7_creates_instruction_candidates`
Expected: FAIL —— 表不存在（count = 0）

- [ ] **Step 9: 最小实现 —— 加 MIGRATION_V7**

在 `store.rs` 的 `MIGRATION_V6` 常量之后追加：

```rust
const MIGRATION_V7: &str = r#"
CREATE TABLE IF NOT EXISTS instruction_candidates (
  candidate_id       TEXT PRIMARY KEY,
  project_id         TEXT NOT NULL,
  kind               TEXT NOT NULL,
  section            TEXT NOT NULL,
  proposed_content   TEXT NOT NULL,
  evidence_json      TEXT,
  confidence         REAL NOT NULL DEFAULT 0.5,
  status             TEXT NOT NULL DEFAULT 'pending',
  accepted_memory_id TEXT,
  created_at_ms      INTEGER NOT NULL,
  updated_at_ms      INTEGER NOT NULL,
  UNIQUE(project_id, kind, section, proposed_content)
);
CREATE INDEX IF NOT EXISTS idx_ic_project_status
  ON instruction_candidates(project_id, status, updated_at_ms DESC);
"#;
```

在 `migrate()` 函数中，`applied_v6` 分支之后追加：

```rust
    let applied_v7: i64 = conn
        .query_row(
            "SELECT COUNT(1) FROM schema_migrations WHERE version = 7",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);
    if applied_v7 == 0 {
        conn.execute_batch(MIGRATION_V7)
            .map_err(|e| format!("migrate v7: {e}"))?;
        let now = now_ms() as i64;
        conn.execute(
            "INSERT INTO schema_migrations(version, applied_at_ms) VALUES (7, ?1)",
            [now],
        )
        .map_err(|e| format!("record migration v7: {e}"))?;
    }
```

- [ ] **Step 10: 运行全部相关测试确认通过**

Run:
```bash
cargo test --manifest-path src-tauri/Cargo.toml --no-default-features --lib project_instructions
cargo test --manifest-path src-tauri/Cargo.toml --no-default-features --test project_instructions_db
cargo test --manifest-path src-tauri/Cargo.toml --no-default-features --lib accepts_instruction_memory_type
cargo test --manifest-path src-tauri/Cargo.toml --no-default-features --lib migration_v7_creates_instruction_candidates
```
Expected: 全部 PASS。

> 注意过滤词：`cargo test --lib project_instructions` 按**完整测试路径**过滤，
> 匹配不到 `agent_memory::memory::tests::accepts_instruction_memory_type`
> 和 `agent_memory::store::tests::migration_v7_creates_instruction_candidates`
> —— 它们在 `agent_memory::` 命名空间下，所以要单独用名字跑。
> 第三个命令覆盖 `accepts_instruction_memory_type`（含白名单断言），
> 第四个命令覆盖 `migration_v7_creates_instruction_candidates`（建表断言），
> 第二个命令覆盖 store 的 3 个 CRUD 测试。

- [ ] **Step 11: 提交**

```bash
git add src-tauri/src/agent_memory/memory.rs src-tauri/src/agent_memory/store.rs \
        src-tauri/src/agent_memory/mod.rs \
        src-tauri/src/project_instructions/ src-tauri/src/lib.rs \
        src-tauri/tests/project_instructions_db.rs
git commit -m "feat(project-instructions): candidate store + instruction memory type"
```

---

### Task 2: 确定性推导 —— passport → derived 候选

**Files:**
- Create: `src-tauri/src/project_instructions/derive.rs`

**Interfaces:**
- Consumes: `crate::project_context::contracts::{EvidenceRecord, FileListItem}`、`super::model::*`
- Produces:
  - `pub struct DerivedCandidate { pub section: &'static str, pub content: String, pub confidence: f32, pub evidence: serde_json::Value }`
  - `pub fn derive_from_passport(record: &EvidenceRecord, root_items: &[FileListItem]) -> Vec<DerivedCandidate>`
  - `pub fn passport_sections(body: &str) -> Vec<(String, String)>`

- [ ] **Step 1: 写失败测试**

创建 `src-tauri/src/project_instructions/derive.rs`，先写测试：

```rust
//! 从 passport 与根目录清单推导确定性候选（只抄不推断）。

use serde_json::json;

use crate::project_context::contracts::{EvidenceRecord, FileListItem};

use super::model::{SECTION_COMMANDS, SECTION_MAP, SECTION_OVERVIEW};

#[derive(Debug, Clone)]
pub struct DerivedCandidate {
    pub section: &'static str,
    pub content: String,
    pub confidence: f32,
    pub evidence: serde_json::Value,
}

/// 拆出 passport body 中的每个文件块。
///
/// passport body 形如：`## README.md\n```\n<内容>\n```\n`。
/// 文件内容本身可能含 ```（README 里的代码块），因此**不能**用「遇到下一个 ```
/// 就结束」的方式切分——必须取该段落里**第一个** fence 与**最后一个** fence 之间的全部内容。
pub fn passport_sections(body: &str) -> Vec<(String, String)> {
    let mut heads: Vec<(usize, String)> = Vec::new();
    let mut off = 0usize;
    for line in body.split_inclusive('\n') {
        if let Some(rest) = line.strip_prefix("## ") {
            heads.push((off, rest.trim().to_string()));
        }
        off += line.len();
    }
    let mut out = Vec::new();
    for i in 0..heads.len() {
        let (start, name) = &heads[i];
        let end = heads.get(i + 1).map(|(o, _)| *o).unwrap_or(body.len());
        out.push((name.clone(), extract_fenced(&body[*start..end])));
    }
    out
}

fn extract_fenced(slice: &str) -> String {
    let lines: Vec<&str> = slice.lines().collect();
    let first = lines.iter().position(|l| l.trim() == "```");
    let last = lines.iter().rposition(|l| l.trim() == "```");
    match (first, last) {
        (Some(a), Some(b)) if b > a => lines[a + 1..b].join("\n"),
        _ => String::new(),
    }
}

/// 排除发布/部署类脚本（发布动作不该由 Agent 自动触发）。
pub fn is_excluded_script(name: &str) -> bool {
    let n = name.trim().to_ascii_lowercase();
    n.starts_with("publish") || n.starts_with("release") || n.starts_with("deploy")
}

const MAX_COMMAND_CANDIDATES: usize = 12;

/// 命令条数上限：先取非 test 前缀的命令，再用 test:* 补齐。
fn select_scripts(scripts: &[(String, String)]) -> Vec<(String, String)> {
    let mut primary: Vec<(String, String)> = Vec::new();
    let mut tests: Vec<(String, String)> = Vec::new();
    for (name, cmd) in scripts {
        if is_excluded_script(name) {
            continue;
        }
        if name.trim().to_ascii_lowercase().starts_with("test") {
            tests.push((name.clone(), cmd.clone()));
        } else {
            primary.push((name.clone(), cmd.clone()));
        }
    }
    primary.sort_by(|a, b| a.0.cmp(&b.0));
    tests.sort_by(|a, b| a.0.cmp(&b.0));
    let mut out: Vec<(String, String)> = primary.into_iter().take(MAX_COMMAND_CANDIDATES).collect();
    if out.len() < MAX_COMMAND_CANDIDATES {
        let room = MAX_COMMAND_CANDIDATES - out.len();
        out.extend(tests.into_iter().take(room));
    }
    out
}

fn derive_from_package_json(text: &str, version: &str) -> Vec<DerivedCandidate> {
    let Ok(v) = serde_json::from_str::<serde_json::Value>(text) else {
        return Vec::new();
    };
    let mut out = Vec::new();
    if let Some(desc) = v.get("description").and_then(|d| d.as_str()) {
        let d = desc.trim();
        if !d.is_empty() {
            out.push(DerivedCandidate {
                section: SECTION_OVERVIEW,
                content: d.to_string(),
                confidence: 0.8,
                evidence: json!({ "source": "package.json#description", "sourceVersion": version }),
            });
        }
    }
    let scripts: Vec<(String, String)> = v
        .get("scripts")
        .and_then(|s| s.as_object())
        .map(|m| {
            m.iter()
                .filter_map(|(k, val)| val.as_str().map(|s| (k.clone(), s.to_string())))
                .collect()
        })
        .unwrap_or_default();
    let total = scripts.len();
    for (name, cmd) in select_scripts(&scripts) {
        out.push(DerivedCandidate {
            section: SECTION_COMMANDS,
            content: format!("`{name}` — {}", cmd.trim()),
            confidence: 0.8,
            evidence: json!({ "source": "package.json#scripts", "script": name, "sourceVersion": version }),
        });
    }
    if total > MAX_COMMAND_CANDIDATES {
        out.push(DerivedCandidate {
            section: SECTION_MAP,
            content: format!("其余 {total} 个脚本见 `package.json#scripts`（本说明只列常用 {MAX_COMMAND_CANDIDATES} 条）"),
            confidence: 0.6,
            evidence: json!({ "source": "package.json#scripts", "truncated": total, "sourceVersion": version }),
        });
    }
    out
}

fn derive_from_readme(text: &str, version: &str) -> Vec<DerivedCandidate> {
    let para = text
        .lines()
        .map(|l| l.trim())
        .find(|l| !l.is_empty() && !l.starts_with('#') && !l.starts_with('<'))
        .unwrap_or("");
    if para.is_empty() {
        return Vec::new();
    }
    vec![DerivedCandidate {
        section: SECTION_OVERVIEW,
        content: para.chars().take(200).collect(),
        confidence: 0.6,
        evidence: json!({ "source": "README.md", "sourceVersion": version }),
    }]
}

fn derive_from_cargo_toml(text: &str, version: &str) -> Vec<DerivedCandidate> {
    if !text.contains("[workspace]") {
        return Vec::new();
    }
    vec![DerivedCandidate {
        section: SECTION_MAP,
        content: "Cargo workspace：成员未展开（见 `Cargo.toml`）".to_string(),
        confidence: 0.7,
        evidence: json!({ "source": "Cargo.toml#workspace", "sourceVersion": version }),
    }]
}

/// 根目录目录名（只列名，不读内容）。最多 8 个，按名称排序。
fn derive_root_dirs(items: &[FileListItem]) -> Vec<DerivedCandidate> {
    let mut dirs: Vec<String> = items
        .iter()
        .filter(|i| i.is_dir && !i.relative_path.contains('/'))
        .map(|i| i.relative_path.trim_end_matches('/').to_string())
        .filter(|d| !d.is_empty() && !d.starts_with('.'))
        .collect();
    dirs.sort();
    dirs.dedup();
    dirs.truncate(8);
    if dirs.is_empty() {
        return Vec::new();
    }
    vec![DerivedCandidate {
        section: SECTION_MAP,
        content: format!("顶层目录：{}", dirs.join(" / ")),
        confidence: 0.7,
        evidence: json!({ "source": "root_listing", "dirs": dirs }),
    }]
}

pub fn derive_from_passport(
    record: &EvidenceRecord,
    root_items: &[FileListItem],
) -> Vec<DerivedCandidate> {
    let version = record.source_version.as_str();
    let sections = passport_sections(&record.content);
    let mut out = Vec::new();
    for (name, text) in &sections {
        match name.as_str() {
            "package.json" => out.extend(derive_from_package_json(text, version)),
            "README.md" => out.extend(derive_from_readme(text, version)),
            "Cargo.toml" => out.extend(derive_from_cargo_toml(text, version)),
            _ => {}
        }
    }
    out.extend(derive_root_dirs(root_items));
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn passport(body: &str) -> EvidenceRecord {
        EvidenceRecord {
            schema_version: 1,
            id: "ev_pass_test".into(),
            scope_id: "s".into(),
            task_scope_id: "t".into(),
            kind: "passport".into(),
            label: "l".into(),
            display_path: None,
            source_ref: None,
            relative_path: None,
            range: None,
            content: body.to_string(),
            source_version: "v1".into(),
            source_refs: vec![],
            captured_at: "now".into(),
            truncated: false,
            limit_reason: None,
            freshness: "captured".into(),
            git: None,
        }
    }

    #[test]
    fn splits_sections_with_nested_fences() {
        let body = "## README.md\n```\nline\n```rust\ncode\n```\n```\n## package.json\n```\n{}\n```\n";
        let secs = passport_sections(body);
        assert_eq!(secs.len(), 2);
        assert_eq!(secs[0].0, "README.md");
        assert!(secs[0].1.contains("```rust"), "nested fence must be preserved");
        assert_eq!(secs[1].0, "package.json");
        assert_eq!(secs[1].1.trim(), "{}");
    }

    #[test]
    fn derives_overview_and_commands_from_package_json() {
        let body = "## package.json\n```\n{\"description\":\"demo app\",\"scripts\":{\"dev\":\"vite\",\"publish\":\"x\",\"test:unit\":\"vitest\"}}\n```\n";
        let cands = derive_from_passport(&passport(body), &[]);
        assert!(cands.iter().any(|c| c.section == SECTION_OVERVIEW && c.content == "demo app"));
        assert!(cands.iter().any(|c| c.section == SECTION_COMMANDS && c.content.contains("`dev`")));
        assert!(!cands.iter().any(|c| c.content.contains("publish")));
    }

    #[test]
    fn excludes_release_like_scripts() {
        assert!(is_excluded_script("publish"));
        assert!(is_excluded_script("release:stable"));
        assert!(is_excluded_script("deploy"));
        assert!(!is_excluded_script("test:unit"));
    }

    #[test]
    fn caps_command_candidates() {
        let mut scripts = Vec::new();
        for i in 0..30 {
            scripts.push((format!("s{i:02}"), "x".to_string()));
        }
        assert_eq!(select_scripts(&scripts).len(), MAX_COMMAND_CANDIDATES);
    }

    #[test]
    fn prefers_non_test_scripts_over_tests() {
        let scripts = vec![
            ("test:a".to_string(), "x".to_string()),
            ("dev".to_string(), "y".to_string()),
        ];
        let picked = select_scripts(&scripts);
        assert_eq!(picked[0].0, "dev");
    }

    #[test]
    fn derives_root_dirs_from_listing() {
        let items = vec![
            FileListItem { relative_path: "src".into(), display_path: "src".into(), is_dir: true },
            FileListItem { relative_path: "src-tauri".into(), display_path: "src-tauri".into(), is_dir: true },
            FileListItem { relative_path: ".git".into(), display_path: ".git".into(), is_dir: true },
            FileListItem { relative_path: "README.md".into(), display_path: "README.md".into(), is_dir: false },
        ];
        let cands = derive_root_dirs(&items);
        assert_eq!(cands.len(), 1);
        assert!(cands[0].content.contains("src"));
        assert!(cands[0].content.contains("src-tauri"));
        assert!(!cands[0].content.contains(".git"), "hidden dirs excluded");
    }

    #[test]
    fn detects_cargo_workspace() {
        let body = "## Cargo.toml\n```\n[workspace]\nmembers = [\"crates/x\"]\n```\n";
        let cands = derive_from_passport(&passport(body), &[]);
        assert!(cands.iter().any(|c| c.section == SECTION_MAP && c.content.contains("Cargo workspace")));
    }
}
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cargo test --manifest-path src-tauri/Cargo.toml --no-default-features --lib project_instructions::derive`
Expected: 编译失败 —— `derive.rs` 尚未在 `mod.rs` 中声明（若已声明则为断言失败）

- [ ] **Step 3: 确认 `mod.rs` 已声明 `pub mod derive;`**

`src-tauri/src/project_instructions/mod.rs` 应为：

```rust
//! 项目说明书（Project Instructions）—— Batch A 后端闭环。
//!
//! 依赖单向：apply ← render ← decide ← {derive, signals} ← store
//! 读取一律走既有 project_context scope 路径；写入必须经用户显式确认。

pub mod apply;
pub mod decide;
pub mod derive;
pub mod model;
pub mod render;
pub mod signals;
pub mod store;
pub mod targets;
```

本任务只覆盖 `derive.rs`。其余 5 个占位文件（`apply.rs` / `decide.rs` / `render.rs` / `signals.rs` / `targets.rs`）保持 Task 1 建的那一行内容不动，直到各自任务覆盖：

```rust
// placeholder — implemented in a later task of Batch A
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cargo test --manifest-path src-tauri/Cargo.toml --no-default-features --lib project_instructions::derive`
Expected: PASS —— 7 个测试全绿

- [ ] **Step 5: 提交**

```bash
git add src-tauri/src/project_instructions/
git commit -m "feat(project-instructions): deterministic derivation from passport"
```

---

### Task 3: 统计信号 —— cwd 频次 → 热点目录候选

**Files:**
- Create: `src-tauri/src/project_instructions/signals.rs`

**Interfaces:**
- Consumes: `super::model::{KIND_SIGNAL, SECTION_MAP}`
- Produces:
  - `pub fn hot_dir_candidates(project_id: &str, log_paths: &[std::path::PathBuf]) -> Vec<DerivedCandidate>`
  - 复用 `super::derive::DerivedCandidate`

- [ ] **Step 1: 写失败测试**

创建 `src-tauri/src/project_instructions/signals.rs`：

```rust
//! 统计信号：从 hook 探针日志的 cwd 频次推导「热点目录」候选。
//!
//! 边界（spec §4.1）：零采集放宽下，统计只能可靠回答「在哪儿干活」。
//! 因此本模块**只**产出热点目录，不产出权限摩擦 / 工具画像 / 失败原因条目。
//!
//! 过滤：探针日志里**没有** project_id，只有 cwd。因此按「cwd 位于项目根之下」过滤，
//! 否则会把别的项目的目录混进来。

use std::collections::HashMap;
use std::path::{Path, PathBuf};

use super::derive::DerivedCandidate;
use super::model::{KIND_SIGNAL, SECTION_MAP};

const MAX_HOT_DIRS: usize = 5;

/// 归一化路径：小写 + 正斜杠 + 去尾斜杠（Windows 路径大小写不敏感）。
fn normalize(p: &Path) -> String {
    p.to_string_lossy().replace('\\', "/").trim_end_matches('/').to_ascii_lowercase()
}

/// 取 cwd 相对项目根的第一层目录名。
///
/// - `rel` 为空 → cwd 就是项目根本身 → None
/// - `rel` 只有一段（如 `src`）→ 该段就是第一层目录 → Some
/// - 隐藏目录 / `node_modules` / `target` → None
fn first_level_rel(project_root: &Path, cwd: &str) -> Option<String> {
    let root = normalize(project_root);
    let c = normalize(Path::new(cwd));
    if !c.starts_with(&root) {
        return None; // 不在本项目下
    }
    let rel = c[root.len()..].trim_start_matches('/');
    if rel.is_empty() {
        return None;
    }
    let first = rel.split('/').next()?.to_string();
    if first.is_empty() || first.starts_with('.') || first == "node_modules" || first == "target" {
        return None;
    }
    Some(first)
}

/// 从 probe jsonl 行中取 cwd。行格式由探针脚本决定，这里只认最小集合：
/// `{"cwd": "..."}` 或 `{"normalized": {"cwd": "..."}}`
fn cwd_from_line(line: &str) -> Option<String> {
    let v: serde_json::Value = serde_json::from_str(line).ok()?;
    if let Some(c) = v.get("cwd").and_then(|x| x.as_str()) {
        return Some(c.to_string());
    }
    v.get("normalized")
        .and_then(|n| n.get("cwd"))
        .and_then(|x| x.as_str())
        .map(|s| s.to_string())
}

pub fn hot_dir_candidates(
    project_root: &Path,
    log_paths: &[PathBuf],
) -> Vec<DerivedCandidate> {
    let mut counts: HashMap<String, usize> = HashMap::new();
    for p in log_paths {
        let Ok(text) = std::fs::read_to_string(p) else {
            continue;
        };
        for line in text.lines() {
            let Some(cwd) = cwd_from_line(line) else {
                continue;
            };
            let Some(dir) = first_level_rel(project_root, &cwd) else {
                continue;
            };
            *counts.entry(dir).or_insert(0) += 1;
        }
    }
    if counts.is_empty() {
        return Vec::new();
    }
    let mut pairs: Vec<(String, usize)> = counts.into_iter().collect();
    pairs.sort_by(|a, b| b.1.cmp(&a.1).then(a.0.cmp(&b.0)));
    pairs.truncate(MAX_HOT_DIRS);
    pairs
        .into_iter()
        .map(|(dir, n)| DerivedCandidate {
            section: SECTION_MAP,
            content: format!("`{dir}/` — {n} 次会话记录在此目录活动"),
            confidence: 0.3,
            evidence: serde_json::json!({
                "source": "hook_probe_cwd",
                "dir": dir,
                "hits": n,
            }),
        })
        .collect()
}

/// 探针日志的默认位置（与探针脚本 `pad_status/log.rs::default_log_path` 一致：
/// 以进程 cwd 为基准的 `logs/`）。
pub fn default_probe_logs() -> Vec<PathBuf> {
    let cwd = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));
    vec![
        cwd.join("logs").join("claude-hook-probe.jsonl"),
        cwd.join("logs").join("pad-status.jsonl"),
    ]
}

#[cfg(test)]
mod tests {
    use super::*;

    fn root() -> PathBuf {
        PathBuf::from("E:/voice-pilot")
    }

    #[test]
    fn first_level_ignores_root_and_noise() {
        assert_eq!(first_level_rel(&root(), "E:/voice-pilot"), None);
        assert_eq!(first_level_rel(&root(), "E:/voice-pilot/src"), Some("src".into()));
        assert_eq!(
            first_level_rel(&root(), "E:\\voice-pilot\\src-tauri\\src"),
            Some("src-tauri".into())
        );
        assert_eq!(first_level_rel(&root(), "E:/voice-pilot/.git"), None);
        assert_eq!(first_level_rel(&root(), "E:/voice-pilot/node_modules/x"), None);
        assert_eq!(first_level_rel(&root(), "E:/voice-pilot/target"), None);
    }

    #[test]
    fn excludes_cwds_outside_project() {
        assert_eq!(first_level_rel(&root(), "E:/other-project/src"), None);
    }

    #[test]
    fn is_case_insensitive_on_windows_paths() {
        assert_eq!(first_level_rel(&root(), "e:/VOICE-PILOT/src"), Some("src".into()));
    }

    #[test]
    fn reads_cwd_from_both_line_shapes() {
        assert_eq!(cwd_from_line("{\"cwd\":\"a/b\"}").as_deref(), Some("a/b"));
        assert_eq!(
            cwd_from_line("{\"normalized\":{\"cwd\":\"c/d\"}}").as_deref(),
            Some("c/d")
        );
        assert_eq!(cwd_from_line("not json"), None);
    }

    #[test]
    fn counts_hot_dirs_within_project_only() {
        let dir = std::env::temp_dir().join(format!("onetone-sig-{}", std::process::id()));
        let _ = std::fs::create_dir_all(&dir);
        let log = dir.join("probe.jsonl");
        std::fs::write(
            &log,
            "{\"cwd\":\"E:/voice-pilot/src\"}\n\
             {\"cwd\":\"E:/voice-pilot/src\"}\n\
             {\"cwd\":\"E:/voice-pilot/src-tauri\"}\n\
             {\"cwd\":\"E:/voice-pilot/.git\"}\n\
             {\"cwd\":\"E:/other/src\"}\n",
        )
        .unwrap();
        let cands = hot_dir_candidates(&root(), &[log]);
        assert_eq!(cands.len(), 2, "other project must be excluded");
        assert!(cands[0].content.contains("src"));
        assert!(cands[0].content.contains("2"), "hit count must be included");
        assert!(!cands.iter().any(|c| c.content.contains(".git")));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn missing_log_yields_no_candidates() {
        let cands = hot_dir_candidates(&root(), &[PathBuf::from("/nope/none.jsonl")]);
        assert!(cands.is_empty());
    }
}
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cargo test --manifest-path src-tauri/Cargo.toml --no-default-features --lib project_instructions::signals`
Expected: 编译失败（模块未声明）或断言失败

- [ ] **Step 3: 运行测试确认通过**

Run: `cargo test --manifest-path src-tauri/Cargo.toml --no-default-features --lib project_instructions::signals`
Expected: PASS —— 6 个测试全绿

- [ ] **Step 4: 提交**

```bash
git add src-tauri/src/project_instructions/signals.rs
git commit -m "feat(project-instructions): hot-directory signal from probe cwd counts"
```

---

### Task 4: 候选决策与记忆写入 —— accept / reject / manual

**Files:**
- Create: `src-tauri/src/project_instructions/decide.rs`
- Modify: `src-tauri/tests/project_instructions_db.rs`（追加 decide 的测试）

**Interfaces:**
- Consumes: `crate::agent_memory::{upsert_memory, list_memories_by_type}`、`crate::project_instructions::store::{candidate_by_id, set_candidate_status}`、`super::model::*`
- Produces:
  - `pub fn accept_candidate(candidate_id: &str) -> Result<String, String>`（返回 `memory_id`）
  - `pub fn reject_candidate(candidate_id: &str) -> Result<(), String>`
  - `pub fn add_manual(project_id: &str, section: &str, content: &str) -> Result<String, String>`（返回 `memory_id`）
  - `pub fn mark_stale_candidates(project_id: &str, new_source_version: &str) -> Result<usize, String>`
  - `pub fn confirmed_instructions(project_id: &str) -> Result<Vec<MemoryRecordDto>, String>`
  - `pub struct InstructionSource { pub section: String, pub origin_kind: String }`
  - `pub fn instruction_source_for(project_id: &str, memory_id: &str, source_event_id: Option<&str>) -> Option<InstructionSource>`

- [ ] **Step 1: 写失败测试**

decide 的测试同样放进集成测试二进制 `src-tauri/tests/project_instructions_db.rs`（**追加**到 Task 1 建的那个文件里，复用它的 `lock_db()` / `cand()`）：

```rust
// ---- 追加到 src-tauri/tests/project_instructions_db.rs ----

use onetone::project_instructions::decide::{
    accept_candidate, add_manual, confirmed_instructions, instruction_source_for,
    mark_stale_candidates, reject_candidate,
};
// 只补 Task 1 那个 `use` 里没有的三个名字 —— 同一个文件里重复 import 同名会报 E0252。
use onetone::project_instructions::model::{KIND_MANUAL, MEMORY_TYPE_INSTRUCTION, SECTION_GOTCHAS};

fn seed_candidate(project: &str, content: &str, evidence: &str) -> Candidate {
    let now = now_ms();
    Candidate {
        candidate_id: candidate_id_for(project, KIND_DERIVED, SECTION_GOTCHAS, content),
        project_id: project.into(),
        kind: KIND_DERIVED.into(),
        section: SECTION_GOTCHAS.into(),
        proposed_content: content.into(),
        evidence_json: Some(evidence.into()),
        confidence: 0.8,
        status: STATUS_PENDING.into(),
        accepted_memory_id: None,
        created_at_ms: now,
        updated_at_ms: now,
    }
}

#[test]
fn accept_writes_instruction_memory() {
    let _g = lock_db();
    let c = seed_candidate("acc-1", "worker.rs 写锁是进程内的", "{\"sourceVersion\":\"v1\"}");
    upsert_candidate(&c).unwrap();
    let mid = accept_candidate(&c.candidate_id).unwrap();
    assert!(!mid.is_empty());
    let found = confirmed_instructions("acc-1").unwrap();
    assert_eq!(found.len(), 1);
    assert_eq!(found[0].content, "worker.rs 写锁是进程内的");
    assert_eq!(found[0].memory_type, MEMORY_TYPE_INSTRUCTION);
}

#[test]
fn accept_is_idempotent() {
    let _g = lock_db();
    let c = seed_candidate("acc-2", "同一条", "{\"sourceVersion\":\"v1\"}");
    upsert_candidate(&c).unwrap();
    let a = accept_candidate(&c.candidate_id).unwrap();
    let b = accept_candidate(&c.candidate_id).unwrap();
    assert_eq!(a, b);
    assert_eq!(confirmed_instructions("acc-2").unwrap().len(), 1);
}

#[test]
fn reject_does_not_write_memory() {
    let _g = lock_db();
    let c = seed_candidate("rej-1", "不要的", "{\"sourceVersion\":\"v1\"}");
    upsert_candidate(&c).unwrap();
    reject_candidate(&c.candidate_id).unwrap();
    assert!(confirmed_instructions("rej-1").unwrap().is_empty());
}

#[test]
fn manual_entry_is_queryable() {
    let _g = lock_db();
    let mid = add_manual("man-1", SECTION_GOTCHAS, "用 pnpm 不用 npm").unwrap();
    assert!(!mid.is_empty());
    let found = confirmed_instructions("man-1").unwrap();
    assert_eq!(found.len(), 1);
    assert!(found[0].user_authored);
}

#[test]
fn manual_rejects_bad_section() {
    let _g = lock_db();
    assert!(add_manual("man-2", "nope", "x").is_err());
}

#[test]
fn drift_marks_derived_stale_without_rewriting() {
    let _g = lock_db();
    let c = seed_candidate("drift-1", "会过时的一条", "{\"sourceVersion\":\"v1\"}");
    upsert_candidate(&c).unwrap();
    accept_candidate(&c.candidate_id).unwrap();
    let n = mark_stale_candidates("drift-1", "v2").unwrap();
    assert_eq!(n, 1);
    let found = confirmed_instructions("drift-1").unwrap();
    assert_eq!(found.len(), 1, "memory must not be deleted");
    assert_eq!(found[0].content, "会过时的一条", "content must not be rewritten");
}

#[test]
fn instruction_source_lookup_uses_candidate_section() {
    let _g = lock_db();
    let c = seed_candidate("src-1", "worker.rs 写锁是进程内的", "{\"sourceVersion\":\"v1\"}");
    upsert_candidate(&c).unwrap();
    accept_candidate(&c.candidate_id).unwrap();
    let rows = confirmed_instructions("src-1").unwrap();
    assert_eq!(rows.len(), 1);
    let src = instruction_source_for("src-1", &rows[0].memory_id, rows[0].source_event_id.as_deref())
        .expect("source must resolve from the accepted candidate");
    assert_eq!(src.section, SECTION_GOTCHAS);
    assert_eq!(src.origin_kind, KIND_DERIVED);
}

#[test]
fn instruction_source_lookup_finds_manual_by_memory_id() {
    let _g = lock_db();
    let mid = add_manual("src-2", SECTION_COMMANDS, "cargo test --no-default-features").unwrap();
    // 人工录入的 memory 没有 source_event_id，只能靠 accepted_memory_id 反查。
    let rows = confirmed_instructions("src-2").unwrap();
    assert_eq!(rows.len(), 1);
    assert!(rows[0].source_event_id.is_none());
    let src = instruction_source_for("src-2", &mid, None).expect("manual source must resolve");
    assert_eq!(src.section, SECTION_COMMANDS);
    assert_eq!(src.origin_kind, KIND_MANUAL);
}

/// 说明书条目不能被项目的普通记忆挤掉 —— 这条是回归护栏。
#[test]
fn instructions_survive_ordinary_memories() {
    let _g = lock_db();
    let c = seed_candidate("bulk-1", "真正的说明书条目", "{\"sourceVersion\":\"v1\"}");
    upsert_candidate(&c).unwrap();
    accept_candidate(&c.candidate_id).unwrap();
    // 灌 60 条普通记忆（超过 list_recent_memory 的 50 条上限）。
    for i in 0..60 {
        onetone::agent_memory::upsert_memory(
            "bulk-1",
            None,
            "observation",
            &format!("普通记忆 {i}"),
            None,
            Some(0.5),
            None,
            true,
        )
        .unwrap();
    }
    let found = confirmed_instructions("bulk-1").unwrap();
    assert_eq!(found.len(), 1, "instruction row must not be crowded out");
}
```

然后创建 `src-tauri/src/project_instructions/decide.rs`：

```rust
//! 候选决策：接受 → 写入 memory_records；拒绝 → 仅改状态；人工录入 → 直接写入。

use crate::agent_memory::{list_memories_by_type, upsert_memory, MemoryRecordDto};

use super::model::{
    Candidate, KIND_MANUAL, MEMORY_TYPE_INSTRUCTION, STATUS_ACCEPTED, STATUS_REJECTED, STATUS_STALE,
    ALL_SECTIONS,
};
use super::store::{candidate_by_id, list_candidates, set_candidate_status, upsert_candidate};

/// 条目在说明书里的归属信息。
///
/// **section 不能只存在候选表里** —— 人工录入的 memory 正文是干净的（没有 `[section]` 前缀），
/// 渲染时必须能从 memory 行反查回它的段落。因此这里提供唯一反查入口：
/// 1. 先按 `source_event_id`（被接受的候选 id）查；
/// 2. 查不到再按 `accepted_memory_id` 扫一遍（人工录入路径没有 `source_event_id`）。
#[derive(Debug, Clone)]
pub struct InstructionSource {
    pub section: String,
    pub origin_kind: String,
}

pub fn instruction_source_for(
    project_id: &str,
    memory_id: &str,
    source_event_id: Option<&str>,
) -> Option<InstructionSource> {
    if let Some(sid) = source_event_id.filter(|s| !s.is_empty()) {
        if let Ok(Some(c)) = candidate_by_id(sid) {
            return Some(InstructionSource {
                section: c.section,
                origin_kind: c.kind,
            });
        }
    }
    let all = list_candidates(project_id, None).ok()?;
    let c = all
        .into_iter()
        .find(|c| c.accepted_memory_id.as_deref() == Some(memory_id))?;
    Some(InstructionSource {
        section: c.section,
        origin_kind: c.kind,
    })
}

fn valid_section(section: &str) -> bool {
    ALL_SECTIONS.contains(&section)
}

/// 接受候选 → 写入 memory_records（type=instruction，source_event_id=candidate_id）。
pub fn accept_candidate(candidate_id: &str) -> Result<String, String> {
    let cand = candidate_by_id(candidate_id)?
        .ok_or_else(|| format!("candidate_not_found: {candidate_id}"))?;
    let memory = upsert_memory(
        &cand.project_id,
        None,
        MEMORY_TYPE_INSTRUCTION,
        &cand.proposed_content,
        Some(&cand.candidate_id),
        Some(cand.confidence),
        None,
        false,
    )?;
    set_candidate_status(candidate_id, STATUS_ACCEPTED, Some(&memory.memory_id))?;
    Ok(memory.memory_id)
}

pub fn reject_candidate(candidate_id: &str) -> Result<(), String> {
    let cand = candidate_by_id(candidate_id)?
        .ok_or_else(|| format!("candidate_not_found: {candidate_id}"))?;
    set_candidate_status(&cand.candidate_id, STATUS_REJECTED, None)
}

/// 人工录入：直接写 memory_records（user_authored=true，无需 source_event_id）。
/// 同内容重复录入时 memory_id 相同 → 天然幂等。
pub fn add_manual(project_id: &str, section: &str, content: &str) -> Result<String, String> {
    if !valid_section(section) {
        return Err(format!("invalid section: {section}"));
    }
    let body = content.trim();
    if body.is_empty() {
        return Err("content empty".into());
    }
    let memory = upsert_memory(
        project_id,
        None,
        MEMORY_TYPE_INSTRUCTION,
        body,
        None,
        Some(0.9),
        None,
        true,
    )?;
    // 记一条 accepted 的 manual 候选用于追溯；内容相同则复用同一行。
    let now = crate::agent_memory::now_ms();
    upsert_candidate(&Candidate {
        candidate_id: super::store::candidate_id_for(project_id, KIND_MANUAL, section, body),
        project_id: project_id.into(),
        kind: KIND_MANUAL.into(),
        section: section.into(),
        proposed_content: body.into(),
        evidence_json: Some("{\"source\":\"manual\"}".into()),
        confidence: 0.9,
        status: STATUS_ACCEPTED.into(),
        accepted_memory_id: Some(memory.memory_id.clone()),
        created_at_ms: now,
        updated_at_ms: now,
    })?;
    Ok(memory.memory_id)
}

/// 漂移检测：derived 候选的 evidence 里存了当时的 source_version。
/// passport 的 source_version 变了 → 旧的 derived 条目标记 stale（**不改写正文**）。
pub fn mark_stale_candidates(project_id: &str, new_source_version: &str) -> Result<usize, String> {
    let cands = list_candidates(project_id, None)?;
    let mut marked = 0usize;
    for c in cands {
        if c.kind != super::model::KIND_DERIVED || c.status != STATUS_ACCEPTED {
            continue;
        }
        let Some(ev) = c.evidence_json.as_deref() else {
            continue;
        };
        let Ok(v) = serde_json::from_str::<serde_json::Value>(ev) else {
            continue;
        };
        let Some(old) = v.get("sourceVersion").and_then(|x| x.as_str()) else {
            continue;
        };
        if old != new_source_version {
            set_candidate_status(&c.candidate_id, STATUS_STALE, None)?;
            marked += 1;
        }
    }
    Ok(marked)
}

/// 列出某项目已确认的说明书条目（memory_records 里 type=instruction 的）。
///
/// **必须用 `list_memories_by_type`，不能用 `query_memory(project_id, "", 50)`**：
/// 空 query 会退化成 `list_recent_memory` —— 最近 50 条**所有类型**的记忆。
/// 项目里普通记忆一多，说明书条目就会被挤出窗口、被**静默丢弃**（规则少一条）。
pub fn confirmed_instructions(project_id: &str) -> Result<Vec<MemoryRecordDto>, String> {
    list_memories_by_type(project_id, MEMORY_TYPE_INSTRUCTION, 200)
}


> 本文件**不带** `#[cfg(test)] mod tests` —— decide 的测试在
> `src-tauri/tests/project_instructions_db.rs`（理由见 Task 1 Step 6）。
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cargo test --manifest-path src-tauri/Cargo.toml --no-default-features --test project_instructions_db`
Expected: 编译失败（`onetone::project_instructions::decide` 尚未存在）

- [ ] **Step 3: 运行测试确认通过**

Run: `cargo test --manifest-path src-tauri/Cargo.toml --no-default-features --test project_instructions_db`
Expected: PASS —— 12 个测试全绿（Task 1 的 3 个 store + 本任务追加的 9 个 decide）

- [ ] **Step 4: 提交**

```bash
git add src-tauri/src/project_instructions/decide.rs src-tauri/tests/project_instructions_db.rs
git commit -m "feat(project-instructions): candidate accept/reject/manual + drift marking"
```

---

### Task 5: IR 构建与渲染器

**Files:**
- Create: `src-tauri/src/project_instructions/render.rs`
- Create: `src-tauri/src/project_instructions/targets.rs`

**Interfaces:**
- Consumes: `super::decide::{confirmed_instructions, instruction_source_for}`、`super::model::{InstructionItem, InstructionSection, ProjectInstructionDoc, ALL_SECTIONS, ...}`
- Produces:
  - `pub fn build_doc(project_id: &str) -> Result<ProjectInstructionDoc, String>`
  - `pub fn render_doc(doc: &ProjectInstructionDoc) -> String`（AGENTS.md 正文）
  - `targets::TARGETS: &[TargetDef]`
  - `targets::TargetDef { id: &'static str, label: &'static str, relative_path: &'static str, kind: &'static str }`
  - `pub fn render_target(doc: &ProjectInstructionDoc, target: &TargetDef) -> String`

- [ ] **Step 1: 写失败测试**

创建 `src-tauri/src/project_instructions/targets.rs`：

```rust
//! 输出目标定义。渲染器是 IR → 格式的纯函数；加一个目标 = 加一条定义。

#[derive(Debug, Clone, Copy, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TargetDef {
    pub id: &'static str,
    pub label: &'static str,
    pub relative_path: &'static str,
    /// "agents_md" | "cursor_mdc"
    pub kind: &'static str,
}

pub const TARGET_AGENTS_MD: &str = "agents_md";
pub const TARGET_CURSOR_MDC: &str = "cursor_mdc";

/// v1 只有两个目标：公共主文件 + Cursor 薄适配。
/// CLAUDE.md / GEMINI.md 是可选目标——Claude Code 2.1.277+ 在没有 CLAUDE.md 时
/// 原生读 AGENTS.md；只有存在「该 Agent 专属段」时才需要建（v1 不做）。
pub const TARGETS: &[TargetDef] = &[
    TargetDef {
        id: TARGET_AGENTS_MD,
        label: "AGENTS.md（公共主文件）",
        relative_path: "AGENTS.md",
        kind: TARGET_AGENTS_MD,
    },
    TargetDef {
        id: TARGET_CURSOR_MDC,
        label: "Cursor 规则",
        relative_path: ".cursor/rules/onetone-project.mdc",
        kind: TARGET_CURSOR_MDC,
    },
];
```

创建 `src-tauri/src/project_instructions/render.rs`：

```rust
//! IR 构建与渲染。渲染器只认 IR，不认存储细节。

use super::decide::{confirmed_instructions, instruction_source_for, InstructionSource};
use super::model::{
    InstructionItem, InstructionSection, ProjectInstructionDoc, KIND_MANUAL, SECTION_BOUNDARIES,
    SECTION_COMMANDS, SECTION_GOTCHAS, SECTION_INVARIANTS, SECTION_MAP, SECTION_OVERVIEW,
};
use super::targets::{TargetDef, TARGET_AGENTS_MD, TARGET_CURSOR_MDC};

const SECTION_TITLES: &[(&str, &str)] = &[
    (SECTION_OVERVIEW, "技术栈与一句话简介"),
    (SECTION_COMMANDS, "命令"),
    (SECTION_MAP, "目录地图"),
    (SECTION_INVARIANTS, "硬性约束"),
    (SECTION_BOUNDARIES, "边界"),
    (SECTION_GOTCHAS, "已知坑位"),
];

fn title_for(key: &str) -> String {
    SECTION_TITLES
        .iter()
        .find(|(k, _)| *k == key)
        .map(|(_, t)| (*t).to_string())
        .unwrap_or_else(|| key.to_string())
}

/// 条目的段落归属**不在正文里** —— 正文是干净的（人工录入没有任何前缀）。
/// 归属是候选表的属性，所以渲染必须走 `decide::instruction_source_for` 反查：
/// 先按 `source_event_id`（被接受的候选 id）找，再按 `accepted_memory_id` 兜底。
/// 反查不到时归入「已知坑位」并标记 manual —— 绝不因为找不到归属就丢弃条目。
fn section_and_origin(source: Option<&InstructionSource>) -> (String, String) {
    match source {
        Some(s) => (s.section.clone(), s.origin_kind.clone()),
        None => (SECTION_GOTCHAS.to_string(), KIND_MANUAL.to_string()),
    }
}

pub fn build_doc(project_id: &str) -> Result<ProjectInstructionDoc, String> {
    let rows = confirmed_instructions(project_id)?;
    let mut sections: Vec<InstructionSection> = SECTION_TITLES
        .iter()
        .map(|(k, _)| InstructionSection {
            key: (*k).to_string(),
            title: title_for(k),
            items: Vec::new(),
        })
        .collect();

    for row in rows {
        let source = instruction_source_for(
            project_id,
            &row.memory_id,
            row.source_event_id.as_deref(),
        );
        let (key, origin_kind) = section_and_origin(source.as_ref());
        let item = InstructionItem {
            text: row.content.trim().to_string(),
            origin_kind,
            memory_id: row.memory_id,
            confidence: row.confidence,
        };
        if let Some(s) = sections.iter_mut().find(|s| s.key == key) {
            s.items.push(item);
        } else {
            sections.push(InstructionSection {
                key: key.clone(),
                title: title_for(&key),
                items: vec![item],
            });
        }
    }

    Ok(ProjectInstructionDoc {
        project_id: project_id.to_string(),
        generated_at_ms: crate::agent_memory::now_ms(),
        sections: sections.into_iter().filter(|s| !s.items.is_empty()).collect(),
    })
}

pub fn render_doc(doc: &ProjectInstructionDoc) -> String {
    let mut out = String::new();
    out.push_str("# 项目约定\n");
    for section in &doc.sections {
        out.push_str("\n## ");
        out.push_str(&section.title);
        out.push('\n');
        for item in &section.items {
            out.push_str("- ");
            out.push_str(&item.text);
            out.push('\n');
        }
    }
    out
}

pub fn render_target(doc: &ProjectInstructionDoc, target: &TargetDef) -> String {
    match target.kind {
        TARGET_AGENTS_MD => render_doc(doc),
        TARGET_CURSOR_MDC => {
            let mut out = String::new();
            out.push_str("---\n");
            out.push_str("description: OneTone 生成的项目公共规则与坑位\n");
            out.push_str("alwaysApply: false\n");
            out.push_str("---\n\n");
            out.push_str("公共规则见 @AGENTS.md\n");
            out
        }
        _ => render_doc(doc),
    }
}
```

在 `render.rs` 末尾追加测试：

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use crate::project_instructions::model::{KIND_DERIVED, KIND_MANUAL, SECTION_COMMANDS, SECTION_GOTCHAS};

    fn item(text: &str) -> InstructionItem {
        InstructionItem {
            text: text.to_string(),
            origin_kind: KIND_MANUAL.to_string(),
            memory_id: "m1".into(),
            confidence: 0.9,
        }
    }

    #[test]
    fn section_comes_from_candidate_lookup_not_content_prefix() {
        // 反查命中 → 用候选表给的段落与来源类型。
        let src = InstructionSource {
            section: SECTION_COMMANDS.to_string(),
            origin_kind: KIND_DERIVED.to_string(),
        };
        assert_eq!(
            section_and_origin(Some(&src)),
            (SECTION_COMMANDS.to_string(), KIND_DERIVED.to_string())
        );
        // 反查落空 → 归入 gotchas 且标记 manual，条目不丢。
        assert_eq!(
            section_and_origin(None),
            (SECTION_GOTCHAS.to_string(), KIND_MANUAL.to_string())
        );
    }

    #[test]
    fn renders_sections_and_items() {
        let doc = ProjectInstructionDoc {
            project_id: "p".into(),
            generated_at_ms: 0,
            sections: vec![
                InstructionSection {
                    key: SECTION_COMMANDS.into(),
                    title: "命令".into(),
                    items: vec![item("`dev` — vite")],
                },
                InstructionSection {
                    key: SECTION_GOTCHAS.into(),
                    title: "已知坑位".into(),
                    items: vec![item("worker.rs 双写")],
                },
            ],
        };
        let out = render_doc(&doc);
        assert!(out.contains("## 命令"));
        assert!(out.contains("- `dev` — vite"));
        assert!(out.contains("## 已知坑位"));
        assert!(out.contains("- worker.rs 双写"));
    }

    #[test]
    fn cursor_target_references_agents_md_instead_of_copying() {
        let doc = ProjectInstructionDoc {
            project_id: "p".into(),
            generated_at_ms: 0,
            sections: vec![InstructionSection {
                key: SECTION_COMMANDS.into(),
                title: "命令".into(),
                items: vec![item("`dev` — vite")],
            }],
        };
        let target = super::super::targets::TARGETS
            .iter()
            .find(|t| t.kind == TARGET_CURSOR_MDC)
            .unwrap();
        let out = render_target(&doc, target);
        assert!(out.contains("alwaysApply: false"));
        assert!(out.contains("@AGENTS.md"));
        assert!(!out.contains("vite"), "must not duplicate the body");
    }
}
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cargo test --manifest-path src-tauri/Cargo.toml --no-default-features --lib project_instructions::render`
Expected: 编译失败或断言失败

- [ ] **Step 3: 运行测试确认通过**

Run: `cargo test --manifest-path src-tauri/Cargo.toml --no-default-features --lib project_instructions::render`
Expected: PASS —— 3 个测试全绿

- [ ] **Step 4: 提交**

```bash
git add src-tauri/src/project_instructions/render.rs src-tauri/src/project_instructions/targets.rs
git commit -m "feat(project-instructions): IR builder and target renderers"
```

---

### Task 6: 受管区块写入与撤回

**Files:**
- Create: `src-tauri/src/project_instructions/apply.rs`

**Interfaces:**
- Consumes: `super::targets::TargetDef`
- Produces:
  - `pub const BLOCK_BEGIN: &str = "<!-- onetone:instructions:begin -->"`
  - `pub const BLOCK_END: &str = "<!-- onetone:instructions:end -->"`
  - `pub enum ApplyCode { Ok, NeedsDecision, CorruptBlock, Conflict }`（序列化后为 `ok` / `needs_decision` / `corrupt_block` / `conflict`）
  - `pub struct ApplyOutcome { pub code: ApplyCode, pub message: String, pub path_label: String, pub wrote: bool }`
  - `pub fn plan_write(root: &Path, target: &TargetDef, body: &str) -> Result<ApplyOutcome, String>`
  - `pub fn write_block(root: &Path, target: &TargetDef, body: &str, consent_insert_into_existing: bool) -> Result<ApplyOutcome, String>`
  - `pub fn revert_block(root: &Path, target: &TargetDef) -> Result<ApplyOutcome, String>`

- [ ] **Step 1: 写失败测试**

创建 `src-tauri/src/project_instructions/apply.rs`：

```rust
//! 受管区块写入 / 撤回。
//!
//! 红线：**绝不整体覆盖用户文件**。区块外的内容必须逐字节不变。

use std::fs;
use std::path::{Path, PathBuf};

use super::targets::TargetDef;

pub const BLOCK_BEGIN: &str = "<!-- onetone:instructions:begin -->";
pub const BLOCK_END: &str = "<!-- onetone:instructions:end -->";

#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ApplyCode {
    Ok,
    NeedsDecision,
    CorruptBlock,
    Conflict,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ApplyOutcome {
    pub code: ApplyCode,
    pub message: String,
    pub path_label: String,
    pub wrote: bool,
}

/// 文件里受管区块的字节区间（若存在）。
fn find_block(text: &str) -> Option<(usize, usize)> {
    let begin = text.find(BLOCK_BEGIN)?;
    let after = begin + BLOCK_BEGIN.len();
    let end = text[after..].find(BLOCK_END)? + after + BLOCK_END.len();
    Some((begin, end))
}

fn block_body(text: &str) -> Option<String> {
    let (b, e) = find_block(text)?;
    let inner = &text[b + BLOCK_BEGIN.len()..e - BLOCK_END.len()];
    Some(inner.trim().to_string())
}

/// 组装最终文件内容：保留区块外原文，把区块内容换成新 body。
fn splice(text: &str, body: &str) -> Option<String> {
    let (b, e) = find_block(text)?;
    let mut out = String::with_capacity(text.len() + body.len());
    out.push_str(&text[..b]);
    out.push_str(BLOCK_BEGIN);
    out.push('\n');
    out.push_str(body.trim_end());
    out.push('\n');
    out.push_str(BLOCK_END);
    out.push_str(&text[e..]);
    Some(out)
}

fn target_path(root: &Path, target: &TargetDef) -> PathBuf {
    let mut p = root.to_path_buf();
    for seg in target.relative_path.split('/') {
        p.push(seg);
    }
    p
}

/// 只读评估：返回将要发生什么，不写盘。
pub fn plan_write(root: &Path, target: &TargetDef, body: &str) -> Result<ApplyOutcome, String> {
    let path = target_path(root, target);
    let label = target.relative_path.to_string();
    if !path.exists() {
        return Ok(ApplyOutcome {
            code: ApplyCode::Ok,
            message: "目标文件不存在，将新建并只写入受管区块".into(),
            path_label: label,
            wrote: false,
        });
    }
    let text = fs::read_to_string(&path).map_err(|e| format!("read target: {e}"))?;
    let begins = text.matches(BLOCK_BEGIN).count();
    let ends = text.matches(BLOCK_END).count();
    if begins > 1 || ends > 1 || begins != ends {
        return Ok(ApplyOutcome {
            code: ApplyCode::CorruptBlock,
            message: "检测到多个受管区块或区块标记不成对，拒绝写入".into(),
            path_label: label,
            wrote: false,
        });
    }
    if begins == 0 {
        return Ok(ApplyOutcome {
            code: ApplyCode::NeedsDecision,
            message: "目标文件已有内容且没有受管区块，需用户明确同意后才能插入".into(),
            path_label: label,
            wrote: false,
        });
    }
    let existing = block_body(&text).unwrap_or_default();
    if existing == body.trim() {
        return Ok(ApplyOutcome {
            code: ApplyCode::Ok,
            message: "受管区块内容已是最新，未写盘".into(),
            path_label: label,
            wrote: false,
        });
    }
    Ok(ApplyOutcome {
        code: ApplyCode::Ok,
        message: "将替换受管区块内容，区块外内容保持不变".into(),
        path_label: label,
        wrote: false,
    })
}

/// 写入受管区块。必须先经过 plan_write + 用户显式确认。
pub fn write_block(
    root: &Path,
    target: &TargetDef,
    body: &str,
    consent_insert_into_existing: bool,
) -> Result<ApplyOutcome, String> {
    let path = target_path(root, target);
    let label = target.relative_path.to_string();

    let existing = if path.exists() {
        Some(fs::read_to_string(&path).map_err(|e| format!("read target: {e}"))?)
    } else {
        None
    };

    let final_text = match existing.as_deref() {
        None => format!("{BLOCK_BEGIN}\n{}\n{BLOCK_END}\n", body.trim_end()),
        Some(text) => {
            let begins = text.matches(BLOCK_BEGIN).count();
            let ends = text.matches(BLOCK_END).count();
            if begins > 1 || ends > 1 || begins != ends {
                return Ok(ApplyOutcome {
                    code: ApplyCode::CorruptBlock,
                    message: "检测到多个受管区块或区块标记不成对，拒绝写入".into(),
                    path_label: label,
                    wrote: false,
                });
            }
            if begins == 0 {
                if !consent_insert_into_existing {
                    return Ok(ApplyOutcome {
                        code: ApplyCode::NeedsDecision,
                        message: "目标文件已有内容且没有受管区块，需用户明确同意后才能插入".into(),
                        path_label: label,
                        wrote: false,
                    });
                }
                // 追加在文件末尾；用户原文一字不动。
                let mut out = text.to_string();
                if !out.ends_with('\n') {
                    out.push('\n');
                }
                out.push('\n');
                out.push_str(BLOCK_BEGIN);
                out.push('\n');
                out.push_str(body.trim_end());
                out.push('\n');
                out.push_str(BLOCK_END);
                out.push('\n');
                out
            } else {
                if block_body(text).unwrap_or_default() == body.trim() {
                    return Ok(ApplyOutcome {
                        code: ApplyCode::Ok,
                        message: "受管区块内容已是最新，未写盘".into(),
                        path_label: label,
                        wrote: false,
                    });
                }
                splice(text, body).ok_or_else(|| "splice failed".to_string())?
            }
        }
    };

    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("mkdir: {e}"))?;
    }
    // 原子写：临时文件 + rename。
    let tmp = path.with_extension("onetone-tmp");
    fs::write(&tmp, &final_text).map_err(|e| format!("write tmp: {e}"))?;
    fs::rename(&tmp, &path).map_err(|e| format!("rename: {e}"))?;

    Ok(ApplyOutcome {
        code: ApplyCode::Ok,
        message: "已写入受管区块".into(),
        path_label: label,
        wrote: true,
    })
}

/// 撤回：只删受管区块，不删文件。
pub fn revert_block(root: &Path, target: &TargetDef) -> Result<ApplyOutcome, String> {
    let path = target_path(root, target);
    let label = target.relative_path.to_string();
    if !path.exists() {
        return Ok(ApplyOutcome {
            code: ApplyCode::Ok,
            message: "目标文件不存在，无需撤回".into(),
            path_label: label,
            wrote: false,
        });
    }
    let text = fs::read_to_string(&path).map_err(|e| format!("read target: {e}"))?;
    let Some((b, e)) = find_block(&text) else {
        return Ok(ApplyOutcome {
            code: ApplyCode::Ok,
            message: "文件中没有受管区块，无需撤回".into(),
            path_label: label,
            wrote: false,
        });
    };
    let mut out = String::with_capacity(text.len());
    out.push_str(&text[..b]);
    out.push_str(&text[e..]);
    let cleaned = out.trim_end().to_string() + "\n";
    let tmp = path.with_extension("onetone-tmp");
    fs::write(&tmp, &cleaned).map_err(|e| format!("write tmp: {e}"))?;
    fs::rename(&tmp, &path).map_err(|e| format!("rename: {e}"))?;
    Ok(ApplyOutcome {
        code: ApplyCode::Ok,
        message: "已撤回受管区块（文件其余内容保持不变）".into(),
        path_label: label,
        wrote: true,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::project_instructions::targets::{TargetDef, TARGET_AGENTS_MD};

    fn target() -> TargetDef {
        TargetDef {
            id: TARGET_AGENTS_MD,
            label: "AGENTS.md",
            relative_path: "AGENTS.md",
            kind: TARGET_AGENTS_MD,
        }
    }

    fn tmpdir(tag: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!(
            "onetone-apply-{}-{}-{}",
            tag,
            std::process::id(),
            crate::agent_memory::now_ms()
        ));
        let _ = fs::create_dir_all(&d);
        d
    }

    #[test]
    fn creates_file_with_block_when_absent() {
        let d = tmpdir("create");
        let out = write_block(&d, &target(), "# body", false).unwrap();
        assert_eq!(out.code, ApplyCode::Ok);
        assert!(out.wrote);
        let text = fs::read_to_string(d.join("AGENTS.md")).unwrap();
        assert!(text.contains(BLOCK_BEGIN));
        assert!(text.contains("# body"));
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn preserves_user_content_outside_block_byte_for_byte() {
        let d = tmpdir("preserve");
        let original = "# 我的笔记\n\n保留我\n";
        fs::write(d.join("AGENTS.md"), original).unwrap();
        // 无 consent → 拒绝
        let out = write_block(&d, &target(), "# body", false).unwrap();
        assert_eq!(out.code, ApplyCode::NeedsDecision);
        assert_eq!(fs::read_to_string(d.join("AGENTS.md")).unwrap(), original);
        // 有 consent → 追加区块，原文不变
        let out = write_block(&d, &target(), "# body", true).unwrap();
        assert_eq!(out.code, ApplyCode::Ok);
        let text = fs::read_to_string(d.join("AGENTS.md")).unwrap();
        assert!(text.starts_with(original), "user content must stay at the top untouched");
        assert!(text.contains(BLOCK_BEGIN));
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn replaces_only_the_block_content() {
        let d = tmpdir("replace");
        let original = "KEEP-HEAD\n";
        fs::write(d.join("AGENTS.md"), format!("{original}{BLOCK_BEGIN}\nold\n{BLOCK_END}\nTAIL\n")).unwrap();
        write_block(&d, &target(), "new", false).unwrap();
        let text = fs::read_to_string(d.join("AGENTS.md")).unwrap();
        assert!(text.starts_with("KEEP-HEAD\n"));
        assert!(text.contains("TAIL"));
        assert!(text.contains("new"));
        assert!(!text.contains("old"));
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn refuses_when_multiple_blocks() {
        let d = tmpdir("corrupt");
        fs::write(
            d.join("AGENTS.md"),
            format!("{BLOCK_BEGIN}\na\n{BLOCK_END}\n{BLOCK_BEGIN}\nb\n{BLOCK_END}\n"),
        )
        .unwrap();
        let out = write_block(&d, &target(), "new", true).unwrap();
        assert_eq!(out.code, ApplyCode::CorruptBlock);
        assert!(!out.wrote);
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn idempotent_second_write_does_not_write() {
        let d = tmpdir("idem");
        write_block(&d, &target(), "same", false).unwrap();
        let before = fs::read_to_string(d.join("AGENTS.md")).unwrap();
        let out = write_block(&d, &target(), "same", false).unwrap();
        assert_eq!(out.code, ApplyCode::Ok);
        assert!(!out.wrote, "second identical write must be a no-op");
        assert_eq!(fs::read_to_string(d.join("AGENTS.md")).unwrap(), before);
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn revert_removes_block_only() {
        let d = tmpdir("revert");
        fs::write(d.join("AGENTS.md"), format!("KEEP\n{BLOCK_BEGIN}\nx\n{BLOCK_END}\nTAIL\n")).unwrap();
        let out = revert_block(&d, &target()).unwrap();
        assert_eq!(out.code, ApplyCode::Ok);
        assert!(out.wrote);
        let text = fs::read_to_string(d.join("AGENTS.md")).unwrap();
        assert!(text.contains("KEEP"));
        assert!(text.contains("TAIL"));
        assert!(!text.contains(BLOCK_BEGIN));
        let _ = fs::remove_dir_all(&d);
    }

    #[test]
    fn plan_reports_needs_decision_without_writing() {
        let d = tmpdir("plan");
        fs::write(d.join("AGENTS.md"), "user text\n").unwrap();
        let out = plan_write(&d, &target(), "body").unwrap();
        assert_eq!(out.code, ApplyCode::NeedsDecision);
        assert_eq!(fs::read_to_string(d.join("AGENTS.md")).unwrap(), "user text\n");
        let _ = fs::remove_dir_all(&d);
    }
}
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cargo test --manifest-path src-tauri/Cargo.toml --no-default-features --lib project_instructions::apply`
Expected: 编译失败或断言失败

- [ ] **Step 3: 运行测试确认通过**

Run: `cargo test --manifest-path src-tauri/Cargo.toml --no-default-features --lib project_instructions::apply`
Expected: PASS —— 7 个测试全绿

- [ ] **Step 4: 提交**

```bash
git add src-tauri/src/project_instructions/apply.rs
git commit -m "feat(project-instructions): managed-block write and revert"
```

---

### Task 7: IPC 命令层

**Files:**
- Create: `src-tauri/src/ipc/commands/shell/project_instructions_cmd.rs`
- Modify: `src-tauri/src/ipc/commands/shell/mod.rs`（`mod` + `pub use`）
- Modify: `src-tauri/src/lib.rs`（`invoke_handler` 注册）

**Interfaces:**
- Consumes: `crate::project_instructions::{derive, signals, decide, render, apply, store, targets}`
- Produces: 11 个 Tauri 命令（见下表）

| 命令 | 作用 | 是否动用户文件 |
| --- | --- | --- |
| `cmd_project_instructions_doc` | 取 IR（已确认条目）+ 目标清单 | 否 |
| `cmd_project_instructions_candidates` | 列候选（可按 status 过滤） | 否 |
| `cmd_project_instructions_candidate_decide` | accept / reject 单条候选（写库） | 否 |
| `cmd_project_instructions_add_manual` | 人工录入条目（写库） | 否 |
| `cmd_project_instructions_derive` | 触发推导：passport + 目录清单 + 探针统计（写库） | 否 |
| `cmd_project_instructions_render_preview` | 渲染目标文件预览 | 否 |
| `cmd_project_instructions_apply_preview` | 评估写入结果（不写盘） | 否 |
| `cmd_project_instructions_apply_confirm` | 显式确认后写受管区块 | **是** |
| `cmd_project_instructions_revert` | 撤回受管区块 | **是**（移除区块） |
| `cmd_project_instructions_confirmed` | 列已确认条目 | 否 |
| `cmd_project_instructions_meta` | 常量导出（sections / statuses / targets） | 否 |

- [ ] **Step 1: 写 IPC 命令文件**

创建 `src-tauri/src/ipc/commands/shell/project_instructions_cmd.rs`：

```rust
//! 项目说明书 IPC（Batch A）。
//!
//! 读路径复用既有 project_context scope（用户确认 + 有限读取）。
//! 写路径一律「预览 → 显式确认 → 写盘」两段式。

use serde::Deserialize;
use std::path::Path;

use tauri::Window;

use crate::project_context::contracts::{ContextQuery, QueryArgs, QueryPayload};
use crate::project_instructions::apply::{plan_write, revert_block, write_block, ApplyOutcome};
use crate::project_instructions::decide::{
    accept_candidate, add_manual, confirmed_instructions, mark_stale_candidates, reject_candidate,
};
use crate::project_instructions::derive::derive_from_passport;
use crate::project_instructions::model::{
    Candidate, ALL_SECTIONS, KIND_DERIVED, KIND_SIGNAL, STATUS_ACCEPTED,
};
use crate::project_instructions::render::{build_doc, render_target};
use crate::project_instructions::signals::{default_probe_logs, hot_dir_candidates};
use crate::project_instructions::store::{candidate_id_for, list_candidates, upsert_candidate};
use crate::project_instructions::targets::{TargetDef, TARGETS};

fn window_label(window: &Window) -> String {
    window.label().to_string()
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstructionsScopeArgs {
    pub scope_id: String,
    pub task_scope_id: String,
    pub request_id: String,
    pub project_id: String,
    /// 用户确认的项目根（绝对路径，仅后端使用，不外发）。
    pub project_root: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstructionsListArgs {
    pub project_id: String,
    pub status: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstructionsCandidateDecideArgs {
    pub candidate_id: String,
    pub accept: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstructionsManualArgs {
    pub project_id: String,
    pub section: String,
    pub content: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstructionsApplyArgs {
    pub project_id: String,
    pub project_root: String,
    pub target_id: String,
    pub content: String,
    pub consent_insert_into_existing: Option<bool>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstructionsTargetArgs {
    pub project_id: String,
    pub project_root: String,
    pub target_id: String,
}

fn find_target(target_id: &str) -> Result<&'static TargetDef, String> {
    TARGETS
        .iter()
        .find(|t| t.id == target_id)
        .ok_or_else(|| format!("unknown target: {target_id}"))
}

/// 取 IR + 已确认条目。
#[tauri::command]
pub fn cmd_project_instructions_doc(
    project_id: String,
) -> Result<serde_json::Value, String> {
    let doc = build_doc(&project_id)?;
    Ok(serde_json::json!({
        "ok": true,
        "doc": doc,
        "targets": TARGETS,
    }))
}

#[tauri::command]
pub fn cmd_project_instructions_candidates(
    args: InstructionsListArgs,
) -> Result<serde_json::Value, String> {
    let list = list_candidates(&args.project_id, args.status.as_deref())?;
    Ok(serde_json::json!({ "ok": true, "candidates": list }))
}

/// accept / reject。accept 会写入 memory_records。
#[tauri::command]
pub fn cmd_project_instructions_candidate_decide(
    args: InstructionsCandidateDecideArgs,
) -> Result<serde_json::Value, String> {
    if args.accept {
        let memory_id = accept_candidate(&args.candidate_id)?;
        Ok(serde_json::json!({ "ok": true, "memoryId": memory_id }))
    } else {
        reject_candidate(&args.candidate_id)?;
        Ok(serde_json::json!({ "ok": true, "memoryId": serde_json::Value::Null }))
    }
}

#[tauri::command]
pub fn cmd_project_instructions_add_manual(
    args: InstructionsManualArgs,
) -> Result<serde_json::Value, String> {
    if !ALL_SECTIONS.contains(&args.section.as_str()) {
        return Err(format!("invalid section: {}", args.section));
    }
    let memory_id = add_manual(&args.project_id, &args.section, &args.content)?;
    Ok(serde_json::json!({ "ok": true, "memoryId": memory_id }))
}

/// 触发一次推导：passport（确定性）+ 根目录清单 + 探针 cwd 频次（统计信号）。
/// 全部走既有 scope，**不新增任何读取权限**。
#[tauri::command]
pub fn cmd_project_instructions_derive(
    window: Window,
    args: InstructionsScopeArgs,
) -> Result<serde_json::Value, String> {
    let label = window_label(&window);
    let passport_args = QueryArgs {
        scope_id: args.scope_id.clone(),
        task_scope_id: args.task_scope_id.clone(),
        request_id: format!("{}-passport", args.request_id),
        query: ContextQuery::Passport,
    };
    let passport = crate::project_context::run_query(&label, &passport_args)
        .map_err(|e| e.as_str().to_string())?;
    let QueryPayload::Passport { record } = passport.result else {
        return Err("unexpected query payload".into());
    };

    let list_args = QueryArgs {
        scope_id: args.scope_id.clone(),
        task_scope_id: args.task_scope_id.clone(),
        request_id: format!("{}-list", args.request_id),
        query: ContextQuery::ListFiles {
            relative_dir: String::new(),
        },
    };
    let listing = crate::project_context::run_query(&label, &list_args)
        .map_err(|e| e.as_str().to_string())?;
    let QueryPayload::ListFiles { items } = listing.result else {
        return Err("unexpected query payload".into());
    };

    let mut derived = derive_from_passport(&record, &items);
    // 探针日志按**进程 cwd** 定位（与探针脚本写日志的位置一致），
    // 热点目录再按项目根过滤 —— 两者不是同一个基准，别混用。
    derived.extend(hot_dir_candidates(
        Path::new(&args.project_root),
        &default_probe_logs(),
    ));

    let now = crate::agent_memory::now_ms();
    let mut created = 0usize;
    for d in derived {
        let kind = if d.evidence.get("source").and_then(|s| s.as_str()) == Some("hook_probe_cwd") {
            KIND_SIGNAL
        } else {
            KIND_DERIVED
        };
        let candidate = Candidate {
            candidate_id: candidate_id_for(&args.project_id, kind, d.section, &d.content),
            project_id: args.project_id.clone(),
            kind: kind.into(),
            section: d.section.into(),
            proposed_content: d.content,
            evidence_json: Some(d.evidence.to_string()),
            confidence: d.confidence,
            status: crate::project_instructions::model::STATUS_PENDING.into(),
            accepted_memory_id: None,
            created_at_ms: now,
            updated_at_ms: now,
        };
        upsert_candidate(&candidate)?;
        created += 1;
    }

    // 漂移检测：passport 的 source_version 变了 → 旧的 derived 条目标 stale。
    let stale = mark_stale_candidates(&args.project_id, &record.source_version)?;

    Ok(serde_json::json!({
        "ok": true,
        "candidates": created,
        "stale": stale,
        "sourceVersion": record.source_version,
    }))
}

/// 渲染预览（不改盘）。
#[tauri::command]
pub fn cmd_project_instructions_render_preview(
    project_id: String,
    target_id: String,
) -> Result<serde_json::Value, String> {
    let doc = build_doc(&project_id)?;
    let target = find_target(&target_id)?;
    Ok(serde_json::json!({
        "ok": true,
        "targetId": target_id,
        "pathLabel": target.relative_path,
        "content": render_target(&doc, target),
    }))
}

/// 写入预览（只评估，不写盘）。
#[tauri::command]
pub fn cmd_project_instructions_apply_preview(
    args: InstructionsApplyArgs,
) -> Result<serde_json::Value, String> {
    let target = find_target(&args.target_id)?;
    let outcome: ApplyOutcome =
        plan_write(Path::new(&args.project_root), target, &args.content)?;
    Ok(serde_json::json!({ "ok": true, "outcome": outcome }))
}

/// 显式确认后写盘。
#[tauri::command]
pub fn cmd_project_instructions_apply_confirm(
    args: InstructionsApplyArgs,
) -> Result<serde_json::Value, String> {
    let target = find_target(&args.target_id)?;
    let outcome = write_block(
        Path::new(&args.project_root),
        target,
        &args.content,
        args.consent_insert_into_existing.unwrap_or(false),
    )?;
    Ok(serde_json::json!({ "ok": true, "outcome": outcome }))
}

/// 撤回受管区块。
#[tauri::command]
pub fn cmd_project_instructions_revert(
    args: InstructionsTargetArgs,
) -> Result<serde_json::Value, String> {
    let target = find_target(&args.target_id)?;
    let outcome = revert_block(Path::new(&args.project_root), target)?;
    Ok(serde_json::json!({ "ok": true, "outcome": outcome }))
}

/// 已确认条目列表（供前端「已确认条目区」）。
#[tauri::command]
pub fn cmd_project_instructions_confirmed(
    project_id: String,
) -> Result<serde_json::Value, String> {
    let rows = confirmed_instructions(&project_id)?;
    Ok(serde_json::json!({ "ok": true, "items": rows }))
}

/// 常量导出（前端用）。
#[tauri::command]
pub fn cmd_project_instructions_meta() -> Result<serde_json::Value, String> {
    Ok(serde_json::json!({
        "ok": true,
        "sections": ALL_SECTIONS,
        "statuses": [crate::project_instructions::model::STATUS_PENDING, STATUS_ACCEPTED],
        "targets": TARGETS,
    }))
}
```

在 `src-tauri/src/ipc/commands/shell/mod.rs` 加：

```rust
mod project_instructions_cmd;
...
pub use project_instructions_cmd::*;
```

在 `src-tauri/src/lib.rs` 的 `invoke_handler` 列表中，加入：

```rust
            ipc::cmd_project_instructions_doc,
            ipc::cmd_project_instructions_candidates,
            ipc::cmd_project_instructions_candidate_decide,
            ipc::cmd_project_instructions_add_manual,
            ipc::cmd_project_instructions_derive,
            ipc::cmd_project_instructions_render_preview,
            ipc::cmd_project_instructions_apply_preview,
            ipc::cmd_project_instructions_apply_confirm,
            ipc::cmd_project_instructions_revert,
            ipc::cmd_project_instructions_confirmed,
            ipc::cmd_project_instructions_meta,
```

- [ ] **Step 2: 编译**

Run: `cargo check --manifest-path src-tauri/Cargo.toml --no-default-features`
Expected: 编译通过，无 error

- [ ] **Step 3: 跑既有回归（确认没打破 agent_memory）**

Run: `cargo test --manifest-path src-tauri/Cargo.toml --no-default-features --lib agent_memory`
Expected: PASS

- [ ] **Step 4: 提交**

```bash
git add src-tauri/src/ipc/commands/shell/project_instructions_cmd.rs \
        src-tauri/src/ipc/commands/shell/mod.rs src-tauri/src/lib.rs
git commit -m "feat(project-instructions): IPC surface for doc/candidates/apply"
```

---

### Task 8: 端到端验收测试

**Files:**
- Create: `src-tauri/tests/project_instructions_plan.rs`

**Interfaces:**
- Consumes: `onetone::project_instructions::*`（公开 API）
- Produces: 验收门禁 `cargo test --manifest-path src-tauri/Cargo.toml --no-default-features --test project_instructions_plan`

- [ ] **Step 1: 写验收测试**

创建 `src-tauri/tests/project_instructions_plan.rs`：

```rust
//! Project Instructions Batch A 验收矩阵。
//!
//! Gate: cargo test --manifest-path src-tauri/Cargo.toml --no-default-features --test project_instructions_plan
//!
//! 覆盖 spec §11.3 六条验收条目：
//! ① 不动 probe 白名单 ② memory_records 结构不变 ③ 区块外逐字节不变
//! ④ 渲染产物不含未确认候选 ⑤ 撤回后回到应用前状态 ⑥ 条目可被 query_memory 查到
//!
//! 独立测试二进制的原因同 `project_instructions_db.rs`：agent_memory 的 DB 连接
//! 是进程级全局的（`store::with_write` → `WRITE_CONN.get_or_init`），
//! 只有独占进程才能保证 `ONETONE_AGENT_MEMORY_DB` 覆盖在第一次写库前生效 ——
//! 否则测试数据会写进用户真实的 agent-memory 数据库。

use onetone::agent_memory::{query_memory, upsert_memory};
use onetone::project_instructions::apply::{
    plan_write, revert_block, write_block, ApplyCode, BLOCK_BEGIN,
};
use onetone::project_instructions::decide::{
    accept_candidate, add_manual, confirmed_instructions,
};
use onetone::project_instructions::model::{
    Candidate, KIND_DERIVED, MEMORY_TYPE_INSTRUCTION, SECTION_GOTCHAS, STATUS_ACCEPTED,
    STATUS_PENDING,
};
use onetone::project_instructions::render::{build_doc, render_doc};
use onetone::project_instructions::store::{candidate_id_for, upsert_candidate};
use onetone::project_instructions::targets::{TARGET_AGENTS_MD, TARGETS};
use std::path::PathBuf;
use std::sync::{Mutex, MutexGuard, Once};

static INIT: Once = Once::new();
static TEST_LOCK: Mutex<()> = Mutex::new(());

fn lock_db() -> MutexGuard<'static, ()> {
    INIT.call_once(|| {
        let dir = std::env::temp_dir().join(format!(
            "onetone-project-instructions-plan-{}",
            std::process::id()
        ));
        let _ = std::fs::create_dir_all(&dir);
        std::env::set_var("ONETONE_AGENT_MEMORY_DB", dir.join("agent-memory.sqlite3"));
    });
    TEST_LOCK.lock().unwrap_or_else(|e| e.into_inner())
}

fn tmpdir(tag: &str) -> PathBuf {
    let d = std::env::temp_dir().join(format!(
        "onetone-pi-plan-{}-{}-{}",
        tag,
        std::process::id(),
        std::process::id()
    ));
    let _ = std::fs::remove_dir_all(&d);
    let _ = std::fs::create_dir_all(&d);
    d
}

fn agents_target() -> &'static onetone::project_instructions::targets::TargetDef {
    TARGETS
        .iter()
        .find(|t| t.id == TARGET_AGENTS_MD)
        .expect("agents_md target")
}

fn seed_candidate(project: &str, content: &str) -> Candidate {
    let now = onetone::agent_memory::now_ms();
    Candidate {
        candidate_id: candidate_id_for(project, KIND_DERIVED, SECTION_GOTCHAS, content),
        project_id: project.into(),
        kind: KIND_DERIVED.into(),
        section: SECTION_GOTCHAS.into(),
        proposed_content: content.into(),
        evidence_json: Some("{\"sourceVersion\":\"v1\"}".into()),
        confidence: 0.8,
        status: STATUS_PENDING.into(),
        accepted_memory_id: None,
        created_at_ms: now,
        updated_at_ms: now,
    }
}

/// ③ 区块外逐字节不变 + ⑤ 撤回后回到应用前状态
#[test]
fn user_content_outside_block_survives_and_reverts() {
    let _g = lock_db();
    let d = tmpdir("preserve");
    let original = "# 我的笔记\n\n不要动我\n";
    std::fs::write(d.join("AGENTS.md"), original).unwrap();

    let out = write_block(&d, agents_target(), "body-1", false).unwrap();
    assert_eq!(out.code, ApplyCode::NeedsDecision, "must ask before touching user file");

    let out = write_block(&d, agents_target(), "body-1", true).unwrap();
    assert_eq!(out.code, ApplyCode::Ok);
    let after = std::fs::read_to_string(d.join("AGENTS.md")).unwrap();
    assert!(after.starts_with(original), "user content must be byte-identical at the head");

    // 再写一次：区块外仍不变
    write_block(&d, agents_target(), "body-2", false).unwrap();
    let after2 = std::fs::read_to_string(d.join("AGENTS.md")).unwrap();
    assert!(after2.starts_with(original));

    // 撤回
    let out = revert_block(&d, agents_target()).unwrap();
    assert_eq!(out.code, ApplyCode::Ok);
    let reverted = std::fs::read_to_string(d.join("AGENTS.md")).unwrap();
    assert!(!reverted.contains(BLOCK_BEGIN));
    assert!(reverted.starts_with(original), "revert must restore the original head");
}

/// ④ 渲染产物不含未确认候选
#[test]
fn render_excludes_unconfirmed_candidates() {
    let _g = lock_db();
    let c = seed_candidate("render-p", "未确认的条目");
    upsert_candidate(&c).unwrap();
    let doc = build_doc("render-p").unwrap();
    let text = render_doc(&doc);
    assert!(!text.contains("未确认的条目"), "pending candidate must not render");

    accept_candidate(&c.candidate_id).unwrap();
    let doc2 = build_doc("render-p").unwrap();
    let text2 = render_doc(&doc2);
    assert!(text2.contains("未确认的条目"), "accepted candidate must render");
}

/// ⑥ 条目可被 query_memory 查到（MCP 闭环）
#[test]
fn instruction_entries_are_queryable_by_query_memory() {
    let _g = lock_db();
    add_manual("mcp-p", "gotchas", "worker.rs 双写").unwrap();
    let found = query_memory("mcp-p", "双写", 10).unwrap();
    assert_eq!(found.len(), 1);
    assert_eq!(found[0].memory_type, MEMORY_TYPE_INSTRUCTION);
}

/// ② memory_records 结构不变：仍只有既有列，且 instruction 类型可用
#[test]
fn memory_records_schema_unchanged_and_instruction_allowed() {
    let _g = lock_db();
    let cols = onetone::agent_memory::with_read_path(|conn| {
        let mut stmt = conn
            .prepare("SELECT name FROM pragma_table_info('memory_records')")
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |r| r.get::<_, String>(0))
            .map_err(|e| e.to_string())?;
        let mut v = Vec::new();
        for r in rows {
            v.push(r.map_err(|e| e.to_string())?);
        }
        Ok(v)
    })
    .unwrap();
    for expected in [
        "memory_id",
        "project_id",
        "session_id",
        "memory_type",
        "content",
        "source_event_id",
        "confidence",
        "created_at_ms",
        "updated_at_ms",
        "supersedes_id",
        "user_authored",
    ] {
        assert!(cols.iter().any(|c| c == expected), "missing column {expected}");
    }
    // 新表存在
    let n = onetone::agent_memory::with_read_path(|conn| {
        conn.query_row(
            "SELECT COUNT(1) FROM sqlite_master WHERE type='table' AND name='instruction_candidates'",
            [],
            |r| r.get::<_, i64>(0),
        )
        .map_err(|e| e.to_string())
    })
    .unwrap();
    assert_eq!(n, 1);
}

/// 确认后的条目状态正确
#[test]
fn accepted_candidate_has_status_and_memory_link() {
    let _g = lock_db();
    let c = seed_candidate("status-p", "一条坑位");
    upsert_candidate(&c).unwrap();
    let mid = accept_candidate(&c.candidate_id).unwrap();
    let got = onetone::project_instructions::store::candidate_by_id(&c.candidate_id)
        .unwrap()
        .unwrap();
    assert_eq!(got.status, STATUS_ACCEPTED);
    assert_eq!(got.accepted_memory_id.as_deref(), Some(mid.as_str()));
    assert_eq!(confirmed_instructions("status-p").unwrap().len(), 1);
}

/// 计划接口不写盘
#[test]
fn plan_write_never_touches_disk() {
    let _g = lock_db();
    let d = tmpdir("plan");
    std::fs::write(d.join("AGENTS.md"), "user\n").unwrap();
    let out = plan_write(&d, agents_target(), "x").unwrap();
    assert_eq!(out.code, ApplyCode::NeedsDecision);
    assert_eq!(std::fs::read_to_string(d.join("AGENTS.md")).unwrap(), "user\n");
}

/// memory_records 既有类型仍然可用（回归）
#[test]
fn existing_memory_types_still_work() {
    let _g = lock_db();
    let row = upsert_memory("reg-p", None, "gotcha", "旧的坑", None, Some(0.7), None, true).unwrap();
    assert_eq!(row.memory_type, "gotcha");
}
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cargo test --manifest-path src-tauri/Cargo.toml --no-default-features --test project_instructions_plan`
Expected: 编译错误（公开 API 尚未导出，例如 `onetone::project_instructions::model::Candidate` 需要 `pub mod model` 可见、`now_ms` 需要从 `onetone::agent_memory` 导出）

- [ ] **Step 3: 补齐导出使编译通过**

`onetone::agent_memory::now_ms` 的 re-export 已在 **Task 1 Step 5** 完成
（`agent_memory/mod.rs`：`pub use store::{now_ms, with_read_path, with_write};`）。
此处只需**确认**它还在：

```bash
grep -n "pub use store::" src-tauri/src/agent_memory/mod.rs
```

若里面没有 `now_ms`，补上（`now_ms` 在 `agent_memory/store.rs:357` 已是 `pub fn`）。

若 `onetone::project_instructions::store` / `model` / `apply` / `targets` 不可见，确认 `src-tauri/src/project_instructions/mod.rs` 中全部为 `pub mod`。

- [ ] **Step 4: 运行测试确认通过**

Run: `cargo test --manifest-path src-tauri/Cargo.toml --no-default-features --test project_instructions_plan`
Expected: PASS —— 7 个测试全绿

- [ ] **Step 5: 跑全量回归**

Run:
```bash
cargo test --manifest-path src-tauri/Cargo.toml --no-default-features --lib
cargo test --manifest-path src-tauri/Cargo.toml --no-default-features --test project_instructions_db
cargo test --manifest-path src-tauri/Cargo.toml --no-default-features --test project_instructions_plan
```
Expected: 全部 PASS（既有 agent_memory / project_context 测试不受影响）

> 注意：`--lib` 全量跑时，project_instructions 的 DB 测试**不在** `--lib` 里，
> 而在两个独立测试二进制里 —— 所以 `--lib` 全量不会污染用户的真实 agent-memory 数据库。

- [ ] **Step 6: 提交**

```bash
git add src-tauri/tests/project_instructions_plan.rs
git commit -m "test(project-instructions): batch A acceptance matrix"
```

---

## 完成定义（Batch A）

- [ ] `cargo test --manifest-path src-tauri/Cargo.toml --no-default-features --lib project_instructions` 全绿（纯函数模块：derive / signals / render / apply）
- [ ] `cargo test --manifest-path src-tauri/Cargo.toml --no-default-features --test project_instructions_db` 全绿（DB 模块：store / decide）
- [ ] `cargo test --manifest-path src-tauri/Cargo.toml --no-default-features --test project_instructions_plan` 全绿（验收矩阵）
- [ ] `cargo test --manifest-path src-tauri/Cargo.toml --no-default-features --lib` 无回归
- [ ] `grep -rn "tool_input" scripts/claude-hook-probe.js scripts/agent-shell-hook-probe.js` 输出与改动前一致（未新增采集）
- [ ] `git diff --stat HEAD~8 -- src-tauri/src/agent_memory/store.rs` 只显示新增 `MIGRATION_V7` 与 `applied_v7` 分支
- [ ] `git diff --stat HEAD~8 -- src-tauri/src/agent_memory/memory.rs` 只显示 `valid_type` 白名单 + 新增 `list_memories_by_type`
- [ ] `git diff --stat HEAD~8 -- src-tauri/src/agent_memory/mod.rs` 只显示两行 `pub use` 调整

## 执行方式（Execution Handoff）

本计划按 writing-plans 流程编写，执行时二选一：

1. **Subagent-Driven（推荐）** —— 每个任务派一个全新 subagent 实现，任务之间做两阶段评审，
   迭代快、上下文干净。用 `superpowers:subagent-driven-development`。
2. **Inline Execution** —— 在当前会话里按批次执行 `superpowers:executing-plans`，
   带检查点，适合想全程盯着进度的情况。

两种方式都要求**逐任务执行本文件的 Step 顺序**（写失败测试 → 跑失败 → 最小实现 → 跑通过 → 提交）。

---

## 批次 B（前端面板，另起一份计划）

`src/js/features/now/home-project-instructions.js` 面板三区（候选审阅 / 已确认条目 / 目标分发）+ `scripts/test-home-project-instructions.mjs`。依赖本批次 11 个 IPC 全部就绪后开工。
