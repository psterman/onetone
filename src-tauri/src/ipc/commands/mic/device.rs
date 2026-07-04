use std::sync::Arc;

use crate::AppState;

#[tauri::command]
pub async fn cmd_mic_list(
    state: tauri::State<'_, Arc<AppState>>,
    force: Option<bool>,
) -> Result<Vec<crate::audio_win::MicDeviceInfo>, String> {
    let force = force.unwrap_or(false);
    if force {
        state.audio_backoff.clear();
    } else if state.audio_backoff.is_active() {
        return Err(format!(
            "audio stack cooling down ({}ms remaining)",
            state.audio_backoff.remaining_ms()
        ));
    }
    let timeout = std::time::Duration::from_millis(crate::audio_win::COM_OP_TIMEOUT_MS);
    match tokio::time::timeout(
        timeout,
        tauri::async_runtime::spawn_blocking(crate::audio_win::list_input_devices),
    )
    .await
    {
        Ok(Ok(Ok(devices))) => Ok(devices),
        Ok(Ok(Err(e))) => {
            state.audio_backoff.enter(std::time::Duration::from_millis(
                crate::audio_win::DEFAULT_AUDIO_BACKOFF_MS,
            ));
            Err(e)
        }
        Ok(Err(e)) => {
            state.audio_backoff.enter(std::time::Duration::from_millis(
                crate::audio_win::DEFAULT_AUDIO_BACKOFF_MS,
            ));
            Err(format!("mic list task failed: {e}"))
        }
        Err(_) => {
            state.audio_backoff.enter(std::time::Duration::from_millis(
                crate::audio_win::DEFAULT_AUDIO_BACKOFF_MS,
            ));
            Err(format!(
                "mic list timed out after {}ms",
                crate::audio_win::COM_OP_TIMEOUT_MS
            ))
        }
    }
}

#[tauri::command]
pub fn cmd_mic_set_default(
    state: tauri::State<Arc<AppState>>,
    #[allow(non_snake_case)] deviceId: Option<String>,
    device_id: Option<String>,
    force: Option<bool>,
) -> Result<(), String> {
    let force = force.unwrap_or(false);
    if force {
        state.audio_backoff.clear();
    } else if state.audio_backoff.is_active() {
        return Err(format!(
            "audio stack cooling down ({}ms remaining)",
            state.audio_backoff.remaining_ms()
        ));
    }
    let id = device_id
        .or(deviceId)
        .ok_or_else(|| "missing device id".to_string())?;
    crate::audio_win::stop_mic_monitor(&state.mic_monitor);
    std::thread::sleep(std::time::Duration::from_millis(
        crate::audio_win::MIC_MONITOR_SETTLE_MS,
    ));
    let timeout = std::time::Duration::from_millis(crate::audio_win::COM_OP_TIMEOUT_MS);
    let id_for_op = id.clone();
    match crate::audio_win::run_with_timeout(timeout, move || {
        crate::audio_win::set_default_input_device(&id_for_op)
    }) {
        Ok(()) => {
            let cfg = state.cfg.lock().voice_sapi.clone();
            if cfg.enabled {
                crate::voice_sapi_runtime::voice_sapi_start(&state, &cfg)?;
                crate::audio_win::request_recording_audio_policy_sync(Arc::clone(state.inner()));
            }
            Ok(())
        }
        Err(e) => {
            state.audio_backoff.enter(std::time::Duration::from_millis(
                crate::audio_win::DEFAULT_AUDIO_BACKOFF_MS,
            ));
            Err(e)
        }
    }
}
