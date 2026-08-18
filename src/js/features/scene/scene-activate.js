(function(global){
  'use strict';

  function state(){ return global.OneToneState.state; }
  function t(key){ return global.OneToneI18n.t(key); }
  function toast(msg,kind){ return global.OneToneAppToast.show(msg,kind); }

  /** Consumed once by scheme-switch-feedback after mvp_scheme_switched. */
  var pendingSwitchSource='manual';
  /** When set to baseline id, foreground poll must not override manual 通用. */
  var manualScenePinId='';

  function isBaselineMappingId(id){
    id=String(id||'').trim();
    if(!id) return false;
    var cfg=state().config;
    var core=global.OneToneMappingCore;
    var diff=global.OneToneHabitOverrideDiff;
    if(!diff||!diff.isGlobalBaselineMapping||!core||!core.byId) return false;
    var m=core.byId(id);
    return !!(m&&diff.isGlobalBaselineMapping(m,cfg||{},core));
  }

  function clearManualScenePin(){
    manualScenePinId='';
  }

  function isManualScenePinned(){
    return !!manualScenePinId;
  }

  function activeSceneId(){
    var cfg=state().config;
    return cfg&&cfg.activeSceneId?String(cfg.activeSceneId):'';
  }

  function isActiveScene(id){
    return !!id&&activeSceneId()===id;
  }

  function normalizeSource(src){
    src=String(src||'').trim().toLowerCase();
    if(src==='foreground'||src==='follow'||src==='auto') return 'foreground';
    return 'manual';
  }

  function takePendingSwitchSource(){
    var src=pendingSwitchSource||'manual';
    pendingSwitchSource='manual';
    return src;
  }

  function peekPendingSwitchSource(){
    return pendingSwitchSource||'manual';
  }

  function activateScene(id,opts){
    if(!id) return;
    var cfg=state().config;
    if(!cfg) return;
    var src=normalizeSource(opts&&opts.source);
    if(src==='manual'){
      if(cfg.followForegroundAppScenario){
        if(isBaselineMappingId(id)) manualScenePinId=String(id);
        else manualScenePinId='';
      }else{
        manualScenePinId='';
      }
    }else if(src==='foreground'){
      if(manualScenePinId&&isBaselineMappingId(manualScenePinId)) return;
    }
    if(activeSceneId()===id) return;
    var core=global.OneToneMappingCore;
    var m=core&&core.byId?core.byId(id):null;
    var rules=global.OneToneAppBehaviorRules;
    if(m&&rules&&rules.isIncompleteCustomStub&&rules.isIncompleteCustomStub(m)){
      toast(t('sceneActivateNeedComplete'),'warn');
      return;
    }
    var hp=global.OneToneHabitProfile;
    var isLibrary=hp&&hp.isLibraryHabit?hp.isLibraryHabit(m,cfg):!!(m&&core.isSaved(m));
    if(!m||!isLibrary){
      toast(t('sceneActivateNeedComplete'),'warn');
      return;
    }
    pendingSwitchSource=src;
    m.lastUsedAt=Date.now();
    m.useCount=(m.useCount||0)+1;
    // Optimistic in-use so home howto refreshes before mvp_scheme_switched round-trip.
    cfg.activeSceneId=id;
    try{
      global.chrome&&global.chrome.webview&&global.chrome.webview.postMessage({type:'mvp_scheme_select',mappingId:id});
    }catch(_){}
    // Do not forceHomeRender/render here — sync home remount on the click path froze the UI.
    // mvp_scheme_switched → scheme-switch-feedback paints once (deferred).
    if(global.OneToneHabitChannelStatusStrip&&global.OneToneHabitChannelStatusStrip.render){
      try{ global.OneToneHabitChannelStatusStrip.render(); }catch(_){}
    }
  }

  global.OneToneSceneActivate={
    activeSceneId:activeSceneId,
    isActiveScene:isActiveScene,
    activateScene:activateScene,
    clearManualScenePin:clearManualScenePin,
    isManualScenePinned:isManualScenePinned,
    takePendingSwitchSource:takePendingSwitchSource,
    peekPendingSwitchSource:peekPendingSwitchSource
  };
})((typeof window!=='undefined')?window:globalThis);
