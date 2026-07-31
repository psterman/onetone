//! Platform adapters for Soft Pad evidence / execution.

#[cfg(windows)]
pub mod windows;

#[cfg(not(windows))]
pub mod macos;

#[cfg(windows)]
pub use windows::read_foreground_evidence;

#[cfg(not(windows))]
pub use macos::read_foreground_evidence;
