//! Foreground / running-app identification (Windows). Separate from chat workflow actions.

use serde::Serialize;

pub const CURSOR_APP_TARGET_ID: &str = "cursor-chat";
pub const CODEX_APP_TARGET_ID: &str = "codex-chat";
pub const MINIMAX_APP_TARGET_ID: &str = "minimax-chat";
pub const CLAUDE_CODE_APP_TARGET_ID: &str = "claude-code";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppIdentity {
    pub pid: u32,
    pub exe_name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub full_path: Option<String>,
    pub window_title: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub matched_preset_app_id: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RunningAppEntry {
    pub exe_name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub full_path: Option<String>,
    pub display_name: String,
    pub window_title_sample: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub matched_preset_app_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub icon_data_url: Option<String>,
}

struct PresetMatcher {
    id: &'static str,
    process_names: &'static [&'static str],
    path_marker: Option<&'static str>,
}

const PRESET_MATCHERS: &[PresetMatcher] = &[
    PresetMatcher {
        id: CURSOR_APP_TARGET_ID,
        process_names: &["Cursor.exe"],
        path_marker: None,
    },
    PresetMatcher {
        id: CODEX_APP_TARGET_ID,
        // Store Codex UI is ChatGPT.exe under OpenAI.Codex_*; CLI helper remains Codex.exe.
        process_names: &["ChatGPT.exe", "Codex.exe"],
        path_marker: Some("OpenAI.Codex"),
    },
    PresetMatcher {
        id: MINIMAX_APP_TARGET_ID,
        process_names: &["MiniMax Code.exe"],
        path_marker: Some("MiniMax Code"),
    },
    PresetMatcher {
        id: CLAUDE_CODE_APP_TARGET_ID,
        process_names: &["claude.exe", "Claude Code.exe"],
        path_marker: None,
    },
];

fn path_has_marker(path: &str, marker: &str) -> bool {
    path.to_ascii_lowercase()
        .contains(&marker.to_ascii_lowercase())
}

pub fn preset_app_id_for_path(path: &str) -> Option<String> {
    let file_name = path.rsplit(['\\', '/']).next().unwrap_or_default();
    for matcher in PRESET_MATCHERS {
        let name_ok = matcher
            .process_names
            .iter()
            .any(|name| file_name.eq_ignore_ascii_case(name));
        if !name_ok {
            continue;
        }
        let path_ok = matcher
            .path_marker
            .map(|marker| path_has_marker(path, marker))
            .unwrap_or(true);
        if path_ok {
            return Some(matcher.id.to_string());
        }
    }
    None
}

/// True when process AUMID / path belongs to the Store Codex package (not consumer ChatGPT).
fn looks_like_codex_package(path: Option<&str>, aumid: Option<&str>) -> bool {
    if path.is_some_and(|p| path_has_marker(p, "OpenAI.ChatGPT") && !path_has_marker(p, "OpenAI.Codex"))
    {
        return false;
    }
    if path.is_some_and(|p| path_has_marker(p, "OpenAI.Codex")) {
        return true;
    }
    aumid.is_some_and(|id| {
        let lower = id.to_ascii_lowercase();
        lower.starts_with("openai.codex_") || lower.contains("openai.codex_")
    })
}

/// Fallback when full path is unavailable (common for some packaged-app queries):
/// ChatGPT.exe / Codex.exe + Codex package path/AUMID, or title mentioning Codex.
/// Store Codex UI currently titles itself "ChatGPT" (no "codex" substring).
pub fn preset_app_id_for_exe_title(exe_name: &str, window_title: &str, full_path: Option<&str>) -> Option<String> {
    preset_app_id_for_exe_title_with_aumid(exe_name, window_title, full_path, None)
}

pub fn preset_app_id_for_exe_title_with_aumid(
    exe_name: &str,
    window_title: &str,
    full_path: Option<&str>,
    aumid: Option<&str>,
) -> Option<String> {
    if let Some(path) = full_path {
        if let Some(id) = preset_app_id_for_path(path) {
            return Some(id);
        }
        // Consumer ChatGPT store package — never treat as Codex.
        if path_has_marker(path, "OpenAI.ChatGPT") && !path_has_marker(path, "OpenAI.Codex") {
            return None;
        }
    }
    let exe = exe_name.rsplit(['\\', '/']).next().unwrap_or(exe_name);
    let is_codex_exe =
        exe.eq_ignore_ascii_case("ChatGPT.exe") || exe.eq_ignore_ascii_case("Codex.exe");
    if !is_codex_exe {
        return None;
    }
    if looks_like_codex_package(full_path, aumid) {
        return Some(CODEX_APP_TARGET_ID.to_string());
    }
    let title = window_title.to_ascii_lowercase();
    if title.contains("codex") {
        return Some(CODEX_APP_TARGET_ID.to_string());
    }
    None
}

pub fn preset_app_id_for_pid(pid: u32) -> Option<String> {
    let path = process_image_path(pid)?;
    preset_app_id_for_path(&path)
}

/// Full path when available; used by workflow window matching.
#[cfg(windows)]
pub fn process_image_path(pid: u32) -> Option<String> {
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
            len = GetModuleFileNameExW(
                handle,
                std::ptr::null_mut(),
                buf.as_mut_ptr(),
                buf.len() as u32,
            );
        }
        CloseHandle(handle);
        if len == 0 {
            return None;
        }
        Some(String::from_utf16_lossy(&buf[..len as usize]))
    }
}

#[cfg(not(windows))]
pub fn process_image_path(_pid: u32) -> Option<String> {
    None
}

/// Exe file name only; independent fallback when full path is unavailable.
#[cfg(windows)]
pub fn process_exe_name(pid: u32) -> Option<String> {
    if let Some(path) = process_image_path(pid) {
        return path
            .rsplit(['\\', '/'])
            .next()
            .map(|s| s.to_string())
            .filter(|s| !s.is_empty());
    }
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
        let len = GetModuleFileNameExW(
            handle,
            std::ptr::null_mut(),
            buf.as_mut_ptr(),
            buf.len() as u32,
        );
        CloseHandle(handle);
        if len == 0 {
            return None;
        }
        let path = String::from_utf16_lossy(&buf[..len as usize]);
        path.rsplit(['\\', '/'])
            .next()
            .map(|s| s.to_string())
            .filter(|s| !s.is_empty())
    }
}

#[cfg(not(windows))]
pub fn process_exe_name(_pid: u32) -> Option<String> {
    None
}

#[cfg(windows)]
fn window_title_for_hwnd(hwnd: winapi::shared::windef::HWND) -> String {
    use winapi::um::winuser::GetWindowTextW;

    unsafe {
        let mut buf = [0u16; 512];
        let len = GetWindowTextW(hwnd, buf.as_mut_ptr(), buf.len() as i32);
        if len <= 0 {
            return String::new();
        }
        String::from_utf16_lossy(&buf[..len as usize])
    }
}

#[cfg(windows)]
fn application_user_model_id(pid: u32) -> Option<String> {
    use std::os::windows::ffi::OsStringExt;
    use winapi::shared::minwindef::HMODULE;
    use winapi::um::handleapi::CloseHandle;
    use winapi::um::libloaderapi::{GetProcAddress, LoadLibraryA};
    use winapi::um::processthreadsapi::OpenProcess;
    use winapi::um::winnt::{HANDLE, PROCESS_QUERY_LIMITED_INFORMATION};

    type GetAumidFn = unsafe extern "system" fn(HANDLE, *mut u32, *mut u16) -> i32;

    unsafe {
        let handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
        if handle.is_null() {
            return None;
        }
        let module: HMODULE = LoadLibraryA(b"kernel32.dll\0".as_ptr() as *const i8);
        if module.is_null() {
            CloseHandle(handle);
            return None;
        }
        let sym = GetProcAddress(module, b"GetApplicationUserModelId\0".as_ptr() as *const i8);
        if sym.is_null() {
            CloseHandle(handle);
            return None;
        }
        let get_aumid: GetAumidFn = std::mem::transmute(sym);
        let mut len: u32 = 256;
        let mut buf = vec![0u16; len as usize];
        let mut hr = get_aumid(handle, &mut len, buf.as_mut_ptr());
        if hr < 0 && len > 0 && len < 4096 {
            buf.resize(len as usize, 0);
            hr = get_aumid(handle, &mut len, buf.as_mut_ptr());
        }
        CloseHandle(handle);
        if hr < 0 || len == 0 {
            return None;
        }
        let end = (len as usize).min(buf.len());
        let end = buf[..end].iter().position(|&c| c == 0).unwrap_or(end);
        let s = std::ffi::OsString::from_wide(&buf[..end])
            .to_string_lossy()
            .to_string();
        if s.is_empty() {
            None
        } else {
            Some(s)
        }
    }
}

#[cfg(not(windows))]
fn application_user_model_id(_pid: u32) -> Option<String> {
    None
}

#[cfg(windows)]
fn identity_for_pid_hwnd(pid: u32, hwnd: winapi::shared::windef::HWND) -> Option<AppIdentity> {
    let exe_name = process_exe_name(pid)?;
    let full_path = process_image_path(pid);
    let window_title = if hwnd.is_null() {
        String::new()
    } else {
        window_title_for_hwnd(hwnd)
    };
    let aumid = application_user_model_id(pid);
    let matched_preset_app_id = full_path
        .as_deref()
        .and_then(preset_app_id_for_path)
        .or_else(|| preset_app_id_for_pid(pid))
        .or_else(|| {
            preset_app_id_for_exe_title_with_aumid(
                &exe_name,
                &window_title,
                full_path.as_deref(),
                aumid.as_deref(),
            )
        });
    Some(AppIdentity {
        pid,
        exe_name,
        full_path,
        window_title,
        matched_preset_app_id,
    })
}

#[cfg(windows)]
pub fn identity_for_window(hwnd: winapi::shared::windef::HWND) -> Option<AppIdentity> {
    if hwnd.is_null() {
        return None;
    }
    use winapi::um::winuser::GetWindowThreadProcessId;
    let mut pid = 0u32;
    unsafe {
        GetWindowThreadProcessId(hwnd, &mut pid);
    }
    if pid == 0 {
        return None;
    }
    identity_for_pid_hwnd(pid, hwnd)
}

pub fn foreground_app_identity() -> Option<AppIdentity> {
    #[cfg(windows)]
    {
        use winapi::um::winuser::{GetForegroundWindow, GetWindowThreadProcessId};

        unsafe {
            let hwnd = GetForegroundWindow();
            if hwnd.is_null() {
                return None;
            }
            let mut pid = 0u32;
            GetWindowThreadProcessId(hwnd, &mut pid);
            if pid == 0 {
                return None;
            }
            identity_for_pid_hwnd(pid, hwnd)
        }
    }
    #[cfg(not(windows))]
    {
        None
    }
}

pub fn foreground_app_target_id() -> Option<String> {
    foreground_app_identity().and_then(|i| i.matched_preset_app_id)
}

fn is_self_process(exe_name: &str, full_path: Option<&str>) -> bool {
    let lower = exe_name.to_ascii_lowercase();
    if lower.contains("onetone") {
        return true;
    }
    if let Some(path) = full_path {
        let pl = path.to_ascii_lowercase();
        if pl.contains("onetone") || pl.contains("voice-pilot") {
            return true;
        }
    }
    false
}

fn exe_stem(exe_name: &str) -> &str {
    exe_name
        .strip_suffix(".exe")
        .or_else(|| exe_name.strip_suffix(".EXE"))
        .unwrap_or(exe_name)
}

/// Program label for pickers / rules — never the live window title.
/// Prefer FileDescription (e.g. "Cursor"), else exe stem ("Cursor.exe" → "Cursor").
fn display_name_for(exe_name: &str, _window_title: &str, full_path: Option<&str>) -> String {
    if let Some(path) = full_path {
        if let Some(desc) = crate::app_exe_icon::file_description(path) {
            let desc = desc.trim();
            if !desc.is_empty() {
                return desc.to_string();
            }
        }
    }
    exe_stem(exe_name).to_string()
}

pub fn identity_display_name(identity: &AppIdentity) -> String {
    display_name_for(
        &identity.exe_name,
        &identity.window_title,
        identity.full_path.as_deref(),
    )
}

fn is_noise_process(exe_name: &str) -> bool {
    const DENY: &[&str] = &[
        "svchost.exe",
        "csrss.exe",
        "smss.exe",
        "lsass.exe",
        "services.exe",
        "wininit.exe",
        "winlogon.exe",
        "dwm.exe",
        "fontdrvhost.exe",
        "registry",
        "system",
        "idle",
        "wlanext.exe",
        "spoolsv.exe",
        "searchprotocolhost.exe",
        "searchfilterhost.exe",
        "sihost.exe",
        "ctfmon.exe",
        "audiodg.exe",
        "conhost.exe",
    ];
    DENY.iter().any(|d| exe_name.eq_ignore_ascii_case(d))
}

fn should_include_process(has_window: bool, full_path: Option<&str>, exe_name: &str) -> bool {
    if is_noise_process(exe_name) {
        return false;
    }
    if has_window {
        return true;
    }
    let Some(path) = full_path else {
        return false;
    };
    let pl = path.to_ascii_lowercase();
    if pl.contains("\\windows\\system32\\") || pl.contains("\\windows\\syswow64\\") {
        return false;
    }
    pl.contains("\\users\\")
        || pl.contains("\\program files")
        || pl.contains("\\program files (x86)")
        || pl.contains("\\appdata\\")
}

#[cfg(windows)]
pub fn icon_data_url_for_path(full_path: Option<&str>) -> Option<String> {
    let path = full_path?;
    crate::app_exe_icon::icon_png_data_url(path, 32)
}

#[cfg(not(windows))]
pub fn icon_data_url_for_path(_full_path: Option<&str>) -> Option<String> {
    None
}

#[cfg(windows)]
pub fn list_running_apps() -> Vec<RunningAppEntry> {
    use std::collections::HashMap;

    use winapi::shared::minwindef::{BOOL, LPARAM, TRUE};
    use winapi::shared::windef::{HWND, RECT};
    use winapi::um::tlhelp32::{
        CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W,
        TH32CS_SNAPPROCESS,
    };
    use winapi::um::winuser::{
        EnumWindows, GetWindow, GetWindowLongW, GetWindowRect, GetWindowThreadProcessId,
        IsWindowVisible, GWL_EXSTYLE, GW_OWNER, WS_EX_TOOLWINDOW,
    };

    struct WinSample {
        window_title: String,
        area: i64,
    }

    struct EnumCtx {
        by_pid: HashMap<u32, WinSample>,
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
        if pid == 0 {
            return TRUE;
        }
        let title = window_title_for_hwnd(hwnd);
        if title.trim().is_empty() {
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
        let entry = ctx.by_pid.entry(pid).or_insert(WinSample {
            window_title: String::new(),
            area: 0,
        });
        if area >= entry.area {
            entry.window_title = title;
            entry.area = area;
        }
        TRUE
    }

    let mut win_ctx = EnumCtx {
        by_pid: HashMap::new(),
    };
    unsafe {
        EnumWindows(Some(enum_proc), &mut win_ctx as *mut EnumCtx as LPARAM);
    }

    struct ProcRow {
        exe_name: String,
        full_path: Option<String>,
        window_title: String,
        has_window: bool,
        matched_preset_app_id: Option<String>,
    }

    let mut by_key: HashMap<String, ProcRow> = HashMap::new();
    let mut icon_cache: HashMap<String, Option<String>> = HashMap::new();

    unsafe {
        let snap = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
        if snap.is_null() || snap == winapi::um::handleapi::INVALID_HANDLE_VALUE {
            return Vec::new();
        }
        let mut entry: PROCESSENTRY32W = std::mem::zeroed();
        entry.dwSize = std::mem::size_of::<PROCESSENTRY32W>() as u32;
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
                    let full_path = process_image_path(pid);
                    if !is_self_process(&exe_name, full_path.as_deref()) {
                        let win = win_ctx.by_pid.get(&pid);
                        let has_window = win.is_some();
                        let window_title = win.map(|w| w.window_title.clone()).unwrap_or_default();
                        if should_include_process(has_window, full_path.as_deref(), &exe_name) {
                            let matched_preset_app_id = full_path
                                .as_deref()
                                .and_then(preset_app_id_for_path)
                                .or_else(|| preset_app_id_for_pid(pid));
                            let key = if let Some(ref path) = full_path {
                                format!("path:{}", path.to_ascii_lowercase())
                            } else {
                                format!("exe:{}", exe_name.to_ascii_lowercase())
                            };
                            let replace = by_key.get(&key).is_none_or(|prev| {
                                has_window && !prev.has_window
                                    || (has_window == prev.has_window
                                        && window_title.len() > prev.window_title.len())
                            });
                            if replace {
                                by_key.insert(
                                    key,
                                    ProcRow {
                                        exe_name,
                                        full_path,
                                        window_title,
                                        has_window,
                                        matched_preset_app_id,
                                    },
                                );
                            }
                        }
                    }
                }
                if Process32NextW(snap, &mut entry) == 0 {
                    break;
                }
            }
        }
        winapi::um::handleapi::CloseHandle(snap);
    }

    let mut out: Vec<RunningAppEntry> = by_key
        .into_values()
        .map(|row| {
            let icon_data_url = if let Some(ref path) = row.full_path {
                let cache_key = path.to_ascii_lowercase();
                if let Some(cached) = icon_cache.get(&cache_key) {
                    cached.clone()
                } else {
                    let icon = icon_data_url_for_path(Some(path));
                    icon_cache.insert(cache_key, icon.clone());
                    icon
                }
            } else {
                None
            };
            RunningAppEntry {
                display_name: display_name_for(
                    &row.exe_name,
                    &row.window_title,
                    row.full_path.as_deref(),
                ),
                exe_name: row.exe_name,
                full_path: row.full_path,
                window_title_sample: row.window_title,
                matched_preset_app_id: row.matched_preset_app_id,
                icon_data_url,
            }
        })
        .collect();
    out.sort_by(|a, b| {
        a.display_name
            .to_ascii_lowercase()
            .cmp(&b.display_name.to_ascii_lowercase())
    });
    out
}

#[cfg(not(windows))]
pub fn list_running_apps() -> Vec<RunningAppEntry> {
    Vec::new()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn preset_path_matches_cursor() {
        assert_eq!(
            preset_app_id_for_path(r"C:\Users\me\AppData\Local\Programs\cursor\Cursor.exe")
                .as_deref(),
            Some(CURSOR_APP_TARGET_ID)
        );
    }

    #[test]
    fn preset_path_matches_codex_store_chatgpt_ui() {
        assert_eq!(
            preset_app_id_for_path(
                r"C:\Program Files\WindowsApps\OpenAI.Codex_26.715.7063.0_x64__2p2nqsd0c76g0\app\ChatGPT.exe"
            )
            .as_deref(),
            Some(CODEX_APP_TARGET_ID)
        );
        assert_eq!(
            preset_app_id_for_path(
                r"C:\Program Files\WindowsApps\OpenAI.Codex_26.715.7063.0_x64__2p2nqsd0c76g0\app\resources\codex.exe"
            )
            .as_deref(),
            Some(CODEX_APP_TARGET_ID)
        );
        // Consumer ChatGPT package must not match as Codex.
        assert_eq!(
            preset_app_id_for_path(
                r"C:\Program Files\WindowsApps\OpenAI.ChatGPT_1.0.0.0_x64__xxxxx\app\ChatGPT.exe"
            ),
            None
        );
    }

    #[test]
    fn preset_exe_title_fallback_matches_codex_ui() {
        assert_eq!(
            preset_app_id_for_exe_title("ChatGPT.exe", "Codex", None).as_deref(),
            Some(CODEX_APP_TARGET_ID)
        );
        // Store Codex window title is often just "ChatGPT" — need package path/AUMID.
        assert_eq!(
            preset_app_id_for_exe_title("ChatGPT.exe", "ChatGPT", None),
            None
        );
        assert_eq!(
            preset_app_id_for_exe_title_with_aumid(
                "ChatGPT.exe",
                "ChatGPT",
                None,
                Some("OpenAI.Codex_2p2nqsd0c76g0!App")
            )
            .as_deref(),
            Some(CODEX_APP_TARGET_ID)
        );
        assert_eq!(
            preset_app_id_for_exe_title(
                "ChatGPT.exe",
                "ChatGPT",
                Some(r"C:\Program Files\WindowsApps\OpenAI.Codex_26.715.7063.0_x64__2p2nqsd0c76g0\app\ChatGPT.exe")
            )
            .as_deref(),
            Some(CODEX_APP_TARGET_ID)
        );
        assert_eq!(
            preset_app_id_for_exe_title(
                "ChatGPT.exe",
                "New chat",
                Some(r"C:\Program Files\WindowsApps\OpenAI.ChatGPT_1.0.0.0_x64__xxxxx\app\ChatGPT.exe")
            ),
            None
        );
    }

    #[test]
    fn display_name_prefers_exe_stem_over_window_title() {
        let name = display_name_for(
            "Cursor.exe",
            "voice-listening-strategy.plan.md - voice-pilot - Cursor [管理员]",
            None,
        );
        assert_eq!(name, "Cursor");
    }

    #[test]
    #[cfg(windows)]
    fn list_running_apps_smoke() {
        let apps = list_running_apps();
        assert!(
            apps.len() <= 512,
            "unexpected running app count: {}",
            apps.len()
        );
        for app in &apps {
            assert!(!app.exe_name.trim().is_empty());
            assert!(!app.display_name.trim().is_empty());
        }
    }
}
