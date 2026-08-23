(function(global){
  'use strict';

  function state(){ return global.OneToneState.state; }
  function t(key){ return global.OneToneI18n.t(key); }
  function toast(msg,kind){ return global.OneToneAppToast.show(msg,kind); }

  var pendingSwitchSource='manual';

  function runtime(){
    return global.OneToneRuntimeHabitControl;
  }

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
    var rt=runtime();
    if(rt&&rt.clearPin) rt.clearPin();
  }

  function isManualScenePinned(){
    var rt=runtime();
    return !!(rt&&rt.getPin&&rt.getPin());
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

  function scheduleManualSwitchPaint(){
    requestAnimationFrame(function(){
      try{
        if(global.OneToneHomeWorkbenchPanels&&global.OneToneHomeWorkbenchPanels.renderScenarioPanel){
          global.OneToneHomeWorkbenchPanels.renderScenarioPanel();
        }
        if(global.OneToneHomeWorkbenchPanels&&global.OneToneHomeWorkbenchPanels.renderRuntimeStatusRow){
          global.OneToneHomeWorkbenchPanels.renderRuntimeStatusRow();
        }
        if(global.OneToneHomeWorkbench){
          if(global.OneToneHomeWorkbench.forceHomeRender) global.OneToneHomeWorkbench.forceHomeRender();
          if(global.OneToneHomeWorkbench.render) global.OneToneHomeWorkbench.render();
        }
      }catch(_){}
    });
  }

  function activateScene(id,opts){
    if(!id) return;
    var cfg=state().config;
    if(!cfg) return;
    var src=normalizeSource(opts&&opts.source);
    var rt=runtime();

    if(src==='manual'&&rt&&rt.getPin&&rt.getPin()){
      // Explicit pin blocks manual chip picks until cleared.
      if(!(opts&&opts.force)) return;
    }

    if(activeSceneId()===id){
      if(src==='manual'){
        scheduleManualSwitchPaint();
        try{
          global.chrome&&global.chrome.webview&&global.chrome.webview.postMessage({type:'mvp_scheme_select',mappingId:id});
        }catch(_){}
      }
      return;
    }
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
    cfg.activeSceneId=id;
    try{
      global.chrome&&global.chrome.webview&&global.chrome.webview.postMessage({type:'mvp_scheme_select',mappingId:id});
    }catch(_){}
    if(global.OneToneHabitChannelStatusStrip&&global.OneToneHabitChannelStatusStrip.render){
      try{ global.OneToneHabitChannelStatusStrip.render(); }catch(_){}
    }
    if(src==='manual') scheduleManualSwitchPaint();
  }

  function applySoftOverride(id,identity){
    var rt=runtime();
    if(!rt||!rt.setSoftOverride) return;
    rt.setSoftOverride(id,identity);
    activateScene(id,{source:'manual'});
  }

  global.OneToneSceneActivate={
    activeSceneId:activeSceneId,
    isActiveScene:isActiveScene,
    activateScene:activateScene,
    applySoftOverride:applySoftOverride,
    clearManualScenePin:clearManualScenePin,
    isManualScenePinned:isManualScenePinned,
    takePendingSwitchSource:takePendingSwitchSource,
    peekPendingSwitchSource:peekPendingSwitchSource,
    isBaselineMappingId:isBaselineMappingId
  };
})((typeof window!=='undefined')?window:globalThis);
