//! Action history entry schema.

use serde::{Deserialize, Serialize};

pub const RING_CAPACITY: usize = 500;
pub const MAX_TAIL_LIMIT: usize = 200;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActionHistoryEntry {
    pub id: u64,
    pub ts_ms: u64,
    pub channel: String,
    pub kind: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub action_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mapping_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub provider_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub slot_id: Option<String>,
    pub status: String,
    pub summary: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub detail: Option<String>,
}

impl ActionHistoryEntry {
    pub fn new(
        id: u64,
        ts_ms: u64,
        channel: impl Into<String>,
        kind: impl Into<String>,
        status: impl Into<String>,
        summary: impl Into<String>,
    ) -> Self {
        Self {
            id,
            ts_ms,
            channel: channel.into(),
            kind: kind.into(),
            action_id: None,
            mapping_id: None,
            provider_id: None,
            slot_id: None,
            status: status.into(),
            summary: summary.into(),
            detail: None,
        }
    }
}
