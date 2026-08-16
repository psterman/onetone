//! Agent attention signals — facts for Soft Pad waiting projection (not PadStatus sticky).

use crate::soft_pad_runtime::AgentKind;
use serde::{Deserialize, Serialize};
use std::time::Instant;

/// Crash-insurance TTL for NeedsInput when no precise clear arrives.
pub const NEEDS_INPUT_WATCHDOG_MS: u64 = 5 * 60 * 1000;
/// Soft Pad chip: keep Complete visible briefly then drop lifecycle.
pub const COMPLETE_TTL_MS: u64 = 4_000;
/// Error banner linger (slightly longer than Complete).
pub const ERROR_TTL_MS: u64 = 8_000;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum AttentionState {
    NeedsInput,
    Working,
    Idle,
    Complete,
    Error,
}

impl AttentionState {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::NeedsInput => "needsInput",
            Self::Working => "working",
            Self::Idle => "idle",
            Self::Complete => "complete",
            Self::Error => "error",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum AttentionCause {
    Permission,
    Elicitation,
    UserInput,
    Failure,
    Lifecycle,
    OneToneAsk,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum SignalSource {
    AppServer,
    OfficialHook,
    Native,
    /// OneTone-originated permission ask (may enter waiting_kinds).
    OneToneAsk,
    /// FG / title / text — lights only; never waiting_kinds.
    Inferred,
}

impl SignalSource {
    pub fn can_enter_waiting(self) -> bool {
        matches!(
            self,
            Self::AppServer | Self::OfficialHook | Self::Native | Self::OneToneAsk
        )
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Confidence {
    High,
    Medium,
    Low,
}

#[derive(Debug, Clone)]
pub struct AgentAttentionSignal {
    pub agent: AgentKind,
    pub session_id: Option<String>,
    pub request_id: Option<String>,
    pub state: AttentionState,
    pub cause: AttentionCause,
    pub source: SignalSource,
    pub confidence: Confidence,
    pub sequence: u64,
    pub observed_at: Instant,
    pub expires_at: Option<Instant>,
}

impl AgentAttentionSignal {
    pub fn key(&self) -> SignalKey {
        SignalKey {
            agent: self.agent,
            session_id: self.session_id.clone().unwrap_or_default(),
            request_id: self.request_id.clone().unwrap_or_default(),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct SignalKey {
    pub agent: AgentKind,
    pub session_id: String,
    pub request_id: String,
}

/// Public DTO for diagnose / status bar (no Instant).
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AttentionPublicRow {
    pub agent: String,
    pub session_id: Option<String>,
    pub request_id: Option<String>,
    pub state: AttentionState,
    pub cause: AttentionCause,
    pub source: SignalSource,
    pub confidence: Confidence,
    pub sequence: u64,
    pub observed_at_ms: u64,
    pub expires_at_ms: Option<u64>,
    pub waiting_eligible: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AttentionPublicSnapshot {
    pub revision: u64,
    pub waiting_kinds: Vec<String>,
    pub rows: Vec<AttentionPublicRow>,
}
