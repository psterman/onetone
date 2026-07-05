//! Shared gesture / recording timing constants (single source of truth).

pub const RECORD_LONG_PRESS_MS: u64 = 400;
pub const RECORD_DOUBLE_MS: u64 = 400;

pub const DEFAULT_RUNTIME_LONG_PRESS_MS: u32 = 500;
pub const DEFAULT_RUNTIME_DOUBLE_MS: u32 = 400;

pub const MIN_RUNTIME_LONG_PRESS_MS: u32 = 100;
pub const MIN_RUNTIME_DOUBLE_MS: u32 = 150;

pub const RECORD_MOUSE_SUPPRESS_MS: u64 = 900;
pub const RECORD_GUARD_COOLDOWN_MS: u64 = 450;

pub const MIN_INTERVAL_MS: u32 = 200;
pub const MIN_ENTER_DELAY_MS: u32 = 1000;

pub fn clamp_long_press_ms(ms: u32) -> u32 {
    ms.clamp(MIN_RUNTIME_LONG_PRESS_MS, 10_000)
}

pub fn clamp_double_click_ms(ms: u32) -> u32 {
    ms.clamp(MIN_RUNTIME_DOUBLE_MS, 5_000)
}
