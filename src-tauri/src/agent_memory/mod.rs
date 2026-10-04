//! Agent memory store — Plan A discovery + Plan B lifecycle + Plan C checkpoint/memory.

mod agent_center;
mod checkpoint;
mod claude_background;
mod codex_work_meta;
mod context;
mod cursor_adapter;
mod events;
mod home_focus;
mod lifecycle;
mod mcp_readonly;
mod memory;
mod model;
mod paths;
mod project;
mod project_confirm;
pub mod registry;
mod session_events;
mod snapshot;
mod store;
mod worker;
mod workspace_evidence;

pub use agent_center::{
    build_agent_center_snapshot, build_agent_center_snapshot_with_hints, collect_resolve_hints,
    execute_agent_center_action, parse_project_hint, refresh_and_snapshot,
    refresh_and_snapshot_with_hints, registry_refresh_is_fresh, ResolveHints, AgentCenterActionArgs,
    AgentCenterActionResult, AgentCenterSnapshot, AgentCenterSnapshotArgs,
};
pub use claude_background::{ClaudeBackgroundProbe, ClaudeProbeCache, ProbePolicy};
pub use checkpoint::{
    create_checkpoint, latest_checkpoint_for_project, latest_checkpoint_for_session,
    maybe_auto_checkpoint, resume_checkpoint,
};
pub use context::{project_context, ProjectContext};
pub use events::{
    append_lifecycle_event, append_observed_event, source_ref_for_turn, upsert_session_candidate,
};
pub use home_focus::{
    build_home_focus_snapshot, enqueue_home_focus_retry, HomeFocusSnapshot,
};
pub use lifecycle::{
    append_ui_lifecycle, note_attention, status_for_lifecycle_event, transition_allowed,
    LIFECYCLE_SUMMARY_MAX,
};
pub use mcp_readonly::{
    tool_checkpoint_preview, tool_memory_search, tool_project_context, tool_session_history,
};
pub use memory::{
    context_for_provider, list_recent_memory, query_memory, rebuild_memory_fts, upsert_memory,
};
pub use model::{
    CheckpointDto, ContinuationBrief, MemoryRecordDto, ProjectMatch, SessionCandidate,
    PROVIDER_CURSOR, UNKNOWN_PROJECT_ID,
};
pub use project_confirm::{confirm_project, list_known_projects, KnownProjectDto};
pub use registry::{
    canonicalize_discovery_label, discovered_agent_id, kind_agent_id, list_registry,
    parse_runtime_kind, refresh_registry, sniff_version, upsert_registry_row, CanonicalTarget,
    RegistryRow, ALL_AGENT_KINDS,
};
pub use session_events::list_session_events;
pub use snapshot::{build_agent_home_snapshot, AgentHomeSnapshot};
pub use store::{with_read_path, with_write};
pub use worker::{enqueue_cursor_discover, ensure_started};

/// Ensure DB migrated and writer started; return latest projection (does not wait for discover).
pub fn home_snapshot(project_hint: Option<&std::path::Path>) -> AgentHomeSnapshot {
    ensure_started();
    // Only enqueue real path hints — display names must not become PathBuf.
    let safe = project_hint.and_then(|p| {
        project::validate_workspace_path(p).map(|_| p.to_path_buf())
    });
    enqueue_cursor_discover(safe);
    build_agent_home_snapshot(project_hint.and_then(|p| {
        if project::validate_workspace_path(p).is_some() {
            Some(p)
        } else {
            None
        }
    }))
}
