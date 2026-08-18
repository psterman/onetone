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
    if(!mapping) return t('homeWbChipUniversal')||'通用';
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
    function universalHabit(){
      return {id:'',name:t('homeWbChipUniversal')||'通用',mapping:null};
    }
    var uiEdit=global.OneToneState.ui&&global.OneToneState.ui.voiceEditSchemeId;
    // Global voice base wins over leftover habitScenarioReturnId (openGlobalVoice clears it,
    // but nav reopen / race must not reattach active Cursor as the edit identity).
    if(uiEdit==='__global__'||uiEdit===null){
      return universalHabit();
    }
    // App-scenario voice edit: bind to the scenario mapping being edited.
    var scenarioEditId=global.OneToneState.ui&&global.OneToneState.ui.habitScenarioReturnId;
    var scenarioPanel=global.OneToneState.ui&&global.OneToneState.ui.habitScenarioReturnPanel;
    if(String(scenarioPanel||'')==='voice'&&scenarioEditId!=null&&String(scenarioEditId).trim()){
      var scenarioMapping=findById(String(scenarioEditId).trim());
      if(scenarioMapping){
        return {id:scenarioMapping.id,name:resolveHabitDisplayName(scenarioMapping),mapping:scenarioMapping};
      }
    }
    var selId=state.selectedMappingId;
    var sel=findById(selId);
    if(sel&&isVoiceOnly(sel)){
      return {id:selId,name:resolveHabitDisplayName(sel),mapping:sel};
    }
    if(uiEdit!=null&&String(uiEdit).trim()&&uiEdit!=='__global__'){
      var editMapping=findById(String(uiEdit).trim());
      if(editMapping&&isVoiceOnly(editMapping)){
        return {id:editMapping.id,name:resolveHabitDisplayName(editMapping),mapping:editMapping};
      }
      if(editMapping){
        return {id:editMapping.id,name:resolveHabitDisplayName(editMapping),mapping:editMapping};
      }
    }
    if(!String(selId||'').trim()){
      return universalHabit();
    }
    var activeId=cfg.activeSceneId;
    var active=findById(activeId);
    if(active&&isVoiceOnly(active)){
      return {id:activeId,name:resolveHabitDisplayName(active),mapping:active};
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
    var cfg=state.config||{};
    var strategy=String(cfg.voiceListeningStrategy||cfg.voice_listening_strategy||'').trim();
    if(strategy==='auto') return t('voiceListeningStrategyAuto');
    if(strategy==='resourceSaver') return t('voiceListeningStrategyResourceSaver');
    if(strategy==='enhanced') return t('voiceListeningStrategyEnhanced');
    if(strategy==='off') return t('voiceListeningStrategyOff');
    if(strategy==='advanced') return t('voiceListeningStrategyAdvanced');
    if(global.OneToneVoiceEngineReadiness&&global.OneToneVoiceEngineReadiness.isVoskOnlyUi()){
      if(mode==='off') return t('voiceListeningStrategyOff');
      if(mode==='kws') return t('voiceRecognizeSourceKws');
      return t('voiceListeningStrategyAuto');
    }
    if(mode==='sapi') return t('voiceRecognizeSourceSapi');
    if(mode==='vosk') return t('voiceListeningStrategyAuto');
    if(mode==='kws') return t('voiceRecognizeSourceKws');
    return t('voiceModeCurrentOff');
  }

  function resolveOutputModeKey(vm){
    if(vm.mode==='sapi'||vm.mode==='off') return 'confirm';
    if(vm.sendMode==='phrase'||vm.sendMode==='auto'||vm.sendMode==='confirm') return vm.sendMode;
    return vm.autoSendEnabled?'auto':'confirm';
  }

  function resolveOutputSummaryLabel(vm){
    if(vm.loading) return t('homeLiveLoading');
    if(vm.mode==='sapi'||vm.mode==='off') return t('voiceSummaryOutputSilence');
    var key=resolveOutputModeKey(vm);
    if(key==='auto') return t('voiceSummaryOutputAuto').replace('{key}',vm.autoSendKey);
    if(key==='phrase') return t('voiceSummaryOutputPhrase');
    return t('voiceSummaryOutputConfirm');
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
    // Global voice edit: never list active app / Agent scope as if this were that scene.
    if(!m) return t('voiceSummaryScopeUniversal')||t('voiceSummaryScopeAll')||'所有未单独覆盖的习惯';
    const appRules=global.OneToneAppBehaviorRules;
    const primary=String(m.appTargetId||'').trim();
    const rules=Array.isArray(m.appBehaviorRules)?m.appBehaviorRules.filter(function(r){
      return r&&r.appId;
    }):[];
    if(!primary&&!rules.length) return t('voiceSummaryScopeUniversal')||t('voiceSummaryScopeAll')||'所有未单独覆盖的习惯';
    const ids=[];
    const labels=[];
    rules.forEach(function(r){
      if(r.appId==='custom'){
        if(appRules&&appRules.ruleDisplayName){
          var customName=appRules.ruleDisplayName(r);
          if(customName&&labels.indexOf(customName)<0) labels.push(customName);
        }
        return;
      }
      if(ids.indexOf(r.appId)<0){
        ids.push(r.appId);
        if(appRules) labels.push(appRules.appDisplayName(r.appId));
      }
    });
    if(!labels.length&&primary&&appRules) return appRules.appDisplayName(primary);
    if(labels.length===1) return labels[0];
    if(labels.length>1) return t('voiceSummaryScopeMulti').replace('{n}',String(labels.length));
    if(ids.length===1&&appRules) return appRules.appDisplayName(ids[0]);
    if(ids.length>1) return t('voiceSummaryScopeMulti').replace('{n}',String(ids.length));
    return t('voiceSummaryScopeUniversal')||t('voiceSummaryScopeAll')||'所有未单独覆盖的习惯';
  }

  function resolveSchemeDisplayName(vm){
    if(vm.loading) return t('homeLiveLoading');
    const habit=vm.habitName&&vm.habitName!=='—'?vm.habitName:(t('homeWbChipUniversal')||'通用');
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
    const sk=resolveWakeShortcutKey(vm);
    if(sk.unset) return t('voiceInputChipShortcutUnset');
    return t('voiceInputChipShortcut').replace('{key}',sk.friendly);
  }

  function resolveWakeShortcutKey(vm){
    if(vm&&vm.loading) return {key:'',friendly:'',unset:true};
    const cfg=(state.config&&state.config.voiceSapi)||(state.config&&state.config.voice_sapi)||{};
    const vosk=(state.config&&state.config.voiceVosk)||(state.config&&state.config.voice_vosk)||{};
    const key=String(cfg.targetKey||vosk.targetKey||endCfgTargetKey()||'').trim();
    if(!key) return {key:'',friendly:'',unset:true};
    const friendly=global.OneToneKeyLabels?global.OneToneKeyLabels.friendlyKeyName(key,global.OneToneI18n.getLang()):key;
    return {key:key,friendly:friendly,unset:false};
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

  function sanitizePhrase(s){
    s=String(s||'').trim();
    if(!s) return '';
    if(/^[\?？.\-_]+$/.test(s)) return '';
    if(s==='[unk]'||s==='[UNK]') return '';
    return s;
  }

  function sanitizePhraseList(arr){
    return Array.isArray(arr)?arr.map(function(p){ return sanitizePhrase(p); }).filter(Boolean):[];
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
      }else if(vm.mode==='kws'){
        zh=vm.wakePhrase;
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
    display=sanitizePhrase(display);
    if(!display) display=t('voiceChipWakeUnset');
    return {zh:sanitizePhrase(zh),en:sanitizePhrase(en),display:display,lang:lang};
  }

  function build(loading){
    loading=!!loading;
    const summary=global.OneToneVoiceHomeSummary
      ?global.OneToneVoiceHomeSummary.compute()
      :null;
    const eng=summary?summary.engine:hooks().homeVoiceEngineOn();
    const mode=eng==='vosk'?'vosk':(eng==='sapi'?'sapi':(eng==='kws'?'kws':'off'));
    const endSnap=hooks().voiceUiSnapshot().end||{};
    const endCfg=(state.config&&state.config.voiceEnd)||(state.config&&state.config.voice_end)||{};
    const habit=resolveActiveHabit();
    const mapping=habit.mapping;
    const wakePhrase=summary?sanitizePhrase(summary.wakePhrase):sanitizePhrase(hooks().homeVoiceWakePhrase());
    const autoSendEnabled=!!endSnap.autoSendEnabled||!!(endCfg&&endCfg.autoSendEnabled);
    const sendMode=String(endSnap.sendMode||endCfg.sendMode||(autoSendEnabled?'auto':'confirm')).trim().toLowerCase()||'confirm';
    const autoSendDelayMs=endSnap.commitDelayMs!=null?endSnap.commitDelayMs:(endCfg&&endCfg.commitDelayMs!=null?endCfg.commitDelayMs:4000);
    const autoSendKey=String(endSnap.commitKey||endCfg.commitKey||endCfg.commit_key||'Enter').trim()||'Enter';
    const endPhrases=((endSnap.phrasesZh||[]).concat(endSnap.phrasesEn||[]));
    const cancelPhrases=((endSnap.cancelPhrasesZh||endSnap.cancel_phrases_zh||[]).concat(endSnap.cancelPhrasesEn||endSnap.cancel_phrases_en||[]));
    const sendPhrases=((endSnap.sendPhrasesZh||endSnap.send_phrases_zh||[]).concat(endSnap.sendPhrasesEn||endSnap.send_phrases_en||[]));
    const vm={
      loading:loading,
      mode:mode,
      modeLabel:resolveModeLabel(mode),
      wakePhrase:String(wakePhrase||'').trim(),
      wakeSourceLabel:loading?t('homeLiveLoading'):resolveMicLabel(summary),
      endPhraseEnabled:!!endSnap.enabled||!!(endCfg&&endCfg.enabled),
      endPhrases:endPhrases,
      cancelPhrases:cancelPhrases,
      sendPhrases:sendPhrases,
      sendMode:sendMode==='phrase'||sendMode==='auto'||sendMode==='confirm'?sendMode:(autoSendEnabled?'auto':'confirm'),
      endDetectionLabel:'',
      autoSendEnabled:autoSendEnabled||sendMode==='auto',
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
    sanitizePhrase:sanitizePhrase,
    sanitizePhraseList:sanitizePhraseList,
    resolveShortcutChipLabel:resolveShortcutChipLabel,
    resolveWakeShortcutKey:resolveWakeShortcutKey,
    resolveFinishChipLabel:resolveFinishChipLabel,
    firstSelectedPhrase:firstSelectedPhrase
  };
})((typeof window!=='undefined')?window:globalThis);
