//! Project Instructions —— 依赖数据库的测试（store + decide）。
//!
//! Gate: cargo test --manifest-path src-tauri/Cargo.toml --no-default-features --test project_instructions_db
//!
//! 独立二进制的原因：agent_memory 的 DB 连接是进程级全局的
//! （`store::with_write` → `WRITE_CONN.get_or_init`），
//! 只有独占进程才能保证 `ONETONE_AGENT_MEMORY_DB` 覆盖在第一次写库之前生效。

use onetone::agent_memory::{list_memories_by_type, now_ms, upsert_memory};
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

/// created_at_ms 与 updated_at_ms 必须各写各的 —— 候选列表按 updated_at_ms 倒序排，
/// 两者混用会让「最近被推导触碰过的候选」这个信号失效。
#[test]
fn upsert_keeps_created_and_updated_apart() {
    let _g = lock_db();
    let mut c = cand("p4", "时间戳要分开");
    c.updated_at_ms = c.created_at_ms + 5_000;
    upsert_candidate(&c).unwrap();
    let got = candidate_by_id(&c.candidate_id).unwrap().unwrap();
    assert_eq!(got.created_at_ms, c.created_at_ms);
    assert_eq!(got.updated_at_ms, c.updated_at_ms, "updated_at must not reuse created_at");
}

/// 非法状态必须被拒 —— 状态是下游 decide/render 会依赖的契约。
#[test]
fn set_candidate_status_rejects_unknown_status() {
    let _g = lock_db();
    let c = cand("p5", "状态要校验");
    upsert_candidate(&c).unwrap();
    assert!(set_candidate_status(&c.candidate_id, "bogus", None).is_err());
}

/// 查不到时必须返回 Ok(None)，而不是 Err。
#[test]
fn candidate_by_id_returns_none_for_unknown_id() {
    let _g = lock_db();
    assert!(candidate_by_id("no-such-candidate").unwrap().is_none());
}

/// `instruction` 类型必须能真正写进 memory_records 并按类型读回来 ——
/// 说明书条目全靠这条链路，且它是「能用 query_memory 查到」的前提。
#[test]
fn instruction_memory_round_trips() {
    let _g = lock_db();
    let row = upsert_memory(
        "rt-1",
        None,
        "instruction",
        "跑测试必须带 --no-default-features",
        Some("evt-1"),
        Some(0.9),
        None,
        false,
    )
    .unwrap();
    assert_eq!(row.memory_type, "instruction");
    let found = list_memories_by_type("rt-1", "instruction", 200).unwrap();
    assert_eq!(found.len(), 1);
    assert_eq!(found[0].content, "跑测试必须带 --no-default-features");
}

// ---- decide (Task 4) ----

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
