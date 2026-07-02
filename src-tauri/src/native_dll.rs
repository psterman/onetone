//! Windows DLL search path for delay-loaded Vosk native libraries.

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
                return;
            }
        }
    }

    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            let _ = set_dll_directory_if_present(dir);
        }
    }
}

#[cfg(windows)]
fn set_dll_directory_if_present(path: &std::path::Path) -> bool {
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

#[cfg(not(windows))]
pub fn prime_vosk_dll_search(_app: &tauri::AppHandle) {}
