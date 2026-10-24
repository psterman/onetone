//! Windows clipboard → PNG bytes for home / Soft Pad paste cards.
//! Prefer "PNG" registered format (Snipping Tool / modern copy); fall back to CF_DIB.

#![cfg(windows)]

use std::io::Cursor;
use std::ptr;

use winapi::shared::minwindef::{HGLOBAL, UINT};
use winapi::um::winbase::{GlobalLock, GlobalSize, GlobalUnlock};
use winapi::um::winuser::{
    CloseClipboard, GetClipboardData, IsClipboardFormatAvailable, OpenClipboard,
    RegisterClipboardFormatA, CF_DIB,
};

/// Read clipboard image as PNG bytes (empty → Err).
pub fn read_clipboard_image_png() -> Result<Vec<u8>, String> {
    unsafe {
        if OpenClipboard(ptr::null_mut()) == 0 {
            return Err("clipboard_busy".into());
        }
        let result = read_clipboard_image_png_unlocked();
        CloseClipboard();
        result
    }
}

unsafe fn read_clipboard_image_png_unlocked() -> Result<Vec<u8>, String> {
    // 1) Modern PNG on clipboard (Win+Shift+S, many apps).
    let png_fmt: UINT = RegisterClipboardFormatA(b"PNG\0".as_ptr() as *const i8);
    if png_fmt != 0 && IsClipboardFormatAvailable(png_fmt) != 0 {
        if let Ok(bytes) = hglobal_bytes(GetClipboardData(png_fmt)) {
            if bytes.len() > 8 && bytes.starts_with(&[0x89, b'P', b'N', b'G']) {
                return Ok(bytes);
            }
            // Some hosts store PNG without checking — still try encode pass-through.
            if !bytes.is_empty() {
                return Ok(bytes);
            }
        }
    }

    // 2) Classic device-independent bitmap (PrintScreen / older apps).
    if IsClipboardFormatAvailable(CF_DIB) != 0 {
        let dib = hglobal_bytes(GetClipboardData(CF_DIB))?;
        return dib_to_png(&dib);
    }

    Err("no_image".into())
}

unsafe fn hglobal_bytes(hmem: HGLOBAL) -> Result<Vec<u8>, String> {
    if hmem.is_null() {
        return Err("empty".into());
    }
    let size = GlobalSize(hmem);
    if size == 0 || size > 12 * 1024 * 1024 {
        return Err(if size == 0 {
            "empty".into()
        } else {
            "too_large".into()
        });
    }
    let ptr = GlobalLock(hmem);
    if ptr.is_null() {
        return Err("lock_failed".into());
    }
    let slice = std::slice::from_raw_parts(ptr as *const u8, size);
    let out = slice.to_vec();
    GlobalUnlock(hmem);
    Ok(out)
}

/// Minimal CF_DIB → PNG for 24/32-bit BI_RGB (covers PrintScreen).
fn dib_to_png(dib: &[u8]) -> Result<Vec<u8>, String> {
    if dib.len() < 40 {
        return Err("dib_short".into());
    }
    let header_size = u32::from_le_bytes(dib[0..4].try_into().unwrap()) as usize;
    if header_size < 40 || header_size > dib.len() {
        return Err("dib_header".into());
    }
    let width = i32::from_le_bytes(dib[4..8].try_into().unwrap());
    let height_raw = i32::from_le_bytes(dib[8..12].try_into().unwrap());
    let planes = u16::from_le_bytes(dib[12..14].try_into().unwrap());
    let bit_count = u16::from_le_bytes(dib[14..16].try_into().unwrap());
    let compression = u32::from_le_bytes(dib[16..20].try_into().unwrap());
    if planes != 1 || compression != 0 {
        return Err("dib_unsupported".into());
    }
    if bit_count != 24 && bit_count != 32 {
        return Err("dib_bpp".into());
    }
    let w = width.unsigned_abs() as usize;
    let h = height_raw.unsigned_abs() as usize;
    if w == 0 || h == 0 || w > 8192 || h > 8192 {
        return Err("dib_size".into());
    }
    let bottom_up = height_raw > 0;
    let row_stride = ((w * (bit_count as usize) + 31) / 32) * 4;
    let pixels = &dib[header_size..];
    if pixels.len() < row_stride * h {
        return Err("dib_pixels".into());
    }

    let mut rgba = vec![0u8; w * h * 4];
    for y in 0..h {
        let src_y = if bottom_up { h - 1 - y } else { y };
        let row = &pixels[src_y * row_stride..src_y * row_stride + row_stride];
        for x in 0..w {
            let i = x * (bit_count as usize / 8);
            let b = row[i];
            let g = row[i + 1];
            let r = row[i + 2];
            let a = if bit_count == 32 { row[i + 3] } else { 255 };
            let o = (y * w + x) * 4;
            rgba[o] = r;
            rgba[o + 1] = g;
            rgba[o + 2] = b;
            rgba[o + 3] = a;
        }
    }

    let img = image::RgbaImage::from_raw(w as u32, h as u32, rgba)
        .ok_or_else(|| "dib_buffer".to_string())?;
    let mut out = Cursor::new(Vec::new());
    img.write_to(&mut out, image::ImageFormat::Png)
        .map_err(|e| e.to_string())?;
    Ok(out.into_inner())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn dib_short_errors() {
        assert!(dib_to_png(&[0u8; 10]).is_err());
    }
}
