(function(global){
  'use strict';

  function t(key, vars){
    if(global.OneToneI18n&&global.OneToneI18n.t){
      var out=global.OneToneI18n.t(key);
      if(vars){
        Object.keys(vars).forEach(function(k){
          out=out.replace(new RegExp('\\{'+k+'\\}','g'),String(vars[k]));
        });
      }
      return out;
    }
    return key;
  }

  function state(){
    return global.OneToneState&&global.OneToneState.state?global.OneToneState.state:{};
  }

  function cfg(){
    return state().config||{};
  }

  function friendlyKey(key){
    key=String(key||'').trim();
    if(!key) return t('homeLiveUnset');
    if(global.OneToneKeyLabels&&global.OneToneKeyLabels.friendlyKeyName){
      return global.OneToneKeyLabels.friendlyKeyName(key,global.OneToneI18n.getLang());
    }
    return key;
  }

  function activeMapping(){
    var c=cfg();
    var maps=Array.isArray(c.mappings)?c.mappings:[];
    if(global.OneToneHabitProfile&&global.OneToneHabitProfile.projectActive){
      var active=global.OneToneHabitProfile.projectActive(c);
      if(active) return active;
    }
    var id=String(c.activeSceneId||c.active_scene_id||state().selectedMappingId||'');
    return maps.find(function(m){ return String(m.id||'')===id; })||maps.find(function(m){ return !!m.enabled; })||maps[0]||null;
  }

  function triggerLabel(m){
    return friendlyKey(m&&(m.triggerKey||m.trigger_key));
  }

  function targetLabel(m){
    var c=cfg();
    var key=(m&&(m.targetKey||m.target_key))||(c.voiceVosk&&c.voiceVosk.targetKey)||(c.voiceSapi&&c.voiceSapi.targetKey)||'';
    return friendlyKey(key);
  }

  function engineMode(){
    if(global.OneToneHomeLive&&global.OneToneHomeLive.voiceEngineOn){
      var live=global.OneToneHomeLive.voiceEngineOn();
      if(live==='vosk'||live==='sapi'||live==='off') return live;
    }
    var c=cfg();
    if(c.voiceVosk&&c.voiceVosk.enabled) return 'vosk';
    if(c.voiceSapi&&c.voiceSapi.enabled) return 'sapi';
    return 'off';
  }

  function engineLabel(mode){
    if(mode==='vosk') return t('homeFlowEngineVosk');
    if(mode==='sapi') return t('homeFlowEngineSapi');
    return t('homeFlowEngineOff');
  }

  function voiceSummary(){
    if(global.OneToneVoiceHomeSummary&&global.OneToneVoiceHomeSummary.compute){
      return global.OneToneVoiceHomeSummary.compute();
    }
    return {};
  }

  function first(list){
    return Array.isArray(list)&&list.length?String(list[0]||'').trim():'';
  }

  function wakePhrase(summary,mode){
    if(summary&&summary.wakePhrase) return summary.wakePhrase;
    var c=cfg();
    if(mode==='vosk') return first((c.voiceVosk||c.voice_vosk||{}).phrases)||'开始输入';
    if(mode==='sapi') return first((c.voiceSapi||c.voice_sapi||{}).phrases)||'开始输入';
    return '';
  }

  function endPhrase(){
    var c=cfg();
    var end=c.voiceEnd||c.voice_end||{};
    var zh=first(end.phrasesZh||end.phrases_zh);
    var en=first(end.phrasesEn||end.phrases_en);
    return global.OneToneI18n&&global.OneToneI18n.getLang&&global.OneToneI18n.getLang()==='en'?(en||zh):(zh||en);
  }

  function outputMode(){
    var end=(cfg().voiceEnd||cfg().voice_end||{});
    var commit=friendlyKey(end.commitKey||end.commit_key||'Enter');
    if(end.autoSendEnabled||end.auto_send_enabled){
      return {
        mode:'auto',
        label:t('homeFlowOutputAuto'),
        detail:t('homeFlowOutputAutoDetail',{key:commit}),
        short:t('homeFlowOutputAuto')
      };
    }
    return {
      mode:'confirm',
      label:t('homeFlowOutputConfirm'),
      detail:t('homeFlowOutputConfirmDetail',{key:commit}),
      short:t('homeFlowOutputConfirmDetail',{key:commit})
    };
  }

  function scopeLabel(m){
    if(!m) return t('homeFlowScopeAll');
    var app=m.appTargetId||m.app_target_id||'';
    var rules=Array.isArray(m.appBehaviorRules||m.app_behavior_rules)?(m.appBehaviorRules||m.app_behavior_rules):[];
    var ids=[];
    if(app) ids.push(app);
    rules.forEach(function(r){ var id=r&&String(r.appId||r.app_id||''); if(id&&ids.indexOf(id)<0) ids.push(id); });
    if(!ids.length) return t('homeFlowScopeAll');
    if(ids.length===1){
      var presets=global.OneToneAppTargetPresets&&global.OneToneAppTargetPresets.presets?global.OneToneAppTargetPresets.presets:[];
      var p=presets.find(function(x){ return x&&x.id===ids[0]; });
      if(p&&(p.nameKey||p.name||p.label)){
        return p.nameKey?t(p.nameKey):(p.name||p.label||ids[0]);
      }
      return ids[0];
    }
    return t('homeFlowScopeN',{n:ids.length});
  }

  function micStatus(summary){
    var devices=global.OneToneAppMic&&global.OneToneAppMic.devices?global.OneToneAppMic.devices():[];
    var label=summary&&summary.micLabel||t('homeWbVoiceMicDefault');
    var ok=!!devices.length||!!label;
    return {label:label,state:ok?t('homeFlowMicOk'):t('homeFlowMicCheck'),ok:ok};
  }

  function conflictCount(){
    if(global.__vp_bootstrap_hooks__&&global.__vp_bootstrap_hooks__.countConflictPairs){
      return global.__vp_bootstrap_hooks__.countConflictPairs();
    }
    return 0;
  }

  function compute(){
    var m=activeMapping();
    var summary=voiceSummary();
    var mode=engineMode();
    var wake=wakePhrase(summary,mode);
    var end=endPhrase();
    var output=outputMode();
    var conflicts=conflictCount();
    var mic=micStatus(summary);
    var ready=!!m&&!!(m.triggerKey||m.trigger_key)&&mode!=='off'&&mic.ok&&!conflicts;
    var target=targetLabel(m);
    var naturalLine=m&&(m.triggerKey||m.trigger_key)
      ?t('homeFlowNaturalWithTrigger',{key:triggerLabel(m),output:output.short,target:target})
      :t('homeFlowNaturalNoTrigger');
    return {
      ready:ready,
      mapping:m,
      schemeName:(m&&(m.label||m.group))||t('homeFlowSchemeDefault'),
      trigger:triggerLabel(m),
      target:target,
      engineMode:mode,
      engineLabel:engineLabel(mode),
      wakePhrase:wake,
      endPhrase:end,
      endLabel:end?t('homeFlowEndPhrase',{phrase:end}):t('homeFlowEndPause'),
      outputLabel:output.label,
      outputDetail:output.detail,
      scope:scopeLabel(m),
      mic:mic,
      conflictCount:conflicts,
      statusText:ready?t('homeFlowStatusReady'):(mode==='off'?t('homeFlowStatusVoiceOff'):(conflicts?t('homeFlowStatusConflict'):t('homeFlowStatusNeedSetup'))),
      naturalLine:naturalLine
    };
  }

  global.OneToneInputFlowSummary={compute:compute};
})((typeof window!=='undefined')?window:globalThis);
