//! OneTone DTOs for session JSONL parse — never re-export agent-sessions types.

use serde::Serialize;
use std::collections::BTreeMap;
use std::path::PathBuf;

/// Adapter projection version — bump when DTO mapping changes (independent of crate version).
pub const ADAPTER_PROJECTION_VERSION: &str = "1.2.0";
pub const FULL_SNAPSHOT_PROFILE_ID: &str = "full_snapshot_v1";

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum FactLayer {
    ProviderFact,
    ParserDerived,
    ProductInference,
}

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum SessionProvider {
    Codex,
    ClaudeCode,
}

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum SessionParseStatus {
    Complete,
    CompleteWithErrors,
    IncompleteTail,
    StoppedEarly,
    Failed,
}

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
pub enum ParseIntent {
    #[default]
    FullSnapshot,
    Preview,
    UsageOnly,
    PrefixVerification,
}

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ParseCoverage {
    pub all_event_kinds: bool,
    pub tool_arguments_included: bool,
    pub tool_results_included: bool,
    pub reached_captured_end: bool,
    pub event_limit_absent: bool,
    pub content_complete: bool,
}

impl ParseCoverage {
    pub fn is_fully_complete(self) -> bool {
        self.all_event_kinds
            && self.tool_arguments_included
            && self.tool_results_included
            && self.reached_captured_end
            && self.event_limit_absent
            && self.content_complete
    }
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq, Hash)]
#[serde(transparent)]
pub struct SourceId(pub String);

impl SourceId {
    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl std::fmt::Display for SourceId {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        self.0.fmt(f)
    }
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq, Hash)]
#[serde(transparent)]
pub struct SessionKey(pub String);

impl SessionKey {
    pub fn as_str(&self) -> &str {
        &self.0
    }
}

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum SessionKeySource {
    ProviderId,
    SourceFallback,
}

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum IdentityEvidence {
    FirstAuthoritativeMeta,
    RepeatedRecord,
    SourceFallback,
    Conflict,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SessionIdentity {
    pub session_key: SessionKey,
    pub source: SessionKeySource,
    pub evidence: IdentityEvidence,
    /// Raw provider id — adapter/store internal only; never IPC.
    #[serde(skip_serializing)]
    pub provider_session_id: Option<String>,
    pub owner_conflict: bool,
}

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum TimestampProvenance {
    ProviderRecord,
    SessionMetadata,
    Missing,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct EventTime {
    pub observed_at_ms: Option<i64>,
    pub provenance: TimestampProvenance,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ParseCompleteness {
    pub parser_status: SessionParseStatus,
    pub intent: ParseIntent,
    pub coverage: ParseCoverage,
    pub unknown_record_count: u64,
    pub ignored_record_count: u64,
    pub line_error_count: u64,
    pub adapter_mapping_error_count: u64,
    pub whole_snapshot_commit_allowed: bool,
    pub unknown_records_present: bool,
    pub ignored_allowlist_violations: u64,
    pub source_changed_during_read: bool,
    pub commit_policy_layer: FactLayer,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct EventIdentity {
    pub source_id: SourceId,
    pub record_index: u64,
    pub event_index: u32,
    pub byte_start: u64,
    pub byte_end: u64,
}

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum MessageRole {
    User,
    Assistant,
    System,
    Developer,
    Unsupported,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct TextSegment {
    pub start: usize,
    pub end: usize,
}

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum TruncationReason {
    MaxEventTextBytes,
    MaxTotalTextBytes,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ContentTruncation {
    pub original_bytes: usize,
    pub retained_bytes: usize,
    pub reason: TruncationReason,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionMetaEvent {
    pub model_observed: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MessageEvent {
    pub role: MessageRole,
    pub text: String,
    pub text_segments: Vec<TextSegment>,
    pub is_sidechain: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub truncation: Option<ContentTruncation>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum ToolArguments {
    Json(serde_json::Value),
    Raw(String),
    Missing,
    Omitted,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolCallEvent {
    pub name: String,
    pub arguments: ToolArguments,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub truncation: Option<ContentTruncation>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum ToolResultContent {
    Present {
        text: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        truncation: Option<ContentTruncation>,
    },
    Omitted,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolResultEvent {
    pub content: ToolResultContent,
    pub is_error: Option<bool>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UnsupportedEvent {
    pub upstream_debug_kind: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum SessionEvent {
    Meta(SessionMetaEvent),
    Message(MessageEvent),
    ToolCall(ToolCallEvent),
    ToolResult(ToolResultEvent),
    Usage(UsageObservation),
    Unsupported(UnsupportedEvent),
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocatedEvent {
    pub identity: EventIdentity,
    pub line_no: u64,
    pub time: EventTime,
    pub record_type: Option<String>,
    pub event: SessionEvent,
    pub layer: FactLayer,
}

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum ProviderUsageSemantics {
    ClaudeExclusive,
    CodexInclusive,
    Unsupported,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UsageObservation {
    pub semantics: ProviderUsageSemantics,
    pub input: Option<u64>,
    pub output: Option<u64>,
    pub cache_read: Option<u64>,
    pub cache_write: Option<u64>,
    pub cache_write_1h: Option<u64>,
    pub reasoning: Option<u64>,
    pub model_present: bool,
    pub any_counter_present: bool,
    pub layer: FactLayer,
}

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum AdapterDiagnosticCode {
    UnsupportedEventVariant,
    UnsupportedTokenSemantics,
    NumericNarrowing,
    InvalidProviderMapping,
    ContentLimit,
    SessionOwnerConflict,
    SourceChangedDuringRead,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AdapterMappingDiagnostic {
    pub code: AdapterDiagnosticCode,
    pub record_index: u64,
    pub event_index: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub detail: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ParseDiagnostic {
    pub kind: String,
    pub line_no: Option<u64>,
    pub byte_start: Option<u64>,
    pub layer: FactLayer,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SourceSnapshot {
    pub provider: SessionProvider,
    pub canonical_source_id: SourceId,
    pub captured_len: u64,
    pub last_complete_byte: u64,
    /// Present when commit-eligible path completed digest (incl. empty SHA-256).
    pub prefix_digest: Option<[u8; 32]>,
    /// File mtime for reindex hints only — never event observed_at.
    pub source_modified_at_ms: Option<u64>,
}

#[derive(Debug, Clone)]
pub struct SessionSource {
    pub provider: SessionProvider,
    pub path: PathBuf,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct EventKindSelection {
    bits: u8,
}

impl EventKindSelection {
    pub const META: Self = Self { bits: 1 };
    pub const MESSAGE: Self = Self { bits: 2 };
    pub const TOOL_CALL: Self = Self { bits: 4 };
    pub const TOOL_RESULT: Self = Self { bits: 8 };
    pub const USAGE: Self = Self { bits: 16 };
    pub const ALL: Self = Self { bits: 31 };

    pub fn union(self, other: Self) -> Self {
        Self {
            bits: self.bits | other.bits,
        }
    }

    pub(crate) fn bits(self) -> u8 {
        self.bits
    }

    pub fn is_all(self) -> bool {
        self.bits == Self::ALL.bits
    }
}

impl Default for EventKindSelection {
    fn default() -> Self {
        Self::ALL
    }
}

#[derive(Debug, Clone)]
pub struct SessionParseOptions {
    pub intent: ParseIntent,
    pub max_file_bytes: u64,
    pub max_line_bytes: u64,
    pub stop_at_byte: Option<u64>,
    pub event_kinds: EventKindSelection,
    pub max_events: Option<usize>,
    pub allow_incomplete_tail: bool,
    pub max_total_text_bytes: usize,
    pub max_event_text_bytes: usize,
    pub include_tool_arguments: bool,
    pub include_tool_results: bool,
}

impl Default for SessionParseOptions {
    fn default() -> Self {
        Self {
            intent: ParseIntent::FullSnapshot,
            max_file_bytes: 200 * 1024 * 1024,
            max_line_bytes: 8 * 1024 * 1024,
            stop_at_byte: None,
            event_kinds: EventKindSelection::ALL,
            max_events: None,
            allow_incomplete_tail: false,
            max_total_text_bytes: 8 * 1024 * 1024,
            max_event_text_bytes: 1024 * 1024,
            include_tool_arguments: true,
            include_tool_results: true,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionParseOutput {
    pub events: Vec<LocatedEvent>,
    pub diagnostics: Vec<ParseDiagnostic>,
    pub mapping_diagnostics: Vec<AdapterMappingDiagnostic>,
    pub completeness: ParseCompleteness,
    pub source_snapshot: SourceSnapshot,
    pub session_identity: SessionIdentity,
    pub ignored_type_histogram: BTreeMap<String, u64>,
    pub unknown_type_histogram: BTreeMap<String, u64>,
}

#[derive(Debug)]
pub enum SessionAdapterError {
    Io(std::io::Error),
    TooLarge {
        limit: u64,
    },
    InvalidOptions(&'static str),
    FatalStream(String),
    Path(String),
    /// The source shrank, or was rewritten at equal length with a changed mtime,
    /// while parsing the frozen prefix. Pure append is accepted; caller retries
    /// only freshness-invalidating changes.
    SourceChangedDuringRead,
}

impl std::fmt::Display for SessionAdapterError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Io(_) => write!(f, "cannot open session file"),
            Self::TooLarge { limit } => write!(f, "session exceeds {limit} byte limit"),
            Self::InvalidOptions(msg) => write!(f, "invalid parse options: {msg}"),
            Self::FatalStream(msg) => write!(f, "fatal stream error: {msg}"),
            Self::Path(msg) => write!(f, "session path error: {msg}"),
            Self::SourceChangedDuringRead => {
                write!(f, "session source changed during read; retry")
            }
        }
    }
}

impl std::error::Error for SessionAdapterError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            Self::Io(e) => Some(e),
            _ => None,
        }
    }
}
