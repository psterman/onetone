(function(global){
  'use strict';

  var $=function(id){ return global.OneToneDom.$(id); };
  var t=function(key){ return global.OneToneI18n.t(key); };
  var bound=false;
  var homeVoiceBootstrapped=false;
  var HERO_MODE_KEY='onetone.wbHeroMode';
  var heroMode='voice';
  var howtoExpandedKind='';
  var presenceHooked=false;
  var MIC_SVG='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1v11m0 0a4 4 0 01-4-4V5a4 4 0 118 0v4a4 4 0 01-4 4zm0 0v3m0 0a7 7 0 01-7-7M12 15a7 7 0 007-7M12 18v3m-3 0h6"/></svg>';
  var KEY_SVG='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="5.5" width="19" height="13" rx="2.2" class="wb-key-frame"/><circle cx="6" cy="10" r="1.1" class="wb-key-el wb-key-1" fill="currentColor" stroke="none"/><circle cx="10" cy="10" r="1.1" class="wb-key-el wb-key-2" fill="currentColor" stroke="none"/><circle cx="14" cy="10" r="1.1" class="wb-key-el wb-key-3" fill="currentColor" stroke="none"/><circle cx="18" cy="10" r="1.1" class="wb-key-el wb-key-4" fill="currentColor" stroke="none"/><rect x="7" y="13.5" width="10" height="1.8" rx="0.9" class="wb-key-el wb-key-space" fill="currentColor" stroke="none"/></svg>';
  var CAM_SVG='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
  var PAD_SVG='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 7h.01M12 7h.01M16 7h.01M8 11h.01M12 11h.01M16 11h.01M8 15h8"/></svg>';

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

  function syncHeroMicCard(projection){
    var hub=$('wbHeroMic');
    var engineBtn=$('wbHeroMicEngine');
    var engineNameEl=$('wbHeroMicEngineName');
    var wakeHintEl=$('wbHeroMicWakeHint');
    var toolbar=$('wbHeroMicToolbar');
    var listenBtn=$('wbBtnListenToggle');
    var voiceSwitch=$('wbHeroVoiceSwitch');
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
      return;
    }
    if(hub) hub.hidden=false;
    if(mode==='keys'){
      if(hub){
        hub.classList.remove('is-voice-surface','is-dictating');
      }
      if(voiceSwitch) voiceSwitch.hidden=true;
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
      return;
    }
    if(mode==='voice'){
      if(hub){
        hub.classList.toggle('is-voice-surface',true);
        hub.classList.toggle('is-dictating',dictating);
      }
      if(global.OneToneVoiceSurfaceCopy){
        var surface=global.OneToneVoiceSurfaceCopy.resolve({dictating:dictating,paused:paused});
        var flow=projection&&projection.flow?projection.flow:null;
        var line1='';
        if(dictating){
          line1=surface.line1||'';
        }else if(flow&&flow.trigger){
          line1=String(flow.trigger);
        }else{
          line1=surface.line1||'';
        }
        if(statusEl) statusEl.textContent=line1;
        if(voiceSwitch){
          voiceSwitch.hidden=false;
          voiceSwitch.classList.toggle('is-on',!!surface.switchOn);
          voiceSwitch.setAttribute('aria-checked',surface.switchOn?'true':'false');
          voiceSwitch.disabled=!!surface.switchDisabled;
          voiceSwitch.setAttribute('aria-label',surface.switchOn?t('voiceSurfaceSwitchOn'):t('voiceSurfaceSwitchOff'));
        }
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
      if(listenBtn&&listenPill){
        listenBtn.hidden=false;
        listenBtn.removeAttribute('aria-hidden');
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
      var statusPill=null;
      var ctaPill=null;
      pills.forEach(function(pill){
        if(!pill) return;
        if(pill.action==='open-camera-settings'||pill.action==='open-softPad-settings') ctaPill=pill;
        else if(!statusPill) statusPill=pill;
      });
      if(statusPill){
        var extra=pills.filter(function(p){ return p&&p!==statusPill&&p!==ctaPill; })
          .map(function(p){ return p.label; }).filter(Boolean).join(' · ');
        var tip=extra?String(statusPill.label)+' · '+extra:String(statusPill.label||'');
        html+='<span class="wb-hero-pill'+(statusPill.tone?' '+statusPill.tone:'')+'" role="listitem" title="'+esc(tip)+'">'
          +'<span>'+esc(statusPill.label)+'</span></span>';
      }
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
    paintHeroModeChrome(projection);
    renderHeroFlowSummary(projection);
    renderHero(projection,opts.stats);
    var panels=global.OneToneHomeWorkbenchPanels;
    if(panels){
      if(opts.howtoPatchOnly&&panels.patchHowtoDrawer){
        if(!panels.patchHowtoDrawer(projection,howtoExpandedKind,normalizeHeroMode(heroMode))
          &&typeof panels.renderHowTo==='function'){
          panels.renderHowTo(projection);
        }
      }else if(typeof panels.renderHowTo==='function'){
        panels.renderHowTo(projection);
      }
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
      var drawerClose=e.target.closest&&e.target.closest('#wbHowtoDrawerClose');
      if(drawerClose){
        howtoExpandedKind='';
        refreshHeroModeSurfaces({howtoPatchOnly:true});
        return;
      }
      // 首页 howto：首点展开；再点同卡收起；点其他卡切换；编辑进设置
      var howto=e.target.closest&&e.target.closest('#wbHowTo [data-wb-howto]');
      if(howto){
        if(e.target.closest&&e.target.closest('.wb-howto-card-edit')) return;
        var kind=howto.getAttribute('data-wb-howto')||'';
        try{
          if(global.OneToneIpc&&global.OneToneIpc.invoke){
            global.OneToneIpc.invoke('cmd_app_log',{line:'fe howto click kind='+kind+' hero='+heroMode}).catch(function(){});
          }
        }catch(_){}
        if(kind==='keys'||kind==='voice'||kind==='camera'||kind==='softPad'){
          var isSelected=howto.classList.contains('is-selected');
          if(isSelected){
            howtoExpandedKind='';
            refreshHeroModeSurfaces({howtoPatchOnly:true});
          }else{
            var switching=!!(howtoExpandedKind&&howtoExpandedKind!==kind&&document.querySelector('#wbHowTo #wbHowtoDrawer.is-open'));
            howtoExpandedKind=kind;
            var isActive=normalizeHeroMode(kind)===heroMode;
            if(!isActive){
              writeHeroMode(kind);
              var model=peekHomeModel({force:true})||{};
              var vm=model.rawVm||enrichViewModel(global.OneToneHomeV9.buildViewModel());
              var projection=buildHeroProjection(model,vm);
              paintHeroModeChrome(projection);
              paintHeroSurfaces(projection,switching?{howtoPatchOnly:true}:{});
            }else{
              refreshHeroModeSurfaces(switching?{howtoPatchOnly:true}:{});
            }
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
    getHowtoExpandedKind:function(){ return howtoExpandedKind; },
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
