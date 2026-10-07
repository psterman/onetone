//! transcript_* tables — generation belongs to source_id.

pub(crate) const STORE_SCHEMA_VERSION: &str = "store_schema_v1";

/// Migration applied as agent_memory schema version 6.
pub(crate) const MIGRATION_V6_TRANSCRIPT: &str = r#"
CREATE TABLE IF NOT EXISTS transcript_sessions (
  session_key TEXT PRIMARY KEY NOT NULL,
  provider TEXT NOT NULL,
  session_key_source TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS transcript_generations (
  source_id TEXT NOT NULL,
  generation INTEGER NOT NULL,
  -- Historical ingest identity captured when this generation was created.
  -- Not authoritative for queries; use transcript_sources.session_key,
  -- whose FK points to transcript_sessions(session_key).
  session_key TEXT NOT NULL,
  ingest_fingerprint BLOB NOT NULL,
  prefix_digest BLOB NOT NULL,
  captured_len INTEGER NOT NULL,
  last_complete_byte INTEGER NOT NULL,
  parser_version TEXT NOT NULL,
  adapter_projection_version TEXT NOT NULL,
  store_schema_version TEXT NOT NULL,
  PRIMARY KEY (source_id, generation),
  UNIQUE (source_id, ingest_fingerprint)
);

CREATE TABLE IF NOT EXISTS transcript_sources (
  source_id TEXT PRIMARY KEY NOT NULL,
  session_key TEXT NOT NULL,
  active_generation INTEGER,
  FOREIGN KEY (session_key) REFERENCES transcript_sessions(session_key),
  FOREIGN KEY (source_id, active_generation)
    REFERENCES transcript_generations(source_id, generation)
    DEFERRABLE INITIALLY DEFERRED
);

CREATE TABLE IF NOT EXISTS transcript_events (
  source_id TEXT NOT NULL,
  generation INTEGER NOT NULL,
  record_index INTEGER NOT NULL,
  event_index INTEGER NOT NULL,
  observed_at_ms INTEGER,
  time_provenance TEXT NOT NULL,
  event_json TEXT NOT NULL,
  PRIMARY KEY (source_id, generation, record_index, event_index),
  FOREIGN KEY (source_id, generation)
    REFERENCES transcript_generations(source_id, generation)
);

CREATE INDEX IF NOT EXISTS idx_transcript_sources_session
  ON transcript_sources(session_key);
CREATE INDEX IF NOT EXISTS idx_transcript_events_obs
  ON transcript_events(source_id, generation, observed_at_ms);
"#;
