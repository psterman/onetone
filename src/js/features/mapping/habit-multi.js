(function(global){
  'use strict';

  var $=function(id){ return global.OneToneDom.$(id); };
  var t=function(key){ return global.OneToneI18n.t(key); };
  function state(){ return global.OneToneState.state; }
  function core(){ return global.OneToneMappingCore; }
  function flow(){ return global.OneToneSceneFlowSummary; }

  function esc(s){
    return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');
  }

  function habitName(m){
    if(!m) return '—';
    if((m.group||'').trim()) return m.group.trim();
    if(global.OneToneHomeScheme&&global.OneToneHomeScheme.shortName) return global.OneToneHomeScheme.shortName(m);
    if((m.label||'').trim()) return m.label.trim();
    return m.id||'—';
  }

  function habitSummary(m){
    if(!m||!core()) return '—';
    var trig=flow&&flow.displayTriggerLabel?flow.displayTriggerLabel(m):'';
    var tgt=flow&&flow.displayTargetKey?flow.friendlyKeyName(flow.displayTargetKey(m,state().config||{})):'';
    var fin=flow&&flow.finishBehaviorTextSettings?flow.finishBehaviorTextSettings(m).text:'';
    if(!trig&&!tgt) return t('keySchemeCompletenessIncomplete');
    return [trig||'—',tgt||'—',fin||'—'].join(' → ');
  }

  function selectMapping(id){
    state().selectedMappingId=id;
    var hooks=global.__vp_mapping_list_ui_hooks__||global.__vp_mapping_list_hooks__||{};
    if(hooks.syncEditorFromSelection) hooks.syncEditorFromSelection();
    else if(global.OneToneRender){
      if(global.OneToneRender.schedule) global.OneToneRender.schedule('habitMultiSelect');
      else global.OneToneRender.render();
    }
  }

  function renderHabitMultiCards(){
    var hub=global.OneToneHabitHub;
    if(!hub) return;
    if(typeof hub.scheduleHubPaint==='function') hub.scheduleHubPaint();
    else if(typeof hub.render==='function') hub.render();
  }

  function bindEvents(){
    var wrap=$('habitMultiCards');
    if(wrap){
      wrap.addEventListener('click',function(e){
        var card=e.target.closest&&e.target.closest('[data-habit-card]');
        if(card){
          e.preventDefault();
          selectMapping(card.dataset.habitCard);
          return;
        }
        if(e.target.closest('#habitMultiAddCard')){
          e.preventDefault();
          var add=$('btnAddMapping');
          if(add) add.click();
        }
      });
    }
    var btnNew=$('btnHabitMultiNew');
    if(btnNew) btnNew.addEventListener('click',function(e){
      e.preventDefault();
      var add=$('btnAddMapping');
      if(add) add.click();
    });
    var btnCopy=$('btnHabitMultiCopy');
    if(btnCopy) btnCopy.addEventListener('click',function(e){
      e.preventDefault();
      var id=state().selectedMappingId;
      var hooks=global.__vp_mapping_list_ui_hooks__||{};
      if(id&&hooks.duplicateMapping) hooks.duplicateMapping(id);
      else if(id&&global.OneToneMappingTrashMenu) global.OneToneMappingTrashMenu.duplicate(id);
    });
    var btnManage=$('btnHabitMultiManage');
    if(btnManage) btnManage.addEventListener('click',function(e){
      e.preventDefault();
      if(global.OneToneHabitLayerNav) global.OneToneHabitLayerNav.setHabitLayer('advanced');
      var section=$('habitMappingsSection');
      if(section) section.scrollIntoView({behavior:'smooth',block:'start'});
    });
  }

  global.OneToneHabitMulti={
    render:renderHabitMultiCards,
    bindEvents:bindEvents
  };
})((typeof window!=='undefined')?window:globalThis);
