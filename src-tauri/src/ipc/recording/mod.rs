mod apply;
mod gesture;
mod hardware;

pub use apply::build_source_from_raw_events;
pub(crate) use apply::{enable_mapping_if_complete, normalize_record_key};
pub(crate) use hardware::{clear_record_guard, normalize_hardware_key};
pub use hardware::{finish_trigger_gesture_capture, handle_hardware_record_key};

#[derive(Debug, Clone)]
pub enum RecordMode {
    Trigger,
    Target,
    AgentBinding,
}

#[derive(Debug, Clone)]
pub struct RecordingTarget {
    pub mapping_id: String,
    pub mode: RecordMode,
}
