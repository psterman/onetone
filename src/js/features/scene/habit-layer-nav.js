(function(global){
  'use strict';

  var $=function(id){ return global.OneToneDom.$(id); };
  var ui=function(){ return global.OneToneState.ui; };
  function t(key){ return global.OneToneI18n.t(key); }

  var LAYER_IDS=['global','apps','advanced'];
  var TAB_LABEL_IDS={
    global:'habitLayerTabGlobalLabel',
    apps:'habitLayerTabAppsLabel',
    advanced:'habitLayerTabAdvancedLabel'
  };
  var TAB_I18N={
    global:'habitLayerGlobal',
    apps:'habitLayerApps',
    advanced:'habitLayerAdvanced'
  };
  var foregroundPollTimer=null;
  var foregroundAppId='';

  function panelActive(){
    var drawer=global.OneToneSettingsDrawer;
    return ui().drawerOpen&&drawer&&drawer.isHabitsPanel&&drawer.isHabitsPanel();
  }

  function setHabitLayer(layer,opts){
    opts=opts||{};
    if(LAYER_IDS.indexOf(layer)<0) layer='global';
    var prev=ui().habitLayer||'global';
    ui().habitLayer=layer;
    applyHabitLayerVisibility();
    renderHabitLayerNav();
    if(layer!==prev||opts.force) onLayerActivated(layer);
  }

  function applyHabitLayerVisibility(){
    var showLayers=panelActive()&&(ui().habitView||'hub')!=='hub';
    var activeLayer=showLayers?(ui().habitLayer||'global'):'';
    var tabBar=$('habitLayerTabBar');
    var pagesWrap=$('habitLayerPages');
    if(tabBar) tabBar.hidden=!showLayers;
    if(pagesWrap) pagesWrap.hidden=!showLayers;
    LAYER_IDS.forEach(function(layer){
      var page=$('habitLayer'+layer.charAt(0).toUpperCase()+layer.slice(1));
      if(!page) return;
      var on=activeLayer===layer;
      page.classList.toggle('is-active',on);
      page.hidden=!on;
      page.setAttribute('aria-hidden',on?'false':'true');
    });
    var panel=$('settingsPanelHabits');
    if(panel) panel.dataset.habitLayer=activeLayer||'global';
  }

  function onLayerActivated(layer){
    if(layer==='global'){
      if(global.OneToneSceneFlowSummary) global.OneToneSceneFlowSummary.render();
      if(global.OneToneAppBehaviorRules&&global.OneToneAppBehaviorRules.renderActiveScenarioBanner){
        global.OneToneAppBehaviorRules.renderActiveScenarioBanner();
      }
    }
    if(layer==='apps'&&global.OneToneAppBehaviorRules){
      global.OneToneAppBehaviorRules.render();
    }
    if(layer==='advanced'){
      if(global.OneToneKeyFinishFlowRender) global.OneToneKeyFinishFlowRender.renderKeyFinishFlowPanel();
      if(global.OneToneHabitCompatibility) global.OneToneHabitCompatibility.render();
      if(global.OneToneSceneVoiceTab) global.OneToneSceneVoiceTab.render();
    }
    if(global.OneToneSceneTabs&&global.OneToneSceneTabs.renderEffectivePreview){
      global.OneToneSceneTabs.renderEffectivePreview();
    }
  }

  function renderHabitLayerNav(){
    var tabBar=$('habitLayerTabBar');
    var showLayers=panelActive();
    if(tabBar){
      tabBar.hidden=!showLayers;
      if(tabBar) tabBar.setAttribute('aria-label',t('settingsHabitSubnavLabel'));
      var layer=showLayers?(ui().habitLayer||'global'):'';
      tabBar.querySelectorAll('[data-habit-layer]').forEach(function(btn){
        var on=btn.dataset.habitLayer===layer;
        btn.classList.toggle('is-active',on);
        btn.setAttribute('aria-selected',on?'true':'false');
      });
    }
    LAYER_IDS.forEach(function(layer){
      var lbl=$(TAB_LABEL_IDS[layer]);
      if(lbl) lbl.textContent=t(TAB_I18N[layer]);
    });
    var labelMap={
      habitLayerGlobalPageTitle:'habitLayerGlobal',habitLayerGlobalPageDesc:'habitLayerGlobalPageDesc',
      habitLayerAppsPageTitle:'habitLayerApps',habitLayerAppsPageDesc:'habitLayerAppsPageDesc',
      habitLayerAdvancedPageTitle:'habitLayerAdvanced',habitLayerAdvancedPageDesc:'habitLayerAdvancedPageDesc',
      habitFlowStepTriggerLbl:'habitFlowStepTriggerLbl',habitFlowStepTargetLbl:'habitFlowStepTargetLbl',
      habitFlowStepFinishLbl:'habitFlowStepFinishLbl',habitFlowStepTriggerHint:'habitFlowStepTriggerHint',
      habitFlowStepTargetHint:'habitFlowStepTargetHint',habitFlowFinishMoreLbl:'habitFlowFinishMoreSummary',
      habitFlowFinishMoreCancelLbl:'habitFlowFinishMoreCancel',habitFlowArrowOpen:'sceneFlowArrowOpen',
      habitFlowArrowFinish:'sceneFlowArrowFinish',
      imePresetHintMapping:'habitInputMethodTitle',
      habitKeyMappingTip:'habitKeyMappingTip',btnHabitFlowTutorial:'habitFlowTutorial',
      habitAppsAutoDetectHint:'habitAppsAutoDetectHint',
      habitActiveScenarioLabel:'habitActiveScenarioLabel',habitActiveScenarioHint:'habitActiveScenarioHint',
      habitAppShortcutsTitle:'habitAppShortcutsTitle',habitAppShortcutsDesc:'habitAppShortcutsDesc',
      habitSummaryDesc:'habitSummaryDesc',habitSummaryOpenKeys:'habitSummaryOpenKeys',habitSummaryOpenVoice:'habitSummaryOpenVoice',
      btnHabitLayerGlobalNew:'habitLayerGlobalNew'
    };
    Object.keys(labelMap).forEach(function(id){
      var el=$(id);
      if(el) el.textContent=t(labelMap[id]);
    });
    var openKeys=$('btnHabitOpenKeys');
    var openVoice=$('btnHabitOpenVoice');
    if(openKeys) openKeys.textContent=t('habitSummaryOpenKeys');
    if(openVoice) openVoice.textContent=t('habitSummaryOpenVoice');
    applyHabitLayerVisibility();
  }

  function scrollToMappingRow(step){
    if(global.OneToneSettingsDrawer){
      global.OneToneSettingsDrawer.setPanel('keys');
      global.OneToneSettingsDrawer.focusField(step);
      return;
    }
    var row=$('habitKeyMapRow'+step.charAt(0).toUpperCase()+step.slice(1));
    if(row) row.scrollIntoView({behavior:'smooth',block:'nearest'});
    if(global.OneToneHabitKeyMappingTable) global.OneToneHabitKeyMappingTable.highlightRow(step);
  }

  function pollForegroundApp(){
    if(!global.OneToneIpc||!panelActive()) return;
    global.OneToneIpc.invoke('cmd_foreground_app',{}).then(function(res){
      foregroundAppId=res&&res.appId?String(res.appId):'';
      if(global.OneToneSceneTabs&&global.OneToneSceneTabs.renderEffectivePreview){
        global.OneToneSceneTabs.renderEffectivePreview();
      }
    }).catch(function(){ foregroundAppId=''; });
  }

  function startForegroundPoll(){
    stopForegroundPoll();
    pollForegroundApp();
    foregroundPollTimer=setInterval(pollForegroundApp,2000);
  }

  function stopForegroundPoll(){
    if(foregroundPollTimer){
      clearInterval(foregroundPollTimer);
      foregroundPollTimer=null;
    }
  }

  function onPanelVisibility(){
    if(panelActive()) startForegroundPoll();
    else stopForegroundPoll();
    applyHabitLayerVisibility();
    renderHabitLayerNav();
    if(panelActive()){
      onLayerActivated(ui().habitLayer||'global');
    }
  }

  function getForegroundAppId(){ return foregroundAppId; }

  function bindEvents(){
    var tabBar=$('habitLayerTabBar');
    if(tabBar){
      tabBar.addEventListener('click',function(e){
        var btn=e.target.closest&&e.target.closest('[data-habit-layer]');
        if(!btn) return;
        e.preventDefault();
        e.stopPropagation();
        setHabitLayer(btn.dataset.habitLayer||'global');
      });
      tabBar.addEventListener('keydown',function(e){
        if(e.key!=='Enter'&&e.key!==' ') return;
        var btn=e.target.closest&&e.target.closest('[data-habit-layer]');
        if(!btn) return;
        e.preventDefault();
        btn.click();
      });
    }
    var testBtn=$('btnHabitSchemeTestKeys');
    if(testBtn){
      testBtn.addEventListener('click',function(e){
        e.preventDefault();
        var send=$('btnTestSend');
        if(send&&!send.disabled) send.click();
      });
    }
    var newBtn=$('btnHabitLayerGlobalNew');
    if(newBtn){
      newBtn.addEventListener('click',function(e){
        e.preventDefault();
        var add=$('btnAddMapping');
        if(add) add.click();
      });
    }
    var tutorialBtn=$('btnHabitFlowTutorial');
    if(tutorialBtn){
      tutorialBtn.addEventListener('click',function(e){
        e.preventDefault();
        if(global.OneToneSettingsDrawer&&global.OneToneSettingsDrawer.close) global.OneToneSettingsDrawer.close();
        setTimeout(function(){
          if(global.OneToneHomeGuide&&global.OneToneHomeGuide.open) global.OneToneHomeGuide.open();
        },220);
      });
    }
  }

  global.OneToneHabitLayerNav={
    setHabitLayer:setHabitLayer,
    render:renderHabitLayerNav,
    applyVisibility:applyHabitLayerVisibility,
    scrollToMappingRow:scrollToMappingRow,
    onPanelVisibility:onPanelVisibility,
    getForegroundAppId:getForegroundAppId,
    bindEvents:bindEvents
  };
})((typeof window!=='undefined')?window:globalThis);
