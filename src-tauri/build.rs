use std::fs;
use std::io::BufWriter;
use std::path::{Path, PathBuf};

use image::{ImageEncoder, Rgba, RgbaImage};

const VOSK_RUNTIME_DLLS: &[&str] = &[
    "libvosk.dll",
    "libgcc_s_seh-1.dll",
    "libstdc++-6.dll",
    "libwinpthread-1.dll",
];

fn main() {
    ensure_icons_exist();
    #[cfg(windows)]
    embed_common_controls_manifest();
    for name in [
        "icons/icon.ico",
        "icons/icon.png",
        "icons/tray-16.png",
        "icons/tray-32.png",
        "icons/32x32.png",
    ] {
        println!("cargo:rerun-if-changed={name}");
    }
    // Gate on feature so `cargo test --lib --no-default-features` does not hard-link
    // MinGW libvosk into the harness (STATUS_ENTRYPOINT_NOT_FOUND on Windows).
    if std::env::var_os("CARGO_FEATURE_VOSK_ENGINE").is_some() {
        link_vosk_if_present();
    } else {
        println!("cargo:rustc-cfg=vosk_disabled");
    }

    const COMMANDS: &[&str] = &[
        "cmd_ready",
        "cmd_save",
        "cmd_save_camera_prefs",
        "cmd_scheme_select",
        "cmd_start_recording",
        "cmd_stop_recording",
        "cmd_start_trigger_compat_probe",
        "cmd_stop_trigger_compat_probe",
        "cmd_start_trigger_verify_listen",
        "cmd_stop_trigger_verify_listen",
        "cmd_pause",
        "cmd_resume",
        "cmd_request_runtime",
        "cmd_debug_effective_scene",
        "cmd_foreground_app",
        "cmd_habit_foreground_app",
        "cmd_foreground_context_snapshot",
        "cmd_running_apps",
        "cmd_app_icon",
        "cmd_set_settings_drawer_open",
        "cmd_set_setup_interaction_active",
        "cmd_voice_set_practice_hold_fg",
        "cmd_voice_practice_activate_ime",
        "cmd_voice_wake_phrase_test_begin",
        "cmd_voice_wake_phrase_test_end",
        "cmd_capture_source",
        "cmd_frontend_keydown",
        "cmd_physical_trigger",
        "cmd_test_send",
        "cmd_mapping_toggle",
        "cmd_mapping_delete",
        "cmd_mapping_duplicate",
        "cmd_mapping_reorder",
        "cmd_mapping_set_group",
        "cmd_mapping_set_source_key",
        "cmd_mapping_conflicts",
        "cmd_reload_latest",
        "cmd_update_check",
        "cmd_update_install",
        "cmd_window_minimize",
        "cmd_window_close",
        "cmd_window_set_always_on_top",
        "cmd_sync_theme_backdrop",
        "cmd_tray_menu_ready",
        "cmd_tray_os_context",
        "cmd_tray_bootstrap",
        "cmd_tray_usage_summary",
        "cmd_tray_subscribe_segment",
        "cmd_tray_action",
        "cmd_tray_menu_present",
        "cmd_tray_menu_reveal",
        "cmd_tray_sync_mic",
        "cmd_tray_refresh_segments",
        "cmd_tray_customization_get",
        "cmd_tray_customization_save",
        "cmd_tray_runtime_get",
        "cmd_tray_runtime_save",
        "cmd_autostart_get",
        "cmd_autostart_set",
        "cmd_mic_list",
        "cmd_mic_set_default",
        "cmd_mic_monitor_start",
        "cmd_mic_monitor_stop",
        "cmd_mic_get_level",
        "cmd_process_usage",
        "cmd_voice_sapi_status",
        "cmd_voice_sapi_set_enabled",
        "cmd_voice_sapi_set_phrases",
        "cmd_voice_sapi_set_min_confidence",
        "cmd_voice_sapi_test_send",
        "cmd_open_windows_speech_setup",
        "cmd_voice_set_desired_engine",
        "cmd_voice_set_listening_strategy",
        "cmd_voice_vosk_status",
        "cmd_voice_vosk_set_enabled",
        "cmd_voice_vosk_set_phrases",
        "cmd_voice_vosk_set_model_preset",
        "cmd_voice_vosk_set_model_path",
        "cmd_voice_vosk_test_send",
        "cmd_open_vosk_resources_dir",
        "cmd_voice_vosk_retry_start",
        "cmd_vosk_download_model",
        "cmd_voice_kws_status",
        "cmd_voice_kws_set_enabled",
        "cmd_voice_kws_set_phrases",
        "cmd_voice_kws_test_detect",
        "cmd_voice_kws_test_send",
        "cmd_voice_kws_retry_start",
        "cmd_kws_download_model",
        "cmd_voice_end_status",
        "cmd_voice_end_set_enabled",
        "cmd_voice_end_set_auto_send",
        "cmd_voice_end_set_commit_delay",
        "cmd_voice_end_set_commit_key",
        "cmd_voice_end_set_phrases",
        "cmd_voice_end_set_cancel_phrases",
        "cmd_voice_end_set_send_phrases",
        "cmd_voice_end_set_send_mode",
        "cmd_voice_end_test_stop",
        "cmd_voice_end_ui_end",
        "cmd_voice_end_ui_cancel",
        "cmd_voice_end_test_commit",
        "cmd_export_logs",
        "cmd_app_log",
        "cmd_ui_heartbeat",
        "cmd_ui_hb_snapshot",
        "cmd_open_url",
        "cmd_open_path",
        "cmd_pick_path",
        "cmd_list_browser_bookmarks",
        "cmd_data_root_status",
        "cmd_data_root_pick",
        "cmd_data_root_open",
        "cmd_data_root_reset",
        "cmd_coach_hud_get_state",
        "cmd_coach_hud_dismiss",
        "cmd_coach_hud_set_enabled",
        "cmd_coach_hud_flash_success",
        "cmd_gaze_list_monitors",
        "cmd_gaze_get_cursor_position",
        "cmd_gaze_move_cursor_to_monitor",
        "cmd_gaze_is_ctrl_down",
        "cmd_gaze_drag_state",
        "cmd_gaze_move_window_to_monitor",
        "cmd_workspace_list_windows",
        "cmd_workspace_list_layouts",
        "cmd_workspace_snapshot",
        "cmd_workspace_save",
        "cmd_workspace_apply",
        "cmd_workspace_apply_current_anchor",
        "cmd_workspace_delete",
        "cmd_workspace_set_auto_apply",
        "cmd_mic_get_mute",
        "cmd_mic_set_mute",
        "cmd_codex_micro_overlay_get_state",
        "cmd_codex_micro_protocol_inject",
        "cmd_codex_micro_protocol_server_start",
        "cmd_codex_micro_protocol_server_stop",
        "cmd_codex_micro_protocol_server_status",
        "cmd_codex_micro_overlay_dismiss",
        "cmd_codex_micro_overlay_start_drag",
        "cmd_codex_micro_overlay_snap_position",
        "cmd_codex_micro_overlay_set_minimized",
        "cmd_codex_micro_overlay_fit_content",
        "cmd_codex_micro_overlay_toggle_master",
        "cmd_codex_micro_overlay_toggle_num_mode",
        "cmd_codex_micro_overlay_toggle_pad_mode",
        "cmd_codex_micro_overlay_toggle_joy_panel",
        "cmd_soft_pad_focus_agent",
        "cmd_soft_pad_focus_session",
        "cmd_soft_pad_status_host_gate",
        "cmd_pad_status_clear_errors",
        "cmd_codex_hook_install_confirm",
        "cmd_soft_pad_runtime_snapshot",
        "cmd_soft_pad_set_follow",
        "cmd_soft_pad_lane_page",
        "cmd_soft_pad_set_purpose",
        "cmd_soft_pad_set_navigation_slots",
        "cmd_soft_pad_agent_lights_set",
        "cmd_soft_pad_agent_lights_batch_set",
        "cmd_agent_install_inventory",
        "cmd_agent_attention_snapshot",
        "cmd_semantic_action_catalog",
        "cmd_semantic_action_route",
        "cmd_semantic_action_options",
        "cmd_action_history_list",
        "cmd_action_history_record",
        "cmd_action_history_clear",
        "cmd_action_history_stats",
        "cmd_action_history_analyze_summary",
        "cmd_action_history_analyze_optimization",
        "cmd_action_history_analyze_chat",
        "cmd_semantic_pending_snapshot",
        "cmd_semantic_confirmation_cancel",
        "cmd_action_binding_views",
        "cmd_needs_input_kind",
        "cmd_soft_pad_resume_lane",
        "cmd_soft_pad_inject_lane",
        "cmd_codex_micro_pad_fire",
        "cmd_codex_micro_pad_set_flags",
        "cmd_codex_micro_pad_set_layout",
        "cmd_soft_pad_pin_mapping",
        "cmd_soft_pad_force_open",
        "cmd_soft_pad_open_shell_hook",
        "cmd_codex_micro_pad_ensure_ready",
        "cmd_codex_micro_pad_get_readiness",
        "cmd_codex_status_lights_set",
        "cmd_codex_hook_setup_status",
        "cmd_pad_status_diagnose",
        "cmd_claude_activity_inject",
        "cmd_claude_activity_clear",
        "cmd_cursor_hook_setup_status",
        "cmd_claude_hook_setup_status",
        "cmd_claude_hook_install_confirm",
        "cmd_claude_hook_uninstall_onetone",
        "cmd_shell_agent_hook_setup_status",
        "cmd_shell_agent_hook_install_confirm",
        "cmd_shell_agent_hook_uninstall",
        "cmd_claude_cli_inject_pref_set",
        "cmd_cursor_activity_pref_get",
        "cmd_cursor_activity_pref_set",
        "cmd_agent_home_snapshot",
        "cmd_agent_session_events",
        "cmd_agent_lifecycle_event",
        "cmd_agent_checkpoint_resume",
        "cmd_agent_checkpoint_create",
        "cmd_agent_memory_query",
        "cmd_agent_memory_upsert",
        "cmd_agent_context_for_provider",
        "cmd_agent_mcp_project_context",
        "cmd_agent_mcp_memory_search",
        "cmd_agent_mcp_session_history",
        "cmd_agent_mcp_checkpoint_preview",
        "cmd_home_focus_snapshot",
        "cmd_home_focus_retry",
        "cmd_home_confirm_project",
        "cmd_home_list_known_projects",
        "cmd_minimax_coding_key_get",
        "cmd_minimax_coding_key_set",
        "cmd_claude_cli_inject",
        "cmd_claude_cli_decide",
        "cmd_codex_pad_binding_diagnose",
        "cmd_codex_pad_binding_heal",
        "cmd_acoustic_voice_command_status",
        "cmd_acoustic_voice_command_preflight",
        "cmd_acoustic_voice_command_set_suspend",
        "cmd_acoustic_voice_command_record_once",
        "cmd_acoustic_voice_command_record_start",
        "cmd_acoustic_voice_command_record_stop",
        "cmd_acoustic_voice_command_record_cancel",
        "cmd_acoustic_voice_command_build_from_samples",
    ];

    // Frontend lives in ../src; force re-embed when voice strategy UI changes.
    println!("cargo:rerun-if-changed=../src/js/features/voice/voice-wake.js");
    println!("cargo:rerun-if-changed=../src/js/features/voice/voice-ui-bindings.js");
    println!("cargo:rerun-if-changed=../src/js/features/voice/voice-intent-rail.js");
    println!("cargo:rerun-if-changed=../src/js/features/mapping/keys-scene-actions-panel.js");
    println!("cargo:rerun-if-changed=../src/js/features/mapping/keys-channel-command-picker.js");
    println!("cargo:rerun-if-changed=../src/js/core/config-persist.js");
    println!("cargo:rerun-if-changed=../src/index.html");
    println!("cargo:rerun-if-changed=../src/css/voice-page-shell.css");
    println!("cargo:rerun-if-changed=../src/codex-micro-overlay.html");
    println!("cargo:rerun-if-changed=../src/css/codex-micro-overlay.css");
    println!("cargo:rerun-if-changed=../src/css/motion.css");
    println!("cargo:rerun-if-changed=../src/js/core/motion.js");
    println!("cargo:rerun-if-changed=../src/js/core/agent-status-edge.js");
    println!("cargo:rerun-if-changed=../src/js/core/panel-reveal.js");

    // When vosk-engine is off (cargo test --no-default-features), strip Vosk DLL
    // bundle resources so tauri-build does not overwrite DLLs locked by a running
    // onetone.exe in target/debug (os error 32). Models/scripts stay.
    let vosk_on = std::env::var_os("CARGO_FEATURE_VOSK_ENGINE").is_some();
    if !vosk_on {
        strip_vosk_dll_bundle_resources();
    }

    let attrs = tauri_build::Attributes::new()
        // We embed Common Controls v6 ourselves via compile_for_everything so the
        // `cargo test --lib` harness also gets it. Tauri's default bin-only embed
        // would duplicate RT_MANIFEST id 1 under rust-lld.
        .windows_attributes(tauri_build::WindowsAttributes::new_without_app_manifest())
        .app_manifest(tauri_build::AppManifest::new().commands(COMMANDS));

    match tauri_build::try_build(attrs) {
        Ok(()) => {}
        Err(e) if is_sharing_violation(&e) => {
            println!(
                "cargo:warning=tauri-build hit file lock ({e}); retrying without Vosk DLL resources"
            );
            strip_vosk_dll_bundle_resources();
            tauri_build::try_build(
                tauri_build::Attributes::new()
                    .windows_attributes(
                        tauri_build::WindowsAttributes::new_without_app_manifest(),
                    )
                    .app_manifest(tauri_build::AppManifest::new().commands(COMMANDS)),
            )
            .expect("failed to run tauri build after stripping locked Vosk DLLs");
        }
        Err(e) => panic!("failed to run tauri build: {e}"),
    }
}

const VOSK_BUNDLE_DLL_KEYS: &[&str] = &[
    "resources/vosk/libvosk.dll",
    "resources/vosk/libgcc_s_seh-1.dll",
    "resources/vosk/libstdc++-6.dll",
    "resources/vosk/libwinpthread-1.dll",
];

/// Redirect Vosk DLL bundle outputs away from exe-dir names that a running
/// `onetone.exe` may hold open (os error 32). TAURI_CONFIG is deep-merged, so we
/// override destinations instead of trying to delete keys.
fn strip_vosk_dll_bundle_resources() {
    let mut resources = serde_json::Map::new();
    for key in VOSK_BUNDLE_DLL_KEYS {
        let name = key.rsplit('/').next().unwrap_or(key);
        resources.insert(
            (*key).into(),
            serde_json::Value::String(format!(".__onetone_build_skip/{name}")),
        );
    }
    let patch = serde_json::json!({ "bundle": { "resources": resources } });
    std::env::set_var("TAURI_CONFIG", patch.to_string());
    println!(
        "cargo:warning=TAURI_CONFIG: redirected Vosk DLL bundle outputs to .__onetone_build_skip/"
    );
}

fn is_sharing_violation(err: &dyn std::fmt::Display) -> bool {
    let s = err.to_string();
    s.contains("os error 32") || s.contains("正在使用") || s.contains("Sharing violation")
}

/// RT_MANIFEST is type 24; the loader only ever reads **id 1**, so the
/// generated .rc must use it. See `embed_test_manifest`.
#[cfg(windows)]
const RESOURCE_ID: u32 = 1;

/// Embed a Common Controls v6 manifest into **all** linkable artifacts.
///
/// `tauri-build`'s default Windows app manifest is bin-only (`rustc-link-arg-bins`).
/// The `cargo test --lib` harness is a library `--test` binary and never receives
/// that flag — without CC v6 it dies before `main()` with STATUS_ENTRYPOINT_NOT_FOUND
/// (0xc0000139) when resolving `TaskDialogIndirect` from muda/comctl32.
///
/// `compile_for_everything` uses unsuffixed `cargo:rustc-link-arg`, which reaches
/// the lib unit-test harness. Pair with `WindowsAttributes::new_without_app_manifest`
/// so `onetone.exe` does not get a second RT_MANIFEST id 1.
#[cfg(windows)]
fn embed_common_controls_manifest() {
    use std::io::Write;

    let manifest_dir = PathBuf::from(std::env::var("CARGO_MANIFEST_DIR").unwrap());
    let manifest = manifest_dir.join("windows/common-controls-v6.manifest");
    if !manifest.is_file() {
        println!(
            "cargo:warning=CommonControls: {} missing — test harness will not load on Windows",
            manifest.display()
        );
        return;
    }
    println!("cargo:rerun-if-changed=windows/common-controls-v6.manifest");

    let out_dir = PathBuf::from(std::env::var("OUT_DIR").unwrap());
    // rc.exe resolves a file token against the process CWD, not the script's
    // directory, so bake the absolute path into a generated .rc.
    let rc = out_dir.join("common-controls-v6.rc");
    let mut script = fs::File::create(&rc).expect("create rc script");
    writeln!(script, "{RESOURCE_ID} 24 \"{}\"", manifest.display().to_string().replace('\\', "/"))
        .expect("write rc script");
    drop(script);

    if let Err(e) =
        embed_resource::compile_for_everything(&rc, embed_resource::NONE).manifest_optional()
    {
        println!("cargo:warning=CommonControls: manifest not embedded: {e}");
    }
}

fn link_vosk_if_present() {
    println!("cargo::rustc-check-cfg=cfg(vosk_disabled)");
    let vosk_engine = std::env::var("CARGO_FEATURE_VOSK_ENGINE").is_ok();
    if !vosk_engine {
        println!("cargo:rustc-cfg=vosk_disabled");
        return;
    }
    let manifest_dir = PathBuf::from(std::env::var("CARGO_MANIFEST_DIR").unwrap());
    let vosk_dir = manifest_dir.join("resources/vosk");
    let lib = vosk_dir.join("libvosk.lib");
    if lib.exists() {
        println!("cargo:rustc-link-search=native={}", vosk_dir.display());
        println!("cargo:rustc-link-lib=dylib=libvosk");
        // Installed NSIS builds also copy DLLs beside onetone.exe for early Windows loading.
        // Delay-load so startup succeeds; native_dll::prime_vosk_dll_search sets the path first.
        println!("cargo:rustc-link-arg=/DELAYLOAD:libvosk.dll");
        println!("cargo:rustc-link-lib=delayimp");
        copy_vosk_runtime_dlls(&vosk_dir, &manifest_dir);
    } else {
        println!(
            "cargo:warning=Vosk: libvosk.lib not found at {} — place libvosk.lib + libvosk.dll there to enable offline voice",
            lib.display()
        );
        println!("cargo:rustc-cfg=vosk_disabled");
    }
}

/// Windows loads link-time DLL dependencies from the exe directory before main().
/// Copy Vosk + MinGW runtime DLLs next to onetone.exe (target/debug|release) **and**
/// into `resources/vosk/` (same layout as models / resolve_vosk_dll_dir candidates).
/// Do not copy into deps/ — test harness binaries live there and must not pick up MinGW DLLs.
fn copy_vosk_runtime_dlls(vosk_dir: &Path, manifest_dir: &Path) {
    let dll_src = vosk_dir.join("libvosk.dll");
    if !dll_src.is_file() {
        println!(
            "cargo:warning=Vosk: libvosk.dll not found at {} — runtime copy skipped",
            dll_src.display()
        );
        return;
    }

    for name in VOSK_RUNTIME_DLLS {
        println!("cargo:rerun-if-changed=resources/vosk/{name}");
    }

    let profile = std::env::var("PROFILE").unwrap_or_else(|_| "debug".into());
    let target_dir = std::env::var("CARGO_TARGET_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|_| manifest_dir.join("target"));
    let exe_dir = target_dir.join(&profile);
    let resource_vosk_dir = exe_dir.join("resources").join("vosk");

    let mut copied = 0usize;
    let dest_dirs = [exe_dir.clone(), resource_vosk_dir];
    for dest_dir in &dest_dirs {
        if fs::create_dir_all(dest_dir).is_err() {
            continue;
        }
        for name in VOSK_RUNTIME_DLLS {
            let src = vosk_dir.join(name);
            if !src.is_file() {
                continue;
            }
            let dst = dest_dir.join(name);
            match fs::copy(&src, &dst) {
                Ok(_) => copied += 1,
                Err(e) => {
                    println!(
                        "cargo:warning=Vosk: failed to copy {name} -> {}: {e}",
                        dst.display()
                    );
                }
            }
        }
    }

    if copied > 0 {
        println!(
            "cargo:warning=Vosk: copied {copied} runtime DLL slot(s) under {}",
            exe_dir.display()
        );
    }
}

fn ensure_icons_exist() {
    let png_path = Path::new("icons/icon.png");
    let ico_path = Path::new("icons/icon.ico");
    if png_path.exists() && ico_path.exists() {
        return;
    }

    // Generate placeholder icons only when the bundled onetone assets are missing.
    let mut img = RgbaImage::new(32, 32);
    for (_, _, pixel) in img.enumerate_pixels_mut() {
        *pixel = Rgba([0x00, 0x7A, 0xFF, 0xFF]); // iOS blue
    }

    fs::create_dir_all("icons").ok();
    if !png_path.exists() {
        img.save(png_path).expect("failed to save icon PNG");
    }

    if !ico_path.exists() {
        let file = fs::File::create(ico_path).expect("failed to create icon.ico");
        let writer = BufWriter::new(file);
        let ico = image::codecs::ico::IcoEncoder::new(writer);
        ico.write_image(img.as_raw(), 32, 32, image::ExtendedColorType::Rgba8)
            .expect("failed to encode ICO");
    }
}
