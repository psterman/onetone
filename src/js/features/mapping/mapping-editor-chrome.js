(function(global){
  'use strict';
  var $=function(id){ return global.OneToneDom.$(id); };
  var t=function(key){ return global.OneToneI18n.t(key); };
  var core=function(){ return global.OneToneMappingCore; };

  function isCurrentDraftComplete(){
    return core().sorted().some(function(item){
      return !!(core().editorTrigger(item)&&core().editorTarget(item));
    });
  }

  function renderAddButton(){
    var btn=$('btnAddMapping');
    var keyAdd=$('btnKeySchemeAdd');
    var keyDel=$('btnKeySchemeDelete');
    var ready=isCurrentDraftComplete();
    var busy=global.OneToneMappingRecording.mode()!=='none';
    if(btn){
      btn.disabled=!ready;
      btn.title=ready?'':t('addNeedComplete');
    }
    if(keyAdd){
      keyAdd.disabled=!ready||busy;
      keyAdd.title=(!ready&&!busy)?t('addNeedComplete'):'';
    }
    if(keyDel){
      keyDel.disabled=!core().selected()||busy;
    }
  }

  function renderDraftHint(){
    var el=$('mappingDraftHint');
    if(!el) return;
    var m=core().selected();
    var incomplete=!isCurrentDraftComplete();
    var hideForDraft=m&&core().isDraft(m);
    el.classList.toggle('show',incomplete&&!hideForDraft);
    if(incomplete&&!hideForDraft) el.textContent=t('draftHint');
  }

  function updatePrimaryCTA(){
    var triggerBtn=$('btnRecordTrigger');
    var targetBtn=$('btnRecordTarget');
    if(!triggerBtn||!targetBtn) return;
    triggerBtn.className='btn secondary record-btn';
    targetBtn.className='btn secondary record-btn';
    if(global.OneToneMappingRecording.mode()==='trigger'){
      triggerBtn.className='btn primary record-btn';
      return;
    }
    if(global.OneToneMappingRecording.mode()==='target'){
      targetBtn.className='btn primary record-btn';
      return;
    }
    var trig=core().editorTrigger(core().selected());
    var tgt=core().editorTarget(core().selected());
    if(!trig){
      triggerBtn.className='btn primary record-btn';
    }else if(!tgt){
      targetBtn.className='btn primary record-btn';
    }
  }

  global.OneToneMappingEditorChrome={
    isCurrentDraftComplete:isCurrentDraftComplete,
    renderAddButton:renderAddButton,
    renderDraftHint:renderDraftHint,
    updatePrimaryCTA:updatePrimaryCTA
  };
})((typeof window!=='undefined')?window:globalThis);
