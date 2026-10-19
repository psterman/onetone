mod finish;
mod guard;
mod handler;
mod normalize;

pub use finish::finish_trigger_gesture_capture;
pub(crate) use guard::{clear_record_guard, emit_record_probe};
pub use handler::handle_hardware_record_key;
pub(crate) use normalize::normalize_hardware_key;
