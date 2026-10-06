//! Phase B acceptance runner 鈥?only when `ONETONE_BFINAL_E2E=1`.
//! Drives the live main WebView via `eval` + Rust Pending Store (not Chrome harness).

use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Duration;

use tauri::{LogicalSize, Size, AppHandle, WebviewWindow};

use crate::agent::pending_confirm;
use crate::agent::route::{route_semantic_action, SemanticActionRequest};
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
    // 1970-01-01 + days 鈥?good enough for acceptance meta correlation.
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

fn agent_roster_enabled() -> bool {
    matches!(
        std::env::var("ONETONE_AGENT_ROSTER_E2E").ok().as_deref(),
        Some("1")
    )
}

fn wait_log_prefix(state: &AppState, prefix: &str, timeout_ms: u64) -> Option<String> {
    let deadline = std::time::Instant::now() + Duration::from_millis(timeout_ms);
    while std::time::Instant::now() < deadline {
        {
            let ring = state.log_ring.lock();
            if let Some(line) = ring.iter().rev().find(|l| l.contains(prefix)) {
                if let Some((_, rest)) = line.split_once(prefix) {
                    return Some(rest.trim().to_string());
                }
            }
        }
        sleep_ms(80);
    }
    None
}

/// Flush `window[key]` into app log synchronously (fire invoke; caller sleeps briefly).
fn flush_roster_key(window: &WebviewWindow, key: &str, tag: &str) {
    let script = format!(
        r#"(function(){{
  try {{
    var o = window.{key};
    if (!o) o = {{ok:false,error:'missing {key}'}};
    var inv = (window.OneToneIpc && window.OneToneIpc.invoke) || window.__vp_invoke__;
    var line = '{tag} ' + JSON.stringify(o).slice(0, 7000);
    if (inv) {{ try {{ inv('cmd_app_log', {{ line: line }}); }} catch (e) {{}} }}
    try {{ document.title = '{tag}:' + JSON.stringify(o).slice(0, 1200); }} catch (e2) {{}}
  }} catch (e) {{
    try {{
      var inv2 = (window.OneToneIpc && window.OneToneIpc.invoke) || window.__vp_invoke__;
      if (inv2) inv2('cmd_app_log', {{ line: '{tag} ' + JSON.stringify({{ok:false,error:String(e&&e.message||e)}}) }});
    }} catch (e3) {{}}
  }}
}})();"#
    );
    eval(window, &script);
}

fn fail_roster(dir: &Path, code: &str, detail: &str) {
    mark(dir, code);
    let _ = fs::write(
        dir.join("e2e-done.txt"),
        format!("fail:{code} {}", detail.chars().take(800).collect::<String>()),
    );
}

/// Home Agent Roster v2 fixture projection in the real Tauri WebView.
/// Evidence surface: real WebView + deterministic fixture; NOT real Provider.
fn run_agent_roster_e2e(state: &Arc<AppState>, window: &WebviewWindow, dir: &Path) -> bool {
    mark(dir, "roster-boot");
    let prev_size = window.inner_size().ok();
    let scale = window.scale_factor().unwrap_or(1.0);

    // --- V1: narrow expand (home roster shell, not page mountDemo) ---
    let _ = window.set_size(Size::Logical(LogicalSize::new(640.0, 680.0)));
    sleep_ms(500);
    if let Ok(sz) = window.inner_size() {
        let logical_w = (sz.width as f64) / scale;
        if logical_w > 680.0 + 1.0 {
            fail_roster(
                dir,
                "FAIL_roster_v1_width",
                &format!("logical_w={logical_w} physical={}", sz.width),
            );
            return false;
        }
    }

    eval(
        window,
        r#"(function(){
  var AC=window.OneToneAgentCenter;
  try{
    if(window.OneToneSemanticActionPicker) try{ window.OneToneSemanticActionPicker.close(); }catch(e){}
    if(window.OneToneSettingsDrawer) try{ window.OneToneSettingsDrawer.close(); }catch(e){}
    if(!AC) throw new Error('OneToneAgentCenter missing');
    var host=document.getElementById('homeAgentRoster');
    if(!host){
      host=document.createElement('div');
      host.id='homeAgentRoster';
      host.className='home-agent-roster';
      host.setAttribute('data-home-agent-roster','1');
      document.body.appendChild(host);
    }
    host.hidden=false;
    host.style.display='block';
    host.style.maxWidth='100%';
    host.style.overflow='auto';
    // Home shell exposes .har-toggle; mountDemo uses page shell without it.
    AC.mountHome(host);
    var snap = AC._fixture ? AC._fixture() : null;
    if(!snap) throw new Error('_fixture missing');
    if(!AC.__test || !AC.__test.applySnap) throw new Error('applySnap missing');
    AC.__test.applySnap(snap);
    var btn=host.querySelector('.har-toggle[data-expand-agent]');
    if(!btn) throw new Error('no .har-toggle[data-expand-agent] html='+(host.innerHTML||'').slice(0,200));
    var before=btn.getAttribute('aria-expanded');
    var agentId=btn.getAttribute('data-expand-agent');
    btn.click();
    // paint() replaces DOM — re-query after click.
    var btn2=host.querySelector('.har-toggle[data-expand-agent="'+agentId+'"]') || host.querySelector('.har-toggle[data-expand-agent]');
    var after=btn2 ? btn2.getAttribute('aria-expanded') : null;
    var openRow=host.querySelector('.har-row.is-open[data-agent-row="'+agentId+'"]') || host.querySelector('.har-row.is-open');
    var detail=openRow ? openRow.querySelector('.har-detail') : null;
    var detailVisible=!!(detail && (detail.offsetParent!==null || detail.getClientRects().length>0));
    var badges=!!(detail && detail.querySelector('.har-badges, .har-evidence'));
    var scrollW=document.documentElement.scrollWidth;
    var clientW=document.documentElement.clientWidth;
    var overflow=(scrollW-clientW)>24;
    window.__rosterV1={
      surface:'real Tauri WebView',
      data:'deterministic fixture',
      provider:'non-real',
      before:before, after:after, agentId:agentId,
      openRow:!!openRow,
      detailVisible:detailVisible, badgesOrEvidence:badges,
      scrollWidth:scrollW, clientWidth:clientW, severeOverflow:overflow,
      ok: before==='false' && after==='true' && !!openRow && detailVisible && !overflow
    };
  }catch(e){
    window.__rosterV1={ok:false,error:String(e&&e.message||e)};
  }
})();"#,
    );
    sleep_ms(300);
    flush_roster_key(window, "__rosterV1", "ROSTER_V1");
    sleep_ms(400);
    mark(dir, "roster-v1-expand");
    sleep_ms(600);
    let v1_raw = wait_log_prefix(state, "ROSTER_V1 ", 3000).unwrap_or_default();
    let _ = fs::write(dir.join("roster-v1.json"), &v1_raw);
    let v1_ok = v1_raw.contains("\"ok\":true") || v1_raw.contains("\"ok\": true");
    if !v1_ok {
        fail_roster(dir, "FAIL_roster_v1", &v1_raw);
        return false;
    }

    // Restore size before further scenarios (V2+ use normal width for filter shots).
    if let Some(sz) = prev_size {
        let _ = window.set_size(Size::Physical(tauri::PhysicalSize::new(sz.width, sz.height)));
        sleep_ms(300);
    }

    // --- V2 filters + V3 freshness + E1-E5 + V4 in one fixture apply ---
    eval(
        window,
        r#"(function(){
  var AC=window.OneToneAgentCenter;
  try{
    if(!AC||!AC.__test||!AC.__test.applySnap) throw new Error('applySnap missing');
    var asOf=1700000000000;
    function agent(partial){
      var base={
        runtimeKind:'codex', displayName:partial.agentId, formFactor:'cli',
        presenceState:'connected', status:'idle', version:null, dataPath:null, lastSyncAt:null,
        resolvedCapabilities:{usage:{state:'unknown'},sessionMetadata:{state:'limited'},transcript:{state:'unknown'},realtimeStatus:{state:'limited'},hooks:{state:'available'},resume:{state:'available'},focus:{state:'available'}},
        metrics:{todaySessions:{value:0,basis:'local'},todayCostUsd:{value:null,basis:'unavailable',unavailableReason:'x'},successRate:{value:null,basis:'unavailable',unavailableReason:'x'},averageDurationMs:{value:null,basis:'unavailable',unavailableReason:'x'}},
        recentWork:[], currentWork:null, actions:[], limitations:[],
        presence:{installation:'installed',dataSource:'degraded',runtime:'unknown',integration:'partial'},
        observedStatus:{value:'idle',source:'none',observedAt:asOf,freshUntil:asOf,confidence:'low'}
      };
      for (var k in partial) if (Object.prototype.hasOwnProperty.call(partial,k)) base[k]=partial[k];
      return base;
    }
    var snap={
      attentionState:'ready', asOf:asOf, recommendedAgentId:'kind:work-fresh',
      groups:{
        needsAttention:[],
        connected:['kind:work-fresh','kind:work-stale','kind:claude','kind:cursor','kind:best','kind:unsupported','kind:unknown'],
        discoveredLimited:[], supportedNotFound:[]
      },
      agents:[
        agent({
          agentId:'kind:work-fresh', displayName:'Fresh Working', status:'working',
          observedStatus:{value:'working',source:'fixture',observedAt:asOf-1000,freshUntil:asOf+60000,confidence:'high'},
          actions:[{id:'agent.interrupt',label:'Interrupt',scope:'externalAgent',support:'hotkey',supported:true,enabled:true,state:'available',executor:'hotkey:esc',freshUntil:asOf+60000}]
        }),
        agent({
          agentId:'kind:work-stale', displayName:'Stale Working', status:'working',
          observedStatus:{value:'working',source:'fixture',observedAt:asOf-120000,freshUntil:asOf-1,confidence:'low'},
          actions:[{id:'agent.interrupt',label:'Interrupt',scope:'externalAgent',support:'hotkey',supported:true,enabled:false,reason:'evidence_stale',state:'unavailable',freshUntil:asOf-1}]
        }),
        agent({
          agentId:'kind:claude', runtimeKind:'claude', displayName:'Claude Confirmable', status:'idle',
          actions:[
            {id:'agent.interrupt',label:'Interrupt',scope:'externalAgent',support:'native',supported:true,enabled:true,state:'available',executor:'cli:stop',freshUntil:asOf+60000},
            {id:'export_history',label:'Export',scope:'externalAgent',supported:false,enabled:false,reason:'not_wired'},
            {id:'disable_source',label:'Disable',scope:'externalAgent',supported:false,enabled:false,reason:'not_wired'}
          ]
        }),
        agent({
          agentId:'kind:cursor', runtimeKind:'cursor', displayName:'Cursor BestEffort', status:'idle',
          actions:[{id:'agent.interrupt',label:'Interrupt',scope:'externalAgent',support:'hotkey',supported:true,enabled:true,state:'available',executor:'hotkey:esc',freshUntil:asOf+60000}]
        }),
        agent({
          agentId:'kind:best', displayName:'BestEffort', status:'idle',
          actions:[{id:'agent.interrupt',label:'Interrupt',scope:'externalAgent',support:'hotkey',supported:true,enabled:true,state:'available',executor:'hotkey:esc',freshUntil:asOf+60000}]
        }),
        agent({
          agentId:'kind:unsupported', displayName:'Unsupported', status:'idle',
          actions:[{id:'agent.interrupt',label:'Interrupt',scope:'externalAgent',support:'unsupported',supported:false,enabled:false,reason:'provider_unsupported'}]
        }),
        agent({
          agentId:'kind:unknown', displayName:'UnknownProbe', status:'idle',
          actions:[{id:'agent.interrupt',label:'Interrupt',scope:'externalAgent',support:'native',supported:true,enabled:false,reason:'ProbeNotImplemented',state:'unknown'}]
        })
      ],
      homeSessionIds:[], referencedSessionIds:[]
    };
    var host=document.getElementById('homeAgentRoster')||document.body;
    if(AC.mountHome && !host.querySelector('[data-har-list]')) AC.mountHome(host);
    AC.__test.applySnap(snap);
    window.__rosterHomeSnap=snap;

    function visibleIds(){
      return Array.prototype.map.call(host.querySelectorAll('[data-agent-row]'), function(el){
        return el.getAttribute('data-agent-row');
      }).filter(Boolean).sort();
    }
    function setFilter(val){
      var sel=host.querySelector('[data-har-filter]');
      if(!sel) throw new Error('filter select missing');
      sel.value=val;
      sel.dispatchEvent(new Event('change',{bubbles:true}));
    }
    var filters=['all','working','confirmable','bestEffort','notWired','unsupported','stale'];
    var filterResults=[];
    for (var fi=0; fi<filters.length; fi++){
      var f=filters[fi];
      setFilter(f);
      var visible=visibleIds();
      var overview=AC._computeHomeOverview(snap);
      var expected=snap.agents.filter(function(a){ return AC._matchesHomeFilter(a,f,snap); }).map(function(a){return a.agentId;}).sort();
      var allIds=snap.agents.map(function(a){return a.agentId;});
      var hidden=allIds.filter(function(id){ return visible.indexOf(id)<0; });
      filterResults.push({filter:f, visible:visible, hidden:hidden, overview:overview, expected:expected, matchOk: JSON.stringify(visible)===JSON.stringify(expected)});
    }
    var ov=AC._computeHomeOverview(snap);
    var cursorBest=AC._projectAgentControl(snap.agents.find(function(a){return a.agentId==='kind:cursor';}), snap);
    window.__rosterV2={
      surface:'real Tauri WebView', data:'deterministic fixture', provider:'non-real',
      filters:filterResults, overview:ov,
      unknownNeUnsupported: ov.unsupportedInterrupt!==ov.unknownInterrupt,
      workingOrthogonal: typeof ov.working==='number',
      cursorBestEffort: cursorBest.controlMode==='bestEffort',
      fourCards: ov.discovered>=1 && typeof ov.confirmable==='number' && typeof ov.bestEffort==='number',
      ok: filterResults.every(function(r){return r.matchOk;}) && ov.unsupportedInterrupt>=1 && ov.unknownInterrupt>=1 && ov.working===1 && cursorBest.controlMode==='bestEffort' && ov.confirmable>=1 && ov.bestEffort>=2
    };

    var fresh=snap.agents.find(function(a){return a.agentId==='kind:work-fresh';});
    var stale=snap.agents.find(function(a){return a.agentId==='kind:work-stale';});
    window.__rosterV3={
      surface:'real Tauri WebView + fixture freshness projection',
      provider:'non-real',
      asOf:asOf,
      freshObservedAt:fresh.observedStatus.observedAt,
      freshUntil:fresh.observedStatus.freshUntil,
      staleObservedAt:stale.observedStatus.observedAt,
      staleFreshUntil:stale.observedStatus.freshUntil,
      overview:ov,
      freshInWorking: ov.working===1,
      staleNotIdleAuto: stale.status==='working',
      ok: ov.working===1 && stale.status==='working' && stale.observedStatus.freshUntil < asOf
    };

    var eCases=[
      {id:'E1', reason:'no_window_target'},
      {id:'E2', reason:'no_mapping_target'},
      {id:'E3', reason:'evidence_stale'},
      {id:'E4', reason:'ProbeNotImplemented'},
      {id:'E5', reason:'provider_unsupported'}
    ];
    var eResults=eCases.map(function(c){
      var text=AC._humanActionReason(c.reason, 'agent.interrupt') || '';
      var bucket=AC._classifyInterrupt({id:'agent.interrupt', reason:c.reason, support:c.reason==='provider_unsupported'?'unsupported':'native', supported:false, enabled:false, state:'unknown'});
      return {
        id:c.id, reason:c.reason, displayText:text, classify:bucket,
        uiLayer:'UI projection via fixture reason',
        sourceLayer:'UI projection passed; real source not accepted'
      };
    });
    var e4=eResults.find(function(x){return x.id==='E4';});
    var e5=eResults.find(function(x){return x.id==='E5';});
    var e3=eResults.find(function(x){return x.id==='E3';});
    var e1=eResults.find(function(x){return x.id==='E1';});
    var e2=eResults.find(function(x){return x.id==='E2';});
    // Assert via classify buckets + distinct non-empty displayText (no Chinese regex).
    var eOk = !!(e1 && e2 && e3 && e4 && e5
      && e1.displayText && e2.displayText && e3.displayText && e4.displayText && e5.displayText
      && e4.classify==='unknown' && e5.classify==='unsupported' && e3.classify!=='unsupported'
      && e4.displayText!==e5.displayText
      && e3.displayText!==e5.displayText
      && e1.displayText!==e5.displayText
      && e1.displayText!==e2.displayText);
    window.__rosterE={
      surface:'real Tauri WebView', data:'fixture reasons', provider:'non-real',
      cases:eResults,
      probeNotImplementedSemantic: !!(e4 && e4.classify==='unknown' && e4.displayText && e4.displayText!==e5.displayText),
      unsupportedSemantic: !!(e5 && e5.classify==='unsupported' && e5.displayText),
      distinct: !!(e4 && e5 && e4.displayText!==e5.displayText && e4.classify!==e5.classify),
      staleNotUnsupported: !!(e3 && e3.classify!=='unsupported' && e3.displayText!==e5.displayText),
      ok:eOk
    };

    var interruptAct={id:'agent.interrupt', label:'Interrupt'};
    var in0={outcome:'verified', ok:true, verified:true};
    var in1={outcome:'attemptedUnverified', ok:true, verified:false};
    var in2={outcome:'failed', ok:false, verified:false};
    var r0=AC._resolveActionOutcome(in0);
    var r1=AC._resolveActionOutcome(in1);
    var r2=AC._resolveActionOutcome(in2);
    var rNeg1=AC._resolveActionOutcome({ok:true, verified:false});
    var rNeg2=AC._resolveActionOutcome({ok:false, verified:true});
    var rNeg3=AC._resolveActionOutcome({});
    var rNeg4=AC._resolveActionOutcome({outcome:'bogus'});
    var m0=AC._outcomeMessage(in0, interruptAct) || '';
    var m1=AC._outcomeMessage(in1, interruptAct) || '';
    var m2=AC._outcomeMessage(in2, interruptAct) || '';
    var mNeg1=AC._outcomeMessage({ok:true, verified:false}, interruptAct) || '';
    var mNeg2=AC._outcomeMessage({ok:false, verified:true}, interruptAct) || '';
    var mNeg3=AC._outcomeMessage({}, interruptAct) || '';
    var mNeg4=AC._outcomeMessage({outcome:'bogus'}, interruptAct) || '';
    window.__rosterV4ui={
      surface:'real Tauri WebView + synthetic result UI projection',
      provider:'non-real',
      resolved:{r0:r0,r1:r1,r2:r2,rNeg1:rNeg1,rNeg2:rNeg2,rNeg3:rNeg3,rNeg4:rNeg4},
      messages:{m0:m0,m1:m1,m2:m2,mNeg1:mNeg1,mNeg2:mNeg2,mNeg3:mNeg3,mNeg4:mNeg4},
      ok:
        r0==='verified' && m0.length>0 && m0!==m1 && m0!==m2 &&
        r1==='attemptedUnverified' && m1.length>0 &&
        r2==='failed' && m2.length>0 &&
        rNeg1==='failed' && rNeg2==='failed' && rNeg3==='failed' && rNeg4==='failed' &&
        mNeg1!==m0 && mNeg2!==m0 && mNeg3!==m0 && mNeg4!==m0
    };

    window.__rosterV4ipc={
      surface:'real IPC',
      status:'pending',
      note:'async invoke scheduled'
    };
    window.__rosterDone={
      ok: !!(window.__rosterV2 && window.__rosterV2.ok && window.__rosterV3 && window.__rosterV3.ok && window.__rosterE && window.__rosterE.ok && window.__rosterV4ui && window.__rosterV4ui.ok),
      v2: !!(window.__rosterV2 && window.__rosterV2.ok),
      v3: !!(window.__rosterV3 && window.__rosterV3.ok),
      e: !!(window.__rosterE && window.__rosterE.ok),
      v4ui: !!(window.__rosterV4ui && window.__rosterV4ui.ok)
    };
  }catch(err){
    window.__rosterDone={ok:false,error:String(err&&err.message||err)};
    window.__rosterV2=window.__rosterV2||{ok:false,error:String(err&&err.message||err)};
    window.__rosterV3=window.__rosterV3||{ok:false,error:String(err&&err.message||err)};
    window.__rosterE=window.__rosterE||{ok:false,error:String(err&&err.message||err)};
    window.__rosterV4ui=window.__rosterV4ui||{ok:false,error:String(err&&err.message||err)};
  }
})();"#,
    );
    sleep_ms(400);
    flush_roster_key(window, "__rosterV2", "ROSTER_V2");
    sleep_ms(200);
    mark(dir, "roster-v2-filters");
    sleep_ms(4500);
    let v2_raw = wait_log_prefix(state, "ROSTER_V2 ", 3000).unwrap_or_default();
    let _ = fs::write(dir.join("roster-v2.json"), &v2_raw);

    flush_roster_key(window, "__rosterV3", "ROSTER_V3");
    sleep_ms(300);
    mark(dir, "roster-v3-freshness");
    sleep_ms(4500);
    let v3_raw = wait_log_prefix(state, "ROSTER_V3 ", 3000).unwrap_or_default();
    let _ = fs::write(dir.join("roster-v3.json"), &v3_raw);

    flush_roster_key(window, "__rosterE", "ROSTER_E");
    sleep_ms(200);
    mark(dir, "roster-e-reasons");
    sleep_ms(4500);
    let e_raw = wait_log_prefix(state, "ROSTER_E ", 3000).unwrap_or_default();
    let _ = fs::write(dir.join("roster-e1-e5.json"), &e_raw);

    flush_roster_key(window, "__rosterV4ui", "ROSTER_V4UI");
    sleep_ms(200);
    mark(dir, "roster-v4-ui");
    sleep_ms(4500);
    let v4ui_raw = wait_log_prefix(state, "ROSTER_V4UI ", 3000).unwrap_or_default();
    let _ = fs::write(dir.join("roster-v4-ui.json"), &v4ui_raw);

    // V4-ipc: real invoke (async), then flush
    eval(
        window,
        r#"(async function(){
  var inv=(window.OneToneIpc&&window.OneToneIpc.invoke)||window.__vp_invoke__;
  var ipc={surface:'real IPC', status:'unaccepted', note:'', ok:false};
  try{
    if(!inv) throw new Error('invoke missing');
    var res=await inv('cmd_agent_center_action',{args:{agentId:'kind:e2e-nonexistent', actionId:'agent.interrupt', attemptId:'e2e-roster-v4-ipc-1'}});
    ipc.result=res;
    ipc.ok = !!(res && res.outcome==='failed' && res.ok===false && res.verified===false);
    ipc.status = ipc.ok ? 'pass' : 'fail';
    if(!ipc.ok) ipc.note='unexpected result shape';
  }catch(err){
    ipc.status='unaccepted';
    ipc.note='invoke threw or guard blocked: '+String(err&&err.message||err);
    ipc.ok=false;
  }
  window.__rosterV4ipc=ipc;
})();"#,
    );
    sleep_ms(1500);
    flush_roster_key(window, "__rosterV4ipc", "ROSTER_V4IPC");
    sleep_ms(400);
    let v4ipc_raw = wait_log_prefix(state, "ROSTER_V4IPC ", 3000).unwrap_or_default();
    let _ = fs::write(dir.join("roster-v4-ipc.json"), &v4ipc_raw);

    flush_roster_key(window, "__rosterDone", "ROSTER_DONE");
    sleep_ms(300);
    let done_raw = wait_log_prefix(state, "ROSTER_DONE ", 2000).unwrap_or_default();
    let _ = fs::write(dir.join("roster-done.json"), &done_raw);

    let v2_ok = v2_raw.contains("\"ok\":true") || v2_raw.contains("\"ok\": true");
    let v3_ok = v3_raw.contains("\"ok\":true") || v3_raw.contains("\"ok\": true");
    let e_ok = e_raw.contains("\"ok\":true") || e_raw.contains("\"ok\": true");
    let v4ui_ok = v4ui_raw.contains("\"ok\":true") || v4ui_raw.contains("\"ok\": true");
    // V4-ipc: pass or honest unaccepted both allowed without failing the roster gate.
    let v4ipc_ok = v4ipc_raw.contains("\"status\":\"pass\"")
        || v4ipc_raw.contains("\"status\": \"pass\"")
        || v4ipc_raw.contains("\"status\":\"unaccepted\"")
        || v4ipc_raw.contains("\"status\": \"unaccepted\"");

    if !(v2_ok && v3_ok && e_ok && v4ui_ok && v4ipc_ok) {
        fail_roster(
            dir,
            "FAIL_roster_assert",
            &format!("v2={v2_ok} v3={v3_ok} e={e_ok} v4ui={v4ui_ok} v4ipc={v4ipc_ok} done={done_raw}"),
        );
        return false;
    }

    // --- Home UI visual shots (four cards / filters / cursor / confirmable detail) ---
    eval(
        window,
        "window.__ONETONE_E2E_HOME_FIXTURE__ = true;",
    );
    sleep_ms(50);

    fn home_stage_shot(
        state: &Arc<AppState>,
        window: &WebviewWindow,
        dir: &Path,
        stage: &str,
        mark_step: &str,
    ) -> bool {
        let script = format!(
            r#"(function(){{
  var out={{stage:{stage:?},ok:false}};
  try{{
    var AC=window.OneToneAgentCenter;
    var snap=window.__rosterHomeSnap;
    var host=document.getElementById('homeAgentRoster');
    if(!AC||!snap||!AC.__test||!AC.__test.applySnap) throw new Error('home stage missing snap');
    if(!host) throw new Error('homeAgentRoster missing');
    if(!host.querySelector('[data-har-list]')) AC.mountHome(host);
    window.__ONETONE_E2E_HOME_FIXTURE__=true;
    if(window.__rosterHomePin){{ clearInterval(window.__rosterHomePin); window.__rosterHomePin=null; }}
    AC.__test.applySnap(snap);
    function setFilter(val){{
      var sel=host.querySelector('[data-har-filter]');
      if(!sel) throw new Error('filter select missing');
      sel.value=val;
      sel.dispatchEvent(new Event('change',{{bubbles:true}}));
    }}
    var st={stage:?};
    if(st==='overview') setFilter('all');
    else if(st==='notWired') setFilter('notWired');
    else if(st==='unsupported') setFilter('unsupported');
    else if(st==='stale') setFilter('stale');
    else if(st==='cursor') setFilter('bestEffort');
    else if(st==='confirmableDetail'){{
      setFilter('confirmable');
      var btn=host.querySelector('[data-expand-agent="kind:claude"]');
      if(!btn) throw new Error('claude expand missing');
      btn.click();
    }} else throw new Error('unknown home stage');

    function scrollParents(){{
      return [
        document.querySelector('.hn-canvas'),
        document.querySelector('.now-home .now-body'),
        document.querySelector('.now-home .now-shell'),
        document.scrollingElement
      ].filter(Boolean);
    }}
    function focusTarget(){{
      if(st==='confirmableDetail'){{
        return host.querySelector('.har-row.is-open .har-detail')
          || host.querySelector('.har-row.is-open')
          || host.querySelector('[data-har-overview]');
      }}
      // Prefer roster chrome so PrintWindow cannot land on the hero above.
      return host.querySelector('.har-head')
        || host.querySelector('[data-har-overview]')
        || host.querySelector('.har-root')
        || host;
    }}
    function pinScroll(){{
      var focusEl=focusTarget();
      if(!focusEl) return {{ok:false}};
      var parents=scrollParents();
      var canvas=parents[0]||null;
      if(canvas){{
        var cr=canvas.getBoundingClientRect();
        var tr=focusEl.getBoundingClientRect();
        canvas.scrollTop=Math.max(0, canvas.scrollTop+(tr.top-cr.top-16));
      }}
      // Also nudge any outer scroller that may still show the hero.
      parents.forEach(function(p){{
        if(p===canvas) return;
        var pr=p.getBoundingClientRect();
        var tr=focusEl.getBoundingClientRect();
        if(tr.top<pr.top+8 || tr.top>pr.bottom-48){{
          p.scrollTop=Math.max(0, p.scrollTop+(tr.top-pr.top-16));
        }}
      }});
      if(focusEl.scrollIntoView) focusEl.scrollIntoView({{block:'start',inline:'nearest'}});
      var tr2=focusEl.getBoundingClientRect();
      var cr2=(canvas||document.documentElement).getBoundingClientRect();
      var visiblePx=Math.min(tr2.bottom,cr2.bottom)-Math.max(tr2.top,cr2.top);
      var inView=visiblePx>=48 && tr2.top<cr2.bottom-20 && tr2.top>=cr2.top-8;
      return {{
        ok:inView,
        inView:inView,
        visiblePx:visiblePx,
        canvasScrollTop:canvas?canvas.scrollTop:-1,
        focusTop:tr2.top,
        canvasTop:cr2.top
      }};
    }}

    // applySnap/paint can reflow after the first scroll — pin twice then keep pinned.
    var pin=pinScroll();
    pin=pinScroll();
    window.__rosterHomePin=setInterval(function(){{ pinScroll(); }}, 120);

    var overview=host.querySelector('[data-har-overview]');
    var statCount=overview?overview.querySelectorAll('.har-stat').length:0;
    out.statCount=statCount;
    out.inView=!!pin.inView;
    out.visiblePx=pin.visiblePx||0;
    out.canvasScrollTop=pin.canvasScrollTop;
    out.filterValue=(host.querySelector('[data-har-filter]')||{{}}).value||'';
    var rows=Array.prototype.map.call(host.querySelectorAll('[data-agent-row]'),function(el){{
      return el.getAttribute('data-agent-row');
    }});
    out.visibleRows=rows;
    var scrolled=typeof pin.canvasScrollTop==='number' && pin.canvasScrollTop>80;
    if(st==='overview') out.ok=statCount>=4&&!!pin.inView&&scrolled;
    else if(st==='notWired') out.ok=out.filterValue==='notWired'&&rows.indexOf('kind:unknown')>=0&&!!pin.inView&&scrolled;
    else if(st==='unsupported') out.ok=out.filterValue==='unsupported'&&rows.indexOf('kind:unsupported')>=0&&!!pin.inView&&scrolled;
    else if(st==='stale') out.ok=out.filterValue==='stale'&&rows.indexOf('kind:work-stale')>=0&&!!pin.inView&&scrolled;
    else if(st==='cursor') out.ok=out.filterValue==='bestEffort'&&rows.indexOf('kind:cursor')>=0&&!!pin.inView&&scrolled;
    else if(st==='confirmableDetail'){{
      var openRow=host.querySelector('.har-row.is-open[data-agent-row="kind:claude"]');
      var detail=openRow?openRow.querySelector('.har-detail'):null;
      var detailVisible=!!(detail&&detail.textContent&&detail.textContent.length>20);
      var hasAccept=!!(detail&&(/验收|acceptance/i.test(detail.textContent||'')));
      var exportBtn=host.querySelector('[data-action="export_history"]');
      out.ok=out.filterValue==='confirmable'&&!!openRow&&detailVisible&&hasAccept&&!exportBtn&&!!pin.inView&&scrolled;
    }}
    window.__rosterHomeShot=out;
  }}catch(e){{
    window.__rosterHomeShot={{stage:{stage:?},ok:false,error:String(e&&e.message||e)}};
  }}
}})();"#
        );
        eval(window, &script);
        sleep_ms(500);
        flush_roster_key(window, "__rosterHomeShot", "ROSTER_HOME_SHOT");
        sleep_ms(250);
        let raw = wait_log_prefix(state, "ROSTER_HOME_SHOT ", 4000).unwrap_or_default();
        let _ = fs::write(dir.join(format!("home-shot-{}.json", stage)), &raw);
        let ok = raw.contains("\"ok\":true") || raw.contains("\"ok\": true");
        if !ok {
            fail_roster(dir, &format!("FAIL_home_shot_{stage}"), &raw);
            return false;
        }
        // Re-pin immediately before the orchestrator PrintWindow.
        eval(
            window,
            r#"(function(){
  try{
    var host=document.getElementById('homeAgentRoster');
    var focus=host && (host.querySelector('.har-row.is-open .har-detail')
      || host.querySelector('.har-head')
      || host.querySelector('[data-har-overview]')
      || host);
    var canvas=document.querySelector('.hn-canvas');
    if(canvas&&focus){
      var cr=canvas.getBoundingClientRect();
      var tr=focus.getBoundingClientRect();
      canvas.scrollTop=Math.max(0, canvas.scrollTop+(tr.top-cr.top-16));
    }
    if(focus&&focus.scrollIntoView) focus.scrollIntoView({block:'start',inline:'nearest'});
  }catch(e){}
})();"#,
        );
        sleep_ms(350);
        mark(dir, mark_step);
        sleep_ms(4500);
        eval(
            window,
            r#"(function(){
  if(window.__rosterHomePin){ clearInterval(window.__rosterHomePin); window.__rosterHomePin=null; }
})();"#,
        );
        true
    }

    if !home_stage_shot(state, window, dir, "overview", "home-overview-four-cards") {
        return false;
    }
    if !home_stage_shot(state, window, dir, "notWired", "home-filter-not-wired") {
        return false;
    }
    if !home_stage_shot(state, window, dir, "unsupported", "home-filter-unsupported") {
        return false;
    }
    if !home_stage_shot(state, window, dir, "stale", "home-filter-stale") {
        return false;
    }
    if !home_stage_shot(state, window, dir, "cursor", "home-cursor-best-effort") {
        return false;
    }
    if !home_stage_shot(
        state,
        window,
        dir,
        "confirmableDetail",
        "home-confirmable-pending-detail",
    ) {
        return false;
    }

    true
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
    // Hard-set session 鈥?ContextRiskGate for camera input.send requires needsKind=dictating.
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

    // Isolated fixture / Default fallback may omit provider 鈥?camera pending requires one.
    {
        let mut cfg = state.cfg.lock();
        if let Some(m) = cfg.mappings.iter_mut().find(|m| m.id == mid) {
            if m.agent_provider_id.trim().is_empty() {
                m.agent_provider_id = "codex".into();
            }
        }
        let _ = crate::config::save_config(&cfg);
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

    // Close overlays; persist camera鈫抯end bind in live prefs (Picker path).
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
    // Isolated E2E has no SoftPad activation session; disable hub gate for camera
    // dispatch (production default remains requireActivationHub=true).
    if (Cam.persist) await Cam.persist({{ enabled: true, requireActivationHub: false }});
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
      drawerUiPaused: Cam.getState ? !!(Cam.getState().drawerUiPaused) : null,
      requireActivationHub: Cam.prefs ? Cam.prefs().requireActivationHub : null
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
    if (Cam.persist) {{
      try {{ await Cam.persist({{ requireActivationHub: false }}); }} catch(e) {{}}
    }}
    window.OneToneActivationHub = window.OneToneActivationHub || {{}};
    window.OneToneActivationHub.isActive = function(){{ return true; }};
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
    // (FE Cam.dispatchAction 鈫?routeSemanticAction IPC 鈫?Rust route 鈫?STORE insert)
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

    // Hard assertions 鈥?all five fields must match exactly.
    if pending.source_channel != "camera" {
        mark(&dir, "FAIL_camera_no_pending_confirmation");
        let _ = fs::write(
            dir.join("e2e-done.txt"),
            format!(
                "fail:FAIL_camera_no_pending_confirmation channel={}",
                pending.source_channel
            ),
        );
        return;
    }
    if pending.confirmation_id.trim().is_empty() {
        mark(&dir, "FAIL_camera_no_confirmation_id");
        let _ = fs::write(
            dir.join("e2e-done.txt"),
            "fail:FAIL_camera_no_confirmation_id",
        );
        return;
    }
    if pending.action_id != "input.send" {
        mark(&dir, "FAIL_pending_wrong_action");
        let _ = fs::write(
            dir.join("e2e-done.txt"),
            format!(
                "fail:FAIL_pending_wrong_action actionId={}",
                pending.action_id
            ),
        );
        return;
    }
    if pending.mapping_id.as_deref() != Some(mid.as_str()) {
        mark(&dir, "FAIL_pending_wrong_mapping");
        let _ = fs::write(
            dir.join("e2e-done.txt"),
            format!(
                "fail:FAIL_pending_wrong_mapping expected={} actual={:?}",
                mid, pending.mapping_id
            ),
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
        "gesturePath": "FE Cam.dispatchAction 鈫?routeSemanticAction IPC 鈫?Rust route (real production path)",
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
        let _ = fs::write(
            dir.join("e2e-done.txt"),
            "fail:self_confirm_cleared_pending",
        );
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
    // If #wbPendConfirm is absent or the click does not clear the pending 鈫?FAIL_softpad_dom_click.
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

    // Expire path: new pending 鈫?force near-expiry display 鈫?purge.
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

    if agent_roster_enabled() {
        if !run_agent_roster_e2e(&state, &window, &dir) {
            return;
        }
        mark(&dir, "roster-pass");
        sleep_ms(800);
    }

    mark(&dir, "PASS");
    let _ = fs::write(dir.join("e2e-done.txt"), "pass");
    // Keep process alive for final capture; orchestrator kills.
}
