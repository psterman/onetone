(function(global){
  'use strict';

  function earlyLog(line){
    const text='boot-main '+String(line||'');
    try{ console.log('[onetone]',text); }catch(_){}
    try{
      const ipc=global.OneToneIpc;
      if(ipc&&typeof ipc.invoke==='function'){
        ipc.invoke('cmd_app_log',{line:text}).catch(function(){});
      }
    }catch(_){}
  }

  function errorText(err){
    return (err&&err.stack)||((err&&err.message)?err.message:String(err));
  }

  function step(label,fn){
    earlyLog(label+' begin');
    try{
      fn();
      earlyLog(label+' ok');
      return true;
    }catch(err){
      earlyLog(label+' failed: '+errorText(err));
      try{ console.error('OneTone boot step failed: '+label,err); }catch(_){}
      return false;
    }
  }

  global.OneToneEarlyLog=earlyLog;
  global.addEventListener('error',function(e){
    earlyLog('window.error '+((e&&e.message)||'error')+(e&&e.filename?(' @ '+e.filename+':'+e.lineno+':'+e.colno):''));
  });
  global.addEventListener('unhandledrejection',function(e){
    earlyLog('unhandledrejection '+errorText(e&&e.reason));
  });

  step('legacy-shims-build-register',function(){
    OneToneAppLegacyRegister.registerAll(OneToneAppLegacyShims.build());
  });
  step('app-bridge-install',function(){
    OneToneAppBridge.installApp();
  });
  step('bootstrap-install',function(){
    OneToneBootstrap.install();
  });

  setTimeout(function(){
    var st=global.OneToneState&&global.OneToneState.state;
    var cfg=st&&st.config;
    earlyLog('post-boot status hooks='+(global.__vp_bootstrap_hooks__?'1':'0')+
      ' loaded='+(global.OneToneConfigPersist&&global.OneToneConfigPersist.isLoaded&&global.OneToneConfigPersist.isLoaded()?'1':'0')+
      ' maps='+(cfg&&Array.isArray(cfg.mappings)?cfg.mappings.length:'-')+
      ' selected='+(st&&st.selectedMappingId||'')+
      ' active='+(cfg&&cfg.activeSceneId||''));
  },2500);
})((typeof window!=='undefined')?window:globalThis);
