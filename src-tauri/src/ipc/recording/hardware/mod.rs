mod finish;
mod guard;
mod handler;
mod normalize;

pub use finish::finish_trigger_gesture_capture;
pub use handler::handle_hardware_record_key;
pub(crate) use guard::clear_record_guard;
pub(crate) use normalize::normalize_hardware_key;
