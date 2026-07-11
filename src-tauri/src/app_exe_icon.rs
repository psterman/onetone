//! Windows executable metadata: FileDescription and icon as PNG data URL.

#[cfg(windows)]
use std::ffi::OsStr;
#[cfg(windows)]
use std::os::windows::ffi::OsStrExt;

#[cfg(windows)]
fn wide_null(s: &str) -> Vec<u16> {
    OsStr::new(s).encode_wide().chain(Some(0)).collect()
}

/// Product / file description from version resource (e.g. "Windows Explorer").
#[cfg(windows)]
pub fn file_description(path: &str) -> Option<String> {
    use winapi::shared::minwindef::DWORD;
    use winapi::um::winver::{GetFileVersionInfoSizeW, GetFileVersionInfoW, VerQueryValueW};

    let wide = wide_null(path);
    unsafe {
        let size = GetFileVersionInfoSizeW(wide.as_ptr(), std::ptr::null_mut());
        if size == 0 {
            return None;
        }
        let mut data = vec![0u8; size as usize];
        if GetFileVersionInfoW(wide.as_ptr(), 0, size, data.as_mut_ptr() as _) == 0 {
            return None;
        }
        let mut trans_ptr: *mut winapi::ctypes::c_void = std::ptr::null_mut();
        let mut trans_len: DWORD = 0;
        let trans_key = wide_null("\\VarFileInfo\\Translation");
        if VerQueryValueW(
            data.as_ptr() as _,
            trans_key.as_ptr(),
            &mut trans_ptr,
            &mut trans_len,
        ) == 0
            || trans_ptr.is_null()
            || trans_len < 4
        {
            return query_file_description(&data, "040904b0");
        }
        let trans = std::slice::from_raw_parts(trans_ptr as *const u16, (trans_len / 2) as usize);
        let lang = format!("{:04x}{:04x}", trans[0], trans[1]);
        query_file_description(&data, &lang)
    }
}

#[cfg(windows)]
unsafe fn query_file_description(data: &[u8], lang_code: &str) -> Option<String> {
    use winapi::shared::minwindef::DWORD;
    use winapi::um::winver::VerQueryValueW;

    let key = wide_null(&format!("\\StringFileInfo\\{lang_code}\\FileDescription"));
    let mut ptr: *mut winapi::ctypes::c_void = std::ptr::null_mut();
    let mut len: DWORD = 0;
    if VerQueryValueW(data.as_ptr() as _, key.as_ptr(), &mut ptr, &mut len) == 0
        || ptr.is_null()
        || len < 2
    {
        return None;
    }
    let slice = std::slice::from_raw_parts(ptr as *const u16, (len / 2) as usize);
    let text = String::from_utf16_lossy(slice);
    let text = text.trim_matches('\0').trim();
    if text.is_empty() {
        None
    } else {
        Some(text.to_string())
    }
}

#[cfg(not(windows))]
pub fn file_description(_path: &str) -> Option<String> {
    None
}

#[cfg(windows)]
pub fn icon_png_data_url(path: &str, size: i32) -> Option<String> {
    let png = icon_png_bytes(path, size)?;
    Some(format!(
        "data:image/png;base64,{}",
        base64_encode(&png)
    ))
}

#[cfg(windows)]
fn icon_png_bytes(path: &str, size: i32) -> Option<Vec<u8>> {
    use winapi::shared::windef::HICON;
    use winapi::um::shellapi::{SHGetFileInfoW, SHFILEINFOW, SHGFI_ICON, SHGFI_LARGEICON};
    use winapi::um::winuser::DestroyIcon;

    let wide = wide_null(path);
    unsafe {
        let mut info: SHFILEINFOW = std::mem::zeroed();
        let ret = SHGetFileInfoW(
            wide.as_ptr(),
            0,
            &mut info,
            std::mem::size_of::<SHFILEINFOW>() as u32,
            SHGFI_ICON | SHGFI_LARGEICON,
        );
        if ret == 0 || info.hIcon.is_null() {
            return None;
        }
        let hicon: HICON = info.hIcon;
        let result = hicon_to_png(hicon, size);
        DestroyIcon(hicon);
        result
    }
}

#[cfg(windows)]
unsafe fn hicon_to_png(hicon: winapi::shared::windef::HICON, size: i32) -> Option<Vec<u8>> {
    use winapi::shared::windef::{HBITMAP, HDC, RECT};
    use winapi::um::wingdi::{
        CreateCompatibleBitmap, CreateCompatibleDC, CreateSolidBrush, DeleteDC, DeleteObject,
        GetDIBits, SelectObject, BITMAPINFO, BITMAPINFOHEADER, BI_RGB, DIB_RGB_COLORS,
    };
    use winapi::um::winuser::{DrawIconEx, FillRect, GetDC, ReleaseDC};

    let hdc_screen: HDC = GetDC(std::ptr::null_mut());
    if hdc_screen.is_null() {
        return None;
    }
    let hdc_mem: HDC = CreateCompatibleDC(hdc_screen);
    if hdc_mem.is_null() {
        ReleaseDC(std::ptr::null_mut(), hdc_screen);
        return None;
    }
    let hbmp: HBITMAP = CreateCompatibleBitmap(hdc_screen, size, size);
    if hbmp.is_null() {
        DeleteDC(hdc_mem);
        ReleaseDC(std::ptr::null_mut(), hdc_screen);
        return None;
    }
    let old = SelectObject(hdc_mem, hbmp as *mut _);
    let brush = CreateSolidBrush(0x00FFFFFF);
    let rect = RECT {
        left: 0,
        top: 0,
        right: size,
        bottom: size,
    };
    FillRect(hdc_mem, &rect, brush);
    DeleteObject(brush as _);
    DrawIconEx(
        hdc_mem,
        0,
        0,
        hicon,
        size,
        size,
        0,
        std::ptr::null_mut(),
        0x0003, // DI_NORMAL
    );

    let mut bmi: BITMAPINFO = std::mem::zeroed();
    bmi.bmiHeader.biSize = std::mem::size_of::<BITMAPINFOHEADER>() as u32;
    bmi.bmiHeader.biWidth = size;
    bmi.bmiHeader.biHeight = -size;
    bmi.bmiHeader.biPlanes = 1;
    bmi.bmiHeader.biBitCount = 32;
    bmi.bmiHeader.biCompression = BI_RGB;
    let buf_len = (size * size * 4) as usize;
    let mut buf = vec![0u8; buf_len];
    if GetDIBits(
        hdc_mem,
        hbmp,
        0,
        size as u32,
        buf.as_mut_ptr() as _,
        &mut bmi,
        DIB_RGB_COLORS,
    ) == 0
    {
        SelectObject(hdc_mem, old);
        DeleteObject(hbmp as _);
        DeleteDC(hdc_mem);
        ReleaseDC(std::ptr::null_mut(), hdc_screen);
        return None;
    }
    SelectObject(hdc_mem, old);
    DeleteObject(hbmp as _);
    DeleteDC(hdc_mem);
    ReleaseDC(std::ptr::null_mut(), hdc_screen);

    // BGRA → RGBA
    for px in buf.chunks_exact_mut(4) {
        px.swap(0, 2);
    }
    let img = image::RgbaImage::from_raw(size as u32, size as u32, buf)?;
    let mut png = Vec::new();
    let mut cursor = std::io::Cursor::new(&mut png);
    image::DynamicImage::ImageRgba8(img)
        .write_to(&mut cursor, image::ImageFormat::Png)
        .ok()?;
    Some(png)
}

#[cfg(not(windows))]
pub fn icon_png_data_url(_path: &str, _size: i32) -> Option<String> {
    None
}

fn base64_encode(data: &[u8]) -> String {
    const TABLE: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::new();
    for chunk in data.chunks(3) {
        let b0 = chunk[0] as u32;
        let b1 = chunk.get(1).copied().unwrap_or(0) as u32;
        let b2 = chunk.get(2).copied().unwrap_or(0) as u32;
        let triple = (b0 << 16) | (b1 << 8) | b2;
        out.push(TABLE[((triple >> 18) & 63) as usize] as char);
        out.push(TABLE[((triple >> 12) & 63) as usize] as char);
        out.push(if chunk.len() > 1 {
            TABLE[((triple >> 6) & 63) as usize] as char
        } else {
            '='
        });
        out.push(if chunk.len() > 2 {
            TABLE[(triple & 63) as usize] as char
        } else {
            '='
        });
    }
    out
}
