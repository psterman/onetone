(function(global){
  'use strict';
  var $=function(id){ return global.OneToneDom.$(id); };
  function h(){ return global.__vp_bootstrap_hooks__ || {}; }
  function bindEvents(){
    var hooks=h();
    document.querySelectorAll('[data-theme-pick]').forEach(function(btn){
      btn.addEventListener('mousedown',function(e){ if(e.button===0) e.preventDefault(); });
      btn.addEventListener('click',function(){ hooks.setTheme(btn.getAttribute('data-theme-pick')); });
    });
    document.querySelectorAll('[data-style-pick]').forEach(function(btn){
      btn.addEventListener('mousedown',function(e){ if(e.button===0) e.preventDefault(); });
      btn.addEventListener('click',function(){ hooks.setTheme(btn.getAttribute('data-style-pick')); });
    });
    document.querySelectorAll('[data-lang-pick]').forEach(function(btn){
      btn.addEventListener('mousedown',function(e){ if(e.button===0) e.preventDefault(); });
      btn.addEventListener('click',function(){
        var next=btn.getAttribute('data-lang-pick');
        if(next&&next!==hooks.getAppLang()){ hooks.setAppLang(next); hooks.applyLang(); }
      });
    });
    document.querySelectorAll('.pref-segmented-btn[data-scale]').forEach(function(btn){
      btn.addEventListener('mousedown',function(e){ if(e.button===0) e.preventDefault(); });
      btn.addEventListener('click',function(){ hooks.setFontScale(btn.getAttribute('data-scale')); });
    });
    $('btnAutostart').onclick=hooks.toggleAutostart;
    var btnStartMinimized=$('btnStartMinimized');
    if(btnStartMinimized) btnStartMinimized.onclick=hooks.toggleStartMinimized;
    $('btnSoundsMaster').onclick=hooks.toggleSoundsMaster;
    var btnRecordingAudioMute=$('btnRecordingAudioMute');
    if(btnRecordingAudioMute) btnRecordingAudioMute.onclick=function(){
      hooks.setRecordingAudioMuteEnabled(!btnRecordingAudioMute.classList.contains('is-on'));
    };
    document.querySelectorAll('[data-recording-mute-strength]').forEach(function(btn){
      btn.addEventListener('mousedown',function(e){ if(e.button===0) e.preventDefault(); });
      btn.addEventListener('click',function(){
        var strength=btn.getAttribute('data-recording-mute-strength');
        if(!strength) return;
        hooks.setRecordingAudioStrength(strength);
      });
    });
    document.querySelectorAll('.sound-slot-toggle').forEach(function(btn){
      btn.onclick=function(){
        var slot=btn.getAttribute('data-slot');
        if(!slot) return;
        hooks.setSoundSlotEnabled(slot,!btn.classList.contains('is-on'));
      };
    });
    document.querySelectorAll('.sound-slot-select').forEach(function(sel){
      sel.onchange=function(){
        var slot=sel.getAttribute('data-slot');
        if(!slot) return;
        hooks.setSoundSlotId(slot,sel.value);
      };
    });
    document.querySelectorAll('.sound-slot-preview').forEach(function(btn){
      btn.onclick=function(){
        var slot=btn.getAttribute('data-slot');
        if(!slot) return;
        hooks.previewSoundSlot(slot);
      };
    });
  }
  global.OneToneAppPrefsBindings={bindEvents:bindEvents};
})((typeof window!=='undefined')?window:globalThis);
