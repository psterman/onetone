(function(global){
  'use strict';
  var $=function(id){ return global.OneToneDom.$(id); };
  var t=function(key){ return global.OneToneI18n.t(key); };
  var STEPS=['wake','recognize','send'];

  function flowRoot(){
    return $('voiceSettingsFlow');
  }

  function stepCard(step){
    var root=flowRoot();
    if(!root) return null;
    return root.querySelector('[data-voice-subpage="'+step+'"]');
  }

  function syncActive(step){
    STEPS.forEach(function(page){
      var card=stepCard(page);
      if(!card) return;
      var on=page===step;
      card.classList.toggle('is-active',on);
      card.setAttribute('aria-expanded',on?'true':'false');
      var head=card.querySelector('.voice-step-card-head');
      if(head) head.setAttribute('aria-selected',on?'true':'false');
    });
  }

  function bind(){
    var flow=flowRoot();
    if(!flow||flow.dataset.voiceNavBound==='1') return;
    flow.dataset.voiceNavBound='1';
    flow.addEventListener('click',function(e){
      if(e.target.closest('button,input,select,textarea,a,summary,details,[role="switch"],.voice-sapi-preset,.voice-segment-btn,.keys-trigger-mode-seg,.voice-recognize-source-btn,.home-mini-toggle,.mic-device-card,.keys-summary-btn,.control-btn,.voice-fb-action-btn,.voice-mic-change-btn')){
        return;
      }
      var head=e.target.closest&&e.target.closest('.voice-step-card-head');
      var card=head?head.closest('[data-voice-subpage]'):(e.target.closest&&e.target.closest('[data-voice-subpage]'));
      if(!card||card.classList.contains('is-active-step')) return;
      e.preventDefault();
      var page=card.getAttribute('data-voice-subpage');
      if(STEPS.indexOf(page)>=0&&global.OneToneVoicePageState){
        global.OneToneVoicePageState.setStep(page);
      }
    });
    flow.addEventListener('keydown',function(e){
      if(e.key!=='Enter'&&e.key!==' ') return;
      var head=e.target.closest&&e.target.closest('.voice-step-card-head');
      if(!head) return;
      var card=head.closest('[data-voice-subpage]');
      if(!card||card.classList.contains('is-active-step')) return;
      e.preventDefault();
      var page=card.getAttribute('data-voice-subpage');
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
    if(rec){
      var recHint=vm.loading?t('homeLiveLoading'):vm.modeLabel;
      if(!vm.loading&&vm.mode==='vosk'&&global.OneToneVoiceWake&&global.OneToneVoiceWake.currentVoskPreset){
        var preset=global.OneToneVoiceWake.currentVoskPreset();
        recHint+=' · '+(preset==='en-light'?'small-en-us':'small-cn');
      }
      rec.textContent=recHint;
    }
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
