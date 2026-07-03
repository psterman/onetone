(function(global){
  'use strict';
  function hooks(){ return global.__vp_render_hooks__ || {}; }
  function renderHeroBadges(){
    hooks().applyKeyWakeRecordingUi();
  }
  function render(){
    try{
      const renderStarted=performance.now();
      const ui=global.OneToneState.ui;
      const h=hooks();
      if(h.mappingListUiActive()) h.renderMappingChrome();
      else if(ui.drawerOpen&&ui.settingsPanel==='general') h.renderTrashList();
      h.renderEditor();
      h.renderRecordCancelBar();
      if(ui.drawerOpen&&ui.settingsPanel==='sounds') h.renderSoundSettingsPanel();
      if(ui.drawerOpen&&ui.settingsPanel==='debug'){
        if(global.OneToneVoiceDiag.getFocusMode()==='developer') h.renderDebugDeveloperPanel();
        else h.scheduleDebugChromeRefresh();
      }
      if(ui.drawerOpen&&ui.settingsPanel==='keyWake') h.renderKeyFinishFlowPanel();
      h.renderVoiceModeSwitch();
      h.renderHome();
      h.renderListenRuntime();
      h.renderUpdateUi();
      const elapsed=Math.round(performance.now()-renderStarted);
      if(elapsed>250) h.frontendLog('render slow '+elapsed+'ms');
    }catch(err){
      console.error('render',err);
    }
  }
  global.OneToneRender={render:render,renderHeroBadges:renderHeroBadges};
})((typeof window!=='undefined')?window:globalThis);
