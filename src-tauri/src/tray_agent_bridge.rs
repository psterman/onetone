//! Tray agent status bridge — aggregate pad + Claude lights for tray menu pulse.

use crate::pad_status::{self, claude_lights, map_codex_event_to_state, ui_status_from_pad};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TrayAgentVisual {
    pub light: String,
    pub status_label: String,
    pub agent_name: String,
    pub source: String,
    pub last_seen_at: u64,
}

struct Candidate {
    light: String,
    seen: u64,
    agent: String,
    source: String,
}

pub fn read_tray_agent_visual() -> TrayAgentVisual {
    let now = tray_now_millis();
    let mut candidates: Vec<Candidate> = Vec::new();

    let pad = pad_status::snapshot();
    let pad_light = normalize_light(&ui_status_from_pad(&pad));
    if pad.updated_at > 0 {
        candidates.push(Candidate {
            light: pad_light,
            seen: pad.updated_at,
            agent: agent_display(pad.agent.as_deref().unwrap_or(""), ""),
            source: pad.display_source_label().to_string(),
        });
    }

    for cl in claude_lights::snapshot_active(now) {
        candidates.push(Candidate {
            light: normalize_light(&cl.state),
            seen: cl.updated_at,
            agent: agent_display("claude", &cl.agent_type),
            source: cl.source.clone(),
        });
    }

    let app = crate::codex_app_state::snapshot();
    if app.last_seen_at > 0 {
        if let Some(state) = map_codex_event_to_state(&app.last_event) {
            let light = normalize_light(state);
            if light != "idle" {
                candidates.push(Candidate {
                    light,
                    seen: app.last_seen_at,
                    agent: "Codex".into(),
                    source: app.last_source.clone(),
                });
            }
        }
    }

    if let Some(best) = candidates.into_iter().max_by(|a, b| {
        light_priority(&a.light)
            .cmp(&light_priority(&b.light))
            .then(a.seen.cmp(&b.seen))
    }) {
        if best.light != "idle" && light_priority(&best.light) > 0 {
            return TrayAgentVisual {
                light: best.light.clone(),
                status_label: status_label_for(&best.light).into(),
                agent_name: best.agent,
                source: best.source,
                last_seen_at: best.seen,
            };
        }
    }

    TrayAgentVisual {
        light: "idle".into(),
        status_label: "空闲".into(),
        agent_name: String::new(),
        source: String::new(),
        last_seen_at: 0,
    }
}

fn normalize_light(raw: &str) -> String {
    let t = raw.trim();
    if t == "error" {
        return "failed".into();
    }
    if matches!(
        t,
        "idle" | "running" | "listening" | "needs_input" | "done" | "failed"
    ) {
        return t.to_string();
    }
    "idle".into()
}

fn light_priority(light: &str) -> u8 {
    match light.trim() {
        "failed" => 60,
        "needs_input" => 50,
        "running" => 40,
        "listening" => 30,
        "done" => 20,
        _ => 0,
    }
}

fn agent_display(agent: &str, agent_type: &str) -> String {
    let a = agent.trim().to_ascii_lowercase();
    if a == "claude" || a.contains("claude") {
        return "Claude".into();
    }
    if a == "codex" || a.contains("codex") {
        return "Codex".into();
    }
    let at = agent_type.trim();
    if !at.is_empty() {
        return pad_status::short_agent_type(at);
    }
    "Agent".into()
}

fn status_label_for(light: &str) -> &'static str {
    match light {
        "listening" => "听写中",
        "needs_input" => "等待输入",
        "running" => "执行中",
        "done" => "完成",
        "failed" => "失败",
        _ => "空闲",
    }
}

fn tray_now_millis() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn priority_failed_beats_running() {
        assert!(light_priority("failed") > light_priority("running"));
        assert!(light_priority("needs_input") > light_priority("listening"));
    }

    #[test]
    fn normalize_error_to_failed() {
        assert_eq!(normalize_light("error"), "failed");
    }
}
