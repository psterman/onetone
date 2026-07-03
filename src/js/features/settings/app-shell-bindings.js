(function(global){
  'use strict';
  var $=function(id){ return global.OneToneDom.$(id); };
  function h(){ return global.__vp_bootstrap_hooks__ || {}; }
  function bindEvents(){
    var hooks=h();
    var state=global.OneToneState.state;
    var ui=global.OneToneState.ui;
    var t=hooks.t;
    var vpInvoke=hooks.vpInvoke;
    $('btnSettings').onclick=function(){
      if(hooks.isHomeFirstRunFocusMode()&&!ui.drawerOpen){
        if(window.OneToneOnboarding) window.OneToneOnboarding.open(true);
        return;
      }
      if(ui.drawerOpen) hooks.closeDrawer();
      else hooks.openSettings({panel:'basic'});
    };
    var btnUpdatePrimary=$('btnUpdatePrimary');
    if(btnUpdatePrimary){
      btnUpdatePrimary.onclick=function(){
        var update=state.update||hooks.defaultUpdateState();
        if(update.phase==='available') hooks.installAppUpdate();
        else if(update.phase==='error') hooks.checkForAppUpdate(true);
      };
    }
    var btnUpdateLater=$('btnUpdateLater');
    if(btnUpdateLater){
      btnUpdateLater.onclick=hooks.dismissAppUpdate;
    }
    var btnListenToggle=$('btnListenToggle');
    if(btnListenToggle) btnListenToggle.onclick=hooks.toggleGlobalListen;
    var headerListenState=$('headerListenState');
    if(headerListenState) headerListenState.onclick=hooks.toggleGlobalListen;
    var btnRefreshRuntime=$('btnRefreshRuntime');
    if(btnRefreshRuntime){
      btnRefreshRuntime.onclick=function(){
        vpInvoke('cmd_request_runtime',{}).then(function(){
          hooks.toast(t('runtimeRefreshed'));
        }).catch(function(err){
          console.error('request_runtime',err);
        });
      };
    }
    var btnRestartApp=$('btnRestartApp');
    if(btnRestartApp){
      btnRestartApp.onclick=function(){
        if(!confirm(t('restartConfirm'))) return;
        vpInvoke('cmd_reload_latest',{}).catch(function(err){
          console.error('reload_latest',err);
        });
      };
    }
  }
  global.OneToneAppShellBindings={bindEvents:bindEvents};
})((typeof window!=='undefined')?window:globalThis);
