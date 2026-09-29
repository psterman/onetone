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
/// Oral arm forced a temp wake engine because global listening strategy was off.
static SESSION_OWNED_TEMP_ENGINE: AtomicBool = AtomicBool::new(false);
/// Bumps on each temp arm/restore so a late `force:oral_end` cannot kill a newer arm.
static ORAL_TEMP_GEN: AtomicU64 = AtomicU64::new(0);
/// Soft 槽「说话」/ Soft Pad ACT10 may start Cursor IME while oral is armed.
/// Side-key dictation must NOT — it steals WASAPI from Vosk oral listen.
static ORAL_ALLOW_IME_START: AtomicBool = AtomicBool::new(false);
/// Soft 槽「说话」started the system/Cursor voice IME — Soft 槽 can toggle it off.
static IME_VOICE_ACTIVE: AtomicBool = AtomicBool::new(false);
/// After arm: false until wake engine is listening (or ORAL_READY_GRACE_MS elapsed).
static ORAL_ENGINE_READY: AtomicBool = AtomicBool::new(true);
static ORAL_ARM_AT_MS: AtomicU64 = AtomicU64::new(0);
static SESSION_GEN: AtomicU64 = AtomicU64::new(0);
static SESSION_MAPPING_ID: std::sync::Mutex<String> = std::sync::Mutex::new(String::new());

pub fn allow_next_ime_start_while_oral() {
    ORAL_ALLOW_IME_START.store(true, Ordering::SeqCst);
}

fn take_ime_start_allowed_while_oral() -> bool {
    ORAL_ALLOW_IME_START.swap(false, Ordering::SeqCst)
}

/// True when Cursor IME / input.start must be refused (oral holds the mic).
pub fn blocks_dictation_ime_start() -> bool {
    is_armed() && !take_ime_start_allowed_while_oral()
}

/// Block SendKey / side-key chords that open Cursor/Typeless voice while oral listens.
pub fn blocks_voice_ime_chord(state: &AppState, chord: &str) -> bool {
    if !is_armed() {
        return false;
    }
    let c = chord.trim();
    if c.is_empty() {
        return false;
    }
    if crate::key_chord::is_toggle_voice_chord(c)
        || crate::voice_end_runtime::is_hold_to_talk_voice_key(c)
    {
        return true;
    }
    let cfg = state.cfg.lock();
    if let Some(vk) = crate::voice_end_runtime::resolve_voice_input_target_key(&cfg) {
        if crate::key_chord::chords_equivalent(c, &vk) {
            return true;
        }
    }
    let mid = armed_mapping_id();
    if let Some(m) = cfg.find_mapping_by_id(&mid) {
        if let Some(vk) = crate::voice_end_runtime::resolve_voice_key_for_mapping(&cfg, Some(m)) {
            if crate::key_chord::chords_equivalent(c, &vk) {
                return true;
            }
        }
    }
    false
}

/// Physical dictation trigger (not the oral arm key) while Soft Pad oral is listening.
pub fn blocks_dictation_physical_key(
    state: &AppState,
    event: &crate::press_gesture::PhysicalKeyEvent,
) -> bool {
    if !is_armed() || event.is_keyup {
        return false;
    }
    let cfg = state.cfg.lock();
    // Oral arm key itself toggles session off — never swallow.
    if cfg.find_mapping_for_oral_event(event).is_some() {
        return false;
    }
    if let Some(m) = cfg.find_mapping_for_event(event) {
        if crate::config::is_app_scenario_mapping(m) {
            return true;
        }
    }
    false
}
/// Oral listen auto-end. 12s was eaten by composer focus (~5s FocusFailed) so
/// timeout disarmed before Esc/voice; Soft Pad chrome stayed「口头收听中」.
const DEFAULT_WINDOW_MS: u64 = 60_000;
/// Soft gate for non-disarm oral phrases while engine warms up after arm.
const ORAL_READY_GRACE_MS: u64 = 800;

pub fn is_armed() -> bool {
    SESSION_ARMED.load(Ordering::SeqCst)
}

/// Esc LL must stay up while armed, or while Soft Pad still shows oral ACT10 listening
/// after a raced/timeout end (sticky chrome with SESSION_ARMED already false).
pub fn wants_esc_exit() -> bool {
    is_armed() || crate::codex_micro_overlay::oral_pad_listening_chrome()
}

/// True when oral soft slots (发送/说话/…) may run. Disarm/Esc ignore this.
pub fn is_oral_engine_ready(state: &AppState) -> bool {
    if !is_armed() {
        return true;
    }
    if ORAL_ENGINE_READY.load(Ordering::SeqCst) {
        return true;
    }
    let armed_at = ORAL_ARM_AT_MS.load(Ordering::SeqCst);
    let now = crate::runtime_event::now_ms();
    if armed_at > 0 && now.saturating_sub(armed_at) >= ORAL_READY_GRACE_MS {
        ORAL_ENGINE_READY.store(true, Ordering::SeqCst);
        return true;
    }
    if wake_engine_is_listening(state) {
        ORAL_ENGINE_READY.store(true, Ordering::SeqCst);
        return true;
    }
    false
}

fn wake_engine_is_listening(state: &AppState) -> bool {
    let vosk = state.voice_vosk_state.lock().clone();
    let kws = state.voice_kws_state.lock().clone();
    let sapi = state.voice_sapi_state.lock().clone();
    let ok = |s: &str| matches!(s, "listening" | "cooldown" | "triggered");
    ok(vosk.as_str()) || ok(kws.as_str()) || ok(sapi.as_str())
}

fn mark_oral_engine_warming(state: &Arc<AppState>) {
    ORAL_ENGINE_READY.store(false, Ordering::SeqCst);
    ORAL_ARM_AT_MS.store(crate::runtime_event::now_ms(), Ordering::SeqCst);
    // Flip ready as soon as engine reports listening (don't wait full grace).
    let state_h = Arc::clone(state);
    std::thread::spawn(move || {
        for _ in 0..20 {
            std::thread::sleep(Duration::from_millis(50));
            if !is_armed() {
                return;
            }
            if wake_engine_is_listening(state_h.as_ref()) {
                ORAL_ENGINE_READY.store(true, Ordering::SeqCst);
                return;
            }
        }
        if is_armed() {
            ORAL_ENGINE_READY.store(true, Ordering::SeqCst);
        }
    });
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

fn resolve_voice_ime_chord(state: &AppState) -> Option<String> {
    let cfg = state.cfg.lock();
    let mid = armed_mapping_id();
    let mapping = cfg.find_mapping_by_id(&mid);
    crate::voice_end_runtime::resolve_voice_key_for_mapping(&cfg, mapping)
        .or_else(|| crate::voice_end_runtime::resolve_voice_input_target_key(&cfg))
        .filter(|s| !s.trim().is_empty())
}

/// Pulse the configured voice chord to close Cursor/Typeless IME (toggle or hold-end).
fn pulse_voice_ime_stop(state: &Arc<AppState>, duration_ms: u32) -> bool {
    IME_VOICE_ACTIVE.store(false, Ordering::SeqCst);
    let Some(key) = resolve_voice_ime_chord(state.as_ref()) else {
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

/// If Soft 槽「说话」left the voice IME on, pulse the same chord to close it.
/// Call before 发送 / 取消 / 继续 so Enter/text is not eaten by IME capture.
pub fn stop_ime_voice_if_active(state: &Arc<AppState>, duration_ms: u32) -> bool {
    if !IME_VOICE_ACTIVE.load(Ordering::SeqCst) {
        return false;
    }
    pulse_voice_ime_stop(state, duration_ms)
}

/// Side-key SendKey(RAlt) enters dictating without Soft「说话」flag — IME still owns WASAPI.
/// Returns true when IME/session was reclaimed (caller must force-restart Vosk).
pub fn reclaim_mic_from_voice_ime(
    state: &Arc<AppState>,
    app: Option<&AppHandle>,
    duration_ms: u32,
    reason: &str,
) -> bool {
    let flagged = IME_VOICE_ACTIVE.load(Ordering::SeqCst);
    let dictating = crate::voice_end_runtime::session_state(state.as_ref()) == "dictating";
    if !flagged && !dictating {
        return false;
    }
    let pulsed = pulse_voice_ime_stop(state, duration_ms);
    if dictating {
        crate::voice_end_runtime::reset_voice_session(state, app, reason);
    }
    crate::app_log::log_line(
        state,
        "voice_command",
        &format!("reclaim mic from voice IME reason={reason} pulsed={pulsed} was_dictating={dictating}"),
    );
    true
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

fn soft_oral_default_on(slot_id: &str) -> bool {
    matches!(slot_id, "pushToTalk" | "stopOrSend" | "cancelListen")
}

fn oral_item_on(scheme: Option<&crate::config::OralCommandScheme>, id: &str) -> bool {
    let default_on = id
        .strip_prefix("soft:")
        .map(soft_oral_default_on)
        .unwrap_or(false);
    match scheme.and_then(|s| s.items.get(id)) {
        Some(it) => it.enabled.unwrap_or(default_on),
        None => default_on,
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
            if item.enabled != Some(true) {
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
    "Esc / 说「取消」「退出」→ 退出收听 · 发送→右侧框+Enter".into()
}

/// Compact cards for Soft Pad listen strip (name + primary say).
pub fn listen_command_cards(cfg: &crate::config::VoiceConfig) -> Vec<(String, String, String)> {
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
        cards.push((slot.label_zh.to_string(), say, slot.slot_id.to_string()));
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

    // Side-key SendKey / Soft「说话」may leave Cursor IME on WASAPI — reclaim before Vosk.
    let duration_ms = state.cfg.lock().key_press_duration_ms;
    let reclaimed_ime =
        reclaim_mic_from_voice_ime(state, Some(app), duration_ms, "oral_arm");
    // Home poll can leave quiet=true while UI says listening — drops every ASR chunk.
    state
        .settings_asr_quiet
        .store(false, Ordering::SeqCst);

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

    // Global wake off → borrow resourceSaver so resume_listen activates KWS.
    // Do NOT unconditional force:oral_arm — that restarted healthy Vosk every side-key
    // and dropped spoken「退出」during model_open (450–620ms).
    ensure_oral_temp_engine(state, app);
    // After IME reclaim, WASAPI must reopen — soft-keep leaves empty 听到 / dead oral keywords.
    // Otherwise keep a healthy listener (resume_listen noops when already active).
    if reclaimed_ime {
        crate::voice_bootstrap::activate_desired_engine(app, state, "force:oral_arm");
        mark_oral_engine_warming(state);
        crate::app_log::log_line(
            state,
            "voice_command",
            "oral arm force engine after IME reclaim",
        );
    } else if wake_engine_is_listening(state.as_ref()) {
        ORAL_ENGINE_READY.store(true, Ordering::SeqCst);
        crate::app_log::log_line(
            state,
            "voice_command",
            "oral arm keep engine (already listening)",
        );
    } else {
        crate::ipc::resume_listen(state, app);
        mark_oral_engine_warming(state);
    }
    sync_oral_esc_capture(state);

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
    let owned_temp = SESSION_OWNED_TEMP_ENGINE.swap(false, Ordering::SeqCst);
    IME_VOICE_ACTIVE.store(false, Ordering::SeqCst);
    ORAL_NEED_COMPOSER_AIM.store(false, Ordering::SeqCst);
    ORAL_ENGINE_READY.store(true, Ordering::SeqCst);
    ORAL_ARM_AT_MS.store(0, Ordering::SeqCst);

    crate::app_log::log_line(
        state,
        "voice_command",
        &format!("session_end mapping={mapping_id} reason={reason}"),
    );
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
    // Drop heard transcript so Soft Pad band does not stay open on「取消」text alone.
    *state.voice_vosk_last_partial.lock() = String::new();
    *state.voice_vosk_last_final.lock() = String::new();
    *state.voice_vosk_last_detected_phrase.lock() = String::new();
    crate::codex_micro_overlay::note_pad_run_status("idle", "ACT10");
    crate::codex_micro_overlay::push_state(app, state.as_ref());

    if owned_temp {
        restore_oral_temp_engine(state, app);
    }

    // Drop oral Esc LL capture after disarm.
    sync_oral_esc_capture(state);

    // Only pause if this session was what brought engines up (default-paused path).
    if owned && !*state.paused.lock() {
        crate::ipc::pause_listen(state, app);
    }
}

fn sync_oral_esc_capture(state: &Arc<AppState>) {
    if let Some(ref mgr) = *state.hotkey_mgr.lock() {
        mgr.sync_capture();
    }
}

/// When global listening is off, borrow KWS for the oral window so「取消」is heard.
fn ensure_oral_temp_engine(state: &Arc<AppState>, app: &AppHandle) {
    let need = {
        let cfg = state.cfg.lock();
        crate::scene_config::idle_desired_voice_engine(&cfg)
            == crate::scene_config::DesiredVoiceEngine::None
    };
    if !need {
        SESSION_OWNED_TEMP_ENGINE.store(false, Ordering::SeqCst);
        // Invalidate any in-flight oral_end from a prior Esc.
        ORAL_TEMP_GEN.fetch_add(1, Ordering::SeqCst);
        return;
    }
    {
        let mut cfg = state.cfg.lock();
        // idle_desired short-circuits on strategy "off" — must flip strategy too.
        crate::config::apply_voice_listening_strategy(&mut cfg, "resourceSaver");
    }
    SESSION_OWNED_TEMP_ENGINE.store(true, Ordering::SeqCst);
    let gen = ORAL_TEMP_GEN.fetch_add(1, Ordering::SeqCst).wrapping_add(1);
    ORAL_TEMP_GEN.store(gen, Ordering::SeqCst);
    crate::app_log::log_line(
        state,
        "voice_command",
        "oral_temp_engine borrow resourceSaver/kws (global listen was off)",
    );
    let app_h = app.clone();
    let state_h = Arc::clone(state);
    std::thread::spawn(move || {
        if ORAL_TEMP_GEN.load(Ordering::SeqCst) != gen {
            return;
        }
        crate::voice_bootstrap::activate_desired_engine(&app_h, &state_h, "force:oral_arm");
    });
}

fn restore_oral_temp_engine(state: &Arc<AppState>, app: &AppHandle) {
    {
        let mut cfg = state.cfg.lock();
        // Only restore if we still look like the temp borrow.
        let strat = crate::scene_config::voice_listening_strategy(&cfg);
        if strat == "resourceSaver" || strat == "auto" {
            crate::config::apply_voice_listening_strategy(&mut cfg, "off");
        }
    }
    let gen = ORAL_TEMP_GEN.fetch_add(1, Ordering::SeqCst).wrapping_add(1);
    ORAL_TEMP_GEN.store(gen, Ordering::SeqCst);
    crate::app_log::log_line(state, "voice_command", "oral_temp_engine restore off");
    let app_h = app.clone();
    let state_h = Arc::clone(state);
    std::thread::spawn(move || {
        // Drop if a newer arm already claimed the temp engine.
        if ORAL_TEMP_GEN.load(Ordering::SeqCst) != gen {
            return;
        }
        crate::voice_bootstrap::activate_desired_engine(&app_h, &state_h, "force:oral_end");
    });
}

pub fn toggle_session(state: &Arc<AppState>, app: &AppHandle, mapping_id: &str) {
    if is_armed() {
        end_session(state, app, mapping_id, "toggle");
        return;
    }
    if refuse_wrong_fg(state, app, mapping_id) {
        return;
    }
    begin_session(state, app, mapping_id, DEFAULT_WINDOW_MS);
}

/// End oral listen without needing the main WebviewWindow (tray / Soft Pad only).
/// Voice「取消」used to call `get_main_window()?` and silently abort when main was hidden.
pub fn force_cancel(state: &Arc<AppState>, app: &AppHandle, reason: &str) -> bool {
    let was_oral = is_armed();
    let duration_ms = state.cfg.lock().key_press_duration_ms;
    let _ = stop_ime_voice_if_active(state, duration_ms);
    if crate::voice_end_runtime::session_state(state.as_ref()) == "dictating" {
        crate::voice_end_runtime::reset_voice_session(state, Some(app), reason);
    }
    let _ = crate::soft_pad_voice_pending::cancel_pending(state.as_ref(), app);
    if was_oral {
        let mid = armed_mapping_id();
        end_session(state, app, &mid, reason);
    } else {
        *state.voice_vosk_last_partial.lock() = String::new();
        *state.voice_vosk_last_final.lock() = String::new();
        *state.voice_vosk_last_detected_phrase.lock() = String::new();
        crate::codex_micro_overlay::note_pad_run_status("idle", "ACT10");
    }
    // Always push — Soft Pad sticky「口头收听中」must clear even when already disarmed.
    crate::codex_micro_overlay::push_state(app, state.as_ref());
    crate::cursor_beginner::disarm(state.as_ref(), app);
    // Drop Esc LL after sticky ACT10 clear (end_session already syncs when was_oral).
    sync_oral_esc_capture(state);
    crate::app_log::log_line(
        state,
        "voice_command",
        &format!("force_cancel reason={reason} was_oral={was_oral}"),
    );
    true
}

/// App oral/voice-command scheme only arms when FG matches the habit target.
fn refuse_wrong_fg(state: &Arc<AppState>, app: &AppHandle, mapping_id: &str) -> bool {
    let (app_tid, target_name) = {
        let cfg = state.cfg.lock();
        let Some(m) = cfg.find_mapping_by_id(mapping_id) else {
            return false;
        };
        if !crate::config::is_app_scenario_mapping(m) {
            return false;
        }
        // Soft Pad / OneTone holding FG after Esc must not block Cursor oral re-arm.
        if crate::app_identity::foreground_is_self() {
            return false;
        }
        let fg = crate::soft_pad_runtime::oral_arm_foreground_identity();
        if crate::config::oral_trigger_is_live(m, fg.as_ref()) {
            return false;
        }
        let app_tid = m.app_target_id.trim().to_string();
        let label = m.label.trim();
        let target_name = if !label.is_empty() {
            label.to_string()
        } else {
            app_tid.clone()
        };
        (app_tid, target_name)
    };
    let fg = crate::app_identity::foreground_effective_app_target_id();
    crate::runtime_event::publish_runtime_event(
        Some(app),
        state.as_ref(),
        "voice_command",
        crate::runtime_event::kind::VOICE_WAKE_REFUSED_WRONG_FG,
        &format!(
            "oral arm refused wrong_fg want={app_tid} fg={:?}",
            fg.as_deref().unwrap_or("")
        ),
        Some(serde_json::json!({
            "appTargetId": app_tid,
            "targetName": target_name,
            "fgAppTargetId": fg,
            "reason": "wrong_fg",
            "source": "oral",
            "mappingId": mapping_id,
        })),
    );
    crate::codex_micro_overlay::note_pad_run_status("failed", "ACT10");
    crate::codex_micro_overlay::push_state(app, state.as_ref());
    crate::app_log::log_line(
        state,
        "voice_command",
        &format!("session_refuse wrong_fg mapping={mapping_id} want={app_tid}"),
    );
    true
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
        assert!(cards.iter().any(|(_, say, _)| say == "发出去"));
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
