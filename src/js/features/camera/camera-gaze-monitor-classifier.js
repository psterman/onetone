(function(global){
  'use strict';

  /**
   * Real-time coarse monitor classifier for Smart Pointer.
   * Prefer assessment centroids (good/ok only); fall back to fused gaze heuristic.
   *
   * Front-facing camera (unmirrored MediaPipe frame):
   *   looking toward the user's RIGHT → nose/iris move image-LEFT → landmark yaw negative.
   * Heuristic therefore uses look = -yaw (positive = user's right / right monitor).
   */

  function asNum(v, fallback){
    var n=Number(v);
    return isFinite(n)?n:(fallback!=null?fallback:0);
  }

  function featureVector(point){
    var Assess=global.OneToneCameraGazeMonitorAssessment;
    if(Assess&&Assess.featureVector) return Assess.featureVector(point);
    if(!point) return null;
    if(point.feats&&point.feats.length){
      var out=[];
      for(var i=0;i<point.feats.length;i++) out.push(asNum(point.feats[i]));
      return out;
    }
    return [asNum(point.yaw),asNum(point.pitch),asNum(point.x),asNum(point.y)];
  }

  function dist(a, b){
    var Assess=global.OneToneCameraGazeMonitorAssessment;
    if(Assess&&Assess.dist) return Assess.dist(a,b);
    if(!a||!b||a.length!==b.length) return Infinity;
    var s=0;
    for(var i=0;i<a.length;i++){
      var d=asNum(a[i])-asNum(b[i]);
      s+=d*d;
    }
    return Math.sqrt(s);
  }

  function monitorsByAlias(topology){
    var out={left:null,center:null,right:null};
    if(!topology||!topology.monitors) return out;
    for(var i=0;i<topology.monitors.length;i++){
      var m=topology.monitors[i];
      var alias=topology.aliases?topology.aliases[m.id]:null;
      if(alias&&out[alias]===null) out[alias]=m;
    }
    return out;
  }

  /**
   * Horizontal look score in user space: negative=left, positive=right, ~0=center.
   * Fuses inverted landmark yaw with iris/proxy x (and feats when present).
   */
  function lookScore(point){
    var yaw=asNum(point&&point.yaw);
    // Invert: landmark yaw+ = image-right = user's left on a front camera.
    var fromYaw=-yaw;

    var parts=[];
    var weights=[];
    parts.push(fromYaw);
    weights.push(1);

    var x=asNum(point&&point.x, NaN);
    if(isFinite(x)){
      parts.push((0.5-x)*2);
      weights.push(0.45);
    }
    var feats=point&&point.feats;
    if(feats&&feats.length>=7){
      var sock=-asNum(feats[0])/2.4;
      var iris=-asNum(feats[6])/2.4;
      // Only blend eye cues when they have signal (zeros would wash out yaw).
      if(Math.abs(sock)>0.04||Math.abs(iris)>0.04){
        parts.push(sock*0.55+iris*0.45);
        weights.push(0.55);
      }
    }

    var sum=0,wsum=0;
    for(var i=0;i<parts.length;i++){
      sum+=parts[i]*weights[i];
      wsum+=weights[i];
    }
    return wsum>0?sum/wsum:0;
  }

  /**
   * Heuristic mapping relative to cameraPosition + screenCount.
   */
  function heuristicAlias(point, settings){
    var look=lookScore(point);
    var cam=String(settings&&settings.cameraPosition||'center-top');
    // Wider center band than early MVP — reduces false left/right on small head noise.
    var leftT=-0.28;
    var rightT=0.28;
    if(cam==='left-top'){
      // Camera on left screen: looking "centerward" is a rightward look.
      leftT=-0.12;
      rightT=0.38;
    }else if(cam==='right-top'){
      leftT=-0.38;
      rightT=0.12;
    }else if(cam==='laptop-built-in'){
      leftT=-0.32;
      rightT=0.32;
    }
    var screenCount=Math.max(1,Math.min(3,(settings&&settings.screenCount)|0||3));
    if(screenCount===1) return 'center';
    if(screenCount===2){
      return look<0?'left':'right';
    }
    if(look<=leftT) return 'left';
    if(look>=rightT) return 'right';
    return 'center';
  }

  function nearestCentroidAlias(point, assessment){
    var centroids=assessment&&assessment.centroids;
    if(!centroids) return null;
    var vec=featureVector(point);
    if(!vec) return null;
    var best=null;
    var bestD=Infinity;
    var second=Infinity;
    Object.keys(centroids).forEach(function(alias){
      var c=centroids[alias];
      if(!c) return;
      var a=vec;
      var b=c;
      if(a.length!==b.length){
        var n=Math.min(a.length,b.length);
        a=a.slice(0,n);
        b=b.slice(0,n);
      }
      var d=dist(a,b);
      if(d<bestD){
        second=bestD;
        bestD=d;
        best=alias;
      }else if(d<second){
        second=d;
      }
    });
    if(!best) return null;
    var margin=second-bestD;
    var conf=1/(1+bestD);
    if(isFinite(margin)&&second<Infinity){
      conf=Math.min(0.99,conf*(0.65+Math.min(0.35,margin*2)));
    }
    // Weak margin → treat as unreliable (caller may fall back to heuristic).
    if(!(margin>0.04)&&bestD>0.35){
      conf*=0.5;
    }
    return {alias:best,distance:bestD,confidence:conf,margin:margin};
  }

  function classify(point, topology, assessment, settings){
    settings=settings&&typeof settings==='object'?settings:{};
    var byAlias=monitorsByAlias(topology);
    var source='heuristic';
    var alias=null;
    var conf=asNum(point&&point.confidence,0);
    var stale=false;
    if(assessment&&assessment.status==='stale') stale=true;

    var Assess=global.OneToneCameraGazeMonitorAssessment;
    if(Assess&&Assess.applyFingerprint&&topology&&topology.fingerprint){
      assessment=Assess.applyFingerprint(assessment,topology.fingerprint);
      if(assessment.status==='stale') stale=true;
    }

    // Poor assessment is advisory only — do not drive live classification.
    var useAssessment=assessment
      &&assessment.status==='ready'
      &&!stale
      &&assessment.centroids
      &&(assessment.quality==='good'||assessment.quality==='ok');

    if(useAssessment){
      var near=nearestCentroidAlias(point, assessment);
      if(near&&near.alias&&near.confidence>=0.28){
        alias=near.alias;
        conf=Math.min(conf,near.confidence);
        if(assessment.quality==='ok') conf*=0.9;
        source='assessment';
      }
    }

    if(!alias){
      alias=heuristicAlias(point, settings);
      source='heuristic';
      conf=Math.min(conf,0.62);
    }

    var monitor=byAlias[alias]||null;
    if(!monitor&&topology&&topology.monitors&&topology.monitors.length){
      var ms=topology.monitors;
      if(alias==='left') monitor=ms[0];
      else if(alias==='right') monitor=ms[ms.length-1];
      else monitor=ms[Math.floor(ms.length/2)];
      if(monitor&&topology.aliases) alias=topology.aliases[monitor.id]||alias;
    }

    return {
      monitorId:monitor?monitor.id:null,
      alias:alias,
      confidence:Math.max(0,Math.min(1,conf)),
      source:source,
      stale:stale,
      look:lookScore(point),
      lowAccuracy:source==='heuristic'||(assessment&&assessment.quality==='poor')||stale
    };
  }

  function createStability(){
    return {
      monitorId:null,
      since:0,
      lastConf:0,
      stableMs:0,
      pendingId:null,
      pendingSince:0
    };
  }

  /**
   * Sticky stability: require ~180ms consistent new id before switching,
   * so brief left/right flicker does not reset dwell / jump cursor.
   */
  function updateStability(state, result, now){
    now=now!=null?now:Date.now();
    state=state||createStability();
    var id=result&&result.monitorId?String(result.monitorId):'';
    var SWITCH_HOLD_MS=180;
    if(!id){
      state.monitorId=null;
      state.since=0;
      state.stableMs=0;
      state.lastConf=0;
      state.pendingId=null;
      state.pendingSince=0;
      return state;
    }
    // First lock — no hold delay.
    if(!state.monitorId){
      state.monitorId=id;
      state.since=now;
      state.stableMs=0;
      state.lastConf=asNum(result.confidence);
      state.pendingId=null;
      state.pendingSince=0;
      return state;
    }
    if(state.monitorId===id){
      state.stableMs=Math.max(0,now-state.since);
      state.lastConf=asNum(result.confidence);
      state.pendingId=null;
      state.pendingSince=0;
      return state;
    }
    if(state.pendingId!==id){
      state.pendingId=id;
      state.pendingSince=now;
      return state;
    }
    if((now-state.pendingSince)<SWITCH_HOLD_MS){
      return state;
    }
    state.monitorId=id;
    state.since=now;
    state.stableMs=0;
    state.lastConf=asNum(result.confidence);
    state.pendingId=null;
    state.pendingSince=0;
    return state;
  }

  global.OneToneCameraGazeMonitorClassifier={
    featureVector:featureVector,
    lookScore:lookScore,
    heuristicAlias:heuristicAlias,
    nearestCentroidAlias:nearestCentroidAlias,
    monitorsByAlias:monitorsByAlias,
    classify:classify,
    createStability:createStability,
    updateStability:updateStability
  };
})(typeof window!=='undefined'?window:typeof global!=='undefined'?global:this);
