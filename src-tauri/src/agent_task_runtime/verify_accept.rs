//! Per-task verify sandbox + backend acceptance evaluation.
//! FE localStorage must never grant editCapable.

use std::fs;
use std::path::{Path, PathBuf};

use rusqlite::Connection;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};

use super::providers;
use super::store::{
    self, bind_verify_sandbox_task, find_edit_acceptance, get_task, get_verify_sandbox,
    insert_verify_sandbox, list_events, update_task_bind, upsert_edit_acceptance, with_write,
    EditAcceptance, TaskRow, VerifySandboxRow, ACCEPT_SPEC_VERSION,
};

pub const EXPECTED_REL_PATH: &str = "scratch/hello.txt";
pub const EXPECTED_CONTENT: &str = "hello atr-verify\n";
pub const BASELINE_CONTENT: &str = "hello\n";

fn hex_sha256(bytes: &[u8]) -> String {
    let mut h = Sha256::new();
    h.update(bytes);
    format!("{:x}", h.finalize())
}

/// Stable config fingerprint — covers provider, model, account/key version.
/// Never returns or embeds raw secrets.
pub fn config_fingerprint(provider_id: &str) -> Option<(String, String)> {
    let id = providers::parse_provider_id(provider_id)?;
    if id == "workbuddy" {
        let acct = crate::workbuddy_local_llm::default_account()?;
        let model = acct.selected_model.trim();
        if model.is_empty() {
            return None;
        }
        // Reuse account key_fingerprint from WorkBuddy store (no raw key over IPC).
        let raw = format!(
            "wb|{}|{}|{}",
            acct.id.trim(),
            model,
            acct.key_fingerprint.trim()
        );
        return Some((model.to_string(), hex_sha256(raw.as_bytes())));
    }
    use crate::soft_pad_quota::SoftPadQuotaProvider;
    let p = SoftPadQuotaProvider::from_str(&id)?;
    let model = super::deepseek::soft_pad_model_id(p)?.to_string();
    let key = crate::soft_pad_quota::read_stored_key(p)?;
    let key_ver = hex_sha256(key.as_bytes());
    let raw = format!("softpad|{id}|{model}|{key_ver}");
    Some((model, hex_sha256(raw.as_bytes())))
}

fn canonicalize_path(p: &Path) -> PathBuf {
    fs::canonicalize(p).unwrap_or_else(|_| p.to_path_buf())
}

fn paths_equal(a: &Path, b: &Path) -> bool {
    let ca = canonicalize_path(a);
    let cb = canonicalize_path(b);
    ca == cb
        || ca.to_string_lossy().eq_ignore_ascii_case(&cb.to_string_lossy())
}

fn new_sandbox_id() -> String {
    // ms + task-id entropy — avoids same-millisecond collisions.
    let tid = store::new_task_id();
    let suffix = tid.rsplit('_').next().unwrap_or(&tid);
    format!("vs_{}_{suffix}", store::now_ms())
}

/// Create an isolated verify sandbox and register expected content (backend authority).
pub fn ensure_verify_sandbox() -> Result<Value, String> {
    let sandbox_id = new_sandbox_id();
    let root = crate::data_root::effective_data_root()
        .join("atr-verify")
        .join(&sandbox_id);
    let scratch = root.join("scratch");
    fs::create_dir_all(&scratch).map_err(|e| format!("mkdir sandbox: {e}"))?;
    let hello = scratch.join("hello.txt");
    fs::write(&hello, BASELINE_CONTENT).map_err(|e| format!("write baseline: {e}"))?;
    let _ = std::process::Command::new("git")
        .args(["init"])
        .current_dir(&root)
        .output();
    let _ = std::process::Command::new("git")
        .args(["add", "-A"])
        .current_dir(&root)
        .output();
    let _ = std::process::Command::new("git")
        .args(["-c", "user.email=atr@local", "-c", "user.name=atr", "commit", "-m", "baseline"])
        .current_dir(&root)
        .output();
    let abs = canonicalize_path(&root);
    let abs_s = abs.to_string_lossy().to_string();
    with_write(|conn| {
        insert_verify_sandbox(
            conn,
            &VerifySandboxRow {
                sandbox_id: sandbox_id.clone(),
                workspace_root: abs_s.clone(),
                expected_rel_path: EXPECTED_REL_PATH.into(),
                expected_content: EXPECTED_CONTENT.into(),
                bound_task_id: None,
                created_at: store::now_ms(),
            },
        )
    })?;
    Ok(json!({
        "sandboxId": sandbox_id,
        "workspaceRoot": abs_s,
        // Read-only echo for UI; evaluate uses registry, not FE-supplied values.
        "expectedRelPath": EXPECTED_REL_PATH,
        "expectedContent": EXPECTED_CONTENT,
    }))
}

/// Resolve sandbox registry for start — FE may only pass sandbox_id.
pub fn resolve_start_from_sandbox(
    conn: &Connection,
    sandbox_id: &str,
) -> Result<VerifySandboxRow, String> {
    let row = get_verify_sandbox(conn, sandbox_id)?
        .ok_or_else(|| "sandbox_not_found".to_string())?;
    if let Some(ref bound) = row.bound_task_id {
        if !bound.is_empty() {
            return Err("sandbox_already_bound".into());
        }
    }
    Ok(row)
}

pub fn claim_sandbox_for_task(
    conn: &Connection,
    sandbox_id: &str,
    task_id: &str,
) -> Result<(), String> {
    bind_verify_sandbox_task(conn, sandbox_id, task_id)
}

/// Gate real drives: verify sandbox task OR matching acceptance. Else edit_not_admitted.
pub fn assert_drive_admitted(
    conn: &Connection,
    task: &TaskRow,
    provider: &str,
) -> Result<(), String> {
    if task.verify_intent {
        let sid = task
            .sandbox_id
            .as_deref()
            .filter(|s| !s.is_empty())
            .ok_or_else(|| "edit_not_admitted".to_string())?;
        let sb = get_verify_sandbox(conn, sid)?.ok_or_else(|| "edit_not_admitted".to_string())?;
        match sb.bound_task_id.as_deref() {
            Some(b) if b == task.task_id => {}
            _ => return Err("edit_not_admitted".into()),
        }
        if !paths_equal(Path::new(&task.workspace_root), Path::new(&sb.workspace_root)) {
            return Err("edit_not_admitted".into());
        }
        return Ok(());
    }
    let want = providers::parse_provider_id(provider).ok_or_else(|| "unknown_provider".to_string())?;
    let (model, fp) =
        config_fingerprint(&want).ok_or_else(|| format!("{want}_unconfigured"))?;
    match find_edit_acceptance(conn, &want, &model, &fp)? {
        Some(_) => Ok(()),
        None => Err("edit_not_admitted".into()),
    }
}

/// Bind provider under ATR write lock. Rejects mismatch. Sets driver_kind from caller.
pub fn bind_provider_locked(
    conn: &Connection,
    task_id: &str,
    provider: &str,
    driver_kind: &str,
) -> Result<TaskRow, String> {
    let mut task = get_task(conn, task_id)?.ok_or_else(|| "task_not_found".to_string())?;
    let want = providers::parse_provider_id(provider).ok_or_else(|| "unknown_provider".to_string())?;
    if let Some(ref bound) = task.provider_id {
        if bound != &want {
            return Err(format!(
                "provider_mismatch: task bound to {bound}, drive requested {want}"
            ));
        }
        // Same provider — refuse switching driver_kind real↔fake after bind.
        if task.driver_kind != "unknown"
            && task.driver_kind != driver_kind
            && !task.driver_kind.is_empty()
        {
            return Err(format!(
                "driver_kind_mismatch: task is {}, drive is {driver_kind}",
                task.driver_kind
            ));
        }
        if task.driver_kind == "unknown" {
            task.driver_kind = driver_kind.into();
            update_task_bind(conn, &task)?;
        }
        return Ok(task);
    }
    let (model, fp) = config_fingerprint(&want)
        .ok_or_else(|| format!("{want}_unconfigured"))?;
    task.provider_id = Some(want);
    task.model_id = Some(model);
    task.config_fp = Some(fp);
    task.driver_kind = driver_kind.into();
    update_task_bind(conn, &task)?;
    Ok(task)
}

fn final_check_status(events: &[super::contracts::TaskEventDto]) -> &'static str {
    let mut saw_check = false;
    let mut last_ok: Option<bool> = None;
    let mut saw_fail = false;
    let mut repaired_after_fail = false;
    for e in events {
        let tool = e.tool_name.as_deref().unwrap_or("");
        let kind = e.kind.as_str();
        if tool == "run_check" && (kind == "tool_result" || kind == "tool_call") {
            saw_check = true;
            let res = e.payload.get("result").unwrap_or(&e.payload);
            if let Some(ok) = res.get("ok").and_then(|v| v.as_bool()) {
                last_ok = Some(ok);
                if !ok {
                    saw_fail = true;
                    repaired_after_fail = false;
                } else if saw_fail {
                    repaired_after_fail = true;
                }
            }
        }
        if saw_fail && (kind == "patch_applied" || tool == "apply_patch") {
            // repair activity after fail
            repaired_after_fail = repaired_after_fail || true;
        }
    }
    if !saw_check {
        return "not_required";
    }
    match last_ok {
        Some(true) if !saw_fail || repaired_after_fail => "passed",
        Some(true) => "passed",
        Some(false) => "failed",
        None => "not_required",
    }
}

/// Evaluate verify task; write acceptance only on strict pass.
pub fn evaluate_verify(task_id: &str) -> Result<Value, String> {
    with_write(|conn| evaluate_verify_conn(conn, task_id))
}

fn evaluate_verify_conn(conn: &Connection, task_id: &str) -> Result<Value, String> {
    let task = get_task(conn, task_id)?.ok_or_else(|| "task_not_found".to_string())?;
    let fail = |code: &str| {
        Ok(json!({
            "ok": false,
            "reason": code,
            "taskId": task_id,
            "editCapable": false,
        }))
    };
    if !task.verify_intent {
        return fail("not_verify_intent");
    }
    if task.driver_kind != "real" {
        return fail(if task.driver_kind == "fake" {
            "fake_driver"
        } else {
            "driver_unknown"
        });
    }
    if task.status != "done" {
        return fail("not_done");
    }
    let provider = task
        .provider_id
        .clone()
        .ok_or_else(|| "no_bound_provider".to_string())?;
    let model = task.model_id.clone().unwrap_or_default();
    let fp = task.config_fp.clone().unwrap_or_default();
    if provider.is_empty() || model.is_empty() || fp.is_empty() {
        return fail("incomplete_bind");
    }
    // Reject if account/key/model changed since bind.
    match config_fingerprint(&provider) {
        Some((cur_model, cur_fp)) if cur_model == model && cur_fp == fp => {}
        _ => return fail("config_drift"),
    }
    let sandbox_id = task.sandbox_id.clone().unwrap_or_default();
    if sandbox_id.is_empty() {
        return fail("no_sandbox_id");
    }
    let sb = match get_verify_sandbox(conn, &sandbox_id)? {
        Some(s) => s,
        None => return fail("sandbox_not_found"),
    };
    if sb.bound_task_id.as_deref() != Some(task_id) {
        return fail("sandbox_task_mismatch");
    }
    if !paths_equal(Path::new(&task.workspace_root), Path::new(&sb.workspace_root)) {
        return fail("not_sandbox");
    }
    // Registry is authority — never trust FE-supplied expected_* alone.
    let rel = sb.expected_rel_path.clone();
    let expected = sb.expected_content.clone();
    let events = list_events(conn, task_id)?;
    let mut wrote = false;
    for e in &events {
        if e.kind != "patch_applied" {
            continue;
        }
        let path = e
            .payload
            .get("path")
            .or_else(|| e.payload.get("result").and_then(|r| r.get("path")))
            .and_then(|v| v.as_str())
            .unwrap_or("");
        let norm = path.replace('\\', "/");
        if norm == rel || norm.ends_with(&format!("/{rel}")) || norm.ends_with(rel.as_str()) {
            wrote = true;
            break;
        }
    }
    if !wrote {
        return fail("no_write");
    }
    let file_path = Path::new(&task.workspace_root).join(&rel);
    let actual = fs::read_to_string(&file_path).map_err(|_| "missing_file".to_string())?;
    if actual != expected {
        return fail("wrong_content");
    }
    let check_status = final_check_status(&events);
    if check_status == "failed" {
        return fail("check_failed");
    }
    let row = EditAcceptance {
        provider_id: provider.clone(),
        model_id: model.clone(),
        config_fp: fp.clone(),
        accept_spec_version: ACCEPT_SPEC_VERSION,
        task_id: task_id.into(),
        sandbox_id: Some(sandbox_id),
        check_status: check_status.into(),
        created_at: store::now_ms(),
    };
    upsert_edit_acceptance(conn, &row)?;
    Ok(json!({
        "ok": true,
        "reason": "accepted",
        "taskId": task_id,
        "providerId": provider,
        "modelId": model,
        "acceptSpecVersion": ACCEPT_SPEC_VERSION,
        "checkStatus": check_status,
        "editCapable": true,
    }))
}

/// Overlay editCapable from acceptance table matched to current config fingerprint.
pub fn apply_acceptances_to_providers(providers: &mut [Value]) {
    let _ = with_write(|conn| {
        for p in providers.iter_mut() {
            let id = p.get("id").and_then(|v| v.as_str()).unwrap_or("").to_string();
            if id.is_empty() {
                continue;
            }
            let Some((model, fp)) = config_fingerprint(&id) else {
                p.as_object_mut().map(|o| {
                    o.insert("editCapable".into(), json!(false));
                    o.insert("locallyVerified".into(), json!(false));
                    o.insert("configFp".into(), Value::Null);
                });
                continue;
            };
            let hit = find_edit_acceptance(conn, &id, &model, &fp).ok().flatten();
            let ok = hit.is_some();
            if let Some(obj) = p.as_object_mut() {
                obj.insert("editCapable".into(), json!(ok));
                obj.insert("locallyVerified".into(), json!(ok));
                obj.insert("configFp".into(), json!(fp));
                obj.insert("modelId".into(), json!(model));
                if let Some(h) = hit {
                    obj.insert("acceptTaskId".into(), json!(h.task_id));
                    obj.insert("acceptCheckStatus".into(), json!(h.check_status));
                }
            }
        }
        Ok(())
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    use super::store::set_test_db_path;
    use crate::agent_task_runtime::contracts::TaskEventDto;

    #[test]
    fn isolated_sandboxes_differ() {
        let a = ensure_verify_sandbox().unwrap();
        let b = ensure_verify_sandbox().unwrap();
        assert_ne!(a["sandboxId"], b["sandboxId"]);
        assert_ne!(a["workspaceRoot"], b["workspaceRoot"]);
    }

    #[test]
    fn final_check_allows_repair() {
        let events = vec![
            TaskEventDto {
                event_id: "e1".into(),
                task_id: "t".into(),
                seq: 1,
                kind: "tool_result".into(),
                turn: 1,
                tool_name: Some("run_check".into()),
                payload: json!({"result":{"ok":false}}),
                created_at: 1,
            },
            TaskEventDto {
                event_id: "e2".into(),
                task_id: "t".into(),
                seq: 2,
                kind: "patch_applied".into(),
                turn: 2,
                tool_name: Some("apply_patch".into()),
                payload: json!({"path":"scratch/hello.txt"}),
                created_at: 2,
            },
            TaskEventDto {
                event_id: "e3".into(),
                task_id: "t".into(),
                seq: 3,
                kind: "tool_result".into(),
                turn: 3,
                tool_name: Some("run_check".into()),
                payload: json!({"result":{"ok":true}}),
                created_at: 3,
            },
        ];
        assert_eq!(final_check_status(&events), "passed");
    }

    #[test]
    fn final_check_not_required_when_absent() {
        assert_eq!(final_check_status(&[]), "not_required");
    }

    #[test]
    fn bind_rejects_provider_mismatch() {
        let db = std::env::temp_dir().join(format!("atr_bind_{}.sqlite3", std::process::id()));
        let _ = fs::remove_file(&db);
        set_test_db_path(Some(db.clone()));
        with_write(|conn| {
            let now = store::now_ms();
            let mut task = TaskRow {
                task_id: "tb1".into(),
                goal: "g".into(),
                workspace_root: "/tmp".into(),
                permission_mode: "write_with_approval".into(),
                status: "running".into(),
                waiting_reason: None,
                current_turn: 0,
                tool_call_count: 0,
                changed_files_json: "[]".into(),
                baseline_dirty_json: "[]".into(),
                pending_approval_token: None,
                pending_patch_json: None,
                fingerprints_json: "{}".into(),
                checkpoint_id: None,
                last_error: None,
                repair_count: 0,
                format_retry_count: 0,
                applied_tokens_json: "[]".into(),
                created_at: now,
                updated_at: now,
                provider_id: Some("deepseek".into()),
                model_id: Some("m".into()),
                config_fp: Some("fp".into()),
                driver_kind: "real".into(),
                verify_intent: false,
                sandbox_id: None,
                expected_rel_path: None,
                expected_content: None,
            };
            store::insert_task(conn, &task)?;
            let err = bind_provider_locked(conn, "tb1", "workbuddy", "real").unwrap_err();
            assert!(err.contains("provider_mismatch"), "{err}");
            // same provider ok
            task = bind_provider_locked(conn, "tb1", "deepseek", "real")?;
            assert_eq!(task.provider_id.as_deref(), Some("deepseek"));
            Ok(())
        })
        .unwrap();
        set_test_db_path(None);
        let _ = fs::remove_file(&db);
    }

    fn tmp_db(tag: &str) -> PathBuf {
        let db = std::env::temp_dir().join(format!(
            "atr_admit_{tag}_{}.sqlite3",
            std::process::id()
        ));
        let _ = fs::remove_file(&db);
        db
    }

    fn sample_task(id: &str, verify: bool, sandbox: Option<&str>, root: &str) -> TaskRow {
        let now = store::now_ms();
        TaskRow {
            task_id: id.into(),
            goal: "g".into(),
            workspace_root: root.into(),
            permission_mode: "write_with_approval".into(),
            status: "running".into(),
            waiting_reason: None,
            current_turn: 0,
            tool_call_count: 0,
            changed_files_json: "[]".into(),
            baseline_dirty_json: "[]".into(),
            pending_approval_token: None,
            pending_patch_json: None,
            fingerprints_json: "{}".into(),
            checkpoint_id: None,
            last_error: None,
            repair_count: 0,
            format_retry_count: 0,
            applied_tokens_json: "[]".into(),
            created_at: now,
            updated_at: now,
            provider_id: None,
            model_id: None,
            config_fp: None,
            driver_kind: "unknown".into(),
            verify_intent: verify,
            sandbox_id: sandbox.map(|s| s.into()),
            expected_rel_path: None,
            expected_content: None,
        }
    }

    #[test]
    fn drive_admit_rejects_without_acceptance() {
        let db = tmp_db("noacc");
        set_test_db_path(Some(db.clone()));
        let _ = crate::soft_pad_quota::set_stored_key(
            crate::soft_pad_quota::SoftPadQuotaProvider::DeepSeek,
            "sk-testkey123456",
        );
        with_write(|conn| {
            let task = sample_task("t_noacc", false, None, "/tmp/proj");
            store::insert_task(conn, &task)?;
            let err = assert_drive_admitted(conn, &task, "deepseek").unwrap_err();
            assert_eq!(err, "edit_not_admitted");
            Ok(())
        })
        .unwrap();
        set_test_db_path(None);
        let _ = fs::remove_file(&db);
    }

    #[test]
    fn drive_admit_allows_matching_acceptance() {
        let db = tmp_db("acc");
        set_test_db_path(Some(db.clone()));
        let _ = crate::soft_pad_quota::set_stored_key(
            crate::soft_pad_quota::SoftPadQuotaProvider::DeepSeek,
            "sk-testkey123456",
        );
        let (model, fp) = config_fingerprint("deepseek").expect("fp");
        with_write(|conn| {
            let task = sample_task("t_acc", false, None, "/tmp/proj");
            store::insert_task(conn, &task)?;
            upsert_edit_acceptance(
                conn,
                &EditAcceptance {
                    provider_id: "deepseek".into(),
                    model_id: model,
                    config_fp: fp,
                    accept_spec_version: ACCEPT_SPEC_VERSION,
                    task_id: "prior".into(),
                    sandbox_id: Some("vs_x".into()),
                    check_status: "passed".into(),
                    created_at: store::now_ms(),
                },
            )?;
            assert_drive_admitted(conn, &task, "deepseek")?;
            Ok(())
        })
        .unwrap();
        set_test_db_path(None);
        let _ = fs::remove_file(&db);
    }

    #[test]
    fn sandbox_start_ignores_fe_forged_expected_and_rejects_double_bind() {
        let db = tmp_db("forge");
        set_test_db_path(Some(db.clone()));
        let sb = ensure_verify_sandbox().unwrap();
        let sid = sb["sandboxId"].as_str().unwrap().to_string();
        let root = sb["workspaceRoot"].as_str().unwrap().to_string();

        let dto = crate::agent_task_runtime::api_start(crate::agent_task_runtime::StartTaskRequest {
            goal: "verify".into(),
            workspace_root: "/forged/wrong/root".into(),
            permission_mode: Some("write_with_approval".into()),
            materials_summary: None,
            use_fake_driver: true,
            verify_intent: false, // FE lie — backend forces true via registry
            sandbox_id: Some(sid.clone()),
            expected_rel_path: Some("forged.txt".into()),
            expected_content: Some("forged".into()),
        })
        .unwrap();
        assert!(dto.verify_intent);
        assert_eq!(dto.sandbox_id.as_deref(), Some(sid.as_str()));
        assert_eq!(dto.expected_rel_path.as_deref(), Some(EXPECTED_REL_PATH));
        assert_eq!(dto.expected_content.as_deref(), Some(EXPECTED_CONTENT));
        assert!(
            paths_equal(Path::new(&dto.workspace_root), Path::new(&root)),
            "workspace forced from registry"
        );

        let err = crate::agent_task_runtime::api_start(crate::agent_task_runtime::StartTaskRequest {
            goal: "second".into(),
            workspace_root: root,
            permission_mode: None,
            materials_summary: None,
            use_fake_driver: true,
            verify_intent: true,
            sandbox_id: Some(sid),
            expected_rel_path: None,
            expected_content: None,
        })
        .unwrap_err();
        assert!(
            err.contains("sandbox_already_bound") || err.contains("sandbox_not_found"),
            "{err}"
        );

        set_test_db_path(None);
        let _ = fs::remove_file(&db);
    }

    #[test]
    fn evaluate_reports_config_drift() {
        let db = tmp_db("drift");
        set_test_db_path(Some(db.clone()));
        let _ = crate::soft_pad_quota::set_stored_key(
            crate::soft_pad_quota::SoftPadQuotaProvider::DeepSeek,
            "sk-testkey123456",
        );
        let sb = ensure_verify_sandbox().unwrap();
        let sid = sb["sandboxId"].as_str().unwrap().to_string();
        let root = sb["workspaceRoot"].as_str().unwrap().to_string();
        let dto = crate::agent_task_runtime::api_start(crate::agent_task_runtime::StartTaskRequest {
            goal: "verify".into(),
            workspace_root: root.clone(),
            permission_mode: Some("write_with_approval".into()),
            materials_summary: None,
            use_fake_driver: false,
            verify_intent: true,
            sandbox_id: Some(sid.clone()),
            expected_rel_path: None,
            expected_content: None,
        })
        .unwrap();

        with_write(|conn| {
            let mut task = get_task(conn, &dto.task_id)?.unwrap();
            task.status = "done".into();
            task.driver_kind = "real".into();
            task.provider_id = Some("deepseek".into());
            task.model_id = Some("deepseek-chat".into());
            task.config_fp = Some("stale_fingerprint".into());
            task.verify_intent = true;
            task.sandbox_id = Some(sid);
            store::update_task_bind(conn, &task)?;
            // also flip status via raw update used by update_task_bind fields only —
            // status needs append_event path; force via SQL for unit test.
            conn.execute(
                "UPDATE agent_tasks SET status='done', driver_kind='real' WHERE task_id=?1",
                rusqlite::params![dto.task_id],
            )
            .map_err(|e| e.to_string())?;
            Ok(())
        })
        .unwrap();

        let out = evaluate_verify(&dto.task_id).unwrap();
        assert_eq!(out["ok"], false);
        assert_eq!(out["reason"], "config_drift");

        set_test_db_path(None);
        let _ = fs::remove_file(&db);
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn sandbox_ids_unique_same_ms_burst() {
        let db = tmp_db("burst");
        set_test_db_path(Some(db.clone()));
        let mut ids = std::collections::HashSet::new();
        for _ in 0..8 {
            let v = ensure_verify_sandbox().unwrap();
            assert!(ids.insert(v["sandboxId"].as_str().unwrap().to_string()));
        }
        set_test_db_path(None);
        let _ = fs::remove_file(&db);
    }
}
