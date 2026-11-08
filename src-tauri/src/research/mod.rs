//! Pluggable web search, SSRF-safe fetch, export.
//! Also used by ATR tools `web_search` / `fetch_url`.

pub mod export;
pub mod fetch;
pub mod search;
pub mod ssrf;

pub use export::export_report;
pub use fetch::fetch_url;
pub use search::web_search;
