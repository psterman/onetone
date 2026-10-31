//! Public contracts for Agent Task Runtime (Slice A+).

use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TaskStatus {
    Intake,
    Running,
    Waiting,
    Verifying,
    Repair,
    Review,
    Done,
    Failed,
    Cancelled,
    Interrupted,
}

impl TaskStatus {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Intake => "intake",
            Self::Running => "running",
            Self::Waiting => "waiting",
            Self::Verifying => "verifying",
            Self::Repair => "repair",
            Self::Review => "review",
            Self::Done => "done",
            Self::Failed => "failed",
            Self::Cancelled => "cancelled",
            Self::Interrupted => "interrupted",
        }
    }

    pub fn parse(s: &str) -> Option<Self> {
        match s.trim() {
            "intake" => Some(Self::Intake),
            "running" => Some(Self::Running),
            "waiting" => Some(Self::Waiting),
            "verifying" => Some(Self::Verifying),
            "repair" => Some(Self::Repair),
            "review" => Some(Self::Review),
            "done" => Some(Self::Done),
            "failed" => Some(Self::Failed),
            "cancelled" => Some(Self::Cancelled),
            "interrupted" => Some(Self::Interrupted),
            _ => None,
        }
    }

    pub fn is_active_exec(self) -> bool {
        matches!(self, Self::Running | Self::Verifying | Self::Repair)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PermissionMode {
    ReadOnly,
    WriteWithApproval,
    WriteAutonomous,
}

impl PermissionMode {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::ReadOnly => "read_only",
            Self::WriteWithApproval => "write_with_approval",
            Self::WriteAutonomous => "write_autonomous",
        }
    }

    pub fn parse(s: &str) -> Option<Self> {
        match s.trim() {
            "read_only" | "readonly" => Some(Self::ReadOnly),
            "write_with_approval" => Some(Self::WriteWithApproval),
            "write_autonomous" => Some(Self::WriteAutonomous),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct StartTaskRequest {
    pub goal: String,
    pub workspace_root: String,
    #[serde(default)]
    pub permission_mode: Option<String>,
    #[serde(default)]
    pub materials_summary: Option<String>,
    /// When true, FE intends fake IPC — backend still sets driver_kind from actual API.
    #[serde(default)]
    pub use_fake_driver: bool,
    /// Labeled sandbox verify entry (not normal project edit).
    #[serde(default)]
    pub verify_intent: bool,
    #[serde(default)]
    pub sandbox_id: Option<String>,
    #[serde(default)]
    pub expected_rel_path: Option<String>,
    #[serde(default)]
    pub expected_content: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskDto {
    pub task_id: String,
    pub goal: String,
    pub workspace_root: String,
    pub permission_mode: String,
    pub status: String,
    pub waiting_reason: Option<String>,
    pub current_turn: u32,
    pub tool_call_count: u32,
    pub changed_files: Vec<String>,
    pub pending_approval_token: Option<String>,
    pub checkpoint_id: Option<String>,
    pub last_error: Option<String>,
    pub created_at: u64,
    pub updated_at: u64,
    #[serde(default)]
    pub provider_id: Option<String>,
    #[serde(default)]
    pub model_id: Option<String>,
    #[serde(default)]
    pub config_fp: Option<String>,
    #[serde(default)]
    pub driver_kind: Option<String>,
    #[serde(default)]
    pub verify_intent: bool,
    #[serde(default)]
    pub sandbox_id: Option<String>,
    #[serde(default)]
    pub expected_rel_path: Option<String>,
    #[serde(default)]
    pub expected_content: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskEventDto {
    pub event_id: String,
    pub task_id: String,
    pub seq: u64,
    pub kind: String,
    pub turn: u32,
    pub tool_name: Option<String>,
    pub payload: Value,
    pub created_at: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ApprovePatchRequest {
    pub task_id: String,
    pub approval_token: String,
    /// Persist write_autonomous on this task (and callers persist for future starts).
    #[serde(default)]
    pub persist_autonomous: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskIdRequest {
    pub task_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SubmitUserInputRequest {
    pub task_id: String,
    pub text: String,
}

/// Runtime-internal only — never exposed to the model.
#[derive(Debug, Clone)]
pub struct CheckRequest {
    pub program: String,
    pub args: Vec<String>,
    pub timeout_ms: u64,
    pub output_limit: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileFingerprint {
    pub path: String,
    pub start_line: u32,
    pub end_line: u32,
    pub content_hash: String,
    pub file_hash: String,
    pub mtime: u64,
}

pub const MAX_TURNS: u32 = 24;
pub const MAX_REPAIR: u32 = 3;
pub const MAX_TOOL_JSON_DEPTH: usize = 8;
pub const MAX_FORMAT_RETRIES: u32 = 1;
/// Same tool+args in a row (WorkBuddy/vague goals often spin inspect). Fail early vs burning MAX_TURNS.
pub const MAX_IDENTICAL_TOOL: u32 = 3;
