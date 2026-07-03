(function(global){
  'use strict';
  const $=id=>document.getElementById(id);
  function setText(id,value){
    const el=$(id);
    if(el) el.textContent=value;
  }
  function frontendLog(line){
    try{ console.log('[onetone]',String(line||'')); }catch(_){}
  }
  function markBoot(label){
    frontendLog('boot '+label);
  }
  global.OneToneDom={$:$,setText:setText,log:frontendLog,markBoot:markBoot};
})((typeof window!=='undefined')?window:globalThis);
