//! OneTone candidate DTOs for the PoC adapter layer.
//! These types intentionally do NOT re-export agent-sessions public types.

use serde::Serialize;
use std::collections::BTreeMap;

/// Layer tag: raw provider fact vs parser-derived vs product inference.
#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum FactLayer {
    ProviderFact,
    ParserDerived,
    ProductInference,
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

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ParseCompleteness {
    pub parser_status: SessionParseStatus,
    pub unknown_record_count: u64,
    pub ignored_record_count: u64,
    pub line_error_count: u64,
    /// Product gate: Complete alone is not enough when unknowns are present.
    pub whole_snapshot_commit_allowed: bool,
    pub unknown_records_present: bool,
    /// ProductInference: commit policy over parser_status + unknown counts.
    pub commit_policy_layer: FactLayer,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub layer_note: Option<&'static str>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum SessionEvent {
    Meta { model_observed: bool },
    Message { role: String, text_len: usize },
    ToolCall { name_len: usize },
    ToolResult { text_len: usize },
    Usage(UsageObservation),
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocatedEvent {
    pub record_index: u64,
    pub line_no: u64,
    pub byte_start: u64,
    pub byte_end: u64,
    pub event_index: usize,
    pub has_timestamp: bool,
    pub has_session_id: bool,
    pub record_type: Option<String>,
    pub event: SessionEvent,
    pub layer: FactLayer,
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
pub enum ProviderUsageSemantics {
    ClaudeExclusive,
    CodexInclusive,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ParseDiagnostic {
    pub kind: String,
    pub line_no: Option<u64>,
    pub byte_start: Option<u64>,
    pub layer: FactLayer,
}

#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct CaseResult {
    pub case: String,
    pub ok: bool,
    pub notes: Vec<String>,
    pub parser_status: Option<SessionParseStatus>,
    pub completeness: Option<ParseCompleteness>,
    pub event_kinds: BTreeMap<String, u64>,
    pub diagnostics: Vec<ParseDiagnostic>,
    pub last_complete_byte: Option<u64>,
    pub bytes_read: Option<u64>,
    pub lines: Option<u64>,
    pub emitted_events: u64,
    pub elapsed_ms: u128,
    pub line_limit_hit: bool,
    pub models_observed: Vec<String>,
    pub usage_absent_preserved: Option<bool>,
    pub usage_zero_coerced: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub extra: Option<serde_json::Value>,
}
