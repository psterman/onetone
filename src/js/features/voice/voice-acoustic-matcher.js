(function(global){
  'use strict';

  var COOLDOWN_MS=1500;
  var lastTriggered=null;
  var matchWatch=null;

  function collectAcousticCommands(config){
    var out=[];
    if(!config||!Array.isArray(config.mappings)) return out;
    config.mappings.forEach(function(m){
      if(!m||!Array.isArray(m.acousticVoiceCommands)) return;
      m.acousticVoiceCommands.forEach(function(c){
        if(!c) return;
        var copy=Object.assign({},c);
        if(!copy.scenarioId) copy.scenarioId=m.id;
        if(copy.appTargetId==null) copy.appTargetId=String(m.appTargetId||'');
        out.push(copy);
      });
    });
    return out;
  }

  function inCooldown(commandId,scenarioId,now){
    if(!lastTriggered) return false;
    if((now-lastTriggered.at)>COOLDOWN_MS) return false;
    if(commandId&&lastTriggered.commandId===commandId) return true;
    if(scenarioId&&lastTriggered.scenarioId===scenarioId) return true;
    return false;
  }

  function triggerMatch(payload,opts){
    payload=payload||{};
    opts=opts||{};
    var scenarioId=String(payload.scenarioId||'').trim();
    if(!scenarioId) return false;
    var cmdId=String(payload.commandId||'');
    var now=Date.now();
    if(inCooldown(cmdId,scenarioId,now)) return false;

    // Backend already runs open-app + start-voice on match. Still sync FE active scheme
    // even when the scenario is already selected (backend no longer no-ops for that).
    var activate=global.OneToneSceneActivate;
    if(activate&&typeof activate.activateScene==='function'){
      if(!(activate.isActiveScene&&activate.isActiveScene(scenarioId))){
        activate.activateScene(scenarioId);
      }
    }
    lastTriggered={commandId:cmdId,scenarioId:scenarioId,at:now};
    if(!opts.silentToast&&global.OneToneAppToast){
      var reason=String(payload.reason||'');
      var launchFail=payload.ok===false&&(reason==='app_launch_failed'||payload.matched===true);
      if(launchFail){
        global.OneToneAppToast.show(
          (global.OneToneI18n&&global.OneToneI18n.t&&global.OneToneI18n.t('habitAcousticCmdLaunchFailed'))
            ||'已识别口令，但找不到/无法启动应用',
          'warn'
        );
      }else if(payload.ok!==false){
        var label=String(payload.appTargetId||payload.runtimeLabel||'').trim();
        var msg=global.OneToneI18n&&global.OneToneI18n.t
          ?global.OneToneI18n.t('habitAcousticCmdTriggered')
          :'语音命令已触发';
        if(label) msg+=' · '+label;
        global.OneToneAppToast.show(msg,'scheme');
      }
    }
    return true;
  }

  function clearMatchWatch(){
    if(matchWatch&&matchWatch.timer){
      try{ clearTimeout(matchWatch.timer); }catch(_e){}
    }
    matchWatch=null;
  }

  function setMatchWatch(opts){
    clearMatchWatch();
    opts=opts||{};
    var scenarioId=String(opts.scenarioId||'').trim();
    if(!scenarioId) return;
    var timeoutMs=Math.max(3000,Number(opts.timeoutMs)||12000);
    matchWatch={
      scenarioId:scenarioId,
      onMatch:typeof opts.onMatch==='function'?opts.onMatch:null,
      onTimeout:typeof opts.onTimeout==='function'?opts.onTimeout:null
    };
    matchWatch.timer=setTimeout(function(){
      var cb=matchWatch&&matchWatch.onTimeout;
      clearMatchWatch();
      if(cb) cb();
    },timeoutMs);
  }

  function onRuntimeEvent(event){
    if(!event||event.kind!=='acoustic_voice_matched') return null;
    var payload=event.payload||{};
    var watched=false;
    if(matchWatch){
      var watchId=matchWatch.scenarioId;
      var hitId=String(payload.scenarioId||payload.scenario_id||'').trim();
      if(watchId&&hitId===watchId){
        var cb=matchWatch.onMatch;
        clearMatchWatch();
        watched=true;
        if(cb) cb(payload);
      }
    }
    return {triggered:triggerMatch(payload,{silentToast:watched}),payload:payload};
  }

  function resetCooldownForTests(){
    lastTriggered=null;
  }

  global.OneToneVoiceAcousticMatcher={
    collectAcousticCommands:collectAcousticCommands,
    triggerMatch:triggerMatch,
    onRuntimeEvent:onRuntimeEvent,
    setMatchWatch:setMatchWatch,
    clearMatchWatch:clearMatchWatch,
    hasMatchWatch:function(){ return !!matchWatch; },
    resetCooldownForTests:resetCooldownForTests,
    COOLDOWN_MS:COOLDOWN_MS
  };
})((typeof window!=='undefined')?window:globalThis);
