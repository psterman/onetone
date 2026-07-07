(function(global){
  'use strict';
  var state=global.OneToneState.state;
  var $=function(id){ return global.OneToneDom.$(id); };
  var t=function(key){ return global.OneToneI18n.t(key); };
  function hooks(){ return global.__vp_voice_settings_flow_hooks__ || {}; }

  function resolveMicLabel(summary){
    if(summary&&summary.micLabel) return summary.micLabel;
    const micDevices=hooks().micDevices();
    const activeMicId=hooks().activeMicId();
    const dev=micDevices.find(function(d){ return d.id===activeMicId; })
      ||micDevices.find(function(d){ return d.isDefault; })
      ||micDevices[0];
    return dev?(dev.name||dev.id):t('homeVoiceMapMicEmpty');
  }

  function resolveHabitDisplayName(mapping){
    if(!mapping) return '—';
    if((mapping.group||'').trim()) return mapping.group.trim();
    if(global.OneToneHomeScheme&&global.OneToneHomeScheme.shortName) return global.OneToneHomeScheme.shortName(mapping);
    if((mapping.label||'').trim()) return mapping.label.trim();
    return mapping.id||'—';
  }

  function resolveActiveHabit(){
    const activeId=state.config&&state.config.activeSceneId;
    const mapping=activeId&&state.config&&Array.isArray(state.config.mappings)
      ?state.config.mappings.find(function(m){ return m.id===activeId; }):null;
    return {
      id:activeId||'',
      name:resolveHabitDisplayName(mapping),
      mapping:mapping
    };
  }

  function resolveModeLabel(mode){
    if(mode==='sapi') return t('voiceModeLiteEngine');
    if(mode==='vosk') return t('voiceModeProEngine');
    return t('voiceModeCurrentOff');
  }

  function resolveFinishChipLabel(vm){
    if(vm.mode==='sapi'||vm.mode==='off') return t('voiceChipFinishSilence');
    if(vm.autoSendEnabled){
      return t('voiceChipFinishAuto').replace('{key}',vm.autoSendKey);
    }
    return t('voiceChipFinishManual');
  }

  function buildVoiceSettingsViewModel(loading){
    loading=!!loading;
    const summary=global.OneToneVoiceHomeSummary
      ?global.OneToneVoiceHomeSummary.compute()
      :null;
    const eng=summary?summary.engine:hooks().homeVoiceEngineOn();
    const mode=eng==='vosk'?'vosk':(eng==='sapi'?'sapi':'off');
    const endSnap=hooks().voiceUiSnapshot().end||{};
    const endCfg=(state.config&&state.config.voiceEnd)||(state.config&&state.config.voice_end)||{};
    const habit=resolveActiveHabit();
    const mapping=habit.mapping;
    const wakePhrase=summary?summary.wakePhrase:hooks().homeVoiceWakePhrase();
    const autoSendEnabled=!!endSnap.autoSendEnabled||!!(endCfg&&endCfg.autoSendEnabled);
    const autoSendDelayMs=endSnap.commitDelayMs!=null?endSnap.commitDelayMs:(endCfg&&endCfg.commitDelayMs!=null?endCfg.commitDelayMs:4000);
    const autoSendKey=String(endSnap.commitKey||endCfg.commitKey||endCfg.commit_key||'Enter').trim()||'Enter';
    const endPhrases=((endSnap.phrasesZh||[]).concat(endSnap.phrasesEn||[]));
    const vm={
      loading:loading,
      mode:mode,
      modeLabel:resolveModeLabel(mode),
      wakePhrase:String(wakePhrase||'').trim(),
      wakeSourceLabel:loading?t('homeLiveLoading'):resolveMicLabel(summary),
      endPhraseEnabled:!!endSnap.enabled||!!(endCfg&&endCfg.enabled),
      endPhrases:endPhrases,
      endDetectionLabel:'',
      autoSendEnabled:autoSendEnabled,
      autoSendDelayMs:autoSendDelayMs,
      autoSendKey:autoSendKey,
      finishChipLabel:'',
      habitName:habit.name,
      habitHasKeyAutoSend:!!(mapping&&mapping.autoEnterEnabled),
      habitOverrideEnabled:false,
      voiceOn:!!(summary&&summary.voiceOn),
      statusLine:summary?summary.statusLine:'',
      lite:hooks().voiceEndUiUsesLiteMode()
    };
    vm.finishChipLabel=loading?t('homeLiveLoading'):resolveFinishChipLabel(vm);
    vm.endDetectionLabel=vm.finishChipLabel;
    return vm;
  }

  function firstSelectedPhrase(selector){
    const btn=document.querySelector(selector+' [data-phrase].is-selected');
    return btn?(btn.getAttribute('data-phrase')||'').trim():'';
  }

  function renderVoiceFlowLabels(){
    const pairs=[
      ['voiceSettingsWakeLbl','voiceSettingsStep1Title'],
      ['voiceSettingsEndPhraseLbl','voiceSettingsStep2Title'],
      ['voiceSettingsAutoLbl','voiceSettingsStep3Title'],
      ['voiceSettingsMicLbl','voiceSettingsMicLbl'],
      ['voiceSettingsWakeWayVal','voiceSettingsWakeWayVal'],
      ['voiceWakeCompactLbl','voiceWakeCompactLbl'],
      ['voiceEndCompactLbl','voiceEndCompactLbl'],
      ['voiceWakeCompactHint','voiceWakeCompactHint'],
      ['voiceWakePresetMoreSummary','voiceWakePresetMore'],
      ['voiceEndPresetMoreSummary','voiceWakePresetMore']
    ];
    pairs.forEach(function(pair){
      const el=$(pair[0]);
      if(el) el.textContent=t(pair[1]);
    });
    const switchBtn=$('btnVoiceSwitchHabit');
    if(switchBtn) switchBtn.textContent=t('voiceStatusSwitchHabit');
    const saveHabitBtn=$('btnVoiceSaveHabit');
    if(saveHabitBtn) saveHabitBtn.textContent=t('voiceStatusSaveHabit');
    const delayLbl=$('voiceSettingsDelayLbl');
    if(delayLbl) delayLbl.textContent=t('voiceEndDelay');
  }

  function renderVoiceStepStatus(vm){
    const enabledLabel=vm.loading?t('homeLiveLoading'):t('voiceFlowStepEnabled');
    ['voiceStep1Status','voiceStep2Status','voiceStep3Status'].forEach(function(id){
      const el=$(id);
      if(el) el.textContent=enabledLabel;
    });
  }

  function renderVoiceCompactWake(vm){
    const compact=$('voiceWakeCompact');
    const presetMore=$('voiceWakePresetMore');
    const zhEl=$('voiceWakeCompactZh');
    const enEl=$('voiceWakeCompactEn');
    if(compact) compact.hidden=vm.loading;
    if(presetMore) presetMore.hidden=vm.loading||vm.mode==='off';
    if(vm.loading) return;
    let zh='';
    let en='';
    if(vm.mode==='sapi'){
      zh=firstSelectedPhrase('#voiceSapiPresets')||vm.wakePhrase;
      en='';
    }else if(vm.mode==='vosk'){
      zh=firstSelectedPhrase('#voiceVoskPresetsCn');
      en=firstSelectedPhrase('#voiceVoskPresetsEn');
      if(!zh&&!en) zh=vm.wakePhrase;
    }else{
      zh=vm.wakePhrase;
    }
    if(zhEl) zhEl.textContent=zh||'—';
    if(enEl) enEl.textContent=en||'';
    const langToggle=$('voiceWakeLangToggle');
    if(langToggle){
      const hasBoth=vm.mode==='vosk'&&!!en;
      langToggle.hidden=!hasBoth;
      const lang=global.__vp_voice_wake_lang__||'zh';
      langToggle.querySelectorAll('.flow-lang-btn').forEach(function(b){
        b.classList.toggle('is-on',(b.getAttribute('data-lang')||'')===lang);
      });
      if(hasBoth&&zhEl&&enEl){
        const showEn=lang==='en';
        zhEl.hidden=showEn;
        enEl.hidden=!showEn;
      }else if(zhEl){
        zhEl.hidden=false;
        if(enEl) enEl.hidden=!en;
      }
    }
  }

  function renderVoiceCompactEnd(vm){
    const compact=$('voiceEndCompact');
    const presetMore=$('voiceEndPresetMore');
    const zhEl=$('voiceEndCompactZh');
    const enEl=$('voiceEndCompactEn');
    const show=!vm.loading&&vm.mode==='vosk';
    if(compact) compact.hidden=!show;
    if(presetMore) presetMore.hidden=!show;
    if(!show) return;
    const zh=firstSelectedPhrase('#voiceEndPresetsZh');
    const en=firstSelectedPhrase('#voiceEndPresetsEn');
    if(zhEl) zhEl.textContent=zh||'—';
    if(enEl) enEl.textContent=en||'';
    const langToggle=$('voiceEndLangToggle');
    if(langToggle){
      const hasBoth=!!en;
      langToggle.hidden=!hasBoth;
      const lang=global.__vp_voice_end_lang__||'zh';
      langToggle.querySelectorAll('.flow-lang-btn').forEach(function(b){
        b.classList.toggle('is-on',(b.getAttribute('data-lang')||'')===lang);
      });
      if(hasBoth&&zhEl&&enEl){
        const showEn=lang==='en';
        zhEl.hidden=showEn;
        enEl.hidden=!showEn;
      }else if(zhEl){
        zhEl.hidden=false;
        if(enEl) enEl.hidden=!en;
      }
    }
  }

  function renderVoiceStatusChips(vm){
    const bar=$('voiceFlowStatusBar');
    const engineEl=$('voiceStatusEngine');
    const wakeEl=$('voiceStatusWake');
    const finishEl=$('voiceStatusFinish');
    const legacyWrap=$('voiceStatusChips');
    if(legacyWrap) legacyWrap.hidden=true;
    if(!bar) return;
    if(vm.loading){
      bar.hidden=false;
      [engineEl,wakeEl,finishEl].forEach(function(el){
        if(el){
          el.textContent=t('homeLiveLoading');
          el.classList.add('is-loading');
        }
      });
      return;
    }
    bar.hidden=false;
    if(engineEl){
      engineEl.textContent=t('voiceChipEngine').replace('{val}',vm.modeLabel);
      engineEl.classList.remove('is-loading');
      engineEl.classList.add('is-on');
    }
    if(wakeEl){
      wakeEl.textContent=vm.wakePhrase
        ?t('voiceChipWake').replace('{phrase}',vm.wakePhrase)
        :t('voiceChipWakeUnset');
      wakeEl.classList.remove('is-loading');
      wakeEl.classList.add('is-on');
    }
    if(finishEl){
      finishEl.textContent=vm.finishChipLabel;
      finishEl.classList.remove('is-loading');
      finishEl.classList.add('is-on');
    }
  }

  function renderVoiceScopeBar(vm){
    const bar=$('voiceScopeBar');
    const prefixEl=$('voiceScopePrefix');
    const habitEl=$('voiceScopeHabitName');
    const hintEl=$('voiceScopeHint');
    const linkEl=$('btnVoiceSwitchHabit');
    const legacyNote=$('voiceActiveSceneNote');
    if(legacyNote){
      legacyNote.textContent=t('voiceActiveSceneNote').replace('{scene}',vm.habitName);
    }
    if(!bar) return;
    bar.hidden=true;
    if(prefixEl) prefixEl.textContent=t('voiceScopePrefix');
    if(habitEl) habitEl.textContent=vm.habitName;
    if(hintEl) hintEl.textContent=t('voiceScopeHint');
  }

  function renderVoiceWakeHost(vm){
    const sapiPresets=$('voiceSapiPresets');
    const voskWrap=$('voiceSettingsVoskWakeWrap');
    if(sapiPresets) sapiPresets.hidden=vm.loading||vm.mode!=='sapi';
    if(voskWrap) voskWrap.hidden=vm.loading||vm.mode!=='vosk';
  }

  function renderVoiceStepPanels(vm){
    const liteEl=$('voiceEndDetectLite');
    const voskEl=$('voiceEndPresetsWrap');
    const liteBody=$('voiceEndDetectLiteBody');
    const switchBtn=$('btnVoiceEndDetectSwitchVosk');
    const silenceNote=$('voiceEndSilenceNote');
    const autoDesc=$('voiceSettingsAutoSendDesc');
    const habitNote=$('voiceSendHabitNote');
    const sendDetails=$('voiceSettingsSendDetails');
    const endSnap=hooks().voiceUiSnapshot().end||{};
    const endCfg=(state.config&&state.config.voiceEnd)||(state.config&&state.config.voice_end)||{};
    const zh=Array.isArray(endSnap.phrasesZh)?endSnap.phrasesZh:(endCfg.phrasesZh||[]);
    const en=Array.isArray(endSnap.phrasesEn)?endSnap.phrasesEn:(endCfg.phrasesEn||[]);

    if(liteEl) liteEl.hidden=vm.loading||vm.mode!=='sapi';
    if(voskEl) voskEl.hidden=vm.loading||vm.mode!=='vosk';
    if(liteBody) liteBody.textContent=t('voiceEndDetectLiteBody');
    if(switchBtn) switchBtn.textContent=t('voiceEndDetectSwitchVosk');
    if(silenceNote){
      silenceNote.textContent=t('voiceEndSilenceNote');
    }
    if(!vm.loading&&vm.mode==='vosk'&&global.OneToneVoiceEnd){
      const sync=global.OneToneVoiceEnd.syncPresets;
      if(typeof sync==='function') sync(zh,en);
    }
    if(sendDetails) sendDetails.hidden=vm.loading||!vm.autoSendEnabled;
    if(autoDesc){
      const delaySec=(vm.autoSendDelayMs/1000).toFixed(1);
      autoDesc.textContent=vm.autoSendEnabled
        ?t('voiceSettingsAutoSendDesc')
          .replace('{n}',delaySec)
          .replace('{key}',vm.autoSendKey)
        :'';
    }
    if(habitNote){
      habitNote.textContent=t('voiceSendHabitOverrideNote');
      habitNote.hidden=vm.loading||!vm.autoSendEnabled||!vm.habitHasKeyAutoSend;
    }
    if(global.OneToneVoiceEnd&&global.OneToneVoiceEnd.syncAutoSendToggle){
      global.OneToneVoiceEnd.syncAutoSendToggle(vm.autoSendEnabled);
    }else if(hooks().syncVoiceEndAutoSendToggle){
      hooks().syncVoiceEndAutoSendToggle(vm.autoSendEnabled);
    }
    renderVoiceWakeHost(vm);
  }

  function renderVoiceScopeNote(vm){
    renderVoiceScopeBar(vm);
  }

  function renderVoiceStepLabels(){
    renderVoiceFlowLabels();
  }

  function stripRecognitionPrefix(text){
    text=String(text||'').trim();
    if(!text||text==='—') return '';
    var idx=text.indexOf('：');
    if(idx<0) idx=text.indexOf(':');
    if(idx>=0) return text.slice(idx+1).trim();
    return text;
  }

  function renderVoiceSidebarLive(vm){
    const titleEl=$('voiceSideLiveTitle');
    const statusLbl=$('voiceSideLiveStatusLbl');
    const statusWrap=$('voiceSideLiveStatus');
    const statusDot=$('voiceSideLiveDot');
    const recLbl=$('voiceSideRecognitionLbl');
    const micMeta=$('voiceMicAsideMeta');
    const engineCard=$('voiceModePanelDetails');
    if(titleEl) titleEl.textContent=t('voiceSideLiveTitle');
    if(recLbl) recLbl.textContent=t('voiceSideRecognitionLbl');
    const listening=!vm.loading&&vm.voiceOn;
    if(statusLbl) statusLbl.textContent=vm.loading?t('homeLiveLoading'):(listening?t('voiceSideLiveListening'):t('voiceSideLiveIdle'));
    if(statusWrap) statusWrap.classList.toggle('is-idle',!listening&&!vm.loading);
    if(statusDot) statusDot.hidden=!listening;
    if(micMeta){
      micMeta.textContent=vm.loading?'—':(listening?t('voiceMicAsideMetaLive'):t('voiceMicAsideMetaIdle'));
    }
    if(engineCard){
      engineCard.classList.toggle('is-vosk',vm.mode==='vosk');
      engineCard.classList.toggle('is-sapi',vm.mode==='sapi');
    }
    const actions=$('voiceSideEngineActions');
    if(actions) actions.hidden=vm.mode!=='vosk';
  }

  function renderVoiceEngineSidebar(vm){
    const titleEl=$('voiceSideEngineTitle');
    const badge=$('voiceSideEngineBadge');
    const modeEl=$('voiceSideEngineMetaMode');
    const modelEl=$('voiceSideEngineMetaModel');
    const latencyEl=$('voiceSideEngineMetaLatency');
    const metaWrap=$('voiceSideEngineMeta');
    const recSummary=$('voiceRecognitionAsideSummary');
    if(titleEl) titleEl.textContent=t('voiceSideEngineTitle');
    if(badge){
      badge.hidden=vm.mode!=='vosk';
      if(!badge.hidden) badge.textContent=t('voiceSideEngineBadge');
    }
    if(metaWrap){
      metaWrap.classList.toggle('is-sapi',vm.mode==='sapi');
      metaWrap.classList.toggle('is-vosk',vm.mode==='vosk');
    }
    if(recSummary){
      recSummary.textContent=vm.loading?t('homeLiveLoading'):t('voiceRecognitionAsideSummary').replace('{mode}',vm.modeLabel);
    }
    const w=hooks().voiceUiSnapshot?hooks().voiceUiSnapshot().wake||{}:{};
    const res=vm.mode==='vosk'?w.vosk:(vm.mode==='sapi'?w.sapi:null);
    if(modeEl) modeEl.textContent=vm.loading?'—':vm.modeLabel;
    if(modelEl){
      if(vm.mode==='vosk'&&res){
        var preset=res.modelPreset||'cn-light';
        modelEl.textContent=preset==='en-light'?'small-en-us':'small-cn';
      }else{
        modelEl.textContent='';
      }
    }
    if(latencyEl){
      var metricEl=$(vm.mode==='vosk'?'voiceModeProMetric':'voiceModeLiteMetric');
      var metric=metricEl?String(metricEl.textContent||'').trim():'';
      var loading=metric.indexOf('…')>=0||metric.indexOf('读取')>=0;
      latencyEl.textContent=vm.loading||!metric||loading?t('voiceSideEngineLatency'):metric;
    }
  }

  function renderVoiceAsideSummaries(vm){
    const micDevice=$('voiceMicAsideDevice');
    const expandMic=$('voiceMicAsideExpandHint');
    const shortcutKey=$('voiceShortcutAsideKey');
    const shortcutDesc=$('voiceShortcutAsideDesc');
    const expandShortcut=$('voiceShortcutAsideExpandHint');
    if(micDevice){
      micDevice.textContent=vm.loading?t('homeLiveLoading'):t('voiceSideMicName').replace('{name}',vm.wakeSourceLabel);
    }
    if(expandMic) expandMic.textContent=t('voiceAsideExpandHint');
    if(expandShortcut) expandShortcut.textContent=t('voiceAsideExpandHint');
    if(shortcutDesc) shortcutDesc.textContent=t('voiceAsideShortcutDesc');
    const appExpand=$('voiceAppShortcutsExpandHint');
    if(appExpand) appExpand.textContent=t('voiceAsideExpandHint');
    renderVoiceSidebarLive(vm);
    renderVoiceEngineSidebar(vm);
  }

  function syncVoiceAsideLiveStatus(){
    const statusText=$('voiceMicAsideStatusText');
    const statusWrap=$('voiceMicAsideStatus');
    const livePrimary=$('voiceMicLivePrimary');
    const liveState=$('voiceMicLiveState');
    const statusLbl=$('voiceSideLiveStatusLbl');
    const statusDot=$('voiceSideLiveDot');
    const statusRow=$('voiceSideLiveStatus');
    let raw='';
    if(livePrimary&&livePrimary.textContent&&livePrimary.textContent!=='—'){
      raw=stripRecognitionPrefix(livePrimary.textContent);
    }
    if(!raw&&liveState&&liveState.textContent) raw=liveState.textContent;
    const waitingKey=t('voiceSideLiveWaiting');
    const isWaiting=!raw||raw===t('voiceSapiWaiting')||raw===t('voiceVoskWaiting')||raw===t('homeLiveHeardWaiting');
    if(statusText){
      statusText.textContent=isWaiting?waitingKey:(raw||'—');
    }
    if(statusWrap){
      statusWrap.classList.toggle('is-placeholder',isWaiting||!raw);
      var w=hooks().voiceUiSnapshot?hooks().voiceUiSnapshot().wake||{}:{};
      var wakeApi=global.OneToneVoiceWake;
      var mode=wakeApi&&wakeApi.currentMode?wakeApi.currentMode():'off';
      var res=mode==='vosk'?w.vosk:(mode==='sapi'?w.sapi:null);
      var listening=!!(res&&res.enabled&&(res.state==='listening'||res.state==='starting'));
      statusWrap.classList.toggle('is-typing',listening&&!isWaiting);
    }
    if(statusLbl&&liveState&&liveState.textContent){
      var wakeApi=global.OneToneVoiceWake;
      var listeningLbl=wakeApi&&wakeApi.stateLabel?wakeApi.stateLabel('listening'):'';
      var on=listeningLbl&&liveState.textContent===listeningLbl;
      statusLbl.textContent=on?t('voiceSideLiveListening'):t('voiceSideLiveIdle');
      if(statusDot) statusDot.hidden=!on;
      if(statusRow) statusRow.classList.toggle('is-idle',!on);
    }
  }

  function renderVoiceAsideSummariesFull(vm){
    renderVoiceAsideSummaries(vm);
    syncVoiceAsideLiveStatus();
    const micBars=$('voiceMicAsideBars');
    if(micBars&&!micBars.children.length&&hooks().buildMicLevelBars){
      micBars.innerHTML=hooks().buildMicLevelBars(20);
    }
    const shortcutKey=$('voiceShortcutAsideKey');
    if(shortcutKey){
      const cfg=(state.config&&state.config.voiceSapi)||(state.config&&state.config.voice_sapi)||{};
      const vosk=(state.config&&state.config.voiceVosk)||(state.config&&state.config.voice_vosk)||{};
      const key=String(cfg.targetKey||vosk.targetKey||'RAlt').trim()||'RAlt';
      shortcutKey.textContent=vm.loading?t('homeLiveLoading'):(global.OneToneKeyLabels?global.OneToneKeyLabels.friendlyKeyName(key,global.OneToneI18n.getLang()):key);
    }
  }

  function renderVoiceModeMeta(vm){
    const labelEl=$('voiceModeMetaLabel');
    const dotEl=$('voiceModeMetaDot');
    const hintEl=$('voiceModeMetaHint');
    const linkEl=$('btnVoiceModeMetaDetails');
    if(labelEl){
      labelEl.textContent=vm.loading
        ?t('homeLiveLoading')
        :t('voiceModeMetaCurrent').replace('{mode}',vm.modeLabel);
    }
    if(dotEl){
      dotEl.classList.toggle('is-on',!vm.loading&&vm.mode!=='off');
    }
    if(hintEl) hintEl.textContent=t('voiceModeMetaHint');
    if(linkEl) linkEl.textContent=t('voiceModeMetaDetails');
  }

  function renderVoiceSettingsFlow(loading){
    const uiState=global.OneToneState.ui;
    if(!uiState.drawerOpen||uiState.settingsPanel!=='voiceWake') return;
    loading=!!loading||!hooks().configLoadedFromBackend();
    const vm=buildVoiceSettingsViewModel(loading);
    renderVoiceScopeNote(vm);
    renderVoiceStatusChips(vm);
    renderVoiceStepLabels();
    renderVoiceModeMeta(vm);
    renderVoiceStepPanels(vm);
    renderVoiceStepStatus(vm);
    renderVoiceCompactWake(vm);
    renderVoiceCompactEnd(vm);

    const micNameEl=$('voiceSettingsMicName');
    const endPhraseHint=$('voiceSettingsEndPhraseHint');
    if(micNameEl) micNameEl.textContent=vm.wakeSourceLabel;
    const barsEl=$('voiceSettingsMicBars');
    if(barsEl&&!barsEl.children.length) barsEl.innerHTML=hooks().buildMicLevelBars();

    renderVoiceAsideSummariesFull(vm);

    if(global.OneToneAppBehaviorRules&&global.OneToneAppBehaviorRules.renderVoiceAside){
      global.OneToneAppBehaviorRules.renderVoiceAside();
    }

    if(!vm.loading&&vm.mode!=='vosk'&&global.OneToneVoiceWake&&global.OneToneVoiceWake.syncSapiSensUi){
      const cfg=(state.config&&state.config.voiceSapi)||(state.config&&state.config.voice_sapi)||{};
      global.OneToneVoiceWake.syncSapiSensUi(cfg.minConfidence==null?0.35:cfg.minConfidence);
    }
    if(endPhraseHint) endPhraseHint.textContent='';

    hooks().syncVoiceEndCommitKeyUi(vm.autoSendKey);
    hooks().syncVoiceEndDelayRanges(vm.autoSendDelayMs);

    var voiceTargetEl=$('voiceSettingsTargetKey');
    if(voiceTargetEl){
      const cfg=(state.config&&state.config.voiceSapi)||(state.config&&state.config.voice_sapi)||{};
      const vosk=(state.config&&state.config.voiceVosk)||(state.config&&state.config.voice_vosk)||{};
      const key=String(cfg.targetKey||vosk.targetKey||'RAlt').trim()||'RAlt';
      voiceTargetEl.textContent=vm.loading?t('homeLiveLoading'):(global.OneToneKeyLabels?global.OneToneKeyLabels.friendlyKeyName(key,global.OneToneI18n.getLang()):key);
    }
    if(global.OneToneImePresets) global.OneToneImePresets.refresh('voice');
  }

  global.OneToneVoiceSettingsFlow={
    render:renderVoiceSettingsFlow,
    buildViewModel:buildVoiceSettingsViewModel,
    syncAsideLiveStatus:syncVoiceAsideLiveStatus
  };
})((typeof window!=='undefined')?window:globalThis);
