/**
 * Local MediaPipe Gesture Recognizer → hand gestures.
 * Runtime loads only vendor/mediapipe (no CDN).
 *
 * Kinds: openPalm (Open_Palm), fist (Closed_Fist), ok (landmark heuristic),
 *        wave (Open_Palm + wrist oscillation).
 *
 * Formal: recognizeForVideo runs only in a Worker (timeout → terminate + rebuild).
 * UI-thread budget/skip is not a hang fix — WASM cannot be interrupted once stuck.
 */
(function(global){
  'use strict';

  var VENDOR_BASE='vendor/mediapipe';
  var WORKER_SCRIPT='js/features/camera/camera-hand-gesture-worker.js';
  var DETECT_INTERVAL_MS=50;
  var DETECT_TIMEOUT_MS=2500;
  var BITMAP_MAX_W=480;
  var detectIntervalMs=DETECT_INTERVAL_MS;
  var SCORE_MIN=0.55;
  var HOLD_MS=280;
  var OK_HOLD_MS=420;
  var WAVE_HOLD_MS=100;
  var WAVE_WINDOW_MS=1200;
  var WAVE_MIN_SWINGS=2;
  var WAVE_AMP=0.022;
  var WAVE_GRACE_MS=320;
  var WAVE_LATCH_MS=800;

  var readyPromise=null;
  var running=false;
  var videoEl=null;
  var detectRaf=0;
  var lastDetectWall=0;
  var lastTs=-1;
  var modelFailed=false;
  var lastError='';

  var lastGesture={kind:'none',score:0,at:0,label:''};
  var stableKind='none';
  var stableSince=0;
  var emittedKind='none';
  var emittedAt=0;

  var wristHist=[];
  var lastHandLandmarks=null;
  var lastPalmishAt=0;
  var waveLostSince=0;
  var waveLatchUntil=0;

  var worker=null;
  var workerReady=false;
  var workerGen=0;
  var detectInFlight=false;
  var bitmapInFlight=false;
  var pendingBitmap=null;
  var pendingTs=0;
  var detectReqId=0;
  var detectTimeoutId=0;
  var workerFailed=false;
  var inferPaused=false;

  function setActivityTag(tag){
    try{
      if(global.OneToneUiHeartbeat&&global.OneToneUiHeartbeat.setTag) global.OneToneUiHeartbeat.setTag(tag);
      else global.__otActivityTag=tag;
    }catch(_){}
  }

  function clamp01(v){
    v=Number(v);
    if(!isFinite(v)) return 0;
    if(v<0) return 0;
    if(v>1) return 1;
    return v;
  }

  function resolveVendorUrl(rel){
    try{
      return new URL(VENDOR_BASE+'/'+rel,global.location.href).href;
    }catch(_){
      return VENDOR_BASE+'/'+rel;
    }
  }

  function resolveWorkerUrl(){
    try{ return new URL(WORKER_SCRIPT,global.location.href).href; }
    catch(_){ return WORKER_SCRIPT; }
  }

  function nowMs(){
    return (typeof performance!=='undefined'&&performance.now)?performance.now():Date.now();
  }

  function lm(hand,i){
    if(!hand||i<0||i>=hand.length) return null;
    var p=hand[i];
    if(!p||p.x==null||p.y==null) return null;
    return p;
  }

  function dist(a,b){
    if(!a||!b) return 1;
    var dx=a.x-b.x, dy=a.y-b.y;
    return Math.sqrt(dx*dx+dy*dy);
  }

  /** MediaPipe hand: 4=thumb tip, 8=index tip, 12/16/20 = other tips, 5/9/13/17 = MCP. */
  function detectOkFromLandmarks(hand){
    if(!hand||hand.length<21) return {ok:false,score:0};
    var thumb=lm(hand,4);
    var index=lm(hand,8);
    var mid=lm(hand,12);
    var ring=lm(hand,16);
    var pinky=lm(hand,20);
    var wrist=lm(hand,0);
    var indexMcp=lm(hand,5);
    var midMcp=lm(hand,9);
    if(!thumb||!index||!mid||!ring||!pinky||!wrist||!indexMcp||!midMcp){
      return {ok:false,score:0};
    }
    var handScale=Math.max(0.04,dist(wrist,midMcp));
    var tipGap=dist(thumb,index)/handScale;
    // Ring must be tight — loose gap matches open palm / camera foreshortening.
    if(tipGap>0.28) return {ok:false,score:0};
    function extended(tip,mcp){
      return dist(wrist,tip)>dist(wrist,mcp)*1.28;
    }
    function curled(tip,mcp){
      return dist(wrist,tip)<dist(wrist,mcp)*0.98;
    }
    // Real OK: index curled into the ring; middle/ring/pinky clearly up.
    if(!curled(index,indexMcp)) return {ok:false,score:0};
    if(extended(index,indexMcp)) return {ok:false,score:0};
    if(!extended(mid,midMcp)) return {ok:false,score:0};
    if(!extended(ring,lm(hand,13))) return {ok:false,score:0};
    if(!extended(pinky,lm(hand,17))) return {ok:false,score:0};
    var score=clamp01(1.35-tipGap*2.2);
    return {ok:score>=0.72,score:score};
  }

  function mapOfficialGesture(name,score){
    name=String(name||'');
    score=Number(score)||0;
    if(score<SCORE_MIN) return null;
    if(name==='Open_Palm') return {kind:'openPalm',score:score,label:name};
    if(name==='Closed_Fist') return {kind:'fist',score:score,label:name};
    return null;
  }

  function updateWave(wristX,now,allowWave){
    if(!allowWave||wristX==null||!isFinite(wristX)){
      if(!waveLostSince) waveLostSince=now;
      if((now-waveLostSince)>WAVE_GRACE_MS){
        wristHist=[];
        waveLostSince=0;
      }
      return false;
    }
    waveLostSince=0;
    wristHist.push({t:now,x:wristX});
    while(wristHist.length&&(now-wristHist[0].t)>WAVE_WINDOW_MS){
      wristHist.shift();
    }
    if(wristHist.length<4) return false;
    var swings=0;
    var dir=0;
    var i;
    for(i=1;i<wristHist.length;i++){
      var dx=wristHist[i].x-wristHist[i-1].x;
      if(Math.abs(dx)<WAVE_AMP*0.28) continue;
      var d=dx>0?1:-1;
      if(dir&&d!==dir) swings++;
      dir=d;
    }
    return swings>=WAVE_MIN_SWINGS;
  }

  function pickGesture(result,now){
    var gestures=result&&result.gestures;
    var hands=result&&result.landmarks;
    var hand=hands&&hands[0]?hands[0]:null;
    lastHandLandmarks=hand;

    var best=null;
    var topName='';
    var topScore=0;
    if(gestures&&gestures.length){
      var cats=gestures[0];
      if(cats&&cats.length){
        var c=cats[0];
        topName=String(c.categoryName||'');
        topScore=Number(c.score)||0;
        best=mapOfficialGesture(topName,topScore);
      }
    }

    // OK is landmark-only; never override official palm/fist, and skip when model
    // already names another gesture (Thumb_Up / Victory / …).
    var ok=detectOkFromLandmarks(hand);
    var modelBusy=!!topName&&topName!=='None'&&topScore>=0.40;
    if(ok.ok&&!best&&!modelBusy){
      best={kind:'ok',score:ok.score,label:'OK'};
    }

    var wrist=hand?lm(hand,0):null;
    var palmish=!!(best&&best.kind==='openPalm')||(topName==='Open_Palm'&&topScore>=0.35);
    if(palmish) lastPalmishAt=now;
    else if((now-lastPalmishAt)<WAVE_GRACE_MS) palmish=true;
    var waving=updateWave(wrist?wrist.x:null,now,palmish);
    if(waving){
      waveLatchUntil=now+WAVE_LATCH_MS;
      best={kind:'wave',score:Math.max(best&&best.score?best.score:0,0.75),label:'Wave'};
    }else if(now<waveLatchUntil){
      // Keep wave briefly so openPalm flicker does not steal the gesture.
      best={kind:'wave',score:0.72,label:'Wave'};
    }

    return best;
  }

  function stabilize(candidate,now){
    var kind=candidate?candidate.kind:'none';
    var score=candidate?candidate.score:0;
    if(kind!==stableKind){
      // openPalm → wave is an upgrade: keep hold progress so wave can emit.
      var upgrade=(stableKind==='openPalm'&&kind==='wave');
      var demoteKeep=(stableKind==='wave'&&kind==='openPalm'&&now<waveLatchUntil);
      if(demoteKeep){
        kind='wave';
        score=Math.max(score,0.72);
      }else if(!upgrade){
        stableSince=now;
      }
      stableKind=kind;
    }
    if(kind==='none'){
      lastGesture={kind:'none',score:0,at:now,label:''};
      emittedKind='none';
      return lastGesture;
    }
    var needHold=kind==='ok'?OK_HOLD_MS:(kind==='wave'?WAVE_HOLD_MS:HOLD_MS);
    if((now-stableSince)<needHold){
      return lastGesture;
    }
    // Edge emit: refresh `at` only when kind changes (presence is edge-triggered).
    if(kind!==emittedKind){
      emittedKind=kind;
      emittedAt=now;
      lastGesture={kind:kind,score:score,at:now,label:candidate.label||kind};
      return lastGesture;
    }
    // Same kind held: keep lastGesture but do not refresh `at` (avoids continuous re-fire).
    if(lastGesture.kind!==kind){
      lastGesture={kind:kind,score:score,at:emittedAt||now,label:candidate.label||kind};
    }else{
      lastGesture.score=score;
    }
    return lastGesture;
  }

  function clearDetectTimeout(){
    if(detectTimeoutId){ clearTimeout(detectTimeoutId); detectTimeoutId=0; }
  }

  function dropPendingBitmap(){
    if(pendingBitmap&&pendingBitmap.close){ try{ pendingBitmap.close(); }catch(_){} }
    pendingBitmap=null; pendingTs=0;
  }

  function terminateWorker(reason){
    clearDetectTimeout();
    detectInFlight=false;
    bitmapInFlight=false;
    dropPendingBitmap();
    workerReady=false;
    if(worker){ try{ worker.terminate(); }catch(_){} worker=null; }
    workerGen++;
    setActivityTag('');
    try{ console.warn('[onetone] hand-gesture worker terminated:',reason||''); }catch(_){}
  }

  function armDetectTimeout(id,gen){
    clearDetectTimeout();
    detectTimeoutId=setTimeout(function(){
      detectTimeoutId=0;
      if(gen!==workerGen) return;
      terminateWorker('detect timeout id='+id);
      workerFailed=false;
      ensureReady().then(function(){ if(running) startLoop(); }).catch(function(){ workerFailed=true; });
    },DETECT_TIMEOUT_MS);
  }

  function handleWorkerResult(msg){
    clearDetectTimeout();
    detectInFlight=false;
    setActivityTag('');
    if(!running){ dropPendingBitmap(); return; }
    var now=nowMs();
    var candidate=pickGesture({
      gestures:msg.gestures||[],
      landmarks:msg.landmarks||[]
    },now);
    stabilize(candidate,now);
    if(pendingBitmap){
      var bm=pendingBitmap, ts=pendingTs;
      pendingBitmap=null; pendingTs=0;
      postDetect(bm,ts);
    }
  }

  function postDetect(bitmap,ts){
    if(!worker||!workerReady||!running){
      if(bitmap&&bitmap.close) try{ bitmap.close(); }catch(_){}
      return;
    }
    detectInFlight=true;
    detectReqId++;
    var id=detectReqId, gen=workerGen;
    setActivityTag('cameraHandDetect');
    armDetectTimeout(id,gen);
    try{ worker.postMessage({type:'detect',bitmap:bitmap,ts:ts,id:id},[bitmap]); }
    catch(err){
      detectInFlight=false; clearDetectTimeout(); setActivityTag('');
      if(bitmap&&bitmap.close) try{ bitmap.close(); }catch(_){}
      terminateWorker('postMessage failed'); workerFailed=true;
    }
  }

  function bitmapOpts(video){
    var vw=video&&video.videoWidth|0;
    var vh=video&&video.videoHeight|0;
    if(!vw||!vh||vw<=BITMAP_MAX_W) return undefined;
    return {
      resizeWidth:BITMAP_MAX_W,
      resizeHeight:Math.max(1,Math.round(BITMAP_MAX_W*vh/vw))
    };
  }

  function ensureReady(){
    if(worker&&workerReady) return Promise.resolve(true);
    if(readyPromise) return readyPromise;
    if(typeof Worker==='undefined'){
      workerFailed=true;
      modelFailed=true;
      lastError='Worker unavailable — continuous GestureRecognizer blocked on UI thread';
      return Promise.reject(new Error(lastError));
    }
    modelFailed=false;
    lastError='';
    readyPromise=new Promise(function(resolve,reject){
      terminateWorker('reinit');
      workerFailed=false;
      var gen=workerGen;
      var w;
      try{ w=new Worker(resolveWorkerUrl()); }
      catch(err){
        readyPromise=null; workerFailed=true; modelFailed=true;
        lastError=err&&err.message?err.message:String(err||'unknown');
        reject(new Error('hand-gesture Worker create failed: '+lastError));
        return;
      }
      worker=w;
      w.onmessage=function(ev){
        if(gen!==workerGen) return;
        var msg=ev.data||{};
        if(msg.type==='ready'){ workerReady=true; readyPromise=null; resolve(true); return; }
        if(msg.type==='result'){ handleWorkerResult(msg); return; }
        if(msg.type==='error'){
          if(!workerReady){
            readyPromise=null; workerFailed=true; modelFailed=true;
            lastError=msg.message||'unknown';
            terminateWorker('init error');
            reject(new Error('hand-gesture worker init: '+lastError));
          }else{
            detectInFlight=false; clearDetectTimeout(); setActivityTag('');
            if(pendingBitmap){ var bm=pendingBitmap,ts=pendingTs; pendingBitmap=null; pendingTs=0; postDetect(bm,ts); }
          }
        }
      };
      w.onerror=function(err){
        if(gen!==workerGen) return;
        readyPromise=null; workerFailed=true; modelFailed=true;
        lastError=err&&err.message?err.message:'onerror';
        terminateWorker('worker onerror');
        reject(new Error('hand-gesture worker: '+lastError));
      };
      w.postMessage({
        type:'init',
        bundleUrl:resolveVendorUrl('vision_bundle.mjs'),
        wasmUrl:resolveVendorUrl('wasm'),
        modelUrl:resolveVendorUrl('gesture_recognizer.task')
      });
    });
    return readyPromise;
  }

  function detectOnce(){
    if(!running||!videoEl) return;
    if(typeof document!=='undefined'&&document.hidden) return;
    if(videoEl.readyState<2) return;
    // Formal: never call recognizeForVideo on UI main thread.
    if(workerFailed||!workerReady) return;
    // Same WebView2 wedge as gaze: do not stack createImageBitmap.
    if(bitmapInFlight||detectInFlight) return;
    if(typeof createImageBitmap!=='function'){ workerFailed=true; return; }
    var now=nowMs();
    if(now<=lastTs) now=lastTs+1;
    lastTs=now;
    var opts=bitmapOpts(videoEl);
    bitmapInFlight=true;
    setActivityTag('cameraHandBitmap');
    var tBitmap=nowMs();
    var p=opts?createImageBitmap(videoEl,opts):createImageBitmap(videoEl);
    p.then(function(bitmap){
      bitmapInFlight=false;
      var took=nowMs()-tBitmap;
      // Slow bitmap decode → back off so the next rAF does not immediately re-enter (同 gaze).
      if(took>80) lastDetectWall=nowMs()+Math.min(took*2,600);
      // Same as gaze: drop bitmaps after pauseInfer so settings 切换 cannot wedge WebView2.
      if(!running||inferPaused){
        if(bitmap.close) try{ bitmap.close(); }catch(_){}
        setActivityTag('');
        return;
      }
      if(detectInFlight){
        dropPendingBitmap();
        pendingBitmap=bitmap; pendingTs=now;
        setActivityTag('cameraHandDetect');
        return;
      }
      postDetect(bitmap,now);
    }).catch(function(){
      bitmapInFlight=false;
      setActivityTag('');
    });
  }

  function loop(){
    detectRaf=0;
    if(!running||inferPaused) return;
    if(typeof document!=='undefined'&&document.hidden){
      detectRaf=requestAnimationFrame(loop);
      return;
    }
    var now=nowMs();
    var gap=Math.max(16,Number(detectIntervalMs)||DETECT_INTERVAL_MS);
    if((now-lastDetectWall)>=gap){
      lastDetectWall=now;
      detectOnce();
    }
    detectRaf=requestAnimationFrame(loop);
  }

  function startLoop(){
    if(detectRaf||inferPaused) return;
    detectRaf=requestAnimationFrame(loop);
  }

  function stopLoop(){
    if(detectRaf){
      try{ cancelAnimationFrame(detectRaf); }catch(_){}
    }
    detectRaf=0;
  }

  function pauseInfer(){
    inferPaused=true;
    stopLoop();
    clearDetectTimeout();
    detectInFlight=false;
    bitmapInFlight=false;
    dropPendingBitmap();
    setActivityTag('');
  }

  function resumeInfer(){
    if(!inferPaused) return;
    inferPaused=false;
    if(running&&workerReady) startLoop();
  }

  function attach(video){
    videoEl=video||null;
    return !!videoEl;
  }

  function detach(){
    stop();
    videoEl=null;
  }

  function start(){
    if(running&&detectRaf&&workerReady&&!inferPaused) return ensureReady();
    if(!videoEl) return Promise.resolve(false);
    running=true;
    return ensureReady().then(function(){
      if(!running) return false;
      if(!inferPaused) startLoop();
      return true;
    }).catch(function(){
      running=false;
      return false;
    });
  }

  function stop(){
    running=false;
    inferPaused=false;
    stopLoop();
    clearDetectTimeout();
    dropPendingBitmap();
    detectInFlight=false;
    bitmapInFlight=false;
    setActivityTag('');
    wristHist=[];
    waveLostSince=0;
    lastPalmishAt=0;
    waveLatchUntil=0;
    stableKind='none';
    emittedKind='none';
    lastGesture={kind:'none',score:0,at:0,label:''};
  }

  function getLastGesture(){
    return {
      kind:lastGesture.kind||'none',
      score:Number(lastGesture.score)||0,
      at:lastGesture.at||0,
      label:lastGesture.label||''
    };
  }

  function getRuntimeStatus(){
    return {
      running:!!running&&!inferPaused,
      ready:!!(worker&&workerReady),
      modelFailed:!!modelFailed,
      error:lastError||'',
      gesture:getLastGesture(),
      hasVideo:!!(videoEl&&videoEl.srcObject)
    };
  }

  /** Test helpers (pure). */
  function mapCategoryForTest(name,score){
    return mapOfficialGesture(name,score);
  }
  function detectOkForTest(hand){
    return detectOkFromLandmarks(hand);
  }

  function setDetectIntervalMs(ms){
    ms=Number(ms);
    if(!(ms>0)) ms=DETECT_INTERVAL_MS;
    detectIntervalMs=Math.max(16,Math.min(1000,ms|0));
  }

  function getDetectIntervalMs(){
    return detectIntervalMs;
  }

  global.OneToneCameraHandGesture={
    init:function(){},
    attach:attach,
    detach:detach,
    start:start,
    stop:stop,
    pauseInfer:pauseInfer,
    resumeInfer:resumeInfer,
    setDetectIntervalMs:setDetectIntervalMs,
    getDetectIntervalMs:getDetectIntervalMs,
    ensureReady:ensureReady,
    getLastGesture:getLastGesture,
    getRuntimeStatus:getRuntimeStatus,
    mapCategoryForTest:mapCategoryForTest,
    detectOkForTest:detectOkForTest
  };
})((typeof window!=='undefined')?window:globalThis);
