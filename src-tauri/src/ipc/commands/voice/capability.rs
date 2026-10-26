use std::sync::Arc;

use tauri::Manager;

use crate::AppState;

#[tauri::command]
pub async fn cmd_voice_capability_probe(
    state: tauri::State<'_, Arc<AppState>>,
    app: tauri::AppHandle,
    #[allow(non_snake_case)] forceRefresh: Option<bool>,
    force_refresh: Option<bool>,
    #[allow(non_snake_case)] applyDefault: Option<bool>,
    apply_default: Option<bool>,
) -> Result<serde_json::Value, String> {
    let force = force_refresh.or(forceRefresh).unwrap_or(false);
    let apply = apply_default.or(applyDefault).unwrap_or(false);
    let state = Arc::clone(state.inner());
    let resource_dir = app.path().resource_dir().ok();

    let join = tauri::async_runtime::spawn_blocking(move || {
        crate::ui_heartbeat::note_ipc_enter("voice_capability_probe");
        let cfg = state.cfg.lock().clone();
        let mut cap = crate::voice_capability::probe_voice_capability(
            &cfg,
            resource_dir.as_deref(),
            force,
        );

        let mut applied_wake = false;
        if apply {
            let mut cfg = state.cfg.lock();
            if crate::voice_capability::apply_recommended_wake_if_unpinned(
                &mut cfg,
                cap.recommended_wake,
            ) {
                applied_wake = true;
                cfg.normalize();
                let snap = cfg.clone();
                drop(cfg);
                let _ = std::thread::Builder::new()
                    .name("voice-cap-save".into())
                    .spawn(move || {
                        crate::config::save_config(&snap);
                    });
            }
        }

        // Soft Pad / auto path: never silent-download — surface flag for FE guide.
        let strategy = crate::config::normalize_voice_listening_strategy(
            &state.cfg.lock().voice_listening_strategy,
        );
        if matches!(strategy, "auto" | "enhanced") && !cap.vosk_installed {
            cap.need_vosk_download = true;
        }

        crate::ui_heartbeat::note_ipc_exit("voice_capability_probe");
        serde_json::json!({
            "ok": true,
            "capability": cap,
            "appliedWakeDefault": applied_wake,
            "needVoskDownload": cap.need_vosk_download,
        })
    });

    match tokio::time::timeout(std::time::Duration::from_millis(1500), join).await {
        Ok(Ok(v)) => Ok(v),
        Ok(Err(e)) => Err(format!("voice capability probe task failed: {e}")),
        Err(_) => Err("voice capability probe timeout".into()),
    }
}
