//! Request lifecycle: cancel competes with HTTP + deadline (not AtomicBool-only).

use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, OnceLock};

use tokio::sync::Notify;

use super::contracts::{AssistCancelResponse, AssistReason};

#[derive(Clone, Debug)]
pub struct AssistCancel {
    inner: Arc<AssistCancelInner>,
}

struct AssistCancelInner {
    flag: AtomicBool,
    notify: Notify,
}

impl std::fmt::Debug for AssistCancelInner {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("AssistCancelInner")
            .field("cancelled", &self.flag.load(Ordering::SeqCst))
            .finish()
    }
}

impl AssistCancel {
    pub fn new() -> Self {
        Self {
            inner: Arc::new(AssistCancelInner {
                flag: AtomicBool::new(false),
                notify: Notify::new(),
            }),
        }
    }

    pub fn cancel(&self) {
        self.inner.flag.store(true, Ordering::SeqCst);
        self.inner.notify.notify_waiters();
    }

    pub fn is_cancelled(&self) -> bool {
        self.inner.flag.load(Ordering::SeqCst)
    }

    pub async fn cancelled(&self) {
        loop {
            if self.is_cancelled() {
                return;
            }
            self.inner.notify.notified().await;
        }
    }
}

struct ActiveSlot {
    cancel: AssistCancel,
    finished: AtomicBool,
}

fn table() -> &'static Mutex<HashMap<String, Arc<ActiveSlot>>> {
    static T: OnceLock<Mutex<HashMap<String, Arc<ActiveSlot>>>> = OnceLock::new();
    T.get_or_init(|| Mutex::new(HashMap::new()))
}

/// Register a new request. Duplicate id → Err(DuplicateRequest).
pub fn register(request_id: &str) -> Result<AssistCancel, AssistReason> {
    let id = request_id.trim();
    if id.is_empty() {
        return Err(AssistReason::InvalidRequest);
    }
    let mut g = table().lock().unwrap_or_else(|e| e.into_inner());
    if g.contains_key(id) {
        return Err(AssistReason::DuplicateRequest);
    }
    let cancel = AssistCancel::new();
    g.insert(
        id.to_string(),
        Arc::new(ActiveSlot {
            cancel: cancel.clone(),
            finished: AtomicBool::new(false),
        }),
    );
    Ok(cancel)
}

pub fn mark_finished(request_id: &str) {
    let mut g = table().lock().unwrap_or_else(|e| e.into_inner());
    if let Some(slot) = g.remove(request_id) {
        slot.finished.store(true, Ordering::SeqCst);
    }
}

/// Remember finished ids briefly so late cancel returns already_finished.
fn finished_set() -> &'static Mutex<HashMap<String, ()>> {
    static F: OnceLock<Mutex<HashMap<String, ()>>> = OnceLock::new();
    F.get_or_init(|| Mutex::new(HashMap::new()))
}

pub fn remember_finished(request_id: &str) {
    let mut g = finished_set().lock().unwrap_or_else(|e| e.into_inner());
    g.insert(request_id.to_string(), ());
    // ponytail: bounded map — drop oldest when large; upgrade to TTL if churn high.
    if g.len() > 64 {
        let keys: Vec<String> = g.keys().take(g.len() - 32).cloned().collect();
        for k in keys {
            g.remove(&k);
        }
    }
}

pub fn finish(request_id: &str) {
    mark_finished(request_id);
    remember_finished(request_id);
}

pub fn cancel(request_id: &str) -> AssistCancelResponse {
    let id = request_id.trim();
    if id.is_empty() {
        return AssistCancelResponse {
            ok: false,
            state: None,
            reason: Some(AssistReason::InvalidRequest.as_str().into()),
        };
    }
    {
        let g = table().lock().unwrap_or_else(|e| e.into_inner());
        if let Some(slot) = g.get(id) {
            slot.cancel.cancel();
            return AssistCancelResponse {
                ok: true,
                state: Some("cancelling".into()),
                reason: None,
            };
        }
    }
    let finished = finished_set()
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .contains_key(id);
    if finished {
        return AssistCancelResponse {
            ok: true,
            state: Some("already_finished".into()),
            reason: None,
        };
    }
    AssistCancelResponse {
        ok: false,
        state: None,
        reason: Some(AssistReason::NotFound.as_str().into()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn duplicate_register_rejected() {
        let id = "assist_dup_test_1";
        let _ = cancel(id);
        finish(id);
        register(id).unwrap();
        assert_eq!(register(id).unwrap_err(), AssistReason::DuplicateRequest);
        finish(id);
    }

    #[test]
    fn unknown_cancel_not_found() {
        let r = cancel("assist_never_existed_xyz");
        assert!(!r.ok);
        assert_eq!(r.reason.as_deref(), Some("not_found"));
    }

    #[test]
    fn finished_then_cancel_already_finished() {
        let id = "assist_fin_test_1";
        register(id).unwrap();
        finish(id);
        let r = cancel(id);
        assert!(r.ok);
        assert_eq!(r.state.as_deref(), Some("already_finished"));
    }
}
