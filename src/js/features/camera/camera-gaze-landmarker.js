(function(global){
  'use strict';

  /**
   * Local MediaPipe Face Landmarker → uncalibrated gaze proxy.
   * Not screen gaze. Runtime loads only vendor/mediapipe (no CDN).
   */

  var DETECT_INTERVAL_MS=33;
  var detectIntervalMs=DETECT_INTERVAL_MS;
  var VENDOR_BASE='vendor/mediapipe';
  var LOW_CONF=0.35;

  var landmarker=null;
  var readyPromise=null;
  var running=false;
  var detectRaf=0;
  var lastDetectWall=0;
  var videoEl=null;
  var onPoint=null;
  var lastTs=-1;
  var lastGood={x:0.5,y:0.5,confidence:0,state:'idle',feats:null};

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
    if(lookOut!=null||lookIn!=null||lookDown!=null||lookUp!=null){
      var w=0.38;
      vx=clamp01(vx*(1-w)+(0.5+blendX*0.72)*w);
      vy=clamp01(vy*(1-w)+(0.5+blendY*0.72)*w);
      conf=Math.min(0.9,conf+0.06);
    }

    var blink=avgBlend(blendMap,['eyeBlinkLeft','eyeBlinkRight']);
    if(blink!=null&&blink>0.55) conf*=0.35;

    var pose=headPoseFromMatrix(transformMat);
    // Glasses + overhead cam: looking down often occludes iris behind rims.
    // Shift vertical trust from iris/socket to head pitch when looking down.
    var lookDownAmt=Math.max(0,blendY,pose.pitch);
    var eyeVertTrust=1;
    if(lookDownAmt>0.18) eyeVertTrust=clampRange(1-lookDownAmt*0.85,0.28,1);
    if(blink!=null&&blink>0.35) eyeVertTrust*=0.7;
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
    return {
      x:vx,
      y:vy,
      confidence:clamp01(conf),
      state:state,
      feats:[
        sockX*2.4,sockY*2.1,
        blendX*2.1,blendY*1.85,
        pose.yaw*yawW,pose.pitch*pitchW,
        (irisX-0.5)*2.4,(irisY-0.5)*2.0
      ]
    };
  }

  function resolveVendorUrl(rel){
    // Page-relative under src/ (Tauri frontendDist).
    try{
      return new URL(VENDOR_BASE+'/'+rel,global.location.href).href;
    }catch(_){
      return VENDOR_BASE+'/'+rel;
    }
  }

  function ensureReady(){
    if(landmarker) return Promise.resolve(landmarker);
    if(readyPromise) return readyPromise;
    readyPromise=import(resolveVendorUrl('vision_bundle.mjs')).then(function(mod){
      var FilesetResolver=mod.FilesetResolver;
      var FaceLandmarker=mod.FaceLandmarker;
      if(!FilesetResolver||!FaceLandmarker){
        throw new Error('vision_bundle missing FaceLandmarker exports');
      }
      var wasmPath=resolveVendorUrl('wasm');
      var modelPath=resolveVendorUrl('face_landmarker.task');
      return FilesetResolver.forVisionTasks(wasmPath).then(function(vision){
        function createWithDelegate(delegate){
          return FaceLandmarker.createFromOptions(vision,{
            baseOptions:{
              modelAssetPath:modelPath,
              delegate:delegate
            },
            runningMode:'VIDEO',
            numFaces:1,
            outputFaceBlendshapes:true,
            outputFacialTransformationMatrixes:true,
            minFaceDetectionConfidence:0.5,
            minFacePresenceConfidence:0.5,
            minTrackingConfidence:0.5
          });
        }
        // Prefer GPU; fall back to CPU when WebGL/GPU init fails.
        return createWithDelegate('GPU').catch(function(){
          return createWithDelegate('CPU');
        });
      });
    }).then(function(fl){
      landmarker=fl;
      return landmarker;
    }).catch(function(err){
      readyPromise=null;
      landmarker=null;
      // Surface clear failure — never silently fall back to CDN.
      var msg=err&&err.message?err.message:String(err||'unknown');
      throw new Error('local MediaPipe load failed: '+msg);
    });
    return readyPromise;
  }

  function emitPoint(point){
    if(typeof onPoint==='function'){
      try{ onPoint(point); }catch(_){}
    }
  }

  function detectOnce(){
    if(!running||!landmarker||!videoEl) return;
    if(videoEl.readyState<2) return;
    var now=performance.now();
    // MediaPipe requires strictly increasing timestamps.
    if(now<=lastTs) now=lastTs+1;
    lastTs=now;
    var result;
    try{
      result=landmarker.detectForVideo(videoEl,now);
    }catch(err){
      emitPoint({
        x:lastGood.x,
        y:lastGood.y,
        confidence:0.05,
        state:'lost',
        error:err&&err.message
      });
      return;
    }
    var faces=result&&result.faceLandmarks;
    if(!faces||!faces.length){
      emitPoint({
        x:lastGood.x,
        y:lastGood.y,
        confidence:0.08,
        state:'lost'
      });
      return;
    }
    var blendMap=buildBlendMap(result.faceBlendshapes);
    var mats=result.facialTransformationMatrixes;
    var mat=mats&&mats[0]?mats[0]:null;
    if(mat&&mat.data) mat=mat.data;
    var proxy=estimateGazeProxy(faces[0],blendMap,mat);
    var overlay=global.document&&global.document.getElementById('cameraGazeOverlay');
    var mapped=mapVideoNormToOverlay(proxy.x,proxy.y,videoEl,overlay);
    var out={
      x:mapped.x,
      y:mapped.y,
      confidence:proxy.confidence,
      state:proxy.state,
      feats:proxy.feats||null
    };
    if(out.state==='tracking'||(out.state==='low-confidence'&&out.confidence>0.15)){
      lastGood={x:out.x,y:out.y,confidence:out.confidence,state:out.state,feats:out.feats};
    }
    emitPoint(out);
  }

  function clearDetectLoop(){
    if(detectRaf){
      cancelAnimationFrame(detectRaf);
      detectRaf=0;
    }
    lastDetectWall=0;
  }

  function detectLoop(wallNow){
    detectRaf=0;
    if(!running) return;
    if(!lastDetectWall||(wallNow-lastDetectWall)>=detectIntervalMs){
      lastDetectWall=wallNow;
      detectOnce();
    }
    detectRaf=requestAnimationFrame(detectLoop);
  }

  function start(video,callback){
    videoEl=video||null;
    onPoint=callback||null;
    if(running&&detectRaf){
      return ensureReady();
    }
    running=true;
    lastTs=-1;
    lastDetectWall=0;
    return ensureReady().then(function(){
      if(!running) return;
      clearDetectLoop();
      detectRaf=requestAnimationFrame(detectLoop);
    });
  }

  function stop(){
    running=false;
    clearDetectLoop();
    videoEl=null;
    onPoint=null;
    lastTs=-1;
  }

  function isRunning(){ return !!running&&!!detectRaf; }

  function getLastPoint(){
    return {
      x:lastGood.x,
      y:lastGood.y,
      confidence:lastGood.confidence,
      state:lastGood.state,
      feats:lastGood.feats||null
    };
  }

  function setDetectIntervalMs(ms){
    var n=Number(ms);
    detectIntervalMs=(isFinite(n)&&n>=20)?n:DETECT_INTERVAL_MS;
  }

  // Expose mapping helpers for tests / preview shell.
  global.OneToneCameraGazeLandmarker={
    ensureReady:ensureReady,
    start:start,
    stop:stop,
    isRunning:isRunning,
    getLastPoint:getLastPoint,
    setDetectIntervalMs:setDetectIntervalMs,
    mapVideoNormToOverlay:mapVideoNormToOverlay,
    getContainRect:getContainRect,
    estimateGazeProxy:estimateGazeProxy
  };
})((typeof window!=='undefined')?window:globalThis);
