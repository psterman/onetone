//! Shared runtime workflow: activate target app, focus chat/composer input, start voice.

use std::sync::Arc;
use std::time::Duration;

use tauri::{AppHandle, Manager, WebviewWindow};

use crate::AppState;

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
    open_key: Some("Ctrl+L"),
    composer_anchor: (0.50, 0.88),
    accept_click_without_uia: true,
    post_voice_key_ms: 180,
    restore_main_delay_ms: 120,
    launch_localappdata_rel: &[],
};

const CODEX_PROFILE: AppChatProfile = AppChatProfile {
    id: CODEX_APP_TARGET_ID,
    error_prefix: "codex",
    process_names: &["Codex.exe"],
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

pub fn profile_for(app_target_id: &str) -> Option<&'static AppChatProfile> {
    match app_target_id {
        CURSOR_APP_TARGET_ID => Some(&CURSOR_PROFILE),
        CODEX_APP_TARGET_ID => Some(&CODEX_PROFILE),
        MINIMAX_APP_TARGET_ID => Some(&MINIMAX_PROFILE),
        _ => None,
    }
}

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
    restore_delay_ms: u64,
}

impl MainWindowHideGuard {
    fn maybe_hide(app: &AppHandle, restore_delay_ms: u64) -> Self {
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
            restore_delay_ms,
        }
    }
}

impl Drop for MainWindowHideGuard {
    fn drop(&mut self) {
        if !self.hidden {
            return;
        }
        if self.restore_delay_ms > 0 {
            std::thread::sleep(Duration::from_millis(self.restore_delay_ms));
        }
        if let Some(main) = crate::ipc::get_main_window(&self.app) {
            let _ = main.run_on_main_thread({
                let w = main.clone();
                move || {
                    let _ = w.show();
                }
            });
        }
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
    Err((profile.error_prefix.to_string(), AppChatWorkflowError::NotFound))
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
    run_app_chat_workflow(state, window, mapping_id, profile, duration_ms)
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
    let _hide_guard = MainWindowHideGuard::maybe_hide(&app, profile.restore_main_delay_ms);

    let (hwnd, freshly_launched) = ensure_app_window(profile)
        .ok_or((prefix.to_string(), AppChatWorkflowError::NotFound))?;
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
    hwnd: winapi::shared::windef::HWND,
    mapping_id: &str,
    profile: &AppChatProfile,
    duration_ms: u32,
    prefix: &str,
) -> Result<(), (String, AppChatWorkflowError)> {
    let _ = crate::keyboard::focus_window(hwnd);
    std::thread::sleep(Duration::from_millis(70));

    if profile.accept_click_without_uia {
        let _ = click_composer_anchor(hwnd, profile.composer_anchor);
        std::thread::sleep(Duration::from_millis(STABILIZE_AFTER_CLICK_MS));
    }

    let voice_key = {
        let cfg = state.cfg.lock();
        crate::voice_end_runtime::resolve_voice_input_target_key(&cfg)
    }
    .ok_or((prefix.to_string(), AppChatWorkflowError::VoiceFailed))?;

    if !crate::keyboard::send_chord(&voice_key, duration_ms) {
        return Err((prefix.to_string(), AppChatWorkflowError::VoiceFailed));
    }
    crate::voice_end_runtime::mark_voice_wake_key_sent(state.as_ref());

    if profile.post_voice_key_ms > 0 {
        std::thread::sleep(Duration::from_millis(profile.post_voice_key_ms));
    }

    if crate::voice_end_runtime::session_state(state.as_ref()) == "dictating" {
        crate::voice_end_runtime::stop_dictation_after_trigger_key(state, app);
    } else if crate::voice_end_runtime::can_enter_dictating(&state.cfg.lock()) {
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
const STABILIZE_AFTER_OPEN_MS: u64 = 200;
#[cfg(windows)]
const STABILIZE_AFTER_CLICK_MS: u64 = 140;

#[cfg(windows)]
fn focus_chat_input(
    hwnd: winapi::shared::windef::HWND,
    profile: &AppChatProfile,
    duration_ms: u32,
) -> bool {
    if uia_focus_chat_input(hwnd) {
        return true;
    }

    if let Some(open_key) = profile.open_key.filter(|k| !k.trim().is_empty()) {
        if crate::keyboard::send_chord(open_key, duration_ms) {
            std::thread::sleep(Duration::from_millis(STABILIZE_AFTER_OPEN_MS));
            if uia_focus_chat_input(hwnd) {
                return true;
            }
        }
    }

    let _ = crate::keyboard::focus_window(hwnd);
    std::thread::sleep(Duration::from_millis(60));
    if click_composer_anchor(hwnd, profile.composer_anchor) {
        std::thread::sleep(Duration::from_millis(STABILIZE_AFTER_CLICK_MS));
        if uia_focus_chat_input(hwnd) {
            return true;
        }
        if profile.accept_click_without_uia {
            return true;
        }
    }

    false
}

#[cfg(windows)]
fn click_composer_anchor(
    hwnd: winapi::shared::windef::HWND,
    anchor: (f32, f32),
) -> bool {
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
        GetWindowThreadProcessId, GW_OWNER, GWL_EXSTYLE, IsWindowVisible, WS_EX_TOOLWINDOW,
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
        EnumWindows(
            Some(enum_proc),
            &mut ctx as *mut EnumCtx as LPARAM,
        );
    }
    ctx.candidates
        .into_iter()
        .max_by_key(|c: &Candidate| (c.is_foreground, c.area))
        .map(|c| c.hwnd)
}

#[cfg(windows)]
fn process_matches_profile(pid: u32, profile: &AppChatProfile) -> bool {
    process_image_path(pid).is_some_and(|path| {
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
fn process_image_path(pid: u32) -> Option<String> {
    use winapi::shared::minwindef::DWORD;
    use winapi::um::handleapi::CloseHandle;
    use winapi::um::processthreadsapi::OpenProcess;
    use winapi::um::psapi::GetModuleFileNameExW;
    use winapi::um::winnt::{PROCESS_QUERY_LIMITED_INFORMATION, PROCESS_VM_READ};

    unsafe {
        let handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION | PROCESS_VM_READ, 0, pid);
        if handle.is_null() {
            return None;
        }
        let mut buf = [0u16; 1024];
        let mut len = buf.len() as DWORD;
        let ok = windows::Win32::System::Threading::QueryFullProcessImageNameW(
            windows::Win32::Foundation::HANDLE(handle as _),
            windows::Win32::System::Threading::PROCESS_NAME_FORMAT(0),
            windows::core::PWSTR(buf.as_mut_ptr()),
            &mut len,
        )
        .is_ok();
        if !ok || len == 0 {
            len = GetModuleFileNameExW(handle, std::ptr::null_mut(), buf.as_mut_ptr(), buf.len() as u32);
        }
        CloseHandle(handle);
        if len == 0 {
            return None;
        }
        Some(String::from_utf16_lossy(&buf[..len as usize]))
    }
}

#[cfg(windows)]
fn uia_focus_chat_input(hwnd: winapi::shared::windef::HWND) -> bool {
    use windows::core::VARIANT;
    use windows::Win32::Foundation::HWND as WinHwnd;
    use windows::Win32::System::Com::{
        CoCreateInstance, CoInitializeEx, CLSCTX_INPROC_SERVER, COINIT_APARTMENTTHREADED,
    };
    use windows::Win32::UI::Accessibility::{
        CUIAutomation, IUIAutomation, IUIAutomationElement, TreeScope_Descendants,
        UIA_ControlTypePropertyId, UIA_DocumentControlTypeId, UIA_EditControlTypeId,
    };

    const MIN_SCORE: i32 = 20;

    unsafe {
        let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
        let automation: IUIAutomation = match CoCreateInstance(
            &CUIAutomation,
            None,
            CLSCTX_INPROC_SERVER,
        ) {
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
            let condition = match automation
                .CreatePropertyCondition(UIA_ControlTypePropertyId, &value)
            {
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

        let Some((element, score)) = best.filter(|(_, score)| *score >= MIN_SCORE) else {
            return false;
        };
        if score < MIN_SCORE {
            return false;
        }
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
