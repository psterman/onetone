//! Build AgentBinding rows for a scenario template apply.

use crate::agent::actions::action_by_id;
use crate::agent::templates::{codex_micro_13_template, is_essential_slot};
use crate::config::AgentBinding;

/// Codex App official shortcuts where published; slash slots use OneTone overlay chords.
fn default_key_for_slot(slot_id: &str) -> &'static str {
    match slot_id {
        "summonCodex" => "Ctrl+Shift+P",
        "pushToTalk" => "Ctrl+Shift+D",
        "stopOrSend" => "Enter",
        "cancel" => "Escape",
        "newThread" => "Ctrl+N",
        "quickChat" => "Ctrl+Alt+N",
        "commandPalette" => "Ctrl+K",
        "status" => "Ctrl+Alt+S",
        "plan" => "Ctrl+Alt+P",
        "review" => "Ctrl+Alt+R",
        "permissions" => "Ctrl+Alt+,",
        "switchAgent" => "Ctrl+Alt+.",
        "appsOrPlugins" => "Ctrl+Alt+A",
        _ => "",
    }
}

/// Build key+voice bindings for Codex Micro 13. Essentials enabled; others disabled.
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
            slot_id: slot.slot_id.into(),
            action_id: slot.action_id.into(),
            trigger_type: "key".into(),
            trigger_binding: default_key_for_slot(slot.slot_id).into(),
            enabled: essential,
            execution_mode: Some(slot.execution_mode.as_str().into()),
            activation_scope: slot.activation_scope.as_str().into(),
        });
        out.push(AgentBinding {
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

    #[test]
    fn builds_thirteen_slots_key_and_voice() {
        let rows = build_codex_micro_13_bindings("zh-CN");
        assert_eq!(rows.len(), 26);
        let enabled_slots: std::collections::HashSet<_> = rows
            .iter()
            .filter(|b| b.enabled)
            .map(|b| b.slot_id.as_str())
            .collect();
        for id in ESSENTIAL_SLOT_IDS {
            assert!(enabled_slots.contains(id), "essential {id} not enabled");
        }
        assert!(enabled_slots.len() <= 5);
        assert!(rows
            .iter()
            .any(|b| b.trigger_type == "voice" && !b.trigger_binding.is_empty()));
        assert!(rows.iter().any(|b| {
            b.trigger_type == "key"
                && b.slot_id == "summonCodex"
                && b.trigger_binding == "Ctrl+Shift+P"
        }));
        assert!(rows.iter().any(|b| {
            b.trigger_type == "key"
                && b.slot_id == "pushToTalk"
                && b.trigger_binding == "Ctrl+Shift+D"
        }));
        assert!(rows
            .iter()
            .filter(|b| b.trigger_type == "key")
            .all(|b| !b.trigger_binding.is_empty()));
    }
}
