(function(global){
  'use strict';

  var STEPS = ['setup', 'try', 'phrases', 'engine', 'mode'];

  function voskOnlyUi(){
    return !!(global.OneToneVoiceEngineReadiness && global.OneToneVoiceEngineReadiness.isVoskOnlyUi());
  }

  function activeSteps(){
    if(voskOnlyUi()) return STEPS.filter(function(s){ return s !== 'engine'; });
    return STEPS.slice();
  }

  function currentStepName(){
    var steps = activeSteps();
    return steps[state.step] || steps[0] || 'setup';
  }

  function stepTitle(name){
    if(name === 'setup') return t('onboardStepSetup');
    if(name === 'try') return t('onboardStepTry');
    if(name === 'phrases') return t('onboardStepPhrases');
    if(name === 'engine') return t('onboardStepEngine');
    if(name === 'mode') return t('onboardStepMode');
    return name;
  }

  var state = {
    open: false,
    step: 0,
    engineChoice: 'pro',
    engineProbeDone: false,
    engineVoskReady: false,
    engineSapiReady: false,
    triggerChoice: 'custom',
    altRiskAccepted: false,
    triggerRecorded: false,
    targetRecording: false,
    previewMode: '',
    previewKey: '',
    tryPassed: false,
    tryTimer: 0,
    tryNoResponseTimer: 0,
    tryNoResponseShown: false,
    tryFailed: false,
    tryHelpOpen: false,
    tryHelpReason: '',
    practiceStarted: false
  };

  var WAKE_PRESET_OPTIONS = ['开始输入','开始听写','打开听写','语音输入','开启输入'];
  var END_PRESET_ZH = ['结束输入','发出去'];
  var END_PRESET_EN = ['end dictation','send it'];

  function contentPack(){
    if(global.OneToneLocaleDefaults){
      return global.OneToneLocaleDefaults.contentPack(global.OneToneLocaleDefaults.contentLocale());
    }
    return null;
  }

  function defaultTargetKey(){
    var pack = contentPack();
    return pack ? pack.mappingTargetKey : 'RAlt';
  }

  function wakePresetOptions(){
    var pack = contentPack();
    if(pack && pack.voiceVoskPhrases && pack.voiceVoskPhrases.length) return pack.voiceVoskPhrases.slice();
    return WAKE_PRESET_OPTIONS.slice();
  }

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
    if(global.OneToneImePresets && global.OneToneImePresets.refresh){
      global.OneToneImePresets.refresh('onboarding');
    }
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
      if(currentStepName() === 'try') startTryListen();
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
    var steps = activeSteps();
    host.innerHTML = steps.map(function(name, i){
      var title = stepTitle(name);
      var cls = 'onboard-progress-dot';
      if(i < state.step) cls += ' is-done';
      else if(i === state.step) cls += ' is-active';
      if(i >= 2) cls += ' is-optional';
      return '<span class="'+cls+'" title="'+escapeHtml(title)+'"><span class="onboard-progress-num">'+(i+1)+'</span></span>';
    }).join('');
  }

  function escapeHtml(s){
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');
  }

  function renderStepPanels(){
    var cur = currentStepName();
    STEPS.forEach(function(name){
      var panel = $('onboardPanel'+name.charAt(0).toUpperCase()+name.slice(1));
      if(panel) panel.hidden = (name !== cur);
    });
  }

  function renderTriggerCards(){
    updateRecordStatus();
  }

  function setRecordButtonState(btn, recorded, recording, recordKey, rerecordKey, recordingKey){
    if(!btn) return;
    if(recording){
      btn.textContent = t(recordingKey);
      btn.className = 'btn secondary record-btn onboard-record-btn is-recording';
      return;
    }
    if(recorded){
      btn.textContent = t(rerecordKey);
      btn.className = 'btn secondary record-btn onboard-record-btn onboard-rerecord-btn rerecord-btn';
      return;
    }
    btn.textContent = t(recordKey);
    btn.className = 'btn secondary record-btn onboard-record-btn';
  }

  function updateRecordButtonLabels(){
    var triggerBtn = $('btnOnboardStartTriggerRecord');
    var targetBtn = $('btnOnboardStartTargetRecord');
    var a = app();
    var recordingNow = !!(a && a.isRecording && a.isRecording());
    var pending = !!(a && a.isRecordingPending && a.isRecordingPending());
    var recordingTrigger = (recordingNow || pending) && state.previewMode === 'trigger';
    var recordingTarget = (recordingNow || pending) && state.previewMode === 'target';
    setRecordButtonState(
      triggerBtn,
      mappingTriggerReady(),
      recordingTrigger,
      'btnRecordTrigger',
      'btnRerecordTrigger',
      'onboardBtnRecordingTrigger'
    );
    setRecordButtonState(
      targetBtn,
      mappingTargetReady(),
      recordingTarget,
      'btnRecordTarget',
      'btnRerecordTarget',
      'onboardBtnRecordingTarget'
    );
  }

  function syncOnboardAppTargetStep(){
    var step = $('onboardAppTargetStep');
    if(!step) return;
    var triggerReady = state.triggerRecorded || mappingTriggerReady();
    var a = app();
    var recordingNow = !!(a && a.isRecording && a.isRecording());
    var pending = !!(a && a.isRecordingPending && a.isRecordingPending());
    var recordingTrigger = (recordingNow || pending) && state.previewMode === 'trigger';
    step.hidden = !triggerReady || recordingTrigger;
    step.classList.toggle('is-visible', !step.hidden);
    if(global.OneToneAppTargetPresets) global.OneToneAppTargetPresets.refresh('onboarding');
  }

  function updateRecordStatus(){
    var triggerCard = $('onboardTriggerCard');
    var targetCard = $('onboardTargetCard');
    var triggerCardKey = $('onboardTriggerCardKey');
    var targetCardKey = $('onboardTargetKey');
    var triggerHint = $('onboardTriggerCardHint');
    var targetHint = $('onboardTargetCardHint');
    var flowStatus = $('onboardRecordFlowStatus');
    var lbl = labels();
    var a = app();
    var recordingNow = !!(a && a.isRecording && a.isRecording());
    var pending = !!(a && a.isRecordingPending && a.isRecordingPending());
    var recordingTrigger = (recordingNow || pending) && state.previewMode === 'trigger';
    var recordingTarget = (recordingNow || pending) && state.previewMode === 'target';
    var triggerReady = state.triggerRecorded || mappingTriggerReady();
    var targetReady = mappingTargetReady();
    if(!recordingNow){
      state.targetRecording = false;
      if(!state.previewMode) clearRecordingPreview();
    }
    if(triggerCard) triggerCard.classList.toggle('is-recording', recordingTrigger);
    if(targetCard){
      targetCard.classList.toggle('is-recording', recordingTarget);
      targetCard.classList.toggle('is-disabled', !triggerReady && !recordingTarget);
    }
    var triggerStartBtn = $('btnOnboardStartTriggerRecord');
    var targetStartBtn = $('btnOnboardStartTargetRecord');
    if(targetStartBtn){
      targetStartBtn.disabled = !triggerReady && !recordingTarget;
    }
    if(triggerCardKey) triggerCardKey.textContent = lbl.triggerLabel || t('onboardRecordCardEmpty');
    if(targetCardKey) targetCardKey.textContent = lbl.targetLabel || defaultTargetKey();
    updateRecordButtonLabels();
    if(flowStatus){
      if(recordingTarget) flowStatus.textContent = t('onboardFlowRecordingTarget');
      else if(recordingTrigger) flowStatus.textContent = t('onboardFlowRecordingTrigger');
      else if(triggerReady && targetReady) flowStatus.textContent = t('onboardFlowAllDone');
      else if(triggerReady) flowStatus.textContent = t('onboardFlowAfterTrigger');
      else flowStatus.textContent = t('onboardFlowIdle');
    }
    syncOnboardAppTargetStep();
    if(recordingTrigger){
      if(triggerHint) triggerHint.textContent = t('onboardRecordListeningTrigger');
      if(targetHint) targetHint.textContent = triggerReady ? t('onboardTargetCardHint') : t('onboardTargetNeedTriggerFirst');
      return;
    }
    if(recordingTarget){
      if(targetHint) targetHint.textContent = t('onboardRecordListeningTarget');
      if(triggerHint) triggerHint.textContent = t('onboardTriggerCardDone');
      return;
    }
    if(triggerHint) triggerHint.textContent = triggerReady ? t('onboardTriggerCardDone') : t('onboardTriggerCardHint');
    if(targetHint) targetHint.textContent = triggerReady ? t('onboardTargetCardHint') : t('onboardTargetNeedTriggerFirst');
    if(global.OneToneImePresets) global.OneToneImePresets.refresh('onboarding');
  }

  function tryHelpKeys(reason){
    if(reason === 'send_failed'){
      return ['onboardTrySendFailedHelp1','onboardTrySendFailedHelp2'];
    }
    return ['onboardTryHelp1','onboardTryHelp2','onboardTryHelp3'];
  }

  function renderTryHelp(reason){
    var box = $('onboardTryHelpBox');
    var title = $('onboardTryHelpTitle');
    var list = $('onboardTryHelpList');
    var helpReason = reason || state.tryHelpReason || 'timeout';
    if(title){
      title.textContent = helpReason === 'send_failed'
        ? t('onboardTryReason_send_failed')
        : t('onboardTryHelpTitle');
    }
    if(list){
      list.innerHTML = tryHelpKeys(helpReason)
        .map(function(key){ return '<li>'+escHtmlOnboard(t(key))+'</li>'; })
        .join('');
    }
    if(box) box.hidden = !state.tryHelpOpen;
  }

  function escHtmlOnboard(s){
    return String(s || '')
      .replace(/&/g,'&amp;')
      .replace(/</g,'&lt;')
      .replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;');
  }

  function showTryHelp(reason){
    state.tryHelpOpen = true;
    state.tryHelpReason = reason || 'timeout';
    renderTryHelp(state.tryHelpReason);
    var result = $('onboardTryResult');
    if(result && !state.tryPassed && !result.textContent){
      result.textContent = t('onboardTryTimeout');
      result.className = 'onboard-try-result is-warn';
    }
  }

  function handleTryNoResponse(){
    stopTryListen();
    state.tryHelpOpen = false;
    var a = app();
    if(a && a.toast) a.toast(t('onboardTryNoResponseToast'));
    goStep(-1);
  }

  function renderTryStep(){
    var keyEl = $('onboardTryKey');
    var desc = $('onboardTryDesc');
    var mapNote = $('onboardTryMapNote');
    var result = $('onboardTryResult');
    var lbl = labels();
    if(keyEl) keyEl.textContent = lbl.triggerLabel || '—';
    if(desc) desc.textContent = t('onboardTryDesc');
    var a = app();
    var m = a && a.getActiveMapping ? a.getActiveMapping() : null;
    var appTargetId = m && String(m.appTargetId || '');
    var mapNoteKey = (appTargetId === 'cursor-chat')
      ? 'onboardTryMapNoteCursor'
      : (appTargetId === 'codex-chat')
        ? 'onboardTryMapNoteCodex'
        : (appTargetId === 'minimax-chat')
          ? 'onboardTryMapNoteMiniMax'
          : 'onboardTryMapNote';
    if(mapNote) mapNote.textContent = t(mapNoteKey);
    if(result){
      if(state.tryPassed){
        result.textContent = t('onboardTrySuccess');
        result.className = 'onboard-try-result is-ok';
      }else if(state.tryFailed){
        if(!result.textContent || result.textContent === t('onboardTryWaiting')){
          result.textContent = t('onboardTryFail');
        }
        result.className = 'onboard-try-result is-warn';
      }else{
        result.textContent = t('onboardTryWaiting');
        result.className = 'onboard-try-result is-pending';
      }
    }
    var tryKey = $('onboardTryKeyWrap');
    if(tryKey) tryKey.classList.toggle('is-success', state.tryPassed);
    var tryToMode = $('btnOnboardTryToMode');
    if(tryToMode) tryToMode.hidden = voskOnlyUi();
    renderTryHelp();
  }

  function renderFooterHint(){
    var hint = $('onboardHint');
    var links = $('onboardFooterLinks');
    if(!hint && !links) return;
    if(currentStepName() !== 'try'){
      if(hint){
        hint.hidden = false;
        hint.textContent = t('onboardHintOnce');
      }
      if(links) links.innerHTML = '';
      return;
    }
    if(hint) hint.hidden = true;
    if(!links) return;
    if(state.tryPassed){
      links.innerHTML = '';
      return;
    }
    var sep = '<span class="onboard-footer-sep" aria-hidden="true">·</span>';
    var helpLink = '<button type="button" class="onboard-footer-link" data-onboard-link="help">'+escHtmlOnboard(t('onboardTryHelpBtn'))+'</button>';
    if(state.tryFailed){
      links.innerHTML = '<button type="button" class="onboard-footer-link is-emphasis" data-onboard-link="help">'+escHtmlOnboard(t('onboardTryNoResponseFailed'))+'</button>';
      return;
    }
    if(state.tryNoResponseShown){
      links.innerHTML = helpLink + sep + '<button type="button" class="onboard-footer-link" data-onboard-link="noresponse">'+escHtmlOnboard(t('onboardTryNoResponseBtn'))+'</button>';
      return;
    }
    links.innerHTML = helpLink;
  }

  function renderTargetStep(){
    var lbl = labels();
    var tgt = $('onboardTargetKey');
    if(tgt) tgt.textContent = lbl.targetLabel || defaultTargetKey();
  }

  function renderPracticeStep(){}

  function renderActions(){
    var back = $('btnOnboardBack');
    var next = $('btnOnboardNext');
    var later = $('btnOnboardLater');
    if(back){
      back.hidden = state.step <= 0;
      back.textContent = t('onboardBtnBack');
    }
    if(later) later.hidden = true;
    if(!next) return;
    var stepName = currentStepName();
    if(stepName === 'setup'){
      next.textContent = t('onboardBtnNext');
      next.disabled = !canLeaveTriggerStep() || !targetOk();
      next.classList.add('primary');
      return;
    }
    if(stepName === 'try'){
      next.textContent = state.tryPassed ? t('onboardBtnNext') : t('onboardBtnSkip');
      next.disabled = false;
      next.classList.toggle('primary', !!state.tryPassed);
      return;
    }
    if(stepName === 'phrases' || stepName === 'engine'){
      next.textContent = t('onboardBtnNext');
      next.disabled = false;
      next.classList.add('primary');
      return;
    }
    next.textContent = t('onboardBtnFinish');
    next.disabled = false;
    next.classList.add('primary');
  }

  function render(){
    renderProgress();
    renderStepPanels();
    renderTriggerCards();
    renderTryStep();
    renderTargetStep();
    renderPhrasesStep();
    renderEngineStep();
    renderModeStep();
    renderActions();
    renderFooterHint();
    var title = $('onboardTitle');
    var desc = $('onboardDesc');
    var descSub = $('onboardDescSub');
    var kicker = $('onboardKicker');
    if(kicker) kicker.textContent = t('onboardKicker');
    var copy = stepCopy(currentStepName());
    if(title) title.textContent = copy.title;
    if(desc) desc.textContent = copy.desc;
    if(descSub){
      if(copy.descSub){
        descSub.textContent = copy.descSub;
        descSub.hidden = false;
      }else{
        descSub.hidden = true;
        descSub.textContent = '';
      }
    }
  }

  function stepCopy(name){
    if(name === 'setup') return { title: t('onboardTitleSetup'), desc: t('onboardDescSetup') };
    if(name === 'try') return { title: t('onboardTitle2'), desc: t('onboardDesc2') };
    if(name === 'phrases') return { title: t('onboardTitlePhrases'), desc: t('onboardDescPhrases1'), descSub: t('onboardDescPhrases2') };
    if(name === 'engine') return { title: t('onboardTitleEngine'), desc: t('onboardDescEngine') };
    return { title: t('onboardTitleMode'), desc: t('onboardDescMode') };
  }

  function isPhrasesStepOpen(){
    return !!(state.open && currentStepName() === 'phrases');
  }

  function escHtmlOnboardPhrase(s){
    return String(s || '')
      .replace(/&/g,'&amp;')
      .replace(/</g,'&lt;')
      .replace(/"/g,'&quot;');
  }

  function patchWakePhrases(phrases){
    var st = global.OneToneState && global.OneToneState.state;
    if(!st || !st.config) return;
    if(!st.config.voiceSapi) st.config.voiceSapi = {};
    if(!st.config.voiceVosk) st.config.voiceVosk = {};
    st.config.voiceSapi.phrases = phrases.slice();
    st.config.voiceVosk.phrases = phrases.slice();
    var persist = global.OneToneConfigPersist;
    if(persist && persist.save) persist.save();
  }

  function patchEndPhrases(zh, en){
    var st = global.OneToneState && global.OneToneState.state;
    if(!st || !st.config) return;
    if(!st.config.voiceEnd) st.config.voiceEnd = {};
    st.config.voiceEnd.phrasesZh = zh.slice();
    st.config.voiceEnd.phrasesEn = en.slice();
    var persist = global.OneToneConfigPersist;
    if(persist && persist.save) persist.save();
  }

  function ensureDefaultPhrases(){
    var a = app();
    var wake = (a && a.getWakePhrases) ? a.getWakePhrases() : [];
    if(!wake.length) patchWakePhrases(wakePresetOptions().slice(0, 2));
    var end = (a && a.getEndPhrases) ? a.getEndPhrases() : { zh: [], en: [] };
    var pack = contentPack();
    var endZh = pack ? pack.voiceEndPhrasesZh : END_PRESET_ZH;
    var endEn = pack ? pack.voiceEndPhrasesEn : END_PRESET_EN;
    if(!(end.zh && end.zh.length) && !(end.en && end.en.length)){
      patchEndPhrases(endZh.slice(0, 1), endEn.slice(0, 1));
    }
  }

  function renderPhrasesStep(){
    ensureDefaultPhrases();
    var flowNote = $('onboardPhrasesFlowNote');
    if(flowNote) flowNote.textContent = t('onboardPhrasesFlowNote');
  }

  function refreshPhrasesStep(){
    if(!state.open) return;
    renderPhrasesStep();
  }

  function endPhraseOptions(){
    var lang = app() && app().getLang ? app().getLang() : 'zh';
    return lang === 'en' ? END_PRESET_EN.concat(END_PRESET_ZH) : END_PRESET_ZH.concat(END_PRESET_EN);
  }

  function wakePhrasesForPractice(){
    var a = app();
    var list = (a && a.getWakePhrases) ? a.getWakePhrases() : [];
    list = list.filter(function(x){ return String(x || '').trim(); });
    return list.length ? list : WAKE_PRESET_OPTIONS.slice(0, 1);
  }

  function endPhrasesForPractice(){
    var a = app();
    if(!a || !a.getEndPhrases) return END_PRESET_ZH.slice(0, 1);
    var end = a.getEndPhrases();
    var lang = a.getLang ? a.getLang() : 'zh';
    var zh = end.zh || [];
    var en = end.en || [];
    var list = lang === 'en' ? en.concat(zh) : zh.concat(en);
    list = list.filter(function(x){ return String(x || '').trim(); });
    return list.length ? list : END_PRESET_ZH.slice(0, 1);
  }

  function patchEndPhrasesFromSelection(selected){
    var zh = [];
    var en = [];
    (selected || []).forEach(function(p){
      if(END_PRESET_ZH.indexOf(p) >= 0) zh.push(p);
      else if(END_PRESET_EN.indexOf(p) >= 0) en.push(p);
      else zh.push(p);
    });
    if(!zh.length) zh = END_PRESET_ZH.slice(0, 1);
    if(!en.length) en = END_PRESET_EN.slice(0, 1);
    patchEndPhrases(zh, en);
  }

  function openWakePhrasePractice(){
    var a = app();
    if(!a || !a.openPhrasePractice) return;
    a.openPhrasePractice({
      mode: 'wake',
      multiSelect: true,
      phraseOptions: WAKE_PRESET_OPTIONS,
      phrases: wakePhrasesForPractice(),
      onPhrasesChange: function(selected){
        patchWakePhrases(selected);
      }
    });
  }

  function openEndPhrasePractice(){
    var a = app();
    if(!a || !a.openPhrasePractice) return;
    a.openPhrasePractice({
      mode: 'end',
      multiSelect: true,
      phraseOptions: endPhraseOptions(),
      phrases: endPhrasesForPractice(),
      onPhrasesChange: function(selected){
        patchEndPhrasesFromSelection(selected);
      }
    });
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

  function getEngineChoice(){
    if(voskOnlyUi()) return 'pro';
    if(state.engineChoice === 'lite' || state.engineChoice === 'pro') return state.engineChoice;
    try{
      var v = localStorage.getItem('vp_engine_choice');
      if(v === 'lite' || v === 'pro') return v;
    }catch(_){}
    return 'pro';
  }

  function setEngineChoice(choice){
    if(choice !== 'lite' && choice !== 'pro') return;
    state.engineChoice = choice;
    try{ localStorage.setItem('vp_engine_choice', choice); }catch(_){}
    renderEngineStep();
  }

  function probeEngineStep(){
    if(currentStepName() !== 'engine' || !state.open) return;
    if(!global.OneToneIpc || !global.OneToneIpc.invoke) return;
    if(state.engineProbeDone) return;
    state.engineProbeDone = true;
    Promise.all([
      global.OneToneIpc.invoke('cmd_voice_vosk_status',{}).catch(function(){ return null; }),
      global.OneToneIpc.invoke('cmd_voice_sapi_status',{}).catch(function(){ return null; })
    ]).then(function(res){
      var vosk=res[0];
      var sapi=res[1];
      state.engineVoskReady = !!(vosk && vosk.modelExists !== false && String(vosk.resourceIssue||'') !== 'model_missing');
      state.engineSapiReady = !!(sapi && sapi.state !== 'error');
      if(global.OneToneVoiceEngineReadiness){
        if(global.OneToneVoiceEngineReadiness.sapiNeedsSetup(sapi)) state.engineSapiReady = false;
        if(global.OneToneVoiceEngineReadiness.voskNeedsModel(vosk)) state.engineVoskReady = false;
      }
      if(!state.engineVoskReady && state.engineSapiReady) setEngineChoice('lite');
      else if(state.engineVoskReady) setEngineChoice(getEngineChoice() === 'lite' && state.engineSapiReady ? 'lite' : 'pro');
      renderEngineStep();
    });
  }

  function renderEngineStep(){
    if(voskOnlyUi()) return;
    var choice = getEngineChoice();
    state.engineChoice = choice;
    var lite = $('onboardEngineLite');
    var pro = $('onboardEnginePro');
    if(lite) lite.classList.toggle('is-selected', choice === 'lite');
    if(pro) pro.classList.toggle('is-selected', choice === 'pro');
    var liteBadge = $('onboardEngineLiteBadge');
    var proBadge = $('onboardEngineProBadge');
    if(liteBadge){
      liteBadge.hidden = !state.engineProbeDone;
      liteBadge.textContent = state.engineSapiReady ? t('onboardEngineBadgeReady') : t('onboardEngineBadgeUnavailable');
      liteBadge.className = 'onboard-engine-badge'+(state.engineSapiReady ? ' is-ok' : ' is-warn');
    }
    if(proBadge){
      proBadge.hidden = !state.engineProbeDone;
      proBadge.textContent = state.engineVoskReady ? t('onboardEngineBadgeBundled') : t('onboardEngineBadgeDownload');
      proBadge.className = 'onboard-engine-badge'+(state.engineVoskReady ? ' is-ok' : ' is-warn');
    }
    var status = $('onboardEngineStatus');
    if(status){
      if(choice === 'pro' && state.engineProbeDone && !state.engineVoskReady){
        status.hidden = false;
        status.textContent = t('onboardEngineStatusDownload');
      }else if(choice === 'lite' && state.engineProbeDone && !state.engineSapiReady){
        status.hidden = false;
        status.textContent = t('onboardEngineStatusSapi');
      }else{
        status.hidden = true;
        status.textContent = '';
      }
    }
    if(currentStepName() === 'engine') probeEngineStep();
  }

  function applyEngineChoice(){
    var choice = voskOnlyUi() ? 'pro' : getEngineChoice();
    if(!global.OneToneIpc || !global.OneToneIpc.invoke) return Promise.resolve();
    if(choice === 'lite'){
      return global.OneToneIpc.invoke('cmd_voice_set_desired_engine',{engine:'sapi'});
    }
    return global.OneToneIpc.invoke('cmd_voice_vosk_set_model_preset',{preset:'cn-light'})
      .then(function(){
        return global.OneToneIpc.invoke('cmd_voice_set_desired_engine',{engine:'vosk'});
      })
      .then(function(bundle){
        var voskRes=(bundle&&bundle.voiceVosk)||bundle;
        if(global.OneToneVoiceEngineReadiness && global.OneToneVoiceEngineReadiness.voskNeedsModel(voskRes)){
          if(global.OneToneVoiceWake && global.OneToneVoiceWake.downloadVoskModel){
            global.OneToneVoiceWake.downloadVoskModel('cn-light');
          }
        }
      });
  }

  function canLeaveTriggerStep(){
    return state.triggerRecorded || mappingTriggerReady();
  }

  function targetOk(){
    var lbl = labels();
    var trig = String((lbl.triggerLabel || '').trim());
    var tgt = String((lbl.targetLabel || defaultTargetKey()).trim() || defaultTargetKey());
    if(!tgt) return false;
    if(trig && tgt && trig === tgt) return false;
    return true;
  }

  function ensureOnboardingScene(cfg, m){
    if(!m) return;
    m.voiceOverride = null;
    if(cfg) cfg.activeSceneId = m.id;
  }

  function applyTriggerChoice(){
    var a = app();
    if(!a || !a.saveConfigPatch) return;
    a.saveConfigPatch(function(m, cfg){
      m.enabled = true;
      if(!m.targetKey) m.targetKey = defaultTargetKey();
      ensureOnboardingScene(cfg, m);
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
    syncOnboardAppTargetStep();
    render();
  }

  function onTargetCaptured(msg){
    clearRecordingPreview();
    state.targetRecording = false;
    msg = msg || {};
    if(global.OneToneImePresets){
      if(msg.imePresetId){
        global.OneToneImePresets.refresh('onboarding');
      }else{
        global.OneToneImePresets.clearSelectedForManualRecord('onboarding');
      }
    }
    if(global.OneToneAppTargetPresets){
      if(msg.appTargetId){
        global.OneToneAppTargetPresets.refresh('onboarding');
      }else{
        global.OneToneAppTargetPresets.clearSelectedForManualRecord('onboarding');
      }
    }
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
    clearTimeout(state.tryNoResponseTimer);
    state.tryTimer = 0;
    state.tryNoResponseTimer = 0;
    var a = app();
    if(a && a.off) a.off('onboarding_trigger_fired', onTriggerFired);
  }

  function startTryListen(){
    stopTryListen();
    state.tryPassed = false;
    state.tryFailed = false;
    state.tryNoResponseShown = false;
    state.tryHelpOpen = false;
    state.tryHelpReason = '';
    renderTryStep();
    renderFooterHint();
    renderActions();
    var a = app();
    if(a && a.on) a.on('onboarding_trigger_fired', onTriggerFired);
    state.tryNoResponseTimer = setTimeout(function(){
      if(currentStepName() !== 'try' || state.tryPassed || state.tryFailed) return;
      state.tryNoResponseShown = true;
      renderFooterHint();
    }, 4000);
    state.tryTimer = setTimeout(function(){
      var result = $('onboardTryResult');
      if(result && !state.tryPassed){
        result.textContent = t('onboardTryTimeout');
        result.className = 'onboard-try-result is-warn';
        state.tryFailed = true;
        renderFooterHint();
      }
    }, 10000);
  }

  function onTriggerFired(msg){
    if(currentStepName() !== 'try' || !state.open) return;
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
      renderFooterHint();
      renderActions();
      stopTryListen();
      return;
    }
    if(result && msg){
      var reason = String(msg.reason || 'send_failed');
      var reasonKey = 'onboardTryReason_' + reason;
      var txt = t(reasonKey);
      if(txt === reasonKey) txt = t('onboardTryFail');
      result.textContent = txt;
      result.className = 'onboard-try-result is-warn';
      state.tryFailed = true;
      renderFooterHint();
      if(reason === 'send_failed'){
        state.tryHelpOpen = true;
        state.tryHelpReason = 'send_failed';
        renderTryHelp('send_failed');
      }
    }
  }

  function jumpToStep(stepIndex){
    if(stepIndex < 0 || stepIndex >= activeSteps().length) return;
    if(stepIndex > 0 && state.step === 0 && (!canLeaveTriggerStep() || !targetOk())) return;
    if(stepIndex > 1 && state.step < 1 && !state.tryPassed) return;
    state.step = stepIndex;
    render();
    if(currentStepName() === 'try') startTryListen();
    else stopTryListen();
  }

  function goStep(delta){
    var next = state.step + delta;
    if(next < 0 || next >= activeSteps().length) return;
    if(delta > 0 && currentStepName() === 'setup'){
      applyTriggerChoice();
    }
    if(currentStepName() === 'try' && next !== activeSteps().indexOf('try')) state.tryHelpOpen = false;
    state.step = next;
    render();
    if(currentStepName() === 'try') startTryListen();
    else stopTryListen();
  }

  function finish(){
    setEntryMode(getEntryMode());
    var a = app();
    applyEngineChoice().finally(function(){
      if(a && a.saveConfigPatch){
        a.saveConfigPatch(function(m, cfg){
          ensureOnboardingScene(cfg, m);
          if(cfg) cfg.coachHudEnabled = true;
        });
      }
      markDone();
      setOpen(false);
      if(a && a.renderHome) a.renderHome();
      if(a && a.toast) a.toast(t('onboardDoneToast'));
    });
  }

  function runTryTestSend(){
    var a = app();
    var mappingId = '';
    if(a && a.getActiveMapping){
      var m = a.getActiveMapping();
      mappingId = m && m.id ? String(m.id) : '';
    }
    if(global.OneToneMappingTestSend && global.OneToneMappingTestSend.fire){
      global.OneToneMappingTestSend.fire(mappingId || null);
      return;
    }
    if(a && a.fireTestSend){
      a.fireTestSend(mappingId || null);
      return;
    }
    if(a && a.toast) a.toast(t('onboardTryTestUnavailable'));
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
      if(state.step >= activeSteps().length - 1) finish();
      else goStep(1);
    };
    var helpTry = $('btnOnboardTryHelp');
    var tryTest = $('btnOnboardTryTest');
    if(tryTest) tryTest.onclick = function(ev){
      if(ev) ev.stopPropagation();
      runTryTestSend();
    };
    if(helpTry) helpTry.onclick = function(ev){
      if(ev) ev.stopPropagation();
      showTryHelp('timeout');
    };
    var noResp = $('btnOnboardTryNoResponse');
    if(noResp) noResp.onclick = function(ev){
      if(ev) ev.stopPropagation();
      handleTryNoResponse();
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
    var tryToPhrases = $('btnOnboardTryToPhrases');
    if(tryToPhrases) tryToPhrases.onclick = function(ev){
      if(ev) ev.stopPropagation();
      jumpToStep(2);
    };
    var tryToMode = $('btnOnboardTryToMode');
    if(tryToMode) tryToMode.onclick = function(ev){
      if(ev) ev.stopPropagation();
      jumpToStep(3);
    };
    var wakePractice = $('btnOnboardWakePractice');
    if(wakePractice) wakePractice.onclick = function(){ openWakePhrasePractice(); };
    var endPractice = $('btnOnboardEndPractice');
    if(endPractice) endPractice.onclick = function(){ openEndPhrasePractice(); };
    var modeKeys = $('onboardModeKeys');
    if(modeKeys) modeKeys.onclick = function(){ setEntryMode('keys'); renderModeStep(); };
    var modeVoice = $('onboardModeVoice');
    if(modeVoice) modeVoice.onclick = function(){ setEntryMode('voice'); renderModeStep(); };
    var modeBoth = $('onboardModeBoth');
    if(modeBoth) modeBoth.onclick = function(){ setEntryMode('both'); renderModeStep(); };
    var engineLite = $('onboardEngineLite');
    if(engineLite) engineLite.onclick = function(){ setEngineChoice('lite'); };
    var enginePro = $('onboardEnginePro');
    if(enginePro) enginePro.onclick = function(){ setEngineChoice('pro'); };
    var footerLinks = $('onboardFooterLinks');
    if(footerLinks){
      footerLinks.onclick = function(ev){
        var link = ev.target && ev.target.closest ? ev.target.closest('[data-onboard-link]') : null;
        if(!link) return;
        ev.stopPropagation();
        var action = link.getAttribute('data-onboard-link');
        if(action === 'help') showTryHelp(state.tryFailed ? 'send_failed' : 'timeout');
        if(action === 'noresponse') handleTryNoResponse();
      };
    }
    var overlay = overlayEl();
    if(overlay){
      overlay.addEventListener('click', function(e){
        if(e.target === overlay) dismiss();
      });
    }
  }

  function syncStaticI18n(){
    var pairs = [
      ['onboardTriggerCardStep','onboardTriggerCardStep'],['onboardTargetCardStep','onboardTargetCardStep'],
      ['onboardAppTargetStepTitle','onboardAppTargetStepTitle'],
      ['onboardTriggerCardTitle','onboardTriggerCardTitle'],['onboardTargetCardTitle','onboardTargetCardTitle'],
      ['btnOnboardLater','onboardBtnLater'],['btnOnboardBack','onboardBtnBack'],
      ['onboardWakeCardStep','onboardWakeCardStep'],['onboardWakeCardTitle','onboardWakeCardTitle'],
      ['onboardWakeNote','onboardWakeNote'],
      ['btnOnboardWakePractice','onboardWakePractice'],
      ['onboardPhrasesFlowMid','onboardPhrasesFlowMid'],
      ['onboardEndCardStep','onboardEndCardStep'],['onboardEndCardTitle','onboardEndCardTitle'],
      ['onboardEndNote','onboardEndNote'],
      ['onboardPhrasesFlowNote','onboardPhrasesFlowNote'],
      ['btnOnboardEndPractice','onboardEndPractice'],
      ['onboardModeNote','onboardModeNote'],
      ['onboardModeKeysTitle','onboardModeKeysTitle'],['onboardModeKeysHint','onboardModeKeysHint'],
      ['onboardModeVoiceTitle','onboardModeVoiceTitle'],['onboardModeVoiceHint','onboardModeVoiceHint'],
      ['onboardModeBothTitle','onboardModeBothTitle'],['onboardModeBothHint','onboardModeBothHint'],
      ['btnOnboardTryTest','onboardTryTestBtn'],
      ['btnOnboardTryToPhrases','onboardTryToPhrases'],['btnOnboardTryToMode','onboardTryToMode'],
      ['onboardEngineNote','onboardEngineNote'],
      ['onboardEngineLiteTitle','onboardEngineLiteTitle'],['onboardEngineLiteHint','onboardEngineLiteHint'],
      ['onboardEngineProTitle','onboardEngineProTitle'],['onboardEngineProHint','onboardEngineProHint']
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
    if(global.OneToneImePresets) global.OneToneImePresets.refresh('onboarding');
    if(global.OneToneAppTargetPresets) global.OneToneAppTargetPresets.refresh('onboarding');
    if(!state.open) return;
    render();
  }

  function open(fromReplay){
    try{
      if(!localStorage.getItem('vp_entry_mode')) localStorage.setItem('vp_entry_mode','both');
    }catch(_){}
    state.step = 0;
    state.engineChoice = 'pro';
    try{
      var ec = localStorage.getItem('vp_engine_choice');
      if(ec === 'lite' || ec === 'pro') state.engineChoice = ec;
    }catch(_){}
    state.engineProbeDone = false;
    state.engineVoskReady = false;
    state.engineSapiReady = false;
    state.triggerChoice = 'custom';
    state.altRiskAccepted = false;
    state.targetRecording = false;
    syncRecordedFlagsFromMapping();
    state.tryPassed = false;
    state.practiceStarted = false;
    if(global.OneToneImePresets) global.OneToneImePresets.refresh('onboarding');
    if(global.OneToneAppTargetPresets) global.OneToneAppTargetPresets.refresh('onboarding');
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
    isOpen: function(){ return state.open; },
    isPhrasesStepOpen: isPhrasesStepOpen,
    refreshPhrasesStep: refreshPhrasesStep
  };
})(typeof window !== 'undefined' ? window : globalThis);
