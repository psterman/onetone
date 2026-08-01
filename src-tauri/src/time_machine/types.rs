use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentContext {
    pub provider: String,
    pub foreground_app: String,
    pub observed_at: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub external_session_id: Option<String>,
    pub source: String,
    pub confidence: String,
}

impl AgentContext {
    pub fn unknown() -> Self {
        Self {
            provider: "unknown".into(),
            foreground_app: "未知".into(),
            observed_at: chrono_now(),
            external_session_id: None,
            source: "none".into(),
            confidence: "low".into(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RestoreMeta {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub target_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub safety_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OpStats {
    pub changed: u32,
    pub added: u32,
    pub deleted: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TmOp {
    pub id: String,
    pub kind: String,
    pub workspace: String,
    pub git_ref: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub parent_op: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub base_head: Option<String>,
    pub created_at: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
    pub trigger_source: String,
    pub agent_context: AgentContext,
    pub stats: OpStats,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub restore: Option<RestoreMeta>,
    /// Commit SHA (object id)
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub commit: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TmStatus {
    pub level: String,
    pub workspace: String,
    pub recent_workspaces: Vec<String>,
    pub is_git: bool,
    pub dirty_fingerprint: String,
    pub agent_busy: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub block_reason: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tip_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tip_label: Option<String>,
    pub changed_count: u32,
    pub auto_save_enabled: bool,
    pub auto_save_interval_min: u32,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub last_auto_save_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct TmConfig {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub workspace_path: Option<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub recent_workspace_paths: Vec<String>,
    pub auto_save_enabled: bool,
    pub auto_save_interval_min: u32,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub last_auto_save_at: Option<String>,
    #[serde(default, skip_serializing_if = "std::collections::HashMap::is_empty")]
    pub last_auto_save_at_by_workspace: std::collections::HashMap<String, String>,
}

impl Default for TmConfig {
    fn default() -> Self {
        Self {
            workspace_path: None,
            recent_workspace_paths: Vec::new(),
            auto_save_enabled: true,
            auto_save_interval_min: 15,
            last_auto_save_at: None,
            last_auto_save_at_by_workspace: std::collections::HashMap::new(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TmCreateResult {
    pub created: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub skipped_reason: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub op: Option<TmOp>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RestorePreview {
    pub overwrite_count: u32,
    pub delete_count: u32,
    pub keep_note: String,
    pub overwrite_sample: Vec<String>,
    pub delete_sample: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RestoreResult {
    pub ok: bool,
    pub restored_id: String,
    pub safety_id: String,
    pub restore_op_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiffSummary {
    pub stats: OpStats,
    pub files: Vec<DiffFile>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiffFile {
    pub path: String,
    pub status: String,
}

pub fn chrono_now() -> String {
    // Local-ish ISO without extra deps: use UTC via system time formatting
    use std::time::{SystemTime, UNIX_EPOCH};
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    // Rough UTC format; UI can display as-is
    let days = secs / 86400;
    let rem = secs % 86400;
    let h = rem / 3600;
    let m = (rem % 3600) / 60;
    let s = rem % 60;
    // Civil date from days since epoch (approx via algorithm)
    let (y, mo, d) = civil_from_days(days as i64);
    format!("{y:04}-{mo:02}-{d:02}T{h:02}:{m:02}:{s:02}Z")
}

fn civil_from_days(z: i64) -> (i32, u32, u32) {
    // Howard Hinnant algorithm
    let z = z + 719468;
    let era = if z >= 0 { z } else { z - 146096 } / 146097;
    let doe = (z - era * 146097) as u64;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let y = (yoe as i64) + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if m <= 2 { y + 1 } else { y };
    (y as i32, m as u32, d as u32)
}

pub fn new_op_id() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    format!("op-{ms}")
}
