(function(global){
  'use strict';

  var $=function(id){ return global.OneToneDom.$(id); };
  var ui=function(){ return global.OneToneState.ui; };
  var state=function(){ return global.OneToneState.state; };
  function t(key){ return global.OneToneI18n.t(key); }

  var TAB_IDS=['keys','voice','target','advanced'];

  function panelActive(){
    return ui().drawerOpen&&ui().settingsPanel==='keyWake';
  }

  function setSceneTab(tab){
    if(TAB_IDS.indexOf(tab)<0) tab='keys';
    ui().sceneTab=tab;
    applySceneTabVisibility();
    renderSceneTabs();
    if(tab==='voice'&&global.OneToneSceneVoiceTab) global.OneToneSceneVoiceTab.render();
  }

  function applySceneTabVisibility(){
    var panel=$('settingsPanelKeyWake');
    if(!panel) return;
    var tab=ui().sceneTab||'keys';
    panel.dataset.sceneTab=tab;
    var voicePanel=$('sceneVoicePanel');
    if(voicePanel) voicePanel.hidden=(tab!=='voice');
    var mappingSection=$('keyWakeMappingSection');
    if(mappingSection) mappingSection.hidden=(tab!=='keys'&&tab!=='advanced');
    var globalFooter=$('sceneGlobalVoiceFooter');
    if(globalFooter) globalFooter.hidden=!panelActive();
  }

  function renderSceneTabs(){
    var bar=$('sceneTabBar');
    if(bar){
      bar.hidden=!panelActive();
      bar.querySelectorAll('[data-scene-tab]').forEach(function(btn){
        var on=btn.dataset.sceneTab===(ui().sceneTab||'keys');
        btn.classList.toggle('is-active',on);
        btn.setAttribute('aria-selected',on?'true':'false');
      });
    }
    applySceneTabVisibility();
    renderSceneActivateChrome();
    renderSceneGlobalFooter();
    var tabLabels={keys:'sceneTabKeysLabel',voice:'sceneTabVoiceLabel',target:'sceneTabTargetLabel',advanced:'sceneTabAdvancedLabel'};
    Object.keys(tabLabels).forEach(function(tab){
      var el=$(tabLabels[tab]);
      if(el) el.textContent=t('sceneTab'+tab.charAt(0).toUpperCase()+tab.slice(1));
    });
  }

  function selectedMapping(){
    var st=state();
    if(!st.config||!Array.isArray(st.config.mappings)) return null;
    return st.config.mappings.find(function(m){ return m.id===st.selectedMappingId; })||null;
  }

  function renderSceneActivateChrome(){
    var note=$('sceneBrowseNote');
    var btn=$('btnKeySchemeActivate');
    var st=state();
    var selId=st.selectedMappingId;
    var activeId=st.config&&st.config.activeSceneId;
    var showBrowse=panelActive()&&selId&&activeId&&selId!==activeId;
    if(note){
      note.hidden=!showBrowse;
      if(showBrowse) note.textContent=t('sceneBrowseNote');
    }
    if(btn){
      var m=selectedMapping();
      var canActivate=!!(m&&global.OneToneMappingCore&&global.OneToneMappingCore.isSaved(m));
      btn.hidden=!showBrowse||!canActivate;
      btn.disabled=!canActivate;
      btn.textContent=t('sceneActivateBtn');
    }
    var kicker=$('keySchemeCardKicker');
    if(kicker&&panelActive()){
      kicker.textContent=showBrowse?t('sceneEditingKicker'):t('keySchemeCardKicker');
    }
  }

  function engineSummary(cfg){
    if(!cfg) return '—';
    var vosk=!!((cfg.voiceVosk||cfg.voice_vosk||{}).enabled);
    var sapi=!!((cfg.voiceSapi||cfg.voice_sapi||{}).enabled);
    if(vosk) return 'Vosk';
    if(sapi) return 'SAPI';
    return t('sceneGlobalEngineOff');
  }

  function renderSceneGlobalFooter(){
    var footer=$('sceneGlobalVoiceFooter');
    if(!footer) return;
    footer.hidden=!panelActive();
    var cfg=state().config;
    var micEl=$('sceneGlobalMicValue');
    var engineEl=$('sceneGlobalEngineValue');
    if(engineEl) engineEl.textContent=engineSummary(cfg);
    if(micEl){
      var hooks=global.__vp_bootstrap_hooks__||{};
      var micName='—';
      if(typeof hooks.micDevices==='function'){
        var devices=hooks.micDevices()||[];
        var activeId=hooks.activeMicId&&hooks.activeMicId();
        var dev=devices.find(function(d){ return d.id===activeId; })
          ||devices.find(function(d){ return d.isDefault; })
          ||devices[0];
        if(dev&&dev.name) micName=dev.name;
      }
      micEl.textContent=micName;
    }
    var link=$('btnSceneOpenGlobalVoice');
    if(link) link.textContent=t('sceneGlobalFooterLink');
    var title=$('sceneGlobalFooterTitle');
    if(title) title.textContent=t('sceneGlobalFooterTitle');
    var micLbl=$('sceneGlobalMicLabel');
    if(micLbl) micLbl.textContent=t('sceneGlobalFooterMic');
    var engLbl=$('sceneGlobalEngineLabel');
    if(engLbl) engLbl.textContent=t('sceneGlobalFooterEngine');
  }

  function bindEvents(){
    var bar=$('sceneTabBar');
    if(bar){
      bar.addEventListener('click',function(e){
        var btn=e.target.closest&&e.target.closest('[data-scene-tab]');
        if(!btn) return;
        setSceneTab(btn.dataset.sceneTab||'keys');
      });
    }
    var activateBtn=$('btnKeySchemeActivate');
    if(activateBtn){
      activateBtn.addEventListener('click',function(){
        var id=state().selectedMappingId;
        if(id&&global.OneToneSceneActivate) global.OneToneSceneActivate.activateScene(id);
      });
    }
    var openGlobal=$('btnSceneOpenGlobalVoice');
    if(openGlobal){
      openGlobal.addEventListener('click',function(){
        if(global.OneToneSettingsDrawer) global.OneToneSettingsDrawer.setPanel('voiceWake');
      });
    }
    document.addEventListener('click',function(e){
      var btn=e.target.closest&&e.target.closest('[data-scene-activate]');
      if(!btn) return;
      e.stopPropagation();
      var id=btn.dataset.sceneActivate;
      if(id&&global.OneToneSceneActivate) global.OneToneSceneActivate.activateScene(id);
    });
  }

  global.OneToneSceneTabs={
    setSceneTab:setSceneTab,
    render:renderSceneTabs,
    applyVisibility:applySceneTabVisibility,
    bindEvents:bindEvents
  };
})((typeof window!=='undefined')?window:globalThis);
