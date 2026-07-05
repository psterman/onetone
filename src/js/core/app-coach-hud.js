(function(global){
  'use strict';

  var $=function(id){ return global.OneToneDom.$(id); };
  var invoke=global.OneToneIpc.invoke;
  function t(key){ return global.OneToneI18n.t(key); }
  function toast(msg,kind){ return global.OneToneAppToast.show(msg,kind); }

  function syncToggle(enabled){
    var btn=$('btnCoachHud');
    if(!btn) return;
    btn.classList.toggle('is-on',!!enabled);
    btn.setAttribute('aria-checked',enabled?'true':'false');
  }

  function loadState(){
    var cfg=global.OneToneState&&global.OneToneState.state&&global.OneToneState.state.config;
    syncToggle(!!(cfg&&cfg.coachHudEnabled));
  }

  function toggle(){
    var btn=$('btnCoachHud');
    if(!btn) return;
    var st=global.OneToneState&&global.OneToneState.state;
    if(!st||!st.config) return;
    var next=!btn.classList.contains('is-on');
    syncToggle(next);
    st.config.coachHudEnabled=next;
    invoke('cmd_coach_hud_set_enabled',{enabled:next}).then(function(){
      syncToggle(next);
      if(st.config) st.config.coachHudEnabled=next;
    }).catch(function(err){
      var prev=!next;
      if(st.config) st.config.coachHudEnabled=prev;
      loadState();
      toast(t('coachHudFail'));
      console.error('coachHudEnabled',err);
    });
  }

  global.OneToneAppCoachHud={
    syncToggle:syncToggle,
    loadState:loadState,
    toggle:toggle
  };
})((typeof window!=='undefined')?window:globalThis);
