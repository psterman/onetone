(function(global){
  'use strict';
  function hooks(){ return global.__vp_render_hooks__ || {}; }

  var scheduled=false;
  var rendering=false;
  var dirty=false;
  var pendingReasons=[];
  var rafId=0;

  function renderHeroBadges(){
    hooks().applyKeyWakeRecordingUi();
  }

  function pushReason(reason){
    if(!reason) return;
    var r=String(reason);
    if(pendingReasons.indexOf(r)<0) pendingReasons.push(r);
    if(pendingReasons.length>8) pendingReasons.length=8;
  }

  function takeReasons(){
    var out=pendingReasons.join(',');
    pendingReasons.length=0;
    return out;
  }

  function runRenderBody(reasonStr){
    var h=hooks();
    var tag='render:'+(reasonStr||'now');
    if(global.OneToneUiHeartbeat&&global.OneToneUiHeartbeat.setTag){
      try{ global.OneToneUiHeartbeat.setTag(tag); }catch(_){}
    }
    try{
      const renderStarted=performance.now();
      const ui=global.OneToneState.ui;
      if(h.mappingListUiActive()) h.renderMappingChrome();
      else if(ui.drawerOpen&&ui.settingsPanel==='debug'&&global.OneToneVoiceDiag&&global.OneToneVoiceDiag.getFocusMode()==='repair') h.renderTrashList();
      h.renderEditor();
      h.renderRecordCancelBar();
      // Sounds / Soft Pad settings must not sync on the render hot path — rewriting
      // controls (or building pickers) here 假死 clicks. Sync on panel open / prefs change.
      if(ui.drawerOpen&&ui.settingsPanel==='debug'){
        if(global.OneToneVoiceDiag.getFocusMode()==='developer') h.renderDebugDeveloperPanel();
        else h.scheduleDebugChromeRefresh();
      }
      if(ui.drawerOpen&&global.OneToneSettingsDrawer&&(global.OneToneSettingsDrawer.isKeysPanel()||global.OneToneSettingsDrawer.isHabitsPanel())) h.renderKeyFinishFlowPanel();
      h.renderVoiceModeSwitch();
      // Phase1c：home 轻守卫 — 签名未变则跳过整树 renderHome（未来岛/低重绘）
      if(!(h.shouldSkipHomeRender&&h.shouldSkipHomeRender())){
        h.renderHome();
      }
      h.renderListenRuntime();
      h.renderUpdateUi();
      const elapsed=Math.round(performance.now()-renderStarted);
      if(elapsed>250) h.frontendLog('render slow '+elapsed+'ms reason='+(reasonStr||'now'));
    }finally{
      if(global.OneToneUiHeartbeat&&global.OneToneUiHeartbeat.clearTag){
        try{ global.OneToneUiHeartbeat.clearTag(tag); }catch(_){}
      }
    }
  }

  function flush(){
    scheduled=false;
    rafId=0;
    if(rendering){
      dirty=true;
      return;
    }
    rendering=true;
    dirty=false;
    var reasonStr=takeReasons();
    try{
      runRenderBody(reasonStr);
    }catch(err){
      console.error('render',err);
    }finally{
      rendering=false;
      if(dirty){
        dirty=false;
        schedule('dirty');
      }
    }
  }

  function schedule(reason){
    pushReason(reason||'schedule');
    if(rendering){
      dirty=true;
      return;
    }
    if(scheduled) return;
    scheduled=true;
    rafId=global.requestAnimationFrame?global.requestAnimationFrame(function(){
      flush();
    }):0;
    if(!global.requestAnimationFrame){
      // ponytail: no RAF (tests/SSR) — next tick once
      setTimeout(flush,0);
    }
  }

  /** Sync paint — only boot / must-read-DOM paths. Prefer schedule(reason). */
  function renderNow(reason){
    pushReason(reason||'now');
    if(rendering){
      dirty=true;
      return;
    }
    if(scheduled&&rafId&&global.cancelAnimationFrame){
      try{ global.cancelAnimationFrame(rafId); }catch(_){}
      rafId=0;
      scheduled=false;
    }
    flush();
  }

  // Back-compat: legacy render() = renderNow
  function render(){ return renderNow('legacy'); }

  global.OneToneRender={
    schedule:schedule,
    renderNow:renderNow,
    render:render,
    renderHeroBadges:renderHeroBadges
  };
})((typeof window!=='undefined')?window:globalThis);
