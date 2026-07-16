(function(global){
  'use strict';
  var $=function(id){ return global.OneToneDom.$(id); };
  var t=function(key){ return global.OneToneI18n.t(key); };
  function state(){ return global.OneToneState.state; }
  function lang(){ return global.OneToneI18n.getLang(); }
  function core(){ return global.OneToneMappingCore; }
  function editorTriggerForMapping(m){
    if(core()&&core().editorTrigger) return core().editorTrigger(m)||'';
    return m&&(m.triggerKey||'').trim()||'';
  }
  function editorTargetForMapping(m){
    if(core()&&core().editorTarget) return core().editorTarget(m)||'';
    return m&&(m.targetKey||'').trim()||'';
  }
  function friendlyKeyName(key){
    if(global.OneToneKeyLabels) return global.OneToneKeyLabels.friendlyKeyName(key,lang())||key;
    return key||'';
  }
  function isSavedMapping(m){ return !!(core()&&core().isSaved&&core().isSaved(m)); }
  function ensureMappingTiming(m){ if(core()&&core().ensureMappingTiming) core().ensureMappingTiming(m); }
  function emptyKeyLabel(){ return t('homeKeyMapTapToRecord'); }
  function displayTriggerLabel(m){
    if(!m) return '';
    if(global.OneToneKeyLabels&&global.OneToneKeyLabels.triggerDisplayLabel) return global.OneToneKeyLabels.triggerDisplayLabel(m,lang());
    var trig=editorTriggerForMapping(m);
    return trig?friendlyKeyName(trig):'';
  }
  function effectiveTargetKey(m,cfg){
    if(global.OneToneHabitProfile&&global.OneToneHabitProfile.project&&m&&cfg){
      var profile=global.OneToneHabitProfile.project(m,cfg);
      if(profile&&profile.effectiveTargetKey) return String(profile.effectiveTargetKey).trim();
    }
    if(!m||!cfg||!global.OneToneSceneConfig) return '';
    var eff=global.OneToneSceneConfig.resolveEffectiveScene(cfg,{activeSceneId:m.id});
    return eff&&eff.targetKey?String(eff.targetKey).trim():'';
  }
  function displayTargetKey(m,cfg){
    var eff=effectiveTargetKey(m,cfg);
    if(eff) return eff;
    return editorTargetForMapping(m)||'';
  }
  function finishBehaviorTextHome(m){
    return finishStrategyPreviewText(m,'');
  }
  function finishBehaviorTextSettings(m,activeAppContextId){
    return finishStrategyPreviewText(m,activeAppContextId||'');
  }
  function finishModeLabel(mode){
    if(mode==='perpress') return t('habitFinishModeAuto');
    if(mode==='confirm') return t('habitFinishModeConfirmSend');
    if(mode==='manual') return t('habitFinishModeManual');
    return t('habitFinishModeManual');
  }
  function resolveEffectiveFinishMode(m,activeAppContextId){
    if(activeAppContextId&&global.OneToneAppBehaviorRules){
      var eff=global.OneToneAppBehaviorRules.resolveEffectiveFinish(m,activeAppContextId);
      if(eff) return eff.mode;
    }
    return resolveFinishMode(m);
  }
  function finishStrategyPreviewText(m,activeAppContextId){
    if(!m||!isSavedMapping(m)) return {text:emptyKeyLabel(),saved:false};
    ensureMappingTiming(m);
    var appName='';
    if(activeAppContextId&&global.OneToneAppBehaviorRules){
      var eff=global.OneToneAppBehaviorRules.resolveEffectiveFinish(m,activeAppContextId);
      if(eff) appName=eff.appName;
    }
    var mode=resolveEffectiveFinishMode(m,activeAppContextId);
    var text='';
    if(mode==='perpress') text=t('keysFinishPreviewPerpress');
    else if(mode==='toggle') text=t('homeFinishBehaviorToggle');
    else if(mode==='confirm'){
      var delay=((m.enterDelayMs||1200)/1000).toFixed(1);
      text=m.cancelEnabled?t('keysFinishPreviewConfirmCancel').replace('{delay}',delay):t('keysFinishPreviewConfirm').replace('{delay}',delay);
    }else text=t('keysFinishPreviewManual');
    if(appName) text=t('keysFinishPreviewApp').replace('{app}',appName).replace('{text}',text);
    return {text:text,saved:true};
  }
  function resolveStartGesture(m){
    var raw=String(m&&m.triggerMode||'tap').toLowerCase();
    if(raw==='hold'||raw==='longpress'||raw==='perpress') return 'hold';
    if(raw==='double') return 'double';
    return 'tap';
  }
  function resolveFinishMode(m){
    if(!m) return 'manual';
    var gesture=resolveStartGesture(m);
    if(gesture==='hold') return 'perpress';
    if(m.cancelEnabled||m.autoEnterEnabled) return 'confirm';
    return 'manual';
  }
  function applyFinishMode(m,mode){
    if(!m) return;
    ensureMappingTiming(m);
    var gesture=resolveStartGesture(m);
    if(mode==='perpress'){
      m.triggerMode='longpress';
      return;
    }
    // Keep double-click start gesture; only leave hold when picking tap-based finish.
    if(gesture==='hold') m.triggerMode='tap';
    else if(gesture==='double') m.triggerMode='double';
    else m.triggerMode='tap';
    if(mode==='confirm'){ m.cancelEnabled=true; m.autoEnterEnabled=true; return; }
    if(mode==='manual'){ m.cancelEnabled=false; m.autoEnterEnabled=false; }
  }
  function finishModesForGesture(gesture){
    if(gesture==='hold') return ['perpress'];
    return ['confirm','manual'];
  }
  function setKeyCell(el,text,isSet){
    if(!el) return;
    el.textContent=text;
    el.className='home-key-map-key'+(isSet?' is-set':' is-empty');
  }
  function setOverviewKeyCell(el,text,isSet){
    if(!el) return;
    el.textContent=text;
    el.className='habit-overview-key-value'+(el.classList.contains('is-behavior')?' is-behavior':'')+(isSet?' is-set':' is-empty');
  }
  function syncFlowSummary(m,opts){
    opts=opts||{};
    var cfg=state().config||{}, context=opts.context||'settings';
    var trigRaw=editorTriggerForMapping(m), tgtRaw=displayTargetKey(m,cfg);
    var trigLbl=trigRaw?displayTriggerLabel(m):emptyKeyLabel();
    var tgtLbl=tgtRaw?friendlyKeyName(tgtRaw):emptyKeyLabel();
    var ctx=opts.activeAppContextId!==undefined?opts.activeAppContextId:(opts.previewAppId||'');
    var finish=context==='home'?finishBehaviorTextHome(m):finishBehaviorTextSettings(m,ctx);
    var prefix=opts.prefix||'sceneFlow';
    setKeyCell($(prefix+'TriggerKey'),trigLbl,!!trigRaw);
    setKeyCell($(prefix+'TargetKey'),tgtLbl,!!tgtRaw);
    setKeyCell($(prefix+'FinishKey'),finish.text,!!finish.saved);
    setKeyCell($('habitSummaryTriggerKey'),trigLbl,!!trigRaw);
    setKeyCell($('habitSummaryTargetKey'),tgtLbl,!!tgtRaw);
    setKeyCell($('habitSummaryFinishKey'),finish.text,!!finish.saved);
    var sumTrigLbl=$('habitSummaryTriggerLbl'), sumTgtLbl=$('habitSummaryTargetLbl'), sumFinLbl=$('habitSummaryFinishLbl');
    if(sumTrigLbl) sumTrigLbl.textContent=t('habitFlowStepTriggerLbl');
    if(sumTgtLbl) sumTgtLbl.textContent=t('habitFlowStepTargetLbl');
    if(sumFinLbl) sumFinLbl.textContent=t('habitFlowStepFinishLbl');
    var sumDesc=$('habitSummaryDesc');
    if(sumDesc) sumDesc.textContent=t('habitSummaryDesc');
    if($('habitOverviewTriggerKey')) setOverviewKeyCell($('habitOverviewTriggerKey'),trigLbl,!!trigRaw);
    if($('habitOverviewTargetKey')) setOverviewKeyCell($('habitOverviewTargetKey'),tgtLbl,!!tgtRaw);
    if($('habitOverviewFinishKey')) setOverviewKeyCell($('habitOverviewFinishKey'),finish.text,!!finish.saved);
    var bridgeKey=$('habitOverviewTargetKey');
    if(bridgeKey){
      bridgeKey.textContent=tgtLbl;
      bridgeKey.className='habit-overview-bridge-key'+(tgtRaw?' is-set':' is-empty');
    }
    var bridgeChip=$('habitOverviewStepTarget');
    if(bridgeChip) bridgeChip.classList.toggle('is-set',!!tgtRaw);
    var trigStatus=$('habitOverviewTriggerStatus');
    var finStatus=$('habitOverviewFinishStatus');
    if(trigStatus) trigStatus.textContent=trigRaw?t('habitKeyMapStatusEnabled'):t('habitKeyMapStatusDisabled');
    if(finStatus) finStatus.textContent=finish.saved?t('habitKeyMapStatusEnabled'):t('habitKeyMapStatusDisabled');
    var trigLblEl=$(prefix+'StepTriggerLbl'), tgtLblEl=$(prefix+'StepTargetLbl'), finLblEl=$(prefix+'StepFinishLbl');
    if(trigLblEl) trigLblEl.textContent=context==='home'?t('homeLiveTrigger'):t('sceneFlowStepTrigger');
    if(tgtLblEl) tgtLblEl.textContent=context==='home'?t('homeLiveTarget'):t('sceneFlowStepTarget');
    if(finLblEl) finLblEl.textContent=context==='home'?t('homeKeyMapFinishLbl'):t('sceneFlowStepFinish');
    var arrow1=$(prefix+'ArrowText')||$('homeKeyMapArrowText');
    var arrow2=$(prefix+'ArrowFinishText')||$('homeKeyMapArrowFinishText');
    if(arrow1) arrow1.textContent=context==='home'?t('homeKeyMapArrowText'):t('sceneFlowArrowOpen');
    if(arrow2) arrow2.textContent=context==='home'?t('homeKeyMapArrowFinishText'):t('sceneFlowArrowFinish');
    var focusStep=opts.focusStep||'';
    ['Trigger','Target','Finish'].forEach(function(name,i){
      var step=['trigger','target','finish'][i];
      var stepEl=$(prefix+'Step'+name);
      if(stepEl) stepEl.classList.toggle('is-active',focusStep===step);
    });
    if($('habitDefaultFlow')){
      var hfTrig=$('habitFlowStepTriggerLbl'), hfTgt=$('habitFlowStepTargetLbl'), hfFin=$('habitFlowStepFinishLbl');
      if(hfTrig) hfTrig.textContent=t('habitFlowStepTriggerLbl');
      if(hfTgt) hfTgt.textContent=t('habitFlowStepTargetLbl');
      if(hfFin) hfFin.textContent=t('habitFlowStepFinishLbl');
      var hfHint1=$('habitFlowStepTriggerHint'), hfHint2=$('habitFlowStepTargetHint');
      if(hfHint1) hfHint1.textContent=t('habitFlowStepTriggerHint');
      if(hfHint2) hfHint2.textContent=t('habitFlowStepTargetHint');
      var hfArr1=$('habitFlowArrowOpen'), hfArr2=$('habitFlowArrowFinish');
      if(hfArr1) hfArr1.textContent=t('sceneFlowArrowOpen');
      if(hfArr2) hfArr2.textContent=t('sceneFlowArrowFinish');
      var hfMore=$('habitFlowFinishMoreLbl'), hfCancel=$('habitFlowFinishMoreCancelLbl');
      if(hfMore) hfMore.textContent=t('habitFlowFinishMoreSummary');
      if(hfCancel) hfCancel.textContent=t('habitFlowFinishMoreCancel');
      setKeyCell($('habitFlowFinishKey'),finish.text,!!finish.saved);
      ['Trigger','Target','Finish'].forEach(function(name,i){
        var step=['trigger','target','finish'][i];
        var stepEl=$('habitKeyMapRow'+name);
        if(stepEl) stepEl.classList.toggle('is-active',focusStep===step);
      });
    }
    [['keySchemeStepTriggerSummary',trigLbl],['keySchemeStepTargetSummary',tgtLbl],['keySchemeStepFinishSummary',finish.text]].forEach(function(item){
      var el=$(item[0]); if(el) el.textContent=item[1];
    });
  }
  function renderLabels(){
    var map=[
      ['sceneFlowSummaryTitle','sceneFlowSummaryTitle'],['sceneFlowSummaryHint','sceneFlowSummaryHint'],
      ['habitBasicTitle','habitBasicTitle'],['habitBasicDesc','habitBasicDesc'],
      ['habitBasicTriggerTitle','habitBasicTriggerTitle'],['habitBasicTriggerDesc','habitBasicTriggerDesc'],
      ['habitBasicTargetTitle','habitBasicTargetTitle'],['habitBasicTargetDesc','habitBasicTargetDesc'],
      ['habitGlobalKeysNoteText','habitGlobalKeysNote'],
      ['habitFinishTitle','habitFinishTitle'],['habitFinishHint','habitFinishHint'],
      ['habitAppRulesFootnote','habitAppRulesFootnote'],['btnAddAppRule','habitAppRulesAdd'],
      ['habitMultiTitle','habitMultiTitle'],['habitMultiDesc','habitMultiDesc'],
      ['btnHabitMultiNew','habitMultiNew'],['btnHabitMultiCopy','habitMultiCopy'],['btnHabitMultiManage','habitMultiManage'],
      ['habitAdvancedTitle','habitAdvancedTitle'],['habitAdvancedSub','habitAdvancedSub'],
      ['btnHabitAdvancedConflict','habitAdvancedConflict'],
      ['habitCompatConflictTitle','habitCompatConflictTitle'],['habitCompatConfirmTitle','habitCompatConfirmTitle'],
      ['habitCompatImeTitle','habitAdvancedImeTitle'],['habitCompatEmpty','habitCompatEmpty'],
      ['imePresetHintMapping','habitInputMethodTitle'],
      ['habitSwitcherBtnLabel','habitSwitcherLabel'],
      ['habitFlowStepTriggerLbl','habitFlowStepTriggerLbl'],['habitFlowStepTargetLbl','habitFlowStepTargetLbl'],
      ['habitFlowStepFinishLbl','habitFlowStepFinishLbl'],['habitFlowStepTriggerHint','habitFlowStepTriggerHint'],
      ['habitFlowStepTargetHint','habitFlowStepTargetHint'],['habitFlowFinishMoreLbl','habitFlowFinishMoreSummary'],
      ['habitFlowFinishMoreCancelLbl','habitFlowFinishMoreCancel'],['habitFlowArrowOpen','sceneFlowArrowOpen'],
      ['habitFlowArrowFinish','sceneFlowArrowFinish'],['habitKeyMappingTip','habitKeyMappingTip'],
      ['btnHabitFlowTutorial','habitFlowTutorial'],
    ];
    map.forEach(function(pair){ var el=$(pair[0]); if(el) el.textContent=t(pair[1]); });
    document.querySelectorAll('.habit-rerecord-link .habit-rerecord-text').forEach(function(el){ el.textContent=t('habitRerecord'); });
  }
  function render(opts){
    opts=opts||{};
    renderLabels();
    var m=opts.mapping;
    if(m===undefined){
      var core=global.OneToneMappingCore;
      m=core&&core.selected?core.selected():null;
    }
    var preview=opts.activeAppContextId;
    if(preview===undefined) preview=opts.previewAppId;
    if(preview===undefined&&global.OneToneAppBehaviorRules){
      preview=global.OneToneAppBehaviorRules.getActiveAppContextId();
    }
    syncFlowSummary(m,{
      context:opts.context||'settings',
      prefix:opts.prefix||'habitFlow',
      activeAppContextId:preview||'',
      focusStep:opts.focusStep||''
    });
  }
  global.OneToneSceneFlowSummary={displayTriggerLabel:displayTriggerLabel,displayTargetKey:displayTargetKey,finishBehaviorTextHome:finishBehaviorTextHome,finishBehaviorTextSettings:finishBehaviorTextSettings,finishStrategyPreviewText:finishStrategyPreviewText,resolveEffectiveFinishMode:resolveEffectiveFinishMode,resolveFinishMode:resolveFinishMode,resolveStartGesture:resolveStartGesture,finishModesForGesture:finishModesForGesture,applyFinishMode:applyFinishMode,syncFlowSummary:syncFlowSummary,renderLabels:renderLabels,render:render,emptyKeyLabel:emptyKeyLabel,friendlyKeyName:friendlyKeyName};
})((typeof window!=='undefined')?window:globalThis);
