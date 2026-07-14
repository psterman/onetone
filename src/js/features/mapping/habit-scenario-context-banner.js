(function(global){
  'use strict';

  var $=function(id){ return global.OneToneDom.$(id); };
  var t=function(key){ return global.OneToneI18n.t(key); };

  function state(){ return global.OneToneState.state; }
  function ui(){ return global.OneToneState.ui; }
  function core(){ return global.OneToneMappingCore; }
  function diff(){ return global.OneToneHabitOverrideDiff; }

  function esc(s){
    return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');
  }

  function scenarioName(m){
    if(!m) return '—';
    var hub=global.OneToneHabitHub;
    if(hub&&hub.habitName) return hub.habitName(m);
    return String(m.group||m.label||'').trim()||'—';
  }

  function appDisplayName(appId){
    if(global.OneToneAppBehaviorRules&&global.OneToneAppBehaviorRules.appDisplayName){
      return global.OneToneAppBehaviorRules.appDisplayName(appId);
    }
    return appId||'—';
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
    ui().habitScenarioReturnHub=false;
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

  /** App-scenario key/voice always reuses the full Keys / Voice pages. */
  function openScenarioKeysEdit(id,opts){
    opts=opts||{};
    id=String(id||'').trim();
    if(!id) return;
    ui().habitHubEditReturn=false;
    ui().habitScenarioReturnHub=opts.returnToHub!==false;
    state().selectedMappingId=id;
    ui().habitScenarioReturnId=id;
    ui().habitScenarioReturnPanel='keys';
    syncEditor(id);
    if(global.OneToneSettingsDrawer) global.OneToneSettingsDrawer.setPanel('keys');
    render();
  }

  function openScenarioVoiceEdit(id,opts){
    opts=opts||{};
    id=String(id||'').trim();
    if(!id) return;
    ui().habitHubEditReturn=false;
    ui().habitScenarioReturnHub=opts.returnToHub!==false;
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
    ui().habitScenarioReturnHub=false;
    if(global.OneToneHabitHub&&global.OneToneHabitHub.showHub){
      global.OneToneHabitHub.showHub();
    }else{
      ui().habitView='hub';
      if(global.OneToneSettingsDrawer) global.OneToneSettingsDrawer.setPanel('habits');
    }
    render();
  }

  function returnToScenarioConsole(){
    // Middle console retired for existing scenarios — always return to habit hub.
    returnToHabitHub();
  }

  function returnFromBanner(){
    var scenarioM=returnMapping();
    if(scenarioM){
      if(ui().habitScenarioReturnHub!==false) returnToHabitHub();
      else returnToScenarioConsole();
      return;
    }
    if(ui().habitHubEditReturn) returnToHabitHub();
  }

  function previewLabels(){
    return {
      chipAppSelected:t('habitScenarioChipAppSelected'),
      chipAppMissing:t('habitScenarioChipAppMissing'),
      chipNameOk:t('habitScenarioChipNameOk'),
      chipNameMissing:t('habitScenarioChipNameMissing'),
      chipKeysInherit:t('habitScenarioChipKeysInherit'),
      chipKeysOverride:t('habitScenarioChipKeysOverride'),
      chipVoiceInherit:t('habitScenarioChipVoiceInherit'),
      chipVoiceOverride:t('habitScenarioChipVoiceOverride'),
      chipSaveReady:t('habitScenarioChipSaveReady'),
      chipSaveEmpty:t('habitScenarioChipSaveEmpty'),
      chipSaveBlocked:t('habitScenarioChipSaveBlocked'),
      triggerKey:t('keysSummaryTriggerLbl'),
      targetKey:t('targetTitle'),
      finish:t('habitSummaryFinishLbl'),
      engine:t('voiceColRecognize'),
      wakePhrases:t('voiceColWake'),
      endPhrases:t('endPhrasesLabel'),
      enableScenario:t('habitScenarioEnableScenario'),
      enableKeys:t('habitScenarioEnableKeys'),
      enableVoice:t('habitScenarioEnableVoice'),
      enableOff:t('habitScenarioEnableOff')
    };
  }

  function buildPreview(m){
    if(!m||!diff()||!diff().buildScenarioSavePreview) return null;
    var cfg=state().config||{};
    var appId=String(m.appTargetId||'').trim();
    return diff().buildScenarioSavePreview(m,cfg,{
      name:scenarioName(m),
      appName:appDisplayName(appId),
      scope:t('habitScenarioAppExe').replace('{app}',appDisplayName(appId)||appId),
      mappingCore:core(),
      labels:previewLabels()
    });
  }

  function previewLine(m,preview){
    if(!m) return '';
    var keysLbl=(preview&&preview.keysOverrideCount>0)
      ?t('habitScenarioStatusKeysOverride').replace('{n}',String(preview.keysOverrideCount))
      :t('habitScenarioStatusKeysInherit');
    var voiceLbl=(preview&&preview.voiceOverrideCount>0)
      ?t('habitScenarioStatusVoiceOverride').replace('{n}',String(preview.voiceOverrideCount))
      :t('habitScenarioStatusVoiceInherit');
    return t('habitScenarioStatusSummary')
      .replace('{app}',appDisplayName(m.appTargetId)||m.appTargetId||'—')
      .replace('{keys}',keysLbl)
      .replace('{voice}',voiceLbl);
  }

  function setScenarioActionVisible(saveId,switchId,show){
    var saveBtn=$(saveId);
    var switchBtn=$(switchId);
    if(saveBtn) saveBtn.hidden=!show;
    if(switchBtn) switchBtn.hidden=!show;
  }

  function renderBannerIn(panelId,bannerId,textId,subId,previewId,backId,saveId,switchId,isKeysPanel){
    var panel=$(panelId);
    var banner=$(bannerId);
    if(!banner) return;
    var scenarioM=returnMapping();
    var hubReturn=!!ui().habitHubEditReturn&&!scenarioM;
    var show=!!scenarioM||hubReturn;
    banner.hidden=!show;
    if(panel){
      panel.classList.toggle('has-scenario-context-banner',show);
      panel.classList.toggle('is-scenario-config',!!scenarioM);
    }
    var previewEl=$(previewId);
    if(!show){
      setScenarioActionVisible(saveId,switchId,false);
      if(previewEl) previewEl.hidden=true;
      return;
    }
    var textEl=$(textId);
    var subEl=$(subId);
    var backEl=$(backId);
    if(scenarioM){
      var name=scenarioName(scenarioM);
      var preview=buildPreview(scenarioM);
      if(textEl){
        textEl.textContent=isKeysPanel
          ?t('habitScenarioKeysPageTitle').replace('{name}',name)
          :t('habitScenarioVoicePageTitle').replace('{name}',name);
      }
      if(subEl) subEl.textContent=t('habitScenarioContextNotGlobal');
      if(previewEl){
        previewEl.hidden=false;
        previewEl.textContent=previewLine(scenarioM,preview);
      }
      setScenarioActionVisible(saveId,switchId,true);
      var saveBtn=$(saveId);
      if(saveBtn){
        saveBtn.disabled=!(preview&&preview.canSave);
        saveBtn.textContent=t('habitScenarioSaveBtn');
      }
      var switchBtn=$(switchId);
      if(switchBtn){
        switchBtn.textContent=isKeysPanel?t('habitHubGlobalOpenVoice'):t('habitHubGlobalOpenKeys');
      }
      if(backEl) backEl.textContent=t('habitHubContextBack');
    }else if(hubReturn){
      if(textEl) textEl.textContent=t('habitHubContextEditingGlobal');
      if(subEl) subEl.textContent=t('habitHubContextGlobalHint');
      if(previewEl) previewEl.hidden=true;
      setScenarioActionVisible(saveId,switchId,false);
      if(backEl) backEl.textContent=t('habitHubContextBack');
    }
  }

  function render(){
    renderBannerIn(
      'settingsPanelKeys','habitScenarioContextBannerKeys',
      'habitScenarioContextBannerKeysText','habitScenarioContextBannerKeysSub','habitScenarioContextBannerKeysPreview',
      'btnHabitScenarioContextBackKeys','btnHabitScenarioContextSaveKeys','btnHabitScenarioContextToVoiceKeys',
      true
    );
    renderBannerIn(
      'settingsPanelVoiceWake','habitScenarioContextBannerVoice',
      'habitScenarioContextBannerVoiceText','habitScenarioContextBannerVoiceSub','habitScenarioContextBannerVoicePreview',
      'btnHabitScenarioContextBackVoice','btnHabitScenarioContextSaveVoice','btnHabitScenarioContextToKeysVoice',
      false
    );
  }

  function saveCurrentScenario(){
    var wiz=global.OneToneHabitScenarioWizard;
    if(wiz&&wiz.saveScenario) return wiz.saveScenario({fromPanel:true});
    return Promise.resolve(null);
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
    var saveKeys=$('btnHabitScenarioContextSaveKeys');
    if(saveKeys) saveKeys.addEventListener('click',function(e){
      e.preventDefault();
      saveCurrentScenario();
    });
    var saveVoice=$('btnHabitScenarioContextSaveVoice');
    if(saveVoice) saveVoice.addEventListener('click',function(e){
      e.preventDefault();
      saveCurrentScenario();
    });
    var toVoice=$('btnHabitScenarioContextToVoiceKeys');
    if(toVoice) toVoice.addEventListener('click',function(e){
      e.preventDefault();
      var id=String(ui().habitScenarioReturnId||'').trim();
      if(id) openScenarioVoiceEdit(id,{returnToHub:ui().habitScenarioReturnHub!==false});
    });
    var toKeys=$('btnHabitScenarioContextToKeysVoice');
    if(toKeys) toKeys.addEventListener('click',function(e){
      e.preventDefault();
      var id=String(ui().habitScenarioReturnId||'').trim();
      if(id) openScenarioKeysEdit(id,{returnToHub:ui().habitScenarioReturnHub!==false});
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
    returnToHabitHub:returnToHabitHub,
    buildPreview:buildPreview
  };
})((typeof window!=='undefined')?window:globalThis);
