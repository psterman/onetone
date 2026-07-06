(function(global){
  'use strict';

  var state=function(){ return global.OneToneState.state; };
  var ui=function(){ return global.OneToneState.ui; };
  function t(key){ return global.OneToneI18n.t(key); }
  function toast(msg,kind){ return global.OneToneAppToast.show(msg,kind); }

  function setMappingEnabled(id,enabled){
    var m=global.OneToneMappingCore.byId(id);
    if(!m) return;
    m.enabled=!!enabled;
    global.OneToneConfigPersist.save();
    try{
      window.chrome?.webview?.postMessage({type:'mvp_mapping_toggle',id:id,enabled:!!enabled});
    }catch(_){}
    global.OneToneRender.render();
  }

  function removeMappingSwitchKey(mappingId,idx){
    var cfg=state().config;
    if(!cfg||!Array.isArray(cfg.mappings)) return;
    var m=cfg.mappings.find(function(x){ return x.id===mappingId; });
    if(!m||!Array.isArray(m.switchKeys)) return;
    m.switchKeys.splice(idx,1);
    global.OneToneConfigPersist.save();
    global.OneToneMappingList.renderList();
    toast(t('switchKeysRemoved'));
  }

  function updateMappingTiming(id,field,value,skipRender){
    var cfg=state().config;
    if(!cfg||!Array.isArray(cfg.mappings)) return;
    var m=cfg.mappings.find(function(x){ return x.id===id; });
    if(!m) return;
    m[field]=value;
    global.OneToneKeyFinishFlowRender.scheduleTimingSave();
    if(skipRender) return;
    global.OneToneMappingList.renderList();
    if(ui().drawerOpen&&global.OneToneSettingsDrawer&&global.OneToneSettingsDrawer.isKeysPanel()){
      global.OneToneKeyFinishFlowRender.renderKeyFinishFlowPanel();
    }
  }

  global.OneToneMappingEditActions={
    setMappingEnabled:setMappingEnabled,
    removeMappingSwitchKey:removeMappingSwitchKey,
    updateMappingTiming:updateMappingTiming
  };
})((typeof window!=='undefined')?window:globalThis);
