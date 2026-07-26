(function(global){
  'use strict';

  var $=function(id){ return global.OneToneDom.$(id); };
  var state=function(){ return global.OneToneState.state; };
  var ui=function(){ return global.OneToneState.ui; };
  var t=function(key){ return global.OneToneI18n.t(key); };

  function habitHub(){
    return global.OneToneHabitHub;
  }

  /** Thin compatibility shell: list UI lives in OneToneHabitHub. */
  function render(){
    if(habitHub()&&habitHub().render) habitHub().render();
  }

  function renderVoiceSubnav(){
    var subnav=$('settingsSceneVoiceSubnav');
    var listEl=$('settingsSceneVoiceSubnavList');
    var sidebar=$('settingsSidebar')||document.querySelector('.settings-sidebar');
    var shell=$('settingsShell')||document.querySelector('.settings-shell');
    var voicePanel=$('settingsPanelVoiceWake');
    var st=ui();
    var onVoice=st.drawerOpen&&st.settingsPanel==='voiceWake';
    if(subnav) subnav.hidden=true;
    if(sidebar) sidebar.classList.remove('is-voice-panel');
    if(shell) shell.classList.remove('is-voice-panel');
    if(voicePanel) voicePanel.classList.remove('is-voice-subnav');
    if(!listEl) return;
    if(!onVoice){
      listEl.innerHTML='';
      if(global.OneToneSettingsDrawer&&global.OneToneSettingsDrawer.syncSubnavRail) global.OneToneSettingsDrawer.syncSubnavRail();
      return;
    }
    if(st.selectedSceneVoiceNav!=='voice:end'){
      var exp=global.OneToneVoiceWake&&global.OneToneVoiceWake.getExpandedMode?global.OneToneVoiceWake.getExpandedMode():'vosk';
      st.selectedSceneVoiceNav=exp==='vosk'?'voice:vosk':'voice:sapi';
    }
    listEl.innerHTML='';
    if(global.OneToneSettingsDrawer&&global.OneToneSettingsDrawer.syncSubnavRail) global.OneToneSettingsDrawer.syncSubnavRail();
  }

  function openKeys(id){
    if(id){
      state().selectedMappingId=id;
      var hooks=global.__vp_bootstrap_hooks__||{};
      if(hooks.syncEditorFromSelection) hooks.syncEditorFromSelection();
    }
    if(global.OneToneSettingsDrawer) global.OneToneSettingsDrawer.setPanel('keys');
  }

  function openScenarioDetail(id,opts){
    opts=opts||{};
    if(global.OneToneSettingsDrawer&&global.OneToneSettingsDrawer.openScenarioDetail){
      global.OneToneSettingsDrawer.openScenarioDetail(id,opts);
      return;
    }
    openKeys(id);
  }

  function openScenarioHub(){
    if(global.OneToneSettingsDrawer) global.OneToneSettingsDrawer.setPanel('habits');
  }

  function defaultVoiceNavId(){
    if(global.OneToneVoiceEngineReadiness&&global.OneToneVoiceEngineReadiness.isVoskOnlyUi()) return 'voice:vosk';
    return 'voice:sapi';
  }

  function openVoiceEdit(navId){
    ui().selectedSceneVoiceNav=navId||defaultVoiceNavId();
    if(global.OneToneSettingsDrawer) global.OneToneSettingsDrawer.setPanel('voiceWake');
    if(global.OneToneSettingsDrawer&&global.OneToneSettingsDrawer.scrollToVoiceAction){
      global.OneToneSettingsDrawer.scrollToVoiceAction(ui().selectedSceneVoiceNav);
    }
  }

  function openVoiceProfile(id){
    id=String(id||'').trim();
    if(id&&global.OneToneVoiceSchemesUi&&global.OneToneVoiceSchemesUi.selectVoiceSchemeForEdit){
      global.OneToneVoiceSchemesUi.selectVoiceSchemeForEdit(id);
    }
    openVoiceEdit(defaultVoiceNavId());
  }

  function triggerNewVoiceScenario(){
    openScenarioHub();
    if(habitHub()&&habitHub().createFromVoice) habitHub().createFromVoice();
    else{
      var m=global.OneToneVoiceSchemePersist&&global.OneToneVoiceSchemePersist.createVoiceDraft
        ?global.OneToneVoiceSchemePersist.createVoiceDraft()
        :null;
      if(m&&m.id&&global.OneToneVoiceSchemesUi&&global.OneToneVoiceSchemesUi.selectVoiceSchemeForEdit){
        global.OneToneVoiceSchemesUi.selectVoiceSchemeForEdit(m.id);
      }
      openVoiceEdit(defaultVoiceNavId());
    }
    render();
  }

  function triggerNewScenario(){
    openScenarioHub();
    if(habitHub()&&habitHub().createFromKeys) habitHub().createFromKeys();
    else{
      openKeys();
      var add=$('btnAddMapping');
      if(add) add.click();
    }
  }

  function forwardLegacyPanelClick(e){
    if(global.OneToneSettingsDrawer) global.OneToneSettingsDrawer.setPanel('habits');
    var hub=$('habitHubView');
    if(!hub||!e.target) return;
    var clone=new e.constructor(e.type,e);
    hub.dispatchEvent(clone);
  }

  function bindEvents(){
    var panel=$('settingsPanelScenes');
    if(panel){
      panel.addEventListener('click',function(e){
        if(e.target.closest&&e.target.closest('[data-scene-mode-filter],[data-scene-mode-card],[data-scene-mode-switch],[data-scene-mode-edit],[data-scene-mode-dup],[data-scene-mode-rename],[data-scene-mode-del]')){
          e.preventDefault();
          forwardLegacyPanelClick(e);
        }
      });
    }
    var newBtn=$('btnSceneModeNew');
    if(newBtn) newBtn.addEventListener('click',function(e){ e.preventDefault(); triggerNewScenario(); });
    var openKeysBtn=$('btnSceneModeOpenKeys');
    if(openKeysBtn) openKeysBtn.addEventListener('click',function(e){ e.preventDefault(); openKeys(); });
    var openVoiceBtn=$('btnSceneModeOpenVoice');
    if(openVoiceBtn) openVoiceBtn.addEventListener('click',function(e){ e.preventDefault(); openVoiceEdit(defaultVoiceNavId()); });
    var newVoiceBtn=$('btnSceneModeNewVoice');
    if(newVoiceBtn) newVoiceBtn.addEventListener('click',function(e){ e.preventDefault(); triggerNewVoiceScenario(); });
    var emptyNewKey=$('btnSceneModeEmptyNewKey');
    if(emptyNewKey) emptyNewKey.addEventListener('click',function(e){ e.preventDefault(); triggerNewScenario(); });
    var emptyNewVoice=$('btnSceneModeEmptyNewVoice');
    if(emptyNewVoice) emptyNewVoice.addEventListener('click',function(e){ e.preventDefault(); triggerNewVoiceScenario(); });
  }

  global.OneToneSceneModeHub={
    render:render,
    renderVoiceSubnav:renderVoiceSubnav,
    bindEvents:bindEvents,
    openScenarioDetail:openScenarioDetail,
    openScenarioHub:openScenarioHub,
    openVoiceProfile:openVoiceProfile,
    triggerNewVoiceScenario:triggerNewVoiceScenario,
    triggerNewScenario:triggerNewScenario
  };
})((typeof window!=='undefined')?window:globalThis);
