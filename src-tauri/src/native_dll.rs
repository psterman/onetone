//! Windows DLL search path for delay-loaded Vosk native libraries.
//! After load, resolve the **actual** module path via module handle (not just the
//! expected resources dir — PATH / System32 same-name DLL can still win).

use std::path::{Path, PathBuf};

#[derive(Debug, Clone)]
pub struct LoadedDllInfo {
    pub module_name: String,
    pub actual_path: String,
    pub size_bytes: Option<u64>,
    pub modified: Option<String>,
    pub arch_hint: &'static str,
    pub file_version: Option<String>,
}

#[cfg(windows)]
pub fn prime_vosk_dll_search(app: &tauri::AppHandle) {
    use tauri::Manager;

    if let Ok(resource_dir) = app.path().resource_dir() {
        let candidates = [
            resource_dir.clone(),
            resource_dir.join("vosk"),
            resource_dir.join("resources/vosk"),
        ];
        for candidate in candidates {
            if set_dll_directory_if_present(&candidate) {
                crate::app_log::sync_emergency_line(
                    "native_dll",
                    &format!("SetDllDirectory vosk candidate={}", candidate.display()),
                );
                return;
            }
        }
    }

    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            if set_dll_directory_if_present(dir) {
                crate::app_log::sync_emergency_line(
                    "native_dll",
                    &format!("SetDllDirectory vosk exe_dir={}", dir.display()),
                );
            }
        }
    }
}

#[cfg(windows)]
fn set_dll_directory_if_present(path: &Path) -> bool {
    if !path.join("libvosk.dll").is_file() {
        return false;
    }
    use std::os::windows::ffi::OsStrExt;
    use windows::core::PCWSTR;
    use windows::Win32::System::LibraryLoader::SetDllDirectoryW;

    let mut wide: Vec<u16> = path
        .as_os_str()
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();
    unsafe { SetDllDirectoryW(PCWSTR(wide.as_mut_ptr())).is_ok() }
}

/// Resolve the path of an already-loaded module (e.g. `libvosk.dll`).
#[cfg(windows)]
pub fn inspect_loaded_dll(module_name: &str) -> Option<LoadedDllInfo> {
    use std::os::windows::ffi::OsStrExt;
    use winapi::um::libloaderapi::{GetModuleFileNameW, GetModuleHandleW};

    let mut name_wide: Vec<u16> = std::ffi::OsStr::new(module_name)
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();
    let module = unsafe { GetModuleHandleW(name_wide.as_mut_ptr()) };
    if module.is_null() {
        return None;
    }
    let mut buf = vec![0u16; 520];
    let len = unsafe { GetModuleFileNameW(module, buf.as_mut_ptr(), buf.len() as u32) };
    if len == 0 {
        return None;
    }
    let actual = String::from_utf16_lossy(&buf[..len as usize]);
    let path = PathBuf::from(&actual);
    let (size_bytes, modified) = match std::fs::metadata(&path) {
        Ok(meta) => {
            let modified = meta.modified().ok().and_then(|t| {
                t.duration_since(std::time::UNIX_EPOCH)
                    .ok()
                    .map(|d| d.as_secs().to_string())
            });
            (Some(meta.len()), modified)
        }
        Err(_) => (None, None),
    };
    let file_version = crate::app_exe_icon::file_description(&actual)
        .or_else(|| read_file_version_string(&actual));
    Some(LoadedDllInfo {
        module_name: module_name.to_string(),
        actual_path: actual,
        size_bytes,
        modified,
        arch_hint: if cfg!(target_arch = "x86_64") {
            "x86_64"
        } else if cfg!(target_arch = "x86") {
            "x86"
        } else {
            "unknown"
        },
        file_version,
    })
}

#[cfg(windows)]
fn read_file_version_string(path: &str) -> Option<String> {
    use std::os::windows::ffi::OsStrExt;
    use winapi::shared::minwindef::DWORD;
    use winapi::um::winver::{GetFileVersionInfoSizeW, GetFileVersionInfoW, VerQueryValueW};

    let mut wide: Vec<u16> = std::ffi::OsStr::new(path)
        .encode_wide()
        .chain(std::iter::once(0))
        .collect();
    unsafe {
        let size = GetFileVersionInfoSizeW(wide.as_mut_ptr(), std::ptr::null_mut());
        if size == 0 {
            return None;
        }
        let mut data = vec![0u8; size as usize];
        if GetFileVersionInfoW(wide.as_mut_ptr(), 0, size, data.as_mut_ptr() as _) == 0 {
            return None;
        }
        let mut ptr: *mut winapi::ctypes::c_void = std::ptr::null_mut();
        let mut len: DWORD = 0;
        let key: Vec<u16> = "\\StringFileInfo\\040904b0\\FileVersion\0"
            .encode_utf16()
            .collect();
        if VerQueryValueW(data.as_ptr() as _, key.as_ptr(), &mut ptr, &mut len) == 0
            || ptr.is_null()
            || len == 0
        {
            return None;
        }
        let slice = std::slice::from_raw_parts(ptr as *const u16, len as usize);
        let text = String::from_utf16_lossy(slice);
        let text = text.trim_matches('\0').trim();
        if text.is_empty() {
            None
        } else {
            Some(text.to_string())
        }
    }
}

/// Log expected dir vs actually loaded `libvosk.dll` (call after Model::new so delay-load has run).
#[cfg(windows)]
pub fn log_vosk_dll_forensics(expected_dir: &Path) -> String {
    let expected = expected_dir.join("libvosk.dll");
    let expected_meta = std::fs::metadata(&expected).ok();
    let loaded = inspect_loaded_dll("libvosk.dll");
    let line = match loaded {
        Some(info) => {
            let path_match = Path::new(&info.actual_path)
                .canonicalize()
                .ok()
                .zip(expected.canonicalize().ok())
                .map(|(a, b)| a == b)
                .unwrap_or(false);
            format!(
                "vosk dll forensics expected={} exists={} expected_size={:?} actual={} size={:?} mtime_unix={:?} ver={:?} arch={} path_match_expected={}",
                expected.display(),
                expected.is_file(),
                expected_meta.as_ref().map(|m| m.len()),
                info.actual_path,
                info.size_bytes,
                info.modified,
                info.file_version,
                info.arch_hint,
                path_match
            )
        }
        None => format!(
            "vosk dll forensics expected={} exists={} — module not loaded in process yet",
            expected.display(),
            expected.is_file()
        ),
    };
    crate::app_log::sync_emergency_line("native_dll", &line);
    line
}

#[cfg(not(windows))]
pub fn prime_vosk_dll_search(_app: &tauri::AppHandle) {}

#[cfg(not(windows))]
pub fn inspect_loaded_dll(_module_name: &str) -> Option<LoadedDllInfo> {
    None
}

#[cfg(not(windows))]
pub fn log_vosk_dll_forensics(_expected_dir: &Path) -> String {
    "vosk dll forensics skipped (non-windows)".into()
}
