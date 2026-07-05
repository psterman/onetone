(function(global){
  'use strict';

  function state(){ return global.OneToneState.state; }
  function t(key){ return global.OneToneI18n.t(key); }
  function toast(msg,kind){ return global.OneToneAppToast.show(msg,kind); }

  function activeSceneId(){
    var cfg=state().config;
    return cfg&&cfg.activeSceneId?String(cfg.activeSceneId):'';
  }

  function isActiveScene(id){
    return !!id&&activeSceneId()===id;
  }

  function activateScene(id){
    if(!id) return;
    var cfg=state().config;
    if(!cfg) return;
    if(activeSceneId()===id) return;
    var core=global.OneToneMappingCore;
    var m=core&&core.byId?core.byId(id):null;
    if(!m||!core.isSaved(m)){
      toast(t('sceneActivateNeedComplete'),'warn');
      return;
    }
    try{
      global.chrome&&global.chrome.webview&&global.chrome.webview.postMessage({type:'mvp_scheme_select',mappingId:id});
    }catch(_){}
  }

  global.OneToneSceneActivate={
    activeSceneId:activeSceneId,
    isActiveScene:isActiveScene,
    activateScene:activateScene
  };
})((typeof window!=='undefined')?window:globalThis);
