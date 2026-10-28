//! Window-bound project read scopes. One active scope per main window.

use parking_lot::Mutex;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, OnceLock};
use std::time::{SystemTime, UNIX_EPOCH};

use super::contracts::{ContextError, OpenArgs, ScopeDto};

#[derive(Debug)]
pub struct ProjectScope {
    pub scope_id: String,
    pub task_scope_id: String,
    pub owner_window: String,
    pub root: PathBuf,
    pub display_name: String,
    pub revoked: AtomicBool,
    pub cancel_request: Mutex<Option<String>>,
    pub busy: AtomicBool,
}

impl ProjectScope {
    pub fn is_active(&self) -> bool {
        !self.revoked.load(Ordering::SeqCst)
    }

    pub fn revoke(&self) {
        self.revoked.store(true, Ordering::SeqCst);
        *self.cancel_request.lock() = Some("__revoked__".into());
    }

    pub fn request_cancel(&self, request_id: &str) {
        *self.cancel_request.lock() = Some(request_id.to_string());
    }

    pub fn is_cancelled(&self, request_id: &str) -> bool {
        if !self.is_active() {
            return true;
        }
        match self.cancel_request.lock().as_deref() {
            Some("__revoked__") => true,
            Some(id) if id == request_id => true,
            _ => false,
        }
    }

    pub fn clear_cancel(&self) {
        *self.cancel_request.lock() = None;
    }
}

struct ScopeTable {
    /// window label -> active scope
    by_window: HashMap<String, Arc<ProjectScope>>,
    by_id: HashMap<String, Arc<ProjectScope>>,
}

fn table() -> &'static Mutex<ScopeTable> {
    static T: OnceLock<Mutex<ScopeTable>> = OnceLock::new();
    T.get_or_init(|| {
        Mutex::new(ScopeTable {
            by_window: HashMap::new(),
            by_id: HashMap::new(),
        })
    })
}

fn new_scope_id() -> String {
    use std::sync::atomic::AtomicU64;
    static SEQ: AtomicU64 = AtomicU64::new(1);
    let ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    let n = SEQ.fetch_add(1, Ordering::SeqCst);
    // Include pointer entropy so same-ms opens never collide even if SEQ were stale-linked.
    let salt = (&SEQ as *const AtomicU64 as usize) ^ (n as usize);
    format!("pcs_{ms}_{n}_{salt:x}")
}

pub fn require_main_window(label: &str) -> Result<(), ContextError> {
    if label == "main" {
        Ok(())
    } else {
        Err(ContextError::WrongOwner)
    }
}

/// Test / internal open with an already-chosen root (no dialog).
pub fn open_at(
    window_label: &str,
    task_scope_id: &str,
    root: &Path,
) -> Result<ScopeDto, ContextError> {
    require_main_window(window_label)?;
    let task = task_scope_id.trim();
    if task.is_empty() {
        return Err(ContextError::ScopeRequired);
    }
    let canonical = canonicalize_root(root)?;
    if !canonical.is_dir() {
        return Err(ContextError::NotFound);
    }
    let display_name = canonical
        .file_name()
        .map(|s| s.to_string_lossy().to_string())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| "project".into());
    let scope_id = new_scope_id();
    let scope = Arc::new(ProjectScope {
        scope_id: scope_id.clone(),
        task_scope_id: task.to_string(),
        owner_window: window_label.to_string(),
        root: canonical.clone(),
        display_name: display_name.clone(),
        revoked: AtomicBool::new(false),
        cancel_request: Mutex::new(None),
        busy: AtomicBool::new(false),
    });

    let mut g = table().lock();
    if let Some(old) = g.by_window.remove(window_label) {
        old.revoke();
        g.by_id.remove(&old.scope_id);
    }
    g.by_window.insert(window_label.to_string(), scope.clone());
    g.by_id.insert(scope_id.clone(), scope);

    Ok(ScopeDto {
        scope_id,
        task_scope_id: task.to_string(),
        display_name,
        display_root: display_name_from_path(&canonical),
    })
}

fn display_name_from_path(p: &Path) -> String {
    p.file_name()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| "project".into())
}

fn canonicalize_root(root: &Path) -> Result<PathBuf, ContextError> {
    let meta = std::fs::symlink_metadata(root).map_err(|_| ContextError::NotFound)?;
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
    std::fs::canonicalize(root).map_err(|_| ContextError::IoError)
}

/// Production open: native folder dialog only (no typed path grant).
pub fn open_with_dialog(window_label: &str, args: &OpenArgs) -> Result<ScopeDto, ContextError> {
    require_main_window(window_label)?;
    let _ = args.suggested_root.as_deref(); // hint only; never grants
    let picked = crate::data_root::pick_folder_dialog_desc("选择工程目录（添加工程材料）")
        .map_err(|_| ContextError::IoError)?;
    let Some(path) = picked else {
        return Err(ContextError::CancelledDialog);
    };
    open_at(window_label, &args.task_scope_id, &path)
}

pub fn close(window_label: &str, scope_id: &str) -> Result<bool, ContextError> {
    require_main_window(window_label)?;
    let mut g = table().lock();
    let Some(scope) = g.by_id.get(scope_id).cloned() else {
        return Ok(false);
    };
    if scope.owner_window != window_label {
        return Err(ContextError::WrongOwner);
    }
    scope.revoke();
    g.by_id.remove(scope_id);
    if g.by_window
        .get(window_label)
        .map(|s| s.scope_id == scope_id)
        .unwrap_or(false)
    {
        g.by_window.remove(window_label);
    }
    Ok(true)
}

pub fn revoke_window(window_label: &str) {
    let mut g = table().lock();
    if let Some(old) = g.by_window.remove(window_label) {
        old.revoke();
        g.by_id.remove(&old.scope_id);
    }
}

pub fn get(scope_id: &str) -> Option<Arc<ProjectScope>> {
    table().lock().by_id.get(scope_id).cloned()
}

pub fn require_scope(
    window_label: &str,
    scope_id: &str,
    task_scope_id: &str,
) -> Result<Arc<ProjectScope>, ContextError> {
    require_main_window(window_label)?;
    let scope = get(scope_id).ok_or(ContextError::ScopeRequired)?;
    if scope.owner_window != window_label {
        return Err(ContextError::WrongOwner);
    }
    if !scope.is_active() {
        return Err(ContextError::ScopeRevoked);
    }
    if scope.task_scope_id != task_scope_id {
        return Err(ContextError::ScopeRevoked);
    }
    Ok(scope)
}

pub fn try_begin_busy(scope: &ProjectScope) -> Result<(), ContextError> {
    if scope
        .busy
        .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
        .is_err()
    {
        return Err(ContextError::Busy);
    }
    Ok(())
}

pub fn end_busy(scope: &ProjectScope) {
    scope.busy.store(false, Ordering::SeqCst);
}

/// Serialize tests that mutate the process-wide main-window scope table.
#[cfg(test)]
pub fn test_scope_lock() -> parking_lot::MutexGuard<'static, ()> {
    static L: OnceLock<Mutex<()>> = OnceLock::new();
    L.get_or_init(|| Mutex::new(())).lock()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn non_main_window_rejected() {
        let _g = test_scope_lock();
        let dir = tempfile_dir();
        let err = open_at("tray_menu", "ts1", &dir).unwrap_err();
        assert_eq!(err, ContextError::WrongOwner);
    }

    #[test]
    fn one_active_scope_per_window() {
        let _g = test_scope_lock();
        let a = tempfile_dir();
        let b = tempfile_dir();
        let s1 = open_at("main", "ts_a", &a).unwrap();
        let s2 = open_at("main", "ts_b", &b).unwrap();
        assert_ne!(s1.scope_id, s2.scope_id);
        // Prior scope is revoked and dropped from the table on replace.
        assert!(get(&s1.scope_id).is_none());
        assert!(require_scope("main", &s1.scope_id, "ts_a").is_err());
        let cur = get(&s2.scope_id).unwrap();
        assert!(cur.is_active());
        let _ = close("main", &s2.scope_id);
    }

    #[test]
    fn task_mismatch_revokes_access() {
        let _g = test_scope_lock();
        let dir = tempfile_dir();
        let s = open_at("main", "ts1", &dir).unwrap();
        let err = require_scope("main", &s.scope_id, "other").unwrap_err();
        assert_eq!(err, ContextError::ScopeRevoked);
        let _ = close("main", &s.scope_id);
    }

    fn tempfile_dir() -> PathBuf {
        let p = std::env::temp_dir().join(format!("ot_pc_scope_{}", new_scope_id()));
        let _ = fs::create_dir_all(&p);
        p
    }
}
