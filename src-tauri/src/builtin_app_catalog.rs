//! Unified builtin app catalog — capability fields stay independent so adding
//! an app (e.g. Qoder) does not accidentally enable text-summon presets.

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LaunchStrategy {
    /// `%LOCALAPPDATA%`-relative exe list on the chat profile.
    Exe,
    /// Start Menu / AUMID (Store) launch.
    Appx,
    /// Resolve via shortcut / uninstall / known dirs at runtime.
    Shortcut,
    /// Focus-only; no cold start.
    None,
}

#[derive(Debug, Clone, Copy)]
pub struct BuiltinAppEntry {
    pub id: &'static str,
    pub builtin: bool,
    pub focus_supported: bool,
    pub launch_strategy: LaunchStrategy,
    /// Whether default Chinese/English summon phrases apply.
    pub text_summon_preset: bool,
    /// Workflow chat compose / open-key path (former is_workflow_app_target).
    pub workflow_target: bool,
}

const CATALOG: &[BuiltinAppEntry] = &[
    BuiltinAppEntry {
        id: "cursor-chat",
        builtin: true,
        focus_supported: true,
        launch_strategy: LaunchStrategy::Exe,
        text_summon_preset: true,
        workflow_target: true,
    },
    BuiltinAppEntry {
        id: "codex-chat",
        builtin: true,
        focus_supported: true,
        launch_strategy: LaunchStrategy::Appx,
        text_summon_preset: true,
        workflow_target: true,
    },
    BuiltinAppEntry {
        id: "claude-code",
        builtin: true,
        focus_supported: true,
        launch_strategy: LaunchStrategy::None,
        text_summon_preset: true,
        workflow_target: true,
    },
    BuiltinAppEntry {
        id: "minimax-chat",
        builtin: true,
        focus_supported: true,
        launch_strategy: LaunchStrategy::Exe,
        text_summon_preset: true,
        workflow_target: true,
    },
    BuiltinAppEntry {
        id: "workbuddy-chat",
        builtin: true,
        focus_supported: true,
        launch_strategy: LaunchStrategy::Shortcut,
        text_summon_preset: false,
        workflow_target: false,
    },
    BuiltinAppEntry {
        id: "trae-work",
        builtin: true,
        focus_supported: true,
        launch_strategy: LaunchStrategy::Shortcut,
        text_summon_preset: false,
        workflow_target: false,
    },
    BuiltinAppEntry {
        id: "trae-code",
        builtin: true,
        focus_supported: true,
        launch_strategy: LaunchStrategy::Shortcut,
        text_summon_preset: false,
        workflow_target: false,
    },
    BuiltinAppEntry {
        id: "windsurf-chat",
        builtin: true,
        focus_supported: true,
        launch_strategy: LaunchStrategy::Shortcut,
        text_summon_preset: false,
        workflow_target: false,
    },
    BuiltinAppEntry {
        id: "qoder-chat",
        builtin: true,
        focus_supported: true,
        launch_strategy: LaunchStrategy::Shortcut,
        text_summon_preset: false,
        workflow_target: false,
    },
    BuiltinAppEntry {
        id: "gemini-cli",
        builtin: true,
        focus_supported: true,
        launch_strategy: LaunchStrategy::None,
        text_summon_preset: false,
        workflow_target: false,
    },
    BuiltinAppEntry {
        id: "cline-chat",
        builtin: true,
        focus_supported: true,
        launch_strategy: LaunchStrategy::None,
        text_summon_preset: false,
        workflow_target: false,
    },
    BuiltinAppEntry {
        id: "roo-chat",
        builtin: true,
        focus_supported: true,
        launch_strategy: LaunchStrategy::None,
        text_summon_preset: false,
        workflow_target: false,
    },
    BuiltinAppEntry {
        id: "opencode-chat",
        builtin: true,
        focus_supported: true,
        launch_strategy: LaunchStrategy::None,
        text_summon_preset: false,
        workflow_target: false,
    },
    BuiltinAppEntry {
        id: "copilot-cli",
        builtin: true,
        focus_supported: true,
        launch_strategy: LaunchStrategy::None,
        text_summon_preset: false,
        workflow_target: false,
    },
    BuiltinAppEntry {
        id: "copilot-vscode",
        builtin: true,
        focus_supported: true,
        launch_strategy: LaunchStrategy::None,
        text_summon_preset: false,
        workflow_target: false,
    },
    BuiltinAppEntry {
        id: "aider-chat",
        builtin: true,
        focus_supported: true,
        launch_strategy: LaunchStrategy::None,
        text_summon_preset: false,
        workflow_target: false,
    },
];

pub fn entry_for(app_id: &str) -> Option<&'static BuiltinAppEntry> {
    let id = app_id.trim();
    if id.is_empty() {
        return None;
    }
    // Legacy Soft Pad mappings used trae-chat for Trae Work (SOLO).
    let id = if id == "trae-chat" { "trae-work" } else { id };
    CATALOG.iter().find(|e| e.id == id)
}

pub fn is_builtin_app_id(app_id: &str) -> bool {
    entry_for(app_id).is_some_and(|e| e.builtin)
}

/// Former `is_preset_app_id`: apps that use preset summon / rule injection.
pub fn is_preset_app_id(app_id: &str) -> bool {
    entry_for(app_id).is_some_and(|e| e.builtin && e.text_summon_preset)
}

/// Former `is_workflow_app_target`.
pub fn is_workflow_app_target(app_id: &str) -> bool {
    entry_for(app_id).is_some_and(|e| e.workflow_target)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn qoder_is_builtin_without_text_summon_or_workflow() {
        let e = entry_for("qoder-chat").expect("qoder");
        assert!(e.builtin);
        assert!(e.focus_supported);
        assert_eq!(e.launch_strategy, LaunchStrategy::Shortcut);
        assert!(!e.text_summon_preset);
        assert!(!e.workflow_target);
        assert!(!is_preset_app_id("qoder-chat"));
        assert!(!is_workflow_app_target("qoder-chat"));
        assert!(is_builtin_app_id("qoder-chat"));
    }

    #[test]
    fn cursor_keeps_preset_and_workflow() {
        assert!(is_preset_app_id("cursor-chat"));
        assert!(is_workflow_app_target("cursor-chat"));
    }
}
