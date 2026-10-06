//! PromptJournal — user-side prompt observations only (not full transcript).
//!
//! Reuses `agent_events` (`event_type=prompt_observed`). No new tables / migrations.
//! `canonical_session_id` == `agent_sessions.session_id` via [`agent_session_id`].
//! `lane_id` stays `LaneKey::lane_id()` and is never mixed with session_id.

use crate::agent_lane::LaneKey;
use crate::agent_memory::events::{agent_session_id, append_observed_event_with_detail};
use crate::agent_memory::model::{EVENT_CLASS_OBSERVED, UNKNOWN_PROJECT_ID};
use crate::agent_memory::store::{now_ms, with_read_path, with_write};
use crate::soft_pad_runtime::AgentKind;
use rusqlite::params;
use serde::{Deserialize, Serialize};
use serde_json::json;
use sha2::{Digest, Sha256};

pub const PROMPT_EVENT_TYPE: &str = "prompt_observed";
pub const SUMMARY_MAX_CHARS: usize = 200;
pub const UNKNOWN_PROMPT_SUMMARY: &str = "检测到交互，内容未知";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum PromptSource {
    /// Real / trusted fixture payload contained prompt text.
    ClaudeHook,
    /// Only after Cursor hook actually delivers prompt text.
    CursorHook,
    OneToneDispatch,
    /// Hook registered or event seen without verified text — never display as ClaudeHook text.
    HookRegistered,
    PromptEventWithoutText,
}

impl PromptSource {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::ClaudeHook => "ClaudeHook",
            Self::CursorHook => "CursorHook",
            Self::OneToneDispatch => "OneToneDispatch",
            Self::HookRegistered => "HookRegistered",
            Self::PromptEventWithoutText => "PromptEventWithoutText",
        }
    }

    pub fn from_str_loose(s: &str) -> Self {
        match s {
            "ClaudeHook" => Self::ClaudeHook,
            "CursorHook" => Self::CursorHook,
            "OneToneDispatch" => Self::OneToneDispatch,
            "HookRegistered" => Self::HookRegistered,
            _ => Self::PromptEventWithoutText,
        }
    }

    /// May display cleaned prompt summary (not just "content unknown").
    pub fn may_show_prompt_text(self) -> bool {
        matches!(
            self,
            Self::ClaudeHook | Self::CursorHook | Self::OneToneDispatch
        )
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PromptRecord {
    pub prompt_id: String,
    pub canonical_session_id: String,
    pub external_session_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub lane_id: Option<String>,
    pub provider: String,
    pub agent_kind: String,
    pub project_id: String,
    pub summary: String,
    pub full_text_len: usize,
    pub source: String,
    pub confidence: String,
    pub observed_at: u64,
    pub source_ref: String,
}

#[derive(Debug, Clone)]
pub struct PromptObserveInput<'a> {
    pub provider: AgentKind,
    pub workspace_id: &'a str,
    pub external_session_id: &'a str,
    pub project_id: &'a str,
    /// Raw user text when available. Empty → PromptEventWithoutText path.
    pub text: Option<&'a str>,
    pub source: PromptSource,
    pub observed_at: Option<u64>,
    /// Stable idempotency key fragment from the provider (turn id, hook seq, …).
    pub source_key: &'a str,
}

/// Same as `agent_sessions.session_id` — uses provider + project + external.
pub fn canonical_session_id(
    provider: AgentKind,
    project_id: &str,
    external_session_id: &str,
) -> String {
    agent_session_id(provider.as_str(), project_id, external_session_id)
}

pub fn lane_id_for(
    provider: AgentKind,
    workspace_id: &str,
    external_session_id: &str,
) -> Option<String> {
    let sid = external_session_id.trim();
    if sid.is_empty() {
        return None;
    }
    Some(
        LaneKey {
            provider,
            workspace_id: workspace_id.trim().to_string(),
            session_id: sid.to_string(),
        }
        .lane_id(),
    )
}

/// Provider-neutral source_ref (do not reuse Cursor-biased `source_ref_for_turn`).
pub fn prompt_source_ref(
    provider: AgentKind,
    external_session_id: &str,
    source_key: &str,
) -> String {
    let raw = format!(
        "prompt|{}|{}|{}",
        provider.as_str(),
        external_session_id.trim(),
        source_key.trim()
    );
    format!("{:x}", Sha256::digest(raw.as_bytes()))
}

pub fn scrub_sensitive(text: &str) -> String {
    let mut out = text.to_string();
    let patterns: &[(&str, &str)] = &[
        (r"(?i)\bsk-[A-Za-z0-9_\-]{8,}\b", "[redacted-api-key]"),
        (
            r"(?i)\bBearer\s+[A-Za-z0-9\._\-]{8,}\b",
            "[redacted-bearer]",
        ),
        (r"(?i)\b[A-Z][A-Z0-9_]{2,}=[^\s]+", "[redacted-env]"),
        (r"(?i)\bapi[_-]?key\s*[:=]\s*\S+", "[redacted-api-key]"),
        (r"(?i)\btoken\s*[:=]\s*\S+", "[redacted-token]"),
    ];
    for (pat, repl) in patterns {
        if let Ok(re) = regex::Regex::new(pat) {
            out = re.replace_all(&out, *repl).into_owned();
        }
    }
    out
}

pub fn clean_summary(text: &str) -> String {
    let scrubbed = scrub_sensitive(text);
    let collapsed: String = scrubbed
        .chars()
        .map(|c| match c {
            '\n' | '\r' | '\t' => ' ',
            c => c,
        })
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ");
    let trimmed = collapsed.trim();
    if trimmed.is_empty() {
        return String::new();
    }
    let mut out = String::new();
    for (i, ch) in trimmed.chars().enumerate() {
        if i >= SUMMARY_MAX_CHARS {
            break;
        }
        out.push(ch);
    }
    out
}

fn detail_json(role: &str, text_len: usize, source: PromptSource, confidence: &str) -> String {
    json!({
        "role": role,
        "text_len": text_len,
        "source": source.as_str(),
        "confidence": confidence,
    })
    .to_string()
}

fn ensure_session_row(
    canonical: &str,
    provider: &str,
    project_id: &str,
    external_session_id: &str,
) -> Result<(), String> {
    with_write(|conn| {
        let now = now_ms() as i64;
        let exists: i64 = conn
            .query_row(
                "SELECT COUNT(1) FROM agent_sessions WHERE session_id = ?1",
                params![canonical],
                |r| r.get(0),
            )
            .unwrap_or(0);
        if exists > 0 {
            return Ok(());
        }
        conn.execute(
            "INSERT OR IGNORE INTO agent_sessions(
               session_id, provider, project_id, external_session_id, title,
               started_at_ms, updated_at_ms, last_seen_at_ms, status,
               project_match, match_reason, match_confidence,
               is_active, activity_source, active_confidence, workspace_evidence_json
             ) VALUES (?1,?2,?3,?4,NULL,?5,?5,?5,'discovered','unknown','prompt_journal',0,0,'observed',0,NULL)",
            params![canonical, provider, project_id, external_session_id, now],
        )
        .map_err(|e| format!("ensure session: {e}"))?;
        Ok(())
    })
}

/// Shared entry for hooks / OneTone dispatch / tests. Idempotent on `source_ref`.
pub fn note_inbound_prompt(input: PromptObserveInput<'_>) -> Result<PromptRecord, String> {
    observe_prompt(input)
}

/// OneToneDispatch helper — only call when external session is known.
pub fn note_onetone_dispatch_prompt(
    kind: AgentKind,
    external_session_id: &str,
    project_id: &str,
    text: &str,
    source_key: &str,
) -> Result<PromptRecord, String> {
    let ext = external_session_id.trim();
    if ext.is_empty() {
        return Err("empty_external_session_id".into());
    }
    let pid = if project_id.trim().is_empty() {
        UNKNOWN_PROJECT_ID
    } else {
        project_id.trim()
    };
    note_inbound_prompt(PromptObserveInput {
        provider: kind,
        workspace_id: "",
        external_session_id: ext,
        project_id: pid,
        text: Some(text),
        source: PromptSource::OneToneDispatch,
        observed_at: None,
        source_key,
    })
}

/// Record a user prompt observation. Idempotent on `source_ref`.
pub fn observe_prompt(input: PromptObserveInput<'_>) -> Result<PromptRecord, String> {
    let external = input.external_session_id.trim();
    if external.is_empty() {
        return Err("empty_external_session_id".into());
    }
    let project_id = if input.project_id.trim().is_empty() {
        UNKNOWN_PROJECT_ID
    } else {
        input.project_id.trim()
    };
    let canonical = canonical_session_id(input.provider, project_id, external);
    let provider = input.provider.as_str();
    let source_ref = prompt_source_ref(input.provider, external, input.source_key);
    let observed_at = input.observed_at.unwrap_or_else(now_ms);
    let lane = lane_id_for(input.provider, input.workspace_id, external);

    let raw = input.text.unwrap_or("").trim();
    let full_text_len = raw.chars().count();

    // Hard gate: HookRegistered / without text → never pretend ClaudeHook text.
    let (source, summary, confidence) = if raw.is_empty()
        || matches!(
            input.source,
            PromptSource::HookRegistered | PromptSource::PromptEventWithoutText
        )
        || !input.source.may_show_prompt_text()
    {
        let src = if matches!(input.source, PromptSource::HookRegistered) {
            PromptSource::HookRegistered
        } else {
            PromptSource::PromptEventWithoutText
        };
        (src, UNKNOWN_PROMPT_SUMMARY.to_string(), "low")
    } else {
        let cleaned = clean_summary(raw);
        if cleaned.is_empty() {
            (
                PromptSource::PromptEventWithoutText,
                UNKNOWN_PROMPT_SUMMARY.to_string(),
                "low",
            )
        } else {
            (input.source, cleaned, "high")
        }
    };

    let detail = detail_json("user", full_text_len, source, confidence);
    ensure_session_row(&canonical, provider, project_id, external)?;

    let _inserted = append_observed_event_with_detail(
        &canonical,
        provider,
        PROMPT_EVENT_TYPE,
        &source_ref,
        observed_at,
        &summary,
        Some(&detail),
    )?;

    let prompt_id = format!(
        "{:x}",
        Sha256::digest(format!("{provider}|{source_ref}|{PROMPT_EVENT_TYPE}").as_bytes())
    );

    Ok(PromptRecord {
        prompt_id,
        canonical_session_id: canonical,
        external_session_id: external.to_string(),
        lane_id: lane,
        provider: provider.to_string(),
        agent_kind: provider.to_string(),
        project_id: project_id.to_string(),
        summary,
        full_text_len,
        source: source.as_str().to_string(),
        confidence: confidence.to_string(),
        observed_at,
        source_ref,
    })
}

/// Recent prompts for one canonical session (`timestamp_ms DESC`).
/// Joins `agent_sessions` to fill external_session_id / project_id.
pub fn recent_prompts(
    canonical_session_id: &str,
    limit: usize,
) -> Result<Vec<PromptRecord>, String> {
    let lim = limit.max(1).min(50) as i64;
    with_read_path(|conn| {
        let mut stmt = conn
            .prepare(
                "SELECT e.event_id, e.session_id, e.provider, e.source_ref, e.timestamp_ms,
                        e.summary, e.detail_json,
                        COALESCE(s.external_session_id, ''),
                        COALESCE(s.project_id, '')
                 FROM agent_events e
                 LEFT JOIN agent_sessions s ON s.session_id = e.session_id
                 WHERE e.session_id = ?1
                   AND e.event_class = ?2
                   AND e.event_type = ?3
                 ORDER BY e.timestamp_ms DESC
                 LIMIT ?4",
            )
            .map_err(|e| format!("prepare recent_prompts: {e}"))?;
        let rows = stmt
            .query_map(
                params![
                    canonical_session_id,
                    EVENT_CLASS_OBSERVED,
                    PROMPT_EVENT_TYPE,
                    lim
                ],
                |r| {
                    Ok((
                        r.get::<_, String>(0)?,
                        r.get::<_, String>(1)?,
                        r.get::<_, String>(2)?,
                        r.get::<_, String>(3)?,
                        r.get::<_, i64>(4)?,
                        r.get::<_, String>(5)?,
                        r.get::<_, Option<String>>(6)?,
                        r.get::<_, String>(7)?,
                        r.get::<_, String>(8)?,
                    ))
                },
            )
            .map_err(|e| format!("query recent_prompts: {e}"))?;

        let mut out = Vec::new();
        for row in rows {
            let (event_id, sid, provider, source_ref, ts, summary, detail, external, project_id) =
                row.map_err(|e| format!("row: {e}"))?;
            let (source, confidence, text_len) = parse_detail(detail.as_deref());
            let kind = AgentKind::from_kind_str(&provider);
            let lane = kind.and_then(|k| lane_id_for(k, "", &external));
            out.push(PromptRecord {
                prompt_id: event_id,
                canonical_session_id: sid,
                external_session_id: external,
                lane_id: lane,
                provider: provider.clone(),
                agent_kind: provider,
                project_id,
                summary,
                full_text_len: text_len,
                source,
                confidence,
                observed_at: ts as u64,
                source_ref,
            });
        }
        Ok(out)
    })
}

/// Batched wrapper: one `recent_prompts` call per session (not a single SQL).
/// Fine for small home sets; upgrade to a windowed query if agent count grows.
pub fn recent_prompts_for_sessions(
    session_ids: &[String],
    per_session: usize,
) -> Result<std::collections::HashMap<String, Vec<PromptRecord>>, String> {
    let mut map: std::collections::HashMap<String, Vec<PromptRecord>> =
        std::collections::HashMap::new();
    if session_ids.is_empty() {
        return Ok(map);
    }
    let per = per_session.max(1).min(20);
    // ponytail: O(sessions) queries acceptable for small home sets; upgrade to window fn if needed
    for sid in session_ids {
        let list = recent_prompts(sid, per)?;
        if !list.is_empty() {
            map.insert(sid.clone(), list);
        }
    }
    Ok(map)
}

fn parse_detail(raw: Option<&str>) -> (String, String, usize) {
    let Some(s) = raw.filter(|x| !x.trim().is_empty()) else {
        return (
            PromptSource::PromptEventWithoutText.as_str().into(),
            "low".into(),
            0,
        );
    };
    let v: serde_json::Value = serde_json::from_str(s).unwrap_or(json!({}));
    let source = v
        .get("source")
        .and_then(|x| x.as_str())
        .unwrap_or(PromptSource::PromptEventWithoutText.as_str())
        .to_string();
    let confidence = v
        .get("confidence")
        .and_then(|x| x.as_str())
        .unwrap_or("low")
        .to_string();
    let text_len = v.get("text_len").and_then(|x| x.as_u64()).unwrap_or(0) as usize;
    (source, confidence, text_len)
}

/// Fail-open journal note from pad/hook ingest (never blocks lights).
pub fn maybe_note_from_hook_payload(
    kind: AgentKind,
    event: &str,
    external_session_id: &str,
    turn_id: &str,
    cwd: &str,
    prompt_text: &str,
    ts: u64,
    hook_source: &str,
) {
    let ev = event.trim();
    let is_prompt = matches!(
        ev,
        "UserPromptSubmit" | "beforeSubmitPrompt" | "BeforeSubmitPrompt"
    );
    if !is_prompt {
        return;
    }
    let ext = external_session_id.trim();
    if ext.is_empty() {
        return;
    }
    let project_id = if cwd.trim().is_empty() {
        UNKNOWN_PROJECT_ID.to_string()
    } else {
        crate::agent_memory::project::project_id_from_path(std::path::Path::new(cwd.trim()))
    };
    let source_key = if !turn_id.trim().is_empty() {
        turn_id.trim().to_string()
    } else {
        format!("{ev}|{ts}")
    };
    let text = prompt_text.trim();
    let (source, text_opt) = if text.is_empty() {
        (PromptSource::PromptEventWithoutText, None)
    } else if hook_source.contains("claude") {
        (PromptSource::ClaudeHook, Some(text))
    } else if hook_source.contains("cursor") {
        (PromptSource::CursorHook, Some(text))
    } else {
        // Codex / other hooks: production probes strip prompt; fixture may include text.
        // Without trusted Claude/Cursor label, treat known text as dispatch-less observed —
        // still PromptEventWithoutText unless we have an explicit trusted source.
        // Codex hook with fixture text: mark PromptEventWithoutText unless Claude/Cursor.
        // Plan: ClaudeHook only for claude; for codex with text use PromptEventWithoutText
        // for honesty unless we add CodexHook later. For E2E with fixture text on claude_hook
        // we use ClaudeHook above.
        (PromptSource::PromptEventWithoutText, None)
    };
    // If text present under claude/cursor, pass it; else none.
    let _ = note_inbound_prompt(PromptObserveInput {
        provider: kind,
        workspace_id: cwd.trim(),
        external_session_id: ext,
        project_id: &project_id,
        text: text_opt,
        source,
        observed_at: if ts > 0 { Some(ts) } else { None },
        source_key: &source_key,
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::agent_memory::events::upsert_session_candidate;
    use crate::agent_memory::model::{ProjectMatch, SessionCandidate};

    #[test]
    fn clean_summary_truncates_and_collapses_ws() {
        let long = "a\n\tb".repeat(120);
        let s = clean_summary(&long);
        assert!(s.chars().count() <= SUMMARY_MAX_CHARS);
        assert!(!s.contains('\n'));
        assert!(!s.contains('\t'));
    }

    #[test]
    fn scrub_api_key_bearer_env() {
        let t =
            "use sk-ABCDEFGHIJKLMNOP key Bearer abcdefghijklmnop TOKEN=secret OPENAI_API_KEY='x'";
        let s = scrub_sensitive(t);
        assert!(!s.contains("sk-ABCDEF"));
        assert!(!s.to_lowercase().contains("bearer abcdef"));
        assert!(s.contains("[redacted"));
    }

    #[test]
    fn source_ref_provider_neutral_and_distinct() {
        let a = prompt_source_ref(AgentKind::Claude, "s1", "k1");
        let b = prompt_source_ref(AgentKind::Codex, "s1", "k1");
        let c = prompt_source_ref(AgentKind::Cursor, "s1", "k1");
        assert_ne!(a, b);
        assert_ne!(b, c);
        assert_eq!(a, prompt_source_ref(AgentKind::Claude, "s1", "k1"));
    }

    #[test]
    fn lane_id_matches_lane_key() {
        let id = lane_id_for(AgentKind::Claude, "ws", "ext-9").unwrap();
        assert_eq!(id, "claude:session:ext-9");
    }

    #[test]
    fn canonical_uses_provider_and_project_not_external_alone() {
        let a = canonical_session_id(AgentKind::Claude, "proj", "ext-1");
        assert_ne!(a, "ext-1");
        assert_eq!(a, agent_session_id("claude", "proj", "ext-1"));
        assert_ne!(a, canonical_session_id(AgentKind::Codex, "proj", "ext-1"));
    }

    #[test]
    fn hook_registered_never_shows_text() {
        assert!(!PromptSource::HookRegistered.may_show_prompt_text());
        assert!(PromptSource::ClaudeHook.may_show_prompt_text());
        assert!(PromptSource::OneToneDispatch.may_show_prompt_text());
    }

    #[test]
    fn empty_text_summary_constant() {
        assert_eq!(clean_summary("   "), "");
        assert_eq!(UNKNOWN_PROMPT_SUMMARY, "检测到交互，内容未知");
    }

    #[test]
    fn upsert_then_observe_aligned_with_home_session_id() {
        let ext = format!("pj-align-{}", now_ms());
        let project = "proj-align";
        let cand = SessionCandidate {
            provider: "claude".into(),
            external_session_id: ext.clone(),
            project_id: project.into(),
            project_match: ProjectMatch::Exact,
            match_reason: "test".into(),
            match_confidence: 1.0,
            started_at: Some(now_ms()),
            updated_at: Some(now_ms()),
            title: None,
            is_active: true,
            activity_source: "test".into(),
            active_confidence: 1.0,
            workspace_evidence: None,
        };
        let home_sid = upsert_session_candidate(&cand).expect("upsert");
        assert_eq!(
            home_sid,
            agent_session_id("claude", project, &ext),
            "home session id must use agent_session_id"
        );

        let rec = note_inbound_prompt(PromptObserveInput {
            provider: AgentKind::Claude,
            workspace_id: "ws",
            external_session_id: &ext,
            project_id: project,
            text: Some("fix the login form"),
            source: PromptSource::OneToneDispatch,
            observed_at: Some(now_ms()),
            source_key: "turn-align",
        })
        .expect("observe");
        assert_eq!(rec.canonical_session_id, home_sid);
        assert_ne!(rec.lane_id.as_deref(), Some(home_sid.as_str()));
        assert_eq!(
            rec.lane_id.as_deref(),
            Some(format!("claude:session:{ext}").as_str())
        );

        let list = recent_prompts(&home_sid, 5).expect("recent by home id");
        assert!(!list.is_empty(), "home session id must find prompt");
        assert_eq!(list[0].summary, "fix the login form");
        assert_eq!(list[0].external_session_id, ext);
        assert_eq!(list[0].project_id, project);
    }

    #[test]
    fn observe_and_recent_prompts_idempotent() {
        let key = format!("pj-test-{}", now_ms());
        let mk = || PromptObserveInput {
            provider: AgentKind::Claude,
            workspace_id: "ws",
            external_session_id: &key,
            project_id: "proj-test",
            text: Some("fix the login\nform please"),
            source: PromptSource::OneToneDispatch,
            observed_at: Some(now_ms()),
            source_key: "turn-1",
        };
        let r1 = observe_prompt(mk()).expect("observe");
        assert_eq!(r1.source, "OneToneDispatch");
        assert!(!r1.summary.contains('\n'));
        assert_eq!(
            r1.canonical_session_id,
            agent_session_id("claude", "proj-test", &key)
        );
        let r2 = observe_prompt(mk()).expect("observe2");
        assert_eq!(r1.source_ref, r2.source_ref);
        let list = recent_prompts(&r1.canonical_session_id, 5).expect("recent");
        assert!(!list.is_empty());
        assert_eq!(list[0].summary, r1.summary);
    }

    #[test]
    fn hook_registered_hides_text() {
        let key = format!("pj-hook-{}", now_ms());
        let r = observe_prompt(PromptObserveInput {
            provider: AgentKind::Claude,
            workspace_id: "ws",
            external_session_id: &key,
            project_id: "p",
            text: Some("secret prompt body"),
            source: PromptSource::HookRegistered,
            observed_at: Some(now_ms()),
            source_key: "h1",
        })
        .expect("obs");
        assert_eq!(r.summary, UNKNOWN_PROMPT_SUMMARY);
        assert_eq!(r.source, "HookRegistered");
        assert_eq!(r.confidence, "low");
    }

    #[test]
    fn user_prompt_submit_without_text_unknown_summary() {
        let ext = format!("pj-notext-{}", now_ms());
        maybe_note_from_hook_payload(
            AgentKind::Claude,
            "UserPromptSubmit",
            &ext,
            "t1",
            "",
            "",
            now_ms(),
            "claude_hook",
        );
        let sid = agent_session_id("claude", UNKNOWN_PROJECT_ID, &ext);
        let list = recent_prompts(&sid, 3).expect("recent");
        assert!(!list.is_empty());
        assert_eq!(list[0].summary, UNKNOWN_PROMPT_SUMMARY);
        assert_eq!(list[0].confidence, "low");
    }

    #[test]
    fn claude_hook_fixture_with_prompt_text() {
        let ext = format!("pj-fixture-{}", now_ms());
        maybe_note_from_hook_payload(
            AgentKind::Claude,
            "UserPromptSubmit",
            &ext,
            "turn-f",
            "",
            "rewrite the README intro",
            now_ms(),
            "claude_hook",
        );
        let sid = agent_session_id("claude", UNKNOWN_PROJECT_ID, &ext);
        let list = recent_prompts(&sid, 3).expect("recent");
        assert!(!list.is_empty());
        assert_eq!(list[0].summary, "rewrite the README intro");
        assert_eq!(list[0].source, "ClaudeHook");
    }
}
