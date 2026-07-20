//! Safe Unicode text insert via clipboard backup → Ctrl+V → restore.
//! Never Shell-executes user text. Does not send Enter (insertOnly).

#[cfg(windows)]
use std::ffi::OsStr;
#[cfg(windows)]
use std::os::windows::ffi::OsStrExt;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum InsertTextError {
    Empty,
    ClipboardFailed,
    PasteFailed,
}

impl InsertTextError {
    pub fn as_reason(&self) -> &'static str {
        match self {
            Self::Empty => "input_failed",
            Self::ClipboardFailed => "input_failed",
            Self::PasteFailed => "input_failed",
        }
    }
}

/// Insert `text` at the current focus. Does **not** press Enter.
pub fn insert_text_no_enter(text: &str, key_press_duration_ms: u32) -> Result<(), InsertTextError> {
    let trimmed = text.trim();
    if trimmed.is_empty() {
        return Err(InsertTextError::Empty);
    }
    #[cfg(windows)]
    {
        insert_text_windows(trimmed, key_press_duration_ms)
    }
    #[cfg(not(windows))]
    {
        let _ = key_press_duration_ms;
        Err(InsertTextError::PasteFailed)
    }
}

#[cfg(windows)]
fn insert_text_windows(text: &str, key_press_duration_ms: u32) -> Result<(), InsertTextError> {
    let backup = read_clipboard_unicode().ok();
    if !write_clipboard_unicode(text) {
        return Err(InsertTextError::ClipboardFailed);
    }
    let pasted = crate::keyboard::send_chord("Ctrl+V", key_press_duration_ms);
    // Always try to restore prior clipboard.
    match backup {
        Some(prev) => {
            let _ = write_clipboard_unicode(&prev);
        }
        None => {
            let _ = clear_clipboard();
        }
    }
    if pasted {
        Ok(())
    } else {
        Err(InsertTextError::PasteFailed)
    }
}

#[cfg(windows)]
fn wide_null(s: &str) -> Vec<u16> {
    OsStr::new(s).encode_wide().chain(Some(0)).collect()
}

#[cfg(windows)]
fn write_clipboard_unicode(text: &str) -> bool {
    use winapi::um::winbase::{GlobalAlloc, GlobalLock, GlobalUnlock, GMEM_MOVEABLE};
    use winapi::um::winuser::{
        CloseClipboard, EmptyClipboard, OpenClipboard, SetClipboardData, CF_UNICODETEXT,
    };

    let wide = wide_null(text);
    let bytes = wide.len() * std::mem::size_of::<u16>();
    unsafe {
        if OpenClipboard(std::ptr::null_mut()) == 0 {
            return false;
        }
        let ok = (|| {
            if EmptyClipboard() == 0 {
                return false;
            }
            let hmem = GlobalAlloc(GMEM_MOVEABLE, bytes);
            if hmem.is_null() {
                return false;
            }
            let ptr = GlobalLock(hmem);
            if ptr.is_null() {
                return false;
            }
            std::ptr::copy_nonoverlapping(wide.as_ptr(), ptr as *mut u16, wide.len());
            GlobalUnlock(hmem);
            !SetClipboardData(CF_UNICODETEXT, hmem).is_null()
        })();
        CloseClipboard();
        ok
    }
}

#[cfg(windows)]
fn read_clipboard_unicode() -> Result<String, ()> {
    use winapi::um::winbase::{GlobalLock, GlobalUnlock};
    use winapi::um::winuser::{CloseClipboard, GetClipboardData, OpenClipboard, CF_UNICODETEXT};

    unsafe {
        if OpenClipboard(std::ptr::null_mut()) == 0 {
            return Err(());
        }
        let hmem = GetClipboardData(CF_UNICODETEXT);
        if hmem.is_null() {
            CloseClipboard();
            return Err(());
        }
        let ptr = GlobalLock(hmem) as *const u16;
        if ptr.is_null() {
            CloseClipboard();
            return Err(());
        }
        let mut len = 0usize;
        while *ptr.add(len) != 0 {
            len += 1;
            if len > 1_000_000 {
                break;
            }
        }
        let slice = std::slice::from_raw_parts(ptr, len);
        let text = String::from_utf16_lossy(slice);
        GlobalUnlock(hmem);
        CloseClipboard();
        Ok(text)
    }
}

#[cfg(windows)]
fn clear_clipboard() -> bool {
    use winapi::um::winuser::{CloseClipboard, EmptyClipboard, OpenClipboard};
    unsafe {
        if OpenClipboard(std::ptr::null_mut()) == 0 {
            return false;
        }
        let ok = EmptyClipboard() != 0;
        CloseClipboard();
        ok
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_text_fails() {
        assert_eq!(insert_text_no_enter("   ", 50), Err(InsertTextError::Empty));
    }
}
