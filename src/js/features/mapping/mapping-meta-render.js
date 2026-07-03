(function(global){
  'use strict';
  var t=function(key){ return global.OneToneI18n.t(key); };
  var core=function(){ return global.OneToneMappingCore; };
  var state=function(){ return global.OneToneState.state; };
  function hooks(){ return global.__vp_mapping_meta_render_hooks__ || {}; }

  function isAutoTriggerMapping(m){
    return hooks().normalizeTriggerKey(m&&m.triggerKey)==='AutoTrigger';
  }

  function formatSourceTime(raw){
    if(!raw) return '';
    var n=Number(raw);
    if(!isNaN(n)&&n>1e11){
      try{ return new Date(n).toLocaleString(); }catch(_){ return raw; }
    }
    return raw;
  }

  function formatNativeKeyLabels(m){
    var trace=core().formatTriggerTrace(m);
    if(trace) return trace;
    if(isAutoTriggerMapping(m)) return t('nativeKeysUnset');
    return hooks().friendlyKeyName(m.triggerKey||'?');
  }

  function renderTriggerMetaBlock(m,id){
    if(isAutoTriggerMapping(m)) return '';
    var keys=core().formatTriggerTrace(m)||m.triggerKey||'?';
    var time=formatSourceTime(m.sourceTime);
    var sel=state().selectedMappingId===id;
    var html='<div class="map-trigger-meta'+(sel?' is-selected':'')+'">';
    html+='<span class="map-trigger-meta-keys">'+keys+'</span>';
    if(time) html+='<span class="map-trigger-meta-time">'+t('traceRecorded')+' '+time+'</span>';
    html+='</div>';
    return html;
  }

  function renderNativeRestoreBlock(m,id){
    if(!isAutoTriggerMapping(m)) return '';
    var keys=formatNativeKeyLabels(m);
    var hasKeys=!!core().formatTriggerTrace(m);
    var time=formatSourceTime(m.sourceTime);
    var sel=state().selectedMappingId===id;
    var rec=global.OneToneMappingRecording.mode()==='nativeRestore'&&global.OneToneMappingRecording.mappingId()===id;
    var desc=hasKeys?t('nativeKeyDesc').replace('{keys}',keys):t('nativeKeyDescUnset');
    var html='<div class="map-native-block">';
    html+='<div class="map-timing-head"><span>'+t('nativeKeyTitle')+'</span>';
    html+='<div class="toggle'+(m.nativeKeyRestore?' on':'')+'" data-native-restore="'+id+'" role="switch"></div></div>';
    html+='<p class="map-switch-desc">'+desc+'</p>';
    html+='<div class="map-trigger-meta'+(sel?' is-selected':'')+'">';
    html+='<span class="map-trigger-meta-keys">'+keys+'</span>';
    if(time) html+='<span class="map-trigger-meta-time">'+t('traceRecorded')+' '+time+'</span>';
    html+='</div>';
    html+='<div class="map-native-keys-row">';
    html+='<button type="button" class="map-switch-add'+(rec?' recording':'')+'" data-native-restore-record="'+id+'">'+(rec?t('nativeRestoreRecording'):t('nativeRestoreRecord'))+'</button>';
    html+='</div></div>';
    return html;
  }

  function renderSwitchKeysBlock(m,id){
    hooks().ensureMappingExtras(m);
    var keys=m.switchKeys||[];
    var rec=global.OneToneMappingRecording.mode()==='mappingSwitch'&&global.OneToneMappingRecording.mappingId()===id;
    var html='<div class="map-switch-block">';
    html+='<div class="map-switch-head"><span>'+t('switchKeysTitle')+'</span></div>';
    html+='<p class="map-switch-desc">'+t('switchKeysDesc')+'</p>';
    html+='<div class="map-switch-chips">';
    keys.forEach(function(k,idx){
      html+='<span class="map-switch-chip">'+hooks().friendlyKeyName(k)+'<button type="button" data-rm-switch="'+id+'" data-idx="'+idx+'" aria-label="remove">×</button></span>';
    });
    if(!keys.length) html+='<span class="map-switch-desc" style="margin:0">—</span>';
    html+='</div>';
    html+='<button type="button" class="map-switch-add'+(rec?' recording':'')+'" data-add-switch="'+id+'">'+(rec?t('switchKeysRecording'):t('switchKeysAdd'))+'</button>';
    html+='</div>';
    return html;
  }

  global.OneToneMappingMetaRender={
    formatSourceTime:formatSourceTime,
    formatNativeKeyLabels:formatNativeKeyLabels,
    renderTriggerMetaBlock:renderTriggerMetaBlock,
    renderNativeRestoreBlock:renderNativeRestoreBlock,
    renderSwitchKeysBlock:renderSwitchKeysBlock
  };
})((typeof window!=='undefined')?window:globalThis);
