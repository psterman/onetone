(function(global){
  'use strict';
  var $=function(id){ return global.OneToneDom.$(id); };
  function hooks(){ return global.__vp_app_lang_core_hooks__ || {}; }

  function applyCoreTexts(d){
    $('appTitle').textContent=d.appTitle;
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
    var demoLabel=$('demoLabel');
    if(demoLabel) demoLabel.textContent=d.demoLabel;
    var demoCardTitle1=$('demoCardTitle1');
    if(demoCardTitle1) demoCardTitle1.textContent=d.demoCardTitle1;
    var demoCardTitle2=$('demoCardTitle2');
    if(demoCardTitle2) demoCardTitle2.textContent=d.demoCardTitle2;
    var demoCaptionLeft=$('demoCaptionLeft');
    if(demoCaptionLeft) demoCaptionLeft.textContent=d.demoCaptionLeft;
    var demoCaptionRight=$('demoCaptionRight');
    if(demoCaptionRight) demoCaptionRight.textContent=d.demoCaptionRight;
    var quickTipsTitle=$('quickTipsTitle');
    if(quickTipsTitle) quickTipsTitle.textContent=d.quickTipsTitle;
    var quickTipsBody=$('quickTipsBody');
    if(quickTipsBody) quickTipsBody.textContent=d.quickTipsBody;
    var replayWelcome=$('btnReplayWelcome');
    if(replayWelcome) replayWelcome.textContent=d.replayWelcome;
    var welcomePathLabel=$('welcomePathLabel');
    if(welcomePathLabel) welcomePathLabel.textContent=d.welcomePathLabel;
    var debugTitle=$('debugTitle');
    if(debugTitle) debugTitle.textContent=d.debugTitle;
    var debugKeyLabel=$('debugKeyLabel');
    if(debugKeyLabel) debugKeyLabel.textContent=d.debugKeyLabel;
    var debugCodeLabel=$('debugCodeLabel');
    if(debugCodeLabel) debugCodeLabel.textContent=d.debugCodeLabel;
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
    if(global.OneToneSettingsDrawer&&global.OneToneSettingsDrawer.syncHeaderBtn){
      global.OneToneSettingsDrawer.syncHeaderBtn();
    }else{
      var btnLabel=$('btnSettingsLabel');
      if(btnLabel) btnLabel.textContent=hooks().ui().drawerOpen?hooks().t('homeNavTitle'):hooks().t('settingsTitle');
    }
    var settingsTitle=$('settingsTitle'); if(settingsTitle) settingsTitle.textContent=d.settingsTitle;
    $('mappingListTitle').textContent=d.mappingListTitle;
    var listHint=$('mappingListHint');
    if(listHint) listHint.textContent=d.mappingListHint;
    var cycleTitle=$('cycleSwitchTitle');
    if(cycleTitle) cycleTitle.textContent=d.cycleSwitchTitle;
    var cycleDesc=$('cycleSwitchDesc');
    if(cycleDesc) cycleDesc.textContent=d.cycleSwitchDesc;
    $('btnAddMapping').textContent=d.addMapping;
    $('btnCancelRecord').textContent=d.cancelRecord;
    var wakeCardTitle=$('wakeCardTitle'); if(wakeCardTitle) wakeCardTitle.textContent=d.wakeCardTitle;
    hooks().applyHomeLiveLang();
    if(global.OneToneOnboarding) global.OneToneOnboarding.applyLang();
    if(global.OneTonePhrasePractice) global.OneTonePhrasePractice.applyLang();
  }

  global.OneToneAppLangCore={applyCoreTexts:applyCoreTexts};
})((typeof window!=='undefined')?window:globalThis);
