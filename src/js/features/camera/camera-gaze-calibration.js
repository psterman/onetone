(function(global){
  'use strict';

  /**
   * Window-calibrated gaze estimate.
   * Multi-feature ridge regression (socket + blendshape look + head pose),
   * not plain affine on face x/y (which yields huge RMSE).
   * Model persists in cameraPrefs.gazeCalibration (local settings.json).
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

  // Edges near window rim; bottom slightly inset so glasses rim is less likely to hide eyes.
  var EDGE=0.04;
  var EDGE_BOT=0.07;
  var TARGETS=[
    {id:'center',x:0.5,y:0.5},
    {id:'tl',x:EDGE,y:EDGE},
    {id:'tc',x:0.5,y:EDGE},
    {id:'tr',x:1-EDGE,y:EDGE},
    {id:'ml',x:EDGE,y:0.5},
    {id:'mr',x:1-EDGE,y:0.5},
    {id:'bl',x:EDGE,y:1-EDGE_BOT},
    {id:'bc',x:0.5,y:1-EDGE_BOT},
    {id:'br',x:1-EDGE,y:1-EDGE_BOT}
  ];
  var TARGET_HINTS={
    center:['cameraGazeCalibCenter','请读大字：屏幕正中'],
    tl:['cameraGazeCalibTL','请转头看左上 · 读头+左转'],
    tc:['cameraGazeCalibTC','请抬头看上方中央'],
    tr:['cameraGazeCalibTR','请转头看右上 · 抬头+右转'],
    ml:['cameraGazeCalibML','请左转头看左侧'],
    mr:['cameraGazeCalibMR','请右转头看右侧'],
    bl:['cameraGazeCalibBL','请点头看左下 · 低头+左转（镜框挡眼时靠点头）'],
    bc:['cameraGazeCalibBC','请点头看下方（镜框挡眼时靠点头）'],
    br:['cameraGazeCalibBR','请点头看右下 · 低头+右转（镜框挡眼时靠点头）']
  };
  var karaokePicker=null;
  function karaokeApi(){
    return global.OneToneGazeKaraoke||null;
  }
  function getKaraokePicker(){
    if(!karaokePicker){
      var api=karaokeApi();
      karaokePicker=api&&api.createPicker?api.createPicker():null;
    }
    return karaokePicker;
  }
  function pickKaraokeForTarget(target){
    var zone=target&&target.id?String(target.id):'center';
    var picker=getKaraokePicker();
    if(picker&&picker.forZone) return picker.forZone(zone);
    return t('cameraGazeCalibReadCenter','屏幕正中 · 读这行字');
  }
  function normalizeCalibMode(mode){
    return mode==='fine'?'fine':'fast';
  }
  function getTargetsForMode(mode){
    var ids=TARGET_SETS[normalizeCalibMode(mode)]||TARGET_SETS.fast;
    var out=[];
    for(var i=0;i<ids.length;i++){
      for(var j=0;j<TARGETS.length;j++){
        if(TARGETS[j].id===ids[i]){
          out.push(TARGETS[j]);
          break;
        }
      }
    }
    return out;
  }
  function qualityRemedialLimit(){
    return currentCalibMode==='fine'?1:0;
  }
  function activeTargetCount(){
    return activeTargets&&activeTargets.length?activeTargets.length:TARGET_SETS.fast.length;
  }
  function toastLite(msg){
    try{
      if(global.OneToneAppToast&&global.OneToneAppToast.show){
        global.OneToneAppToast.show(msg,'lite');
      }
    }catch(_){}
  }
  var SAMPLE_SEC=1.4;
  var SAMPLE_SEC_CORNER=2.0;
  var SAMPLE_SEC_EDGE=2.2;
  var SAMPLE_SEC_TOP=2.4;
  var PREPARE_SEC=1.2;
  var PREPARE_SEC_CORNER=1.6;
  var PREPARE_SEC_EDGE=1.8;
  var PREPARE_SEC_TOP=2.0;
  var MIN_CALIB_POINTS_FAST=4;
  var MIN_CALIB_POINTS_FINE=6;
  function minCalibPointsForMode(mode){
    return normalizeCalibMode(mode)==='fine'?MIN_CALIB_POINTS_FINE:MIN_CALIB_POINTS_FAST;
  }
  function minCalibPoints(){
    return minCalibPointsForMode(currentCalibMode);
  }
  var MAX_POINT_ATTEMPTS=2;
  var MIN_SAMPLES=6;
  var MIN_CONF=0.35;
  var STABLE_STD=0.095;
  var RIDGE=1e-4;
  var FEAT_DIM=8; // matches landmarker feats length
  // Pose + eye features only (no raw rx/ry — they stay near center at corner gaze).
  var SPATIAL_DIM=12;
  var IDW_POWER=2.8;
  var IDW_TEMP=0.12; // softmax temperature (lower = sharper corner pick)
  var IDW_POWER_APPLY=2.1;
  var IDW_TEMP_APPLY=0.16;
  var GRID_COLS=[EDGE,0.5,1-EDGE];
  var GRID_ROWS=[EDGE,0.5,1-EDGE_BOT];
  var GRID_CELL_IDS=[
    ['tl','tc','tr'],
    ['ml','center','mr'],
    ['bl','bc','br']
  ];
  var GRID_TRIANGLES=[
    ['tl','tc','center'],['tc','tr','center'],['tr','mr','center'],['mr','br','center'],
    ['br','bc','center'],['bc','bl','center'],['bl','ml','center'],['ml','tl','center']
  ];
  var GRID_MIN_POINTS=7;
  var IDW_ASSIST_MAX=0.1;
  var FEAT_SMOOTH_ALPHA_EYE=0.42;
  var FEAT_SMOOTH_ALPHA_BLEND=0.34;
  var FEAT_SMOOTH_ALPHA_POSE=0.16;
  var APPLY_OUT_ALPHA=0.48;
  var APPLY_OUT_ALPHA_FAST=0.72;
  var CRITICAL_CORNER_IDS=['tl','tr','bl','br'];
  var REMEDIAL_TARGET_ORDER=['tl','tr','bl','br','tc','ml','mr','bc','center'];
  var MAX_CORNER_ATTEMPTS=3;
  var MAX_REMEDIAL_ROUNDS=1;
  var TARGET_SETS={
    fast:['center','tl','tr','bl','br'],
    fine:['center','tl','tc','tr','ml','mr','bl','bc','br']
  };
  var currentCalibMode='fast';
  var activeTargets=[];
  var WEAK_MAX_SAMPLES=40;
  var WEAK_MAX_AGE_MS=7*24*60*60*1000;
  var WEAK_REFIT_DEBOUNCE_MS=3500;
  var WEAK_MIN_INTERVAL_CLICK_MS=800;
  var WEAK_MIN_INTERVAL_LOCK_MS=800;
  var WEAK_MIN_CONF=0.45;
  var WEAK_WEIGHT_CLICK=0.22;
  var WEAK_WEIGHT_LOCK=0.30;
  var WEAK_HOVER_ENABLED=false;
  var weakClickEnabled=false; // default off — opt-in via UI

  var model=null; // {betaX,betaY,rmse,vw,vh,lowQuality,stale,kind:'ridge',deviceId,resKey}
  var running=false;
  var cancelled=false;
  var sampleBuf=[];
  var collecting=false;
  var lastRaw=null;
  var bound=false;
  var statusKind='idle';
  var timers=[];
  var samplePump=0;
  var skippedPoints=0;
  var calibAcceptedSamples=0;
  var calibGen=0;
  var calibWaitRaf=0;
  var currentFixation={nx:0.5,ny:0.5,cx:0,cy:0};
  var calibWaitResolve=null;
  var calibWaitState=null;
  var featSmooth=null;
  var applyOutSmooth={cx:null,cy:null};
  var weakRefitTimer=0;
  var weakLastSampleAt=0;
  var weakClickBound=false;
  var calibPoseRef=null; // {yaw,pitch} from center sample
  var lastSampleFailReason='';

  function resetRuntimeSmoothers(){
    featSmooth=null;
    applyOutSmooth.cx=null;
    applyOutSmooth.cy=null;
  }

  function resetCalibPoseRef(){
    calibPoseRef=null;
    lastSampleFailReason='';
  }

  function calibLog(msg){
    var line='[camera-calib] '+String(msg||'');
    if(global.OneToneDom&&global.OneToneDom.log){
      try{ global.OneToneDom.log(line); }catch(_){}
    }else if(global.console&&console.log){
      console.log(line);
    }
  }

  function setLandmarkerThrottle(on){
    var lm=global.OneToneCameraGazeLandmarker;
    if(lm&&lm.setDetectIntervalMs){
      try{ lm.setDetectIntervalMs(on?80:33); }catch(_){}
    }
  }

  function stopCalibWait(){
    if(calibWaitRaf){
      cancelAnimationFrame(calibWaitRaf);
      calibWaitRaf=0;
    }
    if(calibWaitResolve){
      var done=calibWaitResolve;
      calibWaitResolve=null;
      calibWaitState=null;
      done();
    }
  }

  function clearTimers(){
    stopCalibWait();
    for(var i=0;i<timers.length;i++){
      try{ clearTimeout(timers[i]); }catch(_){}
      try{ clearInterval(timers[i]); }catch(_){}
    }
    timers=[];
  }

  function later(ms,fn){
    var id=setTimeout(fn,ms);
    timers.push(id);
    return id;
  }

  function waitCountdownSec(seconds,tickFn,gen){
    return new Promise(function(resolve){
      stopCalibWait();
      if(cancelled||!running||gen!==calibGen){
        resolve();
        return;
      }
      var total=Math.max(0,Number(seconds)||0);
      if(total<=0){
        if(typeof tickFn==='function') tickFn(0);
        resolve();
        return;
      }
      var endAt=Date.now()+total*1000;
      calibWaitResolve=resolve;
      calibWaitState={gen:gen,tickFn:tickFn,endAt:endAt};
      function frame(){
        if(cancelled||!running||gen!==calibGen||!calibWaitState){
          stopCalibWait();
          return;
        }
        var leftMs=calibWaitState.endAt-Date.now();
        var leftSec=Math.max(0,Math.ceil(leftMs/1000));
        if(calibWaitState.tickFn) calibWaitState.tickFn(leftSec);
        if(leftMs<=0){
          stopCalibWait();
          return;
        }
        calibWaitRaf=requestAnimationFrame(frame);
      }
      if(typeof tickFn==='function') tickFn(total);
      calibWaitRaf=requestAnimationFrame(frame);
    });
  }

  function targetHint(target){
    var id=target&&target.id;
    var pair=TARGET_HINTS[id?id:'center']||TARGET_HINTS.center;
    var hint=t(pair[0],pair[1]);
    if(isTopTarget(id)){
      hint+=' · '+t('cameraGazeCalibrationHeadHintUp','上方请抬头+转头');
    }else if(isBottomTarget(id)){
      hint+=' · '+t('cameraGazeCalibrationHeadHintNod','下方请点头，镜框挡眼时靠头姿');
    }else if(isCriticalCorner(id)){
      hint+=' · '+t('cameraGazeCalibrationHeadHint','边角处请微微转头');
    }
    return hint;
  }

  function regionZoneFromNorm(nx,ny){
    nx=clamp01(nx);
    ny=clamp01(ny);
    // Slightly wider edge bands so corners/sides are easier to "hit".
    var col=nx<0.36?'l':(nx>0.64?'r':'c');
    var row=ny<0.36?'t':(ny>0.64?'b':'m');
    var map={
      lt:'tl',ct:'tc',rt:'tr',
      lm:'ml',cm:'center',rm:'mr',
      lb:'bl',cb:'bc',rb:'br'
    };
    return map[col+row]||'center';
  }

  function regionCenterNorm(zoneId){
    var id=String(zoneId||'center');
    var map={
      tl:{nx:0.14,ny:0.14},tc:{nx:0.5,ny:0.12},tr:{nx:0.86,ny:0.14},
      ml:{nx:0.12,ny:0.5},center:{nx:0.5,ny:0.5},mr:{nx:0.88,ny:0.5},
      bl:{nx:0.14,ny:0.86},bc:{nx:0.5,ny:0.88},br:{nx:0.86,ny:0.86}
    };
    return map[id]||map.center;
  }

  function softSnapToRegion(nx,ny,blend){
    var zone=regionZoneFromNorm(nx,ny);
    var c=regionCenterNorm(zone);
    var fine=isFineGridModel();
    var b=blend!=null?blend:(fine?0.14:0.28);
    // Poor formal LOO — snap a bit harder, but keep chase usable.
    if(model&&model.lowQuality) b=Math.max(b,fine?0.24:0.40);
    if(model&&model.calibrationValidation&&model.calibrationValidation.worstErrorPx>450){
      b=Math.max(b,fine?0.30:0.48);
    }
    return {
      nx:clamp01(nx*(1-b)+c.nx*b),
      ny:clamp01(ny*(1-b)+c.ny*b),
      zone:zone
    };
  }

  function regionZoneLabel(zoneId){
    var id=String(zoneId||'center');
    var key='cameraGazeRegion'+id.charAt(0).toUpperCase()+id.slice(1);
    if(id==='center') key='cameraGazeRegionCenter';
    var fallbacks={
      tl:'左上',tc:'上中',tr:'右上',
      ml:'左中',center:'正中',mr:'右中',
      bl:'左下',bc:'下中',br:'右下'
    };
    return t(key,fallbacks[id]||id);
  }

  function targetReadText(target){
    return pickKaraokeForTarget(target);
  }

  function setCalibKaraokeProgress(p){
    p=Math.max(0,Math.min(1,Number(p)||0));
    var charsEl=$('cameraGazeCalibKaraokeChars');
    var meter=$('cameraGazeCalibKaraokeMeter');
    if(meter) meter.style.width=(p*100).toFixed(1)+'%';
    if(!charsEl) return;
    var nodes=charsEl.querySelectorAll('.camera-gaze-karaoke-ch');
    var n=nodes.length;
    if(!n) return;
    var lit=p*n;
    for(var i=0;i<n;i++){
      var on=i<lit;
      var head=on&&i>=lit-1;
      nodes[i].classList.toggle('is-lit',on);
      nodes[i].classList.toggle('is-head',head);
    }
  }

  function paintCalibKaraoke(text){
    var charsEl=$('cameraGazeCalibKaraokeChars');
    var line=String(text||'');
    if(!charsEl){
      var readEl=$('cameraGazeCalibrationRead');
      if(readEl) readEl.textContent=line;
      return;
    }
    // Skip rebuild when the same line is already painted.
    if(charsEl.getAttribute('data-line')===line&&charsEl.childNodes.length){
      return;
    }
    var html='';
    for(var i=0;i<line.length;i++){
      var ch=line.charAt(i);
      if(ch===' '){
        html+='<span class="camera-gaze-karaoke-ch is-space">&nbsp;</span>';
      }else{
        html+='<span class="camera-gaze-karaoke-ch">'+ch.replace(/</g,'&lt;')+'</span>';
      }
    }
    charsEl.innerHTML=html;
    charsEl.setAttribute('data-line',line);
    setCalibKaraokeProgress(0);
  }

  function setCalibrationUi(opts){
    var o=opts&&typeof opts==='object'?opts:{};
    var titleEl=$('cameraGazeCalibrationTitle');
    var progressEl=$('cameraGazeCalibrationProgress');
    var countdownEl=$('cameraGazeCalibrationCountdown');
    if(titleEl){
      if(o.title!=null){
        var title=String(o.title||'');
        titleEl.textContent=title;
        if(title){
          titleEl.hidden=false;
          titleEl.removeAttribute('hidden');
        }else{
          titleEl.hidden=true;
          titleEl.setAttribute('hidden','');
        }
      }
    }
    if(progressEl&&o.subtitle!=null) progressEl.textContent=String(o.subtitle);
    if(o.read!=null) paintCalibKaraoke(o.read);
    if(o.karaokeP!=null) setCalibKaraokeProgress(o.karaokeP);
    if(countdownEl){
      // Karaoke fill replaces the big countdown number.
      countdownEl.textContent='';
      countdownEl.hidden=true;
      countdownEl.setAttribute('hidden','');
    }
    var overlay=$('cameraGazeCalibrationOverlay');
    if(overlay&&o.phase){
      overlay.setAttribute('data-calib-phase',String(o.phase));
    }
  }

  function setProgress(text){
    setCalibrationUi({subtitle:text||''});
  }

  function clamp(v,lo,hi){
    v=Number(v);
    if(!isFinite(v)) return lo;
    if(v<lo) return lo;
    if(v>hi) return hi;
    return v;
  }

  function clamp01(v){ return clamp(v,0,1); }

  function setStatusKind(kind){
    statusKind=kind;
    var el=$('cameraGazeCalibrationStatus');
    if(el){
      var map={
        idle:['cameraGazeCalibrationIdle','未校准'],
        running:['cameraGazeCalibrationRunning','请看向目标点'],
        ready:['cameraGazeCalibrationReady','校准完成'],
        low:['cameraGazeCalibrationLowQuality','校准完成，但精度较低'],
        failed:['cameraGazeCalibrationFailed','有效样本不足，请重试'],
        canceled:['cameraGazeCalibrationCanceled','校准已取消'],
        stale:['cameraGazeCalibrationStale','窗口尺寸变化，请重新校准']
      };
      var pair=map[kind]||map.idle;
      el.textContent=t(pair[0],pair[1]);
      var glance=$('cameraGlanceCalib');
      if(glance) glance.textContent=el.textContent;
    }
    syncCalibrateBtnLabel();
    syncProCalibStatusUi();
  }

  function syncCalibrateBtnLabel(){
    var btn=$('cameraGazeCalibrateBtn');
    var fineBtn=$('cameraGazeCalibrateFineBtn');
    var proBtn=$('cameraProCalibrateBtn');
    var proFine=$('cameraProCalibrateFineBtn');
    var labels=running
      ? t('cameraGazeCalibrating','校准中…')
      :(model?t('cameraGazeRecalibrate','重新校准'):t('cameraGazeCalibrate','开始校准'));
    var fineLabel=running
      ? t('cameraGazeCalibrating','校准中…')
      : t('cameraGazeCalibrateFine','精细校准');
    function paint(el,text){
      if(!el) return;
      el.textContent=text;
      el.disabled=!!running;
    }
    paint(btn,labels);
    paint(fineBtn,fineLabel);
    paint(proBtn,labels);
    paint(proFine,fineLabel);
    var proClear=$('cameraProClearCalibBtn');
    var proRecenter=$('cameraProRecenterBtn');
    if(proClear) proClear.disabled=!!running;
    if(proRecenter) proRecenter.disabled=!!running;
  }

  function syncProCalibStatusUi(){
    var pill=$('cameraProCalibStatusPill');
    var textEl=$('cameraProCalibStatusText');
    if(!textEl&&!pill) return;
    var label=t('cameraGazeCalibrationIdle','未校准');
    var cls='';
    if(running){
      label=t('cameraGazeCalibrating','校准中…');
    }else if(model){
      if(model.stale){
        label=t('cameraGazeCalibrationStale','窗口尺寸变化，请重新校准');
        cls='is-low';
      }else if(model.lowQuality){
        label=t('cameraGazeCalibrationLowQuality','校准完成，但精度较低');
        cls='is-low';
      }else if(isFineGridModel()){
        label=t('cameraGazeMapModeFineReady','精细校准完成 · 更细区域');
        cls='is-ready';
      }else{
        label=t('cameraGazeMapModeFastReady','快校完成 · 粗区域');
        cls='is-ready';
      }
    }
    if(textEl) textEl.textContent=label;
    if(pill){
      pill.classList.toggle('is-ready',cls==='is-ready');
      pill.classList.toggle('is-low',cls==='is-low');
      pill.classList.toggle('is-on',false);
    }
  }

  function setOverlayVisible(show){
    var overlay=$('cameraGazeCalibrationOverlay');
    if(!overlay) return;
    if(show){
      overlay.hidden=false;
      overlay.removeAttribute('hidden');
      overlay.classList.add('is-active');
      overlay.setAttribute('aria-hidden','false');
    }else{
      overlay.hidden=true;
      overlay.setAttribute('hidden','');
      overlay.classList.remove('is-active');
      overlay.setAttribute('aria-hidden','true');
    }
  }

  function measureReadFixation(){
    var readEl=$('cameraGazeCalibrationRead');
    var vw=global.innerWidth||1;
    var vh=global.innerHeight||1;
    if(!readEl||!readEl.getBoundingClientRect){
      return null;
    }
    var r=readEl.getBoundingClientRect();
    if(!r.width||!r.height) return null;
    var cx=r.left+r.width/2;
    var cy=r.top+r.height/2;
    return {
      nx:clamp01(cx/vw),
      ny:clamp01(cy/vh),
      cx:cx,
      cy:cy
    };
  }

  function placeTarget(nx,ny){
    var overlay=$('cameraGazeCalibrationOverlay');
    var px=(clamp01(nx)*100).toFixed(2)+'%';
    var py=(clamp01(ny)*100).toFixed(2)+'%';
    if(overlay){
      overlay.style.setProperty('--spot-x',px);
      overlay.style.setProperty('--spot-y',py);
      var panel=overlay.querySelector('.camera-gaze-calibration-panel');
      if(panel){
        var vw=global.innerWidth||1;
        var vh=global.innerHeight||1;
        var sx=clamp01(nx)*vw;
        var sy=clamp01(ny)*vh;
        var panelW=panel.offsetWidth||Math.min(420,vw*0.72);
        var panelH=panel.offsetHeight||140;
        // Anchor panel to screen corner/edge; user reads text here (not a separate dot).
        var margin=14;
        var col=nx<0.33?'left':(nx>0.67?'right':'mid');
        var row=ny<0.33?'top':(ny>0.67?'bot':'mid');
        var left,top;
        if(col==='left') left=margin;
        else if(col==='right') left=vw-panelW-margin;
        else left=sx-panelW/2;
        if(row==='top') top=margin;
        else if(row==='bot') top=vh-panelH-margin;
        else top=sy-panelH/2;
        left=clamp(left,10,Math.max(10,vw-panelW-10));
        top=clamp(top,10,Math.max(10,vh-panelH-10));
        panel.setAttribute('data-anchor',col+'-'+row);
        panel.style.left=Math.round(left)+'px';
        panel.style.top=Math.round(top)+'px';
        panel.style.bottom='auto';
        panel.style.transform='none';
      }
      var fix=measureReadFixation();
      if(fix){
        currentFixation=fix;
        overlay.style.setProperty('--spot-x',(fix.nx*100).toFixed(2)+'%');
        overlay.style.setProperty('--spot-y',(fix.ny*100).toFixed(2)+'%');
      }
    }
    return currentFixation;
  }

  function isSampleAcceptable(point){
    if(!point) return false;
    var st=String(point.state||'');
    if(st==='lost'||st==='idle') return false;
    var conf=Number(point.confidence);
    if(!isFinite(conf)) return false;
    if(st==='low-confidence') return conf>=0.30;
    if(st!=='tracking'&&st!=='live') return false;
    return conf>=MIN_CONF;
  }

  function pushSampleFromPoint(point){
    if(!collecting||!isSampleAcceptable(point)) return;
    calibAcceptedSamples++;
    var feats=normalizeFeats(point.feats);
    sampleBuf.push({
      x:clamp01(point.x),
      y:clamp01(point.y),
      confidence:clamp01(point.confidence),
      feats:feats
    });
  }

  function normalizeFeats(feats){
    var out=[];
    for(var i=0;i<FEAT_DIM;i++){
      var v=feats&&feats[i]!=null?Number(feats[i]):0;
      out.push(isFinite(v)?v:0);
    }
    return out;
  }

  function spatialFeats(feats){
    var f=normalizeFeats(feats);
    // f[4]=yaw, f[5]=pitch — amplify for head-led corner mapping (glasses-friendly).
    var yaw=f[4],pitch=f[5];
    return [
      f[0],f[1],f[2],f[3],
      yaw,pitch,f[6],f[7],
      yaw*pitch,
      f[0]*f[2],
      f[1]*f[3],
      yaw*yaw,
      pitch*pitch
    ];
  }

  function spatialFeatureRow(feats){
    return [1].concat(spatialFeats(feats));
  }

  function buildFeatScaler(anchors){
    var means=[];
    var stds=[];
    for(var d=0;d<SPATIAL_DIM;d++){
      var vals=[];
      for(var i=0;i<anchors.length;i++){
        vals.push(anchors[i].ext[d]);
      }
      var mean=trimmedMean(vals);
      var varsum=0;
      for(var j=0;j<vals.length;j++){
        var diff=vals[j]-mean;
        varsum+=diff*diff;
      }
      var std=Math.sqrt(varsum/Math.max(1,vals.length));
      means.push(mean);
      stds.push(std<1e-4?1:std);
    }
    return {means:means,stds:stds};
  }

  function scaledFeatDist(ext,anchorExt,scaler){
    var d=0;
    for(var i=0;i<SPATIAL_DIM;i++){
      var diff=(ext[i]-anchorExt[i])/scaler.stds[i];
      d+=diff*diff;
    }
    return Math.sqrt(d/SPATIAL_DIM);
  }

  function featureRow(feats){
    return spatialFeatureRow(feats);
  }

  function startSamplePump(onTick){
    if(samplePump) return;
    samplePump=setInterval(function(){
      if(!collecting||!running) return;
      var candidate=lastRaw;
      var lm=global.OneToneCameraGazeLandmarker;
      if((!candidate||!isSampleAcceptable(candidate))&&lm&&lm.getLastPoint){
        candidate=lm.getLastPoint();
      }
      if(!candidate||!isSampleAcceptable(candidate)) return;
      pushSampleFromPoint(candidate);
      if(typeof onTick==='function') onTick(sampleBuf.length);
    },33);
  }

  function stopSamplePump(){
    if(samplePump){
      clearInterval(samplePump);
      samplePump=0;
    }
  }

  function trimmedMean(arr){
    if(!arr||!arr.length) return 0;
    var a=arr.slice().sort(function(u,v){ return u-v; });
    if(a.length<4){
      var mid=Math.floor(a.length/2);
      return a.length%2?a[mid]:(a[mid-1]+a[mid])/2;
    }
    var cut=Math.max(1,Math.floor(a.length*0.15));
    var slice=a.slice(cut,a.length-cut);
    if(!slice.length) slice=a;
    var sum=0;
    for(var i=0;i<slice.length;i++) sum+=slice[i];
    return sum/slice.length;
  }

  /** Confidence-weighted mean after dropping high/low outliers by value. */
  function weightedRobustMean(samples,axis){
    if(!samples||!samples.length) return 0;
    var vals=samples.map(function(s){ return axis==='x'?s.x:s.y; });
    var sorted=vals.slice().sort(function(a,b){ return a-b; });
    var cut=samples.length>=6?Math.max(1,Math.floor(samples.length*0.15)):0;
    var lo=sorted[cut];
    var hi=sorted[sorted.length-1-cut];
    var sum=0,wsum=0;
    for(var i=0;i<samples.length;i++){
      var v=vals[i];
      if(v<lo||v>hi) continue;
      var w=0.35+0.65*clamp01(samples[i].confidence);
      sum+=v*w;
      wsum+=w;
    }
    if(wsum<1e-6) return trimmedMean(vals);
    return sum/wsum;
  }

  function featMean(samples){
    var out=[];
    for(var d=0;d<FEAT_DIM;d++){
      var vals=[];
      for(var i=0;i<samples.length;i++){
        var f=samples[i].feats;
        vals.push(f&&f[d]!=null?Number(f[d]):0);
      }
      out.push(trimmedMean(vals));
    }
    return out;
  }

  function featStdMax(samples){
    if(!samples||samples.length<2) return 1;
    var mean=featMean(samples);
    // Stability on eye socket + iris offset — not blendshape look (changes when glancing).
    var dims=[0,1,6,7];
    var worst=0;
    for(var di=0;di<dims.length;di++){
      var d=dims[di];
      var acc=0;
      for(var i=0;i<samples.length;i++){
        var f=samples[i].feats;
        var v=f&&f[d]!=null?Number(f[d]):0;
        var diff=v-mean[d];
        acc+=diff*diff;
      }
      worst=Math.max(worst,Math.sqrt(acc/samples.length));
    }
    return worst;
  }

  /** Solve n×n linear system via Gaussian elimination with partial pivoting. */
  function solveN(A,rhs){
    var n=rhs.length;
    var M=[];
    for(var i=0;i<n;i++){
      M[i]=A[i].slice();
      M[i].push(rhs[i]);
    }
    for(var col=0;col<n;col++){
      var piv=col;
      for(var r=col+1;r<n;r++){
        if(Math.abs(M[r][col])>Math.abs(M[piv][col])) piv=r;
      }
      if(Math.abs(M[piv][col])<1e-12) return null;
      if(piv!==col){
        var tmp=M[col];M[col]=M[piv];M[piv]=tmp;
      }
      var div=M[col][col];
      for(var c=col;c<=n;c++) M[col][c]/=div;
      for(var r2=0;r2<n;r2++){
        if(r2===col) continue;
        var f=M[r2][col];
        for(var c2=col;c2<=n;c2++) M[r2][c2]-=f*M[col][c2];
      }
    }
    var x=[];
    for(var k=0;k<n;k++) x[k]=M[k][n];
    return x;
  }

  function predictClient(beta,feats){
    if(!beta||!beta.length) return NaN;
    var row=spatialFeatureRow(feats);
    var n=Math.min(beta.length,row.length);
    var s=0;
    for(var i=0;i<n;i++) s+=beta[i]*row[i];
    return s;
  }

  function predictFromAnchors(ext,anchors,scaler,opts){
    if(!anchors||!anchors.length||!scaler) return null;
    var soft=!!(opts&&opts.soft);
    var temp=opts&&opts.temp!=null?Number(opts.temp):(soft?IDW_TEMP_APPLY:IDW_TEMP);
    var power=opts&&opts.power!=null?Number(opts.power):(soft?IDW_POWER_APPLY:IDW_POWER);
    var exclude=opts&&opts.exclude!=null?Number(opts.exclude):-1;
    var eps=1e-4;
    var sumW=0,cx=0,cy=0;
    var maxLogit=-1e9;
    var logits=[];
    for(var i=0;i<anchors.length;i++){
      if(i===exclude) continue;
      var dist=scaledFeatDist(ext,anchors[i].ext,scaler);
      var logit=-dist/Math.max(1e-4,temp);
      logits.push({i:i,logit:logit});
      if(logit>maxLogit) maxLogit=logit;
    }
    if(!logits.length) return null;
    for(var k=0;k<logits.length;k++){
      var a=anchors[logits[k].i];
      var w=Math.exp(logits[k].logit-maxLogit);
      // Blend softmax with inverse-distance for sharper corners.
      var dist=scaledFeatDist(ext,a.ext,scaler);
      w=w*(1/(Math.pow(dist+eps,power)));
      sumW+=w;
      cx+=w*a.cx;
      cy+=w*a.cy;
    }
    if(sumW<1e-12) return null;
    return {cx:cx/sumW,cy:cy/sumW};
  }

  function evalAnchorRmse(anchors,scaler){
    if(!anchors||anchors.length<2) return 1e9;
    var sse=0,n=0;
    for(var i=0;i<anchors.length;i++){
      var pred=predictFromAnchors(anchors[i].ext,anchors,scaler,{exclude:i,temp:IDW_TEMP*1.15});
      if(!pred) continue;
      var dx=pred.cx-anchors[i].cx;
      var dy=pred.cy-anchors[i].cy;
      sse+=dx*dx+dy*dy;
      n++;
    }
    return n?Math.sqrt(sse/n):1e9;
  }

  function evalRidgeLooRmse(pairs){
    if(!pairs||pairs.length<2) return 1e9;
    var sse=0,n=0;
    for(var i=0;i<pairs.length;i++){
      var held=pairs[i];
      var train=[];
      for(var j=0;j<pairs.length;j++){
        if(j!==i) train.push(pairs[j]);
      }
      var ridge=fitRidge(train);
      if(!ridge) continue;
      var px=predictClient(ridge.betaX,held.feats);
      var py=predictClient(ridge.betaY,held.feats);
      var dx=px-held.cx,dy=py-held.cy;
      sse+=dx*dx+dy*dy;
      n++;
    }
    return n?Math.sqrt(sse/n):1e9;
  }

  function gridColumnBand(nx){
    nx=Number(nx);
    if(nx<0.31) return 'left';
    if(nx>0.69) return 'right';
    return 'mid';
  }

  function gridRowBand(ny){
    ny=Number(ny);
    if(ny<0.31) return 'top';
    if(ny>0.69) return 'bot';
    return 'mid';
  }

  function gridTopologyEligible(pairs,minPoints){
    if(!pairs||pairs.length<(minPoints!=null?minPoints:GRID_MIN_POINTS)) return false;
    var cols={left:false,mid:false,right:false};
    var rows={top:false,mid:false,bot:false};
    for(var i=0;i<pairs.length;i++){
      var p=pairs[i];
      cols[gridColumnBand(p.nx!=null?p.nx:0.5)]=true;
      rows[gridRowBand(p.ny!=null?p.ny:0.5)]=true;
    }
    return cols.left&&cols.mid&&cols.right&&rows.top&&rows.mid&&rows.bot;
  }

  function gridTopologyEligibleAnchors(anchors){
    if(!anchors||anchors.length<GRID_MIN_POINTS) return false;
    return gridTopologyEligible(anchors.map(function(a){
      return {nx:a.nx!=null?a.nx:0.5,ny:a.ny!=null?a.ny:0.5};
    }));
  }

  function featSmoothAlphaForDim(dim){
    if(dim===4||dim===5) return FEAT_SMOOTH_ALPHA_POSE;
    if(dim===2||dim===3) return FEAT_SMOOTH_ALPHA_BLEND;
    return FEAT_SMOOTH_ALPHA_EYE;
  }

  function smoothRuntimeFeats(feats){
    var f=normalizeFeats(feats);
    if(!featSmooth){
      featSmooth=f.slice();
      return f;
    }
    for(var i=0;i<FEAT_DIM;i++){
      var a=featSmoothAlphaForDim(i);
      featSmooth[i]+=(f[i]-featSmooth[i])*a;
    }
    return featSmooth.slice();
  }

  function smoothApplyOutput(cx,cy,vw,vh,holdPos){
    if(applyOutSmooth.cx==null||applyOutSmooth.cy==null){
      applyOutSmooth.cx=cx;
      applyOutSmooth.cy=cy;
      return {cx:cx,cy:cy};
    }
    // Blink hold: freeze both axes (X-only freeze still let the orb drift right).
    if(holdPos){
      return {cx:applyOutSmooth.cx,cy:applyOutSmooth.cy};
    }
    var jump=Math.abs(cx-applyOutSmooth.cx)+Math.abs(cy-applyOutSmooth.cy);
    var span=Math.min(vw||1,vh||1);
    var base=isFineGridModel()?0.62:0.52;
    var alpha=jump>span*0.14?Math.max(base,APPLY_OUT_ALPHA_FAST):base;
    var nx=cx/(vw||1),ny=cy/(vh||1);
    var edgeDist=Math.min(nx,1-nx,ny,1-ny);
    if(edgeDist<0.14) alpha=Math.max(alpha,0.78);
    if(edgeDist<0.06) alpha=0.92;
    applyOutSmooth.cx+=(cx-applyOutSmooth.cx)*alpha;
    applyOutSmooth.cy+=(cy-applyOutSmooth.cy)*alpha;
    return {cx:applyOutSmooth.cx,cy:applyOutSmooth.cy};
  }

  function buildGridLookup(anchors){
    var map={};
    for(var i=0;i<anchors.length;i++){
      var a=anchors[i];
      if(a.targetId) map[a.targetId]=a;
      else{
        for(var r=0;r<GRID_CELL_IDS.length;r++){
          for(var c=0;c<GRID_CELL_IDS[r].length;c++){
            var id=GRID_CELL_IDS[r][c];
            var tx=GRID_COLS[c],ty=GRID_ROWS[r];
            if(Math.abs(a.nx-tx)<0.06&&Math.abs(a.ny-ty)<0.06){
              map[id]=a;
              break;
            }
          }
        }
      }
    }
    return map;
  }

  function gridPosForId(id){
    for(var r=0;r<GRID_CELL_IDS.length;r++){
      for(var c=0;c<GRID_CELL_IDS[r].length;c++){
        if(GRID_CELL_IDS[r][c]===id) return {row:r,col:c};
      }
    }
    return null;
  }

  function gridNodeAt(lookup,row,col){
    if(row<0||row>2||col<0||col>2) return null;
    var id=GRID_CELL_IDS[row][col];
    return lookup[id]||null;
  }

  function makeSynthGridNode(id,nx,ny,cx,cy){
    return {
      targetId:id,nx:nx,ny:ny,cx:cx,cy:cy,synthetic:true
    };
  }

  function trySynthesizeGridNode(id,lookup){
    var pos=gridPosForId(id);
    if(!pos) return null;
    var row=pos.row,col=pos.col;
    var nx=GRID_COLS[col],ny=GRID_ROWS[row];
    var left=gridNodeAt(lookup,row,col-1);
    var right=gridNodeAt(lookup,row,col+1);
    var up=gridNodeAt(lookup,row-1,col);
    var down=gridNodeAt(lookup,row+1,col);
    var center=lookup.center;
    var tl=lookup.tl,tr=lookup.tr,bl=lookup.bl,br=lookup.br;

    if(left&&right){
      return makeSynthGridNode(id,nx,ny,(left.cx+right.cx)/2,(left.cy+right.cy)/2);
    }
    if(up&&down){
      return makeSynthGridNode(id,nx,ny,(up.cx+down.cx)/2,(up.cy+down.cy)/2);
    }
    if(left&&up&&center){
      return makeSynthGridNode(id,nx,ny,left.cx+up.cx-center.cx,left.cy+up.cy-center.cy);
    }
    if(right&&up&&center){
      return makeSynthGridNode(id,nx,ny,right.cx+up.cx-center.cx,right.cy+up.cy-center.cy);
    }
    if(left&&down&&center){
      return makeSynthGridNode(id,nx,ny,left.cx+down.cx-center.cx,left.cy+down.cy-center.cy);
    }
    if(right&&down&&center){
      return makeSynthGridNode(id,nx,ny,right.cx+down.cx-center.cx,right.cy+down.cy-center.cy);
    }
    if(id==='center'&&tl&&tr&&bl&&br){
      return makeSynthGridNode(id,nx,ny,(tl.cx+tr.cx+bl.cx+br.cx)/4,(tl.cy+tr.cy+bl.cy+br.cy)/4);
    }
    if(id==='tc'&&tl&&tr){
      return makeSynthGridNode(id,nx,ny,(tl.cx+tr.cx)/2,(tl.cy+tr.cy)/2);
    }
    if(id==='bc'&&bl&&br){
      return makeSynthGridNode(id,nx,ny,(bl.cx+br.cx)/2,(bl.cy+br.cy)/2);
    }
    if(id==='ml'&&tl&&bl){
      return makeSynthGridNode(id,nx,ny,(tl.cx+bl.cx)/2,(tl.cy+bl.cy)/2);
    }
    if(id==='mr'&&tr&&br){
      return makeSynthGridNode(id,nx,ny,(tr.cx+br.cx)/2,(tr.cy+br.cy)/2);
    }
    return null;
  }

  function ensureFullGridLookup(anchors){
    var lookup=buildGridLookup(anchors);
    for(var pass=0;pass<12;pass++){
      var changed=false;
      for(var r=0;r<GRID_CELL_IDS.length;r++){
        for(var c=0;c<GRID_CELL_IDS[r].length;c++){
          var id=GRID_CELL_IDS[r][c];
          if(lookup[id]) continue;
          var syn=trySynthesizeGridNode(id,lookup);
          if(syn){
            lookup[id]=syn;
            changed=true;
          }
        }
      }
      if(!changed) break;
    }
    return lookup;
  }

  function barycentricInUv(u,v,p0,p1,p2){
    var u0=p0.nx,v0=p0.ny,u1=p1.nx,v1=p1.ny,u2=p2.nx,v2=p2.ny;
    var denom=(v1-v2)*(u0-u2)+(u2-u1)*(v0-v2);
    if(Math.abs(denom)<1e-9) return null;
    var w0=((v1-v2)*(u-u2)+(u2-u1)*(v-v2))/denom;
    var w1=((v2-v0)*(u-u2)+(u0-u2)*(v-v2))/denom;
    var w2=1-w0-w1;
    if(w0<-0.02||w1<-0.02||w2<-0.02) return null;
    return {w0:w0,w1:w1,w2:w2};
  }

  function uvToPixelTriangle(u,v,lookup){
    for(var i=0;i<GRID_TRIANGLES.length;i++){
      var tri=GRID_TRIANGLES[i];
      var p0=lookup[tri[0]],p1=lookup[tri[1]],p2=lookup[tri[2]];
      if(!p0||!p1||!p2) continue;
      var bc=barycentricInUv(u,v,p0,p1,p2);
      if(!bc) continue;
      var synthN=(p0.synthetic?1:0)+(p1.synthetic?1:0)+(p2.synthetic?1:0);
      return {
        cx:bc.w0*p0.cx+bc.w1*p1.cx+bc.w2*p2.cx,
        cy:bc.w0*p0.cy+bc.w1*p1.cy+bc.w2*p2.cy,
        method:'tri',
        synthN:synthN
      };
    }
    return null;
  }

  function cellSyntheticCount(lookup,ids){
    var n=0;
    for(var i=0;i<ids.length;i++){
      var p=lookup[ids[i]];
      if(p&&p.synthetic) n++;
    }
    return n;
  }

  function buildGridBetas(pairs){
    var betaU=fitRidgeScalar(pairs,'nx');
    var betaV=fitRidgeScalar(pairs,'ny');
    if(!betaU||!betaV) return null;
    return {betaU:betaU,betaV:betaV};
  }

  function softClamp01(x,margin){
    margin=margin!=null?margin:0.08;
    x=Number(x);
    if(!isFinite(x)) return 0.5;
    if(x<0) return margin*(1-Math.exp(x/margin));
    if(x>1) return 1-margin*(1-Math.exp((1-x)/margin));
    return x;
  }

  function gridFoldPenalty(m){
    if(!m||!m.betaU||!m.betaV||!m.anchors||m.anchors.length<3) return 0;
    if(typeof m._foldPenalty==='number') return m._foldPenalty;
    var worst=0;
    var rowBands=['top','mid','bot'];
    var colBands=['left','mid','right'];
    for(var ri=0;ri<rowBands.length;ri++){
      var rowPts=[];
      for(var i=0;i<m.anchors.length;i++){
        var a=m.anchors[i];
        if(gridRowBand(a.ny)===rowBands[ri]) rowPts.push(a);
      }
      if(rowPts.length<2) continue;
      rowPts.sort(function(u,v){ return u.nx-v.nx; });
      var proj=rowPts.map(function(a){
        return predictClient(m.betaU,a.feats);
      });
      for(var j=1;j<proj.length;j++){
        if(proj[j]+1e-4<proj[j-1]) worst=Math.max(worst,proj[j-1]-proj[j]);
      }
    }
    for(var ci=0;ci<colBands.length;ci++){
      var colPts=[];
      for(var k=0;k<m.anchors.length;k++){
        var b=m.anchors[k];
        if(gridColumnBand(b.nx)===colBands[ci]) colPts.push(b);
      }
      if(colPts.length<2) continue;
      colPts.sort(function(u,v){ return u.ny-v.ny; });
      var projY=colPts.map(function(a){
        return predictClient(m.betaV,a.feats);
      });
      for(var j2=1;j2<projY.length;j2++){
        if(projY[j2]+1e-4<projY[j2-1]) worst=Math.max(worst,projY[j2-1]-projY[j2]);
      }
    }
    m._foldPenalty=clamp(worst,0,1);
    return m._foldPenalty;
  }

  function projectToUv(feats,rx,ry,m){
    if(!m||!m.betaU||!m.betaV) return null;
    var rawU=predictClient(m.betaU,feats);
    var rawV=predictClient(m.betaV,feats);
    if(!isFinite(rawU)||!isFinite(rawV)) return null;
    var fold=gridFoldPenalty(m);
    var u=softClamp01(rawU);
    var v=softClamp01(rawV);
    var margin=0.12;
    var outOfBounds=rawU<-margin||rawU>1+margin||rawV<-margin||rawV>1+margin;
    var edgeDist=Math.min(u,1-u,v,1-v);
    var confidence=clamp01(0.35+0.55*edgeDist-0.45*fold-(outOfBounds?0.25:0));
    return {u:u,v:v,rawU:rawU,rawV:rawV,confidence:confidence,outOfBounds:outOfBounds,fold:fold};
  }

  function findGridCellIndex(val,grid){
    for(var i=0;i<grid.length-1;i++){
      var mid=(grid[i]+grid[i+1])/2;
      if(val<mid) return i;
    }
    return grid.length-2;
  }

  function uvCellIndex(u,v){
    return {
      col:findGridCellIndex(u,GRID_COLS),
      row:findGridCellIndex(v,GRID_ROWS)
    };
  }

  function uvToPixel(u,v,anchors){
    var lookup=ensureFullGridLookup(anchors);
    var cell=uvCellIndex(u,v);
    var col=cell.col,row=cell.row;
    var id00=GRID_CELL_IDS[row][col];
    var id10=GRID_CELL_IDS[row][col+1];
    var id01=GRID_CELL_IDS[row+1][col];
    var id11=GRID_CELL_IDS[row+1][col+1];
    var cornerIds=[id00,id10,id01,id11];
    var p00=lookup[id00],p10=lookup[id10],p01=lookup[id01],p11=lookup[id11];
    if(p00&&p10&&p01&&p11){
      var u0=GRID_COLS[col],u1=GRID_COLS[col+1];
      var v0=GRID_ROWS[row],v1=GRID_ROWS[row+1];
      var du=u1-u0,dv=v1-v0;
      if(Math.abs(du)>=1e-6&&Math.abs(dv)>=1e-6){
        var s=clamp((u-u0)/du,0,1);
        var t=clamp((v-v0)/dv,0,1);
        return {
          cx:(1-s)*(1-t)*p00.cx+s*(1-t)*p10.cx+(1-s)*t*p01.cx+s*t*p11.cx,
          cy:(1-s)*(1-t)*p00.cy+s*(1-t)*p10.cy+(1-s)*t*p01.cy+s*t*p11.cy,
          method:'bilinear',
          synthN:cellSyntheticCount(lookup,cornerIds)
        };
      }
    }
    return uvToPixelTriangle(u,v,lookup);
  }

  function predictGrid(feats,rx,ry,ext,m,vw,vh){
    var uv=projectToUv(feats,rx,ry,m);
    if(!uv) return null;
    var pix=uvToPixel(uv.u,uv.v,m.anchors);
    if(!pix) return null;
    var conf=uv.confidence;
    if(pix.synthN>0) conf=clamp01(conf-0.06*pix.synthN);
    if(uv.confidence<0.52&&m.scaler&&m.anchors&&m.anchors.length){
      var idw=predictFromAnchors(ext,m.anchors,m.scaler,{soft:true});
      if(idw){
        var blend=clamp01((0.52-uv.confidence)/0.52)*IDW_ASSIST_MAX;
        pix.cx=pix.cx*(1-blend)+idw.cx*blend;
        pix.cy=pix.cy*(1-blend)+idw.cy*blend;
      }
    }
    pix.confidence=conf;
    return pix;
  }

  function buildGridSubModel(pairs,anchors){
    var betas=buildGridBetas(pairs);
    if(!betas) return null;
    var sub={
      anchors:anchors,
      scaler:buildFeatScaler(anchors),
      betaU:betas.betaU,
      betaV:betas.betaV
    };
    gridFoldPenalty(sub);
    return sub;
  }

  function evalGridLooRmse(pairs){
    if(!gridTopologyEligible(pairs)||pairs.length<5) return 1e9;
    var sse=0,n=0;
    for(var i=0;i<pairs.length;i++){
      var held=pairs[i];
      var train=[];
      for(var j=0;j<pairs.length;j++){
        if(j!==i) train.push(pairs[j]);
      }
      if(train.length<5) continue;
      var trainAnchors=train.map(function(p){
        return {
          feats:normalizeFeats(p.feats),
          ext:spatialFeats(p.feats),
          rx:clamp01(p.rx),ry:clamp01(p.ry),
          nx:clamp01(p.nx),ny:clamp01(p.ny),
          targetId:p.targetId||'',
          cx:p.cx,cy:p.cy
        };
      });
      var sub=buildGridSubModel(train,trainAnchors);
      if(!sub) continue;
      var vw=global.innerWidth||1;
      var vh=global.innerHeight||1;
      var pred=predictGrid(held.feats,held.rx,held.ry,spatialFeats(held.feats),sub,vw,vh);
      if(!pred) continue;
      var dx=pred.cx-held.cx,dy=pred.cy-held.cy;
      sse+=dx*dx+dy*dy;
      n++;
    }
    return n?Math.sqrt(sse/n):1e9;
  }

  function evalLooRmse(kind,pairs,anchors,scaler){
    if(kind==='ridge') return evalRidgeLooRmse(pairs);
    if(kind==='grid') return evalGridLooRmse(pairs);
    return evalAnchorRmse(anchors,scaler);
  }

  function qualityFromRmse(rmsePx,thr){
    if(!isFinite(rmsePx)||rmsePx>=1e8) return 'poor';
    if(rmsePx<=thr*0.7) return 'good';
    if(rmsePx<=thr) return 'ok';
    return 'poor';
  }

  function expectedSamplesForPoints(successfulPointCount){
    var n=Math.max(0,Number(successfulPointCount)||0);
    var ticksPerPoint=Math.floor(SAMPLE_SEC*1000/33);
    return n*ticksPerPoint;
  }

  function evalKindLooPointErrors(kind,pairs,anchors,scaler){
    var errors=[];
    var vw=global.innerWidth||1;
    var vh=global.innerHeight||1;
    var i,j;
    if(kind==='ridge'){
      if(!pairs||pairs.length<2) return errors;
      for(i=0;i<pairs.length;i++){
        var heldR=pairs[i];
        var trainR=[];
        for(j=0;j<pairs.length;j++){
          if(j!==i) trainR.push(pairs[j]);
        }
        if(trainR.length<2) continue;
        var ridge=fitRidge(trainR);
        if(!ridge) continue;
        var px=predictClient(ridge.betaX,heldR.feats);
        var py=predictClient(ridge.betaY,heldR.feats);
        var dxR=px-heldR.cx,dyR=py-heldR.cy;
        errors.push({
          targetId:heldR.targetId||('p'+i),
          errorPx:Math.sqrt(dxR*dxR+dyR*dyR),
          cx:heldR.cx,cy:heldR.cy
        });
      }
      return errors;
    }
    if(kind==='grid'){
      if(!gridTopologyEligible(pairs)||pairs.length<5) return errors;
      for(i=0;i<pairs.length;i++){
        var heldG=pairs[i];
        var trainG=[];
        for(j=0;j<pairs.length;j++){
          if(j!==i) trainG.push(pairs[j]);
        }
        if(trainG.length<5) continue;
        var trainAnchorsG=trainG.map(function(p){
          return {
            feats:normalizeFeats(p.feats),
            ext:spatialFeats(p.feats),
            rx:clamp01(p.rx),ry:clamp01(p.ry),
            nx:clamp01(p.nx),ny:clamp01(p.ny),
            targetId:p.targetId||'',
            cx:p.cx,cy:p.cy
          };
        });
        var subG=buildGridSubModel(trainG,trainAnchorsG);
        if(!subG) continue;
        var predG=predictGrid(heldG.feats,heldG.rx,heldG.ry,spatialFeats(heldG.feats),subG,vw,vh);
        if(!predG) continue;
        var dxG=predG.cx-heldG.cx,dyG=predG.cy-heldG.cy;
        errors.push({
          targetId:heldG.targetId||('p'+i),
          errorPx:Math.sqrt(dxG*dxG+dyG*dyG),
          cx:heldG.cx,cy:heldG.cy
        });
      }
      return errors;
    }
    if(!anchors||anchors.length<2) return errors;
    for(i=0;i<anchors.length;i++){
      var predI=predictFromAnchors(anchors[i].ext,anchors,scaler,{exclude:i,temp:IDW_TEMP*1.15});
      if(!predI) continue;
      var dxI=predI.cx-anchors[i].cx,dyI=predI.cy-anchors[i].cy;
      errors.push({
        targetId:anchors[i].targetId||('a'+i),
        errorPx:Math.sqrt(dxI*dxI+dyI*dyI),
        cx:anchors[i].cx,cy:anchors[i].cy
      });
    }
    return errors;
  }

  function normalizeCalibrationValidation(raw){
    if(!raw||typeof raw!=='object') return null;
    var method=String(raw.method||'').trim();
    if(method!=='leave-one-out') method='leave-one-out';
    var rmsePx=Number(raw.rmsePx!=null?raw.rmsePx:raw.rmse);
    if(!isFinite(rmsePx)) rmsePx=0;
    var avgErrorPx=Number(raw.avgErrorPx);
    if(!isFinite(avgErrorPx)) avgErrorPx=rmsePx;
    var maxErrorPx=Number(raw.maxErrorPx);
    if(!isFinite(maxErrorPx)) maxErrorPx=rmsePx;
    var validPointCount=Math.max(0,Number(raw.validPointCount)||0)|0;
    var acceptedSamples=Math.max(0,Number(raw.acceptedSamples)||0)|0;
    var sampleRate=Number(raw.sampleRate);
    if(!isFinite(sampleRate)) sampleRate=0;
    sampleRate=clamp01(sampleRate);
    var quality=String(raw.quality||'').trim();
    if(quality!=='good'&&quality!=='ok'&&quality!=='poor'){
      quality=qualityFromRmse(rmsePx,rmseThreshold());
    }
    return {
      method:method,
      avgErrorPx:avgErrorPx,
      rmsePx:rmsePx,
      maxErrorPx:maxErrorPx,
      worstTargetId:raw.worstTargetId?String(raw.worstTargetId):null,
      worstErrorPx:isFinite(Number(raw.worstErrorPx))?Number(raw.worstErrorPx):null,
      validPointCount:validPointCount,
      acceptedSamples:acceptedSamples,
      sampleRate:sampleRate,
      quality:quality
    };
  }

  function buildCalibrationValidation(kind,pairs,anchors,scaler,acceptedSamples){
    var errors=evalKindLooPointErrors(kind,pairs,anchors,scaler);
    var thr=rmseThreshold();
    var validPointCount=errors.length;
    var sse=0,sum=0,maxErr=0,worstId='',worstErr=0;
    for(var i=0;i<errors.length;i++){
      var e=errors[i].errorPx;
      if(!isFinite(e)) continue;
      sum+=e;
      sse+=e*e;
      if(e>maxErr) maxErr=e;
      if(e>worstErr){
        worstErr=e;
        worstId=String(errors[i].targetId||'');
      }
    }
    var avgErrorPx=validPointCount?sum/validPointCount:0;
    var rmsePx=validPointCount?Math.sqrt(sse/validPointCount):0;
    var expected=expectedSamplesForPoints(pairs?pairs.length:0);
    var sampleRate=clamp01((Number(acceptedSamples)||0)/Math.max(1,expected));
    var quality=qualityFromRmse(rmsePx,thr);
    calibLog('calibrationValidation method=leave-one-out kind='+kind+
      ' rmse='+Math.round(rmsePx)+' avg='+Math.round(avgErrorPx)+
      ' max='+Math.round(maxErr)+' quality='+quality+
      ' worst='+(worstId||'?')+'@'+Math.round(worstErr)+
      ' sampleRate='+sampleRate.toFixed(2)+' accepted='+acceptedSamples+' expected='+expected);
    return {
      method:'leave-one-out',
      avgErrorPx:avgErrorPx,
      rmsePx:rmsePx,
      maxErrorPx:maxErr,
      worstTargetId:worstId||null,
      worstErrorPx:worstErr||null,
      validPointCount:validPointCount,
      acceptedSamples:Math.max(0,Number(acceptedSamples)||0)|0,
      sampleRate:sampleRate,
      quality:quality
    };
  }

  function ridgeLambda(Sw,nSamples){
    var dim=SPATIAL_DIM+1;
    var base=RIDGE*Math.max(1,Sw);
    // LOO folds have fewer points than features — need stronger regularization.
    if(nSamples<dim*2) base=Math.max(base,0.02*Math.max(1,Sw));
    if(nSamples<=dim) base=Math.max(base,0.15*Math.max(1,Sw));
    return base;
  }

  function fitRidgeScalar(pairs,key){
    var dim=SPATIAL_DIM+1;
    var AtA=[];
    var Atb=[];
    var i,j,k;
    for(i=0;i<dim;i++){
      AtA[i]=[];
      for(j=0;j<dim;j++) AtA[i][j]=0;
      Atb[i]=0;
    }
    var Sw=0;
    for(k=0;k<pairs.length;k++){
      var p=pairs[k];
      var w=p.weight!=null?Math.max(0.2,Number(p.weight)):1;
      var row=spatialFeatureRow(p.feats);
      var target=clamp01(p[key]!=null?p[key]:0.5);
      Sw+=w;
      for(i=0;i<dim;i++){
        Atb[i]+=w*row[i]*target;
        for(j=0;j<dim;j++) AtA[i][j]+=w*row[i]*row[j];
      }
    }
    var lam=ridgeLambda(Sw,pairs.length);
    for(i=0;i<dim;i++) AtA[i][i]+=lam;
    var beta=solveN(AtA,Atb);
    return betasFinite(beta)?beta:null;
  }

  function fitRidge(pairs){
    // Weighted ridge on spatial eye/pose features (no raw rx/ry).
    var dim=SPATIAL_DIM+1;
    var AtA=[];
    var Atx=[];
    var Aty=[];
    var i,j,k;
    for(i=0;i<dim;i++){
      AtA[i]=[];
      for(j=0;j<dim;j++) AtA[i][j]=0;
      Atx[i]=0;
      Aty[i]=0;
    }
    var Sw=0;
    for(k=0;k<pairs.length;k++){
      var p=pairs[k];
      var w=p.weight!=null?Math.max(0.2,Number(p.weight)):1;
      var row=spatialFeatureRow(p.feats);
      Sw+=w;
      for(i=0;i<dim;i++){
        Atx[i]+=w*row[i]*p.cx;
        Aty[i]+=w*row[i]*p.cy;
        for(j=0;j<dim;j++) AtA[i][j]+=w*row[i]*row[j];
      }
    }
    var lam=ridgeLambda(Sw,pairs.length);
    for(i=0;i<dim;i++) AtA[i][i]+=lam;
    var betaX=solveN(AtA,Atx);
    var betaY=solveN(AtA,Aty);
    if(!betaX||!betaY||!betasFinite(betaX)||!betasFinite(betaY)) return null;
    var sse=0,wSum=0;
    for(k=0;k<pairs.length;k++){
      var q=pairs[k];
      var ww=q.weight!=null?Math.max(0.2,Number(q.weight)):1;
      var px=predictClient(betaX,q.feats);
      var py=predictClient(betaY,q.feats);
      var dx=px-q.cx,dy=py-q.cy;
      sse+=ww*(dx*dx+dy*dy);
      wSum+=ww;
    }
    return {
      betaX:betaX,
      betaY:betaY,
      rmse:Math.sqrt(sse/Math.max(1e-6,wSum)),
      kind:'ridge'
    };
  }

  function prepareModelPairs(pairs){
    var deduped=[];
    var seen={};
    for(var pi=pairs.length-1;pi>=0;pi--){
      var p=pairs[pi];
      var tid=p.targetId||('p'+pi);
      if(seen[tid]) continue;
      seen[tid]=true;
      deduped.unshift(p);
    }
    pairs=deduped;
    var anchors=pairs.map(function(p){
      return {
        feats:normalizeFeats(p.feats),
        ext:spatialFeats(p.feats),
        rx:clamp01(p.rx),
        ry:clamp01(p.ry),
        nx:clamp01(p.nx!=null?p.nx:0.5),
        ny:clamp01(p.ny!=null?p.ny:0.5),
        targetId:p.targetId||'',
        cx:p.cx,
        cy:p.cy
      };
    });
    return {pairs:pairs,anchors:anchors,scaler:buildFeatScaler(anchors)};
  }

  function looWeightForTarget(targetId){
    // Top row + corners dominate real-world miss rate with glasses.
    if(targetId==='tr'||targetId==='tl') return 3.8;
    if(targetId==='br'||targetId==='bl') return 3.2;
    if(targetId==='tc') return 2.6;
    if(targetId==='bc'||targetId==='ml'||targetId==='mr') return 1.5;
    return 1.0;
  }

  function evalKindWeightedLooRmse(kind,pairs,anchors,scaler){
    var errors=evalKindLooPointErrors(kind,pairs,anchors,scaler);
    if(!errors.length) return {rmse:1e9,cornerRmse:1e9,errors:errors};
    var sse=0,wsum=0,cornerSse=0,cornerN=0;
    for(var i=0;i<errors.length;i++){
      var e=errors[i].errorPx;
      if(!isFinite(e)) continue;
      var w=looWeightForTarget(errors[i].targetId||'');
      sse+=w*e*e;
      wsum+=w;
      if(CRITICAL_CORNER_IDS.indexOf(errors[i].targetId||'')>=0){
        cornerSse+=e*e;
        cornerN++;
      }
    }
    return {
      rmse:wsum?Math.sqrt(sse/wsum):1e9,
      cornerRmse:cornerN?Math.sqrt(cornerSse/cornerN):1e9,
      errors:errors
    };
  }

  function logKindLooErrors(kind,prep){
    var scored=evalKindWeightedLooRmse(kind,prep.pairs,prep.anchors,prep.scaler);
    var errors=scored.errors||[];
    for(var i=0;i<errors.length;i++){
      calibLog('LOO '+kind+' point '+errors[i].targetId+' err='+Math.round(errors[i].errorPx)+'px');
    }
    calibLog('LOO summary '+kind+' weighted='+Math.round(scored.rmse)+
      ' cornerAvg='+Math.round(scored.cornerRmse)+'px');
    return scored;
  }

  function pickModelKind(prep,ridge,gridBetas,idwLoo,ridgeLoo,gridLoo){
    var idwW=logKindLooErrors('idw',prep);
    var ridgeW=ridge?logKindLooErrors('ridge',prep):{rmse:ridgeLoo,cornerRmse:1e9};
    var gridW=gridBetas&&gridTopologyEligible(prep.pairs)
      ?logKindLooErrors('grid',prep)
      :{rmse:gridLoo,cornerRmse:1e9};
    // Prefer extrapolating models when LOO is close — IDW blends toward center at corners.
    var kind='idw';
    var pick=idwW;
    var best=idwW.rmse;
    if(ridge&&isFinite(ridgeW.rmse)&&ridgeW.rmse<=best*1.08){
      kind='ridge';
      pick=ridgeW;
      best=ridgeW.rmse;
      if(ridgeW.rmse>idwW.rmse){
        calibLog('model pick ridge near-tie (extrapolation) vs idw='+Math.round(idwW.rmse));
      }
    }
    if(gridBetas&&isFinite(gridW.rmse)&&gridW.rmse<best){
      kind='grid';
      pick=gridW;
      best=gridW.rmse;
    }
    if(gridBetas&&prep.pairs.length>=9&&gridTopologyEligible(prep.pairs)){
      if(ridge&&isFinite(ridgeW.cornerRmse)&&ridgeW.cornerRmse<gridW.cornerRmse*0.98&&
         ridgeW.cornerRmse<=idwW.cornerRmse*1.05){
        kind='ridge';
        pick=ridgeW;
        calibLog('model pick ridge corner-boost cornerRmse='+Math.round(ridgeW.cornerRmse)+
          ' vs grid='+Math.round(gridW.cornerRmse));
      }else if(gridW.cornerRmse<idwW.cornerRmse*0.95||
         (gridW.rmse<=idwW.rmse*1.18&&gridW.cornerRmse<=idwW.cornerRmse*1.08)){
        kind='grid';
        pick=gridW;
        calibLog('model pick grid corner-boost cornerRmse='+Math.round(gridW.cornerRmse)+
          ' vs idw='+Math.round(idwW.cornerRmse));
      }
    }
    calibLog('model weighted idw='+Math.round(idwW.rmse)+'/'+Math.round(idwW.cornerRmse)+
      ' ridge='+Math.round(ridgeW.rmse)+'/'+Math.round(ridgeW.cornerRmse)+
      ' grid='+Math.round(gridW.rmse)+'/'+Math.round(gridW.cornerRmse));
    return {kind:kind,pick:pick};
  }

  function sanitizeLooRmse(v){
    v=Number(v);
    if(!isFinite(v)||v<0) return 1e9;
    return v;
  }

  function betasFinite(beta){
    if(!beta||!beta.length) return false;
    for(var i=0;i<beta.length;i++){
      if(!isFinite(beta[i])) return false;
    }
    return true;
  }

  function finalizeBuiltModel(prep,ridge,gridBetas,idwLoo,ridgeLoo,gridLoo,acceptedSamples){
    idwLoo=sanitizeLooRmse(idwLoo);
    ridgeLoo=sanitizeLooRmse(ridgeLoo);
    gridLoo=sanitizeLooRmse(gridLoo);
    if(ridge&&(!betasFinite(ridge.betaX)||!betasFinite(ridge.betaY))){
      ridge=null;
      ridgeLoo=1e9;
    }
    if(gridBetas&&(!betasFinite(gridBetas.betaU)||!betasFinite(gridBetas.betaV))){
      gridBetas=null;
      gridLoo=1e9;
    }
    var picked=pickModelKind(prep,ridge,gridBetas,idwLoo,ridgeLoo,gridLoo);
    var kind=picked.kind;
    var rmse=picked.pick&&isFinite(picked.pick.rmse)?picked.pick.rmse:idwLoo;
    var calibrationValidation=buildCalibrationValidation(
      kind,prep.pairs,prep.anchors,prep.scaler,acceptedSamples||0
    );
    if(calibrationValidation&&isFinite(calibrationValidation.rmsePx)){
      rmse=calibrationValidation.rmsePx;
    }
    calibLog('model pick kind='+kind+' idwLoo='+Math.round(idwLoo)+' ridgeLoo='+Math.round(ridgeLoo)+' gridLoo='+Math.round(gridLoo));
    var thr=rmseThreshold();
    return stampModelFingerprint({
      anchors:prep.anchors,
      scaler:prep.scaler,
      betaX:ridge?ridge.betaX:null,
      betaY:ridge?ridge.betaY:null,
      betaU:gridBetas?gridBetas.betaU:null,
      betaV:gridBetas?gridBetas.betaV:null,
      rmse:rmse,
      idwRmse:idwLoo<1e8?idwLoo:null,
      ridgeRmse:ridgeLoo<1e8?ridgeLoo:null,
      gridRmse:gridLoo<1e8?gridLoo:null,
      kind:kind,
      calibrationValidation:calibrationValidation,
      weakSamples:[],
      weakSampleCount:0,
      continuousUpdatedAt:null,
      vw:global.innerWidth||0,
      vh:global.innerHeight||0,
      lowQuality:calibrationValidation?calibrationValidation.quality==='poor':rmse>thr,
      stale:false,
      skippedPoints:0,
      synthNodeCount:0,
      savedAt:Date.now()
    });
  }

  function buildModelFromPairs(pairs){
    var prep=prepareModelPairs(pairs);
    var idwLoo=evalLooRmse('idw',prep.pairs,prep.anchors,prep.scaler);
    var ridge=fitRidge(prep.pairs);
    var ridgeLoo=ridge?evalLooRmse('ridge',prep.pairs,prep.anchors,prep.scaler):1e9;
    calibLog('ridge fit full='+(ridge?'ok':'fail')+' looRmse='+Math.round(ridgeLoo));
    var gridEligible=gridTopologyEligible(prep.pairs);
    var gridBetas=gridEligible?buildGridBetas(prep.pairs):null;
    var gridLoo=gridEligible&&gridBetas?evalGridLooRmse(prep.pairs):1e9;
    return finalizeBuiltModel(prep,ridge,gridBetas,idwLoo,ridgeLoo,gridLoo,calibAcceptedSamples);
  }

  function buildModelFromPairsAsync(pairs,cb){
    var prep;
    try{
      prep=prepareModelPairs(pairs);
    }catch(err){
      cb(null,err);
      return;
    }
    var idwLoo;
    try{
      idwLoo=evalLooRmse('idw',prep.pairs,prep.anchors,prep.scaler);
    }catch(err){
      cb(null,err);
      return;
    }
    setTimeout(function(){
      var ridge,ridgeLoo;
      try{
        ridge=fitRidge(prep.pairs);
        ridgeLoo=ridge?evalLooRmse('ridge',prep.pairs,prep.anchors,prep.scaler):1e9;
        calibLog('ridge fit full='+(ridge?'ok':'fail')+' looRmse='+Math.round(ridgeLoo));
      }catch(err){
        cb(null,err);
        return;
      }
      setTimeout(function(){
        try{
          var gridEligible=gridTopologyEligible(prep.pairs);
          var gridBetas=gridEligible?buildGridBetas(prep.pairs):null;
          var gridLoo=gridEligible&&gridBetas?evalGridLooRmse(prep.pairs):1e9;
          cb(finalizeBuiltModel(prep,ridge,gridBetas,idwLoo,ridgeLoo,gridLoo,calibAcceptedSamples));
        }catch(err){
          cb(null,err);
        }
      },0);
    },0);
  }

  function predictWithKind(kind,feats,rx,ry,ext,m,vw,vh){
    if(!m) return null;
    if(kind==='grid'&&m.betaU&&m.betaV){
      return predictGrid(feats,rx,ry,ext,m,vw,vh);
    }
    if(kind==='ridge'&&m.betaX&&m.betaY){
      return {
        cx:predictClient(m.betaX,feats),
        cy:predictClient(m.betaY,feats)
      };
    }
    if(kind==='idw'&&m.anchors&&m.scaler){
      return predictFromAnchors(ext,m.anchors,m.scaler);
    }
    return null;
  }

  function nearestAnchorPred(ext,anchors,scaler){
    if(!anchors||!anchors.length||!scaler) return null;
    var bestI=-1,bestD=1e9;
    for(var i=0;i<anchors.length;i++){
      var d=scaledFeatDist(ext,anchors[i].ext,scaler);
      if(d<bestD){ bestD=d; bestI=i; }
    }
    if(bestI<0) return null;
    return {cx:anchors[bestI].cx,cy:anchors[bestI].cy};
  }

  function weakWeightForSource(source){
    if(source==='lock') return WEAK_WEIGHT_LOCK;
    if(source==='hover') return 0.12;
    return WEAK_WEIGHT_CLICK;
  }

  function isPreviewLiveForWeak(){
    var preview=global.OneToneCameraPreview;
    if(!preview||!preview.getGazeDebugState) return false;
    try{
      var st=preview.getGazeDebugState();
      return !!(st&&st.previewLive);
    }catch(_){
      return false;
    }
  }

  function hasFormalCalibrationModel(){
    return !!(model&&model.anchors&&model.anchors.length>=minCalibPointsForMode(model.calibMode||'fast')&&model.calibrationValidation);
  }

  function formalPairsFromModel(m){
    return (m.anchors||[]).map(function(a){
      return {
        feats:normalizeFeats(a.feats),
        rx:clamp01(a.rx),
        ry:clamp01(a.ry),
        nx:clamp01(a.nx!=null?a.nx:0.5),
        ny:clamp01(a.ny!=null?a.ny:0.5),
        cx:Number(a.cx)||0,
        cy:Number(a.cy)||0,
        targetId:a.targetId||'',
        weight:1
      };
    });
  }

  function normalizeWeakSample(raw){
    if(!raw||typeof raw!=='object') return null;
    var feats=normalizeFeats(raw.feats);
    var rx=clamp01(raw.rx);
    var ry=clamp01(raw.ry);
    var cx=Number(raw.cx);
    var cy=Number(raw.cy);
    if(!isFinite(cx)||!isFinite(cy)) return null;
    var vw=global.innerWidth||1;
    var vh=global.innerHeight||1;
    var nx=raw.nx!=null?clamp01(raw.nx):clamp01(cx/vw);
    var ny=raw.ny!=null?clamp01(raw.ny):clamp01(cy/vh);
    var source=String(raw.source||'click');
    if(source!=='click'&&source!=='lock'&&source!=='hover') source='click';
    var weight=raw.weight!=null?Number(raw.weight):weakWeightForSource(source);
    if(!isFinite(weight)||weight<=0) weight=weakWeightForSource(source);
    weight=clamp(weight,0.05,0.5);
    var createdAt=Number(raw.createdAt);
    if(!isFinite(createdAt)) createdAt=Date.now();
    return {
      feats:feats,rx:rx,ry:ry,cx:cx,cy:cy,nx:nx,ny:ny,
      weight:weight,source:source,createdAt:createdAt
    };
  }

  function pruneWeakSamples(list){
    if(!list||!list.length) return [];
    var now=Date.now();
    var out=[];
    for(var i=0;i<list.length;i++){
      var s=normalizeWeakSample(list[i]);
      if(!s) continue;
      if(now-s.createdAt>WEAK_MAX_AGE_MS) continue;
      out.push(s);
    }
    while(out.length>WEAK_MAX_SAMPLES) out.shift();
    return out;
  }

  function weakPairsFromSamples(samples){
    return (samples||[]).map(function(s){
      return {
        feats:s.feats,rx:s.rx,ry:s.ry,nx:s.nx,ny:s.ny,cx:s.cx,cy:s.cy,
        weight:s.weight,targetId:''
      };
    });
  }

  function refitRuntimeBetasFromWeak(){
    if(!hasFormalCalibrationModel()) return false;
    var weakSamples=pruneWeakSamples(model.weakSamples||[]);
    model.weakSamples=weakSamples;
    var formalPairs=formalPairsFromModel(model);
    var weakPairs=weakPairsFromSamples(weakSamples);
    var allPairs=formalPairs.concat(weakPairs);
    if(!allPairs.length) return false;
    var ridge=fitRidge(allPairs);
    if(ridge){
      model.betaX=ridge.betaX;
      model.betaY=ridge.betaY;
    }
    if(gridTopologyEligible(formalPairs)){
      var gridBetas=buildGridBetas(allPairs);
      if(gridBetas){
        model.betaU=gridBetas.betaU;
        model.betaV=gridBetas.betaV;
      }
    }
    model.weakSampleCount=weakSamples.length;
    model.continuousUpdatedAt=Date.now();
    model.savedAt=Date.now();
    persistGazeCalibrationSnapshot(serializeModel(model));
    resetRuntimeSmoothers();
    calibLog('weak refit samples='+weakSamples.length+' (formal anchors unchanged)');
    return true;
  }

  function scheduleWeakRefit(){
    if(weakRefitTimer){
      clearTimeout(weakRefitTimer);
      weakRefitTimer=0;
    }
    weakRefitTimer=setTimeout(function(){
      weakRefitTimer=0;
      if(!model) return;
      if(refitRuntimeBetasFromWeak()) notifyPreviewCalibrated();
    },WEAK_REFIT_DEBOUNCE_MS);
  }

  function tryAddWeakSample(cx,cy,source,weightOverride){
    if(!weakClickEnabled&&source!=='lock') return false;
    if(running||!hasFormalCalibrationModel()) return false;
    if(!isPreviewLiveForWeak()) return false;
    if(source==='hover'&&!WEAK_HOVER_ENABLED) return false;
    var now=Date.now();
    var minGap=source==='hover'?2500:(source==='lock'?WEAK_MIN_INTERVAL_LOCK_MS:WEAK_MIN_INTERVAL_CLICK_MS);
    if(now-weakLastSampleAt<minGap) return false;
    var point=lastRaw;
    var lm=global.OneToneCameraGazeLandmarker;
    if((!point||!isSampleAcceptable(point))&&lm&&lm.getLastPoint){
      point=lm.getLastPoint();
    }
    if(!point||!isSampleAcceptable(point)) return false;
    if(clamp01(point.confidence)<WEAK_MIN_CONF) return false;
    var pst=String(point.state||'');
    if(pst==='lost'||pst==='idle') return false;
    cx=Number(cx);
    cy=Number(cy);
    if(!isFinite(cx)||!isFinite(cy)) return false;
    var vw=global.innerWidth||model.vw||1;
    var vh=global.innerHeight||model.vh||1;
    var weight=weightOverride!=null?Number(weightOverride):weakWeightForSource(source);
    if(!isFinite(weight)||weight<=0) weight=weakWeightForSource(source);
    var sample={
      feats:normalizeFeats(point.feats),
      rx:clamp01(point.x),
      ry:clamp01(point.y),
      cx:cx,cy:cy,
      nx:clamp01(cx/vw),
      ny:clamp01(cy/vh),
      weight:clamp(weight,0.05,0.5),
      source:source,
      createdAt:now
    };
    if(!model.weakSamples) model.weakSamples=[];
    model.weakSamples.push(sample);
    model.weakSamples=pruneWeakSamples(model.weakSamples);
    model.weakSampleCount=model.weakSamples.length;
    weakLastSampleAt=now;
    calibLog('weak sample '+source+' w='+sample.weight.toFixed(2)+
      ' at '+Math.round(cx)+','+Math.round(cy)+' nx='+sample.nx.toFixed(2));
    scheduleWeakRefit();
    return true;
  }

  function lockTarget(cx,cy){
    return tryAddWeakSample(cx,cy,'lock',WEAK_WEIGHT_LOCK);
  }

  function isWeakClickIgnoredTarget(el){
    if(!el||!el.closest) return false;
    if(running) return true;
    if(el.closest('#cameraGazeCalibrationOverlay')) return true;
    if(el.closest('#cameraGazeWindowLayer')) return true;
    if(el.closest('.camera-gaze-calibration-panel')) return true;
    if(el.closest('#cameraActionBar')) return true;
    if(el.closest('#cameraGazeCalibrateBtn,#cameraGazeCalibrateFineBtn,#cameraProCalibrateBtn,#cameraProCalibrateFineBtn,#cameraProClearCalibBtn,#cameraProRecenterBtn,#cameraGazeClearCalibrationBtn,#cameraGazeStaleRecalibBtn,#cameraPreviewStartBtn,#btnCameraToggle,#cameraGazeCalibrationCancel')) return true;
    return false;
  }

  function onDocumentClickForWeak(e){
    if(running||!hasFormalCalibrationModel()) return;
    if(!isPreviewLiveForWeak()) return;
    var target=e&&e.target;
    if(isWeakClickIgnoredTarget(target)) return;
    if(e&&typeof e.clientX==='number'&&typeof e.clientY==='number'){
      tryAddWeakSample(e.clientX,e.clientY,'click');
    }
  }

  function bindWeakCalibrationUi(){
    if(weakClickBound) return;
    weakClickBound=true;
    global.addEventListener('click',onDocumentClickForWeak,true);
  }

  function getCameraPrefsRef(){
    var st=global.OneToneState&&global.OneToneState.state;
    if(!st) return null;
    if(!st.config) st.config={};
    if(!st.config.cameraPrefs||typeof st.config.cameraPrefs!=='object'){
      st.config.cameraPrefs={
        enabled:false,selectedDeviceId:'',previewEnabled:false,
        selectedWidth:0,selectedHeight:0,selectedFrameRate:0,
        gazeCalibration:null
      };
    }
    if(st.config.cameraPrefs.gazeCalibration===undefined) st.config.cameraPrefs.gazeCalibration=null;
    return st.config.cameraPrefs;
  }

  var persistGazeTimer=0;
  function persistGazeCalibrationSnapshot(snapshot){
    var prefs=getCameraPrefsRef();
    if(!prefs) return;
    prefs.gazeCalibration=snapshot;
    // Debounce — quiet camera prefs save (no mvp_init / voice restart).
    if(persistGazeTimer) clearTimeout(persistGazeTimer);
    persistGazeTimer=setTimeout(function(){
      persistGazeTimer=0;
      if(global.OneToneConfigPersist){
        if(global.OneToneConfigPersist.saveCameraPrefsQuiet) global.OneToneConfigPersist.saveCameraPrefsQuiet();
        else if(global.OneToneConfigPersist.saveAsync) global.OneToneConfigPersist.saveAsync();
        else if(global.OneToneConfigPersist.save) global.OneToneConfigPersist.save();
      }
    },2500);
  }

  function currentCalibFingerprint(){
    var deviceId='';
    var resKey='';
    try{
      var sel=document.getElementById('cameraDeviceSelect');
      if(sel) deviceId=String(sel.value||'').trim();
      var pv=global.OneToneCameraPreview;
      var sz=pv&&pv.getActualVideoSize?pv.getActualVideoSize():null;
      if(sz&&sz.width&&sz.height) resKey=String(Math.round(sz.width))+'x'+String(Math.round(sz.height));
    }catch(_){}
    return {deviceId:deviceId,resKey:resKey};
  }

  function stampModelFingerprint(m){
    if(!m) return m;
    var fp=currentCalibFingerprint();
    if(fp.deviceId) m.deviceId=fp.deviceId;
    if(fp.resKey) m.resKey=fp.resKey;
    return m;
  }

  function serializeModel(m){
    if(!m||!m.anchors||!m.anchors.length) return null;
    return {
      kind:m.kind||'idw',
      calibMode:m.calibMode==='fine'?'fine':'fast',
      rmse:m.rmse,
      idwRmse:m.idwRmse,
      ridgeRmse:m.ridgeRmse,
      gridRmse:m.gridRmse,
      calibrationValidation:m.calibrationValidation||null,
      weakSampleCount:m.weakSampleCount||0,
      continuousUpdatedAt:m.continuousUpdatedAt||null,
      skippedPoints:m.skippedPoints||0,
      synthNodeCount:m.synthNodeCount||0,
      vw:m.vw,vh:m.vh,
      deviceId:m.deviceId||'',
      resKey:m.resKey||'',
      staleReason:m.staleReason||'',
      lowQuality:!!m.lowQuality,
      stale:!!m.stale,
      savedAt:m.savedAt||Date.now(),
      betaX:m.betaX,
      betaY:m.betaY,
      betaU:m.betaU,
      betaV:m.betaV,
      anchors:m.anchors.map(function(a){
        return {
          feats:a.feats,rx:a.rx,ry:a.ry,nx:a.nx,ny:a.ny,
          targetId:a.targetId||'',cx:a.cx,cy:a.cy
        };
      }),
      weakSamples:pruneWeakSamples(m.weakSamples||[]).map(function(s){
        return {
          feats:s.feats,rx:s.rx,ry:s.ry,cx:s.cx,cy:s.cy,nx:s.nx,ny:s.ny,
          weight:s.weight,source:s.source,createdAt:s.createdAt
        };
      }),
      scaler:m.scaler
    };
  }

  function deserializeModel(snapshot){
    if(!snapshot||!snapshot.anchors||!snapshot.anchors.length) return null;
    var anchors=snapshot.anchors.map(function(a){
      var nx=a.nx!=null?clamp01(a.nx):0.5;
      var ny=a.ny!=null?clamp01(a.ny):0.5;
      if((a.nx==null||a.ny==null)&&snapshot.vw&&snapshot.vh){
        nx=clamp01((Number(a.cx)||0)/snapshot.vw);
        ny=clamp01((Number(a.cy)||0)/snapshot.vh);
      }
      return {
        feats:normalizeFeats(a.feats),
        ext:spatialFeats(a.feats),
        rx:clamp01(a.rx),
        ry:clamp01(a.ry),
        nx:nx,
        ny:ny,
        targetId:a.targetId||'',
        cx:Number(a.cx)||0,
        cy:Number(a.cy)||0
      };
    });
    var ridgeDim=SPATIAL_DIM+1;
    var scaler=snapshot.scaler;
    if(!scaler||!scaler.means||!scaler.stds||scaler.means.length!==SPATIAL_DIM){
      scaler=buildFeatScaler(anchors);
    }
    var betaX=snapshot.betaX||null;
    var betaY=snapshot.betaY||null;
    if(betaX&&betaX.length!==ridgeDim) betaX=null;
    if(betaY&&betaY.length!==ridgeDim) betaY=null;
    var betaU=snapshot.betaU||null;
    var betaV=snapshot.betaV||null;
    if(betaU&&betaU.length!==ridgeDim) betaU=null;
    if(betaV&&betaV.length!==ridgeDim) betaV=null;
    if((!betaU||!betaV)&&anchors.length>=5){
      var pseudoPairs=anchors.map(function(a){
        return {
          feats:a.feats,rx:a.rx,ry:a.ry,nx:a.nx,ny:a.ny,weight:1
        };
      });
      var betas=buildGridBetas(pseudoPairs);
      if(betas){
        betaU=betaU||betas.betaU;
        betaV=betaV||betas.betaV;
      }
    }
    var calibrationValidation=normalizeCalibrationValidation(snapshot.calibrationValidation);
    if(!calibrationValidation&&isFinite(Number(snapshot.rmse))){
      calibrationValidation=normalizeCalibrationValidation({
        method:'leave-one-out',
        rmsePx:Number(snapshot.rmse),
        quality:snapshot.lowQuality?'poor':'ok'
      });
    }
    var weakSamples=pruneWeakSamples(Array.isArray(snapshot.weakSamples)?snapshot.weakSamples:[]);
    var kind=snapshot.kind||'idw';
    if(kind==='ridge'&&(!betaX||!betaY)) kind='idw';
    if(kind==='grid'&&(!betaU||!betaV)) kind='idw';
    var legacyBetaMismatch=!!(
      (snapshot.betaX&&snapshot.betaX.length!==ridgeDim)||
      (snapshot.scaler&&snapshot.scaler.means&&snapshot.scaler.means.length!==SPATIAL_DIM)
    );
    return {
      anchors:anchors,
      scaler:scaler,
      betaX:betaX,
      betaY:betaY,
      betaU:betaU,
      betaV:betaV,
      calibMode:snapshot.calibMode==='fine'?'fine':(
        snapshot.calibMode==='fast'?'fast':(
          anchors.length>=GRID_MIN_POINTS?'fine':'fast'
        )
      ),
      rmse:calibrationValidation?calibrationValidation.rmsePx:(Number(snapshot.rmse)||0),
      idwRmse:snapshot.idwRmse,
      ridgeRmse:snapshot.ridgeRmse,
      gridRmse:snapshot.gridRmse,
      calibrationValidation:calibrationValidation,
      weakSamples:weakSamples,
      weakSampleCount:weakSamples.length||Math.max(0,Number(snapshot.weakSampleCount)||0)|0,
      continuousUpdatedAt:snapshot.continuousUpdatedAt!=null?Number(snapshot.continuousUpdatedAt)||null:null,
      skippedPoints:Number(snapshot.skippedPoints)||0,
      synthNodeCount:Number(snapshot.synthNodeCount)||0,
      kind:kind,
      vw:Number(snapshot.vw)||global.innerWidth||0,
      vh:Number(snapshot.vh)||global.innerHeight||0,
      lowQuality:legacyBetaMismatch||(
        calibrationValidation?calibrationValidation.quality==='poor':!!snapshot.lowQuality
      ),
      stale:!!snapshot.stale,
      deviceId:String(snapshot.deviceId||''),
      resKey:String(snapshot.resKey||''),
      staleReason:String(snapshot.staleReason||''),
      savedAt:Number(snapshot.savedAt)||0
    };
  }

  function loadFromPrefs(){
    if(running) return false;
    var prefs=getCameraPrefsRef();
    var saved=prefs&&prefs.gazeCalibration;
    if(model&&model.savedAt){
      var memAt=Number(model.savedAt)||0;
      var prefAt=saved&&saved.savedAt?Number(saved.savedAt):0;
      if(!saved||!saved.anchors||!saved.anchors.length||memAt>=prefAt){
        syncUiFromModel();
        return false;
      }
    }
    if(!saved||!saved.anchors||!saved.anchors.length){
      syncUiFromModel();
      return false;
    }
    var restored=deserializeModel(saved);
    if(!restored){
      syncUiFromModel();
      return false;
    }
    model=restored;
    resetRuntimeSmoothers();
    onResize();
    syncCalibrationFingerprint();
    syncUiFromModel();
    updateCalibWarnings();
    return true;
  }

  function rmseThreshold(){
    var w=global.innerWidth||800;
    var h=global.innerHeight||600;
    // Region-level product (not eye-mouse): allow larger formal threshold.
    return Math.max(80,Math.min(w,h)*0.14);
  }

  function formatCalibStatusText(m,skipped){
    if(!m) return '';
    var map={
      ready:['cameraGazeCalibrationReady','校准完成'],
      low:['cameraGazeCalibrationLowQuality','校准完成，但精度较低'],
      stale:['cameraGazeCalibrationStale','窗口尺寸变化，请重新校准']
    };
    var sk=statusKind;
    if(m.stale) sk='stale';
    else if(m.lowQuality) sk='low';
    else sk='ready';
    var pair=map[sk]||map.ready;
    var text=t(pair[0],pair[1]);
    var cv=m.calibrationValidation;
    if(cv&&isFinite(cv.rmsePx)){
      text+=' · RMSE '+Math.round(cv.rmsePx)+'px · '+String(cv.quality||'ok');
      if(cv.worstTargetId&&isFinite(cv.worstErrorPx)&&cv.quality==='poor'){
        text+=' · '+t('cameraGazeCalibWorstPoint','最弱 {id} {n}px')
          .replace('{id}',regionZoneLabel(cv.worstTargetId))
          .replace('{n}',String(Math.round(cv.worstErrorPx)));
      }
    }else if(isFinite(m.rmse)){
      text+=' · RMSE '+Math.round(m.rmse)+'px';
    }
    if(skipped>0){
      text+=' · '+t('cameraGazeCalibSkipped','跳过 {n} 点').replace('{n}',String(skipped));
    }
    return text;
  }

  function syncUiFromModel(){
    if(!model){
      if(statusKind!=='failed'&&statusKind!=='canceled'&&statusKind!=='running') setStatusKind('idle');
      else{
        syncCalibrateBtnLabel();
        syncProCalibStatusUi();
      }
      return;
    }
    if(model.stale) setStatusKind('stale');
    else if(model.lowQuality) setStatusKind('low');
    else setStatusKind('ready');
    var statusEl=$('cameraGazeCalibrationStatus');
    if(statusEl){
      statusEl.textContent=formatCalibStatusText(model,0);
      var glance=$('cameraGlanceCalib');
      if(glance) glance.textContent=statusEl.textContent;
    }
    updateCalibWarnings();
    syncCalibrateBtnLabel();
    syncProCalibStatusUi();
  }

  function hasModel(){ return !!model; }

  function isFineGridModel(){
    if(!model) return false;
    if(model.calibMode==='fine') return true;
    if(model.calibMode==='fast') return false;
    var n=model.anchors?model.anchors.length:0;
    return n>=GRID_MIN_POINTS;
  }

  function getCalibMode(){
    if(!model) return null;
    if(model.calibMode==='fine'||model.calibMode==='fast') return model.calibMode;
    return isFineGridModel()?'fine':'fast';
  }

  function getState(){
    return {
      running:!!running,
      hasModel:!!model,
      calibMode:getCalibMode(),
      fineGrid:isFineGridModel(),
      stale:!!(model&&model.stale),
      lowQuality:!!(model&&model.lowQuality),
      rmse:model?model.rmse:null,
      kind:model?model.kind:null,
      idwRmse:model?model.idwRmse:null,
      ridgeRmse:model?model.ridgeRmse:null,
      gridRmse:model?model.gridRmse:null,
      calibrationValidation:model?model.calibrationValidation:null,
      weakSampleCount:model?model.weakSampleCount:null,
      anchorCount:model&&model.anchors?model.anchors.length:0,
      statusKind:statusKind,
      lastRaw:lastRaw
    };
  }

  function getActualVideoSize(){
    var preview=global.OneToneCameraPreview;
    if(preview&&typeof preview.getActualVideoSize==='function'){
      try{ return preview.getActualVideoSize(); }catch(_){}
    }
    var vid=$('cameraPreviewVideo');
    if(vid&&vid.videoWidth>0&&vid.videoHeight>0){
      return {width:vid.videoWidth,height:vid.videoHeight};
    }
    return {width:0,height:0};
  }

  function countSynthGridNodes(anchors){
    var lookup=ensureFullGridLookup(anchors);
    var n=0;
    for(var r=0;r<GRID_CELL_IDS.length;r++){
      for(var c=0;c<GRID_CELL_IDS[r].length;c++){
        var id=GRID_CELL_IDS[r][c];
        if(lookup[id]&&lookup[id].synthetic) n++;
      }
    }
    return n;
  }

  function updateStaleBanner(){
    var banner=$('cameraGazeStaleBanner');
    var textEl=$('cameraGazeStaleText');
    if(!banner) return;
    var show=!!(model&&model.stale&&!running);
    banner.hidden=!show;
    if(show&&textEl){
      var oldW=model.vw?Math.round(model.vw):'?';
      var oldH=model.vh?Math.round(model.vh):'?';
      var nw=global.innerWidth?Math.round(global.innerWidth):'?';
      var nh=global.innerHeight?Math.round(global.innerHeight):'?';
      textEl.textContent=t('cameraGazeStaleBanner','窗口尺寸已变化，校准坐标可能不准，请重新校准')+
        ' ('+oldW+'×'+oldH+' → '+nw+'×'+nh+')';
    }
  }

  function updateSparseWarn(){
    var warnEl=$('cameraGazeSparseWarn');
    if(!warnEl) return;
    var show=!!(model&&!running&&!model.stale&&
      ((model.skippedPoints!=null&&model.skippedPoints>0)||
       (model.synthNodeCount!=null&&model.synthNodeCount>0)));
    warnEl.hidden=!show;
    if(show){
      var parts=[];
      if(model.skippedPoints>0){
        parts.push(t('cameraGazeCalibSkipped','跳过 {n} 点').replace('{n}',String(model.skippedPoints)));
      }
      if(model.synthNodeCount>0){
        parts.push(t('cameraGazeSynthNodes','合成 {n} 网格点').replace('{n}',String(model.synthNodeCount)));
      }
      warnEl.textContent=t('cameraGazeSparseWarn','部分校准点缺失，边角精度可能下降')+
        (parts.length?' · '+parts.join(' · '):'');
    }
  }

  function updateCalibWarnings(){
    updateLowResWarn();
    updateStaleBanner();
    updateSparseWarn();
  }

  function markModelStale(reason){
    if(!model||model.stale){
      updateCalibWarnings();
      return;
    }
    model.stale=true;
    if(reason) model.staleReason=String(reason);
    persistGazeCalibrationSnapshot(serializeModel(model));
    if(!running){
      setStatusKind('stale');
      syncUiFromModel();
    }
    updateCalibWarnings();
    notifyPreviewCalibrated();
  }

  function syncCalibrationFingerprint(){
    if(!model||model.stale) return;
    var deviceId='';
    var resKey='';
    try{
      var pv=global.OneToneCameraPreview;
      var sel=document.getElementById('cameraDeviceSelect');
      if(sel) deviceId=String(sel.value||'').trim();
      var sz=pv&&pv.getActualVideoSize?pv.getActualVideoSize():null;
      if(sz&&sz.width&&sz.height) resKey=String(sz.width)+'x'+String(sz.height);
    }catch(_){}
    if(model.deviceId&&deviceId&&model.deviceId!==deviceId){
      markModelStale('device_change');
      return;
    }
    if(model.resKey&&resKey&&model.resKey!==resKey){
      markModelStale('resolution_change');
      return;
    }
    if(deviceId&&!model.deviceId) model.deviceId=deviceId;
    if(resKey&&!model.resKey) model.resKey=resKey;
  }

  function scaleStalePixel(cx,cy,m,vw,vh){
    if(!m||!m.stale||!m.vw||!m.vh) return {cx:cx,cy:cy};
    return {
      cx:cx*(vw/m.vw),
      cy:cy*(vh/m.vh)
    };
  }

  function tryStartCalibrationFromUi(mode){
    var st=ensurePreviewReadyForCalib();
    if(!st||!st.previewLive){
      setStatusKind('failed');
      var status=$('cameraStatusText');
      if(status) status.textContent=t('cameraGazeCalibrationNeedLive','请先开启摄像头识别');
      return false;
    }
    if(st.modelLoading){
      setStatusKind('running');
      var loadingStatus=$('cameraStatusText');
      if(loadingStatus) loadingStatus.textContent=t('cameraGazeModelLoading','模型加载中，请稍候再校准');
      return false;
    }
    if(st.modelFailed){
      setStatusKind('failed');
      var failStatus=$('cameraStatusText');
      if(failStatus) failStatus.textContent=t('cameraGazeModelFailed','模型加载失败，无法校准');
      return false;
    }
    updateLowResWarn();
    start(mode);
    return true;
  }

  function updateLowResWarn(){
    var warnEl=$('cameraGazeLowResWarn');
    if(!warnEl) return false;
    var sz=getActualVideoSize();
    var w=sz.width||0;
    var h=sz.height||0;
    var low=w>0&&h>0&&(w<1280||h<720);
    warnEl.hidden=!low;
    if(low){
      var prefs=getCameraPrefsRef();
      var selW=prefs&&prefs.selectedWidth?Number(prefs.selectedWidth):0;
      var selH=prefs&&prefs.selectedHeight?Number(prefs.selectedHeight):0;
      var mismatch=selW>=1280&&selH>=720;
      warnEl.textContent=mismatch
        ? t('cameraGazeLowResMismatch','实际输出 {w}×{h}，低于 720p，精度可能下降')
            .replace('{w}',String(w)).replace('{h}',String(h))
        : t('cameraGazeLowResWarn','当前分辨率 {w}×{h} 低于 720p，精度可能下降')
            .replace('{w}',String(w)).replace('{h}',String(h));
    }
    return low;
  }

  var applyLogLastFallback=null;
  var applyLogLastKind=null;
  var applyLogLastAt=0;

  function logApplyFallback(kind,fallback){
    // Hot path: never IPC/file-log successful frames. Only log fallback *transitions*
    // via console to avoid flooding cmd_app_log (was freezing the UI at ~30fps).
    if(!fallback){
      applyLogLastFallback=null;
      applyLogLastKind=kind;
      return;
    }
    var now=Date.now();
    if(fallback===applyLogLastFallback&&kind===applyLogLastKind&&(now-applyLogLastAt)<3000){
      return;
    }
    applyLogLastFallback=fallback;
    applyLogLastKind=kind;
    applyLogLastAt=now;
    try{
      if(global.console&&console.log){
        console.log('[camera-calib] apply kind='+kind+' fallback='+fallback);
      }
    }catch(_){}
  }

  function poseEdgeAssist(cx,cy,feats,vw,vh){
    if(!feats||!model||!model.anchors||!model.anchors.length) return {cx:cx,cy:cy};
    var yaw=Number(feats[4])||0;
    var pitch=Number(feats[5])||0;
    var minYaw=1e9,maxYaw=-1e9,minPitch=1e9,maxPitch=-1e9;
    for(var i=0;i<model.anchors.length;i++){
      var af=model.anchors[i].feats;
      if(!af||af.length<6) continue;
      var ay=Number(af[4])||0,ap=Number(af[5])||0;
      if(ay<minYaw) minYaw=ay;
      if(ay>maxYaw) maxYaw=ay;
      if(ap<minPitch) minPitch=ap;
      if(ap>maxPitch) maxPitch=ap;
    }
    if(!(maxYaw>minYaw)||!(maxPitch>minPitch)) return {cx:cx,cy:cy};
    var yawSpan=Math.max(0.25,maxYaw-minYaw);
    var pitchSpan=Math.max(0.25,maxPitch-minPitch);
    var yawT=0,pitchT=0;
    if(yaw>maxYaw) yawT=clamp((yaw-maxYaw)/yawSpan,0,1.65);
    else if(yaw<minYaw) yawT=-clamp((minYaw-yaw)/yawSpan,0,1.65);
    if(pitch>maxPitch) pitchT=clamp((pitch-maxPitch)/pitchSpan,0,1.65);
    else if(pitch<minPitch) pitchT=-clamp((minPitch-pitch)/pitchSpan,0,1.65);
    // Head-led extrapolation: push toward window edges when pose exceeds calib range.
    var push=0.58;
    if(yawT>0) cx=cx+(vw-cx)*yawT*push;
    else if(yawT<0) cx=cx+cx*yawT*push;
    if(pitchT>0) cy=cy+(vh-cy)*pitchT*push;
    else if(pitchT<0) cy=cy+cy*pitchT*push;
    return {cx:cx,cy:cy};
  }

  function apply(rawPoint){
    var raw=rawPoint&&typeof rawPoint==='object'?rawPoint:{};
    var rx=clamp01(raw.x!=null?raw.x:0.5);
    var ry=clamp01(raw.y!=null?raw.y:0.5);
    var conf=clamp01(raw.confidence!=null?raw.confidence:0);
    var st=String(raw.state||'idle');
    if(!model||!model.anchors||!model.anchors.length){
      return {
        x:rx,y:ry,confidence:conf,state:st,
        calibrated:false,
        feats:raw.feats||null
      };
    }
    var vw=global.innerWidth||1;
    var vh=global.innerHeight||1;
    var feats=raw.feats!=null?smoothRuntimeFeats(raw.feats):null;
    var ext=spatialFeats(feats);
    // Strict: use stored model.kind only — never upgrade to grid at runtime.
    var kind=model.kind||'idw';
    var fallback=null;
    var pred=predictWithKind(kind,feats,rx,ry,ext,model,vw,vh);
    if(!pred&&kind!=='ridge'){
      pred=predictWithKind('ridge',feats,rx,ry,ext,model,vw,vh);
      if(pred) fallback='ridge';
    }
    if(!pred){
      pred=nearestAnchorPred(ext,model.anchors,model.scaler);
      if(pred) fallback='nearest';
    }
    // Raw preview coords — never snap to screen center on predict failure.
    var clientX=rx*vw;
    var clientY=ry*vh;
    if(pred){
      clientX=pred.cx;
      clientY=pred.cy;
      var assisted=poseEdgeAssist(clientX,clientY,feats,vw,vh);
      clientX=assisted.cx;
      clientY=assisted.cy;
      logApplyFallback(kind,fallback);
      if(model.stale){
        var scaled=scaleStalePixel(clientX,clientY,model,vw,vh);
        clientX=scaled.cx;
        clientY=scaled.cy;
      }
      var smoothed=smoothApplyOutput(clientX,clientY,vw,vh,
        !!(raw.blinking||(raw.blink!=null&&Number(raw.blink)>=0.32)));
      clientX=smoothed.cx;
      clientY=smoothed.cy;
    }else{
      fallback='raw';
      logApplyFallback(kind,fallback);
    }
    var clampedX=clamp(clientX,0,vw);
    var clampedY=clamp(clientY,0,vh);
    var outConf=conf;
    if(pred&&pred.confidence!=null&&isFinite(pred.confidence)){
      outConf=clamp01(conf*0.5+pred.confidence*0.5);
    }
    if(fallback==='nearest') outConf=clamp01(outConf*0.85);
    if(fallback==='raw') outConf=clamp01(outConf*0.7);
    if(clampedX!==clientX||clampedY!==clientY) outConf=clamp01(outConf*0.85);
    if(model.stale) outConf=clamp01(outConf*0.9);
    var outNx=clamp01(clampedX/vw);
    var outNy=clamp01(clampedY/vh);
    var blinkHold=!!(raw.blinking||(raw.blink!=null&&Number(raw.blink)>=0.32));
    // Soft-snap can still tug toward a neighbor zone on blink noise — skip while held.
    var snapped=blinkHold
      ?{nx:outNx,ny:outNy,zone:regionZoneFromNorm(outNx,outNy)}
      :softSnapToRegion(outNx,outNy);
    outNx=snapped.nx;
    outNy=snapped.ny;
    clampedX=outNx*vw;
    clampedY=outNy*vh;
    var regionZone=snapped.zone;
    return {
      x:outNx,
      y:outNy,
      confidence:outConf,
      state:st,
      clientX:clampedX,
      clientY:clampedY,
      screenX:(Number(global.screenX)||0)+clampedX,
      screenY:(Number(global.screenY)||0)+clampedY,
      calibrated:true,
      stale:!!model.stale,
      lowQuality:!!model.lowQuality,
      regionZone:regionZone,
      regionLabel:regionZoneLabel(regionZone),
      applyKind:kind,
      applyFallback:fallback,
      feats:normalizeFeats(feats)
    };
  }

  function onRawPoint(point){
    lastRaw=point||null;
    if(!running||!collecting) return;
    pushSampleFromPoint(point);
  }

  function notifyPreviewCalibrated(){
    var preview=global.OneToneCameraPreview;
    if(preview&&typeof preview.onCalibrationUpdated==='function'){
      try{ preview.onCalibrationUpdated(); }catch(_){}
    }
  }

  function isBottomTarget(id){
    return id==='bl'||id==='bc'||id==='br';
  }

  function isTopTarget(id){
    return id==='tl'||id==='tc'||id==='tr';
  }

  function isRightTarget(id){
    return id==='tr'||id==='mr'||id==='br';
  }

  function isLeftTarget(id){
    return id==='tl'||id==='ml'||id==='bl';
  }

  // Reject corner/edge samples when head barely moved — main cause of 右上 700px+ LOO.
  function poseExtentOk(targetId,feats,relaxed){
    var id=String(targetId||'');
    if(!feats||feats.length<6) return {ok:true};
    var yaw=Number(feats[4])||0;
    var pitch=Number(feats[5])||0;
    var refYaw=calibPoseRef&&isFinite(calibPoseRef.yaw)?calibPoseRef.yaw:0.75;
    var refPitch=calibPoseRef&&isFinite(calibPoseRef.pitch)?calibPoseRef.pitch:3.2;
    var dyaw=yaw-refYaw;
    var dpitch=pitch-refPitch;
    var yawNeed=relaxed?0.42:0.72;
    var pitchNeed=relaxed?0.28:0.48;
    if(id==='center') return {ok:true,dyaw:dyaw,dpitch:dpitch};
    if(isRightTarget(id)&&dyaw>-yawNeed){
      return {ok:false,reason:'yaw-right',dyaw:dyaw,dpitch:dpitch,need:-yawNeed};
    }
    if(isLeftTarget(id)&&dyaw<yawNeed){
      return {ok:false,reason:'yaw-left',dyaw:dyaw,dpitch:dpitch,need:yawNeed};
    }
    if(isTopTarget(id)&&dpitch>-pitchNeed){
      return {ok:false,reason:'pitch-up',dyaw:dyaw,dpitch:dpitch,need:-pitchNeed};
    }
    if(isBottomTarget(id)&&dpitch<pitchNeed){
      return {ok:false,reason:'pitch-down',dyaw:dyaw,dpitch:dpitch,need:pitchNeed};
    }
    return {ok:true,dyaw:dyaw,dpitch:dpitch};
  }

  function poseFailHint(reason){
    if(reason==='yaw-right') return t('cameraGazeCalibPoseYawRight','右转头不够，请再向右转并看大字');
    if(reason==='yaw-left') return t('cameraGazeCalibPoseYawLeft','左转头不够，请再向左转并看大字');
    if(reason==='pitch-up') return t('cameraGazeCalibPosePitchUp','抬头不够，请再抬头看大字');
    if(reason==='pitch-down') return t('cameraGazeCalibPosePitchDown','点头不够，请再点头看大字');
    return t('cameraGazeCalibPoseRetry','头姿幅度不够，请加大转头/点头');
  }

  function looErrorForTargetId(pairs,targetId){
    if(!pairs||pairs.length<3||!targetId) return 1e9;
    var prep;
    try{ prep=prepareModelPairs(pairs); }catch(_){ return 1e9; }
    var ridge=fitRidge(prep.pairs);
    var kind=ridge?'ridge':(gridTopologyEligible(prep.pairs)?'grid':'idw');
    var errors=evalKindLooPointErrors(kind,prep.pairs,prep.anchors,prep.scaler);
    for(var i=0;i<errors.length;i++){
      if(String(errors[i].targetId)===String(targetId)){
        return isFinite(errors[i].errorPx)?errors[i].errorPx:1e9;
      }
    }
    return 1e9;
  }

  function evaluateSampleBuf(target,relaxed,fixation){
    var minNeed=relaxed?4:MIN_SAMPLES;
    if(sampleBuf.length<minNeed){
      lastSampleFailReason='samples';
      return {ok:false,reason:'samples',count:sampleBuf.length};
    }
    var featJitter=featStdMax(sampleBuf);
    var corner=isCriticalCorner(target&&target.id);
    var bottom=isBottomTarget(target&&target.id);
    var jitterThr=relaxed?STABLE_STD*1.4:STABLE_STD;
    if(corner) jitterThr*=1.18;
    if(bottom) jitterThr*=1.25;
    if(featJitter>jitterThr){
      lastSampleFailReason='unstable';
      return {ok:false,reason:'unstable',featJitter:featJitter,count:sampleBuf.length};
    }
    var confSum=0;
    for(var i=0;i<sampleBuf.length;i++) confSum+=sampleBuf[i].confidence;
    var avgConf=confSum/sampleBuf.length;
    var vw=global.innerWidth||1;
    var vh=global.innerHeight||1;
    var fix=fixation||currentFixation;
    if(!fix||!isFinite(fix.cx)){
      fix=measureReadFixation()||{nx:target.x,ny:target.y,cx:target.x*vw,cy:target.y*vh};
    }
    var nx=clamp01(fix.nx);
    var ny=clamp01(fix.ny);
    var feats=featMean(sampleBuf);
    var poseCheck=poseExtentOk(target&&target.id,feats,relaxed);
    if(!poseCheck.ok){
      lastSampleFailReason=poseCheck.reason||'pose';
      calibLog('pose reject '+String(target&&target.id||'')+
        ' reason='+lastSampleFailReason+
        ' dyaw='+(isFinite(poseCheck.dyaw)?poseCheck.dyaw.toFixed(2):'?')+
        ' dpitch='+(isFinite(poseCheck.dpitch)?poseCheck.dpitch.toFixed(2):'?')+
        ' need='+(poseCheck.need!=null?Number(poseCheck.need).toFixed(2):'?'));
      return {ok:false,reason:lastSampleFailReason,count:sampleBuf.length,pose:poseCheck};
    }
    calibLog('fixation '+String(target&&target.id||'')+' nx='+nx.toFixed(3)+' ny='+ny.toFixed(3)+
      ' dyaw='+(isFinite(poseCheck.dyaw)?poseCheck.dyaw.toFixed(2):'?')+
      ' dpitch='+(isFinite(poseCheck.dpitch)?poseCheck.dpitch.toFixed(2):'?'));
    var weight=0.55+0.45*clamp01(avgConf);
    if(isTopTarget(target&&target.id)) weight*=1.35;
    else if(corner) weight*=1.25;
    else if(bottom) weight*=1.15;
    // Reward clearer head pose.
    if(isFinite(poseCheck.dyaw)) weight*=1+Math.min(0.35,Math.abs(poseCheck.dyaw)*0.12);
    if(isFinite(poseCheck.dpitch)) weight*=1+Math.min(0.25,Math.abs(poseCheck.dpitch)*0.1);
    lastSampleFailReason='';
    var sample={
      ok:true,
      feats:feats,
      rx:weightedRobustMean(sampleBuf,'x'),
      ry:weightedRobustMean(sampleBuf,'y'),
      nx:nx,
      ny:ny,
      targetId:target.id||'',
      cx:fix.cx,
      cy:fix.cy,
      weight:clamp(weight,0.4,1.8)
    };
    if(sample.targetId==='center'){
      calibPoseRef={yaw:Number(feats[4])||0,pitch:Number(feats[5])||0};
      calibLog('pose ref yaw='+calibPoseRef.yaw.toFixed(2)+' pitch='+calibPoseRef.pitch.toFixed(2));
    }
    return sample;
  }

  function sampleDurationForTarget(target){
    var id=target&&target.id;
    if(isTopTarget(id)) return SAMPLE_SEC_TOP;
    if(isBottomTarget(id)) return SAMPLE_SEC_EDGE;
    if(isCriticalCorner(id)) return SAMPLE_SEC_CORNER;
    return SAMPLE_SEC;
  }

  function prepareDurationForTarget(target){
    var id=target&&target.id;
    if(isTopTarget(id)) return PREPARE_SEC_TOP;
    if(isBottomTarget(id)) return PREPARE_SEC_EDGE;
    if(isCriticalCorner(id)) return PREPARE_SEC_CORNER;
    return PREPARE_SEC;
  }

  function waitAndSampleOnce(target,pointIndex,attempt,gen,collectedCount){
    var readText=pickKaraokeForTarget(target);
    var prepareSec=prepareDurationForTarget(target);
    var sampleSec=sampleDurationForTarget(target);
    var totalSec=prepareSec+sampleSec;
    var pointLabel=t('cameraGazeCalibStep','校准点 {n} / {total}')
      .replace('{n}',String(pointIndex+1))
      .replace('{total}',String(activeTargetCount()));
    if(collectedCount!=null){
      pointLabel=calibrationProgressLabel(collectedCount)+' · '+pointLabel;
    }
    if(attempt>0){
      pointLabel+=' · '+t('cameraGazeCalibrationRetry','重试')+' '+attempt;
      if(lastSampleFailReason&&lastSampleFailReason!=='samples'&&lastSampleFailReason!=='unstable'){
        pointLabel+=' · '+poseFailHint(lastSampleFailReason);
      }else if(lastSampleFailReason==='unstable'){
        pointLabel+=' · '+t('cameraGazeCalibUnstable','请停稳再读');
      }
    }
    function karaokePFromRemaining(phase,sec){
      var elapsed=0;
      if(phase==='prepare'){
        elapsed=prepareSec-Math.max(0,Number(sec)||0);
      }else{
        elapsed=prepareSec+(sampleSec-Math.max(0,Number(sec)||0));
      }
      return totalSec>0?Math.max(0,Math.min(1,elapsed/totalSec)):0;
    }
    function paintUi(extra){
      var o={
        title:'',
        subtitle:pointLabel,
        phase:'prepare',
        karaokeP:0
      };
      if(extra){
        for(var k in extra){
          if(Object.prototype.hasOwnProperty.call(extra,k)) o[k]=extra[k];
        }
      }
      // Paint karaoke line once per point; ticks only update fill progress.
      if(o.read==null&&!paintUi._linePainted){
        o.read=readText;
        paintUi._linePainted=true;
      }
      setCalibrationUi(o);
      placeTarget(target.x,target.y);
      if(global.requestAnimationFrame){
        global.requestAnimationFrame(function(){
          if(cancelled||!running||gen!==calibGen) return;
          placeTarget(target.x,target.y);
        });
      }
    }
    paintUi._linePainted=false;
    calibLog('point '+(pointIndex+1)+' attempt '+attempt+' id='+(target.id||'')+
      ' xy='+Number(target.x).toFixed(3)+','+Number(target.y).toFixed(3)+
      ' karaoke='+String(readText).slice(0,24));
    sampleBuf=[];
    collecting=false;
    paintUi({
      read:readText,
      subtitle:pointLabel,
      karaokeP:0,
      phase:'prepare'
    });
    return waitCountdownSec(prepareSec,function(sec){
      if(cancelled||!running||gen!==calibGen) return;
      paintUi({
        title:'',
        subtitle:pointLabel,
        karaokeP:karaokePFromRemaining('prepare',sec),
        phase:sec>0?'prepare':'sample'
      });
    },gen).then(function(){
      if(cancelled||!running||gen!==calibGen) return null;
      collecting=true;
      sampleBuf=[];
      startSamplePump(function(count){
        if(!collecting) return;
        paintUi({
          title:'',
          subtitle:pointLabel+' · '+t('cameraGazeCalibSampling','采样')+' '+count+'/'+MIN_SAMPLES,
          phase:'sample'
        });
      });
      paintUi({
        title:'',
        subtitle:pointLabel,
        karaokeP:karaokePFromRemaining('sample',sampleSec),
        phase:'sample'
      });
      return waitCountdownSec(sampleSec,function(sec){
        if(cancelled||!running||gen!==calibGen) return;
        paintUi({
          title:'',
          subtitle:pointLabel+(sampleBuf.length?(' · '+sampleBuf.length+'/'+MIN_SAMPLES):''),
          karaokeP:karaokePFromRemaining('sample',sec),
          phase:'sample'
        });
      },gen);
    }).then(function(){
      collecting=false;
      stopSamplePump();
      if(cancelled||!running||gen!==calibGen) return null;
      var relaxed=attempt>=MAX_POINT_ATTEMPTS-1;
      var fixation=measureReadFixation()||currentFixation;
      var result=evaluateSampleBuf(target,relaxed,fixation);
      calibLog('point '+(pointIndex+1)+' result '+(result&&result.ok?'ok':'fail')+
        (result&&result.count!=null?' count='+result.count:''));
      return result;
    });
  }

  function waitAndSample(target,pointIndex,gen,maxAttempts,collectedCount){
    var limit=maxAttempts!=null?maxAttempts:maxAttemptsForTarget(target&&target.id);
    function tryAttempt(attempt){
      return waitAndSampleOnce(target,pointIndex,attempt,gen,collectedCount).then(function(res){
        if(!res||res.ok||cancelled||!running||gen!==calibGen) return res;
        if(attempt<limit-1) return tryAttempt(attempt+1);
        return res;
      });
    }
    return tryAttempt(0);
  }

  function targetById(id){
    for(var i=0;i<TARGETS.length;i++){
      if(TARGETS[i].id===id) return TARGETS[i];
    }
    return null;
  }

  function collectedTargetIds(pairs){
    var have={};
    for(var i=0;i<pairs.length;i++){
      var tid=pairs[i].targetId;
      if(tid) have[tid]=true;
    }
    return have;
  }

  function upsertCalibrationPair(pairs,sample){
    if(!sample||!sample.targetId){
      pairs.push(sample);
      return;
    }
    for(var i=0;i<pairs.length;i++){
      if(pairs[i].targetId===sample.targetId){
        pairs[i]=sample;
        return;
      }
    }
    pairs.push(sample);
  }

  function calibrationProgressLabel(pairsOrCount,phase){
    var n=typeof pairsOrCount==='number'?pairsOrCount:(pairsOrCount?pairsOrCount.length:0);
    var total=activeTargetCount();
    var base=t('cameraGazeCalibCollected','已采集 {n}/{total}')
      .replace('{n}',String(n))
      .replace('{total}',String(total));
    if(phase==='remedial'){
      base+=' · '+t('cameraGazeCalibRemedialPhase','补采');
    }
    return base;
  }

  function missingTargetsInOrder(pairs){
    var have=collectedTargetIds(pairs);
    var want={};
    for(var w=0;w<activeTargets.length;w++){
      want[activeTargets[w].id]=true;
    }
    var out=[];
    for(var i=0;i<REMEDIAL_TARGET_ORDER.length;i++){
      var id=REMEDIAL_TARGET_ORDER[i];
      if(!want[id]||have[id]) continue;
      var tg=targetById(id);
      if(tg) out.push(tg);
    }
    return out;
  }

  // Re-sample worst LOO points within the active mode set only.
  function highErrorTargetsFromPairs(pairs){
    var limit=qualityRemedialLimit();
    if(limit<=0||!pairs||pairs.length<minCalibPoints()) return [];
    var prep;
    try{ prep=prepareModelPairs(pairs); }catch(_){ return []; }
    var ridge=fitRidge(prep.pairs);
    var kind=ridge?'ridge':'idw';
    var scored=evalKindWeightedLooRmse(kind,prep.pairs,prep.anchors,prep.scaler);
    var errors=scored.errors||[];
    if(!errors.length) return [];
    var thr=rmseThreshold();
    var cut=Math.max(thr*1.25,220);
    var want={};
    for(var w=0;w<activeTargets.length;w++){
      want[activeTargets[w].id]=true;
    }
    var bad=[];
    for(var i=0;i<errors.length;i++){
      var e=errors[i];
      if(!e||!want[e.targetId]||!isFinite(e.errorPx)||e.errorPx<cut) continue;
      bad.push({id:e.targetId,errorPx:e.errorPx});
    }
    bad.sort(function(a,b){ return b.errorPx-a.errorPx; });
    var out=[];
    for(var j=0;j<bad.length&&out.length<limit;j++){
      var tg=targetById(bad[j].id);
      if(tg){
        calibLog('quality-remedial queue '+bad[j].id+' err='+Math.round(bad[j].errorPx)+'px cut='+Math.round(cut));
        out.push(tg);
      }
    }
    return out;
  }

  function maxAttemptsForTarget(targetId){
    if(CRITICAL_CORNER_IDS.indexOf(targetId)>=0) return MAX_CORNER_ATTEMPTS;
    return MAX_POINT_ATTEMPTS;
  }

  function isCriticalCorner(id){
    return CRITICAL_CORNER_IDS.indexOf(id)>=0;
  }

  function finishFail(reason){
    calibLog('failed: '+(reason||''));
    running=false;
    collecting=false;
    stopSamplePump();
    setLandmarkerThrottle(false);
    clearTimers();
    setOverlayVisible(false);
    setCalibrationUi({countdown:'',phase:'idle'});
    setStatusKind('failed');
    var status=$('cameraStatusText');
    if(status&&reason){
      status.textContent=reason;
    }
  }

  function finishCalibrationFromPairs(pairs,gen){
    running=false;
    collecting=false;
    stopSamplePump();
    setLandmarkerThrottle(false);
    clearTimers();
    calibLog('complete points='+pairs.length+' skipped='+skippedPoints);
    var minPts=minCalibPoints();
    if(pairs.length<minPts){
      setOverlayVisible(false);
      setCalibrationUi({countdown:'',phase:'idle'});
      finishFail(t('cameraGazeCalibrationFailedFew','有效校准点不足（至少 '+minPts+' 个），请重试'));
      return;
    }
    // Fast mode with a skipped corner still builds — mark lowQuality so HUD stays honest.
    if(currentCalibMode==='fast'&&pairs.length<TARGET_SETS.fast.length){
      calibLog('fast accept with gaps points='+pairs.length+'/'+TARGET_SETS.fast.length);
    }
    var buildGen=gen;
    setOverlayVisible(true);
    setStatusKind('running');
    setCalibrationUi({
      title:t('cameraGazeCalibBuilding','正在计算校准模型…'),
      subtitle:'',
      countdown:'',
      phase:'build'
    });
    setTimeout(function(){
      if(cancelled||buildGen!==calibGen) return;
      var t0=Date.now();
      calibLog('build begin');
      buildModelFromPairsAsync(pairs,function(built,err){
        if(cancelled||buildGen!==calibGen) return;
        if(err){
          calibLog('build error '+String(err&&err.message||err));
          finishFail(t('cameraGazeCalibrationFailedFew','有效校准点不足，请重试'));
          return;
        }
        calibLog('build ms='+(Date.now()-t0));
        if(!built||!built.anchors||!built.anchors.length){
          setOverlayVisible(false);
          setCalibrationUi({countdown:'',phase:'idle'});
          setStatusKind('failed');
          return;
        }
        var thr=rmseThreshold();
        built.lowQuality=built.calibrationValidation
          ?built.calibrationValidation.quality==='poor'
          :built.rmse>thr;
        if(currentCalibMode==='fast'&&skippedPoints>0) built.lowQuality=true;
        built.savedAt=Date.now();
        built.skippedPoints=skippedPoints;
        built.synthNodeCount=countSynthGridNodes(built.anchors);
        built.calibMode=currentCalibMode==='fine'?'fine':'fast';
        resetRuntimeSmoothers();
        model=built;
        persistGazeCalibrationSnapshot(serializeModel(model));
        setOverlayVisible(false);
        setCalibrationUi({countdown:'',phase:'idle'});
        setStatusKind(built.lowQuality?'low':'ready');
        var statusEl=$('cameraGazeCalibrationStatus');
        if(statusEl){
          var rmseText=formatCalibStatusText(model,skippedPoints);
          statusEl.textContent=rmseText;
          var glance=$('cameraGlanceCalib');
          if(glance) glance.textContent=rmseText;
        }
        calibLog('saved kind='+model.kind+' mode='+model.calibMode+' rmse='+Math.round(model.rmse)+
          ' quality='+(model.calibrationValidation?model.calibrationValidation.quality:'?')+
          ' synthNodes='+model.synthNodeCount);
        if(model.calibMode==='fast'&&model.lowQuality){
          toastLite(t('cameraGazeCalibSuggestFine','快校精度一般，可尝试「精细校准」'));
        }
        updateCalibWarnings();
        notifyPreviewCalibrated();
        if(global.OneToneCameraWorkflow&&global.OneToneCameraWorkflow.syncGazeMap){
          try{ global.OneToneCameraWorkflow.syncGazeMap(); }catch(_){}
        }
      });
    },0);
  }

  function runRemedialPass(pairs,gen,round,onDone){
    if(cancelled||gen!==calibGen) return;
    var missing=missingTargetsInOrder(pairs);
    if(!missing.length||round>=MAX_REMEDIAL_ROUNDS){
      onDone(pairs);
      return;
    }
    calibLog('remedial round '+(round+1)+' missing='+missing.map(function(t){ return t.id; }).join(','));
    running=true;
    setLandmarkerThrottle(true);
    setOverlayVisible(true);
    setStatusKind('running');
    var overlay=$('cameraGazeCalibrationOverlay');
    if(overlay) overlay.setAttribute('data-calib-phase','remedial');
    var roundTargets=missing.slice();
    var rIdx=0;

    function nextRemedial(){
      if(cancelled||gen!==calibGen) return;
      if(!running){
        onDone(pairs);
        return;
      }
      if(rIdx>=roundTargets.length){
        runRemedialPass(pairs,gen,round+1,onDone);
        return;
      }
      var target=roundTargets[rIdx];
      rIdx++;
      var have=collectedTargetIds(pairs);
      if(have[target.id]){
        waitCountdownSec(0,null,gen).then(nextRemedial);
        return;
      }
      setCalibrationUi({
        title:'',
        read:pickKaraokeForTarget(target),
        subtitle:calibrationProgressLabel(pairs,'remedial')+' · '+
          t('cameraGazeCalibRemedialStep','补采 {id} · 第 {round} 轮')
            .replace('{id}',target.id)
            .replace('{round}',String(round+1)),
        karaokeP:0,
        phase:'remedial'
      });
      placeTarget(target.x,target.y);
      waitAndSample(target,0,gen,MAX_CORNER_ATTEMPTS).then(function(res){
        if(cancelled||gen!==calibGen) return;
        if(!running){
          onDone(pairs);
          return;
        }
        if(res&&res.ok){
          upsertCalibrationPair(pairs,res);
          calibLog('remedial ok '+target.id);
          setCalibrationUi({
            title:'',
            subtitle:t('cameraGazeCalibRemedialOk','补采成功')+' · '+calibrationProgressLabel(pairs,'remedial'),
            karaokeP:1,
            phase:'remedial'
          });
        }else{
          skippedPoints++;
          calibLog('remedial fail '+target.id);
        }
        waitCountdownSec(0.5,null,gen).then(nextRemedial);
      });
    }
    nextRemedial();
  }

  function attemptFinishCalibration(pairs,gen,remedialStarted,qualityStarted){
    var missing=missingTargetsInOrder(pairs);
    if(!remedialStarted&&missing.length>0&&!cancelled&&running){
      runRemedialPass(pairs,gen,0,function(updated){
        if(cancelled||!running) return;
        attemptFinishCalibration(updated,gen,true,false);
      });
      return;
    }
    if(!qualityStarted&&!cancelled&&running){
      var weak=highErrorTargetsFromPairs(pairs);
      if(weak.length){
        calibLog('quality remedial targets='+weak.map(function(t){ return t.id; }).join(','));
        runQualityRemedialPass(pairs,gen,weak,function(updated){
          if(cancelled||!running) return;
          attemptFinishCalibration(updated,gen,true,true);
        });
        return;
      }
    }
    finishCalibrationFromPairs(pairs,gen);
  }

  function runQualityRemedialPass(pairs,gen,targets,onDone){
    if(cancelled||gen!==calibGen||!targets||!targets.length){
      onDone(pairs);
      return;
    }
    running=true;
    setLandmarkerThrottle(true);
    setOverlayVisible(true);
    setStatusKind('running');
    var overlay=$('cameraGazeCalibrationOverlay');
    if(overlay) overlay.setAttribute('data-calib-phase','remedial');
    var roundTargets=targets.slice();
    var rIdx=0;

    function nextQuality(){
      if(cancelled||gen!==calibGen) return;
      if(!running){
        onDone(pairs);
        return;
      }
      if(rIdx>=roundTargets.length){
        onDone(pairs);
        return;
      }
      var target=roundTargets[rIdx];
      rIdx++;
      setCalibrationUi({
        title:'',
        read:pickKaraokeForTarget(target),
        subtitle:calibrationProgressLabel(pairs,'remedial')+' · '+
          t('cameraGazeCalibQualityRetry','高误差补采 {id}')
            .replace('{id}',regionZoneLabel(target.id)),
        karaokeP:0,
        phase:'remedial'
      });
      placeTarget(target.x,target.y);
      waitAndSample(target,0,gen,MAX_CORNER_ATTEMPTS).then(function(res){
        if(cancelled||gen!==calibGen) return;
        if(!running){
          onDone(pairs);
          return;
        }
        if(res&&res.ok){
          var beforeErr=looErrorForTargetId(pairs,target.id);
          var trial=pairs.slice();
          upsertCalibrationPair(trial,res);
          var afterErr=looErrorForTargetId(trial,target.id);
          if(!isFinite(beforeErr)||beforeErr>=1e8||afterErr<=beforeErr*0.95||afterErr+35<beforeErr){
            upsertCalibrationPair(pairs,res);
            calibLog('quality remedial keep '+target.id+
              ' before='+Math.round(beforeErr)+' after='+Math.round(afterErr));
          }else{
            calibLog('quality remedial discard '+target.id+
              ' before='+Math.round(beforeErr)+' after='+Math.round(afterErr)+' (worse)');
          }
        }else{
          calibLog('quality remedial fail '+target.id+' keep previous');
        }
        waitCountdownSec(0.45,null,gen).then(nextQuality);
      });
    }
    nextQuality();
  }

  function runSequence(gen){
    var pairs=[];
    var idx=0;
    skippedPoints=0;
    function next(){
      if(cancelled||!running||gen!==calibGen){
        running=false;
        collecting=false;
        stopSamplePump();
        setLandmarkerThrottle(false);
        clearTimers();
        setOverlayVisible(false);
        setCalibrationUi({countdown:'',phase:'idle'});
        if(cancelled) setStatusKind('canceled');
        return;
      }
      if(idx>=activeTargets.length){
        attemptFinishCalibration(pairs,gen,false);
        return;
      }
      waitAndSample(activeTargets[idx],idx,gen,null,pairs.length).then(function(res){
        if(cancelled||!running||gen!==calibGen){
          running=false;
          collecting=false;
          stopSamplePump();
          setLandmarkerThrottle(false);
          clearTimers();
          setOverlayVisible(false);
          setCalibrationUi({countdown:'',phase:'idle'});
          if(cancelled) setStatusKind('canceled');
          return;
        }
        if(!res||!res.ok){
          skippedPoints++;
          calibLog('skip point '+(idx+1)+' id='+activeTargets[idx].id);
          var skipTitle=isCriticalCorner(activeTargets[idx].id)
            ? t('cameraGazeCalibCornerSkipped','角落采样失败，稍后将补采')
            : t('cameraGazeCalibPointSkipped','本点采样失败，继续下一点');
          setCalibrationUi({
            title:'',
            subtitle:skipTitle+' · '+calibrationProgressLabel(pairs.length)+' · '+
              t('cameraGazeCalibStep','校准点 {n} / {total}')
                .replace('{n}',String(idx+1))
                .replace('{total}',String(activeTargetCount())),
            phase:'prepare'
          });
          idx++;
          waitCountdownSec(0.6,null,gen).then(next);
          return;
        }
        upsertCalibrationPair(pairs,res);
        idx++;
        next();
      });
    }
    next();
  }

  function start(mode){
    if(running) stop({reason:'restart'});
    currentCalibMode=normalizeCalibMode(mode);
    activeTargets=getTargetsForMode(currentCalibMode);
    var preview=global.OneToneCameraPreview;
    if(preview&&preview.setGazeDebugEnabled){
      try{ preview.setGazeDebugEnabled(true); }catch(_){}
    }
    cancelled=false;
    calibGen++;
    var gen=calibGen;
    skippedPoints=0;
    calibAcceptedSamples=0;
    resetCalibPoseRef();
    karaokePicker=null;
    getKaraokePicker();
    clearTimers();
    sampleBuf=[];
    collecting=false;
    running=true;
    setLandmarkerThrottle(true);
    setStatusKind('running');
    setOverlayVisible(true);
    calibLog('start gen='+gen+' mode='+currentCalibMode+' points='+activeTargets.length);
    var first=activeTargets[0]||TARGETS[0];
    setCalibrationUi({
      title:'',
      read:pickKaraokeForTarget(first),
      subtitle:t('cameraGazeCalibStep','校准点 {n} / {total}').replace('{n}','1').replace('{total}',String(activeTargetCount())),
      karaokeP:0,
      phase:'prepare'
    });
    syncCalibrateBtnLabel();
    runSequence(gen);
    return true;
  }

  function stop(opts){
    var reason=opts&&opts.reason?String(opts.reason):'cancel';
    calibLog('stop reason='+reason);
    stopSamplePump();
    setLandmarkerThrottle(false);
    stopCalibWait();
    if(!running){
      if(reason==='cancel'&&statusKind==='running') setStatusKind('canceled');
      clearTimers();
      setOverlayVisible(false);
      collecting=false;
      setCalibrationUi({countdown:'',phase:'idle'});
      return;
    }
    cancelled=true;
    running=false;
    collecting=false;
    resetCalibPoseRef();
    calibGen++;
    clearTimers();
    setOverlayVisible(false);
    setCalibrationUi({countdown:'',phase:'idle'});
    if(reason==='cancel') setStatusKind('canceled');
  }

  function clear(){
    stop({reason:'cancel'});
    if(weakRefitTimer){
      clearTimeout(weakRefitTimer);
      weakRefitTimer=0;
    }
    weakLastSampleAt=0;
    model=null;
    resetRuntimeSmoothers();
    persistGazeCalibrationSnapshot(null);
    setStatusKind('idle');
    updateCalibWarnings();
    notifyPreviewCalibrated();
    if(global.OneToneCameraWorkflow&&global.OneToneCameraWorkflow.syncGazeMap){
      try{ global.OneToneCameraWorkflow.syncGazeMap(); }catch(_){}
    }
  }

  function ensurePreviewReadyForCalib(){
    var preview=global.OneToneCameraPreview;
    if(preview&&preview.setGazeDebugEnabled){
      try{ preview.setGazeDebugEnabled(true); }catch(_){}
    }
    if(preview&&preview.setGazeDebugMode){
      try{ preview.setGazeDebugMode('live'); }catch(_){}
    }
    var st=preview&&preview.getGazeDebugState?preview.getGazeDebugState():null;
    return st;
  }

  function onResize(){
    if(!model) return;
    var w=global.innerWidth||0;
    var h=global.innerHeight||0;
    if(Math.abs(w-model.vw)>2||Math.abs(h-model.vh)>2){
      markModelStale();
    }
  }

  function init(){
    if(bound) return;
    bound=true;
    var startBtn=$('cameraGazeCalibrateBtn');
    var fineBtn=$('cameraGazeCalibrateFineBtn');
    var clearBtn=$('cameraGazeClearCalibrationBtn');
    var proStart=$('cameraProCalibrateBtn');
    var proFine=$('cameraProCalibrateFineBtn');
    var proClear=$('cameraProClearCalibBtn');
    var proRecenter=$('cameraProRecenterBtn');
    if(startBtn){
      startBtn.addEventListener('click',function(e){
        e.preventDefault();
        tryStartCalibrationFromUi('fast');
      });
    }
    if(fineBtn){
      fineBtn.addEventListener('click',function(e){
        e.preventDefault();
        tryStartCalibrationFromUi('fine');
      });
    }
    if(proStart){
      proStart.addEventListener('click',function(e){
        e.preventDefault();
        tryStartCalibrationFromUi('fast');
      });
    }
    if(proFine){
      proFine.addEventListener('click',function(e){
        e.preventDefault();
        tryStartCalibrationFromUi('fine');
      });
    }
    if(clearBtn){
      clearBtn.addEventListener('click',function(e){
        e.preventDefault();
        if(!global.confirm(t('cameraGazeClearConfirm','确定清除本机校准数据？此操作不可撤销。'))) return;
        clear();
      });
    }
    if(proClear){
      proClear.addEventListener('click',function(e){
        e.preventDefault();
        if(!global.confirm(t('cameraGazeClearConfirm','确定清除本机校准数据？此操作不可撤销。'))) return;
        clear();
      });
    }
    var weakToggle=$('cameraWeakCalibEnabled');
    if(weakToggle){
      weakToggle.checked=!!weakClickEnabled;
      weakToggle.addEventListener('change',function(){
        weakClickEnabled=!!weakToggle.checked;
      });
    }
    if(proRecenter){
      proRecenter.addEventListener('click',function(e){
        e.preventDefault();
        var preview=global.OneToneCameraPreview;
        if(preview&&preview.recenterGaze){
          try{ preview.recenterGaze(); }catch(_){}
        }
      });
    }
    var staleRecalibBtn=$('cameraGazeStaleRecalibBtn');
    if(staleRecalibBtn){
      staleRecalibBtn.addEventListener('click',function(e){
        e.preventDefault();
        tryStartCalibrationFromUi(getCalibMode()==='fine'?'fine':'fast');
      });
    }
    global.addEventListener('resize',onResize);
    global.addEventListener('keydown',function(e){
      if(!running||!e) return;
      if(e.key==='Escape'||e.key==='Esc'){
        e.preventDefault();
        stop({reason:'cancel'});
      }
    });
    var cancelBtn=$('cameraGazeCalibrationCancel');
    if(cancelBtn){
      cancelBtn.addEventListener('click',function(e){
        e.preventDefault();
        stop({reason:'cancel'});
      });
    }
    setOverlayVisible(false);
    loadFromPrefs();
    bindWeakCalibrationUi();
    if(!model) setStatusKind('idle');
    else syncUiFromModel();
    updateCalibWarnings();
    syncCalibrateBtnLabel();
  }

  global.OneToneCameraGazeCalibration={
    init:init,
    start:start,
    stop:stop,
    clear:clear,
    onRawPoint:onRawPoint,
    apply:apply,
    getState:getState,
    hasModel:hasModel,
    isFineGridModel:isFineGridModel,
    getCalibMode:getCalibMode,
    syncUiFromModel:syncUiFromModel,
    loadFromPrefs:loadFromPrefs,
    updateLowResWarn:updateLowResWarn,
    updateCalibWarnings:updateCalibWarnings,
    markModelStale:markModelStale,
    syncCalibrationFingerprint:syncCalibrationFingerprint,
    resetRuntimeSmoothers:resetRuntimeSmoothers,
    lockTarget:lockTarget,
    tryAddWeakSample:tryAddWeakSample,
    regionZoneFromNorm:regionZoneFromNorm,
    regionZoneLabel:regionZoneLabel,
    regionCenterNorm:regionCenterNorm
  };

  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',init);
  }else{
    init();
  }
})((typeof window!=='undefined')?window:globalThis);
