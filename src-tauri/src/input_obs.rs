//! Low-frequency input observability events (debug / recording UI only).

#[derive(Debug, Clone)]
pub struct InputDebugMeta {
    pub key: String,
    pub device: String,
    pub report_hex: String,
    pub source: String,
}

#[derive(Debug, Clone)]
pub struct InputObsEvent {
    pub kind: &'static str,
    pub key: String,
    pub device: String,
    pub report_hex: String,
    pub reason: String,
    pub source: String,
}
