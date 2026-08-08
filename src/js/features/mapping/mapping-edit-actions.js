(function(global){
  'use strict';

  var state=function(){ return global.OneToneState.state; };
  var ui=function(){ return global.OneToneState.ui; };
  function t(key){ return global.OneToneI18n.t(key); }
  function toast(msg,kind){ return global.OneToneAppToast.show(msg,kind); }

  var pendingEnable=null;
  var settledEnable=null;
  var PENDING_MS=4000;
  var SETTLED_MS=2500;

  function setPendingEnable(id,enabled){
    pendingEnable={id:id,enabled:!!enabled,at:Date.now()};
  }

  function clearPendingEnable(id,enabled){
    if(!pendingEnable||pendingEnable.id!==id) return;
    if(enabled==null||pendingEnable.enabled===!!enabled){
      settledEnable={id:id,enabled:pendingEnable.enabled,at:Date.now()};
      pendingEnable=null;
    }
  }

  function applyPendingEnable(cfg){
    if(!cfg||!Array.isArray(cfg.mappings)) return;
    if(pendingEnable){
      if(Date.now()-pendingEnable.at>PENDING_MS){ pendingEnable=null; }
      else{
        var pending=cfg.mappings.find(function(x){ return x.id===pendingEnable.id; });
        if(pending) pending.enabled=pendingEnable.enabled;
        return;
      }
    }
    if(settledEnable&&Date.now()-settledEnable.at<=SETTLED_MS){
      var settled=cfg.mappings.find(function(x){ return x.id===settledEnable.id; });
      if(settled) settled.enabled=settledEnable.enabled;
    }
  }

  function hasPendingEnable(id){
    if(!pendingEnable||pendingEnable.id!==id) return false;
    if(Date.now()-pendingEnable.at>PENDING_MS){ pendingEnable=null; return false; }
    return true;
  }

  function getPendingEnableValue(id){
    if(!hasPendingEnable(id)) return null;
    return pendingEnable.enabled;
  }

  function acceptMappingToggledAck(id,enabled){
    var target=!!enabled;
    if(pendingEnable&&pendingEnable.id===id){
      if(Date.now()-pendingEnable.at<=PENDING_MS) return pendingEnable.enabled===target;
      pendingEnable=null;
    }
    if(settledEnable&&settledEnable.id===id&&Date.now()-settledEnable.at<=SETTLED_MS){
      return settledEnable.enabled===target;
    }
    return true;
  }

  function postMappingToggle(id,enabled){
    try{
      window.chrome?.webview?.postMessage({type:'mvp_mapping_toggle',id:id,enabled:!!enabled});
    }catch(_){}
  }

  function setMappingEnabled(id,enabled,opts){
    opts=opts||{};
    var m=global.OneToneMappingCore.byId(id);
    if(!m) return;
    var target=!!enabled;
    if(hasPendingEnable(id)&&pendingEnable.enabled===target&&!!m.enabled===target) return;
    if(!hasPendingEnable(id)&&!!m.enabled===target) return;
    setPendingEnable(id,target);
    m.enabled=target;
    // QS/habit overlay: in-memory only — backend toggle runs persist_and_rebind → mvp_init freeze.
    if(!opts.skipBackend) postMappingToggle(id,target);
    if(!opts.skipRender){
      if(global.OneToneRender.schedule) global.OneToneRender.schedule('mappingToggle');
      else global.OneToneRender.render();
    }
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
    postMappingToggle:postMappingToggle,
    removeMappingSwitchKey:removeMappingSwitchKey,
    updateMappingTiming:updateMappingTiming,
    applyPendingEnable:applyPendingEnable,
    clearPendingEnable:clearPendingEnable,
    hasPendingEnable:hasPendingEnable,
    getPendingEnableValue:getPendingEnableValue,
    acceptMappingToggledAck:acceptMappingToggledAck
  };
})((typeof window!=='undefined')?window:globalThis);
