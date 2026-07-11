(function(global){
  'use strict';

  var t=function(key){ return global.OneToneI18n.t(key); };

  function core(){ return global.OneToneMappingCore; }

  var TEMPLATES=[
    {
      id:'cursor-dev',
      nameKey:'keysTemplateCursor',
      engine:'vosk',
      modelPreset:'cn-light',
      wakePhrases:['开始输入'],
      endPhrases:{zh:['发送'],en:[]},
      appTargetId:'cursor-chat',
      appRuleFinishMode:'confirm'
    },
    {
      id:'writing',
      nameKey:'keysTemplateWriting',
      engine:'sapi',
      wakePhrases:['开始听写'],
      endPhrases:{zh:[],en:[]}
    },
    {
      id:'meeting',
      nameKey:'keysTemplateMeeting',
      engine:'vosk',
      modelPreset:'cn-light',
      wakePhrases:['开始输入'],
      endPhrases:{zh:['完毕'],en:[]}
    }
  ];

  function templateById(id){
    id=String(id||'').trim();
    return TEMPLATES.find(function(x){ return x.id===id; })||null;
  }

  function engineLabel(engine){
    if(engine==='vosk') return t('voiceModeProEngine');
    if(engine==='sapi') return t('voiceModeLiteEngine');
    return t('voiceModeCurrentOff');
  }

  function appLabel(appId){
    var abr=global.OneToneAppBehaviorRules;
    if(abr&&abr.appDisplayName) return abr.appDisplayName(appId);
    return appId||'';
  }

  function compactSummary(tpl){
    if(!tpl) return '';
    var parts=[engineLabel(tpl.engine)];
    if(tpl.wakePhrases&&tpl.wakePhrases.length) parts.push(tpl.wakePhrases[0]);
    if(tpl.appTargetId){
      var app=appLabel(tpl.appTargetId);
      if(app) parts.push(app);
    }
    return parts.filter(Boolean).join(' · ');
  }

  function previewLines(tpl){
    if(!tpl) return [];
    var lines=[t('voiceTemplatePreviewEngine').replace('{engine}',engineLabel(tpl.engine))];
    if(tpl.wakePhrases&&tpl.wakePhrases.length){
      lines.push(t('voiceTemplatePreviewWake').replace('{wake}',tpl.wakePhrases.join(' / ')));
    }
    if(tpl.appTargetId){
      lines.push(t('voiceTemplatePreviewApp').replace('{app}',appLabel(tpl.appTargetId)));
    }
    lines.push(t('voiceTemplatePreviewKeysSafe'));
    return lines;
  }

  function cloneEndPhrases(end){
    end=end||{};
    return {
      zh:Array.isArray(end.zh)?end.zh.slice():[],
      en:Array.isArray(end.en)?end.en.slice():[]
    };
  }

  function applyVoiceFields(tpl,m){
    if(!tpl||!m) return false;
    var ov=m.voiceOverride&&typeof m.voiceOverride==='object'?m.voiceOverride:{};
    if(tpl.engine) ov.engine=tpl.engine;
    if(tpl.modelPreset) ov.modelPreset=tpl.modelPreset;
    if(Array.isArray(tpl.wakePhrases)) ov.wakePhrases=tpl.wakePhrases.slice();
    if(tpl.endPhrases) ov.endPhrases=cloneEndPhrases(tpl.endPhrases);
    m.voiceOverride=ov;
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
    if(global.OneToneHabitHub&&global.OneToneHabitHub.touchUpdated){
      global.OneToneHabitHub.touchUpdated(m);
    }else{
      m.updatedAt=Date.now();
    }
    return true;
  }

  function afterApply(selectId){
    if(global.OneToneConfigPersist&&global.OneToneConfigPersist.save){
      global.OneToneConfigPersist.save();
    }
    if(selectId&&global.OneToneVoiceSchemesUi&&global.OneToneVoiceSchemesUi.selectVoiceSchemeForEdit){
      global.OneToneVoiceSchemesUi.selectVoiceSchemeForEdit(selectId);
    }
    if(global.OneToneVoiceSchemePersist&&global.OneToneVoiceSchemePersist.refreshVoiceSchemeSurfaces){
      global.OneToneVoiceSchemePersist.refreshVoiceSchemeSurfaces();
    }
    if(global.OneToneAppToast) global.OneToneAppToast.show(t('keysTemplateApplied'),'scheme');
  }

  function confirmFn(text,opts){
    opts=opts||{};
    if(opts.skipConfirm) return Promise.resolve(true);
    if(global.OneToneMappingConfirmModal&&global.OneToneMappingConfirmModal.open){
      return global.OneToneMappingConfirmModal.open(text);
    }
    return Promise.resolve(window.confirm(text));
  }

  function buildConfirmMessage(tpl){
    var lines=previewLines(tpl).map(function(line){ return '· '+line; });
    return t('voiceTemplateApplyConfirmIntro').replace('{name}',t(tpl.nameKey))+'\n\n'+lines.join('\n');
  }

  function resolveEditMapping(){
    if(global.OneToneVoiceSchemePersist&&global.OneToneVoiceSchemePersist.resolveVoiceEditMapping){
      return global.OneToneVoiceSchemePersist.resolveVoiceEditMapping();
    }
    return null;
  }

  function applyTemplate(id,opts){
    opts=opts||{};
    var tpl=templateById(id);
    if(!tpl) return Promise.resolve(false);
    var m=resolveEditMapping();
    if(!m){
      if(global.OneToneAppToast) global.OneToneAppToast.show(t('voiceTemplateNeedScheme'),'warn');
      return Promise.resolve(false);
    }
    return confirmFn(buildConfirmMessage(tpl),opts).then(function(ok){
      if(!ok) return false;
      applyVoiceFields(tpl,m);
      afterApply(m.id);
      return true;
    });
  }

  function applyTemplateNew(id,opts){
    opts=opts||{};
    var tpl=templateById(id);
    if(!tpl||!core()) return Promise.resolve(false);
    var msg=t('voiceTemplateNewConfirmIntro').replace('{name}',t(tpl.nameKey))+'\n\n'+previewLines(tpl).map(function(line){ return '· '+line; }).join('\n');
    return confirmFn(msg,opts).then(function(ok){
      if(!ok) return false;
      var draft=global.OneToneVoiceSchemePersist&&global.OneToneVoiceSchemePersist.createVoiceDraft
        ?global.OneToneVoiceSchemePersist.createVoiceDraft({name:t(tpl.nameKey)})
        :null;
      if(!draft) return false;
      applyVoiceFields(tpl,draft);
      afterApply(draft.id);
      if(global.OneToneAppToast) global.OneToneAppToast.show(t('keysTemplateNewApplied'),'scheme');
      return true;
    });
  }

  global.OneToneVoiceWorkflowTemplates={
    list:function(){ return TEMPLATES.slice(); },
    templateById:templateById,
    previewLines:previewLines,
    compactSummary:compactSummary,
    applyTemplate:applyTemplate,
    applyTemplateNew:applyTemplateNew
  };
})((typeof window!=='undefined')?window:globalThis);
