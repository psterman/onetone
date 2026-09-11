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
    function routeSideMouse(e){
      var rec=recordingInput();
      probeWv(e.type||'mouse', 'button'+(e.button!=null?e.button:'?'), e.pointerType||'');
      if(!rec||!rec.handleMouseDown) return;
      rec.handleMouseDown(e);
    }
    document.addEventListener('mousedown',routeSideMouse,true);
    // WebView2 often skips mousedown for X1/X2; auxclick/pointerdown/up still fire.
    // XButton2 is Browser Forward — preventDefault so history navigation cannot eat it.
    function routeSideButton(e){
      if(e.button!==3&&e.button!==4) return;
      e.preventDefault();
      e.stopPropagation();
      routeSideMouse(e);
    }
    document.addEventListener('auxclick',routeSideButton,true);
    document.addEventListener('pointerdown',routeSideButton,true);
    document.addEventListener('mouseup',routeSideButton,true);
    document.addEventListener('pointerup',routeSideButton,true);
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
