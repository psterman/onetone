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
    ui().voiceEditSchemeId='__global__';
    ui().cameraEditMode='global';
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
    if(baseline&&baseline.id){
      syncEditor(baseline.id);
    }else{
      // Fallback: first non-app mapping as global baseline.
      var maps=cfg.mappings||[];
      for(var i=0;i<maps.length;i++){
        var m=maps[i];
        if(!m||!m.id) continue;
        if(diff()&&diff().isAppScenarioMapping&&diff().isAppScenarioMapping(m)) continue;
        syncEditor(m.id);
        break;
      }
    }
    if(global.OneToneSettingsDrawer){
      if(!ui().drawerOpen&&typeof global.OneToneSettingsDrawer.open==='function'){
        global.OneToneSettingsDrawer.open({panel:'keys'});
      }else{
        global.OneToneSettingsDrawer.setPanel('keys');
      }
    }
    // Defer full render — setPanel already schedules keys mounts; stacking used to 假死.
    requestAnimationFrame(function(){
      setTimeout(function(){
        render();
        if(global.OneToneAgentCapabilityUi) global.OneToneAgentCapabilityUi.mountKeys();
      },60);
    });
  }

  function openGlobalVoice(opts){
    opts=opts||{};
    clearScenarioContext();
    if(opts.fromHub) ui().habitHubEditReturn=true;
    // Global voice base: page-local sentinel — do not claim selectedMappingId as「正在编辑」.
    state().selectedMappingId=null;
    ui().voiceEditSchemeId='__global__';
    if(global.OneToneSettingsDrawer) global.OneToneSettingsDrawer.setPanel('voiceWake');
    render();
    setTimeout(function(){
      if(global.OneToneAgentCapabilityUi) global.OneToneAgentCapabilityUi.mountVoice();
    },60);
  }

  function openGlobalCamera(opts){
    opts=opts||{};
    clearScenarioContext();
    if(opts.fromHub) ui().habitHubEditReturn=true;
    ui().cameraEditMode='global';
    // Global camera base (device/calibration/actions on cameraPrefs) — not habit edit.
    state().selectedMappingId=null;
    if(global.OneToneSettingsDrawer) global.OneToneSettingsDrawer.setPanel('camera');
    render();
    setTimeout(function(){
      if(global.OneToneAgentCapabilityUi&&global.OneToneAgentCapabilityUi.mountCamera){
        global.OneToneAgentCapabilityUi.mountCamera();
      }
    },60);
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

    function finishHeavy(){
      try{
        try{
          if(global.OneToneIpc&&global.OneToneIpc.invoke){
            global.OneToneIpc.invoke('cmd_app_log',{line:'fe openScenarioKeysEdit heavy begin id='+id}).catch(function(){});
          }
        }catch(_){}
        var T=global.OneToneAgentScenarioTemplate;
        var m=core()&&core().byId?core().byId(id):null;
        // Persist async after paint — sync cmd_save + full keys remount used to 假死.
        if(T&&T.ensurePackForMapping&&m) T.ensurePackForMapping(m,{persist:false});
        syncEditor(id);
        if(global.OneToneSettingsDrawer&&global.OneToneSettingsDrawer.refreshKeysPanel){
          global.OneToneSettingsDrawer.refreshKeysPanel();
        }else{
          var hooks=global.__vp_bootstrap_hooks__||{};
          if(hooks.renderKeyFinishFlowPanel) hooks.renderKeyFinishFlowPanel();
          if(global.OneToneKeysPanelUi) global.OneToneKeysPanelUi.render();
        }
        // Split full render / Codex mount / save off the keys-refresh tick (编辑习惯假死).
        requestAnimationFrame(function(){
          setTimeout(function(){
            try{
              if(normalizePanelSafe()!=='keys') return;
              render();
              if(global.OneToneAgentCapabilityUi) global.OneToneAgentCapabilityUi.mountKeys();
              var p=global.OneToneConfigPersist;
              if(p&&p.saveAsync) p.saveAsync();
              else if(p&&p.save) p.save();
              if(global.OneToneIpc&&global.OneToneIpc.invoke){
                global.OneToneIpc.invoke('cmd_app_log',{line:'fe openScenarioKeysEdit heavy done id='+id}).catch(function(){});
              }
            }catch(err2){
              try{ console.error('openScenarioKeysEdit late',err2); }catch(_){}
            }
          },0);
        });
      }catch(err){
        try{ console.error('openScenarioKeysEdit',err); }catch(_){}
      }
    }

    function normalizePanelSafe(){
      var drawer=global.OneToneSettingsDrawer;
      if(drawer&&drawer.normalizePanel) return drawer.normalizePanel(ui().settingsPanel||'');
      return String(ui().settingsPanel||'');
    }

    if(global.OneToneSettingsDrawer){
      // Ensure drawer is open (home「编辑」used to only setPanel → 无响应).
      // Paint keys chrome first, then load pack/pad (same pattern as habit hub).
      var keysOpts={panel:'keys',deferHeavy:true,afterHeavy:finishHeavy};
      if(!ui().drawerOpen&&typeof global.OneToneSettingsDrawer.open==='function'){
        global.OneToneSettingsDrawer.open(keysOpts);
      }else{
        global.OneToneSettingsDrawer.setPanel('keys',keysOpts);
      }
    }else{
      finishHeavy();
    }
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
    try{
      var Tv=global.OneToneAgentScenarioTemplate;
      var mv=core()&&core().byId?core().byId(id):null;
      if(Tv&&Tv.ensurePackForMapping&&mv) Tv.ensurePackForMapping(mv,{persist:true});
    }catch(_){}
    syncEditor(id);
    if(global.OneToneSettingsDrawer) global.OneToneSettingsDrawer.setPanel('voiceWake');
    render();
    setTimeout(function(){
      if(global.OneToneAgentCapabilityUi) global.OneToneAgentCapabilityUi.mountVoice();
    },60);
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
    ui().cameraEditMode='appScenario';
    try{
      var Tc=global.OneToneAgentScenarioTemplate;
      var mc=core()&&core().byId?core().byId(id):null;
      // Memory-only before paint — sync cmd_save + MediaPipe open used to 假死.
      if(Tc&&Tc.ensurePackForMapping&&mc) Tc.ensurePackForMapping(mc,{persist:false});
      syncEditor(id);
    }catch(_){}
    if(global.OneToneSettingsDrawer) global.OneToneSettingsDrawer.setPanel('camera');
    render();
    setTimeout(function(){
      var p=global.OneToneConfigPersist;
      if(p&&p.saveAsync) p.saveAsync();
      else if(p&&p.save) p.save();
    },120);
    // No Codex camera PackCard — apply lives on Habit Hub Codex card.
  }

  function returnToHabitHub(){
    ui().habitHubEditReturn=false;
    ui().habitScenarioReturnId=null;
    ui().habitScenarioReturnPanel=null;
    ui().habitScenarioReturnHub=false;
    ui().cameraEditMode='global';
    try{
      if(global.OneToneCodexMicroPadUi&&global.OneToneCodexMicroPadUi.stopBackgroundWork){
        global.OneToneCodexMicroPadUi.stopBackgroundWork();
      }
    }catch(_){}
    if(global.OneToneHabitHub&&global.OneToneHabitHub.showHub){
      global.OneToneHabitHub.showHub();
    }else{
      ui().habitView='hub';
      if(global.OneToneSettingsDrawer) global.OneToneSettingsDrawer.setPanel('habits');
    }
    // Banner hide after hub chrome paints — avoid stacking with hub HTML build.
    if(typeof requestAnimationFrame==='function'){
      requestAnimationFrame(function(){ setTimeout(function(){ render(); },0); });
    }else{
      setTimeout(function(){ render(); },0);
    }
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
      if(textEl){
        if(opts.panel==='camera'){
          textEl.textContent=(t('habitEditingLabel')||'正在编辑')+' · '+name;
        }else{
          textEl.textContent=t(panelTitleKey(opts.panel)).replace('{name}',name);
        }
      }
      if(subEl){
        if(opts.panel==='camera'){
          subEl.hidden=false;
          subEl.textContent=t('cameraEditingAppScenario')||t('habitScenarioContextCameraNote');
        }else{
          // Keys/voice: blue banner title is enough — no second "not global" line.
          subEl.textContent='';
          subEl.hidden=true;
        }
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
      if(textEl){
        if(opts.panel==='camera') textEl.textContent=t('habitGlobalBaseLabel')||t('habitHubContextEditingGlobal');
        else textEl.textContent=t('habitHubContextEditingGlobal');
      }
      if(subEl){
        if(opts.panel==='camera'){
          subEl.hidden=false;
          subEl.textContent=t('cameraConfiguringBase')||t('habitHubContextGlobalHint');
        }else{
          subEl.hidden=false;
          subEl.textContent=t('habitHubContextGlobalHint');
        }
      }
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
    if(global.OneToneHabitChannelStatusStrip){
      if(global.OneToneHabitChannelStatusStrip.bindOnce) global.OneToneHabitChannelStatusStrip.bindOnce();
      if(global.OneToneHabitChannelStatusStrip.render){
        try{ global.OneToneHabitChannelStatusStrip.render(); }catch(_){}
      }
    }
  }

  function saveCurrentScenario(){
    var h=global.__vp_bootstrap_hooks__||global.__vp_mapping_list_ui_hooks__||{};
    if(h.flushAllEditorToMappings) h.flushAllEditorToMappings();
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
