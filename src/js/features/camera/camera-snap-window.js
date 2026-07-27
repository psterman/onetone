(function(global){
  'use strict';

  /**
   * Snap Window: hold title bar + gaze at target monitor → move window.
   * Reuses Smart Pointer topology + classifier.
   */

  var DETECT_INTERVAL_MS=80;
  var DRAG_POLL_MS=120;

  function defaultSnapWindow(){
    return {
      enabled:false,
      dwellMs:500,
      cooldownMs:1000,
      minConfidence:0.5
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

  function normalizeSnapWindow(raw){
    var d=defaultSnapWindow();
    if(!raw||typeof raw!=='object') return d;
    return {
      enabled:!!raw.enabled,
      dwellMs:clampInt(raw.dwellMs,200,3000,d.dwellMs),
      cooldownMs:clampInt(raw.cooldownMs,400,5000,d.cooldownMs),
      minConfidence:Math.max(0.2,Math.min(0.95,Number(raw.minConfidence)))||d.minConfidence
    };
  }

  var rt={
    settings:null,
    dragState:null,
    stability:null,
    lastResult:null,
    lastFrameAt:0,
    lastMoveAt:0,
    lastMovedMonitorId:null,
    lastMovedHwnd:null,
    lastAction:null,
    moveInFlight:false,
    dragTimer:0,
    uiBound:false,
    panelVisible:false
  };

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

  function asNum(v, fallback){
    var n=Number(v);
    return isFinite(n)?n:(fallback!=null?fallback:0);
  }

  function invokeIpc(cmd, args){
    var inv=global.OneToneIpc&&global.OneToneIpc.invoke;
    if(!inv) return Promise.reject(new Error('no_ipc'));
    return inv(cmd, args||{});
  }

  function toast(msg){
    try{
      if(global.OneToneAppToast&&global.OneToneAppToast.show){
        global.OneToneAppToast.show(msg,'lite');
      }
    }catch(_){}
  }

  function refreshMicCheck(manual){
    var mic=global.OneToneAppMic;
    if(mic&&mic.refreshMicUiState){
      return mic.refreshMicUiState({manual:!!manual}).catch(function(){
        if(mic.renderMicSurfaces) mic.renderMicSurfaces();
        return mic.getMicUiState?mic.getMicUiState():null;
      });
    }
    return Promise.resolve(null);
  }

  function currentMicLabel(){
    var mic=global.OneToneAppMic;
    var st=mic&&mic.getMicUiState?mic.getMicUiState():null;
    return st&&st.label?st.label:t('micUiMissing','麦克风不可用');
  }

  function readSettings(){
    var st=global.OneToneState&&global.OneToneState.state;
    var cp=st&&st.config&&st.config.cameraPrefs;
    return normalizeSnapWindow(cp&&cp.snapWindow);
  }

  function writeSettings(next){
    var normalized=normalizeSnapWindow(next);
    var st=global.OneToneState&&global.OneToneState.state;
    if(st&&st.config){
      if(!st.config.cameraPrefs||typeof st.config.cameraPrefs!=='object'){
        st.config.cameraPrefs={};
      }
      st.config.cameraPrefs.snapWindow=normalized;
    }
    try{
      if(global.OneToneCameraPreview&&global.OneToneCameraPreview.persistCameraPrefs){
        global.OneToneCameraPreview.persistCameraPrefs({snapWindow:normalized});
      }else if(global.OneToneConfigPersist&&global.OneToneConfigPersist.saveCameraPrefsQuiet){
        global.OneToneConfigPersist.saveCameraPrefsQuiet();
      }
    }catch(_){}
    rt.settings=normalized;
    return normalized;
  }

  function getSettings(){
    if(!rt.settings) rt.settings=readSettings();
    return rt.settings;
  }

  function isWanted(){
    return !!(getSettings().enabled);
  }

  function classifierSettings(){
    var sp=global.OneToneCameraSmartPointer;
    var base=sp&&sp.getSettings?sp.getSettings():null;
    var snap=getSettings();
    return {
      enabled:true,
      mode:'auto',
      screenCount:base&&base.screenCount?base.screenCount:3,
      layout:'horizontal',
      cameraPosition:base&&base.cameraPosition?base.cameraPosition:'center-top',
      minConfidence:snap.minConfidence,
      assessment:base&&base.assessment?base.assessment:null
    };
  }

  function getTopology(){
    var sp=global.OneToneCameraSmartPointer;
    if(sp&&sp.getDebugState){
      var dbg=sp.getDebugState();
      if(dbg&&dbg.topology) return dbg.topology;
    }
    return null;
  }

  function ensureTopology(){
    var topo=getTopology();
    if(topo) return Promise.resolve(topo);
    var sp=global.OneToneCameraSmartPointer;
    if(sp&&sp.refreshTopology) return sp.refreshTopology().catch(function(){ return null; });
    var Topo=global.OneToneCameraGazeMonitorTopology;
    if(!Topo||!Topo.listMonitors) return Promise.resolve(null);
    var cs=classifierSettings();
    return Topo.listMonitors({screenCount:cs.screenCount}).catch(function(){ return null; });
  }

  /**
   * Pure gate: dwell + cooldown + different monitor + title-bar drag active.
   */
  function shouldSnap(settings, drag, result, stability, now){
    settings=normalizeSnapWindow(settings);
    if(!settings.enabled) return false;
    if(!drag||!drag.lmbDown||!drag.isTitleBar||!drag.hwnd) return false;
    if(!result||!result.monitorId) return false;
    if(asNum(result.confidence)<settings.minConfidence) return false;
    if(!stability||stability.monitorId!==result.monitorId) return false;
    if((stability.stableMs|0)<(settings.dwellMs|0)) return false;
    if(drag.monitorId&&drag.monitorId===result.monitorId) return false;
    if(rt.lastMovedHwnd===drag.hwnd&&rt.lastMovedMonitorId===result.monitorId) return false;
    if(now!=null&&rt.lastMoveAt&&(now-rt.lastMoveAt)<settings.cooldownMs) return false;
    return true;
  }

  function pollDragState(){
    if(!isWanted()) return;
    invokeIpc('cmd_gaze_drag_state',{}).then(function(st){
      rt.dragState=st||null;
      if(!st||!st.lmbDown||!st.isTitleBar){
        rt.stability=null;
        rt.lastResult=null;
      }
    }).catch(function(){
      rt.dragState=null;
    });
  }

  function startDragPoll(){
    stopDragPoll();
    if(!isWanted()) return;
    pollDragState();
    rt.dragTimer=setInterval(pollDragState, DRAG_POLL_MS);
  }

  function stopDragPoll(){
    if(rt.dragTimer){
      clearInterval(rt.dragTimer);
      rt.dragTimer=0;
    }
  }

  function maybeMoveWindow(settings, drag, result, now){
    if(rt.moveInFlight) return;
    if(!shouldSnap(settings, drag, result, rt.stability, now)) return;
    rt.moveInFlight=true;
    var hwnd=drag.hwnd;
    var monitorId=result.monitorId;
    invokeIpc('cmd_gaze_move_window_to_monitor',{
      hwnd:hwnd,
      monitorId:monitorId
    }).then(function(){
      rt.lastMoveAt=Date.now();
      rt.lastMovedHwnd=hwnd;
      rt.lastMovedMonitorId=monitorId;
      rt.lastAction='moved:'+monitorId;
      try{ syncUi(); }catch(_){}
      refreshMicCheck(false).then(function(){
        toast(t('cameraSnapMovedMicToast','已切屏，麦克风：{state}').replace('{state}',currentMicLabel()));
      });
    }).catch(function(){
      /* ignore */
    }).then(function(){
      rt.moveInFlight=false;
    });
  }

  function onGazeFrame(point, now){
    now=now!=null?now:Date.now();
    var settings=getSettings();
    if(!settings.enabled) return null;
    var drag=rt.dragState;
    if(!drag||!drag.lmbDown||!drag.isTitleBar) return null;

    if(rt.lastFrameAt&&(now-rt.lastFrameAt)<DETECT_INTERVAL_MS){
      return rt.lastResult;
    }
    rt.lastFrameAt=now;

    if(!point||point.blinking||point.state==='lost'||point.faceDetected===false){
      return null;
    }
    if(asNum(point.confidence)<settings.minConfidence) return null;

    var Clf=global.OneToneCameraGazeMonitorClassifier;
    if(!Clf||!Clf.classify) return null;
    var cs=classifierSettings();
    var topo=getTopology();
    var result=Clf.classify(point, topo, cs.assessment, cs);
    if(!rt.stability){
      rt.stability=Clf.createStability?Clf.createStability():{monitorId:null,since:0,stableMs:0};
    }
    rt.stability=Clf.updateStability(rt.stability, result, now);
    result=Object.assign({},result,{stableMs:rt.stability.stableMs|0});
    rt.lastResult=result;
    maybeMoveWindow(settings, drag, result, now);
    return result;
  }

  function setToggle(id, on){
    var el=$(id);
    if(!el) return;
    el.classList.toggle('is-on',!!on);
    el.setAttribute('aria-checked',on?'true':'false');
  }

  function syncUi(){
    var settings=getSettings();
    setToggle('cameraSnapWindowToggle', settings.enabled);
    var pill=$('cameraSnapWindowStatus');
    if(pill){
      pill.textContent=settings.enabled
        ?t('cameraSnapWindowStatusOn','已开启')
        :t('cameraSnapWindowStatusOff','已关闭');
      pill.classList.toggle('is-on',!!settings.enabled);
    }
    var scene=$('cameraSnapScene');
    if(scene){
      scene.classList.toggle('is-active',!!settings.enabled);
      scene.setAttribute('aria-hidden',settings.enabled?'false':'true');
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
    var tog=$('cameraSnapWindowToggle');
    if(tog){
      tog.addEventListener('click',function(){
        var next=!getSettings().enabled;
        writeSettings(Object.assign({},getSettings(),{enabled:next}));
        syncUi();
        if(next){
          ensureTopology().then(function(){ startDragPoll(); });
        }else{
          stopDragPoll();
          rt.dragState=null;
        }
        notifyPreviewLandmarker();
      });
    }
  }

  function onPanelVisible(){
    rt.panelVisible=true;
    bindUi();
    syncUi();
    refreshMicCheck(true);
    if(isWanted()){
      ensureTopology().then(function(){ startDragPoll(); });
      notifyPreviewLandmarker();
    }
  }

  function onPanelHidden(){
    rt.panelVisible=false;
    stopDragPoll();
  }

  function init(){
    rt.settings=readSettings();
    bindUi();
    syncUi();
    if(isWanted()&&rt.panelVisible) startDragPoll();
  }

  global.OneToneCameraSnapWindow={
    DETECT_INTERVAL_MS:DETECT_INTERVAL_MS,
    DRAG_POLL_MS:DRAG_POLL_MS,
    defaultSnapWindow:defaultSnapWindow,
    normalizeSnapWindow:normalizeSnapWindow,
    shouldSnap:shouldSnap,
    getSettings:getSettings,
    writeSettings:writeSettings,
    onGazeFrame:onGazeFrame,
    isWanted:isWanted,
    syncUi:syncUi,
    init:init,
    onPanelVisible:onPanelVisible,
    onPanelHidden:onPanelHidden,
    _rt:rt
  };

  if(global.document&&global.document.readyState==='loading'){
    global.document.addEventListener('DOMContentLoaded',function(){ try{ init(); }catch(_){} });
  }else{
    try{ init(); }catch(_){}
  }
})(typeof window!=='undefined'?window:typeof global!=='undefined'?global:this);
