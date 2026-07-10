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
    if(global.OneToneVoiceEngineReadiness&&global.OneToneVoiceEngineReadiness.isVoskOnlyUi()){
      if(mode==='off') return t('voiceModeCurrentOff');
      return t('voiceModeProEngine');
    }
    if(mode==='sapi') return t('voiceModeLiteEngine');
    if(mode==='vosk') return t('voiceModeProEngine');
    return t('voiceModeCurrentOff');
  }

  function resolveOutputSummaryLabel(vm){
    if(vm.loading) return t('homeLiveLoading');
    if(vm.mode==='sapi'||vm.mode==='off') return t('voiceSummaryOutputSilence');
    if(vm.autoSendEnabled) return t('voiceSummaryOutputAuto').replace('{key}',vm.autoSendKey);
    return t('voiceSummaryOutputConfirm');
  }

  function resolveOutputModeKey(vm){
    if(vm.mode==='sapi'||vm.mode==='off') return 'manual';
    return vm.autoSendEnabled?'auto':'confirm';
  }

  function resolveEndRuleSummary(vm){
    if(vm.loading) return t('homeLiveLoading');
    if(vm.mode==='sapi'||vm.mode==='off') return t('voiceEndRulesSummarySilence');
    if(vm.endPhraseEnabled&&vm.endPhrases&&vm.endPhrases.length) return t('voiceEndRulesSummaryPhraseSilence');
    if(vm.endPhraseEnabled) return t('voiceEndRulesSummaryPhrase');
    return t('voiceEndRulesSummarySilence');
  }

  function setRecognizeNavState(targetId){
    const nav=$('voiceRecognizeNav');
    if(!nav) return;
    nav.querySelectorAll('.voice-recognize-nav-link').forEach(function(link){
      const href=(link.getAttribute('href')||'').replace(/^#/,'');
      link.classList.toggle('is-active',href===targetId);
    });
  }

  function resolveScopeSummary(vm){
    const m=vm.habitMapping;
    if(!m) return t('voiceSummaryScopeAll');
    const appRules=global.OneToneAppBehaviorRules;
    const primary=String(m.appTargetId||'').trim();
    const rules=Array.isArray(m.appBehaviorRules)?m.appBehaviorRules.filter(function(r){ return r&&r.appId; }):[];
    if(!primary&&!rules.length) return t('voiceSummaryScopeAll');
    if(primary&&appRules){
      if(!rules.length||rules.length===0) return appRules.appDisplayName(primary);
    }
    const ids=[];
    if(primary) ids.push(primary);
    rules.forEach(function(r){
      if(ids.indexOf(r.appId)<0) ids.push(r.appId);
    });
    if(ids.length===1&&appRules) return appRules.appDisplayName(ids[0]);
    if(ids.length>1) return t('voiceSummaryScopeMulti').replace('{n}',String(ids.length));
    return t('voiceSummaryScopeAll');
  }

  function resolveSchemeDisplayName(vm){
    if(vm.loading) return t('homeLiveLoading');
    const habit=vm.habitName&&vm.habitName!=='—'?vm.habitName:t('voiceSchemeDefaultName').split('·')[0].trim();
    return habit+' · '+vm.modeLabel;
  }

  function escHtml(s){
    return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');
  }

  function presetIcon(appId){
    var atp=global.OneToneAppTargetPresets;
    if(!atp||!atp.presetById) return '';
    var preset=atp.presetById(appId);
    return preset&&preset.icon?preset.icon:'';
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
      habitMapping:mapping,
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
      ['voiceSettingsWakeLbl','voiceSettingsInputLbl'],
      ['voiceSettingsEndPhraseLbl','voiceSettingsRecognizeLbl'],
      ['voiceSettingsAutoLbl','voiceSettingsOutputLbl'],
      ['voiceColInputLbl','voiceColInput'],
      ['voiceColRecognizeLbl','voiceColRecognize'],
      ['voiceColOutputLbl','voiceColOutput'],
      ['voiceSummaryInputLbl','voiceSummaryInputLbl'],
      ['voiceSummaryEngineLbl','voiceSummaryEngineLbl'],
      ['voiceSummaryOutputLbl','voiceSummaryOutputLbl'],
      ['voiceSummaryScopeLbl','voiceSummaryScopeLbl'],
      ['voiceAppScopeLbl','voiceAppScopeLbl'],
      ['voiceRecognizeSourceLbl','voiceRecognizeSourceLbl'],
      ['voiceRecognizeCloudHint','voiceRecognizeCloudHint'],
      ['voiceRecognizePrimaryTag','voiceRecognizeCurrentTag'],
      ['voiceRecognizeNavMethod','voiceRecognizeNavMethod'],
      ['voiceRecognizeNavRules','voiceRecognizeNavRules'],
      ['voiceRecognizeNavAdvanced','voiceRecognizeNavAdvanced'],
      ['voiceRecognizeMethodTitle','voiceRecognizeMethodTitle'],
      ['voiceRecognizeMethodNote','voiceRecognizeMethodNote'],
      ['voiceEndRulesTitle','voiceEndRulesTitle'],
      ['voiceAdvancedTitle','voiceAdvancedTitle'],
      ['voiceAdvancedNote','voiceAdvancedNote'],
      ['voiceTestDiagTitle','voiceTestDiagTitle'],
      ['voiceSchemesTitle','voiceSchemesTitle'],
      ['voiceTemplatesTitle','voiceTemplatesTitle'],
      ['voiceTemplateFootnote','voiceTemplateFootnote'],
      ['voiceSchemesMockNote','voiceSchemesMockNote'],
      ['voiceEndPhraseMoreSummary','voiceEndPhraseMore'],
      ['voiceInputAdvancedSummary','voiceInputAdvancedSummary'],
      ['voiceMicPickerSummary','voiceMicPickerSummary'],
      ['voiceRecognizeEngineSummary','voiceRecognizeEngineSummary'],
      ['voiceSettingsMicHint','voiceInputMicHint'],
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
    if(saveHabitBtn) saveHabitBtn.textContent=t('voiceSummarySave');
    const testTopBtn=$('btnVoiceTestTop');
    if(testTopBtn) testTopBtn.textContent=t('voiceSummaryTest');
    const recognizeChange=$('btnVoiceRecognizeChange');
    if(recognizeChange) recognizeChange.textContent=t('voiceRecognizeChange');
    const srcSapi=$('voiceRecognizeSourceSapi');
    if(srcSapi) srcSapi.textContent=t('voiceRecognizeSourceSapi');
    const srcVosk=$('voiceRecognizeSourceVosk');
    if(srcVosk) srcVosk.textContent=t('voiceRecognizeSourceVosk');
    const srcCustom=$('voiceRecognizeSourceCustom');
    if(srcCustom) srcCustom.textContent=t('voiceRecognizeSourceCustom');
    const primarySub=$('voiceRecognizePrimarySub');
    if(primarySub) primarySub.textContent=t('voiceRecognizePrimarySubSystem');
    const outAuto=$('voiceOutputModeAuto');
    if(outAuto) outAuto.textContent=t('voiceOutputModeAuto');
    const outConfirm=$('voiceOutputModeConfirm');
    if(outConfirm) outConfirm.textContent=t('voiceOutputModeConfirm');
    const outManual=$('voiceOutputModeManual');
    if(outManual) outManual.textContent=t('voiceOutputModeManual');
    const trigClick=$('voiceInputTriggerModes')&&$('voiceInputTriggerModes').querySelector('[data-voice-trigger-mode="click"]');
    if(trigClick) trigClick.textContent=t('voiceInputTriggerClickSoon');
    const trigListen=$('voiceInputTriggerModes')&&$('voiceInputTriggerModes').querySelector('[data-voice-trigger-mode="listen"]');
    if(trigListen) trigListen.textContent=t('voiceInputTriggerListenSoon');
    const trigHintKey=$('voiceTriggerModeHintKey');
    if(trigHintKey) trigHintKey.textContent=t('voiceInputTriggerKeyHint');
    const trigHintClick=$('voiceTriggerModeHintClick');
    if(trigHintClick) trigHintClick.textContent=t('voiceInputTriggerClickHint');
    const trigHintListen=$('voiceTriggerModeHintListen');
    if(trigHintListen) trigHintListen.textContent=t('voiceInputTriggerListenHint');
    const schemesAdd=$('voiceSchemesAdd');
    if(schemesAdd) schemesAdd.textContent=t('voiceSchemesAdd');
    const scopeAdd=$('btnVoiceAppScopeAdd');
    if(scopeAdd) scopeAdd.textContent=t('keysAppChipAdd');
    const outputInfo=$('voiceOutputInfoBox');
    if(outputInfo) outputInfo.textContent=t('voiceOutputInfoBox');
    const wakeCustomLbl=$('voiceWakeCustomLbl');
    if(wakeCustomLbl) wakeCustomLbl.textContent=t('voiceWakeCustomLbl');
    const wakeCustomHint=$('voiceWakeCustomHint');
    if(wakeCustomHint) wakeCustomHint.textContent=t('voiceWakeCustomHint');
    const wakeCustomInput=$('voiceWakeCustomInput');
    if(wakeCustomInput) wakeCustomInput.placeholder=t('voiceWakeCustomPlaceholder');
    const endCustomLbl=$('voiceEndCustomLbl');
    if(endCustomLbl) endCustomLbl.textContent=t('voiceEndCustomLbl');
    const endCustomHint=$('voiceEndCustomHint');
    if(endCustomHint) endCustomHint.textContent=t('voiceEndCustomHint');
    const wakeCustomAdd=$('btnVoiceWakeCustomAdd');
    if(wakeCustomAdd) wakeCustomAdd.textContent=t('voicePhraseAdd');
    const endCustomAdd=$('btnVoiceEndCustomAdd');
    if(endCustomAdd) endCustomAdd.textContent=t('voicePhraseAdd');
    const wakeListen=$('btnVoiceWakeCustomListen');
    if(wakeListen){
      wakeListen.title=t('voicePhraseListenBtn');
      wakeListen.setAttribute('aria-label',t('voicePhraseListenBtn'));
    }
    const endListen=$('btnVoiceEndCustomListen');
    if(endListen){
      endListen.title=t('voicePhraseListenBtn');
      endListen.setAttribute('aria-label',t('voicePhraseListenBtn'));
    }
    const delayLbl=$('voiceSettingsDelayLbl');
    if(delayLbl) delayLbl.textContent=t('voiceEndDelay');
    var title=$('settingsPanelVoiceWakeTitle');
    if(title) title.textContent=t('settingsPanelVoiceWakeTitle');
    var desc=$('settingsPanelVoiceWakeDesc');
    if(desc) desc.textContent=t('settingsPanelVoiceWakeDesc');
  }

  function renderVoiceStepLabels(){
    renderVoiceFlowLabels();
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
    var schemeStatus=$('voiceSummaryStatus');
    var schemeName=$('voiceSummaryName');
    var sumInput=$('voiceSummaryInput');
    var sumEngine=$('voiceSummaryEngine');
    var sumOutput=$('voiceSummaryOutput');
    var sumScope=$('voiceSummaryScope');
    var enabledToggle=$('btnVoiceEnabled');
    if(vm.loading){
      bar.hidden=false;
      [engineEl,wakeEl,finishEl].forEach(function(el){
        if(el){
          el.textContent=t('homeLiveLoading');
          el.classList.add('is-loading');
        }
      });
      if(schemeStatus) schemeStatus.textContent=t('homeLiveLoading');
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
    if(schemeName) schemeName.textContent=resolveSchemeDisplayName(vm);
    if(sumInput) sumInput.textContent=vm.wakeSourceLabel||t('voiceSummaryInputFallback');
    if(sumEngine) sumEngine.textContent=vm.modeLabel;
    if(sumOutput) sumOutput.textContent=resolveOutputSummaryLabel(vm);
    if(sumScope) sumScope.textContent=resolveScopeSummary(vm);
    if(schemeStatus){
      schemeStatus.textContent=vm.voiceOn?t('voiceSummaryStatusOn'):t('voiceSummaryStatusOff');
      schemeStatus.classList.toggle('is-on',!!vm.voiceOn);
    }
    if(enabledToggle){
      enabledToggle.classList.toggle('is-on',!!vm.voiceOn);
      enabledToggle.setAttribute('aria-checked',vm.voiceOn?'true':'false');
      const toggleTitle=t(vm.voiceOn?'voiceToggleDisableHint':'voiceToggleEnableHint');
      enabledToggle.title=toggleTitle;
      enabledToggle.setAttribute('aria-label',toggleTitle);
    }
    var modeSeg=$('voiceOutputModeSegments');
    if(modeSeg){
      var key=resolveOutputModeKey(vm);
      var liteMode=vm.mode==='sapi'||vm.mode==='off';
      modeSeg.querySelectorAll('.keys-trigger-mode-seg').forEach(function(btn){
        var segKey=btn.getAttribute('data-voice-output-mode')||'';
        btn.classList.toggle('is-active',segKey===key);
        btn.disabled=vm.loading||(liteMode&&segKey!=='manual');
      });
    }
    renderVoiceRecognizePanel(vm);
    renderVoiceOutputPanel(vm);
    renderVoiceAppScopeStrip(vm);
    renderVoiceTestDiagnostics(vm);
    renderVoiceSchemesHub(vm);
  }

  function renderVoiceRecognizePanel(vm){
    const primaryName=$('voiceRecognizePrimaryName');
    const primarySub=$('voiceRecognizePrimarySub');
    const sapiCard=$('voiceRecognizeSapiCard');
    const sourceGrid=$('voiceRecognizeSourceGrid');
    const endRulesSummary=$('voiceEndRulesSummary');
    const advancedDetails=$('voiceRecognizeEngineDetails');
    const endDetails=$('voiceEndPhraseMore');
    const voskOnly=global.OneToneVoiceEngineReadiness&&global.OneToneVoiceEngineReadiness.isVoskOnlyUi();
    if(primaryName){
      primaryName.textContent=vm.loading?t('homeLiveLoading'):(
        vm.mode==='vosk'?t('voiceRecognizeSourceVosk'):t('voiceRecognizeSourceSapi')
      );
    }
    if(primarySub){
      if(vm.loading) primarySub.textContent=t('homeLiveLoading');
      else primarySub.textContent=vm.mode==='vosk'
        ?t('voiceRecognizePrimarySubLocal')
        :t('voiceRecognizePrimarySubSystem');
    }
    if(sapiCard) sapiCard.hidden=true;
    if(endRulesSummary) endRulesSummary.textContent=resolveEndRuleSummary(vm);
    if(sourceGrid){
      sourceGrid.querySelectorAll('[data-voice-engine-tab]').forEach(function(btn){
        const tab=btn.getAttribute('data-voice-engine-tab')||'';
        const active=!vm.loading&&vm.mode===tab;
        btn.classList.toggle('is-active',active);
        if(tab==='sapi') btn.hidden=!!voskOnly;
      });
    }
    if(advancedDetails&&advancedDetails.open) setRecognizeNavState('voiceAdvancedSection');
    else if(endDetails&&endDetails.open) setRecognizeNavState('voiceEndRulesSection');
    else setRecognizeNavState('voiceRecognizeMethodSection');
  }

  function renderVoiceOutputPanel(vm){
    const hint=$('voiceOutputHint');
    const sendBlock=$('voiceSettingsSendBlock');
    const finishBlock=$('voiceSettingsFinishBlock');
    const outputInfo=$('voiceOutputInfoBox');
    const key=resolveOutputModeKey(vm);
    const liteMode=vm.mode==='sapi'||vm.mode==='off';
    if(hint){
      if(vm.loading) hint.textContent=t('homeLiveLoading');
      else if(liteMode||key==='manual') hint.textContent=t('voiceOutputHintManual');
      else if(key==='auto') hint.textContent=t('voiceOutputHintAuto');
      else hint.textContent=t('voiceOutputHintConfirm');
    }
    if(finishBlock){
      finishBlock.dataset.outputMode=key;
      finishBlock.dataset.liteMode=liteMode?'true':'false';
    }
    if(sendBlock){
      sendBlock.classList.toggle('voice-output-lite',liteMode);
      sendBlock.hidden=vm.loading||liteMode||key!=='auto';
      const sendDetails=$('voiceSettingsSendDetails');
      if(sendDetails) sendDetails.hidden=vm.loading||liteMode||key!=='auto';
    }
    if(outputInfo) outputInfo.hidden=vm.loading||(!liteMode&&key==='auto');
  }

  function renderVoiceAppScopeStrip(vm){
    const strip=$('voiceAppScopeStrip');
    const chips=$('voiceAppScopeChips');
    const appRules=global.OneToneAppBehaviorRules;
    if(!strip||!chips||!appRules) return;
    const m=vm.habitMapping;
    if(!m){
      strip.hidden=true;
      return;
    }
    strip.hidden=false;
    const presets=appRules.behaviorPresets||[];
    const primaryId=String(m.appTargetId||'').trim();
    const noneSelected=!primaryId;
    var html='<button type="button" class="keys-app-chip keys-app-chip--none'+(noneSelected?' is-selected':'')+'" data-voice-scope-none="1" role="radio" aria-checked="'+(noneSelected?'true':'false')+'"><span>'+escHtml(t('keysAppChipNone'))+'</span></button>';
    presets.forEach(function(p){
      const icon=presetIcon(p.id);
      const isPri=primaryId===p.id;
      const name=appRules.appDisplayName(p.id);
      const inRules=Array.isArray(m.appBehaviorRules)&&m.appBehaviorRules.some(function(r){ return r&&r.appId===p.id; });
      if(!isPri&&!inRules) return;
      html+='<button type="button" class="keys-app-chip'+(isPri?' is-selected is-primary':'')+'" data-voice-scope-app="'+escHtml(p.id)+'" role="radio" aria-checked="'+(isPri?'true':'false')+'" title="'+escHtml(name)+'">';
      if(icon) html+='<img class="keys-app-chip-icon" src="'+escHtml(icon)+'" alt="" decoding="async" />';
      html+='<span>'+escHtml(name)+'</span></button>';
    });
    chips.innerHTML=html;
  }

  function renderVoiceTestDiagnostics(vm){
    const textEl=$('voiceTestText');
    const metaEl=$('voiceTestMeta');
    const chipsEl=$('voiceTestChips');
    const wave=$('voiceTestWave');
    const timerEl=$('voiceTestTimer');
    if(textEl){
      textEl.textContent=t('voiceTestSample').replace('{text}',vm.loading?'—':'今天天气不错，帮我记录一下');
    }
    if(metaEl){
      const status=vm.loading?t('homeLiveLoading'):t('voiceTestStatusReady');
      metaEl.textContent=t('voiceTestMeta').replace('{mode}',vm.modeLabel).replace('{status}',status);
    }
    if(timerEl){
      timerEl.textContent=vm.loading?'--:--':'';
      if(!vm.loading) timerEl.textContent=t('voiceTestTimerIdle');
    }
    if(wave) wave.classList.toggle('is-live',!vm.loading&&vm.voiceOn);
    if(chipsEl){
      const micOk=!vm.loading&&!!vm.wakeSourceLabel&&vm.wakeSourceLabel!==t('homeVoiceMapMicEmpty');
      const engOk=!vm.loading&&vm.mode!=='off'&&vm.voiceOn;
      chipsEl.innerHTML=
        '<span class="voice-test-chip'+(micOk?' is-ok':'')+'">'+escHtml(micOk?t('voiceTestChipMicOk'):t('voiceTestChipMicWarn'))+'</span>'+
        '<span class="voice-test-chip'+(engOk?' is-ok':'')+'">'+escHtml(engOk?t('voiceTestChipEngineOk'):t('voiceTestChipEngineOff'))+'</span>'+
        '<span class="voice-test-chip">'+escHtml(t('voiceTestChipShortcut'))+'</span>';
    }
  }

  function renderVoiceSchemesHub(vm){
    const nameEl=$('voiceSchemesCurrentName');
    const pairEl=$('voiceSchemesCurrentPair');
    const tagEl=$('voiceSchemesCurrentTag');
    const toggle=$('voiceSchemesCurrentToggle');
    const countEl=$('voiceSchemesCount');
    if(nameEl) nameEl.textContent=resolveSchemeDisplayName(vm);
    if(pairEl) pairEl.textContent=vm.loading?t('homeLiveLoading'):t('voiceSchemesCurrent');
    if(tagEl){
      tagEl.textContent=vm.voiceOn?t('voiceSummaryStatusOn'):t('voiceSummaryStatusOff');
      tagEl.classList.toggle('is-active',!!vm.voiceOn);
    }
    if(toggle){
      toggle.classList.toggle('is-on',!!vm.voiceOn);
      toggle.setAttribute('aria-checked',vm.voiceOn?'true':'false');
    }
    if(countEl) countEl.textContent='1';
    const inputChips=$('voiceInputStatusChips');
    if(inputChips){
      inputChips.innerHTML=
        '<span class="voice-input-status-chip is-ok">'+escHtml(t('voiceInputChipMicOk'))+'</span>'+
        '<span class="voice-input-status-chip is-ok">'+escHtml(t('voiceInputChipVolumeOk'))+'</span>'+
        '<span class="voice-input-status-chip">'+escHtml(t('voiceInputChipDenoise'))+'</span>';
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
    var hideLite=global.OneToneVoiceEngineReadiness&&global.OneToneVoiceEngineReadiness.isVoskOnlyUi();
    if(sapiPresets) sapiPresets.hidden=hideLite||vm.loading||vm.mode!=='sapi';
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

    var hideLite=global.OneToneVoiceEngineReadiness&&global.OneToneVoiceEngineReadiness.isVoskOnlyUi();
    if(liteEl) liteEl.hidden=hideLite||vm.loading||vm.mode!=='sapi';
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
    if(sendDetails){
      const key=resolveOutputModeKey(vm);
      const liteMode=vm.mode==='sapi'||vm.mode==='off';
      sendDetails.hidden=vm.loading||liteMode||key!=='auto'||!vm.autoSendEnabled;
    }
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

  function renderVoiceCapabilityNote(vm){
    const note=$('voiceEngineCapabilityNote');
    if(!note) return;
    if(vm.loading){
      note.textContent=t('homeLiveLoading');
      return;
    }
    if(global.OneToneVoiceEngineReadiness&&global.OneToneVoiceEngineReadiness.isVoskOnlyUi()){
      note.textContent=t('voiceEngineCapabilityNotePro');
      return;
    }
    if(vm.mode==='sapi'){
      note.textContent=t('voiceEngineCapabilityNoteLite');
    }else if(vm.mode==='vosk'){
      note.textContent=t('voiceEngineCapabilityNotePro');
    }else{
      note.textContent=t('voiceEngineCapabilityNoteOff');
    }
  }

  function renderVoiceCustomPhraseBlocks(vm){
    if(global.OneToneVoiceWake&&global.OneToneVoiceWake.renderWakeCustomPhrases){
      global.OneToneVoiceWake.renderWakeCustomPhrases();
    }
    if(global.OneToneVoiceEnd&&global.OneToneVoiceEnd.renderEndCustomPhrases){
      global.OneToneVoiceEnd.renderEndCustomPhrases();
    }
    const endBlock=$('voiceEndCustomBlock');
    if(endBlock) endBlock.hidden=vm.loading||vm.mode!=='vosk';
    const wakeBlock=$('voiceWakeCustomBlock');
    if(wakeBlock) wakeBlock.hidden=vm.loading||vm.mode==='off';
  }

  function renderVoiceSaveHabitAction(vm){
    const saveHabitBtn=$('btnVoiceSaveHabit');
    if(!saveHabitBtn) return;
    saveHabitBtn.hidden=vm.loading||vm.mode==='off';
    saveHabitBtn.disabled=vm.loading||vm.mode==='off';
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
    const liveCard=$('voiceSideLiveCard');
    if(liveCard&&liveCard.hidden) return;
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
    const panelDetails=$('voiceModePanelDetails');
    if(panelDetails&&panelDetails.hidden){
      const actions=$('voiceSideEngineActions');
      if(actions) actions.hidden=vm.mode!=='vosk';
      return;
    }
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
      var voskOnly=global.OneToneVoiceEngineReadiness&&global.OneToneVoiceEngineReadiness.isVoskOnlyUi();
      var metricEl=$(voskOnly||vm.mode==='vosk'?'voiceModeProMetric':'voiceModeLiteMetric');
      var metric=metricEl?String(metricEl.textContent||'').trim():'';
      var loading=metric.indexOf('…')>=0||metric.indexOf('读取')>=0;
      latencyEl.textContent=vm.loading||!metric||loading?t('voiceSideEngineLatency'):metric;
    }
  }

  function renderVoiceAsideSummaries(vm){
    const stash=$('voiceAsideStash');
    if(stash&&(stash.hidden||stash.classList.contains('sr-only'))){
      const actions=$('voiceSideEngineActions');
      if(actions) actions.hidden=vm.mode!=='vosk';
      return;
    }
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
    const livePrimary=$('voiceMicLivePrimary');
    const liveState=$('voiceMicLiveState');
    const metaEl=$('voiceTestMeta');
    let raw='';
    if(livePrimary&&livePrimary.textContent&&livePrimary.textContent!=='—'){
      raw=stripRecognitionPrefix(livePrimary.textContent);
    }
    if(!raw&&liveState&&liveState.textContent) raw=liveState.textContent;
    const waitingKey=t('voiceSideLiveWaiting');
    const isWaiting=!raw||raw===t('voiceSapiWaiting')||raw===t('voiceVoskWaiting')||raw===t('homeLiveHeardWaiting');
    var w=hooks().voiceUiSnapshot?hooks().voiceUiSnapshot().wake||{}:{};
    var wakeApi=global.OneToneVoiceWake;
    var mode=wakeApi&&wakeApi.currentMode?wakeApi.currentMode():'off';
    var res=mode==='vosk'?w.vosk:(mode==='sapi'?w.sapi:null);
    var listening=!!(res&&res.enabled&&(res.state==='listening'||res.state==='starting'));
    var statusLabel=t('voiceTestStatusReady');
    if(listening&&!isWaiting) statusLabel=t('voiceTestStatusListening');
    else if(!isWaiting&&raw) statusLabel=t('voiceTestStatusDone');
    if(metaEl){
      var modeLbl=mode==='vosk'?t('voiceRecognizeSourceVosk'):(mode==='sapi'?t('voiceRecognizeSourceSapi'):t('voiceModeCurrentOff'));
      metaEl.textContent=t('voiceTestMeta').replace('{mode}',modeLbl).replace('{status}',statusLabel);
    }
    const timerEl=$('voiceTestTimer');
    if(timerEl){
      timerEl.textContent=listening?t('voiceTestStatusListening'):t('voiceTestTimerIdle');
    }
    const statusText=$('voiceMicAsideStatusText');
    if(statusText){
      statusText.textContent=isWaiting?waitingKey:(raw||'—');
    }
  }

  function renderVoiceAsideSummariesFull(vm){
    renderVoiceAsideSummaries(vm);
    syncVoiceAsideLiveStatus();
    const actions=$('voiceSideEngineActions');
    if(actions) actions.hidden=vm.mode!=='vosk';
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
    renderVoiceCapabilityNote(vm);
    renderVoiceCustomPhraseBlocks(vm);
    renderVoiceSaveHabitAction(vm);

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
