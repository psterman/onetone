//! Download and install Vosk speech models into the local resources folder.

use std::fs::{self, File};
use std::io::{copy, Read, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use tauri::AppHandle;
use zip::ZipArchive;

use crate::voice_vosk::{model_dir_valid, vosk_model_download_url, vosk_resources_dir};
use crate::AppState;

static DOWNLOAD_RUNNING: AtomicBool = AtomicBool::new(false);

pub fn model_dir_name(preset: &str) -> Option<&'static str> {
    match preset.trim() {
        "cn-light" => Some("vosk-model-small-cn-0.22"),
        "en-light" => Some("vosk-model-small-en-us-0.15"),
        _ => None,
    }
}

fn emit_download(app: &AppHandle, payload: serde_json::Value) {
    crate::ipc::emit_to_main_if_available(app, None, payload);
}

pub fn download_in_progress() -> bool {
    DOWNLOAD_RUNNING.load(Ordering::SeqCst)
}

pub fn start_vosk_model_download(
    app: AppHandle,
    state: Arc<AppState>,
    preset: String,
    resource_dir: Option<PathBuf>,
) -> Result<serde_json::Value, String> {
    let preset = preset.trim().to_string();
    if preset.is_empty() {
        return Err("preset required".into());
    }
    let dir_name = model_dir_name(&preset).ok_or_else(|| format!("unsupported preset: {preset}"))?;

    let base = vosk_resources_dir(resource_dir.as_deref());
    let dest = base.join(dir_name);
    if model_dir_valid(&dest) {
        crate::voice_vosk_runtime::refresh_vosk_probe_cache(state.as_ref(), resource_dir.as_deref());
        if state.cfg.lock().voice_vosk.enabled {
            let _ = crate::voice_vosk_runtime::voice_vosk_retry_start(
                &state,
                resource_dir.clone(),
            );
        }
        return Ok(serde_json::json!({
            "ok": true,
            "alreadyPresent": true,
            "preset": preset,
            "path": dest.display().to_string(),
        }));
    }

    let url = vosk_model_download_url(&preset)
        .ok_or_else(|| format!("no download url for preset: {preset}"))?;

    if DOWNLOAD_RUNNING.swap(true, Ordering::SeqCst) {
        return Ok(serde_json::json!({
            "ok": false,
            "reason": "already_running"
        }));
    }

    let preset_for_thread = preset.clone();
    let app2 = app.clone();
    std::thread::Builder::new()
        .name("vosk-model-download".into())
        .spawn(move || {
            let result = download_and_install(
                &app2,
                &preset_for_thread,
                url,
                dir_name,
                resource_dir.as_deref(),
            );
            DOWNLOAD_RUNNING.store(false, Ordering::SeqCst);
            match result {
                Ok(path) => {
                    emit_download(
                        &app2,
                        serde_json::json!({
                            "type": "mvp_vosk_download",
                            "phase": "done",
                            "ok": true,
                            "preset": preset_for_thread,
                            "path": path.display().to_string(),
                        }),
                    );
                    crate::voice_vosk_runtime::refresh_vosk_probe_cache(
                        state.as_ref(),
                        resource_dir.as_deref(),
                    );
                    if state.cfg.lock().voice_vosk.enabled {
                        let _ = crate::voice_vosk_runtime::voice_vosk_retry_start(
                            &state,
                            resource_dir.clone(),
                        );
                    }
                }
                Err(err) => {
                    emit_download(
                        &app2,
                        serde_json::json!({
                            "type": "mvp_vosk_download",
                            "phase": "error",
                            "ok": false,
                            "preset": preset_for_thread,
                            "error": err,
                        }),
                    );
                }
            }
        })
        .map_err(|e| {
            DOWNLOAD_RUNNING.store(false, Ordering::SeqCst);
            e.to_string()
        })?;

    Ok(serde_json::json!({
        "ok": true,
        "started": true,
        "preset": preset,
    }))
}

fn download_and_install(
    app: &AppHandle,
    preset: &str,
    url: &str,
    dir_name: &str,
    resource_dir: Option<&Path>,
) -> Result<PathBuf, String> {
    let base = vosk_resources_dir(resource_dir);
    fs::create_dir_all(&base).map_err(|e| e.to_string())?;
    let downloads = base.join("downloads");
    fs::create_dir_all(&downloads).map_err(|e| e.to_string())?;

    let zip_path = downloads.join(format!("{dir_name}.zip"));
    let dest = base.join(dir_name);

    if model_dir_valid(&dest) {
        return Ok(dest);
    }

    emit_download(
        app,
        serde_json::json!({
            "type": "mvp_vosk_download",
            "phase": "downloading",
            "ok": true,
            "preset": preset,
            "percent": 0,
        }),
    );

    download_file(app, url, &zip_path, preset)?;

    emit_download(
        app,
        serde_json::json!({
            "type": "mvp_vosk_download",
            "phase": "extracting",
            "ok": true,
            "preset": preset,
            "percent": 100,
        }),
    );

    let extract_root = downloads.join(format!("{dir_name}_extract"));
    if extract_root.exists() {
        fs::remove_dir_all(&extract_root).map_err(|e| e.to_string())?;
    }
    fs::create_dir_all(&extract_root).map_err(|e| e.to_string())?;
    unzip_archive(&zip_path, &extract_root)?;

    let extracted = resolve_extracted_model_dir(&extract_root, dir_name)?;
    if dest.exists() {
        fs::remove_dir_all(&dest).map_err(|e| e.to_string())?;
    }
    if let Some(parent) = dest.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::rename(&extracted, &dest).map_err(|e| e.to_string())?;
    fs::remove_dir_all(&extract_root).ok();
    fs::remove_file(&zip_path).ok();

    if !model_dir_valid(&dest) {
        return Err("extracted folder is not a valid Vosk model".into());
    }

    Ok(dest)
}

fn download_file(app: &AppHandle, url: &str, dest: &Path, preset: &str) -> Result<(), String> {
    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(600))
        .build()
        .map_err(|e| e.to_string())?;
    let mut response = client.get(url).send().map_err(|e| e.to_string())?;
    if !response.status().is_success() {
        return Err(format!("download failed: HTTP {}", response.status()));
    }
    let total = response.content_length().unwrap_or(0);
    let mut file = File::create(dest).map_err(|e| e.to_string())?;
    let mut downloaded: u64 = 0;
    let mut buf = [0u8; 64 * 1024];
    let mut last_emit = 0u8;

    loop {
        let n = response.read(&mut buf).map_err(|e| e.to_string())?;
        if n == 0 {
            break;
        }
        file.write_all(&buf[..n]).map_err(|e| e.to_string())?;
        downloaded = downloaded.saturating_add(n as u64);
        if total > 0 {
            let pct = ((downloaded.saturating_mul(100)) / total).min(100) as u8;
            if pct >= last_emit.saturating_add(2) || pct == 100 {
                last_emit = pct;
                emit_download(
                    app,
                    serde_json::json!({
                        "type": "mvp_vosk_download",
                        "phase": "downloading",
                        "ok": true,
                        "preset": preset,
                        "percent": pct,
                        "downloaded": downloaded,
                        "total": total,
                    }),
                );
            }
        }
    }
    file.flush().map_err(|e| e.to_string())?;
    Ok(())
}

fn unzip_archive(zip_path: &Path, dest: &Path) -> Result<(), String> {
    let file = File::open(zip_path).map_err(|e| e.to_string())?;
    let mut archive = ZipArchive::new(file).map_err(|e| e.to_string())?;
    for i in 0..archive.len() {
        let mut entry = archive.by_index(i).map_err(|e| e.to_string())?;
        let name = entry.name().to_string();
        let rel = name
            .trim_start_matches("./")
            .trim_start_matches('/');
        if rel.is_empty() || rel.ends_with('/') {
            continue;
        }
        let out = dest.join(rel);
        if let Some(parent) = out.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        if !out.starts_with(dest) {
            return Err("unsafe zip entry path".into());
        }
        let mut out_file = File::create(&out).map_err(|e| e.to_string())?;
        copy(&mut entry, &mut out_file).map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn resolve_extracted_model_dir(extract_root: &Path, dir_name: &str) -> Result<PathBuf, String> {
    let direct = extract_root.join(dir_name);
    if model_dir_valid(&direct) {
        return Ok(direct);
    }
    if model_dir_valid(extract_root) {
        return Ok(extract_root.to_path_buf());
    }
    let mut found: Option<PathBuf> = None;
    if let Ok(entries) = fs::read_dir(extract_root) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() && model_dir_valid(&path) {
                if found.is_some() {
                    return Err("multiple model folders in zip".into());
                }
                found = Some(path);
            }
        }
    }
    found.ok_or_else(|| "could not find model folder in zip".into())
}
