//! agent-sessions → OneTone mapping. Crate imports stay inside session_parse.

use super::identity::{OwnerTracker, OwnerWitness};
use super::policy::compute_completeness;
use super::types::*;
use agent_sessions::{
    read_from, Agent, Event, EventKinds, Located, ReadOptions, ReadStatus, Role, StreamError,
    TailMode, TokenSemantics, ToolArgs, VERSION,
};

/// Re-export for store fingerprint / generation rows (keeps agent_sessions import inside adapter).
pub(crate) const AGENT_SESSIONS_VERSION: &str = VERSION;
use sha2::{Digest, Sha256};
use std::fs::File;
use std::io::{BufReader, Cursor, Read, Seek, SeekFrom};
use std::path::Path;
use std::time::UNIX_EPOCH;

#[cfg(test)]
thread_local! {
    /// Test-only: runs after immutable snapshot is taken, before parse (file rewrite cannot affect digest).
    static AFTER_SNAPSHOT_BEFORE_PARSE: std::cell::RefCell<Option<Box<dyn FnMut()>>> =
        const { std::cell::RefCell::new(None) };
}

#[cfg(test)]
pub(crate) fn set_after_snapshot_before_parse_hook(hook: Option<Box<dyn FnMut()>>) {
    AFTER_SNAPSHOT_BEFORE_PARSE.with(|c| *c.borrow_mut() = hook);
}

/// Legacy aliases.
#[cfg(test)]
pub(crate) fn set_after_parse_before_verify_hook(hook: Option<Box<dyn FnMut()>>) {
    set_after_snapshot_before_parse_hook(hook);
}
#[cfg(test)]
pub(crate) fn set_between_meta_and_hash_hook(hook: Option<Box<dyn FnMut()>>) {
    set_after_snapshot_before_parse_hook(hook);
}

pub(crate) fn parse_session_file(
    source: &SessionSource,
    options: &SessionParseOptions,
) -> Result<SessionParseOutput, SessionAdapterError> {
    if options
        .stop_at_byte
        .is_some_and(|s| s > options.max_file_bytes)
    {
        return Err(SessionAdapterError::InvalidOptions(
            "stop_at_byte exceeds max_file_bytes",
        ));
    }

    let file = File::open(&source.path).map_err(SessionAdapterError::Io)?;
    let meta_before = file.metadata().map_err(SessionAdapterError::Io)?;
    if !meta_before.is_file() {
        return Err(SessionAdapterError::Path("not a regular file".into()));
    }
    let captured_len = meta_before.len();
    let mtime_before = meta_before.modified().ok();

    // FullSnapshot: fix read bound to open-time length (isolate concurrent append).
    let effective_stop =
        if matches!(options.intent, ParseIntent::FullSnapshot) && options.stop_at_byte.is_none() {
            Some(captured_len)
        } else {
            options.stop_at_byte
        };

    // Immutable snapshot always allocates [0, captured_len). Enforce the budget on
    // captured_len itself — stop_at_byte must not bypass max_file_bytes (PrefixVerification).
    if captured_len > options.max_file_bytes {
        return Err(SessionAdapterError::TooLarge {
            limit: options.max_file_bytes,
        });
    }

    let source_modified_at_ms = mtime_before.and_then(|t| {
        t.duration_since(UNIX_EPOCH)
            .ok()
            .map(|d| d.as_millis() as u64)
    });

    let source_id = canonical_source_id(source.provider, &source.path)?;

    // Immutable captured snapshot: one exact read of [0, captured_len).
    // Parser and prefix_digest both consume these bytes — not a live file handle.
    let snapshot = read_exact_prefix(&file, captured_len)?;

    #[cfg(test)]
    {
        AFTER_SNAPSHOT_BEFORE_PARSE.with(|c| {
            if let Some(mut hook) = c.borrow_mut().take() {
                hook();
            }
        });
    }

    let agent = to_agent(source.provider);
    let mut opts_for_read = options.clone();
    // Bound to snapshot length (same as captured_len for FullSnapshot).
    opts_for_read.stop_at_byte = effective_stop.map(|s| s.min(captured_len));
    let read_opts = to_read_options(&opts_for_read);

    let mut reader = read_from(
        agent,
        BufReader::new(Cursor::new(snapshot.as_slice())),
        &read_opts,
    )
    .map_err(map_read_error)?;

    let mut events = Vec::new();
    let mut diagnostics = Vec::new();
    let mut mapping_diagnostics = Vec::new();
    let mut adapter_mapping_error_count: u64 = 0;
    let mut content_limit_count: u64 = 0;
    let mut text_budget_remaining = options.max_total_text_bytes;
    let mut stopped_by_max_events = false;
    let mut owner = OwnerTracker::new(source.provider, source_id.clone());

    for item in reader.by_ref() {
        match item {
            Ok(loc) => {
                if let Some(max) = options.max_events {
                    if events.len() >= max {
                        stopped_by_max_events = true;
                        break;
                    }
                }
                owner.observe(owner_witness(source.provider, &loc));
                let (ev, map_diags) =
                    map_located_event(&source_id, &loc, options, &mut text_budget_remaining);
                for d in &map_diags {
                    if matches!(d.code, AdapterDiagnosticCode::ContentLimit) {
                        content_limit_count += 1;
                    }
                }
                adapter_mapping_error_count += map_diags.len() as u64;
                mapping_diagnostics.extend(map_diags);
                events.push(ev);
            }
            Err(StreamError::Line {
                line_no,
                byte_start,
                kind,
            }) => {
                diagnostics.push(ParseDiagnostic {
                    kind: format!("{kind:?}"),
                    line_no: Some(line_no),
                    byte_start: Some(byte_start),
                    layer: FactLayer::ParserDerived,
                });
            }
            Err(StreamError::TooLarge { limit }) => {
                return Err(SessionAdapterError::TooLarge { limit });
            }
            Err(StreamError::Io(e)) => return Err(SessionAdapterError::Io(e)),
            Err(e) => {
                return Err(SessionAdapterError::FatalStream(
                    format!("{e:?}").chars().take(120).collect(),
                ));
            }
        }
    }

    let summary = reader.finish();

    // Freshness gate for the captured range. Shrink and equal-length mtime changes
    // are retryable; pure append leaves frozen [0, captured_len) valid and the
    // newly appended suffix is picked up by the next ingest.
    let meta_after = file.metadata().map_err(SessionAdapterError::Io)?;
    let mtime_after = meta_after.modified().ok();
    if meta_after.len() < captured_len
        || (meta_after.len() == captured_len && mtime_before != mtime_after)
    {
        return Err(SessionAdapterError::SourceChangedDuringRead);
    }

    let last_complete_byte = summary.last_complete_byte.min(captured_len);
    let prefix_digest = sha256_prefix(&snapshot, last_complete_byte);

    let mut parser_status = map_status(summary.status);
    if stopped_by_max_events {
        parser_status = SessionParseStatus::StoppedEarly;
    }

    let session_identity = owner.finish();
    if session_identity.owner_conflict {
        mapping_diagnostics.push(AdapterMappingDiagnostic {
            code: AdapterDiagnosticCode::SessionOwnerConflict,
            record_index: 0,
            event_index: 0,
            detail: Some("conflicting_authoritative_session_id".into()),
        });
        adapter_mapping_error_count += 1;
    }

    let reached_captured_end = match effective_stop {
        None => true,
        Some(stop) => stop >= captured_len,
    };
    let coverage = ParseCoverage {
        all_event_kinds: options.event_kinds.is_all(),
        tool_arguments_included: options.include_tool_arguments,
        tool_results_included: options.include_tool_results,
        reached_captured_end,
        event_limit_absent: options.max_events.is_none() && !stopped_by_max_events,
        content_complete: content_limit_count == 0,
    };

    let ignored_type_histogram = summary.ignored_types.clone();
    let unknown_type_histogram = summary.unknown_types.clone();
    let completeness = compute_completeness(
        source.provider,
        parser_status,
        options.intent,
        coverage,
        summary.line_errors,
        &unknown_type_histogram,
        &ignored_type_histogram,
        adapter_mapping_error_count,
        false,
    );

    Ok(SessionParseOutput {
        events,
        diagnostics,
        mapping_diagnostics,
        completeness,
        source_snapshot: SourceSnapshot {
            provider: source.provider,
            canonical_source_id: source_id,
            captured_len,
            last_complete_byte,
            // Always SHA-256([0,last_complete_byte)); empty prefix = SHA-256([]).
            prefix_digest: Some(prefix_digest),
            source_modified_at_ms,
        },
        session_identity,
        ignored_type_histogram,
        unknown_type_histogram,
    })
}

/// Exact read of `[0, len)` from the open handle. Early EOF → SourceChangedDuringRead.
/// `len` that does not fit `usize` → TooLarge (no truncating cast).
pub(crate) fn read_exact_prefix(file: &File, len: u64) -> Result<Vec<u8>, SessionAdapterError> {
    let len_usize = usize::try_from(len).map_err(|_| SessionAdapterError::TooLarge { limit: len })?;
    let mut f = file.try_clone().map_err(SessionAdapterError::Io)?;
    f.seek(SeekFrom::Start(0))
        .map_err(SessionAdapterError::Io)?;
    let mut buf = vec![0u8; len_usize];
    let mut filled = 0usize;
    while filled < buf.len() {
        let n = f
            .read(&mut buf[filled..])
            .map_err(SessionAdapterError::Io)?;
        if n == 0 {
            return Err(SessionAdapterError::SourceChangedDuringRead);
        }
        filled += n;
    }
    Ok(buf)
}

fn sha256_prefix(snapshot: &[u8], last_complete_byte: u64) -> [u8; 32] {
    let end = usize::try_from(last_complete_byte)
        .unwrap_or(snapshot.len())
        .min(snapshot.len());
    let d = Sha256::digest(&snapshot[..end]);
    let mut out = [0u8; 32];
    out.copy_from_slice(&d);
    out
}

/// Exact SHA-256 of `[start, end)` from a live file (tests / diagnostics). Early EOF → retryable.
pub(crate) fn hash_exact_range(
    file: &File,
    start: u64,
    end: u64,
) -> Result<[u8; 32], SessionAdapterError> {
    if end < start {
        return Err(SessionAdapterError::SourceChangedDuringRead);
    }
    let mut f = file.try_clone().map_err(SessionAdapterError::Io)?;
    f.seek(SeekFrom::Start(start))
        .map_err(SessionAdapterError::Io)?;
    let mut hasher = Sha256::new();
    let mut remaining = end - start;
    let mut buf = [0u8; 64 * 1024];
    while remaining > 0 {
        let chunk = remaining.min(buf.len() as u64) as usize;
        let n = f.read(&mut buf[..chunk]).map_err(SessionAdapterError::Io)?;
        if n == 0 {
            return Err(SessionAdapterError::SourceChangedDuringRead);
        }
        hasher.update(&buf[..n]);
        remaining -= n as u64;
    }
    let d = hasher.finalize();
    let mut out = [0u8; 32];
    out.copy_from_slice(&d);
    Ok(out)
}

pub(crate) fn hash_prefix(
    file: &File,
    last_complete_byte: u64,
) -> Result<[u8; 32], SessionAdapterError> {
    hash_exact_range(file, 0, last_complete_byte)
}

fn owner_witness(provider: SessionProvider, located: &Located<Event>) -> Option<OwnerWitness> {
    match &located.value {
        Event::Meta(m) => m.session_id.as_ref().map(|id| OwnerWitness::Meta {
            session_id: id.clone(),
        }),
        Event::Message(m) => {
            if matches!(provider, SessionProvider::ClaudeCode)
                && !m.is_sidechain
                && located.session_id.is_some()
            {
                Some(OwnerWitness::Message {
                    session_id: located.session_id.clone().unwrap(),
                })
            } else {
                None
            }
        }
        _ => None,
    }
}

fn map_event_time(located: &Located<Event>) -> EventTime {
    match located.at {
        Some(dt) => {
            // Checked ms: overflow / negative → Missing (never invent / panic).
            let ms = dt
                .timestamp()
                .checked_mul(1000)
                .and_then(|base| base.checked_add(i64::from(dt.timestamp_subsec_millis())));
            match ms {
                Some(ms) if ms >= 0 => EventTime {
                    observed_at_ms: Some(ms),
                    provenance: TimestampProvenance::ProviderRecord,
                },
                _ => EventTime {
                    observed_at_ms: None,
                    provenance: TimestampProvenance::Missing,
                },
            }
        }
        None => EventTime {
            observed_at_ms: None,
            provenance: TimestampProvenance::Missing,
        },
    }
}

/// Versioned opaque id: `ss1_` + 16-byte hex. Native path bytes; canonicalize fail-closed.
pub(crate) fn canonical_source_id(
    provider: SessionProvider,
    path: &Path,
) -> Result<SourceId, SessionAdapterError> {
    let canon = std::fs::canonicalize(path).map_err(|e| {
        SessionAdapterError::Path(format!("canonicalize failed for source identity: {e}"))
    })?;
    let mut hasher = Sha256::new();
    hasher.update(b"onetone-session-source-id");
    hasher.update(b"version:1");
    hasher.update(match provider {
        SessionProvider::Codex => b"codex".as_slice(),
        SessionProvider::ClaudeCode => b"claude_code".as_slice(),
    });
    update_path_hash(&mut hasher, &canon);
    let digest = hasher.finalize();
    Ok(SourceId(format!("ss1_{}", hex_encode(&digest[..16]))))
}

#[cfg(windows)]
fn update_path_hash(hasher: &mut Sha256, path: &Path) {
    use std::os::windows::ffi::OsStrExt;
    hasher.update(b"windows-utf16le");
    for unit in path.as_os_str().encode_wide() {
        hasher.update(unit.to_le_bytes());
    }
}

#[cfg(unix)]
fn update_path_hash(hasher: &mut Sha256, path: &Path) {
    use std::os::unix::ffi::OsStrExt;
    hasher.update(b"unix-bytes");
    hasher.update(path.as_os_str().as_bytes());
}

#[cfg(not(any(windows, unix)))]
fn update_path_hash(hasher: &mut Sha256, path: &Path) {
    hasher.update(b"other-osstr");
    hasher.update(path.as_os_str().to_string_lossy().as_bytes());
}

fn hex_encode(bytes: &[u8]) -> String {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    let mut out = String::with_capacity(bytes.len() * 2);
    for &b in bytes {
        out.push(HEX[(b >> 4) as usize] as char);
        out.push(HEX[(b & 0xf) as usize] as char);
    }
    out
}

fn to_agent(p: SessionProvider) -> Agent {
    match p {
        SessionProvider::Codex => Agent::Codex,
        SessionProvider::ClaudeCode => Agent::ClaudeCode,
    }
}

fn to_read_options(options: &SessionParseOptions) -> ReadOptions {
    let mut opts = ReadOptions::default();
    opts.max_file_bytes = Some(options.max_file_bytes);
    opts.max_line_bytes = Some(options.max_line_bytes as usize);
    opts.stop_at_byte = options.stop_at_byte;
    opts.include = event_kinds_from_bits(options.event_kinds.bits());
    opts.tail = if options.allow_incomplete_tail {
        TailMode::AllowIncomplete
    } else {
        TailMode::Strict
    };
    opts
}

fn event_kinds_from_bits(bits: u8) -> EventKinds {
    let mut acc: Option<EventKinds> = None;
    let push = |acc: &mut Option<EventKinds>, flag: EventKinds| {
        *acc = Some(match *acc {
            None => flag,
            Some(a) => a.union(flag),
        });
    };
    if bits & 1 != 0 {
        push(&mut acc, EventKinds::META);
    }
    if bits & 2 != 0 {
        push(&mut acc, EventKinds::MESSAGE);
    }
    if bits & 4 != 0 {
        push(&mut acc, EventKinds::TOOL_CALL);
    }
    if bits & 8 != 0 {
        push(&mut acc, EventKinds::TOOL_RESULT);
    }
    if bits & 16 != 0 {
        push(&mut acc, EventKinds::USAGE);
    }
    acc.unwrap_or(EventKinds::ALL)
}

fn map_read_error(e: agent_sessions::ReadError) -> SessionAdapterError {
    match e {
        agent_sessions::ReadError::Io(io) => SessionAdapterError::Io(io),
        agent_sessions::ReadError::TooLarge { limit } => SessionAdapterError::TooLarge { limit },
        agent_sessions::ReadError::InvalidOptions(m) => SessionAdapterError::InvalidOptions(m),
        other => SessionAdapterError::FatalStream(format!("{other}")),
    }
}

fn map_status(s: ReadStatus) -> SessionParseStatus {
    match s {
        ReadStatus::Complete => SessionParseStatus::Complete,
        ReadStatus::CompleteWithErrors => SessionParseStatus::CompleteWithErrors,
        ReadStatus::IncompleteTail => SessionParseStatus::IncompleteTail,
        ReadStatus::StoppedEarly => SessionParseStatus::StoppedEarly,
        ReadStatus::Failed => SessionParseStatus::Failed,
        _ => SessionParseStatus::Failed,
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum EventClassify {
    Meta,
    Message,
    ToolCall,
    ToolResult,
    Usage,
    Unsupported,
}

pub(crate) fn classify_event(event: &Event) -> EventClassify {
    match event {
        Event::Meta(_) => EventClassify::Meta,
        Event::Message(_) => EventClassify::Message,
        Event::ToolCall(_) => EventClassify::ToolCall,
        Event::ToolResult(_) => EventClassify::ToolResult,
        Event::Usage(_) => EventClassify::Usage,
        _ => EventClassify::Unsupported,
    }
}

pub(crate) fn map_token_semantics(s: TokenSemantics) -> ProviderUsageSemantics {
    match s {
        TokenSemantics::ClaudeExclusive => ProviderUsageSemantics::ClaudeExclusive,
        TokenSemantics::CodexInclusive => ProviderUsageSemantics::CodexInclusive,
        _ => ProviderUsageSemantics::Unsupported,
    }
}

fn map_role(role: Role) -> MessageRole {
    match role {
        Role::User => MessageRole::User,
        Role::Assistant => MessageRole::Assistant,
        Role::System => MessageRole::System,
        Role::Developer => MessageRole::Developer,
        _ => MessageRole::Unsupported,
    }
}

struct RetainOutcome {
    text: String,
    truncation: Option<ContentTruncation>,
    limited: bool,
}

fn retain_text(text: &str, max_event: usize, budget_remaining: &mut usize) -> RetainOutcome {
    let original_bytes = text.len();
    let event_cap = max_event.min(*budget_remaining);
    if original_bytes <= event_cap {
        *budget_remaining = budget_remaining.saturating_sub(original_bytes);
        return RetainOutcome {
            text: text.to_string(),
            truncation: None,
            limited: false,
        };
    }
    let reason = if *budget_remaining < max_event {
        TruncationReason::MaxTotalTextBytes
    } else {
        TruncationReason::MaxEventTextBytes
    };
    let mut end = event_cap.min(original_bytes);
    while end > 0 && !text.is_char_boundary(end) {
        end -= 1;
    }
    let retained = text[..end].to_string();
    *budget_remaining = budget_remaining.saturating_sub(retained.len());
    RetainOutcome {
        text: retained,
        truncation: Some(ContentTruncation {
            original_bytes,
            retained_bytes: end,
            reason,
        }),
        limited: true,
    }
}

fn map_located_event(
    source_id: &SourceId,
    located: &Located<Event>,
    options: &SessionParseOptions,
    text_budget: &mut usize,
) -> (LocatedEvent, Vec<AdapterMappingDiagnostic>) {
    let mut diags = Vec::new();
    let record_index = located.location.record_index;
    let event_index = located.location.event_index as u32;
    let time = map_event_time(located);

    let event = match classify_event(&located.value) {
        EventClassify::Meta => {
            let Event::Meta(m) = &located.value else {
                unreachable!("classify Meta");
            };
            SessionEvent::Meta(SessionMetaEvent {
                model_observed: m.model.is_some(),
            })
        }
        EventClassify::Message => {
            let Event::Message(m) = &located.value else {
                unreachable!("classify Message");
            };
            let role = map_role(m.role);
            if matches!(role, MessageRole::Unsupported) {
                diags.push(AdapterMappingDiagnostic {
                    code: AdapterDiagnosticCode::InvalidProviderMapping,
                    record_index,
                    event_index,
                    detail: Some("unsupported message role".into()),
                });
            }
            let kept = retain_text(&m.text, options.max_event_text_bytes, text_budget);
            if kept.limited {
                diags.push(AdapterMappingDiagnostic {
                    code: AdapterDiagnosticCode::ContentLimit,
                    record_index,
                    event_index,
                    detail: None,
                });
            }
            let segments = if kept.truncation.is_some() {
                Vec::new()
            } else {
                m.text_segments
                    .iter()
                    .map(|r| TextSegment {
                        start: r.start,
                        end: r.end,
                    })
                    .collect()
            };
            SessionEvent::Message(MessageEvent {
                role,
                text: kept.text,
                text_segments: segments,
                is_sidechain: m.is_sidechain,
                truncation: kept.truncation,
            })
        }
        EventClassify::ToolCall => {
            let Event::ToolCall(t) = &located.value else {
                unreachable!("classify ToolCall");
            };
            let (arguments, truncation, limited) = if !options.include_tool_arguments {
                (ToolArguments::Omitted, None, false)
            } else {
                match &t.arguments {
                    ToolArgs::Json(v) => {
                        let s = v.to_string();
                        let kept = retain_text(&s, options.max_event_text_bytes, text_budget);
                        if kept.limited {
                            (ToolArguments::Raw(kept.text), kept.truncation, true)
                        } else if let Ok(parsed) = serde_json::from_str(&kept.text) {
                            (ToolArguments::Json(parsed), None, false)
                        } else {
                            (ToolArguments::Raw(kept.text), None, false)
                        }
                    }
                    ToolArgs::RawString(s) => {
                        let kept = retain_text(s, options.max_event_text_bytes, text_budget);
                        (ToolArguments::Raw(kept.text), kept.truncation, kept.limited)
                    }
                    ToolArgs::Missing => (ToolArguments::Missing, None, false),
                    _ => {
                        diags.push(AdapterMappingDiagnostic {
                            code: AdapterDiagnosticCode::UnsupportedEventVariant,
                            record_index,
                            event_index,
                            detail: Some("unsupported_tool_args_variant".into()),
                        });
                        (ToolArguments::Missing, None, false)
                    }
                }
            };
            if limited {
                diags.push(AdapterMappingDiagnostic {
                    code: AdapterDiagnosticCode::ContentLimit,
                    record_index,
                    event_index,
                    detail: None,
                });
            }
            SessionEvent::ToolCall(ToolCallEvent {
                name: t.name.clone(),
                arguments,
                truncation,
            })
        }
        EventClassify::ToolResult => {
            let Event::ToolResult(t) = &located.value else {
                unreachable!("classify ToolResult");
            };
            let (content, limited) = if !options.include_tool_results {
                (ToolResultContent::Omitted, false)
            } else {
                let kept = retain_text(&t.text, options.max_event_text_bytes, text_budget);
                (
                    ToolResultContent::Present {
                        text: kept.text,
                        truncation: kept.truncation,
                    },
                    kept.limited,
                )
            };
            if limited {
                diags.push(AdapterMappingDiagnostic {
                    code: AdapterDiagnosticCode::ContentLimit,
                    record_index,
                    event_index,
                    detail: None,
                });
            }
            SessionEvent::ToolResult(ToolResultEvent {
                content,
                is_error: t.is_error,
            })
        }
        EventClassify::Usage => {
            let Event::Usage(u) = &located.value else {
                unreachable!("classify Usage");
            };
            let semantics = map_token_semantics(u.semantics);
            if matches!(semantics, ProviderUsageSemantics::Unsupported) {
                diags.push(AdapterMappingDiagnostic {
                    code: AdapterDiagnosticCode::UnsupportedTokenSemantics,
                    record_index,
                    event_index,
                    detail: None,
                });
            }
            SessionEvent::Usage(UsageObservation {
                semantics,
                input: u.counts.input,
                output: u.counts.output,
                cache_read: u.counts.cache_read,
                cache_write: u.counts.cache_write,
                cache_write_1h: u.counts.cache_write_1h,
                reasoning: u.counts.reasoning,
                model_present: u.model.is_some(),
                any_counter_present: !u.counts.is_missing(),
                layer: FactLayer::ProviderFact,
            })
        }
        EventClassify::Unsupported => {
            let kind = format!("{:?}", std::mem::discriminant(&located.value));
            diags.push(AdapterMappingDiagnostic {
                code: AdapterDiagnosticCode::UnsupportedEventVariant,
                record_index,
                event_index,
                detail: Some(kind.clone()),
            });
            SessionEvent::Unsupported(UnsupportedEvent {
                upstream_debug_kind: kind,
            })
        }
    };

    (
        LocatedEvent {
            identity: EventIdentity {
                source_id: source_id.clone(),
                record_index,
                event_index,
                byte_start: located.location.byte_start,
                byte_end: located.location.byte_end,
            },
            line_no: located.location.line_no,
            time,
            record_type: located.record_type.clone(),
            event,
            layer: FactLayer::ParserDerived,
        },
        diags,
    )
}

/// Length-prefixed ingest fingerprint (store idempotency).
pub(crate) fn ingest_fingerprint(
    provider: SessionProvider,
    prefix_digest: &[u8; 32],
    captured_len: u64,
    last_complete_byte: u64,
    agent_sessions_version: &str,
    adapter_projection_version: &str,
    store_schema_version: &str,
) -> Vec<u8> {
    let mut out = Vec::with_capacity(128);
    let write_str = |out: &mut Vec<u8>, s: &str| {
        let b = s.as_bytes();
        out.extend_from_slice(&(b.len() as u32).to_le_bytes());
        out.extend_from_slice(b);
    };
    write_str(
        &mut out,
        match provider {
            SessionProvider::Codex => "codex",
            SessionProvider::ClaudeCode => "claude_code",
        },
    );
    out.extend_from_slice(&(32u32).to_le_bytes());
    out.extend_from_slice(prefix_digest);
    out.extend_from_slice(&captured_len.to_le_bytes());
    out.extend_from_slice(&last_complete_byte.to_le_bytes());
    write_str(&mut out, agent_sessions_version);
    write_str(&mut out, adapter_projection_version);
    write_str(&mut out, store_schema_version);
    write_str(&mut out, FULL_SNAPSHOT_PROFILE_ID);
    out
}
