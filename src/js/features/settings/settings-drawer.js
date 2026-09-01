(function(global){

  'use strict';

  var ui=global.OneToneState.ui;

  var $=function(id){ return global.OneToneDom.$(id); };

  var t=function(key){ return global.OneToneI18n.t(key); };

  function hooks(){ return global.__vp_settings_drawer_hooks__ || {}; }

  function state(){ return global.OneToneState.state; }

  var PANEL_IDS={

    basic:'settingsPanelBasic',keys:'settingsPanelKeys',softPad:'settingsPanelSoftPad',voiceWake:'settingsPanelVoiceWake',scenes:'settingsPanelScenes',

    habits:'settingsPanelHabits',sounds:'settingsPanelSounds',debug:'settingsPanelDebug',

    camera:'settingsPanelCamera',tray:'settingsPanelTray'

  };

  function resolveSettingsPanelRequest(panel,opts){
    opts=opts||{};
    if(panel==='voiceEnd') panel='voiceWake';
    if(panel==='actionHistory') panel='habits';
    if(panel==='general'){
      return {
        panel:'debug',
        opts:Object.assign({},opts,{debugMode:opts.debugMode||'repair'})
      };
    }
    if(panel==='models'){
      return {
        panel:'voiceWake',
        opts:Object.assign({},opts,{
          voiceSubpage:opts.voiceSubpage||'recognize',
          scrollTarget:opts.scrollTarget||'voiceRecognizeResourcesDetails'
        })
      };
    }
    if(panel==='scenes') panel='habits';
    return {panel:panel,opts:opts};
  }

  var lastPanel='basic';

  function syncSubnavRail(){
    var rail=$('settingsSubnavRail');
    if(!rail) return;
    var scheme=$('settingsSchemeSubnav');
    var voice=$('settingsSceneVoiceSubnav');
    var debug=$('settingsDebugSubnav');
    var show=(scheme&&!scheme.hidden)||(voice&&!voice.hidden)||(debug&&!debug.hidden);
    rail.hidden=!show;
  }

  function syncWorkbenchNav(panel,opts){
    if(!global.OneToneHomeWorkbench||!global.OneToneHomeWorkbench.syncNavActiveState) return;
    if(!$('wbLeftNav')) return;
    opts=opts||{};
    if(panel==='debug'&&global.OneToneVoiceDiag&&global.OneToneVoiceDiag.getFocusMode&&!opts.debugMode){
      opts.debugMode=global.OneToneVoiceDiag.getFocusMode();
    }
    global.OneToneHomeWorkbench.syncNavActiveState(panel,opts);
  }

  function isWorkbenchShell(){
    return !!$('wbLeftNav');
  }



  function normalizePanel(panel){

    if(panel==='keyWake') return 'keys';

    // scenes 死壳：导航已迁 habits；兜底映射避免落到 settingsPanelScenes
    if(panel==='scenes') return 'habits';

    return panel;

  }



  function isKeysPanel(panel){

    panel=normalizePanel(panel||(ui.settingsPanel||''));

    return panel==='keys';

  }



  function isHabitsPanel(panel){

    panel=panel||(ui.settingsPanel||'');

    return panel==='habits';

  }



  function openVoiceAdvancedSection(){
    const el=$('voiceRecognizeEngineDetails');
    if(el&&el.tagName==='DETAILS') el.open=true;
    if(global.OneToneVoicePageState&&global.OneToneVoicePageState.setStep){
      global.OneToneVoicePageState.setStep('recognize');
    }
  }



  function scrollSettingsToTarget(ids){

    requestAnimationFrame(function(){

      requestAnimationFrame(function(){

        for(let i=0;i<ids.length;i++){

          const el=$(ids[i]);

          if(!el) continue;

          const wrap=$('settingsPanelWrap');

          if(wrap&&wrap.contains(el)){

            const er=el.getBoundingClientRect();

            const wr=wrap.getBoundingClientRect();

            if(er.top<wr.top+8) wrap.scrollTop+=er.top-wr.top-12;

            else if(er.bottom>wr.bottom-8) wrap.scrollTop+=er.bottom-wr.bottom+12;

          }else{

            el.scrollIntoView({behavior:'smooth',block:'nearest'});

          }

          break;

        }

      });

    });

  }



  function focusSettingsField(focus){

    if(!focus) return;

    if(focus==='mappings'){

      setSettingsPanel('habits');

      scrollSettingsToTarget(['habitHubList','settingsPanelHabits']);

      return;

    }

    if(focus==='trigger'||focus==='target'||focus==='keyFinishFlow'||focus==='finish'||focus==='cancel'){

      var prevPanel=ui.settingsPanel?String(ui.settingsPanel):'';

      setSettingsPanel('keys');

      var step=focus==='keyFinishFlow'||focus==='finish'?'finish':focus;

      var editOpts={};

      if(prevPanel&&prevPanel!=='keys') editOpts.returnPanel=prevPanel;

      hooks().focusSchemeEditStep(step,editOpts);

      return;

    }

    if(focus==='cameraActions'||focus==='cameraPresence'){
      setSettingsPanel('camera');
      try{
        var triggerBtn=document.getElementById('cameraFlowNodeTrigger');
        if(triggerBtn&&typeof triggerBtn.click==='function') triggerBtn.click();
      }catch(_){}
      scrollSettingsToTarget(['cameraPresenceConfig','cameraRulesBasic','cameraBindRowAway','cameraPanelTrigger']);
      return;
    }

    if(focus==='softPadLayout'||focus==='softPadDisplay'||focus==='softPadStatus'){
      setSettingsPanel('softPad');
      setTimeout(function(){
        var flowId=focus==='softPadStatus'?'softPadFlowNodeAgent':'softPadFlowNodePad';
        var flowBtn=document.getElementById(flowId);
        if(flowBtn&&typeof flowBtn.click==='function') flowBtn.click();
        if(focus!=='softPadStatus'){
          var mode=focus==='softPadLayout'?'keys':'appear';
          var tab=document.querySelector('[data-pad-mode="'+mode+'"]');
          if(tab&&typeof tab.click==='function') tab.click();
        }
        scrollSettingsToTarget(focus==='softPadStatus'
          ?['softPadFaceAgent','softPadStatusBar']
          :['softPadSubpageHost','softPadPreviewHost']);
      },0);
      return;
    }

    if(focus==='recordingAudio'){
      if(ui.settingsPanel!=='voiceWake') setSettingsPanel('voiceWake');
      if(global.OneToneVoicePageState&&global.OneToneVoicePageState.setStep){
        global.OneToneVoicePageState.setStep('recognize');
      }
      scrollSettingsToTarget(['recordingAudioCard']);
      return;
    }

    if(focus==='engine'){

      openVoiceAdvancedSection();
      scrollSettingsToTarget(['voiceSummaryEngineSwitch','voiceRecognizeSourceGrid']);

    }

    if(focus==='wakePhrases'){
      if(global.OneToneVoiceWakeNavigation&&global.OneToneVoiceWakeNavigation.openPresetsEditor){
        global.OneToneVoiceWakeNavigation.openPresetsEditor({skipScroll:true});
      }else if(global.OneToneVoicePageState&&global.OneToneVoicePageState.setStep){
        global.OneToneVoicePageState.setStep('wake');
      }
    }

    if(focus==='endPhrases'){
      if(global.OneToneVoicePageState&&global.OneToneVoicePageState.setStep){
        global.OneToneVoicePageState.setStep('recognize');
      }
    }

    if(focus==='wakePhrases'){

      hooks().setVoiceWakeExpandedMode(hooks().currentVoiceMode()==='vosk'?'vosk':(global.OneToneVoiceEngineReadiness&&global.OneToneVoiceEngineReadiness.isVoskOnlyUi()?'vosk':'sapi'));

      hooks().renderVoiceModeSwitch();

    }else if(focus==='engine'){

      const active=hooks().currentVoiceMode();
      var fallback=(global.OneToneVoiceEngineReadiness&&global.OneToneVoiceEngineReadiness.isVoskOnlyUi())?'vosk':(global.OneToneVoiceWake.getExpandedMode()||'vosk');

      hooks().setVoiceWakeExpandedMode(active==='vosk'?'vosk':active==='sapi'?'sapi':active==='kws'?'kws':fallback);

      hooks().renderVoiceModeSwitch();

    }

    const detailByFocus={

      trigger:'quickKeyWakeSection',

      target:'quickKeyWakeSection',

      mic:'voiceMicSection',

      engine:'voiceRecognizeEngineDetails',

      endPhrases:'voiceRecognizeEndDetails',

      autoSend:'voiceSettingsAutoCard',

      delay:'voiceSettingsAutoCard'

    };

    const detailId=detailByFocus[focus];

    if(detailId){

      const detail=$(detailId);

      if(detail&&detail.tagName==='DETAILS') detail.open=true;

    }

    if(focus==='mic'){

      if(global.OneToneVoiceWakeNavigation&&global.OneToneVoiceWakeNavigation.openMicPicker){
        global.OneToneVoiceWakeNavigation.openMicPicker({block:'nearest'});
      }else{
        const micRail=$('voiceFeedbackRail');
        if(micRail) micRail.scrollIntoView({behavior:'smooth',block:'nearest'});
      }

    }

    var wakeNav=global.OneToneVoiceWakeNavigation;
    var wakePhraseTargets=wakeNav&&wakeNav.resolveFocusTargets
      ?wakeNav.resolveFocusTargets('wakePhrases')
      :['voiceSettingsWakeCard','voiceWakeCustomDetails'];

    const map={

      trigger:['habitKeyMappingSection','btnRecordTrigger','keySchemeEditTrigger'],

      target:['habitKeyMapRowTarget','habitKeyMappingSection','keySchemeEditTarget'],

      mappings:['habitMappingsSection','mappingListTitle'],

      keyFinishFlow:['keysCaptureKeyPanel','keysFinishModeHost','habitFinishCard'],

      mic:['micDeviceList','micTitle'],

      engine:['voiceRecognizeEngineDetails','voiceModePanel'],

      wakePhrases:wakePhraseTargets,

      modelResources:['voiceRecognizeResourcesDetails','voiceRecognizeResources'],

      endPhrases:['voiceRecognizeEndDetails','voiceEndPresetsWrap'],

      autoSend:['voiceSettingsAutoCard'],

      delay:['voiceSettingsDelayRange']

    };

    scrollSettingsToTarget(map[focus]||[]);

  }



  function refreshKeysPanel(){

    if(global.OneToneHabitKeyMappingTable&&global.OneToneHabitKeyMappingTable.mount){
      global.OneToneHabitKeyMappingTable.mount();
    }

    hooks().renderKeyFinishFlowPanel();

    if(global.OneToneHabitKeyMappingTable) global.OneToneHabitKeyMappingTable.syncRowStatus();

    if(global.OneToneImePresets) global.OneToneImePresets.refresh('mapping');

    if(global.OneToneSceneFlowSummary) global.OneToneSceneFlowSummary.render();

    if(global.OneToneKeysPanelUi) global.OneToneKeysPanelUi.render();

    if(global.OneToneSceneTabs&&global.OneToneSceneTabs.renderHabitVoiceDeviceSummary){

      global.OneToneSceneTabs.renderHabitVoiceDeviceSummary();

    }

    // Light slot/toggle sync only — full renderSoundSettingsPanel builds pickers + i18n
    // and used to 假死 when opening keys / habits refresh.
    try{
      if(global.OneToneAppThemePrefs&&typeof global.OneToneAppThemePrefs.syncSoundsSettingsUi==='function'){
        global.OneToneAppThemePrefs.syncSoundsSettingsUi();
      }
    }catch(_){}

    requestAnimationFrame(function(){

      if(!ui.drawerOpen||!isKeysPanel()) return;

      hooks().renderMappingChrome();

      hooks().renderEditor();

    });

  }



  function feLog(line){
    try{
      if(global.OneToneIpc&&global.OneToneIpc.invoke){
        global.OneToneIpc.invoke('cmd_app_log',{line:String(line||'')}).catch(function(){});
      }
    }catch(_){}
  }

  function refreshHabitsPanel(){
    var view=ui.habitView||'hub';
    feLog('fe habit panel refresh begin view='+view);
    var t0=(typeof performance!=='undefined'&&performance.now)?performance.now():Date.now();

    function finishHeavy(){
      try{
        if(normalizePanel(ui.settingsPanel)!=='habits') return;
        if(view==='wizard'&&global.OneToneHabitScenarioWizard){
          global.OneToneHabitScenarioWizard.render();
        }else if(view==='hub'&&global.OneToneHabitHub){
          global.OneToneHabitHub.render();
        }
        // Hub: only list + shell. Defer layer/voice chrome until user opens a scenario.
        if(view==='hub'){
          if(global.OneToneHabitLayerNav&&global.OneToneHabitLayerNav.onPanelVisibility){
            global.OneToneHabitLayerNav.onPanelVisibility();
          }
        }else{
          if(global.OneToneSceneTabs) global.OneToneSceneTabs.render();
          if(global.OneToneSceneFlowSummary) global.OneToneSceneFlowSummary.render();
          if(global.OneToneHabitLayerNav) global.OneToneHabitLayerNav.onPanelVisibility();
          if(global.OneToneSceneVoiceTab) global.OneToneSceneVoiceTab.render();
        }
        var ms=Math.round(((typeof performance!=='undefined'&&performance.now)?performance.now():Date.now())-t0);
        feLog('fe habit panel refresh done '+ms+'ms view='+view);
      }catch(err){
        feLog('fe habit panel refresh fail '+String(err&&err.message?err.message:err));
        console.error('habit panel refresh',err);
      }
    }

    // Paint drawer chrome first — sync hub HTML used to 假死 the UI thread on open.
    if(view==='hub'&&global.OneToneHabitHub&&global.OneToneHabitHub.applyShellVisibility){
      try{ global.OneToneHabitHub.applyShellVisibility(); }catch(_){}
    }
    if(typeof requestAnimationFrame==='function'){
      requestAnimationFrame(function(){ setTimeout(finishHeavy,0); });
    }else{
      setTimeout(finishHeavy,0);
    }

    // Keys chrome is for keys panel — skip on habits hub (was remounting scheme/voice UI).
    if(view!=='hub'){
      requestAnimationFrame(function(){
        if(!ui.drawerOpen||!isHabitsPanel()) return;
        hooks().renderMappingChrome();
      });
    }
  }

  function stopKeysPanelBackgroundWork(){
    try{
      if(global.OneToneCodexMicroPadUi&&global.OneToneCodexMicroPadUi.stopBackgroundWork){
        global.OneToneCodexMicroPadUi.stopBackgroundWork();
      }
    }catch(_){}
  }



  function resetSettingsLayoutScroll(opts){

    opts=opts||{};

    window.scrollTo(0,0);

    document.documentElement.scrollTop=0;

    document.body.scrollTop=0;

    const mainScroll=document.querySelector('.main-scroll');

    if(mainScroll) mainScroll.scrollTop=0;

    if(opts.resetPanel){

      const panelWrap=$('settingsPanelWrap');

      if(panelWrap) panelWrap.scrollTop=0;

    }

  }

  function syncSettingsMicPoll(panel){

    if(!ui.drawerOpen) return;

    if(panel==='voiceWake'){
      // Events drive levels while Vosk listens; poll dual-path idle 假死'd (~14min).
      if(hooks().stopMicLevelPoll) hooks().stopMicLevelPoll();
      hooks().stopMicMonitor();
      return;
    }

    if(panel==='debug'){
      // Debug keeps Vosk live — poll shared MicLevelState for level bars while drawer open.
      if(hooks().voiceCaptureActive()&&hooks().startMicLevelPoll){
        hooks().startMicLevelPoll();
      }else{
        hooks().stopMicLevelPoll();
        if(!hooks().voiceCaptureActive()) hooks().stopMicMonitor();
      }
      return;
    }

    hooks().stopMicLevelPoll();

    if(!hooks().voiceCaptureActive()) hooks().stopMicMonitor();

  }

  function navHighlightPanel(panel){
    if(panel==='scenes') return 'habits';
    return panel;
  }

  function openScenarioDetail(id,opts){
    opts=opts||{};
    if(id) state().selectedMappingId=id;
    var m=global.OneToneMappingCore&&global.OneToneMappingCore.byId
      ?global.OneToneMappingCore.byId(id||state().selectedMappingId)
      :null;
    var isApp=m&&global.OneToneHabitHub&&global.OneToneHabitHub.isAppScope
      ?global.OneToneHabitHub.isAppScope(m)
      :!!(m&&String(m.appTargetId||'').trim());
    if(isApp&&global.OneToneHabitScenarioContextBanner){
      var sid=id||state().selectedMappingId;
      if(opts.openCamera) global.OneToneHabitScenarioContextBanner.openScenarioCameraEdit(sid,{returnToHub:true});
      else if(opts.layer==='advanced'||opts.voiceTab||opts.openVoice){
        global.OneToneHabitScenarioContextBanner.openScenarioVoiceEdit(sid,{returnToHub:true});
      }else{
        global.OneToneHabitScenarioContextBanner.openScenarioKeysEdit(sid,{returnToHub:true});
      }
      return;
    }
    if(m){
      var api=global.OneToneHabitOverrideDiff;
      var isBaseline=api&&api.isGlobalBaselineMapping
        &&api.isGlobalBaselineMapping(m,state().config,global.OneToneMappingCore);
      if(isBaseline&&global.OneToneHabitScenarioContextBanner){
        if(opts.openCamera) global.OneToneHabitScenarioContextBanner.openGlobalCamera({fromHub:true});
        else if(opts.layer==='advanced'||opts.voiceTab){
          global.OneToneHabitScenarioContextBanner.openGlobalVoice({fromHub:true});
        }else{
          global.OneToneHabitScenarioContextBanner.openGlobalKeys({fromHub:true});
        }
        return;
      }
      setSettingsPanel('habits');
      if(global.OneToneHabitHub) global.OneToneHabitHub.showHub();
      if(global.OneToneAppToast) global.OneToneAppToast.show(global.OneToneI18n.t('habitHubLegacyGlobalHint'),'scheme');
      return;
    }
    var hooks=global.__vp_bootstrap_hooks__||{};
    if(hooks.syncEditorFromSelection) hooks.syncEditorFromSelection();
    setSettingsPanel('keys');
    if(opts.layer==='advanced'){
      ui.habitAdvancedFocus='voice';
    }
    if(global.OneToneSceneVoiceTab) global.OneToneSceneVoiceTab.render();
    if(global.OneToneSceneTabs) global.OneToneSceneTabs.render();
  }

  function openHabitWizard(opts){
    opts=opts||{};
    if(opts.editId&&global.OneToneHabitScenarioContextBanner){
      global.OneToneHabitScenarioContextBanner.openScenarioKeysEdit(opts.editId,{returnToHub:true});
      return;
    }
    if(global.OneToneHabitHub&&global.OneToneHabitHub.startInlineCreate){
      global.OneToneHabitHub.startInlineCreate();
      return;
    }
    if(global.OneToneHabitScenarioWizard){
      if(opts.editId) global.OneToneHabitScenarioWizard.openEdit(opts.editId,opts);
      else global.OneToneHabitScenarioWizard.openNew();
    }else{
      openScenarioHub();
    }
  }

  function openScenarioHub(){
    setSettingsPanel('habits');
  }

  function scrollToVoiceAction(navId){
    if(global.OneToneVoiceSubpages&&typeof global.OneToneVoiceSubpages.setPage==='function'){
      var page='wake';
      if(navId==='voice:sapi'||navId==='voice:vosk') page='recognize';
      else if(navId==='voice:end') page='recognize';
      global.OneToneVoiceSubpages.setPage(page,{scrollIntoView:true});
      if(page==='recognize'&&global.OneToneVoiceSettingsFlow&&global.OneToneVoiceSettingsFlow.setRecognizeNavState){
        global.OneToneVoiceSettingsFlow.setRecognizeNavState('voiceAdvancedSection');
      }
      if(navId==='voice:end'&&global.OneToneVoiceSettingsFlow&&global.OneToneVoiceSettingsFlow.setRecognizeNavState){
        global.OneToneVoiceSettingsFlow.setRecognizeNavState('voiceEndRulesSection');
      }
      return;
    }
    var ids=['voiceSettingsWakeCard'];
    if(navId==='voice:sapi'){
      ids=['voiceSettingsEndPhraseCard','voiceRecognizeEngineDetails','voiceSapiBlock'];
      var det=$('voiceRecognizeEngineDetails');
      if(det) det.open=true;
    }else if(navId==='voice:vosk'){
      ids=['voiceSettingsEndPhraseCard','voiceRecognizeEngineDetails','voiceVoskBlock'];
      var detV=$('voiceRecognizeEngineDetails');
      if(detV) detV.open=true;
    }else if(navId==='voice:end'){
      ids=['voiceSettingsEndPhraseCard','voiceEndRulesSection'];
      if(global.OneToneVoiceSettingsFlow&&global.OneToneVoiceSettingsFlow.setRecognizeNavState){
        global.OneToneVoiceSettingsFlow.setRecognizeNavState('voiceEndRulesSection');
      }
    }
    scrollSettingsToTarget(ids);
    if((navId==='voice:sapi'||navId==='voice:vosk')&&global.OneToneVoiceSettingsFlow&&global.OneToneVoiceSettingsFlow.setRecognizeNavState){
      global.OneToneVoiceSettingsFlow.setRecognizeNavState('voiceAdvancedSection');
    }
  }

  function setSettingsPanel(panel,opts){
    opts=opts||{};
    var resolved=resolveSettingsPanelRequest(panel,opts);
    panel=normalizePanel(resolved.panel);
    opts=resolved.opts||{};

    const ids=PANEL_IDS;

    if(!ids[panel]) panel='basic';

    const enteringVoice=panel==='voiceWake'&&lastPanel!=='voiceWake';

    const panelChanged=panel!==lastPanel;

    // Leave camera / open non-camera: pause infer before heavy paint (same-turn MediaPipe 假死).
    if(ui.drawerOpen&&panel!=='camera'&&(panelChanged||lastPanel==='camera')){
      try{
        var paLeave=global.OneToneCameraPresenceActions;
        if(paLeave&&typeof paLeave.setDrawerUiPaused==='function'){
          paLeave.setDrawerUiPaused(true);
        }
      }catch(_){}
    }

    if(panelChanged&&panel!=='keys'&&global.OneToneTargetKeyPicker&&global.OneToneTargetKeyPicker.close){
      global.OneToneTargetKeyPicker.close();
    }
    if(panelChanged&&panel!=='keys'){
      var capPicker=global.OneToneKeysChannelCommandPicker;
      if(capPicker&&(capPicker.closeCapturePopover||capPicker.closeCaptureSheet)){
        try{
          var closeFn=capPicker.closeCapturePopover||capPicker.closeCaptureSheet;
          closeFn.call(capPicker,{ keepPanel:true, skipStep:true });
        }catch(_){}
      }
    }

    // Leaving keys: stop pad readiness remount/poll so「我的习惯」open is not stacked under it.
    if(panelChanged&&lastPanel==='keys'&&panel!=='keys'){
      stopKeysPanelBackgroundWork();
    }
    if(panelChanged&&lastPanel==='softPad'&&panel!=='softPad'){
      if(global.OneToneCodexMicroPadUi&&global.OneToneCodexMicroPadUi.stopBackgroundWork){
        global.OneToneCodexMicroPadUi.stopBackgroundWork();
      }
      if(global.OneToneSoftPadHub&&global.OneToneSoftPadHub.onPanelLeave){
        try{ global.OneToneSoftPadHub.onPanelLeave(); }catch(_){}
      }else{
        var softPreview=document.getElementById('softPadPreviewHost');
        var softSub=document.getElementById('softPadSubpageBody');
        var softTiles=document.getElementById('softPadFuncTiles');
        if(softPreview) softPreview.replaceChildren();
        if(softSub) softSub.replaceChildren();
        if(softTiles) softTiles.innerHTML='';
      }
    }
    if(panelChanged&&lastPanel==='tray'&&panel!=='tray'){
      var trayUiLeave=global.OneToneSoftPadTrayUi;
      if(trayUiLeave&&trayUiLeave.onPanelLeave){
        try{ trayUiLeave.onPanelLeave(); }catch(_){}
      }
    }
    // Leaving voiceWake: bump openGen so in-flight chrome/heavy RAF cannot paint stale.
    if(panelChanged&&lastPanel==='voiceWake'&&panel!=='voiceWake'){
      try{ document.documentElement.classList.remove('ot-voice-wake-park'); }catch(_){}
      if(global.OneToneVoiceWake&&typeof global.OneToneVoiceWake.bumpOpenGen==='function'){
        try{ global.OneToneVoiceWake.bumpOpenGen(); }catch(_){}
      }
      if(global.OneToneUiHeartbeat&&global.OneToneUiHeartbeat.clearTag){
        ['voiceOpen:enter','voiceOpen:chrome','voiceOpen:heavy','voiceOpen:modeSwitch','voiceOpen:flow'].forEach(function(tag){
          try{ global.OneToneUiHeartbeat.clearTag(tag); }catch(_){}
        });
      }
    }

    ui.settingsPanel=panel;

    if(ui.drawerOpen){
      setSettingsDrawerGate(true,{panel:panel});
    }

    // Flush deferred mvp_init only after leaving Soft Pad / keys / camera — never while still on one
    // (softPad→camera used to flush remount + MediaPipe open in the same turn → 假死).
    if(panelChanged&&global.OneToneConfigPersist){
      var blocked=global.OneToneConfigPersist.mvpInitHeavyRemountBlocked;
      if(typeof blocked==='function'&&!blocked()&&
         typeof global.OneToneConfigPersist.flushDeferredMvpInitSideEffects==='function'){
        try{ global.OneToneConfigPersist.flushDeferredMvpInitSideEffects(); }catch(_){}
      }
    }

    const highlight=navHighlightPanel(panel);

    Object.keys(ids).forEach(function(key){

      const sec=$(ids[key]);

      if(sec) sec.hidden=(key!==panel);

      const nav=document.querySelector('.settings-nav-item[data-panel="'+key+'"]');

      if(nav) nav.classList.toggle('is-active',highlight===key);

    });

    syncSettingsMicPoll(panel);

    if(panel==='debug'){

      try{
        var mountDebugOverview=global.__otMountDebugOverviewIsland;
        if(typeof mountDebugOverview==='function') mountDebugOverview();
      }catch(err){ console.error('debug island mount',err); }

      hooks().startProcessUsagePoll();

      hooks().refreshProcessUsage();

      if(panelChanged) hooks().renderDebugPanel();

      else hooks().scheduleDebugChromeRefresh();

      if(opts.debugMode&&global.OneToneVoiceDiag&&global.OneToneVoiceDiag.setFocusMode){
        global.OneToneVoiceDiag.setFocusMode(opts.debugMode);
      }else{
        hooks().syncDebugFocusSections();
      }

      if(panelChanged){
        setTimeout(function(){
          if(!ui.drawerOpen||normalizePanel(ui.settingsPanel)!=='debug') return;
          if(global.OneToneVoiceWake&&global.OneToneVoiceWake.ensureHomeVoiceListening){
            try{ global.OneToneVoiceWake.ensureHomeVoiceListening({force:true}); }catch(_){}
          }
        },500);
      }

    }

    if(panel==='keys'){

      // Two-phase defer (edit-habit 假死 fix):
      // 1) mount islands after chrome paints
      // 2) refresh / afterHeavy on a later tick — never stack ~14 mounts + syncEditor/render
      var keysDeferHeavy=!!opts.deferHeavy;
      var keysAfterHeavy=opts.afterHeavy;
      function runKeysAfterMount(){
        if(normalizePanel(ui.settingsPanel)!=='keys') return;
        if(keysDeferHeavy){
          if(typeof keysAfterHeavy==='function'){
            try{ keysAfterHeavy(); }
            catch(err){ console.error('keys panel deferHeavy',err); }
          }else{
            refreshKeysPanel();
          }
        }else{
          refreshKeysPanel();
        }
      }
      function mountKeysIslands(){
        if(normalizePanel(ui.settingsPanel)!=='keys') return;
        try{
          var mountKeys=global.__otMountKeysStatusIsland;
          if(typeof mountKeys==='function') mountKeys();
          var mountEditorDisplay=global.__otMountMappingEditorDisplayIsland;
          if(typeof mountEditorDisplay==='function') mountEditorDisplay();
          var mountFinishTiming=global.__otMountKeysFinishTimingIsland;
          if(typeof mountFinishTiming==='function') mountFinishTiming();
          var mountFinishMode=global.__otMountKeysFinishModeIsland;
          if(typeof mountFinishMode==='function') mountFinishMode();
          var mountFinishChrome=global.__otMountKeysFinishChromeIsland;
          if(typeof mountFinishChrome==='function') mountFinishChrome();
          var mountTriggerMode=global.__otMountKeysTriggerModeIsland;
          if(typeof mountTriggerMode==='function') mountTriggerMode();
          var mountTriggerConflict=global.__otMountKeysTriggerConflictIsland;
          if(typeof mountTriggerConflict==='function') mountTriggerConflict();
          var mountKeysFlow=global.__otMountKeysFlowChromeIsland;
          if(typeof mountKeysFlow==='function') mountKeysFlow();
          var mountKeysPills=global.__otMountKeysStatusPillsIsland;
          if(typeof mountKeysPills==='function') mountKeysPills();
          var mountKeysRecording=global.__otMountKeysRecordingFeedbackIsland;
          if(typeof mountKeysRecording==='function') mountKeysRecording();
          var mountKeysDisplay=global.__otMountKeysDisplayChromeIsland;
          if(typeof mountKeysDisplay==='function') mountKeysDisplay();
          var mountRecordCancel=global.__otMountRecordCancelBarIsland;
          if(typeof mountRecordCancel==='function') mountRecordCancel();
        }catch(err){ console.error('keys island mount',err); }
        requestAnimationFrame(function(){ setTimeout(runKeysAfterMount,0); });
      }
      requestAnimationFrame(function(){ setTimeout(mountKeysIslands,0); });

    }else if(panel==='softPad'){

      // Defer heavy Soft Pad paint — sync render on open used to 假死 the drawer.
      var softOpts={
        mappingId:opts.mappingId||'',
        skipHookRefresh:!!opts.skipHookRefresh
      };
      var softOpenGen=0;
      try{
        if(global.OneToneSoftPadHub&&typeof global.OneToneSoftPadHub.getOpenGen==='function'){
          softOpenGen=global.OneToneSoftPadHub.getOpenGen();
        }
      }catch(_){}
      try{
        if(global.OneToneSoftPadHub&&typeof global.OneToneSoftPadHub.ensureFloatingOverlayHidden==='function'){
          global.OneToneSoftPadHub.ensureFloatingOverlayHidden('panel');
        }
      }catch(_){}
      requestAnimationFrame(function(){
        setTimeout(function(){
          if(normalizePanel(ui.settingsPanel)!=='softPad'){
            try{ feLog('fe softPad.render aborted stale'); }catch(_){}
            return;
          }
          try{
            if(global.OneToneSoftPadHub&&typeof global.OneToneSoftPadHub.getOpenGen==='function'&&
               softOpenGen!==global.OneToneSoftPadHub.getOpenGen()){
              feLog('fe softPad.render aborted stale');
              return;
            }
          }catch(_){}
          if(global.OneToneSoftPadHub&&global.OneToneSoftPadHub.render){
            try{
              global.OneToneSoftPadHub.render(softOpts);
            }catch(err){
              console.error('softPad panel defer render',err);
            }
          }
        },0);
      });

    }else if(panel==='tray'){
      ui.trayEditorFocus=opts.trayEditorFocus||null;

      requestAnimationFrame(function(){
        setTimeout(function(){
          if(normalizePanel(ui.settingsPanel)!=='tray') return;
          var trayUi=global.OneToneSoftPadTrayUi;
          if(trayUi&&trayUi.onPanelEnter){
            try{ trayUi.onPanelEnter({ trayEditorFocus: ui.trayEditorFocus }); }catch(err){ console.error('tray panel enter',err); }
          }
        },0);
      });

    }else if(panel==='basic'){

      if(global.OneToneBasicPanelUi&&global.OneToneBasicPanelUi.render) global.OneToneBasicPanelUi.render();

    }else if(panel==='habits'){

      var habitView=ui.habitView||'hub';
      if(habitView!=='wizard') ui.habitView='hub';

      // Defer habit island mount so drawer chrome paints before hub HTML (同 keys).
      requestAnimationFrame(function(){
        setTimeout(function(){
          if(!isHabitsPanel()) return;
          try{
            var mountHubChrome=global.__otMountHabitHubChromeIsland;
            if(typeof mountHubChrome==='function') mountHubChrome();
          }catch(err){ console.error('habit hub island mount',err); }
          refreshHabitsPanel();
        },0);
      });

    }else if(panel==='sounds'){

      // Defer like Soft Pad — sync renderSoundSettingsPanel builds every picker and
      // used to 假死 when switching softPad/sounds/voiceWake in the same second.
      requestAnimationFrame(function(){
        setTimeout(function(){
          if(normalizePanel(ui.settingsPanel)!=='sounds') return;
          if(hooks().renderSoundSettingsPanel) hooks().renderSoundSettingsPanel();
        },0);
      });

    }else if(panel==='voiceWake'){

      // Two-phase defer (同 keys)：先让 drawer chrome 上屏，再跑 mode switch / 整页 flow /
      // island mounts。同步 renderVoiceModeSwitch 曾与 MediaPipe + howto 幽灵点击叠在
      // 同一帧 → WebView2 假死。
      // voiceOpenGen + phased heartbeat tags: stale defer abort + 假死定位 (tag=voiceOpen:…).
      var voiceDeferHeavy=!!opts.deferHeavy;
      var voiceAfterHeavy=opts.afterHeavy;
      var voiceScrollTarget=opts.scrollTarget;
      var voiceSubpage=opts.voiceSubpage||'wake';
      var voiceOpenGen=0;
      if(global.OneToneVoiceWake&&typeof global.OneToneVoiceWake.bumpOpenGen==='function'){
        try{ voiceOpenGen=global.OneToneVoiceWake.bumpOpenGen(); }catch(_){ voiceOpenGen=0; }
      }
      if(global.OneToneVoiceWake&&typeof global.OneToneVoiceWake.armOpenClickGuard==='function'){
        // Ghost strategy-tab / presence clicks after open were flipping enhanced→auto→resourceSaver
        // and each flip re-activated the engine (假死). Cover the deferred heavy RAF window.
        try{ global.OneToneVoiceWake.armOpenClickGuard(2500); }catch(_){}
      }
      function voiceHbSet(tag){
        if(global.OneToneUiHeartbeat&&global.OneToneUiHeartbeat.setTag){
          try{ global.OneToneUiHeartbeat.setTag(tag); }catch(_){}
        }
      }
      function voiceHbClear(tag){
        if(global.OneToneUiHeartbeat&&global.OneToneUiHeartbeat.clearTag){
          try{ global.OneToneUiHeartbeat.clearTag(tag); }catch(_){}
        }
      }
      function voiceHbPhase(from,to){
        if(from) voiceHbClear(from);
        if(to) voiceHbSet(to);
      }
      function voiceOpenStale(){
        if(normalizePanel(ui.settingsPanel)!=='voiceWake') return true;
        if(global.OneToneVoiceWake&&typeof global.OneToneVoiceWake.isOpenGenCurrent==='function'){
          return !global.OneToneVoiceWake.isOpenGenCurrent(voiceOpenGen);
        }
        return false;
      }
      voiceHbSet('voiceOpen:enter');
      // Collapse hang live panel — open poll on this page → idle UI_HB_STALL_5S.
      try{
        if(global.OneToneVoiceDiag&&typeof global.OneToneVoiceDiag.setHangLiveOpen==='function'){
          global.OneToneVoiceDiag.setHangLiveOpen(false);
        }
      }catch(_){}
      try{ document.documentElement.classList.add('ot-voice-wake-park'); }catch(_){}
      // Process usage poll is for debug panel — stop on voiceWake idle.
      try{
        if(hooks().clearProcessUsagePollTimer) hooks().clearProcessUsagePollTimer();
        else if(global.OneToneAppProcessUsage&&global.OneToneAppProcessUsage.clearPollTimer){
          global.OneToneAppProcessUsage.clearPollTimer();
        }
      }catch(_){}
      // #region agent log
      try{ if(global.__dbgB5) global.__dbgB5('F','settings-drawer.js:voiceWake.enter','voiceWake open enter',{gen:voiceOpenGen,enteringVoice:!!enteringVoice,subpage:voiceSubpage}); }catch(_){}
      // #endregion
      requestAnimationFrame(function(){
        setTimeout(function(){
          if(voiceOpenStale()){
            voiceHbClear('voiceOpen:enter');
            // #region agent log
            try{ if(global.__dbgB5) global.__dbgB5('F','settings-drawer.js:voiceWake.stale','stale abort before chrome',{gen:voiceOpenGen}); }catch(_){}
            // #endregion
            return;
          }
          voiceHbPhase('voiceOpen:enter','voiceOpen:chrome');
          // #region agent log
          var __chromeT0=performance.now();
          try{ if(global.__dbgB5) global.__dbgB5('F','settings-drawer.js:voiceWake.chromeStart','chrome phase start',{gen:voiceOpenGen}); }catch(_){}
          // #endregion
          try{
            if(enteringVoice){
              const active=hooks().currentVoiceMode();
              hooks().setVoiceWakeExpandedMode(active==='vosk'?'vosk':active==='sapi'?'sapi':((global.OneToneVoiceEngineReadiness&&global.OneToneVoiceEngineReadiness.isVoskOnlyUi())?'vosk':(global.OneToneVoiceWake.getExpandedMode()||'vosk')));
              global.OneToneVoiceWake.clearLiveFingerprints();
              const w=hooks().voiceUiSnapshot().wake||{};
              // liveOnly on enter — full status remount stacked with islands → 假死.
              if(w.sapi) hooks().renderVoiceSapiStatus(w.sapi,{liveOnly:true});
              if(w.vosk) hooks().renderVoiceVoskStatus(w.vosk,{liveOnly:true});
            }
            // Skip sync React chrome islands on open — mount+idle coincided with ~70s UI_HB_STALL
            // after settings_park. Strategy lives in voiceConfig (boot-mounted).
            // Delayed mount (P6b/c/d) after park settles — required drawer wire for island tests.
            setTimeout(function () {
              if (voiceOpenStale()) return;
              try {
                var mountStatus = global.__otMountVoiceStatusChromeIsland;
                if (typeof mountStatus === 'function') mountStatus();
              } catch (e1) {
                console.error('voice status chrome island mount', e1);
              }
              try {
                var mountTabs = global.__otMountVoiceEngineTabsIsland;
                if (typeof mountTabs === 'function') mountTabs();
              } catch (e2) {
                console.error('voice engine tabs island mount', e2);
              }
              try {
                var mountFlow = global.__otMountVoiceFlowChromeIsland;
                if (typeof mountFlow === 'function') mountFlow();
              } catch (e3) {
                console.error('voice flow chrome island mount', e3);
              }
            }, 800);
            if(global.OneToneVoiceSubpages&&typeof global.OneToneVoiceSubpages.setPage==='function'){
              global.OneToneVoiceSubpages.setPage(voiceSubpage,{keepScroll:true});
            }
            if(global.OneToneHabitChannelStatusStrip){
              if(global.OneToneHabitChannelStatusStrip.bindOnce) global.OneToneHabitChannelStatusStrip.bindOnce();
              if(global.OneToneHabitChannelStatusStrip.render){
                try{ global.OneToneHabitChannelStatusStrip.render(); }catch(_){}
              }
            }
            try{
              if(global.OneToneVoiceFeedbackRail&&global.OneToneVoiceFeedbackRail.resetDictationLive){
                global.OneToneVoiceFeedbackRail.resetDictationLive();
              }
            }catch(_){}
            // Paint wake phrase + right rail once on enter (park light path).
            try{
              if(global.OneToneVoiceSettingsFlow&&global.OneToneVoiceSettingsFlow.scheduleVoiceSettingsRender){
                global.OneToneVoiceSettingsFlow.scheduleVoiceSettingsRender();
              }
            }catch(_){}
          }catch(err){
            console.error('voice panel deferred paint',err);
            voiceHbClear('voiceOpen:chrome');
          }
          // #region agent log
          try{ if(global.__dbgB5) global.__dbgB5('F','settings-drawer.js:voiceWake.chromeEnd','chrome phase end',{gen:voiceOpenGen,ms:Math.round(performance.now()-__chromeT0)}); }catch(_){}
          // #endregion
          if(voiceOpenStale()){
            voiceHbClear('voiceOpen:chrome');
            return;
          }
          requestAnimationFrame(function(){
            setTimeout(function(){
              if(voiceOpenStale()){
                voiceHbClear('voiceOpen:chrome');
                return;
              }
              voiceHbPhase('voiceOpen:chrome','voiceOpen:heavy');
              try{
                try{
                  if(global.OneToneIpc&&global.OneToneIpc.invoke){
                    global.OneToneIpc.invoke('cmd_app_log',{line:'fe voiceWake heavy begin gen='+voiceOpenGen}).catch(function(){});
                  }
                }catch(_){}
                // Acoustic islands: delay past heavy open path (sync mount ~46s stall on 增强页).
                setTimeout(function () {
                  if (voiceOpenStale()) return;
                  try {
                    var mountAcoustic = global.__otMountVoiceAcousticIslands;
                    if (typeof mountAcoustic === 'function') mountAcoustic();
                  } catch (errAc) {
                    console.error('voice acoustic island mount', errAc);
                  }
                }, 1200);
                voiceHbPhase('voiceOpen:heavy','voiceOpen:modeSwitch');
                try{
                  hooks().renderVoiceModeSwitch();
                }finally{
                  voiceHbClear('voiceOpen:modeSwitch');
                }
                if(voiceDeferHeavy&&typeof voiceAfterHeavy==='function'){
                  try{ voiceAfterHeavy(); }
                  catch(errHeavy){ console.error('voice panel deferHeavy',errHeavy); }
                }
                if(voiceScrollTarget){
                  var target=$(voiceScrollTarget);
                  if(target) target.scrollIntoView({behavior:'smooth',block:'start'});
                }
                try{
                  if(global.OneToneIpc&&global.OneToneIpc.invoke){
                    global.OneToneIpc.invoke('cmd_app_log',{line:'fe voiceWake heavy end gen='+voiceOpenGen}).catch(function(){});
                  }
                }catch(_){}
                // Clear sticky end/dictating FE snapshot so poll arm stays quiet.
                try{
                  var snap=hooks().voiceUiSnapshot;
                  if(typeof snap==='function') snap=snap();
                  if(snap&&snap.end) snap.end.state='idle';
                }catch(_){}
              }catch(err2){
                console.error('voice panel heavy paint',err2);
                voiceHbClear('voiceOpen:heavy');
                voiceHbClear('voiceOpen:modeSwitch');
              }finally{
                voiceHbClear('voiceOpen:heavy');
              }
            },0);
          });
        },0);
      });

    }else if(panel==='camera'){

      try{
        var mountCameraFlow=global.__otMountCameraFlowChromeIsland;
        if(typeof mountCameraFlow==='function') mountCameraFlow();
      }catch(err){ console.error('camera island mount',err); }

      if(global.OneToneHabitChannelEditBanner&&global.OneToneHabitChannelEditBanner.syncPanelContext){
        global.OneToneHabitChannelEditBanner.syncPanelContext('camera');
      }else if(String(ui.habitScenarioReturnPanel||'')!=='camera'||!String(ui.habitScenarioReturnId||'').trim()){
        ui.cameraEditMode='global';
      }else{
        ui.cameraEditMode='appScenario';
        if(ui.habitScenarioReturnId) state().selectedMappingId=String(ui.habitScenarioReturnId);
      }
      // Defer preview/reconcile/MediaPipe — sync onPanelVisible used to 假死 the drawer on open.
      requestAnimationFrame(function(){
        setTimeout(function(){
          if(normalizePanel(ui.settingsPanel)!=='camera') return;
          if(global.OneToneCameraPreview&&global.OneToneCameraPreview.onPanelVisible){
            try{ global.OneToneCameraPreview.onPanelVisible(); }catch(err){
              console.error('camera preview onPanelVisible',err);
            }
          }
          if(global.OneToneCameraWorkflow&&global.OneToneCameraWorkflow.onPanelVisible){
            try{ global.OneToneCameraWorkflow.onPanelVisible(); }catch(err){
              console.error('camera workflow onPanelVisible',err);
            }
          }
          if(global.OneToneHabitScenarioContextBanner&&global.OneToneHabitScenarioContextBanner.render){
            try{ global.OneToneHabitScenarioContextBanner.render(); }catch(_){}
          }
        },0);
      });

    }

    if(panel!=='camera'){
      if(global.OneToneCameraWorkflow&&global.OneToneCameraWorkflow.onPanelHidden){
        global.OneToneCameraWorkflow.onPanelHidden();
      }
    }

    if(panel==='keys'||panel==='voiceWake'||panel==='camera'||panel==='softPad'){
      if(global.OneToneHabitChannelEditBanner){
        if(global.OneToneHabitChannelEditBanner.ensureEditContextFromRuntime){
          try{ global.OneToneHabitChannelEditBanner.ensureEditContextFromRuntime(); }catch(_){}
        }
        if(global.OneToneHabitChannelEditBanner.syncPanelContext){
          global.OneToneHabitChannelEditBanner.syncPanelContext(panel);
        }
        if(global.OneToneHabitChannelEditBanner.bindOnce) global.OneToneHabitChannelEditBanner.bindOnce();
        if(global.OneToneHabitChannelEditBanner.renderAll){
          try{ global.OneToneHabitChannelEditBanner.renderAll(); }catch(_){}
        }
      }
    }

    // voiceWake strip renders in the deferred paint tick (see voiceWake branch above).
    if(panel==='keys'||panel==='camera'||panel==='softPad'){
      if(global.OneToneHabitChannelStatusStrip){
        if(global.OneToneHabitChannelStatusStrip.bindOnce) global.OneToneHabitChannelStatusStrip.bindOnce();
        if(global.OneToneHabitChannelStatusStrip.render){
          try{ global.OneToneHabitChannelStatusStrip.render(); }catch(_){}
        }
      }
    }

    lastPanel=panel;

    // Presence/MediaPipe createImageBitmap + habit/softPad remount on the same turn wedges WebView2.
    // Pause infer while drawer shows non-camera panels; keep stream; resume on camera or close.
    syncCameraInferForPanel(panel);

    hooks().renderSettingsSchemeSubnav();

    hooks().renderSettingsVoiceSubnav();

    hooks().renderSettingsDebugSubnav();

    requestAnimationFrame(function(){

      resetSettingsLayoutScroll({resetPanel:panelChanged});

    });

    if(global.OneToneHomeWorkbench&&global.OneToneHomeWorkbench.syncNavActiveState&&ui.drawerOpen){
      syncWorkbenchNav(panel);
    }

  }

  function openSettings(opts){

    openDrawer(opts);

  }

  function syncHeaderSettingsBtn(){

    const btnLabel=$('btnSettingsLabel');

    const iconHome=$('btnSettingsIconHome');

    const iconGear=$('btnSettingsIconGear');

    const pageBackLabel=$('btnSettingsPageBackLabel');

    const pageBack=$('btnSettingsPageBack');

    const open=!!ui.drawerOpen;

    if(btnLabel) btnLabel.textContent=open?t('homeNavTitle'):t('settingsTitle');

    if(pageBackLabel) pageBackLabel.textContent=t('settingsBack');

    if(pageBack) pageBack.setAttribute('aria-label',t('settingsBack'));

    if(iconHome){

      iconHome.hidden=!open;

      iconHome.classList.toggle('is-hidden',!open);

    }

    if(iconGear){

      iconGear.hidden=open;

      iconGear.classList.toggle('is-hidden',open);

    }

  }

  function syncSettingsChrome(){

    const app=document.querySelector('.app');

    const drawer=$('settingsDrawer');

    if(app) app.classList.toggle('is-settings',!!ui.drawerOpen);

    if(app) app.classList.toggle('is-workbench',isWorkbenchShell());

    if(drawer){

      drawer.hidden=!ui.drawerOpen;

      drawer.setAttribute('aria-hidden',ui.drawerOpen?'false':'true');

    }

    syncHeaderSettingsBtn();

    if(ui.drawerOpen) resetSettingsLayoutScroll({resetPanel:true});

  }

  function settingsShouldParkVoice(panel){
    panel=normalizePanel(panel||ui.settingsPanel||'basic');
    // Only voiceWake parks capture (cpal + status poll 假死). Debug/home must keep Vosk running.
    return panel==='voiceWake';
  }

  function setSettingsDrawerGate(open,opts){
    try{
      var ipc=global.OneToneIpc;
      if(ipc&&typeof ipc.invoke==='function'){
        var parkVoice=!!open&&(opts&&Object.prototype.hasOwnProperty.call(opts,'parkVoice')
          ?!!opts.parkVoice
          :settingsShouldParkVoice(opts&&opts.panel));
        ipc.invoke('cmd_set_settings_drawer_open',{open:!!open,parkVoice:parkVoice,park_voice:parkVoice}).catch(function(){});
      }
    }catch(_){}
  }

  function openDrawer(opts){

    hooks().ensureFullLangApplied();

    opts=opts||{};
    try{
      feLog('fe openDrawer panel='+String(opts.panel||'basic')+(opts.habitWizard?' wizard=1':''));
    }catch(_){}
    try{
      if(global.OneToneIpc&&global.OneToneIpc.invoke){
        global.OneToneIpc.invoke('cmd_app_log',{line:'fe openDrawer begin panel='+String(opts.panel||'basic')}).catch(function(){});
      }
    }catch(_){}
    // Soft Pad float is always-on-top; durable gate + soft-dismiss so left nav / drawer stay clickable.
    try{
      var ipc=global.OneToneIpc;
      if(ipc&&typeof ipc.invoke==='function'){
        ipc.invoke('cmd_codex_micro_overlay_dismiss',{}).catch(function(){});
      }
    }catch(_){}
      // If a home-guide veil got stuck in "is-open" we can end up with a visually-calm but pointer-blocked UI.
      // Close it whenever we enter the drawer to guarantee nav clickability.
      try{
        if(global.OneToneHomeGuide&&typeof global.OneToneHomeGuide.close==='function'){
          global.OneToneHomeGuide.close(true);
        }
      }catch(_){}
    try{
      if(global.OneToneConfigPersist&&typeof global.OneToneConfigPersist.suppressUnknownSave==='function'){
        global.OneToneConfigPersist.suppressUnknownSave(2500);
      }
    }catch(_){}

    hooks().closeHomeSchemeMenu();

    if(opts.voiceTab==='end'){
      opts.panel='voiceWake';
      if(!opts.focus) opts.focus='endPhrases';
      if(!opts.voiceSubpage) opts.voiceSubpage='recognize';
    }else if(opts.voiceTab==='wake'){
      opts.panel=opts.keyWakeFocus?'keys':'voiceWake';
      if(opts.panel==='voiceWake'&&!opts.voiceSubpage) opts.voiceSubpage='wake';
    }

    if(opts.panel==='voiceEnd'){
      opts.panel='voiceWake';
      if(!opts.voiceSubpage) opts.voiceSubpage='recognize';
    }

    ui.drawerOpen=true;
    setSettingsDrawerGate(true,{panel:opts.panel||'basic'});

    // Pause MediaPipe before any panel remount — presence createImageBitmap + habit/softPad
    // remount on the same turn wedges WebView2 (Responding=false).
    try{
      var openPanel=normalizePanel(opts.panel||'basic');
      if(openPanel!=='camera'){
        var paEarly=global.OneToneCameraPresenceActions;
        if(paEarly&&typeof paEarly.setDrawerUiPaused==='function'){
          paEarly.setDrawerUiPaused(true);
        }
      }
    }catch(_){}

    setSettingsPanel(opts.panel||'basic',opts);

    syncSettingsChrome();

    if((opts.panel||'basic')==='debug'){
      var debugMode=opts.debugMode||'overview';
      if(global.OneToneVoiceDiag&&global.OneToneVoiceDiag.setFocusMode){
        requestAnimationFrame(function(){
          global.OneToneVoiceDiag.setFocusMode(debugMode);
        });
      }
    }

    if(global.OneToneHomeWorkbench&&global.OneToneHomeWorkbench.syncNavActiveState){
      var navOpts={};
      if((opts.panel||'basic')==='debug'&&opts.debugMode) navOpts.debugMode=opts.debugMode;
      syncWorkbenchNav(ui.settingsPanel,navOpts);
    }

    if(opts.habitWizard&&global.OneToneHabitScenarioWizard){
      requestAnimationFrame(function(){
        if(!ui.drawerOpen) return;
        if(opts.editId) global.OneToneHabitScenarioWizard.openEdit(opts.editId,opts);
        else global.OneToneHabitScenarioWizard.openNew();
      });
    }

    setTimeout(function(){

      if(!ui.drawerOpen) return;

      hooks().loadAutostartState();

      if(hooks().loadStartMinimizedState) hooks().loadStartMinimizedState();

      if(hooks().loadCoachHudState) hooks().loadCoachHudState();

      // voiceWake: skip — parks engines; status IPC raced stop and UI_HB_STALL.
      if(hooks().settingsPanelNeedsVoicePoll()&&ui.settingsPanel!=='voiceWake') hooks().voiceStatusPollTick();

    },200);

    requestAnimationFrame(function(){

      if(!ui.drawerOpen) return;

      const focus=opts.focus||(opts.keyWakeFocus?'trigger':null);

      if(focus) focusSettingsField(focus);

    });

  }

  function syncCameraInferForPanel(panel){
    var pa=global.OneToneCameraPresenceActions;
    if(!pa||typeof pa.setDrawerUiPaused!=='function') return;
    var pause=!!ui.drawerOpen&&normalizePanel(panel)!=='camera';
    try{ pa.setDrawerUiPaused(pause); }catch(_){}
  }

  function closeDrawer(){

    try{
      if(global.OneToneIpc&&global.OneToneIpc.invoke){
        global.OneToneIpc.invoke('cmd_app_log',{line:'fe closeDrawer panel='+String(ui.settingsPanel||'')}).catch(function(){});
      }
    }catch(_){}

    if(global.OneToneTargetKeyPicker&&global.OneToneTargetKeyPicker.close) global.OneToneTargetKeyPicker.close();
    var capPicker=global.OneToneKeysChannelCommandPicker;
    if(capPicker&&(capPicker.closeCapturePopover||capPicker.closeCaptureSheet)){
      try{
        var closeFn=capPicker.closeCapturePopover||capPicker.closeCaptureSheet;
        closeFn.call(capPicker,{ keepPanel:true, skipStep:true });
      }catch(_){}
    }

    var closingPanel=normalizePanel(ui.settingsPanel);
    if(closingPanel==='keys'&&global.OneToneKeysPanelUi&&global.OneToneKeysPanelUi.persistEditorIfDirty){
      try{ global.OneToneKeysPanelUi.persistEditorIfDirty(); }catch(_){}
    }

    ui.drawerOpen=false;
    setSettingsDrawerGate(false);
    if(global.OneToneVoiceWake&&global.OneToneVoiceWake.unparkHomeAsrQuiet){
      try{ global.OneToneVoiceWake.unparkHomeAsrQuiet(); }catch(_){}
    }
    try{ document.documentElement.classList.remove('ot-voice-wake-park'); }catch(_){}

    lastPanel='basic';

    syncSettingsChrome();

    syncWorkbenchNav('home');

    resetSettingsLayoutScroll();

    hooks().renderSettingsSchemeSubnav();

    hooks().renderSettingsVoiceSubnav();

    hooks().renderSettingsDebugSubnav();

    hooks().stopMicLevelPoll();

    hooks().stopMicMonitor();

    // Camera resume + mvp flush + pullBackend used to run sync on close — stacking with a
    // immediate hero orb re-open (unpark+park+MediaPipe) → UI_HB_STALL empty tag.
    var closeGen=(global.__otDrawerCloseGen=(global.__otDrawerCloseGen||0)+1);
    setTimeout(function(){
      if(closeGen!==global.__otDrawerCloseGen||ui.drawerOpen) return;
      try{
        if(global.OneToneCameraPresenceActions&&global.OneToneCameraPresenceActions.setDrawerUiPaused){
          global.OneToneCameraPresenceActions.setDrawerUiPaused(false);
        }
        if(global.OneToneCameraPresenceActions&&global.OneToneCameraPresenceActions.reconcileRuntime){
          global.OneToneCameraPresenceActions.reconcileRuntime({reason:'drawer_close'});
        }
        if(global.OneToneHomeActionHistoryCard&&global.OneToneHomeActionHistoryCard.refresh){
          global.OneToneHomeActionHistoryCard.refresh();
        }
      }catch(_){}
    },0);
    setTimeout(function(){
      if(closeGen!==global.__otDrawerCloseGen||ui.drawerOpen) return;
      try{
        if(global.OneToneMappingCore&&typeof global.OneToneMappingCore.flushAllEditor==='function'){
          global.OneToneMappingCore.flushAllEditor();
        }
      }catch(_){}
      if(global.OneToneConfigPersist){
        if(typeof global.OneToneConfigPersist.flushDeferredMvpInitSideEffects==='function'){
          try{ global.OneToneConfigPersist.flushDeferredMvpInitSideEffects(); }catch(_){}
        }
        if(typeof global.OneToneConfigPersist.pullBackendConfig==='function'){
          try{ global.OneToneConfigPersist.pullBackendConfig(); }catch(_){}
        }
      }
    },120);

    setTimeout(function(){

      if(!ui.drawerOpen&&hooks().micLevelUiVisible()) hooks().syncHomeMicMonitor().catch(function(){});

    },200);

    setTimeout(function(){
      if(ui.drawerOpen) return;
      if(global.OneToneVoiceWake&&global.OneToneVoiceWake.ensureHomeVoiceListening){
        try{ global.OneToneVoiceWake.ensureHomeVoiceListening({force:true}); }catch(_){}
      }
      if(global.OneToneHomeWorkbench){
        try{
          global.OneToneHomeWorkbench.forceHomeRender();
          global.OneToneHomeWorkbench.render();
        }catch(_){}
      }
      if(global.OneToneHomeV9&&global.OneToneHomeV9.paintHomeLiveTextImmediate){
        try{ global.OneToneHomeV9.paintHomeLiveTextImmediate(); }catch(_){}
      }
    },600);

    setTimeout(function(){
      if(ui.drawerOpen) return;
      if(global.OneToneVoiceWake&&global.OneToneVoiceWake.pollTick){
        try{ global.OneToneVoiceWake.pollTick(); }catch(_){}
      }
      if(global.OneToneHomeV9&&global.OneToneHomeV9.paintHomeLiveTextImmediate){
        try{ global.OneToneHomeV9.paintHomeLiveTextImmediate(); }catch(_){}
      }
    },80);

  }



  global.OneToneSettingsDrawer={

    open:openSettings,openDrawer:openDrawer,close:closeDrawer,

    setPanel:setSettingsPanel,syncChrome:syncSettingsChrome,
    refreshKeysPanel:refreshKeysPanel,

    openScenarioDetail:openScenarioDetail,openScenarioHub:openScenarioHub,openHabitWizard:openHabitWizard,scrollToVoiceAction:scrollToVoiceAction,

    syncHeaderBtn:syncHeaderSettingsBtn,

    focusField:focusSettingsField,resetScroll:resetSettingsLayoutScroll,

    syncSubnavRail:syncSubnavRail,syncWorkbenchNav:syncWorkbenchNav,isWorkbenchShell:isWorkbenchShell,

    lastPanel:function(){ return lastPanel; },

    isHabitsPanel:isHabitsPanel,isKeysPanel:isKeysPanel,normalizePanel:normalizePanel

  };

  syncHeaderSettingsBtn();

  (function initWorkbenchChrome(){
    var app=document.querySelector('.app');
    if(app) app.classList.toggle('is-workbench',isWorkbenchShell());
  })();

  if(typeof window!=='undefined'&&!window.__otTrayDeepLinkDrawerBound){
    window.__otTrayDeepLinkDrawerBound=true;
    window.addEventListener('tray-deep-link',function(ev){
      var d=ev&&ev.detail?ev.detail:{};
      var href=String(d.href||'');
      var tab=String(d.tab||'');
      if(!href&&tab) href='main:'+tab;
      var panel=null;
      if(href.indexOf('?')>=0){
        var qs=href.split('?')[1]||'';
        var m=/panel=([^&]+)/.exec(qs);
        if(m) panel=decodeURIComponent(m[1]);
      }
      if(panel){
        openDrawer({panel:panel});
        return;
      }
      if(href.indexOf('main:habits')===0||tab==='habits'){
        openDrawer({panel:'habits',habitWizard:href.indexOf('wizard=1')>=0});
      }
    });
  }

})(typeof window!=='undefined'?window:globalThis);
