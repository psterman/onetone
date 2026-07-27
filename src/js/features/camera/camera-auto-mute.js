(function(global){
  'use strict';

  /**
   * Auto Mute: distance (faceArea proxy → cm) over threshold → mute default mic.
   * Far / beyond screen → mute; close → unmute. User-configurable threshold.
   */

  var DEFAULT_THRESHOLD_CM=55;
  var DEFAULT_HYSTERESIS_CM=6;
  var MIN_DISTANCE_CM=30;
  var MAX_DISTANCE_CM=180;
  var SCENE_MAX_CM=180;
  /** faceArea ≈ k / distanceCm²  → distanceCm ≈ sqrt(k / faceArea) */
  var AREA_SCALE=0.085;

  function defaultAutoMute(){
    return {
      enabled:false,
      showStatus:true,
      thresholdCm:DEFAULT_THRESHOLD_CM,
      thresholdFaceArea:null,
      hysteresisCm:DEFAULT_HYSTERESIS_CM,
      noFaceMute:true,
      proximityMode:'farMute'
    };
  }

  function clamp(v, min, max, fallback){
    var n=Number(v);
    if(!isFinite(n)) n=fallback;
    if(n<min) n=min;
    if(n>max) n=max;
    return n;
  }

  function normalizeAutoMute(raw){
    var d=defaultAutoMute();
    if(!raw||typeof raw!=='object') return d;
    var thrFa=raw.thresholdFaceArea;
    if(thrFa!=null){
      thrFa=Number(thrFa);
      if(!isFinite(thrFa)||thrFa<=0) thrFa=null;
    }else{
      thrFa=null;
    }
    return {
      enabled:!!raw.enabled,
      showStatus:raw.showStatus!==false,
      thresholdCm:Math.round(clamp(raw.thresholdCm,MIN_DISTANCE_CM,MAX_DISTANCE_CM,d.thresholdCm)),
      thresholdFaceArea:thrFa,
      hysteresisCm:Math.round(clamp(raw.hysteresisCm,2,20,d.hysteresisCm)),
      noFaceMute:raw.noFaceMute!==false,
      proximityMode:raw.proximityMode==='nearMute'?'nearMute':'farMute'
    };
  }

  function faceAreaToCm(faceArea, scale){
    var a=Number(faceArea);
    if(!isFinite(a)||a<=0) return SCENE_MAX_CM;
    var k=scale!=null&&isFinite(Number(scale))?Number(scale):AREA_SCALE;
    var cm=Math.sqrt(k/a)*100;
    if(!isFinite(cm)) return SCENE_MAX_CM;
    return Math.max(MIN_DISTANCE_CM,Math.min(SCENE_MAX_CM,cm));
  }

  function cmToFaceArea(cm, scale){
    var d=Number(cm);
    if(!isFinite(d)||d<=0) return 0;
    var k=scale!=null&&isFinite(Number(scale))?Number(scale):AREA_SCALE;
    return k/Math.pow(d/100,2);
  }

  function distanceToScenePct(cm){
    var d=Number(cm);
    if(!isFinite(d)) return 100;
    return Math.max(0,Math.min(100,((d-MIN_DISTANCE_CM)/(SCENE_MAX_CM-MIN_DISTANCE_CM))*100));
  }

  /**
   * Hysteresis decision.
   * @returns {'mute'|'unmute'|'hold'}
   */
  function decideMuteAction(distanceCm, thresholdCm, hysteresisCm, currentlyMuted){
    var dist=Number(distanceCm);
    var thr=Number(thresholdCm);
    var hyst=Number(hysteresisCm);
    if(!isFinite(dist)||!isFinite(thr)) return 'hold';
    if(!isFinite(hyst)||hyst<0) hyst=DEFAULT_HYSTERESIS_CM;
    if(dist>thr){
      return currentlyMuted?'hold':'mute';
    }
    if(dist<(thr-hyst)){
      return currentlyMuted?'unmute':'hold';
    }
    return 'hold';
  }

  function decideMuteActionNear(distanceCm, thresholdCm, hysteresisCm, currentlyMuted){
    var dist=Number(distanceCm);
    var thr=Number(thresholdCm);
    var hyst=Number(hysteresisCm);
    if(!isFinite(dist)||!isFinite(thr)) return 'hold';
    if(!isFinite(hyst)||hyst<0) hyst=DEFAULT_HYSTERESIS_CM;
    if(dist<(thr-hyst)){
      return currentlyMuted?'hold':'mute';
    }
    if(dist>thr){
      return currentlyMuted?'unmute':'hold';
    }
    return 'hold';
  }

  function decideMuteActionByMode(mode, distanceCm, thresholdCm, hysteresisCm, currentlyMuted){
    if(mode==='nearMute'){
      return decideMuteActionNear(distanceCm, thresholdCm, hysteresisCm, currentlyMuted);
    }
    return decideMuteAction(distanceCm, thresholdCm, hysteresisCm, currentlyMuted);
  }

  function effectiveThresholdCm(settings){
    settings=normalizeAutoMute(settings);
    if(settings.thresholdFaceArea!=null&&settings.thresholdFaceArea>0){
      return Math.round(faceAreaToCm(settings.thresholdFaceArea));
    }
    return settings.thresholdCm|0;
  }

  var rt={
    settings:null,
    lastFaceArea:0,
    lastDistanceCm:0,
    hasFace:false,
    mutedByUs:false,
    lastDecideAt:0,
    muteInFlight:false,
    uiBound:false,
    panelVisible:false,
    statusTimer:0,
    draggingThreshold:false
  };

  function micApi(){
    return global.OneToneAppMic||null;
  }

  function currentlyMutedForDecision(){
    var api=micApi();
    if(api&&api.getMicUiState){
      var st=api.getMicUiState();
      if(st.muteKnown) return !!st.muted;
    }
    return !!rt.mutedByUs;
  }

  function setMicMute(muted){
    if(rt.muteInFlight) return Promise.resolve(null);
    rt.muteInFlight=true;
    var api=micApi();
    var p=api&&api.setMicUiMuted
      ?api.setMicUiMuted(!!muted,{source:'autoMute'})
      :invokeIpc('cmd_mic_set_mute',{muted:!!muted}).then(function(st){
        if(st&&api&&api.applyMicMuteState) api.applyMicMuteState(st);
        return st;
      });
    return p.then(function(st){
      rt.mutedByUs=!!muted;
      try{ syncUi(); }catch(_){}
      return st;
    }).catch(function(){
      return null;
    }).then(function(st){
      rt.muteInFlight=false;
      return st;
    });
  }

  function refreshMicState(){
    var api=micApi();
    if(api&&api.refreshMicUiState){
      return api.refreshMicUiState().then(function(){
        try{ syncUi(); }catch(_){}
        return api.getMicUiState?api.getMicUiState():null;
      }).catch(function(){
        return null;
      });
    }
    return invokeIpc('cmd_mic_get_mute',{}).then(function(st){
      if(st&&api&&api.applyMicMuteState) api.applyMicMuteState(st);
      try{ syncUi(); }catch(_){}
      return st;
    }).catch(function(){
      return null;
    });
  }

  function applyDistanceDecision(distanceCm, now){
    now=now!=null?now:Date.now();
    if(rt.lastDecideAt&&(now-rt.lastDecideAt)<200) return;
    rt.lastDecideAt=now;
    var settings=getSettings();
    if(!settings.enabled) return;
    var api=micApi();
    if(api&&api.isMicManualOverrideActive&&api.isMicManualOverrideActive(now)) return;
    var thr=effectiveThresholdCm(settings);
    var action=decideMuteActionByMode(
      settings.proximityMode,
      distanceCm,
      thr,
      settings.hysteresisCm,
      currentlyMutedForDecision()
    );
    if(action==='mute') setMicMute(true);
    else if(action==='unmute') setMicMute(false);
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

  function invokeIpc(cmd, args){
    var inv=global.OneToneIpc&&global.OneToneIpc.invoke;
    if(!inv) return Promise.reject(new Error('no_ipc'));
    return inv(cmd, args||{});
  }

  function readSettings(){
    var st=global.OneToneState&&global.OneToneState.state;
    var cp=st&&st.config&&st.config.cameraPrefs;
    return normalizeAutoMute(cp&&cp.autoMute);
  }

  function writeSettings(next){
    var normalized=normalizeAutoMute(next);
    var st=global.OneToneState&&global.OneToneState.state;
    if(st&&st.config){
      if(!st.config.cameraPrefs||typeof st.config.cameraPrefs!=='object'){
        st.config.cameraPrefs={};
      }
      st.config.cameraPrefs.autoMute=normalized;
    }
    try{
      if(global.OneToneCameraPreview&&global.OneToneCameraPreview.persistCameraPrefs){
        global.OneToneCameraPreview.persistCameraPrefs({autoMute:normalized});
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

  function onGazeFrame(point, now){
    now=now!=null?now:Date.now();
    var settings=getSettings();
    if(!settings.enabled) return null;
    var noFace=!point||point.state==='lost'||point.faceDetected===false;
    if(noFace){
      rt.hasFace=false;
      rt.lastFaceArea=0;
      rt.lastDistanceCm=SCENE_MAX_CM;
      if(settings.proximityMode==='nearMute'||settings.noFaceMute){
        applyDistanceDecision(SCENE_MAX_CM, now);
      }
      syncDistanceUi();
      return {distanceCm:SCENE_MAX_CM,faceArea:0,noFace:true};
    }
    var fa=Number(point.faceArea);
    if(!isFinite(fa)||fa<0) fa=0;
    rt.hasFace=true;
    rt.lastFaceArea=fa;
    var cm=faceAreaToCm(fa);
    rt.lastDistanceCm=cm;
    applyDistanceDecision(cm, now);
    syncDistanceUi();
    return {distanceCm:cm,faceArea:fa,noFace:false};
  }

  function setToggle(id, on){
    var el=$(id);
    if(!el) return;
    el.classList.toggle('is-on',!!on);
    el.setAttribute('aria-checked',on?'true':'false');
  }

  function syncPresetPills(){}

  function syncDistanceUi(){
    var settings=getSettings();
    var nearMute=settings.proximityMode==='nearMute';
    var thr=effectiveThresholdCm(settings);
    var dist=rt.lastDistanceCm;
    var thrPct=distanceToScenePct(thr);
    var distPct=distanceToScenePct(dist);
    var hyst=settings.hysteresisCm|0;

    var valEl=$('cameraAutoMuteThresholdVal');
    if(valEl) valEl.textContent=t('cameraAutoMuteThrFmt','阈值 {n}cm').replace('{n}',String(thr));

    var marker=$('cameraAutoMuteThresholdMarker');
    if(marker){
      marker.style.left=thrPct+'%';
      marker.setAttribute('aria-valuenow',String(thr));
      marker.setAttribute('aria-valuetext',String(thr)+'cm');
    }

    var userDot=$('cameraAutoMuteUserDot');
    if(userDot){
      userDot.style.left=distPct+'%';
      userDot.hidden=!settings.enabled;
      userDot.classList.toggle('is-far',dist>thr);
      userDot.classList.toggle('is-close',dist<=thr);
      userDot.classList.toggle('is-unknown',!rt.hasFace);
    }

    var zoneOpen=$('cameraAutoMuteZoneOpen');
    var zoneMute=$('cameraAutoMuteZoneMute');
    if(zoneOpen) zoneOpen.style.width=thrPct+'%';
    if(zoneMute) zoneMute.style.left=thrPct+'%';
    if(zoneOpen){
      var openSpan=zoneOpen.querySelector('span');
      if(openSpan){
        openSpan.textContent=nearMute
          ?t('cameraAutoMuteZoneMute','静音')
          :t('cameraAutoMuteZoneOpen','开麦');
      }
    }
    if(zoneMute){
      var muteSpan=zoneMute.querySelector('span');
      if(muteSpan){
        muteSpan.textContent=nearMute
          ?t('cameraAutoMuteZoneOpen','开麦')
          :t('cameraAutoMuteZoneMute','静音');
      }
    }

    var scene=$('cameraAutoMuteScene');
    if(scene){
      var micMuted=currentlyMutedForDecision();
      var inMuteZone=nearMute?(dist<(thr-hyst)):(dist>thr);
      var noFaceMuteZone=!rt.hasFace&&!nearMute&&settings.noFaceMute;
      scene.classList.toggle('is-near-mute',nearMute);
      scene.classList.toggle('is-live',!!settings.enabled&&rt.hasFace);
      scene.classList.toggle('is-muted-state',!!settings.enabled&&(micMuted||inMuteZone||noFaceMuteZone));
      scene.classList.toggle('is-dragging',!!rt.draggingThreshold);
    }

    var liveLbl=$('cameraAutoMuteLiveLabel');
    if(liveLbl){
      if(settings.enabled){
        if(rt.hasFace){
          liveLbl.textContent=t('cameraAutoMuteLiveFmt','当前 {n}cm').replace('{n}',String(Math.round(dist)));
          liveLbl.hidden=false;
        }else{
          liveLbl.textContent=t('cameraAutoMuteLiveAway','已离开屏幕');
          liveLbl.hidden=false;
        }
      }else{
        liveLbl.hidden=true;
      }
    }
  }

  function syncUi(){
    var settings=getSettings();
    var nearMute=settings.proximityMode==='nearMute';
    setToggle('cameraAutoMuteToggle', settings.enabled);
    var modeSeg=$('cameraAutoMuteModeSeg');
    if(modeSeg){
      modeSeg.querySelectorAll('[data-am-mode]').forEach(function(btn){
        var mode=btn.getAttribute('data-am-mode');
        var active=mode===settings.proximityMode;
        btn.classList.toggle('is-active',active);
        btn.setAttribute('aria-checked',active?'true':'false');
      });
    }
    var noFaceRow=$('cameraAutoMuteNoFaceRow');
    if(noFaceRow) noFaceRow.hidden=nearMute;
    var noFaceChk=$('cameraAutoMuteNoFaceMute');
    if(noFaceChk) noFaceChk.checked=!!settings.noFaceMute;
    var showChk=$('cameraAutoMuteShowStatus');
    if(showChk) showChk.checked=!!settings.showStatus;
    var statusRow=$('cameraAutoMuteStatusRow');
    if(statusRow) statusRow.hidden=!settings.showStatus;
    var pill=$('cameraAutoMuteMicPill');
    if(pill){
      if(!settings.enabled){
        pill.textContent=t('cameraAutoMuteStatusOff','已关闭');
        pill.className='camera-am-mic-pill';
      }else{
        var micState=micApi()&&micApi().getMicUiState
          ?micApi().getMicUiState()
          :{key:'checking',label:t('micUiMuteChecking','检测中')};
        pill.textContent=micState.label;
        pill.className='camera-am-mic-pill '+(micState.key==='ready'?'is-open':(micState.key==='muted'?'is-muted':'is-warn'));
      }
    }
    var body=$('cameraAutoMuteBody');
    if(body) body.hidden=!settings.enabled;
    syncDistanceUi();
  }

  function notifyPreviewLandmarker(){
    try{
      if(global.OneToneCameraPreview&&global.OneToneCameraPreview.syncLiveLandmarker){
        global.OneToneCameraPreview.syncLiveLandmarker();
      }
    }catch(_){}
  }

  function setThresholdCm(cm, opts){
    opts=opts||{};
    cm=Math.round(clamp(cm,MIN_DISTANCE_CM,MAX_DISTANCE_CM,DEFAULT_THRESHOLD_CM));
    writeSettings(Object.assign({},getSettings(),{
      thresholdCm:cm,
      thresholdFaceArea:cmToFaceArea(cm)
    }));
    if(opts.ui!==false) syncUi();
    else syncDistanceUi();
  }

  function useCurrentDistance(){
    var fa=rt.lastFaceArea;
    var cm=rt.lastDistanceCm;
    if(!(fa>0)&&!(cm>0&&cm<SCENE_MAX_CM)){
      return;
    }
    if(!(fa>0)) fa=cmToFaceArea(cm);
    setThresholdCm(cm||faceAreaToCm(fa));
  }

  function cmFromRailClientX(clientX){
    var rail=$('cameraAutoMuteRail');
    if(!rail) return DEFAULT_THRESHOLD_CM;
    var rect=rail.getBoundingClientRect();
    if(!rect.width) return DEFAULT_THRESHOLD_CM;
    var pct=Math.max(0,Math.min(1,(clientX-rect.left)/rect.width));
    return MIN_DISTANCE_CM+pct*(SCENE_MAX_CM-MIN_DISTANCE_CM);
  }

  function bindThresholdDrag(){
    var rail=$('cameraAutoMuteRail');
    var marker=$('cameraAutoMuteThresholdMarker');
    if(!rail||!marker||marker.dataset.dragBound==='1') return;
    marker.dataset.dragBound='1';

    function applyFromEvent(e){
      var x=e.clientX!=null?e.clientX:(e.touches&&e.touches[0]?e.touches[0].clientX:null);
      if(x==null) return;
      setThresholdCm(cmFromRailClientX(x),{ui:false});
    }

    function onMove(e){
      if(!rt.draggingThreshold) return;
      if(e.cancelable) e.preventDefault();
      applyFromEvent(e);
    }

    function onUp(){
      if(!rt.draggingThreshold) return;
      rt.draggingThreshold=false;
      document.removeEventListener('pointermove',onMove);
      document.removeEventListener('pointerup',onUp);
      document.removeEventListener('pointercancel',onUp);
      document.removeEventListener('touchmove',onMove,{passive:false});
      document.removeEventListener('touchend',onUp);
      syncUi();
    }

    function startDrag(e){
      if(!getSettings().enabled) return;
      rt.draggingThreshold=true;
      applyFromEvent(e);
      document.addEventListener('pointermove',onMove);
      document.addEventListener('pointerup',onUp);
      document.addEventListener('pointercancel',onUp);
      document.addEventListener('touchmove',onMove,{passive:false});
      document.addEventListener('touchend',onUp);
      if(e.cancelable) e.preventDefault();
    }

    marker.addEventListener('pointerdown',startDrag);
    marker.addEventListener('touchstart',startDrag,{passive:false});
    rail.addEventListener('pointerdown',function(e){
      if(e.target===marker||(marker.contains&&marker.contains(e.target))) return;
      startDrag(e);
    });
    marker.addEventListener('keydown',function(e){
      var thr=effectiveThresholdCm(getSettings());
      if(e.key==='ArrowLeft'||e.key==='ArrowDown'){
        e.preventDefault();
        setThresholdCm(thr-2);
      }else if(e.key==='ArrowRight'||e.key==='ArrowUp'){
        e.preventDefault();
        setThresholdCm(thr+2);
      }else if(e.key==='Home'){
        e.preventDefault();
        setThresholdCm(MIN_DISTANCE_CM);
      }else if(e.key==='End'){
        e.preventDefault();
        setThresholdCm(MAX_DISTANCE_CM);
      }
    });
  }

  function bindUi(){
    if(rt.uiBound) return;
    rt.uiBound=true;
    var tog=$('cameraAutoMuteToggle');
    if(tog){
      tog.addEventListener('click',function(){
        var next=!getSettings().enabled;
        writeSettings(Object.assign({},getSettings(),{enabled:next}));
        if(!next&&rt.mutedByUs){
          setMicMute(false).then(function(){ rt.mutedByUs=false; });
        }
        if(next) refreshMicState();
        syncUi();
        notifyPreviewLandmarker();
      });
    }
    var noFaceChk=$('cameraAutoMuteNoFaceMute');
    if(noFaceChk){
      noFaceChk.addEventListener('change',function(){
        writeSettings(Object.assign({},getSettings(),{noFaceMute:!!noFaceChk.checked}));
        syncUi();
      });
    }
    var modeSeg=$('cameraAutoMuteModeSeg');
    if(modeSeg){
      modeSeg.addEventListener('click',function(e){
        var btn=e.target&&e.target.closest?e.target.closest('[data-am-mode]'):null;
        if(!btn) return;
        var mode=btn.getAttribute('data-am-mode');
        if(mode!=='farMute'&&mode!=='nearMute') return;
        writeSettings(Object.assign({},getSettings(),{proximityMode:mode}));
        syncUi();
      });
    }
    var showChk=$('cameraAutoMuteShowStatus');
    if(showChk){
      showChk.addEventListener('change',function(){
        writeSettings(Object.assign({},getSettings(),{showStatus:!!showChk.checked}));
        syncUi();
      });
    }
    bindThresholdDrag();
    var useBtn=$('cameraAutoMuteUseCurrent');
    if(useBtn){
      useBtn.addEventListener('click',function(){ useCurrentDistance(); });
    }
  }

  function startStatusPoll(){
    stopStatusPoll();
    if(!isWanted()) return;
    refreshMicState();
    rt.statusTimer=setInterval(function(){
      if(isWanted()) refreshMicState();
    },2000);
  }

  function stopStatusPoll(){
    if(rt.statusTimer){
      clearInterval(rt.statusTimer);
      rt.statusTimer=0;
    }
  }

  function onPanelVisible(){
    rt.panelVisible=true;
    bindUi();
    syncUi();
    if(isWanted()){
      startStatusPoll();
      notifyPreviewLandmarker();
    }
  }

  function onPanelHidden(){
    rt.panelVisible=false;
    stopStatusPoll();
  }

  function init(){
    rt.settings=readSettings();
    bindUi();
    syncUi();
    if(isWanted()&&rt.panelVisible) startStatusPoll();
  }

  global.OneToneCameraAutoMute={
    AREA_SCALE:AREA_SCALE,
    MIN_DISTANCE_CM:MIN_DISTANCE_CM,
    MAX_DISTANCE_CM:MAX_DISTANCE_CM,
    defaultAutoMute:defaultAutoMute,
    normalizeAutoMute:normalizeAutoMute,
    faceAreaToCm:faceAreaToCm,
    cmToFaceArea:cmToFaceArea,
    distanceToScenePct:distanceToScenePct,
    decideMuteAction:decideMuteAction,
    decideMuteActionByMode:decideMuteActionByMode,
    decideMuteActionNear:decideMuteActionNear,
    applyDistanceDecision:applyDistanceDecision,
    currentlyMutedForDecision:currentlyMutedForDecision,
    setMicMute:setMicMute,
    effectiveThresholdCm:effectiveThresholdCm,
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
