//! Keyword spotting worker — stub (default) or sherpa-onnx native (`kws-engine`).

use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
#[cfg(feature = "kws-engine")]
use std::thread::JoinHandle;

use crossbeam_channel::{Receiver, Sender, TrySendError};

use crate::config::VoiceKwsConfig;
use crate::voice_keyword_dispatch::VoiceKeywordKind;

pub(crate) const EVENT_CHANNEL_CAP: usize = 32;

#[derive(Debug, Clone)]
pub struct KwsModelAssets {
    pub model_dir: PathBuf,
    pub encoder: PathBuf,
    pub decoder: PathBuf,
    pub joiner: PathBuf,
    pub tokens: PathBuf,
    pub keywords: PathBuf,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KwsResourceProbe {
    pub model_exists: bool,
    pub keywords_exists: bool,
    pub model_path: String,
    pub model_preset: String,
    pub resolved_model_path: String,
    pub stub_mode: bool,
}

#[derive(Debug, Clone)]
pub enum VoiceKwsEvent {
    StateChanged(String),
    Error(String),
    Level { level: u32 },
    Partial(String),
    Detected {
        phrase: String,
        keyword: String,
        kind: VoiceKeywordKind,
    },
}

pub struct VoiceKwsHandle {
    stop: Arc<AtomicBool>,
    event_rx: Receiver<VoiceKwsEvent>,
    event_tx: Sender<VoiceKwsEvent>,
    #[cfg(feature = "kws-engine")]
    thread: Option<JoinHandle<()>>,
}

impl VoiceKwsHandle {
    pub(crate) fn new(
        stop: Arc<AtomicBool>,
        event_rx: Receiver<VoiceKwsEvent>,
        event_tx: Sender<VoiceKwsEvent>,
        #[cfg(feature = "kws-engine")] thread: Option<JoinHandle<()>>,
    ) -> Self {
        Self {
            stop,
            event_rx,
            event_tx,
            #[cfg(feature = "kws-engine")]
            thread,
        }
    }

    pub fn try_recv(&self) -> Option<VoiceKwsEvent> {
        self.event_rx.try_recv().ok()
    }

    pub fn inject_detected(
        &self,
        phrase: String,
        keyword: String,
        kind: VoiceKeywordKind,
    ) -> Result<(), String> {
        self.event_tx
            .try_send(VoiceKwsEvent::Detected {
                phrase,
                keyword,
                kind,
            })
            .map_err(|e| match e {
                TrySendError::Full(_) => "KWS event queue full".into(),
                TrySendError::Disconnected(_) => "KWS worker disconnected".into(),
            })
    }
}

impl Drop for VoiceKwsHandle {
    fn drop(&mut self) {
        self.stop.store(true, Ordering::SeqCst);
        #[cfg(feature = "kws-engine")]
        if let Some(thread) = self.thread.take() {
            let _ = thread.join();
        }
    }
}

pub fn stop_voice_kws(handle: VoiceKwsHandle) {
    drop(handle);
}

/// Parent directory where packaged / user KWS assets live.
pub fn kws_resources_dir(resource_dir: Option<&Path>) -> PathBuf {
    let rel = "resources/kws";
    if let Some(rd) = resource_dir {
        let candidate = rd.join(rel);
        if candidate.is_dir() {
            return candidate;
        }
        let stripped = rd.join("kws");
        if stripped.is_dir() {
            return stripped;
        }
    }
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            for candidate in [dir.join(rel), dir.join("kws")] {
                if candidate.is_dir() {
                    return candidate;
                }
            }
        }
    }
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join(rel)
}

pub fn resolve_kws_model_rel(cfg: &VoiceKwsConfig) -> String {
    let model_path = cfg.model_path.trim();
    if !model_path.is_empty() {
        return model_path.to_string();
    }
    let preset = if cfg.model_preset.trim().is_empty() {
        "cn-light"
    } else {
        cfg.model_preset.trim()
    };
    crate::config::kws_preset_model_path(preset)
        .unwrap_or("resources/kws/sherpa-kws-zh-small")
        .to_string()
}

pub fn resolve_kws_model_dir(cfg: &VoiceKwsConfig, resource_dir: Option<&Path>) -> PathBuf {
    resolve_kws_path(&resolve_kws_model_rel(cfg), resource_dir)
}

fn resolve_kws_path(rel: &str, resource_dir: Option<&Path>) -> PathBuf {
    let rel_path = Path::new(rel);
    if rel_path.is_absolute() {
        return rel_path.to_path_buf();
    }
    let mut candidates: Vec<PathBuf> = Vec::new();
    if let Some(rd) = resource_dir {
        push_candidate(&mut candidates, rd.join(rel));
        let stripped = rel.strip_prefix("resources/").unwrap_or(rel);
        push_candidate(&mut candidates, rd.join(stripped));
    }
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            push_candidate(&mut candidates, dir.join(rel));
            let stripped = rel.strip_prefix("resources/").unwrap_or(rel);
            push_candidate(&mut candidates, dir.join(stripped));
        }
    }
    push_candidate(
        &mut candidates,
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join(rel),
    );

    for candidate in &candidates {
        if discover_kws_assets(candidate).is_ok() {
            return candidate.clone();
        }
    }
    for candidate in candidates {
        if candidate.exists() {
            return candidate;
        }
    }
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join(rel)
}

fn push_candidate(candidates: &mut Vec<PathBuf>, path: PathBuf) {
    if !candidates.iter().any(|p| p == &path) {
        candidates.push(path);
    }
}

fn find_onnx_in_dir(dir: &Path, prefix: &str) -> Option<PathBuf> {
    let mut matches: Vec<PathBuf> = std::fs::read_dir(dir)
        .ok()?
        .filter_map(|e| e.ok())
        .map(|e| e.path())
        .filter(|p| {
            p.file_name()
                .and_then(|n| n.to_str())
                .map(|n| n.starts_with(prefix) && n.ends_with(".onnx"))
                .unwrap_or(false)
        })
        .collect();
    // Prefer full-precision models; sorted order would pick *.int8.onnx before *.onnx.
    matches.sort_by(|a, b| {
        let a_int8 = a
            .file_name()
            .and_then(|n| n.to_str())
            .map(|n| n.contains(".int8."))
            .unwrap_or(false);
        let b_int8 = b
            .file_name()
            .and_then(|n| n.to_str())
            .map(|n| n.contains(".int8."))
            .unwrap_or(false);
        a_int8
            .cmp(&b_int8)
            .then_with(|| a.file_name().cmp(&b.file_name()))
    });
    matches.into_iter().next()
}

pub fn discover_kws_assets(dir: &Path) -> Result<KwsModelAssets, String> {
    if !dir.is_dir() {
        return Err(format!("not a directory: {}", dir.display()));
    }
    let tokens = dir.join("tokens.txt");
    if !tokens.is_file() {
        return Err(format!("tokens.txt missing: {}", dir.display()));
    }
    let encoder = find_onnx_in_dir(dir, "encoder")
        .ok_or_else(|| format!("encoder onnx missing: {}", dir.display()))?;
    let decoder = find_onnx_in_dir(dir, "decoder")
        .ok_or_else(|| format!("decoder onnx missing: {}", dir.display()))?;
    let joiner = find_onnx_in_dir(dir, "joiner")
        .ok_or_else(|| format!("joiner onnx missing: {}", dir.display()))?;
    let keywords = [
        dir.join(crate::voice_kws_keywords::RUNTIME_KEYWORDS_FILENAME),
        dir.join("keywords.txt"),
        dir.join("test_wavs/test_keywords.txt"),
    ]
    .into_iter()
    .find(|p| p.is_file())
    .ok_or_else(|| format!("keywords file missing: {}", dir.display()))?;
    Ok(KwsModelAssets {
        model_dir: dir.to_path_buf(),
        encoder,
        decoder,
        joiner,
        tokens,
        keywords,
    })
}

pub fn probe_kws_resources(cfg: &VoiceKwsConfig, resource_dir: Option<&Path>) -> KwsResourceProbe {
    let model_path = cfg.model_path.trim().to_string();
    let model_preset = if cfg.model_preset.trim().is_empty() {
        "cn-light".to_string()
    } else {
        cfg.model_preset.trim().to_string()
    };
    let resolved_dir = resolve_kws_model_dir(cfg, resource_dir);
    let assets = discover_kws_assets(&resolved_dir);
    let model_exists = assets.is_ok();
    let keywords_exists = assets
        .as_ref()
        .map(|a| a.keywords.is_file())
        .unwrap_or(false);

    #[cfg(feature = "kws-engine")]
    let stub_mode = false;
    #[cfg(not(feature = "kws-engine"))]
    let stub_mode = true;

    KwsResourceProbe {
        model_exists,
        keywords_exists,
        model_path,
        model_preset,
        resolved_model_path: resolved_dir.display().to_string(),
        stub_mode,
    }
}

pub fn kws_resource_issue(probe: &KwsResourceProbe) -> Option<String> {
    if probe.stub_mode {
        return Some("KWS stub 模式：尚未接入 sherpa-onnx（需 --features kws-engine 编译）".into());
    }
    if !probe.model_exists {
        return Some(format!(
            "KWS 模型未找到或不完整：{}",
            probe.resolved_model_path
        ));
    }
    if !probe.keywords_exists {
        return Some(format!(
            "KWS keywords 文件未找到：{}",
            probe.resolved_model_path
        ));
    }
    None
}

/// Phase 2b — dynamic phrase → sherpa token keywords file.
pub trait KwsKeywordsBuilder {
    fn build_keywords_file(&self, phrases: &[String], model_dir: &Path) -> Result<PathBuf, String>;
}

pub struct RuntimeKwsKeywordsBuilder;

impl KwsKeywordsBuilder for RuntimeKwsKeywordsBuilder {
    fn build_keywords_file(&self, phrases: &[String], model_dir: &Path) -> Result<PathBuf, String> {
        let result = crate::voice_kws_keywords::build_runtime_keywords_file(model_dir, phrases)?;
        if result.encoded.is_empty() {
            return Err("no phrases could be encoded for KWS keywords".into());
        }
        Ok(model_dir.join(crate::voice_kws_keywords::RUNTIME_KEYWORDS_FILENAME))
    }
}

pub struct StubKwsKeywordsBuilder;

impl KwsKeywordsBuilder for StubKwsKeywordsBuilder {
    fn build_keywords_file(&self, _phrases: &[String], _model_dir: &Path) -> Result<PathBuf, String> {
        Err("KWS keywords builder not available without kws-engine".into())
    }
}

/// Prepare runtime keywords from effective scene phrases (short-lived cfg lock done by caller).
pub fn prepare_runtime_keywords(
    model_dir: &Path,
    phrases: &[String],
) -> crate::voice_kws_keywords::KwsKeywordBuildResult {
    match crate::voice_kws_keywords::build_runtime_keywords_file(model_dir, phrases) {
        Ok(result) => result,
        Err(e) => {
            eprintln!("kws prepare_runtime_keywords: {e}");
            crate::voice_kws_keywords::KwsKeywordBuildResult::default()
        }
    }
}

pub fn start_voice_kws(
    cfg: &VoiceKwsConfig,
    resource_dir: Option<&Path>,
    frame_tx: Option<crossbeam_channel::Sender<Vec<f32>>>,
) -> Result<VoiceKwsHandle, String> {
    #[cfg(feature = "kws-engine")]
    {
        if let Some(issue) = kws_resource_issue(&probe_kws_resources(cfg, resource_dir)) {
            return Err(issue);
        }
        return crate::voice_kws_native::start_voice_kws_native(cfg, resource_dir, frame_tx);
    }

    #[cfg(not(feature = "kws-engine"))]
    {
        let _ = (resource_dir, frame_tx);
        start_voice_kws_stub(cfg)
    }
}

#[cfg(not(feature = "kws-engine"))]
fn start_voice_kws_stub(_cfg: &VoiceKwsConfig) -> Result<VoiceKwsHandle, String> {
    let (event_tx, event_rx) = crossbeam_channel::bounded(EVENT_CHANNEL_CAP);
    let handle = VoiceKwsHandle::new(
        Arc::new(AtomicBool::new(false)),
        event_rx,
        event_tx,
    );
    let _ = handle
        .event_tx
        .try_send(VoiceKwsEvent::StateChanged("listening".into()));
    Ok(handle)
}
