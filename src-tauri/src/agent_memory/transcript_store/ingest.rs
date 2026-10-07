//! Full-file ingest with BEGIN IMMEDIATE generation swap per source_id.

use super::schema::STORE_SCHEMA_VERSION;
use crate::agent_memory::session_parse::parse::{
    ingest_fingerprint, parse_session_file, AGENT_SESSIONS_VERSION,
};
use crate::agent_memory::session_parse::types::{
    ParseCompleteness, ParseIntent, SessionAdapterError, SessionKeySource, SessionParseOptions,
    SessionParseOutput, SessionProvider, SessionSource, TimestampProvenance,
    ADAPTER_PROJECTION_VERSION,
};
use crate::agent_memory::store::{now_ms, with_write};
use rusqlite::{params, Connection, OptionalExtension, TransactionBehavior};

#[cfg(test)]
thread_local! {
    /// Injected fault point: `"after_events"` aborts before active_generation flip.
    static INGEST_FAIL_AT: std::cell::Cell<Option<&'static str>> = const { std::cell::Cell::new(None) };
}

#[cfg(test)]
pub(crate) fn set_ingest_fail_at(point: Option<&'static str>) {
    INGEST_FAIL_AT.with(|c| c.set(point));
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum IngestOutcome {
    Committed {
        session_key: String,
        source_id: String,
        generation: i64,
        event_count: usize,
    },
    NoChange {
        session_key: String,
        source_id: String,
        generation: i64,
    },
    Rejected {
        completeness: ParseCompleteness,
    },
    RetryableSourceChanged,
}

pub(crate) fn ingest_session_file(
    source: &SessionSource,
    options: &SessionParseOptions,
) -> Result<IngestOutcome, String> {
    let mut opts = options.clone();
    opts.intent = ParseIntent::FullSnapshot;

    let parsed = match parse_session_file(source, &opts) {
        Ok(p) => p,
        Err(SessionAdapterError::SourceChangedDuringRead) => {
            return Ok(IngestOutcome::RetryableSourceChanged);
        }
        Err(e) => return Err(e.to_string()),
    };

    with_write(|conn| ingest_parsed(conn, source, &parsed))
}

/// Persist a commit-allowed parse (or Rejected / NoChange). Used by tests on in-memory DBs.
pub(crate) fn ingest_parsed(
    conn: &mut Connection,
    source: &SessionSource,
    parsed: &SessionParseOutput,
) -> Result<IngestOutcome, String> {
    ingest_parsed_with_versions(
        conn,
        source,
        parsed,
        ADAPTER_PROJECTION_VERSION,
        STORE_SCHEMA_VERSION,
    )
}

pub(crate) fn ingest_parsed_with_versions(
    conn: &mut Connection,
    source: &SessionSource,
    parsed: &SessionParseOutput,
    adapter_projection_version: &str,
    store_schema_version: &str,
) -> Result<IngestOutcome, String> {
    if !parsed.completeness.whole_snapshot_commit_allowed {
        return Ok(IngestOutcome::Rejected {
            completeness: parsed.completeness.clone(),
        });
    }

    let digest = parsed
        .source_snapshot
        .prefix_digest
        .ok_or_else(|| "commit-allowed parse missing prefix_digest".to_string())?;
    let fingerprint = ingest_fingerprint(
        source.provider,
        &digest,
        parsed.source_snapshot.captured_len,
        parsed.source_snapshot.last_complete_byte,
        AGENT_SESSIONS_VERSION,
        adapter_projection_version,
        store_schema_version,
    );

    let mut event_rows = Vec::with_capacity(parsed.events.len());
    for ev in &parsed.events {
        let json = serde_json::to_string(ev).map_err(|e| format!("event json: {e}"))?;
        event_rows.push((
            ev.identity.record_index as i64,
            ev.identity.event_index as i64,
            ev.time.observed_at_ms,
            provenance_str(ev.time.provenance),
            json,
        ));
    }

    let session_key = parsed.session_identity.session_key.as_str().to_string();
    let key_source = match parsed.session_identity.source {
        SessionKeySource::ProviderId => "provider_id",
        SessionKeySource::SourceFallback => "source_fallback",
    };
    let provider = match source.provider {
        SessionProvider::Codex => "codex",
        SessionProvider::ClaudeCode => "claude_code",
    };
    let source_id = parsed
        .source_snapshot
        .canonical_source_id
        .as_str()
        .to_string();

    let tx = conn
        .transaction_with_behavior(TransactionBehavior::Immediate)
        .map_err(|e| format!("begin immediate: {e}"))?;

    tx.execute(
        "INSERT OR IGNORE INTO transcript_sessions(session_key, provider, session_key_source)
         VALUES (?1, ?2, ?3)",
        params![session_key, provider, key_source],
    )
    .map_err(|e| format!("insert session: {e}"))?;

    let existing: Option<(Option<i64>, Option<Vec<u8>>, Option<String>)> = tx
        .query_row(
            "SELECT s.active_generation, g.ingest_fingerprint, s.session_key
             FROM transcript_sources s
             LEFT JOIN transcript_generations g
               ON g.source_id = s.source_id AND g.generation = s.active_generation
             WHERE s.source_id = ?1",
            params![source_id],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
        )
        .optional()
        .map_err(|e| format!("load source: {e}"))?;

    if let Some((Some(gen), Some(fp), _)) = &existing {
        if fp.as_slice() == fingerprint.as_slice() {
            upgrade_session_key_if_needed(&tx, &source_id, &session_key, provider, key_source)?;
            tx.commit().map_err(|e| format!("commit: {e}"))?;
            return Ok(IngestOutcome::NoChange {
                session_key,
                source_id,
                generation: *gen,
            });
        }
    }

    let next_gen: i64 = match &existing {
        Some((Some(g), _, _)) => g + 1,
        _ => 1,
    };

    if existing.is_none() {
        tx.execute(
            "INSERT INTO transcript_sources(source_id, session_key, active_generation)
             VALUES (?1, ?2, NULL)",
            params![source_id, session_key],
        )
        .map_err(|e| format!("insert source: {e}"))?;
    } else {
        upgrade_session_key_if_needed(&tx, &source_id, &session_key, provider, key_source)?;
    }

    tx.execute(
        "INSERT INTO transcript_generations(
            source_id, generation, session_key, ingest_fingerprint, prefix_digest,
            captured_len, last_complete_byte, parser_version,
            adapter_projection_version, store_schema_version
         ) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)",
        params![
            source_id,
            next_gen,
            session_key,
            fingerprint,
            digest.as_slice(),
            parsed.source_snapshot.captured_len as i64,
            parsed.source_snapshot.last_complete_byte as i64,
            AGENT_SESSIONS_VERSION,
            adapter_projection_version,
            store_schema_version,
        ],
    )
    .map_err(|e| format!("insert generation: {e}"))?;

    {
        let mut stmt = tx
            .prepare(
                "INSERT INTO transcript_events(
                    source_id, generation, record_index, event_index,
                    observed_at_ms, time_provenance, event_json
                 ) VALUES (?1,?2,?3,?4,?5,?6,?7)",
            )
            .map_err(|e| format!("prepare events: {e}"))?;
        for (ri, ei, obs, prov, json) in &event_rows {
            stmt.execute(params![source_id, next_gen, ri, ei, obs, prov, json])
                .map_err(|e| format!("insert event: {e}"))?;
        }
    }

    #[cfg(test)]
    {
        let fail = INGEST_FAIL_AT.with(|c| c.get());
        if fail == Some("after_events") {
            return Err("injected fault after events before active_generation".into());
        }
    }

    let updated = tx
        .execute(
            "UPDATE transcript_sources SET active_generation = ?1, session_key = ?2
             WHERE source_id = ?3",
            params![next_gen, session_key, source_id],
        )
        .map_err(|e| format!("update active gen: {e}"))?;
    if updated != 1 {
        return Err(format!(
            "expected 1 source row updated for active_generation, got {updated}"
        ));
    }

    tx.execute(
        "DELETE FROM transcript_events WHERE source_id = ?1 AND generation != ?2",
        params![source_id, next_gen],
    )
    .map_err(|e| format!("delete old events: {e}"))?;
    tx.execute(
        "DELETE FROM transcript_generations WHERE source_id = ?1 AND generation != ?2",
        params![source_id, next_gen],
    )
    .map_err(|e| format!("delete old gens: {e}"))?;

    tx.execute(
        "DELETE FROM transcript_sessions
         WHERE session_key_source = 'source_fallback'
           AND session_key NOT IN (SELECT session_key FROM transcript_sources)",
        [],
    )
    .map_err(|e| format!("cleanup orphan sessions: {e}"))?;

    let _ = now_ms();
    tx.commit().map_err(|e| format!("commit: {e}"))?;

    Ok(IngestOutcome::Committed {
        session_key,
        source_id,
        generation: next_gen,
        event_count: event_rows.len(),
    })
}

fn upgrade_session_key_if_needed(
    tx: &rusqlite::Transaction<'_>,
    source_id: &str,
    new_key: &str,
    provider: &str,
    key_source: &str,
) -> Result<(), String> {
    let old_key: String = tx
        .query_row(
            "SELECT session_key FROM transcript_sources WHERE source_id = ?1",
            params![source_id],
            |r| r.get(0),
        )
        .map_err(|e| format!("read source key: {e}"))?;
    if old_key == new_key {
        return Ok(());
    }
    tx.execute(
        "INSERT OR IGNORE INTO transcript_sessions(session_key, provider, session_key_source)
         VALUES (?1, ?2, ?3)",
        params![new_key, provider, key_source],
    )
    .map_err(|e| format!("ensure new session: {e}"))?;
    tx.execute(
        "UPDATE transcript_sources SET session_key = ?1 WHERE source_id = ?2",
        params![new_key, source_id],
    )
    .map_err(|e| format!("rebind source key: {e}"))?;
    tx.execute(
        "DELETE FROM transcript_sessions
         WHERE session_key = ?1
           AND session_key NOT IN (SELECT session_key FROM transcript_sources)",
        params![old_key],
    )
    .map_err(|e| format!("drop empty old session: {e}"))?;
    Ok(())
}

fn provenance_str(p: TimestampProvenance) -> &'static str {
    match p {
        TimestampProvenance::ProviderRecord => "provider_record",
        TimestampProvenance::SessionMetadata => "session_metadata",
        TimestampProvenance::Missing => "missing",
    }
}

/// Query-time MAX observed_at across all active generations for a logical session.
pub(crate) fn session_last_observed_at_ms(session_key: &str) -> Result<Option<i64>, String> {
    with_write(|conn| session_last_observed_at_ms_on(conn, session_key))
}

pub(crate) fn session_last_observed_at_ms_on(
    conn: &Connection,
    session_key: &str,
) -> Result<Option<i64>, String> {
    conn.query_row(
        "SELECT MAX(e.observed_at_ms)
         FROM transcript_sources s
         JOIN transcript_events e
           ON e.source_id = s.source_id AND e.generation = s.active_generation
         WHERE s.session_key = ?1 AND s.active_generation IS NOT NULL",
        params![session_key],
        |r| r.get::<_, Option<i64>>(0),
    )
    .map_err(|e| format!("session last observed: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::agent_memory::session_parse::identity::session_key_from_provider;
    use crate::agent_memory::store::migrate;
    use std::io::Write;
    use std::path::PathBuf;

    fn testdata(name: &str) -> PathBuf {
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("src/agent_memory/session_parse/testdata")
            .join(name)
    }

    fn open_mem() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA foreign_keys=ON;").unwrap();
        migrate(&conn).unwrap();
        conn
    }

    fn parse_fixture(name: &str) -> (SessionSource, SessionParseOutput) {
        let source = SessionSource {
            provider: SessionProvider::ClaudeCode,
            path: testdata(name),
        };
        let out = parse_session_file(&source, &SessionParseOptions::default()).unwrap();
        (source, out)
    }

    #[test]
    fn first_gen_deferred_fk_and_nochange() {
        let mut conn = open_mem();
        let (source, parsed) = parse_fixture("complete_claude.jsonl");
        assert!(parsed.completeness.whole_snapshot_commit_allowed);
        assert!(parsed.source_snapshot.prefix_digest.is_some());

        let a = ingest_parsed(&mut conn, &source, &parsed).unwrap();
        let IngestOutcome::Committed {
            generation,
            event_count,
            session_key,
            source_id,
        } = a
        else {
            panic!("expected Committed, got {a:?}");
        };
        assert_eq!(generation, 1);
        assert!(event_count >= 2);

        let active: i64 = conn
            .query_row(
                "SELECT active_generation FROM transcript_sources WHERE source_id = ?1",
                params![source_id],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(active, 1);

        let b = ingest_parsed(&mut conn, &source, &parsed).unwrap();
        assert_eq!(
            b,
            IngestOutcome::NoChange {
                session_key: session_key.clone(),
                source_id: source_id.clone(),
                generation: 1,
            }
        );

        let max = session_last_observed_at_ms_on(&conn, &session_key)
            .unwrap()
            .expect("max observed");
        // fixture: 2026-09-25T00:00:01Z (MAX of two records)
        assert_eq!(max, 1_790_294_401_000);
    }

    #[test]
    fn reject_non_commit_parse() {
        let mut conn = open_mem();
        let (source, mut parsed) = parse_fixture("complete_claude.jsonl");
        parsed.completeness.whole_snapshot_commit_allowed = false;
        let out = ingest_parsed(&mut conn, &source, &parsed).unwrap();
        assert!(matches!(out, IngestOutcome::Rejected { .. }));
        let n: i64 = conn
            .query_row("SELECT COUNT(1) FROM transcript_sources", [], |r| r.get(0))
            .unwrap();
        assert_eq!(n, 0);
    }

    #[test]
    fn multi_source_same_session_key() {
        let mut conn = open_mem();
        let (s1, p1) = parse_fixture("complete_claude.jsonl");
        let (s2, p2) = parse_fixture("tool_roundtrip_claude.jsonl");
        // Force same session_key while keeping distinct source_ids (generation scoped by source).
        let shared = session_key_from_provider(SessionProvider::ClaudeCode, "shared-session");
        let mut p1 = p1;
        let mut p2 = p2;
        p1.session_identity.session_key = shared.clone();
        p1.session_identity.source = SessionKeySource::ProviderId;
        p2.session_identity.session_key = shared.clone();
        p2.session_identity.source = SessionKeySource::ProviderId;

        let a = ingest_parsed(&mut conn, &s1, &p1).unwrap();
        let b = ingest_parsed(&mut conn, &s2, &p2).unwrap();
        let IngestOutcome::Committed { source_id: id1, .. } = a else {
            panic!("{a:?}");
        };
        let IngestOutcome::Committed { source_id: id2, .. } = b else {
            panic!("{b:?}");
        };
        assert_ne!(id1, id2);
        let sources: i64 = conn
            .query_row(
                "SELECT COUNT(1) FROM transcript_sources WHERE session_key = ?1",
                params![shared.as_str()],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(sources, 2);
        let max = session_last_observed_at_ms_on(&conn, shared.as_str())
            .unwrap()
            .expect("max");
        assert!(max > 0);
    }

    #[test]
    fn identity_upgrade_fallback_to_provider() {
        let mut conn = open_mem();
        let (source, mut parsed) = parse_fixture("complete_claude.jsonl");
        let fallback = parsed.session_identity.session_key.clone();
        // First ingest as source_fallback with a synthetic key.
        let fb_key = crate::agent_memory::session_parse::identity::session_key_from_source(
            SessionProvider::ClaudeCode,
            &parsed.source_snapshot.canonical_source_id,
        );
        parsed.session_identity.session_key = fb_key.clone();
        parsed.session_identity.source = SessionKeySource::SourceFallback;
        parsed.session_identity.provider_session_id = None;

        let first = ingest_parsed(&mut conn, &source, &parsed).unwrap();
        assert!(matches!(first, IngestOutcome::Committed { .. }));

        // Re-ingest with ProviderId key (same fingerprint → NoChange + upgrade path).
        let provider_key = session_key_from_provider(SessionProvider::ClaudeCode, "poc-complete");
        // Must change fingerprint to exercise gen swap OR use fingerprint match upgrade.
        // Fingerprint match still runs upgrade_session_key_if_needed.
        let mut again = parse_session_file(&source, &SessionParseOptions::default()).unwrap();
        // Keep same digest/fingerprint; only change identity to provider key.
        again.session_identity.session_key = provider_key.clone();
        again.session_identity.source = SessionKeySource::ProviderId;

        let out = ingest_parsed(&mut conn, &source, &again).unwrap();
        assert!(matches!(out, IngestOutcome::NoChange { .. }));

        let bound: String = conn
            .query_row(
                "SELECT session_key FROM transcript_sources WHERE source_id = ?1",
                params![again.source_snapshot.canonical_source_id.as_str()],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(bound, provider_key.as_str());
        let orphans: i64 = conn
            .query_row(
                "SELECT COUNT(1) FROM transcript_sessions WHERE session_key = ?1",
                params![fb_key.as_str()],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(orphans, 0, "fallback session should be cleaned up");
        let _ = fallback;
    }

    #[test]
    fn gen_swap_on_content_change() {
        let mut conn = open_mem();
        let dir = tempfile_dir();
        let path = dir.join("swap.jsonl");
        {
            let mut f = std::fs::File::create(&path).unwrap();
            writeln!(
                f,
                r#"{{"type":"user","message":{{"content":"a"}},"timestamp":"2026-09-25T00:00:00Z","sessionId":"swap-1"}}"#
            )
            .unwrap();
        }
        let source = SessionSource {
            provider: SessionProvider::ClaudeCode,
            path: path.clone(),
        };
        let p1 = parse_session_file(&source, &SessionParseOptions::default()).unwrap();
        let c1 = ingest_parsed(&mut conn, &source, &p1).unwrap();
        let IngestOutcome::Committed { generation: g1, .. } = c1 else {
            panic!("{c1:?}");
        };
        assert_eq!(g1, 1);

        {
            let mut f = std::fs::OpenOptions::new()
                .append(true)
                .open(&path)
                .unwrap();
            writeln!(
                f,
                r#"{{"type":"assistant","message":{{"content":"b","id":"m1","model":"m"}},"timestamp":"2026-09-25T00:00:02Z","sessionId":"swap-1"}}"#
            )
            .unwrap();
        }
        let p2 = parse_session_file(&source, &SessionParseOptions::default()).unwrap();
        let c2 = ingest_parsed(&mut conn, &source, &p2).unwrap();
        let IngestOutcome::Committed {
            generation: g2,
            event_count,
            ..
        } = c2
        else {
            panic!("{c2:?}");
        };
        assert_eq!(g2, 2);
        assert!(event_count >= 2);
        let gens: i64 = conn
            .query_row("SELECT COUNT(1) FROM transcript_generations", [], |r| {
                r.get(0)
            })
            .unwrap();
        assert_eq!(gens, 1, "old generation must be deleted");
    }

    fn tempfile_dir() -> PathBuf {
        use std::sync::atomic::{AtomicU64, Ordering};
        static N: AtomicU64 = AtomicU64::new(0);
        let dir = std::env::temp_dir().join(format!(
            "onetone-transcript-test-{}-{}",
            std::process::id(),
            N.fetch_add(1, Ordering::Relaxed)
        ));
        let _ = std::fs::create_dir_all(&dir);
        dir
    }

    fn write_jsonl(path: &PathBuf, lines: &[&str]) {
        let mut f = std::fs::File::create(path).unwrap();
        for line in lines {
            writeln!(f, "{line}").unwrap();
        }
    }

    fn open_file_db(path: &PathBuf) -> Connection {
        let conn = Connection::open(path).unwrap();
        conn.execute_batch("PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL;")
            .unwrap();
        migrate(&conn).unwrap();
        conn
    }

    #[test]
    fn fault_after_events_rolls_back_keeps_prior_active() {
        let mut conn = open_mem();
        let (source, parsed) = parse_fixture("complete_claude.jsonl");
        let first = ingest_parsed(&mut conn, &source, &parsed).unwrap();
        let IngestOutcome::Committed {
            generation: g1,
            source_id,
            session_key,
            ..
        } = first
        else {
            panic!("{first:?}");
        };

        // Mutate fingerprint input so a new gen would be attempted.
        let mut again = parsed.clone();
        let mut dig = again.source_snapshot.prefix_digest.unwrap();
        dig[0] ^= 0xff;
        again.source_snapshot.prefix_digest = Some(dig);

        set_ingest_fail_at(Some("after_events"));
        let err = ingest_parsed(&mut conn, &source, &again).unwrap_err();
        set_ingest_fail_at(None);
        assert!(err.contains("injected fault"));

        let active: i64 = conn
            .query_row(
                "SELECT active_generation FROM transcript_sources WHERE source_id = ?1",
                params![source_id],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(active, g1);
        let gens: i64 = conn
            .query_row("SELECT COUNT(1) FROM transcript_generations", [], |r| {
                r.get(0)
            })
            .unwrap();
        assert_eq!(gens, 1, "failed txn must not leave orphan generation");
        let readable = session_last_observed_at_ms_on(&conn, &session_key)
            .unwrap()
            .expect("prior active still readable");
        assert_eq!(readable, 1_790_294_401_000);
    }

    #[test]
    fn reject_update_keeps_old_active_readable() {
        let mut conn = open_mem();
        let (source, parsed) = parse_fixture("complete_claude.jsonl");
        let first = ingest_parsed(&mut conn, &source, &parsed).unwrap();
        let IngestOutcome::Committed {
            generation: g1,
            source_id,
            session_key,
            event_count,
            ..
        } = first
        else {
            panic!("{first:?}");
        };

        let mut bad = parsed.clone();
        bad.completeness.whole_snapshot_commit_allowed = false;
        let out = ingest_parsed(&mut conn, &source, &bad).unwrap();
        assert!(matches!(out, IngestOutcome::Rejected { .. }));

        let active: i64 = conn
            .query_row(
                "SELECT active_generation FROM transcript_sources WHERE source_id = ?1",
                params![source_id],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(active, g1);
        let events: i64 = conn
            .query_row(
                "SELECT COUNT(1) FROM transcript_events WHERE source_id = ?1 AND generation = ?2",
                params![source_id, g1],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(events, event_count as i64);
        assert_eq!(
            session_last_observed_at_ms_on(&conn, &session_key)
                .unwrap()
                .unwrap(),
            1_790_294_401_000
        );
    }

    #[test]
    fn projection_version_bump_new_generation() {
        let mut conn = open_mem();
        let (source, parsed) = parse_fixture("complete_claude.jsonl");
        let a = ingest_parsed_with_versions(
            &mut conn,
            &source,
            &parsed,
            "proj_v1",
            STORE_SCHEMA_VERSION,
        )
        .unwrap();
        let IngestOutcome::Committed {
            generation: g1,
            source_id,
            ..
        } = a
        else {
            panic!("{a:?}");
        };
        assert_eq!(g1, 1);

        let b = ingest_parsed_with_versions(
            &mut conn,
            &source,
            &parsed,
            "proj_v2",
            STORE_SCHEMA_VERSION,
        )
        .unwrap();
        let IngestOutcome::Committed { generation: g2, .. } = b else {
            panic!("{b:?}");
        };
        assert_eq!(g2, 2);
        let active: i64 = conn
            .query_row(
                "SELECT active_generation FROM transcript_sources WHERE source_id = ?1",
                params![source_id],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(active, 2);
        let stored: String = conn
            .query_row(
                "SELECT adapter_projection_version FROM transcript_generations
                 WHERE source_id = ?1 AND generation = 2",
                params![source_id],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(stored, "proj_v2");
    }

    #[test]
    fn store_schema_version_bump_new_generation() {
        let mut conn = open_mem();
        let (source, parsed) = parse_fixture("complete_claude.jsonl");
        let _ = ingest_parsed_with_versions(
            &mut conn,
            &source,
            &parsed,
            ADAPTER_PROJECTION_VERSION,
            "store_schema_v1",
        )
        .unwrap();
        let b = ingest_parsed_with_versions(
            &mut conn,
            &source,
            &parsed,
            ADAPTER_PROJECTION_VERSION,
            "store_schema_v2",
        )
        .unwrap();
        assert!(matches!(b, IngestOutcome::Committed { generation: 2, .. }));
    }

    #[test]
    fn reopen_db_same_fingerprint_is_nochange() {
        let dir = tempfile_dir();
        let db = dir.join("reopen.sqlite3");
        let path = dir.join("sess.jsonl");
        write_jsonl(
            &path,
            &[
                r#"{"type":"user","message":{"content":"a"},"timestamp":"2026-09-25T00:00:00Z","sessionId":"reopen-1"}"#,
            ],
        );
        let source = SessionSource {
            provider: SessionProvider::ClaudeCode,
            path: path.clone(),
        };
        let parsed = parse_session_file(&source, &SessionParseOptions::default()).unwrap();

        {
            let mut conn = open_file_db(&db);
            let out = ingest_parsed(&mut conn, &source, &parsed).unwrap();
            assert!(matches!(
                out,
                IngestOutcome::Committed { generation: 1, .. }
            ));
        }

        let mut conn2 = open_file_db(&db);
        let out2 = ingest_parsed(&mut conn2, &source, &parsed).unwrap();
        assert!(matches!(
            out2,
            IngestOutcome::NoChange { generation: 1, .. }
        ));
    }

    #[test]
    fn concurrent_two_connections_ingest_no_corruption() {
        let dir = tempfile_dir();
        let db = dir.join("concurrent.sqlite3");
        // Ensure schema exists before racing.
        {
            let _ = open_file_db(&db);
        }

        let path_a = dir.join("a.jsonl");
        let path_b = dir.join("b.jsonl");
        write_jsonl(
            &path_a,
            &[
                r#"{"type":"user","message":{"content":"a"},"timestamp":"2026-09-25T00:00:00Z","sessionId":"conc-a"}"#,
            ],
        );
        write_jsonl(
            &path_b,
            &[
                r#"{"type":"user","message":{"content":"b"},"timestamp":"2026-09-25T00:00:02Z","sessionId":"conc-b"}"#,
            ],
        );

        let db_a = db.clone();
        let db_b = db.clone();
        let t1 = std::thread::spawn(move || {
            let source = SessionSource {
                provider: SessionProvider::ClaudeCode,
                path: path_a,
            };
            let parsed = parse_session_file(&source, &SessionParseOptions::default()).unwrap();
            let mut conn = open_file_db(&db_a);
            ingest_parsed(&mut conn, &source, &parsed)
        });
        let t2 = std::thread::spawn(move || {
            let source = SessionSource {
                provider: SessionProvider::ClaudeCode,
                path: path_b,
            };
            let parsed = parse_session_file(&source, &SessionParseOptions::default()).unwrap();
            let mut conn = open_file_db(&db_b);
            ingest_parsed(&mut conn, &source, &parsed)
        });

        let r1 = t1.join().unwrap().unwrap();
        let r2 = t2.join().unwrap().unwrap();
        assert!(matches!(r1, IngestOutcome::Committed { .. }));
        assert!(matches!(r2, IngestOutcome::Committed { .. }));

        let conn = open_file_db(&db);
        let sources: i64 = conn
            .query_row("SELECT COUNT(1) FROM transcript_sources", [], |r| r.get(0))
            .unwrap();
        assert_eq!(sources, 2);
        let dangling: i64 = conn
            .query_row(
                "SELECT COUNT(1) FROM transcript_sources s
                 WHERE s.active_generation IS NOT NULL
                   AND NOT EXISTS (
                     SELECT 1 FROM transcript_generations g
                     WHERE g.source_id = s.source_id AND g.generation = s.active_generation
                   )",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(dangling, 0, "no source may point at missing generation");
    }

    #[test]
    fn session_max_time_decreases_after_rewrite() {
        let mut conn = open_mem();
        let dir = tempfile_dir();
        let path = dir.join("time-rewrite.jsonl");
        write_jsonl(
            &path,
            &[
                r#"{"type":"user","message":{"content":"old"},"timestamp":"2026-09-25T00:00:00Z","sessionId":"time-1"}"#,
                r#"{"type":"assistant","message":{"content":"late","id":"m1","model":"m"},"timestamp":"2026-09-25T00:00:10Z","sessionId":"time-1"}"#,
            ],
        );
        let source = SessionSource {
            provider: SessionProvider::ClaudeCode,
            path: path.clone(),
        };
        let p1 = parse_session_file(&source, &SessionParseOptions::default()).unwrap();
        let c1 = ingest_parsed(&mut conn, &source, &p1).unwrap();
        let IngestOutcome::Committed { session_key, .. } = c1 else {
            panic!("{c1:?}");
        };
        let max1 = session_last_observed_at_ms_on(&conn, &session_key)
            .unwrap()
            .unwrap();
        assert_eq!(max1, 1_790_294_410_000); // 00:00:10Z

        write_jsonl(
            &path,
            &[
                r#"{"type":"user","message":{"content":"only-early"},"timestamp":"2026-09-25T00:00:00Z","sessionId":"time-1"}"#,
            ],
        );
        let p2 = parse_session_file(&source, &SessionParseOptions::default()).unwrap();
        let c2 = ingest_parsed(&mut conn, &source, &p2).unwrap();
        assert!(matches!(c2, IngestOutcome::Committed { generation: 2, .. }));
        let max2 = session_last_observed_at_ms_on(&conn, &session_key)
            .unwrap()
            .unwrap();
        assert_eq!(max2, 1_790_294_400_000); // 00:00:00Z
        assert!(max2 < max1, "session MAX must be allowed to decrease");
    }

    #[test]
    fn source_changed_ingest_maps_to_retryable() {
        let dir = tempfile_dir();
        let path = dir.join("retry.jsonl");
        write_jsonl(
            &path,
            &[
                r#"{"type":"user","message":{"content":"x"},"timestamp":"2026-09-25T00:00:00Z","sessionId":"retry-1"}"#,
            ],
        );
        let path_for_hook = path.clone();
        crate::agent_memory::session_parse::parse::set_between_meta_and_hash_hook(Some(Box::new(
            move || {
                std::fs::write(&path_for_hook, b"").unwrap();
            },
        )));
        let source = SessionSource {
            provider: SessionProvider::ClaudeCode,
            path,
        };
        let out = ingest_session_file(&source, &SessionParseOptions::default()).unwrap();
        crate::agent_memory::session_parse::parse::set_between_meta_and_hash_hook(None);
        assert_eq!(out, IngestOutcome::RetryableSourceChanged);
    }
}
