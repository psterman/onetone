//! Private Session JSONL parser adapter (agent-sessions → OneTone DTOs).
//!
//! Design: `docs/session-parser-adapter-design.md`.
//! Only this module tree may import `agent_sessions::*`.

pub(crate) mod identity;
pub(crate) mod parse;
mod policy;
pub(crate) mod types;

#[allow(unused_imports)] // public surface for later SessionStore / IPC slices
pub(crate) use parse::{ingest_fingerprint, parse_session_file};
#[allow(unused_imports)]
pub(crate) use types::{
    AdapterDiagnosticCode, AdapterMappingDiagnostic, ContentTruncation, EventIdentity,
    EventKindSelection, EventTime, FactLayer, LocatedEvent, MessageEvent, MessageRole,
    ParseCompleteness, ParseCoverage, ParseDiagnostic, ParseIntent, ProviderUsageSemantics,
    SessionAdapterError, SessionEvent, SessionIdentity, SessionKey, SessionKeySource,
    SessionParseOptions, SessionParseOutput, SessionParseStatus, SessionProvider, SessionSource,
    SourceId, SourceSnapshot, TimestampProvenance, ToolArguments, ToolCallEvent, ToolResultContent,
    ToolResultEvent, TruncationReason, UsageObservation,
};

#[cfg(test)]
mod tests {
    use super::*;
    use crate::agent_memory::session_parse::parse::{
        canonical_source_id, classify_event, map_token_semantics, EventClassify,
    };
    use agent_sessions::TokenSemantics;
    use std::path::{Path, PathBuf};

    fn testdata(name: &str) -> PathBuf {
        Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("src/agent_memory/session_parse/testdata")
            .join(name)
    }

    #[test]
    fn complete_claude_retains_message_text() {
        let source = SessionSource {
            provider: SessionProvider::ClaudeCode,
            path: testdata("complete_claude.jsonl"),
        };
        let out = parse_session_file(&source, &SessionParseOptions::default()).expect("parse");
        assert_eq!(out.completeness.parser_status, SessionParseStatus::Complete);
        assert_eq!(out.completeness.intent, ParseIntent::FullSnapshot);
        assert!(out.completeness.coverage.is_fully_complete());
        assert!(out
            .source_snapshot
            .canonical_source_id
            .as_str()
            .starts_with("ss1_"));
        assert!(out.source_snapshot.prefix_digest.is_some());
        assert!(out.source_snapshot.source_modified_at_ms.is_some());
        assert!(out.source_snapshot.captured_len > 0);
        assert!(matches!(
            out.events[0].time.provenance,
            TimestampProvenance::ProviderRecord
        ));
        // 2026-09-25T00:00:00Z from fixture timestamp field (Located.at), not mtime.
        assert_eq!(out.events[0].time.observed_at_ms, Some(1_790_294_400_000));
        assert!(out
            .session_identity
            .session_key
            .as_str()
            .starts_with("sk1_"));
        assert_eq!(out.session_identity.source, SessionKeySource::ProviderId);
        if let Some(mtime) = out.source_snapshot.source_modified_at_ms {
            for e in &out.events {
                if let Some(obs) = e.time.observed_at_ms {
                    assert_ne!(obs as u64, mtime);
                }
            }
        }

        let texts: Vec<&str> = out
            .events
            .iter()
            .filter_map(|e| match &e.event {
                SessionEvent::Message(m) => Some(m.text.as_str()),
                _ => None,
            })
            .collect();
        assert!(texts.iter().any(|t| *t == "fixture-hello"));
        assert!(texts.iter().any(|t| *t == "fixture-reply"));

        if out.ignored_type_histogram.is_empty()
            && out.unknown_type_histogram.is_empty()
            && out.completeness.adapter_mapping_error_count == 0
        {
            assert!(out.completeness.whole_snapshot_commit_allowed);
        } else {
            assert!(!out.completeness.whole_snapshot_commit_allowed);
        }
    }

    #[test]
    fn tool_roundtrip_preserves_name_and_result() {
        let source = SessionSource {
            provider: SessionProvider::ClaudeCode,
            path: testdata("tool_roundtrip_claude.jsonl"),
        };
        let out = parse_session_file(&source, &SessionParseOptions::default()).expect("parse");
        let call = out.events.iter().find_map(|e| match &e.event {
            SessionEvent::ToolCall(t) => Some(t),
            _ => None,
        });
        let result = out.events.iter().find_map(|e| match &e.event {
            SessionEvent::ToolResult(t) => Some(t),
            _ => None,
        });
        assert!(call.is_some(), "expected ToolCall in fixture projection");
        let call = call.unwrap();
        assert_eq!(call.name, "Read");
        assert!(matches!(call.arguments, ToolArguments::Json(_)));
        match &result.expect("tool result").content {
            ToolResultContent::Present { text, .. } => {
                assert_eq!(text, "fixture-tool-result");
            }
            ToolResultContent::Omitted => panic!("expected Present tool result"),
        }
    }

    #[test]
    fn tool_flags_omit_payloads_and_deny_commit() {
        let source = SessionSource {
            provider: SessionProvider::ClaudeCode,
            path: testdata("tool_roundtrip_claude.jsonl"),
        };
        let mut opts = SessionParseOptions::default();
        opts.include_tool_arguments = false;
        opts.include_tool_results = false;
        let out = parse_session_file(&source, &opts).expect("parse");
        for e in &out.events {
            match &e.event {
                SessionEvent::ToolCall(t) => {
                    assert!(matches!(t.arguments, ToolArguments::Omitted));
                    assert!(!t.name.is_empty());
                }
                SessionEvent::ToolResult(t) => {
                    assert!(matches!(t.content, ToolResultContent::Omitted));
                }
                _ => {}
            }
        }
        assert!(!out.completeness.coverage.tool_arguments_included);
        assert!(!out.completeness.coverage.tool_results_included);
        assert!(!out.completeness.whole_snapshot_commit_allowed);
    }

    #[test]
    fn partial_event_kinds_deny_commit() {
        let source = SessionSource {
            provider: SessionProvider::ClaudeCode,
            path: testdata("complete_claude.jsonl"),
        };
        let mut opts = SessionParseOptions::default();
        opts.event_kinds = EventKindSelection::MESSAGE;
        let out = parse_session_file(&source, &opts).expect("parse");
        assert!(!out.completeness.coverage.all_event_kinds);
        assert!(!out.completeness.whole_snapshot_commit_allowed);
    }

    #[test]
    fn stop_at_byte_before_end_denies_commit() {
        let source = SessionSource {
            provider: SessionProvider::ClaudeCode,
            path: testdata("complete_claude.jsonl"),
        };
        let full = parse_session_file(&source, &SessionParseOptions::default()).expect("full");
        let stop = full.source_snapshot.last_complete_byte;
        assert!(stop > 0);
        assert!(stop <= full.source_snapshot.captured_len);
        // Force a bound strictly before captured end when possible.
        let bound = if stop < full.source_snapshot.captured_len {
            stop
        } else {
            stop.saturating_sub(1).max(1)
        };
        let mut opts = SessionParseOptions::default();
        opts.stop_at_byte = Some(bound);
        let prefix = parse_session_file(&source, &opts).expect("prefix");
        if bound < prefix.source_snapshot.captured_len {
            assert!(!prefix.completeness.coverage.reached_captured_end);
            assert!(!prefix.completeness.whole_snapshot_commit_allowed);
        }
    }

    #[test]
    fn max_events_denies_commit() {
        let source = SessionSource {
            provider: SessionProvider::ClaudeCode,
            path: testdata("complete_claude.jsonl"),
        };
        let mut opts = SessionParseOptions::default();
        opts.max_events = Some(1);
        let out = parse_session_file(&source, &opts).expect("parse");
        assert_eq!(out.events.len(), 1);
        assert!(!out.completeness.coverage.event_limit_absent);
        assert!(!out.completeness.whole_snapshot_commit_allowed);
    }

    #[test]
    fn truncation_denies_commit() {
        let source = SessionSource {
            provider: SessionProvider::ClaudeCode,
            path: testdata("complete_claude.jsonl"),
        };
        let mut opts = SessionParseOptions::default();
        opts.max_event_text_bytes = 4;
        let out = parse_session_file(&source, &opts).expect("parse");
        assert!(!out.completeness.coverage.content_complete);
        assert!(out.completeness.adapter_mapping_error_count > 0);
        assert!(!out.completeness.whole_snapshot_commit_allowed);
    }

    #[test]
    fn unknown_type_denies_commit() {
        let source = SessionSource {
            provider: SessionProvider::ClaudeCode,
            path: testdata("unknown_type.jsonl"),
        };
        let out = parse_session_file(&source, &SessionParseOptions::default()).expect("parse");
        assert!(!out.unknown_type_histogram.is_empty());
        assert!(!out.completeness.whole_snapshot_commit_allowed);
    }

    #[test]
    fn incomplete_tail_status() {
        let source = SessionSource {
            provider: SessionProvider::ClaudeCode,
            path: testdata("incomplete_unterminated_tail.jsonl"),
        };
        let mut opts = SessionParseOptions::default();
        opts.allow_incomplete_tail = true;
        let out = parse_session_file(&source, &opts).expect("parse");
        assert_eq!(
            out.completeness.parser_status,
            SessionParseStatus::IncompleteTail
        );
        assert!(!out.completeness.whole_snapshot_commit_allowed);
    }

    #[test]
    fn stop_at_byte_prefix_from_zero() {
        let source = SessionSource {
            provider: SessionProvider::ClaudeCode,
            path: testdata("complete_claude.jsonl"),
        };
        let full = parse_session_file(&source, &SessionParseOptions::default()).expect("full");
        let stop = full.source_snapshot.last_complete_byte;
        assert!(stop > 0);
        let mut opts = SessionParseOptions::default();
        opts.intent = ParseIntent::PrefixVerification;
        opts.stop_at_byte = Some(stop);
        let prefix = parse_session_file(&source, &opts).expect("prefix");
        assert_eq!(
            prefix.events.len(),
            full.events.len(),
            "typed prefix from byte 0 with stop_at_byte should match full event count"
        );
        assert!(!prefix.completeness.whole_snapshot_commit_allowed);
    }

    #[test]
    fn source_id_stable_and_provider_scoped() {
        let path = testdata("complete_claude.jsonl");
        let a = canonical_source_id(SessionProvider::ClaudeCode, &path).expect("id");
        let b = canonical_source_id(SessionProvider::ClaudeCode, &path).expect("id");
        let c = canonical_source_id(SessionProvider::Codex, &path).expect("id");
        assert_eq!(a, b);
        assert_ne!(a, c);
        assert!(a.as_str().starts_with("ss1_"));
        assert!(!a.as_str().contains(':'), "id must not leak drive letters");
    }

    #[test]
    fn map_token_semantics_known_arms() {
        assert_eq!(
            map_token_semantics(TokenSemantics::ClaudeExclusive),
            ProviderUsageSemantics::ClaudeExclusive
        );
        assert_eq!(
            map_token_semantics(TokenSemantics::CodexInclusive),
            ProviderUsageSemantics::CodexInclusive
        );
    }

    #[test]
    fn classify_smoke() {
        let _ = EventClassify::Unsupported;
        let _ = classify_event;
    }

    #[test]
    fn source_boundary_no_agent_sessions_outside_adapter() {
        let src_root = Path::new(env!("CARGO_MANIFEST_DIR")).join("src");
        let adapter = src_root.join("agent_memory").join("session_parse");
        let mut offenders = Vec::new();
        walk_rs(&src_root, &mut |path, text| {
            if path.starts_with(&adapter) {
                return;
            }
            for (i, line) in text.lines().enumerate() {
                let trimmed = line.trim_start();
                if trimmed.starts_with("//") {
                    continue;
                }
                if line.contains("use agent_sessions") || line.contains("agent_sessions::") {
                    offenders.push(format!("{}:{}", path.display(), i + 1));
                }
            }
        });
        assert!(
            offenders.is_empty(),
            "agent_sessions imports must stay inside agent_memory::session_parse; found:\n{}",
            offenders.join("\n")
        );
    }

    #[test]
    fn source_contract_no_silent_meta_or_claude_defaults() {
        let adapter = Path::new(env!("CARGO_MANIFEST_DIR")).join("src/agent_memory/session_parse");
        let files = ["parse.rs", "policy.rs", "types.rs", "identity.rs"];
        let mut offenders = Vec::new();
        for name in files {
            let path = adapter.join(name);
            let text = std::fs::read_to_string(&path).expect("read adapter source");
            let flat: String = text.split_whitespace().collect::<Vec<_>>().join(" ");
            if flat.contains("_ => SessionEvent::Meta") {
                offenders.push(format!("{}: forbidden Meta default arm", path.display()));
            }
            if flat.contains("_ => ProviderUsageSemantics::ClaudeExclusive") {
                offenders.push(format!(
                    "{}: forbidden ClaudeExclusive default arm",
                    path.display()
                ));
            }
            if flat.contains("unsupported ToolArgs:") {
                offenders.push(format!(
                    "{}: ToolArgs Debug dump forbidden in diagnostics",
                    path.display()
                ));
            }
            for (i, line) in text.lines().enumerate() {
                let t = line.trim_start();
                if t.starts_with("//") {
                    continue;
                }
                if t.contains("println!")
                    || t.contains("eprintln!")
                    || t.starts_with("log::")
                    || t.contains(" log::")
                {
                    offenders.push(format!(
                        "{}:{}: logging macro forbidden in adapter",
                        path.display(),
                        i + 1
                    ));
                }
            }
        }
        assert!(
            offenders.is_empty(),
            "adapter source contract failed:\n{}",
            offenders.join("\n")
        );
    }

    fn walk_rs(dir: &Path, f: &mut dyn FnMut(&Path, &str)) {
        let Ok(entries) = std::fs::read_dir(dir) else {
            return;
        };
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                walk_rs(&path, f);
            } else if path.extension().and_then(|e| e.to_str()) == Some("rs") {
                if let Ok(text) = std::fs::read_to_string(&path) {
                    f(&path, &text);
                }
            }
        }
    }

    fn temp_jsonl(name: &str, body: &str) -> PathBuf {
        use std::sync::atomic::{AtomicU64, Ordering};
        static N: AtomicU64 = AtomicU64::new(0);
        let dir = std::env::temp_dir().join(format!(
            "onetone-session-parse-{}-{}",
            std::process::id(),
            N.fetch_add(1, Ordering::Relaxed)
        ));
        let _ = std::fs::create_dir_all(&dir);
        let path = dir.join(name);
        std::fs::write(&path, body).unwrap();
        path
    }

    #[test]
    fn empty_file_digest_is_sha256_empty() {
        let path = temp_jsonl("empty.jsonl", "");
        let source = SessionSource {
            provider: SessionProvider::ClaudeCode,
            path,
        };
        let out = parse_session_file(&source, &SessionParseOptions::default()).expect("parse");
        let digest = out.source_snapshot.prefix_digest.expect("digest");
        let expected = {
            use sha2::{Digest, Sha256};
            let d = Sha256::digest([]);
            let mut a = [0u8; 32];
            a.copy_from_slice(&d);
            a
        };
        assert_eq!(digest, expected);
        assert_eq!(out.source_snapshot.last_complete_byte, 0);
        assert_eq!(out.source_snapshot.captured_len, 0);
    }

    #[test]
    fn live_file_mtime_change_after_snapshot_is_retryable() {
        // Freshness fast-reject: an equal-length in-place rewrite with a changed
        // mtime is retryable even though immutable snapshot bytes remain coherent.
        let original = "{\"type\":\"user\",\"message\":{\"content\":\"AA\"},\"timestamp\":\"2026-09-25T00:00:00Z\",\"sessionId\":\"m1\"}\n";
        let mutated = "{\"type\":\"user\",\"message\":{\"content\":\"BB\"},\"timestamp\":\"2026-09-25T00:00:00Z\",\"sessionId\":\"m1\"}\n";
        assert_eq!(original.len(), mutated.len(), "fixture must be equal-length");
        let path = temp_jsonl("mutate.jsonl", original);
        let path_for_hook = path.clone();
        crate::agent_memory::session_parse::parse::set_after_snapshot_before_parse_hook(Some(
            Box::new(move || {
                std::fs::write(&path_for_hook, mutated).unwrap();
                let f = std::fs::File::options()
                    .write(true)
                    .open(&path_for_hook)
                    .unwrap();
                f.set_modified(std::time::SystemTime::now() + std::time::Duration::from_secs(1))
                    .unwrap();
            }),
        ));
        let source = SessionSource {
            provider: SessionProvider::ClaudeCode,
            path,
        };
        let err = parse_session_file(&source, &SessionParseOptions::default()).unwrap_err();
        crate::agent_memory::session_parse::parse::set_after_snapshot_before_parse_hook(None);
        assert!(matches!(err, SessionAdapterError::SourceChangedDuringRead));
    }

    #[test]
    fn append_after_snapshot_accepts_captured_prefix() {
        let original = "{\"type\":\"user\",\"message\":{\"content\":\"first\"},\"timestamp\":\"2026-09-25T00:00:00Z\",\"sessionId\":\"append1\"}\n";
        let appended = "{\"type\":\"assistant\",\"message\":{\"content\":\"later\"},\"timestamp\":\"2026-09-25T00:00:01Z\",\"sessionId\":\"append1\"}\n";
        let path = temp_jsonl("append-after-snapshot.jsonl", original);
        let path_for_hook = path.clone();
        crate::agent_memory::session_parse::parse::set_after_snapshot_before_parse_hook(Some(
            Box::new(move || {
                use std::io::Write;
                let mut f = std::fs::OpenOptions::new()
                    .append(true)
                    .open(&path_for_hook)
                    .unwrap();
                f.write_all(appended.as_bytes()).unwrap();
                f.flush().unwrap();
            }),
        ));

        let source = SessionSource {
            provider: SessionProvider::ClaudeCode,
            path: path.clone(),
        };
        let out = parse_session_file(&source, &SessionParseOptions::default()).expect("parse");
        crate::agent_memory::session_parse::parse::set_after_snapshot_before_parse_hook(None);

        assert_eq!(out.source_snapshot.captured_len, original.len() as u64);
        let digest = out.source_snapshot.prefix_digest.expect("digest");
        use sha2::{Digest, Sha256};
        let expected = Sha256::digest(
            &original.as_bytes()[..out.source_snapshot.last_complete_byte as usize],
        );
        assert_eq!(digest.as_slice(), expected.as_slice());

        let live_bytes = std::fs::read(path).unwrap();
        assert_eq!(live_bytes.len(), original.len() + appended.len());
        let live_hash = Sha256::digest(&live_bytes);
        assert_ne!(digest.as_slice(), live_hash.as_slice());
    }

    #[test]
    fn equal_length_rewrite_after_snapshot_keeps_original_digest() {
        // Same-source contract: events + digest come from immutable snapshot, not live file.
        let original = "{\"type\":\"user\",\"message\":{\"content\":\"AAAA\"},\"timestamp\":\"2026-09-25T00:00:00Z\",\"sessionId\":\"eq1\"}\n";
        let mutated = "{\"type\":\"user\",\"message\":{\"content\":\"BBBB\"},\"timestamp\":\"2026-09-25T00:00:00Z\",\"sessionId\":\"eq1\"}\n";
        assert_eq!(original.len(), mutated.len(), "fixture must be equal-length");
        let path = temp_jsonl("eq-rewrite.jsonl", original);
        let mtime = std::fs::metadata(&path).unwrap().modified().unwrap();
        let path_for_hook = path.clone();
        crate::agent_memory::session_parse::parse::set_after_snapshot_before_parse_hook(Some(
            Box::new(move || {
                std::fs::write(&path_for_hook, mutated).unwrap();
                let f = std::fs::File::options()
                    .write(true)
                    .open(&path_for_hook)
                    .unwrap();
                f.set_modified(mtime).unwrap();
            }),
        ));
        let source = SessionSource {
            provider: SessionProvider::ClaudeCode,
            path: path.clone(),
        };
        let out = parse_session_file(&source, &SessionParseOptions::default()).expect("parse");
        crate::agent_memory::session_parse::parse::set_after_snapshot_before_parse_hook(None);
        let digest = out.source_snapshot.prefix_digest.expect("digest");
        use sha2::{Digest, Sha256};
        let end = out.source_snapshot.last_complete_byte as usize;
        let expected = Sha256::digest(&original.as_bytes()[..end]);
        assert_eq!(
            digest.as_slice(),
            expected.as_slice(),
            "prefix_digest must match original snapshot, not rewritten live file"
        );
        // Must not have digested mutated content.
        let mutated_hash = Sha256::digest(&mutated.as_bytes()[..end.min(mutated.len())]);
        assert_ne!(digest.as_slice(), mutated_hash.as_slice());
    }

    #[test]
    fn read_exact_prefix_early_eof_is_source_changed() {
        let path = temp_jsonl("eof-exact.jsonl", "abcdefghijklmnopqrstuvwxyz\n");
        let file = std::fs::File::open(&path).unwrap();
        {
            let f2 = std::fs::OpenOptions::new().write(true).open(&path).unwrap();
            f2.set_len(4).unwrap();
        }
        let err =
            crate::agent_memory::session_parse::parse::read_exact_prefix(&file, 20).unwrap_err();
        assert!(matches!(err, SessionAdapterError::SourceChangedDuringRead));
    }

    #[test]
    fn prefix_verification_small_stop_cannot_bypass_max_file_bytes() {
        // Snapshot always reads [0, captured_len); a tiny stop_at_byte must not
        // let PrefixVerification allocate past max_file_bytes.
        let body = "x".repeat(500);
        let path = temp_jsonl("too-large-prefix.jsonl", &body);
        let source = SessionSource {
            provider: SessionProvider::ClaudeCode,
            path,
        };
        let mut opts = SessionParseOptions::default();
        opts.intent = ParseIntent::PrefixVerification;
        opts.max_file_bytes = 100;
        opts.stop_at_byte = Some(50);
        let err = parse_session_file(&source, &opts).unwrap_err();
        assert!(
            matches!(err, SessionAdapterError::TooLarge { limit: 100 }),
            "expected TooLarge before full-file snapshot alloc, got {err:?}"
        );
    }

    #[test]
    fn normal_fixture_prefix_digest_matches_known_sha256() {
        let source = SessionSource {
            provider: SessionProvider::ClaudeCode,
            path: testdata("complete_claude.jsonl"),
        };
        let out = parse_session_file(&source, &SessionParseOptions::default()).expect("parse");
        assert!(out.completeness.whole_snapshot_commit_allowed);
        let digest = out.source_snapshot.prefix_digest.expect("digest");
        let bytes = std::fs::read(&source.path).unwrap();
        let end = out.source_snapshot.last_complete_byte as usize;
        use sha2::{Digest, Sha256};
        let expected = Sha256::digest(&bytes[..end]);
        assert_eq!(digest.as_slice(), expected.as_slice());
        assert_eq!(out.source_snapshot.captured_len, bytes.len() as u64);
    }

    #[test]
    fn hash_prefix_early_eof_is_source_changed() {
        let path = temp_jsonl("eof.jsonl", "abcdefghijklmnopqrstuvwxyz\n");
        let file = std::fs::File::open(&path).unwrap();
        // Shrink under the open handle via a second open (Windows shared write).
        {
            let f2 = std::fs::OpenOptions::new().write(true).open(&path).unwrap();
            f2.set_len(4).unwrap();
        }
        let err = crate::agent_memory::session_parse::parse::hash_prefix(&file, 20).unwrap_err();
        assert!(matches!(err, SessionAdapterError::SourceChangedDuringRead));
    }

    #[test]
    fn illegal_timestamp_never_invents_provider_time() {
        // Claude Strict: garbage timestamp → line/diagnostic error, not a forged observed_at.
        let path = temp_jsonl(
            "bad-ts.jsonl",
            "{\"type\":\"user\",\"message\":{\"content\":\"x\"},\"timestamp\":\"not-a-date\",\"sessionId\":\"t1\"}\n",
        );
        let source = SessionSource {
            provider: SessionProvider::ClaudeCode,
            path,
        };
        let out = parse_session_file(&source, &SessionParseOptions::default()).expect("parse");
        for e in &out.events {
            assert_ne!(
                e.time.provenance,
                TimestampProvenance::ProviderRecord,
                "illegal timestamp must not map to ProviderRecord"
            );
            assert_eq!(e.time.observed_at_ms, None);
        }
        assert!(
            !out.completeness.whole_snapshot_commit_allowed,
            "illegal timestamp must deny commit (line error or empty projection)"
        );
    }

    #[test]
    fn missing_timestamp_is_missing_provenance() {
        let path = temp_jsonl(
            "no-ts.jsonl",
            "{\"type\":\"user\",\"message\":{\"content\":\"x\"},\"sessionId\":\"t1\"}\n",
        );
        let source = SessionSource {
            provider: SessionProvider::ClaudeCode,
            path,
        };
        let out = parse_session_file(&source, &SessionParseOptions::default()).expect("parse");
        assert!(
            !out.events.is_empty(),
            "event without timestamp still projects"
        );
        assert_eq!(out.events[0].time.observed_at_ms, None);
        assert_eq!(out.events[0].time.provenance, TimestampProvenance::Missing);
    }

    #[test]
    fn overflow_epoch_timestamp_maps_to_missing() {
        // Numeric epoch near i64::MAX seconds → DateTime may exist; ms conversion must not panic/invent.
        let path = temp_jsonl(
            "overflow-ts.jsonl",
            &format!(
                "{{\"type\":\"user\",\"message\":{{\"content\":\"x\"}},\"timestamp\":{},\"sessionId\":\"t1\"}}\n",
                i64::MAX
            ),
        );
        let source = SessionSource {
            provider: SessionProvider::ClaudeCode,
            path,
        };
        let out = parse_session_file(&source, &SessionParseOptions::default()).expect("parse");
        for e in &out.events {
            assert_eq!(
                e.time.provenance,
                TimestampProvenance::Missing,
                "overflow epoch must not become ProviderRecord"
            );
            assert_eq!(e.time.observed_at_ms, None);
        }
    }

    #[test]
    fn owner_conflict_via_full_parser_denies_commit() {
        let path = temp_jsonl(
            "owner-conflict.jsonl",
            concat!(
                "{\"type\":\"user\",\"message\":{\"content\":\"a\"},\"timestamp\":\"2026-09-25T00:00:00Z\",\"sessionId\":\"owner-a\"}\n",
                "{\"type\":\"user\",\"message\":{\"content\":\"b\"},\"timestamp\":\"2026-09-25T00:00:01Z\",\"sessionId\":\"owner-b\"}\n",
            ),
        );
        let source = SessionSource {
            provider: SessionProvider::ClaudeCode,
            path,
        };
        let out = parse_session_file(&source, &SessionParseOptions::default()).expect("parse");
        assert!(out.session_identity.owner_conflict);
        assert!(!out.completeness.whole_snapshot_commit_allowed);
        assert!(out
            .mapping_diagnostics
            .iter()
            .any(|d| { matches!(d.code, AdapterDiagnosticCode::SessionOwnerConflict) }));
    }

    #[test]
    fn ingest_fingerprint_includes_captured_len() {
        let digest = [7u8; 32];
        let a = ingest_fingerprint(
            SessionProvider::ClaudeCode,
            &digest,
            100,
            80,
            "agent-sessions-test",
            "projection-test",
            "store-test",
        );
        let b = ingest_fingerprint(
            SessionProvider::ClaudeCode,
            &digest,
            101,
            80,
            "agent-sessions-test",
            "projection-test",
            "store-test",
        );
        assert_ne!(a, b, "captured_len is part of snapshot identity");
    }
}
