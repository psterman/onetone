(function(global){
  'use strict';

  var $=function(id){ return global.OneToneDom.$(id); };
  var t=function(key){ return global.OneToneI18n.t(key); };
  var bound=false;
  var HERO_MODE_KEY='onetone.wbHeroMode';
  var heroMode='voice';
  var MIC_SVG='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>';
  var KEY_SVG='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M8 14h8"/></svg>';

  function readHeroMode(){
    try{
      var raw=String(sessionStorage.getItem(HERO_MODE_KEY)||'').toLowerCase();
      if(raw==='keys'||raw==='voice') return raw;
    }catch(_){}
    return 'voice';
  }

  function writeHeroMode(mode){
    heroMode=mode==='keys'?'keys':'voice';
    try{ sessionStorage.setItem(HERO_MODE_KEY,heroMode); }catch(_){}
  }

  function openSettings(opts){
    if(global.OneToneSettingsDrawer) global.OneToneSettingsDrawer.open(opts||{panel:'basic'});
  }

  function triggerModeLabel(m){
    var raw=m&&m.triggerMode!=null?String(m.triggerMode||'').toLowerCase():'tap';
    if(raw==='double') return t('homeWbModeDouble');
    if(raw==='hold'||raw==='longpress'||raw==='perpress') return t('homeWbModeHold');
    return t('homeWbModeTap');
  }

  function buildVoiceModeLabel(vm){
    var summary=vm.summary||{};
    if(summary.engine==='off') return t('homeWbVoiceOff');
    if(summary.statusMode==='error'||vm.engineStatus===t('homeV9EngineOffline')){
      return t('homeWbVoiceOffline');
    }
    if(summary.engine==='sapi'){
      var sapiSuffix=summary.statusMode==='listening'?t('homeWbVoiceWaitingWake'):t('homeWbVoiceReady');
      return t('homeWbVoiceSystem')+' · '+sapiSuffix;
    }
    var base=vm.engineLine||'';
    var split=base.indexOf(' · ');
    if(split>=0) base=base.slice(0,split);
    var suffix=summary.statusMode==='listening'?t('homeWbVoiceWaitingWake'):t('homeWbVoiceReady');
    return base+' · '+suffix;
  }

  function isMicUnavailable(vm){
    if(!vm.summary||vm.summary.loading||vm.summary.engine==='off') return false;
    var micApi=global.OneToneAppMic;
    if(micApi&&typeof micApi.listLoaded==='function'&&!micApi.listLoaded()) return false;
    var devices=micApi&&micApi.devices?micApi.devices():[];
    if(!devices||!devices.length) return true;
    var label=vm.micLabel||'';
    return label===t('homeLiveMicUnknown')||label===t('homeLiveMicUnset');
  }

  function buildAlertInput(vm){
    var summary=Object.assign({},vm.summary||{});
    summary.micUnavailable=isMicUnavailable(vm);
    summary.engineOffline=summary.statusMode==='error'&&summary.engine!=='off';
    return {
      paused:!!(vm.runtime&&vm.runtime.paused),
      summary:summary,
      compatSnapshot:vm.compatSnapshot||{},
      triggerMode:vm.m&&vm.m.triggerMode?vm.m.triggerMode:'tap',
      recentEvents:(vm.runtime&&vm.runtime.events)||[],
      homeStatusMode:vm.hs&&vm.hs.statusMode?vm.hs.statusMode:'idle',
      nowMs:Date.now()
    };
  }

  function alertActionLabel(action){
    if(!action) return '';
    if(action.type==='resumeListening') return t('homeWbAlertActionResume');
    if(action.type==='openSettings'){
      if(action.panel==='voiceWake') return t('homeWbAlertActionVoice');
      if(action.panel==='keys') return t('homeWbAlertActionKeys');
      if(action.panel==='debug') return t('homeWbAlertActionRuntime');
    }
    return '';
  }

  function handleAlertAction(action){
    if(!action) return;
    if(action.type==='resumeListening'){
      if(global.OneToneIpc) global.OneToneIpc.invoke('cmd_resume',{}).catch(function(){});
      return;
    }
    if(action.type==='openSettings'){
      var opts={panel:action.panel||'basic'};
      if(action.focus) opts.focus=action.focus;
      if(action.debugMode) opts.debugMode=action.debugMode;
      openSettings(opts);
    }
  }

  function alertSeverity(kind){
    if(kind==='recognition_error'||kind==='send_failed'||kind==='mic_unavailable') return 'is-error';
    return 'is-warn';
  }

  function renderAlerts(vm){
    var host=$('wbHomeAlerts');
    if(!host) return;
    var alertsApi=global.OneToneHomeWorkbenchAlerts;
    var alert=alertsApi&&alertsApi.pickPrimaryAlert?alertsApi.pickPrimaryAlert(buildAlertInput(vm)):null;
    if(!alert){
      host.hidden=true;
      host.innerHTML='';
      host._lastAlertAction=null;
      return;
    }
    host.hidden=false;
    host.className='wb-home-alert '+alertSeverity(alert.kind);
    host._lastAlertAction=alert.action||null;
    host.innerHTML=
      '<span class="wb-home-alert-text">'+esc(t(alert.textKey))+'</span>'
      +'<button type="button" class="wb-home-alert-action" data-wb-alert-action="1">'
      +esc(alertActionLabel(alert.action))+'</button>';
  }

  function renderFinishSummary(vm){
    var host=$('wbFinishSummary');
    if(!host) return;
    var parts=[t('homeWbFinishTitle'),vm.finishText||t('homeLiveUnset')];
    if(vm.cancelDelaySec){
      parts.push(t('homeV9TraySilence').replace('{sec}',vm.cancelDelaySec));
    }
    if(vm.endPhraseLine&&vm.endPhraseLine!=='—'){
      parts.push(t('homeWbFinishEndPhrase').replace('{phrases}',vm.endPhraseLine));
    }
    host.textContent=parts.join(' · ');
  }

  function compatStatusLabel(status){
    var map={
      unknown:'homeWbDiagCompatUnknown',
      testing:'homeWbDiagCompatTesting',
      ready:'homeWbDiagCompatReady',
      partial:'homeWbDiagCompatPartial',
      unsupported:'homeWbDiagCompatUnsupported'
    };
    return t(map[String(status||'unknown')]||map.unknown);
  }

  function diagBoolLabel(on){
    return on?'✓':'—';
  }

  function renderTriggerDiagBlocks(vm){
    vm=vm||enrichViewModel(global.OneToneHomeV9.buildViewModel());
    var compat=vm.compatSnapshot||{};
    var perf=vm.perf||{};
    setText($('debugDiagCompatStatus'),compatStatusLabel(compat.status));
    setText($('debugDiagDevice'),compat.deviceLabel||compat.deviceId||'—');
    setText($('debugDiagKeydown'),diagBoolLabel(compat.sawKeydown));
    setText($('debugDiagKeyup'),diagBoolLabel(compat.sawKeyup));
    setText($('debugDiagHold'),diagBoolLabel(compat.supportsHold));
    setText($('debugDiagRelease'),diagBoolLabel(compat.supportsReleaseSend));
    setText($('debugDiagRecommended'),triggerModeLabel({triggerMode:compat.recommendedMode||'tap'}));
    var probeBtn=$('debugDiagProbeBtn');
    if(probeBtn) probeBtn.disabled=compat.status==='testing';
    setText($('debugDiagKeyLatency'),perf.keyLatency||'—');
    setText($('debugDiagRecogStatus'),perf.recogStatus||'—');
    setText($('debugDiagWakeLatency'),perf.wakeLatency||'—');
    setText($('debugDiagSendLatency'),perf.sendLatency||'—');
  }

  function renderNavSidebar(vm){
    var main=$('wbSidebarMain');
    var sub=$('wbSidebarSub');
    var dot=$('wbSidebarDot');
    if(main) main.textContent=vm.runtime.paused?t('homeWbServicePaused'):t('homeWbServiceRunning');
    if(sub){
      var listening=vm.runtime.paused?t('homeWbServicePaused'):t('homeWbSidebarListening');
      sub.textContent=listening;
    }
    if(dot) dot.classList.toggle('is-warn',!!vm.runtime.paused);
  }

  function renderOverview(vm){
    var host=$('wbStatusOverview');
    if(!host) return;
    var flow=global.OneToneInputFlowSummary?global.OneToneInputFlowSummary.compute():null;
    if(flow){
      host.innerHTML=
        '<span class="wb-status-item wb-status-item--primary"><span class="wb-status-dot '+(flow.ready?'is-ok':'is-warn')+'"></span><span>'+esc(t('homeWbStatusWork'))+'</span> <strong>'+esc(flow.naturalLine)+'</strong></span>'
        +'<span class="wb-status-item"><span class="wb-status-dot '+(flow.mic&&flow.mic.ok?'is-ok':'is-warn')+'"></span><span>'+t('homeWbStatusMic')+'</span> <strong>'+esc((flow.mic&&flow.mic.state)||'—')+'</strong></span>'
        +'<span class="wb-status-item"><span class="wb-status-dot '+(flow.conflictCount?'is-warn':'is-ok')+'"></span><span>'+t('homeWbStatusIntercept')+'</span> <strong>'+esc(flow.conflictCount?flow.conflictCount+' '+t('homeWbStatusConflict'):t('homeWbStatusInterceptOk'))+'</strong></span>';
      return;
    }
    host.innerHTML=
      '<span class="wb-status-item"><span class="wb-status-dot is-ok"></span><span>'+t('homeWbStatusEngine')+'</span> <strong>'+esc(buildVoiceModeLabel(vm))+'</strong></span>'
      +'<span class="wb-status-item"><span class="wb-status-dot is-ok"></span><span>'+t('homeWbStatusMic')+'</span> <strong>'+esc(vm.micLabel||'—')+'</strong></span>';
  }

  function triggerStatusLine(vm){
    if(vm.runtime&&vm.runtime.paused) return t('homeWbTriggerPaused');
    if(vm.vpState==='DICTATING'||vm.summary.dictating) return t('homeWbTriggerLive');
    if(vm.hs&&vm.hs.statusMode==='error') return t('homeWbTriggerError');
    return t('homeWbTriggerReady');
  }

  function triggerCardTitle(vm){
    return vm.triggerKey||t('homeLiveUnset');
  }

  function triggerMetaLine(vm){
    if(global.OneToneInputFlowSummary){
      return global.OneToneInputFlowSummary.compute().naturalLine;
    }
    var mode=triggerModeLabel(vm.m);
    var target=vm.targetLabel||'—';
    return mode+' · '+t('homeWbStepSendTo').replace('{app}',target);
  }

  function renderTriggerHero(vm){
    renderHero(vm);
  }

  function pillHtml(label,extraClass,dotClass){
    return '<span class="wb-hero-pill'+(extraClass?' '+extraClass:'')+'" role="listitem">'
      +(dotClass?'<span class="wb-hero-pill-dot '+dotClass+'" aria-hidden="true"></span>':'')
      +'<span>'+esc(label)+'</span></span>';
  }

  function renderHeroPills(vm,stats){
    var host=$('wbHeroPills');
    if(!host) return;
    var paused=!!(vm.runtime&&vm.runtime.paused);
    var dictating=vm.vpState==='DICTATING'||!!(vm.summary&&vm.summary.dictating);
    var listening=!paused&&(dictating||(vm.summary&&vm.summary.statusMode==='listening'));
    var html='';
    if(paused) html+=pillHtml(t('homeWbLivePreviewPaused'),'is-warn','is-warn');
    else if(listening) html+=pillHtml(t('homeWbLivePreviewListening'),'is-live','is-live');
    else html+=pillHtml(t('homeWbLivePreviewStandby'),'','is-standby');

    var engineOn=vm.summary&&vm.summary.engine&&vm.summary.engine!=='off';
    if(engineOn){
      var engOk=vm.summary.statusMode!=='error'&&vm.engineStatus!==t('homeV9EngineOffline');
      html+=pillHtml(engOk?t('homeWbHeroEngineOnline'):t('homeWbVoiceOffline'),engOk?'is-ok':'is-warn',engOk?'is-ok':'is-warn');
      var engineLine=String(vm.engineLine||'').trim();
      if(engineLine){
        var split=engineLine.indexOf(' · ');
        html+=pillHtml(split>=0?engineLine.slice(0,split):engineLine,'','');
      }
    }else{
      html+=pillHtml(t('homeWbVoiceOff'),'is-muted','');
    }

    if(heroMode==='keys'){
      var trig=vm.triggerKey||'';
      if(trig&&trig!==t('homeLiveUnset')) html+=pillHtml(trig,'is-key','');
    }else if(vm.micLabel&&vm.micLabel!==t('homeLiveMicUnset')&&vm.micLabel!==t('homeLiveMicUnknown')){
      html+=pillHtml(vm.micLabel,'is-mic','');
    }

    if(stats&&stats.latency&&stats.latency!=='—') html+=pillHtml(stats.latency,'is-latency','');
    host.innerHTML=html;
  }

  function renderHeroStats(stats){
    var host=$('wbHeroStats');
    if(!host) return;
    var cells=[
      {lbl:t('homeWbHeroStatUptime'),val:stats.uptime},
      {lbl:t('homeWbHeroStatOps'),val:stats.opCount},
      {lbl:t('homeWbHeroStatApp'),val:stats.topTarget},
      {lbl:t('homeWbHeroStatShortcut'),val:stats.topShortcut}
    ];
    host.innerHTML=cells.map(function(c){
      return '<div class="wb-hero-stat">'
        +'<span class="wb-hero-stat-lbl">'+esc(c.lbl)+'</span>'
        +'<strong class="wb-hero-stat-val">'+esc(c.val||'—')+'</strong>'
        +'</div>';
    }).join('');
  }

  function renderHero(vm){
    var mode=heroMode==='keys'?'keys':'voice';
    var hero=$('wbHero');
    var orb=$('wbHeroOrb');
    var icon=$('wbHeroOrbIcon');
    var hint=$('wbHeroOrbHint');
    var modeVoice=$('wbHeroModeVoice');
    var modeKeys=$('wbHeroModeKeys');
    var live=vm.vpState==='DICTATING'||!!(vm.summary&&vm.summary.dictating);
    var paused=!!(vm.runtime&&vm.runtime.paused);
    if(hero){
      hero.classList.toggle('is-mode-voice',mode==='voice');
      hero.classList.toggle('is-mode-keys',mode==='keys');
      hero.classList.toggle('is-live',live);
      hero.classList.toggle('is-paused',paused);
    }
    if(orb){
      orb.setAttribute('data-mode',mode);
      orb.classList.toggle('is-live',live);
      orb.classList.toggle('is-paused',paused);
      orb.setAttribute('aria-label',mode==='keys'?t('homeWbHeroHintKeys'):t('homeWbHeroHintVoice'));
    }
    if(icon){
      var next=mode==='keys'?KEY_SVG:MIC_SVG;
      if(icon.getAttribute('data-icon')!==mode){
        icon.classList.add('is-switching');
        icon.setAttribute('data-icon',mode);
        icon.innerHTML=next;
        requestAnimationFrame(function(){ icon.classList.remove('is-switching'); });
      }
    }
    if(hint){
      hint.textContent=live
        ?t('homeWbTriggerHeroLive')
        :(mode==='keys'?t('homeWbHeroHintKeys'):t('homeWbHeroHintVoice'));
    }
    if(modeVoice){
      modeVoice.classList.toggle('is-active',mode==='voice');
      modeVoice.setAttribute('aria-selected',mode==='voice'?'true':'false');
    }
    if(modeKeys){
      modeKeys.classList.toggle('is-active',mode==='keys');
      modeKeys.setAttribute('aria-selected',mode==='keys'?'true':'false');
    }
    var stats=global.OneToneHomeWorkbenchStats
      ?global.OneToneHomeWorkbenchStats.buildHeroStats(vm)
      :{uptime:'—',opCount:'—',topTarget:'—',topShortcut:'—',latency:'—'};
    renderHeroPills(vm,stats);
    renderHeroStats(stats);
  }

  function setHeroMode(mode,opts){
    opts=opts||{};
    var next=mode==='keys'?'keys':'voice';
    if(next===heroMode&&!opts.force) return;
    writeHeroMode(next);
    if(opts.render!==false) render();
  }

  function dictatingHint(vm){
    var live=vm.vpState==='DICTATING'||!!vm.summary.dictating;
    if(live) return t('homeWbTriggerHeroLive');
    return heroMode==='keys'?t('homeWbHeroHintKeys'):t('homeWbHeroHintVoice');
  }

  function renderCommandCard(vm){
    var card=$('wbTriggerCard');
    if(card){
      var live=vm.vpState==='DICTATING'||!!vm.summary.dictating;
      card.classList.toggle('is-live',live);
      card.classList.toggle('is-paused',!!(vm.runtime&&vm.runtime.paused));
      card.classList.toggle('is-error',!!(vm.hs&&vm.hs.statusMode==='error'));
      card.classList.toggle('is-mode-keys',heroMode==='keys');
      card.classList.toggle('is-mode-voice',heroMode==='voice');
    }
    setText($('wbTriggerStatus'),t('homeWbTriggerLabel')+' · '+triggerStatusLine(vm));
    renderHero(vm);
    renderLiveText(vm);
    var dictating=vm.vpState==='DICTATING'||!!vm.summary.dictating;
    var actions=$('wbTriggerActions');
    if(actions) actions.classList.toggle('is-dictating',dictating);
    var endBtn=$('wbBtnEnd');
    var cancelBtn=$('wbBtnCancel');
    if(endBtn){
      endBtn.disabled=!dictating;
      endBtn.hidden=!dictating;
      endBtn.textContent=dictating?t('homeWbBtnEndSend'):t('homeV9BtnEnd');
      endBtn.classList.toggle('wb-trigger-btn-filled',dictating);
      endBtn.classList.toggle('wb-trigger-btn-tonal',!dictating);
    }
    if(cancelBtn){
      cancelBtn.hidden=!dictating;
      cancelBtn.disabled=!dictating;
      if(dictating) cancelBtn.textContent=t('homeWbBtnCancel');
    }
  }

  function esc(s){
    return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  function setText(el,text){
    if(el) el.textContent=text||'';
  }

  function renderLiveText(vm){
    var liveEl=$('wbLiveText');
    if(!liveEl) return;
    var card=$('wbLivePreview');
    var status=$('wbLivePreviewStatus');
    var listenBtn=$('wbBtnListenToggle');
    var listenLbl=$('wbBtnListenToggleLabel');
    var paused=!!(vm.runtime&&vm.runtime.paused);
    var dictating=vm.vpState==='DICTATING'||!!(vm.summary&&vm.summary.dictating);
    var listening=!paused&&(dictating||(vm.summary&&vm.summary.statusMode==='listening')||vm.vpState==='LISTENING');
    if(card){
      card.classList.toggle('is-live',!!listening);
      card.classList.toggle('is-paused',paused);
    }
    if(status){
      status.classList.toggle('is-live',!!listening);
      status.classList.toggle('is-standby',!listening&&!paused);
      status.classList.toggle('is-paused',paused);
      status.textContent=paused
        ?t('homeWbLivePreviewPaused')
        :(listening?t('homeWbLivePreviewListening'):t('homeWbLivePreviewStandby'));
    }
    if(listenBtn){
      listenBtn.classList.toggle('is-paused',paused);
      listenBtn.setAttribute('aria-pressed',paused?'true':'false');
      listenBtn.title=paused?t('homeWbListenResumeTip'):t('homeWbListenPauseTip');
    }
    if(listenLbl) listenLbl.textContent=paused?t('homeWbListenResume'):t('homeWbListenPause');
    if(vm.loading){
      liveEl.classList.add('is-placeholder');
      liveEl.innerHTML='<div class="vp-empty">'+esc(t('homeLiveLoading'))+'</div>';
      return;
    }
    if(vm.live.placeholder){
      var hintKey=vm.live.hintKey||'homeWbLiveIdleHint';
      liveEl.classList.add('is-placeholder');
      liveEl.innerHTML='<div class="vp-empty">'+esc(t(hintKey))+'</div>';
      return;
    }
    liveEl.classList.remove('is-placeholder');
    if(global.vp9&&global.vp9.setText){
      global.vp9.setText('#wbLiveText',vm.live.finalized,vm.live.pending);
    }else{
      liveEl.textContent=(vm.live.finalized||'')+(vm.live.pending||'');
    }
  }

  function renderQuickActions(){
    var shell=$('homeWorkbench');
    if(shell){
      shell.querySelectorAll('[data-i18n]').forEach(function(el){
        var key=el.getAttribute('data-i18n');
        if(key) el.textContent=t(key);
      });
    }
    var habitNew=$('wbHabitNew');
    if(habitNew) habitNew.textContent=t('homeWbQuickNewHabit');
  }

  function selectWorkbenchMapping(id){
    if(!id||!global.OneToneHomeScheme) return;
    global.OneToneHomeScheme.selectMapping(id);
    render();
  }

  function bindPanelActions(){
    var center=$('wbCenter');
    if(!center||center._wbPanelsBound) return;
    center._wbPanelsBound=true;
    center.addEventListener('click',function(e){
      var habit=e.target.closest&&e.target.closest('[data-wb-habit-id]');
      if(habit){
        selectWorkbenchMapping(habit.getAttribute('data-wb-habit-id')||'');
        return;
      }
      var scenario=e.target.closest&&e.target.closest('[data-wb-scenario-id]');
      if(scenario){
        selectWorkbenchMapping(scenario.getAttribute('data-wb-scenario-id')||'');
        return;
      }
      var micBtn=e.target.closest&&e.target.closest('#wbVoiceChangeMic');
      if(micBtn){
        openSettings({panel:'voiceWake',focus:'mic'});
      }
    });
  }

  var NAV_PANEL_MAP={
    habits:'schemes',
    keys:'triggers',
    voiceWake:'voice',
    models:'voice',
    sounds:'sounds',
    basic:'general',
    scenes:'schemes'
  };

  function syncNavActiveState(panel,opts){
    var nav=$('wbLeftNav');
    if(!nav) return;
    opts=opts||{};
    var ui=global.OneToneState&&global.OneToneState.ui;
    var open=!!(ui&&ui.drawerOpen);
    var activeNav='home';
    if(open){
      if(panel==='debug'){
        activeNav='runtime';
      }else if(panel==='general'){
        activeNav='maintenance';
      }else{
        activeNav=NAV_PANEL_MAP[panel||'']||'general';
      }
    }
    nav.querySelectorAll('[data-wb-nav]').forEach(function(btn){
      btn.classList.toggle('is-active',btn.getAttribute('data-wb-nav')===activeNav);
    });
  }

  function eventTs(evt){
    return Number(evt&&(evt.tsMs||evt.ts_ms))||0;
  }

  function formatMs(ms){
    if(!(ms>0)) return '—';
    if(ms<1000) return Math.round(ms)+' ms';
    return (ms/1000).toFixed(1)+' s';
  }

  function buildPerf(vm){
    var events=(global.OneToneState.runtime.events||[]).slice();
    var keyLatency='—';
    var sendLatency='—';
    var recogStatus=t('homeWbDiagRecogUnknown');
    var lastSessionStart=0;
    var lastSessionEnd=0;
    var lastWake=0;
    var lastBindingCapture=0;

    for(var i=events.length-1;i>=0;i--){
      var evt=events[i];
      if(!evt) continue;
      var kind=String(evt.kind||'');
      var ts=eventTs(evt);
      var payload=evt.payload&&typeof evt.payload==='object'?evt.payload:null;
      var source=String(payload&&payload.source||'').toLowerCase();

      if(!lastSessionEnd&&kind==='session_ended') lastSessionEnd=ts;
      if(!lastSessionStart&&kind==='session_started') lastSessionStart=ts;
      if(!lastWake&&kind==='voice_wake_triggered') lastWake=ts;
      if(!lastBindingCapture&&kind==='input_captured'&&source==='binding') lastBindingCapture=ts;

      if(lastSessionStart&&lastSessionEnd&&lastWake&&lastBindingCapture) break;
    }

    if(lastBindingCapture&&lastSessionStart&&lastSessionStart>=lastBindingCapture){
      keyLatency=formatMs(lastSessionStart-lastBindingCapture);
    } else if(lastWake&&lastSessionStart&&lastSessionStart>=lastWake){
      keyLatency=formatMs(lastSessionStart-lastWake);
    }

    if(lastSessionEnd){
      for(var j=events.length-1;j>=0;j--){
        var after=events[j];
        if(!after) continue;
        var afterTs=eventTs(after);
        if(afterTs<=lastSessionEnd) continue;
        var afterKind=String(after.kind||'');
        if(afterKind==='input_captured'||afterKind==='voice_send_failed'){
          sendLatency=formatMs(afterTs-lastSessionEnd);
          break;
        }
      }
    }

    if(vm.summary.engine!=='off'){
      if(vm.summary.loading) recogStatus=t('homeWbDiagRecogUnknown');
      else if(vm.summary.statusMode==='error'||vm.engineStatus===t('homeV9EngineOffline')) recogStatus=t('homeWbDiagRecogError');
      else recogStatus=t('homeWbDiagRecogOk');
    }

    return {
      keyLatency:keyLatency,
      recogStatus:recogStatus,
      wakeLatency:vm.latency||'—',
      sendLatency:sendLatency
    };
  }

  function enrichViewModel(vm){
    var runtime=global.OneToneState.runtime;
    vm.runtime=runtime;
    vm.compatSnapshot=global.OneToneHomeWorkbenchCompat
      ?global.OneToneHomeWorkbenchCompat.get(vm.m&&vm.m.id?vm.m.id:'')
      :{status:'unknown'};
    vm.perf=buildPerf(vm);
    return vm;
  }

  function render(){
    if(!global.OneToneHomeV9||!global.OneToneHomeV9.buildViewModel) return;
    if(global.OneToneHabitTriggerSetup&&global.OneToneHabitTriggerSetup.isOpen&&global.OneToneHabitTriggerSetup.isOpen()) return;
    var micApi=global.OneToneAppMic;
    if(micApi&&typeof micApi.listLoaded==='function'&&!micApi.listLoaded()&&typeof micApi.loadMicDevices==='function'){
      var bootHooks=global.__vp_bootstrap_hooks__||{};
      if(!bootHooks.uiBootstrapping||!bootHooks.uiBootstrapping()){
        micApi.loadMicDevices().catch(function(){});
      }
    }
    var vm=enrichViewModel(global.OneToneHomeV9.buildViewModel());
    if(global.vp9&&global.vp9.updateState) global.vp9.updateState(vm.vpState);
    renderNavSidebar(vm);
    renderOverview(vm);
    renderAlerts(vm);
    renderCommandCard(vm);
    renderFinishSummary(vm);
    renderQuickActions();
    if(global.OneToneHomeWorkbenchPanels){
      global.OneToneHomeWorkbenchPanels.renderAll(vm);
    }
    if(global.OneToneState&&global.OneToneState.ui){
      var ui=global.OneToneState.ui;
      if(ui.drawerOpen&&ui.settingsPanel==='debug'&&global.OneToneVoiceDiag&&global.OneToneVoiceDiag.getFocusMode()==='diagnostics'){
        renderTriggerDiagBlocks(vm);
      }
    }
  }

  function startCompatProbe(){
    var vm=global.OneToneHomeV9.buildViewModel();
    var mappingId=vm.m&&vm.m.id?String(vm.m.id):'';
    if(!mappingId||!global.OneToneIpc) return;
    if(global.OneToneHomeWorkbenchCompat) global.OneToneHomeWorkbenchCompat.markTesting(mappingId);
    render();
    global.OneToneIpc.invoke('cmd_start_trigger_compat_probe',{mappingId:mappingId}).catch(function(){
      if(global.OneToneApp&&global.OneToneApp.toast) global.OneToneApp.toast(t('homeWbDiagProbeFailed'));
      render();
    });
  }

  function bindNav(){
    var nav=$('wbLeftNav');
    if(!nav) return;
    nav.addEventListener('click',function(e){
      var btn=e.target.closest&&e.target.closest('[data-wb-nav]');
      if(!btn) return;
      var action=btn.getAttribute('data-wb-nav');
      if(action==='home'){
        if(global.OneToneSettingsDrawer&&global.OneToneSettingsDrawer.close) global.OneToneSettingsDrawer.close();
        syncNavActiveState('home');
        return;
      }
      if(action==='schemes'){ openSettings({panel:'habits'}); return; }
      if(action==='triggers'){ openSettings({panel:'keys'}); return; }
      if(action==='voice'){ openSettings({panel:'voiceWake'}); return; }
      if(action==='sounds'){ openSettings({panel:'sounds'}); return; }
      if(action==='general'){ openSettings({panel:'basic'}); return; }
      if(action==='maintenance'){ openSettings({panel:'general'}); return; }
      if(action==='runtime'){ openSettings({panel:'debug', debugMode:'overview'}); return; }
    });
  }

  function bindOnce(){
    if(bound) return;
    bound=true;
    heroMode=readHeroMode();
    bindNav();
    bindPanelActions();
    if(global.OneToneHomeWorkbenchPanels) global.OneToneHomeWorkbenchPanels.bindOnce();
    if(global.OneToneHomeWorkbenchCmdk) global.OneToneHomeWorkbenchCmdk.bindOnce();
    var searchInput=$('wbCommandSearchInput');
    if(searchInput){
      searchInput.addEventListener('keydown',function(e){
        if(e.key==='Enter'&&(!global.OneToneHomeWorkbenchCmdk||!global.OneToneHomeWorkbenchCmdk.isOpen())) searchInput.blur();
      });
    }
    document.addEventListener('keydown',function(e){
      if((e.ctrlKey||e.metaKey)&&String(e.key||'').toLowerCase()==='k'){
        if(!$('homeWorkbench')) return;
        e.preventDefault();
        if(global.OneToneHomeWorkbenchCmdk) global.OneToneHomeWorkbenchCmdk.openPalette();
        else if(searchInput) searchInput.focus();
      }
    });
    var endBtn=$('wbBtnEnd');
    if(endBtn){
      endBtn.onclick=function(){
        var summary=global.OneToneVoiceHomeSummary.compute();
        if(summary.dictating&&global.OneToneIpc){
          global.OneToneIpc.invoke('cmd_voice_end_ui_end',{}).catch(function(){});
        }
      };
    }
    var cancelBtn=$('wbBtnCancel');
    if(cancelBtn){
      cancelBtn.onclick=function(){
        var summary=global.OneToneVoiceHomeSummary.compute();
        if(summary.dictating&&global.OneToneIpc){
          global.OneToneIpc.invoke('cmd_voice_end_ui_cancel',{}).catch(function(){});
        }
      };
    }
    var listenToggle=$('wbBtnListenToggle');
    if(listenToggle){
      listenToggle.onclick=function(){
        if(!global.OneToneIpc) return;
        var paused=!!(global.OneToneState&&global.OneToneState.runtime&&global.OneToneState.runtime.paused);
        global.OneToneIpc.invoke(paused?'cmd_resume':'cmd_pause',{}).catch(function(){});
      };
    }
    var testBtn=$('wbBtnTestSend');
    if(testBtn){
      testBtn.onclick=function(){
        if(global.OneToneHabitTriggerSetup&&global.OneToneHabitTriggerSetup.open){
          global.OneToneHabitTriggerSetup.open();
        }
      };
    }
    var editBtn=$('wbTriggerEdit');
    if(editBtn){
      editBtn.onclick=function(){
        openHeroSettings();
      };
    }
    var heroOrb=$('wbHeroOrb');
    if(heroOrb){
      heroOrb.onclick=function(){ openHeroSettings(); };
    }
    var heroModes=$('wbHero');
    if(heroModes){
      heroModes.addEventListener('click',function(e){
        var btn=e.target.closest&&e.target.closest('[data-wb-hero-mode]');
        if(!btn) return;
        setHeroMode(btn.getAttribute('data-wb-hero-mode')||'voice');
      });
    }
    var qNew=$('wbHabitNew');
    if(qNew) qNew.onclick=function(){ openSettings({panel:'habits',habitWizard:true}); };
    var alertsHost=$('wbHomeAlerts');
    if(alertsHost){
      alertsHost.addEventListener('click',function(e){
        var btn=e.target.closest&&e.target.closest('[data-wb-alert-action]');
        if(!btn) return;
        handleAlertAction(alertsHost._lastAlertAction);
      });
    }
    var probeBtn=$('debugDiagProbeBtn');
    if(probeBtn){
      probeBtn.onclick=function(){
        startCompatProbe();
        renderTriggerDiagBlocks();
      };
    }
    if(global.OneToneHomeV9.startForegroundPoll) global.OneToneHomeV9.startForegroundPoll();
  }

  function openHeroSettings(){
    var vm=global.OneToneHomeV9.buildViewModel();
    var id=vm.m&&vm.m.id?vm.m.id:null;
    if(heroMode==='keys') openSettings({panel:'keys',focus:id});
    else openSettings({panel:'voiceWake'});
  }

  function applyLang(){
    var shell=$('appWorkbenchShell')||$('homeWorkbench');
    if(shell){
      shell.querySelectorAll('[data-i18n]').forEach(function(el){
        var key=el.getAttribute('data-i18n');
        if(key) el.textContent=t(key);
      });
    }
    var brandSub=$('wbNavBrandSub');
    if(brandSub) brandSub.textContent=t('homeWbNavSubtitle');
    setText($('wbBtnEnd'),t('homeV9BtnEnd'));
    setText($('wbBtnCancel'),t('homeWbBtnCancel'));
    setText($('wbBtnTestSend'),t('homeWbQuickStart'));
    setText($('wbLivePreviewTitle'),t('homeWbLivePreviewTitle'));
    setText($('wbBtnListenToggleLabel'),
      (global.OneToneState&&global.OneToneState.runtime&&global.OneToneState.runtime.paused)
        ?t('homeWbListenResume')
        :t('homeWbListenPause'));
    setText($('wbHeroModeVoice'),t('homeWbHeroModeVoice'));
    setText($('wbHeroModeKeys'),t('homeWbHeroModeKeys'));
    setText($('wbHeroOrbHint'),
      heroMode==='keys'?t('homeWbHeroHintKeys'):t('homeWbHeroHintVoice'));
    var triggerEdit=$('wbTriggerEdit');
    if(triggerEdit){
      triggerEdit.title=t('homeWbPipelineEdit');
      triggerEdit.setAttribute('aria-label',t('homeWbPipelineEdit'));
    }
    var searchInput=$('wbCommandSearchInput');
    if(searchInput) searchInput.placeholder=t('homeWbCmdSearchPlaceholder');
    renderQuickActions();
    if(global.OneToneHomeWorkbench&&global.OneToneHomeWorkbench.render) global.OneToneHomeWorkbench.render();
  }

  global.OneToneHomeWorkbench={
    render:render,
    bindOnce:bindOnce,
    applyLang:applyLang,
    syncNavActiveState:syncNavActiveState,
    buildPerf:buildPerf,
    enrichViewModel:enrichViewModel,
    renderTriggerDiagBlocks:renderTriggerDiagBlocks,
    startCompatProbe:startCompatProbe,
    onCompatResult:function(msg){
      if(global.OneToneHomeWorkbenchCompat&&msg){
        global.OneToneHomeWorkbenchCompat.store(msg.mappingId,msg);
      }
      render();
      renderTriggerDiagBlocks();
    }
  };
})((typeof window!=='undefined')?window:globalThis);
