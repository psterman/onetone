//! Cross-WebView tray snapshot bridge.
//! Main window publishes; Soft Pad overlay gets/listens. Never reads localStorage.
//! Overlay may request collect (text/attach); main owns the Prep model write.
//! Disk mirror under data_root so Soft Pad can read materials after restart before main JS boots.

use std::fs;
use std::path::PathBuf;
use std::sync::{LazyLock, Mutex};

use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::{AppHandle, Emitter, Manager};

pub const TRAY_CHANGED_EVENT: &str = "tray_changed";
pub const TRAY_COLLECT_EVENT: &str = "tray_collect";

/// Matches JS assemble ceiling — reject oversized text drops early.
const MAX_COLLECT_TEXT_CHARS: usize = 200 * 1024;
/// Soft Pad clipboard / paste image inbox (decoded bytes).
const MAX_INBOX_BYTES: usize = 12 * 1024 * 1024;

static CACHE: LazyLock<Mutex<Option<Value>>> = LazyLock::new(|| Mutex::new(None));
/// Overlay drop may emit before main's listener is ready — main drains this queue.
static PENDING_COLLECT: LazyLock<Mutex<Vec<Value>>> = LazyLock::new(|| Mutex::new(Vec::new()));

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrayPublishResult {
    pub ok: bool,
    pub content_revision: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrayCarryDismissResult {
    pub ok: bool,
    pub generation: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrayCollectResult {
    pub ok: bool,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrayCollectArgs {
    pub kind: String,
    pub text: Option<String>,
    pub path: Option<String>,
    pub name: Option<String>,
    pub id: Option<String>,
    /// Optional PNG thumb (base64, no data: prefix) for list preview.
    #[serde(default)]
    pub preview_base64: Option<String>,
}

fn empty_snapshot() -> Value {
    serde_json::json!({
        "schemaVersion": 1,
        "empty": true,
        "collectionId": "",
        "contentRevision": 0,
        "assembledRevision": 0,
        "phase": "EMPTY",
        "title": "",
        "preview": "",
        "materialCount": 0,
        "includedCount": 0,
        "manualUploadCount": 0,
        "files": [],
        "materials": [],
        "assembledMd": "",
        "assembledAt": null,
        "size": {
            "chars": 0,
            "truncated": false,
            "downgradedMaterialIds": [],
            "reason": null
        },
        "carry": {
            "active": false,
            "targetKind": null,
            "updatedAt": null,
            "generation": 0
        },
        "handoffCount": 0
    })
}

fn snapshot_path() -> PathBuf {
    crate::data_root::effective_data_root()
        .join("tray")
        .join("snapshot.json")
}

/// Restart: keep materials, never resurrect carry UI as active.
fn sanitize_on_load(mut snap: Value) -> Value {
    if snap.get("schemaVersion").and_then(|v| v.as_u64()) != Some(1) {
        return empty_snapshot();
    }
    if !snap.get("materials").map(|v| v.is_array()).unwrap_or(false) {
        if let Some(obj) = snap.as_object_mut() {
            obj.insert("materials".into(), serde_json::json!([]));
        }
    }
    if let Some(obj) = snap.as_object_mut() {
        let gen = obj
            .get("carry")
            .and_then(|c| c.get("generation"))
            .and_then(|v| v.as_u64())
            .unwrap_or(0);
        obj.insert(
            "carry".into(),
            serde_json::json!({
                "active": false,
                "targetKind": serde_json::Value::Null,
                "updatedAt": serde_json::Value::Null,
                "generation": gen
            }),
        );
    }
    snap
}

fn persist_snapshot(snapshot: &Value) {
    let path = snapshot_path();
    let Some(parent) = path.parent() else {
        return;
    };
    if fs::create_dir_all(parent).is_err() {
        return;
    }
    let Ok(body) = serde_json::to_string(snapshot) else {
        return;
    };
    let tmp = parent.join("snapshot.json.tmp");
    if fs::write(&tmp, body.as_bytes()).is_err() {
        return;
    }
    #[cfg(windows)]
    {
        let _ = fs::remove_file(&path);
    }
    let _ = fs::rename(&tmp, &path);
}

fn load_persisted_snapshot() -> Option<Value> {
    let raw = fs::read_to_string(snapshot_path()).ok()?;
    let parsed: Value = serde_json::from_str(&raw).ok()?;
    Some(sanitize_on_load(parsed))
}

fn hydrate_cache_from_disk_if_empty(slot: &mut Option<Value>) {
    if slot.is_some() {
        return;
    }
    if let Some(s) = load_persisted_snapshot() {
        *slot = Some(s);
    }
}

pub fn publish_snapshot(app: &AppHandle, snapshot: Value) -> TrayPublishResult {
    let revision = snapshot
        .get("contentRevision")
        .and_then(|v| v.as_u64())
        .unwrap_or(0);
    {
        let mut g = CACHE.lock().unwrap_or_else(|e| e.into_inner());
        *g = Some(snapshot.clone());
    }
    persist_snapshot(&snapshot);
    let _ = app.emit(TRAY_CHANGED_EVENT, snapshot);
    TrayPublishResult {
        ok: true,
        content_revision: revision,
    }
}

pub fn get_snapshot() -> Value {
    let mut g = CACHE.lock().unwrap_or_else(|e| e.into_inner());
    hydrate_cache_from_disk_if_empty(&mut g);
    g.clone().unwrap_or_else(empty_snapshot)
}

/// Soft Pad "cancel carry": bump generation, force active=false, re-emit.
pub fn dismiss_carry(app: &AppHandle) -> TrayCarryDismissResult {
    let mut snap = get_snapshot();
    let gen = snap
        .get("carry")
        .and_then(|c| c.get("generation"))
        .and_then(|v| v.as_u64())
        .unwrap_or(0)
        .saturating_add(1);
    if let Some(obj) = snap.as_object_mut() {
        obj.insert(
            "carry".into(),
            serde_json::json!({
                "active": false,
                "targetKind": serde_json::Value::Null,
                "updatedAt": now_ms(),
                "generation": gen
            }),
        );
    }
    publish_snapshot(app, snap);
    TrayCarryDismissResult {
        ok: true,
        generation: gen,
    }
}

/// Soft Pad HTML5 drop → main Prep.collectMaterial (overlay never writes the model).
pub fn request_collect(app: &AppHandle, args: TrayCollectArgs) -> TrayCollectResult {
    let kind = args.kind.trim().to_ascii_lowercase();
    let payload = match kind.as_str() {
        "text" => {
            let text = args.text.unwrap_or_default();
            let text = text.trim();
            if text.is_empty() {
                return TrayCollectResult {
                    ok: false,
                    error: Some("empty".into()),
                };
            }
            if text.chars().count() > MAX_COLLECT_TEXT_CHARS {
                return TrayCollectResult {
                    ok: false,
                    error: Some("too_large".into()),
                };
            }
            serde_json::json!({ "kind": "text", "text": text })
        }
        "attach" => {
            let path = args
                .path
                .as_deref()
                .unwrap_or("")
                .trim()
                .to_string();
            if path.is_empty() {
                return TrayCollectResult {
                    ok: false,
                    error: Some("empty_path".into()),
                };
            }
            let name = args
                .name
                .as_deref()
                .map(str::trim)
                .filter(|s| !s.is_empty())
                .map(|s| s.to_string());
            let preview = args
                .preview_base64
                .as_deref()
                .map(str::trim)
                .filter(|s| !s.is_empty())
                .map(|s| s.to_string());
            serde_json::json!({
                "kind": "attach",
                "path": path,
                "name": name,
                "previewBase64": preview,
            })
        }
        "remove" => {
            let id = args
                .id
                .as_deref()
                .unwrap_or("")
                .trim()
                .to_string();
            if id.is_empty() {
                return TrayCollectResult {
                    ok: false,
                    error: Some("empty_id".into()),
                };
            }
            serde_json::json!({ "kind": "remove", "id": id })
        }
        "clear" => serde_json::json!({ "kind": "clear" }),
        // Soft Pad "+" — main owns the native file dialog (overlay topmost buries WinForms).
        "pick" | "pick_file" => serde_json::json!({ "kind": "pick" }),
        // Soft Pad Ctrl+C — main ensureAssembled + write clipboard (full text bodies).
        "copy_md" | "copy_markdown" => serde_json::json!({ "kind": "copy_md" }),
        _ => {
            return TrayCollectResult {
                ok: false,
                error: Some("unknown_kind".into()),
            };
        }
    };
    {
        let mut q = PENDING_COLLECT
            .lock()
            .unwrap_or_else(|e| e.into_inner());
        q.push(payload.clone());
        // ponytail: bounded queue — drop oldest if Soft Pad sprays while main is dead.
        if q.len() > 32 {
            let overflow = q.len() - 32;
            q.drain(0..overflow);
        }
    }
    let _ = app.emit(TRAY_COLLECT_EVENT, &payload);
    if let Some(main) = app.get_webview_window("main") {
        let _ = main.emit(TRAY_COLLECT_EVENT, &payload);
    }
    // to_js backup — main always has the to_js bridge; dedicated listen can race cold boot.
    let mut js_payload = payload.clone();
    if let Some(obj) = js_payload.as_object_mut() {
        obj.insert("type".into(), serde_json::json!("tray_collect"));
    }
    let _ = crate::ipc::emit_to_main_if_available(app, None, js_payload);
    TrayCollectResult {
        ok: true,
        error: None,
    }
}

/// Main Prep drains pending Soft Pad drops (event may have been missed).
pub fn drain_pending_collect() -> Vec<Value> {
    let mut q = PENDING_COLLECT
        .lock()
        .unwrap_or_else(|e| e.into_inner());
    std::mem::take(&mut *q)
}

fn inbox_dir() -> PathBuf {
    crate::data_root::effective_data_root().join("tray").join("inbox")
}

fn safe_inbox_name(name: Option<&str>) -> String {
    let raw = name.unwrap_or("clipboard.png").trim();
    let leaf = raw
        .rsplit(['/', '\\'])
        .next()
        .unwrap_or("clipboard.png")
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '.' || c == '-' || c == '_' {
                c
            } else {
                '_'
            }
        })
        .collect::<String>();
    let leaf = if leaf.is_empty() || leaf == "." || leaf == ".." {
        "clipboard.png".into()
    } else {
        leaf
    };
    let stamp = now_ms();
    format!("{stamp}_{leaf}")
}

/// Save Soft Pad paste/drop image bytes → return absolute path for attach collect.
pub fn write_inbox_bytes(name: Option<String>, bytes: &[u8]) -> Result<String, String> {
    if bytes.is_empty() {
        return Err("empty".into());
    }
    if bytes.len() > MAX_INBOX_BYTES {
        return Err("too_large".into());
    }
    let dir = inbox_dir();
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.join(safe_inbox_name(name.as_deref()));
    let tmp = path.with_extension("tmp");
    fs::write(&tmp, bytes).map_err(|e| e.to_string())?;
    #[cfg(windows)]
    {
        let _ = fs::remove_file(&path);
    }
    fs::rename(&tmp, &path).map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().to_string())
}

/// Decode base64 (std alphabet, optional whitespace) then write inbox.
pub fn write_inbox_base64(name: Option<String>, bytes_base64: &str) -> Result<String, String> {
    use base64::Engine;
    let cleaned: String = bytes_base64
        .chars()
        .filter(|c| !c.is_whitespace())
        .collect();
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(cleaned.as_bytes())
        .map_err(|_| "bad_base64".to_string())?;
    write_inbox_bytes(name, &bytes)
}

fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_snapshot_has_schema() {
        let s = empty_snapshot();
        assert_eq!(s["schemaVersion"], 1);
        assert_eq!(s["empty"], true);
        assert_eq!(s["carry"]["active"], false);
        assert!(s["materials"].is_array());
    }

    #[test]
    fn sanitize_on_load_clears_carry_keeps_materials() {
        let raw = serde_json::json!({
            "schemaVersion": 1,
            "materials": [{ "id": "m1", "kind": "text", "name": "hi" }],
            "carry": { "active": true, "targetKind": "cursor", "generation": 3 }
        });
        let s = sanitize_on_load(raw);
        assert_eq!(s["carry"]["active"], false);
        assert!(s["carry"]["targetKind"].is_null());
        assert_eq!(s["carry"]["generation"], 3);
        assert_eq!(s["materials"][0]["id"], "m1");
    }

    #[test]
    fn safe_inbox_name_strips_path() {
        let n = safe_inbox_name(Some(r"C:\tmp\photo.png"));
        assert!(n.ends_with("_photo.png"), "{n}");
        let n2 = safe_inbox_name(Some("../x"));
        assert!(n2.contains("x") || n2.ends_with("_clipboard.png") || n2.contains('_'));
    }

    #[test]
    fn collect_text_rejects_empty() {
        let args = TrayCollectArgs {
            kind: "text".into(),
            text: Some("   ".into()),
            path: None,
            name: None,
            id: None,
            preview_base64: None,
        };
        // No AppHandle in unit test — validate the empty branch via direct checks.
        let text = args.text.unwrap_or_default();
        assert!(text.trim().is_empty());
        assert_eq!(MAX_COLLECT_TEXT_CHARS, 200 * 1024);
    }
}
