//! User-facing HomeFocusSnapshot — projection only; never sync-scans Cursor DB.

use crate::agent_attention::{self, AttentionState};
use crate::agent_memory::checkpoint::{
    latest_checkpoint_for_project, latest_checkpoint_for_session,
};
use crate::agent_memory::model::{
    CheckpointDto, HomeSessionDto, ProjectMatch, ProbeStatus, PROVIDER_CURSOR, UNKNOWN_PROJECT_ID,
};
use crate::agent_memory::project::{project_id_from_path, validate_workspace_path};
use crate::agent_memory::project_confirm::{is_project_confirmed, KnownProjectDto};
use crate::agent_memory::store::{now_ms, with_read_path};
use crate::agent_memory::worker;
use crate::agent_memory::workspace_evidence::{
    select_workspace_evidence, title_project_token, EvidenceSelection, WorkspaceCandidate,
};
use crate::app_identity;
use crate::soft_pad_runtime::AgentKind;
use rusqlite::params;
use serde::Serialize;
use std::path::PathBuf;

pub const LIFECYCLE_TTL_MS: u64 = 120_000;
pub const COMPLETED_DISPLAY_MS: u64 = 10 * 60 * 1000;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HomeFocusSnapshot {
    pub foreground: HomeFocusForeground,
    pub project: HomeFocusProject,
    pub provider: HomeFocusProvider,
    pub work: HomeFocusWork,
    pub next_action: Option<HomeFocusAction>,
    pub source: HomeFocusSource,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HomeFocusForeground {
    pub app_id: Option<String>,
    pub app_name: Option<String>,
    pub window_title: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HomeFocusProjectCandidate {
    pub id: String,
    pub name: String,
    pub root: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HomeFocusProject {
    pub id: String,
    pub name: String,
    pub root: Option<String>,
    /// exact | probable | unknown
    #[serde(rename = "match")]
    pub match_kind: String,
    pub confirmed: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub candidates: Option<Vec<HomeFocusProjectCandidate>>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HomeFocusProvider {
    pub id: String,
    /// ready | loading | disabled | unavailable
    pub status: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HomeFocusWork {
    /// idle | running | waiting | resumable | completed | error
    pub status: String,
    pub title: String,
    pub description: String,
    pub updated_at: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HomeFocusAction {
    pub title: String,
    pub kind: String,
    pub executable: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HomeFocusSource {
    /// live | cached | stale
    pub freshness: String,
    pub reason: String,
}

/// Read-only projection. Does not enqueue Cursor discover.
pub fn build_home_focus_snapshot() -> HomeFocusSnapshot {
    worker::ensure_started();
    let now = now_ms();
    let fg = read_foreground();
    let refreshing = worker::is_refreshing();

    let (probe_status, last_probe_ms, has_sessions) = read_probe_meta();
    let consent = crate::cursor_local_activity::consent_enabled();

    let (project, selection_ambiguous) = resolve_focus_project(&fg, now);
    let confirmed = project.id != UNKNOWN_PROJECT_ID && is_project_confirmed(&project.id);

    let session = read_best_session(&project.id);
    let checkpoint = session
        .as_ref()
        .and_then(|s| latest_checkpoint_for_session(&s.session_id))
        .or_else(|| {
            if project.id != UNKNOWN_PROJECT_ID {
                latest_checkpoint_for_project(&project.id)
            } else {
                None
            }
        });

    let provider_status = provider_status(refreshing, &probe_status, consent);
    let (work, source) = derive_work(
        now,
        &probe_status,
        last_probe_ms,
        has_sessions,
        refreshing,
        session.as_ref(),
        checkpoint.as_ref(),
        &project,
        confirmed,
    );

    let next_action = derive_next_action(
        &work.status,
        &project,
        confirmed,
        selection_ambiguous,
        checkpoint.as_ref(),
    );

    HomeFocusSnapshot {
        foreground: fg,
        project: HomeFocusProject {
            confirmed,
            ..project
        },
        provider: HomeFocusProvider {
            id: PROVIDER_CURSOR.into(),
            status: provider_status,
        },
        work,
        next_action,
        source,
    }
}

fn read_foreground() -> HomeFocusForeground {
    let live = app_identity::foreground_app_identity();
    HomeFocusForeground {
        app_id: live
            .as_ref()
            .and_then(|id| id.matched_preset_app_id.clone()),
        app_name: live.as_ref().map(app_identity::identity_display_name),
        window_title: live.as_ref().map(|id| id.window_title.clone()),
    }
}

fn resolve_focus_project(
    fg: &HomeFocusForeground,
    now: u64,
) -> (HomeFocusProject, bool) {
    let title = fg.window_title.as_deref();
    let selection = select_workspace_evidence(title, now);

    match selection {
        EvidenceSelection::High(ev) | EvidenceSelection::Probable(ev) => {
            let (identity, match_kind, _reason, _) =
                crate::agent_memory::project::resolve_project(None, Some(&ev));
            (
                HomeFocusProject {
                    id: identity.project_id,
                    name: identity.display_name,
                    root: identity.workspace_path,
                    match_kind: match_kind.as_str().into(),
                    confirmed: false,
                    candidates: None,
                },
                false,
            )
        }
        EvidenceSelection::Ambiguous(cands) => {
            let candidates: Vec<_> = cands.iter().map(candidate_dto).collect();
            let title_name = title_project_token(title.unwrap_or("")).unwrap_or_else(|| "未知项目".into());
            (
                HomeFocusProject {
                    id: UNKNOWN_PROJECT_ID.into(),
                    name: title_name,
                    root: None,
                    match_kind: ProjectMatch::Unknown.as_str().into(),
                    confirmed: false,
                    candidates: Some(candidates),
                },
                true,
            )
        }
        EvidenceSelection::None => {
            // Title display candidate only — never PathBuf / Exact.
            if let Some(name) = title_project_token(title.unwrap_or("")) {
                (
                    HomeFocusProject {
                        id: UNKNOWN_PROJECT_ID.into(),
                        name: name.clone(),
                        root: None,
                        match_kind: ProjectMatch::Probable.as_str().into(),
                        confirmed: false,
                        candidates: None,
                    },
                    false,
                )
            } else {
                (
                    HomeFocusProject {
                        id: UNKNOWN_PROJECT_ID.into(),
                        name: "未知项目".into(),
                        root: None,
                        match_kind: ProjectMatch::Unknown.as_str().into(),
                        confirmed: false,
                        candidates: None,
                    },
                    false,
                )
            }
        }
    }
}

fn candidate_dto(c: &WorkspaceCandidate) -> HomeFocusProjectCandidate {
    let id = project_id_from_path(&c.path);
    HomeFocusProjectCandidate {
        id,
        name: c.display_name.clone(),
        root: Some(c.path.to_string_lossy().to_string()),
    }
}

fn read_probe_meta() -> (String, Option<u64>, bool) {
    with_read_path(|conn| {
        let row = conn.query_row(
            "SELECT probe_status, last_successful_probe_at_ms
             FROM provider_cursors WHERE provider = ?1
             ORDER BY last_scan_at_ms DESC LIMIT 1",
            params![PROVIDER_CURSOR],
            |r| {
                Ok((
                    r.get::<_, String>(0)
                        .unwrap_or_else(|_| ProbeStatus::NotFound.as_str().into()),
                    r.get::<_, Option<i64>>(1)?.map(|x| x as u64),
                ))
            },
        );
        let (probe, last) =
            row.unwrap_or_else(|_| (ProbeStatus::NotFound.as_str().into(), None));
        let n: i64 = conn
            .query_row(
                "SELECT COUNT(1) FROM agent_sessions WHERE provider = ?1",
                params![PROVIDER_CURSOR],
                |r| r.get(0),
            )
            .unwrap_or(0);
        Ok((probe, last, n > 0))
    })
    .unwrap_or_else(|_| (ProbeStatus::ReadError.as_str().into(), None, false))
}

fn read_best_session(project_id: &str) -> Option<HomeSessionDto> {
    with_read_path(|conn| {
        let mut stmt = conn
            .prepare(
                "SELECT session_id, provider, external_session_id, title, updated_at_ms, status,
                        project_match, match_reason, match_confidence, is_active,
                        activity_source, active_confidence
                 FROM agent_sessions
                 WHERE project_id = ?1
                 ORDER BY is_active DESC, updated_at_ms DESC
                 LIMIT 1",
            )
            .map_err(|e| e.to_string())?;
        let row = stmt
            .query_row(params![project_id], |r| {
                Ok(HomeSessionDto {
                    session_id: r.get(0)?,
                    provider: r.get(1)?,
                    external_session_id: r.get(2)?,
                    title: r.get(3)?,
                    updated_at: r.get::<_, Option<i64>>(4)?.map(|x| x as u64),
                    status: r.get(5)?,
                    project_match: r.get(6)?,
                    match_reason: r.get(7)?,
                    match_confidence: r.get(8)?,
                    is_active: r.get::<_, i64>(9)? != 0,
                    activity_source: r.get(10)?,
                    active_confidence: r.get(11)?,
                })
            })
            .ok();
        if row.is_some() {
            return Ok(row);
        }
        // Fallback: any recent cursor session (unknown project).
        let mut stmt2 = conn
            .prepare(
                "SELECT session_id, provider, external_session_id, title, updated_at_ms, status,
                        project_match, match_reason, match_confidence, is_active,
                        activity_source, active_confidence
                 FROM agent_sessions
                 WHERE provider = ?1
                 ORDER BY updated_at_ms DESC
                 LIMIT 1",
            )
            .map_err(|e| e.to_string())?;
        Ok(stmt2
            .query_row(params![PROVIDER_CURSOR], |r| {
                Ok(HomeSessionDto {
                    session_id: r.get(0)?,
                    provider: r.get(1)?,
                    external_session_id: r.get(2)?,
                    title: r.get(3)?,
                    updated_at: r.get::<_, Option<i64>>(4)?.map(|x| x as u64),
                    status: r.get(5)?,
                    project_match: r.get(6)?,
                    match_reason: r.get(7)?,
                    match_confidence: r.get(8)?,
                    is_active: r.get::<_, i64>(9)? != 0,
                    activity_source: r.get(10)?,
                    active_confidence: r.get(11)?,
                })
            })
            .ok())
    })
    .unwrap_or(None)
}

fn provider_status(refreshing: bool, probe: &str, consent: bool) -> String {
    if refreshing {
        return "loading".into();
    }
    if !consent {
        return "disabled".into();
    }
    match probe {
        "ready" | "stale" | "empty_valid" => "ready".into(),
        "not_found" => "unavailable".into(),
        "read_error" | "schema_unknown" | "read_locked" => "unavailable".into(),
        "consent_off" => "disabled".into(),
        _ => "unavailable".into(),
    }
}

fn derive_work(
    now: u64,
    probe: &str,
    last_probe_ms: Option<u64>,
    has_sessions: bool,
    refreshing: bool,
    session: Option<&HomeSessionDto>,
    checkpoint: Option<&CheckpointDto>,
    project: &HomeFocusProject,
    confirmed: bool,
) -> (HomeFocusWork, HomeFocusSource) {
    let stale_age = now.saturating_sub(last_probe_ms.unwrap_or(0));
    let mut freshness = if refreshing {
        "cached"
    } else if matches!(probe, "ready") && stale_age < 120_000 {
        "live"
    } else if has_sessions || last_probe_ms.is_some() {
        "stale"
    } else {
        "cached"
    }
    .to_string();
    let mut reason = format!("probe={probe}");

    // Soft Pad attention (Cursor).
    let attn = agent_attention::primary_state_for(AgentKind::Cursor);
    let attn_age = agent_attention::lifecycle_age_ms(AgentKind::Cursor).unwrap_or(u64::MAX);

    let sess_status = session.map(|s| s.status.as_str()).unwrap_or("");
    let sess_updated = session.and_then(|s| s.updated_at).unwrap_or(0);
    let sess_age = now.saturating_sub(sess_updated);
    let title_default = session
        .and_then(|s| s.title.clone())
        .filter(|t| !t.trim().is_empty())
        .unwrap_or_else(|| "当前工作".into());

    // Priority: error > running > waiting > resumable > completed > idle
    let hard_error = matches!(probe, "read_error" | "schema_unknown") && !has_sessions;
    if hard_error {
        return (
            HomeFocusWork {
                status: "error".into(),
                title: "暂时无法读取 Cursor 的当前工作".into(),
                description: "数据读取失败，可以重试。".into(),
                updated_at: now,
            },
            HomeFocusSource {
                freshness: "stale".into(),
                reason: format!("{reason};hard_error"),
            },
        );
    }
    if matches!(probe, "read_error" | "schema_unknown" | "read_locked") && has_sessions {
        freshness = "stale".into();
        reason.push_str(";probe_failed_using_cache");
    }

    if sess_status == "failed" && sess_age <= LIFECYCLE_TTL_MS {
        return (
            HomeFocusWork {
                status: "error".into(),
                title: title_default,
                description: "上次任务遇到问题。".into(),
                updated_at: sess_updated,
            },
            HomeFocusSource {
                freshness,
                reason: format!("{reason};lifecycle_failed"),
            },
        );
    }

    let attn_running =
        attn == Some(AttentionState::Working) && attn_age <= LIFECYCLE_TTL_MS;
    let life_running =
        matches!(sess_status, "running" | "resumed") && sess_age <= LIFECYCLE_TTL_MS;
    if attn_running || life_running {
        return (
            HomeFocusWork {
                status: "running".into(),
                title: title_default,
                description: "正在处理中。".into(),
                updated_at: if life_running { sess_updated } else { now.saturating_sub(attn_age) },
            },
            HomeFocusSource {
                freshness,
                reason: format!("{reason};running"),
            },
        );
    }

    let attn_waiting =
        attn == Some(AttentionState::NeedsInput) && attn_age <= LIFECYCLE_TTL_MS;
    let life_waiting = sess_status == "waiting_approval" && sess_age <= LIFECYCLE_TTL_MS;
    if attn_waiting || life_waiting {
        return (
            HomeFocusWork {
                status: "waiting".into(),
                title: title_default,
                description: "需要你确认一下。".into(),
                updated_at: if life_waiting {
                    sess_updated
                } else {
                    now.saturating_sub(attn_age)
                },
            },
            HomeFocusSource {
                freshness,
                reason: format!("{reason};waiting"),
            },
        );
    }

    let can_resume = checkpoint.is_some()
        && project.match_kind == "exact"
        && confirmed
        && project.id != UNKNOWN_PROJECT_ID;
    if can_resume {
        let ck = checkpoint.unwrap();
        return (
            HomeFocusWork {
                status: "resumable".into(),
                title: ck
                    .current_task
                    .clone()
                    .filter(|s| !s.trim().is_empty())
                    .or_else(|| Some(title_default.clone()))
                    .unwrap_or_else(|| "可以继续".into()),
                description: ck
                    .next_action
                    .clone()
                    .unwrap_or_else(|| "我记得你上次停在这里。".into()),
                updated_at: ck.updated_at,
            },
            HomeFocusSource {
                freshness,
                reason: format!("{reason};resumable"),
            },
        );
    }

    if sess_status == "completed" && sess_age <= COMPLETED_DISPLAY_MS {
        return (
            HomeFocusWork {
                status: "completed".into(),
                title: title_default,
                description: "刚刚完成。".into(),
                updated_at: sess_updated,
            },
            HomeFocusSource {
                freshness,
                reason: format!("{reason};completed"),
            },
        );
    }

    let idle_title = if project.match_kind == "probable" && !confirmed {
        format!("这可能是 {}", project.name)
    } else if session.is_none() {
        "还没有找到可以继续的工作".into()
    } else {
        title_default
    };
    let idle_desc = if project.match_kind == "probable" && !confirmed {
        "我检测到了应用，但还不能确定当前项目。".into()
    } else if session.is_none() {
        "可以直接开始一个新任务。".into()
    } else {
        "已准备好。".into()
    };

    (
        HomeFocusWork {
            status: "idle".into(),
            title: idle_title,
            description: idle_desc,
            updated_at: sess_updated.max(last_probe_ms.unwrap_or(0)).max(1),
        },
        HomeFocusSource { freshness, reason },
    )
}

fn derive_next_action(
    work_status: &str,
    project: &HomeFocusProject,
    confirmed: bool,
    ambiguous: bool,
    checkpoint: Option<&CheckpointDto>,
) -> Option<HomeFocusAction> {
    if work_status == "error" {
        return Some(HomeFocusAction {
            title: "重试".into(),
            kind: "retry".into(),
            executable: true,
        });
    }

    // Unconfirmed / ambiguous blocks resume.
    if ambiguous || (project.candidates.as_ref().map(|c| c.len()).unwrap_or(0) > 1) {
        return Some(HomeFocusAction {
            title: "选择其他项目".into(),
            kind: "pick_project".into(),
            executable: true,
        });
    }
    if !confirmed
        && project.name != "未知项目"
        && project.root.is_some()
        && project.match_kind != "unknown"
    {
        return Some(HomeFocusAction {
            title: "确认这是当前项目".into(),
            kind: "confirm_project".into(),
            executable: true,
        });
    }
    if project.match_kind == "probable" && !confirmed && project.root.is_none() {
        // Title-only guess — offer pick, not fake confirm of a path.
        return Some(HomeFocusAction {
            title: "选择其他项目".into(),
            kind: "pick_project".into(),
            executable: true,
        });
    }

    if matches!(work_status, "running" | "waiting") {
        return Some(HomeFocusAction {
            title: "我想看看进展".into(),
            kind: "view_progress".into(),
            executable: true,
        });
    }

    if work_status == "resumable" && checkpoint.is_some() && confirmed {
        return Some(HomeFocusAction {
            title: "继续帮我做".into(),
            kind: "resume".into(),
            executable: true,
        });
    }

    if work_status == "idle" || work_status == "completed" {
        return Some(HomeFocusAction {
            title: "开始一个新任务".into(),
            kind: "start_task".into(),
            executable: true,
        });
    }

    None
}

/// Async retry — enqueue discover, return immediately.
pub fn enqueue_home_focus_retry() -> serde_json::Value {
    worker::enqueue_home_focus_refresh();
    serde_json::json!({ "accepted": true })
}

pub fn confirm_and_snapshot(
    project_root: Option<&str>,
    project_id: Option<&str>,
) -> Result<(KnownProjectDto, HomeFocusSnapshot), String> {
    let known = crate::agent_memory::project_confirm::confirm_project(project_root, project_id)?;
    Ok((known, build_home_focus_snapshot()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn snapshot_serializes_camel_case() {
        let snap = HomeFocusSnapshot {
            foreground: HomeFocusForeground {
                app_id: Some("cursor".into()),
                app_name: Some("Cursor".into()),
                window_title: Some("x — voice-pilot — Cursor".into()),
            },
            project: HomeFocusProject {
                id: "proj_x".into(),
                name: "voice-pilot".into(),
                root: Some(r"E:\voice-pilot".into()),
                match_kind: "probable".into(),
                confirmed: false,
                candidates: None,
            },
            provider: HomeFocusProvider {
                id: "cursor".into(),
                status: "ready".into(),
            },
            work: HomeFocusWork {
                status: "idle".into(),
                title: "这可能是 voice-pilot".into(),
                description: "需要确认".into(),
                updated_at: 1,
            },
            next_action: Some(HomeFocusAction {
                title: "确认这是当前项目".into(),
                kind: "confirm_project".into(),
                executable: true,
            }),
            source: HomeFocusSource {
                freshness: "cached".into(),
                reason: "test".into(),
            },
        };
        let v = serde_json::to_value(&snap).unwrap();
        assert!(v.get("nextAction").is_some());
        assert!(v.get("foreground").unwrap().get("windowTitle").is_some());
        assert_eq!(
            v.get("project").unwrap().get("match").unwrap().as_str(),
            Some("probable")
        );
        assert!(!v
            .get("project")
            .unwrap()
            .get("confirmed")
            .unwrap()
            .as_bool()
            .unwrap());
    }

    #[test]
    fn unconfirmed_blocks_resume_action() {
        let project = HomeFocusProject {
            id: "p1".into(),
            name: "voice-pilot".into(),
            root: Some(r"E:\voice-pilot".into()),
            match_kind: "exact".into(),
            confirmed: false,
            candidates: None,
        };
        // Even with resumable work status, unconfirmed + probable path uses confirm first.
        // When match exact but not confirmed — still prefer confirm if we treat confirmed gate.
        let act = derive_next_action(
            "resumable",
            &HomeFocusProject {
                match_kind: "probable".into(),
                ..project.clone()
            },
            false,
            false,
            Some(&CheckpointDto {
                checkpoint_id: "c1".into(),
                session_id: "s1".into(),
                project_id: "p1".into(),
                status: "paused".into(),
                current_task: Some("t".into()),
                changed_files: vec![],
                pending_questions: vec![],
                next_action: Some("n".into()),
                last_event_id: None,
                created_at: 1,
                updated_at: 1,
            }),
        );
        assert_eq!(act.as_ref().map(|a| a.kind.as_str()), Some("confirm_project"));
    }

    #[test]
    fn validate_path_helper_rejects_slash_only() {
        assert!(validate_workspace_path(&PathBuf::from(r"E:\nope\missing")).is_none());
    }
}
