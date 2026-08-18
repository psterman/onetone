(function(global){
  'use strict';
  var $=function(id){ return global.OneToneDom.$(id); };
  function hooks(){ return global.__vp_app_keyboard_hooks__ || {}; }
  function recordingInput(){ return global.OneToneMappingRecordingInput; }
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
        if(rec&&rec.tryEscapeRecording&&rec.tryEscapeRecording(e)) return;
        if(h.onboardIsOpen()){ e.preventDefault(); h.closeWelcome(false); return; }
        if(h.welcomeOpen()){ h.closeWelcome(true); return; }
        if(ui.drawerOpen){ h.closeDrawer(); return; }
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
  global.OneToneAppKeyboard={bindListeners:bindListeners};
})((typeof window!=='undefined')?window:globalThis);
