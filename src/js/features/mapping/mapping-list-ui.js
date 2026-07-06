(function(global){
  'use strict';
  var $ = function(id){ return global.OneToneDom.$(id); };
  function hooks(){ return global.__vp_mapping_list_ui_hooks__ || {}; }
  function bindClick(id,handler){
    var el=$(id);
    if(el) el.onclick=handler;
    return el;
  }
  function bindEvent(id,type,handler){
    var el=$(id);
    if(el) el.addEventListener(type,handler);
    return el;
  }
  function bindEvents(){
    var state = global.OneToneState.state;
    var t = hooks().t;
    bindEvent('mappingList','input',function(e){
      const range=e.target.closest&&e.target.closest('[data-timing-range]');
      if(!range) return;
      e.stopPropagation();
      hooks().liveUpdateTimingRange(range);
    });
    bindEvent('mappingList','click',function(e){
      const el=e.target;
      const listTiming=el.closest&&el.closest('[data-list-timing-toggle]');
      if(listTiming){
        e.stopPropagation();
        const id=listTiming.dataset.listTimingToggle;
        const field=listTiming.dataset.field;
        const m=state.config.mappings.find(function(x){return x.id===id;});
        if(!m||!hooks().isSavedMapping(m)) return;
        hooks().ensureMappingTiming(m);
        if(field==='cancelEnabled'||field==='autoEnterEnabled') m.triggerMode='tap';
        m[field]=!m[field];
        hooks().save();
        if(m.id===state.selectedMappingId) hooks().renderKeyFinishFlowPanel();
        hooks().renderMappingList();
        hooks().renderHomeKeyFinishPreview(false);
        return;
      }
      const manageBtn=el.closest&&el.closest('[data-manage-trigger]');
      if(manageBtn){
        e.stopPropagation();
        const id=manageBtn.dataset.manageTrigger;
        hooks().focusMapping(id);
        const home=$('homeZone');
        if(home) home.scrollIntoView({behavior:'smooth',block:'start'});
        hooks().openSettings({panel:'keys',focus:'trigger'});
        return;
      }
      const nativeRecBtn=el.closest&&el.closest('[data-native-restore-record]');
      if(nativeRecBtn){
        e.stopPropagation();
        const id=nativeRecBtn.dataset.nativeRestoreRecord;
        if(OneToneMappingRecording.mode()==='nativeRestore'&&OneToneMappingRecording.mappingId()===id){
          hooks().cancelRecording();
          return;
        }
        hooks().startNativeRestoreRecord(id);
        return;
      }
      const nativeToggle=el.closest&&el.closest('[data-native-restore]');
      if(nativeToggle){
        e.stopPropagation();
        const id=nativeToggle.dataset.nativeRestore;
        const m=state.config.mappings.find(function(x){return x.id===id;});
        if(!m) return;
        m.nativeKeyRestore=!m.nativeKeyRestore;
        hooks().save();
        hooks().renderMappingList();
        return;
      }
      const addSwitch=el.closest&&el.closest('[data-add-switch]');
      if(addSwitch){
        e.stopPropagation();
        if(OneToneMappingRecording.mode()==='mappingSwitch'&&OneToneMappingRecording.mappingId()===addSwitch.dataset.addSwitch){
          OneToneMappingRecording.setMode('none');
          OneToneMappingRecording.setMappingId('');
          hooks().renderMappingList();
          hooks().renderRecordCancelBar();
          return;
        }
        hooks().startMappingSwitchRecord(addSwitch.dataset.addSwitch);
        return;
      }
      const rmSwitch=el.closest&&el.closest('[data-rm-switch]');
      if(rmSwitch){
        e.stopPropagation();
        hooks().removeMappingSwitchKey(rmSwitch.dataset.rmSwitch, Number(rmSwitch.dataset.idx));
        return;
      }
      const toggleEl=el.closest&&el.closest('[data-toggle]');
      if(toggleEl){
        e.stopPropagation();
        const id=toggleEl.dataset.toggle;
        const m=state.config.mappings.find(function(x){return x.id===id;});
        if(!m) return;
        const next=!m.enabled;
        hooks().setMappingEnabled(id,next);
        return;
      }
      const testBtn=el.closest&&el.closest('[data-test]');
      if(testBtn){
        e.stopPropagation();
        if(!testBtn.disabled) hooks().fireTestSend(testBtn.dataset.test);
        return;
      }
      const menuBtn=el.closest&&el.closest('[data-menu]');
      if(menuBtn){
        e.stopPropagation();
        // The menu is opened on pointerdown; the following click should not toggle it closed.
        return;
      }
      const activateBtn=el.closest&&el.closest('[data-scene-activate]');
      if(activateBtn){
        e.stopPropagation();
        if(global.OneToneSceneActivate) global.OneToneSceneActivate.activateScene(activateBtn.dataset.sceneActivate);
        return;
      }
      const row=el.closest&&el.closest('.map-row');
      if(row&&row.dataset.id){
        if(el.closest('.map-key-switches,.map-row-extras')) return;
        const id=row.dataset.id;
        state.selectedMappingId=id;
        hooks().syncEditorFromSelection();
        hooks().closeFloatMenu();
        hooks().render();
      }
    });
         bindClick('btnAddMapping',function(){
      if(!hooks().isCurrentDraftComplete()){
        hooks().toast(t('addNeedComplete'));
        hooks().renderDraftHint();
        return;
      }
      hooks().ensureConfig();
      const id=hooks().newMappingId();
      state.config.mappings.push({id:id,label:'',group:'默认',triggerKey:'',targetKey:'',enabled:false,order:state.config.mappings.length,triggerMode:'tap',intervalMs:state.config.intervalMs||1200,enterDelayMs:state.config.enterDelayMs||5000,cancelEnabled:state.config.cancelEnabled!==false,autoEnterEnabled:state.config.autoEnterEnabled!==false,appBehaviorRules:[]});
      state.selectedMappingId=id;
      hooks().setPendingNewDraftId(id);
      hooks().setEditorTriggerKey("");
      hooks().setEditorTargetKey("");
      hooks().syncEditorFromSelection();
      hooks().save();
      hooks().render();
      hooks().renderRecordCancelBar();
      const home=$('homeZone');
      if(home) home.scrollIntoView({behavior:'smooth',block:'start'});
      hooks().openSettings({panel:'keys',focus:'trigger'});
    });
    bindEvent('mapMenuFloat','click',function(e){
      e.stopPropagation();
      const actBtn=e.target.closest&&e.target.closest('[data-act]');
      if(!actBtn||actBtn.disabled) return;
      const menu=$('mapMenuFloat');
      const id=menu&&menu.dataset.id;
      const act=actBtn.dataset.act;
      if(!id) return;
      if(act==='test'){ hooks().closeFloatMenu(); hooks().fireTestSend(id); return; }
      if(act==='dup'){ hooks().duplicateMapping(id); return; }
      if(act==='del'){ hooks().closeFloatMenu(); hooks().deleteMappingFromMenu(id); return; }
      if(act==='up'||act==='down'){ hooks().reorderMapping(id, act); return; }
    });
         function triggerOpenMenuAction(act){
      const pop=$('mapMenuFloat');
      if(!pop||!pop.dataset.id) return;
      const id=pop.dataset.id;
      if(act==='test'){ hooks().closeFloatMenu(); hooks().fireTestSend(id); return; }
      if(act==='dup'){ hooks().duplicateMapping(id); return; }
      if(act==='del'){ hooks().closeFloatMenu(); hooks().deleteMappingFromMenu(id); return; }
      if(act==='up'||act==='down'){ hooks().reorderMapping(id, act); }
    }
         bindClick('menuActTest',function(e){ e.stopPropagation(); triggerOpenMenuAction('test'); });
    bindClick('menuActDup',function(e){ e.stopPropagation(); triggerOpenMenuAction('dup'); });
    bindClick('menuActUp',function(e){ e.stopPropagation(); triggerOpenMenuAction('up'); });
    bindClick('menuActDown',function(e){ e.stopPropagation(); triggerOpenMenuAction('down'); });
    bindClick('menuActDel',function(e){ e.stopPropagation(); triggerOpenMenuAction('del'); });
    document.addEventListener('pointerdown',function(e){
      const menuBtn=e.target.closest&&e.target.closest('.map-menu-btn[data-menu]');
      if(!menuBtn) return;
      e.preventDefault();
      e.stopPropagation();
      const id=menuBtn.getAttribute('data-menu')||'';
      hooks().openFloatMenu(id, menuBtn);
    }, true);
         document.addEventListener('click',function(e){
      if(hooks().openMenuId()){
        const pop=$('mapMenuFloat');
        if(pop&&!pop.contains(e.target) && !(hooks().menuAnchorBtn()&&hooks().menuAnchorBtn().contains(e.target))){
          hooks().closeFloatMenu();
          hooks().renderMappingList();
        }
      }
    });
    window.addEventListener('resize',function(){ if(hooks().openMenuId()&&hooks().menuAnchorBtn()) hooks().openFloatMenu(hooks().openMenuId(), hooks().menuAnchorBtn()); });
    window.addEventListener('scroll',function(){ if(hooks().openMenuId()) hooks().closeFloatMenu(); }, true);
  }
  global.OneToneMappingListUi = { bindEvents: bindEvents };
})((typeof window !== 'undefined') ? window : globalThis);
