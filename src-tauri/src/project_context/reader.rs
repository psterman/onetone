//! Bounded path resolve, list, and excerpt read. Absolute paths stay internal.

use std::fs::{self, File};
use std::io::{Read, Seek, SeekFrom};
use std::path::{Component, Path, PathBuf};
use std::sync::Arc;
use std::time::Instant;

use super::contracts::*;
use super::scope::ProjectScope;

const SENSITIVE_NAMES: &[&str] = &[
    ".env",
    ".env.local",
    ".env.production",
    ".env.development",
    "id_rsa",
    "id_ed25519",
    "id_ecdsa",
    "credentials.json",
    "service-account.json",
];

const SENSITIVE_EXTS: &[&str] = &[".pem", ".pfx", ".p12", ".key", ".crt"];

const DEFAULT_SKIP_DIRS: &[&str] = &[
    ".git",
    "node_modules",
    "target",
    "dist",
    "build",
    ".onetone",
    "__pycache__",
];

pub fn validate_relative(rel: &str) -> Result<PathBuf, ContextError> {
    let s = rel.replace('\\', "/");
    if s.is_empty() {
        return Ok(PathBuf::new());
    }
    if s.starts_with('/') || s.starts_with('~') {
        return Err(ContextError::InvalidPath);
    }
    // Drive / UNC / device
    if s.len() >= 2 && s.as_bytes()[1] == b':' {
        return Err(ContextError::InvalidPath);
    }
    if s.starts_with("//") || s.starts_with("\\\\") {
        return Err(ContextError::InvalidPath);
    }
    // ADS
    if s.contains(':') {
        return Err(ContextError::InvalidPath);
    }
    let mut out = PathBuf::new();
    for comp in Path::new(&s).components() {
        match comp {
            Component::Normal(c) => {
                let t = c.to_string_lossy();
                if t.contains('\0') {
                    return Err(ContextError::InvalidPath);
                }
                out.push(c);
            }
            Component::CurDir => {}
            Component::ParentDir | Component::RootDir | Component::Prefix(_) => {
                return Err(ContextError::InvalidPath);
            }
        }
    }
    Ok(out)
}

fn is_sensitive_file(path: &Path) -> bool {
    let name = path
        .file_name()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_default();
    let lower = name.to_ascii_lowercase();
    if SENSITIVE_NAMES.iter().any(|n| lower == *n || lower.starts_with(&format!("{n}."))) {
        return true;
    }
    SENSITIVE_EXTS.iter().any(|ext| lower.ends_with(ext))
}

fn is_default_skip_dir(name: &str) -> bool {
    DEFAULT_SKIP_DIRS.iter().any(|d| name.eq_ignore_ascii_case(d))
}

pub fn looks_binary(buf: &[u8]) -> bool {
    if buf.is_empty() {
        return false;
    }
    let n = buf.len().min(8192);
    let slice = &buf[..n];
    if slice.contains(&0) {
        return true;
    }
    let non_text = slice
        .iter()
        .filter(|&&b| b < 0x09 || (b > 0x0d && b < 0x20) || b == 0x7f)
        .count();
    non_text * 10 > n
}

/// Resolve relative path under scope root without following reparse points.
pub fn resolve_under_root(scope: &ProjectScope, relative: &str) -> Result<PathBuf, ContextError> {
    let rel = validate_relative(relative)?;
    if rel.as_os_str().is_empty() {
        return Ok(scope.root.clone());
    }
    // Prefix collision guard: ensure each step exists as a real child, not string prefix.
    let mut cur = scope.root.clone();
    for comp in rel.components() {
        let Component::Normal(name) = comp else {
            return Err(ContextError::InvalidPath);
        };
        let name_str = name.to_string_lossy();
        if is_default_skip_dir(&name_str) || is_sensitive_file(Path::new(&*name_str)) {
            return Err(ContextError::Excluded);
        }
        let next = cur.join(name);
        let meta = fs::symlink_metadata(&next).map_err(|_| ContextError::NotFound)?;
        if meta.file_type().is_symlink() {
            return Err(ContextError::InvalidPath);
        }
        #[cfg(windows)]
        {
            use std::os::windows::fs::MetadataExt;
            const FILE_ATTRIBUTE_REPARSE_POINT: u32 = 0x400;
            if meta.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT != 0 {
                return Err(ContextError::InvalidPath);
            }
        }
        cur = next;
    }
    // Ensure still under root via component walk (not starts_with string).
    if !path_is_under(&scope.root, &cur) {
        return Err(ContextError::InvalidPath);
    }
    Ok(cur)
}

fn path_is_under(root: &Path, candidate: &Path) -> bool {
    let Ok(root_c) = fs::canonicalize(root) else {
        return false;
    };
    let Ok(cand_c) = fs::canonicalize(candidate) else {
        return false;
    };
    let mut r = root_c.components();
    let mut c = cand_c.components();
    loop {
        match (r.next(), c.next()) {
            (None, _) => return true,
            (Some(a), Some(b)) if paths_eq_comp(a, b) => continue,
            _ => return false,
        }
    }
}

fn paths_eq_comp(a: Component<'_>, b: Component<'_>) -> bool {
    #[cfg(windows)]
    {
        use std::ffi::OsStr;
        fn lower(os: &OsStr) -> String {
            os.to_string_lossy().to_ascii_lowercase()
        }
        match (a, b) {
            (Component::Prefix(pa), Component::Prefix(pb)) => {
                lower(pa.as_os_str()) == lower(pb.as_os_str())
            }
            (Component::Normal(na), Component::Normal(nb)) => lower(na) == lower(nb),
            (x, y) => x == y,
        }
    }
    #[cfg(not(windows))]
    {
        a == b
    }
}

fn ignore_builder(root: &Path) -> ignore::WalkBuilder {
    let mut b = ignore::WalkBuilder::new(root);
    b.hidden(false);
    b.git_ignore(true);
    b.git_global(false);
    b.git_exclude(true);
    b.ignore(true);
    b.parents(false);
    b.max_depth(Some(MAX_LIST_DEPTH + 1));
    b.filter_entry(|e| {
        let name = e.file_name().to_string_lossy();
        if is_default_skip_dir(&name) {
            return false;
        }
        if e.file_type().map(|t| t.is_file()).unwrap_or(false) && is_sensitive_file(e.path()) {
            return false;
        }
        true
    });
    // Optional .onetoneignore
    let oi = root.join(".onetoneignore");
    if oi.is_file() {
        let _ = b.add_ignore(oi);
    }
    b
}

pub fn list_files(
    scope: &Arc<ProjectScope>,
    request_id: &str,
    relative_dir: &str,
) -> Result<(Vec<FileListItem>, bool, Option<String>, BudgetUsage), ContextError> {
    let start = Instant::now();
    let base = resolve_under_root(scope, relative_dir)?;
    if !base.is_dir() {
        return Err(ContextError::NotFound);
    }
    let mut items = Vec::new();
    let mut walked = 0u32;
    let mut truncated = false;
    let mut limit_reason = None;

    let walker = ignore_builder(&base).build();
    for entry in walker {
        if scope.is_cancelled(request_id) {
            return Err(ContextError::Cancelled);
        }
        if start.elapsed().as_millis() as u64 > LIST_TIMEOUT_MS {
            truncated = true;
            limit_reason = Some("timeout".into());
            break;
        }
        let entry = match entry {
            Ok(e) => e,
            Err(_) => continue,
        };
        walked += 1;
        if walked as usize > MAX_LIST_WALK {
            truncated = true;
            limit_reason = Some("walk_limit".into());
            break;
        }
        let path = entry.path();
        if path == base {
            continue;
        }
        let Ok(rel) = path.strip_prefix(&scope.root) else {
            continue;
        };
        let rel_s = rel.to_string_lossy().replace('\\', "/");
        if items.len() < MAX_LIST_SHOW {
            items.push(FileListItem {
                relative_path: rel_s.clone(),
                display_path: rel_s,
                is_dir: entry.file_type().map(|t| t.is_dir()).unwrap_or(false),
            });
        } else {
            truncated = true;
            limit_reason = Some("show_limit".into());
            break;
        }
    }

    let shown = items.len() as u32;
    Ok((
        items,
        truncated,
        limit_reason.clone(),
        BudgetUsage {
            walked,
            shown,
            bytes: 0,
            limit_reason,
        },
    ))
}

pub fn read_excerpt(
    scope: &Arc<ProjectScope>,
    request_id: &str,
    relative_path: &str,
    start_line: u32,
    end_line: u32,
) -> Result<EvidenceRecord, ContextError> {
    let start = Instant::now();
    if start_line == 0 || end_line == 0 || end_line < start_line {
        return Err(ContextError::InvalidPath);
    }
    if (end_line - start_line + 1) as usize > MAX_EXCERPT_LINES {
        return Err(ContextError::TooLarge);
    }
    let path = resolve_under_root(scope, relative_path)?;
    if scope.is_cancelled(request_id) {
        return Err(ContextError::Cancelled);
    }
    let meta = fs::symlink_metadata(&path).map_err(|_| ContextError::NotFound)?;
    if meta.file_type().is_symlink() {
        return Err(ContextError::InvalidPath);
    }
    if !meta.is_file() {
        return Err(ContextError::NotFound);
    }
    if meta.len() > MAX_FILE_BYTES {
        return Err(ContextError::TooLarge);
    }

    let mut file = File::open(&path).map_err(|_| ContextError::IoError)?;
    // Re-check final path under root after open (TOCTOU).
    #[cfg(windows)]
    {
        if let Ok(canon) = fs::canonicalize(&path) {
            if !path_is_under(&scope.root, &canon) {
                return Err(ContextError::InvalidPath);
            }
        }
    }

    let mut buf = Vec::new();
    file.seek(SeekFrom::Start(0)).map_err(|_| ContextError::IoError)?;
    file.by_ref()
        .take(MAX_FILE_BYTES + 1)
        .read_to_end(&mut buf)
        .map_err(|_| ContextError::IoError)?;
    if buf.len() as u64 > MAX_FILE_BYTES {
        return Err(ContextError::TooLarge);
    }
    if looks_binary(&buf) {
        return Err(ContextError::UnsupportedEncoding);
    }
    if start.elapsed().as_millis() as u64 > READ_TIMEOUT_MS {
        return Err(ContextError::Timeout);
    }
    // UTF-8 only (strip BOM).
    let text = if buf.starts_with(&[0xEF, 0xBB, 0xBF]) {
        std::str::from_utf8(&buf[3..]).map_err(|_| ContextError::UnsupportedEncoding)?
    } else {
        std::str::from_utf8(&buf).map_err(|_| ContextError::UnsupportedEncoding)?
    };

    let lines: Vec<&str> = text.split_inclusive('\n').collect();
    let total = lines.len() as u32;
    if start_line > total {
        return Err(ContextError::NotFound);
    }
    let end = end_line.min(total);
    let slice = &lines[(start_line as usize - 1)..(end as usize)];
    let mut content = slice.concat();
    let mut truncated = false;
    let mut limit_reason = None;
    if content.len() > MAX_EXCERPT_BYTES {
        // Truncate on char boundary.
        let mut end_idx = MAX_EXCERPT_BYTES;
        while end_idx > 0 && !content.is_char_boundary(end_idx) {
            end_idx -= 1;
        }
        content.truncate(end_idx);
        truncated = true;
        limit_reason = Some("excerpt_bytes".into());
    }

    let hash = content_hash(buf.as_slice());
    let rel = relative_path.replace('\\', "/");
    let source_ref = format!("{rel}:{start_line}-{end}");
    Ok(EvidenceRecord {
        schema_version: SCHEMA_VERSION,
        id: format!("ev_{}", &hash[..16.min(hash.len())]),
        scope_id: scope.scope_id.clone(),
        task_scope_id: scope.task_scope_id.clone(),
        kind: "file_excerpt".into(),
        label: format!("{rel}:{start_line}-{end}"),
        display_path: Some(rel.clone()),
        source_ref: Some(source_ref),
        relative_path: Some(rel.clone()),
        range: Some(LineRange {
            start_line,
            end_line: end,
        }),
        content,
        source_version: hash,
        source_refs: vec![SourceRef {
            relative_path: rel,
            range: Some(LineRange {
                start_line,
                end_line: end,
            }),
            note: None,
        }],
        captured_at: now_iso(),
        truncated,
        limit_reason,
        freshness: "captured".into(),
        git: None,
    })
}

pub fn fingerprint_file(scope: &ProjectScope, relative_path: &str) -> Result<String, ContextError> {
    let path = resolve_under_root(scope, relative_path)?;
    let mut file = File::open(&path).map_err(|_| ContextError::NotFound)?;
    let mut buf = Vec::new();
    file.take(MAX_FILE_BYTES + 1)
        .read_to_end(&mut buf)
        .map_err(|_| ContextError::IoError)?;
    if buf.len() as u64 > MAX_FILE_BYTES {
        return Err(ContextError::TooLarge);
    }
    Ok(content_hash(&buf))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::project_context::scope::{close, open_at};
    use std::io::Write;

    fn scope_with(dir: &Path) -> Arc<ProjectScope> {
        let dto = open_at("main", "ts_reader", dir).unwrap();
        crate::project_context::scope::get(&dto.scope_id).unwrap()
    }

    #[test]
    fn rejects_dotdot_and_ads() {
        assert!(validate_relative("../x").is_err());
        assert!(validate_relative("a/../../b").is_err());
        assert!(validate_relative("C:/Windows").is_err());
        assert!(validate_relative("file.txt:stream").is_err());
        assert!(validate_relative("//server/share").is_err());
    }

    #[test]
    fn rejects_prefix_collision_neighbor() {
        let _g = crate::project_context::scope::test_scope_lock();
        let root = std::env::temp_dir().join(format!("ot_pc_pref_{}", now_iso()));
        let _ = fs::create_dir_all(root.join("project"));
        let _ = fs::create_dir_all(root.join("project_evil"));
        fs::write(root.join("project_evil").join("secret.txt"), b"nope").unwrap();
        let scope = scope_with(&root.join("project"));
        // Attempt to escape via crafted relative that normalize might confuse — component check blocks.
        let err = resolve_under_root(&scope, "../project_evil/secret.txt").unwrap_err();
        assert_eq!(err, ContextError::InvalidPath);
        let _ = close("main", &scope.scope_id);
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn excerpt_preserves_long_span() {
        let _g = crate::project_context::scope::test_scope_lock();
        let root = std::env::temp_dir().join(format!("ot_pc_ex_{}", now_iso()));
        let _ = fs::create_dir_all(&root);
        let mut f = fs::File::create(root.join("big.rs")).unwrap();
        for i in 1..=200 {
            writeln!(f, "// line {i} {}", "x".repeat(20)).unwrap();
        }
        let scope = scope_with(&root);
        let rec = read_excerpt(&scope, "req1", "big.rs", 101, 160).unwrap();
        assert!(rec.content.contains("line 101"));
        assert!(rec.content.contains("line 160"));
        assert!(rec.content.len() > 400);
        let _ = close("main", &scope.scope_id);
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn excludes_env() {
        let _g = crate::project_context::scope::test_scope_lock();
        let root = std::env::temp_dir().join(format!("ot_pc_env_{}", now_iso()));
        let _ = fs::create_dir_all(&root);
        fs::write(root.join(".env"), b"SECRET=1").unwrap();
        let scope = scope_with(&root);
        let err = resolve_under_root(&scope, ".env").unwrap_err();
        assert_eq!(err, ContextError::Excluded);
        let _ = close("main", &scope.scope_id);
        let _ = fs::remove_dir_all(&root);
    }

    #[cfg(windows)]
    #[test]
    fn rejects_junction() {
        let _g = crate::project_context::scope::test_scope_lock();
        let root = std::env::temp_dir().join(format!("ot_pc_junc_{}", now_iso()));
        let target = std::env::temp_dir().join(format!("ot_pc_junc_tgt_{}", now_iso()));
        let _ = fs::create_dir_all(&root);
        let _ = fs::create_dir_all(&target);
        fs::write(target.join("out.txt"), b"leak").unwrap();
        let link = root.join("link");
        let status = std::process::Command::new("cmd")
            .args([
                "/C",
                "mklink",
                "/J",
                &link.to_string_lossy(),
                &target.to_string_lossy(),
            ])
            .status();
        if !status.map(|s| s.success()).unwrap_or(false) {
            // Skip if no privilege
            let _ = fs::remove_dir_all(&root);
            let _ = fs::remove_dir_all(&target);
            return;
        }
        let scope = scope_with(&root);
        let err = resolve_under_root(&scope, "link/out.txt").unwrap_err();
        assert_eq!(err, ContextError::InvalidPath);
        let _ = close("main", &scope.scope_id);
        let _ = fs::remove_dir_all(&root);
        let _ = fs::remove_dir_all(&target);
    }
}
