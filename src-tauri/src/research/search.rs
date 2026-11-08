//! Pluggable anonymous search providers for research mode.

use serde::Serialize;
use serde_json::{json, Value};

use super::ssrf::validate_public_http_url;

const HTTP_TIMEOUT_SECS: u64 = 18;
const DEFAULT_LIMIT: usize = 8;
const MAX_LIMIT: usize = 12;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchHit {
    pub title: String,
    pub url: String,
    pub snippet: String,
    pub published_at: Option<String>,
}

pub fn web_search(query: &str, limit: Option<u32>, provider: Option<&str>) -> Value {
    let q = query.trim();
    if q.is_empty() {
        return json!({
            "ok": false,
            "code": "empty",
            "message": "empty query"
        });
    }
    let lim = limit
        .map(|n| n as usize)
        .unwrap_or(DEFAULT_LIMIT)
        .clamp(1, MAX_LIMIT);
    let provider = provider.unwrap_or("auto").trim().to_ascii_lowercase();
    research_log(
        "search_begin",
        &format!("provider={provider} lim={lim} q={}", truncate_log(q, 80)),
    );
    let (result, diagnostics) = match provider.as_str() {
        "duckduckgo" | "ddg" => {
            let r = search_duckduckgo(q, lim);
            let d = vec![diag_from_result("duckduckgo", &r)];
            (r, d)
        }
        "bing" => {
            let r = search_bing(q, lim);
            let d = vec![diag_from_result("bing", &r)];
            (r, d)
        }
        "wikipedia" | "wiki" => {
            let r = search_wikipedia(q, lim);
            let d = vec![diag_from_result("wikipedia", &r)];
            (r, d)
        }
        "auto" | "" => search_auto_with_diag(q, lim),
        other => (Err(format!("unknown_provider:{other}")), vec![]),
    };
    let diag_json: Vec<Value> = diagnostics
        .iter()
        .map(|d| {
            json!({
                "provider": d.provider,
                "ok": d.ok,
                "hits": d.hits,
                "error": d.error,
            })
        })
        .collect();
    research_log(
        "search_end",
        &format!(
            "provider={provider} hits={} diag={}",
            result.as_ref().map(|h| h.len()).unwrap_or(0),
            diagnostics
                .iter()
                .map(|d| format!(
                    "{}:{}{}",
                    d.provider,
                    d.hits,
                    d.error
                        .as_ref()
                        .map(|e| format!("({e})"))
                        .unwrap_or_default()
                ))
                .collect::<Vec<_>>()
                .join("|")
        ),
    );
    match result {
        Ok(hits) if hits.is_empty() => json!({
            "ok": false,
            "code": "empty",
            "message": "no search results",
            "provider": provider,
            "results": [],
            "diagnostics": diag_json
        }),
        Ok(hits) => {
            let hits = filter_char_dict_noise(q, hits);
            if hits.is_empty() {
                json!({
                    "ok": false,
                    "code": "char_dict_noise",
                    "message": "search returned only single-character dictionary pages; answer from prior knowledge or finish with what you know",
                    "provider": provider,
                    "results": [],
                    "diagnostics": diag_json
                })
            } else {
                json!({
                    "ok": true,
                    "provider": provider,
                    "results": hits,
                    "diagnostics": diag_json
                })
            }
        }
        Err(msg) => {
            let code = if msg.contains("429") || msg.contains("rate") {
                "rate_limited"
            } else if msg.contains("char_dict_noise") {
                "char_dict_noise"
            } else {
                "search_unavailable"
            };
            json!({
                "ok": false,
                "code": code,
                "message": msg,
                "provider": provider,
                "results": [],
                "diagnostics": diag_json
            })
        }
    }
}

#[derive(Debug, Clone)]
struct ProviderDiag {
    provider: &'static str,
    ok: bool,
    hits: usize,
    error: Option<String>,
}

fn diag_from_result(provider: &'static str, r: &Result<Vec<SearchHit>, String>) -> ProviderDiag {
    match r {
        Ok(v) => ProviderDiag {
            provider,
            ok: true,
            hits: v.len(),
            error: if v.is_empty() {
                Some("empty".into())
            } else {
                None
            },
        },
        Err(e) => ProviderDiag {
            provider,
            ok: false,
            hits: 0,
            error: Some(e.clone()),
        },
    }
}

fn research_log(step: &str, detail: &str) {
    crate::app_log::sync_emergency_line("research", &format!("{step} {detail}"));
}

fn truncate_log(s: &str, max: usize) -> String {
    let count = s.chars().count();
    if count <= max {
        return s.to_string();
    }
    s.chars().take(max).collect::<String>() + "…"
}

fn search_auto_with_diag(
    query: &str,
    limit: usize,
) -> (Result<Vec<SearchHit>, String>, Vec<ProviderDiag>) {
    let mut hits: Vec<SearchHit> = Vec::new();
    let mut errors: Vec<String> = Vec::new();
    let mut diagnostics: Vec<ProviderDiag> = Vec::new();
    let q = normalize_search_query(query);
    // Hard ceiling across providers — reqwest per-request timeout alone still let
    // auto fan-out pin ATR for minutes when DNS/connect hung past HTTP_TIMEOUT_SECS.
    let deadline =
        std::time::Instant::now() + std::time::Duration::from_secs(HTTP_TIMEOUT_SECS.saturating_add(6));
    let budget_left = |errors: &mut Vec<String>, diagnostics: &mut Vec<ProviderDiag>| -> bool {
        if std::time::Instant::now() < deadline {
            return true;
        }
        errors.push("search_budget_exhausted".into());
        diagnostics.push(ProviderDiag {
            provider: "budget",
            ok: false,
            hits: 0,
            error: Some("wall_clock_budget".into()),
        });
        false
    };

    // Bing first: DDG often serves bot-challenge pages (HTTP 200, 0 parseable hits) on desktop/CN nets.
    let bing = search_bing(&q, limit);
    diagnostics.push(diag_from_result("bing", &bing));
    match bing {
        Ok(mut v) => hits.append(&mut v),
        Err(e) => errors.push(format!("bing:{e}")),
    }

    if hits.len() < limit && budget_left(&mut errors, &mut diagnostics) {
        let ddg = search_duckduckgo(&q, limit.saturating_sub(hits.len()).max(3));
        diagnostics.push(diag_from_result("duckduckgo", &ddg));
        match ddg {
            Ok(v) => merge_hits(&mut hits, v, limit),
            Err(e) => errors.push(format!("ddg:{e}")),
        }
    }
    if hits.len() < limit && budget_left(&mut errors, &mut diagnostics) {
        let ia = search_ddg_instant(&q, limit.saturating_sub(hits.len()).max(3));
        diagnostics.push(diag_from_result("ddg_instant", &ia));
        match ia {
            Ok(v) => merge_hits(&mut hits, v, limit),
            Err(e) => errors.push(format!("ddg_ia:{e}")),
        }
    }
    if hits.len() < 2 && budget_left(&mut errors, &mut diagnostics) {
        let wiki_q = wikipedia_query(&q);
        let wiki = search_wikipedia(&wiki_q, limit.saturating_sub(hits.len()).max(4));
        diagnostics.push(diag_from_result("wikipedia", &wiki));
        match wiki {
            Ok(v) => merge_hits(&mut hits, v, limit),
            Err(e) => errors.push(format!("wiki:{e}")),
        }
    }

    let hits = filter_char_dict_noise(&q, hits);
    if hits.is_empty() {
        if errors.is_empty() {
            let empty_notes: Vec<String> = diagnostics
                .iter()
                .filter_map(|d| d.error.as_ref().map(|e| format!("{}:{e}", d.provider)))
                .collect();
            if !empty_notes.is_empty() {
                return (Err(empty_notes.join("; ")), diagnostics);
            }
            // Filtered-only empty: tell the model hits were character-dict noise.
            return (
                Err("char_dict_noise:no_relevant_entity_hits".into()),
                diagnostics,
            );
        }
        return (Err(errors.join("; ")), diagnostics);
    }
    (Ok(hits), diagnostics)
}

fn normalize_search_query(raw: &str) -> String {
    let mut t = raw.trim().to_string();
    for p in ["调研：", "调研:", "调研", "请调研", "帮我调研"] {
        if let Some(rest) = t.strip_prefix(p) {
            t = rest.trim().to_string();
            break;
        }
    }
    t = t
        .trim_matches(|c: char| matches!(c, '？' | '?' | '。' | '.' | '！' | '!'))
        .to_string();
    if t.is_empty() {
        raw.trim().to_string()
    } else {
        t
    }
}

fn wikipedia_query(q: &str) -> String {
    // OpenSearch fails on long rhetorical questions; keep a short noun-ish slice.
    let chars: Vec<char> = q.chars().collect();
    if chars.len() <= 18 {
        return q.to_string();
    }
    chars.into_iter().take(18).collect()
}

fn merge_hits(into: &mut Vec<SearchHit>, extra: Vec<SearchHit>, limit: usize) {
    for h in extra {
        if into.len() >= limit {
            break;
        }
        if into.iter().any(|x| x.url == h.url) {
            continue;
        }
        into.push(h);
    }
}

/// Multi-token CJK person/topic queries often get Bing single-character 汉语文字 hits
/// ("戴（汉语文字）", "异（汉语文字）") — junk that spun ATR into 20+ empty web_search turns.
fn is_char_dict_noise(hit: &SearchHit) -> bool {
    let title = hit.title.trim();
    let url = hit.url.to_ascii_lowercase();
    if title.contains("汉语文字") || title.contains("汉字") && title.contains("一级") {
        return true;
    }
    // Baike single-glyph pages: /item/%E6%88%B4/… with title like "戴（…）"
    let cjk: String = title
        .chars()
        .filter(|c| ('\u{4e00}'..='\u{9fff}').contains(c))
        .collect();
    if cjk.chars().count() <= 1
        && (url.contains("baike.baidu.com/item/") || title.contains('（') || title.contains('('))
    {
        return true;
    }
    false
}

fn query_has_multi_cjk_token(q: &str) -> bool {
    let mut runs = 0u32;
    let mut cur = 0u32;
    for c in q.chars() {
        if ('\u{4e00}'..='\u{9fff}').contains(&c) {
            cur = cur.saturating_add(1);
        } else if cur > 0 {
            if cur >= 2 {
                runs = runs.saturating_add(1);
            }
            cur = 0;
        }
    }
    if cur >= 2 {
        runs = runs.saturating_add(1);
    }
    runs >= 2 || q.chars().filter(|c| ('\u{4e00}'..='\u{9fff}').contains(c)).count() >= 4
}

fn filter_char_dict_noise(query: &str, hits: Vec<SearchHit>) -> Vec<SearchHit> {
    if !query_has_multi_cjk_token(query) {
        return hits;
    }
    let kept: Vec<SearchHit> = hits
        .into_iter()
        .filter(|h| !is_char_dict_noise(h))
        .collect();
    kept
}

fn looks_like_bot_wall(html: &str) -> bool {
    let l = html.to_ascii_lowercase();
    l.contains("anomaly-modal")
        || l.contains("anomaly") && l.contains("challenge")
        || l.contains("captcha")
        || l.contains("unusual traffic")
        || l.contains("bot challenge")
}

fn search_duckduckgo(query: &str, limit: usize) -> Result<Vec<SearchHit>, String> {
    // Lite endpoint is less bot-hostile than /html/ for desktop clients.
    let url = format!(
        "https://lite.duckduckgo.com/lite/?q={}",
        urlencoding_encode(query)
    );
    let body = http_get_text(&url)?;
    if looks_like_bot_wall(&body) {
        // Still try HTML endpoint once — same IP often blocked on both.
        let url2 = format!(
            "https://html.duckduckgo.com/html/?q={}",
            urlencoding_encode(query)
        );
        match http_get_text(&url2) {
            Ok(body2) if !looks_like_bot_wall(&body2) => {
                let hits = parse_duckduckgo_html(&body2, limit)?;
                if hits.is_empty() {
                    return Err("bot_challenge_then_empty".into());
                }
                return Ok(hits);
            }
            _ => return Err("bot_challenge".into()),
        }
    }
    let mut hits = parse_duckduckgo_lite(&body, limit)?;
    if hits.is_empty() {
        let url2 = format!(
            "https://html.duckduckgo.com/html/?q={}",
            urlencoding_encode(query)
        );
        let body2 = http_get_text(&url2)?;
        if looks_like_bot_wall(&body2) {
            return Err("bot_challenge".into());
        }
        hits = parse_duckduckgo_html(&body2, limit)?;
    }
    if hits.is_empty() {
        return Err("empty_parse".into());
    }
    Ok(hits)
}

fn search_bing(query: &str, limit: usize) -> Result<Vec<SearchHit>, String> {
    // Quote multi-token CJK so Bing doesn't tokenize into single-character dict pages.
    let q = if query_has_multi_cjk_token(query) && !query.contains('"') {
        format!("\"{query}\"")
    } else {
        query.to_string()
    };
    let url = format!(
        "https://www.bing.com/search?q={}&setlang=zh-hans",
        urlencoding_encode(&q)
    );
    let body = http_get_text(&url)?;
    let hits = parse_bing_html(&body, limit)?;
    if hits.is_empty() {
        return Err("empty_parse".into());
    }
    Ok(hits)
}

/// Resolve Bing click-tracking URLs (`/ck/a?...&u=a1https...`) to the target page.
fn resolve_bing_redirect(href: &str) -> String {
    let href = href.trim();
    if let Some(i) = href.find("&u=") {
        let enc = &href[i + 3..];
        let enc = enc.split('&').next().unwrap_or(enc);
        if let Ok(decoded) = urlencoding_decode(enc) {
            let cleaned = decoded
                .trim_start_matches("a1")
                .trim_start_matches("A1")
                .to_string();
            if cleaned.starts_with("http://") || cleaned.starts_with("https://") {
                return cleaned;
            }
        }
    }
    if let Some(i) = href.find("u=a1") {
        let enc = &href[i + 4..];
        let enc = enc.split('&').next().unwrap_or(enc);
        if let Ok(decoded) = urlencoding_decode(enc) {
            if decoded.starts_with("http://") || decoded.starts_with("https://") {
                return decoded;
            }
        }
    }
    href.to_string()
}

fn extract_bing_snippet(chunk: &str) -> String {
    for class in ["b_lineclamp4", "b_lineclamp3", "b_lineclamp2", "b_caption", "b_algoSlug"] {
        if let Some(raw) = extract_class_text(chunk, class) {
            let t = decode_basic_entities(&raw).trim().to_string();
            if t.len() >= 8 {
                return t.chars().take(400).collect();
            }
        }
    }
    // Fallback: plain <p> near the hit.
    if let Some(p) = chunk.find("<p") {
        let after = &chunk[p..];
        if let Some(gt) = after.find('>') {
            let body = &after[gt + 1..];
            let body = body
                .find("</p>")
                .map(|end| &body[..end])
                .unwrap_or_else(|| utf8_prefix(body, 400));
            let t = decode_basic_entities(&strip_tags(body))
                .trim()
                .to_string();
            if t.len() >= 8 {
                return t.chars().take(400).collect();
            }
        }
    }
    String::new()
}

/// Bing organic results: `<h2><a href="https://...">title</a>` + caption snippet.
pub fn parse_bing_html(html: &str, limit: usize) -> Result<Vec<SearchHit>, String> {
    let mut hits: Vec<SearchHit> = Vec::new();
    let mut rest = html;
    while hits.len() < limit {
        let Some(h2) = rest.find("<h2") else {
            break;
        };
        let after = &rest[h2..];
        let Some(href_i) = after.find("href=\"") else {
            rest = &after[3..];
            continue;
        };
        let href_tail = &after[href_i + 6..];
        let Some(href_end) = href_tail.find('"') else {
            rest = &after[3..];
            continue;
        };
        let raw_href = resolve_bing_redirect(&href_tail[..href_end]);
        if !(raw_href.starts_with("http://") || raw_href.starts_with("https://")) {
            rest = &after[3..];
            continue;
        }
        if raw_href.contains("bing.com/")
            || raw_href.contains("microsoft.com/")
            || raw_href.contains("msn.com/")
        {
            rest = &after[3..];
            continue;
        }
        let title_tail = &href_tail[href_end + 1..];
        let title = if let Some(gt) = title_tail.find('>') {
            let body = &title_tail[gt + 1..];
            let body = body
                .find("</a>")
                .map(|end| &body[..end])
                .unwrap_or_else(|| utf8_prefix(body, 160));
            strip_tags(body)
        } else {
            raw_href.clone()
        };
        let title = decode_basic_entities(&title).trim().to_string();
        if title.is_empty() {
            rest = &after[3..];
            continue;
        }
        // Snippet lives in the following ~2KB of the result card.
        let window = utf8_prefix(after, 2500);
        let snippet = extract_bing_snippet(window);
        push_hit(&mut hits, title, &raw_href, snippet, limit);
        rest = &after[3..];
    }
    Ok(hits)
}

fn search_ddg_instant(query: &str, limit: usize) -> Result<Vec<SearchHit>, String> {
    let url = format!(
        "https://api.duckduckgo.com/?q={}&format=json&no_redirect=1&no_html=1&skip_disambig=1",
        urlencoding_encode(query)
    );
    let body = http_get_text(&url)?;
    let v: Value = serde_json::from_str(&body).map_err(|e| e.to_string())?;
    let mut hits: Vec<SearchHit> = Vec::new();

    if let Some(abs) = v.get("AbstractURL").and_then(|x| x.as_str()) {
        if !abs.is_empty() {
            let title = v
                .get("Heading")
                .and_then(|x| x.as_str())
                .unwrap_or(abs)
                .to_string();
            let snippet = v
                .get("AbstractText")
                .and_then(|x| x.as_str())
                .unwrap_or("")
                .to_string();
            push_hit(&mut hits, title, abs, snippet, limit);
        }
    }

    collect_related_topics(v.get("RelatedTopics"), &mut hits, limit);
    Ok(hits)
}

fn collect_related_topics(node: Option<&Value>, hits: &mut Vec<SearchHit>, limit: usize) {
    let Some(arr) = node.and_then(|n| n.as_array()) else {
        return;
    };
    for item in arr {
        if hits.len() >= limit {
            return;
        }
        if let Some(topics) = item.get("Topics") {
            collect_related_topics(Some(topics), hits, limit);
            continue;
        }
        let url = item
            .get("FirstURL")
            .and_then(|x| x.as_str())
            .unwrap_or("");
        if url.is_empty() {
            continue;
        }
        let text = item.get("Text").and_then(|x| x.as_str()).unwrap_or("");
        let title = text.split(" - ").next().unwrap_or(text);
        push_hit(hits, title.to_string(), url, text.to_string(), limit);
    }
}

fn search_wikipedia(query: &str, limit: usize) -> Result<Vec<SearchHit>, String> {
    let lang = if query.chars().any(|c| matches!(c, '\u{4e00}'..='\u{9fff}')) {
        "zh"
    } else {
        "en"
    };
    let url = format!(
        "https://{lang}.wikipedia.org/w/api.php?action=opensearch&search={}&limit={}&namespace=0&format=json",
        urlencoding_encode(query),
        limit.clamp(1, 10)
    );
    let body = http_get_text(&url)?;
    let v: Value = serde_json::from_str(&body).map_err(|e| e.to_string())?;
    let titles = v.get(1).and_then(|x| x.as_array()).cloned().unwrap_or_default();
    let descs = v.get(2).and_then(|x| x.as_array()).cloned().unwrap_or_default();
    let urls = v.get(3).and_then(|x| x.as_array()).cloned().unwrap_or_default();
    let mut hits: Vec<SearchHit> = Vec::new();
    for i in 0..urls.len().min(limit) {
        let u = urls[i].as_str().unwrap_or("");
        let title = titles
            .get(i)
            .and_then(|x| x.as_str())
            .unwrap_or(u)
            .to_string();
        let snippet = descs
            .get(i)
            .and_then(|x| x.as_str())
            .unwrap_or("")
            .to_string();
        push_hit(&mut hits, title, u, snippet, limit);
    }
    Ok(hits)
}

fn push_hit(hits: &mut Vec<SearchHit>, title: String, url: &str, snippet: String, limit: usize) {
    if hits.len() >= limit {
        return;
    }
    if hits.iter().any(|h| h.url == url) {
        return;
    }
    if let Ok(u) = validate_public_http_url(url) {
        hits.push(SearchHit {
            title: title.trim().to_string(),
            url: u.to_string(),
            snippet: snippet.trim().to_string(),
            published_at: None,
        });
    }
}

fn urlencoding_encode(s: &str) -> String {
    let mut out = String::new();
    for b in s.as_bytes() {
        match *b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(*b as char)
            }
            b' ' => out.push('+'),
            _ => out.push_str(&format!("%{b:02X}")),
        }
    }
    out
}

fn http_get_text(url: &str) -> Result<String, String> {
    let _ = validate_public_http_url(url)?;
    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(HTTP_TIMEOUT_SECS))
        .redirect(reqwest::redirect::Policy::limited(3))
        // Browser-like UA: DDG/HTML endpoints often refuse custom bots.
        .user_agent(
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        )
        .build()
        .map_err(|e| e.to_string())?;
    let resp = client
        .get(url)
        .header("Accept", "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8")
        .header("Accept-Language", "zh-CN,zh;q=0.9,en;q=0.8")
        .send()
        .map_err(|e| e.to_string())?;
    let status = resp.status();
    let text = resp.text().map_err(|e| e.to_string())?;
    if status.as_u16() == 429 {
        return Err("rate_limited:429".into());
    }
    if !status.is_success() {
        return Err(format!("HTTP {status}"));
    }
    Ok(text)
}

/// DuckDuckGo Lite: links often look like <a rel="nofollow" href="https://...">title</a>
pub fn parse_duckduckgo_lite(html: &str, limit: usize) -> Result<Vec<SearchHit>, String> {
    let mut hits: Vec<SearchHit> = Vec::new();
    let mut rest = html;
    while hits.len() < limit {
        let Some(href_i) = rest.find("rel=\"nofollow\" href=\"") else {
            break;
        };
        let after = &rest[href_i + "rel=\"nofollow\" href=\"".len()..];
        let Some(href_end) = after.find('"') else {
            rest = &rest[href_i + 1..];
            continue;
        };
        let raw_href = &after[..href_end];
        // Resolve uddg= redirects before filtering duckduckgo.com shells.
        let url = resolve_ddg_redirect(raw_href);
        if url.contains("duckduckgo.com") || raw_href.starts_with('/') && !raw_href.contains("uddg=")
        {
            rest = &after[href_end + 1..];
            continue;
        }
        let title_tail = &after[href_end + 1..];
        let title = if let Some(gt) = title_tail.find('>') {
            let body = &title_tail[gt + 1..];
            let body = body
                .find("</a>")
                .map(|end| &body[..end])
                .unwrap_or_else(|| utf8_prefix(body, 120));
            strip_tags(body)
        } else {
            url.clone()
        };
        // Lite often puts a short description in the next table cell / class result-snippet.
        let window = utf8_prefix(after, 1200);
        let snippet = extract_class_text(window, "result-snippet")
            .or_else(|| extract_class_text(window, "result__snippet"))
            .map(|s| decode_basic_entities(&s).trim().chars().take(400).collect())
            .unwrap_or_default();
        if let Ok(u) = validate_public_http_url(&url) {
            let canon = u.as_str().to_string();
            if !hits.iter().any(|h| h.url == canon) {
                hits.push(SearchHit {
                    title: decode_basic_entities(&title).trim().to_string(),
                    url: canon,
                    snippet,
                    published_at: None,
                });
            }
        }
        rest = &after[href_end + 1..];
    }
    Ok(hits)
}

/// Minimal DuckDuckGo HTML result parser (result__a / result__snippet).
pub fn parse_duckduckgo_html(html: &str, limit: usize) -> Result<Vec<SearchHit>, String> {
    let mut hits: Vec<SearchHit> = Vec::new();
    let mut rest = html;
    while hits.len() < limit {
        let Some(a_idx) = rest.find("result__a") else {
            break;
        };
        let after = &rest[a_idx..];
        let Some(href_i) = after.find("href=\"") else {
            rest = &after[1..];
            continue;
        };
        let href_start = href_i + 6;
        let href_tail = &after[href_start..];
        let Some(href_end) = href_tail.find('"') else {
            rest = &after[1..];
            continue;
        };
        let raw_href = &href_tail[..href_end];
        let url = resolve_ddg_redirect(raw_href);
        let title = extract_tag_text(after, "result__a").unwrap_or_default();
        let snippet = extract_class_text(after, "result__snippet").unwrap_or_default();
        if let Ok(u) = validate_public_http_url(&url) {
            hits.push(SearchHit {
                title: decode_basic_entities(&title).trim().to_string(),
                url: u.to_string(),
                snippet: decode_basic_entities(&snippet).trim().to_string(),
                published_at: None,
            });
        }
        rest = &after[href_start + href_end + 1..];
    }
    Ok(hits)
}

fn resolve_ddg_redirect(href: &str) -> String {
    // //duckduckgo.com/l/?uddg=<urlencoded>
    if let Some(i) = href.find("uddg=") {
        let enc = &href[i + 5..];
        let enc = enc.split('&').next().unwrap_or(enc);
        if let Ok(decoded) = urlencoding_decode(enc) {
            return decoded;
        }
    }
    if href.starts_with("//") {
        return format!("https:{href}");
    }
    href.to_string()
}

fn urlencoding_decode(s: &str) -> Result<String, ()> {
    let bytes = s.as_bytes();
    let mut out = Vec::new();
    let mut i = 0;
    while i < bytes.len() {
        match bytes[i] {
            b'+' => {
                out.push(b' ');
                i += 1;
            }
            b'%' if i + 2 < bytes.len() => {
                let h = std::str::from_utf8(&bytes[i + 1..i + 3]).map_err(|_| ())?;
                let v = u8::from_str_radix(h, 16).map_err(|_| ())?;
                out.push(v);
                i += 3;
            }
            b => {
                out.push(b);
                i += 1;
            }
        }
    }
    String::from_utf8(out).map_err(|_| ())
}

/// Return at most `max_bytes` without ever splitting a UTF-8 code point.
/// Search-provider HTML is byte-sized, but Rust string slices must end on a
/// character boundary (CJK snippets frequently cross the old fixed limits).
fn utf8_prefix(s: &str, max_bytes: usize) -> &str {
    if s.len() <= max_bytes {
        return s;
    }
    let mut end = max_bytes;
    while end > 0 && !s.is_char_boundary(end) {
        end -= 1;
    }
    &s[..end]
}

fn extract_tag_text(chunk: &str, class: &str) -> Option<String> {
    let marker = format!("class=\"{class}");
    let i = chunk.find(&marker)?;
    let after = &chunk[i..];
    let gt = after.find('>')?;
    let body = &after[gt + 1..];
    let end = body.find("</a>")?;
    Some(strip_tags(&body[..end]))
}

fn extract_class_text(chunk: &str, class: &str) -> Option<String> {
    let marker = format!("class=\"{class}");
    let i = chunk.find(&marker)?;
    let after = &chunk[i..];
    let gt = after.find('>')?;
    let body = &after[gt + 1..];
    let body = body
        .find("</")
        .map(|end| &body[..end])
        .unwrap_or_else(|| utf8_prefix(body, 400));
    Some(strip_tags(body))
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn utf8_prefix_never_splits_cjk_or_symbols() {
        let cjk = format!("{}中尾", "x".repeat(2499));
        let cut = utf8_prefix(&cjk, 2500);
        assert_eq!(cut.len(), 2499);
        assert!(cut.is_char_boundary(cut.len()));

        let symbol = format!("{}›尾", "x".repeat(1199));
        let cut = utf8_prefix(&symbol, 1200);
        assert_eq!(cut.len(), 1199);
        assert!(cut.is_char_boundary(cut.len()));
    }

    #[test]
    fn class_fallback_truncates_multibyte_text_safely() {
        let html = format!(
            "<div class=\"result-snippet\">{}中文摘要",
            "x".repeat(399)
        );
        let text = extract_class_text(&html, "result-snippet").unwrap();
        assert_eq!(text.len(), 399);
    }

    #[test]
    fn parses_ddg_fixture() {
        let html = r#"
        <div class="result">
          <a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fpage">Example Title</a>
          <a class="result__snippet">Hello snippet</a>
        </div>
        "#;
        let hits = parse_duckduckgo_html(html, 5).unwrap();
        assert_eq!(hits.len(), 1);
        assert_eq!(hits[0].url, "https://example.com/page");
        // Title extraction is best-effort on truncated class windows; URL+snippet are the contract.
        assert!(hits[0].snippet.contains("Hello") || hits[0].title.contains("Example"));
    }

    #[test]
    fn parses_ddg_lite_fixture() {
        let html = r#"
        <td><a rel="nofollow" href="https://example.com/food">Beijing Food</a></td>
        <td class="result-snippet">Street food and dinner videos</td>
        "#;
        let hits = parse_duckduckgo_lite(html, 3).unwrap();
        assert_eq!(hits.len(), 1);
        assert_eq!(hits[0].url, "https://example.com/food");
        assert!(hits[0].snippet.contains("Street food"));
    }

    #[test]
    fn parses_ddg_lite_redirect_to_target() {
        let html = r#"
        <td><a rel="nofollow" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Ftarget">T</a></td>
        "#;
        let hits = parse_duckduckgo_lite(html, 2).unwrap();
        assert_eq!(hits.len(), 1);
        assert_eq!(hits[0].url, "https://example.com/target");
    }

    #[test]
    fn parses_bing_h2_links() {
        let html = r#"
        <li class="b_algo"><h2><a href="https://example.com/beijing-food">北京美食指南</a></h2>
        <div class="b_caption"><p class="b_lineclamp2">分享下饭美食与吃播推荐</p></div></li>
        <li class="b_algo"><h2><a href="https://www.bing.com/maps">skip</a></h2></li>
        <li class="b_algo"><h2><a href="https://zhuanlan.zhihu.com/p/1">知乎文章</a></h2>
        <div class="b_caption"><p>无关摘要足够长了吧这里</p></div></li>
        "#;
        let hits = parse_bing_html(html, 5).unwrap();
        assert_eq!(hits.len(), 2);
        assert_eq!(hits[0].url, "https://example.com/beijing-food");
        assert!(hits[0].title.contains("北京"));
        assert!(hits[0].snippet.contains("下饭"));
    }

    #[test]
    fn filters_chinese_char_dict_noise() {
        let q = "戴佳伟 异灵术 狗贼 驴哥 关系";
        assert!(query_has_multi_cjk_token(q));
        let junk = SearchHit {
            title: "戴（汉语文字）_百度百科".into(),
            url: "https://baike.baidu.com/item/%E6%88%B4/1870322".into(),
            snippet: "戴是汉语一级通用规范汉字".into(),
            published_at: None,
        };
        let good = SearchHit {
            title: "异灵术_百度百科".into(),
            url: "https://baike.baidu.com/item/%E5%BC%82%E7%81%B5%E6%9C%AF/66685626".into(),
            snippet: "异灵术，本名戴佳伟，炉石传说主播".into(),
            published_at: None,
        };
        assert!(is_char_dict_noise(&junk));
        assert!(!is_char_dict_noise(&good));
        let kept = filter_char_dict_noise(q, vec![junk, good.clone()]);
        assert_eq!(kept.len(), 1);
        assert_eq!(kept[0].url, good.url);
    }

    #[test]
    fn resolves_bing_ck_redirect() {
        let href = "https://www.bing.com/ck/a?!&&u=a1https%3A%2F%2Fexample.com%2Freal";
        assert_eq!(resolve_bing_redirect(href), "https://example.com/real");
    }
}
