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

  function resolveSwitchSource(){
    var act=global.OneToneSceneActivate;
    if(act&&typeof act.takePendingSwitchSource==='function'){
      return act.takePendingSwitchSource();
    }
    return 'manual';
  }

  function formatSwitchMessage(source,label){
    var t=h().t;
    var name=String(label||'').trim()||'—';
    if(source==='foreground'){
      var shortTpl=t('schemeSwitchedAuto')||'已自动使用「{name}」习惯。';
      return shortTpl.replace(/\{name\}/g,name);
    }
    var longTpl=t('schemeSwitchedHonest')
      ||'已使用「{name}」：按键、语音和摄像头动作已更新；Soft Pad 仍自动跟随。';
    return longTpl.replace(/\{name\}/g,name);
  }

  function show(toId, label){
    var hooks=h();
    var state=global.OneToneState.state;
    var source=resolveSwitchSource();
    var msg=formatSwitchMessage(source,label);
    if(toId){
      // Runtime in-use only — never drag editing selection or remount the editor form.
      if(state.config) state.config.activeSceneId=toId;
    }
    // Skip mapping-list remount on home — remounting editors on every scheme switch froze the UI.
    var drawerOpen=!!(state.ui&&state.ui.drawerOpen);
    if(drawerOpen&&hooks.renderMappingList) hooks.renderMappingList();
    if(global.OneToneSceneTabs) global.OneToneSceneTabs.render();
    if(global.OneToneHabitChannelStatusStrip&&global.OneToneHabitChannelStatusStrip.render){
      try{ global.OneToneHabitChannelStatusStrip.render(); }catch(_){}
    }
    // Prefer workbench refresh (scenario rail / howto) over legacy live-zone only.
    // Defer paint — sync full home render after scheme switch froze the UI on habit chips.
    if(global.OneToneHomeWorkbench){
      try{
        if(global.OneToneHomeWorkbench.forceHomeRender) global.OneToneHomeWorkbench.forceHomeRender();
        var wb=global.OneToneHomeWorkbench;
        requestAnimationFrame(function(){
          try{ if(wb&&wb.render) wb.render(); }catch(_){}
        });
      }catch(_){}
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
    // Foreground auto-switch: never push the long body as a system notification.
    if(source==='foreground'){
      var shortNote=formatSwitchMessage('foreground',label);
      notifyIfBackground(shortNote);
    }else{
      notifyIfBackground(msg);
    }
    // Home: skip voice status IPC + settings remount. Drawer still needs it.
    if(drawerOpen){
      requestAnimationFrame(function(){
        try{ refreshVoiceAfterSceneSwitch(); }catch(_){}
      });
    }
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
