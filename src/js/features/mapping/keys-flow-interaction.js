(function(global){
  'use strict';

  var $=function(id){ return global.OneToneDom.$(id); };

  function finishUiHooks(){ return global.__vp_key_finish_flow_ui_hooks__ || {}; }
  function visibleKeysPanel(){
    var panel=$('settingsPanelKeys');
    return !!(panel && !panel.hidden);
  }

  function isKeysPanelActive(){
    var drawer=global.OneToneSettingsDrawer;
    if(drawer&&drawer.isKeysPanel&&drawer.isKeysPanel()) return true;
    return visibleKeysPanel();
  }

  function finishUiApi(){
    return global.OneToneKeyFinishFlowRender || null;
  }

  function dispatchFinishClick(e){
    var h=finishUiHooks();
    var api=finishUiApi();
    var handler=(h&&h.handleKeyFinishFlowClick)|| (api&&api.handleKeyFinishFlowClick);
    if(handler&&handler(e)){
      e.preventDefault();
      e.stopPropagation();
      return true;
    }
    return false;
  }

  function dispatchEnableToggle(e){
    var btn=e.target.closest&&e.target.closest('#btnKeysMappingEnable');
    if(!btn||btn.disabled||btn.dataset.vpToggleBusy==='1') return false;
    var h=finishUiHooks();
    var m=h.selectedMapping&&h.selectedMapping();
    if(!m||!h.isSavedMapping||!h.isSavedMapping(m)||!h.setMappingEnabled) return false;
    e.preventDefault();
    e.stopPropagation();
    if(typeof e.stopImmediatePropagation==='function') e.stopImmediatePropagation();
    e.__vpKeysPanelHandled=true;
    btn.dataset.vpToggleBusy='1';
    h.setMappingEnabled(m.id,!m.enabled);
    setTimeout(function(){
      if(btn.dataset.vpToggleBusy==='1') delete btn.dataset.vpToggleBusy;
    },800);
    return true;
  }

  function routeKeysPanelClick(e){
    if(e.__vpKeysPanelHandled) return;
    if(!isKeysPanelActive()) return;

    var fillBtn=e.target.closest&&e.target.closest('[data-apply-template]');
    if(fillBtn&&!fillBtn.disabled){
      e.preventDefault();
      e.stopPropagation();
      var tplApi=global.OneToneKeysWorkflowTemplates;
      if(tplApi&&tplApi.applyTemplate) tplApi.applyTemplate(fillBtn.getAttribute('data-apply-template')||'');
      return;
    }

    var newBtn=e.target.closest&&e.target.closest('[data-new-template]');
    if(newBtn){
      e.preventDefault();
      e.stopPropagation();
      var tplApiNew=global.OneToneKeysWorkflowTemplates;
      if(tplApiNew&&tplApiNew.applyTemplateNew) tplApiNew.applyTemplateNew(newBtn.getAttribute('data-new-template')||'');
      return;
    }

    var schemeEnableBtn=e.target.closest&&e.target.closest('[data-scheme-enable]');
    if(schemeEnableBtn){
      e.preventDefault();
      e.stopPropagation();
      e.__vpKeysPanelHandled=true;
      var enableId=schemeEnableBtn.getAttribute('data-scheme-enable')||'';
      var core=global.OneToneMappingCore;
      var enableM=core&&core.byId?core.byId(enableId):null;
      if(enableM&&global.OneToneMappingEditActions&&global.OneToneMappingEditActions.setMappingEnabled){
        global.OneToneMappingEditActions.setMappingEnabled(enableId,!enableM.enabled);
      }
      return;
    }

    var schemeDelBtn=e.target.closest&&e.target.closest('[data-scheme-delete]');
    if(schemeDelBtn){
      e.preventDefault();
      e.stopPropagation();
      e.__vpKeysPanelHandled=true;
      if(global.OneToneMappingTrashMenu) global.OneToneMappingTrashMenu.deleteFromMenu(schemeDelBtn.getAttribute('data-scheme-delete')||'');
      return;
    }

    var renameSchemeBtn=e.target.closest&&e.target.closest('[data-scheme-rename]');
    if(renameSchemeBtn){
      e.preventDefault();
      e.stopPropagation();
      e.__vpKeysPanelHandled=true;
      var panelUiRename=global.OneToneKeysPanelUi;
      if(panelUiRename&&panelUiRename.renameScheme) panelUiRename.renameScheme(renameSchemeBtn.getAttribute('data-scheme-rename')||'');
      return;
    }

    var schemeSelectBtn=e.target.closest&&e.target.closest('[data-scheme-select]');
    if(schemeSelectBtn){
      e.preventDefault();
      e.stopPropagation();
      e.__vpKeysPanelHandled=true;
      var panelUi=global.OneToneKeysPanelUi;
      if(panelUi&&panelUi.switchActiveScheme) panelUi.switchActiveScheme(schemeSelectBtn.getAttribute('data-scheme-select')||'');
      return;
    }

    var schemeTab=e.target.closest&&e.target.closest('#keysWorkflowTabs [data-scheme-id]');
    if(schemeTab){
      e.preventDefault();
      e.stopPropagation();
      var panelUiTab=global.OneToneKeysPanelUi;
      if(panelUiTab&&panelUiTab.switchActiveScheme) panelUiTab.switchActiveScheme(schemeTab.getAttribute('data-scheme-id')||'');
      return;
    }

    var appChip=e.target.closest&&e.target.closest('#keysAppContextStrip [data-app-context]');
    if(appChip){
      e.preventDefault();
      e.stopPropagation();
      var appRulesCtx=global.OneToneAppBehaviorRules;
      if(appRulesCtx&&appRulesCtx.setActiveAppContextId) appRulesCtx.setActiveAppContextId(appChip.getAttribute('data-app-context')||'');
      return;
    }

    var ruleChip=e.target.closest&&e.target.closest('#keysAppContextStrip [data-rule-context]');
    if(ruleChip){
      e.preventDefault();
      e.stopPropagation();
      var appRulesRule=global.OneToneAppBehaviorRules;
      if(appRulesRule&&appRulesRule.setActiveRuleContext) appRulesRule.setActiveRuleContext(ruleChip.getAttribute('data-rule-context')||'');
      return;
    }

    var ruleDeleteChip=e.target.closest&&e.target.closest('#keysAppContextStrip [data-rule-delete]');
    if(ruleDeleteChip){
      e.preventDefault();
      e.stopPropagation();
      var coreMod=global.OneToneMappingCore;
      var mDel=coreMod&&coreMod.selected?coreMod.selected():null;
      var rulesDel=global.OneToneAppBehaviorRules;
      if(mDel&&rulesDel&&rulesDel.removeRuleById){
        rulesDel.removeRuleById(mDel,ruleDeleteChip.getAttribute('data-rule-delete')||'');
      }
      return;
    }

    var appChipNone=e.target.closest&&e.target.closest('#keysAppContextStrip [data-app-chip-none]');
    if(appChipNone){
      e.preventDefault();
      e.stopPropagation();
      var atp=global.OneToneAppTargetPresets;
      if(atp&&atp.clearPrimaryForMapping) atp.clearPrimaryForMapping();
      var appRulesNone=global.OneToneAppBehaviorRules;
      if(appRulesNone){
        if(appRulesNone.setActiveAppContextId) appRulesNone.setActiveAppContextId('');
        if(appRulesNone.setKeysExpandedAppId) appRulesNone.setKeysExpandedAppId('');
      }
      var panelUi=global.OneToneKeysPanelUi;
      if(panelUi&&panelUi.render) panelUi.render();
      return;
    }

    if(e.target.closest&&e.target.closest('#keysAppRulesList')){
      var appRules=global.OneToneAppBehaviorRules;
      if(appRules&&appRules.handleListClick&&appRules.handleListClick(e)){
        e.__vpKeysPanelHandled=true;
        return;
      }
    }

    if(e.target.closest&&e.target.closest('[data-finish-mode],[data-timing-toggle],[data-trigger-mode]')){
      dispatchFinishClick(e);
    }
  }

  function routeKeysPanelInput(e){
    if(e.__vpKeysPanelHandled) return;
    if(!isKeysPanelActive()) return;
    var range=e.target.closest&&e.target.closest('[data-timing-range]');
    if(!range) return;
    e.stopPropagation();
    var h=finishUiHooks();
    var api=finishUiApi();
    var handler=(h&&h.handleKeyFinishFlowInput)|| (api&&api.handleKeyFinishFlowInput);
    if(handler){
      e.__vpKeysPanelHandled=true;
      handler(e);
    }
  }

  function bindEvents(){
    var panel=$('settingsPanelKeys');
    if(!panel||panel.dataset.keysPageIxBound==='1') return;
    panel.dataset.keysPageIxBound='1';
    panel.addEventListener('click',routeKeysPanelClick,true);
    panel.addEventListener('input',routeKeysPanelInput,true);
    panel.addEventListener('change',routeKeysPanelInput,true);
    var enableBtn=$('btnKeysMappingEnable');
    if(enableBtn&&!enableBtn.dataset.keysEnableIxBound){
      enableBtn.dataset.keysEnableIxBound='1';
      enableBtn.addEventListener('click',function(e){
        dispatchEnableToggle(e);
      },true);
    }
  }

  global.OneToneKeysFlowInteraction={bindEvents:bindEvents};
})((typeof window!=='undefined')?window:globalThis);
