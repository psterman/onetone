//! Write research markdown/html under data_root/research/.

use serde_json::{json, Value};
use std::fs;
use std::path::PathBuf;

pub fn export_report(
    format: &str,
    filename_stem: &str,
    markdown: &str,
    html: &str,
) -> Value {
    let fmt = format.trim().to_ascii_lowercase();
    let stem = sanitize_stem(filename_stem);
    let (ext, body) = if fmt == "html" {
        ("html", html)
    } else {
        ("md", markdown)
    };
    if body.trim().is_empty() {
        return json!({ "ok": false, "code": "empty", "message": "empty export body" });
    }
    match write_research_file(&stem, ext, body) {
        Ok(path) => json!({
            "ok": true,
            "path": path.to_string_lossy(),
            "format": if fmt == "html" { "html" } else { "markdown" }
        }),
        Err(e) => json!({ "ok": false, "code": "export_failed", "message": e }),
    }
}

fn sanitize_stem(raw: &str) -> String {
    let mut s: String = raw
        .chars()
        .map(|c| match c {
            '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '_',
            c if c.is_control() => '_',
            c => c,
        })
        .take(60)
        .collect();
    s = s.trim().trim_matches('.').to_string();
    if s.is_empty() {
        "research-report".into()
    } else {
        s
    }
}

fn research_dir() -> Result<PathBuf, String> {
    let root = crate::data_root::effective_data_root();
    let dir = root.join("research");
    fs::create_dir_all(&dir).map_err(|e| format!("mkdir: {e}"))?;
    Ok(dir)
}

fn write_research_file(stem: &str, ext: &str, body: &str) -> Result<PathBuf, String> {
    let dir = research_dir()?;
    let mut path = dir.join(format!("{stem}.{ext}"));
    let mut n = 1u32;
    while path.exists() && n < 50 {
        path = dir.join(format!("{stem}-{n}.{ext}"));
        n += 1;
    }
    let tmp = path.with_extension(format!("{ext}.tmp"));
    fs::write(&tmp, body.as_bytes()).map_err(|e| format!("write: {e}"))?;
    fs::rename(&tmp, &path).map_err(|e| format!("rename: {e}"))?;
    Ok(path)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sanitize_strips_path_chars() {
        assert_eq!(sanitize_stem("../a:b"), "__a_b");
        assert_eq!(sanitize_stem(""), "research-report");
    }
}
