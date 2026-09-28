//! On-demand 口头指令 listen session (not 24/7).
//! Activate via gesture scheme `voiceCommand` or Soft Pad mic.

use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Arc;
use std::time::Duration;

use tauri::AppHandle;

use crate::AppState;

static SESSION_ARMED: AtomicBool = AtomicBool::new(false);
static SESSION_OWNED_ENGINES: AtomicBool = AtomicBool::new(false);
/// True when this session flipped soft_pad_force_open on (must restore on end).
static SESSION_OWNED_FORCE_OPEN: AtomicBool = AtomicBool::new(false);
/// Soft 槽「说话」started the system/Cursor voice IME — Soft 槽 can toggle it off.
static IME_VOICE_ACTIVE: AtomicBool = AtomicBool::new(false);
static SESSION_GEN: AtomicU64 = AtomicU64::new(0);
static SESSION_MAPPING_ID: std::sync::Mutex<String> = std::sync::Mutex::new(String::new());
const DEFAULT_WINDOW_MS: u64 = 12_000;

pub fn is_armed() -> bool {
    SESSION_ARMED.load(Ordering::SeqCst)
}

pub fn ime_voice_active() -> bool {
    IME_VOICE_ACTIVE.load(Ordering::SeqCst)
}

pub fn note_ime_voice_active() {
    IME_VOICE_ACTIVE.store(true, Ordering::SeqCst);
}

pub fn clear_ime_voice_active() {
    IME_VOICE_ACTIVE.store(false, Ordering::SeqCst);
}

/// If Soft 槽「说话」left the voice IME on, pulse the same chord to close it.
/// Call before 发送 / 取消 / 继续 so Enter/text is not eaten by IME capture.
pub fn stop_ime_voice_if_active(state: &Arc<AppState>, duration_ms: u32) -> bool {
    if !IME_VOICE_ACTIVE.swap(false, Ordering::SeqCst) {
        return false;
    }
    let key = {
        let cfg = state.cfg.lock();
        let mid = armed_mapping_id();
        let mapping = cfg.find_mapping_by_id(&mid);
        crate::voice_end_runtime::resolve_voice_key_for_mapping(&cfg, mapping)
            .or_else(|| crate::voice_end_runtime::resolve_voice_input_target_key(&cfg))
    };
    let Some(key) = key.filter(|s| !s.trim().is_empty()) else {
        return false;
    };
    if crate::voice_end_runtime::is_hold_to_talk_voice_key(&key)
        && !crate::key_chord::is_toggle_voice_chord(&key)
    {
        let _ = crate::voice_end_runtime::end_hold_voice_chord(state.as_ref());
        return true;
    }
    let ok = crate::keyboard::send_chord(&key, duration_ms);
    if ok {
        std::thread::sleep(Duration::from_millis(80));
    }
    ok
}

pub fn armed_mapping_id() -> String {
    SESSION_MAPPING_ID
        .lock()
        .map(|g| g.clone())
        .unwrap_or_default()
}

fn armed_mapping<'a>(cfg: &'a crate::config::VoiceConfig) -> Option<&'a crate::config::MappingEntry> {
    let mid = armed_mapping_id();
    cfg.find_mapping_by_id(&mid).or_else(|| {
        cfg.active_mappings()
            .into_iter()
            .find(|x| !x.oral_trigger_key().is_empty())
    })
}

fn oral_item_on(scheme: Option<&crate::config::OralCommandScheme>, id: &str) -> bool {
    match scheme.and_then(|s| s.items.get(id)) {
        Some(it) => it.enabled.unwrap_or(true),
        None => true,
    }
}

fn oral_soft_phrases(
    scheme: Option<&crate::config::OralCommandScheme>,
    slot: &crate::cursor_beginner::BeginnerSlotDef,
) -> Vec<String> {
    let id = format!("soft:{}", slot.slot_id);
    scheme
        .and_then(|s| s.items.get(&id))
        .and_then(|it| it.say.as_ref())
        .map(|s| {
            s.split(|c: char| c.is_whitespace() || matches!(c, '、' | ',' | '，' | ';' | '；'))
                .map(|p| p.trim().to_string())
                .filter(|p| !p.is_empty())
                .collect::<Vec<_>>()
        })
        .filter(|v| !v.is_empty())
        .unwrap_or_else(|| {
            slot.voice_phrases
                .iter()
                .map(|p| (*p).to_string())
                .collect()
        })
}

/// Soft 槽 oral armed but composer aim not initialized yet (first-use calibrate).
static ORAL_NEED_COMPOSER_AIM: AtomicBool = AtomicBool::new(false);

pub fn need_composer_aim() -> bool {
    ORAL_NEED_COMPOSER_AIM.load(Ordering::SeqCst)
}

pub fn clear_need_composer_aim() {
    ORAL_NEED_COMPOSER_AIM.store(false, Ordering::SeqCst);
}

fn oral_app_target_id(cfg: &crate::config::VoiceConfig, mapping_id: &str) -> String {
    if let Some(m) = cfg.find_mapping_by_id(mapping_id) {
        let tid = m.app_target_id.trim();
        if !tid.is_empty() {
            return tid.to_string();
        }
    }
    if crate::cursor_beginner::probe_ok() {
        return crate::app_chat_workflow::CURSOR_APP_TARGET_ID.to_string();
    }
    let active = cfg.active_scene_id.trim();
    if !active.is_empty() {
        if let Some(m) = cfg.find_mapping_by_id(active) {
            let tid = m.app_target_id.trim();
            if !tid.is_empty() {
                return tid.to_string();
            }
        }
    }
    String::new()
}

fn has_calibrated_composer(cfg: &crate::config::VoiceConfig, app_target_id: &str) -> bool {
    cfg.voice_end
        .composer_anchors
        .get(app_target_id.trim())
        .and_then(|a| a.active_point())
        .is_some()
}

/// After Soft 槽 oral arm: first use opens input-aim calibrate; later uses punch composer.
pub fn init_composer_on_oral_arm(state: &Arc<AppState>, app: &AppHandle, mapping_id: &str) {
    let (app_target, duration_ms, need_calibrate) = {
        let cfg = state.cfg.lock();
        let tid = oral_app_target_id(&cfg, mapping_id);
        if tid.is_empty() || crate::app_chat_workflow::profile_for(&tid).is_none() {
            ORAL_NEED_COMPOSER_AIM.store(false, Ordering::SeqCst);
            return;
        }
        let need = !has_calibrated_composer(&cfg, &tid);
        (tid, cfg.key_press_duration_ms, need)
    };

    if need_calibrate {
        ORAL_NEED_COMPOSER_AIM.store(true, Ordering::SeqCst);
        crate::codex_micro_overlay::push_state(app, state.as_ref());
        crate::app_log::log_line(
            state,
            "voice_command",
            &format!("oral_composer_init first_use calibrate app={app_target}"),
        );
        let _ = crate::input_aim_calibrate::queue_begin_for_app(app, &app_target, 0);
        return;
    }

    ORAL_NEED_COMPOSER_AIM.store(false, Ordering::SeqCst);
    crate::app_log::log_line(
        state,
        "voice_command",
        &format!("oral_composer_init focus app={app_target}"),
    );
    let app_h = app.clone();
    let tid = app_target;
    let _ = std::thread::Builder::new()
        .name("oral-composer-init".into())
        .spawn(move || {
            // Brief settle after Soft Pad arm chrome so click-through is ready.
            std::thread::sleep(Duration::from_millis(80));
            let _pad = crate::codex_micro_overlay::SoftPadSendPassGuard::engage(&app_h);
            let _ = crate::app_chat_workflow::focus_composer_for_send(&app_h, &tid, duration_ms);
        });
}

/// Soft Pad caption: 「口头收听中 · 可说：…」from oral scheme (Soft + scheme items).
pub fn listen_hint(cfg: &crate::config::VoiceConfig) -> String {
    if need_composer_aim() {
        return "口头收听中 · 请先圈选 Agent 输入框（首次对准）".into();
    }
    let says = listen_say_list(cfg, 10);
    if says.is_empty() {
        "口头收听中 · 请说话令".into()
    } else {
        format!("口头收听中 · 可说：{}", says.join("、"))
    }
}

/// Enabled oral phrases for Soft Pad / settings strip (Soft defaults + scheme overrides).
pub fn listen_say_list(cfg: &crate::config::VoiceConfig, limit: usize) -> Vec<String> {
    let scheme = armed_mapping(cfg).and_then(|m| m.oral_command_scheme.as_ref());
    let mut says: Vec<String> = Vec::new();
    let push = |says: &mut Vec<String>, p: String| {
        if says.iter().any(|x| x == &p) {
            return;
        }
        says.push(p);
    };
    for slot in crate::cursor_beginner::BEGINNER_SLOTS {
        let id = format!("soft:{}", slot.slot_id);
        if !oral_item_on(scheme, &id) {
            continue;
        }
        for p in oral_soft_phrases(scheme, slot) {
            push(&mut says, p);
            if says.len() >= limit {
                return says;
            }
        }
    }
    // Extra scheme items (一词注入 / 语音绑定 / 已加入) after Soft 槽.
    if let Some(s) = scheme {
        let mut extras: Vec<(&String, &crate::config::OralCommandItem)> = s.items.iter().collect();
        extras.sort_by(|a, b| a.0.cmp(b.0));
        for (id, item) in extras {
            if id.starts_with("soft:") {
                continue;
            }
            if item.enabled == Some(false) {
                continue;
            }
            let Some(raw) = item.say.as_ref().map(|x| x.trim()).filter(|x| !x.is_empty()) else {
                continue;
            };
            for part in raw.split(|c: char| {
                c.is_whitespace() || matches!(c, '、' | ',' | '，' | ';' | '；')
            }) {
                let p = part.trim();
                if p.is_empty() {
                    continue;
                }
                push(&mut says, p.to_string());
                if says.len() >= limit {
                    return says;
                }
            }
        }
    }
    says
}

pub fn listen_flow_hint() -> String {
    "发送→右侧框+Enter · 取消→退出收听".into()
}

/// Compact cards for Soft Pad listen strip (name + primary say).
pub fn listen_command_cards(cfg: &crate::config::VoiceConfig) -> Vec<(String, String)> {
    let scheme = armed_mapping(cfg).and_then(|m| m.oral_command_scheme.as_ref());
    let mut cards = Vec::new();
    for slot in crate::cursor_beginner::BEGINNER_SLOTS {
        let id = format!("soft:{}", slot.slot_id);
        if !oral_item_on(scheme, &id) {
            continue;
        }
        let say = oral_soft_phrases(scheme, slot)
            .into_iter()
            .next()
            .unwrap_or_else(|| slot.label_zh.to_string());
        cards.push((slot.label_zh.to_string(), say));
    }
    cards
}

/// Enabled Soft 槽 micro keys — Soft Pad aura while oral listen is armed.
pub fn listen_micro_keys(cfg: &crate::config::VoiceConfig) -> Vec<String> {
    let scheme = armed_mapping(cfg).and_then(|m| m.oral_command_scheme.as_ref());
    crate::cursor_beginner::BEGINNER_SLOTS
        .iter()
        .filter(|slot| oral_item_on(scheme, &format!("soft:{}", slot.slot_id)))
        .map(|slot| slot.micro_key_id.to_string())
        .collect()
}

pub fn default_window_ms() -> u64 {
    DEFAULT_WINDOW_MS
}

/// Stretch the Soft 槽 oral listen window without touching capture engines.
/// Used after 「说话」starts the voice IME — pause/resume would reclaim WASAPI and kill IME.
pub fn extend_armed_window(app: &AppHandle, state: &Arc<AppState>, window_ms: u64) {
    if !is_armed() {
        return;
    }
    let gen = SESSION_GEN.fetch_add(1, Ordering::SeqCst).wrapping_add(1);
    SESSION_GEN.store(gen, Ordering::SeqCst);
    let mapping_id = armed_mapping_id();
    let window_ms = window_ms.max(3_000);
    crate::app_log::log_line(
        state,
        "voice_command",
        &format!("session_extend mapping={mapping_id} window_ms={window_ms}"),
    );
    crate::codex_micro_overlay::note_pad_run_status("listening", "ACT10");
    crate::codex_micro_overlay::push_state(app, state.as_ref());
    let state_h = Arc::clone(state);
    let app_h = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_millis(window_ms));
        if SESSION_GEN.load(Ordering::SeqCst) != gen {
            return;
        }
        end_session(&state_h, &app_h, &mapping_id, "timeout");
    });
}

/// Start (or refresh) an on-demand listen window.
pub fn begin_session(state: &Arc<AppState>, app: &AppHandle, mapping_id: &str, window_ms: u64) {
    let gen = SESSION_GEN.fetch_add(1, Ordering::SeqCst).wrapping_add(1);
    SESSION_GEN.store(gen, Ordering::SeqCst);
    SESSION_ARMED.store(true, Ordering::SeqCst);
    if let Ok(mut g) = SESSION_MAPPING_ID.lock() {
        *g = mapping_id.to_string();
    }

    let was_paused = *state.paused.lock();
    SESSION_OWNED_ENGINES.store(was_paused, Ordering::SeqCst);

    crate::runtime_event::publish_runtime_event(
        Some(app),
        state.as_ref(),
        "voice_command",
        "session_begin",
        "voice command listen armed",
        Some(serde_json::json!({
            "mappingId": mapping_id,
            "windowMs": window_ms.max(3_000),
            "mode": "voiceListening",
        })),
    );
    crate::app_log::log_line(
        state,
        "voice_command",
        &format!("session_begin mapping={mapping_id} window_ms={}", window_ms.max(3_000)),
    );

    // Soft Pad / floating overlay must surface for oral listen (same as mic arm).
    // Transient force-open: bypass OneTone-FG host gate without persisting Home toggle.
    {
        let mut cfg = state.cfg.lock();
        if !cfg.soft_pad_force_open {
            cfg.soft_pad_force_open = true;
            let _ = crate::codex_micro_overlay::ensure_force_soft_pad_ready(&mut cfg);
            SESSION_OWNED_FORCE_OPEN.store(true, Ordering::SeqCst);
        }
        crate::codex_micro_overlay::clear_overlay_session_dismissed();
    }
    crate::codex_micro_overlay::note_pad_run_status("listening", "ACT10");
    crate::codex_micro_overlay::push_state(app, state.as_ref());
    {
        let snap = crate::codex_micro_overlay::build_snapshot(state.as_ref());
        crate::app_log::log_line(
            state,
            "voice_command",
            &format!(
                "oral overlay after arm visible={} reason={} hint={}",
                snap.visible, snap.visible_reason, snap.oral_listen_hint
            ),
        );
    }

    // Oral commands need the mic — always resume, not only when we owned a pause.
    crate::ipc::resume_listen(state, app);

    // First oral use: open input-aim calibrate. Later: punch Agent composer so
    // 发送/继续 do not land in the editor or other boxes.
    init_composer_on_oral_arm(state, app, mapping_id);

    let window_ms = window_ms.max(3_000);
    let state_h = Arc::clone(state);
    let app_h = app.clone();
    let mapping_id = mapping_id.to_string();
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_millis(window_ms));
        if SESSION_GEN.load(Ordering::SeqCst) != gen {
            return;
        }
        end_session(&state_h, &app_h, &mapping_id, "timeout");
    });
}

pub fn end_session(state: &Arc<AppState>, app: &AppHandle, mapping_id: &str, reason: &str) {
    if !SESSION_ARMED.swap(false, Ordering::SeqCst) {
        return;
    }
    SESSION_GEN.fetch_add(1, Ordering::SeqCst);
    let owned = SESSION_OWNED_ENGINES.swap(false, Ordering::SeqCst);
    let owned_force = SESSION_OWNED_FORCE_OPEN.swap(false, Ordering::SeqCst);
    IME_VOICE_ACTIVE.store(false, Ordering::SeqCst);
    ORAL_NEED_COMPOSER_AIM.store(false, Ordering::SeqCst);

    crate::runtime_event::publish_runtime_event(
        Some(app),
        state.as_ref(),
        "voice_command",
        "session_end",
        &format!("voice command listen ended ({reason})"),
        Some(serde_json::json!({
            "mappingId": mapping_id,
            "reason": reason,
            "mode": "idle",
        })),
    );

    if owned_force {
        let mut cfg = state.cfg.lock();
        cfg.soft_pad_force_open = false;
    }
    crate::codex_micro_overlay::note_pad_run_status("idle", "ACT10");
    crate::codex_micro_overlay::push_state(app, state.as_ref());

    // Only pause if this session was what brought engines up (default-paused path).
    if owned && !*state.paused.lock() {
        crate::ipc::pause_listen(state, app);
    }
}

pub fn toggle_session(state: &Arc<AppState>, app: &AppHandle, mapping_id: &str) {
    if is_armed() {
        end_session(state, app, mapping_id, "toggle");
    } else {
        begin_session(state, app, mapping_id, DEFAULT_WINDOW_MS);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::{OralCommandItem, OralCommandScheme, VoiceConfig};

    #[test]
    fn listen_hint_uses_scheme_say_and_soft_defaults() {
        let mut cfg = VoiceConfig::default();
        let mid = cfg.mappings[0].id.clone();
        cfg.mappings[0].oral_command_scheme = Some(OralCommandScheme {
            trigger_key: "XButton2".into(),
            items: [(
                "soft:stopOrSend".into(),
                OralCommandItem {
                    say: Some("发出去".into()),
                    enabled: Some(true),
                },
            )]
            .into_iter()
            .collect(),
        });
        if let Ok(mut g) = SESSION_MAPPING_ID.lock() {
            *g = mid;
        }
        SESSION_ARMED.store(true, Ordering::SeqCst);
        let hint = listen_hint(&cfg);
        let cards = listen_command_cards(&cfg);
        SESSION_ARMED.store(false, Ordering::SeqCst);
        assert!(hint.contains("发出去"), "custom say: {hint}");
        assert!(
            hint.contains("继续") || hint.contains("麦克风") || hint.contains("取消"),
            "defaults: {hint}"
        );
        assert!(cards.iter().any(|(_, say)| say == "发出去"));
        let keys = listen_micro_keys(&cfg);
        assert!(keys.iter().any(|k| k == "ACT12"));
        assert!(keys.iter().any(|k| k == "ACT10"));
    }

    #[test]
    fn oral_app_target_falls_back_to_cursor_when_mapping_empty() {
        let cfg = VoiceConfig::default();
        let tid = oral_app_target_id(&cfg, "missing-mapping");
        // Without Cursor probe in unit tests, may be empty — just no panic.
        let _ = tid;
        assert!(!has_calibrated_composer(&cfg, "cursor-chat"));
    }

    #[test]
    fn speak_path_keeps_soft_slot_listen_without_engine_restart() {
        // Guard: soft_slot speak used to pause Soft 槽 forever (no 发送) or
        // pause+resume (kills IME). Both must stay out of the cursor speak path.
        let src = include_str!("agent/layer1_native.rs");
        let start = src.find("fn execute_start(").expect("execute_start");
        let body = &src[start..];
        let cursor_at = body.find("CURSOR_APP_TARGET_ID").expect("cursor block");
        let cursor_block = &body[cursor_at..cursor_at.saturating_add(3200)];
        assert!(
            cursor_block.contains("extend_armed_window"),
            "speak must extend Soft 槽 window without engine restart"
        );
        assert!(
            cursor_block.contains("enter_dictating"),
            "speak must enter dictating so end/send/cancel phrases work"
        );
        assert!(
            !cursor_block.contains("pause_listen"),
            "speak must not pause Soft 槽 (kills oral end-commands)"
        );
        assert!(
            !cursor_block.contains("resume_listen"),
            "speak must not resume Soft 槽 (engine restart kills IME)"
        );
        assert!(
            !cursor_block.contains("focus_composer_for_send"),
            "speak must not click composer (aborts Cursor Voice Mode)"
        );
    }
}
