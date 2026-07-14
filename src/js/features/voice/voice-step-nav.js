(function(global){
  'use strict';
  var $=function(id){ return global.OneToneDom.$(id); };
  var t=function(key){ return global.OneToneI18n.t(key); };
  var STEPS=['wake','recognize','send'];

  var FLOW_NODE_IDS={
    wake:{btn:'voiceFlowNodeWake',hint:'voiceFlowNodeWakeHint'},
    recognize:{btn:'voiceFlowNodeRecognize',hint:'voiceFlowNodeRecognizeHint'},
    send:{btn:'voiceFlowNodeSend',hint:'voiceFlowNodeSendHint'}
  };

  function flowRoot(){
    return $('voiceSettingsFlow');
  }

  function stepCard(step){
    var root=flowRoot();
    if(!root) return null;
    return root.querySelector('[data-voice-subpage="'+step+'"]');
  }

  function syncFlowNodes(step){
    STEPS.forEach(function(page){
      var meta=FLOW_NODE_IDS[page];
      if(!meta) return;
      var btn=$(meta.btn);
      if(btn){
        var on=page===step;
        btn.classList.toggle('is-active',on);
        btn.setAttribute('aria-pressed',on?'true':'false');
      }
    });
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
    syncFlowNodes(step);
  }

  function goToStep(page){
    if(STEPS.indexOf(page)<0) return;
    if(global.OneToneVoicePageState) global.OneToneVoicePageState.setStep(page);
  }

  function bindFlowNodes(){
    var nodes=$('voiceFlowNodes');
    if(!nodes||nodes.dataset.voiceFlowNodesBound==='1') return;
    nodes.dataset.voiceFlowNodesBound='1';
    nodes.addEventListener('click',function(e){
      var btn=e.target.closest&&e.target.closest('.flow-node-btn');
      if(!btn) return;
      var node=btn.closest('[data-voice-node]');
      if(!node) return;
      e.preventDefault();
      goToStep(node.getAttribute('data-voice-node')||'');
    });
    nodes.addEventListener('keydown',function(e){
      if(e.key!=='Enter'&&e.key!==' ') return;
      var btn=e.target.closest&&e.target.closest('.flow-node-btn');
      if(!btn) return;
      var node=btn.closest('[data-voice-node]');
      if(!node) return;
      e.preventDefault();
      goToStep(node.getAttribute('data-voice-node')||'');
    });
  }

  function bind(){
    bindFlowNodes();
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
      goToStep(card.getAttribute('data-voice-subpage')||'');
    });
    flow.addEventListener('keydown',function(e){
      if(e.key!=='Enter'&&e.key!==' ') return;
      var head=e.target.closest&&e.target.closest('.voice-step-card-head');
      if(!head) return;
      var card=head.closest('[data-voice-subpage]');
      if(!card||card.classList.contains('is-active-step')) return;
      e.preventDefault();
      goToStep(card.getAttribute('data-voice-subpage')||'');
    });
    if(global.OneToneVoicePageState){
      syncActive(global.OneToneVoicePageState.getStep());
    }
  }

  function resolveStepHints(vm){
    var V=global.OneToneVoiceSettingsViewModel;
    if(!V||!vm) return {wake:'',recognize:'',send:''};
    var wakeHint=vm.loading?t('homeLiveLoading'):V.resolveDisplayWakePhrase(vm).display;
    var wake=global.OneToneVoiceStepWake;
    if(!vm.loading&&wake&&wake.isScenarioVoiceEdit&&wake.isScenarioVoiceEdit()){
      var cmd=global.OneToneHabitScenarioVoiceCommand;
      if(cmd&&cmd.feedbackInfo){
        var info=cmd.feedbackInfo();
        if(info&&info.wakeHint) wakeHint=info.wakeHint;
      }
    }
    var recHint=vm.loading?t('homeLiveLoading'):vm.modeLabel;
    if(!vm.loading&&vm.mode==='vosk'&&global.OneToneVoiceWake&&global.OneToneVoiceWake.currentVoskPreset){
      var preset=global.OneToneVoiceWake.currentVoskPreset();
      var labelApi=global.OneToneVoiceModelLabels;
      if(labelApi&&labelApi.presetLabel) recHint+=' · '+labelApi.presetLabel(preset);
    }
    var sendHint=vm.loading?t('homeLiveLoading'):V.resolveOutputSummaryLabel(vm);
    return {wake:wakeHint,recognize:recHint,send:sendHint};
  }

  function renderStepHints(vm){
    var hints=resolveStepHints(vm);
    var wake=$('voiceSubtabWakeHint');
    var rec=$('voiceSubtabRecognizeHint');
    var send=$('voiceSubtabSendHint');
    if(wake) wake.textContent=hints.wake;
    if(rec) rec.textContent=hints.recognize;
    if(send) send.textContent=hints.send;
    STEPS.forEach(function(page){
      var meta=FLOW_NODE_IDS[page];
      if(!meta) return;
      var hintEl=$(meta.hint);
      if(hintEl) hintEl.textContent=hints[page]||'';
    });
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
