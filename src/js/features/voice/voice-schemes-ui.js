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

  /** UI sentinel only — maps to selectedMappingId=null + configuring global voice base. */
  function isGlobalVoiceSentinel(id){
    return id===GLOBAL_SCHEME_ID;
  }

  /**
   * Voice edit selection proxies selectedMappingId.
   * GLOBAL_SCHEME_ID = page-local「配全局语音底座」, not a third selectedMappingId value.
   */
  function editSchemeId(cfg,schemes){
    cfg=cfg||{};
    schemes=schemes||[];
    var sentinel=ui().voiceEditSchemeId;
    if(isGlobalVoiceSentinel(sentinel)) return GLOBAL_SCHEME_ID;
    var sel=String(state().selectedMappingId||'').trim();
    if(sel&&schemes.some(function(m){ return m.id===sel; })) return sel;
    // Legacy proxy: voiceEditSchemeId still holds a mapping id until cleared.
    if(sentinel!=null&&String(sentinel).trim()){
      var legacy=String(sentinel).trim();
      if(schemes.some(function(m){ return m.id===legacy; })){
        state().selectedMappingId=legacy;
        return legacy;
      }
    }
    if(sentinel===null) return GLOBAL_SCHEME_ID;
    return GLOBAL_SCHEME_ID;
  }

  function setVoiceEditSelection(id){
    id=id==null?'':String(id).trim();
    if(!id||isGlobalVoiceSentinel(id)){
      ui().voiceEditSchemeId=GLOBAL_SCHEME_ID;
      state().selectedMappingId=null;
      return;
    }
    ui().voiceEditSchemeId=id;
    state().selectedMappingId=id;
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
    leaveVoiceSchemeThen(function(){
      setVoiceEditSelection(GLOBAL_SCHEME_ID);
      scheduleVoiceRender();
      render();
    });
  }

  function activateSchemeEditing(id){
    id=String(id||'').trim();
    if(!id||id===GLOBAL_SCHEME_ID){
      selectVoiceRuntimeGlobal();
      return;
    }
    leaveVoiceSchemeThen(function(){
      setVoiceEditSelection(id);
      if(global.OneToneVoiceSchemeContext&&global.OneToneVoiceSchemeContext.activateEditingScheme){
        global.OneToneVoiceSchemeContext.activateEditingScheme();
      }
      scheduleVoiceRender();
      render();
      var tab=$('voiceWorkflowTab-'+id);
      if(tab&&tab.scrollIntoView) tab.scrollIntoView({behavior:'smooth',block:'nearest',inline:'nearest'});
    },id);
  }

  function selectVoiceSchemeForEdit(id){
    activateSchemeEditing(id);
  }

  function currentVoiceEditMapping(cfg,schemes){
    cfg=cfg||state().config||{};
    schemes=schemes||voiceSchemes(cfg);
    var cur=editSchemeId(cfg,schemes);
    if(!cur||cur===GLOBAL_SCHEME_ID) return null;
    for(var i=0;i<schemes.length;i++){
      if(schemes[i]&&schemes[i].id===cur) return schemes[i];
    }
    return null;
  }

  function voiceSchemeNeedsLeaveConfirm(nextId){
    var cfg=state().config||{};
    var schemes=voiceSchemes(cfg);
    var cur=editSchemeId(cfg,schemes);
    nextId=nextId==null?null:String(nextId);
    if(nextId!=null&&String(cur)===nextId) return false;
    var m=currentVoiceEditMapping(cfg,schemes);
    if(!m||!core()) return false;
    if(core().isDraft&&core().isDraft(m)) return true;
    if(core().isIncomplete&&core().isIncomplete(m)) return true;
    return false;
  }

  function leaveVoiceSchemeThen(fn,nextId){
    if(typeof fn!=='function') return;
    if(!voiceSchemeNeedsLeaveConfirm(nextId)){
      fn();
      return;
    }
    var confirmApi=global.OneToneConfirm;
    if(confirmApi&&confirmApi.ask){
      confirmApi.ask('voiceUnsavedSwitchPrompt',{
        fallback:'当前语音方案尚未完成，放弃并切换？'
      }).then(function(ok){ if(ok) fn(); });
      return;
    }
    if(!window.confirm(t('voiceUnsavedSwitchPrompt')||'当前语音方案尚未完成，放弃并切换？')) return;
    fn();
  }

  /** Tab / arrow: edit only — never activate. */
  function editVoiceScheme(id){
    id=String(id||'').trim();
    if(!id||id===GLOBAL_SCHEME_ID){
      selectVoiceRuntimeGlobal();
      return;
    }
    leaveVoiceSchemeThen(function(){
      setVoiceEditSelection(id);
      if(global.OneToneVoiceSchemeContext&&global.OneToneVoiceSchemeContext.activateEditingScheme){
        global.OneToneVoiceSchemeContext.activateEditingScheme();
      }
      scheduleVoiceRender();
      render();
      var tabEdit=$('voiceWorkflowTab-'+id);
      if(tabEdit&&tabEdit.scrollIntoView) tabEdit.scrollIntoView({behavior:'smooth',block:'nearest',inline:'nearest'});
      if(global.OneToneHabitChannelStatusStrip&&global.OneToneHabitChannelStatusStrip.render){
        try{ global.OneToneHabitChannelStatusStrip.render(); }catch(_){}
      }
    },id);
  }

  /** Set as in-use only — no leave confirm, no selectedMappingId change. */
  function setVoiceInUse(id){
    id=String(id||'').trim();
    if(!id||id===GLOBAL_SCHEME_ID) return;
    var st=state();
    if(!st||!st.config) return;
    if(String(st.config.activeSceneId||'')===id){
      if(global.OneToneHabitChannelStatusStrip&&global.OneToneHabitChannelStatusStrip.render){
        try{ global.OneToneHabitChannelStatusStrip.render(); }catch(_){}
      }
      return;
    }
    if(global.OneToneSceneActivate&&global.OneToneSceneActivate.activateScene){
      global.OneToneSceneActivate.activateScene(id);
    }
    st.config.activeSceneId=id;
    if(global.OneToneConfigPersist&&global.OneToneConfigPersist.save){
      global.OneToneConfigPersist.save({source:'voice'});
    }
    if(global.OneToneSchemeSwitchFeedback&&global.OneToneSchemeSwitchFeedback.refreshVoiceAfterSceneSwitch){
      global.OneToneSchemeSwitchFeedback.refreshVoiceAfterSceneSwitch();
    }else{
      scheduleVoiceRender();
      render();
    }
    if(global.OneToneHabitChannelStatusStrip&&global.OneToneHabitChannelStatusStrip.render){
      try{ global.OneToneHabitChannelStatusStrip.render(); }catch(_){}
    }
  }

  /** @deprecated use editVoiceScheme / setVoiceInUse */
  function switchVoiceScheme(id,opts){
    opts=opts||{};
    if(opts.activate===false) editVoiceScheme(id);
    else setVoiceInUse(id);
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
    var engineLbl;
    if(!engine||engine==='off'){
      engineLbl=t('voiceListeningStrategyOff');
    }else if(engine==='vosk'){
      engineLbl=t('voiceRecognizeSourceVosk');
    }else if(engine==='kws'){
      engineLbl=t('voiceRecognizeSourceKws');
    }else if(engine==='sapi'){
      engineLbl=t('voiceRecognizeSourceSapi');
    }else{
      engineLbl=engine;
    }
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
    if(global.OneToneConfigPersist&&global.OneToneConfigPersist.save) global.OneToneConfigPersist.save({source:'voice'});
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
        setVoiceInUse(activateBtn.getAttribute('data-voice-scheme-activate')||'');
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
          ?global.OneToneVoiceSchemePersist.createVoiceDraft({persist:false,skipRefresh:true})
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
        editVoiceScheme(tab.getAttribute('data-voice-scheme-id'));
        return;
      }
      var add=e.target.closest&&e.target.closest('#btnVoiceSchemeAdd');
      if(add){
        e.preventDefault();
        var m=global.OneToneVoiceSchemePersist&&global.OneToneVoiceSchemePersist.createVoiceDraft
          ?global.OneToneVoiceSchemePersist.createVoiceDraft({persist:false,skipRefresh:true})
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
        if(next) editVoiceScheme(next.getAttribute('data-voice-scheme-id')||'');
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
    editVoiceScheme:editVoiceScheme,
    setVoiceInUse:setVoiceInUse,
    switchVoiceScheme:switchVoiceScheme,
    renameVoiceScheme:renameVoiceScheme,
    renderVoiceHub:renderVoiceHub,
    GLOBAL_SCHEME_ID:GLOBAL_SCHEME_ID
  };
})((typeof window!=='undefined')?window:globalThis);
