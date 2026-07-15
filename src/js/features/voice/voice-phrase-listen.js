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

  /** Prefer a known cancel/end/send chip when listen-fill captures a long utterance. */
  function preferConfiguredPhrase(text,inputId){
    text=String(text||'').trim();
    if(!text||!global.OneToneVoiceEnd) return text;
    var lists=null;
    if(inputId==='voiceCancelCustomInput'&&global.OneToneVoiceEnd.currentCancelPhraseLists){
      lists=global.OneToneVoiceEnd.currentCancelPhraseLists();
    }else if(inputId==='voiceEndCustomInput'&&global.OneToneVoiceEnd.currentEndPhraseLists){
      lists=global.OneToneVoiceEnd.currentEndPhraseLists();
    }else if(inputId==='voiceSendCustomInput'&&global.OneToneVoiceEnd.currentSendPhraseLists){
      lists=global.OneToneVoiceEnd.currentSendPhraseLists();
    }
    if(!lists) return text;
    var pool=[].concat(lists.zh||[],lists.en||[]);
    var norm=function(s){ return String(s||'').replace(/[^\u4e00-\u9fffA-Za-z0-9]/g,'').toLowerCase(); };
    var hay=norm(text);
    var best='';
    pool.forEach(function(p){
      var n=norm(p);
      if(!n||hay.indexOf(n)<0) return;
      if(n.length>best.length) best=String(p||'').trim();
    });
    return best||text;
  }

  function fillHeardIntoInput(input,text,inputId){
    if(!input||!text) return '';
    var next=preferConfiguredPhrase(text,inputId);
    input.value=next;
    input.focus();
    input.select&&input.select();
    return next;
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
    fillHeardIntoInput(input,text,inputId);
    hooks().toast&&hooks().toast(t('voicePhraseListenFilled'));
    return input.value;
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
          fillHeardIntoInput(input,text,inputId);
          setListenBtnBusy(btn,false);
          hooks().toast&&hooks().toast(t('voicePhraseListenFilled'));
          resolve(input.value);
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
