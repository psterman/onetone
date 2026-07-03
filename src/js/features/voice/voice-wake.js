(function(global){
  'use strict';
  var $=function(id){ return global.OneToneDom.$(id); };
  var t=function(key){ return global.OneToneI18n.t(key); };
  function state(){ return global.OneToneState.state; }
  function ui(){ return global.OneToneState.ui; }
  function runtime(){ return global.OneToneState.runtime; }
  function hooks(){ return global.__vp_voice_wake_hooks__ || {}; }
  var voiceWakeExpandedMode='sapi';
  var voiceModeSwitchPending=false;
  var voiceSapiTogglePending=false;
  var voiceVoskTogglePending=false;
  var lastVoiceSapiLiveFp='';
  var lastVoiceVoskLiveFp='';
  var lastVoicePollWakeFp='';
  var voiceStatusPollTimer=0;
  var voiceStatusPollInFlight=false;
  var voiceStatusPollStarted=false;
  var voiceSapiPresetPending=null;
  var voiceSapiPresetSaveSeq=0;
  var voiceSapiSelectedPhrases=[];
  var voiceSapiPresetSaveChain=Promise.resolve();

  function normalizePhraseList(list){
    return (Array.isArray(list)?list:[]).map(function(x){ return String(x||'').trim(); }).filter(Boolean);
  }

  function phraseListsEqual(a,b){
    const na=normalizePhraseList(a).sort();
    const nb=normalizePhraseList(b).sort();
    if(na.length!==nb.length) return false;
    for(var i=0;i<na.length;i++){
      if(na[i]!==nb[i]) return false;
    }
    return true;
  }

  function currentSapiPresetPhrases(){
    if(voiceSapiPresetPending&&voiceSapiPresetPending.length) return voiceSapiPresetPending.slice();
    if(voiceSapiSelectedPhrases.length) return voiceSapiSelectedPhrases.slice();
    const cfg=state().config||{};
    const sapi=cfg.voiceSapi||cfg.voice_sapi||{};
    const fromCfg=normalizePhraseList(sapi.phrases);
    return fromCfg.length?fromCfg.slice():['开始输入'];
  }

  function initSapiPresetsFromConfig(){
    const cfg=state().config||{};
    const sapi=cfg.voiceSapi||cfg.voice_sapi||{};
    const phrases=normalizePhraseList(sapi.phrases);
    syncVoiceSapiPresets(phrases.length?phrases:['开始输入']);
  }

  function toggleSapiPhraseSelection(selected,phrase){
    selected=normalizePhraseList(selected);
    phrase=String(phrase||'').trim();
    if(!phrase) return selected;
    const idx=selected.indexOf(phrase);
    if(idx>=0){
      if(selected.length<=1) return selected.slice();
      const next=selected.slice();
      next.splice(idx,1);
      return next;
    }
    return selected.concat([phrase]);
  }
  function voiceWakeStateLabel(raw){
    const labels={stopped:'已停止',stopping:'停止中',starting:'启动中',listening:'等待说话',triggered:'已触发',cooldown:'请稍后再说',error:'出错了'};
    return global.OneToneI18n.getLang()==='zh'?(labels[raw]||raw):raw;
  }

  function voiceWakeNoticeIsTriggered(res, notice){
    const state=res&&res.state;
    if(state==='triggered') return true;
    const text=String(notice||'').trim();
    if(!text) return false;
    return /^已触发/.test(text)||/^Triggered/i.test(text)||/^Shortcut sent/i.test(text);
  }

  function voiceWakeNoticeLabel(res, notice){
    return voiceWakeNoticeIsTriggered(res, notice)?t('voiceWakeTriggered'):t('voiceWakeSkip');
  }

  function voiceNavStatusLine(mode){
    if(currentVoiceMode()!==mode) return t('homeLiveBadgeOff');
    const w=hooks().voiceUiSnapshot.wake||{};
    const res=mode==='sapi'?w.sapi:w.vosk;
    if(res&&res.state) return voiceWakeStateLabel(res.state);
    return t('homeLiveBadgeReady');
  }

  function renderVoiceMicLive(){
    const stateEl=$('voiceMicLiveState');
    const primary=$('voiceMicLivePrimary');
    const secondary=$('voiceMicLiveSecondary');
    const extra=$('voiceMicLiveExtra');
    const progressEl=$('voiceMicLiveProgress');
    const progressFill=$('voiceMicLiveProgressFill');
    const barsEl=$('voiceMicLiveBars');
    if(barsEl&&!barsEl.children.length&&global.OneToneAppMic){
      barsEl.innerHTML=global.OneToneAppMic.buildMicLevelBars(12);
    }
    if(!stateEl||!primary) return;
    const w=hooks().voiceUiSnapshot.wake||{};
    const mode=currentVoiceMode();
    const res=mode==='vosk'?w.vosk:(mode==='sapi'?w.sapi:null);
    const previewMode=mode==='off'?(voiceWakeExpandedMode||'sapi'):mode;
    if(!res||!res.enabled){
      stateEl.textContent=voiceWakeStateLabel('stopped');
      const offKey=previewMode==='vosk'?'voiceVoskOff':'voiceSapiOff';
      const labelKey=previewMode==='vosk'?'voiceVoskPartial':'voiceSapiHeard';
      primary.textContent=t(labelKey)+'：'+t(offKey);
      if(secondary){ secondary.hidden=true; secondary.textContent=''; }
      if(extra){ extra.hidden=true; extra.textContent=''; }
      if(progressEl) progressEl.hidden=true;
      renderSettingsVoiceSubnav();
      return;
    }
    const raw=res.state||'stopped';
    stateEl.textContent=voiceWakeStateLabel(raw);
    const showSapiProgress=mode==='sapi'&&(raw==='starting'||raw==='listening');
    if(progressEl){
      progressEl.hidden=!showSapiProgress;
      progressEl.classList.toggle('is-starting',raw==='starting');
      if(progressFill){
        if(raw==='starting'){
          progressFill.style.width='';
        }else{
          const heard=String(res.lastHeard||'').trim();
          const target=((Array.isArray(res.phrases)?res.phrases:[])[0]||'').trim();
          const pct=heard&&target
            ?Math.min(100,Math.round(heard.length/Math.max(target.length,1)*100))
            :(raw==='listening'?18:0);
          progressFill.style.width=String(pct)+'%';
        }
      }
    }
    if(mode==='sapi'){
      const heard=res.lastHeard||'';
      const skip=res.lastSkip||'';
      const trigger=res.lastTrigger||'';
      const heardText=heard||(raw==='listening'?t('homeLiveHeardWaiting'):t('voiceSapiWaiting'));
      primary.textContent=t('voiceSapiHeard')+'：'+heardText;
      if(secondary){ secondary.hidden=true; secondary.textContent=''; }
      if(extra){
        if(trigger){
          extra.hidden=false;
          extra.textContent=t('voiceWakeTriggered')+'：'+trigger;
        }else if(skip){
          extra.hidden=false;
          extra.textContent=t('voiceWakeSkip')+'：'+skip;
        }else{
          extra.hidden=true;
          extra.textContent='';
        }
      }
    }else{
      const partial=res.lastPartial||'';
      const finalText=res.lastFinal||'';
      const hit=res.lastDetectedPhrase||'';
      const skip=res.lastSkip||'';
      const trigger=res.lastTrigger||'';
      const partialText=partial||(raw==='listening'?t('homeLiveHeardWaiting'):t('voiceVoskWaiting'));
      primary.textContent=t('voiceVoskPartial')+'：'+partialText;
      if(secondary){
        secondary.hidden=false;
        secondary.textContent=t('voiceVoskFinal')+'：'+(finalText||t('voiceVoskNone'));
      }
      if(extra){
        const parts=[];
        if(hit) parts.push(t('voiceVoskHit')+'：'+hit);
        if(trigger) parts.push(t('voiceWakeTriggered')+'：'+trigger);
        else if(skip) parts.push(t('voiceWakeSkip')+'：'+skip);
        if(parts.length){
          extra.hidden=false;
          extra.textContent=parts.join(' · ');
        }else{
          extra.hidden=true;
          extra.textContent='';
        }
      }
    }
    renderSettingsVoiceSubnav();
  }

  function renderSettingsVoiceSubnav(){
    const subnav=$('settingsVoiceSubnav');
    const listEl=$('settingsVoiceSubnavList');
    const voicePanel=$('settingsPanelVoiceWake');
    const sidebar=document.querySelector('.settings-sidebar');
    const show=ui().drawerOpen&&ui().settingsPanel==='voiceWake';
    if(subnav) subnav.hidden=!show;
    if(voicePanel) voicePanel.classList.toggle('is-voice-subnav',show);
    if(sidebar) sidebar.classList.toggle('is-voice-panel',show);
    if(listEl) listEl.setAttribute('aria-label',t('settingsVoiceSubnavLabel'));
    if(!show||!listEl) return;
    const modes=[
      {mode:'sapi',title:t('voiceModeLiteTitle'),sub:t('voiceModeLiteEngine')},
      {mode:'vosk',title:t('voiceModeProTitle'),sub:t('voiceModeProEngine')}
    ];
    let html='';
    modes.forEach(function(item){
      const sel=voiceWakeExpandedMode===item.mode;
      const on=currentVoiceMode()===item.mode;
      const status=voiceNavStatusLine(item.mode);
      html+='<button type="button" class="settings-scheme-subnav-item'+(sel?' is-selected':'')+(on?' is-on':'')+'" data-voice-nav="'+item.mode+'" role="tab" aria-selected="'+(sel?'true':'false')+'">';
      html+='<span class="settings-scheme-subnav-dot" aria-hidden="true"></span>';
      html+='<span class="settings-scheme-subnav-text">';
      html+='<span class="settings-scheme-subnav-pair">'+hooks().escHtml(item.title)+'</span>';
      html+='<span class="settings-scheme-subnav-status">'+hooks().escHtml(item.sub)+' · '+hooks().escHtml(status)+'</span>';
      html+='</span></button>';
    });
    listEl.innerHTML=html;
  }
  function mergeWakeSnapshot(sapiRes,voskRes){
    sapiRes=sapiRes||{};
    voskRes=voskRes||{};
    const voskOn=!!voskRes.enabled;
    const sapiOn=!!sapiRes.enabled;
    let engine='none',phrase='',state='off';
    if(voskOn){
      engine='vosk';
      const cn=Array.isArray(voskRes.phrasesCn)?voskRes.phrasesCn:[];
      const en=Array.isArray(voskRes.phrasesEn)?voskRes.phrasesEn:[];
      phrase=(cn[0]||en[0]||'').trim();
      state=voskRes.state||'stopped';
    }else if(sapiOn){
      engine='sapi';
      const phrases=Array.isArray(sapiRes.phrases)?sapiRes.phrases:[];
      phrase=(phrases[0]||'').trim();
      state=sapiRes.state||'stopped';
    }
    return {engine,voskEnabled:voskOn,sapiEnabled:sapiOn,phrase,state,sapi:sapiRes,vosk:voskRes};
  }
  function syncVoiceSapiConfigFromStatus(res){
    if(!state().config||!res) return;
    const cfg=state().config.voiceSapi||state().config.voice_sapi||(state().config.voiceSapi={});
    state().config.voiceSapi=cfg;
    cfg.enabled=!!res.enabled;
    if(voiceSapiPresetPending) cfg.phrases=hooks().cloneStringList(voiceSapiPresetPending);
    else if(Array.isArray(res.phrases)&&res.phrases.length) cfg.phrases=hooks().cloneStringList(res.phrases);
    if(res.targetKey!=null) cfg.targetKey=String(res.targetKey||'').trim();
    if(res.cooldownMs!=null) cfg.cooldownMs=Number(res.cooldownMs)||2000;
    if(res.minConfidence!=null) cfg.minConfidence=Number(res.minConfidence)||0.35;
  }

  function syncVoiceVoskConfigFromStatus(res){
    if(!state().config||!res) return;
    const cfg=state().config.voiceVosk||state().config.voice_vosk||(state().config.voiceVosk={});
    state().config.voiceVosk=cfg;
    cfg.enabled=!!res.enabled;
    if(Array.isArray(res.phrases)) cfg.phrases=hooks().cloneStringList(res.phrases);
    if(res.targetKey!=null) cfg.targetKey=String(res.targetKey||'').trim();
    if(res.cooldownMs!=null) cfg.cooldownMs=Number(res.cooldownMs)||2000;
    if(res.modelPath!=null) cfg.modelPath=String(res.modelPath||'').trim();
    if(res.modelPreset!=null) cfg.modelPreset=String(res.modelPreset||'').trim();
  }

  function currentVoiceMode(){
    const w=hooks().voiceUiSnapshot.wake||{};
    if(w.engine==='vosk'||w.voskEnabled) return 'vosk';
    if(w.engine==='sapi'||w.sapiEnabled) return 'sapi';
    const cfg=state().config||{};
    const vosk=cfg.voiceVosk||cfg.voice_vosk;
    const sapi=cfg.voiceSapi||cfg.voice_sapi;
    if(vosk&&vosk.enabled) return 'vosk';
    if(sapi&&sapi.enabled) return 'sapi';
    return 'off';
  }

  function isVoiceModeCardInteractiveTarget(target){
    return !!(target&&target.closest&&target.closest('button, input, a, [role="tab"], .voice-sapi-preset, .voice-sapi-range, .control-btn, .toggle-switch'));
  }
  function bindVoiceModeCard(cardId,mode){
    const card=$(cardId);
    if(!card) return;
    card.removeAttribute('role');
    card.removeAttribute('tabindex');
    card.removeAttribute('aria-pressed');
  }
  function setVoiceModeCardBusy(busy){
    ['btnVoiceModeSapi','btnVoiceModeVosk'].forEach(function(id){
      const card=$(id);
      if(card){
        card.classList.toggle('is-busy',!!busy);
        card.setAttribute('aria-busy',busy?'true':'false');
      }
    });
  }

  function syncVoiceWakeExpandedUi(){
    const mode=voiceWakeExpandedMode||'sapi';
    const sapiCard=$('btnVoiceModeSapi');
    const voskCard=$('btnVoiceModeVosk');
    const sapiBlock=$('voiceSapiBlock');
    const voskBlock=$('voiceVoskBlock');
    if(sapiBlock) sapiBlock.hidden=false;
    if(voskBlock) voskBlock.hidden=false;
    if(sapiCard){
      sapiCard.hidden=mode!=='sapi';
      sapiCard.classList.toggle('is-editing',mode==='sapi');
    }
    if(voskCard){
      voskCard.hidden=mode!=='vosk';
      voskCard.classList.toggle('is-editing',mode==='vosk');
    }
  }

  function setVoiceWakeExpandedMode(mode){
    if(mode!=='sapi'&&mode!=='vosk') return;
    voiceWakeExpandedMode=mode;
    syncVoiceWakeExpandedUi();
    renderVoiceMicLive();
    global.OneToneVoiceEnd.syncModeUi(false);
  }

  function renderVoiceModeSwitch(){
    const mode=currentVoiceMode();
    const endEnabled=global.OneToneVoiceEnd.enabledInConfig();
    const sapiCard=$('btnVoiceModeSapi');
    const voskCard=$('btnVoiceModeVosk');
    const currentEl=$('voiceModeCurrent');
    const hintEl=$('voiceModeHint');
    if(sapiCard){
      sapiCard.classList.toggle('is-active',mode==='sapi');
    }
    if(voskCard){
      voskCard.classList.toggle('is-active',mode==='vosk');
    }
    syncVoiceWakeExpandedUi();
    if(currentEl){
      if(mode==='sapi') currentEl.textContent=t('voiceModeCurrentLite');
      else if(mode==='vosk') currentEl.textContent=t('voiceModeCurrentPro');
      else currentEl.textContent=t('voiceModeCurrentOff');
    }
    if(hintEl){
      if(mode==='sapi') hintEl.textContent=t('voiceModeHintLite');
      else if(mode==='vosk') hintEl.textContent=endEnabled?t('voiceModeHintProWithEnd'):t('voiceModeHintPro');
      else hintEl.textContent=t('voiceModeHintOff');
    }
    hooks().renderVoiceModeUsage();
    setVoiceModeCardBusy(voiceModeSwitchPending);
    global.OneToneVoiceEnd.syncModeUi(false);
    renderSettingsVoiceSubnav();
    hooks().renderVoiceSettingsFlow();
  }

  function switchVoiceMode(mode, opts){
    opts=opts||{};
    const toastKind=opts.toastKind||'default';
    const toastLite=toastKind==='lite';
    function modeToast(){
      if(toastLite) hooks().toast(mode==='sapi'?t('voiceNavToastLite'):t('voiceNavToastPro'),'lite');
      else hooks().toast(mode==='sapi'?t('voiceModeSwitchedLite'):t('voiceModeSwitchedPro'));
    }
    if(voiceModeSwitchPending) return;
    if(mode!=='sapi'&&mode!=='vosk') return;
    hooks().markVoiceEngineBootHandled();
    setVoiceWakeExpandedMode(mode);
    if(currentVoiceMode()===mode){
      modeToast();
      return;
    }
    voiceModeSwitchPending=true;
    renderVoiceModeSwitch();
    const done=function(){
      voiceModeSwitchPending=false;
      renderVoiceModeSwitch();
    };
    if(mode==='sapi'){
      global.OneToneIpc.invoke('cmd_voice_sapi_set_enabled',{enabled:true}).then(function(res){
        renderVoiceSapiStatus(res);
        if(!handleVoiceSapiEnableResult(res,true)) return;
        hooks().syncHomeFromVoiceSettings({enabled:false,state:'stopped'},res,null);
        modeToast();
        scheduleVoiceToggleRefresh();
      }).catch(function(err){
        loadVoiceSapiStatus();
        const msg=err&&err.message?String(err.message).trim():'';
        hooks().toast(msg||t('voiceSapiFail'));
        console.error('voice_mode_sapi',err);
      }).finally(done);
      return;
    }
    global.OneToneIpc.invoke('cmd_voice_vosk_set_enabled',{enabled:true}).then(function(res){
      renderVoiceVoskStatus(res);
      hooks().syncHomeFromVoiceSettings(res,{enabled:false,state:'stopped'},null,{lightOnly:true});
      modeToast();
      scheduleVoiceToggleRefresh();
    }).catch(function(err){
      loadVoiceVoskStatus();
      hooks().toast(t('voiceVoskFail'));
      console.error('voice_mode_vosk',err);
    }).finally(done);
  }

  function settingsPanelNeedsVoicePoll(){
    if(!ui().drawerOpen) return false;
    const p=ui().settingsPanel;
    return p==='voiceWake'||p==='debug';
  }

  function voiceStatusPollNeeded(){
    if(hooks().welcomeOpen()) return false;
    const snap=hooks().voiceUiSnapshot.end||{};
    return voiceWakeEnabledInConfig()
      ||global.OneToneVoiceEnd.enabledInConfig()
      ||hooks().sessionActiveState(snap.state||'idle')
      ||settingsPanelNeedsVoicePoll();
  }

  function voicePollIntervalMs(){
    if(!voiceStatusPollNeeded()) return 2500;
    const w=hooks().voiceUiSnapshot.wake||{};
    const voskState=(w.vosk&&w.vosk.state)||'';
    const sapiState=(w.sapi&&w.sapi.state)||'';
    if(voskState==='starting'||sapiState==='starting') return 3000;
    if(document.hidden&&!ui().drawerOpen) return 2000;
    const endSnap=hooks().voiceUiSnapshot.end||{};
    if(hooks().sessionActiveState(endSnap.state||'idle')) return 500;
    if(!ui().drawerOpen) return 2000;
    if(ui().drawerOpen&&!settingsPanelNeedsVoicePoll()) return 2000;
    if(ui().drawerOpen&&(ui().settingsPanel==='debug'||ui().settingsPanel==='voiceWake')) return 1500;
    if(!ui().drawerOpen&&(voiceWakeEnabledInConfig()||global.OneToneVoiceEnd.enabledInConfig())) return 2000;
    if(runtime().paused) return 1500;
    return 1500;
  }

  function scheduleNextVoicePoll(){
    clearTimeout(voiceStatusPollTimer);
    voiceStatusPollTimer=setTimeout(function(){
      voiceStatusPollTick();
      scheduleNextVoicePoll();
    },voicePollIntervalMs());
  }

  function voiceWakeLiveFingerprint(res){
    if(!res) return '';
    return [
      res.state||'',
      res.lastError||'',
      res.lastHeard||'',
      res.lastPartial||'',
      res.lastFinal||'',
      res.lastSkip||'',
      res.lastTrigger||'',
      res.lastDetectedPhrase||''
    ].join('|');
  }

  function voiceStatusPollTick(){
    if(!voiceStatusPollNeeded()) return;
    if(voiceStatusPollInFlight) return;
    voiceStatusPollInFlight=true;
    const cfg=state().config||{};
    const sapiCfg=cfg.voiceSapi||cfg.voice_sapi;
    const voskCfg=cfg.voiceVosk||cfg.voice_vosk;
    const snap=hooks().voiceUiSnapshot.end||{};
    const panel=ui().settingsPanel;
    const drawerVoice=ui().drawerOpen&&settingsPanelNeedsVoicePoll();
    const homeVoice=true;
    const homeEnd=true;
    const needEnd=global.OneToneVoiceEnd.enabledInConfig()
      ||hooks().sessionActiveState(snap.state||'idle')
      ||(drawerVoice&&(panel==='voiceWake'||panel==='debug'))
      ||homeEnd;
    const needSapi=(sapiCfg&&sapiCfg.enabled)
      &&(!ui().drawerOpen||(drawerVoice&&(panel==='voiceWake'||panel==='debug')))
      ||(homeVoice&&!!(sapiCfg&&sapiCfg.enabled));
    const needVosk=(voskCfg&&voskCfg.enabled)
      &&(!ui().drawerOpen||(drawerVoice&&(panel==='voiceWake'||panel==='debug')))
      ||(homeVoice&&!!(voskCfg&&voskCfg.enabled));
    const pEnd=needEnd?global.OneToneIpc.invoke('cmd_voice_end_status',{}).catch(function(){return null;}):Promise.resolve(null);
    const pSapi=needSapi?global.OneToneIpc.invoke('cmd_voice_sapi_status',{}).catch(function(){return null;}):Promise.resolve(null);
    const pVosk=needVosk?global.OneToneIpc.invoke('cmd_voice_vosk_status',{}).catch(function(){return null;}):Promise.resolve(null);
    Promise.all([pEnd,pSapi,pVosk]).then(function(arr){
      try{
        const endRes=arr[0],sapiRes=arr[1],voskRes=arr[2];
        const snap=hooks().voiceUiSnapshot;
        if(!snap) return;
        if(endRes) snap.end=endRes;
        if(sapiRes||voskRes) snap.wake=mergeWakeSnapshot(sapiRes,voskRes);
        const wakeFp=voiceWakeLiveFingerprint(sapiRes||{})+'|'+voiceWakeLiveFingerprint(voskRes||{})+'|'+(endRes&&endRes.state||'');
        if(wakeFp===lastVoicePollWakeFp&&!ui().drawerOpen){
          return;
        }
        lastVoicePollWakeFp=wakeFp;
        hooks().scheduleVoiceUiRender(ui().drawerOpen?{sapi:sapiRes,vosk:voskRes,end:endRes}:null);
      }catch(err){
        console.error('voiceStatusPollTick',err);
      }
    }).catch(function(err){
      console.error('voiceStatusPollTick ipc',err);
    }).finally(function(){
      voiceStatusPollInFlight=false;
    });
  }

  function startVoiceStatusPoll(){
    if(voiceStatusPollTimer||voiceStatusPollStarted) return;
    voiceStatusPollStarted=true;
    setTimeout(function(){
      voiceStatusPollTick();
      scheduleNextVoicePoll();
    }, 500);
  }
  function refreshDrawerMicAfterVoiceToggle(){
    if(hooks().voiceCaptureActive()){
      hooks().stopMicMonitor();
      if(hooks().micLevelUiVisible()&&!hooks().hasMicPollTimer()) hooks().startMicLevelPoll();
      return;
    }
    if(ui().drawerOpen&&ui().settingsPanel==='sounds'){
      hooks().loadMicDevices().then(function(){
        if(ui().drawerOpen&&ui().settingsPanel==='sounds') hooks().startMicLevelPoll();
      });
      return;
    }
    hooks().syncHomeMicMonitor().catch(function(){});
  }
  function syncVoiceSapiToggle(enabled){
    const btn=$('btnVoiceSapi');
    if(!btn) return;
    btn.classList.toggle('is-on',!!enabled);
    btn.setAttribute('aria-checked',enabled?'true':'false');
  }

  function renderVoiceSapiStatus(res,opts){
    opts=opts||{};
    if(!res) return;
    const liveOnly=!!opts.liveOnly;
    const fp=voiceWakeLiveFingerprint(res);
    if(liveOnly&&fp===lastVoiceSapiLiveFp) return;
    if(liveOnly) lastVoiceSapiLiveFp=fp;
    else lastVoiceSapiLiveFp='';
    if(!liveOnly){
      syncVoiceSapiConfigFromStatus(res);
      syncVoiceSapiToggle(!!res.enabled);
      const serverPhrases=normalizePhraseList(res.phrases);
      if(voiceSapiPresetPending){
        if(serverPhrases.length&&phraseListsEqual(serverPhrases,voiceSapiPresetPending)) voiceSapiPresetPending=null;
        syncVoiceSapiPresets(voiceSapiPresetPending);
      }else if(serverPhrases.length){
        syncVoiceSapiPresets(serverPhrases);
      }
      const confidenceEl=$('voiceSapiConfidence');
      const confidenceLabel=$('voiceSapiConfidenceLabel');
      const conf=Number(res.minConfidence==null?0.35:res.minConfidence);
      if(confidenceEl && document.activeElement!==confidenceEl){
        confidenceEl.value=String(conf);
      }
      if(confidenceLabel){
        confidenceLabel.textContent=t('voiceSapiSensitivity')+' '+conf.toFixed(2);
      }
      renderVoiceSapiSetupNotice(res);
    }
    const heard=res.lastHeard||'';
    const skip=res.lastSkip||'';
    const phrases=Array.isArray(res.phrases)?res.phrases:[];
    const errEl=$('voiceSapiError');
    if(errEl){
      const err=res.lastError||'';
      if(err){
        errEl.hidden=false;
        errEl.textContent=err;
      }else{
        errEl.hidden=true;
        errEl.textContent='';
      }
    }
    if(!liveOnly||ui().settingsPanel==='debug'){
      global.OneToneVoiceDiag.updateMetric('sapi','state',voiceWakeStateLabel(res.state||'stopped'),t('voiceDiagLogState'));
      global.OneToneVoiceDiag.updateMetric('sapi','phrases',phrases.length?phrases.join(' / '):'',t('voiceSapiWakeWord'));
      global.OneToneVoiceDiag.updateMetric('sapi','heard',heard,t('voiceDiagLogHeard'));
      global.OneToneVoiceDiag.updateMetric('sapi','skip',skip,t('voiceDiagLogSkip'));
      global.OneToneVoiceDiag.updateMetric('sapi','error',res.lastError||'',t('voiceDiagLogError'));
    }
    renderVoiceMicLive();
    if(!liveOnly) renderVoiceModeSwitch();
  }

  function loadVoiceSapiStatus(){
    voiceStatusPollTick();
    return Promise.resolve(hooks().voiceUiSnapshot.wake&&hooks().voiceUiSnapshot.wake.sapi);
  }


  function voiceSapiEnabledNow(){
    const w=hooks().voiceUiSnapshot.wake||{};
    if(w.sapi&&w.sapi.enabled) return true;
    const cfg=state().config||{};
    const sapi=cfg.voiceSapi||cfg.voice_sapi;
    return !!(sapi&&sapi.enabled);
  }

  function voiceVoskEnabledNow(){
    const w=hooks().voiceUiSnapshot.wake||{};
    if(w.vosk&&w.vosk.enabled) return true;
    const cfg=state().config||{};
    const vosk=cfg.voiceVosk||cfg.voice_vosk;
    return !!(vosk&&vosk.enabled);
  }

  function voiceSapiErrorMessage(res){
    const err=res&&(res.lastError||res.last_error||'');
    if(String(err||'').trim()) return String(err).trim();
    return t('voiceSapiFail');
  }

  function voiceSapiNeedsSetup(res){
    const err=String((res&&(res.lastError||res.last_error||''))||'').toLowerCase();
    if(!err) return false;
    return /spinprocrecognizer|spmmaudioin|install windows speech|language pack|speech component|class not registered|windows-only/.test(err);
  }

  function renderVoiceSapiSetupNotice(res){
    const box=$('voiceSapiSetupNotice');
    if(!box) return;
    const shouldShow=voiceSapiNeedsSetup(res);
    box.hidden=!shouldShow;
    const title=$('voiceSapiSetupTitle');
    if(title) title.textContent=t('voiceSapiSetupTitle');
    const body=$('voiceSapiSetupBody');
    if(body) body.textContent=t('voiceSapiSetupBody');
    const btn=$('btnVoiceSapiSetup');
    if(btn) btn.textContent=t('voiceSapiSetupAction');
  }

  function openVoiceSapiSetup(){
    global.OneToneIpc.invoke('cmd_open_windows_speech_setup',{}).then(function(){
      hooks().toast(t('voiceSapiSetupOpening'));
    }).catch(function(err){
      const msg=err&&err.message?String(err.message).trim():'';
      hooks().toast(msg||t('voiceSapiSetupOpenFail'));
    });
  }

  function handleVoiceSapiEnableResult(res,next){
    if(next&&res&&res.state==='error'){
      syncVoiceSapiToggle(false);
      hooks().toast(voiceSapiErrorMessage(res));
      return false;
    }
    return true;
  }

  function scheduleVoiceToggleRefresh(){
    const w=hooks().voiceUiSnapshot.wake||{};
    const starting=((w.vosk&&w.vosk.state)==='starting')||((w.sapi&&w.sapi.state)==='starting');
    setTimeout(function(){
      voiceStatusPollTick();
      const w2=hooks().voiceUiSnapshot.wake||{};
      const sapi=w2.sapi||{};
      if(sapi.enabled&&sapi.state==='error'){
        syncVoiceSapiToggle(false);
        hooks().toast(voiceSapiErrorMessage(sapi));
      }
    },starting?1200:500);
  }

  function toggleVoiceSapi(explicitNext){
    if(voiceSapiTogglePending) return;
    const next=explicitNext!=null?!!explicitNext:!voiceSapiEnabledNow();
    const btn=$('btnVoiceSapi');
    const homeBtn=$('btnHomeVoiceToggle');
    hooks().markVoiceEngineBootHandled();
    voiceSapiTogglePending=true;
    if(btn) btn.disabled=true;
    if(homeBtn) homeBtn.disabled=true;
    syncVoiceSapiToggle(next);
    hooks().stopMicMonitor();
    global.OneToneIpc.invoke('cmd_voice_sapi_set_enabled',{enabled:next}).then(function(res){
      renderVoiceSapiStatus(res);
      if(!handleVoiceSapiEnableResult(res,next)) return;
      if(next) syncVoiceVoskToggle(false);
      hooks().syncHomeFromVoiceSettings({enabled:false,state:'stopped'},res);
      if(!next) hooks().syncHomeMicMonitor().catch(function(){});
      scheduleVoiceToggleRefresh();
    }).catch(function(err){
      loadVoiceSapiStatus();
      const msg=err&&err.message?String(err.message).trim():'';
      hooks().toast(msg||t('voiceSapiFail'));
      console.error('voice_sapi',err);
    }).finally(function(){
      voiceSapiTogglePending=false;
      if(btn) btn.disabled=false;
      if(homeBtn) homeBtn.disabled=false;
      hooks().renderHomeLiveZone();
    });
  }

  function testVoiceSapiSend(){
    global.OneToneIpc.invoke('cmd_voice_sapi_test_send',{}).then(function(res){
      let msg=t('testFailed');
      if(res&&res.ok) msg=t('testSent');
      else if(res&&res.reason==='paused') msg=t('testCheckListenFail');
      hooks().toast(msg);
      global.OneToneVoiceDiag.forceLog('sapi',t('voiceDiagLogTest'),msg);
    }).catch(function(){
      hooks().toast(t('testFailed'));
      global.OneToneVoiceDiag.forceLog('sapi',t('voiceDiagLogTest'),t('testFailed'));
    });
  }

  function addVoiceSapiPreset(ev){
    if(ev){
      ev.preventDefault();
      ev.stopPropagation();
    }
    const btn=ev&&ev.target&&ev.target.closest&&ev.target.closest('[data-phrase]');
    if(!btn) return;
    const phrase=btn.getAttribute('data-phrase')||'';
    if(!phrase) return;
    const prevPhrases=currentSapiPresetPhrases();
    const next=toggleSapiPhraseSelection(prevPhrases,phrase);
    if(phraseListsEqual(next,prevPhrases)) return;
    const rollback=prevPhrases.length?prevPhrases.slice():['开始输入'];
    const saveSeq=++voiceSapiPresetSaveSeq;
    voiceSapiPresetPending=next.slice();
    syncVoiceSapiPresets(next);
    if(state().config){
      const cfg=state().config.voiceSapi||state().config.voice_sapi||(state().config.voiceSapi={});
      state().config.voiceSapi=cfg;
      cfg.phrases=hooks().cloneStringList(next);
    }
    hooks().renderVoiceSettingsFlow();
    hooks().renderHomeLiveZone();
    voiceSapiPresetSaveChain=voiceSapiPresetSaveChain.then(function(){
      if(saveSeq!==voiceSapiPresetSaveSeq) return;
      return global.OneToneIpc.invoke('cmd_voice_sapi_set_phrases',{phrases:next});
    }).then(function(res){
      if(saveSeq!==voiceSapiPresetSaveSeq) return;
      if(!res) return;
      const serverPhrases=normalizePhraseList(res.phrases);
      if(serverPhrases.length&&phraseListsEqual(serverPhrases,voiceSapiPresetPending)) voiceSapiPresetPending=null;
      renderVoiceSapiStatus(res);
      hooks().syncHomeFromVoiceSettings(null,res);
      hooks().toast(t('voiceSapiPresetUpdated'));
    }).catch(function(err){
      if(saveSeq!==voiceSapiPresetSaveSeq) return;
      console.error('voice_sapi_preset',err);
      voiceSapiPresetPending=null;
      syncVoiceSapiPresets(rollback);
      if(state().config&&state().config.voiceSapi) state().config.voiceSapi.phrases=hooks().cloneStringList(rollback);
      hooks().renderVoiceSettingsFlow();
      hooks().renderHomeLiveZone();
      hooks().toast(t('voiceSapiFail'));
      loadVoiceSapiStatus();
    });
  }

  function syncVoiceSapiPresets(phrases){
    const selected=normalizePhraseList(phrases);
    if(!selected.length) return;
    voiceSapiSelectedPhrases=selected.slice();
    document.querySelectorAll('#voiceSapiPresets [data-phrase]').forEach(function(btn){
      const phrase=btn.getAttribute('data-phrase')||'';
      btn.classList.toggle('is-selected',selected.indexOf(phrase)>=0);
    });
  }

  function updateVoiceSapiConfidence(saveNow){
    const el=$('voiceSapiConfidence');
    const label=$('voiceSapiConfidenceLabel');
    if(!el) return;
    const value=Number(el.value||0);
    if(label) label.textContent=t('voiceSapiSensitivity')+' '+value.toFixed(2);
    if(!saveNow) return;
    global.OneToneIpc.invoke('cmd_voice_sapi_set_min_confidence',{minConfidence:value}).then(function(res){
      renderVoiceSapiStatus(res);
      hooks().syncHomeFromVoiceSettings(null,res);
    }).catch(function(err){
      console.error('voice_sapi_confidence',err);
      loadVoiceSapiStatus();
    });
  }


  function isEnglishVoskPreset(preset){
    return String(preset||'')==='en-light';
  }

  function currentVoiceVoskPreset(){
    const host=$('voiceVoskModelPreset');
    if(!host) return 'cn-light';
    const active=host.querySelector('[data-preset].is-active');
    return active?(active.getAttribute('data-preset')||'cn-light'):'cn-light';
  }

  function syncVoiceVoskPresetButtons(preset, disabled){
    const host=$('voiceVoskModelPreset');
    if(!host) return;
    host.querySelectorAll('[data-preset]').forEach(function(btn){
      const active=(btn.getAttribute('data-preset')||'')===preset;
      btn.classList.toggle('is-active',active);
      btn.setAttribute('aria-selected',active?'true':'false');
      btn.disabled=!!disabled;
    });
  }

  function activeVoiceVoskPresetRoots(){
    const preset=currentVoiceVoskPreset();
    return [isEnglishVoskPreset(preset)?'#voiceVoskPresetsEn':'#voiceVoskPresetsCn'];
  }

  function updateVoiceVoskPresetPanel(preset){
    const p=preset||currentVoiceVoskPreset();
    const cn=$('voiceVoskPresetsCn');
    const en=$('voiceVoskPresetsEn');
    const cnLabel=$('voiceVoskPresetsCnLabel');
    const enLabel=$('voiceVoskPresetsEnLabel');
    if(!cn||!en) return;
    const enOnly=isEnglishVoskPreset(p);
    cn.hidden=enOnly;
    en.hidden=!enOnly;
    if(cnLabel) cnLabel.hidden=enOnly;
    if(enLabel) enLabel.hidden=!enOnly;
  }

  function renderVoiceVoskStatus(res,opts){
    opts=opts||{};
    if(!res) return;
    const liveOnly=!!opts.liveOnly;
    const fp=voiceWakeLiveFingerprint(res);
    if(liveOnly&&fp===lastVoiceVoskLiveFp) return;
    if(liveOnly) lastVoiceVoskLiveFp=fp;
    else lastVoiceVoskLiveFp='';
    if(!liveOnly){
      syncVoiceVoskConfigFromStatus(res);
      syncVoiceVoskToggle(!!res.enabled);
      const presetEl=$('voiceVoskModelPreset');
      if(presetEl){
        const preset=res.modelPreset||'cn-light';
        const uiPreset=(preset==='auto'||preset==='custom')?'cn-light':preset;
        syncVoiceVoskPresetButtons(uiPreset,voiceVoskTogglePending);
        updateVoiceVoskPresetPanel(uiPreset);
      }
      syncVoiceVoskPresets(res.phrases||[]);
    }
    const partial=res.lastPartial||'';
    const finalText=res.lastFinal||'';
    const skip=res.lastSkip||'';
    const hit=res.lastDetectedPhrase||'';
    const modelPath=res.resolvedModelPath||res.modelPath||'';
    const modelOk=res.modelExists?'OK':'缺失';
    const errEl=$('voiceVoskError');
    if(errEl){
      const err=res.lastError||'';
      if(err){
        errEl.hidden=false;
        errEl.textContent=err;
      }else{
        errEl.hidden=true;
        errEl.textContent='';
      }
    }
    if(!liveOnly||ui().settingsPanel==='debug'){
      const grammar=res.grammarMode===true?'语法限制':(res.grammarMode===false?'自由识别':'—');
      global.OneToneVoiceDiag.updateMetric('vosk','state',voiceWakeStateLabel(res.state||'stopped'),t('voiceDiagLogState'));
      global.OneToneVoiceDiag.updateMetric('vosk','model',modelPath?modelPath+' ('+modelOk+')':'',t('voiceDiagLogModel'));
      global.OneToneVoiceDiag.updateMetric('vosk','final',finalText,t('voiceDiagLogFinal'));
      global.OneToneVoiceDiag.updateMetric('vosk','partial',partial,t('voiceDiagLogHeard'));
      global.OneToneVoiceDiag.updateMetric('vosk','hit',hit,t('voiceDiagLogHit'));
      global.OneToneVoiceDiag.updateMetric('vosk','skip',skip,t('voiceDiagLogSkip'));
      global.OneToneVoiceDiag.updateMetric('vosk','error',res.lastError||'',t('voiceDiagLogError'));
    }
    renderVoiceMicLive();
    if(!liveOnly) renderVoiceModeSwitch();
  }

  function loadVoiceVoskStatus(){
    voiceStatusPollTick();
    return Promise.resolve(hooks().voiceUiSnapshot.wake&&hooks().voiceUiSnapshot.wake.vosk);
  }

  function syncVoiceVoskToggle(enabled){
    const btn=$('btnVoiceVosk');
    if(!btn) return;
    btn.classList.toggle('is-on',!!enabled);
    btn.setAttribute('aria-checked',enabled?'true':'false');
  }


  function toggleVoiceVosk(explicitNext){
    if(voiceVoskTogglePending) return;
    const next=explicitNext!=null?!!explicitNext:!voiceVoskEnabledNow();
    const btn=$('btnVoiceVosk');
    const homeBtn=$('btnHomeVoiceToggle');
    hooks().markVoiceEngineBootHandled();
    voiceVoskTogglePending=true;
    if(btn) btn.disabled=true;
    if(homeBtn) homeBtn.disabled=true;
    syncVoiceVoskToggle(next);
    if(next){
      hooks().stopMicMonitor();
    }
    global.OneToneIpc.invoke('cmd_voice_vosk_set_enabled',{enabled:next}).then(function(res){
      renderVoiceVoskStatus(res);
      if(next) syncVoiceSapiToggle(false);
      hooks().syncHomeFromVoiceSettings(res,{enabled:false,state:'stopped'},null,{lightOnly:true});
      hooks().stopMicMonitor();
      scheduleVoiceToggleRefresh();
      if(!next) hooks().syncHomeMicMonitor().catch(function(){});
    }).catch(function(err){
      loadVoiceVoskStatus();
      const msg=err&&err.message?String(err.message).trim():'';
      hooks().toast(msg||t('voiceVoskFail'));
      console.error('voice_vosk',err);
    }).finally(function(){
      voiceVoskTogglePending=false;
      if(btn) btn.disabled=false;
      if(homeBtn) homeBtn.disabled=false;
      hooks().renderHomeLiveZone();
    });
  }

  function testVoiceVoskSend(){
    global.OneToneIpc.invoke('cmd_voice_vosk_test_send',{}).then(function(res){
      let msg=t('testFailed');
      if(res&&res.ok) msg=t('testSent');
      else if(res&&res.reason==='paused') msg=t('testCheckListenFail');
      hooks().toast(msg);
      global.OneToneVoiceDiag.forceLog('vosk',t('voiceDiagLogTest'),msg);
    }).catch(function(){
      hooks().toast(t('testFailed'));
      global.OneToneVoiceDiag.forceLog('vosk',t('voiceDiagLogTest'),t('testFailed'));
    });
  }

  function addVoiceVoskPreset(ev){
    const btn=ev.target.closest&&ev.target.closest('[data-phrase]');
    if(!btn) return;
    const phrase=btn.getAttribute('data-phrase')||'';
    const root=activeVoiceVoskPresetRoots();
    const selected=[];
    root.forEach(function(r){
      document.querySelectorAll(r+' [data-phrase].is-selected').forEach(function(x){
        const p=x.getAttribute('data-phrase')||'';
        if(p) selected.push(p);
      });
    });
    const idx=selected.indexOf(phrase);
    if(idx>=0 && selected.length>1) selected.splice(idx,1);
    else if(idx<0) selected.push(phrase);
    const next=selected.length?selected:[phrase];
    global.OneToneIpc.invoke('cmd_voice_vosk_set_phrases',{phrases:next}).then(function(res){
      renderVoiceVoskStatus(res);
      hooks().syncHomeFromVoiceSettings(res,null);
      hooks().toast(t('voiceVoskPresetUpdated'));
    }).catch(function(err){
      console.error('voice_vosk_preset',err);
      hooks().toast(t('voiceVoskFail'));
      loadVoiceVoskStatus();
    });
  }

  function syncVoiceVoskPresets(phrases){
    const selected=(Array.isArray(phrases)?phrases:[]).map(function(x){return String(x||'').trim();});
    document.querySelectorAll('#voiceVoskPresetsCn [data-phrase], #voiceVoskPresetsEn [data-phrase]').forEach(function(btn){
      const phrase=btn.getAttribute('data-phrase')||'';
      btn.classList.toggle('is-selected',selected.includes(phrase));
    });
  }

  function changeVoiceVoskModelPreset(){
    if(voiceVoskTogglePending) return;
    hooks().markVoiceEngineBootHandled();
    const preset=currentVoiceVoskPreset();
    updateVoiceVoskPresetPanel(preset);
    voiceVoskTogglePending=true;
    syncVoiceVoskPresetButtons(preset,true);
    global.OneToneIpc.invoke('cmd_voice_vosk_set_model_preset',{preset:preset}).then(function(res){
      renderVoiceVoskStatus(res);
      hooks().syncHomeFromVoiceSettings(res,null,null,{homeOnly:true,lightOnly:true});
      hooks().toast(t('voiceVoskModelUpdated'));
      hooks().stopMicLevelPoll();
      hooks().stopMicMonitor();
    }).catch(function(err){
      console.error('voice_vosk_model',err);
      hooks().toast(t('voiceVoskFail'));
      loadVoiceVoskStatus();
    }).finally(function(){
      voiceVoskTogglePending=false;
      syncVoiceVoskPresetButtons(currentVoiceVoskPreset(),false);
    });
  }

  function updateHomeVoiceSapiConfidence(saveNow){
    const el=$('homeVoiceSapiConfidence');
    const label=$('homeVoiceSapiConfidenceLabel');
    if(!el) return;
    const value=Number(el.value||0.35);
    if(label) label.textContent=t('voiceSapiSensitivity')+' '+value.toFixed(2);
    if(!saveNow) return;
    global.OneToneIpc.invoke('cmd_voice_sapi_set_min_confidence',{minConfidence:value}).then(function(res){
      renderVoiceSapiStatus(res);
      hooks().syncHomeFromVoiceSettings(null,res);
    }).catch(function(err){
      console.error('home_voice_sapi_confidence',err);
      loadVoiceSapiStatus();
    });
  }

  function voiceWakeEnabledInConfig(){
    const cfg=state().config||{};
    const vosk=cfg.voiceVosk||cfg.voice_vosk;
    const sapi=cfg.voiceSapi||cfg.voice_sapi;
    return !!(vosk&&vosk.enabled)||!!(sapi&&sapi.enabled);
  }

  global.OneToneVoiceWake={
    stateLabel:voiceWakeStateLabel,
    noticeIsTriggered:voiceWakeNoticeIsTriggered,
    noticeLabel:voiceWakeNoticeLabel,
    navStatusLine:voiceNavStatusLine,
    renderMicLive:renderVoiceMicLive,
    renderSubnav:renderSettingsVoiceSubnav,
    mergeWakeSnapshot:mergeWakeSnapshot,
    syncSapiConfigFromStatus:syncVoiceSapiConfigFromStatus,
    syncVoskConfigFromStatus:syncVoiceVoskConfigFromStatus,
    currentMode:currentVoiceMode,
    syncExpandedUi:syncVoiceWakeExpandedUi,
    setExpandedMode:setVoiceWakeExpandedMode,
    getExpandedMode:function(){ return voiceWakeExpandedMode; },
    renderModeSwitch:renderVoiceModeSwitch,
    switchMode:switchVoiceMode,
    enabledInConfig:voiceWakeEnabledInConfig,
    pollNeeded:voiceStatusPollNeeded,
    pollTick:voiceStatusPollTick,
    startPoll:startVoiceStatusPoll,
    liveFingerprint:voiceWakeLiveFingerprint,
    refreshDrawerMic:refreshDrawerMicAfterVoiceToggle,
    syncSapiToggle:syncVoiceSapiToggle,
    renderSapiStatus:renderVoiceSapiStatus,
    loadSapiStatus:loadVoiceSapiStatus,
    sapiEnabledNow:voiceSapiEnabledNow,
    voskEnabledNow:voiceVoskEnabledNow,
    openSapiSetup:openVoiceSapiSetup,
    toggleSapi:toggleVoiceSapi,
    testSapiSend:testVoiceSapiSend,
    addSapiPreset:addVoiceSapiPreset,
    syncSapiPresets:syncVoiceSapiPresets,
    initSapiPresetsFromConfig:initSapiPresetsFromConfig,
    updateSapiConfidence:updateVoiceSapiConfidence,
    updateHomeSapiConfidence:updateHomeVoiceSapiConfidence,
    renderVoskStatus:renderVoiceVoskStatus,
    loadVoskStatus:loadVoiceVoskStatus,
    syncVoskToggle:syncVoiceVoskToggle,
    toggleVosk:toggleVoiceVosk,
    testVoskSend:testVoiceVoskSend,
    addVoskPreset:addVoiceVoskPreset,
    syncVoskPresets:syncVoiceVoskPresets,
    syncVoiceVoskPresetButtons:syncVoiceVoskPresetButtons,
    changeVoskModelPreset:changeVoiceVoskModelPreset,
    isEnglishVoskPreset:isEnglishVoskPreset,
    isModeSwitchPending:function(){ return voiceModeSwitchPending; },
    isSapiTogglePending:function(){ return voiceSapiTogglePending; },
    isVoskTogglePending:function(){ return voiceVoskTogglePending; },
    isPollStarted:function(){ return voiceStatusPollStarted; },
    clearLiveFingerprints:function(){
      lastVoiceSapiLiveFp='';
      lastVoiceVoskLiveFp='';
      voiceSapiPresetPending=null;
      voiceSapiPresetSaveSeq++;
    },
    handleSapiEnableResult:handleVoiceSapiEnableResult,
    scheduleToggleRefresh:scheduleVoiceToggleRefresh,
    settingsPanelNeedsPoll:settingsPanelNeedsVoicePoll,
    bindVoiceModeCard:bindVoiceModeCard
  };
})((typeof window!=='undefined')?window:globalThis);
