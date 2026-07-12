(function(global){
  'use strict';

  function hooks(){
    return global.__vp_bootstrap_hooks__ || {};
  }

  function core(){
    return global.OneToneMappingCore;
  }

  function t(key){
    return global.OneToneI18n ? global.OneToneI18n.t(key) : key;
  }

  function sanitizeCombo(combo){
    var h=hooks();
    if(h.sanitizeTargetCombo) return h.sanitizeTargetCombo(combo);
    return String(combo||'').trim();
  }

  function isAllowed(combo){
    var h=hooks();
    if(h.isAllowedTargetKey) return !!h.isAllowedTargetKey(combo);
    return !!String(combo||'').trim();
  }

  function toastKeyForSource(source){
    if(source==='ime') return 'imePresetApplied';
    if(source==='record') return 'logTargetDone';
    return 'targetKeyPickerApplied';
  }

  function syncImeSelection(presetId){
    if(!global.OneToneImePresets) return;
    if(presetId){
      var st=global.OneToneState&&global.OneToneState.state;
      if(st&&st.config) st.config.imePresetId=presetId;
      if(global.OneToneImePresets.refresh) global.OneToneImePresets.refresh('mapping');
      return;
    }
    if(global.OneToneImePresets.clearSelectedForManualRecord){
      global.OneToneImePresets.clearSelectedForManualRecord('mapping');
    }
  }

  function applyCustomMappingTarget(combo,opts){
    opts=opts||{};
    var source=opts.source||'picker';
    var skipPersist=!!opts.skipPersist;
    var presetId=opts.presetId!=null?String(opts.presetId).trim():'';
    var c=core();
    var h=hooks();
    var ed=global.OneToneMappingEditorState;
    if(!c||!c.selected) return false;
    combo=sanitizeCombo(combo);
    if(!combo) return false;
    if(!isAllowed(combo)){
      if(h.toast) h.toast(t('leftMouseRejected'));
      return false;
    }
    var m=opts.mapping||c.selected();
    if(!m) return false;
    if(source==='record'&&global.OneToneAppTargetPresets&&global.OneToneAppTargetPresets.applyRecordedVoiceShortcut){
      global.OneToneAppTargetPresets.applyRecordedVoiceShortcut(m,combo);
      if(!presetId) syncImeSelection('');
    }else{
      m.imePresetId=presetId;
      m.targetKey=combo;
      m.appTargetId='';
      syncImeSelection(presetId);
    }
    var trig=c.editorTrigger?c.editorTrigger(m):(m.triggerKey||'');
    var labelTarget=m.targetKey||combo;
    m.label=(trig||'?')+' → '+(labelTarget||combo);
    if(ed&&ed.setEditorTargetKey) ed.setEditorTargetKey(m.targetKey||combo);
    if(!skipPersist){
      if(h.save) h.save();
      if(h.render) h.render();
      else if(c.renderChrome) c.renderChrome();
      if(source!=='record'&&c.maybeEnableMappingAfterComplete) c.maybeEnableMappingAfterComplete(m);
      if(h.toast&&source!=='record') h.toast(t(toastKeyForSource(source)));
      if(global.OneToneAppTargetPresets) global.OneToneAppTargetPresets.refresh('mapping');
    }
    return true;
  }

  global.OneToneTargetKeyApply={
    applyCustomMappingTarget:applyCustomMappingTarget
  };
})((typeof window!=='undefined')?window:globalThis);
