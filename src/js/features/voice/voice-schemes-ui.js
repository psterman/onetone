(function(global){
  'use strict';
  var $=function(id){ return global.OneToneDom.$(id); };
  var t=function(key){ return global.OneToneI18n.t(key); };

  var GLOBAL_SCHEME_ID='__global__';

  function state(){
    return global.OneToneState.state;
  }

  function ui(){
    return global.OneToneState.ui;
  }

  function esc(s){
    return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');
  }

  function hp(){
    return global.OneToneHabitProfile;
  }

  function core(){
    return global.OneToneMappingCore;
  }

  function habitName(m){
    if(hp()&&hp().habitDisplayName) return hp().habitDisplayName(m);
    return (m&&m.group)||(m&&m.label)||(m&&m.id)||'—';
  }

  function voiceSchemes(cfg){
    cfg=cfg||{};
    if(!hp()||!Array.isArray(cfg.mappings)) return [];
    return cfg.mappings.filter(function(m){
      if(!m||!m.id) return false;
      if(!hp().hasVoiceParts(m,cfg)) return false;
      if(hp().hasKeyParts(m)) return false;
      return true;
    }).sort(function(a,b){
      return (a.order||0)-(b.order||0);
    });
  }

  function editSchemeId(cfg,schemes){
    cfg=cfg||{};
    schemes=schemes||[];
    var editId=ui().voiceEditSchemeId;
    if(editId!=null&&String(editId).trim()){
      editId=String(editId).trim();
      if(schemes.some(function(m){ return m.id===editId; })) return editId;
    }
    if(editId===null&&schemes.length) return GLOBAL_SCHEME_ID;
    if(editId==null&&!schemes.length) return GLOBAL_SCHEME_ID;
    var sel=String(state().selectedMappingId||'').trim();
    if(sel&&schemes.some(function(m){ return m.id===sel; })) return sel;
    if(schemes.length) return schemes[0].id;
    return GLOBAL_SCHEME_ID;
  }

  function selectedSchemeId(cfg,schemes){
    return editSchemeId(cfg,schemes);
  }

  function activeRuntimeSchemeId(cfg,schemes){
    cfg=cfg||{};
    schemes=schemes||[];
    var active=String(cfg.activeSceneId||'').trim();
    if(active&&schemes.some(function(m){ return m.id===active; })) return active;
    return '';
  }

  function scheduleVoiceRender(){
    if(global.OneToneVoiceSettingsFlow&&global.OneToneVoiceSettingsFlow.scheduleVoiceSettingsRender){
      global.OneToneVoiceSettingsFlow.scheduleVoiceSettingsRender();
    }else{
      render();
    }
  }

  function selectVoiceRuntimeGlobal(){
    ui().voiceEditSchemeId=null;
    scheduleVoiceRender();
    render();
  }

  function selectVoiceSchemeForEdit(id){
    id=String(id||'').trim();
    if(!id||id===GLOBAL_SCHEME_ID){
      selectVoiceRuntimeGlobal();
      return;
    }
    ui().voiceEditSchemeId=id;
    state().selectedMappingId=id;
    scheduleVoiceRender();
    render();
    var tab=$('voiceWorkflowTab-'+id);
    if(tab&&tab.scrollIntoView) tab.scrollIntoView({behavior:'smooth',block:'nearest',inline:'nearest'});
  }

  function switchVoiceScheme(id,opts){
    opts=opts||{};
    var activate=opts.activate!==false;
    id=String(id||'').trim();
    if(!id||id===GLOBAL_SCHEME_ID){
      selectVoiceRuntimeGlobal();
      return;
    }
    ui().voiceEditSchemeId=id;
    state().selectedMappingId=id;
    if(!activate){
      scheduleVoiceRender();
      render();
      var editTab=$('voiceWorkflowTab-'+id);
      if(editTab&&editTab.scrollIntoView) editTab.scrollIntoView({behavior:'smooth',block:'nearest',inline:'nearest'});
      return;
    }
    var st=state();
    if(!st) return;
    if(st.config&&st.config.activeSceneId===id&&ui().voiceEditSchemeId===id) return;
    if(global.OneToneSceneActivate&&global.OneToneSceneActivate.activateScene){
      global.OneToneSceneActivate.activateScene(id);
    }
    if(st.config) st.config.activeSceneId=id;
    if(global.OneToneConfigPersist&&global.OneToneConfigPersist.save){
      global.OneToneConfigPersist.save();
    }
    if(global.OneToneSchemeSwitchFeedback&&global.OneToneSchemeSwitchFeedback.refreshVoiceAfterSceneSwitch){
      global.OneToneSchemeSwitchFeedback.refreshVoiceAfterSceneSwitch();
    }else{
      scheduleVoiceRender();
      render();
    }
    var tab=$('voiceWorkflowTab-'+id);
    if(tab&&tab.scrollIntoView) tab.scrollIntoView({behavior:'smooth',block:'nearest',inline:'nearest'});
  }

  function renderGlobalTab(isEditing,isRunning){
    var globalName=esc(t('voiceSchemeDefaultName').split('·')[0].trim());
    return '<button type="button" class="keys-workflow-tab voice-workflow-tab'+(isEditing?' is-active':'')+(isRunning?' is-voice-running':'')+'" role="tab" aria-selected="'+(isEditing?'true':'false')+'" id="voiceWorkflowTab-global" data-voice-scheme-id="'+GLOBAL_SCHEME_ID+'" title="'+esc(t('voiceSchemeRuntimeGlobalHint'))+'">'
      +'<span class="keys-workflow-tab-name">'+globalName+'</span>'
      +(isRunning?'<span class="voice-workflow-tab-running" aria-hidden="true">●</span>':'')
      +'</button>';
  }

  function renderTabs(vm){
    var tabs=$('voiceWorkflowTabs');
    var bar=$('voiceWorkflowTabsBar');
    var lbl=$('voiceWorkflowTabsLbl');
    var addBtn=$('btnVoiceSchemeAdd');
    if(lbl) lbl.textContent=t('voiceWorkflowTabsLbl');
    if(addBtn) addBtn.textContent=t('voiceSchemesAdd');
    if(!tabs) return;
    var cfg=state().config||{};
    var schemes=voiceSchemes(cfg);
    var editing=editSchemeId(cfg,schemes);
    var running=activeRuntimeSchemeId(cfg,schemes);
    if(bar) bar.hidden=false;
    if(!schemes.length){
      tabs.innerHTML=renderGlobalTab(editing===GLOBAL_SCHEME_ID,false);
      return;
    }
    var html=renderGlobalTab(editing===GLOBAL_SCHEME_ID,running==='');
    html+=schemes.map(function(m){
      var isEditing=m.id===editing;
      var isRunning=!!running&&m.id===running;
      var isDraft=core()&&core().isIncomplete&&core().isIncomplete(m);
      var draftBadge=core()&&core().isDraft&&core().isDraft(m)?t('homeLiveSchemeDraft'):t('keySchemeCompletenessIncomplete');
      return '<button type="button" class="keys-workflow-tab voice-workflow-tab'+(isEditing?' is-active':'')+(isRunning?' is-voice-running':'')+(isDraft?' is-draft':'')+'" role="tab" aria-selected="'+(isEditing?'true':'false')+'" id="voiceWorkflowTab-'+esc(m.id)+'" data-voice-scheme-id="'+esc(m.id)+'">'
        +'<span class="keys-workflow-tab-name">'+esc(habitName(m))+'</span>'
        +(isRunning?'<span class="voice-workflow-tab-running" aria-hidden="true">●</span>':'')
        +(isDraft?'<span class="keys-workflow-tab-draft">'+esc(draftBadge)+'</span>':'')
        +'</button>';
    }).join('');
    tabs.innerHTML=html;
  }

  function voiceSchemeSummaryLine(m,cfg){
    cfg=cfg||state().config||{};
    var ov=m&&m.voiceOverride?m.voiceOverride:{};
    var wake=Array.isArray(ov.wakePhrases)&&ov.wakePhrases.length?ov.wakePhrases[0]:'';
    if(!wake&&global.OneToneSceneConfig&&global.OneToneSceneConfig.mergeWakePhrases){
      var merged=global.OneToneSceneConfig.mergeWakePhrases(cfg,m,ov);
      wake=merged&&merged.length?merged[0]:'';
    }
    var engine=ov.engine?String(ov.engine):'';
    var engineLbl=engine==='vosk'?t('voiceModeProEngine'):(engine==='sapi'?t('voiceModeLiteEngine'):t('voiceModeCurrentOff'));
    if(wake) return wake+' · '+engineLbl;
    return engineLbl;
  }

  function voiceSchemeStatusTag(m,editing,running){
    if(m&&m.id===running) return {cls:'is-active',key:'voiceHubStatusRunning'};
    if(m&&m.id===editing) return {cls:'is-saved',key:'keysWorkflowEditing'};
    var ov=m&&m.voiceOverride;
    if(ov&&ov.engine==='off') return {cls:'is-incomplete',key:'keySchemeCompletenessIncomplete'};
    return {cls:'is-saved',key:'voiceHubStatusSaved'};
  }

  function renderVoiceHubRuntimeRow(editing,running){
    var globalName=t('voiceSchemeDefaultName').split('·')[0].trim();
    var isEditing=editing===GLOBAL_SCHEME_ID;
    var isRunning=!running;
    var tag=isRunning?{cls:'is-active',key:'voiceHubStatusRunning'}:{cls:'is-incomplete',key:'voiceHubStatusRuntime'};
    return '<div class="keys-hub-scheme-row voice-hub-scheme-row'+(isEditing?' is-editing':'')+'" role="listitem" data-voice-edit-global="1">'
      +'<button type="button" class="keys-hub-scheme-main" data-voice-edit-global="1" aria-current="'+(isEditing?'true':'false')+'">'
      +'<span class="keys-hub-scheme-copy">'
      +'<span class="keys-hub-scheme-name">'+esc(globalName)+'</span>'
      +'<span class="keys-hub-scheme-pair">'+esc(t('voiceHubRuntimeRowDesc'))+'</span>'
      +'</span>'
      +'<span class="keys-hub-scheme-tag '+esc(tag.cls)+'">'+esc(t(tag.key))+'</span>'
      +'</button>'
      +'<div class="keys-hub-scheme-actions">'
      +(isEditing?'<span class="keys-hub-scheme-editing">'+esc(t('keysWorkflowEditing'))+'</span>':'')
      +'</div></div>';
  }

  function renderVoiceHubSchemeRow(m,editing,running){
    var isEditing=m.id===editing;
    var tag=voiceSchemeStatusTag(m,editing,running);
    var summary=voiceSchemeSummaryLine(m);
    var isRunning=!!running&&m.id===running;
    return '<div class="keys-hub-scheme-row voice-hub-scheme-row'+(isEditing?' is-editing':'')+(isRunning?' is-voice-running':'')+'" role="listitem" data-scheme-id="'+esc(m.id)+'">'
      +'<button type="button" class="keys-hub-scheme-main" data-voice-scheme-select="'+esc(m.id)+'" aria-current="'+(isEditing?'true':'false')+'">'
      +'<span class="keys-hub-scheme-copy">'
      +'<span class="keys-hub-scheme-name">'+esc(habitName(m))+'</span>'
      +(summary?'<span class="keys-hub-scheme-pair">'+esc(summary)+'</span>':'')
      +'</span>'
      +'<span class="keys-hub-scheme-tag '+esc(tag.cls)+'">'+esc(t(tag.key))+'</span>'
      +'</button>'
      +'<div class="keys-hub-scheme-actions">'
      +(isEditing?'<span class="keys-hub-scheme-editing">'+esc(t('keysWorkflowEditing'))+'</span>':'')
      +(!isRunning?'<button type="button" class="keys-hub-scheme-activate" data-voice-scheme-activate="'+esc(m.id)+'">'+esc(t('voiceHubActivate'))+'</button>':'')
      +'<button type="button" class="keys-hub-scheme-rename" data-voice-scheme-rename="'+esc(m.id)+'" aria-label="'+esc(t('habitHubActRename'))+'" title="'+esc(t('habitHubActRename'))+'">✎</button>'
      +'<button type="button" class="keys-hub-scheme-delete" data-voice-scheme-delete="'+esc(m.id)+'" aria-label="'+esc(t('habitHubActDelete'))+'" title="'+esc(t('habitHubActDelete'))+'">×</button>'
      +'</div></div>';
  }

  function renderVoiceHub(){
    var schemeList=$('voiceHubSchemeList');
    var countEl=$('voiceHubCount');
    var titleLbl=$('voiceHubTitleLbl');
    var hintEl=$('voiceHubEditHint');
    var addBtn=$('btnVoiceHubAddDraft');
    if(titleLbl) titleLbl.textContent=t('voiceHubCardTitle');
    if(hintEl) hintEl.textContent=t('voiceHubEditHint');
    if(addBtn) addBtn.textContent='+ '+t('voiceHubAddDraft');
    if(!schemeList) return;
    var cfg=state().config||{};
    var schemes=voiceSchemes(cfg);
    var editing=editSchemeId(cfg,schemes);
    var running=activeRuntimeSchemeId(cfg,schemes);
    if(countEl) countEl.textContent=String(schemes.length);
    var html=renderVoiceHubRuntimeRow(editing,running);
    if(!schemes.length){
      schemeList.innerHTML=html;
    }else{
      var sorted=schemes.slice().sort(function(a,b){
        if(a.id===editing) return -1;
        if(b.id===editing) return 1;
        if(a.id===running) return -1;
        if(b.id===running) return 1;
        return (a.order||0)-(b.order||0);
      });
      html+=sorted.map(function(m){ return renderVoiceHubSchemeRow(m,editing,running); }).join('');
      schemeList.innerHTML=html;
    }
    renderVoiceHubTemplates();
  }

  function renderVoiceHubTemplates(){
    var tplList=$('voiceHubTemplateList');
    var tplLbl=$('voiceHubTemplatesLbl');
    var tplCountEl=$('voiceHubTemplatesCount');
    var tplHint=$('voiceHubTemplatesHint');
    var tplFillWrap=$('voiceHubTemplatesFillWrap');
    var tplFillList=$('voiceHubTemplatesFillList');
    var tplFillLbl=$('voiceHubTemplatesFillLbl');
    var tplApi=global.OneToneVoiceWorkflowTemplates;
    if(tplLbl) tplLbl.textContent=t('voiceHubTemplatesLbl');
    if(tplHint) tplHint.textContent=t('voiceHubTemplatesHint');
    if(tplFillLbl) tplFillLbl.textContent=t('keysTemplateFillLbl');
    if(!tplList||!tplApi||!tplApi.list) return;
    var templates=tplApi.list();
    var canFill=!!(global.OneToneVoiceSchemePersist&&global.OneToneVoiceSchemePersist.resolveVoiceEditMapping&&global.OneToneVoiceSchemePersist.resolveVoiceEditMapping());
    if(tplCountEl) tplCountEl.textContent=String(templates.length);
    if(tplFillWrap) tplFillWrap.hidden=!canFill;
    tplList.innerHTML=templates.map(function(tpl){
      var summary=tplApi.compactSummary?tplApi.compactSummary(tpl):'';
      var title=esc(t(tpl.nameKey))+(summary?' — '+esc(summary):'');
      return '<button type="button" class="keys-hub-template-chip" data-voice-new-template="'+esc(tpl.id)+'" title="'+title+'">'
        +esc(t(tpl.nameKey))+'</button>';
    }).join('');
    if(tplFillList){
      tplFillList.innerHTML=canFill?templates.map(function(tpl){
        return '<button type="button" class="keys-hub-template-fill-chip" data-voice-apply-template="'+esc(tpl.id)+'" title="'+esc(t(tpl.nameKey))+'">'
          +esc(t(tpl.nameKey))+'</button>';
      }).join(''):'';
    }
  }

  function renameVoiceScheme(id){
    id=String(id||'').trim();
    if(!id||!core()||!core().byId) return;
    var m=core().byId(id);
    if(!m) return;
    var next=prompt(t('habitHubRenamePrompt'),habitName(m));
    if(next===null) return;
    next=String(next||'').trim();
    if(!next) return;
    m.group=next;
    if(global.OneToneHabitHub&&global.OneToneHabitHub.touchUpdated) global.OneToneHabitHub.touchUpdated(m);
    else m.updatedAt=Date.now();
    if(global.OneToneConfigPersist&&global.OneToneConfigPersist.save) global.OneToneConfigPersist.save();
    if(global.OneToneVoiceSchemePersist&&global.OneToneVoiceSchemePersist.refreshVoiceSchemeSurfaces){
      global.OneToneVoiceSchemePersist.refreshVoiceSchemeSurfaces();
    }else render();
  }

  function bindHub(){
    var hub=$('voiceHubCard');
    if(!hub||hub.dataset.voiceHubBound==='1') return;
    hub.dataset.voiceHubBound='1';
    hub.addEventListener('click',function(e){
      var globalBtn=e.target.closest&&e.target.closest('[data-voice-edit-global]');
      if(globalBtn){
        e.preventDefault();
        selectVoiceRuntimeGlobal();
        return;
      }
      var selectBtn=e.target.closest&&e.target.closest('[data-voice-scheme-select]');
      if(selectBtn){
        e.preventDefault();
        selectVoiceSchemeForEdit(selectBtn.getAttribute('data-voice-scheme-select')||'');
        return;
      }
      var activateBtn=e.target.closest&&e.target.closest('[data-voice-scheme-activate]');
      if(activateBtn){
        e.preventDefault();
        e.stopPropagation();
        switchVoiceScheme(activateBtn.getAttribute('data-voice-scheme-activate')||'',{activate:true});
        return;
      }
      var renameBtn=e.target.closest&&e.target.closest('[data-voice-scheme-rename]');
      if(renameBtn){
        e.preventDefault();
        e.stopPropagation();
        renameVoiceScheme(renameBtn.getAttribute('data-voice-scheme-rename')||'');
        return;
      }
      var delBtn=e.target.closest&&e.target.closest('[data-voice-scheme-delete]');
      if(delBtn){
        e.preventDefault();
        e.stopPropagation();
        if(global.OneToneMappingTrashMenu) global.OneToneMappingTrashMenu.deleteFromMenu(delBtn.getAttribute('data-voice-scheme-delete')||'');
        if(global.OneToneVoiceSchemePersist&&global.OneToneVoiceSchemePersist.refreshVoiceSchemeSurfaces){
          global.OneToneVoiceSchemePersist.refreshVoiceSchemeSurfaces();
        }
        return;
      }
      var newTpl=e.target.closest&&e.target.closest('[data-voice-new-template]');
      if(newTpl){
        e.preventDefault();
        var tplApi=global.OneToneVoiceWorkflowTemplates;
        if(tplApi&&tplApi.applyTemplateNew) tplApi.applyTemplateNew(newTpl.getAttribute('data-voice-new-template')||'');
        return;
      }
      var fillTpl=e.target.closest&&e.target.closest('[data-voice-apply-template]');
      if(fillTpl){
        e.preventDefault();
        var tplApply=global.OneToneVoiceWorkflowTemplates;
        if(tplApply&&tplApply.applyTemplate) tplApply.applyTemplate(fillTpl.getAttribute('data-voice-apply-template')||'');
        return;
      }
      var addDraft=e.target.closest&&e.target.closest('#btnVoiceHubAddDraft');
      if(addDraft){
        e.preventDefault();
        var m=global.OneToneVoiceSchemePersist&&global.OneToneVoiceSchemePersist.createVoiceDraft
          ?global.OneToneVoiceSchemePersist.createVoiceDraft()
          :null;
        if(m&&m.id) selectVoiceSchemeForEdit(m.id);
      }
    });
  }

  function bind(){
    var bar=$('voiceWorkflowTabsBar');
    if(!bar||bar.dataset.voiceSchemesBound==='1') return;
    bar.dataset.voiceSchemesBound='1';
    bar.addEventListener('click',function(e){
      var tab=e.target.closest&&e.target.closest('[data-voice-scheme-id]');
      if(tab){
        e.preventDefault();
        switchVoiceScheme(tab.getAttribute('data-voice-scheme-id'),{activate:true});
        return;
      }
      var add=e.target.closest&&e.target.closest('#btnVoiceSchemeAdd');
      if(add){
        e.preventDefault();
        var m=global.OneToneVoiceSchemePersist&&global.OneToneVoiceSchemePersist.createVoiceDraft
          ?global.OneToneVoiceSchemePersist.createVoiceDraft()
          :null;
        if(m&&m.id) selectVoiceSchemeForEdit(m.id);
      }
    });
    var tabs=$('voiceWorkflowTabs');
    if(tabs){
      tabs.addEventListener('keydown',function(e){
        if(e.key!=='ArrowLeft'&&e.key!=='ArrowRight'&&e.key!=='Home'&&e.key!=='End') return;
        var tabBtns=Array.prototype.slice.call(tabs.querySelectorAll('[role="tab"]'));
        if(!tabBtns.length) return;
        var idx=tabBtns.findIndex(function(btn){ return btn.getAttribute('aria-selected')==='true'; });
        if(idx<0) idx=0;
        if(e.key==='Home') idx=0;
        else if(e.key==='End') idx=tabBtns.length-1;
        else if(e.key==='ArrowRight') idx=Math.min(tabBtns.length-1,idx+1);
        else if(e.key==='ArrowLeft') idx=Math.max(0,idx-1);
        e.preventDefault();
        var next=tabBtns[idx];
        if(next) switchVoiceScheme(next.getAttribute('data-voice-scheme-id')||'',{activate:true});
      });
    }
  }

  function render(vm){
    renderTabs(vm);
    renderVoiceHub();
  }

  bind();
  bindHub();

  global.OneToneVoiceSchemesUi={
    render:render,
    voiceSchemes:voiceSchemes,
    editSchemeId:editSchemeId,
    selectedSchemeId:selectedSchemeId,
    activeRuntimeSchemeId:activeRuntimeSchemeId,
    selectVoiceSchemeForEdit:selectVoiceSchemeForEdit,
    selectVoiceRuntimeGlobal:selectVoiceRuntimeGlobal,
    switchVoiceScheme:switchVoiceScheme,
    renameVoiceScheme:renameVoiceScheme,
    renderVoiceHub:renderVoiceHub,
    GLOBAL_SCHEME_ID:GLOBAL_SCHEME_ID
  };
})((typeof window!=='undefined')?window:globalThis);
