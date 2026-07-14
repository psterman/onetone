(function(global){
  'use strict';

  var COOLDOWN_MS=1500;
  var lastTriggered=null;

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

  function triggerMatch(payload){
    payload=payload||{};
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
    if(global.OneToneAppToast&&payload.ok!==false){
      var label=String(payload.appTargetId||payload.runtimeLabel||'').trim();
      var msg=global.OneToneI18n&&global.OneToneI18n.t
        ?global.OneToneI18n.t('habitAcousticCmdTriggered')
        :'语音命令已触发';
      if(label) msg+=' · '+label;
      global.OneToneAppToast.show(msg,'scheme');
    }
    return true;
  }

  function onRuntimeEvent(event){
    if(!event||event.kind!=='acoustic_voice_matched') return null;
    var payload=event.payload||{};
    return {triggered:triggerMatch(payload),payload:payload};
  }

  function resetCooldownForTests(){
    lastTriggered=null;
  }

  global.OneToneVoiceAcousticMatcher={
    collectAcousticCommands:collectAcousticCommands,
    triggerMatch:triggerMatch,
    onRuntimeEvent:onRuntimeEvent,
    resetCooldownForTests:resetCooldownForTests,
    COOLDOWN_MS:COOLDOWN_MS
  };
})((typeof window!=='undefined')?window:globalThis);
