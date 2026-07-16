(function(global){
  'use strict';
  function hooks(){ return global.__vp_app_process_usage_hooks__ || {}; }

  var processUsageSnapshot={supported:false,memoryBytes:0,memoryMb:0,cpuPercent:0,coreCount:1,loaded:false,errorMessage:'',sampleAt:0};
  var processUsageHistory={sapi:null,vosk:null};
  var processUsagePollTimer=0;

  function formatProcessMemory(memoryMb){
    var value=Number(memoryMb);
    if(!(value>=0)) return '0 MB';
    if(value>=1024) return value.toFixed(1)+' GB';
    return Math.round(value)+' MB';
  }

  function formatProcessCpu(cpuPercent){
    var value=Number(cpuPercent);
    if(!(value>=0)) return '0%';
    if(value<10) return value.toFixed(1)+'%';
    return Math.round(value)+'%';
  }

  function processUsageLine(){
    return hooks().t('voiceModeMetricLive')
      .replace('{memory}',formatProcessMemory(processUsageSnapshot.memoryMb))
      .replace('{cpu}',formatProcessCpu(processUsageSnapshot.cpuPercent));
  }

  function processUsageUnavailableLine(){
    if(processUsageSnapshot.errorMessage) return hooks().t('voiceDiagUsageError')+': '+processUsageSnapshot.errorMessage;
    return hooks().t('voiceModeLiveUnsupported');
  }

  function formatProcessSampleTime(ts){
    if(!ts) return '—';
    var d=new Date(ts);
    if(isNaN(d.getTime())) return '—';
    return [d.getHours(),d.getMinutes(),d.getSeconds()].map(function(n){
      return String(n).padStart(2,'0');
    }).join(':');
  }

  function processUsageHistoryLine(mode){
    var snap=processUsageHistory[mode];
    if(!snap) return hooks().t('voiceModeMetricSwitch');
    return hooks().t('voiceModeMetricLast')
      .replace('{memory}',formatProcessMemory(snap.memoryMb))
      .replace('{cpu}',formatProcessCpu(snap.cpuPercent));
  }

  function processUsageSummaryLine(){
    if(!processUsageSnapshot.loaded) return hooks().t('voiceModeLiveLoading');
    if(!processUsageSnapshot.supported&&!processUsageSnapshot.memoryBytes) return processUsageUnavailableLine();
    return processUsageLine();
  }

  function processUsageModeLabel(mode){
    var wake=global.OneToneVoiceWake;
    if(wake&&wake.currentListeningStrategy){
      var strategy=wake.currentListeningStrategy();
      if(strategy==='auto') return hooks().t('voiceListeningStrategyAuto');
      if(strategy==='resourceSaver') return hooks().t('voiceListeningStrategyResourceSaver');
      if(strategy==='enhanced') return hooks().t('voiceListeningStrategyEnhanced');
      if(strategy==='off') return hooks().t('voiceListeningStrategyOff');
      if(strategy==='advanced') return hooks().t('voiceListeningStrategyAdvanced');
    }
    if(mode==='sapi') return hooks().t('voiceModeCurrentLite');
    if(mode==='vosk') return hooks().t('voiceModeCurrentPro');
    if(mode==='kws') return hooks().t('voiceModeKwsEngine');
    return hooks().t('voiceModeCurrentOff');
  }

  function processUsageStatusLabel(){
    if(!processUsageSnapshot.loaded) return hooks().t('voiceModeMetricLoading');
    if(!processUsageSnapshot.supported&&!processUsageSnapshot.memoryBytes) return processUsageUnavailableLine();
    return processUsageLine();
  }

  function renderVoiceUsageSummary(){
    var summary=hooks().$('voiceUsageSummary');
    if(!summary) return;
    if(!processUsageSnapshot.loaded){
      summary.textContent=hooks().t('voiceModeLiveLoading');
      return;
    }
    var parts=[];
    parts.push(hooks().t('voiceDiagLogUsageStatus')+'：'+(processUsageSnapshot.supported||processUsageSnapshot.memoryBytes>0?hooks().t('voiceDiagLogUsage'):processUsageUnavailableLine()));
    parts.push('采样时间：'+formatProcessSampleTime(processUsageSnapshot.sampleAt));
    summary.textContent=parts.join(' · ');
  }

  function renderVoiceModeUsage(){
    var mode=hooks().currentVoiceMode();
    var liteMetric=hooks().$('voiceModeLiteMetric');
    var proMetric=hooks().$('voiceModeProMetric');
    var liveReady=!!processUsageSnapshot.loaded&&(!!processUsageSnapshot.supported||processUsageSnapshot.memoryBytes>0);
    var activeMetricText=liveReady
      ? processUsageLine()
      : (processUsageSnapshot.loaded ? processUsageUnavailableLine() : hooks().t('voiceModeMetricLoading'));
    if(liteMetric){
      if(mode==='sapi') liteMetric.textContent=activeMetricText;
      else if(mode==='off') liteMetric.textContent=hooks().t('voiceModeMetricInactive');
      else liteMetric.textContent=processUsageHistoryLine('sapi');
    }
    if(proMetric){
      if(mode==='vosk') proMetric.textContent=activeMetricText;
      else if(mode==='off') proMetric.textContent=hooks().t('voiceModeMetricInactive');
      else proMetric.textContent=processUsageHistoryLine('vosk');
    }
    renderVoiceUsageSummary();
  }

  function refreshProcessUsage(){
    return hooks().vpInvokeTimeout('cmd_process_usage',{},3000).then(function(res){
      res=res||{};
      processUsageSnapshot.supported=!!res.supported||Number(res.memoryBytes)>0;
      processUsageSnapshot.memoryBytes=Number(res.memoryBytes)||0;
      processUsageSnapshot.memoryMb=Number(res.memoryMb)||0;
      processUsageSnapshot.cpuPercent=Number(res.cpuPercent)||0;
      processUsageSnapshot.coreCount=Number(res.coreCount)||1;
      processUsageSnapshot.sampleAt=Date.now();
      processUsageSnapshot.loaded=true;
      processUsageSnapshot.errorMessage='';
      var mode=hooks().currentVoiceMode();
      if(processUsageSnapshot.supported&&(mode==='sapi'||mode==='vosk')){
        processUsageHistory[mode]={
          memoryMb:processUsageSnapshot.memoryMb,
          cpuPercent:processUsageSnapshot.cpuPercent,
          at:Date.now()
        };
      }
      hooks().updateVoiceDiagMetric('usage','mode',processUsageModeLabel(mode),hooks().t('voiceDiagLogUsageMode'));
      hooks().updateVoiceDiagMetric('usage','sample',processUsageSummaryLine(),hooks().t('voiceDiagLogUsage'));
      hooks().updateVoiceDiagMetric('usage','status',processUsageStatusLabel(),hooks().t('voiceDiagLogUsageStatus'));
      renderVoiceModeUsage();
      hooks().scheduleDebugChromeRefresh();
      return res;
    }).catch(function(err){
      processUsageSnapshot.loaded=true;
      processUsageSnapshot.supported=processUsageSnapshot.memoryBytes>0;
      var message=(err&&err.message)?err.message:String(err||hooks().t('voiceDiagUsageError'));
      processUsageSnapshot.errorMessage=message;
      processUsageSnapshot.sampleAt=Date.now();
      hooks().updateVoiceDiagMetric('usage','status',hooks().t('voiceDiagUsageError'),hooks().t('voiceDiagLogUsageStatus'));
      hooks().forceVoiceDiagLog('usage',hooks().t('voiceDiagUsageError'),message);
      renderVoiceModeUsage();
      hooks().scheduleDebugChromeRefresh();
      console.error('process_usage',err);
      return null;
    });
  }

  function startProcessUsagePoll(){
    if(processUsagePollTimer) return;
    refreshProcessUsage();
    processUsagePollTimer=setInterval(refreshProcessUsage,2500);
  }

  global.OneToneAppProcessUsage={
    formatProcessMemory:formatProcessMemory,
    formatProcessCpu:formatProcessCpu,
    processUsageLine:processUsageLine,
    processUsageUnavailableLine:processUsageUnavailableLine,
    processUsageSummaryLine:processUsageSummaryLine,
    processUsageModeLabel:processUsageModeLabel,
    processUsageStatusLabel:processUsageStatusLabel,
    renderVoiceModeUsage:renderVoiceModeUsage,
    refreshProcessUsage:refreshProcessUsage,
    startProcessUsagePoll:startProcessUsagePoll,
    snapshot:function(){ return processUsageSnapshot; },
    history:function(){ return processUsageHistory; },
    pollTimer:function(){ return processUsagePollTimer; },
    clearPollTimer:function(){ clearInterval(processUsagePollTimer); processUsagePollTimer=0; }
  };
})((typeof window!=='undefined')?window:globalThis);
