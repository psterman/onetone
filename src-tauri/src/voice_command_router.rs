//! Unified voice command router: engines report detections; business lives here.
//!
//! M2: cooldown timers still live in each runtime; this module owns kind routing
//! (wake / summon / end / cancel / keyword) so SAPI/Vosk/KWS share one entry.

use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

use crate::voice_end_runtime::{
    handle_cancel_phrase, handle_end_phrase, handle_send_phrase, handle_voice_wake_detected,
    session_state,
};
use crate::voice_keyword_dispatch::VoiceKeywordKind;
use crate::AppState;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum VoiceDetectionKind {
    Wake,
    Summon,
    End,
    Cancel,
    Send,
    Keyword,
}

impl VoiceDetectionKind {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Wake => "wake",
            Self::Summon => "summon",
            Self::End => "end",
            Self::Cancel => "cancel",
            Self::Send => "send",
            Self::Keyword => "keyword",
        }
    }

    pub fn from_keyword_kind(kind: VoiceKeywordKind) -> Self {
        match kind {
            VoiceKeywordKind::Wake => Self::Wake,
            VoiceKeywordKind::Summon => Self::Summon,
            VoiceKeywordKind::End => Self::End,
            VoiceKeywordKind::Cancel => Self::Cancel,
            VoiceKeywordKind::Send => Self::Send,
            VoiceKeywordKind::Custom => Self::Keyword,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VoiceDetection {
    pub engine: String,
    pub kind: VoiceDetectionKind,
    pub text: String,
    pub confidence: Option<f32>,
    pub matched_phrase: String,
    pub timestamp_ms: u64,
}

impl VoiceDetection {
    pub fn now_ms() -> u64 {
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0)
    }

    pub fn wake(engine: &str, phrase: &str, confidence: Option<f32>) -> Self {
        let phrase = phrase.trim().to_string();
        Self {
            engine: engine.to_string(),
            kind: VoiceDetectionKind::Wake,
            text: phrase.clone(),
            confidence,
            matched_phrase: phrase,
            timestamp_ms: Self::now_ms(),
        }
    }
}

#[derive(Debug, Clone, Default)]
pub struct VoiceCommandRouterResult {
    pub handled: bool,
    pub skipped: bool,
    pub skip_reason: String,
    pub trigger_label: String,
}

/// Single business entry for all wake engines.
/// Cooldown / confidence gates stay in the calling runtime (M2).
pub fn handle_detection(
    state: &Arc<AppState>,
    app: &AppHandle,
    detection: &VoiceDetection,
) -> VoiceCommandRouterResult {
    let session = session_state(state);
    let idle = session == "idle";
    let active = session == "dictating";
    let phrase = if detection.matched_phrase.trim().is_empty() {
        detection.text.trim()
    } else {
        detection.matched_phrase.trim()
    };

    // On-demand oral session: match whitelist before global beginner / wake gates.
    if crate::voice_command_session::is_armed() {
        if let Some(result) = try_route_oral_armed(state, app, &detection.engine, phrase) {
            return result;
        }
    }

    // Cursor beginner: route before Send/Cancel/Wake gates (「发送」等也是全局 send/cancel 词).
    if let Some(result) = try_route_cursor_beginner_voice(state, app, &detection.engine, phrase) {
        return result;
    }

    // R2: idle → only wake/summon; dictating → only end/send/cancel (grammar mutual exclusion).
    // R3: summon/agent preference is inside handle_voice_wake_detected (preferSummon before IME wake).
    match detection.kind {
        VoiceDetectionKind::Wake | VoiceDetectionKind::Summon => {
            if !idle {
                return skip(format!(
                    "会话中忽略 {} 词「{}」",
                    detection.kind.as_str(),
                    phrase
                ));
            }
            if let Some(reason) = crate::voice_end_runtime::wake_phrase_skip_reason(state) {
                return skip(reason.into());
            }
            if !crate::voice_end_runtime::is_start_phrase(&state.cfg.lock(), phrase)
                && !(crate::cursor_beginner::probe_ok()
                    && crate::cursor_beginner::is_beginner_voice_phrase(phrase))
            {
                return skip(format!("未识别的启动词「{}」", phrase));
            }
            dispatch_wake_or_summon(state, app, &detection.engine, phrase)
        }
        VoiceDetectionKind::End => {
            if !active {
                return skip(format!("idle 状态下忽略 end 词「{}」", phrase));
            }
            if !state.cfg.lock().voice_end.enabled {
                return skip("结束词功能未启用".into());
            }
            handle_end_phrase(state, app, phrase);
            VoiceCommandRouterResult {
                handled: true,
                trigger_label: format!("结束（{}）", phrase),
                ..Default::default()
            }
        }
        VoiceDetectionKind::Send => {
            if !active {
                return skip(format!("idle 状态下忽略 send 词「{}」", phrase));
            }
            if !state.cfg.lock().voice_end.enabled {
                return skip("结束词功能未启用".into());
            }
            let mode = state.cfg.lock().voice_end.send_mode.clone();
            if !matches!(mode.trim().to_ascii_lowercase().as_str(), "phrase" | "auto") {
                return skip(format!("sendMode={} 忽略发送词「{}」", mode, phrase));
            }
            handle_send_phrase(state, app, phrase);
            VoiceCommandRouterResult {
                handled: true,
                trigger_label: format!("发送（{}）", phrase),
                ..Default::default()
            }
        }
        VoiceDetectionKind::Cancel => {
            if !active {
                return skip(format!("idle 状态下忽略 cancel 词「{}」", phrase));
            }
            if !state.cfg.lock().voice_end.enabled {
                return skip("结束词功能未启用".into());
            }
            handle_cancel_phrase(state, app, phrase);
            VoiceCommandRouterResult {
                handled: true,
                trigger_label: format!("取消（{}）", phrase),
                ..Default::default()
            }
        }
        VoiceDetectionKind::Keyword => skip(format!("未归类关键词「{}」", phrase)),
    }
}

fn skip(reason: String) -> VoiceCommandRouterResult {
    VoiceCommandRouterResult {
        skipped: true,
        skip_reason: reason,
        ..Default::default()
    }
}

fn oral_item_enabled(
    scheme: Option<&crate::config::OralCommandScheme>,
    id: &str,
    default_on: bool,
) -> bool {
    match scheme.and_then(|s| s.items.get(id)) {
        Some(it) => it.enabled.unwrap_or(default_on),
        None => default_on,
    }
}

/// Soft core (说话/发送/取消) default on; continue/newThread require explicit enable.
fn soft_oral_default_on(slot_id: &str) -> bool {
    matches!(slot_id, "pushToTalk" | "stopOrSend" | "cancelListen")
}

fn oral_split_say(raw: &str) -> Vec<String> {
    raw.split(|c: char| c.is_whitespace() || matches!(c, '、' | ',' | '，' | ';' | '；'))
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect()
}

fn oral_scheme_for_cfg(
    cfg: &crate::config::VoiceConfig,
) -> Option<crate::config::OralCommandScheme> {
    let armed_id = crate::voice_command_session::armed_mapping_id();
    if !armed_id.is_empty() {
        if let Some(s) = cfg
            .find_mapping_by_id(&armed_id)
            .and_then(|m| m.oral_command_scheme.clone())
        {
            return Some(s);
        }
    }
    if let Some(m) = cfg.find_mapping_by_id(&cfg.active_scene_id) {
        if let Some(s) = m.oral_command_scheme.clone() {
            return Some(s);
        }
    }
    cfg.mappings
        .iter()
        .find_map(|m| m.oral_command_scheme.clone())
}

fn phrase_matches_any(phrase: &str, candidates: &[String]) -> bool {
    candidates
        .iter()
        .any(|p| crate::config::phrases_fuzzy_match(phrase, p))
}

/// Armed Soft Pad mic / voiceCommand session: whitelist → Soft slot / prompt / voice bind / key.
fn try_route_oral_armed(
    state: &Arc<AppState>,
    app: &AppHandle,
    engine: &str,
    phrase: &str,
) -> Option<VoiceCommandRouterResult> {
    let phrase = phrase.trim();
    if phrase.is_empty() {
        return Some(skip("口头收听中未听到有效口令".into()));
    }
    // Hard exit: 「取消」「退出」… — never require main window (tray / Soft Pad only).
    // Disarm ignores oral_engine_ready (Esc / cancel must work during warm-up).
    if crate::cursor_beginner::is_disarm_phrase(phrase) {
        crate::voice_command_session::force_cancel(state, app, "voice_cancel");
        *state.voice_vosk_last_detected_phrase.lock() = phrase.to_string();
        *state.voice_vosk_last_final.lock() = phrase.to_string();
        *state.voice_vosk_last_trigger.lock() = format!("oral_disarm（{}）", phrase);
        crate::codex_micro_overlay::note_micro_key(
            crate::cursor_beginner::CANCEL_LISTEN_MICRO_KEY,
            true,
        );
        crate::codex_micro_overlay::request_overlay_push(app, state.as_ref(), false);
        return Some(VoiceCommandRouterResult {
            handled: true,
            trigger_label: format!("oral_disarm（{}）", phrase),
            ..Default::default()
        });
    }
    if !crate::voice_command_session::is_oral_engine_ready(state.as_ref()) {
        return Some(skip("引擎启动中，请稍后再说口令。".into()));
    }
    if *state.paused.lock() {
        return Some(skip("监听已暂停，请先在上方点「恢复」。".into()));
    }
    if state
        .voice_practice_hold_fg
        .load(std::sync::atomic::Ordering::SeqCst)
    {
        return Some(skip("语音练习台中，仅本页听写测试，不发送快捷键。".into()));
    }

    // Soft Pad beginner slots (phrase overrides from scheme.say).
    let soft_hit = {
        let cfg = state.cfg.lock();
        let scheme = oral_scheme_for_cfg(&cfg);
        let scheme_ref = scheme.as_ref();
        let mut hit = None;
        for slot in crate::cursor_beginner::BEGINNER_SLOTS {
            let id = format!("soft:{}", slot.slot_id);
            if !oral_item_enabled(scheme_ref, &id, soft_oral_default_on(slot.slot_id)) {
                continue;
            }
            let phrases = scheme_ref
                .and_then(|s| s.items.get(&id))
                .and_then(|it| it.say.as_ref())
                .map(|s| oral_split_say(s))
                .filter(|v| !v.is_empty())
                .unwrap_or_else(|| {
                    slot.voice_phrases
                        .iter()
                        .map(|p| (*p).to_string())
                        .collect()
                });
            if phrase_matches_any(phrase, &phrases)
                || (slot.slot_id == "continue"
                    && crate::config::phrases_fuzzy_match(phrase, "但是")
                    && scheme_ref
                        .and_then(|s| s.items.get(&id))
                        .and_then(|it| it.say.as_ref())
                        .is_none())
            {
                hit = Some(slot.slot_id);
                break;
            }
        }
        hit
    };
    if let Some(slot_id) = soft_hit {
        // 「取消」must not depend on main WebviewWindow.
        if slot_id == "cancelListen" {
            crate::voice_command_session::force_cancel(state, app, "oral_soft_cancel");
            *state.voice_vosk_last_detected_phrase.lock() = phrase.to_string();
            *state.voice_vosk_last_final.lock() = phrase.to_string();
            *state.voice_vosk_last_trigger.lock() = format!("oral_soft:cancelListen（{}）", phrase);
            crate::codex_micro_overlay::note_micro_key(
                crate::cursor_beginner::CANCEL_LISTEN_MICRO_KEY,
                true,
            );
            crate::codex_micro_overlay::request_overlay_push(app, state.as_ref(), false);
            return Some(VoiceCommandRouterResult {
                handled: true,
                trigger_label: format!("oral_soft:cancelListen（{}）", phrase),
                ..Default::default()
            });
        }
        // 「说话」while IME already up: do not re-pulse the toggle chord (would end voice).
        if slot_id == "pushToTalk"
            && (crate::voice_command_session::ime_voice_active()
                || crate::voice_end_runtime::session_state(state.as_ref()) == "dictating")
        {
            return Some(VoiceCommandRouterResult {
                handled: true,
                trigger_label: format!("oral_soft:pushToTalk（已在听写）"),
                ..Default::default()
            });
        }
        // First-use aim still open: block composer-dependent slots until user finishes.
        if crate::voice_command_session::need_composer_aim()
            && matches!(
                slot_id,
                "stopOrSend" | "continue" | "newThread" | "pushToTalk"
            )
        {
            return Some(skip("请先圈选 Agent 输入框完成首次对准，再说口令。".into()));
        }
        let window = crate::ipc::get_main_window(app)
            .or_else(|| app.get_webview_window(crate::overlay_window::CODEX_MICRO_OVERLAY.label))?;
        let out = crate::cursor_beginner::run_slot(state, &window, slot_id, true, true);
        let ok = out.get("ok").and_then(|v| v.as_bool()).unwrap_or(false);
        *state.voice_vosk_last_detected_phrase.lock() = phrase.to_string();
        *state.voice_vosk_last_final.lock() = phrase.to_string();
        let label = format!("oral_soft:{}", slot_id);
        if ok {
            *state.voice_vosk_last_trigger.lock() = format!("{}（{}）", label, phrase);
            crate::codex_micro_overlay::request_overlay_push(app, state.as_ref(), false);
            return Some(VoiceCommandRouterResult {
                handled: true,
                trigger_label: format!("{}（{}）", label, phrase),
                ..Default::default()
            });
        }
        return Some(skip(format!("口头 Soft 槽未执行（{}）", slot_id)));
    }

    // 一词注入 peers (say on peer wake; scheme = enabled only).
    {
        let cfg = state.cfg.lock();
        let scheme = oral_scheme_for_cfg(&cfg);
        if let Some(peer) =
            crate::voice_end_runtime::find_prompt_inject_peer_for_phrase(&cfg, phrase)
        {
            let id = format!("prompt:{}", peer.id);
            if oral_item_enabled(scheme.as_ref(), &id, false) {
                drop(cfg);
                if let Some(result) =
                    crate::voice_end_runtime::try_dispatch_prompt_inject_for_phrase(
                        state, app, phrase, engine,
                    )
                {
                    *state.voice_vosk_last_detected_phrase.lock() = phrase.to_string();
                    if result.ok {
                        *state.voice_vosk_last_trigger.lock() =
                            format!("{}（{}）", result.runtime_label, phrase);
                        return Some(VoiceCommandRouterResult {
                            handled: true,
                            trigger_label: format!("{}（{}）", result.runtime_label, phrase),
                            ..Default::default()
                        });
                    }
                    return Some(skip(format!("一词注入失败（{}）", phrase)));
                }
            }
        }
    }

    // Voice agentBindings (say on triggerBinding; scheme = enabled).
    {
        let cfg = state.cfg.lock();
        let scheme = oral_scheme_for_cfg(&cfg);
        let mut bind_ref = None;
        for m in cfg.mappings.iter().filter(|m| m.enabled) {
            if let Some(b) = crate::config::find_agent_voice_binding(m, phrase) {
                let bref = if !b.slot_id.trim().is_empty() {
                    b.slot_id.trim().to_string()
                } else {
                    b.trigger_binding.trim().to_string()
                };
                let id = format!("bind:{}", bref);
                if oral_item_enabled(scheme.as_ref(), &id, false) {
                    bind_ref = Some(bref);
                    break;
                }
            }
        }
        drop(cfg);
        if bind_ref.is_some() {
            if let Some(result) =
                crate::voice_end_runtime::try_dispatch_agent_voice(state, app, phrase)
            {
                *state.voice_vosk_last_detected_phrase.lock() = phrase.to_string();
                if result.ok {
                    *state.voice_vosk_last_trigger.lock() =
                        format!("{}（{}）", result.runtime_label, phrase);
                    return Some(VoiceCommandRouterResult {
                        handled: true,
                        trigger_label: format!("{}（{}）", result.runtime_label, phrase),
                        ..Default::default()
                    });
                }
                return Some(skip(format!("语音绑定失败（{}）", phrase)));
            }
        }
    }

    // Explicit key:/seq: whitelist (say stored on scheme).
    let key_hit = {
        let cfg = state.cfg.lock();
        if let Some(scheme) = oral_scheme_for_cfg(&cfg) {
            let duration_ms = cfg.key_press_duration_ms;
            let mut found: Option<(String, Vec<crate::config::Action>, u32)> = None;
            for (id, item) in &scheme.items {
                if item.enabled != Some(true) {
                    continue;
                }
                if !(id.starts_with("key:") || id.starts_with("seq:") || id.starts_with("agent:")) {
                    continue;
                }
                let say = item.say.as_deref().unwrap_or("");
                let phrases = oral_split_say(say);
                if phrases.is_empty() || !phrase_matches_any(phrase, &phrases) {
                    continue;
                }
                if let Some(mid) = id.strip_prefix("key:") {
                    if let Some(m) = cfg.find_mapping_by_id(mid) {
                        let actions = m.effective_target_actions().to_vec();
                        if actions.is_empty() {
                            continue;
                        }
                        found = Some((mid.to_string(), actions, duration_ms));
                        break;
                    }
                }
            }
            found
        } else {
            None
        }
    };
    if let Some((mid, actions, duration_ms)) = key_hit {
        let ok = crate::keyboard::run_action_sequence(&actions, duration_ms);
        if ok {
            if let Some(mk) = crate::cursor_beginner::slot_def("stopOrSend") {
                crate::codex_micro_overlay::note_micro_key(mk.micro_key_id, true);
                crate::codex_micro_overlay::request_overlay_push(app, state.as_ref(), false);
            }
            *state.voice_vosk_last_trigger.lock() = format!("oral_key:{}（{}）", mid, phrase);
            return Some(VoiceCommandRouterResult {
                handled: true,
                trigger_label: format!("oral_key（{}）", phrase),
                ..Default::default()
            });
        }
        return Some(skip(format!("口头按键序列失败（{}）", mid)));
    }

    // Seal oral window: never fall through to Wake / pushToTalk IME.
    Some(skip(format!(
        "口头收听中未匹配口令「{}」（可说取消/退出）",
        phrase
    )))
}

fn try_route_cursor_beginner_voice(
    state: &Arc<AppState>,
    app: &AppHandle,
    _engine: &str,
    phrase: &str,
) -> Option<VoiceCommandRouterResult> {
    if !crate::cursor_beginner::probe_ok() {
        return None;
    }
    if !crate::cursor_beginner::is_beginner_voice_phrase(phrase) {
        return None;
    }
    // Only intercept when Cursor is actually foreground or user explicitly armed.
    // On OneTone home, let normal routing handle phrases like「麦克风」(wake/dictation).
    if !crate::cursor_beginner::cursor_is_foreground()
        && !crate::cursor_beginner::is_armed()
        && !crate::cursor_beginner::is_arm_phrase(phrase)
    {
        // Habit active + Cursor alive: intercept action phrases (发送/继续/新建) but not mic toggle.
        let habit_ok = {
            let cfg = state.cfg.lock();
            crate::cursor_beginner::cursor_habit_active(&cfg)
        } && crate::cursor_beginner::probe_ok();
        let is_mic_phrase = crate::cursor_beginner::matches_beginner_phrase(phrase)
            .is_some_and(|d| d.slot_id == "pushToTalk");
        if !habit_ok || is_mic_phrase {
            return None;
        }
    }
    if *state.paused.lock() {
        return Some(skip("监听已暂停，请先在上方点「恢复」。".into()));
    }
    if state
        .voice_practice_hold_fg
        .load(std::sync::atomic::Ordering::SeqCst)
    {
        return Some(skip("语音练习台中，仅本页听写测试，不发送快捷键。".into()));
    }
    if crate::send_guard::is_active() && !crate::send_guard::wait_until_inactive(800) {
        return Some(skip("快捷键发送通道忙，请再说一次。".into()));
    }
    let duration_ms = state.cfg.lock().key_press_duration_ms;
    let result = crate::cursor_beginner::dispatch_voice_phrase(state, app, phrase)?;
    // Update home page display — beginner phrases bypass the normal lastDetectedPhrase path.
    *state.voice_vosk_last_detected_phrase.lock() = phrase.to_string();
    *state.voice_vosk_last_final.lock() = phrase.to_string();
    let label = result.runtime_label.clone();
    if result.ok {
        *state.voice_vosk_last_trigger.lock() = format!("{}（{}）", label, phrase);
        let sound_cue = crate::config::runtime_sound_cue(&state.cfg.lock(), "voice_wake");
        crate::ipc::push_runtime_via_app(app, state.as_ref(), &label, "", sound_cue.as_deref());
        crate::codex_micro_overlay::request_overlay_push(app, state.as_ref(), false);
        Some(VoiceCommandRouterResult {
            handled: true,
            trigger_label: format!("{}（{}）", label, phrase),
            ..Default::default()
        })
    } else if label == "cursor_beginner:not_armed" {
        *state.voice_vosk_last_trigger.lock() = String::new();
        Some(skip(format!(
            "请先进入 Cursor 或说「{}」激活。",
            crate::cursor_beginner::current_arm_phrase()
        )))
    } else {
        *state.voice_vosk_last_trigger.lock() = String::new();
        Some(VoiceCommandRouterResult {
            handled: false,
            skipped: true,
            skip_reason: format!("Cursor 操作未执行（{}）", label),
            trigger_label: String::new(),
        })
    }
}

fn dispatch_wake_or_summon(
    state: &Arc<AppState>,
    app: &AppHandle,
    engine: &str,
    phrase: &str,
) -> VoiceCommandRouterResult {
    let duration_ms = state.cfg.lock().key_press_duration_ms;

    if *state.paused.lock() {
        return skip("监听已暂停，请先在上方点「恢复」。".into());
    }
    // QS / habit setup practice: keep ASR for on-screen matching, never fire IME hotkeys
    // (Win+H etc. steals focus and feels like the wizard "exited").
    if state
        .voice_practice_hold_fg
        .load(std::sync::atomic::Ordering::SeqCst)
    {
        return skip("语音练习台中，仅本页听写测试，不发送快捷键。".into());
    }

    // Key-gap cooldown is checked/started by the runtime before calling the router.
    // Router still blocks on the shared send channel.
    if crate::send_guard::is_active() && !crate::send_guard::wait_until_inactive(800) {
        return skip("快捷键发送通道忙，请再说一次。".into());
    }

    let result = handle_voice_wake_detected(state, app, phrase, duration_ms, engine);

    let trigger_label = if result.ok {
        if result.used_summon_workflow {
            format!("{}（召唤「{}」）", result.target_key, phrase)
        } else {
            format!("{}（命中「{}」）", result.target_key, phrase)
        }
    } else {
        String::new()
    };

    if result.ok {
        let cue = "voice_wake";
        let sound_cue = crate::config::runtime_sound_cue(&state.cfg.lock(), cue);
        crate::ipc::push_runtime_via_app(
            app,
            state.as_ref(),
            &result.runtime_label,
            "",
            sound_cue.as_deref(),
        );
    } else {
        crate::agent_attention::emit_sound_event("voice.wake_failed", "voice.wake_failed");
    }

    VoiceCommandRouterResult {
        handled: result.ok,
        skipped: !result.ok,
        skip_reason: if result.ok {
            String::new()
        } else {
            format!("快捷键发送失败：{}", result.target_key)
        },
        trigger_label,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn kind_maps_from_keyword_kind() {
        assert_eq!(
            VoiceDetectionKind::from_keyword_kind(VoiceKeywordKind::Wake),
            VoiceDetectionKind::Wake
        );
        assert_eq!(
            VoiceDetectionKind::from_keyword_kind(VoiceKeywordKind::Custom),
            VoiceDetectionKind::Keyword
        );
        assert_eq!(
            VoiceDetectionKind::from_keyword_kind(VoiceKeywordKind::End),
            VoiceDetectionKind::End
        );
    }

    #[test]
    fn wake_builder_fills_fields() {
        let d = VoiceDetection::wake("vosk", "开始输入", Some(0.9));
        assert_eq!(d.engine, "vosk");
        assert_eq!(d.kind, VoiceDetectionKind::Wake);
        assert_eq!(d.matched_phrase, "开始输入");
        assert_eq!(d.confidence, Some(0.9));
    }

    #[test]
    fn oral_split_say_splits_cn_and_ascii() {
        assert_eq!(
            oral_split_say("发送、发出去, submit"),
            vec!["发送", "发出去", "submit"]
        );
    }

    #[test]
    fn oral_item_enabled_defaults() {
        assert!(oral_item_enabled(None, "soft:stopOrSend", true));
        assert!(!oral_item_enabled(
            None,
            "soft:continue",
            soft_oral_default_on("continue")
        ));
        assert!(oral_item_enabled(
            None,
            "soft:pushToTalk",
            soft_oral_default_on("pushToTalk")
        ));
        let mut scheme = crate::config::OralCommandScheme::default();
        scheme.items.insert(
            "soft:stopOrSend".into(),
            crate::config::OralCommandItem {
                say: Some("发出去".into()),
                enabled: Some(false),
            },
        );
        assert!(!oral_item_enabled(Some(&scheme), "soft:stopOrSend", true));
        assert!(!oral_item_enabled(
            Some(&scheme),
            "soft:continue",
            soft_oral_default_on("continue")
        ));
        scheme.items.insert(
            "soft:continue".into(),
            crate::config::OralCommandItem {
                say: None,
                enabled: Some(true),
            },
        );
        assert!(oral_item_enabled(
            Some(&scheme),
            "soft:continue",
            soft_oral_default_on("continue")
        ));
        assert!(!oral_item_enabled(None, "bind:x", false));
        assert!(!oral_item_enabled(None, "prompt:y", false));
    }
}
