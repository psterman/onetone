(function(global){
  'use strict';
  var $=function(id){ return global.OneToneDom.$(id); };
  function h(){ return global.__vp_bootstrap_hooks__ || {}; }
  function bindEvents(){
    var hooks=h();
    var state=global.OneToneState.state;
    var vpInvoke=hooks.vpInvoke;
    var debugOverviewActions=$('debugOverviewActions');
    if(debugOverviewActions){
      debugOverviewActions.addEventListener('click',function(e){
        var btn=e.target.closest&&e.target.closest('[data-debug-action]');
        if(!btn) return;
        var panel=btn.dataset.debugAction||'basic';
        var focus=btn.dataset.debugFocus||undefined;
        var debugMode=btn.dataset.debugMode||undefined;
        if(panel==='resume'){
          vpInvoke('cmd_resume',{}).catch(function(err){ console.error('resume',err); });
          return;
        }
        if(debugMode) hooks.setDebugFocusMode(debugMode);
        hooks.setSettingsPanel(panel);
        if(focus) hooks.focusSettingsField(focus);
      });
    }
    var btnDevClearLog=$('btnDevClearLog');
    if(btnDevClearLog){
      btnDevClearLog.onclick=function(){
        hooks.clearLogLines();
        hooks.renderDebugPanel();
      };
    }
    var btnDevExportLog=$('btnDevExportLog');
    if(btnDevExportLog){
      btnDevExportLog.onclick=function(){
        hooks.exportDiagnosticLogs();
      };
    }
    var btnAboutGitHub=$('btnAboutGitHub');
    if(btnAboutGitHub){
      btnAboutGitHub.onclick=function(){
        hooks.openExternalUrl(hooks.githubRepoUrl());
      };
    }
    var btnAboutCheckUpdate=$('btnAboutCheckUpdate');
    if(btnAboutCheckUpdate){
      btnAboutCheckUpdate.onclick=function(){
        var update=state.update||hooks.defaultUpdateState();
        if(update.phase==='available'){
          hooks.installAppUpdate();
        }else if(update.phase==='downloading'||update.phase==='installing'||update.phase==='restarting'){
          return;
        }else{
          hooks.checkForAppUpdate(true);
        }
      };
    }
  }
  global.OneToneDebugAboutBindings={bindEvents:bindEvents};
})((typeof window!=='undefined')?window:globalThis);
