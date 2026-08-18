(function(global){
  'use strict';
  var $=function(id){ return global.OneToneDom.$(id); };
  var t=function(key){ return global.OneToneI18n.t(key); };
  var STEPS=['wake','recognize','send'];
  var lastFlowVm=null;

  var FLOW_NODE_IDS={
    wake:{btn:'voiceFlowNodeWake',hint:'voiceFlowNodeWakeHint',head:'voiceSettingsWakeHead',body:'voiceSettingsWakeBody'},
    recognize:{btn:'voiceFlowNodeRecognize',hint:'voiceFlowNodeRecognizeHint',head:'voiceSettingsRecognizeHead',body:'voiceSettingsRecognizeBody'},
    send:{btn:'voiceFlowNodeSend',hint:'voiceFlowNodeSendHint',head:'voiceSettingsSendHead',body:'voiceSettingsSendBody'}
  };

  /** @type {WeakMap<Element, { step: string, bodies: Element[] }>} */
  var rootSync = typeof WeakMap!=='undefined' ? new WeakMap() : null;
  /** @type {WeakMap<Element, ReturnType<typeof createCtrl>>} */
  var bodyCtrls = typeof WeakMap!=='undefined' ? new WeakMap() : null;

  function flowRoot(){
    return $('voiceSettingsFlow');
  }

  function stepCard(step){
    var root=flowRoot();
    if(!root) return null;
    return root.querySelector('[data-voice-subpage="'+step+'"]');
  }

  function createCtrl(body){
    var PR=global.OneTonePanelReveal;
    if(PR&&PR.createPanelReveal) return PR.createPanelReveal(body);
    // Minimal fallback if panel-reveal missing.
    return {
      setOpenInstant:function(head,open){
        if(!body) return;
        body.hidden=!open;
        if(open){ body.removeAttribute('aria-hidden'); try{body.inert=false;}catch(_){ } }
        else { body.setAttribute('aria-hidden','true'); try{body.inert=true;}catch(_){ } }
        if(head) head.setAttribute('aria-expanded',open?'true':'false');
      },
      closeInstant:function(head,focusTarget){
        if(focusTarget&&focusTarget.focus&&body&&body.contains(global.document.activeElement)){
          try{ focusTarget.focus(); }catch(_){}
        }
        this.setOpenInstant(head,false);
      },
      openReveal:function(head){ this.setOpenInstant(head,true); },
      cancel:function(){}
    };
  }

  function ctrlFor(body){
    if(!body) return null;
    if(bodyCtrls){
      var existing=bodyCtrls.get(body);
      if(existing) return existing;
      var c=createCtrl(body);
      bodyCtrls.set(body,c);
      return c;
    }
    return createCtrl(body);
  }

  function collectBodies(){
    var list=[];
    STEPS.forEach(function(page){
      var meta=FLOW_NODE_IDS[page];
      var body=meta&&$(meta.body);
      if(body) list.push(body);
    });
    return list;
  }

  function bodiesChanged(prevBodies, nextBodies){
    if(!prevBodies||prevBodies.length!==nextBodies.length) return true;
    for(var i=0;i<nextBodies.length;i++){
      if(prevBodies[i]!==nextBodies[i]) return true;
    }
    return false;
  }

  function resolveStepHints(vm){
    var V=global.OneToneVoiceSettingsViewModel;
    if(!V||!vm) return {wake:'',recognize:'',send:''};
    var wakeHint='';
    if(!vm.loading){
      wakeHint=V.resolveScopeSummary(vm)||'';
    }else{
      wakeHint=t('homeLiveLoading');
    }
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

  function buildVoiceFlowChromeModel(vm){
    if(vm) lastFlowVm=vm;
    vm=vm||lastFlowVm||{};
    var step=global.OneToneVoicePageState&&global.OneToneVoicePageState.getStep
      ?global.OneToneVoicePageState.getStep()
      :'wake';
    var hints=resolveStepHints(vm);
    var sig=[step,hints.wake||'',hints.recognize||'',hints.send||''].join('\0');
    return {
      activeStep:step,
      wakeHint:hints.wake||'',
      recognizeHint:hints.recognize||'',
      sendHint:hints.send||'',
      sig:sig
    };
  }

  function applyVoiceFlowChromeHost(model){
    if(!model) model=buildVoiceFlowChromeModel();
    if(global.__otVoiceFlowChromeMounted&&typeof global.__otVoiceFlowChromeSync==='function'){
      global.__otVoiceFlowChromeSync();
      return;
    }
    STEPS.forEach(function(page){
      var meta=FLOW_NODE_IDS[page];
      if(!meta) return;
      var btn=$(meta.btn);
      if(btn){
        var on=page===model.activeStep;
        btn.classList.toggle('is-active',on);
        btn.setAttribute('aria-selected',on?'true':'false');
      }
      var hintEl=$(meta.hint);
      if(hintEl){
        var key=page+'Hint';
        hintEl.textContent=model[key]||'';
      }
    });
    var wake=$('voiceSubtabWakeHint');
    var rec=$('voiceSubtabRecognizeHint');
    var send=$('voiceSubtabSendHint');
    if(wake) wake.textContent=model.wakeHint||'';
    if(rec) rec.textContent=model.recognizeHint||'';
    if(send) send.textContent=model.sendHint||'';
  }

  function syncFlowNodes(step){
    var model=buildVoiceFlowChromeModel();
    if(step) model.activeStep=step;
    applyVoiceFlowChromeHost(model);
  }

  function syncActive(step){
    var root=flowRoot();
    var nextBodies=collectBodies();
    var prev=root&&rootSync?rootSync.get(root):null;
    var remount=!prev||bodiesChanged(prev.bodies, nextBodies);
    var prevStep=prev?prev.step:null;

    STEPS.forEach(function(page){
      var card=stepCard(page);
      var meta=FLOW_NODE_IDS[page];
      if(!card||!meta) return;
      var on=page===step;
      card.classList.toggle('is-active',on);
      var head=$(meta.head)||card.querySelector('.voice-step-card-head');
      var body=$(meta.body)||card.querySelector('.flow-step-body');
      if(head){
        head.setAttribute('aria-expanded',on?'true':'false');
        head.setAttribute('aria-selected',on?'true':'false');
      }
      if(!body) return;
      var ctrl=ctrlFor(body);
      if(!ctrl) return;

      if(remount){
        ctrl.setOpenInstant(head, on);
        return;
      }

      var wasOn=page===prevStep;
      if(on&&!wasOn){
        ctrl.openReveal(head);
      }else if(!on&&wasOn){
        ctrl.closeInstant(head, head);
      }else if(on&&body.hidden){
        ctrl.setOpenInstant(head, true);
      }else if(!on&&!body.hidden){
        ctrl.setOpenInstant(head, false);
      }
    });

    if(root&&rootSync){
      rootSync.set(root, { step:step, bodies:nextBodies });
    }
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
      if(e.target.closest('input,select,textarea,a,summary,details,[role="switch"],.voice-sapi-preset,.voice-segment-btn,.keys-trigger-mode-seg,.voice-output-mode-card,.voice-recognize-source-btn,.home-mini-toggle,.mic-device-card,.keys-summary-btn,.control-btn,.voice-fb-action-btn,.voice-mic-change-btn')){
        return;
      }
      var head=e.target.closest&&e.target.closest('.voice-step-card-head');
      if(!head) return;
      if(e.target.closest('button')&&e.target.closest('button')!==head) return;
      var card=head.closest('[data-voice-subpage]');
      if(!card) return;
      e.preventDefault();
      goToStep(card.getAttribute('data-voice-subpage')||'');
    });
    if(global.OneToneVoicePageState){
      syncActive(global.OneToneVoicePageState.getStep());
    }
  }

  function renderStepHints(vm){
    applyVoiceFlowChromeHost(buildVoiceFlowChromeModel(vm));
  }

  function render(vm){
    if(vm) lastFlowVm=vm;
    syncActive(global.OneToneVoicePageState?global.OneToneVoicePageState.getStep():'wake');
    renderStepHints(vm);
  }

  global.OneToneVoicePageNav={
    bind:bind,
    render:render,
    syncActive:syncActive,
    buildVoiceFlowChromeModel:buildVoiceFlowChromeModel
  };
})((typeof window!=='undefined')?window:globalThis);
