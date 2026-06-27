mod config;
mod state;
mod key_chord;
mod keyboard;
mod send_guard;
mod ipc;
mod backdrop;
mod tray;
mod policy_config;
mod audio_win;
mod voice_sapi;
mod voice_sapi_runtime;
mod voice_vosk;
mod voice_vosk_runtime;

#[cfg(target_os = "windows")]
mod hotkey_win;

use parking_lot::Mutex;
use std::sync::Arc;
use tauri::Manager;
use tokio::time::{sleep, Duration};

use crate::audio_win::{MicLevelState, MicMonitorHandle};
use crate::config::{load_config, VoiceConfig};
use crate::ipc::RecordingTarget;
use crate::state::StateMachinePool;

pub struct AppState {
    pub cfg: Mutex<VoiceConfig>,
    pub machine_pool: Mutex<StateMachinePool>,
    pub hotkey_mgr: Mutex<Option<hotkey_win::HotkeyManager>>,
    pub recording: Mutex<bool>,
    pub recording_target: Mutex<Option<RecordingTarget>>,
    pub record_hw_pending: Mutex<Option<String>>,
    pub record_started_at: Mutex<Option<std::time::Instant>>,
    pub paused: Mutex<bool>,
    pub mic_monitor: Mutex<Option<MicMonitorHandle>>,
    pub mic_level: Arc<MicLevelState>,
    pub voice_sapi: Mutex<Option<crate::voice_sapi::VoiceSapiHandle>>,
    pub voice_sapi_cooldown_until: Mutex<Option<std::time::Instant>>,
    pub voice_sapi_state: Mutex<String>,
    pub voice_sapi_last_error: Mutex<String>,
    pub voice_sapi_last_heard: Mutex<String>,
    pub voice_sapi_last_skip: Mutex<String>,
    pub voice_vosk: Mutex<Option<crate::voice_vosk::VoiceVoskHandle>>,
    pub voice_vosk_cooldown_until: Mutex<Option<std::time::Instant>>,
    pub voice_vosk_state: Mutex<String>,
    pub voice_vosk_last_error: Mutex<String>,
    pub voice_vosk_last_partial: Mutex<String>,
    pub voice_vosk_last_final: Mutex<String>,
    pub voice_vosk_last_skip: Mutex<String>,
    pub voice_vosk_last_detected_phrase: Mutex<String>,
    pub voice_vosk_grammar_mode: Mutex<Option<bool>>,
    pub voice_vosk_model_load_time_ms: Mutex<Option<u64>>,
}

pub fn run() {
    let mut initial = load_config();
    initial.migrate();

    let app_state = Arc::new(AppState {
        cfg: Mutex::new(initial),
        machine_pool: Mutex::new(StateMachinePool::new()),
        hotkey_mgr: Mutex::new(None),
        recording: Mutex::new(false),
        recording_target: Mutex::new(None),
        record_hw_pending: Mutex::new(None),
        record_started_at: Mutex::new(None),
        paused: Mutex::new(false),
        mic_monitor: Mutex::new(None),
        mic_level: Arc::new(MicLevelState::new()),
        voice_sapi: Mutex::new(None),
        voice_sapi_cooldown_until: Mutex::new(None),
        voice_sapi_state: Mutex::new("stopped".into()),
        voice_sapi_last_error: Mutex::new(String::new()),
        voice_sapi_last_heard: Mutex::new(String::new()),
        voice_sapi_last_skip: Mutex::new(String::new()),
        voice_vosk: Mutex::new(None),
        voice_vosk_cooldown_until: Mutex::new(None),
        voice_vosk_state: Mutex::new("stopped".into()),
        voice_vosk_last_error: Mutex::new(String::new()),
        voice_vosk_last_partial: Mutex::new(String::new()),
        voice_vosk_last_final: Mutex::new(String::new()),
        voice_vosk_last_skip: Mutex::new(String::new()),
        voice_vosk_last_detected_phrase: Mutex::new(String::new()),
        voice_vosk_grammar_mode: Mutex::new(None),
        voice_vosk_model_load_time_ms: Mutex::new(None),
    });

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .manage(app_state.clone())
        .setup(move |app| {
            let window = app.get_webview_window("main").unwrap();

            let backdrop_mode = backdrop::apply_native_backdrop(&window, None);

            let mgr = hotkey_win::HotkeyManager::new();
            {
                let cfg = app_state.cfg.lock();
                mgr.bind_all(&cfg.bindings());
                mgr.bind_scheme_select(cfg.switch_bindings());
                let switch_key = cfg.scheme_switch_key.trim();
                if switch_key.is_empty() {
                    mgr.bind_scheme_switch(None);
                } else {
                    mgr.bind_scheme_switch(Some(switch_key.to_string()));
                }
            }
            #[cfg(windows)]
            if let Some(hwnd) = main_window_hwnd(&window) {
                mgr.attach_app_window(hwnd as isize);
            }
            *app_state.hotkey_mgr.lock() = Some(mgr);

            let json = ipc::mvp_init_json(&app_state, &backdrop_mode);
            window
                .eval(&format!(
                    "setTimeout(function(){{ window.__vp_bridge__('mvp_init', {json}) }}, 300)",
                ))
                .ok();

            config::start_watcher(app_state.clone(), window.clone());

            tray::setup(app.handle(), app_state.clone())?;

            {
                let cfg = app_state.cfg.lock();
                if cfg.voice_sapi.enabled {
                    if let Err(e) = voice_sapi_runtime::voice_sapi_start(&app_state, &cfg.voice_sapi) {
                        eprintln!("voice_sapi start failed: {e}");
                    }
                } else if cfg.voice_vosk.enabled {
                    let resource_dir = app.path().resource_dir().ok();
                    if let Err(e) = voice_vosk_runtime::voice_vosk_start(
                        &app_state,
                        &cfg.voice_vosk,
                        resource_dir,
                    ) {
                        eprintln!("voice_vosk start failed: {e}");
                    }
                }
            }

            let window_clone = window.clone();
            window.on_window_event(move |event| {
                if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                    api.prevent_close();
                    let _ = window_clone.hide();
                }
            });

            let state2 = app_state.clone();
            let win2 = window.clone();
            tauri::async_runtime::spawn(async move {
                let mut last_key: Option<String> = None;
                let mut last_at: Option<std::time::Instant> = None;
                const DEDUP_MS: u64 = 80;

                loop {
                    sleep(Duration::from_millis(20)).await;

                    voice_sapi_runtime::drain_voice_sapi_events(&state2, &win2);
                    voice_vosk_runtime::drain_voice_vosk_events(&state2, &win2);

                    if crate::send_guard::is_active() {
                        continue;
                    }

                    let key_name = {
                        let mgr_opt = state2.hotkey_mgr.lock();
                        mgr_opt.as_ref().and_then(|mgr| mgr.try_recv())
                    };

                    let Some(key_name) = key_name else {
                        continue;
                    };

                    let now = std::time::Instant::now();
                    if let (Some(ref prev), Some(at)) = (&last_key, last_at) {
                        if prev == &key_name && now.duration_since(at) < Duration::from_millis(DEDUP_MS)
                        {
                            continue;
                        }
                    }
                    last_key = Some(key_name.clone());
                    last_at = Some(now);

                    if *state2.recording.lock() {
                        ipc::handle_hardware_record_key(&state2, &win2, &key_name);
                        continue;
                    }

                    if *state2.paused.lock() {
                        continue;
                    }

                    if key_name == config::SCHEME_CYCLE_MARKER {
                        ipc::handle_scheme_cycle(&state2, &win2);
                        continue;
                    }

                    if let Some(mapping_id) = key_name.strip_prefix(config::SCHEME_SELECT_PREFIX) {
                        if !mapping_id.is_empty() {
                            ipc::handle_scheme_select(&state2, &win2, mapping_id);
                        }
                        continue;
                    }

                    ipc::handle_physical_key(&state2, &win2, &key_name);
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            ipc::cmd_ready,
            ipc::cmd_save,
            ipc::cmd_start_recording,
            ipc::cmd_stop_recording,
            ipc::cmd_pause,
            ipc::cmd_resume,
            ipc::cmd_request_runtime,
            ipc::cmd_capture_source,
            ipc::cmd_frontend_keydown,
            ipc::cmd_physical_trigger,
            ipc::cmd_test_send,
            ipc::cmd_mapping_toggle,
            ipc::cmd_mapping_delete,
            ipc::cmd_mapping_duplicate,
            ipc::cmd_mapping_reorder,
            ipc::cmd_mapping_set_group,
            ipc::cmd_mapping_set_source_key,
            ipc::cmd_mapping_conflicts,
            ipc::cmd_reload_latest,
            ipc::cmd_window_minimize,
            ipc::cmd_window_close,
            ipc::cmd_sync_theme_backdrop,
            ipc::cmd_tray_menu_ready,
            ipc::cmd_tray_action,
            ipc::cmd_tray_menu_present,
            ipc::cmd_autostart_get,
            ipc::cmd_autostart_set,
            ipc::cmd_mic_list,
            ipc::cmd_mic_set_default,
            ipc::cmd_mic_monitor_start,
            ipc::cmd_mic_monitor_stop,
            ipc::cmd_mic_get_level,
            ipc::cmd_voice_sapi_status,
            ipc::cmd_voice_sapi_set_enabled,
            ipc::cmd_voice_sapi_set_phrases,
            ipc::cmd_voice_sapi_set_min_confidence,
            ipc::cmd_voice_sapi_test_send,
            ipc::cmd_voice_vosk_status,
            ipc::cmd_voice_vosk_set_enabled,
            ipc::cmd_voice_vosk_set_phrases,
            ipc::cmd_voice_vosk_set_model_preset,
            ipc::cmd_voice_vosk_set_model_path,
            ipc::cmd_voice_vosk_test_send,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(windows)]
fn main_window_hwnd(window: &tauri::WebviewWindow) -> Option<winapi::shared::windef::HWND> {
    use raw_window_handle::{HasWindowHandle, RawWindowHandle};
    let handle = window.window_handle().ok()?;
    match handle.as_raw() {
        RawWindowHandle::Win32(platform) => Some(platform.hwnd.get() as _),
        _ => None,
    }
}
