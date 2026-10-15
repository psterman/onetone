//! Shared runtime workflow: activate target app, focus chat/composer input, start voice.

use std::collections::HashMap;
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{Duration, Instant};

use tauri::{AppHandle, Manager, WebviewWindow};

use crate::AppState;

fn recent_custom_launches() -> &'static Mutex<HashMap<String, Instant>> {
    static MAP: OnceLock<Mutex<HashMap<String, Instant>>> = OnceLock::new();
    MAP.get_or_init(|| Mutex::new(HashMap::new()))
}

/// True if we ShellExecuted this rule within the last few seconds (anti double-open).
fn custom_rule_launched_recently(rule_id: &str, within: Duration) -> bool {
    let Ok(map) = recent_custom_launches().lock() else {
        return false;
    };
    map.get(rule_id).is_some_and(|t| t.elapsed() < within)
}

fn mark_custom_rule_launched(rule_id: &str) {
    if let Ok(mut map) = recent_custom_launches().lock() {
        map.insert(rule_id.to_string(), Instant::now());
    }
}

pub const CURSOR_APP_TARGET_ID: &str = "cursor-chat";
pub const CODEX_APP_TARGET_ID: &str = "codex-chat";
pub const MINIMAX_APP_TARGET_ID: &str = "minimax-chat";
pub const WORKBUDDY_APP_TARGET_ID: &str = "workbuddy-chat";
/// Trae Work (TRAE SOLO). Legacy Soft Pad mappings may still use `trae-chat`.
pub const TRAE_APP_TARGET_ID: &str = "trae-work";
pub const TRAE_CHAT_LEGACY_APP_TARGET_ID: &str = "trae-chat";
/// Trae Code (Trae IDE).
pub const TRAE_CODE_APP_TARGET_ID: &str = "trae-code";
pub const WINDSURF_APP_TARGET_ID: &str = "windsurf-chat";
pub const QODER_APP_TARGET_ID: &str = "qoder-chat";
pub const GEMINI_APP_TARGET_ID: &str = "gemini-cli";
pub const CLINE_APP_TARGET_ID: &str = "cline-chat";
pub const ROO_APP_TARGET_ID: &str = "roo-chat";
pub const OPENCODE_APP_TARGET_ID: &str = "opencode-chat";
pub const COPILOT_CLI_APP_TARGET_ID: &str = "copilot-cli";
pub const COPILOT_VSCODE_APP_TARGET_ID: &str = "copilot-vscode";
pub const AIDER_APP_TARGET_ID: &str = "aider-chat";

#[derive(Debug, Clone, Copy)]
pub struct AppChatProfile {
    pub id: &'static str,
    pub error_prefix: &'static str,
    pub process_names: &'static [&'static str],
    /// When set, the process image path must contain this marker (avoids CLI/extension homonyms).
    pub path_marker: Option<&'static str>,
    pub open_key: Option<&'static str>,
    pub composer_anchor: (f32, f32),
    /// Some apps (Codex) don't expose a focusable UIA composer; a successful click is enough.
    pub accept_click_without_uia: bool,
    /// Keep OneTone hidden this long after sending the voice shortcut so the target app keeps focus.
    pub post_voice_key_ms: u64,
    /// Delay before restoring OneTone after workflow completes.
    pub restore_main_delay_ms: u64,
    /// `%LOCALAPPDATA%`-relative exe paths; used to launch the app when no window is found.
    pub launch_localappdata_rel: &'static [&'static str],
}

const CURSOR_PROFILE: AppChatProfile = AppChatProfile {
    id: CURSOR_APP_TARGET_ID,
    error_prefix: "cursor",
    process_names: &["Cursor.exe"],
    path_marker: None,
    // Cursor Agent / chat composer focus (not Ctrl+L, which is Chat history search).
    open_key: Some("Ctrl+I"),
    // Agent / Chat panel sits on the RIGHT — (0.50, 0.88) hit the code editor and Enter landed mid-doc.
    composer_anchor: (0.84, 0.91),
    accept_click_without_uia: true,
    post_voice_key_ms: 220,
    restore_main_delay_ms: 120,
    launch_localappdata_rel: &["Programs\\Cursor\\Cursor.exe"],
};

const CODEX_PROFILE: AppChatProfile = AppChatProfile {
    id: CODEX_APP_TARGET_ID,
    error_prefix: "codex",
    // Desktop UI process is ChatGPT.exe (package OpenAI.Codex_*); keep Codex.exe for helpers.
    process_names: &["ChatGPT.exe", "Codex.exe"],
    path_marker: Some("OpenAI.Codex"),
    open_key: None,
    composer_anchor: (0.50, 0.92),
    accept_click_without_uia: true,
    post_voice_key_ms: 420,
    restore_main_delay_ms: 380,
    launch_localappdata_rel: &[],
};

const MINIMAX_PROFILE: AppChatProfile = AppChatProfile {
    id: MINIMAX_APP_TARGET_ID,
    error_prefix: "minimax",
    process_names: &[
        "MiniMax Code.exe",
        "MiniMax Code Desktop.exe",
        "MiniMax-Code.exe",
    ],
    // Exe name is distinctive; path markers reject portable installs (E:\MiniMax Code\…).
    path_marker: None,
    open_key: None,
    composer_anchor: (0.50, 0.91),
    accept_click_without_uia: true,
    post_voice_key_ms: 450,
    restore_main_delay_ms: 400,
    launch_localappdata_rel: &["Programs\\MiniMax Code\\MiniMax Code.exe"],
};

const CLAUDE_PROFILE: AppChatProfile = AppChatProfile {
    id: CLAUDE_CODE_APP_TARGET_ID,
    error_prefix: "claude",
    process_names: &["claude.exe", "Claude.exe"],
    path_marker: None,
    open_key: None,
    composer_anchor: (0.50, 0.90),
    accept_click_without_uia: true,
    post_voice_key_ms: 420,
    restore_main_delay_ms: 360,
    launch_localappdata_rel: &[],
};

const WORKBUDDY_PROFILE: AppChatProfile = AppChatProfile {
    id: WORKBUDDY_APP_TARGET_ID,
    error_prefix: "workbuddy",
    process_names: &["WorkBuddy.exe", "CodeBuddy.exe", "codebuddy.exe"],
    // Shell hook apps are identified by process name; avoid over-strict path markers here.
    path_marker: None,
    open_key: None,
    composer_anchor: (0.50, 0.91),
    accept_click_without_uia: true,
    post_voice_key_ms: 420,
    restore_main_delay_ms: 360,
    launch_localappdata_rel: &[],
};

const TRAE_PROFILE: AppChatProfile = AppChatProfile {
    id: TRAE_APP_TARGET_ID,
    error_prefix: "trae",
    // CN builds: TRAE SOLO CN.exe; intl: TRAE SOLO.exe / TraeWork*.
    process_names: &[
        "TRAE SOLO CN.exe",
        "TRAE SOLO.exe",
        "TraeWork.exe",
        "Trae Work.exe",
        "TRAE Work.exe",
        "TraeWork CN.exe",
    ],
    path_marker: None,
    open_key: None,
    composer_anchor: (0.50, 0.91),
    accept_click_without_uia: true,
    post_voice_key_ms: 420,
    restore_main_delay_ms: 360,
    launch_localappdata_rel: &[],
};

const TRAE_CODE_PROFILE: AppChatProfile = AppChatProfile {
    id: TRAE_CODE_APP_TARGET_ID,
    error_prefix: "trae_code",
    // CN: Trae CN.exe; intl: Trae.exe. Do not list Work/SOLO names here.
    process_names: &["Trae CN.exe", "Trae.exe", "trae.exe", "TraeCode.exe"],
    path_marker: None,
    open_key: None,
    // VS Code–style Agent chat sits in the right panel (same as Cursor).
    composer_anchor: (0.72, 0.90),
    accept_click_without_uia: true,
    post_voice_key_ms: 420,
    restore_main_delay_ms: 360,
    launch_localappdata_rel: &[],
};

const WINDSURF_PROFILE: AppChatProfile = AppChatProfile {
    id: WINDSURF_APP_TARGET_ID,
    error_prefix: "windsurf",
    process_names: &["Windsurf.exe", "windsurf.exe"],
    path_marker: None,
    open_key: None,
    composer_anchor: (0.50, 0.91),
    accept_click_without_uia: true,
    post_voice_key_ms: 420,
    restore_main_delay_ms: 360,
    launch_localappdata_rel: &["Programs\\Windsurf\\Windsurf.exe"],
};

const QODER_PROFILE: AppChatProfile = AppChatProfile {
    id: QODER_APP_TARGET_ID,
    error_prefix: "qoder",
    // CN desktop: Qoder CN.exe (E:\Qoder CN); intl: Qoder.exe under LocalAppData.
    process_names: &["Qoder CN.exe", "Qoder.exe", "qoder.exe"],
    path_marker: None,
    open_key: None,
    // Agent / chat panel is right-biased like Cursor / Trae Code.
    composer_anchor: (0.72, 0.90),
    accept_click_without_uia: true,
    post_voice_key_ms: 420,
    restore_main_delay_ms: 360,
    launch_localappdata_rel: &["Programs\\Qoder\\Qoder.exe"],
};

const GEMINI_PROFILE: AppChatProfile = AppChatProfile {
    id: GEMINI_APP_TARGET_ID,
    error_prefix: "gemini",
    process_names: &["gemini.exe"],
    path_marker: None,
    open_key: None,
    composer_anchor: (0.50, 0.92),
    accept_click_without_uia: true,
    post_voice_key_ms: 420,
    restore_main_delay_ms: 360,
    launch_localappdata_rel: &[],
};

const CLINE_PROFILE: AppChatProfile = AppChatProfile {
    id: CLINE_APP_TARGET_ID,
    error_prefix: "cline",
    process_names: &["Code.exe", "Cursor.exe"],
    path_marker: None,
    open_key: None,
    composer_anchor: (0.50, 0.88),
    accept_click_without_uia: true,
    post_voice_key_ms: 420,
    restore_main_delay_ms: 360,
    launch_localappdata_rel: &[],
};

const ROO_PROFILE: AppChatProfile = AppChatProfile {
    id: ROO_APP_TARGET_ID,
    error_prefix: "roo",
    process_names: &["Code.exe", "Cursor.exe"],
    path_marker: None,
    open_key: None,
    composer_anchor: (0.50, 0.88),
    accept_click_without_uia: true,
    post_voice_key_ms: 420,
    restore_main_delay_ms: 360,
    launch_localappdata_rel: &[],
};

const OPENCODE_PROFILE: AppChatProfile = AppChatProfile {
    id: OPENCODE_APP_TARGET_ID,
    error_prefix: "opencode",
    process_names: &["opencode.exe"],
    path_marker: None,
    open_key: None,
    composer_anchor: (0.50, 0.92),
    accept_click_without_uia: true,
    post_voice_key_ms: 420,
    restore_main_delay_ms: 360,
    launch_localappdata_rel: &[],
};

const COPILOT_CLI_PROFILE: AppChatProfile = AppChatProfile {
    id: COPILOT_CLI_APP_TARGET_ID,
    error_prefix: "copilot_cli",
    process_names: &["copilot.exe"],
    path_marker: None,
    open_key: None,
    composer_anchor: (0.50, 0.92),
    accept_click_without_uia: true,
    post_voice_key_ms: 420,
    restore_main_delay_ms: 360,
    launch_localappdata_rel: &[],
};

const COPILOT_VSCODE_PROFILE: AppChatProfile = AppChatProfile {
    id: COPILOT_VSCODE_APP_TARGET_ID,
    error_prefix: "copilot_vscode",
    process_names: &["Code.exe"],
    path_marker: None,
    open_key: None,
    composer_anchor: (0.50, 0.88),
    accept_click_without_uia: true,
    post_voice_key_ms: 420,
    restore_main_delay_ms: 360,
    launch_localappdata_rel: &[],
};

const AIDER_PROFILE: AppChatProfile = AppChatProfile {
    id: AIDER_APP_TARGET_ID,
    error_prefix: "aider",
    process_names: &["aider.exe"],
    path_marker: None,
    open_key: None,
    composer_anchor: (0.50, 0.92),
    accept_click_without_uia: true,
    post_voice_key_ms: 420,
    restore_main_delay_ms: 360,
    launch_localappdata_rel: &[],
};

pub fn profile_for(app_target_id: &str) -> Option<&'static AppChatProfile> {
    match app_target_id {
        CURSOR_APP_TARGET_ID => Some(&CURSOR_PROFILE),
        CODEX_APP_TARGET_ID => Some(&CODEX_PROFILE),
        MINIMAX_APP_TARGET_ID => Some(&MINIMAX_PROFILE),
        CLAUDE_CODE_APP_TARGET_ID => Some(&CLAUDE_PROFILE),
        WORKBUDDY_APP_TARGET_ID => Some(&WORKBUDDY_PROFILE),
        TRAE_APP_TARGET_ID | TRAE_CHAT_LEGACY_APP_TARGET_ID => Some(&TRAE_PROFILE),
        TRAE_CODE_APP_TARGET_ID => Some(&TRAE_CODE_PROFILE),
        WINDSURF_APP_TARGET_ID => Some(&WINDSURF_PROFILE),
        QODER_APP_TARGET_ID => Some(&QODER_PROFILE),
        GEMINI_APP_TARGET_ID => Some(&GEMINI_PROFILE),
        CLINE_APP_TARGET_ID => Some(&CLINE_PROFILE),
        ROO_APP_TARGET_ID => Some(&ROO_PROFILE),
        OPENCODE_APP_TARGET_ID => Some(&OPENCODE_PROFILE),
        COPILOT_CLI_APP_TARGET_ID => Some(&COPILOT_CLI_PROFILE),
        COPILOT_VSCODE_APP_TARGET_ID => Some(&COPILOT_VSCODE_PROFILE),
        AIDER_APP_TARGET_ID => Some(&AIDER_PROFILE),
        _ => None,
    }
}

/// Prefer user-calibrated scheme-B anchor; else built-in profile.
/// Cursor: left-half calibrations hit the code editor — ignore them.
pub fn composer_anchor_for_app(
    app: &AppHandle,
    app_target_id: &str,
    profile: &AppChatProfile,
) -> (f32, f32) {
    composer_anchor_candidates_for_app(app, app_target_id, profile)
        .into_iter()
        .next()
        .unwrap_or(profile.composer_anchor)
}

fn composer_point_usable(app_target_id: &str, x: f32, y: f32) -> bool {
    let _ = y;
    if app_target_id == CURSOR_APP_TARGET_ID && x < CURSOR_AGENT_MIN_X_RATIO {
        return false;
    }
    true
}

/// Statistically preferred composer zones for basic aim (chat vs IDE Agent).
/// Slot 0 UI = 中间; slot 1 UI = 右下.
pub const LAYOUT_CENTER: (f32, f32) = (0.50, 0.90);
pub const LAYOUT_BOTTOM_RIGHT: (f32, f32) = (0.78, 0.90);

/// Active calibrated slot → other slot → profile → layout presets (center / bottom-right).
pub fn composer_anchor_candidates_for_app(
    app: &AppHandle,
    app_target_id: &str,
    profile: &AppChatProfile,
) -> Vec<(f32, f32)> {
    let tid = app_target_id.trim();
    let mut out: Vec<(f32, f32)> = Vec::new();
    let mut push = |p: (f32, f32)| {
        if !composer_point_usable(tid, p.0, p.1) {
            return;
        }
        if out
            .iter()
            .any(|(x, y)| (x - p.0).abs() < 0.001 && (y - p.1).abs() < 0.001)
        {
            return;
        }
        out.push(p);
    };

    if !tid.is_empty() {
        if let Some(state) = app.try_state::<Arc<AppState>>() {
            let cfg = state.cfg.lock();
            if let Some(a) = cfg.voice_end.composer_anchors.get(tid) {
                if let Some(p) = a.active_point() {
                    if tid == CURSOR_APP_TARGET_ID && p.x < CURSOR_AGENT_MIN_X_RATIO {
                        crate::app_log::early_line(
                            "input_aim",
                            &format!(
                                "ignore_left_cursor_anchor x={:.3} y={:.3} (use profile)",
                                p.x, p.y
                            ),
                        );
                    } else {
                        push((p.x, p.y));
                    }
                }
                // Other calibrated slot (2-point scheme).
                for (i, slot) in a.slots.iter().enumerate() {
                    if i == a.active {
                        continue;
                    }
                    if let Some(p) = slot {
                        push((p.x, p.y));
                    }
                }
            }
        }
    }
    push(profile.composer_anchor);
    // Prefer the two common zones: IDE Agent → 右下 first; chat apps → 中间 first.
    let ide_right = profile.composer_anchor.0 >= CURSOR_AGENT_MIN_X_RATIO;
    if ide_right {
        push(LAYOUT_BOTTOM_RIGHT);
        push(LAYOUT_CENTER);
    } else {
        push(LAYOUT_CENTER);
        push(LAYOUT_BOTTOM_RIGHT);
    }
    if out.is_empty() {
        out.push(profile.composer_anchor);
    }
    out
}

/// Cursor Agent / chat composer sits on the right; below this is the code editor.
pub const CURSOR_AGENT_MIN_X_RATIO: f32 = 0.55;

/// Convert absolute screen pixels → client-relative ratios for the app window.
#[cfg(windows)]
pub fn screen_point_to_client_ratio(
    app_target_id: &str,
    screen_x: i32,
    screen_y: i32,
) -> Result<(f32, f32), String> {
    use winapi::shared::windef::POINT;
    use winapi::um::winuser::{GetClientRect, ScreenToClient};

    let profile = profile_for(app_target_id).ok_or_else(|| "unknown_app".to_string())?;
    let (hwnd, _) = ensure_app_window(profile).ok_or_else(|| "window_not_found".to_string())?;
    let mut pt = POINT {
        x: screen_x,
        y: screen_y,
    };
    unsafe {
        if ScreenToClient(hwnd, &mut pt) == 0 {
            return Err("screen_to_client_failed".into());
        }
        let mut rect = std::mem::zeroed();
        if GetClientRect(hwnd, &mut rect) == 0 {
            return Err("get_client_rect_failed".into());
        }
        let w = (rect.right - rect.left).max(1) as f32;
        let h = (rect.bottom - rect.top).max(1) as f32;
        Ok((
            (pt.x as f32 / w).clamp(0.0, 1.0),
            (pt.y as f32 / h).clamp(0.0, 1.0),
        ))
    }
}

#[cfg(not(windows))]
pub fn screen_point_to_client_ratio(
    _app_target_id: &str,
    _screen_x: i32,
    _screen_y: i32,
) -> Result<(f32, f32), String> {
    Err("unsupported_platform".into())
}

/// Focus/launch target so the user can see it under the calibrate overlay.
pub fn prepare_target_for_calibrate(app_target_id: &str) -> Result<(), String> {
    let profile = profile_for(app_target_id).ok_or_else(|| "unknown_app".to_string())?;
    #[cfg(windows)]
    {
        let (hwnd, fresh) =
            ensure_app_window(profile).ok_or_else(|| "window_not_found".to_string())?;
        if fresh {
            std::thread::sleep(Duration::from_millis(1200));
        }
        if !crate::keyboard::focus_window(hwnd) {
            return Err("focus_failed".into());
        }
        std::thread::sleep(Duration::from_millis(120));
        Ok(())
    }
    #[cfg(not(windows))]
    {
        let _ = profile;
        Err("unsupported_platform".into())
    }
}

pub const CLAUDE_CODE_APP_TARGET_ID: &str = "claude-code";

pub use crate::app_identity::foreground_app_target_id;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AppChatWorkflowError {
    NotFound,
    FocusFailed,
    InputNotFound,
    VoiceFailed,
}

impl AppChatWorkflowError {
    pub fn reason(self, prefix: &str) -> String {
        let tail = match self {
            Self::NotFound => "not_found",
            Self::FocusFailed => "focus_failed",
            Self::InputNotFound => "input_not_found",
            Self::VoiceFailed => "voice_failed",
        };
        format!("{prefix}_{tail}")
    }
}

struct MainWindowHideGuard {
    app: AppHandle,
    hidden: bool,
    /// When true, Drop re-shows main (use until target window focus succeeds).
    restore_on_drop: bool,
}

impl MainWindowHideGuard {
    fn maybe_hide(app: &AppHandle) -> Self {
        Self::maybe_hide_inner(app, false)
    }

    /// Hide OneTone but restore it if the caller returns before `disarm_restore`.
    fn maybe_hide_restorable(app: &AppHandle) -> Self {
        Self::maybe_hide_inner(app, true)
    }

    fn maybe_hide_inner(app: &AppHandle, restore_on_drop: bool) -> Self {
        if let Some(state) = app.try_state::<Arc<AppState>>() {
            let setup_open = *state.setup_interaction_active.lock();
            let settings_open = *state.settings_drawer_open.lock();
            let verify_active = state.trigger_verify_listen.lock().is_some();
            let recording_active = *state.recording.lock();
            if setup_open || settings_open || verify_active || recording_active {
                crate::app_log::log_line(
                    state.inner(),
                    "window",
                    &format!(
                        "main window hide blocked source=workflow setup_open={} settings_open={} verify_active={} recording_active={}",
                        setup_open, settings_open, verify_active, recording_active
                    ),
                );
                return Self {
                    app: app.clone(),
                    hidden: false,
                    restore_on_drop: false,
                };
            }
        }
        let hidden = if let Some(main) = crate::ipc::get_main_window(app) {
            let _ = main.run_on_main_thread({
                let w = main.clone();
                move || {
                    let _ = w.hide();
                }
            });
            std::thread::sleep(Duration::from_millis(80));
            if let Some(state) = app.try_state::<Arc<AppState>>() {
                crate::app_log::log_line(
                    state.inner(),
                    "window",
                    "main window hidden source=workflow",
                );
            }
            true
        } else {
            false
        };
        Self {
            app: app.clone(),
            hidden,
            restore_on_drop,
        }
    }

    fn disarm_restore(&mut self) {
        self.restore_on_drop = false;
    }
}

fn restore_main_window(app: &AppHandle) {
    if let Some(main) = crate::ipc::get_main_window(app) {
        let _ = main.run_on_main_thread({
            let w = main.clone();
            move || {
                let _ = w.show();
                let _ = w.unminimize();
                let _ = w.set_focus();
            }
        });
        if let Some(state) = app.try_state::<Arc<AppState>>() {
            crate::app_log::log_line(
                state.inner(),
                "window",
                "main window restored source=workflow_focus_fail",
            );
        }
    }
}

impl Drop for MainWindowHideGuard {
    fn drop(&mut self) {
        if self.restore_on_drop && self.hidden {
            restore_main_window(&self.app);
            return;
        }
        // Soft Pad / voice success path: leave hidden so target keeps FG.
        let _ = (&self.app, self.hidden);
    }
}

#[cfg(not(windows))]
pub fn run_for_target_id(
    _state: &Arc<AppState>,
    _window: &WebviewWindow,
    _mapping_id: &str,
    app_target_id: &str,
    _duration_ms: u32,
) -> Result<String, (String, AppChatWorkflowError)> {
    let profile = profile_for(app_target_id).ok_or((
        "unknown_app_target".to_string(),
        AppChatWorkflowError::NotFound,
    ))?;
    Err((
        profile.error_prefix.to_string(),
        AppChatWorkflowError::NotFound,
    ))
}

#[cfg(windows)]
pub fn run_for_target_id(
    state: &Arc<AppState>,
    window: &WebviewWindow,
    mapping_id: &str,
    app_target_id: &str,
    duration_ms: u32,
) -> Result<String, (String, AppChatWorkflowError)> {
    let profile = profile_for(app_target_id).ok_or((
        "unknown_app_target".to_string(),
        AppChatWorkflowError::NotFound,
    ))?;
    if let Some(voice_key) = {
        let cfg = state.cfg.lock();
        let mapping = cfg.find_mapping_by_id(mapping_id);
        crate::voice_end_runtime::resolve_voice_key_for_mapping(&cfg, mapping)
    } {
        let mapping_targets_app = {
            let cfg = state.cfg.lock();
            cfg.find_mapping_by_id(mapping_id)
                .is_some_and(|m| m.app_target_id.trim() == app_target_id)
        };
        let foreground_matches = foreground_app_target_id().as_deref() == Some(app_target_id);
        if crate::voice_end_runtime::is_hold_to_talk_voice_key(&voice_key)
            && (mapping_targets_app || foreground_matches)
        {
            return run_hold_voice_foreground(state, window, mapping_id, &voice_key, profile);
        }
    }
    run_app_chat_workflow(state, window, mapping_id, profile, duration_ms)
}

#[cfg(windows)]
pub fn run_hold_voice_foreground(
    state: &Arc<AppState>,
    window: &WebviewWindow,
    mapping_id: &str,
    voice_key: &str,
    profile: &AppChatProfile,
) -> Result<String, (String, AppChatWorkflowError)> {
    let app = window.app_handle();
    let prefix = profile.error_prefix;

    // Already holding this chord: ignore duplicate starts (overlay + presence race).
    if crate::voice_end_runtime::held_voice_chord(state.as_ref())
        .is_some_and(|held| crate::key_chord::chords_equivalent(&held, voice_key))
    {
        crate::app_log::log_line(
            state.as_ref(),
            "hold",
            &format!("{prefix} hold already active key={voice_key}"),
        );
        return Ok(format!("{prefix}_hold_active"));
    }

    if crate::voice_end_runtime::session_state(state.as_ref()) == "dictating" {
        crate::voice_end_runtime::handle_trigger_press_while_dictating(state, &app, mapping_id);
        crate::app_log::log_line(
            state.as_ref(),
            "hold",
            &format!("{prefix} hold toggle {mapping_id}"),
        );
        return Ok(format!("{prefix}_hold_toggle"));
    }

    // Native hold-to-talk: inject the app's own voice chord (do not OneTone-dictate).
    // Codex: Ctrl+Shift+D. Cursor: Ctrl+Shift+Space (Voice Mode).
    let native_app_ptt = crate::key_chord::is_hold_to_talk_chord(voice_key)
        && (profile.id == CODEX_APP_TARGET_ID || profile.id == CURSOR_APP_TARGET_ID);
    if native_app_ptt {
        if !crate::voice_end_runtime::begin_hold_voice_chord(state.as_ref(), voice_key) {
            crate::app_log::log_line(
                state.as_ref(),
                "hold",
                &format!("{prefix} hold press failed key={voice_key}"),
            );
            return Err((prefix.to_string(), AppChatWorkflowError::VoiceFailed));
        }
        crate::app_log::log_line(
            state.as_ref(),
            "hold",
            &format!("{prefix} hold start native key={voice_key} mapping={mapping_id}"),
        );
        return Ok(format!("{prefix}_hold_start_native"));
    }

    if !crate::voice_end_runtime::begin_hold_voice_chord(state.as_ref(), voice_key) {
        crate::app_log::log_line(
            state.as_ref(),
            "hold",
            &format!("{prefix} hold press failed key={voice_key}"),
        );
        return Err((prefix.to_string(), AppChatWorkflowError::VoiceFailed));
    }

    if crate::voice_end_runtime::can_enter_dictating(&state.cfg.lock()) {
        crate::voice_end_runtime::enter_dictating(
            state,
            Some(&app),
            mapping_id,
            &format!("{prefix} hold-to-talk"),
        );
    }

    crate::app_log::log_line(
        state.as_ref(),
        "hold",
        &format!("{prefix} hold start key={voice_key} mapping={mapping_id}"),
    );
    Ok(format!("{prefix}_hold_start"))
}

/// True when a visible main window for the app target exists (probe / UI gate).
#[cfg(windows)]
pub fn app_target_window_visible(app_target_id: &str) -> bool {
    profile_for(app_target_id).is_some_and(|p| find_app_window(p).is_some())
}

#[cfg(not(windows))]
pub fn app_target_window_visible(_app_target_id: &str) -> bool {
    false
}

/// Focus / launch the target app window only — no composer UIA.
/// Ensures the window exists **before** hiding OneTone; restores main on focus failure.
#[cfg(windows)]
pub fn focus_app_window_only(
    app: &AppHandle,
    app_target_id: &str,
) -> Result<(), AppChatWorkflowError> {
    let profile = profile_for(app_target_id).ok_or(AppChatWorkflowError::NotFound)?;
    // Resolve hwnd first — never hide OneTone if Cursor/MiniMax is missing.
    let (hwnd, freshly_launched) =
        ensure_app_window(profile).ok_or(AppChatWorkflowError::NotFound)?;
    let mut hide_guard = MainWindowHideGuard::maybe_hide_restorable(app);
    if freshly_launched {
        std::thread::sleep(Duration::from_millis(2200));
    }
    if !crate::keyboard::focus_window(hwnd) {
        return Err(AppChatWorkflowError::FocusFailed);
    }
    hide_guard.disarm_restore();
    std::thread::sleep(Duration::from_millis(80));
    Ok(())
}

#[cfg(not(windows))]
pub fn focus_app_window_only(
    _app: &AppHandle,
    _app_target_id: &str,
) -> Result<(), AppChatWorkflowError> {
    Err(AppChatWorkflowError::NotFound)
}

/// Focus the app composer without starting voice input (AgentAction openAgent / focusComposer).
#[cfg(windows)]
pub fn focus_composer_only(
    app: &AppHandle,
    app_target_id: &str,
    duration_ms: u32,
) -> Result<(), AppChatWorkflowError> {
    let profile = profile_for(app_target_id).ok_or(AppChatWorkflowError::NotFound)?;
    // Locate/launch target before hiding — avoids OneTone stranded in background.
    let (hwnd, freshly_launched) =
        ensure_app_window(profile).ok_or(AppChatWorkflowError::NotFound)?;
    let mut hide_guard = MainWindowHideGuard::maybe_hide_restorable(app);
    if freshly_launched {
        std::thread::sleep(Duration::from_millis(2200));
    }
    if !crate::keyboard::focus_window(hwnd) {
        return Err(AppChatWorkflowError::FocusFailed);
    }
    // Window owns FG — keep OneTone hidden even if composer UIA misses.
    hide_guard.disarm_restore();
    std::thread::sleep(Duration::from_millis(120));
    let anchor = composer_anchor_for_app(app, app_target_id, profile);
    if !focus_chat_input(hwnd, profile, duration_ms, anchor) {
        return Err(AppChatWorkflowError::InputNotFound);
    }
    std::thread::sleep(Duration::from_millis(80));
    Ok(())
}

/// Focus composer then re-click the input so Enter/send lands in the box — not Soft Pad / editor.
/// Soft Pad / voice races often leave FG on Cursor window but caret outside the composer.
/// Requires verified UIA keyboard focus on a high-score Edit/Document — bare click is not enough.
#[cfg(windows)]
pub fn focus_composer_for_send(
    app: &AppHandle,
    app_target_id: &str,
    duration_ms: u32,
) -> Result<(), AppChatWorkflowError> {
    let profile = profile_for(app_target_id).ok_or(AppChatWorkflowError::NotFound)?;
    let candidates = composer_anchor_candidates_for_app(app, app_target_id, profile);
    let anchor = candidates
        .first()
        .copied()
        .unwrap_or(profile.composer_anchor);
    // Resolve hwnd before hide — restore OneTone if window/focus fails.
    let (hwnd, freshly_launched) =
        ensure_app_window(profile).ok_or(AppChatWorkflowError::NotFound)?;
    let _ = force_show_hwnd(hwnd);
    // Elevated Cursor + non-elevated OneTone: UIPI blocks inject. Same elevation is OK.
    if profile.id == CURSOR_APP_TARGET_ID && elevated_inject_blocked(hwnd) {
        let title = crate::app_identity::identity_for_window(hwnd)
            .map(|id| id.window_title)
            .unwrap_or_default();
        crate::app_log::cursor_send_oplog(
            "abort_elevated_before_hide",
            serde_json::json!({
                "appTargetId": app_target_id,
                "title": title,
                "selfElevated": crate::app_identity::current_process_is_elevated(),
            }),
        );
        return Err(AppChatWorkflowError::FocusFailed);
    }
    if freshly_launched {
        std::thread::sleep(Duration::from_millis(2200));
    }
    crate::app_log::cursor_send_oplog(
        "focus_start",
        serde_json::json!({
            "appTargetId": app_target_id,
            "anchor": [anchor.0, anchor.1],
            "candidates": candidates.iter().map(|(x, y)| [*x, *y]).collect::<Vec<_>>(),
            "anchorSource": if (anchor.0 - profile.composer_anchor.0).abs() > 0.001
                || (anchor.1 - profile.composer_anchor.1).abs() > 0.001
            {
                "calibrated"
            } else {
                "profile"
            },
            "openKeyConfigured": profile.open_key,
            "openKeyWillSend": false,
            "freshlyLaunched": freshly_launched,
            "durationMs": duration_ms,
        }),
    );
    // Raise Cursor WHILE OneTone still owns FG (Windows allows giving FG away).
    // Hiding first often leaves desktop FG and Cursor never activates.
    if !crate::keyboard::focus_window(hwnd) || !window_is_foreground_target(hwnd) {
        crate::app_log::cursor_send_oplog(
            "focus_window_failed",
            serde_json::json!({
                "reason": "FocusFailed",
                "visible": window_is_user_visible(hwnd),
                "fgMatch": window_is_foreground_target(hwnd),
            }),
        );
        return Err(AppChatWorkflowError::FocusFailed);
    }
    // Hide after Cursor is FG; restore on Drop unless composer verified.
    let mut hide_guard = MainWindowHideGuard::maybe_hide_restorable(app);
    std::thread::sleep(Duration::from_millis(120));
    // Re-assert FG after hide — desktop sometimes steals it.
    if !crate::keyboard::focus_window(hwnd) || !window_is_foreground_target(hwnd) {
        crate::app_log::cursor_send_oplog(
            "focus_window_failed_after_hide",
            serde_json::json!({
                "reason": "FocusFailed",
                "fgMatch": window_is_foreground_target(hwnd),
            }),
        );
        return Err(AppChatWorkflowError::FocusFailed);
    }

    // open_key (Ctrl+I) only when Agent panel closed — after parking caret on the right.
    // Never send it while the editor has focus (inline edit) or when composer already exists
    // (Ctrl+I toggles the panel shut).
    let mut open_key_sent = false;
    let min_score = uia_min_score_for_send(profile);
    // Cursor Agent box often has empty UIA name (score≈10). Old rule blocked blind
    // accept whenever open_key was set — logs show bestScore=-1 / focusedScore=10 /
    // abort_no_commit every time. After RIGHT-panel click, trust an Edit focus.
    let allow_blind_after_right_click = profile.accept_click_without_uia;
    // Click RIGHT panel composer first. Do NOT send Ctrl+I here: with editor focus,
    // Cursor treats Ctrl+I as inline edit (selects text) instead of Agent composer.
    // Try dual calibrated slots before falling through to screen/UIA.
    let mut click_via = "post";
    let mut post_ok = false;
    let mut post_anchor = anchor;
    for (i, &(ax, ay)) in candidates.iter().enumerate() {
        if crate::keyboard::click_client_relative_via_message(hwnd, ax, ay) {
            post_ok = true;
            post_anchor = (ax, ay);
            if i > 0 {
                click_via = "post_slot";
            }
            break;
        }
    }
    let mut any_click = post_ok;
    crate::app_log::cursor_send_oplog(
        "click_post",
        serde_json::json!({
            "ok": post_ok,
            "anchor": [post_anchor.0, post_anchor.1],
            "minScore": min_score,
        }),
    );
    std::thread::sleep(Duration::from_millis(STABILIZE_AFTER_CLICK_MS));
    let mut probe = uia_focus_chat_input_probe(hwnd, min_score);
    crate::app_log::cursor_send_oplog(
        "uia_after_post",
        serde_json::json!({
            "ok": probe.ok,
            "bestName": probe.best_name,
            "bestScore": probe.best_score,
            "focusedName": probe.focused_name,
            "focusedScore": probe.focused_score,
            "hasKeyboardFocus": probe.has_keyboard_focus,
            "focusedXRatio": probe.focused_x_ratio,
        }),
    );
    // Empty-named Monaco Edit scores ~10 like Agent — only blind-accept if caret is on the RIGHT.
    let can_blind = |p: &UiaFocusProbe| {
        if !(allow_blind_after_right_click
            && p.has_keyboard_focus
            && p.focused_score >= 10
            && !looks_like_scm_input(&p.focused_name)
            && !looks_like_scm_input(&p.best_name)
            && !looks_like_editor_document(&p.focused_name)
            && !looks_like_editor_document(&p.best_name))
        {
            return false;
        }
        if profile.id == CURSOR_APP_TARGET_ID {
            return p
                .focused_x_ratio
                .is_some_and(|x| x >= CURSOR_AGENT_MIN_X_RATIO)
                || name_looks_like_agent_composer(&p.focused_name)
                || name_looks_like_agent_composer(&p.best_name);
        }
        true
    };
    let mut uia_ok = probe.ok && cursor_focus_acceptable(profile.id, &probe);
    if !uia_ok && post_ok && can_blind(&probe) {
        uia_ok = true;
        click_via = "post_accept_edit";
    }
    // Cursor: after right-panel click, retry UIA at low score so empty Agent Edit
    // (score≈10) can win now that SCM "Message…commit" is demoted.
    if !uia_ok && profile.id == CURSOR_APP_TARGET_ID && post_ok {
        let low = uia_focus_chat_input_probe(hwnd, 10);
        crate::app_log::cursor_send_oplog(
            "uia_cursor_low",
            serde_json::json!({
                "ok": low.ok,
                "bestName": low.best_name,
                "bestScore": low.best_score,
                "focusedName": low.focused_name,
                "focusedScore": low.focused_score,
                "hasKeyboardFocus": low.has_keyboard_focus,
                "focusedXRatio": low.focused_x_ratio,
            }),
        );
        if (low.ok || can_blind(&low))
            && !looks_like_editor_document(&low.focused_name)
            && !looks_like_editor_document(&low.best_name)
            && cursor_focus_acceptable(profile.id, &low)
        {
            probe = low;
            uia_ok = true;
            click_via = "post_cursor_low";
        }
    }
    if !uia_ok {
        // Soft Pad should already be click-through (caller guard); try both calibrated slots.
        let mut screen_ok = false;
        let mut screen_anchor = anchor;
        for (i, &pt) in candidates.iter().enumerate() {
            if click_composer_anchor(hwnd, pt) {
                screen_ok = true;
                screen_anchor = pt;
                click_via = if i == 0 { "screen" } else { "screen_slot" };
                break;
            }
        }
        any_click = any_click || screen_ok;
        crate::app_log::cursor_send_oplog(
            "click_screen",
            serde_json::json!({
                "ok": screen_ok,
                "anchor": [screen_anchor.0, screen_anchor.1],
            }),
        );
        std::thread::sleep(Duration::from_millis(STABILIZE_AFTER_CLICK_MS));
        probe = uia_focus_chat_input_probe(hwnd, min_score);
        crate::app_log::cursor_send_oplog(
            "uia_after_screen",
            serde_json::json!({
                "ok": probe.ok,
                "bestName": probe.best_name,
                "bestScore": probe.best_score,
                "focusedName": probe.focused_name,
                "focusedScore": probe.focused_score,
                "hasKeyboardFocus": probe.has_keyboard_focus,
                "focusedXRatio": probe.focused_x_ratio,
            }),
        );
        uia_ok = probe.ok && cursor_focus_acceptable(profile.id, &probe);
        if !uia_ok && screen_ok && can_blind(&probe) {
            uia_ok = true;
            click_via = "screen_accept_edit";
        }
        if !uia_ok && profile.id == CURSOR_APP_TARGET_ID && screen_ok {
            let low = uia_focus_chat_input_probe(hwnd, 10);
            if (low.ok || can_blind(&low))
                && !looks_like_editor_document(&low.focused_name)
                && !looks_like_editor_document(&low.best_name)
                && cursor_focus_acceptable(profile.id, &low)
            {
                probe = low;
                uia_ok = true;
                click_via = "screen_cursor_low";
            }
        }
    }

    // Last resort for Cursor: force profile right-side punch if still on editor.
    if !uia_ok && profile.id == CURSOR_APP_TARGET_ID {
        let forced = profile.composer_anchor;
        let force_ok = crate::keyboard::click_client_relative_via_message(hwnd, forced.0, forced.1);
        any_click = any_click || force_ok;
        std::thread::sleep(Duration::from_millis(STABILIZE_AFTER_CLICK_MS));
        let low = uia_focus_chat_input_probe(hwnd, 10);
        crate::app_log::cursor_send_oplog(
            "click_force_right",
            serde_json::json!({
                "ok": force_ok,
                "anchor": [forced.0, forced.1],
                "focusedXRatio": low.focused_x_ratio,
                "focusedName": low.focused_name,
                "uiaOk": low.ok,
            }),
        );
        if force_ok && (can_blind(&low) || cursor_focus_acceptable(profile.id, &low)) {
            probe = low;
            uia_ok = true;
            click_via = "force_right";
        }
    }

    // Cursor: UIA clickable in the Agent band (same as chat handoff) — fixed anchors miss
    // resized/side-by-side layouts even when the panel is already open.
    if !uia_ok && profile.id == CURSOR_APP_TARGET_ID {
        if uia_click_best_input_in_band(hwnd, 10, CURSOR_AGENT_MIN_X_RATIO, 0.98, 0.62) {
            any_click = true;
            std::thread::sleep(Duration::from_millis(STABILIZE_AFTER_CLICK_MS));
            let low = uia_focus_chat_input_probe(hwnd, 10);
            crate::app_log::cursor_send_oplog(
                "click_uia_band",
                serde_json::json!({
                    "focusedXRatio": low.focused_x_ratio,
                    "focusedName": low.focused_name,
                    "bestScore": low.best_score,
                    "uiaOk": low.ok,
                }),
            );
            if can_blind(&low) || cursor_focus_acceptable(profile.id, &low) {
                probe = low;
                uia_ok = true;
                click_via = "uia_band";
            }
        }
    }

    // Cursor: Agent panel closed → no right-band Edit. Park caret on the right, then
    // Ctrl+I once to open Agent (never while editor-focused; never if composer already ok).
    if !uia_ok && profile.id == CURSOR_APP_TARGET_ID {
        if let Some(open_key) = profile.open_key.filter(|k| !k.trim().is_empty()) {
            let mut parked = false;
            let mut park_pt = anchor;
            for &(ax, ay) in &candidates {
                if crate::keyboard::click_client_relative_via_message(hwnd, ax, ay) {
                    parked = true;
                    park_pt = (ax, ay);
                    break;
                }
            }
            any_click = any_click || parked;
            std::thread::sleep(Duration::from_millis(STABILIZE_AFTER_CLICK_MS));
            let pre = uia_focus_chat_input_probe(hwnd, 10);
            if can_blind(&pre) || cursor_focus_acceptable(profile.id, &pre) {
                probe = pre;
                uia_ok = true;
                click_via = "park_already";
            } else if cursor_right_band_composer_present(hwnd) {
                // Panel open but focus missed — click UIA point; do NOT Ctrl+I (would toggle shut).
                if uia_click_best_input_in_band(hwnd, 10, CURSOR_AGENT_MIN_X_RATIO, 0.98, 0.62) {
                    any_click = true;
                    std::thread::sleep(Duration::from_millis(STABILIZE_AFTER_CLICK_MS));
                    let low = uia_focus_chat_input_probe(hwnd, 10);
                    if can_blind(&low) || cursor_focus_acceptable(profile.id, &low) {
                        probe = low;
                        uia_ok = true;
                        click_via = "uia_band_retry";
                    }
                }
            } else {
                // Panel looks closed. Ctrl+I toggles Agent — only safe after caret is on the
                // RIGHT. Editor-focused Ctrl+I = inline edit / can close an open panel.
                let mut park_ok = parked;
                if !park_ok {
                    for &pt in &candidates {
                        if click_composer_anchor(hwnd, pt) {
                            park_ok = true;
                            park_pt = pt;
                            break;
                        }
                    }
                    any_click = any_click || park_ok;
                    crate::app_log::cursor_send_oplog(
                        "park_screen_fallback",
                        serde_json::json!({
                            "ok": park_ok,
                            "anchor": [park_pt.0, park_pt.1],
                        }),
                    );
                    std::thread::sleep(Duration::from_millis(STABILIZE_AFTER_CLICK_MS));
                }
                let after_park = uia_focus_chat_input_probe(hwnd, 10);
                if can_blind(&after_park) || cursor_focus_acceptable(profile.id, &after_park) {
                    probe = after_park;
                    uia_ok = true;
                    click_via = "park_ready";
                } else {
                    let parked_on_right = after_park
                        .focused_x_ratio
                        .is_some_and(|x| x >= CURSOR_AGENT_MIN_X_RATIO);
                    if !(park_ok && parked_on_right) {
                        crate::app_log::cursor_send_oplog(
                            "skip_open_key_not_parked_right",
                            serde_json::json!({
                                "parkOk": park_ok,
                                "postMessageParked": parked,
                                "focusedXRatio": after_park.focused_x_ratio,
                                "focusedName": after_park.focused_name,
                                "note": "Ctrl+I skipped — would toggle Agent shut or inline-edit",
                            }),
                        );
                    } else {
                        crate::app_log::cursor_send_oplog(
                            "open_key_chord",
                            serde_json::json!({
                                "chord": open_key,
                                "via": "focus_composer_for_send_panel_closed",
                                "note": "open_key only when Agent panel closed",
                                "postMessageParked": parked,
                                "parkOk": park_ok,
                                "focusedXRatio": after_park.focused_x_ratio,
                            }),
                        );
                        if crate::keyboard::send_chord(open_key, duration_ms.max(80)) {
                            open_key_sent = true;
                            std::thread::sleep(Duration::from_millis(STABILIZE_AFTER_OPEN_MS));
                            let _ = crate::keyboard::click_client_relative_via_message(
                                hwnd,
                                profile.composer_anchor.0,
                                profile.composer_anchor.1,
                            );
                            let _ = click_composer_anchor(hwnd, profile.composer_anchor);
                            std::thread::sleep(Duration::from_millis(STABILIZE_AFTER_CLICK_MS));
                            let _ = uia_click_best_input_in_band(
                                hwnd,
                                10,
                                CURSOR_AGENT_MIN_X_RATIO,
                                0.98,
                                0.62,
                            );
                            std::thread::sleep(Duration::from_millis(STABILIZE_AFTER_CLICK_MS));
                            let low = uia_focus_chat_input_probe(hwnd, 10);
                            if can_blind(&low) || cursor_focus_acceptable(profile.id, &low) {
                                probe = low;
                                uia_ok = true;
                                click_via = "open_key";
                            }
                        }
                    }
                }
            }
        }
    }

    // MiniMax / WorkBuddy / Claude: Electron chat rarely exposes UIA Edit.
    // Mirror click_then_confirm — a landed click is enough to Ctrl+V.
    if !uia_ok
        && profile.accept_click_without_uia
        && profile.id != CURSOR_APP_TARGET_ID
        && any_click
    {
        uia_ok = true;
        click_via = "click_accept_no_uia";
    }

    let fg = if crate::app_identity::foreground_is_self() {
        "self"
    } else if crate::app_identity::foreground_effective_app_target_id()
        .as_deref()
        .is_some_and(|id| id == app_target_id)
    {
        "target"
    } else {
        "other"
    };
    // Soft Pad / settings can still report FG=self; trust composer keyboard focus.
    let elevated_hint = elevated_inject_blocked(hwnd)
        || (!crate::app_identity::current_process_is_elevated()
            && title_looks_elevated_cursor(&probe.focused_name));
    let result = if !uia_ok {
        if elevated_hint {
            "FocusFailedElevated"
        } else {
            "FocusFailed"
        }
    } else {
        "Ok"
    };
    crate::app_log::cursor_send_oplog(
        "focus_result",
        serde_json::json!({
            "result": result,
            "uiaOk": uia_ok,
            "clickVia": click_via,
            "fg": fg,
            "openKeySent": open_key_sent,
            "elevatedHint": elevated_hint,
            "bestName": probe.best_name,
            "bestScore": probe.best_score,
            "focusedName": probe.focused_name,
            "hasKeyboardFocus": probe.has_keyboard_focus,
            "focusedXRatio": probe.focused_x_ratio,
        }),
    );

    if !uia_ok {
        // Keep restore_on_drop — OneTone must come back when Cursor never got composer.
        return Err(AppChatWorkflowError::FocusFailed);
    }
    hide_guard.disarm_restore();
    Ok(())
}

/// True when hwnd is visible and owns (or shares process with) the foreground window.
#[cfg(windows)]
fn window_is_foreground_target(hwnd: winapi::shared::windef::HWND) -> bool {
    use winapi::um::winuser::{GetForegroundWindow, GetWindowThreadProcessId, IsIconic, IsWindowVisible};
    unsafe {
        if hwnd.is_null() || IsWindowVisible(hwnd) == 0 || IsIconic(hwnd) != 0 {
            return false;
        }
        let fg = GetForegroundWindow();
        if fg.is_null() {
            return false;
        }
        if fg == hwnd {
            return true;
        }
        let mut fg_pid = 0u32;
        let mut target_pid = 0u32;
        GetWindowThreadProcessId(fg, &mut fg_pid);
        GetWindowThreadProcessId(hwnd, &mut target_pid);
        fg_pid != 0 && fg_pid == target_pid
    }
}

/// Cursor window title appends `[Administrator]` / `[管理员]` when elevated — UIPI blocks inject.
#[cfg(windows)]
fn title_looks_elevated_cursor(name: &str) -> bool {
    let lower = name.to_ascii_lowercase();
    lower.contains("[administrator]")
        || name.contains("[管理员]")
        || lower.contains("administrator]")
}

/// Cursor elevated while OneTone is not — inject will fail (UIPI).
#[cfg(windows)]
fn elevated_inject_blocked(hwnd: winapi::shared::windef::HWND) -> bool {
    if crate::app_identity::current_process_is_elevated() {
        return false;
    }
    crate::app_identity::identity_for_window(hwnd)
        .is_some_and(|id| title_looks_elevated_cursor(&id.window_title))
}

/// True when Cursor looks elevated and OneTone is not (handoff toast / detail).
#[cfg(windows)]
pub fn cursor_window_looks_elevated() -> bool {
    if crate::app_identity::current_process_is_elevated() {
        return false;
    }
    find_app_window(&CURSOR_PROFILE)
        .and_then(|hwnd| crate::app_identity::identity_for_window(hwnd))
        .is_some_and(|id| title_looks_elevated_cursor(&id.window_title))
}

#[cfg(not(windows))]
pub fn cursor_window_looks_elevated() -> bool {
    false
}

#[cfg(windows)]
fn name_looks_like_agent_composer(name: &str) -> bool {
    let lower = name.to_ascii_lowercase();
    lower.contains("agent")
        || lower.contains("chat")
        || lower.contains("composer")
        || lower.contains("ask")
        || lower.contains("prompt")
}

/// Cursor: reject focus that landed in the left/center editor pane.
#[cfg(windows)]
fn cursor_focus_acceptable(profile_id: &str, probe: &UiaFocusProbe) -> bool {
    if profile_id != CURSOR_APP_TARGET_ID {
        return probe.ok;
    }
    if !probe.ok && !probe.has_keyboard_focus {
        return false;
    }
    if looks_like_editor_document(&probe.focused_name)
        || looks_like_editor_document(&probe.best_name)
    {
        return false;
    }
    if name_looks_like_agent_composer(&probe.focused_name)
        || name_looks_like_agent_composer(&probe.best_name)
    {
        return true;
    }
    // Empty Agent Edit has no name — require right-half geometry.
    probe
        .focused_x_ratio
        .is_some_and(|x| x >= CURSOR_AGENT_MIN_X_RATIO)
}

#[cfg(windows)]
fn looks_like_scm_input(name: &str) -> bool {
    let lower = name.to_ascii_lowercase();
    lower.contains("commit") || lower.contains("source control") || lower.contains("scm")
}

/// VS Code / Cursor editor surfaces (not Agent/Chat composer).
/// Field logs:
/// - tab `input-aim-calibrate-3ways.html - … - Cursor` (+40 from substring "input")
/// - a11y banner `The editor is not accessible… Shift+Alt+F1` (Edit +10 → uia_cursor_low)
fn looks_like_editor_document(name: &str) -> bool {
    let n = name.trim();
    if n.is_empty() {
        return false;
    }
    // Composer names are short; editor a11y / chat transcript / tab titles are long.
    if n.chars().count() > 80 {
        return true;
    }
    let lower = n.to_ascii_lowercase();
    if lower.contains(" - cursor") || lower.contains(" — cursor") {
        return true;
    }
    if lower.contains("untracked") {
        return true;
    }
    // Cursor/VS Code editor accessibility status — not a chat box.
    if lower.contains("editor is not accessible")
        || lower.contains("screen reader optimized")
        || lower.contains("shift+alt+f1")
    {
        return true;
    }
    // Tab title often ends with "file.ext - folder - Cursor"
    const EXTS: &[&str] = &[
        ".html", ".htm", ".js", ".ts", ".tsx", ".jsx", ".rs", ".py", ".css", ".json", ".md",
        ".vue", ".go", ".toml", ".yml", ".yaml", ".scss", ".less",
    ];
    EXTS.iter().any(|ext| lower.contains(ext))
}

#[cfg(windows)]
fn uia_min_score_for_send(profile: &AppChatProfile) -> i32 {
    // Align with normal composer focus — 70 rejected real Cursor Agent boxes after Soft Pad races.
    uia_min_score(profile)
}

#[cfg(not(windows))]
pub fn focus_composer_only(
    _app: &AppHandle,
    _app_target_id: &str,
    _duration_ms: u32,
) -> Result<(), AppChatWorkflowError> {
    Err(AppChatWorkflowError::NotFound)
}

#[cfg(not(windows))]
pub fn focus_composer_for_send(
    app: &AppHandle,
    app_target_id: &str,
    duration_ms: u32,
) -> Result<(), AppChatWorkflowError> {
    focus_composer_only(app, app_target_id, duration_ms)
}

/// Homepage handoff for chat-first apps (MiniMax / WorkBuddy / …).
/// PostMessage clicks do not focus Electron webviews — use screen clicks + optional UIA
/// clickable point. Cold start: poll until main UI + composer exist, then paste.
#[cfg(windows)]
pub fn focus_chat_app_and_paste(
    app: &AppHandle,
    app_target_id: &str,
    duration_ms: u32,
) -> Result<String, AppChatWorkflowError> {
    let profile = profile_for(app_target_id).ok_or(AppChatWorkflowError::NotFound)?;
    let (hwnd0, freshly_launched) =
        ensure_app_window(profile).ok_or(AppChatWorkflowError::NotFound)?;
    let mut hide_guard = MainWindowHideGuard::maybe_hide_restorable(app);

    // Cold start: first HWND is often splash — wait for main chrome + composer.
    let ready_budget_ms: u64 = if freshly_launched { 12_000 } else { 2_500 };
    if freshly_launched {
        std::thread::sleep(Duration::from_millis(2_800));
    }
    if !crate::keyboard::focus_window(hwnd0) {
        crate::app_log::cursor_send_oplog(
            "chat_handoff_focus_failed",
            serde_json::json!({ "appTargetId": app_target_id }),
        );
        return Err(AppChatWorkflowError::FocusFailed);
    }

    let (hwnd, ready_via) =
        wait_chat_ui_ready(profile, hwnd0, freshly_launched, ready_budget_ms);
    hide_guard.disarm_restore();
    crate::app_log::cursor_send_oplog(
        "chat_handoff_ready",
        serde_json::json!({
            "appTargetId": app_target_id,
            "freshlyLaunched": freshly_launched,
            "readyVia": ready_via,
            "budgetMs": ready_budget_ms,
        }),
    );

    let candidates = composer_anchor_candidates_for_app(app, app_target_id, profile);
    let is_minimax = profile.id == MINIMAX_APP_TARGET_ID;
    let is_workbuddy = profile.id == WORKBUDDY_APP_TARGET_ID;
    let _ = duration_ms;
    // Short hold — long Ctrl+V hold autorepeats paste in Electron composers.
    const PASTE_HOLD_MS: u32 = 40;

    crate::app_log::cursor_send_oplog(
        "chat_handoff_anchors",
        serde_json::json!({
            "appTargetId": app_target_id,
            "candidates": candidates.iter().map(|(x, y)| [*x, *y]).collect::<Vec<_>>(),
        }),
    );

    // MiniMax CEF exposes zero Edit controls — only a full-window Document.
    // UIA click/SetValue lands in the page chrome, not the chat box.
    if is_minimax {
        return minimax_click_and_paste(profile, hwnd, freshly_launched, ready_via, &candidates);
    }

    // Electron / VS Code forks: UIA SetValue often hits editor/search — click then inject.
    let replace_paste = matches!(
        profile.id,
        WORKBUDDY_APP_TARGET_ID
            | CODEX_APP_TARGET_ID
            | TRAE_APP_TARGET_ID
            | TRAE_CHAT_LEGACY_APP_TARGET_ID
            | TRAE_CODE_APP_TARGET_ID
            | QODER_APP_TARGET_ID
    );
    let ide_right_chat = matches!(
        profile.id,
        TRAE_CODE_APP_TARGET_ID | QODER_APP_TARGET_ID | CURSOR_APP_TARGET_ID
    );
    let mut click_via = "none".to_string();
    let mut hwnd_now = hwnd;

    if is_workbuddy {
        hwnd_now = find_app_window(profile).unwrap_or(hwnd);
        if !prepare_chat_hwnd(hwnd_now, if freshly_launched { 3_500 } else { 1_200 }) {
            return Err(AppChatWorkflowError::FocusFailed);
        }
        std::thread::sleep(Duration::from_millis(if freshly_launched { 400 } else { 180 }));
        let _ = crate::keyboard::focus_window(hwnd_now);
        std::thread::sleep(Duration::from_millis(140));
        // Only click when OneTone still owns FG — otherwise keep WorkBuddy caret.
        if crate::app_identity::foreground_is_self() {
            click_via =
                click_chat_composer(hwnd_now, &candidates, profile.composer_anchor, false);
            crate::app_log::cursor_send_oplog(
                "chat_handoff_click_attempt",
                serde_json::json!({
                    "appTargetId": app_target_id,
                    "attempt": 0,
                    "clickVia": click_via,
                    "client": client_size(hwnd_now),
                }),
            );
            if click_via == "none" {
                return Err(AppChatWorkflowError::FocusFailed);
            }
            std::thread::sleep(Duration::from_millis(120));
        } else {
            click_via = "noclick".into();
        }
    } else {
        let click_attempts: u32 = if freshly_launched { 4 } else { 2 };
        for attempt in 0..click_attempts {
            hwnd_now = find_app_window(profile).unwrap_or(hwnd);
            let _ = prepare_chat_hwnd(hwnd_now, 1_200);
            std::thread::sleep(Duration::from_millis(if attempt == 0 { 200 } else { 320 }));

            click_via =
                click_chat_composer(hwnd_now, &candidates, profile.composer_anchor, ide_right_chat);
            crate::app_log::cursor_send_oplog(
                "chat_handoff_click_attempt",
                serde_json::json!({
                    "appTargetId": app_target_id,
                    "attempt": attempt,
                    "clickVia": click_via,
                    "ideRight": ide_right_chat,
                    "client": client_size(hwnd_now),
                }),
            );
            if click_via != "none" {
                if click_via == "uia_clickable"
                    || click_via.starts_with("screen_")
                    || client_size(hwnd_now).is_some_and(|(w, h)| w >= 400 && h >= 280)
                {
                    break;
                }
                click_via = "none".into();
            }
        }

        if click_via == "none" {
            return Err(AppChatWorkflowError::FocusFailed);
        }

        if crate::app_identity::foreground_is_self() {
            let _ = crate::keyboard::focus_window(hwnd_now);
            std::thread::sleep(Duration::from_millis(100));
            // Re-click once so Ctrl+V lands in composer, not OneTone / editor chrome.
            let _ = click_chat_composer(hwnd_now, &candidates, profile.composer_anchor, ide_right_chat);
            std::thread::sleep(Duration::from_millis(160));
        } else {
            std::thread::sleep(Duration::from_millis(120));
        }
    }

    // Re-assert target FG — Soft Pad hide can race and steal focus before inject.
    if crate::app_identity::foreground_is_self() {
        let _ = crate::keyboard::focus_window(hwnd_now);
        std::thread::sleep(Duration::from_millis(120));
    }
    // Long prompts: save md backup before inject so upload path survives a truncate.
    let clip_for_backup = crate::agent::insert_text::read_clipboard_unicode().unwrap_or_default();
    let md_path = write_handoff_md_backup(app_target_id, &clip_for_backup);
    // Prefer send_text / Ctrl+V over UIA SetValue for Electron / IDE chat panels.
    let (pasted, paste_via) = if replace_paste {
        electron_replace_paste(PASTE_HOLD_MS)
    } else {
        paste_into_chat_composer(hwnd_now, false)
    };
    crate::app_log::cursor_send_oplog(
        "chat_handoff_paste",
        serde_json::json!({
            "appTargetId": app_target_id,
            "ok": pasted,
            "clickVia": click_via,
            "pasteVia": paste_via,
            "pasteHoldMs": PASTE_HOLD_MS,
            "freshlyLaunched": freshly_launched,
            "readyVia": ready_via,
            "handoffMd": md_path.as_ref().map(|p| p.to_string_lossy().to_string()),
        }),
    );
    let md_suffix = md_path
        .as_ref()
        .map(|p| format!(":handoff_md={}", p.to_string_lossy()))
        .unwrap_or_default();
    if pasted {
        std::thread::sleep(Duration::from_millis(80));
        Ok(format!(
            "chat_pasted:{app_target_id}:{click_via}:{paste_via}:ready={ready_via}{md_suffix}"
        ))
    } else if !md_suffix.is_empty() {
        // Paste missed but md on disk — report partial so UI can point at the file.
        Ok(format!(
            "chat_paste_miss:{app_target_id}:{click_via}:{paste_via}:paste=false{md_suffix}"
        ))
    } else {
        Err(AppChatWorkflowError::FocusFailed)
    }
}

#[cfg(not(windows))]
pub fn focus_chat_app_and_paste(
    _app: &AppHandle,
    _app_target_id: &str,
    _duration_ms: u32,
) -> Result<String, AppChatWorkflowError> {
    Err(AppChatWorkflowError::NotFound)
}

#[cfg(windows)]
fn client_size(hwnd: winapi::shared::windef::HWND) -> Option<(i32, i32)> {
    use winapi::shared::windef::RECT;
    use winapi::um::winuser::GetClientRect;
    let mut rect = RECT {
        left: 0,
        top: 0,
        right: 0,
        bottom: 0,
    };
    if unsafe { GetClientRect(hwnd, &mut rect) } == 0 {
        return None;
    }
    let w = rect.right - rect.left;
    let h = rect.bottom - rect.top;
    if w <= 0 || h <= 0 {
        None
    } else {
        Some((w, h))
    }
}

#[cfg(windows)]
fn wait_client_min_size(
    hwnd: winapi::shared::windef::HWND,
    min_w: i32,
    min_h: i32,
    timeout_ms: u64,
) -> bool {
    let steps = (timeout_ms / 50).max(1);
    for _ in 0..steps {
        if client_size(hwnd).is_some_and(|(w, h)| w >= min_w && h >= min_h) {
            return true;
        }
        std::thread::sleep(Duration::from_millis(50));
    }
    false
}

/// MiniMax (and similar CEF apps) keep a full-size HWND with IsWindowVisible=0 after
/// "close". SW_SHOW alone is not always enough — prefer SHORNORMAL + verify visible.
#[cfg(windows)]
fn force_show_hwnd(hwnd: winapi::shared::windef::HWND) -> bool {
    use winapi::um::winuser::{IsIconic, IsWindowVisible, ShowWindow, SW_RESTORE, SW_SHOWNORMAL};
    unsafe {
        if hwnd.is_null() {
            return false;
        }
        if IsWindowVisible(hwnd) == 0 || IsIconic(hwnd) != 0 {
            // SW_SHOWNORMAL un-hides; SW_RESTORE covers iconic leftovers.
            ShowWindow(hwnd, SW_SHOWNORMAL);
            if IsIconic(hwnd) != 0 {
                ShowWindow(hwnd, SW_RESTORE);
            }
        }
        IsWindowVisible(hwnd) != 0 && IsIconic(hwnd) == 0
    }
}

#[cfg(windows)]
fn window_is_user_visible(hwnd: winapi::shared::windef::HWND) -> bool {
    use winapi::um::winuser::{IsIconic, IsWindowVisible};
    unsafe { !hwnd.is_null() && IsWindowVisible(hwnd) != 0 && IsIconic(hwnd) == 0 }
}

/// Show + restore hwnd, then wait until client area looks like a real chat window.
#[cfg(windows)]
fn prepare_chat_hwnd(hwnd: winapi::shared::windef::HWND, wait_ms: u64) -> bool {
    let shown = force_show_hwnd(hwnd);
    let focused = crate::keyboard::focus_window(hwnd);
    let sized = wait_client_min_size(hwnd, 480, 320, wait_ms);
    // SetForegroundWindow often fails while OneTone still owns FG; visible+sized is enough
    // for the following screen click to raise the CEF window.
    (focused || shown || window_is_user_visible(hwnd)) && sized
}

/// Poll until main window is large enough and (for cold start) a composer Edit appears.
/// Returns (hwnd, ready_via) where ready_via is composer|size|timeout.
#[cfg(windows)]
fn wait_chat_ui_ready(
    profile: &AppChatProfile,
    hwnd0: winapi::shared::windef::HWND,
    freshly_launched: bool,
    timeout_ms: u64,
) -> (winapi::shared::windef::HWND, &'static str) {
    let start = std::time::Instant::now();
    let mut hwnd = hwnd0;
    let mut last_via = "timeout";
    let min_composer = if freshly_launched { 15 } else { 10 };

    while start.elapsed().as_millis() < timeout_ms as u128 {
        if let Some(h) = find_app_window(profile) {
            hwnd = h;
        }
        let _ = crate::keyboard::focus_window(hwnd);
        let large = client_size(hwnd).is_some_and(|(w, h)| w >= 480 && h >= 320);
        if !large {
            std::thread::sleep(Duration::from_millis(250));
            continue;
        }
        // MiniMax: the only UIA "composer" is a centered Document named "MiniMax Code"
        // (welcome card). Treating it as ready causes 虚焦 — skip UIA wait entirely.
        if profile.id == MINIMAX_APP_TARGET_ID {
            last_via = "size";
            std::thread::sleep(Duration::from_millis(if freshly_launched { 400 } else { 120 }));
            return (find_app_window(profile).unwrap_or(hwnd), last_via);
        }
        if uia_composer_present(hwnd, min_composer) {
            last_via = "composer";
            // Extra settle so Chromium finishes layout after first Edit appears.
            std::thread::sleep(Duration::from_millis(if freshly_launched {
                600
            } else {
                180
            }));
            return (find_app_window(profile).unwrap_or(hwnd), last_via);
        }
        last_via = "size";
        // Already-running apps: large window is enough. Cold start: keep waiting for Edit.
        if !freshly_launched {
            std::thread::sleep(Duration::from_millis(150));
            return (hwnd, last_via);
        }
        // Soft accept after ~7s with large titled window — some builds expose no UIA Edit.
        if start.elapsed().as_millis() >= 7_000 {
            std::thread::sleep(Duration::from_millis(500));
            return (find_app_window(profile).unwrap_or(hwnd), "size_soft");
        }
        std::thread::sleep(Duration::from_millis(300));
    }
    (find_app_window(profile).unwrap_or(hwnd), last_via)
}

#[cfg(windows)]
fn click_chat_composer(
    hwnd: winapi::shared::windef::HWND,
    candidates: &[(f32, f32)],
    profile_anchor: (f32, f32),
    ide_right_chat: bool,
) -> String {
    // ChatGPT UIA often returns left-edge points (x≈window.left, mid-Y) — skip UIA for
    // chat-first apps; IDE Agent only accepts UIA clicks in the bottom-right band.
    if ide_right_chat {
        if uia_click_best_input_in_band(hwnd, 40, 0.55, 0.98, 0.62) {
            std::thread::sleep(Duration::from_millis(280));
            return "uia_clickable".into();
        }
    }

    // Dual-slot calibrated points first, then hard-coded band fallbacks.
    let mut anchors: Vec<(f32, f32)> = Vec::new();
    let mut push = |p: (f32, f32)| {
        if anchors
            .iter()
            .any(|(x, y)| (x - p.0).abs() < 0.001 && (y - p.1).abs() < 0.001)
        {
            return;
        }
        anchors.push(p);
    };
    for &c in candidates {
        push(c);
    }
    push(profile_anchor);
    if ide_right_chat {
        for p in [(0.72, 0.90), (0.78, 0.88), (0.68, 0.92), (0.65, 0.85)] {
            push(p);
        }
        if let Some(primary) = candidates.first() {
            push((primary.0, (primary.1 - 0.05).clamp(0.72, 0.95)));
        }
    } else {
        // ChatGPT / Trae Work: bottom-center composer (multi-Y so one miss doesn't kill paste).
        for p in [
            (0.50, 0.92),
            (0.50, 0.88),
            (0.50, 0.85),
            (0.48, 0.90),
            (0.55, 0.90),
        ] {
            push(p);
        }
    }

    // Prefer calibrated client clicks before window-ratio heuristics.
    for (i, anchor) in anchors.iter().enumerate() {
        if crate::keyboard::click_client_relative(hwnd, anchor.0, anchor.1) {
            std::thread::sleep(Duration::from_millis(240));
            return if i < candidates.len() {
                if i == 0 {
                    "screen_primary".into()
                } else {
                    "screen_slot".into()
                }
            } else {
                "screen_multi".into()
            };
        }
    }

    if ide_right_chat {
        if click_window_ratio(hwnd, 0.75, 0.90) {
            std::thread::sleep(Duration::from_millis(240));
            return "screen_window".into();
        }
    } else {
        for y in [0.91_f32, 0.88, 0.85] {
            if click_window_ratio(hwnd, 0.50, y) {
                std::thread::sleep(Duration::from_millis(240));
                return "screen_window".into();
            }
        }
    }
    "none".into()
}

/// Screen click at a ratio of the outer window rect (not client) — better for frameless CEF.
#[cfg(windows)]
fn click_window_ratio(hwnd: winapi::shared::windef::HWND, x_ratio: f32, y_ratio: f32) -> bool {
    use winapi::shared::windef::RECT;
    use winapi::um::winuser::GetWindowRect;
    let mut rect = RECT {
        left: 0,
        top: 0,
        right: 0,
        bottom: 0,
    };
    if unsafe { GetWindowRect(hwnd, &mut rect) } == 0 {
        return false;
    }
    let w = rect.right - rect.left;
    let h = rect.bottom - rect.top;
    if w <= 0 || h <= 0 {
        return false;
    }
    let x = rect.left + (w as f32 * x_ratio.clamp(0.08, 0.92)).round() as i32;
    let y = rect.top + (h as f32 * y_ratio.clamp(0.08, 0.95)).round() as i32;
    crate::keyboard::click_screen_abs(x, y)
}

/// MiniMax autofocuses the composer on show. Clicks steal that caret (失焦/虚焦),
/// so handoff is: wait for FG → Ctrl+V only. Click Document bottom only if FG
/// was lost to OneTone after raise (rare).
#[cfg(windows)]
fn minimax_click_and_paste(
    profile: &AppChatProfile,
    hwnd0: winapi::shared::windef::HWND,
    freshly_launched: bool,
    ready_via: &str,
    candidates: &[(f32, f32)],
) -> Result<String, AppChatWorkflowError> {
    let clip = crate::agent::insert_text::read_clipboard_unicode()
        .unwrap_or_default()
        .trim()
        .to_string();
    if clip.is_empty() {
        crate::app_log::cursor_send_oplog(
            "minimax_handoff_empty_clipboard",
            serde_json::json!({}),
        );
        return Err(AppChatWorkflowError::FocusFailed);
    }

    let attempts: u32 = if freshly_launched { 4 } else { 3 };

    for attempt in 0..attempts {
        let hwnd = find_app_window(profile).unwrap_or(hwnd0);
        if !prepare_chat_hwnd(hwnd, if attempt == 0 { 3_500 } else { 1_500 }) {
            std::thread::sleep(Duration::from_millis(280));
            continue;
        }
        if !client_size(hwnd).is_some_and(|(w, h)| w >= 480 && h >= 320) {
            std::thread::sleep(Duration::from_millis(320));
            continue;
        }

        std::thread::sleep(Duration::from_millis(if freshly_launched && attempt == 0 {
            520
        } else {
            240
        }));
        let _ = crate::keyboard::focus_window(hwnd);
        std::thread::sleep(Duration::from_millis(160));

        let mut click_via = "noclick";
        let mut sx = 0i32;
        let mut sy = 0i32;
        // Only click when OneTone stole FG after raise — otherwise keep MiniMax caret.
        if crate::app_identity::foreground_is_self() {
            let mut clicked = false;
            // Dual-slot calibrated points before Document/window heuristics.
            for (i, &(rx, ry)) in candidates.iter().enumerate() {
                if crate::keyboard::click_client_relative(hwnd, rx, ry) {
                    click_via = if i == 0 { "slot0" } else { "slot1" };
                    clicked = true;
                    std::thread::sleep(Duration::from_millis(280));
                    break;
                }
            }
            if !clicked {
                let (via, x, y) = minimax_composer_click_point(hwnd);
                click_via = via;
                sx = x;
                sy = y;
                let _ = crate::keyboard::click_screen_abs(sx, sy);
                std::thread::sleep(Duration::from_millis(280));
            }
        }

        let _ = crate::keyboard::send_chord("Ctrl+V", 40);
        std::thread::sleep(Duration::from_millis(120));
        crate::app_log::cursor_send_oplog(
            "minimax_handoff_paste",
            serde_json::json!({
                "attempt": attempt,
                "pasteVia": "ctrl_v",
                "clickVia": click_via,
                "readyVia": ready_via,
                "chars": clip.chars().count(),
                "click": [sx, sy],
                "client": client_size(hwnd),
                "candidates": candidates.iter().map(|(x, y)| [*x, *y]).collect::<Vec<_>>(),
            }),
        );
        return Ok(format!(
            "chat_pasted:minimax-chat:{click_via}:ctrl_v:ready={ready_via}"
        ));
    }

    crate::app_log::cursor_send_oplog(
        "minimax_handoff_failed",
        serde_json::json!({ "readyVia": ready_via }),
    );
    Err(AppChatWorkflowError::FocusFailed)
}

/// Bottom-center of MiniMax Document (often full client) or window bottom-center.
#[cfg(windows)]
fn minimax_composer_click_point(
    hwnd: winapi::shared::windef::HWND,
) -> (&'static str, i32, i32) {
    if let Some((sx, sy)) = minimax_document_bottom_point(hwnd) {
        return ("doc_bottom", sx, sy);
    }
    use winapi::shared::windef::RECT;
    use winapi::um::winuser::GetWindowRect;
    let mut rect = RECT {
        left: 0,
        top: 0,
        right: 0,
        bottom: 0,
    };
    if unsafe { GetWindowRect(hwnd, &mut rect) } != 0 {
        let w = rect.right - rect.left;
        let h = rect.bottom - rect.top;
        if w > 0 && h > 0 {
            // Center-bottom of chat surface (not right-edge chrome).
            let x = rect.left + (w as f32 * 0.50).round() as i32;
            let y = rect.top + (h as f32 * 0.88).round() as i32;
            return ("window_bottom", x, y);
        }
    }
    ("fallback", 0, 0)
}

/// Bottom-center of largest focusable Document. Bounds only — never SetFocus.
#[cfg(windows)]
fn minimax_document_bottom_point(
    hwnd: winapi::shared::windef::HWND,
) -> Option<(i32, i32)> {
    use windows::core::VARIANT;
    use windows::Win32::Foundation::HWND as WinHwnd;
    use windows::Win32::System::Com::{
        CoCreateInstance, CoInitializeEx, CLSCTX_INPROC_SERVER, COINIT_APARTMENTTHREADED,
    };
    use windows::Win32::UI::Accessibility::{
        CUIAutomation, IUIAutomation, TreeScope_Descendants, UIA_ControlTypePropertyId,
        UIA_DocumentControlTypeId,
    };

    unsafe {
        let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
        let automation: IUIAutomation =
            CoCreateInstance(&CUIAutomation, None, CLSCTX_INPROC_SERVER).ok()?;
        let root = automation
            .ElementFromHandle(WinHwnd(hwnd as *mut _))
            .ok()?;
        let value = VARIANT::from(UIA_DocumentControlTypeId.0);
        let condition = automation
            .CreatePropertyCondition(UIA_ControlTypePropertyId, &value)
            .ok()?;
        let elements = root.FindAll(TreeScope_Descendants, &condition).ok()?;
        let len = elements.Length().unwrap_or(0);
        let mut best: Option<(i64, i32, i32)> = None; // area, sx, sy
        for i in 0..len {
            let Ok(element) = elements.GetElement(i) else {
                continue;
            };
            if !element_is_enabled_and_focusable(&element) {
                continue;
            }
            let Ok(rect) = element.CurrentBoundingRectangle() else {
                continue;
            };
            let w = (rect.right - rect.left).max(0);
            let h = (rect.bottom - rect.top).max(0);
            let area = (w as i64) * (h as i64);
            // Full-client Document (~1400×900) is normal for MiniMax CEF — allow it.
            if area < 80_000 || h < 180 || w < 280 {
                continue;
            }
            let sx = rect.left + w / 2;
            let sy = rect.top + ((h as f32) * 0.88).round() as i32;
            let better = best.as_ref().map(|(a, _, _)| area > *a).unwrap_or(true);
            if better {
                best = Some((area, sx, sy));
            }
        }
        best.map(|(_, x, y)| (x, y))
    }
}

/// Above this, char-by-char SendInput truncates / drops in CEF (WorkBuddy etc.).
/// Clipboard already has the full markdown — Ctrl+V is the reliable long-paste path.
#[cfg(windows)]
const ELECTRON_SEND_TEXT_MAX_CHARS: usize = 160;

/// Electron / IDE chat composers: inject text after a real caret click.
/// Short: unicode SendInput (Ctrl+V sometimes lands in chrome). Long: Ctrl+V only.
/// Never Ctrl+A — wrong focus selects sidebar/history then pastes there.
#[cfg(windows)]
fn electron_replace_paste(paste_hold_ms: u32) -> (bool, &'static str) {
    let clip = crate::agent::insert_text::read_clipboard_unicode().unwrap_or_default();
    if clip.trim().is_empty() {
        return (false, "empty");
    }
    let hold = paste_hold_ms.max(35);
    let long = clip.chars().count() > ELECTRON_SEND_TEXT_MAX_CHARS;
    std::thread::sleep(Duration::from_millis(180));
    if long {
        if crate::keyboard::send_chord("Ctrl+V", hold) {
            std::thread::sleep(Duration::from_millis(80));
            return (true, "ctrl_v");
        }
        // Last resort — may still truncate, but better than empty.
        if crate::keyboard::send_text(&clip) {
            std::thread::sleep(Duration::from_millis(80));
            return (true, "send_text_fallback");
        }
        return (false, "paste_failed");
    }
    if crate::keyboard::send_text(&clip) {
        std::thread::sleep(Duration::from_millis(80));
        return (true, "send_text");
    }
    if crate::keyboard::send_chord("Ctrl+V", hold) {
        std::thread::sleep(Duration::from_millis(80));
        return (true, "ctrl_v");
    }
    (false, "paste_failed")
}

/// Persist assembled markdown so the user can @-upload when chat paste truncates.
/// Overwrites `handoffs/<label>-latest.md` under the data root. Skips short prompts.
pub fn write_handoff_md_backup(app_target_id: &str, body: &str) -> Option<std::path::PathBuf> {
    if body.chars().count() < 400 {
        return None;
    }
    crate::data_root::write_handoff_markdown(body, app_target_id).ok()
}

/// Prefer UIA SetValue when a real Edit exists; else Ctrl+V / unicode / Shift+Insert.
#[cfg(windows)]
fn paste_into_chat_composer(
    hwnd: winapi::shared::windef::HWND,
    prefer_text_inject: bool,
) -> (bool, &'static str) {
    let clip = crate::agent::insert_text::read_clipboard_unicode()
        .unwrap_or_default()
        .trim()
        .to_string();

    if !clip.is_empty() {
        if uia_set_best_input_value(hwnd, &clip, 10) {
            std::thread::sleep(Duration::from_millis(120));
            return (true, "uia_set_value");
        }
    }

    if !prefer_text_inject {
        if crate::keyboard::send_chord("Ctrl+V", 40) {
            std::thread::sleep(Duration::from_millis(80));
            return (true, "ctrl_v");
        }
    }

    if !clip.is_empty() && crate::keyboard::send_text(&clip) {
        std::thread::sleep(Duration::from_millis(80));
        return (true, "send_text");
    }

    if prefer_text_inject && crate::keyboard::send_chord("Ctrl+V", 40) {
        std::thread::sleep(Duration::from_millis(80));
        return (true, "ctrl_v_fallback");
    }

    if crate::keyboard::send_chord("Shift+Insert", 40) {
        std::thread::sleep(Duration::from_millis(80));
        return (true, "shift_insert");
    }

    (false, "none")
}

/// Set ValuePattern on best Edit/Document — works without keyboard caret (CEF-friendly).
#[cfg(windows)]
fn uia_set_best_input_value(
    hwnd: winapi::shared::windef::HWND,
    text: &str,
    min_score: i32,
) -> bool {
    use windows::core::{BSTR, Interface, VARIANT};
    use windows::Win32::Foundation::HWND as WinHwnd;
    use windows::Win32::System::Com::{
        CoCreateInstance, CoInitializeEx, CLSCTX_INPROC_SERVER, COINIT_APARTMENTTHREADED,
    };
    use windows::Win32::UI::Accessibility::{
        CUIAutomation, IUIAutomation, IUIAutomationElement, IUIAutomationValuePattern,
        TreeScope_Descendants, UIA_ControlTypePropertyId, UIA_DocumentControlTypeId,
        UIA_EditControlTypeId, UIA_ValuePatternId,
    };

    if text.is_empty() {
        return false;
    }

    unsafe {
        let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
        let automation: IUIAutomation =
            match CoCreateInstance(&CUIAutomation, None, CLSCTX_INPROC_SERVER) {
                Ok(v) => v,
                Err(_) => return false,
            };
        let Ok(root) = automation.ElementFromHandle(WinHwnd(hwnd as *mut _)) else {
            return false;
        };

        let mut best: Option<(i32, IUIAutomationElement)> = None;
        for control_type in [UIA_EditControlTypeId, UIA_DocumentControlTypeId] {
            let value = VARIANT::from(control_type.0);
            let Ok(condition) =
                automation.CreatePropertyCondition(UIA_ControlTypePropertyId, &value)
            else {
                continue;
            };
            let Ok(elements) = root.FindAll(TreeScope_Descendants, &condition) else {
                continue;
            };
            let len = elements.Length().unwrap_or(0);
            for i in 0..len {
                let Ok(element) = elements.GetElement(i) else {
                    continue;
                };
                if !element_is_enabled_and_focusable(&element) {
                    continue;
                }
                let name = element_name(&element).unwrap_or_default();
                let mut score = score_input_name(&name, control_type.0 as i32);
                if let Some(yr) = element_client_y_ratio(hwnd, &element) {
                    if yr >= 0.70 {
                        score += 40;
                    } else if yr < 0.35 {
                        score -= 30;
                    }
                }
                if score < min_score {
                    continue;
                }
                let better = best.as_ref().map(|(s, _)| score > *s).unwrap_or(true);
                if better {
                    best = Some((score, element));
                }
            }
        }

        let Some((score, element)) = best else {
            return false;
        };
        let Ok(pattern_unk) = element.GetCurrentPattern(UIA_ValuePatternId) else {
            return false;
        };
        let Ok(value_pat) = pattern_unk.cast::<IUIAutomationValuePattern>() else {
            return false;
        };
        let bstr = BSTR::from(text);
        if value_pat.SetValue(&bstr).is_err() {
            return false;
        }
        crate::app_log::cursor_send_oplog(
            "uia_set_value",
            serde_json::json!({ "score": score, "chars": text.chars().count() }),
        );
        true
    }
}

/// True when an Edit/Document under hwnd looks like a chat composer (score ≥ min).
#[cfg(windows)]
fn uia_composer_present(hwnd: winapi::shared::windef::HWND, min_score: i32) -> bool {
    uia_scan_best_input(hwnd).0 >= min_score
}

/// Cursor Agent panel open? Right-band clickable Edit/Document with usable score.
/// Read-only — does not click (unlike [`uia_click_best_input_in_band`]).
#[cfg(windows)]
fn cursor_right_band_composer_present(hwnd: winapi::shared::windef::HWND) -> bool {
    use winapi::shared::windef::RECT;
    use winapi::um::winuser::GetWindowRect;

    let (score, point) = uia_scan_best_input(hwnd);
    if score < 10 {
        return false;
    }
    let Some((sx, sy)) = point else {
        return false;
    };
    let mut rect = RECT {
        left: 0,
        top: 0,
        right: 0,
        bottom: 0,
    };
    if unsafe { GetWindowRect(hwnd, &mut rect) } == 0 {
        return false;
    }
    let w = (rect.right - rect.left).max(1) as f32;
    let h = (rect.bottom - rect.top).max(1) as f32;
    let xr = (sx - rect.left) as f32 / w;
    let yr = (sy - rect.top) as f32 / h;
    xr >= CURSOR_AGENT_MIN_X_RATIO && xr <= 0.98 && yr >= 0.62
}

/// Find best Edit/Document under hwnd and click its UIA clickable point (screen coords).
#[cfg(windows)]
fn uia_click_best_input(hwnd: winapi::shared::windef::HWND, min_score: i32) -> bool {
    uia_click_best_input_in_band(hwnd, min_score, 0.08, 0.92, 0.35)
}

/// Like [`uia_click_best_input`], but rejects clickable points outside hwnd / band.
/// ChatGPT previously returned left-edge mid-Y points (x≈window.left) that stole paste.
#[cfg(windows)]
fn uia_click_best_input_in_band(
    hwnd: winapi::shared::windef::HWND,
    min_score: i32,
    x_min: f32,
    x_max: f32,
    y_min: f32,
) -> bool {
    use winapi::shared::windef::RECT;
    use winapi::um::winuser::GetWindowRect;

    let (score, point) = uia_scan_best_input(hwnd);
    let Some((sx, sy)) = point.filter(|_| score >= min_score) else {
        return false;
    };
    let mut rect = RECT {
        left: 0,
        top: 0,
        right: 0,
        bottom: 0,
    };
    if unsafe { GetWindowRect(hwnd, &mut rect) } == 0 {
        return false;
    }
    let w = (rect.right - rect.left).max(1) as f32;
    let h = (rect.bottom - rect.top).max(1) as f32;
    let xr = (sx - rect.left) as f32 / w;
    let yr = (sy - rect.top) as f32 / h;
    let inside = sx >= rect.left + 4
        && sx <= rect.right - 4
        && sy >= rect.top + 4
        && sy <= rect.bottom - 4
        && xr >= x_min
        && xr <= x_max
        && yr >= y_min;
    crate::app_log::cursor_send_oplog(
        "uia_clickable_point",
        serde_json::json!({
            "score": score,
            "x": sx,
            "y": sy,
            "xr": xr,
            "yr": yr,
            "accepted": inside,
            "window": [rect.left, rect.top, rect.right, rect.bottom],
        }),
    );
    if !inside {
        return false;
    }
    crate::keyboard::click_screen_abs(sx, sy)
}

/// Returns (best_score, optional clickable screen point). Score may be high without a point.
#[cfg(windows)]
fn uia_scan_best_input(
    hwnd: winapi::shared::windef::HWND,
) -> (i32, Option<(i32, i32)>) {
    use windows::core::VARIANT;
    use windows::Win32::Foundation::{HWND as WinHwnd, POINT as WinPoint};
    use windows::Win32::System::Com::{
        CoCreateInstance, CoInitializeEx, CLSCTX_INPROC_SERVER, COINIT_APARTMENTTHREADED,
    };
    use windows::Win32::UI::Accessibility::{
        CUIAutomation, IUIAutomation, TreeScope_Descendants, UIA_ControlTypePropertyId,
        UIA_DocumentControlTypeId, UIA_EditControlTypeId,
    };

    unsafe {
        let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
        let automation: IUIAutomation =
            match CoCreateInstance(&CUIAutomation, None, CLSCTX_INPROC_SERVER) {
                Ok(v) => v,
                Err(_) => return (-1, None),
            };
        let Ok(root) = automation.ElementFromHandle(WinHwnd(hwnd as *mut _)) else {
            return (-1, None);
        };

        let mut best_score = -1;
        let mut best_point: Option<(i32, i32, i32)> = None; // score, sx, sy
        for control_type in [UIA_EditControlTypeId, UIA_DocumentControlTypeId] {
            let value = VARIANT::from(control_type.0);
            let Ok(condition) =
                automation.CreatePropertyCondition(UIA_ControlTypePropertyId, &value)
            else {
                continue;
            };
            let Ok(elements) = root.FindAll(TreeScope_Descendants, &condition) else {
                continue;
            };
            let len = elements.Length().unwrap_or(0);
            for i in 0..len {
                let Ok(element) = elements.GetElement(i) else {
                    continue;
                };
                if !element_is_enabled_and_focusable(&element) {
                    continue;
                }
                let name = element_name(&element).unwrap_or_default();
                let mut score = score_input_name(&name, control_type.0 as i32);
                if let Some(yr) = element_client_y_ratio(hwnd, &element) {
                    if yr >= 0.70 {
                        score += 40;
                    } else if yr < 0.35 {
                        score -= 30;
                    }
                }
                if score > best_score {
                    best_score = score;
                }
                let mut pt = WinPoint { x: 0, y: 0 };
                let got = element.GetClickablePoint(&mut pt as *mut _).ok();
                if got.map(|g| g.as_bool()).unwrap_or(false) {
                    let better = best_point
                        .as_ref()
                        .map(|(s, _, _)| score > *s)
                        .unwrap_or(true);
                    if better {
                        best_point = Some((score, pt.x, pt.y));
                    }
                }
            }
        }
        let point = best_point.map(|(_, x, y)| (x, y));
        (best_score, point)
    }
}

#[cfg(windows)]
unsafe fn element_client_y_ratio(
    hwnd: winapi::shared::windef::HWND,
    element: &windows::Win32::UI::Accessibility::IUIAutomationElement,
) -> Option<f32> {
    use winapi::shared::windef::{POINT, RECT};
    use winapi::um::winuser::{GetClientRect, ScreenToClient};
    use windows::Win32::Foundation::POINT as WinPoint;

    let mut pt = WinPoint { x: 0, y: 0 };
    let got = element.GetClickablePoint(&mut pt as *mut _).ok()?;
    if !got.as_bool() {
        return None;
    }
    let mut cpt = POINT { x: pt.x, y: pt.y };
    if ScreenToClient(hwnd, &mut cpt) == 0 {
        return None;
    }
    let mut crect = RECT {
        left: 0,
        top: 0,
        right: 0,
        bottom: 0,
    };
    if GetClientRect(hwnd, &mut crect) == 0 {
        return None;
    }
    let ch = (crect.bottom - crect.top).max(1) as f32;
    Some((cpt.y as f32 / ch).clamp(0.0, 1.0))
}

/// Open / focus the habit's declared app target only — no composer focus, no voice.
#[cfg(windows)]
pub fn open_or_focus_target(
    state: &Arc<AppState>,
    window: &WebviewWindow,
    mapping_id: &str,
) -> Result<String, (String, AppChatWorkflowError)> {
    let (app_target_id, custom_rule) = {
        let cfg = state.cfg.lock();
        let mapping = cfg
            .find_mapping_by_id(mapping_id)
            .ok_or(("no_mapping".to_string(), AppChatWorkflowError::NotFound))?;
        let tid = mapping.app_target_id.trim().to_string();
        if tid.is_empty() {
            return Err(("no_app_target".to_string(), AppChatWorkflowError::NotFound));
        }
        let rule = mapping
            .app_behavior_rules
            .iter()
            .find(|r| {
                r.app_id.trim() == tid
                    || r.rule_id.trim() == tid
                    || (!crate::config::is_builtin_app_id(&tid)
                        && (r.app_id.trim() == tid || r.rule_id.trim() == tid))
            })
            .cloned();
        (tid, rule)
    };

    let app = window.app_handle();
    let _hide_guard = MainWindowHideGuard::maybe_hide(&app);

    if let Some(profile) = profile_for(&app_target_id) {
        let (hwnd, freshly_launched) = ensure_app_window(profile).ok_or((
            profile.error_prefix.to_string(),
            AppChatWorkflowError::NotFound,
        ))?;
        if freshly_launched {
            std::thread::sleep(Duration::from_millis(1200));
        }
        if !crate::keyboard::focus_window(hwnd) {
            return Err((
                profile.error_prefix.to_string(),
                AppChatWorkflowError::FocusFailed,
            ));
        }
        return Ok(format!("{}_open", profile.error_prefix));
    }

    if let Some(rule) = custom_rule {
        let (hwnd, freshly_launched) = ensure_custom_rule_window(&rule)
            .ok_or(("custom".to_string(), AppChatWorkflowError::NotFound))?;
        if freshly_launched {
            std::thread::sleep(Duration::from_millis(1200));
        }
        if !crate::keyboard::focus_window(hwnd) {
            return Err(("custom".to_string(), AppChatWorkflowError::FocusFailed));
        }
        let label = rule
            .display_name
            .as_deref()
            .filter(|s| !s.trim().is_empty())
            .unwrap_or("custom");
        return Ok(format!("{label}_open"));
    }

    Err((
        "unknown_app_target".to_string(),
        AppChatWorkflowError::NotFound,
    ))
}

#[cfg(not(windows))]
pub fn open_or_focus_target(
    _state: &Arc<AppState>,
    _window: &WebviewWindow,
    _mapping_id: &str,
) -> Result<String, (String, AppChatWorkflowError)> {
    Err(("unavailable".to_string(), AppChatWorkflowError::NotFound))
}

/// IPC-safe focus for overlay / virtual-pad hold-to-talk — no UIA, no launch polling.
#[cfg(windows)]
pub fn quick_focus_app_target_for_hold(app_target_id: &str) -> bool {
    let tid = app_target_id.trim();
    if tid.is_empty() {
        return false;
    }
    if crate::app_identity::foreground_app_target_id().is_some_and(|id| id.trim() == tid) {
        return true;
    }
    if crate::keyboard::restore_external_foreground() {
        std::thread::sleep(Duration::from_millis(30));
        if crate::app_identity::foreground_app_target_id().is_some_and(|id| id.trim() == tid) {
            return true;
        }
    }
    let Some(profile) = profile_for(tid) else {
        return false;
    };
    let Some(hwnd) = find_app_window(profile) else {
        return false;
    };
    if !crate::keyboard::focus_window(hwnd) {
        return false;
    }
    std::thread::sleep(Duration::from_millis(40));
    crate::app_identity::foreground_app_target_id().is_some_and(|id| id.trim() == tid)
}

#[cfg(not(windows))]
pub fn quick_focus_app_target_for_hold(_app_target_id: &str) -> bool {
    false
}

#[cfg(windows)]
pub fn quick_focus_codex_for_hold() -> bool {
    quick_focus_app_target_for_hold(CODEX_APP_TARGET_ID)
}

#[cfg(not(windows))]
pub fn quick_focus_codex_for_hold() -> bool {
    false
}

#[cfg(windows)]
fn run_app_chat_workflow(
    state: &Arc<AppState>,
    window: &WebviewWindow,
    mapping_id: &str,
    profile: &AppChatProfile,
    duration_ms: u32,
) -> Result<String, (String, AppChatWorkflowError)> {
    let prefix = profile.error_prefix;

    if !crate::send_guard::wait_until_inactive(800) {
        return Err((prefix.to_string(), AppChatWorkflowError::VoiceFailed));
    }

    let app = window.app_handle();
    let _hide_guard = MainWindowHideGuard::maybe_hide(&app);

    let (hwnd, freshly_launched) =
        ensure_app_window(profile).ok_or((prefix.to_string(), AppChatWorkflowError::NotFound))?;
    if freshly_launched {
        std::thread::sleep(Duration::from_millis(2200));
    }

    if !crate::keyboard::focus_window(hwnd) {
        return Err((prefix.to_string(), AppChatWorkflowError::FocusFailed));
    }
    std::thread::sleep(Duration::from_millis(120));

    let anchor = composer_anchor_for_app(&app, profile.id, profile);
    if !focus_chat_input(hwnd, profile, duration_ms, anchor) {
        return Err((prefix.to_string(), AppChatWorkflowError::InputNotFound));
    }
    std::thread::sleep(Duration::from_millis(80));

    activate_voice_input(state, &app, hwnd, mapping_id, profile, duration_ms, prefix)?;

    Ok(format!("{prefix}_workflow"))
}

#[cfg(windows)]
fn activate_voice_input(
    state: &Arc<AppState>,
    app: &AppHandle,
    _hwnd: winapi::shared::windef::HWND,
    mapping_id: &str,
    profile: &AppChatProfile,
    duration_ms: u32,
    prefix: &str,
) -> Result<(), (String, AppChatWorkflowError)> {
    // focus_chat_input already made the composer ready (soft focus or one Ctrl+I).
    // Do not send open_key again here — Cursor Ctrl+I toggles and would close an open panel.

    let voice_key = {
        let cfg = state.cfg.lock();
        let mapping = cfg.find_mapping_by_id(mapping_id);
        crate::voice_end_runtime::resolve_voice_key_for_mapping(&cfg, mapping)
    }
    .ok_or((prefix.to_string(), AppChatWorkflowError::VoiceFailed))?;

    if crate::voice_end_runtime::session_state(state.as_ref()) == "dictating" {
        crate::voice_end_runtime::handle_trigger_press_while_dictating(state, app, mapping_id);
        return Ok(());
    }

    if crate::voice_end_runtime::is_hold_to_talk_voice_key(&voice_key) {
        if !crate::voice_end_runtime::begin_hold_voice_chord(state.as_ref(), &voice_key) {
            return Err((prefix.to_string(), AppChatWorkflowError::VoiceFailed));
        }
    } else if !crate::keyboard::send_chord(&voice_key, duration_ms) {
        return Err((prefix.to_string(), AppChatWorkflowError::VoiceFailed));
    } else {
        crate::voice_end_runtime::mark_voice_wake_key_sent(state.as_ref());
    }

    if profile.post_voice_key_ms > 0 {
        std::thread::sleep(Duration::from_millis(profile.post_voice_key_ms));
    }

    // Codex native Start Dictation chord: do not enter OneTone dictating session.
    if crate::key_chord::is_hold_to_talk_chord(&voice_key) {
        return Ok(());
    }

    if crate::voice_end_runtime::can_enter_dictating(&state.cfg.lock()) {
        crate::voice_end_runtime::enter_dictating(
            state,
            Some(app),
            mapping_id,
            &format!("{} workflow", prefix),
        );
    }

    Ok(())
}

#[cfg(windows)]
const STABILIZE_AFTER_OPEN_MS: u64 = 280;
#[cfg(windows)]
const STABILIZE_AFTER_CLICK_MS: u64 = 160;

#[cfg(windows)]
fn uia_min_score(profile: &AppChatProfile) -> i32 {
    // With open_key (Cursor Ctrl+I), reject weak "input" matches that aren't the composer.
    if profile.open_key.is_some() {
        55
    } else {
        20
    }
}

#[cfg(windows)]
fn focus_chat_input(
    hwnd: winapi::shared::windef::HWND,
    profile: &AppChatProfile,
    duration_ms: u32,
    anchor: (f32, f32),
) -> bool {
    let min_score = uia_min_score(profile);

    // Soft path first: click RIGHT panel, then UIA. Never Ctrl+I while editor has focus —
    // Cursor maps Ctrl+I to inline edit (selects text) when caret is in the code editor.
    // Cursor open_key is also a toggle: if Agent is already open, Ctrl+I closes it.
    let cursor_no_toggle = profile.id == CURSOR_APP_TARGET_ID;
    let allow_blind_click =
        profile.accept_click_without_uia && (profile.open_key.is_none() || cursor_no_toggle);
    if uia_focus_chat_input(hwnd, min_score) {
        return true;
    }
    if click_then_confirm(hwnd, profile, min_score, anchor) {
        if allow_blind_click || uia_focus_chat_input(hwnd, min_score) {
            return true;
        }
    }

    // Hard open only after right-panel click stole focus from the editor.
    // Skip for Cursor — Ctrl+I toggles the panel shut / opens inline edit.
    if cursor_no_toggle {
        return allow_blind_click && click_composer_anchor(hwnd, anchor);
    }
    if let Some(open_key) = profile.open_key.filter(|k| !k.trim().is_empty()) {
        let _ = click_composer_anchor(hwnd, anchor);
        std::thread::sleep(Duration::from_millis(STABILIZE_AFTER_CLICK_MS));
        let _ = crate::keyboard::focus_window(hwnd);
        std::thread::sleep(Duration::from_millis(80));
        crate::app_log::cursor_send_oplog(
            "open_key_chord",
            serde_json::json!({
                "chord": open_key,
                "via": "focus_chat_input_not_send",
                "note": "send path must NOT call this; if seen after 发送, wrong code path",
            }),
        );
        if crate::keyboard::send_chord(open_key, duration_ms) {
            std::thread::sleep(Duration::from_millis(STABILIZE_AFTER_OPEN_MS));
            if uia_focus_chat_input(hwnd, min_score) {
                return true;
            }
            if click_then_confirm(hwnd, profile, min_score, anchor) {
                return uia_focus_chat_input(hwnd, min_score) || allow_blind_click;
            }
            return false;
        }
    }

    false
}

#[cfg(windows)]
fn click_then_confirm(
    hwnd: winapi::shared::windef::HWND,
    profile: &AppChatProfile,
    min_score: i32,
    anchor: (f32, f32),
) -> bool {
    if !click_composer_anchor(hwnd, anchor) {
        return false;
    }
    std::thread::sleep(Duration::from_millis(STABILIZE_AFTER_CLICK_MS));
    // Keep click focus for Electron composers; a follow-up UIA SetFocus often displaces it.
    if profile.accept_click_without_uia {
        return true;
    }
    uia_focus_chat_input(hwnd, min_score)
}

#[cfg(windows)]
fn click_composer_anchor(hwnd: winapi::shared::windef::HWND, anchor: (f32, f32)) -> bool {
    crate::keyboard::click_client_relative(hwnd, anchor.0, anchor.1)
}

#[cfg(windows)]
fn ensure_app_window(profile: &AppChatProfile) -> Option<(winapi::shared::windef::HWND, bool)> {
    if let Some(hwnd) = find_app_window(profile) {
        if window_is_user_visible(hwnd) || force_show_hwnd(hwnd) {
            return Some((hwnd, false));
        }
        // MiniMax etc.: process alive + invisible chrome — ShellExecute single-instance
        // so the real client surfaces (ShowWindow alone often leaves it invisible).
        crate::app_log::cursor_send_oplog(
            "chat_handoff_relaunch_hidden",
            serde_json::json!({ "appTargetId": profile.id }),
        );
        if try_launch_app_profile(profile) {
            for _ in 0..40 {
                std::thread::sleep(Duration::from_millis(250));
                if let Some(h) = find_app_window(profile) {
                    let _ = force_show_hwnd(h);
                    if window_is_user_visible(h)
                        || client_size(h).is_some_and(|(w, hgt)| w >= 480 && hgt >= 320)
                    {
                        return Some((h, true));
                    }
                }
            }
        }
        // Still return hwnd — prepare_chat_hwnd will retry show/focus.
        return Some((hwnd, false));
    }
    if !try_launch_app_profile(profile) {
        return None;
    }
    for _ in 0..60 {
        std::thread::sleep(Duration::from_millis(250));
        if let Some(hwnd) = find_app_window(profile) {
            let _ = force_show_hwnd(hwnd);
            return Some((hwnd, true));
        }
    }
    None
}

/// Launch when no window exists. Prefer LocalAppData exe; Store apps use Start Menu / AUMID.
#[cfg(windows)]
fn try_launch_app_profile(profile: &AppChatProfile) -> bool {
    if launch_from_localappdata(profile) {
        return true;
    }
    if profile.id == CODEX_APP_TARGET_ID {
        return launch_codex_store_app();
    }
    if matches!(
        profile.id,
        QODER_APP_TARGET_ID
            | MINIMAX_APP_TARGET_ID
            | WORKBUDDY_APP_TARGET_ID
            | TRAE_APP_TARGET_ID
            | TRAE_CHAT_LEGACY_APP_TARGET_ID
            | TRAE_CODE_APP_TARGET_ID
            | WINDSURF_APP_TARGET_ID
    ) {
        return launch_from_resolved_hint(profile);
    }
    false
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AppLaunchCapability {
    Launchable,
    FocusOnly,
    Missing,
}

impl AppLaunchCapability {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Launchable => "launchable",
            Self::FocusOnly => "focus_only",
            Self::Missing => "missing",
        }
    }
}

/// Card capability: can cold-start/focus now, focus-only when running, or no evidence.
pub fn app_launch_capability(app_target_id: &str) -> AppLaunchCapability {
    let id = app_target_id.trim();
    if id.is_empty() {
        return AppLaunchCapability::Missing;
    }
    #[cfg(windows)]
    {
        if let Some(profile) = profile_for(id) {
            if find_app_window(profile).is_some() {
                return AppLaunchCapability::Launchable;
            }
            if can_resolve_cold_start(profile) {
                return AppLaunchCapability::Launchable;
            }
            return AppLaunchCapability::FocusOnly;
        }
    }
    #[cfg(not(windows))]
    {
        let _ = id;
    }
    AppLaunchCapability::Missing
}

#[cfg(windows)]
fn can_resolve_cold_start(profile: &AppChatProfile) -> bool {
    if !profile.launch_localappdata_rel.is_empty() {
        if let Ok(local) = std::env::var("LOCALAPPDATA") {
            if profile
                .launch_localappdata_rel
                .iter()
                .map(|rel| std::path::PathBuf::from(&local).join(rel))
                .any(|p| p.is_file())
            {
                return true;
            }
        }
    }
    if profile.id == CODEX_APP_TARGET_ID {
        return true; // Store launch always attempted
    }
    resolve_launch_hint(profile).is_some()
}

fn shortcut_launch_hint_cache() -> &'static Mutex<HashMap<String, Option<std::path::PathBuf>>> {
    static CACHE: OnceLock<Mutex<HashMap<String, Option<std::path::PathBuf>>>> = OnceLock::new();
    CACHE.get_or_init(|| Mutex::new(HashMap::new()))
}

#[cfg(windows)]
fn launch_from_resolved_hint(profile: &AppChatProfile) -> bool {
    let Some(path) = resolve_launch_hint(profile) else {
        return false;
    };
    if !validate_launch_exe(&path, profile) {
        return false;
    }
    launch_gui_exe(&path)
}

/// Runtime inventory only — never written into scenario config.
#[cfg(windows)]
fn resolve_launch_hint(profile: &AppChatProfile) -> Option<std::path::PathBuf> {
    if let Ok(cache) = shortcut_launch_hint_cache().lock() {
        if let Some(hit) = cache.get(profile.id) {
            if let Some(path) = hit {
                if validate_launch_exe(path, profile) {
                    return Some(path.clone());
                }
            } else {
                // Cached miss — still re-check running process (may have started since).
            }
        }
    }

    let resolved = resolve_launch_hint_uncached(profile);
    if let Ok(mut cache) = shortcut_launch_hint_cache().lock() {
        cache.insert(profile.id.to_string(), resolved.clone());
    }
    resolved
}

#[cfg(windows)]
fn resolve_launch_hint_uncached(profile: &AppChatProfile) -> Option<std::path::PathBuf> {
    // 1) Running process trusted full path
    if let Some(path) = find_running_process_exe(profile) {
        if validate_launch_exe(&path, profile) {
            return Some(path);
        }
    }
    // 2) Desktop + Start Menu shortcuts (portable installs often only leave a Desktop .lnk)
    let needles = shortcut_name_needles(profile);
    if !needles.is_empty() {
        let mut roots = Vec::new();
        if let Ok(user_profile) = std::env::var("USERPROFILE") {
            roots.push(std::path::PathBuf::from(&user_profile).join("Desktop"));
        }
        if let Ok(public) = std::env::var("PUBLIC") {
            roots.push(std::path::PathBuf::from(public).join("Desktop"));
        }
        if let Ok(appdata) = std::env::var("APPDATA") {
            roots.push(
                std::path::PathBuf::from(appdata).join("Microsoft\\Windows\\Start Menu\\Programs"),
            );
        }
        if let Ok(program_data) = std::env::var("ProgramData") {
            roots.push(
                std::path::PathBuf::from(program_data)
                    .join("Microsoft\\Windows\\Start Menu\\Programs"),
            );
        }
        for root in roots {
            if let Some(lnk) = find_lnk_by_name(&root, &needles, 0) {
                // Prefer launching the .lnk itself (ShellExecute resolves target).
                return Some(lnk);
            }
        }
    }
    // 3) Uninstall DisplayIcon / InstallLocation (never UninstallString)
    if let Some(path) = probe_uninstall_exe(profile) {
        if validate_launch_exe(&path, profile) {
            return Some(path);
        }
    }
    // 4) Known install dirs
    for path in known_install_exe_candidates(profile) {
        if validate_launch_exe(&path, profile) {
            return Some(path);
        }
    }
    None
}

#[cfg(windows)]
fn shortcut_name_needles(profile: &AppChatProfile) -> Vec<&'static str> {
    match profile.id {
        // Prefer "Qoder CN" before bare "Qoder" so CN .lnk wins when both exist.
        QODER_APP_TARGET_ID => vec!["Qoder CN", "qoder cn", "Qoder", "qoder"],
        // Prefer "MiniMax Code" — bare "minimax" also matches MiniMax Design.lnk.
        MINIMAX_APP_TARGET_ID => vec!["MiniMax Code"],
        WORKBUDDY_APP_TARGET_ID => vec!["WorkBuddy", "Work Buddy"],
        // Specific first — "Trae" alone would also hit TraeCode CN.lnk.
        TRAE_APP_TARGET_ID | TRAE_CHAT_LEGACY_APP_TARGET_ID => {
            vec!["TraeWork", "TRAE SOLO", "Trae Solo", "trae work"]
        }
        TRAE_CODE_APP_TARGET_ID => vec!["TraeCode", "Trae Code", "Trae CN"],
        WINDSURF_APP_TARGET_ID => vec!["Windsurf"],
        _ => vec![],
    }
}

#[cfg(windows)]
fn expected_exe_names(profile: &AppChatProfile) -> &[&'static str] {
    profile.process_names
}

#[cfg(windows)]
fn validate_launch_exe(path: &std::path::Path, profile: &AppChatProfile) -> bool {
    if path
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.eq_ignore_ascii_case("lnk"))
        == Some(true)
    {
        return path.is_file();
    }
    if !path.is_absolute() || !path.is_file() {
        return false;
    }
    let name = path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    expected_exe_names(profile)
        .iter()
        .any(|n| name == n.to_ascii_lowercase())
}

#[cfg(windows)]
fn find_running_process_exe(profile: &AppChatProfile) -> Option<std::path::PathBuf> {
    use winapi::um::handleapi::{CloseHandle, INVALID_HANDLE_VALUE};
    use winapi::um::tlhelp32::{
        CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W,
        TH32CS_SNAPPROCESS,
    };
    let needles: Vec<String> = profile
        .process_names
        .iter()
        .map(|n| n.to_ascii_lowercase())
        .collect();
    unsafe {
        let snap = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
        if snap.is_null() || snap == INVALID_HANDLE_VALUE {
            return None;
        }
        let mut entry: PROCESSENTRY32W = std::mem::zeroed();
        entry.dwSize = std::mem::size_of::<PROCESSENTRY32W>() as u32;
        let mut found = None;
        if Process32FirstW(snap, &mut entry) != 0 {
            loop {
                let exe_name = String::from_utf16_lossy(
                    &entry.szExeFile[..entry
                        .szExeFile
                        .iter()
                        .position(|&c| c == 0)
                        .unwrap_or(entry.szExeFile.len())],
                );
                if needles.iter().any(|n| exe_name.to_ascii_lowercase() == *n) {
                    if let Some(full) = crate::app_identity::process_image_path(entry.th32ProcessID)
                    {
                        let path = std::path::PathBuf::from(full);
                        if validate_launch_exe(&path, profile) {
                            found = Some(path);
                            break;
                        }
                    }
                }
                if Process32NextW(snap, &mut entry) == 0 {
                    break;
                }
            }
        }
        CloseHandle(snap);
        found
    }
}

#[cfg(windows)]
fn known_install_exe_candidates(profile: &AppChatProfile) -> Vec<std::path::PathBuf> {
    let mut out = Vec::new();
    let Ok(local) = std::env::var("LOCALAPPDATA") else {
        return out;
    };
    let local = std::path::PathBuf::from(local);
    let rels: &[&str] = match profile.id {
        QODER_APP_TARGET_ID => &[
            "Programs\\Qoder\\Qoder.exe",
            "Qoder\\Qoder.exe",
            "Qoder CN\\Qoder CN.exe",
            "Programs\\Qoder CN\\Qoder CN.exe",
        ],
        MINIMAX_APP_TARGET_ID => &[
            "Programs\\MiniMax Code\\MiniMax Code.exe",
            "MiniMax Code\\MiniMax Code.exe",
            "Programs\\MiniMax\\MiniMax Code.exe",
            "Programs\\MiniMax\\MiniMax Code Desktop.exe",
        ],
        WORKBUDDY_APP_TARGET_ID => &[
            "Programs\\WorkBuddy\\WorkBuddy.exe",
            "WorkBuddy\\WorkBuddy.exe",
        ],
        TRAE_APP_TARGET_ID | TRAE_CHAT_LEGACY_APP_TARGET_ID => &[
            "Programs\\TRAE SOLO\\TRAE SOLO.exe",
            "TRAE SOLO\\TRAE SOLO.exe",
            "TRAE SOLO CN\\TRAE SOLO CN.exe",
            "Programs\\TRAE SOLO CN\\TRAE SOLO CN.exe",
        ],
        TRAE_CODE_APP_TARGET_ID => &[
            "Programs\\Trae\\Trae.exe",
            "Trae\\Trae.exe",
            "Trae CN\\Trae CN.exe",
            "Programs\\Trae CN\\Trae CN.exe",
        ],
        WINDSURF_APP_TARGET_ID => &["Programs\\Windsurf\\Windsurf.exe", "Windsurf\\Windsurf.exe"],
        _ => &[],
    };
    for rel in rels {
        out.push(local.join(rel));
    }
    out
}

/// Read Uninstall keys for DisplayIcon / InstallLocation — never execute UninstallString.
#[cfg(windows)]
fn probe_uninstall_exe(profile: &AppChatProfile) -> Option<std::path::PathBuf> {
    let display_needles: &[&str] = match profile.id {
        QODER_APP_TARGET_ID => &["Qoder CN", "Qoder"],
        // Do not use bare "MiniMax" — matches "MiniMax Design".
        MINIMAX_APP_TARGET_ID => &["MiniMax Code"],
        WORKBUDDY_APP_TARGET_ID => &["WorkBuddy"],
        TRAE_APP_TARGET_ID | TRAE_CHAT_LEGACY_APP_TARGET_ID => {
            &["TRAE SOLO CN", "TRAE SOLO", "Trae Solo", "TraeWork"]
        }
        // Prefer CN / Code labels — bare "Trae" also hits Trae Work uninstall rows.
        TRAE_CODE_APP_TARGET_ID => &["Trae CN", "TraeCode", "Trae Code"],
        WINDSURF_APP_TARGET_ID => &["Windsurf"],
        _ => return None,
    };
    let roots = [
        r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall",
        r"SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall",
    ];
    for hive in [
        winreg::RegKey::predef(winreg::enums::HKEY_CURRENT_USER),
        winreg::RegKey::predef(winreg::enums::HKEY_LOCAL_MACHINE),
    ] {
        for root in roots {
            let Ok(key) = hive.open_subkey(root) else {
                continue;
            };
            for sub_name in key.enum_keys().filter_map(|r| r.ok()) {
                let Ok(sub) = key.open_subkey(&sub_name) else {
                    continue;
                };
                let display: String = sub.get_value("DisplayName").unwrap_or_default();
                if !display_needles.iter().any(|n| {
                    display
                        .to_ascii_lowercase()
                        .contains(&n.to_ascii_lowercase())
                }) {
                    continue;
                }
                if let Ok(icon) = sub.get_value::<String, _>("DisplayIcon") {
                    let cleaned = icon
                        .split(',')
                        .next()
                        .unwrap_or("")
                        .trim()
                        .trim_matches('"');
                    let path = std::path::PathBuf::from(cleaned);
                    if validate_launch_exe(&path, profile) {
                        return Some(path);
                    }
                    // Portable MiniMax: DisplayIcon is uninstallerIcon.ico, InstallLocation empty.
                    if let Some(dir) = path.parent() {
                        for exe_name in profile.process_names {
                            let candidate = dir.join(exe_name);
                            if validate_launch_exe(&candidate, profile) {
                                return Some(candidate);
                            }
                        }
                    }
                }
                if let Ok(loc) = sub.get_value::<String, _>("InstallLocation") {
                    let loc = loc.trim().trim_matches('"');
                    if loc.is_empty() {
                        continue;
                    }
                    for exe_name in profile.process_names {
                        let path = std::path::PathBuf::from(loc).join(exe_name);
                        if validate_launch_exe(&path, profile) {
                            return Some(path);
                        }
                    }
                }
            }
        }
    }
    None
}

#[cfg(windows)]
fn launch_from_localappdata(profile: &AppChatProfile) -> bool {
    if profile.launch_localappdata_rel.is_empty() {
        return false;
    }
    let Ok(local) = std::env::var("LOCALAPPDATA") else {
        return false;
    };
    let Some(exe) = profile
        .launch_localappdata_rel
        .iter()
        .map(|rel| std::path::PathBuf::from(&local).join(rel))
        .find(|path| path.is_file())
    else {
        return false;
    };
    launch_gui_exe(&exe)
}

/// Codex is a Store/AppX package — do not ShellExecute WindowsApps\...\ChatGPT.exe directly.
#[cfg(windows)]
fn launch_codex_store_app() -> bool {
    if launch_start_menu_shortcut(&["Codex", "OpenAI Codex", "ChatGPT Codex"]) {
        return true;
    }
    if let Some(aumid) = discover_codex_aumid() {
        if launch_shell_apps_folder(&aumid) {
            return true;
        }
    }
    // Known publisher id from packaged Codex installs (version segment may vary).
    launch_shell_apps_folder("OpenAI.Codex_2p2nqsd0c76g0!App")
}

#[cfg(windows)]
fn launch_start_menu_shortcut(name_needles: &[&str]) -> bool {
    let mut roots = Vec::new();
    if let Ok(appdata) = std::env::var("APPDATA") {
        roots.push(
            std::path::PathBuf::from(appdata).join("Microsoft\\Windows\\Start Menu\\Programs"),
        );
    }
    if let Ok(program_data) = std::env::var("ProgramData") {
        roots.push(
            std::path::PathBuf::from(program_data).join("Microsoft\\Windows\\Start Menu\\Programs"),
        );
    }
    for root in roots {
        if let Some(lnk) = find_lnk_by_name(&root, name_needles, 0) {
            if launch_gui_exe(&lnk) {
                return true;
            }
        }
    }
    false
}

#[cfg(windows)]
fn find_lnk_by_name(
    dir: &std::path::Path,
    name_needles: &[&str],
    depth: usize,
) -> Option<std::path::PathBuf> {
    if depth > 4 || !dir.is_dir() {
        return None;
    }
    let entries = std::fs::read_dir(dir).ok()?;
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            if let Some(hit) = find_lnk_by_name(&path, name_needles, depth + 1) {
                return Some(hit);
            }
            continue;
        }
        let name = path.file_name()?.to_string_lossy().to_ascii_lowercase();
        if !name.ends_with(".lnk") {
            continue;
        }
        if name_needles
            .iter()
            .any(|n| name.contains(&n.to_ascii_lowercase()))
        {
            return Some(path);
        }
    }
    None
}

#[cfg(windows)]
fn discover_codex_aumid() -> Option<String> {
    let local = std::env::var("LOCALAPPDATA").ok()?;
    let packages = std::path::PathBuf::from(local).join("Packages");
    let entries = std::fs::read_dir(packages).ok()?;
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().into_owned();
        if !name.to_ascii_lowercase().starts_with("openai.codex_") {
            continue;
        }
        let family = package_family_name_from_folder(&name).unwrap_or(name);
        return Some(format!("{family}!App"));
    }
    None
}

/// `OpenAI.Codex_26.x_x64__publisher` → `OpenAI.Codex_publisher`
fn package_family_name_from_folder(folder: &str) -> Option<String> {
    let (left, publisher) = folder.rsplit_once("__")?;
    let app_name = left.split('_').next()?;
    if app_name.is_empty() || publisher.is_empty() {
        return None;
    }
    Some(format!("{app_name}_{publisher}"))
}

#[cfg(test)]
mod ensure_launch_tests {
    use super::package_family_name_from_folder;

    #[test]
    fn package_family_name_from_codex_folder() {
        assert_eq!(
            package_family_name_from_folder("OpenAI.Codex_26.715.7063.0_x64__2p2nqsd0c76g0")
                .as_deref(),
            Some("OpenAI.Codex_2p2nqsd0c76g0")
        );
    }
}

#[cfg(test)]
mod editor_document_score_tests {
    use super::looks_like_editor_document;

    #[test]
    fn rejects_cursor_tab_with_input_in_filename() {
        assert!(looks_like_editor_document(
            "input-aim-calibrate-3ways.html - voice-pilot - Cursor - Untracked [Administrator]"
        ));
    }

    #[test]
    fn rejects_editor_a11y_banner() {
        assert!(looks_like_editor_document(
            "The editor is not accessible at this time. To enable screen reader optimized mode, use Shift+Alt+F1"
        ));
    }

    #[test]
    fn allows_real_composer_names() {
        assert!(!looks_like_editor_document("Chat input"));
        assert!(!looks_like_editor_document("Agent"));
        assert!(!looks_like_editor_document(""));
    }

    #[test]
    fn cursor_agent_min_x_keeps_right_panel() {
        assert!(super::CURSOR_AGENT_MIN_X_RATIO >= 0.5);
        assert!(super::CURSOR_PROFILE.composer_anchor.0 >= super::CURSOR_AGENT_MIN_X_RATIO);
    }
}

#[cfg(windows)]
fn launch_shell_apps_folder(aumid: &str) -> bool {
    let aumid = aumid.trim();
    if aumid.is_empty() {
        return false;
    }
    let uri = format!("shell:AppsFolder\\{aumid}");
    launch_shell_uri(&uri)
}

#[cfg(windows)]
fn launch_shell_uri(uri: &str) -> bool {
    use std::ffi::OsStr;
    use std::os::windows::ffi::OsStrExt;
    use winapi::um::shellapi::ShellExecuteW;
    use winapi::um::winuser::SW_SHOWDEFAULT;

    fn wide(s: &str) -> Vec<u16> {
        OsStr::new(s).encode_wide().chain(Some(0)).collect()
    }

    let file = wide(uri);
    let op = wide("open");
    unsafe {
        let ret = ShellExecuteW(
            std::ptr::null_mut(),
            op.as_ptr(),
            file.as_ptr(),
            std::ptr::null(),
            std::ptr::null(),
            SW_SHOWDEFAULT,
        );
        (ret as isize) > 32
    }
}

#[cfg(windows)]
fn launch_gui_exe(path: &std::path::Path) -> bool {
    use std::ffi::OsStr;
    use std::os::windows::ffi::OsStrExt;
    use winapi::um::shellapi::ShellExecuteW;
    use winapi::um::winuser::SW_SHOWDEFAULT;

    fn wide(s: &str) -> Vec<u16> {
        OsStr::new(s).encode_wide().chain(Some(0)).collect()
    }

    let file = wide(&path.to_string_lossy());
    let op = wide("open");
    let dir = path
        .parent()
        .map(|p| wide(&p.to_string_lossy()))
        .unwrap_or_default();

    unsafe {
        let ret = ShellExecuteW(
            std::ptr::null_mut(),
            op.as_ptr(),
            file.as_ptr(),
            std::ptr::null(),
            if dir.is_empty() {
                std::ptr::null()
            } else {
                dir.as_ptr()
            },
            SW_SHOWDEFAULT,
        );
        (ret as isize) > 32
    }
}

/// Prefer main-size chrome when ranking same title-hit class.
#[cfg(windows)]
const APP_CHAT_MAIN_AREA: i64 = 100_000;

#[cfg(windows)]
fn find_app_window(profile: &AppChatProfile) -> Option<winapi::shared::windef::HWND> {
    // Always include hidden — MiniMax's titled chrome can be IsWindowVisible=0 / iconic.
    find_app_window_impl(profile, true)
}

#[cfg(windows)]
fn find_app_window_impl(
    profile: &AppChatProfile,
    include_hidden: bool,
) -> Option<winapi::shared::windef::HWND> {
    use winapi::shared::minwindef::{BOOL, LPARAM, TRUE};
    use winapi::shared::windef::{HWND, RECT};
    use winapi::um::winuser::{
        EnumWindows, GetForegroundWindow, GetWindow, GetWindowLongW, GetWindowRect,
        GetWindowThreadProcessId, IsWindowVisible, GWL_EXSTYLE, GW_OWNER, WS_EX_TOOLWINDOW,
    };

    struct EnumCtx {
        profile: AppChatProfile,
        include_hidden: bool,
        candidates: Vec<Candidate>,
    }

    struct Candidate {
        hwnd: HWND,
        area: i64,
        visible: bool,
        title_hit: bool,
        is_foreground: bool,
    }

    unsafe extern "system" fn enum_proc(hwnd: HWND, lparam: LPARAM) -> BOOL {
        let ctx = &mut *(lparam as *mut EnumCtx);
        let visible = IsWindowVisible(hwnd) != 0;
        if !visible && !ctx.include_hidden {
            return TRUE;
        }
        if !GetWindow(hwnd, GW_OWNER).is_null() {
            return TRUE;
        }
        if GetWindowLongW(hwnd, GWL_EXSTYLE) & WS_EX_TOOLWINDOW as i32 != 0 {
            return TRUE;
        }
        let mut pid = 0u32;
        GetWindowThreadProcessId(hwnd, &mut pid);
        if pid == 0 || !process_matches_profile(pid, &ctx.profile) {
            return TRUE;
        }
        let mut rect = RECT {
            left: 0,
            top: 0,
            right: 0,
            bottom: 0,
        };
        if GetWindowRect(hwnd, &mut rect) == 0 {
            return TRUE;
        }
        let area = (rect.right - rect.left) as i64 * (rect.bottom - rect.top) as i64;
        if area <= 0 {
            return TRUE;
        }
        // Hidden candidates must look like a real UI surface.
        if !visible && area < 20_000 {
            return TRUE;
        }
        let title = crate::app_identity::identity_for_window(hwnd)
            .map(|id| id.window_title)
            .unwrap_or_default();
        let class_name = window_class_name(hwnd);
        if is_helper_app_window(&title, &class_name, area) {
            return TRUE;
        }
        // MiniMax: untitled Chrome_WidgetWin_0 is a background host; the real UI is
        // titled "MiniMax Code" (even when iconic / area ~4k at -32000).
        if ctx.profile.id == MINIMAX_APP_TARGET_ID
            && title.trim().is_empty()
            && class_name.eq_ignore_ascii_case("Chrome_WidgetWin_0")
        {
            return TRUE;
        }
        let fg = GetForegroundWindow();
        ctx.candidates.push(Candidate {
            hwnd,
            area,
            visible,
            title_hit: title_matches_profile(&ctx.profile, &title),
            is_foreground: fg == hwnd,
        });
        TRUE
    }

    let mut ctx = EnumCtx {
        profile: *profile,
        include_hidden,
        candidates: Vec::new(),
    };
    unsafe {
        EnumWindows(Some(enum_proc), &mut ctx as *mut EnumCtx as LPARAM);
    }
    ctx.candidates
        .into_iter()
        .max_by_key(|c: &Candidate| {
            // Title match first: MiniMax iconic titled strip must beat a larger
            // untitled WidgetWin_0 host (restore expands the titled HWND).
            (
                c.title_hit,
                c.area >= APP_CHAT_MAIN_AREA,
                c.area,
                c.visible,
                c.is_foreground,
            )
        })
        .map(|c| c.hwnd)
}

#[cfg(windows)]
fn title_matches_profile(profile: &AppChatProfile, title: &str) -> bool {
    let t = title.trim().to_ascii_lowercase();
    if t.is_empty() {
        return false;
    }
    let needles: &[&str] = match profile.id {
        MINIMAX_APP_TARGET_ID => &["minimax"],
        WORKBUDDY_APP_TARGET_ID => &["workbuddy", "codebuddy"],
        CURSOR_APP_TARGET_ID => &["cursor"],
        CODEX_APP_TARGET_ID => &["codex", "chatgpt"],
        CLAUDE_CODE_APP_TARGET_ID => &["claude"],
        QODER_APP_TARGET_ID => &["qoder"],
        TRAE_APP_TARGET_ID | TRAE_CHAT_LEGACY_APP_TARGET_ID => &["trae solo", "traework", "solo"],
        // Avoid matching Trae Work titles that only say "TRAE SOLO".
        TRAE_CODE_APP_TARGET_ID => &["traecode", "trae cn", "trae ide"],
        WINDSURF_APP_TARGET_ID => &["windsurf"],
        _ => return true,
    };
    needles.iter().any(|n| t.contains(n))
}

#[cfg(windows)]
fn process_matches_profile(pid: u32, profile: &AppChatProfile) -> bool {
    crate::app_identity::process_image_path(pid).is_some_and(|path| {
        let file_name = path.rsplit(['\\', '/']).next().unwrap_or_default();
        let name_ok = profile
            .process_names
            .iter()
            .any(|name| file_name.eq_ignore_ascii_case(name));
        if !name_ok {
            return false;
        }
        profile
            .path_marker
            .map(|marker| {
                path.to_ascii_lowercase()
                    .contains(&marker.to_ascii_lowercase())
            })
            .unwrap_or(true)
    })
}

#[cfg(windows)]
fn uia_focus_chat_input(hwnd: winapi::shared::windef::HWND, min_score: i32) -> bool {
    uia_focus_chat_input_probe(hwnd, min_score).ok
}

#[cfg(windows)]
struct UiaFocusProbe {
    ok: bool,
    best_name: String,
    best_score: i32,
    focused_name: String,
    focused_score: i32,
    has_keyboard_focus: bool,
    /// Client X ratio of the focused input (0=left … 1=right). Cursor Agent is ≥0.55.
    focused_x_ratio: Option<f32>,
}

/// SetFocus on best Edit/Document, then confirm HasKeyboardFocus (or focused name scores high).
#[cfg(windows)]
fn uia_focus_chat_input_verified(hwnd: winapi::shared::windef::HWND, min_score: i32) -> bool {
    uia_focus_chat_input_probe(hwnd, min_score).ok
}

#[cfg(windows)]
fn uia_focus_chat_input_probe(hwnd: winapi::shared::windef::HWND, min_score: i32) -> UiaFocusProbe {
    use windows::core::VARIANT;
    use windows::Win32::Foundation::HWND as WinHwnd;
    use windows::Win32::System::Com::{
        CoCreateInstance, CoInitializeEx, CLSCTX_INPROC_SERVER, COINIT_APARTMENTTHREADED,
    };
    use windows::Win32::UI::Accessibility::{
        CUIAutomation, IUIAutomation, IUIAutomationElement, TreeScope_Descendants,
        UIA_ControlTypePropertyId, UIA_DocumentControlTypeId, UIA_EditControlTypeId,
        UIA_HasKeyboardFocusPropertyId,
    };

    let empty = || UiaFocusProbe {
        ok: false,
        best_name: String::new(),
        best_score: -1,
        focused_name: String::new(),
        focused_score: -1,
        has_keyboard_focus: false,
        focused_x_ratio: None,
    };

    unsafe {
        let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
        let automation: IUIAutomation =
            match CoCreateInstance(&CUIAutomation, None, CLSCTX_INPROC_SERVER) {
                Ok(v) => v,
                Err(_) => return empty(),
            };
        let root = match automation.ElementFromHandle(WinHwnd(hwnd as *mut _)) {
            Ok(v) => v,
            Err(_) => return empty(),
        };

        let mut best: Option<(IUIAutomationElement, i32, String)> = None;
        for control_type in [UIA_EditControlTypeId, UIA_DocumentControlTypeId] {
            let value = VARIANT::from(control_type.0);
            let condition =
                match automation.CreatePropertyCondition(UIA_ControlTypePropertyId, &value) {
                    Ok(v) => v,
                    Err(_) => continue,
                };
            let elements = match root.FindAll(TreeScope_Descendants, &condition) {
                Ok(v) => v,
                Err(_) => continue,
            };
            let len = elements.Length().unwrap_or(0);
            for i in 0..len {
                let Ok(element) = elements.GetElement(i) else {
                    continue;
                };
                if !element_is_enabled_and_focusable(&element) {
                    continue;
                }
                let name = element_name(&element).unwrap_or_default();
                let mut score = score_input_name(&name, control_type.0 as i32);
                // Prefer right-panel Agent over left/center Monaco editor.
                if let Some(xr) = element_client_x_ratio(hwnd, &element) {
                    if xr >= CURSOR_AGENT_MIN_X_RATIO {
                        score += 35;
                    } else if xr < 0.50 {
                        score -= 50;
                    }
                }
                if score > best.as_ref().map(|(_, s, _)| *s).unwrap_or(-1) {
                    best = Some((element, score, name));
                }
            }
        }

        let (pre_best_score, pre_best_name) = best
            .as_ref()
            .map(|(_, s, n)| (*s, n.clone()))
            .unwrap_or((-1, String::new()));
        let Some((element, score, best_name)) = best.filter(|(_, score, _)| *score >= min_score)
        else {
            let (focused_name, focused_score, focused_x_ratio) =
                focused_input_probe_full(&automation, hwnd);
            return UiaFocusProbe {
                ok: false,
                best_name: pre_best_name,
                best_score: pre_best_score,
                focused_name,
                focused_score,
                has_keyboard_focus: false,
                focused_x_ratio,
            };
        };
        if element.SetFocus().is_err() {
            let (focused_name, focused_score, focused_x_ratio) =
                focused_input_probe_full(&automation, hwnd);
            return UiaFocusProbe {
                ok: false,
                best_name,
                best_score: score,
                focused_name,
                focused_score,
                has_keyboard_focus: false,
                focused_x_ratio,
            };
        }
        std::thread::sleep(Duration::from_millis(60));
        let has_focus = element
            .GetCurrentPropertyValue(UIA_HasKeyboardFocusPropertyId)
            .ok()
            .and_then(|v| bool::try_from(&v).ok())
            .unwrap_or(false);
        let (focused_name, focused_score, focused_x_ratio) =
            focused_input_probe_full(&automation, hwnd);
        if has_focus {
            return UiaFocusProbe {
                ok: true,
                best_name,
                best_score: score,
                focused_name,
                focused_score,
                has_keyboard_focus: true,
                focused_x_ratio,
            };
        }
        // Fallback: focused element elsewhere in tree may still be a high-score composer.
        let ok = focused_score >= min_score;
        UiaFocusProbe {
            ok,
            best_name,
            best_score: score,
            focused_name,
            focused_score,
            has_keyboard_focus: false,
            focused_x_ratio,
        }
    }
}

#[cfg(windows)]
unsafe fn element_client_x_ratio(
    hwnd: winapi::shared::windef::HWND,
    element: &windows::Win32::UI::Accessibility::IUIAutomationElement,
) -> Option<f32> {
    use winapi::shared::windef::{POINT, RECT};
    use winapi::um::winuser::{GetClientRect, ScreenToClient};
    use windows::Win32::Foundation::POINT as WinPoint;

    let mut pt = WinPoint { x: 0, y: 0 };
    let got = element.GetClickablePoint(&mut pt as *mut _).ok()?;
    if !got.as_bool() {
        return None;
    }
    let mut cpt = POINT { x: pt.x, y: pt.y };
    if ScreenToClient(hwnd, &mut cpt) == 0 {
        return None;
    }
    let mut crect = RECT {
        left: 0,
        top: 0,
        right: 0,
        bottom: 0,
    };
    if GetClientRect(hwnd, &mut crect) == 0 {
        return None;
    }
    let cw = (crect.right - crect.left).max(1) as f32;
    Some((cpt.x as f32 / cw).clamp(0.0, 1.0))
}

#[cfg(windows)]
unsafe fn focused_input_probe(
    automation: &windows::Win32::UI::Accessibility::IUIAutomation,
) -> (String, i32) {
    let (n, s, _) = focused_input_probe_full(automation, std::ptr::null_mut());
    (n, s)
}

#[cfg(windows)]
unsafe fn focused_input_probe_full(
    automation: &windows::Win32::UI::Accessibility::IUIAutomation,
    hwnd: winapi::shared::windef::HWND,
) -> (String, i32, Option<f32>) {
    use windows::Win32::UI::Accessibility::{UIA_DocumentControlTypeId, UIA_EditControlTypeId};
    let Ok(focused) = automation.GetFocusedElement() else {
        return (String::new(), -1, None);
    };
    let name = element_name(&focused).unwrap_or_default();
    let fs = score_input_name(&name, UIA_EditControlTypeId.0 as i32)
        .max(score_input_name(&name, UIA_DocumentControlTypeId.0 as i32));
    let xr = if hwnd.is_null() {
        None
    } else {
        element_client_x_ratio(hwnd, &focused)
    };
    (name, fs, xr)
}

#[cfg(windows)]
unsafe fn element_is_enabled_and_focusable(
    element: &windows::Win32::UI::Accessibility::IUIAutomationElement,
) -> bool {
    use windows::Win32::UI::Accessibility::{
        UIA_IsEnabledPropertyId, UIA_IsKeyboardFocusablePropertyId,
    };

    let enabled = element
        .GetCurrentPropertyValue(UIA_IsEnabledPropertyId)
        .ok()
        .and_then(|v| bool::try_from(&v).ok())
        .unwrap_or(false);
    let focusable = element
        .GetCurrentPropertyValue(UIA_IsKeyboardFocusablePropertyId)
        .ok()
        .and_then(|v| bool::try_from(&v).ok())
        .unwrap_or(false);
    enabled && focusable
}

#[cfg(windows)]
unsafe fn element_name(
    element: &windows::Win32::UI::Accessibility::IUIAutomationElement,
) -> Option<String> {
    use windows::core::BSTR;
    use windows::Win32::UI::Accessibility::UIA_NamePropertyId;

    element
        .GetCurrentPropertyValue(UIA_NamePropertyId)
        .ok()
        .and_then(|v| BSTR::try_from(&v).ok())
        .map(|s| s.to_string())
}

#[cfg(windows)]
fn score_input_name(name: &str, control_type: i32) -> i32 {
    use windows::Win32::UI::Accessibility::{UIA_DocumentControlTypeId, UIA_EditControlTypeId};

    let lower = name.to_ascii_lowercase();
    let mut score = 0;
    if lower.contains("composer") {
        score += 60;
    }
    if lower.contains("chat") {
        score += 50;
    }
    if lower.contains("thread") {
        score += 35;
    }
    if lower.contains("input") {
        score += 40;
    }
    if lower.contains("ask") {
        score += 30;
    }
    if lower.contains("message") {
        score += 20;
    }
    if lower.contains("prompt") {
        score += 25;
    }
    if lower.contains("minimax") {
        score += 30;
    }
    if lower.contains("agent") {
        score += 25;
    }
    // MiniMax / WorkBuddy Chinese placeholders.
    if name.contains("输入") || name.contains("对话") || name.contains("提问") || name.contains("消息")
    {
        score += 35;
    }
    // Demote search / filter / find — not Composer.
    if lower.contains("search") || lower.contains("filter") || lower.contains("find") {
        score -= 45;
    }
    // Git SCM commit box also contains "message" — never treat as Agent composer.
    if lower.contains("commit") || lower.contains("source control") || lower.contains("scm") {
        score -= 80;
    }
    // Empty Document is usually the code editor — never prefer it over Chat/Agent Edit.
    if name.trim().is_empty() && control_type == UIA_DocumentControlTypeId.0 as i32 {
        score -= 40;
    }
    // Editor tab titles must lose hard — "input" in a filename is not a chat box.
    if looks_like_editor_document(name) {
        score -= 100;
    }
    if control_type == UIA_EditControlTypeId.0 as i32 {
        score += 10;
    } else if control_type == UIA_DocumentControlTypeId.0 as i32 {
        score += 5;
    }
    score
}

#[cfg(not(windows))]
pub fn run_for_custom_rule(
    _state: &Arc<AppState>,
    _window: &WebviewWindow,
    _mapping_id: &str,
    _rule: &crate::config::AppBehaviorRule,
    _duration_ms: u32,
) -> Result<String, (String, AppChatWorkflowError)> {
    Err(("custom".to_string(), AppChatWorkflowError::NotFound))
}

#[cfg(windows)]
pub fn run_for_custom_rule(
    state: &Arc<AppState>,
    window: &WebviewWindow,
    mapping_id: &str,
    rule: &crate::config::AppBehaviorRule,
    duration_ms: u32,
) -> Result<String, (String, AppChatWorkflowError)> {
    if !crate::send_guard::wait_until_inactive(800) {
        return Err(("custom".to_string(), AppChatWorkflowError::VoiceFailed));
    }

    let app = window.app_handle();
    let _hide_guard = MainWindowHideGuard::maybe_hide(&app);

    let (hwnd, freshly_launched) = ensure_custom_rule_window(rule)
        .ok_or(("custom".to_string(), AppChatWorkflowError::NotFound))?;
    if freshly_launched {
        std::thread::sleep(Duration::from_millis(1200));
    }

    if !crate::keyboard::focus_window(hwnd) {
        return Err(("custom".to_string(), AppChatWorkflowError::FocusFailed));
    }
    std::thread::sleep(Duration::from_millis(120));

    activate_voice_for_custom(state, &app, hwnd, mapping_id, duration_ms)?;

    let label = rule
        .display_name
        .as_deref()
        .filter(|s| !s.trim().is_empty())
        .unwrap_or("custom")
        .to_string();
    Ok(format!("{label}_summon"))
}

#[cfg(windows)]
fn activate_voice_for_custom(
    state: &Arc<AppState>,
    app: &AppHandle,
    hwnd: winapi::shared::windef::HWND,
    mapping_id: &str,
    duration_ms: u32,
) -> Result<(), (String, AppChatWorkflowError)> {
    let _ = crate::keyboard::focus_window(hwnd);
    std::thread::sleep(Duration::from_millis(70));

    let voice_key = {
        let cfg = state.cfg.lock();
        let mapping = cfg.find_mapping_by_id(mapping_id);
        crate::voice_end_runtime::resolve_voice_key_for_mapping(&cfg, mapping)
    }
    .ok_or(("custom".to_string(), AppChatWorkflowError::VoiceFailed))?;

    if crate::voice_end_runtime::session_state(state.as_ref()) == "dictating" {
        crate::voice_end_runtime::handle_trigger_press_while_dictating(state, app, mapping_id);
        return Ok(());
    }

    if !crate::keyboard::send_chord(&voice_key, duration_ms) {
        return Err(("custom".to_string(), AppChatWorkflowError::VoiceFailed));
    }
    crate::voice_end_runtime::mark_voice_wake_key_sent(state.as_ref());

    std::thread::sleep(Duration::from_millis(180));

    if crate::voice_end_runtime::can_enter_dictating(&state.cfg.lock()) {
        crate::voice_end_runtime::enter_dictating(state, Some(app), mapping_id, "custom summon");
    }

    Ok(())
}

#[cfg(windows)]
fn ensure_custom_rule_window(
    rule: &crate::config::AppBehaviorRule,
) -> Option<(winapi::shared::windef::HWND, bool)> {
    // Prefer a visible main window; fall back to tray/hidden (WeChat etc.).
    if let Some(hwnd) = find_window_for_rule(rule, false) {
        return Some((hwnd, false));
    }
    if let Some(hwnd) = find_window_for_rule(rule, true) {
        return Some((hwnd, false));
    }

    // Process already running: never ShellExecute a second instance.
    if rule_process_running(rule) {
        for _ in 0..24 {
            std::thread::sleep(Duration::from_millis(250));
            if let Some(hwnd) = find_window_for_rule(rule, true) {
                return Some((hwnd, false));
            }
        }
        crate::app_log::sync_emergency_line(
            "chat_workflow",
            &format!(
                "custom rule {}: process running but no activatable window; refusing relaunch",
                rule.rule_id
            ),
        );
        return None;
    }

    // Concurrent acoustic + phrase hits: poll instead of a second ShellExecute.
    if custom_rule_launched_recently(&rule.rule_id, Duration::from_secs(4)) {
        for _ in 0..24 {
            std::thread::sleep(Duration::from_millis(250));
            if let Some(hwnd) = find_window_for_rule(rule, true) {
                return Some((hwnd, false));
            }
            if rule_process_running(rule) {
                continue;
            }
        }
        return None;
    }

    let spec = rule.app_match.as_ref()?;
    let path = spec
        .full_path
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())?;
    let path = std::path::Path::new(path);
    mark_custom_rule_launched(&rule.rule_id);
    if !path.is_file() || !launch_gui_exe(path) {
        return None;
    }
    for _ in 0..40 {
        std::thread::sleep(Duration::from_millis(250));
        if let Some(hwnd) = find_window_for_rule(rule, true) {
            return Some((hwnd, true));
        }
        // Another concurrent summon or slow show: bail without a second ShellExecute.
        if rule_process_running(rule) {
            if let Some(hwnd) = find_window_for_rule(rule, true) {
                return Some((hwnd, true));
            }
        }
    }
    None
}

/// True when a live process matches the rule's exe / path constraints.
#[cfg(windows)]
fn rule_process_running(rule: &crate::config::AppBehaviorRule) -> bool {
    use winapi::um::handleapi::{CloseHandle, INVALID_HANDLE_VALUE};
    use winapi::um::tlhelp32::{
        CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W,
        TH32CS_SNAPPROCESS,
    };

    let Some(spec) = rule.app_match.as_ref() else {
        return false;
    };
    if !crate::config::app_match_has_constraints(spec) {
        return false;
    }

    unsafe {
        let snap = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
        if snap.is_null() || snap == INVALID_HANDLE_VALUE {
            return false;
        }
        let mut entry: PROCESSENTRY32W = std::mem::zeroed();
        entry.dwSize = std::mem::size_of::<PROCESSENTRY32W>() as u32;
        let mut found = false;
        if Process32FirstW(snap, &mut entry) != 0 {
            loop {
                let pid = entry.th32ProcessID;
                if pid > 0 {
                    let exe_name = String::from_utf16_lossy(
                        &entry.szExeFile[..entry
                            .szExeFile
                            .iter()
                            .position(|&c| c == 0)
                            .unwrap_or(entry.szExeFile.len())],
                    );
                    let full_path = crate::app_identity::process_image_path(pid);
                    let identity = crate::app_identity::AppIdentity {
                        pid,
                        exe_name,
                        full_path,
                        window_title: String::new(),
                        window_class: None,
                        matched_preset_app_id: None,
                    };
                    if crate::config::rule_matches_identity_for_summon(rule, &identity) {
                        found = true;
                        break;
                    }
                }
                if Process32NextW(snap, &mut entry) == 0 {
                    break;
                }
            }
        }
        CloseHandle(snap);
        found
    }
}

#[cfg(windows)]
fn window_class_name(hwnd: winapi::shared::windef::HWND) -> String {
    use winapi::um::winuser::GetClassNameW;
    unsafe {
        let mut buf = [0u16; 256];
        let len = GetClassNameW(hwnd, buf.as_mut_ptr(), buf.len() as i32);
        if len <= 0 {
            return String::new();
        }
        String::from_utf16_lossy(&buf[..len as usize])
    }
}

/// WeChat / Chromium helpers keep HWNDs that share the exe name but are not the chat UI.
/// MiniMax exposes a large visible `Mavis Browser Background Render Host` while the
/// real `MiniMax Code` window is minimized or hidden — focusing the host looks like
/// "didn't jump".
#[cfg(windows)]
fn is_helper_app_window(title: &str, class_name: &str, area: i64) -> bool {
    let title = title.trim();
    let class_name = class_name.trim();
    let hay = format!("{title} {class_name}").to_ascii_lowercase();
    const NOISE: &[&str] = &[
        "trayicon",
        "messagewindow",
        "tooltip",
        "shadow",
        "notifyicon",
        "ime",
        "candidate",
        "background render host",
        "mavis browser",
    ];
    if NOISE.iter().any(|n| hay.contains(n)) {
        return true;
    }
    // WeChat tray IPC window title itself.
    if title.eq_ignore_ascii_case("WxTrayIconMessageWindow") {
        return true;
    }
    // Tiny blank windows (helpers often report near-zero size).
    if area > 0 && area < 8_000 && title.chars().all(|c| c.is_ascii_alphanumeric() || c == '_') {
        return true;
    }
    false
}

#[cfg(all(test, windows))]
mod handoff_window_tests {
    use super::*;
    use windows::Win32::UI::Accessibility::UIA_EditControlTypeId;

    #[test]
    fn rejects_minimax_background_render_host() {
        assert!(is_helper_app_window(
            "Mavis Browser Background Render Host 1",
            "Chrome_WidgetWin_1",
            921_600
        ));
        assert!(!is_helper_app_window(
            "MiniMax Code",
            "Chrome_WidgetWin_1",
            4_480
        ));
        assert!(title_matches_profile(&MINIMAX_PROFILE, "MiniMax Code"));
        assert!(!title_matches_profile(
            &MINIMAX_PROFILE,
            "Mavis Browser Background Render Host 1"
        ));
        // Ranking contract: titled iconic strip must outrank larger untitled host.
        let src = include_str!("app_chat_workflow.rs");
        assert!(
            src.contains("c.title_hit,")
                && src.contains("Chrome_WidgetWin_0")
                && src.contains("minimax_click_and_paste"),
            "MiniMax handoff must prefer titled chrome and use dedicated paste path"
        );
        // Cold-start: Desktop .lnk + uninstall-dir exe (portable E:\MiniMax Code\…).
        assert!(
            src.contains("join(\"Desktop\")") && src.contains("path.parent()"),
            "MiniMax launch must discover Desktop shortcut / uninstall install dir"
        );
        assert!(
            src.contains("chat_handoff_relaunch_hidden") && src.contains("force_show_hwnd"),
            "hidden MiniMax chrome must force-show / relaunch nudge"
        );
        assert!(
            src.contains("minimax_document_bottom_point") && src.contains("doc_bottom"),
            "MiniMax paste must click Document card bottom, not window-ratio spray"
        );
    }

    #[test]
    fn chinese_chat_input_name_scores() {
        let score = score_input_name("输入消息", UIA_EditControlTypeId.0 as i32);
        assert!(score >= 40, "score={score}");
    }

    #[test]
    fn cold_start_handoff_waits_for_composer_budget() {
        // Contract: freshly launched chat apps must poll longer than the old fixed 2.2s.
        let src = include_str!("app_chat_workflow.rs");
        assert!(
            src.contains("wait_chat_ui_ready"),
            "cold start must poll wait_chat_ui_ready before paste"
        );
        assert!(
            src.contains("12_000") || src.contains("12000"),
            "cold start budget must be ≥12s for MiniMax/WorkBuddy boot"
        );
        assert!(
            src.contains("chat_handoff_ready"),
            "must log when UI is considered ready"
        );
        assert!(
            src.contains("pasteHoldMs") && src.contains("electron_replace_paste"),
            "Ctrl+V must use a short hold; WorkBuddy/ChatGPT must replace-paste"
        );
        assert!(
            src.contains("uia_click_best_input_in_band"),
            "IDE UIA clicks must reject left-edge / mid-window false positives"
        );
        assert!(
            src.contains("ELECTRON_SEND_TEXT_MAX_CHARS")
                && src.contains("ctrl_v")
                && src.contains("send_text")
                && src.contains("Never Ctrl+A"),
            "replace-paste: long clip Ctrl+V first; short send_text; never Ctrl+A"
        );
        assert!(
            src.contains("write_handoff_md_backup"),
            "long handoff must offer md file backup for upload"
        );
        assert!(
            src.contains("APP_CHAT_MAIN_AREA"),
            "must prefer main-size HWND over MiniMax iconic strip"
        );
        assert!(
            src.contains("prepare_chat_hwnd"),
            "must show/restore MiniMax main chrome before click"
        );
        assert!(
            src.contains("paste_into_chat_composer") && src.contains("uia_set_best_input_value"),
            "MiniMax must fall back to UIA SetValue / send_text when Ctrl+V fails"
        );
    }
}

#[cfg(windows)]
fn find_window_for_rule(
    rule: &crate::config::AppBehaviorRule,
    include_hidden: bool,
) -> Option<winapi::shared::windef::HWND> {
    use winapi::shared::minwindef::{BOOL, LPARAM, TRUE};
    use winapi::shared::windef::{HWND, RECT};
    use winapi::um::winuser::{
        EnumWindows, GetForegroundWindow, GetWindow, GetWindowLongW, GetWindowRect,
        IsWindowVisible, GWL_EXSTYLE, GW_OWNER, WS_EX_TOOLWINDOW,
    };

    struct EnumCtx<'a> {
        rule: &'a crate::config::AppBehaviorRule,
        include_hidden: bool,
        candidates: Vec<Candidate>,
    }

    struct Candidate {
        hwnd: HWND,
        area: i64,
        visible: bool,
        is_foreground: bool,
        has_real_title: bool,
        prefers_chat_ui: bool,
    }

    unsafe extern "system" fn enum_proc(hwnd: HWND, lparam: LPARAM) -> BOOL {
        let ctx = &mut *(lparam as *mut EnumCtx);
        let visible = IsWindowVisible(hwnd) != 0;
        if !visible && !ctx.include_hidden {
            return TRUE;
        }
        if !GetWindow(hwnd, GW_OWNER).is_null() {
            return TRUE;
        }
        if GetWindowLongW(hwnd, GWL_EXSTYLE) & WS_EX_TOOLWINDOW as i32 != 0 {
            return TRUE;
        }
        let Some(identity) = crate::app_identity::identity_for_window(hwnd) else {
            return TRUE;
        };
        if !crate::config::rule_matches_identity_for_summon(ctx.rule, &identity) {
            return TRUE;
        }
        let mut rect = RECT {
            left: 0,
            top: 0,
            right: 0,
            bottom: 0,
        };
        let area = if GetWindowRect(hwnd, &mut rect) != 0 {
            ((rect.right - rect.left) as i64 * (rect.bottom - rect.top) as i64).max(0)
        } else {
            0
        };
        let class_name = window_class_name(hwnd);
        if is_helper_app_window(&identity.window_title, &class_name, area) {
            return TRUE;
        }
        // Hidden candidates must look like a real UI surface (not a zero-size IPC hwnd).
        if !visible && area < 20_000 {
            return TRUE;
        }
        if area <= 0 && visible {
            return TRUE;
        }
        let title = identity.window_title.trim();
        let has_real_title =
            !title.is_empty() && !(title.starts_with("Wx") && title.contains("Window"));
        // Prefer Chromium chat UI process over Weixin.exe launcher shells.
        let prefers_chat_ui = identity.exe_name.eq_ignore_ascii_case("WeChatAppEx.exe");
        let fg = GetForegroundWindow();
        ctx.candidates.push(Candidate {
            hwnd,
            area: area.max(1),
            visible,
            is_foreground: fg == hwnd,
            has_real_title,
            prefers_chat_ui,
        });
        TRUE
    }

    let mut ctx = EnumCtx {
        rule,
        include_hidden,
        candidates: Vec::new(),
    };
    unsafe {
        EnumWindows(Some(enum_proc), &mut ctx as *mut EnumCtx as LPARAM);
    }
    ctx.candidates
        .into_iter()
        .max_by_key(|c| {
            (
                c.visible,
                c.prefers_chat_ui,
                c.has_real_title,
                c.is_foreground,
                c.area,
            )
        })
        .map(|c| c.hwnd)
}
