(function(global){
  'use strict';

  var state = {
    open: false,
    embedded: false,
    mountEl: null,
    phrases: [],
    phraseIndex: 0,
    pollTimer: 0,
    animTimer: 0,
    animIndex: 0,
    onMatch: null,
    onSkip: null,
    readOnly: false,
    matched: false,
    mode: 'wake',
    phraseOptions: [],
    practiceIndex: 0,
    onPhrasesChange: null,
    multiSelect: false,
    onHeardChange: null,
    hintText: ''
  };

  function app(){
    return global.OneToneApp;
  }

  function t(key){
    var a = app();
    return a && a.t ? a.t(key) : key;
  }

  function $(id){
    return document.getElementById(id);
  }

  function normalizePhrase(text){
    return String(text || '').toLowerCase().replace(/[\s，。！？、,.!?；;：:'"「」『』()（）\[\]]/g, '').trim();
  }

  function matchWakePhrase(heard, phrases){
    var h = normalizePhrase(heard);
    if(!h || !phrases || !phrases.length) return null;
    for(var i = 0; i < phrases.length; i++){
      var p = normalizePhrase(phrases[i]);
      if(!p) continue;
      if(h === p || h.indexOf(p) >= 0 || p.indexOf(h) >= 0) return phrases[i];
    }
    return null;
  }

  function escapeHtml(s){
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');
  }

  function buildKaraokeHtml(phrase, highlightIndex){
    var chars = Array.from(String(phrase || ''));
    return chars.map(function(ch, i){
      var cls = 'phrase-practice-char';
      if(i < highlightIndex) cls += ' is-done';
      else if(i === highlightIndex) cls += ' is-active';
      return '<span class="'+cls+'">'+escapeHtml(ch)+'</span>';
    }).join('');
  }

  function currentPhrase(){
    if(!state.phrases.length) return '';
    var idx = state.practiceIndex;
    if(idx < 0 || idx >= state.phrases.length) idx = 0;
    return state.phrases[idx];
  }

  function chipOptions(){
    return state.phraseOptions.length ? state.phraseOptions : state.phrases;
  }

  function notifyPhrasesChange(){
    if(typeof state.onPhrasesChange === 'function'){
      state.onPhrasesChange(state.phrases.slice());
    }
    renderSelectedNote();
  }

  function renderSelectedNote(){
    var note = $('phrasePracticeSelectedNote');
    if(!note || state.embedded) return;
    if(!state.multiSelect){
      note.hidden = true;
      return;
    }
    note.hidden = false;
    var list = state.phrases.join('、');
    note.textContent = t('phrasePracticeSelectedNote')
      .replace('{n}', String(state.phrases.length))
      .replace('{list}', list);
  }

  function modalEl(){
    return $('phrasePracticeModal');
  }

  function isEndMode(){
    return state.mode === 'end';
  }

  function isCancelMode(){
    return state.mode === 'cancel';
  }

  function isTranscriptMode(){
    return isEndMode() || isCancelMode();
  }

  function skipButtonKey(){
    if(state.matched) return 'phrasePracticeDone';
    if(isCancelMode()) return 'phrasePracticeSkipCancel';
    return isEndMode() ? 'phrasePracticeSkipEnd' : 'phrasePracticeSkip';
  }

  function ensurePracticeMicBars(){
    var bars = $('phrasePracticeMicBars');
    var mic = global.OneToneAppMic;
    if(bars && mic && mic.buildMicLevelBars && !bars.innerHTML) bars.innerHTML = mic.buildMicLevelBars(12);
  }

  function renderPracticeMicRow(){
    ensurePracticeMicBars();
    var lbl = $('phrasePracticeMicLbl');
    if(lbl) lbl.textContent = t('phrasePracticeMicLbl');
    var nameEl = $('phrasePracticeMicName');
    if(nameEl){
      var mic = global.OneToneAppMic;
      var name = mic && mic.activeMicLabel ? mic.activeMicLabel() : '';
      nameEl.textContent = name || t('phrasePracticeMicChecking');
      nameEl.title = name;
    }
  }

  function bootPracticeUi(){
    renderPracticeMicRow();
    renderModalChrome();
    renderChips($('phrasePracticeChips'));
    startTimers();
    if(global.OneToneAppMic && global.OneToneAppMic.syncHomeMicMonitor){
      global.OneToneAppMic.syncHomeMicMonitor().catch(function(){});
    }
  }

  function renderModalChrome(){
    var a = app();
    var modal = modalEl();
    if(modal) modal.classList.toggle('is-end-mode', isEndMode());
    if(modal) modal.classList.toggle('is-cancel-mode', isCancelMode());
    var kicker = $('phrasePracticeKicker');
    var context = $('phrasePracticeContext');
    if(kicker){
      if(isEndMode() && !state.embedded){
        kicker.textContent = t('phrasePracticeKickerEnd');
        kicker.hidden = false;
      }else if(isCancelMode() && !state.embedded){
        kicker.textContent = t('phrasePracticeKickerCancel');
        kicker.hidden = false;
      }else{
        kicker.hidden = true;
      }
    }
    if(context){
      context.hidden = true;
      context.classList.remove('is-success-note');
    }
    var pickHint = $('phrasePracticePickHint');
    if(pickHint){
      if(state.multiSelect && !state.embedded){
        var pickKey='phrasePracticePickHint';
        if(isEndMode()) pickKey='phrasePracticePickHintEnd';
        else if(isCancelMode()) pickKey='phrasePracticePickHintCancel';
        pickHint.textContent = t(pickKey);
        pickHint.hidden = false;
      }else{
        pickHint.hidden = true;
      }
    }
    var title = $('phrasePracticeTitle');
    if(title){
      var titleKey='phrasePracticeTitle';
      if(isEndMode()) titleKey='phrasePracticeTitleEnd';
      else if(isCancelMode()) titleKey='phrasePracticeTitleCancel';
      title.textContent = t(titleKey);
    }
    var hint = $('phrasePracticeHint');
    if(hint){
      if(state.hintText){
        hint.textContent = state.hintText;
      }else{
        var hintKey='phrasePracticeHint';
        if(isEndMode()) hintKey='phrasePracticeHintEnd';
        else if(isCancelMode()) hintKey='phrasePracticeHintCancel';
        hint.textContent = t(hintKey);
      }
      hint.classList.remove('is-success-note');
    }
    var skip = $('btnPhrasePracticeSkip');
    if(skip){
      skip.textContent = t(skipButtonKey());
      skip.classList.toggle('primary', !!state.matched);
    }
    renderPracticeMicRow();
  }

  function togglePhraseSelection(phrase, host){
    phrase = String(phrase || '').trim();
    if(!phrase) return;
    var idx = state.phrases.indexOf(phrase);
    if(idx >= 0){
      if(state.phrases.length <= 1) {
        state.practiceIndex = 0;
      }else{
        state.phrases.splice(idx, 1);
        if(state.practiceIndex >= state.phrases.length) state.practiceIndex = state.phrases.length - 1;
      }
    }else{
      state.phrases.push(phrase);
      state.practiceIndex = state.phrases.indexOf(phrase);
    }
    state.matched = false;
    var pe = phraseEl();
    if(pe) pe.classList.remove('is-success');
    notifyPhrasesChange();
    renderChips(host);
    renderPhraseDisplay();
    renderHeard('');
  }

  function focusPhrase(phrase, host){
    var idx = state.phrases.indexOf(phrase);
    if(idx < 0) return;
    state.practiceIndex = idx;
    state.matched = false;
    var pe = phraseEl();
    if(pe) pe.classList.remove('is-success');
    renderChips(host);
    renderPhraseDisplay();
  }

  function phraseEl(){
    if(state.embedded && state.mountEl) {
      var root = typeof state.mountEl === 'string' ? $(state.mountEl.replace(/^#/,'')) : state.mountEl;
      return root ? root.querySelector('[data-phrase-practice-phrase]') : null;
    }
    return $('phrasePracticePhrase');
  }

  function heardEl(){
    if(state.embedded && state.mountEl){
      var root = typeof state.mountEl === 'string' ? $(state.mountEl.replace(/^#/,'')) : state.mountEl;
      return root ? root.querySelector('[data-phrase-practice-heard]') : null;
    }
    return $('phrasePracticeHeard');
  }

  function renderPhraseDisplay(){
    var el = phraseEl();
    if(!el) return;
    var phrase = currentPhrase();
    el.innerHTML = buildKaraokeHtml(phrase, state.animIndex % Math.max(phrase.length, 1));
  }

  function renderHeard(text){
    var el = heardEl();
    if(!el) return;
    var heard = String(text || '').trim();
    if(!heard){
      el.textContent = t('phrasePracticeListening');
      el.className = 'phrase-practice-heard habit-setup-voice-preview';
      if(typeof state.onHeardChange === 'function') state.onHeardChange('');
      return;
    }
    el.textContent = t('phrasePracticeHeard').replace('{text}', heard);
    el.className = 'phrase-practice-heard habit-setup-voice-preview is-live';
    if(typeof state.onHeardChange === 'function') state.onHeardChange(heard);
  }

  function stopTimers(){
    clearInterval(state.pollTimer);
    clearInterval(state.animTimer);
    state.pollTimer = 0;
    state.animTimer = 0;
  }

  function handleMatch(matchedPhrase){
    if(state.matched) return;
    state.matched = true;
    stopTimers();
    var el = phraseEl();
    if(el){
      el.innerHTML = buildKaraokeHtml(matchedPhrase, matchedPhrase.length);
      el.classList.add('is-success');
    }
    var h = heardEl();
    if(h){
      var okKey='phrasePracticeWakeSuccess';
      if(isEndMode()) okKey='phrasePracticeEndRecognized';
      else if(isCancelMode()) okKey='phrasePracticeCancelRecognized';
      h.textContent = isTranscriptMode()
        ? t(okKey).replace('{phrase}', matchedPhrase)
        : t('phrasePracticeWakeSuccess');
      h.className = 'phrase-practice-heard is-ok';
    }
    var ctx = $('phrasePracticeContext');
    var a = app();
    if(ctx){
      ctx.hidden = true;
      ctx.classList.remove('is-success-note');
    }
    var hint = $('phrasePracticeHint');
    if(hint && isEndMode() && !state.embedded){
      var keyLabel = (a && a.getImeTargetKeyLabel) ? a.getImeTargetKeyLabel() : 'Alt';
      hint.textContent = t('phrasePracticeEndPracticeNote').replace('{key}', keyLabel);
      hint.classList.add('is-success-note');
    }else if(hint && isCancelMode() && !state.embedded){
      hint.textContent = t('phrasePracticeCancelPracticeNote');
      hint.classList.add('is-success-note');
    }
    if(a && a.playSoundCue) a.playSoundCue('voice_wake');
    if(typeof state.onMatch === 'function') state.onMatch(matchedPhrase);
    renderModalChrome();
  }

  function pollHeard(){
    var a = app();
    if(!a) return;
    var heard = a.getPracticeHeardRaw
      ? a.getPracticeHeardRaw(state.mode)
      : (a.getWakeHeardRaw ? a.getWakeHeardRaw() : '');
    renderHeard(heard);
    var hit = matchWakePhrase(heard, state.phrases);
    if(hit) handleMatch(hit);
  }

  function startTimers(){
    stopTimers();
    state.animIndex = 0;
    state.matched = false;
    state.pollTimer = setInterval(pollHeard, 420);
    state.animTimer = setInterval(function(){
      var phrase = currentPhrase();
      if(!phrase.length) return;
      state.animIndex = (state.animIndex + 1) % (phrase.length + 1);
      renderPhraseDisplay();
    }, 280);
    pollHeard();
    renderPhraseDisplay();
  }

  function renderEmbeddedShell(mount){
    if(!mount) return;
    mount.innerHTML =
      '<div class="phrase-practice-embedded">'+
        '<p class="phrase-practice-hint" data-phrase-practice-hint></p>'+
        '<div class="phrase-practice-preview-label" data-phrase-practice-preview-label></div>'+
        '<div class="phrase-practice-phrase" data-phrase-practice-phrase></div>'+
        '<p class="phrase-practice-heard habit-setup-voice-preview" data-phrase-practice-heard></p>'+
        '<div class="phrase-practice-chip-row" data-phrase-practice-chips></div>'+
      '</div>';
    var previewLbl = mount.querySelector('[data-phrase-practice-preview-label]');
    if(previewLbl) previewLbl.textContent = t('phrasePracticeLivePreview');
    var hint = mount.querySelector('[data-phrase-practice-hint]');
    if(hint){
      if(state.hintText){
        hint.textContent = state.hintText;
      }else{
        hint.textContent = t(isTranscriptMode() ? (isCancelMode() ? 'phrasePracticeHintCancel' : 'phrasePracticeHintEnd') : 'phrasePracticeHint');
      }
    }
    renderChips(mount.querySelector('[data-phrase-practice-chips]'));
  }

  function nudgePracticeVoicePoll(){
    try{
      if(global.OneToneVoiceWake&&global.OneToneVoiceWake.nudgePoll){
        global.OneToneVoiceWake.nudgePoll();
      }else if(global.OneToneVoiceWake&&global.OneToneVoiceWake.pollTick){
        global.OneToneVoiceWake.pollTick();
      }
    }catch(_){}
  }

  function bootEmbeddedPractice(){
    var a = app();
    if(a && a.enableVoicePractice){
      a.enableVoicePractice({mode:state.mode}).then(function(){
        nudgePracticeVoicePoll();
        var mic = global.OneToneAppMic;
        if(mic && mic.loadMicDevices){
          return mic.loadMicDevices({manual:true}).catch(function(){}).then(startTimers);
        }
        startTimers();
      }).catch(function(){ startTimers(); });
      return;
    }
    if(a && a.enableVoiceWakeForPractice){
      a.enableVoiceWakeForPractice().then(function(){
        nudgePracticeVoicePoll();
        var mic = global.OneToneAppMic;
        if(mic && mic.loadMicDevices){
          return mic.loadMicDevices({manual:true}).catch(function(){}).then(startTimers);
        }
        startTimers();
      }).catch(function(){ startTimers(); });
      return;
    }
    startTimers();
  }

  function renderChips(host){
    if(!host) return;
    var options = chipOptions();
    var selected = {};
    state.phrases.forEach(function(p){ selected[p] = true; });
    var activePhrase = currentPhrase();
    host.innerHTML = options.map(function(p){
      var cls = 'phrase-practice-chip';
      if(selected[p]) cls += ' is-selected';
      if(p === activePhrase && selected[p]) cls += ' is-active';
      return '<button type="button" class="'+cls+'" data-phrase="'+escapeHtml(p)+'">'+escapeHtml(p)+'</button>';
    }).join('');
    host.querySelectorAll('[data-phrase]').forEach(function(btn){
      btn.onclick = function(){
        var phrase = btn.getAttribute('data-phrase') || '';
        if(!state.multiSelect){
          var idx = state.phrases.indexOf(phrase);
          if(idx < 0) return;
          state.practiceIndex = idx;
          state.matched = false;
          var pe = phraseEl();
          if(pe) pe.classList.remove('is-success');
          renderChips(host);
          renderPhraseDisplay();
          return;
        }
        var selected = state.phrases.indexOf(phrase) >= 0;
        if(selected && state.phrases.length > 1){
          togglePhraseSelection(phrase, host);
          return;
        }
        if(!selected){
          togglePhraseSelection(phrase, host);
          return;
        }
        focusPhrase(phrase, host);
      };
    });
    renderSelectedNote();
  }

  function open(opts){
    opts = opts || {};
    close({ silent: true });
    state.mode = opts.mode === 'end' ? 'end' : (opts.mode === 'cancel' ? 'cancel' : 'wake');
    state.phraseOptions = Array.isArray(opts.phraseOptions) ? opts.phraseOptions.filter(Boolean) : [];
    state.phrases = Array.isArray(opts.phrases) ? opts.phrases.filter(Boolean) : [];
    state.onPhrasesChange = opts.onPhrasesChange || null;
    state.multiSelect = !!opts.multiSelect;
    state.onMatch = opts.onMatch || null;
    state.onSkip = opts.onSkip || null;
    state.onHeardChange = opts.onHeardChange || null;
    state.hintText = String(opts.hintText || '').trim();
    state.readOnly = !!opts.readOnly;
    state.embedded = !!opts.embedded;
    state.mountEl = opts.mount || null;
    state.practiceIndex = 0;
    state.matched = false;
    state.open = true;

    if(state.embedded){
      var mount = typeof state.mountEl === 'string' ? $(String(state.mountEl).replace(/^#/,'')) : state.mountEl;
      if(mount) renderEmbeddedShell(mount);
      bootEmbeddedPractice();
      return;
    }

    var overlay = overlayEl();
    if(overlay){
      overlay.classList.add('open');
      overlay.setAttribute('aria-hidden', 'false');
    }
    var a = app();
    if(a && a.enableVoicePractice){
      a.enableVoicePractice({mode:state.mode}).then(function(){
        nudgePracticeVoicePoll();
        var mic = global.OneToneAppMic;
        if(mic && mic.loadMicDevices){
          return mic.loadMicDevices({manual:true}).catch(function(){}).then(bootPracticeUi);
        }
        bootPracticeUi();
      }).catch(function(){ bootPracticeUi(); });
      return;
    }
    if(a && a.enableVoiceWakeForPractice){
      a.enableVoiceWakeForPractice().then(function(){
        nudgePracticeVoicePoll();
        var mic = global.OneToneAppMic;
        if(mic && mic.loadMicDevices){
          return mic.loadMicDevices({manual:true}).catch(function(){}).then(bootPracticeUi);
        }
        bootPracticeUi();
      }).catch(function(){ bootPracticeUi(); });
      return;
    }
    var mic = global.OneToneAppMic;
    if(mic && mic.loadMicDevices){
      mic.loadMicDevices({manual:true}).catch(function(){}).then(bootPracticeUi);
      return;
    }
    bootPracticeUi();
  }

  function overlayEl(){
    return $('phrasePracticeOverlay');
  }

  function close(opts){
    opts = opts || {};
    stopTimers();
    state.open = false;
    if(!opts.silent && typeof state.onSkip === 'function') state.onSkip();
    state.onMatch = null;
    state.onSkip = null;
    state.onHeardChange = null;
    var overlay = overlayEl();
    if(overlay){
      overlay.classList.remove('open');
      overlay.setAttribute('aria-hidden', 'true');
    }
    var modal = modalEl();
    if(modal) modal.classList.remove('is-end-mode');
    if(state.embedded && state.mountEl){
      var mount = typeof state.mountEl === 'string' ? $(String(state.mountEl).replace(/^#/,'')) : state.mountEl;
      if(mount) mount.innerHTML = '';
    }
    state.embedded = false;
    state.mountEl = null;
    state.mode = 'wake';
    state.matched = false;
    state.phraseOptions = [];
    state.onPhrasesChange = null;
    state.multiSelect = false;
    state.hintText = '';
    state.onHeardChange = null;
    if(global.OneToneOnboarding && global.OneToneOnboarding.refreshPhrasesStep){
      global.OneToneOnboarding.refreshPhrasesStep();
    }
  }

  function isOpen(){
    return state.open;
  }

  function applyLang(){
    if(!state.open) return;
    renderModalChrome();
    if(state.embedded){
      var mount = typeof state.mountEl === 'string' ? $(String(state.mountEl).replace(/^#/,'')) : state.mountEl;
      if(mount){
        var eh = mount.querySelector('[data-phrase-practice-hint]');
        if(eh){
          if(state.hintText) eh.textContent = state.hintText;
          else eh.textContent = t(isCancelMode() ? 'phrasePracticeHintCancel' : (isEndMode() ? 'phrasePracticeHintEnd' : 'phrasePracticeHint'));
        }
        var pl = mount.querySelector('[data-phrase-practice-preview-label]');
        if(pl) pl.textContent = t('phrasePracticeLivePreview');
      }
    }
    renderPhraseDisplay();
    pollHeard();
  }

  function bind(){
    var closeBtn = $('btnPhrasePracticeClose');
    var skipBtn = $('btnPhrasePracticeSkip');
    var overlay = overlayEl();
    if(closeBtn) closeBtn.onclick = function(){ close(); };
    if(skipBtn) skipBtn.onclick = function(){ close(); };
    if(overlay){
      overlay.addEventListener('click', function(e){
        if(e.target === overlay) close();
      });
    }
  }

  global.OneTonePhrasePractice = {
    init: bind,
    open: open,
    close: close,
    isOpen: isOpen,
    applyLang: applyLang,
    matchWakePhrase: matchWakePhrase,
    normalizePhrase: normalizePhrase
  };
})(typeof window !== 'undefined' ? window : globalThis);
