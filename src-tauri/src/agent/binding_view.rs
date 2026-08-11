//! Read-only ActionBindingView projection across existing storages.

use serde::Serialize;

use super::semantic::{
    resolve_canonical_action_id, semantic_meta_by_id, ActionChannel, FinishPolicy,
};
use crate::config::{CameraOverride, MappingEntry, PresenceActionsPrefs, VoiceConfig};

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ActionBindingView {
    pub mapping_id: String,
    pub action_id: String,
    pub channel: String,
    pub trigger: String,
    pub enabled: bool,
    pub risk: String,
    pub availability: String,
    pub source_storage: String,
}

fn risk_for(action_id: &str) -> String {
    semantic_meta_by_id(action_id)
        .map(|m| m.risk.as_str().to_string())
        .unwrap_or_else(|| "confirm".into())
}

fn normalize_camera_action_token(raw: &str) -> Option<String> {
    let s = raw.trim();
    if s.is_empty() || s == "none" {
        return None;
    }
    if let Some(rest) = s.strip_prefix("agent:") {
        let id = rest.trim();
        if id.is_empty() {
            return None;
        }
        return Some(id.to_string());
    }
    // Local camera engine tokens (ACTION_OPTS).
    match s {
        "pressEsc" | "pressCtrlI" | "pauseVoice" | "resumeVoice" | "privacyScreen"
        | "lowPowerMode" => Some(format!("camera.local.{s}")),
        _ => None,
    }
}

fn push_camera_gesture(
    out: &mut Vec<ActionBindingView>,
    mapping_id: &str,
    gesture: &str,
    action_token: &str,
    enabled: bool,
    source_storage: &str,
    finish: FinishPolicy,
) {
    let Some(raw_id) = normalize_camera_action_token(action_token) else {
        return;
    };
    let action_id = if raw_id.starts_with("camera.local.") {
        raw_id.clone()
    } else {
        resolve_canonical_action_id(&raw_id, finish)
    };
    out.push(ActionBindingView {
        mapping_id: mapping_id.to_string(),
        action_id: action_id.clone(),
        channel: ActionChannel::Camera.as_str().to_string(),
        trigger: gesture.to_string(),
        enabled,
        risk: risk_for(&action_id),
        availability: "static".into(),
        source_storage: source_storage.to_string(),
    });
}

fn project_presence(
    out: &mut Vec<ActionBindingView>,
    mapping_id: &str,
    pa: &PresenceActionsPrefs,
    source_storage: &str,
    finish: FinishPolicy,
) {
    if !pa.enabled {
        return;
    }
    let t = &pa.triggers;
    push_camera_gesture(
        out, mapping_id, "onAway", &pa.on_away, t.away, source_storage, finish,
    );
    push_camera_gesture(
        out, mapping_id, "onReturn", &pa.on_return, true, source_storage, finish,
    );
    push_camera_gesture(
        out, mapping_id, "shakeHead", &pa.shake_head, t.shake, source_storage, finish,
    );
    push_camera_gesture(
        out,
        mapping_id,
        "deliberateBlink",
        &pa.deliberate_blink,
        t.blink,
        source_storage,
        finish,
    );
    push_camera_gesture(
        out, mapping_id, "openPalm", &pa.open_palm, t.open_palm, source_storage, finish,
    );
    push_camera_gesture(
        out, mapping_id, "okHand", &pa.ok_hand, t.ok_hand, source_storage, finish,
    );
    push_camera_gesture(
        out, mapping_id, "fist", &pa.fist, t.fist, source_storage, finish,
    );
    push_camera_gesture(
        out, mapping_id, "wave", &pa.wave, t.wave, source_storage, finish,
    );
}

fn project_camera_override(
    out: &mut Vec<ActionBindingView>,
    mapping_id: &str,
    ov: &CameraOverride,
    finish: FinishPolicy,
) {
    let t = ov.triggers.as_ref();
    let away_on = t.and_then(|x| x.away).unwrap_or(true);
    let shake_on = t.and_then(|x| x.shake).unwrap_or(true);
    let blink_on = t.and_then(|x| x.blink).unwrap_or(true);
    let palm_on = t.and_then(|x| x.open_palm).unwrap_or(true);
    let ok_on = t.and_then(|x| x.ok_hand).unwrap_or(true);
    let fist_on = t.and_then(|x| x.fist).unwrap_or(true);
    let wave_on = t.and_then(|x| x.wave).unwrap_or(true);
    if let Some(ref a) = ov.on_away {
        push_camera_gesture(out, mapping_id, "onAway", a, away_on, "cameraOverride", finish);
    }
    if let Some(ref a) = ov.on_return {
        push_camera_gesture(out, mapping_id, "onReturn", a, true, "cameraOverride", finish);
    }
    if let Some(ref a) = ov.shake_head {
        push_camera_gesture(out, mapping_id, "shakeHead", a, shake_on, "cameraOverride", finish);
    }
    if let Some(ref a) = ov.deliberate_blink {
        push_camera_gesture(
            out,
            mapping_id,
            "deliberateBlink",
            a,
            blink_on,
            "cameraOverride",
            finish,
        );
    }
    if let Some(ref a) = ov.open_palm {
        push_camera_gesture(out, mapping_id, "openPalm", a, palm_on, "cameraOverride", finish);
    }
    if let Some(ref a) = ov.ok_hand {
        push_camera_gesture(out, mapping_id, "okHand", a, ok_on, "cameraOverride", finish);
    }
    if let Some(ref a) = ov.fist {
        push_camera_gesture(out, mapping_id, "fist", a, fist_on, "cameraOverride", finish);
    }
    if let Some(ref a) = ov.wave {
        push_camera_gesture(out, mapping_id, "wave", a, wave_on, "cameraOverride", finish);
    }
}

fn project_mapping(
    out: &mut Vec<ActionBindingView>,
    m: &MappingEntry,
    cfg: &VoiceConfig,
    finish: FinishPolicy,
) {
    let mapping_id = m.id.clone();

    for b in &m.agent_bindings {
        let Some(channel) = ActionChannel::parse(&b.trigger_type) else {
            continue;
        };
        let action_id = resolve_canonical_action_id(&b.action_id, finish);
        out.push(ActionBindingView {
            mapping_id: mapping_id.clone(),
            action_id: action_id.clone(),
            channel: channel.as_str().to_string(),
            trigger: b.trigger_binding.clone(),
            enabled: b.enabled,
            risk: risk_for(&action_id),
            availability: "static".into(),
            source_storage: "agentBindings".into(),
        });
    }

    if let Some(ref ov) = m.camera_override {
        project_camera_override(out, &mapping_id, ov, finish);
    } else {
        project_presence(
            out,
            &mapping_id,
            &cfg.camera_prefs.presence_actions,
            "cameraPrefs",
            finish,
        );
    }

    if let Some(ref pad) = m.codex_micro_pad {
        if pad.enabled {
            for key in &pad.keys {
                let slot = key.slot_id.trim();
                if slot.is_empty() {
                    continue;
                }
                let binding = m.agent_bindings.iter().find(|b| {
                    b.slot_id == slot
                        && ActionChannel::parse(&b.trigger_type) == Some(ActionChannel::Key)
                });
                let action_raw = binding.map(|b| b.action_id.as_str()).unwrap_or("");
                if action_raw.is_empty() {
                    continue;
                }
                let action_id = resolve_canonical_action_id(action_raw, finish);
                out.push(ActionBindingView {
                    mapping_id: mapping_id.clone(),
                    action_id: action_id.clone(),
                    channel: ActionChannel::SoftPad.as_str().to_string(),
                    trigger: key.micro_key_id.clone(),
                    enabled: key.enabled && binding.map(|b| b.enabled).unwrap_or(true),
                    risk: risk_for(&action_id),
                    availability: "static".into(),
                    source_storage: "codexMicroPad".into(),
                });
            }
        }
    }
}

/// Project bindings for one mapping (edit surface uses selectedMappingId).
pub fn project_action_bindings_for_mapping(
    cfg: &VoiceConfig,
    mapping_id: &str,
) -> Vec<ActionBindingView> {
    let finish = FinishPolicy::from_send_mode(&cfg.voice_end.send_mode);
    let mut out = Vec::new();
    if let Some(m) = cfg.find_mapping_by_id(mapping_id) {
        project_mapping(&mut out, m, cfg, finish);
    }
    out
}

pub fn project_all_action_bindings(cfg: &VoiceConfig) -> Vec<ActionBindingView> {
    let finish = FinishPolicy::from_send_mode(&cfg.voice_end.send_mode);
    let mut out = Vec::new();
    for m in &cfg.mappings {
        project_mapping(&mut out, m, cfg, finish);
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::{AgentBinding, CodexMicroPadConfig, CodexMicroPadKeyRoute, VoiceConfig};

    #[test]
    fn projects_agent_bindings_and_soft_pad() {
        let mut cfg = VoiceConfig::default();
        let mid = cfg.mappings[0].id.clone();
        if let Some(m) = cfg.mappings.iter_mut().find(|m| m.id == mid) {
            m.agent_bindings = vec![AgentBinding {
                slot_id: "pushToTalk".into(),
                action_id: "startDictation".into(),
                trigger_type: "key".into(),
                trigger_binding: "Ctrl+Shift+D".into(),
                enabled: true,
                execution_mode: None,
                activation_scope: "global".into(),
            }];
            m.codex_micro_pad = Some(CodexMicroPadConfig {
                enabled: true,
                keys: vec![CodexMicroPadKeyRoute {
                    micro_key_id: "D1".into(),
                    slot_id: "pushToTalk".into(),
                    enabled: true,
                    ..Default::default()
                }],
                ..Default::default()
            });
        }
        let views = project_action_bindings_for_mapping(&cfg, &mid);
        assert!(
            views.iter().any(|v| {
                v.action_id == "input.start"
                    && v.channel == "key"
                    && v.source_storage == "agentBindings"
            }),
            "{views:?}"
        );
        assert!(
            views.iter().any(|v| {
                v.action_id == "input.start"
                    && v.channel == "softPad"
                    && v.source_storage == "codexMicroPad"
            }),
            "{views:?}"
        );
    }
}
