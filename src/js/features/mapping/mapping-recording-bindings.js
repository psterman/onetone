(function(global){
  'use strict';
  var $=function(id){ return global.OneToneDom.$(id); };
  function h(){ return global.__vp_bootstrap_hooks__ || {}; }
  function bindEvents(){
    var hooks=h();
    var state=global.OneToneState.state;
    var t=hooks.t;
    $('btnTestModalOk').onclick=function(){ hooks.closeTestModal(); };
    $('btnTestModalClose').onclick=function(){ hooks.closeTestModal(); };
    $('testOverlay').addEventListener('click',function(e){
      if(e.target===$('testOverlay')) hooks.closeTestModal();
    });
    $('btnTestSend').onclick=function(){ hooks.fireTestSend(null); };
    $('btnRecordTrigger').onclick=hooks.startTriggerRecord;
    $('btnRecordTarget').onclick=hooks.startTargetRecord;
    $('btnCancelRecord').onclick=hooks.cancelDraftOrRecording;
    var btnKeySchemeAdd=$('btnKeySchemeAdd');
    if(btnKeySchemeAdd){
      btnKeySchemeAdd.onclick=function(){
        var addBtn=$('btnAddMapping');
        if(addBtn) addBtn.click();
      };
    }
    var btnKeySchemeDelete=$('btnKeySchemeDelete');
    if(btnKeySchemeDelete){
      btnKeySchemeDelete.onclick=function(){
        var m=hooks.selectedMapping();
        if(!m) return;
        hooks.deleteMappingFromMenu(m.id);
      };
    }
    $('btnSchemeSwitchKey').onclick=function(){
      if(global.OneToneMappingRecording.mode()==='schemeSwitch') return;
      hooks.startSchemeSwitchRecord();
    };
    $('btnSchemeSwitchCancel').onclick=function(e){
      e.stopPropagation();
      hooks.cancelRecording();
    };
    $('btnSchemeSwitchClear').onclick=function(e){
      e.stopPropagation();
      hooks.clearSchemeSwitchKey();
    };
    $('btnClearAll').onclick=async function(){
      var ok=await hooks.openConfirmModal(t('confirmClear'));
      if(!ok) return;
      state.config=hooks.defaultConfig();
      state.selectedMappingId=state.config.mappings[0].id;
      hooks.syncEditorFromSelection();
      hooks.save();
      hooks.render();
      hooks.toast(t('restoredDefault'));
    };
    $('btnConfirmCancel').onclick=function(){ hooks.closeConfirmModal(false); };
    $('btnConfirmOk').onclick=function(){ hooks.closeConfirmModal(true); };
    $('confirmOverlay').addEventListener('click',function(e){
      if(e.target===this) hooks.closeConfirmModal(false);
    });
    $('trashList').addEventListener('click',function(e){
      var btn=e.target.closest&&e.target.closest('[data-restore]');
      if(btn) hooks.restoreFromTrash(btn.dataset.restore);
    });
  }
  global.OneToneMappingRecordingBindings={bindEvents:bindEvents};
})((typeof window!=='undefined')?window:globalThis);
