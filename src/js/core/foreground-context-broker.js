(function(global){
  'use strict';

  var listeners=[];
  var timer=0;
  var inFlight=false;
  var current=null;
  var lastSampleAt=0;
  var POLL_MS=1000;

  function dragging(){ return !!global.__onetoneOverlayDragging; }
  function invoke(){ return global.__vp_invoke__ || (global.OneToneIpc&&global.OneToneIpc.invoke); }
  function same(a,b){
    if(!a||!b) return false;
    return String(a.pid||'')===String(b.pid||'')
      &&String(a.windowClass||a.window_class||'')===String(b.windowClass||b.window_class||'')
      &&String(a.windowTitle||a.window_title||'')===String(b.windowTitle||b.window_title||'')
      &&String(a.appId||a.matchedPresetAppId||a.matched_preset_app_id||'')===String(b.appId||b.matchedPresetAppId||b.matched_preset_app_id||'');
  }
  function emit(next){
    if(same(current,next)) return;
    current=next||null;
    listeners.slice().forEach(function(fn){ try{ fn(current); }catch(_){} });
  }
  function sample(){
    if(inFlight||dragging()) return;
    var iv=invoke();
    if(!iv) return;
    inFlight=true;
    Promise.resolve(iv('cmd_habit_foreground_app',{})).then(function(res){
      lastSampleAt=Date.now();
      if(res&&(res.exeName||res.exe_name||res.appId)) emit(res);
    }).catch(function(){}).then(function(){ inFlight=false; });
  }
  function start(){
    if(timer) return;
    sample();
    timer=setInterval(sample,POLL_MS);
  }
  function stop(){ if(timer){ clearInterval(timer); timer=0; } }
  global.OneToneForegroundContext={
    subscribe:function(fn){
      if(typeof fn!=='function') return function(){};
      if(listeners.indexOf(fn)<0) listeners.push(fn);
      start();
      if(current) try{ fn(current); }catch(_){}
      return function(){ var i=listeners.indexOf(fn); if(i>=0) listeners.splice(i,1); if(!listeners.length) stop(); };
    },
    get:function(){ return current; },
    start:start,
    stop:stop,
    isDragging:dragging,
    sampleNow:sample,
    lastSampleAt:function(){ return lastSampleAt; }
  };
})(window);
