//! Pad status diagnose + Claude Activity Pad inject/clear (diagnostic use).

use serde::Serialize;
use std::path::PathBuf;
use std::sync::Arc;
use tauri::{AppHandle, State};

use crate::codex_micro_overlay::{
    resolve_claude_agent_light_hosts, ClaudeOverflowItem,
};
use crate::config::CodexMicroPadConfig;
use crate::pad_status::{
    self, log_path, plan_hid_output, short_agent_type, tail_events, ClaudeHookPayload,
    HidOutputIntent, PadStatusLogRow,
};
use crate::AppState;

const PHASE_CONNECTED_MS: u64 = 30_000;
const PHASE_STALE_MS: u64 = 300_000;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClaudeLightDiagnoseRow {
    pub agent_key: String,
    pub agent_id: String,
    pub agent_type: String,
    pub short_label: String,
    pub state: String,
    pub host_key: String,
    pub source: String,
    pub age_ms: u64,
    pub sticky_until: u64,
    pub last_event: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClaudeOverflowDiagnoseRow {
    pub agent_key: String,
    pub agent_id: String,
    pub agent_type: String,
    pub short_label: String,
    pub state: String,
    pub reason: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClaudeActivityIssue {
    pub severity: String,
    pub title: String,
    pub reason: String,
    pub action: String,
    pub related: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PadStatusDiagnoseView {
    pub ui_status: String,
    pub state: String,
    pub phase: String,
    pub source: String,
    pub source_legacy: String,
    pub agent: String,
    pub confidence: String,
    pub updated_at: u64,
    pub age_ms: u64,
    pub message: String,
    pub task_id: String,
    pub session_id: String,
    pub last_event: String,
    pub sticky_until: u64,
    pub log_path: String,
    pub hid: HidOutputIntent,
    pub recent: Vec<PadStatusLogRow>,
    pub claude_lights: Vec<ClaudeLightDiagnoseRow>,
    pub claude_overflow: Vec<ClaudeOverflowDiagnoseRow>,
    pub claude_overflow_count: u32,
    pub claude_waiting_hint: String,
    /// connected | waiting | stale | offline
    pub claude_hook_phase: String,
    pub claude_last_event: String,
    pub claude_last_age_ms: u64,
    pub claude_last_source: String,
    pub claude_probe_exists: bool,
    pub claude_probe_log_exists: bool,
    /// True when OneTone successfully received claude_hook within connected window.
    pub claude_endpoint_recent: bool,
    pub pad_mode: String,
    pub status_lights_enabled: bool,
    pub native_connection_state: String,
    pub issues: Vec<ClaudeActivityIssue>,
    /// Soft Pad host hold from Claude Hook/App near-window (durable stamp / lights).
    pub claude_activity_hold: bool,
    pub claude_activity_age_ms: u64,
    pub terminal_has_claude_child: bool,
    pub claude_cli_latch: crate::claude_cli_session::ClaudeCliSessionLatch,
    pub claude_cli_can_inject: crate::claude_cli_session::ClaudeCliCanInject,
    pub claude_pending_approval: crate::claude_cli_session::ClaudePendingApproval,
    /// Soft Pad Arbiter waiting feed (AgentAttentionStore projection ? not PadStatus sticky).
    pub attention: crate::agent_attention::AttentionPublicSnapshot,
    pub cursor_capabilities: crate::agent_catalog::AgentCapabilities,
}

fn repo_root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .map(|p| p.to_path_buf())
        .unwrap_or_else(|| PathBuf::from(env!("CARGO_MANIFEST_DIR")))
}

fn claude_probe_path() -> PathBuf {
    repo_root().join("scripts").join("claude-hook-probe.js")
}

fn claude_probe_log_path() -> PathBuf {
    repo_root().join("logs").join("claude-hook-probe.jsonl")
}

fn pad_for_diagnose(cfg: &crate::config::VoiceConfig) -> CodexMicroPadConfig {
    for m in &cfg.mappings {
        if let Some(pad) = m.codex_micro_pad.as_ref() {
            return pad.clone();
        }
    }
    CodexMicroPadConfig {
        enabled: false,
        require_foreground: true,
        require_num_lock_off: false,
        nav_keys_enabled: true,
        capture_physical_arrows: false,
        overlay_enabled: false,
        layout_profile: String::new(),
        purpose: crate::soft_pad_purpose::SoftPadPurpose::Shortcuts,
        software_enhance_enabled: false,
        codex_status_lights_enabled: false,
        claude_status_lights_enabled: false,
        cursor_status_lights_enabled: false,
        workbuddy_status_lights_enabled: false,
        trae_status_lights_enabled: false,
        qoder_status_lights_enabled: false,
        minimax_status_lights_enabled: false,
        copilot_status_lights_enabled: false,
        gemini_status_lights_enabled: false,
        cline_status_lights_enabled: false,
        opencode_status_lights_enabled: false,
        aider_status_lights_enabled: false,
        ambient_mode: "status".into(),
        ambient_solid_rgb: String::new(),
        ambient_opacity: 100,
        ambient_enabled: true,
        key_light_preset: "default".into(),
        status_colors: Default::default(),
        topbar_habit_ids: Vec::new(),
        claude_cli_inject_pref_enabled: false,
        presentation: "full".into(),
        skin: "default".into(),
        pinned_lane_preferences: Vec::new(),
        navigation_layout_migrated: false,
        keys: vec![],
    }
}

fn light_state_rank(state: &str) -> u8 {
    match state {
        "needs_input" => 0,
        "running" => 1,
        "failed" => 2,
        "done" => 3,
        _ => 4,
    }
}

fn build_claude_diagnose(
    pad: &CodexMicroPadConfig,
    now: u64,
    primary_context_idle: bool,
) -> (
    Vec<ClaudeLightDiagnoseRow>,
    Vec<ClaudeOverflowDiagnoseRow>,
    u32,
    String,
) {
    let active = pad_status::claude_lights::snapshot_active(now);
    let (assigned, _summary, overflow_items) = resolve_claude_agent_light_hosts(pad, &active);
    let mut lights: Vec<ClaudeLightDiagnoseRow> = assigned
        .iter()
        .map(|(host, light)| {
            let age = now.saturating_sub(light.updated_at);
            ClaudeLightDiagnoseRow {
                agent_key: light.agent_key.clone(),
                agent_id: light.agent_id.clone(),
                agent_type: light.agent_type.clone(),
                short_label: short_agent_type(&light.agent_type),
                state: light.state.clone(),
                host_key: host.clone(),
                source: light.source.clone(),
                age_ms: age,
                sticky_until: light.sticky_until.unwrap_or(0),
                last_event: light.last_event.clone().unwrap_or_default(),
            }
        })
        .collect();
    lights.sort_by(|a, b| {
        light_state_rank(&a.state)
            .cmp(&light_state_rank(&b.state))
            .then_with(|| a.agent_key.cmp(&b.agent_key))
            .then_with(|| a.host_key.cmp(&b.host_key))
    });

    let overflow: Vec<ClaudeOverflowDiagnoseRow> = overflow_items
        .into_iter()
        .map(|o: ClaudeOverflowItem| ClaudeOverflowDiagnoseRow {
            agent_key: o.agent_key,
            agent_id: o.agent_id,
            agent_type: o.agent_type,
            short_label: o.short_label,
            state: o.state,
            reason: o.reason,
        })
        .collect();
    let overflow_count = overflow.len() as u32;

    let waiting_hint = if primary_context_idle {
        let mut waiting: Vec<_> = assigned
            .iter()
            .map(|(_, l)| l)
            .filter(|l| l.state == "needs_input")
            .collect();
        waiting.sort_by(|a, b| {
            a.first_seen_at
                .cmp(&b.first_seen_at)
                .then_with(|| a.agent_key.cmp(&b.agent_key))
        });
        waiting
            .first()
            .map(|l| format!("{} ????", short_agent_type(&l.agent_type)))
            .unwrap_or_default()
    } else {
        String::new()
    };

    (lights, overflow, overflow_count, waiting_hint)
}

fn is_claude_source_row(row: &PadStatusLogRow) -> bool {
    let leg = row.source_legacy.trim();
    let src = row.source.trim();
    let agent = row.agent.as_deref().unwrap_or("").trim();
    leg == "claude_hook"
        || leg == "claude_app"
        || src == "claude_hook"
        || src == "claude_app"
        || agent == "claude"
}

/// Last successful OneTone ingest of claude_hook (Core + accepted log rows + lights).
fn last_claude_endpoint_event(
    pad: &pad_status::PadStatus,
    recent: &[PadStatusLogRow],
    now: u64,
) -> (String, u64, String) {
    let mut best_ts: u64 = 0;
    let mut best_event = String::new();
    let mut best_source = String::new();

    let pad_is_claude = pad.agent.as_deref() == Some("claude")
        || pad.display_source_label() == "claude_hook"
        || pad.display_source_label() == "claude_app";
    if pad_is_claude && pad.updated_at > 0 {
        best_ts = pad.updated_at;
        best_event = pad.last_event.clone().unwrap_or_default();
        best_source = pad.display_source_label().to_string();
    }

    for row in recent.iter().rev() {
        if !row.accepted || !is_claude_source_row(row) {
            continue;
        }
        if row.ts >= best_ts {
            best_ts = row.ts;
            best_event = row.last_event.clone().unwrap_or_default();
            best_source = if !row.source_legacy.is_empty() {
                row.source_legacy.clone()
            } else {
                row.source.clone()
            };
        }
        break;
    }

    let lights = pad_status::claude_lights::snapshot_active(now);
    for light in &lights {
        if light.updated_at >= best_ts {
            best_ts = light.updated_at;
            best_event = light.last_event.clone().unwrap_or_default();
            best_source = light.source.clone();
        }
    }

    if best_ts == 0 {
        return (String::new(), 0, String::new());
    }
    let age = now.saturating_sub(best_ts);
    (best_event, age, best_source)
}

pub fn compute_claude_hook_phase(
    last_age_ms: Option<u64>,
    probe_exists: bool,
    probe_log_exists: bool,
) -> &'static str {
    match last_age_ms {
        Some(age) if age <= PHASE_CONNECTED_MS => "connected",
        Some(age) if age <= PHASE_STALE_MS => "stale",
        Some(_) => "offline",
        None => {
            // probe exists ? hooks configured; waiting only when script present and no event/log
            if probe_exists && !probe_log_exists {
                "waiting"
            } else {
                "offline"
            }
        }
    }
}

fn build_claude_issues(
    phase: &str,
    probe_exists: bool,
    probe_log_exists: bool,
    endpoint_recent: bool,
    pad_mode: &str,
    status_lights: bool,
    native_conn: &str,
    overflow_count: u32,
    waiting_hint: &str,
) -> Vec<ClaudeActivityIssue> {
    let mut out = Vec::new();
    if !probe_exists {
        out.push(ClaudeActivityIssue {
            severity: "error".into(),
            title: "?? Claude Hook ??".into(),
            reason: "scripts/claude-hook-probe.js ????".into(),
            action: "????????? scripts/claude-hooks.example.json ?? Claude Code hooks?"
                .into(),
            related: "scripts/claude-hook-probe.js".into(),
        });
    }
    if phase == "offline" && probe_exists {
        out.push(ClaudeActivityIssue {
            severity: "error".into(),
            title: "??? Claude Hook".into(),
            reason: if probe_log_exists {
                "? probe ???? OneTone ? 5 ??????? claude_hook?".into()
            } else {
                "?? 5 ???? claude_hook ?????? probe ???".into()
            },
            action: "? Soft Pad?Claude Activity ?????????????? Claude CLI ??? prompt?"
                .into(),
            related: "scripts/claude-hooks.example.json ? /api/codex-app/state".into(),
        });
    }
    if phase == "waiting" {
        out.push(ClaudeActivityIssue {
            severity: "warn".into(),
            title: "????".into(),
            reason: "Hook ??????????? claude_hook?".into(),
            action: "?? Claude Code ??? prompt???????????????"
                .into(),
            related: "scripts/claude-hook-probe.js ? SessionStart".into(),
        });
    }
    if phase == "stale" {
        out.push(ClaudeActivityIssue {
            severity: "warn".into(),
            title: "Claude Hook ???".into(),
            reason: "?? 30 ?????? claude_hook?".into(),
            action: "? Claude Code ????? prompt / PermissionRequest?".into(),
            related: "claude_hook".into(),
        });
    }
    if probe_log_exists && !endpoint_recent && phase != "connected" {
        out.push(ClaudeActivityIssue {
            severity: "info".into(),
            title: "Probe ?? ? Endpoint ??".into(),
            reason: "claude-hook-probe.jsonl ??????? /api/codex-app/state ???????"
                .into(),
            action: "?? OneTone ??????/Labs listener ???".into(),
            related: "logs/claude-hook-probe.jsonl".into(),
        });
    }
    if pad_mode != "codex" {
        out.push(ClaudeActivityIssue {
            severity: "info".into(),
            title: "Soft Pad ??????".into(),
            reason: "?? padMode=numpad??? AG/ACT ??????".into(),
            action: "??? Codex ??????? AG/ACT ????".into(),
            related: "padMode".into(),
        });
    }
    if !status_lights {
        out.push(ClaudeActivityIssue {
            severity: "info".into(),
            title: "??????".into(),
            reason: "Hook ???? Core?overlay ?? Codex status ???Claude Activity ??????"
                .into(),
            action: "?? Soft Pad ???????????Codex ?????".into(),
            related: "codexStatusLightsEnabled".into(),
        });
    }
    if native_conn == "fallback" {
        out.push(ClaudeActivityIssue {
            severity: "info".into(),
            title: "Native Micro ? fallback".into(),
            reason: "??? Micro thstatus???? Claude Hook?".into(),
            action: "??? Claude Activity ???? Micro ???????".into(),
            related: "v.oai.thstatus".into(),
        });
    }
    if overflow_count > 0 {
        out.push(ClaudeActivityIssue {
            severity: "warn".into(),
            title: "Claude ??? overflow".into(),
            reason: format!("? {overflow_count} ? agent ????AG ????? ACT/NAV??"),
            action: "???????????? status ??????? agentLightId???? UI??"
                .into(),
            related: "agentLightsOverflowItems".into(),
        });
    }
    if !waiting_hint.is_empty() {
        out.push(ClaudeActivityIssue {
            severity: "info".into(),
            title: waiting_hint.to_string(),
            reason: "Claude needs_input?? context idle ? ACT08/ACT12 ??????".into(),
            action: "? Claude ??/????? Soft Pad ACT12/ACT08?".into(),
            related: "claudeWaitingHint".into(),
        });
    }
    out.sort_by(|a, b| {
        let rank = |s: &str| match s {
            "error" => 0u8,
            "warn" => 1,
            _ => 2,
        };
        rank(&a.severity)
            .cmp(&rank(&b.severity))
            .then_with(|| a.title.cmp(&b.title))
    });
    out
}

/// Explain current lamp: Core snapshot + Claude Activity Pad fields.
#[tauri::command]
pub fn cmd_pad_status_diagnose(
    state: State<'_, Arc<AppState>>,
    limit: Option<u32>,
) -> PadStatusDiagnoseView {
    let lim = limit.unwrap_or(48) as usize;
    let pad = pad_status::snapshot();
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);
    let recent = tail_events(lim);
    let vendor = crate::codex_micro_vendor::protocol_snapshot();
    let (lights_on, pad_cfg) = {
        let cfg = state.cfg.lock();
        (
            crate::codex_micro_overlay::status_lights_enabled(&cfg),
            pad_for_diagnose(&cfg),
        )
    };
    let hid = plan_hid_output(&pad, lights_on);
    let ui_status = pad_status::ui_status_from_pad(&pad);
    let primary_idle = ui_status.trim() == "idle";
    let (claude_lights, claude_overflow, claude_overflow_count, claude_waiting_hint) =
        build_claude_diagnose(&pad_cfg, now, primary_idle);

    let probe_exists = claude_probe_path().is_file();
    let probe_log_exists = claude_probe_log_path().is_file();
    let (claude_last_event, claude_last_age_ms, claude_last_source) =
        last_claude_endpoint_event(&pad, &recent, now);
    let last_age_opt = if claude_last_source.is_empty() && claude_last_event.is_empty() {
        None
    } else {
        Some(claude_last_age_ms)
    };
    let claude_hook_phase =
        compute_claude_hook_phase(last_age_opt, probe_exists, probe_log_exists).to_string();
    let claude_endpoint_recent = matches!(last_age_opt, Some(age) if age <= PHASE_CONNECTED_MS);
    let pad_mode = if pad_cfg.enabled {
        "codex".to_string()
    } else {
        "numpad".to_string()
    };
    let native_connection_state = vendor.connection_state.clone();
    let claude_activity_hold = crate::codex_micro_overlay::claude_activity_hold_at(now);
    let claude_activity_age_ms =
        crate::codex_micro_overlay::claude_activity_age_ms_for_diagnose(now);
    let issues = build_claude_issues(
        &claude_hook_phase,
        probe_exists,
        probe_log_exists,
        claude_endpoint_recent,
        &pad_mode,
        lights_on,
        &native_connection_state,
        claude_overflow_count,
        &claude_waiting_hint,
    );

    PadStatusDiagnoseView {
        ui_status,
        state: pad.state.clone(),
        phase: pad.phase.clone().unwrap_or_default(),
        source: pad.source.clone(),
        source_legacy: pad.display_source_label().to_string(),
        agent: pad.agent.clone().unwrap_or_default(),
        confidence: pad.confidence.clone(),
        updated_at: pad.updated_at,
        age_ms: pad.age_ms(now),
        message: pad.message.clone().unwrap_or_default(),
        task_id: pad.task_id.clone().unwrap_or_default(),
        session_id: pad.session_id.clone().unwrap_or_default(),
        last_event: pad.last_event.clone().unwrap_or_default(),
        sticky_until: pad.sticky_until.unwrap_or(0),
        log_path: log_path().display().to_string(),
        hid,
        recent,
        claude_lights,
        claude_overflow,
        claude_overflow_count,
        claude_waiting_hint,
        claude_hook_phase,
        claude_last_event,
        claude_last_age_ms,
        claude_last_source,
        claude_probe_exists: probe_exists,
        claude_probe_log_exists: probe_log_exists,
        claude_endpoint_recent,
        pad_mode,
        status_lights_enabled: lights_on,
        native_connection_state,
        issues,
        claude_activity_hold,
        claude_activity_age_ms,
        terminal_has_claude_child: crate::claude_cli_session::terminal_has_claude_child(),
        claude_cli_latch: crate::claude_cli_session::claude_cli_session_latch(),
        claude_cli_can_inject: crate::claude_cli_session::claude_cli_can_inject(),
        claude_pending_approval: crate::claude_cli_session::pending_approval_view(),
        attention: crate::agent_attention::public_snapshot(),
        cursor_capabilities: crate::agent_catalog::cursor_capabilities(),
    }
}

fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// Diagnostic inject: claude_hook only ? never thstatus / Soft RGB driver.
#[tauri::command]
pub fn cmd_claude_activity_inject(preset: String) -> Result<String, String> {
    let preset = preset.trim();
    let now = now_ms();
    match preset {
        "session_start" => {
            let _ = pad_status::ingest_claude_payload_at(
                &ClaudeHookPayload {
                    event: "SessionStart".into(),
                    session_id: "diag".into(),
                    turn_id: String::new(),
                    agent_id: String::new(),
                    agent_type: String::new(),
                    cwd: String::new(),
                    ts: now,
                    source: "claude_hook".into(),
                },
                now,
            );
        }
        "running" => {
            let _ = pad_status::ingest_claude_payload_at(
                &ClaudeHookPayload {
                    event: "UserPromptSubmit".into(),
                    session_id: "diag".into(),
                    turn_id: "t-run".into(),
                    agent_id: String::new(),
                    agent_type: String::new(),
                    cwd: String::new(),
                    ts: now,
                    source: "claude_hook".into(),
                },
                now,
            );
        }
        "needs_input" => {
            let _ = pad_status::ingest_claude_payload_at(
                &ClaudeHookPayload {
                    event: "PermissionRequest".into(),
                    session_id: "diag".into(),
                    turn_id: "t-need".into(),
                    agent_id: "diag-review".into(),
                    agent_type: "code-reviewer".into(),
                    cwd: String::new(),
                    ts: now,
                    source: "claude_hook".into(),
                },
                now,
            );
        }
        "failed" => {
            let _ = pad_status::ingest_claude_payload_at(
                &ClaudeHookPayload {
                    event: "StopFailure".into(),
                    session_id: "diag".into(),
                    turn_id: "t-fail".into(),
                    agent_id: "diag-fail".into(),
                    agent_type: "debugger".into(),
                    cwd: String::new(),
                    ts: now,
                    source: "claude_hook".into(),
                },
                now,
            );
        }
        "two_subagents" => {
            let _ = pad_status::ingest_claude_payload_at(
                &ClaudeHookPayload {
                    event: "SubagentStart".into(),
                    session_id: "diag".into(),
                    turn_id: "t-a1".into(),
                    agent_id: "a1".into(),
                    agent_type: "code-reviewer".into(),
                    cwd: String::new(),
                    ts: now,
                    source: "claude_hook".into(),
                },
                now,
            );
            let _ = pad_status::ingest_claude_payload_at(
                &ClaudeHookPayload {
                    event: "SubagentStart".into(),
                    session_id: "diag".into(),
                    turn_id: "t-a2".into(),
                    agent_id: "a2".into(),
                    agent_type: "test-runner".into(),
                    cwd: String::new(),
                    ts: now.saturating_add(1),
                    source: "claude_hook".into(),
                },
                now.saturating_add(1),
            );
        }
        "subagent_stop" => {
            let _ = pad_status::ingest_claude_payload_at(
                &ClaudeHookPayload {
                    event: "SubagentStop".into(),
                    session_id: "diag".into(),
                    turn_id: "t-a1".into(),
                    agent_id: "a1".into(),
                    agent_type: "code-reviewer".into(),
                    cwd: String::new(),
                    ts: now,
                    source: "claude_hook".into(),
                },
                now,
            );
        }
        _ => return Err(format!("unknown_preset:{preset}")),
    }
    Ok(preset.to_string())
}

/// Clear Claude activity lights only (diagnose). Does not cancel Claude tasks.
#[tauri::command]
pub fn cmd_claude_activity_clear() -> Result<(), String> {
    pad_status::claude_lights::clear_all();
    Ok(())
}

fn claude_setup_status_inputs(state: &AppState) -> crate::claude_hook_setup::StatusInputs {
    let soft_pad_visible = {
        let reason = crate::codex_micro_overlay::overlay_visible_reason();
        !reason.is_empty() && reason != "hidden"
    };
    let cli_pref = {
        let cfg = state.cfg.lock();
        cfg.mappings
            .iter()
            .find_map(|m| {
                m.codex_micro_pad
                    .as_ref()
                    .map(|p| p.claude_cli_inject_pref_enabled)
            })
            .unwrap_or(false)
    };
    let can = crate::claude_cli_session::claude_cli_can_inject();
    let now = now_ms();
    let age = pad_status::claude_lights::last_activity_age_ms(now);
    let pad = pad_status::snapshot();
    let last_event = if pad.agent.as_deref() == Some("claude") {
        pad.last_event.clone().unwrap_or_default()
    } else {
        pad_status::claude_lights::snapshot_active(now)
            .into_iter()
            .filter_map(|l| l.last_event)
            .next()
            .unwrap_or_default()
    };
    crate::claude_hook_setup::StatusInputs {
        soft_pad_visible,
        cli_pref_enabled: cli_pref,
        cli_can_inject: can.ok && cli_pref,
        last_event,
        last_age_ms: age,
    }
}

#[tauri::command]
pub fn cmd_claude_hook_setup_status(
    state: State<'_, Arc<AppState>>,
) -> crate::claude_hook_setup::ClaudeHookSetupStatus {
    crate::claude_hook_setup::setup_status(claude_setup_status_inputs(state.inner()))
}

#[tauri::command]
pub fn cmd_claude_hook_install_confirm() -> crate::claude_hook_setup::ClaudeHookWriteResult {
    crate::claude_hook_setup::install_confirm()
}

#[tauri::command]
pub fn cmd_claude_hook_uninstall_onetone() -> crate::claude_hook_setup::ClaudeHookWriteResult {
    crate::claude_hook_setup::uninstall_onetone()
}

#[tauri::command]
pub fn cmd_shell_agent_hook_setup_status(
    kind: String,
) -> Result<crate::shell_agent_hook_setup::ShellHookSetupStatus, String> {
    match kind.trim().to_ascii_lowercase().as_str() {
        "cline" | "cline-chat" => crate::cline_hook_setup::setup_status(),
        "opencode" | "opencode-chat" | "open-code" => crate::opencode_hook_setup::setup_status(),
        "aider" | "aider-chat" => crate::aider_hook_setup::setup_status(),
        _ => crate::shell_agent_hook_setup::setup_status(kind.trim()),
    }
}

#[tauri::command]
pub fn cmd_shell_agent_hook_install_confirm(
    kind: String,
) -> crate::shell_agent_hook_setup::ShellHookWriteResult {
    match kind.trim().to_ascii_lowercase().as_str() {
        "cline" | "cline-chat" => crate::cline_hook_setup::install_confirm(),
        "opencode" | "opencode-chat" | "open-code" => crate::opencode_hook_setup::install_confirm(),
        "aider" | "aider-chat" => crate::aider_hook_setup::install_confirm(),
        _ => crate::shell_agent_hook_setup::install_confirm(kind.trim()),
    }
}

#[tauri::command]
pub fn cmd_shell_agent_hook_uninstall(
    kind: String,
) -> crate::shell_agent_hook_setup::ShellHookWriteResult {
    match kind.trim().to_ascii_lowercase().as_str() {
        "cline" | "cline-chat" => crate::cline_hook_setup::uninstall(),
        "opencode" | "opencode-chat" | "open-code" => crate::opencode_hook_setup::uninstall(),
        "aider" | "aider-chat" => crate::aider_hook_setup::uninstall(),
        _ => crate::shell_agent_hook_setup::uninstall(kind.trim()),
    }
}

#[tauri::command]
pub fn cmd_cursor_activity_pref_get(
    state: State<'_, Arc<AppState>>,
) -> Result<serde_json::Value, String> {
    let enabled = state.cfg.lock().cursor_activity_stats_enabled;
    Ok(serde_json::json!({
        "enabled": enabled,
        "consent": enabled,
    }))
}

#[tauri::command]
pub fn cmd_cursor_activity_pref_set(
    state: State<'_, Arc<AppState>>,
    app: AppHandle,
    enabled: bool,
) -> Result<serde_json::Value, String> {
    {
        let mut cfg = state.cfg.lock();
        cfg.cursor_activity_stats_enabled = enabled;
        crate::config::save_config(&cfg);
    }
    crate::cursor_local_activity::set_consent_enabled(enabled);
    crate::cursor_local_activity::refresh_once();
    crate::codex_micro_overlay::request_overlay_push(&app, state.inner().as_ref(), false);
    Ok(serde_json::json!({
        "ok": true,
        "enabled": enabled,
    }))
}

#[tauri::command]
pub fn cmd_minimax_coding_key_get() -> Result<serde_json::Value, String> {
    let masked = crate::provider_usage::masked_stored_minimax_coding_key();
    Ok(serde_json::json!({
        "configured": masked.is_some(),
        "masked": masked.unwrap_or_default(),
        "consoleUrl": crate::provider_usage::ProviderId::MiniMax.console_url(),
    }))
}

/// Save or clear Soft Pad MiniMax Coding Plan API key, then refresh 5h windows.
#[tauri::command]
pub fn cmd_minimax_coding_key_set(
    app: AppHandle,
    state: State<'_, Arc<AppState>>,
    key: String,
) -> Result<serde_json::Value, String> {
    crate::provider_usage::apply_minimax_coding_key(&key)?;
    crate::codex_micro_overlay::request_overlay_push(&app, state.inner().as_ref(), false);
    let masked = crate::provider_usage::masked_stored_minimax_coding_key();
    Ok(serde_json::json!({
        "ok": true,
        "configured": masked.is_some(),
        "masked": masked.unwrap_or_default(),
    }))
}

#[tauri::command]
pub fn cmd_soft_pad_provider_key_get(provider: String) -> Result<serde_json::Value, String> {
    let p = crate::soft_pad_quota::SoftPadQuotaProvider::from_str(&provider)
        .ok_or_else(|| format!("bad_provider:{provider}"))?;
    let masked = crate::soft_pad_quota::masked_stored_key(p);
    Ok(serde_json::json!({
        "provider": p.as_str(),
        "configured": masked.is_some(),
        "masked": masked.unwrap_or_default(),
        "consoleUrl": p.console_url(),
    }))
}

/// Save or clear Soft Pad multi-provider API key, then async-verify + refresh quota cache.
///
/// TODO(post-p2): migrate to OS keyring or single encrypted blob at
/// {data_root}/keys.bin with machine-id derived key.
#[tauri::command]
pub fn cmd_soft_pad_provider_key_set(
    app: AppHandle,
    state: State<'_, Arc<AppState>>,
    provider: String,
    key: String,
) -> Result<serde_json::Value, String> {
    let p = crate::soft_pad_quota::SoftPadQuotaProvider::from_str(&provider)
        .ok_or_else(|| format!("bad_provider:{provider}"))?;
    crate::soft_pad_quota::apply_provider_key(p, &key)?;
    crate::codex_micro_overlay::request_overlay_push(&app, state.inner().as_ref(), false);
    let masked = crate::soft_pad_quota::masked_stored_key(p);
    Ok(serde_json::json!({
        "ok": true,
        "provider": p.as_str(),
        "configured": masked.is_some(),
        "masked": masked.unwrap_or_default(),
    }))
}

#[tauri::command]
pub fn cmd_claude_cli_inject_pref_set(
    state: State<'_, Arc<AppState>>,
    mapping_id: String,
    enabled: bool,
) -> Result<serde_json::Value, String> {
    let mapping_id = mapping_id.trim().to_string();
    if mapping_id.is_empty() {
        return Err("mapping_id_empty".into());
    }
    {
        let mut cfg = state.cfg.lock();
        let Some(mapping) = cfg.mappings.iter_mut().find(|m| m.id == mapping_id) else {
            return Err("mapping_not_found".into());
        };
        let pad = mapping
            .codex_micro_pad
            .get_or_insert_with(crate::codex_numpad_layer::default_codex_micro_pad);
        pad.claude_cli_inject_pref_enabled = enabled;
        crate::config::save_config(&cfg);
        crate::codex_numpad_layer::sync_hook_cache(&cfg);
    }
    Ok(serde_json::json!({
        "ok": true,
        "enabled": enabled,
        "label": if enabled {
            "????????"
        } else {
            "??????????"
        }
    }))
}

#[tauri::command]
pub fn cmd_claude_cli_inject(action: String) -> crate::claude_cli_session::ClaudeCliInjectResult {
    crate::claude_cli_session::claude_cli_inject(&action)
}

#[tauri::command]
pub fn cmd_claude_cli_decide(decision: String) -> crate::claude_cli_session::ClaudeCliInjectResult {
    crate::claude_cli_session::claude_cli_decide(&decision)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::CodexMicroPadConfig;

    #[test]
    fn diagnose_claude_lights_use_resolver_host() {
        let _g = pad_status::test_lock();
        pad_status::reset_for_test();
        pad_status::claude_lights::reset_for_test();
        pad_status::claude_lights::apply_claude_light(
            "SubagentStart",
            "a1",
            "code-reviewer",
            "claude_hook",
            "s",
            "t",
            10,
            10,
        );
        let pad = CodexMicroPadConfig {
            enabled: true,
            require_foreground: true,
            require_num_lock_off: false,
            nav_keys_enabled: true,
        capture_physical_arrows: false,
        overlay_enabled: true,
            layout_profile: "standard".into(),
            purpose: crate::soft_pad_purpose::SoftPadPurpose::Shortcuts,
            software_enhance_enabled: false,
            codex_status_lights_enabled: true,
            claude_status_lights_enabled: false,
            cursor_status_lights_enabled: false,
            workbuddy_status_lights_enabled: false,
            trae_status_lights_enabled: false,
            qoder_status_lights_enabled: false,
            minimax_status_lights_enabled: false,
            copilot_status_lights_enabled: false,
            gemini_status_lights_enabled: false,
            cline_status_lights_enabled: false,
            opencode_status_lights_enabled: false,
            aider_status_lights_enabled: false,
            ambient_mode: "status".into(),
            ambient_solid_rgb: String::new(),
            ambient_opacity: 100,
            ambient_enabled: true,
            key_light_preset: "default".into(),
            status_colors: Default::default(),
            topbar_habit_ids: Vec::new(),
            claude_cli_inject_pref_enabled: false,
            presentation: "full".into(),
            skin: "default".into(),
            pinned_lane_preferences: Vec::new(),
        navigation_layout_migrated: false,
            keys: vec![
                crate::config::CodexMicroPadKeyRoute {
                    micro_key_id: "AG04".into(),
                    source_scan: 0x4C,
                    source_extended: false,
                    slot_id: "status".into(),
                    ui_icon_id: "status".into(),
                    enabled: true,
                    advanced: false,
                    agent_light_id: String::new(),
                light_rgb: String::new(),
                key_role: None,
                auto_assignable: None,
                },
                crate::config::CodexMicroPadKeyRoute {
                    micro_key_id: "AG01".into(),
                    source_scan: 0x48,
                    source_extended: false,
                    slot_id: "claudeModel".into(),
                    ui_icon_id: "claude".into(),
                    enabled: true,
                    advanced: false,
                    agent_light_id: String::new(),
                light_rgb: String::new(),
                key_role: None,
                auto_assignable: None,
                },
            ],
        };
        let (lights, overflow, count, hint) = build_claude_diagnose(&pad, 10, true);
        assert_eq!(lights.len(), 1);
        assert_eq!(lights[0].short_label, "reviewer");
        assert!(!lights[0].host_key.is_empty());
        assert_ne!(lights[0].host_key, "AG04");
        assert_eq!(count, 0);
        assert!(overflow.is_empty());
        assert!(hint.is_empty());
    }

    #[test]
    fn diagnose_waiting_hint_when_idle() {
        let _g = pad_status::test_lock();
        pad_status::reset_for_test();
        pad_status::claude_lights::reset_for_test();
        pad_status::claude_lights::apply_claude_light(
            "PermissionRequest",
            "w1",
            "code-reviewer",
            "claude_hook",
            "s",
            "t",
            10,
            10,
        );
        let pad = CodexMicroPadConfig {
            enabled: true,
            require_foreground: true,
            require_num_lock_off: false,
            nav_keys_enabled: true,
        capture_physical_arrows: false,
        overlay_enabled: true,
            layout_profile: "standard".into(),
            purpose: crate::soft_pad_purpose::SoftPadPurpose::Shortcuts,
            software_enhance_enabled: false,
            codex_status_lights_enabled: true,
            claude_status_lights_enabled: false,
            cursor_status_lights_enabled: false,
            workbuddy_status_lights_enabled: false,
            trae_status_lights_enabled: false,
            qoder_status_lights_enabled: false,
            minimax_status_lights_enabled: false,
            copilot_status_lights_enabled: false,
            gemini_status_lights_enabled: false,
            cline_status_lights_enabled: false,
            opencode_status_lights_enabled: false,
            aider_status_lights_enabled: false,
            ambient_mode: "status".into(),
            ambient_solid_rgb: String::new(),
            ambient_opacity: 100,
            ambient_enabled: true,
            key_light_preset: "default".into(),
            status_colors: Default::default(),
            topbar_habit_ids: Vec::new(),
            claude_cli_inject_pref_enabled: false,
            presentation: "full".into(),
            skin: "default".into(),
            pinned_lane_preferences: Vec::new(),
        navigation_layout_migrated: false,
            keys: vec![],
        };
        let (_l, _o, _c, hint) = build_claude_diagnose(&pad, 10, true);
        assert_eq!(hint, "reviewer ????");
        let (_l2, _o2, _c2, hint2) = build_claude_diagnose(&pad, 10, false);
        assert!(hint2.is_empty());
    }

    #[test]
    fn claude_hook_phase_rules() {
        assert_eq!(
            compute_claude_hook_phase(Some(1_000), true, true),
            "connected"
        );
        assert_eq!(
            compute_claude_hook_phase(Some(60_000), true, true),
            "stale"
        );
        assert_eq!(
            compute_claude_hook_phase(Some(400_000), true, true),
            "offline"
        );
        assert_eq!(compute_claude_hook_phase(None, true, false), "waiting");
        assert_eq!(compute_claude_hook_phase(None, false, false), "offline");
        assert_eq!(compute_claude_hook_phase(None, true, true), "offline");
    }

    #[test]
    fn inject_two_subagents_is_claude_hook_only() {
        let _g = pad_status::test_lock();
        pad_status::reset_for_test();
        pad_status::claude_lights::reset_for_test();
        assert_eq!(
            cmd_claude_activity_inject("two_subagents".into()).unwrap(),
            "two_subagents"
        );
        let now = now_ms();
        let lights = pad_status::claude_lights::snapshot_active(now);
        assert!(lights.len() >= 2);
        assert!(lights.iter().all(|l| l.source == "claude_hook"));
        cmd_claude_activity_clear().unwrap();
        assert!(pad_status::claude_lights::snapshot_active(now).is_empty());
    }
}

/// Clear error/failed lamps. Optional sessionId / laneId for per-session clear.
#[tauri::command]
pub fn cmd_pad_status_clear_errors(
    session_id: Option<String>,
    lane_id: Option<String>,
) -> serde_json::Value {
    use crate::agent_lane::model::LaneState;
    use crate::agent_lane::store::{all_lanes_snapshot, ingest_lane_event, LaneIngest};
    use crate::pad_status::{
        apply_candidate, snapshot, Confidence, PadSource, PadState, PadStatusCandidate,
    };
    use crate::soft_pad_runtime::AgentKind;

    let sid = session_id
        .as_ref()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());
    let lid = lane_id
        .as_ref()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());

    let mut cleared_lanes = 0u32;
    for lane in all_lanes_snapshot() {
        if !matches!(lane.state, LaneState::ErrorUnread) {
            continue;
        }
        if let Some(ref want) = lid {
            if &lane.lane_id != want {
                continue;
            }
        }
        if let Some(ref want) = sid {
            if &lane.key.session_id != want {
                continue;
            }
        }
        let _ = ingest_lane_event(LaneIngest {
            provider: lane.key.provider,
            workspace_id: lane.key.workspace_id.clone(),
            session_id: lane.key.session_id.clone(),
            subagent_id: None,
            title: lane.title.clone(),
            event: "idle".into(),
            source: "clear_errors".into(),
            cwd: lane.navigation.cwd.clone(),
            host_pid: lane.navigation.host_pid,
            terminal_hwnd: 0,
            sequence: None,
            at: None,
        });
        cleared_lanes += 1;
    }

    let pad = snapshot();
    let pad_is_error = matches!(
        PadState::parse(&pad.state).unwrap_or(PadState::Idle),
        PadState::Error
    );
    let pad_session_ok = sid
        .as_ref()
        .map(|s| pad.session_id.as_deref() == Some(s.as_str()) || s.is_empty())
        .unwrap_or(true);
    let mut cleared_pad = false;
    if pad_is_error && pad_session_ok && lid.is_none() {
        let mut next = pad.clone();
        next.state = PadState::Idle.as_str().into();
        next.message = Some("cleared".into());
        next.source = PadSource::Native.as_str().into();
        next.confidence = Confidence::High.as_str().into();
        let _ = apply_candidate(PadStatusCandidate {
            raw_tag: "clear_errors".into(),
            status: next,
        });
        cleared_pad = true;
    }

    // Clear attention Error lifecycle rows for matching agents
    let mut cleared_attention = 0u32;
    for kind in [
        AgentKind::Codex,
        AgentKind::Claude,
        AgentKind::Cursor,
        AgentKind::CopilotCli,
        AgentKind::Gemini,
        AgentKind::Cline,
        AgentKind::OpenCode,
        AgentKind::Aider,
        AgentKind::WorkBuddy,
        AgentKind::Trae,
        AgentKind::Qoder,
        AgentKind::MiniMax,
    ] {
        cleared_attention += crate::agent_attention::store::clear(
            kind,
            sid.as_deref(),
            None,
        ) as u32;
        // Also force idle lifecycle when clearing all
        if sid.is_none() && lid.is_none() {
            crate::agent_attention::store::raise_lifecycle(
                kind,
                None,
                crate::agent_attention::model::AttentionState::Idle,
                crate::agent_attention::model::SignalSource::OneToneAsk,
            );
        }
    }

    serde_json::json!({
        "ok": true,
        "clearedLanes": cleared_lanes,
        "clearedPad": cleared_pad,
        "clearedAttention": cleared_attention,
        "focusKpi": crate::agent_lane::kpi_snapshot(),
    })
}
