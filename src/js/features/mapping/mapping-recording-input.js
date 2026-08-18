(function(global){
  'use strict';
  var OneToneMappingCore=global.OneToneMappingCore;
  var $=function(id){ return global.OneToneDom.$(id); };
  var t=function(key){ return global.OneToneI18n.t(key); };
  function Rec(){ return global.OneToneMappingRecording; }
  function hooks(){ return global.__vp_mapping_recording_input_hooks__ || {}; }
  function probePush(src, kind, key, note){
    var probe=global.OneToneRecordProbe;
    if(probe&&probe.push) probe.push(src, kind, key, note);
  }
  var cap={pendingModifier:'',mods:{ctrl:false,shift:false,alt:false,meta:false},modSide:{ctrl:'',shift:'',alt:'',meta:''}};

  // Watchdog timer: if we dispatched a hardware capture but the backend
  // never confirms via mvp_key_captured within RECONCILE_GRACE_MS, surface
  // a toast that explains what may have gone wrong. The bridge case
  // (Bluetooth RAlt → Volume_Up) and the side-button race both benefit from
  // this — without it, the user just stares at "未设置" with no feedback.
  var RECONCILE_GRACE_MS=1800;
  var reconcileWatchdog=null;
  var reconcileAwaiting=false;
  var lastHardwarePressKey='';
  var lastHardwarePressDevice='';
  var recGen=-1;
  var sawVolumeToken=false;
  function syncPeripheralSession(){
    var gen=Rec()&&Rec().captureGen?Rec().captureGen():0;
    if(gen!==recGen){
      recGen=gen;
      sawVolumeToken=false;
    }
  }
  function isRecordUiLeakKey(key,code){
    var k=String(key||'');
    var c=String(code||'');
    return k==='Enter'||c==='Enter'||c==='NumpadEnter'||k==='Tab'||c==='Tab';
  }
  function tryCommitPeripheralFromEvent(e){
    if(!e||(Rec().mode()!=='trigger'&&Rec().mode()!=='agentBinding')) return false;
    syncPeripheralSession();
    var key=String(e.key||'');
    var code=String(e.code||'');
    var physical=webEventToPhysicalKey(key,code)||key;
    var delegated=Rec().isHardwareDelegatedTriggerKey(key,code)
      ||(Rec().isHardwareCaptureToken&&Rec().isHardwareCaptureToken(physical));
    if(!delegated) return false;
    e.preventDefault();
    e.stopPropagation();
    if(/volume/i.test(key+' '+code+' '+physical)) sawVolumeToken=true;
    probePush('fe','commit',physical,e.type||'');
    if($('triggerState')) $('triggerState').textContent=t('triggerRecordDetected')+hooks().friendlyKeyName(physical);
    hooks().pushLog(t('triggerRecordDetected')+hooks().friendlyKeyName(physical));
    hooks().armTriggerPeripheralGuard(450);
    noteHardwarePressAwaitingAck(physical);
    Rec().finishDetectedHardwareTrigger(physical);
    return true;
  }
  function clearReconcileWatchdog(){
    reconcileAwaiting=false;
    if(reconcileWatchdog){
      clearTimeout(reconcileWatchdog);
      reconcileWatchdog=null;
    }
  }
  function rememberHardwarePress(key, device){
    const k=String(key||'').trim();
    if(k) lastHardwarePressKey=k;
    if(device!=null) lastHardwarePressDevice=String(device||'');
  }
  function invokeFrontendKeydownBackup(key){
    const physical=String(key||'').trim();
    if(!physical) return Promise.resolve(false);
    const ipc=global.OneToneIpc;
    const invoke=ipc&&typeof ipc.invoke==='function'?ipc.invoke.bind(ipc):global.__vp_invoke__;
    if(!invoke) return Promise.resolve(false);
    const payload=global.__vp_tauri_args__?global.__vp_tauri_args__({
      key:physical,
      mappingId:Rec().mappingId()||'',
      mode:Rec().mode()||'trigger'
    }):{key:physical,mappingId:Rec().mappingId()||'',mode:Rec().mode()||'trigger'};
    return invoke('cmd_frontend_keydown',payload).then(function(){ return true; }).catch(function(err){
      hooks().pushLog('[record] cmd_frontend_keydown backup failed: '+String(err&&err.message||err||'unknown'));
      return false;
    });
  }
  function retryPeripheralCaptureFromWatchdog(){
    if(Rec().mode()!=='trigger'&&Rec().mode()!=='agentBinding') return Promise.resolve(false);
    const preview=String(Rec().previewKey&&Rec().previewKey()||'').trim();
    const seen=String(lastHardwarePressKey||'').trim();
    const hw=(Rec().resolveHardwareTriggerFromSeen&&Rec().resolveHardwareTriggerFromSeen(seen||preview))
      ||seen||preview;
    if(!hw||!(Rec().isHardwareCaptureToken&&Rec().isHardwareCaptureToken(hw))) return Promise.resolve(false);
    hooks().pushLog('[record] watchdog retry peripheral key='+hw);
    probePush('fe','retry',hw,'watchdog');
    Rec().finishDetectedHardwareTrigger(hw, lastHardwarePressDevice||'');
    if(Rec().mode()==='none') return Promise.resolve(true);
    return invokeFrontendKeydownBackup(hw);
  }
  function armReconcileWatchdog(){
    clearReconcileWatchdog();
    reconcileAwaiting=true;
    reconcileWatchdog=setTimeout(function(){
      reconcileWatchdog=null;
      if(!reconcileAwaiting||Rec().mode()==='none') return;
      reconcileAwaiting=false;
      retryPeripheralCaptureFromWatchdog().then(function(ok){
        if(ok||Rec().mode()==='none') return;
        hooks().toast(t('recordWatchdogNoAck','检测到按键信号，但未能完成录制。请再按一次鼠标侧键或蓝牙音量键，并保持 OneTone 窗口在前台。'));
        hooks().pushLog('[record] watchdog: hardware press not confirmed after '+RECONCILE_GRACE_MS+'ms');
        probePush('fe','watchdog', lastHardwarePressKey||'', String(RECONCILE_GRACE_MS));
      });
    },RECONCILE_GRACE_MS);
  }
  function noteHardwarePressAwaitingAck(key, device){
    if(Rec().mode()!=='trigger'&&Rec().mode()!=='agentBinding') return;
    rememberHardwarePress(key, device);
    armReconcileWatchdog();
  }
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
    if(k==='Control'||k==='Ctrl') return sideFromCode(c,'LCtrl','RCtrl');
    if(k==='Alt') return sideFromCode(c,'LAlt','RAlt');
    if(k==='Shift') return sideFromCode(c,'LShift','RShift');
    if(k && !['Control','Shift','Alt','Meta','OS'].includes(k)) return k;
    return c || k;
  }

  function sideFromCode(code,left,right){
    if(String(code||'')==='ControlRight'||String(code||'')==='AltRight'||String(code||'')==='ShiftRight'||String(code||'')==='MetaRight') return right;
    if(String(code||'')==='ControlLeft'||String(code||'')==='AltLeft'||String(code||'')==='ShiftLeft'||String(code||'')==='MetaLeft') return left;
    return left;
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
    return ['LCtrl','RCtrl','LShift','RShift','LAlt','RAlt','LWin','RWin','Ctrl','Control','Shift','Alt','Win','Meta'].indexOf(String(tok||''))>=0;
  }

  function collapseModifierAlias(parts){
    var alias={
      Control:'LCtrl',Ctrl:'LCtrl',LCtrl:'LCtrl',RCtrl:'RCtrl',
      Alt:'LAlt',LAlt:'LAlt',RAlt:'RAlt',
      Shift:'LShift',LShift:'LShift',RShift:'RShift',
      Win:'LWin',LWin:'LWin',RWin:'RWin'
    };
    var out=[];
    parts.forEach(function(p){
      var canon=alias[p]||p;
      if(out.indexOf(canon)<0) out.push(canon);
    });
    return out;
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
      if(p==='Control'&&side.ctrl) return side.ctrl;
      if(p==='Win'&&side.meta) return side.meta;
      return p;
    });
    parts=collapseModifierAlias(parts);
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
  function isModifierEvent(key, code){
    if(isModifierCode(code)) return true;
    return ['Control','Ctrl','Shift','Alt','Meta'].indexOf(String(key||''))>=0;
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

  function isSpuriousGhostCombo(combo){
    const raw=String(combo||'').split('+').map(function(p){ return p.trim(); }).filter(Boolean);
    const parts=collapseModifierAlias(raw);
    if(!parts.length) return false;
    const nonMod=parts.filter(function(p){ return !isTargetModifierToken(p); });
    if(nonMod.length===1&&nonMod[0]==='Space'&&(parts.length>=3||raw.length>=3)) return true;
    if(raw.length>=2&&parts.every(isTargetModifierToken)) return true;
    return false;
  }

  function isRecognitionKeyEcho(key){
    const m=OneToneMappingCore.recording()||OneToneMappingCore.byId(Rec().mappingId())||OneToneMappingCore.selected();
    if(!m) return false;
    const tgt=hooks().normalizeTriggerKey(OneToneMappingCore.editorTarget(m)||m.targetKey||'');
    const k=hooks().normalizeTriggerKey(key);
    return !!(tgt&&k&&tgt===k);
  }

  function tryFinishHardwareTriggerFromSeen(seen, device){
    const hw=Rec().resolveHardwareTriggerFromSeen?Rec().resolveHardwareTriggerFromSeen(seen):'';
    if(!hw) return false;
    hooks().armTriggerPeripheralGuard(450);
    noteHardwarePressAwaitingAck(hw, device||'');
    Rec().finishDetectedHardwareTrigger(hw, device||'');
    return true;
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
    syncPeripheralSession();
    if(tryCommitPeripheralFromEvent(e)) return;
    const code=String(e.code||'');
    const key=String(e.key||'');
    if(isRecordUiLeakKey(key,code)){
    e.preventDefault();
    probePush('fe','skip',key||code,'ui-leak');
    return;
    }
    if(Date.now()<hooks().triggerPeripheralGuardUntil()){
    if(!Rec().isHardwareDelegatedTriggerKey(key,code)) return;
    }
    if(Date.now()<hooks().triggerPeripheralGuardUntil()&&isTargetModifierToken(normalizeStandaloneModifier(code)||normalizeKeyFromCode(code,key)||key)){
    return;
    }
    e.preventDefault();
    e.stopPropagation();
    const mods={ctrl:e.ctrlKey,shift:e.shiftKey,alt:e.altKey,meta:e.metaKey};
    if(isModifierEvent(key,code)){
    cap.pendingModifier=code;
    cap.mods=mods;
    noteModifierSide(code);
    const standalone=normalizeStandaloneModifier(code);
    if($('triggerState')) $('triggerState').textContent=t('comboHint')+(standalone||'');
    hooks().pushLog(t('logWaitMain'));
    if(standalone) Rec().updatePreview('trigger',standalone);
    return;
    }
    const main=normalizeKeyFromCode(code, key);
    const combo=normalizeTargetCombination(mods, main, cap.modSide);
    if(combo){
    if((main==='Space'||code==='Space')&&mods.ctrl&&mods.shift){
    probePush('fe','skip',combo,'ghost-media');
    return;
    }
    if(isSpuriousGhostCombo(combo)){
    probePush('fe','skip',combo,'ghost-combo');
    return;
    }
    if(sawVolumeToken){
    probePush('fe','skip',combo,'after-volume');
    return;
    }
    if($('triggerState')) $('triggerState').textContent=t('triggerRecordDetected')+hooks().friendlyKeyName(combo);
    Rec().finishFrontendTrigger(combo);
    }
    return;
    }
    if(Rec().mode()==='agentBinding'){
    const code=String(e.code||'');
    const key=String(e.key||'');
    e.preventDefault();
    e.stopPropagation();
    const mods={ctrl:e.ctrlKey,shift:e.shiftKey,alt:e.altKey,meta:e.metaKey};
    if(isModifierCode(code)){
    cap.pendingModifier=code;
    cap.mods=mods;
    noteModifierSide(code);
    const standalone=normalizeStandaloneModifier(code);
    var hint=t('agentCapRecording','按下快捷键…');
    if($('targetState')) $('targetState').textContent=hint+(standalone||'');
    hooks().pushLog(t('logWaitMain'));
    if(standalone) Rec().updatePreview('agentBinding',standalone);
    return;
    }
    const main=normalizeKeyFromCode(code, key);
    const combo=normalizeTargetCombination(mods, main, cap.modSide);
    if(combo){
    if($('targetState')) $('targetState').textContent=t('triggerRecordDetected')+hooks().friendlyKeyName(combo);
    Rec().finishAgentBinding(combo);
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
    if($('targetState')) $('targetState').textContent=t('comboHint');
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
    if(Rec().isHardwareCaptureToken(btn)){
    if($('triggerState')) $('triggerState').textContent=t('triggerRecordDetected')+hooks().friendlyKeyName(btn);
    hooks().armTriggerPeripheralGuard(450);
    noteHardwarePressAwaitingAck(btn);
    Rec().finishDetectedHardwareTrigger(btn);
    return;
    }
    if(isSpuriousGhostCombo(combo)) return;
    if($('triggerState')) $('triggerState').textContent=t('triggerRecordDetected')+hooks().friendlyKeyName(combo);
    Rec().finishFrontendTrigger(combo);
    return;
    }
    Rec().finishTarget(combo);
  }

  function handleKeyUp(e){
    if(Rec().mode()!=='target'&&Rec().mode()!=='schemeSwitch'&&Rec().mode()!=='mappingSwitch'&&Rec().mode()!=='trigger'&&Rec().mode()!=='agentBinding') return;
    if(tryCommitPeripheralFromEvent(e)) return;
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
    if(modifierName==='RAlt'){
      // 02 识别 defaults to RAlt. A real volume key already arrived as
      // AudioVolume* — extra RAlt from the dongle must not overwrite it.
      if(sawVolumeToken||isRecognitionKeyEcho('RAlt')){
        probePush('fe','skip','RAlt',sawVolumeToken?'after-volume':'recognition-echo');
        cap.pendingModifier='';
        return;
      }
      Rec().finishDetectedHardwareTrigger('Volume_Up');
      cap.pendingModifier='';
      return;
    }
    if(isTargetModifierToken(modifierName)) return;
    if($('triggerState')) $('triggerState').textContent=t('triggerRecordDetected')+hooks().friendlyKeyName(modifierName);
    Rec().finishFrontendTrigger(modifierName);
    }
    else if(Rec().mode()==='agentBinding'){
    e.preventDefault();
    e.stopPropagation();
    if($('targetState')) $('targetState').textContent=t('triggerRecordDetected')+hooks().friendlyKeyName(modifierName);
    Rec().finishAgentBinding(modifierName);
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
    if(type==='mvp_record_probe'){
    probePush('rs', msg.stage||'probe', msg.key||'', msg.note||'');
    return true;
    }
    if(type==='mvp_record_echo'){
    clearReconcileWatchdog();
    probePush('rs','echo', msg.key||'', 'recognition_key_echo');
    hooks().toast(t('recordTriggerMatchesTarget','这是「语音快捷键」，不能用作触发键。请按鼠标侧键或蓝牙音量键，或先在右侧修改识别键。'));
    hooks().pushLog('[record] echo rejected key='+String(msg.key||''));
    return true;
    }
    if(type==='mvp_record_rejected'){
    var reason=String(msg.reason||'');
    probePush('rs','reject', msg.key||'', reason);
    hooks().toast(reason.indexOf('left_mouse')>=0||reason.indexOf('mouse')>=0?t('leftMouseRejected'):t('whitelistRejected'));
    Rec().cancel();
    return true;
    }
    if(type==='mvp_record_seen'){
    probePush('rs','seen', msg.key||'', msg.device||'');
    if(Rec().mode()!=='none') hooks().playSoundCue('record');
    const seen=msg.key||'?';
    try{
      const mappingId=String(msg.mappingId||'').trim();
      const m=(mappingId && global.OneToneMappingCore && global.OneToneMappingCore.byId)
        ? global.OneToneMappingCore.byId(mappingId)
        : null;
      const isCursor=!!(m && String(m.appTargetId||'').trim()==='cursor-chat');
      if(isCursor && hooks().pushLog){
        hooks().pushLog(
          '[debug][cursor-record] mvp_record_seen '+
          'mode='+String(Rec().mode()||'')+' '+
          'key='+String(msg.key||'')+' '+
          'device='+(msg.device||'')
        );
      }
    }catch(_){}
    if(Rec().mode()==='trigger'){
    if(rejectLeftMouseRecording('trigger', seen, seen, null)) return true;
    const preview=Rec().previewCaptureKey('trigger',seen);
    Rec().updatePreview('trigger',preview);
    Rec().notifyOnboardingPreview('trigger',preview);
    if($('triggerState')) $('triggerState').textContent=t('triggerRecordDetected')+hooks().friendlyKeyName(preview);
    }else if(Rec().mode()==='target'){
    if(rejectLeftMouseRecording('target', seen, seen, null)) return true;
    const preview=Rec().previewCaptureKey('target',seen);
    Rec().updatePreview('target',preview);
    Rec().notifyOnboardingPreview('target',preview);
    if($('targetState')) $('targetState').textContent=t('triggerRecordDetected')+hooks().friendlyKeyName(preview);
    }else if(Rec().mode()==='agentBinding'){
    if(rejectLeftMouseRecording('trigger', seen, seen, null)) return true;
    const previewAb=Rec().previewCaptureKey('agentBinding',seen);
    Rec().updatePreview('agentBinding',previewAb);
    if($('targetState')) $('targetState').textContent=t('triggerRecordDetected')+hooks().friendlyKeyName(previewAb);
    }else if(Rec().mode()==='nativeRestore'){
    if($('triggerState')) $('triggerState').textContent=t('triggerRecordDetected')+hooks().friendlyKeyName(seen);
    }
    hooks().pushLog(t('triggerRecordDetected')+hooks().friendlyKeyName(seen));
    if(Rec().mode()==='trigger'){
    if(Rec().isHardwareCaptureToken(seen)||(Rec().resolveHardwareTriggerFromSeen&&Rec().resolveHardwareTriggerFromSeen(seen))){
      noteHardwarePressAwaitingAck(seen, msg.device||'');
    }
    tryFinishHardwareTriggerFromSeen(seen, msg.device||'');
    }
    if(Rec().mode()==='agentBinding' && Rec().isHardwareCaptureToken(seen)){
    Rec().finishAgentBinding(seen);
    }
    return true;
    }
    if(type==='mvp_record_pending'){
    const seen=msg.displayKey||'?';
    if(Rec().mode()==='trigger'){
    const preview=Rec().previewCaptureKey('trigger',seen);
    Rec().updatePreview('trigger',preview);
    Rec().notifyOnboardingPreview('trigger',preview);
    if($('triggerState')) $('triggerState').textContent=t('comboHint')+hooks().friendlyKeyName(preview);
    }else if(Rec().mode()==='target'){
    if(rejectLeftMouseRecording('target', seen, seen, null)) return true;
    const preview=Rec().previewCaptureKey('target',seen);
    Rec().updatePreview('target',preview);
    Rec().notifyOnboardingPreview('target',preview);
    if($('targetState')) $('targetState').textContent=t('comboHint');
    }else if(Rec().mode()==='agentBinding'){
    const previewPending=Rec().previewCaptureKey('agentBinding',seen);
    Rec().updatePreview('agentBinding',previewPending);
    if($('targetState')) $('targetState').textContent=t('comboHint')+hooks().friendlyKeyName(previewPending);
    }
    return true;
    }
    if(type==='mvp_key_captured'){
    clearReconcileWatchdog();
    probePush('rs','captured', msg.key||'', (msg.mode||'')+' '+(msg.sourceKey||''));
    const key=msg.key||'AutoTrigger';
    const captureMode=msg.mode||'trigger';
    // Debug: confirm what backend actually captured during Cursor scenario recording.
    // This helps detect whether XButton1/2 is being rewritten earlier to AltRight/RAlt.
    try{
      const mappingId=String(msg.mappingId||'').trim();
      const m=(mappingId && global.OneToneMappingCore && global.OneToneMappingCore.byId)
        ? global.OneToneMappingCore.byId(mappingId)
        : null;
      const isCursor=!!(m && String(m.appTargetId||'').trim()==='cursor-chat');
      if(isCursor && hooks().pushLog){
        hooks().pushLog(
          '[debug][cursor-record] mvp_key_captured '+
          'mode='+String(captureMode)+' '+
          'key='+String(msg.key||'')+' '+
          'sourceKey='+String(msg.sourceKey||'')+' '+
          'source='+String(msg.source||'')
        );
      }
    }catch(_){}
    if(captureMode==='agentBinding'){
    if(Rec().mode()==='agentBinding'||Rec().mode()==='trigger'){
    if(rejectLeftMouseRecording('trigger', key, msg.sourceKey||'', msg.source||null)) return true;
    Rec().finishAgentBinding(key, msg.sourceKey||'', msg.source||null);
    }
    return true;
    }
    if(captureMode==='trigger'){
    if(Rec().mode()==='trigger'){
    if(rejectLeftMouseRecording('trigger', key, msg.sourceKey||'', msg.source||null)) return true;
    if(isRecognitionKeyEcho(key)) return true;
    if(Date.now()<hooks().triggerPeripheralGuardUntil()&&isTargetModifierToken(key)&&key!=='AutoTrigger'){
    return true;
    }
    Rec().finishTrigger(key, msg.source||null, msg.sourceKey||'', msg.sourceTime||'', {backendCommitted:true});
    }else if(Rec().applyBackendKeyCapture(msg)){
    Rec().clearMappingGuard();
    Rec().clearTimer();
    Rec().clearSnapshot();
    Rec().setMappingId('');
    Rec().setRecording('none');
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
    sanitizeTargetCombo:sanitizeTargetCombo,normalizeKeyFromCode:normalizeKeyFromCode,
    armReconcileWatchdog:armReconcileWatchdog,
    clearReconcileWatchdog:clearReconcileWatchdog,
    noteHardwarePressAwaitingAck:noteHardwarePressAwaitingAck
  };
})((typeof window!=='undefined')?window:globalThis);
