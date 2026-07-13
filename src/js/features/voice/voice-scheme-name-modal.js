(function(global){
  'use strict';

  var $=function(id){ return global.OneToneDom.$(id); };
  var t=function(key){ return global.OneToneI18n.t(key); };
  var resolveFn=null;
  var bound=false;

  function isDesktopApp(){
    if(global.__TAURI__||global.__TAURI_INTERNALS__) return true;
    if(global.OneToneIpc&&typeof global.OneToneIpc.invoke==='function') return true;
    try{
      if(typeof location!=='undefined'&&String(location.hostname||'').toLowerCase()==='tauri.localhost') return true;
    }catch(_){}
    return false;
  }

  function close(result){
    var overlay=$('voiceSchemeNameOverlay');
    if(overlay){
      overlay.classList.remove('open');
      overlay.setAttribute('aria-hidden','true');
    }
    if(resolveFn){
      var fn=resolveFn;
      resolveFn=null;
      fn(result);
    }
  }

  function submitName(){
    var input=$('voiceSchemeNameInput');
    var val=input?String(input.value||'').trim():'';
    close(val||null);
  }

  function open(promptText, defaultName){
    defaultName=String(defaultName||'').trim();
    if(!isDesktopApp()){
      if(typeof window.prompt!=='function') return Promise.resolve(defaultName);
      var prompted=window.prompt(String(promptText||''),defaultName);
      if(prompted===null) return Promise.resolve(null);
      return Promise.resolve(String(prompted||'').trim()||defaultName);
    }
    return new Promise(function(resolve){
      resolveFn=resolve;
      var title=$('voiceSchemeNameTitle');
      var input=$('voiceSchemeNameInput');
      if(title) title.textContent=String(promptText||'');
      if(input){
        input.value=defaultName;
      }
      var overlay=$('voiceSchemeNameOverlay');
      if(!overlay){
        resolve(defaultName);
        return;
      }
      overlay.classList.add('open');
      overlay.setAttribute('aria-hidden','false');
      if(input){
        setTimeout(function(){
          input.focus();
          input.select();
        },0);
      }
    });
  }

  function bindEvents(){
    if(bound) return;
    bound=true;
    var ok=$('btnVoiceSchemeNameOk');
    var cancel=$('btnVoiceSchemeNameCancel');
    var overlay=$('voiceSchemeNameOverlay');
    var input=$('voiceSchemeNameInput');
    if(ok) ok.onclick=function(e){ e.preventDefault(); submitName(); };
    if(cancel) cancel.onclick=function(e){ e.preventDefault(); close(null); };
    if(overlay){
      overlay.addEventListener('click',function(e){
        if(e.target===overlay) close(null);
      });
    }
    if(input){
      input.addEventListener('keydown',function(e){
        if(e.key==='Enter'){ e.preventDefault(); submitName(); }
        else if(e.key==='Escape'){ e.preventDefault(); close(null); }
      });
    }
    var okLbl=$('btnVoiceSchemeNameOk');
    var cancelLbl=$('btnVoiceSchemeNameCancel');
    if(okLbl) okLbl.textContent=t('confirmOk');
    if(cancelLbl) cancelLbl.textContent=t('confirmCancel');
  }

  global.OneToneVoiceSchemeNameModal={
    open:open,
    isDesktopApp:isDesktopApp,
    bindEvents:bindEvents
  };
})((typeof window!=='undefined')?window:globalThis);
