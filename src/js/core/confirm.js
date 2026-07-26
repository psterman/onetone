(function(global){
  'use strict';

  /**
   * Shared confirm entry. Prefer in-app modal; fall back to window.confirm.
   * Message may be an i18n key or raw text. Extra opts: { title, fallback }.
   */
  function t(key,fallback){
    if(global.OneToneI18n&&global.OneToneI18n.t){
      var v=global.OneToneI18n.t(key);
      if(v&&v!==key) return v;
    }
    return fallback!=null?fallback:key;
  }

  function resolveMessage(messageKeyOrText,opts){
    opts=opts&&typeof opts==='object'?opts:{};
    var raw=String(messageKeyOrText==null?'':messageKeyOrText);
    if(!raw) return '';
    var viaI18n=t(raw,opts.fallback!=null?opts.fallback:raw);
    return viaI18n||raw;
  }

  function ask(messageKeyOrText,opts){
    opts=opts&&typeof opts==='object'?opts:{};
    var message=resolveMessage(messageKeyOrText,opts);
    var modal=global.OneToneMappingConfirmModal;
    if(modal&&typeof modal.open==='function'){
      return modal.open(message,{title:opts.title}).then(function(ok){ return !!ok; });
    }
    try{
      return Promise.resolve(!!global.confirm(message));
    }catch(_){
      return Promise.resolve(false);
    }
  }

  global.OneToneConfirm={ask:ask};
})((typeof window!=='undefined')?window:globalThis);
