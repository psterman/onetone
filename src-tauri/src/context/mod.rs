//! # Context Engine — OneTone 跨传感器统一状态层
//!
//! ## 为什么存在
//!
//! 仓库里长期存在 20+ 个信号源、4 套并行状态机（`AttentionState` /
//! `PadState` / `HealthState` / `TmStatus`），彼此**直接互调**。同一条事实
//! 「AI 到底在不在等你」被复制四份，裁决规则散落在四个文件里。
//!
//! 本模块引入单一收敛点：
//!
//! ```text
//! Evidence（各源事实，互不相识）
//!     ↓  resolver
//! ContextSnapshot（一份原子快照）
//!     ↓
//! Decision（场景）→ Action
//! ```
//!
//! ## 硬约束
//!
//! 1. **不拥有状态。** 本模块只做投影，任何需要长期持有真相的地方都不该放这里。
//! 2. **不新增信号。** 缺项即 `Unknown`，绝不猜成 `Here` / `Idle`。
//! 3. **presence 压倒一切。** 人不在时 `suppress_visible_interrupts` 恒为真。
//! 4. **保守。** 「在写代码」是活动，「深度专注」是状态——没有硬证据就不给。
//!
//! ## 分期
//!
//! - Phase 1（本模块）：Attention / Foreground / TmStatus / InputObs 派生活动
//! - Phase 2：接入 `PresenceEvidence`（摄像头）——唯一能回答「人在不在」的信源
//! - Phase 3：Decision 层（场景即规则组合）

pub mod model;
pub mod presence;
pub mod resolver;

pub use model::{ContextSnapshot, PresenceEvidence};
pub use presence::{Presence, PresenceConfidence};
pub use resolver::{
    attention_evidence_from_snapshot, resolve, ActivityEvidence, EvidenceBundle,
    ForegroundEvidenceInput, RepoEvidence,
};

use parking_lot::Mutex;

/// 上一份快照。供 UI 轮询与增量比较使用。
static LAST: Mutex<Option<ContextSnapshot>> = Mutex::new(None);

/// 用当前进程内可得的证据求值并缓存一份快照。
///
/// 接线范围：
/// - **presence** ← `presence::read()`（摄像头，Phase 1 已接入）
/// - AI 注意力 ← `agent_attention::store::public_snapshot()`
/// - 代码库 ← 由调用方注入 TmStatus 投影
/// - 说话中 ← `dictating`，与 `project_needs_input_kind(dictating)` 既有约定一致
///
/// 前台应用证据仍为 Phase 2：摄像头已是证据源，但 `ForegroundEvidence`
/// 要走另一条链路。
pub fn snapshot_live(dictating: bool, repo: Option<RepoEvidence>) -> ContextSnapshot {
    let attention = crate::agent_attention::store::public_snapshot();
    let bundle = EvidenceBundle {
        presence: presence::read().0.into(),
        attention: attention_evidence_from_snapshot(&attention),
        foreground: ForegroundEvidenceInput::default(), // Phase 2
        repo: repo.unwrap_or_default(),
        activity: ActivityEvidence::Unavailable,
        dictating,
    };
    let snap = resolve(&bundle);
    *LAST.lock() = Some(snap.clone());
    snap
}

/// 读取最近一次快照。无则返回空快照（fail closed，不猜）。
pub fn last_snapshot() -> ContextSnapshot {
    LAST.lock()
        .clone()
        .unwrap_or_else(|| ContextSnapshot::empty(0))
}

#[cfg(test)]
mod tests {
    use super::*;
    use model::{PresenceState, CONTEXT_SNAPSHOT_VERSION};

    #[test]
    fn live_snapshot_is_valid_without_presence() {
        let s = snapshot_live(false, None);
        assert_eq!(s.presence, PresenceState::Unknown);
        assert!(
            !s.suppress_visible_interrupts,
            "Phase 1 不应因缺摄像头就压制"
        );
    }

    #[test]
    fn last_snapshot_roundtrips() {
        let _ = snapshot_live(false, None);
        let last = last_snapshot();
        assert_eq!(last.version, CONTEXT_SNAPSHOT_VERSION);
        assert!(last.revision > 0);
    }
}
