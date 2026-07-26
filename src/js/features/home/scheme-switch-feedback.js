(function(global){
  'use strict';
  function h(){ return global.__vp_scheme_switch_feedback_hooks__ || {}; }
  var flashTimer=null;
  var notificationPermissionAsked=false;

  function ensureNotificationPermission(){
    if(notificationPermissionAsked||!window.Notification) return;
    if(Notification.permission!=='default') return;
    notificationPermissionAsked=true;
    Notification.requestPermission().catch(function(){});
  }

  function notifyIfBackground(msg){
    if(document.visibilityState==='visible'&&document.hasFocus()) return;
    try{
      if(!window.Notification||Notification.permission!=='granted') return;
      new Notification(h().t('appTitle')||'一声',{body:msg,silent:true});
    }catch(_){}
  }

  function show(toId, label){
    var hooks=h();
    var state=global.OneToneState.state;
    var t=hooks.t;
    var msg=t('schemeSwitched')+(label||'');
    if(toId){
      // Runtime in-use only — never drag editing selection or remount the editor form.
      if(state.config) state.config.activeSceneId=toId;
    }
    hooks.renderMappingList();
    if(global.OneToneSceneTabs) global.OneToneSceneTabs.render();
    if(global.OneToneHabitChannelStatusStrip&&global.OneToneHabitChannelStatusStrip.render){
      try{ global.OneToneHabitChannelStatusStrip.render(); }catch(_){}
    }
    // Prefer workbench refresh (scenario rail / howto) over legacy live-zone only.
    if(global.OneToneHomeWorkbench&&global.OneToneHomeWorkbench.render){
      try{ global.OneToneHomeWorkbench.render(); }catch(_){}
    }
    if(toId){
      requestAnimationFrame(function(){
        var row=document.querySelector('.map-row[data-id="'+toId+'"]');
        if(row){
          row.classList.remove('is-switch-flash');
          void row.offsetWidth;
          row.classList.add('is-switch-flash');
          row.scrollIntoView({block:'nearest',behavior:'smooth'});
          clearTimeout(flashTimer);
          flashTimer=setTimeout(function(){ row.classList.remove('is-switch-flash'); },1200);
        }
        hooks.toast(msg,'scheme');
      });
    }else{
      hooks.toast(msg,'scheme');
    }
    notifyIfBackground(msg);
    refreshVoiceAfterSceneSwitch();
  }

  function refreshVoiceAfterSceneSwitch(){
    var wake=global.OneToneVoiceWake;
    var end=global.OneToneVoiceEnd;
    var hooks=h();
    if(wake){
      if(wake.loadSapiStatus) wake.loadSapiStatus();
      if(wake.loadVoskStatus) wake.loadVoskStatus();
      if(wake.renderModeSwitch) wake.renderModeSwitch();
    }
    if(end&&end.loadStatus) end.loadStatus();
    if(hooks.renderVoiceSettingsFlow) hooks.renderVoiceSettingsFlow();
    if(global.OneToneSceneModeHub&&global.OneToneSceneModeHub.render) global.OneToneSceneModeHub.render();
    if(hooks.renderHomeLiveZone) hooks.renderHomeLiveZone();
  }

  global.OneToneSchemeSwitchFeedback={
    show:show,
    ensureNotificationPermission:ensureNotificationPermission,
    refreshVoiceAfterSceneSwitch:refreshVoiceAfterSceneSwitch
  };
})((typeof window!=='undefined')?window:globalThis);
