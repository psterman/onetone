use crate::config::{
    apply_peripheral_autotrigger_with_device, canonical_trigger, is_peripheral_trigger_key,
    is_volume_hotkey, make_combo_trigger_source, make_peripheral_mixed_source_with_device,
    now_source_time, RawEvent, TriggerSource, VoiceConfig,
};
use crate::press_gesture::RecordedGesture;

pub(crate) fn enable_mapping_if_complete(cfg: &mut VoiceConfig, mapping_id: &str) {
    let complete = cfg
        .find_mapping_by_id(mapping_id)
        .map(|m| !m.trigger_key.trim().is_empty() && !m.target_key.trim().is_empty())
        .unwrap_or(false);
    if complete {
        cfg.enable_mapping(mapping_id);
    }
}

pub(crate) fn normalize_record_key(key: &str) -> String {
    canonical_trigger(key)
}

pub fn build_source_from_raw_events(raw_events: Vec<RawEvent>) -> TriggerSource {
    let label = raw_events
        .first()
        .map(|r| r.label.clone())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| "      ".into());
    TriggerSource {
        id: "source_captured".into(),
        label,
        mode: "single_press".into(),
        grouping: "exact".into(),
        raw_events,
    }
}

pub(crate) fn apply_trigger_capture(
    cfg: &mut VoiceConfig,
    mapping_id: &str,
    captured: &str,
    physical_key: &str,
    device: &str,
    gesture: RecordedGesture,
) {
    if let Some(m) = cfg.mappings.iter_mut().find(|m| m.id == mapping_id) {
        let raw = if physical_key.trim().is_empty() {
            captured
        } else {
            physical_key
        };
        m.source_time = now_source_time();
        m.trigger_mode = gesture.to_trigger_mode();
        if !device.trim().is_empty() {
            m.trigger_device = device.trim().to_string();
        }
        if is_peripheral_trigger_key(raw) || is_volume_hotkey(raw) {
            apply_peripheral_autotrigger_with_device(m, raw, device);
        } else if captured.contains('+') || raw.contains('+') {
            let stored = if captured.contains('+') {
                captured.to_string()
            } else {
                raw.to_string()
            };
            m.trigger_key = canonical_trigger(&stored);
            m.source_key = stored.clone();
            m.trigger_source = Some(make_combo_trigger_source(&stored));
        } else {
            let canon = canonical_trigger(captured);
            m.trigger_key = canon.clone();
            m.source_key = canonical_trigger(raw);
            m.trigger_source = Some(make_peripheral_mixed_source_with_device(
                &[raw.to_string()],
                device,
            ));
        }
        if let Some(src) = &mut m.trigger_source {
            src.mode = gesture.source_mode_id().into();
        }
        m.label = format!("{} -> {}", m.trigger_key, m.target_key);
    }
    cfg.normalize();
    enable_mapping_if_complete(cfg, mapping_id);
}
