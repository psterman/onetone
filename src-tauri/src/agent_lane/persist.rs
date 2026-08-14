//! Soft Pad session lane persistence — cold hydrate + 24h GC.

use super::focus_session::session_persist_enabled;
use super::model::AgentLane;
use super::store::{all_lanes_snapshot, restore_lane_cold};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Mutex};
use std::time::{Duration, Instant};

const DEBOUNCE_MS: u64 = 1000;
const GC_MAX_AGE_MS: u64 = 24 * 60 * 60 * 1000;
const GC_INTERVAL: Duration = Duration::from_secs(60 * 60);

static LAST_WRITE_SCHEDULE: Mutex<Option<Instant>> = Mutex::new(None);
static HYDRATED: AtomicBool = AtomicBool::new(false);
static LAST_GC: Mutex<Option<Instant>> = Mutex::new(None);

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct PersistFile {
    version: u32,
    lanes: Vec<AgentLane>,
}

fn store_path() -> PathBuf {
    crate::config::config_path()
        .parent()
        .map(|p| p.join("soft-pad-sessions.json"))
        .unwrap_or_else(|| PathBuf::from("soft-pad-sessions.json"))
}

fn bak_path() -> PathBuf {
    crate::config::config_path()
        .parent()
        .map(|p| p.join("soft-pad-sessions.json.bak"))
        .unwrap_or_else(|| PathBuf::from("soft-pad-sessions.json.bak"))
}

fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn read_file(path: &Path) -> Option<PersistFile> {
    let raw = fs::read_to_string(path).ok()?;
    serde_json::from_str(&raw).ok()
}

fn atomic_write(path: &Path, body: &str) -> Result<(), String> {
    let parent = path.parent().ok_or("no_parent")?;
    fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    let tmp = parent.join(format!(
        "{}.tmp",
        path.file_name()
            .and_then(|s| s.to_str())
            .unwrap_or("soft-pad-sessions")
    ));
    fs::write(&tmp, body).map_err(|e| e.to_string())?;
    #[cfg(windows)]
    {
        let _ = fs::remove_file(path);
    }
    fs::rename(&tmp, path).map_err(|e| e.to_string())?;
    let bak = bak_path();
    let _ = fs::copy(path, &bak);
    Ok(())
}

/// Boot: load sessions as cold hints; never resurrect sticky red/yellow as live.
pub fn hydrate_on_boot() {
    if HYDRATED.swap(true, Ordering::AcqRel) {
        return;
    }
    if !session_persist_enabled() {
        return;
    }
    let primary = store_path();
    let data = read_file(&primary).or_else(|| read_file(&bak_path()));
    let Some(file) = data else {
        return;
    };
    let now = now_ms();
    for lane in file.lanes {
        if now.saturating_sub(lane.updated_at) > GC_MAX_AGE_MS {
            continue;
        }
        restore_lane_cold(lane);
    }
    gc_now();
}

/// Schedule debounced write (1s).
pub fn schedule_persist() {
    if !session_persist_enabled() {
        return;
    }
    let mut g = LAST_WRITE_SCHEDULE
        .lock()
        .unwrap_or_else(|e| e.into_inner());
    *g = Some(Instant::now());
    drop(g);
    // Fire after debounce on a background thread (ponytail: timer per schedule; upgrade to shared worker).
    std::thread::spawn(|| {
        std::thread::sleep(Duration::from_millis(DEBOUNCE_MS + 50));
        let due = {
            let g = LAST_WRITE_SCHEDULE
                .lock()
                .unwrap_or_else(|e| e.into_inner());
            match *g {
                Some(t) if t.elapsed() >= Duration::from_millis(DEBOUNCE_MS) => true,
                _ => false,
            }
        };
        if due {
            let _ = flush_now();
        }
        maybe_periodic_gc();
    });
}

pub fn flush_now() -> Result<(), String> {
    if !session_persist_enabled() {
        return Ok(());
    }
    let lanes = all_lanes_snapshot();
    let file = PersistFile {
        version: 1,
        lanes,
    };
    let body = serde_json::to_string_pretty(&file).map_err(|e| e.to_string())?;
    atomic_write(&store_path(), &body)
}

pub fn gc_now() {
    if !session_persist_enabled() {
        return;
    }
    let now = now_ms();
    let all = all_lanes_snapshot();
    for l in all {
        if now.saturating_sub(l.updated_at) > GC_MAX_AGE_MS {
            super::store::remove_lane(&l.lane_id);
        }
    }
    let _ = flush_now();
}

fn maybe_periodic_gc() {
    let mut g = LAST_GC.lock().unwrap_or_else(|e| e.into_inner());
    let now = Instant::now();
    if let Some(prev) = *g {
        if now.duration_since(prev) < GC_INTERVAL {
            return;
        }
    }
    *g = Some(now);
    drop(g);
    gc_now();
}

/// Hook from lane ingest.
pub fn on_lane_changed() {
    schedule_persist();
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::agent_lane::focus_session::set_session_persist_enabled;
    use crate::agent_lane::model::{LaneKey, LaneState, NavigationTarget};
    use crate::soft_pad_runtime::AgentKind;

    #[test]
    fn cold_restore_demotes_needs_input() {
        set_session_persist_enabled(true);
        crate::agent_lane::store::reset_for_test();
        let lane = AgentLane {
            lane_id: "codex:session:cold1".into(),
            key: LaneKey {
                provider: AgentKind::Codex,
                workspace_id: "w".into(),
                session_id: "cold1".into(),
            },
            subagent_id: None,
            title: None,
            state: LaneState::NeedsInput,
            source: "hook".into(),
            confidence: "high".into(),
            first_seen_at: 1,
            updated_at: now_ms(),
            acknowledged_at: None,
            done_at: None,
            navigation: NavigationTarget {
                cwd: "C:/x".into(),
                host_pid: 0,
                terminal_hwnd: 12345,
                terminal_title: String::new(),
            },
            subagent_summary: vec![],
            sequence: 1,
        };
        restore_lane_cold(lane);
        let got = crate::agent_lane::store::get_lane("codex:session:cold1").unwrap();
        assert_eq!(got.state, LaneState::Idle);
        assert_eq!(got.navigation.terminal_hwnd, 0);
        assert!(got.source.starts_with("cold:"));
    }
}
