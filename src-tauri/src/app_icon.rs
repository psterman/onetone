//! Apply the app window / taskbar icon.
//!
//! Tray icons are separate (`tray_icon_render`, runtime PNG).
//! Taskbar buttons follow the HWND icon — load the transparent master PNG
//! (not the exe's embedded BMP-era .ico, which paints alpha as a black plate).

use tauri::image::Image;

const ICON_PNG: &[u8] = include_bytes!("../icons/icon.png");

pub fn apply_window_icon(window: &tauri::WebviewWindow) -> tauri::Result<()> {
    let img = image::load_from_memory(ICON_PNG)
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::InvalidData, e))?;
    let rgba = img.to_rgba8();
    let (width, height) = rgba.dimensions();
    window.set_icon(Image::new_owned(rgba.into_raw(), width, height))?;

    #[cfg(windows)]
    {
        if let Err(err) = apply_win32_hwnd_icons(window, &img.to_rgba8()) {
            eprintln!("[app_icon] win32 hwnd icon: {err}");
        }
    }

    Ok(())
}

#[cfg(windows)]
fn encode_png_size(img: &image::RgbaImage, size: u32) -> Result<Vec<u8>, String> {
    use image::imageops::FilterType;
    use std::io::Cursor;

    let resized = image::imageops::resize(img, size, size, FilterType::Lanczos3);
    let mut png = Cursor::new(Vec::new());
    image::DynamicImage::ImageRgba8(resized)
        .write_to(&mut png, image::ImageFormat::Png)
        .map_err(|e| e.to_string())?;
    Ok(png.into_inner())
}

#[cfg(windows)]
fn apply_win32_hwnd_icons(
    window: &tauri::WebviewWindow,
    rgba: &image::RgbaImage,
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

    // Vista+: CreateIconFromResourceEx accepts raw PNG bytes and keeps alpha.
    let small_png = encode_png_size(rgba, 16)?;
    let big_png = encode_png_size(rgba, 32)?;

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
