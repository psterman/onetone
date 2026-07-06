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

  function setRecordBtnLabel(btn, text){
    if(!btn) return;
    var span=btn.querySelector('.habit-rerecord-text');
    if(span) span.textContent=text;
    else btn.textContent=text;
  }

  function habitRecordBtnClass(isPrimary, recorded){
    var cls='habit-rerecord-link record-btn';
    if(isPrimary) cls+=' is-primary';
    if(recorded&&!isPrimary) cls+=' is-rerecord';
    return cls;
  }

  function recordBtnClass(isPrimary, recorded){
    return habitRecordBtnClass(isPrimary, recorded);
  }

  function updatePrimaryCTA(){
    var triggerBtn=$('btnRecordTrigger');
    var targetBtn=$('btnRecordTarget');
    if(!triggerBtn||!targetBtn) return;
    var mode=global.OneToneMappingRecording.mode();
    var trig=core().editorTrigger(core().selected());
    var tgt=core().editorTarget(core().selected());
    if(mode==='trigger'){
      triggerBtn.className=habitRecordBtnClass(true,!!trig);
      targetBtn.className=habitRecordBtnClass(false,!!tgt);
      return;
    }
    if(mode==='target'){
      triggerBtn.className=habitRecordBtnClass(false,!!trig);
      targetBtn.className=habitRecordBtnClass(true,!!tgt);
      return;
    }
    if(!trig){
      triggerBtn.className=habitRecordBtnClass(true,false);
      targetBtn.className=habitRecordBtnClass(false,!!tgt);
    }else if(!tgt){
      triggerBtn.className=habitRecordBtnClass(false,true);
      targetBtn.className=habitRecordBtnClass(true,false);
    }else{
      triggerBtn.className=habitRecordBtnClass(false,true);
      targetBtn.className=habitRecordBtnClass(false,true);
    }
  }

  global.OneToneMappingEditorChrome={
    isCurrentDraftComplete:isCurrentDraftComplete,
    renderAddButton:renderAddButton,
    renderDraftHint:renderDraftHint,
    updatePrimaryCTA:updatePrimaryCTA,
    setRecordBtnLabel:setRecordBtnLabel
  };
})((typeof window!=='undefined')?window:globalThis);
