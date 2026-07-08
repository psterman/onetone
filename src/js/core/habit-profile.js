(function(global){
  'use strict';

  function sceneCfg(){
    return global.OneToneSceneConfig;
  }

  function mappingCore(){
    return global.OneToneMappingCore;
  }

  function habitDisplayName(m){
    if(!m) return '—';
    if((m.group||'').trim()) return m.group.trim();
    if(global.OneToneHomeScheme&&global.OneToneHomeScheme.shortName) return global.OneToneHomeScheme.shortName(m);
    if((m.label||'').trim()) return m.label.trim();
    return m.id||'—';
  }

  function hasKeyParts(m){
    if(!m) return false;
    var core=mappingCore();
    var trig=core&&core.editorTrigger?core.editorTrigger(m):String(m.triggerKey||'').trim();
    var tgt=core&&core.editorTarget?core.editorTarget(m):String(m.targetKey||'').trim();
    return !!(trig||tgt);
  }

  function hasVoiceParts(m,cfg){
    if(!m) return false;
    if(!hasVoiceParts._guard) hasVoiceParts._guard=new Set();
    var gid=String(m.id||'');
    if(gid && hasVoiceParts._guard.has(gid)) return false;
    if(gid) hasVoiceParts._guard.add(gid);
    try{
      var ov=m.voiceOverride;
      if(ov){
        if(Array.isArray(ov.wakePhrases)&&ov.wakePhrases.length) return true;
        if(ov.endPhrases&&(ov.endPhrases.zh&&ov.endPhrases.zh.length||ov.endPhrases.en&&ov.endPhrases.en.length)) return true;
        if(ov.targetKey&&String(ov.targetKey).trim()) return true;
        if(ov.engine&&String(ov.engine).trim()) return true;
        if(ov.modelPreset&&String(ov.modelPreset).trim()) return true;
      }
      var sc=sceneCfg();
      if(!cfg||!sc) return false;
      var eff=sc.resolveEffectiveScene(cfg,{activeSceneId:m.id});
      if(!eff) return false;
      var globalWake=sc.globalWakePhrases(cfg);
      var globalEnd=sc.globalEndPhrases(cfg);
      var wakeDiff=JSON.stringify(eff.wakePhrases||[])!==JSON.stringify(globalWake||[]);
      var endDiff=JSON.stringify(eff.endPhrases||{})!==JSON.stringify(globalEnd||{});
      return wakeDiff||endDiff;
    }finally{
      if(gid) hasVoiceParts._guard.delete(gid);
    }
  }

  function configuredAppIds(m){
    var ids=[];
    if(!m) return ids;
    if(Array.isArray(m.appBehaviorRules)){
      m.appBehaviorRules.forEach(function(r){
        if(r&&r.appId&&ids.indexOf(r.appId)<0) ids.push(r.appId);
      });
    }
    if(m.appTargetId&&ids.indexOf(m.appTargetId)<0) ids.push(String(m.appTargetId));
    return ids;
  }

  function hasAppParts(m){
    return configuredAppIds(m).length>0;
  }

  function habitType(m,cfg){
    var key=hasKeyParts(m);
    var voice=hasVoiceParts(m,cfg);
    var app=hasAppParts(m);
    var n=(key?1:0)+(voice?1:0)+(app?1:0);
    if(n>=2) return 'combo';
    if(app) return 'app';
    if(voice) return 'voice';
    return 'keys';
  }

  function isLibraryHabit(m,cfg){
    if(!m) return false;
    var core=mappingCore();
    if(core&&core.isSaved&&core.isSaved(m)) return true;
    return hasVoiceParts(m,cfg)||hasAppParts(m);
  }

  function project(m,cfg){
    cfg=cfg||{};
    if(!m) return null;
    var sc=sceneCfg();
    var eff=sc?sc.resolveEffectiveScene(cfg,{activeSceneId:m.id}):null;
    var activeId=String(cfg.activeSceneId||'').trim();
    var core=mappingCore();
    return {
      id:String(m.id||''),
      mapping:m,
      name:habitDisplayName(m),
      order:Number(m.order||0),
      triggerKey:String(m.triggerKey||''),
      targetKey:String(m.targetKey||''),
      triggerMode:m.triggerMode||'tap',
      keyEnabled:!!m.enabled,
      isActive:!!(activeId&&m.id===activeId),
      isComplete:isLibraryHabit(m,cfg),
      habitType:habitType(m,cfg),
      effectiveTargetKey:eff?String(eff.targetKey||''):'',
      baseWakePhrases:eff&&Array.isArray(eff.baseWakePhrases)?eff.baseWakePhrases.slice():[],
      summonPhrases:eff&&Array.isArray(eff.summonPhrases)?eff.summonPhrases.slice():[],
      effectiveWakePhrases:eff&&Array.isArray(eff.wakePhrases)?eff.wakePhrases.slice():[],
      effectiveEndPhrases:eff&&eff.endPhrases?{
        zh:Array.isArray(eff.endPhrases.zh)?eff.endPhrases.zh.slice():[],
        en:Array.isArray(eff.endPhrases.en)?eff.endPhrases.en.slice():[]
      }:{zh:[],en:[]},
      appTargetId:String(m.appTargetId||'')
    };
  }

  function projectAll(cfg){
    cfg=cfg||{};
    if(!Array.isArray(cfg.mappings)) return [];
    return cfg.mappings.map(function(m){ return project(m,cfg); }).filter(Boolean).sort(function(a,b){
      return (a.order||0)-(b.order||0);
    });
  }

  function projectActive(cfg){
    cfg=cfg||{};
    var activeId=String(cfg.activeSceneId||'').trim();
    if(!activeId||!Array.isArray(cfg.mappings)) return null;
    var m=cfg.mappings.find(function(x){ return x.id===activeId; });
    return m?project(m,cfg):null;
  }

  function reconcileWithSceneConfig(cfg){
    cfg=cfg||{};
    var sc=sceneCfg();
    var errors=[];
    var activeId=String(cfg.activeSceneId||'').trim();
    var active=projectActive(cfg);
    if(activeId){
      if(!active) errors.push('projectActive:null');
      else if(active.id!==activeId) errors.push('activeId:'+active.id+'!=='+activeId);
    }
    if(!sc||!sc.resolveEffectiveScene) return {ok:false,errors:errors.concat(['sceneConfig:missing'])};
    if(!Array.isArray(cfg.mappings)) return {ok:!errors.length,errors:errors};
    cfg.mappings.forEach(function(m){
      var p=project(m,cfg);
      var eff=sc.resolveEffectiveScene(cfg,{activeSceneId:m.id});
      if(!p){
        errors.push('project:'+m.id);
        return;
      }
      if(!eff){
        errors.push('effective:'+m.id);
        return;
      }
      if(String(p.effectiveTargetKey||'')!==String(eff.targetKey||'')){
        errors.push('targetKey:'+m.id);
      }
      if(JSON.stringify(p.effectiveWakePhrases||[])!==JSON.stringify(eff.wakePhrases||[])){
        errors.push('wakePhrases:'+m.id);
      }
      if(JSON.stringify(p.effectiveEndPhrases||{})!==JSON.stringify(eff.endPhrases||{})){
        errors.push('endPhrases:'+m.id);
      }
      if(!!p.keyEnabled!==!!m.enabled) errors.push('keyEnabled:'+m.id);
      if(!!p.isActive!==(m.id===activeId)) errors.push('isActive:'+m.id);
    });
    return {ok:!errors.length,errors:errors};
  }

  global.OneToneHabitProfile={
    project:project,
    projectAll:projectAll,
    projectActive:projectActive,
    habitType:habitType,
    habitDisplayName:habitDisplayName,
    isLibraryHabit:isLibraryHabit,
    hasKeyParts:hasKeyParts,
    hasVoiceParts:hasVoiceParts,
    hasAppParts:hasAppParts,
    configuredAppIds:configuredAppIds,
    reconcileWithSceneConfig:reconcileWithSceneConfig
  };
})((typeof window!=='undefined')?window:globalThis);
