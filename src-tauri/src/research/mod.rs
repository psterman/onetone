//! Home research mode: pluggable web search, SSRF-safe fetch, export.
//! Not part of ATR edit tool loop.

pub mod export;
pub mod fetch;
pub mod search;
pub mod ssrf;

pub use export::export_report;
pub use fetch::fetch_url;
pub use search::web_search;
