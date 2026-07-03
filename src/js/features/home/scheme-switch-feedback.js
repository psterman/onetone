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
      state.selectedMappingId=toId;
      hooks.syncEditorFromSelection();
    }
    hooks.renderMappingList();
    hooks.renderEditor();
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
      hooks.render();
      hooks.toast(msg,'scheme');
    }
    notifyIfBackground(msg);
  }

  global.OneToneSchemeSwitchFeedback={
    show:show,
    ensureNotificationPermission:ensureNotificationPermission
  };
})((typeof window!=='undefined')?window:globalThis);
