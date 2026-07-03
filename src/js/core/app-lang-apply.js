(function(global){
  'use strict';

  function hooks(){ return global.__vp_app_lang_apply_hooks__ || {}; }

  function apply(skipRender,opts){
    var applyStarted=performance.now();
    hooks().frontendLog('applyLang enter skipRender='+(skipRender?'1':'0'));
    opts=opts||{};
    var d=hooks().dict();
    if(opts.bootstrap){
      hooks().applyBootstrapLangTexts(d);
      return;
    }
    hooks().applyCoreLangTexts(d);
    hooks().applySettingsLangTexts(d);
    hooks().applyMappingPrefsLangTexts(d);
    hooks().applyRuntimeLangTexts(d,skipRender);
    var elapsed=Math.round(performance.now()-applyStarted);
    if(elapsed>250) hooks().frontendLog('applyLang slow '+elapsed+'ms');
    hooks().frontendLog('applyLang exit '+elapsed+'ms');
  }

  global.OneToneAppLangApply={apply:apply};
})((typeof window!=='undefined')?window:globalThis);
