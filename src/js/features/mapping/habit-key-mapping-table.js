(function(global){
  'use strict';

  var $=function(id){ return global.OneToneDom.$(id); };
  var t=function(key){ return global.OneToneI18n.t(key); };
  function core(){ return global.OneToneMappingCore; }

  var mounted=false;
  var highlightStep='';

  function moveChild(parent,child){
    if(!parent||!child) return;
    if(child.parentNode!==parent) parent.appendChild(child);
  }

  function mount(){
    var trigCell=$('habitKeyMapCellTrigger');
    var tgtCell=$('habitKeyMapCellTarget');
    var trigAct=$('habitKeyMapActTrigger');
    var tgtAct=$('habitKeyMapActTarget');
    if(trigCell){
      var disp=$('triggerDisplay');
      var btn=$('btnRecordTrigger');
      if(disp) moveChild(trigCell,disp);
      if(btn) moveChild(trigAct||trigCell,btn);
    }
    if(tgtCell){
      var disp2=$('targetDisplay');
      var btn2=$('btnRecordTarget');
      if(disp2) moveChild(tgtCell,disp2);
      if(btn2) moveChild(tgtCell||tgtAct,btn2);
    }
    var cancelCard=$('voiceEndCancelCard');
    var cancelCell=$('habitKeyMapCellCancel');
    var cancelHost=$('keysFinishCancelHost');
    // Prefer the in-slot host; only fall back to moving the legacy card when host is absent.
    if(cancelCard&&cancelCell&&!cancelHost) moveChild(cancelCell,cancelCard);
    mounted=true;
  }

  function ensureMounted(){
    if(!mounted) mount();
  }

  function rowStatusForStep(m,step){
    if(!m||!core()) return {text:'—',kind:'none'};
    if(step==='trigger'){
      var trig=core().editorTrigger?core().editorTrigger(m):((m.triggerKey||'').trim());
      return trig?{text:t('habitKeyMapStatusEnabled'),kind:'on'}:{text:t('habitKeyMapStatusDisabled'),kind:'off'};
    }
    if(step==='target'){
      var tgt=core().editorTarget?core().editorTarget(m):((m.targetKey||'').trim());
      return tgt?{text:t('habitKeyMapStatusEnabled'),kind:'on'}:{text:t('habitKeyMapStatusDisabled'),kind:'off'};
    }
    if(step==='cancel'){
      var cancel=!!m.cancelEnabled;
      return cancel?{text:t('habitKeyMapStatusEnabled'),kind:'on'}:{text:t('habitKeyMapStatusDisabled'),kind:'off'};
    }
    if(step==='finish'){
      return core().isSaved(m)?{text:t('habitKeyMapStatusEnabled'),kind:'on'}:{text:t('habitKeyMapStatusDisabled'),kind:'off'};
    }
    return {text:'—',kind:'none'};
  }

  function syncFinishPreview(m){
    var el=$('habitFlowFinishKey');
    if(!el||!global.OneToneSceneFlowSummary) return;
    var preview=global.OneToneAppBehaviorRules?global.OneToneAppBehaviorRules.getActiveAppContextId():'';
    var fin=global.OneToneSceneFlowSummary.finishBehaviorTextSettings(m,preview);
    el.textContent=fin.text||'—';
    el.className='home-key-map-key habit-flow-finish-preview'+(fin.saved?' is-set':' is-empty');
  }

  function syncRowStatus(){
    ensureMounted();
    var m=core()&&core().selected?core().selected():null;
    [['Trigger','trigger'],['Target','target'],['Cancel','cancel'],['Finish','finish']].forEach(function(pair){
      var stEl=$('habitKeyMapSt'+pair[0]);
      var row=$('habitKeyMapRow'+pair[0]);
      if(!stEl) return;
      var st=rowStatusForStep(m,pair[1]);
      stEl.textContent=st.text;
      stEl.className='habit-flow-step-status is-'+st.kind;
      if(row) row.classList.toggle('is-highlight',highlightStep===pair[1]);
    });
    syncFinishPreview(m);
    if(global.OneToneSceneFlowSummary&&m){
      var preview=global.OneToneAppBehaviorRules?global.OneToneAppBehaviorRules.getActiveAppContextId():'';
      global.OneToneSceneFlowSummary.syncFlowSummary(m,{context:'settings',prefix:'habitFlow',activeAppContextId:preview,focusStep:highlightStep});
    }
    if(global.OneToneKeysPageNav&&global.OneToneKeysPageNav.renderStepHints){
      global.OneToneKeysPageNav.renderStepHints(m);
    }
  }

  function highlightRow(step){
    highlightStep=step||'';
    syncRowStatus();
    if(step==='finish'||step==='cancel'){
      var more=$('habitFlowFinishMore');
      if(more) more.open=true;
    }
    if(step&&step!=='cancel'){
      var row=$('habitKeyMapRow'+step.charAt(0).toUpperCase()+step.slice(1));
      if(row) row.scrollIntoView({behavior:'smooth',block:'nearest'});
    }
    if(step==='cancel'){
      var cancelRow=$('habitKeyMapRowCancel');
      if(cancelRow) cancelRow.scrollIntoView({behavior:'smooth',block:'nearest'});
    }
    if(!step) return;
    setTimeout(function(){ highlightStep=''; syncRowStatus(); },1600);
  }

  function setDetailStep(step,opts){
    if(global.OneToneKeysPageState){
      global.OneToneKeysPageState.setStep(step,opts);
      return;
    }
    highlightRow(step);
  }

  function onStepClick(step){
    if(step==='cancel'){
      setDetailStep('cancel');
      return;
    }
    if(step==='trigger'||step==='target'||step==='finish'){
      setDetailStep(step);
    }
  }

  function openTargetKeyPicker(){
    if(global.OneToneTargetKeyPicker&&global.OneToneTargetKeyPicker.open){
      global.OneToneTargetKeyPicker.open();
    }
  }

  function startTargetRecordForKeysPanel(){
    var rec=global.OneToneMappingRecording;
    if(rec&&rec.isPending&&rec.isPending()) return;
    if(global.OneToneTargetKeyPicker&&global.OneToneTargetKeyPicker.close){
      global.OneToneTargetKeyPicker.close();
    }
    var bootHooks=global.__vp_bootstrap_hooks__||{};
    if(bootHooks.startTargetRecord) bootHooks.startTargetRecord();
  }

  function startTriggerRecord(){
    var rec=global.OneToneMappingRecording;
    var mode=rec&&rec.mode?rec.mode():'none';
    if(mode!=='none') return;
    var bootHooks=global.__vp_bootstrap_hooks__||{};
    if(bootHooks.startTriggerRecord) bootHooks.startTriggerRecord();
  }

  function handleKeycapStep(step){
    if(step==='trigger'){
      setDetailStep('trigger',{skipScroll:true});
      startTriggerRecord();
      highlightRow('trigger');
      return;
    }
    if(step==='target'){
      setDetailStep('target',{skipScroll:true});
      openTargetKeyPicker();
      highlightRow('target');
    }
  }

  function isInteractiveFlowTarget(el){
    if(!el||!el.closest) return false;
    if(el.closest('.record-btn')) return true;
    if(el.closest('.keys-step-key-area,.keys-flow-key,.habit-basic-key-display')) return true;
    return !!el.closest([
      '.voice-end-key-mode-panel','.keys-finish-mode-host','.keys-finish-delay-host',
      '.keys-finish-cancel-host','[data-finish-mode]','[data-timing-toggle]','[data-timing-range]',
      '.toggle-switch','.keys-finish-segment','.keys-capture-voice-summary','.keys-capture-voice-link',
      '.habit-flow-finish-more','.map-timing-range','details','.ime-preset-strip','.ime-preset-item','.habit-flow-ime-block','.keys-capture-ime-block',
      '.habit-flow-device-link','.keys-app-context-strip','.habit-flow-device-diagnostic',
      '.keys-app-chip','.keys-ime-pill','.btn-cancel-record',
      '.keys-workflow-keycap-zone','.keys-workflow-footer-zone','.keys-trigger-modes-block','#keysTargetKeycapHint',
      'input','button','select','textarea','label',
      '.keys-trigger-mode-seg','.keys-trigger-conflict-btn','.keys-finish-delay-input'
    ].join(','));
  }

  function bindEvents(){
    ensureMounted();
    if(global.OneToneKeysPageNav&&global.OneToneKeysPageNav.bind) global.OneToneKeysPageNav.bind();
    if(global.OneToneKeysPageState&&global.OneToneKeysPageState.init) global.OneToneKeysPageState.init();
    var flow=$('habitDefaultFlow');
    if(flow){
      flow.addEventListener('click',function(e){
        if(e.target.closest('.record-btn')){
          var stepEl=e.target.closest&&e.target.closest('[data-edit-step]');
          var step=stepEl&&stepEl.dataset.editStep;
          if(step==='trigger'){
            e.preventDefault();
            e.stopPropagation();
            startTriggerRecord();
            highlightRow('trigger');
          }
          if(step==='target'){
            e.preventDefault();
            e.stopPropagation();
            startTargetRecordForKeysPanel();
            highlightRow('target');
          }
          return;
        }
        var keyArea=e.target.closest&&e.target.closest('.keys-step-key-area,.keys-flow-key,.habit-basic-key-display');
        if(keyArea){
          var stepFromKey=e.target.closest&&e.target.closest('[data-edit-step]');
          var keyStep=stepFromKey&&stepFromKey.dataset.editStep;
          if(keyStep==='trigger'||keyStep==='target'){
            e.preventDefault();
            e.stopPropagation();
            handleKeycapStep(keyStep);
          }
          return;
        }
        if(isInteractiveFlowTarget(e.target)) return;
        var stepEl=e.target.closest&&e.target.closest('[data-edit-step]');
        if(!stepEl) return;
        var step=stepEl.dataset.editStep;
        if(step) onStepClick(step);
      });
    }
  }

  global.OneToneHabitKeyMappingTable={
    mount:mount,
    syncRowStatus:syncRowStatus,
    highlightRow:highlightRow,
    bindEvents:bindEvents,
    openTargetKeyPicker:openTargetKeyPicker,
    startTargetRecordForKeysPanel:startTargetRecordForKeysPanel
  };
})((typeof window!=='undefined')?window:globalThis);
