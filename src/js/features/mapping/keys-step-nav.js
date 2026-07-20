(function(global){
  'use strict';
  var $=function(id){ return global.OneToneDom.$(id); };
  var t=function(key){ return global.OneToneI18n.t(key); };
  var STEPS=['trigger','target','finish'];

  var FLOW_NODE_IDS={
    trigger:{btn:'keysFlowNodeTrigger',hint:'keysFlowNodeTriggerHint'},
    target:{btn:'keysFlowNodeTarget',hint:'keysFlowNodeTargetHint'},
    finish:{btn:'keysFlowNodeFinish',hint:'keysFlowNodeFinishHint'}
  };

  function core(){
    return global.OneToneMappingCore;
  }

  function recordingMode(){
    var rec=global.OneToneMappingRecording;
    return rec&&rec.mode?rec.mode():'none';
  }

  function friendlyKey(key){
    key=String(key||'').trim();
    if(!key) return '';
    var hooks=global.__vp_mapping_core_hooks__||{};
    if(hooks.friendlyKeyName) return hooks.friendlyKeyName(key)||key;
    return key;
  }

  function codexTargetHintKey(m) {
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
    var recHint=mode==='trigger'?t('keysFlowNodeRecordingTrigger'):mode==='target'?t('keysFlowNodeRecordingTarget'):'';
    var trig='';
    var tgt='';
    var fin='';
    if(m&&core()){
      trig=triggerHintLabel(m);
      tgt=friendlyKey(codexTargetHintKey(m));
    }
    if(m&&global.OneToneSceneFlowSummary){
      var preview=global.OneToneAppBehaviorRules?global.OneToneAppBehaviorRules.getActiveAppContextId():'';
      var finTxt=global.OneToneSceneFlowSummary.finishBehaviorTextSettings(m,preview);
      fin=finTxt&&finTxt.text?finTxt.text:'';
    }
    if(!fin&&m&&core()&&core().isSaved&&core().isSaved(m)) fin=t('habitKeyMapStatusEnabled');
    return {
      trigger:recHint&&mode==='trigger'?recHint:(trig||t('keysStatusUnset')),
      target:recHint&&mode==='target'?recHint:(tgt||t('keysStatusUnset')),
      finish:fin||t('keysStatusUnset')
    };
  }

  function syncFlowNodes(step){
    var mode=recordingMode();
    STEPS.forEach(function(page){
      var meta=FLOW_NODE_IDS[page];
      if(!meta) return;
      var btn=$(meta.btn);
      if(!btn) return;
      var on=page===step;
      btn.classList.toggle('is-active',on);
      btn.setAttribute('aria-pressed',on?'true':'false');
      btn.classList.toggle('is-recording',mode===page);
    });
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
    var hints=resolveStepHints(m);
    STEPS.forEach(function(page){
      var meta=FLOW_NODE_IDS[page];
      if(!meta) return;
      var hintEl=$(meta.hint);
      if(hintEl) hintEl.textContent=hints[page]||'';
    });
    syncFlowNodes(global.OneToneKeysPageState?global.OneToneKeysPageState.getStep():'trigger');
  }

  function render(m){
    syncActive(global.OneToneKeysPageState?global.OneToneKeysPageState.getStep():'trigger');
    renderStepHints(m);
  }

  global.OneToneKeysPageNav={
    bind:bind,
    render:render,
    syncActive:syncActive,
    renderStepHints:renderStepHints
  };
})((typeof window!=='undefined')?window:globalThis);
