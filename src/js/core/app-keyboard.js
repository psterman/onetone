(function(global){
  'use strict';
  var $=function(id){ return global.OneToneDom.$(id); };
  function hooks(){ return global.__vp_app_keyboard_hooks__ || {}; }
  function recordingInput(){ return global.OneToneMappingRecordingInput; }

  /** Peel one UI layer (popover / sheet / picker). Do not jump home. */
  function tryDismissSecondaryUi(){
    try{
      var picker=global.OneToneKeysChannelCommandPicker;
      if(picker&&picker.isCapturePopoverOpen&&picker.isCapturePopoverOpen()){
        var closePop=picker.closeCapturePopover||picker.closeCaptureSheet;
        if(typeof closePop==='function'){
          closePop.call(picker,{ keepPanel:true });
          return true;
        }
      }
    }catch(_){}
    try{
      var tk=global.OneToneTargetKeyPicker;
      if(tk&&tk.isOpen&&tk.isOpen()&&typeof tk.close==='function'){
        tk.close();
        return true;
      }
    }catch(_){}
    try{
      var usage=global.OneToneHabitUsageSheet;
      if(usage){
        if(usage.isAllOpen&&usage.isAllOpen()&&typeof usage.closeAll==='function'){
          usage.closeAll();
          return true;
        }
        if(usage.isOpen&&usage.isOpen()&&typeof usage.close==='function'){
          usage.close();
          return true;
        }
      }
    }catch(_){}
    try{
      var peek=global.OneToneHabitHubSidePeek;
      var uiPeek=global.OneToneState&&global.OneToneState.ui;
      if(peek&&uiPeek&&uiPeek.habitHubPeekId&&typeof peek.close==='function'){
        peek.close();
        return true;
      }
    }catch(_){}
    try{
      var sap=global.OneToneSemanticActionPicker;
      if(sap&&sap.isOpen&&sap.isOpen()&&typeof sap.close==='function'){
        sap.close();
        return true;
      }
    }catch(_){}
    try{
      var cmdk=global.OneToneHomeWorkbenchCmdk;
      if(cmdk&&cmdk.isOpen&&cmdk.isOpen()){
        if(typeof cmdk.close==='function') cmdk.close();
        else if(typeof cmdk.setOpen==='function') cmdk.setOpen(false);
        return true;
      }
    }catch(_){}
    try{
      var scheme=global.OneToneHomeScheme;
      if(scheme&&scheme.isMenuOpen&&scheme.isMenuOpen()){
        if(global.OneToneHomeUiBindings&&global.OneToneHomeUiBindings.closeHomeSchemeMenu){
          global.OneToneHomeUiBindings.closeHomeSchemeMenu();
        }else if(scheme.closeMenu){
          scheme.closeMenu();
        }
        return true;
      }
    }catch(_){}
    try{
      var wb=global.OneToneHomeWorkbench;
      if(wb&&typeof wb.dismissEscLayer==='function'&&wb.dismissEscLayer()) return true;
    }catch(_){}
    return false;
  }

  function bindListeners(){
    var h=hooks();
    var ui=global.OneToneState.ui;
    var runtime=global.OneToneState.runtime;
    var t=h.t;
    function recMode(){
      var recState=global.OneToneMappingRecording;
      return recState&&typeof recState.mode==='function'?recState.mode():'none';
    }
    function probeWv(kind, key, note){
      if(recMode()==='none') return;
      var probe=global.OneToneRecordProbe;
      if(probe&&probe.push) probe.push('wv', kind, key, note);
    }
    document.addEventListener('keydown',function(e){
      var rec=recordingInput();
      if(!e.repeat) probeWv('keydown', e.key||'', e.code||'');
      if(e.key==='Escape'){
        var habitSetupOpen=$('habitSetupOverlay')&&$('habitSetupOverlay').classList.contains('open');
        if(habitSetupOpen&&global.OneToneQuickStart&&global.OneToneQuickStart.isOpen&&global.OneToneQuickStart.isOpen()
          &&global.OneToneQuickStart.handleEsc()){
          e.preventDefault();
          return;
        }
        if(habitSetupOpen&&global.OneToneHabitTriggerSetup&&global.OneToneHabitTriggerSetup.handleEsc()){
          e.preventDefault();
          return;
        }
        var testOpen=$('testOverlay')&&$('testOverlay').classList.contains('open');
        if(testOpen){ e.preventDefault(); h.closeTestModal(); return; }
        var phraseOpen=$('phrasePracticeOverlay')&&$('phrasePracticeOverlay').classList.contains('open');
        if(phraseOpen&&global.OneTonePhrasePractice){ e.preventDefault(); global.OneTonePhrasePractice.close(); return; }
        var confirmOpen=$('confirmOverlay')&&$('confirmOverlay').classList.contains('open');
        if(confirmOpen){ e.preventDefault(); h.closeConfirmModal(false); return; }
        // Cancel in-progress capture before any navigation.
        if(rec&&rec.tryEscapeRecording&&rec.tryEscapeRecording(e)) return;
        if(h.onboardIsOpen()){ e.preventDefault(); h.closeWelcome(false); return; }
        if(h.welcomeOpen()){ h.closeWelcome(true); return; }
        // Nested UI (popover / sheet / picker) — never jump to home on first Esc.
        if(tryDismissSecondaryUi()){ e.preventDefault(); return; }
        if(ui.drawerOpen){ e.preventDefault(); h.closeDrawer(); return; }
      }
      h.setLastKeyDebug({
        key:h.friendlyKeyName(e.key),
        code:h.friendlyKeyName((rec&&rec.normalizeKeyFromCode?rec.normalizeKeyFromCode(e.code,e.key):null)||e.code)
      });
      if(ui.drawerOpen&&ui.settingsPanel==='debug'&&global.OneToneVoiceDiag.getFocusMode()==='developer'){
        var lastKeyGrid=$('devLastKeyGrid');
        if(lastKeyGrid){
          var keyItems=[
            [t('debugKeyLabel'),h.lastKeyDebug().key||'—'],
            [t('debugCodeLabel'),h.lastKeyDebug().code||'—'],
            [t('actionLabel'),runtime.lastAction||'—'],
            [t('sendLabel'),runtime.timerActive?t('debugDevTimerOn'):t('debugDevTimerOff')]
          ];
          lastKeyGrid.innerHTML=keyItems.map(function(pair){
            return '<div class="dev-runtime-item"><div class="k">'+h.escHtml(pair[0])+'</div><div class="v">'+h.escHtml(pair[1])+'</div></div>';
          }).join('');
        }
      }
      h.pushLog(new Date().toLocaleTimeString()+' key='+h.lastKeyDebug().key+' code='+h.lastKeyDebug().code);
      if(rec&&rec.handleKeyDown) rec.handleKeyDown(e);
    },true);
    function isSideMouseButton(e){
      return !!(e&&(e.button===3||e.button===4));
    }
    // XButton2 == Browser Forward in Chromium/WebView2. Must cancel default on EVERY
    // mouse/pointer phase (not only auxclick) or history.forward swallows X2 while X1 works.
    function killSideButtonBrowserNav(e){
      if(!isSideMouseButton(e)) return false;
      try{ e.preventDefault(); }catch(_){}
      try{ e.stopPropagation(); }catch(_){}
      try{ if(e.stopImmediatePropagation) e.stopImmediatePropagation(); }catch(_){}
      return true;
    }
    function routeSideMouse(e){
      var rec=recordingInput();
      var side=isSideMouseButton(e);
      if(side) killSideButtonBrowserNav(e);
      // A single XButton press can emit several WebView2 DOM events. Record
      // only one down edge to prevent duplicate/unstable commits.
      var type=String(e&&e.type||'');
      if(type!=='mousedown'&&type!=='pointerdown') return;
      var now=Date.now();
      var dedupe=global.__oneToneSideButtonDomDedupe||(global.__oneToneSideButtonDomDedupe={});
      var dk=String(e&&e.button!=null?e.button:'');
      if(dedupe[dk]&&now-dedupe[dk]<120) return;
      dedupe[dk]=now;
      // Map DOM button → XButton* so 录制检测 shows the runtime key, not raw button3.
      var mapped='';
      try{
        if(e.button===3) mapped='XButton1';
        else if(e.button===4) mapped='XButton2';
      }catch(_){}
      probeWv(
        e.type||'mouse',
        mapped||('button'+(e.button!=null?e.button:'?')),
        mapped?('button'+(e.button!=null?e.button:'?')+' '+(e.pointerType||'')):(e.pointerType||'')
      );
      var recState=global.OneToneMappingRecording;
      var pending=!!(recState&&recState.isPending&&recState.isPending());
      var live=recMode()!=='none'||pending;
      // Left-click during capture is noise — tip so「页面收到、前端未发备份」is not a mystery.
      if(!mapped&&live&&e.button===0){
        var probeL=global.OneToneRecordProbe;
        if(probeL&&probeL.push){
          probeL.push('fe','skip','button0','left-click ignored — press XButton1/2 with cursor over OneTone');
        }
      }
      // X1/X2: prefer direct capture. handleMouseDown used to early-return (cancel-bar
      // hit-test / UI throw) and leave probe stuck at「页面收到、前端未发备份」.
      if(mapped&&rec&&typeof rec.captureSideButton==='function'&&live){
        try{
          if(rec.captureSideButton(mapped)) return;
        }catch(err){
          var probe=global.OneToneRecordProbe;
          if(probe&&probe.push) probe.push('fe','ipc-warn',mapped,'captureSideButton: '+String(err&&err.message||err||''));
        }
      }
      if(!rec||!rec.handleMouseDown) return;
      rec.handleMouseDown(e);
    }
    document.addEventListener('mousedown',routeSideMouse,true);
    // WebView2 often skips mousedown for X1/X2; auxclick/pointerdown/up still fire.
    function routeSideButton(e){
      if(!killSideButtonBrowserNav(e)) return;
      routeSideMouse(e);
    }
    document.addEventListener('auxclick',routeSideButton,true);
    document.addEventListener('pointerdown',routeSideButton,true);
    document.addEventListener('mouseup',routeSideButton,true);
    document.addEventListener('pointerup',routeSideButton,true);
    // Belt: if WebView2 still queues history for X2, eat popstate while capturing.
    window.addEventListener('popstate',function(e){
      var recState=global.OneToneMappingRecording;
      var live=(recState&&typeof recState.mode==='function'&&recState.mode()!=='none')
        ||(recState&&recState.isPending&&recState.isPending());
      if(!live) return;
      try{ e.preventDefault(); }catch(_){}
      try{
        var probe=global.OneToneRecordProbe;
        if(probe&&probe.push) probe.push('fe','skip','XButton2','blocked history popstate (Browser Forward)');
      }catch(_){}
    },true);
    document.addEventListener('keyup',function(e){
      var rec=recordingInput();
      probeWv('keyup', e.key||'', e.code||'');
      if(rec&&rec.handleKeyUp) rec.handleKeyUp(e);
    },true);
  }
  global.OneToneAppKeyboard={
    bindListeners:bindListeners,
    tryDismissSecondaryUi:tryDismissSecondaryUi
  };
})((typeof window!=='undefined')?window:globalThis);
