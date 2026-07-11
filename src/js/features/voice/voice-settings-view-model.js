(function(global){
  'use strict';
  var state=global.OneToneState.state;
  var t=function(key){ return global.OneToneI18n.t(key); };

  function hooks(){
    return global.__vp_voice_settings_flow_hooks__||{};
  }

  function resolveMicLabel(summary){
    if(summary&&summary.micLabel) return summary.micLabel;
    const micDevices=hooks().micDevices();
    const activeMicId=hooks().activeMicId();
    const dev=micDevices.find(function(d){ return d.id===activeMicId; })
      ||micDevices.find(function(d){ return d.isDefault; })
      ||micDevices[0];
    return dev?(dev.name||dev.id):t('homeVoiceMapMicEmpty');
  }

  function resolveHabitDisplayName(mapping){
    if(!mapping) return '—';
    if((mapping.group||'').trim()) return mapping.group.trim();
    if(global.OneToneHomeScheme&&global.OneToneHomeScheme.shortName) return global.OneToneHomeScheme.shortName(mapping);
    if((mapping.label||'').trim()) return mapping.label.trim();
    return mapping.id||'—';
  }

  function resolveActiveHabit(){
    const cfg=state.config||{};
    const hp=global.OneToneHabitProfile;
    function isVoiceOnly(m){
      return !!(m&&hp&&hp.hasVoiceParts(m,cfg)&&!hp.hasKeyParts(m));
    }
    function findById(id){
      return id&&Array.isArray(cfg.mappings)?cfg.mappings.find(function(m){ return m.id===id; }):null;
    }
    var uiEdit=global.OneToneState.ui&&global.OneToneState.ui.voiceEditSchemeId;
    if(uiEdit!=null&&String(uiEdit).trim()){
      var editMapping=findById(String(uiEdit).trim());
      if(editMapping&&isVoiceOnly(editMapping)){
        return {id:editMapping.id,name:resolveHabitDisplayName(editMapping),mapping:editMapping};
      }
    }
    if(uiEdit===null){
      return {id:'',name:resolveHabitDisplayName(null),mapping:null};
    }
    var activeId=cfg.activeSceneId;
    var active=findById(activeId);
    if(active&&isVoiceOnly(active)){
      return {id:activeId,name:resolveHabitDisplayName(active),mapping:active};
    }
    var selId=state.selectedMappingId;
    var sel=findById(selId);
    if(sel&&isVoiceOnly(sel)){
      return {id:selId,name:resolveHabitDisplayName(sel),mapping:sel};
    }
    var first=Array.isArray(cfg.mappings)?cfg.mappings.find(isVoiceOnly):null;
    if(first){
      return {id:first.id,name:resolveHabitDisplayName(first),mapping:first};
    }
    return {
      id:activeId||'',
      name:resolveHabitDisplayName(active),
      mapping:active
    };
  }

  function resolveModeLabel(mode){
    if(global.OneToneVoiceEngineReadiness&&global.OneToneVoiceEngineReadiness.isVoskOnlyUi()){
      if(mode==='off') return t('voiceModeCurrentOff');
      return t('voiceModeProEngine');
    }
    if(mode==='sapi') return t('voiceModeLiteEngine');
    if(mode==='vosk') return t('voiceModeProEngine');
    return t('voiceModeCurrentOff');
  }

  function resolveOutputSummaryLabel(vm){
    if(vm.loading) return t('homeLiveLoading');
    if(vm.mode==='sapi'||vm.mode==='off') return t('voiceSummaryOutputSilence');
    if(vm.autoSendEnabled) return t('voiceSummaryOutputAuto').replace('{key}',vm.autoSendKey);
    return t('voiceSummaryOutputConfirm');
  }

  function resolveOutputModeKey(vm){
    if(vm.mode==='sapi'||vm.mode==='off') return 'manual';
    return vm.autoSendEnabled?'auto':'confirm';
  }

  function resolveEndRuleSummary(vm){
    if(vm.loading) return t('homeLiveLoading');
    if(vm.mode==='sapi'||vm.mode==='off') return t('voiceEndRulesSummarySilence');
    if(vm.endPhraseEnabled&&vm.endPhrases&&vm.endPhrases.length) return t('voiceEndRulesSummaryPhraseSilence');
    if(vm.endPhraseEnabled) return t('voiceEndRulesSummaryPhrase');
    return t('voiceEndRulesSummarySilence');
  }

  function resolveScopeSummary(vm){
    const m=vm.habitMapping;
    if(!m) return t('voiceSummaryScopeAll');
    const appRules=global.OneToneAppBehaviorRules;
    const primary=String(m.appTargetId||'').trim();
    const rules=Array.isArray(m.appBehaviorRules)?m.appBehaviorRules.filter(function(r){ return r&&r.appId; }):[];
    if(!primary&&!rules.length) return t('voiceSummaryScopeAll');
    if(primary&&appRules){
      if(!rules.length||rules.length===0) return appRules.appDisplayName(primary);
    }
    const ids=[];
    if(primary) ids.push(primary);
    rules.forEach(function(r){
      if(ids.indexOf(r.appId)<0) ids.push(r.appId);
    });
    if(ids.length===1&&appRules) return appRules.appDisplayName(ids[0]);
    if(ids.length>1) return t('voiceSummaryScopeMulti').replace('{n}',String(ids.length));
    return t('voiceSummaryScopeAll');
  }

  function resolveSchemeDisplayName(vm){
    if(vm.loading) return t('homeLiveLoading');
    const habit=vm.habitName&&vm.habitName!=='—'?vm.habitName:t('voiceSchemeDefaultName').split('·')[0].trim();
    return habit+' · '+vm.modeLabel;
  }

  function escHtml(s){
    return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');
  }

  function resolveFinishChipLabel(vm){
    if(vm.mode==='sapi'||vm.mode==='off') return t('voiceChipFinishSilence');
    if(vm.autoSendEnabled){
      return t('voiceChipFinishAuto').replace('{key}',vm.autoSendKey);
    }
    return t('voiceChipFinishManual');
  }

  function endCfgTargetKey(){
    const end=(state.config&&state.config.voiceEnd)||(state.config&&state.config.voice_end)||{};
    return end.targetKey||end.target_key||'';
  }

  function resolveShortcutChipLabel(vm){
    if(vm.loading) return t('homeLiveLoading');
    const cfg=(state.config&&state.config.voiceSapi)||(state.config&&state.config.voice_sapi)||{};
    const vosk=(state.config&&state.config.voiceVosk)||(state.config&&state.config.voice_vosk)||{};
    const key=String(cfg.targetKey||vosk.targetKey||endCfgTargetKey()||'').trim();
    if(!key) return t('voiceInputChipShortcutUnset');
    const friendly=global.OneToneKeyLabels?global.OneToneKeyLabels.friendlyKeyName(key,global.OneToneI18n.getLang()):key;
    return t('voiceInputChipShortcut').replace('{key}',friendly);
  }

  function firstSelectedPhrase(selector){
    if(global.OneToneVoiceWakePresets){
      if(selector.indexOf('En')>=0){
        return global.OneToneVoiceWakePresets.firstSelectedPhrase('vosk','en');
      }
      if(selector.indexOf('Cn')>=0){
        return global.OneToneVoiceWakePresets.firstSelectedPhrase('vosk','zh');
      }
      return global.OneToneVoiceWakePresets.firstSelectedPhrase('sapi');
    }
    const btn=document.querySelector(selector+' [data-phrase].is-selected');
    return btn?(btn.getAttribute('data-phrase')||'').trim():'';
  }

  function resolveDisplayWakePhrase(vm){
    if(vm.loading) return {zh:'',en:'',display:t('homeLiveLoading')};
    var zh='';
    var en='';
    var lang=global.__vp_voice_wake_lang__||'zh';
    var presets=global.OneToneVoiceWakePresets;
    if(presets){
      if(vm.mode==='sapi'){
        zh=presets.firstSelectedPhrase('sapi')||vm.wakePhrase;
      }else if(vm.mode==='vosk'){
        zh=presets.firstSelectedPhrase('vosk','zh')||'';
        en=presets.firstSelectedPhrase('vosk','en')||'';
        if(!zh&&!en) zh=vm.wakePhrase;
      }else{
        zh=vm.wakePhrase;
      }
    }else if(vm.mode==='sapi'){
      zh=firstSelectedPhrase('#voiceSapiPresets')||vm.wakePhrase;
    }else if(vm.mode==='vosk'){
      zh=firstSelectedPhrase('#voiceVoskPresetsCn');
      en=firstSelectedPhrase('#voiceVoskPresetsEn');
      if(!zh&&!en) zh=vm.wakePhrase;
    }else{
      zh=vm.wakePhrase;
    }
    var display='';
    if(vm.mode==='vosk'&&lang==='en'&&(en||zh)) display=en||zh;
    else display=zh||en||'';
    if(!display) display=t('voiceChipWakeUnset');
    return {zh:zh,en:en,display:display,lang:lang};
  }

  function build(loading){
    loading=!!loading;
    const summary=global.OneToneVoiceHomeSummary
      ?global.OneToneVoiceHomeSummary.compute()
      :null;
    const eng=summary?summary.engine:hooks().homeVoiceEngineOn();
    const mode=eng==='vosk'?'vosk':(eng==='sapi'?'sapi':'off');
    const endSnap=hooks().voiceUiSnapshot().end||{};
    const endCfg=(state.config&&state.config.voiceEnd)||(state.config&&state.config.voice_end)||{};
    const habit=resolveActiveHabit();
    const mapping=habit.mapping;
    const wakePhrase=summary?summary.wakePhrase:hooks().homeVoiceWakePhrase();
    const autoSendEnabled=!!endSnap.autoSendEnabled||!!(endCfg&&endCfg.autoSendEnabled);
    const autoSendDelayMs=endSnap.commitDelayMs!=null?endSnap.commitDelayMs:(endCfg&&endCfg.commitDelayMs!=null?endCfg.commitDelayMs:4000);
    const autoSendKey=String(endSnap.commitKey||endCfg.commitKey||endCfg.commit_key||'Enter').trim()||'Enter';
    const endPhrases=((endSnap.phrasesZh||[]).concat(endSnap.phrasesEn||[]));
    const vm={
      loading:loading,
      mode:mode,
      modeLabel:resolveModeLabel(mode),
      wakePhrase:String(wakePhrase||'').trim(),
      wakeSourceLabel:loading?t('homeLiveLoading'):resolveMicLabel(summary),
      endPhraseEnabled:!!endSnap.enabled||!!(endCfg&&endCfg.enabled),
      endPhrases:endPhrases,
      endDetectionLabel:'',
      autoSendEnabled:autoSendEnabled,
      autoSendDelayMs:autoSendDelayMs,
      autoSendKey:autoSendKey,
      finishChipLabel:'',
      habitName:habit.name,
      habitMapping:mapping,
      habitHasKeyAutoSend:!!(mapping&&mapping.autoEnterEnabled),
      habitOverrideEnabled:false,
      voiceOn:!!(summary&&summary.voiceOn),
      statusLine:summary?summary.statusLine:'',
      lite:hooks().voiceEndUiUsesLiteMode()
    };
    vm.finishChipLabel=loading?t('homeLiveLoading'):resolveFinishChipLabel(vm);
    vm.endDetectionLabel=vm.finishChipLabel;
    return vm;
  }

  global.OneToneVoiceSettingsViewModel={
    build:build,
    escHtml:escHtml,
    resolveOutputModeKey:resolveOutputModeKey,
    resolveOutputSummaryLabel:resolveOutputSummaryLabel,
    resolveEndRuleSummary:resolveEndRuleSummary,
    resolveScopeSummary:resolveScopeSummary,
    resolveSchemeDisplayName:resolveSchemeDisplayName,
    resolveDisplayWakePhrase:resolveDisplayWakePhrase,
    resolveShortcutChipLabel:resolveShortcutChipLabel,
    resolveFinishChipLabel:resolveFinishChipLabel,
    firstSelectedPhrase:firstSelectedPhrase
  };
})((typeof window!=='undefined')?window:globalThis);
