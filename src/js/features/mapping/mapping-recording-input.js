(function(global){
  'use strict';
  var OneToneMappingCore=global.OneToneMappingCore;
  var $=function(id){ return global.OneToneDom.$(id); };
  var t=function(key){ return global.OneToneI18n.t(key); };
  function Rec(){ return global.OneToneMappingRecording; }
  function hooks(){ return global.__vp_mapping_recording_input_hooks__ || {}; }
  var cap={pendingModifier:'',mods:{ctrl:false,shift:false,alt:false,meta:false},modSide:{ctrl:'',shift:'',alt:'',meta:''}};
  function containsLeftMouse(key){
    var util=global.OneToneAppKeyUtils;
    if(util&&util.containsLeftMouseToken) return util.containsLeftMouseToken(key);
    return false;
  }
  function rejectLeftMouseRecording(mode, key, sourceKey, source){
    key=String(key||'').trim();
    sourceKey=String(sourceKey||'').trim();
    var hasLeft=containsLeftMouse(key)||containsLeftMouse(sourceKey);
    if(!hasLeft){
      var evt=source&&Array.isArray(source.rawEvents)&&source.rawEvents[0];
      hasLeft=!!(evt&&containsLeftMouse(evt.hotkey||evt.key||evt.code||''));
    }
    if(!hasLeft) return false;
    if(mode==='trigger'&&hooks().shouldIgnoreTriggerLeftClickCapture(key,sourceKey,source)) return true;
    if(mode==='target'&&hooks().shouldIgnoreTargetLeftClickCapture(key,sourceKey,source)) return true;
    hooks().toast(t('leftMouseRejected'));
    hooks().pushLog('[record] reject left click as '+mode);
    if(mode==='trigger'){
      Rec().updatePreview('trigger','');
      if($('triggerState')) $('triggerState').textContent=t('triggerRecordHint');
    }else{
      Rec().updatePreview('target','');
      if($('targetState')) $('targetState').textContent=t('targetRecordHint');
    }
    return true;
  }
  function webEventToPhysicalKey(key,code){
    const media=hooks().normalizeMediaTargetKey(code,key);
    if(media) return media;
    const c=String(code||'');
    const k=String(key||'');
    if(c==='ArrowUp'||k==='ArrowUp') return 'Up';
    if(c==='ArrowDown'||k==='ArrowDown') return 'Down';
    if(c==='ArrowLeft'||k==='ArrowLeft') return 'Left';
    if(c==='ArrowRight'||k==='ArrowRight') return 'Right';
    return normalizeKeyFromCode(c,k)||k||c;
  }
  function normalizeMouseButton(button){
    switch(button){
      case 0: return 'LButton';
      case 1: return 'MButton';
      case 2: return 'RButton';
      case 3: return 'XButton1';
      case 4: return 'XButton2';
      default: return '';
    }
  }
  function normalizeKeyFromCode(code, key){
    const c=String(code||'');
    const k=String(key||'');
    const map={
      Backspace:'Backspace',Tab:'Tab',Enter:'Enter',NumpadEnter:'NumpadEnter',Escape:'Esc',Space:'Space',
      Minus:'-',Equal:'=',BracketLeft:'[',BracketRight:']',Backslash:'\\',Semicolon:';',Quote:"'",Comma:',',Period:'.',Slash:'/',
      Insert:'Insert',Delete:'Delete',Home:'Home',End:'End',PageUp:'PageUp',PageDown:'PageDown',
      ArrowUp:'Up',ArrowDown:'Down',ArrowLeft:'Left',ArrowRight:'Right',
      PrintScreen:'PrintScreen',ScrollLock:'ScrollLock',Pause:'Pause',CapsLock:'CapsLock',ContextMenu:'AppsKey'
    };
    if(Object.prototype.hasOwnProperty.call(map, c)) return map[c];
    if(/^Digit\d$/.test(c)) return c.slice(5);
    if(/^Numpad\d$/.test(c)) return c;
    if(/^Key[A-Z]$/.test(c)) return c.slice(3);
    if(/^F\d{1,2}$/.test(c)) return c;
    if(c==='AltLeft') return 'LAlt';
    if(c==='AltRight') return 'RAlt';
    if(c==='ControlLeft') return 'LCtrl';
    if(c==='ControlRight') return 'RCtrl';
    if(c==='ShiftLeft') return 'LShift';
    if(c==='ShiftRight') return 'RShift';
    if(c==='MetaLeft') return 'LWin';
    if(c==='MetaRight') return 'RWin';
    if(k && !['Control','Shift','Alt','Meta','OS'].includes(k)) return k;
    return c || k;
  }

  function normalizeStandaloneModifier(code){
    switch(String(code||'')){
      case 'ControlLeft': return 'LCtrl';
      case 'ControlRight': return 'RCtrl';
      case 'ShiftLeft': return 'LShift';
      case 'ShiftRight': return 'RShift';
      case 'AltLeft': return 'LAlt';
      case 'AltRight': return 'RAlt';
      case 'MetaLeft': return 'LWin';
      case 'MetaRight': return 'RWin';
      default: return '';
    }
  }

  function normalizeTargetCombination(mods, mainKey, modSide){
    const side=modSide||{};
    const parts=[];
    function sideName(flag, specific, generic){
      if(!flag) return '';
      if(specific&&specific!=='Ctrl'&&specific!=='Shift'&&specific!=='Alt'&&specific!=='Win') return specific;
      return generic;
    }
    const ctrl=sideName(mods.ctrl, side.ctrl, 'Ctrl');
    const shift=sideName(mods.shift, side.shift, 'Shift');
    const alt=sideName(mods.alt, side.alt, 'Alt');
    const win=sideName(mods.meta, side.meta, 'Win');
    if(ctrl) parts.push(ctrl);
    if(shift) parts.push(shift);
    if(alt) parts.push(alt);
    if(win) parts.push(win);
    if(mainKey) parts.push(mainKey);
    return parts.join('+');
  }

  function isTargetModifierToken(tok){
    return ['LCtrl','RCtrl','LShift','RShift','LAlt','RAlt','LWin','RWin','Ctrl','Shift','Alt','Win'].indexOf(String(tok||''))>=0;
  }

  function sanitizeTargetCombo(combo){
    const raw=String(combo||'').trim();
    if(!raw) return '';
    const side=cap.modSide||{};
    let parts=raw.split('+').map(function(p){ return p.trim(); }).filter(Boolean);
    parts=parts.map(function(p){
      if(p==='Shift'&&side.shift) return side.shift;
      if(p==='Alt'&&side.alt) return side.alt;
      if(p==='Ctrl'&&side.ctrl) return side.ctrl;
      if(p==='Win'&&side.meta) return side.meta;
      return p;
    });
    const out=[];
    parts.forEach(function(p){
      if(out.indexOf(p)<0) out.push(p);
    });
    if(out.length===1) return out[0];
    if(out.length===2&&out[0]===out[1]) return out[0];
    if(out.length>1&&out.every(isTargetModifierToken)) return out[out.length-1];
    return out.join('+');
  }

  function isModifierCode(code){
    return ['ControlLeft','ControlRight','ShiftLeft','ShiftRight','AltLeft','AltRight','MetaLeft','MetaRight'].includes(String(code||''));
  }
  function resetTargetCapture(){
    cap.pendingModifier='';
    cap.mods={ctrl:false,shift:false,alt:false,meta:false};
    cap.modSide={ctrl:'',shift:'',alt:'',meta:''};
  }

  function noteModifierSide(code){
    const side=normalizeStandaloneModifier(code);
    if(!side) return;
    if(code.startsWith('Control')) cap.modSide.ctrl=side;
    else if(code.startsWith('Shift')) cap.modSide.shift=side;
    else if(code.startsWith('Alt')) cap.modSide.alt=side;
    else if(code.startsWith('Meta')) cap.modSide.meta=side;
  }

  function tryEscapeRecording(e){
    if(e.key!=='Escape') return false;
    if(Rec().mode()!=='none'){ e.preventDefault(); Rec().cancel(); return true; }
    const m=OneToneMappingCore.selected();
    if(m&&OneToneMappingCore.isDraft(m)){ e.preventDefault(); OneToneMappingCore.removeDraft(m.id); return true; }
    return false;
  }

  function handleKeyDown(e){
    if(Rec().mode()==='none'){
    const physical=webEventToPhysicalKey(e.key,e.code);
    if(Rec().isHardwareCaptureToken(physical)){
    e.preventDefault();
    e.stopPropagation();
    try{window.chrome?.webview?.postMessage({type:'mvp_physical_trigger', key:physical});}catch(_){ }
    return;
    }
    }
    if(Rec().mode()==='trigger'){
    const code=String(e.code||'');
    const key=String(e.key||'');
    if(Date.now()<hooks().triggerPeripheralGuardUntil()&&isTargetModifierToken(normalizeStandaloneModifier(code)||normalizeKeyFromCode(code,key)||key)){
    return;
    }
    e.preventDefault();
    e.stopPropagation();
    if(Rec().isHardwareDelegatedTriggerKey(key,code)){
    const physical=webEventToPhysicalKey(key,code)||key;
    $('triggerState').textContent=t('triggerRecordDetected')+hooks().friendlyKeyName(physical);
    hooks().pushLog(t('triggerRecordDetected')+hooks().friendlyKeyName(physical));
    Rec().finishDetectedHardwareTrigger(physical);
    return;
    }
    const mods={ctrl:e.ctrlKey,shift:e.shiftKey,alt:e.altKey,meta:e.metaKey};
    if(isModifierCode(code)){
    cap.pendingModifier=code;
    cap.mods=mods;
    noteModifierSide(code);
    const standalone=normalizeStandaloneModifier(code);
    $('triggerState').textContent=t('comboHint')+(standalone||'');
    hooks().pushLog(t('logWaitMain'));
    if(standalone) Rec().updatePreview('trigger',standalone);
    return;
    }
    const main=normalizeKeyFromCode(code, key);
    const combo=normalizeTargetCombination(mods, main, cap.modSide);
    if(combo){
    $('triggerState').textContent=t('triggerRecordDetected')+hooks().friendlyKeyName(combo);
    Rec().finishFrontendTrigger(combo);
    }
    return;
    }
    if(Rec().mode()==='target'){
    e.preventDefault();
    e.stopPropagation();
    const code=String(e.code||'');
    const key=String(e.key||'');
    const media=hooks().normalizeMediaTargetKey(code,key);
    if(media){
    Rec().finishTarget(media);
    return;
    }
    const mods={ctrl:e.ctrlKey,shift:e.shiftKey,alt:e.altKey,meta:e.metaKey};
    if(isModifierCode(code)){
    cap.pendingModifier=code;
    cap.mods=mods;
    noteModifierSide(code);
    const standalone=normalizeStandaloneModifier(code);
    $('targetState').textContent=t('comboHint');
    hooks().pushLog(t('logWaitMain'));
    if(standalone) Rec().updatePreview('target',standalone);
    return;
    }
    const main=normalizeKeyFromCode(code, key);
    const combo=sanitizeTargetCombo(normalizeTargetCombination(mods, main, cap.modSide));
    if(combo){
    Rec().updatePreview('target',combo);
    Rec().finishTarget(combo);
    }
    return;
    }
    if(Rec().mode()==='schemeSwitch'){
    e.preventDefault();
    e.stopPropagation();
    const code=String(e.code||'');
    const key=String(e.key||'');
    const media=hooks().normalizeMediaTargetKey(code,key);
    if(media){
    Rec().finishSchemeSwitch(media);
    return;
    }
    const mods={ctrl:e.ctrlKey,shift:e.shiftKey,alt:e.altKey,meta:e.metaKey};
    if(isModifierCode(code)){
    cap.pendingModifier=code;
    cap.mods=mods;
    noteModifierSide(code);
    hooks().pushLog(t('logWaitMain'));
    return;
    }
    const main=normalizeKeyFromCode(code, key);
    const combo=normalizeTargetCombination(mods, main, cap.modSide);
    if(combo) Rec().finishSchemeSwitch(combo);
    return;
    }
    if(Rec().mode()==='mappingSwitch'){
    e.preventDefault();
    e.stopPropagation();
    const code=String(e.code||'');
    const key=String(e.key||'');
    const media=hooks().normalizeMediaTargetKey(code,key);
    if(media){
    Rec().finishMappingSwitch(media);
    return;
    }
    const mods={ctrl:e.ctrlKey,shift:e.shiftKey,alt:e.altKey,meta:e.metaKey};
    if(isModifierCode(code)){
    cap.pendingModifier=code;
    cap.mods=mods;
    noteModifierSide(code);
    hooks().pushLog(t('logWaitMain'));
    return;
    }
    const main=normalizeKeyFromCode(code, key);
    const combo=normalizeTargetCombination(mods, main, cap.modSide);
    if(combo) Rec().finishMappingSwitch(combo);
    return;
    }
    if(Rec().mode()==='nativeRestore'){
    e.preventDefault();
    e.stopPropagation();
    const code=String(e.code||'');
    const key=String(e.key||'');
    if(Rec().isHardwareDelegatedTriggerKey(key,code)){
    const physical=webEventToPhysicalKey(key,code);
    if(!physical) return true;
    const source=hooks().buildPeripheralTriggerSource(physical);
    Rec().finishNativeRestore(physical,source);
    }
    return true;
    }
    return false;
  }

  function handleMouseDown(e){
    if(Rec().mode()!=='target'&&Rec().mode()!=='trigger') return;
    if(e&&e.target&&e.target.closest){
      if(e.target.closest('#btnCancelRecord,.btn-cancel-record')) return;
    }
    e.preventDefault();
    e.stopPropagation();
    const btn=normalizeMouseButton(e.button);
    if(!btn) return;
    const mods={ctrl:e.ctrlKey,shift:e.shiftKey,alt:e.altKey,meta:e.metaKey};
    const combo=sanitizeTargetCombo(normalizeTargetCombination(mods, btn, cap.modSide));
    if(rejectLeftMouseRecording(Rec().mode(), combo, btn, null)) return;
    if(Rec().mode()==='trigger'){
    $('triggerState').textContent=t('triggerRecordDetected')+hooks().friendlyKeyName(combo);
    Rec().finishFrontendTrigger(combo);
    return;
    }
    Rec().finishTarget(combo);
  }

  function handleKeyUp(e){
    if(Rec().mode()!=='target'&&Rec().mode()!=='schemeSwitch'&&Rec().mode()!=='mappingSwitch'&&Rec().mode()!=='trigger') return;
    const code=String(e.code||'');
    if(!isModifierCode(code)) return;
    if(cap.pendingModifier===code){
    const modifierName=normalizeStandaloneModifier(code);
    if(modifierName){
    if(Rec().mode()==='schemeSwitch') Rec().finishSchemeSwitch(modifierName);
    else if(Rec().mode()==='mappingSwitch') Rec().finishMappingSwitch(modifierName);
    else if(Rec().mode()==='trigger'){
    e.preventDefault();
    e.stopPropagation();
    $('triggerState').textContent=t('triggerRecordDetected')+hooks().friendlyKeyName(modifierName);
    Rec().finishFrontendTrigger(modifierName);
    }
    else{
    Rec().updatePreview('target',sanitizeTargetCombo(modifierName));
    Rec().finishTarget(sanitizeTargetCombo(modifierName));
    }
    }
    cap.pendingModifier='';
    }
  }

  function handleWebViewMessage(msg){
    if(!msg||typeof msg!=='object') return false;
    const type=msg.type||'';
    if(type==='mvp_record_rejected'){
    var reason=String(msg.reason||'');
    hooks().toast(reason.indexOf('left_mouse')>=0||reason.indexOf('mouse')>=0?t('leftMouseRejected'):t('whitelistRejected'));
    Rec().cancel();
    return true;
    }
    if(type==='mvp_record_seen'){
    if(Rec().mode()!=='none') hooks().playSoundCue('record');
    const seen=msg.key||'?';
    if(Rec().mode()==='trigger'){
    if(rejectLeftMouseRecording('trigger', seen, seen, null)) return true;
    const preview=Rec().previewCaptureKey('trigger',seen);
    Rec().updatePreview('trigger',preview);
    Rec().notifyOnboardingPreview('trigger',preview);
    $('triggerState').textContent=t('triggerRecordDetected')+hooks().friendlyKeyName(preview);
    }else if(Rec().mode()==='target'){
    if(rejectLeftMouseRecording('target', seen, seen, null)) return true;
    const preview=Rec().previewCaptureKey('target',seen);
    Rec().updatePreview('target',preview);
    Rec().notifyOnboardingPreview('target',preview);
    $('targetState').textContent=t('triggerRecordDetected')+hooks().friendlyKeyName(preview);
    }else if(Rec().mode()==='nativeRestore'){
    $('triggerState').textContent=t('triggerRecordDetected')+hooks().friendlyKeyName(seen);
    }
    hooks().pushLog(t('triggerRecordDetected')+hooks().friendlyKeyName(seen));
    if(Rec().mode()==='trigger' && Rec().isHardwareCaptureToken(seen)){
    hooks().armTriggerPeripheralGuard(450);
    Rec().finishDetectedHardwareTrigger(seen, msg.device||'');
    }
    return true;
    }
    if(type==='mvp_record_pending'){
    const seen=msg.displayKey||'?';
    if(Rec().mode()==='trigger'){
    const preview=Rec().previewCaptureKey('trigger',seen);
    Rec().updatePreview('trigger',preview);
    Rec().notifyOnboardingPreview('trigger',preview);
    $('triggerState').textContent=t('comboHint')+hooks().friendlyKeyName(preview);
    }else if(Rec().mode()==='target'){
    if(rejectLeftMouseRecording('target', seen, seen, null)) return true;
    const preview=Rec().previewCaptureKey('target',seen);
    Rec().updatePreview('target',preview);
    Rec().notifyOnboardingPreview('target',preview);
    $('targetState').textContent=t('comboHint');
    }
    return true;
    }
    if(type==='mvp_key_captured'){
    const key=msg.key||'AutoTrigger';
    const captureMode=msg.mode||'trigger';
    if(captureMode==='agentBinding'){
    if(Rec().mode()==='trigger'){
    if(rejectLeftMouseRecording('trigger', key, msg.sourceKey||'', msg.source||null)) return true;
    Rec().finishAgentBinding(key, msg.sourceKey||'', msg.source||null);
    }
    return true;
    }
    if(captureMode==='trigger'){
    if(Rec().mode()==='trigger'){
    if(rejectLeftMouseRecording('trigger', key, msg.sourceKey||'', msg.source||null)) return true;
    if(Date.now()<hooks().triggerPeripheralGuardUntil()&&isTargetModifierToken(key)&&key!=='AutoTrigger'){
    return true;
    }
    Rec().finishTrigger(key, msg.source||null, msg.sourceKey||'', msg.sourceTime||'');
    }else if(Rec().applyBackendKeyCapture(msg)){
    Rec().clearMappingGuard();
    Rec().clearTimer();
    Rec().clearSnapshot();
    Rec().setMappingId('');
    Rec().setRecording('none');
    hooks().save();
    hooks().render();
    Rec().notifyOnboardingCapture('trigger',msg);
    }
    return true;
    }
    if(captureMode==='target'){
    if(Rec().mode()==='target'){
    if(rejectLeftMouseRecording('target', key, msg.sourceKey||'', msg.source||null)) return true;
    const sanitized=sanitizeTargetCombo(key);
    if(sanitized) Rec().finishTarget(sanitized, msg.mappingId||'');
    }else if(Rec().applyBackendKeyCapture(msg)){
    Rec().clearMappingGuard();
    Rec().clearTimer();
    Rec().clearSnapshot();
    Rec().setMappingId('');
    Rec().setRecording('none');
    hooks().save();
    hooks().render();
    Rec().notifyOnboardingCapture('target',msg);
    if(global.OneToneHabitTriggerSetup&&global.OneToneHabitTriggerSetup.onTargetCaptured){
      var capturedKey=sanitizeTargetCombo(key)||String(key||'').trim();
      global.OneToneHabitTriggerSetup.onTargetCaptured({
        mappingId:msg.mappingId||Rec().mappingId()||'',
        key:capturedKey
      });
    }
    }
    return true;
    }
    if(Rec().mode()==='nativeRestore'){
    const physical=msg.sourceKey||key;
    Rec().finishNativeRestore(physical, msg.source||null);
    return true;
    }
    }
    return false;
  }

  global.OneToneMappingRecordingInput={
    tryEscapeRecording:tryEscapeRecording,handleKeyDown:handleKeyDown,
    handleKeyUp:handleKeyUp,handleMouseDown:handleMouseDown,
    handleWebViewMessage:handleWebViewMessage,resetTargetCapture:resetTargetCapture,
    sanitizeTargetCombo:sanitizeTargetCombo,normalizeKeyFromCode:normalizeKeyFromCode
  };
})((typeof window!=='undefined')?window:globalThis);
