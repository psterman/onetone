(function(global){
  'use strict';

  var $=function(id){ return global.OneToneDom.$(id); };
  var t=function(key){ return global.OneToneI18n.t(key); };
  function notifySetupInteractionActive(active){
    try{
      if(global.OneToneIpc&&global.OneToneIpc.invoke){
        global.OneToneIpc.invoke('cmd_set_setup_interaction_active',{active:!!active}).then(function(){
          if(global.OneToneApp&&global.OneToneApp.pushLog){
            global.OneToneApp.pushLog('[setup] interaction active='+(active?'1':'0'));
          }
        }).catch(function(err){
          if(global.OneToneApp&&global.OneToneApp.pushLog){
            global.OneToneApp.pushLog('[setup] set_setup_interaction_active failed: '+String(err&&err.message||err));
          }
        });
      }
    }catch(_){}
  }

  function setVoicePracticeHoldFg(on){
    try{
      if(global.OneToneIpc&&global.OneToneIpc.invoke){
        global.OneToneIpc.invoke('cmd_voice_set_practice_hold_fg',{enabled:!!on}).catch(function(err){
          if(global.OneToneApp&&global.OneToneApp.pushLog){
            global.OneToneApp.pushLog('[setup] practice_hold_fg failed: '+String(err&&err.message||err));
          }
        });
      }
    }catch(_){}
  }
  var bound=false;
  var pollTimer=0;
  var gateDeviceFbTimer=0;
  var gateDeviceFbIdx=-1;
  var voiceMicSoftSkipTimer=0;
  var VOICE_MIC_SOFT_SKIP_MS=1400;
  var voicePracticeStageTimer=0;
  var voicePracticeStagePhase='idle';
  var voicePracticeDictationTimer=0;
  var voicePracticeEndArmedAt=0;
  var voicePracticeInputUserEdited=false;
  var voicePracticeInputBound=false;
  var GATE_DEVICE_KEYS=['habitSetupTriggerDevRing','habitSetupTriggerDevMouse','habitSetupTriggerDevRemote','habitSetupTriggerDevPad'];
  var mappingPausedForSetup=false;
  var mappingEnabledBeforePause=null;
  var WAKE_PRESET_OPTIONS=['开始输入','开始听写','打开听写','语音输入','开启输入'];
  var RISKY_KEYS={LButton:1,RButton:1,MButton:1,Escape:1,Esc:1,Space:1};
  var WIZARD_STEPS_LEGACY=[
    { id:1, labelKey:'habitSetupStepActivation' },
    { id:2, labelKey:'habitSetupStepTrigger' },
    { id:3, labelKey:'habitSetupStepMode' },
    { id:4, labelKey:'habitSetupStepVoiceEaster' }
  ];
  var WIZARD_STEPS_QS=[
    { id:1, labelKey:'habitSetupStepActivation' },
    { id:2, labelKey:'habitSetupStepTrigger' },
    { id:4, labelKey:'habitSetupStepVoiceFlow' }
  ];
  function wizardSteps(){
    return (setupState&&setupState.qsMode)?WIZARD_STEPS_QS:WIZARD_STEPS_LEGACY;
  }
  var WIZARD_STEPS=WIZARD_STEPS_LEGACY;
  function isVoiceOnlyActivation(){
    if(!setupState) return false;
    var m=mappingById(setupState.mappingId);
    return !!(m&&m.voiceOverride&&Array.isArray(m.voiceOverride.wakePhrases)&&m.voiceOverride.wakePhrases.length);
  }

  function imePresets(){
    return global.OneToneImePresets&&global.OneToneImePresets.presets
      ?global.OneToneImePresets.presets
      :[];
  }

  function imePresetById(id){
    return global.OneToneImePresets&&global.OneToneImePresets.presetById
      ?global.OneToneImePresets.presetById(id)
      :null;
  }

  function activationTargetKey(){
    if(!setupState) return '';
    var preview=getActivationPreviewKey();
    if(preview) return preview;
    var m=mappingById(setupState.mappingId);
    return m&&String(m.targetKey||'').trim()||'';
  }

  function getActivationPreviewKey(){
    if(!setupState) return '';
    var preview=String(setupState.recordPreviewKey||'').trim();
    if(preview) return preview;
    var m=mappingById(setupState.mappingId);
    return m&&String(m.targetKey||'').trim()||'';
  }

  function getVoiceEndPhrases(){
    var st=global.OneToneState&&global.OneToneState.state;
    var cfg=st&&st.config?st.config:null;
    var end=cfg&&(cfg.voiceEnd||cfg.voice_end)||{};
    var lang=global.OneToneApp&&global.OneToneApp.getLang?global.OneToneApp.getLang():'zh';
    var list=lang==='en'?(end.phrasesEn||[]):(end.phrasesZh||[]);
    if(!Array.isArray(list)||!list.length){
      list=lang==='en'?['end dictation','send it']:['结束输入','发出去'];
    }
    return list.filter(Boolean);
  }

  var CANCEL_PRESET_OPTIONS=['取消输入','不要了','cancel input','never mind'];

  function getVoiceCancelPhrases(){
    var st=global.OneToneState&&global.OneToneState.state;
    var cfg=st&&st.config?st.config:null;
    var end=cfg&&(cfg.voiceEnd||cfg.voice_end)||{};
    var lang=global.OneToneApp&&global.OneToneApp.getLang?global.OneToneApp.getLang():'zh';
    var list=lang==='en'?(end.cancelPhrasesEn||end.cancel_phrases_en||[]):(end.cancelPhrasesZh||end.cancel_phrases_zh||[]);
    if(!Array.isArray(list)||!list.length){
      list=lang==='en'?['cancel input','never mind']:['取消输入','不要了'];
    }
    return list.filter(Boolean);
  }

  function getWakePhrases(){
    var m=setupState?mappingById(setupState.mappingId):null;
    var ov=m&&m.voiceOverride?m.voiceOverride:null;
    if(ov&&Array.isArray(ov.wakePhrases)&&ov.wakePhrases.length) return ov.wakePhrases.slice();
    if(setupState&&setupState.wakePhraseDraft) return [setupState.wakePhraseDraft];
    return WAKE_PRESET_OPTIONS.slice(0,1);
  }

  function logVerify(msg){
    if(global.OneToneApp&&global.OneToneApp.pushLog){
      global.OneToneApp.pushLog('[verify] '+String(msg||''));
    }
  }

  function clearEmbeddedTriggerTest(opts){
    opts=opts||{};
    logVerify('clear embedded trigger test skipStop='+(opts.skipStop?'1':'0'));
    if(triggerTestListener&&global.OneToneApp&&global.OneToneApp.off){
      global.OneToneApp.off('trigger_test_fired',triggerTestListener);
    }
    triggerTestListener=null;
    clearTimeout(triggerTestTimeout);
    triggerTestTimeout=0;
    if(setupState) setupState.triggerTestListening=false;
    if(!opts.skipStop) stopTriggerVerifyListen();
  }

  function stopTriggerVerifyListen(){
    if(!triggerVerifyBackendActive) return;
    logVerify('stop backend verify listen');
    triggerVerifyBackendActive=false;
    invokeCompatProbe('cmd_stop_trigger_verify_listen',{});
  }

  function startTriggerVerifyListen(opts){
    opts=opts||{};
    if(!setupState||!setupState.mappingId) return Promise.resolve({ok:false,reason:'no_mapping'});
    if(opts.skipIfActive&&triggerVerifyBackendActive){
      logVerify('start backend verify skipped active=1');
      return Promise.resolve({ok:true});
    }
    logVerify('start backend verify mapping='+String(setupState.mappingId||''));
    triggerVerifyBackendActive=true;
    return invokeCompatProbe('cmd_start_trigger_verify_listen',{mappingId:setupState.mappingId}).then(function(res){
      logVerify('start backend verify result ok='+(res&&res.ok?'1':'0')+' reason='+String(res&&res.reason||''));
      if(!res||res.ok===false) triggerVerifyBackendActive=false;
      return res||{ok:false};
    });
  }

  function armTriggerVerifyListener(){
    logVerify('arm frontend verify listener');
    if(triggerTestListener&&global.OneToneApp&&global.OneToneApp.off){
      global.OneToneApp.off('trigger_test_fired',triggerTestListener);
    }
    triggerTestListener=function(msg){
      if(!setupState||String(msg&&msg.mappingId||'')!==String(setupState.mappingId||'')) return;
      logVerify('trigger_test_fired received source='+(msg&&msg.sourceKey?msg.sourceKey:''));
      clearEmbeddedTriggerTest();
      setupState.triggerTestPassed=true;
      setupState.page=2;
      bumpMaxReached(3);
      renderTriggerKeyboard();
      renderTriggerTestPanels();
      flashTriggerBindingDemo();
    };
    if(global.OneToneApp&&global.OneToneApp.on){
      global.OneToneApp.on('trigger_test_fired',triggerTestListener);
    }
    clearTimeout(triggerTestTimeout);
    triggerTestTimeout=setTimeout(function(){
      if(!setupState||setupState.triggerTestPassed) return;
      clearEmbeddedTriggerTest();
      renderTriggerTestPanels();
    },15000);
  }

  function restartTriggerVerifyListenOnly(){
    if(!setupState) return;
    logVerify('restart verify listener frontend-only');
    setupState.triggerTestListening=true;
    armTriggerVerifyListener();
    renderTriggerTestPanels();
  }

  function clearStep2VoicePractice(){
    if(global.OneTonePhrasePractice&&global.OneTonePhrasePractice.isOpen&&global.OneTonePhrasePractice.isOpen()){
      global.OneTonePhrasePractice.close({silent:true});
    }
    var host=$('habitSetupStep2VoiceHost');
    if(host) host.innerHTML='';
    step2VoicePracticeOpen=false;
  }

  function clearVoiceLessonPractice(){
    if(global.OneTonePhrasePractice&&global.OneTonePhrasePractice.isOpen&&global.OneTonePhrasePractice.isOpen()){
      global.OneTonePhrasePractice.close({silent:true});
    }
    if(voicePracticeDictationTimer){
      clearInterval(voicePracticeDictationTimer);
      voicePracticeDictationTimer=0;
    }
    var host=$('habitSetupVoiceLessonDemoHost');
    if(host){
      host.innerHTML='';
      host.hidden=true;
    }
    var mount=$('habitSetupVoicePracticeMount');
    if(mount) mount.innerHTML='';
  }

  function clearVoicePracticeStageTimer(){
    if(voicePracticeStageTimer){
      clearTimeout(voicePracticeStageTimer);
      voicePracticeStageTimer=0;
    }
  }

  function setVoicePracticeStageChrome(on){
    if(standalonePracticeOpen){
      var stageOnly=$('habitSetupVoicePracticeStage');
      if(stageOnly){
        stageOnly.hidden=!on;
        stageOnly.classList.toggle('is-global-overlay',!!on);
      }
      return;
    }
    var view=$('habitSetupVoiceLessonView');
    if(view) view.classList.toggle('is-practice-stage',!!on);
    var stage=$('habitSetupVoicePracticeStage');
    if(stage) stage.hidden=!on;
    var lessons=$('habitSetupVoiceLessons');
    if(lessons) lessons.hidden=!!on;
    var demo=$('habitSetupVoiceLessonDemoHost');
    if(demo&&on){ demo.hidden=true; demo.innerHTML=''; }
    var badge=$('habitSetupVoiceLessonBadge');
    var title=$('habitSetupVoiceLessonTitle');
    var desc=$('habitSetupVoiceLessonDesc');
    if(badge) badge.hidden=!!on;
    if(title) title.hidden=!!on;
    if(desc) desc.hidden=!!on;
    var foot=view?view.querySelector('.habit-setup-actions--footer'):null;
    if(foot) foot.hidden=!!on;
  }

  function ensureVoicePracticeInputBound(){
    if(voicePracticeInputBound) return;
    var input=$('habitSetupVoicePracticeInput');
    if(!input) return;
    voicePracticeInputBound=true;
    input.addEventListener('input',function(){
      voicePracticeInputUserEdited=true;
      stopVoicePracticeDictationAnim();
    });
  }

  function resetVoicePracticeStageUi(){
    var field=$('habitSetupVoicePracticeField');
    var input=$('habitSetupVoicePracticeInput');
    var coach=$('habitSetupVoicePracticeCoach');
    var success=$('habitSetupVoicePracticeSuccess');
    voicePracticeInputUserEdited=false;
    if(field){
      field.hidden=false;
      field.classList.remove('is-dictating','is-success');
    }
    if(input){
      input.value='';
      input.placeholder=t('qsVoicePracticeInputPlaceholder');
    }
    if(coach){
      coach.hidden=true;
      coach.textContent='';
      coach.classList.remove('is-in');
    }
    if(success) success.hidden=true;
  }

  function stopVoicePracticeDictationAnim(){
    if(voicePracticeDictationTimer){
      clearInterval(voicePracticeDictationTimer);
      voicePracticeDictationTimer=0;
    }
  }

  // Keep practice field focused for system IME; do not write ASR into the box.
  function startVoicePracticeLiveDictation(opts){
    opts=opts||{};
    stopVoicePracticeDictationAnim();
    ensureVoicePracticeInputBound();
    var input=$('habitSetupVoicePracticeInput');
    var field=$('habitSetupVoicePracticeField');
    if(field) field.classList.add('is-dictating');
    if(input){
      if(opts.clear!==false&&!voicePracticeInputUserEdited) input.value='';
      try{ input.focus(); }catch(_){}
    }
    voicePracticeDictationTimer=setInterval(function(){
      if(voicePracticeStagePhase!=='dictating'&&voicePracticeStagePhase!=='listeningEnd'){
        stopVoicePracticeDictationAnim();
      }
    },800);
  }

  function activateVoicePracticeIme(){
    var input=$('habitSetupVoicePracticeInput');
    if(input){
      try{ input.focus(); }catch(_){}
    }
    if(!(global.OneToneIpc&&typeof global.OneToneIpc.invoke==='function')) return;
    global.OneToneIpc.invoke('cmd_voice_practice_activate_ime',{}).catch(function(err){
      try{ console.warn('[practice] activate_ime', err); }catch(_){}
    });
  }

  function showVoicePracticeCoach(msg){
    var coach=$('habitSetupVoicePracticeCoach');
    if(!coach) return;
    coach.hidden=false;
    coach.textContent=msg;
    coach.classList.remove('is-in');
    void coach.offsetWidth;
    coach.classList.add('is-in');
  }

  function clearVoicePracticeMount(){
    var mount=$('habitSetupVoicePracticeMount');
    if(mount) mount.innerHTML='';
  }

  // Wake only: embedded PhrasePractice on the stage (ASR preview stays in mount, not the IME box).
  function bindVoicePracticeStageListening(mode){
    if(mode==='end'){
      bindVoicePracticeEndModal();
      return;
    }
    var mount=$('habitSetupVoicePracticeMount');
    if(!mount||!global.OneTonePhrasePractice||!global.OneTonePhrasePractice.open) return;
    var phrases=getWakePhrases();
    var options=WAKE_PRESET_OPTIONS.slice();
    // Stage title/desc already explain; skip duplicate long hint in embed.
    global.OneTonePhrasePractice.open({
      embedded:true,
      mount:'#habitSetupVoicePracticeMount',
      mode:'wake',
      phrases:phrases,
      phraseOptions:options,
      multiSelect:false,
      hintText:'',
      onMatch:function(){
        onVoicePracticeWakeMatched();
      },
      onSkip:function(){
        /* stay on stage unless user hits back — skip is unused in embedded shell */
      }
    });
  }

  // End passphrase: modal only when user enters the end lesson (not after wake).
  function bindVoicePracticeEndModal(){
    if(!global.OneTonePhrasePractice||!global.OneTonePhrasePractice.open) return;
    clearVoicePracticeMount();
    var phrases=getVoiceEndPhrases();
    var options=getVoiceEndPhrases();
    var hint=t('qsVoicePracticeHintEnd')||t('phrasePracticeHintEnd');
    global.OneTonePhrasePractice.open({
      embedded:false,
      mode:'end',
      phrases:phrases,
      phraseOptions:options,
      multiSelect:false,
      hintText:hint,
      onMatch:function(){
        if(Date.now()<voicePracticeEndArmedAt){
          bindVoicePracticeEndModal();
          return;
        }
        onVoicePracticeEndMatched();
      },
      onSkip:function(){
        /* stay on end stage; user can mark done or back out */
      }
    });
  }

  function qsVoiceDualPanelGuideText(){
    var wakeDone=!!(setupState&&setupState.voiceLessons&&setupState.voiceLessons.wake);
    var endDone=!!(setupState&&setupState.voiceLessons&&setupState.voiceLessons.end);
    if(wakeDone&&endDone){
      return t('qsVoicePanelGuideAllDone')||t('qsVoicePanelGuide');
    }
    if(wakeDone||endDone){
      return t('qsVoicePanelGuidePartial')||t('qsVoicePanelGuide');
    }
    return t('qsVoicePanelGuide');
  }

  function onVoicePracticeWakeMatched(){
    if(!setupState||setupState.page!==4) return;
    if(voicePracticeStagePhase!=='listeningWake') return;
    notifySetupInteractionActive(true);
    if(!setupState.voiceLessons) setupState.voiceLessons={wake:false,end:false,cancel:false};
    setupState.voiceLessons.wake=true;
    setupState.activeVoiceLesson='end';
    // Verify IME activate on this page, then return to dual panels — do not open end modal.
    voicePracticeInputUserEdited=false;
    startVoicePracticeLiveDictation({clear:true});
    activateVoicePracticeIme();
    voicePracticeStagePhase='success';
    stopVoicePracticeDictationAnim();
    if(global.OneTonePhrasePractice&&global.OneTonePhrasePractice.close){
      global.OneTonePhrasePractice.close({silent:true});
    }
    clearVoicePracticeMount();
    var field=$('habitSetupVoicePracticeField');
    if(field){
      field.hidden=false;
      field.classList.remove('is-dictating');
      field.classList.add('is-success');
    }
    showVoicePracticeCoach(t('qsVoicePracticeCoachWakeDone'));
    if($('habitSetupVoicePracticeTitle')) $('habitSetupVoicePracticeTitle').textContent=t('qsVoicePracticeTitleWakeDone');
    if($('habitSetupVoicePracticeDesc')) $('habitSetupVoicePracticeDesc').textContent=t('qsVoicePracticeDescWakeDone');
    var success=$('habitSetupVoicePracticeSuccess');
    var successText=$('habitSetupVoicePracticeSuccessText');
    if(successText) successText.textContent=t('qsVoicePracticeWakeSuccess');
    if(success) success.hidden=false;
    if(global.OneToneApp&&global.OneToneApp.toast){
      global.OneToneApp.toast(t('qsVoicePracticeWakeSuccessToast'));
    }
    clearVoicePracticeStageTimer();
    voicePracticeStageTimer=setTimeout(function(){
      voicePracticeStageTimer=0;
      exitVoicePracticeStage({keepLessons:true});
    },1200);
    renderWizardFooters();
  }

  function onVoicePracticeEndMatched(){
    if(!setupState||setupState.page!==4) return;
    if(voicePracticeStagePhase!=='listeningEnd'&&voicePracticeStagePhase!=='dictating') return;
    voicePracticeStagePhase='success';
    stopVoicePracticeDictationAnim();
    if(!setupState.voiceLessons) setupState.voiceLessons={wake:false,end:false,cancel:false};
    // Only mark end when user intentionally practiced the end lesson.
    setupState.voiceLessons.end=true;
    var field=$('habitSetupVoicePracticeField');
    if(field){
      field.classList.remove('is-dictating');
      field.classList.add('is-success');
    }
    var coach=$('habitSetupVoicePracticeCoach');
    if(coach) coach.hidden=true;
    var success=$('habitSetupVoicePracticeSuccess');
    var successText=$('habitSetupVoicePracticeSuccessText');
    if(successText) successText.textContent=t('qsVoicePracticeSuccess');
    if(success) success.hidden=false;
    if(global.OneTonePhrasePractice&&global.OneTonePhrasePractice.close){
      global.OneTonePhrasePractice.close({silent:true});
    }
    clearVoicePracticeStageTimer();
    voicePracticeStageTimer=setTimeout(function(){
      voicePracticeStageTimer=0;
      exitVoicePracticeStage({keepLessons:true});
    },1100);
    renderWizardFooters();
  }

  function exitVoicePracticeStage(opts){
    opts=opts||{};
    if(standalonePracticeOpen){
      exitStandaloneQsVoicePractice(opts);
      return;
    }
    setVoicePracticeHoldFg(false);
    clearVoicePracticeStageTimer();
    stopVoicePracticeDictationAnim();
    clearVoiceLessonPractice();
    voicePracticeStagePhase='idle';
    resetVoicePracticeStageUi();
    setVoicePracticeStageChrome(false);
    if(setupState){
      if(!opts.keepLessons){
        /* leave lesson flags as-is when cancelled mid-way */
      }
      setupState.activeVoiceLesson=qsNextVoiceLessonId()||'';
    }
    renderVoiceLessonPage();
  }

  function exitStandaloneQsVoicePractice(opts){
    opts=opts||{};
    standalonePracticeOpen=false;
    standalonePracticeOnSuccess=null;
    setVoicePracticeHoldFg(false);
    notifySetupInteractionActive(false);
    clearVoicePracticeStageTimer();
    stopVoicePracticeDictationAnim();
    clearVoiceLessonPractice();
    voicePracticeStagePhase='idle';
    resetVoicePracticeStageUi();
    setVoicePracticeStageChrome(false);
    var mark=$('btnHabitSetupVoicePracticeMarkDone');
    if(mark) mark.hidden=false;
  }

  function openStandaloneQsVoicePractice(opts){
    opts=opts||{};
    if(standalonePracticeOpen) return;
    standalonePracticeOpen=true;
    standalonePracticeOnSuccess=typeof opts.onSuccess==='function'?opts.onSuccess:null;
    notifySetupInteractionActive(true);
    setVoicePracticeHoldFg(true);
    clearVoicePracticeStageTimer();
    stopVoicePracticeDictationAnim();
    clearVoiceLessonPractice();
    resetVoicePracticeStageUi();
    ensureVoicePracticeInputBound();
    setVoicePracticeStageChrome(true);
    voicePracticeStagePhase='dictating';
    if($('habitSetupVoicePracticeBadge')) $('habitSetupVoicePracticeBadge').textContent=t('voiceTab2PracticeBadge','试说');
    if($('habitSetupVoicePracticeTitle')) $('habitSetupVoicePracticeTitle').textContent=t('voiceTab2PracticeTitle','按住试说');
    if($('habitSetupVoicePracticeDesc')) $('habitSetupVoicePracticeDesc').textContent=t('voiceTab2PracticeDesc','请用系统语音输入法往下方练习框说话');
    if($('habitSetupVoicePracticeFieldLbl')) $('habitSetupVoicePracticeFieldLbl').textContent=t('qsVoicePracticeFieldLbl');
    if($('btnHabitSetupVoicePracticeBack')) $('btnHabitSetupVoicePracticeBack').textContent=t('qsVoicePracticeBack');
    var mark=$('btnHabitSetupVoicePracticeMarkDone');
    if(mark) mark.hidden=true;
    var field=$('habitSetupVoicePracticeField');
    if(field) field.hidden=false;
    showVoicePracticeCoach(t('voiceTab2PracticeCoach','已激活本页语音输入法，请对着练习框说话'));
    startVoicePracticeLiveDictation({clear:true});
    activateVoicePracticeIme();
    var input=$('habitSetupVoicePracticeInput');
    if(input&&!input.dataset.tab2Bound){
      input.dataset.tab2Bound='1';
      input.addEventListener('input',function(){
        if(!standalonePracticeOpen) return;
        if(String(input.value||'').trim().length>0){
          if(standalonePracticeOnSuccess){
            try{ standalonePracticeOnSuccess(); }catch(_){}
            standalonePracticeOnSuccess=null;
          }
          if(global.OneToneVoiceTab2Mvp&&global.OneToneVoiceTab2Mvp.clearLastFailureHint){
            global.OneToneVoiceTab2Mvp.clearLastFailureHint();
          }
        }
      });
    }
  }

  function enterVoicePracticeStage(lessonId){
    if(!setupState||setupState.page!==4||!setupState.qsMode) return;
    if(setupState.voiceMicGate!=='ready') return;
    stopQsVoiceDemoTick();
    notifySetupInteractionActive(true);
    setVoicePracticeHoldFg(true);
    lessonId=String(lessonId||'').trim();
    if(lessonId!=='wake'&&lessonId!=='end') lessonId=qsNextVoiceLessonId()||'wake';
    // Free pick: either card may open practice without wake-first lock.
    clearVoicePracticeStageTimer();
    stopVoicePracticeDictationAnim();
    clearVoiceLessonPractice();
    setupState.activeVoiceLesson=lessonId;
    syncQsVoicePanels();
    resetVoicePracticeStageUi();
    ensureVoicePracticeInputBound();
    setVoicePracticeStageChrome(true);

    var startEnd=lessonId==='end';
    voicePracticeStagePhase=startEnd?'listeningEnd':'listeningWake';
    if($('habitSetupVoicePracticeBadge')) $('habitSetupVoicePracticeBadge').textContent=t('habitSetupStepVoiceFlow')||t('habitSetupStepVoiceEnd');
    if($('habitSetupVoicePracticeTitle')){
      $('habitSetupVoicePracticeTitle').textContent=startEnd
        ?t('qsVoicePracticeTitleEnd')
        :t('qsVoicePracticeTitleWake');
    }
    if($('habitSetupVoicePracticeDesc')){
      $('habitSetupVoicePracticeDesc').textContent=startEnd
        ?t('qsVoicePracticeDescEnd')
        :t('qsVoicePracticeDescWake');
    }
    if($('habitSetupVoicePracticeFieldLbl')) $('habitSetupVoicePracticeFieldLbl').textContent=t('qsVoicePracticeFieldLbl');
    if($('btnHabitSetupVoicePracticeBack')) $('btnHabitSetupVoicePracticeBack').textContent=t('qsVoicePracticeBack');
    if($('btnHabitSetupVoicePracticeMarkDone')) $('btnHabitSetupVoicePracticeMarkDone').textContent=t('habitSetupVoiceLessonMarkDone');
    var field=$('habitSetupVoicePracticeField');
    if(startEnd){
      if(field) field.hidden=false;
      showVoicePracticeCoach(t('qsVoicePracticeCoachEndOnly'));
      startVoicePracticeLiveDictation({clear:true});
      activateVoicePracticeIme();
      voicePracticeEndArmedAt=Date.now()+800;
      bindVoicePracticeEndModal();
    }else{
      // Wake listen: IME box stays hidden; PhrasePractice mount is the sole mid-stack.
      if(field) field.hidden=true;
      voicePracticeEndArmedAt=0;
      bindVoicePracticeStageListening('wake');
    }
    renderWizardFooters();
  }

  function markVoicePracticeStageDoneManual(){
    if(!setupState||setupState.page!==4) return;
    if(!setupState.voiceLessons) setupState.voiceLessons={wake:false,end:false,cancel:false};
    // Manual mark only completes the current lesson — never auto-chain wake→end.
    if(voicePracticeStagePhase==='listeningWake'){
      setupState.voiceLessons.wake=true;
      setupState.activeVoiceLesson='end';
      if(global.OneToneApp&&global.OneToneApp.toast){
        global.OneToneApp.toast(t('qsVoicePracticeWakeSuccessToast'));
      }
      exitVoicePracticeStage({keepLessons:true});
      return;
    }
    if(voicePracticeStagePhase==='listeningEnd'||voicePracticeStagePhase==='dictating'){
      setupState.voiceLessons.end=true;
      exitVoicePracticeStage({keepLessons:true});
      return;
    }
    exitVoicePracticeStage({keepLessons:true});
  }
  var triggerTestListener=null;
  var triggerTestTimeout=0;
  var triggerVerifyBackendActive=false;
  var step2VoicePracticeOpen=false;
  var standalonePracticeOpen=false;
  var standalonePracticeOnSuccess=null;
  var setupState=null;
  var overlayStack=[];

  function invokeCompatProbe(cmd,args){
    var ipc=global.OneToneIpc;
    var invoke=ipc&&typeof ipc.invoke==='function'?ipc.invoke.bind(ipc):global.__vp_invoke__;
    if(!invoke) return Promise.resolve({ok:false,reason:'invoke_unavailable'});
    return invoke(cmd,args||{}).catch(function(err){
      if(global.OneToneApp&&global.OneToneApp.pushLog){
        global.OneToneApp.pushLog('[compat] invoke failed: '+String(cmd)+' '+String(err&&err.message||err));
      }
      return {ok:false,reason:'invoke_failed'};
    });
  }

  function stopModeCompatProbe(){
    invokeCompatProbe('cmd_stop_trigger_compat_probe',{});
    if(setupState){
      setupState.modeCompatListening=false;
    }
  }

  function clearSetupNativeListeners(){
    clearEmbeddedTriggerTest();
    stopModeCompatProbe();
  }

  function startModeCompatProbe(){
    if(!setupState||setupState.page!==3) return;
    var m=mappingById(setupState.mappingId);
    if(!m||!triggerPreview(m)) return;
    stopModeCompatProbe();
    setupState.modeCompatListening=true;
    setupState.modeCompatTested=false;
    setupState.modeCompatResult=null;
    setupState.modeCompatHeard='';
    setupState.modeCompatStartFailed=false;
    setupState.modeCompatStartReason='';
    setupState.modeCompatPickHint=false;
    if(global.OneToneMappingEditActions&&global.OneToneMappingEditActions.setMappingEnabled){
      global.OneToneMappingEditActions.setMappingEnabled(setupState.mappingId,true);
    }else{
      m.enabled=true;
    }
    saveConfig();
    invokeCompatProbe('cmd_start_trigger_compat_probe',{mappingId:setupState.mappingId}).then(function(res){
      if(!setupState) return;
      var ok=!!(res&&res.ok);
      setupState.modeCompatStartReason=ok?'':String(res&&res.reason||'start_failed');
      setupState.modeCompatListening=ok;
      setupState.modeCompatStartFailed=!ok;
      renderModeCompatPanel();
      renderModeSection();
      renderWizardFooters();
    });
    renderModeCompatPanel();
    renderModeSection();
  }

  function modeCompatViableModes(){
    if(!setupState||!setupState.modeCompatResult) return null;
    var list=setupState.modeCompatResult.viableModes;
    return Array.isArray(list)?list.map(function(x){ return String(x||'').trim(); }).filter(Boolean):null;
  }

  function modeCompatRiskText(){
    if(!setupState||!setupState.modeCompatResult) return '';
    var risk=String(setupState.modeCompatResult.risk||'none');
    if(risk==='left_mouse') return t('habitSetupModeCompatRiskLeftMouse');
    if(risk==='scroll_wheel') return t('habitSetupModeCompatRiskScroll');
    if(risk==='vendor_macro') return t('habitSetupModeCompatRiskVendorMacro');
    return '';
  }

  function renderModeCompatPanel(){
    var panel=$('habitSetupModeCompatPanel');
    var title=$('habitSetupModeCompatTitle');
    var status=$('habitSetupModeCompatStatus');
    var retry=$('btnHabitSetupModeCompatRetry');
    if(!panel||!status||!setupState||setupState.page!==3){
      if(panel) panel.hidden=true;
      return;
    }
    panel.hidden=false;
    if(title) title.textContent=t('habitSetupModeCompatTitle');
    if(retry){
      retry.textContent=t('habitSetupModeCompatRetry');
      retry.hidden=!!setupState.modeCompatListening;
    }
    var m=mappingById(setupState.mappingId);
    var trigLabel=friendlyKey(triggerPreview(m)||'')||'—';
    var result=setupState.modeCompatResult;
    if(setupState.modeCompatStartFailed){
      panel.classList.remove('is-ok');
      panel.classList.add('is-warn');
      var failKey='habitSetupModeCompatStartFailed';
      var failReason=String(setupState.modeCompatStartReason||'');
      if(failReason==='empty_bindings') failKey='habitSetupModeCompatStartEmptyBindings';
      else if(failReason==='mapping_not_found') failKey='habitSetupModeCompatStartMappingMissing';
      status.innerHTML='<span class="habit-setup-status-dot is-wait" aria-hidden="true"></span>'
        +esc(t(failKey));
      if(retry) retry.hidden=false;
      return;
    }
    if(setupState.modeCompatListening&&!result){
      panel.classList.remove('is-ok','is-warn');
      var heard=String(setupState.modeCompatHeard||'');
      var waitText=heard
        ?t('habitSetupModeCompatHeard')
        :t('habitSetupModeCompatWaiting').replace('{key}',trigLabel);
      var pickHint=setupState.modeCompatPickHint
        ?('<br><span class="habit-setup-mode-compat-sub">'+esc(t('habitSetupModeCompatPickHint'))+'</span>')
        :'';
      status.innerHTML='<span class="habit-setup-status-dot is-wait" aria-hidden="true"></span>'
        +esc(waitText)+pickHint;
      return;
    }
    if(!result){
      panel.classList.remove('is-ok','is-warn');
      status.innerHTML='<span class="habit-setup-status-dot is-wait" aria-hidden="true"></span>'
        +esc(t('habitSetupModeCompatWaiting').replace('{key}',trigLabel));
      return;
    }
    var verdict=String(result.verdict||'');
    var main='';
    if(verdict==='hold_capable') main=t('habitSetupModeCompatHoldOk');
    else if(verdict==='pulse_only') main=t('habitSetupModeCompatPulseOnly');
    else main=t('habitSetupModeCompatUnrecognized');
    var risk=modeCompatRiskText();
    panel.classList.toggle('is-ok',verdict==='hold_capable'||verdict==='pulse_only');
    panel.classList.toggle('is-warn',verdict==='unrecognized');
    status.innerHTML='<span class="habit-setup-status-dot '+(verdict==='unrecognized'?'is-wait':'is-ok')+'" aria-hidden="true"></span>'
      +esc(main)+(risk?('<br><span class="habit-setup-mode-risk">'+esc(risk)+'</span>'):'');
    if(retry) retry.hidden=false;
  }

  function renderModeMismatch(){
    var el=$('habitSetupModeMismatch');
    if(!el||!setupState||setupState.page!==3){
      if(el){ el.hidden=true; el.textContent=''; }
      return;
    }
    var viable=modeCompatViableModes();
    var selected=setupState.triggerMode||'tap';
    if(!setupState.modeCompatTested||!viable||!viable.length){
      el.hidden=true;
      el.textContent='';
      return;
    }
    if(viable.indexOf(selected)>=0){
      el.hidden=true;
      el.textContent='';
      return;
    }
    el.hidden=false;
    el.textContent=selected==='hold'?t('habitSetupModeCompatMismatchHold'):'';
  }

  function onModeCompatResult(msg){
    if(!setupState||setupState.page!==3) return;
    if(String(msg&&msg.mappingId||'')!==String(setupState.mappingId||'')) return;
    setupState.modeCompatListening=false;
    setupState.modeCompatTested=true;
    var result=msg?Object.assign({},msg):null;
    if(result){
      var nv=global.OneToneHomeWorkbenchCompat&&global.OneToneHomeWorkbenchCompat.normalizeVerdict
        ?global.OneToneHomeWorkbenchCompat.normalizeVerdict(result.verdict)
        :String(result.verdict||'');
      result.verdict=nv;
      if(setupState.mappingId&&global.OneToneHomeWorkbenchCompat&&global.OneToneHomeWorkbenchCompat.store){
        global.OneToneHomeWorkbenchCompat.store(setupState.mappingId,result);
      }
    }
    setupState.modeCompatResult=result;
    setupState.modeCompatHeard='';
    setupState.modeCompatPickHint=false;
    var recommended=String(result&&result.recommendedMode||'').trim();
    // Soft-deprecate hold: never auto-select hold even when recommended; prefer tap.
    if(recommended==='hold'){
      setupState.triggerMode='tap';
    }else if(recommended==='tap'||recommended==='double'){
      setupState.triggerMode=recommended;
    }
    renderModeCompatPanel();
    renderModeSection();
    renderWizardFooters();
  }

  function onModeCompatSeen(msg){
    if(!setupState||setupState.page!==3) return;
    if(String(msg&&msg.mappingId||'')!==String(setupState.mappingId||'')) return;
    setupState.modeCompatHeard=String(msg&&msg.phase||'keydown');
    renderModeCompatPanel();
  }

  function esc(s){
    return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  function overlayEl(){ return $('habitSetupOverlay'); }

  function pushOverlay(layer){
    if(overlayStack.indexOf(layer)<0) overlayStack.push(layer);
  }

  function popOverlay(layer){
    if(!layer){
      overlayStack.pop();
      return;
    }
    overlayStack=overlayStack.filter(function(x){ return x!==layer; });
  }

  function ensureGlobalMapping(){
    var st=global.OneToneState&&global.OneToneState.state?global.OneToneState.state:null;
    if(!st||!st.config) return null;
    var cfg=st.config;
    cfg.mappings=Array.isArray(cfg.mappings)?cfg.mappings:[];
    var diff=global.OneToneHabitOverrideDiff;
    var core=global.OneToneMappingCore;
    if(diff&&diff.ensureGlobalBaselineMapping){
      var ensured=diff.ensureGlobalBaselineMapping(cfg,core);
      if(ensured&&ensured.mapping) return ensured.mapping;
    }
    if(cfg.mappings.length){
      var activeId=String(cfg.activeSceneId||'').trim();
      var active=activeId?cfg.mappings.find(function(x){ return x&&x.id===activeId; }):null;
      return active||cfg.mappings[0]||null;
    }
    var id=(global.OneToneMappingCore&&global.OneToneMappingCore.newMappingId)
      ?global.OneToneMappingCore.newMappingId()
      :('m-'+Date.now()+'-'+Math.random().toString(36).slice(2,7));
    var m={
      id:id,label:'',group:t('homeV9HabitsTitle')||'默认',triggerKey:'',targetKey:'',
      enabled:true,order:0,triggerMode:'tap',intervalMs:cfg.intervalMs||1200,
      enterDelayMs:cfg.enterDelayMs||5000,cancelEnabled:cfg.cancelEnabled!==false,
      autoEnterEnabled:cfg.autoEnterEnabled!==false,switchKeys:[],nativeKeyRestore:false,
      imePresetId:'',appTargetId:'',appBehaviorRules:[]
    };
    cfg.mappings.push(m);
    cfg.activeSceneId=id;
    st.selectedMappingId=id;
    return m;
  }

  function mappingById(id){
    var st=global.OneToneState&&global.OneToneState.state;
    if(!st||!st.config||!Array.isArray(st.config.mappings)) return null;
    return st.config.mappings.find(function(x){ return x&&x.id===id; })||null;
  }

  function recordingHooks(){
    return global.__vp_mapping_recording_hooks__||{};
  }

  function isAllowedTriggerKey(key){
    var raw=String(key||'').trim();
    if(!raw) return false;
    var hooks=recordingHooks();
    if(hooks&&typeof hooks.isAllowedTriggerKey==='function'){
      return !!hooks.isAllowedTriggerKey(raw);
    }
    if(global.OneToneAppKeyUtils&&typeof global.OneToneAppKeyUtils.isAllowedTriggerKey==='function'){
      return !!global.OneToneAppKeyUtils.isAllowedTriggerKey(raw);
    }
    return true;
  }

  function isAllowedTargetKey(key){
    var raw=String(key||'').trim();
    if(!raw) return false;
    var hooks=recordingHooks();
    if(hooks&&typeof hooks.isAllowedTargetKey==='function'){
      return !!hooks.isAllowedTargetKey(raw);
    }
    if(global.OneToneAppKeyUtils&&typeof global.OneToneAppKeyUtils.isAllowedTargetKey==='function'){
      return !!global.OneToneAppKeyUtils.isAllowedTargetKey(raw);
    }
    return true;
  }

  function saveConfig(source){
    if(global.OneToneConfigPersist&&global.OneToneConfigPersist.save){
      global.OneToneConfigPersist.save({source:source||((setupState&&setupState.qsMode)?'quickStart':'mapping')});
    }
  }

  function refreshUi(){
    if(global.OneToneHomeV9&&global.OneToneHomeV9.render) global.OneToneHomeV9.render();
    if(global.OneToneHomeScheme&&global.OneToneHomeScheme.renderSwitcher) global.OneToneHomeScheme.renderSwitcher(false);
    if(global.OneToneMappingList&&global.OneToneMappingList.renderEditor) global.OneToneMappingList.renderEditor();
    if(global.OneToneMappingList&&global.OneToneMappingList.renderList) global.OneToneMappingList.renderList();
  }

  function friendlyKey(key){
    key=String(key||'').trim();
    if(!key) return '';
    if(global.OneToneKeyLabels&&global.OneToneKeyLabels.friendlyKeyName){
      var lang=global.OneToneApp&&global.OneToneApp.getLang?global.OneToneApp.getLang():'zh';
      return global.OneToneKeyLabels.friendlyKeyName(key,lang)||key;
    }
    return key;
  }

  function triggerPreview(m){
    var hooks=recordingHooks();
    if(hooks.getEditorTriggerKey){
      var ed=String(hooks.getEditorTriggerKey()||'').trim();
      if(ed&&isAllowedTriggerKey(ed)) return ed;
    }
    var saved=m&&String(m.triggerKey||'').trim()?String(m.triggerKey).trim():'';
    return isAllowedTriggerKey(saved)?saved:'';
  }

  function isTriggerRecordingActive(){
    var rec=global.OneToneMappingRecording;
    if(!rec) return false;
    var mode=rec.mode&&typeof rec.mode==='function'?rec.mode():'none';
    if(mode==='trigger') return true;
    return !!(rec.isPending&&typeof rec.isPending==='function'&&rec.isPending());
  }

  function step2ImeActivationKey(){
    if(!setupState) return '';
    var m=mappingById(setupState.mappingId);
    return m&&String(m.targetKey||'').trim()?String(m.targetKey).trim():'';
  }

  function step2ImePreset(){
    if(!setupState) return null;
    var presetId=String(setupState.imePresetId||'').trim();
    if(!presetId){
      var m=mappingById(setupState.mappingId);
      presetId=String(m&&m.imePresetId||'').trim();
    }
    return presetId?imePresetById(presetId):null;
  }

  function shortKeyLabel(key){
    key=friendlyKey(key);
    if(!key) return '';
    var parts=key.split('+');
    return parts[parts.length-1]||key;
  }

  function pauseMappingForSetup(){
    if(!setupState||mappingPausedForSetup) return;
    var m=mappingById(setupState.mappingId);
    if(!m) return;
    mappingEnabledBeforePause=!!m.enabled;
    mappingPausedForSetup=true;
    if(global.OneToneMappingEditActions&&global.OneToneMappingEditActions.setMappingEnabled){
      global.OneToneMappingEditActions.setMappingEnabled(setupState.mappingId,false,{skipRender:true,skipBackend:true});
    }else{
      m.enabled=false;
    }
  }

  function resumeMappingAfterSetup(){
    if(!mappingPausedForSetup) return;
    var m=setupState?mappingById(setupState.mappingId):null;
    var restore=mappingEnabledBeforePause;
    mappingPausedForSetup=false;
    mappingEnabledBeforePause=null;
    if(!m||restore==null) return;
    if(global.OneToneMappingEditActions&&global.OneToneMappingEditActions.setMappingEnabled){
      global.OneToneMappingEditActions.setMappingEnabled(m.id,!!restore,{skipRender:true,skipBackend:true});
    }else{
      m.enabled=!!restore;
    }
  }

  function enableMappingForVerify(){
    if(!setupState) return;
    var m=mappingById(setupState.mappingId);
    if(!m) return;
    if(global.OneToneMappingEditActions&&global.OneToneMappingEditActions.setMappingEnabled){
      global.OneToneMappingEditActions.setMappingEnabled(setupState.mappingId,true,{skipRender:true});
    }else{
      m.enabled=true;
    }
  }

  function updateMappingLabel(m){
    if(!m) return;
    var hooks=recordingHooks();
    var trig=hooks.editorTriggerForMapping?hooks.editorTriggerForMapping(m):(m.triggerKey||'?');
    var tgt=hooks.editorTargetForMapping?hooks.editorTargetForMapping(m):(m.targetKey||'?');
    m.label=String(trig||'?')+' → '+String(tgt||'?');
  }

  function persistImeActivation(m, key, imePresetId, opts){
    opts=opts||{};
    if(!m) return false;
    key=String(key||'').trim();
    if(!key) return false;
    m.targetKey=key;
    m.imePresetId=imePresetId||'';
    m.appTargetId='';
    m.updatedAt=Date.now();
    var st=global.OneToneState&&global.OneToneState.state;
    if(st&&st.config) st.config.imePresetId=imePresetId||'';
    if(global.OneToneMappingCore&&global.OneToneMappingCore.isSelected&&global.OneToneMappingCore.isSelected(m.id)){
      var hooks=recordingHooks();
      if(hooks.setEditorTargetKey) hooks.setEditorTargetKey(key);
    }
    updateMappingLabel(m);
    if(!opts.deferSave) saveConfig();
    return true;
  }

  function persistCustomTargetKey(m, key, opts){
    opts=opts||{};
    if(!m) return false;
    key=String(key||'').trim();
    if(!key) return false;
    if(!isAllowedTargetKey(key)){
      if(global.OneToneApp&&global.OneToneApp.toast) global.OneToneApp.toast(t('leftMouseRejected'));
      return false;
    }
    m.targetKey=key;
    m.imePresetId='';
    m.appTargetId='';
    m.updatedAt=Date.now();
    var st=global.OneToneState&&global.OneToneState.state;
    if(st&&st.config) st.config.imePresetId='';
    if(global.OneToneMappingCore&&global.OneToneMappingCore.isSelected&&global.OneToneMappingCore.isSelected(m.id)){
      var hooks=recordingHooks();
      if(hooks.setEditorTargetKey) hooks.setEditorTargetKey(key);
    }
    updateMappingLabel(m);
    if(!opts.deferSave) saveConfig();
    return true;
  }

  function persistTargetKey(m, key){
    return persistCustomTargetKey(m, key);
  }

  function persistWakePhrases(m, phrases){
    if(!m) return false;
    var list=Array.isArray(phrases)?phrases.map(function(s){ return String(s||'').trim(); }).filter(Boolean):[];
    if(!list.length) return false;
    if(!m.voiceOverride) m.voiceOverride={};
    m.voiceOverride.wakePhrases=list.slice();
    m.updatedAt=Date.now();
    saveConfig();
    return true;
  }

  function persistTriggerMode(mappingId, triggerMode, cancelEnabled, autoEnterEnabled){
    var m=mappingById(mappingId);
    if(!m) return false;
    m.triggerMode=triggerMode;
    m.cancelEnabled=cancelEnabled;
    m.autoEnterEnabled=autoEnterEnabled;
    m.updatedAt=Date.now();
    var st=global.OneToneState&&global.OneToneState.state;
    if(st){
      st.selectedMappingId=mappingId;
      if(st.config) st.config.activeSceneId=mappingId;
    }
    saveConfig();
    if(global.OneToneSceneActivate&&global.OneToneSceneActivate.activateScene){
      global.OneToneSceneActivate.activateScene(mappingId);
    }
    refreshUi();
    return true;
  }

  function isRiskyActivationKey(combo){
    combo=String(combo||'').trim();
    if(!combo) return false;
    var parts=combo.split('+');
    var last=parts[parts.length-1]||combo;
    return !!RISKY_KEYS[last]||!!RISKY_KEYS[combo];
  }

  function installTargetHook(){
    var rec=global.OneToneMappingRecording;
    if(!rec||!rec.setBeforeFinishTargetHook) return;
    rec.setBeforeFinishTargetHook(function(combo){
      if(!setupState||setupState.subMode!=='record') return true;
      if(!isRiskyActivationKey(combo)) return true;
      pushOverlay('confirm');
      var msg=t('habitSetupRiskyKeyConfirm').replace('{key}',friendlyKey(combo));
      var confirmFn=global.OneToneMappingConfirmModal&&global.OneToneMappingConfirmModal.open
        ?global.OneToneMappingConfirmModal.open(msg)
        :Promise.resolve(window.confirm(msg));
      return confirmFn.then(function(ok){
        popOverlay('confirm');
        if(!ok&&setupState) setupState.recordRejectMsg=t('habitSetupRiskyKeyRejected');
        renderImeStep();
        return !!ok;
      });
    });
  }

  function clearTargetHook(){
    var rec=global.OneToneMappingRecording;
    if(rec&&rec.setBeforeFinishTargetHook) rec.setBeforeFinishTargetHook(null);
  }

  function clearPoll(){
    clearInterval(pollTimer);
    pollTimer=0;
  }

  function setPage(page){
    if(!setupState) return;
    if(setupState.qsMode&&page===3) page=4;
    setupState.page=page;
    var activationView=$('habitSetupActivationView');
    var triggerView=$('habitSetupTriggerView');
    var modeView=$('habitSetupModeView');
    var voiceLessonView=$('habitSetupVoiceLessonView');
    if(activationView) activationView.hidden=page!==1;
    if(triggerView) triggerView.hidden=page!==2;
    if(modeView) modeView.hidden=page!==3||!!setupState.qsMode;
    if(voiceLessonView) voiceLessonView.hidden=page!==4;
  }

  function bumpMaxReached(page){
    if(!setupState) return;
    setupState.maxReachedPage=Math.max(setupState.maxReachedPage||1,page);
  }

  function stepDone(step){
    if(!setupState) return false;
    if(step===1) return setupState.maxReachedPage>=2||!!setupState.activationTestPassed;
    if(step===2) return setupState.qsMode
      ?(setupState.maxReachedPage>=4||!!setupState.modeSaved||triggerStepReady())
      :(setupState.maxReachedPage>=3||triggerStepReady());
    if(step===3) return setupState.maxReachedPage>=4||!!setupState.modeSaved;
    if(step===4) return false;
    return false;
  }

  function canGoToStep(step){
    if(!setupState) return false;
    if(setupState.qsMode&&step===3) return false;
    if(step===setupState.page) return true;
    if(step===1) return true;
    if(step===2) return activationStepReady();
    if(step===3) return hasRecordedTrigger()||triggerKeptExisting();
    if(step===4){
      if(setupState.qsMode) return hasRecordedTrigger()||triggerKeptExisting();
      return !!setupState.modeSaved;
    }
    return false;
  }

  function goNext(){
    if(!setupState) return;
    if(setupState.page===1){
      if(!commitActivationOnNext()) return;
      clearEmbeddedTriggerTest();
      clearStep2VoicePractice();
      clearVoiceLessonPractice();
      closeSubHost();
      setupState.page=2;
      setupState.triggerScenario='undecided';
      renderPage();
      ensureTriggerPageReady();
      return;
    }
    if(setupState.page===2){
      if(!triggerStepReady()) return;
      if(setupState.qsMode){
        // Avoid activateScene + full home refresh on the click path — that froze the UI ("未响应").
        clearEmbeddedTriggerTest();
        clearStep2VoicePractice();
        var mQs=mappingById(setupState.mappingId);
        if(mQs){
          mQs.triggerMode='tap';
          mQs.cancelEnabled=true;
          mQs.autoEnterEnabled=true;
          mQs.updatedAt=Date.now();
        }
        setupState.triggerMode='tap';
        setupState.modeSaved=true;
        bumpMaxReached(4);
        goToStep(4);
        setTimeout(function(){ try{ saveConfig('quickStart'); }catch(_){} },0);
        return;
      }
      bumpMaxReached(3);
      goToStep(3);
    }
  }

  function commitActivationOnNext(){
    if(!setupState) return false;
    var key=getActivationPreviewKey();
    if(!key) return false;
    var m=mappingById(setupState.mappingId);
    if(!m) return false;
    var rec=global.OneToneMappingRecording;
    if(rec&&rec.mode&&rec.mode()==='target'){
      try{
        if(rec.invokeStop) rec.invokeStop();
      }catch(_){}
    }
    if(String(m.targetKey||'').trim()!==key){
      if(setupState.imePresetId) persistImeActivation(m,key,setupState.imePresetId,{deferSave:false});
      else persistCustomTargetKey(m,key,{deferSave:false});
    }else{
      saveConfig();
    }
    setupState.activationRecordedKey=key;
    setupState.activationTestPassed=true;
    setupState.recordPreviewKey='';
    bumpMaxReached(2);
    stopRecordOverlay();
    setupState.activationHint=t('habitSetupRecordCaptured').replace('{key}',friendlyKey(key));
    renderActivationSummary();
    return true;
  }

  function renderStepNav(){
    var host=$('habitSetupStepNav');
    if(!host||!setupState) return;
    if(setupState.qsMode&&global.OneToneQuickStart&&global.OneToneQuickStart.isOpen&&global.OneToneQuickStart.isOpen()){
      /* Orchestrator owns the top nav while QS core runs */
      return;
    }
    var steps=wizardSteps();
    host.innerHTML=steps.map(function(step,idx){
      var active=setupState.page===step.id;
      var done=stepDone(step.id);
      var reachable=canGoToStep(step.id);
      var labelKey=step.labelKey;
      var cls='habit-setup-step-tab';
      if(active) cls+=' is-active';
      if(done&&!active) cls+=' is-done';
      return '<button type="button" class="'+cls+'" data-habit-step="'+step.id+'"'
        +(reachable?'':' disabled')+' role="tab" aria-selected="'+(active?'true':'false')+'"'
        +' aria-label="'+esc(t(labelKey))+'">'
        +'<span class="habit-setup-step-num">'+(idx+1)+'</span>'
        +'<span class="habit-setup-step-label">'+esc(t(labelKey))+'</span>'
        +'</button>';
    }).join('');
  }

  function activationStepReady(){
    if(!setupState) return false;
    if(setupState.activationTestPassed) return true;
    return !!getActivationPreviewKey();
  }

  function hasRecordedTrigger(){
    if(!setupState) return false;
    if(setupState.triggerCaptured) return true;
    var m=mappingById(setupState.mappingId);
    return !!triggerPreview(m);
  }

  function triggerKeptExisting(){
    return !!(setupState&&setupState.triggerScenario==='keep_existing');
  }

  function triggerStepReady(){
    if(!setupState) return false;
    if(setupState.triggerScenario==='keep_existing') return true;
    if(setupState.triggerScenario!=='need_extra') return false;
    if(setupState.triggerTestPassed) return true;
    return hasRecordedTrigger();
  }

  function stopGateDeviceFeedback(){
    if(gateDeviceFbTimer){
      clearInterval(gateDeviceFbTimer);
      gateDeviceFbTimer=0;
    }
    gateDeviceFbIdx=-1;
  }

  function gateDemoActivationCombo(){
    var key=String(activationTargetKey()||step2ImeActivationKey()||'').trim();
    return key||'LAlt';
  }

  function normalizeGateVkToken(tok){
    tok=String(tok||'').trim();
    if(!tok) return '';
    var alias={
      Esc:'Esc', Escape:'Esc', Space:'Space', Enter:'Enter', Tab:'Tab',
      Backspace:'Backspace', CapsLock:'CapsLock', Caps:'CapsLock',
      Ctrl:'LCtrl', Control:'LCtrl', LControl:'LCtrl', RControl:'RCtrl',
      Shift:'LShift', LShift:'LShift', RShift:'RShift',
      Alt:'LAlt', LAlt:'LAlt', RAlt:'RAlt',
      Win:'LWin', LWin:'LWin', RWin:'RWin', Meta:'LWin',
      AppsKey:'AppsKey', Menu:'AppsKey',
      'Left Alt':'LAlt', 'Right Alt':'RAlt', 'Left Ctrl':'LCtrl', 'Right Ctrl':'RCtrl',
      'Left Shift':'LShift', 'Right Shift':'RShift', 'Left Win':'LWin', 'Right Win':'RWin'
    };
    if(alias[tok]) return alias[tok];
    if(/^[a-z]$/i.test(tok)) return tok.toUpperCase();
    if(/^[0-9]$/.test(tok)) return tok;
    if(/^F([1-9]|1[0-2])$/i.test(tok)) return tok.toUpperCase();
    return tok;
  }

  function syncGateKeepKeyboard(){
    var kbd=$('habitSetupTriggerKbd');
    if(!kbd) return;
    var combo=gateDemoActivationCombo();
    var parts=combo.split('+').map(normalizeGateVkToken).filter(Boolean);
    if(!parts.length) parts=['LAlt'];
    var keys=kbd.querySelectorAll('.habit-setup-trigger-kbd__key[data-vk]');
    for(var i=0;i<keys.length;i++){
      keys[i].classList.remove('is-active','is-cand');
      var oldRipple=keys[i].querySelector('.habit-setup-trigger-kbd__ripple');
      if(oldRipple) oldRipple.parentNode.removeChild(oldRipple);
    }
    function findVk(vk){
      if(!vk) return null;
      return kbd.querySelector('.habit-setup-trigger-kbd__key[data-vk="'+vk+'"]');
    }
    var primary=parts[parts.length-1];
    var mods=parts.slice(0,-1);
    for(var mi=0;mi<mods.length;mi++){
      var modEl=findVk(mods[mi]);
      if(modEl) modEl.classList.add('is-cand');
    }
    var main=findVk(primary);
    if(!main&&primary==='LCtrl') main=findVk('RCtrl');
    if(!main&&primary==='LAlt') main=findVk('RAlt');
    if(!main&&primary==='LShift') main=findVk('RShift');
    if(!main&&primary==='LWin') main=findVk('RWin');
    if(main){
      main.classList.add('is-active');
      var ripple=document.createElement('span');
      ripple.className='habit-setup-trigger-kbd__ripple';
      main.appendChild(ripple);
    }
    var fb=$('habitSetupTriggerFbKeepText');
    if(fb){
      fb.textContent=t('habitSetupTriggerFbKeep').replace('{key}',friendlyKey(combo)||combo);
    }
  }

  function updateGateDeviceFeedbackText(){
    var el=$('habitSetupTriggerFbExtraText');
    if(!el) return;
    var idx=gateDeviceFbIdx>=0?gateDeviceFbIdx:0;
    var name=t(GATE_DEVICE_KEYS[idx]||GATE_DEVICE_KEYS[0]);
    el.textContent=t('habitSetupTriggerFbDevice').replace('{name}',name);
  }

  function startGateDeviceFeedback(){
    stopGateDeviceFeedback();
    gateDeviceFbIdx=0;
    updateGateDeviceFeedbackText();
    gateDeviceFbTimer=setInterval(function(){
      if(!setupState||setupState.page!==2||setupState.triggerScenario==='need_extra'){
        stopGateDeviceFeedback();
        return;
      }
      // Only cycle device demo while the extra column is hovered.
      var extraCol=document.querySelector('.habit-setup-trigger-col[data-scene="extra"]');
      if(!extraCol||!extraCol.classList.contains('is-hot')) return;
      var idx=Math.floor((Date.now()/1000)%6/1.5)%4;
      if(idx===gateDeviceFbIdx) return;
      gateDeviceFbIdx=idx;
      updateGateDeviceFeedbackText();
    },200);
  }

  function setTriggerGateColHot(col,on){
    if(!col) return;
    var parallel=$('habitSetupTriggerParallel');
    if(on&&parallel){
      var cols=parallel.querySelectorAll('.habit-setup-trigger-col');
      for(var i=0;i<cols.length;i++){
        if(cols[i]!==col) cols[i].classList.remove('is-hot');
      }
    }
    col.classList.toggle('is-hot',!!on);
  }

  function renderTriggerScenarioGate(){
    if(!setupState) return;
    var gate=$('habitSetupTriggerGate');
    var config=$('habitSetupTriggerConfig');
    var needExtra=setupState.triggerScenario==='need_extra';
    if(gate) gate.hidden=!!needExtra;
    if(config) config.hidden=!needExtra;
    if(needExtra||setupState.page!==2){
      stopGateDeviceFeedback();
      return;
    }
    syncGateKeepKeyboard();
    if(!gateDeviceFbTimer) startGateDeviceFeedback();
  }

  function chooseTriggerKeepExisting(){
    if(!setupState||setupState.page!==2) return;
    setupState.triggerScenario='keep_existing';
    stopGateDeviceFeedback();
    clearEmbeddedTriggerTest();
    var m=mappingById(setupState.mappingId);
    if(m&&String(m.triggerKey||'').trim()){
      setupState.triggerCaptured=true;
    }
    renderTriggerScenarioGate();
    renderWizardFooters();
    goNext();
  }

  function chooseTriggerNeedExtra(){
    if(!setupState||setupState.page!==2) return;
    setupState.triggerScenario='need_extra';
    stopGateDeviceFeedback();
    var m=mappingById(setupState.mappingId);
    if(m&&String(m.triggerKey||'').trim()){
      setupState.triggerCaptured=true;
    }
    renderTriggerScenarioGate();
    ensureTriggerPageReady();
    renderWizardFooters();
  }

  function backToTriggerGate(){
    if(!setupState||setupState.page!==2) return;
    clearEmbeddedTriggerTest();
    setupState.triggerScenario='undecided';
    setupState.triggerTestPassed=false;
    renderTriggerScenarioGate();
    renderWizardFooters();
  }

  function setFooterBtn(btn, enabled, label){
    if(!btn) return;
    btn.textContent=label;
    btn.disabled=!enabled;
    btn.setAttribute('aria-disabled',enabled?'false':'true');
    btn.classList.toggle('is-ready',!!enabled);
  }

  function renderWizardFooters(){
    var next1=$('btnHabitSetupNext');
    var next2=$('btnHabitSetupNextTrigger');
    if(next1){
      setFooterBtn(next1,activationStepReady(),t('habitSetupNext'));
    }
    if(next2){
      var trigReady=triggerStepReady();
      setFooterBtn(next2,trigReady,t('habitSetupNext'));
    }
    var saveVoice=$('btnHabitSetupSaveVoice');
    if(saveVoice){
      if(setupState&&setupState.qsMode){
        setFooterBtn(
          saveVoice,
          voiceLessonAllDone(),
          setupState.qsPersona==='vibe'?t('habitSetupNext'):t('habitSetupVoiceLessonSave')
        );
      }else{
        setFooterBtn(saveVoice,true,t('habitSetupVoiceLessonSave'));
      }
    }
    var back2=$('btnHabitSetupBackToActivationFromTrigger');
    var back3=$('btnHabitSetupBack');
    var backVoice=$('btnHabitSetupBackFromVoiceLesson');
    if(back2) back2.textContent=t('habitSetupPrev');
    if(back3) back3.textContent=t('habitSetupPrev');
    if(backVoice) backVoice.textContent=t('habitSetupPrev');
  }

  function ensureTriggerPageReady(){
    if(!setupState) return;
    if(!setupState.triggerScenario) setupState.triggerScenario='undecided';
    pauseMappingForSetup();
    renderTriggerScenarioGate();
    if(setupState.triggerScenario==='need_extra'){
      renderTriggerStage();
      renderTriggerTestPanels();
    }
  }

  function goToStep(step){
    if(!setupState||!canGoToStep(step)) return;
    if(setupState.qsMode&&step===3) step=4;
    if(step!==3) stopModeCompatProbe();
    if(step!==2) clearEmbeddedTriggerTest();
    if(step!==2) clearStep2VoicePractice();
    if(step!==4) clearVoiceLessonPractice();
    if(step!==4) clearVoiceMicSoftSkipTimer();
    if(step!==4){
      setVoicePracticeHoldFg(false);
      clearVoicePracticeStageTimer();
      stopVoicePracticeDictationAnim();
      voicePracticeStagePhase='idle';
      setVoicePracticeStageChrome(false);
      resetVoicePracticeStageUi();
    }
    closeSubHost();
    setupState.page=step;
    renderPage();
    if(step===2) ensureTriggerPageReady();
    if(step===3&&!setupState.qsMode) startModeCompatProbe();
    if(step===4){
      clearVoicePracticeStageTimer();
      stopVoicePracticeDictationAnim();
      voicePracticeStagePhase='idle';
      setVoicePracticeStageChrome(false);
      resetVoicePracticeStageUi();
      setupState.voiceMicGate='pending';
      ensureVoiceMicGate({force:true});
    }
  }

  function renderStepProgress(){
    renderStepNav();
    renderWizardFooters();
  }

  function flashTriggerBindingDemo(){
    var hid=$('habitSetupBindHidPill');
    var voice=$('habitSetupBindVoicePill');
    if(hid){
      hid.classList.remove('is-pressed','is-press-flash');
      void hid.offsetWidth;
      hid.classList.add('is-pressed','is-press-flash');
      setTimeout(function(){
        hid.classList.remove('is-pressed','is-press-flash');
      },220);
    }
    if(voice){
      setTimeout(function(){
        voice.classList.add('is-bound','is-bound-flash');
        setTimeout(function(){ voice.classList.remove('is-bound-flash'); },700);
      },280);
    }
  }

  function renderTriggerStage(){
    if(!setupState) return;
    var m=mappingById(setupState.mappingId);
    var preview=setupState.triggerCaptured?triggerPreview(m):'';
    var imeKey=friendlyKey(step2ImeActivationKey())||'—';
    var triggerKey=friendlyKey(preview||'')||'—';
    var imePreset=step2ImePreset();
    var recording=isTriggerRecordingActive();
    var status=$('habitSetupTriggerStatus');
    var stage=status&&status.closest?status.closest('.habit-setup-stage'):null;
    if(stage) stage.classList.toggle('is-binding',!!preview);
    if(status){
      status.classList.toggle('is-binding',!!preview);
      if(preview){
        var voiceIcon=imePreset&&imePreset.icon
          ?('<img class="habit-setup-bind-pill__ime" src="'+esc(imePreset.icon)+'" alt="" decoding="async" />')
          :('<svg class="habit-setup-bind-pill__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
            +'<rect x="9" y="3" width="6" height="12" rx="3"/>'
            +'<path d="M5 11a7 7 0 0 0 14 0"/>'
            +'<line x1="12" y1="18" x2="12" y2="22"/>'
            +'</svg>');
        var boundCls=setupState.triggerTestPassed?' is-bound':'';
        status.innerHTML=
          '<div class="habit-setup-bind-card">'
          +  '<div class="habit-setup-bind-flow">'
          +    '<div class="habit-setup-bind-col">'
          +      '<div class="habit-setup-bind-pill habit-setup-bind-pill--hid" id="habitSetupBindHidPill">'
          +        '<span class="habit-setup-bind-pill__dot" aria-hidden="true"></span>'
          +        '<span class="habit-setup-bind-pill__text">'+esc(triggerKey)+'</span>'
          +      '</div>'
          +      '<div class="habit-setup-bind-flow__label">'+esc(t('triggerTitle'))+'</div>'
          +    '</div>'
          +    '<div class="habit-setup-bind-arrow" aria-hidden="true">'
          +      '<div class="habit-setup-bind-arrow__line"></div>'
          +      '<div class="habit-setup-bind-arrow__head"></div>'
          +    '</div>'
          +    '<div class="habit-setup-bind-col">'
          +      '<div class="habit-setup-bind-pill habit-setup-bind-pill--voice'+boundCls+'" id="habitSetupBindVoicePill">'
          +        voiceIcon
          +        '<span class="habit-setup-bind-pill__text">'+esc(imeKey)+'</span>'
          +      '</div>'
          +      '<div class="habit-setup-bind-flow__label">'+esc(t('targetTitle'))+'</div>'
          +    '</div>'
          +  '</div>'
          +  '<p class="habit-setup-bind-note">'+esc(t('habitSetupTriggerKeepOrRerecord'))+'</p>'
          +'</div>';
      }else if(recording){
        status.innerHTML='<span class="habit-setup-status-dot is-wait" aria-hidden="true"></span>'
          +esc(t('onboardRecordListeningTrigger'));
      }else{
        status.innerHTML='<span class="habit-setup-status-dot is-wait" aria-hidden="true"></span>'
          +esc(t('habitSetupTriggerNotRecorded'));
      }
    }
    var startBtn=$('btnHabitSetupTriggerStartRecord');
    if(startBtn){
      startBtn.textContent=recording
        ?t('onboardBtnRecordingTrigger')
        :(preview?t('btnRerecordTrigger'):t('habitSetupTriggerStartRecord'));
      startBtn.className=recording
        ?'btn secondary habit-setup-test-retry record-btn is-recording'
        :(preview
          ?'btn habit-setup-bind-change record-btn'
          :'btn secondary habit-setup-test-retry record-btn');
      startBtn.hidden=false;
    }
  }

  function renderTriggerKeyboard(){
    renderTriggerStage();
    renderTriggerTestPanels();
  }

  function startEmbeddedTriggerTest(){
    if(!setupState||setupState.page!==2||setupState.triggerTestPassed) return;
    if(!setupState.triggerCaptured) return;
    logVerify('start embedded trigger test triggerCaptured=1');
    var m=mappingById(setupState.mappingId);
    var trig=triggerPreview(m);
    if(!trig){
      logVerify('start embedded trigger test no trigger yet');
      startTriggerRecording();
      renderTriggerTestPanels();
      return;
    }
    // Already listening: re-verify is JS-only — never block on IPC / hook reinstall.
    if(setupState.triggerTestListening&&triggerVerifyBackendActive){
      logVerify('re-verify while active');
      restartTriggerVerifyListenOnly();
      return;
    }
    clearEmbeddedTriggerTest({skipStop:true});
    setupState.triggerTestListening=true;
    renderTriggerTestPanels();
    setTimeout(function(){
      if(!setupState||setupState.page!==2||setupState.triggerTestPassed||!setupState.triggerTestListening) return;
      armTriggerVerifyListener();
      startTriggerVerifyListen({skipIfActive:true}).then(function(res){
        if(!setupState||!setupState.triggerTestListening) return;
        if(res&&res.ok===false&&global.OneToneApp&&global.OneToneApp.toast){
          global.OneToneApp.toast(t('habitSetupTriggerVerifyStartFail'));
          clearEmbeddedTriggerTest();
          renderTriggerTestPanels();
        }
      });
    },0);
  }

  function renderTriggerTestPanels(){
    if(!setupState||setupState.page!==2) return;
    var m=mappingById(setupState.mappingId);
    var trig=triggerPreview(m);
    var trigLabel=friendlyKey(trig||'')||'—';
    var imeKeyLabel=friendlyKey(step2ImeActivationKey())||'—';
    var keyPanel=$('habitSetupKeyTestPanel');
    var keyStatus=$('habitSetupKeyTestStatus');
    var keyRetry=$('btnHabitSetupKeyTestRetry');
    if(keyPanel){
      keyPanel.hidden=!setupState.triggerCaptured;
      keyPanel.classList.toggle('is-ok',!!setupState.triggerTestPassed);
    }
    if(keyStatus){
      if(setupState.triggerTestPassed){
        keyStatus.innerHTML='<span class="habit-setup-status-dot is-ok" aria-hidden="true"></span>'+esc(t('habitSetupKeyTestOk'));
      }else if(!trig){
        keyStatus.innerHTML='<span class="habit-setup-status-dot is-wait" aria-hidden="true"></span>'+esc(t('habitSetupKeyTestNeedRecord'));
      }else if(setupState.triggerTestListening){
        keyStatus.innerHTML='<span class="habit-setup-status-dot is-wait" aria-hidden="true"></span>'
          +esc(t('habitSetupKeyTestWaiting').replace('{key}',friendlyKey(trig)));
      }else{
        keyStatus.innerHTML='<span class="habit-setup-status-dot is-wait" aria-hidden="true"></span>'
          +esc(
            t('habitSetupTriggerTestSummary')
              .replace('{trigger}',trigLabel)
              .replace('{imeKey}',imeKeyLabel)
          );
      }
    }
    if(keyRetry){
      keyRetry.hidden=!setupState.triggerCaptured||!trig;
      keyRetry.textContent=t('habitSetupKeyTestRetry');
    }
    var voicePanel=$('habitSetupVoiceTestPanel2');
    if(voicePanel) voicePanel.hidden=true;
    renderWizardFooters();
  }

  function runStep4VoiceTest(){
    if(!setupState||setupState.page!==4||setupState.voiceStep4Passed||!setupState.voiceEasterEnabled) return;
    if(isVoiceOnlyActivation()){
      renderStep4VoicePanel();
      return;
    }
    setupState.voiceStep4Pending=true;
    renderStep4VoicePanel();
    if(!global.OneToneMappingTestSend||!global.OneToneMappingTestSend.fire){
      setupState.voiceStep4Pending=false;
      renderStep4VoicePanel();
      return;
    }
    global.OneToneMappingTestSend.fire(setupState.mappingId,{
      context:'habit-activation-test',
      silent:true,
      onResult:function(msg){
        if(!setupState||setupState.page!==4) return;
        setupState.voiceStep4Pending=false;
        if(msg&&msg.ok) setupState.voiceStep4Passed=true;
        renderStep4VoicePanel();
      }
    });
  }

  function openStep4WakeVoiceTest(){
    if(!setupState||step2VoicePracticeOpen||setupState.page!==4) return;
    var phrases=getWakePhrases();
    if(!global.OneTonePhrasePractice||!global.OneTonePhrasePractice.open) return;
    step2VoicePracticeOpen=true;
    global.OneTonePhrasePractice.open({
      embedded:true,
      mount:'#habitSetupVoiceStep4Host',
      phrases:phrases,
      phraseOptions:WAKE_PRESET_OPTIONS,
      multiSelect:false,
      onMatch:function(){
        setupState.voiceStep4Passed=true;
        setupState.voiceStep4Pending=false;
        clearStep2VoicePractice();
        renderStep4VoicePanel();
      },
      onSkip:function(){
        clearStep2VoicePractice();
        renderStep4VoicePanel();
      }
    });
    renderStep4VoicePanel();
  }

  function renderStep4VoicePanel(){
    if(!setupState||setupState.page!==4) return;
    var panel=$('habitSetupVoiceStep4Panel');
    var title=$('habitSetupVoiceStep4Title');
    var desc=$('habitSetupVoiceStep4Desc');
    var host=$('habitSetupVoiceStep4Host');
    var retry=$('btnHabitSetupVoiceStep4Retry');
    if(!panel||!host||!retry) return;
    panel.hidden=!setupState.voiceEasterEnabled;
    if(panel.hidden) return;
    if(title) title.textContent=t('habitSetupVoiceTestTitle');
    if(desc){
      var trigLabel=friendlyKey(triggerPreview(mappingById(setupState.mappingId))||'')||'—';
      var imeKeyLabel=friendlyKey(step2ImeActivationKey())||'—';
      desc.textContent=isVoiceOnlyActivation()
        ?t('habitSetupVoiceTestDescWake')
        :t('habitSetupVoiceTestDescKey').replace('{trigger}',trigLabel).replace('{imeKey}',imeKeyLabel);
    }
    panel.classList.toggle('is-ok',!!setupState.voiceStep4Passed);
    retry.textContent=t('habitSetupVoiceTestRetry');
    retry.hidden=false;
    if(setupState.voiceStep4Passed){
      host.innerHTML='<p class="habit-setup-status"><span class="habit-setup-status-dot is-ok" aria-hidden="true"></span>'
        +esc(t('habitSetupVoiceTestOk'))+'</p>';
    }else if(isVoiceOnlyActivation()){
      host.innerHTML='<button type="button" class="btn secondary" id="btnHabitSetupVoiceStep4Try">'+esc(t('habitSetupVoiceTestTryWake'))+'</button>';
    }else if(setupState.voiceStep4Pending){
      host.innerHTML='<p class="habit-setup-status"><span class="habit-setup-status-dot is-wait" aria-hidden="true"></span>'
        +esc(t('habitSetupVoiceTestWaiting'))+'</p>';
    }else{
      host.innerHTML='<button type="button" class="btn secondary" id="btnHabitSetupVoiceStep4Try">'+esc(t('habitSetupVoiceTestTry'))+'</button>';
    }
  }

  function voiceLessonAllDone(){
    if(!setupState||!setupState.voiceLessons) return false;
    if(setupState.qsMode) return !!(setupState.voiceLessons.wake&&setupState.voiceLessons.end);
    return !!(setupState.voiceLessons.wake&&setupState.voiceLessons.end&&setupState.voiceLessons.cancel);
  }

  function qsNextVoiceLessonId(){
    if(!setupState||!setupState.voiceLessons) return 'wake';
    if(!setupState.voiceLessons.wake) return 'wake';
    if(!setupState.voiceLessons.end) return 'end';
    return '';
  }

  function hasAvailableMic(){
    var api=global.OneToneAppMic;
    if(!api||typeof api.devices!=='function') return false;
    var list=api.devices();
    return Array.isArray(list)&&list.length>0;
  }

  function probeVoiceMic(){
    var api=global.OneToneAppMic;
    var invoke=global.OneToneIpc&&typeof global.OneToneIpc.invoke==='function'
      ?global.OneToneIpc.invoke
      :null;
    var listP=(!api||typeof api.loadMicDevices!=='function')
      ?Promise.resolve(false)
      :api.loadMicDevices({manual:true}).then(function(){
        if(api.getMicUiState){
          var st=api.getMicUiState();
          if(st&&st.key==='missing') return false;
          if(st&&st.available===false) return false;
        }
        return hasAvailableMic();
      }).catch(function(){ return false; });
    var pfP=!invoke
      ?Promise.resolve(null)
      :invoke('cmd_acoustic_voice_command_preflight',{}).then(function(r){
        if(!r||typeof r!=='object') return null;
        if(r.hasDefaultInput===false) return false;
        if(r.messageKey==='habitAcousticCmdNoMic') return false;
        if(r.hasDefaultInput===true) return true;
        return null;
      }).catch(function(){ return null; });
    return Promise.all([listP,pfP]).then(function(pair){
      var listOk=!!pair[0];
      var pf=pair[1];
      if(pf===false) return false;
      return listOk;
    });
  }

  function hideVoicePracticeSurfaces(){
    var prompt=$('habitSetupVoiceEasterPrompt');
    var lessonsHost=$('habitSetupVoiceLessons');
    var demoHost=$('habitSetupVoiceLessonDemoHost');
    var panel=$('habitSetupVoiceStep4Panel');
    if(prompt) prompt.hidden=true;
    if(lessonsHost){ lessonsHost.innerHTML=''; lessonsHost.hidden=true; }
    if(demoHost){ demoHost.innerHTML=''; demoHost.hidden=true; }
    if(panel) panel.hidden=true;
    clearVoiceLessonPractice();
  }

  function showVoiceMicGateUi(mode){
    var gate=$('habitSetupVoiceMicGate');
    if(gate) gate.hidden=false;
    hideVoicePracticeSurfaces();
    var soft=$('habitSetupVoiceMicSoft');
    if(soft) soft.classList.toggle('is-checking',mode==='pending');
    var title=$('habitSetupVoiceMicCopyTitle');
    var sub=$('habitSetupVoiceMicCopySub');
    if(title){
      title.textContent=mode==='pending'
        ?t('habitSetupVoiceMicGateChecking')
        :t('habitSetupVoiceMicGateTitle');
    }
    if(sub){
      sub.textContent=mode==='pending'
        ?t('habitSetupVoiceMicGateCheckingDesc')
        :t('habitSetupVoiceMicGateDesc');
    }
    var cont=$('btnHabitSetupVoiceMicContinue');
    if(cont){
      cont.textContent=t('habitSetupVoiceMicContinue');
      cont.disabled=mode==='pending';
      cont.hidden=mode==='pending';
    }
    var help=$('btnHabitSetupVoiceMicRecheck');
    if(help){
      help.textContent=t('habitSetupVoiceMicHelpLink')||t('habitSetupVoiceMicRecheck');
      help.disabled=mode==='pending';
      help.hidden=false;
    }
  }

  function hideVoiceMicGate(){
    clearVoiceMicSoftSkipTimer();
    var gate=$('habitSetupVoiceMicGate');
    if(gate) gate.hidden=true;
    var lessonsHost=$('habitSetupVoiceLessons');
    if(lessonsHost) lessonsHost.hidden=false;
  }

  function markVoiceLessonsSkippedDone(){
    if(!setupState) return;
    if(!setupState.voiceLessons) setupState.voiceLessons={wake:false,end:false,cancel:false};
    setupState.voiceLessons.wake=true;
    setupState.voiceLessons.end=true;
    setupState.voiceLessons.cancel=true;
    setupState.activeVoiceLesson='';
  }

  function clearVoiceMicSoftSkipTimer(){
    if(voiceMicSoftSkipTimer){
      clearTimeout(voiceMicSoftSkipTimer);
      voiceMicSoftSkipTimer=0;
    }
  }

  function scheduleVoiceMicSoftSkip(){
    clearVoiceMicSoftSkipTimer();
    if(!setupState||setupState.page!==4||setupState.voiceMicGate!=='blocked') return;
    voiceMicSoftSkipTimer=setTimeout(function(){
      voiceMicSoftSkipTimer=0;
      finishVoiceMicSoftSkip();
    },VOICE_MIC_SOFT_SKIP_MS);
  }

  function finishVoiceMicSoftSkip(){
    if(!setupState||setupState.page!==4) return;
    if(setupState.voiceMicGate==='skipped'||setupState.voiceMicGate==='ready') return;
    clearVoiceMicSoftSkipTimer();
    setupState.voiceMicGate='skipped';
    markVoiceLessonsSkippedDone();
    hideVoiceMicGate();
    saveVoiceLesson();
  }

  function ensureVoiceMicGate(opts){
    opts=opts||{};
    if(!setupState||setupState.page!==4) return;
    var force=!!opts.force;
    if(!force&&(setupState.voiceMicGate==='ready'||setupState.voiceMicGate==='skipped')){
      renderVoiceLessonPage();
      return;
    }
    clearVoiceMicSoftSkipTimer();
    setupState.voiceMicGate='pending';
    showVoiceMicGateUi('pending');
    renderWizardFooters();
    probeVoiceMic().then(function(ok){
      if(!setupState||setupState.page!==4) return;
      if(setupState.voiceMicGate==='skipped') return;
      setupState.voiceMicGate=ok?'ready':'blocked';
      if(!ok&&opts.toastOnFail&&global.OneToneApp&&global.OneToneApp.toast){
        global.OneToneApp.toast(t('habitSetupVoiceMicStillEmpty')||t('micEmpty'));
      }
      renderVoiceLessonPage();
    });
  }

  function chooseVoiceMicRecheck(){
    if(!setupState||setupState.page!==4) return;
    clearVoiceMicSoftSkipTimer();
    // Help link: short tip, then re-probe (stay in QS — don't yank settings drawer).
    if(global.OneToneApp&&typeof global.OneToneApp.toast==='function'){
      global.OneToneApp.toast(t('habitSetupVoiceMicHelpTip')||t('habitSetupVoiceMicStillEmpty'));
    }
    ensureVoiceMicGate({force:true,toastOnFail:true});
  }

  function renderVoiceLessonPage(){
    if(!setupState||setupState.page!==4) return;
    var prompt=$('habitSetupVoiceEasterPrompt');
    var lessonsHost=$('habitSetupVoiceLessons');
    var demoHost=$('habitSetupVoiceLessonDemoHost');
    var qs=!!setupState.qsMode;
    var micGate=setupState.voiceMicGate||'pending';

    if(micGate==='pending'||micGate==='blocked'){
      stopQsVoiceDemoTick();
      showVoiceMicGateUi(micGate);
      if(micGate==='blocked') scheduleVoiceMicSoftSkip();
      renderWizardFooters();
      return;
    }
    hideVoiceMicGate();

    if(qs){
      setupState.voiceEasterEnabled=true;
      if(prompt) prompt.hidden=true;
      var panelQs=$('habitSetupVoiceStep4Panel');
      if(panelQs) panelQs.hidden=true;
      if(voicePracticeStagePhase!=='idle'){
        stopQsVoiceDemoTick();
        renderWizardFooters();
        return;
      }
      setVoicePracticeStageChrome(false);
      if($('habitSetupVoiceLessonBadge')) $('habitSetupVoiceLessonBadge').textContent=t('habitSetupStepVoiceFlow')||t('habitSetupStepVoiceEnd');
      if($('habitSetupVoiceLessonTitle')) $('habitSetupVoiceLessonTitle').textContent=t('qsVoiceEndTitle');
      if($('habitSetupVoiceLessonDesc')) $('habitSetupVoiceLessonDesc').textContent=qsVoiceDualPanelGuideText();
      var hostQs=$('habitSetupVoiceLessons');
      if(hostQs){
        hostQs.className='habit-setup-voice-lessons habit-setup-voice-lessons--parallel';
        var wakeDone=!!(setupState.voiceLessons&&setupState.voiceLessons.wake);
        var endDone=!!(setupState.voiceLessons&&setupState.voiceLessons.end);
        var micSvg=
          '<svg class="habit-setup-voice-demo-mic-svg" viewBox="0 0 24 24" width="28" height="28" aria-hidden="true">'
            +'<rect class="mic-body" x="9" y="2" width="6" height="12" rx="3"/>'
            +'<path class="mic-arc" d="M5 11a7 7 0 0 0 14 0"/>'
            +'<line class="mic-stem" x1="12" y1="18" x2="12" y2="22"/>'
            +'<line class="mic-base" x1="8" y1="22" x2="16" y2="22"/>'
          +'</svg>';
        var cards=[
          { id:'wake', title:t('habitSetupVoiceLessonWakeTitle'), desc:t('qsVoiceWakeLessonDesc')||t('habitSetupVoiceLessonWakeDesc'), done:wakeDone },
          { id:'end', title:t('habitSetupVoiceLessonEndTitle'), desc:t('qsVoiceEndLessonDesc')||t('habitSetupVoiceLessonEndDesc'), done:endDone }
        ];
        hostQs.innerHTML=cards.map(function(item){
          var accent=item.id==='end'?' is-end':' is-wake';
          var pendingLbl=qsVoiceDemoPendingText(item.id);
          var demo=
            '<div class="habit-setup-voice-demo-head">'
              +'<div class="habit-setup-voice-demo-title">'+esc(item.title)+'</div>'
              +'<div class="habit-setup-voice-demo-status" data-status="pending">'+esc(pendingLbl)+'</div>'
            +'</div>'
            +'<div class="habit-setup-voice-demo-stage" aria-hidden="true">'
              +'<div class="habit-setup-voice-demo-bars">'
                +'<span class="habit-setup-voice-demo-bar"></span>'
                +'<span class="habit-setup-voice-demo-bar"></span>'
                +'<span class="habit-setup-voice-demo-bar"></span>'
                +'<span class="habit-setup-voice-demo-bar"></span>'
              +'</div>'
              +'<div class="habit-setup-voice-demo-mic-wrap">'
                +'<span class="habit-setup-voice-demo-mic-ring"></span>'
                +'<div class="habit-setup-voice-demo-mic-inner habit-setup-voice-demo-mic">'+micSvg+'</div>'
              +'</div>'
            +'</div>'
            +'<span class="habit-setup-voice-demo-desc">'+esc(item.desc)+'</span>';
          return '<button type="button" class="habit-setup-voice-lesson-card'
            +accent
            +(item.done?' is-done':'')+'"'
            +' data-voice-lesson="'+esc(item.id)+'"'
            +' aria-pressed="false">'
            +demo
            +(item.done?'<span class="habit-setup-voice-lesson-done">'+esc(t('habitSetupVoiceLessonDone'))+'</span>':'')
            +'</button>';
        }).join('');
        bindQsVoiceDemoHover(hostQs);
        startQsVoiceDemoTick();
        // QS: stay on dual panels until user taps a card (practice stage).
      }
      renderWizardFooters();
      return;
    }

    if(prompt){
      prompt.hidden=!!setupState.voiceEasterEnabled;
      var promptDesc=$('habitSetupVoiceEasterPromptDesc');
      if(promptDesc) promptDesc.textContent=t('habitSetupVoiceEasterPromptDesc');
      if($('btnHabitSetupVoiceEasterTry')) $('btnHabitSetupVoiceEasterTry').textContent=t('habitSetupVoiceEasterTry');
      if($('btnHabitSetupVoiceEasterSkip')) $('btnHabitSetupVoiceEasterSkip').textContent=t('habitSetupVoiceEasterSkip');
    }
    if(!setupState.voiceEasterEnabled){
      if(lessonsHost) lessonsHost.innerHTML='';
      if(demoHost){ demoHost.innerHTML=''; demoHost.hidden=true; }
      var panelHidden=$('habitSetupVoiceStep4Panel');
      if(panelHidden) panelHidden.hidden=true;
      renderWizardFooters();
      return;
    }
    renderStep4VoicePanel();
    var host=$('habitSetupVoiceLessons');
    if(!host) return;
    host.className='habit-setup-voice-lessons';
    var lessons=[
      { id:'wake', title:t('habitSetupVoiceLessonWakeTitle'), desc:t('habitSetupVoiceLessonWakeDesc') },
      { id:'end', title:t('habitSetupVoiceLessonEndTitle'), desc:t('habitSetupVoiceLessonEndDesc') },
      { id:'cancel', title:t('habitSetupVoiceLessonCancelTitle'), desc:t('habitSetupVoiceLessonCancelDesc') }
    ];
    var active=setupState.activeVoiceLesson||'';
    host.innerHTML=lessons.map(function(item){
      var done=!!(setupState.voiceLessons&&setupState.voiceLessons[item.id]);
      var sel=item.id===active;
      var demo=item.id==='wake'
        ?'<div class="habit-setup-voice-mini habit-setup-voice-mini--wake" aria-hidden="true"><span></span><span></span><span></span></div>'
        :(item.id==='end'
          ?'<div class="habit-setup-voice-mini habit-setup-voice-mini--end" aria-hidden="true"><span></span><span></span><span></span></div>'
          :'<div class="habit-setup-voice-mini habit-setup-voice-mini--cancel" aria-hidden="true"><span></span><span></span></div>');
      return '<button type="button" class="habit-setup-voice-lesson-card'+(sel?' is-active':'')+(done?' is-done':'')+'"'
        +' data-voice-lesson="'+esc(item.id)+'" aria-pressed="'+(sel?'true':'false')+'">'
        +demo
        +(done?'<span class="habit-setup-voice-lesson-done">'+esc(t('habitSetupVoiceLessonDone'))+'</span>':'')
        +'<b>'+esc(item.title)+'</b><span>'+esc(item.desc)+'</span></button>';
    }).join('');
    if($('habitSetupVoiceLessonBadge')) $('habitSetupVoiceLessonBadge').textContent=t('habitSetupVoiceLessonBadge');
    if($('habitSetupVoiceLessonTitle')) $('habitSetupVoiceLessonTitle').textContent=t('habitSetupVoiceLessonTitle');
    if($('habitSetupVoiceLessonDesc')) $('habitSetupVoiceLessonDesc').textContent=t('habitSetupVoiceLessonDesc');
    renderWizardFooters();
  }

  var qsVoiceDemoRaf=0;
  var QS_VOICE_DEMO_CYCLE_MS=5000;
  var qsVoiceDemoHoverBound=false;

  function qsVoiceDemoPendingText(id){
    return id==='end'
      ?(t('qsVoiceDemoStatusEndPending')||'听写中')
      :(t('qsVoiceDemoStatusWakePending')||'未激活');
  }

  function qsVoiceDemoListeningText(id){
    return id==='end'
      ?(t('qsVoiceDemoStatusEndListening')||'关闭中…')
      :(t('qsVoiceDemoStatusWakeListening')||'打开中…');
  }

  function resetQsVoiceDemoCardRest(card){
    if(!card) return;
    var id=String(card.getAttribute('data-voice-lesson')||'');
    card.classList.remove('is-listening','is-recognizing','is-speaking','is-demo-hit','is-demo-shake');
    card.removeAttribute('data-demo-phase');
    var st=card.querySelector('.habit-setup-voice-demo-status');
    if(st){
      st.textContent=qsVoiceDemoPendingText(id);
      st.setAttribute('data-state','pending');
    }
  }

  function bindQsVoiceDemoHover(host){
    if(!host||qsVoiceDemoHoverBound) return;
    qsVoiceDemoHoverBound=true;
    host.addEventListener('pointerover',function(e){
      var card=e.target&&e.target.closest?e.target.closest('[data-voice-lesson]'):null;
      if(!card||!host.contains(card)) return;
      var cards=host.querySelectorAll('[data-voice-lesson]');
      for(var i=0;i<cards.length;i++){
        var on=cards[i]===card;
        if(on){
          if(!cards[i].classList.contains('is-hot')){
            cards[i].classList.add('is-hot');
            cards[i].removeAttribute('data-demo-phase');
          }
        }else if(cards[i].classList.contains('is-hot')){
          cards[i].classList.remove('is-hot');
          resetQsVoiceDemoCardRest(cards[i]);
        }
      }
    });
    host.addEventListener('pointerleave',function(){
      var cards=host.querySelectorAll('[data-voice-lesson]');
      for(var i=0;i<cards.length;i++){
        if(cards[i].classList.contains('is-hot')){
          cards[i].classList.remove('is-hot');
          resetQsVoiceDemoCardRest(cards[i]);
        }
      }
    });
  }

  function stopQsVoiceDemoTick(){
    if(qsVoiceDemoRaf){
      cancelAnimationFrame(qsVoiceDemoRaf);
      qsVoiceDemoRaf=0;
    }
  }

  function setQsVoiceDemoCardState(card,state,text){
    if(!card) return;
    var statusEl=card.querySelector('.habit-setup-voice-demo-status');
    card.classList.remove('is-listening','is-recognizing','is-speaking','is-demo-hit','is-demo-shake');
    if(state==='listening') card.classList.add('is-listening');
    if(state==='recognizing') card.classList.add('is-recognizing');
    if(state==='active'){
      card.classList.add('is-demo-hit','is-demo-shake');
      setTimeout(function(){ card.classList.remove('is-demo-shake'); },360);
    }
    if(statusEl){
      statusEl.textContent=text;
      statusEl.setAttribute('data-state',state==='active'?'done':state);
    }
  }

  function qsVoiceDemoTickFrame(){
    qsVoiceDemoRaf=0;
    if(!setupState||!setupState.qsMode||setupState.page!==4||voicePracticeStagePhase!=='idle'){
      stopQsVoiceDemoTick();
      return;
    }
    var host=$('habitSetupVoiceLessons');
    if(!host||!host.classList.contains('habit-setup-voice-lessons--parallel')||host.hidden){
      stopQsVoiceDemoTick();
      return;
    }
    var tNow=Date.now();
    var cards=host.querySelectorAll('[data-voice-lesson]');
    for(var i=0;i<cards.length;i++){
      var card=cards[i];
      var id=String(card.getAttribute('data-voice-lesson')||'');
      if(!card.classList.contains('is-hot')){
        if(card.classList.contains('is-listening')||card.classList.contains('is-recognizing')||card.classList.contains('is-demo-hit')){
          resetQsVoiceDemoCardRest(card);
        }
        continue;
      }
      var offsetSec=id==='end'?2.5:0;
      var p=((tNow/1000)+offsetSec)%(QS_VOICE_DEMO_CYCLE_MS/1000);
      var successText=id==='end'
        ?(t('qsVoiceDemoStatusEndDone')||'已结束')
        :(t('qsVoiceDemoStatusWakeDone')||'已激活');
      var pendingText=qsVoiceDemoPendingText(id);
      var listeningText=qsVoiceDemoListeningText(id);
      var recognizingText=t('qsVoiceDemoStatusRecognizing')||'识别中…';
      var next='pending';
      var nextText=pendingText;
      // Match voice-activate-end-preview.html: wake opens early; end stays "on" longer then closes.
      if(id==='end'){
        if(p<1.8){ next='pending'; nextText=pendingText; }
        else if(p<2.3){ next='listening'; nextText=listeningText; }
        else if(p<2.8){ next='recognizing'; nextText=recognizingText; }
        else{ next='active'; nextText=successText; }
      }else{
        if(p<0.4){ next='pending'; nextText=pendingText; }
        else if(p<0.9){ next='listening'; nextText=listeningText; }
        else if(p<1.3){ next='recognizing'; nextText=recognizingText; }
        else if(p<4.8){ next='active'; nextText=successText; }
        else{ next='pending'; nextText=pendingText; }
      }
      if(card.getAttribute('data-demo-phase')!==next){
        card.setAttribute('data-demo-phase',next);
        setQsVoiceDemoCardState(card,next,nextText);
      }
    }
    qsVoiceDemoRaf=requestAnimationFrame(qsVoiceDemoTickFrame);
  }

  function startQsVoiceDemoTick(){
    stopQsVoiceDemoTick();
    if(!setupState||!setupState.qsMode||setupState.page!==4||voicePracticeStagePhase!=='idle') return;
    qsVoiceDemoRaf=requestAnimationFrame(qsVoiceDemoTickFrame);
  }

  function syncQsVoicePanels(){
    if(!setupState||!setupState.qsMode||setupState.page!==4) return;
    var host=$('habitSetupVoiceLessons');
    if(!host||!host.classList.contains('habit-setup-voice-lessons--parallel')) return;
    var cards=host.querySelectorAll('[data-voice-lesson]');
    for(var i=0;i<cards.length;i++){
      var id=String(cards[i].getAttribute('data-voice-lesson')||'');
      var done=!!(setupState.voiceLessons&&setupState.voiceLessons[id]);
      cards[i].classList.toggle('is-done',done);
      cards[i].classList.remove('is-dim','is-locked','is-active');
      cards[i].setAttribute('aria-pressed','false');
      cards[i].removeAttribute('aria-disabled');
      if(!cards[i].classList.contains('is-hot')) resetQsVoiceDemoCardRest(cards[i]);
    }
    bindQsVoiceDemoHover(host);
    startQsVoiceDemoTick();
  }

  function openVoiceLesson(lessonId){
    if(!setupState) return;
    if(setupState.voiceMicGate!=='ready') return;
    if(!setupState.voiceEasterEnabled&&!setupState.qsMode) return;
    if(setupState.qsMode){
      enterVoicePracticeStage(lessonId);
      return;
    }
    lessonId=String(lessonId||'').trim();
    if(!lessonId) return;
    setupState.activeVoiceLesson=lessonId;
    syncQsVoicePanels();
    clearVoiceLessonPractice();
    var demoHost=$('habitSetupVoiceLessonDemoHost');
    if(!demoHost) return;
    demoHost.hidden=false;
    if(!global.OneTonePhrasePractice||!global.OneTonePhrasePractice.open){
      demoHost.innerHTML='<p class="habit-setup-desc">'
        +esc(setupState.qsMode
          ?(t('qsVoiceEndDesc')||'请保持环境安静。看屏幕预览，念准关键词。')
          :t('habitSetupVoiceLessonDesc'))
        +'</p>'
        +'<button type="button" class="btn primary" id="btnHabitSetupVoiceLessonMarkDone">'
        +esc(t('habitSetupVoiceLessonMarkDone'))+'</button>';
      var markOnly=$('btnHabitSetupVoiceLessonMarkDone');
      if(markOnly){
        markOnly.onclick=function(){
          if(!setupState) return;
          if(!setupState.voiceLessons) setupState.voiceLessons={wake:false,end:false,cancel:false};
          setupState.voiceLessons[lessonId]=true;
          if(setupState.qsMode&&lessonId==='wake'){
            openVoiceLesson('end');
            return;
          }
          demoHost.hidden=true;
          demoHost.innerHTML='';
          setupState.activeVoiceLesson='';
          renderVoiceLessonPage();
        };
      }
      return;
    }
    var practiceMode=lessonId==='end'?'end':(lessonId==='cancel'?'cancel':'wake');
    var phrases=lessonId==='end'?getVoiceEndPhrases():(lessonId==='cancel'?getVoiceCancelPhrases():getWakePhrases());
    var options=lessonId==='end'?getVoiceEndPhrases():(lessonId==='cancel'?getVoiceCancelPhrases():WAKE_PRESET_OPTIONS.slice());
    var sceneTitle=lessonId==='end'?t('habitSetupVoiceLessonEndTitle'):(lessonId==='cancel'?t('habitSetupVoiceLessonCancelTitle'):t('habitSetupVoiceLessonWakeTitle'));
    var userBubble=lessonId==='wake'?'…':(lessonId==='end'?'…正在输入':'…');
    var aiBubble=lessonId==='end'
      ?(setupState.qsMode?(t('qsVoiceSceneEnd')||'听写中 · 可说结束词停听写'):'说“结束输入”完成')
      :(lessonId==='cancel'?'说“取消输入”放弃'
        :(setupState.qsMode?(t('qsVoiceSceneWake')||'先说激活词开始听写'):'说“开始输入”启动'));
    var hintKey=lessonId==='end'?'phrasePracticeHintEnd':(lessonId==='cancel'?'phrasePracticeHintCancel':'phrasePracticeHint');
    var practiceHint=setupState.qsMode
      ?(lessonId==='end'
        ?(t('qsVoicePracticeHintEnd')||t('phrasePracticeHintEnd'))
        :(t('qsVoicePracticeHintWake')||t('phrasePracticeHint')))
      :'';
    var mountId='habitSetupVoiceLessonPracticeMount';
    var keyHint=lessonId==='cancel'
      ?('<p class="habit-setup-cancel-demo">'+esc(t('habitSetupVoiceLessonCancelKeyHint'))+'</p>')
      :'';
    var customRow=setupState.qsMode
      ?''
      :('<div class="habit-setup-voice-custom-row">'
        +'<input type="text" id="habitSetupVoiceLessonCustomInput" class="voice-phrase-custom-input"'
        +' placeholder="'+esc(t(hintKey))+'" />'
        +'<button type="button" class="voice-phrase-custom-add" id="btnHabitSetupVoiceLessonAdd">'+esc(t('voicePhraseAdd'))+'</button>'
        +'</div>');
    demoHost.innerHTML=
      '<div class="habit-setup-voice-scene habit-setup-voice-scene--'+esc(lessonId)+'" aria-hidden="true">'
      +'<div class="habit-setup-voice-scene-label">'+esc(sceneTitle)+'</div>'
      +'<div class="habit-setup-voice-scene-chat">'
      +'<span class="habit-setup-voice-bubble is-user">'+esc(userBubble)+'</span>'
      +'<span class="habit-setup-voice-bubble is-ai">'+esc(aiBubble)+'</span>'
      +'</div>'
      +'</div>'
      +keyHint
      +customRow
      +'<div id="'+mountId+'"></div>'
      +'<button type="button" class="btn ghost" id="btnHabitSetupVoiceLessonMarkDone" style="margin-top:8px">'
      +esc(t('habitSetupVoiceLessonMarkDone'))+'</button>';
    function updateSceneBubble(heard){
      var bubble=demoHost.querySelector('.habit-setup-voice-bubble.is-user');
      if(!bubble) return;
      var text=String(heard||'').trim();
      bubble.textContent=text||userBubble;
    }
    function advanceOrFinishLesson(){
      if(!setupState) return;
      if(!setupState.voiceLessons) setupState.voiceLessons={wake:false,end:false,cancel:false};
      setupState.voiceLessons[lessonId]=true;
      if(setupState.qsMode&&lessonId==='wake'){
        openVoiceLesson('end');
        return;
      }
      clearVoiceLessonPractice();
      demoHost.hidden=true;
      demoHost.innerHTML='';
      setupState.activeVoiceLesson='';
      renderVoiceLessonPage();
    }
    function markLessonDone(){
      advanceOrFinishLesson();
    }
    var markBtn=$('btnHabitSetupVoiceLessonMarkDone');
    if(markBtn) markBtn.onclick=markLessonDone;
    var customInput=$('habitSetupVoiceLessonCustomInput');
    var addBtn=$('btnHabitSetupVoiceLessonAdd');
    function rebindPractice(nextPhrases){
      var list=Array.isArray(nextPhrases)?nextPhrases.slice():phrases.slice();
      if(!list.length) list=phrases.slice();
      global.OneTonePhrasePractice.open({
        embedded:true,
        mount:'#'+mountId,
        mode:practiceMode,
        phrases:list,
        phraseOptions:options,
        multiSelect:!setupState.qsMode,
        hintText:practiceHint,
        onPhrasesChange:function(next){
          phrases=Array.isArray(next)&&next.length?next.slice():phrases.slice();
        },
        onMatch:function(){
          advanceOrFinishLesson();
        },
        onHeardChange:updateSceneBubble,
        onSkip:function(){
          clearVoiceLessonPractice();
          demoHost.hidden=true;
          demoHost.innerHTML='';
          setupState.activeVoiceLesson='';
          renderVoiceLessonPage();
        }
      });
    }
    function addCustomPhrase(){
      if(!customInput) return;
      var text=String(customInput.value||'').trim();
      if(!text) return;
      if(options.indexOf(text)<0) options.push(text);
      if(phrases.indexOf(text)<0) phrases.push(text);
      customInput.value='';
      rebindPractice(phrases);
    }
    if(addBtn) addBtn.onclick=addCustomPhrase;
    if(customInput){
      customInput.onkeydown=function(e){
        if(e.key!=='Enter') return;
        e.preventDefault();
        addCustomPhrase();
      };
    }
    rebindPractice(phrases);
    renderVoiceLessonPage();
  }

  function cancelActiveRecording(){
    var rec=global.OneToneMappingRecording;
    if(!rec) return;
    try{
      if(rec.mode&&rec.mode()!=='none'){
        if(rec.cancel) rec.cancel();
        else if(rec.cancelDraftOrRecording) rec.cancelDraftOrRecording();
      }
    }catch(_){}
  }

  function applyImePreset(preset){
    if(!setupState||!preset) return;
    var m=mappingById(setupState.mappingId);
    if(!m) return;
    stopRecordOverlay();
    setupState.imePresetId=preset.id;
    setupState.imeCustomSelected=false;
    setupState.activationTestPassed=false;
    setupState.triggerTestPassed=false;
    setupState.recordPreviewKey=preset.targetKey;
    setupState.activationRecordedKey=preset.targetKey;
    if(setupState.maxReachedPage>1) setupState.maxReachedPage=1;
    persistImeActivation(m,preset.targetKey,preset.id,{deferSave:true});
    setupState.recordRejectMsg='';
    setupState.activationHint=t('habitSetupImePresetChosen')
      .replace('{ime}',t(preset.nameKey))
      .replace('{key}',friendlyKey(preset.targetKey));
    renderImeGrid();
    renderActivationSummary();
    renderWizardFooters();
  }

  function startImeCustomRecord(){
    if(!setupState) return;
    var m=mappingById(setupState.mappingId);
    setupState.imePresetId='';
    setupState.imeCustomSelected=true;
    setupState.activationHint='';
    setupState.activationRecordedKey='';
    setupState.recordPreviewKey='';
    setupState.recordAwaitingConfirm=false;
    setupState.recordConfirmPending=false;
    setupState.recordRejectMsg='';
    setupState.recordStartFailed=false;
    setupState.targetKeyBeforeRecord=m&&m.targetKey?String(m.targetKey):'';
    if(m) m.imePresetId='';
    setupState.subMode='record';
    pushOverlay('habitSub');
    syncRecordPanelVisibility();
    showRecordPanel();
    renderRecordSub();
    renderWizardFooters();
    startTargetRecording();
  }

  function syncRecordPanelVisibility(){
    var subHost=$('habitSetupSubHost');
    var recordPanel=$('habitSetupRecordPanel');
    var selectedPanel=$('habitSetupImeSelected');
    var body=$('habitSetupActivationBody');
    var recording=!!(setupState&&setupState.subMode==='record');
    if(body) body.classList.toggle('is-recording',recording);
    if(subHost){
      subHost.hidden=!recording;
      subHost.classList.toggle('is-recording',recording);
    }
    if(recordPanel) recordPanel.hidden=!recording;
    if(selectedPanel) selectedPanel.hidden=recording||!activationTargetKey();
  }

  function finalizeRecordConfirm(key){
    if(!setupState) return;
    key=String(key||'').trim();
    if(!key) return;
    var m=mappingById(setupState.mappingId);
    if(m&&String(m.targetKey||'').trim()!==key){
      persistCustomTargetKey(m,key,{deferSave:true});
    }
    setupState.imePresetId='';
    setupState.imeCustomSelected=true;
    setupState.activationRecordedKey=key;
    setupState.recordPreviewKey=key;
    setupState.recordAwaitingConfirm=false;
    setupState.recordConfirmPending=false;
    setupState.subMode=null;
    setupState.activationHint=t('habitSetupImeCustomChosen').replace('{key}',friendlyKey(key));
    popOverlay('habitSub');
    clearTargetHook();
    cancelActiveRecording();
    syncRecordPanelVisibility();
    renderImeGrid();
    renderActivationSummary();
    renderWizardFooters();
  }

  function renderImeSelected(){
    var panel=$('habitSetupImeSelected');
    if(!panel||!setupState) return;
    if(setupState.subMode==='record'){
      panel.hidden=true;
      return;
    }
    var key=activationTargetKey();
    if(!key){
      panel.hidden=true;
      return;
    }
    var presetId='';
    if(!setupState.imeCustomSelected){
      presetId=String(setupState.imePresetId||'').trim();
      if(!presetId){
        var m=mappingById(setupState.mappingId);
        presetId=m&&String(m.imePresetId||'').trim()||'';
      }
    }
    var preset=presetId?imePresetById(presetId):null;
    var iconEl=$('habitSetupTargetImeIcon');
    var customIcon=$('habitSetupImeCustomIcon');
    var nameEl=$('habitSetupImeSelectedName');
    var keyEl=$('habitSetupImeSelectedKey');
    var reBtn=$('btnHabitSetupImeReRecord');
    if(reBtn) reBtn.textContent=t('habitSetupImeReRecord');
    panel.hidden=false;
    if(preset&&iconEl&&String(preset.icon||'').trim()){
      iconEl.src=preset.icon;
      iconEl.alt=t(preset.nameKey);
      iconEl.hidden=false;
      iconEl.classList.remove('is-placeholder');
      if(customIcon) customIcon.hidden=true;
      if(nameEl) nameEl.textContent=t(preset.nameKey);
    }else{
      if(iconEl){
        iconEl.hidden=true;
        iconEl.classList.add('is-placeholder');
        iconEl.removeAttribute('src');
      }
      if(customIcon) customIcon.hidden=false;
      if(nameEl) nameEl.textContent=t('habitSetupImeCustomName');
    }
    if(keyEl){
      keyEl.innerHTML='<span class="habit-setup-status-dot is-ok" aria-hidden="true"></span>'
        +esc(t('habitSetupImeSelectedLabel').replace('{key}',friendlyKey(key)));
    }
  }

  function renderImeGrid(){
    var host=$('habitSetupImeGrid');
    if(!host||!setupState) return;
    if(setupState.subMode==='record') return;
    var selectedPresetId=String(setupState.imePresetId||'').trim();
    var hasCustom=!!setupState.imeCustomSelected||(!selectedPresetId&&!!activationTargetKey());
    var customSelected=hasCustom&&!selectedPresetId;
    var html=imePresets().map(function(p){
      var selected=selectedPresetId===p.id;
      var label=t(p.nameKey);
      var keyLabel=friendlyKey(p.targetKey);
      var icon=String(p.icon||'').trim();
      // Never emit empty src — WebView treats it as the current document and can freeze.
      var iconHtml=icon
        ?('<img class="habit-setup-ime-card-icon" src="'+esc(icon)+'" alt="" decoding="async" />')
        :('<span class="habit-setup-ime-card-icon habit-setup-ime-card-icon--custom" aria-hidden="true"></span>');
      return '<button type="button" class="habit-setup-ime-card'+(selected?' is-selected':'')+'" data-habit-ime="'+esc(p.id)+'" aria-pressed="'+(selected?'true':'false')+'">'
        +iconHtml
        +'<b>'+esc(label)+'</b>'
        +'<span>'+esc(keyLabel)+'</span>'
        +'</button>';
    }).join('');
    html+='<button type="button" class="habit-setup-ime-card'+(customSelected&&!selectedPresetId?' is-selected':'')+'" data-habit-ime-custom="1" aria-pressed="'+(customSelected&&!selectedPresetId?'true':'false')+'">'
      +'<img class="habit-setup-ime-card-icon" src="icons/ime/custom.svg" alt="" decoding="async" />'
      +'<b>'+esc(t('habitSetupImeGridCustom'))+'</b>'
      +'<span>'+esc(t('habitSetupImeGridCustomDesc'))+'</span>'
      +'</button>';
    host.innerHTML=html;
    renderImeSelected();
    renderWizardFooters();
  }

  function renderImeStep(){
    syncRecordPanelVisibility();
    if(setupState&&setupState.subMode==='record'){
      renderActivationSummary();
      renderRecordSub();
      return;
    }
    renderImeGrid();
    renderActivationSummary();
    renderRecordSub();
    renderImeSelected();
  }

  function getRecordSessionKey(){
    if(!setupState) return '';
    var preview=String(setupState.recordPreviewKey||'').trim();
    if(preview) return preview;
    if(!setupState.recordAwaitingConfirm) return '';
    var m=mappingById(setupState.mappingId);
    var savedKey=m&&String(m.targetKey||'').trim();
    if(savedKey&&savedKey!==String(setupState.targetKeyBeforeRecord||'')) return savedKey;
    return '';
  }

  function renderRecordSub(){
    var status=$('habitSetupRecordStatus');
    if(!status||!setupState) return;
    if(setupState.recordRejectMsg){
      status.innerHTML='<span class="habit-setup-status-dot is-wait" aria-hidden="true"></span>'+esc(setupState.recordRejectMsg);
      return;
    }
    var capturedKey=getRecordSessionKey();
    if(capturedKey){
      setupState.recordAwaitingConfirm=true;
      setupState.recordPreviewKey=capturedKey;
      setupState.activationRecordedKey=capturedKey;
      status.innerHTML='<span class="habit-setup-status-dot is-ok" aria-hidden="true"></span>'
        +esc(t('habitSetupRecordCaptured').replace('{key}',friendlyKey(capturedKey)));
      syncRecordPanelVisibility();
      renderWizardFooters();
      return;
    }
    if(setupState.recordStartFailed){
      status.innerHTML='<span class="habit-setup-status-dot is-wait" aria-hidden="true"></span>'+esc(t('habitSetupRecordStartFailed'));
      return;
    }
    var rec=global.OneToneMappingRecording;
    if(rec&&rec.mode&&rec.mode()==='target'){
      status.innerHTML='<span class="habit-setup-status-dot is-wait" aria-hidden="true"></span>'+esc(t('habitSetupRecordTargetWaiting'));
      return;
    }
    status.innerHTML='<span class="habit-setup-status-dot is-wait" aria-hidden="true"></span>'+esc(t('habitSetupRecordStarting'));
  }

  function refreshRecordStatus(previewKey){
    if(!setupState||setupState.subMode!=='record'||setupState.recordAwaitingConfirm) return;
    var key=String(previewKey||'').trim();
    if(!key) return;
    if(key===setupState.targetKeyBeforeRecord) return;
    setupState.recordPreviewKey=key;
    // Preview only; finalize on commit (onTargetCaptured). Early finalize raced cancel/start.
    renderRecordSub();
  }

  function renderModeSection(){
    var grid=$('habitSetupModeGrid');
    var saveBtn=$('btnHabitSetupSave');
    if(!setupState||!grid) return;
    var compatOk=!!(
      setupState.modeCompatTested
      &&setupState.modeCompatResult
      &&String(setupState.modeCompatResult.verdict||'')!=='unrecognized'
    );
    var canSave=!!setupState.triggerTestPassed&&compatOk;
    if(saveBtn) saveBtn.disabled=!canSave;
    var m=mappingById(setupState.mappingId);
    var trigLabel=friendlyKey(m&&m.triggerKey)||t('triggerPlaceholder');
    var selected=setupState.triggerMode||'tap';
    var viable=modeCompatViableModes();
    var recommended=setupState.modeCompatResult?String(setupState.modeCompatResult.recommendedMode||'').trim():'';
    var styles=[
      { id:'tap', anim:'tap', title:t('homeTestPickTapTitle'), desc:t('homeTestPickTapDesc') },
      { id:'double', anim:'double', title:t('homeTestPickDoubleTitle'), desc:t('homeTestPickDoubleDesc') },
      { id:'hold', anim:'hold', title:t('homeTestPickHoldTitle'), desc:t('homeTestPickHoldDesc') }
    ];
    grid.innerHTML=styles.map(function(s){
      var sel=s.id===selected;
      var discouraged=!!(setupState.modeCompatTested&&viable&&viable.length&&viable.indexOf(s.id)<0);
      var holdSupported=s.id==='hold'&&setupState.modeCompatTested
        &&String(setupState.modeCompatResult&&setupState.modeCompatResult.verdict||'')==='hold_capable';
      // Soft-deprecate: do not mark hold as "recommended" even if backend says so.
      var rec=setupState.modeCompatTested&&recommended===s.id&&s.id!=='hold';
      var cls='template-pick-card'+(sel?' is-selected':'')+(rec?' is-recommended':'')+(discouraged?' is-discouraged':'')+(holdSupported?' is-hold-supported':'');
      var animHtml='';
      if(s.anim==='hold'){
        animHtml='<div class="tp-demo"><div class="tp-hold-label">按住中</div><div class="tp-key">'+esc(trigLabel)+'</div>'
          +'<div class="tp-wave-hold"><div class="b"></div><div class="b"></div><div class="b"></div><div class="b"></div>'
          +'<div class="b"></div><div class="b"></div><div class="b"></div><div class="b"></div></div>'
          +'<div class="tp-hold-bar"><div class="tp-hold-bar-fill"></div></div></div>';
      }else if(s.anim==='tap'){
        animHtml='<div class="tp-demo"><div class="tp-tap-label">单击 '+esc(trigLabel)+'</div><div class="tp-key">'+esc(trigLabel)+'</div>'
          +'<div class="tp-tap-wave"><div class="b"></div><div class="b"></div><div class="b"></div><div class="b"></div><div class="b"></div></div></div>';
      }else{
        animHtml='<div class="tp-demo"><div class="tp-double-hint">连按 '+esc(trigLabel)+' 两次</div><div class="tp-key">'+esc(trigLabel)+'</div><div class="tp-double-count">×2</div></div>';
      }
      var badge='';
      if(rec) badge='<span class="habit-setup-mode-rec-badge">'+esc(t('habitSetupModeCompatRecommended'))+'</span>';
      else if(holdSupported) badge='<span class="habit-setup-mode-rec-badge is-supported">'+esc(t('keysHoldGateSupportedShort'))+'</span>';
      return '<button type="button" class="'+cls+'" data-habit-setup-mode="'+esc(s.id)+'" aria-pressed="'+(sel?'true':'false')+'">'
        +badge
        +'<div class="template-pick-card-anim template-pick-card-anim--'+esc(s.anim)+'" aria-hidden="true">'+animHtml+'</div>'
        +'<b>'+esc(s.title)+'</b><span class="template-pick-desc">'+esc(s.desc)+'</span></button>';
    }).join('');
    var actSummary=$('habitSetupTriggerSummary');
    if(actSummary&&setupState&&setupState.page===3) actSummary.textContent='';
    var modeSummary=$('habitSetupModeTriggerSummary');
    if(modeSummary) modeSummary.textContent=t('habitSetupModeSummary').replace('{key}',trigLabel);
    var lockHint=$('habitSetupModeLock');
    if(lockHint){
      if(!setupState.triggerTestPassed) lockHint.textContent=t('habitSetupModeLockedTrigger');
      else if(!compatOk) lockHint.textContent=t('habitSetupModeLockedCompat');
      else lockHint.textContent='';
    }
    var gridHint=$('habitSetupModeCompatGridHint');
    if(gridHint){
      gridHint.textContent=!setupState.modeCompatTested?t('habitSetupModeCompatGridHint'):'';
      gridHint.hidden=!!setupState.modeCompatTested;
    }
    renderModeCompatPanel();
    renderModeMismatch();
  }

  function renderActivationSummary(){
    var el=$('habitSetupTriggerSummary');
    if(!el||!setupState||setupState.page!==1) return;
    if(setupState.activationHint){
      el.textContent=setupState.activationHint;
      el.hidden=false;
      return;
    }
    el.textContent='';
    el.hidden=true;
  }

  function renderPage(){
    if(!setupState) return;
    if($('habitSetupTriggerBadge')) $('habitSetupTriggerBadge').textContent=t('habitSetupTriggerTestBadge');
    if($('habitSetupTriggerTitle')) $('habitSetupTriggerTitle').textContent=t('habitSetupTriggerTestTitle');
    if($('habitSetupTriggerDesc')) $('habitSetupTriggerDesc').textContent=t('habitSetupTriggerTestDesc');
    if($('habitSetupTriggerGateNote')) $('habitSetupTriggerGateNote').textContent=t('habitSetupTriggerGateNote');
    if($('habitSetupTriggerGateLater')) $('habitSetupTriggerGateLater').textContent=t('habitSetupTriggerGateLater');
    if($('btnHabitSetupTriggerKeep')) $('btnHabitSetupTriggerKeep').textContent=t('habitSetupTriggerKeep');
    if($('btnHabitSetupTriggerNeedExtra')) $('btnHabitSetupTriggerNeedExtra').textContent=t('habitSetupTriggerNeedExtra');
    if($('btnHabitSetupTriggerBackToGate')) $('btnHabitSetupTriggerBackToGate').textContent=t('habitSetupTriggerBackToGate');
    if($('habitSetupTriggerFbKeepText')) syncGateKeepKeyboard();
    if($('habitSetupTriggerDev0')) $('habitSetupTriggerDev0').textContent=t('habitSetupTriggerDevRing');
    if($('habitSetupTriggerDev1')) $('habitSetupTriggerDev1').textContent=t('habitSetupTriggerDevMouse');
    if($('habitSetupTriggerDev2')) $('habitSetupTriggerDev2').textContent=t('habitSetupTriggerDevRemote');
    if($('habitSetupTriggerDev3')) $('habitSetupTriggerDev3').textContent=t('habitSetupTriggerDevPad');
    updateGateDeviceFeedbackText();
    if($('habitSetupKeyTestTitle')) $('habitSetupKeyTestTitle').textContent=t('habitSetupKeyTestTitle');
    if($('habitSetupActivationBadge')) $('habitSetupActivationBadge').textContent=t('habitSetupActivationBadge');
    if($('habitSetupActivationTitle')) $('habitSetupActivationTitle').textContent=t('habitSetupActivationTitle');
    if($('habitSetupActivationDesc')) $('habitSetupActivationDesc').textContent=t('habitSetupActivationDesc');
    if($('btnHabitSetupImeReRecord')) $('btnHabitSetupImeReRecord').textContent=t('habitSetupImeReRecord');
    if($('habitSetupModeBadge')) $('habitSetupModeBadge').textContent=t('habitSetupModeBadge');
    if($('habitSetupModePageTitle')) $('habitSetupModePageTitle').textContent=t('homeTestPickTitle');
    if($('habitSetupModePageDesc')) $('habitSetupModePageDesc').textContent=t('habitSetupModeDesc');
    if($('btnHabitSetupSave')) $('btnHabitSetupSave').textContent=t('habitSetupNext');
    if($('btnHabitSetupRecordBack')) $('btnHabitSetupRecordBack').textContent=t('habitSetupSubBack');
    renderStepProgress();
    if(setupState.page===2){
      renderTriggerScenarioGate();
      if(setupState.triggerScenario==='need_extra'){
        renderTriggerKeyboard();
        renderTriggerTestPanels();
      }
    }else if(!setupState.qsMode&&(setupState.page===3||setupState.page===4)){
      /* non-QS later pages: no trigger paint */
    }
    if(setupState.page===1||!setupState.qsMode) renderImeStep();
    if(!setupState.qsMode) renderModeSection();
    if(setupState.page===4||!setupState.qsMode) renderVoiceLessonPage();
    setPage(setupState.page);
    syncRecordPanelVisibility();
  }

  function closeWakePractice(){
    if(global.OneTonePhrasePractice&&global.OneTonePhrasePractice.isOpen&&global.OneTonePhrasePractice.isOpen()){
      global.OneTonePhrasePractice.close({silent:true});
    }
    var host=$('habitSetupWakePracticeHost');
    if(host) host.innerHTML='';
  }

  function closeSubHost(){
    closeWakePractice();
    stopRecordOverlay();
    if(setupState){
      setupState.awaitingTargetCommit=false;
    }
    syncRecordPanelVisibility();
    renderImeGrid();
    renderImeSelected();
    renderRecordSub();
    renderWizardFooters();
  }

  function onActivationTestSuccess(){
    if(!setupState) return;
    setupState.activationTestPassed=true;
    setupState.activationTestPending=false;
    bumpMaxReached(2);
    closeSubHost();
    renderPage();
  }

  function onActivationTestFail(){
    if(!setupState) return;
    setupState.activationTestPending=false;
    renderPage();
  }

  function onTriggerTestSuccess(){
    markTriggerRecorded();
  }

  function onTriggerTestFail(){
    if(!setupState) return;
    setupState.awaitingTriggerTest=false;
    renderPage();
  }

  function stopRecordOverlay(){
    clearTargetHook();
    try{
      if(global.OneToneMappingRecording&&global.OneToneMappingRecording.invokeStop){
        global.OneToneMappingRecording.invokeStop();
      }
    }catch(_){}
    cancelActiveRecording();
    if(setupState){
      setupState.subMode=null;
      setupState.recordAwaitingConfirm=false;
      setupState.recordRejectMsg='';
      setupState.recordStartFailed=false;
    }
    popOverlay('habitSub');
  }

  function showRecordPanel(){
    var subHost=$('habitSetupSubHost');
    var recordPanel=$('habitSetupRecordPanel');
    if(subHost) subHost.hidden=false;
    if(recordPanel) recordPanel.hidden=false;
    var title=$('habitSetupRecordTitle');
    if(title) title.textContent=t('habitSetupImeRecordTitle');
    var backBtn=$('btnHabitSetupRecordBack');
    if(backBtn) backBtn.textContent=t('habitSetupSubBack');
  }

  function runSilentActivationSendTest(mappingId){
    if(!global.OneToneMappingTestSend||!global.OneToneMappingTestSend.fire) return;
    cancelActiveRecording();
    var attempt=0;
    function fireTest(){
      if(!setupState) return;
      var rec=global.OneToneMappingRecording;
      if(rec&&rec.mode&&rec.mode()!=='none'&&attempt<8){
        attempt++;
        setTimeout(fireTest,80);
        return;
      }
      global.OneToneMappingTestSend.fire(mappingId,{
        context:'habit-activation-test',
        silent:true,
        onResult:function(msg){
          if(!setupState||!msg||!msg.ok) return;
          setupState.activationHint=t('habitSetupActivationSent').replace('{key}',friendlyKey(msg.key||''));
          renderActivationSummary();
        }
      });
    }
    setTimeout(fireTest,120);
  }

  function markTriggerRecorded(){
    if(!setupState||setupState.page!==2) return;
    var m=mappingById(setupState.mappingId);
    var trig=m&&String(m.triggerKey||'').trim();
    if(!trig||!isAllowedTriggerKey(trig)) return;
    if(setupState.triggerTestPassed) return;
    startEmbeddedTriggerTest();
  }

  function onTargetCaptured(payload){
    if(!setupState||setupState.page!==1) return;
    var key=String(payload&&payload.key||'').trim();
    if(!key){
      var m0=mappingById(setupState.mappingId);
      key=m0&&String(m0.targetKey||'').trim();
    }
    if(!key) return;
    if(!isAllowedTargetKey(key)){
      if(global.OneToneApp&&global.OneToneApp.toast) global.OneToneApp.toast(t('leftMouseRejected'));
      cancelActiveRecording();
      renderRecordSub();
      renderImeGrid();
      return;
    }
    var m=mappingById(setupState.mappingId);
    setupState.imePresetId=String(payload&&payload.imePresetId||'').trim();
    if(!setupState.imePresetId){
      setupState.imeCustomSelected=true;
      if(m) persistCustomTargetKey(m,key,{deferSave:true});
    }else if(m){
      persistImeActivation(m,key,setupState.imePresetId,{deferSave:true});
    }
    setupState.recordPreviewKey=key;
    setupState.activationRecordedKey=key;
    if(setupState.subMode==='record'||setupState.recordConfirmPending){
      finalizeRecordConfirm(key);
      return;
    }
    setupState.recordAwaitingConfirm=true;
    renderImeSelected();
    renderWizardFooters();
  }

  function onTriggerCaptured(){
    if(!setupState||setupState.page!==2) return;
    var m=mappingById(setupState.mappingId);
    var trig=m&&String(m.triggerKey||'').trim();
    if(!isAllowedTriggerKey(trig)){
      setupState.triggerCaptured=false;
      setupState.triggerTestPassed=false;
      if(global.OneToneApp&&global.OneToneApp.toast) global.OneToneApp.toast(t('leftMouseRejected'));
      renderTriggerKeyboard();
      renderTriggerTestPanels();
      return;
    }
    setupState.triggerCaptured=true;
    renderTriggerKeyboard();
    startEmbeddedTriggerTest();
  }

  function startTargetRecording(){
    if(!setupState) return;
    var rec=global.OneToneMappingRecording;
    if(!rec||!rec.startTarget) return;
    clearSetupNativeListeners();
    var m=mappingById(setupState.mappingId);
    setupState.targetKeyBeforeRecord=m&&m.targetKey?String(m.targetKey):'';
    setupState.awaitingTargetCommit=true;
    setupState.recordRejectMsg='';
    setupState.recordPreviewKey='';
    setupState.recordAwaitingConfirm=false;
    setupState.recordConfirmPending=false;
    setupState.recordStartFailed=false;
    if(global.OneToneState&&global.OneToneState.state){
      global.OneToneState.state.selectedMappingId=setupState.mappingId;
    }
    if(rec.setSuppressAutoEnableOnce) rec.setSuppressAutoEnableOnce(true);
    installTargetHook();
    renderRecordSub();

    function beginStart(){
      if(!setupState||setupState.subMode!=='record') return;
      if(rec.setPending) rec.setPending(false);
      var started=rec.startTarget(setupState.mappingId);
      if(started&&typeof started.then==='function'){
        started.then(function(ok){
          if(!setupState||setupState.subMode!=='record') return;
          setupState.recordStartFailed=!ok;
          if(!ok) setupState.recordRejectMsg=t('habitSetupRecordStartFailed');
          renderRecordSub();
        });
      }else if(!started){
        setupState.recordStartFailed=true;
        setupState.recordRejectMsg=t('habitSetupRecordStartFailed');
        renderRecordSub();
      }
    }

    var busy=!!(rec.mode&&rec.mode()!=='none')||!!(rec.isPending&&rec.isPending());
    if(busy){
      cancelActiveRecording();
      var stop=rec.invokeStop?rec.invokeStop():Promise.resolve(true);
      Promise.resolve(stop).catch(function(){ return false; }).then(function(){
        setTimeout(beginStart,60);
      });
      return;
    }
    beginStart();
  }

  function startTriggerRecording(){
    if(!setupState) return;
    var rec=global.OneToneMappingRecording;
    if(!rec||!rec.startTrigger) return;
    if(rec.mode&&rec.mode()==='trigger') return;
    clearSetupNativeListeners();
    if(global.OneToneState&&global.OneToneState.state){
      global.OneToneState.state.selectedMappingId=setupState.mappingId;
    }
    cancelActiveRecording();
    setupState.triggerCaptured=false;
    setupState.triggerTestPassed=false;
    if(rec.setSuppressAutoEnableOnce) rec.setSuppressAutoEnableOnce(true);
    rec.startTrigger(setupState.mappingId);
    renderTriggerKeyboard();
  }

  function maybeAdvanceAfterTrigger(){
    if(!setupState||setupState.page!==2||setupState.triggerTestPassed) return;
    var m=mappingById(setupState.mappingId);
    if(!triggerPreview(m)) return;
    var rec=global.OneToneMappingRecording;
    if(rec&&rec.mode&&rec.mode()==='trigger') return;
    if(!setupState.triggerTestListening) startEmbeddedTriggerTest();
  }

  function maybeAfterTargetCommit(){
    if(!setupState||setupState.page!==1||setupState.activationTestPassed||setupState.recordAwaitingConfirm) return;
    var m=mappingById(setupState.mappingId);
    var key=m&&String(m.targetKey||'').trim();
    if(!key||key===setupState.targetKeyBeforeRecord) return;
    var rec=global.OneToneMappingRecording;
    if(rec&&rec.mode&&rec.mode()==='target') return;
    setupState.imePresetId='';
    setupState.imeCustomSelected=true;
    setupState.recordPreviewKey=key;
    setupState.activationRecordedKey=key;
    if(setupState.subMode==='record'){
      finalizeRecordConfirm(key);
      return;
    }
    setupState.recordAwaitingConfirm=true;
  }

  function startPolling(){
    clearPoll();
    var lastRecording=false;
    pollTimer=setInterval(function(){
      if(!setupState||setupState.page!==2) return;
      var recording=isTriggerRecordingActive();
      if(recording||lastRecording){
        renderTriggerStage();
        renderWizardFooters();
      }
      lastRecording=recording;
    },250);
  }

  function saveMode(){
    if(!setupState||!hasRecordedTrigger()) return;
    if(!setupState.modeCompatTested||!setupState.modeCompatResult) return;
    if(String(setupState.modeCompatResult.verdict||'')==='unrecognized') return;
    var styleId=setupState.triggerMode||'tap';
    if(styleId==='hold'){
      var viableSave=modeCompatViableModes();
      var verdictSave=String(setupState.modeCompatResult.verdict||'');
      var holdSaveOk=verdictSave==='hold_capable'||(viableSave&&viableSave.indexOf('hold')>=0);
      if(!holdSaveOk){
        if(global.OneToneApp&&global.OneToneApp.toast){
          global.OneToneApp.toast(
            t(verdictSave==='pulse_only'?'keysHoldGatePulseOnly':'keysHoldGateUntested'),
            'warn'
          );
        }
        return;
      }
    }
    var patchTriggerMode=styleId==='hold'?'longpress':(styleId==='double'?'double':'tap');
    var patchCancelEnabled=styleId==='hold'?false:true;
    var patchAutoEnterEnabled=styleId==='hold'?false:true;
    var ok=persistTriggerMode(setupState.mappingId,patchTriggerMode,patchCancelEnabled,patchAutoEnterEnabled);
    if(ok&&global.OneToneApp&&global.OneToneApp.toast){
      global.OneToneApp.toast(t('homeTestPickSaved'));
    }
    setupState.modeSaved=true;
    bumpMaxReached(4);
    goToStep(4);
  }

  function saveVoiceLesson(){
    if(!setupState) return;
    if(!setupState.modeSaved){
      var mSave=mappingById(setupState.mappingId);
      if(mSave){
        mSave.triggerMode='tap';
        mSave.cancelEnabled=true;
        mSave.autoEnterEnabled=true;
        mSave.updatedAt=Date.now();
      }
      setupState.modeSaved=true;
      try{
        saveConfig('quickStart');
      }catch(_){}
    }
    if(global.OneToneApp&&global.OneToneApp.toast&&!setupState.qsMode){
      global.OneToneApp.toast(t('homeTestPickSaved'));
    }
    if(setupState.qsMode&&typeof setupState.qsOnComplete==='function'){
      var cb=setupState.qsOnComplete;
      var meta={ persona:setupState.qsPersona||'beginner', tool:setupState.qsTool||'', mappingId:setupState.mappingId };
      closeQuiet();
      // Defer orchestrator handoff so Soft Pad / Done can paint without competing with teardown.
      setTimeout(function(){
        try{ cb(meta); }catch(_){}
      },0);
      return;
    }
    close();
  }

  function closeQuiet(){
    notifySetupInteractionActive(false);
    setVoicePracticeHoldFg(false);
    clearPoll();
    clearTargetHook();
    clearEmbeddedTriggerTest();
    stopModeCompatProbe();
    clearStep2VoicePractice();
    clearVoiceLessonPractice();
    clearVoiceMicSoftSkipTimer();
    clearVoicePracticeStageTimer();
    stopVoicePracticeDictationAnim();
    voicePracticeStagePhase='idle';
    closeWakePractice();
    resumeMappingAfterSetup();
    overlayStack=[];
    try{
      if(global.OneToneMappingRecording&&global.OneToneMappingRecording.mode
        &&global.OneToneMappingRecording.mode()!=='none'
        &&global.OneToneMappingRecording.cancelDraftOrRecording){
        global.OneToneMappingRecording.cancelDraftOrRecording();
      }
    }catch(_){}
    setupState=null;
    var activationView=$('habitSetupActivationView');
    var triggerView=$('habitSetupTriggerView');
    var modeView=$('habitSetupModeView');
    var voiceLessonView=$('habitSetupVoiceLessonView');
    if(activationView) activationView.hidden=true;
    if(triggerView) triggerView.hidden=true;
    if(modeView) modeView.hidden=true;
    if(voiceLessonView) voiceLessonView.hidden=true;
  }

  function close(){
    notifySetupInteractionActive(false);
    clearPoll();
    stopGateDeviceFeedback();
    clearTargetHook();
    clearEmbeddedTriggerTest();
    stopModeCompatProbe();
    clearStep2VoicePractice();
    clearVoiceLessonPractice();
    closeWakePractice();
    resumeMappingAfterSetup();
    overlayStack=[];
    try{
      if(global.OneToneMappingRecording&&global.OneToneMappingRecording.mode
        &&global.OneToneMappingRecording.mode()!=='none'
        &&global.OneToneMappingRecording.cancelDraftOrRecording){
        global.OneToneMappingRecording.cancelDraftOrRecording();
      }
    }catch(_){}
    setupState=null;
    var overlay=overlayEl();
    if(overlay){
      overlay.classList.remove('open');
      overlay.setAttribute('aria-hidden','true');
    }
    if(typeof document!=='undefined'){
      document.documentElement.classList.remove('habit-setup-open');
    }
  }

  function handleEsc(){
    if(standalonePracticeOpen){
      exitStandaloneQsVoicePractice();
      return true;
    }
    if(!setupState) return false;
    var top=overlayStack.length?overlayStack[overlayStack.length-1]:null;
    if(top==='confirm'){
      if(global.OneToneMappingConfirmModal&&global.OneToneMappingConfirmModal.close){
        global.OneToneMappingConfirmModal.close(false);
      }
      popOverlay('confirm');
      return true;
    }
    if(top==='testOverlay'){
      var hooks=global.__vp_app_keyboard_hooks__||{};
      if(hooks.closeTestModal) hooks.closeTestModal();
      popOverlay('testOverlay');
      return true;
    }
    if(top==='habitSub'){
      closeSubHost();
      return true;
    }
    if(setupState.page===4){
      if(setupState.qsMode){
        setupState.page=2;
        clearVoiceLessonPractice();
        renderPage();
        ensureTriggerPageReady();
        return true;
      }
      setupState.page=3;
      setupState.voiceEasterEnabled=false;
      setupState.voiceEasterSkipped=false;
      clearVoiceLessonPractice();
      renderPage();
      startModeCompatProbe();
      return true;
    }
    if(setupState.page===3){
      stopModeCompatProbe();
      setupState.page=2;
      setupState.triggerTestPassed=false;
      setupState.triggerCaptured=!!triggerPreview(mappingById(setupState.mappingId));
      setupState.awaitingTriggerTest=false;
      clearVoiceLessonPractice();
      renderPage();
      ensureTriggerPageReady();
      return true;
    }
    if(setupState.page===2){
      goToStep(1);
      return true;
    }
    if(setupState.qsMode){
      closeQuiet();
      return true;
    }
    close();
    return true;
  }

  function open(opts){
    opts=opts||{};
    var m=ensureGlobalMapping();
    if(!m||!m.id){
      if(global.OneToneApp&&global.OneToneApp.toast) global.OneToneApp.toast(t('onboardTryTestUnavailable'));
      return;
    }
    var qsMode=!!opts.qsMode;
    var rawMode=String(m.triggerMode||'tap').toLowerCase();
    var triggerMode='tap';
    if(!qsMode){
      if(rawMode==='double') triggerMode='double';
      else if(rawMode==='hold'||rawMode==='longpress'||rawMode==='perpress') triggerMode='hold';
    }
    var hasTrigger=!!String(m.triggerKey||'').trim();
    var hasTargetKey=!!String(m.targetKey||'').trim();
    var hasWake=!!(m.voiceOverride&&m.voiceOverride.wakePhrases&&m.voiceOverride.wakePhrases.length);
    var hasActivation=hasTargetKey||hasWake;
    var imePresetId=String(m.imePresetId||'').trim();
    overlayStack=[];
    var maxReachedPage=1;
    if(hasActivation) maxReachedPage=2;
    if(hasTrigger) maxReachedPage=qsMode?2:3;
    setupState={
      mappingId:m.id,
      page:1,
      maxReachedPage:maxReachedPage,
      triggerMode:triggerMode,
      imePresetId:imePresetId,
      imeCustomSelected:!!hasTargetKey&&!imePresetId,
      activationTestPassed:hasActivation,
      triggerTestPassed:false,
      triggerCaptured:hasTrigger,
      awaitingTriggerTest:false,
      subMode:null,
      awaitingTargetCommit:false,
      recordRejectMsg:'',
      targetKeyBeforeRecord:'',
      recordPreviewKey:hasTargetKey?String(m.targetKey):'',
      recordStartFailed:false,
      activationTestPending:false,
      activationRecordedKey:hasTargetKey?String(m.targetKey):'',
      activationHint:'',
      triggerTestListening:false,
      modeCompatListening:false,
      modeCompatTested:false,
      modeCompatResult:null,
      modeCompatHeard:'',
      modeCompatStartFailed:false,
      modeCompatStartReason:'',
      modeCompatPickHint:false,
      modeSaved:!!qsMode,
      voiceEasterEnabled:!!qsMode,
      voiceEasterSkipped:false,
      voiceStep4Passed:false,
      voiceStep4Pending:false,
      recordAwaitingConfirm:false,
      recordConfirmPending:false,
      voiceLessons:qsMode?{wake:false,end:false,cancel:true}:{wake:false,end:false,cancel:false},
      activeVoiceLesson:'',
      voiceMicGate:'pending',
      qsMode:qsMode,
      triggerScenario:'undecided',
      qsPersona:opts.persona||null,
      qsTool:opts.tool||'',
      qsOnComplete:typeof opts.onComplete==='function'?opts.onComplete:null,
      imeMoreOpen:false
    };
    cancelActiveRecording();
    if(global.OneToneState&&global.OneToneState.state){
      global.OneToneState.state.selectedMappingId=m.id;
    }
    notifySetupInteractionActive(true);
    renderPage();
    var overlay=overlayEl();
    if(overlay){
      overlay.classList.add('open');
      overlay.setAttribute('aria-hidden','false');
    }
    if(typeof document!=='undefined'){
      document.documentElement.classList.add('habit-setup-open');
    }
    startPolling();
  }

  function bindOnce(){
    if(bound) return;
    bound=true;
    var overlay=overlayEl();
    if(overlay){
      overlay.addEventListener('click',function(e){
        if(e.target===overlay) return;
        var stepBtn=e.target&&e.target.closest?e.target.closest('[data-habit-step]'):null;
        if(stepBtn){
          goToStep(parseInt(stepBtn.getAttribute('data-habit-step')||'1',10));
          return;
        }
        var actBtn=e.target&&e.target.closest?e.target.closest('[data-habit-ime]'):null;
        if(actBtn&&setupState&&setupState.page===1){
          var preset=imePresetById(String(actBtn.getAttribute('data-habit-ime')||''));
          if(preset) applyImePreset(preset);
          return;
        }
        var customImeBtn=e.target&&e.target.closest?e.target.closest('[data-habit-ime-custom]'):null;
        if(customImeBtn&&setupState&&setupState.page===1){
          startImeCustomRecord();
          return;
        }
        var modeBtn=e.target&&e.target.closest?e.target.closest('[data-habit-setup-mode]'):null;
        if(modeBtn&&setupState&&setupState.page===3){
          var pickMode=String(modeBtn.getAttribute('data-habit-setup-mode')||'tap');
          if(pickMode==='hold'&&setupState.modeCompatTested){
            var viablePick=modeCompatViableModes();
            var verdictPick=String(setupState.modeCompatResult&&setupState.modeCompatResult.verdict||'');
            var holdOk=verdictPick==='hold_capable'||(viablePick&&viablePick.indexOf('hold')>=0);
            if(!holdOk){
              if(global.OneToneApp&&global.OneToneApp.toast){
                global.OneToneApp.toast(
                  t(verdictPick==='pulse_only'?'keysHoldGatePulseOnly':'keysHoldGateUntested'),
                  'warn'
                );
              }
              renderModeSection();
              return;
            }
          }
          if(!setupState.modeCompatTested){
            setupState.modeCompatPickHint=true;
          }
          setupState.triggerMode=pickMode;
          renderModeSection();
        }
        var lessonBtn=e.target&&e.target.closest?e.target.closest('[data-voice-lesson]'):null;
        if(lessonBtn&&setupState&&setupState.page===4){
          openVoiceLesson(String(lessonBtn.getAttribute('data-voice-lesson')||''));
          return;
        }
        if(e.target&&e.target.id==='btnHabitSetupVoiceStep4Try'){
          if(isVoiceOnlyActivation()) openStep4WakeVoiceTest();
          else runStep4VoiceTest();
        }
      });
    }
    bindClick('btnHabitSetupClose',close);
    bindClick('btnHabitSetupActivationClose',close);
    bindClick('btnHabitSetupModeClose',close);
    bindClick('btnHabitSetupVoiceLessonClose',close);
    /* header back: owned by OneToneQuickStart.bindOnce (QS + standalone habit) */
    bindClick('btnHabitSetupRecordBack',closeSubHost);
    bindClick('btnHabitSetupImeReRecord',startImeCustomRecord);
    bindClick('btnHabitSetupNext',goNext);
    bindClick('btnHabitSetupNextTrigger',goNext);
    bindClick('btnHabitSetupTriggerKeep',chooseTriggerKeepExisting);
    bindClick('btnHabitSetupTriggerNeedExtra',chooseTriggerNeedExtra);
    bindClick('btnHabitSetupTriggerBackToGate',backToTriggerGate);
    var parallel=$('habitSetupTriggerParallel');
    if(parallel&&!parallel._htvHoverBound){
      parallel._htvHoverBound=true;
      var cols=parallel.querySelectorAll('.habit-setup-trigger-col');
      for(var ci=0;ci<cols.length;ci++){
        (function(col){
          col.addEventListener('pointerenter',function(){ setTriggerGateColHot(col,true); });
          col.addEventListener('pointerleave',function(){ setTriggerGateColHot(col,false); });
        })(cols[ci]);
      }
    }
    bindClick('btnHabitSetupTriggerStartRecord',function(){
      if(!setupState) return;
      startTriggerRecording();
    });
    bindClick('btnHabitSetupBackToActivationFromTrigger',function(){
      if(!setupState) return;
      goToStep(1);
    });
    bindClick('btnHabitSetupBack',function(){
      if(!setupState) return;
      goToStep(2);
    });
    bindClick('btnHabitSetupBackFromVoiceLesson',function(){
      if(!setupState) return;
      goToStep(setupState.qsMode?2:3);
    });
    bindClick('btnHabitSetupSave',saveMode);
    bindClick('btnHabitSetupSaveVoice',saveVoiceLesson);
    bindClick('btnHabitSetupVoiceMicContinue',finishVoiceMicSoftSkip);
    bindClick('btnHabitSetupVoiceMicRecheck',chooseVoiceMicRecheck);
    bindClick('btnHabitSetupVoicePracticeBack',function(){ exitVoicePracticeStage(); });
    bindClick('btnHabitSetupVoicePracticeMarkDone',markVoicePracticeStageDoneManual);
    bindClick('btnHabitSetupVoiceEasterTry',function(){
      if(!setupState) return;
      setupState.voiceEasterEnabled=true;
      setupState.voiceEasterSkipped=false;
      setupState.voiceStep4Passed=false;
      setupState.voiceStep4Pending=false;
      if(!setupState.voiceLessons) setupState.voiceLessons={wake:false,end:false,cancel:false};
      renderVoiceLessonPage();
    });
    bindClick('btnHabitSetupVoiceEasterSkip',function(){
      if(!setupState) return;
      setupState.voiceEasterEnabled=false;
      setupState.voiceEasterSkipped=true;
      setupState.voiceStep4Passed=false;
      setupState.voiceStep4Pending=false;
      clearVoiceLessonPractice();
      renderVoiceLessonPage();
      saveVoiceLesson();
    });
    bindClick('btnHabitSetupKeyTestRetry',function(){
      if(!setupState) return;
      logVerify('retry verify click');
      setupState.triggerTestPassed=false;
      startEmbeddedTriggerTest();
    });
    bindClick('btnHabitSetupModeCompatRetry',function(){
      if(!setupState) return;
      startModeCompatProbe();
    });
    bindClick('btnHabitSetupVoiceStep4Retry',function(){
      if(!setupState) return;
      setupState.voiceStep4Passed=false;
      setupState.voiceStep4Pending=false;
      clearStep2VoicePractice();
      if(isVoiceOnlyActivation()) openStep4WakeVoiceTest();
      else runStep4VoiceTest();
    });
  }

  function bindClick(id,handler){
    var el=$(id);
    if(el) el.onclick=handler;
  }

  function applyLang(){
    if(setupState) renderPage();
  }

  global.OneToneHabitTriggerSetup={
    open:open,
    close:close,
    closeQuiet:closeQuiet,
    handleEsc:handleEsc,
    bindOnce:bindOnce,
    applyLang:applyLang,
    refreshRecordStatus:refreshRecordStatus,
    onTargetCaptured:onTargetCaptured,
    onTriggerCaptured:onTriggerCaptured,
    onModeCompatResult:onModeCompatResult,
    onModeCompatSeen:onModeCompatSeen,
    isOpen:function(){ return !!setupState; },
    openStandaloneQsVoicePractice:openStandaloneQsVoicePractice,
    closeStandaloneQsVoicePractice:exitStandaloneQsVoicePractice,
    isStandalonePracticeOpen:function(){ return standalonePracticeOpen; }
  };
})((typeof window!=='undefined')?window:globalThis);
