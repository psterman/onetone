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
    link_vosk_if_present();

    const COMMANDS: &[&str] = &[
        "cmd_ready",
        "cmd_save",
        "cmd_scheme_select",
        "cmd_start_recording",
        "cmd_stop_recording",
        "cmd_start_trigger_compat_probe",
        "cmd_stop_trigger_compat_probe",
        "cmd_pause",
        "cmd_resume",
        "cmd_request_runtime",
        "cmd_debug_effective_scene",
        "cmd_foreground_app",
        "cmd_running_apps",
        "cmd_app_icon",
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
        "cmd_sync_theme_backdrop",
        "cmd_tray_menu_ready",
        "cmd_tray_action",
        "cmd_tray_menu_present",
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
        "cmd_voice_end_test_stop",
        "cmd_voice_end_ui_end",
        "cmd_voice_end_ui_cancel",
        "cmd_voice_end_test_commit",
        "cmd_export_logs",
        "cmd_app_log",
        "cmd_open_url",
        "cmd_coach_hud_get_state",
        "cmd_coach_hud_dismiss",
        "cmd_coach_hud_set_enabled",
        "cmd_acoustic_voice_command_status",
        "cmd_acoustic_voice_command_preflight",
        "cmd_acoustic_voice_command_set_suspend",
        "cmd_acoustic_voice_command_record_once",
        "cmd_acoustic_voice_command_record_start",
        "cmd_acoustic_voice_command_record_stop",
        "cmd_acoustic_voice_command_record_cancel",
        "cmd_acoustic_voice_command_build_from_samples",
    ];

    tauri_build::try_build(
        tauri_build::Attributes::new()
            .app_manifest(tauri_build::AppManifest::new().commands(COMMANDS)),
    )
    .expect("failed to run tauri build");
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
/// Copy Vosk + MinGW runtime DLLs next to onetone.exe (target/debug|release) only.
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

    let mut copied = 0usize;
    if fs::create_dir_all(&exe_dir).is_ok() {
        for name in VOSK_RUNTIME_DLLS {
            let src = vosk_dir.join(name);
            if !src.is_file() {
                continue;
            }
            let dst = exe_dir.join(name);
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
            "cargo:warning=Vosk: copied {copied} runtime DLL(s) to {}",
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
