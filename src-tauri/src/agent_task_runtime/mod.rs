//! Agent Task Runtime — single-agent controlled tool loop with event sourcing.
//! assist_runtime remains task_organize only.

mod cancel;
mod check_registry;
mod contracts;
mod deepseek;
mod engine;
mod parse;
mod prompts;
mod providers;
mod resume;
mod scope;
mod store;
mod tools;
mod workbuddy;

pub use contracts::{
    ApprovePatchRequest, PermissionMode, StartTaskRequest, SubmitUserInputRequest, TaskDto,
    TaskEventDto, TaskIdRequest, TaskStatus,
};
pub use deepseek::deepseek_ready;
pub use engine::{
    after_approve_check_steps, after_approve_repair_then_ok_steps, apply_only_fake_steps,
    apply_without_read_fake_steps, classify_drive_failure, create_file_fake_steps,
    export_desktop_fake_steps, happy_path_fake_steps, FakeDriver, ModelDriver,
};
pub use providers::{parse_provider_id, probe_workbuddy_edit, provider_ready_snapshot};
pub use resume::{abandon_task, on_process_start, resume_task};

use engine::{approve_patch as eng_approve, reject_patch as eng_reject, start_task, StartOpts};
use store::{get_task, list_events, with_conn_at, with_write};

/// Boot hook — mark in-flight tasks interrupted.
pub fn boot() {
    let _ = with_write(|conn| on_process_start(conn));
}

pub fn api_start(req: StartTaskRequest) -> Result<TaskDto, String> {
    let mode = req
        .permission_mode
        .as_deref()
        .and_then(PermissionMode::parse)
        .unwrap_or(PermissionMode::WriteWithApproval);
    let root = std::path::PathBuf::from(req.workspace_root.trim());
    with_write(|conn| {
        let task = start_task(
            conn,
            StartOpts {
                goal: req.goal,
                workspace_root: root,
                permission_mode: mode,
                materials_summary: req.materials_summary.unwrap_or_default(),
            },
        )?;
        let _ = req.use_fake_driver;
        Ok(task.to_dto())
    })
}

pub fn api_status(task_id: &str) -> Result<TaskDto, String> {
    with_write(|conn| {
        get_task(conn, task_id)?
            .map(|t| t.to_dto())
            .ok_or_else(|| "not_found".into())
    })
}

pub fn api_events(task_id: &str) -> Result<Vec<TaskEventDto>, String> {
    with_write(|conn| list_events(conn, task_id))
}

pub fn api_cancel(task_id: &str) -> Result<TaskDto, String> {
    cancel::cancel(task_id);
    with_write(|conn| {
        let mut task = get_task(conn, task_id)?.ok_or("not_found")?;
        if task.status == TaskStatus::Running.as_str()
            || task.status == TaskStatus::Verifying.as_str()
            || task.status == TaskStatus::Repair.as_str()
        {
            task.status = TaskStatus::Cancelled.as_str().into();
            let ev = store::append_event_and_update_task(
                conn,
                &task,
                "cancelled",
                None,
                serde_json::json!({}),
            )?;
            let updated = get_task(conn, task_id)?.ok_or("not_found")?;
            engine::sync_memory_checkpoint(&updated, Some(&ev.event_id));
            cancel::finish(task_id);
            return Ok(updated.to_dto());
        }
        get_task(conn, task_id)?
            .map(|t| t.to_dto())
            .ok_or_else(|| "not_found".into())
    })
}

pub fn api_approve(req: ApprovePatchRequest) -> Result<TaskDto, String> {
    with_write(|conn| {
        eng_approve(
            conn,
            &req.task_id,
            &req.approval_token,
            req.persist_autonomous,
        )
        .map(|t| t.to_dto())
    })
}

pub fn api_reject(req: ApprovePatchRequest) -> Result<TaskDto, String> {
    with_write(|conn| eng_reject(conn, &req.task_id, &req.approval_token).map(|t| t.to_dto()))
}

pub fn api_submit_user_input(req: SubmitUserInputRequest) -> Result<TaskDto, String> {
    with_write(|conn| {
        engine::submit_user_input(conn, &req.task_id, &req.text).map(|t| t.to_dto())
    })
}

pub fn api_resume(task_id: &str) -> Result<TaskDto, String> {
    with_write(|conn| resume_task(conn, task_id).map(|t| t.to_dto()))
}

pub fn api_abandon(task_id: &str) -> Result<TaskDto, String> {
    with_write(|conn| abandon_task(conn, task_id).map(|t| t.to_dto()))
}

/// Drive until idle; releases ATR DB write lock between model turns.
pub fn api_drive_fake(task_id: &str, driver: &mut FakeDriver) -> Result<TaskDto, String> {
    drive_releasing(task_id, driver, None)
}

pub fn api_drive_deepseek(task_id: &str) -> Result<TaskDto, String> {
    api_drive(task_id, "deepseek", None)
}

/// Drive with Soft Pad / WorkBuddy provider id.
/// `max_steps`: `None` = until idle; `Some(n)` = at most n tool turns then return (may still be running).
pub fn api_drive(
    task_id: &str,
    provider: &str,
    max_steps: Option<u32>,
) -> Result<TaskDto, String> {
    let mut driver = providers::make_driver(provider)?;
    drive_releasing(task_id, driver.as_mut(), max_steps)
}

fn drive_releasing(
    task_id: &str,
    driver: &mut dyn ModelDriver,
    max_steps: Option<u32>,
) -> Result<TaskDto, String> {
    let mut recent = String::new();
    let mut steps = 0u32;
    loop {
        let cancel_tok = cancel::get(task_id).unwrap_or_else(cancel::TaskCancel::new);
        if cancel_tok.is_cancelled() {
            return with_write(|conn| {
                engine::mark_cancelled_public(conn, task_id).map(|t| t.to_dto())
            });
        }

        let prep = with_write(|conn| engine::prep_turn(conn, task_id, &recent))?;
        let Some(prep) = prep else {
            return with_write(|conn| {
                let task = get_task(conn, task_id)?.ok_or_else(|| "task_not_found".to_string())?;
                if task.current_turn >= contracts::MAX_TURNS
                    && !is_idle(&task.status)
                {
                    return engine::fail_task_public(conn, task_id, "max_turns").map(|t| t.to_dto());
                }
                Ok(task.to_dto())
            });
        };

        // Model call OUTSIDE write lock.
        let raw = match driver.next_tool_json(&prep.task, &prep.messages) {
            Ok(s) => s,
            Err(e) => {
                return with_write(|conn| {
                    engine::fail_task_public(conn, task_id, &e).map(|t| t.to_dto())
                });
            }
        };

        if cancel_tok.is_cancelled() {
            return with_write(|conn| {
                engine::mark_cancelled_public(conn, task_id).map(|t| t.to_dto())
            });
        }

        let updated = with_write(|conn| {
            engine::apply_raw_tool_turn(conn, task_id, &raw, &mut recent)
        })?;

        steps = steps.saturating_add(1);
        if is_idle(&updated.status) {
            return Ok(updated.to_dto());
        }
        if max_steps.map(|m| steps >= m).unwrap_or(false) {
            return Ok(updated.to_dto());
        }
    }
}

fn is_idle(status: &str) -> bool {
    matches!(
        status,
        "waiting" | "done" | "failed" | "cancelled" | "interrupted"
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn tmp_db() -> std::path::PathBuf {
        let p = std::env::temp_dir().join(format!(
            "atr_mod_{}_{}.sqlite3",
            std::process::id(),
            now_stamp()
        ));
        let _ = fs::remove_file(&p);
        p
    }

    fn now_stamp() -> u64 {
        store::now_ms()
    }

    fn prep_ws() -> (std::path::PathBuf, String) {
        let root =
            std::env::temp_dir().join(format!("atr_ws_{}_{}", std::process::id(), now_stamp()));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(&root).unwrap();
        let file = root.join("hello.txt");
        fs::write(&file, "hello\n").unwrap();
        let _ = std::process::Command::new("git")
            .args(["init"])
            .current_dir(&root)
            .output();
        (root, "hello.txt".into())
    }

    fn git_commit_all(root: &std::path::Path) {
        let _ = std::process::Command::new("git")
            .args(["add", "-A"])
            .current_dir(root)
            .output();
        let _ = std::process::Command::new("git")
            .args([
                "-c",
                "user.email=t@t",
                "-c",
                "user.name=t",
                "commit",
                "-m",
                "i",
            ])
            .current_dir(root)
            .output();
    }

    #[test]
    fn slice_a_happy_path_with_approval_and_check() {
        let db = tmp_db();
        store::set_test_db_path(Some(db.clone()));
        let (root, rel) = prep_ws();
        git_commit_all(&root);

        let dto = api_start(StartTaskRequest {
            goal: "change greeting".into(),
            workspace_root: root.display().to_string(),
            permission_mode: Some("write_with_approval".into()),
            materials_summary: Some("hello.txt".into()),
            use_fake_driver: true,
        })
        .unwrap();
        assert_eq!(dto.status, "running");
        assert!(dto.checkpoint_id.is_some(), "must bind memory checkpoint");
        let ckpt_id = dto.checkpoint_id.clone().unwrap();
        assert!(crate::agent_memory::get_checkpoint(&ckpt_id).is_some());

        let mut driver = happy_path_fake_steps(&rel, "hello world\n");
        let waiting = api_drive_fake(&dto.task_id, &mut driver).unwrap();
        assert_eq!(waiting.status, "waiting");
        assert_eq!(waiting.checkpoint_id.as_deref(), Some(ckpt_id.as_str()));
        let token = waiting.pending_approval_token.clone().unwrap();

        let events = api_events(&dto.task_id).unwrap();
        assert!(events.iter().any(|e| e.kind == "waiting_approval"));
        assert!(waiting.changed_files.is_empty());

        let after = api_approve(ApprovePatchRequest {
            task_id: dto.task_id.clone(),
            approval_token: token.clone(),
            persist_autonomous: false,
        })
        .unwrap();
        assert_eq!(after.status, "verifying");
        assert_eq!(after.checkpoint_id.as_deref(), Some(ckpt_id.as_str()));

        let again = api_approve(ApprovePatchRequest {
            task_id: dto.task_id.clone(),
            approval_token: token,
            persist_autonomous: false,
        })
        .unwrap();
        assert_eq!(again.changed_files, after.changed_files);

        let mut check = after_approve_check_steps("noop_ok");
        let done = api_drive_fake(&dto.task_id, &mut check).unwrap();
        assert_eq!(done.status, "done");
        assert_eq!(done.checkpoint_id.as_deref(), Some(ckpt_id.as_str()));
        let mem = crate::agent_memory::get_checkpoint(&ckpt_id).unwrap();
        assert_eq!(mem.status, "done");

        let content = fs::read_to_string(root.join("hello.txt")).unwrap();
        assert_eq!(content, "hello world\n");

        with_conn_at(&db, |conn| {
            let replayed = store::replay_status(conn, &dto.task_id)?;
            assert_eq!(replayed, "done");
            Ok(())
        })
        .unwrap();

        store::set_test_db_path(None);
        let _ = fs::remove_dir_all(&root);
        let _ = fs::remove_file(&db);
    }

    #[test]
    fn reject_patch_keeps_task_running() {
        let db = tmp_db();
        store::set_test_db_path(Some(db.clone()));
        let (root, rel) = prep_ws();
        git_commit_all(&root);
        let dto = api_start(StartTaskRequest {
            goal: "reject me".into(),
            workspace_root: root.display().to_string(),
            permission_mode: Some("write_with_approval".into()),
            materials_summary: None,
            use_fake_driver: true,
        })
        .unwrap();
        let ckpt_id = dto.checkpoint_id.clone().unwrap();
        let mut driver = happy_path_fake_steps(&rel, "nope\n");
        let waiting = api_drive_fake(&dto.task_id, &mut driver).unwrap();
        let token = waiting.pending_approval_token.unwrap();
        let rejected = api_reject(ApprovePatchRequest {
            task_id: dto.task_id.clone(),
            approval_token: token,
            persist_autonomous: false,
        })
        .unwrap();
        assert_eq!(rejected.status, "running");
        assert!(rejected.pending_approval_token.is_none());
        assert_eq!(rejected.checkpoint_id.as_deref(), Some(ckpt_id.as_str()));
        let content = fs::read_to_string(root.join("hello.txt")).unwrap();
        assert_eq!(content, "hello\n");
        let mem = crate::agent_memory::get_checkpoint(&ckpt_id).unwrap();
        assert_eq!(mem.status, "running");
        store::set_test_db_path(None);
        let _ = fs::remove_dir_all(&root);
        let _ = fs::remove_file(&db);
    }

    #[test]
    fn same_checkpoint_id_across_waiting_approve_done() {
        let db = tmp_db();
        store::set_test_db_path(Some(db.clone()));
        let (root, rel) = prep_ws();
        git_commit_all(&root);
        let dto = api_start(StartTaskRequest {
            goal: "same ckpt".into(),
            workspace_root: root.display().to_string(),
            permission_mode: Some("write_with_approval".into()),
            materials_summary: None,
            use_fake_driver: true,
        })
        .unwrap();
        let ckpt = dto.checkpoint_id.clone().unwrap();
        let mut driver = happy_path_fake_steps(&rel, "v\n");
        let waiting = api_drive_fake(&dto.task_id, &mut driver).unwrap();
        assert_eq!(waiting.checkpoint_id.as_deref(), Some(ckpt.as_str()));
        let wmem = crate::agent_memory::get_checkpoint(&ckpt).unwrap();
        assert_eq!(wmem.status, "waiting");
        let after = api_approve(ApprovePatchRequest {
            task_id: dto.task_id.clone(),
            approval_token: waiting.pending_approval_token.unwrap(),
            persist_autonomous: false,
        })
        .unwrap();
        assert_eq!(after.checkpoint_id.as_deref(), Some(ckpt.as_str()));
        let mut check = after_approve_check_steps("noop_ok");
        let done = api_drive_fake(&dto.task_id, &mut check).unwrap();
        assert_eq!(done.checkpoint_id.as_deref(), Some(ckpt.as_str()));
        let dmem = crate::agent_memory::get_checkpoint(&ckpt).unwrap();
        assert_eq!(dmem.status, "done");
        store::set_test_db_path(None);
        let _ = fs::remove_dir_all(&root);
        let _ = fs::remove_file(&db);
    }

    #[test]
    fn path_escape_and_unknown_check_and_stale_token() {
        let db = tmp_db();
        store::set_test_db_path(Some(db.clone()));
        let (root, rel) = prep_ws();
        git_commit_all(&root);

        let dto = api_start(StartTaskRequest {
            goal: "x".into(),
            workspace_root: root.display().to_string(),
            permission_mode: Some("write_with_approval".into()),
            materials_summary: None,
            use_fake_driver: true,
        })
        .unwrap();

        let mut escape = FakeDriver {
            steps: vec![r#"{"tool":"read_file","arguments":{"path":"../secret"}}"#.into()],
            idx: 0,
        };
        let _ = api_drive_fake(&dto.task_id, &mut escape).unwrap();
        let events = api_events(&dto.task_id).unwrap();
        assert!(events.iter().any(|e| e.kind == "tool_error"));

        let dto2 = api_start(StartTaskRequest {
            goal: "y".into(),
            workspace_root: root.display().to_string(),
            permission_mode: Some("write_with_approval".into()),
            materials_summary: None,
            use_fake_driver: true,
        })
        .unwrap();
        let mut bad = FakeDriver {
            steps: vec![
                format!(r#"{{"tool":"read_file","arguments":{{"path":"{rel}"}}}}"#),
                r#"{"tool":"run_check","arguments":{"check_id":"rm_rf"}}"#.into(),
            ],
            idx: 0,
        };
        let _ = api_drive_fake(&dto2.task_id, &mut bad).unwrap();
        let ev2 = api_events(&dto2.task_id).unwrap();
        assert!(ev2.iter().any(|e| e.kind == "tool_error"));

        let mut drv = happy_path_fake_steps(&rel, "v2\n");
        let dto3 = api_start(StartTaskRequest {
            goal: "z".into(),
            workspace_root: root.display().to_string(),
            permission_mode: Some("write_with_approval".into()),
            materials_summary: None,
            use_fake_driver: true,
        })
        .unwrap();
        let waiting = api_drive_fake(&dto3.task_id, &mut drv).unwrap();
        let token = waiting.pending_approval_token.unwrap();
        fs::write(root.join(&rel), "external\n").unwrap();
        let res = api_approve(ApprovePatchRequest {
            task_id: dto3.task_id.clone(),
            approval_token: token,
            persist_autonomous: false,
        })
        .unwrap();
        assert!(res.last_error.is_some() || res.status == "running");

        store::set_test_db_path(None);
        let _ = fs::remove_dir_all(&root);
        let _ = fs::remove_file(&db);
    }

    #[test]
    fn interrupt_on_boot_and_resume_reinspect() {
        let db = tmp_db();
        store::set_test_db_path(Some(db.clone()));
        let (root, _) = prep_ws();
        let dto = api_start(StartTaskRequest {
            goal: "boot".into(),
            workspace_root: root.display().to_string(),
            permission_mode: Some("read_only".into()),
            materials_summary: None,
            use_fake_driver: true,
        })
        .unwrap();
        with_write(|conn| {
            let n = on_process_start(conn)?;
            assert!(n >= 1);
            Ok(())
        })
        .unwrap();
        let st = api_status(&dto.task_id).unwrap();
        assert_eq!(st.status, "interrupted");
        if let Some(cid) = st.checkpoint_id.as_deref() {
            let mem = crate::agent_memory::get_checkpoint(cid).unwrap();
            assert_eq!(mem.status, "interrupted");
            assert!(mem.next_action.as_deref().is_some());
        }

        let resumed = api_resume(&dto.task_id).unwrap();
        assert!(resumed.status == "running" || resumed.status == "interrupted");
        let ev = api_events(&dto.task_id).unwrap();
        assert!(ev.iter().any(|e| e.kind == "resumed_inspect"));

        store::set_test_db_path(None);
        let _ = fs::remove_dir_all(&root);
        let _ = fs::remove_file(&db);
    }

    #[test]
    fn cancel_stops_further_driver_steps() {
        let db = tmp_db();
        store::set_test_db_path(Some(db.clone()));
        let (root, _) = prep_ws();
        let dto = api_start(StartTaskRequest {
            goal: "cancel".into(),
            workspace_root: root.display().to_string(),
            permission_mode: Some("read_only".into()),
            materials_summary: None,
            use_fake_driver: true,
        })
        .unwrap();
        cancel::cancel(&dto.task_id);
        let mut drv = FakeDriver {
            steps: vec![
                r#"{"tool":"inspect_workspace","arguments":{}}"#.into(),
                r#"{"tool":"inspect_workspace","arguments":{}}"#.into(),
            ],
            idx: 0,
        };
        let out = api_drive_fake(&dto.task_id, &mut drv).unwrap();
        assert_eq!(out.status, "cancelled");

        store::set_test_db_path(None);
        let _ = fs::remove_dir_all(&root);
        let _ = fs::remove_file(&db);
    }

    #[test]
    fn deepseek_ready_is_bool() {
        let _ = deepseek_ready();
    }

    #[test]
    fn provider_ready_lists_soft_pad_and_workbuddy() {
        let v = provider_ready_snapshot();
        let arr = v.get("providers").and_then(|x| x.as_array()).unwrap();
        assert!(arr.len() >= 5);
        assert!(parse_provider_id("openrouter").is_some());
    }

    #[test]
    fn drive_failure_writes_typed_event() {
        let db = tmp_db();
        store::set_test_db_path(Some(db.clone()));
        let (root, _) = prep_ws();
        let dto = api_start(StartTaskRequest {
            goal: "typed fail".into(),
            workspace_root: root.display().to_string(),
            permission_mode: Some("read_only".into()),
            materials_summary: None,
            use_fake_driver: true,
        })
        .unwrap();
        let failed = with_write(|conn| {
            engine::fail_task_public(conn, &dto.task_id, "rate_limited").map(|t| t.to_dto())
        })
        .unwrap();
        assert_eq!(failed.status, "failed");
        let events = api_events(&dto.task_id).unwrap();
        assert!(
            events.iter().any(|e| e.kind == "rate_limited"),
            "expected rate_limited event, got {:?}",
            events.iter().map(|e| &e.kind).collect::<Vec<_>>()
        );
        assert_eq!(classify_drive_failure("http: timeout"), "model_error");
        store::set_test_db_path(None);
        let _ = fs::remove_dir_all(&root);
        let _ = fs::remove_file(&db);
    }

    #[test]
    fn apply_without_read_auto_reads_then_waits() {
        let db = tmp_db();
        store::set_test_db_path(Some(db.clone()));
        let (root, rel) = prep_ws();
        git_commit_all(&root);
        let dto = api_start(StartTaskRequest {
            goal: "rewrite hello".into(),
            workspace_root: root.display().to_string(),
            permission_mode: Some("write_with_approval".into()),
            materials_summary: Some(rel.clone()),
            use_fake_driver: true,
        })
        .unwrap();
        let mut driver = apply_without_read_fake_steps(&rel, "hello world\n");
        let waiting = api_drive_fake(&dto.task_id, &mut driver).unwrap();
        assert_eq!(
            waiting.status, "waiting",
            "must_read must auto-read then wait, got {:?}",
            waiting.status
        );
        let events = api_events(&dto.task_id).unwrap();
        assert!(
            events.iter().any(|e| {
                e.kind == "tool_result"
                    && e.tool_name.as_deref() == Some("read_file")
                    && e.payload
                        .get("autoBeforeApply")
                        .and_then(|v| v.as_bool())
                        == Some(true)
            }),
            "expected autoBeforeApply read_file"
        );
        assert!(events.iter().any(|e| e.kind == "waiting_approval"));
        assert!(
            !events.iter().any(|e| {
                e.kind == "tool_error"
                    && e.payload
                        .get("error")
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .contains("must_read")
            }),
            "must not emit must_read_before_apply tool_error"
        );
        let token = waiting.pending_approval_token.unwrap();
        let after = api_approve(ApprovePatchRequest {
            task_id: dto.task_id.clone(),
            approval_token: token,
            persist_autonomous: true,
        })
        .unwrap();
        assert_eq!(after.status, "verifying");
        assert_eq!(after.permission_mode, "write_autonomous");
        assert_eq!(
            fs::read_to_string(root.join(&rel)).unwrap(),
            "hello world\n"
        );
        store::set_test_db_path(None);
        let _ = fs::remove_dir_all(&root);
        let _ = fs::remove_file(&db);
    }

    #[test]
    fn dirty_baseline_apply_reaches_waiting_not_error_loop() {
        let db = tmp_db();
        store::set_test_db_path(Some(db.clone()));
        let (root, rel) = prep_ws();
        git_commit_all(&root);
        // Tracked file dirty → baseline_dirty; write_with_approval must pause, not tool_error loop.
        fs::write(root.join(&rel), "hello dirty\n").unwrap();
        let dto = api_start(StartTaskRequest {
            goal: "change greeting".into(),
            workspace_root: root.display().to_string(),
            permission_mode: Some("write_with_approval".into()),
            materials_summary: Some(rel.clone()),
            use_fake_driver: true,
        })
        .unwrap();
        let mut driver = happy_path_fake_steps(&rel, "hello world\n");
        let waiting = api_drive_fake(&dto.task_id, &mut driver).unwrap();
        assert_eq!(
            waiting.status, "waiting",
            "dirty baseline must reach approval, got {:?}",
            waiting.status
        );
        assert!(waiting.pending_approval_token.is_some());
        let events = api_events(&dto.task_id).unwrap();
        assert!(
            events.iter().any(|e| e.kind == "waiting_approval"),
            "expected waiting_approval"
        );
        assert!(
            !events.iter().any(|e| {
                e.kind == "tool_error"
                    && e.payload
                        .get("error")
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .contains("baseline_dirty")
            }),
            "must not emit baseline_dirty tool_error under write_with_approval"
        );
        let wa = events
            .iter()
            .rev()
            .find(|e| e.kind == "waiting_approval")
            .unwrap();
        assert_eq!(
            wa.payload.get("baselineDirty").and_then(|v| v.as_bool()),
            Some(true)
        );
        let token = waiting.pending_approval_token.unwrap();
        let after = api_approve(ApprovePatchRequest {
            task_id: dto.task_id.clone(),
            approval_token: token,
            persist_autonomous: false,
        })
        .unwrap();
        assert_eq!(after.status, "verifying");
        assert_eq!(after.permission_mode, "write_autonomous");
        let body = fs::read_to_string(root.join(&rel)).unwrap();
        assert_eq!(body, "hello world\n");
        store::set_test_db_path(None);
        let _ = fs::remove_dir_all(&root);
        let _ = fs::remove_file(&db);
    }

    #[test]
    fn dirty_baseline_autonomous_writes_patch_applied() {
        let db = tmp_db();
        store::set_test_db_path(Some(db.clone()));
        let (root, rel) = prep_ws();
        git_commit_all(&root);
        fs::write(root.join(&rel), "hello dirty\n").unwrap();
        let dto = api_start(StartTaskRequest {
            goal: "change greeting".into(),
            workspace_root: root.display().to_string(),
            permission_mode: Some("write_autonomous".into()),
            materials_summary: Some(rel.clone()),
            use_fake_driver: true,
        })
        .unwrap();
        let mut driver = happy_path_fake_steps(&rel, "hello world\n");
        let done = api_drive_fake(&dto.task_id, &mut driver).unwrap();
        assert_eq!(done.status, "done");
        assert!(done.changed_files.iter().any(|f| f == &rel));
        let events = api_events(&dto.task_id).unwrap();
        assert!(
            events.iter().any(|e| e.kind == "patch_applied"),
            "autonomous apply must emit patch_applied"
        );
        assert!(
            !events.iter().any(|e| {
                e.kind == "tool_error"
                    && e.payload
                        .get("error")
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .contains("baseline_dirty")
            }),
            "must not emit baseline_dirty under write_autonomous"
        );
        assert_eq!(fs::read_to_string(root.join(&rel)).unwrap(), "hello world\n");
        store::set_test_db_path(None);
        let _ = fs::remove_dir_all(&root);
        let _ = fs::remove_file(&db);
    }

    #[test]
    fn approve_this_makes_rest_of_task_autonomous() {
        let db = tmp_db();
        store::set_test_db_path(Some(db.clone()));
        let (root, rel) = prep_ws();
        git_commit_all(&root);
        let dto = api_start(StartTaskRequest {
            goal: "two writes".into(),
            workspace_root: root.display().to_string(),
            permission_mode: Some("write_with_approval".into()),
            materials_summary: Some(rel.clone()),
            use_fake_driver: true,
        })
        .unwrap();
        let mut driver = happy_path_fake_steps(&rel, "hello world\n");
        let waiting = api_drive_fake(&dto.task_id, &mut driver).unwrap();
        let token = waiting.pending_approval_token.unwrap();
        let after = api_approve(ApprovePatchRequest {
            task_id: dto.task_id.clone(),
            approval_token: token,
            persist_autonomous: false,
        })
        .unwrap();
        assert_eq!(after.permission_mode, "write_autonomous");
        let mut second = apply_only_fake_steps(&rel, "second\n");
        let done = api_drive_fake(&dto.task_id, &mut second).unwrap();
        assert_ne!(done.status, "waiting");
        assert_eq!(fs::read_to_string(root.join(&rel)).unwrap(), "second\n");
        let events = api_events(&dto.task_id).unwrap();
        let applied = events.iter().filter(|e| e.kind == "patch_applied").count();
        assert!(applied >= 2, "expected two patch_applied, got {applied}");
        store::set_test_db_path(None);
        let _ = fs::remove_dir_all(&root);
        let _ = fs::remove_file(&db);
    }

    #[test]
    fn export_to_desktop_copies_basename() {
        let db = tmp_db();
        store::set_test_db_path(Some(db.clone()));
        let (root, rel) = prep_ws();
        git_commit_all(&root);
        let desk = std::env::temp_dir().join(format!(
            "atr_desk_{}_{}",
            std::process::id(),
            now_stamp()
        ));
        let _ = fs::remove_dir_all(&desk);
        fs::create_dir_all(&desk).unwrap();
        tools::set_test_desktop_dir(Some(desk.clone()));
        let dto = api_start(StartTaskRequest {
            goal: "放到桌面".into(),
            workspace_root: root.display().to_string(),
            permission_mode: Some("write_autonomous".into()),
            materials_summary: Some(rel.clone()),
            use_fake_driver: true,
        })
        .unwrap();
        let mut driver = export_desktop_fake_steps(&rel);
        let done = api_drive_fake(&dto.task_id, &mut driver).unwrap();
        assert_eq!(done.status, "done");
        let dest = desk.join(&rel);
        assert!(dest.is_file(), "missing dest {}", dest.display());
        assert_eq!(fs::read_to_string(&dest).unwrap(), "hello\n");
        let events = api_events(&dto.task_id).unwrap();
        assert!(events.iter().any(|e| e.kind == "exported_desktop"));
        tools::set_test_desktop_dir(None);
        store::set_test_db_path(None);
        let _ = fs::remove_dir_all(&root);
        let _ = fs::remove_dir_all(&desk);
        let _ = fs::remove_file(&db);
    }

    #[test]
    fn create_missing_file_reaches_waiting_approval() {
        let db = tmp_db();
        store::set_test_db_path(Some(db.clone()));
        let (root, _) = prep_ws();
        git_commit_all(&root);
        let dto = api_start(StartTaskRequest {
            goal: "给我一个readme".into(),
            workspace_root: root.display().to_string(),
            permission_mode: Some("write_with_approval".into()),
            materials_summary: None,
            use_fake_driver: true,
        })
        .unwrap();
        let mut driver = create_file_fake_steps("README.md", "# Hello\n");
        let waiting = api_drive_fake(&dto.task_id, &mut driver).unwrap();
        assert_eq!(waiting.status, "waiting");
        assert!(waiting.pending_approval_token.is_some());
        let events = api_events(&dto.task_id).unwrap();
        assert!(
            events
                .iter()
                .any(|e| e.kind == "tool_result" && e.tool_name.as_deref() == Some("inspect_workspace")),
            "inspect must persist for tool_trace"
        );
        let trace = prompts::tool_trace_from_events(&events);
        assert!(
            trace.contains("inspect_workspace") && trace.contains("entries"),
            "tool_trace must carry inspect payload, got: {}",
            &trace.chars().take(300).collect::<String>()
        );
        let token = waiting.pending_approval_token.unwrap();
        let after = api_approve(ApprovePatchRequest {
            task_id: dto.task_id.clone(),
            approval_token: token,
            persist_autonomous: false,
        })
        .unwrap();
        assert_eq!(after.status, "verifying");
        assert!(root.join("README.md").is_file());
        let body = fs::read_to_string(root.join("README.md")).unwrap();
        assert_eq!(body, "# Hello\n");
        store::set_test_db_path(None);
        let _ = fs::remove_dir_all(&root);
        let _ = fs::remove_file(&db);
    }

    #[test]
    fn repair_after_check_fail_reaches_done() {
        let db = tmp_db();
        store::set_test_db_path(Some(db.clone()));
        let (root, rel) = prep_ws();
        git_commit_all(&root);
        let dto = api_start(StartTaskRequest {
            goal: "repair loop".into(),
            workspace_root: root.display().to_string(),
            permission_mode: Some("write_with_approval".into()),
            materials_summary: None,
            use_fake_driver: true,
        })
        .unwrap();
        let ckpt_id = dto.checkpoint_id.clone().unwrap();
        let mut driver = happy_path_fake_steps(&rel, "fixed\n");
        let waiting = api_drive_fake(&dto.task_id, &mut driver).unwrap();
        assert_eq!(waiting.status, "waiting");
        let token = waiting.pending_approval_token.clone().unwrap();
        let after = api_approve(ApprovePatchRequest {
            task_id: dto.task_id.clone(),
            approval_token: token,
            persist_autonomous: false,
        })
        .unwrap();
        assert_eq!(after.status, "verifying");
        let mut repair = after_approve_repair_then_ok_steps("noop_fail", "noop_ok");
        let done = api_drive_fake(&dto.task_id, &mut repair).unwrap();
        assert_eq!(done.status, "done");
        assert_eq!(done.checkpoint_id.as_deref(), Some(ckpt_id.as_str()));
        let events = api_events(&dto.task_id).unwrap();
        let check_results: Vec<_> = events
            .iter()
            .filter(|e| e.kind == "tool_result" && e.tool_name.as_deref() == Some("run_check"))
            .collect();
        assert!(
            check_results.len() >= 2,
            "expected fail then ok run_check, got {}",
            check_results.len()
        );
        store::set_test_db_path(None);
        let _ = fs::remove_dir_all(&root);
        let _ = fs::remove_file(&db);
    }
}
