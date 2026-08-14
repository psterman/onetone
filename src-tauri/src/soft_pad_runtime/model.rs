//! Cross-platform Soft Pad runtime types. Instant never enters IPC DTOs.

use serde::{Deserialize, Serialize};
use std::time::Instant;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum AgentKind {
    Codex,
    Claude,
    Cursor,
    /// MiniMax Code desktop — Soft Pad + provider usage (not Claude OTel).
    MiniMax,
    /// GitHub Copilot CLI — shell hooks (lifecycle + needs_input; no multi-lights).
    CopilotCli,
    /// Google Gemini CLI — shell hooks (CLI only; IDE mid-session measured separately).
    Gemini,
    /// Tencent WorkBuddy / CodeBuddy — shell hooks (lifecycle + needs_input; no Claude resume).
    WorkBuddy,
    /// ByteDance Trae IDE — shell hooks.
    Trae,
    /// Alibaba Qoder IDE/CLI — shell hooks.
    Qoder,
    /// Cline — file hooks (`.cline/hooks` / Documents/Cline/Hooks); no virtual keyboard.
    Cline,
    /// OpenCode — TypeScript plugin (not settings.json hooks).
    OpenCode,
    /// Aider — `--notifications-command` done-only (no running / needs_input).
    Aider,
}

impl AgentKind {
    pub fn as_str(self) -> &'static str {
        match self {
            AgentKind::Codex => "codex",
            AgentKind::Claude => "claude",
            AgentKind::Cursor => "cursor",
            AgentKind::MiniMax => "minimax",
            AgentKind::CopilotCli => "copilotCli",
            AgentKind::Gemini => "gemini",
            AgentKind::WorkBuddy => "workbuddy",
            AgentKind::Trae => "trae",
            AgentKind::Qoder => "qoder",
            AgentKind::Cline => "cline",
            AgentKind::OpenCode => "opencode",
            AgentKind::Aider => "aider",
        }
    }

    pub fn from_app_target(app_target_id: &str) -> Option<Self> {
        match app_target_id.trim() {
            "codex-chat" => Some(AgentKind::Codex),
            "claude-code" => Some(AgentKind::Claude),
            "cursor-chat" => Some(AgentKind::Cursor),
            "minimax-chat" => Some(AgentKind::MiniMax),
            "copilot-cli" => Some(AgentKind::CopilotCli),
            "gemini-cli" => Some(AgentKind::Gemini),
            "workbuddy-chat" | "codebuddy-chat" => Some(AgentKind::WorkBuddy),
            "trae-chat" => Some(AgentKind::Trae),
            "qoder-chat" => Some(AgentKind::Qoder),
            "cline-chat" => Some(AgentKind::Cline),
            "opencode-chat" => Some(AgentKind::OpenCode),
            "aider-chat" => Some(AgentKind::Aider),
            _ => None,
        }
    }

    pub fn from_kind_str(s: &str) -> Option<Self> {
        match s.trim() {
            "codex" => Some(AgentKind::Codex),
            "claude" => Some(AgentKind::Claude),
            "cursor" => Some(AgentKind::Cursor),
            "minimax" => Some(AgentKind::MiniMax),
            "copilotCli" | "copilotcli" | "copilot_cli" | "copilot-cli" => Some(AgentKind::CopilotCli),
            "gemini" | "gemini-cli" | "gemini_cli" => Some(AgentKind::Gemini),
            "workbuddy" | "codebuddy" => Some(AgentKind::WorkBuddy),
            "trae" => Some(AgentKind::Trae),
            "qoder" => Some(AgentKind::Qoder),
            "cline" | "cline-chat" | "cline_cli" => Some(AgentKind::Cline),
            "opencode" | "opencode-chat" | "open-code" => Some(AgentKind::OpenCode),
            "aider" | "aider-chat" => Some(AgentKind::Aider),
            _ => None,
        }
    }

    pub fn app_target_id(self) -> &'static str {
        match self {
            AgentKind::Codex => "codex-chat",
            AgentKind::Claude => "claude-code",
            AgentKind::Cursor => "cursor-chat",
            AgentKind::MiniMax => "minimax-chat",
            AgentKind::CopilotCli => "copilot-cli",
            AgentKind::Gemini => "gemini-cli",
            AgentKind::WorkBuddy => "workbuddy-chat",
            AgentKind::Trae => "trae-chat",
            AgentKind::Qoder => "qoder-chat",
            AgentKind::Cline => "cline-chat",
            AgentKind::OpenCode => "opencode-chat",
            AgentKind::Aider => "aider-chat",
        }
    }

    /// Soft Pad shell-hook / plugin / notify agents (POST 8796).
    pub fn is_shell_hook_agent(self) -> bool {
        matches!(
            self,
            AgentKind::WorkBuddy
                | AgentKind::Trae
                | AgentKind::Qoder
                | AgentKind::CopilotCli
                | AgentKind::Gemini
                | AgentKind::Cline
                | AgentKind::OpenCode
                | AgentKind::Aider
        )
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum FollowMode {
    Auto,
    Pinned,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum SelectionReason {
    UserPin,
    Waiting,
    Foreground,
    Fallback,
    None,
}

impl SelectionReason {
    pub fn as_str(self) -> &'static str {
        match self {
            SelectionReason::UserPin => "userPin",
            SelectionReason::Waiting => "waiting",
            SelectionReason::Foreground => "foreground",
            SelectionReason::Fallback => "fallback",
            SelectionReason::None => "none",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum RuntimeAvailability {
    Ready,
    HookUnavailable,
    PermissionDenied,
    RouteApplyFailed,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum RuntimeHealth {
    Ready,
    Degraded,
    Unavailable,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ApplyError {
    pub code: String,
    pub message: String,
}

/// Resolver output before route apply. Never named Applied.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CandidateDecision {
    pub lane_kind: Option<AgentKind>,
    pub mapping_id: Option<String>,
    pub reason: SelectionReason,
    pub mode: FollowMode,
}

/// Phase 1A diagnostic decision — does NOT mean routes are live.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ShadowDecision {
    pub revision: u64,
    pub lane_kind: Option<AgentKind>,
    pub mapping_id: Option<String>,
    pub reason: SelectionReason,
    pub mode: FollowMode,
    pub applied_at_ms: u64,
    pub based_on_config_revision: u64,
    pub generation: u64,
}

/// Public Applied DTO (IPC). Instant stays internal.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppliedSoftPadDecision {
    pub revision: u64,
    pub lane_kind: Option<AgentKind>,
    pub mapping_id: Option<String>,
    pub reason: SelectionReason,
    pub mode: FollowMode,
    pub applied_at_ms: u64,
}

#[derive(Debug, Clone)]
pub struct AppliedDecisionInternal {
    pub applied_instant: Instant,
    pub public: AppliedSoftPadDecision,
}

impl AppliedDecisionInternal {
    pub fn none(revision: u64) -> Self {
        Self {
            applied_instant: Instant::now(),
            public: AppliedSoftPadDecision {
                revision,
                lane_kind: None,
                mapping_id: None,
                reason: SelectionReason::None,
                mode: FollowMode::Auto,
                applied_at_ms: now_ms(),
            },
        }
    }
}

#[derive(Debug, Clone)]
pub struct ForegroundEvidence {
    pub agent_kind: Option<AgentKind>,
    pub observed_at: Instant,
    pub sequence: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SoftPadPublicSnapshot {
    pub decision_revision: u64,
    pub status_revision: u64,
    pub cutover: bool,
    pub availability: RuntimeAvailability,
    pub health: RuntimeHealth,
    pub mode: FollowMode,
    pub user_lane_id: Option<String>,
    pub applied: Option<AppliedSoftPadDecision>,
    pub shadow: Option<ShadowDecision>,
    pub last_recompute_error: Option<ApplyError>,
    pub legacy_dispatch_mapping: Option<String>,
    pub foreground_kind: Option<AgentKind>,
    /// AttentionStore waiting projection (honest waiting_kinds feed).
    pub attention_waiting_kinds: Vec<String>,
    pub attention_revision: u64,
}

pub fn now_ms() -> u64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// Foreground evidence TTL (monotonic). Stale → None before resolver.
pub const FG_EVIDENCE_TTL_MS: u64 = 30_000;
