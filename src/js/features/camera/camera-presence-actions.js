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

  // Deliberate blink: sustained close → open. No double-blink (too easy to false-fire).
  var BLINK_ON=0.78;
  var BLINK_OFF=0.40;
  var BLINK_OPEN_SETTLE_MS=180;
  var BLINK_LONG_MIN_MS=380;
  var BLINK_LONG_MAX_MS=900;
  var BLINK_COOLDOWN_MS=3500;
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
    lastThrottleToastAt:0,
    escBound:false,
    uiBound:false,
    onDetectInterval:null,
    onStateChange:null,
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

  function normalizePrefs(raw){
    var d=defaultPresencePrefs();
    if(!raw||typeof raw!=='object') return d;
    return {
      enabled:!!raw.enabled,
      onAway:normalizeAction(raw.onAway),
      onReturn:normalizeAction(raw.onReturn),
      shakeHead:normalizeAction(raw.shakeHead),
      deliberateBlink:normalizeAction(raw.deliberateBlink)
    };
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
    return cfg.cameraPrefs;
  }

  function prefs(){
    return normalizePrefs(cameraPrefs().presenceActions);
  }

  function isCameraPreviewLive(){
    try{
      var gp=global.OneToneCameraPreview;
      if(gp&&gp.getGazeDebugState){
        var s=gp.getGazeDebugState();
        return !!(s&&s.previewLive);
      }
    }catch(_){}
    return false;
  }

  function syncPreviewWithMaster(wantOn){
    var pv=global.OneToneCameraPreview;
    if(!pv) return;
    if(wantOn){
      if(pv.startPreview){
        try{ pv.startPreview(); }catch(_){}
      }
      return;
    }
    if(pv.stop){
      try{ pv.stop(); }catch(_){}
    }
  }

  function persistPresencePrefs(partial){
    var cp=cameraPrefs();
    var cur=normalizePrefs(cp.presenceActions);
    var wasEnabled=!!cur.enabled;
    if(partial&&typeof partial==='object'){
      if(partial.enabled!==undefined) cur.enabled=!!partial.enabled;
      if(partial.onAway!=null) cur.onAway=normalizeAction(partial.onAway);
      if(partial.onReturn!=null) cur.onReturn=normalizeAction(partial.onReturn);
      if(partial.shakeHead!=null) cur.shakeHead=normalizeAction(partial.shakeHead);
      if(partial.deliberateBlink!=null) cur.deliberateBlink=normalizeAction(partial.deliberateBlink);
    }
    cp.presenceActions=cur;
    st.enabled=!!cur.enabled;
    if(global.OneToneConfigPersist){
      if(global.OneToneConfigPersist.saveAsync) global.OneToneConfigPersist.saveAsync();
      else if(global.OneToneConfigPersist.save) global.OneToneConfigPersist.save();
    }
    syncUiFromPrefs();
    syncDetectInterval();
    emitState();
    if(global.OneToneCameraPreview&&global.OneToneCameraPreview.syncLiveLandmarker){
      try{ global.OneToneCameraPreview.syncLiveLandmarker(); }catch(_){}
    }
    if(cur.enabled!==wasEnabled){
      syncPreviewWithMaster(!!cur.enabled);
    }
  }

  function isEnabled(){
    return !!prefs().enabled;
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
      // Silent throttle — toast spam was freezing the UI during blink mis-fires.
      if(now-st.lastThrottleToastAt>2200){
        st.lastThrottleToastAt=now;
        toast(t('cameraPresenceKeyThrottled','按键动作冷却中'));
      }
      logPresence('key throttled '+targetKey);
      return Promise.resolve({ok:false,reason:'throttled'});
    }
    if(!canPressKey()){
      toast(t('cameraPresenceKeyBlocked','当前不可发送按键（需在席且未暂停）'));
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
      toast(t('cameraPrivacyClosed','隐私屏已关闭'));
    }
  }

  function openPrivacyScreen(){
    setPrivacyOpen(true);
  }

  function dispatchAction(action,source){
    action=normalizeAction(action);
    if(action==='none') return Promise.resolve({ok:true,action:'none'});
    if(isCalibrating()){
      return Promise.resolve({ok:false,reason:'calibrating'});
    }
    st.lastAction=action;
    st.lastActionAt=performance.now();

    if(action==='pressEsc') return pressKey('Esc');
    if(action==='pressCtrlI'){
      // Legacy action id → user's custom IME activate scheme (habit / voice / imePreset).
      var voiceKey=resolveVoiceActivateKey();
      logPresence('voice-activate resolve='+(voiceKey||'(unset)'));
      if(!voiceKey){
        toast(t('cameraPresenceVoiceKeyUnsetToast','请先在按键/语音设置中选择输入法激活方案'));
        return Promise.resolve({ok:false,reason:'unset'});
      }
      return pressKey(voiceKey,{voiceActivate:true});
    }

    if(action==='privacyScreen'){
      openPrivacyScreen();
      return Promise.resolve({ok:true,action:action});
    }

    if(action==='lowPowerMode'){
      st.lowPowerActive=true;
      try{
        if(global.OneToneVoiceWake&&global.OneToneVoiceWake.switchListeningStrategy){
          global.OneToneVoiceWake.switchListeningStrategy('resourceSaver');
        }
      }catch(_){}
      emitState();
      toast(t('cameraPresenceLowPowerOn','已切换低消耗运行'));
      return Promise.resolve({ok:true,action:action});
    }

    if(action==='pauseVoice'){
      var rt=runtime();
      st.wasPausedBeforeAway=!!rt.paused;
      if(!rt.paused){
        st.pausedByPresence=true;
        return invokeIpc('cmd_pause',{}).then(function(res){
          emitState();
          return res||{ok:true,action:action};
        });
      }
      st.pausedByPresence=false;
      emitState();
      return Promise.resolve({ok:true,action:action,skipped:true});
    }

    if(action==='resumeVoice'){
      if(st.pausedByPresence&&!st.wasPausedBeforeAway){
        return invokeIpc('cmd_resume',{}).then(function(res){
          st.pausedByPresence=false;
          emitState();
          return res||{ok:true,action:action};
        });
      }
      st.pausedByPresence=false;
      emitState();
      return Promise.resolve({ok:true,action:action,skipped:true});
    }

    return Promise.resolve({ok:false,reason:'unknown',action:action,source:source});
  }

  function transitionPresence(next,now){
    if(st.presence===next) return;
    var prev=st.presence;
    st.presence=next;
    if(next==='away'){
      st.lostSince=now;
      st.returnedSince=0;
      resetGestureTrackers();
    }else if(next==='present'){
      st.returnedSince=now;
    }
    syncDetectInterval();
    emitState();

    var p=prefs();
    if(!p.enabled) return;
    if(isCalibrating()) return;

    if(next==='away'&&(prev==='present'||prev==='unknown')){
      var awayAct=normalizeAction(p.onAway);
      dispatchAction(awayAct,'away').then(function(){
        if(awayAct!=='none') toast(t('cameraPresenceAwayFired','已离席'));
      });
    }else if(next==='present'&&prev==='away'){
      // Return dismisses privacy; manual close remains available while away.
      if(st.privacyOpen) closePrivacyScreen(false);
      var retAct=normalizeAction(p.onReturn);
      dispatchAction(retAct,'return').then(function(){
        if(retAct!=='none') toast(t('cameraPresenceReturnFired','已回席'));
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
      // reflow to restart animation
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
    if(isCalibrating()){
      logPresence(kind+' skipped calibrating');
      return;
    }
    if(st.privacyOpen){
      logPresence(kind+' skipped privacy');
      return;
    }
    if(st.presence!=='present'){
      logPresence(kind+' skipped not-present');
      return;
    }
    action=normalizeAction(action);
    if(action==='none') return;
    logPresence(kind+' fire action='+action);
    if(kind==='shake') toast(t('cameraPresenceShakeDetected','已识别摇头'));
    else if(kind==='blink') toast(t('cameraPresenceBlinkDetected','已识别长眨'));
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
    if(normalizeAction(p.shakeHead)==='none'){
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
      fireGesture('shake',p.shakeHead);
    }
  }

  function updateBlink(now,blinkScore){
    var p=prefs();
    if(normalizeAction(p.deliberateBlink)==='none'){
      st.blinkClosed=false;
      st.blinkCloseSince=0;
      st.blinkOpenSince=0;
      return;
    }
    if(st.presence!=='present') return;
    if(blinkScore==null||!isFinite(blinkScore)) return;

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
        }
      }
      return;
    }

    // Currently closed
    if(blinkScore<=BLINK_OFF){
      var dur=now-st.blinkCloseSince;
      st.blinkClosed=false;
      st.blinkCloseSince=0;
      st.blinkOpenSince=now;
      if(dur<BLINK_LONG_MIN_MS||dur>BLINK_LONG_MAX_MS){
        // Natural short blink or too long — ignore.
        return;
      }
      if((now-st.lastBlinkAt)<BLINK_COOLDOWN_MS){
        logPresence('blink cooldown dur='+Math.round(dur));
        return;
      }
      st.lastBlinkAt=now;
      fireGesture('blink',p.deliberateBlink);
    }
  }

  function onFrame(point){
    if(!isEnabled()) return;
    var now=performance.now();
    var face=!!(point&&(point.faceDetected===true||(point.state&&point.state!=='lost'&&point.state!=='idle'&&point.confidence>0.12)));
    if(point&&point.faceDetected===false) face=false;
    if(point&&point.state==='lost') face=false;

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

    if(st.presence==='present'&&face&&!isCalibrating()){
      updateShake(now,yaw);
      updateBlink(now,point&&point.blink);
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
    if(st.privacyOpen) return t('cameraPresenceStatePrivacy','隐私屏');
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
      return t('cameraPresenceGestureBlink','长眨');
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
    if(st.lastGesture==='blink') return t('cameraPresenceGestureBlink','长眨');
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
    ['privacyScreen','cameraPresenceActionPrivacy','隐私屏'],
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
    if(!host.getAttribute('data-tiles-ready')){
      host.setAttribute('data-tiles-ready','1');
      host.setAttribute('data-camera-bind-key',key);
      host.innerHTML='';
      for(var i=0;i<ACTION_OPTS.length;i++){
        var opt=ACTION_OPTS[i];
        var btn=document.createElement('button');
        btn.type='button';
        btn.className='camera-action-tile';
        btn.setAttribute('data-action',opt[0]);
        btn.setAttribute('role','radio');
        btn.title=opt[0]==='pressCtrlI'?t('cameraPresenceActionCtrlIHint','发送当前习惯/语音设置中的输入法激活键'):'';
        btn.textContent=opt[0]==='pressCtrlI'?voiceActivateActionLabel():t(opt[1],opt[2]);
        host.appendChild(btn);
      }
    }else{
      var kids=host.querySelectorAll('.camera-action-tile');
      for(var j=0;j<kids.length;j++){
        var act=kids[j].getAttribute('data-action');
        for(var k=0;k<ACTION_OPTS.length;k++){
          if(ACTION_OPTS[k][0]===act){
            kids[j].textContent=act==='pressCtrlI'?voiceActivateActionLabel():t(ACTION_OPTS[k][1],ACTION_OPTS[k][2]);
            if(act==='pressCtrlI'){
              kids[j].title=t('cameraPresenceActionCtrlIHint','发送当前习惯/语音设置中的输入法激活键');
            }
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
    var awayOn=p.onAway!=='none'||p.onReturn!=='none';
    var shakeOn=p.shakeHead!=='none';
    var blinkOn=p.deliberateBlink!=='none';

    function syncCard(kind,bound,summaryText){
      var card=document.querySelector('#cameraPresenceConfig [data-camera-trigger="'+kind+'"]');
      if(!card) return;
      var sw=card.querySelector('[data-camera-trigger-toggle]');
      var sum=card.querySelector('.camera-bind-summary');
      var go=card.querySelector('.camera-goto-bind');
      setSwitchState(sw,bound);
      if(sum){
        // Do not put data-i18n on these nodes — applyLang on appWorkbenchShell would overwrite them.
        sum.textContent=summaryText;
        sum.classList.toggle('is-bound',!!bound);
      }
      if(go){
        go.textContent=bound
          ? t('cameraGotoBindEdit','修改绑定')
          : t('cameraGotoBind','去绑定结果');
      }
      card.classList.toggle('is-trigger-on',!!bound);
    }

    syncCard(
      'away',
      awayOn,
      awayOn
        ? t('cameraTriggerSummaryAway','离席：{away} · 回席：{ret}')
            .replace('{away}',actionLabel(p.onAway))
            .replace('{ret}',actionLabel(p.onReturn))
        : t('cameraTriggerSummaryEmpty','尚未绑定结果')
    );
    syncCard(
      'shake',
      shakeOn,
      shakeOn
        ? t('cameraTriggerSummaryBound','已绑定：{action}').replace('{action}',actionLabel(p.shakeHead))
        : t('cameraTriggerSummaryEmpty','尚未绑定结果')
    );
    syncCard(
      'blink',
      blinkOn,
      blinkOn
        ? t('cameraTriggerSummaryBound','已绑定：{action}').replace('{action}',actionLabel(p.deliberateBlink))
        : t('cameraTriggerSummaryEmpty','尚未绑定结果')
    );
  }

  function syncMasterLockUi(){
    var on=isEnabled();
    var config=$('cameraPresenceConfig');
    if(config){
      config.classList.toggle('is-master-off',!on);
      config.setAttribute('aria-disabled',on?'false':'true');
    }
    var bindList=$('cameraPresenceBindList');
    if(bindList){
      bindList.classList.toggle('is-master-off',!on);
      bindList.classList.toggle('is-dimmed',!on);
      bindList.setAttribute('aria-disabled',on?'false':'true');
    }
    var calibBtn=$('cameraGazeCalibrateBtn');
    if(calibBtn){
      calibBtn.disabled=!on;
      calibBtn.setAttribute('aria-disabled',on?'false':'true');
    }
    var fineBtn=$('cameraGazeCalibrateFineBtn');
    if(fineBtn){
      fineBtn.disabled=!on;
      fineBtn.setAttribute('aria-disabled',on?'false':'true');
    }
    var clearBtn=$('cameraGazeClearCalibrationBtn');
    if(clearBtn){
      clearBtn.disabled=!on;
      clearBtn.setAttribute('aria-disabled',on?'false':'true');
    }
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

  function toggleTrigger(kind,wantOn){
    var p=prefs();
    if(kind==='away'){
      if(wantOn){
        persistPresencePrefs({
          onAway:p.onAway==='none'?'privacyScreen':p.onAway,
          onReturn:p.onReturn==='none'?'none':p.onReturn
        });
      }else{
        persistPresencePrefs({onAway:'none',onReturn:'none'});
      }
      return;
    }
    if(kind==='shake'){
      persistPresencePrefs({shakeHead:wantOn?(p.shakeHead==='none'?'pressEsc':p.shakeHead):'none'});
      return;
    }
    if(kind==='blink'){
      persistPresencePrefs({deliberateBlink:wantOn?(p.deliberateBlink==='none'?'pressCtrlI':p.deliberateBlink):'none'});
    }
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

    var config=$('cameraPresenceConfig');
    if(config){
      config.addEventListener('click',function(e){
        if(!isEnabled()){
          e.preventDefault();
          return;
        }
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
        if(!isEnabled()){
          e.preventDefault();
          return;
        }
        var tile=e.target&&e.target.closest?e.target.closest('.camera-action-tile'):null;
        if(!tile||tile.disabled) return;
        e.preventDefault();
        var host=tile.closest('[data-camera-bind-key]');
        var key=host?String(host.getAttribute('data-camera-bind-key')||''):'';
        var action=String(tile.getAttribute('data-action')||'none');
        if(!key||BIND_KEYS.indexOf(key)<0) return;
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

    if(!st.escBound){
      st.escBound=true;
      // Capture phase: local Esc closes privacy only — never inject system Esc.
      global.addEventListener('keydown',onPrivacyEsc,true);
    }

    syncUiFromPrefs();
  }

  function init(){
    st.enabled=!!prefs().enabled;
    bindUi();
    syncDetectInterval();
    emitState();
  }

  global.OneToneCameraPresenceActions={
    init:init,
    onFrame:onFrame,
    reset:reset,
    isEnabled:isEnabled,
    getState:snapshot,
    prefs:prefs,
    normalizePrefs:normalizePrefs,
    defaultPrefs:defaultPresencePrefs,
    persist:persistPresencePrefs,
    dispatchAction:dispatchAction,
    resolveVoiceActivateKey:resolveVoiceActivateKey,
    setPrivacyOpen:setPrivacyOpen,
    closePrivacyScreen:closePrivacyScreen,
    syncDetectInterval:syncDetectInterval,
    syncUiFromPrefs:syncUiFromPrefs,
    syncTriggerSummaries:function(){ syncTriggerSummaries(prefs()); },
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
