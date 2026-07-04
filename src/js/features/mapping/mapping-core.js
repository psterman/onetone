(function(global){
  'use strict';
  var $=function(id){ return global.OneToneDom.$(id); };
  var t=function(key){ return global.OneToneI18n.t(key); };
  function state(){ return global.OneToneState.state; }
  function ui(){ return global.OneToneState.ui; }
  function hooks(){ return global.__vp_mapping_core_hooks__ || {}; }
  function mappingListUiActive(){
    return ui().drawerOpen&&ui().settingsPanel==='keyWake';
  }
  function renderMappingChrome(){
    renderSettingsSchemeSubnav();
    hooks().renderMappingList();
    hooks().renderSchemeSwitch();
    hooks().renderTestSendButton();
    renderConflictBanner();
    hooks().renderAddButton();
    hooks().renderDraftHint();
  }
  function schemeMappingHasConflict(m){
    if(!m||!isSavedMapping(m)||!m.enabled) return false;
    return conflictsForMapping(m.id).some(function(c){
      const other=mappingById(otherIdInConflict(c,m.id));
      return !!(other&&other.enabled);
    });
  }

  function schemeNavTags(m){
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
    tags.push({cls:m.enabled?'is-on':'is-off',text:m.enabled?t('homeLiveBadgeReady'):t('homeLiveBadgeOff')});
    return tags;
  }
  function renderSettingsSchemeSubnav(){
    const subnav=$('settingsSchemeSubnav');
    const listEl=$('settingsSchemeSubnavList');
    const keyWakePanel=$('settingsPanelKeyWake');
    const sidebar=document.querySelector('.settings-sidebar');
    const show=ui().drawerOpen&&ui().settingsPanel==='keyWake';
    if(subnav) subnav.hidden=!show;
    if(keyWakePanel) keyWakePanel.classList.toggle('is-scheme-subnav',show);
    if(sidebar) sidebar.classList.toggle('is-scheme-panel',show);
    if(listEl) listEl.setAttribute('aria-label',t('settingsSchemeSubnavLabel'));
    const addBtn=$('btnSettingsSchemeAdd');
    if(addBtn) addBtn.textContent='+ '+t('addMapping');
    if(!show||!listEl) return;
    hooks().ensureConfig();
    const schemes=sortedMappings();
    if(!schemes.length){
      listEl.innerHTML='<p class="settings-scheme-subnav-empty">'+hooks().escHtml(t('mappingEmptyTitle'))+'</p>';
      return;
    }
    let html='';
    schemes.forEach(function(m){
      const sel=m.id===state().selectedMappingId;
      const pair=hooks().homeMappingPairLine(m);
      const tags=schemeNavTags(m);
      let tagsHtml='';
      tags.forEach(function(tag){
        tagsHtml+='<span class="scheme-nav-tag '+tag.cls+'">'+hooks().escHtml(tag.text)+'</span>';
      });
      html+='<div class="settings-scheme-subnav-item'+(sel?' is-selected':'')+'" data-scheme-nav="'+m.id+'" role="option" aria-selected="'+(sel?'true':'false')+'" tabindex="0">';
      html+='<span class="settings-scheme-subnav-body">';
      html+='<span class="settings-scheme-subnav-pair">'+hooks().escHtml(pair)+'</span>';
      html+='<span class="settings-scheme-subnav-tags">'+tagsHtml+'</span>';
      html+='</span></div>';
    });
    listEl.innerHTML=html;
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

  function isDraftMapping(m){
    return !!(m&&!isSavedMapping(m));
  }

  function hasDraftMappings(){
    return sortedMappings().some(isDraftMapping);
  }

  function isDraftPristine(m){
    return isDraftMapping(m)&&!m.triggerKey&&!m.targetKey;
  }

  function removeDraftMapping(id){
    hooks().ensureConfig();
    const m=state().config.mappings.find(function(x){return x.id===id;});
    if(!m||isSavedMapping(m)) return;
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
    const saved=(m.targetKey||'').trim();
    if(saved) return saved;
    if(isSelectedMapping(m.id)) return (hooks().getEditorTargetKey()||'').trim();
    return '';
  }

  function flushEditorToMapping(m){
    if(!m||!isSelectedMapping(m.id)) return;
    const trig=(hooks().getEditorTriggerKey()||'').trim();
    const tgt=(hooks().getEditorTargetKey()||'').trim();
    if(trig) m.triggerKey=trig;
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
    try{
      window.chrome?.webview?.postMessage({type:'mvp_mapping_toggle',id:m.id,enabled:true});
    }catch(_){}
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
    ensureMappingTiming(m);
    if(!Array.isArray(m.switchKeys)) m.switchKeys=[];
    if(m.nativeKeyRestore===undefined) m.nativeKeyRestore=false;
    if(m.imePresetId===undefined) m.imePresetId='';
  }

  function isAutoTriggerMapping(m){
    return global.OneToneAppKeyUtils.normalizeTriggerKey(m&&m.triggerKey)==='AutoTrigger';
  }

  global.OneToneMappingCore={
    listUiActive:mappingListUiActive,renderChrome:renderMappingChrome,
    schemeHasConflict:schemeMappingHasConflict,schemeNavTags:schemeNavTags,
    renderSchemeSubnav:renderSettingsSchemeSubnav,friendlyPair:friendlyPair,
    isSaved:isSavedMapping,isDraft:isDraftMapping,hasDrafts:hasDraftMappings,
    isDraftPristine:isDraftPristine,removeDraft:removeDraftMapping,
    abandonDraftIfPristine:abandonDraftIfPristine,byId:mappingById,
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
