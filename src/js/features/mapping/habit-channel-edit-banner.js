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

  var PANELS=[
    {panel:'keys',panelId:'settingsPanelKeys',bannerId:'habitScenarioContextBannerKeys'},
    {panel:'voice',panelId:'settingsPanelVoiceWake',bannerId:'habitScenarioContextBannerVoice'},
    {panel:'camera',panelId:'settingsPanelCamera',bannerId:'habitScenarioContextBannerCamera'},
    {panel:'softPad',panelId:'settingsPanelSoftPad',bannerId:'habitScenarioContextBannerSoftPad'}
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
    }
    return {editId:editId,runtimeId:runtimeId,aligned:aligned};
  }

  function isAppScenarioMapping(m){
    return !!(m&&diff()&&diff().isAppScenarioMapping&&diff().isAppScenarioMapping(m));
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

  /** Open channel pages: align edit ctx to runtime when no explicit return id (Hub/scenario edit keeps rid). */
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
  }

  function esc(v){
    if(global.OneToneDom&&global.OneToneDom.esc) return global.OneToneDom.esc(v);
    return String(v==null?'':v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');
  }

  function renderPanel(spec){
    var banner=$(spec.bannerId);
    var panelEl=$(spec.panelId);
    if(!banner) return;
    var cur=String(ui().settingsPanel||'');
    var active=(spec.panel==='keys'&&cur==='keys')
      ||(spec.panel==='voice'&&cur==='voiceWake')
      ||(spec.panel==='camera'&&cur==='camera')
      ||(spec.panel==='softPad'&&cur==='softPad');
    if(!active){
      banner.hidden=true;
      if(panelEl) panelEl.classList.remove('has-channel-edit-banner');
      return;
    }
    var m=resolveEditMapping();
    var name=editDisplayName(m);
    var vs=resolveEditVsRuntime();
    var hint=vs.aligned?t('habitEditBannerAligned','已与前台一致'):'';
    banner.hidden=false;
    banner.className='habit-scenario-context-banner habit-channel-edit-banner';
    banner.innerHTML=
      '<div class="habit-channel-edit-banner-main">'
      +'<span class="habit-channel-edit-banner-label">'
      +esc(t('habitEditingLabel','正在编辑')+'：'+name)
      +'</span>'
      +(hint?'<span class="habit-channel-edit-banner-hint">'+esc(hint)+'</span>':'')
      +'</div>'
      +'<div class="habit-channel-edit-banner-actions">'
      +'<button type="button" class="habit-channel-edit-banner-btn" data-habit-edit-switch-hub>'
      +esc(t('habitEditBannerSwitchHub','切换 →'))
      +'</button>'
      +'<button type="button" class="habit-channel-edit-banner-btn" data-habit-edit-follow-runtime>'
      +esc(t('habitEditBannerFollowRuntime','↻ 跟前台'))
      +'</button>'
      +'</div>';
    if(panelEl){
      panelEl.classList.add('has-channel-edit-banner');
      panelEl.classList.toggle('is-scenario-config',!!isAppScenarioMapping(m));
    }
  }

  function renderAll(){
    PANELS.forEach(renderPanel);
  }

  function bindOnce(){
    if(bound) return;
    bound=true;
    document.addEventListener('click',function(e){
      var hubBtn=e.target.closest&&e.target.closest('[data-habit-edit-switch-hub]');
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
    });
  }

  global.OneToneHabitChannelEditBanner={
    resolveEditMapping:resolveEditMapping,
    resolveEditVsRuntime:resolveEditVsRuntime,
    syncEditToRuntime:syncEditToRuntime,
    ensureEditContextFromRuntime:ensureEditContextFromRuntime,
    syncPanelContext:syncPanelContext,
    renderAll:renderAll,
    bindOnce:bindOnce
  };
})((typeof window!=='undefined')?window:globalThis);
