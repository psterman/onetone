#[cfg(windows)]
pub fn apply_window_icon(window: &tauri::WebviewWindow) -> tauri::Result<()> {
    use raw_window_handle::{HasWindowHandle, RawWindowHandle};
    use std::ptr;
    use winapi::shared::windef::HWND;
    use winapi::um::libloaderapi::GetModuleHandleW;
    use winapi::um::winuser::{
        LoadImageW, SendMessageW, SetClassLongPtrW, GCLP_HICON, GCLP_HICONSM, ICON_BIG,
        ICON_SMALL, IMAGE_ICON, LR_DEFAULTSIZE, WM_SETICON,
    };

    // Tauri embeds icons/icon.ico into the exe as resource id 32512 during tauri-build.
    const TAURI_EMBEDDED_ICON_ID: u16 = 32512;

    let handle = window.window_handle().map_err(|e| {
        std::io::Error::new(
            std::io::ErrorKind::Other,
            format!("window handle unavailable: {e}"),
        )
    })?;
    let hwnd = match handle.as_raw() {
        RawWindowHandle::Win32(platform) => platform.hwnd.get() as HWND,
        _ => return Ok(()),
    };

    unsafe fn load_icon(size: i32) -> winapi::shared::windef::HICON {
        unsafe {
            let module = GetModuleHandleW(ptr::null());
            let icon = LoadImageW(
                module,
                TAURI_EMBEDDED_ICON_ID as usize as *const u16,
                IMAGE_ICON,
                size,
                size,
                if size == 0 { LR_DEFAULTSIZE } else { 0 },
            );
            icon as _
        }
    }

    unsafe {
        let small = load_icon(16);
        let big = load_icon(32);
        let fallback = if small.is_null() && big.is_null() {
            load_icon(0)
        } else {
            ptr::null_mut()
        };

        let small_icon = if !small.is_null() { small } else { fallback };
        let big_icon = if !big.is_null() { big } else { fallback };

        if small_icon.is_null() && big_icon.is_null() {
            return Err(tauri::Error::from(std::io::Error::new(
                std::io::ErrorKind::NotFound,
                "embedded application icon resource not found",
            )));
        }

        if !small_icon.is_null() {
            SendMessageW(hwnd, WM_SETICON, ICON_SMALL as _, small_icon as _);
            SetClassLongPtrW(hwnd, GCLP_HICONSM, small_icon as _);
        }
        if !big_icon.is_null() {
            SendMessageW(hwnd, WM_SETICON, ICON_BIG as _, big_icon as _);
            SetClassLongPtrW(hwnd, GCLP_HICON, big_icon as _);
        }
    }

    Ok(())
}

#[cfg(not(windows))]
pub fn apply_window_icon(window: &tauri::WebviewWindow) -> tauri::Result<()> {
    use tauri::image::Image;

    let bytes = include_bytes!("../icons/icon.png");
    let img = image::load_from_memory(bytes)
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::InvalidData, e))?;
    let rgba = img.to_rgba8();
    let (width, height) = rgba.dimensions();
    window.set_icon(Image::new_owned(rgba.into_raw(), width, height))
}
