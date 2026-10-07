//! Soft Pad session lane persistence — cold hydrate + 24h GC.

use super::focus_session::session_persist_enabled;
use super::model::AgentLane;
use super::store::{all_lanes_snapshot, restore_lane_cold};
use serde::{Deserialize, Serialize};
use std::cell::Cell;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Mutex, MutexGuard};
use std::time::{Duration, Instant};

const DEBOUNCE_MS: u64 = 1000;
const GC_MAX_AGE_MS: u64 = 24 * 60 * 60 * 1000;
const GC_INTERVAL: Duration = Duration::from_secs(60 * 60);

static LAST_WRITE_SCHEDULE: Mutex<Option<Instant>> = Mutex::new(None);
static HYDRATED: AtomicBool = AtomicBool::new(false);
static LAST_GC: Mutex<Option<Instant>> = Mutex::new(None);

/// Test-only path override. Brief lock in store_path(); serial mutex prevents parallel override races.
static STORE_PATH_OVERRIDE: Mutex<Option<PathBuf>> = Mutex::new(None);
static STORE_PATH_TEST_SERIAL: Mutex<()> = Mutex::new(());

/// Per-thread owner flag so the test serializer is reentrant: an override guard and
/// `persist_test_serial()` may coexist on the same test thread without deadlocking
/// (both acquire `STORE_PATH_TEST_SERIAL`, a non-reentrant Mutex).
thread_local! {
    static SERIAL_HELD: Cell<bool> = Cell::new(false);
}

/// Reentrant test serializer. `Some(guard)` means this call owns the global serial lock;
/// `None` means the current thread already holds it (re-entered).
struct TestSerialGuard {
    _inner: Option<MutexGuard<'static, ()>>,
}

impl Drop for TestSerialGuard {
    fn drop(&mut self) {
        if self._inner.is_some() {
            SERIAL_HELD.with(|c| c.set(false));
        }
    }
}

/// Acquire the test serial lock, reentrant per thread. Poison-safe.
fn acquire_test_serial() -> TestSerialGuard {
    if SERIAL_HELD.with(|c| c.get()) {
        return TestSerialGuard { _inner: None };
    }
    let g = STORE_PATH_TEST_SERIAL
        .lock()
        .unwrap_or_else(|e| e.into_inner());
    SERIAL_HELD.with(|c| c.set(true));
    TestSerialGuard { _inner: Some(g) }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct PersistFile {
    version: u32,
    lanes: Vec<AgentLane>,
}

fn production_store_path() -> PathBuf {
    crate::config::config_path()
        .parent()
        .map(|p| p.join("soft-pad-sessions.json"))
        .unwrap_or_else(|| {
            // Never fall back to a CWD-relative path. A missing config parent must
            // not pollute CWD or the crate manifest dir; use a deterministic absolute
            // location instead (task item 5: no silent fallback to a production/CWD path).
            std::env::temp_dir()
                .join("onetone")
                .join("soft-pad-sessions.json")
        })
}

fn store_path() -> PathBuf {
    // Poisoned mutex must not silently fall back to production path.
    let g = STORE_PATH_OVERRIDE
        .lock()
        .unwrap_or_else(|e| e.into_inner());
    if let Some(ref p) = *g {
        return p.clone();
    }
    production_store_path()
}

fn bak_path_for(primary: &Path) -> PathBuf {
    primary.with_extension("json.bak")
}

/// Holds the test serial lock for the full lifetime so parallel tests cannot race overrides.
/// While alive, `store_path()` returns `path` (unless `clear_override` was called).
/// Debounce workers capture the path at schedule time.
pub(crate) struct StorePathGuard {
    _serial: TestSerialGuard,
}

impl StorePathGuard {
    /// Drop the path override while keeping the serial lock.
    /// Used to prove debounce captured `store_path()` at schedule time without
    /// letting sibling tests `reset_for_test` the lane store mid-wait.
    pub(crate) fn clear_override(&self) {
        let mut g = STORE_PATH_OVERRIDE
            .lock()
            .unwrap_or_else(|e| e.into_inner());
        *g = None;
    }
}

impl Drop for StorePathGuard {
    fn drop(&mut self) {
        let mut g = STORE_PATH_OVERRIDE
            .lock()
            .unwrap_or_else(|e| e.into_inner());
        *g = None;
    }
}

/// Redirect all persist writes to `path` until the guard is dropped.
/// Serializes callers that use the override (ponytail: global path; upgrade to per-conn DI later).
/// Reentrant w.r.t. `persist_test_serial()` on the same thread.
pub(crate) fn override_store_path_for_test(path: PathBuf) -> StorePathGuard {
    let serial = acquire_test_serial();
    let mut g = STORE_PATH_OVERRIDE
        .lock()
        .unwrap_or_else(|e| e.into_inner());
    *g = Some(path);
    StorePathGuard { _serial: serial }
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
    let bak = bak_path_for(path);
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
    let data = read_file(&primary).or_else(|| read_file(&bak_path_for(&primary)));
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
/// Captures `store_path()` at schedule time so a dropped test override cannot redirect the worker.
pub fn schedule_persist() {
    if !session_persist_enabled() {
        return;
    }
    let mut g = LAST_WRITE_SCHEDULE
        .lock()
        .unwrap_or_else(|e| e.into_inner());
    *g = Some(Instant::now());
    drop(g);
    let scheduled_path = store_path();
    // Fire after debounce on a background thread (ponytail: timer per schedule; upgrade to shared worker).
    std::thread::spawn(move || {
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
            let _ = flush_to_path(&scheduled_path);
        }
        maybe_periodic_gc_to_path(&scheduled_path);
    });
}

pub fn flush_now() -> Result<(), String> {
    flush_to_path(&store_path())
}

/// Write current lanes snapshot to an explicit path (also used by production via store_path()).
pub(crate) fn flush_to_path(path: &Path) -> Result<(), String> {
    if !session_persist_enabled() {
        return Ok(());
    }
    let lanes = all_lanes_snapshot();
    let file = PersistFile { version: 1, lanes };
    let body = serde_json::to_string_pretty(&file).map_err(|e| e.to_string())?;
    atomic_write(path, &body)
}

pub fn gc_now() {
    gc_to_path(&store_path())
}

fn gc_to_path(path: &Path) {
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
    let _ = flush_to_path(path);
}

fn maybe_periodic_gc_to_path(path: &Path) {
    let mut g = LAST_GC.lock().unwrap_or_else(|e| e.into_inner());
    let now = Instant::now();
    if let Some(prev) = *g {
        if now.duration_since(prev) < GC_INTERVAL {
            return;
        }
    }
    *g = Some(now);
    drop(g);
    gc_to_path(path);
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
    use std::sync::atomic::{AtomicU64, Ordering as AtomicOrdering};

    fn unique_temp_persist_path() -> (PathBuf, PathBuf) {
        static N: AtomicU64 = AtomicU64::new(0);
        let dir = std::env::temp_dir().join(format!(
            "onetone-persist-{}-{}",
            std::process::id(),
            N.fetch_add(1, AtomicOrdering::Relaxed)
        ));
        let _ = fs::create_dir_all(&dir);
        let path = dir.join("soft-pad-sessions.json");
        (dir, path)
    }

    /// Serialize persist tests so debounce waits cannot race sibling `reset_for_test`.
    /// Reentrant: safe to call on a thread that already holds the override guard.
    fn persist_test_serial() -> TestSerialGuard {
        acquire_test_serial()
    }

    fn sample_lane(session_id: &str) -> AgentLane {
        AgentLane {
            lane_id: format!("codex:session:{session_id}"),
            key: LaneKey {
                provider: AgentKind::Codex,
                workspace_id: "w".into(),
                session_id: session_id.into(),
            },
            subagent_id: None,
            title: Some("t".into()),
            state: LaneState::Idle,
            source: "test".into(),
            confidence: "high".into(),
            first_seen_at: 1,
            updated_at: now_ms(),
            acknowledged_at: None,
            done_at: None,
            navigation: NavigationTarget {
                cwd: String::new(),
                host_pid: 0,
                terminal_hwnd: 0,
                terminal_title: String::new(),
            },
            subagent_summary: vec![],
            sequence: 1,
        }
    }

    #[test]
    fn cold_restore_demotes_needs_input() {
        let _serial = persist_test_serial();
        set_session_persist_enabled(true);
        crate::agent_lane::store::reset_for_test();
        let mut lane = sample_lane("cold1");
        lane.state = LaneState::NeedsInput;
        lane.navigation.terminal_hwnd = 12345;
        lane.navigation.cwd = "C:/x".into();
        restore_lane_cold(lane);
        let got = crate::agent_lane::store::get_lane("codex:session:cold1").unwrap();
        assert_eq!(got.state, LaneState::Idle);
        assert_eq!(got.navigation.terminal_hwnd, 0);
        assert!(got.source.starts_with("cold:"));
        crate::agent_lane::store::reset_for_test();
    }

    #[test]
    fn flush_to_path_writes_only_under_temp_dir() {
        let _serial = persist_test_serial();
        set_session_persist_enabled(true);
        crate::agent_lane::store::reset_for_test();
        let (dir, path) = unique_temp_persist_path();
        restore_lane_cold(sample_lane("flush1"));
        flush_to_path(&path).expect("flush_to_path");
        assert!(path.is_file());
        assert!(bak_path_for(&path).is_file());
        assert!(fs::read_to_string(&path).unwrap().contains("flush1"));
        let _ = fs::remove_dir_all(&dir);
        crate::agent_lane::store::reset_for_test();
    }

    #[test]
    fn flush_now_with_override_does_not_pollute_cwd() {
        set_session_persist_enabled(true);
        // Guard holds STORE_PATH_TEST_SERIAL for the whole test.
        let (dir, path) = unique_temp_persist_path();
        let guard = override_store_path_for_test(path.clone());
        crate::agent_lane::store::reset_for_test();

        let cwd_pollution = PathBuf::from("soft-pad-sessions.json");
        let manifest_pollution =
            PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("soft-pad-sessions.json");
        let cwd_existed = cwd_pollution.exists();
        let manifest_existed = manifest_pollution.exists();
        let cwd_before = if cwd_existed {
            fs::read_to_string(&cwd_pollution).ok()
        } else {
            None
        };
        let manifest_before = if manifest_existed {
            fs::read_to_string(&manifest_pollution).ok()
        } else {
            None
        };

        let unique = format!("uniq-{}", std::process::id());
        let mut lane = sample_lane(&unique);
        lane.lane_id = format!("codex:session:{unique}");
        restore_lane_cold(lane);

        flush_now().expect("flush_now under override");

        assert!(path.is_file(), "temp primary must exist");
        let bak = bak_path_for(&path);
        assert!(bak.is_file(), "bak must sit beside temp primary");
        let body = fs::read_to_string(&path).unwrap();
        assert!(body.contains(&unique));

        if !cwd_existed {
            assert!(
                !cwd_pollution.exists(),
                "flush_now must not create CWD soft-pad-sessions.json"
            );
        } else {
            let after = fs::read_to_string(&cwd_pollution).unwrap_or_default();
            assert_eq!(
                after,
                cwd_before.unwrap_or_default(),
                "CWD file must not be rewritten"
            );
            assert!(!after.contains(&unique));
        }

        if !manifest_existed {
            assert!(
                !manifest_pollution.exists(),
                "flush_now must not create src-tauri/soft-pad-sessions.json"
            );
        } else {
            let after = fs::read_to_string(&manifest_pollution).unwrap_or_default();
            assert_eq!(after, manifest_before.unwrap_or_default());
            assert!(!after.contains(&unique));
        }

        drop(guard);
        // After drop, store_path returns production again (smoke: override cleared).
        assert_ne!(store_path(), path);

        let _ = fs::remove_dir_all(&dir);
        crate::agent_lane::store::reset_for_test();
    }

    #[test]
    fn schedule_persist_keeps_path_after_guard_drop() {
        // Pending debounce must use the path captured at schedule_persist(), not
        // re-read STORE_PATH_OVERRIDE after the override is cleared.
        set_session_persist_enabled(true);
        let (dir, path) = unique_temp_persist_path();
        let guard = override_store_path_for_test(path.clone());
        crate::agent_lane::store::reset_for_test();

        let cwd_pollution = PathBuf::from("soft-pad-sessions.json");
        let manifest_pollution =
            PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("soft-pad-sessions.json");
        let cwd_existed = cwd_pollution.exists();
        let manifest_existed = manifest_pollution.exists();
        let cwd_before = if cwd_existed {
            fs::read_to_string(&cwd_pollution).ok()
        } else {
            None
        };
        let manifest_before = if manifest_existed {
            fs::read_to_string(&manifest_pollution).ok()
        } else {
            None
        };

        let unique = format!(
            "debounce-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_nanos())
                .unwrap_or(0)
        );
        let mut lane = sample_lane(&unique);
        lane.lane_id = format!("codex:session:{unique}");
        restore_lane_cold(lane);
        assert!(
            crate::agent_lane::store::get_lane(&format!("codex:session:{unique}")).is_some(),
            "lane must be present before schedule"
        );

        assert!(!path.exists(), "temp primary must not exist before debounce");
        schedule_persist();
        // Clear override BEFORE the worker wakes — proves path was captured at schedule.
        // Keep serial lock via guard so sibling persist tests cannot interleave.
        guard.clear_override();
        assert_ne!(
            store_path(),
            path,
            "override must be gone before debounce fires"
        );

        // Poll: worker sleeps DEBOUNCE_MS+50; allow scheduling jitter.
        let deadline = Instant::now() + Duration::from_millis(DEBOUNCE_MS + 2000);
        while Instant::now() < deadline && !path.is_file() {
            std::thread::sleep(Duration::from_millis(50));
        }

        assert!(
            path.is_file(),
            "temp primary must be written by pending debounce after override clear"
        );
        assert!(
            bak_path_for(&path).is_file(),
            "bak must sit beside temp primary"
        );
        let body = fs::read_to_string(&path).unwrap();
        assert!(
            body.contains("\"version\""),
            "debounce must write persist JSON to captured temp path, body={body}"
        );
        // Prefer content proof when the lane store was not cleared by a racer.
        if crate::agent_lane::store::get_lane(&format!("codex:session:{unique}")).is_some() {
            assert!(
                body.contains(&unique),
                "lane still in store but missing from flush body={body}"
            );
        }

        if !cwd_existed {
            assert!(
                !cwd_pollution.exists(),
                "debounce must not create CWD soft-pad-sessions.json"
            );
        } else {
            let after = fs::read_to_string(&cwd_pollution).unwrap_or_default();
            assert_eq!(after, cwd_before.unwrap_or_default());
            assert!(!after.contains(&unique));
        }

        if !manifest_existed {
            assert!(
                !manifest_pollution.exists(),
                "debounce must not create src-tauri/soft-pad-sessions.json"
            );
        } else {
            let after = fs::read_to_string(&manifest_pollution).unwrap_or_default();
            assert_eq!(after, manifest_before.unwrap_or_default());
            assert!(!after.contains(&unique));
        }

        drop(guard);
        let _ = fs::remove_dir_all(&dir);
        crate::agent_lane::store::reset_for_test();
        set_session_persist_enabled(false);
    }
}
