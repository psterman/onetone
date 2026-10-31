//! Fetch URL body for research — SSRF-safe, size/timeout limited.

use serde_json::{json, Value};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use super::ssrf::validate_public_http_url;

const HTTP_TIMEOUT_SECS: u64 = 25;
const MAX_REDIRECTS: usize = 3;
const DEFAULT_MAX_CHARS: usize = 12_000;
const HARD_MAX_BYTES: usize = 1_500_000;

pub fn fetch_url(url: &str, provider: Option<&str>, max_chars: Option<u32>) -> Value {
    let max_chars = max_chars
        .map(|n| n as usize)
        .unwrap_or(DEFAULT_MAX_CHARS)
        .clamp(500, 40_000);
    let provider = provider.unwrap_or("direct").trim().to_ascii_lowercase();
    let validated = match validate_public_http_url(url) {
        Ok(u) => u,
        Err(e) => {
            return json!({ "ok": false, "code": "ssrf_blocked", "message": e });
        }
    };
    let result = match provider.as_str() {
        "jina" => fetch_via_jina(validated.as_str(), max_chars),
        _ => fetch_direct(validated.as_str(), max_chars),
    };
    match result {
        Ok((title, final_url, text)) => {
            if text.trim().is_empty() {
                json!({ "ok": false, "code": "empty_body", "message": "empty body" })
            } else {
                json!({
                    "ok": true,
                    "title": title,
                    "url": final_url,
                    "text": text,
                    "fetchedAt": now_iso(),
                    "provider": provider
                })
            }
        }
        Err(code_msg) => {
            let (code, message) = code_msg;
            json!({ "ok": false, "code": code, "message": message })
        }
    }
}

fn now_iso() -> String {
    let ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    // Compact ISO-ish UTC millis stamp without chrono dep.
    format!("{ms}")
}

fn fetch_direct(url: &str, max_chars: usize) -> Result<(String, String, String), (&'static str, String)> {
    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(HTTP_TIMEOUT_SECS))
        .redirect(reqwest::redirect::Policy::limited(MAX_REDIRECTS))
        .user_agent("OneToneResearch/0.1 (+local desktop; research mode)")
        .build()
        .map_err(|e| ("http_error", e.to_string()))?;

    let resp = client
        .get(url)
        .header("Accept", "text/html,application/xhtml+xml,text/plain")
        .send()
        .map_err(|e| {
            let msg = e.to_string();
            if msg.contains("timed out") || msg.contains("timeout") {
                ("timeout", msg)
            } else {
                ("http_error", msg)
            }
        })?;

    let status = resp.status();
    let final_url = resp.url().to_string();
    if validate_public_http_url(&final_url).is_err() {
        return Err(("ssrf_blocked", "redirect_to_private".into()));
    }
    if status.as_u16() == 429 {
        return Err(("rate_limited", "HTTP 429".into()));
    }
    if !status.is_success() {
        return Err(("http_error", format!("HTTP {status}")));
    }
    let bytes = resp.bytes().map_err(|e| ("http_error", e.to_string()))?;
    if bytes.len() > HARD_MAX_BYTES {
        return Err(("too_large", format!("body {} bytes", bytes.len())));
    }
    let raw = String::from_utf8_lossy(&bytes).to_string();
    let title = extract_title(&raw).unwrap_or_else(|| final_url.clone());
    let text = truncate_chars(&html_to_text(&raw), max_chars);
    Ok((title, final_url, text))
}

fn fetch_via_jina(url: &str, max_chars: usize) -> Result<(String, String, String), (&'static str, String)> {
    // Optional provider — not the core contract.
    let jina = format!("https://r.jina.ai/{url}");
    let _ = validate_public_http_url(&jina).map_err(|e| ("ssrf_blocked", e))?;
    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(HTTP_TIMEOUT_SECS))
        .redirect(reqwest::redirect::Policy::limited(MAX_REDIRECTS))
        .user_agent("OneToneResearch/0.1 (+local desktop; research mode)")
        .build()
        .map_err(|e| ("http_error", e.to_string()))?;
    let resp = client
        .get(&jina)
        .header("Accept", "text/plain")
        .send()
        .map_err(|e| ("http_error", e.to_string()))?;
    let status = resp.status();
    if !status.is_success() {
        return Err(("http_error", format!("jina HTTP {status}")));
    }
    let raw = resp.text().map_err(|e| ("http_error", e.to_string()))?;
    let title = raw
        .lines()
        .find(|l| l.starts_with("Title:"))
        .map(|l| l.trim_start_matches("Title:").trim().to_string())
        .unwrap_or_else(|| url.to_string());
    let text = truncate_chars(&raw, max_chars);
    Ok((title, url.to_string(), text))
}

fn extract_title(html: &str) -> Option<String> {
    let lower = html.to_ascii_lowercase();
    let start = lower.find("<title")?;
    let after = &html[start..];
    let gt = after.find('>')?;
    let body = &after[gt + 1..];
    let end = body.to_ascii_lowercase().find("</title>")?;
    Some(decode_basic_entities(&strip_tags(&body[..end])).trim().to_string())
}

pub fn html_to_text(html: &str) -> String {
    let mut s = html.to_string();
    // Drop script/style/noscript blocks.
    for tag in ["script", "style", "noscript", "svg", "iframe"] {
        s = strip_blocks(&s, tag);
    }
    let text = strip_tags(&s);
    collapse_ws(&decode_basic_entities(&text))
}

fn strip_blocks(html: &str, tag: &str) -> String {
    let open = format!("<{tag}");
    let close = format!("</{tag}>");
    let lower = html.to_ascii_lowercase();
    let open_l = open.to_ascii_lowercase();
    let close_l = close.to_ascii_lowercase();
    let mut out = String::new();
    let mut i = 0;
    let bytes = html.as_bytes();
    while i < html.len() {
        if let Some(rel) = lower[i..].find(&open_l) {
            let start = i + rel;
            out.push_str(&html[i..start]);
            if let Some(rel_close) = lower[start..].find(&close_l) {
                i = start + rel_close + close_l.len();
            } else {
                // unclosed — skip rest of open tag
                if let Some(gt) = html[start..].find('>') {
                    i = start + gt + 1;
                } else {
                    break;
                }
            }
        } else {
            out.push_str(&html[i..]);
            break;
        }
        let _ = bytes; // silence
    }
    out
}

fn strip_tags(s: &str) -> String {
    let mut out = String::new();
    let mut in_tag = false;
    for c in s.chars() {
        match c {
            '<' => in_tag = true,
            '>' => in_tag = false,
            _ if !in_tag => out.push(c),
            _ => {}
        }
    }
    out
}

fn decode_basic_entities(s: &str) -> String {
    s.replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&nbsp;", " ")
}

fn collapse_ws(s: &str) -> String {
    let mut out = String::new();
    let mut prev_space = false;
    for c in s.chars() {
        if c.is_whitespace() {
            if !prev_space {
                out.push(' ');
                prev_space = true;
            }
        } else {
            out.push(c);
            prev_space = false;
        }
    }
    out.trim().to_string()
}

fn truncate_chars(s: &str, max: usize) -> String {
    let count = s.chars().count();
    if count <= max {
        return s.to_string();
    }
    s.chars().take(max).collect::<String>() + "…"
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn strips_script_and_keeps_text() {
        let html = r#"<html><head><title>Hi</title><script>evil()</script></head><body><p>Hello <b>world</b></p></body></html>"#;
        let t = html_to_text(html);
        assert!(t.contains("Hello"));
        assert!(t.contains("world"));
        assert!(!t.contains("evil"));
    }

    #[test]
    fn ssrf_on_fetch() {
        let v = fetch_url("http://127.0.0.1/secret", Some("direct"), Some(1000));
        assert_eq!(v["ok"], false);
        assert_eq!(v["code"], "ssrf_blocked");
    }
}
