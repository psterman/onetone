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
  var YAW_LEFT=-0.25;
  var YAW_RIGHT=0.25;
  var KEY_THROTTLE_MS=800;
  var DETECT_PRESENT_MS=100;
  var DETECT_AWAY_MS=333;
  var DETECT_GAZE_MS=33;

  // Shake: need three alternating side extremes within window.
  var SHAKE_WINDOW_MS=1400;
  var SHAKE_COOLDOWN_MS=1200;
  var SHAKE_SIDE_HOLD_MS=70;

  // Deliberate blink: long close, not natural short blinks.
  var BLINK_ON=0.62;
  var BLINK_OFF=0.32;
  var BLINK_LONG_MIN_MS=220;
  var BLINK_LONG_MAX_MS=650;
  var BLINK_DOUBLE_GAP_MS=520;
  var BLINK_COOLDOWN_MS=1500;
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
    escBound:false,
    uiBound:false,
    onDetectInterval:null,
    onStateChange:null,
    // Shake tracking
    shakeSeq:[],
    shakeSide:null,
    shakeSideSince:0,
    lastShakeAt:0,
    // Blink tracking
    blinkClosed:false,
    blinkCloseSince:0,
    blinkLastLongAt:0,
    blinkPendingSingle:false,
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

  function persistPresencePrefs(partial){
    var cp=cameraPrefs();
    var cur=normalizePrefs(cp.presenceActions);
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

  function pressKey(targetKey){
    var now=performance.now();
    if(now-st.lastKeyAt<KEY_THROTTLE_MS){
      toast(t('cameraPresenceKeyThrottled','按键动作冷却中'));
      return Promise.resolve({ok:false,reason:'throttled'});
    }
    if(!canPressKey()){
      toast(t('cameraPresenceKeyBlocked','当前不可发送按键（需在席且未暂停）'));
      return Promise.resolve({ok:false,reason:'blocked'});
    }
    st.lastKeyAt=now;
    return invokeIpc('cmd_test_send',{mappingId:null,targetKey:targetKey}).then(function(res){
      if(!res||!res.ok){
        var reason=res&&res.reason?String(res.reason):'failed';
        if(reason==='paused'){
          toast(t('cameraPresenceKeyPaused','监听已暂停，无法注入按键'));
        }else{
          toast(t('cameraPresenceKeyFailed','按键发送失败'));
        }
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
    if(action==='pressCtrlI') return pressKey('Ctrl+I');

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
    st.shakeSide=null;
    st.shakeSideSince=0;
    st.blinkClosed=false;
    st.blinkCloseSince=0;
    st.blinkLastLongAt=0;
    st.blinkPendingSingle=false;
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
    if(isCalibrating()) return;
    if(st.privacyOpen) return;
    if(st.presence!=='present') return;
    action=normalizeAction(action);
    if(action==='none') return;
    pulseGesture(kind);
    dispatchAction(action,kind);
  }

  function pruneShakeSeq(now){
    while(st.shakeSeq.length&&(now-st.shakeSeq[0].t)>SHAKE_WINDOW_MS){
      st.shakeSeq.shift();
    }
  }

  function noteShakeSide(side,now){
    if(side!=='left'&&side!=='right') return;
    if(st.shakeSide===side){
      if(!st.shakeSideSince) st.shakeSideSince=now;
      return;
    }
    // Require a brief hold on the new side before counting (filter jitter).
    st.shakeSide=side;
    st.shakeSideSince=now;
  }

  function commitShakeSide(now){
    if(!st.shakeSide||!st.shakeSideSince) return;
    if((now-st.shakeSideSince)<SHAKE_SIDE_HOLD_MS) return;
    var side=st.shakeSide;
    var last=st.shakeSeq.length?st.shakeSeq[st.shakeSeq.length-1]:null;
    if(last&&last.side===side) return;
    st.shakeSeq.push({side:side,t:now});
    pruneShakeSeq(now);
    if(st.shakeSeq.length>4) st.shakeSeq=st.shakeSeq.slice(-4);
  }

  function matchShakePattern(){
    pruneShakeSeq(performance.now());
    if(st.shakeSeq.length<3) return false;
    var a=st.shakeSeq[st.shakeSeq.length-3].side;
    var b=st.shakeSeq[st.shakeSeq.length-2].side;
    var c=st.shakeSeq[st.shakeSeq.length-1].side;
    if(a===b||b===c||a===c) return false;
    // L-R-L or R-L-R
    return (a==='left'&&b==='right'&&c==='left')||(a==='right'&&b==='left'&&c==='right');
  }

  function updateShake(now,dir){
    var p=prefs();
    if(normalizeAction(p.shakeHead)==='none'){
      st.shakeSeq=[];
      return;
    }
    if(st.presence!=='present') return;
    if(dir==='left'||dir==='right'){
      noteShakeSide(dir,now);
      commitShakeSide(now);
    }else if(dir==='center'){
      // Flush pending side hold when returning to center.
      commitShakeSide(now);
      st.shakeSide=null;
      st.shakeSideSince=0;
    }
    if(matchShakePattern()){
      if((now-st.lastShakeAt)<SHAKE_COOLDOWN_MS){
        st.shakeSeq=[];
        return;
      }
      st.lastShakeAt=now;
      st.shakeSeq=[];
      fireGesture('shake',p.shakeHead);
    }
  }

  function updateBlink(now,blinkScore){
    var p=prefs();
    if(normalizeAction(p.deliberateBlink)==='none'){
      st.blinkClosed=false;
      st.blinkCloseSince=0;
      st.blinkPendingSingle=false;
      return;
    }
    if(st.presence!=='present') return;
    if(blinkScore==null||!isFinite(blinkScore)) return;

    if(!st.blinkClosed){
      if(blinkScore>=BLINK_ON){
        st.blinkClosed=true;
        st.blinkCloseSince=now;
      }
      // Pending single long-blink waiting for double window expiry.
      if(st.blinkPendingSingle&&st.blinkLastLongAt&&(now-st.blinkLastLongAt)>BLINK_DOUBLE_GAP_MS){
        st.blinkPendingSingle=false;
        if((now-st.lastBlinkAt)>=BLINK_COOLDOWN_MS){
          st.lastBlinkAt=now;
          fireGesture('blink',p.deliberateBlink);
        }
      }
      return;
    }

    // Currently closed
    if(blinkScore<=BLINK_OFF){
      var dur=now-st.blinkCloseSince;
      st.blinkClosed=false;
      st.blinkCloseSince=0;
      if(dur<BLINK_LONG_MIN_MS||dur>BLINK_LONG_MAX_MS){
        // Natural short blink or too long — ignore.
        return;
      }
      // Long blink completed.
      if(st.blinkPendingSingle&&st.blinkLastLongAt&&(now-st.blinkLastLongAt)<=BLINK_DOUBLE_GAP_MS){
        // Double long blink — fire immediately.
        st.blinkPendingSingle=false;
        st.blinkLastLongAt=0;
        if((now-st.lastBlinkAt)<BLINK_COOLDOWN_MS) return;
        st.lastBlinkAt=now;
        fireGesture('blink',p.deliberateBlink);
        return;
      }
      // Start double-blink wait; single will fire after gap if no second long blink.
      st.blinkPendingSingle=true;
      st.blinkLastLongAt=now;
      return;
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
      updateShake(now,st.headDirection);
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

  function fillActionSelect(sel,value){
    if(!sel) return;
    var opts=[
      ['none','cameraPresenceActionNone','无动作'],
      ['pressEsc','cameraPresenceActionEsc','按 Esc'],
      ['pressCtrlI','cameraPresenceActionCtrlI','切换输入 Ctrl+I'],
      ['lowPowerMode','cameraPresenceActionLowPower','软件低消耗运行'],
      ['privacyScreen','cameraPresenceActionPrivacy','隐私屏'],
      ['pauseVoice','cameraPresenceActionPause','暂停语音'],
      ['resumeVoice','cameraPresenceActionResume','恢复语音']
    ];
    var cur=normalizeAction(value);
    if(!sel.options.length){
      for(var i=0;i<opts.length;i++){
        var o=document.createElement('option');
        o.value=opts[i][0];
        o.textContent=t(opts[i][1],opts[i][2]);
        sel.appendChild(o);
      }
    }else{
      for(var j=0;j<sel.options.length;j++){
        var op=sel.options[j];
        var found=null;
        for(var k=0;k<opts.length;k++){
          if(opts[k][0]===op.value){ found=opts[k]; break; }
        }
        if(found) op.textContent=t(found[1],found[2]);
      }
    }
    sel.value=cur;
  }

  function syncUiFromPrefs(){
    var p=prefs();
    st.enabled=!!p.enabled;
    fillActionSelect($('cameraPresenceOnAway'),p.onAway);
    fillActionSelect($('cameraPresenceOnReturn'),p.onReturn);
    fillActionSelect($('cameraPresenceShakeHead'),p.shakeHead);
    fillActionSelect($('cameraPresenceBlink'),p.deliberateBlink);
    renderHeroUi();
  }

  function onPrivacyEsc(e){
    if(!st.privacyOpen) return;
    if(e.key!=='Escape'&&e.key!=='Esc') return;
    e.preventDefault();
    e.stopPropagation();
    if(e.stopImmediatePropagation) e.stopImmediatePropagation();
    closePrivacyScreen(true);
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

    function bindSelect(id,key){
      var sel=$(id);
      if(!sel) return;
      sel.addEventListener('change',function(){
        var patch={};
        patch[key]=sel.value;
        persistPresencePrefs(patch);
      });
    }
    bindSelect('cameraPresenceOnAway','onAway');
    bindSelect('cameraPresenceOnReturn','onReturn');
    bindSelect('cameraPresenceShakeHead','shakeHead');
    bindSelect('cameraPresenceBlink','deliberateBlink');

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
    setPrivacyOpen:setPrivacyOpen,
    closePrivacyScreen:closePrivacyScreen,
    syncDetectInterval:syncDetectInterval,
    syncUiFromPrefs:syncUiFromPrefs,
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
