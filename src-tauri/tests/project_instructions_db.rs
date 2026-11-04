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
