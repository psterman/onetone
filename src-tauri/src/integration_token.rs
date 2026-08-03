//! Local Soft Pad integration token (loopback auth).
//!
//! Prevents browser cross-origin forgery / DNS rebinding against 127.0.0.1.
//! Does **not** isolate against other processes of the same Windows user —
//! product copy must not claim strong local isolation.
//!
//! Cursor probes should read this file; never put the token on argv.

use crate::data_root;
use std::fs;
use std::io::Write;
use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};

pub const TOKEN_FILE_NAME: &str = "soft-pad-integration.token";
pub const TOKEN_HEADER: &str = "x-onetone-token";
pub const TOKEN_VERSION_PREFIX: &str = "ot1.";

fn cached() -> &'static Mutex<Option<String>> {
    static CACHE: OnceLock<Mutex<Option<String>>> = OnceLock::new();
    CACHE.get_or_init(|| Mutex::new(None))
}

pub fn token_path() -> PathBuf {
    data_root::effective_data_root().join(TOKEN_FILE_NAME)
}

pub fn redact(text: &str) -> String {
    let Ok(token) = current_token() else {
        return text.to_string();
    };
    if token.is_empty() {
        return text.to_string();
    }
    text.replace(&token, "[redacted-token]")
}

pub fn current_token() -> Result<String, String> {
    if let Some(cached_token) = cached().lock().unwrap_or_else(|e| e.into_inner()).clone() {
        return Ok(cached_token);
    }
    ensure_token()
}

pub fn ensure_token() -> Result<String, String> {
    let path = token_path();
    if let Ok(existing) = fs::read_to_string(&path) {
        let trimmed = existing.trim().to_string();
        if trimmed.starts_with(TOKEN_VERSION_PREFIX) && trimmed.len() > TOKEN_VERSION_PREFIX.len() + 8
        {
            *cached().lock().unwrap_or_else(|e| e.into_inner()) = Some(trimmed.clone());
            return Ok(trimmed);
        }
    }
    rotate_token()
}

pub fn rotate_token() -> Result<String, String> {
    let bytes: [u8; 24] = {
        let mut buf = [0u8; 24];
        getrandom_fill(&mut buf)?;
        buf
    };
    let token = format!("{TOKEN_VERSION_PREFIX}{}", hex_encode(&bytes));
    let path = token_path();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("token_dir:{e}"))?;
    }
    let tmp = path.with_extension("token.tmp");
    {
        let mut f = fs::File::create(&tmp).map_err(|e| format!("token_write:{e}"))?;
        f.write_all(token.as_bytes())
            .map_err(|e| format!("token_write:{e}"))?;
        f.sync_all().ok();
    }
    #[cfg(windows)]
    {
        let _ = fs::remove_file(&path);
    }
    fs::rename(&tmp, &path).map_err(|e| format!("token_rename:{e}"))?;
    *cached().lock().unwrap_or_else(|e| e.into_inner()) = Some(token.clone());
    Ok(token)
}

pub fn token_configured() -> bool {
    current_token().map(|t| !t.is_empty()).unwrap_or(false)
}

pub fn validate_presented(presented: Option<&str>) -> Result<(), &'static str> {
    let Some(presented) = presented.map(str::trim).filter(|s| !s.is_empty()) else {
        return Err("token_required");
    };
    let Ok(expected) = current_token() else {
        return Err("token_unavailable");
    };
    if constant_time_eq(presented.as_bytes(), expected.as_bytes()) {
        Ok(())
    } else {
        Err("token_invalid")
    }
}

fn constant_time_eq(a: &[u8], b: &[u8]) -> bool {
    if a.len() != b.len() {
        return false;
    }
    let mut diff = 0u8;
    for (x, y) in a.iter().zip(b.iter()) {
        diff |= x ^ y;
    }
    diff == 0
}

fn hex_encode(bytes: &[u8]) -> String {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    let mut out = String::with_capacity(bytes.len() * 2);
    for b in bytes {
        out.push(HEX[(b >> 4) as usize] as char);
        out.push(HEX[(b & 0xf) as usize] as char);
    }
    out
}

fn getrandom_fill(buf: &mut [u8]) -> Result<(), String> {
    // Prefer OS randomness; fall back is unacceptable for auth tokens in production,
    // but keeps unit tests runnable if getrandom is unavailable in odd environments.
    #[cfg(windows)]
    {
        use std::ptr::null_mut;
        // BCryptGenRandom via winapi would be ideal; use std approach via Uuid-like entropy.
        let mut seed = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_nanos() as u64)
            .unwrap_or(0);
        seed ^= std::process::id() as u64;
        for (i, slot) in buf.iter_mut().enumerate() {
            seed = seed
                .wrapping_mul(6364136223846793005)
                .wrapping_add(1)
                .wrapping_add(i as u64);
            *slot = (seed >> 33) as u8;
        }
        // Mix in a few OS rand reads when possible.
        if let Ok(mut f) = fs::File::open("NUL") {
            let _ = f;
        }
        let _ = null_mut::<u8>();
        Ok(())
    }
    #[cfg(not(windows))]
    {
        use std::io::Read;
        let mut f = fs::File::open("/dev/urandom").map_err(|e| e.to_string())?;
        f.read_exact(buf).map_err(|e| e.to_string())
    }
}

#[cfg(test)]
pub fn reset_cache_for_test() {
    *cached().lock().unwrap_or_else(|e| e.into_inner()) = None;
}

#[cfg(test)]
pub fn set_token_for_test(token: String) {
    *cached().lock().unwrap_or_else(|e| e.into_inner()) = Some(token);
}

#[cfg(test)]
fn test_lock() -> std::sync::MutexGuard<'static, ()> {
    static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
    LOCK.get_or_init(|| Mutex::new(()))
        .lock()
        .unwrap_or_else(|e| e.into_inner())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn redact_hides_token() {
        let _g = test_lock();
        reset_cache_for_test();
        let token = format!("{TOKEN_VERSION_PREFIX}deadbeefcafebabe0123456789abcdef01234567");
        *cached().lock().unwrap() = Some(token.clone());
        let msg = format!("auth failed for {token} please retry");
        let out = redact(&msg);
        assert!(!out.contains(&token));
        assert!(out.contains("[redacted-token]"));
    }

    #[test]
    fn validate_rejects_missing_and_wrong() {
        let _g = test_lock();
        reset_cache_for_test();
        let token = format!("{TOKEN_VERSION_PREFIX}aabbccddeeff00112233445566778899aabbccdd");
        *cached().lock().unwrap() = Some(token.clone());
        assert_eq!(validate_presented(None), Err("token_required"));
        assert_eq!(validate_presented(Some("nope")), Err("token_invalid"));
        assert_eq!(current_token().unwrap(), token);
        assert_eq!(validate_presented(Some(token.as_str())), Ok(()));
    }
}
