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
    var rules=global.OneToneAppBehaviorRules;
    var ctx=activeAppContextId();
    if(!ctx&&rules&&rules.resolvePreviewContext) ctx=rules.resolvePreviewContext(m)||'';
    if(ctx&&fs.resolveEffectiveFinishMode) return fs.resolveEffectiveFinishMode(m,ctx);
    var appId=primaryAppIdForMapping(m);
    if(appId&&fs.resolveEffectiveFinishMode) return fs.resolveEffectiveFinishMode(m,appId);
    return fs.resolveFinishMode?fs.resolveFinishMode(m):'manual';
  }

  function startGesture(m){
    var fs=global.OneToneSceneFlowSummary;
    if(fs&&fs.resolveStartGesture) return fs.resolveStartGesture(m);
    var raw=String(m&&m.triggerMode||'tap').toLowerCase();
    if(raw==='hold'||raw==='longpress'||raw==='perpress') return 'hold';
    if(raw==='double') return 'double';
    return 'tap';
  }

  function finishModeOptionMeta(mode,gesture){
    if(mode==='perpress'){
      return {title:'habitFinishModeAuto',desc:'habitFinishModeAutoDesc',hint:'keysFinishModeHintHold'};
    }
    if(mode==='confirm'){
      if(gesture==='double'){
        return {title:'habitFinishModeConfirmDouble',desc:'habitFinishModeConfirmDoubleDesc',hint:'keysFinishModeHintDoubleSend',recommended:true};
      }
      return {title:'habitFinishModeConfirmSend',desc:'habitFinishModeConfirmSendDesc',hint:'keysFinishModeHintTapSend',recommended:true};
    }
    if(gesture==='double'){
      return {title:'habitFinishModeManualDouble',desc:'habitFinishModeManualDoubleDesc',hint:'keysFinishModeHintDoubleManual'};
    }
    return {title:'habitFinishModeManual',desc:'habitFinishModeManualDesc',hint:'keysFinishModeHintTapManual'};
  }

  function allowedFinishModes(m){
    var fs=global.OneToneSceneFlowSummary;
    var gesture=startGesture(m);
    if(fs&&fs.finishModesForGesture) return fs.finishModesForGesture(gesture);
    return gesture==='hold'?['perpress']:['confirm','manual'];
  }

  function finishModeHintKey(mode,gesture){
    return finishModeOptionMeta(mode,gesture||'tap').hint;
  }

  function syncKeysFinishModeChrome(m,finishMode){
    var gesture=m?startGesture(m):'tap';
    var hint=$('keysFinishModeHint');
    if(hint){
      if(m&&finishMode){
        hint.textContent=t(finishModeHintKey(finishMode,gesture));
        hint.hidden=false;
      }else{
        hint.textContent='';
        hint.hidden=true;
      }
    }
    var more=$('habitFlowFinishMore');
    if(more){
      var showCancel=!!(m&&finishMode==='confirm');
      more.hidden=!showCancel;
      if(!showCancel) more.open=false;
    }
  }

  function renderKeyFinishModeSegmented(m){
    var current=resolveDisplayedFinishMode(m);
    var gesture=startGesture(m);
    var allowed=allowedFinishModes(m);
    if(allowed.indexOf(current)<0) current=allowed[0]||'manual';
    var html='<div class="keys-finish-segments" role="radiogroup" aria-label="'+t('habitFlowStepFinishLbl')+'">';
    allowed.forEach(function(mode){
      var meta=finishModeOptionMeta(mode,gesture);
      var active=current===mode;
      html+='<button type="button" class="keys-finish-segment'+(active?' is-active':'')+'" data-finish-mode="'+mode+'" role="radio" aria-checked="'+(active?'true':'false')+'">';
      html+='<span class="keys-finish-segment-label">'+t(meta.title)+'</span>';
      if(meta.recommended) html+='<span class="keys-finish-segment-badge">'+t('habitFinishModeRecommended')+'</span>';
      html+='</button>';
    });
    html+='</div>';
    return html;
  }

  function renderKeysFinishDelayOnly(m,id){
    hooks().ensureMappingTiming(m);
    var seconds=((m.enterDelayMs||1200)/1000).toFixed(1);
    var html='<div class="keys-finish-delay-card">';
    html+='<div class="keys-finish-delay-head"><span class="keys-finish-delay-label">'+t('sendTimingTitle')+'</span>';
    html+='<span class="keys-finish-delay-value">'+t('sendTimingDesc').replace('{n}',seconds)+'</span></div>';
    html+='<div class="voice-end-inline-range keys-finish-delay-range keys-finish-delay-controls">';
    html+='<input type="range" class="map-timing-range" data-timing-range="'+id+'" data-field="enterDelayMs" min="1000" max="15000" step="500" value="'+(m.enterDelayMs||1200)+'">';
    html+='<input type="number" class="keys-finish-delay-input" data-timing-range="'+id+'" data-field="enterDelayMs" min="1" max="15" step="0.5" value="'+seconds+'">';
  html+='</div></div>';
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
    var rules=global.OneToneAppBehaviorRules;
    var ctx=activeAppContextId();
    if(!ctx&&rules&&rules.resolvePreviewContext) ctx=rules.resolvePreviewContext(m)||'';
    if(!ctx) ctx=primaryAppIdForMapping(m)||'';
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
    syncKeysFinishModeChrome(m,current);
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
    var gesture=startGesture(m);
    var allowed=allowedFinishModes(m);
    if(allowed.indexOf(current)<0) current=allowed[0]||'manual';
    var html='<div class="map-trigger-mode habit-finish-modes">';
    html+='<div class="habit-finish-mode-list">';
    allowed.forEach(function(mode){
      var meta=finishModeOptionMeta(mode,gesture);
      var active=current===mode;
      html+='<button type="button" class="habit-finish-mode-option'+(active?' is-active':'')+'" data-finish-mode="'+mode+'">';
      html+=finishModeIcon(mode);
      html+='<span class="habit-finish-mode-copy"><span class="habit-finish-mode-title">'+t(meta.title)+'</span>';
      if(meta.recommended) html+='<span class="habit-finish-mode-badge">'+t('habitFinishModeRecommended')+'</span>';
      html+='<span class="habit-finish-mode-desc">'+t(meta.desc)+'</span></span>';
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
    if(global.OneToneKeysPageState){
      global.OneToneKeysPageState.setStep(step,{skipScroll:true});
    }
    var focusStep=step;
    var card=$(editIds[focusStep]);
    if(card){
      card.classList.add('is-focus-highlight');
      clearTimeout(schemeStepHighlightTimer);
      schemeStepHighlightTimer=setTimeout(function(){
        card.classList.remove('is-focus-highlight');
      },1500);
    }else if(step==='cancel'){
      var cancelCard=$('habitKeyMapRowCancel');
      if(cancelCard){
        cancelCard.classList.add('is-focus-highlight');
        clearTimeout(schemeStepHighlightTimer);
        schemeStepHighlightTimer=setTimeout(function(){
          cancelCard.classList.remove('is-focus-highlight');
        },1500);
      }
    }else{
      var flowEl=$(flowIds[step]);
      if(flowEl) flowEl.scrollIntoView({behavior:'smooth',block:'nearest'});
    }
    var nodes=$('keysFlowNodes');
    var desk=$('keysDeskPanel');
    if(nodes&&nodes.scrollIntoView) nodes.scrollIntoView({behavior:'smooth',block:'nearest'});
    if(desk&&desk.scrollIntoView) desk.scrollIntoView({behavior:'smooth',block:'nearest'});
    if(global.OneToneHabitKeyMappingTable){
      if(step==='cancel'){
        global.OneToneHabitKeyMappingTable.highlightRow('cancel');
      }else{
        global.OneToneHabitKeyMappingTable.highlightRow(step);
      }
    }
    syncKeySchemeTimeline(step==='cancel'?'finish':step);
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
      var rules=global.OneToneAppBehaviorRules;
      var ctx=activeAppContextId();
      if(!ctx&&rules&&rules.resolvePreviewContext) ctx=rules.resolvePreviewContext(m)||'';
      var preview=global.OneToneSceneFlowSummary&&global.OneToneSceneFlowSummary.finishStrategyPreviewText
        ?global.OneToneSceneFlowSummary.finishStrategyPreviewText(m,ctx)
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
      syncKeysFinishModeChrome(null,'');
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
    syncKeysFinishModeChrome(m,finishMode);
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
      var ctx=activeAppContextId();
      if(!ctx&&abr&&abr.resolvePreviewContext) ctx=abr.resolvePreviewContext(m)||'';
      if(!ctx) ctx=primaryApp;
      if(ctx&&abr&&abr.setAppFinishMode){
        abr.setAppFinishMode(m,ctx,mode);
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
      var modeLc=String(mode||'').toLowerCase();
      if(modeLc==='longpress'||modeLc==='hold'||modeLc==='perpress'){
        var gateApi=global.OneToneHomeWorkbenchCompat;
        var gate=gateApi&&gateApi.canUseHoldMode
          ?gateApi.canUseHoldMode(m.id,{currentMode:m.triggerMode})
          :{ok:false,messageKey:'keysHoldGateUntested'};
        if(!gate.ok){
          if(global.OneToneApp&&global.OneToneApp.toast){
            global.OneToneApp.toast(t(gate.messageKey||'keysHoldGateUntested'),'warn');
          }
          return true;
        }
        mode='longpress';
      }
      var prevGesture=startGesture(m);
      m.triggerMode=mode;
      var nextGesture=startGesture(m);
      // Align finish with the new start gesture so hold vs tap/double stay consistent.
      if(global.OneToneSceneFlowSummary&&global.OneToneSceneFlowSummary.applyFinishMode){
        if(nextGesture==='hold'){
          global.OneToneSceneFlowSummary.applyFinishMode(m,'perpress');
        }else if(prevGesture==='hold'){
          global.OneToneSceneFlowSummary.applyFinishMode(m,'confirm');
        }
      }
      hooks().save();
      renderKeyFinishFlowPanel();
      hooks().renderMappingList();
      if(global.OneToneKeysPanelUi&&global.OneToneKeysPanelUi.render) global.OneToneKeysPanelUi.render();
      return true;
    }
    var holdSwitch=el.closest&&el.closest('[data-keys-hold-switch]');
    if(holdSwitch){
      var switchTo=String(holdSwitch.getAttribute('data-keys-hold-switch')||'tap').toLowerCase();
      var mid=String(holdSwitch.getAttribute('data-mapping-id')||'').trim();
      var row=mid?appState().config.mappings.find(function(x){return x.id===mid;}):hooks().selectedMapping();
      if(!row) return false;
      e.stopPropagation();
      if(switchTo!=='double') switchTo='tap';
      var prevG=startGesture(row);
      row.triggerMode=switchTo;
      if(global.OneToneSceneFlowSummary&&global.OneToneSceneFlowSummary.applyFinishMode&&prevG==='hold'){
        global.OneToneSceneFlowSummary.applyFinishMode(row,'confirm');
      }
      hooks().save();
      renderKeyFinishFlowPanel();
      hooks().renderMappingList();
      if(global.OneToneKeysPanelUi&&global.OneToneKeysPanelUi.render) global.OneToneKeysPanelUi.render();
      return true;
    }
    var timingToggle=el.closest&&el.closest('[data-timing-toggle]');
    if(timingToggle){
      var field=timingToggle.dataset.field;
      var m=hooks().selectedMapping();
      if(!m||!field) return false;
      e.stopPropagation();
      if(field==='cancelEnabled'||field==='autoEnterEnabled'){
        var g=startGesture(m);
        if(g==='hold') m.triggerMode='tap';
        // Preserve double-click start; do not force tap.
      }
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
    if(range.type==='number'&&field==='enterDelayMs') val=Math.round(val*1000);
    var m=hooks().selectedMapping();
    if(!m) return;
    m[field]=val;
    scheduleTimingSave();
    syncTimingRangeFill(range);
    var block=range.closest('.map-timing-block')||range.closest('.keys-finish-delay-card');
    var desc=block&&block.querySelector('.map-timing-desc,.keys-finish-delay-desc,.keys-finish-delay-value');
    if(desc&&desc.classList.contains('keys-finish-delay-value')){
      desc.textContent=t('sendTimingDesc').replace('{n}',formatTimingSec(val));
    }else if(desc) desc.innerHTML=timingDescText(field,val);
    var valEl=block&&block.querySelector('.keys-finish-delay-value');
    if(valEl&&field==='enterDelayMs'&&valEl.classList.contains('keys-finish-delay-value')){
      valEl.textContent=t('sendTimingDesc').replace('{n}',formatTimingSec(val));
    }
    var numInput=block&&block.querySelector('.keys-finish-delay-input');
    var rangeInput=block&&block.querySelector('.map-timing-range');
    if(numInput&&rangeInput&&field==='enterDelayMs'){
      if(range.type==='range') numInput.value=formatTimingSec(val);
      else rangeInput.value=String(val);
      syncTimingRangeFill(rangeInput);
    }
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
