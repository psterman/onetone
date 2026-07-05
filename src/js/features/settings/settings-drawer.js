(function(global){
  'use strict';
  var ui=global.OneToneState.ui;
  var $=function(id){ return global.OneToneDom.$(id); };
  var t=function(key){ return global.OneToneI18n.t(key); };
  function hooks(){ return global.__vp_settings_drawer_hooks__ || {}; }
  var PANEL_IDS={
    basic:'settingsPanelBasic',keyWake:'settingsPanelKeyWake',voiceWake:'settingsPanelVoiceWake',
    sounds:'settingsPanelSounds',debug:'settingsPanelDebug',general:'settingsPanelGeneral'
  };
  var lastPanel='basic';

  function openVoiceAdvancedSection(){
    const el=$('settingsVoiceAdvancedDetails');
    if(el&&el.tagName==='DETAILS') el.open=true;
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
    if(focus==='trigger'||focus==='target'||focus==='keyFinishFlow'){
      hooks().focusSchemeEditStep(focus==='keyFinishFlow'?'finish':focus);
      return;
    }
    if(focus==='recordingAudio'){
      if(ui.settingsPanel!=='sounds') setSettingsPanel('sounds');
      scrollSettingsToTarget(['recordingAudioCard']);
      return;
    }
    if(focus==='wakePhrases'||focus==='engine'){
      openVoiceAdvancedSection();
    }
    if(focus==='wakePhrases'){
      hooks().setVoiceWakeExpandedMode(hooks().currentVoiceMode()==='vosk'?'vosk':'sapi');
      hooks().renderVoiceModeSwitch();
    }else if(focus==='engine'){
      const active=hooks().currentVoiceMode();
      hooks().setVoiceWakeExpandedMode(active==='vosk'?'vosk':active==='sapi'?'sapi':(global.OneToneVoiceWake.getExpandedMode()||'sapi'));
      hooks().renderVoiceModeSwitch();
    }
    const detailByFocus={
      trigger:'quickKeyWakeSection',
      target:'quickKeyWakeSection',
      mic:'voiceMicSection',
      engine:'voiceModePanel',
      autoSend:'voiceSettingsAutoCard',
      delay:'voiceSettingsAutoCard'
    };
    const detailId=detailByFocus[focus];
    if(detailId){
      const detail=$(detailId);
      if(detail&&detail.tagName==='DETAILS') detail.open=true;
    }
    if(focus==='mic'){
      const micDetails=$('voiceMicPickerDetails');
      if(micDetails) micDetails.open=true;
    }
    const expanded=global.OneToneVoiceWake.getExpandedMode();
    const map={
      trigger:['btnRecordTrigger','keySchemeEditTrigger'],
      target:['btnRecordTarget','keySchemeEditTarget'],
      mappings:['keyWakeMappingSection','mappingListTitle'],
      keyFinishFlow:['keySchemeEditFinish','keySchemeStepFinish'],
      mic:['micDeviceList','micTitle'],
      engine:['voiceSettingsEngineCard','voiceModePanel'],
      wakePhrases:expanded==='vosk'?['voiceVoskPresetsCn','voiceSettingsEngineCard']:['voiceSapiPresets','voiceSettingsEngineCard'],
      endPhrases:['voiceSettingsEndPhraseCard'],
      autoSend:['voiceSettingsAutoCard'],
      delay:['voiceSettingsDelayRange']
    };
    scrollSettingsToTarget(map[focus]||[]);
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
  function setSettingsPanel(panel){
    // Keep the legacy voiceEnd alias working for older shortcuts and home links.
    if(panel==='voiceEnd') panel='voiceWake';
    const ids=PANEL_IDS;
    if(!ids[panel]) panel='basic';
    const enteringVoice=panel==='voiceWake'&&lastPanel!=='voiceWake';
    const panelChanged=panel!==lastPanel;
    ui.settingsPanel=panel;
    Object.keys(ids).forEach(function(key){
      const sec=$(ids[key]);
      if(sec) sec.hidden=(key!==panel);
      const nav=document.querySelector('.settings-nav-item[data-panel="'+key+'"]');
      if(nav) nav.classList.toggle('is-active',key===panel);
    });
    syncSettingsMicPoll(panel);
    if(panel==='debug'){
      hooks().startProcessUsagePoll();
      hooks().refreshProcessUsage();
      if(panelChanged) hooks().renderDebugPanel();
      else hooks().scheduleDebugChromeRefresh();
      hooks().syncDebugFocusSections();
    }
    if(panel==='keyWake'){
      hooks().renderKeyFinishFlowPanel();
      if(global.OneToneSceneTabs) global.OneToneSceneTabs.render();
      if(global.OneToneSceneVoiceTab) global.OneToneSceneVoiceTab.render();
      requestAnimationFrame(function(){
        if(!ui.drawerOpen||ui.settingsPanel!=='keyWake') return;
        hooks().renderMappingChrome();
        hooks().renderEditor();
      });
    }else if(panel==='general'){
      hooks().renderTrashList();
    }else if(panel==='sounds'){
      hooks().renderSoundSettingsPanel();
    }else if(panel==='voiceWake'){
      if(enteringVoice){
        const active=hooks().currentVoiceMode();
        hooks().setVoiceWakeExpandedMode(active==='vosk'?'vosk':active==='sapi'?'sapi':(global.OneToneVoiceWake.getExpandedMode()||'sapi'));
        global.OneToneVoiceWake.clearLiveFingerprints();
        const w=hooks().voiceUiSnapshot().wake||{};
        if(w.sapi) hooks().renderVoiceSapiStatus(w.sapi);
        if(w.vosk) hooks().renderVoiceVoskStatus(w.vosk);
      }
      hooks().renderVoiceModeSwitch();
    }
    lastPanel=panel;
    hooks().renderSettingsSchemeSubnav();
    hooks().renderSettingsVoiceSubnav();
    hooks().renderSettingsDebugSubnav();
    requestAnimationFrame(function(){
      resetSettingsLayoutScroll({resetPanel:panelChanged});
    });
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
    if(opts.voiceTab==='end'){ opts.panel='voiceWake'; if(!opts.focus) opts.focus='endPhrases'; }
    else if(opts.voiceTab==='wake') opts.panel=opts.keyWakeFocus?'keyWake':'voiceWake';
    if(opts.panel==='voiceEnd') opts.panel='voiceWake';
    ui.drawerOpen=true;
    syncSettingsChrome();
    setSettingsPanel(opts.panel||'basic');
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
      if(opts.debugMode&&global.OneToneVoiceDiag&&global.OneToneVoiceDiag.setFocusMode){
        global.OneToneVoiceDiag.setFocusMode(opts.debugMode);
      }
    });
  }
  function closeDrawer(){
    ui.drawerOpen=false;
    lastPanel='basic';
    syncSettingsChrome();
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
    syncHeaderBtn:syncHeaderSettingsBtn,
    focusField:focusSettingsField,resetScroll:resetSettingsLayoutScroll,
    lastPanel:function(){ return lastPanel; }
  };
  syncHeaderSettingsBtn();
})(typeof window!=='undefined'?window:globalThis);
