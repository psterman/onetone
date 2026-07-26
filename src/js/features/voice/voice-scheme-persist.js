(function(global){
  'use strict';
  var t=function(key){ return global.OneToneI18n.t(key); };

  function state(){
    return global.OneToneState.state;
  }

  function ui(){
    return global.OneToneState.ui;
  }

  function core(){
    return global.OneToneMappingCore;
  }

  function hp(){
    return global.OneToneHabitProfile;
  }

  function cloneVoiceOverride(ov){
    return JSON.parse(JSON.stringify(ov||{}));
  }

  function isVoiceOnly(m){
    if(!m||!hp()) return false;
    var cfg=state().config||{};
    if(!hp().hasVoiceParts(m,cfg)) return false;
    if(hp().hasKeyParts(m)) return false;
    return true;
  }

  function snapshotVoiceOverride(){
    if(global.OneToneVoiceSchemeContext&&global.OneToneVoiceSchemeContext.snapshotFromGlobal){
      return cloneVoiceOverride(global.OneToneVoiceSchemeContext.snapshotFromGlobal());
    }
    var hub=global.OneToneHabitHub;
    if(hub&&hub.snapshotVoiceOverride) return cloneVoiceOverride(hub.snapshotVoiceOverride());
    return {};
  }

  function mirrorSavedScheme(mapping){
    if(global.OneToneVoiceSchemeContext&&global.OneToneVoiceSchemeContext.mirrorGlobalToOverride){
      global.OneToneVoiceSchemeContext.mirrorGlobalToOverride(mapping);
    }
  }

  function defaultVoiceHabitName(ov){
    var hub=global.OneToneHabitHub;
    if(hub&&hub.defaultVoiceHabitName) return hub.defaultVoiceHabitName(ov);
    return t('habitHubVoiceDefaultNameFallback');
  }

  var GLOBAL_SCHEME_ID='__global__';

  function voiceEditSchemeId(){
    var sentinel=ui()&&ui().voiceEditSchemeId;
    if(sentinel===GLOBAL_SCHEME_ID) return null;
    var sel=String(state().selectedMappingId||'').trim();
    if(sel) return sel;
    sentinel=sentinel==null?'':String(sentinel).trim();
    if(sentinel&&sentinel!==GLOBAL_SCHEME_ID) return sentinel;
    return null;
  }

  function inferVoiceEditTargetId(){
    return voiceEditSchemeId();
  }

  function resolveSaveTargetId(opts){
    opts=opts||{};
    if(opts.forceCreate) return null;
    return voiceEditSchemeId();
  }

  function resolveSaveTargetMapping(opts){
    var id=resolveSaveTargetId(opts);
    if(!id||!core()||!core().byId) return null;
    return core().byId(id)||null;
  }

  function normalizeOverrideForSave(rawOv,cfg){
    if(global.OneToneVoiceSchemeContext&&global.OneToneVoiceSchemeContext.diffOverrideFromGlobal){
      return global.OneToneVoiceSchemeContext.diffOverrideFromGlobal(rawOv,cfg);
    }
    if(global.OneToneHabitOverrideDiff&&global.OneToneHabitOverrideDiff.normalizeVoiceOverrideForSave){
      return global.OneToneHabitOverrideDiff.normalizeVoiceOverrideForSave(rawOv,cfg);
    }
    return cloneVoiceOverride(rawOv);
  }

  function applySparseVoiceOverride(mapping,sparse){
    if(!mapping) return;
    var diff=global.OneToneHabitOverrideDiff;
    if(diff&&diff.isEmptyOverride&&diff.isEmptyOverride(sparse)){
      mapping.voiceOverride=null;
      return;
    }
    if(!sparse||!Object.keys(sparse).length){
      mapping.voiceOverride=null;
      return;
    }
    mapping.voiceOverride=cloneVoiceOverride(sparse);
  }

  function createVoiceDraft(opts){
    opts=opts||{};
    if(!core()) return null;
    core().ensureConfig&&core().ensureConfig();
    var name=opts.name;
    if(name===undefined) name=t('voiceSchemeDraftName');
    name=String(name||'').trim()||t('voiceSchemeDraftName');
    var m=createVoiceMappingShell(name,{engine:'off'});
    if(!m) return null;
    ui().voiceEditSchemeId=m.id;
    state().selectedMappingId=m.id;
    persistConfig();
    refreshVoiceSchemeSurfaces();
    return m;
  }

  function resolveVoiceEditMapping(){
    var id=inferVoiceEditTargetId();
    if(!id||!core()||!core().byId) return null;
    var m=core().byId(id);
    if(!m||!isVoiceOnly(m)){
      if(String(ui().voiceEditSchemeId||'')===id) ui().voiceEditSchemeId=GLOBAL_SCHEME_ID;
      if(String(state().selectedMappingId||'')===id) state().selectedMappingId=null;
      return null;
    }
    return m;
  }

  function persistConfig(){
    if(global.OneToneConfigPersist&&global.OneToneConfigPersist.saveAsync){
      return global.OneToneConfigPersist.saveAsync();
    }
    if(global.OneToneConfigPersist&&global.OneToneConfigPersist.save){
      global.OneToneConfigPersist.save();
    }
    return Promise.resolve(false);
  }

  function refreshVoiceSchemeSurfaces(){
    requestAnimationFrame(function(){
      try{
        if(global.OneToneVoiceSchemesUi&&global.OneToneVoiceSchemesUi.render){
          global.OneToneVoiceSchemesUi.render();
        }
        if(global.OneToneSceneModeHub&&global.OneToneSceneModeHub.render){
          global.OneToneSceneModeHub.render();
        }
        if(global.OneToneHabitHub&&global.OneToneHabitHub.render){
          global.OneToneHabitHub.render();
        }
        if(global.OneToneVoiceSettingsFlow&&global.OneToneVoiceSettingsFlow.scheduleVoiceSettingsRender){
          global.OneToneVoiceSettingsFlow.scheduleVoiceSettingsRender();
        }
        if(global.OneToneAppBehaviorRules&&global.OneToneAppBehaviorRules.render){
          global.OneToneAppBehaviorRules.render();
        }
      }catch(err){
        console.error('refreshVoiceSchemeSurfaces',err);
      }
    });
  }

  function touchUpdated(m){
    if(global.OneToneHabitHub&&global.OneToneHabitHub.touchUpdated){
      global.OneToneHabitHub.touchUpdated(m);
    }else if(m){
      m.updatedAt=Date.now();
    }
  }

  function showSavedToast(updated){
    var msg=t(updated?'voiceSchemeSaveUpdated':'voiceSchemeSavedToHub');
    if(global.OneToneAppToast) global.OneToneAppToast.show(msg,'scheme');
    else if(global.OneToneApp&&global.OneToneApp.toast) global.OneToneApp.toast(msg);
  }

  function cloneAppBehaviorRules(rules){
    return JSON.parse(JSON.stringify(Array.isArray(rules)?rules:[]));
  }

  function snapshotAppScope(){
    var m=resolveMappingForAppScope();
    if(!m) return {appTargetId:'',appBehaviorRules:[]};
    return {
      appTargetId:String(m.appTargetId||'').trim(),
      appBehaviorRules:cloneAppBehaviorRules(m.appBehaviorRules)
    };
  }

  function applyAppScopeToMapping(m,scope){
    if(!m||!scope) return;
    m.appTargetId=String(scope.appTargetId||'').trim();
    m.appBehaviorRules=cloneAppBehaviorRules(scope.appBehaviorRules);
  }

  function createVoiceMappingShell(name,ov,scope){
    if(!core()) return null;
    core().ensureConfig&&core().ensureConfig();
    var cfg=state().config;
    var id=core().newMappingId?core().newMappingId():('m-'+Date.now()+'-'+Math.random().toString(36).slice(2,7));
    scope=scope||{appTargetId:'',appBehaviorRules:[]};
    var m={
      id:id,
      label:'',
      group:String(name||'').trim()||t('habitHubVoiceDefaultNameFallback'),
      triggerKey:'',
      targetKey:'',
      enabled:false,
      order:Array.isArray(cfg.mappings)?cfg.mappings.length:0,
      triggerMode:'tap',
      intervalMs:cfg.intervalMs||1200,
      enterDelayMs:cfg.enterDelayMs||5000,
      cancelEnabled:cfg.cancelEnabled!==false,
      autoEnterEnabled:cfg.autoEnterEnabled!==false,
      switchKeys:[],
      nativeKeyRestore:false,
      imePresetId:'',
      appTargetId:String(scope.appTargetId||'').trim(),
      appBehaviorRules:cloneAppBehaviorRules(scope.appBehaviorRules),
      voiceOverride:cloneVoiceOverride(ov),
      updatedAt:Date.now(),
      lastUsedAt:0,
      useCount:0
    };
    if(core().ensureMappingExtras) core().ensureMappingExtras(m);
    cfg.mappings=Array.isArray(cfg.mappings)?cfg.mappings:[];
    cfg.mappings.push(m);
    return m;
  }

  function resolveVoiceSchemeName(opts, defaultName){
    if(opts.name!==undefined) return Promise.resolve(String(opts.name||'').trim()||defaultName);
    var modal=global.OneToneVoiceSchemeNameModal;
    if(modal&&typeof modal.open==='function'){
      return modal.open(t('habitHubVoiceNamePrompt'),defaultName);
    }
    if(typeof window.prompt!=='function') return Promise.resolve(defaultName);
    var prompted=window.prompt(t('habitHubVoiceNamePrompt'),defaultName);
    if(prompted===null) return Promise.resolve(null);
    return Promise.resolve(String(prompted||'').trim()||defaultName);
  }

  function commitVoiceSchemeSave(opts, ov, defaultName, scope){
    return resolveVoiceSchemeName(opts, defaultName).then(function(name){
      if(name===null) return null;
      var m=createVoiceMappingShell(name,ov,scope);
      if(!m) return null;
      ui().voiceEditSchemeId=m.id;
      state().selectedMappingId=m.id;
      mirrorSavedScheme(m);
      setTimeout(function(){
        persistConfig().then(function(){
          refreshVoiceSchemeSurfaces();
          showSavedToast(false);
          if(global.OneToneVoiceSchemeContext&&global.OneToneVoiceSchemeContext.activateEditingScheme){
            global.OneToneVoiceSchemeContext.activateEditingScheme();
          }
        });
      },0);
      return m;
    });
  }

  function saveVoiceScheme(opts){
    opts=opts||{};
    if(!core()) return Promise.resolve(null);
    try{
      core().ensureConfig&&core().ensureConfig();
      var cfg=state().config||{};
      var rawOv=snapshotVoiceOverride();
      var ov=normalizeOverrideForSave(rawOv,cfg);
      var scope=snapshotAppScope();
      var existing=resolveSaveTargetMapping(opts);

      if(existing&&!opts.forceCreate){
        applySparseVoiceOverride(existing,ov);
        applyAppScopeToMapping(existing,scope);
        touchUpdated(existing);
        ui().voiceEditSchemeId=existing.id;
        state().selectedMappingId=existing.id;
        return persistConfig().then(function(){
          refreshVoiceSchemeSurfaces();
          showSavedToast(true);
          return existing;
        });
      }

      if(!opts.forceCreate){
        if(global.OneToneAppToast) global.OneToneAppToast.show(t('voiceSchemeSaveNoTarget'),'warn');
        return Promise.resolve(null);
      }

      var defaultName=defaultVoiceHabitName(rawOv);
      return commitVoiceSchemeSave(opts, ov, defaultName, scope);
    }catch(err){
      console.error('saveVoiceScheme',err);
      return Promise.resolve(null);
    }
  }

  function resolveVoiceScopeMapping(){
    var coreApi=core();
    var scenarioId=String(ui().habitScenarioReturnId||'').trim();
    if(scenarioId&&coreApi&&coreApi.byId){
      var scenarioM=coreApi.byId(scenarioId);
      if(scenarioM) return scenarioM;
    }
    var vmApi=global.OneToneVoiceSettingsViewModel;
    var vm=vmApi&&vmApi.build?vmApi.build():null;
    if(global.OneToneVoicePageHeaderRender&&global.OneToneVoicePageHeaderRender.resolveScopeMapping){
      var scoped=global.OneToneVoicePageHeaderRender.resolveScopeMapping(vm||{});
      if(scoped) return scoped;
    }
    var m=resolveVoiceEditMapping();
    if(m) return m;
    if(!coreApi) return null;
    var cfg=state().config||{};
    var selId=String(state().selectedMappingId||'').trim();
    if(selId&&coreApi.byId){
      var sel=coreApi.byId(selId);
      if(sel) return sel;
    }
    var activeId=String(cfg.activeSceneId||'').trim();
    if(activeId&&coreApi.byId) return coreApi.byId(activeId)||null;
    var mappings=Array.isArray(cfg.mappings)?cfg.mappings:[];
    return mappings.length?mappings[0]:null;
  }

  function ensureVoiceScopeMapping(opts){
    opts=opts||{};
    var m=resolveVoiceScopeMapping();
    if(m){
      if(!m.voiceOverride||typeof m.voiceOverride!=='object') m.voiceOverride={};
      return m;
    }
    if(opts.allowDraft) return createVoiceDraft(opts);
    return null;
  }

  function resolveMappingForAppScope(){
    return resolveVoiceScopeMapping();
  }

  function setVoiceAppTarget(appId){
    return applyVoiceAppScope({appId:appId||''});
  }

  function applyVoiceAppScope(opts){
    opts=opts||{};
    var m=null;
    var mappingId=String(opts.mappingId||'').trim();
    if(mappingId&&core()&&core().byId) m=core().byId(mappingId);
    if(!m) m=ensureVoiceScopeMapping({allowDraft:false});
    if(!m) return false;
    var rules=global.OneToneAppBehaviorRules;
    var presets=global.OneToneAppVoicePresets;
    var scenarioEditId=global.OneToneState.ui&&global.OneToneState.ui.habitScenarioReturnId
      ?String(global.OneToneState.ui.habitScenarioReturnId).trim()
      :'';
    var editingScenario=!!(scenarioEditId&&m.id===scenarioEditId);
    if(opts.ruleId){
      var ruleId=String(opts.ruleId||'').trim();
      if(!ruleId) return false;
      if(rules&&rules.setActiveRuleContext) rules.setActiveRuleContext(ruleId);
      var rule=rules&&rules.ruleById?rules.ruleById(m,ruleId):null;
      if(presets&&presets.syncRuleVoicePresets) presets.syncRuleVoicePresets(m,rule);
    }else{
      var appId=opts.appId===undefined?'':String(opts.appId||'').trim();
      // Scenario edit requires a bound app. Clearing would make "Save scenario" fail
      // while chips still look selected via active context.
      if(editingScenario&&!appId){
        if(global.OneToneAppToast){
          global.OneToneAppToast.show(t('habitScenarioSaveNeedApp'),'scheme');
        }
        return false;
      }
      m.appTargetId=appId;
      if(appId){
        if(rules&&rules.ensurePrimaryAppRule) rules.ensurePrimaryAppRule(m,appId);
        if(rules&&rules.setActiveAppContextId) rules.setActiveAppContextId(appId);
        if(presets&&presets.syncAppVoicePresets) presets.syncAppVoicePresets(m,appId);
      }else if(rules&&rules.setActiveAppContextId){
        rules.setActiveAppContextId('');
      }
    }
    if(rules&&rules.ensureRulesBeforeSave) rules.ensureRulesBeforeSave(m);
    // App scenarios are sparse overrides — never push their voice into global config.
    var isAppScenario=global.OneToneHabitOverrideDiff
      &&global.OneToneHabitOverrideDiff.isAppScenarioMapping
      &&global.OneToneHabitOverrideDiff.isAppScenarioMapping(m);
    if(!isAppScenario&&presets&&presets.hydrateGlobalWakeEndFromMapping){
      presets.hydrateGlobalWakeEndFromMapping(m);
    }
    touchUpdated(m);
    persistConfig();
    refreshVoiceSchemeSurfaces();
    if(global.OneToneHabitScenarioContextBanner&&global.OneToneHabitScenarioContextBanner.render){
      global.OneToneHabitScenarioContextBanner.render();
    }
    return true;
  }

  global.OneToneVoiceSchemePersist={
    snapshotVoiceOverride:snapshotVoiceOverride,
    voiceEditSchemeId:voiceEditSchemeId,
    inferVoiceEditTargetId:inferVoiceEditTargetId,
    resolveSaveTargetId:resolveSaveTargetId,
    resolveSaveTargetMapping:resolveSaveTargetMapping,
    resolveVoiceEditMapping:resolveVoiceEditMapping,
    isVoiceOnly:isVoiceOnly,
    saveVoiceScheme:saveVoiceScheme,
    saveVoiceSchemeAsNew:function(opts){
      return saveVoiceScheme(Object.assign({},opts||{},{forceCreate:true}));
    },
    createVoiceDraft:createVoiceDraft,
    refreshVoiceSchemeSurfaces:refreshVoiceSchemeSurfaces,
    setVoiceAppTarget:setVoiceAppTarget,
    applyVoiceAppScope:applyVoiceAppScope,
    snapshotAppScope:snapshotAppScope,
    resolveMappingForAppScope:resolveMappingForAppScope,
    resolveVoiceScopeMapping:resolveVoiceScopeMapping,
    ensureVoiceScopeMapping:ensureVoiceScopeMapping
  };
})((typeof window!=='undefined')?window:globalThis);
