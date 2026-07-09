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

  function normalizeTriggerKey(key){
    if(!key) return 'AutoTrigger';
    var v=String(key);
    if(v.includes('+')) return v;
    if(/^Audio_?Volume/i.test(v)||/^Volume/i.test(v)) return 'AutoTrigger';
    if(v==='AudioVolumeUp'||v==='VolumeUp'||v==='Volume_Up'||v==='Audio_Volume_Up') return 'AutoTrigger';
    if(v==='AudioVolumeDown'||v==='VolumeDown'||v==='Volume_Down'||v==='Audio_Volume_Down') return 'AutoTrigger';
    if(v==='AudioVolumeMute'||v==='VolumeMute'||v==='Volume_Mute'||v==='Audio_Volume_Mute') return 'AutoTrigger';
    return v;
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
    var raw=String(v||'').trim().toLowerCase();
    if(!raw) return false;
    if(raw==='lbutton'||raw==='mouse_left'||raw==='mouseleft'||raw==='mouse left') return true;
    if(raw==='leftmousebutton'||raw==='left mouse button') return true;
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
    shouldIgnoreTargetLeftClickCapture:shouldIgnoreTargetLeftClickCapture
  };
})((typeof window!=='undefined')?window:globalThis);
