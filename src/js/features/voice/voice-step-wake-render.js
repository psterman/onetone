(function(global){
  'use strict';
  var $=function(id){ return global.OneToneDom.$(id); };
  var t=function(key){ return global.OneToneI18n.t(key); };

  function V(){ return global.OneToneVoiceSettingsViewModel; }

  function renderWakeHost(vm){
    const sapiPresets=$('voiceSapiPresets');
    const voskWrap=$('voiceSettingsVoskWakeWrap');
    var hideLite=global.OneToneVoiceEngineReadiness&&global.OneToneVoiceEngineReadiness.isVoskOnlyUi();
    if(sapiPresets) sapiPresets.hidden=hideLite||vm.loading||vm.mode!=='sapi';
    if(voskWrap) voskWrap.hidden=vm.loading||vm.mode!=='vosk';
  }

  function renderMicLine(vm){
    var micName=vm.wakeSourceLabel||t('homeVoiceMapMicEmpty');
    var micOk=!vm.loading&&!!vm.wakeSourceLabel&&vm.wakeSourceLabel!==t('homeVoiceMapMicEmpty');
    var nameEl=$('voiceMicStatusName');
    var stateEl=$('voiceMicStatusState');
    var dot=$('voiceMicStatusDot');
    var legacyName=$('voiceSettingsMicName');
    if(nameEl) nameEl.textContent=micName;
    if(legacyName) legacyName.textContent=micName;
    if(stateEl) stateEl.textContent=vm.loading?t('homeLiveLoading'):(micOk?t('voiceMicStatusOk'):t('voiceTestChipMicWarn'));
    if(dot) dot.classList.toggle('is-warn',!vm.loading&&!micOk);
  }

  function renderCompactWake(vm){
    const presetMore=$('voiceWakePresetMore');
    const zhEl=$('voiceWakeCompactZh');
    const enEl=$('voiceWakeCompactEn');
    if(presetMore) presetMore.hidden=vm.loading||vm.mode==='off';
    if(vm.loading){
      if(zhEl) zhEl.textContent=t('homeLiveLoading');
      if(enEl) enEl.textContent='';
      renderMicLine(vm);
      return;
    }
    var phrase=V().resolveDisplayWakePhrase(vm);
    if(zhEl) zhEl.textContent=phrase.zh||'—';
    if(enEl) enEl.textContent=phrase.en||'';
    const langToggle=$('voiceWakeLangToggle');
    if(langToggle){
      const hasBoth=vm.mode==='vosk'&&!!phrase.en;
      langToggle.hidden=!hasBoth;
      langToggle.querySelectorAll('.flow-lang-btn').forEach(function(b){
        b.classList.toggle('is-on',(b.getAttribute('data-lang')||'')===phrase.lang);
      });
      if(hasBoth&&zhEl&&enEl){
        const showEn=phrase.lang==='en';
        zhEl.hidden=showEn;
        enEl.hidden=!showEn;
      }else if(zhEl){
        zhEl.hidden=false;
        if(enEl) enEl.hidden=!phrase.en;
      }
    }
    renderMicLine(vm);
    renderWakeHost(vm);
  }

  function renderCustomPhrases(vm){
    if(global.OneToneVoiceWake&&global.OneToneVoiceWake.renderWakeCustomPhrases){
      global.OneToneVoiceWake.renderWakeCustomPhrases();
    }
    const wakeBlock=$('voiceWakeCustomBlock');
    if(wakeBlock) wakeBlock.hidden=vm.loading||vm.mode==='off';
  }

  global.OneToneVoiceStepWake={
    render:function(vm){
      renderCompactWake(vm);
      renderCustomPhrases(vm);
    }
  };
})((typeof window!=='undefined')?window:globalThis);
