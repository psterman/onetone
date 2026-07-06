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
    if(cancelCard&&cancelCell) moveChild(cancelCell,cancelCard);
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
    var preview=global.OneToneAppBehaviorRules?global.OneToneAppBehaviorRules.getPreviewAppId():'';
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
      var preview=global.OneToneAppBehaviorRules?global.OneToneAppBehaviorRules.getPreviewAppId():'';
      global.OneToneSceneFlowSummary.syncFlowSummary(m,{context:'settings',prefix:'habitFlow',previewAppId:preview,focusStep:highlightStep});
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

  function bindEvents(){
    ensureMounted();
    var flow=$('habitDefaultFlow');
    if(flow){
      flow.addEventListener('click',function(e){
        var stepEl=e.target.closest&&e.target.closest('[data-edit-step]');
        if(!stepEl||e.target.closest('.record-btn')||e.target.closest('.voice-end-key-mode-panel')||e.target.closest('details')||e.target.closest('.ime-preset-strip')||e.target.closest('.habit-flow-device-link')) return;
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
