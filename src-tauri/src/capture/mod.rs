//! Smart region capture — freeze, coarse regions, recursive grid, crop to inbox.

pub mod crop;
pub mod grab;
pub mod grid;
pub mod overlay;
pub mod region;
pub mod runtime;
pub mod session;
pub mod types;

pub use grab::peek_fg_client_rect;

pub use runtime::{
    apply_action, begin, cancel, cancel_session_only, confirm_action_and_save, encode_pending,
    get_state, take_confirmed_pending, CapturePublicState, ConfirmResult,
};
pub use types::*;
