//! Custom data root via pointer file at the canonical AppData directory.
//! Changing the root writes the pointer + migrates files; takes effect after restart.

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::OnceLock;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DataRootPointer {
    pub path: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DataRootStatus {
    pub effective_root: String,
    pub default_root: String,
    pub is_custom: bool,
    pub pointer_path: String,
    pub config_path: String,
    pub logs_dir: String,
    /// True when pointer differs from the root this process already locked in.
    pub restart_required: bool,
}

static EFFECTIVE_ROOT: OnceLock<PathBuf> = OnceLock::new();
static PENDING_RESTART: std::sync::atomic::AtomicBool =
    std::sync::atomic::AtomicBool::new(false);

/// Canonical AppData config dir (always the pointer home), e.g. %APPDATA%\com.onetone\app
pub fn canonical_app_dir() -> PathBuf {
    directories::ProjectDirs::from("com", "onetone", "app")
        .map(|d| d.config_dir().to_path_buf())
        .unwrap_or_else(|| PathBuf::from("."))
}

pub fn pointer_path() -> PathBuf {
    canonical_app_dir().join("data-root.json")
}

fn default_data_root() -> PathBuf {
    canonical_app_dir()
}

fn read_pointer() -> Option<PathBuf> {
    let path = pointer_path();
    let raw = fs::read_to_string(&path).ok()?;
    let ptr: DataRootPointer = serde_json::from_str(&raw).ok()?;
    let p = PathBuf::from(ptr.path.trim());
    if p.as_os_str().is_empty() {
        return None;
    }
    Some(p)
}

fn validate_root(root: &Path) -> Result<(), String> {
    if root.as_os_str().is_empty() {
        return Err("empty path".into());
    }
    if !root.is_absolute() {
        return Err("path must be absolute".into());
    }
    Ok(())
}

/// Resolve once per process: pointer if valid, else default AppData dir.
pub fn effective_data_root() -> PathBuf {
    EFFECTIVE_ROOT
        .get_or_init(|| {
            if let Some(custom) = read_pointer() {
                if validate_root(&custom).is_ok() {
                    let _ = fs::create_dir_all(&custom);
                    return custom;
                }
            }
            let def = default_data_root();
            let _ = fs::create_dir_all(&def);
            def
        })
        .clone()
}

pub fn settings_path_in(root: &Path) -> PathBuf {
    root.join("settings.json")
}

pub fn logs_dir_in(root: &Path) -> PathBuf {
    root.join("logs")
}

pub fn effective_settings_path() -> PathBuf {
    settings_path_in(&effective_data_root())
}

pub fn effective_logs_dir() -> PathBuf {
    logs_dir_in(&effective_data_root())
}

pub fn status() -> DataRootStatus {
    let default_root = default_data_root();
    let pointer = read_pointer();
    let is_custom = pointer.is_some();
    let pointed = pointer.unwrap_or_else(|| default_root.clone());
    let effective = effective_data_root();
    let restart_required = PENDING_RESTART.load(std::sync::atomic::Ordering::Acquire)
        || (is_custom && pointed != effective)
        || (!is_custom && effective != default_root && EFFECTIVE_ROOT.get().is_some());
    DataRootStatus {
        effective_root: effective.display().to_string(),
        default_root: default_root.display().to_string(),
        is_custom,
        pointer_path: pointer_path().display().to_string(),
        config_path: settings_path_in(&effective).display().to_string(),
        logs_dir: logs_dir_in(&effective).display().to_string(),
        restart_required,
    }
}

fn dir_has_settings(root: &Path) -> bool {
    settings_path_in(root).is_file()
}

fn copy_dir_recursive(src: &Path, dst: &Path) -> Result<(), String> {
    if !src.is_dir() {
        return Ok(());
    }
    fs::create_dir_all(dst).map_err(|e| e.to_string())?;
    for entry in fs::read_dir(src).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let ty = entry.file_type().map_err(|e| e.to_string())?;
        let to = dst.join(entry.file_name());
        if ty.is_dir() {
            copy_dir_recursive(&entry.path(), &to)?;
        } else if ty.is_file() {
            fs::copy(entry.path(), &to).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

fn migrate_into(target: &Path) -> Result<(), String> {
    validate_root(target)?;
    fs::create_dir_all(target).map_err(|e| e.to_string())?;
    if dir_has_settings(target) {
        return Err("target already has settings.json; pick an empty folder".into());
    }
    let src_root = effective_data_root();
    if src_root == target {
        return Ok(());
    }
    let src_settings = settings_path_in(&src_root);
    if src_settings.is_file() {
        fs::copy(&src_settings, settings_path_in(target)).map_err(|e| e.to_string())?;
    }
    let src_logs = logs_dir_in(&src_root);
    if src_logs.is_dir() {
        copy_dir_recursive(&src_logs, &logs_dir_in(target))?;
    }
    Ok(())
}

fn write_pointer(root: &Path) -> Result<(), String> {
    let dir = canonical_app_dir();
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let ptr = DataRootPointer {
        path: root.display().to_string(),
    };
    let json = serde_json::to_string_pretty(&ptr).map_err(|e| e.to_string())?;
    fs::write(pointer_path(), json).map_err(|e| e.to_string())
}

/// Set custom root: migrate from current effective root, write pointer, mark restart.
pub fn set_custom_root(target: PathBuf) -> Result<DataRootStatus, String> {
    validate_root(&target)?;
    migrate_into(&target)?;
    write_pointer(&target)?;
    PENDING_RESTART.store(true, std::sync::atomic::Ordering::Release);
    Ok(status())
}

pub fn reset_to_default() -> Result<DataRootStatus, String> {
    let path = pointer_path();
    if path.exists() {
        fs::remove_file(&path).map_err(|e| e.to_string())?;
    }
    PENDING_RESTART.store(true, std::sync::atomic::Ordering::Release);
    Ok(status())
}

#[cfg(windows)]
pub fn pick_folder_dialog() -> Result<Option<PathBuf>, String> {
    // ponytail: WinForms FolderBrowser via PowerShell — avoids new crate / COM glue.
    let script = r#"
Add-Type -AssemblyName System.Windows.Forms | Out-Null
$d = New-Object System.Windows.Forms.FolderBrowserDialog
$d.Description = 'Select OneTone data folder'
$d.ShowNewFolderButton = $true
if ($d.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
  Write-Output $d.SelectedPath
}
"#;
    let output = std::process::Command::new("powershell")
        .args(["-NoProfile", "-STA", "-Command", script])
        .output()
        .map_err(|e| e.to_string())?;
    if !output.status.success() {
        let err = String::from_utf8_lossy(&output.stderr);
        return Err(format!("folder dialog failed: {err}"));
    }
    let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if path.is_empty() {
        Ok(None)
    } else {
        Ok(Some(PathBuf::from(path)))
    }
}

#[cfg(not(windows))]
pub fn pick_folder_dialog() -> Result<Option<PathBuf>, String> {
    Err("folder picker is only supported on Windows".into())
}

pub fn open_path(path: &Path) -> Result<(), String> {
    #[cfg(windows)]
    {
        std::process::Command::new("explorer")
            .arg(path.as_os_str())
            .spawn()
            .map_err(|e| e.to_string())?;
        Ok(())
    }
    #[cfg(not(windows))]
    {
        let _ = path;
        Err("open path is only supported on Windows".into())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn tmp_root() -> PathBuf {
        let n = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0);
        std::env::temp_dir().join(format!("onetone-data-root-{n}"))
    }

    #[test]
    fn migrate_rejects_existing_settings() {
        let t = tmp_root();
        let _ = fs::remove_dir_all(&t);
        fs::create_dir_all(&t).unwrap();
        fs::write(settings_path_in(&t), "{}").unwrap();
        let err = migrate_into(&t).unwrap_err();
        assert!(err.contains("settings.json"));
        let _ = fs::remove_dir_all(&t);
    }
}
