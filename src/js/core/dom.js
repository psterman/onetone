(function(global){
  'use strict';
  const $=id=>document.getElementById(id);
  function setText(id,value){
    const el=$(id);
    if(el) el.textContent=value;
  }
  function frontendLog(line){
    const text=String(line||'');
    try{ console.log('[onetone]',text); }catch(_){}
    try{
      const ipc=global.OneToneIpc;
      if(ipc&&typeof ipc.invoke==='function'){
        ipc.invoke('cmd_app_log',{line:text}).catch(function(){});
        return;
      }
      const core=global.__TAURI__&&global.__TAURI__.core;
      if(core&&typeof core.invoke==='function') core.invoke('cmd_app_log',{line:text}).catch(function(){});
    }catch(_){}
  }
  function markBoot(label){
    frontendLog('boot '+label);
  }
  /**
   * Migration helper for non-button activators (role=button divs, etc.).
   * Prefer converting the element to <button type="button"> when possible.
   */
  function activateOnEnterSpace(el,fn){
    if(!el||typeof fn!=='function') return function(){};
    function onKey(e){
      if(!e) return;
      var key=e.key||e.code||'';
      var isEnter=key==='Enter';
      var isSpace=key===' '||key==='Spacebar'||key==='Space';
      if(!isEnter&&!isSpace) return;
      e.preventDefault();
      fn(e);
    }
    el.addEventListener('keydown',onKey);
    return function(){ el.removeEventListener('keydown',onKey); };
  }
  global.OneToneDom={$:$,setText:setText,log:frontendLog,markBoot:markBoot,activateOnEnterSpace:activateOnEnterSpace};
})((typeof window!=='undefined')?window:globalThis);
