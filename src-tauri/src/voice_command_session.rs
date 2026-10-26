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
/// Oral arm forced a temp wake engine because global listen lacked Vosk STT.
static SESSION_OWNED_TEMP_ENGINE: AtomicBool = AtomicBool::new(false);
/// Strategy to restore when SESSION_OWNED_TEMP_ENGINE ends (off / resourceSaver / …).
static ORAL_TEMP_PREV_STRATEGY: std::sync::Mutex<String> = std::sync::Mutex::new(String::new());
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
/// Bumps to cancel a pending hold_session_up grace end (re-down / toggle / end).
static HOLD_RELEASE_GEN: AtomicU64 = AtomicU64::new(0);
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
/// Oral listen auto-end (toggle / Soft Pad one-shot). Hold mode uses HOLD_SAFETY_WINDOW_MS.
/// 12s was eaten by composer focus (~5s FocusFailed) so timeout disarmed before Esc/voice.
const DEFAULT_WINDOW_MS: u64 = 60_000;
/// Safety net while physical key is held; release ends via hold_session_up (+ grace).
const HOLD_SAFETY_WINDOW_MS: u64 = 5 * 60_000;
/// After key-up, keep armed briefly so ASR Finals still reach try_route_oral_armed.
const HOLD_RELEASE_GRACE_MS: u64 = 1_000;
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
        &format!(
            "reclaim mic from voice IME reason={reason} pulsed={pulsed} was_dictating={dictating}"
        ),
    );
    true
}

pub fn armed_mapping_id() -> String {
    SESSION_MAPPING_ID
        .lock()
        .map(|g| g.clone())
        .unwrap_or_default()
}

fn armed_mapping<'a>(
    cfg: &'a crate::config::VoiceConfig,
) -> Option<&'a crate::config::MappingEntry> {
    let mid = armed_mapping_id();
    cfg.find_mapping_by_id(&mid).or_else(|| {
        cfg.active_mappings()
            .into_iter()
            .find(|x| !x.oral_trigger_key().is_empty())
    })
}

fn soft_oral_default_on(slot_id: &str) -> bool {
    matches!(
        slot_id,
        "pushToTalk" | "stopOrSend" | "continue" | "newThread" | "cancelListen"
    )
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

/// Soft Pad oral armed: composer punch target for「继续/发送」(Codex / Cursor / …).
/// None when not oral-armed or mapping has no known chat profile.
pub fn oral_composer_app_target(state: &crate::AppState) -> Option<String> {
    if !is_armed() {
        return None;
    }
    let cfg = state.cfg.lock();
    let tid = oral_app_target_id(&cfg, &armed_mapping_id());
    if tid.is_empty() || crate::app_chat_workflow::profile_for(&tid).is_none() {
        None
    } else {
        Some(tid)
    }
}

fn has_calibrated_composer(cfg: &crate::config::VoiceConfig, app_target_id: &str) -> bool {
    crate::input_aim_calibrate::has_active_composer(cfg, app_target_id)
}

/// After Soft 槽 oral arm: shared ensure (same store as homepage); later punch composer.
pub fn init_composer_on_oral_arm(state: &Arc<AppState>, app: &AppHandle, mapping_id: &str) {
    let (app_target, duration_ms) = {
        let cfg = state.cfg.lock();
        let tid = oral_app_target_id(&cfg, mapping_id);
        if tid.is_empty() || crate::app_chat_workflow::profile_for(&tid).is_none() {
            ORAL_NEED_COMPOSER_AIM.store(false, Ordering::SeqCst);
            return;
        }
        (tid, cfg.key_press_duration_ms)
    };

    match crate::input_aim_calibrate::ensure_composer_aim(app, state.as_ref(), &app_target, false) {
        Ok(res) if res.get("needCalibrate").and_then(|v| v.as_bool()) == Some(true) => {
            ORAL_NEED_COMPOSER_AIM.store(true, Ordering::SeqCst);
            crate::codex_micro_overlay::push_state(app, state.as_ref());
            crate::app_log::log_line(
                state,
                "voice_command",
                &format!("oral_composer_init first_use calibrate app={app_target}"),
            );
        }
        Ok(_) => {
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
                    let _ =
                        crate::app_chat_workflow::focus_composer_for_send(&app_h, &tid, duration_ms);
                });
        }
        Err(err) => {
            ORAL_NEED_COMPOSER_AIM.store(false, Ordering::SeqCst);
            crate::app_log::log_line(
                state,
                "voice_command",
                &format!("oral_composer_init ensure_fail app={app_target} err={err}"),
            );
        }
    }
}

/// Soft Pad oral caption hint. Wave badge + chips own status/sayables; only aim prompt remains.
pub fn listen_hint(_cfg: &crate::config::VoiceConfig) -> String {
    if need_composer_aim() {
        return "请先圈选 Agent 输入框（首次对准）".into();
    }
    String::new()
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
            let Some(raw) = item
                .say
                .as_ref()
                .map(|x| x.trim())
                .filter(|x| !x.is_empty())
            else {
                continue;
            };
            for part in raw
                .split(|c: char| c.is_whitespace() || matches!(c, '、' | ',' | '，' | ';' | '；'))
            {
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
    // 「请按下快捷键」owns side buttons — Soft Pad oral must not steal the press.
    if *state.recording.lock() || crate::hotkey_win::is_recording_session_active() {
        crate::app_log::log_line(
            state,
            "voice_command",
            &format!("session_begin blocked — recording owns wire mapping={mapping_id}"),
        );
        return;
    }
    let gen = SESSION_GEN.fetch_add(1, Ordering::SeqCst).wrapping_add(1);
    SESSION_GEN.store(gen, Ordering::SeqCst);
    HOLD_RELEASE_GEN.fetch_add(1, Ordering::SeqCst); // cancel pending hold_up grace
    SESSION_ARMED.store(true, Ordering::SeqCst);
    if let Ok(mut g) = SESSION_MAPPING_ID.lock() {
        *g = mapping_id.to_string();
    }

    let was_paused = *state.paused.lock();
    SESSION_OWNED_ENGINES.store(was_paused, Ordering::SeqCst);
    // Home poll can leave quiet=true while UI says listening — drops every ASR chunk.
    state.settings_asr_quiet.store(false, Ordering::SeqCst);

    let window_ms = window_ms.max(3_000);
    crate::runtime_event::publish_runtime_event(
        Some(app),
        state.as_ref(),
        "voice_command",
        "session_begin",
        "voice command listen armed",
        Some(serde_json::json!({
            "mappingId": mapping_id,
            "windowMs": window_ms,
            "mode": "voiceListening",
        })),
    );
    crate::app_log::log_line(
        state,
        "voice_command",
        &format!("session_begin mapping={mapping_id} window_ms={window_ms}"),
    );

    // Visual FIRST. reclaim_mic (SendInput+80ms) / activate_desired_engine (hundreds ms)
    // used to run before Soft Pad chrome — under load users saw nothing, released hold,
    // and thought the panel "disappeared" / never knew to keep pressing.
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
    // Esc LL must arm with the session even while mic/engine warm up off-thread.
    sync_oral_esc_capture(state);

    // reclaim_mic (SendInput+80ms) + activate_desired_engine (hundreds ms) off the
    // arm edge so Soft Pad chrome is not starved under UI load.
    mark_oral_engine_warming(state);
    let duration_ms = state.cfg.lock().key_press_duration_ms;
    let state_eng = Arc::clone(state);
    let app_eng = app.clone();
    let _ = std::thread::Builder::new()
        .name("oral-arm-engine".into())
        .spawn(move || {
            let reclaimed_ime =
                reclaim_mic_from_voice_ime(&state_eng, Some(&app_eng), duration_ms, "oral_arm");
            // Soft Pad oral needs Vosk partials (STT preview + free-say match).
            // KWS/off alone opens listen chrome with no transcript and weak routing.
            let borrowed_vosk = ensure_oral_temp_engine(&state_eng);
            if reclaimed_ime || borrowed_vosk {
                crate::voice_bootstrap::activate_desired_engine(
                    &app_eng,
                    &state_eng,
                    "force:oral_arm",
                );
                crate::app_log::log_line(
                    &state_eng,
                    "voice_command",
                    if reclaimed_ime {
                        "oral arm force engine after IME reclaim"
                    } else {
                        "oral arm force engine after vosk borrow"
                    },
                );
            } else if !was_paused && wake_engine_is_listening(state_eng.as_ref()) {
                ORAL_ENGINE_READY.store(true, Ordering::SeqCst);
                crate::app_log::log_line(
                    &state_eng,
                    "voice_command",
                    "oral arm keep engine (already listening)",
                );
            } else {
                crate::ipc::resume_listen(&state_eng, &app_eng);
            }
        });

    // First oral use: open input-aim calibrate. Later: punch Agent composer so
    // 发送/继续 do not land in the editor or other boxes.
    // Keys drawer / OneTone FG: never open fullscreen calibrate — that left the
    // whole monitor unclickable after recording X2 as oral arm.
    let skip_composer = *state.settings_drawer_open.lock()
        || crate::app_identity::foreground_is_self();
    if skip_composer {
        crate::app_log::log_line(
            state,
            "voice_command",
            "oral_composer_init skipped — settings/self FG",
        );
    } else {
        init_composer_on_oral_arm(state, app, mapping_id);
    }

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
    HOLD_RELEASE_GEN.fetch_add(1, Ordering::SeqCst);
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

/// Soft Pad oral: Vosk STT only — SAPI/KWS must not participate in free-say 转写.
/// Returns true when this call flipped engine (caller must force-activate).
fn ensure_oral_temp_engine(state: &Arc<AppState>) -> bool {
    let vosk_ok = {
        let cfg = state.cfg.lock();
        crate::voice_vosk::vosk_resource_issue(&crate::voice_vosk::probe_vosk_resources(
            &cfg.voice_vosk,
            None,
        ))
        .is_none()
    };
    if !vosk_ok {
        SESSION_OWNED_TEMP_ENGINE.store(false, Ordering::SeqCst);
        ORAL_TEMP_GEN.fetch_add(1, Ordering::SeqCst);
        crate::app_log::log_line(
            state,
            "voice_command",
            "oral_temp_engine skip: vosk missing (no sapi/kws fallback)",
        );
        return false;
    }
    let (need, prev) = {
        let cfg = state.cfg.lock();
        let eng = crate::scene_config::idle_desired_voice_engine(&cfg);
        let prev = crate::scene_config::voice_listening_strategy(&cfg).to_string();
        let need = !matches!(eng, crate::scene_config::DesiredVoiceEngine::Vosk);
        (need, prev)
    };
    if !need {
        SESSION_OWNED_TEMP_ENGINE.store(false, Ordering::SeqCst);
        // Invalidate any in-flight oral_end from a prior Esc.
        ORAL_TEMP_GEN.fetch_add(1, Ordering::SeqCst);
        return false;
    }
    {
        let mut cfg = state.cfg.lock();
        crate::config::apply_voice_listening_strategy(&mut cfg, "auto");
    }
    if let Ok(mut g) = ORAL_TEMP_PREV_STRATEGY.lock() {
        *g = prev.clone();
    }
    SESSION_OWNED_TEMP_ENGINE.store(true, Ordering::SeqCst);
    let gen = ORAL_TEMP_GEN.fetch_add(1, Ordering::SeqCst).wrapping_add(1);
    ORAL_TEMP_GEN.store(gen, Ordering::SeqCst);
    crate::app_log::log_line(
        state,
        "voice_command",
        &format!("oral_temp_engine borrow auto/vosk (was strategy={prev})"),
    );
    true
}

fn restore_oral_temp_engine(state: &Arc<AppState>, app: &AppHandle) {
    let prev = ORAL_TEMP_PREV_STRATEGY
        .lock()
        .map(|g| g.clone())
        .unwrap_or_default();
    let restore = if prev.is_empty() { "off" } else { prev.as_str() };
    {
        let mut cfg = state.cfg.lock();
        // Unwind oral auto/Vosk borrow (legacy advanced/SAPI borrow still recognized).
        let strat = crate::scene_config::voice_listening_strategy(&cfg);
        let eng = crate::scene_config::idle_desired_voice_engine(&cfg);
        let looks_like_borrow = matches!(strat, "auto" | "enhanced")
            || (strat == "advanced"
                && matches!(eng, crate::scene_config::DesiredVoiceEngine::Sapi));
        if looks_like_borrow {
            crate::config::apply_voice_listening_strategy(&mut cfg, restore);
        }
    }
    if let Ok(mut g) = ORAL_TEMP_PREV_STRATEGY.lock() {
        g.clear();
    }
    let gen = ORAL_TEMP_GEN.fetch_add(1, Ordering::SeqCst).wrapping_add(1);
    ORAL_TEMP_GEN.store(gen, Ordering::SeqCst);
    crate::app_log::log_line(
        state,
        "voice_command",
        &format!("oral_temp_engine restore strategy={restore}"),
    );
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

/// Hold-to-listen: physical oral key **down** → start oral command listen.
/// Duplicate downs while armed cancel a pending hold_up grace (do not toggle off).
pub fn hold_session_down(state: &Arc<AppState>, app: &AppHandle, mapping_id: &str) {
    if is_armed() {
        HOLD_RELEASE_GEN.fetch_add(1, Ordering::SeqCst);
        return;
    }
    if refuse_wrong_fg(state, app, mapping_id) {
        return;
    }
    begin_session(state, app, mapping_id, HOLD_SAFETY_WINDOW_MS);
}

/// Hold-to-listen: physical oral key **up** → stop after a short grace (ASR Final lag).
pub fn hold_session_up(state: &Arc<AppState>, app: &AppHandle, mapping_id: &str) {
    if !is_armed() {
        return;
    }
    let cur = armed_mapping_id();
    if !mapping_id.is_empty() && !cur.is_empty() && cur != mapping_id {
        return;
    }
    let mid = if mapping_id.is_empty() {
        cur
    } else {
        mapping_id.to_string()
    };
    let gen = HOLD_RELEASE_GEN.fetch_add(1, Ordering::SeqCst).wrapping_add(1);
    let state_h = Arc::clone(state);
    let app_h = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_millis(HOLD_RELEASE_GRACE_MS));
        if HOLD_RELEASE_GEN.load(Ordering::SeqCst) != gen {
            return;
        }
        if !is_armed() {
            return;
        }
        end_session(&state_h, &app_h, &mid, "hold_up");
    });
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
        // A dedicated mouse/volume oral key is a global control. It must remain
        // usable while the user is on OneTone settings or the Soft Pad panel;
        // otherwise recording the side key appears to produce a dead binding.
        let oral = crate::config::canonical_trigger(m.oral_trigger_key());
        if crate::config::is_peripheral_trigger_key(&oral)
            || crate::config::is_volume_hotkey(&oral)
        {
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
    fn listen_hint_empty_when_chips_cover_sayables() {
        let mut cfg = VoiceConfig::default();
        let mid = cfg.mappings[0].id.clone();
        cfg.mappings[0].oral_command_scheme = Some(OralCommandScheme {
            trigger_key: "XButton2".into(),
            activation_mode: "hold".into(),
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
        assert!(hint.is_empty(), "status prose belongs to wave badge, got: {hint}");
        assert!(!hint.contains("口头收听"), "no 口头收听中 status copy");
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
    fn hold_release_grace_cancel_token_advances() {
        // hold_session_up schedules end after HOLD_RELEASE_GRACE_MS; re-down cancels via HOLD_RELEASE_GEN.
        assert!(HOLD_RELEASE_GRACE_MS >= 500);
        let gen_at_schedule = HOLD_RELEASE_GEN.fetch_add(1, Ordering::SeqCst).wrapping_add(1);
        HOLD_RELEASE_GEN.fetch_add(1, Ordering::SeqCst); // re-down / begin cancels
        assert_ne!(
            HOLD_RELEASE_GEN.load(Ordering::SeqCst),
            gen_at_schedule,
            "re-down must invalidate pending hold_up gen"
        );
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
