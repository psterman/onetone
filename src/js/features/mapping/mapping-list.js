(function(global){
  'use strict';
  var OneToneMappingCore=global.OneToneMappingCore;
  var OneToneI18n=global.OneToneI18n;
  var state=global.OneToneState.state;
  var $=function(id){ return global.OneToneDom.$(id); };
  var t=function(key){ return global.OneToneI18n.t(key); };
  function hooks(){ return global.__vp_mapping_list_hooks__ || {}; }
  function hasCompleteMappings(){
    return OneToneMappingCore.sorted().some(OneToneMappingCore.isSaved);
  }
  function mappingOverviewHtml(m){
    if(OneToneMappingCore.isDraft(m)){
      return '<div class="map-overview"><span class="map-overview-item"><b>'+hooks().escHtml(t('keySchemeCompletenessDraft'))+'</b></span></div>';
    }
    if(!OneToneMappingCore.isSaved(m)) return '';
    hooks().ensureMappingTiming(m);
    const preview=hooks().keyFinishPreviewText(m);
    const items=[];
    items.push('<span class="map-overview-item"><span class="map-overview-lbl">'+t('mapOverviewFinish')+'</span> <b>'+hooks().escHtml(preview.summary)+'</b></span>');
    const raw=(m.triggerMode||'tap').toLowerCase();
    const mode=(raw==='toggle')?'tap':(raw==='longpress'?'hold':raw);
    if(mode==='tap'){
      const cancelSec=hooks().formatTimingSec(m.intervalMs);
      const confirmSec=hooks().formatTimingSec(m.enterDelayMs);
      items.push('<span class="map-overview-item'+(m.cancelEnabled?' is-on':'')+'"><span class="map-overview-lbl">'+t('cancelTimingTitle')+'</span> <b>'+(m.cancelEnabled?t('keyFinishFlowStatusOn'):t('keyFinishFlowStatusOff'))+'</b>'+(m.cancelEnabled?' · '+cancelSec+'s':'')+'</span>');
      items.push('<span class="map-overview-item'+(m.autoEnterEnabled?' is-on':'')+'"><span class="map-overview-lbl">'+t('sendTimingTitle')+'</span> <b>'+(m.autoEnterEnabled?t('keyFinishFlowStatusOn'):t('keyFinishFlowStatusOff'))+'</b>'+(m.autoEnterEnabled?' · '+confirmSec+'s':'')+'</span>');
    }
    hooks().ensureMappingExtras(m);
    const switchKeys=m.switchKeys||[];
    if(switchKeys.length){
      items.push('<span class="map-overview-item"><span class="map-overview-lbl">'+t('mapOverviewSwitch')+'</span> <b>'+hooks().escHtml(formatSwitchKeyHint(switchKeys))+'</b></span>');
    }
    if(hooks().isAutoTriggerMapping(m)){
      const natLabel=m.nativeKeyRestore?t('keyFinishFlowStatusOn'):t('keyFinishFlowStatusOff');
      items.push('<span class="map-overview-item'+(m.nativeKeyRestore?' is-on':'')+'"><span class="map-overview-lbl">'+t('nativeKeyRestore')+'</span> <b>'+natLabel+'</b></span>');
    }
    const snap=hooks().voiceUiSnapshot().end||{};
    if(hooks().sessionActiveState(snap.state)&&snap.mappingId===m.id){
      items.push('<span class="map-overview-chip">'+t('chipDictating')+'</span>');
    }
    return '<div class="map-overview">'+items.join('')+'</div>';
  }

  function mappingKeySwitchesHtml(m){
    if(!OneToneMappingCore.isSaved(m)) return '';
    hooks().ensureMappingTiming(m);
    const raw=(m.triggerMode||'tap').toLowerCase();
    const mode=(raw==='toggle')?'tap':(raw==='longpress'?'hold':raw);
    const id=m.id;
    const parts=[];
    if(mode==='tap'){
      parts.push('<label class="map-key-switch"><span>'+t('cancelTimingTitle')+'</span><button type="button" class="toggle-switch'+(m.cancelEnabled?' is-on':'')+'" data-list-timing-toggle="'+id+'" data-field="cancelEnabled" role="switch" aria-checked="'+(m.cancelEnabled?'true':'false')+'"></button></label>');
      parts.push('<label class="map-key-switch"><span>'+t('sendTimingTitle')+'</span><button type="button" class="toggle-switch'+(m.autoEnterEnabled?' is-on':'')+'" data-list-timing-toggle="'+id+'" data-field="autoEnterEnabled" role="switch" aria-checked="'+(m.autoEnterEnabled?'true':'false')+'"></button></label>');
    }
    if(hooks().isAutoTriggerMapping(m)){
      parts.push('<label class="map-key-switch"><span>'+t('nativeKeyRestore')+'</span><button type="button" class="toggle-switch'+(m.nativeKeyRestore?' is-on':'')+'" data-native-restore="'+id+'" role="switch" aria-checked="'+(m.nativeKeyRestore?'true':'false')+'"></button></label>');
    }
    if(!parts.length) return '';
    return '<div class="map-key-switches">'+parts.join('')+'</div>';
  }

  function mappingRowExtrasHtml(m){
    if(!OneToneMappingCore.isSaved(m)) return '';
    hooks().ensureMappingExtras(m);
    const id=m.id;
    const keys=m.switchKeys||[];
    let html='<div class="map-row-extras">';
    if(keys.length){
      html+='<div class="map-switch-chips map-switch-chips-inline">';
      keys.forEach(function(k,idx){
        html+='<span class="map-switch-chip">'+hooks().friendlyKeyName(k)+'<button type="button" data-rm-switch="'+id+'" data-idx="'+idx+'" aria-label="remove">×</button></span>';
      });
      html+='</div>';
    }
    html+='<div class="map-row-extras-actions">';
    const recSwitch=hooks().recordingMode()==='mappingSwitch'&&hooks().recordingMappingId()===id;
    html+='<button type="button" class="map-inline-btn'+(recSwitch?' recording':'')+'" data-add-switch="'+id+'">'+(recSwitch?t('switchKeysRecording'):t('switchKeysAdd'))+'</button>';
    if(hooks().isAutoTriggerMapping(m)){
      const recNat=hooks().recordingMode()==='nativeRestore'&&hooks().recordingMappingId()===id;
      const trace=OneToneMappingCore.formatTriggerTrace(m)||t('nativeKeysUnset');
      html+='<span class="map-row-extras-meta" title="'+hooks().escHtml(trace)+'">'+hooks().escHtml(trace)+'</span>';
      html+='<button type="button" class="map-inline-btn'+(recNat?' recording':'')+'" data-native-restore-record="'+id+'">'+(recNat?t('nativeRestoreRecording'):t('nativeRestoreRecord'))+'</button>';
    }
    html+='</div></div>';
    return html;
  }
  function formatSwitchKeyHint(keys){
    if(!keys||!keys.length) return '';
    return keys.map(function(k){ return hooks().friendlyKeyName(k); }).join(' / ');
  }

  function renderMapRowAction(m){
    hooks().ensureMappingExtras(m);
    const keys=m.switchKeys||[];
    if(keys.length){
      const hint=formatSwitchKeyHint(keys);
      return '<span class="map-shortcut-hint" title="'+t('shortcutHintTitle')+'">'+hint+'</span>';
    }
    const hasTarget=!!OneToneMappingCore.editorTarget(m);
    return '<button type="button" class="map-test'+(hooks().testSendState()==='sending'&&hooks().testSendMappingId()===m.id?' sending':'')+'" data-test="'+m.id+'"'+(hasTarget?'':' disabled')+'>'+t('testShort')+'</button>';
  }
  function renderMappingList(){
    hooks().ensureConfig();
    const list=$('mappingList');
    const empty=$('mappingEmpty');
    const d=OneToneI18n.dict();
    const hasRows=hasCompleteMappings()||OneToneMappingCore.hasDrafts();
    if(empty) empty.hidden=hasRows;
    if(!hasRows){ list.innerHTML=''; return; }
    let html='';
    OneToneMappingCore.sorted().forEach(function(m){
      if(OneToneMappingCore.isDraft(m)){
        const sel=m.id===state.selectedMappingId;
        const left=m.triggerKey?hooks().friendlyKeyName(m.triggerKey):d.triggerPlaceholder;
        const right=m.targetKey?hooks().friendlyKeyName(m.targetKey):d.targetPlaceholder;
        html+='<div class="map-row map-row-draft'+(sel?' selected':'')+'" data-id="'+m.id+'">';
        html+='<div class="toggle" role="presentation" aria-hidden="true"></div>';
        html+='<div class="map-main"><div class="map-pair map-pair-draft">';
        html+='<span class="draft-ph">'+left+'</span> → <span class="draft-ph">'+right+'</span>';
        html+='</div>';
        html+=mappingOverviewHtml(m);
        html+='</div>';
        html+='<button type="button" class="map-test" disabled>'+d.testShort+'</button>';
        html+='<button type="button" class="map-menu-btn" data-menu="'+m.id+'">⋮</button>';
        html+='</div>';
        return;
      }
      if(!OneToneMappingCore.isSaved(m)) return;
      const sel=m.id===state.selectedMappingId;
      const on=!!m.enabled;
      const hasTarget=!!m.targetKey;
      const rowConflicts=OneToneMappingCore.conflictsFor(m.id);
      const hasConflict=OneToneMappingCore.schemeHasConflict(m);
      const snap=hooks().voiceUiSnapshot().end||{};
      const isDictating=hooks().sessionActiveState(snap.state)&&snap.mappingId===m.id;
      html+='<div class="map-row'+(sel?' selected':'')+(on?' is-on':'')+(isDictating?' is-dictating':'')+(hooks().openMenuId()===m.id?' menu-open':'')+'" data-id="'+m.id+'">';
      html+='<div class="toggle'+(on?' on':'')+'" data-toggle="'+m.id+'" role="switch" aria-checked="'+(on?'true':'false')+'"></div>';
      html+='<div class="map-main"><div class="map-pair">'+hooks().friendlyPair(m.triggerKey,m.targetKey)+'</div>';
      html+=mappingOverviewHtml(m);
      html+=mappingKeySwitchesHtml(m);
      html+=mappingRowExtrasHtml(m);
      if(hasConflict){
        const c=rowConflicts[0];
        html+='<div class="map-conflict">'+OneToneMappingCore.conflictHint(c,m.id)+'</div>';
      }
      html+='</div>';
      html+=renderMapRowAction(m);
      html+='<button type="button" class="map-menu-btn" data-menu="'+m.id+'">⋮</button>';
      html+='</div>';
    });
    list.innerHTML=html;
    hooks().syncAllTimingRanges(list);
  }

  function renderEditor(){
    const d=OneToneI18n.dict();
    const triggerEl=$('triggerView');
    const targetEl=$('targetView');
    const triggerDisp=$('triggerDisplay');
    const targetDisp=$('targetDisplay');
    const traceEl=$('triggerTrace');
    const m=OneToneMappingCore.selected();
    const trig=hooks().selectedDisplayTriggerKey();
    const tgt=hooks().selectedDisplayTargetKey();
    triggerEl.textContent=trig?hooks().friendlyKeyName(trig):d.triggerPlaceholder;
    targetEl.textContent=tgt?hooks().friendlyKeyName(tgt):d.targetPlaceholder;
    if(triggerDisp) triggerDisp.classList.toggle('empty',!trig);
    if(targetDisp) targetDisp.classList.toggle('empty',!tgt);
    const trace=OneToneMappingCore.formatTriggerTrace(m);
    if(traceEl){
      if(trace){
        traceEl.textContent=trace;
        traceEl.classList.add('show');
        traceEl.hidden=false;
      }else{
        traceEl.textContent='';
        traceEl.classList.remove('show');
        traceEl.hidden=true;
      }
    }
    $('btnRecordTrigger').textContent=trig?t('btnRerecordTrigger'):t('btnRecordTrigger');
    $('btnRecordTarget').textContent=tgt?t('btnRerecordTarget'):t('btnRecordTarget');
    hooks().updatePrimaryCTA();
    hooks().applyKeyWakeRecordingUi();
    hooks().renderKeySchemeCardHeader();
    hooks().syncKeySchemeTimeline(hooks().schemeStepFocus());
    hooks().renderHome();
    hooks().renderRecordCancelBar();
  }

  global.OneToneMappingList={
    renderList:renderMappingList,
    renderEditor:renderEditor,
    overviewHtml:mappingOverviewHtml,
    keySwitchesHtml:mappingKeySwitchesHtml,
    rowExtrasHtml:mappingRowExtrasHtml,
    rowActionHtml:renderMapRowAction
  };
})((typeof window!=='undefined')?window:globalThis);
