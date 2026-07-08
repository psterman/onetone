(function(global){
  'use strict';

  var $=function(id){ return global.OneToneDom.$(id); };
  var t=function(key){ return global.OneToneI18n.t(key); };
  function core(){ return global.OneToneMappingCore; }

  function selectedMapping(){
    return core()&&core().selected?core().selected():null;
  }

  function mappingHasConflict(m){
    if(!m) return false;
    var hooks=global.__vp_key_finish_flow_render_hooks__||{};
    if(hooks.schemeMappingHasConflict) return !!hooks.schemeMappingHasConflict(m);
    if(core()&&core().schemeHasConflict) return !!core().schemeHasConflict(m);
    return false;
  }

  function needsConfirmTiming(m){
    if(!m||!core()||!core().isSaved||!core().isSaved(m)) return false;
    if(global.OneToneSceneFlowSummary&&global.OneToneSceneFlowSummary.resolveFinishMode(m)==='confirm') return true;
    if(Array.isArray(m.appBehaviorRules)){
      for(var i=0;i<m.appBehaviorRules.length;i++){
        var rule=m.appBehaviorRules[i];
        if(rule&&rule.finishMode==='confirm') return true;
      }
    }
    return false;
  }

  function needsImeCompat(m){
    if(!m||!core()||!core().isSaved||!core().isSaved(m)) return false;
    if(String(m.appTargetId||'').trim()) return false;
    return !!String(m.imePresetId||'').trim();
  }

  function imeDisplayName(m){
    var id=String(m&&m.imePresetId||'').trim();
    if(!id||!global.OneToneImePresets) return '';
    var preset=global.OneToneImePresets.presetById?global.OneToneImePresets.presetById(id):null;
    if(preset&&preset.nameKey) return t(preset.nameKey);
    return id;
  }

  function evaluateState(m){
    var conflict=mappingHasConflict(m);
    var confirmTiming=needsConfirmTiming(m);
    var imeCompat=needsImeCompat(m);
    return {
      conflict:conflict,
      confirmTiming:confirmTiming,
      imeCompat:imeCompat,
      hasAny:conflict||confirmTiming||imeCompat
    };
  }

  function syncConfirmTimingVisibility(m){
    var section=$('keyExecFinishTimingSection');
    if(!section) return;
    var drawer=global.OneToneSettingsDrawer;
    var onKeysPanel=drawer&&drawer.isKeysPanel&&drawer.isKeysPanel();
    if(onKeysPanel||!m||!core()||!core().isSaved||!core().isSaved(m)){
      section.hidden=true;
      return;
    }
    if(core().ensureMappingTiming) core().ensureMappingTiming(m);
    section.hidden=!needsConfirmTiming(m);
  }

  function renderKeysAdvanced(){
    var m=selectedMapping();
    var st=evaluateState(m);
    var imeBlock=$('keysAdvIme');
    var imeText=$('keysAdvImeText');
    if(imeBlock){
      imeBlock.hidden=!st.imeCompat;
      if(imeText){
        var imeName=imeDisplayName(m);
        imeText.textContent=imeName
          ?t('habitCompatImeWarn').replace('{ime}',imeName)
          :t('voiceEndCompatWarn');
      }
    }
    if(global.OneToneMappingCore&&global.OneToneMappingCore.renderConflictBanner){
      global.OneToneMappingCore.renderConflictBanner();
    }
  }

  function render(){
    var m=selectedMapping();
    var st=evaluateState(m);
    var body=$('habitAdvancedBody');
    var empty=$('habitCompatEmpty');
    var conflict=$('habitAdvancedConflict');
    var imeBlock=$('habitCompatImeBlock');

    if(body) body.classList.toggle('is-compat-empty',!st.hasAny);
    if(empty){
      empty.hidden=st.hasAny;
      empty.textContent=t('habitCompatEmpty');
    }

    if(conflict){
      conflict.hidden=!st.conflict;
      var titleEl=$('habitCompatConflictTitle');
      var statusEl=$('habitAdvancedConflictStatus');
      var btn=$('btnHabitAdvancedConflict');
      if(titleEl) titleEl.textContent=t('habitCompatConflictTitle');
      if(btn) btn.textContent=t('habitAdvancedConflict');
      if(statusEl){
        statusEl.textContent=st.conflict?t('habitCompatConflictDesc'):t('habitAdvancedConflictOff');
        statusEl.classList.toggle('is-alert',st.conflict);
      }
    }

    syncConfirmTimingVisibility(m);
    var confirmTitle=$('habitCompatConfirmTitle');
    if(confirmTitle) confirmTitle.textContent=t('habitCompatConfirmTitle');

    if(imeBlock){
      imeBlock.hidden=!st.imeCompat;
      var imeTitle=$('habitCompatImeTitle');
      var imeText=$('habitCompatImeText');
      if(imeTitle) imeTitle.textContent=t('habitAdvancedImeTitle');
      if(imeText){
        var imeName=imeDisplayName(m);
        imeText.textContent=imeName
          ?t('habitCompatImeWarn').replace('{ime}',imeName)
          :t('voiceEndCompatWarn');
      }
    }
  }

  function bindEvents(){
    var btn=$('btnHabitAdvancedConflict');
    if(btn){
      btn.addEventListener('click',function(e){
        e.preventDefault();
        e.stopPropagation();
        if(global.OneToneHabitLayerNav) global.OneToneHabitLayerNav.setHabitLayer('global');
        if(global.OneToneHabitLayerNav) global.OneToneHabitLayerNav.setHabitLayer('advanced');
        var section=$('habitAdvancedConflict');
        if(section&&!section.hidden) section.scrollIntoView({behavior:'smooth',block:'nearest'});
        else{
          var banner=$('conflictBanner');
          if(banner) banner.scrollIntoView({behavior:'smooth',block:'center'});
        }
      });
    }
  }

  global.OneToneHabitCompatibility={
    render:render,
    renderKeysAdvanced:renderKeysAdvanced,
    bindEvents:bindEvents,
    needsConfirmTiming:needsConfirmTiming,
    evaluateState:evaluateState,
    mappingHasConflict:mappingHasConflict
  };
})((typeof window!=='undefined')?window:globalThis);
