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
  function finishBehaviorTextSettings(m){
    if(!m||!isSavedMapping(m)) return {text:emptyKeyLabel(),saved:false};
    ensureMappingTiming(m);
    var mode=resolveFinishMode(m);
    if(mode==='perpress') return {text:t('habitFinishModeDirect'),saved:true};
    if(mode==='toggle') return {text:t('homeFinishBehaviorToggle'),saved:true};
    if(mode==='confirm') return {text:t('habitFinishModeConfirm'),saved:true};
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
  function syncFlowSummary(m,opts){
    opts=opts||{};
    var cfg=state().config||{}, context=opts.context||'settings';
    var trigRaw=editorTriggerForMapping(m), tgtRaw=displayTargetKey(m,cfg);
    var trigLbl=trigRaw?displayTriggerLabel(m):emptyKeyLabel();
    var tgtLbl=tgtRaw?friendlyKeyName(tgtRaw):emptyKeyLabel();
    var finish=context==='home'?finishBehaviorTextHome(m):finishBehaviorTextSettings(m);
    var prefix=opts.prefix||'sceneFlow';
    setKeyCell($(prefix+'TriggerKey'),trigLbl,!!trigRaw);
    setKeyCell($(prefix+'TargetKey'),tgtLbl,!!tgtRaw);
    setKeyCell($(prefix+'FinishKey'),finish.text,!!finish.saved);
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
    [['keySchemeStepTriggerSummary',trigLbl],['keySchemeStepTargetSummary',tgtLbl],['keySchemeStepFinishSummary',finish.text]].forEach(function(item){
      var el=$(item[0]); if(el) el.textContent=item[1];
    });
  }
  function renderLabels(){
    var map=[['sceneFlowSummaryTitle','sceneFlowSummaryTitle'],['habitBasicTitle','habitBasicTitle'],['habitBasicTriggerTitle','habitBasicTriggerTitle'],['habitBasicTriggerDesc','habitBasicTriggerDesc'],['habitBasicTargetTitle','habitBasicTargetTitle'],['habitBasicTargetDesc','habitBasicTargetDesc'],['habitFinishTitle','habitFinishTitle'],['habitFinishHint','keyExecFinishHint'],['habitFinishAdvancedTitle','habitFinishAdvancedTitle'],['habitSoftwareTitle','habitSoftwareTitle'],['habitSoftwareDesc','habitSoftwareDesc'],['imePresetHintMapping','habitInputMethodTitle'],['appTargetHintMapping','habitAppsTitle']];
    map.forEach(function(pair){ var el=$(pair[0]); if(el) el.textContent=t(pair[1]); });
    var advLbl=$('habitFinishAdvancedTitle');
    if(advLbl) advLbl.textContent=t('habitFinishAdvancedTitle');
    document.querySelectorAll('.habit-rerecord-link .habit-rerecord-text').forEach(function(el){ el.textContent=t('habitRerecord'); });
  }
  global.OneToneSceneFlowSummary={displayTriggerLabel:displayTriggerLabel,displayTargetKey:displayTargetKey,finishBehaviorTextHome:finishBehaviorTextHome,finishBehaviorTextSettings:finishBehaviorTextSettings,resolveFinishMode:resolveFinishMode,applyFinishMode:applyFinishMode,syncFlowSummary:syncFlowSummary,renderLabels:renderLabels,emptyKeyLabel:emptyKeyLabel,friendlyKeyName:friendlyKeyName};
})((typeof window!=='undefined')?window:globalThis);
