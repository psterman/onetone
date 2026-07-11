(function(global){
  'use strict';
  var $=function(id){ return global.OneToneDom.$(id); };
  var t=function(key){ return global.OneToneI18n.t(key); };

  function vmApi(){
    return global.OneToneVoiceSettingsViewModel;
  }

  function renderLabels(){
    const pairs=[
      ['voiceSettingsWakeLbl','voiceSettingsWakeLbl'],
      ['voiceSubtabWakeLbl','voiceSubtabWakeLbl'],
      ['voiceSubtabRecognizeLbl','voiceSubtabRecognizeLbl'],
      ['voiceSubtabSendLbl','voiceSubtabSendLbl'],
      ['voiceSubtabModelsLbl','voiceSubtabModelsLbl'],
      ['voiceSettingsEndPhraseLbl','voiceSettingsRecognizeLbl'],
      ['voiceSettingsAutoLbl','voiceSettingsOutputLbl'],
      ['voiceColInputLbl','voiceColWake'],
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
      ['voiceEndPhraseMoreSummary','voiceEndRulesTitle'],
      ['voiceOutputSummonLbl','voiceOutputSummonLbl'],
      ['voiceOutputSummonHint','voiceOutputSummonHint'],
      ['voiceMicPickerSummary','voiceMicPickerSummary'],
      ['voiceRecognizeEngineSummary','voiceRecognizeEngineSummary'],
      ['voiceSettingsMicHint','voiceInputMicHint'],
      ['voiceSettingsMicLbl','voiceSettingsMicLbl'],
      ['voiceWakeCompactLbl','voiceWakeCompactLbl'],
      ['voiceEndCompactLbl','voiceEndCompactLbl'],
      ['voiceWakeCompactHint','voiceWakeCompactHint'],
      ['voiceWakePresetMoreSummary','voiceWakePresetMore'],
      ['voiceEndPresetMoreSummary','voiceWakePresetMore'],
      ['voiceWakeEditSummary','voiceWakeEditSummary'],
      ['voiceEditSectionPresets','voiceEditSectionPresets'],
      ['voiceEditSectionCustom','voiceEditSectionCustom'],
      ['voiceEditSectionMic','voiceEditSectionMic'],
      ['voiceEditSectionEngine','voiceEditSectionEngine'],
      ['voiceEditSectionLangModel','voiceEditSectionLangModel'],
      ['voiceEditSectionModelRes','voiceEditSectionModelRes'],
      ['voiceEditSectionSend','voiceEditSectionSend'],
      ['voiceRecognizeAdvancedSummary','voiceRecognizeAdvancedSummary'],
      ['voiceOutputMoreSummary','voiceOutputMoreSummary'],
      ['voiceWakeDisplayHint','voiceWakeDisplayHint']
    ];
    pairs.forEach(function(pair){
      const el=$(pair[0]);
      if(el) el.textContent=t(pair[1]);
    });
    const saveHabitBtn=$('btnVoiceSaveHabit');
    if(saveHabitBtn) saveHabitBtn.textContent=t('voiceSummarySave');
    const srcSapi=$('voiceRecognizeSourceSapi');
    if(srcSapi) srcSapi.textContent=t('voiceRecognizeSourceSapi');
    const srcVosk=$('voiceRecognizeSourceVosk');
    if(srcVosk) srcVosk.textContent=t('voiceRecognizeSourceVosk');
    const primarySub=$('voiceRecognizePrimarySub');
    if(primarySub) primarySub.textContent=t('voiceRecognizePrimarySubSystem');
    const outAuto=$('voiceOutputModeAuto');
    if(outAuto) outAuto.textContent=t('voiceOutputModeAuto');
    const outConfirm=$('voiceOutputModeConfirm');
    if(outConfirm) outConfirm.textContent=t('voiceOutputModeConfirm');
    const outManual=$('voiceOutputModeManual');
    if(outManual) outManual.textContent=t('voiceOutputModeManual');
    const scopeAdd=$('btnVoiceAppScopeAdd');
    if(scopeAdd) scopeAdd.textContent=t('keysAppChipAdd');
    const summonManage=$('btnVoiceOutputSummonManage');
    if(summonManage) summonManage.textContent=t('voiceOutputSummonManage');
    const habitLink=$('btnVoiceSendHabitLink');
    if(habitLink) habitLink.textContent=t('voiceSendHabitLink');
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
    if(delayLbl) delayLbl.textContent=t('voiceEndDelaySend');
    var title=$('settingsPanelVoiceWakeTitle');
    if(title) title.textContent=t('settingsPanelVoiceWakeTitle');
    var desc=$('settingsPanelVoiceWakeDesc');
    if(desc) desc.textContent=t('settingsPanelVoiceWakeDesc');
  }

  function renderStepStatus(vm){
    const enabledLabel=vm.loading?t('homeLiveLoading'):t('voiceFlowStepEnabled');
    ['voiceStep1Status','voiceStep2Status','voiceStep3Status'].forEach(function(id){
      const el=$(id);
      if(el) el.textContent=enabledLabel;
    });
  }

  function renderHeaderSummary(vm){
    var V=vmApi();
    var schemeStatus=$('voiceSummaryStatus');
    var schemeName=$('voiceSummaryName');
    var sumInput=$('voiceSummaryInput');
    var sumEngine=$('voiceSummaryEngine');
    var sumOutput=$('voiceSummaryOutput');
    var sumScope=$('voiceSummaryScope');
    var enabledToggle=$('btnVoiceEnabled');
    if(vm.loading){
      if(schemeStatus) schemeStatus.textContent=t('homeLiveLoading');
      return;
    }
    if(schemeName) schemeName.textContent=V.resolveSchemeDisplayName(vm);
    if(sumInput) sumInput.textContent=V.resolveDisplayWakePhrase(vm).display;
    if(sumEngine) sumEngine.textContent=vm.modeLabel;
    if(sumOutput) sumOutput.textContent=V.resolveOutputSummaryLabel(vm);
    if(sumScope) sumScope.textContent=V.resolveScopeSummary(vm);
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
  }

  function presetIcon(appId){
    var atp=global.OneToneAppTargetPresets;
    if(!atp||!atp.presetById) return '';
    var preset=atp.presetById(appId);
    return preset&&preset.icon?preset.icon:'';
  }

  function renderAppScope(vm){
    var V=vmApi();
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
    var html='<button type="button" class="keys-app-chip keys-app-chip--none'+(noneSelected?' is-selected':'')+'" data-voice-scope-none="1" role="radio" aria-checked="'+(noneSelected?'true':'false')+'"><span>'+V.escHtml(t('keysAppChipNone'))+'</span></button>';
    presets.forEach(function(p){
      const icon=presetIcon(p.id);
      const isPri=primaryId===p.id;
      const name=appRules.appDisplayName(p.id);
      const inRules=Array.isArray(m.appBehaviorRules)&&m.appBehaviorRules.some(function(r){ return r&&r.appId===p.id; });
      if(!isPri&&!inRules) return;
      html+='<button type="button" class="keys-app-chip'+(isPri?' is-selected is-primary':'')+'" data-voice-scope-app="'+V.escHtml(p.id)+'" role="radio" aria-checked="'+(isPri?'true':'false')+'" title="'+V.escHtml(name)+'">';
      if(icon) html+='<img class="keys-app-chip-icon" src="'+V.escHtml(icon)+'" alt="" decoding="async" />';
      html+='<span>'+V.escHtml(name)+'</span></button>';
    });
    chips.innerHTML=html;
  }

  function renderModeMeta(vm){
    const labelEl=$('voiceModeMetaLabel');
    const dotEl=$('voiceModeMetaDot');
    const hintEl=$('voiceModeMetaHint');
    const linkEl=$('btnVoiceModeMetaDetails');
    if(labelEl){
      labelEl.textContent=vm.loading
        ?t('homeLiveLoading')
        :t('voiceModeMetaCurrent').replace('{mode}',vm.modeLabel);
    }
    if(dotEl) dotEl.classList.toggle('is-on',!vm.loading&&vm.mode!=='off');
    if(hintEl) hintEl.textContent=t('voiceModeMetaHint');
    if(linkEl) linkEl.textContent=t('voiceModeMetaDetails');
  }

  function renderSaveAction(vm){
    const saveHabitBtn=$('btnVoiceSaveHabit');
    if(!saveHabitBtn) return;
    saveHabitBtn.hidden=vm.loading||vm.mode==='off';
    saveHabitBtn.disabled=vm.loading||vm.mode==='off';
  }

  global.OneToneVoicePageHeaderRender={
    renderLabels:renderLabels,
    renderStepStatus:renderStepStatus,
    renderHeaderSummary:renderHeaderSummary,
    renderAppScope:renderAppScope,
    renderModeMeta:renderModeMeta,
    renderSaveAction:renderSaveAction
  };
})((typeof window!=='undefined')?window:globalThis);
