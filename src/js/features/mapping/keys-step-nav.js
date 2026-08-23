(function(global){
  'use strict';
  var $=function(id){ return global.OneToneDom.$(id); };
  var t=function(key){ return global.OneToneI18n.t(key); };
  var STEPS=['trigger','target'];
  var lastFlowMapping=null;

  var FLOW_NODE_IDS={
    trigger:{btn:'keysFlowNodeTrigger',hint:'keysFlowNodeTriggerHint'},
    target:{btn:'keysFlowNodeTarget',hint:'keysFlowNodeTargetHint'}
  };

  function core(){
    return global.OneToneMappingCore;
  }

  function recordingMode(){
    var rec=global.OneToneMappingRecording;
    return rec&&rec.mode?rec.mode():'none';
  }

  function recordingIpcPhase(){
    var rec=global.OneToneMappingRecording;
    if(rec&&rec.ipcPhase) return rec.ipcPhase();
    return global.__otRecordIpcPhase||'idle';
  }

  function isRecordingUi(){
    var rec=global.OneToneMappingRecording;
    if(rec&&rec.isRecordingUi) return !!rec.isRecordingUi();
    var life=global.OneToneRecordIpcLifecycle;
    var mode=recordingMode();
    var phase=recordingIpcPhase();
    if(life&&life.isRecordingUi) return !!life.isRecordingUi(mode,phase);
    return mode==='trigger'||mode==='target'||mode==='agentBinding';
  }

  function friendlyKey(key){
    key=String(key||'').trim();
    if(!key) return '';
    var hooks=global.__vp_mapping_core_hooks__||{};
    if(hooks.friendlyKeyName) return hooks.friendlyKeyName(key)||key;
    return key;
  }

  function codexTargetHintKey(m) {
    var picker = global.OneToneKeysChannelCommandPicker;
    if (picker && typeof picker.resolveHeroCapture === 'function') {
      var cap = picker.resolveHeroCapture(m);
      if (cap && cap.primaryLabel) return cap.primaryLabel;
    }
    var cap = global.OneToneAgentCapabilityUi;
    if (cap && cap.flowTargetDisplayKey) {
      var ck = cap.flowTargetDisplayKey(m);
      if (ck) return ck;
    }
    var hooks = global.__vp_mapping_core_hooks__ || {};
    if (hooks.selectedDisplayTargetKey) return hooks.selectedDisplayTargetKey();
    if (m && core()) return core().editorTarget ? core().editorTarget(m) : m.targetKey;
    return '';
  }

  function triggerHintLabel(m){
    if(!m) return '';
    var lang=global.OneToneI18n&&global.OneToneI18n.getLang?global.OneToneI18n.getLang():'zh';
    if(global.OneToneKeyLabels&&global.OneToneKeyLabels.triggerDisplayLabel){
      return global.OneToneKeyLabels.triggerDisplayLabel(m,lang)||'';
    }
    return friendlyKey(core().editorTrigger?core().editorTrigger(m):m.triggerKey);
  }

  function resolveStepHints(m){
    var mode=recordingMode();
    var recHint=mode==='trigger'?t('keysFlowNodeRecordingTrigger')
      :mode==='agentBinding'?t('keysStatusRecordingCap','录制能力快捷键中')
      :mode==='target'?t('keysFlowNodeRecordingTarget'):'';
    var trig='';
    var tgt='';
    if(m&&core()){
      trig=triggerHintLabel(m);
      tgt=friendlyKey(codexTargetHintKey(m));
      if(mode==='trigger'&&tgt) tgt=t('keysHeroModeIme','输入法识别键')+' · '+tgt;
    }
    if(!tgt&&m&&global.OneToneSceneFlowSummary){
      var preview=global.OneToneAppBehaviorRules?global.OneToneAppBehaviorRules.getActiveAppContextId():'';
      var finTxt=global.OneToneSceneFlowSummary.finishBehaviorTextSettings(m,preview);
      if(finTxt&&finTxt.text) tgt=t('keysCaptureEntryFinishHint','收尾')+' · '+finTxt.text;
    }
    var capUi=global.OneToneAgentCapabilityUi;
    var codexCtx=capUi&&capUi.isCodexKeysEditing&&capUi.isCodexKeysEditing();
    return {
      trigger:recHint&&mode==='trigger'?recHint:(trig||t('keysStatusUnset')),
      target:recHint&&(mode==='target'||mode==='agentBinding')?recHint:(tgt||t('keysStatusUnset')),
      codexCtx:!!codexCtx
    };
  }

  function buildKeysFlowChromeModel(m){
    if(m) lastFlowMapping=m;
    m=m||lastFlowMapping||(core()&&core().selected?core().selected():null);
    var step=global.OneToneKeysPageState&&global.OneToneKeysPageState.getStep
      ?global.OneToneKeysPageState.getStep()
      :'trigger';
    var mode=recordingMode();
    var ipcPhase=recordingIpcPhase();
    var recording=isRecordingUi();
    var hints=resolveStepHints(m);
    var sig=[step,mode,ipcPhase,recording?'1':'0',hints.trigger||'',hints.target||'',hints.codexCtx?'1':'0'].join('\0');
    return {
      activeStep:step,
      recordingMode:mode,
      ipcPhase:ipcPhase,
      recording:recording,
      triggerHint:hints.trigger||'',
      targetHint:hints.target||'',
      finishHint:'',
      sig:sig
    };
  }

  function applyKeysFlowChromeHost(model){
    if(!model) model=buildKeysFlowChromeModel();
    if(global.__otKeysFlowChromeMounted&&typeof global.__otKeysFlowChromeSync==='function'){
      global.__otKeysFlowChromeSync();
      return;
    }
    var mode=model.recordingMode||recordingMode();
    var recording=typeof model.recording==='boolean'?model.recording:isRecordingUi();
    STEPS.forEach(function(page){
      var meta=FLOW_NODE_IDS[page];
      if(!meta) return;
      var btn=$(meta.btn);
      if(btn){
        var on=page===model.activeStep;
        btn.classList.toggle('is-active',on);
        btn.setAttribute('aria-selected',on?'true':'false');
        btn.classList.toggle('is-recording',!!recording&&(mode===page||(page==='target'&&mode==='agentBinding')));
      }
      var hintEl=$(meta.hint);
      if(hintEl){
        var key=page+'Hint';
        hintEl.textContent=model[key]||'';
      }
    });
  }

  function syncFlowNodes(step){
    var model=buildKeysFlowChromeModel();
    if(step) model.activeStep=step;
    applyKeysFlowChromeHost(model);
  }

  function syncActive(step){
    STEPS.forEach(function(page){
      var rowId='habitKeyMapRow'+page.charAt(0).toUpperCase()+page.slice(1);
      var card=$(rowId);
      if(!card) return;
      var on=page===step;
      card.setAttribute('aria-expanded',on?'true':'false');
      var head=card.querySelector('.keys-step-card-head');
      if(head) head.setAttribute('aria-selected',on?'true':'false');
    });
    syncFlowNodes(step);
  }

  function goToStep(page,opts){
    if(STEPS.indexOf(page)<0) return;
    if(global.OneToneKeysPageState) global.OneToneKeysPageState.setStep(page,opts);
  }

  function bindFlowNodes(){
    var nodes=$('keysFlowNodes');
    if(!nodes||nodes.dataset.keysFlowNodesBound==='1') return;
    nodes.dataset.keysFlowNodesBound='1';
    nodes.addEventListener('click',function(e){
      var btn=e.target.closest&&e.target.closest('.flow-node-btn');
      if(!btn) return;
      var node=btn.closest('[data-keys-node]');
      if(!node) return;
      e.preventDefault();
      goToStep(node.getAttribute('data-keys-node')||'');
    });
    nodes.addEventListener('keydown',function(e){
      if(e.key!=='Enter'&&e.key!==' ') return;
      var btn=e.target.closest&&e.target.closest('.flow-node-btn');
      if(!btn) return;
      var node=btn.closest('[data-keys-node]');
      if(!node) return;
      e.preventDefault();
      goToStep(node.getAttribute('data-keys-node')||'');
    });
  }

  function bind(){
    bindFlowNodes();
    if(global.OneToneKeysPageState){
      syncActive(global.OneToneKeysPageState.getStep());
    }
  }

  function renderStepHints(m){
    if(m) lastFlowMapping=m;
    applyKeysFlowChromeHost(buildKeysFlowChromeModel(m));
  }

  function render(m){
    if(m) lastFlowMapping=m;
    syncActive(global.OneToneKeysPageState?global.OneToneKeysPageState.getStep():'trigger');
    renderStepHints(m);
  }

  global.OneToneKeysPageNav={
    bind:bind,
    render:render,
    syncActive:syncActive,
    renderStepHints:renderStepHints,
    // P12c-1：flow nodes / hints chrome
    buildKeysFlowChromeModel:buildKeysFlowChromeModel
  };
})((typeof window!=='undefined')?window:globalThis);
