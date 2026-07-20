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
    composer_anchor: (0.50, 0.88),
    accept_click_without_uia: true,
    post_voice_key_ms: 220,
    restore_main_delay_ms: 120,
    launch_localappdata_rel: &[],
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
    process_names: &["MiniMax Code.exe"],
    path_marker: Some("MiniMax Code"),
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

pub fn profile_for(app_target_id: &str) -> Option<&'static AppChatProfile> {
    match app_target_id {
        CURSOR_APP_TARGET_ID => Some(&CURSOR_PROFILE),
        CODEX_APP_TARGET_ID => Some(&CODEX_PROFILE),
        MINIMAX_APP_TARGET_ID => Some(&MINIMAX_PROFILE),
        CLAUDE_CODE_APP_TARGET_ID => Some(&CLAUDE_PROFILE),
        _ => None,
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
}

impl MainWindowHideGuard {
    fn maybe_hide(app: &AppHandle) -> Self {
        let hidden = if let Some(main) = crate::ipc::get_main_window(app) {
            let _ = main.run_on_main_thread({
                let w = main.clone();
                move || {
                    let _ = w.hide();
                }
            });
            std::thread::sleep(Duration::from_millis(80));
            true
        } else {
            false
        };
        Self {
            app: app.clone(),
            hidden,
        }
    }
}

impl Drop for MainWindowHideGuard {
    fn drop(&mut self) {
        // Intentionally leave the main window hidden after summon/voice start.
        // Re-showing (even with SW_SHOWNOACTIVATE) unminimizes OneTone and can still
        // disturb focus so the IME never commits into Cursor's composer.
        // User restores OneTone from the tray when needed.
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
        let foreground_matches =
            foreground_app_target_id().as_deref() == Some(app_target_id);
        if crate::voice_end_runtime::is_hold_to_talk_voice_key(&voice_key)
            && (mapping_targets_app || foreground_matches)
        {
            return run_hold_voice_foreground(
                state,
                window,
                mapping_id,
                &voice_key,
                profile,
            );
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

    if crate::voice_end_runtime::session_state(state.as_ref()) == "dictating" {
        crate::voice_end_runtime::handle_trigger_press_while_dictating(state, &app, mapping_id);
        crate::app_log::log_line(state.as_ref(), "hold", &format!("{prefix} hold toggle {mapping_id}"));
        return Ok(format!("{prefix}_hold_toggle"));
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

/// Focus the app composer without starting voice input (AgentAction openAgent / focusComposer).
#[cfg(windows)]
pub fn focus_composer_only(
    app: &AppHandle,
    app_target_id: &str,
    duration_ms: u32,
) -> Result<(), AppChatWorkflowError> {
    let profile = profile_for(app_target_id).ok_or(AppChatWorkflowError::NotFound)?;
    let _hide_guard = MainWindowHideGuard::maybe_hide(app);
    let (hwnd, freshly_launched) =
        ensure_app_window(profile).ok_or(AppChatWorkflowError::NotFound)?;
    if freshly_launched {
        std::thread::sleep(Duration::from_millis(2200));
    }
    if !crate::keyboard::focus_window(hwnd) {
        return Err(AppChatWorkflowError::FocusFailed);
    }
    std::thread::sleep(Duration::from_millis(120));
    if !focus_chat_input(hwnd, profile, duration_ms) {
        return Err(AppChatWorkflowError::InputNotFound);
    }
    std::thread::sleep(Duration::from_millis(80));
    Ok(())
}

#[cfg(not(windows))]
pub fn focus_composer_only(
    _app: &AppHandle,
    _app_target_id: &str,
    _duration_ms: u32,
) -> Result<(), AppChatWorkflowError> {
    Err(AppChatWorkflowError::NotFound)
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

    if !focus_chat_input(hwnd, profile, duration_ms) {
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
) -> bool {
    let min_score = uia_min_score(profile);

    // Soft path first: panel already open → focus without Ctrl+I.
    // Ctrl+I toggles Agent/composer; sending it while open closes the input.
    if uia_focus_chat_input(hwnd, min_score) {
        return true;
    }
    if profile.accept_click_without_uia && click_then_confirm(hwnd, profile, min_score) {
        return true;
    }

    // Hard open once: only when soft probe failed (panel likely closed).
    if let Some(open_key) = profile.open_key.filter(|k| !k.trim().is_empty()) {
        let _ = crate::keyboard::focus_window(hwnd);
        std::thread::sleep(Duration::from_millis(80));
        if crate::keyboard::send_chord(open_key, duration_ms) {
            std::thread::sleep(Duration::from_millis(STABILIZE_AFTER_OPEN_MS));
            if uia_focus_chat_input(hwnd, min_score) {
                return true;
            }
            // Newly opened panel: land in the box with a click (no second Ctrl+I).
            if click_then_confirm(hwnd, profile, min_score) {
                return true;
            }
            return profile.accept_click_without_uia;
        }
    }

    if !profile.accept_click_without_uia && click_then_confirm(hwnd, profile, min_score) {
        return true;
    }

    false
}

#[cfg(windows)]
fn click_then_confirm(
    hwnd: winapi::shared::windef::HWND,
    profile: &AppChatProfile,
    min_score: i32,
) -> bool {
    if !click_composer_anchor(hwnd, profile.composer_anchor) {
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
        return Some((hwnd, false));
    }
    if profile.launch_localappdata_rel.is_empty() {
        return None;
    }
    let local = std::env::var("LOCALAPPDATA").ok()?;
    let exe = profile
        .launch_localappdata_rel
        .iter()
        .map(|rel| std::path::PathBuf::from(&local).join(rel))
        .find(|path| path.is_file())?;
    if !launch_gui_exe(&exe) {
        return None;
    }
    for _ in 0..60 {
        std::thread::sleep(Duration::from_millis(250));
        if let Some(hwnd) = find_app_window(profile) {
            return Some((hwnd, true));
        }
    }
    None
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

#[cfg(windows)]
fn find_app_window(profile: &AppChatProfile) -> Option<winapi::shared::windef::HWND> {
    use winapi::shared::minwindef::{BOOL, LPARAM, TRUE};
    use winapi::shared::windef::{HWND, RECT};
    use winapi::um::winuser::{
        EnumWindows, GetForegroundWindow, GetWindow, GetWindowLongW, GetWindowRect,
        GetWindowThreadProcessId, IsWindowVisible, GWL_EXSTYLE, GW_OWNER, WS_EX_TOOLWINDOW,
    };

    struct EnumCtx {
        profile: AppChatProfile,
        candidates: Vec<Candidate>,
    }

    struct Candidate {
        hwnd: HWND,
        area: i64,
        is_foreground: bool,
    }

    unsafe extern "system" fn enum_proc(hwnd: HWND, lparam: LPARAM) -> BOOL {
        let ctx = &mut *(lparam as *mut EnumCtx);
        if IsWindowVisible(hwnd) == 0 {
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
        let fg = GetForegroundWindow();
        ctx.candidates.push(Candidate {
            hwnd,
            area,
            is_foreground: fg == hwnd,
        });
        TRUE
    }

    let mut ctx = EnumCtx {
        profile: *profile,
        candidates: Vec::new(),
    };
    unsafe {
        EnumWindows(Some(enum_proc), &mut ctx as *mut EnumCtx as LPARAM);
    }
    ctx.candidates
        .into_iter()
        .max_by_key(|c: &Candidate| (c.is_foreground, c.area))
        .map(|c| c.hwnd)
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
            .map(|marker| path.contains(marker))
            .unwrap_or(true)
    })
}

#[cfg(windows)]
fn uia_focus_chat_input(hwnd: winapi::shared::windef::HWND, min_score: i32) -> bool {
    use windows::core::VARIANT;
    use windows::Win32::Foundation::HWND as WinHwnd;
    use windows::Win32::System::Com::{
        CoCreateInstance, CoInitializeEx, CLSCTX_INPROC_SERVER, COINIT_APARTMENTTHREADED,
    };
    use windows::Win32::UI::Accessibility::{
        CUIAutomation, IUIAutomation, IUIAutomationElement, TreeScope_Descendants,
        UIA_ControlTypePropertyId, UIA_DocumentControlTypeId, UIA_EditControlTypeId,
    };

    unsafe {
        let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
        let automation: IUIAutomation =
            match CoCreateInstance(&CUIAutomation, None, CLSCTX_INPROC_SERVER) {
                Ok(v) => v,
                Err(_) => return false,
            };
        let root = match automation.ElementFromHandle(WinHwnd(hwnd as *mut _)) {
            Ok(v) => v,
            Err(_) => return false,
        };

        let mut best: Option<(IUIAutomationElement, i32)> = None;
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
                let score = score_input_name(&name, control_type.0 as i32);
                if score > best.as_ref().map(|(_, s)| *s).unwrap_or(-1) {
                    best = Some((element, score));
                }
            }
        }

        let Some((element, score)) = best.filter(|(_, score)| *score >= min_score) else {
            return false;
        };
        let _ = score;
        element.SetFocus().is_ok()
    }
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
    if lower.contains("chat") {
        score += 50;
    }
    if lower.contains("composer") {
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
        score += 20;
    }
    if name.trim().is_empty() && control_type == UIA_DocumentControlTypeId.0 as i32 {
        score += 15;
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
        eprintln!(
            "custom rule {}: process running but no activatable window; refusing relaunch",
            rule.rule_id
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

/// WeChat and similar apps keep tiny tray / IPC HWNDs that share the exe name.
/// Activating those shows a blank `WxTrayIconMessageWindow` instead of the chat UI.
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
