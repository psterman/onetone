//! Download and install sherpa-onnx KWS models into the local resources folder.

use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use bzip2::read::BzDecoder;
use tar::Archive;
use tauri::AppHandle;

use crate::config::kws_model_download_url;
use crate::voice_kws::{discover_kws_assets, kws_resources_dir, resolve_kws_model_dir};
use crate::AppState;

static DOWNLOAD_RUNNING: AtomicBool = AtomicBool::new(false);

const KWS_DEST_DIR: &str = "sherpa-kws-zh-small";

fn emit_download(app: &AppHandle, payload: serde_json::Value) {
    crate::ipc::emit_to_main_if_available(app, None, payload);
}

pub fn download_in_progress() -> bool {
    DOWNLOAD_RUNNING.load(Ordering::SeqCst)
}

pub fn start_kws_model_download(
    app: AppHandle,
    state: Arc<AppState>,
    preset: String,
    resource_dir: Option<PathBuf>,
) -> Result<serde_json::Value, String> {
    let preset = preset.trim().to_string();
    if preset.is_empty() {
        return Err("preset required".into());
    }
    let url = kws_model_download_url(&preset)
        .ok_or_else(|| format!("unsupported KWS preset: {preset}"))?;

    let cfg = state.cfg.lock();
    let dest = resolve_kws_model_dir(&cfg.voice_kws, resource_dir.as_deref());
    drop(cfg);

    if discover_kws_assets(&dest).is_ok() {
        if state.cfg.lock().voice_kws.enabled {
            let _ = crate::voice_kws_runtime::voice_kws_retry_start(
                &app,
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

    if DOWNLOAD_RUNNING.swap(true, Ordering::SeqCst) {
        return Ok(serde_json::json!({
            "ok": false,
            "reason": "already_running"
        }));
    }

    let preset_for_thread = preset.clone();
    let app2 = app.clone();
    std::thread::Builder::new()
        .name("kws-model-download".into())
        .spawn(move || {
            let result = download_and_install(
                &app2,
                &preset_for_thread,
                url,
                resource_dir.as_deref(),
            );
            DOWNLOAD_RUNNING.store(false, Ordering::SeqCst);
            match result {
                Ok(path) => {
                    emit_download(
                        &app2,
                        serde_json::json!({
                            "type": "mvp_kws_download",
                            "phase": "done",
                            "ok": true,
                            "preset": preset_for_thread,
                            "path": path.display().to_string(),
                        }),
                    );
                    if state.cfg.lock().voice_kws.enabled {
                        let _ = crate::voice_kws_runtime::voice_kws_retry_start(
                            &app2,
                            &state,
                            resource_dir.clone(),
                        );
                    }
                }
                Err(err) => {
                    emit_download(
                        &app2,
                        serde_json::json!({
                            "type": "mvp_kws_download",
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
    resource_dir: Option<&Path>,
) -> Result<PathBuf, String> {
    let base = kws_resources_dir(resource_dir);
    fs::create_dir_all(&base).map_err(|e| e.to_string())?;
    let downloads = base.join("downloads");
    fs::create_dir_all(&downloads).map_err(|e| e.to_string())?;

    let archive_path = downloads.join(format!("{KWS_DEST_DIR}.tar.bz2"));
    let dest = base.join(KWS_DEST_DIR);

    if discover_kws_assets(&dest).is_ok() {
        return Ok(dest);
    }

    emit_download(
        app,
        serde_json::json!({
            "type": "mvp_kws_download",
            "phase": "downloading",
            "ok": true,
            "preset": preset,
            "percent": 0,
        }),
    );

    download_file(app, url, &archive_path, preset)?;

    emit_download(
        app,
        serde_json::json!({
            "type": "mvp_kws_download",
            "phase": "extracting",
            "ok": true,
            "preset": preset,
            "percent": 100,
        }),
    );

    let extract_root = downloads.join(format!("{KWS_DEST_DIR}_extract"));
    if extract_root.exists() {
        fs::remove_dir_all(&extract_root).map_err(|e| e.to_string())?;
    }
    fs::create_dir_all(&extract_root).map_err(|e| e.to_string())?;
    extract_tar_bz2(&archive_path, &extract_root)?;

    let extracted = resolve_extracted_model_dir(&extract_root)?;
    if dest.exists() {
        fs::remove_dir_all(&dest).map_err(|e| e.to_string())?;
    }
    if let Some(parent) = dest.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::rename(&extracted, &dest).map_err(|e| e.to_string())?;
    install_onetone_keywords(&dest)?;
    fs::remove_dir_all(&extract_root).ok();
    fs::remove_file(&archive_path).ok();

    discover_kws_assets(&dest).map(|_| dest).map_err(|e| e)
}

fn install_onetone_keywords(model_dir: &Path) -> Result<(), String> {
    let bundled =
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("resources/kws/onetone-keywords.txt");
    if !bundled.is_file() {
        return Err("bundled onetone-keywords.txt missing".into());
    }
    fs::copy(&bundled, model_dir.join("keywords.txt")).map_err(|e| e.to_string())?;
    Ok(())
}

fn extract_tar_bz2(archive_path: &Path, dest: &Path) -> Result<(), String> {
    let file = File::open(archive_path).map_err(|e| e.to_string())?;
    let decoder = BzDecoder::new(file);
    let mut archive = Archive::new(decoder);
    archive.unpack(dest).map_err(|e| e.to_string())
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
                        "type": "mvp_kws_download",
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

fn resolve_extracted_model_dir(extract_root: &Path) -> Result<PathBuf, String> {
    if discover_kws_assets(extract_root).is_ok() {
        return Ok(extract_root.to_path_buf());
    }
    let mut found: Option<PathBuf> = None;
    if let Ok(entries) = fs::read_dir(extract_root) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() && discover_kws_assets(&path).is_ok() {
                if found.is_some() {
                    return Err("multiple KWS model folders in archive".into());
                }
                found = Some(path);
            }
        }
    }
    found.ok_or_else(|| "could not find KWS model folder in archive".into())
}
