(function(global){
  'use strict';

  var t=function(key){ return global.OneToneI18n.t(key); };
  function core(){ return global.OneToneMappingCore; }
  function hooks(){ return global.__vp_bootstrap_hooks__ || {}; }

  var TEMPLATES=[
    {
      id:'cursor-dev',
      nameKey:'keysTemplateCursor',
      descKey:'keysTemplateCursorDesc',
      imePresetId:'typeless',
      finishMode:'confirm',
      enterDelayMs:1200,
      appTargetId:'cursor-chat',
      appRuleFinishMode:'perpress'
    },
    {
      id:'writing',
      nameKey:'keysTemplateWriting',
      descKey:'keysTemplateWritingDesc',
      imePresetId:'qianwen',
      finishMode:'manual',
      enterDelayMs:5000
    },
    {
      id:'meeting',
      nameKey:'keysTemplateMeeting',
      descKey:'keysTemplateMeetingDesc',
      imePresetId:'xunfei',
      finishMode:'perpress',
      enterDelayMs:2000
    }
  ];

  function templateById(id){
    id=String(id||'').trim();
    return TEMPLATES.find(function(x){ return x.id===id; })||null;
  }

  function imeLabel(presetId){
    var ip=global.OneToneImePresets;
    if(!ip||!ip.presetById) return presetId||'—';
    var p=ip.presetById(presetId);
    return p&&p.nameKey?t(p.nameKey):presetId;
  }

  function finishLabel(mode){
    var abr=global.OneToneAppBehaviorRules;
    if(abr&&abr.finishModeLabel) return abr.finishModeLabel(mode);
    return mode||'—';
  }

  function appLabel(appId){
    var abr=global.OneToneAppBehaviorRules;
    if(abr&&abr.appDisplayName) return abr.appDisplayName(appId);
    return appId||'';
  }

  function previewLines(tpl){
    if(!tpl) return [];
    var lines=[
      t('keysTemplatePreviewIme').replace('{ime}',imeLabel(tpl.imePresetId)),
      t('keysTemplatePreviewAction').replace('{mode}',finishLabel(tpl.finishMode))
    ];
    if(tpl.enterDelayMs){
      var sec=(tpl.enterDelayMs/1000).toFixed(1);
      lines.push(t('keysTemplatePreviewDelay').replace('{delay}',sec));
    }
    if(tpl.appTargetId){
      lines.push(t('keysTemplatePreviewApp').replace('{app}',appLabel(tpl.appTargetId)));
    }
    lines.push(t('keysTemplatePreviewTriggerSafe'));
    return lines;
  }

  function targetKeyForIme(presetId){
    var ip=global.OneToneImePresets;
    if(!ip||!ip.presetById) return '';
    var p=ip.presetById(presetId);
    return p&&p.targetKey?String(p.targetKey).trim():'';
  }

  function buildConfirmMessage(tpl,m){
    var lines=previewLines(tpl).map(function(line){ return '· '+line; });
    var msg=t('keysTemplateApplyConfirmIntro').replace('{name}',t(tpl.nameKey))+'\n\n'+lines.join('\n');
    var c=core();
    var hasTarget=c&&c.editorTarget&&c.editorTarget(m);
    if(hasTarget) msg+='\n\n'+t('keysTemplateOverwriteTargetWarn');
    return msg;
  }

  function applyFields(tpl,m,opts){
    opts=opts||{};
    if(!tpl||!m) return false;
    m.imePresetId=tpl.imePresetId||'';
    if(global.OneToneSceneFlowSummary&&global.OneToneSceneFlowSummary.applyFinishMode){
      global.OneToneSceneFlowSummary.applyFinishMode(m,tpl.finishMode||'manual');
    }
    if(tpl.enterDelayMs!=null) m.enterDelayMs=tpl.enterDelayMs;
    if(tpl.appTargetId){
      m.appTargetId=tpl.appTargetId;
      if(global.OneToneAppBehaviorRules&&global.OneToneAppBehaviorRules.ensureRules){
        global.OneToneAppBehaviorRules.ensureRules(m);
      }
      if(tpl.appRuleFinishMode&&Array.isArray(m.appBehaviorRules)){
        var rule=m.appBehaviorRules.find(function(r){ return r&&r.appId===tpl.appTargetId; });
        if(!rule){
          m.appBehaviorRules.push({
            appId:tpl.appTargetId,
            finishMode:tpl.appRuleFinishMode,
            note:''
          });
        }
      }
    }
    var suggestedTarget=targetKeyForIme(tpl.imePresetId);
    var c=core();
    var hasTarget=c&&c.editorTarget&&!!c.editorTarget(m);
    if(suggestedTarget&&(!hasTarget||opts.overwriteTarget)){
      m.targetKey=suggestedTarget;
      var ed=global.OneToneMappingEditorState;
      if(ed&&ed.setEditorTargetKey) ed.setEditorTargetKey(suggestedTarget);
    }
    if(c&&c.ensureMappingTiming) c.ensureMappingTiming(m);
    if(global.OneToneHabitHub&&global.OneToneHabitHub.touchUpdated) global.OneToneHabitHub.touchUpdated(m);
    else m.updatedAt=Date.now();
    return true;
  }

  function afterApply(){
    if(global.OneToneConfigPersist&&global.OneToneConfigPersist.save){
      global.OneToneConfigPersist.save();
    }else if(hooks().save) hooks().save();
    if(hooks().syncEditorFromSelection) hooks().syncEditorFromSelection();
    if(hooks().renderKeyFinishFlowPanel) hooks().renderKeyFinishFlowPanel();
    if(hooks().renderEditor) hooks().renderEditor();
    if(global.OneToneImePresets) global.OneToneImePresets.refresh('mapping');
    if(global.OneToneAppTargetPresets) global.OneToneAppTargetPresets.refresh('mapping');
    if(global.OneToneSceneTabs) global.OneToneSceneTabs.render();
    if(global.OneToneAppBehaviorRules) global.OneToneAppBehaviorRules.render();
    if(hooks().render) hooks().render();
    if(global.OneToneKeysPanelUi) global.OneToneKeysPanelUi.render();
    if(global.OneToneApp&&global.OneToneApp.toast){
      global.OneToneApp.toast(t('keysTemplateApplied'));
    }
  }

  function compactSummary(tpl){
    if(!tpl) return '';
    var parts=[imeLabel(tpl.imePresetId),finishLabel(tpl.finishMode)];
    if(tpl.appTargetId){
      var app=appLabel(tpl.appTargetId);
      if(app) parts.push(app);
    }
    return parts.filter(Boolean).join(' · ');
  }

  function state(){ return global.OneToneState.state; }

  function draftBlocksNewScheme(){
    if(hooks().isCurrentDraftComplete&&!hooks().isCurrentDraftComplete()){
      if(hooks().toast) hooks().toast(t('addNeedComplete'));
      else if(global.OneToneApp&&global.OneToneApp.toast) global.OneToneApp.toast(t('addNeedComplete'));
      if(hooks().renderDraftHint) hooks().renderDraftHint();
      return true;
    }
    return false;
  }

  function createMappingShell(name){
    if(hooks().ensureConfig) hooks().ensureConfig();
    else if(core().ensureConfig) core().ensureConfig();
    var cfg=state().config;
    var id=core().newMappingId?core().newMappingId():(hooks().newMappingId?hooks().newMappingId():('m-'+Date.now()+'-'+Math.random().toString(36).slice(2,7)));
    var m={
      id:id,
      label:'',
      group:String(name||'').trim()||t('keysTemplateNewDefaultName'),
      triggerKey:'',
      targetKey:'',
      enabled:false,
      order:Array.isArray(cfg.mappings)?cfg.mappings.length:0,
      triggerMode:'tap',
      intervalMs:cfg.intervalMs||1200,
      enterDelayMs:cfg.enterDelayMs||5000,
      cancelEnabled:cfg.cancelEnabled!==false,
      autoEnterEnabled:cfg.autoEnterEnabled!==false,
      switchKeys:[],
      nativeKeyRestore:false,
      imePresetId:'',
      appTargetId:'',
      appBehaviorRules:[],
      updatedAt:Date.now(),
      lastUsedAt:0,
      useCount:0
    };
    cfg.mappings=Array.isArray(cfg.mappings)?cfg.mappings:[];
    cfg.mappings.push(m);
    state().selectedMappingId=id;
    if(hooks().setPendingNewDraftId) hooks().setPendingNewDraftId(id);
    if(hooks().setEditorTriggerKey) hooks().setEditorTriggerKey('');
    if(hooks().setEditorTargetKey) hooks().setEditorTargetKey('');
    if(core().ensureMappingExtras) core().ensureMappingExtras(m);
    return m;
  }

  function buildNewSchemeConfirmMessage(tpl){
    var lines=previewLines(tpl).map(function(line){ return '· '+line; });
    return t('keysTemplateNewConfirmIntro').replace('{name}',t(tpl.nameKey))+'\n\n'+lines.join('\n');
  }

  function applyTemplateNew(id){
    var tpl=templateById(id);
    if(!tpl||!core()) return Promise.resolve(false);
    if(draftBlocksNewScheme()) return Promise.resolve(false);
    if(hooks().flushAllEditorToMappings) hooks().flushAllEditorToMappings();
    var msg=buildNewSchemeConfirmMessage(tpl);
    var confirmFn=global.OneToneMappingConfirmModal&&global.OneToneMappingConfirmModal.open
      ? function(text){ return global.OneToneMappingConfirmModal.open(text); }
      : function(text){ return Promise.resolve(window.confirm(text)); };
    return confirmFn(msg).then(function(ok){
      if(!ok) return false;
      var m=createMappingShell(t(tpl.nameKey));
      applyFields(tpl,m,{overwriteTarget:true});
      afterApply();
      if(global.OneToneKeysPanelUi&&global.OneToneKeysPanelUi.switchActiveScheme){
        global.OneToneKeysPanelUi.switchActiveScheme(m.id);
      }
      if(global.OneToneApp&&global.OneToneApp.toast){
        global.OneToneApp.toast(t('keysTemplateNewApplied'));
      }
      return true;
    });
  }

  function applyTemplate(id){
    var tpl=templateById(id);
    if(!tpl||!core()||!core().selected) return Promise.resolve(false);
    if(hooks().flushAllEditorToMappings) hooks().flushAllEditorToMappings();
    var m=core().selected();
    if(!m) return Promise.resolve(false);
    var msg=buildConfirmMessage(tpl,m);
    var hasTarget=core().editorTarget&&!!core().editorTarget(m);
    var confirmFn=global.OneToneMappingConfirmModal&&global.OneToneMappingConfirmModal.open
      ? function(text){ return global.OneToneMappingConfirmModal.open(text); }
      : function(text){ return Promise.resolve(window.confirm(text)); };
    return confirmFn(msg).then(function(ok){
      if(!ok) return false;
      applyFields(tpl,m,{ overwriteTarget:hasTarget });
      afterApply();
      return true;
    });
  }

  global.OneToneKeysWorkflowTemplates={
    list:function(){ return TEMPLATES.slice(); },
    templateById:templateById,
    previewLines:previewLines,
    compactSummary:compactSummary,
    applyTemplate:applyTemplate,
    applyTemplateNew:applyTemplateNew
  };
})((typeof window!=='undefined')?window:globalThis);
