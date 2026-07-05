(function(global){
  'use strict';

  var $=function(id){ return global.OneToneDom.$(id); };
  function state(){ return global.OneToneState.state; }
  function t(key){ return global.OneToneI18n.t(key); }

  var choiceResolve=null;
  var choiceMode=false;

  function mappingById(id){
    var cfg=state().config;
    if(!cfg||!Array.isArray(cfg.mappings)||!id) return null;
    return cfg.mappings.find(function(m){ return m.id===id; })||null;
  }

  function activeSceneMapping(){
    var cfg=state().config;
    if(!cfg) return null;
    return mappingById(cfg.activeSceneId);
  }

  function mappingHasTargetOverride(m){
    if(!m||!m.voiceOverride) return false;
    return !!(m.voiceOverride.targetKey&&String(m.voiceOverride.targetKey).trim());
  }

  function activeSceneHasTargetOverride(){
    return mappingHasTargetOverride(activeSceneMapping());
  }

  function normalizeVoiceOverride(mapping){
    if(!mapping||!mapping.voiceOverride) return;
    var ov=mapping.voiceOverride;
    var empty=!((ov.targetKey&&String(ov.targetKey).trim())
      ||(ov.wakePhrases&&ov.wakePhrases.length)
      ||(ov.endPhrases&&((ov.endPhrases.zh&&ov.endPhrases.zh.length)||(ov.endPhrases.en&&ov.endPhrases.en.length))));
    if(empty) mapping.voiceOverride=null;
  }

  function clearMappingTargetOverride(mapping){
    if(!mapping||!mapping.voiceOverride) return false;
    delete mapping.voiceOverride.targetKey;
    normalizeVoiceOverride(mapping);
    return true;
  }

  function clearActiveSceneTargetOverride(){
    return clearMappingTargetOverride(activeSceneMapping());
  }

  function closeChoice(result){
    var overlay=$('confirmOverlay');
    if(overlay){
      overlay.classList.remove('open');
      overlay.setAttribute('aria-hidden','true');
    }
    var alt=$('btnConfirmAlt');
    var ok=$('btnConfirmOk');
    var cancel=$('btnConfirmCancel');
    var title=$('confirmTitle');
    if(alt) alt.hidden=true;
    if(ok) ok.textContent=t('confirmOk');
    if(cancel) cancel.textContent=t('confirmCancel');
    if(title) title.textContent=t('confirmTitle');
    choiceMode=false;
    if(choiceResolve){
      var fn=choiceResolve;
      choiceResolve=null;
      fn(result);
    }
  }

  function openGlobalTargetSyncChoice(message){
    return new Promise(function(resolve){
      choiceResolve=resolve;
      choiceMode=true;
      var overlay=$('confirmOverlay');
      var msgEl=$('confirmBody')||$('confirmMessage');
      var title=$('confirmTitle');
      var ok=$('btnConfirmOk');
      var alt=$('btnConfirmAlt');
      var cancel=$('btnConfirmCancel');
      if(title) title.textContent=t('voiceSyncConfirmTitle');
      if(msgEl) msgEl.textContent=String(message||t('voiceSyncConfirmGlobalToScene'));
      if(ok) ok.textContent=t('voiceSyncConfirmGlobalOnly');
      if(alt){
        alt.hidden=false;
        alt.textContent=t('voiceSyncConfirmGlobalAndClear');
      }
      if(cancel) cancel.textContent=t('confirmCancel');
      if(overlay){
        overlay.classList.add('open');
        overlay.setAttribute('aria-hidden','false');
      }
    });
  }

  function guardGlobalTargetWrite(onProceed, opts){
    opts=opts||{};
    if(opts.skipConfirm){
      onProceed(false);
      return;
    }
    var mapping=opts.mapping||activeSceneMapping();
    if(!mappingHasTargetOverride(mapping)){
      onProceed(false);
      return;
    }
    openGlobalTargetSyncChoice(t('voiceSyncConfirmGlobalToScene')).then(function(choice){
      if(choice==='cancel') return;
      var cleared=false;
      if(choice==='global-clear'){
        cleared=clearMappingTargetOverride(mapping);
        if(cleared&&global.OneToneConfigPersist) global.OneToneConfigPersist.save();
        if(global.OneToneSceneVoiceTab) global.OneToneSceneVoiceTab.render();
      }
      onProceed(cleared);
    });
  }

  function bindEvents(){
    var alt=$('btnConfirmAlt');
    var ok=$('btnConfirmOk');
    var cancel=$('btnConfirmCancel');
    if(ok){
      ok.addEventListener('click',function(e){
        if(!choiceMode) return;
        e.stopImmediatePropagation();
        e.preventDefault();
        closeChoice('global-only');
      }, true);
    }
    if(cancel){
      cancel.addEventListener('click',function(e){
        if(!choiceMode) return;
        e.stopImmediatePropagation();
        e.preventDefault();
        closeChoice('cancel');
      }, true);
    }
    if(alt){
      alt.addEventListener('click',function(e){
        e.stopPropagation();
        if(!choiceMode) return;
        e.stopImmediatePropagation();
        e.preventDefault();
        closeChoice('global-clear');
      });
    }
    var overlay=$('confirmOverlay');
    if(overlay){
      overlay.addEventListener('click',function(e){
        if(!choiceMode) return;
        if(e.target===overlay) closeChoice('cancel');
      });
    }
  }

  global.OneToneSceneSyncConfirm={
    activeSceneMapping:activeSceneMapping,
    activeSceneHasTargetOverride:activeSceneHasTargetOverride,
    mappingHasTargetOverride:mappingHasTargetOverride,
    clearActiveSceneTargetOverride:clearActiveSceneTargetOverride,
    guardGlobalTargetWrite:guardGlobalTargetWrite,
    isChoiceMode:function(){ return choiceMode; },
    bindEvents:bindEvents
  };
})((typeof window!=='undefined')?window:globalThis);
