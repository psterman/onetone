(function(global){
  'use strict';

  var lastFgIdentity=null;

  function state(){ return global.OneToneState&&global.OneToneState.state; }
  function cfg(){ return state()&&state().config; }
  function t(key,fallback){
    if(global.OneToneI18n&&global.OneToneI18n.t){
      var v=global.OneToneI18n.t(key);
      if(v&&v!==key) return v;
    }
    return fallback!=null?fallback:key;
  }

  function normalizePath(p){
    return String(p||'').trim().toLowerCase().replace(/\//g,'\\');
  }

  function fgSignatureFromIdentity(identity){
    if(!identity) return '';
    var path=normalizePath(identity.fullPath||identity.full_path||'');
    var cls=String(identity.windowClass||identity.window_class||'').trim();
    return path+'\0'+cls;
  }

  function ensureRuntimeFields(){
    var c=cfg();
    if(!c) return;
    if(!c.runtimeHabitControl||typeof c.runtimeHabitControl!=='object'){
      c.runtimeHabitControl={softOverride:null,pin:null};
    }
    if(c.runtimeHabitControl.softOverride===undefined) c.runtimeHabitControl.softOverride=null;
    if(c.runtimeHabitControl.pin===undefined) c.runtimeHabitControl.pin=null;
  }

  function persistQuiet(){
    var p=global.OneToneConfigPersist;
    if(p&&p.saveAsync) p.saveAsync({source:'runtimeHabit'});
    else if(p&&p.save) p.save();
  }

  function mappingById(id){
    id=String(id||'').trim();
    if(!id) return null;
    if(global.OneToneMappingCore&&global.OneToneMappingCore.byId) return global.OneToneMappingCore.byId(id);
    return null;
  }

  function habitName(m){
    if(!m) return '—';
    if(global.OneToneHabitProfile&&global.OneToneHabitProfile.habitDisplayName){
      return global.OneToneHabitProfile.habitDisplayName(m);
    }
    return String(m.group||m.label||m.id||'').trim()||'—';
  }

  function baselineMappingId(){
    var diff=global.OneToneHabitOverrideDiff;
    if(diff&&diff.findGlobalBaselineMapping){
      var b=diff.findGlobalBaselineMapping(cfg(),global.OneToneMappingCore);
      if(b&&b.id) return String(b.id);
    }
    return '';
  }

  function autoSceneIdForIdentity(identity){
    if(!identity) return '';
    var hub=global.OneToneHabitHub;
    if(hub&&hub.findAppScenarioForIdentity){
      var hit=hub.findAppScenarioForIdentity(identity);
      if(hit&&hit.id) return String(hit.id);
    }
    return baselineMappingId();
  }

  function getSoftOverride(){
    ensureRuntimeFields();
    var so=cfg().runtimeHabitControl.softOverride;
    if(!so||!so.mappingId) return null;
    return {mappingId:String(so.mappingId),fgSignature:String(so.fgSignature||'')};
  }

  function getPin(){
    ensureRuntimeFields();
    return cfg().runtimeHabitControl.pin||null;
  }

  function noteForegroundIdentity(identity){
    if(identity&&(identity.exeName||identity.exe_name||identity.fullPath||identity.full_path)){
      lastFgIdentity=identity;
    }
  }

  function foregroundIdentity(){
    return lastFgIdentity;
  }

  function isSoftOverrideValid(identity){
    var so=getSoftOverride();
    if(!so||!so.fgSignature) return false;
    return so.fgSignature===fgSignatureFromIdentity(identity);
  }

  function clearSoftOverride(opts){
    ensureRuntimeFields();
    if(!cfg().runtimeHabitControl.softOverride) return false;
    cfg().runtimeHabitControl.softOverride=null;
    if(!opts||!opts.skipPersist) persistQuiet();
    return true;
  }

  function setSoftOverride(mappingId,identity,opts){
    mappingId=String(mappingId||'').trim();
    if(!mappingId) return;
    ensureRuntimeFields();
    cfg().runtimeHabitControl.softOverride={
      mappingId:mappingId,
      fgSignature:fgSignatureFromIdentity(identity||lastFgIdentity)
    };
    if(!opts||!opts.skipPersist) persistQuiet();
  }

  function setPinHabit(mappingId,opts){
    mappingId=String(mappingId||'').trim();
    if(!mappingId) return;
    ensureRuntimeFields();
    cfg().runtimeHabitControl.pin={kind:'habit',mappingId:mappingId};
    cfg().runtimeHabitControl.softOverride=null;
    if(!opts||!opts.skipPersist) persistQuiet();
  }

  function setPinAppHabit(appTargetId,mappingId,opts){
    appTargetId=String(appTargetId||'').trim();
    mappingId=String(mappingId||'').trim();
    if(!appTargetId||!mappingId) return;
    ensureRuntimeFields();
    cfg().runtimeHabitControl.pin={kind:'appHabit',appTargetId:appTargetId,mappingId:mappingId};
    cfg().runtimeHabitControl.softOverride=null;
    if(!opts||!opts.skipPersist) persistQuiet();
  }

  function clearPin(opts){
    ensureRuntimeFields();
    if(!cfg().runtimeHabitControl.pin) return false;
    cfg().runtimeHabitControl.pin=null;
    if(!opts||!opts.skipPersist) persistQuiet();
    return true;
  }

  function fgAppTargetId(identity){
    if(!identity) return '';
    return String(identity.matchedPresetAppId||identity.matched_preset_app_id||identity.appId||'').trim();
  }

  function resolveActiveSceneId(identity,opts){
    ensureRuntimeFields();
    identity=identity||lastFgIdentity;
    var pin=getPin();

    if(pin&&pin.kind==='habit'&&pin.mappingId){
      var pm=mappingById(pin.mappingId);
      if(pm) return pin.mappingId;
    }

    if(pin&&pin.kind==='appHabit'&&pin.mappingId&&identity){
      if(fgAppTargetId(identity)===String(pin.appTargetId||'').trim()){
        var am=mappingById(pin.mappingId);
        if(am) return pin.mappingId;
      }
    }

    if(isSoftOverrideValid(identity)){
      return getSoftOverride().mappingId;
    }
    if(getSoftOverride()){
      clearSoftOverride(Object.assign({},opts,{skipPersist:!!(opts&&opts.skipPersist)}));
      if(!(opts&&opts.skipPersist)) persistQuiet();
    }

    var c=cfg();
    if(c&&c.followForegroundAppScenario&&identity){
      return autoSceneIdForIdentity(identity)||String(c.activeSceneId||'').trim();
    }

    return String(c&&c.activeSceneId||'').trim();
  }

  function resolveRuntimeHabitDisplay(identity){
    ensureRuntimeFields();
    identity=identity||lastFgIdentity;
    var activeId=String(cfg()&&cfg().activeSceneId||'').trim();
    var activeM=mappingById(activeId);
    var name=habitName(activeM);
    var pin=getPin();
    var so=getSoftOverride();

    if(pin&&pin.kind==='habit'&&pin.mappingId){
      var pm=mappingById(pin.mappingId);
      return {
        mode:'pinHabit',
        mappingId:pin.mappingId,
        habitName:habitName(pm),
        badgeLabel:t('runtimeHabitPinAll','已锁定: {name}').replace('{name}',habitName(pm)),
        tooltip:t('runtimeHabitPinAllTip','全部应用都会用这个习惯；自动切换已暂停。'),
        canClearPin:true,
        canClearOverride:false
      };
    }

    if(pin&&pin.kind==='appHabit'&&pin.mappingId&&identity
      &&fgAppTargetId(identity)===String(pin.appTargetId||'').trim()){
      var am=mappingById(pin.mappingId);
      var appLbl=fgAppTargetId(identity);
      var rules=global.OneToneAppBehaviorRules;
      if(rules&&rules.appDisplayName) appLbl=rules.appDisplayName(pin.appTargetId)||appLbl;
      return {
        mode:'pinAppHabit',
        mappingId:pin.mappingId,
        habitName:habitName(am),
        appName:appLbl,
        badgeLabel:t('runtimeHabitPinApp','在 {app} 锁定: {name}')
          .replace('{app}',appLbl).replace('{name}',habitName(am)),
        tooltip:t('runtimeHabitPinAppTip','只有打开 '+appLbl+' 时用这个习惯；其他应用仍自动跟随前台。'),
        canClearPin:true,
        canClearOverride:false
      };
    }

    if(so&&so.mappingId&&isSoftOverrideValid(identity)){
      var sm=mappingById(so.mappingId);
      return {
        mode:'softOverride',
        mappingId:so.mappingId,
        habitName:habitName(sm),
        badgeLabel:t('runtimeHabitTempPick','临时选用'),
        tooltip:t('runtimeHabitTempPickTip','你临时选用了 {name}。切到别的应用时自动恢复跟随前台。')
          .replace('{name}',habitName(sm)),
        canClearPin:false,
        canClearOverride:true
      };
    }

    if(so&&so.mappingId&&!isSoftOverrideValid(identity)){
      return {
        mode:'auto',
        mappingId:activeId,
        habitName:name,
        badgeLabel:'',
        tooltip:t('runtimeHabitAutoTip','正在跟随前台应用自动切换习惯。'),
        canClearPin:false,
        canClearOverride:false,
        staleOverride:true
      };
    }

    var follow=!!(cfg()&&cfg().followForegroundAppScenario);
    return {
      mode:follow?'auto':'manual',
      mappingId:activeId,
      habitName:name,
      badgeLabel:follow?'':t('runtimeHabitManual','手动'),
      tooltip:follow
        ?t('runtimeHabitAutoTip','正在跟随前台应用自动切换习惯。')
        :t('runtimeHabitManualTip','已关闭自动切换；正在使用所选习惯。'),
      canClearPin:false,
      canClearOverride:false
    };
  }

  global.OneToneRuntimeHabitControl={
    fgSignatureFromIdentity:fgSignatureFromIdentity,
    noteForegroundIdentity:noteForegroundIdentity,
    foregroundIdentity:foregroundIdentity,
    getSoftOverride:getSoftOverride,
    getPin:getPin,
    setSoftOverride:setSoftOverride,
    clearSoftOverride:clearSoftOverride,
    setPinHabit:setPinHabit,
    setPinAppHabit:setPinAppHabit,
    clearPin:clearPin,
    resolveActiveSceneId:resolveActiveSceneId,
    resolveRuntimeHabitDisplay:resolveRuntimeHabitDisplay,
    autoSceneIdForIdentity:autoSceneIdForIdentity
  };
})((typeof window!=='undefined')?window:globalThis);
