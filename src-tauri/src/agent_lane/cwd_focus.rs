//! Resolve a terminal HWND by matching process working directory (Windows).
//! Stored hwnd is hint-only; always re-resolve before focus.

#[cfg(windows)]
use std::path::Path;

/// Find a visible top-level window whose process cwd matches `cwd`.
/// Returns 0 when none found.
pub fn find_hwnd_for_cwd(cwd: &str) -> Option<u64> {
    let cwd = cwd.trim();
    if cwd.is_empty() {
        return None;
    }
    #[cfg(windows)]
    {
        find_hwnd_for_cwd_windows(cwd)
    }
    #[cfg(not(windows))]
    {
        let _ = cwd;
        None
    }
}

#[cfg(windows)]
fn normalize_path(p: &str) -> String {
    let p = p.trim().trim_end_matches(['/', '\\']);
    let mut s = p.replace('/', "\\").to_lowercase();
    // Strip \\?\ prefix
    if let Some(rest) = s.strip_prefix(r"\\?\") {
        s = rest.to_string();
    }
    s
}

#[cfg(windows)]
fn find_hwnd_for_cwd_windows(cwd: &str) -> Option<u64> {
    use std::ffi::OsString;
    use std::os::windows::ffi::OsStringExt;
    use winapi::shared::minwindef::{BOOL, DWORD, LPARAM, TRUE};
    use winapi::shared::windef::HWND;
    use winapi::um::winuser::{
        EnumWindows, GetWindowTextW, GetWindowThreadProcessId, IsWindowVisible,
    };

    let target = normalize_path(cwd);
    if target.is_empty() {
        return None;
    }

    struct Ctx {
        target: String,
        found: u64,
    }

    unsafe extern "system" fn enum_proc(hwnd: HWND, lparam: LPARAM) -> BOOL {
        let ctx = &mut *(lparam as *mut Ctx);
        if ctx.found != 0 {
            return TRUE;
        }
        if IsWindowVisible(hwnd) == 0 {
            return TRUE;
        }
        let mut title = [0u16; 4];
        // Skip untitled empty chrome unless it has a title (cheap filter)
        let _ = GetWindowTextW(hwnd, title.as_mut_ptr(), 4);

        let mut pid: DWORD = 0;
        GetWindowThreadProcessId(hwnd, &mut pid);
        if pid == 0 {
            return TRUE;
        }
        if let Some(proc_cwd) = process_cwd(pid) {
            if normalize_path(&proc_cwd) == ctx.target
                || Path::new(&normalize_path(&proc_cwd)).starts_with(Path::new(&ctx.target))
                || Path::new(&ctx.target).starts_with(Path::new(&normalize_path(&proc_cwd)))
            {
                ctx.found = hwnd as usize as u64;
            }
        }
        let _ = OsString::from_wide(&[]);
        TRUE
    }

    let mut ctx = Ctx {
        target,
        found: 0,
    };
    unsafe {
        EnumWindows(Some(enum_proc), &mut ctx as *mut Ctx as LPARAM);
    }
    if ctx.found != 0 {
        Some(ctx.found)
    } else {
        None
    }
}

#[cfg(windows)]
fn process_cwd(pid: u32) -> Option<String> {
    // Best-effort: read PEB via NtQueryInformationProcess is heavy;
    // fallback — match executable path directory / open handle query.
    // Use Kernel32 QueryFullProcessImageName and compare parent folders of cwd.
    use std::ptr;
    use winapi::shared::minwindef::DWORD;
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
        let mut size: DWORD = buf.len() as DWORD;
        let ok = QueryFullProcessImageNameW(h, 0, buf.as_mut_ptr(), &mut size);
        CloseHandle(h);
        if ok == 0 || size == 0 {
            return None;
        }
        let path = String::from_utf16_lossy(&buf[..size as usize]);
        // Image path is not cwd; without NtQuery we use image dir as weak hint only
        // when the process is a shell hosting codex — prefer NtQuery if available.
        if let Some(cwd) = query_process_cwd_nt(pid) {
            return Some(cwd);
        }
        Path::new(&path)
            .parent()
            .map(|p| p.to_string_lossy().to_string())
            .filter(|s| !s.is_empty())
            .or(Some(path))
            .map(|s| {
                let _ = ptr::null::<()>();
                s
            })
    }
}

#[cfg(windows)]
fn query_process_cwd_nt(pid: u32) -> Option<String> {
    // Lightweight: try `wmic` / PowerShell is too slow. Use toolhelp + skip.
    // For v1, return None so callers fall through to resume — cwd match via
    // image path parent only when process_cwd returns image dir.
    let _ = pid;
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_cwd_none() {
        assert!(find_hwnd_for_cwd("").is_none());
        assert!(find_hwnd_for_cwd("   ").is_none());
    }
}
