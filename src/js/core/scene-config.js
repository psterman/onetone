(function(global){
  'use strict';

  function desiredEngine(cfg){
    const kws=!!((cfg.voiceKws||cfg.voice_kws||{}).enabled);
    const vosk=!!((cfg.voiceVosk||cfg.voice_vosk||{}).enabled);
    const sapi=!!((cfg.voiceSapi||cfg.voice_sapi||{}).enabled);
    if(kws&&!vosk&&!sapi) return 'kws';
    if(vosk) return 'vosk';
    if(sapi) return 'sapi';
    if(kws) return 'kws';
    return 'none';
  }

  function globalWakePhrases(cfg){
    const engine=desiredEngine(cfg);
    if(engine==='sapi') return cloneList((cfg.voiceSapi||cfg.voice_sapi||{}).phrases);
    if(engine==='kws') return cloneList((cfg.voiceKws||cfg.voice_kws||{}).phrases);
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

  function effectiveVoskModelPreset(cfg,mapping){
    var ov=mapping&&mapping.voiceOverride?mapping.voiceOverride:null;
    if(ov&&ov.modelPreset&&String(ov.modelPreset).trim()) return String(ov.modelPreset).trim();
    var vosk=cfg&&(cfg.voiceVosk||cfg.voice_vosk)||{};
    var global=String(vosk.modelPreset||'').trim();
    return global||'cn-light';
  }

  function isEnglishVoskPreset(preset){
    return String(preset||'').trim()==='en-light';
  }

  function defaultAppWakePhrases(appId,opts){
    if(global.OneToneAppVoicePresets&&global.OneToneAppVoicePresets.defaultAppWakePhrases){
      return global.OneToneAppVoicePresets.defaultAppWakePhrases(appId,opts);
    }
    return defaultSummonPhrase(appId,opts)?[defaultSummonPhrase(appId,opts)]:[];
  }

  function defaultAppEndPhrases(appId,opts){
    if(global.OneToneAppVoicePresets&&global.OneToneAppVoicePresets.defaultAppEndPhrases){
      return global.OneToneAppVoicePresets.defaultAppEndPhrases(appId,opts);
    }
    return {zh:[],en:[]};
  }

  function appWakePhrasesForRule(rule,mapping,opts){
    opts=opts||{};
    if(!rule) return [];
    var preset=opts.preset||effectiveVoskModelPreset(global.OneToneState&&global.OneToneState.state?global.OneToneState.state.config:{},mapping);
    var custom=String(rule.summonPhrase||'').trim();
    var out=[];
    if(custom) out.push(custom);
    defaultAppWakePhrases(rule.appId,{preset:preset,displayName:rule.displayName,rule:rule}).forEach(function(p){
      if(p&&out.indexOf(p)<0) out.push(p);
    });
    return out;
  }

  function defaultSummonPhrase(appId,opts){
    opts=opts||{};
    appId=String(appId||'').trim();
    var en=isEnglishVoskPreset(opts.preset);
    var display=String(opts.displayName||'').trim();
    if(appId==='custom'&&display){
      return en?('Open '+display):('打开'+display);
    }
    if(appId==='cursor-chat') return en?'Open Cursor':'打开 Cursor';
    if(appId==='codex-chat') return en?'Open Codex':'打开 Codex';
    if(appId==='claude-code') return en?'Open Claude':'打开 Claude';
    if(appId==='minimax-chat') return en?'Open MiniMax':'打开 MiniMax';
    return '';
  }

  function baseWakePhrases(cfg,mapping,ov){
    ov=ov!==undefined?ov:(mapping&&mapping.voiceOverride)||null;
    if(ov&&Array.isArray(ov.wakePhrases)&&ov.wakePhrases.length) return ov.wakePhrases.slice();
    return globalWakePhrases(cfg);
  }

  function summonPhrasesForMapping(mapping,opts){
    opts=opts||{};
    if(!mapping) return [];
    var preset=opts.preset||'cn-light';
    var out=[];
    var seen={};
    (Array.isArray(mapping.appBehaviorRules)?mapping.appBehaviorRules:[]).forEach(function(rule){
      if(!rule) return;
      appWakePhrasesForRule(rule,mapping,{preset:preset}).forEach(function(phrase){
        if(phrase&&!seen[phrase]){ seen[phrase]=true; out.push(phrase); }
      });
    });
    var primary=String(mapping.appTargetId||'').trim();
    if(primary){
      var hasRule=(mapping.appBehaviorRules||[]).some(function(r){ return r&&r.appId===primary; });
      if(!hasRule&&isWorkflowAppTarget(primary)){
        defaultAppWakePhrases(primary,{preset:preset}).forEach(function(phrase){
          if(phrase&&!seen[phrase]){ seen[phrase]=true; out.push(phrase); }
        });
      }
    }
    return out;
  }

  function mergeWakePhrases(cfg,mapping,ov){
    var preset=effectiveVoskModelPreset(cfg,mapping);
    var base=baseWakePhrases(cfg,mapping,ov);
    summonPhrasesForMapping(mapping,{preset:preset}).forEach(function(phrase){
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
    const preset=effectiveVoskModelPreset(config,mapping);
    let targetKey=globalVoiceTargetKey(config);
    if(ov&&ov.targetKey&&String(ov.targetKey).trim()) targetKey=String(ov.targetKey).trim();
    else if(isWorkflowAppTarget(mapping.appTargetId)) targetKey=globalVoiceTargetKey(config);
    const baseWake=baseWakePhrases(config,mapping,ov);
    const summon=summonPhrasesForMapping(mapping,{preset:preset});
    const wake=mergeWakePhrases(config,mapping,ov);
    const end=mergeEndPhrases(globalEndPhrases(config),ov&&ov.endPhrases?ov.endPhrases:null);
    return {
      sceneId:sceneId,
      targetKey:targetKey,
      baseWakePhrases:baseWake,
      summonPhrases:summon,
      wakePhrases:wake,
      endPhrases:end,
      modelPreset:preset,
      triggerKey:String(mapping.triggerKey||''),
      appTargetId:String(mapping.appTargetId||'')
    };
  }

  global.OneToneSceneConfig={
    desiredEngine:desiredEngine,
    resolveEffectiveScene:resolveEffectiveScene,
    globalWakePhrases:globalWakePhrases,
    globalEndPhrases:globalEndPhrases,
    globalVoiceTargetKey:globalVoiceTargetKey,
    baseWakePhrases:baseWakePhrases,
    effectiveVoskModelPreset:effectiveVoskModelPreset,
    defaultAppWakePhrases:defaultAppWakePhrases,
    defaultAppEndPhrases:defaultAppEndPhrases,
    appWakePhrasesForRule:appWakePhrasesForRule,
    defaultSummonPhrase:defaultSummonPhrase,
    summonPhrasesForMapping:summonPhrasesForMapping,
    appWakePhrasesForMapping:function(mapping,opts){
      opts=opts||{};
      if(!mapping) return [];
      var preset=opts.preset||'cn-light';
      var out=[];
      var seen={};
      (Array.isArray(mapping.appBehaviorRules)?mapping.appBehaviorRules:[]).forEach(function(rule){
        appWakePhrasesForRule(rule,mapping,{preset:preset}).forEach(function(phrase){
          if(phrase&&!seen[phrase]){ seen[phrase]=true; out.push(phrase); }
        });
      });
      var primary=String(mapping.appTargetId||'').trim();
      if(primary){
        var hasRule=(mapping.appBehaviorRules||[]).some(function(r){ return r&&r.appId===primary; });
        if(!hasRule&&isWorkflowAppTarget(primary)){
          defaultAppWakePhrases(primary,{preset:preset}).forEach(function(phrase){
            if(phrase&&!seen[phrase]){ seen[phrase]=true; out.push(phrase); }
          });
        }
      }
      return out;
    },
    isWorkflowAppTarget:isWorkflowAppTarget
  };
})((typeof window!=='undefined')?window:globalThis);
