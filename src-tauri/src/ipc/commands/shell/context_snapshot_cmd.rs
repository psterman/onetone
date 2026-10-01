//! Context read-only projection for the "依据" panel and diagnostics.
//!
//! Read-only by construction: no setter, no frame data. The FE renders this
//! in a second-level surface — **never** in the Now cockpit hero.

use crate::context::presence;
use crate::context::resolver::resolve;
use crate::context::EvidenceBundle;
use crate::context::RepoEvidence;

/// Shape the cockpit's "依据" rows need. Deliberately narrow: enough to say
/// "why did it think that", never enough to reconstruct raw telemetry.
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ContextEvidenceDto {
    pub presence: &'static str,
    /// False when the camera is off, stale (TTL lapsed), or calibrating.
    pub presence_fresh: bool,
    pub presence_confidence: &'static str,
    /// Human-facing reason the presence row is not usable as evidence.
    /// Mirrors the "未知 ≠ 离开" rule so the UI cannot imply the user left.
    pub presence_note: &'static str,
    pub activity: &'static str,
    pub focus: &'static str,
    pub agent_state: &'static str,
    pub suppress_visible_interrupts: bool,
    /// Which evidence sources actually contributed this evaluation.
    pub sources: Vec<String>,
}

/// Read the current context. Cheap; safe to poll from the evidence panel.
#[tauri::command]
pub fn cmd_context_snapshot_get(dictating: Option<bool>) -> serde_json::Value {
    let snap = crate::context::snapshot_live(dictating.unwrap_or(false), repo_evidence_now());

    let (presence, confidence, fresh) = presence::read();
    // Same rule as may_treat_as_away(): absence is never a negative signal.
    let note: &'static str = if fresh {
        "摄像头刚刚上报"
    } else {
        "摄像头已关闭或已超时，这不是「离开」"
    };

    let dto = ContextEvidenceDto {
        presence: presence.as_str(),
        presence_fresh: fresh,
        presence_confidence: match confidence {
            presence::PresenceConfidence::High => "high",
            presence::PresenceConfidence::Mid => "mid",
            presence::PresenceConfidence::Low => "low",
        },
        presence_note: note,
        activity: snap.activity.as_str(),
        focus: snap.focus.as_str(),
        agent_state: snap.agent.state.as_str(),
        suppress_visible_interrupts: snap.suppress_visible_interrupts,
        sources: snap.sources.iter().map(|s| s.to_string()).collect(),
    };

    serde_json::to_value(dto).unwrap_or_else(|_| {
        serde_json::json!({
            "presence": "unknown",
            "presenceFresh": false,
            "presenceConfidence": "low",
            "presenceNote": "上下文暂不可用",
            "activity": "unknown",
            "focus": "unknown",
            "agentState": "unknown",
            "suppressVisibleInterrupts": false,
            "sources": []
        })
    })
}

/// TmStatus is per-workspace; until the live path wires it in we report no
/// repo evidence rather than inventing a dirty flag.
fn repo_evidence_now() -> Option<RepoEvidence> {
    None
}

/// Exposed for tests and future live wiring.
pub fn resolve_with(bundle: &EvidenceBundle) -> crate::context::ContextSnapshot {
    resolve(bundle)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::context::model::PresenceEvidence;

    #[test]
    fn unknown_presence_never_reports_as_left() {
        let dto = cmd_context_snapshot_get(Some(false));
        let v = &dto["presenceNote"];
        // The note must not imply the user left.
        assert!(v.is_string());
        assert!(!v.as_str().unwrap().contains("离开了"));
    }

    #[test]
    fn evidence_bundle_without_camera_is_safe() {
        let b = EvidenceBundle {
            presence: PresenceEvidence::Unknown,
            ..Default::default()
        };
        let s = resolve_with(&b);
        assert!(!s.suppress_visible_interrupts);
        assert!(!s.privacy.shielded);
    }
}
