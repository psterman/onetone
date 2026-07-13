(function(global){
  'use strict';

  function sceneCfg(){
    return global.OneToneSceneConfig;
  }

  function appRules(){
    return global.OneToneAppBehaviorRules;
  }

  function resolveAppName(appId,rule){
    if(rule&&String(rule.displayName||'').trim()) return String(rule.displayName).trim();
    var ab=appRules();
    if(ab&&ab.appDisplayName) return ab.appDisplayName(appId);
    if(ab&&rule&&ab.ruleDisplayName) return ab.ruleDisplayName(rule);
    return String(appId||'').trim();
  }

  function presetForMapping(mapping){
    var cfg=global.OneToneState&&global.OneToneState.state?global.OneToneState.state.config:{};
    var sc=sceneCfg();
    if(sc&&sc.effectiveVoskModelPreset&&mapping) return sc.effectiveVoskModelPreset(cfg,mapping);
    return 'cn-light';
  }

  function defaultAppWakePhrases(appId,opts){
    opts=opts||{};
    var sc=sceneCfg();
    var en=sc&&sc.isEnglishVoskPreset?sc.isEnglishVoskPreset(opts.preset):false;
    var name=resolveAppName(appId,opts.rule);
    if(!name) return [];
    if(en) return [name,'Open '+name];
    return [name+'旺','打开'+name];
  }

  function defaultAppEndPhrases(appId,opts){
    opts=opts||{};
    var sc=sceneCfg();
    var en=sc&&sc.isEnglishVoskPreset?sc.isEnglishVoskPreset(opts.preset):false;
    var name=resolveAppName(appId,opts.rule);
    if(!name) return {zh:[],en:[]};
    if(en) return {zh:[],en:[name+' done','end '+name]};
    return {zh:[name+'结束','结束'+name],en:[]};
  }

  function cloneList(arr){
    return Array.isArray(arr)?arr.map(function(s){ return String(s); }):[];
  }

  function mergeUniquePhrases(base,extra){
    base=cloneList(base);
    var seen={};
    base.forEach(function(p){ seen[p]=true; });
    (extra||[]).forEach(function(p){
      p=String(p||'').trim();
      if(p&&!seen[p]){ seen[p]=true; base.push(p); }
    });
    return base;
  }

  function mergeEndBundle(base,extra){
    base=base&&typeof base==='object'?base:{zh:[],en:[]};
    return {
      zh:mergeUniquePhrases(base.zh,extra&&extra.zh),
      en:mergeUniquePhrases(base.en,extra&&extra.en)
    };
  }

  function ensureVoiceOverride(mapping){
    if(!mapping) return null;
    if(!mapping.voiceOverride||typeof mapping.voiceOverride!=='object') mapping.voiceOverride={};
    return mapping.voiceOverride;
  }

  function syncAppVoicePresets(mapping,appId,rule){
    if(!mapping) return false;
    appId=String(appId||'').trim();
    if(!appId&&rule&&rule.appId) appId=String(rule.appId).trim();
    if(!appId) return false;
    var preset=presetForMapping(mapping);
    var wakes=defaultAppWakePhrases(appId,{preset:preset,rule:rule});
    var ends=defaultAppEndPhrases(appId,{preset:preset,rule:rule});
    var ov=ensureVoiceOverride(mapping);
    var linkId=rule&&String(rule.appId||'')==='custom'?String(rule.ruleId||'').trim():appId;
    if(!ov.appPhraseLinks||typeof ov.appPhraseLinks!=='object') ov.appPhraseLinks={};
    ov.appPhraseLinks[linkId]={
      wake:String((wakes&&wakes[0])||'').trim(),
      end:String((ends&&ends.zh&&ends.zh[0])||(ends&&ends.en&&ends.en[0])||'').trim(),
      wakes:cloneList(wakes),
      ends:{zh:cloneList(ends&&ends.zh),en:cloneList(ends&&ends.en)}
    };
    ov.primaryAppScopeId=appId;
    ov.endPhrases=mergeEndBundle(ov.endPhrases,ends);
    if(rule){
      if(!String(rule.summonPhrase||'').trim()&&wakes[0]) rule.summonPhrase=wakes[0];
    }else if(appRules()&&appRules().ruleForApp){
      var r=appRules().ruleForApp(mapping,appId);
      if(r&&!String(r.summonPhrase||'').trim()&&wakes[0]) r.summonPhrase=wakes[0];
    }
    mapping.updatedAt=Date.now();
    return true;
  }

  function syncRuleVoicePresets(mapping,rule){
    if(!mapping||!rule) return false;
    return syncAppVoicePresets(mapping,rule.appId==='custom'? 'custom':String(rule.appId||'').trim(),rule);
  }

  function hydrateGlobalWakeEndFromMapping(mapping){
    if(!mapping||!mapping.voiceOverride) return false;
    var ctx=global.OneToneVoiceSchemeContext;
    if(ctx&&ctx.hydrateGlobalFromOverride) return ctx.hydrateGlobalFromOverride(mapping);
    return false;
  }

  global.OneToneAppVoicePresets={
    defaultAppWakePhrases:defaultAppWakePhrases,
    defaultAppEndPhrases:defaultAppEndPhrases,
    syncAppVoicePresets:syncAppVoicePresets,
    syncRuleVoicePresets:syncRuleVoicePresets,
    hydrateGlobalWakeEndFromMapping:hydrateGlobalWakeEndFromMapping,
    mergeUniquePhrases:mergeUniquePhrases
  };
})((typeof window!=='undefined')?window:globalThis);
