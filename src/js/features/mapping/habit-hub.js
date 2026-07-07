(function(global){
  'use strict';

  var $=function(id){ return global.OneToneDom.$(id); };
  var t=function(key){ return global.OneToneI18n.t(key); };
  function state(){ return global.OneToneState.state; }
  function ui(){ return global.OneToneState.ui; }
  function core(){ return global.OneToneMappingCore; }
  function flow(){ return global.OneToneSceneFlowSummary; }

  var TYPE_ORDER={combo:0,app:1,voice:2,keys:3};
  var TYPE_ICON={
    keys:'<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M8 14h8"/></svg>',
    voice:'<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v1a7 7 0 0 1-14 0v-1"/><line x1="12" y1="19" x2="12" y2="22"/></svg>',
    app:'<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>',
    combo:'<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M16 3h5v5"/><path d="M8 3H3v5"/><path d="M12 22v-8.3a4 4 0 0 0-1.172-2.828L4 7"/></svg>'
  };

  function esc(s){
    return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');
  }

  function hooks(){
    return global.__vp_mapping_list_ui_hooks__||global.__vp_mapping_trash_menu_hooks__||{};
  }

  function habitName(m){
    if(!m) return '—';
    if((m.group||'').trim()) return m.group.trim();
    if(global.OneToneHomeScheme&&global.OneToneHomeScheme.shortName) return global.OneToneHomeScheme.shortName(m);
    if((m.label||'').trim()) return m.label.trim();
    return m.id||'—';
  }

  function hasKeyParts(m){
    if(!m||!core()) return false;
    var trig=core().editorTrigger?core().editorTrigger(m):String(m.triggerKey||'').trim();
    var tgt=core().editorTarget?core().editorTarget(m):String(m.targetKey||'').trim();
    return !!(trig||tgt);
  }

  function hasVoiceParts(m,cfg){
    if(!m) return false;
    // Re-entrancy guard: Habit Hub rendering can be re-triggered during config/UI updates.
    // If that happens, prevent infinite recursion (Maximum call stack size exceeded).
    if(!hasVoiceParts._guard) hasVoiceParts._guard=new Set();
    var gid=String(m.id||'');
    if(gid && hasVoiceParts._guard.has(gid)) return false;
    if(gid) hasVoiceParts._guard.add(gid);
    try{
    var ov=m.voiceOverride;
    if(ov){
      if(Array.isArray(ov.wakePhrases)&&ov.wakePhrases.length) return true;
      if(ov.endPhrases&&(ov.endPhrases.zh&&ov.endPhrases.zh.length||ov.endPhrases.en&&ov.endPhrases.en.length)) return true;
      if(ov.targetKey&&String(ov.targetKey).trim()) return true;
    }
    if(!cfg||!global.OneToneSceneConfig) return false;
    var eff=global.OneToneSceneConfig.resolveEffectiveScene(cfg,{activeSceneId:m.id});
    if(!eff) return false;
    var globalWake=global.OneToneSceneConfig.globalWakePhrases(cfg);
    var globalEnd=global.OneToneSceneConfig.globalEndPhrases(cfg);
    var wakeDiff=JSON.stringify(eff.wakePhrases||[])!==JSON.stringify(globalWake||[]);
    var endDiff=JSON.stringify(eff.endPhrases||{})!==JSON.stringify(globalEnd||{});
    return wakeDiff||endDiff;
    }finally{
      if(gid) hasVoiceParts._guard.delete(gid);
    }
  }

  function configuredAppIds(m){
    var ids=[];
    if(!m) return ids;
    if(Array.isArray(m.appBehaviorRules)){
      m.appBehaviorRules.forEach(function(r){
        if(r&&r.appId&&ids.indexOf(r.appId)<0) ids.push(r.appId);
      });
    }
    if(m.appTargetId&&ids.indexOf(m.appTargetId)<0) ids.push(String(m.appTargetId));
    return ids;
  }

  function hasAppParts(m){
    return configuredAppIds(m).length>0;
  }

  function classifyHabit(m,cfg){
    var key=hasKeyParts(m);
    var voice=hasVoiceParts(m,cfg);
    var app=hasAppParts(m);
    var n=(key?1:0)+(voice?1:0)+(app?1:0);
    if(n>=2) return 'combo';
    if(app) return 'app';
    if(voice) return 'voice';
    return 'keys';
  }

  function typeLabel(type){
    if(type==='voice') return t('habitHubTypeVoice');
    if(type==='app') return t('habitHubTypeApp');
    if(type==='combo') return t('habitHubTypeCombo');
    return t('habitHubTypeKeys');
  }

  function appDisplayName(appId){
    if(global.OneToneAppBehaviorRules&&global.OneToneAppBehaviorRules.appDisplayName){
      return global.OneToneAppBehaviorRules.appDisplayName(appId);
    }
    return appId||'—';
  }

  function habitDescription(m,type,cfg){
    if(type==='app'){
      var apps=configuredAppIds(m).map(appDisplayName);
      if(apps.length) return t('habitHubDescAppPrefix')+' · '+apps.join(' / ');
      return t('habitHubDescApp');
    }
    if(type==='voice'){
      var eff=cfg&&global.OneToneSceneConfig?global.OneToneSceneConfig.resolveEffectiveScene(cfg,{activeSceneId:m.id}):null;
      var end=eff&&eff.endPhrases&&eff.endPhrases.zh&&eff.endPhrases.zh[0];
      var fin=flow&&flow.finishBehaviorTextSettings?flow.finishBehaviorTextSettings(m).text:'';
      var parts=[];
      if(end) parts.push(t('habitHubDescEndPhrase')+' · '+end);
      if(fin) parts.push(fin);
      return parts.length?parts.join(' + '):t('habitHubDescVoice');
    }
    if(type==='combo'){
      var bits=[];
      if(hasKeyParts(m)) bits.push(t('habitHubDescKeysShort'));
      if(hasAppParts(m)) bits.push(t('habitHubDescAppShort'));
      if(hasVoiceParts(m,cfg)) bits.push(t('habitHubDescVoiceShort'));
      return bits.join(' + ');
    }
    return t('habitHubDescKeys');
  }

  function formatRelativeTime(ts){
    if(!ts) return '';
    var diff=Date.now()-Number(ts);
    if(diff<60000) return t('habitHubUpdatedJustNow');
    if(diff<3600000) return t('habitHubUpdatedMinutes').replace('{n}',String(Math.floor(diff/60000)));
    if(diff<86400000) return t('habitHubUpdatedHours').replace('{n}',String(Math.floor(diff/3600000)));
    var d=new Date(ts);
    var today=new Date();
    if(d.toDateString()===today.toDateString()) return t('habitHubUpdatedToday').replace('{time}',pad2(d.getHours())+':'+pad2(d.getMinutes()));
    return (d.getMonth()+1)+'/'+d.getDate()+' '+pad2(d.getHours())+':'+pad2(d.getMinutes());
  }

  function pad2(n){ return n<10?'0'+n:String(n); }

  function habitMetaLine(m){
    var parts=[];
    var ts=m.updatedAt||m.lastUsedAt;
    if(ts) parts.push(formatRelativeTime(ts)+(m.updatedAt?t('habitHubUpdatedSuffix'):''));
    if(m.useCount>0) parts.push(t('habitHubUseCount').replace('{n}',String(m.useCount)));
    if(!parts.length&&m.enabled) parts.push(t('habitHubMetaEnabled'));
    return parts.join(' · ');
  }

  function collectHabits(){
    if(!core()) return [];
    core().ensureConfig&&core().ensureConfig();
    var cfg=state().config||{};
    var items=[];
    core().sorted().forEach(function(m){
      if(!core().isSaved(m)) return;
      var type=classifyHabit(m,cfg);
      items.push({mapping:m,type:type});
    });
    return items;
  }

  function filterItems(items){
    var f=ui().habitHubFilter||'all';
    if(f==='all') return items;
    if(f==='recent'){
      var week=Date.now()-7*86400000;
      return items.filter(function(it){
        var m=it.mapping;
        return (m.lastUsedAt&&m.lastUsedAt>=week)||(state().config&&state().config.activeSceneId===m.id);
      });
    }
    if(f==='keys') return items.filter(function(it){ return it.type==='keys'||it.type==='combo'; });
    if(f==='voice') return items.filter(function(it){ return it.type==='voice'||it.type==='combo'; });
    if(f==='app') return items.filter(function(it){ return it.type==='app'||it.type==='combo'; });
    return items;
  }

  function sortItems(items){
    var sort=ui().habitHubSort||'recent';
    var cfg=state().config||{};
    var activeId=cfg.activeSceneId;
    var out=items.slice();
    if(sort==='name'){
      out.sort(function(a,b){ return habitName(a.mapping).localeCompare(habitName(b.mapping),'zh'); });
      return out;
    }
    if(sort==='type'){
      out.sort(function(a,b){
        var d=TYPE_ORDER[a.type]-TYPE_ORDER[b.type];
        if(d) return d;
        return habitName(a.mapping).localeCompare(habitName(b.mapping),'zh');
      });
      return out;
    }
    out.sort(function(a,b){
      var am=a.mapping,bm=b.mapping;
      if(activeId){
        if(am.id===activeId) return -1;
        if(bm.id===activeId) return 1;
      }
      var au=am.lastUsedAt||am.updatedAt||0;
      var bu=bm.lastUsedAt||bm.updatedAt||0;
      if(bu!==au) return bu-au;
      return (bm.order||0)-(am.order||0);
    });
    return out;
  }

  function applyViewMode(){
    var list=$('habitHubList');
    if(!list) return;
    var mode=ui().habitHubViewMode||'list';
    list.classList.toggle('is-list',mode==='list');
    list.classList.toggle('is-grid',mode==='grid');
    document.querySelectorAll('[data-habit-view]').forEach(function(btn){
      var on=btn.dataset.habitView===mode;
      btn.classList.toggle('is-active',on);
      btn.setAttribute('aria-pressed',on?'true':'false');
    });
  }

  function renderCard(it){
    var m=it.mapping;
    var type=it.type;
    var cfg=state().config||{};
    var activeId=cfg.activeSceneId;
    var isActive=activeId&&m.id===activeId;
    var html='<article class="habit-hub-card habit-hub-card--'+esc(type)+(isActive?' is-active-scene':'')+'" data-habit-card="'+esc(m.id)+'" role="listitem">';
    html+='<button type="button" class="habit-hub-card-open" data-habit-open="'+esc(m.id)+'">';
    html+='<span class="habit-hub-card-icon habit-hub-card-icon--'+esc(type)+'">'+TYPE_ICON[type]+'</span>';
    html+='<span class="habit-hub-card-body">';
    html+='<span class="habit-hub-card-title-row">';
    html+='<span class="habit-hub-card-name">'+esc(habitName(m))+'</span>';
    html+='<span class="habit-hub-card-type">'+esc(typeLabel(type))+'</span>';
    if(isActive) html+='<span class="habit-hub-card-active">'+esc(t('habitHubActiveBadge'))+'</span>';
    html+='</span>';
    html+='<span class="habit-hub-card-desc">'+esc(habitDescription(m,type,cfg))+'</span>';
    var meta=habitMetaLine(m);
    if(meta) html+='<span class="habit-hub-card-meta">'+esc(meta)+'</span>';
    html+='</span></button>';
    html+='<div class="habit-hub-card-actions">';
    html+='<button type="button" class="habit-hub-act is-primary" data-habit-switch="'+esc(m.id)+'">'+esc(t('habitHubActSwitch'))+'</button>';
    html+='<button type="button" class="habit-hub-act" data-habit-dup="'+esc(m.id)+'">'+esc(t('habitHubActCopy'))+'</button>';
    html+='<button type="button" class="habit-hub-act" data-habit-rename="'+esc(m.id)+'">'+esc(t('habitHubActRename'))+'</button>';
    html+='<button type="button" class="habit-hub-act is-danger" data-habit-del="'+esc(m.id)+'">'+esc(t('habitHubActDelete'))+'</button>';
    html+='<button type="button" class="habit-hub-act-menu" data-habit-menu="'+esc(m.id)+'" aria-label="'+esc(t('habitHubActMore'))+'">⋯</button>';
    html+='</div></article>';
    return html;
  }

  function renderLabels(){
    var map={
      settingsPanelHabitsDesc:'settingsPanelHabitsDesc',
      habitHubAutoHint:'habitHubAutoHint',
      btnHabitHubNew:'habitHubNew',
      habitHubFilterAll:'habitHubFilterAll',
      habitHubFilterRecent:'habitHubFilterRecent',
      habitHubFilterKeys:'habitHubFilterKeys',
      habitHubFilterVoice:'habitHubFilterVoice',
      habitHubFilterApp:'habitHubFilterApp',
      habitHubSortLabel:'habitHubSortLabel',
      habitHubSortRecent:'habitHubSortRecent',
      habitHubSortName:'habitHubSortName',
      habitHubSortType:'habitHubSortType',
      habitHubEmptyTitle:'habitHubEmptyTitle',
      habitHubEmptyDesc:'habitHubEmptyDesc',
      btnHabitHubEmptyNew:'habitHubNew',
      habitHubAsideDiagramLbl:'habitHubAsideDiagramLbl',
      habitHubAsideTitle:'habitHubAsideTitle',
      habitHubAsideItem1:'habitHubAsideItem1',
      habitHubAsideItem2:'habitHubAsideItem2',
      habitHubAsideItem3:'habitHubAsideItem3',
      habitHubAsideTip:'habitHubAsideTip',
      btnHabitHubHelp:'habitHubHelp',
      btnHabitHubBackLabel:'habitHubBack'
    };
    Object.keys(map).forEach(function(id){
      var el=$(id);
      if(el) el.textContent=t(map[id]);
    });
    var sort=$('habitHubSort');
    if(sort){
      var opts=sort.querySelectorAll('option');
      if(opts[0]) opts[0].textContent=t('habitHubSortRecent');
      if(opts[1]) opts[1].textContent=t('habitHubSortName');
      if(opts[2]) opts[2].textContent=t('habitHubSortType');
    }
    document.querySelectorAll('[data-habit-filter]').forEach(function(btn){
      var key='habitHubFilter'+btn.dataset.habitFilter.charAt(0).toUpperCase()+btn.dataset.habitFilter.slice(1);
      if(key==='habitHubFilterAll') btn.textContent=t('habitHubFilterAll');
      else if(key==='habitHubFilterRecent') btn.textContent=t('habitHubFilterRecent');
      else if(key==='habitHubFilterKeys') btn.textContent=t('habitHubFilterKeys');
      else if(key==='habitHubFilterVoice') btn.textContent=t('habitHubFilterVoice');
      else if(key==='habitHubFilterApp') btn.textContent=t('habitHubFilterApp');
    });
  }

  function renderFilters(){
    var f=ui().habitHubFilter||'all';
    document.querySelectorAll('[data-habit-filter]').forEach(function(btn){
      var on=btn.dataset.habitFilter===f;
      btn.classList.toggle('is-active',on);
      btn.setAttribute('aria-selected',on?'true':'false');
    });
    var sort=$('habitHubSort');
    if(sort) sort.value=ui().habitHubSort||'recent';
    applyViewMode();
  }

  function renderList(){
    var list=$('habitHubList');
    var empty=$('habitHubEmpty');
    if(!list) return;
    var items=sortItems(filterItems(collectHabits()));
    if(empty) empty.hidden=items.length>0;
    list.hidden=!items.length;
    if(!items.length){ list.innerHTML=''; return; }
    list.innerHTML=items.map(renderCard).join('');
  }

  function render(){
    renderLabels();
    renderFilters();
    renderList();
    applyShellVisibility();
  }

  function applyShellVisibility(){
    var hub=$('habitHubView');
    var detail=$('habitDetailView');
    var isHub=(ui().habitView||'hub')==='hub';
    if(hub) hub.hidden=!isHub;
    if(detail) detail.hidden=isHub;
    var panel=$('settingsPanelHabits');
    if(panel) panel.classList.toggle('is-habit-hub',isHub);
    if(panel) panel.classList.toggle('is-habit-detail',!isHub);
    if(global.OneToneHabitLayerNav) global.OneToneHabitLayerNav.applyVisibility();
    if(global.OneToneSceneTabs) global.OneToneSceneTabs.applyVisibility();
  }

  function showHub(){
    ui().habitView='hub';
    applyShellVisibility();
    render();
  }

  function showDetail(id,opts){
    opts=opts||{};
    ui().habitView='detail';
    if(id) state().selectedMappingId=id;
    var h=hooks();
    if(h.syncEditorFromSelection) h.syncEditorFromSelection();
    else if(global.OneToneRender) global.OneToneRender.render();
    if(opts.layer&&global.OneToneHabitLayerNav) global.OneToneHabitLayerNav.setHabitLayer(opts.layer);
    applyShellVisibility();
    if(global.OneToneSceneTabs) global.OneToneSceneTabs.render();
    if(global.OneToneHabitLayerNav) global.OneToneHabitLayerNav.onPanelVisibility();
  }

  function touchUpdated(m){
    if(m) m.updatedAt=Date.now();
  }

  function bindEvents(){
    var hub=$('habitHubView');
    if(hub){
      hub.addEventListener('click',function(e){
        var filterBtn=e.target.closest&&e.target.closest('[data-habit-filter]');
        if(filterBtn){
          e.preventDefault();
          ui().habitHubFilter=filterBtn.dataset.habitFilter;
          renderFilters();
          renderList();
          return;
        }
        var viewBtn=e.target.closest&&e.target.closest('[data-habit-view]');
        if(viewBtn){
          e.preventDefault();
          ui().habitHubViewMode=viewBtn.dataset.habitView;
          applyViewMode();
          return;
        }
        var openBtn=e.target.closest&&e.target.closest('[data-habit-open]');
        if(openBtn){
          e.preventDefault();
          showDetail(openBtn.dataset.habitOpen);
          return;
        }
        var switchBtn=e.target.closest&&e.target.closest('[data-habit-switch]');
        if(switchBtn){
          e.preventDefault();
          e.stopPropagation();
          if(global.OneToneSceneActivate) global.OneToneSceneActivate.activateScene(switchBtn.dataset.habitSwitch);
          return;
        }
        var dupBtn=e.target.closest&&e.target.closest('[data-habit-dup]');
        if(dupBtn){
          e.preventDefault();
          e.stopPropagation();
          if(global.OneToneMappingTrashMenu) global.OneToneMappingTrashMenu.duplicate(dupBtn.dataset.habitDup);
          render();
          return;
        }
        var renameBtn=e.target.closest&&e.target.closest('[data-habit-rename]');
        if(renameBtn){
          e.preventDefault();
          e.stopPropagation();
          var id=renameBtn.dataset.habitRename;
          var m=core()&&core().byId?core().byId(id):null;
          if(!m) return;
          var next=prompt(t('habitHubRenamePrompt'),habitName(m));
          if(next===null) return;
          next=String(next).trim();
          if(!next) return;
          m.group=next;
          touchUpdated(m);
          if(hooks().save) hooks().save();
          render();
          return;
        }
        var delBtn=e.target.closest&&e.target.closest('[data-habit-del]');
        if(delBtn){
          e.preventDefault();
          e.stopPropagation();
          if(global.OneToneMappingTrashMenu) global.OneToneMappingTrashMenu.deleteFromMenu(delBtn.dataset.habitDel);
          render();
          return;
        }
        var menuBtn=e.target.closest&&e.target.closest('[data-habit-menu]');
        if(menuBtn){
          e.preventDefault();
          e.stopPropagation();
          showDetail(menuBtn.dataset.habitMenu,{layer:'advanced'});
          return;
        }
      });
    }
    var sort=$('habitHubSort');
    if(sort) sort.addEventListener('change',function(){
      ui().habitHubSort=sort.value;
      renderList();
    });
    function triggerNew(){
      var add=$('btnAddMapping');
      if(add) add.click();
    }
    var newBtn=$('btnHabitHubNew');
    if(newBtn) newBtn.addEventListener('click',function(e){ e.preventDefault(); triggerNew(); });
    var emptyNew=$('btnHabitHubEmptyNew');
    if(emptyNew) emptyNew.addEventListener('click',function(e){ e.preventDefault(); triggerNew(); });
    var back=$('btnHabitHubBack');
    if(back) back.addEventListener('click',function(e){ e.preventDefault(); showHub(); });
    var help=$('btnHabitHubHelp');
    if(help) help.addEventListener('click',function(e){
      e.preventDefault();
      if(global.OneToneSettingsDrawer) global.OneToneSettingsDrawer.setPanel('keys');
    });
  }

  global.OneToneHabitHub={
    render:render,
    showHub:showHub,
    showDetail:showDetail,
    bindEvents:bindEvents,
    classifyHabit:classifyHabit,
    habitName:habitName,
    touchUpdated:touchUpdated
  };
})((typeof window!=='undefined')?window:globalThis);
