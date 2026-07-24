use std::sync::Arc;

use tauri::{AppHandle, State};

use crate::codex_micro_overlay;
use crate::codex_numpad_layer;
use crate::config;
use crate::AppState;

/// Patch pad enable / NumLock / overlay flags only — never full `cmd_save`.
/// Full save payload rebuild used to 假死 the keys panel on every checkbox click.
#[tauri::command]
pub fn cmd_codex_micro_pad_set_flags(
    app: AppHandle,
    state: State<'_, Arc<AppState>>,
    mapping_id: String,
    enabled: bool,
    require_num_lock_off: bool,
    overlay_enabled: bool,
) -> Result<(), String> {
    let mapping_id = mapping_id.trim().to_string();
    if mapping_id.is_empty() {
        return Err("mapping_id_empty".into());
    }

    let cfg_to_save;
    {
        let mut cfg = state.cfg.lock();
        let Some(mapping) = cfg.mappings.iter_mut().find(|m| m.id == mapping_id) else {
            return Err("mapping_not_found".into());
        };
        let pad = mapping
            .codex_micro_pad
            .get_or_insert_with(codex_numpad_layer::default_codex_micro_pad);
        pad.enabled = enabled;
        pad.require_num_lock_off = require_num_lock_off;
        pad.overlay_enabled = overlay_enabled;
        codex_numpad_layer::sync_hook_cache(&cfg);
        cfg_to_save = cfg.clone();
    }

    crate::app_log::log_line(
        state.inner(),
        "config",
        "cmd_codex_micro_pad_set_flags quiet (skip mvp_init/voice)",
    );

    let state_bg = Arc::clone(state.inner());
    let _ = std::thread::Builder::new()
        .name("codex-micro-pad-flags".into())
        .spawn(move || {
            // Disk write off the IPC hot path — rapid toggles used to stall the UI.
            config::save_config(&cfg_to_save);
            codex_micro_overlay::push_state(&app, &state_bg);
        });
    Ok(())
}

/// Quiet-save Soft Pad layout profile / enhance / key routes — never full `cmd_save`.
/// Profile switches used to rebuild the whole settings payload and 假死 the Soft Pad UI.
#[tauri::command]
pub fn cmd_codex_micro_pad_set_layout(
    app: AppHandle,
    state: State<'_, Arc<AppState>>,
    mapping_id: String,
    layout_profile: String,
    software_enhance_enabled: bool,
    keys: Vec<config::CodexMicroPadKeyRoute>,
) -> Result<(), String> {
    let mapping_id = mapping_id.trim().to_string();
    if mapping_id.is_empty() {
        return Err("mapping_id_empty".into());
    }
    let mut profile = layout_profile.trim().to_string();
    if profile.is_empty() {
        profile = "standard".into();
    }
    if !matches!(
        profile.as_str(),
        "beginner" | "standard" | "advanced" | "custom"
    ) {
        profile = "standard".into();
    }
    // Enhance only applies to advanced; keep BE consistent with FE applyLayoutProfile.
    let enhance = software_enhance_enabled && profile == "advanced";

    let cfg_to_save;
    {
        let mut cfg = state.cfg.lock();
        let Some(mapping) = cfg.mappings.iter_mut().find(|m| m.id == mapping_id) else {
            return Err("mapping_not_found".into());
        };
        let pad = mapping
            .codex_micro_pad
            .get_or_insert_with(codex_numpad_layer::default_codex_micro_pad);
        pad.layout_profile = profile;
        pad.software_enhance_enabled = enhance;
        if !keys.is_empty() {
            pad.keys = keys;
        }
        codex_numpad_layer::sync_hook_cache(&cfg);
        cfg_to_save = cfg.clone();
    }

    crate::app_log::log_line(
        state.inner(),
        "config",
        "cmd_codex_micro_pad_set_layout quiet (skip mvp_init/voice)",
    );

    let state_bg = Arc::clone(state.inner());
    let _ = std::thread::Builder::new()
        .name("codex-micro-pad-layout".into())
        .spawn(move || {
            config::save_config(&cfg_to_save);
            codex_micro_overlay::push_state(&app, &state_bg);
        });
    Ok(())
}

/// Quiet-save Soft Pad presentation (`full` | `mini`) and sync overlay minimized.
#[tauri::command]
pub fn cmd_codex_micro_pad_set_presentation(
    app: AppHandle,
    state: State<'_, Arc<AppState>>,
    mapping_id: String,
    presentation: String,
) -> Result<(), String> {
    let mapping_id = mapping_id.trim().to_string();
    if mapping_id.is_empty() {
        return Err("mapping_id_empty".into());
    }
    let presentation = codex_micro_overlay::normalize_presentation(&presentation).to_string();
    let minimized = presentation == "mini";

    let cfg_to_save;
    {
        let mut cfg = state.cfg.lock();
        let Some(mapping) = cfg.mappings.iter_mut().find(|m| m.id == mapping_id) else {
            return Err("mapping_not_found".into());
        };
        let pad = mapping
            .codex_micro_pad
            .get_or_insert_with(codex_numpad_layer::default_codex_micro_pad);
        pad.presentation = presentation;
        codex_numpad_layer::sync_hook_cache(&cfg);
        cfg_to_save = cfg.clone();
    }
    codex_micro_overlay::set_overlay_minimized(minimized);

    let state_bg = Arc::clone(state.inner());
    let _ = std::thread::Builder::new()
        .name("codex-micro-pad-presentation".into())
        .spawn(move || {
            config::save_config(&cfg_to_save);
            codex_micro_overlay::push_state(&app, &state_bg);
        });
    Ok(())
}
