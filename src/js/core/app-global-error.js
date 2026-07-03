(function(global){
  'use strict';
  var $=function(id){ return global.OneToneDom.$(id); };
  var logLines=[];
  function hooks(){ return global.__vp_app_global_error_hooks__ || {}; }

  function pushLog(line){
    logLines.unshift(line);
    logLines.length=Math.min(logLines.length,80);
    var h=hooks();
    var ui=global.OneToneState.ui;
    var t=h.t||function(key){ return global.OneToneI18n.t(key); };
    if(ui.drawerOpen&&ui.settingsPanel==='debug'){
      if(global.OneToneVoiceDiag.getFocusMode()==='developer') h.renderDebugDeveloperPanel();
      else h.renderSettingsDebugSubnav();
    }else{
      var el=$('rawEventLog');
      if(el) el.textContent=logLines.length?logLines.join('\n'):t('waitLog');
    }
  }

  function logGlobalError(kind,detail){
    try{
      var h=hooks();
      var t=h.t||function(key){ return global.OneToneI18n.t(key); };
      var line='['+kind+'] '+String(detail||'').slice(0,500);
      pushLog(line);
      console.error(line);
      try{ if(h.vpInvoke) h.vpInvoke('cmd_app_log',{line:line}).catch(function(){}); }catch(_){}
      var showToast=!global.OneToneErrorHandlers||global.OneToneErrorHandlers.shouldToast(kind,detail);
      if(!showToast) return;
      if(typeof h.toast==='function') h.toast(t('globalErrorToast'),'lite');
      else if(global.OneToneAppToast) global.OneToneAppToast.show(t('globalErrorToast'),'lite');
    }catch(err){
      console.error('logGlobalError failed',err);
    }
  }

  function clearLogLines(){
    logLines.length=0;
  }

  global.OneToneAppGlobalError={
    pushLog:pushLog,
    logGlobalError:logGlobalError,
    clearLogLines:clearLogLines,
    logLines:logLines
  };
})((typeof window!=='undefined')?window:globalThis);
