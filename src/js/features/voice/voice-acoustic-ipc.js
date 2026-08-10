(function(global){
  'use strict';

  var DEFAULT_RECORD_TIMEOUT_MS=8000;
  var DEFAULT_MANUAL_MAX_MS=3500;
  var INVOKE_BUFFER_MS=4000;
  var backendReady=null;
  var levelUnlisten=null;

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
      return api.invokeTimeout(name,args||{},ms);
    }
    return invoke(name,args);
  }

  function isAvailable(){
    return !!(ipc()&&typeof ipc().invoke==='function');
  }

  function tauriEventApi(){
    var ipc=global.OneToneIpc;
    if(ipc&&typeof ipc.eventApi==='function') return ipc.eventApi();
    return null;
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

  function preflight(){
    return invoke('cmd_acoustic_voice_command_preflight',{});
  }

  function setSuspend(on){
    return invoke('cmd_acoustic_voice_command_set_suspend',{suspended:!!on});
  }

  function recordStart(opts){
    opts=opts||{};
    var sessionId=String(opts.sessionId||'').trim();
    if(!sessionId) return Promise.reject(new Error('sessionId required'));
    // Cap wait so UI never sits forever on「正在打开麦克风」.
    return invokeTimeout('cmd_acoustic_voice_command_record_start',{
      sessionId:sessionId
    },10000).catch(function(err){
      var msg=err&&err.message?String(err.message):'';
      if(msg.indexOf('timeout')>=0){
        // Best-effort abort of a stuck open (IPC may still finish later).
        return recordCancel({sessionId:sessionId}).then(function(){
          return {ok:false,messageKey:'habitAcousticCmdMicBusy',reason:'timeout'};
        });
      }
      throw err;
    });
  }

  function recordStop(opts){
    opts=opts||{};
    var sessionId=String(opts.sessionId||'').trim();
    var manualMax=Number(opts.manualMaxMs)||DEFAULT_MANUAL_MAX_MS;
    return invokeTimeout('cmd_acoustic_voice_command_record_stop',{
      sessionId:sessionId
    },manualMax+INVOKE_BUFFER_MS);
  }

  function recordCancel(opts){
    opts=opts||{};
    var sessionId=String(opts.sessionId||'').trim();
    // Empty id still hits backend so parked multi-take lease can be released.
    return invoke('cmd_acoustic_voice_command_record_cancel',{
      sessionId:sessionId||''
    }).catch(function(){
      return {ok:true};
    });
  }

  /** @deprecated Prefer recordStart/Stop; kept for backward compatibility. */
  function recordOnce(opts){
    opts=opts||{};
    var sessionId=String(opts.sessionId||'').trim();
    var timeoutMs=Number(opts.recordTimeoutMs)||DEFAULT_RECORD_TIMEOUT_MS;
    var args={};
    if(sessionId) args.sessionId=sessionId;
    return invokeTimeout('cmd_acoustic_voice_command_record_once',args,timeoutMs+INVOKE_BUFFER_MS);
  }

  function unlistenLevel(){
    if(typeof levelUnlisten==='function'){
      try{ levelUnlisten(); }catch(_e){}
    }
    levelUnlisten=null;
  }

  function listenLevel(handler){
    unlistenLevel();
    var ev=tauriEventApi();
    if(!ev){
      return Promise.resolve(function(){});
    }
    return ev.listen('acoustic_record_level',function(event){
      if(typeof handler!=='function') return;
      handler(event&&event.payload!=null?event.payload:event);
    }).then(function(unlisten){
      levelUnlisten=typeof unlisten==='function'?unlisten:null;
      return unlisten;
    }).catch(function(err){
      if(typeof console!=='undefined'&&console.warn){
        console.warn('[acoustic] listen level failed',err);
      }
      return function(){};
    });
  }

  function buildFromSamples(samples,opts){
    opts=opts||{};
    return invoke('cmd_acoustic_voice_command_build_from_samples',{
      samples:Array.isArray(samples)?samples:[],
      scenarioId:String(opts.scenarioId||''),
      activationScope:opts.activationScope||'global',
      appBoost:opts.appBoost!==false,
      displayText:String(opts.displayText||''),
      currentCommandId:opts.currentCommandId||null,
      kind:opts.kind||null
    });
  }

  function testOnce(scenarioId){
    return invokeTimeout('cmd_acoustic_voice_command_test_once',{
      scenarioId:String(scenarioId||'')
    },DEFAULT_RECORD_TIMEOUT_MS+INVOKE_BUFFER_MS+8000);
  }

  function appLaunchCapability(appTargetId){
    return invoke('cmd_app_launch_capability',{
      appTargetId:String(appTargetId||'')
    });
  }

  function logDebugSummary(res){
    if(!res) return;
    if(typeof console!=='undefined'&&console.debug){
      if(res.debugSummary){
        console.debug('[acoustic record debugSummary]',res.debugSummary);
      }else if(!res.ok){
        console.debug('[acoustic record failed]',res);
      }
    }
  }

  global.OneToneVoiceAcousticIpc={
    isAvailable:isAvailable,
    probeBackend:probeBackend,
    status:status,
    preflight:preflight,
    setSuspend:setSuspend,
    recordStart:recordStart,
    recordStop:recordStop,
    recordCancel:recordCancel,
    recordOnce:recordOnce,
    testOnce:testOnce,
    appLaunchCapability:appLaunchCapability,
    listenLevel:listenLevel,
    unlistenLevel:unlistenLevel,
    buildFromSamples:buildFromSamples,
    logDebugSummary:logDebugSummary,
    DEFAULT_RECORD_TIMEOUT_MS:DEFAULT_RECORD_TIMEOUT_MS,
    DEFAULT_MANUAL_MAX_MS:DEFAULT_MANUAL_MAX_MS,
    INVOKE_BUFFER_MS:INVOKE_BUFFER_MS
  };
})((typeof window!=='undefined')?window:globalThis);
