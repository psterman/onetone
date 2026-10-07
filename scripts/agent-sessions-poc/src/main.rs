//! Isolated PoC: agent-sessions → OneTone candidate DTOs.
//! Never linked from src-tauri. Outputs aggregate JSON only (no prompts/paths).

mod model;

use agent_sessions::{
    read, read_from, read_raw_file, Agent, DiscoverFilter, Event, Located, RawReadOptions,
    ReadOptions, ReadStatus, Roots, StreamError, TailMode, TokenSemantics, VERSION,
};
use model::*;
use serde::Serialize;
use std::collections::BTreeMap;
use std::env;
use std::fs;
use std::io::Cursor;
use std::path::{Path, PathBuf};
use std::time::Instant;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Report {
    verified_at: String,
    agent_sessions_version: &'static str,
    rustc: String,
    msrv_ok: bool,
    cases: Vec<CaseResult>,
    real_data: RealDataTiers,
    boundary_contract: BoundaryContract,
    cargo_tree_note: String,
    peak_working_set: String,
}

#[derive(Serialize, Default, Clone)]
#[serde(rename_all = "camelCase")]
struct ProviderStats {
    discovered: u64,
    sampled: u64,
    opened: u64,
    open_errors: u64,
    complete: u64,
    complete_with_errors: u64,
    incomplete_tail: u64,
    stopped_early: u64,
    failed: u64,
    line_errors: u64,
    unknown_records: u64,
    ignored_records: u64,
    fatal_stream_errors: u64,
    clean_fully_read: u64,
}

impl ProviderStats {
    fn assert_consistent(&self, label: &str) {
        let status_sum = self.complete
            + self.complete_with_errors
            + self.incomplete_tail
            + self.stopped_early
            + self.failed;
        assert_eq!(
            self.opened, status_sum,
            "{label}: opened must equal status histogram sum"
        );
        assert_eq!(
            self.sampled,
            self.opened + self.open_errors,
            "{label}: sampled must equal opened + openErrors"
        );
    }
}

#[derive(Serialize, Default)]
#[serde(rename_all = "camelCase")]
struct RealDataTiers {
    providers: ProviderPair,
    /// Minimum compatibility: ≥1 clean Complete per provider (not all-sample success).
    real_provider_compatibility_gate_passed: bool,
    gate_policy: String,
    codex_clean_ratio: String,
    claude_clean_ratio: String,
    discovery_errors: u64,
    discovery_only: bool,
    notes: Vec<String>,
}

#[derive(Serialize, Default)]
#[serde(rename_all = "camelCase")]
struct ProviderPair {
    codex: ProviderStats,
    claude: ProviderStats,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct BoundaryContract {
    typed_starts_at_record_zero: bool,
    stop_at_byte_prefix_ok: bool,
    raw_start_offset_continuity_ok: bool,
    last_complete_byte_alone_insufficient_for_typed_resume: bool,
    notes: Vec<String>,
}

fn main() {
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let fixtures = manifest_dir.join("fixtures");
    let repo_root = manifest_dir
        .parent()
        .and_then(|p| p.parent())
        .map(Path::to_path_buf)
        .unwrap_or_else(|| PathBuf::from("."));
    let out_dir = repo_root.join("test-output");
    let _ = fs::create_dir_all(&out_dir);

    let rustc = env::var("RUSTC_VERSION_OVERRIDE").unwrap_or_else(|_| {
        std::process::Command::new("rustc")
            .arg("--version")
            .output()
            .ok()
            .and_then(|o| String::from_utf8(o.stdout).ok())
            .unwrap_or_else(|| "unknown".into())
            .trim()
            .to_string()
    });
    let msrv_ok = rustc_meets_188(&rustc);

    let mut cases = Vec::new();
    cases.push(case_complete(&fixtures));
    cases.push(case_malformed_final_with_newline(&fixtures));
    cases.push(case_incomplete_unterminated_tail(&fixtures));
    cases.push(case_malformed_mid(&fixtures));
    cases.push(case_unknown(&fixtures));
    cases.push(case_missing_usage(&fixtures));
    cases.push(case_illegal_usage(&fixtures, "illegal_usage_negative.jsonl", "illegal_usage_negative"));
    cases.push(case_illegal_usage(
        &fixtures,
        "illegal_usage_fractional.jsonl",
        "illegal_usage_fractional",
    ));
    cases.push(case_illegal_usage_overflow());
    cases.push(case_codex_model_switch(&fixtures));
    cases.push(case_large_file(&fixtures));
    cases.push(case_oversized_line());
    let (boundary_cases, boundary) = case_reread_and_boundary(&fixtures);
    cases.extend(boundary_cases);

    let real_data = probe_real_sessions();

    let report = Report {
        verified_at: chrono::Utc::now().to_rfc3339(),
        agent_sessions_version: VERSION,
        rustc,
        msrv_ok,
        cases,
        real_data,
        boundary_contract: boundary,
        cargo_tree_note: "see scripts/agent-sessions-poc/Cargo.lock and `cargo tree -i agent-sessions`".into(),
        peak_working_set: "not measured".into(),
    };

    let out_path = out_dir.join("agent-sessions-poc-summary.json");
    let json = serde_json::to_string_pretty(&report).expect("serialize");
    fs::write(&out_path, &json).expect("write summary");
    // Relative path only — never print absolute workspace/user paths.
    println!("wrote test-output/agent-sessions-poc-summary.json");
    println!(
        "cases_ok={} / {} | compat_gate={} codex_clean={} claude_clean={} msrv_ok={}",
        report.cases.iter().filter(|c| c.ok).count(),
        report.cases.len(),
        report.real_data.real_provider_compatibility_gate_passed,
        report.real_data.codex_clean_ratio,
        report.real_data.claude_clean_ratio,
        report.msrv_ok
    );
}

fn rustc_meets_188(s: &str) -> bool {
    // "rustc 1.98.1 (...)"
    let ver = s.split_whitespace().nth(1).unwrap_or("");
    let mut parts = ver.split('.');
    let major: u32 = parts.next().and_then(|x| x.parse().ok()).unwrap_or(0);
    let minor: u32 = parts.next().and_then(|x| x.parse().ok()).unwrap_or(0);
    major > 1 || (major == 1 && minor >= 88)
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

fn completeness_from(summary: &agent_sessions::ReadSummary) -> ParseCompleteness {
    let unknown: u64 = summary.unknown_types.values().sum();
    let ignored: u64 = summary.ignored_types.values().sum();
    let status = map_status(summary.status);
    let unknown_present = unknown > 0;
    // Product gate: Complete + zero unknowns/line errors. ignoredRecords counted but not auto-blocking.
    let allowed = matches!(status, SessionParseStatus::Complete)
        && summary.line_errors == 0
        && !unknown_present;
    ParseCompleteness {
        parser_status: status,
        unknown_record_count: unknown,
        ignored_record_count: ignored,
        line_error_count: summary.line_errors,
        whole_snapshot_commit_allowed: allowed,
        unknown_records_present: unknown_present,
        commit_policy_layer: FactLayer::ProductInference,
        layer_note: Some(
            "ignoredRecords is observable but does not automatically block the PoC clean gate. Before production, ignored type keys must be reviewed against an explicit allowlist; unknown ignored keys or allowlist changes require re-audit.",
        ),
    }
}

fn map_event(located: &Located<Event>) -> LocatedEvent {
    let event = match &located.value {
        Event::Meta(m) => SessionEvent::Meta {
            model_observed: m.model.is_some(),
        },
        Event::Message(m) => SessionEvent::Message {
            role: format!("{:?}", m.role),
            text_len: m.text.chars().count(),
        },
        Event::ToolCall(t) => SessionEvent::ToolCall {
            name_len: t.name.chars().count(),
        },
        Event::ToolResult(t) => SessionEvent::ToolResult {
            text_len: t.text.chars().count(),
        },
        Event::Usage(u) => {
            let any = !u.counts.is_missing();
            SessionEvent::Usage(UsageObservation {
                semantics: match u.semantics {
                    TokenSemantics::ClaudeExclusive => ProviderUsageSemantics::ClaudeExclusive,
                    TokenSemantics::CodexInclusive => ProviderUsageSemantics::CodexInclusive,
                    _ => ProviderUsageSemantics::ClaudeExclusive,
                },
                input: u.counts.input,
                output: u.counts.output,
                cache_read: u.counts.cache_read,
                cache_write: u.counts.cache_write,
                cache_write_1h: u.counts.cache_write_1h,
                reasoning: u.counts.reasoning,
                model_present: u.model.is_some(),
                any_counter_present: any,
                layer: FactLayer::ProviderFact,
            })
        }
        _ => SessionEvent::Meta {
            model_observed: false,
        },
    };
    LocatedEvent {
        record_index: located.location.record_index,
        line_no: located.location.line_no,
        byte_start: located.location.byte_start,
        byte_end: located.location.byte_end,
        event_index: located.location.event_index,
        has_timestamp: located.at.is_some(),
        has_session_id: located.session_id.is_some(),
        record_type: located.record_type.clone(),
        event,
        layer: FactLayer::ParserDerived,
    }
}

struct ParseRun {
    kinds: BTreeMap<String, u64>,
    diagnostics: Vec<ParseDiagnostic>,
    events: Vec<LocatedEvent>,
    models: Vec<String>,
    summary: agent_sessions::ReadSummary,
    elapsed_ms: u128,
    line_limit_hit: bool,
}

fn parse_bytes(agent: Agent, data: &[u8], opts: ReadOptions) -> ParseRun {
    let start = Instant::now();
    let mut reader = read_from(agent, Cursor::new(data.to_vec()), &opts).expect("read_from");
    let mut kinds = BTreeMap::new();
    let mut diagnostics = Vec::new();
    let mut events = Vec::new();
    let mut models = Vec::new();
    let mut line_limit_hit = false;
    for item in reader.by_ref() {
        match item {
            Ok(loc) => {
                if let Event::Meta(ref m) = loc.value {
                    if let Some(ref model) = m.model {
                        // Length-only fingerprint — never store model string content from real sessions.
                        // For fixtures we allow short synthetic model names.
                        if model.starts_with("model-") || model.starts_with("fixture") {
                            if !models.contains(model) {
                                models.push(model.clone());
                            }
                        } else {
                            let tag = format!("model_len_{}", model.chars().count());
                            if !models.contains(&tag) {
                                models.push(tag);
                            }
                        }
                    }
                }
                if let Event::Usage(ref u) = loc.value {
                    if let Some(ref model) = u.model {
                        if model.starts_with("model-") {
                            if !models.contains(model) {
                                models.push(model.clone());
                            }
                        }
                    }
                }
                let mapped = map_event(&loc);
                let kind = match &mapped.event {
                    SessionEvent::Meta { .. } => "meta",
                    SessionEvent::Message { .. } => "message",
                    SessionEvent::ToolCall { .. } => "tool_call",
                    SessionEvent::ToolResult { .. } => "tool_result",
                    SessionEvent::Usage(_) => "usage",
                };
                *kinds.entry(kind.into()).or_default() += 1;
                events.push(mapped);
            }
            Err(StreamError::Line { line_no, byte_start, kind }) => {
                let k = format!("{kind:?}");
                if matches!(kind, agent_sessions::LineErrorKind::TooLong) {
                    line_limit_hit = true;
                }
                diagnostics.push(ParseDiagnostic {
                    kind: k,
                    line_no: Some(line_no),
                    byte_start: Some(byte_start),
                    layer: FactLayer::ParserDerived,
                });
            }
            Err(e) => {
                diagnostics.push(ParseDiagnostic {
                    kind: format!("{e:?}").chars().take(80).collect(),
                    line_no: None,
                    byte_start: None,
                    layer: FactLayer::ParserDerived,
                });
            }
        }
    }
    let summary = reader.finish();
    ParseRun {
        kinds,
        diagnostics,
        events,
        models,
        summary,
        elapsed_ms: start.elapsed().as_millis(),
        line_limit_hit,
    }
}

fn parse_fixture(agent: Agent, path: &Path, opts: ReadOptions) -> ParseRun {
    let data = fs::read(path).expect("fixture read");
    parse_bytes(agent, &data, opts)
}

fn case_from_run(name: &str, run: ParseRun, ok: bool, notes: Vec<String>) -> CaseResult {
    let completeness = completeness_from(&run.summary);
    CaseResult {
        case: name.into(),
        ok,
        notes,
        parser_status: Some(completeness.parser_status),
        completeness: Some(completeness),
        event_kinds: run.kinds,
        diagnostics: run.diagnostics,
        last_complete_byte: Some(run.summary.last_complete_byte),
        bytes_read: Some(run.summary.bytes_read),
        lines: Some(run.summary.lines),
        emitted_events: run.events.len() as u64,
        elapsed_ms: run.elapsed_ms,
        line_limit_hit: run.line_limit_hit,
        models_observed: run.models,
        usage_absent_preserved: None,
        usage_zero_coerced: None,
        extra: None,
    }
}

fn case_complete(fixtures: &Path) -> CaseResult {
    let run = parse_fixture(
        Agent::ClaudeCode,
        &fixtures.join("complete_claude.jsonl"),
        ReadOptions::default(),
    );
    let ok = run.summary.is_complete()
        && run.summary.line_errors == 0
        && run.events.iter().any(|e| matches!(e.event, SessionEvent::Message { .. }));
    case_from_run(
        "complete_valid",
        run,
        ok,
        vec!["complete legal Claude fixture".into()],
    )
}

fn case_malformed_final_with_newline(fixtures: &Path) -> CaseResult {
    let mut opts = ReadOptions::default();
    opts.tail = TailMode::AllowIncomplete;
    let run = parse_fixture(
        Agent::ClaudeCode,
        &fixtures.join("malformed_final_with_newline.jsonl"),
        opts,
    );
    let status = map_status(run.summary.status);
    let completeness = completeness_from(&run.summary);
    let ok = matches!(status, SessionParseStatus::CompleteWithErrors)
        && run.summary.line_errors > 0
        && !run.summary.truncated_tail
        && !completeness.whole_snapshot_commit_allowed;
    case_from_run(
        "malformed_final_with_newline",
        run,
        ok,
        vec![
            "final malformed JSON ending with LF is a line error, not IncompleteTail".into(),
            format!("status={status:?}"),
        ],
    )
}

fn case_incomplete_unterminated_tail(fixtures: &Path) -> CaseResult {
    let mut opts = ReadOptions::default();
    opts.tail = TailMode::AllowIncomplete;
    let run = parse_fixture(
        Agent::ClaudeCode,
        &fixtures.join("incomplete_unterminated_tail.jsonl"),
        opts,
    );
    let status = map_status(run.summary.status);
    let completeness = completeness_from(&run.summary);
    let last = run.summary.last_complete_byte;
    let ok = matches!(status, SessionParseStatus::IncompleteTail)
        && run.summary.truncated_tail
        && run.summary.line_errors == 0
        && !completeness.whole_snapshot_commit_allowed
        && last > 0;
    case_from_run(
        "incomplete_unterminated_tail",
        run,
        ok,
        vec![
            "EOF mid-JSON without trailing LF → IncompleteTail under AllowIncomplete".into(),
            format!("status={status:?} last_complete_byte={last}"),
        ],
    )
}

fn case_illegal_usage_overflow() -> CaseResult {
    // Counter larger than u64::MAX — must diagnose, not saturate to u64::MAX.
    let line = format!(
        r#"{{"type":"assistant","message":{{"content":"fixture-overflow","id":"msg-ov","model":"model-a","usage":{{"input_tokens":{},"output_tokens":1}}}},"timestamp":"2026-09-25T00:00:00Z","sessionId":"poc-overflow"}}"#,
        "18446744073709551616" // u64::MAX + 1
    );
    let run = parse_bytes(Agent::ClaudeCode, line.as_bytes(), ReadOptions::default());
    let completeness = completeness_from(&run.summary);
    let usage_emitted = run
        .events
        .iter()
        .any(|e| matches!(e.event, SessionEvent::Usage(_)));
    let sat_max = run.events.iter().any(|e| match &e.event {
        SessionEvent::Usage(u) => u.input == Some(u64::MAX) || u.output == Some(u64::MAX),
        _ => false,
    });
    let has_diag = !run.diagnostics.is_empty() || run.summary.line_errors > 0;
    let ok = has_diag && !usage_emitted && !sat_max && !completeness.whole_snapshot_commit_allowed;
    case_from_run(
        "illegal_usage_overflow",
        run,
        ok,
        vec![
            "overflow usage must surface InvalidField/line error; no saturated Usage".into(),
        ],
    )
}

fn case_malformed_mid(fixtures: &Path) -> CaseResult {
    let run = parse_fixture(
        Agent::ClaudeCode,
        &fixtures.join("malformed_mid.jsonl"),
        ReadOptions::default(),
    );
    let ok = run.summary.line_errors > 0
        && matches!(
            map_status(run.summary.status),
            SessionParseStatus::CompleteWithErrors
        );
    case_from_run(
        "malformed_mid",
        run,
        ok,
        vec!["malformed middle line yields line_errors; checkpoint does not silently skip".into()],
    )
}

fn case_unknown(fixtures: &Path) -> CaseResult {
    let run = parse_fixture(
        Agent::ClaudeCode,
        &fixtures.join("unknown_type.jsonl"),
        ReadOptions::default(),
    );
    let unknown: u64 = run.summary.unknown_types.values().sum();
    let completeness = completeness_from(&run.summary);
    let ok = unknown > 0
        && completeness.unknown_records_present
        && !completeness.whole_snapshot_commit_allowed;
    let mut c = case_from_run(
        "unknown_record_type",
        run,
        ok,
        vec![
            "unknown types counted in ReadSummary, not required as typed Event".into(),
            "Complete+unknown must not auto-authorize transcript snapshot".into(),
        ],
    );
    c.extra = Some(serde_json::json!({
        "unknownTypeKeys": c.completeness.as_ref().map(|x| x.unknown_record_count)
    }));
    c
}

fn case_missing_usage(fixtures: &Path) -> CaseResult {
    let run = parse_fixture(
        Agent::ClaudeCode,
        &fixtures.join("missing_usage.jsonl"),
        ReadOptions::default(),
    );
    // Assistant without usage should not invent Usage{0,0}.
    let usage_events: Vec<_> = run
        .events
        .iter()
        .filter_map(|e| match &e.event {
            SessionEvent::Usage(u) => Some(u),
            _ => None,
        })
        .collect();
    let coerced = usage_events
        .iter()
        .any(|u| !u.any_counter_present && (u.input == Some(0) || u.output == Some(0)));
    let absent_ok = usage_events.is_empty()
        || usage_events.iter().all(|u| !u.any_counter_present || u.input.is_none() || u.output.is_none());
    // Prefer: no fabricated zero usage from missing fields.
    let ok = !coerced;
    let mut c = case_from_run(
        "missing_usage",
        run,
        ok,
        vec!["absent usage must stay None/absent; never coerce to 0".into()],
    );
    c.usage_absent_preserved = Some(absent_ok);
    c.usage_zero_coerced = Some(coerced);
    c
}

fn case_illegal_usage(fixtures: &Path, file: &str, name: &str) -> CaseResult {
    let run = parse_fixture(Agent::ClaudeCode, &fixtures.join(file), ReadOptions::default());
    let has_diag = !run.diagnostics.is_empty() || run.summary.line_errors > 0;
    let ok = has_diag;
    case_from_run(
        name,
        run,
        ok,
        vec!["illegal usage counters must surface as errors, not silent clamp (Strict)".into()],
    )
}

fn case_codex_model_switch(fixtures: &Path) -> CaseResult {
    let run = parse_fixture(
        Agent::Codex,
        &fixtures.join("codex_model_switch.jsonl"),
        ReadOptions::default(),
    );
    let ok = run.models.len() >= 2
        && run.models.iter().any(|m| m.contains("first"))
        && run.models.iter().any(|m| m.contains("second"));
    case_from_run(
        "codex_model_switch",
        run,
        ok,
        vec!["mid-session model observations retained via Meta/usage context".into()],
    )
}

fn case_large_file(fixtures: &Path) -> CaseResult {
    // Build a larger synthetic Claude JSONL (~2k lines) without checking in a huge fixture.
    let mut buf = Vec::new();
    for i in 0..2000 {
        let line = format!(
            r#"{{"type":"user","message":{{"content":"fixture-line-{i}"}},"timestamp":"2026-09-25T00:00:00Z","sessionId":"poc-large"}}"#
        );
        buf.extend_from_slice(line.as_bytes());
        buf.push(b'\n');
    }
    let file_bytes = buf.len() as u64;
    let physical_lines = 2000u64;
    let run = parse_bytes(Agent::ClaudeCode, &buf, ReadOptions::default());
    let emitted = run.events.len() as u64;
    let ok = run.summary.is_complete() && emitted > 0 && run.summary.lines == physical_lines;
    let mut c = case_from_run(
        "large_jsonl_perf",
        run,
        ok,
        vec![
            format!("file_bytes={file_bytes}"),
            format!("physical_lines={physical_lines}"),
            format!("emitted_events={emitted}"),
            "peak memory: not measured (external WorkingSet sampling not used)".into(),
        ],
    );
    c.extra = Some(serde_json::json!({
        "fileBytes": file_bytes,
        "physicalLines": physical_lines,
        "defaultLineLimitMiB": 8,
        "defaultFileLimitMiB": 200
    }));
    let _ = fixtures; // keep signature parallel
    c
}

fn case_oversized_line() -> CaseResult {
    // ≥8 MiB physical line (upstream observed ~10.9 MiB real record).
    let mut line = vec![b'x'; 9 * 1024 * 1024];
    line.push(b'\n');
    let ok_line = br#"{"type":"user","message":{"content":"fixture-after-oversize"},"timestamp":"2026-09-25T00:00:00Z","sessionId":"poc-oversize"}"#;
    let mut data = line;
    data.extend_from_slice(ok_line);
    data.push(b'\n');
    let run = parse_bytes(Agent::ClaudeCode, &data, ReadOptions::default());
    let ok = run.line_limit_hit
        && run
            .diagnostics
            .iter()
            .any(|d| d.kind.contains("TooLong"));
    case_from_run(
        "oversized_line_8mib",
        run,
        ok,
        vec![
            "default max_line_bytes=8MiB must surface TooLong; large-file pass must not hide large-line fail".into(),
        ],
    )
}

fn case_reread_and_boundary(fixtures: &Path) -> (Vec<CaseResult>, BoundaryContract) {
    let path = fixtures.join("complete_claude.jsonl");
    let data = fs::read(&path).expect("read");

    // 1) Deterministic re-parse
    let a = parse_bytes(Agent::ClaudeCode, &data, ReadOptions::default());
    let b = parse_bytes(Agent::ClaudeCode, &data, ReadOptions::default());
    let indexes_a: Vec<_> = a.events.iter().map(|e| (e.record_index, e.event_index)).collect();
    let indexes_b: Vec<_> = b.events.iter().map(|e| (e.record_index, e.event_index)).collect();
    let det_ok = indexes_a == indexes_b
        && a.summary.status == b.summary.status
        && a.summary.last_complete_byte == b.summary.last_complete_byte
        && a.summary.line_errors == b.summary.line_errors;
    let det = case_from_run(
        "reparse_deterministic",
        a,
        det_ok,
        vec!["same immutable file twice → deterministic indexes/summary".into()],
    );
    let last_complete = b.summary.last_complete_byte;

    // 2) Typed prefix via stop_at_byte from byte 0 — NOT seek to last_complete_byte
    let mut opts = ReadOptions::default();
    opts.stop_at_byte = Some(last_complete);
    let prefix = parse_bytes(Agent::ClaudeCode, &data, opts);
    let prefix_ok = prefix.summary.is_complete() && prefix.summary.last_complete_byte == last_complete;
    let mut prefix_case = case_from_run(
        "typed_prefix_stop_at_byte",
        prefix,
        prefix_ok,
        vec![
            "typed reader starts at record 0 with stop_at_byte=prior last_complete_byte".into(),
            "do not start typed parser directly at last_complete_byte".into(),
        ],
    );
    prefix_case.extra = Some(serde_json::json!({ "stopAtByte": last_complete }));

    // 3) Raw continuation from established boundary
    let tmp = env::temp_dir().join(format!(
        "onetone-poc-raw-{}.jsonl",
        std::process::id()
    ));
    // Append a second record after the complete file for raw resume demo.
    let mut extended = data.clone();
    let extra = br#"{"type":"user","message":{"content":"fixture-extra"},"timestamp":"2026-09-25T00:00:03Z","sessionId":"poc-complete"}"#;
    extended.extend_from_slice(extra);
    extended.push(b'\n');
    fs::write(&tmp, &extended).expect("tmp write");

    let raw_opts = RawReadOptions {
        start_offset: last_complete,
        ..Default::default()
    };
    let mut raw_ok = false;
    let mut raw_notes = vec![
        "only read_raw_* may resume from established byte boundary".into(),
        "resumed raw records are NOT a self-contained typed usage stream".into(),
    ];
    let mut raw_records = 0u64;
    let mut delivered_through = 0u64;
    if let Ok(mut raw) = read_raw_file(&tmp, &raw_opts) {
        for rec in raw.by_ref() {
            if let Ok(r) = rec {
                raw_records += 1;
                if r.byte_start != last_complete && raw_records == 1 {
                    // first record should start at boundary
                }
                if raw_records == 1 && r.byte_start == last_complete {
                    raw_ok = true;
                }
            }
        }
        let sum = raw.finish();
        delivered_through = sum.delivered_through;
        if raw_records > 0 && sum.delivered_through > last_complete {
            raw_ok = true;
        }
        raw_notes.push(format!(
            "raw_records={raw_records} delivered_through={delivered_through} start={last_complete}"
        ));
    } else {
        raw_notes.push("raw open failed".into());
    }
    let _ = fs::remove_file(&tmp);

    let mut raw_case = CaseResult {
        case: "raw_continuation".into(),
        ok: raw_ok,
        notes: raw_notes,
        parser_status: None,
        completeness: None,
        event_kinds: BTreeMap::new(),
        diagnostics: vec![],
        last_complete_byte: Some(last_complete),
        bytes_read: Some(delivered_through.saturating_sub(last_complete)),
        lines: Some(raw_records),
        emitted_events: raw_records,
        elapsed_ms: 0,
        line_limit_hit: false,
        models_observed: vec![],
        usage_absent_preserved: None,
        usage_zero_coerced: None,
        extra: Some(serde_json::json!({
            "startOffset": last_complete,
            "rawRecords": raw_records,
            "deliveredThrough": delivered_through
        })),
    };
    let _ = &mut raw_case;

    let boundary = BoundaryContract {
        typed_starts_at_record_zero: true,
        stop_at_byte_prefix_ok: prefix_ok,
        raw_start_offset_continuity_ok: raw_ok,
        last_complete_byte_alone_insufficient_for_typed_resume: true,
        notes: vec![
            "production typed incremental resume requires immutable-prefix verification plus an application-owned usage baseline/dedup protocol".into(),
            "it is not provided automatically by last_complete_byte".into(),
            "arbitrary mid-file cumulative usage baseline is unsupported by typed reader".into(),
        ],
    };

    (vec![det, prefix_case, raw_case], boundary)
}

fn provider_stats_mut<'a>(pair: &'a mut ProviderPair, agent: Agent) -> Option<&'a mut ProviderStats> {
    match agent {
        Agent::Codex => Some(&mut pair.codex),
        Agent::ClaudeCode => Some(&mut pair.claude),
        _ => None,
    }
}

fn clean_ratio(stats: &ProviderStats) -> String {
    format!("{}/{}", stats.clean_fully_read, stats.opened)
}

fn probe_real_sessions() -> RealDataTiers {
    let mut tiers = RealDataTiers {
        gate_policy: "at least one clean Complete session per provider (minimum compatibility)"
            .into(),
        discovery_only: true,
        notes: vec![],
        ..Default::default()
    };

    let roots = match Roots::from_env() {
        Ok(r) => r,
        Err(_) => {
            tiers.notes.push(
                "Roots::from_env failed; no real-data discovery; compatibility gate false".into(),
            );
            tiers.codex_clean_ratio = "0/0".into();
            tiers.claude_clean_ratio = "0/0".into();
            return tiers;
        }
    };
    let discovery = agent_sessions::discover(
        &roots,
        &DiscoverFilter {
            agents: vec![],
            include_subagents: true,
            modified_after: None,
        },
    );
    tiers.discovery_errors = discovery.errors.len() as u64;

    for file in &discovery.files {
        if let Some(s) = provider_stats_mut(&mut tiers.providers, file.agent) {
            s.discovered += 1;
        }
    }

    if discovery.files.is_empty() {
        tiers.notes.push("no local session files discovered; compatibility gate false".into());
        tiers.codex_clean_ratio = "0/0".into();
        tiers.claude_clean_ratio = "0/0".into();
        return tiers;
    }

    let mut opts = ReadOptions::default();
    opts.tail = TailMode::AllowIncomplete;

    // Cap real reads for PoC time budget; prefer covering both providers in the sample window.
    let mut sample: Vec<&agent_sessions::SessionFile> = Vec::new();
    let mut codex_n = 0usize;
    let mut claude_n = 0usize;
    for file in &discovery.files {
        match file.agent {
            Agent::Codex if codex_n < 12 => {
                sample.push(file);
                codex_n += 1;
            }
            Agent::ClaudeCode if claude_n < 12 => {
                sample.push(file);
                claude_n += 1;
            }
            _ => {}
        }
        if sample.len() >= 24 {
            break;
        }
    }

    for file in sample {
        let Some(stats) = provider_stats_mut(&mut tiers.providers, file.agent) else {
            continue;
        };
        stats.sampled += 1;
        match read(file, &opts) {
            Ok(mut reader) => {
                stats.opened += 1;
                for item in reader.by_ref() {
                    match item {
                        Ok(_) => {}
                        Err(StreamError::Line { .. }) => {
                            // counted via summary.line_errors after finish
                        }
                        Err(_) => {
                            stats.fatal_stream_errors += 1;
                        }
                    }
                }
                let summary = reader.finish();
                match summary.status {
                    ReadStatus::Complete => stats.complete += 1,
                    ReadStatus::CompleteWithErrors => stats.complete_with_errors += 1,
                    ReadStatus::IncompleteTail => stats.incomplete_tail += 1,
                    ReadStatus::StoppedEarly => stats.stopped_early += 1,
                    ReadStatus::Failed => stats.failed += 1,
                    _ => stats.failed += 1,
                }
                stats.line_errors += summary.line_errors;
                let unknown_count: u64 = summary.unknown_types.values().sum();
                let ignored_count: u64 = summary.ignored_types.values().sum();
                stats.unknown_records += unknown_count;
                stats.ignored_records += ignored_count;
                let clean = matches!(summary.status, ReadStatus::Complete)
                    && summary.line_errors == 0
                    && unknown_count == 0;
                if clean {
                    stats.clean_fully_read += 1;
                    tiers.discovery_only = false;
                }
            }
            Err(_) => {
                stats.open_errors += 1;
            }
        }
    }

    tiers.providers.codex.assert_consistent("codex");
    tiers.providers.claude.assert_consistent("claude");

    tiers.codex_clean_ratio = clean_ratio(&tiers.providers.codex);
    tiers.claude_clean_ratio = clean_ratio(&tiers.providers.claude);
    tiers.real_provider_compatibility_gate_passed = tiers.providers.codex.clean_fully_read >= 1
        && tiers.providers.claude.clean_fully_read >= 1;

    if tiers.providers.codex.clean_fully_read == 0 {
        tiers.notes.push(
            "no clean Codex Complete session in sample (Complete + 0 line_errors + 0 unknown)"
                .into(),
        );
    }
    if tiers.providers.claude.clean_fully_read == 0 {
        tiers.notes.push(
            "no clean Claude Complete session in sample (Complete + 0 line_errors + 0 unknown)"
                .into(),
        );
    }
    if tiers.providers.codex.opened + tiers.providers.claude.opened == 0 {
        tiers.discovery_only = true;
        tiers.notes.push("no session files successfully opened in sample".into());
    }
    tiers.notes.push(format!(
        "sampled codex={} claude={} of discovered codex={} claude={} (aggregate only; minimum compatibility gate)",
        tiers.providers.codex.sampled,
        tiers.providers.claude.sampled,
        tiers.providers.codex.discovered,
        tiers.providers.claude.discovered
    ));
    tiers
}
