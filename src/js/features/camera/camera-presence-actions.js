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

  var DEFAULT_AWAY_MS=3000;
  var DEFAULT_PRESENT_MS=1000;
  var AWAY_DURATION_OPTS=[1000,2000,3000,5000,10000,15000,30000,60000];
  var PRESENT_DURATION_OPTS=[500,1000,2000,3000,5000];
  // Yaw bins for coarse L/C/R display (landmark yaw ~±1).
  var YAW_LEFT=-0.12;
  var YAW_RIGHT=0.12;
  var KEY_THROTTLE_MS=800;
  var KEY_THROTTLE_VOICE_MS=2200;
  /** While dictating, allow a second blink sooner to toggle IME off. */
  var KEY_THROTTLE_VOICE_END_MS=550;
  var BLINK_COOLDOWN_END_MS=650;
  var MID_RISK_DELAY_MS=750;
  var DETECT_PRESENT_MS=100;
  var DETECT_AWAY_MS=333;
  var DETECT_GAZE_MS=33;
  var DETECT_SHAKE_MS=33;
  /** Home / non-camera panels: keep presence alive but never hammer createImageBitmap. */
  var DETECT_HOME_MS=200;

  /** Capture-FPS-aware interval for gaze/shake only — never for away/present power tiers. */
  function preferredDetectIntervalMs(captureFps){
    var fps=Math.round(Number(captureFps)||0)|0;
    if(fps<=0){
      try{
        var gp=global.OneToneCameraPreview;
        if(gp&&gp.getGazeDebugState){
          // fall through — preview may expose actual FPS later
        }
        var tr=null;
        var video=document.getElementById('cameraPreviewVideo');
        if(video&&video.srcObject&&video.srcObject.getVideoTracks){
          tr=video.srcObject.getVideoTracks()[0];
        }
        if(tr&&tr.getSettings){
          var s=tr.getSettings();
          if(s&&s.frameRate>0) fps=Math.round(s.frameRate)|0;
        }
      }catch(_){}
    }
    if(fps<=0){
      try{
        var st=global.OneToneState&&global.OneToneState.state;
        var p=st&&st.config&&st.config.cameraPrefs;
        if(p&&p.selectedFrameRate>0) fps=p.selectedFrameRate|0;
      }catch(_){}
    }
    if(fps===25) return 40;
    if(fps===50) return 20;
    if(fps>=55) return 33; // 60fps capture → detect ~30fps
    if(fps===30) return 33;
    return DETECT_GAZE_MS;
  }

  // Shake: yaw hysteresis + L-R-L / R-L-R only (three beats). Optional beep → nod confirm.
  var SHAKE_WINDOW_MS=3600;
  var SHAKE_COOLDOWN_MS=2200;
  var SHAKE_ARMED_WINDOW_MS=2800;
  var SHAKE_NOD_ENTER=0.16;
  var SHAKE_NOD_EXIT=0.08;
  var SHAKE_NOD_MIN_MS=60;
  var SHAKE_NOD_MAX_MS=900;
  var SHAKE_NOD_SETTLE_MS=80;
  var HAND_COOLDOWN_MS=1400;
  /** Defer openPalm when wave is also on — wave always starts as Open_Palm. */
  var OPEN_PALM_WAVE_DEFER_MS=1200;
  // User-facing「摇头力度」→ enter amplitude (exit ≈ half). No jargon in UI.
  var SHAKE_HOW_OPTS=['easy','normal','strong'];
  var SHAKE_ENTER_BY_HOW={ easy:0.10, normal:0.16, strong:0.22 };
  var SHAKE_LOG_MIN_MS=2000;

  // Deliberate blink: hold closed then (optional) sound + short confirm. Natural blinks never arm.
  var BLINK_DEFAULT_ON=0.48;
  var BLINK_DEFAULT_OFF=0.22;
  var BLINK_CLOSE_CONFIRM_MS=80;
  var BLINK_OPEN_SETTLE_MS=80;
  // Concrete hold lengths users can memorize (seconds).
  var BLINK_CLOSE_SEC_OPTS=[0.6,1,2];
  var BLINK_HOLD_MIN_MS=600;
  var BLINK_HOLD_MAX_MS=2100;
  var BLINK_CONFIRM_MAX_MS=650;
  var BLINK_CONFIRM_MIN_MS=35;
  var BLINK_CONFIRM_CLOSE_MS=40;
  var BLINK_ARMED_WINDOW_MS=2800;
  var BLINK_ARMED_OPEN_NEED_MS=60;
  var BLINK_COOLDOWN_MS=1800;
  var BLINK_HINT_COOLDOWN_MS=2200;
  var BLINK_BASELINE_MS=1500;
  var BLINK_BASELINE_MIN_SAMPLES=18;
  /** Cancel blink hold only on clear head turn (not resting side-glance). */
  var BLINK_HOLD_YAW_ABORT=0.34;
  var BLINK_HEAD_MOVE_YAW=0.28;
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

  function isAgentActionToken(action){
    return String(action||'').indexOf('agent:')===0;
  }

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
    lastHandKind:'none',
    lastHandFireAt:0,
    handHoldKind:'none',
    pendingOpenPalmTimer:0,
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
    uiSyncing:false,
    recommendBusy:false,
    rulesSegment:'basic',
    onDetectInterval:null,
    onStateChange:null,
    runtimeListeners:[],
    // Non-persistent runtime hold — never written to prefs.
    manualStopped:false,
    drawerUiPaused:false,
    lastError:null,
    runtimeStatus:'off',
    ensureInflight:null,
    // Shake tracking (yaw hysteresis) + optional armed nod confirm
    shakeSeq:[],
    shakeHyst:'center',
    shakePhase:'idle',
    shakeArmedAt:0,
    shakeArmedPitch:0,
    shakeNodPhase:'ready',
    shakeNodDownSince:0,
    shakeNodSettleSince:0,
    lastShakeAt:0,
    lastShakeLogAt:0,
    lastShakeHintAt:0,
    lastYaw:null,
    lastPitch:null,
    // Blink: idle → holding (deliberate close) → armed → short confirm → fire
    blinkPhase:'idle',
    blinkClosed:false,
    blinkCloseSince:0,
    blinkCloseCandidateSince:0,
    blinkOpenCandidateSince:0,
    blinkArmedAt:0,
    blinkOpenSince:0,
    blinkConfirmCloseSince:0,
    blinkArmedReady:false,
    lastBlinkAt:0,
    lastBlinkHintAt:0,
    blinkBaselineBuf:[],
    blinkBaselineStartedAt:0,
    blinkBaselineForce:false,
    blinkBaselineStatus:'',
    lastBlinkYaw:null,
    blinkHoldStartYaw:null,
    /** FE latch: camera voice-activate started a session (toggle end before runtime push lands). */
    cameraVoiceSessionActive:false,
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

  function clampPresenceMs(raw,kind){
    var n=Math.round(Number(raw));
    if(!isFinite(n)||n<=0){
      return kind==='present'?DEFAULT_PRESENT_MS:DEFAULT_AWAY_MS;
    }
    if(kind==='present') return Math.max(500,Math.min(10000,n));
    return Math.max(1000,Math.min(30000,n));
  }

  function awayThresholdMs(p){
    var pa=p&&typeof p==='object'?p:prefs();
    return clampPresenceMs(pa.awayMs!=null?pa.awayMs:pa.away_ms,'away');
  }

  function presentThresholdMs(p){
    var pa=p&&typeof p==='object'?p:prefs();
    return clampPresenceMs(pa.presentMs!=null?pa.presentMs:pa.present_ms,'present');
  }

  function formatPresenceDurationLabel(ms){
    var n=Number(ms);
    if(!isFinite(n)||n<=0) return '—';
    if(n<1000) return String(n)+' ms';

    var sec=n/1000;
    // If exact minutes (e.g. 60000ms), show "1 分钟" instead of "60 秒".
    if(sec>=60 && Math.abs(sec/60-Math.round(sec/60))<0.001){
      var mins=Math.round(sec/60);
      return mins+' '+t('cameraPresenceDurationMin','分钟');
    }
    var unit=t('cameraPresenceDurationSec','秒');
    var rounded=Math.round(sec);
    if(Math.abs(sec-rounded)<0.001) return rounded+' '+unit;
    return sec.toFixed(1).replace(/\.0$/,'')+' '+unit;
  }

  function defaultPresencePrefs(){
    return {
      enabled:false,
      triggers:{
        away:false,shake:false,blink:false,
        openPalm:false,okHand:false,fist:false,wave:false
      },
      onAway:'none',
      onReturn:'none',
      shakeHead:'none',
      deliberateBlink:'none',
      openPalm:'none',
      okHand:'none',
      fist:'none',
      wave:'none',
      awayMs:DEFAULT_AWAY_MS,
      presentMs:DEFAULT_PRESENT_MS,
      shakeHow:'normal',
      shakeConfirmCue:true,
      blinkCloseSec:0.6,
      blinkConfirmCue:true
    };
  }

  function normalizeShakeHow(v){
    var s=String(v||'').trim().toLowerCase();
    if(s==='easy'||s==='light'||s==='gentle') return 'easy';
    if(s==='strong'||s==='hard'||s==='firm') return 'strong';
    return 'normal';
  }

  function shakeEnterForHow(how){
    return SHAKE_ENTER_BY_HOW[normalizeShakeHow(how)]||SHAKE_ENTER_BY_HOW.normal;
  }

  function shakeExitForHow(how){
    return shakeEnterForHow(how)*0.5;
  }

  function normalizeBlinkCloseSec(v){
    // Migrate old vague tiers → concrete seconds.
    var s=String(v==null?'':v).trim().toLowerCase();
    if(s==='easy'||s==='short'||s==='light'||s==='quick'||s==='normal') return 0.6;
    if(s==='long'||s==='strong'||s==='hard'||s==='firm') return 1;
    var n=Number(v);
    if(n===600) return 0.6;
    if(n===1000) return 1;
    if(n===2000) return 2;
    if(n===0.6||n===1||n===2) return n;
    return 0.6;
  }

  function blinkHoldMinMs(sec){
    return Math.round(normalizeBlinkCloseSec(sec)*1000);
  }

  function blinkHoldMaxMs(sec){
    // Room to open after the target hold without feeling stuck.
    return blinkHoldMinMs(sec)+1500;
  }

  function blinkCloseSecLabel(sec){
    sec=normalizeBlinkCloseSec(sec);
    if(sec===1) return t('cameraBlinkCloseSec1','1 秒');
    if(sec===2) return t('cameraBlinkCloseSec2','2 秒');
    return t('cameraBlinkCloseSec06','0.6 秒');
  }

  /** @deprecated keep export alias for older tests */
  function normalizeBlinkCloseHow(v){
    var sec=normalizeBlinkCloseSec(v);
    if(sec===2) return 'long';
    if(sec===1) return 'long';
    return 'normal';
  }
  function blinkHoldMinForHow(how){ return blinkHoldMinMs(how); }
  function blinkHoldMaxForHow(how){ return blinkHoldMaxMs(how); }
  function blinkCloseHowHint(how){ return blinkCloseSecLabel(how); }

  function normalizeAction(v){
    var s=String(v||'none').trim();
    // #4b Send Guard：视觉绑定永不接受 send-class 动作。
    if(isSendClassAction(s)) return 'none';
    if(isAgentActionToken(s)){
      var id=s.slice(6).trim();
      if(isSendClassAction('agent:'+id)) return 'none';
      var A=global.OneToneAgentActions;
      if(A&&A.actionById&&A.actionById(id)) return 'agent:'+id;
      return 'none';
    }
    return ACTIONS[s]?s:'none';
  }

  /** #4b：产品态 Send Guard（pendingAction 延后执行 ≠ 发送确认）。 */
  function isSendClassAction(action){
    var s=String(action||'').trim().toLowerCase();
    if(!s||s==='none') return false;
    if(s==='send'||s==='submit'||s==='stoporsend'||s==='stoporsenddictation') return true;
    if(s.indexOf('agent:')===0){
      var id=s.slice(6);
      return id==='stoporsenddictation'||id==='send'||id==='submit'||id.indexOf('send')>=0;
    }
    return s.indexOf('send')>=0||s.indexOf('submit')>=0;
  }

  function buildCameraSendGuardModel(){
    return {
      allowsDirectSend:false,
      visionOutcome:'pendingConfirm',
      confirmSources:['key','voice','button','helloPin'],
      ruleText:t('cameraProSendGuardRule','发送不会因单个视觉动作直接发出。不允许单视觉直送。'),
      ruleShort:t('cameraProSendGuardRuleShort','不允许单视觉直送'),
      // mid-risk pendingAction delay is not a send-confirm gate
      pendingActionIsNotSendConfirm:true,
      allowedProCtas:['rules','probe','preview']
    };
  }

  function normalizeTriggers(raw,fallbackActions){
    var fa=fallbackActions||{};
    if(raw&&typeof raw==='object'){
      return {
        away:raw.away!==undefined?!!raw.away:(normalizeAction(fa.onAway)!=='none'||normalizeAction(fa.onReturn)!=='none'),
        shake:raw.shake!==undefined?!!raw.shake:normalizeAction(fa.shakeHead)!=='none',
        blink:raw.blink!==undefined?!!raw.blink:normalizeAction(fa.deliberateBlink)!=='none',
        openPalm:raw.openPalm!==undefined?!!raw.openPalm:(raw.open_palm!==undefined?!!raw.open_palm:normalizeAction(fa.openPalm)!=='none'),
        okHand:raw.okHand!==undefined?!!raw.okHand:(raw.ok_hand!==undefined?!!raw.ok_hand:normalizeAction(fa.okHand)!=='none'),
        fist:raw.fist!==undefined?!!raw.fist:normalizeAction(fa.fist)!=='none',
        wave:raw.wave!==undefined?!!raw.wave:normalizeAction(fa.wave)!=='none'
      };
    }
    return {
      away:normalizeAction(fa.onAway)!=='none'||normalizeAction(fa.onReturn)!=='none',
      shake:normalizeAction(fa.shakeHead)!=='none',
      blink:normalizeAction(fa.deliberateBlink)!=='none',
      openPalm:normalizeAction(fa.openPalm)!=='none',
      okHand:normalizeAction(fa.okHand)!=='none',
      fist:normalizeAction(fa.fist)!=='none',
      wave:normalizeAction(fa.wave)!=='none'
    };
  }

  function normalizePrefs(raw){
    var d=defaultPresencePrefs();
    if(!raw||typeof raw!=='object') return d;
    var onAway=normalizeAction(raw.onAway!=null?raw.onAway:raw.on_away);
    var onReturn=normalizeAction(raw.onReturn!=null?raw.onReturn:raw.on_return);
    var shakeHead=normalizeAction(raw.shakeHead!=null?raw.shakeHead:raw.shake_head);
    var deliberateBlink=normalizeAction(raw.deliberateBlink!=null?raw.deliberateBlink:raw.deliberate_blink);
    var openPalm=normalizeAction(raw.openPalm!=null?raw.openPalm:raw.open_palm);
    var okHand=normalizeAction(raw.okHand!=null?raw.okHand:raw.ok_hand);
    var fist=normalizeAction(raw.fist);
    var wave=normalizeAction(raw.wave);
    var enabled=raw.enabled;
    if(enabled===undefined&&raw.Enabled!==undefined) enabled=raw.Enabled;
    return {
      enabled:!!enabled,
      triggers:normalizeTriggers(raw.triggers,{
        onAway:onAway,onReturn:onReturn,shakeHead:shakeHead,deliberateBlink:deliberateBlink,
        openPalm:openPalm,okHand:okHand,fist:fist,wave:wave
      }),
      onAway:onAway,
      onReturn:onReturn,
      shakeHead:shakeHead,
      deliberateBlink:deliberateBlink,
      openPalm:openPalm,
      okHand:okHand,
      fist:fist,
      wave:wave,
      awayMs:clampPresenceMs(raw.awayMs!=null?raw.awayMs:raw.away_ms,'away'),
      presentMs:clampPresenceMs(raw.presentMs!=null?raw.presentMs:raw.present_ms,'present'),
      shakeHow:normalizeShakeHow(raw.shakeHow!=null?raw.shakeHow:raw.shake_how),
      shakeConfirmCue:(function(){
        var v=raw.shakeConfirmCue!=null?raw.shakeConfirmCue:raw.shake_confirm_cue;
        if(v===undefined||v===null) return true;
        return !!v;
      })(),
      blinkCloseSec:normalizeBlinkCloseSec(
        raw.blinkCloseSec!=null?raw.blinkCloseSec:
        (raw.blink_close_sec!=null?raw.blink_close_sec:
        (raw.blinkCloseHow!=null?raw.blinkCloseHow:raw.blink_close_how))
      ),
      blinkConfirmCue:(function(){
        var v=raw.blinkConfirmCue!=null?raw.blinkConfirmCue:raw.blink_confirm_cue;
        if(v===undefined||v===null) return true;
        return !!v;
      })()
    };
  }

  function mirrorTopLevelEnabled(cp,presenceEnabled){
    // Deprecated field — keep mirrored so old readers stay consistent.
    cp.enabled=!!presenceEnabled;
  }

  function ephemeralCameraPrefs(){
    return {
      enabled:false,selectedDeviceId:'',previewEnabled:false,
      selectedWidth:0,selectedHeight:0,selectedFrameRate:0,
      gazeCalibration:null,blinkBaseline:null,presenceActions:defaultPresencePrefs()
    };
  }

  function configPersistLoaded(){
    return !!(global.OneToneConfigPersist&&global.OneToneConfigPersist.isLoaded&&global.OneToneConfigPersist.isLoaded());
  }

  function cameraPrefs(){
    var root=stateRoot();
    if(!root.config||typeof root.config!=='object'){
      if(global.OneToneState&&global.OneToneState.state){
        if(!global.OneToneState.state.config) global.OneToneState.state.config={};
        root=global.OneToneState.state;
      }else{
        return ephemeralCameraPrefs();
      }
    }
    var cfg=root.config;
    if(!cfg.cameraPrefs||typeof cfg.cameraPrefs!=='object'){
      // Do not invent defaults onto config before backend hydrate — quiet save
      // would otherwise persist a blank wipe over real disk prefs.
      if(!configPersistLoaded()) return ephemeralCameraPrefs();
      cfg.cameraPrefs=ephemeralCameraPrefs();
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
    // Explicit gate: never write cameraOverride only because selectedMappingId points at an app scenario.
    if(String(u.cameraEditMode||'global')!=='appScenario') return null;
    if(String(u.habitScenarioReturnPanel||'')!=='camera') return null;
    var id=String(u.habitScenarioReturnId||'').trim();
    if(!id||!coreApi()||!coreApi().byId) return null;
    // Keep navigation context and edit selection aligned.
    var sel=String((stateRoot().selectedMappingId)||'').trim();
    if(sel&&sel!==id) return null;
    var m=coreApi().byId(id);
    if(!m) return null;
    if(diffApi()&&diffApi().isAppScenarioMapping&&!diffApi().isAppScenarioMapping(m)) return null;
    return m;
  }

  /** Runtime merge only — does not authorize writing override. */
  function resolveCameraOverrideMapping(){
    var edit=scenarioCameraEditMapping();
    if(edit) return edit;
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
        blink:ov.triggers&&ov.triggers.blink!==undefined?!!ov.triggers.blink:base.triggers.blink,
        openPalm:ov.triggers&&ov.triggers.openPalm!==undefined?!!ov.triggers.openPalm:base.triggers.openPalm,
        okHand:ov.triggers&&ov.triggers.okHand!==undefined?!!ov.triggers.okHand:base.triggers.okHand,
        fist:ov.triggers&&ov.triggers.fist!==undefined?!!ov.triggers.fist:base.triggers.fist,
        wave:ov.triggers&&ov.triggers.wave!==undefined?!!ov.triggers.wave:base.triggers.wave
      },
      onAway:ov.onAway!=null?normalizeAction(ov.onAway):base.onAway,
      onReturn:ov.onReturn!=null?normalizeAction(ov.onReturn):base.onReturn,
      shakeHead:ov.shakeHead!=null?normalizeAction(ov.shakeHead):base.shakeHead,
      deliberateBlink:ov.deliberateBlink!=null?normalizeAction(ov.deliberateBlink):base.deliberateBlink,
      openPalm:ov.openPalm!=null?normalizeAction(ov.openPalm):base.openPalm,
      okHand:ov.okHand!=null?normalizeAction(ov.okHand):base.okHand,
      fist:ov.fist!=null?normalizeAction(ov.fist):base.fist,
      wave:ov.wave!=null?normalizeAction(ov.wave):base.wave,
      awayMs:base.awayMs,
      presentMs:base.presentMs,
      shakeHow:normalizeShakeHow(ov.shakeHow!=null?ov.shakeHow:base.shakeHow),
      shakeConfirmCue:(function(){
        if(ov.shakeConfirmCue!=null) return !!ov.shakeConfirmCue;
        if(ov.shake_confirm_cue!=null) return !!ov.shake_confirm_cue;
        return base.shakeConfirmCue!==false;
      })(),
      blinkCloseSec:normalizeBlinkCloseSec(
        ov.blinkCloseSec!=null?ov.blinkCloseSec:
        (ov.blink_close_sec!=null?ov.blink_close_sec:base.blinkCloseSec)
      ),
      blinkConfirmCue:(function(){
        if(ov.blinkConfirmCue!=null) return !!ov.blinkConfirmCue;
        if(ov.blink_confirm_cue!=null) return !!ov.blink_confirm_cue;
        return base.blinkConfirmCue!==false;
      })()
    };
    return merged;
  }

  function prefs(){
    var base=basePresencePrefs();
    var m=resolveCameraOverrideMapping();
    return mergeCameraOverride(base,m&&m.cameraOverride);
  }

  function overrideDiffersFromBase(){
    if(scenarioCameraEditMapping()) return false;
    var m=resolveCameraOverrideMapping();
    if(!m||!m.cameraOverride||isEmptyCameraOverride(m.cameraOverride)) return false;
    var base=basePresencePrefs();
    var eff=prefs();
    var keys=['onAway','onReturn','shakeHead','deliberateBlink','openPalm','okHand','fist','wave'];
    for(var i=0;i<keys.length;i++){
      if(normalizeAction(base[keys[i]])!==normalizeAction(eff[keys[i]])) return true;
    }
    var bt=base.triggers||{};
    var et=eff.triggers||{};
    var trig=['away','shake','blink','openPalm','okHand','fist','wave'];
    for(var j=0;j<trig.length;j++){
      if(!!bt[trig[j]]!==!!et[trig[j]]) return true;
    }
    return false;
  }

  /** Global camera page edits base prefs; clear shadowed keys on the active scenario override so UI matches runtime. */
  function clearShadowingCameraOverride(partial){
    if(scenarioCameraEditMapping()) return false;
    var m=resolveCameraOverrideMapping();
    if(!m||!m.cameraOverride||typeof m.cameraOverride!=='object') return false;
    var ov=Object.assign({},m.cameraOverride);
    var changed=false;
    ['onAway','onReturn','shakeHead','deliberateBlink','openPalm','okHand','fist','wave'].forEach(function(k){
      if(partial[k]===undefined) return;
      if(ov[k]!=null){
        delete ov[k];
        changed=true;
      }
    });
    if(partial.triggers&&typeof partial.triggers==='object'){
      var ovTr=ov.triggers&&typeof ov.triggers==='object'?Object.assign({},ov.triggers):{};
      var trigChanged=false;
      ['away','shake','blink','openPalm','okHand','fist','wave'].forEach(function(k){
        if(partial.triggers[k]===undefined) return;
        if(ovTr[k]!==undefined){
          delete ovTr[k];
          trigChanged=true;
        }
      });
      if(trigChanged){
        changed=true;
        if(Object.keys(ovTr).length) ov.triggers=ovTr;
        else delete ov.triggers;
      }
    }
    if(!changed) return false;
    m.cameraOverride=isEmptyCameraOverride(ov)?null:ov;
    scheduleScenarioCameraSave();
    return true;
  }

  function applyGlobalPresenceOverActiveOverride(){
    if(scenarioCameraEditMapping()) return false;
    var m=resolveCameraOverrideMapping();
    if(!m||!m.cameraOverride) return false;
    m.cameraOverride=null;
    scheduleScenarioCameraSave();
    syncUiFromPrefs();
    emitRuntime();
    toast(t('cameraPresenceOverrideCleared','已改用本页设置，当前习惯不再覆盖视觉动作'));
    return true;
  }

  function syncPresenceOverrideHint(){
    var hint=$('cameraPresenceOverrideHint');
    if(!hint) return;
    if(scenarioCameraEditMapping()||!overrideDiffersFromBase()){
      hint.hidden=true;
      hint.textContent='';
      hint.onclick=null;
      return;
    }
    var m=resolveCameraOverrideMapping();
    var name=m?(m.label||m.group||m.appTargetId||m.id||''):'';
    hint.hidden=false;
    hint.textContent=t('cameraPresenceOverrideHint','当前习惯「{name}」覆盖了本页动作（实际在跑覆盖值）。点此改用本页设置')
      .replace('{name}',name||t('cameraPresenceOverrideHabit','应用习惯'));
    hint.setAttribute('role','button');
    hint.tabIndex=0;
    hint.onclick=function(e){
      e.preventDefault();
      applyGlobalPresenceOverActiveOverride();
    };
  }

  function isEmptyCameraOverride(ov){
    if(!ov||typeof ov!=='object') return true;
    var actionEmpty=['onAway','onReturn','shakeHead','deliberateBlink','openPalm','okHand','fist','wave'].every(function(k){
      return ov[k]==null||String(ov[k]).trim()==='';
    });
    var tr=ov.triggers;
    var triggerEmpty=!tr||typeof tr!=='object'||(
      tr.away===undefined&&tr.shake===undefined&&tr.blink===undefined
      &&tr.openPalm===undefined&&tr.okHand===undefined&&tr.fist===undefined&&tr.wave===undefined
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
    ['onAway','onReturn','shakeHead','deliberateBlink','openPalm','okHand','fist','wave'].forEach(function(k){
      if(partial[k]===undefined) return;
      var v=normalizeAction(partial[k]);
      if(v===base[k]) delete ov[k];
      else ov[k]=v;
    });
    if(partial.triggers&&typeof partial.triggers==='object'){
      var baseTr=base.triggers||{};
      var ovTr=ov.triggers&&typeof ov.triggers==='object'?Object.assign({},ov.triggers):{};
      ['away','shake','blink','openPalm','okHand','fist','wave'].forEach(function(k){
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
    var lm=global.OneToneCameraGazeLandmarker;
    if(lm&&lm.isWorkerFailed&&lm.isWorkerFailed()&&!(lm.experimentalPresenceAllowed&&lm.experimentalPresenceAllowed())){
      st.lastError={code:'presence_experimental',message:t('cameraPresenceExperimental','Presence 连续推理需 Worker；失败后仅实验开关可启用（ot_presence_experimental=1）')};
      st.runtimeStatus='error';
      emitRuntime();
      return Promise.resolve({ok:false,reason:'presence_experimental',error:st.lastError});
    }
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
    // Config reload must refresh bind tiles / trigger summaries — init() ran before mvp_init.
    if(reason==='config_applied'){
      try{ syncUiFromPrefs(); }catch(_){}
    }
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
    // Boot/config apply must not open the camera on this turn.
    // WebView2 getUserMedia can block the UI thread (Responding=false / 假死);
    // last stall: last-ui-stall.json tag=bootCameraReconcile.
    if(reason==='config_applied'){
      try{
        if(st._bootCamTimer) clearTimeout(st._bootCamTimer);
      }catch(_){}
      st.runtimeStatus='off';
      emitRuntime();
      st._bootCamTimer=setTimeout(function bootCamDeferredTick(){
        st._bootCamTimer=null;
        if(!isEnabled()||st.manualStopped||isCameraPreviewLive()) return;
        // Settings drawer owns the UI — do NOT retry every 8s (was still UI_HB_STALL_5S
        // ~80s after voiceWake open with empty tag). Resume path restarts camera.
        if(st.drawerUiPaused){
          try{
            if(global.OneToneIpc&&global.OneToneIpc.invoke){
              global.OneToneIpc.invoke('cmd_app_log',{line:'fe bootCam skip drawer paused'}).catch(function(){});
            }
          }catch(_){}
          return;
        }
        ensureRunning({reason:'boot_deferred'});
      },12000);
      return Promise.resolve({ok:true,reason:'boot_deferred'});
    }
    return ensureRunning({reason:reason});
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

  function deferCameraHeavyWork(fn){
    // Let dropdown/toggle paint first — sync MediaPipe on the click path used to 假死.
    if(typeof global.requestAnimationFrame==='function'){
      global.requestAnimationFrame(function(){
        global.setTimeout(fn,0);
      });
    }else{
      global.setTimeout(fn,0);
    }
  }

  function syncLiveLandmarkerDeferred(){
    deferCameraHeavyWork(function(){
      var pv=global.OneToneCameraPreview;
      if(pv&&pv.syncLiveLandmarker){
        try{ pv.syncLiveLandmarker(); }catch(_){}
      }
      // Hand start is gated; prefs may have just enabled openPalm/etc.
      if(pv&&pv.syncHandGesture){
        try{ pv.syncHandGesture(); }catch(_){}
      }
    });
  }

  function persistPresencePrefs(partial){
    partial=partial&&typeof partial==='object'?partial:{};
    var cp=cameraPrefs();
    var cur=basePresencePrefs();
    var wasEnabled=!!cur.enabled;
    var touchedEnabled=partial.enabled!==undefined;
    var hasAction=partial.onAway!=null||partial.onReturn!=null||partial.shakeHead!=null||partial.deliberateBlink!=null
      ||partial.openPalm!=null||partial.okHand!=null||partial.fist!=null||partial.wave!=null;
    var hasTriggers=partial.triggers!=null&&typeof partial.triggers==='object';
    var hasTuning=partial.shakeHow!=null
      ||partial.shakeConfirmCue!=null||partial.shake_confirm_cue!=null
      ||partial.blinkCloseSec!=null||partial.blinkCloseHow!=null
      ||partial.blink_close_sec!=null||partial.blink_close_how!=null
      ||partial.blinkConfirmCue!=null||partial.blink_confirm_cue!=null
      ||partial.awayMs!=null||partial.presentMs!=null;
    var paramOnly=hasTuning&&!hasAction&&!hasTriggers&&!touchedEnabled;

    if(touchedEnabled){
      cur.enabled=!!partial.enabled;
      cp.presenceActions=cur;
      mirrorTopLevelEnabled(cp,cur.enabled);
    }

    if((hasAction||hasTriggers)&&scenarioCameraEditMapping()){
      if(touchedEnabled){
        if(global.OneToneConfigPersist){
          if(global.OneToneConfigPersist.rememberCameraPrefs){
            try{ global.OneToneConfigPersist.rememberCameraPrefs(); }catch(_){}
          }
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
      syncLiveLandmarkerDeferred();
      if(touchedEnabled&&cur.enabled!==wasEnabled){
        deferCameraHeavyWork(function(){
          if(cur.enabled){
            st.manualStopped=false;
            reconcileRuntime({reason:'master_on'});
          }else{
            ensureStopped({reason:'master_off'});
          }
        });
      }
      return;
    }

    if(partial.onAway!=null) cur.onAway=normalizeAction(partial.onAway);
    if(partial.onReturn!=null) cur.onReturn=normalizeAction(partial.onReturn);
    if(partial.shakeHead!=null) cur.shakeHead=normalizeAction(partial.shakeHead);
    if(partial.deliberateBlink!=null) cur.deliberateBlink=normalizeAction(partial.deliberateBlink);
    if(partial.openPalm!=null) cur.openPalm=normalizeAction(partial.openPalm);
    if(partial.okHand!=null) cur.okHand=normalizeAction(partial.okHand);
    if(partial.fist!=null) cur.fist=normalizeAction(partial.fist);
    if(partial.wave!=null) cur.wave=normalizeAction(partial.wave);
    if(partial.awayMs!=null) cur.awayMs=clampPresenceMs(partial.awayMs,'away');
    if(partial.presentMs!=null) cur.presentMs=clampPresenceMs(partial.presentMs,'present');
    if(partial.shakeHow!=null) cur.shakeHow=normalizeShakeHow(partial.shakeHow);
    if(partial.shakeConfirmCue!=null||partial.shake_confirm_cue!=null){
      var shakeCue=partial.shakeConfirmCue!=null?partial.shakeConfirmCue:partial.shake_confirm_cue;
      cur.shakeConfirmCue=!!shakeCue;
    }
    if(partial.blinkCloseSec!=null||partial.blinkCloseHow!=null||partial.blink_close_sec!=null||partial.blink_close_how!=null){
      cur.blinkCloseSec=normalizeBlinkCloseSec(
        partial.blinkCloseSec!=null?partial.blinkCloseSec:
        (partial.blink_close_sec!=null?partial.blink_close_sec:
        (partial.blinkCloseHow!=null?partial.blinkCloseHow:partial.blink_close_how))
      );
    }
    if(partial.blinkConfirmCue!=null||partial.blink_confirm_cue!=null){
      var cue=partial.blinkConfirmCue!=null?partial.blinkConfirmCue:partial.blink_confirm_cue;
      cur.blinkConfirmCue=!!cue;
    }
    if(hasTriggers){
      cur.triggers=normalizeTriggers(Object.assign({},cur.triggers,partial.triggers),cur);
    }else if(hasAction){
      var tr=Object.assign({},cur.triggers);
      if(partial.onAway!=null||partial.onReturn!=null){
        if(cur.onAway!=='none'||cur.onReturn!=='none') tr.away=true;
      }
      if(partial.shakeHead!=null&&cur.shakeHead!=='none') tr.shake=true;
      if(partial.deliberateBlink!=null&&cur.deliberateBlink!=='none') tr.blink=true;
      if(partial.openPalm!=null&&cur.openPalm!=='none') tr.openPalm=true;
      if(partial.okHand!=null&&cur.okHand!=='none') tr.okHand=true;
      if(partial.fist!=null&&cur.fist!=='none') tr.fist=true;
      if(partial.wave!=null&&cur.wave!=='none') tr.wave=true;
      cur.triggers=normalizeTriggers(tr,cur);
    }
    cp.presenceActions=cur;
    mirrorTopLevelEnabled(cp,!!cur.enabled);
    if(hasAction||hasTriggers) clearShadowingCameraOverride(partial);
    st.enabled=!!cur.enabled;
    if(global.OneToneConfigPersist){
      if(global.OneToneConfigPersist.rememberCameraPrefs){
        try{ global.OneToneConfigPersist.rememberCameraPrefs(); }catch(_){}
      }
      if(global.OneToneConfigPersist.saveCameraPrefsQuiet) global.OneToneConfigPersist.saveCameraPrefsQuiet();
      else if(global.OneToneConfigPersist.saveAsync) global.OneToneConfigPersist.saveAsync();
      else if(global.OneToneConfigPersist.save) global.OneToneConfigPersist.save();
    }
    if(paramOnly){
      // Tuning only — patch local controls; do not rebuild all selects or touch MediaPipe.
      syncPresenceDurationUi(cur);
      syncShakeHowUi(cur);
      syncBlinkCloseSecUi(cur);
      syncBlinkConfirmCueUi(cur);
      syncShakeConfirmCueUi(cur);
      syncDetectInterval();
      return;
    }
    syncUiFromPrefs();
    syncDetectInterval();
    emitRuntime();
    syncLiveLandmarkerDeferred();
    if(touchedEnabled&&cur.enabled!==wasEnabled){
      deferCameraHeavyWork(function(){
        if(cur.enabled){
          st.manualStopped=false;
          reconcileRuntime({reason:'master_on'});
        }else{
          ensureStopped({reason:'master_off'});
        }
      });
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

  function cameraPanelHot(){
    try{
      var ui=global.OneToneState&&global.OneToneState.ui;
      return !!(ui&&ui.drawerOpen&&ui.settingsPanel==='camera');
    }catch(_){
      return false;
    }
  }

  function clampDetectIntervalMs(ms){
    ms=Number(ms)||DETECT_PRESENT_MS;
    // Only the camera settings page / calibration need full-rate bitmaps.
    // gaze.enabled defaults true for overlay chrome — must NOT bypass home floor
    // (that made DETECT_HOME_MS dead and dual-bitmap 假死 on the workbench).
    if(cameraPanelHot()||isCalibrating()) return ms;
    return Math.max(ms,DETECT_HOME_MS);
  }

  function syncDetectInterval(){
    var api=global.OneToneCameraGazeLandmarker;
    var hand=global.OneToneCameraHandGesture;
    if(!api||!api.setDetectIntervalMs) return;
    var gazeMs=preferredDetectIntervalMs(0);
    var next=gazeMs;
    // Camera panel / calibration: prefer capture FPS (clamp still floors on home).
    if(cameraPanelHot()||isCalibrating()){
      next=clampDetectIntervalMs(gazeMs);
      api.setDetectIntervalMs(next);
      if(hand&&hand.setDetectIntervalMs) hand.setDetectIntervalMs(next);
      return;
    }
    if(!isEnabled()){
      next=clampDetectIntervalMs(gazeMs);
      api.setDetectIntervalMs(next);
      if(hand&&hand.setDetectIntervalMs) hand.setDetectIntervalMs(next);
      return;
    }
    var p=prefs();
    var gestureOn=triggerEnabled('shake',p)||triggerEnabled('blink',p)
      ||triggerEnabled('openPalm',p)||triggerEnabled('okHand',p)||triggerEnabled('fist',p)||triggerEnabled('wave',p)
      ||normalizeAction(p.shakeHead)!=='none'||normalizeAction(p.deliberateBlink)!=='none'
      ||normalizeAction(p.openPalm)!=='none'||normalizeAction(p.okHand)!=='none'
      ||normalizeAction(p.fist)!=='none'||normalizeAction(p.wave)!=='none';
    if(gestureOn&&st.presence!=='away'){
      next=clampDetectIntervalMs(gazeMs);
      api.setDetectIntervalMs(next);
      // Hand used to stay at 50ms on home while gaze was home-throttled → dual createImageBitmap 假死.
      if(hand&&hand.setDetectIntervalMs) hand.setDetectIntervalMs(next);
      if(typeof st.onDetectInterval==='function'){
        try{ st.onDetectInterval(next); }catch(_){}
      }
      return;
    }
    // away / present power tiers unchanged — not tied to Pro display FPS.
    if(st.presence==='away') next=DETECT_AWAY_MS;
    else next=DETECT_PRESENT_MS;
    next=clampDetectIntervalMs(next);
    api.setDetectIntervalMs(next);
    if(hand&&hand.setDetectIntervalMs) hand.setDetectIntervalMs(next);
    if(typeof st.onDetectInterval==='function'){
      try{ st.onDetectInterval(next); }catch(_){}
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
    if(source==='openPalm') return 'openPalm';
    if(source==='ok'||source==='okHand') return 'okHand';
    if(source==='fist') return 'fist';
    if(source==='wave') return 'wave';
    return '';
  }

  function isKeyAction(action){
    return action==='pressEsc'||action==='pressCtrlI'||isAgentActionToken(action);
  }

  function isVoiceDictating(){
    if(st.cameraVoiceSessionActive) return true;
    try{
      var rt=runtime();
      var end=rt.voiceEnd||rt.voice_end||{};
      if(String(end.state||'')==='dictating') return true;
    }catch(_){}
    return false;
  }

  function voiceActivateThrottleMs(){
    return isVoiceDictating()?KEY_THROTTLE_VOICE_END_MS:KEY_THROTTLE_VOICE_MS;
  }

  function blinkGestureCooldownMs(){
    return isVoiceDictating()?BLINK_COOLDOWN_END_MS:BLINK_COOLDOWN_MS;
  }

  function actionRiskLevel(action,source){
    action=normalizeAction(action);
    source=String(source||'');
    // Ending dictation via blink must be immediate — mid delay blocked toggle-off.
    if(action==='pressCtrlI'&&isVoiceDictating()) return 'low';
    // Gesture already confirmed intent. Mid delay + face flicker during shake
    // flips presence→away and cancelPendingAction, so the key never sends.
    if((action==='pressCtrlI'||action==='pressEsc')&&isGestureSource(source)) return 'low';
    if(action==='privacyScreen'||action==='pauseVoice'||action==='lowPowerMode') return 'low';
    if(action==='pressEsc'||action==='pressCtrlI'||action==='resumeVoice') return 'mid';
    if(isAgentActionToken(action)){
      var A=global.OneToneAgentActions;
      var def=A&&A.actionById&&A.actionById(action.slice(6));
      if(!def) return 'high';
      if(def.risk==='safe') return 'low';
      if(def.risk==='confirm') return 'mid';
      return 'high';
    }
    if(action==='none') return 'none';
    return 'high';
  }

  function isGestureSource(source){
    source=String(source||'');
    return source==='shake'||source==='blink'
      ||source==='openPalm'||source==='ok'||source==='okHand'||source==='fist'||source==='wave';
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

    // Gestures: shake / blink / hand
    if(source==='shake'||source==='blink'
      ||source==='openPalm'||source==='ok'||source==='okHand'||source==='fist'||source==='wave'){
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
      var throttleMs=action==='pressCtrlI'?voiceActivateThrottleMs():KEY_THROTTLE_MS;
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
   * User's IME activate shortcut from their recorded scheme — never invent RAlt / Ctrl+I / Win+H.
   * Prefer: habit voiceOverride → active IME habit key → any enabled IME habit → voice-settings keys → global imePreset.
   * Workflow app scenes (Codex/Cursor) keep Ctrl+L etc. on mapping.targetKey; those must not steal IME activate.
   */
  function resolveVoiceActivateKey(){
    var cfg=stateRoot().config||{};
    var m=activeHabitMapping();

    if(m){
      var ov=m.voiceOverride||m.voice_override||null;
      if(ov&&ov.targetKey&&String(ov.targetKey).trim()){
        return String(ov.targetKey).trim();
      }
      if(!isWorkflowAppTarget(m.appTargetId||m.app_target_id)){
        var mapKey=String(m.targetKey||m.target_key||'').trim();
        if(mapKey) return mapKey;
        var fromPreset=presetActivateKey(m.imePresetId||m.ime_preset_id);
        if(fromPreset) return fromPreset;
      }
    }

    var imeFromHabits=findEnabledImeActivateKey(cfg,m&&m.id);
    if(imeFromHabits) return imeFromHabits;

    var fromVoice=resolveConfiguredVoiceEngineKey(cfg);
    if(fromVoice) return fromVoice;

    return presetActivateKey(cfg.imePresetId||cfg.ime_preset_id);
  }

  function findEnabledImeActivateKey(cfg,skipId){
    var mappings=Array.isArray(cfg&&cfg.mappings)?cfg.mappings:[];
    var skip=String(skipId||'');
    for(var i=0;i<mappings.length;i++){
      var row=mappings[i];
      if(!row||row.enabled===false) continue;
      if(skip&&String(row.id||'')===skip) continue;
      if(isWorkflowAppTarget(row.appTargetId||row.app_target_id)) continue;
      var k=String(row.targetKey||row.target_key||'').trim();
      if(k) return k;
      var pk=presetActivateKey(row.imePresetId||row.ime_preset_id);
      if(pk) return pk;
    }
    return '';
  }

  function friendlyKeyLabel(key){
    key=String(key||'').trim();
    if(!key) return '';
    try{
      if(global.OneToneKeyLabels&&global.OneToneKeyLabels.friendlyKeyName){
        return global.OneToneKeyLabels.friendlyKeyName(key,global.OneToneI18n&&global.OneToneI18n.getLang?global.OneToneI18n.getLang():'zh')||key;
      }
    }catch(_){}
    return key;
  }

  function voiceActivateActionLabel(){
    var base=t('cameraPresenceActionCtrlI','语音输入法激活');
    var key=resolveVoiceActivateKey();
    if(!key) return base+'（'+t('cameraPresenceVoiceKeyUnset','未配置')+'）';
    return base+'（'+friendlyKeyLabel(key)+'）';
  }

  function pressKey(targetKey,opts){
    opts=opts||{};
    var now=performance.now();
    var ending=!!(opts.voiceActivate&&isVoiceDictating());
    var throttleMs=opts.voiceActivate?voiceActivateThrottleMs():KEY_THROTTLE_MS;
    if(now-st.lastKeyAt<throttleMs){
      // Last-line silent throttle — outer shouldThrottle already surfaces skip to UI.
      logPresence('key throttled '+targetKey+(ending?' (end)':''));
      return Promise.resolve({ok:false,reason:'throttled'});
    }
    if(!canPressKey()){
      logPresence('key blocked presence='+st.presence+' paused='+(runtime().paused?'1':'0'));
      return Promise.resolve({ok:false,reason:'blocked'});
    }
    st.lastKeyAt=now;
    logPresence('key send '+targetKey+(ending?' end-dictation':' start-dictation'));
    return invokeIpc('cmd_test_send',{mappingId:null,targetKey:targetKey}).then(function(res){
      if(!res||!res.ok){
        var reason=res&&res.reason?String(res.reason):'failed';
        logPresence('key fail '+targetKey+' reason='+reason);
        if(reason==='paused'){
          toast(t('cameraPresenceKeyPaused','监听已暂停，无法注入按键'));
        }else if(reason==='self_foreground'){
          toast(t('cameraPresenceKeySelfFg','请先点到记事本等要听写的窗口，再摇头/眨眼（OneTone 在前台时不会发送 Alt）'));
          setSkipReason(t('cameraPresenceKeySelfFgShort','目标窗口不在前台'),'key');
        }else if(reason==='recording'){
          toast(t('cameraPresenceKeyRecording','录制快捷键时无法注入按键'));
        }else{
          toast(t('cameraPresenceKeyFailed','按键发送失败')+'（'+friendlyKeyLabel(targetKey)+'）');
        }
      }else{
        logPresence('key ok '+targetKey+(ending?' end':' start'));
        if(opts.voiceActivate){
          if(ending||st.cameraVoiceSessionActive){
            st.cameraVoiceSessionActive=false;
            toast(t('cameraPresenceVoiceEnded','已结束语音输入法'));
          }else{
            st.cameraVoiceSessionActive=true;
            toast(t('cameraPresenceVoiceStarted','已激活语音输入法')+' · '+friendlyKeyLabel(targetKey));
          }
        }else{
          toast(t('cameraPresenceKeySent','已发送激活键')+' '+friendlyKeyLabel(targetKey));
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
    var base=['none','pressEsc','pressCtrlI','privacyScreen','pauseVoice','resumeVoice','lowPowerMode'];
    var A=global.OneToneAgentActions;
    if(A&&A.cameraRecommendedActionIds){
      var ids=A.cameraRecommendedActionIds();
      for(var i=0;i<ids.length;i++){
        base.push(A.agentActionToken(ids[i]));
      }
    }
    return base;
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
        global.OneToneVoiceWake.switchListeningStrategy('auto',{force:true});
      }
    }catch(_){}
    toast(t('cameraPresenceLowPowerOff','已退出低消耗运行'));
  }

  function playCameraActionCue(res){
    if(!res||res.ok===false||res.skipped||res.pending) return;
    if(res.action==='none') return;
    try{
      if(global.OneToneAppThemePrefs&&typeof global.OneToneAppThemePrefs.playSoundCue==='function'){
        global.OneToneAppThemePrefs.playSoundCue('camera_action');
      }
    }catch(_){}
  }

  /** Armed-phase cue: always audible when confirm-cue mode is on (preview bypasses slot mute). */
  function playArmedCue(){
    try{
      var T=global.OneToneAppThemePrefs;
      if(T&&typeof T.previewSoundSlot==='function'){
        T.previewSoundSlot('cameraAction');
        return;
      }
      if(T&&typeof T.playSoundCue==='function') T.playSoundCue('camera_action');
    }catch(_){}
  }

  /** @deprecated alias */
  function playBlinkArmedCue(){ playArmedCue(); }

  function clearBlinkClosed(){
    st.blinkClosed=false;
    st.blinkCloseSince=0;
    st.blinkCloseCandidateSince=0;
    st.blinkOpenCandidateSince=0;
    st.blinkConfirmCloseSince=0;
  }

  function resetBlinkGesture(){
    clearBlinkClosed();
    st.blinkPhase='idle';
    st.blinkArmedAt=0;
    st.blinkArmedReady=false;
    st.blinkHoldStartYaw=null;
  }

  function readBlinkBaseline(){
    var cp=cameraPrefs();
    var b=cp&&cp.blinkBaseline;
    if(!b||typeof b!=='object') return null;
    var on=Number(b.on);
    var off=Number(b.off);
    if(!isFinite(on)||!isFinite(off)||on<=off) return null;
    return {
      openP50:Number(b.openP50)||0,
      openP90:Number(b.openP90)||0,
      on:on,
      off:off,
      savedAt:Number(b.savedAt)||0
    };
  }

  function blinkThresholds(){
    var b=readBlinkBaseline();
    if(b){
      // Keep close threshold reachable; over-calibrated `on` made long blinks never arm.
      var on=Math.max(0.34,Math.min(0.62,b.on));
      var off=Math.max(0.08,Math.min(on-0.12,b.off));
      return {on:on,off:off,calibrated:true};
    }
    return {on:BLINK_DEFAULT_ON,off:BLINK_DEFAULT_OFF,calibrated:false};
  }

  function percentileSorted(sorted,p){
    if(!sorted||!sorted.length) return 0;
    var idx=Math.min(sorted.length-1,Math.max(0,Math.round((sorted.length-1)*p)));
    return sorted[idx];
  }

  function computeBlinkBaselineFromSamples(samples){
    if(!samples||samples.length<BLINK_BASELINE_MIN_SAMPLES) return null;
    var sorted=samples.slice().sort(function(a,b){ return a-b; });
    var openP50=percentileSorted(sorted,0.5);
    var openP90=percentileSorted(sorted,0.9);
    // Closed must clear open-eye high quantile with margin; keep hysteresis.
    // Keep `on` reachable for short confirm blinks (peaks lower than long holds).
    var on=Math.max(0.36,Math.min(0.72,openP90+0.22));
    var off=Math.max(0.10,Math.min(on-0.16,openP50+0.10));
    if(off>=on) off=Math.max(0.08,on-0.18);
    return {openP50:openP50,openP90:openP90,on:on,off:off,savedAt:Date.now()};
  }

  function persistBlinkBaseline(baseline){
    var cp=cameraPrefs();
    cp.blinkBaseline=baseline;
    st.blinkBaselineStatus=baseline?'ok':'';
    if(global.OneToneConfigPersist&&global.OneToneConfigPersist.saveCameraPrefsQuiet){
      global.OneToneConfigPersist.saveCameraPrefsQuiet();
    }else if(global.OneToneConfigPersist&&global.OneToneConfigPersist.saveAsync){
      global.OneToneConfigPersist.saveAsync();
    }
    syncBlinkBaselineUi();
  }

  function startBlinkBaselineSample(force){
    st.blinkBaselineForce=!!force;
    st.blinkBaselineBuf=[];
    st.blinkBaselineStartedAt=performance.now();
    st.blinkBaselineStatus='sampling';
    resetBlinkGesture();
    syncBlinkBaselineUi();
    toast(t('cameraPresenceBlinkBaselineStart','请睁眼看镜头约 1.5 秒，正在适配眨眼…'));
  }

  function maybeSampleBlinkBaseline(now,blinkScore,th){
    if(st.blinkBaselineStatus!=='sampling') return;
    if(blinkScore==null||!isFinite(blinkScore)) return;
    // Only keep open-eye frames (below close threshold).
    if(blinkScore>=th.on*0.85) return;
    st.blinkBaselineBuf.push(blinkScore);
    if(st.blinkBaselineBuf.length>80) st.blinkBaselineBuf=st.blinkBaselineBuf.slice(-80);
    var elapsed=now-st.blinkBaselineStartedAt;
    if(elapsed<BLINK_BASELINE_MS) return;
    if(st.blinkBaselineBuf.length<BLINK_BASELINE_MIN_SAMPLES){
      if(elapsed>BLINK_BASELINE_MS*2.5){
        st.blinkBaselineStatus='failed';
        st.blinkBaselineForce=false;
        syncBlinkBaselineUi();
        toast(t('cameraPresenceBlinkBaselineFail','眨眼适配失败，请面向镜头后重试'));
      }
      return;
    }
    var baseline=computeBlinkBaselineFromSamples(st.blinkBaselineBuf);
    st.blinkBaselineBuf=[];
    st.blinkBaselineStartedAt=0;
    st.blinkBaselineForce=false;
    if(!baseline){
      st.blinkBaselineStatus='failed';
      syncBlinkBaselineUi();
      return;
    }
    persistBlinkBaseline(baseline);
    toast(t('cameraPresenceBlinkBaselineOk','眨眼已适配，可用「半秒闭眼 + 短眨确认」'));
  }

  function ensureBlinkBaselineSampling(){
    if(!triggerEnabled('blink')) return;
    if(st.blinkBaselineStatus==='sampling') return;
    if(st.blinkBaselineForce){
      startBlinkBaselineSample(true);
      return;
    }
    if(readBlinkBaseline()) return;
    // Auto-fit once when blink is on and no baseline yet (not on failed retry loops).
    if(st.blinkBaselineStatus==='failed'||st.blinkBaselineStatus==='ok') return;
    startBlinkBaselineSample(false);
  }

  function recentShakeActivity(now){
    if(!st.shakeSeq||st.shakeSeq.length<2) return false;
    var a=st.shakeSeq[st.shakeSeq.length-2];
    var b=st.shakeSeq[st.shakeSeq.length-1];
    if(!a||!b) return false;
    if(a.side===b.side) return false;
    // Two opposite sides within a short window = active shake, not resting tilt.
    return (now-a.t)<700&&(now-b.t)<500;
  }

  function blinkHeadUnstable(now,yaw){
    if(yaw==null||!isFinite(yaw)) return false;
    // Only abort blink during active left↔right shake, not resting side face.
    if(recentShakeActivity(now)) return true;
    if(st.blinkPhase==='holding'||st.blinkClosed){
      if(st.blinkHoldStartYaw!=null&&isFinite(st.blinkHoldStartYaw)){
        if(Math.abs(yaw-st.blinkHoldStartYaw)>BLINK_HOLD_YAW_ABORT) return true;
      }
    }
    return false;
  }

  function syncBlinkBaselineUi(){
    var btn=$('cameraBlinkRecalibrateBtn');
    var hint=$('cameraBlinkBaselineHint');
    var b=readBlinkBaseline();
    var sampling=st.blinkBaselineStatus==='sampling';
    if(btn){
      btn.disabled=sampling;
      btn.textContent=sampling
        ?t('cameraPresenceBlinkBaselineBusy','适配中…')
        :t('cameraPresenceBlinkRecalibrate','去摄像头设置适配');
    }
    if(hint){
      if(sampling) hint.textContent=t('cameraPresenceBlinkBaselineSampling','正在采开眼基线…');
      else if(b) hint.textContent=t('cameraPresenceBlinkBaselineReady','已适配个人开眼阈值');
      else hint.textContent=t('cameraPresenceBlinkBaselineNone','尚未适配 · 开启识别后自动采集');
    }
  }

  function executeActionNow(action,source){
    action=normalizeAction(action);
    st.lastAction=action;
    st.lastActionAt=performance.now();
    noteEvent(source||action);
    st.lastSkipReason='';
    st.pendingPreviewLine='';

    if(isAgentActionToken(action)){
      var A=global.OneToneAgentActions;
      if(!A||!A.execute) return Promise.resolve({ok:false,reason:'unsupported_action'});
      var mappingId='';
      try{
        var ui=global.OneToneState&&global.OneToneState.ui;
        mappingId=String((ui&&ui.habitScenarioReturnId)||'');
      }catch(_){}
      return A.execute({
        actionId:action.slice(6),
        mappingId:mappingId||null
      }).then(function(res){
        return res&&typeof res==='object'?res:{ok:false,reason:'input_failed'};
      }).catch(function(err){
        logPresence('agent action fail '+action+' '+(err&&err.message?err.message:String(err||'')));
        return {ok:false,reason:'invoke_failed',detail:err&&err.message?err.message:String(err||'')};
      });
    }

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
          global.OneToneVoiceWake.switchListeningStrategy('resourceSaver',{force:true});
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
    // #4b：视觉路径禁止 send-class（normalize 也会压成 none）。
    if(isSendClassAction(action)){
      toast(t('cameraProSendGuardRuleShort','不允许单视觉直送'));
      logPresence('block send-class '+String(source||'')+' action='+String(action||''));
      return Promise.resolve({ok:false,reason:'send_guard',visionOutcome:'pendingConfirm'});
    }
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

    var risk=actionRiskLevel(action,source);
    // mid-risk pendingAction = delayed execute; NOT send-confirm / pendingConfirm.
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
          playCameraActionCue(res);
          if(pending.source==='return') toast(t('cameraPresenceReturnFired','已回席'));
        }).catch(function(err){
          logPresence('pending execute fail '+(err&&err.message?err.message:String(err||'')));
        });
      },MID_RISK_DELAY_MS);
      return Promise.resolve({ok:true,action:action,pending:true});
    }

    return executeActionNow(action,source).then(function(res){
      playCameraActionCue(res);
      return res;
    }).catch(function(err){
      logPresence('execute fail '+source+' '+(err&&err.message?err.message:String(err||'')));
      return {ok:false,reason:'invoke_failed'};
    });
  }

  function triggerEnabled(kind,p){
    p=p||prefs();
    var tr=p.triggers||{};
    if(kind==='away') return !!tr.away;
    if(kind==='shake') return !!tr.shake;
    if(kind==='blink') return !!tr.blink;
    if(kind==='openPalm') return !!tr.openPalm;
    if(kind==='okHand') return !!tr.okHand;
    if(kind==='fist') return !!tr.fist;
    if(kind==='wave') return !!tr.wave;
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
      try{
        if(global.OneToneCameraProGlance&&global.OneToneCameraProGlance.onReturnPresent){
          global.OneToneCameraProGlance.onReturnPresent();
        }
      }catch(_){}
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
    resetShakeArmed();
    st.lastYaw=null;
    st.lastPitch=null;
    resetBlinkGesture();
    st.blinkOpenSince=0;
    clearPendingOpenPalm();
    st.handHoldKind='none';
  }

  function resetShakeArmed(){
    st.shakePhase='idle';
    st.shakeArmedAt=0;
    st.shakeArmedPitch=0;
    st.shakeNodPhase='ready';
    st.shakeNodDownSince=0;
    st.shakeNodSettleSince=0;
  }

  function clearPendingOpenPalm(){
    if(st.pendingOpenPalmTimer){
      try{ clearTimeout(st.pendingOpenPalmTimer); }catch(_){}
      st.pendingOpenPalmTimer=0;
    }
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
    else if(kind==='blink') toast(t('cameraPresenceBlinkDetected','已识别：故意眨眼确认'));
    else if(kind==='openPalm') toast(t('cameraPresenceOpenPalmDetected','已识别：五指张开'));
    else if(kind==='ok'||kind==='okHand') toast(t('cameraPresenceOkDetected','已识别：OK'));
    else if(kind==='fist') toast(t('cameraPresenceFistDetected','已识别：握拳'));
    else if(kind==='wave') toast(t('cameraPresenceWaveDetected','已识别：挥手'));
    pulseGesture(kind);
    dispatchAction(action,kind).catch(function(err){
      logPresence(kind+' dispatch fail '+(err&&err.message?err.message:String(err||'')));
    });
  }

  var HAND_KIND_TO_TRIGGER={
    openPalm:'openPalm',
    fist:'fist',
    ok:'okHand',
    wave:'wave'
  };

  function commitHandGesture(kind,now){
    var trig=HAND_KIND_TO_TRIGGER[kind];
    if(!trig) return;
    var p=prefs();
    if(!triggerEnabled(trig,p)) return;
    if((now-st.lastHandFireAt)<HAND_COOLDOWN_MS) return;
    st.lastHandKind=kind;
    st.lastHandFireAt=now;
    var action=normalizeAction(p[trig]);
    if(action==='none'){
      noteEvent(kind);
      pulseGesture(kind);
      setSkipReason(t('cameraTriggerRecognizedUnbound','识别中 · 未绑定动作'),kind);
      if(kind==='openPalm') toast(t('cameraPresenceOpenPalmDetected','已识别：五指张开'));
      else if(kind==='ok'||kind==='okHand') toast(t('cameraPresenceOkDetected','已识别：OK'));
      else if(kind==='fist') toast(t('cameraPresenceFistDetected','已识别：握拳'));
      else if(kind==='wave') toast(t('cameraPresenceWaveDetected','已识别：挥手'));
      return;
    }
    fireGesture(kind,action);
  }

  function updateHandGestures(now){
    var api=global.OneToneCameraHandGesture;
    if(!api||!api.getLastGesture) return;
    var g=api.getLastGesture();
    var kind=g&&g.kind?g.kind:'none';
    if(kind==='none'){
      // Require hand-down / gesture lost before the same kind can fire again.
      clearPendingOpenPalm();
      st.handHoldKind='none';
      return;
    }
    if((now-(g.at||0))>900) return;

    // Rising edge only — holding open palm must not re-fire (pressCtrlI toggles start→end).
    if(kind===st.handHoldKind) return;
    st.handHoldKind=kind;

    var p=prefs();
    if(kind==='wave'){
      clearPendingOpenPalm();
      commitHandGesture('wave',now);
      return;
    }

    if(kind==='openPalm'&&triggerEnabled('wave',p)){
      // Wave always begins as Open_Palm; only fire openPalm if still a still palm
      // after defer and the recognizer did not latch wave.
      clearPendingOpenPalm();
      st.pendingOpenPalmTimer=setTimeout(function(){
        st.pendingOpenPalmTimer=0;
        if(st.handHoldKind!=='openPalm') return;
        if(!isEnabled()) return;
        var g2=api.getLastGesture&&api.getLastGesture();
        if(g2&&g2.kind==='wave') return;
        commitHandGesture('openPalm',performance.now());
      },OPEN_PALM_WAVE_DEFER_MS);
      return;
    }

    commitHandGesture(kind,now);
  }

  function pruneShakeSeq(now){
    while(st.shakeSeq.length&&(now-st.shakeSeq[0].t)>SHAKE_WINDOW_MS){
      st.shakeSeq.shift();
    }
  }

  function shakeHystSide(yaw,how){
    var enter=shakeEnterForHow(how);
    var exit=shakeExitForHow(how);
    var cur=st.shakeHyst||'center';
    if(cur==='left'){
      if(yaw>-exit) return 'center';
      return 'left';
    }
    if(cur==='right'){
      if(yaw<exit) return 'center';
      return 'right';
    }
    if(yaw<=-enter) return 'left';
    if(yaw>=enter) return 'right';
    return 'center';
  }

  function matchShakePattern(){
    pruneShakeSeq(performance.now());
    // Three beats only: L-R-L or R-L-R. Single left↔right is too easy to false-trigger.
    if(st.shakeSeq.length<3) return false;
    var a=st.shakeSeq[st.shakeSeq.length-3].side;
    var b=st.shakeSeq[st.shakeSeq.length-2].side;
    var c=st.shakeSeq[st.shakeSeq.length-1].side;
    if(a===b||b===c) return false;
    return (a==='left'&&b==='right'&&c==='left')||(a==='right'&&b==='left'&&c==='right');
  }

  function fireShakeAction(p){
    st.lastShakeAt=performance.now();
    resetShakeArmed();
    st.shakeSeq=[];
    st.shakeHyst='center';
    resetBlinkGesture();
    noteEvent('shake');
    if(normalizeAction(p.shakeHead)==='none'){
      pulseGesture('shake');
      setSkipReason(t('cameraTriggerRecognizedUnbound','已识别 · 未绑定动作'),'shake');
      toast(t('cameraPresenceShakeDetected','已识别摇头'));
      return;
    }
    fireGesture('shake',p.shakeHead);
  }

  function maybeExpireShakeArmed(now){
    if(st.shakePhase!=='armed') return;
    if((now-st.shakeArmedAt)<=SHAKE_ARMED_WINDOW_MS) return;
    resetShakeArmed();
    st.shakeSeq=[];
    st.shakeHyst='center';
    if((now-st.lastShakeHintAt)>BLINK_HINT_COOLDOWN_MS){
      st.lastShakeHintAt=now;
      logPresence('shake armed timeout');
      toast(t('cameraPresenceShakeNeedNod','没有点头确认，已取消'));
    }
  }

  function updateShakeNodConfirm(now,pitch){
    if(pitch==null||!isFinite(pitch)){
      if(st.lastPitch==null||!isFinite(st.lastPitch)) return;
      pitch=st.lastPitch;
    }
    st.lastPitch=pitch;
    var base=isFinite(st.shakeArmedPitch)?st.shakeArmedPitch:0;
    // Landmark pitch+: look down. Nod confirm = dip then return.
    var delta=pitch-base;

    if(st.shakeNodPhase==='ready'){
      if(delta<SHAKE_NOD_EXIT){
        if(!st.shakeNodSettleSince) st.shakeNodSettleSince=now;
        if((now-st.shakeNodSettleSince)>=SHAKE_NOD_SETTLE_MS){
          st.shakeNodPhase='open';
          st.shakeNodSettleSince=0;
        }
      }else{
        st.shakeNodSettleSince=0;
      }
      return;
    }

    if(st.shakeNodPhase==='open'){
      if(delta>=SHAKE_NOD_ENTER){
        st.shakeNodPhase='down';
        st.shakeNodDownSince=now;
      }
      return;
    }

    if(st.shakeNodPhase!=='down') return;
    if(delta>=SHAKE_NOD_EXIT){
      if((now-st.shakeNodDownSince)>SHAKE_NOD_MAX_MS){
        st.shakeNodPhase='open';
        st.shakeNodDownSince=0;
        logPresence('shake nod too long');
      }
      return;
    }
    var dur=now-st.shakeNodDownSince;
    st.shakeNodPhase='open';
    st.shakeNodDownSince=0;
    if(dur<SHAKE_NOD_MIN_MS||dur>SHAKE_NOD_MAX_MS){
      logPresence('shake nod dur='+Math.round(dur));
      return;
    }
    logPresence('shake nod confirm dur='+Math.round(dur));
    fireShakeAction(prefs());
  }

  function updateShake(now,yaw,pitch){
    var p=prefs();
    if(!triggerEnabled('shake',p)){
      st.shakeSeq=[];
      st.shakeHyst='center';
      resetShakeArmed();
      return;
    }
    if(st.presence!=='present') return;

    if(pitch!=null&&isFinite(pitch)) st.lastPitch=pitch;

    if(st.shakePhase==='armed'){
      if(!p.shakeConfirmCue){
        resetShakeArmed();
        return;
      }
      maybeExpireShakeArmed(now);
      if(st.shakePhase!=='armed') return;
      updateShakeNodConfirm(now,pitch);
      return;
    }

    if(yaw==null||!isFinite(yaw)){
      // Keep last yaw briefly so face flicker during shake does not wipe progress.
      if(st.lastYaw==null||!isFinite(st.lastYaw)) return;
      yaw=st.lastYaw;
    }
    st.lastYaw=yaw;

    var next=shakeHystSide(yaw,p.shakeHow);
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
            logPresence('shake seq='+st.shakeSeq.map(function(x){ return x.side[0]; }).join('')+' yaw='+yaw.toFixed(2)+' how='+normalizeShakeHow(p.shakeHow));
          }
        }
      }
    }

    if(!matchShakePattern()) return;
    if((now-st.lastShakeAt)<SHAKE_COOLDOWN_MS){
      st.shakeSeq=[];
      return;
    }

    st.shakeSeq=[];
    st.shakeHyst='center';
    resetBlinkGesture();

    if(!p.shakeConfirmCue){
      fireShakeAction(p);
      return;
    }

    st.shakePhase='armed';
    st.shakeArmedAt=now;
    st.shakeArmedPitch=(st.lastPitch!=null&&isFinite(st.lastPitch))?st.lastPitch:0;
    st.shakeNodPhase='ready';
    st.shakeNodDownSince=0;
    st.shakeNodSettleSince=0;
    playArmedCue();
    if((now-st.lastShakeHintAt)>BLINK_HINT_COOLDOWN_MS){
      st.lastShakeHintAt=now;
      toast(t('cameraPresenceShakeArmedSoft','听到提示音后马上点头确认'));
    }
    logPresence('shake armed wait nod');
    renderHeroUi();
    syncDetectInterval();
  }

  function fireBlinkAction(p){
    st.lastBlinkAt=performance.now();
    resetBlinkGesture();
    st.blinkOpenSince=st.lastBlinkAt;
    noteEvent('blink');
    try{
      if(global.OneToneCameraProGlance&&global.OneToneCameraProGlance.noteBlink){
        global.OneToneCameraProGlance.noteBlink();
      }
    }catch(_){}
    if(normalizeAction(p.deliberateBlink)==='none'){
      pulseGesture('blink');
      setSkipReason(t('cameraTriggerRecognizedUnbound','已识别 · 未绑定动作'),'blink');
      toast(t('cameraPresenceBlinkDetected','已识别：故意眨眼确认'));
      return;
    }
    fireGesture('blink',p.deliberateBlink);
  }

  function updateBlink(now,blinkScore,yaw){
    var p=prefs();
    if(!triggerEnabled('blink',p)){
      resetBlinkGesture();
      st.blinkOpenSince=0;
      if(st.blinkBaselineStatus==='sampling') st.blinkBaselineStatus='';
      return;
    }
    if(st.presence!=='present') return;

    ensureBlinkBaselineSampling();
    var th=blinkThresholds();
    maybeSampleBlinkBaseline(now,blinkScore,th);
    if(st.blinkBaselineStatus==='sampling'){
      resetBlinkGesture();
      return;
    }

    if(blinkScore==null||!isFinite(blinkScore)){
      if(st.blinkPhase==='armed') maybeExpireBlinkArmed(now);
      else if(st.blinkClosed) maybeExpireBlinkHold(now);
      return;
    }

    if(blinkHeadUnstable(now,yaw)&&(st.blinkPhase==='holding'||st.blinkPhase==='armed'||st.blinkClosed||st.blinkCloseCandidateSince)){
      resetBlinkGesture();
      st.blinkOpenSince=now;
      if(yaw!=null&&isFinite(yaw)) st.lastBlinkYaw=yaw;
      return;
    }
    // Do not latch lastBlinkYaw every frame during hold — that hid shake drift.
    if(yaw!=null&&isFinite(yaw)&&(st.blinkPhase==='idle'||!st.blinkClosed)){
      st.lastBlinkYaw=yaw;
    }

    if(st.blinkPhase==='armed'){
      if(!p.blinkConfirmCue){
        resetBlinkGesture();
        st.blinkOpenSince=now;
        return;
      }
      maybeExpireBlinkArmed(now);
      if(st.blinkPhase!=='armed') return;

      // Confirm blink peaks lower than a deliberate hold — use a softer close bar.
      var confirmOn=Math.max(th.off+0.12,th.on*0.82);

      if(!st.blinkClosed){
        if(blinkScore<=th.off){
          if(!st.blinkOpenSince) st.blinkOpenSince=now;
          st.blinkCloseCandidateSince=0;
          if(!st.blinkArmedReady&&(now-st.blinkOpenSince)>=BLINK_ARMED_OPEN_NEED_MS){
            st.blinkArmedReady=true;
            renderHeroUi();
          }
          return;
        }
        // Still settling after first hold — wait for a real open before confirm.
        if(!st.blinkArmedReady){
          st.blinkCloseCandidateSince=0;
          st.blinkOpenSince=0;
          return;
        }
        if(blinkScore<confirmOn){
          st.blinkCloseCandidateSince=0;
          return;
        }
        if(!st.blinkCloseCandidateSince) st.blinkCloseCandidateSince=now;
        if((now-st.blinkCloseCandidateSince)<BLINK_CONFIRM_CLOSE_MS) return;
        st.blinkClosed=true;
        st.blinkConfirmCloseSince=st.blinkCloseCandidateSince;
        st.blinkCloseCandidateSince=0;
        st.blinkOpenSince=0;
        return;
      }

      if(blinkScore>th.off){
        st.blinkOpenCandidateSince=0;
        if((now-st.blinkConfirmCloseSince)>BLINK_CONFIRM_MAX_MS+120){
          // Confirm held too long — stay armed, allow another try.
          clearBlinkClosed();
          st.blinkArmedReady=false;
          st.blinkOpenSince=0;
          logPresence('blink confirm too long');
        }
        return;
      }
      if(!st.blinkOpenCandidateSince) st.blinkOpenCandidateSince=now;
      if((now-st.blinkOpenCandidateSince)<50) return;
      var cdur=now-st.blinkConfirmCloseSince;
      clearBlinkClosed();
      st.blinkOpenSince=now;
      if(cdur<BLINK_CONFIRM_MIN_MS||cdur>BLINK_CONFIRM_MAX_MS){
        // Not a valid short confirm — stay armed for another try if time remains.
        st.blinkArmedReady=false;
        logPresence('blink confirm dur='+Math.round(cdur));
        return;
      }
      if((now-st.lastBlinkAt)<blinkGestureCooldownMs()){
        logPresence('blink cooldown');
        resetBlinkGesture();
        st.blinkOpenSince=now;
        return;
      }
      fireBlinkAction(p);
      return;
    }

    if(st.blinkPhase==='holding'){
      maybeExpireBlinkHold(now);
      if(st.blinkPhase!=='holding') return;

      if(blinkScore>th.off){
        st.blinkOpenCandidateSince=0;
        return;
      }
      if(!st.blinkOpenCandidateSince) st.blinkOpenCandidateSince=now;
      if((now-st.blinkOpenCandidateSince)<80) return;

      var holdDur=now-st.blinkCloseSince;
      clearBlinkClosed();
      st.blinkOpenSince=now;
      var holdMin=blinkHoldMinMs(p.blinkCloseSec);
      var holdMax=blinkHoldMaxMs(p.blinkCloseSec);

      if(holdDur<holdMin){
        // Natural blink — silent discard.
        resetBlinkGesture();
        st.blinkOpenSince=now;
        return;
      }
      if(holdDur>holdMax){
        resetBlinkGesture();
        st.blinkOpenSince=now;
        return;
      }

      // Option off: fire on successful hold alone (no second blink).
      if(!p.blinkConfirmCue){
        if((now-st.lastBlinkAt)<blinkGestureCooldownMs()){
          logPresence('blink cooldown');
          resetBlinkGesture();
          st.blinkOpenSince=now;
          return;
        }
        logPresence('blink fire hold='+Math.round(holdDur)+' noCue');
        fireBlinkAction(p);
        return;
      }

      st.blinkPhase='armed';
      st.blinkArmedAt=now;
      st.blinkArmedReady=false;
      // Soft cue only — do not pulse as "已识别故意眨眼" until confirm fires.
      renderHeroUi();
      playArmedCue();
      if((now-st.lastBlinkHintAt)>BLINK_HINT_COOLDOWN_MS){
        st.lastBlinkHintAt=now;
        toast(t('cameraPresenceBlinkArmedSoft','听到提示音后马上眨眼确认'));
      }
      logPresence('blink armed hold='+Math.round(holdDur));
      syncDetectInterval();
      return;
    }

    // Do not block blink on resting side-face (shakeHyst left/right).
    // Active L↔R shake already aborts via blinkHeadUnstable.
    if(blinkScore<=th.off){
      if(!st.blinkOpenSince) st.blinkOpenSince=now;
      st.blinkCloseCandidateSince=0;
      return;
    }
    if(blinkScore<th.on){
      st.blinkCloseCandidateSince=0;
      return;
    }
    var settled=st.blinkOpenSince&&(now-st.blinkOpenSince)>=BLINK_OPEN_SETTLE_MS;
    var firstFrames=!st.blinkOpenSince;
    if(!(settled||firstFrames)){
      st.blinkCloseCandidateSince=0;
      return;
    }
    if(!st.blinkCloseCandidateSince) st.blinkCloseCandidateSince=now;
    if((now-st.blinkCloseCandidateSince)<BLINK_CLOSE_CONFIRM_MS) return;
    st.blinkPhase='holding';
    st.blinkClosed=true;
    st.blinkCloseSince=st.blinkCloseCandidateSince;
    st.blinkCloseCandidateSince=0;
    st.blinkOpenSince=0;
    st.blinkHoldStartYaw=(yaw!=null&&isFinite(yaw))?yaw:st.lastBlinkYaw;
    renderHeroUi();
  }

  function maybeExpireBlinkArmed(now){
    if(st.blinkPhase!=='armed') return;
    if((now-st.blinkArmedAt)<=BLINK_ARMED_WINDOW_MS) return;
    resetBlinkGesture();
    st.blinkOpenSince=now;
    if((now-st.lastBlinkHintAt)>BLINK_HINT_COOLDOWN_MS){
      st.lastBlinkHintAt=now;
      logPresence('blink armed timeout');
      toast(t('cameraPresenceBlinkNeedSecond','没有眨眼确认，已取消'));
    }
  }

  function maybeExpireBlinkHold(now){
    if(st.blinkPhase!=='holding'||!st.blinkClosed) return;
    var p=prefs();
    var holdMax=blinkHoldMaxMs(p.blinkCloseSec);
    var held=now-st.blinkCloseSince;
    if(held<=holdMax) return;
    resetBlinkGesture();
    st.blinkOpenSince=now;
    // Soft hint — only when clearly stuck closed (not borderline).
    if(held>=holdMax+400&&(now-st.lastBlinkHintAt)>BLINK_HINT_COOLDOWN_MS){
      st.lastBlinkHintAt=now;
      logPresence('blink hold too long held='+Math.round(held));
      var how=blinkCloseSecLabel(p.blinkCloseSec);
      toast(p.blinkConfirmCue
        ? t('cameraPresenceBlinkTooLong','闭太久了，请闭眼约 {how} 再睁开，听到提示音后马上眨眼确认').replace('{how}',how)
        : t('cameraPresenceBlinkTooLongNoCue','闭太久了，请闭眼约 {how} 再睁开').replace('{how}',how));
    }else{
      logPresence('blink hold expire held='+Math.round(held));
    }
  }

  function onFrame(point){
    if(!isEnabled()) return;
    // Drawer remount + in-flight presence frame used to wedge WebView2 (UI_HB_STALL_5S,
    // empty tag) right after voiceWake open — pauseInfer alone left this path live.
    if(st.drawerUiPaused){
      // #region agent log
      try{
        if(global.__dbgB5&&(!global.__dbgB5PresenceSkipAt||Date.now()-global.__dbgB5PresenceSkipAt>2000)){
          global.__dbgB5PresenceSkipAt=Date.now();
          global.__dbgB5('F','camera-presence-actions.js:onFrame','presence onFrame skipped drawer paused',{});
        }
      }catch(_){}
      // #endregion
      return;
    }
    try{
      if(global.OneToneUiHeartbeat&&global.OneToneUiHeartbeat.setTag){
        global.OneToneUiHeartbeat.setTag('presenceFrame');
      }else{
        global.__otActivityTag='presenceFrame';
      }
    }catch(_){}
    var now=performance.now();
    var face=!!(point&&(point.faceDetected===true||(point.state&&point.state!=='lost'&&point.state!=='idle'&&point.confidence>0.12)));
    if(point&&point.faceDetected===false) face=false;
    if(point&&point.state==='lost') face=false;
    // Soften face-lost during deliberate blink / shake-armed — eyelids down / nod often drops tracking.
    if(!face&&st.presence==='present'&&(st.blinkClosed||st.blinkPhase==='holding'||st.blinkPhase==='armed'||st.shakePhase==='armed')){
      face=true;
    }

    st.faceDetected=face;
    st.headDirection=headDirFromYaw(point&&point.yaw);
    var yaw=point&&point.yaw;
    if(yaw==null||!isFinite(yaw)) yaw=null;
    var pitch=point&&point.pitch;
    if(pitch==null||!isFinite(pitch)) pitch=null;

    try{
      if(global.OneToneCameraProGlance&&global.OneToneCameraProGlance.onVisionFrame){
        global.OneToneCameraProGlance.onVisionFrame(point);
      }
    }catch(_){}

    if(face){
      if(!st.faceTrueSince) st.faceTrueSince=now;
      st.faceFalseSince=0;
      st.presentDurationMs=now-st.faceTrueSince;
      st.absentDurationMs=0;
      if(st.presentDurationMs>=presentThresholdMs()){
        transitionPresence('present',now);
      }
    }else{
      if(!st.faceFalseSince) st.faceFalseSince=now;
      st.faceTrueSince=0;
      st.absentDurationMs=now-st.faceFalseSince;
      st.presentDurationMs=0;
      if(st.absentDurationMs>=awayThresholdMs()){
        transitionPresence('away',now);
      }
    }

    if(st.presence==='present'&&!isCalibrating()){
      // Keep shake tracking even if face flickers for a frame (use last yaw/pitch).
      updateShake(now,yaw,pitch);
      updateBlink(now,point&&point.blink,yaw);
      updateHandGestures(now);
    }

    renderHeroUi();
    try{
      if(global.OneToneUiHeartbeat&&global.OneToneUiHeartbeat.clearTag){
        global.OneToneUiHeartbeat.clearTag('presenceFrame');
      }else if(global.__otActivityTag==='presenceFrame'){
        global.__otActivityTag='';
      }
    }catch(_){}
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
    st.lastHandKind='none';
    st.lastHandFireAt=0;
    st.handHoldKind='none';
    clearPendingOpenPalm();
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

  function handGesturePulseLabel(kind){
    if(kind==='openPalm') return t('cameraPresenceGestureOpenPalm','五指');
    if(kind==='ok'||kind==='okHand') return t('cameraPresenceGestureOk','OK');
    if(kind==='fist') return t('cameraPresenceGestureFist','握拳');
    if(kind==='wave') return t('cameraPresenceGestureWave','挥手');
    return '';
  }

  function gestureLabel(){
    var pulsing=!!(st.pulseUntil&&performance.now()<st.pulseUntil);
    if(pulsing&&st.lastGesture==='shake'){
      return t('cameraPresenceGestureShake','摇头');
    }
    if(pulsing&&st.lastGesture==='blink'){
      return t('cameraPresenceGestureBlink','故意眨眼');
    }
    if(pulsing){
      var handPulse=handGesturePulseLabel(st.lastGesture);
      if(handPulse) return handPulse;
    }
    if(st.shakePhase==='armed'){
      return t('cameraPresenceShakeArmedHint','听到声响后点头确认');
    }
    if(st.blinkBaselineStatus==='sampling'){
      return t('cameraPresenceBlinkBaselineSampling','正在采开眼基线…');
    }
    if(st.blinkPhase==='armed'){
      return st.blinkArmedReady
        ?t('cameraPresenceBlinkArmedHint','听到声响后眨眼确认')
        :t('cameraPresenceBlinkOpenThenConfirm','先睁开，再短眨确认');
    }
    if(st.blinkPhase==='holding'){
      return t('cameraPresenceBlinkHoldingHint','保持闭眼…');
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
    if(st.lastGesture==='blink') return t('cameraPresenceGestureBlink','故意眨眼');
    var handLast=handGesturePulseLabel(st.lastGesture);
    if(handLast) return handLast;
    return t('cameraPresenceGestureNone','无');
  }

  var lastHeroSig='';
  function renderHeroUi(){
    var pillText=presenceLabel();
    var headText=headLabel();
    var gestText=gestureLabel();
    var faceText='';
    if(isEnabled()){
      if(st.presence==='present') faceText=t('cameraPresenceStatePresent','在席');
      else if(st.presence==='away') faceText=t('cameraPresenceStateAway','离席');
      else if(st.faceDetected) faceText=t('cameraGazeStateTracking','估计中');
      else faceText=t('cameraGlanceFaceUndetected','未检测');
    }
    var orbSig=[
      st.presence==='present'&&!st.privacyOpen?'1':'0',
      st.presence==='away'&&!st.privacyOpen?'1':'0',
      st.privacyOpen?'1':'0',
      st.presence==='unknown'&&!st.privacyOpen?'1':'0',
      isEnabled()?'1':'0'
    ].join('');
    var sig=[pillText,headText,gestText,faceText,orbSig,isEnabled()?'1':'0'].join('\0');
    if(sig===lastHeroSig) return;
    lastHeroSig=sig;

    var pill=$('cameraPresenceStatusPill');
    if(pill) pill.textContent=pillText;
    var head=$('cameraPresenceHeadText');
    if(head) head.textContent=headText;
    var gest=$('cameraPresenceGestureText');
    if(gest) gest.textContent=gestText;

    var faceEl=$('cameraGlanceFace');
    if(faceEl&&isEnabled()) faceEl.textContent=faceText;

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

  function buildActionOpts(){
    var opts=ACTION_OPTS.slice();
    var A=global.OneToneAgentActions;
    if(A&&A.cameraRecommendedActionIds){
      var ids=A.cameraRecommendedActionIds();
      for(var i=0;i<ids.length;i++){
        var def=A.actionById(ids[i]);
        if(!def) continue;
        var token=A.agentActionToken(ids[i]);
        var label=A.labelForSlot?A.labelForSlot({labelZh:def.labelZh,labelEn:def.labelEn}):def.labelZh;
        opts.push([token,'',label]);
      }
    }
    return opts;
  }

  var BIND_KEYS=['onAway','onReturn','shakeHead','deliberateBlink','openPalm','okHand','fist','wave'];

  function actionLabel(value){
    var cur=normalizeAction(value);
    if(cur==='pressCtrlI') return voiceActivateActionLabel();
    var allOpts=buildActionOpts();
    for(var i=0;i<allOpts.length;i++){
      if(allOpts[i][0]===cur){
        if(allOpts[i][1]) return t(allOpts[i][1],allOpts[i][2]);
        return allOpts[i][2]||cur;
      }
    }
    return t('cameraPresenceActionNone','无动作');
  }

  function ensureActionSelect(key,value){
    var row=document.querySelector('#cameraPresenceConfig [data-camera-bind-key="'+key+'"]')
      ||document.querySelector('#cameraRulesPro [data-camera-bind-key="'+key+'"]')
      ||document.querySelector('[data-camera-bind-key="'+key+'"]');
    if(!row) return;
    var sel=row.querySelector('select.camera-action-select');
    if(!sel) return;
    var cur=normalizeAction(value);
    var allowed=allowedActionsForBindKey(key);
    if(allowed.indexOf(cur)<0) cur='none';
    var readyKey=key+'|'+allowed.join(',');
    if(sel.getAttribute('data-select-ready')!==readyKey){
      sel.setAttribute('data-select-ready',readyKey);
      sel.setAttribute('data-camera-action-for',key);
      sel.innerHTML='';
      var allOpts=buildActionOpts();
      for(var i=0;i<allOpts.length;i++){
        var opt=allOpts[i];
        if(allowed.indexOf(opt[0])<0) continue;
        var option=document.createElement('option');
        option.value=opt[0];
        var label=opt[0]==='pressCtrlI'?voiceActivateActionLabel():(opt[1]?t(opt[1],opt[2]):opt[2]);
        if(opt[0]==='none') label=t('cameraPresenceActionNoneAlt','不执行动作');
        option.textContent=label;
        var tileHint=actionTileHint(key,opt[0]);
        var blockHint=actionBlockedReason(key,opt[0]);
        var titleParts=[];
        if(opt[0]==='pressCtrlI'){
          titleParts.push(t('cameraPresenceActionCtrlIHint','发送当前习惯/语音设置中的输入法激活键'));
        }
        if(tileHint) titleParts.push(tileHint);
        if(blockHint&&opt[0]!=='none'&&opt[0]!=='pressCtrlI') titleParts.push(blockHint);
        if(titleParts.length) option.title=titleParts.join(' · ');
        sel.appendChild(option);
      }
    }else{
      var opts=sel.options;
      for(var j=0;j<opts.length;j++){
        var act=opts[j].value;
        for(var k=0;k<ACTION_OPTS.length;k++){
          if(ACTION_OPTS[k][0]===act){
            var label2=act==='pressCtrlI'?voiceActivateActionLabel():t(ACTION_OPTS[k][1],ACTION_OPTS[k][2]);
            if(act==='none') label2=t('cameraPresenceActionNoneAlt','不执行动作');
            opts[j].textContent=label2;
            break;
          }
        }
      }
    }
    if(String(sel.value)!==String(cur)) sel.value=cur;
  }

  /** Keep tile helper for hidden legacy bind list; primary UI uses select. */
  function ensureActionTiles(host,key,value){
    if(!host) return;
    if(host.tagName&&String(host.tagName).toLowerCase()==='select'){
      ensureActionSelect(key,value);
      return;
    }
    if(host.classList&&host.classList.contains('camera-action-select')){
      ensureActionSelect(key,value);
      return;
    }
    var cur=normalizeAction(value);
    var allowed=allowedActionsForBindKey(key);
    if(allowed.indexOf(cur)<0) cur='none';
    var readyKey=key+'|'+allowed.join(',');
    if(host.getAttribute('data-tiles-ready')!==readyKey){
      host.setAttribute('data-tiles-ready',readyKey);
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
    }
    var tiles=host.querySelectorAll('.camera-action-tile');
    for(var n=0;n<tiles.length;n++){
      var on=tiles[n].getAttribute('data-action')===cur;
      tiles[n].classList.toggle('is-selected',on);
      tiles[n].setAttribute('aria-checked',on?'true':'false');
    }
  }

  function ensureDurationSelect(key,ms,opts){
    var row=document.querySelector('#cameraPresenceConfig [data-camera-duration-key="'+key+'"]');
    if(!row) return;
    var sel=row.querySelector('select[data-presence-duration]');
    if(!sel) return;
    var options=opts||[];
    var cur=clampPresenceMs(ms,key==='presentMs'?'present':'away');
    var readyKey=key+'|'+options.join(',');
    if(sel.getAttribute('data-select-ready')!==readyKey){
      sel.setAttribute('data-select-ready',readyKey);
      sel.setAttribute('data-presence-duration',key);
      sel.innerHTML='';
      for(var i=0;i<options.length;i++){
        var option=document.createElement('option');
        option.value=String(options[i]);
        option.textContent=formatPresenceDurationLabel(options[i]);
        sel.appendChild(option);
      }
    }
    if(String(sel.value)!==String(cur)) sel.value=String(cur);
  }

  function syncShakeHowUi(p){
    var sel=$('cameraShakeHowSelect');
    if(!sel) return;
    if(!sel.options||!sel.options.length){
      sel.replaceChildren();
      SHAKE_HOW_OPTS.forEach(function(how){
        var opt=document.createElement('option');
        opt.value=how;
        opt.textContent=shakeHowLabel(how);
        sel.appendChild(opt);
      });
    }
    var cur=normalizeShakeHow(p&&p.shakeHow);
    if(String(sel.value)!==cur) sel.value=cur;
  }

  function shakeHowLabel(how){
    how=normalizeShakeHow(how);
    if(how==='easy') return t('cameraShakeHowEasy','轻轻摇');
    if(how==='strong') return t('cameraShakeHowStrong','用力摇');
    return t('cameraShakeHowNormal','正常摇');
  }

  function syncBlinkCloseSecUi(p){
    var sel=$('cameraBlinkCloseSecSelect')||$('cameraBlinkCloseHowSelect');
    if(!sel) return;
    var needRebuild=!sel.options||!sel.options.length;
    if(!needRebuild){
      var vals=[];
      for(var i=0;i<sel.options.length;i++) vals.push(sel.options[i].value);
      needRebuild=BLINK_CLOSE_SEC_OPTS.some(function(sec,idx){ return String(vals[idx])!==String(sec); });
    }
    if(needRebuild){
      sel.replaceChildren();
      BLINK_CLOSE_SEC_OPTS.forEach(function(sec){
        var opt=document.createElement('option');
        opt.value=String(sec);
        opt.textContent=blinkCloseSecLabel(sec);
        sel.appendChild(opt);
      });
    }
    var cur=String(normalizeBlinkCloseSec(p&&p.blinkCloseSec));
    if(String(sel.value)!==cur) sel.value=cur;
  }

  function syncBlinkConfirmCueUi(p){
    var sw=$('cameraBlinkConfirmCueToggle');
    if(!sw) return;
    setSwitchState(sw,p&&p.blinkConfirmCue!==false);
  }

  function syncShakeConfirmCueUi(p){
    var sw=$('cameraShakeConfirmCueToggle');
    if(!sw) return;
    setSwitchState(sw,p&&p.shakeConfirmCue!==false);
  }

  function syncPresenceDurationUi(p){
    ensureDurationSelect('awayMs',p.awayMs,AWAY_DURATION_OPTS);
    ensureDurationSelect('presentMs',p.presentMs,PRESENT_DURATION_OPTS);
    syncShakeHowUi(p);
    syncShakeConfirmCueUi(p);
    syncBlinkCloseSecUi(p);
    syncBlinkConfirmCueUi(p);
    var awayDesc=document.querySelector('#cameraBindRowAway .camera-card-desc');
    if(awayDesc){
      awayDesc.textContent=t('cameraCardAwayDescDynamic','人脸消失约 {duration} 视为离席。')
        .replace('{duration}',formatPresenceDurationLabel(p.awayMs));
      awayDesc.title=awayDesc.textContent;
    }
    var returnDesc=document.querySelector('#cameraBindRowReturn .camera-card-desc');
    if(returnDesc){
      returnDesc.textContent=t('cameraCardReturnDescDynamic','与离席共用识别开关；人脸回到画面约 {duration} 视为回席。')
        .replace('{duration}',formatPresenceDurationLabel(p.presentMs));
      returnDesc.title=returnDesc.textContent;
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
    var awayBound=p.onAway!=='none';
    var returnBound=p.onReturn!=='none';
    var shakeBound=p.shakeHead!=='none';
    var blinkBound=p.deliberateBlink!=='none';

    function summaryFor(trigOn,bound,boundText){
      if(trigOn&&!bound) return t('cameraTriggerRecognizedUnbound','识别中 · 未绑定动作');
      if(!trigOn&&bound) return t('cameraTriggerConfiguredOff','已配置动作 · 识别关闭')+' · '+boundText;
      if(trigOn&&bound) return boundText;
      return t('cameraTriggerSummaryEmpty','尚未绑定结果');
    }

    function syncCard(kind,trigOn,summaryText){
      var card=document.querySelector('#cameraPresenceConfig [data-camera-trigger="'+kind+'"]')
        ||document.querySelector('#cameraRulesPro [data-camera-trigger="'+kind+'"]')
        ||document.querySelector('[data-camera-trigger="'+kind+'"]');
      if(!card) return;
      var sw=card.querySelector('[data-camera-trigger-toggle]');
      var sum=card.querySelector('.camera-bind-summary');
      if(sw) setSwitchState(sw,trigOn);
      if(sum){
        sum.textContent=summaryText;
        sum.classList.toggle('is-bound',!!trigOn&&!!summaryText);
        // Select already shows the bound action — keep summary for a11y/legacy, hidden in CSS.
        sum.hidden=true;
      }
      card.classList.toggle('is-trigger-on',!!trigOn);
    }

    syncCard(
      'away',
      awayTrig,
      summaryFor(
        awayTrig,
        awayBound,
        t('cameraTriggerSummaryBound','已绑定：{action}').replace('{action}',actionLabel(p.onAway))
      )
    );
    syncCard(
      'return',
      awayTrig,
      summaryFor(
        awayTrig,
        returnBound,
        t('cameraTriggerSummaryBound','已绑定：{action}').replace('{action}',actionLabel(p.onReturn))
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

    function syncHandCard(kind,bindKey){
      var trigOn=!!tr[kind];
      var bound=normalizeAction(p[bindKey])!=='none';
      syncCard(
        kind,
        trigOn,
        summaryFor(
          trigOn,
          bound,
          t('cameraTriggerSummaryBound','已绑定：{action}').replace('{action}',actionLabel(p[bindKey]))
        )
      );
    }
    syncHandCard('openPalm','openPalm');
    syncHandCard('okHand','okHand');
    syncHandCard('fist','fist');
    syncHandCard('wave','wave');
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

  function readStoredRulesSegment(){
    try{
      var v=sessionStorage.getItem('onetone.cameraRulesSegment');
      if(v==='pro'||v==='basic') return v;
    }catch(_){}
    return st.rulesSegment==='pro'?'pro':'basic';
  }

  function writeStoredRulesSegment(seg){
    st.rulesSegment=seg==='pro'?'pro':'basic';
    try{ sessionStorage.setItem('onetone.cameraRulesSegment',st.rulesSegment); }catch(_){}
  }

  function syncProHandRulesHint(){
    var hint=$('cameraRulesProHint');
    if(!hint) return;
    var api=global.OneToneCameraHandGesture;
    var rs=api&&api.getRuntimeStatus?api.getRuntimeStatus():null;
    var live=false;
    try{
      var pv=global.OneToneCameraPreview;
      live=!!(pv&&pv.isRunning&&pv.isRunning());
    }catch(_){}
    if(rs&&rs.modelFailed){
      hint.textContent=t('cameraRulesProHintNeedModel','需要手势模型接入后生效 · 可先配置动作');
      return;
    }
    if(live&&rs&&rs.running&&rs.ready){
      hint.textContent=t('cameraRulesProHintRunning','识别运行中 · 绑定动作后即可触发');
      return;
    }
    if(rs&&rs.ready){
      hint.textContent=t('cameraRulesProHintReady','已可配置 · 开启预览后识别');
      return;
    }
    hint.textContent=t('cameraRulesProHint','已可配置 · 开启预览后识别');
  }

  function showRulesSegment(seg,opts){
    opts=opts&&typeof opts==='object'?opts:{};
    var next=seg==='pro'?'pro':'basic';
    writeStoredRulesSegment(next);
    var basic=$('cameraRulesBasic');
    if(basic) basic.hidden=false;
    var pro=$('cameraRulesPro');
    if(pro) pro.hidden=false;
    if(next==='pro'){
      syncProHandRulesHint();
      var wf=global.OneToneCameraWorkflow;
      try{
        if(wf&&wf.activateTab) wf.activateTab('pro');
        if(wf&&wf.activateProSubtab) wf.activateProSubtab('gesture');
        else if(wf&&wf.openProPanel) wf.openProPanel('cameraProSubGesture');
      }catch(_){}
      if(opts.scroll){
        var el=$('cameraProSubGesture')||pro||$('cameraPanelPro');
        if(el&&el.scrollIntoView){
          try{ el.scrollIntoView({block:'nearest',behavior:'smooth'}); }catch(_){
            try{ el.scrollIntoView(true); }catch(__){}
          }
        }
      }
    }
    return next;
  }

  function syncUiFromPrefs(){
    if(st.uiSyncing) return;
    st.uiSyncing=true;
    try{
      // Always paint effective prefs (global + active scenario override) so the dropdown
      // matches what shake/blink will actually fire — not a lying global-only snapshot.
      var p=prefs();
      st.enabled=!!basePresencePrefs().enabled;
      ensureActionSelect('onAway',p.onAway);
      ensureActionSelect('onReturn',p.onReturn);
      ensureActionSelect('shakeHead',p.shakeHead);
      ensureActionSelect('deliberateBlink',p.deliberateBlink);
      ensureActionSelect('openPalm',p.openPalm);
      ensureActionSelect('okHand',p.okHand);
      ensureActionSelect('fist',p.fist);
      ensureActionSelect('wave',p.wave);
      // Legacy hidden bind list (if present)
      ensureActionTiles(document.querySelector('#cameraPresenceBindList [data-camera-bind-key="onAway"]'),'onAway',p.onAway);
      ensureActionTiles(document.querySelector('#cameraPresenceBindList [data-camera-bind-key="onReturn"]'),'onReturn',p.onReturn);
      ensureActionTiles(document.querySelector('#cameraPresenceBindList [data-camera-bind-key="shakeHead"]'),'shakeHead',p.shakeHead);
      ensureActionTiles(document.querySelector('#cameraPresenceBindList [data-camera-bind-key="deliberateBlink"]'),'deliberateBlink',p.deliberateBlink);
      syncTriggerSummaries(p);
      syncPresenceDurationUi(p);
      syncBlinkBaselineUi();
      syncMasterLockUi();
      syncPresenceOverrideHint();
      // Basic rules stay on Visual recognition; Pro hand rules live under Pro · Gesture.
      var basic=$('cameraRulesBasic');
      if(basic) basic.hidden=false;
      var pro=$('cameraRulesPro');
      if(pro) pro.hidden=false;
      writeStoredRulesSegment('basic');
      syncProHandRulesHint();
      renderHeroUi();
      if(global.OneToneCameraWorkflow&&global.OneToneCameraWorkflow.syncInactiveHint){
        try{ global.OneToneCameraWorkflow.syncInactiveHint(); }catch(_){}
      }
    }finally{
      st.uiSyncing=false;
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
    if(st.recommendBusy) return Promise.resolve(false);
    st.recommendBusy=true;
    var btn=$('cameraApplyRecommendBtn');
    if(btn) btn.disabled=true;
    var rec=recommendedPresencePrefs();
    var lines=[
      t('cameraRecommendConfirmIntro','将写入以下推荐绑定：'),
      t('cameraPresenceOnAway','离席时')+' → '+actionLabel(rec.onAway),
      t('cameraPresenceOnReturn','回席时')+' → '+actionLabel(rec.onReturn),
      t('cameraCardShakeTitle','摇头')+' → '+actionLabel(rec.shakeHead),
      t('cameraCardBlinkTitle','故意眨眼确认')+' → '+actionLabel(rec.deliberateBlink),
      '',
      t('cameraRecommendConfirmTriggers','并打开离席 / 摇头 / 闭眼识别')
    ];
    var body=lines.join('\n');
    var title=t('cameraRecommendConfirmTitle','套用推荐规则');
    function finish(result){
      st.recommendBusy=false;
      if(btn) btn.disabled=false;
      return result;
    }
    function commit(){
      // Defer so confirm overlay can close/paint before DOM sync.
      return new Promise(function(resolve){
        setTimeout(function(){
          try{
            persistPresencePrefs(rec);
            toast(t('cameraRecommendApplied','已套用小白默认推荐'));
            resolve(true);
          }catch(err){
            if(global.console&&console.warn) console.warn('[camera-recommend]',err);
            resolve(false);
          }
        },0);
      });
    }
    var modal=global.OneToneMappingConfirmModal;
    var opened=null;
    try{
      if(modal&&typeof modal.open==='function') opened=modal.open(body,{title:title});
    }catch(err){
      if(global.console&&console.warn) console.warn('[camera-recommend-modal]',err);
      opened=null;
    }
    if(opened&&typeof opened.then==='function'){
      return Promise.resolve(opened).then(function(ok){
        if(!ok) return finish(false);
        return commit().then(finish);
      }).catch(function(){ return finish(false); });
    }
    var ok=false;
    try{ ok=!!global.confirm(body); }catch(_){ ok=false; }
    if(!ok) return Promise.resolve(finish(false));
    return commit().then(finish);
  }

  function toggleTrigger(kind,wantOn){
    var patch={triggers:{}};
    if(kind==='away') patch.triggers.away=!!wantOn;
    else if(kind==='shake') patch.triggers.shake=!!wantOn;
    else if(kind==='blink') patch.triggers.blink=!!wantOn;
    else if(kind==='openPalm') patch.triggers.openPalm=!!wantOn;
    else if(kind==='okHand') patch.triggers.okHand=!!wantOn;
    else if(kind==='fist') patch.triggers.fist=!!wantOn;
    else if(kind==='wave') patch.triggers.wave=!!wantOn;
    else return;
    persistPresencePrefs(patch);
    if(kind==='blink'&&wantOn&&!readBlinkBaseline()){
      startBlinkBaselineSample(false);
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

    function onRulesClick(e){
      var shakeCueSw=e.target&&e.target.closest?e.target.closest('[data-presence-shake-confirm-cue]'):null;
      if(shakeCueSw){
        e.preventDefault();
        var shakeCueOn=shakeCueSw.getAttribute('aria-checked')==='true';
        persistPresencePrefs({shakeConfirmCue:!shakeCueOn});
        return;
      }
      var cueSw=e.target&&e.target.closest?e.target.closest('[data-presence-blink-confirm-cue]'):null;
      if(cueSw){
        e.preventDefault();
        var cueOn=cueSw.getAttribute('aria-checked')==='true';
        persistPresencePrefs({blinkConfirmCue:!cueOn});
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
      var recalib=e.target&&e.target.closest?e.target.closest('#cameraBlinkRecalibrateBtn'):null;
      if(recalib){
        e.preventDefault();
        if(global.OneToneCameraWorkflow&&global.OneToneCameraWorkflow.activateTab){
          global.OneToneCameraWorkflow.activateTab('action');
        }
        var blinkHint=$('cameraBlinkBaselineHint');
        var preview=$('cameraHeroPreview')||$('cameraCalibBlock');
        if(preview&&preview.scrollIntoView){
          try{ preview.scrollIntoView({block:'nearest',behavior:'smooth'}); }catch(_){ try{ preview.scrollIntoView(true); }catch(__){} }
        }
        startBlinkBaselineSample(true);
        if(blinkHint&&blinkHint.scrollIntoView){
          try{ blinkHint.scrollIntoView({block:'nearest',behavior:'smooth'}); }catch(_){}
        }
      }
    }

    function onRulesChange(e){
      if(st.uiSyncing) return;
      var durSel=e.target&&e.target.closest?e.target.closest('select[data-presence-duration]'):null;
      if(durSel){
        var durKey=String(durSel.getAttribute('data-presence-duration')||'');
        if(durKey==='awayMs'||durKey==='presentMs'){
          var patch={};
          patch[durKey]=clampPresenceMs(durSel.value,durKey==='presentMs'?'present':'away');
          persistPresencePrefs(patch);
        }
        return;
      }
      var howSel=e.target&&e.target.closest?e.target.closest('select[data-presence-shake-how]'):null;
      if(howSel){
        persistPresencePrefs({shakeHow:normalizeShakeHow(howSel.value)});
        return;
      }
      var blinkSecSel=e.target&&e.target.closest?e.target.closest('select[data-presence-blink-close-sec],select[data-presence-blink-close-how]'):null;
      if(blinkSecSel){
        persistPresencePrefs({blinkCloseSec:normalizeBlinkCloseSec(blinkSecSel.value)});
        return;
      }
      var sel=e.target&&e.target.closest?e.target.closest('select.camera-action-select'):null;
      if(!sel) return;
      var key=String(sel.getAttribute('data-camera-action-for')||'');
      if(!key){
        var row=sel.closest('[data-camera-bind-key]');
        key=row?String(row.getAttribute('data-camera-bind-key')||''):'';
      }
      var action=normalizeAction(sel.value);
      if(!key||BIND_KEYS.indexOf(key)<0) return;
      if(!isActionAllowedForKey(key,action)){
        toast(actionBlockedReason(key,action)||t('cameraPresenceSkipInvalidCombo','此动作与当前事件不兼容'));
        ensureActionSelect(key,prefs()[key]);
        return;
      }
      var patch={};
      patch[key]=action;
      persistPresencePrefs(patch);
    }

    var config=$('cameraPresenceConfig');
    if(config){
      config.addEventListener('click',onRulesClick);
      config.addEventListener('change',onRulesChange);
    }
    var proRules=$('cameraRulesPro');
    if(proRules&&proRules!==config&&!(config&&config.contains(proRules))){
      proRules.addEventListener('click',onRulesClick);
      proRules.addEventListener('change',onRulesChange);
    }

    var segHost=$('cameraRulesSegment');
    if(segHost&&segHost.querySelector&&segHost.querySelector('[data-camera-rules-seg]')){
      segHost.addEventListener('click',function(e){
        var btn=e.target&&e.target.closest?e.target.closest('[data-camera-rules-seg]'):null;
        if(!btn) return;
        e.preventDefault();
        showRulesSegment(String(btn.getAttribute('data-camera-rules-seg')||'basic'),{scroll:false});
      });
    }
    var gotoProGestures=$('cameraGotoProGesturesBtn');
    if(gotoProGestures){
      gotoProGestures.addEventListener('click',function(e){
        e.preventDefault();
        showRulesSegment('pro',{scroll:true});
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

  function setDrawerUiPaused(paused){
    paused=!!paused;
    if(st.drawerUiPaused===paused) return;
    st.drawerUiPaused=paused;
    var lm=global.OneToneCameraGazeLandmarker;
    var hg=global.OneToneCameraHandGesture;
    var pv=global.OneToneCameraPreview;
    try{
      if(paused){
        // Cancel deferred boot camera — 8s retry under voiceWake still 假死'd (~80s, empty tag).
        try{
          if(st._bootCamTimer){ clearTimeout(st._bootCamTimer); st._bootCamTimer=null; }
        }catch(_){}
        try{
          if(global.OneToneConfigPersist&&typeof global.OneToneConfigPersist.cancelBootCameraSchedule==='function'){
            global.OneToneConfigPersist.cancelBootCameraSchedule();
          }
        }catch(_){}
        // Snapshot before pausePipeline — gate must not depend on post-pause flags.
        var wasLive=false;
        var hasStream=false;
        try{ wasLive=isCameraPreviewLive(); }catch(_){}
        try{ hasStream=!!(pv&&typeof pv.hasMediaStream==='function'&&pv.hasMediaStream()); }catch(_){}
        if(lm&&lm.pauseInfer) lm.pauseInfer();
        if(hg&&hg.pauseInfer) hg.pauseInfer();
        if(pv&&typeof pv.pausePipeline==='function') pv.pausePipeline();
        // Stop camera feature timers that keep ticking after stream teardown.
        try{
          if(global.OneToneCameraWorkflow&&typeof global.OneToneCameraWorkflow.onPanelHidden==='function'){
            global.OneToneCameraWorkflow.onPanelHidden();
          }
        }catch(_){}
        try{
          if(global.OneToneCameraProGlance&&typeof global.OneToneCameraProGlance.onPanelHidden==='function'){
            global.OneToneCameraProGlance.onPanelHidden();
          }
        }catch(_){}
        // Pause only while settings own the UI. Full ensureStopped (MediaPipe stop +
        // track.stop) stacked with softPad→voiceWake remount → empty-tag 假死; in-flight
        // createImageBitmap now honors inferPaused so pause is enough until drawer close.
        if((wasLive||hasStream)&&!st._drawerStoppedCam){
          st._drawerStoppedCam=true;
          try{
            if(global.OneToneIpc&&global.OneToneIpc.invoke){
              global.OneToneIpc.invoke('cmd_app_log',{line:'fe drawer pause camera wasLive='+(wasLive?1:0)+' stream='+(hasStream?1:0)+' (no ensureStopped)'}).catch(function(){});
            }
          }catch(_){}
        }
      }else{
        if(st._drawerStoppedCam){
          st._drawerStoppedCam=false;
          if(isEnabled()&&!st.manualStopped){
            var stillHas=false;
            try{ stillHas=!!(pv&&typeof pv.hasMediaStream==='function'&&pv.hasMediaStream()); }catch(_){}
            if(stillHas){
              // Paused only — reopen without getUserMedia (was stacking with close paint).
              if(pv&&typeof pv.resumePipeline==='function') pv.resumePipeline();
              if(lm&&lm.resumeInfer) lm.resumeInfer();
              if(hg&&hg.resumeInfer) hg.resumeInfer();
              syncDetectInterval();
            }else{
              ensureRunning({reason:'drawer_ui_resume'});
            }
          }
        }else if(isEnabled()&&!st.manualStopped&&!isCameraPreviewLive()){
          // Boot cam was cancelled while drawer owned UI — start once on close.
          ensureRunning({reason:'drawer_ui_resume_boot'});
        }else{
          if(pv&&typeof pv.resumePipeline==='function') pv.resumePipeline();
          if(lm&&lm.resumeInfer) lm.resumeInfer();
          if(hg&&hg.resumeInfer) hg.resumeInfer();
          syncDetectInterval();
        }
      }
    }catch(_){}
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
    deferCameraHeavyWork:deferCameraHeavyWork,
    setDrawerUiPaused:setDrawerUiPaused,
    setRuntimeStateListener:setRuntimeStateListener,
    clearManualStop:clearManualStop,
    requestRestart:requestRestart,
    prefs:prefs,
    normalizePrefs:normalizePrefs,
    defaultPrefs:defaultPresencePrefs,
    persist:persistPresencePrefs,
    normalizeShakeHow:normalizeShakeHow,
    shakeEnterForHow:shakeEnterForHow,
    normalizeBlinkCloseSec:normalizeBlinkCloseSec,
    blinkHoldMinMs:blinkHoldMinMs,
    blinkHoldMaxMs:blinkHoldMaxMs,
    normalizeBlinkCloseHow:normalizeBlinkCloseHow,
    blinkHoldMinForHow:blinkHoldMinForHow,
    blinkHoldMaxForHow:blinkHoldMaxForHow,
    matchShakePattern:matchShakePattern,
    _testSetShakeSeq:function(seq){ st.shakeSeq=Array.isArray(seq)?seq.slice():[]; },
    clearShadowingCameraOverride:clearShadowingCameraOverride,
    applyGlobalPresenceOverActiveOverride:applyGlobalPresenceOverActiveOverride,
    overrideDiffersFromBase:overrideDiffersFromBase,
    dispatchAction:dispatchAction,
    canExecuteCameraAction:canExecuteCameraAction,
    shouldThrottleCameraAction:shouldThrottleCameraAction,
    actionRiskLevel:actionRiskLevel,
    buildCameraSendGuardModel:buildCameraSendGuardModel,
    isSendClassAction:isSendClassAction,
    applyRecommendedPresencePrefs:applyRecommendedPresencePrefs,
    recommendedPresencePrefs:recommendedPresencePrefs,
    resolveVoiceActivateKey:resolveVoiceActivateKey,
    setPrivacyOpen:setPrivacyOpen,
    openPrivacyScreen:openPrivacyScreen,
    closePrivacyScreen:closePrivacyScreen,
    syncDetectInterval:syncDetectInterval,
    preferredDetectIntervalMs:preferredDetectIntervalMs,
    syncUiFromPrefs:syncUiFromPrefs,
    showRulesSegment:showRulesSegment,
    syncProHandRulesHint:syncProHandRulesHint,
    syncTriggerSummaries:function(){ syncTriggerSummaries(prefs()); },
    startBlinkBaselineSample:function(){ startBlinkBaselineSample(true); },
    syncBlinkBaselineUi:syncBlinkBaselineUi,
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
    DEFAULT_AWAY_MS:DEFAULT_AWAY_MS,
    DEFAULT_PRESENT_MS:DEFAULT_PRESENT_MS,
    awayThresholdMs:awayThresholdMs,
    presentThresholdMs:presentThresholdMs,
    AWAY_MS:DEFAULT_AWAY_MS,
    PRESENT_MS:DEFAULT_PRESENT_MS,
    DETECT_PRESENT_MS:DETECT_PRESENT_MS,
    DETECT_AWAY_MS:DETECT_AWAY_MS,
    DETECT_HOME_MS:DETECT_HOME_MS
  };

  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',init);
  }else{
    init();
  }
})((typeof window!=='undefined')?window:globalThis);
