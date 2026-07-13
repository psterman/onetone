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

  function snapshotFromGlobal(){
    var cfg=state().config||{};
    var scene=sc();
    var end=scene&&scene.globalEndPhrases?scene.globalEndPhrases(cfg):{zh:[],en:[]};
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
      }
    };
    if(mode==='vosk'||mode==='sapi'||mode==='kws') ov.engine=mode;
    if(mode==='vosk') ov.modelPreset=modelPreset;
    return ov;
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
    if(snap.engine) ov.engine=snap.engine;
    else delete ov.engine;
    if(snap.modelPreset) ov.modelPreset=snap.modelPreset;
    else delete ov.modelPreset;
    mapping.updatedAt=Date.now();
    return true;
  }

  function hydrateGlobalFromOverride(mapping){
    mapping=mapping||editingMapping();
    if(!mapping||!isVoiceOnly(mapping)) return false;
    var cfg=state().config||{};
    var scene=sc();
    if(!scene) return false;
    var ov=mapping.voiceOverride||null;
    var mode=resolveEngine(cfg,ov);
    var wake=ov&&Array.isArray(ov.wakePhrases)&&ov.wakePhrases.length
      ?cloneList(ov.wakePhrases)
      :cloneList(scene.globalWakePhrases(cfg));
    var globalEnd=scene.globalEndPhrases(cfg);
    var endZh=ov&&ov.endPhrases&&Array.isArray(ov.endPhrases.zh)&&ov.endPhrases.zh.length
      ?cloneList(ov.endPhrases.zh)
      :cloneList(globalEnd.zh);
    var endEn=ov&&ov.endPhrases&&Array.isArray(ov.endPhrases.en)&&ov.endPhrases.en.length
      ?cloneList(ov.endPhrases.en)
      :cloneList(globalEnd.en);

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
    mirrorGlobalToOverride:mirrorGlobalToOverride,
    hydrateGlobalFromOverride:hydrateGlobalFromOverride,
    activateEditingScheme:activateEditingScheme
  };
})((typeof window!=='undefined')?window:globalThis);
