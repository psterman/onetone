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
    if(!m||!isSavedMapping(m)) return {text:emptyKeyLabel(),saved:false};
    ensureMappingTiming(m);
    var raw=String(m.triggerMode||'tap').toLowerCase();
    if(raw==='hold'||raw==='longpress'||raw==='perpress') return {text:t('homeFinishBehaviorPerPress'),saved:true};
    if(raw==='toggle') return {text:t('homeFinishBehaviorToggle'),saved:true};
    var cancel=!!m.cancelEnabled, autoEnter=!!m.autoEnterEnabled, text;
    if(cancel&&autoEnter) text=t('homeFinishBehaviorTapBoth');
    else if(cancel) text=t('homeFinishBehaviorTapCancel');
    else if(autoEnter) text=t('homeFinishBehaviorTapAutoEnter');
    else text=t('homeFinishBehaviorTapNone');
    return {text:text,saved:true};
  }
  function finishModeLabel(mode){
    if(mode==='perpress') return t('habitFinishModeAuto');
    if(mode==='confirm') return t('habitFinishModeConfirmSend');
    if(mode==='manual') return t('habitFinishModeManual');
    return t('habitFinishModeManual');
  }
  function finishBehaviorTextSettings(m,previewAppId){
    if(!m||!isSavedMapping(m)) return {text:emptyKeyLabel(),saved:false};
    if(previewAppId&&global.OneToneAppBehaviorRules){
      var eff=global.OneToneAppBehaviorRules.resolveEffectiveFinish(m,previewAppId);
      if(eff){
        return {text:t('sceneFlowFinishWithApp').replace('{app}',eff.appName).replace('{mode}',finishModeLabel(eff.mode)),saved:true};
      }
    }
    ensureMappingTiming(m);
    var mode=resolveFinishMode(m);
    if(mode==='perpress') return {text:t('habitFinishModeAuto'),saved:true};
    if(mode==='toggle') return {text:t('homeFinishBehaviorToggle'),saved:true};
    if(mode==='confirm') return {text:t('habitFinishModeConfirmSend'),saved:true};
    return {text:t('habitFinishModeManual'),saved:true};
  }
  function resolveFinishMode(m){
    if(!m) return 'manual';
    var raw=String(m.triggerMode||'tap').toLowerCase();
    if(raw==='hold'||raw==='longpress'||raw==='perpress') return 'perpress';
    if(raw==='toggle') return 'toggle';
    if(m.cancelEnabled||m.autoEnterEnabled) return 'confirm';
    return 'manual';
  }
  function applyFinishMode(m,mode){
    if(!m) return;
    ensureMappingTiming(m);
    if(mode==='perpress'){ m.triggerMode='hold'; return; }
    if(mode==='confirm'){ m.triggerMode='tap'; m.cancelEnabled=true; m.autoEnterEnabled=true; return; }
    if(mode==='manual'){ m.triggerMode='tap'; m.cancelEnabled=false; m.autoEnterEnabled=false; }
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
    var finish=context==='home'?finishBehaviorTextHome(m):finishBehaviorTextSettings(m,opts.previewAppId||'');
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
    var preview=opts.previewAppId;
    if(preview===undefined&&global.OneToneAppBehaviorRules){
      preview=global.OneToneAppBehaviorRules.getPreviewAppId();
    }
    syncFlowSummary(m,{
      context:opts.context||'settings',
      prefix:opts.prefix||'habitFlow',
      previewAppId:preview||'',
      focusStep:opts.focusStep||''
    });
  }
  global.OneToneSceneFlowSummary={displayTriggerLabel:displayTriggerLabel,displayTargetKey:displayTargetKey,finishBehaviorTextHome:finishBehaviorTextHome,finishBehaviorTextSettings:finishBehaviorTextSettings,resolveFinishMode:resolveFinishMode,applyFinishMode:applyFinishMode,syncFlowSummary:syncFlowSummary,renderLabels:renderLabels,render:render,emptyKeyLabel:emptyKeyLabel,friendlyKeyName:friendlyKeyName};
})((typeof window!=='undefined')?window:globalThis);
