//! Integration tests for action_history (avoids broken lib test harness).

use onetone::action_history::{clear, record, stats_by_mapping, tail, ActionHistoryEntry};

fn isolate(name: &str) -> std::path::PathBuf {
    onetone::action_history::log::set_enabled(true);
    let ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    let path = std::env::temp_dir().join(format!("onetone-{name}-{ts}.jsonl"));
    onetone::action_history::log::set_log_path_override(Some(path.clone()));
    onetone::action_history::log::reset_for_test();
    path
}

fn finish(path: std::path::PathBuf) {
    clear();
    let _ = std::fs::remove_file(path);
    onetone::action_history::log::set_log_path_override(None);
    onetone::action_history::log::reset_for_test();
}

#[test]
fn append_tail_clear_and_channel_filter() {
    let path = isolate("action-history-it");

    record(ActionHistoryEntry::new(
        0,
        1000,
        "key",
        "semantic_action",
        "executed",
        "按键 · test",
    ));
    record(ActionHistoryEntry::new(
        0,
        2000,
        "voice",
        "voice_phrase",
        "executed",
        "语音 · wake",
    ));

    let all = tail(50, None, None, None, None);
    assert_eq!(all.entries.len(), 2);
    assert!(!all.has_more);

    let voice = tail(50, Some("voice"), None, None, None);
    assert_eq!(voice.entries.len(), 1);
    assert_eq!(voice.entries[0].channel, "voice");

    clear();
    assert!(tail(10, None, None, None, None).entries.is_empty());
    finish(path);
}

#[test]
fn mapping_filter_and_stats() {
    let path = isolate("action-history-stats");

    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_millis() as u64;
    let mut a = ActionHistoryEntry::new(0, now, "key", "semantic_action", "executed", "a");
    a.mapping_id = Some("map-a".into());
    record(a);
    let mut b = ActionHistoryEntry::new(0, now, "voice", "voice_phrase", "executed", "b");
    b.mapping_id = Some("map-a".into());
    record(b);
    let mut c = ActionHistoryEntry::new(0, now, "key", "send_key", "executed", "c");
    c.mapping_id = Some("map-b".into());
    record(c);

    assert_eq!(tail(50, None, Some("map-a"), None, None).entries.len(), 2);
    let stats = stats_by_mapping(Some(24));
    let row = stats
        .rows
        .iter()
        .find(|r| r.mapping_id == "map-a")
        .expect("map-a");
    assert_eq!(row.count, 2);
    assert!(row.per_day >= 1.0);

    finish(path);
}

#[test]
fn tail_hours_window() {
    let path = isolate("action-history-hours");

    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_millis() as u64;
    let old = now.saturating_sub(10 * 24 * 3600_000);
    record(ActionHistoryEntry::new(0, old, "key", "semantic_action", "executed", "old"));
    record(ActionHistoryEntry::new(0, now, "key", "semantic_action", "executed", "new"));

    assert_eq!(tail(50, None, None, None, Some(168)).entries.len(), 1);
    assert_eq!(tail(50, None, None, None, Some(168)).entries[0].summary, "new");
    assert_eq!(tail(50, None, None, None, None).entries.len(), 2);

    finish(path);
}

#[test]
fn analyze_prompt_builders() {
    use onetone::action_history::analyze::{
        build_chat_user_prompt, build_optimization_user_prompt, build_summary_user_prompt,
    };
    let entries = vec![ActionHistoryEntry::new(
        1,
        1000,
        "key",
        "semantic_action",
        "executed",
        "test",
    )];
    assert!(build_summary_user_prompt(&entries).contains("test"));
    assert!(build_chat_user_prompt("用了几次?", &entries).contains("用了几次?"));
    assert!(build_optimization_user_prompt(&entries).contains("优化建议"));
}
