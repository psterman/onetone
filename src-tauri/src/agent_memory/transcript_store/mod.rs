//! Transcript SessionStore — full-file atomic generation swap (Slice 2A).
//! Lifecycle `agent_sessions` is a separate product surface; do not mix.

mod ingest;
pub(crate) mod schema;

#[allow(unused_imports)] // wired for later watcher / IPC slices
pub(crate) use ingest::{
    ingest_parsed, ingest_session_file, session_last_observed_at_ms, IngestOutcome,
};
#[allow(unused_imports)]
pub(crate) use schema::STORE_SCHEMA_VERSION;
