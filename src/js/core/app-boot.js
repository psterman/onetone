(function(global){
  'use strict';
  function h(){ return global.__vp_bootstrap_hooks__ || {}; }
  function run(){
    var hooks=h();
    var state=global.OneToneState.state;
    var t=hooks.t;
    var session=global.OneToneAppSession;
    if(session&&session.markBootStarted) session.markBootStarted(8000);
    var hasBootConfig=!!(state.config&&Array.isArray(state.config.mappings)&&state.config.mappings.length);
    hooks.markBoot('script init');
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
    if(session&&session.whenBootSettled){
      session.whenBootSettled(function(){
        hooks.markBoot('boot settled');
        if(!hooks.welcomeOpen()&&!hooks.onboardIsOpen()) hooks.maybeStartProcessUsagePoll();
        if(global.OneToneConfigPersist&&typeof global.OneToneConfigPersist.startConfigSyncPoll==='function'){
          global.OneToneConfigPersist.startConfigSyncPoll(3000,8);
        }
        if(global.OneToneConfigPersist&&typeof global.OneToneConfigPersist.flushDeferredMvpInitSideEffects==='function'){
          global.OneToneConfigPersist.flushDeferredMvpInitSideEffects();
        }
        if(global.OneToneVoiceEngineReadiness&&global.OneToneVoiceEngineReadiness.checkAfterBoot){
          global.OneToneVoiceEngineReadiness.checkAfterBoot();
        }
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
      if(global.OneToneConfigPersist&&typeof global.OneToneConfigPersist.pullBackendConfig==='function'){
        global.OneToneConfigPersist.pullBackendConfig();
      }
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
