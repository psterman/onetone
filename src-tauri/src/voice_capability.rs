//! Unified voice capability probe + dual-scenario engine recommendations.
//!
//! Wake/default prefers proven SAPI zh; Soft Pad oral prefers Vosk grammar.
//! Vosk models are never downloaded here — FE shows the existing confirm UI.

use std::path::Path;
use std::sync::Mutex;
use std::time::{Duration, Instant};

use serde::Serialize;

use crate::config::{VoiceConfig, VoiceVoskConfig};
use crate::voice_vosk::{probe_vosk_resources, vosk_resource_issue};

const CACHE_TTL: Duration = Duration::from_secs(30);

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum RecommendedWake {
    Sapi,
    Vosk,
    None,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum RecommendedSoftPad {
    Vosk,
    SapiFallback,
    None,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VoiceCapabilityReason {
    pub code: String,
    pub message_key: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VoiceCapability {
    pub shell_supported: bool,
    pub audio_input_available: bool,
    pub sapi_available: bool,
    pub sapi_zh_available: bool,
    pub sapi_short_command_ok: bool,
    pub vosk_installed: bool,
    pub need_vosk_download: bool,
    pub recommended_wake: RecommendedWake,
    pub recommended_soft_pad: RecommendedSoftPad,
    pub reasons: Vec<VoiceCapabilityReason>,
}

#[derive(Debug, Clone, Copy)]
pub struct CapabilityFlags {
    pub shell_supported: bool,
    pub audio_input_available: bool,
    pub sapi_available: bool,
    pub sapi_zh_available: bool,
    pub sapi_short_command_ok: bool,
    pub vosk_installed: bool,
}

/// Pure wake recommendation (unit-tested).
pub fn recommend_wake(f: CapabilityFlags) -> RecommendedWake {
    if !f.shell_supported || !f.audio_input_available {
        return RecommendedWake::None;
    }
    if f.sapi_zh_available && f.sapi_short_command_ok {
        return RecommendedWake::Sapi;
    }
    if f.vosk_installed {
        return RecommendedWake::Vosk;
    }
    RecommendedWake::None
}

/// Pure Soft Pad oral recommendation (unit-tested).
pub fn recommend_soft_pad(f: CapabilityFlags) -> RecommendedSoftPad {
    if f.vosk_installed {
        return RecommendedSoftPad::Vosk;
    }
    if f.sapi_zh_available {
        return RecommendedSoftPad::SapiFallback;
    }
    RecommendedSoftPad::None
}

fn reason(code: &str, message_key: &str) -> VoiceCapabilityReason {
    VoiceCapabilityReason {
        code: code.into(),
        message_key: message_key.into(),
    }
}

pub fn build_capability(f: CapabilityFlags) -> VoiceCapability {
    let recommended_wake = recommend_wake(f);
    let recommended_soft_pad = recommend_soft_pad(f);
    let need_vosk_download = !f.vosk_installed
        && (recommended_wake == RecommendedWake::None
            || recommended_soft_pad != RecommendedSoftPad::Vosk);

    let mut reasons = Vec::new();
    if !f.shell_supported {
        reasons.push(reason("shell_unsupported", "voiceCapReasonShellUnsupported"));
    }
    if f.shell_supported && !f.audio_input_available {
        reasons.push(reason("mic_unavailable", "voiceCapReasonMicUnavailable"));
    }
    if f.shell_supported && !f.sapi_available {
        reasons.push(reason("sapi_unavailable", "voiceCapReasonSapiUnavailable"));
    } else if f.shell_supported && f.sapi_available && !f.sapi_zh_available {
        reasons.push(reason(
            "sapi_zh_engine_missing",
            "voiceCapReasonSapiZhMissing",
        ));
    } else if f.shell_supported && f.sapi_zh_available && !f.sapi_short_command_ok {
        reasons.push(reason(
            "sapi_short_command_fail",
            "voiceCapReasonSapiShortCmdFail",
        ));
    }
    if !f.vosk_installed {
        reasons.push(reason("vosk_model_missing", "voiceCapReasonVoskMissing"));
    }
    if recommended_soft_pad == RecommendedSoftPad::SapiFallback {
        reasons.push(reason(
            "soft_pad_sapi_fallback",
            "voiceCapSoftPadSapiWarn",
        ));
    }

    VoiceCapability {
        shell_supported: f.shell_supported,
        audio_input_available: f.audio_input_available,
        sapi_available: f.sapi_available,
        sapi_zh_available: f.sapi_zh_available,
        sapi_short_command_ok: f.sapi_short_command_ok,
        vosk_installed: f.vosk_installed,
        need_vosk_download,
        recommended_wake,
        recommended_soft_pad,
        reasons,
    }
}

/// True when strategy does not pin a concrete engine (advanced + desired none).
pub fn cfg_wake_unpinned(cfg: &VoiceConfig) -> bool {
    let strategy = crate::config::normalize_voice_listening_strategy(&cfg.voice_listening_strategy);
    if strategy != "advanced" {
        return false;
    }
    matches!(
        crate::config::parse_desired_engine_label(&cfg.desired_engine),
        Some(crate::scene_config::DesiredVoiceEngine::None) | None
    )
}

/// Apply recommended wake when cfg is unpinned. Returns true if cfg mutated.
pub fn apply_recommended_wake_if_unpinned(cfg: &mut VoiceConfig, wake: RecommendedWake) -> bool {
    if !cfg_wake_unpinned(cfg) {
        return false;
    }
    match wake {
        RecommendedWake::Sapi => {
            crate::config::apply_desired_engine(cfg, "sapi");
            true
        }
        RecommendedWake::Vosk => {
            crate::config::apply_desired_engine(cfg, "vosk");
            true
        }
        RecommendedWake::None => false,
    }
}

fn audio_input_available() -> bool {
    crate::audio_win::list_input_devices()
        .map(|d| !d.is_empty())
        .unwrap_or(false)
}

fn vosk_installed(cfg: &VoiceVoskConfig, resource_dir: Option<&Path>) -> bool {
    let probe = probe_vosk_resources(cfg, resource_dir);
    vosk_resource_issue(&probe).is_none()
}

#[derive(Default)]
struct SapiProbeResult {
    available: bool,
    zh_available: bool,
    short_command_ok: bool,
}

#[cfg(windows)]
fn probe_sapi_capability() -> SapiProbeResult {
    use windows::core::{Interface, IUnknown, PCWSTR};
    use windows::Win32::Media::Speech::{
        ISpObjectTokenCategory, ISpRecognizer, SPCAT_RECOGNIZERS,
        SPLO_STATIC, SPRS_ACTIVE, SPRS_INACTIVE, SpInprocRecognizer, SpMMAudioIn,
        SpObjectTokenCategory,
    };
    use windows::Win32::System::Com::{
        CoCreateInstance, CoInitializeEx, CoUninitialize, CLSCTX_ALL, COINIT_APARTMENTTHREADED,
    };

    let mut out = SapiProbeResult::default();
    unsafe {
        if CoInitializeEx(None, COINIT_APARTMENTTHREADED).is_err() {
            return out;
        }

        // Language=804 → zh-CN (0x0804). Enumerating tokens proves engine presence.
        let zh_token = (|| -> Option<windows::Win32::Media::Speech::ISpObjectToken> {
            let cat: ISpObjectTokenCategory =
                CoCreateInstance(&SpObjectTokenCategory, None, CLSCTX_ALL).ok()?;
            cat.SetId(SPCAT_RECOGNIZERS, false).ok()?;
            let tokens = cat
                .EnumTokens(windows::core::w!("Language=804"), PCWSTR::null())
                .ok()?;
            let mut count = 0u32;
            tokens.GetCount(&mut count).ok()?;
            if count == 0 {
                return None;
            }
            tokens.Item(0).ok()
        })();
        out.zh_available = zh_token.is_some();

        let recognizer = CoCreateInstance::<_, ISpRecognizer>(&SpInprocRecognizer, None, CLSCTX_ALL);
        if let Ok(recognizer) = recognizer {
            if let Some(ref token) = zh_token {
                let _ = recognizer.SetRecognizer(token);
            }
            if let Ok(audio) = CoCreateInstance::<_, IUnknown>(&SpMMAudioIn, None, CLSCTX_ALL) {
                if recognizer.SetInput(&audio, true).is_ok() {
                    out.available = true;
                    if let Ok(context) = recognizer.CreateRecoContext() {
                        if let Ok(grammar) = context.CreateGrammar(1) {
                            if grammar.LoadDictation(None, SPLO_STATIC).is_ok()
                                && grammar.SetDictationState(SPRS_ACTIVE).is_ok()
                            {
                                let _ = grammar.SetDictationState(SPRS_INACTIVE);
                                // Short-command ok only with zh engine + dictation load.
                                out.short_command_ok = zh_token.is_some();
                            }
                        }
                    }
                }
            }
        }

        CoUninitialize();
    }
    out
}

#[cfg(not(windows))]
fn probe_sapi_capability() -> SapiProbeResult {
    SapiProbeResult::default()
}

fn shell_supported() -> bool {
    cfg!(windows)
}

struct Cache {
    at: Instant,
    value: VoiceCapability,
}

static CACHE: Mutex<Option<Cache>> = Mutex::new(None);

/// Hot-path peek: never runs SAPI COM / device enum. Activate must use this under ACTIVATE_LOCK.
pub fn cached_voice_capability() -> Option<VoiceCapability> {
    if let Ok(guard) = CACHE.lock() {
        if let Some(c) = guard.as_ref() {
            if c.at.elapsed() < CACHE_TTL {
                return Some(c.value.clone());
            }
        }
    }
    None
}

pub fn probe_voice_capability(
    cfg: &VoiceConfig,
    resource_dir: Option<&Path>,
    force_refresh: bool,
) -> VoiceCapability {
    if !force_refresh {
        if let Some(cap) = cached_voice_capability() {
            return cap;
        }
    }

    // Hard cap: SpInprocRecognizer + SetInput has hung cold boot → UI_HB_STALL.
    let sapi = crate::audio_win::run_with_timeout(Duration::from_millis(800), || {
        Ok(probe_sapi_capability())
    })
    .unwrap_or_default();
    let flags = CapabilityFlags {
        shell_supported: shell_supported(),
        audio_input_available: audio_input_available(),
        sapi_available: sapi.available,
        sapi_zh_available: sapi.zh_available,
        sapi_short_command_ok: sapi.short_command_ok,
        vosk_installed: vosk_installed(&cfg.voice_vosk, resource_dir),
    };
    let cap = build_capability(flags);

    if let Ok(mut guard) = CACHE.lock() {
        *guard = Some(Cache {
            at: Instant::now(),
            value: cap.clone(),
        });
    }
    cap
}

/// Invalidate cached probe (e.g. after Vosk download).
pub fn invalidate_capability_cache() {
    if let Ok(mut guard) = CACHE.lock() {
        *guard = None;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn flags(
        shell: bool,
        audio: bool,
        sapi: bool,
        zh: bool,
        short: bool,
        vosk: bool,
    ) -> CapabilityFlags {
        CapabilityFlags {
            shell_supported: shell,
            audio_input_available: audio,
            sapi_available: sapi,
            sapi_zh_available: zh,
            sapi_short_command_ok: short,
            vosk_installed: vosk,
        }
    }

    #[test]
    fn wake_prefers_proven_sapi_zh() {
        assert_eq!(
            recommend_wake(flags(true, true, true, true, true, true)),
            RecommendedWake::Sapi
        );
    }

    #[test]
    fn wake_falls_back_to_vosk_when_sapi_zh_incomplete() {
        assert_eq!(
            recommend_wake(flags(true, true, true, true, false, true)),
            RecommendedWake::Vosk
        );
        assert_eq!(
            recommend_wake(flags(true, true, true, false, false, true)),
            RecommendedWake::Vosk
        );
    }

    #[test]
    fn wake_none_without_shell_or_mic() {
        assert_eq!(
            recommend_wake(flags(false, true, true, true, true, true)),
            RecommendedWake::None
        );
        assert_eq!(
            recommend_wake(flags(true, false, true, true, true, true)),
            RecommendedWake::None
        );
    }

    #[test]
    fn wake_none_with_download_option_when_no_engine() {
        assert_eq!(
            recommend_wake(flags(true, true, false, false, false, false)),
            RecommendedWake::None
        );
        let cap = build_capability(flags(true, true, false, false, false, false));
        assert!(cap.need_vosk_download);
        assert!(cap.reasons.iter().any(|r| r.code == "vosk_model_missing"));
    }

    #[test]
    fn soft_pad_prefers_vosk() {
        assert_eq!(
            recommend_soft_pad(flags(true, true, true, true, true, true)),
            RecommendedSoftPad::Vosk
        );
    }

    #[test]
    fn soft_pad_sapi_fallback_when_vosk_missing() {
        assert_eq!(
            recommend_soft_pad(flags(true, true, true, true, true, false)),
            RecommendedSoftPad::SapiFallback
        );
        let cap = build_capability(flags(true, true, true, true, true, false));
        assert!(cap.need_vosk_download);
        assert!(cap
            .reasons
            .iter()
            .any(|r| r.code == "soft_pad_sapi_fallback"));
    }

    #[test]
    fn soft_pad_none_without_vosk_or_sapi_zh() {
        assert_eq!(
            recommend_soft_pad(flags(true, true, true, false, false, false)),
            RecommendedSoftPad::None
        );
    }
}
