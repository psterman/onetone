use std::collections::hash_map::DefaultHasher;
use std::fs;
use std::hash::{Hash, Hasher};
use std::io::Write;
use std::path::{Path, PathBuf};

use crate::data_root::effective_data_root;

use super::types::{TmConfig, TmOp};

const MAX_RECENT_WORKSPACES: usize = 12;

pub fn workspace_hash(workspace: &Path) -> String {
    let norm = workspace
        .to_string_lossy()
        .replace('\\', "/")
        .to_lowercase();
    let mut h = DefaultHasher::new();
    norm.hash(&mut h);
    format!("{:016x}", h.finish())
}

pub fn sidecar_dir(workspace: &Path) -> PathBuf {
    effective_data_root()
        .join("time-machine")
        .join(workspace_hash(workspace))
}

pub fn global_config_path() -> PathBuf {
    effective_data_root()
        .join("time-machine")
        .join("config.json")
}

pub fn load_workspace_path() -> Option<PathBuf> {
    let config = load_config();
    let p = config.workspace_path.as_deref()?.trim();
    if p.is_empty() {
        return None;
    }
    Some(PathBuf::from(p))
}

pub fn save_workspace_path(path: &Path) -> Result<(), String> {
    let mut config = load_config();
    let next_path = path.to_string_lossy().to_string();
    if config.workspace_path.as_deref() != Some(next_path.as_str()) {
        config.last_auto_save_at = None;
    }
    config.workspace_path = Some(next_path);
    touch_recent_workspace(&mut config, path);
    save_config(&config)?;
    let _ = fs::create_dir_all(sidecar_dir(path).join("metadata"));
    Ok(())
}

pub fn load_config() -> TmConfig {
    fs::read_to_string(global_config_path())
        .ok()
        .and_then(|raw| serde_json::from_str::<TmConfig>(&raw).ok())
        .map(normalize_config)
        .unwrap_or_default()
}

pub fn save_config(config: &TmConfig) -> Result<(), String> {
    let dir = effective_data_root().join("time-machine");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let body = serde_json::to_string_pretty(&normalize_config(config.clone()))
        .map_err(|e| e.to_string())?;
    atomic_write(&dir.join("config.json.tmp"), dir.join("config.json"), &body)
}

fn normalize_config(mut config: TmConfig) -> TmConfig {
    if !matches!(config.auto_save_interval_min, 5 | 15 | 30 | 60) {
        config.auto_save_interval_min = 15;
    }
    config.workspace_path = config
        .workspace_path
        .map(|p| p.trim().to_string())
        .filter(|p| !p.is_empty());
    let mut recent = Vec::new();
    if let Some(active) = config.workspace_path.clone() {
        push_unique(&mut recent, active);
    }
    for path in config.recent_workspace_paths {
        let p = path.trim().to_string();
        if !p.is_empty() {
            push_unique(&mut recent, p);
        }
    }
    recent.truncate(MAX_RECENT_WORKSPACES);
    config.recent_workspace_paths = recent;
    config
}

pub fn recent_workspace_paths() -> Vec<String> {
    load_config().recent_workspace_paths
}

pub fn last_auto_save_at_for(workspace: &Path) -> Option<String> {
    let config = load_config();
    workspace_key(workspace)
        .and_then(|key| config.last_auto_save_at_by_workspace.get(&key).cloned())
        .or(config.last_auto_save_at)
}

pub fn save_last_auto_save_at(workspace: &Path, created_at: &str) -> Result<(), String> {
    let mut config = load_config();
    if let Some(key) = workspace_key(workspace) {
        config
            .last_auto_save_at_by_workspace
            .insert(key.clone(), created_at.to_string());
        if config.workspace_path.as_deref() == Some(key.as_str()) {
            config.last_auto_save_at = Some(created_at.to_string());
        }
    }
    save_config(&config)
}

fn touch_recent_workspace(config: &mut TmConfig, path: &Path) {
    if let Some(key) = workspace_key(path) {
        config.recent_workspace_paths.retain(|p| p != &key);
        config.recent_workspace_paths.insert(0, key);
        config
            .recent_workspace_paths
            .truncate(MAX_RECENT_WORKSPACES);
    }
}

fn push_unique(paths: &mut Vec<String>, path: String) {
    if !paths.iter().any(|p| p == &path) {
        paths.push(path);
    }
}

fn workspace_key(workspace: &Path) -> Option<String> {
    let s = workspace.to_string_lossy().trim().to_string();
    if s.is_empty() {
        None
    } else {
        Some(s)
    }
}

pub fn metadata_path(workspace: &Path, id: &str) -> PathBuf {
    sidecar_dir(workspace)
        .join("metadata")
        .join(format!("{id}.json"))
}

pub fn oplog_path(workspace: &Path) -> PathBuf {
    sidecar_dir(workspace).join("oplog.jsonl")
}

pub fn write_metadata(workspace: &Path, op: &TmOp) -> Result<(), String> {
    let dir = sidecar_dir(workspace).join("metadata");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let final_path = metadata_path(workspace, &op.id);
    let tmp = dir.join(format!("{}.tmp", op.id));
    let body = serde_json::to_string_pretty(op).map_err(|e| e.to_string())?;
    atomic_write(&tmp, final_path, &body)
}

pub fn read_metadata(workspace: &Path, id: &str) -> Option<TmOp> {
    let raw = fs::read_to_string(metadata_path(workspace, id)).ok()?;
    serde_json::from_str(&raw).ok()
}

pub fn append_oplog(workspace: &Path, op: &TmOp) -> Result<(), String> {
    let dir = sidecar_dir(workspace);
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = oplog_path(workspace);
    let line = serde_json::to_string(op).map_err(|e| e.to_string())? + "\n";
    let mut f = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
        .map_err(|e| e.to_string())?;
    f.write_all(line.as_bytes()).map_err(|e| e.to_string())
}

pub fn atomic_write(tmp: &Path, final_path: PathBuf, body: &str) -> Result<(), String> {
    fs::write(tmp, body).map_err(|e| e.to_string())?;
    if final_path.exists() {
        fs::remove_file(&final_path).map_err(|e| {
            let _ = fs::remove_file(tmp);
            e.to_string()
        })?;
    }
    fs::rename(tmp, &final_path).map_err(|e| {
        let _ = fs::remove_file(tmp);
        e.to_string()
    })
}
