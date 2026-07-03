(function(global){
  'use strict';

  var lastKeyDebug={key:'—',code:'—'};

  function lastKeyDebugFn(){ return lastKeyDebug; }

  function setLastKeyDebug(v){
    v=v||{};
    lastKeyDebug.key=v.key||'—';
    lastKeyDebug.code=v.code||'—';
  }

  global.OneToneAppDebugState={
    lastKeyDebug:lastKeyDebugFn,
    setLastKeyDebug:setLastKeyDebug
  };
})((typeof window!=='undefined')?window:globalThis);
