//! macOS Soft Pad evidence adapter (stub until CGEventTap path lands).

use crate::soft_pad_runtime::model::ForegroundEvidence;
use std::time::Instant;

pub fn read_foreground_evidence() -> ForegroundEvidence {
    ForegroundEvidence {
        agent_kind: None,
        app_target_id: None,
        foreign_host: false,
        observed_at: Instant::now(),
        sequence: 0,
    }
}
