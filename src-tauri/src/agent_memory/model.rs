//! DTOs for Plan A session discovery and home projection.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum ProjectMatch {
    Exact,
    Probable,
    Unknown,
}

impl ProjectMatch {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Exact => "exact",
            Self::Probable => "probable",
            Self::Unknown => "unknown",
        }
    }

    pub fn from_str_loose(s: &str) -> Self {
        match s {
            "exact" => Self::Exact,
            "probable" => Self::Probable,
            _ => Self::Unknown,
        }
    }

    pub fn rank(&self) -> u8 {
        match self {
            Self::Exact => 2,
            Self::Probable => 1,
            Self::Unknown => 0,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectIdentity {
    pub project_id: String,
    pub git_root: Option<String>,
    pub workspace_path: Option<String>,
    pub display_name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum EvidenceTier {
    High,
    PathValid,
    Historic,
}

impl EvidenceTier {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::High => "high",
            Self::PathValid => "path_valid",
            Self::Historic => "historic",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceEvidence {
    pub path: String,
    pub source: String,
    #[serde(default = "default_evidence_tier")]
    pub tier: EvidenceTier,
}

fn default_evidence_tier() -> EvidenceTier {
    EvidenceTier::Historic
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionCandidate {
    pub provider: String,
    pub external_session_id: String,
    pub project_id: String,
    pub project_match: ProjectMatch,
    pub match_reason: String,
    pub match_confidence: f32,
    pub started_at: Option<u64>,
    pub updated_at: Option<u64>,
    pub title: Option<String>,
    pub is_active: bool,
    pub activity_source: String,
    pub active_confidence: f32,
    pub workspace_evidence: Option<WorkspaceEvidence>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HomeSessionDto {
    pub session_id: String,
    pub provider: String,
    pub external_session_id: String,
    pub title: Option<String>,
    pub updated_at: Option<u64>,
    pub status: String,
    pub project_match: String,
    pub match_reason: String,
    pub match_confidence: f32,
    pub is_active: bool,
    pub activity_source: String,
    pub active_confidence: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HomeEventDto {
    pub event_id: String,
    pub event_type: String,
    pub event_class: String,
    pub summary: String,
    pub timestamp: u64,
    pub session_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ProbeStatus {
    Ready,
    Stale,
    EmptyValid,
    SchemaUnknown,
    ReadLocked,
    ReadError,
    ConsentOff,
    NotFound,
}

impl ProbeStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Ready => "ready",
            Self::Stale => "stale",
            Self::EmptyValid => "empty_valid",
            Self::SchemaUnknown => "schema_unknown",
            Self::ReadLocked => "read_locked",
            Self::ReadError => "read_error",
            Self::ConsentOff => "consent_off",
            Self::NotFound => "not_found",
        }
    }
}

pub const PROVIDER_CURSOR: &str = "cursor";
pub const UNKNOWN_PROJECT_ID: &str = "unknown-project";
pub const EVENT_CLASS_OBSERVED: &str = "provider_observed";
pub const EVENT_CLASS_LIFECYCLE: &str = "onetone_lifecycle";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CheckpointDto {
    pub checkpoint_id: String,
    pub session_id: String,
    pub project_id: String,
    pub status: String,
    pub current_task: Option<String>,
    pub changed_files: Vec<String>,
    pub pending_questions: Vec<String>,
    pub next_action: Option<String>,
    pub last_event_id: Option<String>,
    pub created_at: u64,
    pub updated_at: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContinuationBrief {
    pub checkpoint: CheckpointDto,
    pub brief: String,
    pub resumable: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MemoryRecordDto {
    pub memory_id: String,
    pub project_id: String,
    pub session_id: Option<String>,
    pub memory_type: String,
    pub content: String,
    pub source_event_id: Option<String>,
    pub confidence: f32,
    pub created_at: u64,
    pub updated_at: u64,
    pub supersedes_id: Option<String>,
    pub user_authored: bool,
}
