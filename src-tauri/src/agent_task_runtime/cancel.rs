//! Per-task cancellation (Notify + flag), mirror assist_runtime pattern.

use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, OnceLock};

use tokio::sync::Notify;

#[derive(Clone)]
pub struct TaskCancel {
    inner: Arc<Inner>,
}

struct Inner {
    flag: AtomicBool,
    notify: Notify,
}

impl std::fmt::Debug for TaskCancel {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("TaskCancel")
            .field("cancelled", &self.is_cancelled())
            .finish()
    }
}

impl TaskCancel {
    pub fn new() -> Self {
        Self {
            inner: Arc::new(Inner {
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

struct Slot {
    cancel: TaskCancel,
}

fn table() -> &'static Mutex<HashMap<String, Arc<Slot>>> {
    static T: OnceLock<Mutex<HashMap<String, Arc<Slot>>>> = OnceLock::new();
    T.get_or_init(|| Mutex::new(HashMap::new()))
}

pub fn register(task_id: &str) -> Result<TaskCancel, String> {
    let id = task_id.trim();
    if id.is_empty() {
        return Err("invalid_task_id".into());
    }
    let mut g = table().lock().unwrap_or_else(|e| e.into_inner());
    if g.contains_key(id) {
        return Err("duplicate_task_id".into());
    }
    let cancel = TaskCancel::new();
    g.insert(
        id.to_string(),
        Arc::new(Slot {
            cancel: cancel.clone(),
        }),
    );
    Ok(cancel)
}

pub fn get(task_id: &str) -> Option<TaskCancel> {
    table()
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .get(task_id)
        .map(|s| s.cancel.clone())
}

pub fn finish(task_id: &str) {
    table()
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .remove(task_id);
}

pub fn cancel(task_id: &str) -> bool {
    if let Some(c) = get(task_id) {
        c.cancel();
        true
    } else {
        false
    }
}
