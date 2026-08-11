//! Structured needsInputKind projection for availableWhen / future contextual UI.

use serde::Serialize;

use super::model::{AttentionCause, AttentionState};
use super::store;

/// Runtime context kind consumed by availableWhen (A3).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum NeedsInputKind {
    None,
    WaitingText,
    WaitingChoice,
    WaitingApproval,
    AgentRunning,
    Dictating,
}

impl NeedsInputKind {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::None => "none",
            Self::WaitingText => "waitingText",
            Self::WaitingChoice => "waitingChoice",
            Self::WaitingApproval => "waitingApproval",
            Self::AgentRunning => "agentRunning",
            Self::Dictating => "dictating",
        }
    }
}

/// Map attention cause → waiting subtype.
pub fn kind_from_attention_cause(cause: AttentionCause) -> NeedsInputKind {
    match cause {
        AttentionCause::Permission => NeedsInputKind::WaitingApproval,
        // Without choice/options payload, elicitation is text — do not pretend waitingChoice.
        AttentionCause::Elicitation => NeedsInputKind::WaitingText,
        AttentionCause::UserInput | AttentionCause::OneToneAsk => NeedsInputKind::WaitingText,
        AttentionCause::Failure | AttentionCause::Lifecycle => NeedsInputKind::None,
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NeedsInputKindSnapshot {
    pub kind: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub agent: Option<String>,
    pub dictating: bool,
    pub feature_dynamic_context_actions: bool,
}

/// Project current needsInputKind.
/// `dictating` comes from voice session; attention from AgentAttentionStore.
pub fn project_needs_input_kind(dictating: bool) -> NeedsInputKindSnapshot {
    use crate::agent::semantic::FEATURE_DYNAMIC_CONTEXT_ACTIONS;

    if dictating {
        return NeedsInputKindSnapshot {
            kind: NeedsInputKind::Dictating.as_str(),
            agent: None,
            dictating: true,
            feature_dynamic_context_actions: FEATURE_DYNAMIC_CONTEXT_ACTIONS,
        };
    }

    let snap = store::public_snapshot();
    let mut best: Option<(NeedsInputKind, String)> = None;
    for row in &snap.rows {
        if row.state != AttentionState::NeedsInput && row.state != AttentionState::Working {
            continue;
        }
        let kind = if row.state == AttentionState::Working {
            NeedsInputKind::AgentRunning
        } else {
            kind_from_attention_cause(row.cause)
        };
        if kind == NeedsInputKind::None {
            continue;
        }
        let agent = row.agent.clone();
        let replace = match &best {
            None => true,
            Some((cur, _)) => kind_priority(kind) > kind_priority(*cur),
        };
        if replace {
            best = Some((kind, agent));
        }
    }

    match best {
        Some((kind, agent)) => NeedsInputKindSnapshot {
            kind: kind.as_str(),
            agent: Some(agent),
            dictating: false,
            feature_dynamic_context_actions: FEATURE_DYNAMIC_CONTEXT_ACTIONS,
        },
        None => NeedsInputKindSnapshot {
            kind: NeedsInputKind::None.as_str(),
            agent: None,
            dictating: false,
            feature_dynamic_context_actions: FEATURE_DYNAMIC_CONTEXT_ACTIONS,
        },
    }
}

fn kind_priority(k: NeedsInputKind) -> u8 {
    match k {
        NeedsInputKind::WaitingApproval => 5,
        NeedsInputKind::WaitingChoice => 4,
        NeedsInputKind::WaitingText => 3,
        NeedsInputKind::AgentRunning => 2,
        NeedsInputKind::Dictating => 6,
        NeedsInputKind::None => 0,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::agent_attention::store::{raise_needs_input, reset_for_test, test_lock};
    use crate::agent_attention::SignalSource;
    use crate::soft_pad_runtime::AgentKind;

    #[test]
    fn cause_maps_to_kinds() {
        assert_eq!(
            kind_from_attention_cause(AttentionCause::Permission),
            NeedsInputKind::WaitingApproval
        );
        assert_eq!(
            kind_from_attention_cause(AttentionCause::Elicitation),
            NeedsInputKind::WaitingText
        );
        assert_eq!(
            kind_from_attention_cause(AttentionCause::UserInput),
            NeedsInputKind::WaitingText
        );
    }

    #[test]
    fn dictating_wins() {
        let snap = project_needs_input_kind(true);
        assert_eq!(snap.kind, "dictating");
        assert!(snap.dictating);
        assert!(!snap.feature_dynamic_context_actions);
    }

    #[test]
    fn approval_from_permission_signal() {
        let _g = test_lock();
        reset_for_test();
        raise_needs_input(
            AgentKind::Codex,
            Some("s1"),
            Some("r1"),
            AttentionCause::Permission,
            SignalSource::OfficialHook,
        );
        let snap = project_needs_input_kind(false);
        assert_eq!(snap.kind, "waitingApproval");
        assert_eq!(snap.agent.as_deref(), Some("codex"));
    }

    #[test]
    fn kinds_have_stable_strings_and_choice_is_reserved() {
        for k in [
            NeedsInputKind::None,
            NeedsInputKind::WaitingText,
            NeedsInputKind::WaitingChoice,
            NeedsInputKind::WaitingApproval,
            NeedsInputKind::AgentRunning,
            NeedsInputKind::Dictating,
        ] {
            assert!(!k.as_str().is_empty());
        }
        // Homepage v1: no producer maps to waitingChoice.
        assert_ne!(
            kind_from_attention_cause(AttentionCause::Elicitation),
            NeedsInputKind::WaitingChoice
        );
    }
}
