(function(global){
  'use strict';
  var state=global.OneToneState.state;
  var $=function(id){ return global.OneToneDom.$(id); };
  var t=function(key){ return global.OneToneI18n.t(key); };
  function hooks(){ return global.__vp_voice_settings_flow_hooks__ || {}; }

  function renderVoiceSettingsFlow(loading){
    loading=!!loading||!hooks().configLoadedFromBackend();
    const eng=hooks().homeVoiceEngineOn();
    const phrase=hooks().homeVoiceWakePhrase();
    const endSnap=hooks().voiceUiSnapshot().end||{};
    const endCfg=(state.config&&state.config.voiceEnd)||(state.config&&state.config.voice_end)||{};
    const enabled=!!endSnap.enabled||!!(endCfg&&endCfg.enabled);
    const autoOn=!!endSnap.autoSendEnabled||!!(endCfg&&endCfg.autoSendEnabled);
    const delayMs=endSnap.commitDelayMs!=null?endSnap.commitDelayMs:(endCfg&&endCfg.commitDelayMs!=null?endCfg.commitDelayMs:4000);
    const commitKey=String(endSnap.commitKey||endCfg.commitKey||endCfg.commit_key||'Enter').trim()||'Enter';
    const detail=((endSnap.phrasesZh||[]).concat(endSnap.phrasesEn||[]).join(' / ')||'');
    const lite=hooks().voiceEndUiUsesLiteMode(false);
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
      else if(eng!=='off') wakeHintEl.textContent=t('homeVoiceMapWakeHintOn');
      else wakeHintEl.textContent=t('homeVoiceMapWakeHintOff');
    }
    if(micNameEl){
      const micDevices=hooks().micDevices();
      const activeMicId=hooks().activeMicId();
      const dev=micDevices.find(function(d){ return d.id===activeMicId; })
        ||micDevices.find(function(d){ return d.isDefault; })
        ||micDevices[0];
      micNameEl.textContent=loading?t('homeLiveLoading'):(dev?(dev.name||dev.id):t('homeVoiceMapMicEmpty'));
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
    if(endWakeEcho){
      endWakeEcho.textContent=loading?'':(phrase?t('voiceSettingsEndWakeEcho').replace('{phrase}',phrase):'');
    }
    if(endPhraseStatus){
      if(loading) endPhraseStatus.textContent=t('homeLiveLoading');
      else if(lite) endPhraseStatus.textContent=t('homeVoiceMapEndLite');
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
  }

  global.OneToneVoiceSettingsFlow={ render:renderVoiceSettingsFlow };
})((typeof window!=='undefined')?window:globalThis);
