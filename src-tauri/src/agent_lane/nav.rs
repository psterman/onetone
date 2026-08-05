//! Claude / Codex lane navigation helpers (focus live + explicit resume).

use super::store::get_lane;
use serde::Serialize;
use std::process::Command;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResumeLaneResult {
    pub ok: bool,
    pub detail: String,
}

/// Spawn `claude --resume <session>` in recorded cwd (explicit user action).
pub fn resume_claude_lane(lane_id: &str) -> ResumeLaneResult {
    let Some(lane) = get_lane(lane_id) else {
        return ResumeLaneResult {
            ok: false,
            detail: "lane_not_found".into(),
        };
    };
    if lane.caps().can_focus_live {
        return ResumeLaneResult {
            ok: false,
            detail: "still_live_focus_instead".into(),
        };
    }
    if lane.key.session_id.is_empty() {
        return ResumeLaneResult {
            ok: false,
            detail: "missing_session_id".into(),
        };
    }
    let cwd = if lane.navigation.cwd.is_empty() {
        None
    } else {
        Some(lane.navigation.cwd.clone())
    };
    let mut cmd = Command::new("claude");
    cmd.arg("--resume").arg(&lane.key.session_id);
    if let Some(dir) = cwd {
        cmd.current_dir(dir);
    }
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0000_0010); // CREATE_NEW_CONSOLE
    }
    match cmd.spawn() {
        Ok(_) => ResumeLaneResult {
            ok: true,
            detail: "spawned_claude_resume".into(),
        },
        Err(e) => ResumeLaneResult {
            ok: false,
            detail: format!("spawn_failed:{e}"),
        },
    }
}

/// Spawn `codex resume <thread-id>` when session is offline.
pub fn resume_codex_lane(lane_id: &str) -> ResumeLaneResult {
    let Some(lane) = get_lane(lane_id) else {
        return ResumeLaneResult {
            ok: false,
            detail: "lane_not_found".into(),
        };
    };
    if lane.caps().can_focus_live {
        return ResumeLaneResult {
            ok: false,
            detail: "still_live_focus_instead".into(),
        };
    }
    if lane.key.session_id.is_empty() {
        return ResumeLaneResult {
            ok: false,
            detail: "missing_session_id".into(),
        };
    }
    let mut cmd = Command::new("codex");
    cmd.arg("resume").arg(&lane.key.session_id);
    if !lane.navigation.cwd.is_empty() {
        cmd.current_dir(&lane.navigation.cwd);
    }
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0000_0010);
    }
    match cmd.spawn() {
        Ok(_) => ResumeLaneResult {
            ok: true,
            detail: "spawned_codex_resume".into(),
        },
        Err(e) => ResumeLaneResult {
            ok: false,
            detail: format!("spawn_failed:{e}"),
        },
    }
}
