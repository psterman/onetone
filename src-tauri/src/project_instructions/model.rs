//! 项目说明书的类型与常量（Batch A）

use serde::{Deserialize, Serialize};

pub const KIND_DERIVED: &str = "derived";
pub const KIND_SIGNAL: &str = "signal";
pub const KIND_MANUAL: &str = "manual";

pub const SECTION_OVERVIEW: &str = "overview";
pub const SECTION_COMMANDS: &str = "commands";
pub const SECTION_MAP: &str = "map";
pub const SECTION_INVARIANTS: &str = "invariants";
pub const SECTION_BOUNDARIES: &str = "boundaries";
pub const SECTION_GOTCHAS: &str = "gotchas";

pub const ALL_SECTIONS: [&str; 6] = [
    SECTION_OVERVIEW,
    SECTION_COMMANDS,
    SECTION_MAP,
    SECTION_INVARIANTS,
    SECTION_BOUNDARIES,
    SECTION_GOTCHAS,
];

pub const STATUS_PENDING: &str = "pending";
pub const STATUS_ACCEPTED: &str = "accepted";
pub const STATUS_REJECTED: &str = "rejected";
pub const STATUS_STALE: &str = "stale";

pub const MEMORY_TYPE_INSTRUCTION: &str = "instruction";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Candidate {
    pub candidate_id: String,
    pub project_id: String,
    pub kind: String,
    pub section: String,
    pub proposed_content: String,
    pub evidence_json: Option<String>,
    pub confidence: f32,
    pub status: String,
    pub accepted_memory_id: Option<String>,
    pub created_at_ms: u64,
    pub updated_at_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstructionItem {
    pub text: String,
    pub origin_kind: String,
    pub memory_id: String,
    pub confidence: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstructionSection {
    pub key: String,
    pub title: String,
    pub items: Vec<InstructionItem>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectInstructionDoc {
    pub project_id: String,
    pub generated_at_ms: u64,
    pub sections: Vec<InstructionSection>,
}
