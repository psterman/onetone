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
    var globalHub=$('globalMicHub');
    if(globalHub) pushTarget(globalHub);
    var snapCheck=$('cameraSnapMicCheck');
    if(snapCheck) pushTarget(snapCheck);
    return targets;
  }

  function syncHomeMicPickState(_loading){
  }

  function updateMicLevelBars(deviceId,level){
    var targets=resolveMicLevelTargets(deviceId);
    homeMicLastLevel=Number(level)||0;
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
    if($('globalMicHub')) return true;
    var snapPanel=$('cameraProSubSnap');
    if(snapPanel&&!snapPanel.hidden) return true;
    if(onboardingMicContextOpen()) return true;
    return !ui.drawerOpen;
  }

  function micAutoRefreshAllowed(){
    return micLevelUiVisible()
      &&!voiceCaptureActive()
      &&global.OneToneMappingRecording.mode()==='none'
      &&!micBackoffActive()
      &&!micDeviceRefreshInFlight;
  }

  function micLevelPollAllowed(){
    if(onboardingMicContextOpen()) return true;
    if(voiceCaptureActive()) return false;
    return micLevelUiVisible();
  }

  function syncHomeMicMonitor(){
    if(!micLevelUiVisible()||voiceCaptureActive()) return Promise.resolve();
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
    if(voiceCaptureActive()) return 0;
    if(ui.drawerOpen&&ui.settingsPanel==='voiceWake') return 400;
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
    startMicDeviceRefresh();
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
      replaceMicDevices(Array.isArray(devices)?devices:[]);
      var nextId=resolveActiveMicId(micDevices,prevId);
      var reconnect=nextId!==activeMicId||!micMonitorDeviceId||micMonitorDeviceId!==nextId;
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
    var payload={};
    if(deviceId) payload.device_id=deviceId;
    if(opts.force) payload.force=true;
    micMonitorDeviceId=deviceId||'';
    return stopMicMonitor().then(function(){
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
    hooks().renderVoiceSettingsFlow();
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
      var pick=micDevices.find(function(d){ return d.id===activeMicId; });
      if(!micDeviceAvailable(pick)){
        micMonitorDeviceId='';
        if(micLevelUiVisible()) startMicLevelPoll();
        if(manual&&prevId) hooks().toast(t('micOfflineHint'));
        return;
      }
      return ensureMicMonitor(activeMicId||null,{force:manual}).then(function(){
        if(micLevelUiVisible()) startMicLevelPoll();
        if(opts.reconnect) hooks().toast(t('micReconnected'));
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

  function getMicUiState(){
    var dev=micDevices.find(function(d){ return d.id===activeMicId; })
      ||micDevices.find(function(d){ return d.isDefault; })
      ||micDevices[0]||null;
    var recovering=micBackoffActive()||!!micRecoveryTimer||!!micDeviceRefreshInFlight;
    var hasDevice=!!(dev&&micDeviceAvailable(dev)&&micSystemAvailable!==false);
    var key='ready';
    if(recovering&&!hasDevice) key='recovering';
    else if(!hasDevice) key='missing';
    else if(!micMuteKnown) key='checking';
    else if(micMuted) key='muted';
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

  function refreshMicUiState(opts){
    opts=opts||{};
    var prep=(!micListLoaded||opts.forceDevices)
      ?loadMicDevices({manual:!!opts.manual}).catch(function(){})
      :Promise.resolve();
    return prep.then(function(){
      return vpInvoke('cmd_mic_get_mute',{}).then(function(st){
        return applyMicMuteState(st);
      }).catch(function(){
        micSystemAvailable=micDevices.length>0;
        renderMicSurfaces();
        return getMicUiState();
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
      var drawer=global.OneToneSettingsDrawer;
      if(drawer&&drawer.open) drawer.open({panel:'camera'});
      else if(hooks().openSettings) hooks().openSettings({panel:'camera'});
      setTimeout(function(){
        if(global.OneToneCameraWorkflow&&global.OneToneCameraWorkflow.activateTab){
          global.OneToneCameraWorkflow.activateTab('pro');
          global.OneToneCameraWorkflow.activateProSubtab('automute');
        }
      },0);
    }catch(_){}
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

  function renderGlobalMicHub(){
    var hub=$('globalMicHub');
    if(!hub) return;
    bindMicUi();
    var st=getMicUiState();
    ensureLevelBars(hub,'mic-level-bars--global',8);
    setSurfaceStateClass(hub,st);
    var status=$('globalMicHubStatus');
    if(status) status.textContent=st.label;
    var device=$('globalMicHubDevice');
    if(device) device.textContent=st.deviceName||t('micUiDeviceMissing');
    var toggle=$('globalMicHubToggle');
    if(toggle){
      toggle.disabled=!st.canToggleMute;
      if(st.muteKnown){
        toggle.setAttribute('aria-pressed',st.muted?'true':'false');
        toggle.textContent=st.muted?t('micUiUnmute'):t('micUiMute');
      }else{
        toggle.removeAttribute('aria-pressed');
        toggle.textContent=t('micUiMuteChecking');
      }
    }
    hub.title=(st.deviceName||'')+' · '+st.label;
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
    var eventApi=global.__TAURI__&&global.__TAURI__.event;
    if(!eventApi||typeof eventApi.listen!=='function') return;
    trayMicBound=true;
    eventApi.listen('mic_tray_state',function(ev){
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
        var st=getMicUiState();
        if(!st.muteKnown||!st.canToggleMute) return;
        setMicUiMuted(!st.muted,{source:'manual'}).catch(function(){});
      }else if(act==='pick'){
        e.preventDefault();
        openMicPicker();
      }else if(act==='automute'){
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
