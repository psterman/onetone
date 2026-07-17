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

  // 9-point grid for better spatial coverage with multi-feature model.
  var TARGETS=[
    {id:'center',x:0.5,y:0.5},
    {id:'tl',x:0.12,y:0.12},
    {id:'tc',x:0.5,y:0.12},
    {id:'tr',x:0.88,y:0.12},
    {id:'ml',x:0.12,y:0.5},
    {id:'mr',x:0.88,y:0.5},
    {id:'bl',x:0.12,y:0.88},
    {id:'bc',x:0.5,y:0.88},
    {id:'br',x:0.88,y:0.88}
  ];
  var TARGET_HINTS={
    center:['cameraGazeCalibCenter','请看向屏幕中央亮点'],
    tl:['cameraGazeCalibTL','请看向左上角亮点'],
    tc:['cameraGazeCalibTC','请看向上方中央亮点'],
    tr:['cameraGazeCalibTR','请看向右上角亮点'],
    ml:['cameraGazeCalibML','请看向左侧中央亮点'],
    mr:['cameraGazeCalibMR','请看向右侧中央亮点'],
    bl:['cameraGazeCalibBL','请看向左下角亮点'],
    bc:['cameraGazeCalibBC','请看向下方中央亮点'],
    br:['cameraGazeCalibBR','请看向右下角亮点']
  };
  var PREPARE_SEC=3;
  var SAMPLE_SEC=2;
  var MIN_CALIB_POINTS=5;
  var MAX_POINT_ATTEMPTS=4;
  var MIN_SAMPLES=6;
  var MIN_CONF=0.35;
  var STABLE_STD=0.095;
  var RIDGE=1e-4;
  var FEAT_DIM=8; // matches landmarker feats length
  var EXT_DIM=14; // extended vector for IDW / ridge
  var IDW_POWER=2.8;
  var IDW_TEMP=0.14; // softmax temperature (lower = sharper corner pick)
  var IDW_POWER_APPLY=1.45;
  var IDW_TEMP_APPLY=0.28;
  var GRID_COLS=[0.12,0.5,0.88];
  var GRID_ROWS=[0.12,0.5,0.88];
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
  var APPLY_OUT_ALPHA=0.32;
  var APPLY_OUT_ALPHA_FAST=0.48;
  var CRITICAL_CORNER_IDS=['tl','tr','bl','br'];
  var REMEDIAL_TARGET_ORDER=['tl','tr','bl','br','tc','ml','mr','bc','center'];
  var MAX_CORNER_ATTEMPTS=5;
  var MAX_REMEDIAL_ROUNDS=2;

  var model=null; // {betaX,betaY,rmse,vw,vh,lowQuality,stale,kind:'ridge'}
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
  var calibGen=0;
  var calibWaitRaf=0;
  var calibWaitResolve=null;
  var calibWaitState=null;
  var featSmooth=null;
  var applyOutSmooth={cx:null,cy:null};

  function resetRuntimeSmoothers(){
    featSmooth=null;
    applyOutSmooth.cx=null;
    applyOutSmooth.cy=null;
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
    var pair=TARGET_HINTS[target&&target.id?target.id:'center']||TARGET_HINTS.center;
    var hint=t(pair[0],pair[1]);
    if(target&&target.id&&target.id!=='center'&&target.id!=='tc'&&target.id!=='bc'&&target.id!=='ml'&&target.id!=='mr'){
      hint+=' · '+t('cameraGazeCalibrationHeadHint','边角处请微微转头');
    }
    return hint;
  }

  function setCalibrationUi(opts){
    var o=opts&&typeof opts==='object'?opts:{};
    var titleEl=$('cameraGazeCalibrationTitle');
    var progressEl=$('cameraGazeCalibrationProgress');
    var countdownEl=$('cameraGazeCalibrationCountdown');
    if(titleEl&&o.title!=null) titleEl.textContent=String(o.title);
    if(progressEl&&o.subtitle!=null) progressEl.textContent=String(o.subtitle);
    if(countdownEl){
      if(o.countdown!=null&&o.countdown!==''){
        countdownEl.textContent=String(o.countdown);
        countdownEl.hidden=false;
        countdownEl.removeAttribute('hidden');
      }else{
        countdownEl.textContent='';
        countdownEl.hidden=true;
        countdownEl.setAttribute('hidden','');
      }
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
    if(!el) return;
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
        var panelW=panel.offsetWidth||Math.min(400,vw*0.9);
        var panelH=panel.offsetHeight||120;
        var gap=72;
        var left=sx-panelW/2;
        var top=sy+gap;
        if(top+panelH>vh-16) top=sy-gap-panelH;
        if(top<16) top=16;
        left=clamp(left,16,Math.max(16,vw-panelW-16));
        panel.style.left=Math.round(left)+'px';
        panel.style.top=Math.round(top)+'px';
        panel.style.bottom='auto';
        panel.style.transform='none';
      }
    }
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

  function extendedFeats(feats,rx,ry){
    var f=normalizeFeats(feats);
    rx=clamp01(rx!=null?rx:0.5);
    ry=clamp01(ry!=null?ry:0.5);
    return [
      f[0],f[1],f[2],f[3],f[4],f[5],f[6],f[7],
      rx,ry,
      f[4]*f[5],
      f[0]*f[2],
      f[1]*f[3],
      rx*rx,
      ry*ry
    ];
  }

  function buildFeatScaler(anchors){
    var means=[];
    var stds=[];
    for(var d=0;d<EXT_DIM;d++){
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
    for(var i=0;i<EXT_DIM;i++){
      var diff=(ext[i]-anchorExt[i])/scaler.stds[i];
      d+=diff*diff;
    }
    return Math.sqrt(d/EXT_DIM);
  }

  function featureRow(feats,rx,ry){
    return [1].concat(extendedFeats(feats,rx,ry));
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

  function predictClient(beta,feats,rx,ry){
    var row=featureRow(feats,rx,ry);
    var s=0;
    for(var i=0;i<row.length;i++) s+=beta[i]*row[i];
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
      var px=predictClient(ridge.betaX,held.feats,held.rx,held.ry);
      var py=predictClient(ridge.betaY,held.feats,held.rx,held.ry);
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

  function runtimePredictKind(m){
    if(!m) return 'idw';
    if(m.betaU&&m.betaV&&gridTopologyEligibleAnchors(m.anchors)) return 'grid';
    return m.kind||'idw';
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

  function smoothApplyOutput(cx,cy,vw,vh){
    if(applyOutSmooth.cx==null||applyOutSmooth.cy==null){
      applyOutSmooth.cx=cx;
      applyOutSmooth.cy=cy;
      return {cx:cx,cy:cy};
    }
    var jump=Math.abs(cx-applyOutSmooth.cx)+Math.abs(cy-applyOutSmooth.cy);
    var span=Math.min(vw||1,vh||1);
    var alpha=jump>span*0.14?APPLY_OUT_ALPHA_FAST:APPLY_OUT_ALPHA;
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
        return predictClient(m.betaU,a.feats,a.rx,a.ry);
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
        return predictClient(m.betaV,a.feats,a.rx,a.ry);
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
    var rawU=predictClient(m.betaU,feats,rx,ry);
    var rawV=predictClient(m.betaV,feats,rx,ry);
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
          ext:extendedFeats(p.feats,p.rx,p.ry),
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
      var pred=predictGrid(held.feats,held.rx,held.ry,extendedFeats(held.feats,held.rx,held.ry),sub,vw,vh);
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

  function fitRidgeScalar(pairs,key){
    var dim=EXT_DIM+1;
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
      var row=featureRow(p.feats,p.rx,p.ry);
      var target=clamp01(p[key]!=null?p[key]:0.5);
      Sw+=w;
      for(i=0;i<dim;i++){
        Atb[i]+=w*row[i]*target;
        for(j=0;j<dim;j++) AtA[i][j]+=w*row[i]*row[j];
      }
    }
    var lam=RIDGE*Math.max(1,Sw);
    for(i=0;i<dim;i++) AtA[i][i]+=lam;
    return solveN(AtA,Atb);
  }

  function fitRidge(pairs){
    // Weighted ridge on extended features (rx/ry included).
    var dim=EXT_DIM+1;
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
      var row=featureRow(p.feats,p.rx,p.ry);
      Sw+=w;
      for(i=0;i<dim;i++){
        Atx[i]+=w*row[i]*p.cx;
        Aty[i]+=w*row[i]*p.cy;
        for(j=0;j<dim;j++) AtA[i][j]+=w*row[i]*row[j];
      }
    }
    var lam=RIDGE*Math.max(1,Sw);
    for(i=0;i<dim;i++) AtA[i][i]+=lam;
    var betaX=solveN(AtA,Atx);
    var betaY=solveN(AtA,Aty);
    if(!betaX||!betaY) return null;
    var sse=0,wSum=0;
    for(k=0;k<pairs.length;k++){
      var q=pairs[k];
      var ww=q.weight!=null?Math.max(0.2,Number(q.weight)):1;
      var px=predictClient(betaX,q.feats,q.rx,q.ry);
      var py=predictClient(betaY,q.feats,q.rx,q.ry);
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
        ext:extendedFeats(p.feats,p.rx,p.ry),
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

  function finalizeBuiltModel(prep,ridge,gridBetas,idwLoo,ridgeLoo,gridLoo){
    var kind='idw';
    var rmse=idwLoo;
    if(ridgeLoo<rmse){
      kind='ridge';
      rmse=ridgeLoo;
    }
    if(gridLoo<rmse){
      kind='grid';
      rmse=gridLoo;
    }
    calibLog('model pick kind='+kind+' idwLoo='+Math.round(idwLoo)+' ridgeLoo='+Math.round(ridgeLoo)+' gridLoo='+Math.round(gridLoo));
    return {
      anchors:prep.anchors,
      scaler:prep.scaler,
      betaX:ridge?ridge.betaX:null,
      betaY:ridge?ridge.betaY:null,
      betaU:gridBetas?gridBetas.betaU:null,
      betaV:gridBetas?gridBetas.betaV:null,
      rmse:rmse,
      idwRmse:idwLoo,
      ridgeRmse:ridgeLoo<1e8?ridgeLoo:null,
      gridRmse:gridLoo<1e8?gridLoo:null,
      kind:kind,
      vw:global.innerWidth||0,
      vh:global.innerHeight||0,
      lowQuality:false,
      stale:false,
      skippedPoints:0,
      synthNodeCount:0,
      savedAt:Date.now()
    };
  }

  function buildModelFromPairs(pairs){
    var prep=prepareModelPairs(pairs);
    var idwLoo=evalLooRmse('idw',prep.pairs,prep.anchors,prep.scaler);
    var ridge=fitRidge(prep.pairs);
    var ridgeLoo=ridge?evalLooRmse('ridge',prep.pairs,prep.anchors,prep.scaler):1e9;
    var gridEligible=gridTopologyEligible(prep.pairs);
    var gridBetas=gridEligible?buildGridBetas(prep.pairs):null;
    var gridLoo=gridEligible&&gridBetas?evalGridLooRmse(prep.pairs):1e9;
    return finalizeBuiltModel(prep,ridge,gridBetas,idwLoo,ridgeLoo,gridLoo);
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
      }catch(err){
        cb(null,err);
        return;
      }
      setTimeout(function(){
        try{
          var gridEligible=gridTopologyEligible(prep.pairs);
          var gridBetas=gridEligible?buildGridBetas(prep.pairs):null;
          var gridLoo=gridEligible&&gridBetas?evalGridLooRmse(prep.pairs):1e9;
          cb(finalizeBuiltModel(prep,ridge,gridBetas,idwLoo,ridgeLoo,gridLoo));
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
        cx:predictClient(m.betaX,feats,rx,ry),
        cy:predictClient(m.betaY,feats,rx,ry)
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

  function persistGazeCalibrationSnapshot(snapshot){
    var prefs=getCameraPrefsRef();
    if(!prefs) return;
    prefs.gazeCalibration=snapshot;
    setTimeout(function(){
      if(global.OneToneConfigPersist){
        if(global.OneToneConfigPersist.saveAsync) global.OneToneConfigPersist.saveAsync();
        else if(global.OneToneConfigPersist.save) global.OneToneConfigPersist.save();
      }
    },0);
  }

  function serializeModel(m){
    if(!m||!m.anchors||!m.anchors.length) return null;
    return {
      kind:m.kind||'idw',
      rmse:m.rmse,
      idwRmse:m.idwRmse,
      ridgeRmse:m.ridgeRmse,
      gridRmse:m.gridRmse,
      skippedPoints:m.skippedPoints||0,
      synthNodeCount:m.synthNodeCount||0,
      vw:m.vw,vh:m.vh,
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
        ext:Array.isArray(a.ext)?a.ext.slice():extendedFeats(a.feats,a.rx,a.ry),
        rx:clamp01(a.rx),
        ry:clamp01(a.ry),
        nx:nx,
        ny:ny,
        targetId:a.targetId||'',
        cx:Number(a.cx)||0,
        cy:Number(a.cy)||0
      };
    });
    var scaler=snapshot.scaler;
    if(!scaler||!scaler.means||!scaler.stds) scaler=buildFeatScaler(anchors);
    var betaU=snapshot.betaU||null;
    var betaV=snapshot.betaV||null;
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
    return {
      anchors:anchors,
      scaler:scaler,
      betaX:snapshot.betaX||null,
      betaY:snapshot.betaY||null,
      betaU:betaU,
      betaV:betaV,
      rmse:Number(snapshot.rmse)||0,
      idwRmse:snapshot.idwRmse,
      ridgeRmse:snapshot.ridgeRmse,
      gridRmse:snapshot.gridRmse,
      skippedPoints:Number(snapshot.skippedPoints)||0,
      synthNodeCount:Number(snapshot.synthNodeCount)||0,
      kind:snapshot.kind||'idw',
      vw:Number(snapshot.vw)||global.innerWidth||0,
      vh:Number(snapshot.vh)||global.innerHeight||0,
      lowQuality:!!snapshot.lowQuality,
      stale:!!snapshot.stale,
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
    syncUiFromModel();
    updateCalibWarnings();
    return true;
  }

  function rmseThreshold(){
    var w=global.innerWidth||800;
    var h=global.innerHeight||600;
    // Multi-feature model should land well below face-xy affine RMSE.
    return Math.max(40,Math.min(w,h)*0.07);
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
    if(isFinite(m.rmse)){
      text+=' · RMSE '+Math.round(m.rmse)+'px';
      if(m.kind) text+=' · '+m.kind;
      if(m.idwRmse!=null&&isFinite(m.idwRmse)){
        text+=' (LOO i'+Math.round(m.idwRmse);
        if(m.ridgeRmse!=null&&isFinite(m.ridgeRmse)) text+='/r'+Math.round(m.ridgeRmse);
        if(m.gridRmse!=null&&isFinite(m.gridRmse)) text+='/g'+Math.round(m.gridRmse);
        text+=')';
      }
    }
    if(skipped>0){
      text+=' · '+t('cameraGazeCalibSkipped','跳过 {n} 点').replace('{n}',String(skipped));
    }
    return text;
  }

  function syncUiFromModel(){
    if(!model){
      if(statusKind!=='failed'&&statusKind!=='canceled'&&statusKind!=='running') setStatusKind('idle');
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
  }

  function hasModel(){ return !!model; }

  function getState(){
    return {
      running:!!running,
      hasModel:!!model,
      stale:!!(model&&model.stale),
      lowQuality:!!(model&&model.lowQuality),
      rmse:model?model.rmse:null,
      kind:model?model.kind:null,
      idwRmse:model?model.idwRmse:null,
      ridgeRmse:model?model.ridgeRmse:null,
      gridRmse:model?model.gridRmse:null,
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

  function markModelStale(){
    if(!model||model.stale) return;
    model.stale=true;
    persistGazeCalibrationSnapshot(serializeModel(model));
    if(!running){
      setStatusKind('stale');
      syncUiFromModel();
    }
    updateCalibWarnings();
    notifyPreviewCalibrated();
  }

  function scaleStalePixel(cx,cy,m,vw,vh){
    if(!m||!m.stale||!m.vw||!m.vh) return {cx:cx,cy:cy};
    return {
      cx:cx*(vw/m.vw),
      cy:cy*(vh/m.vh)
    };
  }

  function tryStartCalibrationFromUi(){
    var st=ensurePreviewReadyForCalib();
    if(!st||!st.previewLive){
      setStatusKind('failed');
      var status=$('cameraStatusText');
      if(status) status.textContent=t('cameraGazeCalibrationNeedLive','请先开始预览');
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
    start();
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
    var ext=extendedFeats(feats,rx,ry);
    var kind=runtimePredictKind(model);
    var pred=predictWithKind(kind,feats,rx,ry,ext,model,vw,vh);
    if(!pred&&kind!=='ridge'){
      pred=predictWithKind('ridge',feats,rx,ry,ext,model,vw,vh);
    }
    if(!pred&&kind!=='grid'&&model.betaU&&model.betaV){
      pred=predictWithKind('grid',feats,rx,ry,ext,model,vw,vh);
    }
    if(!pred){
      pred=nearestAnchorPred(ext,model.anchors,model.scaler);
    }
    var clientX=rx*vw;
    var clientY=ry*vh;
    if(pred){
      clientX=pred.cx;
      clientY=pred.cy;
      if(model.stale){
        var scaled=scaleStalePixel(clientX,clientY,model,vw,vh);
        clientX=scaled.cx;
        clientY=scaled.cy;
      }
      var smoothed=smoothApplyOutput(clientX,clientY,vw,vh);
      clientX=smoothed.cx;
      clientY=smoothed.cy;
    }
    var clampedX=clamp(clientX,0,vw);
    var clampedY=clamp(clientY,0,vh);
    var outConf=conf;
    if(pred&&pred.confidence!=null&&isFinite(pred.confidence)){
      outConf=clamp01(conf*0.5+pred.confidence*0.5);
    }
    if(clampedX!==clientX||clampedY!==clientY) outConf=clamp01(outConf*0.85);
    if(model.stale) outConf=clamp01(outConf*0.9);
    return {
      x:clamp01(clampedX/vw),
      y:clamp01(clampedY/vh),
      confidence:outConf,
      state:st,
      clientX:clampedX,
      clientY:clampedY,
      screenX:(Number(global.screenX)||0)+clampedX,
      screenY:(Number(global.screenY)||0)+clampedY,
      calibrated:true,
      stale:!!model.stale,
      lowQuality:!!model.lowQuality,
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

  function evaluateSampleBuf(target,relaxed){
    var minNeed=relaxed?4:MIN_SAMPLES;
    if(sampleBuf.length<minNeed){
      return {ok:false,reason:'samples',count:sampleBuf.length};
    }
    var featJitter=featStdMax(sampleBuf);
    var jitterThr=relaxed?STABLE_STD*1.4:STABLE_STD;
    if(featJitter>jitterThr){
      return {ok:false,reason:'unstable',featJitter:featJitter,count:sampleBuf.length};
    }
    var confSum=0;
    for(var i=0;i<sampleBuf.length;i++) confSum+=sampleBuf[i].confidence;
    var avgConf=confSum/sampleBuf.length;
    var vw=global.innerWidth||1;
    var vh=global.innerHeight||1;
    return {
      ok:true,
      feats:featMean(sampleBuf),
      rx:weightedRobustMean(sampleBuf,'x'),
      ry:weightedRobustMean(sampleBuf,'y'),
      nx:clamp01(target.x),
      ny:clamp01(target.y),
      targetId:target.id||'',
      cx:target.x*vw,
      cy:target.y*vh,
      weight:0.5+0.5*clamp01(avgConf)
    };
  }

  function waitAndSampleOnce(target,pointIndex,attempt,gen,collectedCount){
    var hint=targetHint(target);
    var pointLabel=t('cameraGazeCalibStep','校准点 {n} / {total}')
      .replace('{n}',String(pointIndex+1))
      .replace('{total}',String(TARGETS.length));
    if(collectedCount!=null){
      pointLabel=calibrationProgressLabel(collectedCount)+' · '+pointLabel;
    }
    if(attempt>0){
      pointLabel+=' · '+t('cameraGazeCalibrationRetry','重试')+' '+attempt;
    }
    calibLog('point '+(pointIndex+1)+' attempt '+attempt);
    sampleBuf=[];
    collecting=false;
    placeTarget(target.x,target.y);
    setCalibrationUi({
      title:hint,
      subtitle:pointLabel,
      countdown:PREPARE_SEC,
      phase:'prepare'
    });
    return waitCountdownSec(PREPARE_SEC,function(sec){
      if(cancelled||!running||gen!==calibGen) return;
      setCalibrationUi({
        title:hint,
        subtitle:sec>0
          ? t('cameraGazeCalibPrepare','准备中，请看向亮点')
          : t('cameraGazeCalibHold','保持注视，正在采样…'),
        countdown:sec>0?String(sec):'',
        phase:sec>0?'prepare':'sample'
      });
    },gen).then(function(){
      if(cancelled||!running||gen!==calibGen) return null;
      collecting=true;
      sampleBuf=[];
      startSamplePump(function(count){
        if(!collecting) return;
        setCalibrationUi({
          subtitle:pointLabel+' · '+t('cameraGazeCalibSampling','采样')+' '+count+'/'+MIN_SAMPLES,
          phase:'sample'
        });
      });
      setCalibrationUi({
        title:t('cameraGazeCalibHold','保持注视，正在采样…'),
        subtitle:pointLabel,
        countdown:SAMPLE_SEC,
        phase:'sample'
      });
      return waitCountdownSec(SAMPLE_SEC,function(sec){
        if(cancelled||!running||gen!==calibGen) return;
        setCalibrationUi({
          title:t('cameraGazeCalibHold','保持注视，正在采样…'),
          subtitle:pointLabel+(sampleBuf.length?(' · '+sampleBuf.length+'/'+MIN_SAMPLES):''),
          countdown:sec>0?String(sec):'',
          phase:'sample'
        });
      },gen);
    }).then(function(){
      collecting=false;
      stopSamplePump();
      if(cancelled||!running||gen!==calibGen) return null;
      var relaxed=attempt>=MAX_POINT_ATTEMPTS-1;
      var result=evaluateSampleBuf(target,relaxed);
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
    var total=TARGETS.length;
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
    var out=[];
    for(var i=0;i<REMEDIAL_TARGET_ORDER.length;i++){
      var id=REMEDIAL_TARGET_ORDER[i];
      if(!have[id]){
        var t=targetById(id);
        if(t) out.push(t);
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
    if(pairs.length<MIN_CALIB_POINTS){
      setOverlayVisible(false);
      setCalibrationUi({countdown:'',phase:'idle'});
      finishFail(t('cameraGazeCalibrationFailedFew','有效校准点不足（至少 '+MIN_CALIB_POINTS+' 个），请重试'));
      return;
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
        var low=built.rmse>thr;
        built.lowQuality=low;
        built.savedAt=Date.now();
        built.skippedPoints=skippedPoints;
        built.synthNodeCount=countSynthGridNodes(built.anchors);
        resetRuntimeSmoothers();
        model=built;
        persistGazeCalibrationSnapshot(serializeModel(model));
        setOverlayVisible(false);
        setCalibrationUi({countdown:'',phase:'idle'});
        setStatusKind(low?'low':'ready');
        var statusEl=$('cameraGazeCalibrationStatus');
        if(statusEl){
          var rmseText=formatCalibStatusText(model,skippedPoints);
          statusEl.textContent=rmseText;
          var glance=$('cameraGlanceCalib');
          if(glance) glance.textContent=rmseText;
        }
        calibLog('saved kind='+model.kind+' rmse='+Math.round(model.rmse)+' synthNodes='+model.synthNodeCount);
        updateCalibWarnings();
        notifyPreviewCalibrated();
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
      var isCorner=isCriticalCorner(target.id);
      placeTarget(target.x,target.y);
      setCalibrationUi({
        title:isCorner
          ? t('cameraGazeCalibRemedialCorner','缺角补采：请看向角落亮点')
          : t('cameraGazeCalibRemedial','补采缺失点，请看向亮点'),
        subtitle:calibrationProgressLabel(pairs,'remedial')+' · '+
          t('cameraGazeCalibRemedialStep','补采 {id} · 第 {round} 轮')
            .replace('{id}',target.id)
            .replace('{round}',String(round+1)),
        countdown:PREPARE_SEC,
        phase:'remedial'
      });
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
            title:t('cameraGazeCalibRemedialOk','补采成功'),
            subtitle:calibrationProgressLabel(pairs,'remedial'),
            countdown:'',
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

  function attemptFinishCalibration(pairs,gen,remedialStarted){
    var missing=missingTargetsInOrder(pairs);
    if(!remedialStarted&&missing.length>0&&!cancelled&&running){
      runRemedialPass(pairs,gen,0,function(updated){
        if(cancelled||!running) return;
        attemptFinishCalibration(updated,gen,true);
      });
      return;
    }
    finishCalibrationFromPairs(pairs,gen);
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
      if(idx>=TARGETS.length){
        attemptFinishCalibration(pairs,gen,false);
        return;
      }
      waitAndSample(TARGETS[idx],idx,gen,null,pairs.length).then(function(res){
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
          calibLog('skip point '+(idx+1)+' id='+TARGETS[idx].id);
          var skipTitle=isCriticalCorner(TARGETS[idx].id)
            ? t('cameraGazeCalibCornerSkipped','角落采样失败，稍后将补采')
            : t('cameraGazeCalibPointSkipped','本点采样失败，继续下一点');
          setCalibrationUi({
            title:skipTitle,
            subtitle:calibrationProgressLabel(pairs.length)+' · '+
              t('cameraGazeCalibStep','校准点 {n} / {total}')
                .replace('{n}',String(idx+1))
                .replace('{total}',String(TARGETS.length)),
            countdown:'',
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

  function start(){
    if(running) stop({reason:'restart'});
    var preview=global.OneToneCameraPreview;
    if(preview&&preview.setGazeDebugEnabled){
      try{ preview.setGazeDebugEnabled(true); }catch(_){}
    }
    cancelled=false;
    calibGen++;
    var gen=calibGen;
    skippedPoints=0;
    clearTimers();
    sampleBuf=[];
    collecting=false;
    running=true;
    setLandmarkerThrottle(true);
    setStatusKind('running');
    setOverlayVisible(true);
    calibLog('start gen='+gen);
    setCalibrationUi({
      title:t('cameraGazeCalibrationRunning','请看向目标点'),
      subtitle:t('cameraGazeCalibStep','校准点 {n} / {total}').replace('{n}','1').replace('{total}',String(TARGETS.length)),
      countdown:PREPARE_SEC,
      phase:'prepare'
    });
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
    calibGen++;
    clearTimers();
    setOverlayVisible(false);
    setCalibrationUi({countdown:'',phase:'idle'});
    if(reason==='cancel') setStatusKind('canceled');
  }

  function clear(){
    stop({reason:'cancel'});
    model=null;
    resetRuntimeSmoothers();
    persistGazeCalibrationSnapshot(null);
    setStatusKind('idle');
    updateCalibWarnings();
    notifyPreviewCalibrated();
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
    var clearBtn=$('cameraGazeClearCalibrationBtn');
    if(startBtn){
      startBtn.addEventListener('click',function(e){
        e.preventDefault();
        tryStartCalibrationFromUi();
      });
    }
    if(clearBtn){
      clearBtn.addEventListener('click',function(e){
        e.preventDefault();
        clear();
      });
    }
    var staleRecalibBtn=$('cameraGazeStaleRecalibBtn');
    if(staleRecalibBtn){
      staleRecalibBtn.addEventListener('click',function(e){
        e.preventDefault();
        tryStartCalibrationFromUi();
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
    if(!model) setStatusKind('idle');
    updateCalibWarnings();
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
    syncUiFromModel:syncUiFromModel,
    loadFromPrefs:loadFromPrefs,
    updateLowResWarn:updateLowResWarn,
    updateCalibWarnings:updateCalibWarnings,
    resetRuntimeSmoothers:resetRuntimeSmoothers
  };

  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',init);
  }else{
    init();
  }
})((typeof window!=='undefined')?window:globalThis);
