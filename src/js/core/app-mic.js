(function(global){
  'use strict';
  var $=function(id){ return global.OneToneDom.$(id); };
  var t=function(key){ return global.OneToneI18n.t(key); };
  var vpInvoke=global.OneToneIpc.invoke;
  var ui=global.OneToneState.ui;
  function hooks(){ return global.__vp_app_mic_hooks__ || {}; }

  var micDevices=[];
  var micListLoaded=false;
  var activeMicId='';
  var micMonitorDeviceId='';
  var micPollTimer=0;
  var micDeviceRefreshTimer=0;
  var micRecoveryTimer=0;
  var micBackoffUntil=0;
  var micRecoveryFailCount=0;
  var micDeviceRefreshInFlight=false;
  var homeMicLastLevel=0;
  var micWavePhase=0;
  var micMuted=false;
  var micMuteKnown=false;
  var micSystemAvailable=true;
  var micUiBound=false;
  var trayMicBound=false;
  var manualOverrideUntil=0;
  var lastQuietMicListSig='';

  var MIC_DEVICE_REFRESH_MS=8000;
  var MIC_MANUAL_OVERRIDE_MS=45000;
  var MIC_RECOVERY_BASE_MS=30000;
  var MIC_RECOVERY_MAX_MS=120000;
  var MIC_MANUAL_REFRESH_SETTLE_MS=800;

  function replaceMicDevices(next){
    micDevices.splice(0,micDevices.length);
    if(Array.isArray(next)){
      Array.prototype.push.apply(
        micDevices,
        next.filter(function(dev){ return micDeviceAvailable(dev); })
      );
    }
  }

  function buildMicLevelBars(count){
    count=count||12;
    var html='';
    for(var i=0;i<count;i++) html+='<span></span>';
    return html;
  }

  function barCountForWrap(wrap){
    if(!wrap||!wrap.classList) return 12;
    if(wrap.classList.contains('mic-level-bars--pill')) return 8;
    if(wrap.classList.contains('mic-level-bars--home')) return 28;
    if(wrap.classList.contains('mic-level-bars--global')) return 8;
    if(wrap.classList.contains('mic-level-bars--snap')) return 10;
    if(wrap.classList.contains('mic-level-bars--wide')) return 20;
    return 12;
  }

  function findMicDeviceCard(deviceId){
    var cards=document.querySelectorAll('.mic-device-card');
    for(var i=0;i<cards.length;i++){
      if(cards[i].getAttribute('data-id')===deviceId) return cards[i];
    }
    return null;
  }

  function resolveMicLevelTargets(deviceId){
    var targets=[];
    function pushTarget(el){
      if(el&&targets.indexOf(el)<0) targets.push(el);
    }
    if(ui.drawerOpen&&ui.settingsPanel==='voiceWake'){
      if(deviceId) pushTarget(findMicDeviceCard(deviceId));
      if(activeMicId) pushTarget(findMicDeviceCard(activeMicId));
      if(micMonitorDeviceId) pushTarget(findMicDeviceCard(micMonitorDeviceId));
      pushTarget(document.querySelector('.mic-device-card.is-active'));
    }
    var settingsMicBtn=$('btnVoiceSettingsMic');
    if(settingsMicBtn) pushTarget(settingsMicBtn);
    var wakeCard=$('voiceSettingsWakeCard');
    if(wakeCard) pushTarget(wakeCard);
    var testWave=$('voiceTestWave');
    if(testWave) pushTarget(testWave);
    var practiceMic=$('phrasePracticeMicRow');
    if(practiceMic) pushTarget(practiceMic);
    var homeMic=$('wbHomeMicLevel');
    if(homeMic) pushTarget(homeMic);
    var heroMic=$('wbHeroMic');
    if(heroMic&&!heroMic.hidden) pushTarget(heroMic);
    var snapCheck=$('cameraSnapMicCheck');
    if(snapCheck) pushTarget(snapCheck);
    return targets;
  }

  function syncHomeMicPickState(_loading){
  }

  function updateMicLevelBars(deviceId,level){
    homeMicLastLevel=Number(level)||0;
    // Vosk Level ~120ms + voiceWake bars used to paint forever → idle UI_HB_STALL_5S (empty tag).
    var now=Date.now();
    if(now-(global.__otMicBarPaintAt||0)<250) return;
    global.__otMicBarPaintAt=now;
    var targets=resolveMicLevelTargets(deviceId);
    micWavePhase+=0.38;
    var norm=Math.max(0,Math.min(1,homeMicLastLevel/48));
    var hero=$('wbHero')||document.documentElement;
    if(hero&&hero.style) hero.style.setProperty('--wb-mic-level',norm.toFixed(3));
    if(!targets.length) return;
    targets.forEach(function(card){
      var wrap=card.classList&&card.classList.contains('mic-level-bars')
        ?card
        :card.querySelector('.mic-level-bars');
      if(!wrap) return;
      var barCount=barCountForWrap(wrap);
      var bars=wrap.querySelectorAll('span');
      if(!bars.length||bars.length!==barCount){
        wrap.innerHTML=buildMicLevelBars(barCount);
        bars=wrap.querySelectorAll('span');
      }
      var n=bars.length;
      var center=(n-1)/2;
      wrap.classList.toggle('is-active',norm>0.03);
      bars.forEach(function(bar,i){
        bar.className='';
        var dist=Math.abs(i-center)/Math.max(center,1);
        var envelope=1-dist*0.55;
        var wobble=norm>0.04?Math.sin(micWavePhase+i*0.55)*0.08:0;
        var fine=norm>0.04?Math.sin(micWavePhase*1.7+i*1.35)*0.04*norm:0;
        var scale=norm<=0?0.1:Math.max(0.1,Math.min(1,norm*envelope+wobble+fine));
        bar.style.transform='scaleY('+scale.toFixed(3)+')';
        if(scale>0.62) bar.classList.add('is-hot');
      });
    });
    syncHomeMicPickState(false);
  }

  function applyMicLevelSnapshot(res){
    if(!res) return;
    var level=Number(res.level)||0;
    var id=String(res.deviceId||res.device_id||'').trim();
    updateMicLevelBars(id,level);
    if(level>0||id) clearMicBackoff();
  }

  function micBackoffActive(){
    return micBackoffUntil>Date.now();
  }

  function micRecoveryDelayMs(){
    var exponent=Math.max(0,micRecoveryFailCount-1);
    return Math.min(MIC_RECOVERY_MAX_MS,MIC_RECOVERY_BASE_MS*Math.pow(2,exponent));
  }

  function enterMicBackoff(retryAfterMs){
    var hinted=retryAfterMs!=null?Number(retryAfterMs):0;
    var scaled=Math.min(
      MIC_RECOVERY_MAX_MS,
      Math.max(MIC_RECOVERY_BASE_MS,hinted||micRecoveryDelayMs())
    );
    micRecoveryFailCount++;
    micBackoffUntil=Date.now()+scaled;
    stopMicLevelPoll();
    if(micRecoveryTimer){
      clearTimeout(micRecoveryTimer);
      micRecoveryTimer=0;
    }
    scheduleMicRecovery();
  }

  function clearMicBackoff(){
    micBackoffUntil=0;
    micRecoveryFailCount=0;
  }

  function voiceCaptureActive(){
    var w=hooks().voiceUiSnapshot().wake||{};
    if(w.voskEnabled||w.sapiEnabled||w.kwsEnabled) return true;
    var cfg=hooks().state().config||{};
    var vosk=cfg.voiceVosk||cfg.voice_vosk;
    var sapi=cfg.voiceSapi||cfg.voice_sapi;
    var kws=cfg.voiceKws||cfg.voice_kws;
    return !!(vosk&&vosk.enabled)||!!(sapi&&sapi.enabled)||!!(kws&&kws.enabled);
  }

  function onboardingMicContextOpen(){
    return !!(global.OneTonePhrasePractice && global.OneTonePhrasePractice.isOpen && global.OneTonePhrasePractice.isOpen());
  }

  function micLevelUiVisible(){
    if(ui.drawerOpen&&ui.settingsPanel==='voiceWake') return true;
    var heroMic=$('wbHeroMic');
    if(heroMic&&!heroMic.hidden) return true;
    var snapPanel=$('cameraProSubSnap');
    if(snapPanel&&!snapPanel.hidden) return true;
    if(onboardingMicContextOpen()) return true;
    return !ui.drawerOpen;
  }

  function micAutoRefreshAllowed(){
    // voiceWake: loadMicDevices on open is enough. The 8s quiet cmd_mic_list was racing the
    // WASAPI level-monitor thread and starving cmd_ui_heartbeat → UI_HB_STALL_5S (~5s, empty tag).
    if(ui.drawerOpen&&ui.settingsPanel==='voiceWake') return false;
    return micLevelUiVisible()
      &&!voiceCaptureActive()
      &&global.OneToneMappingRecording.mode()==='none'
      &&!micBackoffActive()
      &&!micDeviceRefreshInFlight;
  }

  function micLevelPollAllowed(){
    // Read-only poll of shared MicLevelState is safe while Vosk/KWS holds the device.
    // Exclusive capture monitor stays gated in ensureMicMonitor.
    return micLevelUiVisible()||onboardingMicContextOpen();
  }

  function syncHomeMicMonitor(){
    if(!micLevelUiVisible()) return Promise.resolve();
    if(voiceCaptureActive()){
      startMicLevelPoll();
      return Promise.resolve();
    }
    var devId=activeMicId||'';
    return ensureMicMonitor(devId||null).then(function(){
      if(micLevelUiVisible()) startMicLevelPoll();
    });
  }

  function pollMicLevel(){
    if(!micLevelPollAllowed()) return;
    var deviceId=activeMicId||micMonitorDeviceId||'';
    vpInvoke('cmd_mic_get_level',deviceId?{device_id:deviceId}:{}).then(function(res){
      applyMicLevelSnapshot(res);
    }).catch(function(){});
  }

  function micPollIntervalMs(){
    // 400ms style updates across wake card + device bars piled up after open; keep readable, less hot.
    if(ui.drawerOpen&&ui.settingsPanel==='voiceWake') return 1500;
    // Vosk/KWS already fill MicLevelState — poll even before bootMicReady.
    if(voiceCaptureActive()) return 500;
    if(!hooks().bootMicReady()) return 0;
    return 600;
  }

  function startMicLevelPoll(){
    stopMicLevelPoll();
    if(!micLevelPollAllowed()) return;
    var interval=micPollIntervalMs();
    if(!interval) return;
    pollMicLevel();
    micPollTimer=setInterval(pollMicLevel,interval);
    if(micAutoRefreshAllowed()) startMicDeviceRefresh();
  }

  function stopMicLevelPoll(){
    if(micPollTimer){
      clearInterval(micPollTimer);
      micPollTimer=0;
    }
    stopMicDeviceRefresh();
  }

  function micSettle(ms){
    return new Promise(function(resolve){ setTimeout(resolve,ms); });
  }

  function micDeviceAvailable(dev){
    return !!(dev&&dev.isAvailable!==false);
  }

  function resolveActiveMicId(devices,preferredId){
    devices=Array.isArray(devices)?devices:[];
    var preferred=String(preferredId||'').trim();
    if(preferred&&devices.some(function(d){ return d.id===preferred; })) return preferred;
    var def=devices.find(function(d){ return d.isDefault&&micDeviceAvailable(d); });
    if(def) return def.id;
    var first=devices.find(function(d){ return micDeviceAvailable(d); });
    return first?first.id:'';
  }

  function scheduleMicRecovery(){
    if(micRecoveryTimer) return;
    var wait=micBackoffActive()
      ?Math.max(0,micBackoffUntil-Date.now())
      :micRecoveryDelayMs();
    micRecoveryTimer=setTimeout(function(){
      micRecoveryTimer=0;
      if(!micLevelUiVisible()||voiceCaptureActive()) return;
      if(micBackoffActive()){
        scheduleMicRecovery();
        return;
      }
      loadMicDevices({reconnect:true}).catch(function(){});
    },wait);
  }

  function startMicDeviceRefresh(){
    stopMicDeviceRefresh();
    if(!micAutoRefreshAllowed()) return;
    micDeviceRefreshTimer=setInterval(function(){
      if(!micAutoRefreshAllowed()) return;
      refreshMicDevicesQuiet().catch(function(){});
    },MIC_DEVICE_REFRESH_MS);
  }

  function stopMicDeviceRefresh(){
    if(micDeviceRefreshTimer){
      clearInterval(micDeviceRefreshTimer);
      micDeviceRefreshTimer=0;
    }
  }

  function refreshMicDevicesQuiet(){
    if(micDeviceRefreshInFlight||micBackoffActive()) return Promise.resolve();
    var prevId=activeMicId;
    micDeviceRefreshInFlight=true;
    return vpInvoke('cmd_mic_list',{}).then(function(devices){
      var list=Array.isArray(devices)?devices:[];
      var sig=list.map(function(d){ return String(d&&d.id||'')+'|'+(d&&d.isAvailable===false?0:1); }).join(',');
      var nextId=resolveActiveMicId(list.filter(function(d){ return micDeviceAvailable(d); }),prevId);
      var sameList=sig===lastQuietMicListSig;
      var sameActive=nextId===activeMicId;
      var reconnect=nextId!==activeMicId||!micMonitorDeviceId||micMonitorDeviceId!==nextId;
      if(sameList&&sameActive&&!reconnect){
        clearMicBackoff();
        return;
      }
      lastQuietMicListSig=sig;
      replaceMicDevices(list);
      activeMicId=nextId;
      renderMicDevices();
      clearMicBackoff();
      if(!micDevices.length){
        activeMicId='';
        micMonitorDeviceId='';
        return;
      }
      if(reconnect){
        var pick=micDevices.find(function(d){ return d.id===activeMicId; });
        if(micDeviceAvailable(pick)) return ensureMicMonitor(activeMicId||null);
      }
    }).catch(function(err){
      console.error('mic refresh',err);
      enterMicBackoff();
    }).finally(function(){
      micDeviceRefreshInFlight=false;
    });
  }

  function handleMicMonitorError(msg){
    var detail=msg&&(msg.message||msg.reason||'');
    if(detail) console.warn('mic monitor error',detail);
    var retryMs=msg&&(msg.retryAfterMs!=null?msg.retryAfterMs:msg.retry_after_ms);
    enterMicBackoff(retryMs);
  }

  function ensureMicMonitor(deviceId,opts){
    opts=opts||{};
    if(!micLevelUiVisible()) return Promise.resolve();
    if(voiceCaptureActive()) return Promise.resolve();
    if(micBackoffActive()&&!opts.force) return Promise.resolve();
    var want=deviceId||'';
    // Already on this device — stop/start on every home paint used to 假死 boot (~5s).
    if(!opts.force&&micMonitorDeviceId&&micMonitorDeviceId===want) return Promise.resolve();
    var payload={};
    if(deviceId) payload.device_id=deviceId;
    if(opts.force) payload.force=true;
    // #region agent log
    try{ if(global.__dbgB5) global.__dbgB5('B','app-mic.js:ensureMicMonitor','mic monitor start',{want:want,force:!!opts.force,prev:micMonitorDeviceId||''}); }catch(_){}
    // #endregion
    micMonitorDeviceId=want;
    return stopMicMonitor().then(function(){
      micMonitorDeviceId=want;
      if(!micLevelPollAllowed()) return;
      if(micBackoffActive()&&!opts.force) return;
      return vpInvoke('cmd_mic_monitor_start',payload).catch(function(err){
        console.error('mic monitor start',err);
        if(!opts.force) enterMicBackoff();
      });
    });
  }

  function renderMicDevices(){
    var recordingBusy=global.OneToneMappingRecording.mode()!=='none';
    var list=$('micDeviceList');
    var empty=$('micEmpty');
    if(list) list.replaceChildren();
    if(!micDevices.length){
      if(empty){
        empty.hidden=false;
        empty.textContent=t('micEmpty');
      }
      renderHomeMicCurrent();
      renderMicSurfaces();
      return;
    }
    if(empty) empty.hidden=true;
    micDevices.forEach(function(dev){
      if(!list) return;
      var btn=document.createElement('button');
      btn.type='button';
      btn.className='mic-device-card'+((dev.id===activeMicId||(!activeMicId&&dev.isDefault))?' is-active':'');
      btn.setAttribute('data-id',dev.id);
      btn.innerHTML=
        '<span class="mic-device-card-inner">'+
          '<span class="mic-device-title-row">'+
            '<span class="mic-device-name"></span>'+
            '<span class="mic-device-sub"></span>'+
          '</span>'+
          '<span class="mic-level-bars mic-level-bars--wide" aria-hidden="true">'+buildMicLevelBars(20)+'</span>'+
        '</span>';
      btn.querySelector('.mic-device-name').textContent=dev.name;
      btn.querySelector('.mic-device-sub').textContent=dev.isDefault?t('micAutoDetectSub'):t('micExternal');
      btn.disabled=recordingBusy;
      btn.addEventListener('click',function(){ selectMicDevice(dev.id); });
      list.appendChild(btn);
    });
    renderHomeMicCurrent();
    renderMicSurfaces();
  }

  function renderHomeMicCurrent(){
    // Quiet device refresh used to call full renderVoiceSettingsFlow every 8s on voiceWake
    // (voice off → micAutoRefreshAllowed) → UI_HB_STALL_5S with empty tag after open settled.
    // #region agent log
    try{
      if(global.__dbgB5&&(!global.__dbgB5MicRenderAt||Date.now()-global.__dbgB5MicRenderAt>1500)){
        global.__dbgB5MicRenderAt=Date.now();
        global.__dbgB5('D','app-mic.js:renderHomeMicCurrent','renderHomeMicCurrent',{drawerOpen:!!ui.drawerOpen,panel:ui.settingsPanel||''});
      }
    }catch(_){}
    // #endregion
    if(ui.drawerOpen&&ui.settingsPanel==='voiceWake'){
      if(global.OneToneVoiceSettingsFlow&&global.OneToneVoiceSettingsFlow.syncAsideLiveStatus){
        try{ global.OneToneVoiceSettingsFlow.syncAsideLiveStatus(); }catch(_){}
      }
      return;
    }
    if(global.OneToneVoiceSettingsFlow&&global.OneToneVoiceSettingsFlow.scheduleVoiceSettingsRender){
      global.OneToneVoiceSettingsFlow.scheduleVoiceSettingsRender();
      return;
    }
    if(hooks().renderVoiceSettingsFlow) hooks().renderVoiceSettingsFlow();
  }

  function startMicMonitor(deviceId){
    return ensureMicMonitor(deviceId);
  }

  function stopMicMonitor(){
    micMonitorDeviceId='';
    return vpInvoke('cmd_mic_monitor_stop',{}).catch(function(){});
  }

  function loadMicDevices(opts){
    opts=opts||{};
    var prevId=activeMicId;
    var manual=!!opts.manual;
    if(manual) clearMicBackoff();
    else if(micBackoffActive()) return Promise.resolve();
    var listPayload=manual?{force:true}:{};
    var prep=manual
      ?stopMicMonitor().then(function(){ return micSettle(MIC_MANUAL_REFRESH_SETTLE_MS); })
      :Promise.resolve();
    return prep.then(function(){
      return vpInvoke('cmd_mic_list',listPayload);
    }).then(function(devices){
      micListLoaded=true;
      replaceMicDevices(Array.isArray(devices)?devices:[]);
      lastQuietMicListSig=micDevices.map(function(d){ return String(d&&d.id||'')+'|'+(d&&d.isAvailable===false?0:1); }).join(',');
      clearMicBackoff();
      if(!micDevices.length){
        activeMicId='';
        micMonitorDeviceId='';
        renderMicDevices();
        return;
      }
      activeMicId=resolveActiveMicId(micDevices,prevId);
      renderMicDevices();
      renderMicSurfaces();
      var muteProbe=vpInvoke('cmd_mic_get_mute',{}).then(function(st){
        applyMicMuteState(st||{});
      }).catch(function(){});
      var pick=micDevices.find(function(d){ return d.id===activeMicId; });
      if(!micDeviceAvailable(pick)){
        micMonitorDeviceId='';
        if(micLevelUiVisible()) startMicLevelPoll();
        if(manual&&prevId){
          hooks().toast(t('micOfflineHint'));
          try{
            if(global.OneToneSoundBus&&global.OneToneSoundBus.notify){
              global.OneToneSoundBus.notify('mic.device_lost',{dedupeKey:'mic.device_lost'});
            }
          }catch(_){}
        }
        return muteProbe;
      }
      return muteProbe.then(function(){
        return ensureMicMonitor(activeMicId||null,{force:manual}).then(function(){
          if(micLevelUiVisible()) startMicLevelPoll();
          if(opts.reconnect) hooks().toast(t('micReconnected'));
        });
      });
    }).catch(function(err){
      micListLoaded=true;
      replaceMicDevices([]);
      renderMicDevices();
      var emptyEl=$('micEmpty');
      if(emptyEl){
        emptyEl.hidden=false;
        var msg=err&&err.message?String(err.message):'';
        emptyEl.textContent=msg||t('micWindowsOnly');
      }
      console.error('mic list',err);
      if(!manual) enterMicBackoff();
      throw err;
    });
  }

  function selectMicDevice(deviceId){
    if(!deviceId) return;
    var dev=micDevices.find(function(d){ return d.id===deviceId; });
    if(dev&&!micDeviceAvailable(dev)){
      hooks().toast(t('micOfflineHint'));
      try{
        if(global.OneToneSoundBus&&global.OneToneSoundBus.notify){
          global.OneToneSoundBus.notify('mic.device_lost',{dedupeKey:'mic.device_lost'});
        }
      }catch(_){}
      return;
    }
    clearMicBackoff();
    vpInvoke('cmd_mic_set_default',{device_id:deviceId,force:true}).then(function(){
      activeMicId=deviceId;
      return vpInvoke('cmd_mic_list',{force:true});
    }).then(function(devices){
      replaceMicDevices(Array.isArray(devices)?devices:[]);
      clearMicBackoff();
      renderMicDevices();
      var pick=micDevices.find(function(d){ return d.id===activeMicId; });
      if(!micDeviceAvailable(pick)) return;
      return ensureMicMonitor(activeMicId,{force:true});
    }).then(function(){
      if(micLevelPollAllowed()) startMicLevelPoll();
      if(global.OneToneVoiceWakeNavigation&&global.OneToneVoiceWakeNavigation.closeMicPicker){
        global.OneToneVoiceWakeNavigation.closeMicPicker();
      }
    }).catch(function(err){
      console.error('mic switch',err);
      enterMicBackoff();
      var detail=err&&(err.message||String(err))||'';
      hooks().toast(detail?(t('micSwitchFail')+'：'+detail):t('micSwitchFail'));
      try{
        if(global.OneToneSoundBus&&global.OneToneSoundBus.notify){
          global.OneToneSoundBus.notify('mic.switch_failed',{dedupeKey:'mic.switch_failed'});
        }
      }catch(_){}
    });
  }

  function activeMicLabel(){
    if(!micDevices.length) return '';
    var dev=micDevices.find(function(d){ return d.id===activeMicId; })
      ||micDevices.find(function(d){ return d.isDefault; })
      ||micDevices[0];
    return dev?(dev.name||dev.label||dev.id):'';
  }

  function micLabelFallback(){
    return activeMicLabel()||t('micUiDeviceMissing');
  }

  // Device-first status (align with hero): mute probe never parks the primary label on「检测中」.
  function resolveMicSurfaceKey(hasDevice, recovering, muteKnown, muted){
    if(recovering&&!hasDevice) return 'recovering';
    if(!hasDevice) return 'missing';
    if(muteKnown&&muted) return 'muted';
    return 'ready';
  }

  function getMicUiState(){
    var dev=micDevices.find(function(d){ return d.id===activeMicId; })
      ||micDevices.find(function(d){ return d.isDefault; })
      ||micDevices[0]||null;
    var recovering=micBackoffActive()||!!micRecoveryTimer||!!micDeviceRefreshInFlight;
    var hasDevice=!!(dev&&micDeviceAvailable(dev)&&micSystemAvailable!==false);
    var key=resolveMicSurfaceKey(hasDevice,recovering,micMuteKnown,!!micMuted);
    var level=Number(homeMicLastLevel)||0;
    var labels={
      ready:t('micUiReady'),
      muted:t('micUiMuted'),
      missing:t('micUiMissing'),
      recovering:t('micUiRecovering'),
      checking:t('micUiMuteChecking')
    };
    return {
      key:key,
      label:labels[key]||labels.ready,
      deviceId:dev?dev.id:(activeMicId||''),
      deviceName:dev?(dev.name||dev.label||dev.id):micLabelFallback(),
      available:hasDevice,
      muteKnown:micMuteKnown,
      muted:micMuteKnown?!!micMuted:null,
      recovering:recovering,
      level:level,
      hasLevel:level>2,
      canToggleMute:hasDevice&&!recovering&&micMuteKnown,
      canPickDevice:true,
      manualOverrideActive:manualOverrideUntil>Date.now()
    };
  }

  function isMicManualOverrideActive(now){
    return manualOverrideUntil>(now!=null?now:Date.now());
  }

  function applyMicMuteState(st){
    if(!st) return getMicUiState();
    micMuteKnown=st.muted!=null;
    if(st.muted!=null) micMuted=!!st.muted;
    if(st.available!=null) micSystemAvailable=!!st.available;
    if(st.deviceId||st.device_id){
      var id=String(st.deviceId||st.device_id||'').trim();
      if(id) activeMicId=id;
    }
    renderMicSurfaces();
    return getMicUiState();
  }

  var micMuteProbeInFlight=false;
  function refreshMicUiState(opts){
    opts=opts||{};
    var prep=(!micListLoaded||opts.forceDevices)
      ?loadMicDevices({manual:!!opts.manual}).catch(function(){})
      :Promise.resolve();
    return prep.then(function(){
      if(micMuteProbeInFlight&&!opts.forceMute) return getMicUiState();
      micMuteProbeInFlight=true;
      return vpInvoke('cmd_mic_get_mute',{}).then(function(st){
        return applyMicMuteState(st||{});
      }).catch(function(){
        // Keep device-first UI; mute toggle stays disabled until a later probe succeeds.
        micSystemAvailable=micDevices.length>0;
        renderMicSurfaces();
        return getMicUiState();
      }).finally(function(){
        micMuteProbeInFlight=false;
      });
    });
  }

  function setMicUiMuted(muted, opts){
    opts=opts||{};
    var source=String(opts.source||'manual').trim()||'manual';
    if(source==='manual'||source==='tray'){
      manualOverrideUntil=Date.now()+MIC_MANUAL_OVERRIDE_MS;
    }
    return vpInvoke('cmd_mic_set_mute',{muted:!!muted}).then(function(st){
      applyMicMuteState(st||{muted:!!muted,available:true});
      return getMicUiState();
    }).catch(function(err){
      console.error('mic mute toggle',err);
      var detail=err&&(err.message||String(err))||'';
      safeToast(detail?(t('micUiToggleFail')+'：'+detail):t('micUiToggleFail'));
      throw err;
    });
  }

  function safeToast(msg){
    try{
      var h=hooks();
      if(h&&h.toast) h.toast(msg);
    }catch(_){}
  }

  function openMicPicker(){
    var h=hooks();
    if(h&&h.openSettings) h.openSettings({panel:'voiceWake',focus:'mic'});
  }

  function openAutoMute(){
    try{
      var am=global.OneToneCameraAutoMute;
      if(am&&typeof am.ensureAutoMuteCameraGate==='function'){
        // No camera / camera off → keep Auto Mute disabled by default.
        am.ensureAutoMuteCameraGate({toast:true});
      }
      var drawer=global.OneToneSettingsDrawer;
      if(drawer&&drawer.open) drawer.open({panel:'camera'});
      else if(hooks().openSettings) hooks().openSettings({panel:'camera'});
      setTimeout(function(){
        if(global.OneToneCameraWorkflow&&global.OneToneCameraWorkflow.activateTab){
          global.OneToneCameraWorkflow.activateTab('pro');
          global.OneToneCameraWorkflow.activateProSubtab('automute');
        }
        if(am&&typeof am.ensureAutoMuteCameraGate==='function'){
          am.ensureAutoMuteCameraGate({toast:false});
        }
        if(am&&typeof am.syncUi==='function') am.syncUi();
        try{ renderHeroMicStrip(); }catch(_){}
      },0);
    }catch(_){}
  }

  /** Home: toggle in place; Alt/Shift opens camera settings (avoid leaving home by default). */
  function toggleAutoMuteFromHero(e){
    e=e||{};
    if(e.altKey||e.shiftKey){
      openAutoMute();
      return;
    }
    try{
      var am=global.OneToneCameraAutoMute;
      if(!am||typeof am.getSettings!=='function'||typeof am.writeSettings!=='function'){
        openAutoMute();
        return;
      }
      if(typeof am.isCameraLiveForAutoMute==='function'&&!am.isCameraLiveForAutoMute()){
        if(typeof am.ensureAutoMuteCameraGate==='function') am.ensureAutoMuteCameraGate({toast:true});
        else{
          var msg=t('cameraAutoMuteNeedCameraOn');
          try{ if(global.OneToneApp&&global.OneToneApp.toast) global.OneToneApp.toast(msg); }catch(_){}
        }
        try{ renderHeroMicStrip(); }catch(_){}
        return;
      }
      var settings=am.getSettings()||{};
      var next=!settings.enabled;
      am.writeSettings(Object.assign({},settings,{enabled:next}));
      if(!next&&typeof am.ensureAutoMuteCameraGate==='function'){
        // no-op; keep disabled cleanly
      }
      if(typeof am.syncUi==='function') am.syncUi();
      try{ renderHeroMicStrip(); }catch(_){}
    }catch(_){
      openAutoMute();
    }
  }

  function ensureLevelBars(el,cls,count){
    if(!el) return;
    var bars=el.querySelector('.'+cls);
    if(!bars) return;
    var spans=bars.querySelectorAll('span');
    if(!spans.length||spans.length!==count) bars.innerHTML=buildMicLevelBars(count);
  }

  function setSurfaceStateClass(el,state){
    if(!el||!el.classList) return;
    ['ready','muted','missing','recovering','checking'].forEach(function(k){
      el.classList.toggle('is-'+k,state.key===k);
    });
  }

  function formatMutedFact(st){
    if(!st||!st.muteKnown) return t('micUiMuteChecking');
    return st.muted?t('micUiMutedYes'):t('micUiMutedNo');
  }

  var micMuteProbeArmed=false;
  function armMicMuteProbe(){
    if(micMuteProbeArmed) return;
    micMuteProbeArmed=true;
    refreshMicUiState().catch(function(){});
  }

  function renderHeroMicStrip(){
    var hub=$('wbHeroMic');
    if(!hub||hub.hidden) return;
    bindMicUi();
    armMicMuteProbe();
    var st=getMicUiState();
    ensureLevelBars(hub,'mic-level-bars--hero',8);
    updateMicLevelBars(st.deviceId||activeMicId||'',homeMicLastLevel);
    setSurfaceStateClass(hub,st);
    var skipVoiceSurface=hub.classList.contains('is-voice-surface');
    var status=$('wbHeroMicStatus');
    if(status&&!skipVoiceSurface) status.textContent=st.label;
    var guide=$('wbHeroMicMuteHint');
    if(guide){
      var showGuide=st.key==='muted'&&st.muteKnown&&st.canToggleMute;
      guide.hidden=!showGuide;
      guide.textContent=showGuide?t('micUiTapToUnmute'):'';
    }
    var toggle=$('wbHeroMicToggle');
    if(toggle){
      toggle.disabled=!st.canToggleMute&&!st.canPickDevice;
      if(st.muteKnown){
        toggle.setAttribute('aria-pressed',st.muted?'true':'false');
        toggle.setAttribute('aria-label',st.muted?t('micUiUnmute'):t('micUiMute'));
      }else{
        toggle.removeAttribute('aria-pressed');
        toggle.setAttribute('aria-label',t('micUiMuteChecking'));
      }
      // Device name lives in title — status label stays 「麦克风可用」, not a device pill.
      toggle.title=(st.deviceName||t('micUiDeviceMissing'))+' · '+t('micUiStatusTip');
    }
    hub.title=(st.deviceName||'')+' · '+st.label;
    if(micLevelUiVisible()&&!micPollTimer) startMicLevelPoll();
  }

  function renderGlobalMicHub(){
    renderHeroMicStrip();
  }

  function renderSnapMicCheck(){
    var card=$('cameraSnapMicCheck');
    if(!card) return;
    bindMicUi();
    var st=getMicUiState();
    ensureLevelBars(card,'mic-level-bars--snap',10);
    setSurfaceStateClass(card,st);
    var status=$('cameraSnapMicStatus');
    if(status) status.textContent=st.label;
    var device=$('cameraSnapMicDevice');
    if(device) device.textContent=st.deviceName||t('micUiDeviceMissing');
    var muted=$('cameraSnapMicMuted');
    if(muted) muted.textContent=formatMutedFact(st);
    var input=$('cameraSnapMicInput');
    if(input) input.textContent=st.hasLevel?t('micUiInputDetected'):t('micUiInputQuiet');
    var hint=$('cameraSnapMicHint');
    if(hint){
      if(st.key==='missing') hint.textContent=t('cameraSnapMicHintMissing');
      else if(st.key==='recovering') hint.textContent=t('cameraSnapMicHintRecovering');
      else if(st.key==='muted') hint.textContent=t('cameraSnapMicHintMuted');
      else hint.textContent=t('cameraSnapMicHintReady');
    }
    var toggle=$('cameraSnapMicToggle');
    if(toggle){
      toggle.disabled=!st.canToggleMute;
      if(st.muteKnown){
        toggle.textContent=st.muted?t('micUiUnmute'):t('micUiMute');
      }else{
        toggle.textContent=t('micUiMuteChecking');
      }
    }
  }

  function renderMicSurfaces(){
    renderGlobalMicHub();
    renderSnapMicCheck();
  }

  function bindTrayMicSync(){
    if(trayMicBound) return;
    var ipc=global.OneToneIpc;
    if(!ipc||typeof ipc.listen!=='function') return;
    trayMicBound=true;
    ipc.listen('mic_tray_state',function(ev){
      var st=ev&&ev.payload;
      if(st) applyMicMuteState(st);
    }).catch(function(){
      trayMicBound=false;
    });
  }

  function bindMicUi(){
    bindTrayMicSync();
    if(micUiBound) return;
    micUiBound=true;
    document.addEventListener('click',function(e){
      var target=e.target&&e.target.closest?e.target.closest('[data-mic-ui-action]'):null;
      if(!target) return;
      var act=target.getAttribute('data-mic-ui-action');
      if(act==='toggle'){
        e.preventDefault();
        // Alt/Shift → change mic (replaces the old device pill).
        if(e.altKey||e.shiftKey){
          openMicPicker();
          return;
        }
        var st=getMicUiState();
        if(!st.muteKnown||!st.canToggleMute) return;
        setMicUiMuted(!st.muted,{source:'manual'}).catch(function(){});
      }else if(act==='pick'){
        e.preventDefault();
        openMicPicker();
      }else if(act==='automute'){
        e.preventDefault();
        toggleAutoMuteFromHero(e);
      }else if(act==='automute-settings'){
        e.preventDefault();
        openAutoMute();
      }else if(act==='refresh'){
        e.preventDefault();
        refreshMicUiState({manual:true,forceDevices:true}).catch(function(){});
      }
    });
  }

  global.OneToneAppMic={
    buildMicLevelBars:buildMicLevelBars,
    syncHomeMicPickState:syncHomeMicPickState,
    updateMicLevelBars:updateMicLevelBars,
    clearMicBackoff:clearMicBackoff,
    voiceCaptureActive:voiceCaptureActive,
    micLevelUiVisible:micLevelUiVisible,
    syncHomeMicMonitor:syncHomeMicMonitor,
    startMicLevelPoll:startMicLevelPoll,
    stopMicLevelPoll:stopMicLevelPoll,
    renderMicDevices:renderMicDevices,
    renderHomeMicCurrent:renderHomeMicCurrent,
    startMicMonitor:startMicMonitor,
    stopMicMonitor:stopMicMonitor,
    loadMicDevices:loadMicDevices,
    handleMicMonitorError:handleMicMonitorError,
    devices:function(){ return micDevices; },
    listLoaded:function(){ return micListLoaded; },
    activeMicId:function(){ return activeMicId; },
    activeMicLabel:activeMicLabel,
    resolveMicSurfaceKey:resolveMicSurfaceKey,
    getMicUiState:getMicUiState,
    refreshMicUiState:refreshMicUiState,
    setMicUiMuted:setMicUiMuted,
    isMicManualOverrideActive:isMicManualOverrideActive,
    applyMicMuteState:applyMicMuteState,
    renderMicSurfaces:renderMicSurfaces,
    barCountForWrap:barCountForWrap,
    micRecoveryTimer:function(){ return micRecoveryTimer; },
    clearMicRecoveryTimer:function(){ clearTimeout(micRecoveryTimer); micRecoveryTimer=0; },
    hasMicPollTimer:function(){ return !!micPollTimer; }
  };

  if(global.document&&global.document.readyState==='loading'){
    global.document.addEventListener('DOMContentLoaded',function(){ try{ renderMicSurfaces(); }catch(_){} });
  }else{
    try{ renderMicSurfaces(); }catch(_){}
  }
})((typeof window!=='undefined')?window:globalThis);
