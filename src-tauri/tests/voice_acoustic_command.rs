//! Integration tests for acoustic MFCC/DTW (lib has test=false on Windows).

use onetone::voice_acoustic_command::{
    build_from_samples, dtw_similarity, extract_mfcc_from_pcm_f32, sample_pairwise_agreement,
    BuildFromSamplesOptions, AGREE_GOOD,
};
use std::f64::consts::PI;

const SAMPLE_RATE: u32 = 16000;

fn sine_pcm(freq_hz: f32, ms: u32) -> Vec<f32> {
    let n = (SAMPLE_RATE as u64 * ms as u64 / 1000) as usize;
    (0..n)
        .map(|i| {
            let t = i as f32 / SAMPLE_RATE as f32;
            (2.0 * PI as f32 * freq_hz * t).sin() * 0.35
        })
        .collect()
}

#[test]
fn extracted_features_non_zero_and_dims() {
    let pcm = sine_pcm(440.0, 900);
    let sample = extract_mfcc_from_pcm_f32(&pcm, SAMPLE_RATE).expect("sample");
    assert!(sample.feature_frames > 0);
    assert_eq!(sample.feature_dims, 13);
    assert_eq!(
        sample.feature.len(),
        sample.feature_frames as usize * sample.feature_dims as usize
    );
    assert!(sample.feature.iter().any(|&v| v.abs() > 1e-6));
    assert!(sample.feature.iter().all(|v| v.is_finite()));
}

#[test]
fn pairwise_agreement_identical_samples() {
    let pcm = sine_pcm(480.0, 900);
    let a = extract_mfcc_from_pcm_f32(&pcm, SAMPLE_RATE).expect("a");
    let b = extract_mfcc_from_pcm_f32(&pcm, SAMPLE_RATE).expect("b");
    let agreement = sample_pairwise_agreement(&[a, b]);
    assert!(agreement >= AGREE_GOOD, "agreement={agreement}");
}

#[test]
fn dtw_same_vs_different() {
    let a = extract_mfcc_from_pcm_f32(&sine_pcm(440.0, 900), SAMPLE_RATE).expect("a");
    let b = extract_mfcc_from_pcm_f32(&sine_pcm(440.0, 900), SAMPLE_RATE).expect("b");
    let c = extract_mfcc_from_pcm_f32(&sine_pcm(1100.0, 900), SAMPLE_RATE).expect("c");
    let same = dtw_similarity(
        &a.feature,
        a.feature_frames,
        &b.feature,
        b.feature_frames,
        a.feature_dims,
    );
    let diff = dtw_similarity(
        &a.feature,
        a.feature_frames,
        &c.feature,
        c.feature_frames,
        a.feature_dims,
    );
    assert!(same > diff, "same={same} diff={diff}");
}

#[test]
fn build_from_samples_returns_command() {
    let pcm = sine_pcm(520.0, 900);
    let s1 = extract_mfcc_from_pcm_f32(&pcm, SAMPLE_RATE).expect("s1");
    let s2 = extract_mfcc_from_pcm_f32(&pcm, SAMPLE_RATE).expect("s2");
    let built = build_from_samples(
        vec![s1, s2],
        BuildFromSamplesOptions {
            scenario_id: "sc-test",
            activation_scope: "global",
            app_boost: true,
            display_text: "",
            current_command_id: None,
            kind: None,
        },
    );
    assert!(built.ok, "{:?}", built.message_key);
    let cmd = built.command.expect("command");
    assert_eq!(cmd.scenario_id, "sc-test");
    assert!(cmd.threshold.is_finite());
    assert!(cmd.margin.is_finite());
}

#[test]
fn process_pcm_buffer_returns_valid_sample() {
    use onetone::voice_acoustic_runtime::process_pcm_buffer;
    let pcm = sine_pcm(440.0, 900);
    let res = process_pcm_buffer(&pcm);
    assert_eq!(res.get("ok").and_then(|v| v.as_bool()), Some(true));
    let sample = res.get("sample").expect("sample");
    let frames = sample
        .get("featureFrames")
        .and_then(|v| v.as_u64())
        .unwrap_or(0);
    let dims = sample
        .get("featureDims")
        .and_then(|v| v.as_u64())
        .unwrap_or(0);
    assert!(frames > 0);
    assert_eq!(dims, 13);
    let feature = sample
        .get("feature")
        .and_then(|v| v.as_array())
        .expect("feature");
    assert!(feature
        .iter()
        .any(|v| v.as_f64().unwrap_or(0.0).abs() > 1e-6));
}

#[test]
fn process_pcm_buffer_empty_and_short_fail() {
    use onetone::voice_acoustic_runtime::process_pcm_buffer;
    let empty = process_pcm_buffer(&[]);
    assert_eq!(empty.get("ok").and_then(|v| v.as_bool()), Some(false));

    let short = process_pcm_buffer(&sine_pcm(440.0, 80));
    assert_eq!(short.get("ok").and_then(|v| v.as_bool()), Some(false));
    let key = short
        .get("messageKey")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    assert!(
        key.contains("Short")
            || key.contains("Timeout")
            || key.contains("Audio")
            || !key.is_empty(),
        "unexpected messageKey={key}"
    );
}

#[test]
fn process_pcm_manual_accepts_long_with_trim_warning() {
    use onetone::voice_acoustic_runtime::process_pcm_buffer_manual;
    // Long continuous tone → above maxSpeechMs; manual path trims and warns (no hard fail).
    let pcm = sine_pcm(440.0, 2800);
    let res = process_pcm_buffer_manual(&pcm);
    assert_eq!(res.get("ok").and_then(|v| v.as_bool()), Some(true));
    assert!(res.get("sample").is_some());
    let warnings = res
        .get("warnings")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();
    assert!(
        warnings
            .iter()
            .any(|w| w.as_str() == Some("habitAcousticCmdWarnTrimmed")),
        "expected trim warning, got {warnings:?}"
    );
}

#[test]
fn capture_error_kind_maps_message_key() {
    use onetone::voice_acoustic_record::{CaptureError, CaptureErrorKind};
    use onetone::voice_acoustic_runtime::capture_error_json;

    let no_audio = capture_error_json(&CaptureError::new(
        CaptureErrorKind::NoAudioCaptured,
        "none",
    ));
    assert_eq!(
        no_audio.get("messageKey").and_then(|v| v.as_str()),
        Some("habitAcousticCmdNoAudio")
    );
    assert_eq!(
        no_audio.get("captureKind").and_then(|v| v.as_str()),
        Some("noAudio")
    );

    let little = capture_error_json(&CaptureError::new(
        CaptureErrorKind::TooLittleAudio,
        "short",
    ));
    assert_eq!(
        little.get("messageKey").and_then(|v| v.as_str()),
        Some("habitAcousticCmdTooShort")
    );

    let timeout = capture_error_json(&CaptureError::new(CaptureErrorKind::Timeout, "deadline"));
    assert_eq!(
        timeout.get("messageKey").and_then(|v| v.as_str()),
        Some("habitAcousticCmdTimeout")
    );
}
