//! Soft Pad → Cursor IDE: seed `composerMode.plan` / `composerMode.agent` in keybindings.json.
//! Merge by command id (force OneTone chords). Never wipe unrelated user bindings.

use serde_json::{json, Value};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

pub const CMD_PLAN: &str = "composerMode.plan";
pub const CMD_AGENT: &str = "composerMode.agent";
/// VS Code / Cursor keybindings.json spelling (lowercase).
/// Avoid Ctrl+Alt+P — clashes with common screenshot / pin tools.
pub const KEY_PLAN: &str = "ctrl+alt+shift+p";
pub const KEY_AGENT: &str = "ctrl+alt+.";

const HEADER: &str = "// OneTone Soft Pad: composerMode.plan / composerMode.agent (do not delete)\n";

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct EnsureResult {
    pub changed: bool,
    pub path: String,
    pub reason: String,
}

fn now_stamp() -> String {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs().to_string())
        .unwrap_or_else(|_| "0".into())
}

/// `%APPDATA%\\Cursor\\User\\keybindings.json` (Windows). Override via `CURSOR_USER_DIR` in tests.
pub fn keybindings_path() -> PathBuf {
    if let Ok(dir) = std::env::var("CURSOR_USER_DIR") {
        let p = PathBuf::from(dir.trim());
        if !p.as_os_str().is_empty() {
            return p.join("keybindings.json");
        }
    }
    let appdata = std::env::var_os("APPDATA")
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("."));
    appdata.join("Cursor").join("User").join("keybindings.json")
}

/// Strip `//` line comments and `/* */` blocks so serde can parse VS Code JSONC.
pub fn strip_jsonc(raw: &str) -> String {
    let mut out = String::with_capacity(raw.len());
    let bytes = raw.as_bytes();
    let mut i = 0;
    let mut in_str = false;
    let mut escape = false;
    while i < bytes.len() {
        let c = bytes[i] as char;
        if in_str {
            out.push(c);
            if escape {
                escape = false;
            } else if c == '\\' {
                escape = true;
            } else if c == '"' {
                in_str = false;
            }
            i += 1;
            continue;
        }
        if c == '"' {
            in_str = true;
            out.push(c);
            i += 1;
            continue;
        }
        if c == '/' && i + 1 < bytes.len() {
            let n = bytes[i + 1] as char;
            if n == '/' {
                i += 2;
                while i < bytes.len() && bytes[i] != b'\n' {
                    i += 1;
                }
                continue;
            }
            if n == '*' {
                i += 2;
                while i + 1 < bytes.len() && !(bytes[i] == b'*' && bytes[i + 1] == b'/') {
                    i += 1;
                }
                i = (i + 2).min(bytes.len());
                continue;
            }
        }
        out.push(c);
        i += 1;
    }
    out
}

/// Upsert OneTone-managed composer mode bindings. Pure: returns whether `arr` changed.
pub fn merge_composer_mode_bindings(arr: &mut Vec<Value>) -> bool {
    let wanted = [(CMD_PLAN, KEY_PLAN), (CMD_AGENT, KEY_AGENT)];
    let mut changed = false;
    for (cmd, key) in wanted {
        if let Some(entry) = arr.iter_mut().find(|v| {
            v.get("command")
                .and_then(|c| c.as_str())
                .is_some_and(|c| c == cmd)
        }) {
            let cur = entry
                .get("key")
                .and_then(|k| k.as_str())
                .unwrap_or("")
                .trim();
            if !cur.eq_ignore_ascii_case(key) {
                if let Some(obj) = entry.as_object_mut() {
                    obj.insert("key".into(), json!(key));
                    changed = true;
                }
            }
        } else {
            arr.push(json!({ "key": key, "command": cmd }));
            changed = true;
        }
    }
    changed
}

fn backup_once(path: &Path) -> Result<(), String> {
    if !path.is_file() {
        return Ok(());
    }
    let parent = path.parent().unwrap_or_else(|| Path::new("."));
    let stamp = now_stamp();
    let mut dest = parent.join(format!("keybindings.json.onetone-backup-{stamp}"));
    let mut n = 0u32;
    while dest.exists() {
        n += 1;
        dest = parent.join(format!("keybindings.json.onetone-backup-{stamp}-{n}"));
    }
    fs::copy(path, &dest).map_err(|e| format!("backup failed: {e}"))?;
    Ok(())
}

fn parse_bindings_array(raw: &str) -> Result<Vec<Value>, String> {
    let cleaned = strip_jsonc(raw);
    let trimmed = cleaned.trim();
    if trimmed.is_empty() {
        return Ok(Vec::new());
    }
    let v: Value =
        serde_json::from_str(trimmed).map_err(|e| format!("keybindings.json parse: {e}"))?;
    match v {
        Value::Array(a) => Ok(a),
        _ => Err("keybindings.json root must be an array".into()),
    }
}

fn write_bindings(path: &Path, arr: &[Value]) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("mkdir: {e}"))?;
    }
    let body = serde_json::to_string_pretty(arr).map_err(|e| format!("serialize: {e}"))?;
    let text = format!("{HEADER}{body}\n");
    fs::write(path, text).map_err(|e| format!("write: {e}"))
}

/// Merge plan/agent mode keys into Cursor user keybindings. Idempotent; mtime short-circuit.
pub fn ensure_composer_mode_keybindings() -> Result<EnsureResult, String> {
    let path = keybindings_path();
    let path_s = path.display().to_string();

    static LAST: Mutex<Option<(String, u64, bool)>> = Mutex::new(None);
    let mtime = path
        .metadata()
        .and_then(|m| m.modified())
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_secs())
        .unwrap_or(0);
    if let Ok(g) = LAST.lock() {
        if let Some((ref p, t, ok)) = *g {
            if p == &path_s && t == mtime && ok && path.is_file() {
                return Ok(EnsureResult {
                    changed: false,
                    path: path_s,
                    reason: "mtime_skip".into(),
                });
            }
        }
    }

    let raw = if path.is_file() {
        fs::read_to_string(&path).map_err(|e| format!("read: {e}"))?
    } else {
        String::new()
    };
    let mut arr = parse_bindings_array(&raw)?;
    if !merge_composer_mode_bindings(&mut arr) {
        if let Ok(mut g) = LAST.lock() {
            *g = Some((path_s.clone(), mtime, true));
        }
        return Ok(EnsureResult {
            changed: false,
            path: path_s,
            reason: "already_ok".into(),
        });
    }

    if path.is_file() {
        backup_once(&path)?;
    }
    write_bindings(&path, &arr)?;
    let new_mtime = path
        .metadata()
        .and_then(|m| m.modified())
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_secs())
        .unwrap_or(mtime);
    if let Ok(mut g) = LAST.lock() {
        *g = Some((path_s.clone(), new_mtime, true));
    }
    Ok(EnsureResult {
        changed: true,
        path: path_s,
        reason: "merged".into(),
    })
}

/// Best-effort ensure from Soft Pad ready path (never fails the pad heal).
pub fn ensure_composer_mode_keybindings_quiet() {
    match ensure_composer_mode_keybindings() {
        Ok(r) if r.changed => {
            eprintln!(
                "[onetone] cursor keybindings ensured path={} reason={}",
                r.path, r.reason
            );
        }
        Err(e) => {
            eprintln!("[onetone] cursor keybindings ensure failed: {e}");
        }
        _ => {}
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn strip_jsonc_drops_line_comments() {
        let raw = "// Place your key bindings\n[\n  { \"key\": \"a\", \"command\": \"x\" }\n]\n";
        let v: Value = serde_json::from_str(&strip_jsonc(raw)).unwrap();
        assert!(v.is_array());
    }

    #[test]
    fn merge_empty_adds_both() {
        let mut arr = Vec::new();
        assert!(merge_composer_mode_bindings(&mut arr));
        assert_eq!(arr.len(), 2);
        assert!(!merge_composer_mode_bindings(&mut arr));
    }

    #[test]
    fn merge_updates_existing_command_key() {
        let mut arr = vec![
            json!({ "key": "shift+p", "command": CMD_PLAN }),
            json!({ "key": "ctrl+k", "command": "workbench.action.quickOpen" }),
        ];
        assert!(merge_composer_mode_bindings(&mut arr));
        let plan = arr
            .iter()
            .find(|v| v["command"] == CMD_PLAN)
            .expect("plan");
        assert_eq!(plan["key"], KEY_PLAN);
        assert!(arr.iter().any(|v| v["command"] == CMD_AGENT));
        assert!(arr
            .iter()
            .any(|v| v["command"] == "workbench.action.quickOpen"));
    }

    #[test]
    fn ensure_writes_under_cursor_user_dir() {
        let dir = std::env::temp_dir().join(format!(
            "onetone-cursor-kb-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        std::env::set_var("CURSOR_USER_DIR", &dir);
        // Reset mtime cache by writing a distinct path each run (env override).
        let r = ensure_composer_mode_keybindings().expect("ensure");
        assert!(r.changed);
        let raw = fs::read_to_string(dir.join("keybindings.json")).unwrap();
        assert!(raw.contains(CMD_PLAN));
        assert!(raw.contains(KEY_PLAN));
        assert!(raw.contains(CMD_AGENT));
        let r2 = ensure_composer_mode_keybindings().expect("ensure2");
        assert!(!r2.changed);
        std::env::remove_var("CURSOR_USER_DIR");
        let _ = fs::remove_dir_all(&dir);
    }
}
