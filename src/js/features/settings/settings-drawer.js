(function(global){

  'use strict';

  var ui=global.OneToneState.ui;

  var $=function(id){ return global.OneToneDom.$(id); };

  var t=function(key){ return global.OneToneI18n.t(key); };

  function hooks(){ return global.__vp_settings_drawer_hooks__ || {}; }

  function state(){ return global.OneToneState.state; }

  var PANEL_IDS={

    basic:'settingsPanelBasic',keys:'settingsPanelKeys',voiceWake:'settingsPanelVoiceWake',scenes:'settingsPanelScenes',

    habits:'settingsPanelHabits',sounds:'settingsPanelSounds',debug:'settingsPanelDebug',

    camera:'settingsPanelCamera'

  };

  function resolveSettingsPanelRequest(panel,opts){
    opts=opts||{};
    if(panel==='voiceEnd') panel='voiceWake';
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

      setSettingsPanel('keys');

      var step=focus==='keyFinishFlow'||focus==='finish'?'finish':focus;

      hooks().focusSchemeEditStep(step);

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

      keyFinishFlow:['habitKeyMapRowFinish','habitFinishCard'],

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

    if(hooks().renderSoundSettingsPanel) hooks().renderSoundSettingsPanel();

    requestAnimationFrame(function(){

      if(!ui.drawerOpen||!isKeysPanel()) return;

      hooks().renderMappingChrome();

      hooks().renderEditor();

    });

  }



  function refreshHabitsPanel(){

    var view=ui.habitView||'hub';
    if(view==='wizard'&&global.OneToneHabitScenarioWizard){
      global.OneToneHabitScenarioWizard.render();
    }else if(view==='hub'&&global.OneToneHabitHub){
      global.OneToneHabitHub.render();
    }

    if(global.OneToneSceneTabs) global.OneToneSceneTabs.render();

    if(global.OneToneSceneFlowSummary) global.OneToneSceneFlowSummary.render();

    if(global.OneToneHabitLayerNav) global.OneToneHabitLayerNav.onPanelVisibility();

    if(global.OneToneSceneVoiceTab) global.OneToneSceneVoiceTab.render();

    requestAnimationFrame(function(){

      if(!ui.drawerOpen||!isHabitsPanel()) return;

      hooks().renderMappingChrome();

    });

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

      if(hooks().voiceCaptureActive()){

        hooks().stopMicLevelPoll();

        hooks().stopMicMonitor();

        return;

      }

      setTimeout(function(){

        if(!ui.drawerOpen||ui.settingsPanel!=='voiceWake') return;

        if(hooks().voiceCaptureActive()){

          hooks().stopMicLevelPoll();

          hooks().stopMicMonitor();

          return;

        }

        hooks().loadMicDevices().then(function(){

          if(ui.drawerOpen&&ui.settingsPanel==='voiceWake'&&!hooks().voiceCaptureActive()){

            hooks().startMicLevelPoll();

          }

        });

      },280);

    }else{

      hooks().stopMicLevelPoll();

      if(!hooks().voiceCaptureActive()) hooks().stopMicMonitor();

    }

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

    if(panelChanged&&panel!=='keys'&&global.OneToneTargetKeyPicker&&global.OneToneTargetKeyPicker.close){
      global.OneToneTargetKeyPicker.close();
    }

    ui.settingsPanel=panel;

    const highlight=navHighlightPanel(panel);

    Object.keys(ids).forEach(function(key){

      const sec=$(ids[key]);

      if(sec) sec.hidden=(key!==panel);

      const nav=document.querySelector('.settings-nav-item[data-panel="'+key+'"]');

      if(nav) nav.classList.toggle('is-active',highlight===key);

    });

    syncSettingsMicPoll(panel);

    if(panel==='debug'){

      hooks().startProcessUsagePoll();

      hooks().refreshProcessUsage();

      if(panelChanged) hooks().renderDebugPanel();

      else hooks().scheduleDebugChromeRefresh();

      if(opts.debugMode&&global.OneToneVoiceDiag&&global.OneToneVoiceDiag.setFocusMode){
        global.OneToneVoiceDiag.setFocusMode(opts.debugMode);
      }else{
        hooks().syncDebugFocusSections();
      }

    }

    if(panel==='keys'){

      refreshKeysPanel();

    }else if(panel==='basic'){

      if(global.OneToneBasicPanelUi&&global.OneToneBasicPanelUi.render) global.OneToneBasicPanelUi.render();

    }else if(panel==='habits'){

      var habitView=ui.habitView||'hub';
      if(habitView!=='wizard') ui.habitView='hub';

      refreshHabitsPanel();

    }else if(panel==='scenes'){

      if(global.OneToneSceneModeHub) global.OneToneSceneModeHub.render();

    }else if(panel==='sounds'){

      hooks().renderSoundSettingsPanel();

    }else if(panel==='voiceWake'){

      if(enteringVoice){

        const active=hooks().currentVoiceMode();

        hooks().setVoiceWakeExpandedMode(active==='vosk'?'vosk':active==='sapi'?'sapi':((global.OneToneVoiceEngineReadiness&&global.OneToneVoiceEngineReadiness.isVoskOnlyUi())?'vosk':(global.OneToneVoiceWake.getExpandedMode()||'vosk')));

        global.OneToneVoiceWake.clearLiveFingerprints();

        const w=hooks().voiceUiSnapshot().wake||{};

        if(w.sapi) hooks().renderVoiceSapiStatus(w.sapi);

        if(w.vosk) hooks().renderVoiceVoskStatus(w.vosk);

      }

      hooks().renderVoiceModeSwitch();

      if(global.OneToneVoiceSubpages&&typeof global.OneToneVoiceSubpages.setPage==='function'){
        var nextSubpage=opts.voiceSubpage||'wake';
        global.OneToneVoiceSubpages.setPage(nextSubpage,{keepScroll:true});
      }

      if(opts.scrollTarget){
        requestAnimationFrame(function(){
          var target=$(opts.scrollTarget);
          if(target) target.scrollIntoView({behavior:'smooth',block:'start'});
        });
      }

    }else if(panel==='camera'){

      if(global.OneToneCameraPreview&&global.OneToneCameraPreview.onPanelVisible){
        global.OneToneCameraPreview.onPanelVisible();
      }
      if(global.OneToneCameraWorkflow&&global.OneToneCameraWorkflow.onPanelVisible){
        global.OneToneCameraWorkflow.onPanelVisible();
      }
      if(global.OneToneHabitScenarioContextBanner&&global.OneToneHabitScenarioContextBanner.render){
        global.OneToneHabitScenarioContextBanner.render();
      }

    }

    if(panel!=='camera'){
      if(global.OneToneCameraWorkflow&&global.OneToneCameraWorkflow.onPanelHidden){
        global.OneToneCameraWorkflow.onPanelHidden();
      }
    }

    lastPanel=panel;

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

    const open=!!ui.drawerOpen;

    if(btnLabel) btnLabel.textContent=open?t('homeNavTitle'):t('settingsTitle');

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

  function openDrawer(opts){

    hooks().ensureFullLangApplied();

    opts=opts||{};

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

      if(hooks().settingsPanelNeedsVoicePoll()) hooks().voiceStatusPollTick();

    },200);

    requestAnimationFrame(function(){

      if(!ui.drawerOpen) return;

      const focus=opts.focus||(opts.keyWakeFocus?'trigger':null);

      if(focus) focusSettingsField(focus);

    });

  }

  function closeDrawer(){

    if(global.OneToneTargetKeyPicker&&global.OneToneTargetKeyPicker.close) global.OneToneTargetKeyPicker.close();

    // Keep camera running when enabled — do not stop on drawer close.
    // Coordinator decides via reconcile (manual stop / master off still honored).
    try{
      if(global.OneToneCameraPresenceActions&&global.OneToneCameraPresenceActions.reconcileRuntime){
        global.OneToneCameraPresenceActions.reconcileRuntime({reason:'drawer_close'});
      }
    }catch(_){}

    ui.drawerOpen=false;

    lastPanel='basic';

    syncSettingsChrome();

    syncWorkbenchNav('home');

    resetSettingsLayoutScroll();

    hooks().renderSettingsSchemeSubnav();

    hooks().renderSettingsVoiceSubnav();

    hooks().renderSettingsDebugSubnav();

    hooks().stopMicLevelPoll();

    hooks().stopMicMonitor();

    if(global.OneToneMappingCore&&typeof global.OneToneMappingCore.flushAllEditor==='function'){

      global.OneToneMappingCore.flushAllEditor();

    }

    if(global.OneToneConfigPersist&&typeof global.OneToneConfigPersist.pullBackendConfig==='function'){

      global.OneToneConfigPersist.pullBackendConfig();

    }

    setTimeout(function(){

      if(!ui.drawerOpen&&hooks().micLevelUiVisible()) hooks().syncHomeMicMonitor().catch(function(){});

    },120);

  }



  global.OneToneSettingsDrawer={

    open:openSettings,openDrawer:openDrawer,close:closeDrawer,

    setPanel:setSettingsPanel,syncChrome:syncSettingsChrome,

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

})(typeof window!=='undefined'?window:globalThis);


