//! Lightweight Codex session metadata for Agent Center work items (no transcript FTS).
//! Respects `CODEX_HOME` / `ONETONE_AGENT_HOME` for synthetic fixtures.

use serde_json::Value;
use std::fs::File;
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};

#[derive(Debug, Clone)]
pub struct CodexSessionMeta {
    pub external_id: String,
    pub title: Option<String>,
    pub updated_at_ms: Option<u64>,
}

fn agent_home_override() -> Option<PathBuf> {
    std::env::var_os("ONETONE_AGENT_HOME")
        .or_else(|| std::env::var_os("CODEX_HOME"))
        .map(PathBuf::from)
        .filter(|p| !p.as_os_str().is_empty())
}

fn codex_root() -> PathBuf {
    if let Some(h) = agent_home_override() {
        // ONETONE_AGENT_HOME may be a synthetic home; Codex lives under `.codex`.
        if h.ends_with(".codex") {
            return h;
        }
        return h.join(".codex");
    }
    std::env::var_os("USERPROFILE")
        .or_else(|| std::env::var_os("HOME"))
        .map(PathBuf::from)
        .map(|h| h.join(".codex"))
        .unwrap_or_else(|| PathBuf::from(".codex"))
}

/// Read up to `limit` recent entries from session_index.jsonl (metadata only).
pub fn list_recent_codex_meta(limit: usize) -> Vec<CodexSessionMeta> {
    let index = codex_root().join("session_index.jsonl");
    read_session_index(&index, limit)
}

fn read_session_index(path: &Path, limit: usize) -> Vec<CodexSessionMeta> {
    let Ok(file) = File::open(path) else {
        return Vec::new();
    };
    let reader = BufReader::new(file);
    let mut rows: Vec<CodexSessionMeta> = Vec::new();
    for line in reader.lines().flatten() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        let Ok(v) = serde_json::from_str::<Value>(line) else {
            continue;
        };
        let id = v
            .get("id")
            .or_else(|| v.get("session_id"))
            .and_then(|x| x.as_str())
            .unwrap_or("")
            .trim()
            .to_string();
        if id.is_empty() {
            continue;
        }
        let title = v
            .get("title")
            .or_else(|| v.get("cwd"))
            .and_then(|x| x.as_str())
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty());
        let updated_at_ms = v
            .get("updated_at_ms")
            .and_then(|x| x.as_u64())
            .or_else(|| {
                v.get("updated_at")
                    .and_then(|x| x.as_str())
                    .and_then(parse_iso_ms)
            });
        rows.push(CodexSessionMeta {
            external_id: id,
            title,
            updated_at_ms,
        });
    }
    // Index is usually append-only; take the newest tail.
    if rows.len() > limit {
        rows = rows.split_off(rows.len() - limit);
    }
    rows.reverse();
    rows
}

fn parse_iso_ms(s: &str) -> Option<u64> {
    // Best-effort: epoch millis as string, or ignore complex ISO.
    s.trim().parse::<u64>().ok()
}

/// Merge Codex index titles into existing work JSON when title is empty.
pub fn enrich_work_with_codex_meta(work: &mut Value, metas: &[CodexSessionMeta]) {
    let Some(ext) = work
        .get("externalSessionId")
        .and_then(|v| v.as_str())
        .map(str::trim)
        .filter(|s| !s.is_empty())
    else {
        return;
    };
    let Some(meta) = metas.iter().find(|m| m.external_id == ext) else {
        return;
    };
    let title_empty = work
        .get("title")
        .and_then(|v| v.as_str())
        .map(|s| s.trim().is_empty())
        .unwrap_or(true);
    if title_empty {
        if let Some(t) = &meta.title {
            work["title"] = Value::String(t.clone());
        }
    }
    if work.get("updatedAtMs").and_then(|v| v.as_u64()).is_none() {
        if let Some(ms) = meta.updated_at_ms {
            work["updatedAtMs"] = Value::from(ms);
        }
    }
    work["metaSource"] = Value::String("codexSessionIndex".into());
}

/// Build supplemental recent-work rows from Codex index when home DB has none for Codex.
pub fn supplemental_codex_work(limit: usize) -> Vec<Value> {
    list_recent_codex_meta(limit)
        .into_iter()
        .map(|m| {
            serde_json::json!({
                "workId": format!("codex-meta:{}", m.external_id),
                "sessionId": format!("codex-meta:{}", m.external_id),
                "externalSessionId": m.external_id,
                "agentKind": "codex",
                "provider": "codex",
                "projectId": "",
                "projectLabel": Value::Null,
                "projectUnknown": true,
                "laneId": Value::Null,
                "fromCrossProjectFallback": true,
                "title": m.title,
                "status": "discovered",
                "updatedAtMs": m.updated_at_ms,
                "isActive": false,
                "metaSource": "codexSessionIndex",
            })
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    #[test]
    fn reads_synthetic_session_index() {
        let dir = std::env::temp_dir().join(format!(
            "onetone-codex-meta-{}",
            std::process::id()
        ));
        let _ = std::fs::remove_dir_all(&dir);
        let codex = dir.join(".codex");
        std::fs::create_dir_all(&codex).unwrap();
        let index = codex.join("session_index.jsonl");
        let mut f = File::create(&index).unwrap();
        writeln!(
            f,
            r#"{{"id":"abc","title":"home accept","updated_at_ms":100}}"#
        )
        .unwrap();
        writeln!(
            f,
            r#"{{"id":"def","title":"later","updated_at_ms":200}}"#
        )
        .unwrap();
        std::env::set_var("ONETONE_AGENT_HOME", &dir);
        let rows = list_recent_codex_meta(10);
        std::env::remove_var("ONETONE_AGENT_HOME");
        let _ = std::fs::remove_dir_all(&dir);
        assert_eq!(rows.len(), 2);
        assert_eq!(rows[0].external_id, "def");
        assert_eq!(rows[0].title.as_deref(), Some("later"));
    }
}
