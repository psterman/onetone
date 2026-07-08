(function(global){
  'use strict';
  var $=function(id){ return global.OneToneDom.$(id); };
  var t=function(key){ return global.OneToneI18n.t(key); };
  function hooks(){ return global.__vp_key_finish_flow_render_hooks__ || {}; }
  function appState(){ return global.OneToneState.state; }
  var schemeStepFocus='';
  var schemeStepHighlightTimer=0;
  var timingSaveTimer=0;

  function normalizeUiTriggerMode(raw){
    raw=(raw||'tap').toLowerCase();
    if(raw==='toggle') return 'tap';
    if(raw==='hold'||raw==='longpress') return 'perpress';
    return raw;
  }

  function renderModeAnim(opt){
    if(opt==='perpress'){
      return '<div class="mode-anim" aria-hidden="true"><div class="mode-anim-inner mode-anim-hold">'
        +'<span class="ma-chip ma-key ma-k1">1</span><span class="ma-arrow">→</span>'
        +'<span class="ma-chip ma-voice ma-v1">'+t('keyFinishFlowAnimVoice')+'</span>'
        +'</div></div>';
    }
    if(opt==='manual'){
      return '<div class="mode-anim" aria-hidden="true"><div class="mode-anim-inner mode-anim-manual">'
        +'<span class="ma-chip ma-key ma-k1">1</span><span class="ma-arrow">→</span>'
        +'<span class="ma-chip ma-voice ma-v1">'+t('keyFinishFlowAnimVoice')+'</span>'
        +'</div></div>';
    }
    return '<div class="mode-anim" aria-hidden="true"><div class="mode-anim-inner mode-anim-tap">'
      +'<span class="ma-chip ma-key ma-k1">1</span><span class="ma-arrow">→</span>'
      +'<span class="ma-chip ma-voice ma-v1">'+t('keyFinishFlowAnimVoice')+'</span>'
      +'<span class="ma-arrow">→</span><span class="ma-chip ma-key ma-k2">2</span><span class="ma-arrow ma-a1">→</span>'
      +'<span class="ma-out-stack">'
      +'<span class="ma-chip ma-esc ma-out-cancel">'+t('keyFinishFlowAnimCancel')+'</span>'
      +'<span class="ma-chip ma-enter ma-out-enter">'+t('keyFinishFlowAnimConfirm')+'</span>'
      +'</span></div></div>';
  }

  function finishModeIcon(mode){
    var c='class="habit-mode-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"';
    if(mode==='perpress') return '<svg '+c+'><path d="M22 2 11 13"/><path d="M22 2 15 22 11 13 2 9 22 2z"/></svg>';
    if(mode==='confirm') return '<svg '+c+'><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';
    return '<svg '+c+'><path d="M18 11V6a2 2 0 0 0-2-2"/><path d="M14 10V4a2 2 0 0 0-2-2"/><path d="M10 10.5V6a2 2 0 0 0-2-2"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/></svg>';
  }

  function primaryAppIdForMapping(m){
    return m&&String(m.appTargetId||'').trim()||'';
  }

  function resolveDisplayedFinishMode(m){
    var fs=global.OneToneSceneFlowSummary;
    if(!fs) return 'manual';
    var appId=primaryAppIdForMapping(m);
    if(appId&&fs.resolveEffectiveFinishMode) return fs.resolveEffectiveFinishMode(m,appId);
    return fs.resolveFinishMode?fs.resolveFinishMode(m):'manual';
  }

  function renderKeyFinishModeSegmented(m){
    var current=resolveDisplayedFinishMode(m);
    var html='';
    [
      {mode:'perpress',title:'habitFinishModeAuto'},
      {mode:'confirm',title:'habitFinishModeConfirmSend'},
      {mode:'manual',title:'habitFinishModeManual'}
    ].forEach(function(opt){
      var active=current===opt.mode;
      html+='<button type="button" class="keys-finish-segment'+(active?' is-active':'')+'" data-finish-mode="'+opt.mode+'" role="radio" aria-checked="'+(active?'true':'false')+'">'+t(opt.title)+'</button>';
    });
    return html;
  }

  function renderKeysFinishDelayOnly(m,id){
    hooks().ensureMappingTiming(m);
    var seconds=((m.enterDelayMs||1200)/1000).toFixed(1);
    var html='<div class="keys-finish-delay-card">';
    html+='<div class="keys-finish-delay-head"><span class="keys-finish-delay-label">'+t('sendTimingTitle')+'</span>';
    html+='<span class="keys-finish-delay-value">'+seconds+t('keysFinishDelayUnit')+'</span></div>';
    html+='<div class="voice-end-inline-range keys-finish-delay-range"><input type="range" class="map-timing-range" data-timing-range="'+id+'" data-field="enterDelayMs" min="1000" max="15000" step="500" value="'+(m.enterDelayMs||1200)+'"></div>';
    html+='<p class="keys-finish-delay-desc">'+t('sendTimingDesc').replace('{n}',seconds)+'</p>';
    html+='</div>';
    return html;
  }

  function activeAppContextId(){
    var ed=global.OneToneMappingEditorState;
    if(ed&&ed.getEditorActiveAppContextId) return ed.getEditorActiveAppContextId()||'';
    if(global.OneToneAppBehaviorRules&&global.OneToneAppBehaviorRules.getActiveAppContextId) return global.OneToneAppBehaviorRules.getActiveAppContextId()||'';
    return '';
  }

  function renderKeysFinishStrategyPreview(m){
    var el=$('keysFinishStrategyPreview');
    if(!el||!global.OneToneSceneFlowSummary||!global.OneToneSceneFlowSummary.finishStrategyPreviewText) return;
    var ctx=primaryAppIdForMapping(m)||activeAppContextId();
    var preview=global.OneToneSceneFlowSummary.finishStrategyPreviewText(m,ctx);
    el.textContent=preview.text||'—';
    el.className='keys-finish-strategy-preview'+(preview.saved?' is-set':' is-empty');
  }

  function refreshFinishModeSegment(m){
    if(!m) m=hooks().selectedMapping();
    if(!m||!hooks().isSavedMapping||!hooks().isSavedMapping(m)) return;
    var modePanel=$('voiceEndKeyModePanel');
    if(!modePanel) return;
    var current=resolveDisplayedFinishMode(m);
    modePanel.querySelectorAll('[data-finish-mode]').forEach(function(btn){
      var active=btn.dataset.finishMode===current;
      btn.classList.toggle('is-active',active);
      btn.setAttribute('aria-checked',active?'true':'false');
    });
    renderKeysFinishStrategyPreview(m);
  }

  function renderKeysFinishCancelOnly(m,id){
    return '<div class="keys-finish-cancel-card">'+renderKeyTimingCard(m,id,'cancel')+'</div>';
  }

  function useKeysFinishSegmented(){
    return !!$('keysFinishModeHost');
  }

  function renderKeyFinishModeBlock(m){
    var current=resolveDisplayedFinishMode(m);
    var html='<div class="map-trigger-mode habit-finish-modes">';
    html+='<div class="habit-finish-mode-list">';
    [
      {mode:'perpress',title:'habitFinishModeAuto',desc:'habitFinishModeAutoDesc'},
      {mode:'confirm',title:'habitFinishModeConfirmSend',desc:'habitFinishModeConfirmSendDesc',recommended:true},
      {mode:'manual',title:'habitFinishModeManual',desc:'habitFinishModeManualDesc'}
    ].forEach(function(opt){
      var active=current===opt.mode;
      html+='<button type="button" class="habit-finish-mode-option'+(active?' is-active':'')+'" data-finish-mode="'+opt.mode+'">';
      html+=finishModeIcon(opt.mode);
      html+='<span class="habit-finish-mode-copy"><span class="habit-finish-mode-title">'+t(opt.title)+'</span>';
      if(opt.recommended) html+='<span class="habit-finish-mode-badge">'+t('habitFinishModeRecommended')+'</span>';
      html+='<span class="habit-finish-mode-desc">'+t(opt.desc)+'</span></span>';
      if(active) html+='<svg class="habit-finish-mode-check" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>';
      html+='</button>';
    });
    html+='</div></div>';
    return html;
  }

  function renderKeyTimingCard(m,id,kind){
    hooks().ensureMappingTiming(m);
    var onTxt=t('keyFinishFlowStatusOn');
    var offTxt=t('keyFinishFlowStatusOff');
    var isCancel=kind==='cancel';
    var finishMode=global.OneToneSceneFlowSummary?global.OneToneSceneFlowSummary.resolveFinishMode(m):'manual';
    var active=finishMode==='confirm';
    var enabledField=isCancel?'cancelEnabled':'autoEnterEnabled';
    var rangeField=isCancel?'intervalMs':'enterDelayMs';
    var titleKey=isCancel?'cancelTimingTitle':'sendTimingTitle';
    var descKey=isCancel?'cancelTimingDesc':'sendTimingDesc';
    var rangeMin=isCancel?200:1000;
    var rangeMax=isCancel?5000:15000;
    var rangeStep=isCancel?100:500;
    var seconds=((isCancel?m.intervalMs:m.enterDelayMs)/1000).toFixed(1);
    var snap=(hooks().voiceUiSnapshot()||{}).end||{};
    var html='';
    if(active&&!isCancel&&snap.autoSendEnabled&&m.autoEnterEnabled){
      html+='<p class="map-timing-desc map-send-mode-hint">'+t('voiceEndAutoSendWarn')+'</p>';
    }
    html+='<div class="setting-row"><div class="setting-row-main"><span class="setting-row-text">'+t(titleKey)+'</span></div>';
    if(active){
      html+='<button type="button" class="toggle-switch'+(m[enabledField]?' is-on':'')+'" data-timing-toggle="'+id+'" data-field="'+enabledField+'" role="switch" aria-checked="'+(m[enabledField]?'true':'false')+'"></button></div>';
      html+='<p class="map-timing-desc">'+(m[enabledField]?onTxt:offTxt)+' · '+t(descKey).replace('{n}',seconds)+'</p>';
      html+='<div class="voice-end-inline-range"><input type="range" class="map-timing-range" data-timing-range="'+id+'" data-field="'+rangeField+'" min="'+rangeMin+'" max="'+rangeMax+'" step="'+rangeStep+'" value="'+m[rangeField]+'"'+(m[enabledField]?'':' disabled')+'></div>';
    }else{
      html+='<button type="button" class="toggle-switch" role="switch" aria-checked="false" disabled></button></div>';
      html+='<p class="map-timing-desc">'+offTxt+' · '+t(isCancel?'cancelTimingUnused':'sendTimingUnused')+'</p>';
    }
    return html;
  }

  function focusSchemeEditStep(step){
    if(!step) return;
    schemeStepFocus=step;
    if(global.OneToneHabitLayerNav) global.OneToneHabitLayerNav.setHabitLayer('global');
    var flowIds={trigger:'sceneFlowStepTrigger',target:'sceneFlowStepTarget',finish:'sceneFlowStepFinish'};
    var editIds={trigger:'habitKeyMapRowTrigger',target:'habitKeyMapRowTarget',finish:'habitKeyMapRowFinish',cancel:'habitKeyMapRowCancel'};
    ['trigger','target','finish','cancel'].forEach(function(s){
      var card=$(editIds[s]);
      if(card) card.classList.remove('is-focus-highlight');
    });
    var card=$(editIds[step]);
    if(card){
      card.classList.add('is-focus-highlight');
      clearTimeout(schemeStepHighlightTimer);
      schemeStepHighlightTimer=setTimeout(function(){
        card.classList.remove('is-focus-highlight');
      },1500);
      card.scrollIntoView({behavior:'smooth',block:'nearest'});
    }else{
      var flowEl=$(flowIds[step]);
      if(flowEl) flowEl.scrollIntoView({behavior:'smooth',block:'nearest'});
    }
    if(global.OneToneHabitKeyMappingTable) global.OneToneHabitKeyMappingTable.highlightRow(step);
    syncKeySchemeTimeline(step);
  }

  function renderKeySchemeCardHeader(){
    hooks().ensureConfig();
    var m=hooks().selectedMapping();
    if(global.OneToneSceneTabs&&global.OneToneSceneTabs.renderHero) global.OneToneSceneTabs.renderHero();
    else if(global.OneToneSceneFlowSummary) global.OneToneSceneFlowSummary.renderLabels();
    var addBtn=$('btnKeySchemeAdd');
    var delBtn=$('btnKeySchemeDelete');
    var busy=global.OneToneMappingRecording.mode()!=='none';
    if(addBtn){
      addBtn.textContent=t('habitSwitcherNew');
      var ready=hooks().isCurrentDraftComplete();
      addBtn.disabled=!ready||busy;
      addBtn.title=(!ready&&!busy)?t('addNeedComplete'):'';
    }
    if(delBtn){
      delBtn.textContent=t('delete');
      delBtn.disabled=!m||busy;
    }
    var stepTriggerTitle=$('keySchemeStepTriggerTitle');
    var stepTargetTitle=$('keySchemeStepTargetTitle');
    var stepFinishTitle=$('keySchemeStepFinishTitle');
    if(stepTriggerTitle) stepTriggerTitle.textContent=t('keySchemeStepTriggerTitle');
    if(stepTargetTitle) stepTargetTitle.textContent=t('keySchemeStepTargetTitle');
    if(stepFinishTitle) stepFinishTitle.textContent=t('keyExecFinishTitle');
  }

  function syncKeySchemeTimeline(focusStep){
    hooks().ensureConfig();
    var m=hooks().selectedMapping();
    var activeStep=focusStep
      ||(global.OneToneMappingRecording.mode()==='trigger'?'trigger':global.OneToneMappingRecording.mode()==='target'?'target':'')
      ||schemeStepFocus;
    if(global.OneToneSceneFlowSummary){
      global.OneToneSceneFlowSummary.syncFlowSummary(m,{context:'settings',focusStep:activeStep});
    }
    var trig=hooks().selectedDisplayTriggerKey();
    var tgt=hooks().selectedDisplayTargetKey();
    var trigSummary=$('keySchemeStepTriggerSummary');
    var tgtSummary=$('keySchemeStepTargetSummary');
    var finSummary=$('keySchemeStepFinishSummary');
    if(trigSummary) trigSummary.textContent=trig?hooks().friendlyKeyName(trig):t('homeKeyMapEmptyKey');
    if(tgtSummary) tgtSummary.textContent=tgt?hooks().friendlyKeyName(tgt):t('homeKeyMapEmptyKey');
    if(finSummary){
      var preview=global.OneToneSceneFlowSummary&&global.OneToneSceneFlowSummary.finishStrategyPreviewText
        ?global.OneToneSceneFlowSummary.finishStrategyPreviewText(m,'')
        :hooks().keyFinishPreviewText(m);
      finSummary.textContent=(preview&&preview.text)||(preview&&preview.summary)||'—';
    }
    var steps=[
      {id:'keySchemeStepTrigger',step:'trigger',done:!!trig},
      {id:'keySchemeStepTarget',step:'target',done:!!tgt},
      {id:'keySchemeStepFinish',step:'finish',done:!!(m&&hooks().isSavedMapping(m))}
    ];
    steps.forEach(function(s){
      var el=$(s.id);
      if(!el) return;
      el.classList.toggle('is-complete',s.done);
      el.classList.toggle('is-pending',!s.done);
      el.classList.toggle('is-active',activeStep===s.step);
    });
  }

  function syncKeyExecFinishCard(){
    var title=$('keyExecFinishTitle');
    if(title) title.textContent=t('keyExecFinishTitle');
  }

  function syncKeyExecFinishTimingSection(m){
    var section=$('keyExecFinishTimingSection');
    if(section) section.hidden=true;
  }

  function renderKeyFinishFlowPanel(){
    var modePanel=$('voiceEndKeyModePanel');
    var cancelCard=$('voiceEndCancelCard');
    var confirmCard=$('voiceEndConfirmCard');
    var delayHost=$('keysFinishDelayHost');
    var cancelHost=$('keysFinishCancelHost');
    if(!modePanel||!cancelCard||!confirmCard) return;
    hooks().ensureConfig();
    var m=hooks().selectedMapping();
    var esc=hooks().escHtml;
    if(!m||!hooks().isSavedMapping(m)){
      var empty='<p class="mic-desc key-finish-empty">'+esc(t('keyFinishFlowNeedKeys'))+'</p>';
      syncKeyExecFinishCard();
      modePanel.innerHTML=empty;
      cancelCard.innerHTML='<div class="setting-row"><div class="setting-row-main"><span class="setting-row-text">'+t('cancelTimingTitle')+'</span></div></div>'+empty;
      confirmCard.innerHTML='<div class="setting-row"><div class="setting-row-main"><span class="setting-row-text">'+t('sendTimingTitle')+'</span></div></div>'+empty;
      if(delayHost){ delayHost.innerHTML=''; delayHost.hidden=true; }
      if(cancelHost){ cancelHost.innerHTML=''; cancelHost.hidden=true; }
      renderKeysFinishStrategyPreview(null);
      syncKeyExecFinishTimingSection(null);
      renderKeySchemeCardHeader();
      syncKeySchemeTimeline(schemeStepFocus);
      hooks().renderHomeKeyFinishPreview(false);
      if(global.OneToneHabitKeyMappingTable){
        global.OneToneHabitKeyMappingTable.syncRowStatus();
      }
      if(global.OneToneHabitCompatibility) global.OneToneHabitCompatibility.render();
      return;
    }
    syncKeyExecFinishCard();
    modePanel.innerHTML=useKeysFinishSegmented()?renderKeyFinishModeSegmented(m):renderKeyFinishModeBlock(m);
    var keysPanel=useKeysFinishSegmented();
    var finishMode=resolveDisplayedFinishMode(m);
    if(keysPanel){
      cancelCard.innerHTML='';
      confirmCard.innerHTML='';
    }else{
      cancelCard.innerHTML=renderKeyTimingCard(m,m.id,'cancel');
      confirmCard.innerHTML=renderKeyTimingCard(m,m.id,'confirm');
    }
    if(delayHost){
      if(keysPanel&&finishMode==='confirm'){
        delayHost.innerHTML=renderKeysFinishDelayOnly(m,m.id);
        syncAllTimingRanges(delayHost);
        delayHost.hidden=false;
      }else{
        delayHost.innerHTML='';
        delayHost.hidden=true;
      }
    }
    if(cancelHost){
      if(keysPanel&&finishMode==='confirm'){
        cancelHost.innerHTML=renderKeysFinishCancelOnly(m,m.id);
        syncAllTimingRanges(cancelHost);
        cancelHost.hidden=false;
      }else{
        cancelHost.innerHTML='';
        cancelHost.hidden=true;
      }
    }
    if(!keysPanel){
      syncAllTimingRanges(cancelCard);
      syncAllTimingRanges(confirmCard);
    }
    syncKeyExecFinishTimingSection(m);
    renderKeySchemeCardHeader();
    syncKeySchemeTimeline(schemeStepFocus);
    hooks().renderHomeKeyFinishPreview(false);
    if(global.OneToneHabitKeyMappingTable){
      global.OneToneHabitKeyMappingTable.syncRowStatus();
    }
    if(global.OneToneHabitCompatibility) global.OneToneHabitCompatibility.render();
    renderKeysFinishStrategyPreview(m);
  }

  function handleKeyFinishFlowInput(e){
    var range=e.target.closest&&e.target.closest('[data-timing-range]');
    if(!range) return;
    e.stopPropagation();
    liveUpdateTimingRange(range);
  }

  function handleKeyFinishFlowClick(e){
    var el=e.target;
    var finishBtn=el.closest&&el.closest('[data-finish-mode]');
    if(finishBtn){
      if(finishBtn.closest('[data-app-rule-pill]')) return false;
      var mode=finishBtn.dataset.finishMode;
      var m=hooks().selectedMapping();
      if(!m||!mode||!global.OneToneSceneFlowSummary) return false;
      e.stopPropagation();
      var primaryApp=primaryAppIdForMapping(m);
      var abr=global.OneToneAppBehaviorRules;
      if(primaryApp&&abr&&abr.setAppFinishMode){
        abr.setAppFinishMode(m,primaryApp,mode);
        if(global.OneToneKeyFinishFlowRender&&global.OneToneKeyFinishFlowRender.refreshFinishModeSegment){
          global.OneToneKeyFinishFlowRender.refreshFinishModeSegment(m);
        }
      }else{
        global.OneToneSceneFlowSummary.applyFinishMode(m,mode);
        hooks().save();
        renderKeyFinishFlowPanel();
        hooks().renderMappingList();
        if(global.OneToneSceneTabs&&global.OneToneSceneTabs.renderHero) global.OneToneSceneTabs.renderHero();
        if(global.OneToneHabitMulti) global.OneToneHabitMulti.render();
        if(global.OneToneHabitKeyMappingTable) global.OneToneHabitKeyMappingTable.syncRowStatus();
      }
      return true;
    }
    var modeBtn=el.closest&&el.closest('[data-trigger-mode]');
    if(modeBtn){
      var id=modeBtn.dataset.triggerMode;
      var mode=modeBtn.dataset.mode;
      var m=appState().config.mappings.find(function(x){return x.id===id;});
      if(!m||!mode) return false;
      e.stopPropagation();
      m.triggerMode=mode;
      hooks().save();
      renderKeyFinishFlowPanel();
      hooks().renderMappingList();
      return true;
    }
    var timingToggle=el.closest&&el.closest('[data-timing-toggle]');
    if(timingToggle){
      var field=timingToggle.dataset.field;
      var m=hooks().selectedMapping();
      if(!m||!field) return false;
      e.stopPropagation();
      if(field==='cancelEnabled'||field==='autoEnterEnabled') m.triggerMode='tap';
      m[field]=!m[field];
      scheduleTimingSave();
      renderKeyFinishFlowPanel();
      hooks().renderMappingList();
      if(global.OneToneHabitKeyMappingTable) global.OneToneHabitKeyMappingTable.syncRowStatus();
      return true;
    }
    return false;
  }

  function scheduleTimingSave(){
    clearTimeout(timingSaveTimer);
    timingSaveTimer=setTimeout(function(){ hooks().save(); },280);
  }

  function formatTimingSec(ms){ return (Number(ms)/1000).toFixed(1); }

  function timingDescText(field,ms){
    var n=formatTimingSec(ms);
    if(field==='intervalMs') return t('cancelTimingDesc').replace('{n}',n);
    if(field==='enterDelayMs') return t('sendTimingDesc').replace('{n}',n);
    return '';
  }

  function syncTimingRangeFill(range){
    if(!range) return;
    var min=Number(range.min), max=Number(range.max), val=Number(range.value);
    var pct=max>min?((val-min)/(max-min))*100:0;
    range.style.setProperty('--range-pct', pct+'%');
  }

  function syncAllTimingRanges(root){
    (root||document).querySelectorAll('.map-timing-range').forEach(syncTimingRangeFill);
  }

  function liveUpdateTimingRange(range){
    var field=range.dataset.field;
    var val=Number(range.value);
    var m=hooks().selectedMapping();
    if(!m) return;
    m[field]=val;
    scheduleTimingSave();
    syncTimingRangeFill(range);
    var block=range.closest('.map-timing-block')||range.closest('.keys-finish-delay-card');
    var desc=block&&block.querySelector('.map-timing-desc,.keys-finish-delay-desc');
    if(desc) desc.innerHTML=timingDescText(field,val);
    var valEl=block&&block.querySelector('.keys-finish-delay-value');
    if(valEl&&field==='enterDelayMs') valEl.textContent=formatTimingSec(val)+t('keysFinishDelayUnit');
    renderKeysFinishStrategyPreview(m);
  }

  global.OneToneKeyFinishFlowRender={
    renderKeyFinishFlowPanel:renderKeyFinishFlowPanel,
    focusSchemeEditStep:focusSchemeEditStep,
    syncKeySchemeTimeline:syncKeySchemeTimeline,
    renderKeySchemeCardHeader:renderKeySchemeCardHeader,
    handleKeyFinishFlowInput:handleKeyFinishFlowInput,
    handleKeyFinishFlowClick:handleKeyFinishFlowClick,
    scheduleTimingSave:scheduleTimingSave,
    formatTimingSec:formatTimingSec,
    syncAllTimingRanges:syncAllTimingRanges,
    liveUpdateTimingRange:liveUpdateTimingRange,
    refreshFinishModeSegment:refreshFinishModeSegment,
    renderKeysFinishStrategyPreview:renderKeysFinishStrategyPreview,
    schemeStepFocus:function(){ return schemeStepFocus; },
    syncKeyExecFinishCard:syncKeyExecFinishCard
  };
})((typeof window!=='undefined')?window:globalThis);
