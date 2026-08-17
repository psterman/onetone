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
    require_foreground: Option<bool>,
    nav_keys_enabled: Option<bool>,
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
        if let Some(rf) = require_foreground {
            pad.require_foreground = rf;
        }
        // Do not reset require_num_lock_off / nav_keys_enabled when toggling enabled.
        if let Some(nav) = nav_keys_enabled {
            pad.nav_keys_enabled = nav;
        }
        // Settings chose "不显示浮窗" — clear session dismiss so flags are authoritative.
        if !overlay_enabled {
            codex_micro_overlay::clear_overlay_session_dismissed();
        }
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
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CodexMicroPadSetLayoutResult {
    pub mapping_id: String,
    pub codex_micro_pad: Option<config::CodexMicroPadConfig>,
    pub agent_bindings: Vec<config::AgentBinding>,
}

#[tauri::command]
pub fn cmd_codex_micro_pad_set_layout(
    app: AppHandle,
    state: State<'_, Arc<AppState>>,
    mapping_id: String,
    layout_profile: String,
    software_enhance_enabled: bool,
    keys: Vec<config::CodexMicroPadKeyRoute>,
    agent_bindings: Option<Vec<config::AgentBinding>>,
) -> Result<CodexMicroPadSetLayoutResult, String> {
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
    // Enhance is independent of layout profile (hub no longer gates on "advanced").
    let enhance = software_enhance_enabled;

    let cfg_to_save;
    let pin_kind;
    let result;
    {
        let mut cfg = state.cfg.lock();
        let Some(idx) = cfg.mappings.iter().position(|m| m.id == mapping_id) else {
            return Err("mapping_not_found".into());
        };
        pin_kind =
            crate::soft_pad_runtime::AgentKind::from_app_target(cfg.mappings[idx].app_target_id.trim());
        {
            let mapping = &mut cfg.mappings[idx];
            let pad = mapping
                .codex_micro_pad
                .get_or_insert_with(codex_numpad_layer::default_codex_micro_pad);
            pad.layout_profile = profile;
            pad.software_enhance_enabled = enhance;
            // Upsert keys by microKeyId — never wipe routes missing from a partial FE list.
            for incoming in keys {
                let mid = incoming.micro_key_id.trim().to_string();
                if mid.is_empty() {
                    continue;
                }
                if let Some(existing) = pad.keys.iter_mut().find(|k| k.micro_key_id.trim() == mid) {
                    *existing = incoming;
                } else {
                    pad.keys.push(incoming);
                }
            }
            // Quiet-save agentBindings with keycap edits so Plan/etc. chords survive Soft Pad open.
            // Upsert only — never replace the whole vector (FE may send a partial list).
            if let Some(bindings) = agent_bindings {
                for incoming in bindings {
                    let slot = incoming.slot_id.trim().to_string();
                    let tt = incoming.trigger_type.trim().to_string();
                    if slot.is_empty() || tt.is_empty() {
                        continue;
                    }
                    if let Some(existing) = mapping.agent_bindings.iter_mut().find(|b| {
                        b.slot_id.trim() == slot && b.trigger_type.eq_ignore_ascii_case(&tt)
                    }) {
                        *existing = incoming;
                    } else {
                        mapping.agent_bindings.push(incoming);
                    }
                }
            }
            if mapping.app_target_id.trim() == crate::app_chat_workflow::CURSOR_APP_TARGET_ID {
                let _ = codex_numpad_layer::heal_cursor_pad_for_save(mapping, "zh-CN");
                // Keybindings disk IO runs after cfg lock (below) — never while holding it.
            }
            result = CodexMicroPadSetLayoutResult {
                mapping_id: mapping.id.clone(),
                codex_micro_pad: mapping.codex_micro_pad.clone(),
                agent_bindings: mapping.agent_bindings.clone(),
            };
        }
        codex_numpad_layer::sync_hook_cache(&cfg);
        cfg_to_save = cfg.clone();
    }

    // Soft Pad overlay follows sticky surface — pin mappingId so Hub edits match floating pad.
    if let Some(kind) = pin_kind {
        codex_micro_overlay::clear_overlay_session_dismissed();
        codex_micro_overlay::note_soft_pad_surface_for_mapping(&result.mapping_id, kind);
    }
    // Outside cfg lock: Cursor may lock keybindings.json while IDE is open.
    if pin_kind == Some(crate::soft_pad_runtime::AgentKind::Cursor) {
        crate::cursor_keybindings_setup::ensure_composer_mode_keybindings_quiet();
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
    Ok(result)
}

/// Pin Soft Pad overlay surface to a specific mapping (Hub scheme select).
#[tauri::command]
pub fn cmd_soft_pad_pin_mapping(
    state: State<'_, Arc<AppState>>,
    mapping_id: String,
) -> Result<(), String> {
    let mapping_id = mapping_id.trim().to_string();
    if mapping_id.is_empty() {
        return Err("mapping_id_empty".into());
    }
    let cfg = state.cfg.lock();
    let Some(mapping) = cfg.mappings.iter().find(|m| m.id == mapping_id) else {
        return Err("mapping_not_found".into());
    };
    let Some(kind) =
        crate::soft_pad_runtime::AgentKind::from_app_target(mapping.app_target_id.trim())
    else {
        return Ok(());
    };
    codex_micro_overlay::clear_overlay_session_dismissed();
    codex_micro_overlay::note_soft_pad_surface_for_mapping(&mapping_id, kind);
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

/// Quiet-save Soft Pad visual skin and push overlay snapshot.
#[tauri::command]
pub fn cmd_codex_micro_pad_set_skin(
    app: AppHandle,
    state: State<'_, Arc<AppState>>,
    mapping_id: String,
    skin: String,
) -> Result<(), String> {
    let mapping_id = mapping_id.trim().to_string();
    if mapping_id.is_empty() {
        return Err("mapping_id_empty".into());
    }
    let skin = codex_micro_overlay::normalize_skin(&skin).to_string();

    let cfg_to_save;
    {
        let mut cfg = state.cfg.lock();
        let Some(mapping) = cfg.mappings.iter_mut().find(|m| m.id == mapping_id) else {
            return Err("mapping_not_found".into());
        };
        let pad = mapping
            .codex_micro_pad
            .get_or_insert_with(codex_numpad_layer::default_codex_micro_pad);
        pad.skin = skin;
        codex_numpad_layer::sync_hook_cache(&cfg);
        cfg_to_save = cfg.clone();
    }

    let state_bg = Arc::clone(state.inner());
    let _ = std::thread::Builder::new()
        .name("codex-micro-pad-skin".into())
        .spawn(move || {
            config::save_config(&cfg_to_save);
            codex_micro_overlay::push_state(&app, &state_bg);
        });
    Ok(())
}

/// Home「强制打开 Soft Pad」: quiet flag + ensure overlay mapping + push overlay.
/// Full `cmd_save` alone never picked a Soft Pad while OneTone was FG (Codex-only fallback).
#[tauri::command]
pub fn cmd_soft_pad_force_open(
    app: AppHandle,
    state: State<'_, Arc<AppState>>,
    enabled: bool,
) -> Result<serde_json::Value, String> {
    let cfg_to_save;
    let ensured;
    {
        let mut cfg = state.cfg.lock();
        cfg.soft_pad_force_open = enabled;
        if enabled {
            codex_micro_overlay::clear_overlay_session_dismissed();
            ensured = codex_micro_overlay::ensure_force_soft_pad_ready(&mut cfg);
        } else {
            ensured = true;
        }
        codex_numpad_layer::sync_hook_cache(&cfg);
        cfg_to_save = cfg.clone();
    }

    crate::app_log::log_line(
        state.inner(),
        "config",
        &format!("cmd_soft_pad_force_open enabled={enabled} ensured={ensured}"),
    );

    let state_bg = Arc::clone(state.inner());
    let _ = std::thread::Builder::new()
        .name("soft-pad-force-open".into())
        .spawn(move || {
            config::save_config(&cfg_to_save);
            codex_micro_overlay::push_state(&app, &state_bg);
        });

    Ok(serde_json::json!({
        "ok": true,
        "forceOpen": enabled,
        "ensured": ensured,
    }))
}

/// Overlay placeholder chip → open Soft Pad Agent face + shell hook connect for `kind`.
#[tauri::command]
pub fn cmd_soft_pad_open_shell_hook(
    app: AppHandle,
    state: State<'_, Arc<AppState>>,
    kind: String,
) -> Result<(), String> {
    use tauri::{Emitter, Manager};
    let kind = kind.trim().to_ascii_lowercase();
    if !matches!(kind.as_str(), "workbuddy" | "trae" | "qoder") {
        return Err("unsupported shell agent".into());
    }
    {
        let mut cfg = state.cfg.lock();
        cfg.soft_pad_force_open = true;
        codex_micro_overlay::clear_overlay_session_dismissed();
        let _ = codex_micro_overlay::ensure_force_soft_pad_ready(&mut cfg);
    }
    if let Some(main) = app.get_webview_window("main") {
        let _ = main.emit(
            "to_js",
            &serde_json::json!({
                "type": "soft_pad_open_shell_hook",
                "kind": kind,
            }),
        );
    }
    Ok(())
}

#[cfg(test)]
mod skin_ipc_tests {
    use crate::codex_micro_overlay::normalize_skin;
    use crate::codex_numpad_layer::default_codex_micro_pad;
    use crate::config::VoiceConfig;

    #[test]
    fn set_skin_only_updates_target_mapping() {
        let mut cfg = VoiceConfig::default();
        let mut pad_a = default_codex_micro_pad();
        pad_a.skin = "default".into();
        let mut pad_b = default_codex_micro_pad();
        pad_b.skin = "default".into();
        // Reuse any existing mapping shape from default config by cloning pad onto synthetic entries via serde roundtrip.
        let a_json = serde_json::json!({
            "id": "map-a",
            "label": "A",
            "codexMicroPad": pad_a
        });
        let b_json = serde_json::json!({
            "id": "map-b",
            "label": "B",
            "codexMicroPad": pad_b
        });
        let a: crate::config::MappingEntry = serde_json::from_value(a_json).expect("map-a");
        let b: crate::config::MappingEntry = serde_json::from_value(b_json).expect("map-b");
        cfg.mappings = vec![a, b];

        let skin = normalize_skin("vibe-dark").to_string();
        let mapping = cfg
            .mappings
            .iter_mut()
            .find(|m| m.id == "map-b")
            .expect("map-b");
        mapping
            .codex_micro_pad
            .get_or_insert_with(default_codex_micro_pad)
            .skin = skin;

        assert_eq!(
            cfg.mappings[0].codex_micro_pad.as_ref().unwrap().skin,
            "default"
        );
        assert_eq!(
            cfg.mappings[1].codex_micro_pad.as_ref().unwrap().skin,
            "vibe-light"
        );
    }
}
