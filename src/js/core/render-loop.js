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
      else if(ui.drawerOpen&&ui.settingsPanel==='debug'&&global.OneToneVoiceDiag&&global.OneToneVoiceDiag.getFocusMode()==='repair') h.renderTrashList();
      h.renderEditor();
      h.renderRecordCancelBar();
      // Sounds panel is static settings — full i18n re-render here fights clicks (假死).
      // Light sync only when open; full render on panel open / lang change.
      if(ui.drawerOpen&&ui.settingsPanel==='sounds'&&h.syncSoundsSettingsUi) h.syncSoundsSettingsUi();
      if(ui.drawerOpen&&ui.settingsPanel==='debug'){
        if(global.OneToneVoiceDiag.getFocusMode()==='developer') h.renderDebugDeveloperPanel();
        else h.scheduleDebugChromeRefresh();
      }
      if(ui.drawerOpen&&global.OneToneSettingsDrawer&&(global.OneToneSettingsDrawer.isKeysPanel()||global.OneToneSettingsDrawer.isHabitsPanel())) h.renderKeyFinishFlowPanel();
      h.renderVoiceModeSwitch();
      // Phase1c：home 轻守卫 — 签名未变则跳过整树 renderHome（未来岛/低重绘）
      if(!(h.shouldSkipHomeRender&&h.shouldSkipHomeRender())){
        h.renderHome();
      }
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
