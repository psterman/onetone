//! Soft Pad usage for shell agents: Qoder / WorkBuddy / Trae.
//!
//! Product contract: official quota aggregation + local burn as auxiliary.
//! Never invent remaining % from local tokens. No Trae SQLCipher / cookie scrape.

#[cfg(windows)]
mod chromium_secret;
mod http;
mod local_usage;
mod models;
mod official;

pub use local_usage::parse_wb_stats_tokens;
pub use official::qoder::{parse_qoder_local_session, parse_qoder_openapi_quota};
pub use official::trae::{decrypt_storage_value, parse_trae_entitlement};
pub use official::workbuddy::{parse_workbuddy_enterprise, parse_workbuddy_personal};

use crate::agent_usage;
use models::REFRESH_SECS;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;
use tauri::AppHandle;

pub fn refresh_once() {
    if !agent_usage::usage_env_enabled() {
        return;
    }
    let qoder_local = local_usage::qoder_local_totals();
    let wb_local = local_usage::workbuddy_local_totals();
    official::qoder::refresh(qoder_local);
    official::workbuddy::refresh(wb_local);
    official::trae::refresh();
}

pub fn start_shell_agent_usage_poll(app: AppHandle, state: std::sync::Arc<crate::AppState>) {
    static STARTED: AtomicBool = AtomicBool::new(false);
    if STARTED.swap(true, Ordering::SeqCst) {
        return;
    }
    let _ = std::thread::Builder::new()
        .name("shell-agent-usage".into())
        .spawn(move || loop {
            refresh_once();
            crate::codex_micro_overlay::request_overlay_push(&app, state.as_ref(), false);
            std::thread::sleep(Duration::from_secs(REFRESH_SECS));
        });
}