//! Time Machine git self-check (lib has test=false).

use onetone::time_machine::{self, AgentContext, TmConfig};
use std::fs;
use std::path::Path;
use std::process::Command;

fn git_available() -> bool {
    Command::new("git")
        .arg("--version")
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

fn run_git(dir: &Path, args: &[&str]) {
    let st = Command::new("git")
        .args(args)
        .current_dir(dir)
        .status()
        .expect("git");
    assert!(st.success(), "git {:?} failed", args);
}

#[test]
fn create_restore_leaves_staging_unchanged() {
    if !git_available() {
        return;
    }
    let dir = std::env::temp_dir().join(format!(
        "onetone-tm-{}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_millis()
    ));
    let _ = fs::remove_dir_all(&dir);
    fs::create_dir_all(&dir).unwrap();
    run_git(&dir, &["init"]);
    run_git(&dir, &["config", "user.email", "tm@test"]);
    run_git(&dir, &["config", "user.name", "tm"]);
    fs::write(dir.join("a.txt"), "v1").unwrap();
    run_git(&dir, &["add", "a.txt"]);
    run_git(&dir, &["commit", "-m", "init"]);

    let ws = dir.to_string_lossy().to_string();
    let ctx = AgentContext::unknown();
    let a =
        time_machine::create(Some(&ws), "manual", Some("A".into()), ctx.clone()).expect("create A");
    fs::write(dir.join("a.txt"), "v2").unwrap();
    fs::write(dir.join("b.txt"), "new").unwrap();
    let _b =
        time_machine::create(Some(&ws), "manual", Some("B".into()), ctx.clone()).expect("create B");

    run_git(&dir, &["add", "a.txt"]);
    let staged_before = String::from_utf8_lossy(
        &Command::new("git")
            .args(["diff", "--cached", "--name-only"])
            .current_dir(&dir)
            .output()
            .unwrap()
            .stdout,
    )
    .to_string();

    let preview = time_machine::preview_restore(Some(&ws), &a.id).unwrap();
    assert_eq!(
        preview.overwrite_count, 1,
        "only the changed file is overwritten"
    );
    assert_eq!(preview.delete_count, 1, "the later-added file is deleted");
    let res = time_machine::restore(Some(&ws), &a.id, preview.delete_count, false, ctx)
        .expect("restore A");
    assert!(res.ok);

    let staged_after = String::from_utf8_lossy(
        &Command::new("git")
            .args(["diff", "--cached", "--name-only"])
            .current_dir(&dir)
            .output()
            .unwrap()
            .stdout,
    )
    .to_string();
    assert_eq!(staged_before, staged_after, "staging must be unchanged");

    let body = fs::read_to_string(dir.join("a.txt")).unwrap();
    assert_eq!(body, "v1");
    assert!(!dir.join("b.txt").exists(), "b.txt should be deleted");

    let _ = fs::remove_dir_all(&dir);
}

#[test]
fn scheduled_create_skips_clean_then_records_dirty_workspace() {
    if !git_available() {
        return;
    }
    let dir = std::env::temp_dir().join(format!(
        "onetone-tm-scheduled-{}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_millis()
    ));
    let _ = fs::remove_dir_all(&dir);
    fs::create_dir_all(&dir).unwrap();
    run_git(&dir, &["init"]);
    run_git(&dir, &["config", "user.email", "tm@test"]);
    run_git(&dir, &["config", "user.name", "tm"]);
    fs::write(dir.join("a.txt"), "v1").unwrap();
    run_git(&dir, &["add", "a.txt"]);
    run_git(&dir, &["commit", "-m", "init"]);

    let ws = dir.to_string_lossy().to_string();
    let clean = time_machine::create_scheduled(Some(&ws), AgentContext::unknown()).unwrap();
    assert!(!clean.created);
    assert_eq!(clean.skipped_reason.as_deref(), Some("unchanged"));
    assert!(time_machine::list(Some(&ws)).unwrap().is_empty());

    fs::write(dir.join("a.txt"), "v2").unwrap();
    let dirty = time_machine::create_scheduled(Some(&ws), AgentContext::unknown()).unwrap();
    assert!(dirty.created);
    assert_eq!(
        dirty.op.as_ref().map(|op| op.trigger_source.as_str()),
        Some("scheduled")
    );
    let ops = time_machine::list(Some(&ws)).unwrap();
    assert_eq!(ops.len(), 1);
    assert_eq!(ops[0].trigger_source, "scheduled");

    let clean_again = time_machine::create_scheduled(Some(&ws), AgentContext::unknown()).unwrap();
    assert!(!clean_again.created);
    assert_eq!(time_machine::list(Some(&ws)).unwrap().len(), 1);

    let _ = fs::remove_dir_all(&dir);
}

#[test]
fn autosave_config_json_round_trip() {
    let config = TmConfig {
        workspace_path: Some(r"C:\work\demo".into()),
        recent_workspace_paths: vec![r"C:\work\demo".into(), r"C:\work\other".into()],
        auto_save_enabled: false,
        auto_save_interval_min: 30,
        last_auto_save_at: Some("2026-08-01T09:30:00Z".into()),
        last_auto_save_at_by_workspace: std::collections::HashMap::from([(
            r"C:\work\demo".into(),
            "2026-08-01T09:30:00Z".into(),
        )]),
    };
    let json = serde_json::to_string(&config).unwrap();
    let loaded: TmConfig = serde_json::from_str(&json).unwrap();
    assert_eq!(loaded.workspace_path, config.workspace_path);
    assert_eq!(loaded.recent_workspace_paths, config.recent_workspace_paths);
    assert!(!loaded.auto_save_enabled);
    assert_eq!(loaded.auto_save_interval_min, 30);
    assert_eq!(loaded.last_auto_save_at, config.last_auto_save_at);
    assert_eq!(
        loaded.last_auto_save_at_by_workspace,
        config.last_auto_save_at_by_workspace
    );
}

#[test]
fn two_workspaces_do_not_leak_ops() {
    if !git_available() {
        return;
    }
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_millis();
    let a = std::env::temp_dir().join(format!("onetone-tm-a-{stamp}"));
    let b = std::env::temp_dir().join(format!("onetone-tm-b-{stamp}"));
    for dir in [&a, &b] {
        let _ = fs::remove_dir_all(dir);
        fs::create_dir_all(dir).unwrap();
        run_git(dir, &["init"]);
        run_git(dir, &["config", "user.email", "tm@test"]);
        run_git(dir, &["config", "user.name", "tm"]);
        fs::write(dir.join("note.txt"), "seed").unwrap();
        run_git(dir, &["add", "note.txt"]);
        run_git(dir, &["commit", "-m", "init"]);
    }

    let wa = a.to_string_lossy().to_string();
    let wb = b.to_string_lossy().to_string();
    let ctx = AgentContext {
        provider: "codex".into(),
        foreground_app: "Codex".into(),
        observed_at: "2026-08-01T12:00:00Z".into(),
        external_session_id: None,
        source: "test".into(),
        confidence: "low".into(),
    };
    let op_a = time_machine::create(Some(&wa), "manual", Some("A".into()), ctx.clone()).unwrap();
    fs::write(b.join("note.txt"), "b-changed").unwrap();
    let op_b = time_machine::create(Some(&wb), "manual", Some("B".into()), ctx).unwrap();

    let list_a = time_machine::list(Some(&wa)).unwrap();
    let list_b = time_machine::list(Some(&wb)).unwrap();
    assert_eq!(list_a.len(), 1);
    assert_eq!(list_b.len(), 1);
    assert_eq!(list_a[0].id, op_a.id);
    assert_eq!(list_b[0].id, op_b.id);
    assert_ne!(list_a[0].id, list_b[0].id);
    assert_eq!(list_a[0].agent_context.provider, "codex");

    let _ = fs::remove_dir_all(&a);
    let _ = fs::remove_dir_all(&b);
}

#[test]
fn preview_stays_fast_with_heavy_untracked_tree() {
    if !git_available() {
        return;
    }
    let dir = std::env::temp_dir().join(format!(
        "onetone-tm-heavy-{}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_millis()
    ));
    let _ = fs::remove_dir_all(&dir);
    fs::create_dir_all(&dir).unwrap();
    run_git(&dir, &["init"]);
    run_git(&dir, &["config", "user.email", "tm@test"]);
    run_git(&dir, &["config", "user.name", "tm"]);
    fs::write(dir.join(".gitignore"), "target/\n").unwrap();
    fs::write(dir.join("a.txt"), "v1").unwrap();
    run_git(&dir, &["add", "."]);
    run_git(&dir, &["commit", "-m", "init"]);

    let ws = dir.to_string_lossy().to_string();
    let ctx = AgentContext::unknown();
    let a = time_machine::create(Some(&ws), "manual", Some("A".into()), ctx).expect("create A");
    fs::write(dir.join("a.txt"), "v2").unwrap();
    fs::write(dir.join("new.txt"), "fresh").unwrap();

    // Simulate a huge ignored build tree — old preview path (`git add -A`) would crawl this.
    let heavy = dir.join("target").join("debug").join("deps");
    fs::create_dir_all(&heavy).unwrap();
    for i in 0..400 {
        fs::write(heavy.join(format!("blob-{i}.o")), vec![0u8; 64]).unwrap();
    }

    let started = std::time::Instant::now();
    let preview = time_machine::preview_restore(Some(&ws), &a.id).expect("preview");
    let elapsed = started.elapsed();
    assert!(
        elapsed.as_secs() < 5,
        "preview must stay interactive, took {elapsed:?}"
    );
    assert_eq!(preview.overwrite_count, 1, "a.txt changed");
    assert_eq!(preview.delete_count, 1, "new.txt is untracked vs A");
    assert!(
        !preview
            .delete_sample
            .iter()
            .any(|p| p.contains("target") || p.ends_with(".o")),
        "ignored build artifacts must not enter preview deletes"
    );

    let _ = fs::remove_dir_all(&dir);
}
