//! Evidence → Context 仲裁。
//!
//! 本模块是**唯一**允许把各数据源放在一起看的地方。
//! 规则：各源模块不得互相调用，一律经此层汇合。

use std::sync::atomic::{AtomicU64, Ordering};

use super::model::*;

// ---------------------------------------------------------------------------
// 证据输入：各源的最小投影
// ---------------------------------------------------------------------------

/// AI 注意力证据，来自 `agent_attention::store::public_snapshot()`。
#[derive(Debug, Clone, Default)]
pub struct AttentionEvidence {
    pub waiting_kind: Option<String>,
    pub waiting_agent: Option<String>,
    pub busy: bool,
    pub errored: bool,
    pub completed: bool,
}

/// 前台证据，来自 `soft_pad_runtime::ForegroundEvidence`。
#[derive(Debug, Clone, Default)]
pub struct ForegroundEvidenceInput {
    pub agent_kind: Option<String>,
    pub app_target_id: Option<String>,
    pub foreign_host: bool,
}

/// 代码库证据，来自 `time_machine::TmStatus`。
#[derive(Debug, Clone, Default)]
pub struct RepoEvidence {
    pub is_git: bool,
    pub dirty: bool,
    pub changed_count: u32,
    pub agent_busy: bool,
}

/// 活动证据：低层输入流与语音的派生结论。
///
/// Phase 1 **不做**击键频率统计（噪声大、易误判），只接受显式派生值。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum ActivityEvidence {
    #[default]
    Unavailable,
    /// 明确在会议应用/多人场景中。
    Meeting,
    /// 明确在阅读类应用。
    Reading,
    /// 前台是代码编辑器。
    Editor,
}

impl ActivityEvidence {
    fn contributes(self) -> bool {
        !matches!(self, Self::Unavailable)
    }
}

/// 全部输入。缺项即为该源不可用，对应维度落 Unknown。
#[derive(Debug, Clone, Default)]
pub struct EvidenceBundle {
    pub presence: PresenceEvidence,
    pub attention: AttentionEvidence,
    pub foreground: ForegroundEvidenceInput,
    pub repo: RepoEvidence,
    pub activity: ActivityEvidence,
    /// 人是否正在说话（voice session）。
    pub dictating: bool,
}

// ---------------------------------------------------------------------------
// 仲裁
// ---------------------------------------------------------------------------

static REVISION: AtomicU64 = AtomicU64::new(1);

fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

/// 把证据束仲裁为一份快照。
pub fn resolve(bundle: &EvidenceBundle) -> ContextSnapshot {
    let mut snap = ContextSnapshot::empty(now_ms());
    snap.revision = REVISION.fetch_add(1, Ordering::Relaxed);

    // --- 1. presence：最高优先级，人不在则其余降级 ---
    snap.presence = PresenceState::from_evidence(bundle.presence);
    if bundle.presence != PresenceEvidence::Unknown {
        snap.sources.push("presence");
    }

    // --- 2. AI 状态 ---
    let att = &bundle.attention;
    let agent_state = if att.errored {
        AgentState::Error
    } else if att.waiting_kind.is_some() {
        AgentState::NeedsInput
    } else if att.busy {
        AgentState::Working
    } else if att.completed {
        AgentState::Complete
    } else if !att.waiting_agent.is_none() || !att.waiting_kind.is_none() {
        AgentState::Idle
    } else {
        AgentState::Unknown
    };
    snap.agent = AgentContextState {
        state: agent_state,
        waiting_agent: att.waiting_agent.clone(),
        waiting_kind: att.waiting_kind.clone(),
        busy: att.busy,
    };
    if agent_state != AgentState::Unknown {
        snap.sources.push("attention");
    }

    // --- 3. 环境 ---
    let fg = &bundle.foreground;
    let has_fg = fg.agent_kind.is_some() || fg.foreign_host || fg.app_target_id.is_some();
    if has_fg {
        snap.environment = EnvironmentState {
            foreground_is_agent: fg.agent_kind.is_some(),
            app_target_id: fg.app_target_id.clone(),
            foreign_host: fg.foreign_host,
        };
        snap.sources.push("foreground");
    }

    // --- 4. 代码库 ---
    let repo = &bundle.repo;
    if repo.is_git {
        snap.repo = RepoState {
            is_git: true,
            dirty: repo.dirty,
            changed_count: repo.changed_count,
            agent_busy: repo.agent_busy,
        };
        snap.sources.push("repo");
    }

    // --- 5. activity：有代码库证据优先，其次显式活动证据 ---
    snap.activity = resolve_activity(bundle, &snap);
    if snap.activity != ActivityState::Unknown {
        snap.sources.push("activity");
    }

    // --- 6. focus：保守结论，绝不虚报深度专注 ---
    snap.focus = resolve_focus(&snap, bundle);

    // --- 7. 隐私与打断抑制 ---
    snap.privacy = PrivacyState {
        shielded: snap.presence == PresenceState::Away,
        mic_muted: snap.presence == PresenceState::Away,
    };
    snap.suppress_visible_interrupts = snap.presence == PresenceState::Away;

    snap
}

/// 活动判定。代码库有改动 + 前台是编辑器 → 写代码。
fn resolve_activity(bundle: &EvidenceBundle, snap: &ContextSnapshot) -> ActivityState {
    if bundle.activity == ActivityEvidence::Meeting {
        return ActivityState::Meeting;
    }
    if snap.repo.is_git && (snap.repo.dirty || snap.repo.agent_busy) {
        return ActivityState::Coding;
    }
    match bundle.activity {
        ActivityEvidence::Editor => {
            if snap.repo.is_git {
                ActivityState::Coding
            } else {
                ActivityState::Reading
            }
        }
        ActivityEvidence::Reading => ActivityState::Reading,
        ActivityEvidence::Meeting => ActivityState::Meeting,
        ActivityEvidence::Unavailable => {
            // 正在写代码有明确证据时，即便无 activity 证据也算 coding
            if snap.repo.is_git && (snap.repo.dirty || snap.repo.agent_busy) {
                ActivityState::Coding
            } else {
                ActivityState::Unknown
            }
        }
    }
}

/// 专注判定。**只承认有硬证据的 DeepWork**。
/// 「正在写代码」不等于「深度专注」——前者是活动，后者是状态。
fn resolve_focus(snap: &ContextSnapshot, bundle: &EvidenceBundle) -> FocusState {
    if snap.presence == PresenceState::Away {
        return FocusState::Unknown;
    }
    if bundle.dictating {
        // 正在说话：不打断，但也不算深度专注
        return FocusState::Normal;
    }
    // 硬证据：正在写代码 且 AI 正在同一仓库上工作 → 用户在协作，判为深度专注
    if snap.activity == ActivityState::Coding && snap.repo.agent_busy {
        return FocusState::DeepWork;
    }
    if snap.activity == ActivityState::Coding {
        return FocusState::Normal;
    }
    if snap.activity == ActivityState::Meeting {
        return FocusState::Normal;
    }
    FocusState::Unknown
}

/// 便捷：直接用 `agent_attention` 的公开快照构造 attention 证据。
pub fn attention_evidence_from_snapshot(
    snap: &crate::agent_attention::model::AttentionPublicSnapshot,
) -> AttentionEvidence {
    let mut out = AttentionEvidence::default();
    for row in &snap.rows {
        match row.state {
            crate::agent_attention::model::AttentionState::NeedsInput => {
                out.busy = true;
                if out.waiting_agent.is_none() {
                    out.waiting_agent = Some(row.agent.clone());
                }
            }
            crate::agent_attention::model::AttentionState::Working => out.busy = true,
            crate::agent_attention::model::AttentionState::Error => out.errored = true,
            crate::agent_attention::model::AttentionState::Complete => out.completed = true,
            _ => {}
        }
    }
    // waiting_kinds 是投影后的权威等待类型
    if let Some(first) = snap.waiting_kinds.first() {
        out.waiting_kind = Some(first.clone());
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_bundle_yields_all_unknown() {
        let s = resolve(&EvidenceBundle::default());
        assert_eq!(s.presence, PresenceState::Unknown);
        assert_eq!(s.activity, ActivityState::Unknown);
        assert_eq!(s.focus, FocusState::Unknown);
        assert!(s.sources.is_empty());
    }

    #[test]
    fn away_suppresses_everything() {
        let b = EvidenceBundle {
            presence: PresenceEvidence::Away,
            ..Default::default()
        };
        let s = resolve(&b);
        assert_eq!(s.presence, PresenceState::Away);
        assert!(s.suppress_visible_interrupts);
        assert!(s.privacy.shielded);
        assert!(s.privacy.mic_muted);
        // 人不在时不得推断专注状态
        assert_eq!(s.focus, FocusState::Unknown);
    }

    #[test]
    fn dirty_git_repo_implies_coding() {
        let b = EvidenceBundle {
            repo: RepoEvidence {
                is_git: true,
                dirty: true,
                changed_count: 3,
                agent_busy: false,
            },
            ..Default::default()
        };
        let s = resolve(&b);
        assert_eq!(s.activity, ActivityState::Coding);
        assert_eq!(s.focus, FocusState::Normal, "写代码≠深度专注");
    }

    #[test]
    fn agent_on_repo_implies_deep_work() {
        let b = EvidenceBundle {
            repo: RepoEvidence {
                is_git: true,
                dirty: true,
                changed_count: 3,
                agent_busy: true,
            },
            ..Default::default()
        };
        let s = resolve(&b);
        assert_eq!(s.focus, FocusState::DeepWork);
        assert!(s.should_suppress_interrupt());
    }

    #[test]
    fn dictating_is_not_deep_work_but_not_blocked_forever() {
        let b = EvidenceBundle {
            presence: PresenceEvidence::Here,
            dictating: true,
            ..Default::default()
        };
        let s = resolve(&b);
        assert_eq!(s.focus, FocusState::Normal);
    }

    #[test]
    fn attention_error_beats_working() {
        let b = EvidenceBundle {
            attention: AttentionEvidence {
                busy: true,
                errored: true,
                ..Default::default()
            },
            ..Default::default()
        };
        let s = resolve(&b);
        assert_eq!(s.agent.state, AgentState::Error);
    }

    #[test]
    fn waiting_wins_over_busy() {
        let b = EvidenceBundle {
            attention: AttentionEvidence {
                busy: true,
                waiting_kind: Some("waitingApproval".into()),
                waiting_agent: Some("codex".into()),
                ..Default::default()
            },
            ..Default::default()
        };
        let s = resolve(&b);
        assert_eq!(s.agent.state, AgentState::NeedsInput);
        assert_eq!(s.agent.waiting_agent.as_deref(), Some("codex"));
    }

    #[test]
    fn revision_increases_monotonically() {
        let a = resolve(&EvidenceBundle::default());
        let b = resolve(&EvidenceBundle::default());
        assert!(b.revision > a.revision);
    }

    #[test]
    fn sources_reflect_only_available_evidence() {
        let b = EvidenceBundle {
            repo: RepoEvidence {
                is_git: true,
                ..Default::default()
            },
            ..Default::default()
        };
        let s = resolve(&b);
        assert!(s.sources.contains(&"repo"));
        assert!(!s.sources.contains(&"attention"));
        assert!(!s.sources.contains(&"presence"));
    }
}
