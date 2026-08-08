use std::sync::Arc;

use crate::AppState;

struct MicMonitorStartGuard<'a>(&'a parking_lot::Mutex<bool>);

impl Drop for MicMonitorStartGuard<'_> {
    fn drop(&mut self) {
        *self.0.lock() = false;
    }
}

#[tauri::command]
pub fn cmd_mic_monitor_start(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    state: tauri::State<Arc<AppState>>,
    #[allow(non_snake_case)] deviceId: Option<String>,
    device_id: Option<String>,
    force: Option<bool>,
) -> Result<(), String> {
    if state.voice_vosk.lock().is_some()
        || state.voice_sapi.lock().is_some()
        || state.voice_kws.lock().is_some()
    {
        return Ok(());
    }
    let snap = state.mic_owner.snapshot();
    if matches!(
        snap.owner,
        onetone_logic::mic_owner::MicOwner::WakeEngine
            | onetone_logic::mic_owner::MicOwner::Calibration { .. }
    ) {
        crate::app_log::log_line(
            state.inner(),
            "mic_monitor",
            &format!(
                "mic_monitor start refused owner={} detail={} reason={}",
                snap.owner.kind_label(),
                snap.owner.detail(),
                snap.reason
            ),
        );
        return Ok(());
    }
    let force = force.unwrap_or(false);
    if force {
        state.audio_backoff.clear();
    } else if state.audio_backoff.is_active() {
        return Err(format!(
            "audio stack cooling down ({}ms remaining)",
            state.audio_backoff.remaining_ms()
        ));
    }
    {
        let mut starting = state.mic_monitor_starting.lock();
        if *starting {
            return Ok(());
        }
        *starting = true;
    }
    let start_gen = state.mic_owner.bump_level_generation();
    let state = Arc::clone(state.inner());
    let state_on_err = Arc::clone(&state);
    let device_id = device_id.or(deviceId);
    let settle_ms = if force {
        crate::audio_win::MIC_MANUAL_REFRESH_SETTLE_MS
    } else {
        crate::audio_win::MIC_MONITOR_SETTLE_MS
    };
    std::thread::Builder::new()
        .name("mic-monitor-start".into())
        .spawn(move || {
            let _guard = MicMonitorStartGuard(&state.mic_monitor_starting);
            crate::audio_win::stop_mic_monitor(&state.mic_monitor);
            std::thread::sleep(std::time::Duration::from_millis(settle_ms));
            // Stale async start after wake/calibration took the mic.
            if start_gen != state.mic_owner.current_level_generation() {
                crate::app_log::log_line(
                    state.as_ref(),
                    "mic_monitor",
                    &format!(
                        "mic_monitor start aborted stale_gen={start_gen} current={}",
                        state.mic_owner.current_level_generation()
                    ),
                );
                return;
            }
            if state.voice_vosk.lock().is_some()
                || state.voice_sapi.lock().is_some()
                || state.voice_kws.lock().is_some()
            {
                return;
            }
            let now = onetone_logic::runtime_event::now_ms();
            let claim = onetone_logic::mic_owner::MicOwner::LevelMonitor {
                generation: start_gen,
            };
            if let Err(err) = state.mic_owner.try_claim(claim.clone(), "mic_monitor_start", now)
            {
                crate::app_log::log_line(
                    state.as_ref(),
                    "mic_monitor",
                    &format!("mic_monitor start claim refused: {err}"),
                );
                return;
            }
            state.mic_level.clear();
            if let Err(err) = crate::audio_win::start_mic_monitor(
                app.clone(),
                window,
                device_id.clone(),
                &state.mic_monitor,
                &state.mic_level,
            ) {
                let _ = state.mic_owner.release(&claim, now, "mic_monitor_start_err");
                crate::app_log::sync_emergency_line(
                    "mic_monitor",
                    &format!("mic monitor start: {err}"),
                );
                state.audio_backoff.enter(std::time::Duration::from_millis(
                    crate::audio_win::DEFAULT_AUDIO_BACKOFF_MS,
                ));
                let device_hint = device_id.as_deref().unwrap_or("");
                crate::audio_win::emit_mic_monitor_error(
                    &app,
                    device_hint,
                    &err,
                    Some(crate::audio_win::DEFAULT_AUDIO_BACKOFF_MS),
                );
            }
        })
        .map_err(|e| {
            *state_on_err.mic_monitor_starting.lock() = false;
            format!("spawn mic monitor: {e}")
        })?;
    Ok(())
}

#[tauri::command]
pub fn cmd_mic_get_level(
    state: tauri::State<Arc<AppState>>,
    #[allow(non_snake_case)] _deviceId: Option<String>,
    _device_id: Option<String>,
) -> crate::audio_win::MicLevelSnapshot {
    // Prefer cached level from the cpal monitor thread; avoid hammering IAudioMeterInformation.
    state.mic_level.snapshot()
}

#[tauri::command]
pub fn cmd_mic_monitor_stop(state: tauri::State<Arc<AppState>>) {
    let now = onetone_logic::runtime_event::now_ms();
    state
        .mic_owner
        .invalidate_level_monitor(now, "mic_monitor_stop");
    crate::audio_win::stop_mic_monitor(&state.mic_monitor);
}
