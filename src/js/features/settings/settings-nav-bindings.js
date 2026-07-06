(function(global){
  'use strict';
  var $=function(id){ return global.OneToneDom.$(id); };
  function h(){ return global.__vp_bootstrap_hooks__ || {}; }
  function bindEvents(){
    var hooks=h();
    var state=global.OneToneState.state;
    var ui=global.OneToneState.ui;
    document.querySelectorAll('.settings-nav-item').forEach(function(btn){
      btn.addEventListener('mousedown',function(e){ if(e.button===0) e.preventDefault(); });
      btn.addEventListener('click',function(){
        hooks.setSettingsPanel(btn.dataset.panel||'basic');
      });
    });
    var settingsSchemeSubnavList=$('settingsSchemeSubnavList');
    if(settingsSchemeSubnavList){
      settingsSchemeSubnavList.addEventListener('click',function(e){
        var btn=e.target.closest&&e.target.closest('[data-scheme-nav]');
        if(!btn) return;
        e.stopPropagation();
        var id=btn.dataset.schemeNav;
        if(!id) return;
        hooks.flushAllEditorToMappings();
        state.selectedMappingId=id;
        hooks.syncEditorFromSelection();
        hooks.closeFloatMenu();
        hooks.setSettingsPanel('habits');
        hooks.renderKeyFinishFlowPanel();
        hooks.renderEditor();
        hooks.renderSettingsSchemeSubnav();
        if(global.OneToneHabitLayerNav) global.OneToneHabitLayerNav.setHabitLayer('global');
        if(global.OneToneSceneTabs) global.OneToneSceneTabs.render();
        if(global.OneToneSceneVoiceTab) global.OneToneSceneVoiceTab.render();
      });
      settingsSchemeSubnavList.addEventListener('keydown',function(e){
        if(e.key!=='Enter'&&e.key!==' ') return;
        var btn=e.target.closest&&e.target.closest('[data-scheme-nav]');
        if(!btn) return;
        e.preventDefault();
        btn.click();
      });
    }
    var btnSettingsSchemeAdd=$('btnSettingsSchemeAdd');
    if(btnSettingsSchemeAdd){
      btnSettingsSchemeAdd.onclick=function(e){
        e.stopPropagation();
        var addBtn=$('btnAddMapping');
        if(addBtn) addBtn.click();
      };
    }
    var settingsVoiceSubnavList=$('settingsVoiceSubnavList');
    if(settingsVoiceSubnavList){
      settingsVoiceSubnavList.addEventListener('click',function(e){
        var btn=e.target.closest&&e.target.closest('[data-voice-nav]');
        if(!btn) return;
        e.stopPropagation();
        var mode=btn.dataset.voiceNav;
        if(mode!=='sapi'&&mode!=='vosk') return;
        hooks.setSettingsPanel('voiceWake');
        hooks.switchVoiceMode(mode,{toastKind:'lite'});
        var panel=$('voiceModePanel');
        if(panel) panel.scrollIntoView({behavior:'smooth',block:'nearest'});
      });
    }
    var settingsDebugSubnavList=$('settingsDebugSubnavList');
    if(settingsDebugSubnavList){
      settingsDebugSubnavList.addEventListener('click',function(e){
        var btn=e.target.closest&&e.target.closest('[data-debug-nav]');
        if(!btn) return;
        e.stopPropagation();
        var mode=btn.dataset.debugNav||'overview';
        if(ui.settingsPanel!=='debug') hooks.setSettingsPanel('debug');
        hooks.setDebugFocusMode(mode);
      });
    }
  }
  global.OneToneSettingsNavBindings={bindEvents:bindEvents};
})((typeof window!=='undefined')?window:globalThis);
