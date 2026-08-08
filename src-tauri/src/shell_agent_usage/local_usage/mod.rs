//! Local burn counters only — never write remaining_percent from these.

use crate::shell_agent_usage::http::http_get;
use crate::shell_agent_usage::models::number;
use serde_json::Value;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

/// Qoder: sum token_info from recent session jsonl / optional local.db assistant rows.
pub fn qoder_local_totals() -> (Option<u64>, Option<u64>) {
    let today = today_ymd();
    let mut today_tok = 0u64;
    let mut month_tok = 0u64;
    let month_prefix = &today[..7]; // YYYY-MM

    for root in qoder_session_roots() {
        walk_jsonl(&root, 3, &mut |path, line| {
            if let Some(n) = tokens_from_jsonl_line(line) {
                let day = file_day_hint(path).unwrap_or(today.clone());
                if day.starts_with(month_prefix) {
                    month_tok = month_tok.saturating_add(n);
                }
                if day == today {
                    today_tok = today_tok.saturating_add(n);
                }
            }
        });
    }

    #[cfg(windows)]
    if today_tok == 0 && month_tok == 0 {
        if let Some((t, m)) = qoder_from_local_db(&today, month_prefix) {
            today_tok = t;
            month_tok = m;
        }
    }

    (
        if today_tok > 0 { Some(today_tok) } else { None },
        if month_tok > 0 { Some(month_tok) } else { None },
    )
}

fn qoder_session_roots() -> Vec<PathBuf> {
    let mut out = Vec::new();
    if let Ok(home) = std::env::var("USERPROFILE").or_else(|_| std::env::var("HOME")) {
        let base = PathBuf::from(home).join(".qoder");
        out.push(base.join("logs").join("sessions"));
        out.push(base.join("sessions"));
    }
    out
}

fn tokens_from_jsonl_line(line: &str) -> Option<u64> {
    let v: Value = serde_json::from_str(line).ok()?;
    // Common shapes: token_info / usage / model.response.completed
    let tip = v
        .pointer("/token_info")
        .or_else(|| v.pointer("/usage"))
        .or_else(|| v.pointer("/tokenUsage"))
        .or_else(|| v.pointer("/data/token_info"))
        .unwrap_or(&v);
    let prompt = number(tip.get("prompt_tokens").or(tip.get("input_tokens")).unwrap_or(&Value::Null))
        .unwrap_or(0.0);
    let completion = number(
        tip.get("completion_tokens")
            .or(tip.get("output_tokens"))
            .unwrap_or(&Value::Null),
    )
    .unwrap_or(0.0);
    let total = number(tip.get("total_tokens").unwrap_or(&Value::Null))
        .unwrap_or(prompt + completion);
    let n = total.max(0.0).round() as u64;
    if n == 0 {
        None
    } else {
        Some(n)
    }
}

fn walk_jsonl(root: &Path, depth: usize, f: &mut dyn FnMut(&Path, &str)) {
    if depth == 0 || !root.exists() {
        return;
    }
    let Ok(rd) = fs::read_dir(root) else {
        return;
    };
    for ent in rd.flatten() {
        let path = ent.path();
        if path.is_dir() {
            walk_jsonl(&path, depth - 1, f);
        } else if path
            .extension()
            .and_then(|e| e.to_str())
            .is_some_and(|e| e.eq_ignore_ascii_case("jsonl"))
        {
            if let Ok(text) = fs::read_to_string(&path) {
                for line in text.lines().take(5000) {
                    let line = line.trim();
                    if !line.is_empty() {
                        f(&path, line);
                    }
                }
            }
        }
    }
}

fn file_day_hint(path: &Path) -> Option<String> {
    let meta = fs::metadata(path).ok()?;
    let modified = meta.modified().ok()?;
    let secs = modified.duration_since(UNIX_EPOCH).ok()?.as_secs() as i64;
    let days = secs / 86400;
    let (y, m, d) = crate::shell_agent_usage::models::civil_from_days(days);
    Some(format!("{y:04}-{m:02}-{d:02}"))
}

fn today_ymd() -> String {
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);
    let (y, m, d) = crate::shell_agent_usage::models::civil_from_days(secs / 86400);
    format!("{y:04}-{m:02}-{d:02}")
}

#[cfg(windows)]
fn qoder_from_local_db(today: &str, month_prefix: &str) -> Option<(u64, u64)> {
    use rusqlite::{Connection, OpenFlags};
    let mut candidates = Vec::new();
    if let Ok(appdata) = std::env::var("APPDATA") {
        let base = PathBuf::from(appdata);
        for name in ["Qoder", "QoderCN"] {
            candidates.push(
                base.join(name)
                    .join("SharedClientCache")
                    .join("cache")
                    .join("db")
                    .join("local.db"),
            );
        }
    }
    for db in candidates {
        if !db.is_file() {
            continue;
        }
        let Ok(conn) = Connection::open_with_flags(&db, OpenFlags::SQLITE_OPEN_READ_ONLY) else {
            continue;
        };
        // Best-effort: look for token_info-ish text columns; schema varies by version.
        let sqls = [
            "SELECT value FROM ItemTable WHERE key LIKE '%token%' LIMIT 200",
            "SELECT context FROM chat_message LIMIT 200",
            "SELECT content FROM chat_message LIMIT 200",
        ];
        let mut today_tok = 0u64;
        let mut month_tok = 0u64;
        for sql in sqls {
            if let Ok(mut stmt) = conn.prepare(sql) {
                if let Ok(rows) = stmt.query_map([], |row| row.get::<_, String>(0)) {
                    for cell in rows.flatten() {
                        if let Some(n) = tokens_from_jsonl_line(&cell) {
                            // Without per-row dates, attribute to today only when scanning live cache.
                            today_tok = today_tok.saturating_add(n);
                            month_tok = month_tok.saturating_add(n);
                            let _ = (today, month_prefix);
                        }
                    }
                }
            }
        }
        if today_tok > 0 || month_tok > 0 {
            return Some((today_tok, month_tok));
        }
    }
    None
}

/// WorkBuddy CLI local HTTP stats — session burn, not plan remaining.
pub fn workbuddy_local_totals() -> (Option<u64>, Option<u64>) {
    let ports = wb_candidate_ports();
    for port in ports {
        let url = format!("http://127.0.0.1:{port}/api/v1/stats");
        if let Ok(body) = http_get(&url) {
            if let Some(t) = parse_wb_stats_tokens(&body) {
                return (Some(t), None);
            }
        }
        let url2 = format!("http://127.0.0.1:{port}/api/v1/stats/session");
        if let Ok(body) = http_get(&url2) {
            if let Some(t) = parse_wb_stats_tokens(&body) {
                return (Some(t), None);
            }
        }
    }
    (None, None)
}

fn wb_candidate_ports() -> Vec<u16> {
    let mut ports = vec![8080u16, 8787, 8001];
    if let Ok(home) = std::env::var("USERPROFILE").or_else(|_| std::env::var("HOME")) {
        for name in [
            ".workbuddy/tencent-docs-engine.port",
            ".workbuddy/http-api.port",
            ".codebuddy/http-api.port",
        ] {
            let p = PathBuf::from(&home).join(name);
            if let Ok(s) = fs::read_to_string(p) {
                if let Ok(n) = s.trim().parse::<u16>() {
                    if n > 0 {
                        ports.insert(0, n);
                    }
                }
            }
        }
    }
    ports
}

/// Parse CLI stats JSON for total tokens (never as remaining %).
pub fn parse_wb_stats_tokens(raw: &str) -> Option<u64> {
    let v: Value = serde_json::from_str(raw).ok()?;
    let candidates = [
        "/data/totalTokens",
        "/totalTokens",
        "/tokens/total",
        "/usage/totalTokens",
        "/session/totalTokens",
        "/data/tokens",
        "/tokens",
    ];
    for p in candidates {
        if let Some(n) = v.pointer(p).and_then(number) {
            let u = n.max(0.0).round() as u64;
            if u > 0 {
                return Some(u);
            }
        }
    }
    // Sum input+output if present
    let input = v
        .pointer("/inputTokens")
        .or_else(|| v.pointer("/data/inputTokens"))
        .and_then(number)
        .unwrap_or(0.0);
    let output = v
        .pointer("/outputTokens")
        .or_else(|| v.pointer("/data/outputTokens"))
        .and_then(number)
        .unwrap_or(0.0);
    let sum = (input + output).max(0.0).round() as u64;
    if sum > 0 {
        Some(sum)
    } else {
        None
    }
}
