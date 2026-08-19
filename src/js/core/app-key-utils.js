(function(global){
  'use strict';

  var triggerLeftClickIgnoreUntil=0;
  var targetLeftClickIgnoreUntil=0;

  function rawEventForHotkey(hotkey, label, device){
    var keyCode={
      Volume_Down:['AudioVolumeDown','AudioVolumeDown'],
      Volume_Up:['AudioVolumeUp','AudioVolumeUp'],
      Volume_Mute:['AudioVolumeMute','AudioVolumeMute'],
      Media_Next:['MediaTrackNext','MediaTrackNext'],
      Media_Prev:['MediaTrackPrevious','MediaTrackPrevious'],
      Media_Play_Pause:['MediaPlayPause','MediaPlayPause'],
      Media_Stop:['MediaStop','MediaStop'],
      Browser_Back:['BrowserBack','BrowserBack'],
      Browser_Forward:['BrowserForward','BrowserForward'],
      Browser_Refresh:['BrowserRefresh','BrowserRefresh'],
      Launch_Mail:['LaunchMail','LaunchMail'],
      Launch_App1:['LaunchApp1','LaunchApp1'],
      Launch_App2:['LaunchApp2','LaunchApp2']
    };
    var pair=keyCode[hotkey]||[hotkey,hotkey];
    var dev=String(device||'').trim()||'keyboard';
    return {device:dev,key:pair[0],code:pair[1],location:0,type:'keydown',hotkey:hotkey,label:label||hotkey,button:null};
  }

  function buildPeripheralTriggerSource(physical, device){
    var events=[];
    if(physical==='Volume_Down'||physical==='Volume_Up'){
      events.push(rawEventForHotkey('Volume_Down','Volume Down',device));
      events.push(rawEventForHotkey('Volume_Up','Volume Up',device));
    }else{
      events.push(rawEventForHotkey(physical,physical.replace(/_/g,' '),device));
    }
    return {
      id:'source_peripheral_mixed',
      label:'外设混合单键',
      mode:'single_press',
      grouping:(physical==='Volume_Down'||physical==='Volume_Up')?'same_source_group':'exact',
      rawEvents:events
    };
  }

  function collapseTriggerAlias(part){
    var alias={
      Control:'LCtrl',Ctrl:'LCtrl',LCtrl:'LCtrl',RCtrl:'RCtrl',
      ControlLeft:'LCtrl',LControl:'LCtrl',ControlRight:'RCtrl',RControl:'RCtrl',
      Shift:'LShift',LShift:'LShift',RShift:'RShift',ShiftLeft:'LShift',ShiftRight:'RShift',
      Alt:'LAlt',LAlt:'LAlt',RAlt:'RAlt',AltLeft:'LAlt',AltRight:'RAlt',LMenu:'LAlt',RMenu:'RAlt',
      Win:'LWin',LWin:'LWin',RWin:'RWin',Meta:'LWin',MetaLeft:'LWin',MetaRight:'RWin'
    };
    return alias[part]||part;
  }

  function normalizeTriggerKey(key){
    if(!key) return 'AutoTrigger';
    var v=String(key).trim();
    if(v.indexOf('+')>=0){
      var out=[];
      v.split('+').forEach(function(p){
        var n=collapseTriggerAlias(String(p||'').trim());
        if(n&&out.indexOf(n)<0) out.push(n);
      });
      if(out.length===1) v=out[0];
      else if(out.length>1) return out.join('+');
    }
    if(/^Audio_?Volume/i.test(v)||/^Volume/i.test(v)) return 'AutoTrigger';
    if(v==='AudioVolumeUp'||v==='VolumeUp'||v==='Volume_Up'||v==='Audio_Volume_Up') return 'AutoTrigger';
    if(v==='AudioVolumeDown'||v==='VolumeDown'||v==='Volume_Down'||v==='Audio_Volume_Down') return 'AutoTrigger';
    if(v==='AudioVolumeMute'||v==='VolumeMute'||v==='Volume_Mute'||v==='Audio_Volume_Mute') return 'AutoTrigger';
    if(v==='AltRight'||v==='RMenu') return 'RAlt';
    if(v==='AltLeft'||v==='LMenu') return 'LAlt';
    if(v==='ControlRight'||v==='RControl') return 'RCtrl';
    if(v==='ControlLeft'||v==='LControl'||v==='Control'||v==='Ctrl') return 'LCtrl';
    return collapseTriggerAlias(v);
  }

  function normalizeMediaTargetKey(code, key){
    var c=String(code||'');
    var k=String(key||'');
    var map={
      AudioVolumeUp:'Volume_Up',AudioVolumeDown:'Volume_Down',AudioVolumeMute:'Volume_Mute',
      Audio_Volume_Up:'Volume_Up',Audio_Volume_Down:'Volume_Down',Audio_Volume_Mute:'Volume_Mute',
      MediaTrackNext:'Media_Next',MediaTrackPrevious:'Media_Prev',
      MediaPlayPause:'Media_Play_Pause',MediaStop:'Media_Stop',
      BrowserBack:'Browser_Back',BrowserForward:'Browser_Forward',BrowserRefresh:'Browser_Refresh',
      LaunchMail:'Launch_Mail',LaunchApp1:'Launch_App1',LaunchApp2:'Launch_App2'
    };
    if(Object.prototype.hasOwnProperty.call(map,c)) return map[c];
    if(Object.prototype.hasOwnProperty.call(map,k)) return map[k];
    return '';
  }

  function armTriggerLeftClickIgnore(ms){
    var span=Number(ms)||350;
    triggerLeftClickIgnoreUntil=Date.now()+Math.max(120,span);
  }

  function armTargetLeftClickIgnore(ms){
    var span=Number(ms)||350;
    targetLeftClickIgnoreUntil=Date.now()+Math.max(120,span);
  }

  function isLeftMouseToken(v){
    // Primary mouse buttons — blocked as triggers (L/R/M). Side X1/X2 stay allowed.
    var raw=String(v||'').trim().toLowerCase();
    if(!raw) return false;
    if(raw==='lbutton'||raw==='mouse_left'||raw==='mouseleft'||raw==='mouse left') return true;
    if(raw==='leftmousebutton'||raw==='left mouse button') return true;
    if(raw==='rbutton'||raw==='mouse_right'||raw==='mouseright'||raw==='mouse right') return true;
    if(raw==='rightmousebutton'||raw==='right mouse button') return true;
    if(raw==='mbutton'||raw==='mouse_middle'||raw==='mousemiddle'||raw==='mouse middle') return true;
    if(raw==='middlemousebutton'||raw==='middle mouse button') return true;
    return false;
  }

  function containsLeftMouseToken(v){
    var raw=String(v||'').trim();
    if(!raw) return false;
    if(isLeftMouseToken(raw)) return true;
    if(raw.indexOf('+')<0) return false;
    return raw.split('+').some(function(part){
      return isLeftMouseToken(part);
    });
  }

  function isAllowedTriggerKey(key){
    var normalized=normalizeTriggerKey(key);
    if(!String(normalized||'').trim()) return false;
    if(containsLeftMouseToken(key)) return false;
    return !containsLeftMouseToken(normalized);
  }

  function isAllowedTargetKey(key){
    var raw=String(key||'').trim();
    if(!raw) return false;
    return !containsLeftMouseToken(raw);
  }

  function shouldIgnoreTriggerLeftClickCapture(key, sourceKey, source){
    if(Date.now()>triggerLeftClickIgnoreUntil) return false;
    if(containsLeftMouseToken(key)||containsLeftMouseToken(sourceKey)) return true;
    var evt=source&&Array.isArray(source.rawEvents)&&source.rawEvents[0];
    if(evt&&containsLeftMouseToken(evt.hotkey||evt.key||evt.code||'')) return true;
    return false;
  }

  function shouldIgnoreTargetLeftClickCapture(key, sourceKey, source){
    if(Date.now()>targetLeftClickIgnoreUntil) return false;
    if(containsLeftMouseToken(key)||containsLeftMouseToken(sourceKey)) return true;
    var evt=source&&Array.isArray(source.rawEvents)&&source.rawEvents[0];
    if(evt&&containsLeftMouseToken(evt.hotkey||evt.key||evt.code||'')) return true;
    return false;
  }

  function isFolkPadBindKey(key){
    var k=String(key||'').trim();
    if(!k||k==='AutoTrigger') return false;
    if(/^F([1-9]|1[0-9]|2[0-4])$/.test(k)) return true;
    if(k.indexOf('Numpad')===0) return true;
    if(k==='AppsKey') return true;
    return /^(Volume_|XButton|Browser_|Media_|Launch_|Gamepad_)/.test(k);
  }

  function mappingPhysicalTokens(m){
    var trig=String(m&&m.triggerKey||'').trim();
    var src=String(m&&m.sourceKey||'').trim();
    if(trig==='AutoTrigger'||/^Volume_/.test(trig)||/^Volume_/.test(src)){
      return ['Volume_Up','Volume_Down'];
    }
    var out=[];
    if(trig) out.push(trig);
    if(src&&src!==trig&&src!=='AutoTrigger') out.push(src);
    return out;
  }

  function triggerOccupiesPhysical(m, key){
    var k=String(key||'').trim();
    if(!k||!m) return false;
    var toks=mappingPhysicalTokens(m);
    if(toks.indexOf(k)>=0) return true;
    if(k==='AutoTrigger') return toks.indexOf('Volume_Up')>=0||toks.indexOf('Volume_Down')>=0;
    return false;
  }

  function padOccupiesPhysical(pad, key, exceptMicroId){
    var k=String(key||'').trim();
    if(!k||!pad||!Array.isArray(pad.keys)) return false;
    for(var i=0;i<pad.keys.length;i++){
      var r=pad.keys[i];
      if(!r||!r.enabled||r.microKeyId===exceptMicroId) continue;
      if(String(r.sourceKey||'').trim()===k) return true;
    }
    return false;
  }

  function occupancyTriggerMapping(cfg, mapping){
    if(!mapping) return null;
    var isApp=false;
    if(global.OneToneHabitOverrideDiff&&global.OneToneHabitOverrideDiff.isAppScenarioMapping){
      isApp=!!global.OneToneHabitOverrideDiff.isAppScenarioMapping(mapping);
    }else{
      isApp=!!String(mapping.appTargetId||mapping.app_target_id||'').trim();
    }
    if(isApp&&!String(mapping.triggerKey||mapping.trigger_key||'').trim()){
      if(global.OneToneHabitOverrideDiff&&global.OneToneHabitOverrideDiff.findGlobalBaselineMapping){
        return global.OneToneHabitOverrideDiff.findGlobalBaselineMapping(cfg, global.OneToneMappingCore)||mapping;
      }
      var list=cfg&&Array.isArray(cfg.mappings)?cfg.mappings:[];
      for(var i=0;i<list.length;i++){
        if(!String(list[i].appTargetId||list[i].app_target_id||'').trim()) return list[i];
      }
      return mapping;
    }
    return mapping;
  }

  function effectiveTriggerOccupiesPhysical(cfg, mapping, key){
    return triggerOccupiesPhysical(occupancyTriggerMapping(cfg, mapping), key);
  }

  global.OneToneAppKeyUtils={
    rawEventForHotkey:rawEventForHotkey,
    buildPeripheralTriggerSource:buildPeripheralTriggerSource,
    normalizeTriggerKey:normalizeTriggerKey,
    normalizeMediaTargetKey:normalizeMediaTargetKey,
    containsLeftMouseToken:containsLeftMouseToken,
    isAllowedTriggerKey:isAllowedTriggerKey,
    isAllowedTargetKey:isAllowedTargetKey,
    armTriggerLeftClickIgnore:armTriggerLeftClickIgnore,
    armTargetLeftClickIgnore:armTargetLeftClickIgnore,
    shouldIgnoreTriggerLeftClickCapture:shouldIgnoreTriggerLeftClickCapture,
    shouldIgnoreTargetLeftClickCapture:shouldIgnoreTargetLeftClickCapture,
    isFolkPadBindKey:isFolkPadBindKey,
    mappingPhysicalTokens:mappingPhysicalTokens,
    triggerOccupiesPhysical:triggerOccupiesPhysical,
    occupancyTriggerMapping:occupancyTriggerMapping,
    effectiveTriggerOccupiesPhysical:effectiveTriggerOccupiesPhysical,
    padOccupiesPhysical:padOccupiesPhysical
  };
})((typeof window!=='undefined')?window:globalThis);
