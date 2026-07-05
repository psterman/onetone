(function(global){
  'use strict';

  function desiredEngine(cfg){
    const vosk=!!((cfg.voiceVosk||cfg.voice_vosk||{}).enabled);
    const sapi=!!((cfg.voiceSapi||cfg.voice_sapi||{}).enabled);
    if(vosk) return 'vosk';
    if(sapi) return 'sapi';
    return 'none';
  }

  function globalWakePhrases(cfg){
    const engine=desiredEngine(cfg);
    if(engine==='sapi') return cloneList((cfg.voiceSapi||cfg.voice_sapi||{}).phrases);
    return cloneList((cfg.voiceVosk||cfg.voice_vosk||{}).phrases);
  }

  function globalEndPhrases(cfg){
    const end=cfg.voiceEnd||cfg.voice_end||{};
    return {
      zh:cloneList(end.phrasesZh||end.phrases_zh),
      en:cloneList(end.phrasesEn||end.phrases_en)
    };
  }

  function globalVoiceTargetKey(cfg){
    const vosk=cfg.voiceVosk||cfg.voice_vosk||{};
    const sapi=cfg.voiceSapi||cfg.voice_sapi||{};
    const end=cfg.voiceEnd||cfg.voice_end||{};
    const voskKey=String(vosk.targetKey||'').trim();
    const sapiKey=String(sapi.targetKey||'').trim();
    if(vosk.enabled&&voskKey) return voskKey;
    if(sapi.enabled&&sapiKey) return sapiKey;
    if(voskKey) return voskKey;
    if(sapiKey) return sapiKey;
    const endKey=String(end.targetKey||end.target_key||'').trim();
    return endKey||'RAlt';
  }

  function isWorkflowAppTarget(id){
    const t=String(id||'').trim();
    return t==='cursor-chat'||t==='codex-chat'||t==='minimax-chat';
  }

  function cloneList(arr){
    return Array.isArray(arr)?arr.map(function(s){return String(s);}):[];
  }

  function mergeEndPhrases(global, overrideBundle){
    if(!overrideBundle) return {zh:global.zh.slice(),en:global.en.slice()};
    return {
      zh:overrideBundle.zh&&overrideBundle.zh.length?overrideBundle.zh.slice():global.zh.slice(),
      en:overrideBundle.en&&overrideBundle.en.length?overrideBundle.en.slice():global.en.slice()
    };
  }

  function resolveEffectiveScene(config, opts){
    opts=opts||{};
    const sceneId=String(opts.activeSceneId||config.activeSceneId||'').trim();
    if(!sceneId||!Array.isArray(config.mappings)) return null;
    const mapping=config.mappings.find(function(m){return m.id===sceneId;});
    if(!mapping) return null;
    const ov=mapping.voiceOverride||null;
    let targetKey=globalVoiceTargetKey(config);
    if(ov&&ov.targetKey&&String(ov.targetKey).trim()) targetKey=String(ov.targetKey).trim();
    else if(isWorkflowAppTarget(mapping.appTargetId)) targetKey=globalVoiceTargetKey(config);
    const wake=ov&&Array.isArray(ov.wakePhrases)&&ov.wakePhrases.length?ov.wakePhrases.slice():globalWakePhrases(config);
    const end=mergeEndPhrases(globalEndPhrases(config),ov&&ov.endPhrases?ov.endPhrases:null);
    return {
      sceneId:sceneId,
      targetKey:targetKey,
      wakePhrases:wake,
      endPhrases:end,
      triggerKey:String(mapping.triggerKey||''),
      appTargetId:String(mapping.appTargetId||'')
    };
  }

  global.OneToneSceneConfig={
    resolveEffectiveScene:resolveEffectiveScene,
    globalWakePhrases:globalWakePhrases,
    globalEndPhrases:globalEndPhrases,
    globalVoiceTargetKey:globalVoiceTargetKey
  };
})((typeof window!=='undefined')?window:globalThis);
