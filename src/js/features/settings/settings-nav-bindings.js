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
        var delBtn=e.target.closest&&e.target.closest('[data-scheme-del]');
        if(delBtn){
          e.preventDefault();
          e.stopPropagation();
          var delId=delBtn.dataset.schemeDel;
          if(!delId) return;
          if(global.OneToneMappingTrashMenu) global.OneToneMappingTrashMenu.deleteFromMenu(delId);
          hooks.renderSettingsSchemeSubnav();
          if(hooks.render) hooks.render();
          if(global.OneToneSceneModeHub) global.OneToneSceneModeHub.render();
          return;
        }
        var btn=e.target.closest&&e.target.closest('[data-scheme-nav]');
        if(!btn) return;
        e.stopPropagation();
        var id=btn.dataset.schemeNav;
        if(!id) return;
        hooks.flushAllEditorToMappings();
        state.selectedMappingId=id;
        hooks.syncEditorFromSelection();
        hooks.closeFloatMenu();
        hooks.setSettingsPanel('keys');
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
    var settingsSceneVoiceSubnavList=$('settingsSceneVoiceSubnavList');
    if(settingsSceneVoiceSubnavList){
      settingsSceneVoiceSubnavList.addEventListener('click',function(e){
        var btn=e.target.closest&&e.target.closest('[data-scene-voice-nav]');
        if(!btn) return;
        e.stopPropagation();
        var navId=btn.dataset.sceneVoiceNav;
        if(!navId) return;
        ui.selectedSceneVoiceNav=navId;
        hooks.setSettingsPanel('voiceWake');
        if(navId==='voice:sapi'){
          if(hooks.setVoiceWakeExpandedMode) hooks.setVoiceWakeExpandedMode('sapi');
          else if(global.OneToneVoiceWake&&global.OneToneVoiceWake.setExpandedMode) global.OneToneVoiceWake.setExpandedMode('sapi');
        }else if(navId==='voice:vosk'){
          if(hooks.setVoiceWakeExpandedMode) hooks.setVoiceWakeExpandedMode('vosk');
          else if(global.OneToneVoiceWake&&global.OneToneVoiceWake.setExpandedMode) global.OneToneVoiceWake.setExpandedMode('vosk');
        }else if(navId==='voice:end'){
          var active=hooks.currentVoiceMode?hooks.currentVoiceMode():(global.OneToneVoiceWake&&global.OneToneVoiceWake.getExpandedMode?global.OneToneVoiceWake.getExpandedMode():'sapi');
          var endMode=active==='vosk'?'vosk':'sapi';
          if(hooks.setVoiceWakeExpandedMode) hooks.setVoiceWakeExpandedMode(endMode);
          else if(global.OneToneVoiceWake&&global.OneToneVoiceWake.setExpandedMode) global.OneToneVoiceWake.setExpandedMode(endMode);
        }
        if(global.OneToneSceneModeHub) global.OneToneSceneModeHub.renderVoiceSubnav();
        if(global.OneToneSettingsDrawer&&global.OneToneSettingsDrawer.scrollToVoiceAction){
          global.OneToneSettingsDrawer.scrollToVoiceAction(navId);
        }
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
