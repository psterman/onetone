//! Claude CLI session latch + Soft Pad key inject (C1) + Hook approval pending (C2).
//!
//! Does not treat every Terminal/PowerShell as Claude.
//! Does not write v.oai.thstatus / Soft RGB.

use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};

use serde::Serialize;

use crate::app_identity::{self, CLAUDE_CODE_APP_TARGET_ID, CODEX_APP_TARGET_ID};
use crate::codex_micro_overlay::claude_activity_hold;
use crate::pad_status;

const APPROVAL_TIMEOUT: Duration = Duration::from_secs(120);

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClaudeCliSessionLatch {
    pub session_id: String,
    pub cwd: String,
    pub terminal_pid: u32,
    pub hwnd: isize,
    pub last_seen_at: u64,
    /// high | medium | low | none
    pub confidence: String,
    pub reason: String,
    pub terminal_has_claude_child: bool,
    pub claude_app_foreground: bool,
    pub mapping_enabled: bool,
    pub mapping_label: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClaudeCliCanInject {
    pub ok: bool,
    pub confidence: String,
    pub reason: String,
    pub hwnd: isize,
    pub terminal_pid: u32,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClaudeCliInjectResult {
    pub ok: bool,
    pub action: String,
    pub reason: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClaudePendingApproval {
    pub active: bool,
    pub request_id: String,
    pub session_id: String,
    pub created_at_ms: u64,
    pub age_ms: u64,
}

struct PendingInner {
    request_id: String,
    session_id: String,
    created: Instant,
    created_at_ms: u64,
    decision: Option<&'static str>, // allow | deny
}

fn pending_store() -> &'static Mutex<Option<PendingInner>> {
    static S: OnceLock<Mutex<Option<PendingInner>>> = OnceLock::new();
    S.get_or_init(|| Mutex::new(None))
}

fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn is_terminal_host_exe(name: &str) -> bool {
    let n = name.to_ascii_lowercase();
    matches!(
        n.as_str(),
        "windowsterminal.exe"
            | "powershell.exe"
            | "pwsh.exe"
            | "cmd.exe"
            | "bash.exe"
            | "mintty.exe"
    )
}

fn is_claude_exe(name: &str) -> bool {
    let n = name.to_ascii_lowercase();
    n == "claude.exe" || n == "claude code.exe" || n.starts_with("claude")
}

/// True when foreground is a terminal host and a descendant process looks like Claude.
pub fn terminal_has_claude_child() -> bool {
    #[cfg(windows)]
    {
        terminal_has_claude_child_windows()
    }
    #[cfg(not(windows))]
    {
        false
    }
}

#[cfg(windows)]
fn terminal_has_claude_child_windows() -> bool {
    use winapi::um::winuser::{GetForegroundWindow, GetWindowThreadProcessId, IsWindow};

    unsafe {
        let fg = GetForegroundWindow();
        if fg.is_null() || IsWindow(fg) == 0 {
            return false;
        }
        let mut pid = 0u32;
        GetWindowThreadProcessId(fg, &mut pid);
        if pid == 0 {
            return false;
        }
        let Some(exe) = process_exe_name(pid) else {
            return false;
        };
        if !is_terminal_host_exe(&exe) {
            return false;
        }
        process_tree_has_claude(pid)
    }
}

#[cfg(windows)]
fn process_exe_name(pid: u32) -> Option<String> {
    use winapi::um::handleapi::CloseHandle;
    use winapi::um::processthreadsapi::OpenProcess;
    use winapi::um::winbase::QueryFullProcessImageNameW;
    use winapi::um::winnt::{HANDLE, PROCESS_QUERY_LIMITED_INFORMATION};

    unsafe {
        let h: HANDLE = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
        if h.is_null() {
            return None;
        }
        let mut buf = [0u16; 512];
        let mut size = buf.len() as u32;
        let ok = QueryFullProcessImageNameW(h, 0, buf.as_mut_ptr(), &mut size);
        CloseHandle(h);
        if ok == 0 || size == 0 {
            return None;
        }
        let path = String::from_utf16_lossy(&buf[..size as usize]);
        Some(
            path.rsplit(['\\', '/'])
                .next()
                .unwrap_or(path.as_str())
                .to_string(),
        )
    }
}

#[cfg(windows)]
fn process_tree_has_claude(root_pid: u32) -> bool {
    use std::collections::{HashMap, HashSet, VecDeque};
    use winapi::um::handleapi::CloseHandle;
    use winapi::um::tlhelp32::{
        CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W,
        TH32CS_SNAPPROCESS,
    };

    unsafe {
        let snap = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
        if snap.is_null() || snap == winapi::um::handleapi::INVALID_HANDLE_VALUE {
            return false;
        }
        let mut children: HashMap<u32, Vec<u32>> = HashMap::new();
        let mut names: HashMap<u32, String> = HashMap::new();
        let mut pe: PROCESSENTRY32W = std::mem::zeroed();
        pe.dwSize = std::mem::size_of::<PROCESSENTRY32W>() as u32;
        if Process32FirstW(snap, &mut pe) != 0 {
            loop {
                let pid = pe.th32ProcessID;
                let ppid = pe.th32ParentProcessID;
                let name = String::from_utf16_lossy(
                    &pe.szExeFile
                        .iter()
                        .copied()
                        .take_while(|&c| c != 0)
                        .collect::<Vec<_>>(),
                );
                names.insert(pid, name);
                children.entry(ppid).or_default().push(pid);
                if Process32NextW(snap, &mut pe) == 0 {
                    break;
                }
            }
        }
        CloseHandle(snap);

        let mut q = VecDeque::from([root_pid]);
        let mut seen = HashSet::from([root_pid]);
        while let Some(pid) = q.pop_front() {
            if pid != root_pid {
                if let Some(n) = names.get(&pid) {
                    if is_claude_exe(n) {
                        return true;
                    }
                }
            }
            if let Some(kids) = children.get(&pid) {
                for &c in kids {
                    if seen.insert(c) {
                        q.push_back(c);
                    }
                }
            }
        }
        false
    }
}

fn foreground_hwnd_pid() -> (isize, u32) {
    #[cfg(windows)]
    {
        use winapi::um::winuser::{GetForegroundWindow, GetWindowThreadProcessId, IsWindow};
        unsafe {
            let fg = GetForegroundWindow();
            if fg.is_null() || IsWindow(fg) == 0 {
                return (0, 0);
            }
            let mut pid = 0u32;
            GetWindowThreadProcessId(fg, &mut pid);
            (fg as isize, pid)
        }
    }
    #[cfg(not(windows))]
    {
        (0, 0)
    }
}

fn claude_needs_input_now() -> bool {
    let now = now_ms();
    let pad = pad_status::snapshot_at(now);
    if pad.agent.as_deref() == Some("claude")
        && (pad.display_source_label() == "claude_hook"
            || pad.display_source_label() == "claude_app")
        && pad.state == "needs_input"
    {
        return true;
    }
    pad_status::claude_lights::snapshot_active(now)
        .iter()
        .any(|l| l.state == "needs_input")
}

fn claude_running_or_needs() -> bool {
    let now = now_ms();
    let pad = pad_status::snapshot_at(now);
    let primary = pad.agent.as_deref() == Some("claude")
        && matches!(pad.state.as_str(), "running" | "needs_input");
    if primary {
        return true;
    }
    pad_status::claude_lights::snapshot_active(now)
        .iter()
        .any(|l| matches!(l.state.as_str(), "running" | "needs_input"))
}

/// Snapshot latch for diagnose / Soft Pad UI.
pub fn claude_cli_session_latch() -> ClaudeCliSessionLatch {
    let now = now_ms();
    let (hwnd, pid) = foreground_hwnd_pid();
    let fg = app_identity::foreground_app_target_id();
    let claude_app = fg.as_deref() == Some(CLAUDE_CODE_APP_TARGET_ID);
    let has_child = terminal_has_claude_child();
    let activity = claude_activity_hold();
    let pad = pad_status::snapshot_at(now);
    let session_id = pad
        .session_id
        .clone()
        .filter(|_| pad.agent.as_deref() == Some("claude"))
        .unwrap_or_default();

    let (confidence, reason, mapping_enabled, mapping_label) = if claude_app {
        (
            "high",
            "claude_app_foreground",
            true,
            "会话高置信 · 键注入仍须打开「允许高置信时启用」",
        )
    } else if has_child && activity {
        (
            "high",
            "terminal_with_claude_child_and_hook_activity",
            true,
            "会话高置信 · 键注入仍须打开「允许高置信时启用」",
        )
    } else if has_child && !activity {
        (
            "medium",
            "terminal_has_claude_child_but_no_recent_hook",
            false,
            "会话未达高置信 · 有 Claude 子进程但无近期 Hook",
        )
    } else if activity {
        (
            "medium",
            "hook_activity_without_confirmed_claude_focus",
            false,
            "会话未达高置信 · 未确认 Claude CLI 焦点",
        )
    } else if fg.as_deref() == Some(CODEX_APP_TARGET_ID) {
        (
            "none",
            "codex_foreground",
            false,
            "会话未达高置信 · Codex 前台",
        )
    } else {
        (
            "none",
            "no_claude_session",
            false,
            "会话未达高置信 · 未确认 Claude CLI 焦点",
        )
    };

    // C2 pending upgrades UI label.
    let pending = pending_approval_view();
    let mapping_label = if pending.active {
        "Hook 审批通道就绪 · ACT12 允许 / ACT08 拒绝".to_string()
    } else {
        mapping_label.to_string()
    };

    ClaudeCliSessionLatch {
        session_id,
        cwd: String::new(),
        terminal_pid: pid,
        hwnd,
        last_seen_at: now,
        confidence: confidence.into(),
        reason: reason.into(),
        terminal_has_claude_child: has_child,
        claude_app_foreground: claude_app,
        mapping_enabled: mapping_enabled || pending.active,
        mapping_label,
    }
}

pub fn claude_cli_can_inject() -> ClaudeCliCanInject {
    let latch = claude_cli_session_latch();
    let ok = latch.confidence == "high";
    ClaudeCliCanInject {
        ok,
        confidence: latch.confidence.clone(),
        reason: if ok {
            "high_latch".into()
        } else {
            latch.reason.clone()
        },
        hwnd: latch.hwnd,
        terminal_pid: latch.terminal_pid,
    }
}

fn type_digit_and_enter(digit: &str) -> bool {
    let ok1 = crate::keyboard::send_chord(digit, 40);
    std::thread::sleep(Duration::from_millis(50));
    crate::keyboard::send_enter();
    ok1
}

/// C1 keyboard inject. Never writes thstatus.
pub fn claude_cli_inject(action: &str) -> ClaudeCliInjectResult {
    let action = action.trim().to_ascii_lowercase();
    // C2: allow/deny via decide, not key inject.
    if matches!(action.as_str(), "allow" | "deny") {
        return claude_cli_decide(action.as_str());
    }

    if !cli_inject_pref_enabled() {
        return ClaudeCliInjectResult {
            ok: false,
            action: action.clone(),
            reason: "cli_inject_pref_disabled".into(),
        };
    }

    let can = claude_cli_can_inject();
    if !can.ok {
        return ClaudeCliInjectResult {
            ok: false,
            action: action.clone(),
            reason: can.reason,
        };
    }

    let needs = claude_needs_input_now();
    let run_or_need = claude_running_or_needs();

    let (ok, reason) = match action.as_str() {
        "send" => {
            if needs {
                (false, "use_approve_when_needs_input")
            } else {
                crate::keyboard::send_enter();
                (true, "sent_enter")
            }
        }
        "approve" => {
            if !needs {
                (false, "not_needs_input")
            } else {
                (type_digit_and_enter("1"), "typed_1_enter")
            }
        }
        "reject" => {
            if !needs {
                (false, "not_needs_input")
            } else {
                (type_digit_and_enter("3"), "typed_3_enter")
            }
        }
        "cancel" => {
            if !run_or_need {
                (false, "not_running_or_needs_input")
            } else {
                crate::keyboard::send_escape();
                (true, "sent_escape")
            }
        }
        _ => (false, "unknown_action"),
    };

    ClaudeCliInjectResult {
        ok,
        action,
        reason: reason.into(),
    }
}

/// Soft Pad fire intercept for ACT12/ACT08. Returns Some(json) when handled.
/// Only when Applied lane is Claude (or cutover off / no ticket gate).
pub fn try_softpad_fire(
    micro_key_id: &str,
    lane_is_claude: bool,
) -> Option<serde_json::Value> {
    if !lane_is_claude {
        return None;
    }
    let mid = micro_key_id.trim();
    if mid != "ACT12" && mid != "ACT08" {
        return None;
    }

    // C2 pending approval takes priority over key inject (no keyboard).
    let pending = pending_approval_view();
    if pending.active {
        let decide = if mid == "ACT12" { "allow" } else { "deny" };
        let r = claude_cli_decide(decide);
        return Some(serde_json::json!({
            "ok": r.ok,
            "reason": if r.ok { "claude_hook_decision".to_string() } else { r.reason },
            "microKeyId": mid,
            "claudeAction": decide,
            "channel": "hook_approval",
        }));
    }

    if !cli_inject_pref_enabled() {
        return None;
    }

    let can = claude_cli_can_inject();
    if !can.ok {
        return None; // fall through to Codex mapping
    }

    let needs = claude_needs_input_now();
    let action = if mid == "ACT12" {
        if needs {
            "approve"
        } else {
            "send"
        }
    } else if needs {
        "reject"
    } else {
        "cancel"
    };
    let r = claude_cli_inject(action);
    Some(serde_json::json!({
        "ok": r.ok,
        "reason": if r.ok { "claude_cli_inject".to_string() } else { r.reason },
        "microKeyId": mid,
        "claudeAction": action,
        "channel": "key_inject",
    }))
}

/// True when any Codex Soft Pad mapping opted into Claude CLI key inject.
pub fn cli_inject_pref_enabled() -> bool {
    // Read from live config via AppState is hard without handle; use hook cache / scan.
    // Prefer reading VoiceConfig from a process-wide sync — use codex_numpad_layer cache if present.
    crate::codex_numpad_layer::claude_cli_inject_pref_enabled()
}

// ——— C2 pending approval ———

pub fn note_permission_request(session_id: &str, request_id: &str) {
    let id = if request_id.trim().is_empty() {
        format!("pr-{}", now_ms())
    } else {
        request_id.trim().to_string()
    };
    let mut g = pending_store().lock().unwrap();
    *g = Some(PendingInner {
        request_id: id,
        session_id: session_id.trim().to_string(),
        created: Instant::now(),
        created_at_ms: now_ms(),
        decision: None,
    });
}

pub fn pending_approval_view() -> ClaudePendingApproval {
    let mut g = pending_store().lock().unwrap();
    if let Some(p) = g.as_ref() {
        if p.created.elapsed() > APPROVAL_TIMEOUT {
            *g = None;
            return ClaudePendingApproval {
                active: false,
                request_id: String::new(),
                session_id: String::new(),
                created_at_ms: 0,
                age_ms: 0,
            };
        }
        return ClaudePendingApproval {
            active: p.decision.is_none(),
            request_id: p.request_id.clone(),
            session_id: p.session_id.clone(),
            created_at_ms: p.created_at_ms,
            age_ms: now_ms().saturating_sub(p.created_at_ms),
        };
    }
    ClaudePendingApproval {
        active: false,
        request_id: String::new(),
        session_id: String::new(),
        created_at_ms: 0,
        age_ms: 0,
    }
}

pub fn claude_cli_decide(decision: &str) -> ClaudeCliInjectResult {
    let d = match decision.trim().to_ascii_lowercase().as_str() {
        "allow" | "approve" => "allow",
        "deny" | "reject" => "deny",
        _ => {
            return ClaudeCliInjectResult {
                ok: false,
                action: decision.into(),
                reason: "unknown_decision".into(),
            };
        }
    };
    let mut g = pending_store().lock().unwrap();
    let Some(p) = g.as_mut() else {
        return ClaudeCliInjectResult {
            ok: false,
            action: d.into(),
            reason: "no_pending_approval".into(),
        };
    };
    if p.created.elapsed() > APPROVAL_TIMEOUT {
        *g = None;
        return ClaudeCliInjectResult {
            ok: false,
            action: d.into(),
            reason: "pending_expired".into(),
        };
    }
    p.decision = Some(d);
    ClaudeCliInjectResult {
        ok: true,
        action: d.into(),
        reason: "decision_recorded".into(),
    }
}

/// Probe / HTTP long-poll helper: take decision if present (clears pending).
pub fn take_pending_decision() -> Option<&'static str> {
    let mut g = pending_store().lock().unwrap();
    let Some(p) = g.as_mut() else {
        return None;
    };
    if p.created.elapsed() > APPROVAL_TIMEOUT {
        *g = None;
        return None;
    }
    let d = p.decision.take()?;
    *g = None;
    Some(d)
}

#[cfg(test)]
pub fn reset_for_test() {
    *pending_store().lock().unwrap() = None;
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn terminal_host_names() {
        assert!(is_terminal_host_exe("WindowsTerminal.exe"));
        assert!(is_terminal_host_exe("powershell.exe"));
        assert!(!is_terminal_host_exe("claude.exe"));
        assert!(is_claude_exe("claude.exe"));
        assert!(!is_claude_exe("notepad.exe"));
    }

    #[test]
    fn pending_decide_flow() {
        reset_for_test();
        note_permission_request("s1", "r1");
        let v = pending_approval_view();
        assert!(v.active);
        assert_eq!(v.request_id, "r1");
        let r = claude_cli_decide("allow");
        assert!(r.ok);
        assert_eq!(take_pending_decision(), Some("allow"));
        assert!(!pending_approval_view().active);
    }

    #[test]
    fn inject_blocked_without_high_latch() {
        reset_for_test();
        let _g = pad_status::test_lock();
        pad_status::reset_for_test();
        pad_status::claude_lights::reset_for_test();
        // Pref off and/or no FG Claude → cannot inject
        let r = claude_cli_inject("send");
        assert!(!r.ok);
        assert!(
            r.reason == "cli_inject_pref_disabled"
                || r.reason.contains("no_claude")
                || r.reason.contains("latch")
                || !r.reason.is_empty()
        );
    }
}
