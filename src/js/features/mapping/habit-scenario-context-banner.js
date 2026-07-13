(function(global){
  'use strict';

  var $=function(id){ return global.OneToneDom.$(id); };
  var t=function(key){ return global.OneToneI18n.t(key); };

  function state(){ return global.OneToneState.state; }
  function ui(){ return global.OneToneState.ui; }
  function core(){ return global.OneToneMappingCore; }
  function diff(){ return global.OneToneHabitOverrideDiff; }

  function scenarioName(m){
    if(!m) return '—';
    var hub=global.OneToneHabitHub;
    if(hub&&hub.habitName) return hub.habitName(m);
    return String(m.group||m.label||'').trim()||'—';
  }

  function returnMapping(){
    var id=String(ui().habitScenarioReturnId||'').trim();
    if(!id||!core()||!core().byId) return null;
    var m=core().byId(id);
    if(!m) return null;
    if(diff()&&diff().isAppScenarioMapping&&!diff().isAppScenarioMapping(m)) return null;
    return m;
  }

  function clearScenarioContext(){
    ui().habitScenarioReturnId=null;
    ui().habitScenarioReturnPanel=null;
    ui().habitHubEditReturn=false;
    ui().voiceEditSchemeId=null;
  }

  function syncEditor(id){
    if(id) state().selectedMappingId=id;
    var h=global.__vp_bootstrap_hooks__||global.__vp_mapping_list_ui_hooks__||{};
    if(h.syncEditorFromSelection) h.syncEditorFromSelection();
  }

  function openGlobalKeys(opts){
    opts=opts||{};
    clearScenarioContext();
    if(opts.fromHub) ui().habitHubEditReturn=true;
    var cfg=state().config||{};
    var baseline=diff()&&diff().findGlobalBaselineMapping?diff().findGlobalBaselineMapping(cfg,core()):null;
    if(baseline) syncEditor(baseline.id);
    if(global.OneToneSettingsDrawer) global.OneToneSettingsDrawer.setPanel('keys');
    render();
  }

  function openGlobalVoice(opts){
    opts=opts||{};
    clearScenarioContext();
    if(opts.fromHub) ui().habitHubEditReturn=true;
    var cfg=state().config||{};
    var baseline=diff()&&diff().findGlobalBaselineMapping?diff().findGlobalBaselineMapping(cfg,core()):null;
    if(baseline) syncEditor(baseline.id);
    if(global.OneToneSettingsDrawer) global.OneToneSettingsDrawer.setPanel('voiceWake');
    render();
  }

  function openScenarioKeysEdit(id){
    id=String(id||'').trim();
    if(!id) return;
    ui().habitHubEditReturn=false;
    state().selectedMappingId=id;
    ui().habitScenarioReturnId=id;
    ui().habitScenarioReturnPanel='keys';
    syncEditor(id);
    if(global.OneToneSettingsDrawer) global.OneToneSettingsDrawer.setPanel('keys');
    render();
  }

  function openScenarioVoiceEdit(id){
    id=String(id||'').trim();
    if(!id) return;
    ui().habitHubEditReturn=false;
    state().selectedMappingId=id;
    ui().voiceEditSchemeId=id;
    ui().habitScenarioReturnId=id;
    ui().habitScenarioReturnPanel='voice';
    syncEditor(id);
    if(global.OneToneSettingsDrawer) global.OneToneSettingsDrawer.setPanel('voiceWake');
    render();
  }

  function returnToHabitHub(){
    ui().habitHubEditReturn=false;
    ui().habitScenarioReturnId=null;
    ui().habitScenarioReturnPanel=null;
    if(global.OneToneHabitHub&&global.OneToneHabitHub.showHub){
      global.OneToneHabitHub.showHub();
    }else{
      ui().habitView='hub';
      if(global.OneToneSettingsDrawer) global.OneToneSettingsDrawer.setPanel('habits');
    }
    render();
  }

  function returnToScenarioConsole(){
    var id=String(ui().habitScenarioReturnId||'').trim();
    if(!id||!global.OneToneHabitScenarioWizard) return;
    ui().habitHubEditReturn=false;
    ui().habitView='wizard';
    global.OneToneHabitScenarioWizard.openEdit(id);
    if(global.OneToneSettingsDrawer) global.OneToneSettingsDrawer.setPanel('habits');
    render();
  }

  function returnFromBanner(){
    if(returnMapping()) returnToScenarioConsole();
    else if(ui().habitHubEditReturn) returnToHabitHub();
  }

  function renderBannerIn(panelId,bannerId,textId,subId,backId){
    var panel=$(panelId);
    var banner=$(bannerId);
    if(!banner) return;
    var scenarioM=returnMapping();
    var hubReturn=!!ui().habitHubEditReturn&&!scenarioM;
    var show=!!scenarioM||hubReturn;
    banner.hidden=!show;
    if(panel) panel.classList.toggle('has-scenario-context-banner',show);
    if(!show) return;
    var textEl=$(textId);
    var subEl=$(subId);
    var backEl=$(backId);
    if(scenarioM){
      var name=scenarioName(scenarioM);
      if(textEl) textEl.textContent=t('habitScenarioContextEditing').replace('{name}',name);
      if(subEl) subEl.textContent=t('habitScenarioContextNotGlobal');
      if(backEl) backEl.textContent=t('habitScenarioContextBack').replace('{name}',name);
    }else if(hubReturn){
      if(textEl) textEl.textContent=t('habitHubContextEditingGlobal');
      if(subEl) subEl.textContent=t('habitHubContextGlobalHint');
      if(backEl) backEl.textContent=t('habitHubContextBack');
    }
  }

  function render(){
    renderBannerIn('settingsPanelKeys','habitScenarioContextBannerKeys','habitScenarioContextBannerKeysText','habitScenarioContextBannerKeysSub','btnHabitScenarioContextBackKeys');
    renderBannerIn('settingsPanelVoiceWake','habitScenarioContextBannerVoice','habitScenarioContextBannerVoiceText','habitScenarioContextBannerVoiceSub','btnHabitScenarioContextBackVoice');
  }

  function bindEvents(){
    ['btnHabitScenarioContextBackKeys','btnHabitScenarioContextBackVoice'].forEach(function(id){
      var btn=$(id);
      if(!btn) return;
      btn.addEventListener('click',function(e){
        e.preventDefault();
        returnFromBanner();
      });
    });
  }

  global.OneToneHabitScenarioContextBanner={
    render:render,
    bindEvents:bindEvents,
    clearScenarioContext:clearScenarioContext,
    openGlobalKeys:openGlobalKeys,
    openGlobalVoice:openGlobalVoice,
    openScenarioKeysEdit:openScenarioKeysEdit,
    openScenarioVoiceEdit:openScenarioVoiceEdit,
    returnToScenarioConsole:returnToScenarioConsole,
    returnToHabitHub:returnToHabitHub
  };
})((typeof window!=='undefined')?window:globalThis);
