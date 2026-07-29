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

  function syncPhraseKindTabs(rootId,kind){
    if(global.OneToneVoiceStepSend&&global.OneToneVoiceStepSend.syncPhraseKindTabs){
      global.OneToneVoiceStepSend.syncPhraseKindTabs(rootId,kind);
      return;
    }
    var root=$(rootId);
    if(!root) return;
    kind=kind==='sound'?'sound':'text';
    root.querySelectorAll('[data-phrase-kind]').forEach(function(btn){
      var on=(btn.getAttribute('data-phrase-kind')||'')===kind;
      btn.classList.toggle('is-on',on);
      btn.setAttribute('aria-selected',on?'true':'false');
    });
    var panel=root.closest('.voice-phrase-panel')||root.parentElement;
    if(!panel) return;
    panel.querySelectorAll('[data-phrase-kind-pane]').forEach(function(pane){
      pane.hidden=(pane.getAttribute('data-phrase-kind-pane')||'')!==kind;
    });
  }

  function syncEndPresetLangVisibility(){
    const lang=global.__vp_voice_end_lang__||'zh';
    const langToggle=$('voiceEndLangToggle');
    const soundKind=(global.__vp_voice_end_kind__||'text')==='sound';
    if(langToggle){
      langToggle.hidden=soundKind;
      langToggle.querySelectorAll('.flow-lang-btn').forEach(function(b){
        b.classList.toggle('is-on',(b.getAttribute('data-lang')||'')===lang);
      });
    }
    if(global.OneToneVoiceEnd&&global.OneToneVoiceEnd.renderEndPhraseTags){
      global.OneToneVoiceEnd.renderEndPhraseTags();
    }
  }

  function syncCancelLangVisibility(){
    const lang=global.__vp_voice_cancel_lang__||'zh';
    const langToggle=$('voiceCancelLangToggle');
    const soundKind=(global.__vp_voice_cancel_kind__||'text')==='sound';
    if(langToggle){
      langToggle.hidden=soundKind;
      langToggle.querySelectorAll('.flow-lang-btn').forEach(function(b){
        b.classList.toggle('is-on',(b.getAttribute('data-lang')||'')===lang);
      });
    }
    if(global.OneToneVoiceEnd&&global.OneToneVoiceEnd.renderCancelPhraseTags){
      global.OneToneVoiceEnd.renderCancelPhraseTags();
    }
  }

  function renderCompactEnd(vm){
    const compact=$('voiceEndCompact');
    if(compact) compact.hidden=true;
    syncEndPresetLangVisibility();
    syncCancelLangVisibility();
  }

  function renderModelPresetRow(vm){
    const row=$('voiceRecognizeModelRow');
    if(row) row.hidden=vm.loading||vm.mode!=='vosk';
  }

  function resolveRecognizeTabMode(vm){
    if(global.OneToneVoiceWake&&global.OneToneVoiceWake.isModeSwitchPending&&global.OneToneVoiceWake.isModeSwitchPending()){
      var pending=global.OneToneVoiceWake.getExpandedMode();
      if(pending==='kws'||pending==='vosk'||pending==='sapi') return pending;
    }
    if(global.OneToneVoiceWake&&global.OneToneVoiceWake.resolveActiveTabMode){
      return global.OneToneVoiceWake.resolveActiveTabMode();
    }
    return vm.mode;
  }

  function resolveRecognizePanelMode(vm){
    if(global.OneToneVoiceWake&&global.OneToneVoiceWake.getExpandedMode){
      var expanded=global.OneToneVoiceWake.getExpandedMode();
      if(expanded==='kws'||expanded==='vosk'||expanded==='sapi') return expanded;
    }
    return resolveRecognizeTabMode(vm);
  }

  function renderRecognizePanel(vm){
    const sourceGrid=$('voiceRecognizeSourceGrid');
    const endRulesSummary=$('voiceEndRulesSummary');
    const voskOnly=global.OneToneVoiceEngineReadiness&&global.OneToneVoiceEngineReadiness.isVoskOnlyUi();
    const tabMode=resolveRecognizeTabMode(vm);
    var summaryText=V().resolveEndRuleSummary(vm);
    if(endRulesSummary) endRulesSummary.textContent=summaryText;
    if(sourceGrid){
      if(global.OneToneVoiceWake&&global.OneToneVoiceWake.syncEngineTabButtons){
        global.OneToneVoiceWake.syncEngineTabButtons(tabMode,!!vm.loading);
      }else{
        sourceGrid.querySelectorAll('[data-voice-engine-tab]').forEach(function(btn){
          const tab=btn.getAttribute('data-voice-engine-tab')||'';
          const active=!vm.loading&&tabMode===tab;
          btn.classList.toggle('is-active',active);
          btn.disabled=!!(global.OneToneVoiceWake&&global.OneToneVoiceWake.isModeSwitchPending&&global.OneToneVoiceWake.isModeSwitchPending());
          if(tab==='sapi') btn.hidden=!!voskOnly;
          else btn.hidden=false;
        });
      }
    }
    var ruleBar=$('voiceRecognizeRuleBar');
    if(ruleBar) ruleBar.textContent=t('voiceRecognizeRuleBar');
  }

  function syncRecognizeIntentTabs(intent){
    intent=intent==='confirm'?'confirm':'cancel';
    global.__vp_voice_recognize_intent__=intent;
    var tabs=$('voiceRecognizeIntentTabs');
    if(tabs){
      tabs.querySelectorAll('[data-recognize-intent]').forEach(function(btn){
        var on=(btn.getAttribute('data-recognize-intent')||'')===intent;
        btn.classList.toggle('is-on',on);
        btn.setAttribute('aria-selected',on?'true':'false');
      });
    }
    var wrap=$('voiceEndPresetsWrap');
    if(!wrap) return;
    wrap.querySelectorAll('[data-recognize-intent-pane]').forEach(function(pane){
      var show=(pane.getAttribute('data-recognize-intent-pane')||'')===intent;
      pane.hidden=!show;
      pane.setAttribute('aria-hidden',show?'false':'true');
    });
  }

  function renderStepPanels(vm){
    const tabMode=resolveRecognizePanelMode(vm);
    const liteEl=$('voiceEndDetectLite');
    const voskEl=$('voiceEndPresetsWrap');
    const liteBody=$('voiceEndDetectLiteBody');
    const switchBtn=$('btnVoiceEndDetectSwitchVosk');
    const silenceNote=$('voiceEndSilenceNote');
    const intentTabs=$('voiceRecognizeIntentTabs');
    const habitNote=$('voiceSendHabitNote');
    const autoDesc=$('voiceSettingsAutoSendDesc');
    const endSnap=hooks().voiceUiSnapshot().end||{};
    const endCfg=(state.config&&state.config.voiceEnd)||(state.config&&state.config.voice_end)||{};
    const zh=Array.isArray(endSnap.phrasesZh)?endSnap.phrasesZh:(endCfg.phrasesZh||[]);
    const en=Array.isArray(endSnap.phrasesEn)?endSnap.phrasesEn:(endCfg.phrasesEn||[]);
    const cancelZh=Array.isArray(endSnap.cancelPhrasesZh)?endSnap.cancelPhrasesZh:(endCfg.cancelPhrasesZh||endCfg.cancel_phrases_zh||[]);
    const cancelEn=Array.isArray(endSnap.cancelPhrasesEn)?endSnap.cancelPhrasesEn:(endCfg.cancelPhrasesEn||endCfg.cancel_phrases_en||[]);
    var hideLite=global.OneToneVoiceEngineReadiness&&global.OneToneVoiceEngineReadiness.isVoskOnlyUi();
    var phraseEditable=!vm.loading&&(tabMode==='vosk'||tabMode==='kws');
    var showLite= !hideLite&&!vm.loading&&tabMode==='sapi';
    if(liteEl) liteEl.hidden=!showLite;
    // Always keep cancel/confirm tabs visible so the page structure is obvious on first entry.
    if(intentTabs) intentTabs.hidden=!!vm.loading;
    // Phrase panels stay available to browse; lite mode just dims/locks editing.
    if(voskEl){
      voskEl.hidden=!!vm.loading||tabMode==='off';
      voskEl.classList.toggle('is-lite-locked',showLite);
      voskEl.setAttribute('aria-disabled',showLite?'true':'false');
    }
    if(liteBody) liteBody.textContent=t('voiceEndDetectLiteBody');
    if(switchBtn) switchBtn.textContent=t('voiceEndDetectSwitchVosk');
    if(silenceNote) silenceNote.textContent=t('voiceEndStopOnlyNote');
    syncRecognizeIntentTabs(global.__vp_voice_recognize_intent__||'cancel');
    if(phraseEditable&&global.OneToneVoiceEnd){
      if(typeof global.OneToneVoiceEnd.syncPresets==='function') global.OneToneVoiceEnd.syncPresets(zh,en);
      if(typeof global.OneToneVoiceEnd.syncCancelPresets==='function') global.OneToneVoiceEnd.syncCancelPresets(cancelZh,cancelEn);
    }
    if(autoDesc){
      const delaySec=(vm.autoSendDelayMs/1000).toFixed(1);
      const key=V().resolveOutputModeKey(vm);
      const liteMode=tabMode==='sapi'||tabMode==='off';
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
    syncPhraseKindTabs('voiceEndKindTabs',global.__vp_voice_end_kind__||'text');
    syncPhraseKindTabs('voiceCancelKindTabs',global.__vp_voice_cancel_kind__||'text');
    syncControlAcousticKinds();
  }

  function syncControlAcousticKinds(){
    function paint(role,kind){
      if(kind!=='sound') return;
      var api=global.OneToneVoiceControlAcoustic;
      if(!api) return;
      if(api.isCalibrating&&api.isCalibrating()){
        // Avoid recreating the name field while the user is typing a sample label.
        if(api.bindEvents) api.bindEvents(role);
        return;
      }
      if(api.bindEvents) api.bindEvents(role);
      if(api.render) api.render(role);
    }
    paint('cancel',global.__vp_voice_cancel_kind__||'text');
    paint('end',global.__vp_voice_end_kind__||'text');
  }

  function renderCapabilityNote(vm){
    const note=$('voiceEngineCapabilityNote');
    const tabMode=resolveRecognizeTabMode(vm);
    if(!note) return;
    if(vm.loading||tabMode==='off'){
      note.hidden=true;
      note.textContent='';
      return;
    }
    note.hidden=false;
    if(tabMode==='sapi') note.textContent=t('voiceEngineCapabilityNoteLite');
    else if(tabMode==='kws') note.textContent=t('voiceEngineCapabilityNoteKws');
    else note.textContent=t('voiceEngineCapabilityNotePro');
  }

  function renderEndCustomPhrases(vm){
    const tabMode=resolveRecognizeTabMode(vm);
    if(global.OneToneVoiceEnd&&global.OneToneVoiceEnd.renderEndCustomPhrases){
      global.OneToneVoiceEnd.renderEndCustomPhrases();
    }
    if(global.OneToneVoiceEnd&&global.OneToneVoiceEnd.renderCancelCustomPhrases){
      global.OneToneVoiceEnd.renderCancelCustomPhrases();
    }
    const endBlock=$('voiceEndCustomBlock');
    const cancelBlock=$('voiceCancelCustomBlock');
    const show= !vm.loading&&(tabMode==='vosk'||tabMode==='kws');
    if(endBlock) endBlock.hidden=!show;
    if(cancelBlock) cancelBlock.hidden=!show;
  }

  function renderRecognizePage(vm){
    renderRecognizePanel(vm);
    renderModelPresetRow(vm);
    renderStepPanels(vm);
    renderCompactEnd(vm);
    renderCapabilityNote(vm);
    renderEndCustomPhrases(vm);
    var title=$('voiceRecognizePageTitle');
    var sub=$('voiceRecognizePageSub');
    if(title) title.textContent=t('voiceRecognizePageTitle');
    if(sub) sub.textContent=t('voiceRecognizePageSub');
    var cancelTab=$('btnVoiceRecognizeIntentCancel');
    var confirmTab=$('btnVoiceRecognizeIntentConfirm');
    if(cancelTab) cancelTab.textContent=t('voiceRecognizeIntentCancel');
    if(confirmTab) confirmTab.textContent=t('voiceRecognizeIntentConfirm');
    if(global.OneToneAppThemePrefs&&global.OneToneAppThemePrefs.syncRecordingAudioUi){
      global.OneToneAppThemePrefs.syncRecordingAudioUi();
    }
    // P6 守卫：语音配置岛挂载后，隐藏 legacy 文本短语编辑器（保留声音录制子页），避免重复控件。岛未挂载则原样保留。
    if(window.OneToneIslands&&window.OneToneIslands.isMounted&&window.OneToneIslands.isMounted('voiceConfig')){
      ['voiceCancelKindTextPane','voiceCancelCustomBlock','voiceEndKindTextPane','voiceEndCustomBlock'].forEach(function(id){
        var el=$(id); if(el) el.hidden=true;
      });
    }
  }

  global.OneToneVoiceStepRecognize={
    render:renderRecognizePage,
    renderRecognizePage:renderRecognizePage,
    setRecognizeNavState:setRecognizeNavState,
    syncEndPresetLangVisibility:syncEndPresetLangVisibility,
    syncCancelLangVisibility:syncCancelLangVisibility,
    syncRecognizeIntentTabs:syncRecognizeIntentTabs,
    syncControlAcousticKinds:syncControlAcousticKinds
  };
})((typeof window!=='undefined')?window:globalThis);
