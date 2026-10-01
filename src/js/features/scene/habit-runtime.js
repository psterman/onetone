(function(global){
  'use strict';

  var changeListeners=[];
  var didInitNotify=false;

  function state(){ return global.OneToneState&&global.OneToneState.state; }
  function cfg(){ return state()&&state().config; }
  function rt(){ return global.OneToneRuntimeHabitControl; }
  function act(){ return global.OneToneSceneActivate; }

  function mappingById(id){
    id=String(id||'').trim();
    if(!id) return null;
    if(global.OneToneMappingCore&&global.OneToneMappingCore.byId) return global.OneToneMappingCore.byId(id);
    return null;
  }

  function habitName(m){
    if(!m) return '';
    if(global.OneToneHabitProfile&&global.OneToneHabitProfile.habitDisplayName){
      return global.OneToneHabitProfile.habitDisplayName(m);
    }
    return String(m.group||m.label||m.id||'').trim();
  }

  function isSavedHabit(m){
    if(!m) return false;
    var c=cfg();
    var hp=global.OneToneHabitProfile;
    var core=global.OneToneMappingCore;
    if(hp&&hp.isLibraryHabit) return !!hp.isLibraryHabit(m,c);
    if(core&&core.isSaved) return !!core.isSaved(m);
    return true;
  }

  function hasHabits(){
    var c=cfg();
    var list=c&&Array.isArray(c.mappings)?c.mappings:[];
    for(var i=0;i<list.length;i++){
      if(isSavedHabit(list[i])) return true;
    }
    return false;
  }

  function sourceFlags(mode){
    mode=String(mode||'');
    return {
      pin:mode==='pinHabit'||mode==='pinAppHabit',
      override:mode==='softOverride',
      foreground:mode==='auto',
      manual:mode==='manual'
    };
  }

  function emptyCurrent(){
    return {
      id:'',
      name:'',
      mode:'manual',
      badge:'',
      tooltip:'',
      canClearPin:false,
      canClearOverride:false
    };
  }

  function getSnapshot(){
    var control={canClearPin:false,canClearOverride:false,staleOverride:false};
    var source={pin:false,override:false,foreground:false,manual:true};
    var current=emptyCurrent();
    var r=rt();
    if(r&&r.calculateEffectiveScene&&r.resolveRuntimeHabitDisplay){
      var identity=r.foregroundIdentity?r.foregroundIdentity():null;
      var calc=r.calculateEffectiveScene(identity);
      var disp=r.resolveRuntimeHabitDisplay(identity);
      var id=String(calc.resolvedId||'');
      var m=mappingById(id);
      current={
        id:id,
        name:habitName(m)||String(disp.habitName||''),
        mode:String(disp.mode||calc.mode||'manual'),
        badge:String(disp.badgeLabel||''),
        tooltip:String(disp.tooltip||''),
        canClearPin:!!disp.canClearPin,
        canClearOverride:!!disp.canClearOverride
      };
      control={
        canClearPin:!!disp.canClearPin,
        canClearOverride:!!disp.canClearOverride,
        staleOverride:!!(calc.staleOverride||disp.staleOverride)
      };
      source=sourceFlags(current.mode);
      if(current.mode==='auto'&&!(cfg()&&cfg().followForegroundAppScenario)){
        source={pin:false,override:false,foreground:false,manual:true};
        current.mode='manual';
      }
    }
    if(!didInitNotify){
      didInitNotify=true;
      notify('init',{previous:null,current:current});
    }
    return {
      current:current,
      control:control,
      source:source,
      hasHabits:hasHabits()
    };
  }

  function subscribe(type,cb){
    if(type!=='change'||typeof cb!=='function') return function(){};
    changeListeners.push(cb);
    return function unsubscribe(){
      var i=changeListeners.indexOf(cb);
      if(i>=0) changeListeners.splice(i,1);
    };
  }

  function notify(reason,extra){
    var payload={
      type:'effective_changed',
      previous:extra&&extra.previous!=null?extra.previous:null,
      current:extra&&extra.current!=null?extra.current:null,
      reason:String(reason||'config')
    };
    if(payload.current==null){
      try{
        var snap=getSnapshotNoInit();
        payload.current=snap.current;
      }catch(_){}
    }
    for(var i=0;i<changeListeners.length;i++){
      try{ changeListeners[i](payload); }catch(_){}
    }
  }

  function getSnapshotNoInit(){
    var was=didInitNotify;
    didInitNotify=true;
    var snap=getSnapshot();
    didInitNotify=was;
    return snap;
  }

  function followActive(){
    return !!(cfg()&&cfg().followForegroundAppScenario);
  }

  function switchHabit(id,opts){
    opts=opts||{};
    id=String(id||'').trim();
    var r=rt();
    var a=act();
    var previous=getSnapshotNoInit().current;
    var targetM=mappingById(id);
    var targetName=habitName(targetM);
    var mode=String(opts.mode||'auto');
    var source=String(opts.source||'manual');

    if(!id||!targetM||!isSavedHabit(targetM)){
      return {ok:false,reason:'not_available',snapshot:getSnapshotNoInit()};
    }

    var pin=r&&r.getPin?r.getPin():null;
    if(pin&&pin.mappingId&&!opts.confirm){
      var pinnedM=mappingById(pin.mappingId);
      return {
        ok:false,
        requiresConfirm:true,
        reason:'pin_active',
        pinnedName:habitName(pinnedM),
        targetName:targetName,
        snapshot:getSnapshotNoInit()
      };
    }

    if(mode==='override'){
      if(r&&r.setSoftOverride){
        r.setSoftOverride(id,r.foregroundIdentity?r.foregroundIdentity():null);
      }
      var snapO=getSnapshotNoInit();
      notify('override',{previous:previous,current:snapO.current});
      return {ok:true,snapshot:snapO};
    }

    if(mode==='pin'){
      if(r&&r.setPinHabit) r.setPinHabit(id);
      var snapP=getSnapshotNoInit();
      notify('pin',{previous:previous,current:snapP.current});
      return {ok:true,snapshot:snapP};
    }

    // mode auto (default): follow-on needs an explicit choice (override / pin / disable_follow)
    if(!pin&&followActive()&&!opts.allowForegroundFollow){
      return {
        ok:false,
        requiresChoice:true,
        reason:'follow_active',
        choices:['override','pin','disable_follow'],
        targetName:targetName,
        snapshot:getSnapshotNoInit()
      };
    }

    if(pin&&opts.confirm&&r&&r.clearPin){
      r.clearPin();
    }

    if(a&&a.activateScene){
      a.activateScene(id,{source:source});
    }

    var snap=getSnapshotNoInit();
    var reason=source==='home_quick_switch'?'home_quick_switch'
      :(source==='foreground'?'foreground':'manual');
    notify(reason,{previous:previous,current:snap.current});
    return {ok:true,snapshot:snap};
  }

  function notifyConfigChanged(){
    notify('config',{});
  }

  function toggleAssist(habitId,assistId){
    var m=global.OneToneNowModel;
    if(!m||!m.toggleHabitAssist) return {ok:false};
    var res=m.toggleHabitAssist(habitId,assistId);
    return res;
  }

  // Reset init flag only for tests
  function _resetForTests(){
    changeListeners=[];
    didInitNotify=false;
  }

  global.OneToneHabitRuntime={
    getSnapshot:getSnapshot,
    switch:switchHabit,
    subscribe:subscribe,
    notify:notify,
    notifyConfigChanged:notifyConfigChanged,
    toggleAssist:toggleAssist,
    _resetForTests:_resetForTests
  };
})((typeof window!=='undefined')?window:globalThis);
