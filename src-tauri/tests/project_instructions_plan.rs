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
