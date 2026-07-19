(function(global){
  'use strict';

  var $=function(id){ return global.OneToneDom.$(id); };
  var confirmResolve=null;
  var defaultTitle='';

  function t(key,fallback){
    if(global.OneToneI18n&&global.OneToneI18n.t){
      var v=global.OneToneI18n.t(key);
      if(v&&v!==key) return v;
    }
    return fallback!=null?fallback:key;
  }

  function openConfirmModal(message,opts){
    opts=opts&&typeof opts==='object'?opts:{};
    return new Promise(function(resolve){
      confirmResolve=resolve;
      var titleEl=$('confirmTitle');
      if(titleEl){
        if(!defaultTitle) defaultTitle=titleEl.textContent||t('confirmDialogTitle','确认操作');
        titleEl.textContent=opts.title||defaultTitle||t('confirmDialogTitle','确认操作');
      }
      var msgEl=$('confirmBody')||$('confirmMessage');
      if(msgEl){
        msgEl.textContent=String(message||'');
        msgEl.classList.toggle('is-multiline',String(message||'').indexOf('\n')>=0);
      }
      var alt=$('btnConfirmAlt');
      if(alt) alt.hidden=true;
      var overlay=$('confirmOverlay');
      if(overlay){
        overlay.classList.add('open');
        overlay.setAttribute('aria-hidden','false');
      }
      var okBtn=$('btnConfirmOk');
      if(okBtn&&okBtn.focus){
        try{ okBtn.focus(); }catch(_){}
      }
    });
  }

  function closeConfirmModal(ok){
    var overlay=$('confirmOverlay');
    if(overlay){
      overlay.classList.remove('open');
      overlay.setAttribute('aria-hidden','true');
    }
    var titleEl=$('confirmTitle');
    if(titleEl&&defaultTitle) titleEl.textContent=defaultTitle;
    var msgEl=$('confirmBody')||$('confirmMessage');
    if(msgEl) msgEl.classList.remove('is-multiline');
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
