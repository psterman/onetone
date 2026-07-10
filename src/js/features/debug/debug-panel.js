(function(global){
  'use strict';
  var $=function(id){ return global.OneToneDom.$(id); };
  var t=function(key){ return global.OneToneI18n.t(key); };
  function getAppLang(){ return global.OneToneI18n.getLang(); }
  function hooks(){ return global.__vp_debug_panel_hooks__ || {}; }
  function runtime(){ return global.OneToneState.runtime; }
  function ui(){ return global.OneToneState.ui; }
  function renderDebugOverview(){
    const hero=$('debugStatusHero');
    const heroTitle=$('debugHeroTitle');
    const heroSub=$('debugHeroSub');
    const hs=hooks().computeHomeState();
    if(hero){
      hero.className='debug-status-hero is-'+(hs.statusMode||'idle');
    }
    if(heroTitle) heroTitle.textContent=hs.statusLine||'—';
    if(heroSub) heroSub.textContent=hs.entrySummary||'';
    renderDebugOverviewCards();
    renderDebugOverviewActions(hs);
    global.OneToneVoiceDiag.renderSubnav();
  }

  function renderDebugOverviewActions(hs){
    const host=$('debugOverviewActions');
    if(!host) return;
    hs=hs||hooks().computeHomeState();
    const actions=[];
    if(hs.ctaMode==='dictating'){
      actions.push({label:t('btnVoiceGoRuntime'),panel:'voiceWake',focus:'endPhrases'});
    }else if(runtime().paused){
      actions.push({label:t('listenResume'),panel:'resume'});
    }else if(!hs.voiceActive){
      actions.push({label:t('btnRuntimeGoVoice'),panel:'voiceWake'});
    }
    if(!hs.keyActive){
      actions.push({label:t('settingsNavKeys'),panel:'keys'});
      actions.push({label:t('settingsNavScenes'),panel:'scenes'});
    }
    if(hs.statusMode==='error'){
      actions.push({label:t('debugFocusDiagnostics'),panel:'debug',debugMode:'diagnostics'});
    }
    if(!actions.length){ host.innerHTML=''; return; }
    host.innerHTML=actions.map(function(a){
      const attrs='type="button" class="control-btn" data-debug-action="'+hooks().escHtml(a.panel)+'"'+
        (a.focus?' data-debug-focus="'+hooks().escHtml(a.focus)+'"':'')+
        (a.debugMode?' data-debug-mode="'+hooks().escHtml(a.debugMode)+'"':'');
      return '<button '+attrs+'>'+hooks().escHtml(a.label)+'</button>';
    }).join('');
  }

  function formatUptime(ms){
    if(!(ms>0)) return '—';
    var sec=Math.floor(ms/1000);
    var h=Math.floor(sec/3600);
    var m=Math.floor((sec%3600)/60);
    var s=sec%60;
    return [h,m,s].map(function(n){ return String(n).padStart(2,'0'); }).join(':');
  }

  function renderDebugOverviewCards(){
    const host=$('debugOverviewCards');
    if(!host) return;
    const endSnap=hooks().voiceUiSnapshot.end||{};
    const w=hooks().voiceUiSnapshot.wake||{};
    const paused=!!runtime().paused;
    const m=hooks().selectedMapping&&hooks().selectedMapping();
    const trig=m?hooks().editorTriggerForMapping(m):'';
    const tgt=m?hooks().editorTargetForMapping(m):'';
    const keyReady=!!(trig&&tgt);
    const keyEnabled=!!(m&&m.enabled);
    const keyOn=keyReady&&keyEnabled&&!paused;
    const voiceOn=(w.engine==='sapi'||w.engine==='vosk')&&!paused;
    const endEnabled=!!endSnap.enabled;
    const stateRaw=endSnap.state||'idle';
    const dictating=hooks().sessionActiveState(stateRaw);

    function card(cls,label,val,sub){
      return '<div class="debug-overview-card '+cls+'"><div class="lbl">'+hooks().escHtml(label)+'</div><div class="val">'+hooks().escHtml(val)+'</div><div class="sub">'+hooks().escHtml(sub||'')+'</div></div>';
    }
    const eng=(w.engine==='vosk')?t('wakeEngineVosk'):(w.engine==='sapi')?t('wakeEngineSapi'):t('wakeEngineOff');
    const voiceState=w.state?hooks().voiceWakeStateLabel(w.state):'';
    let voiceSub=voiceOn?(voiceState||''):t('debugCardVoiceHint');
    if(endEnabled){
      const endPart=dictating?t('chipDictating'):t('voiceEndEnabledShort');
      voiceSub=(voiceSub?voiceSub+' · ':'')+t('debugCardEnd')+'：'+endPart;
    }
    const cards=[];
    const started=runtime().appStartedAt||Date.now();
    cards.push(card('is-ok',t('homeWbStatusUptime'),formatUptime(Date.now()-started),t('debugCardUptimeSub')));
    cards.push(card(paused?'is-warn':'is-ok',t('debugCardListen'),paused?t('listenPaused'):t('listenOn'),paused?t('debugCardListenPausedSub'):t('debugCardListenOnSub')));
    cards.push(card(keyOn?'is-ok':(keyReady?'is-warn':'is-off'),t('debugCardKey'),keyReady?(keyEnabled?t('debugCardKeyReady'):t('debugCardKeyDisabled')):t('debugCardKeyMissing'),keyReady?(hooks().friendlyKeyName(trig)+' → '+hooks().friendlyKeyName(tgt)):t('debugCardKeyHint')));
    cards.push(card(voiceOn?'is-ok':(w.engine!=='none'?'is-warn':'is-off'),t('debugCardVoice'),voiceOn?(eng+(w.phrase?' · '+w.phrase:'')):eng,voiceSub));
    host.innerHTML=cards.join('');
  }

  function latestInputExtEvent(){
    var events=(runtime().events||[]).slice().reverse();
    for(var i=0;i<events.length;i++){
      var kind=String(events[i].kind||'');
      if(kind==='input_captured'||kind==='input_ignored'||kind==='input_parse_miss'){
        return events[i];
      }
    }
    return null;
  }

  function renderInputExtSummary(){
    const host=$('devInputExtGrid');
    if(!host) return;
    const evt=latestInputExtEvent();
    if(!evt){
      host.innerHTML='<div class="dev-runtime-item"><div class="v">'+hooks().escHtml(t('debugInputExtEmpty'))+'</div></div>';
      return;
    }
    const payload=evt.payload||{};
    const items=[
      [t('debugInputExtKey'),payload.key||evt.message||'—'],
      [t('debugInputExtDevice'),payload.device||'—'],
      [t('debugInputExtReason'),payload.reason||evt.kind||'—'],
      [t('debugInputExtReport'),payload.reportHex||'—']
    ];
    host.innerHTML=items.map(function(pair){
      return '<div class="dev-runtime-item"><div class="k">'+hooks().escHtml(pair[0])+'</div><div class="v">'+hooks().escHtml(String(pair[1]))+'</div></div>';
    }).join('');
  }

  function renderDebugDeveloperSummary(){
    const host=$('debugDeveloperSummary');
    if(!host) return;
    const m=hooks().selectedMapping&&hooks().selectedMapping();
    const usage=hooks().processUsageSummaryLine();
    const mappingName=m?(m.label||hooks().friendlyPair(hooks().editorTriggerForMapping(m)||'',hooks().editorTargetForMapping(m)||'',m)):t('sessionUnbound');
    const cCount=m?hooks().conflictsForMapping(m.id).length:0;
    const cLine=cCount?t('debugCardConflict').replace('{n}',String(cCount)):t('debugCardNoConflict');
    function card(cls,label,val,sub){
      return '<div class="debug-overview-card '+cls+'"><div class="lbl">'+hooks().escHtml(label)+'</div><div class="val">'+hooks().escHtml(val)+'</div><div class="sub">'+hooks().escHtml(sub||'')+'</div></div>';
    }
    const cards=[];
    cards.push(card(hooks().processUsageSnapshot.loaded?'is-ok':'is-warn',t('debugCardUsage'),hooks().processUsageSnapshot.loaded?hooks().processUsageLine():t('voiceModeMetricLoading'),usage));
    cards.push(card(m&&m.enabled?'is-ok':'is-warn',t('debugCardScheme'),mappingName,m?(m.enabled?t('enabled')+' · ':'')+cLine:t('debugCardSchemeHint')));
    host.innerHTML=cards.join('');
  }
  function renderDebugDeveloperPanel(){
    renderDebugDeveloperSummary();
    renderInputExtSummary();
    const grid=$('devRuntimeGrid');
    if(grid){
      const m=hooks().selectedMapping();
      const w=hooks().voiceUiSnapshot.wake||{};
      const endSnap=hooks().voiceUiSnapshot.end||{};
      const eng=(w.engine==='vosk')?t('wakeEngineVosk'):(w.engine==='sapi')?t('wakeEngineSapi'):t('wakeEngineOff');
      const items=[
        [t('debugDevListen'),runtime().paused?t('listenPaused'):t('listenOn')],
        [t('debugDevLastAction'),runtime().lastAction||'—'],
        [t('debugDevTimer'),runtime().timerActive?t('debugDevTimerOn'):t('debugDevTimerOff')],
        [t('debugDevRecordMode'),hooks().recordingMode==='none'?t('debugDevRecordIdle'):hooks().recordingMode],
        [t('debugDevMapping'),m?(m.label||t('sessionSelectedMapping')):t('sessionUnbound')],
        [t('debugDevMappingEnabled'),m?(m.enabled?t('enabled'):t('disabled')):'—'],
        [t('debugKeyLabel'),m&&hooks().editorTriggerForMapping(m)?hooks().friendlyKeyName(hooks().editorTriggerForMapping(m)):'—'],
        [t('targetTitle'),m&&hooks().editorTargetForMapping(m)?hooks().friendlyKeyName(hooks().editorTargetForMapping(m)):'—'],
        [t('debugDevVoiceEngine'),eng+(w.phrase?' · '+w.phrase:'')],
        [t('debugDevVoiceState'),w.state?hooks().voiceWakeStateLabel(w.state):'—'],
        [t('debugDevEndState'),endSnap.statusLabel||hooks().voiceEndStateLabel(endSnap.state||'idle')],
        [t('debugDevLogCount'),String(hooks().logLines.length)+' '+t('debugDevLogUnit')]
      ];
      grid.innerHTML=items.map(function(pair){
        return '<div class="dev-runtime-item"><div class="k">'+hooks().escHtml(pair[0])+'</div><div class="v">'+hooks().escHtml(pair[1])+'</div></div>';
      }).join('');
    }
    const lastKeyGrid=$('devLastKeyGrid');
    if(lastKeyGrid){
      const keyItems=[
        [t('debugKeyLabel'),hooks().lastKeyDebug().key||'—'],
        [t('debugCodeLabel'),hooks().lastKeyDebug().code||'—'],
        [t('actionLabel'),runtime().lastAction||'—'],
        [t('sendLabel'),runtime().timerActive?t('debugDevTimerOn'):t('debugDevTimerOff')]
      ];
      lastKeyGrid.innerHTML=keyItems.map(function(pair){
        return '<div class="dev-runtime-item"><div class="k">'+hooks().escHtml(pair[0])+'</div><div class="v">'+hooks().escHtml(pair[1])+'</div></div>';
      }).join('');
    }
    const source=$('sourceExplain');
    if(source){
      const m=hooks().selectedMapping();
      const lines=[];
      if(m){
        lines.push((getAppLang()==='zh'?'习惯 ID: ':'Profile ID: ')+(m.id||'—'));
        lines.push((getAppLang()==='zh'?'启用: ':'Enabled: ')+(m.enabled?t('enabled'):t('disabled')));
        if(m.label) lines.push((getAppLang()==='zh'?'名称: ':'Label: ')+m.label);
        if(m.triggerSource){
          lines.push((getAppLang()==='zh'?'来源模式: ':'Mode: ')+(m.triggerSource.mode||'—'));
          lines.push((getAppLang()==='zh'?'分组方式: ':'Grouping: ')+(m.triggerSource.grouping||'—'));
        }
        const trace=hooks().formatTriggerTrace(m);
        lines.push((getAppLang()==='zh'?'识别到的按键: ':'Captured keys: ')+(trace||'—'));
        if(m.sourceKey) lines.push((getAppLang()==='zh'?'底层键值: ':'Raw key: ')+(m.sourceKey||'—'));
        const trig=hooks().editorTriggerForMapping(m);
        const tgt=hooks().editorTargetForMapping(m);
        if(trig) lines.push((getAppLang()==='zh'?'启动键: ':'Trigger: ')+hooks().friendlyKeyName(trig));
        if(tgt) lines.push((getAppLang()==='zh'?'快捷键: ':'Target: ')+hooks().friendlyKeyName(tgt));
        if(m.triggerMode) lines.push((getAppLang()==='zh'?'启动方式: ':'Trigger mode: ')+(m.triggerMode||'—'));
      }else{
        lines.push(getAppLang()==='zh'?'未选中习惯':'No profile selected');
      }
      source.textContent=lines.join('\n');
    }
    const rawLog=$('rawEventLog');
    if(rawLog) rawLog.textContent=hooks().logLines.length?hooks().logLines.join('\n'):t('waitLog');
  }

  function renderDebugPanel(){
    renderDebugOverview();
    global.OneToneVoiceDiag.renderTabs();
    ['sapi','vosk','end','usage'].forEach(global.OneToneVoiceDiag.renderMetrics);
    renderDebugDeveloperPanel();
  }
  global.OneToneDebugPanel={
    renderOverview:renderDebugOverview,
    renderOverviewActions:renderDebugOverviewActions,
    renderOverviewCards:renderDebugOverviewCards,
    renderDeveloper:renderDebugDeveloperPanel,
    renderPanel:renderDebugPanel
  };
})((typeof window!=='undefined')?window:globalThis);
