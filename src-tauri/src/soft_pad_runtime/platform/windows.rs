//! Windows Soft Pad evidence adapter.

use crate::app_identity::foreground_app_target_id;
use crate::soft_pad_runtime::model::{AgentKind, ForegroundEvidence};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::Instant;

static FG_SEQ: AtomicU64 = AtomicU64::new(1);

pub fn read_foreground_evidence() -> ForegroundEvidence {
    let agent_kind = foreground_app_target_id()
        .as_deref()
        .and_then(AgentKind::from_app_target);
    ForegroundEvidence {
        agent_kind,
        observed_at: Instant::now(),
        sequence: FG_SEQ.fetch_add(1, Ordering::Relaxed),
    }
}
