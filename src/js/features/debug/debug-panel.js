(function(global){
  'use strict';
  var $=function(id){ return global.OneToneDom.$(id); };
  var t=function(key){ return global.OneToneI18n.t(key); };
  function getAppLang(){ return global.OneToneI18n.getLang(); }
  function hooks(){ return global.__vp_debug_panel_hooks__ || {}; }
  function runtime(){ return global.OneToneState.runtime; }
  function ui(){ return global.OneToneState.ui; }

  function formatUptime(ms){
    if(!(ms>0)) return '—';
    var sec=Math.floor(ms/1000);
    var h=Math.floor(sec/3600);
    var m=Math.floor((sec%3600)/60);
    var s=sec%60;
    return [h,m,s].map(function(n){ return String(n).padStart(2,'0'); }).join(':');
  }

  function buildDebugOverviewModel(){
    const hs=hooks().computeHomeState();
    const heroCls='debug-status-hero is-'+(hs.statusMode||'idle');
    const heroTitle=hs.statusLine||'—';
    const heroSub=hs.entrySummary||'';
    // cards
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
    const eng=(w.engine==='vosk')?t('wakeEngineVosk'):(w.engine==='sapi')?t('wakeEngineSapi'):(w.engine==='kws')?t('wakeEngineKws'):t('wakeEngineOff');
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
    const cardsHtml=cards.join('');
    // actions
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
      actions.push({label:t('debugFocusRepair'),panel:'debug',debugMode:'repair'});
    }
    const actionsHtml=actions.length?actions.map(function(a){
      const attrs='type="button" class="control-btn" data-debug-action="'+hooks().escHtml(a.panel)+'"'+
        (a.focus?' data-debug-focus="'+hooks().escHtml(a.focus)+'"':'')+
        (a.debugMode?' data-debug-mode="'+hooks().escHtml(a.debugMode)+'"':'');
      return '<button '+attrs+'>'+hooks().escHtml(a.label)+'</button>';
    }).join(''):'';
    const sig=[heroCls,heroTitle,heroSub,cardsHtml,actionsHtml].join('\0');
    return {
      heroCls:heroCls,
      heroTitle:heroTitle,
      heroSub:heroSub,
      cardsHtml:cardsHtml,
      actionsHtml:actionsHtml,
      sig:sig
    };
  }

  function applyDebugOverviewHost(model){
    if(!model) model=buildDebugOverviewModel();
    if(global.__otDebugOverviewMounted&&typeof global.__otDebugOverviewSync==='function'){
      global.__otDebugOverviewSync();
      return;
    }
    const hero=$('debugStatusHero');
    const heroTitle=$('debugHeroTitle');
    const heroSub=$('debugHeroSub');
    const cards=$('debugOverviewCards');
    const actions=$('debugOverviewActions');
    if(hero) hero.className=model.heroCls||'debug-status-hero';
    if(heroTitle) heroTitle.textContent=model.heroTitle||'—';
    if(heroSub) heroSub.textContent=model.heroSub||'';
    if(cards) cards.innerHTML=model.cardsHtml||'';
    if(actions) actions.innerHTML=model.actionsHtml||'';
  }

  function renderDebugOverview(){
    applyDebugOverviewHost(buildDebugOverviewModel());
    global.OneToneVoiceDiag.renderSubnav();
  }

  function renderDebugOverviewActions(hs){
    void hs;
    applyDebugOverviewHost(buildDebugOverviewModel());
  }

  function renderDebugOverviewCards(){
    applyDebugOverviewHost(buildDebugOverviewModel());
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

  function esc(s){
    return hooks().escHtml?hooks().escHtml(String(s==null?'':s)):String(s==null?'':s);
  }

  var quickCtrlSig='';
  var quickCtrlTimer=0;

  function readProtocolSnap(){
    var snap=global.__otRuntimeStatusProtocol||null;
    if(snap&&snap.statusToken) return snap;
    return {
      statusToken:'idle',
      statusText:'—',
      triggerText:'',
      targetText:'',
      repairText:'',
      canPause:true,
      canResume:false,
      lastEventText:'',
      ts:0,
      label:'—',
      detail:''
    };
  }

  function readWorkbenchFive(){
    // Never call buildHomeWorkbenchModel here — that used to 假死 the maintenance tab.
    var cached=global.__otWorkbenchFiveSnapshot;
    if(cached&&cached.length) return cached;
    return [
      [t('homeWbFlowStatus'),'—'],
      [t('homeWbFlowTrigger'),'—'],
      [t('homeWbFlowTarget'),'—'],
      [t('homeWbStatusWork'),'—'],
      [t('debugFocusRepair'),'—']
    ];
  }

  function tokenToneClass(token){
    token=String(token||'idle');
    if(token==='error') return 'is-error';
    if(token==='paused'||token==='needsSetup') return 'is-warn';
    if(token==='dictating'||token==='listening'||token==='triggered') return 'is-ok';
    return 'is-idle';
  }

  function scheduleQuickControlPanel(immediate){
    if(immediate){
      if(quickCtrlTimer){ clearTimeout(quickCtrlTimer); quickCtrlTimer=0; }
      renderQuickControlPanel();
      return;
    }
    if(quickCtrlTimer) return;
    quickCtrlTimer=setTimeout(function(){
      quickCtrlTimer=0;
      renderQuickControlPanel();
    },80);
  }

  function protoField(snap,key,fallbackKey){
    if(snap[key]!=null&&String(snap[key])!=='') return snap[key];
    if(fallbackKey&&snap[fallbackKey]!=null) return snap[fallbackKey];
    return '';
  }

  /** Optimistic listen flip so maintenance UI / tray protocol don't wait on voice engine restart. */
  function applyOptimisticListen(wantResume){
    clearProtocolOverride();
    var rt=runtime();
    if(rt) rt.paused=!wantResume;
    var prev=readProtocolSnap();
    var lex=global.OneToneRuntimeStatusLexicon;
    var nextToken=wantResume
      ?(prev.statusToken==='paused'?'listening':(prev.statusToken||'listening'))
      :'paused';
    if(wantResume&&(nextToken==='paused'||!nextToken)) nextToken='listening';
    var statusText=prev.statusText||prev.label||'';
    if(lex&&typeof lex.labelFor==='function'){
      statusText=lex.labelFor(nextToken)||statusText;
    }
    publishProtocolBits({
      statusToken:nextToken,
      statusText:statusText,
      triggerText:prev.triggerText||prev.detail||'',
      targetText:prev.targetText||'',
      repairText:wantResume?'':(prev.repairText||''),
      paused:!wantResume,
      lastEventText:wantResume?'':(prev.lastEventText||'')
    },{sticky:false,repaintHome:true});
  }

  function clearProtocolOverride(){
    try{ delete global.__otRuntimeStatusOverride; }catch(_){ global.__otRuntimeStatusOverride=null; }
  }

  function publishProtocolBits(bits,opts){
    opts=opts||{};
    var lex=global.OneToneRuntimeStatusLexicon;
    var snap=lex&&typeof lex.buildFromWorkbenchInputs==='function'
      ?lex.buildFromWorkbenchInputs(bits)
      :lex&&typeof lex.protocolSnapshot==='function'
        ?lex.protocolSnapshot(bits)
        :Object.assign({
          canPause:bits.statusToken!=='paused'&&bits.statusToken!=='needsSetup',
          canResume:bits.statusToken==='paused',
          ts:Date.now(),
          label:bits.statusText||'',
          detail:bits.triggerText||''
        },bits);
    if(opts.sticky) global.__otRuntimeStatusOverride=snap;
    else if(!opts.keepOverride) clearProtocolOverride();
    global.__otRuntimeStatusProtocol=snap;
    try{
      var five=global.__otWorkbenchFiveSnapshot;
      if(five&&five[0]) five[0][1]=snap.statusText||'—';
      if(five&&five[1]&&snap.triggerText) five[1][1]=snap.triggerText;
      if(five&&five[2]&&snap.targetText) five[2][1]=snap.targetText;
      if(five&&five[4]) five[4][1]=snap.repairText||t('debugQuickCtrlNoRepair');
    }catch(_){}
    try{
      if(typeof global.dispatchEvent==='function'){
        global.dispatchEvent(new CustomEvent('ot:runtime-status',{detail:snap}));
      }
    }catch(_){}
    try{
      if(global.OneToneIpc&&typeof global.OneToneIpc.invoke==='function'){
        global.OneToneIpc.invoke('cmd_runtime_status_protocol',snap).catch(function(){});
      }
    }catch(_){}
    if(opts.repaintHome){
      if(global.OneToneHomeWorkbench&&typeof global.OneToneHomeWorkbench.forceHomeRender==='function'){
        global.OneToneHomeWorkbench.forceHomeRender();
      }
      if(global.OneToneHomeWorkbench&&typeof global.OneToneHomeWorkbench.render==='function'){
        global.OneToneHomeWorkbench.render();
      }else if(global.OneToneRender&&typeof global.OneToneRender.render==='function'){
        global.OneToneRender.render();
      }
    }
    quickCtrlSig='';
    scheduleQuickControlPanel(true);
    return snap;
  }

  function readHeroStatusToken(){
    var host=$('wbHeroFlowSummary');
    if(host&&host.getAttribute('data-wb-status-token')){
      return String(host.getAttribute('data-wb-status-token')||'');
    }
    var shell=$('homeWorkbench')||$('appWorkbenchShell');
    if(shell&&shell.getAttribute('data-wb-status')){
      return String(shell.getAttribute('data-wb-status')||'');
    }
    return '';
  }

  function buildCompareProbe(snap){
    var protoTok=String((snap&&snap.statusToken)||'idle');
    var heroTok=readHeroStatusToken()||'—';
    var aligned=heroTok==='—'||heroTok===protoTok;
    return {
      aligned:aligned,
      line:t('debugQuickCtrlCompareLine')
        .replace('{proto}',protoTok)
        .replace('{hero}',heroTok)
        .replace('{tray}','statusToken')
        .replace('{hud}','data-status-token'),
      mark:aligned?t('debugQuickCtrlCompareOk'):t('debugQuickCtrlCompareFail')
    };
  }

  function renderQuickControlPanel(){
    var panel=$('debugQuickControlPanel');
    if(!panel) return;
    // Only paint while maintenance (developer) section is visible.
    var section=$('debugFocusDeveloperSection');
    if(section&&section.hidden) return;

    var snap=readProtocolSnap();
    var token=String(snap.statusToken||'idle');
    var statusText=String(protoField(snap,'statusText','label')||'—');
    var triggerText=String(protoField(snap,'triggerText','detail')||'—');
    var targetText=String(snap.targetText||'—');
    var repairText=String(snap.repairText||'');
    var lastEvent=String(snap.lastEventText||'');
    var canPause=true;
    var canResume=false;
    if(typeof snap.canPause==='boolean') canPause=!!snap.canPause;
    else canPause=token!=='paused'&&token!=='needsSetup';
    if(typeof snap.canResume==='boolean') canResume=!!snap.canResume;
    else canResume=token==='paused';
    var ipc=String(global.__otRecordIpcPhase||'idle');
    var paused=!!runtime().paused||canResume;
    var five=readWorkbenchFive();
    var fiveSig=five.map(function(p){ return p[1]; }).join('\0');
    var heroTok=readHeroStatusToken();
    var sig=[
      token,
      statusText,
      triggerText,
      targetText,
      repairText,
      lastEvent,
      canPause?'1':'0',
      canResume?'1':'0',
      String(snap.ts||0),
      ipc,
      fiveSig,
      heroTok||'',
      global.__otRuntimeStatusOverride?'sim':'live'
    ].join('\0');
    if(sig===quickCtrlSig&&panel._otQcActionsBound) return;
    quickCtrlSig=sig;

    var pill=$('debugQuickCtrlTokenPill');
    if(pill){
      pill.textContent=token;
      pill.className='ot-quick-ctrl-token '+tokenToneClass(token);
      pill.setAttribute('data-token',token);
    }
    var statusHost=$('debugQuickCtrlStatus');
    if(statusHost){
      statusHost.innerHTML=
        '<div class="ot-quick-ctrl-line"><span class="k">'+esc(t('debugQuickCtrlLabel'))+'</span><strong>'+esc(statusText)+'</strong></div>'
        +'<div class="ot-quick-ctrl-line"><span class="k">'+esc(t('debugQuickCtrlDetail'))+'</span><strong>'+esc(triggerText)+'</strong></div>'
        +'<div class="ot-quick-ctrl-line"><span class="k">'+esc(t('debugQuickCtrlTarget'))+'</span><strong>'+esc(targetText)+'</strong></div>'
        +'<div class="ot-quick-ctrl-line"><span class="k">'+esc(t('debugQuickCtrlRepair'))+'</span><strong>'+esc(repairText||t('debugQuickCtrlNoRepair'))+'</strong></div>'
        +'<div class="ot-quick-ctrl-line"><span class="k">'+esc(t('debugQuickCtrlLastEvent'))+'</span><strong>'+esc(lastEvent||'—')+'</strong></div>'
        +'<div class="ot-quick-ctrl-line"><span class="k">'+esc(t('debugQuickCtrlCanPause'))+'</span><strong>'+esc(canPause?'true':'false')+'</strong></div>'
        +'<div class="ot-quick-ctrl-line"><span class="k">'+esc(t('debugQuickCtrlCanResume'))+'</span><strong>'+esc(canResume?'true':'false')+'</strong></div>'
        +'<div class="ot-quick-ctrl-line"><span class="k">'+esc(t('debugQuickCtrlTs'))+'</span><strong>'+esc(String(snap.ts||0))+'</strong></div>'
        +'<div class="ot-quick-ctrl-line"><span class="k">'+esc(t('debugQuickCtrlIpc'))+'</span><strong>'+esc(ipc)+'</strong></div>';
    }
    var probe=$('debugQuickCtrlProbe');
    if(probe){
      var wire={
        statusToken:token,
        statusText:statusText,
        triggerText:triggerText==='—'?'':triggerText,
        targetText:targetText==='—'?'':targetText,
        repairText:repairText,
        canPause:canPause,
        canResume:canResume,
        lastEventText:lastEvent,
        ts:snap.ts||0
      };
      var cmp=buildCompareProbe(snap);
      probe.hidden=false;
      probe.classList.toggle('is-mismatch',!cmp.aligned);
      probe.textContent=t('debugQuickCtrlProbeHint')+'\n'
        +'['+cmp.mark+'] '+cmp.line+'\n'
        +JSON.stringify(wire,null,2);
    }
    var grid=$('debugQuickCtrlGrid');
    if(grid){
      grid.innerHTML=five.map(function(pair){
        return '<div class="ot-quick-ctrl-cell" role="listitem">'
          +'<span class="lbl">'+esc(pair[0])+'</span>'
          +'<strong class="val" title="'+esc(pair[1])+'">'+esc(pair[1])+'</strong>'
          +'</div>';
      }).join('');
    }
    var actions=$('debugQuickCtrlActions');
    if(actions&&panel._otQcActionsBound&&!actions.querySelector('[data-qc-act="trigger"]')){
      panel._otQcActionsBound=false;
      actions.innerHTML='';
    }
    if(actions&&!panel._otQcActionsBound){
      panel._otQcActionsBound=true;
      actions.innerHTML=
        '<button type="button" class="control-btn" data-qc-act="listen">'+esc(paused?t('listenResume'):t('listenPause'))+'</button>'
        +'<button type="button" class="control-btn" data-qc-act="trigger">'+esc(t('debugQuickCtrlTrigger'))+'</button>'
        +'<button type="button" class="control-btn" data-qc-act="simulateError">'+esc(t('debugQuickCtrlSimulateError'))+'</button>'
        +'<button type="button" class="control-btn" data-qc-act="repair">'+esc(t('debugFocusRepair'))+'</button>'
        +'<button type="button" class="control-btn" data-qc-act="keys">'+esc(t('settingsNavKeys'))+'</button>'
        +'<button type="button" class="control-btn" data-qc-act="home">'+esc(t('homeWbNavHome'))+'</button>'
        +'<button type="button" class="control-btn" data-qc-act="refresh">'+esc(t('debugQuickCtrlRefresh'))+'</button>';
      actions.addEventListener('click',function(e){
        var btn=e.target.closest&&e.target.closest('[data-qc-act]');
        if(!btn||btn.disabled) return;
        var act=btn.getAttribute('data-qc-act');
        if(act==='listen'){
          var cur=readProtocolSnap();
          var wantResume=!!cur.canResume||!!runtime().paused;
          applyOptimisticListen(wantResume);
          if(global.OneToneIpc){
            global.OneToneIpc.invoke(wantResume?'cmd_resume':'cmd_pause',{}).catch(function(){});
          }
          return;
        }
        if(act==='trigger'){
          var prev=readProtocolSnap();
          var lex=global.OneToneRuntimeStatusLexicon;
          var trigText=lex&&lex.labelFor?lex.labelFor('triggered'):'triggered';
          publishProtocolBits({
            statusToken:'triggered',
            statusText:trigText,
            triggerText:prev.triggerText||prev.detail||'',
            targetText:prev.targetText||'',
            repairText:'',
            lastEventText:trigText,
            paused:false
          },{sticky:false,repaintHome:true});
          if(global.OneToneIpc){
            global.OneToneIpc.invoke('cmd_tray_action',{action:'test_trigger',payload:null}).catch(function(){});
          }
          setTimeout(function(){
            if(global.__otRuntimeStatusProtocol&&global.__otRuntimeStatusProtocol.statusToken==='triggered'){
              clearProtocolOverride();
              if(global.OneToneHomeWorkbench&&global.OneToneHomeWorkbench.forceHomeRender){
                global.OneToneHomeWorkbench.forceHomeRender();
              }
              if(global.OneToneHomeWorkbench&&global.OneToneHomeWorkbench.render){
                global.OneToneHomeWorkbench.render();
              }
              quickCtrlSig='';
              scheduleQuickControlPanel(true);
            }
          },1200);
          return;
        }
        if(act==='simulateError'){
          var base=readProtocolSnap();
          var errLabel=t('homeWbTriggerError');
          var repairLabel=t('debugFocusRepair');
          publishProtocolBits({
            statusToken:'error',
            statusText:errLabel,
            triggerText:base.triggerText||base.detail||'',
            targetText:base.targetText||'',
            repairText:repairLabel,
            lastEventText:errLabel,
            paused:false
          },{sticky:true,repaintHome:true});
          return;
        }
        if(act==='keys'){
          if(global.OneToneSettingsDrawer&&global.OneToneSettingsDrawer.open){
            global.OneToneSettingsDrawer.open({panel:'keys',focus:'trigger'});
          }
          return;
        }
        if(act==='repair'){
          if(global.OneToneVoiceDiag&&global.OneToneVoiceDiag.setFocusMode){
            global.OneToneVoiceDiag.setFocusMode('repair');
          }
          return;
        }
        if(act==='home'){
          if(global.OneToneSettingsDrawer&&global.OneToneSettingsDrawer.close){
            global.OneToneSettingsDrawer.close();
          }
          return;
        }
        if(act==='refresh'){
          clearProtocolOverride();
          try{ console.info('[ot-runtime-status]',JSON.stringify(global.__otRuntimeStatusProtocol||null)); }catch(_){}
          try{
            var cmpLog=buildCompareProbe(readProtocolSnap());
            console.info('[ot-runtime-status-compare]',cmpLog.mark,cmpLog.line);
          }catch(_){}
          if(global.OneToneHomeWorkbench&&global.OneToneHomeWorkbench.forceHomeRender){
            global.OneToneHomeWorkbench.forceHomeRender();
          }
          if(global.OneToneHomeWorkbench&&global.OneToneHomeWorkbench.render){
            global.OneToneHomeWorkbench.render();
          }
          quickCtrlSig='';
          scheduleQuickControlPanel(true);
        }
      });
    }
    if(actions){
      var listenBtn=actions.querySelector('[data-qc-act="listen"]');
      if(listenBtn){
        listenBtn.textContent=paused?t('listenResume'):t('listenPause');
        listenBtn.disabled=paused?!canResume:!canPause;
      }
      var triggerBtn=actions.querySelector('[data-qc-act="trigger"]');
      if(triggerBtn){
        triggerBtn.disabled=!!paused||!!canResume;
      }
      var repairBtn=actions.querySelector('[data-qc-act="repair"]');
      if(repairBtn){
        repairBtn.disabled=!(repairText||token==='error');
      }
    }
  }

  var VERIFY_STORAGE_KEY='ot_verify_checklist_v1';
  var verifyChecklistBound=false;
  var verifyRenderTimer=0;
  if(!global.__otVerifySeen){
    global.__otVerifySeen={paused:false,resumed:false,triggered:false,errored:false,refreshedLive:false};
  }

  function verifyItemDefs(){
    return [
      {group:'proto',id:'proto1',titleKey:'debugVerifyProto1',howKey:'debugVerifyProto1How',qc:'listenPause'},
      {group:'proto',id:'proto2',titleKey:'debugVerifyProto2',howKey:'debugVerifyProto2How',qc:'listenResume'},
      {group:'proto',id:'proto3',titleKey:'debugVerifyProto3',howKey:'debugVerifyProto3How',qc:'trigger'},
      {group:'proto',id:'proto4',titleKey:'debugVerifyProto4',howKey:'debugVerifyProto4How',qc:'simulateError'},
      {group:'proto',id:'proto5',titleKey:'debugVerifyProto5',howKey:'debugVerifyProto5How',qc:'refresh'},
      {group:'gate',id:'g14',titleKey:'debugVerifyG14',howKey:'debugVerifyG14How',passKey:'debugVerifyG14Pass',panel:'keys'},
      {group:'gate',id:'g15',titleKey:'debugVerifyG15',howKey:'debugVerifyG15How',passKey:'debugVerifyG15Pass',panel:'keys'},
      {group:'gate',id:'g16',titleKey:'debugVerifyG16',howKey:'debugVerifyG16How',passKey:'debugVerifyG16Pass',panel:'keys'},
      {group:'gate',id:'g17',titleKey:'debugVerifyG17',howKey:'debugVerifyG17How',passKey:'debugVerifyG17Pass',panel:'keys'},
      {group:'gate',id:'g18',titleKey:'debugVerifyG18',howKey:'debugVerifyG18How',passKey:'debugVerifyG18Pass',panel:'keys'},
      {group:'gate',id:'g19',titleKey:'debugVerifyG19',howKey:'debugVerifyG19How',passKey:'debugVerifyG19Pass',panel:'keys'},
      {group:'gate',id:'g20',titleKey:'debugVerifyG20',howKey:'debugVerifyG20How',passKey:'debugVerifyG20Pass',panel:'softPad'},
      {group:'gate',id:'g21',titleKey:'debugVerifyG21',howKey:'debugVerifyG21How',passKey:'debugVerifyG21Pass',panel:'softPad'},
      {group:'gate',id:'g22',titleKey:'debugVerifyG22',howKey:'debugVerifyG22How',passKey:'debugVerifyG22Pass',panel:'softPad'},
      {group:'gate',id:'g23',titleKey:'debugVerifyG23',howKey:'debugVerifyG23How',passKey:'debugVerifyG23Pass',panel:'softPad'},
      {group:'gate',id:'g24',titleKey:'debugVerifyG24',howKey:'debugVerifyG24How',passKey:'debugVerifyG24Pass',panel:'softPad'},
      {group:'gate',id:'g25',titleKey:'debugVerifyG25',howKey:'debugVerifyG25How',passKey:'debugVerifyG25Pass',panel:'softPad'},
      {group:'gate',id:'g26',titleKey:'debugVerifyG26',howKey:'debugVerifyG26How',passKey:'debugVerifyG26Pass',panel:'voiceWake'},
      {group:'gate',id:'g27',titleKey:'debugVerifyG27',howKey:'debugVerifyG27How',passKey:'debugVerifyG27Pass',panel:'camera'},
      {group:'gate',id:'g28',titleKey:'debugVerifyG28',howKey:'debugVerifyG28How',passKey:'debugVerifyG28Pass',panel:'debug',debugMode:'overview'}
    ];
  }

  function loadVerifyState(){
    try{
      var raw=localStorage.getItem(VERIFY_STORAGE_KEY);
      if(!raw) return {};
      var parsed=JSON.parse(raw);
      return parsed&&typeof parsed==='object'?parsed:{};
    }catch(_){ return {}; }
  }

  function saveVerifyState(state){
    try{ localStorage.setItem(VERIFY_STORAGE_KEY,JSON.stringify(state||{})); }catch(_){}
  }

  function scheduleVerifyChecklist(){
    if(verifyRenderTimer) return;
    verifyRenderTimer=setTimeout(function(){
      verifyRenderTimer=0;
      maybeAutoMarkProtoSteps();
      renderVerifyChecklist();
    },60);
  }

  function maybeAutoMarkProtoSteps(){
    var snap=readProtocolSnap();
    var tok=String(snap.statusToken||'idle');
    var hero=readHeroStatusToken();
    var aligned=!hero||hero==='—'||hero===tok;
    var seen=global.__otVerifySeen;
    if(tok==='paused'&&(snap.canResume||runtime().paused)) seen.paused=true;
    if(seen.paused&&(tok==='listening'||tok==='idle'||tok==='dictating')&&!snap.canResume&&!runtime().paused){
      seen.resumed=true;
    }
    if((tok==='triggered'||tok==='dictating')&&String(snap.lastEventText||'').trim()){
      seen.triggered=true;
    }
    if(tok==='error'&&String(snap.repairText||'').trim()){
      seen.errored=true;
    }
    if(seen.errored&&!global.__otRuntimeStatusOverride&&tok!=='error'&&aligned){
      seen.refreshedLive=true;
    }
    var st=loadVerifyState();
    var changed=false;
    function mark(id,cond){
      if(cond&&!st[id]){ st[id]=true; changed=true; }
    }
    mark('proto1',seen.paused);
    mark('proto2',seen.resumed);
    mark('proto3',seen.triggered);
    mark('proto4',seen.errored);
    mark('proto5',seen.refreshedLive);
    if(changed){
      saveVerifyState(st);
      try{
        if(global.OneToneUi&&global.OneToneUi.toast){
          // avoid toast spam: only once per session wave
          if(!global.__otVerifyAutoToasted){
            global.__otVerifyAutoToasted=true;
            global.OneToneUi.toast(t('debugVerifyAutoMarked'));
            setTimeout(function(){ global.__otVerifyAutoToasted=false; },2500);
          }
        }
      }catch(_){}
    }
    return changed;
  }

  function firstUncheckedVerifyItem(state){
    state=state||loadVerifyState();
    var defs=verifyItemDefs();
    for(var i=0;i<defs.length;i++){
      if(!state[defs[i].id]) return defs[i];
    }
    return null;
  }

  function runVerifyNext(){
    var next=firstUncheckedVerifyItem();
    if(!next){
      if(global.OneToneUi&&global.OneToneUi.toast) global.OneToneUi.toast(t('debugVerifyAllDone'));
      return;
    }
    var el=$('debugVerifyChecklist')&&$('debugVerifyChecklist').querySelector('[data-verify-id="'+next.id+'"]');
    if(el&&el.scrollIntoView) el.scrollIntoView({block:'nearest',behavior:'smooth'});
    if(next.qc) runVerifyQc(next.qc);
    else openVerifyPanel(next);
  }

  function clickQuickCtrlAct(act){
    scheduleQuickControlPanel(true);
    var btn=$('debugQuickCtrlActions')&&$('debugQuickCtrlActions').querySelector('[data-qc-act="'+act+'"]');
    if(btn&&!btn.disabled){ btn.click(); return true; }
    return false;
  }

  function runVerifyQc(qc){
    if(qc==='listenPause'){
      var snap=readProtocolSnap();
      if(snap.canResume||runtime().paused){
        scheduleQuickControlPanel(true);
        scheduleVerifyChecklist();
        return;
      }
      clickQuickCtrlAct('listen');
      scheduleVerifyChecklist();
      return;
    }
    if(qc==='listenResume'){
      var cur=readProtocolSnap();
      if(!(cur.canResume||runtime().paused)){
        clickQuickCtrlAct('listen');
        setTimeout(function(){ clickQuickCtrlAct('listen'); scheduleVerifyChecklist(); },180);
        return;
      }
      clickQuickCtrlAct('listen');
      scheduleVerifyChecklist();
      return;
    }
    if(qc==='trigger'||qc==='simulateError'||qc==='refresh'){
      if(!clickQuickCtrlAct(qc)){
        scheduleQuickControlPanel(true);
        setTimeout(function(){ clickQuickCtrlAct(qc); scheduleVerifyChecklist(); },50);
      }else{
        scheduleVerifyChecklist();
      }
    }
  }

  function openVerifyPanel(item){
    if(!item||!item.panel) return;
    var opts={panel:item.panel};
    if(item.debugMode) opts.debugMode=item.debugMode;
    if(global.OneToneSettingsDrawer&&global.OneToneSettingsDrawer.open){
      global.OneToneSettingsDrawer.open(opts);
    }
  }

  function copyVerifyProgress(){
    var state=loadVerifyState();
    var defs=verifyItemDefs();
    var lines=defs.map(function(d){
      var ok=!!state[d.id];
      return (ok?'[x]':'[ ]')+' '+t(d.titleKey);
    });
    var text=lines.join('\n');
    function done(){
      if(global.OneToneUi&&global.OneToneUi.toast) global.OneToneUi.toast(t('debugVerifyCopied'));
      else try{ console.info(text); }catch(_){}
    }
    if(navigator.clipboard&&navigator.clipboard.writeText){
      navigator.clipboard.writeText(text).then(done).catch(function(){
        try{ console.info(text); }catch(_){}
        done();
      });
    }else{
      try{ console.info(text); }catch(_){}
      done();
    }
  }

  function renderVerifyChecklist(){
    var host=$('debugVerifyChecklist');
    var panel=$('debugVerifyChecklistPanel');
    if(!host||!panel) return;
    var section=$('debugFocusDeveloperSection');
    if(section&&section.hidden) return;

    maybeAutoMarkProtoSteps();
    var state=loadVerifyState();
    var defs=verifyItemDefs();
    var done=0;
    defs.forEach(function(d){ if(state[d.id]) done++; });
    var progress=$('debugVerifyProgress');
    if(progress){
      progress.textContent=done+'/'+defs.length;
      progress.classList.toggle('is-done',done===defs.length&&defs.length>0);
    }

    var next=firstUncheckedVerifyItem(state);
    var nextHost=$('debugVerifyNext');
    if(nextHost){
      if(next){
        nextHost.hidden=false;
        var nextAction=next.qc?t('debugVerifyDo'):t('debugVerifyOpen');
        nextHost.innerHTML=
          '<div><strong>'+esc(t('debugVerifyNextLabel'))+'：</strong> '+esc(t(next.titleKey))
          +'<div class="ot-verify-item-how" style="margin:4px 0 0">'+esc(t(next.howKey))+'</div></div>'
          +'<button type="button" class="control-btn" data-verify-act="next">'+esc(nextAction)+'</button>';
      }else{
        nextHost.hidden=false;
        nextHost.innerHTML='<div><strong>'+esc(t('debugVerifyAllDone'))+'</strong></div>';
      }
    }

    var html='';
    var lastGroup='';
    defs.forEach(function(d){
      if(d.group!==lastGroup){
        lastGroup=d.group;
        html+='<p class="ot-verify-group-title">'
          +esc(t(d.group==='proto'?'debugVerifyGroupProto':'debugVerifyGroupGate'))
          +'</p>';
      }
      var checked=!!state[d.id];
      var isCurrent=next&&next.id===d.id;
      var actionLabel=d.qc?t('debugVerifyDo'):t('debugVerifyOpen');
      var actionAttr=d.qc?('data-verify-qc="'+esc(d.qc)+'"'):('data-verify-panel="'+esc(d.panel||'')+'"');
      if(d.debugMode) actionAttr+=' data-verify-debug="'+esc(d.debugMode)+'"';
      html+='<div class="ot-verify-item'+(checked?' is-done':'')+(isCurrent?' is-current':'')+'" role="listitem" data-verify-id="'+esc(d.id)+'">'
        +'<input type="checkbox" '+(checked?'checked ':'')+'aria-label="'+esc(t(d.titleKey))+'" data-verify-check="'+esc(d.id)+'"/>'
        +'<div class="ot-verify-item-body">'
        +'<div class="ot-verify-item-title">'+esc(t(d.titleKey))+'</div>'
        +'<p class="ot-verify-item-how">'+esc(t(d.howKey))+'</p>'
        +(d.passKey?('<p class="ot-verify-item-pass"><strong>'+esc(t('debugVerifyPass'))+'：</strong>'+esc(t(d.passKey))+'</p>'):'')
        +'</div>'
        +'<button type="button" class="control-btn" '+actionAttr+'>'+esc(actionLabel)+'</button>'
        +'</div>';
    });
    host.innerHTML=html;

    if(next){
      var curEl=host.querySelector('[data-verify-id="'+next.id+'"]');
      if(curEl&&curEl.scrollIntoView){
        try{ curEl.scrollIntoView({block:'nearest'}); }catch(_){}
      }
    }

    if(!verifyChecklistBound){
      verifyChecklistBound=true;
      panel.addEventListener('change',function(e){
        var box=e.target&&e.target.closest&&e.target.closest('[data-verify-check]');
        if(!box) return;
        var id=box.getAttribute('data-verify-check');
        var st=loadVerifyState();
        if(box.checked) st[id]=true; else delete st[id];
        saveVerifyState(st);
        renderVerifyChecklist();
      });
      panel.addEventListener('click',function(e){
        var nextBtn=e.target.closest&&e.target.closest('[data-verify-act="next"]');
        if(nextBtn){
          runVerifyNext();
          return;
        }
        var reset=e.target.closest&&e.target.closest('[data-verify-act="reset"]');
        if(reset){
          saveVerifyState({});
          global.__otVerifySeen={paused:false,resumed:false,triggered:false,errored:false,refreshedLive:false};
          renderVerifyChecklist();
          return;
        }
        var copy=e.target.closest&&e.target.closest('[data-verify-act="copy"]');
        if(copy){
          copyVerifyProgress();
          return;
        }
        var qcBtn=e.target.closest&&e.target.closest('[data-verify-qc]');
        if(qcBtn){
          runVerifyQc(qcBtn.getAttribute('data-verify-qc'));
          return;
        }
        var openBtn=e.target.closest&&e.target.closest('[data-verify-panel]');
        if(openBtn){
          openVerifyPanel({
            panel:openBtn.getAttribute('data-verify-panel'),
            debugMode:openBtn.getAttribute('data-verify-debug')||null
          });
        }
      });
    }
  }

  function bindQuickControlLive(){
    if(global.__otDebugQuickCtrlBound) return;
    global.__otDebugQuickCtrlBound=true;
    try{
      global.addEventListener('ot:runtime-status',function(){
        scheduleQuickControlPanel(true);
        scheduleVerifyChecklist();
      });
      global.addEventListener('ot:record-ipc',function(){ scheduleQuickControlPanel(); });
    }catch(_){}
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
    var usageSnap=hooks().processUsageSnapshot||{};
    cards.push(card(usageSnap.loaded?'is-ok':'is-warn',t('debugCardUsage'),usageSnap.loaded?hooks().processUsageLine():t('voiceModeMetricLoading'),usage));
    cards.push(card(m&&m.enabled?'is-ok':'is-warn',t('debugCardScheme'),mappingName,m?(m.enabled?t('enabled')+' · ':'')+cLine:t('debugCardSchemeHint')));
    host.innerHTML=cards.join('');
  }
  function renderDebugDeveloperPanel(){
    bindQuickControlLive();
    // Defer quick panel paint so drawer chrome / subnav paint first (打开维护假死).
    scheduleQuickControlPanel();
    renderVerifyChecklist();
    renderDebugDeveloperSummary();
    renderInputExtSummary();
    const grid=$('devRuntimeGrid');
    if(grid){
      const m=hooks().selectedMapping&&hooks().selectedMapping();
      const w=hooks().voiceUiSnapshot.wake||{};
      const endSnap=hooks().voiceUiSnapshot.end||{};
      const eng=(w.engine==='vosk')?t('wakeEngineVosk'):(w.engine==='sapi')?t('wakeEngineSapi'):(w.engine==='kws')?t('wakeEngineKws'):t('wakeEngineOff');
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
        [t('debugDevLogCount'),String((hooks().logLines||[]).length)+' '+t('debugDevLogUnit')]
      ];
      grid.innerHTML=items.map(function(pair){
        return '<div class="dev-runtime-item"><div class="k">'+hooks().escHtml(pair[0])+'</div><div class="v">'+hooks().escHtml(pair[1])+'</div></div>';
      }).join('');
    }
    const lastKeyGrid=$('devLastKeyGrid');
    if(lastKeyGrid){
      const lastKeyFn=hooks().lastKeyDebug;
      const lastKey=typeof lastKeyFn==='function'?lastKeyFn():{};
      const keyItems=[
        [t('debugKeyLabel'),lastKey.key||'—'],
        [t('debugCodeLabel'),lastKey.code||'—'],
        [t('actionLabel'),runtime().lastAction||'—'],
        [t('sendLabel'),runtime().timerActive?t('debugDevTimerOn'):t('debugDevTimerOff')]
      ];
      lastKeyGrid.innerHTML=keyItems.map(function(pair){
        return '<div class="dev-runtime-item"><div class="k">'+hooks().escHtml(pair[0])+'</div><div class="v">'+hooks().escHtml(pair[1])+'</div></div>';
      }).join('');
    }
    const source=$('sourceExplain');
    if(source){
      const m=hooks().selectedMapping&&hooks().selectedMapping();
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
    if(rawLog){
      var lines=hooks().logLines||[];
      rawLog.textContent=lines.length?lines.join('\n'):t('waitLog');
    }
  }

  function renderDebugPanel(){
    renderDebugOverview();
    global.OneToneVoiceDiag.renderTabs();
    ['sapi','vosk','kws','end','usage'].forEach(global.OneToneVoiceDiag.renderMetrics);
    renderDebugDeveloperPanel();
  }
  global.OneToneDebugPanel={
    renderOverview:renderDebugOverview,
    renderOverviewActions:renderDebugOverviewActions,
    renderOverviewCards:renderDebugOverviewCards,
    renderDeveloper:renderDebugDeveloperPanel,
    renderQuickControl:renderQuickControlPanel,
    renderVerifyChecklist:renderVerifyChecklist,
    renderPanel:renderDebugPanel,
    buildDebugOverviewModel:buildDebugOverviewModel
  };
})((typeof window!=='undefined')?window:globalThis);
