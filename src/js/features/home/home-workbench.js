(function(global){
  'use strict';

  var $=function(id){ return global.OneToneDom.$(id); };
  var t=function(key){ return global.OneToneI18n.t(key); };
  var bound=false;
  var HERO_MODE_KEY='onetone.wbHeroMode';
  var heroMode='voice';
  var presenceHooked=false;
  var MIC_SVG='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1v11m0 0a4 4 0 01-4-4V5a4 4 0 118 0v4a4 4 0 01-4 4zm0 0v3m0 0a7 7 0 01-7-7M12 15a7 7 0 007-7M12 18v3m-3 0h6"/></svg>';
  var KEY_SVG='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="5.5" width="19" height="13" rx="2.2" class="wb-key-frame"/><circle cx="6" cy="10" r="1.1" class="wb-key-el wb-key-1" fill="currentColor" stroke="none"/><circle cx="10" cy="10" r="1.1" class="wb-key-el wb-key-2" fill="currentColor" stroke="none"/><circle cx="14" cy="10" r="1.1" class="wb-key-el wb-key-3" fill="currentColor" stroke="none"/><circle cx="18" cy="10" r="1.1" class="wb-key-el wb-key-4" fill="currentColor" stroke="none"/><rect x="7" y="13.5" width="10" height="1.8" rx="0.9" class="wb-key-el wb-key-space" fill="currentColor" stroke="none"/></svg>';
  var CAM_SVG='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';

  function normalizeHeroMode(mode){
    var raw=String(mode||'').toLowerCase();
    if(raw==='keys'||raw==='camera') return raw;
    return 'voice';
  }

  function readHeroMode(){
    try{
      var raw=String(sessionStorage.getItem(HERO_MODE_KEY)||'').toLowerCase();
      return normalizeHeroMode(raw);
    }catch(_){}
    return 'voice';
  }

  function writeHeroMode(mode){
    heroMode=normalizeHeroMode(mode);
    try{ sessionStorage.setItem(HERO_MODE_KEY,heroMode); }catch(_){}
  }

  function cameraPresenceApi(){
    return global.OneToneCameraPresenceActions||null;
  }

  function cameraPresenceSnapshot(){
    var api=cameraPresenceApi();
    var prefs=api&&api.prefs?api.prefs():null;
    var st=api&&api.getState?api.getState():null;
    var rs=api&&api.getRuntimeStatus?api.getRuntimeStatus():null;
    var enabled=!!(rs?rs.enabled:(api&&api.isEnabled?api.isEnabled():(prefs&&prefs.enabled)));
    var running=!!(rs?rs.running:(api&&api.isRunning?api.isRunning():false));
    var status=rs&&rs.status?String(rs.status):(enabled?(running?'running':'off'):'off');
    var presence=st&&st.presence?String(st.presence):(rs&&rs.presence?String(rs.presence):'unknown');
    var bound=0;
    if(prefs){
      var tr=prefs.triggers||{};
      ['away','shake','blink','openPalm','okHand','fist','wave'].forEach(function(k){
        if(tr[k]) bound++;
      });
      if(!bound){
        ['onAway','onReturn','shakeHead','deliberateBlink','openPalm','okHand','fist','wave'].forEach(function(k){
          if(prefs[k]&&prefs[k]!=='none') bound++;
        });
      }
    }
    return {
      enabled:enabled,
      running:running,
      status:status,
      manualStopped:!!(rs&&rs.manualStopped),
      lastError:rs&&rs.lastError?rs.lastError:null,
      presence:presence,
      bound:bound,
      prefs:prefs,
      state:st,
      runtime:rs
    };
  }

  function cameraPresenceLabel(presence){
    if(presence==='present') return t('homeWbCameraPresencePresent');
    if(presence==='away') return t('homeWbCameraPresenceAway');
    return t('homeWbCameraPresenceIdle');
  }

  function cameraChannelLabel(cam){
    if(!cam||!cam.enabled) return t('homeWbCameraOff');
    if(cam.running||cam.status==='running') return t('homeWbCameraOn');
    var base=t('homeWbCameraConfiguredIdle','已配置 · 未运行');
    if(cam.lastError&&cam.lastError.message) return base+' · '+cam.lastError.message;
    if(cam.manualStopped||cam.status==='manual_stopped') return t('homeWbCameraManualStopped','已配置 · 未运行（已手动停止）');
    return base;
  }

  function cameraChannelTone(cam){
    if(!cam||!cam.enabled) return {pill:'is-muted',hero:'is-standby',live:false};
    if(cam.running||cam.status==='running') return {pill:'is-ok',hero:'is-ok',live:true};
    return {pill:'is-warn',hero:'is-standby',live:false};
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

  function buildPillMicBars(count){
    var html='';
    for(var i=0;i<(count||10);i++) html+='<span></span>';
    return html;
  }

  function enginePillLabel(vm){
    var engineLine=String(vm.engineLine||'').trim();
    if(!engineLine) return t('homeWbVoiceOff');
    var split=engineLine.indexOf(' · ');
    return split>=0?engineLine.slice(0,split):engineLine;
  }

  function shortMicLabel(raw){
    var s=String(raw||'').trim();
    if(!s) return '';
    var m=s.match(/^(?:麦克风|Microphone)\s*[（(]\s*(.+?)\s*[）)]\s*$/i);
    if(m&&m[1]) s=m[1].trim();
    return s;
  }

  function renderHeroFlowSummary(vm){
    var host=$('wbHeroFlowSummary');
    if(!host) return;
    try{
    var mode=normalizeHeroMode(heroMode);
    var paused=!!(vm.runtime&&vm.runtime.paused);
    var live=vm.vpState==='DICTATING'||!!(vm.summary&&vm.summary.dictating);
    var listening=!paused&&!live&&((vm.summary&&vm.summary.statusMode==='listening')||vm.vpState==='LISTENING');
    var target=String(vm.targetLabel||'').trim()||t('homeV9TargetUnknown');
    var habit=String(vm.habitName||'').trim();
    if(habit&&habit!==target) target=habit+' · '+target;
    var trigger;
    if(mode==='keys'){
      trigger=vm.triggerKey&&vm.triggerKey!==t('homeLiveUnset')?vm.triggerKey:t('homeWbHeroModeKeys');
    }else if(mode==='camera'){
      var cam=cameraPresenceSnapshot();
      trigger=cameraChannelLabel(cam)||t('homeWbHeroModeCamera');
    }else{
      trigger=vm.wakePrimary&&vm.wakePrimary!==t('homeLiveUnset')?vm.wakePrimary:t('homeWbHeroModeVoice');
    }
    var statusCls='';
    var status;
    if(paused){
      status=t('homeWbListenResume');
      statusCls='is-warn';
    }else if(mode==='camera'){
      var camSt=cameraPresenceSnapshot();
      status=cameraChannelLabel(camSt)||t('homeWbStatusIdle');
      if(camSt&&(camSt.running||camSt.status==='running')) statusCls='is-live';
    }else if(live){
      status=t('homeWbTriggerLive')||t('homeWbTriggerHeroLive');
      statusCls='is-live';
    }else if(listening){
      status=t('homeWbVoiceWaitingWake')||t('homeWbStatusReady');
      statusCls='is-live';
    }else if(vm.summary&&vm.summary.statusMode==='error'){
      status=t('homeWbDiagRecogError')||t('homeV9EngineOffline');
      statusCls='is-warn';
    }else{
      status=t('homeWbStatusReady');
    }
    var finish=String(vm.finishPill||vm.finishText||'').trim()||t('homeLiveUnset');
    function cell(lbl,val,cls){
      return '<div class="wb-hero-flow-item">'
        +'<span class="wb-hero-flow-lbl">'+esc(lbl)+'</span>'
        +'<strong class="wb-hero-flow-val'+(cls?' '+cls:'')+'" title="'+esc(val)+'">'+esc(val)+'</strong>'
        +'</div>';
    }
    host.innerHTML=
      cell(t('homeWbFlowTarget'),target,'')+
      cell(t('homeWbFlowTrigger'),trigger,'')+
      cell(t('homeWbFlowStatus'),status,statusCls)+
      cell(t('homeWbFlowFinish'),finish,'');
    }catch(err){
      try{ console.error('wbHeroFlowSummary',err); }catch(_){}
    }
  }

  function renderHeroPills(vm,stats){
    var host=$('wbHeroPills');
    if(!host) return;
    var paused=!!(vm.runtime&&vm.runtime.paused);
    var html='';

    if(heroMode==='camera'){
      var cam=cameraPresenceSnapshot();
      var tone=cameraChannelTone(cam);
      html+=pillHtml(cameraChannelLabel(cam),tone.pill,tone.hero);
      html+=pillHtml(cameraPresenceLabel(cam.presence),'is-presence','');
      html+='<button type="button" class="wb-hero-pill wb-hero-pill-listen is-solo" id="wbBtnCameraOpen" title="'+esc(t('homeWbCameraOpenSettings'))+'">'
        +'<span>'+esc(t('homeWbCameraOpenSettings'))+'</span>'
        +'</button>';
      host.innerHTML=html;
      return;
    }

    var engineOn=vm.summary&&vm.summary.engine&&vm.summary.engine!=='off';
    if(engineOn){
      var engOk=vm.summary.statusMode!=='error'&&vm.engineStatus!==t('homeV9EngineOffline');
      html+='<span class="wb-hero-pill is-engine'+(engOk?' is-ok':' is-warn')+'" role="listitem" title="'+esc(enginePillLabel(vm))+'">'
        +'<span class="wb-hero-pill-dot '+(engOk?'is-ok':'is-warn')+'" aria-hidden="true"></span>'
        +'<span>'+esc(enginePillLabel(vm))+'</span></span>';
    }else{
      html+=pillHtml(t('homeWbVoiceOff'),'is-muted','');
    }

    if(heroMode==='keys'){
      var trig=vm.triggerKey||'';
      if(trig&&trig!==t('homeLiveUnset')) html+=pillHtml(trig,'is-key','');
      var listenLblKeys=paused?t('homeWbListenResume'):t('homeWbListenPause');
      html+='<button type="button" class="wb-hero-pill wb-hero-pill-listen is-solo'+(paused?' is-paused':'')+'" id="wbBtnListenToggle" aria-pressed="'+(paused?'true':'false')+'" title="'+esc(paused?t('homeWbListenResumeTip'):t('homeWbListenPauseTip'))+'">'
        +'<span id="wbBtnListenToggleLabel">'+esc(listenLblKeys)+'</span>'
        +'</button>';
    }else{
      var micFull=vm.micLabel&&vm.micLabel!==t('homeLiveMicUnset')&&vm.micLabel!==t('homeLiveMicUnknown')
        ?vm.micLabel
        :t('homeLiveMicUnset');
      var micShort=shortMicLabel(micFull)||micFull;
      var listenLbl=paused?t('homeWbListenResume'):t('homeWbListenPause');
      html+='<span class="wb-hero-pill is-mic is-mic-level'+(paused?' is-paused':'')+'" role="listitem">'
        +'<button type="button" class="wb-hero-pill-mic-btn" id="wbVoiceChangeMic" title="'+esc(micFull)+'">'
        +'<span class="mic-level-bars mic-level-bars--pill" id="wbHomeMicLevel" aria-hidden="true">'+buildPillMicBars(8)+'</span>'
        +'<span class="wb-hero-pill-mic-label">'+esc(micShort)+'</span>'
        +'</button>'
        +'<button type="button" class="wb-hero-pill-listen" id="wbBtnListenToggle" aria-pressed="'+(paused?'true':'false')+'" title="'+esc(paused?t('homeWbListenResumeTip'):t('homeWbListenPauseTip'))+'">'
        +'<span id="wbBtnListenToggleLabel">'+esc(listenLbl)+'</span>'
        +'</button>'
        +'</span>';
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
    var mode=normalizeHeroMode(heroMode);
    var hero=$('wbHero');
    var orb=$('wbHeroOrb');
    var icon=$('wbHeroOrbIcon');
    var modeVoice=$('wbHeroModeVoice');
    var modeKeys=$('wbHeroModeKeys');
    var modeCamera=$('wbHeroModeCamera');
    var live=vm.vpState==='DICTATING'||!!(vm.summary&&vm.summary.dictating);
    var paused=!!(vm.runtime&&vm.runtime.paused);
    var cam=mode==='camera'?cameraPresenceSnapshot():null;
    if(hero){
      hero.classList.toggle('is-mode-voice',mode==='voice');
      hero.classList.toggle('is-mode-keys',mode==='keys');
      hero.classList.toggle('is-mode-camera',mode==='camera');
      hero.classList.toggle('is-live',mode==='camera'?!!(cam&&(cam.running||cam.status==='running')):live);
      hero.classList.toggle('is-paused',paused);
    }
    if(orb){
      orb.setAttribute('data-mode',mode);
      orb.classList.toggle('is-live',mode==='camera'?!!(cam&&(cam.running||cam.status==='running')):live);
      orb.classList.toggle('is-paused',paused);
      var hint=mode==='keys'?t('homeWbHeroHintKeys')
        :(mode==='camera'?t('homeWbHeroHintCamera'):t('homeWbHeroHintVoice'));
      orb.setAttribute('aria-label',hint);
    }
    if(icon){
      var next=mode==='keys'?KEY_SVG:(mode==='camera'?CAM_SVG:MIC_SVG);
      if(icon.getAttribute('data-icon')!==mode){
        icon.classList.add('is-switching');
        icon.setAttribute('data-icon',mode);
        setTimeout(function(){
          icon.innerHTML=next;
          requestAnimationFrame(function(){ icon.classList.remove('is-switching'); });
        },150);
      }
    }
    if(modeVoice){
      modeVoice.classList.toggle('is-active',mode==='voice');
      modeVoice.setAttribute('aria-selected',mode==='voice'?'true':'false');
    }
    if(modeKeys){
      modeKeys.classList.toggle('is-active',mode==='keys');
      modeKeys.setAttribute('aria-selected',mode==='keys'?'true':'false');
    }
    if(modeCamera){
      modeCamera.classList.toggle('is-active',mode==='camera');
      modeCamera.setAttribute('aria-selected',mode==='camera'?'true':'false');
    }
    var stats=global.OneToneHomeWorkbenchStats
      ?global.OneToneHomeWorkbenchStats.buildHeroStats(vm)
      :{uptime:'—',opCount:'—',topTarget:'—',topShortcut:'—',latency:'—'};
    renderHeroFlowSummary(vm);
    renderHeroPills(vm,stats);
    renderHeroStats(stats);
  }

  function setHeroMode(mode,opts){
    opts=opts||{};
    var next=normalizeHeroMode(mode);
    if(next===heroMode&&!opts.force) return;
    writeHeroMode(next);
    if(opts.render!==false) render();
  }

  function dictatingHint(vm){
    var live=vm.vpState==='DICTATING'||!!vm.summary.dictating;
    if(live) return t('homeWbTriggerHeroLive');
    if(heroMode==='keys') return t('homeWbHeroHintKeys');
    if(heroMode==='camera') return t('homeWbHeroHintCamera');
    return t('homeWbHeroHintVoice');
  }

  function renderHeroModeHint(){
    var modes=$('wbHero');
    if(!modes) return;
    var hint=modes.querySelector('.wb-hero-mode-hint');
    if(!hint){
      var footer=modes.querySelector('.wb-hero-footer')||modes.querySelector('.wb-hero-modes');
      hint=document.createElement('p');
      hint.className='wb-hero-mode-hint';
      if(footer&&footer.parentNode) footer.parentNode.insertBefore(hint,footer);
      else modes.appendChild(hint);
    }
    hint.textContent=t('homeWbHeroModeHint');
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
      card.classList.toggle('is-mode-camera',heroMode==='camera');
    }
    renderHero(vm);
    renderHeroModeHint();
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
    var card=$('wbTriggerCard')||$('wbHero');
    var status=$('wbLivePreviewStatus');
    var statusLbl=$('wbLivePreviewStatusLabel')||status;
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
    }
    if(statusLbl){
      if(heroMode==='camera'){
        var camSt=cameraPresenceSnapshot();
        statusLbl.textContent=cameraChannelLabel(camSt);
      }else{
        statusLbl.textContent=paused
          ?t('homeWbLivePreviewPaused')
          :(listening?t('homeWbLivePreviewListening'):t('homeWbLivePreviewStandby'));
      }
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
    if(heroMode==='camera'){
      liveEl.classList.add('is-placeholder');
      liveEl.innerHTML='<div class="vp-empty">'+esc(t('homeWbLiveCameraHint'))+'</div>';
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
        // Islands 护栏：.ot-island 子树由 React 自管文案，legacy data-i18n sweep 跳过
        if(global.OneToneIslands&&typeof global.OneToneIslands.isInsideIsland==='function'&&global.OneToneIslands.isInsideIsland(el)) return;
        var key=el.getAttribute('data-i18n');
        if(key) el.textContent=t(key);
      });
    }
  }

  function openWorkbenchScenario(id){
    id=String(id||'').trim();
    if(!id) return;
    var m=global.OneToneMappingCore&&global.OneToneMappingCore.byId
      ?global.OneToneMappingCore.byId(id):null;
    var diff=global.OneToneHabitOverrideDiff;
    var banner=global.OneToneHabitScenarioContextBanner;
    var isApp=!!(m&&diff&&diff.isAppScenarioMapping&&diff.isAppScenarioMapping(m));
    if(isApp&&banner&&banner.openScenarioKeysEdit){
      banner.openScenarioKeysEdit(id,{returnToHub:true});
      return;
    }
    if(m&&m.id&&global.OneToneState&&global.OneToneState.state){
      global.OneToneState.state.selectedMappingId=m.id;
    }
    if(banner&&banner.openGlobalKeys&&!m){
      banner.openGlobalKeys({fromHub:true});
      return;
    }
    openSettings({panel:'keys',focus:id});
  }

  function currentHabitMapping(){
    var id='';
    if(global.OneToneSceneActivate&&global.OneToneSceneActivate.activeSceneId){
      id=String(global.OneToneSceneActivate.activeSceneId()||'').trim();
    }else{
      var cfg=global.OneToneState&&global.OneToneState.state&&global.OneToneState.state.config;
      id=String(cfg&&cfg.activeSceneId||'').trim();
    }
    if(id&&global.OneToneMappingCore&&global.OneToneMappingCore.byId){
      return global.OneToneMappingCore.byId(id);
    }
    if(global.OneToneHomeScheme&&global.OneToneHomeScheme.activeMapping){
      return global.OneToneHomeScheme.activeMapping();
    }
    return null;
  }

  function openHabitChannelChip(channel,opts){
    opts=opts||{};
    channel=String(channel||'').trim();
    var focus=String(opts.focus||'').trim();
    var m=currentHabitMapping();
    var id=m&&m.id?String(m.id):'';
    var diff=global.OneToneHabitOverrideDiff;
    var banner=global.OneToneHabitScenarioContextBanner;
    var isApp=!!(m&&diff&&diff.isAppScenarioMapping&&diff.isAppScenarioMapping(m));

    function afterOpenFocus(){
      if(!focus) return;
      var drawer=global.OneToneSettingsDrawer;
      if(drawer&&drawer.focusField){
        requestAnimationFrame(function(){
          try{ drawer.focusField(focus); }catch(_){}
        });
      }
    }

    if(channel==='keys'){
      if(isApp&&banner&&banner.openScenarioKeysEdit){
        banner.openScenarioKeysEdit(id,{returnToHub:false});
        afterOpenFocus();
        return;
      }
      if(id&&global.OneToneState&&global.OneToneState.state){
        global.OneToneState.state.selectedMappingId=id;
      }
      openSettings({panel:'keys',focus:focus||'trigger'});
      return;
    }
    if(channel==='voice'){
      if(isApp&&banner&&banner.openScenarioVoiceEdit){
        banner.openScenarioVoiceEdit(id,{returnToHub:false});
        afterOpenFocus();
        return;
      }
      if(banner&&banner.openGlobalVoice){
        banner.openGlobalVoice({fromHub:false});
        afterOpenFocus();
        return;
      }
      openSettings({panel:'voiceWake',focus:focus||'wakePhrases'});
      return;
    }
    if(channel==='camera'){
      if(isApp&&banner&&banner.openScenarioCameraEdit){
        banner.openScenarioCameraEdit(id,{returnToHub:false});
        afterOpenFocus();
        return;
      }
      if(banner&&banner.openGlobalCamera){
        banner.openGlobalCamera({fromHub:false});
        afterOpenFocus();
        return;
      }
      openSettings({panel:'camera',focus:focus||undefined});
      return;
    }
    if(channel==='softPad'){
      var hub=global.OneToneSoftPadHub;
      var softId='';
      if(m&&hub&&hub.isSoftPadSchemeEligible&&hub.isSoftPadSchemeEligible(m)){
        softId=id;
      }else if(hub&&hub.listSoftPadSchemes){
        var entries=hub.listSoftPadSchemes()||[];
        var on=entries.filter(function(e){ return e&&e.padEnabled; });
        var pick=(on.length?on:entries)[0];
        if(pick&&pick.mapping&&pick.mapping.id) softId=String(pick.mapping.id);
      }
      if(softId&&global.OneToneState&&global.OneToneState.state){
        global.OneToneState.state.selectedMappingId=softId;
      }
      openSettings({panel:'softPad',mappingId:softId||undefined});
      return;
    }
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
      var channelChip=e.target.closest&&e.target.closest('[data-wb-habit-channel]');
      if(channelChip){
        e.preventDefault();
        openHabitChannelChip(channelChip.getAttribute('data-wb-habit-channel')||'');
        return;
      }
      var habitEdit=e.target.closest&&e.target.closest('[data-wb-habit-edit]');
      if(habitEdit){
        openWorkbenchScenario(habitEdit.getAttribute('data-wb-habit-edit')||'');
        return;
      }
      var scenarioEdit=e.target.closest&&e.target.closest('[data-wb-scenario-edit]');
      if(scenarioEdit){
        e.preventDefault();
        e.stopPropagation();
        openWorkbenchScenario(scenarioEdit.getAttribute('data-wb-scenario-edit')||'');
        return;
      }
      var scenarioUse=e.target.closest&&e.target.closest('[data-wb-scenario-use]');
      if(scenarioUse){
        e.preventDefault();
        e.stopPropagation();
        selectWorkbenchMapping(scenarioUse.getAttribute('data-wb-scenario-use')||'');
        return;
      }
      var habit=e.target.closest&&e.target.closest('[data-wb-habit-id]');
      if(habit){
        selectWorkbenchMapping(habit.getAttribute('data-wb-habit-id')||'');
        return;
      }
      var scenario=e.target.closest&&e.target.closest('[data-wb-scenario-id]');
      if(scenario){
        // Card body click defaults to set in-use (not edit).
        selectWorkbenchMapping(scenario.getAttribute('data-wb-scenario-id')||'');
        return;
      }
      var micBtn=e.target.closest&&e.target.closest('#wbVoiceChangeMic,.wb-hero-pill-mic-btn');
      if(micBtn){
        openSettings({panel:'voiceWake',focus:'mic'});
        return;
      }
      var listenBtn=e.target.closest&&e.target.closest('#wbBtnListenToggle,.wb-hero-pill-listen');
      if(listenBtn){
        if(listenBtn.id==='wbBtnCameraOpen'||listenBtn.closest('#wbBtnCameraOpen')){
          openSettings({panel:'camera'});
          return;
        }
        if(!global.OneToneIpc) return;
        var paused=!!(global.OneToneState&&global.OneToneState.runtime&&global.OneToneState.runtime.paused);
        global.OneToneIpc.invoke(paused?'cmd_resume':'cmd_pause',{}).catch(function(){});
        return;
      }
      var camOpen=e.target.closest&&e.target.closest('#wbBtnCameraOpen');
      if(camOpen){
        openSettings({panel:'camera'});
        return;
      }
      var habitNew=e.target.closest&&e.target.closest('#wbHabitNew');
      if(habitNew){
        openSettings({panel:'habits',habitWizard:true});
        return;
      }
      var howtoZone=e.target.closest&&e.target.closest('[data-wb-howto-channel]');
      if(howtoZone){
        e.preventDefault();
        e.stopPropagation();
        openHabitChannelChip(
          howtoZone.getAttribute('data-wb-howto-channel')||'',
          {focus:howtoZone.getAttribute('data-wb-howto-focus')||''}
        );
        return;
      }
      var howto=e.target.closest&&e.target.closest('[data-wb-howto]');
      if(howto){
        var kind=howto.getAttribute('data-wb-howto')||'';
        if(kind==='keys'||kind==='voice'||kind==='camera'||kind==='softPad'){
          openHabitChannelChip(kind);
        }
      }
    });
  }

  var NAV_PANEL_MAP={
    habits:'schemes',
    keys:'triggers',
    softPad:'softPad',
    voiceWake:'voice',
    models:'voice',
    camera:'camera',
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
        activeNav='runtime';
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
    if(global.OneToneQuickStart&&global.OneToneQuickStart.isOpen&&global.OneToneQuickStart.isOpen()) return;
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
      if(ui.drawerOpen&&ui.settingsPanel==='debug'&&global.OneToneVoiceDiag&&global.OneToneVoiceDiag.getFocusMode()==='repair'){
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
      if(action==='softPad'){ openSettings({panel:'softPad'}); return; }
      if(action==='voice'){ openSettings({panel:'voiceWake'}); return; }
      if(action==='camera'){ openSettings({panel:'camera'}); return; }
      if(action==='sounds'){ openSettings({panel:'sounds'}); return; }
      if(action==='general'){ openSettings({panel:'basic'}); return; }
      if(action==='maintenance'){ openSettings({panel:'debug', debugMode:'repair'}); return; }
      if(action==='runtime'){ openSettings({panel:'debug', debugMode:'overview'}); return; }
    });
  }

  function bindOnce(){
    if(bound) return;
    bound=true;
    heroMode=readHeroMode();
    bindNav();
    bindPanelActions();
    hookCameraPresence();
    if(global.OneToneHomeWorkbenchPanels) global.OneToneHomeWorkbenchPanels.bindOnce();
    if(global.OneToneHomeWorkbenchCmdk) global.OneToneHomeWorkbenchCmdk.bindOnce();
    var searchInput=$('wbCommandSearchInput');
    if(searchInput){
      searchInput.addEventListener('keydown',function(e){
        var cmdkOpen=global.__otCommandPalette
          ?global.__otCommandPalette.isOpen&&global.__otCommandPalette.isOpen()
          :(global.OneToneHomeWorkbenchCmdk&&global.OneToneHomeWorkbenchCmdk.isOpen&&global.OneToneHomeWorkbenchCmdk.isOpen());
        if(e.key==='Enter'&&(!cmdkOpen)) searchInput.blur();
      });
    }
    document.addEventListener('keydown',function(e){
      if((e.ctrlKey||e.metaKey)&&String(e.key||'').toLowerCase()==='k'){
        if(!$('homeWorkbench')) return;
        e.preventDefault();
        if(global.__otCommandPalette&&global.__otCommandPalette.openPalette){
          global.__otCommandPalette.openPalette();
        }else if(global.OneToneHomeWorkbenchCmdk){
          global.OneToneHomeWorkbenchCmdk.openPalette();
        }else if(searchInput){
          searchInput.focus();
        }
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
    var testBtn=$('wbBtnTestSend');
    if(testBtn){
      testBtn.onclick=function(){
        if(global.OneToneQuickStart&&global.OneToneQuickStart.open){
          global.OneToneQuickStart.open({ entry:'intent' });
        }else if(global.OneToneHabitTriggerSetup&&global.OneToneHabitTriggerSetup.open){
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
    else if(heroMode==='camera') openSettings({panel:'camera'});
    else openSettings({panel:'voiceWake'});
  }

  function hookCameraPresence(){
    if(presenceHooked) return;
    var api=cameraPresenceApi();
    if(!api) return;
    presenceHooked=true;
    var presenceRenderTimer=0;
    function schedulePresenceRender(){
      if(presenceRenderTimer) return;
      presenceRenderTimer=setTimeout(function(){
        presenceRenderTimer=0;
        try{ render(); }catch(_){}
      },80);
    }
    if(typeof api.setOnStateChange==='function'){
      api.setOnStateChange(schedulePresenceRender);
    }
    if(typeof api.setRuntimeStateListener==='function'){
      api.setRuntimeStateListener(schedulePresenceRender);
    }
  }

  function applyLang(){
    var shell=$('appWorkbenchShell')||$('homeWorkbench');
    if(shell){
      shell.querySelectorAll('[data-i18n]').forEach(function(el){
        // Islands 护栏：.ot-island 子树由 React 自管文案，legacy data-i18n sweep 跳过
        if(global.OneToneIslands&&typeof global.OneToneIslands.isInsideIsland==='function'&&global.OneToneIslands.isInsideIsland(el)) return;
        var key=el.getAttribute('data-i18n');
        if(key) el.textContent=t(key);
      });
    }
    var brandSub=$('wbNavBrandSub');
    if(brandSub) brandSub.textContent=t('homeWbNavSubtitle');
    setText($('wbBtnEnd'),t('homeV9BtnEnd'));
    setText($('wbBtnCancel'),t('homeWbBtnCancel'));
    setText($('wbBtnTestSend'),t('homeWbQuickStart'));
    setText($('wbBtnListenToggleLabel'),
      (global.OneToneState&&global.OneToneState.runtime&&global.OneToneState.runtime.paused)
        ?t('homeWbListenResume')
        :t('homeWbListenPause'));
    setText($('wbHeroModeVoice'),t('homeWbHeroModeVoice'));
    setText($('wbHeroModeKeys'),t('homeWbHeroModeKeys'));
    setText($('wbHeroModeCamera'),t('homeWbHeroModeCamera'));
    var sceneTitle=document.querySelector('#wbSceneRail .wb-scene-rail-title');
    if(sceneTitle) sceneTitle.textContent=t('homeWbSceneRailTitle');
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
    getHeroMode:function(){ return normalizeHeroMode(heroMode); },
    setHeroMode:setHeroMode,
    onCompatResult:function(msg){
      if(global.OneToneHomeWorkbenchCompat&&msg){
        global.OneToneHomeWorkbenchCompat.store(msg.mappingId,msg);
      }
      render();
      renderTriggerDiagBlocks();
    }
  };
})((typeof window!=='undefined')?window:globalThis);
