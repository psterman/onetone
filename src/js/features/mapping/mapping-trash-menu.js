(function(global){
  'use strict';
  var $=function(id){ return global.OneToneDom.$(id); };
  function h(){ return global.__vp_mapping_trash_menu_hooks__ || {}; }
  var openMenuId=null;
  var menuAnchorBtn=null;

  function closeMenu(){
    openMenuId=null;
    menuAnchorBtn=null;
    var pop=$('mapMenuFloat');
    pop.classList.remove('open');
    pop.removeAttribute('data-id');
    document.querySelectorAll('.map-row.menu-open').forEach(function(row){ row.classList.remove('menu-open'); });
  }

  function openMenu(id, btn){
    if(openMenuId===id){ closeMenu(); return; }
    openMenuId=id;
    menuAnchorBtn=btn;
    var pop=$('mapMenuFloat');
    pop.dataset.id=id;
    var rect=btn.getBoundingClientRect();
    var width=148;
    var left=rect.right-width;
    if(left<8) left=8;
    var top=rect.bottom+6;
    if(top+120>window.innerHeight) top=Math.max(8, rect.top-120);
    pop.style.left=left+'px';
    pop.style.top=top+'px';
    pop.classList.add('open');
    document.querySelectorAll('.map-row.menu-open').forEach(function(row){ row.classList.remove('menu-open'); });
    var row=btn.closest('.map-row');
    if(row) row.classList.add('menu-open');
    var hooks=h();
    var state=global.OneToneState.state;
    var list=hooks.sortedMappings();
    var i=list.findIndex(function(m){ return m.id===id; });
    var m=state.config.mappings.find(function(x){ return x.id===id; });
    $('menuActDup').disabled=!m;
    $('menuActTest').disabled=!m||!hooks.editorTargetForMapping(m);
    $('menuActUp').disabled=!m||i<=0;
    $('menuActDown').disabled=!m||i<0||i>=list.length-1;
    $('menuActDel').disabled=false;
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
    hooks.saveAsync().then(function(){
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
    var copy=JSON.parse(JSON.stringify(src));
    var newId=hooks.newMappingId();
    copy.id=newId;
    copy.enabled=false;
    copy.order=state.config.mappings.length;
    copy.label=(copy.label||'').trim();
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
    hooks.saveAsync().then(function(){
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
    menuAnchorBtn:function(){ return menuAnchorBtn; }
  };
})((typeof window!=='undefined')?window:globalThis);
