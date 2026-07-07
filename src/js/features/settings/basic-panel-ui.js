(function(global){
  'use strict';

  var $=function(id){ return global.OneToneDom.$(id); };
  function t(key){ return global.OneToneI18n.t(key); }

  function fontScaleKey(scale){
    var map={
      sm:'fontSizeSmaller',
      md:'fontSizeStandard',
      lg:'fontSizeLarger',
      xl:'fontSizeXL'
    };
    return map[scale]||map.md;
  }

  function currentFontScale(){
    return document.documentElement.getAttribute('data-font-scale')||'md';
  }

  function currentThemeName(){
    var theme=document.documentElement.getAttribute('data-theme')||'light';
    return theme==='dark'?t('styleGraphiteName'):t('styleClearName');
  }

  function currentLangName(){
    return global.OneToneI18n.getLang()==='en'?t('langEn'):t('langZh');
  }

  function setText(id,value){
    var el=$(id);
    if(el) el.textContent=value;
  }

  function render(){
    var autostartOn=!!($('btnAutostart')&&$('btnAutostart').classList.contains('is-on'));
    var trayOn=!!($('btnStartMinimized')&&$('btnStartMinimized').classList.contains('is-on'));
    var fontKey=fontScaleKey(currentFontScale());

    setText('basicSummaryLaunchValue',autostartOn?t('basicSummaryLaunchAuto'):t('basicSummaryLaunchManual'));
    setText('basicSummaryWindowValue',trayOn?t('basicSummaryWindowTray'):t('basicSummaryWindowNormal'));
    setText('basicSummaryStyleValue',currentThemeName());
    setText('basicSummaryLanguageValue',currentLangName()+' · '+t(fontKey));
  }

  global.OneToneBasicPanelUi={
    render:render
  };
})((typeof window!=='undefined')?window:globalThis);
