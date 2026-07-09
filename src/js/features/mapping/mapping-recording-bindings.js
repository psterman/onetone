(function(global){
  'use strict';
  var $=function(id){ return global.OneToneDom.$(id); };
  function h(){ return global.__vp_bootstrap_hooks__ || {}; }
  function bindClick(id,handler){
    var el=$(id);
    if(el) el.onclick=handler;
    return el;
  }
  function bindEvent(id,type,handler){
    var el=$(id);
    if(el) el.addEventListener(type,handler);
    return el;
  }
  function bindEvents(){
    var hooks=h();
    var state=global.OneToneState.state;
    var t=hooks.t;
    bindClick('btnTestModalOk',function(){ hooks.closeTestModal(); });
    bindClick('btnTestModalClose',function(){ hooks.closeTestModal(); });
    bindClick('btnTestWizardClose',function(){ hooks.closeTestModal(); });
    bindClick('btnTestWizardOpen',function(e){
      if(e) e.stopPropagation();
      if(global.OneToneMappingTestSend&&global.OneToneMappingTestSend.fire){
        global.OneToneMappingTestSend.fire(null,{context:'manual-wizard'});
      }else{
        hooks.fireTestSend(null);
      }
    });
    bindEvent('testOverlay','click',function(e){
      if(e.target===$('testOverlay')) hooks.closeTestModal();
      var wizardAction=e.target&&e.target.closest?e.target.closest('[data-test-wizard-act]'):null;
      if(wizardAction&&global.OneToneMappingTestSend&&global.OneToneMappingTestSend.handleWizardAction){
        e.stopPropagation();
        global.OneToneMappingTestSend.handleWizardAction(wizardAction.getAttribute('data-test-wizard-act'));
        return;
      }
      var wizardMode=e.target&&e.target.closest?e.target.closest('[data-test-wizard-mode]'):null;
      if(wizardMode&&global.OneToneMappingTestSend&&global.OneToneMappingTestSend.handleWizardAction){
        e.stopPropagation();
        global.OneToneMappingTestSend.handleWizardAction('select-mode',wizardMode.getAttribute('data-test-wizard-mode'));
      }
    });
    bindClick('btnTestSend',function(){ hooks.fireTestSend(null); });
    bindClick('btnRecordTrigger',hooks.startTriggerRecord);
    bindClick('btnRecordTarget',hooks.startTargetRecord);
    bindClick('btnCancelRecord',hooks.cancelDraftOrRecording);
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
    bindClick('btnSchemeSwitchKey',function(){
      if(global.OneToneMappingRecording.mode()==='schemeSwitch') return;
      hooks.startSchemeSwitchRecord();
    });
    bindClick('btnSchemeSwitchCancel',function(e){
      e.stopPropagation();
      hooks.cancelRecording();
    });
    bindClick('btnSchemeSwitchClear',function(e){
      e.stopPropagation();
      hooks.clearSchemeSwitchKey();
    });
    bindClick('btnClearAll',async function(){
      var ok=await hooks.openConfirmModal(t('confirmClear'));
      if(!ok) return;
      state.config=hooks.defaultConfig();
      state.selectedMappingId=state.config.mappings[0].id;
      hooks.syncEditorFromSelection();
      hooks.save();
      hooks.render();
      hooks.toast(t('restoredDefault'));
    });
    bindClick('btnConfirmCancel',function(){
      if(global.OneToneSceneSyncConfirm&&global.OneToneSceneSyncConfirm.isChoiceMode()) return;
      hooks.closeConfirmModal(false);
    });
    bindClick('btnConfirmOk',function(){
      if(global.OneToneSceneSyncConfirm&&global.OneToneSceneSyncConfirm.isChoiceMode()) return;
      hooks.closeConfirmModal(true);
    });
    bindEvent('confirmOverlay','click',function(e){
      if(global.OneToneSceneSyncConfirm&&global.OneToneSceneSyncConfirm.isChoiceMode()) return;
      if(e.target===this) hooks.closeConfirmModal(false);
    });
    bindEvent('trashList','click',function(e){
      var btn=e.target.closest&&e.target.closest('[data-restore]');
      if(btn) hooks.restoreFromTrash(btn.dataset.restore);
    });
  }
  global.OneToneMappingRecordingBindings={bindEvents:bindEvents};
})((typeof window!=='undefined')?window:globalThis);
