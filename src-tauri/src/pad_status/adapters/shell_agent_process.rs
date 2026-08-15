//! WorkBuddy / Trae / Qoder process + mtime fallback for Soft Pad lamps.
//!
//! Does **not** extend PadState. Writes attention `Inferred` Working/Idle only.
//! Hook `OfficialHook` / NeedsInput always win.
//!
//! Trae Solo: Cursor-style local activity (process + Solo/ModularData mtime).
//! TraeCode/IDE hooks still publish OfficialHook when present.
//! WorkBuddy / Qoder: Hook-only motion (no mtime fake Working).

use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant, SystemTime};

use crate::agent_attention::store::{self, raise_lifecycle};
use crate::agent_attention::{AttentionState, SignalSource};
use crate::app_identity::{
    process_running_by_exe, preset_process_names, QODER_APP_TARGET_ID, TRAE_APP_TARGET_ID,
    TRAE_CODE_APP_TARGET_ID, WORKBUDDY_APP_TARGET_ID,
};
use crate::pad_status::SHELL_AGENT_MTIME_BUSY_MS;
use crate::shell_agent_hook_setup;
use crate::soft_pad_runtime::AgentKind;
use crate::AppState;

const PROCESS_POLL_SECS: u64 = 3;
const CONFIGURED_REFRESH_SECS: u64 = 30;
/// Trae Solo agent turns can gap >60s between tool writes; keep lamp sticky longer.
const TRAE_SOLO_MTIME_BUSY_MS: u64 = 180_000;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum InferredBusy {
    /// Process alive + recent mtime.
    Working,
    /// Process alive, quiet tree.
    Quiet,
    /// Process not running.
    Absent,
}

#[derive(Default)]
struct ConfiguredCache {
    refreshed_at: Option<Instant>,
    workbuddy: Option<bool>,
    trae: Option<bool>,
    trae_code: Option<bool>,
    qoder: Option<bool>,
    force_refresh: bool,
}

#[derive(Default)]
struct LastPublished {
    workbuddy: Option<&'static str>,
    trae: Option<&'static str>,
    qoder: Option<&'static str>,
    workbuddy_cfg: Option<bool>,
    trae_cfg: Option<bool>,
    qoder_cfg: Option<bool>,
}

fn configured_cache() -> &'static Mutex<ConfiguredCache> {
    static C: OnceLock<Mutex<ConfiguredCache>> = OnceLock::new();
    C.get_or_init(|| Mutex::new(ConfiguredCache::default()))
}

fn last_published() -> &'static Mutex<LastPublished> {
    static L: OnceLock<Mutex<LastPublished>> = OnceLock::new();
    L.get_or_init(|| Mutex::new(LastPublished::default()))
}

static STARTED: AtomicBool = AtomicBool::new(false);

/// Mapping / Soft Pad scheme change — refresh hook-configured on next tick.
pub fn invalidate_hook_configured_cache() {
    if let Ok(mut g) = configured_cache().lock() {
        g.force_refresh = true;
        g.refreshed_at = None;
    }
}

pub fn hook_configured(kind: AgentKind) -> Option<bool> {
    let g = configured_cache().lock().ok()?;
    match kind {
        AgentKind::WorkBuddy => g.workbuddy,
        AgentKind::Trae => g.trae,
        AgentKind::TraeCode => g.trae_code,
        AgentKind::Qoder => g.qoder,
        _ => None,
    }
}

/// Pure: mtime age → busy for Soft Pad inferred Working.
pub fn infer_busy_from_mtime_age(age_ms: u64) -> bool {
    age_ms < SHELL_AGENT_MTIME_BUSY_MS
}

fn infer_busy_from_mtime_age_for(kind: AgentKind, age_ms: u64) -> bool {
    let window = if kind == AgentKind::Trae {
        TRAE_SOLO_MTIME_BUSY_MS
    } else {
        SHELL_AGENT_MTIME_BUSY_MS
    };
    age_ms < window
}

fn shell_kinds() -> [AgentKind; 4] {
    [
        AgentKind::WorkBuddy,
        AgentKind::Trae,
        AgentKind::TraeCode,
        AgentKind::Qoder,
    ]
}

fn exe_names_for(kind: AgentKind) -> &'static [&'static str] {
    let id = match kind {
        AgentKind::WorkBuddy => WORKBUDDY_APP_TARGET_ID,
        AgentKind::Trae => TRAE_APP_TARGET_ID,
        AgentKind::TraeCode => TRAE_CODE_APP_TARGET_ID,
        AgentKind::Qoder => QODER_APP_TARGET_ID,
        _ => return &[],
    };
    preset_process_names(id).unwrap_or(&[])
}

fn trae_solo_activity_roots() -> Vec<PathBuf> {
    let mut roots = Vec::new();
    if let Ok(appdata) = std::env::var("APPDATA") {
        let base = PathBuf::from(appdata);
        for name in ["TRAE SOLO", "TRAE SOLO CN", "TraeWork", "Trae Work"] {
            let root = base.join(name);
            roots.push(root.join("logs"));
            roots.push(root.join("ModularData").join("ai-agent"));
            roots.push(
                root.join("User")
                    .join("globalStorage")
                    .join("state.vscdb"),
            );
        }
    }
    if let Some(home) = std::env::var_os("USERPROFILE").or_else(|| std::env::var_os("HOME")) {
        let home = PathBuf::from(home);
        for dir in [".trae", ".trae-cn"] {
            let base = home.join(dir);
            for sub in ["work", "memory", "attachments", "assistant"] {
                roots.push(base.join(sub));
            }
        }
    }
    roots
}

fn trae_code_activity_roots() -> Vec<PathBuf> {
    let mut roots = Vec::new();
    if let Ok(appdata) = std::env::var("APPDATA") {
        let base = PathBuf::from(appdata);
        // IDE / TraeCode — exclude SOLO Work trees.
        for name in ["Trae", "Trae CN", "Trae IDE"] {
            let root = base.join(name);
            roots.push(root.join("logs"));
            roots.push(root.join("ModularData").join("ai-agent"));
            roots.push(
                root.join("User")
                    .join("globalStorage")
                    .join("state.vscdb"),
            );
        }
    }
    roots
}

fn mtime_roots(kind: AgentKind) -> Vec<PathBuf> {
    let mut roots = Vec::new();
    if let Some(profile) = shell_agent_hook_setup::profile_for_kind(kind) {
        let settings = shell_agent_hook_setup::settings_path(profile);
        if let Some(parent) = settings.parent() {
            roots.push(parent.to_path_buf());
        }
        roots.push(settings);
        if kind == AgentKind::Qoder {
            let cn = shell_agent_hook_setup::qoder_cn_settings_path();
            if let Some(parent) = cn.parent() {
                roots.push(parent.to_path_buf());
            }
            roots.push(cn);
        }
        if kind == AgentKind::TraeCode {
            let cn = shell_agent_hook_setup::trae_cn_hooks_path();
            if let Some(parent) = cn.parent() {
                roots.push(parent.to_path_buf());
            }
            roots.push(cn);
        }
    }
    if kind == AgentKind::Trae {
        // Solo / TraeWork — Cursor-style local activity.
        roots.extend(trae_solo_activity_roots());
    }
    if kind == AgentKind::TraeCode {
        roots.extend(trae_code_activity_roots());
    }
    roots
}

fn newest_mtime_age_ms(roots: &[PathBuf]) -> Option<u64> {
    let now = SystemTime::now();
    let mut newest: Option<SystemTime> = None;
    for root in roots {
        visit_mtime(root, 0, &mut newest);
    }
    let ts = newest?;
    let age = now.duration_since(ts).unwrap_or(Duration::ZERO);
    Some(age.as_millis() as u64)
}

/// Shallow scan: file itself + one directory level of children (cap entries).
fn visit_mtime(path: &Path, depth: u32, newest: &mut Option<SystemTime>) {
    let meta = match std::fs::metadata(path) {
        Ok(m) => m,
        Err(_) => return,
    };
    if let Ok(modified) = meta.modified() {
        match newest {
            Some(prev) if modified <= *prev => {}
            _ => *newest = Some(modified),
        }
    }
    if depth >= 1 || !meta.is_dir() {
        return;
    }
    let Ok(rd) = std::fs::read_dir(path) else {
        return;
    };
    let mut n = 0u32;
    for ent in rd.flatten() {
        n += 1;
        if n > 64 {
            break;
        }
        visit_mtime(&ent.path(), depth + 1, newest);
    }
}

fn infer_state(kind: AgentKind) -> InferredBusy {
    let names = exe_names_for(kind);
    if names.is_empty() || !process_running_by_exe(names) {
        return InferredBusy::Absent;
    }
    // Process alive — only then touch the filesystem.
    let roots = mtime_roots(kind);
    match newest_mtime_age_ms(&roots) {
        Some(age) if infer_busy_from_mtime_age_for(kind, age) => InferredBusy::Working,
        _ => InferredBusy::Quiet,
    }
}

fn apply_inferred(kind: AgentKind, busy: InferredBusy) {
    let prev = store::primary_state_for(kind);
    let prev_src = store::lifecycle_source_for(kind);
    if matches!(prev, Some(AttentionState::NeedsInput)) {
        return;
    }
    if prev_src == Some(SignalSource::OfficialHook)
        && matches!(
            prev,
            Some(AttentionState::Working)
                | Some(AttentionState::Complete)
                | Some(AttentionState::Error)
        )
    {
        // Recent official hook lifecycle — do not clobber with process guess.
        return;
    }
    match busy {
        InferredBusy::Working => {
            // WorkBuddy / Qoder: no realtime motion lamp from process/mtime chatter.
            // Trae Work + Trae Code: Cursor-style inferred Working (OfficialHook still wins above).
            if matches!(kind, AgentKind::WorkBuddy | AgentKind::Qoder) {
                if prev == Some(AttentionState::Working) && prev_src == Some(SignalSource::Inferred) {
                    raise_lifecycle(kind, None, AttentionState::Idle, SignalSource::Inferred);
                }
                return;
            }
            if prev == Some(AttentionState::Working) && prev_src == Some(SignalSource::Inferred) {
                return;
            }
            if prev == Some(AttentionState::Working) {
                return;
            }
            raise_lifecycle(kind, None, AttentionState::Working, SignalSource::Inferred);
        }
        InferredBusy::Quiet | InferredBusy::Absent => {
            if prev == Some(AttentionState::Working) && prev_src == Some(SignalSource::Inferred) {
                raise_lifecycle(kind, None, AttentionState::Idle, SignalSource::Inferred);
            }
        }
    }
}

fn refresh_configured_if_due(force: bool) {
    let mut g = match configured_cache().lock() {
        Ok(g) => g,
        Err(_) => return,
    };
    let due = force
        || g.force_refresh
        || g.refreshed_at
            .map(|t| t.elapsed() >= Duration::from_secs(CONFIGURED_REFRESH_SECS))
            .unwrap_or(true);
    if !due {
        return;
    }
    g.force_refresh = false;
    for kind in shell_kinds() {
        let configured = if kind == AgentKind::Trae {
            // Solo: inferred activity only — no OfficialHook profile.
            false
        } else {
            shell_agent_hook_setup::setup_status(kind.as_str())
                .map(|s| s.onetone_configured)
                .unwrap_or(false)
        };
        match kind {
            AgentKind::WorkBuddy => g.workbuddy = Some(configured),
            AgentKind::Trae => g.trae = Some(configured),
            AgentKind::Qoder => g.qoder = Some(configured),
            _ => {}
        }
    }
    g.trae_code = Some(
        shell_agent_hook_setup::setup_status(AgentKind::TraeCode.as_str())
            .map(|s| s.onetone_configured)
            .unwrap_or(false),
    );
    g.refreshed_at = Some(Instant::now());
}

fn label_for(kind: AgentKind) -> &'static str {
    match kind {
        AgentKind::WorkBuddy => "WorkBuddy",
        AgentKind::Trae => "Trae",
        AgentKind::Qoder => "Qoder",
        _ => kind.as_str(),
    }
}

fn state_wire(busy: InferredBusy) -> &'static str {
    match busy {
        InferredBusy::Working => "working",
        InferredBusy::Quiet => "quiet",
        InferredBusy::Absent => "absent",
    }
}

fn publish_edges(
    app: &tauri::AppHandle,
    state: &AppState,
    kind: AgentKind,
    busy: InferredBusy,
    configured: Option<bool>,
) {
    let mut last = match last_published().lock() {
        Ok(g) => g,
        Err(_) => return,
    };
    let (prev_state, prev_cfg) = match kind {
        AgentKind::WorkBuddy => (last.workbuddy, last.workbuddy_cfg),
        AgentKind::Trae => (last.trae, last.trae_cfg),
        AgentKind::Qoder => (last.qoder, last.qoder_cfg),
        _ => return,
    };
    let wire = state_wire(busy);
    let state_changed = prev_state != Some(wire);
    let cfg_changed = configured.is_some() && prev_cfg != configured;
    if !state_changed && !cfg_changed {
        return;
    }
    match kind {
        AgentKind::WorkBuddy => {
            last.workbuddy = Some(wire);
            if let Some(c) = configured {
                last.workbuddy_cfg = Some(c);
            }
        }
        AgentKind::Trae => {
            last.trae = Some(wire);
            if let Some(c) = configured {
                last.trae_cfg = Some(c);
            }
        }
        AgentKind::Qoder => {
            last.qoder = Some(wire);
            if let Some(c) = configured {
                last.qoder_cfg = Some(c);
            }
        }
        _ => return,
    }
    let msg = format!("{} 状态变化", label_for(kind));
    crate::runtime_event::publish_runtime_event(
        Some(app),
        state,
        "shell_agent",
        crate::runtime_event::kind::SHELL_AGENT_STATE_CHANGED,
        &msg,
        Some(serde_json::json!({
            "agent": kind.as_str(),
            "state": wire,
            "hookConfigured": configured,
        })),
    );
}

/// Apply one process/mtime pass (also used from overlay tick).
pub fn sync_shell_inferred_lifecycle() {
    for kind in shell_kinds() {
        let busy = infer_state(kind);
        apply_inferred(kind, busy);
    }
}

pub fn start_shell_agent_process_poll(app: tauri::AppHandle, state: std::sync::Arc<AppState>) {
    if STARTED.swap(true, Ordering::SeqCst) {
        return;
    }
    std::thread::Builder::new()
        .name("shell-agent-process".into())
        .spawn(move || {
            refresh_configured_if_due(true);
            loop {
                refresh_configured_if_due(false);
                for kind in shell_kinds() {
                    let busy = infer_state(kind);
                    apply_inferred(kind, busy);
                    let cfg = hook_configured(kind);
                    publish_edges(&app, state.as_ref(), kind, busy, cfg);
                }
                crate::codex_micro_overlay::push_overlay_status(&app, state.as_ref());
                std::thread::sleep(Duration::from_secs(PROCESS_POLL_SECS));
            }
        })
        .ok();
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn nonexistent_exe_is_not_running() {
        assert!(!process_running_by_exe(&["nonexistent-onetone-xyz.exe"]));
    }

    #[test]
    fn infer_busy_from_mtime_age_uses_60s_threshold() {
        assert!(infer_busy_from_mtime_age(0));
        assert!(infer_busy_from_mtime_age(SHELL_AGENT_MTIME_BUSY_MS - 1));
        assert!(!infer_busy_from_mtime_age(SHELL_AGENT_MTIME_BUSY_MS));
        assert!(!infer_busy_from_mtime_age(SHELL_AGENT_MTIME_BUSY_MS + 5_000));
    }

    #[test]
    fn workbuddy_never_raises_inferred_working() {
        // Guard: WorkBuddy/Qoder stay Hook-only; Trae Work + Trae Code may publish Inferred Working.
        let src = include_str!("shell_agent_process.rs");
        assert!(
            src.contains("matches!(kind, AgentKind::WorkBuddy | AgentKind::Qoder)"),
            "WorkBuddy/Qoder must not publish Inferred Working"
        );
        assert!(
            src.contains("trae_solo_activity_roots") && src.contains("trae_code_activity_roots"),
            "Trae Work + Trae Code watch client activity trees"
        );
        let apply = src
            .split("fn apply_inferred")
            .nth(1)
            .unwrap_or("")
            .split("fn refresh_configured_if_due")
            .next()
            .unwrap_or("");
        assert!(
            apply.contains("AgentKind::WorkBuddy | AgentKind::Qoder"),
            "apply_inferred still blocks WorkBuddy/Qoder"
        );
        assert!(
            !apply.contains("AgentKind::WorkBuddy | AgentKind::TraeCode | AgentKind::Qoder"),
            "TraeCode no longer Hook-only for inferred Working"
        );
    }
}
