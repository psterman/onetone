//! Soft Pad Agent Lane Core — per-session lanes, sticky AG slots, page state.
//! Runtime only: does not write session assignments into mapping.

pub mod app_server_bridge;
pub mod dispatch_lane;
pub mod model;
pub mod nav;
pub mod page;
pub mod slots;
pub mod store;

pub use dispatch_lane::{
    begin_lane_press_lease, end_lane_press_lease, lookup_lane_ticket_by_micro,
    lookup_lane_ticket_by_physical, navigate_lane, physical_lane_micro_key,
    LaneDispatchTicket,
};
pub use model::{
    AgentLane, LaneKey, LaneState, NavigationCapabilities, NavigationTarget, PageKey,
    DONE_VISUAL_TTL_MS, INACTIVE_SLOT_TTL_MS,
};
pub use nav::{resume_claude_lane, resume_codex_lane};
pub use page::{get_page_state, select_lane, selected_lane_id_for_applied, PageSessionState};
pub use store::{acknowledge_lane, ingest_lane_event, public_lanes_for_page, reset_for_test};
