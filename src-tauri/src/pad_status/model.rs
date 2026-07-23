//! Canonical pad status object — shared by tooltip, AG LED, task card, diagnostics.

use serde::{Deserialize, Serialize};

/// Lamp / workflow state (UI may map `error` → 「失败」 copy).
pub const STATES: &[&str] = &[
    "idle",
    "running",
    "needs_input",
    "done",
    "error",
    "offline",
];

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PadState {
    Idle,
    Running,
    NeedsInput,
    Done,
    Error,
    Offline,
}

impl PadState {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Idle => "idle",
            Self::Running => "running",
            Self::NeedsInput => "needs_input",
            Self::Done => "done",
            Self::Error => "error",
            Self::Offline => "offline",
        }
    }

    pub fn parse(raw: &str) -> Option<Self> {
        match raw.trim() {
            "idle" => Some(Self::Idle),
            "running" | "listening" => Some(Self::Running),
            "needs_input" => Some(Self::NeedsInput),
            "done" => Some(Self::Done),
            "error" | "failed" => Some(Self::Error),
            "offline" => Some(Self::Offline),
            _ => None,
        }
    }
}

impl std::fmt::Display for PadState {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(self.as_str())
    }
}

/// Provenance channel (arbiter rank: native > hook > app > inferred > fallback).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PadSource {
    Native,
    Hook,
    App,
    Inferred,
    Fallback,
}

impl PadSource {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Native => "native",
            Self::Hook => "hook",
            Self::App => "app",
            Self::Inferred => "inferred",
            Self::Fallback => "fallback",
        }
    }

    /// Map legacy overlay / HTTP labels onto core sources.
    pub fn from_legacy(raw: &str) -> Self {
        match raw.trim() {
            "native" | "native_micro" => Self::Native,
            "codex_hook" | "claude_hook" | "hook" => Self::Hook,
            "codex_app" | "claude_app" | "app" => Self::App,
            "inferred" => Self::Inferred,
            _ => Self::Fallback,
        }
    }

    /// Legacy string still used by overlay `statusSource` / meta (codex_hook, …).
    pub fn to_legacy_label(self) -> &'static str {
        match self {
            Self::Native => "native",
            Self::Hook => "codex_hook",
            Self::App => "codex_app",
            Self::Inferred => "inferred",
            Self::Fallback => "fallback",
        }
    }

    pub fn rank(self) -> u8 {
        match self {
            Self::Native => 50,
            Self::Hook => 40,
            Self::App => 30,
            Self::Inferred => 20,
            Self::Fallback => 10,
        }
    }
}

pub const PAD_SOURCE_RANK: &[PadSource] = &[
    PadSource::Native,
    PadSource::Hook,
    PadSource::App,
    PadSource::Inferred,
    PadSource::Fallback,
];

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Confidence {
    High,
    Medium,
    Low,
}

impl Confidence {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::High => "high",
            Self::Medium => "medium",
            Self::Low => "low",
        }
    }

    pub fn rank(self) -> u8 {
        match self {
            Self::High => 3,
            Self::Medium => 2,
            Self::Low => 1,
        }
    }
}

/// Single source of truth for pad status-light perimeter and meta copy.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PadStatus {
    pub state: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub phase: Option<String>,
    pub source: String,
    pub confidence: String,
    pub updated_at: u64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub agent: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub task_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub session_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub sticky_until: Option<u64>,
    /// Last lifecycle event name (Hook), for meta / logs.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub last_event: Option<String>,
}

impl Default for PadStatus {
    fn default() -> Self {
        Self {
            state: PadState::Idle.as_str().into(),
            phase: None,
            source: PadSource::Fallback.as_str().into(),
            confidence: Confidence::Low.as_str().into(),
            updated_at: 0,
            agent: None,
            task_id: None,
            session_id: None,
            message: None,
            sticky_until: None,
            last_event: None,
        }
    }
}

impl PadStatus {
    pub fn state_enum(&self) -> PadState {
        PadState::parse(&self.state).unwrap_or(PadState::Idle)
    }

    pub fn source_enum(&self) -> PadSource {
        match self.source.as_str() {
            "native" => PadSource::Native,
            "hook" => PadSource::Hook,
            "app" => PadSource::App,
            "inferred" => PadSource::Inferred,
            _ => PadSource::Fallback,
        }
    }

    pub fn confidence_enum(&self) -> Confidence {
        match self.confidence.as_str() {
            "high" => Confidence::High,
            "medium" => Confidence::Medium,
            _ => Confidence::Low,
        }
    }

    /// UI / meta source label (agent-aware: Claude Hook vs Codex Hook).
    pub fn display_source_label(&self) -> &'static str {
        Self::display_source_label_for(&self.source, self.agent.as_deref())
    }

    /// Same rules as [`Self::display_source_label`] for log / diagnose rows.
    pub fn display_source_label_for(source: &str, agent: Option<&str>) -> &'static str {
        let src = match source.trim() {
            "native" | "native_micro" => PadSource::Native,
            "hook" | "codex_hook" | "claude_hook" => PadSource::Hook,
            "app" | "codex_app" | "claude_app" => PadSource::App,
            "inferred" => PadSource::Inferred,
            _ => PadSource::Fallback,
        };
        match (src, agent.map(|a| a.trim())) {
            (PadSource::Hook, Some("claude")) => "claude_hook",
            (PadSource::App, Some("claude")) => "claude_app",
            (s, _) => s.to_legacy_label(),
        }
    }

    pub fn is_sticky_active(&self, now: u64) -> bool {
        match self.sticky_until {
            Some(until) if until > now => true,
            _ => {
                // Implicit sticky for needs_input / running from high-confidence hook/app/native
                matches!(self.state_enum(), PadState::NeedsInput | PadState::Running)
                    && self.confidence_enum() != Confidence::Low
                    && matches!(
                        self.source_enum(),
                        PadSource::Native | PadSource::Hook | PadSource::App
                    )
            }
        }
    }

    /// Age in ms since updated_at (0 if never set).
    pub fn age_ms(&self, now: u64) -> u64 {
        if self.updated_at == 0 {
            0
        } else {
            now.saturating_sub(self.updated_at)
        }
    }
}

/// Candidate proposed by an adapter or output-adjacent path before arbitration.
#[derive(Debug, Clone)]
pub struct PadStatusCandidate {
    pub status: PadStatus,
    /// Compact raw tag for the event log (e.g. event name).
    pub raw_tag: String,
}
