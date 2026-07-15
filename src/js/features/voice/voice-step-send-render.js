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
    // Beginner UX: only show advanced blocks when they actually apply.
    const showSendExtras=!vm.loading&&!liteMode&&key!=='confirm';
    const delayActive=showSendExtras&&(key==='auto'||key==='phrase');

    if(modePanel) modePanel.hidden=!!vm.loading;
    if(hint){
      if(vm.loading) hint.textContent=t('homeLiveLoading');
      else if(key==='auto') hint.textContent=t('voiceOutputHintAuto');
      else if(key==='phrase') hint.textContent=t('voiceOutputHintPhrase');
      else hint.textContent=t('voiceOutputHintConfirm');
    }
    // Drop the old "look below" cue — extras are hidden until needed.
    if(moreCue) moreCue.hidden=true;
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

    if(sendPanel){
      sendPanel.hidden=!showSendExtras;
      sendPanel.classList.toggle('is-hidden-confirm',!showSendExtras);
      sendPanel.classList.remove('is-section-inactive');
      setSectionLock(sendPanel,false,'');
      sendPanel.setAttribute('aria-hidden',showSendExtras?'false':'true');
      var sendHint=$('voiceSendCustomHint');
      if(sendHint&&showSendExtras){
        sendHint.textContent=key==='auto'
          ?t('voiceSendCustomHintAuto')
          :t('voiceSendCustomHint');
      }
    }
    if(paramsBar){
      paramsBar.hidden=!showSendExtras;
      paramsBar.setAttribute('aria-hidden',showSendExtras?'false':'true');
      setSectionLock(paramsBar,false,'');
    }
    if(params){
      params.dataset.outputMode=key;
      params.dataset.liteMode=liteMode?'true':'false';
      params.classList.toggle('is-hidden',!showSendExtras);
      syncDelayLabel(key);
      if(delayRow){
        delayRow.classList.toggle('is-hidden',!delayActive);
        delayRow.hidden=!delayActive;
        setSectionLock(delayRow,false,'');
      }
      var commitPills=$('voiceSettingsCommitPills');
      setSectionLock(commitPills,false,'');
      var commitTitle=$('voiceSettingsCommitAsideTitle');
      if(commitTitle&&showSendExtras){
        commitTitle.textContent=delayActive
          ?t('voiceSendParamsTitle')
          :t('voiceSendParamsTitleKeyOnly');
      }
    }
    forceTextPhraseKinds();
    if(showSendExtras&&global.OneToneVoiceEnd&&global.OneToneVoiceEnd.renderSendCustomPhrases){
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
    var title=$('voiceSendPageTitle');
    var sub=$('voiceSendPageSub');
    if(title) title.textContent=t('voiceSendPageTitle');
    if(sub) sub.textContent=t('voiceSendPageSub');
  }

  global.OneToneVoiceStepSend={
    render:renderSendPage,
    renderSendPage:renderSendPage,
    syncPhraseKindTabs:syncPhraseKindTabs,
    forceTextPhraseKinds:forceTextPhraseKinds
  };
})((typeof window!=='undefined')?window:globalThis);
