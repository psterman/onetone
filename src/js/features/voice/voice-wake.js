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
  /** Product default: Vosk (SAPI cannot feed PCM for scenario acoustic matching). */
  function defaultUiVoiceMode(){
    return voskOnlyUi()?'vosk':'sapi';
  }
  var voiceWakeExpandedMode='vosk';
  var voiceModeSwitchSeq=0;
  var voiceModeSwitchInFlight=false;
  /** @type {{kind:'strategy',strategy:string,opts:object}|{kind:'mode',opts:object}|null} */
  var voiceModeSwitchPending=null;
  /** Sticky UI/config strategy while IPC + mvp_init race; prevents snap-back to auto. */
  var voiceStrategyHold=null;
  /** Ignore strategy/engine clicks shortly after opening voice panel (howto → drawer ghost click). */
  var voiceOpenClickGuardUntil=0;
  /** Longer window for strategy-tab (toastKind=lite) ghosts — layout settle can click for seconds. */
  var voiceOpenLiteGuardUntil=0;
  /** After a lite strategy apply, ignore further lite tabs (reflow under cursor @+2–3s). */
  var voiceLiteStrategyCooldownUntil=0;
  /** Invalidate deferred voiceWake paint when panel re-opens or leaves (Soft Pad openGen pattern). */
  var voiceOpenGen=0;
  /** Skip redundant mode-switch chrome+flow when status/render-loop re-enter with same UI state. */
  var lastVoiceModeSwitchFp='';
  var voiceModeFlowDebounceTimer=0;
  /** After voiceWake open, delay full flow/status paint so it cannot stack with remount. */
  var voiceOpenFlowSettleUntil=0;
  function armOpenClickGuard(ms){
    var n=Number(ms)||450;
    var now=Date.now();
    voiceOpenClickGuardUntil=now+n;
    // lite tab ghosts kept firing after 2.5s (logs: auto @+3.1s, enhanced @+5.5s).
    voiceOpenLiteGuardUntil=now+Math.max(n,8000);
    voiceOpenFlowSettleUntil=now+900;
  }
  function isOpenFlowSettling(){
    return Date.now()<voiceOpenFlowSettleUntil;
  }
  function isOpenClickGuarded(){
    return Date.now()<voiceOpenClickGuardUntil;
  }
  function isOpenLiteGuarded(){
    return Date.now()<voiceOpenLiteGuardUntil;
  }
  function noteLiteStrategyCommit(){
    var now=Date.now();
    // Spaced ghosts (~2.7s) land after inFlight clears — cooldown covers that gap.
    voiceLiteStrategyCooldownUntil=now+5000;
    voiceOpenLiteGuardUntil=Math.max(voiceOpenLiteGuardUntil,now+2500);
    // Do not drain a queued lite ghost after this switch finishes.
    if(voiceModeSwitchPending&&voiceModeSwitchPending.kind==='strategy'){
      var po=voiceModeSwitchPending.opts||{};
      if(po.toastKind==='lite'&&!po.force) voiceModeSwitchPending=null;
    }
  }
  function isLiteStrategyCooling(){
    return Date.now()<voiceLiteStrategyCooldownUntil;
  }
  function bumpOpenGen(){
    voiceOpenGen=(voiceOpenGen+1)>>>0;
    if(voiceOpenGen===0) voiceOpenGen=1;
    lastVoiceModeSwitchFp='';
    lastVoicePollWakeFp='';
    voiceOpenFlowSettleUntil=Date.now()+900;
    return voiceOpenGen;
  }
  function getOpenGen(){ return voiceOpenGen; }
  function isOpenGenCurrent(gen){
    return gen===voiceOpenGen;
  }
  var voiceSapiTogglePending=false;
  var voiceVoskTogglePending=false;
  var voiceVoskPendingPreset=null;
  var lastVoiceSapiLiveFp='';
  var lastVoiceVoskLiveFp='';
  var lastVoicePollWakeFp='';
  var voiceStatusPollTimer=0;
  var voiceStatusPollInFlight=false;
  var voiceStatusPollStarted=false;
  var voskHomeNudgeAt=0;
  var homeVoiceEnsureAt=0;
  var voiceSapiPresetPending=null;
  var voiceSapiPresetSaveSeq=0;
  var voiceSapiSelectedPhrases=[];
  var voiceSapiPresetSaveChain=Promise.resolve();
  var voiceWakePresetSavePending=null;
  var voiceWakePresetSaveTimer=0;
  var voiceWakePresetSaveSeq=0;
  var voskDownloadInFlight=false;
  var voskStartInFlight=false;
  var kwsDownloadInFlight=false;
  var kwsDownloadPercent=0;
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

  function pendingWakePhrases(){
    if(voiceWakePresetSavePending&&voiceWakePresetSavePending.length){
      return voiceWakePresetSavePending.slice();
    }
    return null;
  }

  function syncVoiceEngineTabButtons(tabMode,loading){
    if(global.__otVoiceEngineTabsMounted&&typeof global.__otVoiceEngineTabsSync==='function'){
      global.__otVoiceEngineTabsSync();
      syncVoiceStrategyTabButtons(loading);
      return;
    }
    const voskOnly=global.OneToneVoiceEngineReadiness&&global.OneToneVoiceEngineReadiness.isVoskOnlyUi();
    const pending=!!(global.OneToneVoiceWake&&global.OneToneVoiceWake.isModeSwitchPending&&global.OneToneVoiceWake.isModeSwitchPending());
    const grid=document.getElementById('voiceRecognizeSourceGrid');
    if(grid){
      grid.querySelectorAll('[data-voice-engine-tab]').forEach(function(btn){
        const tab=btn.getAttribute('data-voice-engine-tab')||'';
        const active=!loading&&tabMode===tab;
        btn.classList.toggle('is-active',active);
        btn.disabled=pending;
        if(tab==='sapi') btn.hidden=!!voskOnly;
        else btn.hidden=false;
      });
    }
    syncVoiceStrategyTabButtons(loading);
  }

  function setStrategyHold(strategy,ms,confirmed){ /* STRATEGY_FIX_MARKER_20260716 */
    strategy=String(strategy||'').trim();
    if(!strategy) return;
    voiceStrategyHold={
      strategy:strategy,
      until:Date.now()+(ms||12000),
      confirmed:!!confirmed
    };
  }

  function clearStrategyHold(strategy){
    if(!voiceStrategyHold) return;
    if(strategy&&voiceStrategyHold.strategy!==strategy) return;
    voiceStrategyHold=null;
  }

  function getStrategyHold(){
    if(!voiceStrategyHold) return null;
    if(Date.now()>voiceStrategyHold.until){
      voiceStrategyHold=null;
      return null;
    }
    return voiceStrategyHold.strategy;
  }

  function syncVoiceStrategyTabButtons(loading){
    const pending=!!(global.OneToneVoiceWake&&global.OneToneVoiceWake.isModeSwitchPending&&global.OneToneVoiceWake.isModeSwitchPending());
    const strategy=currentListeningStrategy();
    const grid=document.getElementById('voiceSummaryEngineSwitch');
    if(!grid) return;
    // P6 守卫：语音配置岛挂载后隐藏 legacy 策略开关（岛提供等价 React 控件），岛卸载即恢复显示。
    var islandOn=!!(window.OneToneIslands&&window.OneToneIslands.isMounted&&window.OneToneIslands.isMounted('voiceConfig'));
    grid.hidden=islandOn;
    if(islandOn) return;
    grid.querySelectorAll('[data-voice-strategy-tab]').forEach(function(btn){
      const tab=btn.getAttribute('data-voice-strategy-tab')||'';
      // Keep the clicked tab active even while loading/in-flight.
      const active=strategy===tab;
      btn.classList.toggle('is-active',active);
      btn.disabled=!!loading&&pending;
    });
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
    const previewMode=mode==='off'?(voiceWakeExpandedMode||defaultUiVoiceMode()):mode;
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
    const previewMode=mode==='off'?(voiceWakeExpandedMode||defaultUiVoiceMode()):mode;
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

  function resolveRuntimeEngine(wake){
    wake=wake||(hooks().voiceUiSnapshot&&hooks().voiceUiSnapshot.wake)||{};
    const active=String((wake.supervisor&&wake.supervisor.activeEngine)||'').trim();
    if(active==='vosk'||active==='kws'||active==='sapi') return active;
    const eng=String(wake.engine||'').trim();
    if(eng==='vosk'||eng==='kws'||eng==='sapi') return eng;
    if(eng==='none'||eng==='off') return 'off';
    if(wake.voskEnabled) return 'vosk';
    if(wake.kwsEnabled) return 'kws';
    if(wake.sapiEnabled) return 'sapi';
    return 'off';
  }

  function isKwsNativeListening(kwsRes,wake){
    wake=wake||{};
    kwsRes=kwsRes||(wake.kws)||{};
    if(!kwsRes||!kwsRes.enabled) return false;
    if(kwsRes.stubMode||kwsRes.resourceIssue) return false;
    if(wake.vosk&&wake.vosk.enabled) return false;
    if(wake.sapi&&wake.sapi.enabled) return false;
    const st=String(kwsRes.state||'').trim();
    return st==='listening'||st==='starting';
  }

  function kwsPhraseListText(list){
    if(!Array.isArray(list)||!list.length) return '';
    return list.map(function(p){ return String(p||'').trim(); }).filter(Boolean).join('、');
  }

  function kwsHeardDisplayText(res){
    res=res||{};
    var sanitize=global.OneToneVoiceSettingsViewModel&&global.OneToneVoiceSettingsViewModel.sanitizePhrase;
    function clean(s){
      return sanitize?sanitize(s):String(s||'').trim();
    }
    const hit=clean(res.lastDetectedPhrase||res.lastTrigger||'');
    if(hit) return hit;
    const partial=clean(res.lastPartial||'');
    if(partial&&/[\u3400-\u9fff]/.test(partial)) return partial;
    return '';
  }

  function resolveActiveTabMode(){
    if(voiceModeSwitchInFlight&&voiceWakeExpandedMode){
      return voiceWakeExpandedMode;
    }
    const runtime=resolveRuntimeEngine();
    if(runtime!=='off') return runtime;
    if(voiceWakeExpandedMode==='kws'||voiceWakeExpandedMode==='vosk'||voiceWakeExpandedMode==='sapi'){
      return voiceWakeExpandedMode;
    }
    return defaultUiVoiceMode();
  }

  function buildVoiceEngineTabsModel(){
    let tabMode=resolveActiveTabMode();
    if(tabMode==='off'||tabMode==='none') tabMode=defaultUiVoiceMode();
    const voskOnly=!!voskOnlyUi();
    const pending=!!(global.OneToneVoiceWake&&global.OneToneVoiceWake.isModeSwitchPending&&global.OneToneVoiceWake.isModeSwitchPending());
    const busy=!!(document.getElementById('btnVoiceModeVosk')&&document.getElementById('btnVoiceModeVosk').classList.contains('is-busy'));
    const tFn=global.OneToneI18n&&global.OneToneI18n.t?global.OneToneI18n.t:function(k){ return k; };
    const tabs=[
      {id:'sapi',label:tFn('voiceRecognizeSourceSapi')||'系统兼容',hidden:voskOnly},
      {id:'vosk',label:tFn('voiceRecognizeSourceVosk')||'本地识别',hidden:false},
      {id:'kws',label:tFn('voiceRecognizeSourceKws')||'快速口令',hidden:false}
    ];
    const disabled=pending||busy;
    const sig=[tabMode,voskOnly?'1':'0',disabled?'1':'0',busy?'1':'0',tabs.map(function(x){ return x.id+':'+(x.hidden?'1':'0'); }).join(',')].join('\0');
    return {
      activeTab:tabMode,
      voskOnly:voskOnly,
      disabled:disabled,
      busy:busy,
      tabs:tabs,
      sig:sig
    };
  }

  function applyVoiceEngineTabsHost(model){
    if(!model) model=buildVoiceEngineTabsModel();
    if(global.__otVoiceEngineTabsMounted&&typeof global.__otVoiceEngineTabsSync==='function'){
      global.__otVoiceEngineTabsSync();
      return;
    }
    const grid=$('voiceRecognizeSourceGrid');
    if(!grid) return;
    grid.querySelectorAll('[data-voice-engine-tab]').forEach(function(btn){
      const tab=btn.getAttribute('data-voice-engine-tab')||'';
      const on=tab===model.activeTab;
      btn.classList.toggle('is-active',on);
      btn.disabled=!!model.disabled;
      btn.setAttribute('aria-busy',model.busy?'true':'false');
      if(tab==='sapi') btn.hidden=!!model.voskOnly;
      else btn.hidden=false;
    });
  }

  function renderVoiceEngineTabs(){
    let tabMode=resolveActiveTabMode();
    if(tabMode==='off'||tabMode==='none') tabMode=defaultUiVoiceMode();
    applyVoiceEngineTabsHost(buildVoiceEngineTabsModel());
    if(voskOnlyUi()){
      if(voiceWakeExpandedMode!=='vosk'&&voiceWakeExpandedMode!=='kws') setVoiceWakeExpandedMode('vosk');
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
    if(cap&&voiceWakeExpandedMode!=='kws'){
      cap.textContent=t('voiceEngineCapabilityNotePro');
    }
  }
  function mergeWakeSnapshot(sapiRes,voskRes,kwsRes){
    sapiRes=sapiRes||{};
    voskRes=voskRes||{};
    kwsRes=kwsRes||{};
    const supervisor={
      desiredEngine:String(voskRes.desiredEngine||sapiRes.desiredEngine||kwsRes.desiredEngine||'').trim(),
      activeEngine:String(voskRes.activeEngine||sapiRes.activeEngine||kwsRes.activeEngine||'').trim(),
      listeningStrategy:String(voskRes.listeningStrategy||sapiRes.listeningStrategy||kwsRes.listeningStrategy||'').trim(),
      degraded:!!(voskRes.degraded||sapiRes.degraded||kwsRes.degraded),
      degradedReason:String(voskRes.degradedReason||sapiRes.degradedReason||kwsRes.degradedReason||'').trim(),
      activateBusy:!!(voskRes.activateBusy||sapiRes.activateBusy||kwsRes.activateBusy)
    };
    try{
      var bus=global.OneToneSoundBus;
      if(bus&&bus.notify){
        var issue=String(voskRes.resourceIssue||'').trim();
        if(issue==='model_missing'&&!global.__otSoundModelMissingLatched){
          global.__otSoundModelMissingLatched=true;
          bus.notify('model.missing',{dedupeKey:'model.missing'});
        }else if(issue!=='model_missing'){
          global.__otSoundModelMissingLatched=false;
        }
        if(supervisor.degraded&&!supervisor.activeEngine&&!global.__otSoundEngineDegradedLatched){
          global.__otSoundEngineDegradedLatched=true;
          bus.notify('engine.degraded',{dedupeKey:'engine.degraded'});
        }else if(!(supervisor.degraded&&!supervisor.activeEngine)){
          global.__otSoundEngineDegradedLatched=false;
        }
      }
    }catch(_){}
    const voskOn=!!voskRes.enabled;
    const sapiOn=!!sapiRes.enabled;
    const kwsOn=!!kwsRes.enabled;
    let engine='none',phrase='',wakeState='off';
    const active=supervisor.activeEngine;
    if(active==='vosk'||active==='kws'||active==='sapi'){
      engine=active;
    }else if(voskOn){
      engine='vosk';
    }else if(kwsOn){
      engine='kws';
    }else if(sapiOn){
      engine='sapi';
    }
    if(engine==='vosk'){
      const phrases=Array.isArray(voskRes.phrases)?voskRes.phrases:[];
      const cn=Array.isArray(voskRes.phrasesCn)?voskRes.phrasesCn:[];
      const en=Array.isArray(voskRes.phrasesEn)?voskRes.phrasesEn:[];
      phrase=(phrases[0]||cn[0]||en[0]||'').trim();
      wakeState=voskRes.state||'stopped';
    }else if(engine==='kws'){
      const phrases=Array.isArray(kwsRes.phrases)?kwsRes.phrases:[];
      phrase=(phrases[0]||kwsRes.lastDetectedPhrase||'').trim();
      wakeState=kwsRes.state||'stopped';
    }else if(engine==='sapi'){
      const phrases=Array.isArray(sapiRes.phrases)?sapiRes.phrases:[];
      phrase=(phrases[0]||'').trim();
      wakeState=sapiRes.state||'stopped';
    }
    return {
      engine:engine,
      phrase:phrase,
      state:wakeState,
      voskEnabled:voskOn,
      sapiEnabled:sapiOn,
      kwsEnabled:kwsOn,
      sapi:(sapiOn||active==='sapi')?sapiRes:Object.assign({},sapiRes,{enabled:false,state:'stopped'}),
      vosk:(voskOn||active==='vosk')?voskRes:Object.assign({},voskRes,{enabled:false,state:'stopped'}),
      kws:(kwsOn||active==='kws')?kwsRes:Object.assign({},kwsRes,{enabled:false,state:'stopped'}),
      supervisor:supervisor
    };
  }
  function applySupervisorEngineToConfig(desired){
    desired=String(desired||'').trim().toLowerCase();
    if(desired!=='vosk'&&desired!=='sapi'&&desired!=='kws'&&desired!=='none') return false;
    const root=state().config;
    if(!root) return false;
    root.desiredEngine=desired;
    const vosk=root.voiceVosk||root.voice_vosk||(root.voiceVosk={});
    const sapi=root.voiceSapi||root.voice_sapi||(root.voiceSapi={});
    const kws=root.voiceKws||root.voice_kws||(root.voiceKws={});
    root.voiceVosk=vosk;
    root.voiceSapi=sapi;
    root.voiceKws=kws;
    vosk.enabled=desired==='vosk';
    sapi.enabled=desired==='sapi';
    kws.enabled=desired==='kws';
    return true;
  }

  function applyListeningStrategyToConfig(strategy){
    const root=state().config;
    if(!root) return false;
    strategy=String(strategy||'').trim();
    if(!strategy) return false;
    root.voiceListeningStrategy=strategy;
    // Keep FE desiredEngine mirrors aligned with product strategy (matches Rust apply_voice_listening_strategy).
    if(strategy==='off') syncDesiredEngineConfig('none');
    else if(strategy==='enhanced') syncDesiredEngineConfig('vosk');
    // auto/resourceSaver: Rust may keep Vosk when KWS keywords_empty — do NOT force kws.enabled
    // (fought live vosk on every poll; auto switch → UI_HB_STALL_5S).
    else if(strategy==='auto'||strategy==='resourceSaver'){
      syncDesiredEngineConfig('kws');
    }
    return true;
  }

  function maybeApplyListeningStrategyFromStatus(strategy){
    strategy=String(strategy||'').trim();
    if(!strategy) return;
    // Never let a stale status poll clobber an in-flight / pending strategy switch.
    if(voiceModeSwitchInFlight) return;
    if(voiceModeSwitchPending&&voiceModeSwitchPending.kind==='strategy') return;
    applyListeningStrategyToConfig(strategy);
  }

  function syncVoiceSapiConfigFromStatus(res){
    if(!state().config||!res) return;
    const cfg=state().config.voiceSapi||state().config.voice_sapi||(state().config.voiceSapi={});
    state().config.voiceSapi=cfg;
    const desired=String(res.desiredEngine||'').trim().toLowerCase();
    const strategy=String(res.listeningStrategy||'').trim();
    maybeApplyListeningStrategyFromStatus(strategy);
    if(desired){
      applySupervisorEngineToConfig(desired);
    }else{
      const kws=state().config.voiceKws||state().config.voice_kws||{};
      const vosk=state().config.voiceVosk||state().config.voice_vosk||{};
      if(kws.enabled||vosk.enabled){
        cfg.enabled=false;
      }else{
        cfg.enabled=!!res.enabled;
      }
    }
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
    const desired=String(res.desiredEngine||'').trim().toLowerCase();
    const strategy=String(res.listeningStrategy||'').trim();
    maybeApplyListeningStrategyFromStatus(strategy);
    if(desired){
      applySupervisorEngineToConfig(desired);
    }else{
      const kws=state().config.voiceKws||state().config.voice_kws||{};
      const sapi=state().config.voiceSapi||state().config.voice_sapi||{};
      if(kws.enabled||sapi.enabled){
        cfg.enabled=false;
      }else{
        cfg.enabled=!!res.enabled;
      }
    }
    const pending=pendingWakePhrases();
    if(pending) cfg.phrases=hooks().cloneStringList(pending);
    else if(Array.isArray(res.phrases)) cfg.phrases=hooks().cloneStringList(res.phrases);
    if(res.targetKey!=null) cfg.targetKey=String(res.targetKey||'').trim();
    if(res.cooldownMs!=null) cfg.cooldownMs=Number(res.cooldownMs)||2000;
    if(res.modelPath!=null) cfg.modelPath=String(res.modelPath||'').trim();
    if(res.modelPreset!=null) cfg.modelPreset=String(res.modelPreset||'').trim();
  }

  function syncVoiceKwsConfigFromStatus(res){
    if(!state().config||!res) return;
    const cfg=state().config.voiceKws||state().config.voice_kws||(state().config.voiceKws={});
    state().config.voiceKws=cfg;
    const desired=String(res.desiredEngine||'').trim().toLowerCase();
    const strategy=String(res.listeningStrategy||'').trim();
    maybeApplyListeningStrategyFromStatus(strategy);
    if(desired){
      applySupervisorEngineToConfig(desired);
    }else{
      cfg.enabled=!!res.enabled;
      if(res.enabled){
        const vosk=state().config.voiceVosk||state().config.voice_vosk||(state().config.voiceVosk={});
        const sapi=state().config.voiceSapi||state().config.voice_sapi||(state().config.voiceSapi={});
        state().config.voiceVosk=vosk;
        state().config.voiceSapi=sapi;
        vosk.enabled=false;
        sapi.enabled=false;
      }
    }
    // status.phrases is the runtime effective list (wake + summon + end); do not mirror into persisted wake config.
    if(res.targetKey!=null) cfg.targetKey=String(res.targetKey||'').trim();
    if(res.cooldownMs!=null) cfg.cooldownMs=Number(res.cooldownMs)||2000;
    if(res.modelPath!=null) cfg.modelPath=String(res.modelPath||'').trim();
    if(res.modelPreset!=null) cfg.modelPreset=String(res.modelPreset||'').trim();
  }

  function voiceBackendMatchesMode(mode){
    return resolveRuntimeEngine()===mode;
  }

  function voiceBackendMatchesStrategy(strategy){
    strategy=String(strategy||'').trim();
    // Compare against persisted config only — ignore temporary hold/optimistic UI state,
    // otherwise we skip IPC and disk stays on the old strategy (snap-back to 自动).
    const cfg=state().config||{};
    const persisted=String(cfg.voiceListeningStrategy||cfg.voice_listening_strategy||'auto').trim()||'auto';
    if(persisted!==strategy) return false;
    if(strategy==='off') return resolveRuntimeEngine()==='off';
    // Only treat as matched when we previously confirmed a successful strategy IPC.
    return !!(voiceStrategyHold&&voiceStrategyHold.confirmed&&voiceStrategyHold.strategy===strategy);
  }

  function currentVoiceMode(){
    const strategy=currentListeningStrategy();
    if(strategy==='resourceSaver') return 'kws';
    if(strategy==='enhanced') return 'vosk';
    if(strategy==='auto') return 'vosk';
    const runtime=resolveRuntimeEngine();
    if(runtime!=='off') return runtime;
    const cfg=state().config||{};
    const desired=String(cfg.desiredEngine||cfg.desired_engine||'').trim().toLowerCase();
    if(desired==='vosk'||desired==='sapi'||desired==='kws') return desired;
    const voskCfg=cfg.voiceVosk||cfg.voice_vosk||{};
    const sapiCfg=cfg.voiceSapi||cfg.voice_sapi||{};
    const kwsCfg=cfg.voiceKws||cfg.voice_kws||{};
    if(voskCfg.enabled&&!kwsCfg.enabled&&!sapiCfg.enabled) return 'vosk';
    if(sapiCfg.enabled&&!voskCfg.enabled&&!kwsCfg.enabled) return 'sapi';
    if(kwsCfg.enabled&&!voskCfg.enabled&&!sapiCfg.enabled) return 'kws';
    return voskOnlyUi()?'vosk':'off';
  }

  function currentListeningStrategy(){
    const held=getStrategyHold();
    if(held) return held;
    const cfg=state().config||{};
    return String(cfg.voiceListeningStrategy||cfg.voice_listening_strategy||'auto').trim()||'auto';
  }

  function rollbackVoiceModeSwitch(){
    return Promise.all([
      loadVoiceKwsStatus().catch(function(){return null;}),
      loadVoiceVoskStatus().catch(function(){return null;}),
      loadVoiceSapiStatus().catch(function(){return null;})
    ]).then(function(arr){
      const kwsRes=arr[0], voskRes=arr[1], sapiRes=arr[2];
      if(kwsRes) syncVoiceKwsConfigFromStatus(kwsRes);
      if(voskRes) syncVoiceVoskConfigFromStatus(voskRes);
      if(sapiRes) syncVoiceSapiConfigFromStatus(sapiRes);
      const snap=hooks().voiceUiSnapshot;
      if(snap){
        snap.wake=mergeWakeSnapshot(sapiRes,voskRes,kwsRes);
      }
      const runtime=resolveRuntimeEngine(snap&&snap.wake);
      voiceWakeExpandedMode=runtime!=='off'?runtime:defaultUiVoiceMode();
      syncVoiceWakeExpandedUi();
      renderVoiceEngineTabs();
      applyHomeVoiceModeSwitchUi();
      if(hooks().scheduleRenderHomeLiveZone) hooks().scheduleRenderHomeLiveZone();
      else if(!ui().drawerOpen) hooks().renderHomeLiveZone();
    });
  }

  function stopStaleVoskForKws(){
    // Supervisor exclusivity keeps peers stopped; no side-channel vosk disable.
    return Promise.resolve(null);
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
    const grid=$('voiceRecognizeSourceGrid');
    if(grid){
      if(global.__otVoiceEngineTabsMounted&&typeof global.__otVoiceEngineTabsSync==='function'){
        global.__otVoiceEngineTabsSync();
      }else{
        grid.querySelectorAll('[data-voice-engine-tab]').forEach(function(btn){
          btn.disabled=!!busy;
          btn.setAttribute('aria-busy',busy?'true':'false');
        });
      }
    }
    const strategyGrid=$('voiceSummaryEngineSwitch');
    if(strategyGrid){
      strategyGrid.querySelectorAll('[data-voice-strategy-tab]').forEach(function(btn){
        btn.disabled=!!busy;
        btn.setAttribute('aria-busy',busy?'true':'false');
      });
    }
  }

  function syncVoiceWakeExpandedUi(){
    const expanded=voiceWakeExpandedMode||resolveRuntimeEngine()||'vosk';
    const sapiWrap=$('btnVoiceModeSapi');
    const voskWrap=$('btnVoiceModeVosk');
    const sapiBlock=$('voiceSapiBlock');
    const voskBlock=$('voiceVoskBlock');
    const sapiPanel=$('voiceResourceSapiPanel');
    const voskPanel=$('voiceResourceVoskPanel');
    const kwsPanel=$('voiceResourceKwsPanel');
    if(voskOnlyUi()){
      if(sapiWrap) sapiWrap.hidden=true;
      if(sapiBlock) sapiBlock.hidden=true;
      if(sapiPanel) sapiPanel.hidden=true;
      const showKws=expanded==='kws';
      const showVosk=expanded==='vosk'||!showKws;
      if(kwsPanel) kwsPanel.hidden=!showKws;
      if(voskWrap) voskWrap.hidden=!showVosk;
      if(voskBlock) voskBlock.hidden=!showVosk;
      if(voskPanel) voskPanel.hidden=!showVosk;
      return;
    }
    const showSapi=expanded==='sapi';
    const showVosk=expanded==='vosk';
    const showKws=expanded==='kws';
    if(sapiWrap) sapiWrap.hidden=!showSapi;
    if(sapiBlock) sapiBlock.hidden=!showSapi;
    if(sapiPanel) sapiPanel.hidden=!showSapi;
    if(voskWrap) voskWrap.hidden=!showVosk;
    if(voskBlock) voskBlock.hidden=!showVosk;
    if(voskPanel) voskPanel.hidden=!showVosk;
    if(kwsPanel) kwsPanel.hidden=!showKws;
  }

  function setVoiceWakeExpandedMode(mode){
    if(voskOnlyUi()&&mode==='sapi') mode='vosk';
    if(mode!=='sapi'&&mode!=='vosk'&&mode!=='kws') return;
    voiceWakeExpandedMode=mode;
    if(ui().selectedSceneVoiceNav!=='voice:end'){
      if(mode==='vosk') ui().selectedSceneVoiceNav='voice:vosk';
      else if(mode==='sapi') ui().selectedSceneVoiceNav='voice:sapi';
      else if(mode==='kws') ui().selectedSceneVoiceNav='voice:recognize';
    }
    syncVoiceWakeExpandedUi();
    renderVoiceEngineTabs();
    renderVoiceMicLive();
    global.OneToneVoiceEnd.syncModeUi();
    if(global.OneToneSceneModeHub) global.OneToneSceneModeHub.renderVoiceSubnav();
    renderWakeCustomPhrases();
    syncWakePresetHostVisibility();
  }

  function renderVoiceModeSwitch(){
    const mode=resolveRuntimeEngine();
    const strategy=currentListeningStrategy();
    const endEnabled=global.OneToneVoiceEnd.enabledInConfig();
    var fp=[mode,strategy,voiceModeSwitchInFlight?1:0,endEnabled?1:0,voskOnlyUi()?1:0].join('|');
    if(fp===lastVoiceModeSwitchFp) return;
    lastVoiceModeSwitchFp=fp;
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
      if(strategy==='resourceSaver') currentEl.textContent=t('voiceModeCurrentKws');
      else if(strategy==='enhanced') currentEl.textContent=t('voiceModeCurrentEnhanced');
      else if(strategy==='off') currentEl.textContent=t('voiceModeCurrentOff');
      else if(strategy==='advanced'&&mode==='sapi') currentEl.textContent=t('voiceModeCurrentLite');
      else if(strategy==='advanced'&&mode==='kws') currentEl.textContent=t('voiceModeCurrentKws');
      else if(strategy==='auto'||mode==='vosk'||mode==='kws') currentEl.textContent=t('voiceModeCurrentPro');
      else if(mode==='sapi') currentEl.textContent=t('voiceModeCurrentLite');
      else currentEl.textContent=t('voiceModeCurrentOff');
    }
    if(hintEl){
      if(strategy==='resourceSaver') hintEl.textContent=t('voiceListeningStrategyResourceSaverDesc');
      else if(strategy==='enhanced') hintEl.textContent=t('voiceListeningStrategyEnhancedDesc');
      else if(strategy==='off') hintEl.textContent=t('voiceModeHintOff');
      else if(strategy==='advanced'){
        if(mode==='kws') hintEl.textContent=t('voiceModeHintKws');
        else if(mode==='sapi') hintEl.textContent=t('voiceModeHintLite');
        else hintEl.textContent=endEnabled?t('voiceModeHintProWithEnd'):t('voiceModeHintPro');
      }else if(mode==='kws') hintEl.textContent=t('voiceModeHintKws');
      else if(voskOnlyUi()||mode==='vosk') hintEl.textContent=endEnabled?t('voiceModeHintProWithEnd'):t('voiceModeHintPro');
      else if(mode==='sapi') hintEl.textContent=t('voiceModeHintLite');
      else hintEl.textContent=t('voiceListeningStrategyAutoDesc');
    }
    hooks().renderVoiceModeUsage();
    setVoiceModeCardBusy(voiceModeSwitchInFlight);
    syncVoiceStrategyTabButtons(voiceModeSwitchInFlight);
    global.OneToneVoiceEnd.syncModeUi();
    renderVoiceEngineTabs();
    renderSettingsVoiceSubnav();
    // voiceWake park: light flow (wake phrase + rail) — full schemes remount was 假死;
    // skipping all paint left 首选唤醒口令 as "—" and right rail dead.
    if(ui().drawerOpen&&ui().settingsPanel==='voiceWake'){
      clearTimeout(voiceModeFlowDebounceTimer);
      voiceModeFlowDebounceTimer=setTimeout(function(){
        voiceModeFlowDebounceTimer=0;
        if(global.OneToneVoiceSettingsFlow&&global.OneToneVoiceSettingsFlow.scheduleVoiceSettingsRender){
          global.OneToneVoiceSettingsFlow.scheduleVoiceSettingsRender();
        }
      },40);
    }else if(global.OneToneVoiceSettingsFlow&&global.OneToneVoiceSettingsFlow.scheduleVoiceSettingsRender){
      clearTimeout(voiceModeFlowDebounceTimer);
      var flowDelay=Math.max(320, voiceOpenFlowSettleUntil?Math.max(0,voiceOpenFlowSettleUntil-Date.now()):0);
      voiceModeFlowDebounceTimer=setTimeout(function(){
        voiceModeFlowDebounceTimer=0;
        if(global.OneToneVoiceSettingsFlow&&global.OneToneVoiceSettingsFlow.scheduleVoiceSettingsRender){
          global.OneToneVoiceSettingsFlow.scheduleVoiceSettingsRender();
        }
      },flowDelay);
    }else{
      hooks().renderVoiceSettingsFlow();
    }
    // Reflow under cursor after chrome paint — brief lite ignore (ghost tabs @+2–3s).
    try{
      if(ui().drawerOpen&&ui().settingsPanel==='voiceWake'){
        voiceOpenLiteGuardUntil=Math.max(voiceOpenLiteGuardUntil,Date.now()+1200);
      }
    }catch(_){}
  }

  function applyHomeVoiceModeSwitchUi(){
    global.OneToneVoiceEnd.syncModeUi();
    if(ui().drawerOpen) renderVoiceModeSwitch();
    else if(hooks().renderHomeVoiceModeSwitchUi) hooks().renderHomeVoiceModeSwitchUi();
    applyPendingVoiceSendMode();
  }

  function applyPendingVoiceSendMode(){
    var pending=global.__vp_voice_pending_send_mode__;
    if(!pending||pending==='confirm') return;
    var eng=global.OneToneHomeLive&&global.OneToneHomeLive.voiceEngineOn?global.OneToneHomeLive.voiceEngineOn():'off';
    if(eng!=='vosk'&&eng!=='kws') return;
    global.__vp_voice_pending_send_mode__=null;
    if(global.OneToneVoiceEnd&&global.OneToneVoiceEnd.setOutputMode){
      global.OneToneVoiceEnd.setOutputMode(pending);
    }
    if(hooks().renderVoiceSettingsFlow) hooks().renderVoiceSettingsFlow();
  }

  function ipcWithTimeout(cmd,args,ms){
    ms=ms||15000;
    return Promise.race([
      global.OneToneIpc.invoke(cmd,args),
      new Promise(function(_,reject){
        setTimeout(function(){ reject(new Error('IPC timeout: '+cmd)); },ms);
      })
    ]);
  }

  function syncDesiredEngineConfig(engine){
    if(!state().config) return;
    const eng=String(engine||'none').trim().toLowerCase();
    state().config.desiredEngine=eng;
    const vosk=state().config.voiceVosk||state().config.voice_vosk||(state().config.voiceVosk={});
    const sapi=state().config.voiceSapi||state().config.voice_sapi||(state().config.voiceSapi={});
    const kws=state().config.voiceKws||state().config.voice_kws||(state().config.voiceKws={});
    state().config.voiceVosk=vosk;
    state().config.voiceSapi=sapi;
    state().config.voiceKws=kws;
    vosk.enabled=eng==='vosk';
    sapi.enabled=eng==='sapi';
    kws.enabled=eng==='kws';
  }

  function applyDesiredEngineResult(bundle,mode,statusOpts,syncOpts){
    const requested=String((bundle&&bundle.strategy)||'').trim();
    const strategy=requested||String((bundle&&bundle.supervisor&&bundle.supervisor.listeningStrategy)||'').trim();
    if(strategy) applyListeningStrategyToConfig(strategy);
    const voskRes=bundle&&bundle.voiceVosk?bundle.voiceVosk:null;
    const sapiRes=bundle&&bundle.voiceSapi?bundle.voiceSapi:null;
    const kwsRes=bundle&&bundle.voiceKws?bundle.voiceKws:null;
    const eng=String((bundle&&bundle.engine)||mode||'').trim().toLowerCase();
    // Supervisor desired may be vosk/none while product strategy stays auto/resourceSaver/enhanced.
    // Prefer strategy mirrors when a product strategy is present; only use engine for advanced/off.
    if(strategy==='auto'||strategy==='resourceSaver'||strategy==='enhanced'||strategy==='off'){
      applyListeningStrategyToConfig(strategy);
    }else if(eng){
      syncDesiredEngineConfig(eng);
    }
    if(voskRes) syncVoiceVoskConfigFromStatus(voskRes);
    if(sapiRes) syncVoiceSapiConfigFromStatus(sapiRes);
    if(kwsRes) syncVoiceKwsConfigFromStatus(kwsRes);
    // Status sync may carry a stale listeningStrategy during async activate — re-assert.
    if(requested) applyListeningStrategyToConfig(requested);
    else if(strategy) applyListeningStrategyToConfig(strategy);
    if(voskRes) renderVoiceVoskStatus(voskRes,statusOpts);
    if(sapiRes) renderVoiceSapiStatus(sapiRes,statusOpts);
    if(kwsRes) renderVoiceKwsStatus(kwsRes,statusOpts);
    const snap=hooks().voiceUiSnapshot;
    if(snap){
      snap.wake=mergeWakeSnapshot(sapiRes,voskRes,kwsRes);
    }
    return {voskRes:voskRes,sapiRes:sapiRes,kwsRes:kwsRes,engine:eng};
  }

  function setListeningStrategyRemote(strategy){
    return ipcWithTimeout('cmd_voice_set_listening_strategy',{strategy:String(strategy||'').trim()});
  }

  function expandVoskEngineDetails(){
    const adv=$('voiceCoreAdvanced');
    if(adv) adv.open=true;
    const det=$('voiceRecognizeEngineDetails');
    if(det&&det.tagName==='DETAILS') det.open=true;
    if(global.OneToneVoiceWakeNavigation&&global.OneToneVoiceWakeNavigation.expandForEditMode){
      global.OneToneVoiceWakeNavigation.expandForEditMode('input');
    }
  }

  var voiceSetupOverlayPinned=false;
  var voiceSetupOverlayOpenedAt=0;
  var voiceSetupActivating=false;

  function strategyNeedsVoskFallback(strategy){
    strategy=String(strategy||'').trim();
    return strategy==='auto'||strategy==='enhanced';
  }

  function voskListeningOk(res){
    if(!res) return false;
    const st=String(res.state||'');
    const listening=st==='listening'||st==='running'||st==='cooldown'||st==='triggered';
    if(!listening) return false;
    // Prefer positive model probe, but do not reject a live engine if probe is briefly stale.
    if(res.dllExists===false) return false;
    const issue=String(res.resourceIssue||'');
    if(issue==='dll_missing'||issue==='model_missing') return false;
    if(res.modelExists===false) return false;
    return true;
  }

  function voskModelPresent(res){
    if(!res) return false;
    if(res.modelExists===true&&res.dllExists!==false) return true;
    const issue=String(res.resourceIssue||'');
    return !issue&&res.modelExists!==false&&res.dllExists!==false;
  }

  function shouldShowVoskMissingPanel(res){
    if(!res) return false;
    if(voskListeningOk(res)) return false;
    // Model present and engine still opening — not a download problem.
    const st=String(res.state||'');
    if(voskModelPresent(res)&&(st==='starting'||st==='stopping'||st===''||st==='stopped')) return false;
    if(res.modelExists===false||res.dllExists===false) return true;
    const issue=String(res.resourceIssue||'');
    if(issue==='model_missing'||issue==='dll_missing') return true;
    const err=String(res.lastError||'').trim().toLowerCase();
    if(!err) return false;
    if(err.indexOf('load model failed')>=0||err.indexOf('model_missing')>=0||err.indexOf('model not found')>=0) return true;
    if(err.indexOf('dll_missing')>=0||err.indexOf('failed to load')>=0) return true;
    // Generic error with model on disk is a start failure, not a download prompt.
    if(st==='error'&&voskModelPresent(res)) return false;
    if(st==='error') return true;
    return false;
  }

  function voskSetupFullyResolved(res){
    return voskListeningOk(res);
  }

  function formatVoskStartFailDetail(res){
    if(!res) return t('voiceVoskFail');
    const last=String(res.lastError||'').trim();
    if(last) return last;
    const issue=String(res.resourceIssue||'').trim();
    if(issue) return issue;
    const st=String(res.state||'unknown');
    const model=res.modelExists===true?'ok':(res.modelExists===false?'missing':'unknown');
    const dll=res.dllExists===true?'ok':(res.dllExists===false?'missing':'unknown');
    return t('voiceVoskStartDetail')
      .replace('{state}',st)
      .replace('{model}',model)
      .replace('{dll}',dll);
  }

  function waitForVoskReady(maxMs){
    maxMs=Math.max(1200,Number(maxMs)||8000);
    const started=Date.now();
    function once(){
      return loadVoiceVoskStatus().then(function(res){
        if(voskListeningOk(res)) return {ok:true,res:res};
        const st=String((res&&res.state)||'');
        // Only hard-fail on error. "stopped" is normal mid-restart — keep waiting.
        if(st==='error'){
          const err=String((res&&res.lastError)||'').trim();
          if(err) return {ok:false,res:res||{}};
        }
        if(Date.now()-started>=maxMs) return {ok:false,res:res||{}};
        return new Promise(function(resolve){
          setTimeout(function(){ resolve(once()); },400);
        });
      });
    }
    return once();
  }

  function markVoskReady(res){
    hideVoiceSetupOverlay();
    hooks().toast(t('voiceVoskDownloadDone'));
    hooks().renderHomeLiveZone&&hooks().renderHomeLiveZone();
    if(global.OneToneHomeV9&&global.OneToneHomeV9.render) global.OneToneHomeV9.render();
    return res;
  }

  function setVoiceSetupDownloadEnabled(enabled){
    ['btnVoiceSetupOverlayDownload','btnVoiceSetupDownload','btnModelsVoskDownload'].forEach(function(id){
      const btn=document.getElementById(id);
      if(btn) btn.disabled=!enabled||!!voskDownloadInFlight;
    });
  }

  function ensureVoiceSetupOverlay(){
    var overlay=document.getElementById('voiceSetupOverlay');
    if(!overlay){
      overlay=document.createElement('div');
      overlay.id='voiceSetupOverlay';
      overlay.className='voice-setup-overlay';
      overlay.setAttribute('role','status');
      overlay.setAttribute('aria-live','polite');
      overlay.innerHTML=
        '<div class="voice-setup-overlay-card">'+
          '<p class="voice-setup-overlay-title" id="voiceSetupOverlayTitle"></p>'+
          '<p class="voice-setup-overlay-msg" id="voiceSetupOverlayMsg"></p>'+
          '<div class="voice-vosk-download-bar voice-setup-overlay-progress" id="voiceSetupOverlayProgress" hidden><div id="voiceSetupOverlayProgressFill"></div></div>'+
          '<p class="voice-setup-overlay-status" id="voiceSetupOverlayStatus" hidden></p>'+
          '<div class="voice-setup-overlay-actions">'+
            '<button type="button" class="btn primary" id="btnVoiceSetupOverlayDownload"></button>'+
            '<button type="button" class="btn secondary" id="btnVoiceSetupOverlayRetry"></button>'+
            '<button type="button" class="btn secondary" id="btnVoiceSetupOverlayDismiss"></button>'+
          '</div>'+
        '</div>';
      document.body.appendChild(overlay);
    }else if(overlay.parentNode!==document.body){
      document.body.appendChild(overlay);
    }
    overlay.removeAttribute('aria-modal');
    overlay.setAttribute('role','status');
    overlay.setAttribute('aria-live','polite');
    // Corner tip styles live in CSS — do not force fullscreen via inline styles.
    overlay.style.removeProperty('inset');
    overlay.style.removeProperty('background');
    overlay.style.zIndex='12000';
    overlay.style.position='fixed';
    return overlay;
  }

  function ensureVoiceSetupSticky(){
    // Sticky bar removed — single corner tip only.
    var bar=document.getElementById('voiceSetupSticky');
    if(bar&&bar.parentNode) bar.parentNode.removeChild(bar);
    return null;
  }

  function hideVoiceSetupOverlay(){
    voiceSetupOverlayPinned=false;
    voiceSetupOverlayOpenedAt=0;
    const overlay=document.getElementById('voiceSetupOverlay');
    if(overlay){
      overlay.hidden=true;
      overlay.style.removeProperty('display');
    }
    ensureVoiceSetupSticky();
    const banner=$('voiceSetupBanner');
    if(banner) banner.hidden=true;
  }

  function assertVoiceSetupVisible(){
    if(!voiceSetupOverlayPinned) return;
    const overlay=ensureVoiceSetupOverlay();
    overlay.hidden=false;
    overlay.removeAttribute('hidden');
    // Flex only on the tip host — never a full-screen blocker.
    overlay.style.setProperty('display','flex','important');
  }

  function bindVoiceSetupOverlayActions(){
    function onDownload(e){
      if(e){ e.preventDefault(); e.stopPropagation(); }
      downloadVoskModelGuide();
    }
    function onRetry(e){
      if(e){ e.preventDefault(); e.stopPropagation(); }
      retryVoskStart();
    }
    function onDismiss(e){
      if(e){ e.preventDefault(); e.stopPropagation(); }
      hideVoiceSetupOverlay();
    }
    ['btnVoiceSetupOverlayDownload','btnVoiceSetupDownload','btnModelsVoskDownload'].forEach(function(id){
      var el=document.getElementById(id);
      if(el) el.onclick=onDownload;
    });
    ['btnVoiceSetupOverlayRetry','btnVoiceSetupRetry','btnModelsVoskRetry','btnVoskRetry'].forEach(function(id){
      var el=document.getElementById(id);
      if(el) el.onclick=onRetry;
    });
    ['btnVoiceSetupOverlayDismiss'].forEach(function(id){
      var el=document.getElementById(id);
      if(el) el.onclick=onDismiss;
    });
  }

  function renderVoiceSetupBanner(res,opts){
    opts=opts||{};
    const strategy=String(opts.strategy||currentListeningStrategy()||'auto').trim();
    const force=!!opts.force;
    if(opts.resolved&&voskSetupFullyResolved(res)&&!voskDownloadInFlight){
      hideVoiceSetupOverlay();
      return false;
    }
    // Download dialog is only for missing DLL/model. Model present + starting must not flash it.
    const resourcesMissing=shouldShowVoskMissingPanel(res)||(res&&(res.modelExists===false||res.dllExists===false));
    if(res&&!resourcesMissing&&voskModelPresent(res)){
      if(voiceSetupOverlayPinned) hideVoiceSetupOverlay();
      const banner=$('voiceSetupBanner');
      if(banner) banner.hidden=true;
      return false;
    }
    let show=force||voiceSetupOverlayPinned||(strategyNeedsVoskFallback(strategy)&&resourcesMissing);
    if(!show){
      const banner=$('voiceSetupBanner');
      if(banner) banner.hidden=true;
      return false;
    }
    // Refuse to pin a download dialog when we cannot prove resources are missing.
    if(!resourcesMissing&&!voskDownloadInFlight){
      const banner=$('voiceSetupBanner');
      if(banner) banner.hidden=true;
      return false;
    }

    voiceSetupOverlayPinned=true;
    if(!voiceSetupOverlayOpenedAt) voiceSetupOverlayOpenedAt=Date.now();

    const overlay=ensureVoiceSetupOverlay();
    ensureVoiceSetupSticky();
    const banner=$('voiceSetupBanner');
    // Prefer a single modal; keep the in-page banner collapsed while overlay is open.
    if(banner) banner.hidden=true;
    assertVoiceSetupVisible();
    // Re-assert after status/render races in the same event loop.
    requestAnimationFrame(assertVoiceSetupVisible);
    setTimeout(assertVoiceSetupVisible,0);
    setTimeout(assertVoiceSetupVisible,100);
    setTimeout(assertVoiceSetupVisible,400);

    const issue=String((res&&res.resourceIssue)||'');
    const isDll=issue==='dll_missing'||(res&&res.dllExists===false);
    const titleText=isDll?t('voiceSetupBannerDllTitle'):t('voiceSetupBannerVoskTitle');
    const bodyText=strategy==='enhanced'?t('voiceSetupBannerEnhancedBody'):t('voiceSetupBannerVoskBody');

    var titleEl=document.getElementById('voiceSetupOverlayTitle');
    var msgEl=document.getElementById('voiceSetupOverlayMsg');
    if(titleEl) titleEl.textContent=titleText;
    if(msgEl) msgEl.textContent=bodyText;
    if($('voiceSetupBannerTitle')) $('voiceSetupBannerTitle').textContent=titleText;
    if($('voiceSetupBannerMsg')) $('voiceSetupBannerMsg').textContent=bodyText;

    var dlLabel=t('voiceVoskDownloadGuide');
    ['btnVoiceSetupOverlayDownload','btnVoiceSetupDownload'].forEach(function(id){
      var btn=document.getElementById(id);
      if(!btn) return;
      btn.hidden=!!isDll;
      btn.textContent=dlLabel;
      btn.disabled=!!voskDownloadInFlight;
    });
    ['btnVoiceSetupOverlayRetry','btnVoiceSetupRetry'].forEach(function(id){
      var btn=document.getElementById(id);
      if(btn) btn.textContent=t('voiceVoskRetry');
    });
    var dismiss=document.getElementById('btnVoiceSetupOverlayDismiss');
    if(dismiss) dismiss.textContent=t('voiceSetupBannerDismiss');
    bindVoiceSetupOverlayActions();
    return true;
  }

  function handleVoskMissingAfterStrategySwitch(strategy,res){
    if(voiceSetupActivating) return;
    if(voskListeningOk(res)){
      hideVoiceSetupOverlay();
      return;
    }
    // Model already on disk — never open the download dialog (causes flash then auto-hide).
    if(!shouldShowVoskMissingPanel(res)) return;
    renderVoskMissingPanel(res);
    renderVoiceSetupBanner(res||{},{strategy:strategy,force:true});
  }

  function pollVoskAfterStrategySwitch(strategy,seq){
    if(strategy!=='auto'&&strategy!=='enhanced') return;
    setTimeout(function(){
      if(seq!==voiceModeSwitchSeq) return;
      loadVoiceVoskStatus().then(function(res){
        if(seq!==voiceModeSwitchSeq) return;
        if(voskListeningOk(res)||voskModelPresent(res)){
          hideVoiceSetupOverlay();
          return;
        }
        if(shouldShowVoskMissingPanel(res)||(res&&res.modelExists===false)||!res){
          handleVoskMissingAfterStrategySwitch(strategy,res||{});
        }
      }).catch(function(){
        if(seq!==voiceModeSwitchSeq) return;
      });
    },1500);
  }

  function errMessage(err){
    if(err==null) return '';
    if(typeof err==='string') return err.trim();
    if(err&&err.message!=null) return String(err.message).trim();
    try{ return String(err).trim(); }catch(_){ return ''; }
  }

  function strategySwitchSuccessToast(strategy,toastLite){
    if(strategy==='resourceSaver'){
      hooks().toast(t('voiceListeningStrategySwitchedResourceSaver'),toastLite?'lite':'');
      return;
    }
    if(strategy==='enhanced'){
      hooks().toast(t('voiceListeningStrategySwitchedEnhanced'),toastLite?'lite':'');
      return;
    }
    if(strategy==='auto'){
      hooks().toast(t('voiceListeningStrategySwitchedAuto'),toastLite?'lite':'');
    }
  }

  function strategySwitchFailToast(strategy,err,res){
    const msg=errMessage(err);
    const hardFail=/denied|forbidden|not allowed|unknown command|command not found|not found|permission/i.test(msg);
    if(hardFail){
      hooks().toast(msg||t('voiceListeningStrategySwitchSoftFail'));
      return;
    }
    const isTimeout=/timeout/i.test(msg)||/unavailable/i.test(msg);
    // Timeout: config is usually already saved before activate; treat as success.
    if(isTimeout){
      applyListeningStrategyToConfig(strategy);
      setStrategyHold(strategy,8000,true);
      hideVoiceSetupOverlay();
      strategySwitchSuccessToast(strategy||'auto',true);
      return;
    }
    if(shouldShowVoskMissingPanel(res)){
      renderVoiceSetupBanner(res||{},{strategy:strategy||'auto',force:true});
      return;
    }
    hooks().toast(msg||t('voiceListeningStrategySwitchSoftFail'));
  }

  function drainVoiceModeSwitchPending(){
    const pending=voiceModeSwitchPending;
    voiceModeSwitchPending=null;
    if(!pending) return false;
    if(pending.kind==='strategy'){
      pumpListeningStrategySwitch(pending.strategy,pending.opts||{});
      return true;
    }
    if(pending.kind==='mode'){
      pumpVoiceModeSwitch(pending.opts||{});
      return true;
    }
    return false;
  }

  /** Wait until Rust strategy activate finishes (activateBusy=false). Early IPC ok is not enough. */
  function waitForActivateIdle(seq,timeoutMs){
    timeoutMs=timeoutMs||15000;
    // voiceWake keeps engines parked — status poll here re-created open-page 假死.
    if(ui().drawerOpen&&ui().settingsPanel==='voiceWake'){
      return Promise.resolve({state:'parked'});
    }
    const t0=Date.now();
    function delay(ms){
      return new Promise(function(resolve){ setTimeout(resolve,ms); });
    }
    function tick(){
      if(seq!==voiceModeSwitchSeq) return Promise.resolve({state:'cancelled'});
      return ipcWithTimeout('cmd_voice_vosk_status',{},4000).then(function(st){
        if(seq!==voiceModeSwitchSeq) return {state:'cancelled'};
        const busy=!!(st&&(st.activateBusy===true||(st.supervisor&&st.supervisor.activateBusy===true)));
        if(!busy) return {state:'idle',vosk:st||null};
        if(Date.now()-t0>=timeoutMs) return {state:'timeout',vosk:st||null};
        return delay(250).then(tick);
      }).catch(function(){
        if(seq!==voiceModeSwitchSeq) return {state:'cancelled'};
        if(Date.now()-t0>=timeoutMs) return {state:'timeout'};
        return delay(300).then(tick);
      });
    }
    // Let the activate thread set pending / take ACTIVATE_LOCK before first poll.
    return delay(40).then(tick);
  }

  function deferStrategyUiPaint(fn){
    setTimeout(function(){
      try{ fn(); }catch(_){}
    },0);
  }

  function pumpListeningStrategySwitch(strategy,opts){
    strategy=String(strategy||'').trim();
    if(strategy!=='auto'&&strategy!=='resourceSaver'&&strategy!=='enhanced'&&strategy!=='off') return;
    if(voiceModeSwitchInFlight){
      voiceModeSwitchPending={kind:'strategy',strategy:strategy,opts:opts||{}};
      return;
    }
    const seq=voiceModeSwitchSeq;
    const toastKind=(opts&&opts.toastKind)||'default';
    const toastLite=toastKind==='lite';
    const homeOnly=!ui().drawerOpen;
    // Always liveOnly — full vosk/sapi remount + modeSwitch after strategy IPC was UI_HB_STALL_5S
    // on voiceWake (runtime-live: switch enhanced → gap 5108ms seq=234, empty ipc).
    const statusOpts={liveOnly:true};
    const syncOpts={lightOnly:true,homeOnly:homeOnly};
    voiceModeSwitchInFlight=true;
    setVoiceModeCardBusy(true);
    // Optimistic local config so tabs don't bounce back while activate runs async.
    applyListeningStrategyToConfig(strategy);
    syncVoiceStrategyTabButtons(true);
    var strategySwitchOk=false;
    var strategySwitchLight=false;
    const finish=function(){
      voiceModeSwitchInFlight=false;
      setVoiceModeCardBusy(false);
      try{
        if(global.OneToneUiHeartbeat&&global.OneToneUiHeartbeat.clearTag){
          global.OneToneUiHeartbeat.clearTag('voiceStrategy:'+strategy);
        }
      }catch(_){}
      if(drainVoiceModeSwitchPending()) return;
      if(strategySwitchOk){
        applyListeningStrategyToConfig(strategy);
        setStrategyHold(strategy,5000,true);
      }
      // Islands + home remount on the same tick as settle caused UI_HB gap / 未响应.
      deferStrategyUiPaint(function(){
        var onVoiceWake=ui().drawerOpen&&ui().settingsPanel==='voiceWake';
        if(!strategySwitchLight&&!onVoiceWake){
          try{
            if(global.__otPendingIslandsRefresh){
              global.__otPendingIslandsRefresh=false;
              if(typeof global.OneToneIslandsRefresh==='function') global.OneToneIslandsRefresh();
            }
          }catch(_){}
        }else{
          try{ global.__otPendingIslandsRefresh=false; }catch(_){}
        }
        applyHomeVoiceModeSwitchUi();
        if(!strategySwitchLight&&!onVoiceWake){
          if(hooks().scheduleRenderHomeLiveZone) hooks().scheduleRenderHomeLiveZone();
          else if(!ui().drawerOpen) hooks().renderHomeLiveZone();
        }
      });
    };
    ipcWithTimeout('cmd_voice_set_listening_strategy',{strategy:String(strategy||'').trim()},12000).then(function(bundle){
      if(seq!==voiceModeSwitchSeq&&voiceModeSwitchPending) return;
      const appliedOk=!(!bundle||bundle.ok===false);
      const hasStatus=!!(bundle&&(bundle.voiceVosk||bundle.voiceKws||bundle.supervisor||bundle.strategy));
      if(!appliedOk&&!hasStatus){
        throw new Error((bundle&&bundle.error)||t('voiceListeningStrategySwitchSoftFail'));
      }
      strategySwitchOk=true;
      try{
        var desiredEng=String((bundle&&bundle.engine)||(bundle&&bundle.supervisor&&bundle.supervisor.desiredEngine)||'').trim().toLowerCase();
        if(desiredEng==='vosk'||desiredEng==='kws'||desiredEng==='sapi'){
          applySupervisorEngineToConfig(desiredEng);
        }
      }catch(_e){}
      if(!bundle.activateAsync&&strategy!=='off'){
        ipcWithTimeout('cmd_voice_wake_phrase_test_begin',{},5000).catch(function(){});
      }
      try{
        if(global.OneToneIpc&&global.OneToneIpc.invoke){
          global.OneToneIpc.invoke('cmd_app_log',{line:'fe set_listening_strategy ok strategy='+strategy+' bundle='+String((bundle&&bundle.strategy)||'')+' activateAsync='+(bundle&&bundle.activateAsync?1:0)}).catch(function(){});
        }
      }catch(_){}
      const settle=(bundle&&bundle.activateAsync)
        // off 只需停机，不必等满 15s（否则顶栏开关会像假死）。
        ?waitForActivateIdle(seq,strategy==='off'?3500:15000).then(function(settled){
          try{
            if(global.OneToneIpc&&global.OneToneIpc.invoke){
              global.OneToneIpc.invoke('cmd_app_log',{line:'fe set_listening_strategy settled strategy='+strategy+' state='+String((settled&&settled.state)||'')}).catch(function(){});
            }
          }catch(_){}
          return settled;
        })
        :Promise.resolve({state:'sync'});
      return settle.then(function(settled){
        if(seq!==voiceModeSwitchSeq&&voiceModeSwitchPending) return;
        // Strategy IPC has no voice* status — reuse idle-poll vosk so we never invent stopped.
        const voskLive=(settled&&settled.vosk)||(bundle&&bundle.voiceVosk)||null;
        const forced=Object.assign({},bundle||{},{strategy:strategy});
        if(voskLive) forced.voiceVosk=voskLive;
        // vosk→vosk noop (auto/省电/增强 when KWS unavailable): skip syncHome/islands/pollVosk.
        const desiredLive=String((voskLive&&voskLive.desiredEngine)||(bundle&&bundle.engine)||'').trim().toLowerCase();
        if(voskListeningOk(voskLive)&&desiredLive==='vosk'&&(strategy==='auto'||strategy==='enhanced'||strategy==='resourceSaver')){
          strategySwitchLight=true;
          applyListeningStrategyToConfig(strategy);
          setStrategyHold(strategy,8000,true);
          if(strategy==='resourceSaver') voiceWakeExpandedMode='kws';
          else voiceWakeExpandedMode='vosk';
          hideVoiceSetupOverlay();
          strategySwitchSuccessToast(strategy,toastLite);
          return;
        }
        const uiMode=strategy==='resourceSaver'?'kws':'vosk';
        const applied=applyDesiredEngineResult(forced,uiMode,statusOpts,syncOpts);
        applyListeningStrategyToConfig(strategy);
        setStrategyHold(strategy,8000,true);
        const snapWake=(hooks().voiceUiSnapshot&&hooks().voiceUiSnapshot.wake)||{};
        const voskForHome=applied.voskRes||voskLive||snapWake.vosk||null;
        const sapiForHome=applied.sapiRes||snapWake.sapi||null;
        const kwsForHome=applied.kwsRes||snapWake.kws||null;
        if(strategy==='off'){
          hooks().syncHomeFromVoiceSettings(
            voskForHome||{enabled:false,state:'stopped'},
            sapiForHome||{enabled:false,state:'stopped'},
            null,
            syncOpts,
            kwsForHome
          );
          scheduleVoiceToggleRefresh();
          return;
        }
        if(strategy==='resourceSaver'){
          voiceWakeExpandedMode='kws';
          hideVoiceSetupOverlay();
          hooks().syncHomeFromVoiceSettings(
            voskForHome,
            sapiForHome,
            null,
            syncOpts,
            kwsForHome
          );
          strategySwitchSuccessToast(strategy,toastLite);
          scheduleVoiceToggleRefresh();
          return;
        }
        voiceWakeExpandedMode='vosk';
        if(shouldShowVoskMissingPanel(applied.voskRes||voskLive)){
          handleVoskMissingAfterStrategySwitch(strategy,applied.voskRes||voskLive);
        }else{
          hideVoiceSetupOverlay();
        }
        pollVoskAfterStrategySwitch(strategy,seq);
        // Listening strategy does not change end/dictation — skip cmd_voice_end_status
        // (was stacking with islands refresh → UI_HB stall on 省电↔增强).
        applyListeningStrategyToConfig(strategy);
        hooks().syncHomeFromVoiceSettings(
          voskForHome,
          {enabled:false,state:'stopped'},
          null,
          syncOpts,
          kwsForHome
        );
        strategySwitchSuccessToast(strategy,toastLite);
        scheduleVoiceToggleRefresh();
      });
    }).catch(function(err){
      if(voiceModeSwitchPending) return;
      const msg=errMessage(err);
      try{
        if(global.OneToneIpc&&global.OneToneIpc.invoke){
          global.OneToneIpc.invoke('cmd_app_log',{line:'fe set_listening_strategy fail strategy='+strategy+' err='+msg}).catch(function(){});
        }
      }catch(_){}
      // Permission/ACL/unknown-command must not look like success — that snaps UI back to disk.
      const hardFail=/denied|forbidden|not allowed|unknown command|command not found|not found|permission/i.test(msg);
      if(hardFail){
        clearStrategyHold(strategy);
        rollbackVoiceModeSwitch();
        toastVoskMissingOrFail(strategy,err);
        console.error('voice_strategy_'+strategy,err);
        return;
      }
      // Timeout/async activate: config is usually already saved before activate returns.
      if(/timeout/i.test(msg)||/unavailable/i.test(msg)){
        strategySwitchOk=true;
        applyListeningStrategyToConfig(strategy);
        setStrategyHold(strategy,8000,true);
        hideVoiceSetupOverlay();
        strategySwitchSuccessToast(strategy,toastLite);
        scheduleVoiceToggleRefresh();
        return;
      }
      rollbackVoiceModeSwitch();
      toastVoskMissingOrFail(strategy,err);
      console.error('voice_strategy_'+strategy,err);
    }).finally(finish);
  }

  function switchListeningStrategy(strategy,opts){
    opts=opts||{};
    strategy=String(strategy||'').trim();
    if(strategy!=='auto'&&strategy!=='resourceSaver'&&strategy!=='enhanced'&&strategy!=='off') return;
    // Homepage howto / deferred island clicks must not land on strategy tabs under the cursor.
    var liteClick=opts.toastKind==='lite';
    // #region agent log
    try{ if(global.__dbgB5) global.__dbgB5('C','voice-wake.js:switchListeningStrategy','strategy switch attempt',{strategy:strategy,toastKind:opts.toastKind||'',force:!!opts.force,liteGuard:isOpenLiteGuarded()?1:0,clickGuard:isOpenClickGuarded()?1:0,inFlight:voiceModeSwitchInFlight?1:0}); }catch(_){}
    // #endregion
    if(!opts.force&&((liteClick&&isOpenLiteGuarded())||(!liteClick&&isOpenClickGuarded()))){
      try{
        if(global.OneToneIpc&&global.OneToneIpc.invoke){
          global.OneToneIpc.invoke('cmd_app_log',{line:'fe switchListeningStrategy ignored open-guard strategy='+strategy}).catch(function(){});
        }
      }catch(_){}
      return;
    }
    // Ghost multi-tab hits: do NOT coalesce lite into pending — drain applied the ghost
    // right after the first switch (logs: resourceSaver→auto→enhanced, inFlight:0 each time).
    if(liteClick&&!opts.force&&(voiceModeSwitchInFlight||isLiteStrategyCooling())){
      // #region agent log
      try{ if(global.__dbgB5) global.__dbgB5('C','voice-wake.js:switchListeningStrategy:drop','lite strategy dropped inFlight/cooldown',{strategy:strategy,inFlight:voiceModeSwitchInFlight?1:0,cooling:isLiteStrategyCooling()?1:0}); }catch(_){}
      // #endregion
      return;
    }
    if(liteClick) noteLiteStrategyCommit();
    // Short ghost absorb only — 700ms+ made intentional 自动/增强/省电 clicks feel stuck.
    try{
      voiceOpenClickGuardUntil=Math.max(voiceOpenClickGuardUntil,Date.now()+220);
      voiceOpenLiteGuardUntil=Math.max(voiceOpenLiteGuardUntil,Date.now()+450);
    }catch(_){}
    voiceModeSwitchSeq++;
    hooks().markVoiceEngineBootHandled();
    if(strategy==='resourceSaver') setVoiceWakeExpandedMode('kws');
    else if(strategy==='auto'||strategy==='enhanced') setVoiceWakeExpandedMode('vosk');
    // Match against backend/config BEFORE optimistic write — otherwise we skip IPC
    // and the next mvp_init/status poll snaps the tab back to the persisted strategy.
    const alreadyMatched=voiceBackendMatchesStrategy(strategy)&&!voiceModeSwitchInFlight;
    setStrategyHold(strategy,15000);
    applyListeningStrategyToConfig(strategy);
    syncVoiceStrategyTabButtons(false);
    try{
      if(global.OneToneIpc&&global.OneToneIpc.invoke){
        global.OneToneIpc.invoke('cmd_app_log',{line:'fe switchListeningStrategy strategy='+strategy+' matched='+(alreadyMatched?1:0)}).catch(function(){});
      }
    }catch(_){}
    if(alreadyMatched){
      clearStrategyHold(strategy);
      deferStrategyUiPaint(function(){
        applyHomeVoiceModeSwitchUi();
        try{
          // voiceWake park: skip islands remount on no-op strategy click.
          if(ui().drawerOpen&&ui().settingsPanel==='voiceWake'){
            global.__otPendingIslandsRefresh=false;
          }else if(global.__otPendingIslandsRefresh){
            global.__otPendingIslandsRefresh=false;
            if(typeof global.OneToneIslandsRefresh==='function') global.OneToneIslandsRefresh();
          }
        }catch(_){}
      });
      if(global.OneToneVoiceSchemeContext&&global.OneToneVoiceSchemeContext.mirrorGlobalToOverride){
        global.OneToneVoiceSchemeContext.mirrorGlobalToOverride();
      }
      return;
    }
    // Lite: skip full modeSwitch paint before IPC — was stacking with sync save_config and 假死.
    if(liteClick){
      syncVoiceStrategyTabButtons(false);
    }else{
      deferStrategyUiPaint(applyHomeVoiceModeSwitchUi);
    }
    if(global.OneToneVoiceSchemeContext&&global.OneToneVoiceSchemeContext.mirrorGlobalToOverride){
      global.OneToneVoiceSchemeContext.mirrorGlobalToOverride();
    }
    try{
      if(global.OneToneUiHeartbeat&&global.OneToneUiHeartbeat.setTag) global.OneToneUiHeartbeat.setTag('voiceStrategy:'+strategy);
    }catch(_){}
    pumpListeningStrategySwitch(strategy,opts);
  }

  function pumpVoiceModeSwitch(opts){
    if(voiceModeSwitchInFlight){
      voiceModeSwitchPending={kind:'mode',opts:opts||{}};
      return;
    }
    const mode=voiceWakeExpandedMode;
    if(mode!=='sapi'&&mode!=='vosk'&&mode!=='kws') return;
    const seq=voiceModeSwitchSeq;
    const toastKind=(opts&&opts.toastKind)||'default';
    const toastLite=toastKind==='lite';
    function modeToast(){
      if(mode==='kws'){
        hooks().toast(t('voiceModeSwitchedKws'));
        return;
      }
      if(toastLite) hooks().toast(mode==='sapi'?t('voiceNavToastLite'):t('voiceNavToastPro'),'lite');
      else hooks().toast(mode==='sapi'?t('voiceModeSwitchedLite'):t('voiceModeSwitchedPro'));
    }
    const homeOnly=!ui().drawerOpen;
    // Same as strategy switch: never full remount on the click/IPC settle path.
    const statusOpts={liveOnly:true};
    const syncOpts={lightOnly:true,homeOnly:homeOnly};
    voiceModeSwitchInFlight=true;
    setVoiceModeCardBusy(true);
    const finish=function(){
      voiceModeSwitchInFlight=false;
      setVoiceModeCardBusy(false);
      if(drainVoiceModeSwitchPending()) return;
      deferStrategyUiPaint(function(){
        applyHomeVoiceModeSwitchUi();
        if(hooks().scheduleRenderHomeLiveZone) hooks().scheduleRenderHomeLiveZone();
        else if(!ui().drawerOpen) hooks().renderHomeLiveZone();
      });
    };
    // Explicit engine pick maps to product strategy. Never map vosk → auto
    // (that was snapping 增强/省电 back to 自动).
    const req=(mode==='kws')
      ?setListeningStrategyRemote('resourceSaver')
      :(mode==='vosk')
        ?setListeningStrategyRemote('enhanced')
        :ipcWithTimeout('cmd_voice_set_desired_engine',{engine:mode});
    req.then(function(bundle){
      if(voiceModeSwitchPending) return;
      const appliedOk=!(!bundle||bundle.ok===false);
      const hasStatus=!!(bundle&&(bundle.voiceVosk||bundle.voiceKws||bundle.supervisor||bundle.strategy));
      if(!appliedOk&&!hasStatus){
        throw new Error((bundle&&bundle.error)||t('voiceListeningStrategySwitchSoftFail'));
      }
      const forcedStrategy=mode==='kws'?'resourceSaver':(mode==='vosk'?'enhanced':'');
      const forced=forcedStrategy?Object.assign({},bundle||{},{strategy:forcedStrategy}):(bundle||{});
      const applied=applyDesiredEngineResult(forced,mode,statusOpts,syncOpts);
      if(forcedStrategy) applyListeningStrategyToConfig(forcedStrategy);
      if(mode==='sapi'){
        if(!handleVoiceSapiEnableResult(applied.sapiRes||{enabled:false},true)) return;
        hooks().syncHomeFromVoiceSettings(
          {enabled:false,state:'stopped'},
          applied.sapiRes||{enabled:false,state:'stopped'},
          null,
          syncOpts,
          applied.kwsRes
        );
        modeToast();
        scheduleVoiceToggleRefresh();
        return null;
      }
      if(mode==='kws'){
        const kwsRes=applied.kwsRes;
        if(!kwsRes){
          throw new Error((kwsRes&&kwsRes.lastError)||t('voiceKwsFail'));
        }
        voiceWakeExpandedMode='kws';
        return ipcWithTimeout('cmd_voice_end_status',{},8000).catch(function(){return null;}).then(function(endRes){
          if(voiceModeSwitchPending) return;
          if(endRes){
            global.OneToneVoiceEnd.syncConfigFromStatus(endRes);
            const snap=hooks().voiceUiSnapshot;
            if(snap) snap.end=Object.assign({},snap.end||{},endRes);
          }
          hooks().syncHomeFromVoiceSettings(
            applied.voskRes||{enabled:false,state:'stopped'},
            applied.sapiRes||{enabled:false,state:'stopped'},
            endRes,
            syncOpts,
            kwsRes
          );
          modeToast();
          scheduleVoiceToggleRefresh();
        });
      }
      return ipcWithTimeout('cmd_voice_end_status',{},8000).catch(function(){return null;}).then(function(endRes){
        if(voiceModeSwitchPending) return;
        if(endRes){
          global.OneToneVoiceEnd.syncConfigFromStatus(endRes);
          const snap=hooks().voiceUiSnapshot;
          if(snap) snap.end=Object.assign({},snap.end||{},endRes);
        }
        hooks().syncHomeFromVoiceSettings(
          applied.voskRes||{enabled:false,state:'stopped'},
          {enabled:false,state:'stopped'},
          endRes,
          syncOpts,
          applied.kwsRes
        );
        modeToast();
        scheduleVoiceToggleRefresh();
      });
    }).catch(function(err){
      if(voiceModeSwitchPending) return;
      const msg=err&&err.message?String(err.message).trim():'';
      if(mode==='kws'){
        rollbackVoiceModeSwitch();
        hooks().toast(msg||t('voiceKwsFail'));
      }else if(mode==='sapi'){
        loadVoiceSapiStatus();
        hooks().toast(msg||t('voiceSapiFail'));
      }else{
        toastVoskMissingOrFail('enhanced',err);
      }
      console.error('voice_mode_'+mode,err);
    }).finally(finish);
  }

  function switchVoiceMode(mode, opts){
    opts=opts||{};
    if(voskOnlyUi()&&mode==='sapi') return;
    if(isOpenClickGuarded()&&opts.toastKind==='lite'){
      try{
        if(global.OneToneIpc&&global.OneToneIpc.invoke){
          global.OneToneIpc.invoke('cmd_app_log',{line:'fe switchVoiceMode ignored open-guard mode='+mode}).catch(function(){});
        }
      }catch(_){}
      return;
    }
    const toastKind=opts.toastKind||'default';
    const toastLite=toastKind==='lite';
    function modeToast(){
      if(toastLite) hooks().toast(mode==='sapi'?t('voiceNavToastLite'):t('voiceNavToastPro'),'lite');
      else hooks().toast(mode==='sapi'?t('voiceModeSwitchedLite'):t('voiceModeSwitchedPro'));
    }
    if(mode!=='sapi'&&mode!=='vosk'&&mode!=='kws') return;
    voiceModeSwitchSeq++;
    hooks().markVoiceEngineBootHandled();
    setVoiceWakeExpandedMode(mode);
    if(voiceBackendMatchesMode(mode)&&!voiceModeSwitchInFlight){
      applyHomeVoiceModeSwitchUi();
      if(mode==='kws') stopStaleVoskForKws();
      if(global.OneToneVoiceSchemeContext&&global.OneToneVoiceSchemeContext.mirrorGlobalToOverride){
        global.OneToneVoiceSchemeContext.mirrorGlobalToOverride();
      }
      return;
    }
    applyHomeVoiceModeSwitchUi();
    if(global.OneToneVoiceSchemeContext&&global.OneToneVoiceSchemeContext.mirrorGlobalToOverride){
      global.OneToneVoiceSchemeContext.mirrorGlobalToOverride();
    }
    pumpVoiceModeSwitch(opts);
  }

  function settingsPanelNeedsVoicePoll(){
    if(!ui().drawerOpen) return false;
    const p=ui().settingsPanel;
    return p==='voiceWake'||p==='debug';
  }

  function practicePhraseOpen(){
    try{
      return !!(global.OneTonePhrasePractice&&global.OneTonePhrasePractice.isOpen&&global.OneTonePhrasePractice.isOpen());
    }catch(_){
      return false;
    }
  }

  function voiceStatusPollNeeded(){
    if(hooks().welcomeOpen()) return false;
    const snap=hooks().voiceUiSnapshot.end||{};
    return voiceWakeEnabledInConfig()
      ||global.OneToneVoiceEnd.enabledInConfig()
      ||hooks().sessionActiveState(snap.state||'idle')
      ||settingsPanelNeedsVoicePoll()
      ||practicePhraseOpen();
  }

  function voicePollIntervalMs(){
    if(!voiceStatusPollNeeded()) return 2500;
    // QS / habit practice stage: keep ASR snapshot fresh for PhrasePractice preview + match.
    if(practicePhraseOpen()) return 500;
    const w=hooks().voiceUiSnapshot.wake||{};
    const voskState=(w.vosk&&w.vosk.state)||'';
    const sapiState=(w.sapi&&w.sapi.state)||'';
    const kwsState=(w.kws&&w.kws.state)||'';
    if(voskState==='starting'||sapiState==='starting'||kwsState==='starting') return 3000;
    if(document.hidden&&!ui().drawerOpen) return 2000;
    // voiceWake: never status-poll — even sticky dictating FE state used to re-arm 2s
    // polls after settings_park and UI_HB_STALL (~70s). Dictation resumes after drawer close.
    if(ui().drawerOpen&&ui().settingsPanel==='voiceWake'){
      return 0;
    }
    const endSnap=hooks().voiceUiSnapshot.end||{};
    if(hooks().sessionActiveState(endSnap.state||'idle')) return 500;
    if(!ui().drawerOpen) return 2000;
    if(ui().drawerOpen&&!settingsPanelNeedsVoicePoll()) return 2000;
    if(ui().drawerOpen&&(ui().settingsPanel==='debug')) return 1500;
    if(!ui().drawerOpen&&(voiceWakeEnabledInConfig()||global.OneToneVoiceEnd.enabledInConfig())) return 2000;
    if(runtime().paused) return 1500;
    return 1500;
  }

  function voiceEngineMismatch(wake){
    wake=wake||{};
    var sup=wake.supervisor||{};
    var vosk=wake.vosk||{};
    var desired=String(sup.desiredEngine||vosk.desiredEngine||'').trim().toLowerCase();
    var active=String(sup.activeEngine||vosk.activeEngine||'').trim().toLowerCase();
    if(!desired||desired==='none') return false;
    if(desired==='vosk'){
      if(voskListeningOk(vosk)) return false;
      return active!=='vosk'||String(vosk.state||'').trim()==='stopped'||String(vosk.state||'').trim()==='error';
    }
    if(desired==='kws'){
      var kws=wake.kws||{};
      if(isKwsNativeListening(kws,wake)) return false;
      return active!=='kws';
    }
    return desired!==active;
  }

  function settingsVoiceParked(){
    return !!(ui().drawerOpen&&ui().settingsPanel==='voiceWake');
  }

  function unparkHomeAsrQuiet(){
    if(settingsVoiceParked()||runtime().paused) return;
    if(!global.OneToneIpc||!global.OneToneIpc.invoke) return;
    global.OneToneIpc.invoke('cmd_set_settings_drawer_open',{
      open:false,parkVoice:false,park_voice:false
    }).catch(function(){});
  }

  function maybeNudgeVoskOnHome(voskRes){
    if(settingsVoiceParked()||runtime().paused) return;
    if(!voskRes||voskListeningOk(voskRes)) return;
    var sup=voskRes.supervisor||{};
    var desired=String(voskRes.desiredEngine||sup.desiredEngine||'').trim().toLowerCase();
    var active=String(voskRes.activeEngine||sup.activeEngine||'').trim().toLowerCase();
    if(desired!=='vosk'&&!voskRes.enabled) return;
    if(desired==='vosk'&&active==='vosk'&&voskListeningOk(voskRes)) return;
    var st=String(voskRes.state||'').trim();
    if(st==='starting'||st==='stopping') return;
    var issue=String(voskRes.resourceIssue||'').trim();
    if(issue==='model_missing'||issue==='dll_missing') return;
    var now=Date.now();
    if(now-voskHomeNudgeAt<12000) return;
    voskHomeNudgeAt=now;
    global.OneToneIpc.invoke('cmd_voice_vosk_retry_start',{}).catch(function(){});
  }

  function ensureHomeVoiceEngine(opts){
    opts=opts||{};
    if(settingsVoiceParked()||runtime().paused) return;
    var strategy=currentListeningStrategy();
    if(strategy==='off') return;
    var now=Date.now();
    if(!opts.force&&now-homeVoiceEnsureAt<8000) return;
    homeVoiceEnsureAt=now;
    voskHomeNudgeAt=0;
    if(!global.OneToneIpc||!global.OneToneIpc.invoke) return;
    if(opts.force) unparkHomeAsrQuiet();
    if(strategy==='enhanced'||strategy==='auto'||strategy==='resourceSaver'){
      global.OneToneIpc.invoke('cmd_voice_vosk_retry_start',{}).catch(function(){});
    }else{
      global.OneToneIpc.invoke('cmd_voice_set_listening_strategy',{strategy:strategy}).catch(function(){});
    }
    nudgeVoiceStatusPoll();
  }

  function ensureHomeVoiceEngineIfMismatch(opts){
    if(settingsVoiceParked()||runtime().paused) return;
    var wake=(hooks().voiceUiSnapshot&&hooks().voiceUiSnapshot.wake)||{};
    if(!voiceEngineMismatch(wake)) return;
    ensureHomeVoiceEngine(opts);
  }

  function ensureHomeVoiceListening(opts){
    opts=opts||{};
    if(settingsVoiceParked()||runtime().paused) return;
    if(currentListeningStrategy()==='off') return;
    if(opts.force){
      ensureHomeVoiceEngine(opts);
      return;
    }
    var wake=(hooks().voiceUiSnapshot&&hooks().voiceUiSnapshot.wake)||{};
    var voskRes=opts.voskRes!=null?opts.voskRes:wake.vosk;
    if(!voskRes||!voskListeningOk(voskRes)){
      ensureHomeVoiceEngine(opts);
      return;
    }
    ensureHomeVoiceEngineIfMismatch(opts);
  }

  function nudgeVoiceStatusPoll(){
    try{ voiceStatusPollTick(); }catch(_){}
    try{ scheduleNextVoicePoll(); }catch(_){}
  }

  function scheduleNextVoicePoll(){
    clearTimeout(voiceStatusPollTimer);
    var ms=voicePollIntervalMs();
    // Idle voiceWake returns 0 — re-arm later so dictation can pick up a cadence.
    if(!ms||ms<0) ms=5000;
    voiceStatusPollTimer=setTimeout(function(){
      if(voicePollIntervalMs()>0) voiceStatusPollTick();
      scheduleNextVoicePoll();
    },ms);
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
    if(global.OneToneAppSession&&global.OneToneAppSession.isBootSettling&&global.OneToneAppSession.isBootSettling()) return;
    // voiceWake: never status IPC — openDrawer +200ms used to stack vosk_status onto
    // settings_park stop and leave ipc held≈165s / UI_HB_STALL_5S.
    if(ui().drawerOpen&&ui().settingsPanel==='voiceWake') return;
    if(!voiceStatusPollNeeded()) return;
    if(voiceStatusPollInFlight) return;
    voiceStatusPollInFlight=true;
    try{
      if(global.OneToneUiHeartbeat&&global.OneToneUiHeartbeat.setTag){
        global.OneToneUiHeartbeat.setTag('voiceStatusPoll');
      }
    }catch(_){}
    const cfg=state().config||{};
    const sapiCfg=cfg.voiceSapi||cfg.voice_sapi;
    const voskCfg=cfg.voiceVosk||cfg.voice_vosk;
    const kwsCfg=cfg.voiceKws||cfg.voice_kws;
    const snap=hooks().voiceUiSnapshot.end||{};
    const wakeSnap=hooks().voiceUiSnapshot.wake||{};
    const panel=ui().settingsPanel;
    const drawerVoice=ui().drawerOpen&&settingsPanelNeedsVoicePoll();
    const endActive=hooks().sessionActiveState(snap.state||'idle');
    const wakePanel=drawerVoice&&(panel==='voiceWake'||panel==='debug');
    // voiceWake idle: skip end_status — was always-on with homeEnd=true and stacked IPC.
    // Even when voiceEnd.enabledInConfig, idle voiceWake only needs vosk (or kws) status.
    const needEnd=endActive
      ||(drawerVoice&&panel==='debug')
      ||!wakePanel;
    // Acoustic override may run Vosk while config still says SAPI enabled — always
    // poll every wake backend when any is on so the active card is not stuck on「已停止」.
    const anyWake=!!(sapiCfg&&sapiCfg.enabled)||!!(voskCfg&&voskCfg.enabled)||!!(kwsCfg&&kwsCfg.enabled);
    const practiceOpen=practicePhraseOpen();
    // voiceWake: skip idle backends. 4-way poll + wake 「开始输入」stacked into UI_HB_STALL_5s.
    const liveDesired=String(
      (wakeSnap.vosk&&wakeSnap.vosk.desiredEngine)||(wakeSnap.kws&&wakeSnap.kws.desiredEngine)||(wakeSnap.sapi&&wakeSnap.sapi.desiredEngine)||''
    ).trim().toLowerCase();
    const voskLiveDesired=liveDesired==='vosk'||(!liveDesired&&!!(voskCfg&&voskCfg.enabled));
    // Practice stage: always probe wake backends so PhrasePractice preview is not stuck on「正在听...」.
    const needSapi=!!(sapiCfg&&sapiCfg.enabled)||panel==='debug'||(anyWake&&!wakePanel)||practiceOpen;
    const needVosk=!!(voskCfg&&voskCfg.enabled)||panel==='debug'||wakePanel||(anyWake&&!wakePanel)||practiceOpen;
    // Skip KWS status while supervisor is on Vosk (auto/省电 fallback) — dead probe still cost IPC.
    const needKws=(!!(kwsCfg&&kwsCfg.enabled)||panel==='debug'||(anyWake&&!wakePanel)||practiceOpen)&&!(wakePanel&&voskLiveDesired);
    function __pollOne(need,cmd){
      if(!need) return Promise.resolve(null);
      return global.OneToneIpc.invoke(cmd,{}).catch(function(){return null;});
    }
    const pEnd=__pollOne(needEnd,'cmd_voice_end_status');
    const pSapi=__pollOne(needSapi,'cmd_voice_sapi_status');
    const pVosk=__pollOne(needVosk,'cmd_voice_vosk_status');
    const pKws=__pollOne(needKws,'cmd_voice_kws_status');
    Promise.all([pEnd,pSapi,pVosk,pKws]).then(function(arr){
      try{
        const endRes=arr[0],sapiRes=arr[1],letVoskRes=arr[2],kwsRes=arr[3];
        let voskRes=letVoskRes;
        const desired=String(
          (voskRes&&voskRes.desiredEngine)||(sapiRes&&sapiRes.desiredEngine)||(kwsRes&&kwsRes.desiredEngine)||''
        ).trim().toLowerCase();
        if(desired){
          // Do not rewrite enabled flags while acoustic calibration owns the mic —
          // that used to trigger config saves / fingerprint restarts mid-record.
          var acoustic=global.OneToneHabitScenarioVoiceCommand;
          var calibrating=acoustic&&acoustic.isCalibrating&&acoustic.isCalibrating();
          if(!calibrating) applySupervisorEngineToConfig(desired);
        }
        const kwsActive=desired==='kws'||(!!(kwsCfg&&kwsCfg.enabled)&&!(voskCfg&&voskCfg.enabled)&&desired!=='vosk'&&desired!=='sapi');
        if(kwsActive&&voskRes&&voskRes.enabled){
          // Desired=kws: supervisor owns exclusivity; only mirror UI state locally.
          voskRes=Object.assign({},voskRes,{enabled:false,state:'stopping'});
        }
        const snap=hooks().voiceUiSnapshot;
        if(!snap) return;
        const pollPayload={sapi:sapiRes,vosk:voskRes,kws:kwsRes,end:endRes};
        if(global.OneToneVoiceUiState&&global.OneToneVoiceUiState.applyStatusFromPoll){
          global.OneToneVoiceUiState.applyStatusFromPoll(voskRes,sapiRes,endRes,kwsRes);
        }else{
          if(endRes) snap.end=endRes;
          if(sapiRes||voskRes||kwsRes){
            snap.wake=mergeWakeSnapshot(sapiRes,voskRes,kwsRes);
          }
        }
        if(!settingsVoiceParked()&&voskRes) maybeNudgeVoskOnHome(voskRes);
        if(!settingsVoiceParked()){
          if(!ui().drawerOpen){
            ensureHomeVoiceListening({ force:false, voskRes:voskRes });
          }else{
            ensureHomeVoiceEngineIfMismatch();
          }
        }
        if(!ui().drawerOpen&&global.OneToneHomeV9&&global.OneToneHomeV9.paintHomeLiveTextImmediate){
          try{ global.OneToneHomeV9.paintHomeLiveTextImmediate(); }catch(_){}
        }
        if(!ui().drawerOpen&&global.OneToneHomeV9&&global.OneToneHomeV9.syncVoiceHeardSurfaces){
          try{ global.OneToneHomeV9.syncVoiceHeardSurfaces(); }catch(_){}
        }
        if(!ui().drawerOpen&&voskRes){
          renderVoiceVoskStatus(voskRes,{liveOnly:true});
        }
        const wakeFp=voiceWakeLiveFingerprint(sapiRes||{})+'|'+voiceWakeLiveFingerprint(voskRes||{})+'|'+(kwsRes&&[kwsRes.state,kwsRes.lastPartial,kwsRes.lastDetectedPhrase,kwsRes.lastDetectedKind,kwsRes.lastTrigger,kwsRes.lastSkip].join('|')||'')+'|'+(endRes&&endRes.state||'');
        // Same fp: skip even with drawer open — was re-painting voiceWake every 1.5s → 假死.
        if(wakeFp===lastVoicePollWakeFp) return;
        lastVoicePollWakeFp=wakeFp;
        hooks().scheduleVoiceUiRender(pollPayload);
      }catch(err){
        console.error('voiceStatusPollTick',err);
      }
    }).catch(function(err){
      console.error('voiceStatusPollTick ipc',err);
    }).finally(function(){
      voiceStatusPollInFlight=false;
      try{
        if(global.OneToneUiHeartbeat&&global.OneToneUiHeartbeat.clearTag){
          global.OneToneUiHeartbeat.clearTag('voiceStatusPoll');
        }
      }catch(_){}
    });
  }

  function startVoiceStatusPoll(){
    if(voiceStatusPollTimer||voiceStatusPollStarted) return;
    if(global.OneToneAppSession&&global.OneToneAppSession.isBootSettling&&global.OneToneAppSession.isBootSettling()){
      global.OneToneAppSession.whenBootSettled(startVoiceStatusPoll);
      return;
    }
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
    const engine=next?'sapi':'none';
    global.OneToneIpc.invoke('cmd_voice_set_desired_engine',{engine:engine}).then(function(bundle){
      if(!bundle||bundle.ok===false){
        throw new Error((bundle&&bundle.error)||t('voiceSapiFail'));
      }
      const applied=applyDesiredEngineResult(bundle,engine,{liveOnly:true},{lightOnly:true,homeOnly:!ui().drawerOpen});
      const sapiRes=applied.sapiRes||{enabled:false,state:'stopped'};
      if(!handleVoiceSapiEnableResult(sapiRes,next)) return;
      hooks().syncHomeFromVoiceSettings(
        {enabled:false,state:'stopped'},
        sapiRes,
        null,
        {lightOnly:true,homeOnly:!ui().drawerOpen},
        applied.kwsRes
      );
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

  function syncWakePresetHostVisibility(){
    if(global.OneToneVoiceStepWake&&global.OneToneVoiceStepWake.syncPresetPanels){
      var vm=global.OneToneVoiceSettingsViewModel&&global.OneToneVoiceSettingsViewModel.build
        ?global.OneToneVoiceSettingsViewModel.build(false)
        :{loading:false,mode:currentVoiceMode()||'vosk'};
      global.OneToneVoiceStepWake.syncPresetPanels(vm);
    }
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
    syncWakePresetHostVisibility();
  }

  function wakePresetPhraseSet(){
    if(global.OneToneVoiceWakePresets){
      return global.OneToneVoiceWakePresets.getSelectedPhrases();
    }
    const mode=voiceWakeExpandedMode||currentVoiceMode()||defaultUiVoiceMode();
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
    const mode=voiceWakeExpandedMode||currentVoiceMode()||defaultUiVoiceMode();
    const pending=pendingWakePhrases();
    if(pending&&pending.length) return pending;
    if(mode==='kws'){
      const kws=cfg.voiceKws||cfg.voice_kws||{};
      return normalizePhraseList(kws.phrases);
    }
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

  function filterWakePhrasesByLang(phrases,lang){
    return normalizePhraseList(phrases).filter(function(p){
      return (/[\u4e00-\u9fff]/.test(p)?'zh':'en')===lang;
    });
  }

  function wakeCatalogForLang(lang,mode){
    mode=mode||voiceWakeExpandedMode||currentVoiceMode()||defaultUiVoiceMode();
    var presets=global.OneToneVoiceWakePresets;
    if(presets&&presets.getPresetRoots){
      var roots=presets.getPresetRoots(mode,lang);
      var out=[];
      roots.forEach(function(sel){
        out=out.concat(presets.presetPhrasesIn(sel));
      });
      return out;
    }
    return wakePresetPhraseSet();
  }

  function activeAppScopeSummonPhrases(){
    var persist=global.OneToneVoiceSchemePersist;
    var m=persist&&persist.resolveVoiceScopeMapping?persist.resolveVoiceScopeMapping():null;
    if(!m) return [];
    var appId=String(m.appTargetId||'').trim();
    if(!appId) return [];
    var sc=global.OneToneSceneConfig;
    if(sc&&sc.appWakePhrasesForMapping) return sc.appWakePhrasesForMapping(m,{});
    var presets=global.OneToneAppVoicePresets;
    if(!presets||!presets.defaultAppWakePhrases) return [];
    var rule=null;
    var ab=global.OneToneAppBehaviorRules;
    if(ab&&ab.ruleForApp) rule=ab.ruleForApp(m,appId);
    return presets.defaultAppWakePhrases(appId,{rule:rule});
  }

  /** Shared: current-scope app summon phrases + binding meta (one source for UI). */
  function resolveActiveAppSummonInfo(mapping){
    var persist=global.OneToneVoiceSchemePersist;
    var m=mapping||(persist&&persist.resolveVoiceScopeMapping?persist.resolveVoiceScopeMapping():null)||null;
    var appId=m?String(m.appTargetId||'').trim():'';
    var phrases=[];
    if(m&&appId){
      phrases=normalizePhraseList(activeAppScopeSummonPhrases());
    }
    return {
      mapping:m,
      appBound:!!appId,
      phrases:phrases
    };
  }

  function primaryWakePhraseDisplay(){
    var V=global.OneToneVoiceSettingsViewModel;
    if(!V||!V.build||!V.resolveDisplayWakePhrase) return '';
    try{
      return V.resolveDisplayWakePhrase(V.build(false)).display||'';
    }catch(_e){
      return '';
    }
  }

  function renderWakePhraseTags(){
    var pc=global.OneToneVoicePhraseCustom;
    if(!pc||!pc.renderPhraseTags) return;
    var mode=voiceWakeExpandedMode||currentVoiceMode()||defaultUiVoiceMode();
    var lang=global.__vp_voice_wake_lang__||'zh';
    var active=currentWakePhraseList();
    if(mode==='vosk') active=filterWakePhrasesByLang(active,lang);
    var primary=primaryWakePhraseDisplay();
    var activeModel=active.map(function(p){ return {phrase:p,active:true}; })
      .filter(function(tag){
        return String(tag.phrase||'').trim()!==String(primary||'').trim();
      });
    pc.renderPhraseTags('voiceWakePhraseTags',activeModel);
    var collapse=$('voiceWakePresetCollapse');
    if(collapse){ collapse.hidden=true; collapse.setAttribute('aria-hidden','true'); }
    var legacy=$('voiceWakeCustomChips');
    if(legacy){ legacy.hidden=true; legacy.innerHTML=''; }
  }

  function applyWakePhrasesLocally(next){
    next=normalizePhraseList(next);
    if(!next.length) next=['开始输入'];
    const mode=voiceWakeExpandedMode||currentVoiceMode()||defaultUiVoiceMode();
    if(mode==='vosk'){
      if(state().config){
        const cfg=state().config.voiceVosk||state().config.voice_vosk||(state().config.voiceVosk={});
        state().config.voiceVosk=cfg;
        cfg.phrases=hooks().cloneStringList(next);
      }
      const snap=hooks().voiceUiSnapshot;
      if(snap&&snap.wake){
        const vosk=snap.wake.vosk||{};
        snap.wake.vosk=Object.assign({},vosk,{phrases:next.slice()});
      }
      syncVoiceVoskPresets(next);
      return;
    }
    if(mode==='kws'){
      if(state().config){
        const cfg=state().config.voiceKws||state().config.voice_kws||(state().config.voiceKws={});
        state().config.voiceKws=cfg;
        cfg.phrases=hooks().cloneStringList(next);
      }
      renderWakePhraseTags();
      return;
    }
    voiceSapiPresetPending=next.slice();
    if(state().config){
      const cfg=state().config.voiceSapi||state().config.voice_sapi||(state().config.voiceSapi={});
      state().config.voiceSapi=cfg;
      cfg.phrases=hooks().cloneStringList(next);
    }
    syncVoiceSapiPresets(next);
  }

  function flushWakePhraseSave(){
    const next=voiceWakePresetSavePending;
    if(!next) return Promise.resolve();
    const saveSeq=++voiceWakePresetSaveSeq;
    const mode=voiceWakeExpandedMode||currentVoiceMode()||defaultUiVoiceMode();
    let invoke;
    if(mode==='vosk'){
      invoke=global.OneToneIpc.invoke('cmd_voice_vosk_set_phrases',{phrases:next});
    }else if(mode==='kws'){
      invoke=global.OneToneIpc.invoke('cmd_voice_kws_set_phrases',{phrases:next});
    }else{
      invoke=global.OneToneIpc.invoke('cmd_voice_sapi_set_phrases',{phrases:next});
    }
    return invoke.then(function(res){
      if(saveSeq!==voiceWakePresetSaveSeq) return res;
      if(mode==='vosk'){
        renderVoiceVoskStatus(res);
        hooks().syncHomeFromVoiceSettings(res,null,null,{lightOnly:true});
      }else if(mode==='kws'){
        renderVoiceKwsStatus(res);
        renderWakePhraseTags();
        hooks().syncHomeFromVoiceSettings(null,null,null,{lightOnly:true},res);
      }else{
        if(res) renderVoiceSapiStatus(res);
        voiceSapiPresetPending=null;
        hooks().syncHomeFromVoiceSettings(null,res,null,{lightOnly:true});
      }
      voiceWakePresetSavePending=null;
      if(global.OneToneVoiceSettingsFlow&&global.OneToneVoiceSettingsFlow.scheduleVoiceSettingsRender){
        global.OneToneVoiceSettingsFlow.scheduleVoiceSettingsRender();
      }
      if(global.OneToneVoiceSchemeContext&&global.OneToneVoiceSchemeContext.mirrorGlobalToOverride){
        global.OneToneVoiceSchemeContext.mirrorGlobalToOverride();
      }
      if(global.OneToneConfigPersist&&global.OneToneConfigPersist.saveAsync){
        global.OneToneConfigPersist.saveAsync({source:'voice'});
      }else if(global.OneToneConfigPersist&&global.OneToneConfigPersist.save){
        global.OneToneConfigPersist.save();
      }
      return res;
    }).catch(function(err){
      if(saveSeq!==voiceWakePresetSaveSeq) return;
      console.error('voice_wake_phrase',err);
      voiceWakePresetSavePending=next.slice();
      applyWakePhrasesLocally(next);
      if(mode==='vosk') loadVoiceVoskStatus();
      else if(mode==='kws') loadVoiceKwsStatus();
      else loadVoiceSapiStatus();
      hooks().toast(t('voiceSapiFail'));
      throw err;
    });
  }

  function scheduleWakePhrasePersist(next,opts){
    opts=opts||{};
    next=normalizePhraseList(next);
    if(!next.length) next=['开始输入'];
    applyWakePhrasesLocally(next);
    voiceWakePresetSavePending=next.slice();
    clearTimeout(voiceWakePresetSaveTimer);
    if(opts.immediate){
      return flushWakePhraseSave();
    }
    return new Promise(function(resolve){
      voiceWakePresetSaveTimer=setTimeout(function(){
        flushWakePhraseSave().then(resolve,function(){ resolve(); });
      },280);
    });
  }

  function toggleWakePhrase(phrase,wasActive){
    phrase=String(phrase||'').trim();
    if(!phrase) return;
    var next=currentWakePhraseList().slice();
    var idx=next.indexOf(phrase);
    if(wasActive){
      if(idx<0) return;
      if(next.length<=1){
        hooks().toast(t('voicePhraseKeepOne'));
        return;
      }
      next.splice(idx,1);
    }else if(idx<0){
      next.push(phrase);
    }else{
      return;
    }
    scheduleWakePhrasePersist(next,wasActive?{immediate:true}:{});
  }

  function renderWakeCustomPhrases(){
    renderWakePhraseTags();
    const poolAdd=$('btnVoiceWakePoolAdd');
    const mode=voiceWakeExpandedMode||currentVoiceMode()||defaultUiVoiceMode();
    if(poolAdd) poolAdd.hidden=mode==='off';
  }

  function persistWakePhrases(next,opts){
    return scheduleWakePhrasePersist(next,Object.assign({immediate:true},opts||{}));
  }

  function phraseHasLatinLetters(phrase){
    return /[A-Za-z]/.test(String(phrase||''));
  }

  function addCustomWakePhrase(raw){
    const phrase=String(raw||'').trim();
    if(!phrase) return Promise.resolve();
    const next=currentWakePhraseList().slice();
    if(next.indexOf(phrase)>=0){
      if(hooks().toast) hooks().toast(t('voicePhraseAlreadyAdded'));
      return Promise.resolve();
    }
    const mode=voiceWakeExpandedMode||currentVoiceMode()||defaultUiVoiceMode();
    if(mode==='vosk'&&phraseHasLatinLetters(phrase)&&!isEnglishVoskPreset(backendVoiceVoskPreset())){
      if(hooks().toast) hooks().toast(t('voiceWakeMixedLangHint'));
    }
    next.push(phrase);
    return persistWakePhrases(next).then(function(){
      renderWakePhraseTags();
      if(hooks().toast) hooks().toast(t('voicePhraseAdded'));
    }).catch(function(err){
      console.error('voice_custom_wake',err);
      if(hooks().toast) hooks().toast(t('voiceSapiFail'));
    });
  }

  function removeCustomWakePhrase(phrase){
    phrase=String(phrase||'').trim();
    if(!phrase) return;
    const next=currentWakePhraseList().filter(function(p){ return p!==phrase; });
    if(!next.length){
      hooks().toast(t('voicePhraseKeepOne'));
      return;
    }
    scheduleWakePhrasePersist(next,{immediate:true});
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
    var resolved=resolvedVoskPreset(preset||'cn-light');
    if(global.__vp_voice_wake_lang_manual__) return;
    global.__vp_voice_wake_lang__=isEnglishVoskPreset(resolved)?'en':'zh';
  }

  function syncVoiceEndLangFromPreset(preset){
    var resolved=resolvedVoskPreset(preset||'cn-light');
    global.__vp_voice_end_lang__=isEnglishVoskPreset(resolved)?'en':'zh';
    var host=$('voiceEndLangToggle');
    if(host){
      host.querySelectorAll('.flow-lang-btn').forEach(function(b){
        b.classList.toggle('is-on',(b.getAttribute('data-lang')||'')===global.__vp_voice_end_lang__);
      });
    }
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
      if(global.OneToneVoiceModelLabels&&global.OneToneVoiceModelLabels.presetLabel){
        btn.textContent=global.OneToneVoiceModelLabels.presetLabel(btn.getAttribute('data-preset')||'');
      }
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
    if(global.OneToneVoiceStepWake&&global.OneToneVoiceStepWake.syncPresetLang){
      global.OneToneVoiceStepWake.syncPresetLang({
        lang:global.__vp_voice_wake_lang__
      });
      return;
    }
    const p=preset||currentVoiceVoskPreset();
    const cn=$('voiceVoskPresetsCn');
    const en=$('voiceVoskPresetsEn');
    const cnLabel=$('voiceVoskPresetsCnLabel');
    const enLabel=$('voiceVoskPresetsEnLabel');
    if(!cn||!en) return;
    const enOnly=isEnglishVoskPreset(p);
    const showEn=enOnly||(global.__vp_voice_wake_lang__||'zh')==='en';
    cn.hidden=showEn;
    en.hidden=!showEn;
    if(cnLabel) cnLabel.hidden=true;
    if(enLabel) enLabel.hidden=true;
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
      }
      const serverPhrases=normalizePhraseList(res.phrases);
      const pending=pendingWakePhrases();
      if(pending){
        if(serverPhrases.length&&phraseListsEqual(serverPhrases,pending)) voiceWakePresetSavePending=null;
        syncVoiceVoskPresets(pending);
      }else if(serverPhrases.length){
        syncVoiceVoskPresets(serverPhrases);
      }
    }
    const partial=res.lastPartial||'';
    const finalText=res.lastFinal||'';
    const skip=res.lastSkip||'';
    const hit=res.lastDetectedPhrase||'';
    const modelPath=res.resolvedModelPath||res.modelPath||'';
    const modelOk=res.modelExists?'OK':'缺失';
    renderVoskMissingPanel(res);
    // Auto-hide download overlay once resources are present or engine is listening.
    // Never re-open it from status polls when the model is already on disk.
    if(voskListeningOk(res)||voskModelPresent(res)){
      if(voiceSetupOverlayPinned) hideVoiceSetupOverlay();
    }else if(shouldShowVoskMissingPanel(res)){
      renderVoiceSetupBanner(res,{force:true});
    }
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
    if(!liveOnly||ui().settingsPanel==='debug'||!ui().drawerOpen){
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
        if(global.OneToneVoiceUiState&&global.OneToneVoiceUiState.applyStatusFromPoll){
          global.OneToneVoiceUiState.applyStatusFromPoll(res,snap.wake&&snap.wake.sapi,null,snap.wake&&snap.wake.kws);
        }else{
          const wake=snap.wake||{};
          snap.wake=mergeWakeSnapshot(wake.sapi,res,wake.kws);
        }
      }
      renderVoiceVoskStatus(res);
      hooks().syncHomeFromVoiceSettings&&hooks().syncHomeFromVoiceSettings(res,null,null,{lightOnly:true});
      hooks().scheduleVoiceUiRender&&hooks().scheduleVoiceUiRender({vosk:res});
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
    const enableStrategy=currentListeningStrategy()==='auto'?'auto':'enhanced';
    const req=next
      ?setListeningStrategyRemote(enableStrategy)
      :setListeningStrategyRemote('off');
    req.then(function(bundle){
      const appliedOk=!(!bundle||bundle.ok===false);
      const hasStatus=!!(bundle&&(bundle.voiceVosk||bundle.supervisor||bundle.strategy));
      if(!appliedOk&&!hasStatus){
        throw new Error((bundle&&bundle.error)||t('voiceListeningStrategySwitchSoftFail'));
      }
      const forced=Object.assign({},bundle||{},{strategy:next?enableStrategy:'off'});
      const applied=applyDesiredEngineResult(forced,'vosk',{liveOnly:true},{lightOnly:true,homeOnly:!ui().drawerOpen});
      const voskRes=applied.voskRes||{enabled:false,state:'stopped'};
      hooks().syncHomeFromVoiceSettings(
        voskRes,
        {enabled:false,state:'stopped'},
        null,
        {lightOnly:true,homeOnly:!ui().drawerOpen},
        applied.kwsRes
      );
      hooks().stopMicMonitor();
      scheduleVoiceToggleRefresh();
      if(next){
        if(voskRes) handleVoskMissingAfterStrategySwitch(enableStrategy,voskRes);
        pollVoskAfterStrategySwitch(enableStrategy,voiceModeSwitchSeq);
      }
      if(!next) hooks().syncHomeMicMonitor().catch(function(){});
    }).catch(function(err){
      toastVoskMissingOrFail(next?enableStrategy:'off',err);
      console.error('voice_vosk',err);
    }).finally(function(){
      voiceVoskTogglePending=false;
      if(btn) btn.disabled=false;
      if(homeBtn) homeBtn.disabled=false;
      hooks().renderHomeLiveZone();
    });
  }

  function toastVoskMissingOrFail(strategy,err){
    const strat=strategy||currentListeningStrategy()||'auto';
    return loadVoiceVoskStatus().then(function(res){
      strategySwitchFailToast(strat,err,res||{});
      return true;
    }).catch(function(){
      strategySwitchFailToast(strat,err,null);
      return false;
    });
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
    const setupDl=$('btnVoiceSetupDownload');
    const setupRetry=$('btnVoiceSetupRetry');
    const setupOpen=$('btnVoiceSetupOpenDir');
    if(openBtn) openBtn.textContent=t('voiceVoskOpenResources');
    if(dlBtn) dlBtn.textContent=t('voiceVoskDownloadGuide');
    if(retryBtn) retryBtn.textContent=t('voiceVoskRetry');
    if(setupDl) setupDl.textContent=t('voiceVoskDownloadGuide');
    if(setupRetry) setupRetry.textContent=t('voiceVoskRetry');
    if(setupOpen) setupOpen.textContent=t('voiceVoskOpenResources');
    const snap=hooks().voiceUiSnapshot&&hooks().voiceUiSnapshot.wake;
    const vosk=snap&&snap.vosk;
    if(vosk){
      renderVoskMissingPanel(vosk);
      renderVoiceSetupBanner(vosk);
    }
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
    const bannerWrap=$('voiceSetupBannerProgress');
    const bannerFill=$('voiceSetupBannerProgressFill');
    const bannerStatus=$('voiceSetupBannerStatus');
    const overlayWrap=$('voiceSetupOverlayProgress');
    const overlayFill=$('voiceSetupOverlayProgressFill');
    const overlayStatus=$('voiceSetupOverlayStatus');
    const setupDl=$('btnVoiceSetupDownload');
    const overlayDl=$('btnVoiceSetupOverlayDownload');
    const active=!!phase&&phase!=='done'&&phase!=='error';
    const pct=String(Math.max(0,Math.min(100,percent||0)))+'%';
    const statusText=phase==='extracting'
      ?t('voiceVoskExtracting')
      :(phase==='downloading'?t('voiceVoskDownloading').replace('{n}',String(percent||0)):'');
    function syncBar(bar,barFill,barStatus){
      if(!bar) return;
      bar.hidden=!active&&!voskDownloadInFlight;
      if(barFill) barFill.style.width=pct;
      if(barStatus){
        barStatus.hidden=!active&&!voskDownloadInFlight;
        barStatus.textContent=statusText;
      }
    }
    if(wrap){
      wrap.hidden=!active&&!voskDownloadInFlight;
      if(fill) fill.style.width=pct;
      if(status) status.textContent=statusText;
    }
    syncBar(bannerWrap,bannerFill,bannerStatus);
    syncBar(overlayWrap,overlayFill,overlayStatus);
    if(dlBtn) dlBtn.disabled=!!voskDownloadInFlight;
    if(setupDl) setupDl.disabled=!!voskDownloadInFlight;
    if(overlayDl) overlayDl.disabled=!!voskDownloadInFlight;
  }

  function setVoiceSetupOverlayStatus(text,showProgress,percent){
    const overlay=ensureVoiceSetupOverlay();
    assertVoiceSetupVisible();
    const msgEl=document.getElementById('voiceSetupOverlayMsg');
    const statusEl=document.getElementById('voiceSetupOverlayStatus');
    const progress=document.getElementById('voiceSetupOverlayProgress');
    const fill=document.getElementById('voiceSetupOverlayProgressFill');
    if(msgEl&&text) msgEl.textContent=text;
    if(statusEl){
      statusEl.hidden=!text;
      statusEl.textContent=text||'';
    }
    if(progress){
      progress.hidden=!showProgress;
      if(fill) fill.style.width=String(Math.max(0,Math.min(100,percent||0)))+'%';
    }
    // Never lock「一键下载」on start progress — only real downloads disable it.
    setVoiceSetupDownloadEnabled(true);
  }

  function finishAfterVoskModelReady(){
    if(voskStartInFlight) return Promise.resolve(null);
    voiceSetupActivating=true;
    voskStartInFlight=true;
    voskDownloadInFlight=false;
    setVoiceSetupOverlayStatus(t('voiceVoskStartingAfterDownload'),true,100);
    setVoiceSetupDownloadEnabled(true);
    const strategy=currentListeningStrategy()||'auto';
    // If engine is already listening, do not force-restart (that caused the download loop).
    return loadVoiceVoskStatus().then(function(res){
      if(voskListeningOk(res)) return {ok:true,res:res};
      setVoiceSetupOverlayStatus(t('voiceVoskStartingAfterDownload'),true,100);
      return global.OneToneIpc.invoke('cmd_voice_vosk_retry_start',{})
        .catch(function(){
          return strategyNeedsVoskFallback(strategy)
            ?setListeningStrategyRemote(strategy)
            :null;
        })
        .then(function(){ return waitForVoskReady(15000); });
    }).then(function(result){
      voiceSetupActivating=false;
      voskStartInFlight=false;
      voskDownloadInFlight=false;
      const res=(result&&result.res)||{};
      if(result&&result.ok&&voskListeningOk(res)){
        return markVoskReady(res);
      }
      // Model on disk + still starting: keep waiting UI, do not push download again.
      if(voskModelPresent(res)&&String(res.state||'')==='starting'){
        setVoiceSetupOverlayStatus(t('voiceVoskStartingAfterDownload'),true,80);
        setVoiceSetupDownloadEnabled(true);
        return waitForVoskReady(20000).then(function(result2){
          const res2=(result2&&result2.res)||res;
          if(result2&&result2.ok&&voskListeningOk(res2)) return markVoskReady(res2);
          const err=formatVoskStartFailDetail(res2);
          setVoiceSetupOverlayStatus(t('voiceVoskStartAfterDownloadFail').replace('{error}',err),false,0);
          hooks().toast(t('voiceVoskStartAfterDownloadFail').replace('{error}',err),'warn');
          renderVoiceSetupBanner(res2,{strategy:strategy,force:true});
          return res2;
        });
      }
      const err=formatVoskStartFailDetail(res);
      setVoiceSetupOverlayStatus(t('voiceVoskStartAfterDownloadFail').replace('{error}',err),false,0);
      setVoiceSetupDownloadEnabled(true);
      hooks().toast(t('voiceVoskStartAfterDownloadFail').replace('{error}',err),'warn');
      renderVoiceSetupBanner(res,{strategy:strategy,force:true});
      return res;
    }).catch(function(err){
      voiceSetupActivating=false;
      voskStartInFlight=false;
      voskDownloadInFlight=false;
      const msg=err&&err.message?String(err.message):t('voiceVoskFail');
      setVoiceSetupOverlayStatus(t('voiceVoskStartAfterDownloadFail').replace('{error}',msg),false,0);
      setVoiceSetupDownloadEnabled(true);
      hooks().toast(t('voiceVoskStartAfterDownloadFail').replace('{error}',msg),'warn');
    });
  }

  function handleVoskDownloadMessage(msg){
    if(!msg||msg.type!=='mvp_vosk_download') return;
    const phase=String(msg.phase||'');
    if(phase==='downloading'||phase==='extracting'){
      voskDownloadInFlight=true;
      voskDownloadPercent=Number(msg.percent)||0;
      renderVoskDownloadProgress(phase,voskDownloadPercent);
      setVoiceSetupOverlayStatus(
        phase==='extracting'?t('voiceVoskExtracting'):t('voiceVoskDownloading').replace('{n}',String(voskDownloadPercent||0)),
        true,
        voskDownloadPercent
      );
      return;
    }
    voskDownloadInFlight=false;
    if(phase==='done'&&msg.ok){
      renderVoskDownloadProgress('',100);
      finishAfterVoskModelReady();
      return;
    }
    if(phase==='error'){
      renderVoskDownloadProgress('error',0);
      const err=String(msg.error||t('voiceVoskFail'));
      setVoiceSetupOverlayStatus(t('voiceVoskDownloadFail').replace('{error}',err),false,0);
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
    if(voskDownloadInFlight||voskStartInFlight) return;
    preset=preset||currentVoskPreset();
    // If status already says model is present, skip download IPC — just ensure engine start.
    const snap=hooks().voiceUiSnapshot&&hooks().voiceUiSnapshot.wake;
    const voskSnap=snap&&snap.vosk;
    if(voskListeningOk(voskSnap)){
      markVoskReady(voskSnap);
      return;
    }
    if(voskModelPresent(voskSnap)){
      return finishAfterVoskModelReady();
    }
    voskDownloadInFlight=true;
    voskDownloadPercent=0;
    renderVoskDownloadProgress('downloading',0);
    setVoiceSetupOverlayStatus(t('voiceVoskDownloading').replace('{n}','0'),true,0);
    global.OneToneIpc.invoke('cmd_vosk_download_model',{preset:preset}).then(function(res){
      if(res&&res.reason==='already_running'){
        voskDownloadInFlight=false;
        renderVoskDownloadProgress('',0);
        setVoiceSetupOverlayStatus(t('voiceVoskDownloadBusy'),false,0);
        hooks().toast(t('voiceVoskDownloadBusy'));
        return;
      }
      if(res&&res.alreadyPresent){
        voskDownloadInFlight=false;
        renderVoskDownloadProgress('',100);
        return finishAfterVoskModelReady();
      }
      if(!res||!res.ok){
        voskDownloadInFlight=false;
        renderVoskDownloadProgress('error',0);
        var errMsg=(res&&res.error)||(res&&res.reason)||t('voiceVoskFail');
        setVoiceSetupOverlayStatus(t('voiceVoskDownloadFail').replace('{error}',errMsg),false,0);
        hooks().toast(t('voiceVoskDownloadFail').replace('{error}',errMsg),'warn');
        return;
      }
      setVoiceSetupOverlayStatus(t('voiceVoskDownloading').replace('{n}','1'),true,1);
      // async download started — completion via mvp_vosk_download
    }).catch(function(err){
      voskDownloadInFlight=false;
      renderVoskDownloadProgress('error',0);
      var msg=err&&err.message?String(err.message):t('voiceVoskFail');
      setVoiceSetupOverlayStatus(t('voiceVoskDownloadFail').replace('{error}',msg),false,0);
      hooks().toast(t('voiceVoskDownloadFail').replace('{error}',msg),'warn');
    });
  }

  function downloadVoskModelGuide(){
    downloadVoskModel();
  }

  function retryVoskStart(){
    if(voskStartInFlight||voskDownloadInFlight) return;
    voiceSetupActivating=true;
    voskStartInFlight=true;
    voskDownloadInFlight=false;
    setVoiceSetupOverlayStatus(t('voiceVoskStartingAfterDownload'),true,50);
    setVoiceSetupDownloadEnabled(true);
    const strategy=currentListeningStrategy()||'auto';
    loadVoiceVoskStatus().then(function(res){
      if(voskListeningOk(res)) return {ok:true,res:res};
      return global.OneToneIpc.invoke('cmd_voice_vosk_retry_start',{}).then(function(bundle){
        const status=(bundle&&bundle.voiceVosk)||bundle;
        if(status&&typeof status==='object'){
          renderVoiceVoskStatus(status);
          hooks().syncHomeFromVoiceSettings(status,null,null,{lightOnly:true});
        }
        return waitForVoskReady(15000);
      });
    }).then(function(result){
      voiceSetupActivating=false;
      voskStartInFlight=false;
      voskDownloadInFlight=false;
      const res=(result&&result.res)||{};
      if(result&&result.ok&&voskListeningOk(res)){
        markVoskReady(res);
        return;
      }
      const err=formatVoskStartFailDetail(res);
      setVoiceSetupOverlayStatus(t('voiceVoskStartAfterDownloadFail').replace('{error}',err),false,0);
      setVoiceSetupDownloadEnabled(true);
      hooks().toast(t('voiceVoskRetry')+(err?('：'+err):''),'warn');
      renderVoiceSetupBanner(res,{strategy:strategy,force:true});
    }).catch(function(err){
      voiceSetupActivating=false;
      voskStartInFlight=false;
      voskDownloadInFlight=false;
      setVoiceSetupDownloadEnabled(true);
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
    syncWakePresetHostVisibility();
  }

  function changeVoiceVoskModelPreset(requestedPreset){
    if(voiceVoskTogglePending) return;
    const preset=resolvedVoskPreset(requestedPreset||currentVoiceVoskPreset());
    const currentBackend=backendVoiceVoskPreset();
    syncVoiceVoskPresetButtons(preset,false);
    updateVoiceVoskPresetPanel(preset);
    if(preset===currentBackend){
      if(!global.__vp_voice_wake_lang_manual__){
        syncVoiceWakeLangFromPreset(preset);
      }
      syncVoiceEndLangFromPreset(preset);
      global.__vp_voice_wake_lang_manual__=false;
      if(global.OneToneVoiceStepWake&&global.OneToneVoiceStepWake.syncPresetLang){
        global.OneToneVoiceStepWake.syncPresetLang({lang:global.__vp_voice_wake_lang__});
      }
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
      global.__vp_voice_wake_lang_manual__=false;
      syncVoiceWakeLangFromPreset(preset);
      syncVoiceEndLangFromPreset(preset);
      if(global.OneToneVoiceStepWake&&global.OneToneVoiceStepWake.syncPresetLang){
        global.OneToneVoiceStepWake.syncPresetLang({lang:global.__vp_voice_wake_lang__});
      }
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
      global.__vp_voice_wake_lang_manual__=false;
      syncVoiceVoskPresetButtons(backendVoiceVoskPreset(),false);
    });
  }

  function renderVoiceKwsSettingsBadge(res){
    const stubNotice=$('voiceKwsStubNotice');
    const kwsStatusPill=$('modelsKwsStatus');
    const isStub=!!(res&&(res.stubMode||res.resourceIssue));
    if(stubNotice){
      stubNotice.hidden=!isStub;
      stubNotice.textContent=isStub?t('voiceKwsStubNativeMissing'):'';
    }
    if(!kwsStatusPill||!res) return;
    if(isStub){
      kwsStatusPill.textContent=t('voiceKwsStatusStubOnly');
      kwsStatusPill.classList.remove('is-on');
      return;
    }
    const wake=(hooks().voiceUiSnapshot&&hooks().voiceUiSnapshot.wake)||{};
    const listening=isKwsNativeListening(res,wake);
    kwsStatusPill.textContent=voiceWakeStateLabel(res.state||'stopped');
    kwsStatusPill.classList.toggle('is-on',listening);
  }

  function renderVoiceKwsStatus(res,opts){
    opts=opts||{};
    if(!res) return;
    const descEl=$('voiceKwsDiagDesc');
    const dlBtn=$('btnVoiceKwsDownload');
    const retryBtn=$('btnVoiceKwsRetry');
    if(descEl) descEl.textContent=t('voiceKwsDiagDesc');
    if(dlBtn) dlBtn.textContent=t('voiceKwsDownloadGuide');
    if(retryBtn) retryBtn.textContent=t('voiceVoskRetry');
    const kwsName=$('modelsKwsName');
    if(kwsName) kwsName.textContent=t('modelsKwsName');
    const kwsDesc=$('modelsKwsDesc');
    if(kwsDesc) kwsDesc.textContent=t('modelsKwsDesc');
    const kwsDl=$('btnModelsKwsDownload');
    if(kwsDl) kwsDl.textContent=t('voiceKwsDownloadGuide');
    const kwsRetry=$('btnModelsKwsRetry');
    if(kwsRetry) kwsRetry.textContent=t('voiceVoskRetry');
    syncVoiceKwsConfigFromStatus(res);
    const snap=hooks().voiceUiSnapshot;
    if(snap){
      const wake=snap.wake||{};
      snap.wake=mergeWakeSnapshot(wake.sapi,wake.vosk,res);
    }
    if(global.OneToneVoiceDiag){
      global.OneToneVoiceDiag.updateMetric('kws','state',voiceWakeStateLabel(res.state||'stopped'),t('voiceDiagLogState'));
      global.OneToneVoiceDiag.updateMetric('kws','phrases',kwsPhraseListText(res.phrases),t('voiceKwsPhrasesEffective'));
      global.OneToneVoiceDiag.updateMetric('kws','active',kwsPhraseListText(res.phrasesActive),t('voiceKwsPhrasesActive'));
      global.OneToneVoiceDiag.updateMetric('kws','skippedPhrases',kwsPhraseListText(res.phrasesSkipped),t('voiceKwsPhrasesSkipped'));
      global.OneToneVoiceDiag.updateMetric('kws','truncatedPhrases',kwsPhraseListText(res.phrasesTruncated),t('voiceKwsPhrasesTruncated'));
      global.OneToneVoiceDiag.updateMetric('kws','buildIssue',res.keywordBuildIssue||'',t('voiceKwsKeywordBuildIssue'));
      global.OneToneVoiceDiag.updateMetric('kws','kind',res.lastDetectedKind||'',t('voiceKwsLastKind'));
      global.OneToneVoiceDiag.updateMetric('kws','hit',res.lastDetectedPhrase||'',t('voiceDiagLogHit'));
      global.OneToneVoiceDiag.updateMetric('kws','trigger',res.lastTrigger||'',t('voiceKwsLastTrigger'));
      global.OneToneVoiceDiag.updateMetric('kws','skip',res.lastSkip||'',t('voiceDiagLogSkip'));
      global.OneToneVoiceDiag.updateMetric('kws','error',res.lastError||'',t('voiceDiagLogError'));
      if(res.resourceIssue) global.OneToneVoiceDiag.updateMetric('kws','stub',res.resourceIssue,t('voiceKwsStubNote'));
      global.OneToneVoiceDiag.updateMetric('kws','model',res.modelExists?t('voiceKwsModelReady'):t('voiceKwsModelMissing'),t('voiceKwsModelStatus'));
      global.OneToneVoiceDiag.updateMetric('kws','partial',kwsHeardDisplayText(res),t('voiceDiagLogHeard'));
    }
    if(!opts.lightOnly) hooks().renderVoiceModeUsage();
    if(global.OneToneVoiceModelsPanel) global.OneToneVoiceModelsPanel.render();
    renderVoiceKwsSettingsBadge(res);
  }

  function loadVoiceKwsStatus(){
    return global.OneToneIpc.invoke('cmd_voice_kws_status',{}).then(function(res){
      renderVoiceKwsStatus(res);
      return res;
    });
  }

  function setVoiceKwsEnabled(enabled){
    const req=enabled
      ?setListeningStrategyRemote('resourceSaver')
      :setListeningStrategyRemote('off');
    return req.then(function(bundle){
      if(!bundle||bundle.ok===false){
        throw new Error((bundle&&bundle.error)||t('voiceKwsFail'));
      }
      const applied=applyDesiredEngineResult(bundle,'kws',{liveOnly:true},{lightOnly:true,homeOnly:!ui().drawerOpen});
      hooks().syncHomeFromVoiceSettings(null,null,null,{lightOnly:true},applied.kwsRes);
      hooks().toast(enabled?t('voiceKwsEnabled'):t('voiceKwsDisabled'));
      return applied.kwsRes;
    }).catch(function(err){
      hooks().toast(t('voiceKwsFail'));
      console.error('voice_kws_set_enabled',err);
      return loadVoiceKwsStatus();
    });
  }

  function testVoiceKwsSend(){
    global.OneToneIpc.invoke('cmd_voice_kws_test_send',{}).then(function(res){
      let msg=t('testFailed');
      if(res&&res.ok) msg=t('testSent');
      hooks().toast(msg);
      global.OneToneVoiceDiag.forceLog('kws',t('voiceDiagLogTest'),msg);
    }).catch(function(){
      hooks().toast(t('testFailed'));
      global.OneToneVoiceDiag.forceLog('kws',t('voiceDiagLogTest'),t('testFailed'));
    });
  }

  function testVoiceKwsDetect(phrase){
    const p=String(phrase||'').trim();
    if(!p) return Promise.resolve(null);
    return global.OneToneIpc.invoke('cmd_voice_kws_test_detect',{phrase:p}).then(function(res){
      renderVoiceKwsStatus(res);
      const label=(res&&res.lastTrigger)||(res&&res.lastSkip)||(res&&res.lastDetectedKind)||p;
      global.OneToneVoiceDiag.forceLog('kws',t('voiceKwsTestDetect'),label);
      hooks().scheduleVoiceUiRender({kws:res,end:hooks().voiceUiSnapshot.end});
      return res;
    }).catch(function(err){
      hooks().toast(err&&err.message?String(err.message):t('voiceKwsFail'));
      console.error('voice_kws_test_detect',err);
      return null;
    });
  }

  function renderKwsDownloadProgress(phase,percent){
    const active=!!phase&&phase!=='done'&&phase!=='error';
    const pct=String(Math.max(0,Math.min(100,percent||0)))+'%';
    let statusText='';
    if(phase==='extracting') statusText=t('voiceKwsExtracting');
    else if(phase==='downloading') statusText=t('voiceKwsDownloading').replace('{n}',String(percent||0));
    else if(phase==='error') statusText=t('voiceKwsDownloadFail').replace('{error}','');
    [
      {wrap:'voiceKwsDownloadProgress',fill:'voiceKwsDownloadFill',status:'voiceKwsDownloadStatus',dlBtn:'btnVoiceKwsDownload'},
      {wrap:'voiceKwsSettingsDownloadProgress',fill:'voiceKwsSettingsDownloadFill',status:'voiceKwsSettingsDownloadStatus',dlBtn:'btnModelsKwsDownload'}
    ].forEach(function(tgt){
      const wrap=$(tgt.wrap);
      if(!wrap) return;
      wrap.hidden=!active&&!kwsDownloadInFlight;
      const fill=$(tgt.fill);
      if(fill) fill.style.width=pct;
      const status=$(tgt.status);
      if(status) status.textContent=statusText;
      const dlBtn=$(tgt.dlBtn);
      if(dlBtn) dlBtn.disabled=!!kwsDownloadInFlight;
    });
  }

  function handleKwsDownloadMessage(msg){
    if(!msg||msg.type!=='mvp_kws_download') return;
    const phase=msg.phase||'';
    const percent=typeof msg.percent==='number'?msg.percent:kwsDownloadPercent;
    if(phase==='downloading') kwsDownloadPercent=percent;
    if(phase==='downloading'||phase==='extracting'){
      kwsDownloadInFlight=true;
      renderKwsDownloadProgress(phase,percent);
      return;
    }
    kwsDownloadInFlight=false;
    if(phase==='done'&&msg.ok){
      renderKwsDownloadProgress('',100);
      hooks().toast(t('voiceKwsDownloadDone'));
      loadVoiceKwsStatus();
      hooks().renderHomeLiveZone&&hooks().renderHomeLiveZone();
      return;
    }
    if(phase==='error'||!msg.ok){
      renderKwsDownloadProgress('error',0);
      const err=msg.error||t('voiceKwsFail');
      hooks().toast(t('voiceKwsDownloadFail').replace('{error}',err),'warn');
    }
  }

  function downloadKwsModel(preset){
    if(kwsDownloadInFlight) return;
    const cfg=state().config||{};
    const kws=cfg.voiceKws||cfg.voice_kws||{};
    preset=preset||String(kws.modelPreset||'cn-light').trim()||'cn-light';
    kwsDownloadInFlight=true;
    kwsDownloadPercent=0;
    renderKwsDownloadProgress('downloading',0);
    global.OneToneIpc.invoke('cmd_kws_download_model',{preset:preset}).then(function(res){
      if(res&&res.reason==='already_running'){
        kwsDownloadInFlight=false;
        renderKwsDownloadProgress('',0);
        hooks().toast(t('voiceKwsDownloadBusy'));
        return;
      }
      if(res&&res.alreadyPresent){
        kwsDownloadInFlight=false;
        renderKwsDownloadProgress('',100);
        hooks().toast(t('voiceKwsDownloadDone'));
        loadVoiceKwsStatus();
        return;
      }
      if(!res||!res.ok){
        kwsDownloadInFlight=false;
        renderKwsDownloadProgress('error',0);
        const errMsg=(res&&res.error)||(res&&res.reason)||t('voiceKwsFail');
        hooks().toast(t('voiceKwsDownloadFail').replace('{error}',errMsg),'warn');
      }
    }).catch(function(err){
      kwsDownloadInFlight=false;
      renderKwsDownloadProgress('error',0);
      hooks().toast(t('voiceKwsDownloadFail').replace('{error}',err&&err.message?String(err.message):t('voiceKwsFail')),'warn');
    });
  }

  function retryKwsStart(){
    global.OneToneIpc.invoke('cmd_voice_kws_retry_start',{}).then(function(res){
      renderVoiceKwsStatus(res);
      hooks().syncHomeFromVoiceSettings(null,null,null,{lightOnly:true});
    }).catch(function(err){
      hooks().toast(err&&err.message?String(err.message):t('voiceKwsFail'));
    });
  }

  function voiceKwsEnabledNow(){
    const cfg=state().config||{};
    const kws=cfg.voiceKws||cfg.voice_kws;
    return !!(kws&&kws.enabled);
  }

  function voiceWakeEnabledInConfig(){
    const strategy=currentListeningStrategy();
    if(strategy==='off') return false;
    const cfg=state().config||{};
    const vosk=cfg.voiceVosk||cfg.voice_vosk;
    const sapi=cfg.voiceSapi||cfg.voice_sapi;
    const kws=cfg.voiceKws||cfg.voice_kws;
    return !!(vosk&&vosk.enabled)||!!(sapi&&sapi.enabled)||!!(kws&&kws.enabled);
  }

  global.OneToneVoiceWake={
    stateLabel:voiceWakeStateLabel,
    noticeIsTriggered:voiceWakeNoticeIsTriggered,
    noticeLabel:voiceWakeNoticeLabel,
    navStatusLine:voiceNavStatusLine,
    renderMicLive:renderVoiceMicLive,
    renderSubnav:renderSettingsVoiceSubnav,
    renderEngineTabs:renderVoiceEngineTabs,
    buildVoiceEngineTabsModel:buildVoiceEngineTabsModel,
    mergeWakeSnapshot:mergeWakeSnapshot,
    resolveRuntimeEngine:resolveRuntimeEngine,
    isKwsNativeListening:isKwsNativeListening,
    kwsHeardDisplayText:kwsHeardDisplayText,
    resolveActiveTabMode:resolveActiveTabMode,
    syncSapiConfigFromStatus:syncVoiceSapiConfigFromStatus,
    syncVoskConfigFromStatus:syncVoiceVoskConfigFromStatus,
    syncKwsConfigFromStatus:syncVoiceKwsConfigFromStatus,
    syncDesiredEngineConfig:syncDesiredEngineConfig,
    currentMode:currentVoiceMode,
    currentListeningStrategy:currentListeningStrategy,
    syncExpandedUi:syncVoiceWakeExpandedUi,
    setExpandedMode:setVoiceWakeExpandedMode,
    getExpandedMode:function(){ return voiceWakeExpandedMode; },
    armOpenClickGuard:armOpenClickGuard,
    isOpenClickGuarded:isOpenClickGuarded,
    isOpenFlowSettling:isOpenFlowSettling,
    switchInFlight:function(){ return !!voiceModeSwitchInFlight; },
    statusPollInFlight:function(){ return !!voiceStatusPollInFlight; },
    bumpOpenGen:bumpOpenGen,
    getOpenGen:getOpenGen,
    isOpenGenCurrent:isOpenGenCurrent,
    renderModeSwitch:renderVoiceModeSwitch,
    switchMode:switchVoiceMode,
    switchListeningStrategy:switchListeningStrategy,
    getStrategyHold:getStrategyHold,
    setStrategyHold:setStrategyHold,
    hideSetupOverlay:hideVoiceSetupOverlay,
    syncEngineTabButtons:syncVoiceEngineTabButtons,
    syncStrategyTabButtons:syncVoiceStrategyTabButtons,
    enabledInConfig:voiceWakeEnabledInConfig,
    pollNeeded:voiceStatusPollNeeded,
    pollTick:voiceStatusPollTick,
    nudgePoll:nudgeVoiceStatusPoll,
    ensureHomeVoiceEngine:ensureHomeVoiceEngine,
    ensureHomeVoiceEngineIfMismatch:ensureHomeVoiceEngineIfMismatch,
    ensureHomeVoiceListening:ensureHomeVoiceListening,
    unparkHomeAsrQuiet:unparkHomeAsrQuiet,
    startPoll:startVoiceStatusPoll,
    liveFingerprint:voiceWakeLiveFingerprint,
    refreshDrawerMic:refreshDrawerMicAfterVoiceToggle,
    syncSapiToggle:syncVoiceSapiToggle,
    renderSapiStatus:renderVoiceSapiStatus,
    loadSapiStatus:loadVoiceSapiStatus,
    sapiEnabledNow:voiceSapiEnabledNow,
    voskEnabledNow:voiceVoskEnabledNow,
    kwsEnabledNow:voiceKwsEnabledNow,
    openSapiSetup:openVoiceSapiSetup,
    toggleSapi:toggleVoiceSapi,
    testSapiSend:testVoiceSapiSend,
    addSapiPreset:addVoiceSapiPreset,
    syncSapiPresets:syncVoiceSapiPresets,
    addCustomWakePhrase:addCustomWakePhrase,
    removeCustomWakePhrase:removeCustomWakePhrase,
    renderWakeCustomPhrases:renderWakeCustomPhrases,
    renderWakePhraseTags:renderWakePhraseTags,
    resolveActiveAppSummonInfo:resolveActiveAppSummonInfo,
    activeAppScopeSummonPhrases:activeAppScopeSummonPhrases,
    toggleWakePhrase:toggleWakePhrase,
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
    renderKwsStatus:renderVoiceKwsStatus,
    loadKwsStatus:loadVoiceKwsStatus,
    setKwsEnabled:setVoiceKwsEnabled,
    testKwsSend:testVoiceKwsSend,
    testKwsDetect:testVoiceKwsDetect,
    downloadKwsModel:downloadKwsModel,
    handleKwsDownloadMessage:handleKwsDownloadMessage,
    retryKwsStart:retryKwsStart,
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
