(function(global){
  'use strict';

  /**
   * Preview-only beauty Looks.
   * Core smooth/whiten: vendored Guikunzhi GPUImageBeautify (MIT) via OneToneGpuBeautify.
   * Recognition always uses the raw cameraPreviewVideo.
   */

  var $=function(id){
    return global.OneToneDom&&global.OneToneDom.$?global.OneToneDom.$(id):document.getElementById(id);
  };

  var LOOK_DEFAULTS={
    off:{whiten:0,smooth:0,rosy:0,slim:0},
    natural:{whiten:1,smooth:1,rosy:0,slim:0},
    cream:{whiten:1,smooth:2,rosy:1,slim:0},
    glow:{whiten:2,smooth:1,rosy:1,slim:0},
    fresh:{whiten:1,smooth:1,rosy:2,slim:1}
  };

  var LEVEL_AMT=[0,0.28,0.55,0.82];
  var SLIM_AMT=[0,0.12,0.20,0.22];
  var ROSY_AMT=[0,0.40,0.70,1.0];

  var DEFAULT_PREFS={
    enabled:false,
    look:'off',
    faceMask:'off',
    preset:'natural',
    beautyEnabled:false,
    whiten:0,
    smooth:0,
    rosy:0,
    slim:0,
    beauty:18,
    brightness:0,
    contrast:8,
    saturation:6,
    sharpen:8,
    denoise:8,
    lowLight:0,
    antiFlicker:'auto',
    displayFrameRate:0
  };

  var videoEl=null;
  var shellEl=null;
  var canvasEl=null;
  var maskCanvasEl=null;
  var maskCtx=null;
  var faceMaskEng=null;
  var beautify=null;
  var ctx2d=null;
  var mode='off';
  var running=false;
  var bypassCompare=false;
  var qualityTier='full';
  var rvfcHandle=0;
  var rafHandle=0;
  var lastDrawAt=0;
  var prefs=clonePrefs(DEFAULT_PREFS);
  var bound=false;

  var smoothFace={cx:0.5,cy:0.42,cheekL:{x:0.35,y:0.48},cheekR:{x:0.65,y:0.48},has:false,at:0};
  var FACE_HOLD_MS=400;
  // Mask clears look like a reload; hold last landmarks briefly across detect gaps.
  var maskHold={lms:null,at:0};
  var MASK_HOLD_MS=700;

  function clamp(n,lo,hi){
    n=Number(n);
    if(!isFinite(n)) n=lo;
    return Math.max(lo,Math.min(hi,n));
  }

  function clampLevel(v){
    v=Math.round(Number(v)||0)|0;
    if(v<0) v=0;
    if(v>3) v=3;
    return v;
  }

  function normalizeLook(v){
    v=String(v||'off');
    if(v==='off'||v==='natural'||v==='cream'||v==='glow'||v==='fresh') return v;
    return 'off';
  }

  function normalizeFaceMask(v){
    var api=global.OneToneFaceMask;
    if(api&&api.normalizeStyle) return api.normalizeStyle(v);
    v=String(v||'off').toLowerCase();
    if(v==='off'||v==='solid'||v==='emoji'||v==='animal') return v;
    return 'off';
  }

  function wantsBeauty(p){
    p=p||prefs;
    return !!(p&&p.look&&p.look!=='off');
  }

  function wantsMask(p){
    p=p||prefs;
    return !!(p&&p.faceMask&&p.faceMask!=='off');
  }

  function wantsPipeline(p){
    return wantsBeauty(p)||wantsMask(p);
  }

  function mapLegacyPresetToLook(preset){
    preset=String(preset||'');
    if(preset==='natural') return 'natural';
    if(preset==='soft') return 'cream';
    if(preset==='clear') return 'glow';
    if(preset==='lowLight') return 'fresh';
    return 'off';
  }

  function lookToLegacyPreset(look){
    if(look==='cream') return 'soft';
    if(look==='glow') return 'clear';
    if(look==='fresh') return 'lowLight';
    if(look==='natural') return 'natural';
    return 'natural';
  }

  function normalizeAntiFlicker(v){
    v=String(v||'auto').toLowerCase();
    if(v==='50hz'||v==='60hz'||v==='auto') return v;
    return 'auto';
  }

  function normalizeDisplayFps(v){
    v=Math.round(Number(v)||0)|0;
    if(v===25||v===30||v===50||v===60) return v;
    return 0;
  }

  function syncActiveFlags(p){
    var beauty=wantsBeauty(p);
    var mask=wantsMask(p);
    p.beautyEnabled=beauty;
    p.enabled=beauty||mask;
    return p;
  }

  function clonePrefs(src){
    src=src&&typeof src==='object'?src:{};
    var look=src.look!=null?normalizeLook(src.look):null;
    if(!look){
      look=mapLegacyPresetToLook(src.preset);
      if(src.enabled&&look==='off'&&src.preset) look=mapLegacyPresetToLook(src.preset);
      if(!src.enabled&&src.look==null&&!src.whiten&&!src.smooth) look='off';
    }
    var faceMask=normalizeFaceMask(src.faceMask!=null?src.faceMask:'off');
    var p={
      enabled:!!src.enabled,
      look:look,
      faceMask:faceMask,
      preset:String(src.preset||lookToLegacyPreset(look)||'natural'),
      beautyEnabled:!!src.beautyEnabled,
      whiten:clampLevel(src.whiten!=null?src.whiten:0),
      smooth:clampLevel(src.smooth!=null?src.smooth:0),
      rosy:clampLevel(src.rosy!=null?src.rosy:0),
      slim:clampLevel(src.slim!=null?src.slim:0),
      beauty:clamp(src.beauty!=null?src.beauty:DEFAULT_PREFS.beauty,0,100)|0,
      brightness:clamp(src.brightness!=null?src.brightness:DEFAULT_PREFS.brightness,-50,50)|0,
      contrast:clamp(src.contrast!=null?src.contrast:DEFAULT_PREFS.contrast,-50,50)|0,
      saturation:clamp(src.saturation!=null?src.saturation:DEFAULT_PREFS.saturation,-50,50)|0,
      sharpen:clamp(src.sharpen!=null?src.sharpen:DEFAULT_PREFS.sharpen,0,100)|0,
      denoise:clamp(src.denoise!=null?src.denoise:DEFAULT_PREFS.denoise,0,100)|0,
      lowLight:clamp(src.lowLight!=null?src.lowLight:DEFAULT_PREFS.lowLight,0,100)|0,
      antiFlicker:normalizeAntiFlicker(src.antiFlicker),
      displayFrameRate:normalizeDisplayFps(src.displayFrameRate)
    };
    if(p.look!=='off'&&(p.enabled||p.beautyEnabled||src.look)){
      p.beautyEnabled=true;
    }
    if(p.look==='off') p.beautyEnabled=false;
    syncActiveFlags(p);
    p.preset=lookToLegacyPreset(p.look);
    return p;
  }

  function applyLookDefaults(p,look){
    look=normalizeLook(look);
    var d=LOOK_DEFAULTS[look]||LOOK_DEFAULTS.off;
    p.look=look;
    p.whiten=d.whiten;
    p.smooth=d.smooth;
    p.rosy=d.rosy;
    p.slim=d.slim;
    p.preset=lookToLegacyPreset(look);
    if(look==='off') p.beautyEnabled=false;
    else p.beautyEnabled=true;
    syncActiveFlags(p);
    return p;
  }

  function levelAmt(lv){ return LEVEL_AMT[clampLevel(lv)]||0; }
  function slimAmt(lv){ return SLIM_AMT[clampLevel(lv)]||0; }
  function rosyAmt(lv){ return ROSY_AMT[clampLevel(lv)]||0; }

  function beautifyApi(){
    return global.OneToneGpuBeautify||null;
  }

  function cameraPrefsRoot(){
    try{
      var st=global.OneToneState&&global.OneToneState.state;
      if(st&&st.config&&st.config.cameraPrefs&&typeof st.config.cameraPrefs==='object'){
        return st.config.cameraPrefs;
      }
    }catch(_){}
    return null;
  }

  function ensureCanvas(){
    if(!shellEl) return null;
    var existing=$('cameraEnhancedCanvas');
    if(existing&&existing.parentNode===shellEl){
      canvasEl=existing;
    }else{
      if(existing&&existing.parentNode){
        try{ existing.parentNode.removeChild(existing); }catch(_){}
      }
      canvasEl=document.createElement('canvas');
      canvasEl.id='cameraEnhancedCanvas';
      canvasEl.className='camera-enhanced-canvas';
      canvasEl.setAttribute('aria-hidden','true');
      shellEl.appendChild(canvasEl);
    }
    ensureMaskCanvas();
    return canvasEl;
  }

  function ensureMaskCanvas(){
    if(!shellEl) return null;
    var existing=$('cameraFaceMaskCanvas');
    if(existing&&existing.parentNode===shellEl){
      maskCanvasEl=existing;
    }else{
      if(existing&&existing.parentNode){
        try{ existing.parentNode.removeChild(existing); }catch(_){}
      }
      maskCanvasEl=document.createElement('canvas');
      maskCanvasEl.id='cameraFaceMaskCanvas';
      maskCanvasEl.className='camera-face-mask-canvas';
      maskCanvasEl.setAttribute('aria-hidden','true');
      shellEl.appendChild(maskCanvasEl);
    }
    if(!maskCtx){
      try{ maskCtx=maskCanvasEl.getContext('2d',{alpha:true}); }catch(_){ maskCtx=null; }
    }
    if(!faceMaskEng){
      var api=global.OneToneFaceMask;
      if(api&&api.create) faceMaskEng=api.create();
    }
    return maskCanvasEl;
  }

  function destroyBeautifyPipeline(){
    if(beautify){
      try{ beautify.destroy(); }catch(_){}
      beautify=null;
    }
    ctx2d=null;
  }

  function destroyMaskPipeline(){
    maskCtx=null;
    faceMaskEng=null;
    maskHold.lms=null;
    maskHold.at=0;
  }

  function destroyPipeline(){
    destroyBeautifyPipeline();
    destroyMaskPipeline();
  }

  function initGpuBeautify(canvas){
    destroyBeautifyPipeline();
    var api=beautifyApi();
    if(!api||typeof api.create!=='function') return false;
    var eng=api.create();
    if(!eng||!eng.init(canvas)){
      try{ if(eng) eng.destroy(); }catch(_){}
      return false;
    }
    beautify=eng;
    qualityTier='full';
    return true;
  }

  function initCanvas2d(canvas){
    destroyBeautifyPipeline();
    try{ ctx2d=canvas.getContext('2d',{alpha:false}); }catch(_){ ctx2d=null; }
    qualityTier='css';
    return !!ctx2d;
  }

  function pickMode(canvas){
    if(initGpuBeautify(canvas)) return 'webgl';
    if(initCanvas2d(canvas)) return 'canvas2d';
    qualityTier='css';
    return 'css';
  }

  function lmPoint(lms,i){
    if(!lms||i<0||i>=lms.length) return null;
    var p=lms[i];
    if(!p) return null;
    return {x:Number(p.x)||0,y:Number(p.y)||0};
  }

  function updateSmoothFace(){
    var now=(typeof performance!=='undefined'&&performance.now)?performance.now():Date.now();
    var api=global.OneToneCameraGazeLandmarker;
    var lms=api&&api.getLastLandmarks?api.getLastLandmarks():null;
    if(lms&&lms.length){
      var nose=lmPoint(lms,1)||lmPoint(lms,4);
      var chin=lmPoint(lms,152);
      var leftCheek=lmPoint(lms,234)||lmPoint(lms,93);
      var rightCheek=lmPoint(lms,454)||lmPoint(lms,323);
      var cx=nose?nose.x:0.5;
      var cy=nose?nose.y:0.42;
      if(chin) cy=(cy+chin.y)*0.5;
      var clx=leftCheek?leftCheek.x:0.35;
      var cly=leftCheek?leftCheek.y:0.48;
      var crx=rightCheek?rightCheek.x:0.65;
      var cry=rightCheek?rightCheek.y:0.48;
      var a=0.75,b=0.25;
      if(!smoothFace.has){ a=0; b=1; }
      smoothFace.cx=smoothFace.cx*a+cx*b;
      smoothFace.cy=smoothFace.cy*a+cy*b;
      smoothFace.cheekL.x=smoothFace.cheekL.x*a+clx*b;
      smoothFace.cheekL.y=smoothFace.cheekL.y*a+cly*b;
      smoothFace.cheekR.x=smoothFace.cheekR.x*a+crx*b;
      smoothFace.cheekR.y=smoothFace.cheekR.y*a+cry*b;
      smoothFace.has=true;
      smoothFace.at=now;
      return 'landmarks';
    }
    if(smoothFace.has&&(now-smoothFace.at)<FACE_HOLD_MS) return 'landmarks';
    if(smoothFace.has&&(now-smoothFace.at)<FACE_HOLD_MS+200){
      smoothFace.cx=smoothFace.cx*0.9+0.5*0.1;
      smoothFace.cy=smoothFace.cy*0.9+0.42*0.1;
      return 'simple';
    }
    smoothFace.has=false;
    smoothFace.cx=0.5; smoothFace.cy=0.42;
    smoothFace.cheekL={x:0.35,y:0.48};
    smoothFace.cheekR={x:0.65,y:0.48};
    return prefs.slim>0?'simple':'off';
  }

  function isActive(){
    return !!(wantsPipeline()&&running&&!bypassCompare);
  }

  function syncDisplayLayers(){
    var video=videoEl||$('cameraPreviewVideo');
    var canvas=canvasEl||$('cameraEnhancedCanvas');
    var mask=maskCanvasEl||$('cameraFaceMaskCanvas');
    var live=!!(video&&video.srcObject);
    var beautyOn=isActive()&&wantsBeauty()&&live;
    var maskOn=isActive()&&wantsMask()&&live;
    if(video){
      if(beautyOn&&mode!=='css') video.classList.add('is-enhanced-hidden');
      else video.classList.remove('is-enhanced-hidden');
      if(beautyOn&&mode==='css'){
        var w=1+levelAmt(prefs.whiten)*0.18+(prefs.brightness/100);
        var s=1+rosyAmt(prefs.rosy)*0.12+(prefs.saturation/100);
        var c=1+(prefs.contrast/100);
        video.style.filter='brightness('+Math.round(w*100)+'%) contrast('+Math.round(c*100)+'%) saturate('+Math.round(s*100)+'%)';
      }else{
        video.style.filter='';
      }
    }
    if(canvas){
      canvas.hidden=!beautyOn||mode==='css';
      canvas.style.pointerEvents='none';
    }
    if(mask){
      mask.hidden=!maskOn;
      mask.style.pointerEvents='none';
      if(!maskOn){
        maskHold.lms=null;
        maskHold.at=0;
        if(maskCtx){
          try{ maskCtx.clearRect(0,0,mask.width||0,mask.height||0); }catch(_){}
        }
      }
    }
  }

  function resizeMaskCanvas(){
    if(!maskCanvasEl||!videoEl) return;
    var vw=videoEl.videoWidth|0;
    var vh=videoEl.videoHeight|0;
    if(vw<=0||vh<=0){ vw=640; vh=360; }
    if(maskCanvasEl.width!==vw||maskCanvasEl.height!==vh){
      maskCanvasEl.width=vw;
      maskCanvasEl.height=vh;
      try{ maskCtx=maskCanvasEl.getContext('2d',{alpha:true}); }catch(_){ maskCtx=null; }
    }
  }

  function drawFaceMask(){
    if(!wantsMask()||!maskCanvasEl||!maskCtx) return;
    resizeMaskCanvas();
    var now=(typeof performance!=='undefined'&&performance.now)?performance.now():Date.now();
    var api=global.OneToneCameraGazeLandmarker;
    var lms=api&&api.getLastLandmarks?api.getLastLandmarks():null;
    if(lms&&lms.length){
      maskHold.lms=lms;
      maskHold.at=now;
    }else if(maskHold.lms&&(now-maskHold.at)<MASK_HOLD_MS){
      // Keep last plate for brief landmarker gaps (blink / turn / detect skip).
      lms=maskHold.lms;
    }else{
      maskHold.lms=null;
      maskHold.at=0;
      try{ maskCtx.clearRect(0,0,maskCanvasEl.width,maskCanvasEl.height); }catch(_){}
      return;
    }
    if(!faceMaskEng){
      var fm=global.OneToneFaceMask;
      if(fm&&fm.create) faceMaskEng=fm.create();
    }
    if(!faceMaskEng) return;
    try{
      faceMaskEng.draw(maskCtx,maskCanvasEl.width,maskCanvasEl.height,lms,prefs.faceMask);
    }catch(_){
      // Keep previous frame on draw errors — clearing here caused flicker/reload look.
    }
  }

  function buildBeautifyOpts(){
    var api=beautifyApi();
    var slimMode=updateSmoothFace();
    var hasFace=slimMode==='landmarks'||(slimMode==='simple'&&smoothFace.has);
    var doSlim=qualityTier==='full'&&prefs.slim>0&&slimMode!=='off';
    var slimStrength=slimAmt(prefs.slim);
    if(slimMode==='simple') slimStrength=Math.min(slimStrength,0.09);

    var smoothDegree=api&&api.smoothDegreeFromLevel
      ?api.smoothDegreeFromLevel(prefs.smooth)
      :[0,0.35,0.50,0.58][clampLevel(prefs.smooth)];
    var bright=api&&api.brightFromWhiten
      ?api.brightFromWhiten(prefs.whiten)
      :[1,1.04,1.08,1.12][clampLevel(prefs.whiten)];
    var sat=api&&api.satFromWhiten
      ?api.satFromWhiten(prefs.whiten)
      :[1,1.03,1.06,1.10][clampLevel(prefs.whiten)];

    // Fold optional picture controls into Guikunzhi HSB knobs (keep mild)
    bright*=(1+(prefs.brightness/100)*0.5);
    bright*=(1+(prefs.contrast/200)*0.5);
    sat*=(1+(prefs.saturation/100)*0.5);

    return {
      smoothDegree:smoothDegree,
      bright:bright,
      sat:sat,
      rosy:rosyAmt(prefs.rosy),
      slim:doSlim?slimStrength:0,
      doSlim:doSlim,
      hasFace:hasFace,
      faceC:{x:smoothFace.cx,y:smoothFace.cy},
      cheekL:{x:smoothFace.cheekL.x,y:smoothFace.cheekL.y},
      cheekR:{x:smoothFace.cheekR.x,y:smoothFace.cheekR.y},
      distanceNormalizationFactor:4.0
    };
  }

  function drawWebGl(){
    if(!beautify||!videoEl||!canvasEl) return;
    try{ beautify.process(videoEl,buildBeautifyOpts()); }catch(_){}
  }

  function drawCanvas2d(){
    if(!ctx2d||!videoEl||!canvasEl) return;
    var vw=videoEl.videoWidth|0;
    var vh=videoEl.videoHeight|0;
    if(vw>0&&vh>0&&(canvasEl.width!==vw||canvasEl.height!==vh)){
      canvasEl.width=vw;
      canvasEl.height=vh;
    }
    try{ ctx2d.drawImage(videoEl,0,0,canvasEl.width,canvasEl.height); }catch(_){}
  }

  function shouldThrottle(now){
    var fps=prefs.displayFrameRate|0;
    if(fps<=0) return false;
    return !!(lastDrawAt&&(now-lastDrawAt)<(1000/fps));
  }

  function renderOnce(){
    if(!isActive()||!videoEl) return;
    if(videoEl.readyState<2) return;
    var now=(typeof performance!=='undefined'&&performance.now)?performance.now():Date.now();
    if(shouldThrottle(now)) return;
    lastDrawAt=now;
    if(wantsBeauty()){
      if(mode==='webgl') drawWebGl();
      else if(mode==='canvas2d') drawCanvas2d();
    }
    if(wantsMask()) drawFaceMask();
  }

  function cancelLoops(){
    if(videoEl&&rvfcHandle&&typeof videoEl.cancelVideoFrameCallback==='function'){
      try{ videoEl.cancelVideoFrameCallback(rvfcHandle); }catch(_){}
    }
    rvfcHandle=0;
    if(rafHandle){ try{ cancelAnimationFrame(rafHandle); }catch(_){} }
    rafHandle=0;
  }

  function loopRvfc(){
    if(!running||!wantsPipeline()||!videoEl) return;
    if(typeof videoEl.requestVideoFrameCallback!=='function'){ loopRaf(); return; }
    rvfcHandle=videoEl.requestVideoFrameCallback(function(){
      rvfcHandle=0;
      if(!running||!wantsPipeline()) return;
      if(!bypassCompare) renderOnce();
      loopRvfc();
    });
  }

  function loopRaf(){
    if(!running||!wantsPipeline()) return;
    rafHandle=requestAnimationFrame(function(){
      rafHandle=0;
      if(!running||!wantsPipeline()) return;
      if(!bypassCompare) renderOnce();
      loopRaf();
    });
  }

  function startLoop(){
    cancelLoops();
    if(!wantsPipeline()||!running||!videoEl) return;
    if(typeof videoEl.requestVideoFrameCallback==='function') loopRvfc();
    else loopRaf();
  }

  function activatePipeline(){
    if(!shellEl||!videoEl) return;
    ensureCanvas();
    if(wantsBeauty()){
      if(!canvasEl) return;
      if(mode==='off'||(mode==='webgl'&&!beautify)||(mode==='canvas2d'&&!ctx2d)){
        mode=pickMode(canvasEl);
      }
    }
    ensureMaskCanvas();
    running=true;
    syncDisplayLayers();
    startLoop();
    renderOnce();
  }

  function deactivatePipeline(){
    running=false;
    cancelLoops();
    syncDisplayLayers();
  }

  function attach(video,shell){
    videoEl=video||$('cameraPreviewVideo');
    shellEl=shell||$('cameraPreviewShell');
    if(!videoEl||!shellEl) return false;
    ensureCanvas();
    syncFromCameraPrefs();
    if(wantsPipeline()) activatePipeline();
    else deactivatePipeline();
    return true;
  }

  function detach(){
    bypassCompare=false;
    deactivatePipeline();
    if(videoEl){
      videoEl.classList.remove('is-enhanced-hidden');
      videoEl.style.filter='';
    }
    if(canvasEl){ canvasEl.hidden=true; }
    if(maskCanvasEl){
      maskCanvasEl.hidden=true;
      if(maskCtx) try{ maskCtx.clearRect(0,0,maskCanvasEl.width,maskCanvasEl.height); }catch(_){}
    }
    destroyPipeline();
    mode='off';
    videoEl=null;
    shellEl=null;
  }

  function setPrefs(partial){
    partial=partial&&typeof partial==='object'?partial:{};
    var next=clonePrefs(prefs);
    if(partial.look!=null){
      applyLookDefaults(next,partial.look);
    }
    if(partial.faceMask!=null){
      next.faceMask=normalizeFaceMask(partial.faceMask);
    }
    if(partial.enabled!==undefined&&partial.look==null&&partial.faceMask==null){
      next.enabled=!!partial.enabled;
      if(!next.enabled){
        next.look='off';
        next.faceMask='off';
        next.beautyEnabled=false;
      }else if(next.look==='off'&&next.faceMask==='off'){
        next.look='natural';
      }
    }
    if(partial.beautyEnabled!==undefined&&partial.look==null) next.beautyEnabled=!!partial.beautyEnabled;
    if(partial.whiten!=null) next.whiten=clampLevel(partial.whiten);
    if(partial.smooth!=null) next.smooth=clampLevel(partial.smooth);
    if(partial.rosy!=null) next.rosy=clampLevel(partial.rosy);
    if(partial.slim!=null) next.slim=clampLevel(partial.slim);
    if(partial.brightness!=null) next.brightness=clamp(partial.brightness,-50,50)|0;
    if(partial.contrast!=null) next.contrast=clamp(partial.contrast,-50,50)|0;
    if(partial.saturation!=null) next.saturation=clamp(partial.saturation,-50,50)|0;
    if(partial.sharpen!=null) next.sharpen=clamp(partial.sharpen,0,100)|0;
    if(partial.denoise!=null) next.denoise=clamp(partial.denoise,0,100)|0;
    if(partial.lowLight!=null) next.lowLight=clamp(partial.lowLight,0,100)|0;
    if(partial.antiFlicker!=null) next.antiFlicker=normalizeAntiFlicker(partial.antiFlicker);
    if(partial.displayFrameRate!=null) next.displayFrameRate=normalizeDisplayFps(partial.displayFrameRate);
    if(partial.beauty!=null) next.beauty=clamp(partial.beauty,0,100)|0;
    syncActiveFlags(next);
    next.preset=lookToLegacyPreset(next.look);
    prefs=next;
    var root=cameraPrefsRoot();
    if(root) root.videoEnhancement=clonePrefs(prefs);
    if(wantsPipeline()&&videoEl&&shellEl) activatePipeline();
    else deactivatePipeline();
    syncDisplayLayers();
    return getPrefs();
  }

  function applyLook(look){
    return setPrefs({look:normalizeLook(look)});
  }

  function applyFaceMask(style){
    return setPrefs({faceMask:normalizeFaceMask(style)});
  }

  function getPrefs(){ return clonePrefs(prefs); }

  function syncFromCameraPrefs(){
    var root=cameraPrefsRoot();
    if(root&&root.videoEnhancement&&typeof root.videoEnhancement==='object'){
      prefs=clonePrefs(root.videoEnhancement);
    }else{
      prefs=clonePrefs(DEFAULT_PREFS);
    }
    if(wantsPipeline()&&videoEl&&shellEl) activatePipeline();
    else if(videoEl||canvasEl||maskCanvasEl) deactivatePipeline();
    return getPrefs();
  }

  function setCompareBypass(on){
    bypassCompare=!!on;
    syncDisplayLayers();
    if(!bypassCompare&&isActive()) renderOnce();
  }

  function getRuntimeStatus(){
    var slimMode='off';
    if(prefs.slim>0&&wantsBeauty()){
      slimMode=updateSmoothFace();
      if(qualityTier!=='full') slimMode=mode==='css'?'off':'simple';
    }
    return {
      enabled:!!prefs.enabled,
      active:isActive(),
      look:prefs.look,
      faceMask:prefs.faceMask||'off',
      mode:wantsBeauty()?(mode==='off'?'css':mode):'off',
      engine:mode==='webgl'?'gpuimage-beautify':mode,
      slimMode:slimMode,
      qualityTier:qualityTier,
      antiFlicker:prefs.antiFlicker,
      displayFrameRate:prefs.displayFrameRate|0,
      bypassCompare:!!bypassCompare,
      hasRvfc:!!(videoEl&&typeof videoEl.requestVideoFrameCallback==='function')
    };
  }

  function init(){
    if(bound) return;
    bound=true;
    syncFromCameraPrefs();
  }

  global.OneToneCameraVideoEnhancer={
    init:init,
    attach:attach,
    detach:detach,
    setPrefs:setPrefs,
    getPrefs:getPrefs,
    applyLook:applyLook,
    applyFaceMask:applyFaceMask,
    isActive:isActive,
    syncFromCameraPrefs:syncFromCameraPrefs,
    renderOnce:renderOnce,
    getRuntimeStatus:getRuntimeStatus,
    setCompareBypass:setCompareBypass,
    defaultPrefs:function(){ return clonePrefs(DEFAULT_PREFS); },
    normalizePrefs:clonePrefs,
    lookDefaults:function(look){ return LOOK_DEFAULTS[normalizeLook(look)]||LOOK_DEFAULTS.off; },
    mapLegacyPresetToLook:mapLegacyPresetToLook,
    normalizeFaceMask:normalizeFaceMask
  };

  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',init);
  }else{
    init();
  }
})((typeof window!=='undefined')?window:globalThis);
