(function(global){
  'use strict';

  var STEPS = ['setup', 'try', 'phrases', 'mode'];
  var state = {
    open: false,
    step: 0,
    triggerChoice: 'custom',
    altRiskAccepted: false,
    triggerRecorded: false,
    targetRecording: false,
    previewMode: '',
    previewKey: '',
    tryPassed: false,
    tryTimer: 0,
    practiceStarted: false
  };

  function app(){
    return global.OneToneApp;
  }

  function $(id){
    return document.getElementById(id);
  }

  function t(key){
    var a = app();
    return a && a.t ? a.t(key) : key;
  }

  function lang(){
    var a = app();
    return a && a.getLang ? a.getLang() : 'zh';
  }

  function labels(){
    var a = app();
    var m = a && a.getActiveMapping ? a.getActiveMapping() : null;
    var out = global.OneToneKeyLabels.labelsForMapping(m, lang());
    if(state.previewMode === 'trigger' && state.previewKey){
      out.triggerLabel = global.OneToneKeyLabels.friendlyKeyName(state.previewKey, lang());
    }else if(state.previewMode === 'trigger' && !state.previewKey){
      out.triggerLabel = t('onboardRecordCardEmpty');
    }
    if(state.previewMode === 'target' && state.previewKey){
      out.targetLabel = global.OneToneKeyLabels.friendlyKeyName(state.previewKey, lang());
    }else if(state.previewMode === 'target' && !state.previewKey){
      out.targetLabel = t('onboardRecordCardEmpty');
    }
    return out;
  }

  function labelFromCapture(msg, mode){
    msg = msg || {};
    var key = String(msg.key || '').trim();
    var sourceKey = String(msg.sourceKey || '').trim();
    var display = mode === 'trigger' && key === 'AutoTrigger' ? (sourceKey || key) : key;
    if(!display && mode === 'trigger') display = sourceKey;
    if(!display) return '';
    return global.OneToneKeyLabels.friendlyKeyName(display, lang());
  }

  function mappingTriggerReady(){
    var a = app();
    var m = a && a.getActiveMapping ? a.getActiveMapping() : null;
    return !!(m && String(m.triggerKey || '').trim());
  }

  function mappingTargetReady(){
    var a = app();
    var m = a && a.getActiveMapping ? a.getActiveMapping() : null;
    var tgt = String((m && m.targetKey) || '').trim();
    return !!tgt;
  }

  function syncRecordedFlagsFromMapping(){
    state.triggerRecorded = mappingTriggerReady();
    clearRecordingPreview();
  }

  function clearRecordingPreview(){
    state.previewMode = '';
    state.previewKey = '';
  }

  function isV2Done(){
    try{ return localStorage.getItem('vp_onboarding_v2_done') === '1'; }catch(_){ return false; }
  }

  function shouldAutoOpen(){
    if(isV2Done()) return false;
    try{
      if(localStorage.getItem('vp_welcome_seen') === '1') return false;
    }catch(_){}
    return true;
  }

  function markDone(){
    try{
      localStorage.setItem('vp_onboarding_v2_done', '1');
      localStorage.setItem('vp_welcome_seen', '1');
    }catch(_){}
    var a = app();
    if(a && a.renderHome) a.renderHome();
  }

  function overlayEl(){
    return $('onboardOverlay');
  }

  function voiceWakeEnabled(){
    var a = app();
    return !!(a && a.isVoiceWakeEnabled && a.isVoiceWakeEnabled());
  }

  function stopPractice(){
    if(global.OneTonePhrasePractice && global.OneTonePhrasePractice.isOpen()){
      global.OneTonePhrasePractice.close({ silent: true });
    }
    state.practiceStarted = false;
  }

  function setOpen(open){
    state.open = !!open;
    var el = overlayEl();
    if(!el) return;
    el.classList.toggle('open', state.open);
    el.setAttribute('aria-hidden', state.open ? 'false' : 'true');
    if(state.open){
      render();
      if(state.step === 1) startTryListen();
      else stopTryListen();
      stopPractice();
    }else{
      stopTryListen();
      stopPractice();
      var a = app();
      if(a && a.onWelcomeClosed) a.onWelcomeClosed();
    }
  }

  function renderProgress(){
    var host = $('onboardProgress');
    if(!host) return;
    var titles = [
      t('onboardStepSetup'),
      t('onboardStepTry'),
      t('onboardStepPhrases'),
      t('onboardStepMode')
    ];
    host.innerHTML = titles.map(function(title, i){
      var cls = 'onboard-progress-dot';
      if(i < state.step) cls += ' is-done';
      else if(i === state.step) cls += ' is-active';
      return '<span class="'+cls+'" title="'+escapeHtml(title)+'"><span class="onboard-progress-num">'+(i+1)+'</span></span>';
    }).join('');
  }

  function escapeHtml(s){
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');
  }

  function renderStepPanels(){
    STEPS.forEach(function(name, i){
      var panel = $('onboardPanel'+name.charAt(0).toUpperCase()+name.slice(1));
      if(panel) panel.hidden = (i !== state.step);
    });
  }

  function renderTriggerCards(){
    updateRecordStatus();
  }

  function updateRecordButtonLabels(){
    var triggerBtn = $('btnOnboardStartTriggerRecord');
    var targetBtn = $('btnOnboardStartTargetRecord');
    if(triggerBtn) triggerBtn.textContent = mappingTriggerReady() ? t('btnRerecordTrigger') : t('btnRecordTrigger');
    if(targetBtn) targetBtn.textContent = mappingTargetReady() ? t('btnRerecordTarget') : t('btnRecordTarget');
  }

  function updateRecordStatus(){
    var triggerCard = $('onboardTriggerCard');
    var targetCard = $('onboardTargetCard');
    var triggerCardKey = $('onboardTriggerCardKey');
    var targetCardKey = $('onboardTargetKey');
    var triggerHint = $('onboardTriggerCardHint');
    var targetHint = $('onboardTargetCardHint');
    var flowStatus = $('onboardRecordFlowStatus');
    var triggerAgain = $('btnOnboardRecordTriggerAgain');
    var targetAgain = $('btnOnboardRecordTargetAgain');
    var lbl = labels();
    var a = app();
    var recordingNow = !!(a && a.isRecording && a.isRecording());
    var pending = !!(a && a.isRecordingPending && a.isRecordingPending());
    var recordingTrigger = (recordingNow || pending) && state.previewMode === 'trigger';
    var recordingTarget = (recordingNow || pending) && state.previewMode === 'target';
    if(!recordingNow){
      state.targetRecording = false;
      if(!state.previewMode) clearRecordingPreview();
    }
    if(triggerCard) triggerCard.classList.toggle('is-recording', recordingTrigger);
    if(targetCard){
      targetCard.classList.toggle('is-recording', recordingTarget);
      var triggerReady = state.triggerRecorded || mappingTriggerReady();
      targetCard.classList.toggle('is-disabled', !triggerReady && !recordingTarget);
    }
    var triggerStartBtn = $('btnOnboardStartTriggerRecord');
    var targetStartBtn = $('btnOnboardStartTargetRecord');
    if(targetStartBtn){
      var targetReady = state.triggerRecorded || mappingTriggerReady();
      targetStartBtn.disabled = !targetReady && !recordingTarget;
    }
    if(triggerCardKey) triggerCardKey.textContent = lbl.triggerLabel || t('onboardRecordCardEmpty');
    if(targetCardKey) targetCardKey.textContent = lbl.targetLabel || 'RAlt';
    if(triggerAgain) triggerAgain.hidden = !(state.triggerRecorded || mappingTriggerReady());
    if(targetAgain) targetAgain.hidden = !mappingTargetReady();
    updateRecordButtonLabels();
    if(flowStatus){
      if(recordingTarget) flowStatus.textContent = t('onboardFlowRecordingTarget');
      else if(recordingTrigger) flowStatus.textContent = t('onboardFlowRecordingTrigger');
      else if(state.triggerRecorded || mappingTriggerReady()) flowStatus.textContent = t('onboardFlowAfterTrigger');
      else flowStatus.textContent = t('onboardFlowIdle');
    }
    if(recordingTrigger){
      if(triggerHint) triggerHint.textContent = t('onboardRecordWaiting');
      if(targetHint) targetHint.textContent = (state.triggerRecorded || mappingTriggerReady()) ? t('onboardTargetCardHint') : t('onboardTargetNeedTriggerFirst');
      return;
    }
    if(recordingTarget){
      if(targetHint) targetHint.textContent = t('onboardTargetRecording');
      if(triggerHint) triggerHint.textContent = t('onboardTriggerCardDone');
      return;
    }
    if(triggerHint) triggerHint.textContent = (state.triggerRecorded || mappingTriggerReady()) ? t('onboardTriggerCardDone') : t('onboardTriggerCardHint');
    if(targetHint) targetHint.textContent = (state.triggerRecorded || mappingTriggerReady()) ? t('onboardTargetCardHint') : t('onboardTargetNeedTriggerFirst');
  }

  function renderTryStep(){
    var keyEl = $('onboardTryKey');
    var desc = $('onboardTryDesc');
    var result = $('onboardTryResult');
    var lbl = labels();
    if(keyEl) keyEl.textContent = lbl.triggerLabel || '—';
    if(desc){
      const trig=lbl.triggerLabel||'—';
      const tgt=lbl.targetLabel||'RAlt';
      desc.textContent = t('onboardTryDesc').replace('{key}', trig) + '（' + trig + ' → ' + tgt + '）';
    }
    if(result){
      if(state.tryPassed){
        result.textContent = t('onboardTrySuccess');
        result.className = 'onboard-try-result is-ok';
      }else{
        result.textContent = '';
        result.className = 'onboard-try-result';
      }
    }
    var tryKey = $('onboardTryKeyWrap');
    if(tryKey) tryKey.classList.toggle('is-success', state.tryPassed);
  }

  function renderTargetStep(){
    var lbl = labels();
    var tgt = $('onboardTargetKey');
    if(tgt) tgt.textContent = lbl.targetLabel || 'RAlt';
  }

  function renderPracticeStep(){}

  function renderActions(){
    var back = $('btnOnboardBack');
    var next = $('btnOnboardNext');
    var later = $('btnOnboardLater');
    if(back) back.hidden = state.step <= 0;
    if(later) later.hidden = true;
    if(!next) return;
    if(state.step === 0){
      next.textContent = t('onboardBtnNext');
      next.disabled = !canLeaveTriggerStep() || !targetOk();
      return;
    }
    if(state.step === 1){
      next.textContent = t('onboardBtnNext');
      next.disabled = !state.tryPassed;
      return;
    }
    if(state.step === 2){
      next.textContent = t('onboardBtnNext');
      next.disabled = false;
      return;
    }
    next.textContent = t('onboardBtnStart');
    next.disabled = false;
  }

  function render(){
    renderProgress();
    renderStepPanels();
    renderTriggerCards();
    renderTryStep();
    renderTargetStep();
    renderPhrasesStep();
    renderModeStep();
    renderActions();
    var title = $('onboardTitle');
    var desc = $('onboardDesc');
    var kicker = $('onboardKicker');
    if(kicker) kicker.textContent = t('onboardKicker');
    var copy = stepCopy(state.step);
    if(title) title.textContent = copy.title;
    if(desc) desc.textContent = copy.desc;
    var hint = $('onboardHint');
    if(hint) hint.textContent = t('onboardHintOnce');
  }

  function stepCopy(step){
    if(step === 0) return { title: t('onboardTitleSetup'), desc: t('onboardDescSetup') };
    if(step === 1) return { title: t('onboardTitle2'), desc: t('onboardDesc2') };
    if(step === 2) return { title: t('onboardTitlePhrases'), desc: t('onboardDescPhrases') };
    return { title: t('onboardTitleMode'), desc: t('onboardDescMode') };
  }

  function renderPhrasesStep(){
    var a = app();
    var wakeEl = $('onboardWakePhrase');
    var endEl = $('onboardEndPhrase');
    if(wakeEl){
      var list = (a && a.getWakePhrases) ? a.getWakePhrases() : [];
      wakeEl.textContent = (list && list.length) ? String(list[0]) : '—';
    }
    if(endEl){
      var end = (a && a.getEndPhrases) ? a.getEndPhrases() : { zh: [], en: [] };
      var zh = end.zh && end.zh.length ? end.zh[0] : '';
      var en = end.en && end.en.length ? end.en[0] : '';
      endEl.textContent = zh || en || '—';
    }
  }

  function renderModeStep(){
    var mode = getEntryMode();
    var keys = $('onboardModeKeys');
    var voice = $('onboardModeVoice');
    var both = $('onboardModeBoth');
    if(keys) keys.classList.toggle('is-selected', mode === 'keys');
    if(voice) voice.classList.toggle('is-selected', mode === 'voice');
    if(both) both.classList.toggle('is-selected', mode === 'both');
  }

  function canLeaveTriggerStep(){
    return state.triggerRecorded || mappingTriggerReady();
  }

  function targetOk(){
    var lbl = labels();
    var trig = String((lbl.triggerLabel || '').trim());
    var tgt = String((lbl.targetLabel || 'RAlt').trim() || 'RAlt');
    if(!tgt) return false;
    if(trig && tgt && trig === tgt) return false;
    return true;
  }

  function applyTriggerChoice(){
    var a = app();
    if(!a || !a.saveConfigPatch) return;
    a.saveConfigPatch(function(m){
      m.enabled = true;
      if(!m.targetKey) m.targetKey = 'RAlt';
    });
  }

  function startTriggerRecord(){
    var a = app();
    if(!a) return;
    state.previewMode = 'trigger';
    state.previewKey = '';
    state.targetRecording = false;
    var started = a.startTriggerRecording ? a.startTriggerRecording() : null;
    if(started && typeof started.then === 'function'){
      started.then(function(ok){
        if(ok === false){
          clearRecordingPreview();
        }
        updateRecordStatus();
      });
    }else{
      updateRecordStatus();
    }
  }

  function startTargetRecord(){
    var a = app();
    if(!a) return;
    if(!state.triggerRecorded && !mappingTriggerReady()) return;
    state.previewMode = 'target';
    state.previewKey = '';
    state.targetRecording = true;
    var started = a.startTargetRecording ? a.startTargetRecording() : null;
    if(started && typeof started.then === 'function'){
      started.then(function(ok){
        if(ok === false){
          state.targetRecording = false;
          clearRecordingPreview();
        }
        updateRecordStatus();
      });
    }else{
      updateRecordStatus();
    }
  }

  function onRecordingPreview(mode, key){
    if(!state.open) return;
    state.previewMode = mode || '';
    state.previewKey = key || '';
    if(mode === 'target') state.targetRecording = true;
    updateRecordStatus();
  }

  function onKeyCaptured(msg){
    clearRecordingPreview();
    state.triggerRecorded = true;
    state.targetRecording = false;
    render();
  }

  function onTargetCaptured(msg){
    clearRecordingPreview();
    state.targetRecording = false;
    render();
  }

  function syncRecordingUi(){
    if(!state.open) return;
    var a = app();
    var recordingNow = !!(a && a.isRecording && a.isRecording());
    var pending = !!(a && a.isRecordingPending && a.isRecordingPending());
    if(!recordingNow && !pending){
      state.targetRecording = false;
      clearRecordingPreview();
    }
    updateRecordStatus();
  }

  function stopTryListen(){
    clearTimeout(state.tryTimer);
    state.tryTimer = 0;
    var a = app();
    if(a && a.off) a.off('onboarding_trigger_fired', onTriggerFired);
  }

  function startTryListen(){
    stopTryListen();
    state.tryPassed = false;
    renderTryStep();
    renderActions();
    var a = app();
    if(a && a.on) a.on('onboarding_trigger_fired', onTriggerFired);
    state.tryTimer = setTimeout(function(){
      var result = $('onboardTryResult');
      if(result && !state.tryPassed){
        result.textContent = t('onboardTryTimeout');
        result.className = 'onboard-try-result is-warn';
      }
    }, 10000);
  }

  function onTriggerFired(msg){
    if(state.step !== 1 || !state.open) return;
    var result = $('onboardTryResult');
    if(msg && msg.ok){
      state.tryPassed = true;
      if(result){
        result.textContent = t('onboardTrySuccess');
        result.className = 'onboard-try-result is-ok';
      }
      var a = app();
      if(a && a.playSoundCue) a.playSoundCue('key_wake');
      renderTryStep();
      renderActions();
      stopTryListen();
      return;
    }
    if(result && msg){
      var reasonKey = 'onboardTryReason_' + (msg.reason || 'send_failed');
      var txt = t(reasonKey);
      if(txt === reasonKey) txt = t('onboardTryFail');
      result.textContent = txt;
      result.className = 'onboard-try-result is-warn';
    }
  }

  function goStep(delta){
    var next = state.step + delta;
    if(next < 0 || next >= STEPS.length) return;
    if(delta > 0 && state.step === 0){
      applyTriggerChoice();
    }
    state.step = next;
    render();
    if(state.step === 1) startTryListen();
    else stopTryListen();
  }

  function finish(){
    setEntryMode(getEntryMode());
    markDone();
    setOpen(false);
    var a = app();
    if(a && a.renderHome) a.renderHome();
    if(a && a.toast) a.toast(t('onboardDoneToast'));
  }

  function dismiss(){
    markDone();
    setOpen(false);
    var a = app();
    if(a && a.renderHome) a.renderHome();
  }

  function getEntryMode(){
    try{
      var v = localStorage.getItem('vp_entry_mode');
      if(v === 'keys' || v === 'voice' || v === 'both') return v;
    }catch(_){}
    return 'both';
  }

  function setEntryMode(mode){
    if(mode !== 'keys' && mode !== 'voice' && mode !== 'both') return;
    try{ localStorage.setItem('vp_entry_mode', mode); }catch(_){}
    var a = app();
    if(a && a.renderHome) a.renderHome();
  }

  function bind(){
    var close = $('btnOnboardClose');
    if(close) close.onclick = dismiss;
    var back = $('btnOnboardBack');
    var next = $('btnOnboardNext');
    if(back) back.onclick = function(){ goStep(-1); };
    if(next) next.onclick = function(){
      if(state.step >= STEPS.length - 1) finish();
      else goStep(1);
    };
    var helpTry = $('btnOnboardTryHelp');
    if(helpTry) helpTry.onclick = function(){
      var a = app();
      if(a && a.openHomeGuideCard) a.openHomeGuideCard('key');
    };
    var noResp = $('btnOnboardTryNoResponse');
    if(noResp) noResp.onclick = function(){
      var a = app();
      if(a && a.openHomeGuideCard) a.openHomeGuideCard('key');
      goStep(-1);
    };
    var startTrigger = $('btnOnboardStartTriggerRecord');
    if(startTrigger) startTrigger.onclick = function(ev){
      if(ev) ev.stopPropagation();
      startTriggerRecord();
    };
    var startTarget = $('btnOnboardStartTargetRecord');
    if(startTarget) startTarget.onclick = function(ev){
      if(ev) ev.stopPropagation();
      startTargetRecord();
    };
    var rerecordTrigger = $('btnOnboardRecordTriggerAgain');
    if(rerecordTrigger) rerecordTrigger.onclick = function(ev){
      if(ev) ev.stopPropagation();
      startTriggerRecord();
    };
    var rerecordTarget = $('btnOnboardRecordTargetAgain');
    if(rerecordTarget) rerecordTarget.onclick = function(ev){
      if(ev) ev.stopPropagation();
      startTargetRecord();
    };
    var wakePractice = $('btnOnboardWakePractice');
    if(wakePractice) wakePractice.onclick = function(){
      var a = app();
      if(a && a.openPhrasePractice) a.openPhrasePractice({});
    };
    var modeKeys = $('onboardModeKeys');
    if(modeKeys) modeKeys.onclick = function(){ setEntryMode('keys'); renderModeStep(); };
    var modeVoice = $('onboardModeVoice');
    if(modeVoice) modeVoice.onclick = function(){ setEntryMode('voice'); renderModeStep(); };
    var modeBoth = $('onboardModeBoth');
    if(modeBoth) modeBoth.onclick = function(){ setEntryMode('both'); renderModeStep(); };
    var overlay = overlayEl();
    if(overlay){
      overlay.addEventListener('click', function(e){
        if(e.target === overlay) dismiss();
      });
    }
  }

  function syncStaticI18n(){
    var pairs = [
      ['onboardSetupNote','onboardSetupNote'],
      ['onboardTriggerCardStep','onboardTriggerCardStep'],['onboardTargetCardStep','onboardTargetCardStep'],
      ['onboardTriggerCardTitle','onboardTriggerCardTitle'],['onboardTargetCardTitle','onboardTargetCardTitle'],
      ['btnOnboardLater','onboardBtnLater'],['btnOnboardRecordTriggerAgain','onboardBtnRecord'],['btnOnboardRecordTargetAgain','onboardBtnRecord'],
      ['onboardWakeNote','onboardWakeNote'],
      ['btnOnboardWakePractice','onboardWakePractice'],
      ['onboardEndNote','onboardEndNote'],
      ['onboardEndHint','onboardEndHint'],
      ['onboardModeNote','onboardModeNote'],
      ['onboardModeKeysTitle','onboardModeKeysTitle'],['onboardModeKeysHint','onboardModeKeysHint'],
      ['onboardModeVoiceTitle','onboardModeVoiceTitle'],['onboardModeVoiceHint','onboardModeVoiceHint'],
      ['onboardModeBothTitle','onboardModeBothTitle'],['onboardModeBothHint','onboardModeBothHint']
    ];
    pairs.forEach(function(pair){
      var el = $(pair[0]);
      if(el) el.textContent = t(pair[1]);
    });
    updateRecordButtonLabels();
  }

  function applyLang(){
    syncStaticI18n();
    if(global.OneTonePhrasePractice) global.OneTonePhrasePractice.applyLang();
    if(!state.open) return;
    render();
  }

  function open(fromReplay){
    try{
      if(!localStorage.getItem('vp_entry_mode')) localStorage.setItem('vp_entry_mode','both');
    }catch(_){}
    state.step = 0;
    state.triggerChoice = 'custom';
    state.altRiskAccepted = false;
    state.targetRecording = false;
    syncRecordedFlagsFromMapping();
    state.tryPassed = false;
    state.practiceStarted = false;
    setOpen(true);
  }

  global.OneToneOnboarding = {
    init: bind,
    open: open,
    shouldAutoOpen: shouldAutoOpen,
    isV2Done: isV2Done,
    applyLang: applyLang,
    onKeyCaptured: onKeyCaptured,
    onTargetCaptured: onTargetCaptured,
    onRecordingPreview: onRecordingPreview,
    syncRecordingUi: syncRecordingUi,
    setOpen: setOpen,
    isOpen: function(){ return state.open; }
  };
})(typeof window !== 'undefined' ? window : globalThis);
