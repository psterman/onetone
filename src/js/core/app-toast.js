(function(global){
  'use strict';
  var $=function(id){ return global.OneToneDom.$(id); };
  function show(msg, kind){
    var el=$('toast');
    if(!el) return;
    el.textContent=msg;
    el.classList.toggle('toast-scheme', kind==='scheme');
    el.classList.toggle('toast-lite', kind==='lite');
    el.classList.add('show');
    clearTimeout(el._t);
    var ms=kind==='scheme'?1800:(kind==='lite'?1400:2200);
    el._t=setTimeout(function(){ el.classList.remove('show'); }, ms);
  }
  global.__vp_toast__=show;
  global.OneToneAppToast={show:show};
})((typeof window!=='undefined')?window:globalThis);
