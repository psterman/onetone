use std::sync::Arc;

use tauri::AppHandle;

use crate::ipc::{stop_trigger_compat_probe, stop_trigger_verify_listen};
use crate::AppState;

use super::core::{emit_to_main_if_available, push_runtime_via_app};

pub fn pause_listen(state: &Arc<AppState>, app: &AppHandle) {
    state.machine_pool.lock().reset_all();
    state.gesture.lock().reset();
    state.record_gesture.lock().reset();
    *state.recording.lock() = false;
    *state.recording_target.lock() = None;
    *state.record_hw_pending.lock() = None;
    *state.record_started_at.lock() = None;
    stop_trigger_compat_probe(state);
    stop_trigger_verify_listen(state);
    if let Some(ref mgr) = *state.hotkey_mgr.lock() {
        mgr.stop_recording();
    }
    *state.paused.lock() = true;
    // ACK / tray / HUD first so FE status flips before engine teardown cost.
    let ack = serde_json::json!({"type":"mvp_paused","ok":true});
    emit_to_main_if_available(app, Some(state), ack);
    push_runtime_via_app(app, state.as_ref(), "paused", "", None);
    crate::runtime_event::publish_runtime_event(
        Some(app),
        state.as_ref(),
        "listen",
        crate::runtime_event::kind::LISTEN_PAUSED,
        "listen paused",
        None,
    );
    crate::tray::refresh_menu_data(app);
    crate::tray::refresh_tray_tooltip(app, state.as_ref());
    crate::tray::refresh_tray_visual_forced(app);
    crate::coach_hud::push_state(app, state.as_ref());
    crate::voice_bootstrap::pause_voice_engines(state);
}

pub fn resume_listen(state: &Arc<AppState>, app: &AppHandle) {
    *state.paused.lock() = false;
    *state.listen_silence_until_ms.lock() = None;
    // ACK / tray / HUD first — activate_desired_engine can take hundreds of ms.
    let ack = serde_json::json!({"type":"mvp_resumed","ok":true});
    emit_to_main_if_available(app, Some(state), ack);
    push_runtime_via_app(app, state.as_ref(), "resumed", "", None);
    crate::runtime_event::publish_runtime_event(
        Some(app),
        state.as_ref(),
        "listen",
        crate::runtime_event::kind::LISTEN_RESUMED,
        "listen resumed",
        None,
    );
    crate::tray::refresh_menu_data(app);
    crate::tray::refresh_tray_tooltip(app, state.as_ref());
    crate::tray::refresh_tray_visual_forced(app);
    crate::coach_hud::push_state(app, state.as_ref());
    // Don't block IPC/FE on engine restart; supervisor serializes via ACTIVATE_LOCK.
    let app_h = app.clone();
    let state_h = Arc::clone(state);
    std::thread::spawn(move || {
        crate::voice_bootstrap::resume_voice_engines(&app_h, &state_h);
    });
}

fn ms_until_utc_end_of_day() -> u64 {
    let secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let secs_in_day = secs % 86_400;
    (86_400 - secs_in_day).saturating_mul(1000)
}

/// Timed silence — pauses listen until `now + duration_ms` then auto-resumes.
pub fn silence_listen_for(state: &Arc<AppState>, app: &AppHandle, duration_ms: u64) {
    let until = crate::runtime_event::now_ms().saturating_add(duration_ms.max(60_000));
    *state.listen_silence_until_ms.lock() = Some(until);
    if !*state.paused.lock() {
        pause_listen(state, app);
    } else {
        crate::tray::refresh_menu_data(app);
        crate::coach_hud::push_state(app, state.as_ref());
    }
    schedule_silence_resume(state, app, until);
}

fn schedule_silence_resume(state: &Arc<AppState>, app: &AppHandle, until_ms: u64) {
    let state_h = Arc::clone(state);
    let app_h = app.clone();
    std::thread::spawn(move || {
        loop {
            let now = crate::runtime_event::now_ms();
            let target = *state_h.listen_silence_until_ms.lock();
            let Some(until) = target else {
                return;
            };
            if until != until_ms {
                return;
            }
            if now >= until {
                *state_h.listen_silence_until_ms.lock() = None;
                if *state_h.paused.lock() {
                    resume_listen(&state_h, &app_h);
                } else {
                    crate::tray::refresh_menu_data(&app_h);
                }
                return;
            }
            let wait = (until - now).min(500);
            std::thread::sleep(std::time::Duration::from_millis(wait));
        }
    });
}

pub fn silence_listen_minutes(state: &Arc<AppState>, app: &AppHandle, minutes: u64) {
    silence_listen_for(state, app, minutes.saturating_mul(60_000));
}

pub fn silence_listen_until_eod(state: &Arc<AppState>, app: &AppHandle) {
    // ponytail: UTC midnight boundary; upgrade to local TZ when platform helper exists.
    silence_listen_for(state, app, ms_until_utc_end_of_day());
}
