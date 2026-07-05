(function(global){
  'use strict';
  var logging=false;
  var lastToastAt=0;
  var lastToastKey='';

  function logError(kind,detail){
    if(logging) return;
    logging=true;
    try{
      if(global.OneToneAppGlobalError&&typeof global.OneToneAppGlobalError.logGlobalError==='function'){
        global.OneToneAppGlobalError.logGlobalError(kind,detail);
        return;
      }
      var hooks=global.__vp_bootstrap_hooks__||{};
      if(typeof hooks.logGlobalError==='function'){
        hooks.logGlobalError(kind,detail);
        return;
      }
      console.error('['+kind+']',detail);
    }finally{
      logging=false;
    }
  }

  function bindListeners(){
    window.addEventListener('error',function(e){
      var stack=e.error&&(e.error.stack||e.error.message);
      var msg=(e.message||'error')+(e.filename?(' @ '+e.filename+':'+e.lineno+(e.colno?(':'+e.colno):'')):'')+(stack?('\n'+stack):'');
      logError('window.error',msg);
    });
    window.addEventListener('unhandledrejection',function(e){
      var reason=e.reason;
      var msg=reason&&(reason.message||reason.stack||String(reason))||'unhandled rejection';
      logError('unhandledrejection',msg);
      if(e.preventDefault) e.preventDefault();
    });
  }

  global.OneToneErrorHandlers={
    bindListeners:bindListeners,
    shouldToast:function(kind,detail){
      var now=Date.now();
      var key=kind+'|'+String(detail||'').slice(0,120);
      if(key===lastToastKey&&now-lastToastAt<2500) return false;
      lastToastKey=key;
      lastToastAt=now;
      return true;
    }
  };
})((typeof window!=='undefined')?window:globalThis);
