(function(global){
  'use strict';

  var $=function(id){ return global.OneToneDom.$(id); };
  function t(key){ return global.OneToneI18n.t(key); }
  function toast(msg,kind){ return global.OneToneAppToast.show(msg,kind); }

  function syncToggle(enabled){
    var btn=$('btnStartMinimized');
    if(!btn) return;
    btn.classList.toggle('is-on',!!enabled);
    btn.setAttribute('aria-checked',enabled?'true':'false');
  }

  function loadState(){
    var cfg=global.OneToneState&&global.OneToneState.state&&global.OneToneState.state.config;
    syncToggle(!!(cfg&&cfg.startMinimizedToTray));
  }

  function toggle(){
    if(!global.OneToneConfigPersist) return;
    var st=global.OneToneState.state;
    if(!st.config) return;
    var next=!st.config.startMinimizedToTray;
    st.config.startMinimizedToTray=next;
    syncToggle(next);
    global.OneToneConfigPersist.saveAsync().then(function(){
      syncToggle(!!st.config.startMinimizedToTray);
      if(global.OneToneBasicPanelUi&&global.OneToneBasicPanelUi.render) global.OneToneBasicPanelUi.render();
    }).catch(function(err){
      st.config.startMinimizedToTray=!next;
      loadState();
      toast(t('startMinimizedFail'));
      console.error('startMinimizedToTray',err);
    });
  }

  global.OneToneAppStartMinimized={
    syncToggle:syncToggle,
    loadState:loadState,
    toggle:toggle
  };
})((typeof window!=='undefined')?window:globalThis);
