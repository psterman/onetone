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
    return '<div class="mode-anim" aria-hidden="true"><div class="mode-anim-inner mode-anim-tap">'
      +'<span class="ma-chip ma-key ma-k1">1</span><span class="ma-arrow">→</span>'
      +'<span class="ma-chip ma-voice ma-v1">'+t('keyFinishFlowAnimVoice')+'</span>'
      +'<span class="ma-arrow">→</span><span class="ma-chip ma-key ma-k2">2</span><span class="ma-arrow ma-a1">→</span>'
      +'<span class="ma-out-stack">'
      +'<span class="ma-chip ma-esc ma-out-cancel">'+t('keyFinishFlowAnimCancel')+'</span>'
      +'<span class="ma-chip ma-enter ma-out-enter">'+t('keyFinishFlowAnimConfirm')+'</span>'
      +'</span></div></div>';
  }

  function renderKeyFinishModeBlock(m,id){
    var mode=normalizeUiTriggerMode(m.triggerMode);
    var html='<div class="map-trigger-mode key-scheme-finish-mode">';
    html+='<div class="map-mode-cards">';
    ['perpress','tap'].forEach(function(opt){
      var titleKey=opt==='tap'?'keyFinishFlowConfirm':'keyFinishFlowInstant';
      var descKey=titleKey+'Desc';
      html+='<button type="button" class="map-mode-card'+(mode===opt?' is-active':'')+'" data-trigger-mode="'+id+'" data-mode="'+opt+'">';
      html+=renderModeAnim(opt);
      html+='<span class="mode-card-title">'+t(titleKey)+'</span>';
      html+='<span class="mode-card-desc">'+t(descKey)+'</span>';
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
    var mode=normalizeUiTriggerMode(m.triggerMode);
    var active=mode==='tap';
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
    var stepIds={trigger:'keySchemeStepTrigger',target:'keySchemeStepTarget',finish:'keySchemeStepFinish'};
    var editIds={trigger:'keySchemeEditTrigger',target:'keySchemeEditTarget',finish:'keySchemeEditFinish'};
    ['trigger','target','finish'].forEach(function(s){
      var li=$(stepIds[s]);
      var card=$(editIds[s]);
      if(li) li.classList.toggle('is-active',s===step);
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
    }
    syncKeySchemeTimeline(step);
  }

  function renderKeySchemeCardHeader(){
    hooks().ensureConfig();
    var m=hooks().selectedMapping();
    var kicker=$('keySchemeCardKicker');
    var nameEl=$('keySchemeName');
    var bindingEl=$('keySchemeBindingLine');
    var completeEl=$('keySchemeCompletenessChip');
    var conflictEl=$('keySchemeConflictChip');
    var toggleEl=$('keySchemeEnabledToggle');
    if(kicker){
      var uiState=global.OneToneState.ui;
      var st=global.OneToneState.state;
      var panelActive=uiState.drawerOpen&&uiState.settingsPanel==='keyWake';
      var selId=st.selectedMappingId;
      var activeId=st.config&&st.config.activeSceneId;
      var isDifferent=panelActive&&selId&&activeId&&selId!==activeId;
      kicker.textContent=isDifferent?t('sceneEditingKicker'):t('keySchemeCardKicker');
    }
    if(nameEl) nameEl.textContent=m?hooks().homeSchemeLabel():'—';
    if(bindingEl){
      var binding='';
      if(m&&hooks().isSavedMapping(m)) binding=t('keyFinishFlowScheme').replace('{name}',hooks().homeSchemeLabel());
      else if(m&&hooks().isDraftMapping(m)) binding=t('keyFinishFlowSchemeDraft');
      bindingEl.textContent=binding;
      bindingEl.hidden=!binding;
    }
    if(completeEl){
      if(!m){
        completeEl.textContent='';
        completeEl.className='key-scheme-meta-chip';
      }else if(hooks().isDraftMapping(m)){
        completeEl.textContent=t('keySchemeCompletenessDraft');
        completeEl.className='key-scheme-meta-chip is-draft';
      }else if(hooks().isSavedMapping(m)){
        completeEl.textContent=t('keySchemeCompletenessDone');
        completeEl.className='key-scheme-meta-chip is-done';
      }else{
        completeEl.textContent=t('keySchemeCompletenessIncomplete');
        completeEl.className='key-scheme-meta-chip is-pending';
      }
    }
    if(conflictEl){
      var hasConflict=m?hooks().schemeMappingHasConflict(m):false;
      conflictEl.hidden=!hasConflict;
      if(hasConflict) conflictEl.textContent=t('keySchemeConflict');
    }
    if(toggleEl){
      if(m&&hooks().isSavedMapping(m)){
        toggleEl.hidden=false;
        toggleEl.classList.toggle('is-on',!!m.enabled);
        toggleEl.setAttribute('aria-checked',m.enabled?'true':'false');
        toggleEl.disabled=false;
      }else{
        toggleEl.hidden=true;
      }
    }
    var addBtn=$('btnKeySchemeAdd');
    var delBtn=$('btnKeySchemeDelete');
    var busy=global.OneToneMappingRecording.mode()!=='none';
    if(addBtn){
      addBtn.textContent=t('addMapping');
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
    var trig=hooks().selectedDisplayTriggerKey();
    var tgt=hooks().selectedDisplayTargetKey();
    var activeStep=focusStep
      ||(global.OneToneMappingRecording.mode()==='trigger'?'trigger':global.OneToneMappingRecording.mode()==='target'?'target':'')
      ||schemeStepFocus;
    var trigSummary=$('keySchemeStepTriggerSummary');
    var tgtSummary=$('keySchemeStepTargetSummary');
    var finSummary=$('keySchemeStepFinishSummary');
    if(trigSummary) trigSummary.textContent=trig?hooks().friendlyKeyName(trig):t('homeKeyMapEmptyKey');
    if(tgtSummary) tgtSummary.textContent=tgt?hooks().friendlyKeyName(tgt):t('homeKeyMapEmptyKey');
    if(finSummary){
      var preview=hooks().keyFinishPreviewText(m);
      finSummary.textContent=preview.summary||'—';
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
    if(!section) return;
    if(!m||!hooks().isSavedMapping(m)){
      section.hidden=true;
      return;
    }
    hooks().ensureMappingTiming(m);
    var mode=normalizeUiTriggerMode(m.triggerMode);
    section.hidden=mode!=='tap';
  }

  function renderKeyFinishFlowPanel(){
    var modePanel=$('voiceEndKeyModePanel');
    var cancelCard=$('voiceEndCancelCard');
    var confirmCard=$('voiceEndConfirmCard');
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
      syncKeyExecFinishTimingSection(null);
      renderKeySchemeCardHeader();
      syncKeySchemeTimeline(schemeStepFocus);
      hooks().renderHomeKeyFinishPreview(false);
      return;
    }
    syncKeyExecFinishCard();
    modePanel.innerHTML=renderKeyFinishModeBlock(m,m.id);
    cancelCard.innerHTML=renderKeyTimingCard(m,m.id,'cancel');
    confirmCard.innerHTML=renderKeyTimingCard(m,m.id,'confirm');
    syncAllTimingRanges(cancelCard);
    syncAllTimingRanges(confirmCard);
    syncKeyExecFinishTimingSection(m);
    renderKeySchemeCardHeader();
    syncKeySchemeTimeline(schemeStepFocus);
    hooks().renderHomeKeyFinishPreview(false);
  }

  function handleKeyFinishFlowInput(e){
    var range=e.target.closest&&e.target.closest('[data-timing-range]');
    if(!range) return;
    e.stopPropagation();
    liveUpdateTimingRange(range);
  }

  function handleKeyFinishFlowClick(e){
    var el=e.target;
    var modeBtn=el.closest&&el.closest('[data-trigger-mode]');
    if(modeBtn){
      e.stopPropagation();
      var id=modeBtn.dataset.triggerMode;
      var mode=modeBtn.dataset.mode;
      var m=appState().config.mappings.find(function(x){return x.id===id;});
      if(!m||!mode) return true;
      m.triggerMode=mode;
      hooks().save();
      renderKeyFinishFlowPanel();
      hooks().renderMappingList();
      return true;
    }
    var timingToggle=el.closest&&el.closest('[data-timing-toggle]');
    if(timingToggle){
      e.stopPropagation();
      var tid=timingToggle.dataset.timingToggle;
      var field=timingToggle.dataset.field;
      var tm=appState().config.mappings.find(function(x){return x.id===tid;});
      if(!tm) return true;
      if(field==='cancelEnabled'||field==='autoEnterEnabled') tm.triggerMode='tap';
      tm[field]=!tm[field];
      scheduleTimingSave();
      renderKeyFinishFlowPanel();
      hooks().renderMappingList();
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
    var id=range.dataset.timingRange;
    var field=range.dataset.field;
    var val=Number(range.value);
    var m=appState().config&&appState().config.mappings.find(function(x){return x.id===id;});
    if(!m) return;
    m[field]=val;
    scheduleTimingSave();
    syncTimingRangeFill(range);
    var block=range.closest('.map-timing-block');
    var desc=block&&block.querySelector('.map-timing-desc');
    if(desc) desc.innerHTML=timingDescText(field,val);
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
    schemeStepFocus:function(){ return schemeStepFocus; },
    syncKeyExecFinishCard:syncKeyExecFinishCard
  };
})((typeof window!=='undefined')?window:globalThis);
