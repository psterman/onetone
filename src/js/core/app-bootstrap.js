(function(global){
  'use strict';
  function hooks(){ return global.__vp_bootstrap_hooks__ || {}; }
  function bindUiEvents(){
    [
      global.OneToneVoiceSchemeNameModal,
      global.OneToneAppPrefsBindings,
      global.OneToneAppShellBindings,
      global.OneToneVoiceDiag,
      global.OneToneDebugAboutBindings,
      global.OneToneSettingsNavBindings,
      global.OneToneMappingRecordingBindings,
      global.OneToneVoiceSubpages,
      global.OneToneVoiceUiBindings,
      global.OneToneVoiceModelsPanel,
      global.OneToneHomeUiBindings,
      global.OneToneKeyFinishFlowUi,
      global.OneToneKeysFlowInteraction,
      global.OneToneAppBehaviorRules,
      global.OneToneHabitCompatibility,
      global.OneToneKeysPanelUi,
      global.OneToneSceneModeHub,
      global.OneToneHabitHub,
      global.OneToneHabitScenarioContextBanner,
      global.OneToneHabitScenarioAccessCards,
      global.OneToneHabitScenarioWizard,
      global.OneToneHabitMulti,
      global.OneToneHabitLayerNav,
      global.OneToneHabitKeyMappingTable,
      global.OneToneAppKeyboard,
      global.OneToneSceneSyncConfirm,
      global.OneToneMappingListUi,
      global.OneToneSceneTabs,
      global.OneToneSceneVoiceTab
    ].forEach(function(mod){
      if(!mod) return;
      var fn=mod.bindEvents||mod.bindListeners;
      if(typeof fn!=='function') return;
      try{ fn.call(mod); }catch(err){
        console.error('bindUiEvents',mod,err);
        var h=hooks();
        if(h&&typeof h.logGlobalError==='function'){
          h.logGlobalError('bindUiEvents',(err&&err.stack)||err&&err.message||String(err));
        }
      }
    });
  }
  function bindWebViewBus(){
    if(global.OneToneWebViewBus) global.OneToneWebViewBus.bindListeners();
  }
  function bootApp(){
    var h=hooks();
    // Register must succeed first — deferred debug-about used to throw mid-register and
    // leave __vp_bootstrap_hooks__ empty, so left-nav / openDrawer never wired.
    if(typeof h.markBoot!=='function'||typeof h.renderHome!=='function'||typeof h.openSettings!=='function'){
      try{
        var keys=Object.keys(h||{}).join(',');
        console.error('[onetone] boot aborted: bootstrap hooks incomplete',keys||'(empty)');
        if(global.OneToneDom&&typeof global.OneToneDom.log==='function'){
          global.OneToneDom.log('boot aborted: hooks incomplete keys='+(keys||'(empty)'));
        }
      }catch(_){}
      return;
    }
    if(global.OneToneAppBoot) global.OneToneAppBoot.run();
  }
  function bindGlobalErrorHandlers(){
    if(global.OneToneErrorHandlers) global.OneToneErrorHandlers.bindListeners();
  }
  function install(){
    bindGlobalErrorHandlers();
    bindUiEvents();
    bindWebViewBus();
    if(global.OneToneConfigPersist&&typeof global.OneToneConfigPersist.flushPendingMvpInit==='function'){
      global.OneToneConfigPersist.flushPendingMvpInit();
    }
    bootApp();
  }
  global.OneToneBootstrap = {
    install: install,
    bindUiEvents: bindUiEvents,
    bindWebViewBus: bindWebViewBus,
    bootApp: bootApp,
    bindGlobalErrorHandlers: bindGlobalErrorHandlers
  };
})((typeof window !== 'undefined') ? window : globalThis);
