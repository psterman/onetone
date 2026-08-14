//! Thin alias: Copilot CLI Soft Pad hook install uses shared shell_agent_hook_setup::COPILOT.

pub use crate::shell_agent_hook_setup::{
    install_confirm, setup_status, uninstall, COPILOT as PROFILE, ShellHookWriteResult,
    ShellHookSetupStatus,
};

pub const HOOK_ID: &str = "copilot-cli-activity-v1";
