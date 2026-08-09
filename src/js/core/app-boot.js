(function(global){
  'use strict';
  function h(){ return global.__vp_bootstrap_hooks__ || {}; }
  // #region agent log
  // Console-only: cmd_app_log+fetch under voiceWake poll flooded IPC → UI_HB_STALL_5S.
  function agentDbg(hypothesisId, location, message, data){
    try{
      if(typeof console!=='undefined'&&console.debug){
        console.debug('[dbg-b5]',hypothesisId,location,message,data||{});
      }
    }catch(_){}
  }
  global.__dbgB5=agentDbg;
  // Sparse voiceWake keepalive — proves idle survival without dbg flood.
  // 3min: 60s disk append under large runtime-live.log + AV coincided with late stalls.
  setInterval(function(){
    try{
      var ui=global.OneToneState&&global.OneToneState.ui;
      if(!(ui&&ui.drawerOpen&&ui.settingsPanel==='voiceWake')) return;
      if(!(global.OneToneIpc&&global.OneToneIpc.invoke)) return;
      global.OneToneIpc.invoke('cmd_app_log',{
        line:'fe voiceWake idle hb seq='+((global.OneToneUiHeartbeat&&global.OneToneUiHeartbeat.lastSeq)||0)
          +' tag='+(global.__otActivityTag||'')
      }).catch(function(){});
    }catch(_){}
  },180000);
  // #endregion
  function run(){
    var hooks=h();
    var state=global.OneToneState.state;
    var t=hooks.t;
    var session=global.OneToneAppSession;
    if(session&&session.markBootStarted) session.markBootStarted(8000);
    var hasBootConfig=!!(state.config&&Array.isArray(state.config.mappings)&&state.config.mappings.length);
    hooks.markBoot('script init');
    // #region agent log
    agentDbg('E','app-boot.js:scriptInit','boot script init',{hasBootConfig:!!hasBootConfig,feBuild:'stall19'});
    // #endregion
    // Soft Pad float is always-on-top; dismiss on cold start so home stays clickable
    // while FG settles (front-mode used to cover the launching window → 假死).
    try{
      var ipcBoot=global.OneToneIpc;
      if(ipcBoot&&typeof ipcBoot.invoke==='function'){
        ipcBoot.invoke('cmd_codex_micro_overlay_dismiss',{}).catch(function(){});
      }
    }catch(_){}
    if(window.OneToneLocaleDefaults) window.OneToneLocaleDefaults.applyUiLocaleBootstrap();
    if(window.OneTonePhrasePractice) window.OneTonePhrasePractice.init();
    if(window.OneToneOnboarding) window.OneToneOnboarding.init();
    if(window.OneToneImePresets) window.OneToneImePresets.init();
    if(window.OneToneAppTargetPresets) window.OneToneAppTargetPresets.init();
    try{
      var savedTheme=localStorage.getItem('vp_theme');
      var savedLang=localStorage.getItem('vp_lang');
      var savedFontScale=localStorage.getItem('vp_font_scale');
      var dismissedUpdate=localStorage.getItem('vp_update_dismissed_version');
      state.firstSuccess=hooks.isFirstSuccessDone();
      if(savedTheme==='dark'||savedTheme==='light') hooks.setTheme(savedTheme);
      if(savedLang==='zh'||savedLang==='en') hooks.setAppLang(savedLang);
      if(savedFontScale&&hooks.fontScaleValues()[savedFontScale]) hooks.setFontScale(savedFontScale);
      if(window.OneToneOnboarding&&window.OneToneOnboarding.shouldAutoOpen()) hooks.setWelcomeOpen(true);
      if(dismissedUpdate) global.OneToneUpdate.loadDismissedVersion(dismissedUpdate);
    }catch(_){}
    hooks.markBoot('local preferences loaded');
    if(!hasBootConfig) state.config=hooks.defaultConfig();
    if(!state.update) state.update=hooks.defaultUpdateState();
    hooks.ensureConfig();
    if(global.OneToneConfigPersist&&typeof global.OneToneConfigPersist.flushPendingMvpInit==='function'){
      global.OneToneConfigPersist.flushPendingMvpInit();
      hooks.ensureConfig();
    }
    hooks.syncEditorFromSelection();
    hooks.markBoot('default config prepared');
    hooks.markBoot('applyLang bootstrap begin');
    hooks.applyLang(true,{bootstrap:true});
    hooks.markBoot('applyLang bootstrap complete');
    requestAnimationFrame(function(){
      hooks.markBoot('first raf begin');
      hooks.renderHome();
      hooks.markBoot('renderHome complete');
      if(hooks.welcomeOpen()) hooks.openWelcome();
      if(hooks.welcomeOpen()) hooks.markBoot('welcome opened');
      hooks.scheduleLangBootstrap();
      hooks.markBoot('first raf complete');
    });
    hooks.markBoot('setRecording begin');
    hooks.setRecording('none',{silent:true});
    hooks.markBoot('setRecording complete');
    hooks.pushLog(t('waitLog'));
    hooks.deferProcessUsagePoll();
    // Permanent UI heartbeat: Atomic ping only (cmd_ui_heartbeat). Rust watchdog logs stalls
    // when FE is permanently stuck — do NOT use cmd_app_log here.
    (function(){
      var seq=0;
      var lastLocal=Date.now();
      function activityTag(){
        try{
          if(global.__otActivityTag) return String(global.__otActivityTag);
        }catch(_){}
        return '';
      }
      global.OneToneUiHeartbeat={
        activityTag:activityTag,
        lastLocalGapMs:0,
        lastSeq:0,
        lastPingAt:lastLocal,
        setTag:function(tag){
          try{ global.__otActivityTag=String(tag||''); }catch(_){}
          // Push tag now — waiting for the 200ms HB left stalls with empty ACTIVITY_TAG.
          try{
            if(global.OneToneIpc&&global.OneToneIpc.invoke){
              global.OneToneIpc.invoke('cmd_ui_heartbeat',{
                seq:(global.OneToneUiHeartbeat&&global.OneToneUiHeartbeat.lastSeq)||0,
                activityTag:String(tag||''),
                frontendTime:Date.now()
              }).catch(function(){});
            }
          }catch(_){}
        },
        clearTag:function(expectedTag){
          try{
            if(arguments.length>0){
              if(String(global.__otActivityTag||'')!==String(expectedTag||'')) return;
            }
            global.__otActivityTag='';
            if(global.OneToneIpc&&global.OneToneIpc.invoke){
              global.OneToneIpc.invoke('cmd_ui_heartbeat',{
                seq:(global.OneToneUiHeartbeat&&global.OneToneUiHeartbeat.lastSeq)||0,
                activityTag:'',
                frontendTime:Date.now()
              }).catch(function(){});
            }
          }catch(_){}
        },
        logLocalLag:function(lagMs,tag){
          var msg='ui heartbeat lag '+Math.round(lagMs)+'ms';
          if(tag) msg+=' tag='+tag;
          try{ console.warn('[onetone] '+msg); }catch(_){}
          try{
            if(global.OneToneAppLog&&typeof global.OneToneAppLog.frontendLog==='function'){
              global.OneToneAppLog.frontendLog(msg);
            }
          }catch(_){}
        }
      };
      setInterval(function(){
        var now=Date.now();
        var gap=now-lastLocal;
        lastLocal=now;
        seq=(seq+1)>>>0;
        try{
          global.OneToneUiHeartbeat.lastLocalGapMs=gap;
          global.OneToneUiHeartbeat.lastSeq=seq;
          global.OneToneUiHeartbeat.lastPingAt=now;
        }catch(_){}
        if(gap>500){
          try{ console.warn('[onetone] UI-BLOCK local gap='+gap+'ms tag='+activityTag()); }catch(_){}
          // voiceWake: skip hang-spike DOM churn — engines parked, panel poll off.
          var skipSpike=false;
          try{
            var uiHb=global.OneToneState&&global.OneToneState.ui;
            if(uiHb&&uiHb.drawerOpen&&uiHb.settingsPanel==='voiceWake') skipSpike=true;
          }catch(_){}
          if(!skipSpike){
            try{
              if(global.OneToneVoiceDiag&&typeof global.OneToneVoiceDiag.noteHangSpike==='function'){
                global.OneToneVoiceDiag.noteHangSpike({
                  gapMs:gap,
                  tag:activityTag(),
                  seq:seq,
                  source:'fe_hb'
                });
              }
            }catch(_){}
          }
        }
        if(!global.OneToneIpc||!global.OneToneIpc.invoke) return;
        try{
          global.OneToneIpc.invoke('cmd_ui_heartbeat',{
            seq:seq,
            activityTag:activityTag(),
            frontendTime:now
          }).catch(function(){});
        }catch(_){}
      },200);
    })();

    // Expand hang live panel ASAP (before boot settle) so假死 during settle is visible.
    try{
      if(global.OneToneVoiceDiag&&typeof global.OneToneVoiceDiag.startLiveHangDiag==='function'){
        global.OneToneVoiceDiag.startLiveHangDiag();
      }
    }catch(_){}

    if(session&&session.whenBootSettled){
      session.whenBootSettled(function(){
        hooks.markBoot('boot settled');
        // #region agent log
        agentDbg('A','app-boot.js:bootSettled','boot settled callback',{welcome:!!hooks.welcomeOpen(),onboard:!!hooks.onboardIsOpen()});
        // #endregion
        if(!hooks.welcomeOpen()&&!hooks.onboardIsOpen()) hooks.maybeStartProcessUsagePoll();
        if(global.OneToneConfigPersist&&typeof global.OneToneConfigPersist.startConfigSyncPoll==='function'){
          global.OneToneConfigPersist.startConfigSyncPoll(3000,8);
        }
        if(global.OneToneConfigPersist&&typeof global.OneToneConfigPersist.suppressUnknownSave==='function'){
          global.OneToneConfigPersist.suppressUnknownSave(2000);
        }
        // Stagger heavy remount off the settle tick — sync flush + camera reconcile
        // used to 假死 ~5s right after "boot settled" (ui_hb seq~49, howto 无法点).
        // Camera cold-start waits another ~2.5s inside flush (see __otBootCameraCold).
        setTimeout(function(){
          try{
            if(global.OneToneConfigPersist&&typeof global.OneToneConfigPersist.flushDeferredMvpInitSideEffects==='function'){
              global.OneToneConfigPersist.flushDeferredMvpInitSideEffects();
            }
          }catch(err){
            try{ console.error('boot settled flush',err); }catch(_){}
          }
        },120);
        setTimeout(function(){
          try{
            if(global.OneToneVoiceEngineReadiness&&global.OneToneVoiceEngineReadiness.checkAfterBoot){
              global.OneToneVoiceEngineReadiness.checkAfterBoot();
            }
          }catch(err){
            try{ console.error('boot settled voice check',err); }catch(_){}
          }
        },400);
        // Hang viz: expand live panel + pin main with the app body (debug假死 session).
        setTimeout(function(){
          try{
            if(global.OneToneVoiceDiag&&typeof global.OneToneVoiceDiag.startLiveHangDiag==='function'){
              global.OneToneVoiceDiag.startLiveHangDiag();
            }
          }catch(err){
            try{ console.error('boot hang diag',err); }catch(_){}
          }
        },80);
      });
    }
    setTimeout(function(){ hooks.markBoot('requestBackendConfig begin'); hooks.requestBackendConfig(8); }, 200);
    setTimeout(function(){ hooks.markBoot('fallbackConfigLoaded begin'); hooks.fallbackConfigLoaded(); }, 3500);
    installRuntimeRefreshOnFocus();
  }

  var lastRuntimeRefreshAt=0;
  function installRuntimeRefreshOnFocus(){
    window.addEventListener('focus',function(){
      var now=Date.now();
      if(now-lastRuntimeRefreshAt<800) return;
      lastRuntimeRefreshAt=now;
      if(global.OneToneAppSession&&global.OneToneAppSession.isBootSettling&&global.OneToneAppSession.isBootSettling()) return;
      if(!global.OneToneIpc||!global.OneToneIpc.invoke) return;
      // Do NOT pullBackendConfig/cmd_ready here — identical mvp_init remounts MediaPipe
      // + home on every click-to-focus and 假死's the UI. Runtime snapshot is enough;
      // disk/config changes arrive via mvp_init / mvp_saved / watcher.
      global.OneToneIpc.invoke('cmd_request_runtime',{}).then(function(snapshot){
        if(snapshot&&snapshot.type==='mvp_runtime_snapshot'&&global.__vp_dispatch_to_js__){
          global.__vp_dispatch_to_js__(snapshot);
        }
      }).catch(function(err){
        console.error('request runtime on focus',err);
      });
    });
  }
  global.OneToneAppBoot={run:run};
})((typeof window!=='undefined')?window:globalThis);
