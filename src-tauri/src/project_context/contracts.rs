//! Project Context IPC contracts (Phase2). Absolute paths stay backend-only.

use serde::{Deserialize, Serialize};

pub const SCHEMA_VERSION: u32 = 1;

pub const MAX_FILE_BYTES: u64 = 1024 * 1024;
pub const MAX_EXCERPT_LINES: usize = 200;
pub const MAX_EXCERPT_BYTES: usize = 16 * 1024;
pub const MAX_LIST_DEPTH: usize = 3;
pub const MAX_LIST_WALK: usize = 2000;
pub const MAX_LIST_SHOW: usize = 150;
pub const LIST_TIMEOUT_MS: u64 = 2000;
pub const READ_TIMEOUT_MS: u64 = 3000;
pub const GIT_TIMEOUT_MS: u64 = 3000;
pub const SEARCH_TIMEOUT_MS: u64 = 3000;
pub const MAX_SEARCH_QUERY: usize = 128;
pub const MAX_SEARCH_FILES: usize = 500;
pub const MAX_SEARCH_BYTES: usize = 8 * 1024 * 1024;
pub const MAX_SEARCH_HITS: usize = 30;
pub const MAX_GIT_LIST: usize = 100;
pub const MAX_GIT_PATCH_BYTES: usize = 32 * 1024;
pub const MAX_PASSPORT_SOURCES: usize = 8;
pub const MAX_PASSPORT_SOURCE_BYTES: usize = 64 * 1024;
pub const MAX_PASSPORT_OUT_BYTES: usize = 4 * 1024;
pub const MAX_MATERIAL_ADOPT_BYTES: usize = 16 * 1024;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ContextError {
    ScopeRequired,
    ScopeRevoked,
    WrongOwner,
    InvalidPath,
    Excluded,
    NotFound,
    UnsupportedEncoding,
    TooLarge,
    Changed,
    NotGit,
    GitUnavailable,
    Busy,
    Cancelled,
    Timeout,
    IoError,
    CancelledDialog,
}

impl ContextError {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::ScopeRequired => "scope_required",
            Self::ScopeRevoked => "scope_revoked",
            Self::WrongOwner => "wrong_owner",
            Self::InvalidPath => "invalid_path",
            Self::Excluded => "excluded",
            Self::NotFound => "not_found",
            Self::UnsupportedEncoding => "unsupported_encoding",
            Self::TooLarge => "too_large",
            Self::Changed => "changed",
            Self::NotGit => "not_git",
            Self::GitUnavailable => "git_unavailable",
            Self::Busy => "busy",
            Self::Cancelled => "cancelled",
            Self::Timeout => "timeout",
            Self::IoError => "io_error",
            Self::CancelledDialog => "cancelled",
        }
    }
}

impl std::fmt::Display for ContextError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(self.as_str())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LineRange {
    pub start_line: u32,
    pub end_line: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceRef {
    pub relative_path: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub range: Option<LineRange>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub note: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitMeta {
    pub mode: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub base_oid: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub before_hash: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub after_hash: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EvidenceRecord {
    pub schema_version: u32,
    pub id: String,
    pub scope_id: String,
    pub task_scope_id: String,
    pub kind: String,
    pub label: String,
    /// UI-only relative display path (never absolute).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub display_path: Option<String>,
    /// Outbound-safe relative path + optional line range label.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source_ref: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub relative_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub range: Option<LineRange>,
    pub content: String,
    pub source_version: String,
    #[serde(default)]
    pub source_refs: Vec<SourceRef>,
    pub captured_at: String,
    pub truncated: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub limit_reason: Option<String>,
    pub freshness: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub git: Option<GitMeta>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BudgetUsage {
    pub walked: u32,
    pub shown: u32,
    pub bytes: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub limit_reason: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenArgs {
    pub task_scope_id: String,
    #[serde(default)]
    pub suggested_root: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScopeDto {
    pub scope_id: String,
    pub task_scope_id: String,
    pub display_name: String,
    /// Relative display only — never send absoluteRoot to FE outbound.
    pub display_root: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CloseArgs {
    pub scope_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CancelArgs {
    pub scope_id: String,
    pub request_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QueryArgs {
    pub scope_id: String,
    pub task_scope_id: String,
    pub request_id: String,
    pub query: ContextQuery,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case", rename_all_fields = "camelCase")]
pub enum ContextQuery {
    Passport,
    ListFiles {
        #[serde(default)]
        relative_dir: String,
    },
    ReadExcerpt {
        relative_path: String,
        start_line: u32,
        end_line: u32,
    },
    GitChanges {
        mode: String,
    },
    GitDiff {
        mode: String,
        relative_path: String,
        #[serde(default)]
        expected_version: Option<String>,
    },
    Search {
        literal: String,
        #[serde(default)]
        relative_dir: Option<String>,
    },
    Validate {
        evidence_ids: Vec<String>,
        #[serde(default)]
        records: Vec<EvidenceRecord>,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileListItem {
    pub relative_path: String,
    pub display_path: String,
    pub is_dir: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GitChangeItem {
    pub relative_path: String,
    pub display_path: String,
    pub status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub rename_from: Option<String>,
    pub binary: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub version: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchHit {
    pub relative_path: String,
    pub display_path: String,
    pub line: u32,
    pub preview: String,
    pub source_version: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum QueryPayload {
    Passport {
        record: EvidenceRecord,
    },
    ListFiles {
        items: Vec<FileListItem>,
    },
    ReadExcerpt {
        record: EvidenceRecord,
    },
    GitChanges {
        mode: String,
        items: Vec<GitChangeItem>,
    },
    GitDiff {
        record: EvidenceRecord,
    },
    Search {
        hits: Vec<SearchHit>,
    },
    Validate {
        items: Vec<ValidateItem>,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ValidateItem {
    pub evidence_id: String,
    pub freshness: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reason: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QueryResult {
    pub request_id: String,
    pub scope_id: String,
    pub task_scope_id: String,
    pub result: QueryPayload,
    pub truncated: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub limit_reason: Option<String>,
    pub usage: BudgetUsage,
}

pub fn now_iso() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    format!("{secs}")
}

pub fn content_hash(bytes: &[u8]) -> String {
    use sha2::{Digest, Sha256};
    let mut h = Sha256::new();
    h.update(bytes);
    format!("{:x}", h.finalize())
}
