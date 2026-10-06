//! Plan A acceptance tests — isolated DB via ONETONE_AGENT_MEMORY_DB.
//! Run: cargo test --manifest-path src-tauri/Cargo.toml --test agent_memory_plan_a

use onetone::agent_memory::{
    append_observed_event, build_agent_home_snapshot, source_ref_for_turn,
    upsert_session_candidate, with_read_path, ProjectMatch, SessionCandidate, PROVIDER_CURSOR,
    UNKNOWN_PROJECT_ID,
};
use rusqlite::params;
use std::sync::Once;

static INIT: Once = Once::new();

fn ensure_temp_db() {
    INIT.call_once(|| {
        let dir =
            std::env::temp_dir().join(format!("onetone-agent-mem-plan-a-{}", std::process::id()));
        let _ = std::fs::create_dir_all(&dir);
        let db = dir.join("agent-memory.sqlite3");
        std::env::set_var("ONETONE_AGENT_MEMORY_DB", &db);
    });
}

fn cand(external: &str, project: &str, m: ProjectMatch) -> SessionCandidate {
    SessionCandidate {
        provider: PROVIDER_CURSOR.into(),
        external_session_id: external.into(),
        project_id: project.into(),
        project_match: m.clone(),
        match_reason: "test".into(),
        match_confidence: match m {
            ProjectMatch::Exact => 0.9,
            ProjectMatch::Probable => 0.65,
            ProjectMatch::Unknown => 0.2,
        },
        started_at: Some(1),
        updated_at: Some(2),
        title: Some("t".into()),
        is_active: false,
        activity_source: "observed".into(),
        active_confidence: 0.0,
        workspace_evidence: None,
    }
}

#[test]
fn plan_a_acceptance_core() {
    ensure_temp_db();

    assert_eq!(
        source_ref_for_turn("c1", Some("b9"), Some(1), "user_turn_observed"),
        "c1:b9"
    );
    let a = source_ref_for_turn("c1", None, Some(42), "session_updated");
    let b = source_ref_for_turn("c1", None, Some(42), "session_updated");
    assert_eq!(a, b);

    // unknown → exact merge
    let sid1 = upsert_session_candidate(&cand("ext-E", UNKNOWN_PROJECT_ID, ProjectMatch::Unknown))
        .expect("insert unknown");
    let sid2 = upsert_session_candidate(&cand("ext-E", "proj_X", ProjectMatch::Exact))
        .expect("migrate exact");
    assert_eq!(sid1, sid2, "must update in place, not insert duplicate");

    let (n, project_id): (i64, String) = with_read_path(|conn| {
        let n: i64 = conn
            .query_row(
                "SELECT COUNT(1) FROM agent_sessions WHERE provider = ?1 AND external_session_id = ?2",
                params![PROVIDER_CURSOR, "ext-E"],
                |r| r.get(0),
            )
            .map_err(|e| e.to_string())?;
        let project_id: String = conn
            .query_row(
                "SELECT project_id FROM agent_sessions WHERE session_id = ?1",
                params![sid1],
                |r| r.get(0),
            )
            .map_err(|e| e.to_string())?;
        Ok((n, project_id))
    })
    .expect("read merge");
    assert_eq!(n, 1, "exactly one row for external id");
    assert_eq!(project_id, "proj_X");

    // observed does not change status + idempotent turn
    let sid =
        upsert_session_candidate(&cand("ext-O", "proj_O", ProjectMatch::Exact)).expect("session");
    let sref = source_ref_for_turn("ext-O", Some("bub1"), Some(99), "user_turn_observed");
    assert!(append_observed_event(
        &sid,
        PROVIDER_CURSOR,
        "user_turn_observed",
        &sref,
        99,
        "User turn observed",
    )
    .expect("append"));
    assert!(!append_observed_event(
        &sid,
        PROVIDER_CURSOR,
        "user_turn_observed",
        &sref,
        99,
        "User turn observed",
    )
    .expect("append idempotent"));

    let (status, event_n): (String, i64) = with_read_path(|conn| {
        let status: String = conn
            .query_row(
                "SELECT status FROM agent_sessions WHERE session_id = ?1",
                params![sid],
                |r| r.get(0),
            )
            .map_err(|e| e.to_string())?;
        let event_n: i64 = conn
            .query_row(
                "SELECT COUNT(1) FROM agent_events WHERE session_id = ?1 AND event_type = 'user_turn_observed'",
                params![sid],
                |r| r.get(0),
            )
            .map_err(|e| e.to_string())?;
        Ok((status, event_n))
    })
    .expect("read observed");
    assert_eq!(
        status, "discovered",
        "observed must not mutate lifecycle status"
    );
    assert_eq!(event_n, 1);

    let snap = build_agent_home_snapshot(None);
    let json = serde_json::to_value(&snap).expect("snapshot json");
    // Plan C adds these keys; observed-only path must keep them empty/null.
    assert!(
        json.get("checkpoint").map(|v| v.is_null()).unwrap_or(true),
        "observed-only must not invent a checkpoint"
    );
    assert_eq!(
        json.get("memories")
            .and_then(|v| v.as_array())
            .map(|a| a.len())
            .unwrap_or(0),
        0,
        "observed-only must not invent memories"
    );
}
