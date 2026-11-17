//! Windows Soft Pad evidence adapter.

use crate::app_identity::foreground_effective_app_target_id;
use crate::soft_pad_runtime::model::{AgentKind, ForegroundEvidence};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::Instant;

static FG_SEQ: AtomicU64 = AtomicU64::new(1);

fn last_external_fg() -> &'static std::sync::Mutex<Option<ForegroundEvidence>> {
    static SLOT: std::sync::OnceLock<std::sync::Mutex<Option<ForegroundEvidence>>> =
        std::sync::OnceLock::new();
    SLOT.get_or_init(|| std::sync::Mutex::new(None))
}

fn read_live_foreground() -> ForegroundEvidence {
    let ident = crate::app_identity::foreground_app_identity();
    let self_fg = ident
        .as_ref()
        .is_some_and(crate::app_identity::is_self_identity);
    let tray_noise = ident
        .as_ref()
        .is_some_and(crate::app_identity::is_tray_open_fg_noise);
    let app_target_id = if self_fg {
        None
    } else {
        foreground_effective_app_target_id()
    };
    let agent_kind = app_target_id
        .as_deref()
        .and_then(AgentKind::from_app_target);
    // ponytail: unidentified windows (no identity) stay on the last page.
    // Upgrade: treat a live HWND with no preset as foreign once exe is stable.
    let foreign_host = ident.is_some() && !self_fg && !tray_noise && agent_kind.is_none();
    ForegroundEvidence {
        agent_kind,
        app_target_id,
        foreign_host,
        observed_at: Instant::now(),
        sequence: FG_SEQ.fetch_add(1, Ordering::Relaxed),
    }
}

pub fn read_foreground_evidence() -> ForegroundEvidence {
    let live = read_live_foreground();
    let mut slot = last_external_fg().lock().ok();
    let prev = slot.as_mut().and_then(|g| g.as_ref()).cloned();
    let (out, next) = resolve_foreground_evidence(live, prev);
    if let Some(g) = slot.as_mut() {
        **g = next;
    }
    out
}

/// Pure sticky: agent/foreign overwrite; self/noise/unidentified keep last real app.
fn resolve_foreground_evidence(
    live: ForegroundEvidence,
    prev: Option<ForegroundEvidence>,
) -> (ForegroundEvidence, Option<ForegroundEvidence>) {
    if live.agent_kind.is_some() || live.foreign_host {
        return (live.clone(), Some(live));
    }
    // OneTone / Explorer / PixPin are not scenes. Keep last real app
    // (Chrome → 通用, Cursor → Cursor) so screenshot/tray FG does not stick.
    if let Some(mut kept) = prev {
        kept.observed_at = Instant::now();
        kept.sequence = live.sequence;
        return (kept.clone(), Some(kept));
    }
    (live, None)
}

/// Last Soft Pad agent preset while OneTone/Soft Pad holds Win32 FG (Esc / click).
/// Oral side-key re-arm must not treat Soft Pad FG as "wrong app".
pub fn last_external_app_target_id() -> Option<String> {
    let slot = last_external_fg().lock().ok()?;
    let prev = slot.as_ref()?;
    prev.app_target_id
        .clone()
        .or_else(|| prev.agent_kind.map(|k| k.app_target_id().to_string()))
}
pub(crate) fn resolve_terminal_child_agent(
    host_exe: &str,
    child_exes: &[&str],
    title: Option<&str>,
) -> Option<AgentKind> {
    if !crate::app_identity::is_terminal_host_exe(host_exe) {
        return None;
    }
    for child in child_exes {
        if crate::app_identity::is_claude_cli_exe(child) {
            return Some(AgentKind::Claude);
        }
    }
    for child in child_exes {
        if crate::app_identity::is_codex_cli_exe(child) {
            return Some(AgentKind::Codex);
        }
    }
    title.and_then(|t| {
        let tl = t.to_ascii_lowercase();
        if tl.contains("claude") {
            Some(AgentKind::Claude)
        } else if tl.contains("codex") {
            Some(AgentKind::Codex)
        } else {
            None
        }
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn terminal_host_exe_classification() {
        assert!(crate::app_identity::is_terminal_host_exe(
            "WindowsTerminal.exe"
        ));
        assert!(crate::app_identity::is_terminal_host_exe("pwsh.exe"));
        assert!(crate::app_identity::is_terminal_host_exe("powershell.exe"));
        assert!(crate::app_identity::is_terminal_host_exe("cmd.exe"));
        assert!(!crate::app_identity::is_terminal_host_exe("Cursor.exe"));
        assert!(!crate::app_identity::is_terminal_host_exe("ChatGPT.exe"));
    }

    #[test]
    fn child_exe_name_matching() {
        assert!(crate::app_identity::is_claude_cli_exe("claude"));
        assert!(crate::app_identity::is_claude_cli_exe("claude.exe"));
        assert!(crate::app_identity::is_claude_cli_exe("Claude Code.exe"));
        assert!(!crate::app_identity::is_claude_cli_exe("notepad.exe"));

        assert!(crate::app_identity::is_codex_cli_exe("codex"));
        assert!(crate::app_identity::is_codex_cli_exe("codex.exe"));
        assert!(!crate::app_identity::is_codex_cli_exe("ChatGPT.exe"));
    }

    #[test]
    fn resolve_terminal_child_agent_claude() {
        assert_eq!(
            resolve_terminal_child_agent("WindowsTerminal.exe", &["node.exe", "claude.exe"], None),
            Some(AgentKind::Claude)
        );
    }

    #[test]
    fn resolve_terminal_child_agent_codex() {
        assert_eq!(
            resolve_terminal_child_agent("pwsh.exe", &["codex.exe"], None),
            Some(AgentKind::Codex)
        );
    }

    #[test]
    fn resolve_terminal_child_agent_non_terminal_host() {
        assert_eq!(
            resolve_terminal_child_agent("Cursor.exe", &["claude.exe"], None),
            None
        );
    }

    #[test]
    fn resolve_terminal_child_agent_title_fallback() {
        assert_eq!(
            resolve_terminal_child_agent("cmd.exe", &[], Some("Codex session")),
            Some(AgentKind::Codex)
        );
        assert_eq!(
            resolve_terminal_child_agent("cmd.exe", &[], Some("Windows PowerShell")),
            None
        );
    }

    #[test]
    fn foreground_evidence_preset_beats_terminal() {
        let preset = AgentKind::from_app_target("claude-code");
        let terminal = resolve_terminal_child_agent("cmd.exe", &["codex.exe"], None);
        let kind = preset.or(terminal);
        assert_eq!(kind, Some(AgentKind::Claude));
    }

    #[test]
    fn pixpin_noise_keeps_cursor_sticky() {
        let cursor = ForegroundEvidence {
            agent_kind: Some(AgentKind::Cursor),
            app_target_id: Some("cursor-chat".into()),
            foreign_host: false,
            observed_at: Instant::now(),
            sequence: 1,
        };
        let (out, next) = resolve_foreground_evidence(cursor.clone(), None);
        assert_eq!(out.agent_kind, Some(AgentKind::Cursor));
        assert_eq!(
            next.as_ref().and_then(|e| e.app_target_id.as_deref()),
            Some("cursor-chat")
        );

        // PixPin: no agent, not foreign_host (noise) → keep Cursor.
        let pixpin = ForegroundEvidence {
            agent_kind: None,
            app_target_id: None,
            foreign_host: false,
            observed_at: Instant::now(),
            sequence: 2,
        };
        let (kept, next2) = resolve_foreground_evidence(pixpin, next);
        assert_eq!(kept.agent_kind, Some(AgentKind::Cursor));
        assert_eq!(kept.sequence, 2);
        assert_eq!(
            next2.as_ref().and_then(|e| e.app_target_id.as_deref()),
            Some("cursor-chat")
        );
    }

    #[test]
    fn foreign_host_still_overwrites_sticky() {
        let cursor = ForegroundEvidence {
            agent_kind: Some(AgentKind::Cursor),
            app_target_id: Some("cursor-chat".into()),
            foreign_host: false,
            observed_at: Instant::now(),
            sequence: 1,
        };
        let (_, prev) = resolve_foreground_evidence(cursor, None);
        let chrome = ForegroundEvidence {
            agent_kind: None,
            app_target_id: None,
            foreign_host: true,
            observed_at: Instant::now(),
            sequence: 3,
        };
        let (out, next) = resolve_foreground_evidence(chrome, prev);
        assert!(out.foreign_host);
        assert!(next.as_ref().is_some_and(|e| e.foreign_host));
    }
}
