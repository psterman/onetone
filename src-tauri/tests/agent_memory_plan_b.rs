//! Plan B acceptance — lifecycle status machine + event projection.
//! Run: cargo test --manifest-path src-tauri/Cargo.toml --no-default-features --test agent_memory_plan_b

use onetone::agent_memory::{
    append_lifecycle_event, append_observed_event, append_ui_lifecycle, build_agent_home_snapshot,
    list_session_events, source_ref_for_turn, upsert_session_candidate, with_read_path,
    ProjectMatch, SessionCandidate, LIFECYCLE_SUMMARY_MAX, PROVIDER_CURSOR,
};
use rusqlite::params;
use std::sync::Once;

static INIT: Once = Once::new();

fn ensure_temp_db() {
    INIT.call_once(|| {
        let dir =
            std::env::temp_dir().join(format!("onetone-agent-mem-plan-b-{}", std::process::id()));
        let _ = std::fs::create_dir_all(&dir);
        let db = dir.join("agent-memory.sqlite3");
        std::env::set_var("ONETONE_AGENT_MEMORY_DB", &db);
    });
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
        title: Some("t".into()),
        is_active: true,
        activity_source: "observed".into(),
        active_confidence: 0.5,
        workspace_evidence: None,
    }
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

fn event_count(sid: &str) -> i64 {
    with_read_path(|conn| {
        conn.query_row(
            "SELECT COUNT(1) FROM agent_events WHERE session_id = ?1",
            params![sid],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())
    })
    .expect("count")
}

#[test]
fn plan_b_acceptance_core() {
    ensure_temp_db();

    let sid = upsert_session_candidate(&cand("ext-b1", "proj_b")).expect("session");

    // 1. observed does not change status
    let sref = source_ref_for_turn("ext-b1", Some("bub"), Some(10), "user_turn_observed");
    assert!(append_observed_event(
        &sid,
        PROVIDER_CURSOR,
        "user_turn_observed",
        &sref,
        10,
        "turn",
    )
    .expect("obs"));
    assert_eq!(status_of(&sid), "discovered");

    // 6. duplicate observed
    assert!(!append_observed_event(
        &sid,
        PROVIDER_CURSOR,
        "user_turn_observed",
        &sref,
        10,
        "turn",
    )
    .expect("obs idem"));

    // 2. lifecycle updates status
    assert!(append_lifecycle_event(
        &sid,
        PROVIDER_CURSOR,
        "task_started",
        "life|start|1",
        20,
        "started",
    )
    .expect("start"));
    assert_eq!(status_of(&sid), "running");

    // 4. pause then resume
    assert!(append_lifecycle_event(
        &sid,
        PROVIDER_CURSOR,
        "task_paused",
        "life|pause|1",
        30,
        "paused",
    )
    .expect("pause"));
    assert_eq!(status_of(&sid), "paused");
    assert!(append_lifecycle_event(
        &sid,
        PROVIDER_CURSOR,
        "task_resumed",
        "life|resume|1",
        40,
        "resumed",
    )
    .expect("resume"));
    assert_eq!(status_of(&sid), "running");

    let (events, _) = list_session_events(&sid, 50, None);
    let types: Vec<_> = events.iter().map(|e| e.event_type.as_str()).collect();
    assert!(types.contains(&"task_paused"));
    assert!(types.contains(&"task_resumed"));
    assert!(types.contains(&"task_started"));

    // 3. latestEvent and recentEvents[0] same event_id (snapshot)
    let snap = build_agent_home_snapshot(None);
    // may show unknown project sessions; find our session via events
    let (evs, _) = list_session_events(&sid, 5, None);
    assert!(!evs.is_empty());
    if let (Some(latest), Some(first)) = (snap.latest_event.as_ref(), snap.recent_events.first()) {
        // When snapshot picks our session as active/first
        if first.session_id == sid {
            assert_eq!(latest.event_id, first.event_id);
        }
    }
    // Direct projection check: first of list_session_events is latest for session
    assert_eq!(evs[0].event_type, "task_resumed");

    // 7. observed after lifecycle does not overwrite status
    let sref2 = source_ref_for_turn("ext-b1", Some("bub2"), Some(50), "user_turn_observed");
    assert!(append_observed_event(
        &sid,
        PROVIDER_CURSOR,
        "user_turn_observed",
        &sref2,
        50,
        "turn2",
    )
    .expect("obs2"));
    assert_eq!(status_of(&sid), "running");

    // 5. illegal transition
    assert!(append_lifecycle_event(
        &sid,
        PROVIDER_CURSOR,
        "task_completed",
        "life|done|1",
        60,
        "done",
    )
    .expect("complete"));
    assert_eq!(status_of(&sid), "completed");
    let before_n = event_count(&sid);
    let err = append_lifecycle_event(
        &sid,
        PROVIDER_CURSOR,
        "task_paused",
        "life|bad-pause|1",
        70,
        "bad",
    )
    .unwrap_err();
    assert!(
        err.contains("illegal_transition:completed->paused"),
        "err={err}"
    );
    assert_eq!(status_of(&sid), "completed");
    assert_eq!(event_count(&sid), before_n, "illegal must not insert event");

    // 8. pagination stable
    let (page1, complete1) = list_session_events(&sid, 2, None);
    assert_eq!(page1.len(), 2);
    assert!(!complete1);
    let before = page1.last().unwrap().timestamp;
    let (page2, _) = list_session_events(&sid, 2, Some(before));
    assert!(!page2.is_empty());
    assert!(page2.iter().all(|e| e.timestamp < before));
    // no overlap of event ids
    let ids1: std::collections::HashSet<_> = page1.iter().map(|e| &e.event_id).collect();
    for e in &page2 {
        assert!(!ids1.contains(&e.event_id));
    }

    // 9. re-read persists (same env DB path)
    let (again, _) = list_session_events(&sid, 200, None);
    assert!(again.len() >= 4);

    // 10. summary / illegal event_type rejected via append_ui_lifecycle
    let err_type = append_ui_lifecycle(&sid, PROVIDER_CURSOR, "not_a_real_event", "x").unwrap_err();
    assert!(err_type.contains("unknown lifecycle event_type"));

    let sid2 = upsert_session_candidate(&cand("ext-b2", "proj_b")).expect("s2");
    assert!(append_lifecycle_event(
        &sid2,
        PROVIDER_CURSOR,
        "task_started",
        "life|s2|start",
        1,
        "go",
    )
    .unwrap());
    let long: String = (0..LIFECYCLE_SUMMARY_MAX + 80).map(|_| 'y').collect();
    // truncate succeeds (not reject) for UI path — plan says reject OR truncate;
    // append_ui_lifecycle truncates then accepts.
    assert!(append_ui_lifecycle(&sid2, PROVIDER_CURSOR, "task_paused", &long).is_ok());
    // missing session
    let miss =
        append_ui_lifecycle("no-such-session", PROVIDER_CURSOR, "task_started", "x").unwrap_err();
    assert!(miss.contains("session_not_found"));

    // Plan C fields are present in the live tree; Plan B only cares that lifecycle
    // projection still works (checkpoint may exist after auto-pause checkpoint).
    let json = serde_json::to_value(&build_agent_home_snapshot(None)).unwrap();
    assert!(json.get("checkpoint").is_some());
    assert!(json.get("memories").is_some());
}
