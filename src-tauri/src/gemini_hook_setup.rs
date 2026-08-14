//! Thin alias: Gemini CLI Soft Pad hook install uses shared shell_agent_hook_setup::GEMINI.
//! Marker: --onetone-hook-id gemini-activity-v1. Default path: ~/.gemini/settings.json.

pub use crate::shell_agent_hook_setup::{
    install_confirm, setup_status, uninstall, GEMINI as PROFILE, ShellHookWriteResult,
    ShellHookSetupStatus,
};

pub const HOOK_ID: &str = "gemini-activity-v1";
