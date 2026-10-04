//! Scenario presentation for the Now cockpit.
//!
//! Two rules drive everything here:
//!
//! 1. **Never surface `label`.** It defaults to a technical string like
//!    `AutoTrigger → RAlt` (see `ensure_global_baseline_mapping`). Now shows
//!    `display_name`, falling back to an app-derived guess — never to `label`.
//! 2. **Colour is state, not decoration.** The visual anchor comes from
//!    `scenario_kind` (a *type*, shared by many scenarios), plus a state
//!    intensity. Renaming or adding a scenario never changes the palette.

use crate::config::MappingEntry;

/// Scenario *type* — many scenarios may share one kind.
///
/// This is intentionally NOT `ActionCategory`: that enum splits by action
/// domain (input/agent/decision/session/system), not by the nature of the work.
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub enum ScenarioKind {
    /// Unity开发 / Web开发 / Python开发 → all "focus"
    Focus,
    /// Photoshop / Premiere / Figma
    Create,
    /// 微信 / Zoom / Slack
    Communicate,
    /// 久坐 / 休息
    Relax,
    /// Unset or unrecognised → neutral, never a guess.
    Unknown,
}

impl ScenarioKind {
    pub fn parse(raw: &str) -> Self {
        match raw.trim().to_ascii_lowercase().as_str() {
            "focus" => Self::Focus,
            "create" | "creative" => Self::Create,
            "communicate" | "comm" => Self::Communicate,
            "relax" | "rest" => Self::Relax,
            _ => Self::Unknown,
        }
    }

    pub fn as_str(self) -> &'static str {
        match self {
            Self::Focus => "focus",
            Self::Create => "create",
            Self::Communicate => "communicate",
            Self::Relax => "relax",
            Self::Unknown => "unknown",
        }
    }
}

/// Live state overlay on top of the scenario kind.
///
/// Colour priority: error > needs-you > working (desaturated) > normal.
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub enum ScenarioState {
    Normal,
    /// Agent running — same hue, reduced saturation.
    Working,
    /// Something is waiting on the user — amber overlay.
    NeedsYou,
    Error,
}

impl ScenarioState {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Normal => "normal",
            Self::Working => "working",
            Self::NeedsYou => "needsYou",
            Self::Error => "error",
        }
    }
}

/// Derive a temporary scenario name from the bound app.
///
/// This is a *fallback*, not a persistent name. The user renames it in
/// "调整帮助方式"; until then we show something readable rather than `label`.
pub fn derive_display_name(app_target_id: &str) -> String {
    let id = app_target_id.trim();
    if id.is_empty() {
        return String::new();
    }
    // app_target_id looks like `cursor-chat` / `codex-chat` / `photoshop`.
    let head = id.split('-').next().unwrap_or(id);
    let pretty = match head.to_ascii_lowercase().as_str() {
        "cursor" => "Cursor",
        "codex" => "Codex",
        "claude" => "Claude",
        "minimax" => "MiniMax",
        "vscode" | "code" => "VS Code",
        "photoshop" => "Photoshop",
        "figma" => "Figma",
        "word" => "Word",
        "chrome" => "Chrome",
        "slack" => "Slack",
        "zoom" => "Zoom",
        "wechat" => "微信",
        other => {
            // Unknown app: keep the raw id visible rather than inventing a word.
            return other.to_string();
        }
    };
    pretty.to_string()
}

/// What the Now cockpit header shows.
///
/// Order matters: `display_name` → app-derived fallback → empty (UI shows
/// "未命名情景"). `label` is never consulted.
pub fn scenario_display_name(m: &MappingEntry) -> String {
    let explicit = m.display_name.trim();
    if !explicit.is_empty() {
        return explicit.to_string();
    }
    derive_display_name(&m.app_target_id)
}

/// Scenario type; `Unknown` when unset so the UI can render neutral grey.
pub fn scenario_kind_of(m: &MappingEntry) -> ScenarioKind {
    ScenarioKind::parse(&m.scenario_kind)
}

/// Everything the cockpit header needs, in one DTO.
///
/// Kept separate from the DTO for habit rows so a rename never rewrites stored
/// config — this is a pure projection.
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScenarioHeaderDto {
    pub name: String,
    /// True when `name` came from the app fallback, not the user.
    pub name_is_derived: bool,
    pub app_target_id: String,
    pub kind: ScenarioKind,
    pub state: ScenarioState,
    pub color_key: String,
}

pub fn project_scenario_header(m: &MappingEntry, state: ScenarioState) -> ScenarioHeaderDto {
    let explicit = !m.display_name.trim().is_empty();
    let name = scenario_display_name(m);
    let kind = scenario_kind_of(m);
    ScenarioHeaderDto {
        name_is_derived: !explicit,
        name,
        app_target_id: m.app_target_id.trim().to_string(),
        color_key: color_key(kind, state),
        kind,
        state,
    }
}

/// Stable key the FE maps to a gradient. Keeping it as a string means the
/// palette can change in CSS without a Rust release.
pub fn color_key(kind: ScenarioKind, state: ScenarioState) -> String {
    format!("{}-{}", kind.as_str(), state.as_str())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn stub() -> MappingEntry {
        serde_json::from_value(serde_json::json!({
            "id": "x",
            "label": "AutoTrigger → RAlt",
            "group": "通用设置",
            "triggerKey": "AutoTrigger",
            "targetKey": "RAlt",
            "enabled": true,
            "appTargetId": "cursor-chat"
        }))
        .expect("mapping stub")
    }

    #[test]
    fn kind_parses_and_defaults_unknown() {
        assert_eq!(ScenarioKind::parse("focus"), ScenarioKind::Focus);
        assert_eq!(ScenarioKind::parse("Create"), ScenarioKind::Create);
        assert_eq!(ScenarioKind::parse(""), ScenarioKind::Unknown);
        assert_eq!(ScenarioKind::parse("wat"), ScenarioKind::Unknown);
    }

    #[test]
    fn explicit_name_wins_and_is_not_derived() {
        let mut m = stub();
        m.display_name = "Unity开发".into();
        let d = project_scenario_header(&m, ScenarioState::Normal);
        assert_eq!(d.name, "Unity开发");
        assert!(!d.name_is_derived);
    }

    #[test]
    fn falls_back_to_app_not_label() {
        let mut m = stub();
        m.label = "AutoTrigger → RAlt".into();
        let d = project_scenario_header(&m, ScenarioState::Normal);
        assert_eq!(d.name, "Cursor");
        assert!(d.name_is_derived);
        assert!(!d.name.contains("AutoTrigger"), "technical label leaked");
    }

    #[test]
    fn unknown_kind_is_neutral() {
        let m = stub();
        assert_eq!(scenario_kind_of(&m), ScenarioKind::Unknown);
        assert!(color_key(ScenarioKind::Unknown, ScenarioState::Normal).starts_with("unknown"));
    }

    #[test]
    fn state_changes_color_not_name() {
        let m = stub();
        let a = project_scenario_header(&m, ScenarioState::Normal);
        let b = project_scenario_header(&m, ScenarioState::NeedsYou);
        assert_eq!(a.name, b.name);
        assert_ne!(a.color_key, b.color_key);
    }

    #[test]
    fn two_focus_scenarios_share_a_visual_anchor() {
        let mut a = stub();
        a.display_name = "Unity开发".into();
        a.scenario_kind = "focus".into();
        let mut b = stub();
        b.display_name = "Web开发".into();
        b.scenario_kind = "focus".into();
        assert_eq!(
            project_scenario_header(&a, ScenarioState::Normal).color_key,
            project_scenario_header(&b, ScenarioState::Normal).color_key
        );
    }
}
