(function(global){
  'use strict';
  var $=function(id){ return global.OneToneDom.$(id); };
  var t=function(key){ return global.OneToneI18n.t(key); };

  function V(){ return global.OneToneVoiceSettingsViewModel; }

  function syncPhraseKindTabs(rootId,kind){
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
      var show=(pane.getAttribute('data-phrase-kind-pane')||'')===kind;
      pane.hidden=!show;
      pane.setAttribute('aria-hidden',show?'false':'true');
      if(show) pane.style.removeProperty('display');
      else pane.style.display='none';
    });
  }

  function forceTextPhraseKinds(){
    global.__vp_voice_send_kind__='text';
    syncPhraseKindTabs('voiceSendKindTabs','text');
  }

  function syncDelayLabel(key){
    var delayLbl=$('voiceSettingsDelayLbl');
    if(!delayLbl) return;
    if(key==='phrase') delayLbl.textContent=t('voiceSendDelayAfterSendLbl');
    else delayLbl.textContent=t('voiceSendDelayAutoLbl');
  }

  function setSectionLock(el,locked,reason){
    if(!el) return;
    el.classList.toggle('is-section-locked',!!locked);
    if(locked&&reason) el.setAttribute('data-lock-reason',reason);
    else el.removeAttribute('data-lock-reason');
  }

  function renderOutputPanel(vm){
    const hint=$('voiceOutputHint');
    const params=$('voiceOutputParams');
    const delayRow=$('voiceOutputDelayRow');
    const guard=$('voiceOutputAutoGuard');
    const sendPanel=$('voiceSendPhrasePanel');
    const paramsBar=$('voiceSendParamsAside');
    const confirmHint=$('voiceSendConfirmHint');
    const moreCue=$('voiceSendMoreCue');
    const liteNotice=$('voiceSendLiteNotice');
    const liteNoticeText=$('voiceSendLiteNoticeText');
    const modePanel=$('voiceSendModePanel');
    const key=V().resolveOutputModeKey(vm);
    const liteMode=vm.mode==='sapi'||vm.mode==='off';
    const sendPhrasesActive=!vm.loading&&!liteMode&&key!=='confirm';
    const delayActive=!vm.loading&&!liteMode&&(key==='auto'||key==='phrase');
    const showMoreCue=!vm.loading&&(liteMode||key==='confirm');

    if(modePanel) modePanel.hidden=!!vm.loading;
    if(hint){
      if(vm.loading) hint.textContent=t('homeLiveLoading');
      else if(key==='auto') hint.textContent=t('voiceOutputHintAuto');
      else if(key==='phrase') hint.textContent=t('voiceOutputHintPhrase');
      else hint.textContent=t('voiceOutputHintConfirm');
    }
    if(moreCue){
      moreCue.hidden=!showMoreCue;
      if(!moreCue.hidden) moreCue.textContent=t('voiceSendMoreCue');
    }
    if(liteNotice){
      liteNotice.hidden=vm.loading||!liteMode;
      if(liteNoticeText) liteNoticeText.textContent=t('voiceSendLiteNotice');
    }
    if(guard){
      guard.hidden=vm.loading||key!=='auto'||liteMode;
      guard.textContent=t('voiceOutputAutoGuard');
    }
    if(confirmHint){
      confirmHint.hidden=vm.loading||liteMode||key!=='confirm';
      if(!confirmHint.hidden) confirmHint.textContent=t('voiceSendConfirmHint');
    }

    // Always show send phrases + params; lock/dim when inactive.
    if(sendPanel){
      sendPanel.hidden=false;
      sendPanel.classList.remove('is-hidden-confirm');
      sendPanel.classList.toggle('is-section-inactive',!sendPhrasesActive);
      setSectionLock(sendPanel,liteMode,'lite');
      sendPanel.setAttribute('aria-hidden','false');
    }
    if(paramsBar){
      paramsBar.hidden=false;
      setSectionLock(paramsBar,liteMode,'lite');
    }
    if(params){
      params.dataset.outputMode=key;
      params.dataset.liteMode=liteMode?'true':'false';
      params.classList.remove('is-hidden');
      syncDelayLabel(key);
      if(delayRow){
        delayRow.classList.toggle('is-hidden',!delayActive);
        delayRow.hidden=!delayActive;
        setSectionLock(delayRow,liteMode,'lite');
      }
      var commitPills=$('voiceSettingsCommitPills');
      setSectionLock(commitPills,liteMode,'lite');
    }
    forceTextPhraseKinds();
    if(global.OneToneVoiceEnd&&global.OneToneVoiceEnd.renderSendCustomPhrases){
      global.OneToneVoiceEnd.renderSendCustomPhrases();
    }
  }

  function renderOutputModeSegments(vm){
    var modeSeg=$('voiceOutputModeSegments');
    if(!modeSeg) return;
    var key=V().resolveOutputModeKey(vm);
    var liteMode=vm.mode==='sapi'||vm.mode==='off';
    modeSeg.classList.toggle('is-lite-locked',!vm.loading&&liteMode);
    modeSeg.querySelectorAll('.keys-trigger-mode-seg').forEach(function(btn){
      var segKey=btn.getAttribute('data-voice-output-mode')||'';
      btn.classList.toggle('is-active',segKey===key);
      btn.disabled=!!vm.loading;
      btn.hidden=false;
      btn.classList.toggle('is-mode-locked',!vm.loading&&liteMode&&segKey!=='confirm');
    });
  }

  function renderSendPage(vm){
    renderOutputModeSegments(vm);
    renderOutputPanel(vm);
  }

  global.OneToneVoiceStepSend={
    render:renderSendPage,
    renderSendPage:renderSendPage,
    syncPhraseKindTabs:syncPhraseKindTabs,
    forceTextPhraseKinds:forceTextPhraseKinds
  };
})((typeof window!=='undefined')?window:globalThis);
