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
    var keepApp=String(m.appTargetId||'').trim();
    if(source==='record'&&global.OneToneAppTargetPresets&&global.OneToneAppTargetPresets.applyRecordedVoiceShortcut){
      global.OneToneAppTargetPresets.applyRecordedVoiceShortcut(m,combo);
      m.targetActions=[];
      try{
        if(m.captureHeroRef&&String(m.captureHeroRef.kind||'').toLowerCase()==='customkey'){
          m.captureHeroRef=null;
        }
      }catch(_){}
      if(!presetId) syncImeSelection('');
    }else if(source==='ime'){
      // IME strip: set recognition key + preset; never strip app scenario into 通用设置.
      // Replaces any prior「我录的键」sequence on this habit.
      m.imePresetId=presetId;
      m.targetKey=combo;
      m.targetActions=[];
      try{
        var picker=global.OneToneKeysChannelCommandPicker;
        if(picker&&typeof picker.clearCustomKeyRecognition==='function'){
          picker.clearCustomKeyRecognition(m);
        }else if(m.captureHeroRef&&String(m.captureHeroRef.kind||'').toLowerCase()==='customkey'){
          m.captureHeroRef=null;
        }
      }catch(_){}
      if(keepApp&&global.OneToneAppTargetPresets&&global.OneToneAppTargetPresets.applyVoiceShortcutKeys){
        global.OneToneAppTargetPresets.applyVoiceShortcutKeys(combo,{skipConfirm:true});
      }
      syncImeSelection(presetId);
    }else{
      // Manual picker: set recognition key only — never strip app scenario
      // (same keepApp rule as IME). Clearing appTargetId hid 本场景动作 +
      // emptied「我录的键」list filtered by app.
      m.imePresetId=presetId;
      m.targetKey=combo;
      syncImeSelection(presetId);
    }
    var trig=c.editorTrigger?c.editorTrigger(m):(m.triggerKey||'');
    var labelTarget=m.targetKey||combo;
    m.label=(trig||'?')+' → '+(labelTarget||combo);
    if(ed&&ed.setEditorTargetKey) ed.setEditorTargetKey(m.targetKey||combo);
    if(!skipPersist){
      if(h.save) h.save();
      // Soft Pad / quiet callers: skip full habits remount (drops Soft Pad editDraft).
      if(!opts.skipRender){
        if(h.render) h.render();
        else if(c.renderChrome) c.renderChrome();
      }
      if(source!=='record'&&c.maybeEnableMappingAfterComplete) c.maybeEnableMappingAfterComplete(m);
      if(h.toast&&source!=='record'&&!opts.quiet) h.toast(t(toastKeyForSource(source)));
      if(global.OneToneAppTargetPresets) global.OneToneAppTargetPresets.refresh('mapping');
    }
    try{
      var scene=global.OneToneKeysSceneActionsPanel;
      if(scene&&typeof scene.refresh==='function') scene.refresh();
    }catch(_){}
    return true;
  }

  global.OneToneTargetKeyApply={
    applyCustomMappingTarget:applyCustomMappingTarget
  };
})((typeof window!=='undefined')?window:globalThis);
