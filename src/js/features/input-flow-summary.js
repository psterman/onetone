(function(global){
  'use strict';

  function t(key){
    return global.OneToneI18n&&global.OneToneI18n.t?global.OneToneI18n.t(key):key;
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
    if(mode==='vosk') return '本地离线识别';
    if(mode==='sapi') return 'Windows 系统识别';
    return '未启用';
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
    if(end.autoSendEnabled||end.auto_send_enabled){
      return {mode:'auto',label:'自动发送',detail:'静音后用 '+friendlyKey(end.commitKey||end.commit_key||'Enter')+' 发送'};
    }
    return {mode:'confirm',label:'确认后发送',detail:friendlyKey(end.commitKey||end.commit_key||'Enter')};
  }

  function scopeLabel(m){
    if(!m) return '不限应用';
    var app=m.appTargetId||m.app_target_id||'';
    var rules=Array.isArray(m.appBehaviorRules||m.app_behavior_rules)?(m.appBehaviorRules||m.app_behavior_rules):[];
    var ids=[];
    if(app) ids.push(app);
    rules.forEach(function(r){ var id=r&&String(r.appId||r.app_id||''); if(id&&ids.indexOf(id)<0) ids.push(id); });
    if(!ids.length) return '不限应用';
    if(ids.length===1){
      var presets=global.OneToneAppTargetPresets&&global.OneToneAppTargetPresets.presets?global.OneToneAppTargetPresets.presets:[];
      var p=presets.find(function(x){ return x&&x.id===ids[0]; });
      return p?(p.name||p.label||ids[0]):ids[0];
    }
    return ids.length+' 个应用';
  }

  function micStatus(summary){
    var devices=global.OneToneAppMic&&global.OneToneAppMic.devices?global.OneToneAppMic.devices():[];
    var label=summary&&summary.micLabel||'默认麦克风';
    var ok=!!devices.length||!!label;
    return {label:label,state:ok?'正常':'需要检查',ok:ok};
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
    return {
      ready:ready,
      mapping:m,
      schemeName:(m&&(m.label||m.group))||'默认方案',
      trigger:triggerLabel(m),
      target:target,
      engineMode:mode,
      engineLabel:engineLabel(mode),
      wakePhrase:wake,
      endPhrase:end,
      endLabel:end?'说「'+end+'」或停顿后结束':'停顿后结束',
      outputLabel:output.label,
      outputDetail:output.detail,
      scope:scopeLabel(m),
      mic:mic,
      conflictCount:conflicts,
      statusText:ready?'当前可用':(mode==='off'?'语音识别未启用':(conflicts?'快捷键需要检查':'需要检查')),
      naturalLine:(m&&m.triggerKey?'按「'+triggerLabel(m)+'」开始输入':'设置启动键后开始输入')
        +'，使用'+engineLabel(mode)+'，'+output.label+'到 '+target
    };
  }

  global.OneToneInputFlowSummary={compute:compute};
})((typeof window!=='undefined')?window:globalThis);
