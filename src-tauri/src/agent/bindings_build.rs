//! Build AgentBinding rows for a scenario template apply.

use crate::agent::actions::action_by_id;
use crate::agent::templates::{codex_micro_13_template, is_essential_slot};
use crate::config::AgentBinding;

/// Codex App official shortcuts where published; slash slots use OneTone overlay chords.
pub fn default_key_for_slot(slot_id: &str) -> &'static str {
    match slot_id {
        "summonCodex" => "",
        "pushToTalk" => "Ctrl+Shift+D",
        "stopOrSend" => "Enter",
        "cancel" => "Escape",
        "newThread" => "Ctrl+N",
        "undo" => "Ctrl+Z",
        "quickSearch" => "Ctrl+F",
        "quickChat" => "Ctrl+Alt+N",
        "commandPalette" => "Ctrl+K",
        "openReviewTab" => "Ctrl+Shift+G",
        "toggleReviewPanel" => "Ctrl+Alt+B",
        "toggleSidebar" => "Ctrl+B",
        "openSettings" => "Ctrl+,",
        "navBack" => "Ctrl+[",
        "navForward" => "Ctrl+]",
        "openTerminal" => "Ctrl+`",
        "toggleBrowserPanel" => "Ctrl+Shift+B",
        "newBrowserTab" => "Ctrl+T",
        "focusBrowserAddressBar" => "Ctrl+L",
        "status" => "Ctrl+Alt+S",
        "plan" => "Ctrl+Alt+P",
        "review" => "Ctrl+Alt+R",
        "permissions" => "Ctrl+Alt+,",
        "switchAgent" => "Ctrl+Alt+.",
        "claudeModel" => "",
        "switchModel" => "Ctrl+Alt+M",
        "appsOrPlugins" => "Ctrl+Alt+A",
        _ => "",
    }
}

/// Shared editor chords for VS Code forks. AI chat / cancel differ per product.
pub fn default_vscode_key_for_slot(slot_id: &str) -> &'static str {
    match slot_id {
        "summonCodex" => "",
        "pushToTalk" => "",
        "stopOrSend" => "Enter",
        "cancel" => "Escape",
        "newThread" => "Ctrl+N",
        "undo" => "Ctrl+Z",
        "quickSearch" => "Ctrl+F",
        "quickChat" => "",
        "commandPalette" => "Ctrl+Shift+P",
        "openReviewTab" => "",
        "toggleReviewPanel" => "",
        "toggleSidebar" => "Ctrl+B",
        "openSettings" => "Ctrl+,",
        "navBack" => "Alt+Left",
        "navForward" => "Alt+Right",
        "openTerminal" => "Ctrl+`",
        "toggleBrowserPanel" => "",
        "newBrowserTab" => "Ctrl+T",
        "focusBrowserAddressBar" => "",
        "status" | "plan" | "review" | "permissions" | "switchAgent" | "claudeModel"
        | "switchModel" | "appsOrPlugins" => "",
        _ => "",
    }
}

/// Cursor: VS Code base + Agent (`Ctrl+I`) + cancel generation.
/// Soft Pad mic (pushToTalk): Cursor native Voice Mode (`Ctrl+Shift+Space`).
pub fn default_cursor_key_for_slot(slot_id: &str) -> &'static str {
    match slot_id {
        "cancel" => "Ctrl+Shift+Backspace",
        "quickChat" => "Ctrl+I",
        "pushToTalk" => "Ctrl+Shift+Space",
        // Seeded into Cursor keybindings.json as composerMode.plan / composerMode.agent.
        // Ctrl+Alt+Shift+P — Ctrl+Alt+P collides with screenshot / pin shortcuts.
        "plan" => "Ctrl+Alt+Shift+P",
        "switchAgent" => "Ctrl+Alt+.",
        _ => default_vscode_key_for_slot(slot_id),
    }
}

/// Trae IDE: side chat is Ctrl+U (docs.trae.cn). Inline Ctrl+I is not the pad default.
pub fn default_trae_key_for_slot(slot_id: &str) -> &'static str {
    match slot_id {
        "quickChat" => "Ctrl+U",
        _ => default_vscode_key_for_slot(slot_id),
    }
}

/// Qoder IDE: chat panel Ctrl+L; reject-all Ctrl+Backspace (docs.qoder.com).
pub fn default_qoder_key_for_slot(slot_id: &str) -> &'static str {
    match slot_id {
        "quickChat" => "Ctrl+L",
        "cancel" => "Ctrl+Backspace",
        _ => default_vscode_key_for_slot(slot_id),
    }
}

/// WorkBuddy desktop (WorkBuddy.exe), not CodeBuddy IDE / not a VS Code fork.
/// Wake Ctrl+Space is global — do not inject from the pad.
pub fn default_workbuddy_key_for_slot(slot_id: &str) -> &'static str {
    match slot_id {
        "stopOrSend" => "Enter",
        "cancel" => "Escape",
        "newThread" => "Ctrl+N",
        "undo" => "Ctrl+Z",
        _ => "",
    }
}

pub fn is_vscode_lineage_app(app_target_id: &str) -> bool {
    matches!(
        app_target_id.trim(),
        crate::app_chat_workflow::CURSOR_APP_TARGET_ID
            | crate::app_chat_workflow::WORKBUDDY_APP_TARGET_ID
            | crate::app_chat_workflow::TRAE_APP_TARGET_ID
            | crate::app_chat_workflow::TRAE_CHAT_LEGACY_APP_TARGET_ID
            | crate::app_chat_workflow::TRAE_CODE_APP_TARGET_ID
            | crate::app_chat_workflow::QODER_APP_TARGET_ID
    )
}

pub fn default_key_for_scenario(app_target_id: &str, slot_id: &str) -> &'static str {
    let app = app_target_id.trim();
    if app == crate::app_chat_workflow::CURSOR_APP_TARGET_ID {
        default_cursor_key_for_slot(slot_id)
    } else if app == crate::app_chat_workflow::TRAE_APP_TARGET_ID
        || app == crate::app_chat_workflow::TRAE_CHAT_LEGACY_APP_TARGET_ID
        || app == crate::app_chat_workflow::TRAE_CODE_APP_TARGET_ID
    {
        default_trae_key_for_slot(slot_id)
    } else if app == crate::app_chat_workflow::QODER_APP_TARGET_ID {
        default_qoder_key_for_slot(slot_id)
    } else if app == crate::app_chat_workflow::WORKBUDDY_APP_TARGET_ID {
        default_workbuddy_key_for_slot(slot_id)
    } else if is_vscode_lineage_app(app) {
        default_vscode_key_for_slot(slot_id)
    } else {
        default_key_for_slot(slot_id)
    }
}

fn build_chord_bindings(locale: &str, key_for_slot: fn(&str) -> &'static str) -> Vec<AgentBinding> {
    let en = locale.trim().eq_ignore_ascii_case("en")
        || locale.trim().eq_ignore_ascii_case("en-US")
        || locale.trim().eq_ignore_ascii_case("en-light");
    let tpl = codex_micro_13_template();
    let mut out = Vec::with_capacity(tpl.slots.len() * 2);
    for slot in tpl.slots {
        let essential = is_essential_slot(slot.slot_id);
        let phrase = action_by_id(slot.action_id)
            .map(|a| {
                if en {
                    a.default_voice_phrases.en
                } else {
                    a.default_voice_phrases.zh
                }
            })
            .unwrap_or("")
            .to_string();
        out.push(AgentBinding {
            action_instance_id: String::new(),
            action_args: None,
            slot_id: slot.slot_id.into(),
            action_id: slot.action_id.into(),
            trigger_type: "key".into(),
            trigger_binding: key_for_slot(slot.slot_id).into(),
            enabled: true,
            execution_mode: Some(slot.execution_mode.as_str().into()),
            activation_scope: slot.activation_scope.as_str().into(),
        });
        out.push(AgentBinding {
            action_instance_id: String::new(),
            action_args: None,
            slot_id: slot.slot_id.into(),
            action_id: slot.action_id.into(),
            trigger_type: "voice".into(),
            trigger_binding: phrase,
            enabled: essential,
            execution_mode: Some(slot.execution_mode.as_str().into()),
            activation_scope: slot.activation_scope.as_str().into(),
        });
    }
    out
}

pub fn build_cursor_chord_bindings(locale: &str) -> Vec<AgentBinding> {
    build_chord_bindings(locale, default_cursor_key_for_slot)
}

pub fn build_vscode_chord_bindings(locale: &str) -> Vec<AgentBinding> {
    build_chord_bindings(locale, default_vscode_key_for_slot)
}

pub fn build_scenario_bindings(locale: &str, app_target_id: &str) -> Vec<AgentBinding> {
    let app = app_target_id.trim();
    if app == crate::app_chat_workflow::CURSOR_APP_TARGET_ID {
        build_cursor_chord_bindings(locale)
    } else if app == crate::app_chat_workflow::TRAE_APP_TARGET_ID
        || app == crate::app_chat_workflow::TRAE_CHAT_LEGACY_APP_TARGET_ID
        || app == crate::app_chat_workflow::TRAE_CODE_APP_TARGET_ID
    {
        build_chord_bindings(locale, default_trae_key_for_slot)
    } else if app == crate::app_chat_workflow::QODER_APP_TARGET_ID {
        build_chord_bindings(locale, default_qoder_key_for_slot)
    } else if app == crate::app_chat_workflow::WORKBUDDY_APP_TARGET_ID {
        build_chord_bindings(locale, default_workbuddy_key_for_slot)
    } else {
        build_codex_micro_13_bindings(locale)
    }
}

/// Build key+voice bindings for Codex Micro 13.
/// Keys: all 13 enabled (numpad simulator). Voice: essentials only (reduce misfires).
pub fn build_codex_micro_13_bindings(locale: &str) -> Vec<AgentBinding> {
    let en = locale.trim().eq_ignore_ascii_case("en")
        || locale.trim().eq_ignore_ascii_case("en-US")
        || locale.trim().eq_ignore_ascii_case("en-light");
    let tpl = codex_micro_13_template();
    let mut out = Vec::with_capacity(tpl.slots.len() * 2);
    for slot in tpl.slots {
        let essential = is_essential_slot(slot.slot_id);
        let phrase = action_by_id(slot.action_id)
            .map(|a| {
                if en {
                    a.default_voice_phrases.en
                } else {
                    a.default_voice_phrases.zh
                }
            })
            .unwrap_or("")
            .to_string();
        out.push(AgentBinding {
            action_instance_id: String::new(),
            action_args: None,
            slot_id: slot.slot_id.into(),
            action_id: slot.action_id.into(),
            trigger_type: "key".into(),
            trigger_binding: default_key_for_slot(slot.slot_id).into(),
            enabled: true,
            execution_mode: Some(slot.execution_mode.as_str().into()),
            activation_scope: slot.activation_scope.as_str().into(),
        });
        out.push(AgentBinding {
            action_instance_id: String::new(),
            action_args: None,
            slot_id: slot.slot_id.into(),
            action_id: slot.action_id.into(),
            trigger_type: "voice".into(),
            trigger_binding: phrase,
            enabled: essential,
            execution_mode: Some(slot.execution_mode.as_str().into()),
            activation_scope: slot.activation_scope.as_str().into(),
        });
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::agent::templates::ESSENTIAL_SLOT_IDS;
    use std::collections::HashSet;

    #[test]
    fn builds_thirteen_slots_key_all_voice_essentials() {
        let rows = build_codex_micro_13_bindings("zh-CN");
        let slot_count = crate::agent::templates::codex_micro_13_template().slots.len();
        assert_eq!(rows.len(), slot_count * 2);

        let key_enabled: HashSet<_> = rows
            .iter()
            .filter(|b| b.trigger_type == "key" && b.enabled)
            .map(|b| b.slot_id.as_str())
            .collect();
        assert_eq!(key_enabled.len(), slot_count, "all template key bindings enabled");

        let voice_enabled: HashSet<_> = rows
            .iter()
            .filter(|b| b.trigger_type == "voice" && b.enabled)
            .map(|b| b.slot_id.as_str())
            .collect();
        for id in ESSENTIAL_SLOT_IDS {
            assert!(voice_enabled.contains(id), "essential voice {id} not enabled");
        }
        assert_eq!(voice_enabled.len(), ESSENTIAL_SLOT_IDS.len());

        assert!(rows
            .iter()
            .any(|b| b.trigger_type == "voice" && !b.trigger_binding.is_empty()));
        assert!(rows.iter().any(|b| {
            b.trigger_type == "key"
                && b.slot_id == "summonCodex"
                && b.trigger_binding.is_empty()
        }));
        assert!(rows.iter().any(|b| {
            b.trigger_type == "key"
                && b.slot_id == "claudeModel"
                && b.trigger_binding.is_empty()
        }));
        assert!(rows.iter().any(|b| {
            b.trigger_type == "key"
                && b.slot_id == "pushToTalk"
                && b.trigger_binding == "Ctrl+Shift+D"
        }));
        assert!(rows.iter().any(|b| {
            b.trigger_type == "key"
                && b.slot_id == "openTerminal"
                && b.trigger_binding == "Ctrl+`"
        }));
        assert!(rows
            .iter()
            .filter(|b| {
                b.trigger_type == "key"
                    && b.slot_id != "summonCodex"
                    && b.slot_id != "claudeModel"
            })
            .all(|b| !b.trigger_binding.is_empty()));
        assert_eq!(default_key_for_slot("summonCodex"), "");
        assert_eq!(default_key_for_slot("claudeModel"), "");
        assert_eq!(default_key_for_slot("openTerminal"), "Ctrl+`");
        assert_eq!(default_key_for_slot("openReviewTab"), "Ctrl+Shift+G");
        assert_eq!(
            default_cursor_key_for_slot("cancel"),
            "Ctrl+Shift+Backspace"
        );
        assert_eq!(default_cursor_key_for_slot("plan"), "Ctrl+Alt+Shift+P");
        assert_eq!(default_cursor_key_for_slot("switchAgent"), "Ctrl+Alt+.");
        assert_eq!(
            default_cursor_key_for_slot("commandPalette"),
            "Ctrl+Shift+P"
        );
        assert_eq!(default_cursor_key_for_slot("summonCodex"), "");
        assert_eq!(default_vscode_key_for_slot("commandPalette"), "Ctrl+Shift+P");
        assert_eq!(default_vscode_key_for_slot("cancel"), "Escape");
        assert_eq!(default_vscode_key_for_slot("quickChat"), "");
        assert_eq!(
            default_key_for_scenario("workbuddy-chat", "commandPalette"),
            ""
        );
        assert_eq!(
            default_key_for_scenario("workbuddy-chat", "newThread"),
            "Ctrl+N"
        );
        assert_eq!(
            default_key_for_scenario("trae-work", "quickChat"),
            "Ctrl+U"
        );
        assert_eq!(
            default_key_for_scenario("trae-code", "quickChat"),
            "Ctrl+U"
        );
        assert_eq!(
            default_key_for_scenario("trae-chat", "quickChat"),
            "Ctrl+U"
        );
        assert_eq!(
            default_key_for_scenario("qoder-chat", "cancel"),
            "Ctrl+Backspace"
        );
        assert_eq!(
            default_key_for_scenario("qoder-chat", "quickChat"),
            "Ctrl+L"
        );
        assert_eq!(
            default_key_for_scenario("cursor-chat", "pushToTalk"),
            "Ctrl+Shift+Space"
        );
        assert!(build_vscode_chord_bindings("zh-CN").iter().any(|b| {
            b.trigger_type == "key" && b.slot_id == "quickChat" && b.trigger_binding.is_empty()
        }));
        assert!(build_scenario_bindings("zh-CN", "trae-work")
            .iter()
            .any(|b| {
                b.trigger_type == "key" && b.slot_id == "quickChat" && b.trigger_binding == "Ctrl+U"
            }));
    }
}
