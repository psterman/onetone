(function(global){
  'use strict';
  function hooks(){ return global.__vp_bootstrap_hooks__ || {}; }
  function bindUiEvents(){
    [
      global.OneToneAppPrefsBindings,
      global.OneToneAppShellBindings,
      global.OneToneDebugAboutBindings,
      global.OneToneSettingsNavBindings,
      global.OneToneMappingRecordingBindings,
      global.OneToneVoiceUiBindings,
      global.OneToneHomeUiBindings,
      global.OneToneKeyFinishFlowUi,
      global.OneToneAppKeyboard,
      global.OneToneMappingListUi
    ].forEach(function(mod){
      if(!mod) return;
      var fn=mod.bindEvents||mod.bindListeners;
      if(typeof fn!=='function') return;
      try{ fn.call(mod); }catch(err){ console.error('bindUiEvents',mod,err); }
    });
  }
  function bindWebViewBus(){
    if(global.OneToneWebViewBus) global.OneToneWebViewBus.bindListeners();
  }
  function bootApp(){
    if(global.OneToneAppBoot) global.OneToneAppBoot.run();
  }
  function bindGlobalErrorHandlers(){
    if(global.OneToneErrorHandlers) global.OneToneErrorHandlers.bindListeners();
  }
  function install(){
    bindGlobalErrorHandlers();
    bindUiEvents();
    bindWebViewBus();
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
