//! Codex Micro pad binding diagnose + one-click heal.

use std::sync::Arc;

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State};

use crate::codex_micro_overlay;
use crate::codex_numpad_layer::{self, heal_codex_pad_bindings};
use crate::codex_pad_binding_diagnose::{
    diagnose_codex_pad_bindings_for_cfg, CodexPadBindingDiagnoseView,
};
use crate::config;
use crate::AppState;

/// One-click binding checklist: missing routes, empty chords, scan/slot/chord conflicts.
#[tauri::command]
pub fn cmd_codex_pad_binding_diagnose(
    state: State<'_, Arc<AppState>>,
    mapping_id: Option<String>,
) -> CodexPadBindingDiagnoseView {
    let cfg = state.cfg.lock();
    diagnose_codex_pad_bindings_for_cfg(&cfg, mapping_id.as_deref())
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CodexPadBindingHealView {
    pub changed: bool,
    pub mapping_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub codex_micro_pad: Option<crate::config::CodexMicroPadConfig>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub agent_bindings: Option<Vec<crate::config::AgentBinding>>,
    pub diagnose: CodexPadBindingDiagnoseView,
}

/// Heal missing routes / empty chords / ENC screen-only / scan conflicts, then re-diagnose.
#[tauri::command]
pub fn cmd_codex_pad_binding_heal(
    app: AppHandle,
    state: State<'_, Arc<AppState>>,
    mapping_id: Option<String>,
    locale: Option<String>,
) -> CodexPadBindingHealView {
    let loc = locale
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .unwrap_or("zh-CN")
        .to_string();
    let result = {
        let mut cfg = state.cfg.lock();
        let result = heal_codex_pad_bindings(&mut cfg, mapping_id.as_deref(), &loc);
        if result.changed {
            config::save_config(&cfg);
            codex_numpad_layer::sync_hook_cache(&cfg);
        }
        let diagnose =
            diagnose_codex_pad_bindings_for_cfg(&cfg, result.mapping_id.as_deref());
        (result, diagnose)
    };
    let (heal, diagnose) = result;
    if heal.changed {
        if let Some(main) = app.get_webview_window("main") {
            let _ = main.emit(
                "to_js",
                &serde_json::json!({
                    "type": "codex_micro_pad_ready",
                    "mappingId": heal.mapping_id,
                    "codexMicroPad": heal.codex_micro_pad,
                    "agentBindings": heal.agent_bindings,
                    "readiness": heal.readiness,
                }),
            );
        }
        let state_bg = Arc::clone(state.inner());
        let app_bg = app.clone();
        let _ = std::thread::Builder::new()
            .name("codex-pad-bind-heal-overlay".into())
            .spawn(move || {
                codex_micro_overlay::push_state(&app_bg, &state_bg);
            });
    }
    CodexPadBindingHealView {
        changed: heal.changed,
        mapping_id: heal.mapping_id.clone().unwrap_or_default(),
        codex_micro_pad: heal.codex_micro_pad,
        agent_bindings: heal.agent_bindings,
        diagnose,
    }
}
