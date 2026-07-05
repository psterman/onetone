(function(global){
  'use strict';

  var CONTENT_LOCALE_KEY = 'vp_content_locale';

  function normalizeLocale(raw){
    var s = String(raw || '').trim().toLowerCase();
    if(!s) return 'zh';
    if(s.startsWith('en')) return 'en';
    return 'zh';
  }

  function detectSystemLocale(){
    try{
      return normalizeLocale(navigator.language || navigator.userLanguage || 'zh');
    }catch(_){
      return 'zh';
    }
  }

  function savedUiLang(){
    try{
      var v = localStorage.getItem('vp_lang');
      if(v === 'en' || v === 'zh') return v;
    }catch(_){}
    return '';
  }

  /** UI language: saved preference, else browser locale. */
  function uiLocale(){
    return savedUiLang() || detectSystemLocale();
  }

  /** Default content locale for wake phrases / target keys (independent of UI lang). */
  function contentLocale(){
    try{
      var pinned = localStorage.getItem(CONTENT_LOCALE_KEY);
      if(pinned === 'en' || pinned === 'zh') return pinned;
    }catch(_){}
    return detectSystemLocale();
  }

  function contentPack(locale){
    locale = normalizeLocale(locale);
    if(locale === 'en'){
      return {
        locale: 'en',
        mappingTargetKey: 'Win+H',
        mappingLabelSuffix: 'Win+H',
        voiceTargetKey: 'Win+H',
        voiceSapiPhrases: ['start dictation', 'start input', 'begin dictation'],
        voiceVoskPhrases: ['start dictation', 'start input', 'voice input'],
        voiceEndPhrasesZh: ['结束输入', '发出去'],
        voiceEndPhrasesEn: ['end dictation', 'send it'],
        voskModelPreset: 'en-light',
        voskModelPath: 'resources/vosk/vosk-model-small-en-us-0.15'
      };
    }
    return {
      locale: 'zh',
      mappingTargetKey: 'RAlt',
      mappingLabelSuffix: 'RAlt',
      voiceTargetKey: 'RAlt',
      voiceSapiPhrases: ['开始输入', '开始听写', '开启输入', '开始说话'],
      voiceVoskPhrases: ['开始输入', '开始听写', '打开听写', '语音输入', '开启输入'],
      voiceEndPhrasesZh: ['结束输入', '发出去'],
      voiceEndPhrasesEn: ['end dictation', 'send it'],
      voskModelPreset: 'cn-light',
      voskModelPath: 'resources/vosk/vosk-model-small-cn-0.22'
    };
  }

  function pinContentLocale(locale){
    try{ localStorage.setItem(CONTENT_LOCALE_KEY, normalizeLocale(locale)); }catch(_){}
  }

  /** Call once at boot: set UI lang from browser when user has not chosen yet. */
  function applyUiLocaleBootstrap(){
    if(savedUiLang()) return uiLocale();
    var detected = detectSystemLocale();
    if(global.OneToneI18n && global.OneToneI18n.setLang){
      global.OneToneI18n.setLang(detected);
    }
    return detected;
  }

  global.OneToneLocaleDefaults = {
    normalizeLocale: normalizeLocale,
    detectSystemLocale: detectSystemLocale,
    uiLocale: uiLocale,
    contentLocale: contentLocale,
    contentPack: contentPack,
    pinContentLocale: pinContentLocale,
    applyUiLocaleBootstrap: applyUiLocaleBootstrap
  };
})(typeof window !== 'undefined' ? window : globalThis);
