(function(global){
  'use strict';

  /**
   * Smart Pointer runtime + settings.
   * Phase 3: normalize, quality policy, classify preview path — no cursor move.
   */

  var DETECT_INTERVAL_MS=80;
  var MODES=['off','preview','confirm','auto'];
  var TRIGGERS=['dwell','ctrl','ctrl_or_dwell'];
  var CAMERA_POSITIONS=['center-top','left-top','right-top','laptop-built-in','custom'];
  var LAND_PREFS=['last','center'];
  var FEEL_PRESETS={
    sensitive:{minConfidence:0.45,dwellMs:400,cooldownMs:800},
    balanced:{minConfidence:0.55,dwellMs:700,cooldownMs:1200},
    steady:{minConfidence:0.70,dwellMs:1100,cooldownMs:1800}
  };
  var FEEL_IDS=['sensitive','balanced','steady'];

  function emptyAssessment(){
    var Assess=global.OneToneCameraGazeMonitorAssessment;
    if(Assess&&Assess.emptyAssessment) return Assess.emptyAssessment();
    return {
      status:'not_run',
      quality:null,
      samples:[],
      centroids:null,
      thresholds:null,
      topologyFingerprint:null,
      reason:null
    };
  }

  function defaultSmartPointer(){
    return {
      enabled:false,
      mode:'auto',
      screenCount:3,
      layout:'horizontal',
      cameraPosition:'center-top',
      trigger:'dwell',
      dwellMs:700,
      cooldownMs:1200,
      minConfidence:0.55,
      /** 'center' = always screen center; 'last' = last pos on that screen else center */
      landPreference:'center',
      landPrefV:2,
      feel:'balanced',
      setupConfirmed:false,
      lastPositions:{},
      assessment:emptyAssessment()
    };
  }

  function clampInt(v, min, max, fallback){
    var n=Number(v);
    if(!isFinite(n)) n=fallback;
    n=Math.round(n)|0;
    if(n<min) n=min;
    if(n>max) n=max;
    return n;
  }

  function normalizeAssessment(raw){
    var d=emptyAssessment();
    if(!raw||typeof raw!=='object') return d;
    var status=String(raw.status||d.status);
    if(['not_run','ready','stale','running'].indexOf(status)<0) status='not_run';
    var quality=raw.quality==null?null:String(raw.quality);
    if(quality&&['good','ok','poor'].indexOf(quality)<0) quality=null;
    return {
      status:status,
      quality:quality,
      samples:Array.isArray(raw.samples)?raw.samples:[],
      centroids:raw.centroids&&typeof raw.centroids==='object'?raw.centroids:null,
      thresholds:raw.thresholds&&typeof raw.thresholds==='object'?raw.thresholds:null,
      topologyFingerprint:raw.topologyFingerprint!=null?String(raw.topologyFingerprint):null,
      reason:raw.reason!=null?String(raw.reason):null
    };
  }

  function normalizeLastPositions(raw){
    var out={};
    if(!raw||typeof raw!=='object') return out;
    Object.keys(raw).forEach(function(id){
      var p=raw[id];
      if(!p||typeof p!=='object') return;
      var x=Number(p.x),y=Number(p.y);
      if(!isFinite(x)||!isFinite(y)) return;
      out[String(id)]={x:x|0,y:y|0};
    });
    return out;
  }

  /**
   * Modes are always available when enabled. Assessment quality is advisory only.
   */
  function allowedMoveModes(settings){
    if(settings&&settings.enabled===false) return ['preview'];
    return ['preview','confirm','auto'];
  }

  function canUseAuto(settings){
    return allowedMoveModes(settings).indexOf('auto')>=0;
  }

  function canUseConfirm(settings){
    return allowedMoveModes(settings).indexOf('confirm')>=0;
  }

  function coerceMode(mode, settings){
    mode=String(mode||'auto');
    if(MODES.indexOf(mode)<0) mode='auto';
    if(mode==='off') return 'off';
    return mode;
  }

  function qualitySuggestsTune(settings){
    var a=settings&&settings.assessment?settings.assessment:emptyAssessment();
    return a.status==='stale'||a.quality==='poor'||a.quality==='ok'||!a.quality||a.status==='not_run';
  }

  function normalizeSmartPointer(raw){
    var d=defaultSmartPointer();
    if(!raw||typeof raw!=='object') return d;
    var assessment=normalizeAssessment(raw.assessment);
    var landPrefV=clampInt(raw.landPrefV,0,99,0);
    var landPreference=LAND_PREFS.indexOf(String(raw.landPreference||''))>=0
      ?String(raw.landPreference):d.landPreference;
    // v2: product default is screen center (was 'last' and felt wrong).
    if(landPrefV<2){
      landPreference='center';
      landPrefV=2;
    }
    var draft={
      enabled:!!raw.enabled,
      mode:String(raw.mode||d.mode),
      screenCount:clampInt(raw.screenCount,1,3,d.screenCount),
      layout:'horizontal',
      cameraPosition:CAMERA_POSITIONS.indexOf(String(raw.cameraPosition||''))>=0
        ?String(raw.cameraPosition):d.cameraPosition,
      trigger:TRIGGERS.indexOf(String(raw.trigger||''))>=0?String(raw.trigger):d.trigger,
      dwellMs:clampInt(raw.dwellMs,300,3000,d.dwellMs),
      cooldownMs:clampInt(raw.cooldownMs,400,5000,d.cooldownMs),
      minConfidence:Math.max(0.2,Math.min(0.95,Number(raw.minConfidence)))||d.minConfidence,
      landPreference:landPreference,
      landPrefV:landPrefV,
      feel:FEEL_IDS.indexOf(String(raw.feel||''))>=0?String(raw.feel):'',
      setupConfirmed:!!raw.setupConfirmed,
      lastPositions:normalizeLastPositions(raw.lastPositions),
      assessment:assessment
    };
    draft.mode=coerceMode(draft.mode, draft);
    // Align trigger with mode defaults.
    if(draft.mode==='auto') draft.trigger='dwell';
    if(draft.mode==='confirm'&&draft.trigger==='dwell') draft.trigger='ctrl';
    if(!draft.feel) draft.feel=feelFromSettings(draft);
    return draft;
  }

  function readSettings(){
    var st=global.OneToneState&&global.OneToneState.state;
    var cp=st&&st.config&&st.config.cameraPrefs;
    var raw=cp&&cp.smartPointer;
    var normalized=normalizeSmartPointer(raw);
    // Persist one-shot landPreference migration (last→center).
    if(raw&&typeof raw==='object'&&(raw.landPrefV|0)<2){
      try{
        if(st&&st.config){
          if(!st.config.cameraPrefs||typeof st.config.cameraPrefs!=='object'){
            st.config.cameraPrefs={};
          }
          st.config.cameraPrefs.smartPointer=normalized;
        }
        if(global.OneToneConfigPersist&&global.OneToneConfigPersist.saveCameraPrefsQuiet){
          global.OneToneConfigPersist.saveCameraPrefsQuiet();
        }
      }catch(_){}
    }
    return normalized;
  }

  function writeSettings(next){
    var normalized=normalizeSmartPointer(next);
    var st=global.OneToneState&&global.OneToneState.state;
    if(st&&st.config){
      if(!st.config.cameraPrefs||typeof st.config.cameraPrefs!=='object'){
        st.config.cameraPrefs={};
      }
      st.config.cameraPrefs.smartPointer=normalized;
    }
    try{
      if(global.OneToneCameraPreview&&global.OneToneCameraPreview.persistCameraPrefs){
        global.OneToneCameraPreview.persistCameraPrefs({smartPointer:normalized});
      }else if(global.OneToneConfigPersist&&global.OneToneConfigPersist.saveCameraPrefsQuiet){
        global.OneToneConfigPersist.saveCameraPrefsQuiet();
      }
    }catch(_){}
    rt.settings=normalized;
    return normalized;
  }

  var CTRL_CACHE_MS=100;

  var rt={
    settings:null,
    topology:null,
    stability:null,
    lastResult:null,
    lastMoveAt:0,
    lastFrameAt:0,
    lastAction:null,
    /** Monitor id we last successfully landed on — prevents re-jump jitter. */
    landedMonitorId:null,
    assessmentSession:null,
    /** Confirm/Ctrl + auto (quality===good) moves enabled. */
    autoMoveEnabled:true,
    moveInFlight:false,
    ctrlCache:{at:0,down:false},
    uiBound:false,
    uiTimer:0,
    cursorDebug:null,
    lastUiGazeAt:0,
    setupDraft:null,
    landBannerTimer:0,
    persistTimer:0,
    /** UI timers only while camera panel is visible — avoids nav freeze. */
    panelVisible:false
  };

  function getSettings(){
    if(!rt.settings) rt.settings=readSettings();
    return rt.settings;
  }

  function syncTopologyFingerprint(){
    var settings=getSettings();
    var Assess=global.OneToneCameraGazeMonitorAssessment;
    if(!Assess||!rt.topology||!settings.assessment) return settings;
    var next=Assess.applyFingerprint(settings.assessment, rt.topology.fingerprint);
    if(next.status!==settings.assessment.status||next.reason!==settings.assessment.reason){
      settings=Object.assign({},settings,{assessment:next});
      settings.mode=coerceMode(settings.mode, settings);
      rt.settings=settings;
    }
    return settings;
  }

  function setTopology(topology){
    rt.topology=topology||null;
    syncTopologyFingerprint();
    return rt.topology;
  }

  function refreshTopology(){
    var Topo=global.OneToneCameraGazeMonitorTopology;
    if(!Topo||!Topo.listMonitors) return Promise.reject(new Error('no_topology'));
    var settings=getSettings();
    return Topo.listMonitors({screenCount:settings.screenCount}).then(function(topo){
      setTopology(topo);
      return topo;
    });
  }

  /**
   * Decide whether a move would be allowed (pure gate).
   * Ctrl is passed in — callers must not poll Ctrl every frame.
   */
  function shouldAttemptMove(settings, result, stability, now, ctrlDown){
    settings=normalizeSmartPointer(settings);
    if(!settings.enabled||settings.mode==='off'||settings.mode==='preview') return false;
    if(!result||!result.monitorId) return false;
    if(asNum(result.confidence)<settings.minConfidence) return false;
    if(!stability||stability.monitorId!==result.monitorId) return false;
    if((stability.stableMs|0)<(settings.dwellMs|0)) return false;
    if(now!=null&&rt.lastMoveAt&&(now-rt.lastMoveAt)<settings.cooldownMs) return false;

    var mode=coerceMode(settings.mode, settings);
    if(mode==='preview') return false;
    if(mode==='auto'){
      if(!rt.autoMoveEnabled) return false;
      return true;
    }
    // confirm / Ctrl
    if(settings.trigger==='ctrl'||settings.trigger==='ctrl_or_dwell'||mode==='confirm'){
      return !!ctrlDown;
    }
    return true;
  }

  function asNum(v, fallback){
    var n=Number(v);
    return isFinite(n)?n:(fallback!=null?fallback:0);
  }

  function invokeIpc(cmd, args){
    var inv=global.OneToneIpc&&global.OneToneIpc.invoke;
    if(!inv) return Promise.reject(new Error('no_ipc'));
    return inv(cmd, args||{});
  }

  function getCtrlDownCached(now){
    now=now!=null?now:Date.now();
    if(rt.ctrlCache.at&&(now-rt.ctrlCache.at)<CTRL_CACHE_MS){
      return Promise.resolve(!!rt.ctrlCache.down);
    }
    return invokeIpc('cmd_gaze_is_ctrl_down',{}).then(function(res){
      var down=!!(res&&res.down);
      rt.ctrlCache={at:Date.now(),down:down};
      return down;
    }).catch(function(){
      rt.ctrlCache={at:Date.now(),down:false};
      return false;
    });
  }

  function rememberLastPosition(monitorId, x, y){
    if(!monitorId||!isFinite(Number(x))||!isFinite(Number(y))) return;
    var settings=getSettings();
    var lp=Object.assign({},settings.lastPositions||{});
    lp[String(monitorId)]={x:Number(x)|0,y:Number(y)|0};
    rt.settings=Object.assign({},settings,{lastPositions:lp});
  }

  function persistLastPositions(){
    var settings=getSettings();
    if(rt.persistTimer) clearTimeout(rt.persistTimer);
    rt.persistTimer=setTimeout(function(){
      rt.persistTimer=0;
      try{
        if(global.OneToneCameraPreview&&global.OneToneCameraPreview.persistCameraPrefs){
          global.OneToneCameraPreview.persistCameraPrefs({smartPointer:getSettings()});
        }else if(global.OneToneConfigPersist&&global.OneToneConfigPersist.saveCameraPrefsQuiet){
          var st=global.OneToneState&&global.OneToneState.state;
          if(st&&st.config&&st.config.cameraPrefs){
            st.config.cameraPrefs.smartPointer=getSettings();
          }
          global.OneToneConfigPersist.saveCameraPrefsQuiet();
        }
      }catch(_){}
    },1200);
  }

  /**
   * Cursor move after dwell+cooldown. Ctrl queried only when confirm-ready.
   * Sticks to landed monitor until gaze stably targets a different one.
   */
  function maybeMoveCursor(settings, result, now){
    settings=normalizeSmartPointer(settings);
    var mode=coerceMode(settings.mode, settings);
    if(mode==='preview'||mode==='off') return;
    if(mode==='auto'&&!rt.autoMoveEnabled) return;
    if(rt.moveInFlight) return;
    if(!result||!result.monitorId) return;
    if(!rt.stability||rt.stability.monitorId!==result.monitorId) return;
    if((rt.stability.stableMs|0)<(settings.dwellMs|0)) return;
    if(rt.lastMoveAt&&(now-rt.lastMoveAt)<settings.cooldownMs) return;
    if(asNum(result.confidence)<settings.minConfidence) return;
    // Already landed here — do not re-teleport (stops center/last flicker).
    if(rt.landedMonitorId&&String(rt.landedMonitorId)===String(result.monitorId)) return;

    // Confirm needs Ctrl; only fetch Ctrl once we are otherwise ready.
    var needsCtrl=mode==='confirm'||settings.trigger==='ctrl'||settings.trigger==='ctrl_or_dwell';
    rt.moveInFlight=true;

    var ctrlPromise=needsCtrl?getCtrlDownCached(now):Promise.resolve(false);
    ctrlPromise.then(function(ctrlDown){
      if(!shouldAttemptMove(settings, result, rt.stability, now, ctrlDown)){
        return null;
      }
      return invokeIpc('cmd_gaze_get_cursor_position',{}).then(function(cursor){
        if(cursor&&typeof cursor==='object'){
          rt.cursorDebug={x:cursor.x|0,y:cursor.y|0,monitorId:String(cursor.monitorId||'')};
          var curMon=String(cursor.monitorId||'');
          if(curMon){
            rememberLastPosition(curMon, cursor.x, cursor.y);
          }
          if(curMon&&curMon===String(result.monitorId)){
            rt.landedMonitorId=curMon;
            return {skipped:'same_monitor'};
          }
          // Cursor left our previous land (user moved mouse) while gaze still
          // targets the old land — clear stick so we can re-place.
          if(rt.landedMonitorId&&curMon&&curMon!==String(rt.landedMonitorId)
            &&String(rt.landedMonitorId)===String(result.monitorId)){
            rt.landedMonitorId=null;
          }
        }
        if(rt.landedMonitorId&&String(rt.landedMonitorId)===String(result.monitorId)){
          return {skipped:'already_landed'};
        }
        var preferLast=settings.landPreference==='last';
        var preferred=null;
        if(preferLast&&rt.settings&&rt.settings.lastPositions){
          preferred=rt.settings.lastPositions[result.monitorId]||null;
        }
        return invokeIpc('cmd_gaze_move_cursor_to_monitor',{
          monitorId:result.monitorId,
          preferred:preferLast?preferred:null,
          fallback:'center',
          flash:false
        }).then(function(pos){
          rt.lastMoveAt=Date.now();
          rt.landedMonitorId=String(result.monitorId);
          if(pos&&isFinite(Number(pos.x))&&isFinite(Number(pos.y))){
            rememberLastPosition(result.monitorId, pos.x, pos.y);
          }
          persistLastPositions();
          var label=result.monitorId||'';
          if(rt.topology&&rt.topology.monitors){
            for(var i=0;i<rt.topology.monitors.length;i++){
              if(rt.topology.monitors[i].id===result.monitorId){
                label=rt.topology.monitors[i].label||result.monitorId;
                break;
              }
            }
          }
          var aliasLabelText=aliasLabel(result.alias);
          rt.lastAction=t('cameraSmartPointerActionMoved','已移动到')+' '+(aliasLabelText!=='—'?aliasLabelText:label);
          pulseLandVisual(aliasLabelText!=='—'?aliasLabelText:label);
          try{ syncUi(); }catch(_){}
          return pos;
        });
      });
    }).catch(function(err){
      var msg=String(err&&err.message?err.message:err||'move_failed');
      if(msg==='no_ipc') return;
      rt.lastAction=msg;
      try{ syncUi(); }catch(_){}
    }).then(function(){
      rt.moveInFlight=false;
    });
  }

  function pulseLandVisual(label){
    var line=$('cameraSmartPointerActionLine');
    if(line){
      line.classList.remove('is-cursor-land');
      try{ void line.offsetWidth; }catch(_){}
      line.classList.add('is-cursor-land');
    }
    var banner=$('cameraSmartPointerLandBanner');
    if(banner){
      banner.hidden=false;
      banner.textContent=t('cameraSmartPointerLandHint','光标已出现')+' · '+String(label||'');
      banner.classList.remove('is-show');
      try{ void banner.offsetWidth; }catch(_){}
      banner.classList.add('is-show');
      if(rt.landBannerTimer) clearTimeout(rt.landBannerTimer);
      rt.landBannerTimer=setTimeout(function(){
        banner.classList.remove('is-show');
        banner.hidden=true;
      },1600);
    }
  }

  function onGazeFrame(point, now){
    now=now!=null?now:Date.now();
    var settings=getSettings();
    if(!settings.enabled&&!(rt.assessmentSession&&rt.assessmentSession.running)){
      return null;
    }

    // Throttle classify to ~DETECT_INTERVAL_MS
    if(rt.lastFrameAt&&(now-rt.lastFrameAt)<DETECT_INTERVAL_MS){
      return rt.lastResult;
    }
    rt.lastFrameAt=now;

    // Assessment sampling path
    if(rt.assessmentSession){
      var Assess=global.OneToneCameraGazeMonitorAssessment;
      if(Assess&&Assess.ingestPoint&&rt.assessmentSession.running){
        var ingested=Assess.ingestPoint(rt.assessmentSession, point, now);
        if(ingested&&ingested.done&&ingested.assessment){
          settings=writeSettings(Object.assign({},settings,{assessment:ingested.assessment}));
          rt.assessmentSession=null;
          try{ syncUi(); }catch(_){}
        }
      }
    }

    if(!settings.enabled||settings.mode==='off'){
      return null;
    }
    if(!point||point.blinking||point.state==='lost'||point.faceDetected===false){
      return null;
    }
    if(asNum(point.confidence)<settings.minConfidence){
      return null;
    }

    var Clf=global.OneToneCameraGazeMonitorClassifier;
    if(!Clf||!Clf.classify) return null;
    settings=syncTopologyFingerprint();
    var result=Clf.classify(point, rt.topology, settings.assessment, settings);
    if(!rt.stability){
      rt.stability=Clf.createStability?Clf.createStability():{monitorId:null,since:0,stableMs:0};
    }
    rt.stability=Clf.updateStability(rt.stability, result, now);
    result=Object.assign({},result,{stableMs:rt.stability.stableMs|0});
    rt.lastResult=result;

    // Preview never moves. Confirm (Ctrl) / auto handled in maybeMoveCursor.
    if(settings.mode!=='preview'){
      maybeMoveCursor(settings, result, now);
    }
    return result;
  }

  function startAssessment(opts){
    var Assess=global.OneToneCameraGazeMonitorAssessment;
    if(!Assess||!Assess.createSession) throw new Error('assessment_unavailable');
    var settings=getSettings();
    var fp=rt.topology&&rt.topology.fingerprint?rt.topology.fingerprint:null;
    rt.assessmentSession=Assess.createSession(Object.assign({
      screenCount:settings.screenCount,
      fingerprint:fp
    },opts||{}));
    settings=writeSettings(Object.assign({},settings,{
      assessment:Object.assign({},settings.assessment,{status:'running',reason:null})
    }));
    return rt.assessmentSession;
  }

  function confirmAssessmentStep(now){
    var Assess=global.OneToneCameraGazeMonitorAssessment;
    if(!Assess||!rt.assessmentSession) return null;
    return Assess.beginStep(rt.assessmentSession, now);
  }

  function getDebugState(){
    return {
      settings:getSettings(),
      topology:rt.topology,
      lastResult:rt.lastResult,
      stability:rt.stability,
      lastAction:rt.lastAction,
      assessmentSession:rt.assessmentSession?{
        step:global.OneToneCameraGazeMonitorAssessment
          ?global.OneToneCameraGazeMonitorAssessment.currentStep(rt.assessmentSession)
          :null,
        stepIndex:rt.assessmentSession.stepIndex,
        confirmPending:!!rt.assessmentSession.stepConfirmPending,
        running:!!rt.assessmentSession.running,
        sampleCount:(rt.assessmentSession.samples||[]).length
      }:null,
      detectIntervalMs:DETECT_INTERVAL_MS
    };
  }

  function resetRuntime(){
    rt.stability=null;
    rt.lastResult=null;
    rt.lastFrameAt=0;
    rt.lastMoveAt=0;
    rt.lastAction=null;
    rt.landedMonitorId=null;
    rt.moveInFlight=false;
    rt.ctrlCache={at:0,down:false};
  }

  function isWanted(){
    var s=getSettings();
    if(s&&s.enabled) return true;
    if(rt.assessmentSession){
      if(rt.assessmentSession.running||rt.assessmentSession.stepConfirmPending) return true;
    }
    return false;
  }

  function $(id){
    return global.OneToneDom&&global.OneToneDom.$?global.OneToneDom.$(id):document.getElementById(id);
  }

  function t(key, fallback){
    if(global.OneToneI18n&&global.OneToneI18n.t){
      var v=global.OneToneI18n.t(key);
      if(v&&v!==key) return v;
    }
    return fallback!=null?fallback:key;
  }

  function setToggle(id, on){
    var el=$(id);
    if(!el) return;
    el.classList.toggle('is-on',!!on);
    el.setAttribute('aria-checked',on?'true':'false');
  }

  function aliasLabel(alias){
    if(alias==='left') return t('cameraSmartPointerAliasLeft','左屏');
    if(alias==='right') return t('cameraSmartPointerAliasRight','右屏');
    if(alias==='center') return t('cameraSmartPointerAliasCenter','中屏');
    return '—';
  }

  function isSetupReady(settings){
    settings=settings||getSettings();
    if(settings.setupConfirmed) return true;
    // Screen count auto-synced from live topology counts as set up.
    var n=rt.topology&&rt.topology.monitors?rt.topology.monitors.length:0;
    if(n<=0) return false;
    var expected=Math.max(1,Math.min(3,n));
    return (settings.screenCount|0)===expected;
  }

  function feelFromSettings(settings){
    settings=settings||getSettings();
    var conf=Number(settings.minConfidence)||0.55;
    var dwell=settings.dwellMs|0;
    var cool=settings.cooldownMs|0;
    var best='balanced';
    var bestScore=1e9;
    for(var i=0;i<FEEL_IDS.length;i++){
      var id=FEEL_IDS[i];
      var p=FEEL_PRESETS[id];
      var score=Math.abs(conf-p.minConfidence)*1000
        +Math.abs(dwell-p.dwellMs)*0.02
        +Math.abs(cool-p.cooldownMs)*0.01;
      if(score<bestScore){
        bestScore=score;
        best=id;
      }
    }
    return best;
  }

  function applyFeelPreset(feelId){
    var id=FEEL_IDS.indexOf(String(feelId||''))>=0?String(feelId):'balanced';
    var p=FEEL_PRESETS[id];
    return patchSettings({
      minConfidence:p.minConfidence,
      dwellMs:p.dwellMs,
      cooldownMs:p.cooldownMs,
      feel:id
    });
  }

  function statusPillText(settings){
    settings=settings||getSettings();
    if(!settings.enabled) return t('cameraSmartPointerStatusDisabled','未启用');
    if(!isSetupReady(settings)) return t('cameraSmartPointerStatusUnset','未设置');
    if(settings.mode==='preview') return t('cameraSmartPointerStatusPreview','预览中');
    var stab=rt.stability;
    if((settings.mode==='auto'||settings.mode==='confirm')&&stab&&stab.monitorId&&(stab.stableMs|0)>=Math.min(300,settings.dwellMs|0)){
      return t('cameraSmartPointerStatusTracking','追踪中');
    }
    return t('cameraSmartPointerStatusReady','已启用');
  }

  function syncModeButtons(settings){
    settings=settings||getSettings();
    var seg=$('cameraSmartPointerModeSeg');
    if(!seg) return;
    var btns=seg.querySelectorAll('[data-sp-mode]');
    for(var i=0;i<btns.length;i++){
      var btn=btns[i];
      var mode=btn.getAttribute('data-sp-mode');
      btn.disabled=false;
      btn.classList.toggle('is-active',settings.mode===mode);
      btn.setAttribute('aria-disabled','false');
    }
  }

  function syncFeelButtons(settings){
    settings=settings||getSettings();
    var seg=$('cameraSmartPointerFeelSeg');
    if(!seg) return;
    var feel=settings.feel&&FEEL_IDS.indexOf(settings.feel)>=0?settings.feel:feelFromSettings(settings);
    var btns=seg.querySelectorAll('[data-sp-feel]');
    for(var i=0;i<btns.length;i++){
      var btn=btns[i];
      btn.classList.toggle('is-active',btn.getAttribute('data-sp-feel')===feel);
    }
  }

  function syncSetupSummary(settings){
    settings=settings||getSettings();
    var el=$('cameraSmartPointerSetupSummary');
    if(!el) return;
    var n=rt.topology&&rt.topology.monitors?rt.topology.monitors.length:0;
    var camMap={
      'center-top':t('cameraSmartPointerCamCenter','中间屏上方'),
      'left-top':t('cameraSmartPointerCamLeft','左屏上方'),
      'right-top':t('cameraSmartPointerCamRight','右屏上方'),
      'laptop-built-in':t('cameraSmartPointerCamLaptop','笔记本内置')
    };
    if(!n&&!settings.setupConfirmed){
      el.textContent=t('cameraSmartPointerSetupSummaryIdle','尚未确认多屏布局');
      return;
    }
    el.textContent=t('cameraSmartPointerSetupSummaryFmt','检测到 {n} 台 · 使用 {c} 屏 · {cam}')
      .replace('{n}',String(n||settings.screenCount))
      .replace('{c}',String(settings.screenCount))
      .replace('{cam}',camMap[settings.cameraPosition]||settings.cameraPosition);
  }

  function syncTuneControls(settings){
    settings=settings||getSettings();
    syncFeelButtons(settings);
    var landSeg=$('cameraSmartPointerLandSeg');
    if(landSeg){
      var btns=landSeg.querySelectorAll('[data-sp-land]');
      for(var i=0;i<btns.length;i++){
        var btn=btns[i];
        btn.classList.toggle('is-active',btn.getAttribute('data-sp-land')===settings.landPreference);
      }
    }
  }

  function syncScreenPills(settings){
    settings=settings||getSettings();
    var wrap=$('cameraSmartPointerScreenPills');
    if(!wrap) return;
    var pills=wrap.querySelectorAll('[data-sp-screens]');
    for(var i=0;i<pills.length;i++){
      var p=pills[i];
      p.classList.toggle('is-active',String(settings.screenCount)===p.getAttribute('data-sp-screens'));
    }
  }

  function syncCamGrid(settings){
    settings=settings||getSettings();
    var grid=$('cameraSmartPointerCamGrid');
    if(!grid) return;
    var cards=grid.querySelectorAll('[data-sp-cam]');
    for(var i=0;i<cards.length;i++){
      var c=cards[i];
      c.classList.toggle('is-active',c.getAttribute('data-sp-cam')===settings.cameraPosition);
    }
    syncDeskCameraHost(settings);
    syncDeskCaption(settings);
  }

  function camHostAlias(cameraPosition){
    var cam=String(cameraPosition||'center-top');
    if(cam==='left-top') return 'left';
    if(cam==='right-top') return 'right';
    if(cam==='laptop-built-in') return 'center';
    return 'center';
  }

  function syncDeskCameraHost(settings){
    settings=settings||getSettings();
    var strip=$('cameraSmartPointerMonitorStrip');
    if(!strip) return;
    var hostAlias=camHostAlias(settings.cameraPosition);
    var isLaptop=settings.cameraPosition==='laptop-built-in';
    var cells=strip.querySelectorAll('[data-sp-alias]');
    for(var i=0;i<cells.length;i++){
      var cell=cells[i];
      var on=cell.getAttribute('data-sp-alias')===hostAlias;
      cell.classList.toggle('is-cam-host',on);
      var dot=cell.querySelector('.camera-sp-cam-dot');
      if(dot) dot.classList.toggle('is-laptop',on&&isLaptop);
    }
  }

  function syncDeskCaption(settings){
    settings=settings||Object.assign({},getSettings(),rt.setupDraft||{});
    var el=$('cameraSmartPointerDeskCaption');
    if(!el) return;
    var camMap={
      'center-top':t('cameraSmartPointerCamCenter','中间屏上方'),
      'left-top':t('cameraSmartPointerCamLeft','左屏上方'),
      'right-top':t('cameraSmartPointerCamRight','右屏上方'),
      'laptop-built-in':t('cameraSmartPointerCamLaptop','笔记本内置')
    };
    var n=rt.topology&&rt.topology.monitors?rt.topology.monitors.length:0;
    el.textContent=t('cameraSmartPointerDeskCaptionFmt','摄像头：{cam} · 使用 {c} / 检测到 {n}')
      .replace('{cam}',camMap[settings.cameraPosition]||settings.cameraPosition)
      .replace('{c}',String(settings.screenCount||0))
      .replace('{n}',String(n||settings.screenCount||0));
  }

  function renderMonitorStrip(topology){
    var strip=$('cameraSmartPointerMonitorStrip');
    if(!strip) return;
    strip.innerHTML='';
    var monitors=topology&&topology.monitors?topology.monitors:[];
    var detect=$('cameraSmartPointerDetectLine');
    if(detect){
      detect.textContent=monitors.length
        ?t('cameraSmartPointerDetectCount','检测到 {n} 台显示器').replace('{n}',String(monitors.length))
        :t('cameraSmartPointerDetectEmpty','未检测到显示器');
    }
    if(!monitors.length){
      var empty=document.createElement('div');
      empty.className='camera-sp-monitor-cell';
      empty.innerHTML='<div class="camera-sp-monitor-bezel"><div class="camera-sp-monitor-glass">—</div></div>';
      strip.appendChild(empty);
      syncDeskCaption(Object.assign({},getSettings(),rt.setupDraft||{}));
      return;
    }
    var maxW=1;
    for(var w=0;w<monitors.length;w++){
      maxW=Math.max(maxW,monitors[w].width|0);
    }
    var draft=Object.assign({},getSettings(),rt.setupDraft||{});
    var hostAlias=camHostAlias(draft.cameraPosition);
    monitors.forEach(function(m){
      var alias=topology.aliases?topology.aliases[m.id]:'';
      var label=aliasLabel(alias);
      if(label==='—') label=m.label||m.id;
      var flex=Math.max(0.55, (m.width||1)/maxW);
      var cell=document.createElement('button');
      cell.type='button';
      cell.className='camera-sp-monitor-cell'
        +(m.primary?' is-primary':'')
        +(alias===hostAlias?' is-cam-host':'');
      cell.style.flex=String(flex)+' 1 0';
      cell.setAttribute('data-sp-alias',alias||'');
      cell.setAttribute('data-sp-monitor-id',m.id||'');
      cell.setAttribute('aria-label',label);
      var primaryTag=m.primary
        ?('<span class="camera-sp-primary-tag">'+t('cameraSmartPointerPrimary','主屏')+'</span>')
        :'';
      cell.innerHTML=
        '<span class="camera-sp-cam-dot'+(draft.cameraPosition==='laptop-built-in'&&alias===hostAlias?' is-laptop':'')+'" aria-hidden="true"></span>'+
        '<span class="camera-sp-monitor-bezel">'+
          '<span class="camera-sp-monitor-glass">'+label+'</span>'+
        '</span>'+
        '<span class="camera-sp-monitor-meta">'+
          '<strong>'+(alias||m.id)+'</strong>'+
          '<span>'+m.width+'×'+m.height+'</span>'+
          primaryTag+
        '</span>';
      cell.addEventListener('click',function(){
        var nextCam='center-top';
        if(alias==='left') nextCam='left-top';
        else if(alias==='right') nextCam='right-top';
        else if(alias==='center') nextCam='center-top';
        rt.setupDraft=Object.assign({},rt.setupDraft||{},{cameraPosition:nextCam});
        syncCamGrid(Object.assign({},getSettings(),rt.setupDraft));
      });
      strip.appendChild(cell);
    });
    syncDeskCaption(draft);
  }

  function syncAssessUi(settings){
    settings=settings||getSettings();
    var line=$('cameraSmartPointerAssessLine');
    var stepBtn=$('cameraSmartPointerAssessStepBtn');
    var startBtn=$('cameraSmartPointerAssessBtn');
    var sess=rt.assessmentSession;
    if(sess){
      var Assess=global.OneToneCameraGazeMonitorAssessment;
      var step=Assess&&Assess.currentStep?Assess.currentStep(sess):null;
      var stepName=aliasLabel(step);
      if(stepBtn){
        stepBtn.hidden=!sess.stepConfirmPending;
        if(step==='left') stepBtn.textContent=t('cameraSmartPointerAssessConfirmLeft','开始采左屏');
        else if(step==='right') stepBtn.textContent=t('cameraSmartPointerAssessConfirmRight','开始采右屏');
        else stepBtn.textContent=t('cameraSmartPointerAssessConfirmCenter','开始采中间屏');
      }
      if(startBtn) startBtn.disabled=true;
      if(line){
        if(sess.stepConfirmPending){
          line.textContent=t('cameraSmartPointerAssessWaiting','请看向目标屏，再点确认开始采样：')+stepName;
        }else if(sess.running){
          var elapsed=Date.now()-(sess.stepStartedAt||Date.now());
          var left=Math.max(0,Math.ceil((sess.sampleMs-elapsed)/1000));
          line.textContent=t('cameraSmartPointerAssessSampling','正在采样')+' · '+stepName+' · '+left+'s';
        }else{
          line.textContent='';
        }
      }
      return;
    }
    if(stepBtn) stepBtn.hidden=true;
    if(startBtn) startBtn.disabled=false;
    if(line){
      var a=settings.assessment||{};
      if(a.status==='stale'){
        line.textContent=t('cameraSmartPointerAssessStale','显示器拓扑已变化，请重新评估');
      }else if(a.quality==='good'){
        line.textContent=t('cameraSmartPointerAssessGood','评估良好：分类参考已可用');
      }else if(a.quality==='ok'){
        line.textContent=t('cameraSmartPointerAssessOk','评估一般：可微调灵敏度，仍可使用自动');
      }else if(a.quality==='poor'){
        line.textContent=t('cameraSmartPointerAssessPoor','评估较差：建议调摄像头/光照或微调，不阻止自动');
      }else{
        line.textContent=t('cameraSmartPointerAssessHint','评估仅作参考；开启后即可自动监察视线');
      }
    }
  }

  function syncPreviewResult(result){
    var aliasEl=$('cameraSmartPointerGazeAlias');
    var metaEl=$('cameraSmartPointerGazeMeta');
    if(aliasEl){
      aliasEl.textContent=result&&result.alias?aliasLabel(result.alias):'—';
    }
    if(metaEl){
      if(!result||!result.alias){
        metaEl.textContent='';
        return;
      }
      if(result.lowAccuracy){
        metaEl.textContent=' · '+t('cameraSmartPointerLowAccuracy','准确率较低');
      }else{
        metaEl.textContent='';
      }
    }
  }

  function renderDebugPre(){
    var pre=$('cameraSmartPointerDebugPre');
    if(!pre) return;
    var topo=rt.topology;
    var lines=[];
    if(topo&&topo.monitors){
      lines.push('fingerprint: '+(topo.fingerprint||'—'));
      topo.monitors.forEach(function(m){
        var alias=topo.aliases?topo.aliases[m.id]:'';
        lines.push(
          m.id+' ['+alias+'] '+
          m.x+','+m.y+' '+m.width+'x'+m.height+
          ' scale='+m.scaleFactor+(m.primary?' primary':'')
        );
      });
      if(topo.virtualBounds){
        var vb=topo.virtualBounds;
        lines.push('virtual: '+vb.x+','+vb.y+' '+vb.width+'x'+vb.height);
      }
    }else{
      lines.push('(no topology)');
    }
    if(rt.cursorDebug){
      lines.push('cursor: '+rt.cursorDebug.x+','+rt.cursorDebug.y+' @ '+rt.cursorDebug.monitorId);
    }
    pre.textContent=lines.join('\n');
  }

  function syncUi(){
    var settings=getSettings();
    setToggle('cameraSmartPointerToggle',settings.enabled);
    var pill=$('cameraSmartPointerStatusText');
    if(pill) pill.textContent=statusPillText(settings);
    syncModeButtons(settings);
    syncScreenPills(settings);
    syncCamGrid(settings);
    syncSetupSummary(settings);
    syncTuneControls(settings);
    syncPreviewResult(rt.lastResult);
    var actionEl=$('cameraSmartPointerActionText');
    if(actionEl){
      actionEl.textContent=rt.lastAction
        ?String(rt.lastAction)
        :t('cameraSmartPointerActionNone','无');
    }
  }

  function patchSettings(partial){
    var cur=getSettings();
    var next=writeSettings(Object.assign({},cur,partial||{}));
    try{ syncUi(); }catch(_){}
    return next;
  }

  function openSetupModal(){
    var modal=$('cameraSmartPointerSetupModal');
    if(!modal) return;
    modal.hidden=false;
    modal.setAttribute('aria-hidden','false');
    var settings=getSettings();
    rt.setupDraft={
      screenCount:settings.screenCount,
      cameraPosition:settings.cameraPosition
    };
    refreshTopology().then(function(topo){
      if(topo&&topo.monitors&&topo.monitors.length){
        var detected=Math.max(1,Math.min(3,topo.monitors.length));
        if(!settings.setupConfirmed){
          rt.setupDraft.screenCount=detected;
          patchSettings({screenCount:detected});
        }
      }
      renderMonitorStrip(topo);
      syncScreenPills(Object.assign({},getSettings(),rt.setupDraft));
      syncCamGrid(Object.assign({},getSettings(),rt.setupDraft));
    }).catch(function(){
      renderMonitorStrip(null);
    });
  }

  function closeSetupModal(){
    var modal=$('cameraSmartPointerSetupModal');
    if(!modal) return;
    modal.hidden=true;
    modal.setAttribute('aria-hidden','true');
  }

  function confirmSetupModal(){
    var draft=rt.setupDraft||{};
    var n=rt.topology&&rt.topology.monitors?rt.topology.monitors.length:0;
    var screenCount=clampInt(draft.screenCount,1,3,getSettings().screenCount);
    if(n>0) screenCount=Math.min(screenCount,n);
    patchSettings({
      screenCount:screenCount,
      cameraPosition:draft.cameraPosition||getSettings().cameraPosition,
      setupConfirmed:true
    });
    if(rt.topology){
      var Topo=global.OneToneCameraGazeMonitorTopology;
      if(Topo&&Topo.normalizeTopology){
        setTopology(Topo.normalizeTopology(rt.topology,{screenCount:screenCount}));
      }
    }
    closeSetupModal();
    notifyPreviewLandmarker();
    syncUi();
  }

  function ensureTopologyThen(cb){
    var p=rt.topology?Promise.resolve(rt.topology):refreshTopology().catch(function(){ return null; });
    return p.then(function(topo){
      if(typeof cb==='function') cb(topo);
      syncUi();
      return topo;
    });
  }

  function pollCursorDebug(){
    // Debug UI removed — keep stub for callers.
  }

  function startUiTimers(){
    if(rt.uiTimer||!rt.panelVisible) return;
    rt.uiTimer=setInterval(function(){
      if(!rt.panelVisible||!isWanted()) return;
      var pill=$('cameraSmartPointerStatusText');
      if(pill) pill.textContent=statusPillText(getSettings());
    },800);
  }

  function stopUiTimers(){
    if(rt.uiTimer){
      clearInterval(rt.uiTimer);
      rt.uiTimer=0;
    }
  }

  function notifyPreviewLandmarker(){
    try{
      if(global.OneToneCameraPreview&&global.OneToneCameraPreview.syncLiveLandmarker){
        global.OneToneCameraPreview.syncLiveLandmarker();
      }
    }catch(_){}
  }

  function bindUi(){
    if(rt.uiBound) return;
    rt.uiBound=true;
    var toggle=$('cameraSmartPointerToggle');
    if(toggle){
      toggle.addEventListener('click',function(e){
        e.preventDefault();
        var next=!toggle.classList.contains('is-on');
        var cur=getSettings();
        var mode=cur.mode&&cur.mode!=='off'?cur.mode:'auto';
        if(next&&(mode==='off'||!mode)) mode='auto';
        if(!next) rt.landedMonitorId=null;
        patchSettings({
          enabled:next,
          mode:next?mode:'auto',
          trigger:mode==='confirm'?'ctrl':'dwell'
        });
        ensureTopologyThen(function(topo){
          if(next&&topo&&topo.monitors&&topo.monitors.length&&!getSettings().setupConfirmed){
            openSetupModal();
          }
        });
        notifyPreviewLandmarker();
        if(rt.panelVisible) startUiTimers();
      });
    }
    var seg=$('cameraSmartPointerModeSeg');
    if(seg){
      seg.addEventListener('click',function(e){
        var btn=e.target&&e.target.closest?e.target.closest('[data-sp-mode]'):null;
        if(!btn) return;
        var mode=btn.getAttribute('data-sp-mode');
        var patch={mode:mode};
        if(mode==='confirm') patch.trigger='ctrl';
        if(mode==='auto') patch.trigger='dwell';
        patchSettings(patch);
      });
    }
    var setupBtn=$('cameraSmartPointerSetupBtn');
    if(setupBtn) setupBtn.addEventListener('click',function(){ openSetupModal(); });
    var setupClose=$('cameraSmartPointerSetupClose');
    if(setupClose) setupClose.addEventListener('click',closeSetupModal);
    var setupBackdrop=$('cameraSmartPointerSetupBackdrop');
    if(setupBackdrop) setupBackdrop.addEventListener('click',closeSetupModal);
    var setupConfirm=$('cameraSmartPointerSetupConfirm');
    if(setupConfirm) setupConfirm.addEventListener('click',confirmSetupModal);
    var setupRefresh=$('cameraSmartPointerSetupRefresh');
    if(setupRefresh){
      setupRefresh.addEventListener('click',function(){
        refreshTopology().then(function(topo){
          renderMonitorStrip(topo);
          if(topo&&topo.monitors&&topo.monitors.length){
            var detected=Math.max(1,Math.min(3,topo.monitors.length));
            rt.setupDraft=rt.setupDraft||{};
            rt.setupDraft.screenCount=detected;
            syncScreenPills(Object.assign({},getSettings(),rt.setupDraft));
          }
        }).catch(function(){ renderMonitorStrip(null); });
      });
    }
    var pills=$('cameraSmartPointerScreenPills');
    if(pills){
      pills.addEventListener('click',function(e){
        var btn=e.target&&e.target.closest?e.target.closest('[data-sp-screens]'):null;
        if(!btn) return;
        var n=Number(btn.getAttribute('data-sp-screens'))||3;
        rt.setupDraft=Object.assign({},rt.setupDraft||{},{screenCount:n});
        syncScreenPills(Object.assign({},getSettings(),rt.setupDraft));
        try{
          var Topo=global.OneToneCameraGazeMonitorTopology;
          if(Topo&&Topo.normalizeTopology&&rt.topology){
            setTopology(Topo.normalizeTopology(rt.topology,{screenCount:n}));
          }
        }catch(_){}
        syncDeskCaption(Object.assign({},getSettings(),rt.setupDraft));
        renderMonitorStrip(rt.topology);
      });
    }
    var camGrid=$('cameraSmartPointerCamGrid');
    if(camGrid){
      camGrid.addEventListener('click',function(e){
        var btn=e.target&&e.target.closest?e.target.closest('[data-sp-cam]'):null;
        if(!btn) return;
        var cam=btn.getAttribute('data-sp-cam')||'center-top';
        rt.setupDraft=Object.assign({},rt.setupDraft||{},{cameraPosition:cam});
        syncCamGrid(Object.assign({},getSettings(),rt.setupDraft));
      });
    }
    var feelSeg=$('cameraSmartPointerFeelSeg');
    if(feelSeg){
      feelSeg.addEventListener('click',function(e){
        var btn=e.target&&e.target.closest?e.target.closest('[data-sp-feel]'):null;
        if(!btn) return;
        var feel=btn.getAttribute('data-sp-feel');
        if(FEEL_IDS.indexOf(feel)<0) return;
        applyFeelPreset(feel);
      });
    }

    var landSeg=$('cameraSmartPointerLandSeg');
    if(landSeg){
      landSeg.addEventListener('click',function(e){
        var btn=e.target&&e.target.closest?e.target.closest('[data-sp-land]'):null;
        if(!btn) return;
        var land=btn.getAttribute('data-sp-land');
        if(LAND_PREFS.indexOf(land)<0) return;
        patchSettings({landPreference:land});
      });
    }
  }

  function init(){
    bindUi();
    rt.settings=readSettings();
    if(rt.panelVisible){
      try{ syncUi(); }catch(_){}
    }
  }

  function onPanelVisible(){
    rt.panelVisible=true;
    init();
    // Defer heavy IPC/DOM so left-nav switch paints first (avoids freeze).
    setTimeout(function(){
      if(!rt.panelVisible) return;
      try{ syncUi(); }catch(_){}
      ensureTopologyThen(function(){});
      startUiTimers();
      if(isWanted()) notifyPreviewLandmarker();
    },0);
  }

  function onPanelHidden(){
    rt.panelVisible=false;
    stopUiTimers();
    try{ closeSetupModal(); }catch(_){}
  }

  // Wrap onGazeFrame to refresh lightweight UI labels.
  var _onGazeFrame=onGazeFrame;
  onGazeFrame=function(point, now){
    var result=_onGazeFrame(point, now);
    if(result&&(now==null||!rt.lastUiGazeAt||(now-rt.lastUiGazeAt)>280)){
      rt.lastUiGazeAt=now!=null?now:Date.now();
      syncPreviewResult(result);
    }
    return result;
  };

  global.OneToneCameraSmartPointer={
    DETECT_INTERVAL_MS:DETECT_INTERVAL_MS,
    FEEL_PRESETS:FEEL_PRESETS,
    defaultSmartPointer:defaultSmartPointer,
    normalizeSmartPointer:normalizeSmartPointer,
    normalizeAssessment:normalizeAssessment,
    allowedMoveModes:allowedMoveModes,
    canUseAuto:canUseAuto,
    qualitySuggestsTune:qualitySuggestsTune,
    feelFromSettings:feelFromSettings,
    applyFeelPreset:applyFeelPreset,
    isSetupReady:isSetupReady,
    coerceMode:coerceMode,
    shouldAttemptMove:shouldAttemptMove,
    maybeMoveCursor:maybeMoveCursor,
    getCtrlDownCached:getCtrlDownCached,
    setAutoMoveEnabled:function(on){ rt.autoMoveEnabled=!!on; },
    isAutoMoveEnabled:function(){ return !!rt.autoMoveEnabled; },
    getSettings:getSettings,
    writeSettings:writeSettings,
    setTopology:setTopology,
    refreshTopology:refreshTopology,
    onGazeFrame:onGazeFrame,
    startAssessment:startAssessment,
    confirmAssessmentStep:confirmAssessmentStep,
    getDebugState:getDebugState,
    resetRuntime:resetRuntime,
    isWanted:isWanted,
    syncUi:syncUi,
    init:init,
    onPanelVisible:onPanelVisible,
    onPanelHidden:onPanelHidden
  };
})(typeof window!=='undefined'?window:typeof global!=='undefined'?global:this);
