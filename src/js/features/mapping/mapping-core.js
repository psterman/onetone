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
    const listEl=$('settingsSchemeSubnavList');
    const habitsPanel=$('settingsPanelHabits');
    const keysPanel=$('settingsPanelKeys');
    const sidebar=$('settingsSidebar')||document.querySelector('.settings-sidebar');
    const shell=$('settingsShell')||document.querySelector('.settings-shell');
    const show=mappingListUiActive();
    if(subnav) subnav.hidden=!show;
    if(habitsPanel) habitsPanel.classList.toggle('is-scheme-subnav',show);
    if(keysPanel) keysPanel.classList.toggle('is-scheme-subnav',show);
    if(sidebar) sidebar.classList.toggle('is-scheme-panel',show);
    if(shell) shell.classList.toggle('is-scheme-panel',show);
    if(listEl) listEl.setAttribute('aria-label',t('settingsKeysSubnavLabel'));
    const addBtn=$('btnSettingsSchemeAdd');
    if(addBtn) addBtn.textContent='+ '+t('addKeysDraft');
    if(!show||!listEl){
      if(global.OneToneSettingsDrawer&&global.OneToneSettingsDrawer.syncSubnavRail) global.OneToneSettingsDrawer.syncSubnavRail();
      return;
    }
    hooks().ensureConfig();
    const schemes=sortedMappings();
    const saved=schemes.filter(isSavedMapping);
    const drafts=schemes.filter(isIncompleteScheme);
    if(!saved.length&&!drafts.length){
      listEl.innerHTML='<p class="settings-scheme-subnav-empty">'+hooks().escHtml(t('mappingEmptyTitle'))+'</p>';
      if(global.OneToneSettingsDrawer&&global.OneToneSettingsDrawer.syncSubnavRail) global.OneToneSettingsDrawer.syncSubnavRail();
      return;
    }
    let html='';
    html+='<div class="settings-scheme-subnav-group settings-scheme-subnav-saved">';
    html+='<p class="settings-scheme-subnav-group-lbl">'+hooks().escHtml(t('settingsKeysSavedLbl'))+'</p>';
    if(saved.length){
      saved.forEach(function(m){ html+=renderSchemeSubnavItem(m); });
    }else{
      html+='<p class="settings-scheme-subnav-empty settings-scheme-subnav-saved-empty">'+hooks().escHtml(t('settingsKeysSavedEmpty'))+'</p>';
    }
    html+='</div>';
    html+='<div class="settings-scheme-subnav-group settings-scheme-subnav-drafts">';
    html+='<p class="settings-scheme-subnav-group-lbl">'+hooks().escHtml(t('settingsKeysDraftBoxLbl'))+'</p>';
    if(drafts.length){
      drafts.forEach(function(m){ html+=renderSchemeSubnavItem(m); });
    }else{
      html+='<p class="settings-scheme-subnav-empty settings-scheme-subnav-draft-empty">'+hooks().escHtml(t('settingsKeysDraftBoxEmpty'))+'</p>';
    }
    html+='</div>';
    listEl.innerHTML=html;
    listEl.querySelectorAll('[data-scheme-del]').forEach(function(btn){
      btn.addEventListener('mousedown',function(e){ e.stopPropagation(); });
      btn.addEventListener('click',function(e){
        e.preventDefault();
        e.stopPropagation();
        var delId=btn.getAttribute('data-scheme-del');
        if(!delId) return;
        if(global.OneToneMappingTrashMenu) global.OneToneMappingTrashMenu.deleteFromMenu(delId);
        if(hooks().render) hooks().render();
        renderSettingsSchemeSubnav();
        if(global.OneToneSceneModeHub) global.OneToneSceneModeHub.render();
      });
    });
    if(global.OneToneHabitLayerNav) global.OneToneHabitLayerNav.render();
    if(global.OneToneSettingsDrawer&&global.OneToneSettingsDrawer.syncSubnavRail) global.OneToneSettingsDrawer.syncSubnavRail();
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
    state().config.mappings=state().config.mappings.filter(function(x){return x.id!==id;});
    if(hooks().getPendingNewDraftId()===id) hooks().setPendingNewDraftId(null);
    if(state().selectedMappingId===id){
      const remain=state().config.mappings;
      state().selectedMappingId=remain.length?remain[remain.length-1].id:null;
      hooks().syncEditorFromSelection();
    }
    hooks().save();
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
    hooks().flushAllEditorToMappings();
    state().selectedMappingId=id;
    hooks().syncEditorFromSelection();
    hooks().render();
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
  }

  function isAutoTriggerMapping(m){
    return global.OneToneAppKeyUtils.normalizeTriggerKey(m&&m.triggerKey)==='AutoTrigger';
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
    ensureMappingExtras:ensureMappingExtras,isAutoTriggerMapping:isAutoTriggerMapping
  };
})((typeof window!=='undefined')?window:globalThis);
