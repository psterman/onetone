mod agent;
mod agent_attention;
mod agent_catalog;
mod agent_model_metadata;
mod agent_usage;
mod app_chat_workflow;
mod app_exe_icon;
mod app_icon;
mod app_identity;
mod app_log;
mod audio_frame_bus;
mod audio_win;
mod backdrop;
mod camera_capability_probe;
mod claude_cli_session;
mod claude_hook_setup;
mod coach_hud;
mod codex_app_state;
mod codex_micro_overlay;
mod codex_micro_protocol_server;
mod codex_micro_vendor;
mod codex_numpad_layer;
mod codex_pad_binding_diagnose;
mod config;
mod connector_health;
mod cursor_hook_setup;
mod cursor_workflow;
mod data_root;
mod device_identity;
mod gaze_monitor;
mod gesture_timing;
mod habit_profile;
mod input_ext;
mod input_obs;
mod integration_token;
mod ipc;
mod key_chord;
mod keyboard;
mod kws_model_download;
mod native_dll;
mod pad_status;
mod policy_config;
mod press_gesture;
mod resource_monitor;
mod runtime_event;
mod scene_config;
mod send_guard;
mod soft_pad_runtime;
mod state;
mod test_pulse;
pub mod time_machine;
mod tray;
mod tray_agent_bridge;
mod tray_icon_render;
mod ui_heartbeat;
mod update;
mod vendor_hid;
pub mod voice_acoustic_command;
pub mod voice_acoustic_record;
pub mod voice_acoustic_runtime;
mod voice_bootstrap;
mod voice_command_router;
mod voice_end_runtime;
mod voice_keyword_dispatch;
mod voice_kws;
pub mod voice_kws_keywords;
#[cfg(feature = "kws-engine")]
mod voice_kws_native;
mod voice_kws_runtime;
mod voice_sapi;
mod voice_sapi_runtime;
mod voice_supervisor;
mod voice_vosk;
mod voice_vosk_runtime;
mod vosk_model_download;
mod webview_camera_permission;
mod window_layout;

#[cfg(target_os = "windows")]
mod hotkey_win;
#[cfg(target_os = "windows")]
mod xinput_win;

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

#[derive(Debug, Clone)]
pub struct AgentModifierTapState {
    pub key: String,
    pub combo_broken: bool,
}

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
    pub voice_session_snapshot: Mutex<Option<crate::scene_config::VoiceSessionSnapshot>>,
    pub last_voice_fingerprint: Mutex<Option<crate::scene_config::VoiceRuntimeFingerprint>>,
    /// Runtime fallover (desired engine failed); not persisted.
    pub voice_degraded: Mutex<bool>,
    pub voice_degraded_reason: Mutex<String>,
    pub voice_session_commit_token: Mutex<u64>,
    /// Last time a voice wake/stop shortcut was physically sent (RAlt etc.).
    pub voice_wake_last_key_at: Mutex<Option<std::time::Instant>>,
    /// Chord held down for hold-to-talk (e.g. Codex Ctrl+Shift+D).
    pub held_voice_chord: Mutex<Option<String>>,
    /// Numpad source id held for Codex Micro PTT (sc50:ext0).
    pub codex_numpad_hold_source: Mutex<Option<String>>,
    pub voice_vosk_probe: Mutex<Option<crate::voice_vosk::VoskResourceProbe>>,
    pub voice_vosk_epoch: AtomicU64,
    pub voice_kws: Mutex<Option<crate::voice_kws::VoiceKwsHandle>>,
    pub voice_kws_cooldown_until: Mutex<Option<std::time::Instant>>,
    pub voice_kws_state: Mutex<String>,
    pub voice_kws_last_error: Mutex<String>,
    pub voice_kws_last_skip: Mutex<String>,
    pub voice_kws_last_trigger: Mutex<String>,
    pub voice_kws_last_detected_phrase: Mutex<String>,
    pub voice_kws_last_detected_kind: Mutex<String>,
    pub voice_kws_last_partial: Mutex<String>,
    pub voice_kws_keyword_build: Mutex<crate::voice_kws_runtime::KwsKeywordStatusSnapshot>,
    pub voice_kws_epoch: AtomicU64,
    pub update: Mutex<crate::update::UpdateUiState>,
    pub update_checking: Mutex<bool>,
    pub update_installing: Mutex<bool>,
    pub gesture: Mutex<press_gesture::GestureTracker>,
    pub agent_modifier_tap: Mutex<Option<AgentModifierTapState>>,
    pub record_gesture: Mutex<press_gesture::RecordGestureDetector>,
    pub trigger_compat_probe: Mutex<Option<ipc::TriggerCompatProbeSession>>,
    pub trigger_verify_listen: Mutex<Option<ipc::TriggerVerifyListenSession>>,
    pub setup_interaction_active: Mutex<bool>,
    pub process_usage_sampler: Mutex<resource_monitor::ProcessUsageSampler>,
    pub log_ring: Mutex<VecDeque<String>>,
    pub runtime_events: onetone_logic::runtime_event::RuntimeEventRing,
    pub coach_hud_session_dismissed: Mutex<bool>,
    /// Shared home/HUD/tray status protocol snapshot from frontend (`statusToken`…).
    pub runtime_status_protocol: Mutex<Option<serde_json::Value>>,
    pub acoustic_voice: voice_acoustic_runtime::AcousticVoiceRuntime,
    pub audio_frame_bus: audio_frame_bus::AudioFrameBus,
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
    crate::voice_kws_runtime::voice_kws_stop(state);
    voice_acoustic_runtime::stop_acoustic_match_runtime(state);
    crate::audio_win::sync_recording_audio_policy_now(state.as_ref());
    let _ = state.hotkey_mgr.lock().take();
    *state.paused.lock() = true;
}

pub fn run() {
    app_log::ensure_writer_started();
    app_log::sync_emergency_line("startup", "process run entered");
    std::panic::set_hook(Box::new(|info| {
        // Never use async logger / multi-dir early_line from panic hook.
        app_log::panic_line(&info.to_string());
    }));
    app_log::early_line("startup", "loading config");
    ui_heartbeat::start_watchdog();
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
        voice_session_snapshot: Mutex::new(None),
        last_voice_fingerprint: Mutex::new(None),
        voice_degraded: Mutex::new(false),
        voice_degraded_reason: Mutex::new(String::new()),
        voice_session_commit_token: Mutex::new(0),
        voice_wake_last_key_at: Mutex::new(None),
        held_voice_chord: Mutex::new(None),
        codex_numpad_hold_source: Mutex::new(None),
        voice_vosk_probe: Mutex::new(None),
        voice_vosk_epoch: AtomicU64::new(0),
        voice_kws: Mutex::new(None),
        voice_kws_cooldown_until: Mutex::new(None),
        voice_kws_state: Mutex::new("stopped".into()),
        voice_kws_last_error: Mutex::new(String::new()),
        voice_kws_last_skip: Mutex::new(String::new()),
        voice_kws_last_trigger: Mutex::new(String::new()),
        voice_kws_last_detected_phrase: Mutex::new(String::new()),
        voice_kws_last_detected_kind: Mutex::new(String::new()),
        voice_kws_last_partial: Mutex::new(String::new()),
        voice_kws_keyword_build: Mutex::new(
            crate::voice_kws_runtime::KwsKeywordStatusSnapshot::default(),
        ),
        voice_kws_epoch: AtomicU64::new(0),
        update: Mutex::new(crate::update::UpdateUiState::new()),
        update_checking: Mutex::new(false),
        update_installing: Mutex::new(false),
        gesture: Mutex::new(press_gesture::GestureTracker::new()),
        agent_modifier_tap: Mutex::new(None),
        record_gesture: Mutex::new(press_gesture::RecordGestureDetector::new()),
        trigger_compat_probe: Mutex::new(None),
        trigger_verify_listen: Mutex::new(None),
        setup_interaction_active: Mutex::new(false),
        process_usage_sampler: Mutex::new(resource_monitor::ProcessUsageSampler::default()),
        log_ring: Mutex::new(VecDeque::new()),
        runtime_events: onetone_logic::runtime_event::RuntimeEventRing::new(),
        coach_hud_session_dismissed: Mutex::new(false),
        runtime_status_protocol: Mutex::new(None),
        acoustic_voice: voice_acoustic_runtime::AcousticVoiceRuntime::new(),
        audio_frame_bus: audio_frame_bus::AudioFrameBus::new(),
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
                window_layout::ensure_on_screen(&window);
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

            crate::agent_usage::start_codex_account_poll(app.handle().clone(), app_state.clone());

            {
                let state_for_attention = app_state.clone();
                crate::agent_attention::set_recompute_hook(move || {
                    let cfg = state_for_attention.cfg.lock().clone();
                    crate::soft_pad_runtime::request_soft_pad_recompute(&cfg);
                });
            }

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
            webview_camera_permission::install_camera_permission_allow(&window);
            app_log::log_line(
                &app_state,
                "startup",
                "webview camera permission hook installed",
            );

            if let Err(err) = app_icon::apply_window_icon(&window) {
                app_log::log_line(&app_state, "startup", &format!("window icon: {err}"));
            } else {
                app_log::log_line(&app_state, "startup", "window icon set (embedded ico)");
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
                mgr.bind_modifier_watches(&cfg.agent_modifier_watch_bindings());
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

            if let Err(err) = coach_hud::setup(app.handle()) {
                app_log::log_line(&app_state, "startup", &format!("coach hud setup: {err}"));
            } else {
                coach_hud::reset_session_dismissed(&app_state);
                app_log::log_line(&app_state, "startup", "coach hud initialized");
                let app_hud_init = app.handle().clone();
                let state_hud_init = app_state.clone();
                tauri::async_runtime::spawn(async move {
                    tokio::time::sleep(Duration::from_millis(900)).await;
                    coach_hud::push_state(&app_hud_init, &state_hud_init);
                });
            }

            if let Err(err) = codex_micro_overlay::setup(app.handle()) {
                app_log::log_line(
                    &app_state,
                    "startup",
                    &format!("codex micro overlay setup: {err}"),
                );
            } else {
                app_log::log_line(&app_state, "startup", "codex micro overlay initialized");
                let app_overlay_init = app.handle().clone();
                let state_overlay_init = app_state.clone();
                tauri::async_runtime::spawn(async move {
                    tokio::time::sleep(Duration::from_millis(950)).await;
                    codex_micro_overlay::push_state(&app_overlay_init, &state_overlay_init);
                });
            }

            let app_hud = app.handle().clone();
            let state_hud = app_state.clone();
            tauri::async_runtime::spawn(async move {
                loop {
                    tokio::time::sleep(Duration::from_millis(250)).await;
                    coach_hud::maybe_tick(&app_hud, &state_hud);
                    codex_micro_overlay::maybe_tick(&app_hud, &state_hud);
                }
            });

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
                window_layout::apply_on_startup_logged(
                    &win_layout,
                    &cfg_layout,
                    &state_layout,
                    "deferred",
                );
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
            window.on_window_event(move |event| match event {
                tauri::WindowEvent::CloseRequested { api, .. } => {
                    window_layout::persist_now(&state_for_close, &window_clone);
                    api.prevent_close();
                    let _ = window_clone.hide();
                    app_log::log_line(
                        &state_for_close,
                        "window",
                        "main window hidden source=close_request",
                    );
                }
                tauri::WindowEvent::Resized(_) | tauri::WindowEvent::Moved(_) => {
                    window_layout::schedule_save(state_for_close.clone(), window_clone.clone());
                }
                _ => {}
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
                    voice_kws_runtime::drain_voice_kws_events(&state2, &app2);
                    voice_end_runtime::maybe_timeout_dictation(&state2, &app2);

                    ipc::poll_trigger_compat_probe(&state2, &win2);

                    {
                        let mgr_opt = state2.hotkey_mgr.lock();
                        if let Some(mgr) = mgr_opt.as_ref() {
                            while let Some(obs) = mgr.try_recv_obs() {
                                if !ipc::note_trigger_compat_obs(&state2, &obs) {
                                    ipc::handle_input_obs_event(&state2, &app2, obs);
                                }
                            }
                        }
                    }

                    {
                        let cfg = state2.cfg.lock();
                        let mut gesture = state2.gesture.lock();
                        gesture.expire_double_waits(std::time::Instant::now());
                        let long_fires = if ipc::trigger_compat_probe_active(&state2)
                            || ipc::trigger_verify_listen_active(&state2)
                        {
                            Vec::new()
                        } else {
                            gesture.poll_long_press(&cfg, std::time::Instant::now())
                        };
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

                    if ipc::trigger_compat_probe_active(&state2) {
                        ipc::handle_trigger_compat_probe(&state2, &win2, &key_name);
                        continue;
                    }

                    if ipc::trigger_verify_listen_active(&state2) {
                        ipc::handle_trigger_verify_listen(&state2, &win2, &key_name);
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

            // Never block Tauri setup / UI thread on engine start — activate can wait on
            // acoustic sync / device policy and used to 假死 the whole window on launch.
            // Delay bootstrap so WebView2 message pump settles first; immediate Vosk
            // DLL load + model open contends with the UI thread and freezes the window.
            {
                let boot_app = app.handle().clone();
                let boot_state = Arc::clone(&app_state);
                let boot_safe = safe_mode;
                let _ = std::thread::Builder::new()
                    .name("voice-bootstrap".into())
                    .spawn(move || {
                        crate::app_log::log_line(
                            &boot_state,
                            "voice",
                            &format!(
                                "voice_bootstrap thread sleep begin delay=3000 {}",
                                crate::ui_heartbeat::ui_hb_diag()
                            ),
                        );
                        std::thread::sleep(Duration::from_secs(3));
                        crate::app_log::log_line(
                            &boot_state,
                            "voice",
                            &format!(
                                "voice_bootstrap thread wake delay=3000 {}",
                                crate::ui_heartbeat::ui_hb_diag()
                            ),
                        );
                        voice_bootstrap::bootstrap_voice_engines(&boot_app, &boot_state, boot_safe);
                    });
            }

            // Hook → status-slot host lights need 127.0.0.1:8796. Start when status lights
            // are enabled in config, or when Labs env is set (验收).
            {
                let lights_on = {
                    let cfg = app_state.cfg.lock();
                    codex_micro_overlay::status_lights_enabled(&cfg)
                };
                let labs = codex_micro_protocol_server::env_requests_autostart();
                if lights_on || labs {
                    let labs_app = app.handle().clone();
                    let labs_state = Arc::clone(&app_state);
                    let reason = if labs { "Labs" } else { "status_lights" };
                    match codex_micro_protocol_server::start(labs_app, labs_state, None) {
                        Ok(r) => app_log::log_line(
                            &app_state,
                            "codex_micro_protocol",
                            &format!("{reason} autostart ok url={}", r.url),
                        ),
                        Err(err) => app_log::log_line(
                            &app_state,
                            "codex_micro_protocol",
                            &format!("{reason} autostart failed: {err}"),
                        ),
                    }
                }
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            ipc::cmd_ready,
            ipc::cmd_save,
            ipc::cmd_save_camera_prefs,
            ipc::cmd_scheme_select,
            ipc::cmd_start_recording,
            ipc::cmd_stop_recording,
            ipc::cmd_start_trigger_compat_probe,
            ipc::cmd_stop_trigger_compat_probe,
            ipc::cmd_start_trigger_verify_listen,
            ipc::cmd_stop_trigger_verify_listen,
            ipc::cmd_pause,
            ipc::cmd_resume,
            ipc::cmd_request_runtime,
            ipc::cmd_debug_effective_scene,
            ipc::cmd_foreground_app,
            ipc::cmd_running_apps,
            ipc::cmd_app_icon,
            ipc::cmd_set_setup_interaction_active,
            ipc::cmd_capture_source,
            ipc::cmd_frontend_keydown,
            ipc::cmd_physical_trigger,
            ipc::cmd_test_send,
            ipc::cmd_agent_action_execute,
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
            ipc::cmd_tray_sync_mic,
            ipc::cmd_runtime_status_protocol,
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
            ipc::cmd_voice_set_desired_engine,
            ipc::cmd_voice_set_listening_strategy,
            ipc::cmd_voice_vosk_status,
            ipc::cmd_voice_vosk_set_enabled,
            ipc::cmd_voice_vosk_set_phrases,
            ipc::cmd_voice_vosk_set_model_preset,
            ipc::cmd_voice_vosk_set_model_path,
            ipc::cmd_voice_vosk_test_send,
            ipc::cmd_open_vosk_resources_dir,
            ipc::cmd_voice_vosk_retry_start,
            ipc::cmd_vosk_download_model,
            ipc::cmd_voice_kws_status,
            ipc::cmd_voice_kws_set_enabled,
            ipc::cmd_voice_kws_set_phrases,
            ipc::cmd_voice_kws_test_detect,
            ipc::cmd_voice_kws_test_send,
            ipc::cmd_voice_kws_retry_start,
            ipc::cmd_kws_download_model,
            ipc::cmd_voice_end_status,
            ipc::cmd_voice_end_set_enabled,
            ipc::cmd_voice_end_set_auto_send,
            ipc::cmd_voice_end_set_commit_delay,
            ipc::cmd_voice_end_set_commit_key,
            ipc::cmd_voice_end_set_phrases,
            ipc::cmd_voice_end_set_cancel_phrases,
            ipc::cmd_voice_end_set_send_phrases,
            ipc::cmd_voice_end_set_send_mode,
            ipc::cmd_voice_end_test_stop,
            ipc::cmd_voice_end_ui_end,
            ipc::cmd_voice_end_ui_cancel,
            ipc::cmd_voice_end_test_commit,
            ipc::cmd_update_check,
            ipc::cmd_update_install,
            ipc::cmd_export_logs,
            ipc::cmd_app_log,
            ipc::cmd_ui_heartbeat,
            ipc::cmd_open_url,
            ipc::cmd_open_path,
            ipc::cmd_data_root_status,
            ipc::cmd_data_root_pick,
            ipc::cmd_data_root_open,
            ipc::cmd_data_root_reset,
            ipc::cmd_probe_camera_capabilities,
            ipc::cmd_windows_hello_confirm,
            ipc::cmd_coach_hud_get_state,
            ipc::cmd_coach_hud_dismiss,
            ipc::cmd_coach_hud_set_enabled,
            ipc::cmd_gaze_list_monitors,
            ipc::cmd_gaze_get_cursor_position,
            ipc::cmd_gaze_move_cursor_to_monitor,
            ipc::cmd_gaze_is_ctrl_down,
            ipc::cmd_gaze_drag_state,
            ipc::cmd_gaze_move_window_to_monitor,
            ipc::cmd_mic_get_mute,
            ipc::cmd_mic_set_mute,
            ipc::cmd_codex_micro_overlay_get_state,
            ipc::cmd_codex_micro_protocol_inject,
            ipc::cmd_codex_micro_protocol_server_start,
            ipc::cmd_codex_micro_protocol_server_stop,
            ipc::cmd_codex_micro_protocol_server_status,
            ipc::cmd_codex_micro_overlay_dismiss,
            ipc::cmd_codex_micro_overlay_start_drag,
            ipc::cmd_codex_micro_overlay_snap_position,
            ipc::cmd_codex_micro_overlay_set_minimized,
            ipc::cmd_codex_micro_overlay_toggle_master,
            ipc::cmd_codex_micro_overlay_toggle_num_mode,
            ipc::cmd_codex_micro_overlay_toggle_pad_mode,
            ipc::cmd_codex_micro_overlay_toggle_joy_panel,
            ipc::cmd_soft_pad_focus_agent,
            ipc::cmd_codex_micro_pad_fire,
            ipc::cmd_soft_pad_runtime_snapshot,
            ipc::cmd_soft_pad_set_follow,
            ipc::cmd_tm_status,
            ipc::cmd_tm_set_workspace,
            ipc::cmd_tm_set_autosave,
            ipc::cmd_tm_pick_workspace,
            ipc::cmd_tm_list,
            ipc::cmd_tm_create,
            ipc::cmd_tm_preview_restore,
            ipc::cmd_tm_restore,
            ipc::cmd_tm_diff_summary,
            ipc::cmd_tm_undo_restore,
            ipc::cmd_agent_attention_snapshot,
            ipc::cmd_cursor_soft_pad_capabilities,
            ipc::cmd_cursor_set_needs_input_gate,
            ipc::cmd_cursor_hook_ingest,
            ipc::cmd_cursor_hook_setup_status,
            ipc::cmd_onetone_attention_ask,
            ipc::cmd_onetone_attention_clear,
            ipc::cmd_codex_micro_pad_set_flags,
            ipc::cmd_codex_micro_pad_set_layout,
            ipc::cmd_codex_micro_pad_set_presentation,
            ipc::cmd_codex_micro_pad_set_skin,
            ipc::cmd_codex_micro_pad_ensure_ready,
            ipc::cmd_codex_micro_pad_get_readiness,
            ipc::cmd_codex_status_lights_set,
            ipc::cmd_codex_hook_setup_status,
            ipc::cmd_pad_status_diagnose,
            ipc::cmd_claude_activity_inject,
            ipc::cmd_claude_activity_clear,
            ipc::cmd_claude_hook_setup_status,
            ipc::cmd_claude_hook_install_confirm,
            ipc::cmd_claude_hook_uninstall_onetone,
            ipc::cmd_claude_cli_inject_pref_set,
            ipc::cmd_claude_cli_inject,
            ipc::cmd_claude_cli_decide,
            ipc::cmd_codex_pad_binding_diagnose,
            ipc::cmd_codex_pad_binding_heal,
            ipc::cmd_acoustic_voice_command_status,
            ipc::cmd_acoustic_voice_command_preflight,
            ipc::cmd_acoustic_voice_command_set_suspend,
            ipc::cmd_acoustic_voice_command_record_once,
            ipc::cmd_acoustic_voice_command_record_start,
            ipc::cmd_acoustic_voice_command_record_stop,
            ipc::cmd_acoustic_voice_command_record_cancel,
            ipc::cmd_acoustic_voice_command_build_from_samples,
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
