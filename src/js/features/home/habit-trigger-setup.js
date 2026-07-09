(function(global){
  'use strict';

  var $=function(id){ return global.OneToneDom.$(id); };
  var t=function(key){ return global.OneToneI18n.t(key); };
  var bound=false;
  var pollTimer=0;
  var KEYBOARD_ROWS=[['ESC','~','1','2','3','4'],['Q','W','E','R','T']];
  var SUGGESTED_KEY='T';
  var WAKE_PRESET_OPTIONS=['开始输入','开始听写','打开听写','语音输入','开启输入'];
  var RISKY_KEYS={LButton:1,RButton:1,MButton:1,Escape:1,Esc:1,Space:1};
  var WIZARD_STEPS=[
    { id:1, labelKey:'habitSetupStepActivation' },
    { id:2, labelKey:'habitSetupStepTrigger' },
    { id:3, labelKey:'habitSetupStepMode' },
    { id:4, labelKey:'habitSetupStepVoiceEaster' }
  ];
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

  function clearEmbeddedTriggerTest(){
    if(triggerTestListener&&global.OneToneApp&&global.OneToneApp.off){
      global.OneToneApp.off('trigger_test_fired',triggerTestListener);
    }
    triggerTestListener=null;
    clearTimeout(triggerTestTimeout);
    triggerTestTimeout=0;
    if(setupState) setupState.triggerTestListening=false;
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
    var host=$('habitSetupVoiceLessonDemoHost');
    if(host){
      host.innerHTML='';
      host.hidden=true;
    }
  }
  var triggerTestListener=null;
  var triggerTestTimeout=0;
  var step2VoicePracticeOpen=false;
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
    if(global.chrome&&global.chrome.webview&&global.chrome.webview.postMessage){
      global.chrome.webview.postMessage({type:'mvp_stop_trigger_compat_probe'});
    }else{
      invokeCompatProbe('cmd_stop_trigger_compat_probe',{});
    }
    if(setupState){
      setupState.modeCompatListening=false;
    }
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
    setupState.modeCompatResult=msg||null;
    setupState.modeCompatHeard='';
    setupState.modeCompatPickHint=false;
    var recommended=String(msg&&msg.recommendedMode||'').trim();
    if(recommended==='hold'||recommended==='tap'||recommended==='double'){
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

  function saveConfig(){
    if(global.OneToneConfigPersist&&global.OneToneConfigPersist.save) global.OneToneConfigPersist.save();
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
    if(!key) return SUGGESTED_KEY;
    var parts=key.split('+');
    return parts[parts.length-1]||key;
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
    setupState.page=page;
    var activationView=$('habitSetupActivationView');
    var triggerView=$('habitSetupTriggerView');
    var modeView=$('habitSetupModeView');
    var voiceLessonView=$('habitSetupVoiceLessonView');
    if(activationView) activationView.hidden=page!==1;
    if(triggerView) triggerView.hidden=page!==2;
    if(modeView) modeView.hidden=page!==3;
    if(voiceLessonView) voiceLessonView.hidden=page!==4;
  }

  function bumpMaxReached(page){
    if(!setupState) return;
    setupState.maxReachedPage=Math.max(setupState.maxReachedPage||1,page);
  }

  function stepDone(step){
    if(!setupState) return false;
    if(step===1) return setupState.maxReachedPage>=2||!!setupState.activationTestPassed;
    if(step===2) return setupState.maxReachedPage>=3||triggerStepReady();
    if(step===3) return setupState.maxReachedPage>=4||!!setupState.modeSaved;
    if(step===4) return false;
    return false;
  }

  function canGoToStep(step){
    if(!setupState) return false;
    if(step===setupState.page) return true;
    if(step===1) return true;
    if(step===2) return activationStepReady();
    if(step===3) return hasRecordedTrigger();
    if(step===4) return !!setupState.modeSaved;
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
      renderPage();
      ensureTriggerPageReady();
      return;
    }
    if(setupState.page===2){
      if(!hasRecordedTrigger()) return;
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
    host.innerHTML=WIZARD_STEPS.map(function(step){
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
        +'<span class="habit-setup-step-num">'+step.id+'</span>'
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

  function triggerStepReady(){
    if(!setupState) return false;
    if(setupState.triggerTestPassed) return true;
    return hasRecordedTrigger();
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
      setFooterBtn(saveVoice,true,t('habitSetupVoiceLessonSave'));
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
    renderTriggerKeyboard();
    renderTriggerTestPanels();
  }

  function goToStep(step){
    if(!setupState||!canGoToStep(step)) return;
    if(step!==3) stopModeCompatProbe();
    if(step!==2) clearEmbeddedTriggerTest();
    if(step!==2) clearStep2VoicePractice();
    if(step!==4) clearVoiceLessonPractice();
    closeSubHost();
    setupState.page=step;
    renderPage();
    if(step===2) ensureTriggerPageReady();
    if(step===3) startModeCompatProbe();
    if(step===4) renderVoiceLessonPage();
  }

  function renderStepProgress(){
    renderStepNav();
    renderWizardFooters();
  }

  function renderTriggerKeyboard(){
    var host=$('habitSetupTriggerKeyboard');
    if(!host||!setupState) return;
    var m=mappingById(setupState.mappingId);
    var preview=setupState.triggerCaptured?triggerPreview(m):'';
    var imeKey=friendlyKey(step2ImeActivationKey())||'—';
    var triggerKey=friendlyKey(preview||'')||'—';
    var imePreset=step2ImePreset();
    var highlight=shortKeyLabel(preview||'').toUpperCase();
    var recording=isTriggerRecordingActive();
    var waiting=!preview&&recording;
    host.innerHTML=KEYBOARD_ROWS.map(function(row){
      return '<div class="habit-setup-kb-row">'+row.map(function(key){
        var isHit=!waiting&&highlight===key;
        var isSuggest=waiting&&key===SUGGESTED_KEY;
        return '<span class="habit-setup-kb-key'+(isHit?' is-hit':'')+(isSuggest?' is-suggest':'')+'">'+esc(key)+'</span>';
      }).join('')+'</div>';
    }).join('');
    var status=$('habitSetupTriggerStatus');
    if(status){
      status.classList.toggle('is-binding',!!preview);
      if(preview){
        status.innerHTML='<span class="habit-setup-status-dot '+(setupState.triggerTestPassed?'is-ok':'is-info')+'" aria-hidden="true"></span>'
          +'<div class="habit-setup-binding-hero">'
          +  '<div class="habit-setup-binding-key">'+esc(triggerKey)+'</div>'
          +  '<div class="habit-setup-binding-key-label">'+esc(t('triggerTitle'))+'</div>'
          +'</div>'
          +'<span class="habit-setup-binding-arrow" aria-hidden="true">→</span>'
          +'<div class="habit-setup-binding-hero">'
          +  '<div class="habit-setup-binding-ime">'
          +    (imePreset&&imePreset.icon
                ?('<img class="habit-setup-binding-ime-icon" src="'+esc(imePreset.icon)+'" alt="" decoding="async" />')
                :'<span class="habit-setup-binding-ime-fallback" aria-hidden="true">⌨</span>')
          +    '<span class="habit-setup-binding-key">'+esc(imeKey)+'</span>'
          +  '</div>'
          +  '<div class="habit-setup-binding-key-label">'+esc(t('targetTitle'))+'</div>'
          +'</div>'
          +'<div class="habit-setup-binding-note">'+esc(t('habitSetupTriggerKeepOrRerecord'))+'</div>';
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
        :'btn secondary habit-setup-test-retry record-btn';
      startBtn.hidden=false;
    }
    renderTriggerTestPanels();
  }

  function startEmbeddedTriggerTest(){
    if(!setupState||setupState.page!==2||setupState.triggerTestPassed) return;
    if(!setupState.triggerCaptured) return;
    var m=mappingById(setupState.mappingId);
    var trig=triggerPreview(m);
    if(!trig){
      startTriggerRecording();
      renderTriggerTestPanels();
      return;
    }
    clearEmbeddedTriggerTest();
    setupState.triggerTestListening=true;
    if(global.OneToneMappingEditActions&&global.OneToneMappingEditActions.setMappingEnabled){
      global.OneToneMappingEditActions.setMappingEnabled(setupState.mappingId,true);
    }else if(m){
      m.enabled=true;
      saveConfig();
    }
    triggerTestListener=function(msg){
      if(!setupState||String(msg&&msg.mappingId||'')!==String(setupState.mappingId||'')) return;
      clearEmbeddedTriggerTest();
      setupState.triggerTestPassed=true;
      setupState.page=2;
      bumpMaxReached(3);
      renderPage();
    };
    if(global.OneToneApp&&global.OneToneApp.on){
      global.OneToneApp.on('trigger_test_fired',triggerTestListener);
    }
    triggerTestTimeout=setTimeout(function(){
      if(!setupState||setupState.triggerTestPassed) return;
      clearEmbeddedTriggerTest();
      renderTriggerTestPanels();
    },15000);
    renderTriggerTestPanels();
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
    return !!(setupState.voiceLessons.wake&&setupState.voiceLessons.end&&setupState.voiceLessons.cancel);
  }

  function renderVoiceLessonPage(){
    if(!setupState||setupState.page!==4) return;
    var prompt=$('habitSetupVoiceEasterPrompt');
    var lessonsHost=$('habitSetupVoiceLessons');
    var demoHost=$('habitSetupVoiceLessonDemoHost');
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

  function openVoiceLesson(lessonId){
    if(!setupState||!setupState.voiceEasterEnabled) return;
    lessonId=String(lessonId||'').trim();
    if(!lessonId) return;
    setupState.activeVoiceLesson=lessonId;
    clearVoiceLessonPractice();
    var demoHost=$('habitSetupVoiceLessonDemoHost');
    if(!demoHost) return;
    demoHost.hidden=false;
    if(!global.OneTonePhrasePractice||!global.OneTonePhrasePractice.open) return;
    var practiceMode=lessonId==='end'?'end':(lessonId==='cancel'?'cancel':'wake');
    var phrases=lessonId==='end'?getVoiceEndPhrases():(lessonId==='cancel'?getVoiceCancelPhrases():getWakePhrases());
    var options=lessonId==='end'?getVoiceEndPhrases():(lessonId==='cancel'?getVoiceCancelPhrases():WAKE_PRESET_OPTIONS.slice());
    var sceneTitle=lessonId==='end'?t('habitSetupVoiceLessonEndTitle'):(lessonId==='cancel'?t('habitSetupVoiceLessonCancelTitle'):t('habitSetupVoiceLessonWakeTitle'));
    var userBubble=lessonId==='wake'?'准备开始输入':'…正在输入';
    var aiBubble=lessonId==='end'?'说“结束输入”完成':(lessonId==='cancel'?'说“取消输入”放弃':'说“开始输入”启动');
    var hintKey=lessonId==='end'?'phrasePracticeHintEnd':(lessonId==='cancel'?'phrasePracticeHintCancel':'phrasePracticeHint');
    var mountId='habitSetupVoiceLessonPracticeMount';
    var keyHint=lessonId==='cancel'
      ?('<p class="habit-setup-cancel-demo">'+esc(t('habitSetupVoiceLessonCancelKeyHint'))+'</p>')
      :'';
    demoHost.innerHTML=
      '<div class="habit-setup-voice-scene habit-setup-voice-scene--'+esc(lessonId)+'" aria-hidden="true">'
      +'<div class="habit-setup-voice-scene-label">'+esc(sceneTitle)+'</div>'
      +'<div class="habit-setup-voice-scene-chat">'
      +'<span class="habit-setup-voice-bubble is-user">'+esc(userBubble)+'</span>'
      +'<span class="habit-setup-voice-bubble is-ai">'+esc(aiBubble)+'</span>'
      +'</div>'
      +'</div>'
      +keyHint
      +'<div class="habit-setup-voice-custom-row">'
      +'<input type="text" id="habitSetupVoiceLessonCustomInput" class="voice-phrase-custom-input"'
      +' placeholder="'+esc(t(hintKey))+'" />'
      +'<button type="button" class="voice-phrase-custom-add" id="btnHabitSetupVoiceLessonAdd">'+esc(t('voicePhraseAdd'))+'</button>'
      +'</div>'
      +'<div id="'+mountId+'"></div>'
      +'<button type="button" class="btn ghost" id="btnHabitSetupVoiceLessonMarkDone" style="margin-top:8px">'
      +esc(t('habitSetupVoiceLessonMarkDone'))+'</button>';
    function updateSceneBubble(heard){
      var bubble=demoHost.querySelector('.habit-setup-voice-bubble.is-user');
      if(!bubble) return;
      var text=String(heard||'').trim();
      bubble.textContent=text||userBubble;
    }
    function markLessonDone(){
      if(!setupState) return;
      if(!setupState.voiceLessons) setupState.voiceLessons={wake:false,end:false,cancel:false};
      setupState.voiceLessons[lessonId]=true;
      clearVoiceLessonPractice();
      demoHost.hidden=true;
      demoHost.innerHTML='';
      setupState.activeVoiceLesson='';
      renderVoiceLessonPage();
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
        multiSelect:true,
        onPhrasesChange:function(next){
          phrases=Array.isArray(next)&&next.length?next.slice():phrases.slice();
        },
        onMatch:function(){
          if(!setupState) return;
          if(!setupState.voiceLessons) setupState.voiceLessons={wake:false,end:false,cancel:false};
          setupState.voiceLessons[lessonId]=true;
          clearVoiceLessonPractice();
          demoHost.hidden=true;
          demoHost.innerHTML='';
          setupState.activeVoiceLesson='';
          renderVoiceLessonPage();
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
    cancelActiveRecording();
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
    renderImeGrid();
    setupState.subMode='record';
    pushOverlay('habitSub');
    syncRecordPanelVisibility();
    showRecordPanel();
    renderRecordSub();
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
    if(preset&&iconEl){
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
      return '<button type="button" class="habit-setup-ime-card'+(selected?' is-selected':'')+'" data-habit-ime="'+esc(p.id)+'" aria-pressed="'+(selected?'true':'false')+'">'
        +'<img class="habit-setup-ime-card-icon" src="'+esc(p.icon)+'" alt="" decoding="async" />'
        +'<b>'+esc(label)+'</b>'
        +'<span>'+esc(keyLabel)+'</span>'
        +'</button>';
    }).join('');
    html+='<button type="button" class="habit-setup-ime-card'+(customSelected&&!selectedPresetId?' is-selected':'')+'" data-habit-ime-custom="1" aria-pressed="'+(customSelected&&!selectedPresetId?'true':'false')+'">'
      +'<span class="habit-setup-ime-card-icon--custom" aria-hidden="true">⌨</span>'
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
    finalizeRecordConfirm(key);
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
      { id:'hold', anim:'hold', title:t('homeTestPickHoldTitle'), desc:t('homeTestPickHoldDesc') },
      { id:'tap', anim:'tap', title:t('homeTestPickTapTitle'), desc:t('homeTestPickTapDesc') },
      { id:'double', anim:'double', title:t('homeTestPickDoubleTitle'), desc:t('homeTestPickDoubleDesc') }
    ];
    grid.innerHTML=styles.map(function(s){
      var sel=s.id===selected;
      var discouraged=!!(setupState.modeCompatTested&&viable&&viable.length&&viable.indexOf(s.id)<0);
      var rec=setupState.modeCompatTested&&recommended===s.id;
      var cls='template-pick-card'+(sel?' is-selected':'')+(rec?' is-recommended':'')+(discouraged?' is-discouraged':'');
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
      var badge=rec?'<span class="habit-setup-mode-rec-badge">'+esc(t('habitSetupModeCompatRecommended'))+'</span>':'';
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
    renderTriggerKeyboard();
    renderTriggerTestPanels();
    renderImeStep();
    renderModeSection();
    renderVoiceLessonPage();
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
    if(setupState.recordConfirmPending){
      finalizeRecordConfirm(key);
      return;
    }
    setupState.recordAwaitingConfirm=true;
    if(setupState.subMode==='record'){
      showRecordPanel();
      renderRecordSub();
      renderWizardFooters();
    }else{
      renderImeSelected();
      renderWizardFooters();
    }
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
    var m=mappingById(setupState.mappingId);
    setupState.targetKeyBeforeRecord=m&&m.targetKey?String(m.targetKey):'';
    setupState.awaitingTargetCommit=true;
    setupState.recordRejectMsg='';
    setupState.recordPreviewKey='';
    setupState.recordStartFailed=false;
    if(global.OneToneState&&global.OneToneState.state){
      global.OneToneState.state.selectedMappingId=setupState.mappingId;
    }
    cancelActiveRecording();
    if(rec.setSuppressAutoEnableOnce) rec.setSuppressAutoEnableOnce(true);
    installTargetHook();
    renderRecordSub();
    var started=rec.startTarget(setupState.mappingId);
    if(started&&typeof started.then==='function'){
      started.then(function(ok){
        if(!setupState) return;
        setupState.recordStartFailed=!ok;
        if(!ok) setupState.recordRejectMsg=t('habitSetupRecordStartFailed');
        renderRecordSub();
      });
    }
  }

  function startTriggerRecording(){
    if(!setupState) return;
    var rec=global.OneToneMappingRecording;
    if(!rec||!rec.startTrigger) return;
    if(rec.mode&&rec.mode()==='trigger') return;
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
    setupState.recordAwaitingConfirm=true;
    if(setupState.subMode==='record') renderRecordSub();
  }

  function startPolling(){
    clearPoll();
    pollTimer=setInterval(function(){
      if(!setupState) return;
      if(setupState.page===2){
        renderTriggerKeyboard();
        renderTriggerTestPanels();
      }
    },200);
  }

  function saveMode(){
    if(!setupState||!hasRecordedTrigger()) return;
    if(!setupState.modeCompatTested||!setupState.modeCompatResult) return;
    if(String(setupState.modeCompatResult.verdict||'')==='unrecognized') return;
    var styleId=setupState.triggerMode||'tap';
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
    var ok=true;
    if(!setupState.modeSaved){
      ok=persistTriggerMode(setupState.mappingId,'tap',true,true);
    }
    if(ok&&global.OneToneApp&&global.OneToneApp.toast){
      global.OneToneApp.toast(t('homeTestPickSaved'));
    }
    close();
  }

  function close(){
    clearPoll();
    clearTargetHook();
    clearEmbeddedTriggerTest();
    stopModeCompatProbe();
    clearStep2VoicePractice();
    clearVoiceLessonPractice();
    closeWakePractice();
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
      if(!setupState.activationTestPassed){
        close();
        return true;
      }
      setupState.page=1;
      setupState.awaitingTriggerTest=false;
      renderPage();
      return true;
    }
    close();
    return true;
  }

  function open(){
    var m=ensureGlobalMapping();
    if(!m||!m.id){
      if(global.OneToneApp&&global.OneToneApp.toast) global.OneToneApp.toast(t('onboardTryTestUnavailable'));
      return;
    }
    var rawMode=String(m.triggerMode||'tap').toLowerCase();
    var triggerMode='tap';
    if(rawMode==='double') triggerMode='double';
    else if(rawMode==='hold'||rawMode==='longpress'||rawMode==='perpress') triggerMode='hold';
    var hasTrigger=!!String(m.triggerKey||'').trim();
    var hasTargetKey=!!String(m.targetKey||'').trim();
    var hasWake=!!(m.voiceOverride&&m.voiceOverride.wakePhrases&&m.voiceOverride.wakePhrases.length);
    var hasActivation=hasTargetKey||hasWake;
    var imePresetId=String(m.imePresetId||'').trim();
    overlayStack=[];
    var maxReachedPage=1;
    if(hasActivation) maxReachedPage=2;
    if(hasTrigger) maxReachedPage=3;
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
      modeSaved:false,
      voiceEasterEnabled:false,
      voiceEasterSkipped:false,
      voiceStep4Passed:false,
      voiceStep4Pending:false,
      recordAwaitingConfirm:false,
      recordConfirmPending:false,
      voiceLessons:{wake:false,end:false,cancel:false},
      activeVoiceLesson:''
    };
    cancelActiveRecording();
    if(global.OneToneState&&global.OneToneState.state){
      global.OneToneState.state.selectedMappingId=m.id;
    }
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
          if(!setupState.modeCompatTested){
            setupState.modeCompatPickHint=true;
          }
          setupState.triggerMode=String(modeBtn.getAttribute('data-habit-setup-mode')||'tap');
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
    bindClick('btnHabitSetupHeaderClose',close);
    bindClick('btnHabitSetupRecordBack',closeSubHost);
    bindClick('btnHabitSetupImeReRecord',startImeCustomRecord);
    bindClick('btnHabitSetupNext',goNext);
    bindClick('btnHabitSetupNextTrigger',goNext);
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
      goToStep(3);
    });
    bindClick('btnHabitSetupSave',saveMode);
    bindClick('btnHabitSetupSaveVoice',saveVoiceLesson);
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
    handleEsc:handleEsc,
    bindOnce:bindOnce,
    applyLang:applyLang,
    refreshRecordStatus:refreshRecordStatus,
    onTargetCaptured:onTargetCaptured,
    onTriggerCaptured:onTriggerCaptured,
    onModeCompatResult:onModeCompatResult,
    onModeCompatSeen:onModeCompatSeen,
    isOpen:function(){ return !!setupState; }
  };
})((typeof window!=='undefined')?window:globalThis);
