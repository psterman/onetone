//! 从 passport 与根目录清单推导确定性候选（只抄不推断）。

use serde_json::json;

use crate::project_context::{EvidenceRecord, FileListItem};

use super::model::{SECTION_COMMANDS, SECTION_MAP, SECTION_OVERVIEW};

#[derive(Debug, Clone)]
pub struct DerivedCandidate {
    pub section: &'static str,
    pub content: String,
    pub confidence: f32,
    pub evidence: serde_json::Value,
}

/// 拆出 passport body 中的每个文件块。
///
/// passport body 形如：`## README.md\n```\n<内容>\n```\n`。
/// 文件内容本身可能含 ```（README 里的代码块），因此**不能**用「遇到下一个 ```
/// 就结束」的方式切分——必须取该段落里**第一个** fence 与**最后一个** fence 之间的全部内容。
pub fn passport_sections(body: &str) -> Vec<(String, String)> {
    let mut heads: Vec<(usize, String)> = Vec::new();
    let mut off = 0usize;
    for line in body.split_inclusive('\n') {
        if let Some(rest) = line.strip_prefix("## ") {
            heads.push((off, rest.trim().to_string()));
        }
        off += line.len();
    }
    let mut out = Vec::new();
    for i in 0..heads.len() {
        let (start, name) = &heads[i];
        let end = heads.get(i + 1).map(|(o, _)| *o).unwrap_or(body.len());
        out.push((name.clone(), extract_fenced(&body[*start..end])));
    }
    out
}

fn extract_fenced(slice: &str) -> String {
    let lines: Vec<&str> = slice.lines().collect();
    let first = lines.iter().position(|l| l.trim() == "```");
    let last = lines.iter().rposition(|l| l.trim() == "```");
    match (first, last) {
        (Some(a), Some(b)) if b > a => lines[a + 1..b].join("\n"),
        _ => String::new(),
    }
}

/// 排除发布/部署类脚本（发布动作不该由 Agent 自动触发）。
pub fn is_excluded_script(name: &str) -> bool {
    let n = name.trim().to_ascii_lowercase();
    n.starts_with("publish") || n.starts_with("release") || n.starts_with("deploy")
}

const MAX_COMMAND_CANDIDATES: usize = 12;

/// 命令条数上限：先取非 test 前缀的命令，再用 test:* 补齐。
fn select_scripts(scripts: &[(String, String)]) -> Vec<(String, String)> {
    let mut primary: Vec<(String, String)> = Vec::new();
    let mut tests: Vec<(String, String)> = Vec::new();
    for (name, cmd) in scripts {
        if is_excluded_script(name) {
            continue;
        }
        if name.trim().to_ascii_lowercase().starts_with("test") {
            tests.push((name.clone(), cmd.clone()));
        } else {
            primary.push((name.clone(), cmd.clone()));
        }
    }
    primary.sort_by(|a, b| a.0.cmp(&b.0));
    tests.sort_by(|a, b| a.0.cmp(&b.0));
    let mut out: Vec<(String, String)> = primary.into_iter().take(MAX_COMMAND_CANDIDATES).collect();
    if out.len() < MAX_COMMAND_CANDIDATES {
        let room = MAX_COMMAND_CANDIDATES - out.len();
        out.extend(tests.into_iter().take(room));
    }
    out
}

fn derive_from_package_json(text: &str, version: &str) -> Vec<DerivedCandidate> {
    let Ok(v) = serde_json::from_str::<serde_json::Value>(text) else {
        return Vec::new();
    };
    let mut out = Vec::new();
    if let Some(desc) = v.get("description").and_then(|d| d.as_str()) {
        let d = desc.trim();
        if !d.is_empty() {
            out.push(DerivedCandidate {
                section: SECTION_OVERVIEW,
                content: d.to_string(),
                confidence: 0.8,
                evidence: json!({ "source": "package.json#description", "sourceVersion": version }),
            });
        }
    }
    let scripts: Vec<(String, String)> = v
        .get("scripts")
        .and_then(|s| s.as_object())
        .map(|m| {
            m.iter()
                .filter_map(|(k, val)| val.as_str().map(|s| (k.clone(), s.to_string())))
                .collect()
        })
        .unwrap_or_default();
    let total = scripts.len();
    for (name, cmd) in select_scripts(&scripts) {
        out.push(DerivedCandidate {
            section: SECTION_COMMANDS,
            content: format!("`{name}` — {}", cmd.trim()),
            confidence: 0.8,
            evidence: json!({ "source": "package.json#scripts", "script": name, "sourceVersion": version }),
        });
    }
    if total > MAX_COMMAND_CANDIDATES {
        out.push(DerivedCandidate {
            section: SECTION_MAP,
            content: format!("其余 {total} 个脚本见 `package.json#scripts`（本说明只列常用 {MAX_COMMAND_CANDIDATES} 条）"),
            confidence: 0.6,
            evidence: json!({ "source": "package.json#scripts", "truncated": total, "sourceVersion": version }),
        });
    }
    out
}

fn derive_from_readme(text: &str, version: &str) -> Vec<DerivedCandidate> {
    let para = text
        .lines()
        .map(|l| l.trim())
        .find(|l| !l.is_empty() && !l.starts_with('#') && !l.starts_with('<'))
        .unwrap_or("");
    if para.is_empty() {
        return Vec::new();
    }
    vec![DerivedCandidate {
        section: SECTION_OVERVIEW,
        content: para.chars().take(200).collect(),
        confidence: 0.6,
        evidence: json!({ "source": "README.md", "sourceVersion": version }),
    }]
}

fn derive_from_cargo_toml(text: &str, version: &str) -> Vec<DerivedCandidate> {
    if !text.contains("[workspace]") {
        return Vec::new();
    }
    vec![DerivedCandidate {
        section: SECTION_MAP,
        content: "Cargo workspace：成员未展开（见 `Cargo.toml`）".to_string(),
        confidence: 0.7,
        evidence: json!({ "source": "Cargo.toml#workspace", "sourceVersion": version }),
    }]
}

/// 根目录目录名（只列名，不读内容）。最多 8 个，按名称排序。
fn derive_root_dirs(items: &[FileListItem]) -> Vec<DerivedCandidate> {
    let mut dirs: Vec<String> = items
        .iter()
        .filter(|i| i.is_dir && !i.relative_path.contains('/'))
        .map(|i| i.relative_path.trim_end_matches('/').to_string())
        .filter(|d| !d.is_empty() && !d.starts_with('.'))
        .collect();
    dirs.sort();
    dirs.dedup();
    dirs.truncate(8);
    if dirs.is_empty() {
        return Vec::new();
    }
    vec![DerivedCandidate {
        section: SECTION_MAP,
        content: format!("顶层目录：{}", dirs.join(" / ")),
        confidence: 0.7,
        evidence: json!({ "source": "root_listing", "dirs": dirs }),
    }]
}

pub fn derive_from_passport(
    record: &EvidenceRecord,
    root_items: &[FileListItem],
) -> Vec<DerivedCandidate> {
    let version = record.source_version.as_str();
    let sections = passport_sections(&record.content);
    let mut out = Vec::new();
    for (name, text) in &sections {
        match name.as_str() {
            "package.json" => out.extend(derive_from_package_json(text, version)),
            "README.md" => out.extend(derive_from_readme(text, version)),
            "Cargo.toml" => out.extend(derive_from_cargo_toml(text, version)),
            _ => {}
        }
    }
    out.extend(derive_root_dirs(root_items));
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn passport(body: &str) -> EvidenceRecord {
        EvidenceRecord {
            schema_version: 1,
            id: "ev_pass_test".into(),
            scope_id: "s".into(),
            task_scope_id: "t".into(),
            kind: "passport".into(),
            label: "l".into(),
            display_path: None,
            source_ref: None,
            relative_path: None,
            range: None,
            content: body.to_string(),
            source_version: "v1".into(),
            source_refs: vec![],
            captured_at: "now".into(),
            truncated: false,
            limit_reason: None,
            freshness: "captured".into(),
            git: None,
        }
    }

    #[test]
    fn splits_sections_with_nested_fences() {
        let body = "## README.md\n```\nline\n```rust\ncode\n```\n```\n## package.json\n```\n{}\n```\n";
        let secs = passport_sections(body);
        assert_eq!(secs.len(), 2);
        assert_eq!(secs[0].0, "README.md");
        assert!(secs[0].1.contains("```rust"), "nested fence must be preserved");
        assert_eq!(secs[1].0, "package.json");
        assert_eq!(secs[1].1.trim(), "{}");
    }

    #[test]
    fn derives_overview_and_commands_from_package_json() {
        let body = "## package.json\n```\n{\"description\":\"demo app\",\"scripts\":{\"dev\":\"vite\",\"publish\":\"x\",\"test:unit\":\"vitest\"}}\n```\n";
        let cands = derive_from_passport(&passport(body), &[]);
        assert!(cands.iter().any(|c| c.section == SECTION_OVERVIEW && c.content == "demo app"));
        assert!(cands.iter().any(|c| c.section == SECTION_COMMANDS && c.content.contains("`dev`")));
        assert!(!cands.iter().any(|c| c.content.contains("publish")));
    }

    #[test]
    fn excludes_release_like_scripts() {
        assert!(is_excluded_script("publish"));
        assert!(is_excluded_script("release:stable"));
        assert!(is_excluded_script("deploy"));
        assert!(!is_excluded_script("test:unit"));
    }

    #[test]
    fn caps_command_candidates() {
        let mut scripts = Vec::new();
        for i in 0..30 {
            scripts.push((format!("s{i:02}"), "x".to_string()));
        }
        assert_eq!(select_scripts(&scripts).len(), MAX_COMMAND_CANDIDATES);
    }

    #[test]
    fn prefers_non_test_scripts_over_tests() {
        let scripts = vec![
            ("test:a".to_string(), "x".to_string()),
            ("dev".to_string(), "y".to_string()),
        ];
        let picked = select_scripts(&scripts);
        assert_eq!(picked[0].0, "dev");
    }

    #[test]
    fn derives_root_dirs_from_listing() {
        let items = vec![
            FileListItem { relative_path: "src".into(), display_path: "src".into(), is_dir: true },
            FileListItem { relative_path: "src-tauri".into(), display_path: "src-tauri".into(), is_dir: true },
            FileListItem { relative_path: ".git".into(), display_path: ".git".into(), is_dir: true },
            FileListItem { relative_path: "README.md".into(), display_path: "README.md".into(), is_dir: false },
        ];
        let cands = derive_root_dirs(&items);
        assert_eq!(cands.len(), 1);
        assert!(cands[0].content.contains("src"));
        assert!(cands[0].content.contains("src-tauri"));
        assert!(!cands[0].content.contains(".git"), "hidden dirs excluded");
    }

    #[test]
    fn detects_cargo_workspace() {
        let body = "## Cargo.toml\n```\n[workspace]\nmembers = [\"crates/x\"]\n```\n";
        let cands = derive_from_passport(&passport(body), &[]);
        assert!(cands.iter().any(|c| c.section == SECTION_MAP && c.content.contains("Cargo workspace")));
    }
}
