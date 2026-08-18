//! OneTone-native Layer1 handlers (not Agent/Codex slash adapters).

use std::sync::Arc;

use tauri::{Manager, WebviewWindow};

use super::semantic::semantic_meta_by_id;
use super::templates::CODEX_PROVIDER_ID;
use crate::agent_catalog::kind_from_mapping;
use crate::soft_pad_runtime::AgentKind;
use crate::voice_end_runtime::{self, CommitPolicy};
use crate::AppState;

/// Where `input.start` should aim — always current habit/lane target, never a hardcoded product.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct InputStartTarget {
    pub provider_id: String,
    pub mapping_id: Option<String>,
    pub app_target_id: Option<String>,
}

/// Resolve provider for `input.start`: request mapping → Soft Pad applied lane → active scene.
pub fn resolve_input_start_target(
    state: &Arc<AppState>,
    mapping_id: Option<&str>,
) -> Option<InputStartTarget> {
    let cfg = state.cfg.lock();
    resolve_input_start_target_from_parts(
        &cfg,
        mapping_id,
        crate::soft_pad_runtime::applied_lane(),
    )
}

/// Pure resolver for tests / shared use (no Soft Pad store read beyond `applied_lane` arg).
pub fn resolve_input_start_target_from_parts(
    cfg: &crate::config::VoiceConfig,
    mapping_id: Option<&str>,
    applied_lane: Option<(AgentKind, String)>,
) -> Option<InputStartTarget> {
    let explicit = mapping_id.map(str::trim).filter(|s| !s.is_empty());
    if let Some(mid) = explicit {
        return target_from_mapping(cfg, mid);
    }
    if let Some((kind, mid)) = applied_lane {
        if let Some(t) = target_from_mapping(cfg, &mid) {
            return Some(t);
        }
        return Some(InputStartTarget {
            provider_id: kind.as_str().to_string(),
            mapping_id: Some(mid),
            app_target_id: None,
        });
    }
    let active = cfg.active_scene_id.trim();
    if !active.is_empty() {
        return target_from_mapping(cfg, active);
    }
    None
}

fn target_from_mapping(
    cfg: &crate::config::VoiceConfig,
    mapping_id: &str,
) -> Option<InputStartTarget> {
    let m = cfg.find_mapping_by_id(mapping_id)?;
    let kind = kind_from_mapping(&m.app_target_id, &m.agent_provider_id);
    let provider_id = kind
        .map(|k| k.as_str().to_string())
        .or_else(|| {
            let p = m.agent_provider_id.trim();
            if p.is_empty() {
                None
            } else {
                Some(p.to_string())
            }
        })?;
    let app_target = {
        let t = m.app_target_id.trim();
        if t.is_empty() {
            None
        } else {
            Some(t.to_string())
        }
    };
    Some(InputStartTarget {
        provider_id,
        mapping_id: Some(mapping_id.to_string()),
        app_target_id: app_target,
    })
}

#[derive(Debug, Clone)]
pub struct Layer1Outcome {
    pub ok: bool,
    pub reason: Option<String>,
    pub detail: Option<String>,
}

impl Layer1Outcome {
    fn ok_detail(detail: impl Into<String>) -> Self {
        Self {
            ok: true,
            reason: None,
            detail: Some(detail.into()),
        }
    }
    fn err(reason: &str, detail: impl Into<Option<String>>) -> Self {
        Self {
            ok: false,
            reason: Some(reason.to_string()),
            detail: detail.into(),
        }
    }
}

/// Resolve dictation finish policy for semantic actions.
/// Explicit `input.commit` / `input.send` never follow AutoConfig.
/// Legacy alias `stopOrSendDictation` keeps AutoConfig (habit send_mode).
pub fn commit_policy_for_raw_action(raw_action_id: &str, canonical: &str) -> Option<CommitPolicy> {
    let raw = raw_action_id.trim();
    if raw == "stopOrSendDictation" {
        return Some(CommitPolicy::AutoConfig);
    }
    match canonical {
        "input.commit" => Some(CommitPolicy::Never),
        "input.send" => Some(CommitPolicy::Force),
        _ => None,
    }
}

pub fn is_layer1_native(canonical: &str) -> bool {
    semantic_meta_by_id(canonical)
        .map(|m| m.layer == super::semantic::ActionLayer::OneToneBase && m.implemented)
        .unwrap_or(false)
}

pub fn execute_layer1(
    state: &Arc<AppState>,
    window: &WebviewWindow,
    raw_action_id: &str,
    canonical: &str,
    mapping_id: Option<&str>,
    args: Option<&serde_json::Value>,
) -> Layer1Outcome {
    match canonical {
        "input.start" => execute_start(state, window, mapping_id),
        "input.cancel" => execute_cancel(state, window),
        "input.commit" | "input.send" => {
            execute_commit_or_send(state, window, raw_action_id, canonical)
        }
        "input.pause" => execute_input_pause(state),
        "onetone.pause" => execute_onetone_pause(state, window),
        "onetone.resume" => execute_onetone_resume(state, window),
        "overlay.toggle" => execute_overlay_toggle(state, window),
        "status.read" => execute_status_read(state),
        "app.open" => execute_app_open(state, window, mapping_id),
        "app.shortcut" => execute_app_shortcut(state, mapping_id, args),
        _ => Layer1Outcome::err("not_implemented", Some(format!("no layer1 handler for {canonical}"))),
    }
}

fn execute_app_open(
    state: &Arc<AppState>,
    window: &WebviewWindow,
    mapping_id: Option<&str>,
) -> Layer1Outcome {
    let Some(mid) = mapping_id.map(str::trim).filter(|s| !s.is_empty()) else {
        return Layer1Outcome::err("no_mapping", Some("app.open needs mappingId".into()));
    };
    match crate::app_chat_workflow::open_or_focus_target(state, window, mid) {
        Ok(detail) => Layer1Outcome::ok_detail(format!("app.open {detail}")),
        Err((reason, err)) => {
            let code = match err {
                crate::app_chat_workflow::AppChatWorkflowError::NotFound => {
                    if reason == "no_app_target" || reason == "no_mapping" {
                        reason.clone()
                    } else {
                        "unavailable".to_string()
                    }
                }
                crate::app_chat_workflow::AppChatWorkflowError::FocusFailed => {
                    "focus_failed".to_string()
                }
                crate::app_chat_workflow::AppChatWorkflowError::InputNotFound => {
                    "unavailable".to_string()
                }
                crate::app_chat_workflow::AppChatWorkflowError::VoiceFailed => "failed".to_string(),
            };
            Layer1Outcome::err(&code, Some(reason))
        }
    }
}

fn parse_shortcut_chord(args: Option<&serde_json::Value>) -> Result<String, Layer1Outcome> {
    let Some(args) = args else {
        return Err(Layer1Outcome::err(
            "invalid_action_args",
            Some("app.shortcut needs args.chord".into()),
        ));
    };
    let chord = args
        .get("chord")
        .and_then(|v| v.as_str())
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_string);
    let Some(chord) = chord else {
        return Err(Layer1Outcome::err(
            "invalid_action_args",
            Some("app.shortcut needs args.chord".into()),
        ));
    };
    if chord_looks_dangerous(&chord) {
        return Err(Layer1Outcome::err(
            "invalid_action_args",
            Some(format!("dangerous chord refused: {chord}")),
        ));
    }
    if crate::key_chord::parse_chord(&chord).is_err() {
        return Err(Layer1Outcome::err(
            "invalid_action_args",
            Some(format!("unparseable chord: {chord}")),
        ));
    }
    Ok(chord)
}

fn chord_looks_dangerous(chord: &str) -> bool {
    let n = chord.replace(' ', "").to_ascii_lowercase();
    n.contains("ctrl+alt+del")
        || n.contains("ctrl+alt+delete")
        || n == "win+l"
        || n == "lwin+l"
        || n == "rwin+l"
        || n.contains("alt+f4")
}

fn execute_app_shortcut(
    state: &Arc<AppState>,
    mapping_id: Option<&str>,
    args: Option<&serde_json::Value>,
) -> Layer1Outcome {
    let chord = match parse_shortcut_chord(args) {
        Ok(c) => c,
        Err(e) => return e,
    };
    // FG must already match; do not open/focus first.
    let app_target = match ensure_mapping_foreground(state, mapping_id) {
        Ok(t) => t,
        Err(e) => return e,
    };
    let duration = state.cfg.lock().key_press_duration_ms;
    if !crate::keyboard::send_chord(&chord, duration) {
        return Layer1Outcome::err(
            "send_failed",
            Some(format!("failed to send chord {chord} to {app_target}")),
        );
    }
    Layer1Outcome::ok_detail(format!("app.shortcut {chord} → {app_target}"))
}

fn execute_start(
    state: &Arc<AppState>,
    window: &WebviewWindow,
    mapping_id: Option<&str>,
) -> Layer1Outcome {
    let Some(target) = resolve_input_start_target(state, mapping_id) else {
        return Layer1Outcome::err(
            "no_provider",
            Some("input.start needs mapping / Soft Pad lane / active scene".into()),
        );
    };
    let mid = target.mapping_id.clone().unwrap_or_default();

    // Codex keeps the dedicated startDictation chord path.
    if target.provider_id == CODEX_PROVIDER_ID {
        let res = crate::agent::execute_agent_action(
            state,
            window,
            crate::agent::AgentExecuteRequest {
                provider_id: CODEX_PROVIDER_ID.to_string(),
                action_id: "startDictation".into(),
                mapping_id: if mid.is_empty() { None } else { Some(mid) },
                slot_id: Some("pushToTalk".into()),
                execution_mode: None,
                activation_scope: Some("global".into()),
            },
        );
        return if res.ok {
            Layer1Outcome::ok_detail("input.start codex")
        } else {
            Layer1Outcome::err(res.reason.as_deref().unwrap_or("failed"), res.detail)
        };
    }

    // Other agents: habit app-target voice workflow (provider-neutral).
    let Some(app_target) = target.app_target_id.as_deref().filter(|s| !s.is_empty()) else {
        return Layer1Outcome::err(
            "no_app_target",
            Some(format!(
                "input.start provider={} has no app_target_id",
                target.provider_id
            )),
        );
    };
    let duration = state.cfg.lock().key_press_duration_ms;
    // Cursor: do not open Cursor Composer workflow (it would hardcode Cursor native voice mode).
    // Instead: focus composer only, then send the user's configured IME/voice input chord.
    if app_target == crate::app_chat_workflow::CURSOR_APP_TARGET_ID {
        let voice_key = crate::voice_end_runtime::resolve_voice_input_target_key(&state.cfg.lock());
        let Some(voice_key) = voice_key.filter(|s| !s.trim().is_empty()) else {
            return Layer1Outcome::err(
                "voice_key_unset",
                Some("cursor input.start needs configured voice input target key".into()),
            );
        };
        crate::voice_end_runtime::arm_external_voice_send_suppression(state.as_ref(), 3500);
        let _ = crate::app_chat_workflow::focus_composer_only(
            &window.app_handle(),
            crate::app_chat_workflow::CURSOR_APP_TARGET_ID,
            duration,
        );
        if !crate::keyboard::send_chord(&voice_key, duration) {
            return Layer1Outcome::err(
                "send_failed",
                Some(format!("failed to send cursor voice chord {voice_key}")),
            );
        }
        return Layer1Outcome::ok_detail(format!("input.start cursor voice {voice_key}"));
    }
    match crate::app_chat_workflow::run_for_target_id(
        state,
        window,
        &mid,
        app_target,
        duration,
    ) {
        Ok(detail) => Layer1Outcome::ok_detail(format!("input.start {detail}")),
        Err((reason, _)) => Layer1Outcome::err("input_failed", Some(reason)),
    }
}

/// Ensure foreground matches mapping app_target. Returns Err reason if not.
pub fn ensure_mapping_foreground(
    state: &Arc<AppState>,
    mapping_id: Option<&str>,
) -> Result<String, Layer1Outcome> {
    let Some(mid) = mapping_id.map(str::trim).filter(|s| !s.is_empty()) else {
        return Err(Layer1Outcome::err(
            "no_mapping",
            Some("approve/reject needs mappingId".into()),
        ));
    };
    let app_target = {
        let cfg = state.cfg.lock();
        cfg.find_mapping_by_id(mid)
            .map(|m| m.app_target_id.trim().to_string())
            .filter(|s| !s.is_empty())
    };
    let Some(app_target) = app_target else {
        return Err(Layer1Outcome::err(
            "no_app_target",
            Some("mapping has no app_target_id".into()),
        ));
    };
    if crate::app_identity::foreground_is_self() {
        return Err(Layer1Outcome::err(
            "inject_self_fg",
            Some("refused: OneTone foreground".into()),
        ));
    }
    let fg = crate::app_identity::foreground_effective_app_target_id();
    if fg.as_deref() != Some(app_target.as_str()) {
        return Err(Layer1Outcome::err(
            "target_not_foreground",
            Some(format!(
                "fg={:?} want={app_target}",
                fg.as_deref().unwrap_or("")
            )),
        ));
    }
    Ok(app_target)
}

/// Require mapping target in foreground; optionally focus composer first.
pub fn ensure_mapping_target_foreground(
    state: &Arc<AppState>,
    window: &WebviewWindow,
    mapping_id: Option<&str>,
    try_focus: bool,
) -> Result<String, Layer1Outcome> {
    match ensure_mapping_foreground(state, mapping_id) {
        Ok(t) => return Ok(t),
        Err(e) if !try_focus => return Err(e),
        Err(e) if matches!(
            e.reason.as_deref(),
            Some("target_not_foreground") | Some("inject_self_fg")
        ) => {}
        Err(e) => return Err(e),
    }
    let Some(mid) = mapping_id.map(str::trim).filter(|s| !s.is_empty()) else {
        return Err(Layer1Outcome::err(
            "no_mapping",
            Some("needs mappingId".into()),
        ));
    };
    let app_target = {
        let cfg = state.cfg.lock();
        cfg.find_mapping_by_id(mid)
            .map(|m| m.app_target_id.trim().to_string())
            .filter(|s| !s.is_empty())
    };
    let Some(app_target) = app_target else {
        return Err(Layer1Outcome::err(
            "no_app_target",
            Some("mapping has no app_target_id".into()),
        ));
    };
    #[cfg(windows)]
    {
        let app = window.app_handle();
        let duration_ms = state.cfg.lock().key_press_duration_ms;
        if let Err(err) =
            crate::app_chat_workflow::focus_composer_only(&app, &app_target, duration_ms)
        {
            let reason = match err {
                crate::app_chat_workflow::AppChatWorkflowError::NotFound => "not_running",
                crate::app_chat_workflow::AppChatWorkflowError::FocusFailed => "focus_failed",
                crate::app_chat_workflow::AppChatWorkflowError::InputNotFound => "focus_failed",
                crate::app_chat_workflow::AppChatWorkflowError::VoiceFailed => "input_failed",
            };
            return Err(Layer1Outcome::err(reason, None));
        }
        std::thread::sleep(std::time::Duration::from_millis(80));
    }
    #[cfg(not(windows))]
    {
        let _ = (state, window, &app_target);
        return Err(Layer1Outcome::err("not_running", None));
    }
    ensure_mapping_foreground(state, mapping_id)
}

/// Approve: require mapping target in foreground, then commit_key/Enter.
pub fn execute_agent_approve(state: &Arc<AppState>, mapping_id: Option<&str>) -> Layer1Outcome {
    if let Err(e) = ensure_mapping_foreground(state, mapping_id) {
        return e;
    }
    let (commit_key, duration_ms) = {
        let cfg = state.cfg.lock();
        (cfg.voice_end.commit_key.clone(), cfg.key_press_duration_ms)
    };
    let chord = if commit_key.trim().is_empty() {
        "Enter"
    } else {
        commit_key.trim()
    };
    if crate::keyboard::send_chord(chord, duration_ms) {
        Layer1Outcome::ok_detail(format!("agent.approve {chord}"))
    } else {
        Layer1Outcome::err("input_failed", Some(format!("failed {chord}")))
    }
}

/// Explicit reject inject: FG check then Esc. Pending cancel is separate (no Esc).
pub fn execute_agent_reject(state: &Arc<AppState>, mapping_id: Option<&str>) -> Layer1Outcome {
    if let Err(e) = ensure_mapping_foreground(state, mapping_id) {
        return e;
    }
    let duration_ms = state.cfg.lock().key_press_duration_ms;
    if crate::keyboard::send_chord("Esc", duration_ms) {
        Layer1Outcome::ok_detail("agent.reject Esc")
    } else {
        Layer1Outcome::err("input_failed", Some("Esc failed".into()))
    }
}

/// `agent.respond` = waitingText-scoped `input.send` (same commit/send policy).
pub fn execute_agent_respond(
    state: &Arc<AppState>,
    window: &WebviewWindow,
    mapping_id: Option<&str>,
) -> Layer1Outcome {
    if let Err(e) = ensure_mapping_target_foreground(state, window, mapping_id, true) {
        return e;
    }
    execute_commit_or_send(state, window, "input.send", "input.send")
}

fn continue_prompt_text() -> &'static str {
    #[cfg(windows)]
    {
        // PRIMARYLANGID(LANG_ENGLISH) == 0x09
        #[link(name = "kernel32")]
        extern "system" {
            fn GetUserDefaultUILanguage() -> u16;
        }
        let langid = unsafe { GetUserDefaultUILanguage() };
        if (langid & 0xff) == 0x09 {
            return "Continue";
        }
    }
    "继续"
}

/// Transparent prompt: focus agent → insert Continue/继续 → Enter. Not a native hotkey claim.
pub fn execute_agent_continue(
    state: &Arc<AppState>,
    window: &WebviewWindow,
    mapping_id: Option<&str>,
) -> Layer1Outcome {
    if let Err(e) = ensure_mapping_target_foreground(state, window, mapping_id, true) {
        return e;
    }
    let duration_ms = state.cfg.lock().key_press_duration_ms;
    #[cfg(windows)]
    {
        if crate::app_identity::foreground_is_self() {
            return Layer1Outcome::err(
                "inject_self_fg",
                Some("refused continue: OneTone owns foreground".into()),
            );
        }
        let text = continue_prompt_text();
        if let Err(e) = crate::agent::insert_text::insert_text_no_enter(text, duration_ms) {
            return Layer1Outcome::err(e.as_reason(), Some(format!("{e:?}")));
        }
        std::thread::sleep(std::time::Duration::from_millis(60));
        if crate::keyboard::send_chord("Enter", duration_ms) {
            Layer1Outcome::ok_detail(format!("agent.continue sent {text}"))
        } else {
            Layer1Outcome::err("input_failed", Some("Enter failed".into()))
        }
    }
    #[cfg(not(windows))]
    {
        let _ = (state, window, duration_ms);
        Layer1Outcome::err("not_running", None)
    }
}

fn execute_cancel(state: &Arc<AppState>, window: &WebviewWindow) -> Layer1Outcome {
    let app = window.app_handle();
    if voice_end_runtime::session_state(state.as_ref()) == "dictating" {
        voice_end_runtime::ui_cancel_dictation(state, &app);
        return Layer1Outcome::ok_detail("dictation cancelled");
    }
    // Fall back Esc for non-dictating cancel.
    let duration = state.cfg.lock().key_press_duration_ms;
    if crate::app_identity::foreground_is_self() {
        return Layer1Outcome::err("inject_self_fg", Some("refused Esc".into()));
    }
    if crate::keyboard::send_chord("Esc", duration) {
        Layer1Outcome::ok_detail("Esc")
    } else {
        Layer1Outcome::err("input_failed", Some("Esc failed".into()))
    }
}

fn execute_commit_or_send(
    state: &Arc<AppState>,
    window: &WebviewWindow,
    raw_action_id: &str,
    canonical: &str,
) -> Layer1Outcome {
    let policy = commit_policy_for_raw_action(raw_action_id, canonical)
        .unwrap_or(CommitPolicy::AutoConfig);
    let app = window.app_handle();
    let dictating = voice_end_runtime::session_state(state.as_ref()) == "dictating";

    if dictating {
        let reason = match policy {
            CommitPolicy::Never => "semantic input.commit",
            CommitPolicy::Force => "semantic input.send",
            CommitPolicy::AutoConfig => "semantic stopOrSendDictation",
        };
        voice_end_runtime::finish_dictation_with_policy(state, Some(&app), reason, policy);
        return Layer1Outcome::ok_detail(format!("dictation finish policy={policy:?}"));
    }

    // Not dictating
    match policy {
        CommitPolicy::Never => {
            Layer1Outcome::ok_detail("input.commit noop (not dictating)")
        }
        CommitPolicy::Force | CommitPolicy::AutoConfig => {
            let (commit_key, duration_ms) = {
                let cfg = state.cfg.lock();
                (cfg.voice_end.commit_key.clone(), cfg.key_press_duration_ms)
            };
            let chord = if commit_key.trim().is_empty() {
                "Enter"
            } else {
                commit_key.trim()
            };
            if crate::app_identity::foreground_is_self() {
                return Layer1Outcome::err("inject_self_fg", Some(format!("refused {chord}")));
            }
            if crate::keyboard::send_chord(chord, duration_ms) {
                Layer1Outcome::ok_detail(format!("sent {chord} policy={policy:?}"))
            } else {
                Layer1Outcome::err("input_failed", Some(format!("failed {chord}")))
            }
        }
    }
}

fn execute_input_pause(state: &Arc<AppState>) -> Layer1Outcome {
    crate::voice_bootstrap::pause_voice_engines(state);
    *state.voice_session_last_action.lock() = "input.pause".into();
    Layer1Outcome::ok_detail("voice engines paused")
}

fn execute_onetone_pause(state: &Arc<AppState>, window: &WebviewWindow) -> Layer1Outcome {
    crate::ipc::pause_listen(state, &window.app_handle());
    Layer1Outcome::ok_detail("onetone.pause")
}

fn execute_onetone_resume(state: &Arc<AppState>, window: &WebviewWindow) -> Layer1Outcome {
    crate::ipc::resume_listen(state, &window.app_handle());
    Layer1Outcome::ok_detail("onetone.resume")
}

fn execute_overlay_toggle(state: &Arc<AppState>, window: &WebviewWindow) -> Layer1Outcome {
    let app = window.app_handle();
    match crate::codex_micro_overlay::toggle_pad_master(&app, state.as_ref()) {
        Ok(on) => Layer1Outcome::ok_detail(format!("overlay master={}", on)),
        Err(e) => Layer1Outcome::err("overlay_toggle_failed", Some(e)),
    }
}

fn execute_status_read(state: &Arc<AppState>) -> Layer1Outcome {
    let dictating = voice_end_runtime::session_state(state.as_ref()) == "dictating";
    let paused = *state.paused.lock();
    let kind = crate::agent_attention::project_needs_input_kind(dictating);
    let summary = serde_json::json!({
        "dictating": dictating,
        "paused": paused,
        "needsInputKind": kind.kind,
        "agent": kind.agent,
        "session": voice_end_runtime::session_state(state.as_ref()),
    });
    *state.voice_session_last_action.lock() = format!("status.read {summary}");
    Layer1Outcome::ok_detail(summary.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn explicit_commit_never_send_force_alias_auto() {
        assert_eq!(
            commit_policy_for_raw_action("input.commit", "input.commit"),
            Some(CommitPolicy::Never)
        );
        assert_eq!(
            commit_policy_for_raw_action("input.send", "input.send"),
            Some(CommitPolicy::Force)
        );
        assert_eq!(
            commit_policy_for_raw_action("stopOrSendDictation", "input.send"),
            Some(CommitPolicy::AutoConfig)
        );
        assert_eq!(
            commit_policy_for_raw_action("stopOrSendDictation", "input.commit"),
            Some(CommitPolicy::AutoConfig)
        );
        // Explicit ids ignore alias path even if names look similar
        assert_eq!(
            commit_policy_for_raw_action("input.send", "input.send"),
            Some(CommitPolicy::Force)
        );
    }

    #[test]
    fn app_shortcut_args_require_chord() {
        assert!(parse_shortcut_chord(None).is_err());
        assert!(parse_shortcut_chord(Some(&serde_json::json!({}))).is_err());
        assert!(parse_shortcut_chord(Some(&serde_json::json!({"chord":""}))).is_err());
        assert!(parse_shortcut_chord(Some(&serde_json::json!({"chord":"Ctrl+Alt+Del"}))).is_err());
        let ok = parse_shortcut_chord(Some(&serde_json::json!({"chord":"Ctrl+K"}))).unwrap();
        assert_eq!(ok, "Ctrl+K");
    }

    #[test]
    fn app_open_and_shortcut_are_layer1() {
        assert!(is_layer1_native("app.open"));
        assert!(is_layer1_native("app.shortcut"));
    }
}
