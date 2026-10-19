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
            m.trigger_device = crate::device_identity::stable_id_from_path(device.trim());
        }
        if is_volume_hotkey(raw) {
            apply_peripheral_autotrigger_with_device(m, raw, device);
        } else if is_peripheral_trigger_key(raw) {
            // Side buttons / HID keep their physical name — AutoTrigger is volume-only.
            let canon = canonical_trigger(raw);
            m.trigger_key = canon.clone();
            m.source_key = canon;
            m.trigger_source = Some(make_peripheral_mixed_source_with_device(
                &[raw.to_string()],
                device,
            ));
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
            let raw_canon = canonical_trigger(raw);
            // Match FE: BT volume / recognition often arrive as RAlt while 02 is also RAlt.
            // Never persist RAlt as 01 trigger — fold to AutoTrigger (volume path).
            if canon == "RAlt" || raw_canon == "RAlt" {
                apply_peripheral_autotrigger_with_device(m, "Volume_Down", device);
            } else {
                m.trigger_key = canon.clone();
                m.source_key = raw_canon;
                m.trigger_source = Some(make_peripheral_mixed_source_with_device(
                    &[raw.to_string()],
                    device,
                ));
            }
        }
        if let Some(src) = &mut m.trigger_source {
            src.mode = gesture.source_mode_id().into();
        }
        m.label = format!("{} -> {}", m.trigger_key, m.target_key);
    }
    cfg.normalize();
    enable_mapping_if_complete(cfg, mapping_id);
}

/// Persist oral arm key without touching dictation `trigger_key`.
/// Clears matching Soft Pad `source_key` on **every** mapping (incl. soft-pad-global)
/// so Soft Pad pushToTalk / lattice cannot steal the side button from oral.
pub(crate) fn apply_oral_trigger_capture(
    cfg: &mut VoiceConfig,
    mapping_id: &str,
    captured: &str,
    physical_key: &str,
) {
    let raw = if physical_key.trim().is_empty() {
        captured
    } else {
        physical_key
    };
    let mut canon = canonical_trigger(captured);
    let raw_canon = canonical_trigger(raw);
    // Same RAlt fold as dictation trigger — never store bare RAlt.
    if canon == "RAlt" || raw_canon == "RAlt" {
        canon = "AutoTrigger".into();
    }
    let steal = if canon == "AutoTrigger" {
        raw_canon.clone()
    } else {
        canon.clone()
    };
    if let Some(m) = cfg.mappings.iter_mut().find(|m| m.id == mapping_id) {
        let scheme = m
            .oral_command_scheme
            .get_or_insert_with(crate::config::OralCommandScheme::default);
        scheme.trigger_key = canon.clone();
        // Recording a side button as oral arm → tap-to-toggle (hold flashes the panel).
        if matches!(canon.as_str(), "XButton1" | "XButton2") {
            scheme.activation_mode = "toggle".into();
        }
    }
    // Global Soft Pad often owns XButton while oral lives on a habit — clear all.
    clear_soft_pad_source_for_physical(cfg, &steal, &canon, &raw_canon);
    cfg.normalize();
}

fn clear_soft_pad_source_for_physical(
    cfg: &mut VoiceConfig,
    steal: &str,
    canon: &str,
    raw_canon: &str,
) {
    for m in cfg.mappings.iter_mut() {
        let Some(pad) = m.codex_micro_pad.as_mut() else {
            continue;
        };
        for route in pad.keys.iter_mut() {
            if route.source_key.trim().is_empty() {
                continue;
            }
            let sk = canonical_trigger(&route.source_key);
            if sk == steal
                || sk == canon
                || sk == raw_canon
                || (steal == "AutoTrigger" && is_volume_hotkey(&sk))
                || (sk == "AutoTrigger" && is_volume_hotkey(steal))
            {
                route.source_key.clear();
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::codex_numpad_layer::SOFT_PAD_GLOBAL_MAPPING_ID;
    use crate::config::{CodexMicroPadConfig, CodexMicroPadKeyRoute};

    #[test]
    fn oral_capture_clears_global_soft_pad_side_button() {
        let mut cfg = VoiceConfig::default();
        let habit_id = cfg.mappings[0].id.clone();
        let mut global = cfg.mappings[0].clone();
        global.id = SOFT_PAD_GLOBAL_MAPPING_ID.into();
        global.trigger_key.clear();
        global.source_key.clear();
        global.oral_command_scheme = None;
        global.codex_micro_pad = Some(CodexMicroPadConfig {
            enabled: true,
            keys: vec![CodexMicroPadKeyRoute {
                micro_key_id: "ACT10".into(),
                source_key: "XButton2".into(),
                slot_id: "pushToTalk".into(),
                ..Default::default()
            }],
            ..Default::default()
        });
        cfg.mappings.push(global);

        apply_oral_trigger_capture(&mut cfg, &habit_id, "XButton2", "XButton2");

        let scheme = cfg
            .find_mapping_by_id(&habit_id)
            .and_then(|m| m.oral_command_scheme.as_ref())
            .expect("oral scheme");
        assert_eq!(scheme.trigger_key, "XButton2");
        assert_eq!(scheme.normalized_activation_mode(), "toggle");
        let sk = cfg
            .find_mapping_by_id(SOFT_PAD_GLOBAL_MAPPING_ID)
            .and_then(|m| m.codex_micro_pad.as_ref())
            .and_then(|p| p.keys.first())
            .map(|r| r.source_key.as_str())
            .unwrap_or("missing");
        assert!(
            sk.is_empty(),
            "global Soft Pad must release XButton2 to oral: got {sk:?}"
        );
    }
}
