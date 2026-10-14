/**
 * Unified pause/resume for camera main-thread cost during window drag.
 * Stops gaze/hand createImageBitmap, beauty rAF, and mutes video tracks
 * (webcam decode/compositor keeps eating the UI thread if tracks stay enabled).
 * Rust: win.eval(pause/resume); to_js camera_frame_pump is fallback only.
 *
 * Idempotent pause/resume (boolean latch) — Soft Pad may prepare-pause while a
 * previous gesture left the pump paused; nested depth+1 would leak and leave
 * the camera half-resumed on the next drag.
 */
(function(global){
  'use strict';
  var paused=false;
  var mutedTracks=[];

  function muteVideoTracks(){
    unmuteVideoTracks();
    var video=null;
    try{
      video=(global.OneToneDom&&global.OneToneDom.$)
        ? global.OneToneDom.$('cameraPreviewVideo')
        : (global.document&&global.document.getElementById('cameraPreviewVideo'));
    }catch(_){}
    var stream=video&&video.srcObject;
    if(!stream||!stream.getVideoTracks) return;
    var tracks=stream.getVideoTracks();
    for(var i=0;i<tracks.length;i++){
      var t=tracks[i];
      if(t&&t.enabled){
        t.enabled=false;
        mutedTracks.push(t);
      }
    }
  }

  function unmuteVideoTracks(){
    for(var i=0;i<mutedTracks.length;i++){
      try{ mutedTracks[i].enabled=true; }catch(_){}
    }
    mutedTracks=[];
  }

  function pauseEnhancer(){
    var enh=global.OneToneCameraVideoEnhancer;
    if(enh&&typeof enh.pauseForDrag==='function') enh.pauseForDrag();
  }

  function resumeEnhancer(){
    var enh=global.OneToneCameraVideoEnhancer;
    if(enh&&typeof enh.resumeAfterDrag==='function') enh.resumeAfterDrag();
  }

  function applyPause(){
    var gaze=global.OneToneCameraGazeLandmarker;
    var hand=global.OneToneCameraHandGesture;
    if(gaze&&typeof gaze.pauseInfer==='function') gaze.pauseInfer();
    if(hand&&typeof hand.pauseInfer==='function') hand.pauseInfer();
    pauseEnhancer();
    muteVideoTracks();
  }

  function applyResume(){
    unmuteVideoTracks();
    resumeEnhancer();
    var gaze=global.OneToneCameraGazeLandmarker;
    var hand=global.OneToneCameraHandGesture;
    if(gaze&&typeof gaze.resumeInfer==='function') gaze.resumeInfer();
    if(hand&&typeof hand.resumeInfer==='function') hand.resumeInfer();
  }

  function pause(){
    if(paused){
      // Re-assert mute/loops — tracks may have been re-enabled while latch stuck.
      muteVideoTracks();
      pauseEnhancer();
      return;
    }
    paused=true;
    applyPause();
  }

  function resume(){
    if(!paused) return;
    paused=false;
    applyResume();
  }

  function onToJs(e){
    var d=e&&e.data;
    if(!d||d.type!=='camera_frame_pump') return;
    if(d.paused) pause();
    else resume();
  }

  if(global.chrome&&global.chrome.webview&&typeof global.chrome.webview.addEventListener==='function'){
    global.chrome.webview.addEventListener('message',onToJs);
  }

  global.OneToneCameraFramePump={
    pause:pause,
    resume:resume,
    getDepth:function(){ return paused?1:0; }
  };
})((typeof window!=='undefined')?window:globalThis);
