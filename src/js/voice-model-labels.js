(function(global){
  'use strict';

  var t=function(key){ return global.OneToneI18n.t(key); };

  function isEnglishPreset(preset){
    var p=String(preset||'').trim().toLowerCase();
    return p==='en-light'||p==='en'||p==='en-heavy'||p.indexOf('en')===0;
  }

  function presetLabel(preset){
    return isEnglishPreset(preset)?t('voiceVoskPresetEn'):t('voiceVoskPresetCn');
  }

  function syncPresetButtons(){
    var host=global.OneToneDom&&global.OneToneDom.$?global.OneToneDom.$('voiceVoskModelPreset'):null;
    if(!host) return;
    host.querySelectorAll('[data-preset]').forEach(function(btn){
      var preset=btn.getAttribute('data-preset')||'';
      btn.textContent=presetLabel(preset);
    });
    var cn=global.OneToneDom.$('modelsVoskCn');
    var en=global.OneToneDom.$('modelsVoskEn');
    if(cn) cn.textContent=presetLabel('cn-light');
    if(en) en.textContent=presetLabel('en-light');
  }

  global.OneToneVoiceModelLabels={
    isEnglishPreset:isEnglishPreset,
    presetLabel:presetLabel,
    syncPresetButtons:syncPresetButtons
  };
})(typeof window!=='undefined'?window:globalThis);
