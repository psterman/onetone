//! Assist IPC contracts — input/output shapes and fixed reason enum.

use serde::{Deserialize, Serialize};
use serde_json::Value;

pub const SKILL_TASK_ORGANIZE: &str = "task_organize";

pub const MAX_INPUT_BYTES: usize = 96 * 1024;
pub const MAX_RESPONSE_BYTES: usize = 256 * 1024;
pub const MAX_OUTPUT_TOKENS: u32 = 2048;
pub const MAX_FIELD_CHARS: usize = 4000;
pub const MAX_ARRAY_ITEMS: usize = 24;
pub const MAX_ATTEMPTS: u32 = 3;
pub const DEFAULT_DEADLINE_MS: u64 = 30_000;
pub const HARD_DEADLINE_MS: u64 = 90_000;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AssistReason {
    InvalidRequest,
    NoKey,
    NoFreeModel,
    ProviderDisabled,
    RateLimited,
    Timeout,
    Cancelled,
    Offline,
    BadResponse,
    InvalidOutput,
    NotFound,
    DuplicateRequest,
    Internal,
}

impl AssistReason {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::InvalidRequest => "invalid_request",
            Self::NoKey => "no_key",
            Self::NoFreeModel => "no_free_model",
            Self::ProviderDisabled => "provider_disabled",
            Self::RateLimited => "rate_limited",
            Self::Timeout => "timeout",
            Self::Cancelled => "cancelled",
            Self::Offline => "offline",
            Self::BadResponse => "bad_response",
            Self::InvalidOutput => "invalid_output",
            Self::NotFound => "not_found",
            Self::DuplicateRequest => "duplicate_request",
            Self::Internal => "internal",
        }
    }

    pub fn retryable(self) -> bool {
        matches!(self, Self::RateLimited | Self::Timeout | Self::Offline)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CallPolicy {
    FreeOnly,
    AllowMetered,
}

impl Default for CallPolicy {
    fn default() -> Self {
        Self::FreeOnly
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AssistMaterialIn {
    pub id: String,
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub source: String,
    #[serde(default)]
    pub content: Option<String>,
    #[serde(default)]
    pub path: Option<String>,
    #[serde(default)]
    pub cite_mode: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AssistInput {
    #[serde(default)]
    pub draft: String,
    #[serde(default)]
    pub materials: Vec<AssistMaterialIn>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AssistPolicy {
    #[serde(default)]
    pub allowed_providers: Option<Vec<String>>,
    #[serde(default)]
    pub allow_metered: bool,
    #[serde(default)]
    pub call_policy: Option<CallPolicy>,
    #[serde(default)]
    pub max_input_chars: Option<u64>,
    #[serde(default)]
    pub max_output_chars: Option<u64>,
    #[serde(default)]
    pub deadline_ms: Option<u64>,
    #[serde(default)]
    pub send_scope: Option<String>,
}

impl AssistPolicy {
    pub fn effective_call_policy(&self) -> CallPolicy {
        if let Some(p) = self.call_policy {
            return p;
        }
        if self.allow_metered {
            CallPolicy::AllowMetered
        } else {
            CallPolicy::FreeOnly
        }
    }

    pub fn deadline_ms_clamped(&self) -> u64 {
        self.deadline_ms
            .unwrap_or(DEFAULT_DEADLINE_MS)
            .clamp(1_000, HARD_DEADLINE_MS)
    }

    pub fn max_input_bytes(&self) -> usize {
        let chars = self.max_input_chars.unwrap_or(24_000) as usize;
        chars.min(MAX_INPUT_BYTES)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AssistRunRequest {
    pub request_id: String,
    pub skill_id: String,
    pub input: AssistInput,
    #[serde(default)]
    pub policy: AssistPolicy,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AssistUsage {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub input_tokens: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub output_tokens: Option<u64>,
    pub estimated: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AssistFactItem {
    pub text: String,
    #[serde(default)]
    pub kind: String,
    #[serde(default)]
    pub source_ids: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskOrganizeResult {
    pub goal: String,
    #[serde(default)]
    pub facts: Vec<AssistFactItem>,
    #[serde(default)]
    pub constraints: Vec<AssistFactItem>,
    #[serde(default)]
    pub steps: Vec<AssistFactItem>,
    #[serde(default)]
    pub acceptance_criteria: Vec<AssistFactItem>,
    #[serde(default)]
    pub unknowns: Vec<AssistFactItem>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AssistRunResponse {
    pub request_id: String,
    pub ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub skill_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub provider: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub result: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub usage: Option<AssistUsage>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reason: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub retryable: Option<bool>,
    #[serde(default)]
    pub attempts: u32,
}

impl AssistRunResponse {
    pub fn ok_result(
        request_id: &str,
        skill_id: &str,
        provider: &str,
        model_id: &str,
        result: Value,
        usage: AssistUsage,
        attempts: u32,
    ) -> Self {
        Self {
            request_id: request_id.to_string(),
            ok: true,
            skill_id: Some(skill_id.to_string()),
            provider: Some(provider.to_string()),
            model_id: Some(model_id.to_string()),
            result: Some(result),
            usage: Some(usage),
            reason: None,
            retryable: None,
            attempts,
        }
    }

    pub fn fail(request_id: &str, reason: AssistReason, attempts: u32) -> Self {
        Self {
            request_id: request_id.to_string(),
            ok: false,
            skill_id: None,
            provider: None,
            model_id: None,
            result: None,
            usage: None,
            reason: Some(reason.as_str().to_string()),
            retryable: Some(reason.retryable()),
            attempts,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AssistCancelRequest {
    pub request_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AssistCancelResponse {
    pub ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub state: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reason: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AssistReadyStatus {
    pub skill_id: String,
    pub implemented: bool,
    pub ready: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reason: Option<String>,
    pub call_policy: String,
}
