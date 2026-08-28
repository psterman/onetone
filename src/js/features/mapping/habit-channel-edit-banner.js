(function(global){
  'use strict';

  var $=function(id){
    return global.OneToneDom&&global.OneToneDom.$?global.OneToneDom.$(id):document.getElementById(id);
  };
  function t(key,fallback){
    if(global.OneToneI18n&&global.OneToneI18n.t){
      var v=global.OneToneI18n.t(key);
      if(v&&v!==key) return v;
    }
    return fallback!=null?fallback:key;
  }
  function state(){ return global.OneToneState&&global.OneToneState.state; }
  function ui(){ return global.OneToneState&&global.OneToneState.ui; }
  function core(){ return global.OneToneMappingCore; }
  function diff(){ return global.OneToneHabitOverrideDiff; }
  function scopeSwitch(){ return global.OneToneSettingsScopeSwitch; }

  var PANELS=[
    {panel:'keys',panelId:'settingsPanelKeys',bannerId:'habitScenarioContextBannerKeys',statusBarId:'keysWorkflowTabsBar',scopeMountId:'keysScopeSwitch',channelKey:'settingsNavKeys'},
    {panel:'voice',panelId:'settingsPanelVoiceWake',bannerId:'habitScenarioContextBannerVoice',statusBarId:'voiceWorkflowTabsBar',scopeMountId:'voiceScopeSwitch',channelKey:'settingsNavVoiceWake'},
    {panel:'camera',panelId:'settingsPanelCamera',bannerId:'habitScenarioContextBannerCamera',statusBarId:'cameraWorkflowTabsBar',scopeMountId:'cameraScopeSwitch',channelKey:'settingsNavCamera'},
    {panel:'softPad',panelId:'settingsPanelSoftPad',bannerId:'habitScenarioContextBannerSoftPad',statusBarId:'softPadStatusBar',scopeMountId:'softPadScopeSwitch',channelKey:'settingsNavSoftPad'}
  ];

  var bound=false;

  function resolveEditMapping(){
    var rid=String(ui().habitScenarioReturnId||'').trim();
    if(rid&&core()&&core().byId){
      var fromReturn=core().byId(rid);
      if(fromReturn) return fromReturn;
    }
    var sel=state().selectedMappingId;
    if(sel==null||sel==='') return null;
    var id=String(sel).trim();
    if(!id||!core()||!core().byId) return null;
    return core().byId(id);
  }

  function editMappingId(){
    var m=resolveEditMapping();
    return m&&m.id?String(m.id):'';
  }

  function editDisplayName(m){
    if(scopeSwitch()&&scopeSwitch().habitName) return scopeSwitch().habitName(m);
    if(!m) return t('homeWbChipUniversal','通用设置');
    var hub=global.OneToneHabitHub;
    if(hub&&hub.habitName) return hub.habitName(m);
    return String(m.group||m.label||'').trim()||'—';
  }

  function runtimeSceneId(){
    var rt=global.OneToneRuntimeHabitControl;
    if(rt&&rt.resolveActiveSceneId){
      var fg=rt.foregroundIdentity?rt.foregroundIdentity():null;
      return String(rt.resolveActiveSceneId(fg)||'').trim();
    }
    var cfg=state().config||{};
    return String(cfg.activeSceneId||'').trim();
  }

  function resolveEditVsRuntime(){
    var editId=editMappingId();
    var runtimeId=runtimeSceneId();
    var aligned=!!editId&&editId===runtimeId;
    if(!editId){
      var baseline=diff()&&diff().findGlobalBaselineMapping
        ?diff().findGlobalBaselineMapping(state().config||{},core()):null;
      if(baseline&&baseline.id&&String(baseline.id)===runtimeId) aligned=true;
      if(!editId&&scopeSwitch()){
        var voiceGlobal=String(ui().voiceEditSchemeId||'')==='__global__';
        if(voiceGlobal&&baseline&&baseline.id&&String(baseline.id)===runtimeId) aligned=true;
      }
    }
    return {editId:editId,runtimeId:runtimeId,aligned:aligned};
  }

  function isAppScenarioMapping(m){
    return !!(m&&diff()&&diff().isAppScenarioMapping&&diff().isAppScenarioMapping(m));
  }

  function channelTitle(spec){
    var el=$(spec.channelKey+'Label');
    if(el&&el.textContent) return el.textContent.trim();
    if(spec.panel==='keys') return t('settingsNavKeys','按键');
    if(spec.panel==='voice') return t('settingsNavVoiceWake','语音');
    if(spec.panel==='camera') return t('settingsNavCamera','摄像头');
    return t('settingsNavSoftPad','虚拟键盘');
  }

  function syncPanelContext(panel){
    panel=String(panel||'').trim();
    var rid=String(ui().habitScenarioReturnId||'').trim();
    var m=rid&&core()&&core().byId?core().byId(rid):null;
    var app=!!(m&&isAppScenarioMapping(m));
    if(panel==='camera'){
      ui().cameraEditMode=app?'appScenario':'global';
      if(app&&rid) state().selectedMappingId=rid;
    }else if(panel==='voiceWake'||panel==='voice'){
      if(app&&rid){
        state().selectedMappingId=rid;
        ui().voiceEditSchemeId=rid;
      }else if(!rid){
        ui().voiceEditSchemeId='__global__';
      }
    }else if(panel==='keys'){
      if(rid) state().selectedMappingId=rid;
    }else if(panel==='softPad'){
      if(rid) state().selectedMappingId=rid;
    }
  }

  function syncEditToRuntime(){
    var runtimeId=runtimeSceneId();
    if(!runtimeId||!core()||!core().byId) return false;
    var m=core().byId(runtimeId);
    if(!m) return false;
    if(isAppScenarioMapping(m)){
      ui().habitScenarioReturnId=runtimeId;
      ui().habitScenarioReturnPanel=String(ui().settingsPanel||'keys');
      ui().cameraEditMode='appScenario';
      state().selectedMappingId=runtimeId;
      ui().voiceEditSchemeId=runtimeId;
    }else{
      ui().habitScenarioReturnId=null;
      ui().habitScenarioReturnPanel=null;
      ui().habitHubEditReturn=false;
      ui().cameraEditMode='global';
      state().selectedMappingId=runtimeId;
      ui().voiceEditSchemeId='__global__';
    }
    syncPanelContext(ui().settingsPanel||'keys');
    return true;
  }

  function ensureEditContextFromRuntime(){
    var rid=String(ui().habitScenarioReturnId||'').trim();
    if(rid&&core()&&core().byId&&core().byId(rid)) return true;
    return syncEditToRuntime();
  }

  function openHubForEdit(){
    var id=editMappingId();
    if(id) state().selectedMappingId=id;
    ui().habitView='hub';
    var drawer=global.OneToneSettingsDrawer;
    if(drawer){
      if(!ui().drawerOpen&&typeof drawer.open==='function'){
        drawer.open({panel:'habits'});
      }else if(typeof drawer.setPanel==='function'){
        drawer.setPanel('habits');
      }
    }
    if(global.OneToneHabitHub&&global.OneToneHabitHub.showHub){
      global.OneToneHabitHub.showHub();
    }
  }

  function repaintCurrentPanel(){
    renderAll();
    var panel=String(ui().settingsPanel||'');
    if(panel==='keys'&&global.OneToneKeysPanelUi&&global.OneToneKeysPanelUi.render){
      try{ global.OneToneKeysPanelUi.render(); }catch(_){}
    }
    if(panel==='voiceWake'&&global.OneToneVoiceSchemesUi&&global.OneToneVoiceSchemesUi.render){
      try{ global.OneToneVoiceSchemesUi.render(); }catch(_){}
    }
    if(panel==='camera'&&global.OneToneCameraWorkflow&&global.OneToneCameraWorkflow.onPanelVisible){
      try{ global.OneToneCameraWorkflow.onPanelVisible(); }catch(_){}
    }
    if(panel==='softPad'&&global.OneToneSoftPadHub&&global.OneToneSoftPadHub.render){
      try{ global.OneToneSoftPadHub.render(); }catch(_){}
    }
  }

  function esc(v){
    if(global.OneToneDom&&global.OneToneDom.esc) return global.OneToneDom.esc(v);
    return String(v==null?'':v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');
  }

  function habitScopeDisplayName(m) {
    if (scopeSwitch() && scopeSwitch().habitScopeDisplayName) {
      return scopeSwitch().habitScopeDisplayName(m);
    }
    return editDisplayName(m);
  }

  function scenarioActionIds(spec) {
    if (spec.panel === 'keys') {
      return {
        save: 'btnHabitScenarioContextSaveKeys',
        toVoice: 'btnHabitScenarioContextToVoiceKeys',
        toCamera: 'btnHabitScenarioContextToCameraKeys'
      };
    }
    if (spec.panel === 'voice') {
      return {
        save: 'btnHabitScenarioContextSaveVoice',
        toKeys: 'btnHabitScenarioContextToKeysVoice',
        toCamera: 'btnHabitScenarioContextToCameraVoice'
      };
    }
    if (spec.panel === 'camera') {
      return {
        save: 'btnHabitScenarioContextSaveCamera',
        toKeys: 'btnHabitScenarioContextToKeysCamera'
      };
    }
    return null;
  }

  function scenarioPreviewSummary(m) {
    var Scenario = global.OneToneHabitScenarioContextBanner;
    if (!Scenario || !Scenario.buildPreview || !m) return '';
    var preview = Scenario.buildPreview(m);
    if (!preview) return '';
    var parts = [];
    if (preview.keysOverrideCount > 0) {
      parts.push(t('settingsScopePillKeys', '按键'));
    }
    if (preview.voiceOverrideCount > 0 || preview.acousticCommandCount > 0) {
      parts.push(t('settingsScopePillVoice', '语音'));
    }
    if (preview.cameraOverrideCount > 0) {
      parts.push(t('settingsNavCamera', '摄像头'));
    }
    return parts.join(' · ');
  }

  function contextActionsHtml(spec, m) {
    var html =
      '<button type="button" class="page-status-btn settings-context-hub-btn" data-habit-edit-open-hub>'
      + esc(t('settingsScopeHubBtn', '我的习惯')) + '</button>'
      + '<button type="button" class="page-status-btn settings-context-follow-btn" data-habit-edit-follow-runtime>'
      + esc(t('habitEditBannerFollowRuntime', '↻ 跟前台')) + '</button>';
    if (!isAppScenarioMapping(m)) return html;
    var actions = scenarioActionIds(spec);
    if (!actions) return html;
    var Scenario = global.OneToneHabitScenarioContextBanner;
    var preview = Scenario && Scenario.buildPreview ? Scenario.buildPreview(m) : null;
    var canSave = !!(preview && preview.canSave);
    if (canSave && actions.save) {
      html += '<button type="button" class="page-status-btn is-primary settings-context-scenario-btn" data-habit-scenario-action="'
        + esc(actions.save) + '">' + esc(t('habitScenarioSaveBtn', '保存应用场景')) + '</button>';
    }
    if (spec.panel !== 'voice' && actions.toVoice) {
      html += '<button type="button" class="page-status-btn is-muted settings-context-scenario-btn" data-habit-scenario-action="'
        + esc(actions.toVoice) + '">' + esc(t('habitHubGlobalOpenVoice', '配语音')) + '</button>';
    }
    if (spec.panel !== 'camera' && actions.toCamera) {
      html += '<button type="button" class="page-status-btn is-muted settings-context-scenario-btn" data-habit-scenario-action="'
        + esc(actions.toCamera) + '">' + esc(t('habitHubGlobalOpenCamera', '配摄像头')) + '</button>';
    }
    if (spec.panel !== 'keys' && actions.toKeys) {
      html += '<button type="button" class="page-status-btn is-muted settings-context-scenario-btn" data-habit-scenario-action="'
        + esc(actions.toKeys) + '">' + esc(t('habitHubGlobalOpenKeys', '配按键')) + '</button>';
    }
    return html;
  }

  function clickScenarioAction(actionId) {
    actionId = String(actionId || '').trim();
    if (!actionId) return;
    var leg = $(actionId);
    if (leg && typeof leg.click === 'function') {
      leg.click();
      return;
    }
    if (leg && leg.dispatchEvent) {
      try {
        leg.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      } catch (_) {}
    }
  }

  function ensureStatusContextChrome(statusBar){
    if(!statusBar) return null;
    var chrome=statusBar.querySelector(':scope > .settings-context-chrome');
    if(chrome) return chrome;
    chrome=document.createElement('div');
    chrome.className='settings-context-chrome';
    var islandHost=document.getElementById('softPadStatus');
    var main=statusBar.querySelector('.page-status-bar-main');
    if(islandHost&&islandHost.parentNode===statusBar) statusBar.insertBefore(chrome, islandHost);
    else if(main&&main.parentNode===statusBar) statusBar.insertBefore(chrome, main);
    else statusBar.insertBefore(chrome, statusBar.firstChild);
    return chrome;
  }

  function scopeDisplayName(spec, m){
    if (spec.panel === 'softPad') {
      var hub = global.OneToneSoftPadHub;
      if (hub && hub.appTitleFor && hub.getSelectedScopeId) {
        return hub.appTitleFor(hub.getSelectedScopeId());
      }
    }
    return habitScopeDisplayName(m);
  }

  function currentScopeForPanel(spec){
    if(!scopeSwitch()) return '';
    if(spec.panel==='softPad'&&global.OneToneSoftPadHub&&global.OneToneSoftPadHub.getSelectedScopeId){
      return String(global.OneToneSoftPadHub.getSelectedScopeId()||'');
    }
    return scopeSwitch().currentScopeId(spec.panel);
  }

  function renderContextRow(spec, m, vs){
    var statusBar=$(spec.statusBarId);
    var panelEl=$(spec.panelId);
    if(!statusBar) return;
    var name=scopeDisplayName(spec, m);
    var channel=channelTitle(spec);
    var editingTpl=t('settingsContextEditing','{channel} / 正在编辑：{name}');
    var editingLine=editingTpl.replace('{channel}', channel).replace('{name}', name);
    var previewTip=scenarioPreviewSummary(m);
    var chrome=ensureStatusContextChrome(statusBar);
    if(!chrome) return;
    var scopeHtml='';
    var activeScopeId=currentScopeForPanel(spec);
    if(spec.scopeMountId&&scopeSwitch()){
      scopeHtml=scopeSwitch().renderScopeSwitchMount(spec.panel, activeScopeId);
    }
    chrome.innerHTML=
      '<div class="settings-context-chrome__left">'
      +'<span class="settings-context-chrome__editing"'+(previewTip?' title="'+esc(previewTip)+'"':'')+'>'+esc(editingLine)+'</span>'
      +(vs.aligned?'<span class="settings-context-chrome__aligned">'+esc(t('habitEditBannerAligned','已与前台一致'))+'</span>':'')
      +(scopeHtml?'<div class="settings-context-chrome__scope" id="'+esc(spec.scopeMountId)+'">'+scopeHtml+'</div>':'')
      +'</div>'
      +'<div class="settings-context-chrome__actions">'+contextActionsHtml(spec, m)+'</div>';
    if(panelEl){
      panelEl.classList.add('has-settings-context-bar');
      panelEl.classList.toggle('is-scenario-config',!!isAppScenarioMapping(m));
      panelEl.classList.remove('has-channel-edit-banner');
      panelEl.classList.remove('has-scenario-context-banner');
    }
    if($(spec.bannerId)) $(spec.bannerId).hidden=true;
    statusBar.classList.add('has-settings-context-bar');
  }

  function renderPanel(spec){
    var banner=$(spec.bannerId);
    var panelEl=$(spec.panelId);
    var cur=String(ui().settingsPanel||'');
    var active=(spec.panel==='keys'&&cur==='keys')
      ||(spec.panel==='voice'&&cur==='voiceWake')
      ||(spec.panel==='camera'&&cur==='camera')
      ||(spec.panel==='softPad'&&cur==='softPad');
    if(!active){
      if(banner) banner.hidden=true;
      if(panelEl){
        panelEl.classList.remove('has-settings-context-bar');
        panelEl.classList.remove('has-channel-edit-banner');
        panelEl.classList.remove('has-scenario-context-banner');
      }
      return;
    }
    var m=resolveEditMapping();
    var vs=resolveEditVsRuntime();
    renderContextRow(spec, m, vs);
  }

  function renderAll(){
    if(scopeSwitch()&&scopeSwitch().bindOnce) scopeSwitch().bindOnce();
    PANELS.forEach(renderPanel);
  }

  function bindOnce(){
    if(bound) return;
    bound=true;
    document.addEventListener('click',function(e){
      var hubBtn=e.target.closest&&e.target.closest('[data-habit-edit-open-hub]');
      if(hubBtn){
        e.preventDefault();
        openHubForEdit();
        return;
      }
      var followBtn=e.target.closest&&e.target.closest('[data-habit-edit-follow-runtime]');
      if(followBtn){
        e.preventDefault();
        if(syncEditToRuntime()) repaintCurrentPanel();
        return;
      }
      var scenarioBtn=e.target.closest&&e.target.closest('[data-habit-scenario-action]');
      if(scenarioBtn){
        e.preventDefault();
        clickScenarioAction(scenarioBtn.getAttribute('data-habit-scenario-action'));
      }
    });
  }

  global.OneToneHabitChannelEditBanner={
    resolveEditMapping:resolveEditMapping,
    resolveEditVsRuntime:resolveEditVsRuntime,
    syncEditToRuntime:syncEditToRuntime,
    ensureEditContextFromRuntime:ensureEditContextFromRuntime,
    syncPanelContext:syncPanelContext,
    openHubForEdit:openHubForEdit,
    renderAll:renderAll,
    bindOnce:bindOnce
  };
})((typeof window!=='undefined')?window:globalThis);
