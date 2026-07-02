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
    matched: false
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
    return state.phrases[state.phraseIndex % state.phrases.length];
  }

  function overlayEl(){
    return $('phrasePracticeOverlay');
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
      el.className = 'phrase-practice-heard';
      return;
    }
    el.textContent = t('phrasePracticeHeard').replace('{text}', heard);
    el.className = 'phrase-practice-heard is-live';
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
      h.textContent = t('phrasePracticeMatched').replace('{phrase}', matchedPhrase);
      h.className = 'phrase-practice-heard is-ok';
    }
    var a = app();
    if(a && a.playSoundCue) a.playSoundCue('voice_wake');
    if(typeof state.onMatch === 'function') state.onMatch(matchedPhrase);
  }

  function pollHeard(){
    var a = app();
    if(!a || !a.getWakeHeardRaw) return;
    var heard = a.getWakeHeardRaw();
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
        '<div class="phrase-practice-phrase" data-phrase-practice-phrase></div>'+
        '<p class="phrase-practice-heard" data-phrase-practice-heard></p>'+
        '<div class="phrase-practice-chip-row" data-phrase-practice-chips></div>'+
      '</div>';
    var hint = mount.querySelector('[data-phrase-practice-hint]');
    if(hint) hint.textContent = t('phrasePracticeHint');
    renderChips(mount.querySelector('[data-phrase-practice-chips]'));
  }

  function renderChips(host){
    if(!host) return;
    host.innerHTML = state.phrases.map(function(p, i){
      var cls = 'phrase-practice-chip'+(i === state.phraseIndex ? ' is-active' : '');
      return '<button type="button" class="'+cls+'" data-phrase-index="'+String(i)+'">'+escapeHtml(p)+'</button>';
    }).join('');
    host.querySelectorAll('[data-phrase-index]').forEach(function(btn){
      btn.onclick = function(){
        state.phraseIndex = Number(btn.getAttribute('data-phrase-index')) || 0;
        state.animIndex = 0;
        state.matched = false;
        var pe = phraseEl();
        if(pe) pe.classList.remove('is-success');
        renderChips(host);
        renderPhraseDisplay();
      };
    });
  }

  function open(opts){
    opts = opts || {};
    close({ silent: true });
    state.phrases = Array.isArray(opts.phrases) ? opts.phrases.filter(Boolean) : [];
    state.onMatch = opts.onMatch || null;
    state.onSkip = opts.onSkip || null;
    state.readOnly = !!opts.readOnly;
    state.embedded = !!opts.embedded;
    state.mountEl = opts.mount || null;
    state.phraseIndex = 0;
    state.matched = false;
    state.open = true;

    if(state.embedded){
      var mount = typeof state.mountEl === 'string' ? $(String(state.mountEl).replace(/^#/,'')) : state.mountEl;
      if(mount) renderEmbeddedShell(mount);
      startTimers();
      return;
    }

    var overlay = overlayEl();
    if(overlay){
      overlay.classList.add('open');
      overlay.setAttribute('aria-hidden', 'false');
    }
    var title = $('phrasePracticeTitle');
    if(title) title.textContent = t('phrasePracticeTitle');
    var hint = $('phrasePracticeHint');
    if(hint) hint.textContent = t('phrasePracticeHint');
    var skip = $('btnPhrasePracticeSkip');
    if(skip) skip.textContent = t('phrasePracticeSkip');
    renderChips($('phrasePracticeChips'));
    startTimers();
  }

  function close(opts){
    opts = opts || {};
    stopTimers();
    state.open = false;
    if(!opts.silent && typeof state.onSkip === 'function') state.onSkip();
    state.onMatch = null;
    state.onSkip = null;
    var overlay = overlayEl();
    if(overlay){
      overlay.classList.remove('open');
      overlay.setAttribute('aria-hidden', 'true');
    }
    if(state.embedded && state.mountEl){
      var mount = typeof state.mountEl === 'string' ? $(String(state.mountEl).replace(/^#/,'')) : state.mountEl;
      if(mount) mount.innerHTML = '';
    }
    state.embedded = false;
    state.mountEl = null;
  }

  function isOpen(){
    return state.open;
  }

  function applyLang(){
    if(!state.open) return;
    var title = $('phrasePracticeTitle');
    if(title) title.textContent = t('phrasePracticeTitle');
    var hint = $('phrasePracticeHint');
    if(hint) hint.textContent = t('phrasePracticeHint');
    var skip = $('btnPhrasePracticeSkip');
    if(skip) skip.textContent = t('phrasePracticeSkip');
    if(state.embedded){
      var mount = typeof state.mountEl === 'string' ? $(String(state.mountEl).replace(/^#/,'')) : state.mountEl;
      if(mount){
        var eh = mount.querySelector('[data-phrase-practice-hint]');
        if(eh) eh.textContent = t('phrasePracticeHint');
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
