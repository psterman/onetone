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
      ['voiceSettingsEndPhraseLbl','voiceSettingsRecognizeLbl'],
      ['voiceSettingsAutoLbl','voiceSettingsOutputLbl'],
      ['voiceColInputLbl','voiceColWake'],
      ['voiceColRecognizeLbl','voiceColRecognize'],
      ['voiceColOutputLbl','voiceColOutput'],
      ['voiceAppScopeLbl','voiceAppScopeLbl'],
      ['voiceRecognizeSourceLbl','voiceRecognizeSourceLbl'],
      ['voiceRecognizeCloudHint','voiceRecognizeCloudHint'],
      ['voiceRecognizePrimaryTag','voiceRecognizeCurrentTag'],
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
      ['voiceWakeHeroTitle','voiceWakeHeroTitle'],
      ['voiceWakeCustomSummary','voiceWakeCustomSummary'],
      ['voiceEditSectionPresets','voiceEditSectionPresets'],
      ['voiceEditSectionEngine','voiceEditSectionEngine'],
      ['voiceEditSectionLangModel','voiceEditSectionLangModel'],
      ['voiceRecognizeResourcesSummary','voiceEditSectionModelRes'],
      ['voiceEditSectionSend','voiceEditSectionSend'],
      ['voiceRecognizeAdvancedSummary','voiceRecognizeAdvancedSummary'],
      ['voiceWakeDisplayHint','voiceWakeDisplayHint']
    ];
    pairs.forEach(function(pair){
      const el=$(pair[0]);
      if(el) el.textContent=t(pair[1]);
    });
    const saveHabitBtn=$('btnVoiceSaveHabit');
    if(saveHabitBtn) saveHabitBtn.textContent=t('voiceStatusSaveHabit');
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
    if(global.OneToneVoiceModelLabels&&global.OneToneVoiceModelLabels.syncPresetButtons){
      global.OneToneVoiceModelLabels.syncPresetButtons();
    }
  }

  function renderStepStatus(){
    /* step status pills removed in v2 */
  }

  function renderModeMeta(){
    /* legacy wake stash meta removed */
  }

  function renderHeaderSummary(vm){
    var V=vmApi();
    var schemeName=$('voiceSummaryName');
    var statusEl=$('voiceSummaryStatus');
    var engineLbl=$('voiceSummaryEngineLbl');
    var engineVal=$('voiceSummaryEngine');
    var scopeLbl=$('voiceSummaryScopeLbl');
    var scopeVal=$('voiceSummaryScope');
    if(engineLbl) engineLbl.textContent=t('voiceSummaryEngineLbl');
    if(scopeLbl) scopeLbl.textContent=t('voiceSummaryScopeLbl');
    if(vm.loading){
      if(schemeName) schemeName.textContent=t('homeLiveLoading');
      if(statusEl){ statusEl.textContent='—'; statusEl.className='keys-scheme-summary-pill voice-scheme-summary-pill'; }
      if(engineVal) engineVal.textContent='—';
      if(scopeVal) scopeVal.textContent='—';
      return;
    }
    var cfg=(global.OneToneState&&global.OneToneState.state&&global.OneToneState.state.config)||{};
    var schemes=global.OneToneVoiceSchemesUi?global.OneToneVoiceSchemesUi.voiceSchemes(cfg):[];
    var selectedId=global.OneToneVoiceSchemesUi?global.OneToneVoiceSchemesUi.editSchemeId(cfg,schemes):'';
    var runtimeActive=global.OneToneVoiceSchemesUi?global.OneToneVoiceSchemesUi.activeRuntimeSchemeId(cfg,schemes):'';
    var mapping=vm.habitMapping;
    if(schemes.length&&selectedId&&selectedId!=='__global__'){
      mapping=schemes.find(function(m){ return m.id===selectedId; })||mapping;
    }
    var displayName;
    if(selectedId==='__global__'){
      displayName=t('voiceSchemeDefaultName').split('·')[0].trim();
    }else if(schemes.length&&mapping){
      displayName=(global.OneToneHabitProfile&&global.OneToneHabitProfile.habitDisplayName)?global.OneToneHabitProfile.habitDisplayName(mapping):(mapping.group||mapping.label||'—');
    }else{
      displayName=vm.habitName&&vm.habitName!=='—'?vm.habitName:t('voiceSchemeDefaultName').split('·')[0].trim();
    }
    if(schemeName) schemeName.textContent=displayName;
    if(statusEl){
      var pillCls='keys-scheme-summary-pill voice-scheme-summary-pill';
      var pillText=vm.voiceOn?t('voiceSummaryStatusOn'):t('voiceSummaryStatusOff');
      if(selectedId&&selectedId!=='__global__'&&runtimeActive&&selectedId===runtimeActive){
        pillText=t('voiceSummaryStatusOn');
        pillCls+=' is-on';
      }else if(vm.voiceOn){
        pillCls+=' is-on';
      }else{
        pillCls+=' is-off';
      }
      statusEl.textContent=pillText;
      statusEl.className=pillCls;
    }
    if(engineVal) engineVal.textContent=vm.modeLabel||'—';
    if(scopeVal&&V) scopeVal.textContent=V.resolveScopeSummary(Object.assign({},vm,{habitMapping:mapping}));
    var enabledToggle=$('btnVoiceEnabled');
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

  function resolveScopeMapping(vm){
    if(vm.habitMapping) return vm.habitMapping;
    var core=global.OneToneMappingCore;
    var cfg=global.OneToneState&&global.OneToneState.state?global.OneToneState.state.config:{};
    var activeId=cfg&&cfg.activeSceneId?String(cfg.activeSceneId).trim():'';
    if(core&&core.byId&&activeId) return core.byId(activeId)||null;
    return null;
  }

  function renderAppScope(vm){
    var V=vmApi();
    const strip=$('voiceAppScopeStrip');
    const chips=$('voiceAppScopeChips');
    const appRules=global.OneToneAppBehaviorRules;
    if(!strip||!chips||!appRules) return;
    const m=resolveScopeMapping(vm);
    strip.hidden=false;
    if(appRules.renderContextChipsHtml){
      chips.innerHTML=appRules.renderContextChipsHtml(m,{
        chipAttr:'data-voice-scope-app',
        noneAttr:'data-voice-scope-none',
        includeNone:true
      });
      if(appRules.scheduleHydrateCustomRuleIcons) appRules.scheduleHydrateCustomRuleIcons();
      return;
    }
    const presets=appRules.behaviorPresets||[];
    const primaryId=m?String(m.appTargetId||'').trim():'';
    const noneSelected=!primaryId;
    var html='<button type="button" class="keys-app-chip keys-app-chip--none'+(noneSelected?' is-selected':'')+'" data-voice-scope-none="1" role="radio" aria-checked="'+(noneSelected?'true':'false')+'" title="'+V.escHtml(t('keysAppChipNoneHint'))+'"><span>'+V.escHtml(t('keysAppChipNone'))+'</span></button>';
    presets.forEach(function(p){
      const icon=presetIcon(p.id);
      const isPri=primaryId===p.id;
      const name=appRules.appDisplayName(p.id);
      html+='<button type="button" class="keys-app-chip'+(isPri?' is-selected is-primary':'')+'" data-voice-scope-app="'+V.escHtml(p.id)+'" role="radio" aria-checked="'+(isPri?'true':'false')+'" title="'+V.escHtml(name)+'">';
      if(icon) html+='<img class="keys-app-chip-icon" src="'+V.escHtml(icon)+'" alt="" decoding="async" />';
      html+='<span>'+V.escHtml(name)+'</span></button>';
    });
    chips.innerHTML=html;
  }

  function renderSaveAction(vm){
    const saveHabitBtn=$('btnVoiceSaveHabit');
    if(!saveHabitBtn) return;
    saveHabitBtn.hidden=vm.loading||vm.mode==='off';
    saveHabitBtn.disabled=vm.loading||vm.mode==='off';
    var persist=global.OneToneVoiceSchemePersist;
    var isUpdate=!!(persist&&persist.resolveVoiceEditMapping&&persist.resolveVoiceEditMapping());
    saveHabitBtn.textContent=t(isUpdate?'voiceSchemeSaveUpdate':'voiceStatusSaveHabit');
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
