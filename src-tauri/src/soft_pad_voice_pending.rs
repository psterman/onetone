//! Soft Pad voice pending confirm: uncommon phrases wait ~3s before execute.
//! Instant whitelist (beginner closed set) runs immediately — no countdown.

use std::sync::{Arc, LazyLock, Mutex};
use std::time::{Duration, Instant};

use serde::Serialize;
use tauri::AppHandle;

use crate::agent::{action_by_id, RiskLevel};
use crate::AppState;

pub const CONFIRM_MS: u64 = 3000;

#[derive(Debug, Clone)]
pub struct SoftPadVoicePending {
    pub slot_id: String,
    pub action_id: String,
    pub mapping_id: String,
    pub label: String,
    pub created_at: Instant,
    pub expires_at: Instant,
    /// Monotonic generation — timeout thread ignores stale gens after replace/cancel.
    pub gen: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SoftPadVoicePendingPublic {
    pub slot_id: String,
    pub action_id: String,
    pub mapping_id: String,
    pub label: String,
    pub remain_ms: u64,
    pub total_ms: u64,
}

static STORE: LazyLock<Mutex<Option<SoftPadVoicePending>>> = LazyLock::new(|| Mutex::new(None));
static GEN: LazyLock<Mutex<u64>> = LazyLock::new(|| Mutex::new(0));

/// Beginner closed-set — execute immediately (no Soft Pad countdown).
pub fn is_instant_voice_slot(slot_id: &str) -> bool {
    matches!(
        slot_id.trim(),
        "pushToTalk"
            | "stopOrSend"
            | "continue"
            | "newThread"
            | "cancel"
            | "cancelListen"
    )
}

fn action_risk_confirm(action_id: &str) -> bool {
    action_by_id(action_id.trim()).is_some_and(|a| a.risk_level == RiskLevel::Confirm)
}

/// Voice Soft Pad uncommon hit → hang for countdown (Cursor Soft Pad only).
pub fn should_defer_voice(slot_id: &str, action_id: &str) -> bool {
    let slot = slot_id.trim();
    let action = action_id.trim();
    if is_instant_voice_slot(slot) || is_instant_voice_slot(action) {
        return false;
    }
    if crate::codex_numpad_layer::cursor_soft_pad_slot_allowed(slot)
        || crate::codex_numpad_layer::cursor_soft_pad_slot_allowed(action)
    {
        return true;
    }
    // risk=confirm and not closed-set
    action_risk_confirm(action) || (!slot.is_empty() && action_risk_confirm(slot))
}

fn label_for_slot(slot_id: &str, action_id: &str) -> String {
    let key = if slot_id.trim().is_empty() {
        action_id.trim()
    } else {
        slot_id.trim()
    };
    match key {
        "commandPalette" => "命令菜单".into(),
        "quickChat" => "快速聊天".into(),
        "quickSearch" => "快速搜索".into(),
        "undo" => "撤销".into(),
        "toggleSidebar" => "切换边栏".into(),
        "openSettings" => "打开设置".into(),
        "navBack" => "返回".into(),
        "navForward" => "前进".into(),
        "openTerminal" => "打开终端".into(),
        "newBrowserTab" => "浏览器标签".into(),
        "plan" => "Plan 模式".into(),
        "switchAgent" => "Agent 模式".into(),
        "pasteAndSend" => "粘贴发送".into(),
        "summonCodex" => "聚焦应用".into(),
        other => {
            if let Some(a) = action_by_id(other) {
                a.label.zh.to_string()
            } else if other.is_empty() {
                "命令".into()
            } else {
                other.into()
            }
        }
    }
}

pub fn clear() {
    if let Ok(mut g) = STORE.lock() {
        *g = None;
    }
    if let Ok(mut gen) = GEN.lock() {
        *gen = gen.wrapping_add(1);
    }
}

pub fn peek() -> Option<SoftPadVoicePending> {
    let mut g = STORE.lock().ok()?;
    let now = Instant::now();
    if let Some(row) = g.as_ref() {
        if now >= row.expires_at {
            *g = None;
            return None;
        }
    }
    g.clone()
}

pub fn public_snapshot() -> Option<SoftPadVoicePendingPublic> {
    let row = peek()?;
    let now = Instant::now();
    let remain = row
        .expires_at
        .saturating_duration_since(now)
        .as_millis()
        .min(u128::from(CONFIRM_MS)) as u64;
    Some(SoftPadVoicePendingPublic {
        slot_id: row.slot_id,
        action_id: row.action_id,
        mapping_id: row.mapping_id,
        label: row.label,
        remain_ms: remain,
        total_ms: CONFIRM_MS,
    })
}

/// Insert/replace pending and schedule auto-confirm after CONFIRM_MS.
pub fn insert_pending(
    state: &Arc<AppState>,
    app: &AppHandle,
    mapping_id: &str,
    slot_id: &str,
    action_id: &str,
) -> SoftPadVoicePending {
    let gen = {
        let mut g = GEN.lock().unwrap_or_else(|e| e.into_inner());
        *g = g.wrapping_add(1);
        *g
    };
    let now = Instant::now();
    let row = SoftPadVoicePending {
        slot_id: slot_id.trim().to_string(),
        action_id: action_id.trim().to_string(),
        mapping_id: mapping_id.trim().to_string(),
        label: label_for_slot(slot_id, action_id),
        created_at: now,
        expires_at: now + Duration::from_millis(CONFIRM_MS),
        gen,
    };
    if let Ok(mut g) = STORE.lock() {
        *g = Some(row.clone());
    }
    schedule_auto_confirm(Arc::clone(state), app.clone(), gen);
    crate::codex_micro_overlay::request_overlay_push(app, state.as_ref(), false);
    row
}

fn schedule_auto_confirm(state: Arc<AppState>, app: AppHandle, gen: u64) {
    let _ = std::thread::Builder::new()
        .name("soft-pad-voice-pending".into())
        .spawn(move || {
            std::thread::sleep(Duration::from_millis(CONFIRM_MS));
            let _ = confirm_and_run_if_gen(&state, &app, gen);
        });
}

/// Cancel pending if any. Returns true when a pending row was cleared.
pub fn cancel_pending(state: &AppState, app: &AppHandle) -> bool {
    let had = STORE.lock().ok().and_then(|mut g| g.take()).is_some();
    if had {
        if let Ok(mut gen) = GEN.lock() {
            *gen = gen.wrapping_add(1);
        }
        crate::codex_micro_overlay::request_overlay_push(app, state, false);
    }
    had
}

fn take_pending_if_gen(expected: Option<u64>) -> Option<SoftPadVoicePending> {
    let Ok(mut g) = STORE.lock() else {
        return None;
    };
    if let Some(exp) = expected {
        if g.as_ref().map(|r| r.gen) != Some(exp) {
            return None;
        }
    }
    let row = g.take()?;
    if let Ok(mut gen) = GEN.lock() {
        *gen = gen.wrapping_add(1);
    }
    Some(row)
}

/// Take pending and execute via semantic SoftPad/Voice path. Returns true if ran.
pub fn confirm_and_run(state: &Arc<AppState>, app: &AppHandle) -> bool {
    confirm_and_run_if_gen(state, app, {
        // Any current pending (manual confirm / Soft Pad send).
        peek().map(|r| r.gen).unwrap_or(u64::MAX)
    })
}

fn confirm_and_run_if_gen(state: &Arc<AppState>, app: &AppHandle, expected_gen: u64) -> bool {
    let Some(row) = take_pending_if_gen(Some(expected_gen)) else {
        return false;
    };
    let Some(window) = crate::ipc::get_main_window(app) else {
        crate::codex_micro_overlay::request_overlay_push(app, state.as_ref(), false);
        return false;
    };
    // Soft Pad workflow slots that semantic catalog doesn't own.
    if row.slot_id.trim() == "pasteAndSend" || row.action_id.trim() == "pasteAndSend" {
        let ok = crate::cursor_beginner::run_paste_and_send(state, &window);
        crate::app_log::log_line(
            state.as_ref(),
            "soft_pad_voice_pending",
            &format!("confirmed pasteAndSend ok={ok}"),
        );
        crate::codex_micro_overlay::request_overlay_push(app, state.as_ref(), false);
        return ok;
    }
    let result = crate::agent::dispatch::dispatch_semantic_action_ids(
        state,
        &window,
        &row.mapping_id,
        &row.action_id,
        if row.slot_id.is_empty() {
            None
        } else {
            Some(row.slot_id.as_str())
        },
        crate::agent::ActionChannel::Voice,
    );
    let ok = result.ok.unwrap_or(result.status == "executed");
    crate::app_log::log_line(
        state.as_ref(),
        "soft_pad_voice_pending",
        &format!(
            "confirmed slot={} action={} ok={}",
            row.slot_id, row.action_id, ok
        ),
    );
    crate::codex_micro_overlay::request_overlay_push(app, state.as_ref(), false);
    ok
}

/// True when Soft Pad / voice should confirm pending instead of normal send.
pub fn has_pending() -> bool {
    peek().is_some()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn instant_slots_cover_beginner_closed_set() {
        assert!(is_instant_voice_slot("pushToTalk"));
        assert!(is_instant_voice_slot("stopOrSend"));
        assert!(is_instant_voice_slot("continue"));
        assert!(is_instant_voice_slot("newThread"));
        assert!(is_instant_voice_slot("cancel"));
        assert!(is_instant_voice_slot("cancelListen"));
        assert!(!is_instant_voice_slot("plan"));
        assert!(!is_instant_voice_slot("commandPalette"));
        assert!(!is_instant_voice_slot("openSettings"));
        assert!(!is_instant_voice_slot("pasteAndSend"));
    }

    #[test]
    fn uncommon_soft_pad_slots_defer() {
        assert!(should_defer_voice("plan", "plan"));
        assert!(should_defer_voice("pasteAndSend", "pasteAndSend"));
        assert!(should_defer_voice("commandPalette", "commandPalette"));
        assert!(!should_defer_voice("newThread", "newThread"));
        assert!(!should_defer_voice("stopOrSend", "stopOrSendDictation"));
        assert!(!should_defer_voice("continue", "continue"));
    }

    #[test]
    fn clear_drops_pending() {
        clear();
        assert!(peek().is_none());
        if let Ok(mut g) = STORE.lock() {
            *g = Some(SoftPadVoicePending {
                slot_id: "plan".into(),
                action_id: "plan".into(),
                mapping_id: "m1".into(),
                label: "Plan".into(),
                created_at: Instant::now(),
                expires_at: Instant::now() + Duration::from_secs(3),
                gen: 1,
            });
        }
        assert!(peek().is_some());
        clear();
        assert!(peek().is_none());
    }
}
