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
  // Recording-input hooks historically omitted normalizeTriggerKey → oral IPC
  // committed then FE finish threw. Prefer hook, then AppKeyUtils, then raw.
  function normalizeTriggerKeySafe(key){
    var h=hooks();
    if(h&&typeof h.normalizeTriggerKey==='function') return h.normalizeTriggerKey(key);
    var util=global.OneToneAppKeyUtils;
    if(util&&typeof util.normalizeTriggerKey==='function') return util.normalizeTriggerKey(key);
    return String(key||'').trim();
  }
  var cap={pendingModifier:'',mods:{ctrl:false,shift:false,alt:false,meta:false},modSide:{ctrl:'',shift:'',alt:'',meta:''}};
  // FE-side gesture for lone modifiers (Shift/Ctrl/…). Matches Rust RECORD_* timing.
  // Needed because focused-window presses often never reach the LL hook, and the
  // async cmd_frontend_keydown backup can arrive after GetAsyncKeyState already
  // sees the key up — dropping the first press before a double can form.
  var FE_DOUBLE_MS=400;
  var FE_LONG_MS=400;
  var FE_DOUBLE_MIN_GAP_MS=40;
  var feModGesture={key:'', downAt:0, releaseAt:0, timer:null};
  function clearFeModGesture(){
    if(feModGesture.timer){
      clearTimeout(feModGesture.timer);
      feModGesture.timer=null;
    }
    feModGesture.key='';
    feModGesture.downAt=0;
    feModGesture.releaseAt=0;
  }
  function commitFeModGesture(key, mode){
    clearFeModGesture();
    if(Rec().mode()!=='trigger') return;
    cap.pendingModifier='';
    paintFeModGesturePreview(key, mode==='double'?'×2':(mode==='longpress'?'按住':''));
    if($('triggerState')) $('triggerState').textContent=t('triggerRecordDetected')+hooks().friendlyKeyName(key);
    probePush('fe','commit',key, mode||'tap');
    Rec().finishTrigger(key, null, key, String(Date.now()), {
      backendCommitted:false,
      triggerMode:mode||'tap'
    });
  }
  function paintFeModGesturePreview(key, mark){
    var view=$('triggerView');
    var badge=$('triggerGestureBadge');
    var disp=$('triggerDisplay');
    var label=hooks().friendlyKeyName(key);
    if(view) view.textContent=mark? (label+' '+mark) : label;
    if(badge){
      badge.textContent=mark||'';
      badge.hidden=!mark;
      badge.setAttribute('aria-hidden',mark?'false':'true');
    }
    if(disp){
      disp.classList.toggle('empty',!key);
      disp.classList.toggle('is-gesture-double',mark==='×2');
      disp.classList.toggle('is-gesture-hold',mark==='按住'||mark==='hold');
    }
  }
  function onFeModKeyDown(key){
    var now=Date.now();
    if(feModGesture.releaseAt && feModGesture.key===key){
      var gap=now-feModGesture.releaseAt;
      if(gap>=FE_DOUBLE_MIN_GAP_MS && gap<=FE_DOUBLE_MS){
        commitFeModGesture(key, 'double');
        return true;
      }
    }
    if(feModGesture.timer){
      clearTimeout(feModGesture.timer);
      feModGesture.timer=null;
    }
    feModGesture.key=key;
    feModGesture.downAt=now;
    feModGesture.releaseAt=0;
    return false;
  }
  function onFeModKeyUp(key){
    if(feModGesture.key!==key || !feModGesture.downAt) return false;
    var now=Date.now();
    var held=now-feModGesture.downAt;
    if(held>=FE_LONG_MS){
      commitFeModGesture(key, 'longpress');
      return true;
    }
    feModGesture.releaseAt=now;
    feModGesture.downAt=0;
    // Waiting for possible second press — do not paint ×2 (that looked like a commit).
    paintFeModGesturePreview(key, '');
    if(feModGesture.timer) clearTimeout(feModGesture.timer);
    feModGesture.timer=setTimeout(function(){
      feModGesture.timer=null;
      if(feModGesture.key===key && feModGesture.releaseAt){
        commitFeModGesture(key, 'tap');
      }
    }, FE_DOUBLE_MS);
    return true;
  }

  // Watchdog timer: if we dispatched a hardware capture but the backend
  // never confirms via mvp_key_captured within RECONCILE_GRACE_MS, surface
  // a toast that explains what may have gone wrong. The bridge case
  // (Bluetooth RAlt → Volume_Up) and the side-button race both benefit from
  // this — without it, the user just stares at "未设置" with no feedback.
  // Watchdog must wait longer than a single backup IPC: persist_and_rebind can
  // exceed 2s; retrying mid-flight doubles load and causes the ipc-timeout the user sees.
  var RECONCILE_GRACE_MS=3200;
  var BACKUP_DEDUPE_MS=300;
  var BACKUP_IPC_TIMEOUT_MS=4500;
  var reconcileWatchdog=null;
  var reconcileAwaiting=false;
  var lastHardwarePressKey='';
  var lastHardwarePressDevice='';
  var recGen=-1;
  var sawVolumeToken=false;
  // In-flight until IPC settles (not a short dedupe window).
  var backupInFlight={};
  var lastIpcReturnAt=0;
  var lastIpcReturnKey='';
  function isBackupInFlight(key){
    var k=String(key||'').trim();
    return !!(k&&backupInFlight[k]);
  }
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
  function resolveRecordMappingId(){
    var id=String(Rec().mappingId&&Rec().mappingId()||'').trim();
    if(id) return id;
    try{
      var core=global.OneToneMappingCore;
      var m=core&&core.recording?core.recording():null;
      if(m&&m.id) return String(m.id);
      m=core&&core.selected?core.selected():null;
      if(m&&m.id) return String(m.id);
    }catch(_){}
    try{
      var st=global.OneToneState&&global.OneToneState.state;
      if(st&&st.selectedMappingId) return String(st.selectedMappingId).trim();
    }catch(_){}
    return '';
  }
  function markIpcReturn(key){
    lastIpcReturnAt=Date.now();
    lastIpcReturnKey=String(key||'').trim();
  }
  function recentlyGotIpcReturn(key){
    var k=String(key||'').trim();
    if(!k||k!==lastIpcReturnKey) return false;
    return (Date.now()-lastIpcReturnAt)<BACKUP_DEDUPE_MS*4;
  }
  function applyBackupIpcCommit(physical, result, mode){
    var key=String(result&&result.key||physical||'').trim()||physical;
    var mid=String(result&&result.mappingId||'').trim();
    clearReconcileWatchdog();
    markIpcReturn(key);
    probePush('rs','commit',key,'ipc-return');
    // to_js may be lost under Logitech/driver noise — finish UI from IPC return.
    if(Rec().mode()==='none') return true;
    if(mode==='oralTrigger'||(Rec().triggerSlot&&Rec().triggerSlot()==='oral')){
      var om=OneToneMappingCore.byId(mid)||OneToneMappingCore.selected();
      var written=false;
      if(om&&global.OneToneKeysChannelCommandPicker&&global.OneToneKeysChannelCommandPicker.setOralTriggerKey){
        written=!!global.OneToneKeysChannelCommandPicker.setOralTriggerKey(
          om,
          normalizeTriggerKeySafe(key),
          {persist:false}
        );
      }
      if(!written){
        probePush('fe','oral-apply-fail',key,'setOralTriggerKey failed mid='+(mid||'(empty)'));
        hooks().toast(t('recordOralTriggerApplyFail','口头触发键未能写入，请再录一次'));
        return false;
      }
      probePush('fe','oral-applied',key,'oralCommandScheme.triggerKey');
      Rec().setRecording('none');
      try{ hooks().render(); }catch(_){}
      return true;
    }
    if(Rec().mode()==='agentBinding'){
      Rec().finishAgentBinding(key,'','');
      return true;
    }
    if(Rec().mode()==='trigger'){
      Rec().finishTrigger(key,null,key,String(Date.now()),{backendCommitted:true,triggerMode:'tap'});
      return true;
    }
    return true;
  }
  function invokeFrontendKeydownBackup(key){
    const physical=String(key||'').trim();
    if(!physical) return Promise.resolve(false);
    // One in-flight backup per key until IPC settles (watchdog used to re-fire at 1.8s).
    if(isBackupInFlight(physical)){
      probePush('fe','skip',physical,'backup in-flight');
      return Promise.resolve(false);
    }
    if(recentlyGotIpcReturn(physical)&&Rec().mode()==='none'){
      probePush('fe','skip',physical,'already ipc-return');
      return Promise.resolve(true);
    }
    // IPC owns ack — do not let watchdog stack a second cmd_frontend_keydown.
    clearReconcileWatchdog();
    backupInFlight[physical]=Date.now();
    // Oral arm records with Rec.mode()==='trigger' + triggerSlot oral — backend needs oralTrigger.
    var slot=(Rec().triggerSlot&&Rec().triggerSlot())||'';
    var mode=slot==='oral'?'oralTrigger':(Rec().mode()||'trigger');
    var mappingId=resolveRecordMappingId();
    if(mappingId&&Rec().setMappingId&&!String(Rec().mappingId()||'').trim()){
      Rec().setMappingId(mappingId);
    }
    var args={key:physical,mappingId:mappingId,mode:mode};
    var meta='mode='+mode+' mid='+(mappingId?mappingId.slice(0,18):'(empty)');
    probePush('fe','keydown',physical,'fe-backup '+meta);
    var t0=Date.now();
    const ipc=global.OneToneIpc;
    const invokeTimeout=ipc&&typeof ipc.invokeTimeout==='function'?ipc.invokeTimeout.bind(ipc):null;
    const invoke=ipc&&typeof ipc.invoke==='function'?ipc.invoke.bind(ipc):global.__vp_invoke__;
    function clearFlight(){
      if(backupInFlight[physical]) delete backupInFlight[physical];
    }
    function onIpcOk(result){
      clearFlight();
      var committed=!!(result&&result.committed===true);
      var stage=String(result&&result.stage||'');
      // Second backup after a successful commit — do not scare the probe.
      if(!committed&&(stage==='not_recording'||stage==='pending')&&recentlyGotIpcReturn(physical)){
        probePush('fe','skip',physical,'duplicate after ipc-return stage='+stage);
        return true;
      }
      probePush(
        'fe',
        'ipc-ok',
        physical,
        'cmd_frontend_keydown '+meta+' '+String(Date.now()-t0)+'ms'
          +(stage?' stage='+stage:'')
          +(result&&typeof result.committed==='boolean'?' committed='+committed:'')
      );
      if(committed){
        clearReconcileWatchdog();
        try{
          return !!applyBackupIpcCommit(physical, result, mode);
        }catch(err){
          // Backend already wrote — never rebrand UI finish errors as ipc-fail.
          var umsg=String(err&&err.message||err||'ui finish');
          probePush('fe','ipc-warn',physical,'commit ok; ui finish failed: '+umsg);
          hooks().pushLog('[record] applyBackupIpcCommit after commit: '+umsg);
          return true;
        }
      }
      if(!mappingId){
        probePush('fe','ipc-warn',physical,'empty mappingId — backend cannot write habit');
      }else if(stage==='pending'||stage==='not_recording'){
        probePush('fe','ipc-warn',physical,'backend '+stage+' (Logitech hook may have blocked; waiting watchdog)');
        armReconcileWatchdog();
      }
      return false;
    }
    function onIpcFail(err){
      clearFlight();
      // If we already committed via a twin invoke, this is noise.
      if(recentlyGotIpcReturn(physical)||Rec().mode()==='none'){
        probePush('fe','skip',physical,'fail after ipc-return: '+String(err&&err.message||err||''));
        return true;
      }
      var msg=String(err&&err.message||err||'unknown');
      var kind=/timeout/i.test(msg)?'ipc-timeout':'ipc-fail';
      probePush('fe',kind,physical,msg);
      hooks().pushLog('[record] cmd_frontend_keydown backup failed: '+msg);
      // One more chance after a true timeout — only when nothing is in flight.
      armReconcileWatchdog();
      return false;
    }
    if(invokeTimeout||invoke){
      const payload=global.__vp_tauri_args__?global.__vp_tauri_args__(args):args;
      var run=invokeTimeout
        ?invokeTimeout('cmd_frontend_keydown',payload,BACKUP_IPC_TIMEOUT_MS)
        :invoke('cmd_frontend_keydown',payload);
      return run.then(onIpcOk).catch(onIpcFail);
    }
    // WebView2 bridge fallback (same as start/stop recording).
    try{
      if(window.chrome&&window.chrome.webview&&window.chrome.webview.postMessage){
        window.chrome.webview.postMessage({
          type:'mvp_frontend_keydown',
          key:physical,
          mappingId:mappingId,
          mode:mode
        });
        clearFlight();
        probePush('fe','ipc-ok',physical,'postMessage '+meta);
        return Promise.resolve(false);
      }
    }catch(err){
      return Promise.resolve(onIpcFail(err));
    }
    clearFlight();
    probePush('fe','ipc-fail',physical,'invoke unavailable');
    return Promise.resolve(false);
  }
  function retryPeripheralCaptureFromWatchdog(){
    var mode=Rec().mode();
    if(mode!=='trigger'&&mode!=='agentBinding'&&mode!=='padBind') return Promise.resolve(false);
    const preview=String(Rec().previewKey&&Rec().previewKey()||'').trim();
    const seen=String(lastHardwarePressKey||'').trim();
    const hw=(Rec().resolveHardwareTriggerFromSeen&&Rec().resolveHardwareTriggerFromSeen(seen||preview))
      ||seen||preview;
    if(!hw||!(Rec().isHardwareCaptureToken&&Rec().isHardwareCaptureToken(hw))) return Promise.resolve(false);
    // Already committed via IPC return — do not page-finish oral / re-backup.
    if(recentlyGotIpcReturn(hw)||Rec().mode()==='none'){
      probePush('fe','skip',hw,'watchdog after ipc-return');
      return Promise.resolve(true);
    }
    // First backup still running (persist/rebind) — wait, do not stack IPC.
    if(isBackupInFlight(hw)){
      probePush('fe','skip',hw,'watchdog while backup in-flight');
      armReconcileWatchdog();
      return Promise.resolve(true);
    }
    hooks().pushLog('[record] watchdog retry peripheral key='+hw);
    probePush('fe','retry',hw,'watchdog');
    // Soft Pad padBind / oral: backend-only. Never page-finish (stops RECORDING_SESSION early).
    if(mode==='padBind'||(Rec().triggerSlot&&Rec().triggerSlot()==='oral')){
      return invokeFrontendKeydownBackup(hw);
    }
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
        try{
          var probe=global.OneToneRecordProbe;
          if(probe&&typeof probe.pushDiagSnapshot==='function'){
            probe.pushDiagSnapshot('watchdog '+RECONCILE_GRACE_MS+'ms');
          }
        }catch(_){}
      });
    },RECONCILE_GRACE_MS);
  }
  function noteHardwarePressAwaitingAck(key, device){
    var mode=Rec().mode();
    if(mode!=='trigger'&&mode!=='agentBinding'&&mode!=='padBind') return;
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
    if(c.indexOf('Numpad')===0) return c;
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
    clearFeModGesture();
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
    const tgt=normalizeTriggerKeySafe(OneToneMappingCore.editorTarget(m)||m.targetKey||'');
    const k=normalizeTriggerKeySafe(key);
    return !!(tgt&&k&&tgt===k);
  }

  function tryFinishHardwareTriggerFromSeen(seen, device){
    const hw=Rec().resolveHardwareTriggerFromSeen?Rec().resolveHardwareTriggerFromSeen(seen):'';
    if(!hw) return false;
    hooks().armTriggerPeripheralGuard(450);
    noteHardwarePressAwaitingAck(hw, device||'');
    // Seen is a preview, not a persisted capture. Oral recording completes on
    // mvp_key_captured; the watchdog can retry the native capture if needed.
    if(Rec().triggerSlot&&Rec().triggerSlot()==='oral') return true;
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
    if(Rec().mode()==='padBind'){
    const physical=webEventToPhysicalKey(e.key,e.code);
    if(!Rec().isHardwareCaptureToken(physical)) return;
    e.preventDefault();
    e.stopPropagation();
    probePush('wv','seen',physical,'padBind');
    invokeFrontendKeydownBackup(physical);
    return;
    }
    if(Rec().mode()==='trigger'){
    if(isCancelRecordEvent(e)){
      cancelFromUiEvent(e);
      return;
    }
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
    if(standalone){
      Rec().updatePreview('trigger',standalone);
      probePush('fe','keydown',standalone,'mod-gesture');
      // FE owns focused-window mod gestures. Do not IPC-backup keydown —
      // a late backup after real keyup is misread as a second press (×2).
      if(onFeModKeyDown(standalone)) return;
      paintFeModGesturePreview(standalone, '');
    }
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
    if(isCancelRecordEvent(e)){
      cancelFromUiEvent(e);
      return;
    }
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

  function eventEl(e){
    var n=e&&e.target;
    if(!n) return null;
    if(n.nodeType===3) n=n.parentElement;
    if(n&&n.nodeType!==1&&n.parentElement) n=n.parentElement;
    return n&&n.nodeType===1?n:null;
  }

  function isCancelRecordEvent(e){
    // Side/middle buttons must never cancel — hovering「取消录制」时按 X1/X2
    // used to wipe the session and leave probe at「页面收到、前端未发备份」.
    if(e&&e.button!=null&&e.button!==0) return false;
    var el=eventEl(e);
    if(el&&el.closest&&el.closest('#btnCancelRecord,#btnCancelRecordInline,#recordCancelBar,.btn-cancel-record')) return true;
    var path=e&&e.composedPath?e.composedPath():null;
    if(!path) return false;
    for(var i=0;i<path.length;i++){
      var p=path[i];
      if(!p||p===window||p===document) continue;
      if(p.id==='btnCancelRecord'||p.id==='btnCancelRecordInline'||p.id==='recordCancelBar') return true;
      if(p.classList&&p.classList.contains('btn-cancel-record')) return true;
    }
    return false;
  }

  function cancelFromUiEvent(e){
    if(e){
      e.preventDefault();
      e.stopPropagation();
    }
    var rec=Rec();
    if(rec&&rec.cancelDraftOrRecording) rec.cancelDraftOrRecording();
  }

  function handleMouseDown(e){
    var mode=Rec().mode();
    if(mode!=='target'&&mode!=='trigger'&&mode!=='padBind'){
      if(e&&(e.button===3||e.button===4)){
        probePush('fe','skip',normalizeMouseButton(e.button)||('b'+e.button),'mousedown mode='+mode);
      }
      return;
    }
    if(isCancelRecordEvent(e)){
      cancelFromUiEvent(e);
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    const btn=normalizeMouseButton(e.button);
    if(!btn){
      probePush('fe','skip','','no mouse btn='+String(e&&e.button));
      return;
    }
    // Soft Pad padBind: LL mouse often misses X2; page auxclick/pointer is the backup
    // (keydown path already covers volume/F-keys — mouse was the gap).
    if(mode==='padBind'){
      if(!Rec().isHardwareCaptureToken(btn)) return;
      noteHardwarePressAwaitingAck(btn);
      probePush('fe','keydown',btn,'page-side-padBind');
      invokeFrontendKeydownBackup(btn);
      return;
    }
    const mods={ctrl:e.ctrlKey,shift:e.shiftKey,alt:e.altKey,meta:e.metaKey};
    const combo=sanitizeTargetCombo(normalizeTargetCombination(mods, btn, cap.modSide));
    if(rejectLeftMouseRecording(mode, combo, btn, null)){
      probePush('fe','skip',btn,'reject-left');
      return;
    }
    if(mode==='trigger'){
    if(Rec().isHardwareCaptureToken&&Rec().isHardwareCaptureToken(btn)){
    // Probe before UI paint — friendlyKeyName/DOM throws used to leave「页面收到 only」.
    probePush('fe','keydown',btn,'page-side');
    try{
      if($('triggerState')){
        var label=hooks().friendlyKeyName?hooks().friendlyKeyName(btn):btn;
        $('triggerState').textContent=t('triggerRecordDetected')+label;
      }
      if(hooks().armTriggerPeripheralGuard) hooks().armTriggerPeripheralGuard(450);
    }catch(err){
      probePush('fe','ipc-warn',btn,'page-side ui: '+String(err&&err.message||err||''));
    }
    noteHardwarePressAwaitingAck(btn);
    var oralSlot=!!(Rec().triggerSlot&&Rec().triggerSlot()==='oral');
    // Oral: keep RECORDING_SESSION until backend oralTrigger commit. Page finish
    // stopped the session early → next side-press fired Soft Pad 听写 instead of
    // writing the trigger key.
    if(oralSlot){
      invokeFrontendKeydownBackup(btn);
      armReconcileWatchdog();
      return;
    }
    // Habit/peer: page backup is the commit path when LL mouse never fires
    // (Logitech / WebView2). Do not finishDetected from WebView — that races
    // RECORDING_SESSION and can stop the session before XButton poll sees the edge.
    armReconcileWatchdog();
    invokeFrontendKeydownBackup(btn);
    return;
    }
    probePush('fe','skip',btn,'not-hardware-token');
    if(isSpuriousGhostCombo(combo)) return;
    if($('triggerState')) $('triggerState').textContent=t('triggerRecordDetected')+(hooks().friendlyKeyName?hooks().friendlyKeyName(combo):combo);
    Rec().finishFrontendTrigger(combo);
    return;
    }
    Rec().finishTarget(combo);
  }

  /** Direct X1/X2 capture for app-keyboard when DOM hit-tests are noisy. */
  function captureSideButton(btn){
    var key=String(btn||'').trim();
    if(key!=='XButton1'&&key!=='XButton2') return false;
    var mode=Rec().mode();
    var pending=!!(Rec().isPending&&Rec().isPending());
    // startPending: backend arming — still accept side keys so Soft Pad cannot win the race.
    if(mode!=='trigger'&&mode!=='padBind'&&mode!=='agentBinding'&&!pending){
      probePush('fe','skip',key,'side-capture mode='+mode);
      return false;
    }
    noteHardwarePressAwaitingAck(key);
    probePush('fe','keydown',key,mode==='padBind'?'page-side-padBind':'page-side-direct');
    if(mode==='agentBinding'){
      Rec().finishAgentBinding(key);
      return true;
    }
    armReconcileWatchdog();
    invokeFrontendKeydownBackup(key);
    return true;
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
    // FE owns focused-window modifier gestures (tap / double / hold).
    if($('triggerState')) $('triggerState').textContent=t('comboHint')+hooks().friendlyKeyName(modifierName);
    probePush('fe','keyup',modifierName,'mod-gesture');
    if(onFeModKeyUp(modifierName)){
      cap.pendingModifier='';
      return;
    }
    cap.pendingModifier='';
    return;
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
    if(msg.stage==='unknown'){
      if(global.OneToneRecordProbe&&global.OneToneRecordProbe.ingestUnknown){
        global.OneToneRecordProbe.ingestUnknown(msg.key||'', msg.note||'');
      }else{
        probePush('rs','unknown', msg.key||'', msg.note||'');
      }
      return true;
    }
    probePush('rs', msg.stage||'probe', msg.key||'', msg.note||'');
    return true;
    }
    if(type==='mvp_record_echo'){
    clearReconcileWatchdog();
    var echoReason=String(msg.reason||'recognition_key_echo');
    probePush('rs','echo', msg.key||'', echoReason);
    hooks().toast(echoReason==='softpad_occupied'
      ? t('recordTriggerMatchesSoftPad','这是 SoftPad 格子键，不能用作 01 触发。请换 F13 / 音量减 / 侧键，或先改 SoftPad 绑定。')
      : t('recordTriggerMatchesTarget','这是「语音快捷键」，不能用作触发键。请按鼠标侧键或蓝牙音量键，或先在右侧修改识别键。'));
    hooks().pushLog('[record] echo rejected key='+String(msg.key||'')+' reason='+echoReason);
    return true;
    }
    if(type==='mvp_pad_bind_captured'){
    probePush('rs','commit', msg.key||'', 'padBind');
    var padUi=global.OneToneCodexMicroPadUi;
    if(padUi&&typeof padUi.onPadBindCaptured==='function') padUi.onPadBindCaptured(msg.key||'');
    return true;
    }
    if(type==='mvp_record_rejected'){
    var reason=String(msg.reason||'');
    probePush('rs','reject', msg.key||'', reason);
    if(String(msg.mode||'')==='padBind'){
      var padUi2=global.OneToneCodexMicroPadUi;
      if(padUi2&&typeof padUi2.onPadBindRejected==='function') padUi2.onPadBindRejected(reason, msg.key||'');
      else if(reason==='trigger_occupied') hooks().toast(t('recordPadTriggerOccupied','这是 01 触发键，不能绑到 SoftPad 格子'));
      else if(reason==='pad_unfriendly_key') hooks().toast(t('recordPadUnfriendlyKey','请用 F13–F24 / 音量 / 侧键 / 小键盘，不要用字母或 Enter'));
      return true;
    }
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
    if(captureMode==='trigger'||captureMode==='oralTrigger'){
    markIpcReturn(key);
    if(Rec().mode()==='trigger'){
    if(rejectLeftMouseRecording('trigger', key, msg.sourceKey||'', msg.source||null)) return true;
    if(isRecognitionKeyEcho(key)) return true;
    if(Date.now()<hooks().triggerPeripheralGuardUntil()&&isTargetModifierToken(key)&&key!=='AutoTrigger'){
    return true;
    }
    // oralTrigger → oralCommandScheme only; never habit.triggerKey.
    if(captureMode==='oralTrigger'){
      var omOral=OneToneMappingCore.byId(msg.mappingId||'')||OneToneMappingCore.selected();
      var wrote=false;
      if(omOral&&global.OneToneKeysChannelCommandPicker&&global.OneToneKeysChannelCommandPicker.setOralTriggerKey){
        wrote=!!global.OneToneKeysChannelCommandPicker.setOralTriggerKey(
          omOral,
          normalizeTriggerKeySafe(key),
          {persist:false}
        );
      }
      if(!wrote){
        probePush('fe','oral-apply-fail',key,'mvp_key_captured oralTrigger');
      }else{
        probePush('fe','oral-applied',key,'mvp_key_captured oralTrigger');
      }
      Rec().setRecording('none');
      hooks().render();
      return true;
    }
    Rec().finishTrigger(key, msg.source||null, msg.sourceKey||'', msg.sourceTime||'', {backendCommitted:true, triggerMode:msg.triggerMode||''});
    }else if(captureMode==='oralTrigger'){
    // Orphan backend oral commit — apply oral field only, never habit.triggerKey.
    var om=OneToneMappingCore.byId(msg.mappingId||'')||OneToneMappingCore.selected();
    var wroteOrphan=false;
    if(om&&global.OneToneKeysChannelCommandPicker&&global.OneToneKeysChannelCommandPicker.setOralTriggerKey){
      wroteOrphan=!!global.OneToneKeysChannelCommandPicker.setOralTriggerKey(
        om,
        normalizeTriggerKeySafe(key),
        {persist:false}
      );
    }
    probePush('fe',wroteOrphan?'oral-applied':'oral-apply-fail',key,'orphan oralTrigger');
    hooks().render();
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
    captureSideButton:captureSideButton,
    handleWebViewMessage:handleWebViewMessage,resetTargetCapture:resetTargetCapture,
    sanitizeTargetCombo:sanitizeTargetCombo,normalizeKeyFromCode:normalizeKeyFromCode,
    armReconcileWatchdog:armReconcileWatchdog,
    clearReconcileWatchdog:clearReconcileWatchdog,
    noteHardwarePressAwaitingAck:noteHardwarePressAwaitingAck
  };
})((typeof window!=='undefined')?window:globalThis);
