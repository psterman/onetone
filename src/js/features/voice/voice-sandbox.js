(function(global){
  'use strict';
  var $=function(id){ return global.OneToneDom.$(id); };
  var t=function(key){ return global.OneToneI18n.t(key); };
  var bound=false;
  var draft='';

  function setText(msg,placeholder){
    var el=$('voiceSandboxText');
    if(!el) return;
    el.textContent=msg||t('voiceSandboxPlaceholder');
    el.classList.toggle('is-placeholder',!!placeholder||!msg);
  }

  function applyLabels(){
    var title=$('voiceSandboxTitle');
    if(title) title.textContent=t('voiceSandboxTitle');
    var desc=$('voiceSandboxDesc');
    if(desc) desc.textContent=t('voiceSandboxDesc');
    var boxLbl=$('voiceSandboxBoxLbl');
    if(boxLbl) boxLbl.textContent=t('voiceSandboxBoxLbl');
    var speak=$('btnVoiceSandboxSpeak');
    if(speak) speak.textContent=t('voiceSandboxSpeak');
    var cancel=$('btnVoiceSandboxCancel');
    if(cancel) cancel.textContent=t('voiceSandboxCancel');
    var confirm=$('btnVoiceSandboxConfirm');
    if(confirm) confirm.textContent=t('voiceSandboxConfirm');
    var real=$('btnVoiceSandboxReal');
    if(real) real.textContent=t('voiceSandboxRealTest');
    var close=$('btnVoiceSandboxClose');
    if(close) close.textContent=t('voiceSandboxClose');
    var open=$('btnVoiceSandboxOpen');
    if(open) open.textContent=t('voiceSandboxOpenBtn');
  }

  function close(){
    var overlay=$('voiceSandboxOverlay');
    if(!overlay) return;
    overlay.classList.remove('open');
    overlay.setAttribute('aria-hidden','true');
  }

  function open(){
    applyLabels();
    draft='';
    setText(t('voiceSandboxPlaceholder'),true);
    var overlay=$('voiceSandboxOverlay');
    if(!overlay) return;
    overlay.classList.add('open');
    overlay.setAttribute('aria-hidden','false');
    var speak=$('btnVoiceSandboxSpeak');
    if(speak) speak.focus();
  }

  function runRealSimulate(){
    var wake=global.OneToneVoiceWake;
    var eng=global.OneToneHomeLive&&global.OneToneHomeLive.voiceEngineOn
      ?global.OneToneHomeLive.voiceEngineOn()
      :'off';
    if(eng==='vosk'&&wake&&typeof wake.testVoskSend==='function'){
      wake.testVoskSend();
      setText(t('voiceSandboxSent'),false);
      return;
    }
    if(eng==='sapi'&&wake&&typeof wake.testSapiSend==='function'){
      wake.testSapiSend();
      setText(t('voiceSandboxSent'),false);
      return;
    }
    var asideSpeak=$('voiceFbBtnSimulateSpeak');
    if(asideSpeak&&typeof asideSpeak.click==='function'){
      asideSpeak.click();
      setText(t('voiceSandboxSent'),false);
      return;
    }
    setText(t('voiceSandboxSampleText'),false);
  }

  function onAct(act){
    if(act==='speak'){
      draft=t('voiceSandboxSampleText');
      setText(draft,false);
      return;
    }
    if(act==='cancel'){
      draft='';
      setText(t('voiceSandboxCleared'),false);
      return;
    }
    if(act==='confirm'){
      if(!draft) draft=t('voiceSandboxSampleText');
      setText(draft+' · '+t('voiceSandboxLocked'),false);
      return;
    }
    if(act==='real'){
      runRealSimulate();
    }
  }

  function bindEvents(){
    if(bound) return;
    bound=true;
    var openBtn=$('btnVoiceSandboxOpen');
    if(openBtn) openBtn.onclick=function(e){ e.preventDefault(); open(); };
    var closeBtn=$('btnVoiceSandboxClose');
    if(closeBtn) closeBtn.onclick=function(e){ e.preventDefault(); close(); };
    var closeX=$('btnVoiceSandboxCloseX');
    if(closeX) closeX.onclick=function(e){ e.preventDefault(); close(); };
    var overlay=$('voiceSandboxOverlay');
    if(overlay){
      overlay.addEventListener('click',function(e){
        if(e.target===overlay) close();
      });
      overlay.addEventListener('click',function(e){
        var btn=e.target.closest&&e.target.closest('[data-sandbox-act]');
        if(!btn) return;
        e.preventDefault();
        onAct(btn.getAttribute('data-sandbox-act')||'');
      });
    }
    document.addEventListener('keydown',function(e){
      if(e.key!=='Escape') return;
      var ov=$('voiceSandboxOverlay');
      if(ov&&ov.classList.contains('open')) close();
    });
  }

  bindEvents();

  global.OneToneVoiceSandbox={
    open:open,
    close:close,
    applyLabels:applyLabels,
    bindEvents:bindEvents
  };
})((typeof window!=='undefined')?window:globalThis);
