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
  function normalizeUiTriggerMode(raw){
    raw=(raw||'tap').toLowerCase();
    if(raw==='toggle') return 'tap';
    if(raw==='hold'||raw==='longpress') return 'perpress';
    return raw;
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
    const mode=normalizeUiTriggerMode(m.triggerMode);
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
    const activeId=state.config&&state.config.activeSceneId;
    if(activeId&&m.id===activeId){
      items.push('<span class="map-overview-chip is-active-scene">'+t('sceneActiveBadge')+'</span>');
    }else if(m.id===state.selectedMappingId&&OneToneMappingCore.isSaved(m)){
      items.push('<button type="button" class="map-inline-btn map-scene-activate" data-scene-activate="'+m.id+'">'+t('sceneActivateBtn')+'</button>');
    }
    return '<div class="map-overview">'+items.join('')+'</div>';
  }

  function mappingKeySwitchesHtml(m){
    if(!OneToneMappingCore.isSaved(m)) return '';
    hooks().ensureMappingTiming(m);
    const mode=normalizeUiTriggerMode(m.triggerMode);
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
  // P7: 每行视图的单一来源 —— legacy 与 React 岛共用，保证 markup / data-* 契约零偏差。
  // 返回 {id, cls, inner}（inner = .map-row 内部 HTML），非可见行返回 null。
  function rowView(m){
    const d=OneToneI18n.dict();
    if(OneToneMappingCore.isDraft(m)){
      const sel=m.id===state.selectedMappingId;
      const left=m.triggerKey?hooks().friendlyKeyName(m.triggerKey):d.triggerPlaceholder;
      const right=m.targetKey?hooks().friendlyKeyName(m.targetKey):d.targetPlaceholder;
      let inner='<div class="toggle" role="presentation" aria-hidden="true"></div>';
      inner+='<div class="map-main"><div class="map-pair map-pair-draft">';
      inner+='<span class="draft-ph">'+left+'</span> → <span class="draft-ph">'+right+'</span>';
      inner+='</div>';
      inner+=mappingOverviewHtml(m);
      inner+='</div>';
      inner+='<button type="button" class="map-test" disabled>'+d.testShort+'</button>';
      inner+='<button type="button" class="map-menu-btn" data-menu="'+m.id+'">⋮</button>';
      return {id:m.id, cls:'map-row map-row-draft'+(sel?' selected':''), inner:inner};
    }
    if(!OneToneMappingCore.isSaved(m)) return null;
    const sel=m.id===state.selectedMappingId;
    const on=!!m.enabled;
    const rowConflicts=OneToneMappingCore.conflictsFor(m.id);
    const hasConflict=OneToneMappingCore.schemeHasConflict(m);
    const snap=hooks().voiceUiSnapshot().end||{};
    const isDictating=hooks().sessionActiveState(snap.state)&&snap.mappingId===m.id;
    const activeId=state.config&&state.config.activeSceneId;
    const isActiveScene=activeId&&m.id===activeId;
    const cls='map-row'+(sel?' selected':'')+(on?' is-on':'')+(isDictating?' is-dictating':'')+(isActiveScene?' is-active-scene':'')+(hooks().openMenuId()===m.id?' menu-open':'');
    let inner='<div class="toggle'+(on?' on':'')+'" data-toggle="'+m.id+'" role="switch" aria-checked="'+(on?'true':'false')+'"></div>';
    inner+='<div class="map-main"><div class="map-pair">'+hooks().friendlyPair(m.triggerKey,m.targetKey,m)+'</div>';
    inner+=mappingOverviewHtml(m);
    inner+=mappingKeySwitchesHtml(m);
    inner+=mappingRowExtrasHtml(m);
    if(hasConflict){
      const c=rowConflicts[0];
      inner+='<div class="map-conflict">'+OneToneMappingCore.conflictHint(c,m.id)+'</div>';
    }
    inner+='</div>';
    inner+=renderMapRowAction(m);
    inner+='<button type="button" class="map-menu-btn" data-menu="'+m.id+'">⋮</button>';
    return {id:m.id, cls:cls, inner:inner};
  }

  function listHasRows(){
    return hasCompleteMappings()||OneToneMappingCore.hasDrafts();
  }

  function renderMappingList(){
    hooks().ensureConfig();
    const list=$('mappingList');
    const empty=$('mappingEmpty');
    const hasRows=listHasRows();
    if(empty) empty.hidden=hasRows;
    // P7 守卫：React 岛接管 #mappingList 后，legacy 不再 innerHTML 重建整表；
    // 改为通知岛做 keyed diff 同步（消除 remount storm）。岛未挂载时走原路径。
    if(global.OneToneIslands&&global.OneToneIslands.isMounted&&global.OneToneIslands.isMounted('mappingList')){
      if(typeof global.__otMappingListSync==='function') global.__otMappingListSync();
      return;
    }
    if(!hasRows){ list.innerHTML=''; return; }
    let html='';
    OneToneMappingCore.sorted().forEach(function(m){
      const row=rowView(m);
      if(!row) return;
      html+='<div class="'+row.cls+'" data-id="'+row.id+'">'+row.inner+'</div>';
    });
    list.innerHTML=html;
    hooks().syncAllTimingRanges(list);
  }

  // P12b-1：trigger/target 只读文案单一来源（供 React 岛 + renderEditor/录音预览共用）
  function buildEditorDisplayModel(){
    const d=OneToneI18n.dict();
    const m=OneToneMappingCore.selected();
    const lang=OneToneI18n.getLang?OneToneI18n.getLang():'zh';
    var trigRaw=hooks().selectedDisplayTriggerKey()||'';
    var tgt=hooks().selectedDisplayTargetKey()||'';
    var recApi=global.OneToneMappingRecording;
    var recMode=recApi&&typeof recApi.mode==='function'?recApi.mode():'none';
    var previewKey=recApi&&typeof recApi.previewKey==='function'?recApi.previewKey():'';
    if(recMode==='trigger'){
      trigRaw=previewKey||'';
    }else if(recMode==='target'||recMode==='agentBinding'){
      tgt=previewKey||'';
    }
    var triggerLabel;
    if(recMode==='trigger'){
      triggerLabel=trigRaw?hooks().friendlyKeyName(trigRaw):d.triggerPlaceholder;
    }else{
      triggerLabel=m&&global.OneToneKeyLabels&&global.OneToneKeyLabels.triggerDisplayLabel
        ?global.OneToneKeyLabels.triggerDisplayLabel(m,lang)
        :(trigRaw?hooks().friendlyKeyName(trigRaw):'');
      triggerLabel=triggerLabel||d.triggerPlaceholder;
    }
    var targetLabel=tgt?hooks().friendlyKeyName(tgt):d.targetPlaceholder;
    return {
      triggerLabel:triggerLabel,
      targetLabel:targetLabel,
      triggerRaw:trigRaw,
      targetRaw:tgt,
      triggerEmpty:!trigRaw,
      targetEmpty:!tgt,
      sig:String(triggerLabel)+'\0'+String(targetLabel)+'\0'+String(trigRaw)+'\0'+String(tgt)+'\0'+String(recMode)
    };
  }

  // P12c-6：triggerDisplay/targetDisplay empty/icon/recording/trace chrome（文案仍归 P12b-1）
  function buildKeysDisplayChromeModel(){
    const model=buildEditorDisplayModel();
    const m=OneToneMappingCore.selected();
    var recApi=global.OneToneMappingRecording;
    var recMode=recApi&&typeof recApi.mode==='function'?recApi.mode():'none';
    const trace=OneToneMappingCore.formatTriggerTrace?OneToneMappingCore.formatTriggerTrace(m):'';
    var mappingId=m&&m.id?String(m.id):'';
    return {
      triggerEmpty:!!model.triggerEmpty,
      targetEmpty:!!model.targetEmpty,
      triggerRaw:model.triggerRaw||'',
      targetRaw:model.targetRaw||'',
      triggerRecording:recMode==='trigger',
      targetRecording:recMode==='target'||recMode==='agentBinding',
      traceText:trace||'',
      traceShow:!!trace,
      mappingId:mappingId,
      recMode:recMode,
      sig:[mappingId,recMode,model.triggerRaw||'',model.targetRaw||'',trace||''].join('\0')
    };
  }

  function applyKeysDisplayChromeHost(chrome){
    if(!chrome) chrome=buildKeysDisplayChromeModel();
    if(global.__otKeysDisplayChromeMounted&&typeof global.__otKeysDisplayChromeSync==='function'){
      global.__otKeysDisplayChromeSync();
      return;
    }
    const triggerDisp=$('triggerDisplay');
    const targetDisp=$('targetDisplay');
    const traceEl=$('triggerTrace');
    if(triggerDisp){
      triggerDisp.classList.toggle('empty',!!chrome.triggerEmpty);
      triggerDisp.classList.toggle('is-recording',!!chrome.triggerRecording);
      if(global.OneToneKeyIcons&&global.OneToneKeyIcons.syncDisplayIcon){
        global.OneToneKeyIcons.syncDisplayIcon(triggerDisp,chrome.triggerRaw||'');
      }
    }
    if(targetDisp){
      targetDisp.classList.toggle('empty',!!chrome.targetEmpty);
      targetDisp.classList.toggle('is-recording',!!chrome.targetRecording);
    }
    if(traceEl){
      if(chrome.traceShow){
        traceEl.textContent=chrome.traceText||'';
        traceEl.classList.add('show');
        traceEl.hidden=false;
      }else{
        traceEl.textContent='';
        traceEl.classList.remove('show');
        traceEl.hidden=true;
      }
    }
  }

  function renderEditor(){
    const triggerEl=$('triggerView');
    const targetEl=$('targetView');
    const m=OneToneMappingCore.selected();
    const model=buildEditorDisplayModel();
    const trigRaw=model.triggerRaw;
    const tgt=model.targetRaw;
    var islandOn=!!global.__otMappingEditorDisplayMounted;
    if(islandOn){
      if(typeof global.__otMappingEditorDisplaySync==='function') global.__otMappingEditorDisplaySync();
    }else{
      if(triggerEl) triggerEl.textContent=model.triggerLabel;
      if(targetEl) targetEl.textContent=model.targetLabel;
    }
    applyKeysDisplayChromeHost(buildKeysDisplayChromeModel());
    if(global.OneToneAgentCapabilityUi&&global.OneToneAgentCapabilityUi.applyRecognitionOverlay){
      global.OneToneAgentCapabilityUi.applyRecognitionOverlay();
    }
    if(global.OneToneCodexMicroPadUi&&global.OneToneCodexMicroPadUi.applyTriggerHeroPreview){
      global.OneToneCodexMicroPadUi.applyTriggerHeroPreview(m);
    }
    var inKeysPanel=global.OneToneKeysPanelUi&&global.OneToneKeysPanelUi.keysPanelActive&&global.OneToneKeysPanelUi.keysPanelActive();
    var tgtLbl=tgt?t('btnRerecordTarget'):t('btnRecordTarget');
    if(global.OneToneMappingEditorChrome&&global.OneToneMappingEditorChrome.setRecordBtnLabel){
      global.OneToneMappingEditorChrome.setRecordBtnLabel($('btnRecordTrigger'),trigRaw?t('btnRerecordTrigger'):t('btnRecordTrigger'));
      global.OneToneMappingEditorChrome.setRecordBtnLabel($('btnRecordTarget'),inKeysPanel?'':tgtLbl);
    }else{
      var triggerBtn=$('btnRecordTrigger');
      var targetBtn=$('btnRecordTarget');
      if(triggerBtn) triggerBtn.textContent=trigRaw?t('btnRerecordTrigger'):t('btnRecordTrigger');
      if(!inKeysPanel&&targetBtn) targetBtn.textContent=tgtLbl;
    }
    hooks().updatePrimaryCTA();
    hooks().applyKeyWakeRecordingUi();
    hooks().renderKeySchemeCardHeader();
    hooks().syncKeySchemeTimeline(hooks().schemeStepFocus());
    hooks().renderHome();
    hooks().renderRecordCancelBar();
    if(global.OneToneImePresets) global.OneToneImePresets.refresh('mapping');
    if(global.OneToneAppTargetPresets) global.OneToneAppTargetPresets.refresh('mapping');
    if(global.OneToneAppBehaviorRules) global.OneToneAppBehaviorRules.render();
    if(global.OneToneHabitMulti) global.OneToneHabitMulti.render();
    if(global.OneToneKeysPanelUi) global.OneToneKeysPanelUi.render();
    if(global.OneToneHabitCompatibility) global.OneToneHabitCompatibility.render();
  }

  global.OneToneMappingList={
    renderList:renderMappingList,
    renderEditor:renderEditor,
    overviewHtml:mappingOverviewHtml,
    keySwitchesHtml:mappingKeySwitchesHtml,
    rowExtrasHtml:mappingRowExtrasHtml,
    rowActionHtml:renderMapRowAction,
    // P7：单一来源行视图 + 空态判定，供 React 岛复用（markup/data-* 契约零偏差）
    rowView:rowView,
    listHasRows:listHasRows,
    syncTimingRanges:function(list){ hooks().syncAllTimingRanges(list||$('mappingList')); },
    // P12b-1：编辑器 trigger/target 只读文案模型
    buildEditorDisplayModel:buildEditorDisplayModel,
    // P12c-6：display empty/icon/recording/trace chrome
    buildKeysDisplayChromeModel:buildKeysDisplayChromeModel
  };
})((typeof window!=='undefined')?window:globalThis);
