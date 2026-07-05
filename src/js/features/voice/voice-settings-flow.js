(function(global){
  'use strict';
  var state=global.OneToneState.state;
  var $=function(id){ return global.OneToneDom.$(id); };
  var t=function(key){ return global.OneToneI18n.t(key); };
  function hooks(){ return global.__vp_voice_settings_flow_hooks__ || {}; }

  function renderVoiceSettingsFlow(loading){
    const uiState=global.OneToneState.ui;
    if(!uiState.drawerOpen||uiState.settingsPanel!=='voiceWake') return;
    loading=!!loading||!hooks().configLoadedFromBackend();
    const summary=global.OneToneVoiceHomeSummary
      ?global.OneToneVoiceHomeSummary.compute()
      :null;
    const eng=summary?summary.engine:hooks().homeVoiceEngineOn();
    const phrase=summary?summary.wakePhrase:hooks().homeVoiceWakePhrase();
    const endSnap=hooks().voiceUiSnapshot().end||{};
    const endCfg=(state.config&&state.config.voiceEnd)||(state.config&&state.config.voice_end)||{};
    const enabled=!!endSnap.enabled||!!(endCfg&&endCfg.enabled);
    const autoOn=!!endSnap.autoSendEnabled||!!(endCfg&&endCfg.autoSendEnabled);
    const delayMs=endSnap.commitDelayMs!=null?endSnap.commitDelayMs:(endCfg&&endCfg.commitDelayMs!=null?endCfg.commitDelayMs:4000);
    const commitKey=String(endSnap.commitKey||endCfg.commitKey||endCfg.commit_key||'Enter').trim()||'Enter';
    const detail=((endSnap.phrasesZh||[]).concat(endSnap.phrasesEn||[]).join(' / ')||'');
    const lite=hooks().voiceEndUiUsesLiteMode();
    const wakePhraseEl=$('voiceSettingsWakePhrase');
    const wakeHintEl=$('voiceSettingsWakeHint');
    const micNameEl=$('voiceSettingsMicName');
    const engineStatusEl=$('voiceSettingsEngineStatus');
    const endWakeEcho=$('voiceSettingsEndWakeEcho');
    const endPhraseStatus=$('voiceSettingsEndPhraseStatus');
    const endPhraseHint=$('voiceSettingsEndPhraseHint');
    const autoStatusEl=$('voiceSettingsAutoStatus');
    if(wakePhraseEl) wakePhraseEl.textContent=loading?t('homeLiveLoading'):(phrase||t('homeLiveUnset'));
    if(wakeHintEl){
      if(loading) wakeHintEl.textContent='';
      else if(summary&&summary.voiceOn) wakeHintEl.textContent=summary.statusLine||t('homeVoiceMapWakeHintOn');
      else if(eng!=='off') wakeHintEl.textContent=t('homeVoiceMapWakeHintOn');
      else wakeHintEl.textContent=t('homeVoiceSimpleStatusOff');
    }
    if(micNameEl){
      micNameEl.textContent=loading?t('homeLiveLoading'):(summary?summary.micLabel:(function(){
        const micDevices=hooks().micDevices();
        const activeMicId=hooks().activeMicId();
        const dev=micDevices.find(function(d){ return d.id===activeMicId; })
          ||micDevices.find(function(d){ return d.isDefault; })
          ||micDevices[0];
        return dev?(dev.name||dev.id):t('homeVoiceMapMicEmpty');
      })());
    }
    const barsEl=$('voiceSettingsMicBars');
    if(barsEl&&!barsEl.children.length) barsEl.innerHTML=hooks().buildMicLevelBars();
    const sapiBtn=$('btnVoiceSettingsModeSapi');
    const voskBtn=$('btnVoiceSettingsModeVosk');
    if(sapiBtn){
      sapiBtn.classList.toggle('is-active',eng!=='vosk');
      sapiBtn.disabled=!!global.OneToneVoiceWake.isModeSwitchPending();
    }
    if(voskBtn){
      voskBtn.classList.toggle('is-active',eng==='vosk');
      voskBtn.disabled=!!global.OneToneVoiceWake.isModeSwitchPending();
    }
    if(engineStatusEl){
      if(loading) engineStatusEl.textContent=t('homeLiveLoading');
      else if(eng==='sapi') engineStatusEl.textContent=t('voiceModeCurrentLite');
      else if(eng==='vosk') engineStatusEl.textContent=t('voiceModeCurrentPro');
      else engineStatusEl.textContent=t('voiceModeCurrentOff');
    }
    var sapiSensCard=$('voiceSettingsSapiSensCard');
    if(sapiSensCard) sapiSensCard.hidden=loading||eng==='vosk';
    if(!loading&&eng!=='vosk'&&global.OneToneVoiceWake&&global.OneToneVoiceWake.syncSapiSensUi){
      const cfg=(state.config&&state.config.voiceSapi)||(state.config&&state.config.voice_sapi)||{};
      global.OneToneVoiceWake.syncSapiSensUi(cfg.minConfidence==null?0.35:cfg.minConfidence);
    }
    if(endWakeEcho){
      endWakeEcho.textContent=loading?'':(phrase?t('voiceSettingsEndWakeEcho').replace('{phrase}',phrase):'');
    }
    if(endPhraseStatus){
      if(loading) endPhraseStatus.textContent=t('homeLiveLoading');
      else if(lite) endPhraseStatus.textContent=t('homeVoiceMapEndLite');
      else if(summary&&summary.dictating&&summary.endLine) endPhraseStatus.textContent=summary.endLine;
      else endPhraseStatus.textContent=enabled
        ?(t('voiceEndEnabledShort')+(detail?(' · '+detail):''))
        :t('voiceEndDisabledShort');
    }
    if(endPhraseHint) endPhraseHint.textContent='';
    if(autoStatusEl){
      if(loading) autoStatusEl.textContent=t('homeLiveLoading');
      else autoStatusEl.textContent=autoOn
        ?(t('voiceEndAutoSendOn')+' · '+t('voiceEndDelayMs').replace('{n}',String(delayMs))+' · '+commitKey)
        :t('voiceEndAutoSendOff');
    }
    hooks().syncVoiceEndCommitKeyUi(commitKey);
    hooks().syncVoiceEndDelayRanges(delayMs);
    var voiceTargetEl=$('voiceSettingsTargetKey');
    if(voiceTargetEl){
      const cfg=(state.config&&state.config.voiceSapi)||(state.config&&state.config.voice_sapi)||{};
      const vosk=(state.config&&state.config.voiceVosk)||(state.config&&state.config.voice_vosk)||{};
      const key=String(cfg.targetKey||vosk.targetKey||'RAlt').trim()||'RAlt';
      voiceTargetEl.textContent=loading?t('homeLiveLoading'):(global.OneToneKeyLabels?global.OneToneKeyLabels.friendlyKeyName(key,global.OneToneI18n.getLang()):key);
    }
    if(global.OneToneImePresets) global.OneToneImePresets.refresh('voice');
    var sceneNoteEl=$('voiceActiveSceneNote');
    if(sceneNoteEl){
      if(loading){
        sceneNoteEl.hidden=true;
      }else{
        var activeId=state.config&&state.config.activeSceneId;
        var mapping=activeId&&state.config&&Array.isArray(state.config.mappings)
          ?state.config.mappings.find(function(m){return m.id===activeId;}):null;
        var sceneLabel=mapping?(mapping.label||mapping.triggerKey||activeId):'—';
        sceneNoteEl.textContent=t('voiceActiveSceneNote').replace('{scene}',sceneLabel);
        sceneNoteEl.hidden=false;
      }
    }
  }

  global.OneToneVoiceSettingsFlow={ render:renderVoiceSettingsFlow };
})((typeof window!=='undefined')?window:globalThis);
