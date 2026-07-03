(function(global){
  'use strict';

  var $=function(id){ return global.OneToneDom.$(id); };
  var invoke=global.OneToneIpc.invoke;
  function t(key){ return global.OneToneI18n.t(key); }
  function toast(msg,kind){ return global.OneToneAppToast.show(msg,kind); }

  function syncToggle(enabled){
    var btn=$('btnAutostart');
    if(!btn) return;
    btn.classList.toggle('is-on',!!enabled);
    btn.setAttribute('aria-checked',enabled?'true':'false');
  }

  function loadState(){
    invoke('cmd_autostart_get',{}).then(function(enabled){
      syncToggle(!!enabled);
    }).catch(function(){ syncToggle(false); });
  }

  function toggle(){
    var btn=$('btnAutostart');
    var next=!btn.classList.contains('is-on');
    syncToggle(next);
    invoke('cmd_autostart_set',{enabled:next}).then(function(){
      syncToggle(next);
    }).catch(function(err){
      loadState();
      toast(t('autostartFail'));
      console.error('autostart',err);
    });
  }

  global.OneToneAppAutostart={
    syncToggle:syncToggle,
    loadState:loadState,
    toggle:toggle
  };
})((typeof window!=='undefined')?window:globalThis);
