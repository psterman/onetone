(function(global){
  'use strict';

  var COOLDOWN_MS=1500;
  var suspended=false;
  var lastTriggered=null;

  function calib(){
    return global.OneToneVoiceCommandCalibration||null;
  }

  function suspend(on){
    suspended=!!on;
  }

  function isSuspended(){
    return !!suspended;
  }

  function collectVoiceCommands(config){
    var out=[];
    if(!config||!Array.isArray(config.mappings)) return out;
    config.mappings.forEach(function(m){
      if(!m||!Array.isArray(m.voiceCommands)) return;
      m.voiceCommands.forEach(function(c){
        if(!c) return;
        var copy=Object.assign({},c);
        if(!copy.scenarioId) copy.scenarioId=m.id;
        if(copy.appTargetId==null) copy.appTargetId=String(m.appTargetId||'');
        out.push(copy);
      });
    });
    return out;
  }

  function scoreAgainstCommand(transcript,cmd){
    var c=calib();
    if(!c) return 0;
    var best=c.phraseSimilarity(transcript,cmd.canonicalPhrase||'');
    (Array.isArray(cmd.aliases)?cmd.aliases:[]).forEach(function(a){
      best=Math.max(best,c.phraseSimilarity(transcript,a));
    });
    (Array.isArray(cmd.samples)?cmd.samples:[]).forEach(function(s){
      if(s&&s.transcript) best=Math.max(best,c.phraseSimilarity(transcript,s.transcript));
    });
    if(cmd.phoneticKey){
      best=Math.max(best,c.phoneticSimilarity(transcript,cmd.phoneticKey));
      best=Math.max(best,c.phraseSimilarity(c.normalizeTranscript(transcript),cmd.phoneticKey));
    }
    return best;
  }

  function matchVoiceCommand(transcript,context){
    context=context||{};
    if(suspended) return null;
    var text=String(transcript||'').trim();
    if(!text) return null;
    var c=calib();
    if(!c||!c.normalizeTranscript(text)) return null;

    var cmds=Array.isArray(context.commands)?context.commands:collectVoiceCommands(context.config);
    var foregroundAppId=context.foregroundAppId!=null?String(context.foregroundAppId).trim():'';
    var scored=[];

    cmds.forEach(function(cmd){
      if(!cmd||cmd.enabled===false) return;
      if(String(cmd.kind||'scenario-activate')!=='scenario-activate') return;

      var scope=String(cmd.activationScope||'global');
      if(scope==='foreground-app'){
        if(!foregroundAppId) return;
        var target=String(cmd.appTargetId||'').trim();
        if(target&&target!==foregroundAppId) return;
      }

      var score=scoreAgainstCommand(text,cmd);
      if(cmd.appBoost!==false&&foregroundAppId){
        var appId=String(cmd.appTargetId||'').trim();
        if(appId&&appId===foregroundAppId) score=Math.min(1,score+0.06);
      }

      var threshold=Number(cmd.threshold);
      if(!isFinite(threshold)) threshold=0.80;
      if(score>=threshold){
        scored.push({command:cmd,score:score,scenarioId:String(cmd.scenarioId||'')});
      }
    });

    if(!scored.length) return null;
    scored.sort(function(a,b){ return b.score-a.score; });
    var top=scored[0];
    var second=scored[1];
    var margin=Number(top.command.margin);
    if(!isFinite(margin)) margin=0.06;
    if(second&&(top.score-second.score)<margin) return null;
    return top;
  }

  function fingerprintOf(text,commandId){
    var c=calib();
    var norm=c?c.normalizeTranscript(text):String(text||'').trim().toLowerCase();
    return norm+'\x1e'+String(commandId||'');
  }

  function inCooldown(commandId,scenarioId,fp,now){
    if(!lastTriggered) return false;
    if((now-lastTriggered.at)>COOLDOWN_MS) return false;
    if(lastTriggered.transcriptFingerprint===fp) return true;
    if(commandId&&lastTriggered.commandId===commandId) return true;
    if(scenarioId&&lastTriggered.scenarioId===scenarioId&&lastTriggered.transcriptFingerprint.split('\x1e')[0]===(fp.split('\x1e')[0])) return true;
    return false;
  }

  function triggerVoiceCommand(match,context){
    context=context||{};
    if(suspended) return false;
    if(!match||!match.command) return false;
    var scenarioId=String(match.scenarioId||match.command.scenarioId||'').trim();
    if(!scenarioId) return false;
    var cmdId=String(match.command.id||'');
    var transcript=String(context.transcript||'');
    var fp=fingerprintOf(transcript,cmdId);
    var now=Date.now();
    if(inCooldown(cmdId,scenarioId,fp,now)) return false;

    var activate=global.OneToneSceneActivate;
    if(activate&&typeof activate.isActiveScene==='function'&&activate.isActiveScene(scenarioId)){
      lastTriggered={commandId:cmdId,scenarioId:scenarioId,transcriptFingerprint:fp,at:now};
      return false;
    }
    if(activate&&typeof activate.activateScene==='function'){
      activate.activateScene(scenarioId);
      lastTriggered={commandId:cmdId,scenarioId:scenarioId,transcriptFingerprint:fp,at:now};
      return true;
    }
    return false;
  }

  /**
   * Poll hook entry. When suspended: zero side effects (no log/toast/trigger).
   */
  function onFinalTranscript(transcript,context){
    if(suspended) return null;
    context=context||{};
    var match=matchVoiceCommand(transcript,context);
    if(!match) return null;
    var triggered=triggerVoiceCommand(match,{transcript:transcript});
    return {match:match,triggered:triggered};
  }

  function resetCooldownForTests(){
    lastTriggered=null;
  }

  global.OneToneVoiceCommandMatcher={
    suspend:suspend,
    isSuspended:isSuspended,
    collectVoiceCommands:collectVoiceCommands,
    matchVoiceCommand:matchVoiceCommand,
    triggerVoiceCommand:triggerVoiceCommand,
    onFinalTranscript:onFinalTranscript,
    resetCooldownForTests:resetCooldownForTests,
    COOLDOWN_MS:COOLDOWN_MS
  };
})((typeof window!=='undefined')?window:globalThis);
