(function(global){
  'use strict';
  var $=function(id){ return global.OneToneDom.$(id); };
  var t=function(key){ return global.OneToneI18n.t(key); };
  var ui=function(){ return global.OneToneState.ui; };
  function getAppLang(){ return global.OneToneI18n.getLang(); }
  function hooks(){ return global.__vp_voice_diag_hooks__ || {}; }
  var debugFocusMode='overview';
  var voiceDiagTab='sapi';
  function syncDebugFocusSections(){
    const show=ui().drawerOpen&&ui().settingsPanel==='debug';
    const map={
      overview:'debugFocusOverviewSection',
      diagnostics:'debugFocusDiagnosticsSection',
      developer:'debugFocusDeveloperSection'
    };
    Object.keys(map).forEach(function(key){
      const section=$(map[key]);
      if(!section) return;
      section.hidden=show&&(debugFocusMode!==key);
    });
  }
  function setDebugFocusMode(mode){
    const allowed={overview:true,diagnostics:true,developer:true};
    if(!allowed[mode]) mode='overview';
    if(debugFocusMode===mode&&ui().drawerOpen&&ui().settingsPanel==='debug'){
      syncDebugFocusSections();
      renderSettingsDebugSubnav();
      if(mode==='diagnostics'){
        renderVoiceDiagTabs();
        ['sapi','vosk','end','usage'].forEach(renderVoiceDiagMetrics);
        if(global.OneToneHomeWorkbench&&global.OneToneHomeWorkbench.renderTriggerDiagBlocks){
          global.OneToneHomeWorkbench.renderTriggerDiagBlocks();
        }
      }
      return;
    }
    debugFocusMode=mode;
    if(mode==='diagnostics'){
      const eng=hooks().currentVoiceMode();
      if(eng==='vosk') voiceDiagTab='vosk';
      else if(eng==='sapi') voiceDiagTab='sapi';
      else if(voiceDiagTab!=='end'&&voiceDiagTab!=='usage') voiceDiagTab='end';
      hooks().voiceStatusPollTick();
    }
    syncDebugFocusSections();
    renderSettingsDebugSubnav();
    if(mode==='diagnostics'){
      renderVoiceDiagTabs();
      ['sapi','vosk','end','usage'].forEach(renderVoiceDiagMetrics);
      if(global.OneToneHomeWorkbench&&global.OneToneHomeWorkbench.renderTriggerDiagBlocks){
        global.OneToneHomeWorkbench.renderTriggerDiagBlocks();
      }
    }else if(mode==='developer'){
      hooks().renderDebugDeveloperPanel();
    }
    if(global.OneToneSettingsDrawer&&global.OneToneSettingsDrawer.syncWorkbenchNav){
      global.OneToneSettingsDrawer.syncWorkbenchNav('debug',{debugMode:mode});
    }
  }
  function renderSettingsDebugSubnav(){
    const subnav=$('settingsDebugSubnav');
    const listEl=$('settingsDebugSubnavList');
    const debugPanel=$('settingsPanelDebug');
    const sidebar=$('settingsSidebar')||document.querySelector('.settings-sidebar');
    const shell=$('settingsShell')||document.querySelector('.settings-shell');
    const show=ui().drawerOpen&&ui().settingsPanel==='debug';
    if(subnav) subnav.hidden=!show;
    if(debugPanel) debugPanel.classList.toggle('is-debug-subnav',show);
    if(sidebar) sidebar.classList.toggle('is-debug-panel',show);
    if(shell) shell.classList.toggle('is-debug-panel',show);
    if(listEl) listEl.setAttribute('aria-label',t('settingsDebugSubnavLabel'));
    if(global.OneToneSettingsDrawer&&global.OneToneSettingsDrawer.syncSubnavRail) global.OneToneSettingsDrawer.syncSubnavRail();
    if(!show||!listEl) return;
    const items=[
      {mode:'overview',title:t('debugFocusOverview'),sub:debugFocusDynamicSub('overview')||t('debugFocusOverviewStatus')},
      {mode:'diagnostics',title:t('debugFocusDiagnostics'),sub:debugFocusDynamicSub('diagnostics')||t('debugFocusDiagnosticsStatus')},
      {mode:'developer',title:t('debugFocusDeveloper'),sub:debugFocusDynamicSub('developer')||t('debugFocusDeveloperStatus')}
    ];
    let html='';
    items.forEach(function(item){
      const sel=debugFocusMode===item.mode;
      html+='<button type="button" class="settings-scheme-subnav-item'+(sel?' is-selected':'')+'" data-debug-nav="'+item.mode+'" role="tab" aria-selected="'+(sel?'true':'false')+'">';
      html+='<span class="settings-scheme-subnav-dot" aria-hidden="true"></span>';
      html+='<span class="settings-scheme-subnav-text">';
      html+='<span class="settings-scheme-subnav-pair">'+hooks().escHtml(item.title)+'</span>';
      html+='<span class="settings-scheme-subnav-status">'+hooks().escHtml(item.sub)+'</span>';
      html+='</span></button>';
    });
    listEl.innerHTML=html;
    if(global.OneToneSettingsDrawer&&global.OneToneSettingsDrawer.syncSubnavRail) global.OneToneSettingsDrawer.syncSubnavRail();
  }

  function setVoiceDiagTab(tab){
    const allowed={sapi:true,vosk:true,end:true,usage:true};
    if(!allowed[tab]) tab='sapi';
    if(voiceDiagTab===tab) return;
    voiceDiagTab=tab;
    renderVoiceDiagTabs();
    renderVoiceDiagMetrics(tab);
  }

  function renderVoiceDiagMetrics(kind){
    const hostId='voiceDiagMetrics'+kind.charAt(0).toUpperCase()+kind.slice(1);
    const host=$(hostId);
    if(!host) return;
    const fields=VOICE_DIAG_METRIC_FIELDS[kind]||[];
    let html='';
    fields.forEach(function(f){
      const live=liveVoiceDiagMetricValue(kind,f.key);
      const val=(live&&live!=='—')?live:((voiceDiagLast[kind]||{})[f.key]||'—');
      html+='<div class="voice-diag-metric"><span class="k">'+hooks().escHtml(t(f.labelKey))+'</span><span class="v">'+hooks().escHtml(val)+'</span></div>';
    });
    host.innerHTML=html;
  }

  function renderVoiceDiagTabs(){
    const tabs=$('voiceDiagTabs');
    if(!tabs) return;
    const items=[
      {id:'sapi',label:t('voiceDiagTabSapi')},
      {id:'vosk',label:t('voiceDiagTabVosk')},
      {id:'end',label:t('voiceDiagTabEnd')},
      {id:'usage',label:t('voiceDiagTabUsage')}
    ];
    let html='';
    items.forEach(function(item){
      const sel=voiceDiagTab===item.id;
      const sub=voiceDiagTabDynamicSub(item.id);
      html+='<button type="button" class="voice-diag-tab'+(sel?' is-active':'')+'" data-diag-tab="'+item.id+'" role="tab" aria-selected="'+(sel?'true':'false')+'">';
      html+='<span class="voice-diag-tab-label">'+hooks().escHtml(item.label)+'</span>';
      if(sub) html+='<span class="voice-diag-tab-sub">'+hooks().escHtml(sub)+'</span>';
      html+='</button>';
    });
    tabs.innerHTML=html;
    ['sapi','vosk','end','usage'].forEach(function(id){
      const pane=$('voiceDiagPane'+id.charAt(0).toUpperCase()+id.slice(1));
      if(pane) pane.hidden=voiceDiagTab!==id;
    });
    renderVoiceDiagMetrics(voiceDiagTab);
    const compat=$('voiceDiagCompatNote');
    if(compat){
      const endSnap=hooks().voiceUiSnapshot.end||{};
      const w=hooks().voiceUiSnapshot.wake||{};
      const show=!!endSnap.enabled||w.engine==='vosk';
      compat.hidden=!show;
      compat.textContent=t('voiceEndCompatWarn');
    }
  }

  function scheduleDebugChromeRefresh(){
    if(!ui().drawerOpen||ui().settingsPanel!=='debug') return;
    hooks().renderDebugOverview();
    renderSettingsDebugSubnav();
    if(debugFocusMode==='diagnostics'){
      renderVoiceDiagTabs();
      ['sapi','vosk','end','usage'].forEach(renderVoiceDiagMetrics);
      if(global.OneToneHomeWorkbench&&global.OneToneHomeWorkbench.renderTriggerDiagBlocks){
        global.OneToneHomeWorkbench.renderTriggerDiagBlocks();
      }
    }
  }

  function liveVoiceDiagMetricValue(kind,key){
    const w=hooks().voiceUiSnapshot.wake||{};
    const end=hooks().voiceUiSnapshot.end||{};
    if(kind==='sapi'){
      const r=w.sapi||{};
      if(key==='state') return hooks().voiceWakeStateLabel(r.state||'stopped');
      if(key==='phrases'){
        const phrases=Array.isArray(r.phrases)?r.phrases:[];
        return phrases.length?phrases.join(' / '):'';
      }
      if(key==='heard') return r.lastHeard||'';
      if(key==='skip') return r.lastSkip||'';
      if(key==='error') return r.lastError||'';
    }
    if(kind==='vosk'){
      const r=w.vosk||{};
      if(key==='state') return hooks().voiceWakeStateLabel(r.state||'stopped');
      if(key==='model'){
        const modelPath=r.resolvedModelPath||r.modelPath||'';
        const modelOk=r.modelExists?'OK':(getAppLang()==='zh'?'缺失':'missing');
        return modelPath?modelPath+' ('+modelOk+')':'';
      }
      if(key==='final') return r.lastFinal||'';
      if(key==='partial') return r.lastPartial||'';
      if(key==='hit') return r.lastDetectedPhrase||'';
      if(key==='skip') return r.lastSkip||'';
      if(key==='error') return r.lastError||'';
    }
    if(kind==='end'){
      if(key==='state') return end.statusLabel||hooks().voiceEndStateLabel(end.state||'idle');
      if(key==='phrase') return end.lastEndPhrase||'';
      if(key==='action') return end.lastAction||'';
      if(key==='auto') return end.autoSendEnabled?t('voiceEndAutoSendOn'):t('voiceEndAutoSendOff');
      if(key==='delay'){
        const delayMs=end.commitDelayMs!=null?end.commitDelayMs:4000;
        return t('voiceEndDelayMs').replace('{n}',String(delayMs));
      }
      if(key==='audio') return end.recordingAudioEnabled?t('voiceEndAudioDiagOn'):t('voiceEndAudioDiagOff');
      if(key==='audioStrength'){
        const strength=String(end.recordingAudioStrength||'balanced').trim()||'balanced';
        const labelKey='recordingMuteStrength'+strength.charAt(0).toUpperCase()+strength.slice(1);
        return t(labelKey);
      }
    }
    if(kind==='usage'){
      if(key==='mode') return hooks().processUsageModeLabel(hooks().currentVoiceMode());
      if(key==='sample') return hooks().processUsageSummaryLine();
      if(key==='status') return hooks().processUsageStatusLabel();
    }
    const bucket=voiceDiagLast[kind]||{};
    return bucket[key]||'';
  }

  function voiceDiagTabDynamicSub(tab){
    const w=hooks().voiceUiSnapshot.wake||{};
    const end=hooks().voiceUiSnapshot.end||{};
    if(tab==='sapi'){
      const r=w.sapi||{};
      const state=hooks().voiceWakeStateLabel(r.state||'stopped');
      const heard=r.lastHeard||'';
      return heard?(state+' · '+heard):state;
    }
    if(tab==='vosk'){
      const r=w.vosk||{};
      const state=hooks().voiceWakeStateLabel(r.state||'stopped');
      const hit=r.lastDetectedPhrase||r.lastPartial||'';
      return hit?(state+' · '+hit):state;
    }
    if(tab==='end'){
      return end.statusLabel||hooks().voiceEndStateLabel(end.state||'idle');
    }
    if(tab==='usage'){
      if(!hooks().processUsageSnapshot.loaded) return t('voiceModeMetricLoading');
      if(hooks().processUsageSnapshot.memoryBytes>0||hooks().processUsageSnapshot.supported) return hooks().processUsageLine();
      return hooks().processUsageUnavailableLine();
    }
    return '';
  }

  function debugFocusDynamicSub(mode){
    try{
      const paused=!!(global.OneToneState.runtime.paused);
      const endSnap=hooks().voiceUiSnapshot.end||{};
      const w=hooks().voiceUiSnapshot.wake||{};
      if(mode==='overview'){
        if(paused) return t('listenPaused');
        const stateRaw=endSnap.state||'idle';
        if(hooks().sessionActiveState(stateRaw)) return t('chipDictating');
        if(stateRaw==='error') return t('homeCtaError');
        return t('listenOn');
      }
      if(mode==='diagnostics'){
        const eng=(w.engine==='vosk')?t('wakeEngineVosk'):(w.engine==='sapi')?t('wakeEngineSapi'):t('wakeEngineOff');
        const status=(w.state?hooks().voiceWakeStateLabel(w.state):'');
        let usage='';
        if(hooks().processUsageSnapshot.loaded&&(hooks().processUsageSnapshot.memoryBytes>0||hooks().processUsageSnapshot.supported)){
          usage=hooks().formatProcessMemory(hooks().processUsageSnapshot.memoryMb)+' · '+hooks().formatProcessCpu(hooks().processUsageSnapshot.cpuPercent);
        }else if(hooks().processUsageSnapshot.loaded){
          usage=hooks().processUsageUnavailableLine();
        }else{
          usage=t('voiceModeMetricLoading');
        }
        return (eng+(status?' · '+status:''))+' · '+usage;
      }
      if(mode==='developer'){
        const lines=(Array.isArray(hooks().logLines)?hooks().logLines.length:0);
        const last=lines?String(hooks().logLines[lines.length-1]||'').slice(0,14):'—';
        return (lines?('日志 '+lines+' 条'):'无日志')+' · '+last;
      }
    }catch(_){}
    return '';
  }
  const VOICE_DIAG_METRIC_FIELDS={
    sapi:[
      {key:'state',labelKey:'voiceDiagLogState'},
      {key:'phrases',labelKey:'voiceSapiWakeWord'},
      {key:'heard',labelKey:'voiceDiagLogHeard'},
      {key:'skip',labelKey:'voiceDiagLogSkip'},
      {key:'error',labelKey:'voiceDiagLogError'}
    ],
    vosk:[
      {key:'state',labelKey:'voiceDiagLogState'},
      {key:'model',labelKey:'voiceDiagLogModel'},
      {key:'final',labelKey:'voiceDiagLogFinal'},
      {key:'partial',labelKey:'voiceDiagLogHeard'},
      {key:'hit',labelKey:'voiceDiagLogHit'},
      {key:'skip',labelKey:'voiceDiagLogSkip'},
      {key:'error',labelKey:'voiceDiagLogError'}
    ],
    end:[
      {key:'state',labelKey:'voiceDiagLogState'},
      {key:'phrase',labelKey:'voiceDiagLogPhrase'},
      {key:'action',labelKey:'voiceDiagLogAction'},
      {key:'auto',labelKey:'voiceEndAutoSend'},
      {key:'delay',labelKey:'voiceEndDelay'},
      {key:'audio',labelKey:'voiceDiagLogAudioMute'},
      {key:'audioStrength',labelKey:'voiceDiagLogAudioStrength'}
    ],
    usage:[
      {key:'mode',labelKey:'voiceDiagLogUsageMode'},
      {key:'sample',labelKey:'voiceDiagLogUsage'},
      {key:'status',labelKey:'voiceDiagLogUsageStatus'}
    ]
  };
  const VOICE_DIAG_LOG_LIMIT=18;
  const voiceDiagLogs={sapi:[],vosk:[],end:[],usage:[]};
  const voiceDiagLast={sapi:{},vosk:{},end:{},usage:{}};
  let voiceDiagNonce=0;
  function voiceDiagElementId(kind){
    if(kind==='sapi') return 'voiceSapiLog';
    if(kind==='vosk') return 'voiceVoskLog';
    if(kind==='end') return 'voiceEndLog';
    if(kind==='usage') return 'voiceUsageLog';
    return '';
  }

  function voiceDiagTimestamp(){
    const now=new Date();
    return [now.getHours(),now.getMinutes(),now.getSeconds()].map(function(n){
      return String(n).padStart(2,'0');
    }).join(':');
  }

  function renderVoiceDiagLog(kind){
    const el=$(voiceDiagElementId(kind));
    if(!el) return;
    const list=voiceDiagLogs[kind]||[];
    const emptyKey=kind==='usage'?'voiceDiagUsageEmpty':'voiceDiagLogEmpty';
    el.textContent=list.length?list.join('\n'):t(emptyKey);
  }

  function pushVoiceDiagLog(kind,label,text,signature){
    if(!kind||!label||!text) return;
    const bucket=voiceDiagLast[kind]||(voiceDiagLast[kind]={});
    const sig=String(signature==null?(label+'|'+text):signature);
    if(sig && bucket.__lastSig===sig) return;
    bucket.__lastSig=sig;
    const list=voiceDiagLogs[kind]||(voiceDiagLogs[kind]=[]);
    list.unshift(voiceDiagTimestamp()+'  '+label+': '+text);
    if(list.length>VOICE_DIAG_LOG_LIMIT) list.length=VOICE_DIAG_LOG_LIMIT;
    renderVoiceDiagLog(kind);
  }

  function forceVoiceDiagLog(kind,label,text){
    pushVoiceDiagLog(kind,label,text,kind+'|'+(voiceDiagNonce++));
  }

  function updateVoiceDiagMetric(kind,name,value,label){
    const bucket=voiceDiagLast[kind]||(voiceDiagLast[kind]={});
    const next=String(value==null?'':value).trim();
    if(bucket[name]===next) return;
    bucket[name]=next;
    if(!next) return;
    pushVoiceDiagLog(kind,label,next,kind+'|'+name+'|'+next);
    if(ui().drawerOpen&&ui().settingsPanel==='debug'&&debugFocusMode==='diagnostics'){
      renderVoiceDiagMetrics(kind);
      renderVoiceDiagTabs();
    }
  }

  global.OneToneVoiceDiag={
    syncFocusSections:syncDebugFocusSections,
    setFocusMode:setDebugFocusMode,
    renderSubnav:renderSettingsDebugSubnav,
    setTab:setVoiceDiagTab,
    renderMetrics:renderVoiceDiagMetrics,
    renderTabs:renderVoiceDiagTabs,
    scheduleChromeRefresh:scheduleDebugChromeRefresh,
    renderLog:renderVoiceDiagLog,
    pushLog:pushVoiceDiagLog,
    forceLog:forceVoiceDiagLog,
    updateMetric:updateVoiceDiagMetric,
    getFocusMode:function(){ return debugFocusMode; },
    getTab:function(){ return voiceDiagTab; }
  };
})((typeof window!=='undefined')?window:globalThis);
