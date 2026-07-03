(function(global){
  'use strict';
  var $=function(id){ return global.OneToneDom.$(id); };
  function hooks(){ return global.__vp_app_keyboard_hooks__ || {}; }
  function bindListeners(){
    var h=hooks();
    var ui=global.OneToneState.ui;
    var runtime=global.OneToneState.runtime;
    var t=h.t;
    document.addEventListener('keydown',function(e){
      if(e.key==='Escape'){
        var testOpen=$('testOverlay')&&$('testOverlay').classList.contains('open');
        if(testOpen){ e.preventDefault(); h.closeTestModal(); return; }
        var phraseOpen=$('phrasePracticeOverlay')&&$('phrasePracticeOverlay').classList.contains('open');
        if(phraseOpen&&global.OneTonePhrasePractice){ e.preventDefault(); global.OneTonePhrasePractice.close(); return; }
        var confirmOpen=$('confirmOverlay')&&$('confirmOverlay').classList.contains('open');
        if(confirmOpen){ e.preventDefault(); h.closeConfirmModal(false); return; }
        if(global.OneToneMappingRecordingInput.tryEscapeRecording(e)) return;
        if(h.onboardIsOpen()){ e.preventDefault(); h.closeWelcome(false); return; }
        if(h.welcomeOpen()){ h.closeWelcome(true); return; }
        if(ui.drawerOpen){ h.closeDrawer(); return; }
      }
      h.setLastKeyDebug({
        key:h.friendlyKeyName(e.key),
        code:h.friendlyKeyName(global.OneToneMappingRecordingInput.normalizeKeyFromCode(e.code, e.key)||e.code)
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
      global.OneToneMappingRecordingInput.handleKeyDown(e);
    },true);
    document.addEventListener('mousedown',function(e){
      global.OneToneMappingRecordingInput.handleMouseDown(e);
    },true);
    document.addEventListener('keyup',function(e){
      global.OneToneMappingRecordingInput.handleKeyUp(e);
    },true);
  }
  global.OneToneAppKeyboard={bindListeners:bindListeners};
})((typeof window!=='undefined')?window:globalThis);
