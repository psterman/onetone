//! Read Chrome / Edge bookmark JSON on Windows (no Safari — not useful here).
//! Profile dirs come from each browser's `Local State` (last_used + info_cache),
//! not a hardcoded Default / Profile 1–3 list.

use serde::Serialize;
use serde_json::Value;
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};

/// Cap after Chrome+Edge merge. Real profiles here are ~6–8k http urls each.
const MAX_BOOKMARKS: usize = 12_000;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BrowserBookmark {
    pub title: String,
    pub url: String,
    pub source: String,
    /// Folder path, e.g. `书签栏/自媒体`.
    pub folder: String,
}

/// Flat list of http(s) bookmarks from Chrome + Edge (profiles via Local State).
pub fn list_browser_bookmarks() -> Vec<BrowserBookmark> {
    let mut out = Vec::new();
    let mut seen = HashSet::new();
    #[cfg(windows)]
    {
        let Some(local) = std::env::var_os("LOCALAPPDATA") else {
            return out;
        };
        let local = PathBuf::from(local);
        collect_browser(
            &local.join(r"Google\Chrome\User Data"),
            "Chrome",
            &mut out,
            &mut seen,
        );
        collect_browser(
            &local.join(r"Microsoft\Edge\User Data"),
            "Edge",
            &mut out,
            &mut seen,
        );
    }
    out
}

fn collect_browser(
    user_data: &Path,
    source: &str,
    out: &mut Vec<BrowserBookmark>,
    seen: &mut HashSet<String>,
) {
    if out.len() >= MAX_BOOKMARKS {
        return;
    }
    if !user_data.is_dir() {
        return;
    }
    for profile in discover_profiles(user_data) {
        if out.len() >= MAX_BOOKMARKS {
            return;
        }
        let path = user_data.join(&profile).join("Bookmarks");
        if !path.is_file() {
            continue;
        }
        let label = if profile == "Default" {
            source.to_string()
        } else {
            format!("{source} ({profile})")
        };
        // ponytail: shared read; if Chrome has the file locked exclusive, skip that profile.
        let Ok(raw) = fs::read_to_string(&path) else {
            continue;
        };
        let Ok(json) = serde_json::from_str::<Value>(&raw) else {
            continue;
        };
        walk_roots(&json, &label, out, seen);
    }
}

/// Prefer `profile.last_used`, then `info_cache` keys, then any child dir with Bookmarks.
/// Falls back to Default / Profile 1–3 if Local State is missing.
fn discover_profiles(user_data: &Path) -> Vec<String> {
    let mut ordered: Vec<String> = Vec::new();
    let mut seen = HashSet::new();
    let push = |name: String, ordered: &mut Vec<String>, seen: &mut HashSet<String>| {
        if name.is_empty() || name == "System Profile" {
            return;
        }
        if !user_data.join(&name).join("Bookmarks").is_file() {
            return;
        }
        if seen.insert(name.clone()) {
            ordered.push(name);
        }
    };

    let local_state = user_data.join("Local State");
    if let Ok(raw) = fs::read_to_string(&local_state) {
        if let Ok(json) = serde_json::from_str::<Value>(&raw) {
            if let Some(last) = json
                .pointer("/profile/last_used")
                .and_then(|v| v.as_str())
                .map(str::trim)
                .filter(|s| !s.is_empty())
            {
                push(last.to_string(), &mut ordered, &mut seen);
            }
            if let Some(cache) = json
                .pointer("/profile/info_cache")
                .and_then(|v| v.as_object())
            {
                for key in cache.keys() {
                    push(key.clone(), &mut ordered, &mut seen);
                }
            }
        }
    }

    if let Ok(entries) = fs::read_dir(user_data) {
        for ent in entries.flatten() {
            let Ok(ft) = ent.file_type() else { continue };
            if !ft.is_dir() {
                continue;
            }
            let name = ent.file_name().to_string_lossy().into_owned();
            push(name, &mut ordered, &mut seen);
        }
    }

    if ordered.is_empty() {
        for profile in ["Default", "Profile 1", "Profile 2", "Profile 3"] {
            push(profile.to_string(), &mut ordered, &mut seen);
        }
    }
    ordered
}

fn walk_roots(
    json: &Value,
    source: &str,
    out: &mut Vec<BrowserBookmark>,
    seen: &mut HashSet<String>,
) {
    let Some(roots) = json.get("roots") else {
        return;
    };
    for key in ["bookmark_bar", "other", "synced"] {
        if let Some(node) = roots.get(key) {
            walk_node(node, source, "", out, seen);
        }
    }
}

fn walk_node(
    node: &Value,
    source: &str,
    folder: &str,
    out: &mut Vec<BrowserBookmark>,
    seen: &mut HashSet<String>,
) {
    if out.len() >= MAX_BOOKMARKS {
        return;
    }
    let typ = node
        .get("type")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    if typ == "url" {
        let url = node
            .get("url")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .trim();
        if url.is_empty() {
            return;
        }
        let lower = url.to_ascii_lowercase();
        if !(lower.starts_with("http://") || lower.starts_with("https://")) {
            return;
        }
        if !seen.insert(url.to_string()) {
            return;
        }
        let title = node
            .get("name")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .trim();
        out.push(BrowserBookmark {
            title: if title.is_empty() {
                url.to_string()
            } else {
                title.to_string()
            },
            url: url.to_string(),
            source: source.to_string(),
            folder: folder.to_string(),
        });
        return;
    }
    if typ == "folder" || node.get("children").is_some() {
        let name = node
            .get("name")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .trim();
        let next = if name.is_empty() {
            folder.to_string()
        } else if folder.is_empty() {
            name.to_string()
        } else {
            format!("{folder}/{name}")
        };
        if let Some(children) = node.get("children").and_then(|c| c.as_array()) {
            for child in children {
                walk_node(child, source, &next, out, seen);
                if out.len() >= MAX_BOOKMARKS {
                    return;
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn walk_sample_bookmarks_json() {
        let json: Value = serde_json::from_str(
            r#"{
              "roots": {
                "bookmark_bar": {
                  "type": "folder",
                  "name": "书签栏",
                  "children": [
                    {"type":"url","name":"Example","url":"https://example.com"},
                    {"type":"folder","name":"工具","children":[
                      {"type":"url","name":"Nested","url":"https://nested.test/a"}
                    ]},
                    {"type":"url","name":"Skip","url":"javascript:void(0)"}
                  ]
                },
                "other": {"type":"folder","children":[]},
                "synced": {"type":"folder","children":[]}
              }
            }"#,
        )
        .unwrap();
        let mut out = Vec::new();
        let mut seen = HashSet::new();
        walk_roots(&json, "Chrome", &mut out, &mut seen);
        assert_eq!(out.len(), 2);
        assert_eq!(out[0].url, "https://example.com");
        assert_eq!(out[0].folder, "书签栏");
        assert_eq!(out[1].title, "Nested");
        assert_eq!(out[1].folder, "书签栏/工具");
    }

    #[test]
    fn discover_profiles_reads_local_state_order() {
        let dir = std::env::temp_dir().join(format!(
            "onetone-bm-profiles-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(dir.join("Profile 2")).unwrap();
        fs::create_dir_all(dir.join("Default")).unwrap();
        fs::write(dir.join("Profile 2").join("Bookmarks"), "{}").unwrap();
        fs::write(dir.join("Default").join("Bookmarks"), "{}").unwrap();
        fs::write(
            dir.join("Local State"),
            r#"{"profile":{"last_used":"Profile 2","info_cache":{"Profile 2":{},"Default":{}}}}"#,
        )
        .unwrap();
        let got = discover_profiles(&dir);
        assert_eq!(got.first().map(String::as_str), Some("Profile 2"));
        assert!(got.iter().any(|p| p == "Default"));
        let _ = fs::remove_dir_all(&dir);
    }
}
