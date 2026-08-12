(function(global){
  'use strict';
  var $=function(id){ return global.OneToneDom.$(id); };
  function h(){ return global.__vp_mapping_trash_menu_hooks__ || {}; }
  var openMenuId=null;
  var menuAnchorBtn=null;
  var menuLeft=0;
  var menuTop=0;

  function mapMenuFloatIslandMounted(){
    return !!global.__otMapMenuFloatMounted;
  }

  function buildMapMenuFloatModel(){
    var hooks=h();
    var t=typeof hooks.t==='function'?hooks.t:function(k){ return k; };
    var labels={
      test:t('testShort'),
      dup:t('duplicate'),
      up:t('moveUp'),
      down:t('moveDown'),
      del:t('delete')
    };
    if(!openMenuId){
      return {
        open:false,
        id:'',
        left:0,
        top:0,
        disabled:{ test:true, dup:true, up:true, down:true, del:true },
        labels:labels,
        sig:'closed'
      };
    }
    var state=global.OneToneState.state;
    var list=hooks.sortedMappings?hooks.sortedMappings():[];
    var i=list.findIndex(function(m){ return m.id===openMenuId; });
    var m=(state.config.mappings||[]).find(function(x){ return x.id===openMenuId; });
    var disabled={
      test:!m||!(hooks.editorTargetForMapping&&hooks.editorTargetForMapping(m)),
      dup:!m,
      up:!m||i<=0,
      down:!m||i<0||i>=list.length-1,
      del:false
    };
    var sig=[
      '1',
      openMenuId,
      String(menuLeft),
      String(menuTop),
      disabled.test?'1':'0',
      disabled.dup?'1':'0',
      disabled.up?'1':'0',
      disabled.down?'1':'0',
      disabled.del?'1':'0',
      labels.test,
      labels.dup,
      labels.up,
      labels.down,
      labels.del
    ].join('|');
    return {
      open:true,
      id:openMenuId,
      left:menuLeft,
      top:menuTop,
      disabled:disabled,
      labels:labels,
      sig:sig
    };
  }

  function applyMapMenuFloatDom(model){
    var pop=$('mapMenuFloat');
    if(!pop) return;
    if(model.open){
      pop.dataset.id=model.id;
      pop.style.left=model.left+'px';
      pop.style.top=model.top+'px';
      pop.classList.add('open');
    }else{
      pop.classList.remove('open');
      pop.removeAttribute('data-id');
    }
    if(mapMenuFloatIslandMounted()) return;
    var dup=$('menuActDup');
    var test=$('menuActTest');
    var up=$('menuActUp');
    var down=$('menuActDown');
    var del=$('menuActDel');
    if(dup) dup.disabled=model.disabled.dup;
    if(test) test.disabled=model.disabled.test;
    if(up) up.disabled=model.disabled.up;
    if(down) down.disabled=model.disabled.down;
    if(del) del.disabled=model.disabled.del;
  }

  function pushMapMenuFloatView(){
    var model=buildMapMenuFloatModel();
    if(mapMenuFloatIslandMounted()&&typeof global.__otMapMenuFloatSync==='function'){
      global.__otMapMenuFloatSync();
      return;
    }
    applyMapMenuFloatDom(model);
  }

  function closeMenu(){
    openMenuId=null;
    menuAnchorBtn=null;
    menuLeft=0;
    menuTop=0;
    document.querySelectorAll('.map-row.menu-open').forEach(function(row){ row.classList.remove('menu-open'); });
    pushMapMenuFloatView();
  }

  function openMenu(id, btn){
    if(openMenuId===id){ closeMenu(); return; }
    openMenuId=id;
    menuAnchorBtn=btn;
    var rect=btn.getBoundingClientRect();
    var width=148;
    var left=rect.right-width;
    if(left<8) left=8;
    var top=rect.bottom+6;
    if(top+120>window.innerHeight) top=Math.max(8, rect.top-120);
    menuLeft=left;
    menuTop=top;
    document.querySelectorAll('.map-row.menu-open').forEach(function(row){ row.classList.remove('menu-open'); });
    var row=btn.closest('.map-row');
    if(row) row.classList.add('menu-open');
    pushMapMenuFloatView();
  }

  function runMenuAct(act){
    var id=openMenuId;
    if(!id) return;
    if(act==='test'){
      closeMenu();
      var listHooks=global.__vp_mapping_list_ui_hooks__||{};
      if(typeof listHooks.fireTestSend==='function') listHooks.fireTestSend(id);
      return;
    }
    if(act==='dup'){ duplicate(id); return; }
    if(act==='up'){ reorder(id,'up'); return; }
    if(act==='down'){ reorder(id,'down'); return; }
    if(act==='del'){ closeMenu(); deleteFromMenu(id); }
  }

  function softDelete(id){
    var hooks=h();
    var state=global.OneToneState.state;
    var t=hooks.t;
    hooks.ensureConfig();
    if(!confirm(t('confirmDelete'))) return;
    var idx=state.config.mappings.findIndex(function(m){ return m.id===id; });
    if(idx<0) return;
    var removed=Object.assign({}, state.config.mappings.splice(idx,1)[0]);
    removed.enabled=false;
    if(!Array.isArray(state.config.trash)) state.config.trash=[];
    state.config.trash.unshift(removed);
    if(state.selectedMappingId===id){
      state.selectedMappingId=state.config.mappings[0]&&state.config.mappings[0].id;
    }
    if(!state.config.mappings.length){
      var newId=hooks.newMappingId();
      state.config.mappings.push({id:newId,label:'',group:'通用设置',triggerKey:'',targetKey:'',enabled:false,order:0,triggerMode:'tap'});
      state.selectedMappingId=newId;
    }
    state.config.mappings.forEach(function(m,i){ m.order=i; });
    hooks.syncEditorFromSelection();
    closeMenu();
    hooks.saveAsync({source:'mapping'}).then(function(){
      renderTrashList();
      hooks.render();
      hooks.toast(t('movedToTrash'));
    }).catch(function(){
      renderTrashList();
      hooks.render();
      hooks.toast(t('movedToTrash'));
    });
  }

  function deleteFromMenu(id){
    var hooks=h();
    var state=global.OneToneState.state;
    var t=hooks.t;
    hooks.ensureConfig();
    var m=state.config.mappings.find(function(x){ return x.id===id; });
    if(!m) return;
    if(hooks.isDraftMapping(m)){
      if((m.triggerKey||m.targetKey)&&!confirm(t('confirmDeleteDraft'))) return;
      closeMenu();
      hooks.removeDraftMapping(id);
      return;
    }
    softDelete(id);
  }

  function duplicate(id){
    var hooks=h();
    var state=global.OneToneState.state;
    hooks.ensureConfig();
    var src=state.config.mappings.find(function(x){ return x.id===id; });
    if(!src) return;
    var appId=String(src.appTargetId||'').trim();
    var hub=global.OneToneHabitHub;
    // Non-custom preset apps: one scenario per app — block copy.
    if(appId&&appId!=='custom'){
      if(global.OneToneAppToast&&global.OneToneI18n){
        global.OneToneAppToast.show(global.OneToneI18n.t('habitHubDupBlocked')||global.OneToneI18n.t('habitHubAppScenarioExists'),'scheme');
      }
      return;
    }
    var copy=JSON.parse(JSON.stringify(src));
    var newId=hooks.newMappingId();
    copy.id=newId;
    copy.enabled=false;
    copy.order=state.config.mappings.length;
    copy.label=(copy.label||'').trim();
    if(appId==='codex-chat'&&hub&&hub.uniqueScenarioName){
      // Include source in the count so the copy gets · 2, · 3…
      copy.group=hub.uniqueScenarioName(appId);
    }else if(appId==='codex-chat'&&hub&&typeof hub.countAppScenarios==='function'){
      var base=(global.OneToneI18n&&global.OneToneI18n.t)
        ?global.OneToneI18n.t('habitWizardDefaultName').replace('{app}','Codex')
        :'Codex 场景';
      var n=hub.countAppScenarios(appId);
      copy.group=n<=0?base:(base+' · '+(n+1));
    }
    if(global.OneToneConfigPersist&&global.OneToneConfigPersist.rekeyVoiceCommandsForMapping){
      copy.voiceCommands=global.OneToneConfigPersist.rekeyVoiceCommandsForMapping(copy.voiceCommands,newId);
    }else if(Array.isArray(copy.voiceCommands)){
      copy.voiceCommands=copy.voiceCommands.map(function(c,i){
        if(!c||typeof c!=='object') return c;
        return Object.assign({},c,{
          id:'cmd_'+Date.now()+'_'+i+'_'+Math.floor(Math.random()*100000),
          scenarioId:newId,
          updatedAt:Date.now()
        });
      });
    }
    if(global.OneToneConfigPersist&&global.OneToneConfigPersist.rekeyAcousticVoiceCommandsForMapping){
      copy.acousticVoiceCommands=global.OneToneConfigPersist.rekeyAcousticVoiceCommandsForMapping(copy.acousticVoiceCommands,newId);
    }else{
      copy.acousticVoiceCommands=[];
    }
    state.config.mappings.push(copy);
    state.selectedMappingId=newId;
    hooks.syncEditorFromSelection();
    closeMenu();
    hooks.save();
    hooks.render();
  }

  function reorder(id, dir){
    var hooks=h();
    var state=global.OneToneState.state;
    hooks.ensureConfig();
    var list=hooks.sortedMappings();
    var i=list.findIndex(function(m){ return m.id===id; });
    if(i<0) return;
    if(dir==='up'&&i>0){
      var tmp=list[i-1];
      list[i-1]=list[i];
      list[i]=tmp;
    }else if(dir==='down'&&i<list.length-1){
      var tmp2=list[i+1];
      list[i+1]=list[i];
      list[i]=tmp2;
    }else return;
    list.forEach(function(m,idx){ m.order=idx; });
    state.config.mappings=list;
    closeMenu();
    hooks.save();
    hooks.render();
  }

  function restoreFromTrash(id){
    var hooks=h();
    var state=global.OneToneState.state;
    hooks.ensureConfig();
    if(!Array.isArray(state.config.trash)) state.config.trash=[];
    var idx=state.config.trash.findIndex(function(m){ return m.id===id; });
    if(idx<0) return;
    var item=state.config.trash.splice(idx,1)[0];
    item.enabled=false;
    item.order=state.config.mappings.length;
    state.config.mappings.push(item);
    state.selectedMappingId=item.id;
    hooks.syncEditorFromSelection();
    hooks.saveAsync({source:'mapping'}).then(function(){
      renderTrashList();
      hooks.render();
    }).catch(function(){
      renderTrashList();
      hooks.render();
    });
  }

  function renderTrashList(){
    var hooks=h();
    var state=global.OneToneState.state;
    var t=hooks.t;
    hooks.ensureConfig();
    var box=$('trashList');
    var empty=$('trashEmpty');
    var items=state.config.trash||[];
    empty.hidden=items.length>0;
    if(!items.length){ box.innerHTML=''; return; }
    var html='';
    items.forEach(function(m){
      html+='<div class="trash-row"><span>'+hooks.friendlyPair(m.triggerKey,m.targetKey,m)+'</span>';
      html+='<button type="button" class="trash-restore" data-restore="'+m.id+'">'+t('trashRestore')+'</button></div>';
    });
    box.innerHTML=html;
  }

  global.OneToneMappingTrashMenu={
    open:openMenu,
    close:closeMenu,
    deleteFromMenu:deleteFromMenu,
    duplicate:duplicate,
    reorder:reorder,
    restoreFromTrash:restoreFromTrash,
    renderTrashList:renderTrashList,
    openMenuId:function(){ return openMenuId; },
    menuAnchorBtn:function(){ return menuAnchorBtn; },
    buildMapMenuFloatModel:buildMapMenuFloatModel,
    applyMapMenuFloatDom:applyMapMenuFloatDom,
    runMenuAct:runMenuAct
  };
})((typeof window!=='undefined')?window:globalThis);
