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
    let line = format!(
        "[{}] [{source}] {}",
        now_label(),
        sanitize_text(message)
    );
    append_live_log(&line);
}

pub fn log_line(state: &AppState, source: &str, message: &str) {
    let line = format!(
        "[{}] [{source}] {}",
        now_label(),
        sanitize_text(message)
    );
    let mut ring = state.log_ring.lock();
    if ring.len() >= LOG_RING_CAPACITY {
        ring.pop_front();
    }
    ring.push_back(line.clone());
    append_live_log(&line);
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
    let cfg = config::config_path();
    let base = cfg
        .parent()
        .and_then(|p| p.parent())
        .ok_or_else(|| "invalid config path".to_string())?;
    Ok(base.join("logs"))
}

fn append_live_log(line: &str) {
    for logs_dir in live_log_dirs() {
        if fs::create_dir_all(&logs_dir).is_err() {
            continue;
        }
        let path = logs_dir.join("runtime-live.log");
        if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(path) {
            let _ = writeln!(file, "{line}");
        }
    }
}

fn live_log_dirs() -> Vec<PathBuf> {
    let mut out = Vec::new();
    if let Ok(dir) = std::env::var("ONETONE_LOG_DIR") {
        let path = PathBuf::from(dir);
        if !path.as_os_str().is_empty() {
            out.push(path);
        }
    }
    if let Ok(exe) = std::env::current_exe() {
        if let Some(parent) = exe.parent() {
            out.push(parent.join("logs"));
            if let Some(grandparent) = parent.parent() {
                out.push(grandparent.join("logs"));
            }
        }
    }
    if let Ok(cwd) = std::env::current_dir() {
        out.push(cwd.join("logs"));
    }
    out.sort();
    out.dedup();
    out
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
