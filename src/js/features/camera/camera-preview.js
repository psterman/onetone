(function(global){
  'use strict';

  var $=function(id){ return global.OneToneDom&&global.OneToneDom.$?global.OneToneDom.$(id):document.getElementById(id); };
  var t=function(key,fallback){
    if(global.OneToneI18n&&global.OneToneI18n.t){
      var v=global.OneToneI18n.t(key);
      if(v&&v!==key) return v;
    }
    return fallback!=null?fallback:key;
  };

  var stream=null;
  var devices=[];
  var previewLive=false;
  var starting=false;
  var bound=false;
  var metaTimer=0;
  var applyingCaps=false;
  var lastCapabilities=null;
  var uiResKey='';
  var uiResGroup='landscape';
  var uiFps=0;
  var lastError=null;
  var previewStatus='idle';
  var statusListeners=[];

  var RES_GROUPS=[
    {
      id:'landscape',
      labelKey:'cameraResGroupLandscape',
      labelFallback:'横屏',
      items:[
        {w:3840,h:2160,labelKey:'cameraRes4k',labelFallback:'4K'},
        {w:2560,h:1440,labelKey:'cameraResQhd',labelFallback:'2K'},
        {w:1920,h:1080,labelKey:'cameraResFullHd',labelFallback:'全高清'},
        {w:1280,h:720,labelKey:'cameraRes720p',labelFallback:'720p'},
        {w:640,h:360,labelKey:'cameraRes360p',labelFallback:'360p'}
      ]
    },
    {
      id:'portrait',
      labelKey:'cameraResGroupPortrait',
      labelFallback:'竖屏',
      items:[
        {w:1080,h:1920,labelFallback:'1080 × 1920'},
        {w:720,h:1280,labelFallback:'720 × 1280'},
        {w:360,h:640,labelFallback:'360 × 640'}
      ]
    },
    {
      id:'square',
      labelKey:'cameraResGroupSquare',
      labelFallback:'方形',
      items:[
        {w:1080,h:1080,labelFallback:'1080 × 1080'},
        {w:720,h:720,labelFallback:'720 × 720'},
        {w:360,h:360,labelFallback:'360 × 360'}
      ]
    }
  ];
  var FPS_PILLS=[25,30,50,60];

  function enhancerApi(){
    return global.OneToneCameraVideoEnhancer||null;
  }

  function defaultVideoEnhancement(){
    var api=enhancerApi();
    if(api&&api.defaultPrefs) return api.defaultPrefs();
    return {enabled:false,look:'off',faceMask:'off',preset:'natural',beautyEnabled:false,whiten:0,smooth:0,rosy:0,slim:0,beauty:18,brightness:0,contrast:8,saturation:6,sharpen:8,denoise:8,lowLight:0,antiFlicker:'auto',displayFrameRate:0};
  }

  function ensureVideoEnhancement(prefs){
    if(!prefs||typeof prefs!=='object') return defaultVideoEnhancement();
    var api=enhancerApi();
    if(api&&api.normalizePrefs){
      prefs.videoEnhancement=api.normalizePrefs(prefs.videoEnhancement);
    }else if(!prefs.videoEnhancement||typeof prefs.videoEnhancement!=='object'){
      prefs.videoEnhancement=defaultVideoEnhancement();
    }
    return prefs.videoEnhancement;
  }

  function allResItems(){
    var out=[];
    for(var g=0;g<RES_GROUPS.length;g++){
      var items=RES_GROUPS[g].items||[];
      for(var i=0;i<items.length;i++) out.push(items[i]);
    }
    return out;
  }

  function resKey(w,h){ return Math.round(w)+'x'+Math.round(h); }

  function findResGroup(id){
    for(var g=0;g<RES_GROUPS.length;g++){
      if(RES_GROUPS[g].id===id) return RES_GROUPS[g];
    }
    return RES_GROUPS[0]||null;
  }

  function inferResGroup(key){
    if(!key) return 'landscape';
    var parts=key.split('x');
    if(parts.length!==2) return 'landscape';
    var w=parseInt(parts[0],10)||0;
    var h=parseInt(parts[1],10)||0;
    if(w===h) return 'square';
    if(h>w) return 'portrait';
    return 'landscape';
  }

  function findResItem(key){
    if(!key) return null;
    var items=allResItems();
    for(var i=0;i<items.length;i++){
      if(resKey(items[i].w,items[i].h)===key) return items[i];
    }
    return null;
  }

  function resLabel(item,w,h){
    if(item){
      if(item.labelKey) return t(item.labelKey,item.labelFallback||resKey(item.w,item.h));
      return item.labelFallback||resKey(item.w,item.h);
    }
    if(w&&h) return Math.round(w)+' × '+Math.round(h);
    return t('cameraCapAuto','自动');
  }

  // --- Gaze debug runtime (mock + local MediaPipe gaze proxy) ---
  var GAZE_SMOOTH_ALPHA=0.28;
  var GAZE_SMOOTH_ALPHA_LIVE=0.55;
  var GAZE_SMOOTH_SNAP=0.78;
  var GAZE_SMOOTH_ALPHA_CALIBRATED=0.38;
  var GAZE_CALIB_JITTER_DEADBAND_PX=2.0;
  var GAZE_LOW_CONF=0.35;
  var GAZE_COACH_ROTATE_MS=4800;
  var karaokeApi=function(){ return global.OneToneGazeKaraoke||null; };
  var GAZE_COACH_LINES=(karaokeApi()&&karaokeApi().LINES)||[
    '看哪里 · 说哪里',
    '方位对了就算赢，像素别较真',
    '转头到左上角，打个招呼',
    '正中休息一下也行',
    '最后一句：看字，不看球'
  ];
  // Placement zones only — karaoke lines drive the test sequence (not a fixed 9-cell tour).
  var GAZE_COACH_ZONES=(karaokeApi()&&karaokeApi().ZONES)||[
    'tl','tc','tr','ml','center','mr','bl','bc','br'
  ];
  var gazeCoach={
    idx:0,
    shuffled:null,
    zoneBag:null,
    zoneBagIdx:0,
    line:'',
    lineStartedAt:0,
    active:false,
    zone:'center',
    holdZone:null,
    holdSince:0,
    placed:false,
    cardW:0,
    cardH:0,
    pausedP:0,
    picker:null,
    wanted:false
  };
  var gaze={
    enabled:true,
    mode:'live',
    raf:0,
    lastTs:0,
    scanT:0,
    external:false,
    modelLoading:false,
    modelFailed:false,
    point:{x:0.5,y:0.5,confidence:0,state:'idle'},
    smooth:{x:0.5,y:0.5},
    smoothClient:{x:0,y:0},
    pointer:{x:0.5,y:0.5,inside:false}
  };

  function shuffleInPlace(arr){
    var api=karaokeApi();
    if(api&&api.shuffleInPlace) return api.shuffleInPlace(arr);
    for(var j=arr.length-1;j>0;j--){
      var k=Math.floor(Math.random()*(j+1));
      var tmp=arr[j];arr[j]=arr[k];arr[k]=tmp;
    }
    return arr;
  }

  function getCoachPicker(){
    if(!gazeCoach.picker){
      var api=karaokeApi();
      gazeCoach.picker=api&&api.createPicker?api.createPicker():null;
    }
    return gazeCoach.picker;
  }

  function nextCoachLine(){
    var picker=getCoachPicker();
    if(picker&&picker.next) return picker.next();
    if(!gazeCoach.shuffled||gazeCoach.idx>=gazeCoach.shuffled.length){
      var arr=[];
      for(var i=0;i<GAZE_COACH_LINES.length;i++) arr.push(i);
      gazeCoach.shuffled=shuffleInPlace(arr);
      gazeCoach.idx=0;
    }
    var line=GAZE_COACH_LINES[gazeCoach.shuffled[gazeCoach.idx++]];
    return line||GAZE_COACH_LINES[0];
  }

  function nextShuffledZone(){
    if(!gazeCoach.zoneBag||gazeCoach.zoneBagIdx>=gazeCoach.zoneBag.length){
      gazeCoach.zoneBag=shuffleInPlace(GAZE_COACH_ZONES.slice());
      gazeCoach.zoneBagIdx=0;
    }
    return gazeCoach.zoneBag[gazeCoach.zoneBagIdx++]||'center';
  }

  // Karaoke copy chooses where to stand; no fixed 九宫格 tour order.
  function zoneFromCoachLine(line){
    var api=karaokeApi();
    if(api&&api.zoneHint){
      var hinted=api.zoneHint(line);
      if(hinted) return hinted;
    }
    var s=String(line||'');
    if(/左上/.test(s)) return 'tl';
    if(/右上/.test(s)) return 'tr';
    if(/左下/.test(s)) return 'bl';
    if(/右下/.test(s)) return 'br';
    if(/上中|顶部|顶边|上方|抬头看顶|看顶/.test(s)) return 'tc';
    if(/下中|底部|下方点头|下边/.test(s)) return 'bc';
    if(/左中|左侧|去左边|左转/.test(s)) return 'ml';
    if(/右中|右侧|去右边|右转看右/.test(s)) return 'mr';
    if(/正中|屏幕正中|中间休息|驿站|回正中/.test(s)) return 'center';
    return nextShuffledZone();
  }

  function coachRegionCenter(zoneId){
    var cal=calibrationApi();
    if(cal&&cal.regionCenterNorm){
      return cal.regionCenterNorm(zoneId);
    }
    var map={
      tl:{nx:0.14,ny:0.14},tc:{nx:0.5,ny:0.12},tr:{nx:0.86,ny:0.14},
      ml:{nx:0.12,ny:0.5},center:{nx:0.5,ny:0.5},mr:{nx:0.88,ny:0.5},
      bl:{nx:0.14,ny:0.86},bc:{nx:0.5,ny:0.88},br:{nx:0.86,ny:0.86}
    };
    return map[zoneId]||map.center;
  }

  function setKaraokeProgress(p){
    p=Math.max(0,Math.min(1,p));
    var charsEl=$('cameraGazeKaraokeChars');
    var meter=$('cameraGazeKaraokeMeter');
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

  function paintCoachLine(text){
    var charsEl=$('cameraGazeKaraokeChars');
    var base=$('cameraGazeKaraokeBase');
    var fill=$('cameraGazeKaraokeFill');
    var line=String(text||'');
    if(base) base.textContent=line;
    if(fill) fill.textContent=line;
    if(charsEl){
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
    }
    gazeCoach.line=line;
    gazeCoach.lineStartedAt=Date.now();
    gazeCoach.pausedP=0;
    setKaraokeProgress(0);
  }

  function placeCoachAtZone(zoneId,force){
    var el=$('cameraGazeCoach');
    if(!el) return;
    var zone=String(zoneId||'center');
    if(!force&&gazeCoach.zone===zone&&gazeCoach.placed) return;
    var vw=global.innerWidth||1;
    var vh=global.innerHeight||1;
    var c=coachRegionCenter(zone);
    var cx=c.nx*vw;
    var cy=c.ny*vh;
    var w=gazeCoach.cardW||el.offsetWidth||Math.min(440,vw*0.78);
    var h=gazeCoach.cardH||el.offsetHeight||88;
    if(el.offsetWidth>0) gazeCoach.cardW=el.offsetWidth;
    if(el.offsetHeight>0) gazeCoach.cardH=el.offsetHeight;
    w=gazeCoach.cardW||w;
    h=gazeCoach.cardH||h;
    var margin=18;
    var left=Math.max(margin+w/2,Math.min(vw-margin-w/2,cx));
    var top=Math.max(margin+h/2,Math.min(vh-margin-h/2,cy));
    el.style.left=Math.round(left)+'px';
    el.style.top=Math.round(top)+'px';
    el.style.transform='translate(-50%,-50%)';
    el.setAttribute('data-zone',zone);
    gazeCoach.zone=zone;
    gazeCoach.placed=true;
  }

  function setCoachVisible(show){
    var el=$('cameraGazeCoach');
    if(!el) return;
    // Live karaoke is opt-in (gazeCoach.wanted). Idle / settings / stopped preview: never show.
    var allow=!!show&&!!gazeCoach.wanted&&!!previewLive&&!!gaze.enabled;
    gazeCoach.active=allow;
    if(!allow){
      el.hidden=true;
      el.setAttribute('hidden','');
      el.classList.remove('is-visible','is-hit');
      gazeCoach.placed=false;
      setKaraokeProgress(0);
      return;
    }
    el.hidden=false;
    el.removeAttribute('hidden');
    if(global.requestAnimationFrame){
      global.requestAnimationFrame(function(){ el.classList.add('is-visible'); });
    }else{
      el.classList.add('is-visible');
    }
  }

  function stopKaraokeTest(){
    gazeCoach.wanted=false;
    gazeCoach.active=false;
    gazeCoach.line='';
    gazeCoach.pausedP=0;
    setCoachVisible(false);
  }

  function startKaraokeTest(){
    if(!previewLive||!gaze.enabled) return;
    var cal=calibrationApi();
    if(!(cal&&cal.hasModel&&cal.hasModel())) return;
    gazeCoach.wanted=true;
    startNextKaraokeLine(true);
  }

  function startNextKaraokeLine(forceNewLine){
    if(!gazeCoach.wanted) return;
    if(forceNewLine||!gazeCoach.line){
      var line=nextCoachLine();
      paintCoachLine(line);
      placeCoachAtZone(zoneFromCoachLine(line),true);
    }else if(!gazeCoach.placed){
      placeCoachAtZone(gazeCoach.zone||'center',true);
    }
    setCoachVisible(true);
  }

  function advanceKaraokeLine(){
    startNextKaraokeLine(true);
  }

  function tickCoachKaraoke(gazeZone){
    if(!gazeCoach.active||!previewLive||!gaze.enabled) return;
    var cal=calibrationApi();
    var calRunning=!!(cal&&cal.getState&&cal.getState().running);
    if(calRunning){
      setCoachVisible(false);
      return;
    }
    var targetZone=gazeCoach.zone||'center';
    placeCoachAtZone(targetZone,false);
    var onTarget=!!gazeZone&&String(gazeZone)===String(targetZone);
    var coachEl=$('cameraGazeCoach');
    var orbEl=$('cameraGazeWindowOrb');
    if(coachEl) coachEl.classList.toggle('is-hit',onTarget);
    if(orbEl) orbEl.classList.toggle('is-on-target',onTarget);
    var now=Date.now();
    var started=gazeCoach.lineStartedAt||now;
    // Fill only while looking at the karaoke line's region — karaoke sequence is the test.
    if(!onTarget){
      gazeCoach.lineStartedAt=now-(GAZE_COACH_ROTATE_MS*Math.min(0.98,gazeCoach.pausedP||0));
      setKaraokeProgress(gazeCoach.pausedP||0);
      return;
    }
    var p=(now-started)/GAZE_COACH_ROTATE_MS;
    gazeCoach.pausedP=p;
    if(p>=1){
      gazeCoach.pausedP=0;
      advanceKaraokeLine();
      return;
    }
    setKaraokeProgress(p);
  }

  function updateCoachLine(force){
    if(force||!gazeCoach.line){
      startNextKaraokeLine(true);
    }
  }

  function placeCoachNearGaze(){
    // legacy no-op — karaoke line placement owns the target
  }

  function landmarkerApi(){
    return global.OneToneCameraGazeLandmarker||null;
  }

  function handGestureApi(){
    return global.OneToneCameraHandGesture||null;
  }

  function calibrationApi(){
    return global.OneToneCameraGazeCalibration||null;
  }

  function cancelCalibration(){
    var api=calibrationApi();
    if(api&&api.stop){
      try{ api.stop({reason:'cancel'}); }catch(_){}
    }
  }

  function stopLandmarker(){
    var api=landmarkerApi();
    if(api&&api.stop){
      try{ api.stop(); }catch(_){}
    }
    if(gaze.mode==='live'){
      gaze.external=false;
    }
  }

  function stopHandGesture(){
    var api=handGestureApi();
    if(api&&api.stop){
      try{ api.stop(); }catch(_){}
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

  function handGestureWanted(){
    var api=presenceApi();
    if(!api||!api.prefs) return false;
    var prefs;
    try{ prefs=api.prefs(); }catch(_){ prefs=null; }
    if(!prefs) return false;
    return prefs.openPalm!=='none'||prefs.okHand!=='none'||prefs.fist!=='none'||prefs.wave!=='none'
      ||!!(prefs.triggers&&(prefs.triggers.openPalm||prefs.triggers.okHand||prefs.triggers.fist||prefs.triggers.wave));
  }

  /** Preview-live hand recognizer on raw video; soft-fail if model missing. */
  function syncHandGesture(){
    if(!previewLive){
      stopHandGesture();
      return Promise.resolve(false);
    }
    // Presence home still runs getUserMedia + gaze (DETECT_HOME_MS floor). Hand Worker is
    // separate: only when openPalm/ok/fist/wave bound, or camera settings panel is open.
    if(!handGestureWanted()&&!cameraPanelHot()){
      stopHandGesture();
      return Promise.resolve(false);
    }
    var api=handGestureApi();
    if(!api||!api.start) return Promise.resolve(false);
    var video=$('cameraPreviewVideo');
    if(!video) return Promise.resolve(false);
    try{
      if(api.attach) api.attach(video);
    }catch(_){}
    var started;
    try{
      started=api.start(video);
    }catch(err){
      return Promise.resolve(false);
    }
    if(started&&typeof started.then==='function'){
      return started.then(function(ok){ return !!ok; }).catch(function(){ return false; });
    }
    return Promise.resolve(!!started);
  }

  function presenceApi(){
    return global.OneToneCameraPresenceActions||null;
  }

  function smartPointerApi(){
    return global.OneToneCameraSmartPointer||null;
  }

  function smartPointerWanted(){
    var sp=smartPointerApi();
    if(!sp) return false;
    try{
      if(sp.isWanted) return !!sp.isWanted();
      var s=sp.getSettings?sp.getSettings():null;
      return !!(s&&s.enabled);
    }catch(_){
      return false;
    }
  }

  function snapWindowApi(){
    return global.OneToneCameraSnapWindow||null;
  }

  function autoMuteApi(){
    return global.OneToneCameraAutoMute||null;
  }

  function snapOrMuteWanted(){
    try{
      var snap=snapWindowApi();
      if(snap&&snap.isWanted&&snap.isWanted()) return true;
      var am=autoMuteApi();
      if(am&&am.isWanted&&am.isWanted()) return true;
    }catch(_){}
    return false;
  }

  function presenceEnabled(){
    var api=presenceApi();
    return !!(api&&api.isEnabled&&api.isEnabled());
  }

  function syncPresenceDetectInterval(){
    var api=presenceApi();
    if(api&&api.syncDetectInterval){
      try{ api.syncDetectInterval(); }catch(_){}
    }
    var lm=landmarkerApi();
    if(!lm||!lm.setDetectIntervalMs) return;
    var cal=calibrationApi();
    var calRunning=!!(cal&&cal.getState&&cal.getState().running);
    var panelHot=cameraPanelHot();
    // Presence already applied DETECT_HOME_MS — do not overwrite with gaze full-rate on home.
    if(presenceEnabled()&&!panelHot&&!calRunning) return;
    var spWanted=smartPointerWanted();
    var gazeMs=33;
    if(api&&api.preferredDetectIntervalMs){
      try{ gazeMs=api.preferredDetectIntervalMs(getCaptureFpsHint())||33; }catch(_){ gazeMs=33; }
    }
    if((gaze.enabled&&panelHot)||calRunning){
      lm.setDetectIntervalMs(gazeMs);
      return;
    }
    var snapMuteWanted=snapOrMuteWanted();
    // Smart Pointer / Snap / AutoMute alone: 66–100ms is enough for coarse classify.
    if((spWanted||snapMuteWanted)&&!presenceEnabled()){
      var spMs=(smartPointerApi()&&smartPointerApi().DETECT_INTERVAL_MS)||80;
      lm.setDetectIntervalMs(Math.max(66,Math.min(100,spMs|0)));
      return;
    }
    if(!presenceEnabled()){
      if(spWanted||snapMuteWanted){
        lm.setDetectIntervalMs(80);
        return;
      }
      lm.setDetectIntervalMs(gazeMs);
      return;
    }
    if(spWanted||snapMuteWanted){
      lm.setDetectIntervalMs(80);
      return;
    }
    var st=api&&api.getState?api.getState():null;
    lm.setDetectIntervalMs(st&&st.presence==='away'?333:100);
  }

  function getCaptureFpsHint(){
    var tr=activeVideoTrack();
    if(tr&&tr.getSettings){
      try{
        var s=tr.getSettings();
        if(s&&s.frameRate>0) return Math.round(s.frameRate);
      }catch(_){}
    }
    if(uiFps>0) return uiFps|0;
    var prefs=cameraPrefs();
    if(prefs&&prefs.selectedFrameRate>0) return prefs.selectedFrameRate|0;
    return 0;
  }

  function attachEnhancer(){
    var api=enhancerApi();
    if(!api||!api.attach) return;
    try{ api.attach($('cameraPreviewVideo'),$('cameraPreviewShell')); }catch(_){}
  }

  function detachEnhancer(){
    var api=enhancerApi();
    if(!api||!api.detach) return;
    try{ api.detach(); }catch(_){}
  }

  function notifyEnhancerResize(){
    var api=enhancerApi();
    if(!api) return;
    try{
      if(api.syncFromCameraPrefs) api.syncFromCameraPrefs();
      if(api.renderOnce) api.renderOnce();
    }catch(_){}
  }

  function onLandmarkerPoint(point){
    if(!previewLive) return;
    // Smart Pointer first — must not be gated by gaze.mode / overlay.
    try{
      var sp=smartPointerApi();
      if(sp&&sp.onGazeFrame) sp.onGazeFrame(point);
    }catch(_){}
    try{
      var snap=snapWindowApi();
      if(snap&&snap.onGazeFrame) snap.onGazeFrame(point);
    }catch(_){}
    try{
      var am=autoMuteApi();
      if(am&&am.onGazeFrame) am.onGazeFrame(point);
    }catch(_){}
    // Feed presence — even when gaze overlay is off (decoupling).
    if(presenceEnabled()){
      var pa=presenceApi();
      if(pa&&pa.onFrame){
        try{ pa.onFrame(point); }catch(_){}
      }
    }
    if(gaze.mode!=='live') return;
    var cal=calibrationApi();
    var calRunning=!!(cal&&cal.getState&&cal.getState().running);
    if(!gaze.enabled&&!calRunning) return;
    updateGazePoint(point);
  }

  function syncLiveLandmarker(){
    var cal=calibrationApi();
    var calRunning=!!(cal&&cal.getState&&cal.getState().running);
    var want=(!!gaze.enabled||calRunning||presenceEnabled()||smartPointerWanted()||snapOrMuteWanted())&&!!previewLive&&gaze.mode==='live'&&!gaze.modelFailed;
    var api=landmarkerApi();
    if(!want){
      stopLandmarker();
      gaze.modelLoading=false;
      return Promise.resolve();
    }
    if(!api||!api.start){
      gaze.modelFailed=true;
      gaze.modelLoading=false;
      setStatus(t('cameraGazeModelFailed','模型加载失败，已停止实时估计'));
      stopLandmarker();
      return Promise.resolve();
    }
    if(gaze.modelLoading){
      return Promise.resolve();
    }
    syncPresenceDetectInterval();
    if(api.isRunning&&api.isRunning()){
      return Promise.resolve();
    }
    var video=$('cameraPreviewVideo');
    if(!video) return Promise.resolve();
    gaze.modelLoading=true;
    setStatus(t('cameraGazeModelLoading','模型加载中'));
    return api.start(video,onLandmarkerPoint).then(function(){
      gaze.modelLoading=false;
      gaze.modelFailed=false;
      syncPresenceDetectInterval();
      if(previewLive){
        setStatus(t('cameraStatusLive','预览中 · 仅本地显示'));
      }
    }).catch(function(err){
      gaze.modelLoading=false;
      gaze.modelFailed=true;
      gaze.external=false;
      stopLandmarker();
      setStatus(t('cameraGazeModelFailed','模型加载失败，已停止实时估计'));
      if(global.console&&console.warn){
        console.warn('[camera-gaze]',err&&err.message?err.message:err);
      }
    });
  }

  function state(){
    return global.OneToneState&&global.OneToneState.state?global.OneToneState.state:{};
  }

  function ephemeralCameraPrefs(){
    return {enabled:false,selectedDeviceId:'',previewEnabled:false,selectedWidth:0,selectedHeight:0,selectedFrameRate:0,gazeCalibration:null,blinkBaseline:null,smartPointer:null,snapWindow:null,autoMute:null,presenceActions:{enabled:false,triggers:{away:false,shake:false,blink:false},onAway:'none',onReturn:'none',shakeHead:'none',deliberateBlink:'none'},videoEnhancement:defaultVideoEnhancement()};
  }

  function configPersistLoaded(){
    return !!(global.OneToneConfigPersist&&global.OneToneConfigPersist.isLoaded&&global.OneToneConfigPersist.isLoaded());
  }

  function cameraPrefs(){
    var st=state();
    if(!st.config||typeof st.config!=='object'){
      if(global.OneToneState&&global.OneToneState.state){
        if(!global.OneToneState.state.config) global.OneToneState.state.config={};
        st=global.OneToneState.state;
      }else{
        return ephemeralCameraPrefs();
      }
    }
    var cfg=st.config;
    if(!cfg.cameraPrefs||typeof cfg.cameraPrefs!=='object'){
      if(!configPersistLoaded()) return ephemeralCameraPrefs();
      cfg.cameraPrefs=ephemeralCameraPrefs();
    }
    if(cfg.cameraPrefs.gazeCalibration===undefined) cfg.cameraPrefs.gazeCalibration=null;
    if(cfg.cameraPrefs.blinkBaseline===undefined) cfg.cameraPrefs.blinkBaseline=null;
    if(cfg.cameraPrefs.smartPointer===undefined) cfg.cameraPrefs.smartPointer=null;
    if(cfg.cameraPrefs.snapWindow===undefined) cfg.cameraPrefs.snapWindow=null;
    if(cfg.cameraPrefs.autoMute===undefined) cfg.cameraPrefs.autoMute=null;
    if(!cfg.cameraPrefs.presenceActions||typeof cfg.cameraPrefs.presenceActions!=='object'){
      cfg.cameraPrefs.presenceActions={enabled:false,triggers:{away:false,shake:false,blink:false},onAway:'none',onReturn:'none',shakeHead:'none',deliberateBlink:'none'};
    }
    ensureVideoEnhancement(cfg.cameraPrefs);
    // Deprecated mirror — presenceActions.enabled is the sole intent source.
    if(cfg.cameraPrefs.presenceActions){
      cfg.cameraPrefs.enabled=!!cfg.cameraPrefs.presenceActions.enabled;
    }
    return cfg.cameraPrefs;
  }

  function persistCameraPrefs(partial){
    var prefs=cameraPrefs();
    if(partial&&typeof partial==='object'){
      if(partial.selectedDeviceId!=null) prefs.selectedDeviceId=String(partial.selectedDeviceId||'').trim();
      if(partial.selectedWidth!=null) prefs.selectedWidth=Math.max(0,Number(partial.selectedWidth)||0)|0;
      if(partial.selectedHeight!=null) prefs.selectedHeight=Math.max(0,Number(partial.selectedHeight)||0)|0;
      if(partial.selectedFrameRate!=null) prefs.selectedFrameRate=Math.max(0,Number(partial.selectedFrameRate)||0)|0;
      if(partial.gazeCalibration!==undefined) prefs.gazeCalibration=partial.gazeCalibration;
      if(partial.smartPointer!==undefined) prefs.smartPointer=partial.smartPointer;
      if(partial.snapWindow!==undefined) prefs.snapWindow=partial.snapWindow;
      if(partial.autoMute!==undefined) prefs.autoMute=partial.autoMute;
      if(partial.presenceActions!==undefined) prefs.presenceActions=partial.presenceActions;
      if(partial.proFeatures!==undefined){
        var pg=global.OneToneCameraProGlance;
        prefs.proFeatures=pg&&pg.normalizeProFeatures
          ?pg.normalizeProFeatures(partial.proFeatures)
          :partial.proFeatures;
      }
      if(partial.videoEnhancement!==undefined){
        var api=enhancerApi();
        var merged=Object.assign({},ensureVideoEnhancement(prefs),partial.videoEnhancement||{});
        prefs.videoEnhancement=api&&api.normalizePrefs?api.normalizePrefs(merged):merged;
      }
    }
    // Schema only — never auto-start from previewEnabled.
    prefs.previewEnabled=false;
    if(global.OneToneConfigPersist){
      if(global.OneToneConfigPersist.saveCameraPrefsQuiet) global.OneToneConfigPersist.saveCameraPrefsQuiet();
      else if(global.OneToneConfigPersist.saveAsync) global.OneToneConfigPersist.saveAsync();
      else if(global.OneToneConfigPersist.save) global.OneToneConfigPersist.save();
    }
  }

  function persistSelectedDeviceId(deviceId){
    persistCameraPrefs({selectedDeviceId:deviceId});
  }

  function setStatus(msg){
    var el=$('cameraStatusText');
    if(el) el.textContent=msg;
    var vis=$('cameraRuntimeStatusText');
    if(vis&&msg&&!global.OneToneCameraPresenceActions){
      vis.textContent=msg;
    }
  }

  function emitPreviewStatus(){
    var snap={
      previewLive:!!previewLive,
      starting:!!starting,
      status:previewStatus,
      lastError:lastError?{code:lastError.code,message:lastError.message}:null
    };
    for(var i=0;i<statusListeners.length;i++){
      try{ statusListeners[i](snap); }catch(_){}
    }
  }

  function setPreviewError(err){
    var message=mapError(err);
    lastError={
      code:String(err&&(err.name||err.code)||'start_failed'),
      message:message
    };
    previewStatus='error';
    setStatus(message);
    emitPreviewStatus();
    return lastError;
  }

  function clearPreviewError(){
    lastError=null;
  }

  function setButtons(){
    var startBtn=$('cameraPreviewStartBtn');
    if(startBtn){
      startBtn.disabled=!!starting;
      startBtn.setAttribute('aria-label',t('cameraPreviewStart','启动'));
      startBtn.title=t('cameraPreviewStart','启动');
    }
  }

  function setPlaceholderVisible(show){
    var shell=$('cameraPreviewShell');
    var ph=$('cameraPreviewStartBtn')||$('cameraPreviewPlaceholder');
    if(shell) shell.classList.toggle('is-live',!show);
    if(ph) ph.hidden=!show;
  }

  function startFromPlaceholder(){
    if(starting||previewLive) return;
    var pa=global.OneToneCameraPresenceActions;
    if(pa&&pa.persist&&!(pa.isEnabled&&pa.isEnabled())){
      try{ pa.persist({enabled:true}); }catch(_){}
      return;
    }
    if(pa&&pa.requestRestart){
      pa.requestRestart({reason:'user_restart'});
      return;
    }
    startPreview({reason:'user_restart'});
  }

  function selectedDeviceLabel(){
    var sel=$('cameraDeviceSelect');
    if(!sel||!sel.options.length) return '—';
    var opt=sel.options[sel.selectedIndex];
    return opt?String(opt.textContent||'').trim()||'—':'—';
  }

  function updateInfoCards(trackSettings){
    var curEl=$('cameraInfoCurrentDevice');
    var resEl=$('cameraInfoResolution');
    var fpsEl=$('cameraInfoFps');
    if(curEl) curEl.textContent=selectedDeviceLabel();
    if(resEl){
      if(trackSettings&&trackSettings.width&&trackSettings.height){
        resEl.textContent=String(Math.round(trackSettings.width))+' × '+String(Math.round(trackSettings.height));
      }else{
        resEl.textContent='—';
      }
    }
    if(fpsEl){
      if(trackSettings&&trackSettings.frameRate){
        fpsEl.textContent=String(Math.round(Number(trackSettings.frameRate)||0));
      }else{
        fpsEl.textContent='—';
      }
    }
  }

  function rangeAllows(range,value){
    if(!range||typeof range!=='object') return true;
    var v=Number(value);
    if(!isFinite(v)) return false;
    if(range.min!=null&&v<Number(range.min)) return false;
    if(range.max!=null&&v>Number(range.max)) return false;
    return true;
  }

  function modeAllowed(caps,w,h,fps){
    if(!caps) return true;
    if(w>0&&caps.width&&!rangeAllows(caps.width,w)) return false;
    if(h>0&&caps.height&&!rangeAllows(caps.height,h)) return false;
    if(fps>0&&caps.frameRate&&!rangeAllows(caps.frameRate,fps)) return false;
    return true;
  }

  function setCapHint(kind){
    var el=$('cameraCapabilityHint');
    if(!el) return;
    if(kind==='live') el.textContent=t('cameraCapHintLive','从下拉菜单选择即可切换；不支持的档位会自动回退');
    else if(kind==='unsupported') el.textContent=t('cameraCapHintUnsupported','当前设备能力有限，仍可尝试切换常见档位');
    else el.textContent=t('cameraCapHintIdle','开启识别后可从下拉菜单切换分辨率与帧率');
  }

  function syncPreviewAspect(w,h){
    var shell=$('cameraPreviewShell');
    if(!shell) return;
    if(w>0&&h>0) shell.style.aspectRatio=String(Math.round(w))+' / '+String(Math.round(h));
    else shell.style.aspectRatio='16 / 9';
  }

  function optionLabelWithCap(base,live,caps,w,h,fps){
    if(live&&caps&&!modeAllowed(caps,w||0,h||0,fps||0)){
      return base+' · '+t('cameraCapLimited','受限');
    }
    return base;
  }

  function fillOrientationSelect(){
    var sel=$('cameraResGroupSelect');
    if(!sel) return;
    sel.innerHTML='';
    for(var g=0;g<RES_GROUPS.length;g++){
      var group=RES_GROUPS[g];
      var opt=document.createElement('option');
      opt.value=group.id;
      opt.textContent=t(group.labelKey,group.labelFallback||group.id);
      sel.appendChild(opt);
    }
    var want=uiResGroup||'landscape';
    if(findResGroup(want)) sel.value=want;
    else sel.value='landscape';
    uiResGroup=String(sel.value||'landscape');
  }

  function fillResSelect(caps,live){
    var sel=$('cameraResSelect');
    if(!sel) return;
    var group=findResGroup(uiResGroup)||RES_GROUPS[0];
    var prev=uiResKey||'';
    var items=group&&group.items?group.items:[];
    sel.innerHTML='';
    for(var i=0;i<items.length;i++){
      var it=items[i];
      var key=resKey(it.w,it.h);
      var opt=document.createElement('option');
      opt.value=key;
      opt.textContent=optionLabelWithCap(resLabel(it),live,caps,it.w,it.h,0);
      sel.appendChild(opt);
    }
    if(prev){
      var kept=false;
      for(var k=0;k<items.length;k++){
        if(resKey(items[k].w,items[k].h)===prev){ kept=true; break; }
      }
      if(kept){
        sel.value=prev;
        uiResKey=prev;
      }else if(sel.options.length){
        sel.selectedIndex=0;
        uiResKey=String(sel.value||'');
      }else{
        uiResKey='';
      }
    }else if(sel.options.length){
      sel.selectedIndex=0;
      uiResKey=String(sel.value||'');
    }else{
      uiResKey='';
    }
  }

  function fillFpsSelect(caps,live){
    var sel=$('cameraFpsSelect');
    if(!sel) return;
    sel.innerHTML='';
    var autoOpt=document.createElement('option');
    autoOpt.value='0';
    autoOpt.textContent=t('cameraFpsAuto','Auto');
    sel.appendChild(autoOpt);
    for(var p=0;p<FPS_PILLS.length;p++){
      var fps=FPS_PILLS[p];
      var opt=document.createElement('option');
      opt.value=String(fps);
      opt.textContent=optionLabelWithCap(String(fps),live,caps,0,0,fps);
      sel.appendChild(opt);
    }
    var want=String(uiFps>0?uiFps:0);
    if(Array.prototype.some.call(sel.options,function(o){ return o.value===want; })) sel.value=want;
    else sel.value='0';
  }

  function fillCapabilitySelects(caps,settings){
    var prefs=cameraPrefs();
    var live=!!previewLive&&!!stream;

    if(settings&&settings.width&&settings.height){
      uiResKey=resKey(settings.width,settings.height);
      uiResGroup=inferResGroup(uiResKey);
    }else if(prefs.selectedWidth>0&&prefs.selectedHeight>0){
      uiResKey=resKey(prefs.selectedWidth,prefs.selectedHeight);
      uiResGroup=inferResGroup(uiResKey);
    }else if(!live){
      uiResKey='';
    }
    // Keep Auto (0) when user preference is Auto — do not overwrite with actual track FPS.
    if(prefs.selectedFrameRate===0&&uiFps===0){
      uiFps=0;
    }else if(prefs.selectedFrameRate===0){
      uiFps=0;
    }else if(settings&&settings.frameRate&&prefs.selectedFrameRate>0){
      // Prefer saved preference for select highlight when set.
      uiFps=prefs.selectedFrameRate|0;
    }else if(settings&&settings.frameRate){
      uiFps=Math.round(Number(settings.frameRate)||0);
    }else if(prefs.selectedFrameRate>0){
      uiFps=prefs.selectedFrameRate|0;
    }else if(!live){
      uiFps=0;
    }

    fillOrientationSelect();
    fillResSelect(caps,live);
    fillFpsSelect(caps,live);

    if(settings&&settings.width&&settings.height){
      syncPreviewAspect(settings.width,settings.height);
    }
    setCapHint(live?'live':'idle');
  }

  function resetCapabilitySelects(){
    lastCapabilities=null;
    uiResKey='';
    uiResGroup='landscape';
    uiFps=0;
    fillCapabilitySelects(null,null);
    syncPreviewAspect(0,0);
  }

  function defaultPreferConstraints(){
    // Highest listed landscape mode first; cascade steps down if unsupported.
    return {width:3840,height:2160,frameRate:30};
  }

  function preferSizeCascade(prefer){
    prefer=prefer||{};
    var fps=prefer.frameRate>0?prefer.frameRate:30;
    var seen={};
    var out=[];
    function push(w,h){
      w=Math.round(Number(w)||0)|0;
      h=Math.round(Number(h)||0)|0;
      if(w<=0||h<=0) return;
      var k=w+'x'+h;
      if(seen[k]) return;
      seen[k]=1;
      out.push({width:w,height:h,frameRate:fps});
    }
    var highs=[[3840,2160],[2560,1440],[1920,1080],[1280,720],[640,360]];
    var prefW=Math.round(Number(prefer.width)||0)|0;
    var prefH=Math.round(Number(prefer.height)||0)|0;
    var prefPx=prefW*prefH;
    if(prefW>0&&prefH>0) push(prefW,prefH);
    for(var i=0;i<highs.length;i++){
      var w=highs[i][0];
      var h=highs[i][1];
      // After the preferred size, only try lower modes (never upgrade past a user pick).
      if(prefPx>0&&(w*h)>=prefPx) continue;
      push(w,h);
    }
    return out;
  }

  function readSelectedConstraints(){
    var prefs=cameraPrefs();
    var out={width:0,height:0,frameRate:0};
    if(uiResKey&&/^\d+x\d+$/.test(uiResKey)){
      var parts=uiResKey.split('x');
      out.width=parseInt(parts[0],10)||0;
      out.height=parseInt(parts[1],10)||0;
    }else if(prefs.selectedWidth>0&&prefs.selectedHeight>0){
      // Legacy auto-saves of browser defaults (~640×480) were not intentional picks.
      if((prefs.selectedWidth|0)*(prefs.selectedHeight|0)<(1280*720)){
        out.width=0;
        out.height=0;
      }else{
        out.width=prefs.selectedWidth|0;
        out.height=prefs.selectedHeight|0;
      }
    }
    // uiFps===0 means Auto (do not force a capture FPS).
    if(uiFps>0) out.frameRate=uiFps|0;
    else if(uiFps===0&&prefs.selectedFrameRate===0) out.frameRate=0;
    else if(prefs.selectedFrameRate>0) out.frameRate=prefs.selectedFrameRate|0;
    // No saved choice → request highest listed mode (not browser's low default ~640×480).
    if(!out.width||!out.height){
      var d=defaultPreferConstraints();
      out.width=d.width;
      out.height=d.height;
      if(!out.frameRate&&uiFps!==0) out.frameRate=d.frameRate;
    }
    return out;
  }

  function antiFlickerHintFps(){
    var ve=ensureVideoEnhancement(cameraPrefs());
    var af=ve&&ve.antiFlicker?String(ve.antiFlicker):'auto';
    if(af==='50hz') return 50;
    if(af==='60hz') return 60;
    return 0;
  }

  function buildVideoConstraints(deviceId,prefer,mode){
    // mode: 'ideal' | 'exact'
    var video={};
    prefer=prefer||readSelectedConstraints();
    mode=mode||'ideal';
    if(deviceId){
      video.deviceId=mode==='exact'?{exact:deviceId}:{ideal:deviceId};
    }
    if(prefer.width>0){
      video.width=mode==='exact'?{exact:prefer.width}:{ideal:prefer.width};
    }
    if(prefer.height>0){
      video.height=mode==='exact'?{exact:prefer.height}:{ideal:prefer.height};
    }
    var fps=prefer.frameRate>0?prefer.frameRate:0;
    // antiFlicker suggests FPS only when user left capture FPS on Auto.
    if(!fps){
      var hint=antiFlickerHintFps();
      if(hint>0) fps=hint;
    }
    if(fps>0){
      // Exact frameRate often fails on Windows drivers — keep ideal.
      video.frameRate={ideal:fps};
    }
    return video;
  }

  function refreshCapabilitiesFromTrack(track){
    if(!track){
      resetCapabilitySelects();
      return;
    }
    var settings=typeof track.getSettings==='function'?track.getSettings():null;
    var caps=null;
    try{
      caps=typeof track.getCapabilities==='function'?track.getCapabilities():null;
    }catch(_){ caps=null; }
    lastCapabilities=caps;
    updateInfoCards(settings);
    fillCapabilitySelects(caps,settings);
  }

  function clearMetaTimer(){
    if(metaTimer){
      clearInterval(metaTimer);
      metaTimer=0;
    }
  }

  function startMetaPoll(){
    clearMetaTimer();
    metaTimer=setInterval(function(){
      if(!stream) return;
      var track=stream.getVideoTracks&&stream.getVideoTracks()[0];
      if(!track||typeof track.getSettings!=='function') return;
      updateInfoCards(track.getSettings());
    },1000);
  }

  // --- Gaze helpers ---
  function clamp01(v){
    v=Number(v);
    if(!isFinite(v)) return 0;
    if(v<0) return 0;
    if(v>1) return 1;
    return v;
  }

  function normalizeGazePoint(input){
    var src=input&&typeof input==='object'?input:{};
    var conf=clamp01(src.confidence!=null?src.confidence:0);
    var st=String(src.state||'idle');
    if(st!=='idle'&&st!=='tracking'&&st!=='lost'&&st!=='low-confidence'&&st!=='live'){
      st=conf<GAZE_LOW_CONF?'low-confidence':'tracking';
    }
    var out={
      x:clamp01(src.x!=null?src.x:0.5),
      y:clamp01(src.y!=null?src.y:0.5),
      confidence:conf,
      state:st
    };
    if(src.feats&&src.feats.length){
      out.feats=Array.prototype.slice.call(src.feats);
    }
    if(src.blink!=null&&isFinite(Number(src.blink))) out.blink=Number(src.blink);
    if(src.blinking) out.blinking=true;
    if(src.calibrated){
      out.calibrated=true;
      if(src.clientX!=null) out.clientX=Number(src.clientX);
      if(src.clientY!=null) out.clientY=Number(src.clientY);
      if(src.screenX!=null) out.screenX=Number(src.screenX);
      if(src.screenY!=null) out.screenY=Number(src.screenY);
      out.stale=!!src.stale;
      out.lowQuality=!!src.lowQuality;
      if(src.regionZone) out.regionZone=String(src.regionZone);
      if(src.regionLabel) out.regionLabel=String(src.regionLabel);
    }
    return out;
  }

  function gazeStateLabel(st){
    if(st==='tracking') return t('cameraGazeStateTracking','估计中');
    if(st==='lost') return t('cameraGazeStateLost','未检测到稳定人脸');
    if(st==='low-confidence') return t('cameraGazeStateLowConfidence','低置信，保持最近位置');
    return t('cameraGazeStateIdle','待命');
  }

  function syncGazeAccuracyUi(point){
    var el=$('cameraGazeAccuracyText');
    if(!el) return;
    var cal=calibrationApi();
    var hasCal=!!(cal&&cal.hasModel&&cal.hasModel());
    if(!hasCal){
      el.textContent=t('cameraGazeAccuracyIdle','视线精度：未校准');
      return;
    }
    var st=cal.getState?cal.getState():null;
    var mode=st&&st.calibMode==='fine'
      ? t('cameraGazeAccuracyModeFine','精细')
      : t('cameraGazeAccuracyModeFast','快校');
    var parts=[t('cameraGazeAccuracyLabel','视线精度')+' · '+mode];
    var cv=st&&st.calibrationValidation;
    if(cv&&isFinite(cv.rmsePx)){
      parts.push('RMSE '+Math.round(cv.rmsePx)+'px');
      if(cv.quality) parts.push(String(cv.quality));
    }else if(st&&isFinite(st.rmse)){
      parts.push('RMSE '+Math.round(st.rmse)+'px');
    }
    if(previewLive&&gaze.enabled&&point&&isFinite(point.confidence)){
      parts.push(t('cameraGazeConfidence','置信度')+' '+Math.round(point.confidence*100)+'%');
    }
    if(st&&st.lowQuality){
      parts.push(t('cameraGazeAccuracyLow','偏低'));
    }
    el.textContent=parts.join(' · ');
  }

  function syncGazeModeButtons(){
    var btns=document.querySelectorAll('[data-camera-gaze-mode]');
    for(var i=0;i<btns.length;i++){
      var btn=btns[i];
      var mode=String(btn.getAttribute('data-camera-gaze-mode')||'');
      btn.classList.toggle('is-active',mode===gaze.mode);
    }
  }

  function syncGazeToggleUi(){
    syncGazeModeButtons();
    var btn=$('btnCameraGazeToggle');
    if(btn){
      btn.classList.toggle('is-active',!!gaze.enabled);
      btn.setAttribute('aria-pressed',gaze.enabled?'true':'false');
      btn.textContent=gaze.enabled
        ? t('cameraGazeToggleOn','注视球 · 开')
        : t('cameraGazeToggle','显示注视悬浮球');
    }
  }

  function stopGazeLoop(){
    if(gaze.raf){
      cancelAnimationFrame(gaze.raf);
      gaze.raf=0;
    }
    gaze.lastTs=0;
  }

  function setGazeOverlayActive(active){
    var overlay=$('cameraGazeOverlay');
    var winLayer=$('cameraGazeWindowLayer');
    var useCalibrated=!!(active&&calibrationApi()&&calibrationApi().hasModel&&calibrationApi().hasModel()&&gaze.mode==='live');
    if(overlay){
      // Keep HUD (confidence / point) on the preview even after calibration;
      // only the in-video orb is suppressed via CSS when window orb is live.
      overlay.classList.toggle('is-active',!!active);
      overlay.classList.toggle('is-calibrated-mode',!!useCalibrated);
      overlay.hidden=!active;
      overlay.setAttribute('aria-hidden',active?'false':'true');
    }
    if(winLayer){
      winLayer.classList.toggle('is-active',!!useCalibrated);
      winLayer.hidden=!useCalibrated;
      winLayer.setAttribute('aria-hidden',useCalibrated?'false':'true');
      if(!useCalibrated||!active) stopKaraokeTest();
    }
  }

  function renderGazeHud(point){
    var stateEl=$('cameraGazeStateText');
    var confEl=$('cameraGazeConfidenceText');
    var pointEl=$('cameraGazePointText');
    var screenEl=$('cameraGazeScreenPointText');
    var hint=$('cameraGazeHint');
    var calibHint=$('cameraGazeCalibrationHint');
    var privacyHint=$('cameraGazePrivacyHint');
    var panel=document.querySelector('.camera-gaze-panel');
    var cal=calibrationApi();
    var hasCal=!!(cal&&cal.hasModel&&cal.hasModel());
    var calSt=cal&&cal.getState?cal.getState():null;
    var calibrated=!!(point&&point.calibrated)||(hasCal&&!previewLive);
    var testing=!!(previewLive&&gaze.enabled&&calibrated);
    if(panel) panel.classList.toggle('is-testing',testing);
    if(!previewLive&&hasCal&&calSt){
      point=point||{};
      point={x:0.5,y:0.5,confidence:0,state:'idle',calibrated:true};
    }
    if(stateEl) stateEl.textContent=gazeStateLabel(point.state);
    if(confEl){
      confEl.textContent=previewLive&&gaze.enabled
        ? String(Math.round(point.confidence*100))+'%'
        : '—';
    }
    if(pointEl){
      pointEl.textContent=previewLive&&gaze.enabled
        ? point.x.toFixed(2)+', '+point.y.toFixed(2)
        : '—';
    }
    syncGazeAccuracyUi(point);
    if(screenEl){
      if(previewLive&&gaze.enabled&&calibrated){
        var regionText=point.regionLabel||'';
        if(!regionText&&point.regionZone){
          var calApi=calibrationApi();
          if(calApi&&calApi.regionZoneLabel){
            regionText=calApi.regionZoneLabel(point.regionZone);
          }
        }
        if(regionText){
          // Testing: emphasize region, not raw pixel chatter.
          screenEl.textContent=t('cameraGazeRegionOnly','当前区域：{region}')
            .replace('{region}',regionText);
        }else if(point.screenX!=null&&point.screenY!=null){
          screenEl.textContent=t('cameraGazeScreenPoint','估算屏幕坐标：{x}, {y}')
            .replace('{x}',String(Math.round(point.screenX)))
            .replace('{y}',String(Math.round(point.screenY)));
        }else{
          screenEl.textContent=t('cameraGazeScreenPointUnknown','估算屏幕坐标：未知');
        }
      }else{
        screenEl.textContent=t('cameraGazeScreenPointUnknown','估算屏幕坐标：未知');
      }
    }
    if(testing){
      // Karaoke stays off during normal preview — only shows when startKaraokeTest() is called.
      if(hint){ hint.hidden=true; hint.textContent=''; }
      if(calibHint){ calibHint.hidden=true; calibHint.textContent=''; }
      if(privacyHint){ privacyHint.hidden=true; }
      var sparse=$('cameraGazeSparseWarn');
      if(sparse) sparse.hidden=true;
      if(gazeCoach.wanted){
        if(!gazeCoach.active||!gazeCoach.line) startNextKaraokeLine(true);
        else setCoachVisible(true);
      }else{
        setCoachVisible(false);
      }
    }else{
      stopKaraokeTest();
      if(hint){
        hint.hidden=false;
        hint.textContent=t('cameraGazeHint','本地 MediaPipe 估计，未校准为屏幕坐标');
      }
      if(calibHint){
        calibHint.hidden=!calibrated;
        if(calibrated){
          calibHint.textContent=t('cameraGazeTestKaraokeHint','开始预览后可用视线球测区域；卡拉OK仅在校准时出现');
        }
      }
      if(privacyHint) privacyHint.hidden=false;
    }
    var faceEl=$('cameraGlanceFace');
    if(faceEl){
      var pa=presenceApi();
      var pst=pa&&pa.isEnabled&&pa.isEnabled()&&pa.getState?pa.getState():null;
      if(pst&&previewLive){
        if(pst.presence==='present') faceEl.textContent=t('cameraPresenceStatePresent','在席');
        else if(pst.presence==='away') faceEl.textContent=t('cameraPresenceStateAway','离席');
        else faceEl.textContent=pst.faceDetected
          ? t('cameraGazeStateTracking','估计中')
          : t('cameraGlanceFaceUndetected','未检测');
      }else{
        faceEl.textContent=previewLive&&gaze.enabled
          ? gazeStateLabel(point.state)
          : t('cameraGlanceFaceUndetected','未检测');
      }
    }
    var calibEl=$('cameraGlanceCalib');
    if(calibEl){
      var statusEl=$('cameraGazeCalibrationStatus');
      if(hasCal&&cal&&cal.syncUiFromModel&&statusEl){
        var idleText=t('cameraGazeCalibrationIdle','未校准');
        if(!statusEl.textContent||statusEl.textContent===idleText){
          cal.syncUiFromModel();
        }
      }
      if(statusEl&&statusEl.textContent){
        calibEl.textContent=statusEl.textContent;
      }else if(calSt&&calSt.statusKind&&calSt.statusKind!=='idle'){
        var kindMap={
          running:['cameraGazeCalibrationRunning','请看向目标点'],
          ready:['cameraGazeCalibrationReady','校准完成'],
          low:['cameraGazeCalibrationLowQuality','校准完成，但精度较低'],
          failed:['cameraGazeCalibrationFailed','有效样本不足，请重试'],
          canceled:['cameraGazeCalibrationCanceled','校准已取消'],
          stale:['cameraGazeCalibrationStale','窗口尺寸变化，请重新校准']
        };
        var pair=kindMap[calSt.statusKind];
        calibEl.textContent=pair?t(pair[0],pair[1]):t('cameraGlanceCalibIdle','未开始');
      }else{
        calibEl.textContent=t('cameraGlanceCalibIdle','未开始');
      }
    }
  }

  function paintOrbEl(orb,sx,sy,point,calibrated,usePixels){
    if(!orb) return;
    if(usePixels){
      orb.style.left=Math.round(sx)+'px';
      orb.style.top=Math.round(sy)+'px';
    }else{
      orb.style.left=(clamp01(sx)*100).toFixed(3)+'%';
      orb.style.top=(clamp01(sy)*100).toFixed(3)+'%';
    }
    orb.style.transform='translate3d(-50%,-50%,0)';
    var low=point.confidence<GAZE_LOW_CONF||point.state==='low-confidence';
    var lost=point.state==='lost'||point.state==='idle'||!previewLive||!gaze.enabled;
    orb.classList.toggle('is-calibrated',!!calibrated);
    orb.classList.toggle('is-stale',!!(point&&point.stale));
    orb.classList.toggle('is-low-confidence',!!low&&!lost);
    orb.classList.toggle('is-lost',!!lost);
  }

  function renderGazeOrb(sx,sy,point){
    var calibrated=!!(point&&point.calibrated);
    paintOrbEl($('cameraGazeOrb'),sx,sy,point,false,false);
    // Window orb + karaoke only while live preview is on.
    if(calibrated&&previewLive&&gaze.enabled){
      var vw=global.innerWidth||1;
      var vh=global.innerHeight||1;
      var cx=gaze.smoothClient.x;
      var cy=gaze.smoothClient.y;
      if(!isFinite(cx)||!isFinite(cy)){
        cx=(point.clientX!=null?point.clientX:clamp01(sx)*vw);
        cy=(point.clientY!=null?point.clientY:clamp01(sy)*vh);
      }
      // Keep the large orb on-screen — blink/hold glitches used to park it off-canvas.
      if(!isFinite(cx)||!isFinite(cy)){ cx=vw*0.5; cy=vh*0.5; }
      cx=Math.min(vw-8,Math.max(8,cx));
      cy=Math.min(vh-8,Math.max(8,cy));
      paintOrbEl($('cameraGazeWindowOrb'),cx,cy,point,true,true);
      if(gazeCoach.wanted&&gazeCoach.active){
        tickCoachKaraoke(point&&point.regionZone);
      }
    }else{
      stopKaraokeTest();
    }
  }

  function sampleMockGaze(dtMs){
    var mode=gaze.mode;
    // live mode is driven by OneToneCameraGazeLandmarker via updateGazePoint.
    if(mode==='live'){
      if(gaze.modelLoading){
        return {x:gaze.smooth.x,y:gaze.smooth.y,confidence:0.2,state:'idle'};
      }
      if(gaze.modelFailed){
        return {x:gaze.smooth.x,y:gaze.smooth.y,confidence:0.05,state:'lost'};
      }
      return {
        x:gaze.point.x,
        y:gaze.point.y,
        confidence:gaze.point.confidence||0.1,
        state:gaze.point.state||'idle'
      };
    }
    if(mode==='pointer'){
      if(gaze.pointer.inside){
        return {
          x:gaze.pointer.x,
          y:gaze.pointer.y,
          confidence:0.9,
          state:'tracking'
        };
      }
      return {
        x:gaze.smooth.x,
        y:gaze.smooth.y,
        confidence:0.12,
        state:'lost'
      };
    }
    if(mode==='idle'){
      return {x:0.5,y:0.5,confidence:0.6,state:'tracking'};
    }
    // scan demo
    gaze.scanT+=(dtMs||16)*0.001;
    var tSec=gaze.scanT;
    var x=0.5+0.32*Math.sin(tSec*0.85);
    var y=0.5+0.28*Math.cos(tSec*0.62);
    x=Math.min(0.82,Math.max(0.18,x));
    y=Math.min(0.78,Math.max(0.22,y));
    var conf=0.72+0.06*Math.sin(tSec*1.7);
    return {x:x,y:y,confidence:clamp01(conf),state:'tracking'};
  }

  function gazeTick(ts){
    gaze.raf=0;
    if(!gaze.enabled||!previewLive){
      setGazeOverlayActive(false);
      renderGazeHud(gaze.point);
      return;
    }
    var dt=gaze.lastTs?Math.min(48,Math.max(0,ts-gaze.lastTs)):16;
    gaze.lastTs=ts;

    if(gaze.mode==='live'&&gaze.external){
      gaze.point=normalizeGazePoint(gaze.point);
    }else if(gaze.mode==='live'){
      gaze.point=normalizeGazePoint(sampleMockGaze(dt));
    }else if(!gaze.external){
      gaze.point=normalizeGazePoint(sampleMockGaze(dt));
    }else{
      gaze.point=normalizeGazePoint(gaze.point);
    }

    var target=gaze.point;
    var alpha=gaze.mode==='live'?GAZE_SMOOTH_ALPHA_LIVE:GAZE_SMOOTH_ALPHA;
    if(gaze.mode==='live'){
      var jump=Math.abs(target.x-gaze.smooth.x)+Math.abs(target.y-gaze.smooth.y);
      if(jump>0.1) alpha=GAZE_SMOOTH_SNAP;
      if(target.calibrated){
        alpha=GAZE_SMOOTH_ALPHA_CALIBRATED;
        if(target.lowQuality) alpha=Math.max(alpha,0.42);
      }
    }
    gaze.smooth.x+= (target.x-gaze.smooth.x)*alpha;
    gaze.smooth.y+= (target.y-gaze.smooth.y)*alpha;
      if(target.calibrated){
        var vw=global.innerWidth||1;
        var vh=global.innerHeight||1;
        var tcx=target.clientX!=null?target.clientX:target.x*vw;
        var tcy=target.clientY!=null?target.clientY:target.y*vh;
        var clientAlpha=GAZE_SMOOTH_ALPHA_CALIBRATED;
        if(target.lowQuality) clientAlpha=Math.max(clientAlpha,0.42);
        if(!isFinite(gaze.smoothClient.x)||!isFinite(gaze.smoothClient.y)){
          gaze.smoothClient.x=tcx;
          gaze.smoothClient.y=tcy;
        }
        var jumpPx=Math.abs(tcx-gaze.smoothClient.x)+Math.abs(tcy-gaze.smoothClient.y);
        if(jumpPx>Math.min(vw,vh)*0.14){
          clientAlpha=0.4;
        }else if(jumpPx<GAZE_CALIB_JITTER_DEADBAND_PX){
          clientAlpha=0;
        }
        var edgeDist=Math.min(tcx/vw,1-tcx/vw,tcy/vh,1-tcy/vh);
        if(edgeDist<0.14) clientAlpha=Math.max(clientAlpha,0.58);
        if(edgeDist<0.06) clientAlpha=Math.max(clientAlpha,0.82);
        if(clientAlpha>0){
          gaze.smoothClient.x+=(tcx-gaze.smoothClient.x)*clientAlpha;
          gaze.smoothClient.y+=(tcy-gaze.smoothClient.y)*clientAlpha;
        }
      }

    setGazeOverlayActive(true);
    renderGazeOrb(gaze.smooth.x,gaze.smooth.y,target);
    renderGazeHud(target);
    gaze.raf=requestAnimationFrame(gazeTick);
  }

  function ensureGazeLoop(){
    if(!gaze.enabled||!previewLive){
      stopGazeLoop();
      setGazeOverlayActive(false);
      renderGazeHud(gaze.point);
      return;
    }
    if(!gaze.raf){
      gaze.lastTs=0;
      gaze.raf=requestAnimationFrame(gazeTick);
    }
  }

  function refreshGazeUi(){
    syncGazeToggleUi();
    syncLiveLandmarker();
    var cal=calibrationApi();
    if(cal&&cal.hasModel&&cal.hasModel()&&cal.syncUiFromModel){
      cal.syncUiFromModel();
    }
    if(cal&&cal.updateCalibWarnings) cal.updateCalibWarnings();
    else if(cal&&cal.updateLowResWarn) cal.updateLowResWarn();
    if(gaze.enabled&&previewLive) ensureGazeLoop();
    else{
      stopGazeLoop();
      setGazeOverlayActive(false);
      if(cal&&cal.hasModel&&cal.hasModel()){
        renderGazeHud({x:gaze.smooth.x,y:gaze.smooth.y,confidence:0,state:'idle',calibrated:true});
      }else{
        renderGazeHud({x:gaze.smooth.x,y:gaze.smooth.y,confidence:0,state:'idle'});
      }
    }
  }

  function setGazeDebugEnabled(enabled){
    gaze.enabled=!!enabled;
    if(!gaze.enabled){
      gaze.point.state='idle';
      gaze.point.confidence=0;
      gaze.external=false;
      gaze.modelFailed=false;
      gaze.modelLoading=false;
      cancelCalibration();
      // Do not stop landmarker if presence / Smart Pointer still needs it.
      if(!presenceEnabled()&&!smartPointerWanted()) stopLandmarker();
    }
    syncPresenceDetectInterval();
    refreshGazeUi();
    syncLiveLandmarker();
  }

  function setGazeDebugMode(mode){
    var next=String(mode||'live');
    if(next!=='live'&&next!=='idle'&&next!=='scan'&&next!=='pointer') next='live';
    var prev=gaze.mode;
    gaze.mode=next;
    gaze.external=false;
    gaze.modelFailed=false;
    if(prev==='live'&&next!=='live'){
      cancelCalibration();
      stopLandmarker();
    }
    if(next==='idle'){
      gaze.point=normalizeGazePoint({x:0.5,y:0.5,confidence:0.6,state:'tracking'});
      gaze.smooth.x=0.5;
      gaze.smooth.y=0.5;
    }
    syncGazeModeButtons();
    syncLiveLandmarker();
    ensureGazeLoop();
  }

  function recenterGaze(){
    gaze.smooth.x=0.5;
    gaze.smooth.y=0.5;
    gaze.point=normalizeGazePoint({x:0.5,y:0.5,confidence:gaze.enabled&&previewLive?0.6:0,state:gaze.enabled&&previewLive?'tracking':'idle'});
    gaze.scanT=0;
    if(gaze.mode!=='live') gaze.external=false;
    renderGazeOrb(0.5,0.5,gaze.point);
    renderGazeHud(gaze.point);
  }

  function onCalibrationUpdated(){
    // Reset window-pixel smoother so orb can jump to full-screen coords.
    gaze.smoothClient.x=NaN;
    gaze.smoothClient.y=NaN;
    var cal=calibrationApi();
    if(cal&&cal.resetRuntimeSmoothers) cal.resetRuntimeSmoothers();
    if(cal&&cal.syncUiFromModel) cal.syncUiFromModel();
    if(gaze.enabled&&previewLive){
      setGazeOverlayActive(true);
      if(gaze.point&&gaze.point.calibrated){
        renderGazeOrb(gaze.smooth.x,gaze.smooth.y,gaze.point);
        renderGazeHud(gaze.point);
      }else if(calibrationApi()&&calibrationApi().hasModel&&calibrationApi().hasModel()){
        updateGazePoint(gaze.point);
      }else{
        gaze.point.calibrated=false;
        delete gaze.point.clientX;
        delete gaze.point.clientY;
        delete gaze.point.screenX;
        delete gaze.point.screenY;
        setGazeOverlayActive(true);
        renderGazeHud(gaze.point);
      }
    }else{
      setGazeOverlayActive(false);
      stopKaraokeTest();
      renderGazeHud({x:gaze.smooth.x,y:gaze.smooth.y,confidence:0,state:'idle'});
    }
  }

  function updateGazePoint(point){
    var raw=normalizeGazePoint(point);
    if(raw.state==='idle'&&raw.confidence>=GAZE_LOW_CONF){
      raw.state='tracking';
    }
    var cal=calibrationApi();
    if(cal&&cal.onRawPoint){
      try{ cal.onRawPoint(raw); }catch(_){}
    }
    var display=raw;
    if(cal&&cal.hasModel&&cal.hasModel()&&cal.apply){
      try{
        display=cal.apply(raw)||raw;
      }catch(_){
        display=raw;
      }
    }
    gaze.point=normalizeGazePoint(display);
    // Preserve calibration extras for HUD / orb layer choice.
    if(display&&display.calibrated){
      gaze.point.calibrated=true;
      gaze.point.clientX=display.clientX;
      gaze.point.clientY=display.clientY;
      gaze.point.screenX=display.screenX;
      gaze.point.screenY=display.screenY;
      gaze.point.stale=!!display.stale;
      gaze.point.lowQuality=!!display.lowQuality;
      if(display.regionZone) gaze.point.regionZone=display.regionZone;
      if(display.regionLabel) gaze.point.regionLabel=display.regionLabel;
    }
    if(raw.feats&&raw.feats.length){
      gaze.point.feats=Array.prototype.slice.call(raw.feats);
    }
    gaze.external=true;
    ensureGazeLoop();
    return getGazeDebugState();
  }

  function getGazeDebugState(){
    var cal=calibrationApi();
    var calSt=cal&&cal.getState?cal.getState():null;
    var enh=enhancerApi();
    var enhSt=null;
    try{ enhSt=enh&&enh.getRuntimeStatus?enh.getRuntimeStatus():null; }catch(_){ enhSt=null; }
    return {
      enabled:!!gaze.enabled,
      mode:gaze.mode,
      previewLive:!!previewLive,
      modelLoading:!!gaze.modelLoading,
      modelFailed:!!gaze.modelFailed,
      calibration:calSt,
      point:{
        x:gaze.point.x,
        y:gaze.point.y,
        confidence:gaze.point.confidence,
        state:gaze.point.state,
        calibrated:!!gaze.point.calibrated,
        clientX:gaze.point.clientX,
        clientY:gaze.point.clientY
      },
      smooth:{x:gaze.smooth.x,y:gaze.smooth.y},
      smoothClient:{x:gaze.smoothClient.x,y:gaze.smoothClient.y},
      videoEnhancement:enhSt
    };
  }

  function onGazePointerMove(e){
    if(gaze.mode!=='pointer') return;
    var shell=$('cameraPreviewShell');
    if(!shell) return;
    var rect=shell.getBoundingClientRect();
    if(!rect.width||!rect.height) return;
    var x=(e.clientX-rect.left)/rect.width;
    var y=(e.clientY-rect.top)/rect.height;
    gaze.pointer.x=clamp01(x);
    gaze.pointer.y=clamp01(y);
    gaze.pointer.inside=true;
  }

  function onGazePointerLeave(){
    if(gaze.mode!=='pointer') return;
    gaze.pointer.inside=false;
  }

  function releaseStreamOnly(){
    clearMetaTimer();
    detachEnhancer();
    if(stream){
      try{
        stream.getTracks().forEach(function(tr){
          try{ tr.stop(); }catch(_){}
        });
      }catch(_){}
    }
    stream=null;
    var video=$('cameraPreviewVideo');
    if(video){
      try{ video.srcObject=null; }catch(_){}
      video.classList.remove('is-enhanced-hidden');
      video.style.filter='';
    }
    previewLive=false;
    starting=false;
  }

  function stopTracks(){
    clearMetaTimer();
    cancelCalibration();
    stopLandmarker();
    stopHandGesture();
    gaze.external=false;
    gaze.modelLoading=false;
    stopGazeLoop();
    setGazeOverlayActive(false);
    stopKaraokeTest();
    releaseStreamOnly();
    setPlaceholderVisible(true);
    setButtons();
    updateInfoCards(null);
    resetCapabilitySelects();
    renderGazeHud({x:gaze.smooth.x,y:gaze.smooth.y,confidence:0,state:'idle'});
    var pa=presenceApi();
    if(pa&&pa.reset){
      try{ pa.reset({closePrivacy:false}); }catch(_){}
    }
  }

  function stop(opts){
    stopTracks();
    previewStatus='stopped';
    clearPreviewError();
    setStatus(t('cameraStatusStopped','已停止 · 摄像头已释放'));
    emitPreviewStatus();
    var pa=global.OneToneCameraPresenceActions;
    if(pa&&pa.getRuntimeStatus&&!(opts&&opts.silent)){
      // Coordinator owns runtime listeners; nudge UI if stop called directly.
      try{
        if(pa.syncUiFromPrefs) pa.syncUiFromPrefs();
      }catch(_){}
    }
  }

  function startPreview(opts){
    opts=opts&&typeof opts==='object'?opts:{};
    if(starting||previewLive){
      return Promise.resolve({ok:true,reason:'already_running'});
    }
    if(!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia){
      var unsupported=setPreviewError({name:'NotSupportedError',message:t('cameraErrUnsupported','当前环境不支持摄像头 API')});
      return Promise.resolve({ok:false,reason:'unsupported',error:unsupported});
    }
    var sel=$('cameraDeviceSelect');
    var deviceId=sel?String(sel.value||'').trim():'';
    if(!deviceId&&devices.length){
      deviceId=String(devices[0].deviceId||'').trim();
      if(sel&&deviceId) sel.value=deviceId;
    }
    starting=true;
    previewStatus='starting';
    clearPreviewError();
    setButtons();
    setStatus(t('cameraStatusStarting','正在开启预览…'));
    emitPreviewStatus();
    var prefer=readSelectedConstraints();
    uiResKey=resKey(prefer.width,prefer.height);
    uiResGroup=inferResGroup(uiResKey);
    uiFps=prefer.frameRate|0;
    return requestUserMedia(deviceId,prefer).then(function(mediaStream){
      return attachStream(mediaStream,deviceId);
    }).then(function(){
      var sz=getActualVideoSize();
      if(sz.width>0&&sz.height>0){
        persistCameraPrefs({
          selectedWidth:sz.width,
          selectedHeight:sz.height,
          selectedFrameRate:uiFps>0?uiFps:0
        });
      }
      starting=false;
      previewStatus='live';
      clearPreviewError();
      emitPreviewStatus();
      return {ok:true,reason:opts.reason||'started'};
    }).catch(function(err){
      starting=false;
      previewLive=false;
      setButtons();
      setPlaceholderVisible(true);
      var structured=setPreviewError(err);
      updateInfoCards(null);
      refreshGazeUi();
      return {ok:false,reason:structured.code,error:structured};
    });
  }

  function deviceLabel(device,index){
    var label=String(device&&device.label||'').trim();
    if(label) return label;
    return t('cameraDeviceFallback','摄像头 {n}').replace('{n}',String(index+1));
  }

  function fillSelect(list){
    var sel=$('cameraDeviceSelect');
    if(!sel) return;
    var prefs=cameraPrefs();
    var prefer=String(prefs.selectedDeviceId||'').trim();
    var prev=String(sel.value||'').trim()||prefer;
    sel.innerHTML='';
    if(!list.length){
      var empty=document.createElement('option');
      empty.value='';
      empty.textContent=t('cameraNoDevices','未检测到摄像头');
      sel.appendChild(empty);
      return;
    }
    list.forEach(function(d,i){
      var opt=document.createElement('option');
      opt.value=d.deviceId||'';
      opt.textContent=deviceLabel(d,i);
      sel.appendChild(opt);
    });
    if(prev&&list.some(function(d){ return d.deviceId===prev; })) sel.value=prev;
    else if(prefer&&list.some(function(d){ return d.deviceId===prefer; })) sel.value=prefer;
  }

  function refreshDevices(){
    if(!navigator.mediaDevices||!navigator.mediaDevices.enumerateDevices){
      setStatus(t('cameraErrUnsupported','当前环境不支持摄像头 API'));
      devices=[];
      fillSelect(devices);
      updateInfoCards(null);
      return Promise.resolve([]);
    }
    return navigator.mediaDevices.enumerateDevices().then(function(all){
      devices=(all||[]).filter(function(d){ return d&&d.kind==='videoinput'; });
      fillSelect(devices);
      if(previewLive&&stream){
        var track=stream.getVideoTracks&&stream.getVideoTracks()[0];
        refreshCapabilitiesFromTrack(track||null);
      }else{
        updateInfoCards(null);
        if(!previewLive) resetCapabilitySelects();
      }
      if(!devices.length){
        setStatus(t('cameraStatusNoDevice','未找到摄像头设备'));
      }else if(!previewLive){
        setStatus(t('cameraStatusIdle','待命 · 不会自动开启摄像头'));
      }
      return devices;
    }).catch(function(err){
      setStatus(mapError(err));
      return [];
    });
  }

  function mapError(err){
    var name=err&&(err.name||err.code)||'';
    var msg=String(err&&err.message||'');
    if(name==='NotAllowedError'||name==='PermissionDeniedError'){
      return t('cameraErrNotAllowed','未获得摄像头权限。请到 Windows「设置 → 隐私和安全性 → 摄像头」允许访问，然后重启 OneTone 再试。');
    }
    if(name==='NotFoundError'||name==='DevicesNotFoundError'){
      return t('cameraErrNotFound','未找到可用摄像头，请检查设备连接。');
    }
    if(name==='NotReadableError'||name==='TrackStartError'){
      return t('cameraErrNotReadable','摄像头被其它程序占用，请关闭占用后再试。');
    }
    if(name==='SecurityError'){
      return t('cameraErrSecurity','安全策略阻止了摄像头访问。');
    }
    if(name==='OverconstrainedError'){
      return t('cameraErrOverconstrained','所选能力或设备不可用，请换分辨率/帧率或换一台设备。');
    }
    return t('cameraErrGeneric','摄像头出错：{msg}').replace('{msg}',msg||name||'unknown');
  }

  function stopMediaStream(mediaStream){
    if(!mediaStream||!mediaStream.getTracks) return;
    try{
      mediaStream.getTracks().forEach(function(tr){
        try{ tr.stop(); }catch(_){}
      });
    }catch(_){}
  }

  function idealSizeAcceptable(mediaStream,size){
    if(!size||!(size.width>0)||!(size.height>0)) return true;
    var tr=mediaStream&&mediaStream.getVideoTracks&&mediaStream.getVideoTracks()[0];
    var settings=tr&&typeof tr.getSettings==='function'?tr.getSettings():null;
    if(!settings||!(settings.width>0)||!(settings.height>0)) return true;
    var got=(settings.width|0)*(settings.height|0);
    var want=(size.width|0)*(size.height|0);
    // ideal may undershoot slightly; reject browser low defaults when a high mode was requested.
    return got>=Math.max(640*360,Math.floor(want*0.55));
  }

  function requestUserMedia(deviceId,prefer){
    prefer=prefer||readSelectedConstraints();
    var attempts=[];
    var cascade=preferSizeCascade(prefer);
    for(var c=0;c<cascade.length;c++){
      var size=cascade[c];
      if(deviceId){
        attempts.push({
          constraints:{audio:false,video:buildVideoConstraints(deviceId,size,'exact')},
          size:size,
          mode:'exact'
        });
      }
      attempts.push({
        constraints:{audio:false,video:buildVideoConstraints(deviceId,size,'ideal')},
        size:size,
        mode:'ideal'
      });
    }
    if(deviceId){
      attempts.push({constraints:{audio:false,video:{deviceId:{exact:deviceId}}},mode:'loose'});
      attempts.push({constraints:{audio:false,video:{deviceId:{ideal:deviceId}}},mode:'loose'});
    }
    attempts.push({constraints:{audio:false,video:true},mode:'loose'});

    function tryNext(i){
      if(i>=attempts.length){
        return Promise.reject(new Error('getUserMedia failed for all constraint sets'));
      }
      var attempt=attempts[i];
      return navigator.mediaDevices.getUserMedia(attempt.constraints).then(function(mediaStream){
        if(attempt.mode==='ideal'&&!idealSizeAcceptable(mediaStream,attempt.size)){
          stopMediaStream(mediaStream);
          return tryNext(i+1);
        }
        return mediaStream;
      }).catch(function(err){
        var name=err&&err.name||'';
        if(name==='NotAllowedError'||name==='PermissionDeniedError'||name==='SecurityError'){
          return Promise.reject(err);
        }
        return tryNext(i+1);
      });
    }
    return tryNext(0);
  }

  function activeVideoTrack(){
    if(!stream||!stream.getVideoTracks) return null;
    return stream.getVideoTracks()[0]||null;
  }

  function getActualVideoSize(){
    var tr=activeVideoTrack();
    var settings=tr&&typeof tr.getSettings==='function'?tr.getSettings():null;
    if(settings&&settings.width>0&&settings.height>0){
      return {width:Math.round(settings.width),height:Math.round(settings.height)};
    }
    var vid=$('cameraPreviewVideo');
    if(vid&&vid.videoWidth>0&&vid.videoHeight>0){
      return {width:vid.videoWidth,height:vid.videoHeight};
    }
    return {width:0,height:0};
  }

  function settingsMismatch(settings,prefer){
    if(!prefer) return false;
    if(!settings) return !!(prefer.width||prefer.height||prefer.frameRate);
    if(prefer.width>0&&Math.abs((settings.width||0)-prefer.width)>8) return true;
    if(prefer.height>0&&Math.abs((settings.height||0)-prefer.height)>8) return true;
    if(prefer.frameRate>0&&Math.abs((settings.frameRate||0)-prefer.frameRate)>3) return true;
    return false;
  }

  function applyCapabilityChange(){
    var prefer=readSelectedConstraints();
    // Preserve Auto (0) in prefs — do not coerce to actual driver FPS here.
    persistCameraPrefs({
      selectedWidth:prefer.width,
      selectedHeight:prefer.height,
      selectedFrameRate:uiFps>0?prefer.frameRate:(uiFps===0?0:prefer.frameRate)
    });
    if(!previewLive||applyingCaps){
      fillCapabilitySelects(lastCapabilities,null);
      setCapHint(previewLive?'live':'idle');
      return Promise.resolve();
    }
    applyingCaps=true;
    setStatus(t('cameraCapApplying','正在切换摄像头能力…'));
    var cal=calibrationApi();
    if(cal&&cal.markModelStale){
      try{ cal.markModelStale('resolution_change'); }catch(_){}
    }

    var sel=$('cameraDeviceSelect');
    var deviceId=sel?String(sel.value||'').trim():'';
    // Always reopen stream — applyConstraints({ideal}) often no-ops on Windows WebView2.
    releaseStreamOnly();
    starting=true;
    setButtons();
    return requestUserMedia(deviceId,prefer).then(function(mediaStream){
      return attachStream(mediaStream,deviceId);
    }).then(function(){
      applyingCaps=false;
      var tr=activeVideoTrack();
      var settings=tr&&tr.getSettings?tr.getSettings():null;
      if(settingsMismatch(settings,prefer)){
        // Driver rejected exact mode — reflect actual output in UI; keep Auto preference if set.
        if(settings){
          var keepAuto=uiFps===0;
          persistCameraPrefs({
            selectedWidth:Math.round(settings.width||0),
            selectedHeight:Math.round(settings.height||0),
            selectedFrameRate:keepAuto?0:Math.round(settings.frameRate||0)
          });
          refreshCapabilitiesFromTrack(tr);
        }
        setStatus(t('cameraErrCapFailed','无法切换到所选能力，已保持当前输出')+
          ' · '+(settings&&settings.width?Math.round(settings.width):'?')+'×'+
          (settings&&settings.height?Math.round(settings.height):'?')+' @ '+
          (settings&&settings.frameRate?Math.round(settings.frameRate):'?')+'fps');
        notifyEnhancerResize();
        syncPresenceDetectInterval();
        return;
      }
      var w=settings&&settings.width?Math.round(settings.width):prefer.width||0;
      var h=settings&&settings.height?Math.round(settings.height):prefer.height||0;
      var fps=settings&&settings.frameRate?Math.round(settings.frameRate):(prefer.frameRate||0);
      setStatus(
        t('cameraCapApplied','已切换 · {w}×{h} @ {fps}fps')
          .replace('{w}',String(w||'—'))
          .replace('{h}',String(h||'—'))
          .replace('{fps}',String(fps||'—'))
      );
      notifyEnhancerResize();
      syncPresenceDetectInterval();
    }).catch(function(err){
      applyingCaps=false;
      starting=false;
      setButtons();
      setPlaceholderVisible(true);
      resetCapabilitySelects();
      setStatus(mapError(err)||t('cameraErrCapFailed','无法切换到所选能力，已保持当前输出'));
      refreshGazeUi();
    });
  }

  function attachStream(mediaStream,deviceId){
    clearMetaTimer();
    if(stream){
      try{
        stream.getTracks().forEach(function(tr){
          try{ tr.stop(); }catch(_){}
        });
      }catch(_){}
    }
    stream=mediaStream;
    var video=$('cameraPreviewVideo');
    if(video){
      video.srcObject=stream;
      var playResult=video.play&&video.play();
      if(playResult&&typeof playResult.catch==='function'){
        playResult.catch(function(){ /* muted autoplay */ });
      }
    }
    previewLive=true;
    starting=false;
    setPlaceholderVisible(false);
    setButtons();
    // Do not force gaze overlay on for presence/home preview — that used to
    // unlock full-rate createImageBitmap via gaze.enabled default/bypass.
    if(cameraPanelHot()&&!gaze.enabled) setGazeDebugEnabled(true);
    else refreshGazeUi();
    if(deviceId) persistSelectedDeviceId(deviceId);
    setStatus(t('cameraStatusLive','预览中 · 仅本地显示'));
    var track=stream.getVideoTracks&&stream.getVideoTracks()[0];
    refreshCapabilitiesFromTrack(track||null);
    startMetaPoll();
    syncLiveLandmarker();
    syncHandGesture();
    ensureGazeLoop();
    attachEnhancer();
    notifyEnhancerResize();
    syncPresenceDetectInterval();
    return refreshDevices();
  }

  function onDeviceChange(){
    var sel=$('cameraDeviceSelect');
    var deviceId=sel?String(sel.value||'').trim():'';
    persistSelectedDeviceId(deviceId);
    persistCameraPrefs({selectedWidth:0,selectedHeight:0,selectedFrameRate:0});
    uiResKey='';
    uiFps=0;
    updateInfoCards(null);
    var cal=calibrationApi();
    if(cal&&cal.markModelStale){
      try{ cal.markModelStale('device_change'); }catch(_){}
    }
    var pa=presenceApi();
    if(previewLive||(pa&&pa.isEnabled&&pa.isEnabled()&&!(pa.getRuntimeStatus&&pa.getRuntimeStatus().manualStopped))){
      stopTracks();
      if(pa&&pa.reconcileRuntime){
        pa.reconcileRuntime({reason:'device_change'});
      }else{
        startPreview({reason:'device_change'});
      }
    }else{
      resetCapabilitySelects();
      setStatus(t('cameraStatusIdle','待命 · 不会自动开启摄像头'));
      refreshGazeUi();
    }
  }

  function onPanelVisible(){
    // Enumerate devices; reconcile runtime via presence coordinator (not blind start).
    refreshDevices();
    setButtons();
    syncGazeToggleUi();
    var cal=calibrationApi();
    if(cal){
      if(cal.loadFromPrefs) cal.loadFromPrefs();
      else if(cal.syncUiFromModel) cal.syncUiFromModel();
      if(cal.updateCalibWarnings) cal.updateCalibWarnings();
      else if(cal.updateLowResWarn) cal.updateLowResWarn();
    }
    var pa=presenceApi();
    if(pa&&pa.syncUiFromPrefs){
      try{ pa.syncUiFromPrefs(); }catch(_){}
    }
    if(pa&&pa.reconcileRuntime){
      pa.reconcileRuntime({reason:'panel_visible'});
    }else if(pa&&pa.isEnabled&&pa.isEnabled()&&!previewLive){
      startPreview({reason:'panel_visible'});
    }else if(!previewLive){
      setPlaceholderVisible(true);
      setStatus(t('cameraStatusIdle','待命 · 不会自动开启摄像头'));
    }
    refreshGazeUi();
  }

  function bindMediaCapabilityUi(){
    var groupSel=$('cameraResGroupSelect');
    var resSel=$('cameraResSelect');
    var fpsSel=$('cameraFpsSelect');
    if(groupSel){
      groupSel.addEventListener('change',function(){
        var gid=String(groupSel.value||'landscape');
        if(gid===uiResGroup) return;
        uiResGroup=gid;
        var group=findResGroup(uiResGroup);
        var items=group&&group.items?group.items:[];
        var keep=false;
        for(var i=0;i<items.length;i++){
          if(resKey(items[i].w,items[i].h)===uiResKey){ keep=true; break; }
        }
        if(!keep&&items.length){
          uiResKey=resKey(items[0].w,items[0].h);
        }
        fillResSelect(lastCapabilities,!!previewLive&&!!stream);
        applyCapabilityChange();
      });
    }
    if(resSel){
      resSel.addEventListener('change',function(){
        var key=String(resSel.value||'');
        if(!key||key===uiResKey) return;
        uiResKey=key;
        uiResGroup=inferResGroup(uiResKey);
        var groupSelLive=$('cameraResGroupSelect');
        if(groupSelLive) groupSelLive.value=uiResGroup;
        applyCapabilityChange();
      });
    }
    if(fpsSel){
      fpsSel.addEventListener('change',function(){
        var fps=parseInt(fpsSel.value,10)||0;
        if(fps===uiFps) return;
        uiFps=fps;
        applyCapabilityChange();
      });
    }
  }

  function bindUi(){
    if(bound) return;
    bound=true;
    var startBtn=$('cameraPreviewStartBtn');
    var sel=$('cameraDeviceSelect');
    if(startBtn){
      startBtn.addEventListener('click',function(e){
        e.preventDefault();
        startFromPlaceholder();
      });
    }
    if(sel) sel.addEventListener('change',onDeviceChange);
    bindMediaCapabilityUi();
    global.addEventListener('beforeunload',function(){ stopTracks(); });
    global.addEventListener('pagehide',function(){ stopTracks(); });
  }

  function init(){
    bindUi();
    setButtons();
    setPlaceholderVisible(true);
    resetCapabilitySelects();
    setStatus(t('cameraStatusIdle','待命 · 不会自动开启摄像头'));
    syncGazeToggleUi();
    setGazeOverlayActive(false);
    stopKaraokeTest();
    var calibHint=$('cameraGazeCalibrationHint');
    if(calibHint) calibHint.hidden=true;
    renderGazeHud({x:0.5,y:0.5,confidence:0,state:'idle'});
  }

  global.OneToneCameraPreview={
    init:init,
    onPanelVisible:onPanelVisible,
    startPreview:startPreview,
    stop:stop,
    isRunning:function(){ return !!previewLive; },
    getLastError:function(){ return lastError?{code:lastError.code,message:lastError.message}:null; },
    getPreviewStatus:function(){ return previewStatus; },
    mapError:mapError,
    getSelectedDeviceLabel:selectedDeviceLabel,
    refreshDevices:refreshDevices,
    setGazeDebugEnabled:setGazeDebugEnabled,
    setGazeDebugMode:setGazeDebugMode,
    getGazeDebugState:getGazeDebugState,
    updateGazePoint:updateGazePoint,
    recenterGaze:recenterGaze,
    onCalibrationUpdated:onCalibrationUpdated,
    getActualVideoSize:getActualVideoSize,
    syncLiveLandmarker:syncLiveLandmarker,
    syncHandGesture:syncHandGesture,
    persistCameraPrefs:persistCameraPrefs,
    getCaptureFpsHint:getCaptureFpsHint
  };

  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',init);
  }else{
    init();
  }
})((typeof window!=='undefined')?window:globalThis);
