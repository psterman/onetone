//! AgentTitle — honest title projection (pure, no IO).
//!
//! First version produces Derived | Unknown only. Observed is reserved for future
//! Agent-self title metadata — do not fake Observed fixtures.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum TitleSource {
    /// Agent itself returned a title (not implemented this round).
    Observed,
    Derived,
    Unknown,
}

impl TitleSource {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Observed => "observed",
            Self::Derived => "derived",
            Self::Unknown => "unknown",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum TitleDerivedFrom {
    Prompt,
    Project,
    SessionMeta,
    LifecycleEvent,
}

impl TitleDerivedFrom {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Prompt => "prompt",
            Self::Project => "project",
            Self::SessionMeta => "sessionMeta",
            Self::LifecycleEvent => "lifecycleEvent",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentTitle {
    pub text: String,
    pub source: TitleSource,
    pub confidence: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub derived_from: Option<TitleDerivedFrom>,
}

impl AgentTitle {
    pub fn unknown() -> Self {
        Self {
            text: String::new(),
            source: TitleSource::Unknown,
            confidence: "low".into(),
            derived_from: None,
        }
    }

    pub fn derived(text: String, from: TitleDerivedFrom, confidence: &str) -> Self {
        Self {
            text,
            source: TitleSource::Derived,
            confidence: confidence.into(),
            derived_from: Some(from),
        }
    }
}

#[derive(Debug, Clone, Default)]
pub struct TitleInputs<'a> {
    /// Recent PromptJournal summary (user input → Derived/Prompt, never Observed).
    pub prompt_summary: Option<&'a str>,
    pub project_name: Option<&'a str>,
    pub session_meta: Option<&'a str>,
    pub lifecycle_summary: Option<&'a str>,
}

fn nonempty(s: Option<&str>) -> Option<String> {
    s.map(str::trim)
        .filter(|t| !t.is_empty())
        .map(|t| t.to_string())
}

/// Pure title resolution. Prompt summaries are always Derived — never Observed.
pub fn resolve_title(input: TitleInputs<'_>) -> AgentTitle {
    if let Some(p) = nonempty(input.prompt_summary) {
        return AgentTitle::derived(p, TitleDerivedFrom::Prompt, "high");
    }
    let project = nonempty(input.project_name);
    let meta = nonempty(input.session_meta);
    match (project, meta) {
        (Some(p), Some(m)) => {
            let text = format!("{p} · {m}");
            AgentTitle::derived(text, TitleDerivedFrom::SessionMeta, "medium")
        }
        (Some(p), None) => AgentTitle::derived(p, TitleDerivedFrom::Project, "medium"),
        (None, Some(m)) => AgentTitle::derived(m, TitleDerivedFrom::SessionMeta, "low"),
        (None, None) => {
            if let Some(life) = nonempty(input.lifecycle_summary) {
                AgentTitle::derived(life, TitleDerivedFrom::LifecycleEvent, "low")
            } else {
                AgentTitle::unknown()
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn prompt_summary_is_derived_not_observed() {
        let t = resolve_title(TitleInputs {
            prompt_summary: Some("fix the login form"),
            project_name: Some("voice-pilot"),
            ..Default::default()
        });
        assert_eq!(t.source, TitleSource::Derived);
        assert_eq!(t.derived_from, Some(TitleDerivedFrom::Prompt));
        assert_eq!(t.text, "fix the login form");
        assert_ne!(t.source, TitleSource::Observed);
    }

    #[test]
    fn project_derivation() {
        let t = resolve_title(TitleInputs {
            project_name: Some("voice-pilot"),
            ..Default::default()
        });
        assert_eq!(t.source, TitleSource::Derived);
        assert_eq!(t.derived_from, Some(TitleDerivedFrom::Project));
        assert_eq!(t.text, "voice-pilot");
    }

    #[test]
    fn project_plus_session_meta() {
        let t = resolve_title(TitleInputs {
            project_name: Some("voice-pilot"),
            session_meta: Some("branch feat/x"),
            ..Default::default()
        });
        assert_eq!(t.derived_from, Some(TitleDerivedFrom::SessionMeta));
        assert!(t.text.contains("voice-pilot"));
        assert!(t.text.contains("branch feat/x"));
    }

    #[test]
    fn lifecycle_fallback() {
        let t = resolve_title(TitleInputs {
            lifecycle_summary: Some("task_started"),
            ..Default::default()
        });
        assert_eq!(t.derived_from, Some(TitleDerivedFrom::LifecycleEvent));
        assert_eq!(t.text, "task_started");
    }

    #[test]
    fn all_missing_unknown_empty() {
        let t = resolve_title(TitleInputs::default());
        assert_eq!(t.source, TitleSource::Unknown);
        assert!(t.text.is_empty());
        assert!(t.derived_from.is_none());
    }

    #[test]
    fn blank_strings_downgrade() {
        let t = resolve_title(TitleInputs {
            prompt_summary: Some("   "),
            project_name: Some("\t"),
            session_meta: Some(""),
            lifecycle_summary: Some("  \n"),
        });
        assert_eq!(t.source, TitleSource::Unknown);
        assert!(t.text.is_empty());
    }

    #[test]
    fn source_and_confidence_distinguishable() {
        let prompt = resolve_title(TitleInputs {
            prompt_summary: Some("hi"),
            ..Default::default()
        });
        let project = resolve_title(TitleInputs {
            project_name: Some("p"),
            ..Default::default()
        });
        assert_eq!(prompt.confidence, "high");
        assert_eq!(project.confidence, "medium");
        assert_ne!(prompt.derived_from, project.derived_from);
    }
}
