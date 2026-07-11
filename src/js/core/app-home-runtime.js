(function(global){
  'use strict';
  var $=function(id){ return global.OneToneDom.$(id); };
  function hooks(){ return global.__vp_app_home_runtime_hooks__ || {}; }

  var runtimeRenderTimer=0;

  (function startUiHeartbeat(){
    var last=Date.now();
    setInterval(function(){
      var now=Date.now();
      var lag=now-last-1000;
      if(lag>2500) hooks().frontendLog('ui heartbeat lag '+Math.round(lag)+'ms');
      last=now;
    },1000);
  })();

  function isFirstSuccessDone(){
    try{ return localStorage.getItem('vp_first_success_done')==='1'; }catch(_){ return false; }
  }

  function markFirstSuccessDone(){
    hooks().state().firstSuccess=true;
    try{ localStorage.setItem('vp_first_success_done','1'); }catch(_){}
    hooks().renderUpdateUi();
    hooks().renderHome();
  }

  function isHomeAdvancedUnlocked(){
    if(hooks().state().firstSuccess||isFirstSuccessDone()) return true;
    if(global.OneToneOnboarding&&global.OneToneOnboarding.isV2Done&&global.OneToneOnboarding.isV2Done()) return true;
    try{ return localStorage.getItem('vp_onboarding_v2_done')==='1'; }catch(_){ return false; }
  }

  function isHomeFirstRunFocusMode(){
    return !isHomeAdvancedUnlocked();
  }

  function getHomeEntryMode(){
    try{
      var v=localStorage.getItem('vp_entry_mode');
      if(v==='keys'||v==='voice'||v==='both') return v;
    }catch(_){}
    return 'both';
  }

  function toggleGlobalListen(){
    var runtime=hooks().runtime();
    var basicToggle=$('btnBasicGlobalListen');
    if(basicToggle) basicToggle.classList.add('is-busy');
    hooks().vpInvoke(runtime.paused?'cmd_resume':'cmd_pause',{}).catch(function(err){
      console.error('pause/resume',err);
      var msg=err&&err.message?String(err.message).trim():'';
      hooks().toast(msg||hooks().t('listenPause'));
    }).finally(function(){
      if(basicToggle) basicToggle.classList.remove('is-busy');
    });
  }

  function syncGlobalMasterUi(){
    var runtime=hooks().runtime();
    var grid=$('homeMainGrid');
    var paused=!!runtime.paused;
    if(grid) grid.classList.toggle('is-global-disabled',paused);
    var headerListen=$('headerListenState');
    if(headerListen) headerListen.hidden=true;
    var basicToggle=$('btnBasicGlobalListen');
    if(basicToggle){
      var on=!paused;
      basicToggle.classList.toggle('is-on',on);
      basicToggle.setAttribute('aria-checked',on?'true':'false');
    }
  }

  function renderListenRuntime(){
    var runtime=hooks().runtime();
    var listenState=$('listenState');
    if(listenState) listenState.textContent=runtime.paused?hooks().t('listenPaused'):hooks().t('listenOn');
    syncGlobalMasterUi();
    var liveAction=$('liveAction');
    if(liveAction) liveAction.textContent=runtime.lastAction||'-';
    var liveTimer=$('liveTimer');
    if(liveTimer) liveTimer.textContent=runtime.timerActive?'⏳':'-';
  }

  function isVoiceWakeRuntimeAction(action){
    var a=String(action||'');
    return a==='voice_vosk'||a==='voice_sapi'||a.indexOf('voice_')===0;
  }

  function scheduleRuntimeRender(){
    if(runtimeRenderTimer) return;
    var ui=hooks().ui();
    runtimeRenderTimer=setTimeout(function(){
      runtimeRenderTimer=0;
      renderListenRuntime();
      if(ui.drawerOpen){
        if(global.OneToneSettingsDrawer&&(global.OneToneSettingsDrawer.isKeysPanel(ui.settingsPanel)||global.OneToneSettingsDrawer.isHabitsPanel(ui.settingsPanel))) hooks().renderKeyFinishFlowPanel();
        else if(ui.settingsPanel==='debug') hooks().scheduleDebugChromeRefresh();
        else if(ui.settingsPanel==='sounds') hooks().renderSoundSettingsPanel();
      }else{
        hooks().renderHomeLiveZone();
      }
    },150);
  }

  global.__vp_isHomeFirstRunFocusMode__=isHomeFirstRunFocusMode;

  function registerHooks(deps){
    global.__vp_app_home_runtime_hooks__=deps;
  }

  global.OneToneAppHomeRuntimeHooks={register:registerHooks};
  global.OneToneAppHomeRuntime={
    isFirstSuccessDone:isFirstSuccessDone,
    markFirstSuccessDone:markFirstSuccessDone,
    isHomeAdvancedUnlocked:isHomeAdvancedUnlocked,
    isHomeFirstRunFocusMode:isHomeFirstRunFocusMode,
    getHomeEntryMode:getHomeEntryMode,
    toggleGlobalListen:toggleGlobalListen,
    syncGlobalMasterUi:syncGlobalMasterUi,
    renderListenRuntime:renderListenRuntime,
    isVoiceWakeRuntimeAction:isVoiceWakeRuntimeAction,
    scheduleRuntimeRender:scheduleRuntimeRender
  };
})((typeof window!=='undefined')?window:globalThis);
