//! Lane model types.

use crate::soft_pad_runtime::AgentKind;
use serde::{Deserialize, Serialize};

/// done_unread green visual TTL (ms).
pub const DONE_VISUAL_TTL_MS: u64 = 5 * 60 * 1000;
/// Slot stays reserved after visual idle (ms).
pub const INACTIVE_SLOT_TTL_MS: u64 = 30 * 60 * 1000;

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PageKey {
    pub agent_kind: AgentKind,
    pub mapping_id: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LaneKey {
    pub provider: AgentKind,
    pub workspace_id: String,
    pub session_id: String,
}

impl LaneKey {
    pub fn lane_id(&self) -> String {
        let session = self.session_id.trim();
        if !session.is_empty() {
            // App Server lifecycle notifications do not consistently carry cwd.
            // A provider session id is the stable identity; workspace is metadata.
            return format!("{}:session:{}", self.provider.as_str(), session);
        }
        format!("{}:workspace:{}", self.provider.as_str(), self.workspace_id.trim())
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum LaneState {
    Idle,
    Working,
    NeedsInput,
    DoneUnread,
    DoneAcknowledged,
    ErrorUnread,
    Disconnected,
}

impl LaneState {
    pub fn as_str(self) -> &'static str {
        match self {
            LaneState::Idle => "idle",
            LaneState::Working => "working",
            LaneState::NeedsInput => "needs_input",
            LaneState::DoneUnread => "done_unread",
            LaneState::DoneAcknowledged => "done_acknowledged",
            LaneState::ErrorUnread => "error_unread",
            LaneState::Disconnected => "disconnected",
        }
    }

    pub fn ui_status(self) -> &'static str {
        match self {
            LaneState::Idle | LaneState::DoneAcknowledged | LaneState::Disconnected => "idle",
            LaneState::Working => "running",
            LaneState::NeedsInput => "needs_input",
            LaneState::DoneUnread => "done",
            LaneState::ErrorUnread => "failed",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NavigationTarget {
    #[serde(default)]
    pub cwd: String,
    #[serde(default)]
    pub host_pid: u32,
    #[serde(default)]
    pub terminal_hwnd: u64,
    #[serde(default)]
    pub terminal_title: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NavigationCapabilities {
    pub can_focus_live: bool,
    pub can_resume: bool,
    pub can_open_exact_session: bool,
    pub navigation_confidence: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentLane {
    pub lane_id: String,
    pub key: LaneKey,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub subagent_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    pub state: LaneState,
    pub source: String,
    pub confidence: String,
    pub first_seen_at: u64,
    pub updated_at: u64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub acknowledged_at: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub done_at: Option<u64>,
    pub navigation: NavigationTarget,
    /// Aggregated subagent short labels for Claude session lanes.
    #[serde(default)]
    pub subagent_summary: Vec<String>,
    pub sequence: u64,
}

impl AgentLane {
    pub fn caps(&self) -> NavigationCapabilities {
        let live = live_window_exists(self.navigation.terminal_hwnd);
        let can_resume = !self.key.session_id.is_empty() && !self.navigation.cwd.is_empty();
        NavigationCapabilities {
            can_focus_live: live,
            can_resume,
            can_open_exact_session: can_resume,
            navigation_confidence: if live {
                "high".into()
            } else if can_resume {
                "medium".into()
            } else {
                "low".into()
            },
        }
    }
}

#[cfg(windows)]
pub fn live_window_exists(hwnd: u64) -> bool {
    hwnd != 0 && unsafe { winapi::um::winuser::IsWindow(hwnd as winapi::shared::windef::HWND) != 0 }
}

#[cfg(not(windows))]
pub fn live_window_exists(_hwnd: u64) -> bool {
    false
}
