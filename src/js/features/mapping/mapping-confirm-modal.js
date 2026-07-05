(function(global){
  'use strict';

  var $=function(id){ return global.OneToneDom.$(id); };
  var confirmResolve=null;

  function openConfirmModal(message){
    return new Promise(function(resolve){
      confirmResolve=resolve;
      var msgEl=$('confirmBody')||$('confirmMessage');
      if(msgEl) msgEl.textContent=String(message||'');
      var overlay=$('confirmOverlay');
      if(overlay){
        overlay.classList.add('open');
        overlay.setAttribute('aria-hidden','false');
      }
    });
  }

  function closeConfirmModal(ok){
    var overlay=$('confirmOverlay');
    if(overlay){
      overlay.classList.remove('open');
      overlay.setAttribute('aria-hidden','true');
    }
    if(confirmResolve){
      var fn=confirmResolve;
      confirmResolve=null;
      fn(!!ok);
    }
  }

  global.OneToneMappingConfirmModal={
    open:openConfirmModal,
    close:closeConfirmModal
  };
})((typeof window!=='undefined')?window:globalThis);
