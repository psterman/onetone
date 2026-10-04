//! Plan C: project context pack for homepage / provider injection / MCP.

use crate::agent_memory::checkpoint::latest_checkpoint_for_project;
use crate::agent_memory::memory::list_recent_memory;
use crate::agent_memory::model::{
    CheckpointDto, HomeEventDto, HomeSessionDto, MemoryRecordDto, ProjectIdentity,
    UNKNOWN_PROJECT_ID,
};
use crate::agent_memory::snapshot::build_agent_home_snapshot;
use serde::Serialize;
use std::path::Path;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectContext {
    pub project: ProjectIdentity,
    pub active_session: Option<HomeSessionDto>,
    pub recent_sessions: Vec<HomeSessionDto>,
    pub recent_events: Vec<HomeEventDto>,
    pub latest_checkpoint: Option<CheckpointDto>,
    pub recent_memories: Vec<MemoryRecordDto>,
    pub next_action: Option<String>,
    pub diagnostics: Vec<String>,
}

/// Build limited, project-scoped context. Failures become diagnostics, not hard errors.
pub fn project_context(project_hint: Option<&Path>, memory_limit: usize) -> ProjectContext {
    let snap = build_agent_home_snapshot(project_hint);
    let mut diagnostics = snap.diagnostics.clone();
    let project_id = snap.project.project_id.clone();
    let lim = memory_limit.clamp(1, 12);

    let (latest_checkpoint, recent_memories, next_action) =
        if project_id.is_empty() || project_id == UNKNOWN_PROJECT_ID {
            diagnostics.push("unknown_project_no_memory".into());
            (None, Vec::new(), None)
        } else {
            let ckpt = latest_checkpoint_for_project(&project_id);
            let next = ckpt.as_ref().and_then(|c| c.next_action.clone());
            let mems = list_recent_memory(&project_id, lim).unwrap_or_else(|e| {
                diagnostics.push(format!("memory_read_failed:{e}"));
                Vec::new()
            });
            (ckpt, mems, next)
        };

    ProjectContext {
        project: snap.project,
        active_session: snap.active_session,
        recent_sessions: snap.recent_sessions.into_iter().take(8).collect(),
        recent_events: snap.recent_events.into_iter().take(12).collect(),
        latest_checkpoint,
        recent_memories,
        next_action,
        diagnostics,
    }
}
