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
    return t==='cursor-chat'||t==='codex-chat'||t==='claude-code'||t==='minimax-chat';
  }

  function cloneList(arr){
    return Array.isArray(arr)?arr.map(function(s){return String(s);}):[];
  }

  function defaultSummonPhrase(appId){
    appId=String(appId||'').trim();
    if(appId==='cursor-chat') return '打开 Cursor';
    if(appId==='codex-chat') return '打开 Codex';
    if(appId==='claude-code') return '打开 Claude';
    if(appId==='minimax-chat') return '打开 MiniMax';
    return '';
  }

  function summonPhrasesForMapping(mapping){
    if(!mapping) return [];
    var out=[];
    var seen={};
    (Array.isArray(mapping.appBehaviorRules)?mapping.appBehaviorRules:[]).forEach(function(rule){
      if(!rule||!rule.appId) return;
      var phrase=String(rule.summonPhrase||'').trim()||defaultSummonPhrase(rule.appId);
      if(phrase&&!seen[phrase]){ seen[phrase]=true; out.push(phrase); }
    });
    var primary=String(mapping.appTargetId||'').trim();
    if(primary){
      var hasRule=(mapping.appBehaviorRules||[]).some(function(r){ return r&&r.appId===primary; });
      if(!hasRule){
        var fallback=defaultSummonPhrase(primary);
        if(fallback&&!seen[fallback]) out.push(fallback);
      }
    }
    return out;
  }

  function mergeWakePhrases(cfg,mapping,ov){
    var base=ov&&Array.isArray(ov.wakePhrases)&&ov.wakePhrases.length
      ?ov.wakePhrases.slice()
      :globalWakePhrases(cfg);
    summonPhrasesForMapping(mapping).forEach(function(phrase){
      if(phrase&&base.indexOf(phrase)<0) base.push(phrase);
    });
    return base;
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
    const wake=mergeWakePhrases(config,mapping,ov);
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
    globalVoiceTargetKey:globalVoiceTargetKey,
    summonPhrasesForMapping:summonPhrasesForMapping
  };
})((typeof window!=='undefined')?window:globalThis);
