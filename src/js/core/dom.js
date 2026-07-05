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
  global.OneToneDom={$:$,setText:setText,log:frontendLog,markBoot:markBoot};
})((typeof window!=='undefined')?window:globalThis);
