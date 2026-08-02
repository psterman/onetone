use std::fs::{self, File, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::OnceLock;

use regex::Regex;
use zip::write::SimpleFileOptions;
use zip::ZipWriter;

use crate::config;
use crate::AppState;

pub const LOG_RING_CAPACITY: usize = 1000;

fn sanitize_text(text: &str) -> String {
    static RE: OnceLock<Regex> = OnceLock::new();
    let re = RE.get_or_init(|| Regex::new(r"(?i)C:\\Users\\[^\\]+").unwrap());
    re.replace_all(text, r"C:\Users\<USER>").to_string()
}

pub fn sanitize_path(p: &Path) -> String {
    sanitize_text(&p.to_string_lossy())
}

fn now_label() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs().to_string())
        .unwrap_or_else(|_| "0".into())
}

pub fn early_line(source: &str, message: &str) {
    let line = format!("[{}] [{source}] {}", now_label(), sanitize_text(message));
    // Compatibility path — still multi-dir sync. Prefer enqueue_* / sync_emergency_line.
    append_live_log(&line);
}

/// Panic-/hang-safe: one file, no locks, no channel. Never call from async logger.
pub fn sync_emergency_line(source: &str, message: &str) {
    let line = format!("[{}] [{source}] {}", now_label(), sanitize_text(message));
    let dir = crate::data_root::effective_logs_dir();
    let _ = fs::create_dir_all(&dir);
    let path = dir.join("runtime-live.log");
    if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(path) {
        let _ = writeln!(file, "{line}");
    }
}

/// Alias for panic hook — must not use async writer or multi-dir early_line.
pub fn panic_line(message: &str) {
    sync_emergency_line("panic", message);
}

#[derive(Clone, Copy, PartialEq, Eq)]
pub enum LogPriority {
    High,
    Normal,
}

pub fn log_line(state: &AppState, source: &str, message: &str) {
    log_line_with_priority(state, source, message, LogPriority::Normal);
}

pub fn log_line_high(state: &AppState, source: &str, message: &str) {
    log_line_with_priority(state, source, message, LogPriority::High);
}

fn log_line_with_priority(state: &AppState, source: &str, message: &str, prio: LogPriority) {
    let line = format!("[{}] [{source}] {}", now_label(), sanitize_text(message));
    {
        let mut ring = state.log_ring.lock();
        if ring.len() >= LOG_RING_CAPACITY {
            ring.pop_front();
        }
        ring.push_back(line.clone());
    } // release log_ring before disk / channel
    enqueue_live_log(line, prio);
}

fn append_live_log(line: &str) {
    // Legacy sync multi-dir — used only by early_line until callers migrate.
    if let Some(dir) = live_log_dirs().into_iter().next() {
        let _ = fs::create_dir_all(&dir);
        let path = dir.join("runtime-live.log");
        if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(path) {
            let _ = writeln!(file, "{line}");
        }
    }
}

const NORMAL_QUEUE_CAP: usize = 2048;
const HIGH_QUEUE_CAP: usize = 512;
const MAX_LOG_BYTES: u64 = 32 * 1024 * 1024;

struct LogQueues {
    high: std::sync::Mutex<std::collections::VecDeque<String>>,
    normal: std::sync::Mutex<std::collections::VecDeque<String>>,
    wake: std::sync::Condvar,
    shutdown: AtomicBool,
}

use std::sync::atomic::{AtomicBool, Ordering};

static LOG_Q: OnceLock<std::sync::Arc<LogQueues>> = OnceLock::new();
static WRITER_STARTED: AtomicBool = AtomicBool::new(false);

fn log_queues() -> &'static std::sync::Arc<LogQueues> {
    LOG_Q.get_or_init(|| {
        std::sync::Arc::new(LogQueues {
            high: std::sync::Mutex::new(std::collections::VecDeque::with_capacity(HIGH_QUEUE_CAP)),
            normal: std::sync::Mutex::new(std::collections::VecDeque::with_capacity(NORMAL_QUEUE_CAP)),
            wake: std::sync::Condvar::new(),
            shutdown: AtomicBool::new(false),
        })
    })
}

fn enqueue_live_log(line: String, prio: LogPriority) {
    ensure_writer_started();
    let q = log_queues();
    match prio {
        LogPriority::High => {
            if let Ok(mut g) = q.high.lock() {
                if g.len() >= HIGH_QUEUE_CAP {
                    // Merge: drop oldest high only if identical prefix flood; else drop oldest.
                    let _ = g.pop_front();
                }
                g.push_back(line);
            }
        }
        LogPriority::Normal => {
            if let Ok(mut g) = q.normal.lock() {
                if g.len() >= NORMAL_QUEUE_CAP {
                    let _ = g.pop_front();
                } else {
                    g.push_back(line);
                    q.wake.notify_one();
                    return;
                }
                // Dropped under pressure — still notify so high can drain.
            }
        }
    }
    q.wake.notify_one();
}

pub fn ensure_writer_started() {
    if WRITER_STARTED
        .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
        .is_err()
    {
        return;
    }
    let q = std::sync::Arc::clone(log_queues());
    let _ = std::thread::Builder::new()
        .name("app-log-writer".into())
        .spawn(move || writer_loop(q));
}

fn authoritative_log_path() -> PathBuf {
    crate::data_root::effective_logs_dir().join("runtime-live.log")
}

fn rotate_if_needed(path: &Path) {
    let Ok(meta) = fs::metadata(path) else {
        return;
    };
    if meta.len() < MAX_LOG_BYTES {
        return;
    }
    let bak = path.with_extension("log.1");
    let _ = fs::remove_file(&bak);
    let _ = fs::rename(path, &bak);
}

fn writer_loop(q: std::sync::Arc<LogQueues>) {
    let dir = crate::data_root::effective_logs_dir();
    let _ = fs::create_dir_all(&dir);
    let path = authoritative_log_path();
    loop {
        let line = {
            let mut high = q.high.lock().unwrap_or_else(|e| e.into_inner());
            if let Some(l) = high.pop_front() {
                drop(high);
                Some(l)
            } else {
                drop(high);
                let mut normal = q.normal.lock().unwrap_or_else(|e| e.into_inner());
                if let Some(l) = normal.pop_front() {
                    drop(normal);
                    Some(l)
                } else {
                    if q.shutdown.load(Ordering::SeqCst) {
                        break;
                    }
                    let (n2, _) = q
                        .wake
                        .wait_timeout(normal, std::time::Duration::from_millis(500))
                        .unwrap_or_else(|e| e.into_inner());
                    drop(n2);
                    None
                }
            }
        };
        let Some(line) = line else {
            if q.shutdown.load(Ordering::SeqCst) {
                break;
            }
            continue;
        };
        rotate_if_needed(&path);
        if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(&path) {
            let _ = writeln!(file, "{line}");
        }
    }
}

/// Best-effort flush on process exit (bounded).
pub fn shutdown_writer(timeout: std::time::Duration) {
    let q = log_queues();
    q.shutdown.store(true, Ordering::SeqCst);
    q.wake.notify_all();
    let start = std::time::Instant::now();
    while start.elapsed() < timeout {
        let high_empty = q.high.lock().map(|g| g.is_empty()).unwrap_or(true);
        let normal_empty = q.normal.lock().map(|g| g.is_empty()).unwrap_or(true);
        if high_empty && normal_empty {
            break;
        }
        std::thread::sleep(std::time::Duration::from_millis(20));
    }
}

fn dump_ring(state: &AppState) -> String {
    let ring = state.log_ring.lock();
    ring.iter().cloned().collect::<Vec<_>>().join("\n")
}

fn diagnostic_export_dir() -> Result<PathBuf, String> {
    if let Ok(dir) = std::env::var("ONETONE_LOG_DIR") {
        let path = PathBuf::from(dir);
        if !path.as_os_str().is_empty() {
            return Ok(path);
        }
    }
    Ok(crate::data_root::effective_logs_dir())
}

fn live_log_dirs() -> Vec<PathBuf> {
    // Single authoritative dir for early_line sync path.
    vec![crate::data_root::effective_logs_dir()]
}

fn optional_launch_log() -> Option<PathBuf> {
    let exe = std::env::current_exe().ok()?;
    let candidate = exe.parent()?.parent()?.join("logs").join("launch.log");
    if candidate.is_file() {
        Some(candidate)
    } else {
        None
    }
}

pub fn export_diagnostic_zip(
    state: &AppState,
    frontend_lines: &[String],
) -> Result<PathBuf, String> {
    let logs_dir = diagnostic_export_dir()?;
    fs::create_dir_all(&logs_dir).map_err(|e| e.to_string())?;

    let zip_path = logs_dir.join(format!("onetone-diagnostics-{}.zip", now_label()));
    let file = File::create(&zip_path).map_err(|e| e.to_string())?;
    let mut zip = ZipWriter::new(file);
    let options = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);

    let runtime = dump_ring(state);
    zip.start_file("runtime.log", options)
        .map_err(|e| e.to_string())?;
    zip.write_all(runtime.as_bytes())
        .map_err(|e| e.to_string())?;

    if !frontend_lines.is_empty() {
        let fe = sanitize_text(&frontend_lines.join("\n"));
        zip.start_file("frontend-events.log", options)
            .map_err(|e| e.to_string())?;
        zip.write_all(fe.as_bytes()).map_err(|e| e.to_string())?;
    }

    let cfg_path = config::config_path();
    if cfg_path.is_file() {
        let raw = fs::read_to_string(&cfg_path).map_err(|e| e.to_string())?;
        let redacted = sanitize_text(&raw);
        zip.start_file("settings-redacted.json", options)
            .map_err(|e| e.to_string())?;
        zip.write_all(redacted.as_bytes())
            .map_err(|e| e.to_string())?;
    }

    if let Some(launch_log) = optional_launch_log() {
        if let Ok(raw) = fs::read_to_string(&launch_log) {
            let redacted = sanitize_text(&raw);
            zip.start_file("launch.log", options)
                .map_err(|e| e.to_string())?;
            zip.write_all(redacted.as_bytes())
                .map_err(|e| e.to_string())?;
        }
    }

    zip.finish().map_err(|e| e.to_string())?;
    log_line(
        state,
        "export",
        &format!("diagnostics exported to {}", sanitize_path(&zip_path)),
    );
    Ok(zip_path)
}
