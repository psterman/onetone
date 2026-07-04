mod app_icon;
mod app_log;
mod audio_win;
mod backdrop;
mod config;
mod ipc;
mod key_chord;
mod keyboard;
mod native_dll;
mod policy_config;
mod press_gesture;
mod resource_monitor;
mod runtime_event;
mod send_guard;
mod state;
mod tray;
mod update;
mod voice_bootstrap;
mod voice_end_runtime;
mod voice_sapi;
mod voice_sapi_runtime;
mod voice_vosk;
mod voice_vosk_runtime;
mod window_layout;

#[cfg(target_os = "windows")]
mod hotkey_win;

use parking_lot::Mutex;
use std::collections::VecDeque;
use std::sync::atomic::{AtomicBool, AtomicU64};
use std::sync::Arc;
use tauri::Manager;
use tokio::time::{sleep, Duration};

use crate::audio_win::{AudioBackoffState, MicLevelState, MicMonitorHandle};
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
    /// After volume/peripheral trigger capture, ignore stray modifier keys briefly.
    pub record_guard_until: Mutex<Option<std::time::Instant>>,
    pub paused: Mutex<bool>,
    pub mic_monitor: Mutex<Option<MicMonitorHandle>>,
    pub mic_level: Arc<MicLevelState>,
    pub audio_backoff: AudioBackoffState,
    pub recording_audio: Mutex<Option<crate::audio_win::RecordingAudioBackup>>,
    pub recording_audio_sync_running: AtomicBool,
    pub recording_audio_sync_pending: AtomicBool,
    pub mic_monitor_starting: Mutex<bool>,
    pub voice_sapi: Mutex<Option<crate::voice_sapi::VoiceSapiHandle>>,
    pub voice_sapi_cooldown_until: Mutex<Option<std::time::Instant>>,
    pub voice_sapi_state: Mutex<String>,
    pub voice_sapi_last_error: Mutex<String>,
    pub voice_sapi_last_heard: Mutex<String>,
    pub voice_sapi_last_skip: Mutex<String>,
    pub voice_sapi_last_trigger: Mutex<String>,
    pub voice_vosk: Mutex<Option<crate::voice_vosk::VoiceVoskHandle>>,
    pub voice_vosk_cooldown_until: Mutex<Option<std::time::Instant>>,
    pub voice_vosk_state: Mutex<String>,
    pub voice_vosk_last_error: Mutex<String>,
    pub voice_vosk_last_partial: Mutex<String>,
    pub voice_vosk_last_final: Mutex<String>,
    pub voice_vosk_last_skip: Mutex<String>,
    pub voice_vosk_last_trigger: Mutex<String>,
    pub voice_vosk_last_detected_phrase: Mutex<String>,
    pub voice_vosk_grammar_mode: Mutex<Option<bool>>,
    pub voice_vosk_model_load_time_ms: Mutex<Option<u64>>,
    pub voice_session_state: Mutex<String>,
    pub voice_session_started_at: Mutex<Option<std::time::Instant>>,
    pub voice_session_last_end_phrase: Mutex<String>,
    pub voice_session_last_action: Mutex<String>,
    pub voice_session_mapping_id: Mutex<String>,
    pub voice_session_commit_token: Mutex<u64>,
    /// Last time a voice wake/stop shortcut was physically sent (RAlt etc.).
    pub voice_wake_last_key_at: Mutex<Option<std::time::Instant>>,
    pub voice_vosk_probe: Mutex<Option<crate::voice_vosk::VoskResourceProbe>>,
    pub voice_vosk_epoch: AtomicU64,
    pub update: Mutex<crate::update::UpdateUiState>,
    pub update_checking: Mutex<bool>,
    pub update_installing: Mutex<bool>,
    pub gesture: Mutex<press_gesture::GestureTracker>,
    pub record_gesture: Mutex<press_gesture::RecordGestureDetector>,
    pub process_usage_sampler: Mutex<resource_monitor::ProcessUsageSampler>,
    pub log_ring: Mutex<VecDeque<String>>,
    pub runtime_events: onetone_logic::runtime_event::RuntimeEventRing,
}

pub fn graceful_exit(app: &tauri::AppHandle) {
    if let Some(menu_win) = app.get_webview_window("tray_menu") {
        let _ = menu_win.hide();
    }
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.hide();
    }
    if let Some(state) = app.try_state::<Arc<AppState>>() {
        shutdown_runtime(state.inner());
    }
    let _ = app.remove_tray_by_id(tray::TRAY_ID);
    app.exit(0);
}

fn shutdown_runtime(state: &Arc<AppState>) {
    crate::audio_win::stop_mic_monitor(&state.mic_monitor);
    crate::voice_sapi_runtime::voice_sapi_stop(state);
    crate::voice_vosk_runtime::voice_vosk_stop(state);
    crate::audio_win::sync_recording_audio_policy_now(state.as_ref());
    let _ = state.hotkey_mgr.lock().take();
    *state.paused.lock() = true;
}

pub fn run() {
    app_log::early_line("startup", "process run entered");
    std::panic::set_hook(Box::new(|info| {
        app_log::early_line("panic", &info.to_string());
    }));
    app_log::early_line("startup", "loading config");
    let mut initial = load_config();
    app_log::early_line("startup", "config loaded");
    initial.migrate();
    let safe_mode = std::env::var("ONETONE_SAFE_MODE").ok().as_deref() == Some("1");
    app_log::early_line("startup", "building app state");

    let app_state = Arc::new(AppState {
        cfg: Mutex::new(initial),
        machine_pool: Mutex::new(StateMachinePool::new()),
        hotkey_mgr: Mutex::new(None),
        recording: Mutex::new(false),
        recording_target: Mutex::new(None),
        record_hw_pending: Mutex::new(None),
        record_started_at: Mutex::new(None),
        record_guard_until: Mutex::new(None),
        paused: Mutex::new(false),
        mic_monitor: Mutex::new(None),
        mic_level: Arc::new(MicLevelState::new()),
        audio_backoff: AudioBackoffState::new(),
        recording_audio: Mutex::new(None),
        recording_audio_sync_running: AtomicBool::new(false),
        recording_audio_sync_pending: AtomicBool::new(false),
        mic_monitor_starting: Mutex::new(false),
        voice_sapi: Mutex::new(None),
        voice_sapi_cooldown_until: Mutex::new(None),
        voice_sapi_state: Mutex::new("stopped".into()),
        voice_sapi_last_error: Mutex::new(String::new()),
        voice_sapi_last_heard: Mutex::new(String::new()),
        voice_sapi_last_skip: Mutex::new(String::new()),
        voice_sapi_last_trigger: Mutex::new(String::new()),
        voice_vosk: Mutex::new(None),
        voice_vosk_cooldown_until: Mutex::new(None),
        voice_vosk_state: Mutex::new("stopped".into()),
        voice_vosk_last_error: Mutex::new(String::new()),
        voice_vosk_last_partial: Mutex::new(String::new()),
        voice_vosk_last_final: Mutex::new(String::new()),
        voice_vosk_last_skip: Mutex::new(String::new()),
        voice_vosk_last_trigger: Mutex::new(String::new()),
        voice_vosk_last_detected_phrase: Mutex::new(String::new()),
        voice_vosk_grammar_mode: Mutex::new(None),
        voice_vosk_model_load_time_ms: Mutex::new(None),
        voice_session_state: Mutex::new("idle".into()),
        voice_session_started_at: Mutex::new(None),
        voice_session_last_end_phrase: Mutex::new(String::new()),
        voice_session_last_action: Mutex::new(String::new()),
        voice_session_mapping_id: Mutex::new(String::new()),
        voice_session_commit_token: Mutex::new(0),
        voice_wake_last_key_at: Mutex::new(None),
        voice_vosk_probe: Mutex::new(None),
        voice_vosk_epoch: AtomicU64::new(0),
        update: Mutex::new(crate::update::UpdateUiState::new()),
        update_checking: Mutex::new(false),
        update_installing: Mutex::new(false),
        gesture: Mutex::new(press_gesture::GestureTracker::new()),
        record_gesture: Mutex::new(press_gesture::RecordGestureDetector::new()),
        process_usage_sampler: Mutex::new(resource_monitor::ProcessUsageSampler::default()),
        log_ring: Mutex::new(VecDeque::new()),
        runtime_events: onetone_logic::runtime_event::RuntimeEventRing::new(),
    });

    app_log::log_line(&app_state, "startup", "OneTone backend initialized");
    if safe_mode {
        app_log::log_line(&app_state, "startup", "safe mode enabled");
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            if let Some(state) = app.try_state::<Arc<AppState>>() {
                app_log::log_line(state.inner(), "startup", "single instance show main window");
            }
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .manage(app_state.clone())
        .setup(move |app| {
            app_log::log_line(&app_state, "startup", "setup begin");

            #[cfg(windows)]
            if !safe_mode {
                native_dll::prime_vosk_dll_search(app.handle());
                app_log::log_line(&app_state, "startup", "dll search path primed");
            }

            let Some(window) = app.get_webview_window("main") else {
                app_log::log_line(&app_state, "startup", "main window not available at setup");
                tray::setup(app.handle(), app_state.clone())?;
                app_log::log_line(&app_state, "startup", "tray initialized");
                return Ok(());
            };
            app_log::log_line(&app_state, "startup", "main window acquired");

            if let Err(err) = app_icon::apply_window_icon(&window) {
                app_log::log_line(&app_state, "startup", &format!("window icon: {err}"));
            } else {
                app_log::log_line(&app_state, "startup", "window icon set (256px)");
            }

            let _backdrop_mode = backdrop::apply_native_backdrop(&window, None);
            app_log::log_line(&app_state, "startup", "native backdrop applied");

            #[cfg(desktop)]
            {
                app.handle()
                    .plugin(tauri_plugin_updater::Builder::new().build())?;
                app_log::log_line(&app_state, "startup", "updater plugin initialized");
            }

            let mgr = hotkey_win::HotkeyManager::new();
            app_log::log_line(&app_state, "startup", "hotkey manager created");
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
            app_log::log_line(&app_state, "startup", "hotkeys bound");
            #[cfg(windows)]
            if let Some(hwnd) = main_window_hwnd(&window) {
                mgr.attach_app_window(hwnd as isize);
                keyboard::set_our_hwnd(hwnd as isize);
            }
            *app_state.hotkey_mgr.lock() = Some(mgr);
            app_log::log_line(&app_state, "startup", "hotkey manager installed");

            let state_init = app_state.clone();
            let mode_init = _backdrop_mode.clone();
            let app_init = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                tokio::time::sleep(Duration::from_millis(400)).await;
                ipc::push_mvp_init_via_app(&state_init, &app_init, &mode_init);
            });

            config::start_watcher(app_state.clone(), app.handle().clone());
            app_log::log_line(&app_state, "startup", "config watcher started");
            if !safe_mode {
                update::start_background_checks(app.handle().clone(), app_state.clone());
                app_log::log_line(&app_state, "startup", "update background check scheduled");
            } else {
                app_log::log_line(&app_state, "startup", "update background check skipped");
            }

            tray::setup(app.handle(), app_state.clone())?;
            app_log::log_line(&app_state, "startup", "tray initialized");

            let first_launch = {
                let cfg = app_state.cfg.lock();
                !cfg.window_layout_seen
            };

            let should_show = {
                let cfg = app_state.cfg.lock();
                config::should_show_main_on_startup(&cfg)
            };
            if should_show {
                app_log::log_line(&app_state, "startup", "startup policy: show main window");
                let _ = window.show();
                runtime_event::publish_runtime_event(
                    Some(app.handle()),
                    &app_state,
                    "startup",
                    runtime_event::kind::STARTUP_POLICY,
                    "startup policy: show main window",
                    Some(serde_json::json!({ "showMain": true })),
                );
            } else {
                app_log::log_line(
                    &app_state,
                    "startup",
                    "startup policy: hide main window (tray-first)",
                );
                let _ = window.hide();
                runtime_event::publish_runtime_event(
                    Some(app.handle()),
                    &app_state,
                    "startup",
                    runtime_event::kind::STARTUP_POLICY,
                    "startup policy: hide main window (tray-first)",
                    Some(serde_json::json!({ "showMain": false })),
                );
            }

            {
                let cfg = app_state.cfg.lock().clone();
                window_layout::apply_on_startup_logged(&window, &cfg, &app_state, "startup");
            }
            let win_layout = window.clone();
            let cfg_layout = app_state.cfg.lock().clone();
            let state_layout = app_state.clone();
            tauri::async_runtime::spawn(async move {
                tokio::time::sleep(Duration::from_millis(120)).await;
                window_layout::apply_on_startup_logged(&win_layout, &cfg_layout, &state_layout, "deferred");
            });

            if first_launch {
                let state_fl = app_state.clone();
                let win_fl = window.clone();
                tauri::async_runtime::spawn(async move {
                    tokio::time::sleep(Duration::from_millis(600)).await;
                    window_layout::finalize_first_launch(&state_fl, &win_fl);
                });
            }

            let window_clone = window.clone();
            let state_for_close = app_state.clone();
            window.on_window_event(move |event| {
                match event {
                    tauri::WindowEvent::CloseRequested { api, .. } => {
                        window_layout::persist_now(&state_for_close, &window_clone);
                        api.prevent_close();
                        let _ = window_clone.hide();
                        app_log::log_line(&state_for_close, "window", "main window hidden");
                    }
                    tauri::WindowEvent::Resized(_) | tauri::WindowEvent::Moved(_) => {
                        window_layout::schedule_save(state_for_close.clone(), window_clone.clone());
                    }
                    _ => {}
                }
            });

            let state2 = app_state.clone();
            let win2 = window.clone();
            let app2 = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                app_log::log_line(&state2, "startup", "runtime loop started");
                let mut last_key: Option<String> = None;
                let mut last_at: Option<std::time::Instant> = None;
                let mut last_fg_track = std::time::Instant::now();
                const DEDUP_MS: u64 = 80;
                const FG_TRACK_MS: u64 = 150;

                loop {
                    sleep(Duration::from_millis(40)).await;

                    if last_fg_track.elapsed() >= Duration::from_millis(FG_TRACK_MS) {
                        keyboard::track_foreground_for_send();
                        last_fg_track = std::time::Instant::now();
                    }
                    voice_sapi_runtime::drain_voice_sapi_events(&state2, &app2);
                    voice_vosk_runtime::drain_voice_vosk_events(&state2, &app2);
                    voice_end_runtime::maybe_timeout_dictation(&state2, &app2);

                    if crate::send_guard::is_active() {
                        continue;
                    }

                    {
                        let cfg = state2.cfg.lock();
                        let mut gesture = state2.gesture.lock();
                        gesture.expire_double_waits(std::time::Instant::now());
                        let long_fires = gesture.poll_long_press(&cfg, std::time::Instant::now());
                        drop(gesture);
                        drop(cfg);
                        for key in long_fires {
                            ipc::handle_physical_key(&state2, &win2, &key);
                        }
                    }

                    if *state2.recording.lock() {
                        let mut detector = state2.record_gesture.lock();
                        if let Some(done) = detector.poll(std::time::Instant::now()) {
                            drop(detector);
                            ipc::finish_trigger_gesture_capture(
                                &state2,
                                &win2,
                                &done.key,
                                done.device.as_deref(),
                                done.gesture,
                            );
                        }
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
                        if prev == &key_name
                            && now.duration_since(at) < Duration::from_millis(DEDUP_MS)
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
                        ipc::handle_scheme_cycle(&state2, &app2);
                        continue;
                    }

                    if let Some(mapping_id) = key_name.strip_prefix(config::SCHEME_SELECT_PREFIX) {
                        if !mapping_id.is_empty() {
                            ipc::handle_scheme_select(&state2, &app2, mapping_id);
                        }
                        continue;
                    }

                    ipc::dispatch_physical_event(&state2, &win2, &key_name);
                }
            });

            voice_bootstrap::bootstrap_voice_engines(app.handle(), &app_state, safe_mode);

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
            ipc::cmd_open_windows_speech_setup,
            ipc::cmd_process_usage,
            ipc::cmd_voice_vosk_status,
            ipc::cmd_voice_vosk_set_enabled,
            ipc::cmd_voice_vosk_set_phrases,
            ipc::cmd_voice_vosk_set_model_preset,
            ipc::cmd_voice_vosk_set_model_path,
            ipc::cmd_voice_vosk_test_send,
            ipc::cmd_voice_end_status,
            ipc::cmd_voice_end_set_enabled,
            ipc::cmd_voice_end_set_auto_send,
            ipc::cmd_voice_end_set_commit_delay,
            ipc::cmd_voice_end_set_commit_key,
            ipc::cmd_voice_end_set_phrases,
            ipc::cmd_voice_end_test_stop,
            ipc::cmd_voice_end_ui_end,
            ipc::cmd_voice_end_test_commit,
            ipc::cmd_update_check,
            ipc::cmd_update_install,
            ipc::cmd_export_logs,
            ipc::cmd_app_log,
            ipc::cmd_open_url,
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
