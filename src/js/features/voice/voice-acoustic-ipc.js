(function(global){
  'use strict';

  var RECORD_TIMEOUT_MS=12000;
  var backendReady=null;

  function ipc(){
    return global.OneToneIpc;
  }

  function invoke(name,args){
    var api=ipc();
    if(!api||typeof api.invoke!=='function') return Promise.reject(new Error('ipc unavailable'));
    return api.invoke(name,args||{});
  }

  function invokeTimeout(name,args,ms){
    var api=ipc();
    if(api&&typeof api.invokeTimeout==='function'){
      return api.invokeTimeout(name,args||{},ms||RECORD_TIMEOUT_MS);
    }
    return invoke(name,args);
  }

  function isAvailable(){
    return !!(ipc()&&typeof ipc().invoke==='function');
  }

  function probeBackend(){
    if(backendReady===true) return Promise.resolve(true);
    if(!isAvailable()){
      return Promise.resolve(false);
    }
    return invoke('cmd_acoustic_voice_command_status',{}).then(function(st){
      backendReady=!!(st&&st.available!==false);
      return backendReady;
    }).catch(function(err){
      if(typeof console!=='undefined'&&console.warn){
        console.warn('[acoustic] backend probe failed',err);
      }
      return false;
    });
  }

  function status(){
    return invoke('cmd_acoustic_voice_command_status',{});
  }

  // Suspend only quiets the acoustic matcher (backend). Engines keep running
  // until MicLease in record_once; do NOT call pause/set_enabled here.
  function setSuspend(on){
    return invoke('cmd_acoustic_voice_command_set_suspend',{suspended:!!on});
  }

  function recordOnce(){
    return invokeTimeout('cmd_acoustic_voice_command_record_once',{},RECORD_TIMEOUT_MS);
  }

  function buildFromSamples(samples,opts){
    opts=opts||{};
    return invoke('cmd_acoustic_voice_command_build_from_samples',{
      samples:Array.isArray(samples)?samples:[],
      scenarioId:String(opts.scenarioId||''),
      activationScope:opts.activationScope||'global',
      appBoost:opts.appBoost!==false,
      displayText:String(opts.displayText||''),
      currentCommandId:opts.currentCommandId||null
    });
  }

  function logDebugSummary(res){
    if(!res) return;
    if(typeof console!=='undefined'&&console.debug){
      if(res.debugSummary){
        console.debug('[acoustic record_once debugSummary]',res.debugSummary);
      }else if(!res.ok){
        console.debug('[acoustic record_once failed]',res);
      }
    }
  }

  global.OneToneVoiceAcousticIpc={
    isAvailable:isAvailable,
    probeBackend:probeBackend,
    status:status,
    setSuspend:setSuspend,
    recordOnce:recordOnce,
    buildFromSamples:buildFromSamples,
    logDebugSummary:logDebugSummary
  };
})((typeof window!=='undefined')?window:globalThis);
