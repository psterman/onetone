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

  function recordBtnClass(isPrimary, recorded){
    var cls='btn '+(isPrimary?'primary':'secondary')+' record-btn';
    if(recorded&&!isPrimary) cls+=' rerecord-btn';
    return cls;
  }

  function updatePrimaryCTA(){
    var triggerBtn=$('btnRecordTrigger');
    var targetBtn=$('btnRecordTarget');
    if(!triggerBtn||!targetBtn) return;
    var mode=global.OneToneMappingRecording.mode();
    var trig=core().editorTrigger(core().selected());
    var tgt=core().editorTarget(core().selected());
    if(mode==='trigger'){
      triggerBtn.className=recordBtnClass(true,!!trig);
      targetBtn.className=recordBtnClass(false,!!tgt);
      return;
    }
    if(mode==='target'){
      triggerBtn.className=recordBtnClass(false,!!trig);
      targetBtn.className=recordBtnClass(true,!!tgt);
      return;
    }
    if(!trig){
      triggerBtn.className=recordBtnClass(true,false);
      targetBtn.className=recordBtnClass(false,!!tgt);
    }else if(!tgt){
      triggerBtn.className=recordBtnClass(false,true);
      targetBtn.className=recordBtnClass(true,false);
    }else{
      triggerBtn.className=recordBtnClass(false,true);
      targetBtn.className=recordBtnClass(false,true);
    }
  }

  global.OneToneMappingEditorChrome={
    isCurrentDraftComplete:isCurrentDraftComplete,
    renderAddButton:renderAddButton,
    renderDraftHint:renderDraftHint,
    updatePrimaryCTA:updatePrimaryCTA
  };
})((typeof window!=='undefined')?window:globalThis);
