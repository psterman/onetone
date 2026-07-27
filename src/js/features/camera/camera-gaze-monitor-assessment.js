(function(global){
  'use strict';

  /**
   * Smart Pointer assessment / light calibration.
   * Collects landmarker feats while user looks at mid/left/right screens,
   * builds centroids, and scores separability conservatively.
   */

  var SAMPLE_MS_MIN=1500;
  var SAMPLE_MS_MAX=2000;
  var STEPS=['center','left','right'];

  function emptyAssessment(){
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

  function asNum(v, fallback){
    var n=Number(v);
    return isFinite(n)?n:(fallback!=null?fallback:0);
  }

  function cloneFeats(feats){
    if(!feats||!feats.length) return null;
    var out=[];
    for(var i=0;i<feats.length;i++) out.push(asNum(feats[i]));
    return out;
  }

  function featureVector(point){
    if(!point||typeof point!=='object') return null;
    var feats=cloneFeats(point.feats);
    if(feats&&feats.length){
      // Prefer landmarker feats; append yaw/pitch if missing in feats.
      if(feats.length>=6) return feats.slice(0,8);
      return feats;
    }
    return [
      asNum(point.x),
      asNum(point.y),
      asNum(point.yaw),
      asNum(point.pitch),
      asNum(point.confidence)
    ];
  }

  function meanVector(vectors){
    if(!vectors||!vectors.length) return null;
    var dim=vectors[0].length;
    var acc=new Array(dim);
    for(var d=0;d<dim;d++) acc[d]=0;
    var n=0;
    for(var i=0;i<vectors.length;i++){
      var v=vectors[i];
      if(!v||v.length!==dim) continue;
      for(var j=0;j<dim;j++) acc[j]+=asNum(v[j]);
      n++;
    }
    if(!n) return null;
    for(var k=0;k<dim;k++) acc[k]/=n;
    return acc;
  }

  function dist(a, b){
    if(!a||!b||a.length!==b.length) return Infinity;
    var s=0;
    for(var i=0;i<a.length;i++){
      var d=asNum(a[i])-asNum(b[i]);
      s+=d*d;
    }
    return Math.sqrt(s);
  }

  function varianceToCentroid(vectors, centroid){
    if(!vectors||!vectors.length||!centroid) return 0;
    var s=0,n=0;
    for(var i=0;i<vectors.length;i++){
      var d=dist(vectors[i],centroid);
      if(!isFinite(d)) continue;
      s+=d*d;
      n++;
    }
    return n?s/n:0;
  }

  function groupSamples(samples){
    var groups={left:[],center:[],right:[]};
    (samples||[]).forEach(function(s){
      var alias=String(s&&s.alias||'');
      if(!groups[alias]) return;
      var v=s.feats||s.vector;
      if(v&&v.length) groups[alias].push(v);
    });
    return groups;
  }

  /**
   * Conservative quality:
   * - good: clear separation, low intra variance
   * - ok: usable but prefer Ctrl
   * - poor: overlapping / weak signal
   */
  function evaluateSeparability(samples, opts){
    opts=opts&&typeof opts==='object'?opts:{};
    var groups=groupSamples(samples);
    var aliases=['left','center','right'].filter(function(a){
      return groups[a]&&groups[a].length>=(opts.minSamplesPerClass||8);
    });
    if(aliases.length<2){
      return {
        quality:'poor',
        centroids:null,
        thresholds:{minInter:0,maxIntra:0,ratio:0},
        reason:'insufficient_samples'
      };
    }
    var centroids={};
    var intras={};
    aliases.forEach(function(a){
      centroids[a]=meanVector(groups[a]);
      intras[a]=varianceToCentroid(groups[a],centroids[a]);
    });
    var minInter=Infinity;
    for(var i=0;i<aliases.length;i++){
      for(var j=i+1;j<aliases.length;j++){
        var d=dist(centroids[aliases[i]],centroids[aliases[j]]);
        if(d<minInter) minInter=d;
      }
    }
    var maxIntra=0;
    aliases.forEach(function(a){
      if(intras[a]>maxIntra) maxIntra=intras[a];
    });
    var intraRms=Math.sqrt(Math.max(0,maxIntra));
    var ratio=intraRms>1e-6?minInter/intraRms:minInter>0?99:0;
    var confMean=0,confN=0;
    (samples||[]).forEach(function(s){
      if(s&&isFinite(s.confidence)){
        confMean+=Number(s.confidence);
        confN++;
      }
    });
    if(confN) confMean/=confN;

    var thresholds={
      minInter:Number(minInter.toFixed(4)),
      maxIntra:Number(maxIntra.toFixed(4)),
      ratio:Number(ratio.toFixed(4)),
      confMean:Number(confMean.toFixed(4))
    };

    // Conservative gates — prefer under-claiming "good".
    var quality='poor';
    var reason='weak_separation';
    if(minInter>=0.12&&ratio>=2.2&&confMean>=0.55){
      quality='ok';
      reason='usable';
    }
    if(minInter>=0.22&&ratio>=3.5&&confMean>=0.62&&aliases.length>=3){
      quality='good';
      reason='clear_separation';
    }
    if(confMean<0.45){
      quality='poor';
      reason='low_confidence';
    }

    return {quality:quality,centroids:centroids,thresholds:thresholds,reason:reason};
  }

  function applyFingerprint(assessment, fingerprint){
    var a=assessment&&typeof assessment==='object'?Object.assign({},assessment):emptyAssessment();
    var fp=fingerprint!=null?String(fingerprint):'';
    if(a.status==='ready'||a.status==='stale'){
      if(a.topologyFingerprint&&fp&&a.topologyFingerprint!==fp){
        a.status='stale';
        a.reason='topology_changed';
      }
    }
    return a;
  }

  function isStale(assessment, fingerprint){
    var a=applyFingerprint(assessment, fingerprint);
    return a.status==='stale';
  }

  function finalizeAssessment(samples, fingerprint){
    var scored=evaluateSeparability(samples);
    return {
      status:'ready',
      quality:scored.quality,
      samples:Array.isArray(samples)?samples.slice():[],
      centroids:scored.centroids,
      thresholds:scored.thresholds,
      topologyFingerprint:fingerprint!=null?String(fingerprint):null,
      reason:scored.reason
    };
  }

  function createSession(opts){
    opts=opts&&typeof opts==='object'?opts:{};
    var steps=(opts.steps&&opts.steps.length)?opts.steps.slice():STEPS.slice();
    // 1-screen: only center; 2-screen: left+right; 3: all
    if(opts.screenCount===1) steps=['center'];
    else if(opts.screenCount===2) steps=['left','right'];
    return {
      steps:steps,
      stepIndex:0,
      samples:[],
      stepStartedAt:0,
      stepConfirmPending:true,
      running:false,
      fingerprint:opts.fingerprint!=null?String(opts.fingerprint):null,
      sampleMs:Math.max(SAMPLE_MS_MIN,Math.min(SAMPLE_MS_MAX,opts.sampleMs||1800))
    };
  }

  function currentStep(session){
    if(!session||!session.steps) return null;
    return session.steps[session.stepIndex]||null;
  }

  function beginStep(session, now){
    if(!session) return null;
    session.stepConfirmPending=false;
    session.running=true;
    session.stepStartedAt=now!=null?now:Date.now();
    return currentStep(session);
  }

  function ingestPoint(session, point, now){
    if(!session||!session.running||session.stepConfirmPending) return {ok:false,reason:'not_sampling'};
    now=now!=null?now:Date.now();
    var alias=currentStep(session);
    if(!alias) return {ok:false,reason:'done'};
    if(!point||point.blinking||point.state==='lost'||!point.faceDetected){
      return {ok:false,reason:'bad_point',alias:alias};
    }
    var conf=asNum(point.confidence);
    if(conf<0.35) return {ok:false,reason:'low_conf',alias:alias};
    var vec=featureVector(point);
    if(!vec) return {ok:false,reason:'no_feats',alias:alias};
    session.samples.push({
      alias:alias,
      feats:vec,
      confidence:conf,
      yaw:asNum(point.yaw),
      pitch:asNum(point.pitch),
      t:now
    });
    var elapsed=now-session.stepStartedAt;
    var progress=Math.max(0,Math.min(1,elapsed/session.sampleMs));
    if(elapsed>=session.sampleMs){
      session.stepIndex++;
      session.running=false;
      session.stepConfirmPending=session.stepIndex<session.steps.length;
      session.stepStartedAt=0;
      var done=session.stepIndex>=session.steps.length;
      return {
        ok:true,
        alias:alias,
        progress:1,
        stepComplete:true,
        done:done,
        assessment:done?finalizeAssessment(session.samples,session.fingerprint):null
      };
    }
    return {ok:true,alias:alias,progress:progress,stepComplete:false,done:false};
  }

  global.OneToneCameraGazeMonitorAssessment={
    SAMPLE_MS_MIN:SAMPLE_MS_MIN,
    SAMPLE_MS_MAX:SAMPLE_MS_MAX,
    STEPS:STEPS.slice(),
    emptyAssessment:emptyAssessment,
    featureVector:featureVector,
    meanVector:meanVector,
    dist:dist,
    evaluateSeparability:evaluateSeparability,
    applyFingerprint:applyFingerprint,
    isStale:isStale,
    finalizeAssessment:finalizeAssessment,
    createSession:createSession,
    currentStep:currentStep,
    beginStep:beginStep,
    ingestPoint:ingestPoint
  };
})(typeof window!=='undefined'?window:typeof global!=='undefined'?global:this);
