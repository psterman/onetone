(function(global){
  'use strict';

  function state(){
    return global.OneToneState.state;
  }

  function ui(){
    return global.OneToneState.ui;
  }

  function sc(){
    return global.OneToneSceneConfig;
  }

  function core(){
    return global.OneToneMappingCore;
  }

  function cloneList(arr){
    return Array.isArray(arr)?arr.map(function(s){ return String(s); }):[];
  }

  function editingMapping(){
    var id=ui()&&ui().voiceEditSchemeId;
    if(id==null||id==='') return null;
    id=String(id).trim();
    if(!id||!core()||!core().byId) return null;
    var m=core().byId(id);
    return m||null;
  }

  function isVoiceOnly(m){
    var cfg=state().config||{};
    var hp=global.OneToneHabitProfile;
    if(!m||!hp) return false;
    if(!hp.hasVoiceParts(m,cfg)) return false;
    if(hp.hasKeyParts(m)) return false;
    return true;
  }

  function resolveEngine(cfg, ov){
    if(ov&&ov.engine){
      var eng=String(ov.engine).trim();
      if(eng==='vosk'||eng==='sapi'||eng==='kws') return eng;
    }
    if(sc()&&sc().desiredEngine) return sc().desiredEngine(cfg);
    return 'off';
  }

  function globalCancelPhrases(cfg){
    if(global.OneToneHabitOverrideDiff&&global.OneToneHabitOverrideDiff.globalCancelPhrases){
      return global.OneToneHabitOverrideDiff.globalCancelPhrases(cfg);
    }
    var end=cfg.voiceEnd||cfg.voice_end||{};
    return {
      zh:cloneList(end.cancelPhrasesZh||end.cancel_phrases_zh),
      en:cloneList(end.cancelPhrasesEn||end.cancel_phrases_en)
    };
  }

  function globalSendPhrases(cfg){
    if(global.OneToneHabitOverrideDiff&&global.OneToneHabitOverrideDiff.globalSendPhrases){
      return global.OneToneHabitOverrideDiff.globalSendPhrases(cfg);
    }
    var end=cfg.voiceEnd||cfg.voice_end||{};
    return {
      zh:cloneList(end.sendPhrasesZh||end.send_phrases_zh),
      en:cloneList(end.sendPhrasesEn||end.send_phrases_en)
    };
  }

  function snapshotFromGlobal(){
    var cfg=state().config||{};
    var scene=sc();
    var end=scene&&scene.globalEndPhrases?scene.globalEndPhrases(cfg):{zh:[],en:[]};
    var cancel=globalCancelPhrases(cfg);
    var send=globalSendPhrases(cfg);
    var wakeApi=global.OneToneVoiceWake;
    var mode=wakeApi&&wakeApi.currentMode?wakeApi.currentMode():'off';
    var vosk=cfg.voiceVosk||cfg.voice_vosk||{};
    var modelPreset=String(vosk.modelPreset||vosk.model_preset||'cn-light').trim()||'cn-light';
    var ov={
      targetKey:scene&&scene.globalVoiceTargetKey?scene.globalVoiceTargetKey(cfg):'RAlt',
      wakePhrases:scene&&scene.globalWakePhrases?cloneList(scene.globalWakePhrases(cfg)):[],
      endPhrases:{
        zh:cloneList(end.zh),
        en:cloneList(end.en)
      },
      cancelPhrases:{
        zh:cloneList(cancel.zh),
        en:cloneList(cancel.en)
      },
      sendPhrases:{
        zh:cloneList(send.zh),
        en:cloneList(send.en)
      }
    };
    if(mode==='vosk'||mode==='sapi'||mode==='kws') ov.engine=mode;
    if(mode==='vosk') ov.modelPreset=modelPreset;
    return ov;
  }

  function diffOverrideFromGlobal(edited,cfg){
    if(global.OneToneHabitOverrideDiff&&global.OneToneHabitOverrideDiff.normalizeVoiceOverrideForSave){
      return global.OneToneHabitOverrideDiff.normalizeVoiceOverrideForSave(edited,cfg);
    }
    return edited||{};
  }

  function ensureOverride(mapping){
    if(!mapping) return null;
    if(!mapping.voiceOverride||typeof mapping.voiceOverride!=='object'){
      mapping.voiceOverride={};
    }
    return mapping.voiceOverride;
  }

  function mirrorGlobalToOverride(mapping){
    mapping=mapping||editingMapping();
    if(!mapping||!isVoiceOnly(mapping)) return false;
    var ov=ensureOverride(mapping);
    var snap=snapshotFromGlobal();
    ov.targetKey=snap.targetKey;
    ov.wakePhrases=cloneList(snap.wakePhrases);
    ov.endPhrases={
      zh:cloneList(snap.endPhrases.zh),
      en:cloneList(snap.endPhrases.en)
    };
    ov.cancelPhrases={
      zh:cloneList(snap.cancelPhrases.zh),
      en:cloneList(snap.cancelPhrases.en)
    };
    ov.sendPhrases={
      zh:cloneList(snap.sendPhrases.zh),
      en:cloneList(snap.sendPhrases.en)
    };
    if(snap.engine) ov.engine=snap.engine;
    else delete ov.engine;
    if(snap.modelPreset) ov.modelPreset=snap.modelPreset;
    else delete ov.modelPreset;
    mapping.updatedAt=Date.now();
    return true;
  }

  function hydrateGlobalFromOverride(mapping){
    mapping=mapping||editingMapping();
    if(!mapping) return false;
    // Never write app-scenario overrides back into the shared global voice tables.
    if(global.OneToneHabitOverrideDiff
      &&global.OneToneHabitOverrideDiff.isAppScenarioMapping
      &&global.OneToneHabitOverrideDiff.isAppScenarioMapping(mapping)){
      if(global.OneToneVoiceWake&&global.OneToneVoiceWake.renderWakeCustomPhrases){
        global.OneToneVoiceWake.renderWakeCustomPhrases();
      }
      if(global.OneToneVoiceSettingsFlow&&global.OneToneVoiceSettingsFlow.scheduleVoiceSettingsRender){
        global.OneToneVoiceSettingsFlow.scheduleVoiceSettingsRender();
      }
      return false;
    }
    var cfg=state().config||{};
    var scene=sc();
    if(!scene) return false;
    var ov=mapping.voiceOverride||null;
    let hasEndOverride=!!(ov&&ov.endPhrases!=null&&typeof ov.endPhrases==='object'&&(
      (Array.isArray(ov.endPhrases.zh)&&ov.endPhrases.zh.length)||
      (Array.isArray(ov.endPhrases.en)&&ov.endPhrases.en.length)
    ));
    var hasOverride=!!(ov&&(
      (Array.isArray(ov.wakePhrases)&&ov.wakePhrases.length)||
      hasEndOverride
    ));
    var hasAppScope=!!String(mapping.appTargetId||'').trim();
    if(!hasOverride&&!isVoiceOnly(mapping)&&!hasAppScope) return false;
    if(!hasOverride&&hasAppScope){
      if(global.OneToneVoiceWake&&global.OneToneVoiceWake.renderWakeCustomPhrases){
        global.OneToneVoiceWake.renderWakeCustomPhrases();
      }
      if(global.OneToneVoiceSettingsFlow&&global.OneToneVoiceSettingsFlow.scheduleVoiceSettingsRender){
        global.OneToneVoiceSettingsFlow.scheduleVoiceSettingsRender();
      }
      return true;
    }
    var mode=resolveEngine(cfg,ov);
    var wake=ov&&Array.isArray(ov.wakePhrases)&&ov.wakePhrases.length
      ?cloneList(ov.wakePhrases)
      :cloneList(scene.globalWakePhrases(cfg));
    var globalEnd=scene.globalEndPhrases(cfg)||{zh:[],en:[]};
    var endZh=ov&&ov.endPhrases&&Array.isArray(ov.endPhrases.zh)&&ov.endPhrases.zh.length
      ?cloneList(ov.endPhrases.zh)
      :cloneList(globalEnd.zh||[]);
    var endEn=ov&&ov.endPhrases&&Array.isArray(ov.endPhrases.en)&&ov.endPhrases.en.length
      ?cloneList(ov.endPhrases.en)
      :cloneList(globalEnd.en||[]);
    var globalCancel=globalCancelPhrases(cfg);
    var cancelZh=ov&&ov.cancelPhrases&&Array.isArray(ov.cancelPhrases.zh)&&ov.cancelPhrases.zh.length
      ?cloneList(ov.cancelPhrases.zh)
      :cloneList(globalCancel.zh||[]);
    var cancelEn=ov&&ov.cancelPhrases&&Array.isArray(ov.cancelPhrases.en)&&ov.cancelPhrases.en.length
      ?cloneList(ov.cancelPhrases.en)
      :cloneList(globalCancel.en||[]);
    var globalSend=globalSendPhrases(cfg);
    var sendZh=ov&&ov.sendPhrases&&Array.isArray(ov.sendPhrases.zh)&&ov.sendPhrases.zh.length
      ?cloneList(ov.sendPhrases.zh)
      :cloneList(globalSend.zh||[]);
    var sendEn=ov&&ov.sendPhrases&&Array.isArray(ov.sendPhrases.en)&&ov.sendPhrases.en.length
      ?cloneList(ov.sendPhrases.en)
      :cloneList(globalSend.en||[]);

    if(mode==='sapi'){
      var sapi=cfg.voiceSapi||cfg.voice_sapi||(cfg.voiceSapi={});
      cfg.voiceSapi=sapi;
      sapi.phrases=wake;
    }else if(mode==='kws'){
      var kws=cfg.voiceKws||cfg.voice_kws||(cfg.voiceKws={});
      cfg.voiceKws=kws;
      kws.phrases=wake;
    }else if(mode==='vosk'){
      var vosk=cfg.voiceVosk||cfg.voice_vosk||(cfg.voiceVosk={});
      cfg.voiceVosk=vosk;
      vosk.phrases=wake;
      if(ov&&ov.modelPreset) vosk.modelPreset=String(ov.modelPreset).trim()||vosk.modelPreset;
    }

    var endCfg=cfg.voiceEnd||cfg.voice_end||(cfg.voiceEnd={});
    cfg.voiceEnd=endCfg;
    endCfg.phrasesZh=endZh;
    endCfg.phrasesEn=endEn;
    endCfg.cancelPhrasesZh=cancelZh;
    endCfg.cancelPhrasesEn=cancelEn;
    endCfg.sendPhrasesZh=sendZh;
    endCfg.sendPhrasesEn=sendEn;
    if(ov&&ov.targetKey&&String(ov.targetKey).trim()){
      var key=String(ov.targetKey).trim();
      if(cfg.voiceSapi||cfg.voice_sapi) (cfg.voiceSapi||cfg.voice_sapi).targetKey=key;
      if(cfg.voiceVosk||cfg.voice_vosk) (cfg.voiceVosk||cfg.voice_vosk).targetKey=key;
      if(cfg.voiceKws||cfg.voice_kws) (cfg.voiceKws||cfg.voice_kws).targetKey=key;
      endCfg.targetKey=key;
    }

    var wakeApi=global.OneToneVoiceWake;
    if(wakeApi){
      if(mode==='sapi'&&wakeApi.syncSapiPresets) wakeApi.syncSapiPresets(wake);
      else if(mode==='vosk'&&wakeApi.syncVoskPresets) wakeApi.syncVoskPresets(wake);
      else if(mode==='kws'&&wakeApi.renderWakePhraseTags) wakeApi.renderWakePhraseTags();
      if(wakeApi.syncEngineTabButtons&&wakeApi.currentMode){
        wakeApi.syncEngineTabButtons(wakeApi.currentMode(),false);
      }
    }
    var endApi=global.OneToneVoiceEnd;
    if(endApi&&endApi.syncPresets) endApi.syncPresets(endZh,endEn);
    if(endApi&&endApi.syncCancelPresets) endApi.syncCancelPresets(cancelZh,cancelEn);
    if(endApi&&endApi.syncSendPresets) endApi.syncSendPresets(sendZh,sendEn);
    if(global.OneToneVoiceSettingsFlow&&global.OneToneVoiceSettingsFlow.scheduleVoiceSettingsRender){
      global.OneToneVoiceSettingsFlow.scheduleVoiceSettingsRender();
    }
    return true;
  }

  function activateEditingScheme(){
    var mapping=editingMapping();
    if(!mapping) return false;
    return hydrateGlobalFromOverride(mapping);
  }

  global.OneToneVoiceSchemeContext={
    editingMapping:editingMapping,
    isVoiceOnly:isVoiceOnly,
    snapshotFromGlobal:snapshotFromGlobal,
    diffOverrideFromGlobal:diffOverrideFromGlobal,
    mirrorGlobalToOverride:mirrorGlobalToOverride,
    hydrateGlobalFromOverride:hydrateGlobalFromOverride,
    activateEditingScheme:activateEditingScheme
  };
})((typeof window!=='undefined')?window:globalThis);
