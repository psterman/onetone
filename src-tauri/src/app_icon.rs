//! Apply the app window / taskbar icon.
//!
//! Tray icons are separate (`tray_icon_render`, runtime PNG).
//! Taskbar/title-bar use max-fill tray tiles — squircle downscales lose the glyph at 16px.

use tauri::image::Image;

const ICON_SMALL: &[u8] = include_bytes!("../icons/tray-16.png");
const ICON_BIG: &[u8] = include_bytes!("../icons/tray-32.png");

fn load_rgba(bytes: &[u8]) -> Result<image::RgbaImage, std::io::Error> {
    let img = image::load_from_memory(bytes)
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::InvalidData, e))?;
    Ok(img.to_rgba8())
}

pub fn apply_window_icon(window: &tauri::WebviewWindow) -> tauri::Result<()> {
    let big = load_rgba(ICON_BIG)?;
    let (width, height) = big.dimensions();
    window.set_icon(Image::new_owned(big.clone().into_raw(), width, height))?;

    #[cfg(windows)]
    {
        if let Ok(small) = load_rgba(ICON_SMALL) {
            if let Err(err) = apply_win32_hwnd_icons(window, &small, &big) {
                eprintln!("[app_icon] win32 hwnd icon: {err}");
            }
        }
    }

    Ok(())
}

#[cfg(windows)]
fn encode_png_rgba(img: &image::RgbaImage) -> Result<Vec<u8>, String> {
    use std::io::Cursor;

    let mut png = Cursor::new(Vec::new());
    image::DynamicImage::ImageRgba8(img.clone())
        .write_to(&mut png, image::ImageFormat::Png)
        .map_err(|e| e.to_string())?;
    Ok(png.into_inner())
}

#[cfg(windows)]
fn apply_win32_hwnd_icons(
    window: &tauri::WebviewWindow,
    small_rgba: &image::RgbaImage,
    big_rgba: &image::RgbaImage,
) -> Result<(), String> {
    use raw_window_handle::{HasWindowHandle, RawWindowHandle};
    use winapi::shared::windef::HWND;
    use winapi::um::winuser::{
        CreateIconFromResourceEx, SendMessageW, SetClassLongPtrW, GCLP_HICON, GCLP_HICONSM,
        ICON_BIG, ICON_SMALL, LR_DEFAULTCOLOR, WM_SETICON,
    };

    let handle = window
        .window_handle()
        .map_err(|e| format!("window handle: {e}"))?;
    let hwnd = match handle.as_raw() {
        RawWindowHandle::Win32(platform) => platform.hwnd.get() as HWND,
        _ => return Ok(()),
    };

    let small_png = encode_png_rgba(small_rgba)?;
    let big_png = encode_png_rgba(big_rgba)?;

    unsafe {
        let small = CreateIconFromResourceEx(
            small_png.as_ptr() as *mut _,
            small_png.len() as u32,
            1,
            0x0003_0000,
            16,
            16,
            LR_DEFAULTCOLOR,
        );
        let big = CreateIconFromResourceEx(
            big_png.as_ptr() as *mut _,
            big_png.len() as u32,
            1,
            0x0003_0000,
            32,
            32,
            LR_DEFAULTCOLOR,
        );

        if small.is_null() && big.is_null() {
            return Err("CreateIconFromResourceEx returned null".into());
        }

        if !small.is_null() {
            SendMessageW(hwnd, WM_SETICON, ICON_SMALL as _, small as _);
            SetClassLongPtrW(hwnd, GCLP_HICONSM, small as _);
        }
        if !big.is_null() {
            SendMessageW(hwnd, WM_SETICON, ICON_BIG as _, big as _);
            SetClassLongPtrW(hwnd, GCLP_HICON, big as _);
        }
    }

    Ok(())
}
