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
      if(btn2) moveChild(tgtAct||tgtCell,btn2);
    }
    var cancelCard=$('voiceEndCancelCard');
    var cancelCell=$('habitKeyMapCellCancel');
    if(cancelCard&&cancelCell&&!$('keysFinishCancelHost')) moveChild(cancelCell,cancelCard);
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
  }

  function highlightRow(step){
    highlightStep=step||'';
    syncRowStatus();
    var row=$('habitKeyMapRow'+step.charAt(0).toUpperCase()+step.slice(1));
    if(row) row.scrollIntoView({behavior:'smooth',block:'nearest'});
    if(step==='finish'){
      var more=$('habitFlowFinishMore');
      if(more) more.open=true;
    }
    if(!step) return;
    setTimeout(function(){ highlightStep=''; syncRowStatus(); },1600);
  }

  function onStepClick(step){
    highlightRow(step);
    if(step==='finish'){
      var more=$('habitFlowFinishMore');
      if(more) more.open=true;
    }
  }

  function startRecordForStep(step){
    if(step!=='trigger'&&step!=='target') return;
    var rec=global.OneToneMappingRecording;
    var mode=rec&&rec.mode?rec.mode():'none';
    if(mode!=='none') return;
    var bootHooks=global.__vp_bootstrap_hooks__||{};
    if(step==='trigger'&&bootHooks.startTriggerRecord) bootHooks.startTriggerRecord();
    else if(step==='target'&&bootHooks.startTargetRecord) bootHooks.startTargetRecord();
  }

  function isInteractiveFlowTarget(el){
    if(!el||!el.closest) return false;
    if(el.closest('.record-btn')) return true;
    if(el.closest('.keys-step-key-area,.keys-flow-key,.habit-basic-key-display')) return true;
    return !!el.closest([
      '.voice-end-key-mode-panel','.keys-finish-mode-host','.keys-finish-delay-host',
      '.keys-finish-cancel-host','[data-finish-mode]','[data-timing-toggle]','[data-timing-range]',
      '.toggle-switch','.keys-finish-segment','.keys-capture-voice-summary','.keys-capture-voice-link',
      '.habit-flow-finish-more','.map-timing-range','details','.ime-preset-strip',
      '.habit-flow-device-link','.keys-app-context-strip','.habit-flow-device-diagnostic',
      '.keys-app-chip','.keys-ime-pill','.btn-cancel-record','input','button','select','textarea','label',
      '.keys-trigger-mode-seg','.keys-trigger-conflict-btn','.keys-finish-delay-input'
    ].join(','));
  }

  function bindEvents(){
    ensureMounted();
    var flow=$('habitDefaultFlow');
    if(flow){
      flow.addEventListener('click',function(e){
        if(e.target.closest('.record-btn')){
          var stepEl=e.target.closest&&e.target.closest('[data-edit-step]');
          var step=stepEl&&stepEl.dataset.editStep;
          if(step==='trigger'||step==='target') highlightRow(step);
          return;
        }
        var keyArea=e.target.closest&&e.target.closest('.keys-step-key-area,.keys-flow-key,.habit-basic-key-display');
        if(keyArea){
          var stepFromKey=e.target.closest&&e.target.closest('[data-edit-step]');
          var keyStep=stepFromKey&&stepFromKey.dataset.editStep;
          if(keyStep==='trigger'||keyStep==='target'){
            startRecordForStep(keyStep);
            highlightRow(keyStep);
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
    bindEvents:bindEvents
  };
})((typeof window!=='undefined')?window:globalThis);
