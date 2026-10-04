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

  /** Read-only peek — no ensureRuntimeFields (calculate must not mutate cfg). */
  function peekControl(){
    var c=cfg();
    var rh=c&&c.runtimeHabitControl;
    if(!rh||typeof rh!=='object') return {softOverride:null,pin:null};
    return rh;
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

  function isSelfOrTrayNoise(identity){
    if(!identity) return true;
    var exe=String(identity.exeName||identity.exe_name||'').toLowerCase();
    if(exe.indexOf('onetone')>=0) return true;
    var path=String(identity.fullPath||identity.full_path||'').toLowerCase();
    if(path.indexOf('onetone')>=0||path.indexOf('voice-pilot')>=0) return true;
    return exe==='explorer.exe'
      ||exe==='shellexperiencehost.exe'
      ||exe==='startmenuexperiencehost.exe'
      ||exe==='searchhost.exe'
      ||exe==='applicationframehost.exe'
      ||exe==='textinputhost.exe'
      ||exe==='lockapp.exe'
      ||exe==='systemsettings.exe';
  }

  function noteForegroundIdentity(identity){
    if(!(identity&&(identity.exeName||identity.exe_name||identity.fullPath||identity.full_path))){
      return;
    }
    // Keep last real external app while OneTone itself (or tray shell) is focused.
    // Noting self would flip habit runtime every poll and flicker the homepage.
    if(isSelfOrTrayNoise(identity)) return;
    var nextSig=fgSignatureFromIdentity(identity);
    var prevSig=fgSignatureFromIdentity(lastFgIdentity);
    var same=!!lastFgIdentity&&nextSig===prevSig
      &&fgAppTargetId(identity)===fgAppTargetId(lastFgIdentity);
    lastFgIdentity=identity;
    if(same) return;
    var facade=global.OneToneHabitRuntime;
    if(facade&&facade.notify){
      try{ facade.notify('foreground',{}); }catch(_){}
    }
  }

  function foregroundIdentity(){
    return lastFgIdentity;
  }

  function isSoftOverrideValid(identity,so){
    so=so||getSoftOverride();
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

  /**
   * Pure effective-scene calculation. Does not mutate cfg / persist / clear override.
   * @returns {{ resolvedId:string, mode:string, staleOverride:boolean, pin:object|null, softOverride:object|null }}
   */
  function calculateEffectiveScene(identity){
    identity=identity||lastFgIdentity;
    var c=cfg();
    var rh=peekControl();
    var pin=rh.pin||null;
    var soRaw=rh.softOverride;
    var so=(soRaw&&soRaw.mappingId)
      ?{mappingId:String(soRaw.mappingId),fgSignature:String(soRaw.fgSignature||'')}
      :null;
    var activeId=String(c&&c.activeSceneId||'').trim();

    if(pin&&pin.kind==='habit'&&pin.mappingId){
      var pm=mappingById(pin.mappingId);
      if(pm){
        return {
          resolvedId:String(pin.mappingId),
          mode:'pinHabit',
          staleOverride:false,
          pin:pin,
          softOverride:so
        };
      }
    }

    if(pin&&pin.kind==='appHabit'&&pin.mappingId&&identity){
      if(fgAppTargetId(identity)===String(pin.appTargetId||'').trim()){
        var am=mappingById(pin.mappingId);
        if(am){
          return {
            resolvedId:String(pin.mappingId),
            mode:'pinAppHabit',
            staleOverride:false,
            pin:pin,
            softOverride:so
          };
        }
      }
    }

    if(so&&isSoftOverrideValid(identity,so)){
      return {
        resolvedId:so.mappingId,
        mode:'softOverride',
        staleOverride:false,
        pin:pin,
        softOverride:so
      };
    }

    var stale=!!(so&&so.mappingId&&!isSoftOverrideValid(identity,so));

    if(c&&c.followForegroundAppScenario&&identity){
      return {
        resolvedId:autoSceneIdForIdentity(identity)||activeId,
        mode:'auto',
        staleOverride:stale,
        pin:pin,
        softOverride:so
      };
    }

    return {
      resolvedId:activeId,
      mode:c&&c.followForegroundAppScenario?'auto':'manual',
      staleOverride:stale,
      pin:pin,
      softOverride:so
    };
  }

  /**
   * Apply side effects from calculate (clear stale softOverride + persist).
   * @returns {{ cleared:boolean }}
   */
  function reconcileRuntimeHabitState(opts){
    ensureRuntimeFields();
    var identity=opts&&opts.identity!==undefined?opts.identity:lastFgIdentity;
    var calc=calculateEffectiveScene(identity);
    if(!calc.staleOverride) return {cleared:false};
    clearSoftOverride({skipPersist:true});
    if(!(opts&&opts.skipPersist)) persistQuiet();
    var facade=global.OneToneHabitRuntime;
    if(facade&&facade.notify){
      try{ facade.notify('override',{reason:'stale_cleared'}); }catch(_){}
    }
    return {cleared:true};
  }

  /** @deprecated Prefer OneToneHabitRuntime + calculateEffectiveScene / reconcileRuntimeHabitState */
  function resolveActiveSceneId(identity,opts){
    ensureRuntimeFields();
    identity=identity||lastFgIdentity;
    var calc=calculateEffectiveScene(identity);
    if(calc.staleOverride){
      reconcileRuntimeHabitState(Object.assign({},opts,{identity:identity}));
      calc=calculateEffectiveScene(identity);
    }
    return calc.resolvedId;
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
    calculateEffectiveScene:calculateEffectiveScene,
    reconcileRuntimeHabitState:reconcileRuntimeHabitState,
    resolveActiveSceneId:resolveActiveSceneId,
    resolveRuntimeHabitDisplay:resolveRuntimeHabitDisplay,
    autoSceneIdForIdentity:autoSceneIdForIdentity
  };
})((typeof window!=='undefined')?window:globalThis);
