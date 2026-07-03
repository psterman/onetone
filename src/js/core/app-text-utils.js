(function(global){
  'use strict';

  function escHtml(s){
    return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');
  }

  function cloneStringList(list){
    if(!Array.isArray(list)) return [];
    return list.map(function(x){ return String(x||'').trim(); }).filter(Boolean);
  }

  function sessionActiveState(raw){
    return ['dictating','stopping','committing'].indexOf(raw||'')>=0;
  }

  global.OneToneAppTextUtils={
    escHtml:escHtml,
    cloneStringList:cloneStringList,
    sessionActiveState:sessionActiveState
  };
})((typeof window!=='undefined')?window:globalThis);
