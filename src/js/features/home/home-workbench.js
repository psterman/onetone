(function(global){
  'use strict';

  var $=function(id){ return global.OneToneDom.$(id); };
  var t=function(key){ return global.OneToneI18n.t(key); };
  var bound=false;
  var homeVoiceBootstrapped=false;
  var HERO_MODE_KEY='onetone.wbHeroMode';
  var heroMode='voice';
  var heroPaneTab='cap';
  var heroExpandedNodeId='';
  var lastShowcasePathKey='';
  var showcaseShellKind='';
  var presenceHooked=false;
  var MIC_SVG='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1v11m0 0a4 4 0 01-4-4V5a4 4 0 118 0v4a4 4 0 01-4 4zm0 0v3m0 0a7 7 0 01-7-7M12 15a7 7 0 007-7M12 18v3m-3 0h6"/></svg>';
  var KEY_SVG='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="5.5" width="19" height="13" rx="2.2" class="wb-key-frame"/><circle cx="6" cy="10" r="1.1" class="wb-key-el wb-key-1" fill="currentColor" stroke="none"/><circle cx="10" cy="10" r="1.1" class="wb-key-el wb-key-2" fill="currentColor" stroke="none"/><circle cx="14" cy="10" r="1.1" class="wb-key-el wb-key-3" fill="currentColor" stroke="none"/><circle cx="18" cy="10" r="1.1" class="wb-key-el wb-key-4" fill="currentColor" stroke="none"/><rect x="7" y="13.5" width="10" height="1.8" rx="0.9" class="wb-key-el wb-key-space" fill="currentColor" stroke="none"/></svg>';
  var CAM_SVG='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>';
  var PAD_SVG='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 7h.01M12 7h.01M16 7h.01M8 11h.01M12 11h.01M16 11h.01M8 15h8"/></svg>';
  var HERO_FLOW_WAKE_SVG='<svg class="flow-node-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v1a7 7 0 0 1-14 0v-1"/><line x1="12" y1="19" x2="12" y2="22"/></svg>';
  var HERO_FLOW_DICTATE_SVG='<svg class="flow-node-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>';
  var HERO_FLOW_SEND_SVG='<svg class="flow-node-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>';
  var HERO_FLOW_TRIGGER_SVG='<svg class="flow-node-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M6 9h.01M10 9h.01M14 9h.01M18 9h.01M8 13h.01M12 13h.01M16 13h.01M7 17h10"/></svg>';
  var HERO_FLOW_TARGET_SVG='<svg class="flow-node-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>';

  function heroFlowNodeIcon(mode,nodeId){
    if(mode==='keys'){
      if(nodeId==='target') return HERO_FLOW_TARGET_SVG;
      return HERO_FLOW_TRIGGER_SVG;
    }
    if(nodeId==='send') return HERO_FLOW_SEND_SVG;
    if(nodeId==='dictate') return HERO_FLOW_DICTATE_SVG;
    return HERO_FLOW_WAKE_SVG;
  }

  function heroFlowNodeTag(idx,label){
    var n=String(idx+1).padStart(2,'0');
    return n+' / '+String(label||'');
  }

  function heroPadVoiceHint(projection,showcase){
    var token=String((projection&&projection.status&&projection.status.token)||'idle');
    var live=!!(showcase&&showcase.isLive&&showcase.deviceReady);
    if(live||token==='listening'||token==='dictating'||token==='triggered'){
      return t('homeWbHeroPadVoiceHintListening');
    }
    if(showcase&&showcase.focus) return String(showcase.focus);
    return t('homeWbHeroPadVoiceHintIdle');
  }
  function normalizeHeroMode(mode){
    var raw=String(mode||'').trim();
    var low=raw.toLowerCase();
    if(low==='keys'||low==='camera') return low;
    if(low==='softpad'||low==='soft_pad') return 'softPad';
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

  function cameraLbl(key,fallback){
    var v=t(key);
    return (!v||v===key)?fallback:v;
  }

  function cameraActionShort(action){
    var s=String(action||'').trim();
    if(!s||s==='none') return '';
    if(s==='pressEsc') return cameraLbl('cameraPresenceActionEsc','取消');
    if(s==='pressCtrlI') return cameraLbl('homeLiveVoiceTitle','语音激活');
    if(s==='privacyScreen') return cameraLbl('cameraPresenceActionPrivacy','遮罩');
    if(s==='resumeVoice') return cameraLbl('cameraPresenceActionResume','恢复语音');
    if(s==='pauseVoice') return cameraLbl('cameraPresenceActionPause','暂停语音');
    if(s==='lowPowerMode'||s==='lowPower') return cameraLbl('cameraPresenceActionLowPower','低消耗');
    if(s.indexOf('agent:')===0){
      var id=s.slice(6);
      if(id==='cancel') return cameraLbl('cameraPresenceActionEsc','取消');
      if(id==='startDictation') return cameraLbl('cameraPresenceActionCtrlI','听写');
      return id;
    }
    return s;
  }

  function cameraActionsLine(prefs){
    if(!prefs) return '';
    var tr=prefs.triggers||{};
    var parts=[];
    function add(trigOn,action,title){
      if(!trigOn) return;
      if(!action||action==='none') return;
      var short=cameraActionShort(action);
      if(!short) return;
      parts.push(title+'→'+short);
    }
    add(!!tr.shake,prefs.shakeHead,cameraLbl('cameraCardShakeTitle','摇头'));
    add(!!tr.blink,prefs.deliberateBlink,cameraLbl('homeWbCameraBlinkShort','闭眼'));
    add(!!tr.away,prefs.onAway,cameraLbl('cameraPresenceOnAway','离席'));
    add(!!tr.away,prefs.onReturn,cameraLbl('cameraPresenceOnReturn','回席'));
    add(!!tr.openPalm,prefs.openPalm,cameraLbl('homeWbCameraPalmShort','张掌'));
    add(!!tr.okHand,prefs.okHand,cameraLbl('homeWbCameraOkShort','OK'));
    add(!!tr.fist,prefs.fist,cameraLbl('homeWbCameraFistShort','握拳'));
    add(!!tr.wave,prefs.wave,cameraLbl('homeWbCameraWaveShort','挥手'));
    return parts.slice(0,3).join(' · ');
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
    var actionsLine=cameraActionsLine(prefs);
    return {
      enabled:enabled,
      running:running,
      status:status,
      manualStopped:!!(rs&&rs.manualStopped),
      lastError:rs&&rs.lastError?rs.lastError:null,
      presence:presence,
      bound:bound,
      actionsLine:actionsLine,
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
    if(cam.actionsLine) return cam.actionsLine;
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
    if(action.type==='dismissLastStall') return t('homeWbAlertLastStallDismiss','知道了');
    if(action.type==='resumeListening') return t('homeWbAlertActionResume');
    if(action.type==='enableAutoListening') return t('homeWbAlertActionEnableAuto');
    if(action.type==='retryVoskListening') return t('homeWbAlertActionRetryVosk');
    if(action.type==='openSettings'){
      if(action.panel==='voiceWake') return t('homeWbAlertActionVoice');
      if(action.panel==='keys') return t('homeWbAlertActionKeys');
      if(action.panel==='debug') return t('homeWbAlertActionRuntime');
    }
    return '';
  }

  function handleAlertAction(action){
    if(!action) return;
    if(action.type==='dismissLastStall'){
      dismissLastUiStall();
      return;
    }
    if(action.type==='resumeListening'){
      if(global.OneToneIpc) global.OneToneIpc.invoke('cmd_resume',{}).catch(function(){});
      return;
    }
    if(action.type==='enableAutoListening'){
      var wake=global.OneToneVoiceWake;
      if(wake&&typeof wake.switchListeningStrategy==='function'){
        Promise.resolve(wake.switchListeningStrategy('auto',{ force:true }))
          .catch(function(){});
      }else if(global.OneToneIpc){
        global.OneToneIpc.invoke('cmd_voice_set_listening_strategy',{ strategy:'auto' }).catch(function(){});
      }
      return;
    }
    if(action.type==='retryVoskListening'){
      var wakeRetry=global.OneToneVoiceWake;
      if(wakeRetry&&typeof wakeRetry.retryVoskStart==='function'){
        wakeRetry.retryVoskStart();
      }else if(global.OneToneIpc){
        global.OneToneIpc.invoke('cmd_voice_vosk_retry_start',{}).catch(function(){});
      }
      return;
    }
    if(action.type==='openSettings'){
      var opts={panel:action.panel||'basic'};
      if(action.focus) opts.focus=action.focus;
      if(action.debugMode) opts.debugMode=action.debugMode;
      openSettings(opts);
    }
  }

  var pendingLastStall=null;
  var lastStallFetchStarted=false;

  function fetchLastUiStallOnce(){
    if(lastStallFetchStarted) return;
    lastStallFetchStarted=true;
    if(!global.OneToneIpc||!global.OneToneIpc.invoke) return;
    global.OneToneIpc.invoke('cmd_last_ui_stall',{}).then(function(s){
      if(!s||!s.code) return;
      pendingLastStall=s;
      try{
        forceHomeRender();
        render();
      }catch(_){}
    }).catch(function(){});
  }

  function dismissLastUiStall(){
    pendingLastStall=null;
    if(global.OneToneIpc&&global.OneToneIpc.invoke){
      global.OneToneIpc.invoke('cmd_clear_last_ui_stall',{}).catch(function(){});
    }
    try{
      forceHomeRender();
      render();
    }catch(_){}
  }

  function alertSeverity(kind){
    if(kind==='recognition_error'||kind==='send_failed'||kind==='mic_unavailable'||kind==='last_stall') return 'is-error';
    return 'is-warn';
  }

  function renderAlerts(vm,model){
    var host=$('wbHomeAlerts');
    if(!host) return;
    // One-shot: last session stall / unclean exit (persisted by Rust watchdog).
    if(pendingLastStall&&pendingLastStall.code){
      host.hidden=false;
      host.className='wb-home-alert is-error';
      host._lastAlertAction={type:'dismissLastStall'};
      var stallText=t('homeWbAlertLastStall','上次异常：{code} — {reason}')
        .replace('{code}',String(pendingLastStall.code||''))
        .replace('{reason}',String(pendingLastStall.reason||''));
      host.innerHTML=
        '<span class="wb-home-alert-text">'+esc(stallText)+'</span>'
        +'<button type="button" class="wb-home-alert-action" data-wb-alert-action="1">'
        +esc(t('homeWbAlertLastStallDismiss','知道了'))+'</button>';
      return;
    }
    // Phase1：model.repair / needsSetup CTA 优先于 alerts 启发式
    if(model&&model.repair){
      var repairAction={
        type:'openSettings',
        panel:model.repair.panel||'debug',
        debugMode:model.repair.debugMode||'repair'
      };
      host.hidden=false;
      host.className='wb-home-alert is-error';
      host._lastAlertAction=repairAction;
      host.innerHTML=
        '<span class="wb-home-alert-text">'+esc(model.statusLine||t('homeWbAlertRecogError'))+'</span>'
        +'<button type="button" class="wb-home-alert-action" data-wb-alert-action="1">'
        +esc(model.repair.label||t('debugFocusRepair'))+'</button>';
      return;
    }
    if(model&&model.needsSetup&&model.cta){
      var setupAction={
        type:'openSettings',
        panel:model.cta.panel||'keys',
        focus:model.cta.focus||null
      };
      host.hidden=false;
      host.className='wb-home-alert is-warn';
      host._lastAlertAction=setupAction;
      host.innerHTML=
        '<span class="wb-home-alert-text">'+esc(model.statusLine||t('homeSetupStart'))+'</span>'
        +'<button type="button" class="wb-home-alert-action" data-wb-alert-action="1">'
        +esc(model.cta.label||t('homeSetupStart'))+'</button>';
      return;
    }
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
    var projection=buildHeroProjection(peekHomeModel({})||{},vm);
    paintHeroSurfaces(projection);
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

  /** Phase1：五问条只读 model（状态 / 触发 / 目标 / 下一步 / 修复）。 */
  function softPadHeroSnapshot(){
    var panels=global.OneToneHomeWorkbenchPanels;
    var snap=panels&&typeof panels.softPadHowToSnapshot==='function'
      ?panels.softPadHowToSnapshot()
      :{
        value:t('homeWbChannelUnset'),
        statusLbl:t('homeWbHowToSoftPadOff'),
        boundName:t('homeWbChannelUnset'),
        mappingId:'',
        configLbl:t('homeWbSoftPadHabitNa','不含 Soft Pad'),
        controlLbl:t('homeWbSoftPadControlNone','暂无'),
        empty:false,
        schemeCount:0
      };
    // Keep two-layer fields from finalizeSoftPadSnapshot — do not re-list schemes or
    // clobber empty/config (that used to thrash howto + presence paints).
    if(typeof snap.schemeCount!=='number') snap.schemeCount=0;
    if(snap.empty==null) snap.empty=false;
    return snap;
  }

  var lastHeroProjection=null;

  function collectHeroModeCaps(vm){
    var panels=global.OneToneHomeWorkbenchPanels;
    var camera=cameraPresenceSnapshot();
    var softPad=softPadHeroSnapshot();
    var howto=panels&&typeof panels.collectHowToSurfaceBits==='function'
      ?panels.collectHowToSurfaceBits(vm)
      :{};
    return {camera:camera,softPad:softPad,howto:howto};
  }

  function buildHeroProjection(workbench,vm){
    var caps=collectHeroModeCaps(vm);
    var api=global.OneToneHomeHeroModeModel;
    if(!api||typeof api.build!=='function'){
      return {
        mode:normalizeHeroMode(heroMode),
        tab:{label:'',hint:''},
        status:{token:'idle',text:'',tone:'idle'},
        flow:{trigger:'—',target:'—',next:'—'},
        pills:[],
        preview:{title:'',value:'—',meta:[],empty:true},
        howtoCards:[],
        localAction:null,
        liveHint:'',
        liveStatus:'',
        chrome:{mode:normalizeHeroMode(heroMode),hint:'',isLive:false,isPaused:false,cameraRunning:false},
        guards:{cameraSendClass:false,softPadHasMicPill:false,globalCtaIsCamera:false},
        _caps:caps,
        _vm:vm,
        _workbench:workbench
      };
    }
    var projection=api.build({
      mode:heroMode,
      workbench:workbench||{},
      vm:vm||(workbench&&workbench.rawVm)||{},
      camera:caps.camera,
      softPad:caps.softPad,
      howto:caps.howto,
      t:t
    });
    projection._caps=caps;
    projection._vm=vm;
    projection._workbench=workbench;
    lastHeroProjection=projection;
    return projection;
  }

  function renderHeroFlowSummary(projection){
    var host=$('wbHeroFlowSummary');
    if(!host) return;
    try{
    var p=projection&&projection.flow?projection:null;
    if(!p) return;
    var token=String((projection.status&&projection.status.token)||'idle');
    var statusCls='';
    if(token==='error'||token==='paused'||token==='needsSetup') statusCls='is-warn';
    else if(token==='dictating'||token==='listening'||token==='triggered') statusCls='is-live';
    var mode=projection.mode||'';
    // Camera/softPad must not inherit voice statusLine.
    var status=(mode==='camera'||mode==='softPad')
      ?(projection.liveStatus||(projection.flow&&projection.flow.trigger)||'')
      :((projection.status&&projection.status.text)||token);
    var target=projection.flow.target||'';
    var repair=projection.flow.repair||'';
    // Happy-path listening: habit name alone — status text restates the obvious.
    if((mode==='voice'||mode==='keys')&&target&&(token==='listening'||token==='ready'||token==='idle')
      &&(status===t('homeStatusListening')||status===t('homeStatusTapToStart')||status==='listening'||status==='idle'||status==='Ready')){
      status='';
    }
    var m=currentHabitMapping();
    var panels=global.OneToneHomeWorkbenchPanels;
    var iconHtml=(panels&&typeof panels.sceneIconHtml==='function')?panels.sceneIconHtml(m):'';
    var sceneName=target||(m&&global.OneToneHomeScheme&&global.OneToneHomeScheme.shortName
      ?global.OneToneHomeScheme.shortName(m):'')||t('homeLiveUnset');
    var parts=[];
    function pushSep(){
      if(parts.length) parts.push('<span class="wb-hero-flow-sep" aria-hidden="true">·</span>');
    }
    function pushVal(text,extraCls){
      if(!text) return;
      pushSep();
      parts.push('<strong class="wb-hero-flow-val'+(extraCls?' '+extraCls:'')+'" title="'+esc(text)+'">'+esc(text)+'</strong>');
    }
    // Graphical "which scene": app/preset icon + habit name (reuse scene rail icons).
    parts.push('<span class="wb-hero-flow-scene'+(statusCls&&!status?' '+statusCls:'')+'" title="'+esc(sceneName)+'">'
      +'<span class="wb-hero-flow-scene-ico" aria-hidden="true">'+(iconHtml||'')+'</span>'
      +'<strong class="wb-hero-flow-val">'+esc(sceneName)+'</strong>'
      +'</span>');
    pushVal(status,statusCls);
    pushVal(repair,'is-warn');
    host.innerHTML='<div class="wb-hero-flow-line" role="status">'+parts.join('')+'</div>';
    host.setAttribute('data-wb-status-token',token);
    host.setAttribute('data-wb-from-model','1');
    host.setAttribute('data-wb-from-projection','1');
    host.classList.add('is-oneline');
    try{
      var rules=global.OneToneAppBehaviorRules;
      if(rules&&rules.hydrateCustomRuleChipIcons) rules.hydrateCustomRuleChipIcons(host);
    }catch(_){}
    }catch(err){
      try{ console.error('wbHeroFlowSummary',err); }catch(_){}
    }
  }

  function findShowcaseItem(showcase,id){
    if(!showcase||!id) return null;
    var nodes=showcase.nodes||[];
    var i;
    for(i=0;i<nodes.length;i++){
      if(nodes[i].id===id) return nodes[i];
    }
    var scenarios=showcase.scenarios||[];
    for(i=0;i<scenarios.length;i++){
      if(scenarios[i].id===id) return scenarios[i];
    }
    var caps=showcase.capabilities;
    if(caps){
      var lists=[caps.agent||[],caps.data||[]];
      var li,ci;
      for(li=0;li<lists.length;li++){
        for(ci=0;ci<lists[li].length;ci++){
          if(lists[li][ci].id===id) return lists[li][ci];
        }
      }
    }
    var groups=showcase.groups||[];
    for(i=0;i<groups.length;i++){
      if(groups[i].id===id) return groups[i];
      var rules=groups[i].rules||[];
      var ri;
      for(ri=0;ri<rules.length;ri++){
        if(rules[ri].id===id) return rules[ri];
      }
    }
    var scenarios=showcase.scenarios||[];
    for(i=0;i<scenarios.length;i++){
      if(scenarios[i].id===id){
        return {
          id:scenarios[i].id,
          label:scenarios[i].label,
          value:scenarios[i].hint,
          detail:{
            function:scenarios[i].label||'',
            logic:scenarios[i].hint||'',
            data:[]
          }
        };
      }
    }
    var badges=showcase.badges||[];
    for(i=0;i<badges.length;i++){
      if(badges[i].id===id) return badges[i];
    }
    var chips=showcase.chips||[];
    for(i=0;i<chips.length;i++){
      if(chips[i].id===id) return chips[i];
    }
    var all=showcase.allChips||[];
    for(i=0;i<all.length;i++){
      if(all[i].id===id) return all[i];
    }
    var padUi=global.OneToneCodexMicroPadUi;
    if(padUi&&padUi.cellByMicroId&&padUi.cellByMicroId(id)){
      var cell=padUi.cellByMicroId(id);
      var lbl=padUi.humanMicroKeyLabel?padUi.humanMicroKeyLabel(id):(cell.uiLabelZh||id);
      return {
        id:id,
        label:lbl,
        value:cell.defaultSlotId||cell.kind||'',
        detail:{
          function:cell.uiLabelZh||lbl,
          logic:t('homeWbHeroPaneKeyLogic','映射到 Agent 动作槽'),
          data:[{lbl:t('homeWbHeroPaneKeySlot','槽位'),val:cell.defaultSlotId||'—'}]
        }
      };
    }
    return null;
  }

  function camGroupForRule(ruleId,groups){
    if(!ruleId||!groups) return '';
    var gi,ri,g,r;
    for(gi=0;gi<groups.length;gi++){
      g=groups[gi];
      for(ri=0;ri<(g.rules||[]).length;ri++){
        r=g.rules[ri];
        if(r.id===ruleId) return g.id;
      }
    }
    return '';
  }

  function activeCamDimId(sel,showcase){
    var groups=showcase&&showcase.groups||[];
    if(sel){
      var fromRule=camGroupForRule(sel,groups);
      if(fromRule) return fromRule;
      var gi;
      for(gi=0;gi<groups.length;gi++){
        if(groups[gi].id===sel) return groups[gi].id;
      }
    }
    return 'gesture';
  }

  function ensureDefaultHeroSelection(projection){
    var showcase=projection&&projection.showcase;
    if(!showcase) return;
    var mode=projection.mode||heroMode;
    if(heroExpandedNodeId&&findShowcaseItem(showcase,heroExpandedNodeId)){
      if(mode==='softPad') heroPaneTab=heroPaneTabForSoftPadSel(showcase,heroExpandedNodeId);
      return;
    }
    var api=global.OneToneHomeHeroModeModel;
    var token=String((projection.status&&projection.status.token)||'idle');
    heroExpandedNodeId=api&&typeof api.defaultShowcaseSelId==='function'
      ?api.defaultShowcaseSelId(mode,showcase,token)
      :'';
    if(mode==='softPad') heroPaneTab=heroPaneTabForSoftPadSel(showcase,heroExpandedNodeId);
  }

  function heroPaneTabForSoftPadSel(showcase,sel){
    var pk=softPadPanelKey(showcase,sel);
    if(pk==='keys') return 'kbd';
    if(pk==='scenario') return 'status';
    return 'cap';
  }

  function heroChannelLabel(mode){
    if(mode==='keys') return t('homeWbChannelKeys');
    if(mode==='softPad') return t('homeWbChannelSoftPad');
    if(mode==='camera') return t('homeWbChannelCamera');
    return t('homeWbChannelVoice');
  }

  function heroPaneTitleHtml(item,showcase,schema){
    if(!item) return '';
    var title=item.label||item.trigger||'';
    var val=item.value||item.summary||item.scene||'';
    if(schema==='multimodal'&&item.trigger){
      title=item.trigger;
      val=item.action||item.scene||'';
    }
    var html='<div class="wb-hero-pane-card"><p class="wb-hero-pane-title">'+esc(title)+'</p>';
    if(val) html+='<p class="wb-hero-pane-val">'+esc(val)+'</p>';
    if(item.detail) html+=heroPaneFactsHtml(item.detail);
    html+='</div>';
    return html;
  }

  function heroPaneFactsHtml(detail){
    if(!detail) return '';
    var rows='<div class="wb-hero-pane-fact"><dt>'+esc(t('homeWbShowcaseFn'))+'</dt><dd>'+esc(detail.function||'')+'</dd></div>'
      +'<div class="wb-hero-pane-fact"><dt>'+esc(t('homeWbShowcaseLogic'))+'</dt><dd>'+esc(detail.logic||'')+'</dd></div>';
    if(detail.data&&detail.data.length){
      detail.data.forEach(function(row){
        rows+='<div class="wb-hero-pane-fact"><dt>'+esc(row.lbl)+'</dt><dd>'+esc(row.val)+'</dd></div>';
      });
    }
    return '<dl class="wb-hero-pane-facts">'+rows+'</dl>';
  }

  function softPadCapList(showcase){
    var caps=showcase.capabilities||{};
    return (caps.agent||[]).concat(caps.data||[]);
  }

  function softPadPanelKey(showcase,sel){
    var padUi=global.OneToneCodexMicroPadUi;
    if(padUi&&padUi.cellByMicroId&&padUi.cellByMicroId(sel)) return 'keys';
    if(['standby','confirm','done'].indexOf(sel)>=0) return 'scenario';
    var caps=softPadCapList(showcase);
    var i;
    for(i=0;i<caps.length;i++){
      if(caps[i].id===sel){
        var dataCaps=(showcase.capabilities&&showcase.capabilities.data)||[];
        var di;
        for(di=0;di<dataCaps.length;di++){
          if(dataCaps[di].id===sel) return 'data';
        }
        return 'agent';
      }
    }
    return 'agent';
  }

  function softPadNodeLabel(showcase,sel){
    var item=findShowcaseItem(showcase,sel);
    if(item&&item.label) return item.label;
    return sel||'';
  }

  function softPadNodeVal(showcase,sel){
    var item=findShowcaseItem(showcase,sel);
    if(item){
      if(item.value) return item.value;
      if(item.sub) return item.sub;
      if(item.summary) return item.summary;
    }
    return '—';
  }

  function softPadActiveScenarioHint(showcase){
    var scenarios=showcase.scenarios||[];
    var i;
    for(i=0;i<scenarios.length;i++){
      if(scenarios[i].state==='active') return scenarios[i].hint||scenarios[i].label||'—';
    }
    return showcase.focus||'—';
  }

  function heroPaneCrumbHtml(mode,showcase,sel){
    if(!sel) return '';
    var parts=[heroChannelLabel(mode)];
    var schema=showcase.schema||'';
    if(schema==='multimodal'){
      var gid=activeCamDimId(sel,showcase);
      var groups=showcase.groups||[];
      var g=null,gi;
      for(gi=0;gi<groups.length;gi++){
        if(groups[gi].id===gid){ g=groups[gi]; break; }
      }
      if(g){
        parts.push(g.label||'');
        var rules=g.rules||[],ri;
        for(ri=0;ri<rules.length;ri++){
          if(rules[ri].id===sel){ parts.push(rules[ri].trigger||''); break; }
        }
      }
    }else if(schema==='outline'){
      var padUi=global.OneToneCodexMicroPadUi;
      if(padUi&&padUi.cellByMicroId&&padUi.cellByMicroId(sel)){
        parts.push(t('homeWbHeroPaneCrumbKbd','键盘'));
        parts.push(softPadNodeLabel(showcase,sel));
      }else if(['standby','confirm','done'].indexOf(sel)>=0){
        parts.push(t('homeWbHeroPaneCrumbScenario','场景'));
        parts.push(softPadNodeLabel(showcase,sel));
      }else{
        parts.push(softPadNodeLabel(showcase,sel));
      }
    }else{
      var node=findShowcaseItem(showcase,sel);
      if(node&&(node.label||node.trigger)) parts.push(node.label||node.trigger);
    }
    return '<p class="wb-hero-crumb">'+parts.map(function(p,i){
      return (i?'<i aria-hidden="true">›</i>':'')+(i===parts.length-1?'<em>'+esc(p)+'</em>':esc(p));
    }).join('')+'</p>';
  }

  function paintSoftPadPaneCap(showcase,sel){
    var caps=softPadCapList(showcase);
    var selected=null, i;
    for(i=0;i<caps.length;i++){
      if(caps[i].id===sel){ selected=caps[i]; break; }
    }
    if(selected){
      var detail=selected.detail;
      var others=[];
      for(i=0;i<caps.length;i++){
        if(caps[i].id!==selected.id) others.push(caps[i]);
      }
      var related='<p class="wb-hero-related-lbl">'+esc(t('homeWbHeroPaneRelatedLbl','其他能力'))+'</p>'
        +'<div class="wb-hero-related-list">'+others.map(function(c){
          return '<button type="button" class="wb-hero-related-row" data-node-id="'+esc(c.id)+'"><b>'+esc(c.label)+'</b><span>'+esc(c.value||'—')+'</span></button>';
        }).join('')+'</div>';
      return '<div class="wb-hero-pane-card"><p class="wb-hero-pane-title">'+esc(selected.label)+'</p>'
        +'<p class="wb-hero-pane-val">'+esc(selected.value||'—')+'</p>'
        +'<dl class="wb-hero-pane-facts">'
        +'<div class="wb-hero-pane-fact"><dt>'+esc(t('homeWbShowcaseLogic'))+'</dt><dd>'+esc(detail?detail.logic:selected.sub||'')+'</dd></div>'
        +'<div class="wb-hero-pane-fact"><dt>'+esc(t('homeWbHeroPaneDataCur','当前'))+'</dt><dd>'+esc(selected.value||'—')+'</dd></div>'
        +'</dl></div>'+related;
    }
    return '<div class="wb-hero-cap-card-list">'+caps.map(function(c){
      return '<button type="button" class="wb-hero-cap-card'+(heroExpandedNodeId===c.id?' is-sel':'')+'" data-node-id="'+esc(c.id)+'">'
        +'<span class="wb-hero-cap-card-hd"><b>'+esc(c.label)+'</b><s>'+esc(c.sub||'')+'</s></span>'
        +'<span class="wb-hero-cap-card-badge">'+esc(c.value||'—')+'</span></button>';
    }).join('')+'</div>';
  }

  function paintSoftPadPaneKbd(showcase,sel){
    var padUi=global.OneToneCodexMicroPadUi;
    var cells=(padUi&&padUi.LAYOUT&&padUi.LAYOUT.cells)||[];
    var detailTop='';
    var cell=padUi&&padUi.cellByMicroId?padUi.cellByMicroId(sel):null;
    if(cell){
      var item=findShowcaseItem(showcase,sel);
      var detail=item&&item.detail?item.detail:null;
      var lbl=padUi.humanMicroKeyLabel?padUi.humanMicroKeyLabel(sel):(cell.uiLabelZh||sel);
      detailTop='<div class="wb-hero-pane-card wb-hero-pane-card--kbd-detail"><p class="wb-hero-pane-title">'+esc(lbl)+'</p>'
        +'<p class="wb-hero-pane-val">'+esc(cell.defaultSlotId||cell.kind||'—')+'</p>'
        +'<dl class="wb-hero-pane-facts">'
        +'<div class="wb-hero-pane-fact"><dt>'+esc(t('homeWbShowcaseFn'))+'</dt><dd>'+esc(detail?detail.function:(cell.uiLabelZh||lbl))+'</dd></div>'
        +'<div class="wb-hero-pane-fact"><dt>'+esc(t('homeWbShowcaseLogic'))+'</dt><dd>'+esc(detail?detail.logic:t('homeWbHeroPaneKeyLogic','映射到 Agent 动作槽'))+'</dd></div>'
        +'</dl></div>';
    }
    var hotKeys={ACT10:1,AG04:1,ACT08:1};
    var list='<div class="wb-hero-kbd-list">'+cells.map(function(c){
      if(!c||!c.microKeyId) return '';
      var lbl=padUi.humanMicroKeyLabel?padUi.humanMicroKeyLabel(c.microKeyId):c.microKeyId;
      var sub=c.defaultSlotId||c.kind||'';
      var cls='wb-hero-kbd-list-item'+(sel===c.microKeyId?' is-sel':'')+(hotKeys[c.microKeyId]?' is-hot':'');
      return '<button type="button" class="'+cls+'" data-node-id="'+esc(c.microKeyId)+'"><b>'+esc(lbl)+'</b><span>'+esc(sub)+'</span></button>';
    }).join('')+'</div>';
    return detailTop+list;
  }

  function paintSoftPadPaneStatus(showcase,projection){
    var isLive=!!(showcase.isLive&&showcase.deviceReady);
    var caps=(showcase.capabilities&&showcase.capabilities.agent)||[];
    var statusCap=null, i;
    for(i=0;i<caps.length;i++){
      if(caps[i].id==='status'){ statusCap=caps[i]; break; }
    }
    var bindCap=null;
    for(i=0;i<caps.length;i++){
      if(caps[i].id==='bind'){ bindCap=caps[i]; break; }
    }
    var lightLbl=isLive?t('homeWbHeroPaneStatusWorking','工作中'):t('homeWbHeroPaneStatusStandby','待命');
    var lightNext=isLive?t('homeWbHeroPaneStatusResponding','正在响应'):t('homeWbHeroPaneStatusWaiting','等待指令');
    return '<div class="wb-hero-status-grid">'
      +'<div class="wb-hero-status-card"><p class="wb-hero-status-card-lbl">'+esc(t('homeWbHeroPaneStatusScenario','当前场景'))+'</p>'
      +'<p class="wb-hero-status-card-val">'+esc(showcase.focus||'—')+'</p>'
      +'<p class="wb-hero-status-card-next">→ '+esc(softPadActiveScenarioHint(showcase))+'</p></div>'
      +'<div class="wb-hero-status-card"><p class="wb-hero-status-card-lbl">'+esc(t('homeWbHeroPaneStatusAgent','Agent 状态'))+'</p>'
      +'<p class="wb-hero-status-card-val">'+esc(isLive?t('homeWbHeroPaneStatusRunning','运行中'):t('homeWbHeroPaneStatusIdle','空闲'))+'</p>'
      +'<p class="wb-hero-status-card-next">'+esc(statusCap?statusCap.value:'—')+'</p></div>'
      +'<div class="wb-hero-status-card"><p class="wb-hero-status-card-lbl">'+esc(t('homeWbHeroPaneStatusLight','信号灯'))+'</p>'
      +'<p class="wb-hero-status-card-val"><span class="wb-hero-status-light'+(isLive?' is-on':'')+'"><i aria-hidden="true"></i>'+esc(lightLbl)+'</span></p>'
      +'<p class="wb-hero-status-card-next">'+esc(lightNext)+'</p></div>'
      +'<div class="wb-hero-status-card"><p class="wb-hero-status-card-lbl">'+esc(t('homeWbHeroPaneStatusForeground','前台应用'))+'</p>'
      +'<p class="wb-hero-status-card-val">'+esc(showcase.context||'—')+'</p>'
      +'<p class="wb-hero-status-card-next">'+esc(bindCap?bindCap.value:'—')+'</p></div>'
      +'</div>';
  }

  function paintSoftPadPaneHistory(){
    return '<div class="wb-hero-history-list">'
      +'<div class="wb-hero-status-card"><p class="wb-hero-status-card-lbl">'+esc(t('homeWbHeroPaneHistoryMonth','本月用量'))+'</p>'
      +'<p class="wb-hero-status-card-val">—</p><p class="wb-hero-status-card-next">'+esc(t('homeWbHeroPaneHistoryPlaceholder','用量统计即将上线'))+'</p></div>'
      +'<div class="wb-hero-status-card"><p class="wb-hero-status-card-lbl">'+esc(t('homeWbHeroPaneHistoryWeek','本周用量'))+'</p>'
      +'<p class="wb-hero-status-card-val">—</p></div>'
      +'<div class="wb-hero-status-card"><p class="wb-hero-status-card-lbl">'+esc(t('homeWbHeroPaneHistoryToday','今日活动'))+'</p>'
      +'<p class="wb-hero-status-card-next">'+esc(t('homeWbHeroPaneHistoryPlaceholder','用量统计即将上线'))+'</p></div>'
      +'</div>';
  }

  function paintSoftPadPane(showcase,sel,projection){
    var tab=heroPaneTab||'cap';
    if(['cap','kbd','status','history'].indexOf(tab)<0) tab='cap';
    var tabs=[
      {id:'cap',lbl:t('homeWbHeroPaneTabCap','能力')},
      {id:'kbd',lbl:t('homeWbHeroPaneTabKbd','键盘')},
      {id:'status',lbl:t('homeWbHeroPaneTabStatus','状态')},
      {id:'history',lbl:t('homeWbHeroPaneTabHistory','历史')}
    ];
    var activeLbl=tabs[0].lbl, ti;
    for(ti=0;ti<tabs.length;ti++){
      if(tabs[ti].id===tab){ activeLbl=tabs[ti].lbl; break; }
    }
    var target=showcase.context||'—';
    var header='<p class="wb-hero-pane-header">'+esc(t('homeWbHeroPaneHeaderWrite','写入'))+' <em>'+esc(target)+'</em> <i aria-hidden="true">›</i> <em>'+esc(activeLbl)+'</em></p>';
    var tabBar='<div class="wb-hero-pane-tabs" role="tablist">'+tabs.map(function(ti){
      return '<button type="button" class="wb-hero-pane-tab'+(ti.id===tab?' is-on':'')+'" data-pane-tab="'+esc(ti.id)+'" role="tab">'+esc(ti.lbl)+'</button>';
    }).join('')+'</div>';
    var content='';
    if(tab==='cap') content=paintSoftPadPaneCap(showcase,sel);
    else if(tab==='kbd') content=paintSoftPadPaneKbd(showcase,sel);
    else if(tab==='status') content=paintSoftPadPaneStatus(showcase,projection);
    else content=paintSoftPadPaneHistory();
    return '<div class="wb-hero-pane-container">'+header+tabBar+'<div class="wb-hero-pane-tab-body">'+content+'</div></div>';
  }

  function cameraStatusGridHtml(showcase,projection,sel){
    var badges=showcase.badges||[];
    var runBadge=badges[0];
    var presBadge=badges[1];
    var groups=showcase.groups||[];
    var gid=activeCamDimId(sel,showcase);
    var dimBound=0, dimSlots=0, totalBound=0, gi, ri, g, r;
    for(gi=0;gi<groups.length;gi++){
      g=groups[gi];
      dimSlots=g.slotCount||(g.rules||[]).length;
      if(g.id===gid){ /* use this group's slot count below */ }
      for(ri=0;ri<(g.rules||[]).length;ri++){
        r=g.rules[ri];
        if(r.configured){
          totalBound++;
          if(g.id===gid) dimBound++;
        }
      }
    }
    var activeG=null;
    for(gi=0;gi<groups.length;gi++){
      if(groups[gi].id===gid){ activeG=groups[gi]; break; }
    }
    dimSlots=activeG?(activeG.slotCount||(activeG.rules||[]).length):0;
    var token=String((projection&&projection.status&&projection.status.token)||'idle');
    var lastTrig=t('homeWbCamStatusNone','无');
    if(token==='triggered'){
      for(gi=0;gi<groups.length;gi++){
        for(ri=0;ri<(groups[gi].rules||[]).length;ri++){
          r=groups[gi].rules[ri];
          if(r.configured&&r.active){ lastTrig=r.trigger||'—'; break; }
        }
      }
    }
    var runVal=runBadge?(runBadge.label||'—'):'—';
    var presVal=presBadge?(presBadge.label||'—'):t('homeWbCamStatusDetecting','检测中');
    return '<div class="wb-hero-status-grid wb-hero-cam-status-grid">'
      +'<div class="wb-hero-status-card"><p class="wb-hero-status-card-lbl">'+esc(t('homeWbCamStatusRun','运行状态'))+'</p>'
      +'<p class="wb-hero-status-card-val">'+esc(runVal)+'</p></div>'
      +'<div class="wb-hero-status-card"><p class="wb-hero-status-card-lbl">'+esc(t('homeWbCamStatusPresence','在座状态'))+'</p>'
      +'<p class="wb-hero-status-card-val">'+esc(presVal)+'</p></div>'
      +'<div class="wb-hero-status-card"><p class="wb-hero-status-card-lbl">'+esc(t('homeWbCamStatusRules','已启用规则'))+'</p>'
      +'<p class="wb-hero-status-card-val">'+esc(dimBound+' / '+dimSlots)+'</p></div>'
      +'<div class="wb-hero-status-card"><p class="wb-hero-status-card-lbl">'+esc(t('homeWbCamStatusLastTrig','最近触发'))+'</p>'
      +'<p class="wb-hero-status-card-val">'+esc(lastTrig)+'</p></div>'
      +'</div>';
  }

  function paintHeroMark(visualEl,mode,live){
    if(!visualEl) return;
    var mark=visualEl.querySelector('.wb-hero-mark');
    if(!mark){
      visualEl.innerHTML='<button type="button" class="wb-hero-mark"></button>';
      mark=visualEl.querySelector('.wb-hero-mark');
      if(mark&&!mark._wbSettingsBound){
        mark._wbSettingsBound=true;
        mark.onclick=function(e){
          e.preventDefault();
          openHeroSettings();
        };
      }
    }
    var orb=$('wbHeroOrb');
    var label=orb&&orb.getAttribute('aria-label');
    if(label) mark.setAttribute('aria-label',label);
    mark.innerHTML=heroModeIconSvg(mode);
    mark.classList.toggle('is-live',!!live);
  }

  function paintShowcaseVisual(visualEl,showcase,projection){
    if(!visualEl||!showcase||!projection) return;
    var mode=projection.mode||'voice';
    var live=!!(showcase.isLive&&showcase.deviceReady);
    paintHeroMark(visualEl,mode,live);
  }

  function paintLinearShowcaseLogic(logicEl,showcase,projection,opts){
    opts=opts||{};
    var nodes=showcase.nodes||[];
    var mode=projection.mode||'voice';
    var twoCol=nodes.length===2;
    var kind='linear-desk:'+nodes.length;
    if(showcaseShellKind!==kind){
      showcaseShellKind=kind;
      var viewW=twoCol?500:1000;
      var pathD=twoCol
        ?'M 0,4 Q 125,-5 250,4 T 500,4'
        :'M 0,4 Q 250,-5 500,4 T 1000,4';
      var gradId='wbHeroFlowGrad'+nodes.length;
      logicEl.innerHTML='<p class="wb-hero-schema-lbl">'+esc(t('homeWbHeroFlowLbl'))+'</p>'
        +'<section class="flow-nodes wb-hero-flow-desk'+(twoCol?' is-two-col':'')+'" role="list">'
        +'<div class="flow-nodes-track" aria-hidden="true">'
        +'<svg class="flow-nodes-svg" viewBox="0 0 '+viewW+' 8" fill="none" preserveAspectRatio="none">'
        +'<defs><linearGradient id="'+gradId+'" x1="0%" y1="0%" x2="100%" y2="0%">'
        +'<stop offset="0%" stop-color="rgba(79, 172, 254, 0.85)"/>'
        +'<stop offset="50%" stop-color="rgba(42, 156, 196, 0.95)"/>'
        +'<stop offset="100%" stop-color="rgba(245, 158, 11, 0.85)"/>'
        +'</linearGradient></defs>'
        +'<path class="flow-nodes-path-base" d="'+pathD+'" stroke="currentColor" stroke-width="4" stroke-linecap="round"/>'
        +'<path class="flow-nodes-path" d="'+pathD+'" stroke="url(#'+gradId+')" stroke-width="3" stroke-linecap="round"/>'
        +'</svg></div>'
        +'<div class="flow-nodes-grid'+(twoCol?' flow-nodes-grid--two':'')+'"></div>'
        +'</section>';
    }
    var desk=logicEl.querySelector('.wb-hero-flow-desk');
    if(!desk) return;
    var grid=desk.querySelector('.flow-nodes-grid');
    var existing=grid?grid.querySelectorAll('.flow-node'):[];
    if(!grid||existing.length!==nodes.length){
      if(grid) grid.innerHTML='';
      nodes.forEach(function(node,idx){
        if(!grid) return;
        grid.insertAdjacentHTML('beforeend',
          '<div class="flow-node" data-node-id="'+esc(node.id)+'">'
          +'<span class="flow-node-tag">'+esc(heroFlowNodeTag(idx,node.label))+'</span>'
          +'<button type="button" class="flow-node-btn" data-node-id="'+esc(node.id)+'">'
          +heroFlowNodeIcon(mode,node.id)
          +'</button>'
          +'<h3 class="flow-node-title">'+esc(node.label||'')+'</h3>'
          +'<p class="flow-node-hint">'+esc(node.summary||'')+'</p>'
          +'</div>');
      });
      existing=grid.querySelectorAll('.flow-node');
    }
    var muted=!showcase.deviceReady;
    var live=!!(showcase.isLive&&showcase.deviceReady);
    var pathTarget=Math.max(0,Math.min(100,Number(showcase.pathPct)||0));
    var pathEl=desk.querySelector('.flow-nodes-path');
    var token=String((projection.status&&projection.status.token)||'idle');
    var animKey=(projection.mode||'')+':'+token+':'+pathTarget;
    if(pathEl){
      var dashLen=1000;
      var offset=dashLen-(pathTarget/100)*dashLen;
      if(!opts.skipPathAnim&&animKey!==lastShowcasePathKey){
        pathEl.style.transition='none';
        pathEl.style.strokeDasharray=String(dashLen);
        pathEl.style.strokeDashoffset=String(dashLen);
        try{ void pathEl.getBBox(); }catch(_){}
        pathEl.style.transition='';
        requestAnimationFrame(function(){
          pathEl.style.strokeDashoffset=String(offset);
        });
      }else{
        pathEl.style.strokeDasharray=String(dashLen);
        pathEl.style.strokeDashoffset=String(offset);
      }
    }
    nodes.forEach(function(node,idx){
      var el=existing[idx];
      if(!el) return;
      el.setAttribute('data-node-id',node.id);
      var btn=el.querySelector('.flow-node-btn');
      var title=el.querySelector('.flow-node-title');
      var hint=el.querySelector('.flow-node-hint');
      var tag=el.querySelector('.flow-node-tag');
      if(tag) tag.textContent=heroFlowNodeTag(idx,node.label);
      if(title) title.textContent=node.label||'';
      if(hint) hint.textContent=node.summary||'';
      if(btn){
        btn.setAttribute('data-node-id',node.id);
        btn.classList.toggle('is-active',node.state==='active');
        btn.classList.toggle('is-recording',!!node.live&&live);
        btn.classList.toggle('is-selected',heroExpandedNodeId===node.id);
        btn.disabled=!!muted;
      }
      el.classList.toggle('is-done',node.state==='done');
      el.classList.toggle('is-muted',muted);
      el.classList.toggle('is-selected',heroExpandedNodeId===node.id);
      if(!opts.skipPathAnim&&node.state==='active'&&animKey!==lastShowcasePathKey){
        if(btn){
          btn.classList.add('is-pop');
          setTimeout(function(){ btn.classList.remove('is-pop'); },400);
        }
      }
    });
  }

  function paintSoftPadValueStrip(stripEl,showcase){
    if(!stripEl) return;
    var dataCaps=(showcase.capabilities&&showcase.capabilities.data)||[];
    var btns=stripEl.querySelectorAll('.wb-hero-kbd-chip');
    if(btns.length!==dataCaps.length){
      stripEl.innerHTML=dataCaps.map(function(c){
        return '<button type="button" class="wb-hero-kbd-chip" data-node-id="'+esc(c.id)+'">'
          +'<i aria-hidden="true"></i><b>'+esc(c.label||'')+'</b>'
          +'<span class="wb-hero-kbd-value-v">'+esc(c.value||'—')+'</span></button>';
      }).join('');
      btns=stripEl.querySelectorAll('.wb-hero-kbd-chip');
    }
    dataCaps.forEach(function(c,idx){
      var el=btns[idx];
      if(!el) return;
      el.classList.toggle('is-sel',heroExpandedNodeId===c.id);
      var val=el.querySelector('.wb-hero-kbd-value-v');
      if(val) val.textContent=c.value||'—';
    });
  }

  function paintSoftPadOutline(logicEl,showcase,projection){
    var scenarios=showcase.scenarios||[];
    var kind='outline-v2:'+scenarios.length;
    if(showcaseShellKind!==kind){
      showcaseShellKind=kind;
      logicEl.innerHTML='<p class="wb-hero-schema-lbl">'+esc(t('homeWbHeroSpNavLbl'))+'</p>'
        +'<div class="wb-hero-kbd-panel">'
        +'<div class="wb-hero-kbd-strip-status wb-hero-sp-scenario-strip" role="list"></div>'
        +'<div id="wbHeroPadPreview" class="wb-hero-pad-preview-host"></div>'
        +'<div class="wb-hero-kbd-strip-value" role="list"></div>'
        +'</div>';
    }
    var strip=logicEl.querySelector('.wb-hero-kbd-strip-status');
    if(strip){
      var scenBtns=strip.querySelectorAll('.wb-hero-sp-scenario-chip');
      if(scenBtns.length!==scenarios.length){
        strip.innerHTML=scenarios.map(function(s){
          return '<button type="button" class="wb-hero-sp-scenario-chip wb-hero-kbd-chip" data-node-id="'+esc(s.id)+'"><i aria-hidden="true"></i><b>'+esc(s.label)+'</b></button>';
        }).join('');
        scenBtns=strip.querySelectorAll('.wb-hero-sp-scenario-chip');
      }
      scenarios.forEach(function(s,idx){
        var el=scenBtns[idx];
        if(!el) return;
        el.classList.toggle('is-cur',s.state==='active');
        el.classList.toggle('is-done',s.state==='done');
        el.classList.toggle('is-sel',heroExpandedNodeId===s.id);
      });
    }
    paintSoftPadValueStrip(logicEl.querySelector('.wb-hero-kbd-strip-value'),showcase);
    var padHost=logicEl.querySelector('#wbHeroPadPreview');
    var padUi=global.OneToneCodexMicroPadUi;
    if(padHost&&padUi&&typeof padUi.renderHeroPadPreviewGrid==='function'){
      padUi.renderHeroPadPreviewGrid(padHost,{
        mapping:currentHabitMapping(),
        selId:heroExpandedNodeId,
        hotMicroKeyId:showcase.hotMicroKeyId||'',
        live:!!(showcase.isLive&&showcase.deviceReady),
        voiceHint:heroPadVoiceHint(projection,showcase)
      });
    }
  }

  function paintCameraVisMetaBadges(visMeta,showcase){
    if(!visMeta) return;
    var badgesEl=visMeta.querySelector('.wb-hero-cam-badges');
    if(!showcase||showcase.schema!=='multimodal'){
      if(badgesEl) badgesEl.remove();
      return;
    }
    var badges=showcase.badges||[];
    if(!badgesEl){
      badgesEl=document.createElement('div');
      badgesEl.className='wb-hero-cam-badges';
      visMeta.appendChild(badgesEl);
    }
    badgesEl.innerHTML=badges.map(function(b){
      var cls='wb-hero-cam-badge is-readonly';
      if(b.active&&showcase.deviceReady) cls+=' is-active';
      if(b.tone==='is-present') cls+=' is-present';
      return '<span class="'+cls+'">'+esc(b.label||'')+'</span>';
    }).join('');
  }

  function paintCameraMultimodal(logicEl,showcase,projection){
    var groups=showcase.groups||[];
    var dimId=activeCamDimId(heroExpandedNodeId,showcase);
    var live=!!(showcase.isLive&&showcase.deviceReady);
    var kind='multimodal:'+groups.length+':'+dimId;
    if(showcaseShellKind!==kind){
      showcaseShellKind=kind;
      logicEl.innerHTML='<p class="wb-hero-schema-lbl">'+esc(t('homeWbCamDimNavLbl','识别维度'))+'</p>'
        +'<div class="wb-hero-cam-dim-row"></div><div class="wb-hero-cam-scene-zone"></div>';
    }
    var dimEl=logicEl.querySelector('.wb-hero-cam-dim-row');
    if(dimEl){
      var dimBtns=dimEl.querySelectorAll('.wb-hero-cam-dim');
      if(dimBtns.length!==groups.length){
        dimEl.innerHTML=groups.map(function(g){
          return '<button type="button" class="wb-hero-cam-dim" data-node-id="'+esc(g.id)+'">'
            +'<b>'+esc(g.label||g.id)+'</b><s>'+esc(g.sub||'')+'</s></button>';
        }).join('');
        dimBtns=dimEl.querySelectorAll('.wb-hero-cam-dim');
      }
      groups.forEach(function(g,idx){
        var el=dimBtns[idx];
        if(!el) return;
        var bound=g.boundCount||0;
        var on=live&&g.rules&&g.rules.some(function(r){ return r.configured&&r.active; });
        el.classList.toggle('is-sel',dimId===g.id||heroExpandedNodeId===g.id);
        el.classList.toggle('is-selected',dimId===g.id||heroExpandedNodeId===g.id);
        el.classList.toggle('is-on',on);
        el.classList.toggle('is-dim-idle',bound===0);
      });
    }
    var zoneEl=logicEl.querySelector('.wb-hero-cam-scene-zone');
    if(zoneEl){
      var g=null,gi;
      for(gi=0;gi<groups.length;gi++){
        if(groups[gi].id===dimId){ g=groups[gi]; break; }
      }
      var rules=g?g.rules||[]:[];
      var sceneBtns=zoneEl.querySelectorAll('.wb-hero-cam-scene-node');
      if(sceneBtns.length!==rules.length){
        zoneEl.innerHTML=rules.map(function(r){
          var sub=r.configured?(r.scene||r.action||''):t('homeWbCamRuleUnbound','未绑定');
          return '<button type="button" class="wb-hero-cam-scene-node'+(r.configured?'':' is-unbound')+'" data-node-id="'+esc(r.id)+'"><b>'+esc(r.trigger||'')+'</b><span>'+esc(sub)+'</span></button>';
        }).join('');
        sceneBtns=zoneEl.querySelectorAll('.wb-hero-cam-scene-node');
      }
      var flashId='';
      var token=String((projection.status&&projection.status.token)||'idle');
      if(token==='triggered'&&rules.length){
        var ri;
        for(ri=0;ri<rules.length;ri++){
          if(rules[ri].active){ flashId=rules[ri].id; break; }
        }
      }
      rules.forEach(function(r,idx){
        var el=sceneBtns[idx];
        if(!el) return;
        var on=live&&r.configured&&r.active;
        el.classList.toggle('is-on',on);
        el.classList.toggle('is-off',r.configured&&!on);
        el.classList.toggle('is-unbound',!r.configured);
        el.classList.toggle('is-live',flashId===r.id);
        el.classList.toggle('is-sel',heroExpandedNodeId===r.id);
        el.classList.toggle('is-selected',heroExpandedNodeId===r.id);
        el.disabled=false;
      });
    }
  }

  function paintHeroPane(projection,opts){
    opts=opts||{};
    var paneEl=$('wbHeroPane');
    if(!paneEl) return;
    var showcase=projection&&projection.showcase;
    if(!showcase){ paneEl.innerHTML=''; return; }
    var schema=showcase.schema||'linear-prod';
    var mode=projection.mode||heroMode;
    var sel=heroExpandedNodeId;
    var item=sel?findShowcaseItem(showcase,sel):null;
    var crumb=sel&&schema!=='outline'?heroPaneCrumbHtml(mode,showcase,sel):'';
    var card='';
    var statusGrid='';

    if(schema==='multimodal'){
      statusGrid=cameraStatusGridHtml(showcase,projection,sel);
      var gid=activeCamDimId(sel,showcase);
      var groups=showcase.groups||[];
      var g=null;
      var gi;
      for(gi=0;gi<groups.length;gi++){
        if(groups[gi].id===gid){ g=groups[gi]; break; }
      }
      if(item&&item.trigger){
        var actionVal=item.configured?(item.action||''):t('homeWbCamRuleUnbound','未绑定');
        card='<div class="wb-hero-pane-card'+(item.configured?'':' is-unbound')+'"><p class="wb-hero-pane-title">'+esc(item.trigger)+'</p>';
        if(item.configured){
          card+='<div class="wb-hero-cam-rule-card"><div class="wb-hero-cam-rule-flow"><span>'+esc(item.trigger)+'</span>'
            +'<span class="wb-hero-cam-rule-arr" aria-hidden="true">→</span><span>'+esc(item.action||'')+'</span></div>'
            +'<p class="wb-hero-cam-rule-scene">'+esc(t('homeWbCamRuleScene'))+' · '+esc(item.scene||item.action||'')+'</p></div>';
        }else{
          card+='<p class="wb-hero-pane-val">'+esc(actionVal)+'</p>'
            +'<p class="wb-hero-pane-note">'+esc(t('homeWbCamRuleUnboundHint','在 Camera Pro 设置中绑定动作'))+'</p>'
            +'<p class="wb-hero-cam-rule-scene">'+esc(t('homeWbCamRuleScene'))+' · '+esc(item.scene||'')+'</p>';
        }
        card+=(g?'<p class="wb-hero-pane-note">'+esc(g.logic||'')+'</p>':'')+'</div>';
      }else if(item&&item.detail&&!item.trigger&&!item.rules){
        card=heroPaneTitleHtml(item,showcase,schema);
      }else if(g){
        card='<div class="wb-hero-pane-card"><p class="wb-hero-pane-title">'+esc(g.label||'')+'</p>'
          +'<p class="wb-hero-pane-val">'+esc(g.sub||'')+'</p>'
          +(g.fn?'<p class="wb-hero-pane-note">'+esc(g.fn)+'</p>':'')
          +'<div class="wb-hero-cam-rule-list">'+((g.rules||[]).map(function(rule){
            var on=!!(showcase.isLive&&showcase.deviceReady&&rule.configured&&rule.active);
            var span=rule.configured?(rule.action||''):t('homeWbCamRuleUnbound','未绑定');
            return '<button type="button" class="wb-hero-cam-rule-row'+(on?' is-on':' is-off')+(rule.configured?'':' is-unbound')+(heroExpandedNodeId===rule.id?' is-sel':'')+'" data-node-id="'+esc(rule.id)+'"><b>'+esc(rule.trigger||'')+'</b><span>'+esc(span)+'</span></button>';
          }).join(''))+'</div></div>';
      }
    }else if(schema==='outline'){
      card=paintSoftPadPane(showcase,sel,projection);
    }else if(item){
      card=heroPaneTitleHtml(item,showcase,schema);
    }

    paneEl.innerHTML=(statusGrid||'')+(card?crumb+card:'');
  }

  function paintHeroPrimary(projection,opts){
    opts=opts||{};
    var ctxEl=$('wbHeroShowcaseCtx');
    var visBlock=$('wbHeroVisBlock');
    var visualEl=$('wbHeroShowcaseVisual');
    var focusEl=$('wbHeroShowcaseFocus');
    var logicEl=$('wbHeroShowcaseLogic');
    var showcase=projection&&projection.showcase;
    if(!showcase) return;
    var context=showcase.context||'';
    if(ctxEl){
      if(context&&context!==t('homeLiveUnset')&&context!=='—'){
        ctxEl.innerHTML='<em>'+esc(context)+'</em>';
        ctxEl.hidden=false;
      }else{
        ctxEl.hidden=true;
        ctxEl.textContent='';
      }
    }
    var isLive=!!(showcase.isLive&&showcase.deviceReady);
    if(focusEl){
      focusEl.textContent=showcase.focus||'';
      focusEl.classList.toggle('is-live',isLive);
      var token=String((projection.status&&projection.status.token)||'idle');
      var animKey=(projection.mode||'')+':'+token+':'+(showcase.pathPct||0);
      if(!opts.skipFocusBump&&animKey!==lastShowcasePathKey){
        focusEl.classList.remove('is-bump');
        void focusEl.offsetWidth;
        focusEl.classList.add('is-bump');
        setTimeout(function(){ focusEl.classList.remove('is-bump'); },350);
      }
      paintCameraVisMetaBadges(focusEl.parentElement,showcase);
    }
    var mode=projection.mode||'voice';
    if(paintHeroShowcase._lastMode&&paintHeroShowcase._lastMode!==mode){
      showcaseShellKind='';
    }
    paintHeroShowcase._lastMode=mode;
    var schema=showcase.schema||(showcase.kind==='camera'?'multimodal':'linear-prod');
    var hideVisual=showcase.visual==='none';
    if(visBlock){
      visBlock.classList.toggle('is-mark-above-flow',mode==='keys');
    }
    if(visualEl){
      if(hideVisual){
        visualEl.hidden=true;
        visualEl.setAttribute('aria-hidden','true');
        visualEl.innerHTML='';
      }else{
        visualEl.hidden=false;
        visualEl.removeAttribute('aria-hidden');
        paintShowcaseVisual(visualEl,showcase,projection);
      }
    }
    if(logicEl){
      if(schema==='outline'){
        paintSoftPadOutline(logicEl,showcase,projection);
      }else if(schema==='multimodal'){
        paintCameraMultimodal(logicEl,showcase,projection);
      }else{
        paintLinearShowcaseLogic(logicEl,showcase,projection,opts);
      }
    }
  }

  function paintHeroShowcase(projection,opts){
    opts=opts||{};
    var host=$('wbHeroShowcase');
    if(!host) return;
    var showcase=projection&&projection.showcase;
    if(!showcase) return;
    ensureDefaultHeroSelection(projection);
    paintHeroPrimary(projection,opts);
    paintHeroPane(projection,opts);
    var isLive=!!(showcase.isLive&&showcase.deviceReady);
    host.classList.toggle('is-device-ready',!!showcase.deviceReady);
    host.classList.toggle('is-live',isLive);
    host.setAttribute('data-wb-status-token',String((projection.status&&projection.status.token)||'idle'));
    host.setAttribute('data-wb-hero-schema',showcase.schema||'');
    host.setAttribute('data-wb-hero-mode',projection.mode||heroMode);
    var token2=String((projection.status&&projection.status.token)||'idle');
    lastShowcasePathKey=(projection.mode||'')+':'+token2+':'+(showcase.pathPct||0);
  }

  function syncHeroMicCard(projection){
    var hub=$('wbHeroMic');
    var engineBtn=$('wbHeroMicEngine');
    var engineNameEl=$('wbHeroMicEngineName');
    var wakeHintEl=$('wbHeroMicWakeHint');
    var toolbar=$('wbHeroMicToolbar');
    var listenBtn=$('wbBtnListenToggle');
    var voiceSwitch=$('wbHeroVoiceSwitch');
    var voiceCtrl=$('wbHeroVoiceCtrl');
    var statusEl=$('wbHeroMicStatus');
    var hintEl=$('wbHeroMicVoiceHint');
    var mode=projection&&projection.mode?projection.mode:heroMode;
    var vm=projection&&projection._vm?projection._vm:{};
    var paused=!!(vm.runtime&&vm.runtime.paused);
    var dictating=vm.vpState==='DICTATING'||!!(vm.summary&&vm.summary.dictating);
    if(hintEl){ hintEl.textContent=''; hintEl.hidden=true; }
    if(toolbar) toolbar.hidden=mode!=='voice';
    if(engineBtn) engineBtn.hidden=true;
    if(wakeHintEl) wakeHintEl.hidden=true;
    if(listenBtn) listenBtn.hidden=true;
    if(mode==='softPad'||mode==='camera'){
      if(hub){
        hub.hidden=true;
        hub.classList.remove('is-voice-surface','is-dictating');
      }
      if(voiceSwitch) voiceSwitch.hidden=true;
      if(voiceCtrl) voiceCtrl.hidden=true;
      return;
    }
    if(hub) hub.hidden=false;
    if(mode==='keys'){
      if(hub){
        hub.classList.remove('is-voice-surface','is-dictating');
      }
      if(voiceSwitch) voiceSwitch.hidden=true;
      if(voiceCtrl) voiceCtrl.hidden=true;
      var m=vm.m||null;
      var line1=t('homeWbFlowEmptyKeys');
      if(m){
        if(global.OneToneHomeScheme&&global.OneToneHomeScheme.pairLine){
          var pair=global.OneToneHomeScheme.pairLine(m);
          if(pair&&pair!=='—') line1=pair;
        }
        var keysUi=global.OneToneKeysPanelUi;
        if(keysUi&&keysUi.buildKeysStatusProps){
          var kp=keysUi.buildKeysStatusProps(m);
          if(kp&&kp.status&&kp.status!=='—'){
            line1=line1&&line1!==t('homeWbFlowEmptyKeys')?line1+' · '+kp.status:kp.status;
          }
        }
      }
      if(statusEl) statusEl.textContent=line1;
      var keysPills=(projection&&projection.pills)||[];
      var keysListenPill=null;
      keysPills.forEach(function(pill){
        if(pill&&pill.action==='listen-toggle') keysListenPill=pill;
      });
      if(listenBtn&&keysListenPill){
        listenBtn.hidden=false;
        listenBtn.removeAttribute('aria-hidden');
      }
      return;
    }
    if(mode==='voice'){
      if(voiceCtrl) voiceCtrl.hidden=true;
      if(hub){
        hub.classList.toggle('is-voice-surface',true);
        hub.classList.toggle('is-dictating',dictating);
      }
      if(global.OneToneVoiceSurfaceCopy){
        var surface=global.OneToneVoiceSurfaceCopy.resolve({dictating:dictating,paused:paused});
        var line1=surface.line1||'';
        if(statusEl) statusEl.textContent=line1;
        if(voiceSwitch){
          voiceSwitch.classList.toggle('is-on',!!surface.switchOn);
          voiceSwitch.setAttribute('aria-checked',surface.switchOn?'true':'false');
          voiceSwitch.disabled=!!surface.switchDisabled;
          voiceSwitch.setAttribute('aria-label',surface.switchOn?t('voiceSurfaceSwitchOn'):t('voiceSurfaceSwitchOff'));
        }
        if(voiceCtrl) voiceCtrl.hidden=false;
      }
      var pills=(projection&&projection.pills)||[];
      var enginePill=null;
      var micPill=null;
      var listenPill=null;
      pills.forEach(function(pill){
        if(!pill) return;
        if(pill.id==='engine'||pill.id==='engine-off') enginePill=pill;
        else if(pill.id==='mic') micPill=pill;
        else if(pill.action==='listen-toggle') listenPill=pill;
      });
      if(engineBtn){
        var engLbl=enginePill?String(enginePill.label||'').trim():'';
        engineBtn.hidden=!engLbl;
        if(engineNameEl) engineNameEl.textContent=engLbl||'—';
        engineBtn.classList.toggle('is-warn', !!(enginePill&&enginePill.tone&&String(enginePill.tone).indexOf('is-warn')>=0));
        engineBtn.classList.toggle('is-muted', !!(enginePill&&enginePill.tone&&String(enginePill.tone).indexOf('is-muted')>=0));
        // device name lives on engine pill title — skip mic row in #wbHeroPills
        var micTip=micPill?(shortMicLabel(micPill.label)||String(micPill.label||'').trim()):'';
        if(micTip){
          if(global.OneToneHoverTip&&global.OneToneHoverTip.setText){
            global.OneToneHoverTip.setText(engineBtn, micTip);
          }else{
            engineBtn.setAttribute('title', micTip);
          }
        }else{
          engineBtn.removeAttribute('title');
        }
      }
    }
  }

  function renderHeroPills(projection,stats){
    var host=$('wbHeroPills');
    if(!host) return;
    var pills=(projection&&projection.pills)||[];
    var mode=projection&&projection.mode?projection.mode:heroMode;
    var html='';
    var vm=projection&&projection._vm?projection._vm:{};

    if(mode==='camera'||mode==='softPad'){
      syncHeroMicCard(projection);
      var ctaPill=null;
      pills.forEach(function(pill){
        if(!pill) return;
        if(pill.action==='open-camera-settings'||pill.action==='open-softPad-settings') ctaPill=pill;
      });
      if(ctaPill){
        var ctaId=ctaPill.action==='open-camera-settings'?'wbBtnCameraOpen':'wbBtnSoftPadOpen';
        html+='<button type="button" class="wb-hero-pill wb-hero-pill-listen is-solo" id="'+ctaId+'" title="'+esc(ctaPill.label)+'">'
          +'<span>'+esc(ctaPill.label)+'</span></button>';
      }
      host.hidden=!html;
      host.innerHTML=html;
      return;
    }

    // voice / keys: engine + listen live inside #wbHeroMic card
    syncHeroMicCard(projection);
    // device name lives on engine pill title — skip mic row in #wbHeroPills
    pills.forEach(function(pill){
      if(!pill) return;
      if(pill.id==='engine'||pill.id==='engine-off') return;
      if(pill.id==='mic') return;
      if(pill.action==='listen-toggle') return;
      if(pill.id==='trigger-key') return;
    });

    if(stats&&stats.latency&&stats.latency!=='—') html+=pillHtml(stats.latency,'is-latency','');
    host.hidden=!html;
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

  function heroModeHint(mode){
    mode=normalizeHeroMode(mode||heroMode);
    if(mode==='keys') return t('homeWbHeroHintKeys');
    if(mode==='camera') return t('homeWbHeroHintCamera');
    if(mode==='softPad') return t('homeWbHeroHintSoftPad');
    return t('homeWbHeroHintVoice');
  }

  function heroModeIconSvg(mode){
    mode=normalizeHeroMode(mode);
    if(mode==='keys') return KEY_SVG;
    if(mode==='camera') return CAM_SVG;
    if(mode==='softPad') return PAD_SVG;
    return MIC_SVG;
  }

  function renderHeroModeHint(){
    // Preview tip moved to howto section aria/title — do not paint under modes.
    var modes=$('wbHero');
    if(!modes) return;
    var hint=modes.querySelector('.wb-hero-mode-hint');
    if(hint&&hint.parentNode) hint.parentNode.removeChild(hint);
  }

  function syncHowToActive(mode){
    mode=normalizeHeroMode(mode||heroMode);
    var host=$('wbHowTo');
    if(!host) return;
    host.querySelectorAll('[data-wb-howto]').forEach(function(card){
      var kind=card.getAttribute('data-wb-howto')||'';
      card.classList.toggle('is-active',kind===mode);
    });
  }

  function paintHeroModeChrome(projection){
    var mode=projection&&projection.mode?normalizeHeroMode(projection.mode):normalizeHeroMode(heroMode);
    var chrome=projection&&projection.chrome?projection.chrome:{};
    var hero=$('wbHero');
    var orb=$('wbHeroOrb');
    var icon=$('wbHeroOrbIcon');
    var card=$('wbTriggerCard');
    if(hero){
      hero.classList.toggle('is-mode-voice',mode==='voice');
      hero.classList.toggle('is-mode-keys',mode==='keys');
      hero.classList.toggle('is-mode-softPad',mode==='softPad');
      hero.classList.toggle('is-mode-camera',mode==='camera');
      if(mode==='camera'){
        hero.classList.toggle('is-live',!!chrome.cameraRunning);
      }
    }
    if(orb){
      orb.setAttribute('data-mode',mode);
      orb.setAttribute('aria-label',(projection&&projection.tab&&projection.tab.hint)||heroModeHint(mode));
      if(mode==='camera'){
        orb.classList.toggle('is-live',!!chrome.cameraRunning);
      }
    }
    if(icon){
      var next=heroModeIconSvg(mode);
      if(icon.getAttribute('data-icon')!==mode){
        icon.classList.add('is-switching');
        icon.setAttribute('data-icon',mode);
        setTimeout(function(){
          icon.innerHTML=next;
          requestAnimationFrame(function(){ icon.classList.remove('is-switching'); });
        },150);
      }
    }
    if(card){
      card.classList.toggle('is-mode-keys',mode==='keys');
      card.classList.toggle('is-mode-voice',mode==='voice');
      card.classList.toggle('is-mode-softPad',mode==='softPad');
      card.classList.toggle('is-mode-camera',mode==='camera');
    }
    syncHowToActive(mode);
    renderHeroModeHint();
  }

  function renderHero(projection,stats){
    var mode=projection&&projection.mode?normalizeHeroMode(projection.mode):normalizeHeroMode(heroMode);
    var chrome=projection&&projection.chrome?projection.chrome:{};
    var hero=$('wbHero');
    var orb=$('wbHeroOrb');
    var icon=$('wbHeroOrbIcon');
    var live=!!chrome.isLive;
    var paused=!!chrome.isPaused;
    if(hero){
      hero.classList.toggle('is-mode-voice',mode==='voice');
      hero.classList.toggle('is-mode-keys',mode==='keys');
      hero.classList.toggle('is-mode-softPad',mode==='softPad');
      hero.classList.toggle('is-mode-camera',mode==='camera');
      hero.classList.toggle('is-live',live);
      hero.classList.toggle('is-paused',paused);
    }
    if(orb){
      orb.setAttribute('data-mode',mode);
      orb.classList.toggle('is-live',live);
      orb.classList.toggle('is-paused',paused);
      orb.setAttribute('aria-label',(projection&&projection.tab&&projection.tab.hint)||heroModeHint(mode));
    }
    if(icon){
      var next=heroModeIconSvg(mode);
      if(icon.getAttribute('data-icon')!==mode){
        icon.classList.add('is-switching');
        icon.setAttribute('data-icon',mode);
        setTimeout(function(){
          icon.innerHTML=next;
          requestAnimationFrame(function(){ icon.classList.remove('is-switching'); });
        },150);
      }
    }
    syncHowToActive(mode);
    var st=stats;
    if(!st){
      st=global.OneToneHomeWorkbenchStats&&projection&&projection._vm
        ?global.OneToneHomeWorkbenchStats.buildHeroStats(projection._vm)
        :{uptime:'—',opCount:'—',topTarget:'—',topShortcut:'—',latency:'—'};
    }
    renderHeroPills(projection,st);
    renderHeroStats(st);
  }

  function paintHeroSurfaces(projection,opts){
    opts=opts||{};
    if(!projection) return;
    if(opts.showcasePatchOnly){
      paintHeroShowcase(projection,opts);
      return;
    }
    paintHeroModeChrome(projection);
    paintHeroShowcase(projection,opts);
    renderHeroFlowSummary(projection);
    renderHero(projection,opts.stats);
    var panels=global.OneToneHomeWorkbenchPanels;
    if(panels&&typeof panels.renderHowTo==='function'){
      panels.renderHowTo(projection);
    }
    renderLiveText(projection);
  }

  function refreshHeroModeSurfaces(opts){
    opts=opts||{};
    if(!global.OneToneHomeV9||!global.OneToneHomeV9.buildViewModel) return;
    var model=peekHomeModel({force:true})||{};
    var vm=model.rawVm||enrichViewModel(global.OneToneHomeV9.buildViewModel());
    var projection=buildHeroProjection(model,vm);
    paintHeroSurfaces(projection,opts);
  }

  function setHeroMode(mode,opts){
    opts=opts||{};
    var next=normalizeHeroMode(mode);
    if(next===heroMode&&!opts.force) return;
    writeHeroMode(next);
    heroExpandedNodeId='';
    heroPaneTab=next==='softPad'?'status':'cap';
    showcaseShellKind='';
    if(opts.render===false) return;
    if(opts.force){
      render();
      return;
    }
    refreshHeroModeSurfaces();
  }

  function dictatingHint(vm){
    var live=vm.vpState==='DICTATING'||!!vm.summary.dictating;
    if(live) return t('homeWbTriggerHeroLive');
    return heroModeHint(heroMode);
  }

  function renderCommandCard(vm,projection){
    var card=$('wbTriggerCard');
    var mode=projection&&projection.mode?projection.mode:heroMode;
    var chrome=projection&&projection.chrome?projection.chrome:{};
    if(card){
      var live=vm.vpState==='DICTATING'||!!(vm.summary&&vm.summary.dictating);
      card.classList.toggle('is-live',projection?!!chrome.isLive:live);
      card.classList.toggle('is-paused',projection?!!chrome.isPaused:!!(vm.runtime&&vm.runtime.paused));
      card.classList.toggle('is-error',!!(vm.hs&&vm.hs.statusMode==='error'));
      card.classList.toggle('is-mode-keys',mode==='keys');
      card.classList.toggle('is-mode-voice',mode==='voice');
      card.classList.toggle('is-mode-softPad',mode==='softPad');
      card.classList.toggle('is-mode-camera',mode==='camera');
    }
    // pills/live/howto 由 paintHeroSurfaces 统一驱动；此处只维护收尾按钮
    if(!projection){
      var fallback=buildHeroProjection(peekHomeModel({force:true})||{},vm);
      paintHeroSurfaces(fallback);
    }
    renderHeroModeHint();
    var dictating=vm.vpState==='DICTATING'||!!(vm.summary&&vm.summary.dictating);
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

  function renderLiveText(projectionOrVm){
    var liveEl=$('wbLiveText');
    var caption=$('wbHeroCaption');
    var projection=projectionOrVm&&projectionOrVm.flow?projectionOrVm:null;
    var vm=projection?projection._vm:(projectionOrVm||{});
    var mode=projection?projection.mode:heroMode;
    var card=$('wbTriggerCard')||$('wbHero');
    var status=$('wbLivePreviewStatus');
    var statusLbl=$('wbLivePreviewStatusLabel')||status;
    var listenBtn=$('wbBtnListenToggle');
    var listenLbl=$('wbBtnListenToggleLabel');
    var paused=!!(vm.runtime&&vm.runtime.paused);
    var dictating=vm.vpState==='DICTATING'||!!(vm.summary&&vm.summary.dictating);
    var listening=!paused&&(dictating||(vm.summary&&vm.summary.statusMode==='listening')||vm.vpState==='LISTENING');
    if(caption){
      caption.hidden=!dictating;
      caption.setAttribute('aria-hidden',dictating?'false':'true');
    }
    if(card){
      card.classList.toggle('is-live',projection?!!(projection.chrome&&projection.chrome.isLive):!!listening);
      card.classList.toggle('is-paused',projection?!!(projection.chrome&&projection.chrome.isPaused):paused);
    }
    if(status){
      status.classList.toggle('is-live',!!listening);
      status.classList.toggle('is-standby',!listening&&!paused);
      status.classList.toggle('is-paused',paused);
    }
    if(statusLbl){
      statusLbl.textContent=projection&&projection.liveStatus
        ?projection.liveStatus
        :(paused?t('homeWbLivePreviewPaused'):(listening?t('homeWbLivePreviewListening'):t('homeWbLivePreviewStandby')));
    }
    if(listenBtn){
      listenBtn.classList.toggle('is-paused',paused);
      listenBtn.setAttribute('aria-pressed',paused?'true':'false');
      if(global.OneToneHoverTip&&global.OneToneHoverTip.setText){
        global.OneToneHoverTip.setText(listenBtn, paused?t('homeWbListenResumeTip'):t('homeWbListenPauseTip'));
      }else{
        listenBtn.setAttribute('data-ot-tip', paused?t('homeWbListenResumeTip'):t('homeWbListenPauseTip'));
        listenBtn.removeAttribute('title');
      }
    }
    if(listenLbl) listenLbl.textContent=paused?t('homeWbListenResume'):t('homeWbListenPause');
    if(mode==='voice'||mode==='keys'){
      if(global.OneToneHomeV9&&global.OneToneHomeV9.paintMicHeardSurface){
        global.OneToneHomeV9.paintMicHeardSurface();
      }
      if(!dictating||!liveEl) return;
    }
    if(!liveEl) return;
    if(vm.loading){
      liveEl.classList.add('is-placeholder');
      liveEl.innerHTML='<div class="vp-empty">'+esc(t('homeLiveLoading'))+'</div>';
      return;
    }
    if(mode==='camera'||mode==='softPad'){
      if(global.OneToneHomeV9&&global.OneToneHomeV9.paintMicHeardSurface){
        global.OneToneHomeV9.paintMicHeardSurface(null);
      }
      liveEl.classList.add('is-placeholder');
      liveEl.classList.add('is-settings-cta');
      liveEl.setAttribute('role','button');
      liveEl.setAttribute('tabindex','0');
      var heroTip=mode==='camera'?t('homeWbHeroHintCamera'):t('homeWbHeroHintSoftPad');
      if(global.OneToneHoverTip&&global.OneToneHoverTip.setText){
        global.OneToneHoverTip.setText(liveEl, heroTip);
      }else{
        liveEl.setAttribute('data-ot-tip', heroTip);
        liveEl.removeAttribute('title');
      }
      liveEl.innerHTML='<div class="vp-empty">'+esc((projection&&projection.liveHint)||(mode==='camera'?t('homeWbLiveCameraHint'):t('homeWbLiveSoftPadHint')))+'</div>';
      return;
    }
    liveEl.classList.remove('is-settings-cta');
    liveEl.removeAttribute('tabindex');
    liveEl.setAttribute('role','log');
    if(!dictating){
      liveEl.textContent='';
      return;
    }
    if(vm.live&&vm.live.placeholder){
      liveEl.classList.add('is-placeholder');
      liveEl.innerHTML='<div class="vp-empty">'+esc(t('homeWbLiveDictatingHint','听写中…'))+'</div>';
      return;
    }
    liveEl.classList.remove('is-placeholder');
    if(global.vp9&&global.vp9.setText){
      global.vp9.setText('#wbLiveText',(vm.live&&vm.live.finalized)||'',(vm.live&&vm.live.pending)||'');
    }else{
      liveEl.textContent=((vm.live&&vm.live.finalized)||'')+((vm.live&&vm.live.pending)||'');
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
    var route=global.OneToneHomeHabitChannelRoute;
    var byId=global.OneToneMappingCore&&global.OneToneMappingCore.byId
      ?function(id){ return global.OneToneMappingCore.byId(id); }
      :null;
    var m=route&&route.pickMapping
      ?route.pickMapping(opts.mappingId,currentHabitMapping(),byId)
      :currentHabitMapping();
    var id=m&&m.id?String(m.id):'';
    var diff=global.OneToneHabitOverrideDiff;
    var banner=global.OneToneHabitScenarioContextBanner;
    var isApp=!!(m&&diff&&diff.isAppScenarioMapping&&diff.isAppScenarioMapping(m));
    var mode=route&&route.editMode?route.editMode(channel,isApp):(channel==='softPad'?'softPad':(isApp?'scenario':'global'));

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
      if(mode==='scenario'&&banner&&banner.openScenarioKeysEdit){
        banner.openScenarioKeysEdit(id,{returnToHub:false});
        afterOpenFocus();
        return;
      }
      if(banner&&banner.openGlobalKeys){
        banner.openGlobalKeys({fromHub:false});
        afterOpenFocus();
        return;
      }
      openSettings({panel:'keys',focus:focus||'trigger'});
      return;
    }
    if(channel==='voice'){
      if(mode==='scenario'&&banner&&banner.openScenarioVoiceEdit){
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
      if(mode==='scenario'&&banner&&banner.openScenarioCameraEdit){
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

  var followFgPollTimer=null;

  function isFollowFgEnabled(){
    var cfg=global.OneToneState&&global.OneToneState.state&&global.OneToneState.state.config;
    return !!(cfg&&cfg.followForegroundAppScenario);
  }

  // Home no longer exposes force Soft Pad; clear leftover config so overlay follows FG again.
  function clearLegacyForceSoftPadOpen(){
    var cfg=global.OneToneState&&global.OneToneState.state&&global.OneToneState.state.config;
    var was=!!(cfg&&cfg.softPadForceOpen);
    if(cfg) cfg.softPadForceOpen=false;
    if(!was) return;
    var invoke=global.__vp_invoke__||(global.OneToneIpc&&global.OneToneIpc.invoke);
    if(invoke) invoke('cmd_soft_pad_force_open',{enabled:false}).catch(function(){});
    var persist=global.OneToneConfigPersist;
    if(persist&&persist.saveAsync) persist.saveAsync({source:'clearForceSoftPad'});
    else if(persist&&persist.save) persist.save();
  }

  function isSelfFgIdentity(identity){
    if(!identity) return true;
    var exe=String(identity.exeName||identity.exe_name||'').toLowerCase();
    if(exe.indexOf('onetone')>=0) return true;
    var path=String(identity.fullPath||identity.full_path||'').toLowerCase();
    return path.indexOf('onetone')>=0||path.indexOf('voice-pilot')>=0;
  }

  function baselineMappingId(){
    var cfg=global.OneToneState&&global.OneToneState.state&&global.OneToneState.state.config;
    var core=global.OneToneMappingCore;
    var api=global.OneToneHabitOverrideDiff;
    if(api&&api.findGlobalBaselineMapping){
      var b=api.findGlobalBaselineMapping(cfg,core);
      if(b&&b.id) return String(b.id);
    }
    return String(cfg&&cfg.activeSceneId||'').trim();
  }

  function desiredFollowFgSceneId(identity){
    // OneTone itself is foreground while clicking habit cards — do not yank in-use back
    // to baseline on every poll (that fought activateScene and felt like 假死).
    if(!identity||isSelfFgIdentity(identity)) return '';
    var hub=global.OneToneHabitHub;
    if(hub&&hub.findAppScenarioForIdentity){
      var hit=hub.findAppScenarioForIdentity(identity);
      if(hit&&hit.id) return String(hit.id);
    }
    return baselineMappingId();
  }

  function syncFollowForegroundApp(){
    if(!isFollowFgEnabled()) return;
    try{
      if(global.OneToneAppSession&&global.OneToneAppSession.isBootSettling
        &&global.OneToneAppSession.isBootSettling()) return;
    }catch(_){}
    if(!global.OneToneIpc||!global.OneToneIpc.invoke) return;
    global.OneToneIpc.invoke('cmd_foreground_app',{}).then(function(res){
      if(!isFollowFgEnabled()) return;
      var rt=global.OneToneRuntimeHabitControl;
      if(rt&&rt.noteForegroundIdentity) rt.noteForegroundIdentity(res);
      try{
        var appId=res&&(res.matchedPresetAppId||res.matched_preset_app_id||res.appId)||'';
        if(global.OneToneSoftPadHub&&global.OneToneSoftPadHub.noteLaneForeground){
          global.OneToneSoftPadHub.noteLaneForeground(appId);
        }
      }catch(_){}
      if(res&&global.OneToneHomeWorkbenchPanels&&global.OneToneHomeWorkbenchPanels.renderRuntimeStatusRow){
        global.OneToneHomeWorkbenchPanels.renderRuntimeStatusRow(res);
      }
      var id='';
      if(rt&&rt.resolveActiveSceneId){
        id=rt.resolveActiveSceneId(res);
      }else{
        id=desiredFollowFgSceneId(res);
      }
      if(!id) return;
      if(res&&!isSelfFgIdentity(res)){
        var act=global.OneToneSceneActivate;
        if(act&&act.activateScene){
          act.activateScene(id,{source:'foreground'});
        }
      }
    }).catch(function(){});
  }

  function startFollowFgPoll(){
    if(followFgPollTimer) return;
    followFgPollTimer=setInterval(syncFollowForegroundApp,2000);
    // Boot FG is still the launcher / Cursor — immediate sync chained scheme
    // switches and kept the homepage reshuffling for seconds.
    try{
      if(global.OneToneAppSession&&global.OneToneAppSession.isBootSettling
        &&global.OneToneAppSession.isBootSettling()){
        if(global.OneToneAppSession.whenBootSettled){
          global.OneToneAppSession.whenBootSettled(function(){
            setTimeout(syncFollowForegroundApp,800);
          });
        }
        return;
      }
    }catch(_){}
    syncFollowForegroundApp();
  }

  function stopFollowFgPoll(){
    if(followFgPollTimer){
      clearInterval(followFgPollTimer);
      followFgPollTimer=null;
    }
  }

  function hasAppScenarioMappings(){
    var cfg=global.OneToneState&&global.OneToneState.state&&global.OneToneState.state.config;
    var list=cfg&&Array.isArray(cfg.mappings)?cfg.mappings:[];
    var diff=global.OneToneHabitOverrideDiff;
    var rules=global.OneToneAppBehaviorRules;
    for(var i=0;i<list.length;i++){
      var m=list[i];
      if(!m||m.enabled===false) continue;
      if(rules&&rules.isIncompleteCustomStub&&rules.isIncompleteCustomStub(m)) continue;
      if(diff&&diff.isAppScenarioMapping&&diff.isAppScenarioMapping(m)) return true;
      if(!diff&&String(m.appTargetId||'').trim()) return true;
    }
    return false;
  }

  function openUniversalSoftPadSettings(){
    openSettings({panel:'softPad',focus:'softPadDisplay'});
    var hub=global.OneToneSoftPadHub;
    if(hub&&hub.selectScope) hub.selectScope('universal',{rebuildList:true});
  }

  function openHabitsHubForMapping(id){
    id=String(id||'').trim();
    if(!id){
      var cfg=global.OneToneState&&global.OneToneState.state&&global.OneToneState.state.config;
      id=String(cfg&&cfg.activeSceneId||'').trim();
    }
    if(id&&global.OneToneState&&global.OneToneState.state){
      global.OneToneState.state.selectedMappingId=id;
    }
    openSettings({panel:'habits',focus:'mappings'});
    if(!id) return;
    var tries=0;
    function scrollToCard(){
      tries+=1;
      var el=document.querySelector('[data-habit-card="'+id.replace(/"/g,'')+'"]');
      if(el){
        try{ el.scrollIntoView({behavior:'smooth',block:'nearest'}); }catch(_){}
        el.classList.add('is-hub-focus');
        setTimeout(function(){ el.classList.remove('is-hub-focus'); },1600);
        return;
      }
      if(tries<24) setTimeout(scrollToCard,50);
    }
    requestAnimationFrame(function(){ setTimeout(scrollToCard,0); });
  }

  function refreshFollowFgToggle(){
    var btn=$('wbFollowFgToggle');
    if(!btn) return;
    var canFollow=hasAppScenarioMappings();
    var on=isFollowFgEnabled()&&canFollow;
    var wantDisabled=!canFollow;
    var wantChecked=on?'true':'false';
    var hintText=canFollow
      ?(on?t('homeWbFollowFgHint'):t('homeWbFollowFgOffHint','关闭后回到通用习惯'))
      :t('homeWbFollowFgNeedScenario','先建一个应用场景，自动切换才有用');
    var labelText=t('homeWbFollowFgLabel');
    // Skip DOM writes when unchanged — presence/home paints used to thrash this every tick.
    if(btn.disabled===wantDisabled
      && btn.getAttribute('aria-checked')===wantChecked
      && btn.classList.contains('is-on')===on){
      var hintElFast=$('wbFollowFgHint')||document.querySelector('.wb-scene-rail-follow-hint');
      if(hintElFast&&hintElFast.textContent===hintText){
        if(on) startFollowFgPoll();
        else stopFollowFgPoll();
        return;
      }
    }
    btn.disabled=wantDisabled;
    btn.setAttribute('aria-disabled',canFollow?'false':'true');
    btn.classList.toggle('is-on',on);
    btn.setAttribute('aria-checked',wantChecked);
    var label=document.querySelector('.wb-scene-rail-follow-label');
    if(label&&label.textContent!==labelText) label.textContent=labelText;
    var hintEl=$('wbFollowFgHint')||document.querySelector('.wb-scene-rail-follow-hint');
    var wrap=document.querySelector('.wb-scene-rail-follow');
    if(hintEl&&hintEl.textContent!==hintText) hintEl.textContent=hintText;
    if(wrap){
      wrap.classList.toggle('is-disabled',!canFollow);
      if(wrap.title!==hintText) wrap.title=hintText;
    }
    var manage=$('wbHabitManage');
    if(manage){
      var manageLbl=t('homeWbHabitManage','管理');
      if(manage.textContent!==manageLbl) manage.textContent=manageLbl;
    }
    if(on) startFollowFgPoll();
    else stopFollowFgPoll();
  }

  function setFollowFgEnabled(on){
    if(on&&!hasAppScenarioMappings()) return;
    var cfg=global.OneToneState&&global.OneToneState.state&&global.OneToneState.state.config;
    if(!cfg) return;
    var act=global.OneToneSceneActivate;
    if(act&&act.clearManualScenePin) act.clearManualScenePin();
    cfg.followForegroundAppScenario=!!on;
    refreshFollowFgToggle();
    if(!on){
      var base=baselineMappingId();
      if(base&&act&&act.activateScene){
        act.activateScene(base,{source:'manual'});
      }
    }else{
      syncFollowForegroundApp();
    }
    var persist=global.OneToneConfigPersist;
    if(persist&&persist.saveAsync) persist.saveAsync({source:'followFg'});
    else if(persist&&persist.save) persist.save();
  }

  function selectWorkbenchMapping(id){
    id=String(id||'').trim();
    if(!id) return;
    hideChipFlyout(true);
    var act=global.OneToneSceneActivate;
    var rt=global.OneToneRuntimeHabitControl;
    if(act&&act.applySoftOverride){
      var fg=rt&&rt.foregroundIdentity?rt.foregroundIdentity():null;
      act.applySoftOverride(id,fg);
      return;
    }
    if(act&&act.activateScene){
      act.activateScene(id,{source:'manual'});
      return;
    }
    if(global.OneToneHomeScheme) global.OneToneHomeScheme.selectMapping(id);
  }

  var chipFlyoutHideTimer=0;
  var chipFlyoutAnchor=null;
  var chipFlyoutOpenId='';

  function hideChipFlyout(immediate){
    if(chipFlyoutHideTimer){
      clearTimeout(chipFlyoutHideTimer);
      chipFlyoutHideTimer=0;
    }
    function hide(){
      var fly=$('wbSceneChipFlyout');
      if(fly) fly.hidden=true;
      chipFlyoutAnchor=null;
      chipFlyoutOpenId='';
    }
    if(immediate) hide();
    else chipFlyoutHideTimer=setTimeout(hide,280);
  }

  function reanchorChipFlyout(){
    if(!chipFlyoutOpenId) return;
    var rail=$('wbScenarioPanel');
    if(!rail) return;
    var chip=rail.querySelector('.wb-scene-chip[data-wb-chip-id="'+chipFlyoutOpenId+'"]')
      ||rail.querySelector('.wb-scene-chip[data-wb-scenario-id="'+chipFlyoutOpenId+'"]');
    if(chip) showChipFlyout(chip);
    else hideChipFlyout(true);
  }

  function bindFlyoutHoverOnce(){
    var fly=$('wbSceneChipFlyout');
    if(!fly||fly._wbChipFlyoutHoverBound) return;
    fly._wbChipFlyoutHoverBound=true;
    fly.addEventListener('pointerenter',function(){
      if(chipFlyoutHideTimer){
        clearTimeout(chipFlyoutHideTimer);
        chipFlyoutHideTimer=0;
      }
    });
    fly.addEventListener('pointerleave',function(e){
      var to=e.relatedTarget;
      if(to&&to.closest&&(to.closest('#wbSceneChipFlyout')||to.closest('#wbScenarioPanel .wb-scene-chip[data-wb-chip-id]'))) return;
      hideChipFlyout(false);
    });
  }

  function showChipFlyout(chip){
    if(global.OneToneHomeWorkbenchPanels&&global.OneToneHomeWorkbenchPanels.ensureSceneChipFlyoutShell){
      global.OneToneHomeWorkbenchPanels.ensureSceneChipFlyoutShell();
    }
    bindFlyoutHoverOnce();
    // Boot settle: skip hover flyout while first paints churn (pointerover storm → 假死).
    try{
      if(global.OneToneAppSession&&global.OneToneAppSession.isBootSettling
        &&global.OneToneAppSession.isBootSettling()) return;
    }catch(_){}
    if(!chip||chip.id==='wbHabitNew'||chip.classList.contains('wb-scene-chip--new')){
      hideChipFlyout(true);
      return;
    }
    var id=String(chip.getAttribute('data-wb-chip-id')||chip.getAttribute('data-wb-scenario-id')||'').trim();
    if(!id) return;
    var fly=$('wbSceneChipFlyout');
    var rail=$('wbScenarioPanel');
    if(!rail||!fly) return;
    // Same chip already open — skip DOM churn (pointerover/enter spam was freezing).
    if(chipFlyoutOpenId===id&&!fly.hidden&&chipFlyoutAnchor===chip) return;
    var panels=global.OneToneHomeWorkbenchPanels;
    var model=panels&&panels.chipFlyoutContent?panels.chipFlyoutContent(id):null;
    if(!model) return;
    if(chipFlyoutHideTimer){
      clearTimeout(chipFlyoutHideTimer);
      chipFlyoutHideTimer=0;
    }
    chipFlyoutAnchor=chip;
    chipFlyoutOpenId=id;
    var nameEl=fly.querySelector('[data-flyout-name]');
    var pairEl=fly.querySelector('[data-flyout-pair]');
    var pillsEl=fly.querySelector('[data-flyout-pills]');
    var useBtn=fly.querySelector('[data-flyout-use]');
    var hubBtn=fly.querySelector('[data-flyout-hub]');
    if(nameEl) nameEl.textContent=model.name||'—';
    if(pairEl) pairEl.textContent=model.pair||'—';
    if(pillsEl) pillsEl.innerHTML=model.pillsHtml||'';
    if(useBtn){
      useBtn.setAttribute('data-wb-scenario-use',model.id);
      useBtn.hidden=!!model.active;
    }
    if(hubBtn){
      if(model.configureSoftPadOverlay){
        hubBtn.setAttribute('data-wb-soft-pad-universal','');
        hubBtn.removeAttribute('data-wb-habit-open-hub');
      }else{
        hubBtn.setAttribute('data-wb-habit-open-hub',model.id);
        hubBtn.removeAttribute('data-wb-soft-pad-universal');
      }
      hubBtn.textContent=model.configureSoftPadOverlay
        ?t('homeWbChipGlobalConfigure','配置 Soft Pad')
        :t('homeWbHabitOpenHub','查看全部');
    }
    var pinRow=fly.querySelector('[data-flyout-pin-row]');
    var pinHabitBtn=fly.querySelector('[data-wb-pin-habit]');
    var pinAppBtn=fly.querySelector('[data-wb-pin-app]');
    if(pinHabitBtn){
      pinHabitBtn.hidden=false;
      pinHabitBtn.setAttribute('data-wb-pin-habit',model.id);
    }
    if(pinAppBtn){
      var rtPin=global.OneToneRuntimeHabitControl;
      var fgPin=rtPin&&rtPin.foregroundIdentity?rtPin.foregroundIdentity():null;
      var fgApp=String(fgPin&&(fgPin.matchedPresetAppId||fgPin.matched_preset_app_id)||'').trim();
      var mapM=global.OneToneMappingCore&&global.OneToneMappingCore.byId
        ?global.OneToneMappingCore.byId(model.id):null;
      var mapApp=String(mapM&&mapM.appTargetId||'').trim();
      var pinApp=mapApp||fgApp;
      if(pinApp&&pinApp!=='custom'){
        pinAppBtn.hidden=false;
        pinAppBtn.setAttribute('data-wb-pin-app',model.id);
        pinAppBtn.setAttribute('data-wb-pin-app-target',pinApp);
        var appLbl=pinApp;
        var rules=global.OneToneAppBehaviorRules;
        if(rules&&rules.appDisplayName) appLbl=rules.appDisplayName(pinApp)||appLbl;
        pinAppBtn.textContent=t('runtimeHabitPinAppBtnNamed','只在 {app} 用这个习惯').replace('{app}',appLbl);
      }else{
        pinAppBtn.hidden=true;
        pinAppBtn.removeAttribute('data-wb-pin-app');
        pinAppBtn.removeAttribute('data-wb-pin-app-target');
      }
    }
    if(pinRow) pinRow.hidden=!(pinHabitBtn&&!pinHabitBtn.hidden);
    fly.hidden=false;
    var cr=chip.getBoundingClientRect();
    var fh=fly.offsetHeight||1;
    var fw=fly.offsetWidth||240;
    var gap=10;
    var vpPad=8;
    var top=cr.top-fh-gap;
    if(top<vpPad){
      top=cr.bottom+gap;
      fly.classList.add('is-below');
    }else{
      fly.classList.remove('is-below');
    }
    var left=cr.left+cr.width/2;
    var minLeft=vpPad+fw/2;
    var maxLeft=Math.max(minLeft,window.innerWidth-vpPad-fw/2);
    left=Math.min(Math.max(left,minLeft),maxLeft);
    fly.style.position='fixed';
    fly.style.left=left+'px';
    fly.style.top=top+'px';
    fly.style.bottom='auto';
    fly.style.transform='translateX(-50%)';
    fly.style.zIndex='1200';
  }

  function bindChipFlyout(center){
    if(!center||center._wbChipFlyoutBound) return;
    center._wbChipFlyoutBound=true;
    // pointerover bubbles for delegation; same-chip early-return in showChipFlyout kills thrash.
    center.addEventListener('pointerover',function(e){
      var chip=e.target.closest&&e.target.closest('#wbScenarioPanel .wb-scene-chip[data-wb-chip-id]');
      if(chip) showChipFlyout(chip);
      if(e.target.closest&&e.target.closest('#wbSceneChipFlyout')){
        if(chipFlyoutHideTimer){
          clearTimeout(chipFlyoutHideTimer);
          chipFlyoutHideTimer=0;
        }
      }
    });
    center.addEventListener('pointerout',function(e){
      var fromChip=e.target.closest&&e.target.closest('#wbScenarioPanel .wb-scene-chip[data-wb-chip-id]');
      var fromFly=e.target.closest&&e.target.closest('#wbSceneChipFlyout');
      var to=e.relatedTarget;
      if(to&&to.closest){
        if(to.closest('#wbSceneChipFlyout')) return;
        if(fromChip&&to.closest('#wbScenarioPanel .wb-scene-chip[data-wb-chip-id]')===fromChip) return;
      }
      if(fromChip||fromFly) hideChipFlyout(false);
    });
    center.addEventListener('focusin',function(e){
      var chip=e.target.closest&&e.target.closest('#wbScenarioPanel .wb-scene-chip[data-wb-chip-id]');
      if(chip) showChipFlyout(chip);
    });
    center.addEventListener('focusout',function(e){
      var to=e.relatedTarget;
      if(to&&to.closest&&(to.closest('#wbSceneChipFlyout')||to.closest('#wbScenarioPanel .wb-scene-chip[data-wb-chip-id]'))) return;
      hideChipFlyout(false);
    });
    var rail=$('wbScenarioPanel');
    if(rail&&!rail._wbChipFlyoutScroll){
      rail._wbChipFlyoutScroll=true;
      rail.addEventListener('scroll',function(){ hideChipFlyout(true); },{passive:true});
    }
    if(!document._wbChipFlyoutEsc){
      document._wbChipFlyoutEsc=true;
      document.addEventListener('keydown',function(e){
        if(e.key==='Escape') hideChipFlyout(true);
      });
    }
    bindFlyoutHoverOnce();
  }

  function bindPanelActions(){
    var center=$('wbCenter');
    if(!center||center._wbPanelsBound) return;
    center._wbPanelsBound=true;
    bindChipFlyout(center);
    center.addEventListener('click',function(e){
      var followFg=e.target.closest&&e.target.closest('#wbFollowFgToggle');
      if(followFg){
        e.preventDefault();
        e.stopPropagation();
        if(followFg.disabled||followFg.getAttribute('aria-disabled')==='true') return;
        if(!hasAppScenarioMappings()) return;
        setFollowFgEnabled(!isFollowFgEnabled());
        return;
      }
      var clearOverride=e.target.closest&&e.target.closest('#wbRuntimeClearOverride,[data-wb-runtime-clear-override]');
      if(clearOverride){
        e.preventDefault();
        var rt=global.OneToneRuntimeHabitControl;
        if(rt&&rt.clearSoftOverride) rt.clearSoftOverride();
        syncFollowForegroundApp();
        if(global.OneToneHomeWorkbenchPanels&&global.OneToneHomeWorkbenchPanels.renderRuntimeStatusRow){
          global.OneToneHomeWorkbenchPanels.renderRuntimeStatusRow();
        }
        if(global.OneToneHomeWorkbenchPanels&&global.OneToneHomeWorkbenchPanels.renderScenarioPanel){
          global.OneToneHomeWorkbenchPanels.renderScenarioPanel();
        }
        return;
      }
      var clearPin=e.target.closest&&e.target.closest('#wbRuntimeClearPin,[data-wb-runtime-clear-pin]');
      if(clearPin){
        e.preventDefault();
        var rt2=global.OneToneRuntimeHabitControl;
        if(rt2&&rt2.clearPin) rt2.clearPin();
        syncFollowForegroundApp();
        if(global.OneToneHomeWorkbenchPanels&&global.OneToneHomeWorkbenchPanels.renderRuntimeStatusRow){
          global.OneToneHomeWorkbenchPanels.renderRuntimeStatusRow();
        }
        if(global.OneToneHomeWorkbenchPanels&&global.OneToneHomeWorkbenchPanels.renderScenarioPanel){
          global.OneToneHomeWorkbenchPanels.renderScenarioPanel();
        }
        return;
      }
      var pinHabitBtn=e.target.closest&&e.target.closest('[data-wb-pin-habit]');
      if(pinHabitBtn){
        e.preventDefault();
        e.stopPropagation();
        var pinId=pinHabitBtn.getAttribute('data-wb-pin-habit')||'';
        var rtPin=global.OneToneRuntimeHabitControl;
        if(rtPin&&rtPin.setPinHabit&&pinId) rtPin.setPinHabit(pinId);
        if(global.OneToneSceneActivate&&global.OneToneSceneActivate.activateScene&&pinId){
          global.OneToneSceneActivate.activateScene(pinId,{source:'manual',force:true});
        }
        hideChipFlyout(true);
        syncFollowForegroundApp();
        if(global.OneToneHomeWorkbenchPanels&&global.OneToneHomeWorkbenchPanels.renderRuntimeStatusRow){
          global.OneToneHomeWorkbenchPanels.renderRuntimeStatusRow();
        }
        if(global.OneToneHomeWorkbenchPanels&&global.OneToneHomeWorkbenchPanels.renderScenarioPanel){
          global.OneToneHomeWorkbenchPanels.renderScenarioPanel();
        }
        return;
      }
      var pinAppBtn=e.target.closest&&e.target.closest('[data-wb-pin-app]');
      if(pinAppBtn){
        e.preventDefault();
        e.stopPropagation();
        var pinMapId=pinAppBtn.getAttribute('data-wb-pin-app')||'';
        var pinAppTarget=pinAppBtn.getAttribute('data-wb-pin-app-target')||'';
        var rtApp=global.OneToneRuntimeHabitControl;
        if(rtApp&&rtApp.setPinAppHabit&&pinMapId&&pinAppTarget){
          rtApp.setPinAppHabit(pinAppTarget,pinMapId);
        }
        if(global.OneToneSceneActivate&&global.OneToneSceneActivate.activateScene&&pinMapId){
          global.OneToneSceneActivate.activateScene(pinMapId,{source:'manual',force:true});
        }
        hideChipFlyout(true);
        syncFollowForegroundApp();
        if(global.OneToneHomeWorkbenchPanels&&global.OneToneHomeWorkbenchPanels.renderRuntimeStatusRow){
          global.OneToneHomeWorkbenchPanels.renderRuntimeStatusRow();
        }
        if(global.OneToneHomeWorkbenchPanels&&global.OneToneHomeWorkbenchPanels.renderScenarioPanel){
          global.OneToneHomeWorkbenchPanels.renderScenarioPanel();
        }
        return;
      }
      var scenarioUse=e.target.closest&&e.target.closest('[data-wb-scenario-use]');
      if(scenarioUse){
        e.preventDefault();
        e.stopPropagation();
        selectWorkbenchMapping(scenarioUse.getAttribute('data-wb-scenario-use')||'');
        hideChipFlyout(true);
        return;
      }
      var softPadUniversal=e.target.closest&&e.target.closest('[data-wb-soft-pad-universal]');
      if(softPadUniversal){
        e.preventDefault();
        e.stopPropagation();
        hideChipFlyout(true);
        openUniversalSoftPadSettings();
        return;
      }
      var openHub=e.target.closest&&e.target.closest('[data-wb-habit-open-hub]');
      if(openHub){
        e.preventDefault();
        e.stopPropagation();
        hideChipFlyout(true);
        openHabitsHubForMapping(openHub.getAttribute('data-wb-habit-open-hub')||'');
        return;
      }
      var channelChip=e.target.closest&&e.target.closest('[data-wb-habit-channel]');
      if(channelChip){
        e.preventDefault();
        openHabitChannelChip(channelChip.getAttribute('data-wb-habit-channel')||'');
        return;
      }
      var habitEdit=e.target.closest&&e.target.closest('[data-wb-habit-edit]');
      if(habitEdit){
        e.preventDefault();
        e.stopPropagation();
        var editCard=habitEdit.closest('[data-wb-howto]');
        var editCh=editCard?editCard.getAttribute('data-wb-howto')||'':'';
        openHabitChannelChip(editCh,{mappingId:habitEdit.getAttribute('data-wb-habit-edit')||''});
        return;
      }
      var habit=e.target.closest&&e.target.closest('[data-wb-habit-id]');
      if(habit){
        selectWorkbenchMapping(habit.getAttribute('data-wb-habit-id')||'');
        return;
      }
      var scenario=e.target.closest&&e.target.closest('[data-wb-scenario-id]');
      if(scenario){
        var scenarioId=scenario.getAttribute('data-wb-scenario-id')||'';
        // Chip click defaults to set in-use (not edit). Full data lives in habits hub.
        selectWorkbenchMapping(scenarioId);
        hideChipFlyout(true);
        return;
      }
      var micBtn=e.target.closest&&e.target.closest('#wbVoiceChangeMic,.wb-hero-pill-mic-btn,#wbHeroMicEngine');
      if(micBtn){
        openSettings({panel:'voiceWake',focus:micBtn.id==='wbHeroMicEngine'?null:'mic'});
        return;
      }
      var voiceSwitch=e.target.closest&&e.target.closest('#wbHeroVoiceSwitch');
      if(voiceSwitch){
        e.preventDefault();
        var bootHooks=global.__vp_bootstrap_hooks__;
        if(bootHooks&&bootHooks.homeToggleVoiceWake) bootHooks.homeToggleVoiceWake();
        return;
      }
      var listenBtn=e.target.closest&&e.target.closest('#wbBtnListenToggle,.wb-hero-pill-listen,.wb-hero-mic-listen');
      if(listenBtn){
        if(listenBtn.id==='wbBtnCameraOpen'||listenBtn.closest('#wbBtnCameraOpen')){
          openSettings({panel:'camera'});
          return;
        }
        if(listenBtn.id==='wbBtnSoftPadOpen'||listenBtn.closest('#wbBtnSoftPadOpen')){
          openSettings({panel:'softPad'});
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
      var softOpen=e.target.closest&&e.target.closest('#wbBtnSoftPadOpen');
      if(softOpen){
        openSettings({panel:'softPad'});
        return;
      }
      var habitNew=e.target.closest&&e.target.closest('#wbHabitNew');
      if(habitNew){
        openSettings({panel:'habits',habitWizard:true});
        return;
      }
      // Camera/softPad live box is a settings CTA (no dictation to show).
      var liveCta=e.target.closest&&e.target.closest('#wbLiveText.is-settings-cta');
      if(liveCta){
        e.preventDefault();
        openHeroSettings();
        return;
      }
      var paneTab=e.target.closest&&e.target.closest('#wbHeroPane [data-pane-tab]');
      if(paneTab){
        var tabId=paneTab.getAttribute('data-pane-tab')||'cap';
        if(tabId!==heroPaneTab){
          heroPaneTab=tabId;
          refreshHeroModeSurfaces({showcasePatchOnly:true,skipPathAnim:true,skipFocusBump:true});
        }
        return;
      }
      var showcaseItem=e.target.closest&&e.target.closest(
        '#wbHeroShowcase [data-node-id], #wbHeroShowcase [data-micro-key], #wbHeroPane [data-node-id]'
      );
      if(showcaseItem){
        var sid=showcaseItem.getAttribute('data-node-id')||showcaseItem.getAttribute('data-micro-key')||'';
        if(!sid||showcaseItem.classList.contains('is-overflow')) return;
        var model=peekHomeModel({force:true})||{};
        var vm=model.rawVm||(global.OneToneHomeV9&&global.OneToneHomeV9.buildViewModel?enrichViewModel(global.OneToneHomeV9.buildViewModel()):{});
        var projection=buildHeroProjection(model,vm);
        var nextTab=heroPaneTab;
        if(projection.mode==='softPad'&&projection.showcase){
          nextTab=heroPaneTabForSoftPadSel(projection.showcase,sid);
        }
        if(sid===heroExpandedNodeId&&nextTab===heroPaneTab) return;
        heroPaneTab=nextTab;
        heroExpandedNodeId=sid;
        refreshHeroModeSurfaces({showcasePatchOnly:true,skipPathAnim:true,skipFocusBump:true});
        return;
      }
      // 首页 howto：点卡切换通道预览
      var howto=e.target.closest&&e.target.closest('#wbHowTo [data-wb-howto]');
      if(howto){
        if(e.target.closest&&e.target.closest('.wb-howto-card-edit')) return;
        var kind=howto.getAttribute('data-wb-howto')||'';
        if(kind==='keys'||kind==='voice'||kind==='camera'||kind==='softPad'){
          if(normalizeHeroMode(kind)!==heroMode){
            writeHeroMode(kind);
            heroExpandedNodeId='';
            heroPaneTab='cap';
            showcaseShellKind='';
            refreshHeroModeSurfaces({});
          }
        }
        return;
      }
    });
    center.addEventListener('keydown',function(e){
      if(e.key!=='Enter'&&e.key!==' ') return;
      var liveCta=e.target.closest&&e.target.closest('#wbLiveText.is-settings-cta');
      if(!liveCta) return;
      e.preventDefault();
      openHeroSettings();
    });
  }

  var NAV_PANEL_MAP={
    habits:'schemes',
    keys:'triggers',
    softPad:'softPad',
    voiceWake:'voice',
    models:'voice',
    camera:'camera',
    tray:'tray',
    sounds:'sounds',
    actionHistory:'schemes',
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

  var lastWorkbenchSig='';
  var homeRenderForce=false;

  function peekHomeModel(opts){
    if(global.OneToneHomeWorkbenchModel&&typeof global.OneToneHomeWorkbenchModel.build==='function'){
      return global.OneToneHomeWorkbenchModel.build(opts||{});
    }
    return null;
  }

  function shouldSkipHomeRender(){
    if(homeRenderForce) return false;
    if(global.__otHomeWorkbenchGuardEnabled===false) return false;
    var model=peekHomeModel();
    if(!model||!model.ready||!model.sig) return false;
    return model.sig===lastWorkbenchSig;
  }

  function forceHomeRender(){
    homeRenderForce=true;
    lastWorkbenchSig='';
  }

  function applyWorkbenchIaChrome(model){
    if(!model) return;
    var shell=$('homeWorkbench')||$('appWorkbenchShell');
    if(shell){
      shell.setAttribute('data-wb-status',model.statusToken||'idle');
      shell.setAttribute('data-wb-card-cap',String(model.cardHardCap||5));
      if(model.cta&&model.cta.mode) shell.setAttribute('data-wb-cta-mode',model.cta.mode);
      if(model.needsSetup) shell.setAttribute('data-wb-needs-setup','1');
      else shell.removeAttribute('data-wb-needs-setup');
    }
    var alertHost=$('wbHomeAlerts');
    if(alertHost&&model.repair){
      alertHost.setAttribute('data-wb-repair','1');
    }else if(alertHost){
      alertHost.removeAttribute('data-wb-repair');
    }
  }

  var lastPublishedStatusSig='';
  function publishRuntimeStatusProtocol(model){
    if(!model) return;
    // Sticky simulate override wins so tray/HUD/home stay aligned during 模拟异常.
    var override=global.__otRuntimeStatusOverride;
    var snap=(override&&override.statusToken)?override:(model.protocol||null);
    if(!snap&&global.OneToneRuntimeStatusLexicon&&global.OneToneRuntimeStatusLexicon.protocolSnapshot){
      // Fallback only — prefer model.protocol so publish never rewrites hero copy.
      snap=global.OneToneRuntimeStatusLexicon.protocolSnapshot(model);
    }
    if(!snap||!snap.statusToken) return;
    global.__otRuntimeStatusProtocol=snap;
    // Cache five-question surface for maintenance quick panel (must not rebuild model there).
    try{
      var tFn=global.OneToneI18n&&global.OneToneI18n.t?global.OneToneI18n.t:function(k){ return k; };
      global.__otWorkbenchFiveSnapshot=[
        [tFn('homeWbFlowStatus'),snap.statusText||model.statusLine||snap.statusToken||'—'],
        [tFn('homeWbFlowTrigger'),snap.triggerText||model.triggerLabel||'—'],
        [tFn('homeWbFlowTarget'),snap.targetText||model.targetLabel||'—'],
        [tFn('homeWbStatusWork'),model.nextActionLabel||(model.cta&&model.cta.label)||'—'],
        [tFn('debugFocusRepair'),snap.repairText||(model.repair&&model.repair.label)||tFn('debugQuickCtrlNoRepair')]
      ];
    }catch(_){}
    var sig=[
      snap.statusToken,
      snap.statusText||'',
      snap.triggerText||'',
      snap.targetText||'',
      snap.repairText||'',
      snap.canPause?'1':'0',
      snap.canResume?'1':'0',
      snap.lastEventText||''
    ].join('\0');
    if(sig===lastPublishedStatusSig) return;
    lastPublishedStatusSig=sig;
    try{
      if(typeof global.dispatchEvent==='function'){
        global.dispatchEvent(new CustomEvent('ot:runtime-status',{detail:snap}));
      }
    }catch(_){}
    try{
      if(global.OneToneIpc&&typeof global.OneToneIpc.invoke==='function'){
        global.OneToneIpc.invoke('cmd_runtime_status_protocol',snap).catch(function(){});
      }
    }catch(_){}
  }

  function bootstrapHomeVoice(){
    var wake=global.OneToneVoiceWake;
    if(wake){
      if(wake.startPoll&&wake.isPollStarted&&!wake.isPollStarted()){
        try{ wake.startPoll(); }catch(_){}
      }
      if(wake.ensureHomeVoiceListening){
        var force=!homeVoiceBootstrapped;
        try{ wake.ensureHomeVoiceListening({force:force}); }catch(_){}
        if(force){
          homeVoiceBootstrapped=true;
          if(wake.unparkHomeAsrQuiet){
            try{ wake.unparkHomeAsrQuiet(); }catch(_){}
          }
        }
      }
    }
    var mic=global.OneToneAppMic;
    if(mic&&mic.syncHomeMicMonitor){
      try{ mic.syncHomeMicMonitor().catch(function(){}); }catch(_){}
    }
  }

  function render(){
    if(!global.OneToneHomeV9||!global.OneToneHomeV9.buildViewModel) return;
    if(global.OneToneQuickStart&&global.OneToneQuickStart.isOpen&&global.OneToneQuickStart.isOpen()) return;
    if(global.OneToneHabitTriggerSetup&&global.OneToneHabitTriggerSetup.isOpen&&global.OneToneHabitTriggerSetup.isOpen()) return;
    bootstrapHomeVoice();
    var micApi=global.OneToneAppMic;
    if(micApi&&typeof micApi.listLoaded==='function'&&!micApi.listLoaded()&&typeof micApi.loadMicDevices==='function'){
      var bootHooks=global.__vp_bootstrap_hooks__||{};
      if(!bootHooks.uiBootstrapping||!bootHooks.uiBootstrapping()){
        micApi.loadMicDevices().catch(function(){});
      }
    }
    var model=peekHomeModel({force:homeRenderForce});
    homeRenderForce=false;
    var vm=model&&model.rawVm?model.rawVm:enrichViewModel(global.OneToneHomeV9.buildViewModel());
    if(model&&model.sig){
      if(global.__otHomeWorkbenchGuardEnabled!==false&&model.sig===lastWorkbenchSig&&!model.force){
        bootstrapHomeVoice();
        if(global.OneToneHomeV9&&global.OneToneHomeV9.paintMicHeardSurface){
          try{ global.OneToneHomeV9.paintMicHeardSurface(); }catch(_){}
        }
        return;
      }
      lastWorkbenchSig=model.sig;
    }
    applyWorkbenchIaChrome(model);
    publishRuntimeStatusProtocol(model);
    if(global.vp9&&global.vp9.updateState) global.vp9.updateState(vm.vpState);
    renderNavSidebar(vm);
    renderOverview(vm);
    renderAlerts(vm,model);
    var projection=buildHeroProjection(model,vm);
    var stats=global.OneToneHomeWorkbenchStats
      ?global.OneToneHomeWorkbenchStats.buildHeroStats(vm)
      :{uptime:'—',opCount:'—',topTarget:'—',topShortcut:'—',latency:'—'};
    paintHeroSurfaces(projection,{stats:stats});
    renderCommandCard(vm,projection);
    renderFinishSummary(vm);
    renderQuickActions();
    if(global.OneToneHomeWorkbenchPanels){
      global.OneToneHomeWorkbenchPanels.renderAll(vm);
    }
    refreshFollowFgToggle();
    bootstrapHomeVoice();
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
    var ia=global.OneToneShellIaConvergence;
    if(ia&&ia.NAV){
      Object.keys(ia.NAV).forEach(function(key){
        var btn=nav.querySelector('[data-wb-nav="'+key+'"]');
        var row=ia.NAV[key];
        if(!btn||!row) return;
        btn.setAttribute('data-wb-deep',row.deep?'1':'0');
        btn.setAttribute('data-wb-pro',row.pro?'1':'0');
        if(row.home) btn.setAttribute('data-wb-home','1');
      });
    }
    nav.addEventListener('click',function(e){
      var btn=e.target.closest&&e.target.closest('[data-wb-nav]');
      if(!btn) return;
      var action=btn.getAttribute('data-wb-nav');
      var row=ia&&ia.resolve?ia.resolve(action):null;
      // 只认 shell-ia — missing script must be fixed by load order, not a parallel nav map.
      if(!row) return;
      if(row.home){
        if(global.OneToneSettingsDrawer&&global.OneToneSettingsDrawer.close) global.OneToneSettingsDrawer.close();
        syncNavActiveState('home');
        return;
      }
      if(row.panel){
        if(row.panel==='keys'||row.panel==='voiceWake'||row.panel==='camera'){
          var ch=row.panel==='voiceWake'?'voice':row.panel;
          openHabitChannelChip(ch);
          return;
        }
        var opts={panel:row.panel};
        if(row.debugMode) opts.debugMode=row.debugMode;
        openSettings(opts);
      }
    });
  }

  function bindOnce(){
    if(bound) return;
    bound=true;
    if(global.OneToneHomeWorkbenchPanels&&global.OneToneHomeWorkbenchPanels.ensureSceneChipFlyoutShell){
      global.OneToneHomeWorkbenchPanels.ensureSceneChipFlyoutShell();
    }
    heroMode=readHeroMode();
    bindNav();
    bindPanelActions();
    hookCameraPresence();
    refreshFollowFgToggle();
    clearLegacyForceSoftPadOpen();
    fetchLastUiStallOnce();
    if(global.OneToneAppSession&&global.OneToneAppSession.whenBootSettled){
      global.OneToneAppSession.whenBootSettled(fetchLastUiStallOnce);
    }
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
      if(e.key==='Escape'&&heroExpandedNodeId){
        heroExpandedNodeId='';
        refreshHeroModeSurfaces({showcasePatchOnly:true,skipPathAnim:true,skipFocusBump:true});
        return;
      }
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
    var alertsHost=$('wbHomeAlerts');
    if(alertsHost){
      alertsHost.addEventListener('click',function(e){
        var btn=e.target.closest&&e.target.closest('[data-wb-alert-action]');
        if(!btn) return;
        handleAlertAction(alertsHost._lastAlertAction);
      });
    }
    var liveHost=$('wbLiveText');
    if(liveHost&&!liveHost._wbLiveFixBound){
      liveHost._wbLiveFixBound=true;
      liveHost.addEventListener('click',function(e){
        var btn=e.target.closest&&e.target.closest('[data-wb-live-fix]');
        if(!btn) return;
        e.preventDefault();
        e.stopPropagation();
        handleAlertAction(liveHost._liveHintAction);
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
    var want=heroMode==='keys'?'keys':heroMode==='camera'?'camera':heroMode==='softPad'?'softPad':'voiceWake';
    try{
      if(global.OneToneIpc&&global.OneToneIpc.invoke){
        global.OneToneIpc.invoke('cmd_app_log',{line:'fe openHeroSettings mode='+want}).catch(function(){});
      }
    }catch(_){}
    var ui=global.OneToneState&&global.OneToneState.ui;
    if(ui&&ui.drawerOpen&&ui.settingsPanel===want){
      return;
    }
    var channel=want==='voiceWake'?'voice':want;
    openHabitChannelChip(channel);
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
    var boundTitle=$('wbContextBoundTitle');
    if(boundTitle) boundTitle.textContent=t('homeWbContextBoundTitle','当前习惯');
    var boundSub=document.querySelector('#wbScopeTop .wb-context-bound-sub');
    if(boundSub) boundSub.textContent=t('homeWbContextBoundSub','切换习惯时，下方四通道状态一起跟着变。');
    var manage=$('wbHabitManage');
    if(manage) manage.textContent=t('homeWbHabitManage','管理');
    refreshFollowFgToggle();
    var searchInput=$('wbCommandSearchInput');
    if(searchInput) searchInput.placeholder=t('homeWbCmdSearchPlaceholder');
    renderQuickActions();
    // Do not forceHomeRender here — wipe sig on every applyLang/renderHome cascade
    // turned boot + presence ticks into full hero remount storms.
    if(global.OneToneHomeWorkbench&&global.OneToneHomeWorkbench.render) global.OneToneHomeWorkbench.render();
    // 左下角 mic hub 文案由 AppMic 动态维护；applyLang 扫完后必须重刷，并补一次静音探测
    try{
      var mic=global.OneToneAppMic;
      if(mic&&typeof mic.refreshMicUiState==='function'){
        mic.refreshMicUiState().catch(function(){
          if(typeof mic.renderMicSurfaces==='function') mic.renderMicSurfaces();
        });
      }else if(mic&&typeof mic.renderMicSurfaces==='function'){
        mic.renderMicSurfaces();
      }
    }catch(_){}
  }

  global.OneToneHomeWorkbench={
    render:render,
    bindOnce:bindOnce,
    reanchorChipFlyout:reanchorChipFlyout,
    applyLang:applyLang,
    syncNavActiveState:syncNavActiveState,
    buildPerf:buildPerf,
    enrichViewModel:enrichViewModel,
    buildHomeWorkbenchModel:function(opts){
      return peekHomeModel(opts);
    },
    shouldSkipHomeRender:shouldSkipHomeRender,
    forceHomeRender:forceHomeRender,
    renderTriggerDiagBlocks:renderTriggerDiagBlocks,
    startCompatProbe:startCompatProbe,
    getHeroMode:function(){ return normalizeHeroMode(heroMode); },
    getHeroExpandedNodeId:function(){ return heroExpandedNodeId; },
    heroIconSvg:heroModeIconSvg,
    setHeroMode:setHeroMode,
    onCompatResult:function(msg){
      if(global.OneToneHomeWorkbenchCompat&&msg){
        global.OneToneHomeWorkbenchCompat.store(msg.mappingId,msg);
      }
      forceHomeRender();
      render();
      renderTriggerDiagBlocks();
    }
  };
})((typeof window!=='undefined')?window:globalThis);
