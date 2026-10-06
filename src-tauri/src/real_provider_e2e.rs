//! Real Provider interrupt evidence runner — C1 / U1 / X1–X4.
//!
//! Gate: `ONETONE_AGENT_REAL_INTERRUPT_E2E=1`
//! Scenario: `ONETONE_REAL_INTERRUPT_SCENARIO=U1` (C1|U1|X1|X2|X3|X4)
//! Out dir: `ONETONE_REAL_PROVIDER_OUT` or docs/acceptance-artifacts/20261005/real-provider
//!
//! Refuses `ONETONE_E2E_DATA_ROOT` (must use real AppData).
//! Does not fabricate outcomes — writes whatever execute_agent_center_action returns.

use crate::agent_memory::{
    build_agent_center_snapshot_with_hints, collect_resolve_hints, execute_agent_center_action,
    AgentCenterSnapshot, ProbePolicy,
};
use crate::AppState;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Duration;
use tauri::{AppHandle, WebviewWindow};

pub fn maybe_spawn(app: AppHandle, state: Arc<AppState>, window: WebviewWindow) {
    if std::env::var("ONETONE_AGENT_REAL_INTERRUPT_E2E").ok().as_deref() != Some("1") {
        return;
    }
    if std::env::var_os("ONETONE_E2E_DATA_ROOT").is_some() {
        eprintln!("real_provider_e2e: refuse ONETONE_E2E_DATA_ROOT (need real AppData)");
        return;
    }
    let scenario = std::env::var("ONETONE_REAL_INTERRUPT_SCENARIO")
        .unwrap_or_else(|_| "U1".into())
        .trim()
        .to_uppercase();
    std::thread::Builder::new()
        .name("real-provider-e2e".into())
        .spawn(move || run(app, state, window, scenario))
        .ok();
}

fn out_root() -> PathBuf {
    if let Ok(p) = std::env::var("ONETONE_REAL_PROVIDER_OUT") {
        let t = p.trim();
        if !t.is_empty() {
            return PathBuf::from(t);
        }
    }
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../docs/acceptance-artifacts/20261005/real-provider")
}

fn sleep_ms(ms: u64) {
    std::thread::sleep(Duration::from_millis(ms));
}

fn write_json(path: &Path, value: &impl serde::Serialize) {
    if let Ok(s) = serde_json::to_string_pretty(value) {
        let _ = fs::write(path, s);
    }
}

fn mark(dir: &Path, step: &str) {
    let _ = fs::write(dir.join("e2e-step.txt"), step);
}

fn kind_for_scenario(scenario: &str) -> Option<&'static str> {
    match scenario {
        "C1" => Some("claude"),
        "U1" => Some("cursor"),
        "X1" | "X2" | "X3" | "X4" => Some("codex"),
        _ => None,
    }
}

fn expected_u1_ok(result: &crate::agent_memory::AgentCenterActionResult) -> bool {
    // Cursor must never be Verified.
    !result.verified
        && matches!(
            result.outcome,
            crate::agent_memory::ActionOutcome::AttemptedUnverified
                | crate::agent_memory::ActionOutcome::Failed
        )
}

fn run(app: AppHandle, state: Arc<AppState>, window: WebviewWindow, scenario: String) {
    let root = out_root();
    let dir = root.join(&scenario);
    let _ = fs::create_dir_all(&dir);
    mark(&dir, "boot");
    let _ = window.eval("window.__ONETONE_REAL_PROVIDER_E2E__ = true;");

    // Let FE + registry settle on real AppData.
    sleep_ms(8000);
    mark(&dir, "ready");

    let Some(want_kind) = kind_for_scenario(&scenario) else {
        mark(&dir, "FAIL_unknown_scenario");
        let _ = fs::write(dir.join("e2e-done.txt"), format!("fail:unknown_scenario:{scenario}"));
        return;
    };

    // Navigate home so PrintWindow can show roster if operator captures externally.
    let _ = window.eval(
        r#"(function(){
  try {
    if (window.Now && typeof window.Now.show === 'function') window.Now.show();
    else if (window.OneToneNowHome && window.OneToneNowHome.show) window.OneToneNowHome.show();
  } catch (e) {}
})();"#,
    );
    sleep_ms(1500);

    let project = PathBuf::from(r"E:\voice-pilot");
    let hint = Some(project.as_path());

    let snap_before = snapshot_now(&state, hint);
    write_json(&dir.join("snapshot-before.json"), &snap_before);
    mark(&dir, "snapshot-before");

    let agent = snap_before
        .agents
        .iter()
        .find(|a| {
            a.runtime_kind
                .as_deref()
                .map(|k| k.eq_ignore_ascii_case(want_kind))
                .unwrap_or(false)
                || a.agent_id.to_lowercase().contains(want_kind)
        })
        .cloned();

    let Some(agent) = agent else {
        mark(&dir, "FAIL_agent_not_in_snapshot");
        write_json(
            &dir.join("action-result.json"),
            &serde_json::json!({
                "status": "blocked",
                "error": "agent_not_in_snapshot",
                "wantKind": want_kind,
                "agentIds": snap_before.agents.iter().map(|a| &a.agent_id).collect::<Vec<_>>(),
            }),
        );
        let _ = fs::write(dir.join("e2e-done.txt"), "fail:agent_not_in_snapshot");
        let _ = app.exit(2);
        return;
    };

    let interrupt = agent
        .actions
        .iter()
        .find(|a| a.id == "agent.interrupt")
        .cloned();
    if interrupt.as_ref().map(|a| a.enabled) != Some(true) {
        mark(&dir, "FAIL_interrupt_not_enabled");
        let blocked = serde_json::json!({
            "scenario": scenario,
            "status": "blocked",
            "error": "interrupt_not_enabled",
            "agentId": agent.agent_id,
            "interrupt": interrupt,
            "observedStatus": agent.observed_status,
            "note": "Honest block — not a pass. Prepare an active Provider session per scenario-prep.md and re-run."
        });
        write_json(&dir.join("action-result.json"), &blocked);
        write_json(&dir.join("BLOCKED.json"), &blocked);
        let _ = fs::write(dir.join("e2e-done.txt"), "fail:interrupt_not_enabled");
        return;
    }

    let attempt = format!(
        "real-{}-{}",
        scenario.to_lowercase(),
        chrono_like_stamp()
    );
    mark(&dir, "interrupt");
    let result = execute_agent_center_action(
        &state,
        &window,
        &agent.agent_id,
        "agent.interrupt",
        hint,
        Some(&attempt),
    );
    write_json(&dir.join("action-result.json"), &result);
    mark(&dir, "action-result");

    sleep_ms(2500);
    let snap_after = snapshot_now(&state, hint);
    write_json(&dir.join("snapshot-after.json"), &snap_after);
    mark(&dir, "snapshot-after");

    // Bring roster into view for optional external PrintWindow.
    let _ = window.eval(
        r#"(function(){
  try {
    var host = document.getElementById('homeAgentRoster');
    var canvas = document.querySelector('.hn-canvas');
    var focus = host && (host.querySelector('.har-head') || host);
    if (canvas && focus) {
      var cr = canvas.getBoundingClientRect();
      var tr = focus.getBoundingClientRect();
      canvas.scrollTop = Math.max(0, canvas.scrollTop + (tr.top - cr.top - 16));
    }
  } catch (e) {}
})();"#,
    );
    sleep_ms(800);
    mark(&dir, "ready-for-shot");

    let acceptance = match scenario.as_str() {
        "U1" => {
            let ok = expected_u1_ok(&result);
            serde_json::json!({
                "scenario": "U1",
                "rule": "cursor_never_verified",
                "pass": ok,
                "outcome": result.outcome,
                "ok": result.ok,
                "verified": result.verified,
                "attemptId": result.attempt_id,
            })
        }
        other => serde_json::json!({
            "scenario": other,
            "rule": "recorded_only_manual_assert",
            "pass": null,
            "outcome": result.outcome,
            "ok": result.ok,
            "verified": result.verified,
            "attemptId": result.attempt_id,
            "note": "Assert against scenario-prep.md manually; harness only records.",
        }),
    };
    write_json(&dir.join("acceptance.json"), &acceptance);

    let done = if scenario == "U1" && expected_u1_ok(&result) {
        "pass"
    } else if scenario == "U1" {
        "fail:u1_verified_or_unexpected"
    } else {
        "recorded"
    };
    let _ = fs::write(dir.join("e2e-done.txt"), done);
    mark(&dir, "done");

    // Allow external capture script a few seconds, then exit so orchestrator can finish.
    sleep_ms(6000);
    if std::env::var("ONETONE_REAL_INTERRUPT_EXIT")
        .ok()
        .as_deref()
        == Some("1")
    {
        let code = if done == "pass" || done == "recorded" {
            0
        } else {
            3
        };
        let _ = app.exit(code);
    }
}

fn snapshot_now(state: &Arc<AppState>, hint: Option<&Path>) -> AgentCenterSnapshot {
    let hints = collect_resolve_hints(state, ProbePolicy::ForceFresh);
    build_agent_center_snapshot_with_hints(hint, &[], false, &hints)
}

fn chrono_like_stamp() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    ms.to_string()
}
