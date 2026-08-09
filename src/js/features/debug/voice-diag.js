(function(global){
  'use strict';
  var $=function(id){ return global.OneToneDom.$(id); };
  var t=function(key){ return global.OneToneI18n.t(key); };
  var ui=function(){ return global.OneToneState.ui; };
  function getAppLang(){ return global.OneToneI18n.getLang(); }
  function hooks(){ return global.__vp_voice_diag_hooks__ || {}; }
  function escHtml(value){
    var fn=hooks().escHtml;
    if(typeof fn==='function') return fn(value);
    return String(value==null?'':value)
      .replace(/&/g,'&amp;')
      .replace(/</g,'&lt;')
      .replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;');
  }
  function currentVoiceMode(){
    var fn=hooks().currentVoiceMode;
    return typeof fn==='function'?fn():'vosk';
  }
  function hookCall(name){
    var args=Array.prototype.slice.call(arguments,1);
    var fn=hooks()[name];
    if(typeof fn!=='function') return undefined;
    try{ return fn.apply(null,args); }catch(err){ console.error('voice-diag hook',name,err); return undefined; }
  }
  var debugFocusMode='overview';
  var voiceDiagTab='vosk';
  var voiceDiagBound=false;
  var hangDiagTimer=0;
  var hangDiagInFlight=false;
  var hangDiagRing=[];
  var hangDiagLastStallLoaded=false;
  var hangDiagLastStallText='';
  var hangLiveOpen=true; // boot: expanded live panel
  var hangLiveBound=false;
  var hangLongTaskBound=false;
  var hangPeaks={maxGapMs:0,maxIpcHeldMs:0,warnN:0,stallN:0,ltN:0};
  var hangEvents=[]; // sticky breadcrumbs — survive recover-to-healthy
  var HANG_RING_MAX=120; // ~2min at 1s
  var HANG_POLL_MS=1000;
  var HANG_EVENT_MAX=10;
  var hangStallPollAt=0;

  function hangClassify(){
    var fn=global.OneToneVoiceHangClassify&&global.OneToneVoiceHangClassify.classifyHang;
    return typeof fn==='function'?fn:function(){ return 'healthy'; };
  }

  function hangYesNo(v){ return v?t('voiceHangDiagYes'):t('voiceHangDiagNo'); }

  function hangVerdictLabel(kind){
    if(kind==='stall') return t('voiceHangDiagStall');
    if(kind==='busy') return t('voiceHangDiagBusy');
    if(kind==='mismatch') return t('voiceHangDiagMismatch');
    return t('voiceHangDiagHealthy');
  }

  function hangClock(ts){
    var d=new Date(ts||Date.now());
    return [d.getHours(),d.getMinutes(),d.getSeconds()].map(function(n){
      return String(n).padStart(2,'0');
    }).join(':');
  }

  function noteHangSpike(info){
    info=info||{};
    var gap=Math.round(Number(info.gapMs)||0);
    var held=Math.round(Number(info.ipcHeldMs)||0);
    var tag=String(info.tag||'');
    var ipc=String(info.ipc||'');
    var src=String(info.source||'poll');
    var kind=String(info.kind||'');
    if(!kind){
      if(gap>=2000||held>=2000) kind='stall';
      else if(gap>=500||held>=500||src==='longtask') kind='warn';
      else return;
    }
    if(gap>hangPeaks.maxGapMs) hangPeaks.maxGapMs=gap;
    if(held>hangPeaks.maxIpcHeldMs) hangPeaks.maxIpcHeldMs=held;
    if(kind==='stall') hangPeaks.stallN++;
    else if(kind==='warn') hangPeaks.warnN++;
    if(src==='longtask') hangPeaks.ltN++;

    var line=hangClock(info.ts)+' '+kind+' gap='+gap;
    if(held) line+=' held='+held;
    if(ipc) line+=' ipc='+ipc;
    if(tag) line+=' tag='+tag;
    if(src&&src!=='poll') line+=' src='+src;
    if(info.seq!=null) line+=' seq='+info.seq;
    // Dedupe identical tip within 1s
    var prev=hangEvents[0];
    if(prev&&prev.sig===line&&(Date.now()-(prev.ts||0))<1000) return;
    hangEvents.unshift({ts:Date.now(),sig:line,kind:kind});
    if(hangEvents.length>HANG_EVENT_MAX) hangEvents.length=HANG_EVENT_MAX;

    if(kind==='stall'){
      hangDiagLastStallText=line;
      var stallEl=$('voiceHangDiagLastStall');
      if(stallEl) stallEl.textContent=hangDiagLastStallText;
    }
    var peakEl=$('voiceHangDiagPeak');
    if(peakEl) peakEl.textContent=formatHangPeak();
    var evEl=$('voiceHangDiagEvents');
    if(evEl) evEl.textContent=formatHangEvents();
  }

  function formatHangPeak(){
    if(!hangPeaks.maxGapMs&&!hangPeaks.maxIpcHeldMs&&!hangPeaks.warnN&&!hangPeaks.stallN){
      return t('voiceHangDiagNone');
    }
    return 'maxGap='+Math.round(hangPeaks.maxGapMs)+'ms'
      +' · maxHeld='+Math.round(hangPeaks.maxIpcHeldMs)+'ms'
      +' · warn='+hangPeaks.warnN
      +' · stall='+hangPeaks.stallN
      +(hangPeaks.ltN?' · lt='+hangPeaks.ltN:'');
  }

  function formatHangEvents(){
    if(!hangEvents.length) return t('voiceHangDiagNone');
    return hangEvents.map(function(e){ return e.sig; }).join(' | ');
  }

  function collectHangSnap(rsHb){
    var hb=global.OneToneUiHeartbeat||{};
    var wake=hooks().voiceUiSnapshot&&hooks().voiceUiSnapshot.wake||{};
    var end=hooks().voiceUiSnapshot&&hooks().voiceUiSnapshot.end||{};
    var sup=wake.supervisor||{};
    var wakeApi=global.OneToneVoiceWake||{};
    var engineState=String(wake.state||'');
    var active=String(sup.activeEngine||wake.engine||'').trim();
    if(active==='vosk'&&wake.vosk&&wake.vosk.state) engineState=String(wake.vosk.state);
    else if(active==='kws'&&wake.kws&&wake.kws.state) engineState=String(wake.kws.state);
    else if(active==='sapi'&&wake.sapi&&wake.sapi.state) engineState=String(wake.sapi.state);
    rsHb=rsHb||{};
    return {
      localGapMs:Number(hb.lastLocalGapMs)||0,
      pingAgeMs:Number(rsHb.pingAgeMs)||0,
      seq:Number(rsHb.seq!=null?rsHb.seq:hb.lastSeq)||0,
      activityTag:String(rsHb.activityTag!=null?rsHb.activityTag:(typeof hb.activityTag==='function'?hb.activityTag():''))||'',
      ipc:String(rsHb.ipc||''),
      ipcHeldMs:Number(rsHb.ipcHeldMs)||0,
      desiredEngine:String(sup.desiredEngine||''),
      activeEngine:String(sup.activeEngine||''),
      listeningStrategy:String(sup.listeningStrategy||''),
      activateBusy:!!sup.activateBusy,
      degradedReason:String(sup.degradedReason||''),
      engineState:engineState,
      endState:String(end.state||''),
      switchInFlight:!!(typeof wakeApi.switchInFlight==='function'&&wakeApi.switchInFlight()),
      openSettling:!!(typeof wakeApi.isOpenFlowSettling==='function'&&wakeApi.isOpenFlowSettling()),
      pollInFlight:!!(typeof wakeApi.statusPollInFlight==='function'&&wakeApi.statusPollInFlight())
    };
  }

  function pushHangRing(snap,kind){
    var gap=Math.max(Number(snap.localGapMs)||0,Number(snap.pingAgeMs)||0);
    var held=Number(snap.ipcHeldMs)||0;
    var gapTier='ok';
    if(gap>=2000||held>=2000) gapTier='stall';
    else if(gap>=500||held>=500) gapTier='warn';
    hangDiagRing.push({
      gapTier:gapTier,
      busy:kind==='busy'||!!snap.activateBusy||!!snap.switchInFlight?1:0
    });
    if(hangDiagRing.length>HANG_RING_MAX) hangDiagRing.splice(0,hangDiagRing.length-HANG_RING_MAX);
    if(gap>=500||held>=500||kind==='stall'){
      noteHangSpike({
        kind:kind==='stall'||gap>=2000||held>=2000?'stall':(kind==='busy'?'warn':undefined),
        gapMs:gap,
        ipcHeldMs:held,
        tag:snap.activityTag,
        ipc:snap.ipc,
        seq:snap.seq,
        source:'poll'
      });
    }
  }

  function renderHangTimeline(){
    var el=$('voiceHangDiagTimeline');
    if(!el) return;
    // Append-only: full innerHTML of 120 spans every tick contributed to voiceWake stalls.
    var kids=el.children;
    var have=kids?kids.length:0;
    if(have>HANG_RING_MAX){
      while(el.firstChild&&el.children.length>HANG_RING_MAX) el.removeChild(el.firstChild);
      have=el.children.length;
    }
    for(var i=have;i<hangDiagRing.length;i++){
      var p=hangDiagRing[i];
      var span=document.createElement('span');
      span.setAttribute('data-gap',p.gapTier||'ok');
      span.setAttribute('data-busy',p.busy?1:0);
      el.appendChild(span);
    }
    while(el.children.length>HANG_RING_MAX) el.removeChild(el.firstChild);
  }

  function applyHangDiagDom(snap,kind){
    var verdict=$('voiceHangDiagVerdict');
    if(verdict){
      verdict.setAttribute('data-hang',kind);
      verdict.textContent=hangVerdictLabel(kind);
    }
    var hbEl=$('voiceHangDiagHb');
    if(hbEl){
      var local=Math.round(Number(snap.localGapMs)||0);
      var age=Math.round(Number(snap.pingAgeMs)||0);
      var parts=['local='+local+'ms','age='+age+'ms','seq '+snap.seq];
      if(snap.activityTag) parts.push('tag='+snap.activityTag);
      if(snap.ipc) parts.push('ipc='+snap.ipc+(snap.ipcHeldMs?' +'+Math.round(snap.ipcHeldMs)+'ms':''));
      hbEl.textContent=parts.join(' · ');
    }
    var peakEl=$('voiceHangDiagPeak');
    if(peakEl) peakEl.textContent=formatHangPeak();
    var evEl=$('voiceHangDiagEvents');
    if(evEl) evEl.textContent=formatHangEvents();
    var supEl=$('voiceHangDiagSupervisor');
    if(supEl){
      var line=(snap.desiredEngine||'—')+' → '+(snap.activeEngine||'—');
      if(snap.listeningStrategy) line+=' · '+snap.listeningStrategy;
      line+=' · busy='+hangYesNo(snap.activateBusy);
      if(snap.degradedReason) line+=' · '+snap.degradedReason;
      if(snap.engineState) line+=' · eng='+snap.engineState;
      if(snap.endState) line+=' · end='+snap.endState;
      supEl.textContent=line;
    }
    var gEl=$('voiceHangDiagGuards');
    if(gEl){
      gEl.textContent='switch='+hangYesNo(snap.switchInFlight)
        +' · settling='+hangYesNo(snap.openSettling)
        +' · poll='+hangYesNo(snap.pollInFlight);
    }
    var stallEl=$('voiceHangDiagLastStall');
    if(stallEl) stallEl.textContent=hangDiagLastStallText||t('voiceHangDiagNone');
    renderHangTimeline();
  }

  function ensureLastStallOnce(){
    if(hangDiagLastStallLoaded) return;
    hangDiagLastStallLoaded=true;
    refreshLastStallFile(true);
  }

  function refreshLastStallFile(force){
    var now=Date.now();
    if(!force&&now-hangStallPollAt<4000) return;
    hangStallPollAt=now;
    if(!global.OneToneIpc||!global.OneToneIpc.invoke){
      if(!hangDiagLastStallText) hangDiagLastStallText=t('voiceHangDiagNone');
      return;
    }
    global.OneToneIpc.invoke('cmd_last_ui_stall',{}).then(function(s){
      if(!s||!s.code) return; // keep sticky in-memory text after recover clears file
      hangDiagLastStallText=String(s.code)
        +(s.gapMs!=null?' · '+s.gapMs+'ms':'')
        +(s.tag?' · tag='+s.tag:'')
        +(s.seq!=null?' · seq='+s.seq:'');
      noteHangSpike({
        kind:'stall',
        gapMs:s.gapMs||0,
        tag:s.tag||'',
        seq:s.seq,
        source:'stall_file'
      });
      var stallEl=$('voiceHangDiagLastStall');
      if(stallEl) stallEl.textContent=hangDiagLastStallText;
    }).catch(function(){});
  }

  function bindHangLongTasks(){
    if(hangLongTaskBound) return;
    hangLongTaskBound=true;
    try{
      if(typeof PerformanceObserver==='undefined') return;
      var po=new PerformanceObserver(function(list){
        var entries=list.getEntries?list.getEntries():[];
        for(var i=0;i<entries.length;i++){
          var e=entries[i];
          var dur=Math.round(e.duration||0);
          if(dur<200) continue;
          noteHangSpike({
            kind:dur>=2000?'stall':'warn',
            gapMs:dur,
            tag:'longtask'+(e.name?':'+e.name:''),
            source:'longtask'
          });
        }
      });
      po.observe({type:'longtask',buffered:true});
    }catch(_){
      try{
        // Older Chromium: entryTypes form
        var po2=new PerformanceObserver(function(list){
          var entries=list.getEntries();
          for(var i=0;i<entries.length;i++){
            var dur=Math.round(entries[i].duration||0);
            if(dur<200) continue;
            noteHangSpike({kind:dur>=2000?'stall':'warn',gapMs:dur,tag:'longtask',source:'longtask'});
          }
        });
        po2.observe({entryTypes:['longtask']});
      }catch(__){}
    }
  }

  function hangDiagVisible(){
    if(hangLiveOpen) return true;
    return !!(ui().drawerOpen&&ui().settingsPanel==='debug'&&debugFocusMode==='repair');
  }

  function syncHangLivePanelDom(){
    var panel=$('voiceHangLivePanel');
    if(!panel) return;
    panel.classList.toggle('is-open',!!hangLiveOpen);
    panel.classList.toggle('is-collapsed',!hangLiveOpen);
    panel.hidden=false;
    var body=$('voiceHangLiveBody');
    if(body) body.hidden=!hangLiveOpen;
    var btn=$('voiceHangLiveToggle');
    if(btn) btn.textContent=hangLiveOpen?t('voiceHangDiagCollapse'):t('voiceHangDiagExpand');
  }

  function pinMainAlwaysOnTop(){
    if(!global.OneToneIpc||!global.OneToneIpc.invoke) return;
    global.OneToneIpc.invoke('cmd_window_set_always_on_top',{enabled:true}).catch(function(){});
  }

  function setHangLiveOpen(open){
    hangLiveOpen=!!open;
    syncHangLivePanelDom();
    if(hangLiveOpen){
      pinMainAlwaysOnTop();
      renderVoiceHangDiag();
    }else if(!hangDiagVisible()){
      stopHangDiagPoll();
    }
  }

  function bindHangLivePanel(){
    if(hangLiveBound) return;
    hangLiveBound=true;
    var btn=$('voiceHangLiveToggle');
    if(btn){
      btn.addEventListener('click',function(){
        setHangLiveOpen(!hangLiveOpen);
      });
    }
  }

  function startLiveHangDiag(){
    bindHangLivePanel();
    bindHangLongTasks();
    hangLiveOpen=true;
    syncHangLivePanelDom();
    pinMainAlwaysOnTop();
    renderVoiceHangDiag();
  }

  function stopHangDiagPoll(){
    if(hangDiagTimer){
      clearTimeout(hangDiagTimer);
      hangDiagTimer=0;
    }
  }

  function scheduleHangDiagPoll(){
    stopHangDiagPoll();
    if(!hangDiagVisible()) return;
    hangDiagTimer=setTimeout(function(){
      hangDiagTimer=0;
      tickHangDiag();
    },HANG_POLL_MS);
  }

  function tickHangDiag(){
    if(!hangDiagVisible()){ stopHangDiagPoll(); return; }
    if(hangDiagInFlight){ scheduleHangDiagPoll(); return; }
    hangDiagInFlight=true;
    ensureLastStallOnce();
    var done=function(rsHb){
      hangDiagInFlight=false;
      try{
        var snap=collectHangSnap(rsHb);
        var kind=hangClassify()(snap);
        pushHangRing(snap,kind);
        applyHangDiagDom(snap,kind);
        refreshLastStallFile(kind==='stall');
      }catch(err){
        try{ console.error('voice hang diag',err); }catch(_){}
      }
      scheduleHangDiagPoll();
    };
    if(!global.OneToneIpc||!global.OneToneIpc.invoke){
      done({});
      return;
    }
    global.OneToneIpc.invoke('cmd_ui_hb_snapshot',{}).then(function(rs){
      done(rs||{});
    }).catch(function(){
      done({});
    });
  }

  function renderVoiceHangDiag(){
    if(!hangDiagVisible()){
      stopHangDiagPoll();
      return;
    }
    ensureLastStallOnce();
    // Keep a single 500ms poll; don't re-enter on every metrics refresh.
    if(hangDiagTimer||hangDiagInFlight) return;
    tickHangDiag();
  }

  function syncDebugFocusSections(){
    const show=ui().drawerOpen&&ui().settingsPanel==='debug';
    const map={
      overview:'debugFocusOverviewSection',
      repair:'debugFocusRepairSection',
      developer:'debugFocusDeveloperSection'
    };
    Object.keys(map).forEach(function(key){
      const section=$(map[key]);
      if(!section) return;
      section.hidden=show&&(debugFocusMode!==key);
    });
  }
  function refreshDiagnosticsPanel(){
    renderVoiceDiagTabs();
    ['sapi','vosk','kws','end','usage'].forEach(renderVoiceDiagMetrics);
    if(global.OneToneHomeWorkbench&&global.OneToneHomeWorkbench.renderTriggerDiagBlocks){
      global.OneToneHomeWorkbench.renderTriggerDiagBlocks();
    }
    renderVoiceHangDiag();
  }
  function setDebugFocusMode(mode){
    if(mode==='diagnostics') mode='repair';
    const allowed={overview:true,repair:true,developer:true};
    if(!allowed[mode]) mode='overview';
    const sameMode=debugFocusMode===mode;
    debugFocusMode=mode;
    syncDebugFocusSections();
    renderSettingsDebugSubnav();
    if(mode!=='repair') stopHangDiagPoll();
    if(mode==='repair'){
      const eng=currentVoiceMode();
      if(eng==='vosk') voiceDiagTab='vosk';
      else if(eng==='sapi') voiceDiagTab='sapi';
      else if(eng==='kws') voiceDiagTab='kws';
      else if(voiceDiagTab!=='end'&&voiceDiagTab!=='usage'&&voiceDiagTab!=='kws') voiceDiagTab='end';
      if(!sameMode) hookCall('voiceStatusPollTick');
      try{ refreshDiagnosticsPanel(); }catch(err){ console.error('voice diagnostics render',err); }
      hookCall('renderTrashList');
    }else if(mode==='developer'){
      hookCall('renderDebugDeveloperPanel');
    }else if(mode==='overview'){
      hookCall('renderDebugOverview');
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
      {mode:'overview',title:t('debugFocusOverview'),sub:t('debugFocusOverviewStatus')},
      {mode:'repair',title:t('debugFocusRepair'),sub:t('debugFocusRepairStatus')},
      {mode:'developer',title:t('debugFocusDeveloper'),sub:t('debugFocusDeveloperStatus')}
    ];
    let html='';
    items.forEach(function(item){
      const sel=debugFocusMode===item.mode;
      html+='<button type="button" class="settings-scheme-subnav-item'+(sel?' is-selected':'')+'" data-debug-nav="'+item.mode+'" role="tab" aria-selected="'+(sel?'true':'false')+'">';
      html+='<span class="settings-scheme-subnav-dot" aria-hidden="true"></span>';
      html+='<span class="settings-scheme-subnav-text">';
      html+='<span class="settings-scheme-subnav-pair">'+escHtml(item.title)+'</span>';
      html+='<span class="settings-scheme-subnav-status">'+escHtml(item.sub)+'</span>';
      html+='</span></button>';
    });
    listEl.innerHTML=html;
    if(global.OneToneSettingsDrawer&&global.OneToneSettingsDrawer.syncSubnavRail) global.OneToneSettingsDrawer.syncSubnavRail();
  }

  function setVoiceDiagTab(tab){
    const allowed={sapi:true,vosk:true,kws:true,end:true,usage:true};
    if(!allowed[tab]) tab='vosk';
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
      html+='<div class="voice-diag-metric"><span class="k">'+escHtml(t(f.labelKey))+'</span><span class="v">'+escHtml(val)+'</span></div>';
    });
    host.innerHTML=html;
  }

  function renderVoiceDiagTabs(){
    const tabs=$('voiceDiagTabs');
    if(!tabs) return;
    const items=[
      {id:'sapi',label:t('voiceDiagTabSapi')},
      {id:'vosk',label:t('voiceDiagTabVosk')},
      {id:'kws',label:t('voiceDiagTabKws')},
      {id:'end',label:t('voiceDiagTabEnd')},
      {id:'usage',label:t('voiceDiagTabUsage')}
    ];
    let html='';
    items.forEach(function(item){
      const sel=voiceDiagTab===item.id;
      const sub=voiceDiagTabDynamicSub(item.id);
      html+='<button type="button" class="voice-diag-tab'+(sel?' is-active':'')+'" data-diag-tab="'+item.id+'" role="tab" aria-selected="'+(sel?'true':'false')+'">';
      html+='<span class="voice-diag-tab-label">'+escHtml(item.label)+'</span>';
      if(sub) html+='<span class="voice-diag-tab-sub">'+escHtml(sub)+'</span>';
      html+='</button>';
    });
    tabs.innerHTML=html;
    ['sapi','vosk','kws','end','usage'].forEach(function(id){
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
    hookCall('renderDebugOverview');
    renderSettingsDebugSubnav();
    if(debugFocusMode==='repair'){
      try{ refreshDiagnosticsPanel(); }catch(err){ console.error('voice diagnostics refresh',err); }
    }else if(debugFocusMode==='developer'){
      hookCall('renderDebugDeveloperPanel');
      hookCall('renderTrashList');
    }else if(debugFocusMode==='overview'){
      hookCall('renderDebugOverview');
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
    if(kind==='kws'){
      const r=w.kws||{};
      if(key==='state') return hookCall('voiceWakeStateLabel',r.state||'stopped')||r.state||'';
      if(key==='phrases'){
        const phrases=Array.isArray(r.phrases)?r.phrases:[];
        return phrases.length?phrases.join(' / '):'';
      }
      if(key==='active'){
        const phrases=Array.isArray(r.phrasesActive)?r.phrasesActive:[];
        return phrases.length?phrases.join(' / '):'';
      }
      if(key==='skippedPhrases'){
        const phrases=Array.isArray(r.phrasesSkipped)?r.phrasesSkipped:[];
        return phrases.length?phrases.join(' / '):'';
      }
      if(key==='truncatedPhrases'){
        const phrases=Array.isArray(r.phrasesTruncated)?r.phrasesTruncated:[];
        return phrases.length?phrases.join(' / '):'';
      }
      if(key==='buildIssue') return r.keywordBuildIssue||'';
      if(key==='model'){
        const modelPath=r.resolvedModelPath||r.modelPath||'';
        const modelOk=r.modelExists?'OK':(getAppLang()==='zh'?'缺失':'missing');
        return modelPath?modelPath+' ('+modelOk+')':'';
      }
      if(key==='partial'){
        return global.OneToneVoiceWake&&global.OneToneVoiceWake.kwsHeardDisplayText
          ?global.OneToneVoiceWake.kwsHeardDisplayText(r)
          :(r.lastDetectedPhrase||'');
      }
      if(key==='kind') return r.lastDetectedKind||'';
      if(key==='hit') return r.lastDetectedPhrase||'';
      if(key==='trigger') return r.lastTrigger||'';
      if(key==='skip') return r.lastSkip||'';
      if(key==='error') return r.lastError||'';
      if(key==='stub') return r.resourceIssue||((r.stubMode?t('voiceKwsStubMode'):'')||'');
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
      if(key==='mode') return hookCall('processUsageModeLabel',currentVoiceMode())||'';
      if(key==='sample') return hookCall('processUsageSummaryLine')||'';
      if(key==='status') return hookCall('processUsageStatusLabel')||'';
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
    if(tab==='kws'){
      const r=w.kws||{};
      const state=hooks().voiceWakeStateLabel(r.state||'stopped');
      const hit=r.lastDetectedPhrase||r.lastDetectedKind||'';
      return hit?(state+' · '+hit):state;
    }
    if(tab==='end'){
      return end.statusLabel||hooks().voiceEndStateLabel(end.state||'idle');
    }
    if(tab==='usage'){
      var snap=hooks().processUsageSnapshot||{};
      if(!snap.loaded) return t('voiceModeMetricLoading');
      if(snap.memoryBytes>0||snap.supported) return hooks().processUsageLine();
      return hooks().processUsageUnavailableLine();
    }
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
    kws:[
      {key:'state',labelKey:'voiceDiagLogState'},
      {key:'phrases',labelKey:'voiceKwsPhrasesEffective'},
      {key:'active',labelKey:'voiceKwsPhrasesActive'},
      {key:'skippedPhrases',labelKey:'voiceKwsPhrasesSkipped'},
      {key:'truncatedPhrases',labelKey:'voiceKwsPhrasesTruncated'},
      {key:'buildIssue',labelKey:'voiceKwsKeywordBuildIssue'},
      {key:'model',labelKey:'voiceKwsModelStatus'},
      {key:'partial',labelKey:'voiceDiagLogHeard'},
      {key:'kind',labelKey:'voiceKwsLastKind'},
      {key:'hit',labelKey:'voiceDiagLogHit'},
      {key:'trigger',labelKey:'voiceKwsLastTrigger'},
      {key:'skip',labelKey:'voiceDiagLogSkip'},
      {key:'error',labelKey:'voiceDiagLogError'},
      {key:'stub',labelKey:'voiceKwsStubNote'}
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
  const voiceDiagLogs={sapi:[],vosk:[],kws:[],end:[],usage:[]};
  const voiceDiagLast={sapi:{},vosk:{},kws:{},end:{},usage:{}};
  let voiceDiagNonce=0;
  function voiceDiagElementId(kind){
    if(kind==='sapi') return 'voiceSapiLog';
    if(kind==='vosk') return 'voiceVoskLog';
    if(kind==='kws') return 'voiceKwsLog';
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
    if(ui().drawerOpen&&ui().settingsPanel==='debug'&&debugFocusMode==='repair'){
      renderVoiceDiagMetrics(kind);
      renderVoiceDiagTabs();
    }
  }

  function bindEvents(){
    if(voiceDiagBound) return;
    voiceDiagBound=true;
    bindHangLivePanel();
    var tabs=$('voiceDiagTabs');
    if(tabs){
      tabs.addEventListener('click',function(e){
        var btn=e.target.closest&&e.target.closest('[data-diag-tab]');
        if(!btn) return;
        var tab=btn.getAttribute('data-diag-tab')||'';
        if(tab) setVoiceDiagTab(tab);
      });
    }
  }

  global.OneToneVoiceDiag={
    bindEvents:bindEvents,
    syncFocusSections:syncDebugFocusSections,
    setFocusMode:setDebugFocusMode,
    renderSubnav:renderSettingsDebugSubnav,
    setTab:setVoiceDiagTab,
    renderMetrics:renderVoiceDiagMetrics,
    renderTabs:renderVoiceDiagTabs,
    renderHangDiag:renderVoiceHangDiag,
    startLiveHangDiag:startLiveHangDiag,
    setHangLiveOpen:setHangLiveOpen,
    isHangLiveOpen:function(){ return !!hangLiveOpen; },
    noteHangSpike:noteHangSpike,
    getHangPeaks:function(){ return hangPeaks; },
    getHangEvents:function(){ return hangEvents.slice(); },
    scheduleChromeRefresh:scheduleDebugChromeRefresh,
    renderLog:renderVoiceDiagLog,
    pushLog:pushVoiceDiagLog,
    forceLog:forceVoiceDiagLog,
    updateMetric:updateVoiceDiagMetric,
    getFocusMode:function(){ return debugFocusMode; },
    getTab:function(){ return voiceDiagTab; }
  };
})((typeof window!=='undefined')?window:globalThis);
