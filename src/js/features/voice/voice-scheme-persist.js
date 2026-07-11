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
    var hub=global.OneToneHabitHub;
    if(hub&&hub.snapshotVoiceOverride) return cloneVoiceOverride(hub.snapshotVoiceOverride());
    return {};
  }

  function defaultVoiceHabitName(ov){
    var hub=global.OneToneHabitHub;
    if(hub&&hub.defaultVoiceHabitName) return hub.defaultVoiceHabitName(ov);
    return t('habitHubVoiceDefaultNameFallback');
  }

  function voiceEditSchemeId(){
    var id=ui()&&ui().voiceEditSchemeId;
    id=id==null?'':String(id).trim();
    return id||null;
  }

  function inferVoiceEditTargetId(){
    return voiceEditSchemeId();
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
      if(ui().voiceEditSchemeId===id) ui().voiceEditSchemeId=null;
      return null;
    }
    return m;
  }

  function persistConfig(){
    if(global.OneToneConfigPersist&&global.OneToneConfigPersist.save){
      global.OneToneConfigPersist.save();
      return;
    }
    var hooks=global.__vp_mapping_list_ui_hooks__||{};
    if(hooks.save) hooks.save();
  }

  function refreshVoiceSchemeSurfaces(){
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

  function createVoiceMappingShell(name,ov){
    if(!core()) return null;
    core().ensureConfig&&core().ensureConfig();
    var cfg=state().config;
    var id=core().newMappingId?core().newMappingId():('m-'+Date.now()+'-'+Math.random().toString(36).slice(2,7));
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
      appTargetId:'',
      appBehaviorRules:[],
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

  function saveVoiceScheme(opts){
    opts=opts||{};
    if(!core()) return null;
    core().ensureConfig&&core().ensureConfig();
    var ov=snapshotVoiceOverride();
    var targetId=opts.forceCreate?null:inferVoiceEditTargetId();
    var existing=targetId&&core().byId?core().byId(targetId):null;

    if(existing&&isVoiceOnly(existing)&&!opts.forceCreate){
      existing.voiceOverride=cloneVoiceOverride(ov);
      touchUpdated(existing);
      ui().voiceEditSchemeId=existing.id;
      state().selectedMappingId=existing.id;
      persistConfig();
      refreshVoiceSchemeSurfaces();
      showSavedToast(true);
      return existing;
    }

    var defaultName=defaultVoiceHabitName(ov);
    var name=opts.name;
    if(name===undefined){
      name=prompt(t('habitHubVoiceNamePrompt'),defaultName);
    }
    if(name===null) return null;
    name=String(name||'').trim()||defaultName;

    var m=createVoiceMappingShell(name,ov);
    if(!m) return null;

    ui().voiceEditSchemeId=m.id;
    state().selectedMappingId=m.id;
    persistConfig();
    refreshVoiceSchemeSurfaces();
    showSavedToast(false);
    return m;
  }

  function resolveMappingForAppScope(){
    var m=resolveVoiceEditMapping();
    if(m) return m;
    if(!core()) return null;
    var cfg=state().config||{};
    var activeId=String(cfg.activeSceneId||'').trim();
    return activeId&&core().byId?core().byId(activeId):null;
  }

  function setVoiceAppTarget(appId){
    var m=resolveMappingForAppScope();
    if(!m) return false;
    m.appTargetId=appId?String(appId).trim():'';
    touchUpdated(m);
    persistConfig();
    refreshVoiceSchemeSurfaces();
    return true;
  }

  global.OneToneVoiceSchemePersist={
    snapshotVoiceOverride:snapshotVoiceOverride,
    voiceEditSchemeId:voiceEditSchemeId,
    inferVoiceEditTargetId:inferVoiceEditTargetId,
    resolveVoiceEditMapping:resolveVoiceEditMapping,
    isVoiceOnly:isVoiceOnly,
    saveVoiceScheme:saveVoiceScheme,
    createVoiceDraft:createVoiceDraft,
    refreshVoiceSchemeSurfaces:refreshVoiceSchemeSurfaces,
    setVoiceAppTarget:setVoiceAppTarget,
    resolveMappingForAppScope:resolveMappingForAppScope
  };
})((typeof window!=='undefined')?window:globalThis);
