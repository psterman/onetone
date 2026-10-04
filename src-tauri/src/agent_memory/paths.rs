//! OneTone agent-memory.sqlite3 path — Plan A locked location.

use std::fs;
use std::path::PathBuf;

/// `%LOCALAPPDATA%\OneTone\data\agent-memory.sqlite3` (Windows).
/// Override with `ONETONE_AGENT_MEMORY_DB` for isolated tests.
pub fn agent_memory_db_path() -> PathBuf {
    if let Ok(p) = std::env::var("ONETONE_AGENT_MEMORY_DB") {
        let path = PathBuf::from(p);
        if let Some(parent) = path.parent() {
            let _ = fs::create_dir_all(parent);
        }
        return path;
    }
    #[cfg(windows)]
    {
        let base = std::env::var_os("LOCALAPPDATA")
            .map(PathBuf::from)
            .unwrap_or_else(|| PathBuf::from("."));
        let dir = base.join("OneTone").join("data");
        let _ = fs::create_dir_all(&dir);
        return dir.join("agent-memory.sqlite3");
    }
    #[cfg(not(windows))]
    {
        let dir = dirs_next_or_home().join("OneTone").join("data");
        let _ = fs::create_dir_all(&dir);
        dir.join("agent-memory.sqlite3")
    }
}

#[cfg(not(windows))]
fn dirs_next_or_home() -> PathBuf {
    std::env::var_os("XDG_DATA_HOME")
        .map(PathBuf::from)
        .or_else(|| std::env::var_os("HOME").map(|h| PathBuf::from(h).join(".local").join("share")))
        .unwrap_or_else(|| PathBuf::from("."))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn path_ends_with_db_name() {
        let p = agent_memory_db_path();
        assert!(p
            .file_name()
            .and_then(|s| s.to_str())
            .unwrap_or("")
            .contains("agent-memory"));
    }
}
