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
    if(global.OneToneHabitScenarioVoiceCommand&&global.OneToneHabitScenarioVoiceCommand.discardDraft){
      global.OneToneHabitScenarioVoiceCommand.discardDraft();
    }
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

  function openGlobalCamera(opts){
    opts=opts||{};
    clearScenarioContext();
    if(opts.fromHub) ui().habitHubEditReturn=true;
    if(global.OneToneSettingsDrawer) global.OneToneSettingsDrawer.setPanel('camera');
    render();
  }

  /** App-scenario key/voice/camera always reuses the full settings pages. */
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

  function openScenarioCameraEdit(id,opts){
    opts=opts||{};
    id=String(id||'').trim();
    if(!id) return;
    ui().habitHubEditReturn=false;
    ui().habitScenarioReturnHub=opts.returnToHub!==false;
    state().selectedMappingId=id;
    ui().habitScenarioReturnId=id;
    ui().habitScenarioReturnPanel='camera';
    syncEditor(id);
    if(global.OneToneSettingsDrawer) global.OneToneSettingsDrawer.setPanel('camera');
    render();
    if(global.OneToneCameraPresenceActions&&global.OneToneCameraPresenceActions.syncUiFromPrefs){
      try{ global.OneToneCameraPresenceActions.syncUiFromPrefs(); }catch(_){}
    }
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
      chipVoiceAcoustic:t('habitScenarioChipVoiceAcoustic'),
      chipCameraInherit:t('habitScenarioChipCameraInherit'),
      chipCameraOverride:t('habitScenarioChipCameraOverride'),
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
      enableOff:t('habitScenarioEnableOff'),
      onAway:t('cameraCardAwayTitle'),
      onReturn:t('cameraCardAwayTitle'),
      shakeHead:t('cameraCardShakeTitle'),
      deliberateBlink:t('cameraCardBlinkTitle'),
      openPalm:t('cameraCardOpenPalmTitle'),
      okHand:t('cameraCardOkHandTitle'),
      fist:t('cameraCardFistTitle'),
      wave:t('cameraCardWaveTitle')
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
    var voiceLbl;
    if(preview&&preview.acousticCommandCount>0){
      voiceLbl=t('habitScenarioStatusVoiceAcoustic').replace('{n}',String(preview.acousticCommandCount));
    }else if(preview&&preview.voiceOverrideCount>0){
      voiceLbl=t('habitScenarioStatusVoiceOverride').replace('{n}',String(preview.voiceOverrideCount));
    }else{
      voiceLbl=t('habitScenarioStatusVoiceInherit');
    }
    var cameraLbl=(preview&&preview.cameraOverrideCount>0)
      ?t('habitScenarioStatusCameraOverride').replace('{n}',String(preview.cameraOverrideCount))
      :t('habitScenarioStatusCameraInherit');
    return t('habitScenarioStatusSummary')
      .replace('{app}',appDisplayName(m.appTargetId)||m.appTargetId||'—')
      .replace('{keys}',keysLbl)
      .replace('{voice}',voiceLbl)
      .replace('{camera}',cameraLbl);
  }

  function setHidden(id,hidden){
    var el=$(id);
    if(el) el.hidden=!!hidden;
  }

  function setScenarioActionsVisible(ids,show){
    (ids||[]).forEach(function(id){ setHidden(id,!show); });
  }

  function panelTitleKey(panel){
    if(panel==='voice') return 'habitScenarioVoicePageTitle';
    if(panel==='camera') return 'habitScenarioCameraPageTitle';
    return 'habitScenarioKeysPageTitle';
  }

  function renderBannerIn(opts){
    var panel=$(opts.panelId);
    var banner=$(opts.bannerId);
    if(!banner) return;
    var scenarioM=returnMapping();
    var hubReturn=!!ui().habitHubEditReturn&&!scenarioM;
    var show=!!scenarioM||hubReturn;
    banner.hidden=!show;
    if(panel){
      panel.classList.toggle('has-scenario-context-banner',show);
      panel.classList.toggle('is-scenario-config',!!scenarioM);
    }
    var previewEl=$(opts.previewId);
    if(!show){
      setScenarioActionsVisible(opts.actionIds,false);
      if(previewEl) previewEl.hidden=true;
      return;
    }
    var textEl=$(opts.textId);
    var subEl=$(opts.subId);
    var backEl=$(opts.backId);
    if(scenarioM){
      var name=scenarioName(scenarioM);
      var preview=buildPreview(scenarioM);
      if(textEl) textEl.textContent=t(panelTitleKey(opts.panel)).replace('{name}',name);
      if(subEl){
        subEl.textContent=opts.panel==='camera'
          ?t('habitScenarioContextCameraNote')
          :t('habitScenarioContextNotGlobal');
      }
      if(previewEl){
        previewEl.hidden=false;
        previewEl.textContent=previewLine(scenarioM,preview);
      }
      setScenarioActionsVisible(opts.actionIds,true);
      var saveBtn=$(opts.saveId);
      if(saveBtn){
        saveBtn.disabled=!(preview&&preview.canSave);
        saveBtn.textContent=t('habitScenarioSaveBtn');
      }
      if(opts.toKeysId){
        var toKeys=$(opts.toKeysId);
        if(toKeys) toKeys.textContent=t('habitHubGlobalOpenKeys');
      }
      if(opts.toVoiceId){
        var toVoice=$(opts.toVoiceId);
        if(toVoice) toVoice.textContent=t('habitHubGlobalOpenVoice');
      }
      if(opts.toCameraId){
        var toCamera=$(opts.toCameraId);
        if(toCamera) toCamera.textContent=t('habitHubGlobalOpenCamera');
      }
      if(backEl) backEl.textContent=t('habitHubContextBack');
    }else if(hubReturn){
      if(textEl) textEl.textContent=t('habitHubContextEditingGlobal');
      if(subEl) subEl.textContent=t('habitHubContextGlobalHint');
      if(previewEl) previewEl.hidden=true;
      setScenarioActionsVisible(opts.actionIds,false);
      if(backEl) backEl.textContent=t('habitHubContextBack');
    }
  }

  function render(){
    renderBannerIn({
      panel:'keys',
      panelId:'settingsPanelKeys',
      bannerId:'habitScenarioContextBannerKeys',
      textId:'habitScenarioContextBannerKeysText',
      subId:'habitScenarioContextBannerKeysSub',
      previewId:'habitScenarioContextBannerKeysPreview',
      backId:'btnHabitScenarioContextBackKeys',
      saveId:'btnHabitScenarioContextSaveKeys',
      toVoiceId:'btnHabitScenarioContextToVoiceKeys',
      toCameraId:'btnHabitScenarioContextToCameraKeys',
      actionIds:['btnHabitScenarioContextSaveKeys','btnHabitScenarioContextToVoiceKeys','btnHabitScenarioContextToCameraKeys']
    });
    renderBannerIn({
      panel:'voice',
      panelId:'settingsPanelVoiceWake',
      bannerId:'habitScenarioContextBannerVoice',
      textId:'habitScenarioContextBannerVoiceText',
      subId:'habitScenarioContextBannerVoiceSub',
      previewId:'habitScenarioContextBannerVoicePreview',
      backId:'btnHabitScenarioContextBackVoice',
      saveId:'btnHabitScenarioContextSaveVoice',
      toKeysId:'btnHabitScenarioContextToKeysVoice',
      toCameraId:'btnHabitScenarioContextToCameraVoice',
      actionIds:['btnHabitScenarioContextSaveVoice','btnHabitScenarioContextToKeysVoice','btnHabitScenarioContextToCameraVoice']
    });
    renderBannerIn({
      panel:'camera',
      panelId:'settingsPanelCamera',
      bannerId:'habitScenarioContextBannerCamera',
      textId:'habitScenarioContextBannerCameraText',
      subId:'habitScenarioContextBannerCameraSub',
      previewId:'habitScenarioContextBannerCameraPreview',
      backId:'btnHabitScenarioContextBackCamera',
      saveId:'btnHabitScenarioContextSaveCamera',
      toKeysId:'btnHabitScenarioContextToKeysCamera',
      actionIds:['btnHabitScenarioContextSaveCamera','btnHabitScenarioContextToKeysCamera']
    });
    if(global.OneToneHabitScenarioVoiceCommand){
      if(global.OneToneHabitScenarioVoiceCommand.bindEvents) global.OneToneHabitScenarioVoiceCommand.bindEvents({});
      if(global.OneToneHabitScenarioVoiceCommand.render) global.OneToneHabitScenarioVoiceCommand.render();
    }
    if(global.OneToneVoiceStepWake&&global.OneToneVoiceStepWake.syncScenarioVoiceEditor){
      global.OneToneVoiceStepWake.syncScenarioVoiceEditor();
    }
  }

  function saveCurrentScenario(){
    var wiz=global.OneToneHabitScenarioWizard;
    if(wiz&&wiz.saveScenario) return wiz.saveScenario({fromPanel:true});
    return Promise.resolve(null);
  }

  function bindJump(id,fn){
    var btn=$(id);
    if(!btn) return;
    btn.addEventListener('click',function(e){
      e.preventDefault();
      var sid=String(ui().habitScenarioReturnId||'').trim();
      if(sid) fn(sid,{returnToHub:ui().habitScenarioReturnHub!==false});
    });
  }

  function bindEvents(){
    ['btnHabitScenarioContextBackKeys','btnHabitScenarioContextBackVoice','btnHabitScenarioContextBackCamera'].forEach(function(id){
      var btn=$(id);
      if(!btn) return;
      btn.addEventListener('click',function(e){
        e.preventDefault();
        returnFromBanner();
      });
    });
    ['btnHabitScenarioContextSaveKeys','btnHabitScenarioContextSaveVoice','btnHabitScenarioContextSaveCamera'].forEach(function(id){
      var saveBtn=$(id);
      if(saveBtn) saveBtn.addEventListener('click',function(e){
        e.preventDefault();
        saveCurrentScenario();
      });
    });
    bindJump('btnHabitScenarioContextToVoiceKeys',openScenarioVoiceEdit);
    bindJump('btnHabitScenarioContextToCameraKeys',openScenarioCameraEdit);
    bindJump('btnHabitScenarioContextToKeysVoice',openScenarioKeysEdit);
    bindJump('btnHabitScenarioContextToCameraVoice',openScenarioCameraEdit);
    bindJump('btnHabitScenarioContextToKeysCamera',openScenarioKeysEdit);
  }

  global.OneToneHabitScenarioContextBanner={
    render:render,
    bindEvents:bindEvents,
    clearScenarioContext:clearScenarioContext,
    openGlobalKeys:openGlobalKeys,
    openGlobalVoice:openGlobalVoice,
    openGlobalCamera:openGlobalCamera,
    openScenarioKeysEdit:openScenarioKeysEdit,
    openScenarioVoiceEdit:openScenarioVoiceEdit,
    openScenarioCameraEdit:openScenarioCameraEdit,
    returnToScenarioConsole:returnToScenarioConsole,
    returnToHabitHub:returnToHabitHub,
    buildPreview:buildPreview
  };
})((typeof window!=='undefined')?window:globalThis);
