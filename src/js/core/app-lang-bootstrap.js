(function(global){
  'use strict';
  var $=function(id){ return global.OneToneDom.$(id); };
  function hooks(){ return global.__vp_app_lang_bootstrap_hooks__ || {}; }

  function applyBootstrapTexts(d){
    var appTitle=$('appTitle');
    if(appTitle) appTitle.textContent=d.appTitle;
    var subtitle=$('appSubtitle');
    if(subtitle) subtitle.textContent=d.appSubtitle||'';
    var welcomeKicker=$('welcomeKicker');
    if(welcomeKicker) welcomeKicker.textContent=d.welcomeKicker;
    var welcomeTitle=$('welcomeTitle');
    if(welcomeTitle) welcomeTitle.textContent=d.welcomeTitle;
    var welcomeDesc=$('welcomeDesc');
    if(welcomeDesc) welcomeDesc.textContent=d.welcomeDesc;
    var welcomeHint=$('welcomeHint');
    if(welcomeHint) welcomeHint.textContent=d.welcomeHint;
    var btnWelcomeStart=$('btnWelcomeStart');
    if(btnWelcomeStart) btnWelcomeStart.textContent=d.welcomeStart;
    var btnWelcomeLater=$('btnWelcomeLater');
    if(btnWelcomeLater) btnWelcomeLater.textContent=d.welcomeLater;
    var guideTitle1=$('guideTitle1');
    if(guideTitle1) guideTitle1.textContent=d.guideTitle1;
    var guideDesc1=$('guideDesc1');
    if(guideDesc1) guideDesc1.textContent=d.guideDesc1;
    var guideTitle2=$('guideTitle2');
    if(guideTitle2) guideTitle2.textContent=d.guideTitle2;
    var guideDesc2=$('guideDesc2');
    if(guideDesc2) guideDesc2.textContent=d.guideDesc2;
    var guideTitle3=$('guideTitle3');
    if(guideTitle3) guideTitle3.textContent=d.guideTitle3;
    var guideDesc3=$('guideDesc3');
    if(guideDesc3) guideDesc3.textContent=d.guideDesc3;

    hooks().applyTheme();
    hooks().applyFontScale();
    if(global.OneToneOnboarding) global.OneToneOnboarding.applyLang();
    if(global.OneTonePhrasePractice) global.OneTonePhrasePractice.applyLang();
    hooks().setLangBootstrapPending(true);
  }

  global.OneToneAppLangBootstrap={applyBootstrapTexts:applyBootstrapTexts};
})((typeof window!=='undefined')?window:globalThis);
