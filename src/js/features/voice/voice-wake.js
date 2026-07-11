(function(global){
  'use strict';
  var $=function(id){ return global.OneToneDom.$(id); };
  var t=function(key){ return global.OneToneI18n.t(key); };
  function state(){ return global.OneToneState.state; }
  function ui(){ return global.OneToneState.ui; }
  function runtime(){ return global.OneToneState.runtime; }
  function hooks(){ return global.__vp_voice_wake_hooks__ || {}; }
  function voskOnlyUi(){
    return !!(global.OneToneVoiceEngineReadiness && global.OneToneVoiceEngineReadiness.isVoskOnlyUi());
  }
  var voiceWakeExpandedMode='vosk';
  var voiceModeSwitchSeq=0;
  var voiceModeSwitchInFlight=false;
  var voiceSapiTogglePending=false;
  var voiceVoskTogglePending=false;
  var voiceVoskPendingPreset=null;
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
  var voskDownloadInFlight=false;
  var voskDownloadPercent=0;
  var SAPI_SENS_LEVELS=[0.15,0.25,0.35,0.50,0.65,0.80];

  function nearestSapiSensIndex(value){
    var v=Number(value);
    if(!isFinite(v)) v=0.35;
    var best=2;
    var diff=Infinity;
    for(var i=0;i<SAPI_SENS_LEVELS.length;i++){
      var d=Math.abs(SAPI_SENS_LEVELS[i]-v);
      if(d<diff){ diff=d; best=i; }
    }
    return best;
  }

  function sapiSensLabelForIndex(index){
    return t('voiceSapiSens'+String(index));
  }

  function syncVoiceSapiSensUi(conf){
    var idx=nearestSapiSensIndex(conf);
    var label=sapiSensLabelForIndex(idx);
    document.querySelectorAll('.voice-sapi-sens-btn').forEach(function(btn){
      var bi=Number(btn.getAttribute('data-sapi-sens'));
      btn.classList.toggle('is-active',bi===idx);
    });
    ['voiceSettingsSapiSensCurrent','voiceSapiSensCurrent'].forEach(function(id){
      var el=$(id);
      if(el) el.textContent=label;
    });
    var slider=$('voiceSapiConfidence');
    if(slider && document.activeElement!==slider) slider.value=String(SAPI_SENS_LEVELS[idx]);
    var legacyLabel=$('voiceSapiConfidenceLabel');
    if(legacyLabel) legacyLabel.textContent=t('voiceSapiSensitivity')+' '+SAPI_SENS_LEVELS[idx].toFixed(2);
  }

  function applyVoiceSapiSensLevel(index){
    index=Number(index);
    if(index<0||index>=SAPI_SENS_LEVELS.length) return Promise.resolve();
    var value=SAPI_SENS_LEVELS[index];
    syncVoiceSapiSensUi(value);
    return global.OneToneIpc.invoke('cmd_voice_sapi_set_min_confidence',{minConfidence:value}).then(function(res){
      renderVoiceSapiStatus(res);
      hooks().syncHomeFromVoiceSettings(null,res);
      return res;
    }).catch(function(err){
      console.error('voice_sapi_sens',err);
      loadVoiceSapiStatus();
      throw err;
    });
  }

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

  function updateSapiHeardInline(primaryText, extraText){
    const inlinePrimary=$('voiceSapiHeardPrimary');
    const inlineExtra=$('voiceSapiHeardExtra');
    if(inlinePrimary) inlinePrimary.textContent=primaryText||'—';
    if(inlineExtra){
      if(extraText){
        inlineExtra.hidden=false;
        inlineExtra.textContent=extraText;
      }else{
        inlineExtra.hidden=true;
        inlineExtra.textContent='';
      }
    }
  }

  function renderSapiHeardInline(w, mode){
    const previewMode=mode==='off'?(voiceWakeExpandedMode||'sapi'):mode;
    if(previewMode!=='sapi'&&mode!=='sapi'){
      updateSapiHeardInline('', '');
      return;
    }
    const sapiRes=w.sapi;
    if(!sapiRes||!sapiRes.enabled){
      updateSapiHeardInline(t('voiceSapiHeard')+'：'+t('voiceSapiOff'), '');
      return;
    }
    const raw=sapiRes.state||'stopped';
    const heard=sapiRes.lastHeard||'';
    const skip=sapiRes.lastSkip||'';
    const trigger=sapiRes.lastTrigger||'';
    const heardText=heard||(raw==='listening'?t('homeLiveHeardWaiting'):t('voiceSapiWaiting'));
    let extraLine='';
    if(trigger) extraLine=t('voiceWakeTriggered')+'：'+trigger;
    else if(skip) extraLine=t('voiceWakeSkip')+'：'+skip;
    updateSapiHeardInline(t('voiceSapiHeard')+'：'+heardText, extraLine);
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
    if(!stateEl||!primary){
      renderSapiHeardInline(hooks().voiceUiSnapshot.wake||{}, currentVoiceMode());
      if(global.OneToneVoiceSettingsFlow&&global.OneToneVoiceSettingsFlow.syncAsideLiveStatus){
        global.OneToneVoiceSettingsFlow.syncAsideLiveStatus();
      }
      return;
    }
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
      renderSapiHeardInline(w, mode);
      renderSettingsVoiceSubnav();
      if(global.OneToneVoiceSettingsFlow&&global.OneToneVoiceSettingsFlow.syncAsideLiveStatus){
        global.OneToneVoiceSettingsFlow.syncAsideLiveStatus();
      }
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
    renderSapiHeardInline(w, mode);
    renderSettingsVoiceSubnav();
    if(global.OneToneVoiceSettingsFlow&&global.OneToneVoiceSettingsFlow.syncAsideLiveStatus){
      global.OneToneVoiceSettingsFlow.syncAsideLiveStatus();
    }
  }

  function renderSettingsVoiceSubnav(){
    if(global.OneToneSceneModeHub&&global.OneToneSceneModeHub.renderVoiceSubnav){
      global.OneToneSceneModeHub.renderVoiceSubnav();
    }
  }

  function renderVoiceEngineTabs(){
    const mode=voiceWakeExpandedMode||'sapi';
    const grid=$('voiceRecognizeSourceGrid');
    if(grid){
      grid.querySelectorAll('[data-voice-engine-tab]').forEach(function(btn){
        const tab=btn.getAttribute('data-voice-engine-tab')||'';
        const on=tab===mode;
        btn.classList.toggle('is-active',on);
      });
    }
    if(voskOnlyUi()){
      if(voiceWakeExpandedMode!=='vosk') setVoiceWakeExpandedMode('vosk');
      syncVoskOnlyCopy();
    }
  }

  function syncVoskOnlyCopy(){
    if(!voskOnlyUi()) return;
    const voskDesc=$('voiceVoskDesc');
    if(voskDesc) voskDesc.textContent=t('voiceVoskDescSingle');
    const modeDesc=$('voiceModeDesc');
    if(modeDesc) modeDesc.textContent=t('voiceModeDescSingle');
    const cap=$('voiceEngineCapabilityNote');
    if(cap) cap.textContent=t('voiceEngineCapabilityNotePro');
  }
  function mergeWakeSnapshot(sapiRes,voskRes){
    sapiRes=sapiRes||{};
    voskRes=voskRes||{};
    const voskOn=!!voskRes.enabled;
    const sapiOn=!!sapiRes.enabled;
    let engine='none',phrase='',state='off';
    if(voskOn){
      engine='vosk';
      const phrases=Array.isArray(voskRes.phrases)?voskRes.phrases:[];
      const cn=Array.isArray(voskRes.phrasesCn)?voskRes.phrasesCn:[];
      const en=Array.isArray(voskRes.phrasesEn)?voskRes.phrasesEn:[];
      phrase=(phrases[0]||cn[0]||en[0]||'').trim();
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
    return voskOnlyUi()?'vosk':'off';
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
    const mode=currentVoiceMode();
    const expanded=voiceWakeExpandedMode||mode||'vosk';
    const sapiWrap=$('btnVoiceModeSapi');
    const voskWrap=$('btnVoiceModeVosk');
    const sapiBlock=$('voiceSapiBlock');
    const voskBlock=$('voiceVoskBlock');
    const sapiPanel=$('voiceResourceSapiPanel');
    const voskPanel=$('voiceResourceVoskPanel');
    if(voskOnlyUi()){
      if(sapiWrap) sapiWrap.hidden=true;
      if(sapiBlock) sapiBlock.hidden=true;
      if(sapiPanel) sapiPanel.hidden=true;
      if(voskWrap) voskWrap.hidden=false;
      if(voskBlock) voskBlock.hidden=false;
      if(voskPanel) voskPanel.hidden=false;
      return;
    }
    const showSapi=mode==='sapi'||expanded==='sapi';
    const showVosk=mode==='vosk'||expanded==='vosk';
    if(sapiWrap) sapiWrap.hidden=!showSapi;
    if(sapiBlock) sapiBlock.hidden=!showSapi;
    if(sapiPanel) sapiPanel.hidden=!showSapi;
    if(voskWrap) voskWrap.hidden=!showVosk;
    if(voskBlock) voskBlock.hidden=!showVosk;
    if(voskPanel) voskPanel.hidden=!showVosk;
  }

  function setVoiceWakeExpandedMode(mode){
    if(voskOnlyUi()&&mode==='sapi') mode='vosk';
    if(mode!=='sapi'&&mode!=='vosk') return;
    voiceWakeExpandedMode=mode;
    if(ui().selectedSceneVoiceNav!=='voice:end'){
      ui().selectedSceneVoiceNav=mode==='vosk'?'voice:vosk':'voice:sapi';
    }
    syncVoiceWakeExpandedUi();
    renderVoiceEngineTabs();
    renderVoiceMicLive();
    global.OneToneVoiceEnd.syncModeUi();
    if(global.OneToneSceneModeHub) global.OneToneSceneModeHub.renderVoiceSubnav();
    renderWakeCustomPhrases();
  }

  function renderVoiceModeSwitch(){
    const mode=currentVoiceMode();
    const endEnabled=global.OneToneVoiceEnd.enabledInConfig();
    const sapiCard=$('btnVoiceModeSapi');
    const voskCard=$('btnVoiceModeVosk');
    const currentEl=$('voiceModeCurrent');
    const hintEl=$('voiceModeHint');
    if(sapiCard){
      sapiCard.hidden=voskOnlyUi();
      sapiCard.classList.toggle('is-active',mode==='sapi');
    }
    if(voskCard){
      voskCard.classList.toggle('is-active',mode==='vosk');
    }
    syncVoiceWakeExpandedUi();
    if(currentEl){
      if(voskOnlyUi()||mode==='vosk') currentEl.textContent=t('voiceModeCurrentPro');
      else if(mode==='sapi') currentEl.textContent=t('voiceModeCurrentLite');
      else currentEl.textContent=t('voiceModeCurrentOff');
    }
    if(hintEl){
      if(voskOnlyUi()||mode==='vosk') hintEl.textContent=endEnabled?t('voiceModeHintProWithEnd'):t('voiceModeHintPro');
      else if(mode==='sapi') hintEl.textContent=t('voiceModeHintLite');
      else hintEl.textContent=t('voiceModeHintOff');
    }
    hooks().renderVoiceModeUsage();
    setVoiceModeCardBusy(voiceModeSwitchInFlight);
    global.OneToneVoiceEnd.syncModeUi();
    renderVoiceEngineTabs();
    renderSettingsVoiceSubnav();
    hooks().renderVoiceSettingsFlow();
  }

  function optimisticVoiceEngineConfig(mode){
    if(!state().config) return;
    const vosk=state().config.voiceVosk||state().config.voice_vosk||(state().config.voiceVosk={});
    const sapi=state().config.voiceSapi||state().config.voice_sapi||(state().config.voiceSapi={});
    state().config.voiceVosk=vosk;
    state().config.voiceSapi=sapi;
    if(mode==='vosk'){
      vosk.enabled=true;
      sapi.enabled=false;
    }else{
      sapi.enabled=true;
      vosk.enabled=false;
    }
    const snap=hooks().voiceUiSnapshot;
    if(snap){
      if(!snap.wake) snap.wake={};
      snap.wake.engine=mode;
      snap.wake.voskEnabled=mode==='vosk';
      snap.wake.sapiEnabled=mode==='sapi';
    }
  }

  function applyHomeVoiceModeSwitchUi(){
    global.OneToneVoiceEnd.syncModeUi();
    if(ui().drawerOpen) renderVoiceModeSwitch();
    else if(hooks().renderHomeVoiceModeSwitchUi) hooks().renderHomeVoiceModeSwitchUi();
  }

  function pumpVoiceModeSwitch(opts){
    if(voiceModeSwitchInFlight) return;
    const mode=voiceWakeExpandedMode;
    if(mode!=='sapi'&&mode!=='vosk') return;
    const seq=voiceModeSwitchSeq;
    const toastKind=(opts&&opts.toastKind)||'default';
    const toastLite=toastKind==='lite';
    function modeToast(){
      if(toastLite) hooks().toast(mode==='sapi'?t('voiceNavToastLite'):t('voiceNavToastPro'),'lite');
      else hooks().toast(mode==='sapi'?t('voiceModeSwitchedLite'):t('voiceModeSwitchedPro'));
    }
    const homeOnly=!ui().drawerOpen;
    const statusOpts={liveOnly:homeOnly};
    const syncOpts={lightOnly:true,homeOnly:homeOnly};
    voiceModeSwitchInFlight=true;
    setVoiceModeCardBusy(true);
    const finish=function(){
      voiceModeSwitchInFlight=false;
      setVoiceModeCardBusy(false);
      if(seq!==voiceModeSwitchSeq){
        pumpVoiceModeSwitch(opts);
        return;
      }
      applyHomeVoiceModeSwitchUi();
      if(hooks().scheduleRenderHomeLiveZone) hooks().scheduleRenderHomeLiveZone();
      else if(!ui().drawerOpen) hooks().renderHomeLiveZone();
    };
    if(mode==='sapi'){
      global.OneToneIpc.invoke('cmd_voice_sapi_set_enabled',{enabled:true}).then(function(res){
        if(seq!==voiceModeSwitchSeq) return;
        renderVoiceSapiStatus(res,statusOpts);
        if(!handleVoiceSapiEnableResult(res,true)) return;
        hooks().syncHomeFromVoiceSettings({enabled:false,state:'stopped'},res,null,syncOpts);
        modeToast();
        scheduleVoiceToggleRefresh();
      }).catch(function(err){
        if(seq!==voiceModeSwitchSeq) return;
        loadVoiceSapiStatus();
        const msg=err&&err.message?String(err.message).trim():'';
        hooks().toast(msg||t('voiceSapiFail'));
        console.error('voice_mode_sapi',err);
      }).finally(finish);
      return;
    }
    global.OneToneIpc.invoke('cmd_voice_vosk_set_enabled',{enabled:true}).then(function(res){
      if(seq!==voiceModeSwitchSeq) return;
      renderVoiceVoskStatus(res,statusOpts);
      return global.OneToneIpc.invoke('cmd_voice_end_status',{}).catch(function(){return null;}).then(function(endRes){
        if(seq!==voiceModeSwitchSeq) return;
        if(endRes){
          global.OneToneVoiceEnd.syncConfigFromStatus(endRes);
          const snap=hooks().voiceUiSnapshot;
          if(snap) snap.end=Object.assign({},snap.end||{},endRes);
        }
        hooks().syncHomeFromVoiceSettings(res,{enabled:false,state:'stopped'},endRes,syncOpts);
        modeToast();
        scheduleVoiceToggleRefresh();
      });
    }).catch(function(err){
      if(seq!==voiceModeSwitchSeq) return;
      loadVoiceVoskStatus();
      hooks().toast(t('voiceVoskFail'));
      console.error('voice_mode_vosk',err);
    }).finally(finish);
  }

  function switchVoiceMode(mode, opts){
    opts=opts||{};
    if(voskOnlyUi()&&mode==='sapi') return;
    const toastKind=opts.toastKind||'default';
    const toastLite=toastKind==='lite';
    function modeToast(){
      if(toastLite) hooks().toast(mode==='sapi'?t('voiceNavToastLite'):t('voiceNavToastPro'),'lite');
      else hooks().toast(mode==='sapi'?t('voiceModeSwitchedLite'):t('voiceModeSwitchedPro'));
    }
    if(mode!=='sapi'&&mode!=='vosk') return;
    voiceModeSwitchSeq++;
    hooks().markVoiceEngineBootHandled();
    setVoiceWakeExpandedMode(mode);
    if(currentVoiceMode()===mode&&!voiceModeSwitchInFlight){
      applyHomeVoiceModeSwitchUi();
      return;
    }
    optimisticVoiceEngineConfig(mode);
    applyHomeVoiceModeSwitchUi();
    pumpVoiceModeSwitch(opts);
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
      const conf=Number(res.minConfidence==null?0.35:res.minConfidence);
      syncVoiceSapiSensUi(conf);
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
    if(!liveOnly&&ui().drawerOpen) renderVoiceModeSwitch();
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
    if(voskOnlyUi()) return;
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
    if(global.OneToneVoiceWakePresets){
      global.OneToneVoiceWakePresets.syncSelected(selected,'sapi');
    }else{
      document.querySelectorAll('#voiceSapiPresets [data-phrase]').forEach(function(btn){
        const phrase=btn.getAttribute('data-phrase')||'';
        btn.classList.toggle('is-selected',selected.indexOf(phrase)>=0);
      });
    }
    renderWakeCustomPhrases();
  }

  function wakePresetPhraseSet(){
    if(global.OneToneVoiceWakePresets){
      return global.OneToneVoiceWakePresets.getSelectedPhrases();
    }
    const mode=voiceWakeExpandedMode||currentVoiceMode()||'sapi';
    if(mode==='vosk'){
      return presetPhrasesIn('#voiceVoskPresetsCn').concat(presetPhrasesIn('#voiceVoskPresetsEn'));
    }
    return presetPhrasesIn('#voiceSapiPresets');
  }

  function presetPhrasesIn(sel){
    var pc=global.OneToneVoicePhraseCustom;
    return pc&&pc.presetPhrasesIn?pc.presetPhrasesIn(sel):[];
  }

  function currentWakePhraseList(){
    const cfg=state().config||{};
    const mode=voiceWakeExpandedMode||currentVoiceMode()||'sapi';
    if(mode==='vosk'){
      const vosk=cfg.voiceVosk||cfg.voice_vosk||{};
      const w=hooks().voiceUiSnapshot.wake||{};
      const live=w.vosk||{};
      const fromLive=normalizePhraseList(live.phrases);
      if(fromLive.length) return fromLive;
      return normalizePhraseList(vosk.phrases);
    }
    const sapi=cfg.voiceSapi||cfg.voice_sapi||{};
    const selected=normalizePhraseList(voiceSapiSelectedPhrases);
    if(selected.length) return selected;
    return normalizePhraseList(sapi.phrases);
  }

  function renderWakeCustomPhrases(){
    const pc=global.OneToneVoicePhraseCustom;
    if(!pc) return;
    const active=currentWakePhraseList();
    let custom=pc.customPhrases(active,wakePresetPhraseSet());
    const appRules=global.OneToneAppBehaviorRules;
    const m=global.OneToneState&&global.OneToneState.state&&global.OneToneState.state.config
      ?(global.OneToneState.state.config.mappings||[]).find(function(x){
        return x&&x.id===global.OneToneState.state.config.activeSceneId;
      }):null;
    if(appRules&&appRules.voiceSummonPhrase&&m){
      const summonSet={};
      (appRules.behaviorPresets||[]).forEach(function(p){
        const phrase=appRules.voiceSummonPhrase(p.id,m);
        const clean=String(phrase||'').replace(/[「」""]/g,'').trim();
        if(clean) summonSet[clean]=true;
      });
      custom=custom.filter(function(phrase){ return !summonSet[phrase]; });
    }
    pc.renderChips('voiceWakeCustomChips',custom,function(phrase){
      removeCustomWakePhrase(phrase);
    });
    const block=$('voiceWakeCustomBlock');
    const mode=voiceWakeExpandedMode||currentVoiceMode()||'sapi';
    if(block) block.hidden=mode==='off';
  }

  function persistWakePhrases(next){
    next=normalizePhraseList(next);
    if(!next.length) next=['开始输入'];
    const mode=voiceWakeExpandedMode||currentVoiceMode()||'sapi';
    if(mode==='vosk'){
      return global.OneToneIpc.invoke('cmd_voice_vosk_set_phrases',{phrases:next}).then(function(res){
        renderVoiceVoskStatus(res);
        hooks().syncHomeFromVoiceSettings(res,null);
        renderWakeCustomPhrases();
        hooks().renderVoiceSettingsFlow();
        return res;
      });
    }
    voiceSapiPresetPending=next.slice();
    if(state().config){
      const cfg=state().config.voiceSapi||state().config.voice_sapi||(state().config.voiceSapi={});
      state().config.voiceSapi=cfg;
      cfg.phrases=hooks().cloneStringList(next);
    }
    syncVoiceSapiPresets(next);
    return global.OneToneIpc.invoke('cmd_voice_sapi_set_phrases',{phrases:next}).then(function(res){
      if(res) renderVoiceSapiStatus(res);
      hooks().syncHomeFromVoiceSettings(null,res);
      renderWakeCustomPhrases();
      hooks().renderVoiceSettingsFlow();
      return res;
    });
  }

  function phraseHasLatinLetters(phrase){
    return /[A-Za-z]/.test(String(phrase||''));
  }

  function addCustomWakePhrase(raw){
    const phrase=String(raw||'').trim();
    if(!phrase) return Promise.resolve();
    const next=currentWakePhraseList().slice();
    if(next.indexOf(phrase)>=0){
      hooks().toast(t('voicePhraseAlreadyAdded'));
      return Promise.resolve();
    }
    const mode=voiceWakeExpandedMode||currentVoiceMode()||'sapi';
    if(mode==='vosk'&&phraseHasLatinLetters(phrase)&&!isEnglishVoskPreset(backendVoiceVoskPreset())){
      hooks().toast(t('voiceWakeMixedLangHint'));
    }
    next.push(phrase);
    return persistWakePhrases(next).then(function(){
      hooks().toast(t('voicePhraseAdded'));
    }).catch(function(err){
      console.error('voice_custom_wake',err);
      hooks().toast(t('voiceSapiFail'));
    });
  }

  function removeCustomWakePhrase(phrase){
    phrase=String(phrase||'').trim();
    if(!phrase) return;
    const next=currentWakePhraseList().filter(function(p){ return p!==phrase; });
    persistWakePhrases(next.length?next:['开始输入']);
  }

  function updateVoiceSapiConfidence(saveNow){
    const el=$('voiceSapiConfidence');
    if(!el) return;
    const value=Number(el.value||0);
    syncVoiceSapiSensUi(value);
    if(!saveNow) return;
    return global.OneToneIpc.invoke('cmd_voice_sapi_set_min_confidence',{minConfidence:value}).then(function(res){
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

  function resolvedVoskPreset(preset){
    const p=String(preset||'').trim();
    if(!p||p==='auto'||p==='custom') return 'cn-light';
    return p;
  }

  function clearActiveMappingVoskPresetOverride(){
    const cfg=state().config;
    if(!cfg||!Array.isArray(cfg.mappings)) return;
    const activeId=String(cfg.activeSceneId||'').trim();
    if(!activeId) return;
    const mapping=cfg.mappings.find(function(m){ return m&&m.id===activeId; });
    if(!mapping||!mapping.voiceOverride) return;
    if(mapping.voiceOverride.modelPreset){
      delete mapping.voiceOverride.modelPreset;
      if(!Object.keys(mapping.voiceOverride).some(function(k){
        var v=mapping.voiceOverride[k];
        return v!=null&&v!==''&&!(Array.isArray(v)&&!v.length);
      })) mapping.voiceOverride=null;
    }
  }

  function backendVoiceVoskPreset(){
    const cfg=state().config||{};
    const activeId=String(cfg.activeSceneId||'').trim();
    const mapping=activeId&&Array.isArray(cfg.mappings)
      ?cfg.mappings.find(function(m){ return m&&m.id===activeId; }):null;
    if(global.OneToneSceneConfig&&global.OneToneSceneConfig.effectiveVoskModelPreset){
      return resolvedVoskPreset(global.OneToneSceneConfig.effectiveVoskModelPreset(cfg,mapping));
    }
    const vosk=cfg.voiceVosk||cfg.voice_vosk||{};
    const raw=hooks().voiceUiSnapshot;
    const snap=(typeof raw==='function'?raw():raw)||{};
    const live=snap.wake&&snap.wake.vosk;
    return resolvedVoskPreset((live&&live.modelPreset)||vosk.modelPreset||'cn-light');
  }

  function syncVoiceWakeLangFromPreset(preset){
    global.__vp_voice_wake_lang__=isEnglishVoskPreset(preset)?'en':'zh';
  }

  function currentVoiceVoskPreset(){
    if(voiceVoskPendingPreset) return voiceVoskPendingPreset;
    const host=$('voiceVoskModelPreset');
    if(!host) return backendVoiceVoskPreset();
    const active=host.querySelector('[data-preset].is-active');
    if(active) return resolvedVoskPreset(active.getAttribute('data-preset')||'cn-light');
    return backendVoiceVoskPreset();
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
    if(global.OneToneVoiceWakePresets){
      return global.OneToneVoiceWakePresets.getActiveVoskPresetRoots();
    }
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
        const uiPreset=voiceVoskPendingPreset||resolvedVoskPreset(res.modelPreset||'cn-light');
        syncVoiceVoskPresetButtons(uiPreset,voiceVoskTogglePending);
        updateVoiceVoskPresetPanel(uiPreset);
        if(!voiceVoskPendingPreset) syncVoiceWakeLangFromPreset(uiPreset);
      }
      syncVoiceVoskPresets(res.phrases||[]);
    }
    const partial=res.lastPartial||'';
    const finalText=res.lastFinal||'';
    const skip=res.lastSkip||'';
    const hit=res.lastDetectedPhrase||'';
    const modelPath=res.resolvedModelPath||res.modelPath||'';
    const modelOk=res.modelExists?'OK':'缺失';
    renderVoskMissingPanel(res);
    const errEl=$('voiceVoskError');
    if(errEl){
      const recovery=$('voiceEngineRecovery');
      const showingRecovery=recovery&&!recovery.hidden;
      const err=res.lastError||'';
      if(err&&!showingRecovery){
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
    if(!liveOnly&&ui().drawerOpen) renderVoiceModeSwitch();
  }

  function loadVoiceVoskStatus(){
    return global.OneToneIpc.invoke('cmd_voice_vosk_status',{}).then(function(res){
      const snap=hooks().voiceUiSnapshot;
      if(snap){
        const wake=snap.wake||{};
        snap.wake=mergeWakeSnapshot(wake.sapi,res);
      }
      renderVoiceVoskStatus(res);
      hooks().syncHomeFromVoiceSettings&&hooks().syncHomeFromVoiceSettings(res,null,null,{lightOnly:true});
      hooks().scheduleVoiceUiRender&&hooks().scheduleVoiceUiRender(ui().drawerOpen?{vosk:res}:null);
      return res;
    }).catch(function(err){
      voiceStatusPollTick();
      return Promise.resolve(hooks().voiceUiSnapshot.wake&&hooks().voiceUiSnapshot.wake.vosk);
    });
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

  function shouldShowVoskMissingPanel(res){
    if(!res) return false;
    const issue=String(res.resourceIssue||'');
    if(issue==='model_missing'||issue==='dll_missing') return true;
    const err=String(res.lastError||'').trim().toLowerCase();
    if(err.indexOf('load model failed')>=0||err.indexOf('model_missing')>=0||err.indexOf('model not found')>=0) return true;
    if(res.enabled&&res.state==='error'){
      if(res.modelExists===false) return true;
      if(res.dllExists===false) return true;
    }
    return false;
  }

  function voskMissingBodyText(res){
    const issue=String(res.resourceIssue||'');
    if(issue==='dll_missing'||res.dllExists===false) return t('voiceVoskMissingDll');
    if(issue==='model_missing'||res.modelExists===false) return t('voiceVoskMissingModel');
    const err=String(res.lastError||'').trim();
    if(err.indexOf('dll_missing:')===0) return t('voiceVoskMissingDll');
    if(err.indexOf('model_missing:')===0) return t('voiceVoskMissingModel');
    if(/load model failed/i.test(err)) return t('voiceVoskMissingModel');
    return err||t('voiceVoskFail');
  }

  function renderVoskMissingPanel(res){
    const recovery=$('voiceEngineRecovery');
    const msg=$('voiceEngineRecoveryMsg');
    const show=shouldShowVoskMissingPanel(res);
    if(recovery) recovery.hidden=!show;
    if(!show) return;
    const detail=voskMissingBodyText(res);
    if(msg) msg.textContent=detail||t('voiceEngineRecoveryMsg');
  }

  function applyVoskMissingLang(){
    const openBtn=$('btnModelsVoskOpenDir');
    const dlBtn=$('btnModelsVoskDownload');
    const retryBtn=$('btnVoskRetry');
    if(openBtn) openBtn.textContent=t('voiceVoskOpenResources');
    if(dlBtn) dlBtn.textContent=t('voiceVoskDownloadGuide');
    if(retryBtn) retryBtn.textContent=t('voiceVoskRetry');
    const snap=hooks().voiceUiSnapshot&&hooks().voiceUiSnapshot.wake;
    const vosk=snap&&snap.vosk;
    if(vosk) renderVoskMissingPanel(vosk);
  }

  function openVoskResourcesDir(){
    global.OneToneIpc.invoke('cmd_open_vosk_resources_dir',{}).catch(function(err){
      hooks().toast(err&&err.message?String(err.message):t('voiceVoskFail'));
    });
  }

  function renderVoskDownloadProgress(phase,percent){
    const wrap=$('voiceVoskDownloadProgress');
    const fill=$('voiceVoskDownloadFill');
    const status=$('voiceVoskDownloadStatus');
    const dlBtn=$('btnModelsVoskDownload')||$('btnVoskDownloadGuide');
    if(!wrap) return;
    const active=!!phase&&phase!=='done'&&phase!=='error';
    wrap.hidden=!active&&!voskDownloadInFlight;
    if(fill) fill.style.width=String(Math.max(0,Math.min(100,percent||0)))+'%';
    if(status){
      if(phase==='extracting') status.textContent=t('voiceVoskExtracting');
      else if(phase==='downloading') status.textContent=t('voiceVoskDownloading').replace('{n}',String(percent||0));
      else status.textContent='';
    }
    if(dlBtn) dlBtn.disabled=!!voskDownloadInFlight;
  }

  function handleVoskDownloadMessage(msg){
    if(!msg||msg.type!=='mvp_vosk_download') return;
    const phase=String(msg.phase||'');
    if(phase==='downloading'||phase==='extracting'){
      voskDownloadInFlight=true;
      voskDownloadPercent=Number(msg.percent)||0;
      renderVoskDownloadProgress(phase,voskDownloadPercent);
      return;
    }
    voskDownloadInFlight=false;
    if(phase==='done'&&msg.ok){
      renderVoskDownloadProgress('',100);
      hooks().toast(t('voiceVoskDownloadDone'));
      loadVoiceVoskStatus();
      hooks().renderHomeLiveZone&&hooks().renderHomeLiveZone();
      if(global.OneToneHomeV9&&global.OneToneHomeV9.render) global.OneToneHomeV9.render();
      return;
    }
    if(phase==='error'){
      renderVoskDownloadProgress('error',0);
      const err=String(msg.error||t('voiceVoskFail'));
      hooks().toast(t('voiceVoskDownloadFail').replace('{error}',err),'warn');
      loadVoiceVoskStatus();
    }
  }

  function currentVoskPreset(){
    const snap=hooks().voiceUiSnapshot&&hooks().voiceUiSnapshot.wake;
    const vosk=snap&&snap.vosk;
    if(vosk&&vosk.modelPreset) return String(vosk.modelPreset).trim();
    const cfg=state().config||{};
    const v=cfg.voiceVosk||cfg.voice_vosk||{};
    return String(v.modelPreset||'cn-light').trim()||'cn-light';
  }

  function downloadVoskModel(preset){
    if(voskDownloadInFlight) return;
    preset=preset||currentVoskPreset();
    voskDownloadInFlight=true;
    voskDownloadPercent=0;
    renderVoskDownloadProgress('downloading',0);
    global.OneToneIpc.invoke('cmd_vosk_download_model',{preset:preset}).then(function(res){
      if(res&&res.reason==='already_running'){
        voskDownloadInFlight=false;
        renderVoskDownloadProgress('',0);
        hooks().toast(t('voiceVoskDownloadBusy'));
        return;
      }
      if(res&&res.alreadyPresent){
        voskDownloadInFlight=false;
        renderVoskDownloadProgress('',100);
        hooks().toast(t('voiceVoskDownloadDone'));
        loadVoiceVoskStatus();
        hooks().renderHomeLiveZone&&hooks().renderHomeLiveZone();
        if(global.OneToneHomeV9&&global.OneToneHomeV9.render) global.OneToneHomeV9.render();
        return;
      }
      if(!res||!res.ok){
        voskDownloadInFlight=false;
        renderVoskDownloadProgress('error',0);
        var errMsg=(res&&res.error)||(res&&res.reason)||t('voiceVoskFail');
        hooks().toast(t('voiceVoskDownloadFail').replace('{error}',errMsg),'warn');
        return;
      }
      // async download started — completion via mvp_vosk_download
    }).catch(function(err){
      voskDownloadInFlight=false;
      renderVoskDownloadProgress('error',0);
      hooks().toast(t('voiceVoskDownloadFail').replace('{error}',err&&err.message?String(err.message):t('voiceVoskFail')),'warn');
    });
  }

  function downloadVoskModelGuide(){
    downloadVoskModel();
  }

  function retryVoskStart(){
    global.OneToneIpc.invoke('cmd_voice_vosk_retry_start',{}).then(function(res){
      renderVoiceVoskStatus(res);
      hooks().syncHomeFromVoiceSettings(res,null,null,{lightOnly:true});
      if(res&&res.state==='starting') hooks().toast(t('voiceVoskRetry'));
    }).catch(function(err){
      hooks().toast(err&&err.message?String(err.message):t('voiceVoskFail'));
      loadVoiceVoskStatus();
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
    if(global.OneToneVoiceWakePresets){
      global.OneToneVoiceWakePresets.syncSelected(selected,'vosk');
    }else{
      document.querySelectorAll('#voiceVoskPresetsCn [data-phrase], #voiceVoskPresetsEn [data-phrase]').forEach(function(btn){
        const phrase=btn.getAttribute('data-phrase')||'';
        btn.classList.toggle('is-selected',selected.includes(phrase));
      });
    }
    renderWakeCustomPhrases();
  }

  function changeVoiceVoskModelPreset(requestedPreset){
    if(voiceVoskTogglePending) return;
    const preset=resolvedVoskPreset(requestedPreset||currentVoiceVoskPreset());
    const currentBackend=backendVoiceVoskPreset();
    syncVoiceVoskPresetButtons(preset,false);
    updateVoiceVoskPresetPanel(preset);
    if(preset===currentBackend){
      syncVoiceWakeLangFromPreset(preset);
      hooks().renderVoiceSettingsFlow&&hooks().renderVoiceSettingsFlow();
      return;
    }
    hooks().markVoiceEngineBootHandled();
    voiceVoskTogglePending=true;
    voiceVoskPendingPreset=preset;
    syncVoiceVoskPresetButtons(preset,true);
    hooks().toast(t('voiceVoskModelSwitching'));
    global.OneToneIpc.invoke('cmd_voice_vosk_set_model_preset',{preset:preset}).then(function(res){
      clearActiveMappingVoskPresetOverride();
      renderVoiceVoskStatus(res);
      if(shouldShowVoskMissingPanel(res)){
        renderVoskDownloadProgress('',0);
        hooks().toast(t('voiceVoskMissingModel'),'warn');
      }
      syncVoiceWakeLangFromPreset(preset);
      hooks().syncHomeFromVoiceSettings(res,null,null,{homeOnly:true,lightOnly:true});
      hooks().toast(t('voiceVoskModelUpdated'));
      hooks().stopMicLevelPoll();
      hooks().stopMicMonitor();
      hooks().renderVoiceSettingsFlow&&hooks().renderVoiceSettingsFlow();
    }).catch(function(err){
      console.error('voice_vosk_model',err);
      hooks().toast(t('voiceVoskFail'));
      loadVoiceVoskStatus();
    }).finally(function(){
      voiceVoskTogglePending=false;
      voiceVoskPendingPreset=null;
      syncVoiceVoskPresetButtons(backendVoiceVoskPreset(),false);
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
    renderEngineTabs:renderVoiceEngineTabs,
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
    addCustomWakePhrase:addCustomWakePhrase,
    renderWakeCustomPhrases:renderWakeCustomPhrases,
    initSapiPresetsFromConfig:initSapiPresetsFromConfig,
    updateSapiConfidence:updateVoiceSapiConfidence,
    syncSapiSensUi:syncVoiceSapiSensUi,
    applySapiSensLevel:applyVoiceSapiSensLevel,
    sapiSensLevels:function(){ return SAPI_SENS_LEVELS.slice(); },
    renderVoskStatus:renderVoiceVoskStatus,
    loadVoskStatus:loadVoiceVoskStatus,
    syncVoskToggle:syncVoiceVoskToggle,
    toggleVosk:toggleVoiceVosk,
    testVoskSend:testVoiceVoskSend,
    addVoskPreset:addVoiceVoskPreset,
    syncVoskPresets:syncVoiceVoskPresets,
    syncVoiceVoskPresetButtons:syncVoiceVoskPresetButtons,
    changeVoskModelPreset:changeVoiceVoskModelPreset,
    currentVoskPreset:currentVoiceVoskPreset,
    isEnglishVoskPreset:isEnglishVoskPreset,
    openVoskResourcesDir:openVoskResourcesDir,
    downloadVoskModel:downloadVoskModel,
    downloadVoskModelGuide:downloadVoskModelGuide,
    handleVoskDownloadMessage:handleVoskDownloadMessage,
    retryVoskStart:retryVoskStart,
    applyVoskMissingLang:applyVoskMissingLang,
    syncVoskOnlyCopy:syncVoskOnlyCopy,
    isModeSwitchPending:function(){ return voiceModeSwitchInFlight; },
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
