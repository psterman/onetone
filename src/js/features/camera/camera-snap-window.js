(function(global){
  'use strict';

  /**
   * Snap Window: hold title bar + gaze at target monitor → move window.
   * No microphone involvement.
   */

  var DETECT_INTERVAL_MS=80;
  var DRAG_POLL_MS=40;

  function defaultSnapWindow(){
    return {
      enabled:false,
      dwellMs:120,
      cooldownMs:500,
      minConfidence:0.2
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
      dwellMs:clampInt(raw.dwellMs,100,3000,d.dwellMs),
      cooldownMs:clampInt(raw.cooldownMs,200,5000,d.cooldownMs),
      minConfidence:Math.max(0.1,Math.min(0.95,Number(raw.minConfidence)))||d.minConfidence
    };
  }

  var rt={
    settings:null,
    topology:null,
    dragState:null,
    lockedDrag:null,
    stability:null,
    lastResult:null,
    lastFrameAt:0,
    lastMoveAt:0,
    lastMovedHwnd:null,
    lastMovedMonitorId:null,
    lastAction:null,
    lastHint:'',
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

  function setHint(text){
    text=String(text||'');
    if(text===rt.lastHint) return;
    var now=Date.now();
    // Avoid rapid flicker between progress strings while tracking is noisy.
    if(rt.lastHintAt&&(now-rt.lastHintAt)<320&&rt.lastHint&&text){
      var a=rt.lastHint;
      var progress=/看向|锁定|准备|标题栏|按住/.test(a)&&/看向|锁定|准备|标题栏|按住/.test(text);
      if(progress&&a!==text){
        if(rt.hintHoldUntil&&now<rt.hintHoldUntil) return;
        rt.hintHoldUntil=now+320;
      }
    }
    rt.lastHint=text;
    rt.lastHintAt=now;
    var el=$('cameraSnapHint');
    if(el) el.textContent=text;
  }

  function pickGazeResult(point, now, settings){
    var Clf=global.OneToneCameraGazeMonitorClassifier;
    var sp=global.OneToneCameraSmartPointer;
    // Prefer Smart Pointer's live classify — same path that already moves the cursor.
    if(sp&&sp.getDebugState){
      try{
        var dbg=sp.getDebugState();
        if(dbg&&dbg.lastResult&&dbg.lastResult.monitorId){
          if(dbg.topology&&dbg.topology.monitors&&dbg.topology.monitors.length){
            rt.topology=dbg.topology;
          }
          var stableMs=0;
          if(dbg.stability&&dbg.stability.monitorId===dbg.lastResult.monitorId){
            stableMs=dbg.stability.stableMs|0;
            rt.stability=dbg.stability;
          }
          return Object.assign({},dbg.lastResult,{stableMs:stableMs});
        }
      }catch(_){}
    }
    if(!Clf||!Clf.classify) return null;
    if(!point||point.blinking||point.state==='lost'||point.faceDetected===false) return null;
    if(asNum(point.confidence)<settings.minConfidence) return null;
    var cs=classifierSettings();
    var topo=getTopology();
    if(!topo||!topo.monitors||!topo.monitors.length){
      ensureTopology();
      return null;
    }
    var result=Clf.classify(point, topo, null, cs);
    if(!rt.stability){
      rt.stability=Clf.createStability?Clf.createStability():{monitorId:null,since:0,stableMs:0};
    }
    rt.stability=Clf.updateStability(rt.stability, result, now);
    return Object.assign({},result,{stableMs:rt.stability.stableMs|0});
  }

  function onGazeFrame(point, now){
    now=now!=null?now:Date.now();
    var settings=getSettings();
    if(!settings.enabled) return null;
    if(!rt.dragTimer) startDragPoll();

    var drag=rt.dragState;
    if(!drag||!drag.lmbDown||!drag.isTitleBar){
      updateLiveHint(drag, rt.lastResult);
      return null;
    }

    if(rt.lastFrameAt&&(now-rt.lastFrameAt)<DETECT_INTERVAL_MS){
      if(rt.lastResult) maybeMoveWindow(settings, drag, rt.lastResult, now);
      return rt.lastResult;
    }
    rt.lastFrameAt=now;

    var result=pickGazeResult(point, now, settings);
    if(!result||!result.monitorId){
      // Keep last good target during brief face drop — stops hint flicker + allows move.
      if(rt.lastResult&&rt.lastResult.monitorId){
        updateLiveHint(drag, rt.lastResult);
        maybeMoveWindow(settings, drag, rt.lastResult, now);
        return rt.lastResult;
      }
      updateLiveHint(drag, null);
      return null;
    }

    rt.lastResult=result;
    updateLiveHint(drag, result);
    maybeMoveWindow(settings, drag, result, now);
    return result;
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
    var n=rt.topology&&rt.topology.monitors?rt.topology.monitors.length:0;
    return {
      enabled:true,
      mode:'auto',
      screenCount:n||(base&&base.screenCount?base.screenCount:2),
      layout:'horizontal',
      cameraPosition:base&&base.cameraPosition?base.cameraPosition:'center-top',
      minConfidence:snap.minConfidence,
      assessment:null
    };
  }

  function getTopology(){
    if(rt.topology&&rt.topology.monitors&&rt.topology.monitors.length) return rt.topology;
    var sp=global.OneToneCameraSmartPointer;
    if(sp&&sp.getDebugState){
      var dbg=sp.getDebugState();
      if(dbg&&dbg.topology&&dbg.topology.monitors&&dbg.topology.monitors.length){
        rt.topology=dbg.topology;
        return rt.topology;
      }
    }
    return rt.topology;
  }

  function ensureTopology(){
    var existing=getTopology();
    if(existing&&existing.monitors&&existing.monitors.length>0){
      return Promise.resolve(existing);
    }
    var sp=global.OneToneCameraSmartPointer;
    if(sp&&sp.refreshTopology){
      return sp.refreshTopology().then(function(topo){
        if(topo) rt.topology=topo;
        return getTopology();
      }).catch(function(){ return loadTopologyDirect(); });
    }
    return loadTopologyDirect();
  }

  function loadTopologyDirect(){
    var Topo=global.OneToneCameraGazeMonitorTopology;
    if(!Topo||!Topo.listMonitors) return Promise.resolve(null);
    return Topo.listMonitors({screenCount:3}).then(function(topo){
      rt.topology=topo||null;
      return rt.topology;
    }).catch(function(){
      rt.topology=null;
      return null;
    });
  }

  function ensurePreview(){
    try{
      var pv=global.OneToneCameraPreview;
      if(pv&&pv.startPreview) pv.startPreview({reason:'snap_window'});
      if(pv&&pv.syncLiveLandmarker) pv.syncLiveLandmarker();
    }catch(_){}
  }

  function monitorCount(){
    var topo=getTopology();
    return topo&&topo.monitors?topo.monitors.length|0:0;
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
    var stableMs=stability&&stability.monitorId===result.monitorId
      ?(stability.stableMs|0)
      :(result.stableMs|0);
    if(stableMs<(settings.dwellMs|0)) return false;
    if(drag.monitorId&&drag.monitorId===result.monitorId) return false;
    if(rt.lastMovedHwnd===drag.hwnd&&rt.lastMovedMonitorId===result.monitorId) return false;
    if(now!=null&&rt.lastMoveAt&&(now-rt.lastMoveAt)<settings.cooldownMs) return false;
    return true;
  }

  function updateLiveHint(drag, result){
    if(!isWanted()){
      setHint(t('cameraSnapHintIdle','开启后：按住其他窗口标题栏，看向目标屏即可跳转。不需要麦克风。'));
      return;
    }
    var n=monitorCount();
    if(n<2){
      setHint(t('cameraSnapHintOneScreen','需要至少两块显示器才能移窗。'));
      return;
    }
    if(!drag||!drag.lmbDown){
      setHint(t('cameraSnapHintHold','请按住目标窗口的标题栏不放…'));
      return;
    }
    if(!drag.isTitleBar){
      setHint(t('cameraSnapHintTitle','请按在窗口顶部标题栏区域（不是窗口内容里）。'));
      return;
    }
    if(!result||!result.monitorId){
      setHint(t('cameraSnapHintGaze','保持面部朝向摄像头，看向要移去的那块屏…'));
      return;
    }
    if(drag.monitorId&&drag.monitorId===result.monitorId){
      setHint(t('cameraSnapHintSame','你正在看窗口所在屏，请看向另一块屏。'));
      return;
    }
    var need=getSettings().dwellMs|0;
    var have=rt.stability?rt.stability.stableMs|0:0;
    if(have<need){
      setHint(t('cameraSnapHintDwell','已锁定目标屏，再看一会儿…'));
      return;
    }
    setHint(t('cameraSnapHintReady','准备跳转…'));
  }

  function isTitleBarDragActive(){
    return !!(isWanted() && rt.dragState && rt.dragState.lmbDown && rt.dragState.isTitleBar && rt.dragState.hwnd);
  }

  /** Freeze Smart Pointer cursor warps while Snap is handling a press/drag. */
  function isPointerFrozen(){
    if(!isWanted()) return false;
    if(rt.lockedDrag&&rt.lockedDrag.hwnd) return true;
    if(rt.dragState&&rt.dragState.lmbDown) return true;
    return false;
  }

  function logSnap(msg){
    try{
      if(global.OneToneDom&&global.OneToneDom.log){
        global.OneToneDom.log('[snap] '+msg);
        return;
      }
    }catch(_){}
    try{
      if(global.console&&console.info) console.info('[snap]',msg);
    }catch(__){}
  }

  function ingestDragState(st){
    if(!isWanted()) return null;
    if(!st||!st.lmbDown){
      var was=!!(rt.dragState&&rt.dragState.lmbDown);
      rt.lockedDrag=null;
      rt.dragState=null;
      if(was){
        rt.stability=null;
        rt.lastResult=null;
        rt.lastMovedHwnd=null;
        rt.lastMovedMonitorId=null;
        logSnap('lmb_up clear lock');
      }
      updateLiveHint(null, null);
      return null;
    }

    if(st.isTitleBar&&st.hwnd){
      if(!rt.lockedDrag||rt.lockedDrag.hwnd!==st.hwnd){
        rt.lockedDrag={
          hwnd:st.hwnd,
          monitorId:st.monitorId||'',
          rect:st.rect||null
        };
        logSnap('lock hwnd='+st.hwnd+' mon='+(st.monitorId||'')+' title='+!!st.isTitleBar);
      }else if(st.monitorId){
        rt.lockedDrag.monitorId=st.monitorId;
        if(st.rect) rt.lockedDrag.rect=st.rect;
      }
    }

    var effective=null;
    if(rt.lockedDrag&&rt.lockedDrag.hwnd){
      effective={
        lmbDown:true,
        isTitleBar:true,
        hwnd:rt.lockedDrag.hwnd,
        monitorId:rt.lockedDrag.monitorId||st.monitorId||'',
        rect:st.rect||rt.lockedDrag.rect||null
      };
    }else{
      effective=st;
    }
    rt.dragState=effective;
    if(!effective.isTitleBar){
      rt.stability=null;
      rt.lastResult=null;
    }
    updateLiveHint(effective, rt.lastResult);
    return effective;
  }

  function pollDragState(){
    if(!isWanted()) return;
    invokeIpc('cmd_gaze_drag_state',{}).then(function(st){
      ingestDragState(st);
    }).catch(function(){
      rt.dragState=null;
    });
  }

  function startDragPoll(){
    if(rt.dragTimer) return;
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

  function syncRuntime(){
    if(isWanted()){
      ensurePreview();
      ensureTopology().then(function(topo){
        if(!topo||!topo.monitors||topo.monitors.length<2){
          setHint(t('cameraSnapHintOneScreen','需要至少两块显示器才能移窗。'));
        }else{
          setHint(t('cameraSnapHintHold','请按住目标窗口的标题栏不放…'));
        }
        startDragPoll();
      });
    }else{
      stopDragPoll();
      rt.dragState=null;
      rt.stability=null;
      setHint(t('cameraSnapHintIdle','开启后：按住其他窗口标题栏，看向目标屏即可跳转。不需要麦克风。'));
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
      logSnap('moved hwnd='+hwnd+' -> '+monitorId);
      rt.lastMoveAt=Date.now();
      rt.lastMovedHwnd=hwnd;
      rt.lastMovedMonitorId=monitorId;
      rt.lastAction='moved:'+monitorId;
      if(rt.dragState&&rt.dragState.hwnd===hwnd){
        rt.dragState=Object.assign({},rt.dragState,{monitorId:monitorId});
      }
      if(rt.lockedDrag&&rt.lockedDrag.hwnd===hwnd){
        rt.lockedDrag.monitorId=monitorId;
      }
      rt.stability=null;
      setHint(t('cameraSnapHintMoved','已移到目标屏。可松手，或继续看向其他屏。'));
      toast(t('cameraSnapMovedToast','已移窗'));
      try{ syncUi(); }catch(_){}
    }).catch(function(err){
      logSnap('move_fail '+String((err&&err.message)||err||'unknown'));
      setHint(t('cameraSnapHintMoveFail','移窗失败：{err}').replace('{err}', String((err&&err.message)||err||'unknown')));
    }).then(function(){
      rt.moveInFlight=false;
    });
  }

  function setToggle(id, on){
    var el=$(id);
    if(!el) return;
    el.classList.toggle('is-on',!!on);
    el.setAttribute('aria-checked',on?'true':'false');
  }

  function syncUi(){
    try{
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
    }catch(err){
      logSnap('syncUi_err '+String((err&&err.message)||err||''));
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
        syncRuntime();
        notifyPreviewLandmarker();
      });
    }
  }

  function onPanelVisible(){
    rt.panelVisible=true;
    bindUi();
    syncUi();
    syncRuntime();
    if(isWanted()) notifyPreviewLandmarker();
  }

  function onPanelHidden(){
    rt.panelVisible=false;
  }

  function init(){
    rt.settings=readSettings();
    bindUi();
    syncUi();
    syncRuntime();
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
    isTitleBarDragActive:isTitleBarDragActive,
    isPointerFrozen:isPointerFrozen,
    ingestDragState:ingestDragState,
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
