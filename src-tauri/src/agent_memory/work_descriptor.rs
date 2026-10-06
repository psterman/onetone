//! WorkDescriptor — read-only projection joining home session, lane, and prompt.
//! Not a second session store. Action freshness never uses `lane.updated_at`.

use crate::agent_lane::model::{AgentLane, LaneState};
use crate::agent_memory::events::agent_session_id;
use crate::agent_memory::model::{HomeSessionDto, ProjectMatch, UNKNOWN_PROJECT_ID};
use crate::agent_memory::prompt_journal::PromptRecord;
use crate::agent_memory::store::{now_ms, with_read_path};
use crate::agent_memory::title::{resolve_title, TitleDerivedFrom, TitleInputs, TitleSource};
use crate::soft_pad_runtime::AgentKind;
use rusqlite::params;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum LiveSessionMatch {
    Exact,
    BestEffort,
    Unique,
    Ambiguous,
    NotFound,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct LiveSessionResolution {
    pub status: LiveSessionMatch,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub canonical_session_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub project_id: Option<String>,
}

/// Runtime matcher: provider + external; project is priority only.
/// Multiple unresolved candidates → Ambiguous (fail-closed for actions).
pub fn resolve_live_session(
    provider: &str,
    external_id: &str,
    project_hint: Option<&str>,
) -> LiveSessionResolution {
    let provider = provider.trim();
    let external = external_id.trim();
    if provider.is_empty() || external.is_empty() {
        return LiveSessionResolution {
            status: LiveSessionMatch::NotFound,
            canonical_session_id: None,
            project_id: None,
        };
    }
    let hint = project_hint.map(str::trim).filter(|s| !s.is_empty());

    let rows: Result<Vec<(String, String, String)>, String> = with_read_path(|conn| {
        let mut stmt = conn
            .prepare(
                "SELECT session_id, project_id, COALESCE(project_match, 'unknown')
                 FROM agent_sessions
                 WHERE provider = ?1 AND external_session_id = ?2",
            )
            .map_err(|e| e.to_string())?;
        let iter = stmt
            .query_map(params![provider, external], |r| {
                Ok((
                    r.get::<_, String>(0)?,
                    r.get::<_, String>(1)?,
                    r.get::<_, String>(2)?,
                ))
            })
            .map_err(|e| e.to_string())?;
        let mut out = Vec::new();
        for row in iter {
            out.push(row.map_err(|e| e.to_string())?);
        }
        Ok(out)
    });

    let Ok(mut candidates) = rows else {
        return LiveSessionResolution {
            status: LiveSessionMatch::NotFound,
            canonical_session_id: None,
            project_id: None,
        };
    };

    if candidates.is_empty() {
        // No DB row yet — still expose live identity for journaling later.
        if let Some(pid) = hint {
            return LiveSessionResolution {
                status: LiveSessionMatch::BestEffort,
                canonical_session_id: Some(agent_session_id(provider, pid, external)),
                project_id: Some(pid.to_string()),
            };
        }
        return LiveSessionResolution {
            status: LiveSessionMatch::NotFound,
            canonical_session_id: None,
            project_id: None,
        };
    }

    if let Some(pid) = hint {
        if let Some((sid, project, _)) = candidates.iter().find(|(_, p, _)| p == pid).cloned() {
            return LiveSessionResolution {
                status: LiveSessionMatch::Exact,
                canonical_session_id: Some(sid),
                project_id: Some(project),
            };
        }
    }

    if candidates.len() == 1 {
        let (sid, project, _) = candidates.remove(0);
        return LiveSessionResolution {
            status: LiveSessionMatch::Unique,
            canonical_session_id: Some(sid),
            project_id: Some(project),
        };
    }

    // Best project_match rank among candidates.
    candidates.sort_by_key(|(_, _, m)| std::cmp::Reverse(ProjectMatch::from_str_loose(m).rank()));
    let best_rank = ProjectMatch::from_str_loose(&candidates[0].2).rank();
    let top: Vec<_> = candidates
        .iter()
        .filter(|(_, _, m)| ProjectMatch::from_str_loose(m).rank() == best_rank)
        .cloned()
        .collect();
    if top.len() == 1 {
        return LiveSessionResolution {
            status: LiveSessionMatch::BestEffort,
            canonical_session_id: Some(top[0].0.clone()),
            project_id: Some(top[0].1.clone()),
        };
    }

    LiveSessionResolution {
        status: LiveSessionMatch::Ambiguous,
        canonical_session_id: None,
        project_id: None,
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct EvidenceBool {
    pub value: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reason: Option<String>,
    /// Freshness of the *action evidence*, never lane.updated_at.
    pub fresh: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WorkDescriptor {
    pub canonical_session_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub external_session_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub lane_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    pub title_source: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title_derived_from: Option<String>,
    pub state: String,
    pub state_source: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cwd: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub hwnd: Option<u64>,
    pub can_focus_live: EvidenceBool,
    pub can_resume: EvidenceBool,
    pub can_open_exact_session: EvidenceBool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub observed_at: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub fresh_until: Option<u64>,
    pub confidence: String,
    pub live_match: LiveSessionMatch,
}

fn nonempty(s: Option<&str>) -> Option<&str> {
    s.map(str::trim).filter(|x| !x.is_empty())
}

/// Freshness facts for actions — never derived from lane.updated_at.
#[derive(Debug, Clone, Copy)]
pub struct FreshEvidence<'a> {
    pub value: &'a str,
    pub source: &'a str,
    pub observed_at: u64,
    pub fresh_until: u64,
    pub confidence: &'a str,
}

fn evidence_fresh(obs: Option<&FreshEvidence<'_>>, now: u64) -> bool {
    match obs {
        Some(o) if o.fresh_until > 0 => o.fresh_until >= now,
        Some(o) if o.observed_at > 0 => now.saturating_sub(o.observed_at) < 120_000,
        _ => false,
    }
}

/// Build a read-only work projection. Lane supplies targets only; freshness from obs.
pub fn resolve_work_descriptor(
    kind: AgentKind,
    home: Option<&HomeSessionDto>,
    lane: Option<&AgentLane>,
    prompt: Option<&PromptRecord>,
    obs: Option<&FreshEvidence<'_>>,
    project_label: Option<&str>,
    now: u64,
) -> WorkDescriptor {
    let external = home
        .map(|h| h.external_session_id.as_str())
        .or_else(|| lane.map(|l| l.key.session_id.as_str()))
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string());

    let project_id = home
        .map(|h| h.project_id.as_str())
        .filter(|s| !s.is_empty())
        .unwrap_or(UNKNOWN_PROJECT_ID);

    let live = match external.as_deref() {
        Some(ext) => resolve_live_session(kind.as_str(), ext, Some(project_id)),
        None => LiveSessionResolution {
            status: LiveSessionMatch::NotFound,
            canonical_session_id: None,
            project_id: None,
        },
    };

    let canonical = live
        .canonical_session_id
        .clone()
        .or_else(|| home.map(|h| h.session_id.clone()))
        .unwrap_or_default();

    let lane_id = lane.map(|l| l.lane_id.clone()).or_else(|| {
        external
            .as_ref()
            .map(|e| format!("{}:session:{e}", kind.as_str()))
    });

    // Title: never Observed from project/prompt. Lane nonempty title → Derived.
    let lane_title = lane.and_then(|l| nonempty(l.title.as_deref()));
    let prompt_summary = prompt
        .map(|p| p.summary.as_str())
        .and_then(|s| nonempty(Some(s)));
    let session_meta = home.and_then(|h| nonempty(Some(h.status.as_str())));
    let title = resolve_title(TitleInputs {
        prompt_summary: if lane_title.is_some() {
            None
        } else {
            prompt_summary
        },
        project_name: if lane_title.is_some() || prompt_summary.is_some() {
            None
        } else {
            project_label.and_then(|p| nonempty(Some(p)))
        },
        session_meta: if lane_title.is_some() || prompt_summary.is_some() {
            None
        } else {
            session_meta
        },
        lifecycle_summary: None,
    });
    let (title_text, title_source, title_from) = if let Some(lt) = lane_title {
        (
            Some(lt.to_string()),
            TitleSource::Derived.as_str().to_string(),
            Some(TitleDerivedFrom::SessionMeta.as_str().to_string()),
        )
    } else if !title.text.is_empty() {
        (
            Some(title.text.clone()),
            title.source.as_str().to_string(),
            title.derived_from.map(|d| d.as_str().to_string()),
        )
    } else {
        (None, TitleSource::Unknown.as_str().to_string(), None)
    };

    // Prefer fresher ObservedStatus for action-facing state; lane state is UI target only
    // when obs is missing/stale — still label source honestly.
    let obs_fresh = evidence_fresh(obs, now);
    let (state, state_source) = if obs_fresh {
        if let Some(o) = obs {
            (o.value.to_string(), format!("observedStatus:{}", o.source))
        } else {
            ("unknown".into(), "none".into())
        }
    } else if let Some(l) = lane {
        (l.state.ui_status().to_string(), "laneState".into())
    } else if let Some(h) = home {
        (h.status.clone(), "homeSession".into())
    } else if let Some(o) = obs {
        (
            o.value.to_string(),
            format!("observedStatusStale:{}", o.source),
        )
    } else {
        ("unknown".into(), "none".into())
    };

    let cwd = lane
        .map(|l| l.navigation.cwd.trim())
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string());
    let hwnd = lane.map(|l| l.navigation.terminal_hwnd).filter(|&h| h != 0);

    let caps = lane.map(|l| l.caps());
    let target_ok =
        live.status != LiveSessionMatch::Ambiguous && live.status != LiveSessionMatch::NotFound;

    let can_focus_live = EvidenceBool {
        value: caps.as_ref().map(|c| c.can_focus_live).unwrap_or(false) && target_ok && obs_fresh,
        reason: if !target_ok {
            Some("ambiguous_or_missing_session".into())
        } else if !obs_fresh {
            Some("evidence_stale".into())
        } else if caps.as_ref().map(|c| c.can_focus_live) != Some(true) {
            Some("no_focus_target".into())
        } else {
            None
        },
        fresh: obs_fresh,
    };
    let can_resume = EvidenceBool {
        value: caps.as_ref().map(|c| c.can_resume).unwrap_or(false) && target_ok && obs_fresh,
        reason: if !target_ok {
            Some("ambiguous_or_missing_session".into())
        } else if !obs_fresh {
            Some("evidence_stale".into())
        } else if caps.as_ref().map(|c| c.can_resume) != Some(true) {
            Some("no_lane".into())
        } else {
            None
        },
        fresh: obs_fresh,
    };
    let can_open_exact = EvidenceBool {
        value: caps
            .as_ref()
            .map(|c| c.can_open_exact_session)
            .unwrap_or(false)
            && target_ok
            && obs_fresh,
        reason: can_resume.reason.clone(),
        fresh: obs_fresh,
    };

    WorkDescriptor {
        canonical_session_id: canonical,
        external_session_id: external,
        lane_id,
        title: title_text,
        title_source,
        title_derived_from: title_from,
        state,
        state_source,
        cwd,
        hwnd,
        can_focus_live,
        can_resume,
        can_open_exact_session: can_open_exact,
        observed_at: obs.map(|o| o.observed_at).filter(|&t| t > 0),
        fresh_until: obs.map(|o| o.fresh_until).filter(|&t| t > 0),
        confidence: obs
            .map(|o| o.confidence.to_string())
            .unwrap_or_else(|| "low".into()),
        live_match: live.status,
    }
}

/// Lane state helper for tests / callers without full AgentLane.
pub fn lane_state_label(state: LaneState) -> &'static str {
    state.ui_status()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::agent_lane::model::{LaneKey, NavigationTarget};
    use crate::agent_memory::events::upsert_session_candidate;
    use crate::agent_memory::model::SessionCandidate;
    use crate::agent_memory::prompt_journal::{
        note_inbound_prompt, PromptObserveInput, PromptSource,
    };

    fn home(ext: &str, project: &str, sid: &str) -> HomeSessionDto {
        HomeSessionDto {
            session_id: sid.into(),
            provider: "claude".into(),
            external_session_id: ext.into(),
            title: None,
            updated_at: Some(now_ms()),
            status: "running".into(),
            project_id: project.into(),
            project_match: "exact".into(),
            match_reason: "test".into(),
            match_confidence: 1.0,
            is_active: true,
            activity_source: "test".into(),
            active_confidence: 1.0,
        }
    }

    fn lane(ext: &str, title: Option<&str>, hwnd: u64) -> AgentLane {
        AgentLane {
            lane_id: format!("claude:session:{ext}"),
            key: LaneKey {
                provider: AgentKind::Claude,
                workspace_id: String::new(),
                session_id: ext.into(),
            },
            subagent_id: None,
            title: title.map(|s| s.into()),
            state: LaneState::Working,
            source: "test".into(),
            confidence: "high".into(),
            first_seen_at: now_ms(),
            updated_at: now_ms(),
            acknowledged_at: None,
            done_at: None,
            navigation: NavigationTarget {
                cwd: "/tmp/ws".into(),
                host_pid: 1,
                terminal_hwnd: hwnd,
                terminal_title: String::new(),
            },
            subagent_summary: vec![],
            sequence: 1,
        }
    }

    #[test]
    fn different_providers_same_external_do_not_collide() {
        let a = resolve_live_session("claude", "same-ext", Some("p1"));
        let b = resolve_live_session("codex", "same-ext", Some("p1"));
        // Without DB rows both BestEffort with different canonical ids
        assert_ne!(a.canonical_session_id, b.canonical_session_id);
    }

    #[test]
    fn ambiguous_when_two_projects_same_external() {
        use crate::agent_memory::store::with_write;
        let ext = format!("amb-{}", now_ms());
        with_write(|conn| {
            for (sid, project) in [
                (format!("sid-a-{}", now_ms()), "proj-a"),
                (format!("sid-b-{}", now_ms() + 1), "proj-b"),
            ] {
                conn.execute(
                    "INSERT INTO agent_sessions(
                       session_id, provider, project_id, external_session_id, title,
                       started_at_ms, updated_at_ms, last_seen_at_ms, status,
                       project_match, match_reason, match_confidence,
                       is_active, activity_source, active_confidence
                     ) VALUES (?1, 'claude', ?2, ?3, NULL, ?4, ?4, ?4, 'discovered',
                               'exact', 'test', 1.0, 1, 'test', 1.0)",
                    rusqlite::params![sid, project, &ext, now_ms() as i64],
                )
                .map_err(|e| e.to_string())?;
            }
            Ok(())
        })
        .expect("insert two projects");
        let r = resolve_live_session("claude", &ext, None);
        assert_eq!(r.status, LiveSessionMatch::Ambiguous);
        assert!(r.canonical_session_id.is_none());
    }

    #[test]
    fn exact_project_hint_wins() {
        use crate::agent_memory::store::with_write;
        let ext = format!("exact-{}", now_ms());
        with_write(|conn| {
            for (sid, project) in [
                (format!("sid-a-{}", now_ms()), "proj-a"),
                (format!("sid-b-{}", now_ms() + 1), "proj-b"),
            ] {
                conn.execute(
                    "INSERT INTO agent_sessions(
                       session_id, provider, project_id, external_session_id, title,
                       started_at_ms, updated_at_ms, last_seen_at_ms, status,
                       project_match, match_reason, match_confidence,
                       is_active, activity_source, active_confidence
                     ) VALUES (?1, 'claude', ?2, ?3, NULL, ?4, ?4, ?4, 'discovered',
                               'exact', 'test', 1.0, 1, 'test', 1.0)",
                    rusqlite::params![sid, project, &ext, now_ms() as i64],
                )
                .map_err(|e| e.to_string())?;
            }
            Ok(())
        })
        .expect("insert");
        let r = resolve_live_session("claude", &ext, Some("proj-b"));
        assert_eq!(r.status, LiveSessionMatch::Exact);
        assert_eq!(r.project_id.as_deref(), Some("proj-b"));
    }

    #[test]
    fn empty_lane_title_falls_back_to_prompt_derived() {
        let now = now_ms();
        let ext = format!("wd-{}", now);
        let sid = agent_session_id("claude", "p", &ext);
        let rec = note_inbound_prompt(PromptObserveInput {
            provider: AgentKind::Claude,
            workspace_id: "",
            external_session_id: &ext,
            project_id: "p",
            text: Some("fix the login form"),
            source: PromptSource::OneToneDispatch,
            observed_at: Some(now),
            source_key: "t1",
        })
        .expect("note");
        let obs = FreshEvidence {
            value: "working",
            source: "officialHook",
            observed_at: now,
            fresh_until: now + 60_000,
            confidence: "high",
        };
        let wd = resolve_work_descriptor(
            AgentKind::Claude,
            Some(&home(&ext, "p", &sid)),
            Some(&lane(&ext, None, 0)),
            Some(&rec),
            Some(&obs),
            Some("voice-pilot"),
            now,
        );
        assert_eq!(wd.title.as_deref(), Some("fix the login form"));
        assert_eq!(wd.title_source, "derived");
        assert_eq!(wd.title_derived_from.as_deref(), Some("prompt"));
    }

    #[test]
    fn stale_obs_disables_action_evidence_even_if_lane_updated() {
        let now = now_ms();
        let ext = "stale-ext";
        let sid = agent_session_id("claude", "p", ext);
        let mut l = lane(ext, Some("t"), 12345);
        l.updated_at = now; // fresh lane stamp must NOT enable actions
        let obs = FreshEvidence {
            value: "working",
            source: "officialHook",
            observed_at: now.saturating_sub(500_000),
            fresh_until: now.saturating_sub(100_000),
            confidence: "low",
        };
        let wd = resolve_work_descriptor(
            AgentKind::Claude,
            Some(&home(ext, "p", &sid)),
            Some(&l),
            None,
            Some(&obs),
            None,
            now,
        );
        assert!(!wd.can_focus_live.value);
        assert!(!wd.can_focus_live.fresh);
        assert_eq!(wd.can_focus_live.reason.as_deref(), Some("evidence_stale"));
    }

    #[test]
    fn missing_hwnd_keeps_none() {
        let now = now_ms();
        let ext = "no-hwnd";
        let sid = agent_session_id("claude", "p", ext);
        let obs = FreshEvidence {
            value: "idle",
            source: "none",
            observed_at: now,
            fresh_until: now + 60_000,
            confidence: "low",
        };
        let wd = resolve_work_descriptor(
            AgentKind::Claude,
            Some(&home(ext, "p", &sid)),
            Some(&lane(ext, None, 0)),
            None,
            Some(&obs),
            None,
            now,
        );
        assert!(wd.hwnd.is_none());
        assert_eq!(wd.cwd.as_deref(), Some("/tmp/ws"));
    }
}
