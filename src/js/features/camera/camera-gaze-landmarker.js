(function(global){
  'use strict';

  /**
   * Local MediaPipe Face Landmarker → uncalibrated gaze proxy.
   * Not screen gaze. Runtime loads only vendor/mediapipe (no CDN).
   */

  var DETECT_INTERVAL_MS=33;
  var detectIntervalMs=DETECT_INTERVAL_MS;
  var DETECT_TIMEOUT_MS=2500;
  var VENDOR_BASE='vendor/mediapipe';
  var LOW_CONF=0.35;
  var WORKER_SCRIPT='js/features/camera/camera-gaze-landmarker-worker.js';

  var landmarker=null; // unused on UI thread when worker path is active
  var readyPromise=null;
  var running=false;
  var detectRaf=0;
  var lastDetectWall=0;
  var videoEl=null;
  var onPoint=null;
  var lastTs=-1;
  var lastGood={x:0.5,y:0.5,confidence:0,state:'idle',feats:null};
  // Video-norm proxy held across blinks — eyelid motion corrupts iris/socket XY.
  var lastProxyVideo={
    x:0.5,y:0.5,
    sockX:0,sockY:0,
    irisX:0.5,irisY:0.5,
    blendX:0,blendY:0,
    feats:null
  };
  var BLINK_HOLD=0.32;
  var BLINK_RELEASE_MS=140;
  var blinkHoldUntil=0;
  var lastLandmarks=null;
  var lastLandmarksAt=0;

  // Worker isolation — UI thread must never call detectForVideo (cannot interrupt WASM).
  var worker=null;
  var workerReady=false;
  var workerGen=0;
  var detectInFlight=false;
  var pendingBitmap=null;
  var pendingTs=0;
  var detectReqId=0;
  var detectTimeoutId=0;
  var workerFailed=false;
  var queueDepth=0; // 0 or 1 (pending) + in-flight tracked separately

  function experimentalPresenceAllowed(){
    try{
      if(global.localStorage&&global.localStorage.getItem('ot_presence_experimental')==='1') return true;
    }catch(_){}
    try{
      var cp=global.OneToneState&&global.OneToneState.state&&global.OneToneState.state.config&&global.OneToneState.state.config.cameraPrefs;
      if(cp&&cp.presenceExperimental===true) return true;
    }catch(_){}
    return false;
  }

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

  function safeRatio(v,a,b){
    var d=b-a;
    if(!isFinite(d)||Math.abs(d)<1e-5) return 0.5;
    return clamp01((v-a)/d);
  }

  function lm(landmarks,i){
    if(!landmarks||i<0||i>=landmarks.length) return null;
    var p=landmarks[i];
    if(!p||p.x==null||p.y==null) return null;
    return p;
  }

  function buildBlendMap(faceBlendshapes){
    var map={};
    if(!faceBlendshapes||!faceBlendshapes.length) return map;
    var cats=faceBlendshapes[0]&&faceBlendshapes[0].categories;
    if(!cats||!cats.length) return map;
    for(var i=0;i<cats.length;i++){
      var c=cats[i];
      if(!c||!c.categoryName) continue;
      map[c.categoryName]=Number(c.score)||0;
    }
    return map;
  }

  function avgBlend(map,names){
    var sum=0,n=0;
    for(var i=0;i<names.length;i++){
      var k=names[i];
      if(map[k]==null||!isFinite(map[k])) continue;
      sum+=map[k];
      n++;
    }
    return n?sum/n:null;
  }

  /** object-fit:contain content rect inside overlay (css px). */
  function getContainRect(video,ow,oh){
    var vw=video&&video.videoWidth||0;
    var vh=video&&video.videoHeight||0;
    if(!vw||!vh||!ow||!oh){
      return {x:0,y:0,w:ow||0,h:oh||0};
    }
    var scale=Math.min(ow/vw,oh/vh);
    var w=vw*scale;
    var h=vh*scale;
    return {x:(ow-w)/2,y:(oh-h)/2,w:w,h:h};
  }

  /** Map video-normalized (0..1) → overlay-normalized (0..1), letterbox-aware. */
  function mapVideoNormToOverlay(nx,ny,video,overlayEl){
    if(!overlayEl) return {x:clamp01(nx),y:clamp01(ny)};
    var ow=overlayEl.clientWidth||0;
    var oh=overlayEl.clientHeight||0;
    if(!ow||!oh) return {x:clamp01(nx),y:clamp01(ny)};
    var rect=getContainRect(video,ow,oh);
    if(!rect.w||!rect.h) return {x:clamp01(nx),y:clamp01(ny)};
    var px=rect.x+clamp01(nx)*rect.w;
    var py=rect.y+clamp01(ny)*rect.h;
    return {x:clamp01(px/ow),y:clamp01(py/oh)};
  }

  function clampRange(v,lo,hi){
    v=Number(v);
    if(!isFinite(v)) return lo;
    if(v<lo) return lo;
    if(v>hi) return hi;
    return v;
  }

  /**
   * Landmark yaw proxy (nose vs cheeks). Works even when facial matrix is weak/zero.
   * Positive ≈ face turns toward image-right (camera view).
   */
  function yawFromLandmarks(landmarks){
    var nose=lm(landmarks,1);
    var leftCheek=lm(landmarks,234);
    var rightCheek=lm(landmarks,454);
    if(!nose||!leftCheek||!rightCheek) return null;
    var mid=(leftCheek.x+rightCheek.x)*0.5;
    var half=Math.abs(rightCheek.x-leftCheek.x)*0.5;
    if(half<1e-4) return null;
    return clampRange((nose.x-mid)/half,-1.2,1.2);
  }

  /** Normalized face box area in video space (0–1), for distance / Visualizer. */
  function faceAreaFromLandmarks(landmarks){
    if(!landmarks||!landmarks.length) return 0;
    var minX=1,minY=1,maxX=0,maxY=0;
    // Stride sample — full 478-pt scan every detect frame is unnecessary for a coarse area.
    var step=landmarks.length>80?4:1;
    for(var i=0;i<landmarks.length;i+=step){
      var p=landmarks[i];
      if(!p) continue;
      var x=Number(p.x); var y=Number(p.y);
      if(!isFinite(x)||!isFinite(y)) continue;
      if(x<minX) minX=x;
      if(y<minY) minY=y;
      if(x>maxX) maxX=x;
      if(y>maxY) maxY=y;
    }
    var w=Math.max(0,maxX-minX);
    var h=Math.max(0,maxY-minY);
    return w*h;
  }

  function headPoseFromMatrix(mat){
    if(!mat||mat.length<16) return {yaw:0,pitch:0};
    var r00=mat[0],r10=mat[1],r20=mat[2];
    var r21=mat[6],r22=mat[10];
    var yaw=Math.atan2(-r20,Math.sqrt(Math.max(1e-8,r00*r00+r10*r10)));
    var pitch=Math.atan2(r21,r22);
    return {
      yaw:clampRange(yaw/0.7,-1.2,1.2),
      pitch:clampRange(pitch/0.55,-1.2,1.2)
    };
  }

  /**
   * Uncalibrated gaze proxy + calibration feature vector.
   * feats correlate with screen look better than face position alone.
   */
  function estimateGazeProxy(landmarks,blendMap,transformMat){
    if(!landmarks||!landmarks.length){
      return {x:lastGood.x,y:lastGood.y,confidence:0.08,state:'lost',feats:null};
    }

    var hasIris=landmarks.length>473;
    var vx=0.5,vy=0.5,conf=0.45,usedIris=false;
    var sockX=0,sockY=0,irisX=0.5,irisY=0.5;

    if(hasIris){
      var li=lm(landmarks,468),ri=lm(landmarks,473);
      var lo=lm(landmarks,33),lin=lm(landmarks,133);
      var rin=lm(landmarks,362),ro=lm(landmarks,263);
      var lTop=lm(landmarks,159),lBot=lm(landmarks,145);
      var rTop=lm(landmarks,386),rBot=lm(landmarks,374);
      if(li&&ri&&lo&&lin&&rin&&ro){
        var lx=safeRatio(li.x,lo.x,lin.x);
        var rx=safeRatio(ri.x,rin.x,ro.x);
        var ly=(lTop&&lBot)?safeRatio(li.y,lTop.y,lBot.y):0.5;
        var ry=(rTop&&rBot)?safeRatio(ri.y,rTop.y,rBot.y):0.5;
        sockX=((lx+rx)/2)-0.5;
        sockY=((ly+ry)/2)-0.5;
        irisX=(li.x+ri.x)*0.5;
        irisY=(li.y+ri.y)*0.5;
        vx=clamp01(irisX+sockX*1.85);
        vy=clamp01(irisY+sockY*1.65);
        conf=0.78;
        usedIris=true;
      }
    }

    if(!usedIris){
      var oL=lm(landmarks,33),iL=lm(landmarks,133);
      var iR=lm(landmarks,362),oR=lm(landmarks,263);
      var tL=lm(landmarks,159),bL=lm(landmarks,145);
      var tR=lm(landmarks,386),bR=lm(landmarks,374);
      if(oL&&iL&&iR&&oR){
        irisX=((oL.x+iL.x)*0.5+(iR.x+oR.x)*0.5)*0.5;
        if(tL&&bL&&tR&&bR){
          irisY=((tL.y+bL.y)*0.5+(tR.y+bR.y)*0.5)*0.5;
        }else{
          irisY=((oL.y+iL.y)*0.5+(iR.y+oR.y)*0.5)*0.5;
        }
        vx=clamp01(irisX);
        vy=clamp01(irisY);
        conf=0.38;
      }else{
        var nose=lm(landmarks,1)||lm(landmarks,4)||landmarks[Math.floor(landmarks.length/2)];
        if(nose){
          vx=clamp01(nose.x);
          vy=clamp01(nose.y);
          irisX=vx;irisY=vy;
          conf=0.28;
        }else{
          return {x:lastGood.x,y:lastGood.y,confidence:0.1,state:'lost',feats:null};
        }
      }
    }

    var lookOut=avgBlend(blendMap,['eyeLookOutLeft','eyeLookOutRight']);
    var lookIn=avgBlend(blendMap,['eyeLookInLeft','eyeLookInRight']);
    var lookUp=avgBlend(blendMap,['eyeLookUpLeft','eyeLookUpRight']);
    var lookDown=avgBlend(blendMap,['eyeLookDownLeft','eyeLookDownRight']);
    var blendX=0,blendY=0;
    if(lookOut!=null||lookIn!=null){
      blendX=clampRange((lookOut||0)-(lookIn||0),-1.2,1.2);
    }
    if(lookDown!=null||lookUp!=null){
      blendY=clampRange((lookDown||0)-(lookUp||0),-1.2,1.2);
    }

    var blink=avgBlend(blendMap,['eyeBlinkLeft','eyeBlinkRight']);
    var nowBlink=performance.now();
    var blinking=blink!=null&&blink>=BLINK_HOLD;
    if(blinking) blinkHoldUntil=nowBlink+BLINK_RELEASE_MS;
    var holdGaze=blinking||nowBlink<blinkHoldUntil;
    // During blink (+short release), freeze full gaze proxy — eyelid motion
    // corrupts iris/socket XY and look blends (orb used to drift right / lower-right).
    if(holdGaze&&lastProxyVideo.feats){
      // Keep confidence high enough that the window orb does not fade to "lost".
      var holdConf=Math.max(0.42,conf*0.85);
      return {
        x:lastProxyVideo.x,
        y:lastProxyVideo.y,
        confidence:clamp01(holdConf),
        state:'tracking',
        blinking:true,
        feats:lastProxyVideo.feats.slice()
      };
    }
    if(lookOut!=null||lookIn!=null||lookDown!=null||lookUp!=null){
      var w=0.38;
      vx=clamp01(vx*(1-w)+(0.5+blendX*0.72)*w);
      vy=clamp01(vy*(1-w)+(0.5+blendY*0.72)*w);
      conf=Math.min(0.9,conf+0.06);
    }

    var pose=headPoseFromMatrix(transformMat);
    // Glasses + overhead cam: looking down often occludes iris behind rims.
    // Shift vertical trust from iris/socket to head pitch when looking down.
    var lookDownAmt=Math.max(0,blendY,pose.pitch);
    var eyeVertTrust=1;
    if(lookDownAmt>0.18) eyeVertTrust=clampRange(1-lookDownAmt*0.85,0.28,1);
    sockY*=eyeVertTrust;
    irisY=0.5+(irisY-0.5)*eyeVertTrust;
    vy=clamp01(vy*eyeVertTrust+(0.5+pose.pitch*0.55)*(1-eyeVertTrust));
    // Head-led features: pose dominates for corners / glasses; eyes are assist.
    var yawW=3.4,pitchW=3.8;
    if(Math.abs(pose.yaw)>0.35||Math.abs(pose.pitch)>0.28){
      yawW=3.9;pitchW=4.4;
    }
    var state='tracking';
    if(conf<LOW_CONF) state='low-confidence';
    if(eyeVertTrust<0.55) conf=clamp01(conf*0.82);
    var feats=[
      sockX*2.4,sockY*2.1,
      blendX*2.1,blendY*1.85,
      pose.yaw*yawW,pose.pitch*pitchW,
      (irisX-0.5)*2.4,(irisY-0.5)*2.0
    ];
    lastProxyVideo={
      x:vx,y:vy,
      sockX:sockX,sockY:sockY,
      irisX:irisX,irisY:irisY,
      blendX:blendX,blendY:blendY,
      feats:feats.slice()
    };
    return {
      x:vx,
      y:vy,
      confidence:clamp01(conf),
      state:state,
      blinking:false,
      feats:feats
    };
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

  function clearDetectTimeout(){
    if(detectTimeoutId){ clearTimeout(detectTimeoutId); detectTimeoutId=0; }
  }

  function dropPendingBitmap(){
    if(pendingBitmap&&pendingBitmap.close){ try{ pendingBitmap.close(); }catch(_){} }
    pendingBitmap=null; pendingTs=0; queueDepth=0;
  }

  function terminateWorker(reason){
    clearDetectTimeout();
    detectInFlight=false;
    dropPendingBitmap();
    workerReady=false;
    if(worker){ try{ worker.terminate(); }catch(_){} worker=null; }
    workerGen++;
    setActivityTag('');
    try{ console.warn('[onetone] landmarker worker terminated:',reason||''); }catch(_){}
  }

  function handleWorkerResult(msg){
    clearDetectTimeout();
    detectInFlight=false;
    setActivityTag('');
    if(!running){ dropPendingBitmap(); return; }
    var faces=msg.faces||[];
    var blendMap=buildBlendMap(msg.blendshapes);
    var mats=msg.matrices;
    var mat=mats&&mats[0]?mats[0]:null;
    if(mat&&mat.data) mat=mat.data;
    if(!faces.length){
      lastLandmarks=null;
      emitPoint({x:lastGood.x,y:lastGood.y,confidence:0.08,state:'lost',faceDetected:false,faceCount:0,faceArea:0,pitch:null,yaw:null,blink:null});
    }else{
      lastLandmarks=faces[0];
      lastLandmarksAt=performance.now();
      var pose=headPoseFromMatrix(mat);
      var lmYaw=yawFromLandmarks(faces[0]);
      var yawOut=pose.yaw;
      if(lmYaw!=null&&(mat==null||Math.abs(pose.yaw)<0.08||Math.abs(lmYaw)>Math.abs(pose.yaw))) yawOut=lmYaw;
      var blinkScore=avgBlend(blendMap,['eyeBlinkLeft','eyeBlinkRight']);
      var proxy=estimateGazeProxy(faces[0],blendMap,mat);
      var overlay=global.document&&global.document.getElementById('cameraGazeOverlay');
      var mapped=mapVideoNormToOverlay(proxy.x,proxy.y,videoEl,overlay);
      var faceArea=faceAreaFromLandmarks(faces[0]);
      var out={x:mapped.x,y:mapped.y,confidence:proxy.confidence,state:proxy.state,feats:proxy.feats||null,faceDetected:true,faceCount:faces.length,faceArea:faceArea,pitch:pose.pitch!=null?pose.pitch:null,yaw:yawOut,matrixYaw:pose.yaw,landmarkYaw:lmYaw,blink:blinkScore,blinking:!!proxy.blinking};
      if(!proxy.blinking&&(out.state==='tracking'||(out.state==='low-confidence'&&out.confidence>0.15))){
        lastGood={x:out.x,y:out.y,confidence:out.confidence,state:out.state,feats:out.feats};
      }
      emitPoint(out);
    }
    if(pendingBitmap){
      var bm=pendingBitmap, ts=pendingTs;
      pendingBitmap=null; pendingTs=0; queueDepth=0;
      postDetect(bm,ts);
    }
  }

  function armDetectTimeout(id,gen){
    clearDetectTimeout();
    detectTimeoutId=setTimeout(function(){
      detectTimeoutId=0;
      if(gen!==workerGen) return;
      terminateWorker('detect timeout id='+id);
      workerFailed=false;
      ensureReady().then(function(){ if(running) scheduleDetectLoop(); }).catch(function(){ workerFailed=true; });
    },DETECT_TIMEOUT_MS);
  }

  function postDetect(bitmap,ts){
    if(!worker||!workerReady||!running){
      if(bitmap&&bitmap.close) try{ bitmap.close(); }catch(_){}
      return;
    }
    detectInFlight=true;
    detectReqId++;
    var id=detectReqId, gen=workerGen;
    setActivityTag('cameraDetect');
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
    // 1080p createImageBitmap every frame can wedge WebView2; gaze works at 720w.
    var maxW=720;
    if(!vw||!vh||vw<=maxW) return undefined;
    return {
      resizeWidth:maxW,
      resizeHeight:Math.max(1,Math.round(maxW*vh/vw))
    };
  }

  function ensureReady(){
    if(worker&&workerReady) return Promise.resolve(true);
    if(readyPromise) return readyPromise;
    if(typeof Worker==='undefined'){
      workerFailed=true;
      return Promise.reject(new Error('Worker unavailable — continuous MediaPipe blocked on UI thread'));
    }
    readyPromise=new Promise(function(resolve,reject){
      terminateWorker('reinit');
      workerFailed=false;
      var gen=workerGen;
      var w;
      try{ w=new Worker(resolveWorkerUrl()); }
      catch(err){
        readyPromise=null; workerFailed=true;
        reject(new Error('Worker create failed: '+(err&&err.message||err)));
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
            readyPromise=null; workerFailed=true; terminateWorker('init error');
            reject(new Error('landmarker worker init: '+(msg.message||'unknown')));
          }else{
            detectInFlight=false; clearDetectTimeout(); setActivityTag('');
            emitPoint({x:lastGood.x,y:lastGood.y,confidence:0.05,state:'lost',faceDetected:false,faceCount:0,faceArea:0,pitch:null,yaw:null,blink:null,error:msg.message});
            if(pendingBitmap){ var bm=pendingBitmap,ts=pendingTs; pendingBitmap=null; pendingTs=0; postDetect(bm,ts); }
          }
        }
      };
      w.onerror=function(err){
        if(gen!==workerGen) return;
        readyPromise=null; workerFailed=true; terminateWorker('worker onerror');
        reject(new Error('landmarker worker: '+(err&&err.message||'onerror')));
      };
      w.postMessage({type:'init',bundleUrl:resolveVendorUrl('vision_bundle.mjs'),wasmUrl:resolveVendorUrl('wasm'),modelUrl:resolveVendorUrl('face_landmarker.task')});
    });
    return readyPromise;
  }

  function emitPoint(point){
    if(typeof onPoint==='function'){ try{ onPoint(point); }catch(_){} }
  }

  function detectOnce(){
    if(!running||!videoEl) return;
    if(videoEl.readyState<2) return;
    // Formal: never call detectForVideo on UI main thread.
    if(workerFailed||!workerReady) return;
    var now=performance.now();
    if(now<=lastTs) now=lastTs+1;
    lastTs=now;
    if(typeof createImageBitmap!=='function'){ workerFailed=true; return; }
    var opts=bitmapOpts(videoEl);
    var p=opts?createImageBitmap(videoEl,opts):createImageBitmap(videoEl);
    p.then(function(bitmap){
      if(!running){ if(bitmap.close) try{ bitmap.close(); }catch(_){} return; }
      if(detectInFlight){
        dropPendingBitmap();
        pendingBitmap=bitmap; pendingTs=now; queueDepth=1;
        return;
      }
      postDetect(bitmap,now);
    }).catch(function(){});
  }

  function clearDetectLoop(){
    if(detectRaf){ cancelAnimationFrame(detectRaf); detectRaf=0; }
    lastDetectWall=0;
  }

  function scheduleDetectLoop(){
    clearDetectLoop();
    detectRaf=requestAnimationFrame(detectLoop);
  }

  function detectLoop(wallNow){
    detectRaf=0;
    if(!running) return;
    if(typeof document!=='undefined'&&document.hidden){
      detectRaf=requestAnimationFrame(detectLoop);
      return;
    }
    if(!lastDetectWall||(wallNow-lastDetectWall)>=detectIntervalMs){
      lastDetectWall=wallNow;
      detectOnce();
    }
    detectRaf=requestAnimationFrame(detectLoop);
  }

  function start(video,callback){
    videoEl=video||null;
    onPoint=callback||null;
    if(running&&detectRaf&&workerReady) return ensureReady();
    running=true; lastTs=-1; lastDetectWall=0;
    return ensureReady().then(function(){
      if(!running) return;
      scheduleDetectLoop();
    }).catch(function(err){
      running=false; workerFailed=true; throw err;
    });
  }

  function stop(){
    running=false;
    clearDetectLoop(); clearDetectTimeout(); dropPendingBitmap();
    detectInFlight=false; videoEl=null; onPoint=null; lastTs=-1;
    setActivityTag('');
  }

  function isRunning(){ return !!running&&!!detectRaf; }

  function getLastPoint(){
    return {x:lastGood.x,y:lastGood.y,confidence:lastGood.confidence,state:lastGood.state,feats:lastGood.feats||null};
  }

  function setDetectIntervalMs(ms){
    var n=Number(ms);
    detectIntervalMs=(isFinite(n)&&n>=20)?n:DETECT_INTERVAL_MS;
  }

  function getInferQueueDepth(){
    return pendingBitmap?1:0;
  }

  global.OneToneCameraGazeLandmarker={
    ensureReady:ensureReady,
    start:start,
    stop:stop,
    isRunning:isRunning,
    getLastPoint:getLastPoint,
    setDetectIntervalMs:setDetectIntervalMs,
    mapVideoNormToOverlay:mapVideoNormToOverlay,
    getContainRect:getContainRect,
    estimateGazeProxy:estimateGazeProxy,
    getInferQueueDepth:getInferQueueDepth,
    isWorkerFailed:function(){ return !!workerFailed; },
    experimentalPresenceAllowed:experimentalPresenceAllowed,
    getLastLandmarks:function(){ return lastLandmarks||null; },
    getLastLandmarksAt:function(){ return lastLandmarksAt||0; }
  };
})((typeof window!=='undefined')?window:globalThis);
