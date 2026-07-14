(function(global){
  'use strict';

  var $=function(id){ return global.OneToneDom.$(id); };
  function t(key){ return global.OneToneI18n.t(key); }
  function hooks(){ return global.__vp_bootstrap_hooks__||{}; }

  function wakeSnapshot(){
    var h=global.__vp_bootstrap_hooks__||{};
    var raw=h.voiceUiSnapshot;
    if(typeof raw==='function') return raw()||{};
    if(raw&&raw.wake) return raw;
    var endHooks=global.__vp_voice_end_hooks__||{};
    raw=endHooks.voiceUiSnapshot;
    if(typeof raw==='function') return raw()||{};
    return raw||{};
  }

  function currentEngineRes(){
    var wake=wakeSnapshot().wake||{};
    var wakeApi=global.OneToneVoiceWake;
    var mode=wakeApi&&wakeApi.currentMode?wakeApi.currentMode():'off';
    if(mode==='vosk') return wake.vosk||null;
    if(mode==='sapi') return wake.sapi||null;
    return wake.vosk||wake.sapi||null;
  }

  function stripListeningSuffix(text){
    return String(text||'').replace(/（还在听…）\s*$/,'').replace(/\s*\(listening…\)\s*$/i,'').trim();
  }

  function pickHeardText(res){
    if(!res) return '';
    // Vosk: lastFinal/lastPartial; SAPI: lastHeard (no lastFinal field)
    var text=stripListeningSuffix(res.lastFinal||res.lastHeard||res.lastPartial||'');
    if(text) return text;
    var hit=String(res.lastDetectedPhrase||'').trim();
    return hit;
  }

  function heardFingerprint(res){
    if(!res) return '';
    return [
      res.lastFinal||'',
      res.lastHeard||'',
      res.lastPartial||'',
      res.lastDetectedPhrase||''
    ].join('\x1e');
  }

  function setListenBtnBusy(btn,busy){
    if(!btn) return;
    btn.classList.toggle('is-listening',!!busy);
    btn.disabled=!!busy;
    btn.setAttribute('aria-busy',busy?'true':'false');
  }

  function capturePhraseFromVoice(){
    var res=currentEngineRes();
    var text=pickHeardText(res);
    if(text) return text;
    var mode=global.OneToneVoiceWake&&global.OneToneVoiceWake.currentMode
      ?global.OneToneVoiceWake.currentMode():'off';
    if(mode==='off'){
      hooks().toast&&hooks().toast(t('voicePhraseListenNeedEngine'));
      return '';
    }
    hooks().toast&&hooks().toast(t('voicePhraseListenEmpty'));
    return '';
  }

  function fillInput(inputId){
    var input=$(inputId);
    if(!input) return '';
    var text=capturePhraseFromVoice();
    if(!text) return '';
    input.value=text;
    input.focus();
    input.select&&input.select();
    hooks().toast&&hooks().toast(t('voicePhraseListenFilled'));
    return text;
  }

  function fillInputAsync(inputId,btn){
    var input=$(inputId);
    if(!input) return Promise.resolve('');
    var mode=global.OneToneVoiceWake&&global.OneToneVoiceWake.currentMode
      ?global.OneToneVoiceWake.currentMode():'off';
    if(mode==='off'){
      hooks().toast&&hooks().toast(t('voicePhraseListenNeedEngine'));
      return Promise.resolve('');
    }
    var baseline=heardFingerprint(currentEngineRes());
    setListenBtnBusy(btn,true);
    hooks().toast&&hooks().toast(t('voicePhraseListenListening'));
    // SAPI/Vosk status is polled; give enough time for a final utterance.
    var deadline=Date.now()+8000;
    return new Promise(function(resolve){
      function tick(){
        var res=currentEngineRes();
        var fp=heardFingerprint(res);
        var text=pickHeardText(res);
        if(text&&fp!==baseline){
          input.value=text;
          input.focus();
          input.select&&input.select();
          setListenBtnBusy(btn,false);
          hooks().toast&&hooks().toast(t('voicePhraseListenFilled'));
          resolve(text);
          return;
        }
        if(Date.now()>=deadline){
          setListenBtnBusy(btn,false);
          hooks().toast&&hooks().toast(t('voicePhraseListenEmpty'));
          resolve('');
          return;
        }
        global.setTimeout(tick,180);
      }
      tick();
    });
  }

  global.OneToneVoicePhraseListen={
    capturePhraseFromVoice:capturePhraseFromVoice,
    fillInput:fillInput,
    fillInputAsync:fillInputAsync
  };
})((typeof window!=='undefined')?window:globalThis);
