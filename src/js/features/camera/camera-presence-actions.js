(function(global){
  'use strict';

  /**
   * Low-precision camera presence sensor + action dispatcher.
   * Decoupled from gaze overlay; does not auto-start the camera.
   */

  var $=function(id){
    return global.OneToneDom&&global.OneToneDom.$?global.OneToneDom.$(id):document.getElementById(id);
  };
  var t=function(key,fallback){
    if(global.OneToneI18n&&global.OneToneI18n.t){
      var v=global.OneToneI18n.t(key);
      if(v&&v!==key) return v;
    }
    return fallback!=null?fallback:key;
  };

  var AWAY_MS=3000;
  var PRESENT_MS=1000;
  // Yaw bins for coarse L/C/R display (landmark yaw ~±1).
  var YAW_LEFT=-0.12;
  var YAW_RIGHT=0.12;
  var KEY_THROTTLE_MS=800;
  var KEY_THROTTLE_VOICE_MS=2200;
  var MID_RISK_DELAY_MS=750;
  var DETECT_PRESENT_MS=100;
  var DETECT_AWAY_MS=333;
  var DETECT_GAZE_MS=33;
  var DETECT_SHAKE_MS=33;

  // Shake: yaw hysteresis + L-R-L / R-L-R within window.
  // Enter high enough to avoid center jitter → key/toast flood / UI freeze.
  var SHAKE_WINDOW_MS=2800;
  var SHAKE_COOLDOWN_MS=2800;
  var SHAKE_ENTER=0.22;
  var SHAKE_EXIT=0.10;
  var SHAKE_LOG_MIN_MS=2500;

  // Deliberate blink: close eyes ~0.3–1.5s then open. Short natural blinks ignored.
  // Thresholds are softer than MediaPipe's "fully shut" so a gentle half-second close counts.
  var BLINK_ON=0.58;
  var BLINK_OFF=0.32;
  var BLINK_OPEN_SETTLE_MS=100;
  var BLINK_LONG_MIN_MS=280;
  var BLINK_LONG_MAX_MS=1500;
  var BLINK_COOLDOWN_MS=2800;
  var BLINK_HINT_COOLDOWN_MS=2500;
  var GESTURE_PULSE_MS=700;

  var ACTIONS={
    none:1,
    pressEsc:1,
    pressCtrlI:1,
    lowPowerMode:1,
    privacyScreen:1,
    pauseVoice:1,
    resumeVoice:1
  };

  var st={
    enabled:false,
    presence:'unknown',
    faceDetected:false,
    headDirection:'unknown',
    lostSince:0,
    returnedSince:0,
    absentDurationMs:0,
    presentDurationMs:0,
    lastGesture:'none',
    privacyOpen:false,
    lowPowerActive:false,
    faceTrueSince:0,
    faceFalseSince:0,
    wasPausedBeforeAway:false,
    pausedByPresence:false,
    lastKeyAt:0,
    lastActionAt:0,
    lastAction:'none',
    lastSkipReason:'',
    lastSkipAt:0,
    lastEvent:'',
    lastEventAt:0,
    pendingAction:null,
    pendingActionTimer:0,
    pendingPreviewLine:'',
    lastThrottleToastAt:0,
    escBound:false,
    uiBound:false,
    onDetectInterval:null,
    onStateChange:null,
    runtimeListeners:[],
    // Non-persistent runtime hold — never written to prefs.
    manualStopped:false,
    lastError:null,
    runtimeStatus:'off',
    ensureInflight:null,
    // Shake tracking (yaw hysteresis)
    shakeSeq:[],
    shakeHyst:'center',
    lastShakeAt:0,
    lastShakeLogAt:0,
    lastYaw:null,
    // Blink tracking
    blinkClosed:false,
    blinkCloseSince:0,
    blinkOpenSince:0,
    lastBlinkAt:0,
    lastBlinkHintAt:0,
    pulseUntil:0,
    pulseTimer:0
  };

  function toast(msg){
    try{
      if(global.OneToneAppToast&&global.OneToneAppToast.show){
        global.OneToneAppToast.show(msg,'lite');
        return;
      }
    }catch(_){}
  }

  function runtime(){
    return global.OneToneState&&global.OneToneState.runtime?global.OneToneState.runtime:{};
  }

  function stateRoot(){
    return global.OneToneState&&global.OneToneState.state?global.OneToneState.state:{};
  }

  function defaultPresencePrefs(){
    return {
      enabled:false,
      triggers:{away:false,shake:false,blink:false},
      onAway:'none',
      onReturn:'none',
      shakeHead:'none',
      deliberateBlink:'none'
    };
  }

  function normalizeAction(v){
    var s=String(v||'none').trim();
    return ACTIONS[s]?s:'none';
  }

  function normalizeTriggers(raw,fallbackActions){
    var fa=fallbackActions||{};
    if(raw&&typeof raw==='object'){
      return {
        away:raw.away!==undefined?!!raw.away:(normalizeAction(fa.onAway)!=='none'||normalizeAction(fa.onReturn)!=='none'),
        shake:raw.shake!==undefined?!!raw.shake:normalizeAction(fa.shakeHead)!=='none',
        blink:raw.blink!==undefined?!!raw.blink:normalizeAction(fa.deliberateBlink)!=='none'
      };
    }
    return {
      away:normalizeAction(fa.onAway)!=='none'||normalizeAction(fa.onReturn)!=='none',
      shake:normalizeAction(fa.shakeHead)!=='none',
      blink:normalizeAction(fa.deliberateBlink)!=='none'
    };
  }

  function normalizePrefs(raw){
    var d=defaultPresencePrefs();
    if(!raw||typeof raw!=='object') return d;
    var onAway=normalizeAction(raw.onAway);
    var onReturn=normalizeAction(raw.onReturn);
    var shakeHead=normalizeAction(raw.shakeHead);
    var deliberateBlink=normalizeAction(raw.deliberateBlink);
    return {
      enabled:!!raw.enabled,
      triggers:normalizeTriggers(raw.triggers,{
        onAway:onAway,onReturn:onReturn,shakeHead:shakeHead,deliberateBlink:deliberateBlink
      }),
      onAway:onAway,
      onReturn:onReturn,
      shakeHead:shakeHead,
      deliberateBlink:deliberateBlink
    };
  }

  function mirrorTopLevelEnabled(cp,presenceEnabled){
    // Deprecated field — keep mirrored so old readers stay consistent.
    cp.enabled=!!presenceEnabled;
  }

  function cameraPrefs(){
    var cfg=stateRoot().config||{};
    if(!cfg.cameraPrefs||typeof cfg.cameraPrefs!=='object'){
      cfg.cameraPrefs={
        enabled:false,selectedDeviceId:'',previewEnabled:false,
        selectedWidth:0,selectedHeight:0,selectedFrameRate:0,
        gazeCalibration:null,presenceActions:defaultPresencePrefs()
      };
    }
    if(!cfg.cameraPrefs.presenceActions||typeof cfg.cameraPrefs.presenceActions!=='object'){
      cfg.cameraPrefs.presenceActions=defaultPresencePrefs();
    }else{
      cfg.cameraPrefs.presenceActions=normalizePrefs(cfg.cameraPrefs.presenceActions);
    }
    mirrorTopLevelEnabled(cfg.cameraPrefs,!!cfg.cameraPrefs.presenceActions.enabled);
    return cfg.cameraPrefs;
  }

  function basePresencePrefs(){
    return normalizePrefs(cameraPrefs().presenceActions);
  }

  function uiState(){
    return global.OneToneState&&global.OneToneState.ui?global.OneToneState.ui:{};
  }

  function coreApi(){
    return global.OneToneMappingCore||null;
  }

  function diffApi(){
    return global.OneToneHabitOverrideDiff||null;
  }

  function scenarioCameraEditMapping(){
    var u=uiState();
    if(String(u.habitScenarioReturnPanel||'')!=='camera') return null;
    var id=String(u.habitScenarioReturnId||'').trim();
    if(!id||!coreApi()||!coreApi().byId) return null;
    var m=coreApi().byId(id);
    if(!m) return null;
    if(diffApi()&&diffApi().isAppScenarioMapping&&!diffApi().isAppScenarioMapping(m)) return null;
    return m;
  }

  function resolveCameraOverrideMapping(){
    var edit=scenarioCameraEditMapping();
    if(edit) return edit;
    var id=String(uiState().habitScenarioReturnId||'').trim();
    if(id&&coreApi()&&coreApi().byId){
      var ctx=coreApi().byId(id);
      if(ctx&&diffApi()&&diffApi().isAppScenarioMapping&&diffApi().isAppScenarioMapping(ctx)) return ctx;
    }
    var cfg=stateRoot().config||{};
    var activeId=String(cfg.activeSceneId||'').trim();
    if(activeId&&coreApi()&&coreApi().byId){
      var active=coreApi().byId(activeId);
      if(active&&active.enabled&&diffApi()&&diffApi().isAppScenarioMapping&&diffApi().isAppScenarioMapping(active)){
        return active;
      }
    }
    return null;
  }

  function mergeCameraOverride(base,ov){
    base=normalizePrefs(base);
    if(!ov||typeof ov!=='object') return base;
    var merged={
      enabled:!!base.enabled,
      triggers:{
        away:ov.triggers&&ov.triggers.away!==undefined?!!ov.triggers.away:base.triggers.away,
        shake:ov.triggers&&ov.triggers.shake!==undefined?!!ov.triggers.shake:base.triggers.shake,
        blink:ov.triggers&&ov.triggers.blink!==undefined?!!ov.triggers.blink:base.triggers.blink
      },
      onAway:ov.onAway!=null?normalizeAction(ov.onAway):base.onAway,
      onReturn:ov.onReturn!=null?normalizeAction(ov.onReturn):base.onReturn,
      shakeHead:ov.shakeHead!=null?normalizeAction(ov.shakeHead):base.shakeHead,
      deliberateBlink:ov.deliberateBlink!=null?normalizeAction(ov.deliberateBlink):base.deliberateBlink
    };
    return merged;
  }

  function prefs(){
    var base=basePresencePrefs();
    var m=resolveCameraOverrideMapping();
    return mergeCameraOverride(base,m&&m.cameraOverride);
  }

  function isEmptyCameraOverride(ov){
    if(!ov||typeof ov!=='object') return true;
    var actionEmpty=['onAway','onReturn','shakeHead','deliberateBlink'].every(function(k){
      return ov[k]==null||String(ov[k]).trim()==='';
    });
    var tr=ov.triggers;
    var triggerEmpty=!tr||typeof tr!=='object'||(
      tr.away===undefined&&tr.shake===undefined&&tr.blink===undefined
    );
    return actionEmpty&&triggerEmpty;
  }

  var scenarioCameraSaveTimer=0;

  function scheduleScenarioCameraSave(){
    if(scenarioCameraSaveTimer){
      try{ clearTimeout(scenarioCameraSaveTimer); }catch(_){}
      scenarioCameraSaveTimer=0;
    }
    scenarioCameraSaveTimer=setTimeout(function(){
      scenarioCameraSaveTimer=0;
      if(global.OneToneConfigPersist){
        if(global.OneToneConfigPersist.saveAsync) global.OneToneConfigPersist.saveAsync();
        else if(global.OneToneConfigPersist.save) global.OneToneConfigPersist.save();
      }
      if(global.OneToneHabitScenarioContextBanner&&global.OneToneHabitScenarioContextBanner.render){
        try{ global.OneToneHabitScenarioContextBanner.render(); }catch(_){}
      }
    },500);
  }

  function persistScenarioCameraOverride(partial){
    var m=scenarioCameraEditMapping();
    if(!m) return false;
    var base=basePresencePrefs();
    var ov=m.cameraOverride&&typeof m.cameraOverride==='object'?Object.assign({},m.cameraOverride):{};
    ['onAway','onReturn','shakeHead','deliberateBlink'].forEach(function(k){
      if(partial[k]===undefined) return;
      var v=normalizeAction(partial[k]);
      if(v===base[k]) delete ov[k];
      else ov[k]=v;
    });
    if(partial.triggers&&typeof partial.triggers==='object'){
      var baseTr=base.triggers||{};
      var ovTr=ov.triggers&&typeof ov.triggers==='object'?Object.assign({},ov.triggers):{};
      ['away','shake','blink'].forEach(function(k){
        if(partial.triggers[k]===undefined) return;
        var v=!!partial.triggers[k];
        if(v===!!baseTr[k]) delete ovTr[k];
        else ovTr[k]=v;
      });
      if(Object.keys(ovTr).length) ov.triggers=ovTr;
      else delete ov.triggers;
    }
    m.cameraOverride=isEmptyCameraOverride(ov)?null:ov;
    scheduleScenarioCameraSave();
    return true;
  }

  function isCameraPreviewLive(){
    try{
      var gp=global.OneToneCameraPreview;
      if(gp&&gp.isRunning) return !!gp.isRunning();
      if(gp&&gp.getGazeDebugState){
        var s=gp.getGazeDebugState();
        return !!(s&&s.previewLive);
      }
    }catch(_){}
    return false;
  }

  function emitRuntime(){
    var snap=getRuntimeStatus();
    var list=st.runtimeListeners.slice();
    for(var i=0;i<list.length;i++){
      try{ list[i](snap); }catch(_){}
    }
    emitState();
    syncRuntimeChrome();
  }

  function getRuntimeStatus(){
    var enabled=isEnabled();
    var running=isCameraPreviewLive();
    var status=st.runtimeStatus;
    if(!enabled) status='off';
    else if(st.manualStopped) status='manual_stopped';
    else if(st.lastError&&!running) status='error';
    else if(running) status='running';
    else if(status==='starting') status='starting';
    else status='off';
    return {
      enabled:enabled,
      running:running,
      status:status,
      manualStopped:!!st.manualStopped,
      lastError:st.lastError?{code:st.lastError.code,message:st.lastError.message}:null,
      lastEvent:st.lastEvent||'',
      lastEventAt:st.lastEventAt||0,
      lastAction:st.lastAction||'none',
      lastActionAt:st.lastActionAt||0,
      lastSkipReason:st.lastSkipReason||'',
      lastSkipAt:st.lastSkipAt||0,
      pendingPreviewLine:st.pendingPreviewLine||'',
      presence:st.presence,
      deviceLabel:previewDeviceLabel()
    };
  }

  function previewDeviceLabel(){
    try{
      var pv=global.OneToneCameraPreview;
      if(pv&&pv.getSelectedDeviceLabel) return String(pv.getSelectedDeviceLabel()||'');
    }catch(_){}
    var sel=$('cameraDeviceSelect');
    if(sel&&sel.options&&sel.selectedIndex>=0){
      return String(sel.options[sel.selectedIndex].textContent||'').trim();
    }
    return '';
  }

  function setSkipReason(reason,eventName){
    st.lastSkipReason=String(reason||'');
    st.lastSkipAt=performance.now();
    if(eventName){
      st.lastEvent=String(eventName);
      st.lastEventAt=st.lastSkipAt;
    }
    emitRuntime();
  }

  function noteEvent(name){
    st.lastEvent=String(name||'');
    st.lastEventAt=performance.now();
  }

  function ensureRunning(opts){
    opts=opts&&typeof opts==='object'?opts:{};
    var reason=String(opts.reason||'ensure');
    if(!isEnabled()){
      return Promise.resolve({ok:false,reason:'disabled'});
    }
    if(st.manualStopped&&reason!=='user_restart'&&reason!=='app_relaunch'){
      st.runtimeStatus='manual_stopped';
      emitRuntime();
      return Promise.resolve({ok:false,reason:'manual_stopped'});
    }
    if(reason==='user_restart'||reason==='app_relaunch'){
      st.manualStopped=false;
    }
    if(isCameraPreviewLive()){
      st.lastError=null;
      st.runtimeStatus='running';
      emitRuntime();
      return Promise.resolve({ok:true,reason:'already_running'});
    }
    if(st.ensureInflight) return st.ensureInflight;
    var pv=global.OneToneCameraPreview;
    if(!pv||!pv.startPreview){
      st.lastError={code:'no_preview',message:t('cameraErrUnsupported','当前环境不支持摄像头 API')};
      st.runtimeStatus='error';
      emitRuntime();
      return Promise.resolve({ok:false,reason:'no_preview',error:st.lastError});
    }
    st.runtimeStatus='starting';
    st.lastError=null;
    emitRuntime();
    st.ensureInflight=Promise.resolve()
      .then(function(){ return pv.startPreview({reason:reason}); })
      .then(function(res){
        st.ensureInflight=null;
        if(res&&res.ok===false){
          st.lastError=res.error||{code:res.reason||'start_failed',message:res.message||t('cameraErrGeneric','摄像头出错：{msg}').replace('{msg}',res.reason||'unknown')};
          st.runtimeStatus='error';
          emitRuntime();
          return {ok:false,reason:st.lastError.code,error:st.lastError};
        }
        st.lastError=null;
        st.runtimeStatus='running';
        emitRuntime();
        return {ok:true,reason:reason};
      })
      .catch(function(err){
        st.ensureInflight=null;
        var msg='';
        try{
          if(pv.mapError) msg=pv.mapError(err);
          else msg=String(err&&err.message||err||'unknown');
        }catch(_){
          msg=String(err&&err.message||err||'unknown');
        }
        st.lastError={code:String(err&&(err.name||err.code)||'start_failed'),message:msg};
        st.runtimeStatus='error';
        emitRuntime();
        return {ok:false,reason:st.lastError.code,error:st.lastError};
      });
    return st.ensureInflight;
  }

  function ensureStopped(opts){
    opts=opts&&typeof opts==='object'?opts:{};
    var reason=String(opts.reason||'stop');
    var pv=global.OneToneCameraPreview;
    if(pv&&pv.stop){
      try{ pv.stop({reason:reason}); }catch(_){}
    }
    if(reason==='user_manual'){
      st.manualStopped=true;
      st.runtimeStatus='manual_stopped';
      st.lastError=null;
    }else if(reason==='master_off'){
      st.manualStopped=false;
      st.lastError=null;
      st.runtimeStatus='off';
    }else{
      st.runtimeStatus=st.manualStopped?'manual_stopped':(isEnabled()?(st.lastError?'error':'off'):'off');
    }
    emitRuntime();
    return Promise.resolve({ok:true,reason:reason});
  }

  function reconcileRuntime(opts){
    opts=opts&&typeof opts==='object'?opts:{};
    var reason=String(opts.reason||'reconcile');
    if(!isEnabled()){
      return ensureStopped({reason:'master_off'});
    }
    if(st.manualStopped){
      st.runtimeStatus='manual_stopped';
      emitRuntime();
      return Promise.resolve({ok:false,reason:'manual_stopped'});
    }
    if(st.runtimeStatus==='error'&&reason!=='user_restart'&&reason!=='device_change'&&reason!=='master_on'){
      // Stay in error hold — do not hammer getUserMedia on every reconcile.
      emitRuntime();
      return Promise.resolve({ok:false,reason:'error_hold',error:st.lastError});
    }
    return ensureRunning({reason:reason==='config_applied'?'config_applied':reason});
  }

  function setRuntimeStateListener(fn){
    if(typeof fn!=='function') return function(){};
    st.runtimeListeners.push(fn);
    try{ fn(getRuntimeStatus()); }catch(_){}
    return function(){
      var i=st.runtimeListeners.indexOf(fn);
      if(i>=0) st.runtimeListeners.splice(i,1);
    };
  }

  function clearManualStop(){
    st.manualStopped=false;
  }

  function requestRestart(opts){
    opts=opts&&typeof opts==='object'?opts:{};
    st.manualStopped=false;
    st.lastError=null;
    return ensureRunning({reason:opts.reason||'user_restart'});
  }

  /** @deprecated use reconcileRuntime / ensureRunning / ensureStopped */
  function syncPreviewWithMaster(wantOn){
    if(wantOn) return reconcileRuntime({reason:'master_on'});
    return ensureStopped({reason:'master_off'});
  }

  function persistPresencePrefs(partial){
    partial=partial&&typeof partial==='object'?partial:{};
    var cp=cameraPrefs();
    var cur=basePresencePrefs();
    var wasEnabled=!!cur.enabled;
    var touchedEnabled=partial.enabled!==undefined;
    var hasAction=partial.onAway!=null||partial.onReturn!=null||partial.shakeHead!=null||partial.deliberateBlink!=null;
    var hasTriggers=partial.triggers!=null&&typeof partial.triggers==='object';

    if(touchedEnabled){
      cur.enabled=!!partial.enabled;
      cp.presenceActions=cur;
      mirrorTopLevelEnabled(cp,cur.enabled);
    }

    if((hasAction||hasTriggers)&&scenarioCameraEditMapping()){
      if(touchedEnabled){
        if(global.OneToneConfigPersist){
          if(global.OneToneConfigPersist.saveCameraPrefsQuiet) global.OneToneConfigPersist.saveCameraPrefsQuiet();
          else if(global.OneToneConfigPersist.saveAsync) global.OneToneConfigPersist.saveAsync();
          else if(global.OneToneConfigPersist.save) global.OneToneConfigPersist.save();
        }
      }
      persistScenarioCameraOverride(partial);
      st.enabled=!!basePresencePrefs().enabled;
      syncUiFromPrefs();
      syncDetectInterval();
      emitRuntime();
      if(global.OneToneCameraPreview&&global.OneToneCameraPreview.syncLiveLandmarker){
        try{ global.OneToneCameraPreview.syncLiveLandmarker(); }catch(_){}
      }
      if(touchedEnabled&&cur.enabled!==wasEnabled){
        if(cur.enabled){
          st.manualStopped=false;
          reconcileRuntime({reason:'master_on'});
        }else{
          ensureStopped({reason:'master_off'});
        }
      }
      return;
    }

    if(partial.onAway!=null) cur.onAway=normalizeAction(partial.onAway);
    if(partial.onReturn!=null) cur.onReturn=normalizeAction(partial.onReturn);
    if(partial.shakeHead!=null) cur.shakeHead=normalizeAction(partial.shakeHead);
    if(partial.deliberateBlink!=null) cur.deliberateBlink=normalizeAction(partial.deliberateBlink);
    if(hasTriggers){
      cur.triggers=normalizeTriggers(Object.assign({},cur.triggers,partial.triggers),cur);
    }
    cp.presenceActions=cur;
    mirrorTopLevelEnabled(cp,!!cur.enabled);
    st.enabled=!!cur.enabled;
    if(global.OneToneConfigPersist){
      if(global.OneToneConfigPersist.saveCameraPrefsQuiet) global.OneToneConfigPersist.saveCameraPrefsQuiet();
      else if(global.OneToneConfigPersist.saveAsync) global.OneToneConfigPersist.saveAsync();
      else if(global.OneToneConfigPersist.save) global.OneToneConfigPersist.save();
    }
    syncUiFromPrefs();
    syncDetectInterval();
    emitRuntime();
    if(global.OneToneCameraPreview&&global.OneToneCameraPreview.syncLiveLandmarker){
      try{ global.OneToneCameraPreview.syncLiveLandmarker(); }catch(_){}
    }
    if(touchedEnabled&&cur.enabled!==wasEnabled){
      if(cur.enabled){
        st.manualStopped=false;
        reconcileRuntime({reason:'master_on'});
      }else{
        ensureStopped({reason:'master_off'});
      }
    }
  }

  function isEnabled(){
    return !!basePresencePrefs().enabled;
  }

  function isRunning(){
    return isCameraPreviewLive();
  }

  function isCalibrating(){
    var cal=global.OneToneCameraGazeCalibration;
    return !!(cal&&cal.getState&&cal.getState().running);
  }

  function headDirFromYaw(yaw){
    if(yaw==null||!isFinite(yaw)) return 'unknown';
    if(yaw<YAW_LEFT) return 'left';
    if(yaw>YAW_RIGHT) return 'right';
    return 'center';
  }

  function snapshot(){
    var listening='';
    try{
      if(typeof gestureLabel==='function') listening=gestureLabel();
    }catch(_){}
    return {
      enabled:isEnabled(),
      presence:st.presence,
      faceDetected:!!st.faceDetected,
      headDirection:st.headDirection,
      lostSince:st.lostSince||0,
      returnedSince:st.returnedSince||0,
      absentDurationMs:st.absentDurationMs||0,
      presentDurationMs:st.presentDurationMs||0,
      lastGesture:st.lastGesture||'none',
      pulseActive:!!(st.pulseUntil&&performance.now()<st.pulseUntil),
      shakeListeningLabel:listening,
      privacyOpen:!!st.privacyOpen,
      lowPowerActive:!!st.lowPowerActive,
      lastAction:st.lastAction||'none',
      pausedByPresence:!!st.pausedByPresence
    };
  }

  function emitState(){
    renderHeroUi();
    if(typeof st.onStateChange==='function'){
      try{ st.onStateChange(snapshot()); }catch(_){}
    }
  }

  function syncDetectInterval(){
    var api=global.OneToneCameraGazeLandmarker;
    if(!api||!api.setDetectIntervalMs) return;
    var gazeOn=false;
    try{
      var gp=global.OneToneCameraPreview;
      if(gp&&gp.getGazeDebugState){
        var gs=gp.getGazeDebugState();
        gazeOn=!!(gs&&gs.enabled);
      }
    }catch(_){}
    if(gazeOn||isCalibrating()){
      api.setDetectIntervalMs(DETECT_GAZE_MS);
      return;
    }
    if(!isEnabled()){
      api.setDetectIntervalMs(DETECT_GAZE_MS);
      return;
    }
    var p=prefs();
    var gestureOn=p.shakeHead!=='none'||p.deliberateBlink!=='none';
    if(gestureOn&&st.presence!=='away'){
      api.setDetectIntervalMs(DETECT_SHAKE_MS);
      if(typeof st.onDetectInterval==='function'){
        try{ st.onDetectInterval(DETECT_SHAKE_MS); }catch(_){}
      }
      return;
    }
    if(st.presence==='away') api.setDetectIntervalMs(DETECT_AWAY_MS);
    else api.setDetectIntervalMs(DETECT_PRESENT_MS);
    if(typeof st.onDetectInterval==='function'){
      try{ st.onDetectInterval(st.presence==='away'?DETECT_AWAY_MS:DETECT_PRESENT_MS); }catch(_){}
    }
  }

  function invokeIpc(cmd,args){
    if(!global.OneToneIpc||!global.OneToneIpc.invoke){
      return Promise.resolve({ok:false,reason:'no_ipc'});
    }
    return global.OneToneIpc.invoke(cmd,args||{}).catch(function(err){
      return {ok:false,reason:err&&err.message?err.message:'invoke_failed'};
    });
  }

  function canPressKey(){
    if(st.presence!=='present') return false;
    if(runtime().paused) return false;
    if(st.privacyOpen) return false;
    return true;
  }

  function sourceToBindKey(source){
    if(source==='away') return 'onAway';
    if(source==='return') return 'onReturn';
    if(source==='shake') return 'shakeHead';
    if(source==='blink') return 'deliberateBlink';
    return '';
  }

  function isKeyAction(action){
    return action==='pressEsc'||action==='pressCtrlI';
  }

  function actionRiskLevel(action){
    action=normalizeAction(action);
    if(action==='privacyScreen'||action==='pauseVoice'||action==='lowPowerMode') return 'low';
    if(action==='pressEsc'||action==='pressCtrlI'||action==='resumeVoice') return 'mid';
    if(action==='none') return 'none';
    return 'high';
  }

  function skipMsg(reason,fallback){
    var map={
      master_off:['cameraSkipMasterOff','摄像头识别已关闭'],
      not_running:['cameraSkipNotRunning','摄像头未运行'],
      calibrating:['cameraSkipCalibrating','校准中，暂不执行'],
      need_present:['cameraPresenceSkipNeedPresent','未执行：需要在席'],
      privacy_blocks_key:['cameraSkipPrivacyBlocksKey','应用内遮罩打开时不会发送按键'],
      voice_paused:['cameraSkipVoicePaused','语音已暂停，无法发送按键'],
      invalid_combo:['cameraPresenceSkipInvalidCombo','此动作与当前事件不兼容'],
      cooldown:['cameraSkipCooldown','未执行：冷却中'],
      resume_manual:['cameraPresenceSkipResumeManual','只恢复由摄像头触发的暂停'],
      cancelled:['cameraSkipCancelled','状态变化，已取消']
    };
    var pair=map[reason];
    if(pair) return t(pair[0],pair[1]);
    return fallback!=null?fallback:String(reason||'');
  }

  function gateFail(reason,message){
    return {ok:false,reason:reason,message:message||skipMsg(reason)};
  }

  function gateOk(){
    return {ok:true,reason:'',message:''};
  }

  /**
   * State + source/action legality only — no key cooldown (see shouldThrottleCameraAction).
   * Source-specific: away does NOT require present.
   */
  function canExecuteCameraAction(action,source){
    action=normalizeAction(action);
    source=String(source||'');
    if(action==='none') return gateOk();
    if(!isEnabled()) return gateFail('master_off');
    if(!isRunning()) return gateFail('not_running');
    if(isCalibrating()) return gateFail('calibrating');

    var bindKey=sourceToBindKey(source);
    if(bindKey&&!isActionAllowedForKey(bindKey,action)){
      return gateFail('invalid_combo',actionBlockedReason(bindKey,action)||skipMsg('invalid_combo'));
    }

    if(source==='away'){
      // Away fires while presence is away — never require present.
      if(isKeyAction(action)) return gateFail('need_present');
      return gateOk();
    }

    if(source==='return'){
      // Return path may close privacy overlay; do not block on privacyOpen.
      if(isKeyAction(action)) return gateFail('invalid_combo');
      if(action==='resumeVoice'&&!(st.pausedByPresence&&!st.wasPausedBeforeAway)){
        return gateFail('resume_manual');
      }
      return gateOk();
    }

    // Gestures: shake / blink
    if(source==='shake'||source==='blink'){
      if(st.presence!=='present') return gateFail('need_present');
      if(isKeyAction(action)){
        if(st.privacyOpen) return gateFail('privacy_blocks_key');
        if(runtime().paused) return gateFail('voice_paused');
      }
      if(action==='resumeVoice'&&!(st.pausedByPresence&&!st.wasPausedBeforeAway)){
        return gateFail('resume_manual');
      }
      return gateOk();
    }

    // Unknown source: conservative key rules
    if(isKeyAction(action)&&!canPressKey()){
      if(st.privacyOpen) return gateFail('privacy_blocks_key');
      if(st.presence!=='present') return gateFail('need_present');
      if(runtime().paused) return gateFail('voice_paused');
      return gateFail('need_present');
    }
    return gateOk();
  }

  function shouldThrottleCameraAction(action,source){
    action=normalizeAction(action);
    source=String(source||'');
    if(action==='none') return gateOk();
    var now=performance.now();
    if(isKeyAction(action)){
      var throttleMs=action==='pressCtrlI'?KEY_THROTTLE_VOICE_MS:KEY_THROTTLE_MS;
      if(now-st.lastKeyAt<throttleMs) return gateFail('cooldown');
    }
    // Gesture pattern detectors already enforce SHAKE/BLINK cooldown before fireGesture.
    return gateOk();
  }

  function cancelPendingAction(reason){
    if(st.pendingActionTimer){
      try{ clearTimeout(st.pendingActionTimer); }catch(_){}
      st.pendingActionTimer=0;
    }
    if(st.pendingAction){
      st.pendingAction=null;
      setSkipReason(skipMsg(reason||'cancelled'),reason||'cancelled');
    }
  }

  function logPresence(line){
    try{
      if(global.OneToneDom&&global.OneToneDom.log) global.OneToneDom.log('presence '+line);
      else console.log('[onetone] presence '+line);
    }catch(_){}
  }

  function activeHabitMapping(){
    var cfg=stateRoot().config||{};
    if(global.OneToneHabitProfile&&global.OneToneHabitProfile.projectActive){
      var p=global.OneToneHabitProfile.projectActive(cfg);
      if(p&&p.mapping) return p.mapping;
    }
    if(global.OneToneMappingCore&&global.OneToneMappingCore.activeScene){
      return global.OneToneMappingCore.activeScene();
    }
    var id=String(cfg.activeSceneId||cfg.active_scene_id||'').trim();
    if(id&&Array.isArray(cfg.mappings)){
      for(var i=0;i<cfg.mappings.length;i++){
        if(String(cfg.mappings[i].id||'')===id) return cfg.mappings[i];
      }
    }
    return null;
  }

  function isWorkflowAppTarget(id){
    if(global.OneToneSceneConfig&&global.OneToneSceneConfig.isWorkflowAppTarget){
      return !!global.OneToneSceneConfig.isWorkflowAppTarget(id);
    }
    var t0=String(id||'').trim();
    return t0==='cursor-chat'||t0==='codex-chat'||t0==='claude-code'||t0==='minimax-chat';
  }

  function presetActivateKey(presetId){
    presetId=String(presetId||'').trim();
    if(!presetId||!global.OneToneImePresets||!global.OneToneImePresets.presetById) return '';
    var p=global.OneToneImePresets.presetById(presetId);
    return p&&p.targetKey?String(p.targetKey).trim():'';
  }

  function resolveConfiguredVoiceEngineKey(cfg){
    cfg=cfg||{};
    var vosk=cfg.voiceVosk||cfg.voice_vosk||{};
    var sapi=cfg.voiceSapi||cfg.voice_sapi||{};
    var kws=cfg.voiceKws||cfg.voice_kws||{};
    var end=cfg.voiceEnd||cfg.voice_end||{};
    var voskKey=String(vosk.targetKey||vosk.target_key||'').trim();
    var sapiKey=String(sapi.targetKey||sapi.target_key||'').trim();
    var kwsKey=String(kws.targetKey||kws.target_key||'').trim();
    var endKey=String(end.targetKey||end.target_key||'').trim();
    if(vosk.enabled&&voskKey) return voskKey;
    if(sapi.enabled&&sapiKey) return sapiKey;
    if(kws.enabled&&kwsKey) return kwsKey;
    if(voskKey) return voskKey;
    if(sapiKey) return sapiKey;
    if(kwsKey) return kwsKey;
    if(endKey) return endKey;
    return '';
  }

  /**
   * User's IME activate shortcut from their custom scheme — never invent RAlt / Ctrl+I / Win+H.
   * Prefer current habit IME binding, then voice-settings keys, then global imePresetId.
   */
  function resolveVoiceActivateKey(){
    var cfg=stateRoot().config||{};
    var m=activeHabitMapping();

    if(m){
      var ov=m.voiceOverride||m.voice_override||null;
      if(ov&&ov.targetKey&&String(ov.targetKey).trim()){
        return String(ov.targetKey).trim();
      }
      // Habit IME / custom activate key (not Cursor/workflow app shortcuts).
      if(!isWorkflowAppTarget(m.appTargetId||m.app_target_id)){
        var mapKey=String(m.targetKey||m.target_key||'').trim();
        if(mapKey) return mapKey;
        var fromPreset=presetActivateKey(m.imePresetId||m.ime_preset_id);
        if(fromPreset) return fromPreset;
      }
    }

    var fromVoice=resolveConfiguredVoiceEngineKey(cfg);
    if(fromVoice) return fromVoice;

    return presetActivateKey(cfg.imePresetId||cfg.ime_preset_id);
  }

  function voiceActivateActionLabel(){
    var base=t('cameraPresenceActionCtrlI','语音输入法激活');
    var key=resolveVoiceActivateKey();
    if(!key) return base+'（'+t('cameraPresenceVoiceKeyUnset','未配置')+'）';
    var friendly=key;
    try{
      if(global.OneToneKeyLabels&&global.OneToneKeyLabels.friendlyKeyName){
        friendly=global.OneToneKeyLabels.friendlyKeyName(key,global.OneToneI18n&&global.OneToneI18n.getLang?global.OneToneI18n.getLang():'zh')||key;
      }
    }catch(_){}
    return base+'（'+friendly+'）';
  }

  function pressKey(targetKey,opts){
    opts=opts||{};
    var now=performance.now();
    var throttleMs=opts.voiceActivate?KEY_THROTTLE_VOICE_MS:KEY_THROTTLE_MS;
    if(now-st.lastKeyAt<throttleMs){
      // Last-line silent throttle — outer shouldThrottle already surfaces skip to UI.
      logPresence('key throttled '+targetKey);
      return Promise.resolve({ok:false,reason:'throttled'});
    }
    if(!canPressKey()){
      logPresence('key blocked presence='+st.presence+' paused='+(runtime().paused?'1':'0'));
      return Promise.resolve({ok:false,reason:'blocked'});
    }
    st.lastKeyAt=now;
    logPresence('key send '+targetKey);
    return invokeIpc('cmd_test_send',{mappingId:null,targetKey:targetKey}).then(function(res){
      if(!res||!res.ok){
        var reason=res&&res.reason?String(res.reason):'failed';
        logPresence('key fail '+targetKey+' reason='+reason);
        if(reason==='paused'){
          toast(t('cameraPresenceKeyPaused','监听已暂停，无法注入按键'));
        }else{
          toast(t('cameraPresenceKeyFailed','按键发送失败')+'（'+targetKey+'）');
        }
      }else{
        logPresence('key ok '+targetKey);
        toast(t('cameraPresenceKeySent','已发送激活键')+' '+targetKey);
      }
      return res||{ok:false};
    });
  }

  function setPrivacyOpen(open){
    open=!!open;
    st.privacyOpen=open;
    var el=$('cameraPrivacyOverlay');
    if(el){
      el.hidden=!open;
      el.setAttribute('aria-hidden',open?'false':'true');
      el.classList.toggle('is-active',open);
    }
    emitState();
  }

  function closePrivacyScreen(fromEsc){
    if(!st.privacyOpen) return;
    setPrivacyOpen(false);
    if(fromEsc){
      toast(t('cameraPrivacyClosed','应用内遮罩已关闭'));
    }
  }

  function openPrivacyScreen(){
    setPrivacyOpen(true);
  }

  function allowedActionsForBindKey(key){
    if(key==='onAway'){
      return ['none','privacyScreen','pauseVoice','lowPowerMode'];
    }
    if(key==='onReturn'){
      return ['none','resumeVoice','privacyScreen'];
    }
    return ['none','pressEsc','pressCtrlI','privacyScreen','pauseVoice','resumeVoice','lowPowerMode'];
  }

  function isActionAllowedForKey(key,action){
    action=normalizeAction(action);
    return allowedActionsForBindKey(key).indexOf(action)>=0;
  }

  function actionBlockedReason(key,action){
    action=normalizeAction(action);
    if(action==='none') return '';
    if(isActionAllowedForKey(key,action)){
      if(action==='resumeVoice'){
        return t('cameraPresenceActionResumeHint','只恢复由摄像头触发的暂停');
      }
      return '';
    }
    if(key==='onAway'&&(action==='pressEsc'||action==='pressCtrlI')){
      return t('cameraPresenceSkipNeedPresent','未执行：需要在席');
    }
    return t('cameraPresenceSkipInvalidCombo','此动作与当前事件不兼容');
  }

  function actionTileHint(key,action){
    action=normalizeAction(action);
    if(action==='none') return '';
    if(key==='onAway') return t('cameraTileHintAway','适合离席');
    if(action==='resumeVoice') return t('cameraTileHintResume','只恢复摄像头暂停');
    if(isKeyAction(action)) return t('cameraTileHintNeedPresent','需在席');
    return t('cameraTileHintNoSend','不会发送内容');
  }

  function exitLowPowerMode(){
    if(!st.lowPowerActive) return;
    st.lowPowerActive=false;
    try{
      if(global.OneToneVoiceWake&&global.OneToneVoiceWake.switchListeningStrategy){
        global.OneToneVoiceWake.switchListeningStrategy('auto');
      }
    }catch(_){}
    toast(t('cameraPresenceLowPowerOff','已退出低消耗运行'));
  }

  function executeActionNow(action,source){
    action=normalizeAction(action);
    st.lastAction=action;
    st.lastActionAt=performance.now();
    noteEvent(source||action);
    st.lastSkipReason='';
    st.pendingPreviewLine='';

    if(action==='pressEsc') return pressKey('Esc');
    if(action==='pressCtrlI'){
      var voiceKey=resolveVoiceActivateKey();
      logPresence('voice-activate resolve='+(voiceKey||'(unset)'));
      if(!voiceKey){
        toast(t('cameraPresenceVoiceKeyUnsetToast','请先在按键/语音设置中选择输入法激活方案'));
        setSkipReason(t('cameraPresenceVoiceKeyUnset','未配置'),source);
        return Promise.resolve({ok:false,reason:'unset'});
      }
      return pressKey(voiceKey,{voiceActivate:true});
    }

    if(action==='privacyScreen'){
      openPrivacyScreen();
      emitRuntime();
      return Promise.resolve({ok:true,action:action});
    }

    if(action==='lowPowerMode'){
      st.lowPowerActive=true;
      try{
        if(global.OneToneVoiceWake&&global.OneToneVoiceWake.switchListeningStrategy){
          global.OneToneVoiceWake.switchListeningStrategy('resourceSaver');
        }
      }catch(_){}
      emitRuntime();
      toast(t('cameraPresenceLowPowerOn','已切换低消耗运行'));
      return Promise.resolve({ok:true,action:action});
    }

    if(action==='pauseVoice'){
      var rt=runtime();
      st.wasPausedBeforeAway=!!rt.paused;
      if(!rt.paused){
        st.pausedByPresence=true;
        return invokeIpc('cmd_pause',{}).then(function(res){
          emitRuntime();
          return res||{ok:true,action:action};
        });
      }
      st.pausedByPresence=false;
      setSkipReason(t('cameraPresenceSkipAlreadyPaused','语音已处于暂停，未重复操作'),source);
      emitRuntime();
      return Promise.resolve({ok:true,action:action,skipped:true});
    }

    if(action==='resumeVoice'){
      if(st.pausedByPresence&&!st.wasPausedBeforeAway){
        return invokeIpc('cmd_resume',{}).then(function(res){
          st.pausedByPresence=false;
          emitRuntime();
          return res||{ok:true,action:action};
        });
      }
      st.pausedByPresence=false;
      setSkipReason(skipMsg('resume_manual'),source);
      emitRuntime();
      return Promise.resolve({ok:true,action:action,skipped:true});
    }

    return Promise.resolve({ok:false,reason:'unknown',action:action,source:source});
  }

  function setPendingPreview(action,source){
    st.pendingPreviewLine=t('cameraPendingExecute','已识别，马上执行：{action}').replace('{action}',actionLabel(action));
    noteEvent(source||action);
    st.lastSkipReason='';
    emitRuntime();
  }

  function dispatchAction(action,source,opts){
    opts=opts||{};
    action=normalizeAction(action);
    source=String(source||'');
    if(action==='none') return Promise.resolve({ok:true,action:'none'});

    var gate=canExecuteCameraAction(action,source);
    if(!gate.ok){
      setSkipReason(gate.message||skipMsg(gate.reason),source);
      logPresence('skip '+source+' action='+action+' reason='+gate.reason);
      return Promise.resolve({ok:false,reason:gate.reason,message:gate.message});
    }
    var thr=shouldThrottleCameraAction(action,source);
    if(!thr.ok){
      setSkipReason(thr.message||skipMsg(thr.reason),source);
      logPresence('throttle '+source+' action='+action);
      return Promise.resolve({ok:false,reason:thr.reason,message:thr.message});
    }

    var risk=actionRiskLevel(action);
    if(risk==='mid'&&!opts.immediate){
      cancelPendingAction();
      setPendingPreview(action,source);
      st.pendingAction={action:action,source:source};
      st.pendingActionTimer=setTimeout(function(){
        st.pendingActionTimer=0;
        var pending=st.pendingAction;
        st.pendingAction=null;
        st.pendingPreviewLine='';
        if(!pending) return;
        var gate2=canExecuteCameraAction(pending.action,pending.source);
        if(!gate2.ok){
          setSkipReason(gate2.message||skipMsg('cancelled'),pending.source);
          logPresence('pending cancel '+pending.source+' reason='+gate2.reason);
          return;
        }
        var thr2=shouldThrottleCameraAction(pending.action,pending.source);
        if(!thr2.ok){
          setSkipReason(thr2.message||skipMsg(thr2.reason),pending.source);
          return;
        }
        executeActionNow(pending.action,pending.source).then(function(res){
          if(!res||res.ok===false||res.skipped) return;
          if(pending.source==='return') toast(t('cameraPresenceReturnFired','已回席'));
        });
      },MID_RISK_DELAY_MS);
      return Promise.resolve({ok:true,action:action,pending:true});
    }

    return executeActionNow(action,source);
  }

  function triggerEnabled(kind,p){
    p=p||prefs();
    var tr=p.triggers||{};
    if(kind==='away') return !!tr.away;
    if(kind==='shake') return !!tr.shake;
    if(kind==='blink') return !!tr.blink;
    return false;
  }

  function transitionPresence(next,now){
    if(st.presence===next) return;
    var prev=st.presence;
    st.presence=next;
    if(next==='away'){
      st.lostSince=now;
      st.returnedSince=0;
      resetGestureTrackers();
      cancelPendingAction('cancelled');
    }else if(next==='present'){
      st.returnedSince=now;
    }
    syncDetectInterval();
    emitRuntime();

    var p=prefs();
    if(!p.enabled) return;
    if(isCalibrating()) return;
    if(!triggerEnabled('away',p)) return;

    if(next==='away'&&(prev==='present'||prev==='unknown')){
      noteEvent('away');
      var awayAct=normalizeAction(p.onAway);
      if(awayAct==='none'){
        setSkipReason(t('cameraTriggerRecognizedUnbound','识别中 · 未绑定动作'),'away');
        return;
      }
      dispatchAction(awayAct,'away').then(function(res){
        if(awayAct!=='none'&&res&&res.ok!==false&&!res.skipped&&!res.pending) toast(t('cameraPresenceAwayFired','已离席'));
      });
    }else if(next==='present'&&prev==='away'){
      // Always allow return to dismiss overlay — independent of action binding.
      if(st.privacyOpen) closePrivacyScreen(false);
      if(st.lowPowerActive) exitLowPowerMode();
      noteEvent('return');
      var retAct=normalizeAction(p.onReturn);
      if(retAct==='none'){
        emitRuntime();
        return;
      }
      dispatchAction(retAct,'return').then(function(res){
        if(retAct!=='none'&&res&&res.ok!==false&&!res.skipped&&!res.pending) toast(t('cameraPresenceReturnFired','已回席'));
      });
    }
  }

  function resetGestureTrackers(){
    st.shakeSeq=[];
    st.shakeHyst='center';
    st.lastYaw=null;
    st.blinkClosed=false;
    st.blinkCloseSince=0;
    st.blinkOpenSince=0;
  }

  function pulseGesture(kind){
    st.lastGesture=kind;
    st.pulseUntil=performance.now()+GESTURE_PULSE_MS;
    var orb=$('cameraPresenceOrb');
    if(orb){
      orb.classList.remove('is-gesture');
      void orb.offsetWidth;
      orb.classList.add('is-gesture');
    }
    if(st.pulseTimer) clearTimeout(st.pulseTimer);
    st.pulseTimer=setTimeout(function(){
      st.pulseTimer=0;
      var o=$('cameraPresenceOrb');
      if(o) o.classList.remove('is-gesture');
      renderHeroUi();
    },GESTURE_PULSE_MS+40);
    renderHeroUi();
  }

  function fireGesture(kind,action){
    action=normalizeAction(action);
    if(action==='none') return;
    noteEvent(kind);
    logPresence(kind+' fire action='+action);
    if(kind==='shake') toast(t('cameraPresenceShakeDetected','已识别摇头'));
    else if(kind==='blink') toast(t('cameraPresenceBlinkDetected','已识别：闭眼半秒'));
    pulseGesture(kind);
    dispatchAction(action,kind);
  }

  function pruneShakeSeq(now){
    while(st.shakeSeq.length&&(now-st.shakeSeq[0].t)>SHAKE_WINDOW_MS){
      st.shakeSeq.shift();
    }
  }

  function shakeHystSide(yaw){
    var cur=st.shakeHyst||'center';
    if(cur==='left'){
      if(yaw>-SHAKE_EXIT) return 'center';
      return 'left';
    }
    if(cur==='right'){
      if(yaw<SHAKE_EXIT) return 'center';
      return 'right';
    }
    if(yaw<=-SHAKE_ENTER) return 'left';
    if(yaw>=SHAKE_ENTER) return 'right';
    return 'center';
  }

  function matchShakePattern(){
    pruneShakeSeq(performance.now());
    if(st.shakeSeq.length<3) return false;
    var a=st.shakeSeq[st.shakeSeq.length-3].side;
    var b=st.shakeSeq[st.shakeSeq.length-2].side;
    var c=st.shakeSeq[st.shakeSeq.length-1].side;
    if(a===b||b===c||a===c) return false;
    return (a==='left'&&b==='right'&&c==='left')||(a==='right'&&b==='left'&&c==='right');
  }

  function updateShake(now,yaw){
    var p=prefs();
    if(!triggerEnabled('shake',p)){
      st.shakeSeq=[];
      st.shakeHyst='center';
      return;
    }
    if(st.presence!=='present') return;
    if(yaw==null||!isFinite(yaw)) return;
    st.lastYaw=yaw;

    var next=shakeHystSide(yaw);
    if(next!==st.shakeHyst){
      var prev=st.shakeHyst;
      st.shakeHyst=next;
      if((next==='left'||next==='right')&&next!==prev){
        var last=st.shakeSeq.length?st.shakeSeq[st.shakeSeq.length-1]:null;
        if(!last||last.side!==next){
          st.shakeSeq.push({side:next,t:now});
          pruneShakeSeq(now);
          if(st.shakeSeq.length>5) st.shakeSeq=st.shakeSeq.slice(-5);
          if((now-st.lastShakeLogAt)>=SHAKE_LOG_MIN_MS){
            st.lastShakeLogAt=now;
            logPresence('shake seq='+st.shakeSeq.map(function(x){ return x.side[0]; }).join('')+' yaw='+yaw.toFixed(2));
          }
        }
      }
    }

    if(matchShakePattern()){
      if((now-st.lastShakeAt)<SHAKE_COOLDOWN_MS){
        st.shakeSeq=[];
        return;
      }
      st.lastShakeAt=now;
      st.shakeSeq=[];
      st.shakeHyst='center';
      noteEvent('shake');
      if(normalizeAction(p.shakeHead)==='none'){
        pulseGesture('shake');
        setSkipReason(t('cameraTriggerRecognizedUnbound','已识别 · 未绑定动作'),'shake');
        toast(t('cameraPresenceShakeDetected','已识别摇头'));
        return;
      }
      fireGesture('shake',p.shakeHead);
    }
  }

  function updateBlink(now,blinkScore){
    var p=prefs();
    if(!triggerEnabled('blink',p)){
      st.blinkClosed=false;
      st.blinkCloseSince=0;
      st.blinkOpenSince=0;
      return;
    }
    if(st.presence!=='present') return;
    // Eyes-closed frames often drop faceDetected / blink briefly — keep counting
    // as closed instead of aborting the gesture (was the main "闭眼半秒无反应" bug).
    if(blinkScore==null||!isFinite(blinkScore)){
      if(st.blinkClosed) return;
      return;
    }

    if(!st.blinkClosed){
      if(blinkScore<=BLINK_OFF){
        if(!st.blinkOpenSince) st.blinkOpenSince=now;
      }else if(blinkScore<BLINK_ON){
        // Mid zone — do not start a close, keep open settle if already open.
      }else{
        // Closed enough to start — only if eyes were open long enough (anti-noise).
        if(st.blinkOpenSince&&(now-st.blinkOpenSince)>=BLINK_OPEN_SETTLE_MS){
          st.blinkClosed=true;
          st.blinkCloseSince=now;
          st.blinkOpenSince=0;
        }else if(!st.blinkOpenSince){
          // First frames after enable: allow close without long open settle.
          st.blinkClosed=true;
          st.blinkCloseSince=now;
        }
      }
      return;
    }

    // Currently closed — wait for reopen.
    if(blinkScore<=BLINK_OFF){
      var dur=now-st.blinkCloseSince;
      st.blinkClosed=false;
      st.blinkCloseSince=0;
      st.blinkOpenSince=now;
      if(dur<BLINK_LONG_MIN_MS||dur>BLINK_LONG_MAX_MS){
        if(dur>0&&dur<BLINK_LONG_MIN_MS){
          logPresence('blink too short dur='+Math.round(dur));
          if((now-st.lastBlinkHintAt)>BLINK_HINT_COOLDOWN_MS){
            st.lastBlinkHintAt=now;
            toast(t('cameraPresenceBlinkTooShort','再闭久一点（约半秒）再睁开'));
          }
        }else if(dur>BLINK_LONG_MAX_MS){
          logPresence('blink too long dur='+Math.round(dur));
          if((now-st.lastBlinkHintAt)>BLINK_HINT_COOLDOWN_MS){
            st.lastBlinkHintAt=now;
            toast(t('cameraPresenceBlinkTooLong','闭太久了，请闭约半秒就睁开'));
          }
        }
        return;
      }
      if((now-st.lastBlinkAt)<BLINK_COOLDOWN_MS){
        logPresence('blink cooldown dur='+Math.round(dur));
        return;
      }
      st.lastBlinkAt=now;
      noteEvent('blink');
      if(normalizeAction(p.deliberateBlink)==='none'){
        pulseGesture('blink');
        setSkipReason(t('cameraTriggerRecognizedUnbound','已识别 · 未绑定动作'),'blink');
        toast(t('cameraPresenceBlinkDetected','已识别：闭眼半秒'));
        return;
      }
      fireGesture('blink',p.deliberateBlink);
    }
  }

  function onFrame(point){
    if(!isEnabled()) return;
    var now=performance.now();
    var face=!!(point&&(point.faceDetected===true||(point.state&&point.state!=='lost'&&point.state!=='idle'&&point.confidence>0.12)));
    if(point&&point.faceDetected===false) face=false;
    if(point&&point.state==='lost') face=false;
    // Soften face-lost during deliberate blink — eyelids down often drops tracking.
    if(!face&&st.blinkClosed&&st.presence==='present'){
      face=true;
    }

    st.faceDetected=face;
    st.headDirection=headDirFromYaw(point&&point.yaw);
    var yaw=point&&point.yaw;
    if(yaw==null||!isFinite(yaw)) yaw=null;

    if(face){
      if(!st.faceTrueSince) st.faceTrueSince=now;
      st.faceFalseSince=0;
      st.presentDurationMs=now-st.faceTrueSince;
      st.absentDurationMs=0;
      if(st.presentDurationMs>=PRESENT_MS){
        transitionPresence('present',now);
      }
    }else{
      if(!st.faceFalseSince) st.faceFalseSince=now;
      st.faceTrueSince=0;
      st.absentDurationMs=now-st.faceFalseSince;
      st.presentDurationMs=0;
      if(st.absentDurationMs>=AWAY_MS){
        transitionPresence('away',now);
      }
    }

    if(st.presence==='present'&&!isCalibrating()){
      // Blink may continue while face flickers; shake still needs a live face+yaw.
      updateBlink(now,point&&point.blink);
      if(face) updateShake(now,yaw);
    }

    renderHeroUi();
  }

  function reset(opts){
    opts=opts||{};
    st.presence='unknown';
    st.faceDetected=false;
    st.headDirection='unknown';
    st.lostSince=0;
    st.returnedSince=0;
    st.absentDurationMs=0;
    st.presentDurationMs=0;
    st.faceTrueSince=0;
    st.faceFalseSince=0;
    st.lastGesture='none';
    resetGestureTrackers();
    // Keep privacy overlay if open unless forced
    if(opts.closePrivacy) setPrivacyOpen(false);
    syncDetectInterval();
    emitState();
  }

  function presenceLabel(){
    if(st.privacyOpen) return t('cameraPresenceStatePrivacy','应用内遮罩');
    if(st.lowPowerActive&&st.presence==='away') return t('cameraPresenceStateLowPower','已低消耗');
    if(st.presence==='present') return t('cameraPresenceStatePresent','在席');
    if(st.presence==='away') return t('cameraPresenceStateAway','离席');
    return t('cameraPresenceStateIdle','待命');
  }

  function headLabel(){
    if(st.headDirection==='left') return t('cameraPresenceHeadLeft','左');
    if(st.headDirection==='right') return t('cameraPresenceHeadRight','右');
    if(st.headDirection==='center') return t('cameraPresenceHeadCenter','中');
    return t('cameraPresenceHeadUnknown','—');
  }

  function gestureLabel(){
    if(st.lastGesture==='shake'&&st.pulseUntil&&performance.now()<st.pulseUntil){
      return t('cameraPresenceGestureShake','摇头');
    }
      if(st.lastGesture==='blink'&&st.pulseUntil&&performance.now()<st.pulseUntil){
      return t('cameraPresenceGestureBlink','闭眼半秒');
    }
    var p=prefs();
    if(isEnabled()&&normalizeAction(p.shakeHead)!=='none'){
      if(!isCameraPreviewLive()){
        return t('cameraPresenceNeedPreviewShort','请先开始预览');
      }
      if(st.presence==='present'){
        var seq=st.shakeSeq.map(function(x){
          return x.side==='left'?'左':(x.side==='right'?'右':'');
        }).filter(Boolean).join('→');
        var dir=headLabel();
        if(seq) return dir+' · '+seq;
        return t('cameraPresenceShakeListening','侦测朝向')+' · '+dir;
      }
    }
    if(st.lastGesture==='shake') return t('cameraPresenceGestureShake','摇头');
    if(st.lastGesture==='blink') return t('cameraPresenceGestureBlink','闭眼半秒');
    return t('cameraPresenceGestureNone','无');
  }

  function renderHeroUi(){
    var pill=$('cameraPresenceStatusPill');
    if(pill) pill.textContent=presenceLabel();
    var head=$('cameraPresenceHeadText');
    if(head) head.textContent=headLabel();
    var gest=$('cameraPresenceGestureText');
    if(gest) gest.textContent=gestureLabel();

    var faceEl=$('cameraGlanceFace');
    if(faceEl&&isEnabled()){
      if(st.presence==='present') faceEl.textContent=t('cameraPresenceStatePresent','在席');
      else if(st.presence==='away') faceEl.textContent=t('cameraPresenceStateAway','离席');
      else if(st.faceDetected) faceEl.textContent=t('cameraGazeStateTracking','估计中');
      else faceEl.textContent=t('cameraGlanceFaceUndetected','未检测');
    }

    var orb=$('cameraPresenceOrb');
    if(orb){
      orb.classList.toggle('is-present',st.presence==='present'&&!st.privacyOpen);
      orb.classList.toggle('is-away',st.presence==='away'&&!st.privacyOpen);
      orb.classList.toggle('is-privacy',!!st.privacyOpen);
      orb.classList.toggle('is-idle',st.presence==='unknown'&&!st.privacyOpen);
      orb.classList.toggle('is-off',!isEnabled());
    }

    var toggle=$('cameraPresenceEnabledToggle');
    if(toggle){
      var on=isEnabled();
      toggle.setAttribute('aria-checked',on?'true':'false');
      toggle.classList.toggle('is-on',on);
    }
  }

  var ACTION_OPTS=[
    ['none','cameraPresenceActionNone','无动作'],
    ['pressEsc','cameraPresenceActionEsc','语音取消'],
    ['pressCtrlI','cameraPresenceActionCtrlI','语音输入法激活'],
    ['lowPowerMode','cameraPresenceActionLowPower','软件低消耗运行'],
    ['privacyScreen','cameraPresenceActionPrivacy','应用内遮罩'],
    ['pauseVoice','cameraPresenceActionPause','暂停语音'],
    ['resumeVoice','cameraPresenceActionResume','恢复语音']
  ];

  var BIND_KEYS=['onAway','onReturn','shakeHead','deliberateBlink'];

  function actionLabel(value){
    var cur=normalizeAction(value);
    if(cur==='pressCtrlI') return voiceActivateActionLabel();
    for(var i=0;i<ACTION_OPTS.length;i++){
      if(ACTION_OPTS[i][0]===cur) return t(ACTION_OPTS[i][1],ACTION_OPTS[i][2]);
    }
    return t('cameraPresenceActionNone','无动作');
  }

  function ensureActionTiles(host,key,value){
    if(!host) return;
    var cur=normalizeAction(value);
    var allowed=allowedActionsForBindKey(key);
    if(allowed.indexOf(cur)<0) cur='none';
    var readyKey=key+'|'+allowed.join(',');
    if(host.getAttribute('data-tiles-ready')!==readyKey){
      host.setAttribute('data-tiles-ready',readyKey);
      host.setAttribute('data-camera-bind-key',key);
      host.innerHTML='';
      for(var i=0;i<ACTION_OPTS.length;i++){
        var opt=ACTION_OPTS[i];
        if(allowed.indexOf(opt[0])<0) continue;
        var btn=document.createElement('button');
        btn.type='button';
        btn.className='camera-action-tile';
        btn.setAttribute('data-action',opt[0]);
        btn.setAttribute('role','radio');
        var label=opt[0]==='pressCtrlI'?voiceActivateActionLabel():t(opt[1],opt[2]);
        var tileHint=actionTileHint(key,opt[0]);
        var blockHint=actionBlockedReason(key,opt[0]);
        var titleParts=[];
        if(opt[0]==='pressCtrlI'){
          titleParts.push(t('cameraPresenceActionCtrlIHint','发送当前习惯/语音设置中的输入法激活键'));
        }
        if(tileHint) titleParts.push(tileHint);
        if(blockHint&&opt[0]!=='none'&&opt[0]!=='pressCtrlI') titleParts.push(blockHint);
        btn.title=titleParts.join(' · ');
        btn.textContent=tileHint?label+' · '+tileHint:label;
        host.appendChild(btn);
      }
    }else{
      var kids=host.querySelectorAll('.camera-action-tile');
      for(var j=0;j<kids.length;j++){
        var act=kids[j].getAttribute('data-action');
        for(var k=0;k<ACTION_OPTS.length;k++){
          if(ACTION_OPTS[k][0]===act){
            var label2=act==='pressCtrlI'?voiceActivateActionLabel():t(ACTION_OPTS[k][1],ACTION_OPTS[k][2]);
            var tileHint2=actionTileHint(key,act);
            var h2=actionBlockedReason(key,act);
            var titleParts2=[];
            if(act==='pressCtrlI'){
              titleParts2.push(t('cameraPresenceActionCtrlIHint','发送当前习惯/语音设置中的输入法激活键'));
            }
            if(tileHint2) titleParts2.push(tileHint2);
            if(h2&&act!=='none'&&act!=='pressCtrlI') titleParts2.push(h2);
            kids[j].title=titleParts2.join(' · ');
            kids[j].textContent=tileHint2?label2+' · '+tileHint2:label2;
            break;
          }
        }
      }
    }
    var tiles=host.querySelectorAll('.camera-action-tile');
    for(var n=0;n<tiles.length;n++){
      var on=tiles[n].getAttribute('data-action')===cur;
      tiles[n].classList.toggle('is-selected',on);
      tiles[n].setAttribute('aria-checked',on?'true':'false');
    }
  }

  function setSwitchState(el,on){
    if(!el) return;
    el.classList.toggle('is-on',!!on);
    el.setAttribute('aria-checked',on?'true':'false');
  }

  function syncTriggerSummaries(p){
    var tr=p.triggers||{};
    var awayTrig=!!tr.away;
    var shakeTrig=!!tr.shake;
    var blinkTrig=!!tr.blink;
    var awayBound=p.onAway!=='none'||p.onReturn!=='none';
    var shakeBound=p.shakeHead!=='none';
    var blinkBound=p.deliberateBlink!=='none';

    function summaryFor(trigOn,bound,boundText){
      if(trigOn&&!bound) return t('cameraTriggerRecognizedUnbound','识别中 · 未绑定动作');
      if(!trigOn&&bound) return t('cameraTriggerConfiguredOff','已配置动作 · 识别关闭')+' · '+boundText;
      if(trigOn&&bound) return boundText;
      return t('cameraTriggerSummaryEmpty','尚未绑定结果');
    }

    function syncCard(kind,trigOn,summaryText){
      var card=document.querySelector('#cameraPresenceConfig [data-camera-trigger="'+kind+'"]');
      if(!card) return;
      var sw=card.querySelector('[data-camera-trigger-toggle]');
      var sum=card.querySelector('.camera-bind-summary');
      var go=card.querySelector('.camera-goto-bind');
      setSwitchState(sw,trigOn);
      if(sum){
        sum.textContent=summaryText;
        sum.classList.toggle('is-bound',!!trigOn);
      }
      if(go){
        go.textContent=trigOn&&(kind==='away'?awayBound:(kind==='shake'?shakeBound:blinkBound))
          ? t('cameraGotoBindEdit','修改绑定')
          : t('cameraGotoBind','去绑定结果');
      }
      card.classList.toggle('is-trigger-on',!!trigOn);
    }

    syncCard(
      'away',
      awayTrig,
      summaryFor(
        awayTrig,
        awayBound,
        t('cameraTriggerSummaryAway','离席：{away} · 回席：{ret}')
          .replace('{away}',actionLabel(p.onAway))
          .replace('{ret}',actionLabel(p.onReturn))
      )
    );
    syncCard(
      'shake',
      shakeTrig,
      summaryFor(
        shakeTrig,
        shakeBound,
        t('cameraTriggerSummaryBound','已绑定：{action}').replace('{action}',actionLabel(p.shakeHead))
      )
    );
    syncCard(
      'blink',
      blinkTrig,
      summaryFor(
        blinkTrig,
        blinkBound,
        t('cameraTriggerSummaryBound','已绑定：{action}').replace('{action}',actionLabel(p.deliberateBlink))
      )
    );
  }

  function syncRuntimeChrome(){
    var rs=getRuntimeStatus();
    var statusEl=$('cameraRuntimeStatusText');
    if(statusEl){
      var line='';
      if(!rs.enabled) line=t('cameraRuntimeStatusOff','已配置关闭 · 不会占用摄像头');
      else if(rs.status==='running') line=t('cameraRuntimeStatusRunning','识别运行中');
      else if(rs.status==='starting') line=t('cameraRuntimeStatusStarting','正在启动摄像头…');
      else if(rs.status==='manual_stopped') line=t('cameraRuntimeStatusManual','已配置 · 未运行（已手动停止）');
      else if(rs.status==='error') line=t('cameraRuntimeStatusError','已配置 · 未运行')+' · '+(rs.lastError&&rs.lastError.message?rs.lastError.message:'');
      else line=t('cameraRuntimeStatusIdle','已配置 · 未运行');
      statusEl.textContent=line;
      statusEl.hidden=false;
    }
    var eventEl=$('cameraRuntimeEventText');
    if(eventEl){
      var parts=[];
      if(rs.pendingPreviewLine){
        parts.push(rs.pendingPreviewLine);
      }else{
        if(rs.lastEvent) parts.push(t('cameraRuntimeLastEvent','最近识别')+'：'+rs.lastEvent);
        if(rs.lastSkipReason) parts.push(t('cameraRuntimeSkip','未执行')+'：'+rs.lastSkipReason);
        else if(rs.lastAction&&rs.lastAction!=='none') parts.push(t('cameraRuntimeLastAction','最近动作')+'：'+actionLabel(rs.lastAction));
      }
      eventEl.textContent=parts.join(' · ')||t('cameraRuntimeNoEvent','尚无识别事件');
      eventEl.hidden=false;
    }
    var stopBtn=$('cameraRuntimeStopBtn');
    var restartBtn=$('cameraRuntimeRestartBtn');
    if(stopBtn){
      stopBtn.hidden=!(rs.enabled&&rs.running);
      stopBtn.disabled=!(rs.enabled&&rs.running);
    }
    if(restartBtn){
      var showRestart=!!(rs.enabled&&!rs.running&&(rs.manualStopped||rs.status==='error'||rs.status==='off'));
      restartBtn.hidden=!showRestart;
      restartBtn.disabled=!showRestart;
    }
    var running=!!rs.running;
    ['cameraGazeCalibrateBtn','cameraGazeCalibrateFineBtn','cameraGazeClearCalibrationBtn'].forEach(function(id){
      var el=$(id);
      if(!el) return;
      el.disabled=!running;
      el.setAttribute('aria-disabled',running?'false':'true');
    });
    var masterHint=$('cameraMasterInactiveHint');
    if(masterHint){
      masterHint.hidden=!!rs.enabled;
      masterHint.textContent=t('cameraMasterConfiguredInactive','已配置，但不会生效');
    }
  }

  function syncMasterLockUi(){
    // Config remains editable when master is off — only runtime/calib gated by running.
    var config=$('cameraPresenceConfig');
    if(config){
      config.classList.remove('is-master-off');
      config.setAttribute('aria-disabled','false');
    }
    var bindList=$('cameraPresenceBindList');
    if(bindList){
      bindList.classList.remove('is-master-off');
      bindList.classList.remove('is-dimmed');
      bindList.setAttribute('aria-disabled','false');
    }
    syncRuntimeChrome();
  }

  function syncUiFromPrefs(){
    var p=prefs();
    st.enabled=!!p.enabled;
    ensureActionTiles(document.querySelector('[data-camera-bind-key="onAway"]'),'onAway',p.onAway);
    ensureActionTiles(document.querySelector('[data-camera-bind-key="onReturn"]'),'onReturn',p.onReturn);
    ensureActionTiles(document.querySelector('[data-camera-bind-key="shakeHead"]'),'shakeHead',p.shakeHead);
    ensureActionTiles(document.querySelector('[data-camera-bind-key="deliberateBlink"]'),'deliberateBlink',p.deliberateBlink);
    syncTriggerSummaries(p);
    syncMasterLockUi();
    renderHeroUi();
    if(global.OneToneCameraWorkflow&&global.OneToneCameraWorkflow.syncInactiveHint){
      try{ global.OneToneCameraWorkflow.syncInactiveHint(); }catch(_){}
    }
  }

  function onPrivacyEsc(e){
    if(!st.privacyOpen) return;
    if(e.key!=='Escape'&&e.key!=='Esc') return;
    e.preventDefault();
    e.stopPropagation();
    if(e.stopImmediatePropagation) e.stopImmediatePropagation();
    closePrivacyScreen(true);
  }

  function recommendedPresencePrefs(){
    return {
      triggers:{away:true,shake:true,blink:true},
      onAway:'privacyScreen',
      onReturn:'resumeVoice',
      shakeHead:'pressEsc',
      deliberateBlink:'pressCtrlI'
    };
  }

  function applyRecommendedPresencePrefs(){
    var rec=recommendedPresencePrefs();
    var lines=[
      t('cameraRecommendConfirmIntro','将写入以下推荐绑定：'),
      t('cameraPresenceOnAway','离席时')+' → '+actionLabel(rec.onAway),
      t('cameraPresenceOnReturn','回席时')+' → '+actionLabel(rec.onReturn),
      t('cameraCardShakeTitle','摇头')+' → '+actionLabel(rec.shakeHead),
      t('cameraCardBlinkTitle','闭眼半秒')+' → '+actionLabel(rec.deliberateBlink),
      t('cameraRecommendConfirmTriggers','并打开离席 / 摇头 / 闭眼识别')
    ];
    var ok=false;
    try{
      ok=!!global.confirm(lines.join('\n'));
    }catch(_){
      ok=false;
    }
    if(!ok) return false;
    persistPresencePrefs(rec);
    toast(t('cameraRecommendApplied','已套用小白默认推荐'));
    return true;
  }

  function toggleTrigger(kind,wantOn){
    var patch={triggers:{}};
    if(kind==='away') patch.triggers.away=!!wantOn;
    else if(kind==='shake') patch.triggers.shake=!!wantOn;
    else if(kind==='blink') patch.triggers.blink=!!wantOn;
    else return;
    persistPresencePrefs(patch);
  }

  function bindUi(){
    if(st.uiBound) return;
    st.uiBound=true;

    var toggle=$('cameraPresenceEnabledToggle');
    if(toggle){
      toggle.addEventListener('click',function(e){
        e.preventDefault();
        persistPresencePrefs({enabled:!isEnabled()});
      });
    }

    var stopBtn=$('cameraRuntimeStopBtn');
    if(stopBtn){
      stopBtn.addEventListener('click',function(e){
        e.preventDefault();
        ensureStopped({reason:'user_manual'});
      });
    }
    var restartBtn=$('cameraRuntimeRestartBtn');
    if(restartBtn){
      restartBtn.addEventListener('click',function(e){
        e.preventDefault();
        requestRestart({reason:'user_restart'});
      });
    }

    var config=$('cameraPresenceConfig');
    if(config){
      config.addEventListener('click',function(e){
        var sw=e.target&&e.target.closest?e.target.closest('[data-camera-trigger-toggle]'):null;
        if(sw){
          e.preventDefault();
          var kind=String(sw.getAttribute('data-camera-trigger-toggle')||'');
          var on=sw.getAttribute('aria-checked')==='true';
          toggleTrigger(kind,!on);
          return;
        }
        var go=e.target&&e.target.closest?e.target.closest('[data-camera-goto-bind]'):null;
        if(go){
          e.preventDefault();
          var target=String(go.getAttribute('data-camera-goto-bind')||'');
          if(global.OneToneCameraWorkflow&&global.OneToneCameraWorkflow.activateTab){
            global.OneToneCameraWorkflow.activateTab('action');
          }
          var rowId=target==='away'?'cameraBindRowAway':(target==='shake'?'cameraBindRowShake':'cameraBindRowBlink');
          var row=$(rowId);
          if(row&&row.scrollIntoView){
            try{ row.scrollIntoView({block:'nearest',behavior:'smooth'}); }catch(_){ try{ row.scrollIntoView(true); }catch(__){} }
          }
          if(row){
            row.classList.add('is-flash');
            setTimeout(function(){ row.classList.remove('is-flash'); },1200);
          }
        }
      });
    }

    var bindList=$('cameraPresenceBindList');
    if(bindList){
      bindList.addEventListener('click',function(e){
        var tile=e.target&&e.target.closest?e.target.closest('.camera-action-tile'):null;
        if(!tile||tile.disabled) return;
        e.preventDefault();
        var host=tile.closest('[data-camera-bind-key]');
        var key=host?String(host.getAttribute('data-camera-bind-key')||''):'';
        var action=String(tile.getAttribute('data-action')||'none');
        if(!key||BIND_KEYS.indexOf(key)<0) return;
        if(!isActionAllowedForKey(key,action)){
          toast(actionBlockedReason(key,action)||t('cameraPresenceSkipInvalidCombo','此动作与当前事件不兼容'));
          return;
        }
        var patch={};
        patch[key]=normalizeAction(action);
        persistPresencePrefs(patch);
      });
    }

    var closeBtn=$('cameraPrivacyCloseBtn');
    if(closeBtn){
      closeBtn.addEventListener('click',function(e){
        e.preventDefault();
        closePrivacyScreen(false);
      });
    }
    var closeIcon=$('cameraPrivacyCloseIcon');
    if(closeIcon){
      closeIcon.addEventListener('click',function(e){
        e.preventDefault();
        closePrivacyScreen(false);
      });
    }

    var recommendBtn=$('cameraApplyRecommendBtn');
    if(recommendBtn){
      recommendBtn.addEventListener('click',function(e){
        e.preventDefault();
        applyRecommendedPresencePrefs();
      });
    }

    if(!st.escBound){
      st.escBound=true;
      global.addEventListener('keydown',onPrivacyEsc,true);
    }

    syncUiFromPrefs();
  }

  function init(){
    st.enabled=!!basePresencePrefs().enabled;
    bindUi();
    syncDetectInterval();
    emitRuntime();
    // Do not ensureRunning here — wait for applyMvpInit → reconcileRuntime.
  }

  global.OneToneCameraPresenceActions={
    init:init,
    onFrame:onFrame,
    reset:reset,
    isEnabled:isEnabled,
    isRunning:isRunning,
    getState:snapshot,
    getRuntimeStatus:getRuntimeStatus,
    ensureRunning:ensureRunning,
    ensureStopped:ensureStopped,
    reconcileRuntime:reconcileRuntime,
    setRuntimeStateListener:setRuntimeStateListener,
    clearManualStop:clearManualStop,
    requestRestart:requestRestart,
    prefs:prefs,
    normalizePrefs:normalizePrefs,
    defaultPrefs:defaultPresencePrefs,
    persist:persistPresencePrefs,
    dispatchAction:dispatchAction,
    canExecuteCameraAction:canExecuteCameraAction,
    shouldThrottleCameraAction:shouldThrottleCameraAction,
    actionRiskLevel:actionRiskLevel,
    applyRecommendedPresencePrefs:applyRecommendedPresencePrefs,
    recommendedPresencePrefs:recommendedPresencePrefs,
    resolveVoiceActivateKey:resolveVoiceActivateKey,
    setPrivacyOpen:setPrivacyOpen,
    closePrivacyScreen:closePrivacyScreen,
    syncDetectInterval:syncDetectInterval,
    syncUiFromPrefs:syncUiFromPrefs,
    syncTriggerSummaries:function(){ syncTriggerSummaries(prefs()); },
    setOnStateChange:function(fn){ st.onStateChange=typeof fn==='function'?fn:null; },
    allowedActionsForBindKey:allowedActionsForBindKey,
    /** Test / debug only — mutate runtime presence for gate checks. */
    _testSetPresence:function(v){ st.presence=String(v||'unknown'); },
    _testSetPausedByPresence:function(on){
      st.pausedByPresence=!!on;
      st.wasPausedBeforeAway=false;
    },
    _testSetLastKeyAt:function(ms){ st.lastKeyAt=Number(ms)||0; },
    MID_RISK_DELAY_MS:MID_RISK_DELAY_MS,
    AWAY_MS:AWAY_MS,
    PRESENT_MS:PRESENT_MS,
    DETECT_PRESENT_MS:DETECT_PRESENT_MS,
    DETECT_AWAY_MS:DETECT_AWAY_MS
  };

  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',init);
  }else{
    init();
  }
})((typeof window!=='undefined')?window:globalThis);
