//! macOS Soft Pad evidence adapter (stub until CGEventTap path lands).

use crate::soft_pad_runtime::model::ForegroundEvidence;
use std::time::Instant;

pub fn read_foreground_evidence() -> ForegroundEvidence {
    ForegroundEvidence {
        agent_kind: None,
        observed_at: Instant::now(),
        sequence: 0,
    }
}
