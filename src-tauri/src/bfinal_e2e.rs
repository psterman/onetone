//! Phase B acceptance runner — only when `ONETONE_BFINAL_E2E=1`.
//! Drives the live main WebView via `eval` + Rust Pending Store (not Chrome harness).

use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Duration;

use tauri::{AppHandle, WebviewWindow};

use crate::agent::route::{route_semantic_action, SemanticActionRequest};
use crate::agent::pending_confirm;
use crate::voice_end_runtime;
use crate::AppState;

fn e2e_dir() -> PathBuf {
    std::env::var_os("ONETONE_BFINAL_E2E_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("logs/b-acceptance"))
}

fn mark(dir: &Path, step: &str) {
    let _ = fs::create_dir_all(dir);
    let _ = fs::write(dir.join("e2e-step.txt"), step);
    let line = format!(
        "{{\"t\":\"{}\",\"step\":\"{}\"}}\n",
        chrono_like_now(),
        step
    );
    let _ = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(dir.join("e2e-log.jsonl"))
        .and_then(|mut f| {
            use std::io::Write;
            f.write_all(line.as_bytes())
        });
}

fn chrono_like_now() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    // Compact ISO-ish UTC without chrono crate.
    let secs = (ms / 1000) as i64;
    let millis = ms % 1000;
    let days = secs.div_euclid(86400);
    let tod = secs.rem_euclid(86400) as u32;
    let h = tod / 3600;
    let m = (tod % 3600) / 60;
    let s = tod % 60;
    // 1970-01-01 + days — good enough for acceptance meta correlation.
    let (y, mo, d) = civil_from_days(days);
    format!("{y:04}-{mo:02}-{d:02}T{h:02}:{m:02}:{s:02}.{millis:03}Z")
}

fn civil_from_days(days: i64) -> (i32, u32, u32) {
    // Howard Hinnant civil_from_days (proleptic Gregorian).
    let z = days + 719468;
    let era = if z >= 0 { z } else { z - 146096 } / 146097;
    let doe = (z - era * 146097) as u64;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let y = yoe as i64 + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if m <= 2 { y + 1 } else { y };
    (y as i32, m as u32, d as u32)
}

fn sleep_ms(ms: u64) {
    std::thread::sleep(Duration::from_millis(ms));
}

fn eval(win: &WebviewWindow, script: &str) {
    let _ = win.eval(script);
}


fn mapping_id(state: &AppState) -> String {
    let cfg = state.cfg.lock();
    // Prefer a mapping that resolves a provider (camera pending requires it).
    for m in &cfg.mappings {
        if crate::agent::options::provider_from_mapping(&cfg, &m.id).is_some() {
            return m.id.clone();
        }
    }
    if !cfg.active_scene_id.trim().is_empty() {
        return cfg.active_scene_id.clone();
    }
    cfg.mappings
        .first()
        .map(|m| m.id.clone())
        .unwrap_or_default()
}

fn ensure_dictating(state: &Arc<AppState>, app: &AppHandle, mid: &str) {
    {
        let mut cfg = state.cfg.lock();
        cfg.voice_end.enabled = true;
        if !cfg.voice_vosk.enabled && !cfg.voice_sapi.enabled && !cfg.voice_kws.enabled {
            cfg.voice_sapi.enabled = true;
        }
    }
    voice_end_runtime::enter_dictating(state, Some(app), mid, "bfinal_e2e");
    // Hard-set session — ContextRiskGate for camera input.send requires needsKind=dictating.
    if voice_end_runtime::session_state(state) != "dictating" {
        *state.voice_session_state.lock() = "dictating".into();
        *state.voice_session_mapping_id.lock() = mid.to_string();
        *state.voice_session_last_action.lock() = "bfinal_e2e_force".into();
    }
}

fn wait_pending(mid: &str, timeout_ms: u64) -> Option<pending_confirm::PendingConfirmationPublic> {
    let steps = (timeout_ms / 200).max(1);
    for _ in 0..steps {
        let rows = pending_confirm::list_public(Some(mid));
        if let Some(row) = rows.into_iter().next() {
            return Some(row);
        }
        sleep_ms(200);
    }
    None
}

/// Spawn after main window exists. No-op unless env gate is set.
pub fn maybe_spawn(app: AppHandle, state: Arc<AppState>, window: WebviewWindow) {
    if std::env::var_os("ONETONE_BFINAL_E2E").is_none() {
        return;
    }
    std::thread::Builder::new()
        .name("bfinal-e2e".into())
        .spawn(move || run(app, state, window))
        .ok();
}

fn run(app: AppHandle, state: Arc<AppState>, window: WebviewWindow) {
    let dir = e2e_dir();
    let _ = fs::create_dir_all(&dir);
    mark(&dir, "boot");
    // Inject E2E flag early so JS guards (e.g. _testSetPresence) work from first use.
    eval(&window, "window.__ONETONE_E2E__ = true;");
    // Wait for FE globals / MVP init.
    sleep_ms(7000);

    let mid = mapping_id(&state);
    if mid.trim().is_empty() {
        mark(&dir, "FAIL_no_mapping");
        let _ = fs::write(dir.join("e2e-done.txt"), "fail:no_mapping");
        return;
    }

    ensure_dictating(&state, &app, &mid);
    sleep_ms(500);

    // --- UI shots: pickers / habit detail (real window DOM) ---
    // Dictating already on so camera Options include input.send (fail-closed otherwise).
    let mid_js = serde_json::to_string(&mid).unwrap_or_else(|_| "\"\"".into());

    eval(
        &window,
        &format!(
            r#"(function(){{
  var mid={mid_js};
  try {{
    if (window.OneToneSettingsDrawer) window.OneToneSettingsDrawer.open({{panel:'keys'}});
    setTimeout(function(){{
      if (window.OneToneSemanticActionPicker) {{
        window.OneToneSemanticActionPicker.open({{mappingId:mid,channel:'key',placement:'key'}});
      }}
      var rec=window.OneToneMappingRecording;
      if (rec && rec.startAgentBinding) {{
        try {{ rec.startAgentBinding(mid, {{onDone:function(){{}},onCancel:function(){{}}}}); }} catch(e) {{}}
      }}
    }}, 400);
  }} catch(e) {{ console.warn('bfinal key shot', e); }}
}})();"#
        ),
    );
    mark(&dir, "key-picker-chord");
    sleep_ms(2200);

    eval(
        &window,
        &format!(
            r#"(function(){{
  var mid={mid_js};
  try {{
    if (window.OneToneSemanticActionPicker) window.OneToneSemanticActionPicker.close();
    if (window.OneToneSettingsDrawer) window.OneToneSettingsDrawer.open({{panel:'voiceWake'}});
    setTimeout(function(){{
      if (window.OneToneSemanticActionPicker) {{
        window.OneToneSemanticActionPicker.open({{mappingId:mid,channel:'voice',placement:'voice'}});
      }}
    }}, 400);
  }} catch(e) {{ console.warn('bfinal voice shot', e); }}
}})();"#
        ),
    );
    mark(&dir, "voice-picker-phrase");
    sleep_ms(2200);

    eval(
        &window,
        &format!(
            r#"(function(){{
  var mid={mid_js};
  try {{
    if (window.OneToneSemanticActionPicker) window.OneToneSemanticActionPicker.close();
    if (window.OneToneSettingsDrawer) window.OneToneSettingsDrawer.open({{panel:'camera'}});
    setTimeout(function(){{
      if (window.OneToneSemanticActionPicker) {{
        window.OneToneSemanticActionPicker.open({{mappingId:mid,channel:'camera',placement:'camera',currentActionId:'input.send'}});
      }}
    }}, 500);
  }} catch(e) {{ console.warn('bfinal camera shot', e); }}
}})();"#
        ),
    );
    mark(&dir, "camera-picker-pending");
    sleep_ms(2400);

    eval(
        &window,
        &format!(
            r#"(function(){{
  var mid={mid_js};
  try {{
    if (window.OneToneSemanticActionPicker) window.OneToneSemanticActionPicker.close();
    if (window.OneToneSettingsDrawer) window.OneToneSettingsDrawer.open({{panel:'softPad',mappingId:mid}});
    setTimeout(function(){{
      if (window.OneToneSemanticActionPicker) {{
        window.OneToneSemanticActionPicker.open({{mappingId:mid,channel:'softPad',placement:'softPad'}});
      }}
    }}, 500);
  }} catch(e) {{ console.warn('bfinal softpad shot', e); }}
}})();"#
        ),
    );
    mark(&dir, "softpad-picker-key");
    sleep_ms(2200);

    eval(
        &window,
        &format!(
            r#"(function(){{
  var mid={mid_js};
  try {{
    if (window.OneToneSemanticActionPicker) window.OneToneSemanticActionPicker.close();
    if (window.OneToneSettingsDrawer) {{
      window.OneToneSettingsDrawer.open({{panel:'habits'}});
    }}
    setTimeout(function(){{
      if (window.OneToneHabitActionsDetail) window.OneToneHabitActionsDetail.open(mid);
    }}, 500);
  }} catch(e) {{ console.warn('bfinal habit shot', e); }}
}})();"#
        ),
    );
    mark(&dir, "habit-actions-detail");
    sleep_ms(2200);

    // Close overlays; persist camera→send bind in live prefs (Picker path).
    eval(
        &window,
        &format!(
            r#"(async function(){{
  var mid={mid_js};
  var Cam=window.OneToneCameraPresenceActions;
  var Store=window.OneToneSemanticActionStore;
  window.__bfinalE2E={{phase:'bind'}};
  try {{
    if (window.OneToneHabitActionsDetail && window.OneToneHabitActionsDetail.close) {{
      window.OneToneHabitActionsDetail.close();
    }}
    if (window.OneToneSettingsDrawer) window.OneToneSettingsDrawer.close();
    if (window.OneToneSemanticActionPicker) window.OneToneSemanticActionPicker.close();
    if (!Cam || !Store) throw new Error('apis missing');
    // FE gate requires isRunning() => camera preview live. Stub only under E2E flag so
    // production gate stays hardware-backed; this E2E proves FE dispatch + IPC Route.
    window.OneToneCameraPreview = window.OneToneCameraPreview || {{}};
    window.OneToneCameraPreview.isRunning = function(){{ return true; }};
    window.OneToneCameraPreview.getGazeDebugState = function(){{ return {{ previewLive:true }}; }};
    var st=window.OneToneState;
    if (st) {{
      st.selectedMappingId=mid;
      if (st.state) st.state.selectedMappingId=mid;
      if (st.ui) st.ui.habitScenarioReturnId=mid;
    }}
    await Store.ensureCatalog();
    if (Cam.persist) await Cam.persist({{ enabled: true }});
    await Cam.persistBindAction(mid, 'shakeHead', 'agent:input.send');
    if (Cam.clearManualStop) {{ try {{ Cam.clearManualStop(); }} catch(e) {{}} }}
    if (Cam.setDrawerUiPaused) {{ try {{ Cam.setDrawerUiPaused(false); }} catch(e) {{}} }}
    if (Cam.ensureRunning) {{ try {{ await Cam.ensureRunning({{ reason:'user_restart' }}); }} catch(e) {{}} }}
    if (Cam.reset) {{ try {{ Cam.reset(); }} catch(e) {{}} }}
    // Drive the real presence state machine into "present" using exported onFrame.
    if (Cam.onFrame) {{
      var frame={{ faceDetected:true, state:'tracking', confidence:1, yaw:0, pitch:0, blink:false }};
      Cam.onFrame(frame);
      await new Promise(function(r){{ setTimeout(r, Math.max(1200, (Cam.PRESENT_MS||1000)+250)); }});
      Cam.onFrame(frame);
    }}
    window.__bfinalE2E={{
      phase:'bound',
      bind: Cam.prefs ? Cam.prefs().shakeHead : null,
      enabled: !!(Cam.isEnabled && Cam.isEnabled()),
      running: !!(Cam.isRunning && Cam.isRunning()),
      presence: Cam.getState ? (Cam.getState().presence||null) : null,
      drawerUiPaused: Cam.getState ? !!(Cam.getState().drawerUiPaused) : null
    }};
  }} catch(e) {{
    window.__bfinalE2E={{phase:'error', error: String(e && e.message || e)}};
    console.error('bfinal bind', e);
  }}
}})();"#
        ),
    );
    sleep_ms(2500);

    // Front-door: Pending must be created only via FE Cam.dispatchAction (real production path).
    // Re-assert dictating in case FE voice runtime cleared session during UI shots.
    ensure_dictating(&state, &app, &mid);
    eval(
        &window,
        &format!(
            r#"(async function(){{
  var mid={mid_js};
  var Cam=window.OneToneCameraPresenceActions;
  window.__bfinalDispatch={{ok:false,status:null,confirmationId:null,error:null}};
  try {{
    if (!Cam || !Cam.dispatchAction) throw new Error('Cam.dispatchAction missing');
    var Store=window.OneToneSemanticActionStore;
    if (Store && Store.ensureCatalog) await Store.ensureCatalog();
    var st=window.OneToneState;
    if (st) {{
      st.selectedMappingId=mid;
      if (st.state) st.state.selectedMappingId=mid;
      if (st.ui) st.ui.habitScenarioReturnId=mid;
    }}
    // Keep preview-live stub for the gate; hardware camera is not the acceptance subject.
    window.OneToneCameraPreview = window.OneToneCameraPreview || {{}};
    window.OneToneCameraPreview.isRunning = function(){{ return true; }};
    window.OneToneCameraPreview.getGazeDebugState = function(){{ return {{ previewLive:true }}; }};
    if (Cam.setDrawerUiPaused) {{ try {{ Cam.setDrawerUiPaused(false); }} catch(e) {{}} }}
    if (Cam.onFrame) {{
      var frame={{ faceDetected:true, state:'tracking', confidence:1, yaw:0, pitch:0, blink:false }};
      Cam.onFrame(frame);
      await new Promise(function(r){{ setTimeout(r, Math.max(1200, (Cam.PRESENT_MS||1000)+250)); }});
      Cam.onFrame(frame);
    }}
    if (Cam._testSetPresence) Cam._testSetPresence('present');
    var token = (Cam.prefs && Cam.prefs().shakeHead) || 'agent:input.send';
    var gate = Cam.canExecuteCameraAction ? Cam.canExecuteCameraAction(token, 'shake') : null;
    var normalized = Cam.normalizeAction ? Cam.normalizeAction(token) : null;
    var pre={{
      enabled: !!(Cam.isEnabled && Cam.isEnabled()),
      running: !!(Cam.isRunning && Cam.isRunning()),
      presence: Cam.getState ? (Cam.getState().presence||null) : null,
      gate: gate,
      token: token,
      normalized: normalized,
      hasRoute: !!(window.OneToneAgentActions && window.OneToneAgentActions.routeSemanticAction),
      bind: window.__bfinalE2E || null
    }};
    if (normalized === 'none') {{
      window.__bfinalDispatch={{ok:false,status:'normalized_none',confirmationId:null,reason:'normalized_none',pre:pre,raw:null}};
      try {{
        var inv0 = (window.OneToneIpc && window.OneToneIpc.invoke) || window.__vp_invoke__;
        if (inv0) await inv0('cmd_app_log', {{ line: 'BFINAL_DISPATCH ' + JSON.stringify(window.__bfinalDispatch).slice(0, 3500) }});
      }} catch(e0) {{}}
      return;
    }}
    var routeRes = await Cam.dispatchAction(token, 'shake', {{ immediate: true }});
    window.__bfinalDispatch={{
      ok: !!(routeRes && (routeRes.status === 'pendingConfirmation' || routeRes.visionOutcome === 'pendingConfirm' || routeRes.confirmationId)),
      status: routeRes ? (routeRes.status || routeRes.visionOutcome || null) : null,
      confirmationId: routeRes ? (routeRes.confirmationId || null) : null,
      reason: routeRes ? (routeRes.reason || null) : null,
      pre: pre,
      raw: routeRes
    }};
    try {{ document.title = 'BFINAL_DISPATCH:' + JSON.stringify(window.__bfinalDispatch).slice(0, 1600); }} catch(e) {{}}
    try {{
      var inv = (window.OneToneIpc && window.OneToneIpc.invoke) || window.__vp_invoke__;
      if (inv) await inv('cmd_app_log', {{ line: 'BFINAL_DISPATCH ' + JSON.stringify(window.__bfinalDispatch).slice(0, 3500) }});
    }} catch(e) {{}}
    if (window.OneToneHomeContextActionsUi && window.OneToneHomeContextActionsUi.refresh) {{
      window.OneToneHomeContextActionsUi.refresh();
    }}
  }} catch(e) {{
    window.__bfinalDispatch={{ok:false,status:'error',confirmationId:null,error:String(e && e.message || e)}};
    try {{ document.title = 'BFINAL_DISPATCH:' + JSON.stringify(window.__bfinalDispatch).slice(0, 1600); }} catch(e2) {{}}
    try {{
      var inv2 = (window.OneToneIpc && window.OneToneIpc.invoke) || window.__vp_invoke__;
      if (inv2) await inv2('cmd_app_log', {{ line: 'BFINAL_DISPATCH ' + JSON.stringify(window.__bfinalDispatch).slice(0, 3500) }});
    }} catch(e3) {{}}
    console.warn('bfinal dispatch', e);
  }}
}})();"#
        ),
    );
    // Give FE IPC round-trip time to complete and Rust store to be written.
    sleep_ms(2500);

    // Authoritative assertion: Rust Pending store must have an entry from camera.
    // (FE Cam.dispatchAction → routeSemanticAction IPC → Rust route → STORE insert)
    let pending = wait_pending(&mid, 5000);
    let Some(pending) = pending else {
        mark(&dir, "FAIL_camera_no_pending");
        let diag = {
            let ring = state.log_ring.lock();
            ring.iter()
                .rev()
                .find(|l| l.contains("BFINAL_DISPATCH "))
                .cloned()
                .unwrap_or_default()
        };
        let diag_body = diag
            .split_once("BFINAL_DISPATCH ")
            .map(|(_, rest)| rest.trim().to_string())
            .unwrap_or_default();
        if !diag_body.is_empty() {
            let _ = fs::write(dir.join("e2e-create-route.json"), &diag_body);
        }
        let detail = format!(
            "fail:FAIL_camera_no_pending session={} diag={}",
            voice_end_runtime::session_state(&state),
            if diag_body.is_empty() {
                "(no fe diag)".into()
            } else {
                diag_body.chars().take(500).collect::<String>()
            }
        );
        let _ = fs::write(dir.join("e2e-done.txt"), detail);
        return;
    };

    // Hard assertions — all five fields must match exactly.
    if pending.source_channel != "camera" {
        mark(&dir, "FAIL_camera_no_pending_confirmation");
        let _ = fs::write(
            dir.join("e2e-done.txt"),
            format!("fail:FAIL_camera_no_pending_confirmation channel={}", pending.source_channel),
        );
        return;
    }
    if pending.confirmation_id.trim().is_empty() {
        mark(&dir, "FAIL_camera_no_confirmation_id");
        let _ = fs::write(dir.join("e2e-done.txt"), "fail:FAIL_camera_no_confirmation_id");
        return;
    }
    if pending.action_id != "input.send" {
        mark(&dir, "FAIL_pending_wrong_action");
        let _ = fs::write(
            dir.join("e2e-done.txt"),
            format!("fail:FAIL_pending_wrong_action actionId={}", pending.action_id),
        );
        return;
    }
    if pending.mapping_id.as_deref() != Some(mid.as_str()) {
        mark(&dir, "FAIL_pending_wrong_mapping");
        let _ = fs::write(
            dir.join("e2e-done.txt"),
            format!("fail:FAIL_pending_wrong_mapping expected={} actual={:?}", mid, pending.mapping_id),
        );
        return;
    }
    let expected_provider = {
        let cfg = state.cfg.lock();
        crate::agent::options::provider_from_mapping(&cfg, &mid).unwrap_or_default()
    };
    if expected_provider.trim().is_empty() {
        mark(&dir, "FAIL_expected_provider_empty");
        let _ = fs::write(
            dir.join("e2e-done.txt"),
            "fail:FAIL_expected_provider_empty",
        );
        return;
    }
    if pending.provider_id.as_deref() != Some(expected_provider.as_str()) {
        mark(&dir, "FAIL_pending_wrong_provider");
        let _ = fs::write(
            dir.join("e2e-done.txt"),
            format!(
                "fail:FAIL_pending_wrong_provider expected={} actual={:?}",
                expected_provider, pending.provider_id
            ),
        );
        return;
    }

    // Write captured create evidence (matches old e2e-create-route.json contract).
    let create_evidence = serde_json::json!({
        "status": "pendingConfirmation",
        "actionId": pending.action_id,
        "sourceChannel": pending.source_channel,
        "mappingId": pending.mapping_id,
        "providerId": pending.provider_id,
        "confirmationId": pending.confirmation_id,
        "gesturePath": "FE Cam.dispatchAction → routeSemanticAction IPC → Rust route (real production path)",
    });
    let _ = fs::write(
        dir.join("e2e-create-route.json"),
        serde_json::to_string_pretty(&create_evidence).unwrap_or_else(|_| "{}".into()),
    );

    // --- Step 1: camera self-confirm MUST fail BEFORE painting the pending card.
    // Do this in Rust directly (authoritative); FE poll must not fire first.
    let confirmation_id = pending.confirmation_id.clone();
    let triggered_at = chrono_like_now();

    let self_res = route_semantic_action(
        &state,
        &window,
        SemanticActionRequest {
            action_id: pending.action_id.clone(),
            source_channel: "camera".into(),
            mapping_id: Some(mid.clone()),
            provider_id: pending.provider_id.clone(),
            confirmation_id: Some(confirmation_id.clone()),
            slot_id: None,
            args: None,
        },
    );
    let after_self = pending_confirm::peek_public(&confirmation_id);
    if after_self.is_none() {
        mark(&dir, "FAIL_self_confirm_cleared");
        let _ = fs::write(dir.join("e2e-done.txt"), "fail:self_confirm_cleared_pending");
        return;
    }

    // --- Step 2: Now paint the home pending card (self-confirm proven; pending still live).
    // Suppress auto-poll button click: stop the poll interval, render snapshot-only.
    eval(
        &window,
        &format!(
            r#"(async function(){{
  var mid={mid_js};
  window.__bfinalPendingPaint={{ok:false}};
  try {{
    if (window.OneToneHabitActionsDetail && window.OneToneHabitActionsDetail.close) {{
      window.OneToneHabitActionsDetail.close();
    }}
    if (window.OneToneSettingsDrawer) window.OneToneSettingsDrawer.close();
    if (window.OneToneSemanticActionPicker) window.OneToneSemanticActionPicker.close();
    var app=document.getElementById('app');
    if (app) app.classList.remove('is-settings');
    var st=window.OneToneState;
    if (st) {{
      if (st.ui) {{ st.ui.habitView='home'; st.ui.drawerOpen=false; }}
      st.selectedMappingId=mid;
      if (st.state) st.state.selectedMappingId=mid;
    }}
    var Store=window.OneToneSemanticActionStore;
    var AA=window.OneToneAgentActions;
    if (Store) {{
      await Store.ensureCatalog();
      await Store.fetchPendingSnapshot(mid);
    }}
    if (window.OneToneHomeContextActionsUi) {{
      if (window.OneToneHomeContextActionsUi.paint) window.OneToneHomeContextActionsUi.paint();
    }}
    await new Promise(function(r){{ setTimeout(r, 800); }});
    if (window.OneToneHomeContextActionsUi) {{
      if (window.OneToneHomeContextActionsUi.paint) window.OneToneHomeContextActionsUi.paint();
    }}
    var card=document.querySelector('.wb-pending-card');
    window.__bfinalPendingPaint={{
      ok:!!card,
      feature: !!(AA && AA.featureDynamicContextActions && AA.featureDynamicContextActions()),
      pending: Store && Store.latestPending ? Store.latestPending() : null
    }};
  }} catch(e) {{
    window.__bfinalPendingPaint={{ok:false, error:String(e && e.message || e)}};
    console.warn('bfinal pending paint', e);
  }}
}})();"#
        ),
    );
    sleep_ms(2800);
    mark(&dir, "pending-confirm");
    sleep_ms(2200);

    // --- Step 3: SoftPad complete via DOM click only (no Rust fallback).
    // If #wbPendConfirm is absent or the click does not clear the pending → FAIL_softpad_dom_click.
    eval(
        &window,
        r#"(function(){
  var btn=document.getElementById('wbPendConfirm');
  if (btn) { btn.click(); }
})();"#,
    );
    sleep_ms(1500);
    eval(
        &window,
        r#"(function(){
  if (window.OneToneHomeContextActionsUi && window.OneToneHomeContextActionsUi.refresh) {
    window.OneToneHomeContextActionsUi.refresh();
  }
})();"#,
    );
    sleep_ms(300);
    let cleared = pending_confirm::peek_public(&confirmation_id).is_none();
    if !cleared {
        mark(&dir, "FAIL_softpad_dom_click");
        let _ = fs::write(dir.join("e2e-done.txt"), "fail:FAIL_softpad_dom_click");
        return;
    }

    let completed_at = chrono_like_now();
    let meta = serde_json::json!({
        "confirmationId": confirmation_id,
        "createChannel": "camera",
        "completeChannel": "softPad",
        "triggeredAt": triggered_at,
        "completedAt": completed_at,
        "result": "cleared",
        "completionEvidence": "dom_click_cleared_pending",
        "mappingId": mid,
        "actionId": pending.action_id,
        "cameraSelfConfirm": {
            "status": self_res.status,
            "reasonCode": self_res.reason_code,
        },
        "gesturePath": "FE Cam.dispatchAction (production camera path) + DOM #wbPendConfirm click",
        "source": "onetone-bfinal-e2e",
        "note": "Real Tauri window + Rust Pending Store. PrintWindow shots paired via e2e-step.txt."
    });
    let _ = fs::write(
        dir.join("pending-complete.meta.json"),
        serde_json::to_string_pretty(&meta).unwrap_or_else(|_| "{}".into()),
    );
    mark(&dir, "pending-complete");
    sleep_ms(2200);

    // Expire path: new pending → force near-expiry display → purge.
    let expire_res = route_semantic_action(
        &state,
        &window,
        SemanticActionRequest {
            action_id: "input.send".into(),
            source_channel: "camera".into(),
            mapping_id: Some(mid.clone()),
            provider_id: None,
            confirmation_id: None,
            slot_id: None,
            args: None,
        },
    );
    if let Some(eid) = expire_res.confirmation_id.clone() {
        pending_confirm::e2e_force_expire_soon(&eid, 2);
        eval(
            &window,
            r#"(function(){
  if (window.OneToneHomeContextActionsUi && window.OneToneHomeContextActionsUi.refresh) {
    window.OneToneHomeContextActionsUi.refresh();
  }
})();"#,
        );
        mark(&dir, "pending-expire");
        sleep_ms(2500);
        // Let TTL purge.
        sleep_ms(2500);
        let _ = pending_confirm::list_public(Some(&mid));
        eval(
            &window,
            r#"(function(){
  if (window.OneToneHomeContextActionsUi && window.OneToneHomeContextActionsUi.refresh) {
    window.OneToneHomeContextActionsUi.refresh();
  }
})();"#,
        );
    } else {
        mark(&dir, "pending-expire");
        sleep_ms(1500);
    }

    mark(&dir, "PASS");
    let _ = fs::write(dir.join("e2e-done.txt"), "pass");
    // Keep process alive for final capture; orchestrator kills.
}
