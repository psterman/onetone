(function(global){
  'use strict';
  var $=function(id){ return global.OneToneDom.$(id); };
  var t=function(key){ return global.OneToneI18n.t(key); };
  var STEPS=['wake','recognize','send'];

  function syncActive(step){
    var bar=$('voiceSubtabBar');
    if(!bar) return;
    bar.querySelectorAll('[data-voice-subpage]').forEach(function(btn){
      var page=btn.getAttribute('data-voice-subpage');
      var on=page===step;
      btn.classList.toggle('is-active',on);
      btn.setAttribute('aria-selected',on?'true':'false');
    });
  }

  function bind(){
    var bar=$('voiceSubtabBar');
    if(!bar||bar.dataset.voiceNavBound==='1') return;
    bar.dataset.voiceNavBound='1';
    bar.addEventListener('click',function(e){
      var btn=e.target.closest&&e.target.closest('[data-voice-subpage]');
      if(!btn) return;
      e.preventDefault();
      var page=btn.getAttribute('data-voice-subpage');
      if(page==='resources'){
        if(global.OneToneSettingsDrawer&&global.OneToneSettingsDrawer.setPanel){
          global.OneToneSettingsDrawer.setPanel('models');
        }
        return;
      }
      if(STEPS.indexOf(page)>=0&&global.OneToneVoicePageState){
        global.OneToneVoicePageState.setStep(page);
      }
    });
    if(global.OneToneVoicePageState){
      syncActive(global.OneToneVoicePageState.getStep());
    }
  }

  function renderStepHints(vm){
    var V=global.OneToneVoiceSettingsViewModel;
    if(!V||!vm) return;
    var wake=$('voiceSubtabWakeHint');
    var rec=$('voiceSubtabRecognizeHint');
    var send=$('voiceSubtabSendHint');
    if(wake) wake.textContent=vm.loading?t('homeLiveLoading'):V.resolveDisplayWakePhrase(vm).display;
    if(rec) rec.textContent=vm.loading?t('homeLiveLoading'):vm.modeLabel;
    if(send) send.textContent=vm.loading?t('homeLiveLoading'):V.resolveOutputSummaryLabel(vm);
  }

  function render(vm){
    syncActive(global.OneToneVoicePageState?global.OneToneVoicePageState.getStep():'wake');
    renderStepHints(vm);
  }

  global.OneToneVoicePageNav={
    bind:bind,
    render:render,
    syncActive:syncActive
  };
})((typeof window!=='undefined')?window:globalThis);
