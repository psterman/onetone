(function(global){
  'use strict';

  /**
   * Pro Glance-class features on the RGB vision chain:
   * Visualizer, Privacy Alert/Guard, Wellness, capability probe UI,
   * Hello-exclusive toggles (gated), multi-screen lab (grayed), deferred cards.
   * Does NOT conflate Windows Hello with multi-face / gaze accuracy.
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

  var ALERT_COOLDOWN_MS=8000;
  var GUARD_COOLDOWN_MS=4000;
  var GUARD_CLEAR_MS=2200;
  var CLOSE_FACE_AREA=0.42;
  var VIS_GOOD_MIN=0.04;
  var VIS_GOOD_MAX=0.38;
  var WELLNESS_TICK_MS=5000;
  var BLINK_RATE_WINDOW_MS=60000;
  var BLINK_LOW_PER_MIN=8;
  var POSTURE_PITCH_ABS=0.42;
  var POSTURE_HOLD_MS=12000;
  var POSTURE_COOLDOWN_MS=90000;
  var BLINK_HEALTH_COOLDOWN_MS=90000;
  /** Cap DOM writes — landmarker can fire 10–30Hz; unthrottled textContent 假死 UI. */
  var UI_SYNC_MIN_MS=280;

  var rt={
    faceCount:0,
    faceArea:0,
    pitch:null,
    visualizer:'idle',
    lastAlertAt:0,
    lastGuardAt:0,
    guardActive:false,
    guardClearSince:0,
    presentAccumMs:0,
    lastWellnessTick:0,
    lastPresentAt:0,
    blinkEvents:[],
    postureBadSince:0,
    lastPostureToastAt:0,
    lastBlinkHealthToastAt:0,
    last2020ToastAt:0,
    probe:null,
    uiBound:false,
    wellnessTimer:0,
    featCache:null,
    lastUiSyncAt:0,
    lastUiFaceCount:-1,
    lastUiVisualizer:'',
    lastUiPrivacyLine:'',
    lastUiWellnessLine:''
  };

  function toast(msg){
    try{
      if(global.OneToneAppToast&&global.OneToneAppToast.show){
        global.OneToneAppToast.show(msg,'lite');
      }
    }catch(_){}
  }

  function stateRoot(){
    return global.OneToneState&&global.OneToneState.state?global.OneToneState.state:{};
  }

  function cameraPrefs(){
    var cfg=stateRoot().config;
    if(!cfg||typeof cfg!=='object') return {};
    if(!cfg.cameraPrefs||typeof cfg.cameraPrefs!=='object') cfg.cameraPrefs={};
    return cfg.cameraPrefs;
  }

  function defaultProFeatures(){
    return {
      privacyAlert:false,
      privacyGuard:false,
      privacySensitivity:'mid',
      visualizer:false,
      wellness2020:false,
      wellness2020Minutes:20,
      wellnessBlink:false,
      wellnessPosture:false,
      helloProtectSettings:false,
      helloUnlockOnReturn:false,
      labSmartPointer:false,
      labSnapWindow:false,
      labSmartDisplay:false
    };
  }

  function normalizeProFeatures(raw){
    var d=defaultProFeatures();
    if(!raw||typeof raw!=='object') return d;
    var sens=String(raw.privacySensitivity||d.privacySensitivity).trim();
    if(sens!=='low'&&sens!=='mid'&&sens!=='high') sens='mid';
    var mins=Number(raw.wellness2020Minutes);
    if(!isFinite(mins)||mins<10) mins=20;
    if(mins>60) mins=60;
    return {
      privacyAlert:!!raw.privacyAlert,
      privacyGuard:!!raw.privacyGuard,
      privacySensitivity:sens,
      visualizer:raw.visualizer===undefined?false:!!raw.visualizer,
      wellness2020:!!raw.wellness2020,
      wellness2020Minutes:mins|0,
      wellnessBlink:!!raw.wellnessBlink,
      wellnessPosture:!!raw.wellnessPosture,
      helloProtectSettings:!!raw.helloProtectSettings,
      helloUnlockOnReturn:!!raw.helloUnlockOnReturn,
      labSmartPointer:false,
      labSnapWindow:false,
      labSmartDisplay:false
    };
  }

  function getProFeatures(){
    if(rt.featCache) return rt.featCache;
    rt.featCache=normalizeProFeatures(cameraPrefs().proFeatures);
    return rt.featCache;
  }

  function persistProFeatures(partial){
    var cp=cameraPrefs();
    var cur=normalizeProFeatures(cp.proFeatures);
    Object.keys(partial||{}).forEach(function(k){
      if(Object.prototype.hasOwnProperty.call(cur,k)) cur[k]=partial[k];
    });
    cur=normalizeProFeatures(cur);
    cp.proFeatures=cur;
    rt.featCache=cur;
    try{
      if(global.OneToneCameraPreview&&global.OneToneCameraPreview.persistCameraPrefs){
        global.OneToneCameraPreview.persistCameraPrefs({proFeatures:cur});
      }else if(global.OneToneConfigPersist&&global.OneToneConfigPersist.saveCameraPrefsQuiet){
        global.OneToneConfigPersist.saveCameraPrefsQuiet();
      }
    }catch(_){}
    return cur;
  }

  function needsVisionFrameWork(feat){
    feat=feat||getProFeatures();
    return !!(feat.visualizer||feat.privacyAlert||feat.privacyGuard||feat.wellnessPosture);
  }

  function faceAreaThreshold(){
    var s=getProFeatures().privacySensitivity;
    if(s==='low') return 0.55;
    if(s==='high') return 0.32;
    return CLOSE_FACE_AREA;
  }

  function multiFaceNeed(){
    var s=getProFeatures().privacySensitivity;
    if(s==='high') return 2;
    return 2;
  }

  function presenceApi(){
    return global.OneToneCameraPresenceActions||null;
  }

  function openPrivacyFromGuard(){
    var api=presenceApi();
    if(api&&api.openPrivacyScreen){
      try{ api.openPrivacyScreen(); }catch(_){}
      return;
    }
    if(api&&api.executeAction){
      try{ api.executeAction('privacyScreen','secondFace'); }catch(_){}
    }
  }

  function closePrivacyFromGuard(){
    var api=presenceApi();
    if(api&&api.setPrivacyOpen){
      try{ api.setPrivacyOpen(false); }catch(_){}
    }
  }

  function updateVisualizerUi(level,detail,force){
    rt.visualizer=level||'idle';
    var el=$('cameraProVisualizerStatus');
    var dot=$('cameraProVisualizerDot');
    var line='';
    if(level==='green') line=t('cameraProVisGreen','最佳范围')+(detail?(' · '+detail):'');
    else if(level==='yellow') line=t('cameraProVisYellow','边缘范围')+(detail?(' · '+detail):'');
    else if(level==='red') line=t('cameraProVisRed','未检测到人脸')+(detail?(' · '+detail):'');
    else line=t('cameraProVisIdle','待命 · 开启预览后显示');
    if(!force&&line===rt.lastUiVisualizer&&level===rt.lastUiVisualizerLevel) return;
    rt.lastUiVisualizer=line;
    rt.lastUiVisualizerLevel=level||'idle';
    if(dot){
      dot.classList.remove('is-green','is-yellow','is-red','is-idle');
      dot.classList.add(level==='green'?'is-green':(level==='yellow'?'is-yellow':(level==='red'?'is-red':'is-idle')));
    }
    if(el) el.textContent=line;
  }

  function computeVisualizer(faceCount,faceArea,forceUi){
    if(!getProFeatures().visualizer){
      updateVisualizerUi('idle','',forceUi);
      return 'idle';
    }
    if(faceCount<=0){
      updateVisualizerUi('red','',forceUi);
      return 'red';
    }
    var detail=t('cameraProVisFaces','{n} 人').replace('{n}',String(faceCount));
    if(faceArea>0&&(faceArea<VIS_GOOD_MIN||faceArea>VIS_GOOD_MAX)){
      updateVisualizerUi('yellow',detail,forceUi);
      return 'yellow';
    }
    updateVisualizerUi('green',detail,forceUi);
    return 'green';
  }

  function onVisionFrame(point){
    if(!point) return;
    var feat=getProFeatures();
    if(!needsVisionFrameWork(feat)&&!rt.guardActive) return;

    var faceCount=Number(point.faceCount);
    if(!isFinite(faceCount)||faceCount<0){
      faceCount=point.faceDetected?1:0;
    }
    var faceArea=Number(point.faceArea);
    if(!isFinite(faceArea)||faceArea<0) faceArea=0;
    var pitch=point.pitch;
    if(pitch!=null&&!isFinite(pitch)) pitch=null;

    rt.faceCount=faceCount|0;
    rt.faceArea=faceArea;
    rt.pitch=pitch;

    var now=performance.now();
    var uiDue=(now-rt.lastUiSyncAt)>=UI_SYNC_MIN_MS
      || rt.faceCount!==rt.lastUiFaceCount
      || !rt.lastUiSyncAt;

    if(feat.visualizer&&uiDue){
      computeVisualizer(rt.faceCount,rt.faceArea,true);
    }

    var multi=rt.faceCount>=multiFaceNeed();
    var tooClose=rt.faceCount>=1&&rt.faceArea>=faceAreaThreshold();

    if(feat.privacyAlert&&multi&&(now-rt.lastAlertAt)>ALERT_COOLDOWN_MS){
      rt.lastAlertAt=now;
      toast(t('cameraProPrivacyAlertToast','检测到可能有旁人 · 请注意屏幕隐私'));
    }

    if(feat.privacyGuard&&(multi||tooClose)){
      rt.guardClearSince=0;
      if(!rt.guardActive){
        rt.lastGuardAt=now;
        rt.guardActive=true;
        openPrivacyFromGuard();
        if(multi) toast(t('cameraProPrivacyGuardToast','隐私卫士：已开启应用内遮罩'));
        else toast(t('cameraProPrivacyGuardCloseToast','隐私卫士：距离过近，已开启遮罩'));
      }else if((now-rt.lastGuardAt)>GUARD_COOLDOWN_MS){
        rt.lastGuardAt=now;
        // Already open — do not re-open / re-toast every cooldown.
      }
    }else if(rt.guardActive){
      if(!rt.guardClearSince) rt.guardClearSince=now;
      if((now-rt.guardClearSince)>=GUARD_CLEAR_MS){
        rt.guardActive=false;
        rt.guardClearSince=0;
        closePrivacyFromGuard();
      }
    }

    if(feat.wellnessPosture&&rt.faceCount===1&&pitch!=null){
      if(Math.abs(pitch)>=POSTURE_PITCH_ABS){
        if(!rt.postureBadSince) rt.postureBadSince=now;
        if((now-rt.postureBadSince)>=POSTURE_HOLD_MS&&(now-rt.lastPostureToastAt)>POSTURE_COOLDOWN_MS){
          rt.lastPostureToastAt=now;
          toast(t('cameraProWellnessPostureToast','坐姿偏离较久，起来活动一下颈椎'));
        }
      }else{
        rt.postureBadSince=0;
      }
    }else{
      rt.postureBadSince=0;
    }

    if(uiDue){
      syncPrivacyStatusLine();
      rt.lastUiSyncAt=now;
      rt.lastUiFaceCount=rt.faceCount;
    }
  }

  function noteBlink(){
    var now=performance.now();
    rt.blinkEvents.push(now);
    var cut=now-BLINK_RATE_WINDOW_MS;
    rt.blinkEvents=rt.blinkEvents.filter(function(ts){ return ts>=cut; });
  }

  function tickWellness(){
    var feat=getProFeatures();
    var now=performance.now();
    var api=presenceApi();
    var present=false;
    try{
      var st=api&&api.getState?api.getState():null;
      present=!!(st&&st.presence==='present');
    }catch(_){}

    if(present){
      if(!rt.lastPresentAt) rt.lastPresentAt=now;
      var dt=now-(rt.lastWellnessTick||now);
      if(dt>0&&dt<WELLNESS_TICK_MS*3) rt.presentAccumMs+=dt;
      rt.lastWellnessTick=now;
    }else{
      rt.lastPresentAt=0;
      rt.lastWellnessTick=now;
    }

    if(feat.wellness2020&&present){
      var need=Math.max(10,feat.wellness2020Minutes|0)*60*1000;
      if(rt.presentAccumMs>=need&&(now-rt.last2020ToastAt)>need){
        rt.last2020ToastAt=now;
        rt.presentAccumMs=0;
        toast(t('cameraProWellness2020Toast','20-20-20：抬头看远处约 20 秒，放松一下眼睛'));
      }
    }

    if(feat.wellnessBlink&&present){
      var cut=now-BLINK_RATE_WINDOW_MS;
      rt.blinkEvents=rt.blinkEvents.filter(function(ts){ return ts>=cut; });
      var perMin=rt.blinkEvents.length;
      if(perMin>0&&perMin<BLINK_LOW_PER_MIN&&(now-rt.lastBlinkHealthToastAt)>BLINK_HEALTH_COOLDOWN_MS){
        rt.lastBlinkHealthToastAt=now;
        toast(t('cameraProWellnessBlinkToast','最近眨眼偏少，记得偶尔眨眨眼'));
      }
    }

    syncWellnessStatusLine();
  }

  function syncPrivacyStatusLine(){
    var el=$('cameraProPrivacyStatus');
    if(!el) return;
    var feat=getProFeatures();
    var parts=[];
    if(feat.privacyAlert) parts.push(t('cameraProPrivacyAlertOn','提醒开'));
    if(feat.privacyGuard) parts.push(t('cameraProPrivacyGuardOn','卫士开'));
    var line;
    if(!parts.length){
      line=t('cameraProPrivacyStatusOff','未启用 · 基于 RGB 视觉主链，不依赖 Hello');
    }else{
      line=parts.join(' · ')+' · '+t('cameraProVisFaces','{n} 人').replace('{n}',String(rt.faceCount||0));
    }
    if(line===rt.lastUiPrivacyLine) return;
    rt.lastUiPrivacyLine=line;
    el.textContent=line;
  }

  function syncWellnessStatusLine(){
    var el=$('cameraProWellnessStatus');
    if(!el) return;
    var feat=getProFeatures();
    var on=[];
    if(feat.wellness2020) on.push('20-20-20');
    if(feat.wellnessBlink) on.push(t('cameraProWellnessBlinkShort','眨眼'));
    if(feat.wellnessPosture) on.push(t('cameraProWellnessPostureShort','坐姿'));
    var line;
    if(!on.length){
      line=t('cameraProWellnessStatusOff','未启用');
    }else{
      var mins=Math.floor((rt.presentAccumMs||0)/60000);
      line=on.join(' · ')+' · '+t('cameraProWellnessPresentMins','在席约 {n} 分钟').replace('{n}',String(mins));
    }
    if(line===rt.lastUiWellnessLine) return;
    rt.lastUiWellnessLine=line;
    el.textContent=line;
  }

  function setToggle(id,on){
    var el=$(id);
    if(!el) return;
    el.classList.toggle('is-on',!!on);
    el.setAttribute('aria-checked',on?'true':'false');
  }

  function readToggle(id){
    var el=$(id);
    return !!(el&&el.classList.contains('is-on'));
  }

  function syncTogglesFromPrefs(){
    rt.featCache=null;
    var f=getProFeatures();
    setToggle('cameraProPrivacyAlertToggle',f.privacyAlert);
    setToggle('cameraProPrivacyGuardToggle',f.privacyGuard);
    setToggle('cameraProVisualizerToggle',f.visualizer);
    setToggle('cameraProWellness2020Toggle',f.wellness2020);
    setToggle('cameraProWellnessBlinkToggle',f.wellnessBlink);
    setToggle('cameraProWellnessPostureToggle',f.wellnessPosture);
    var sens=$('cameraProPrivacySens');
    if(sens) sens.value=f.privacySensitivity||'mid';
    var mins=$('cameraProWellness2020Mins');
    if(mins) mins.value=String(f.wellness2020Minutes||20);
    syncPrivacyStatusLine();
    syncWellnessStatusLine();
  }

  function probeRgbVision(){
    var pv=global.OneToneCameraPreview;
    var devices=0;
    try{
      if(pv&&pv.getDeviceCount) devices=pv.getDeviceCount()|0;
    }catch(_){}
    if(!devices){
      try{
        var sel=$('cameraDeviceSelect');
        if(sel&&sel.options) devices=sel.options.length|0;
      }catch(_){}
    }
    var running=false;
    try{ running=!!(pv&&pv.isRunning&&pv.isRunning()); }catch(_){}
    var land=global.OneToneCameraGazeLandmarker;
    var model=!!(land&&land.ensureReady);
    return {
      available:devices>0||running||model,
      running:running,
      devices:devices,
      reason:devices>0||running?'ok':(model?'no_device_yet':'unknown')
    };
  }

  function applyProbeResult(probe){
    rt.probe=probe||rt.probe;
    syncCapabilityUi();
    syncHelloExclusiveUi();
  }

  function syncCapabilityUi(){
    var rgb=probeRgbVision();
    var probe=rt.probe||{};
    var hello=probe.helloAuth||{available:false,reason:'unchecked'};
    var hps=probe.humanPresence||{available:false,reason:'unchecked'};

    function fill(id,ok,label,detail){
      var el=$(id);
      if(!el) return;
      el.classList.toggle('is-ready',!!ok);
      el.classList.toggle('is-missing',!ok);
      var title=el.querySelector('.camera-pro-cap-probe-title');
      var desc=el.querySelector('.camera-pro-cap-probe-desc');
      if(title) title.textContent=label;
      if(desc) desc.textContent=detail;
    }

    fill('cameraProProbeRgb',rgb.available,
      t('cameraProProbeRgbTitle','A · RGB 视觉链'),
      rgb.running
        ?t('cameraProProbeRgbRunning','预览运行中 · MediaPipe 主链')
        :(rgb.available
          ?t('cameraProProbeRgbReady','可用 · 不依赖 Hello / IR')
          :t('cameraProProbeRgbMissing','未检测到摄像头设备')));

    fill('cameraProProbeHello',!!hello.available,
      t('cameraProProbeHelloTitle','B · Windows Hello 认证'),
      hello.available
        ?t('cameraProProbeHelloReady','系统认证可用 · 不等于 Gaze/多人增强')
        :t('cameraProProbeHelloMissing','不可用或未探测到 · {reason}').replace('{reason}',String(hello.reason||'—')));

    fill('cameraProProbeHps',!!hps.available,
      t('cameraProProbeHpsTitle','C · HumanPresenceSensor'),
      hps.available
        ?t('cameraProProbeHpsReady','设备已暴露存在传感器 · 可作辅助提示')
        :t('cameraProProbeHpsMissing','未暴露或本机无此传感器 · 有 Hello 摄像头也不等于有'));
  }

  function syncHelloExclusiveUi(){
    var wrap=$('cameraProHelloExclusive');
    var helloOk=!!(rt.probe&&rt.probe.helloAuth&&rt.probe.helloAuth.available);
    if(wrap){
      wrap.classList.toggle('is-gated',!helloOk);
      wrap.setAttribute('aria-disabled',helloOk?'false':'true');
    }
    var note=$('cameraProHelloGateNote');
    if(note){
      note.hidden=helloOk;
      note.textContent=t('cameraProHelloGateNote','需要探测 B 为可用后才能开启。Hello 只做认证/解锁协同，不提供 Glance 级 Gaze。');
    }
    ['cameraProHelloProtectToggle','cameraProHelloUnlockToggle'].forEach(function(id){
      var el=$(id);
      if(!el) return;
      el.disabled=!helloOk;
      if(!helloOk){
        el.classList.remove('is-on');
        el.setAttribute('aria-checked','false');
      }
    });
  }

  function syncLabUi(){
    ['cameraProLabSnap','cameraProLabDisplay'].forEach(function(id){
      var el=$(id);
      if(!el) return;
      el.classList.add('is-lab','is-disabled');
      el.setAttribute('aria-disabled','true');
    });
  }

  function syncSmartPointerBridge(){
    try{
      var sp=global.OneToneCameraSmartPointer;
      if(!sp) return;
      var enabled=!!(sp.getSettings&&sp.getSettings().enabled);
      // Mirror into proFeatures for any legacy readers; Snap/Display stay forced off.
      if(rt.featCache) rt.featCache.labSmartPointer=enabled;
      var cp=cameraPrefs();
      if(cp.proFeatures&&typeof cp.proFeatures==='object'){
        cp.proFeatures.labSmartPointer=enabled;
      }
    }catch(_){}
  }

  function refreshProbe(){
    var rgb=probeRgbVision();
    var base={
      rgbVision:rgb,
      helloAuth:{available:false,reason:'pending',method:'invoke'},
      humanPresence:{available:false,reason:'pending',method:'invoke'},
      deviceNameHint:null
    };
    applyProbeResult(base);
    var inv=global.OneToneIpc&&global.OneToneIpc.invoke;
    if(!inv){
      applyProbeResult({
        rgbVision:rgb,
        helloAuth:{available:false,reason:'no_ipc',method:'none'},
        humanPresence:{available:false,reason:'no_ipc',method:'none'}
      });
      return Promise.resolve(rt.probe);
    }
    return inv('cmd_probe_camera_capabilities',{}).then(function(res){
      var data=res&&typeof res==='object'?res:{};
      applyProbeResult({
        rgbVision:rgb,
        helloAuth:data.helloAuth||{available:false,reason:'empty',method:'native'},
        humanPresence:data.humanPresence||{available:false,reason:'empty',method:'native'},
        deviceNameHint:data.deviceNameHint||null
      });
      return rt.probe;
    }).catch(function(){
      applyProbeResult({
        rgbVision:rgb,
        helloAuth:{available:false,reason:'invoke_failed',method:'native'},
        humanPresence:{available:false,reason:'invoke_failed',method:'native'}
      });
      return rt.probe;
    });
  }

  function gateHelloToggle(key,wantOn){
    var helloOk=!!(rt.probe&&rt.probe.helloAuth&&rt.probe.helloAuth.available);
    if(wantOn&&!helloOk){
      toast(t('cameraProHelloNeedProbe','请先完成能力探测，且 B · Hello 认证可用'));
      return false;
    }
    var patch={};
    patch[key]=!!wantOn;
    persistProFeatures(patch);
    return true;
  }

  function bindUi(){
    if(rt.uiBound) return;
    rt.uiBound=true;

    function bindSwitch(id,key,opts){
      var el=$(id);
      if(!el) return;
      el.addEventListener('click',function(e){
        e.preventDefault();
        var next=!el.classList.contains('is-on');
        if(opts&&opts.helloGate){
          if(!gateHelloToggle(key,next)){
            syncTogglesFromPrefs();
            return;
          }
          syncTogglesFromPrefs();
          return;
        }
        var patch={};
        patch[key]=next;
        persistProFeatures(patch);
        setToggle(id,next);
        syncPrivacyStatusLine();
        syncWellnessStatusLine();
        if(key==='visualizer'&&!next) updateVisualizerUi('idle','');
      });
    }

    bindSwitch('cameraProPrivacyAlertToggle','privacyAlert');
    bindSwitch('cameraProPrivacyGuardToggle','privacyGuard');
    bindSwitch('cameraProVisualizerToggle','visualizer');
    bindSwitch('cameraProWellness2020Toggle','wellness2020');
    bindSwitch('cameraProWellnessBlinkToggle','wellnessBlink');
    bindSwitch('cameraProWellnessPostureToggle','wellnessPosture');

    var sens=$('cameraProPrivacySens');
    if(sens){
      sens.addEventListener('change',function(){
        persistProFeatures({privacySensitivity:sens.value||'mid'});
      });
    }
    var mins=$('cameraProWellness2020Mins');
    if(mins){
      mins.addEventListener('change',function(){
        persistProFeatures({wellness2020Minutes:Number(mins.value)||20});
      });
    }
  }

  function startWellnessTimer(){
    if(rt.wellnessTimer) return;
    rt.wellnessTimer=setInterval(tickWellness,WELLNESS_TICK_MS);
  }

  function stopWellnessTimer(){
    if(rt.wellnessTimer){
      clearInterval(rt.wellnessTimer);
      rt.wellnessTimer=0;
    }
  }

  function onPanelVisible(){
    bindUi();
    syncTogglesFromPrefs();
    syncLabUi();
    syncSmartPointerBridge();
    startWellnessTimer();
    // Defer Smart Pointer so settings nav switch stays responsive.
    setTimeout(function(){
      try{
        if(global.OneToneCameraSmartPointer){
          if(global.OneToneCameraSmartPointer.onPanelVisible) global.OneToneCameraSmartPointer.onPanelVisible();
          else if(global.OneToneCameraSmartPointer.init) global.OneToneCameraSmartPointer.init();
        }
      }catch(_){}
    },0);
  }

  function onPanelHidden(){
    stopWellnessTimer();
    try{
      if(global.OneToneCameraSmartPointer&&global.OneToneCameraSmartPointer.onPanelHidden){
        global.OneToneCameraSmartPointer.onPanelHidden();
      }
    }catch(_){}
  }

  function init(){
    bindUi();
    syncTogglesFromPrefs();
    syncLabUi();
    syncSmartPointerBridge();
    try{
      if(global.OneToneCameraSmartPointer&&global.OneToneCameraSmartPointer.init){
        global.OneToneCameraSmartPointer.init();
      }
    }catch(_){}
  }

  /** Optional: require Hello before changing sensitive camera prefs when toggle on. */
  function requireHelloForSensitiveEdit(){
    var f=getProFeatures();
    if(!f.helloProtectSettings) return Promise.resolve({ok:true,skipped:true});
    var helloOk=!!(rt.probe&&rt.probe.helloAuth&&rt.probe.helloAuth.available);
    if(!helloOk){
      toast(t('cameraProHelloProtectBlocked','敏感设置保护已开，但本机 Hello 认证不可用'));
      return Promise.resolve({ok:false,reason:'hello_unavailable'});
    }
    var inv=global.OneToneIpc&&global.OneToneIpc.invoke;
    if(!inv) return Promise.resolve({ok:false,reason:'no_ipc'});
    return inv('cmd_windows_hello_confirm',{reason:'sensitive_settings'}).then(function(res){
      if(res&&res.ok) return res;
      toast(t('cameraProHelloConfirmFailed','系统确认未通过或不可用'));
      return res||{ok:false};
    }).catch(function(){
      toast(t('cameraProHelloConfirmFailed','系统确认未通过或不可用'));
      return {ok:false,reason:'invoke_failed'};
    });
  }

  function onReturnPresent(){
    var f=getProFeatures();
    if(!f.helloUnlockOnReturn) return;
    var helloOk=!!(rt.probe&&rt.probe.helloAuth&&rt.probe.helloAuth.available);
    if(!helloOk) return;
    var inv=global.OneToneIpc&&global.OneToneIpc.invoke;
    if(!inv) return;
    inv('cmd_windows_hello_confirm',{reason:'return_unlock'}).then(function(res){
      if(res&&res.ok) toast(t('cameraProHelloUnlockOk','已完成回席系统确认'));
    }).catch(function(){});
  }

  global.OneToneCameraProGlance={
    init:init,
    onPanelVisible:onPanelVisible,
    onPanelHidden:onPanelHidden,
    onVisionFrame:onVisionFrame,
    onReturnPresent:onReturnPresent,
    noteBlink:noteBlink,
    getProFeatures:getProFeatures,
    normalizeProFeatures:normalizeProFeatures,
    defaultProFeatures:defaultProFeatures,
    persistProFeatures:persistProFeatures,
    refreshProbe:refreshProbe,
    getProbe:function(){ return rt.probe; },
    getRuntime:function(){
      return {
        faceCount:rt.faceCount,
        faceArea:rt.faceArea,
        pitch:rt.pitch,
        visualizer:rt.visualizer,
        guardActive:rt.guardActive
      };
    },
    requireHelloForSensitiveEdit:requireHelloForSensitiveEdit,
    syncUi:syncTogglesFromPrefs
  };
})((typeof window!=='undefined')?window:globalThis);
