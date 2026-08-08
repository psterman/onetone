//! Windows Chromium/Electron Local State + state.vscdb secret reader (Qoder / WorkBuddy).

#![cfg(windows)]

use aes_gcm::{aead::Aead, Aes256Gcm, KeyInit, Nonce};
use base64::{engine::general_purpose::STANDARD, Engine};
use rusqlite::{Connection, OpenFlags};
use serde::Deserialize;
use serde_json::Value;
use std::fs;
use std::path::{Path, PathBuf};
use std::ptr;
use winapi::um::dpapi::CryptUnprotectData;
use winapi::um::winbase::LocalFree;
use winapi::um::wincrypt::DATA_BLOB;

#[derive(Deserialize)]
struct SecretBlob {
    data: Vec<u8>,
}

fn decrypt_dpapi(input: &[u8]) -> Result<Vec<u8>, String> {
    let mut source = DATA_BLOB {
        cbData: input.len() as u32,
        pbData: input.as_ptr() as *mut u8,
    };
    let mut output = DATA_BLOB {
        cbData: 0,
        pbData: ptr::null_mut(),
    };
    let ok = unsafe {
        CryptUnprotectData(
            &mut source,
            ptr::null_mut(),
            ptr::null_mut(),
            ptr::null_mut(),
            ptr::null_mut(),
            0,
            &mut output,
        )
    };
    if ok == 0 {
        return Err("DPAPI unlock failed".into());
    }
    let bytes =
        unsafe { std::slice::from_raw_parts(output.pbData, output.cbData as usize).to_vec() };
    unsafe {
        LocalFree(output.pbData as *mut _);
    }
    Ok(bytes)
}

pub fn encryption_key(root: &Path) -> Result<Vec<u8>, String> {
    let state: Value = serde_json::from_slice(
        &fs::read(root.join("Local State")).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())?;
    let encoded = state
        .pointer("/os_crypt/encrypted_key")
        .and_then(Value::as_str)
        .ok_or_else(|| "missing os_crypt.encrypted_key".to_string())?;
    let encrypted = STANDARD
        .decode(encoded)
        .map_err(|_| "invalid encryption key".to_string())?;
    let payload = encrypted.strip_prefix(b"DPAPI").unwrap_or(&encrypted);
    decrypt_dpapi(payload)
}

pub fn read_secret(root: &Path, key: &[u8], name: &str) -> Result<Value, String> {
    let db = root.join("User").join("globalStorage").join("state.vscdb");
    let connection = Connection::open_with_flags(db, OpenFlags::SQLITE_OPEN_READ_ONLY)
        .map_err(|e| format!("open vscdb: {e}"))?;
    let raw: String = connection
        .query_row(
            "SELECT value FROM ItemTable WHERE key = ?1",
            [name],
            |row| row.get(0),
        )
        .map_err(|_| format!("missing secret {name}"))?;
    let secret: SecretBlob =
        serde_json::from_str(&raw).map_err(|_| "secret blob format".to_string())?;
    if secret.data.len() < 31 || &secret.data[..3] != b"v10" {
        return Err("unsupported secret format".into());
    }
    let cipher = Aes256Gcm::new_from_slice(key).map_err(|_| "bad aes key".to_string())?;
    let plain = cipher
        .decrypt(Nonce::from_slice(&secret.data[3..15]), &secret.data[15..])
        .map_err(|_| "decrypt failed".to_string())?;
    serde_json::from_slice(&plain).map_err(|_| "secret json".to_string())
}

pub fn appdata_roaming_candidates(names: &[&str]) -> Vec<PathBuf> {
    let mut out = Vec::new();
    if let Ok(appdata) = std::env::var("APPDATA") {
        let base = PathBuf::from(appdata);
        for name in names {
            out.push(base.join(name));
        }
    }
    out
}

/// Prefer roots that already have Local State (signed-in Electron).
pub fn find_electron_root(names: &[&str]) -> Option<PathBuf> {
    appdata_roaming_candidates(names)
        .into_iter()
        .find(|p| p.join("Local State").exists())
}
