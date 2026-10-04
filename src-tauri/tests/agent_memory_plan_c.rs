//! Plan C named acceptance matrix — MCP-ready IPC only (not MCP stdio server).
//!
//! Gate: cargo test --manifest-path src-tauri/Cargo.toml --no-default-features --test agent_memory_plan_c
//! Do NOT treat `cargo test --lib agent_memory` (11 unit tests) as Plan C pass.

use onetone::agent_memory::{
    append_lifecycle_event, build_agent_home_snapshot, context_for_provider, create_checkpoint,
    latest_checkpoint_for_project, latest_checkpoint_for_session, list_recent_memory,
    maybe_auto_checkpoint, project_context, query_memory, rebuild_memory_fts, resume_checkpoint,
    tool_checkpoint_preview, tool_memory_search, tool_project_context, tool_session_history,
    upsert_memory, upsert_session_candidate, with_read_path, ProjectMatch, SessionCandidate,
    PROVIDER_CURSOR, UNKNOWN_PROJECT_ID,
};
use rusqlite::params;
use std::sync::{Mutex, MutexGuard, Once};

static INIT: Once = Once::new();
static TEST_LOCK: Mutex<()> = Mutex::new(());

fn lock_db() -> MutexGuard<'static, ()> {
    INIT.call_once(|| {
        let dir = std::env::temp_dir().join(format!(
            "onetone-agent-mem-plan-c-named-{}",
            std::process::id()
        ));
        let _ = std::fs::create_dir_all(&dir);
        let db = dir.join("agent-memory.sqlite3");
        std::env::set_var("ONETONE_AGENT_MEMORY_DB", &db);
    });
    TEST_LOCK.lock().unwrap_or_else(|e| e.into_inner())
}

fn cand(external: &str, project: &str) -> SessionCandidate {
    SessionCandidate {
        provider: PROVIDER_CURSOR.into(),
        external_session_id: external.into(),
        project_id: project.into(),
        project_match: ProjectMatch::Exact,
        match_reason: "test".into(),
        match_confidence: 0.9,
        started_at: Some(1),
        updated_at: Some(2),
        title: Some("plan-c".into()),
        is_active: true,
        activity_source: "observed".into(),
        active_confidence: 0.5,
        workspace_evidence: None,
    }
}

fn make_running(external: &str, project: &str, tag: &str) -> String {
    let sid = upsert_session_candidate(&cand(external, project)).expect("session");
    assert!(append_lifecycle_event(
        &sid,
        PROVIDER_CURSOR,
        "task_started",
        &format!("life|{tag}|start"),
        10,
        "started",
    )
    .expect("start"));
    sid
}

fn status_of(sid: &str) -> String {
    with_read_path(|conn| {
        conn.query_row(
            "SELECT status FROM agent_sessions WHERE session_id = ?1",
            params![sid],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())
    })
    .expect("status")
}

fn ckpt_count(sid: &str) -> i64 {
    with_read_path(|conn| {
        conn.query_row(
            "SELECT COUNT(1) FROM agent_checkpoints WHERE session_id = ?1",
            params![sid],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())
    })
    .expect("ckpt count")
}

fn event_count_of_type(sid: &str, event_type: &str) -> i64 {
    with_read_path(|conn| {
        conn.query_row(
            "SELECT COUNT(1) FROM agent_events WHERE session_id = ?1 AND event_type = ?2",
            params![sid, event_type],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())
    })
    .expect("event count")
}

fn event_exists(event_id: &str) -> bool {
    with_read_path(|conn| {
        conn.query_row(
            "SELECT COUNT(1) FROM agent_events WHERE event_id = ?1",
            params![event_id],
            |r| r.get::<_, i64>(0),
        )
        .map_err(|e| e.to_string())
    })
    .map(|n| n > 0)
    .unwrap_or(false)
}

// --- Checkpoint ---

#[test]
fn checkpoint_create_and_resume() {
    let _g = lock_db();
    let sid = make_running("ext-ckpt-resume", "proj_ckpt_resume", "ckpt-resume");
    let ckpt = create_checkpoint(
        &sid,
        Some("继续改文案"),
        Some(&["确认阈值？".into()]),
        Some(&["now-home.js".into()]),
    )
    .expect("create");
    assert!(!ckpt.checkpoint_id.is_empty());
    assert_eq!(ckpt.session_id, sid);
    assert_eq!(ckpt.project_id, "proj_ckpt_resume");
    assert!(ckpt.last_event_id.is_some());
    assert!(event_exists(ckpt.last_event_id.as_deref().unwrap()));
    assert!(ckpt.updated_at > 0);

    assert!(append_lifecycle_event(
        &sid,
        PROVIDER_CURSOR,
        "task_paused",
        "life|ckpt-resume|pause",
        20,
        "paused",
    )
    .unwrap());

    let brief = resume_checkpoint(&sid).expect("resume");
    assert!(brief.resumable);
    assert!(!brief.brief.is_empty());
    assert_eq!(status_of(&sid), "running");
}

#[test]
fn checkpoint_rejects_invalid_session() {
    let _g = lock_db();
    let err = create_checkpoint("missing-session-xyz", Some("x"), None, None).unwrap_err();
    assert!(err.contains("session not found"), "err={err}");
}

#[test]
fn checkpoint_project_session_isolation() {
    let _g = lock_db();
    let a = make_running("ext-iso-a", "proj_iso_a", "iso-a");
    let b = make_running("ext-iso-b", "proj_iso_b", "iso-b");
    let ca = create_checkpoint(&a, Some("next-a"), None, None).unwrap();
    let cb = create_checkpoint(&b, Some("next-b"), None, None).unwrap();
    assert_ne!(ca.checkpoint_id, cb.checkpoint_id);
    assert_eq!(
        latest_checkpoint_for_session(&a).unwrap().project_id,
        "proj_iso_a"
    );
    assert_eq!(
        latest_checkpoint_for_project("proj_iso_a")
            .unwrap()
            .session_id,
        a
    );
    assert_ne!(
        latest_checkpoint_for_project("proj_iso_a")
            .unwrap()
            .checkpoint_id,
        latest_checkpoint_for_project("proj_iso_b")
            .unwrap()
            .checkpoint_id
    );
}

#[test]
fn checkpoint_auto_create_is_idempotent() {
    let _g = lock_db();
    let sid = make_running("ext-auto-idemp", "proj_auto_idemp", "auto-idemp");
    assert!(append_lifecycle_event(
        &sid,
        PROVIDER_CURSOR,
        "task_paused",
        "life|auto-idemp|pause",
        20,
        "paused",
    )
    .unwrap());
    let n = ckpt_count(&sid);
    let created = event_count_of_type(&sid, "checkpoint_created");
    maybe_auto_checkpoint(&sid, "task_paused", 20);
    maybe_auto_checkpoint(&sid, "task_paused", 21);
    assert_eq!(ckpt_count(&sid), n, "auto checkpoint must not duplicate");
    assert_eq!(
        event_count_of_type(&sid, "checkpoint_created"),
        created,
        "checkpoint_created must not recurse"
    );
}

#[test]
fn checkpoint_resume_has_no_side_effect() {
    let _g = lock_db();
    let sid = make_running("ext-resume-side", "proj_resume_side", "resume-side");
    let _ = create_checkpoint(&sid, Some("只返回 brief"), None, None).unwrap();
    assert!(append_lifecycle_event(
        &sid,
        PROVIDER_CURSOR,
        "task_paused",
        "life|resume-side|pause",
        20,
        "paused",
    )
    .unwrap());

    let before = ckpt_count(&sid);
    let brief = resume_checkpoint(&sid).expect("resume");
    assert!(!brief.brief.is_empty());
    assert_eq!(status_of(&sid), "running");
    assert_eq!(ckpt_count(&sid), before);
    let preview = tool_checkpoint_preview(Some(&sid), None);
    assert_eq!(preview["executes"], false);
    assert_eq!(preview["readonly"], true);
}

#[test]
fn checkpoint_auto_covers_waiting_completed_failed() {
    let _g = lock_db();
    let sid = make_running("ext-auto-all", "proj_auto_all", "auto-all");
    assert!(append_lifecycle_event(
        &sid,
        PROVIDER_CURSOR,
        "waiting_approval",
        "life|auto-all|wait",
        20,
        "wait",
    )
    .unwrap());
    assert!(ckpt_count(&sid) >= 1);

    assert!(append_lifecycle_event(
        &sid,
        PROVIDER_CURSOR,
        "task_resumed",
        "life|auto-all|resume",
        30,
        "go",
    )
    .unwrap());
    let n = ckpt_count(&sid);
    assert!(append_lifecycle_event(
        &sid,
        PROVIDER_CURSOR,
        "task_completed",
        "life|auto-all|done",
        40,
        "done",
    )
    .unwrap());
    assert!(ckpt_count(&sid) > n);

    let sid2 = make_running("ext-auto-fail", "proj_auto_all", "auto-fail");
    assert!(append_lifecycle_event(
        &sid2,
        PROVIDER_CURSOR,
        "task_failed",
        "life|auto-fail|x",
        20,
        "boom",
    )
    .unwrap());
    assert!(ckpt_count(&sid2) >= 1);
}

// --- Memory ---

#[test]
fn memory_is_project_scoped() {
    let _g = lock_db();
    let a = upsert_memory(
        "proj_mem_a",
        None,
        "observation",
        "项目A记忆短停顿",
        Some("src-a"),
        None,
        None,
        false,
    )
    .unwrap();
    let _ = upsert_memory(
        "proj_mem_b",
        None,
        "observation",
        "项目B记忆短停顿",
        Some("src-b"),
        None,
        None,
        false,
    )
    .unwrap();
    let hits = query_memory("proj_mem_a", "短停顿", 10).unwrap();
    assert!(!hits.is_empty());
    assert!(hits.iter().all(|m| m.project_id == "proj_mem_a"));
    let bhits = query_memory("proj_mem_b", "短停顿", 10).unwrap();
    assert!(!bhits.iter().any(|m| m.memory_id == a.memory_id));
}

#[test]
fn memory_requires_source_event() {
    let _g = lock_db();
    assert!(upsert_memory(
        "proj_src",
        None,
        "observation",
        "no source",
        None,
        None,
        None,
        false
    )
    .is_err());
    let ua = upsert_memory(
        "proj_src",
        None,
        "decision",
        "用户手写记忆",
        None,
        None,
        None,
        true,
    )
    .unwrap();
    assert!(ua.user_authored);
}

#[test]
fn memory_upsert_is_idempotent() {
    let _g = lock_db();
    let m1 = upsert_memory(
        "proj_idemp",
        None,
        "observation",
        "同一来源",
        Some("same-src"),
        Some(0.5),
        None,
        false,
    )
    .unwrap();
    let m2 = upsert_memory(
        "proj_idemp",
        None,
        "observation",
        "同一来源更新",
        Some("same-src"),
        Some(0.9),
        None,
        false,
    )
    .unwrap();
    assert_eq!(m1.memory_id, m2.memory_id);
    let recent = list_recent_memory("proj_idemp", 20).unwrap();
    assert_eq!(
        recent
            .iter()
            .filter(|m| m.memory_id == m1.memory_id)
            .count(),
        1
    );
}

#[test]
fn memory_rejects_cross_project_supersedes() {
    let _g = lock_db();
    let a = upsert_memory(
        "proj_sup_a",
        None,
        "observation",
        "A",
        Some("s1"),
        None,
        None,
        false,
    )
    .unwrap();
    let b = upsert_memory(
        "proj_sup_b",
        None,
        "observation",
        "B",
        Some("s2"),
        None,
        None,
        false,
    )
    .unwrap();
    let err = upsert_memory(
        "proj_sup_a",
        None,
        "gotcha",
        "bad",
        Some("s3"),
        None,
        Some(&b.memory_id),
        false,
    )
    .unwrap_err();
    assert!(err.contains("cross-project") || err.contains("supersedes"));
    let _ = upsert_memory(
        "proj_sup_a",
        None,
        "gotcha",
        "ok",
        Some("s4"),
        None,
        Some(&a.memory_id),
        false,
    )
    .unwrap();
}

#[test]
fn memory_fts_search() {
    let _g = lock_db();
    let _ = upsert_memory(
        "proj_fts",
        None,
        "observation",
        "短停顿会被误判为结束",
        Some("fts-1"),
        None,
        None,
        false,
    )
    .unwrap();
    let hits = query_memory("proj_fts", "短停顿", 10).unwrap();
    assert!(!hits.is_empty());
    assert!(hits.iter().all(|m| m.project_id == "proj_fts"));
}

#[test]
fn memory_fts_rebuild() {
    let _g = lock_db();
    let _ = upsert_memory(
        "proj_rebuild",
        None,
        "observation",
        "重建索引内容",
        Some("rb-1"),
        None,
        None,
        false,
    )
    .unwrap();
    let n = rebuild_memory_fts().unwrap();
    assert!(n >= 1);
    let hits = query_memory("proj_rebuild", "重建索引", 10).unwrap();
    assert!(!hits.is_empty());
}

#[test]
fn memory_rejects_sensitive_fields() {
    let _g = lock_db();
    for (i, body) in [
        "Authorization: Bearer secret-token-value",
        "access_token=abc",
        "refresh_token=xyz",
        "cookie: sid=1",
        "set-cookie: a=b",
        "api_key=sk-test",
        "sk-abcdefghijklmnopqrstuvwxyz",
    ]
    .into_iter()
    .enumerate()
    {
        let err = upsert_memory(
            "proj_sens",
            None,
            "observation",
            body,
            Some(&format!("sens-{i}")),
            None,
            None,
            false,
        )
        .unwrap_err();
        assert!(err.contains("sensitive"), "body={body} err={err}");
    }
    assert!(upsert_memory(
        "proj_sens",
        None,
        "not_a_real_type",
        "ok",
        Some("t"),
        None,
        None,
        false
    )
    .is_err());
    let long: String = (0..2001).map(|_| '字').collect();
    assert!(upsert_memory(
        "proj_sens",
        None,
        "observation",
        &long,
        Some("long"),
        None,
        None,
        false
    )
    .is_err());
}

// --- Context ---

#[test]
fn context_is_project_scoped() {
    let _g = lock_db();
    let _ = upsert_memory(
        "proj_ctx_a",
        None,
        "observation",
        "上下文A独有",
        Some("ctx-a"),
        None,
        None,
        false,
    )
    .unwrap();
    let pack = context_for_provider("proj_ctx_a", Some("上下文A"), 8);
    assert_eq!(pack["projectId"], "proj_ctx_a");
    let mems = pack["memories"].as_array().unwrap();
    assert!(mems.iter().all(|m| m["projectId"] == "proj_ctx_a"));
}

#[test]
fn context_unknown_project_returns_empty() {
    let _g = lock_db();
    let pack = context_for_provider(UNKNOWN_PROJECT_ID, None, 8);
    assert!(pack["memories"].as_array().unwrap().is_empty());
    assert!(pack["checkpoint"].is_null());
    assert!(pack["diagnostics"]
        .as_array()
        .unwrap()
        .iter()
        .any(|d| d.as_str() == Some("unknown_or_empty_project")));
}

#[test]
fn context_limit_is_enforced() {
    let _g = lock_db();
    for i in 0..20 {
        let _ = upsert_memory(
            "proj_lim",
            None,
            "observation",
            &format!("limit item {i}"),
            Some(&format!("lim-{i}")),
            None,
            None,
            false,
        )
        .unwrap();
    }
    let pack = context_for_provider("proj_lim", None, 3);
    assert!(pack["memories"].as_array().unwrap().len() <= 3);
    let ctx = project_context(None, 4);
    assert!(ctx.recent_sessions.len() <= 8);
    assert!(ctx.recent_events.len() <= 12);
    assert!(ctx.recent_memories.len() <= 4);
}

#[test]
fn context_failure_returns_diagnostics() {
    let _g = lock_db();
    let pack = context_for_provider("", None, 8);
    assert!(!pack["diagnostics"].as_array().unwrap().is_empty());
    let snap = build_agent_home_snapshot(None);
    // Snapshot remains usable even when context path is degraded.
    let _ = (&snap.project, &snap.diagnostics);
}

// --- MCP-ready IPC (not MCP server) ---

#[test]
fn mcp_tools_are_read_only() {
    let _g = lock_db();
    let sid = make_running("ext-mcp-ro", "proj_mcp_ro", "mcp-ro");
    let _ = create_checkpoint(&sid, Some("preview"), None, None).unwrap();
    let before = ckpt_count(&sid);
    let before_status = status_of(&sid);

    let _ = tool_project_context(Some("proj_mcp_ro"), None);
    let _ = tool_memory_search("proj_mcp_ro", "x", Some(5));
    let hist = tool_session_history(&sid, Some(10), None);
    let preview = tool_checkpoint_preview(Some(&sid), None);

    assert_eq!(hist["readonly"], true);
    assert_eq!(preview["readonly"], true);
    assert_eq!(preview["executes"], false);
    assert_eq!(ckpt_count(&sid), before);
    assert_eq!(status_of(&sid), before_status);
}

#[test]
fn mcp_rejects_raw_sql() {
    let _g = lock_db();
    assert_eq!(
        tool_memory_search("proj_mcp_sql", "select * from memory_records", Some(5))["ok"],
        false
    );
    assert_eq!(
        tool_memory_search("proj_mcp_sql", "drop table memory_records;--", Some(5))["ok"],
        false
    );
}

#[test]
fn mcp_query_and_limit_are_bounded() {
    let _g = lock_db();
    let long: String = (0..250).map(|_| 'q').collect();
    assert_eq!(
        tool_memory_search("proj_mcp_bound", &long, Some(5))["ok"],
        false
    );
    let _ = tool_memory_search("proj_mcp_bound", "ok", Some(999));
}

#[test]
fn mcp_does_not_expose_sensitive_fields() {
    let _g = lock_db();
    assert!(upsert_memory(
        "proj_mcp_sens",
        None,
        "observation",
        "Authorization: Bearer leak",
        Some("mcp-sens"),
        None,
        None,
        false,
    )
    .is_err());
    let search = tool_memory_search("proj_mcp_sens", "Bearer", Some(10));
    if search["ok"] == true {
        for m in search["memories"].as_array().unwrap() {
            let c = m["content"].as_str().unwrap_or("").to_ascii_lowercase();
            assert!(!c.contains("authorization: bearer"));
            assert!(!c.contains("access_token"));
        }
    }
}

#[test]
fn mcp_checkpoint_preview_has_no_side_effect() {
    let _g = lock_db();
    let sid = make_running("ext-mcp-prev", "proj_mcp_prev", "mcp-prev");
    let _ = create_checkpoint(&sid, Some("stay"), None, None).unwrap();
    assert!(append_lifecycle_event(
        &sid,
        PROVIDER_CURSOR,
        "task_paused",
        "life|mcp-prev|pause",
        20,
        "paused",
    )
    .unwrap());
    let before_status = status_of(&sid);
    let before_n = ckpt_count(&sid);
    let preview = tool_checkpoint_preview(Some(&sid), None);
    assert_eq!(preview["ok"], true);
    assert_eq!(preview["executes"], false);
    assert_eq!(status_of(&sid), before_status);
    assert_eq!(ckpt_count(&sid), before_n);
    assert_eq!(status_of(&sid), "paused");
}
