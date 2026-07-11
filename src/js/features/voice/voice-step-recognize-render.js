(function(global){
  'use strict';
  var state=global.OneToneState.state;
  var $=function(id){ return global.OneToneDom.$(id); };
  var t=function(key){ return global.OneToneI18n.t(key); };

  function hooks(){ return global.__vp_voice_settings_flow_hooks__||{}; }
  function V(){ return global.OneToneVoiceSettingsViewModel; }

  function setRecognizeNavState(targetId){
    const endDetails=$('voiceRecognizeEndDetails');
    const engineDetails=$('voiceRecognizeEngineDetails');
    if(targetId==='voiceAdvancedSection'&&engineDetails) engineDetails.open=true;
    else if(targetId==='voiceEndRulesSection'&&endDetails) endDetails.open=true;
    else if(targetId==='voiceRecognizeResources'||targetId==='voiceRecognizeResourcesDetails'){
      const resDetails=$('voiceRecognizeResourcesDetails');
      if(resDetails) resDetails.open=true;
    }
  }

  function renderCompactEnd(vm){
    const compact=$('voiceEndCompact');
    const presetMore=$('voiceEndPresetMore');
    const zhEl=$('voiceEndCompactZh');
    const enEl=$('voiceEndCompactEn');
    const show=!vm.loading&&vm.mode==='vosk';
    if(compact) compact.hidden=!show;
    if(presetMore) presetMore.hidden=!show;
    if(!show) return;
    const zh=V().firstSelectedPhrase('#voiceEndPresetsZh');
    const en=V().firstSelectedPhrase('#voiceEndPresetsEn');
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

  function renderModelPresetRow(vm){
    const row=$('voiceRecognizeModelRow');
    if(row) row.hidden=vm.loading||vm.mode!=='vosk';
  }

  function renderRecognizePanel(vm){
    const sourceGrid=$('voiceRecognizeSourceGrid');
    const endRulesSummary=$('voiceEndRulesSummary');
    const endDetails=$('voiceRecognizeEndDetails');
    const engineDetails=$('voiceRecognizeEngineDetails');
    const voskOnly=global.OneToneVoiceEngineReadiness&&global.OneToneVoiceEngineReadiness.isVoskOnlyUi();
    var summaryText=V().resolveEndRuleSummary(vm);
    if(endRulesSummary) endRulesSummary.textContent=summaryText;
    if(sourceGrid){
      sourceGrid.querySelectorAll('[data-voice-engine-tab]').forEach(function(btn){
        const tab=btn.getAttribute('data-voice-engine-tab')||'';
        const active=!vm.loading&&vm.mode===tab;
        btn.classList.toggle('is-active',active);
        if(tab==='sapi') btn.hidden=!!voskOnly;
      });
    }
    if(engineDetails&&engineDetails.open) setRecognizeNavState('voiceAdvancedSection');
    else if(endDetails&&endDetails.open) setRecognizeNavState('voiceEndRulesSection');
  }

  function renderStepPanels(vm){
    const liteEl=$('voiceEndDetectLite');
    const voskEl=$('voiceEndPresetsWrap');
    const liteBody=$('voiceEndDetectLiteBody');
    const switchBtn=$('btnVoiceEndDetectSwitchVosk');
    const silenceNote=$('voiceEndSilenceNote');
    const habitNote=$('voiceSendHabitNote');
    const autoDesc=$('voiceSettingsAutoSendDesc');
    const endSnap=hooks().voiceUiSnapshot().end||{};
    const endCfg=(state.config&&state.config.voiceEnd)||(state.config&&state.config.voice_end)||{};
    const zh=Array.isArray(endSnap.phrasesZh)?endSnap.phrasesZh:(endCfg.phrasesZh||[]);
    const en=Array.isArray(endSnap.phrasesEn)?endSnap.phrasesEn:(endCfg.phrasesEn||[]);
    var hideLite=global.OneToneVoiceEngineReadiness&&global.OneToneVoiceEngineReadiness.isVoskOnlyUi();
    if(liteEl) liteEl.hidden=hideLite||vm.loading||vm.mode!=='sapi';
    if(voskEl) voskEl.hidden=vm.loading||vm.mode!=='vosk';
    if(liteBody) liteBody.textContent=t('voiceEndDetectLiteBody');
    if(switchBtn) switchBtn.textContent=t('voiceEndDetectSwitchVosk');
    if(silenceNote) silenceNote.textContent=t('voiceEndSilenceNote');
    if(!vm.loading&&vm.mode==='vosk'&&global.OneToneVoiceEnd){
      const sync=global.OneToneVoiceEnd.syncPresets;
      if(typeof sync==='function') sync(zh,en);
    }
    if(autoDesc){
      const delaySec=(vm.autoSendDelayMs/1000).toFixed(1);
      const key=V().resolveOutputModeKey(vm);
      const liteMode=vm.mode==='sapi'||vm.mode==='off';
      autoDesc.textContent=vm.autoSendEnabled
        ?t('voiceSettingsAutoSendDesc')
          .replace('{n}',delaySec)
          .replace('{key}',vm.autoSendKey)
        :'';
      autoDesc.hidden=vm.loading||liteMode||key!=='auto'||!vm.autoSendEnabled;
    }
    if(habitNote){
      const outputKey=V().resolveOutputModeKey(vm);
      habitNote.innerHTML=t('voiceSendHabitOverrideNote')+' <button type="button" class="voice-finish-habit-link" id="btnVoiceSendHabitLink">'+V().escHtml(t('voiceSendHabitLink'))+'</button>';
      habitNote.hidden=vm.loading||!vm.autoSendEnabled||!vm.habitHasKeyAutoSend||outputKey!=='auto';
    }
  }

  function renderCapabilityNote(vm){
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
    if(vm.mode==='sapi') note.textContent=t('voiceEngineCapabilityNoteLite');
    else if(vm.mode==='vosk') note.textContent=t('voiceEngineCapabilityNotePro');
    else note.textContent=t('voiceEngineCapabilityNoteOff');
  }

  function renderEndCustomPhrases(vm){
    if(global.OneToneVoiceEnd&&global.OneToneVoiceEnd.renderEndCustomPhrases){
      global.OneToneVoiceEnd.renderEndCustomPhrases();
    }
    const endBlock=$('voiceEndCustomBlock');
    if(endBlock) endBlock.hidden=vm.loading||vm.mode!=='vosk';
  }

  function renderOutputModeSegments(vm){
    var modeSeg=$('voiceOutputModeSegments');
    if(!modeSeg) return;
    var key=V().resolveOutputModeKey(vm);
    var liteMode=vm.mode==='sapi'||vm.mode==='off';
    modeSeg.querySelectorAll('.keys-trigger-mode-seg').forEach(function(btn){
      var segKey=btn.getAttribute('data-voice-output-mode')||'';
      btn.classList.toggle('is-active',segKey===key);
      btn.disabled=vm.loading||(liteMode&&segKey!=='manual');
    });
  }

  global.OneToneVoiceStepRecognize={
    render:function(vm){
      renderRecognizePanel(vm);
    renderModelPresetRow(vm);
      renderStepPanels(vm);
      renderCompactEnd(vm);
      renderCapabilityNote(vm);
      renderEndCustomPhrases(vm);
      renderOutputModeSegments(vm);
    },
    setRecognizeNavState:setRecognizeNavState
  };
})((typeof window!=='undefined')?window:globalThis);
