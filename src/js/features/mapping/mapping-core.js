(function(global){
  'use strict';
  var $=function(id){ return global.OneToneDom.$(id); };
  var t=function(key){ return global.OneToneI18n.t(key); };
  function state(){ return global.OneToneState.state; }
  function ui(){ return global.OneToneState.ui; }
  function hooks(){ return global.__vp_mapping_core_hooks__ || {}; }
  function schemePanelActive(){
    var drawer=global.OneToneSettingsDrawer;
    return ui().drawerOpen&&drawer&&drawer.isKeysPanel();
  }
  function mappingListUiActive(){
    return schemePanelActive();
  }
  function renderMappingChrome(){
    renderSettingsSchemeSubnav();
    hooks().renderMappingList();
    hooks().renderSchemeSwitch();
    hooks().renderTestSendButton();
    renderConflictBanner();
    hooks().renderAddButton();
    hooks().renderDraftHint();
    if(global.OneToneSceneTabs) global.OneToneSceneTabs.render();
    if(global.OneToneSceneVoiceTab) global.OneToneSceneVoiceTab.render();
  }
  function schemeMappingHasConflict(m){
    if(!m||!isSavedMapping(m)||!m.enabled) return false;
    return conflictsForMapping(m.id).some(function(c){
      const other=mappingById(otherIdInConflict(c,m.id));
      return !!(other&&other.enabled);
    });
  }

  function habitProfileFor(m){
    var hpMod=global.OneToneHabitProfile;
    if(!hpMod||!hpMod.project||!m) return null;
    hooks().ensureConfig();
    return hpMod.project(m,state().config||{});
  }

  function keysEditorNavTags(m){
    const tags=[];
    if(isDraftMapping(m)){
      tags.push({cls:'is-draft',text:t('keySchemeCompletenessDraft')});
      return tags;
    }
    if(!isSavedMapping(m)){
      tags.push({cls:'is-incomplete',text:t('keySchemeCompletenessIncomplete')});
      return tags;
    }
    if(schemeMappingHasConflict(m)) tags.push({cls:'is-conflict',text:t('keySchemeConflict')});
    const profile=habitProfileFor(m);
    const keyOn=profile?profile.keyEnabled:!!m.enabled;
    tags.push({cls:keyOn?'is-on':'is-off',text:keyOn?t('homeLiveBadgeReady'):t('homeLiveBadgeOff')});
    return tags;
  }

  function schemeNavTags(m){
    const tags=keysEditorNavTags(m);
    const profile=habitProfileFor(m);
    if(profile&&profile.isActive) tags.unshift({cls:'is-active-scene',text:t('sceneActiveBadge')});
    return tags;
  }
  function renderSchemeSubnavItem(m){
    const sel=m.id===state().selectedMappingId;
    const pair=hooks().homeMappingPairLine(m);
    const tags=keysEditorNavTags(m);
    let tagsHtml='';
    tags.forEach(function(tag){
      tagsHtml+='<span class="scheme-nav-tag '+tag.cls+'">'+hooks().escHtml(tag.text)+'</span>';
    });
    const isDraft=isIncompleteScheme(m);
    return '<div class="settings-scheme-subnav-item'+(sel?' is-selected':'')+(isDraft?' is-draft-item':'')+'" data-scheme-nav="'+m.id+'" role="option" aria-selected="'+(sel?'true':'false')+'" tabindex="0">'
      +'<span class="settings-scheme-subnav-body">'
      +'<span class="settings-scheme-subnav-pair">'+hooks().escHtml(pair)+'</span>'
      +'<span class="settings-scheme-subnav-tags">'+tagsHtml+'</span>'
      +'</span>'
      +'<button type="button" class="settings-scheme-subnav-del" data-scheme-del="'+m.id+'" aria-label="'+hooks().escHtml(t('delete'))+'" title="'+hooks().escHtml(t('delete'))+'">×</button>'
      +'</div>';
  }
  function renderSettingsSchemeSubnav(){
    const subnav=$('settingsSchemeSubnav');
    const habitsPanel=$('settingsPanelHabits');
    const keysPanel=$('settingsPanelKeys');
    const sidebar=$('settingsSidebar')||document.querySelector('.settings-sidebar');
    const shell=$('settingsShell')||document.querySelector('.settings-shell');
    if(subnav) subnav.hidden=true;
    if(habitsPanel) habitsPanel.classList.remove('is-scheme-subnav');
    if(keysPanel) keysPanel.classList.remove('is-scheme-subnav');
    if(sidebar) sidebar.classList.remove('is-scheme-panel');
    if(shell) shell.classList.remove('is-scheme-panel');
    if(global.OneToneSettingsDrawer&&global.OneToneSettingsDrawer.syncSubnavRail){
      global.OneToneSettingsDrawer.syncSubnavRail();
    }
  }
  function friendlyPair(triggerKey,targetKey,m){
    const lang=global.OneToneI18n&&global.OneToneI18n.getLang?global.OneToneI18n.getLang():'zh';
    if(global.OneToneKeyLabels){
      const labels=global.OneToneKeyLabels.labelsForMapping({
        triggerKey:triggerKey||'',
        targetKey:targetKey||'',
        sourceKey:m&&m.sourceKey||''
      },lang);
      if(labels.triggerLabel||labels.targetLabel){
        return (labels.triggerLabel||'?')+' → '+(labels.targetLabel||'?');
      }
    }
    return (hooks().friendlyKeyName(triggerKey)||'?')+' → '+(hooks().friendlyKeyName(targetKey)||'?');
  }

  function isSavedMapping(m){
    return !!(m&&editorTriggerForMapping(m)&&editorTargetForMapping(m));
  }

  function isLibraryHabit(m){
    var hp=global.OneToneHabitProfile;
    var cfg=state().config||{};
    return !!(hp&&hp.isLibraryHabit&&hp.isLibraryHabit(m,cfg));
  }

  function isDraftMapping(m){
    return !!(m&&!isSavedMapping(m)&&!isLibraryHabit(m));
  }

  function isIncompleteScheme(m){
    return !!(m&&!isSavedMapping(m));
  }

  function hasDraftMappings(){
    return sortedMappings().some(isIncompleteScheme);
  }

  function isDraftPristine(m){
    return isDraftMapping(m)&&!m.triggerKey&&!m.targetKey;
  }

  function removeDraftMapping(id){
    hooks().ensureConfig();
    const m=state().config.mappings.find(function(x){return x.id===id;});
    if(!m||!isDraftMapping(m)) return;
    var voiceOnly=false;
    try{
      var vs=global.OneToneVoiceSchemePersist;
      voiceOnly=!!(vs&&vs.isVoiceOnly&&vs.isVoiceOnly(m));
    }catch(_){}
    state().config.mappings=state().config.mappings.filter(function(x){return x.id!==id;});
    if(hooks().getPendingNewDraftId()===id) hooks().setPendingNewDraftId(null);
    if(state().selectedMappingId===id){
      const remain=state().config.mappings;
      state().selectedMappingId=remain.length?remain[remain.length-1].id:null;
      if(!voiceOnly) hooks().syncEditorFromSelection();
    }
    if(voiceOnly){
      var ui=global.OneToneState&&global.OneToneState.ui;
      if(ui&&String(ui.voiceEditSchemeId||'')===id) ui.voiceEditSchemeId='__global__';
      requestAnimationFrame(function(){
        if(global.OneToneVoiceSchemePersist&&global.OneToneVoiceSchemePersist.refreshVoiceSchemeSurfaces){
          global.OneToneVoiceSchemePersist.refreshVoiceSchemeSurfaces();
        }
      });
      return;
    }
    hooks().save({source:'mapping'});
    hooks().render();
  }

  function abandonDraftIfPristine(id){
    const m=state().config.mappings.find(function(x){return x.id===id;});
    if(!m||!isDraftPristine(m)) return false;
    removeDraftMapping(id);
    return true;
  }

  function mappingById(id){
    return id&&state().config&&state().config.mappings.find(function(x){return x.id===id;})||null;
  }

  function isSelectedMapping(id){
    return !!(id&&state().selectedMappingId===id);
  }

  function editorTriggerForMapping(m){
    if(!m) return '';
    const saved=(m.triggerKey||'').trim();
    if(saved) return saved;
    if(isSelectedMapping(m.id)) return (hooks().getEditorTriggerKey()||'').trim();
    return '';
  }

  function editorTargetForMapping(m){
    if(!m) return '';
    const appTargetId=String(m.appTargetId||'').trim();
    if(appTargetId){
      const cfg=state().config||{};
      const vosk=cfg.voiceVosk||cfg.voice_vosk||{};
      const sapi=cfg.voiceSapi||cfg.voice_sapi||{};
      const voiceKey=String(vosk.targetKey||sapi.targetKey||'').trim();
      if(voiceKey) return voiceKey;
    }
    const saved=(m.targetKey||'').trim();
    if(saved) return saved;
    if(isSelectedMapping(m.id)) return (hooks().getEditorTargetKey()||'').trim();
    return '';
  }

  function flushEditorToMapping(m){
    if(!m||!isSelectedMapping(m.id)) return;
    const trig=(hooks().getEditorTriggerKey()||'').trim();
    const tgt=(hooks().getEditorTargetKey()||'').trim();
    if(trig&&(!hooks().isAllowedTriggerKey||hooks().isAllowedTriggerKey(trig))) m.triggerKey=trig;
    if(tgt){
      m.targetKey=tgt;
      m.label=(m.triggerKey||'?')+' → '+tgt;
    }
  }

  function flushAllEditorToMappings(){
    hooks().ensureConfig();
    const m=selectedMapping();
    if(m) flushEditorToMapping(m);
  }

  function recordingMapping(){
    return mappingById(hooks().getRecordingMappingId())||selectedMapping();
  }

  function maybeEnableMappingAfterComplete(m){
    if(hooks().onboardIsOpen()||!m||!isSavedMapping(m)||m.enabled) return;
    var edit=global.OneToneMappingEditActions;
    if(edit&&edit.hasPendingEnable&&edit.hasPendingEnable(m.id)) return;
    if(edit&&edit.setMappingEnabled){
      edit.setMappingEnabled(m.id,true);
    }else{
      try{
        window.chrome?.webview?.postMessage({type:'mvp_mapping_toggle',id:m.id,enabled:true});
      }catch(_){}
    }
    hooks().toast(t('mappingAutoEnabled'));
  }

  function mappingTargetKey(id){
    const m=mappingById(id);
    return editorTargetForMapping(m)||'?';
  }

  function conflictsForMapping(id){
    return hooks().conflictRows().filter(function(c){return c.mappingId===id||c.otherId===id;});
  }

  function otherIdInConflict(c,selfId){
    return c.mappingId===selfId?c.otherId:c.mappingId;
  }

  function conflictHintForRow(c,selfId){
    if(!c) return '';
    const otherId=otherIdInConflict(c,selfId);
    const key=mappingTargetKey(otherId);
    return t('conflictRowHint').replace('{key}',key);
  }

  function focusMapping(id){
    if(!id) return;
    var prev=state().selectedMappingId;
    hooks().flushAllEditorToMappings();
    state().selectedMappingId=id;
    if(prev!==id&&global.OneToneKeysChannelCommandPicker&&global.OneToneKeysChannelCommandPicker.loadHeroCaptureFromMapping){
      try{ global.OneToneKeysChannelCommandPicker.loadHeroCaptureFromMapping(mappingById(id)); }catch(_){}
    }else if(prev!==id&&global.OneToneKeysChannelCommandPicker&&global.OneToneKeysChannelCommandPicker.clearSelection){
      try{ global.OneToneKeysChannelCommandPicker.clearSelection({ skipHero:true, skipRender:true, skipPersist:true }); }catch(_){}
    }
    hooks().syncEditorFromSelection();
    hooks().render();
    if(global.OneToneKeysChannelCommandPicker&&global.OneToneKeysChannelCommandPicker.refresh){
      try{ global.OneToneKeysChannelCommandPicker.refresh(); }catch(_){}
    }
    const row=document.querySelector('.map-row[data-id="'+id+'"]');
    if(row) row.scrollIntoView({block:'nearest',behavior:'smooth'});
  }

  function toggleMappingAdv(id){
    if(hooks().expandedAdvIds.has(id)) hooks().expandedAdvIds.delete(id);
    else hooks().expandedAdvIds.add(id);
  }

  function countConflictPairs(){
    const seen={};
    hooks().ensureConfig();
    sortedMappings().forEach(function(m){
      if(!schemeMappingHasConflict(m)) return;
      conflictsForMapping(m.id).forEach(function(c){
        if(!m.enabled) return;
        const other=mappingById(otherIdInConflict(c,m.id));
        if(!other||!other.enabled) return;
        seen[[m.id,other.id].sort().join('|')]=true;
      });
    });
    return Object.keys(seen).length;
  }

  function renderConflictBanner(){
    const el=$('conflictBanner');
    if(!el) return;
    const n=countConflictPairs();
    if(!n){ el.classList.remove('show'); el.textContent=''; return; }
    el.textContent=t('conflictBannerCount').replace('{n}',String(n));
    el.classList.add('show');
  }
  function formatTriggerTrace(m){
    if(!m) return '';
    const main=editorTriggerForMapping(m);
    const events=[];
    if(m.triggerSource&&Array.isArray(m.triggerSource.rawEvents)){
      m.triggerSource.rawEvents.forEach(function(ev){
        const label=ev.label||ev.hotkey||ev.key||'';
        if(label&&events.indexOf(label)<0) events.push(label);
      });
    }
    if(!events.length&&m.sourceKey) events.push(m.sourceKey);
    if(!events.length) return '';
    const filtered=events.filter(function(ev){
      return hooks().normalizeTriggerKey(ev)!==hooks().normalizeTriggerKey(main);
    });
    if(!filtered.length) return '';
    return filtered.map(hooks().friendlyKeyName).join(' / ');
  }
  function selectedMapping(){
    hooks().ensureConfig();
    return state().config.mappings.find(function(m){return m.id===state().selectedMappingId;})||state().config.mappings[0];
  }
  function activeSceneMapping(){
    hooks().ensureConfig();
    const cfg=state().config||{};
    const activeId=String(cfg.activeSceneId||'').trim();
    if(activeId){
      const hit=cfg.mappings.find(function(m){ return m.id===activeId; });
      if(hit) return hit;
    }
    return selectedMapping();
  }
  function sortedMappings(){
    return state().config.mappings.slice().sort(function(a,b){
      const ae=!!a.enabled, be=!!b.enabled;
      if(ae!==be) return ae?-1:1;
      return (a.order||0)-(b.order||0);
    });
  }

  function newMappingId(){
    return 'm-'+Date.now()+'-'+Math.random().toString(36).slice(2,7);
  }

  function ensureMappingTiming(m){
    if(!m) return;
    const cfg=state().config||{};
    if(!m.intervalMs) m.intervalMs=cfg.intervalMs||1200;
    if(!m.enterDelayMs) m.enterDelayMs=cfg.enterDelayMs||5000;
    if(m.cancelEnabled===undefined) m.cancelEnabled=cfg.cancelEnabled!==false;
    if(m.autoEnterEnabled===undefined) m.autoEnterEnabled=cfg.autoEnterEnabled!==false;
  }

  function ensureMappingExtras(m){
    if(!m) return;
    if((m.triggerMode||'').toLowerCase()==='toggle') m.triggerMode='tap';
    // Legacy alias: old UI used `hold`; runtime uses `longpress` for hold-to-talk.
    if((m.triggerMode||'').toLowerCase()==='hold') m.triggerMode='longpress';
    ensureMappingTiming(m);
    if(!Array.isArray(m.switchKeys)) m.switchKeys=[];
    if(m.nativeKeyRestore===undefined) m.nativeKeyRestore=false;
    if(m.imePresetId===undefined) m.imePresetId='';
    if(m.appTargetId===undefined) m.appTargetId='';
    if(!Array.isArray(m.appBehaviorRules)) m.appBehaviorRules=[];
    if(m.voiceOverride===undefined) m.voiceOverride=null;
    if(m.cameraOverride===undefined) m.cameraOverride=null;
    if(!Array.isArray(m.voiceCommands)) m.voiceCommands=[];
    if(!Array.isArray(m.acousticVoiceCommands)) m.acousticVoiceCommands=[];
    if(m.timeMachineWorkspace===undefined) m.timeMachineWorkspace='';
    if(m.captureHeroRef===undefined) m.captureHeroRef=null;
  }

  function defaultCaptureHeroRef(){
    return {channel:'key',bindingRef:'ime',actionId:'',actionInstanceId:'',kind:'ime'};
  }

  function normalizeCaptureHeroRef(ref){
    if(!ref||typeof ref!=='object') return defaultCaptureHeroRef();
    var ch=String(ref.channel||'key').trim();
    if(['key','voice','cursor','softPad','camera','ime'].indexOf(ch)<0) ch='key';
    return {
      channel:ch,
      bindingRef:String(ref.bindingRef||'').trim(),
      actionId:String(ref.actionId||'').trim(),
      actionInstanceId:String(ref.actionInstanceId||'').trim(),
      kind:String(ref.kind||((ch==='key'&&!ref.actionId)?'ime':'action')).trim()
    };
  }

  function isDefaultCaptureHeroRef(ref){
    ref=normalizeCaptureHeroRef(ref);
    return ref.kind==='ime'&&!ref.actionId;
  }

  function captureHeroRefForMapping(m){
    if(!m) return defaultCaptureHeroRef();
    if(!m.captureHeroRef) return defaultCaptureHeroRef();
    return normalizeCaptureHeroRef(m.captureHeroRef);
  }

  function setCaptureHeroRef(m,ref){
    if(!m) return;
    var norm=normalizeCaptureHeroRef(ref);
    if(isDefaultCaptureHeroRef(norm)) m.captureHeroRef=null;
    else m.captureHeroRef=norm;
  }

  function isAutoTriggerMapping(m){
    return global.OneToneAppKeyUtils.normalizeTriggerKey(m&&m.triggerKey)==='AutoTrigger';
  }

  function appTargetKey(m){
    return String(m&&m.appTargetId||'').trim();
  }

  function normalizeMappingTrigger(key){
    var utils=global.OneToneAppKeyUtils;
    if(utils&&utils.normalizeTriggerKey) return String(utils.normalizeTriggerKey(key)||'').trim();
    return String(key||'').trim();
  }

  /** Same app (incl. both empty = baseline) + same normalized trigger. */
  function findMappingByAppAndTrigger(appTargetId, triggerKey, exceptMappingId){
    var app=String(appTargetId||'').trim();
    var trig=normalizeMappingTrigger(triggerKey);
    if(!trig) return null;
    exceptMappingId=String(exceptMappingId||'').trim();
    hooks().ensureConfig();
    var list=Array.isArray(state().config.mappings)?state().config.mappings:[];
    for(var i=0;i<list.length;i++){
      var row=list[i];
      if(!row||!row.id) continue;
      if(exceptMappingId&&String(row.id)===exceptMappingId) continue;
      if(appTargetKey(row)!==app) continue;
      if(normalizeMappingTrigger(row.triggerKey)===trig) return row;
    }
    return null;
  }

  function forkHabitName(source, triggerKey){
    var trig=normalizeMappingTrigger(triggerKey);
    var friendly=trig;
    try{
      if(hooks().friendlyKeyName) friendly=hooks().friendlyKeyName(trig)||trig;
    }catch(_){}
    var app=appTargetKey(source);
    if(app){
      var appName=app;
      try{
        var presets=global.OneToneAppTargetPresets;
        if(presets&&presets.displayName) appName=presets.displayName(app)||app;
        else if(presets&&Array.isArray(presets.presets)){
          for(var i=0;i<presets.presets.length;i++){
            if(presets.presets[i]&&presets.presets[i].id===app){
              appName=presets.presets[i].name||presets.presets[i].label||app;
              break;
            }
          }
        }
      }catch(_){}
      return appName+' · '+friendly;
    }
    return (global.OneToneI18n&&global.OneToneI18n.t
      ?global.OneToneI18n.t('habitHubUniversalName')
      :'通用设置')+' · '+friendly;
  }

  /** Copy action fields into a new mapping; caller sets triggerKey + selects. */
  function forkMappingForTrigger(source, triggerKey){
    if(!source) return null;
    hooks().ensureConfig();
    var cfg=state().config;
    var copy;
    try{ copy=JSON.parse(JSON.stringify(source)); }
    catch(_){ return null; }
    var newId=newMappingId();
    copy.id=newId;
    copy.triggerKey=normalizeMappingTrigger(triggerKey);
    copy.triggerSource=null;
    copy.sourceKey=copy.triggerKey;
    copy.sourceTime='';
    copy.group=forkHabitName(source, triggerKey);
    copy.label=copy.triggerKey+' → '+(editorTargetForMapping(copy)||copy.targetKey||'?');
    copy.enabled=false;
    copy.order=Array.isArray(cfg.mappings)?cfg.mappings.length:0;
    copy.updatedAt=Date.now();
    copy.lastUsedAt=0;
    copy.useCount=0;
    if(global.OneToneConfigPersist&&global.OneToneConfigPersist.rekeyVoiceCommandsForMapping){
      copy.voiceCommands=global.OneToneConfigPersist.rekeyVoiceCommandsForMapping(copy.voiceCommands,newId);
    }
    ensureMappingExtras(copy);
    cfg.mappings=Array.isArray(cfg.mappings)?cfg.mappings:[];
    cfg.mappings.push(copy);
    return copy;
  }

  global.OneToneMappingCore={
    listUiActive:mappingListUiActive,renderChrome:renderMappingChrome,
    schemeHasConflict:schemeMappingHasConflict,schemeNavTags:schemeNavTags,keysEditorNavTags:keysEditorNavTags,
    renderSchemeSubnav:renderSettingsSchemeSubnav,friendlyPair:friendlyPair,
    isSaved:isSavedMapping,isDraft:isDraftMapping,isIncomplete:isIncompleteScheme,hasDrafts:hasDraftMappings,
    isDraftPristine:isDraftPristine,removeDraft:removeDraftMapping,
    abandonDraftIfPristine:abandonDraftIfPristine,byId:mappingById,activeScene:activeSceneMapping,
    isSelected:isSelectedMapping,editorTrigger:editorTriggerForMapping,
    editorTarget:editorTargetForMapping,flushEditor:flushEditorToMapping,
    flushAllEditor:flushAllEditorToMappings,recording:recordingMapping,
    maybeEnableAfterComplete:maybeEnableMappingAfterComplete,targetKey:mappingTargetKey,
    conflictsFor:conflictsForMapping,otherConflictId:otherIdInConflict,
    conflictHint:conflictHintForRow,focus:focusMapping,toggleAdv:toggleMappingAdv,
    countConflictPairs:countConflictPairs,renderConflictBanner:renderConflictBanner,
    formatTriggerTrace:formatTriggerTrace,selected:selectedMapping,sorted:sortedMappings,
    newMappingId:newMappingId,ensureMappingTiming:ensureMappingTiming,
    ensureMappingExtras:ensureMappingExtras,isAutoTriggerMapping:isAutoTriggerMapping,
    findMappingByAppAndTrigger:findMappingByAppAndTrigger,
    forkMappingForTrigger:forkMappingForTrigger,
    defaultCaptureHeroRef:defaultCaptureHeroRef,normalizeCaptureHeroRef:normalizeCaptureHeroRef,
    isDefaultCaptureHeroRef:isDefaultCaptureHeroRef,captureHeroRefForMapping:captureHeroRefForMapping,
    setCaptureHeroRef:setCaptureHeroRef
  };
})((typeof window!=='undefined')?window:globalThis);
