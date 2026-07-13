(function(global){
  'use strict';

  var $=function(id){ return global.OneToneDom.$(id); };
  var t=function(key){ return global.OneToneI18n.t(key); };

  var onChangeCb=null;
  var boundHost=null;
  var lastMappingId='';

  function state(){ return global.OneToneState.state; }
  function core(){ return global.OneToneMappingCore; }
  function diffApi(){ return global.OneToneHabitOverrideDiff; }

  function esc(s){
    return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');
  }

  function voiceBaseline(){
    var cfg=state().config||{};
    return diffApi()&&diffApi().getGlobalVoiceBaseline?diffApi().getGlobalVoiceBaseline(cfg):{};
  }

  function voiceModeEnabled(m){
    return m?m.voiceModeEnabled!==false:true;
  }

  function cloneList(arr){
    return Array.isArray(arr)?arr.map(function(s){ return String(s); }):[];
  }

  function mergeEffective(m,baseline){
    var ov=m&&m.voiceOverride&&typeof m.voiceOverride==='object'?m.voiceOverride:{};
    baseline=baseline||{};
    return {
      targetKey:String(ov.targetKey||baseline.targetKey||'').trim(),
      wakePhrases:Array.isArray(ov.wakePhrases)&&ov.wakePhrases.length
        ?cloneList(ov.wakePhrases):cloneList(baseline.wakePhrases),
      endPhrases:{
        zh:Array.isArray(ov.endPhrases&&ov.endPhrases.zh)&&ov.endPhrases.zh.length
          ?cloneList(ov.endPhrases.zh):cloneList(baseline.endPhrases&&baseline.endPhrases.zh),
        en:Array.isArray(ov.endPhrases&&ov.endPhrases.en)&&ov.endPhrases.en.length
          ?cloneList(ov.endPhrases.en):cloneList(baseline.endPhrases&&baseline.endPhrases.en)
      },
      engine:String(ov.engine||baseline.engine||'off').trim()||'off',
      modelPreset:String(ov.modelPreset||baseline.modelPreset||'').trim()
    };
  }

  function applyVoiceState(m,edited){
    if(!m||!diffApi()) return;
    var cfg=state().config||{};
    var sparse=diffApi().normalizeVoiceOverrideForSave(edited,cfg);
    if(diffApi().isEmptyOverride(sparse)) m.voiceOverride=null;
    else m.voiceOverride=sparse;
  }

  function fieldBadge(field,ov,baseline){
    var st=diffApi()&&diffApi().fieldVoiceStatus?diffApi().fieldVoiceStatus(field,ov,baseline):'inherited';
    var cls=st==='overridden'?'is-override':'is-inherit';
    var lbl=st==='overridden'?t('habitOverridden'):t('habitInheritGlobal');
    return '<span class="habit-scenario-field-badge '+cls+'">'+esc(lbl)+'</span>';
  }

  function parsePhraseLines(text){
    return String(text||'').split(/[\n,，、]/).map(function(s){ return s.trim(); }).filter(Boolean);
  }

  function phraseLines(phrases){
    return cloneList(phrases).join('\n');
  }

  function notifyChange(){
    if(typeof onChangeCb==='function') onChangeCb();
  }

  function render(m){
    var host=$('habitScenarioVoiceBody');
    if(!host) return;
    lastMappingId=m&&m.id||'';
    if(!m){
      host.innerHTML='<p class="habit-scenario-tab-body-placeholder">'+esc(t('habitScenarioMainPlaceholder'))+'</p>';
      return;
    }
    var baseline=voiceBaseline();
    var ov=m.voiceOverride&&typeof m.voiceOverride==='object'?m.voiceOverride:{};
    var eff=mergeEffective(m,baseline);
    var disabled=!voiceModeEnabled(m);
    var modeOn=voiceModeEnabled(m);
    var engines=[
      {id:'vosk',label:'Vosk'},
      {id:'sapi',label:'SAPI'},
      {id:'kws',label:'KWS'}
    ];
    var engHtml='<div class="habit-scenario-voice-engines" role="radiogroup">';
    engines.forEach(function(opt){
      var active=eff.engine===opt.id;
      engHtml+='<button type="button" class="keys-trigger-mode-seg'+(active?' is-active':'')+'"'
        +' data-scenario-voice-engine="'+esc(opt.id)+'" role="radio" aria-checked="'+(active?'true':'false')+'"'
        +(disabled?' disabled':'')+'>'+esc(opt.label)+'</button>';
    });
    engHtml+='</div>';
    host.innerHTML=''
      +'<div class="habit-scenario-voice-editor">'
      +'<div class="habit-scenario-keys-mode-row">'
      +'<span class="habit-scenario-keys-mode-lbl">'+esc(t('habitScenarioEnableVoice'))+'</span>'
      +'<button type="button" class="toggle-switch habit-scenario-voice-mode-toggle" id="habitScenarioVoiceModeToggle"'
      +' role="switch" aria-checked="'+(modeOn?'true':'false')+'"></button>'
      +'</div>'
      +'<div class="habit-scenario-voice-fields'+(disabled?' is-disabled':'')+'">'
      +'<div class="habit-scenario-voice-field">'
      +'<div class="habit-scenario-keys-field-head">'
      +'<span class="habit-scenario-keys-field-lbl">'+esc(t('voiceColRecognize'))+'</span>'
      +fieldBadge('engine',ov,baseline)
      +'</div>'
      +engHtml
      +'</div>'
      +'<div class="habit-scenario-voice-field">'
      +'<div class="habit-scenario-keys-field-head">'
      +'<span class="habit-scenario-keys-field-lbl">'+esc(t('voiceColWake'))+'</span>'
      +fieldBadge('wakePhrases',ov,baseline)
      +'</div>'
      +'<textarea class="habit-scenario-voice-phrases" id="habitScenarioVoiceWakeInput" rows="3"'
      +' placeholder="'+esc(t('habitScenarioVoiceWakeHint'))+'"'
      +(disabled?' disabled':'')+'>'+esc(phraseLines(eff.wakePhrases))+'</textarea>'
      +'</div>'
      +'<div class="habit-scenario-voice-field">'
      +'<div class="habit-scenario-keys-field-head">'
      +'<span class="habit-scenario-keys-field-lbl">'+esc(t('targetTitle'))+'</span>'
      +fieldBadge('targetKey',ov,baseline)
      +'</div>'
      +'<input type="text" class="habit-scenario-voice-target" id="habitScenarioVoiceTargetInput"'
      +' value="'+esc(eff.targetKey)+'" autocomplete="off"'
      +(disabled?' disabled':'')+' />'
      +'</div>'
      +'<details class="habit-scenario-keys-advanced">'
      +'<summary class="habit-scenario-keys-advanced-summary">'+esc(t('habitScenarioKeysAdvanced'))+'</summary>'
      +'<div class="habit-scenario-keys-advanced-body">'
      +'<label class="habit-scenario-voice-end-lbl">'+esc(t('endPhrasesLabel'))+' (ZH)'
      +fieldBadge('endPhrases',ov,baseline)+'</label>'
      +'<textarea class="habit-scenario-voice-phrases" id="habitScenarioVoiceEndZh" rows="2"'
      +(disabled?' disabled':'')+'>'+esc(phraseLines(eff.endPhrases.zh))+'</textarea>'
      +'<label class="habit-scenario-voice-end-lbl">'+esc(t('endPhrasesLabel'))+' (EN)</label>'
      +'<textarea class="habit-scenario-voice-phrases" id="habitScenarioVoiceEndEn" rows="2"'
      +(disabled?' disabled':'')+'>'+esc(phraseLines(eff.endPhrases.en))+'</textarea>'
      +'</div>'
      +'</details>'
      +'</div>'
      +'</div>';
    var modeToggle=$('habitScenarioVoiceModeToggle');
    if(modeToggle) modeToggle.classList.toggle('is-on',modeOn);
  }

  function readFormIntoEffective(m){
    var baseline=voiceBaseline();
    var eff=mergeEffective(m,baseline);
    var wakeInput=$('habitScenarioVoiceWakeInput');
    var targetInput=$('habitScenarioVoiceTargetInput');
    var endZh=$('habitScenarioVoiceEndZh');
    var endEn=$('habitScenarioVoiceEndEn');
    if(wakeInput) eff.wakePhrases=parsePhraseLines(wakeInput.value);
    if(targetInput) eff.targetKey=String(targetInput.value||'').trim();
    if(endZh||endEn){
      eff.endPhrases={
        zh:endZh?parsePhraseLines(endZh.value):eff.endPhrases.zh,
        en:endEn?parsePhraseLines(endEn.value):eff.endPhrases.en
      };
    }
    return eff;
  }

  function commitForm(m){
    if(!m) return;
    applyVoiceState(m,readFormIntoEffective(m));
    notifyChange();
  }

  function handleClick(e){
    var host=$('habitScenarioVoiceBody');
    if(!host||!host.contains(e.target)) return false;
    var m=core()&&core().byId&&lastMappingId?core().byId(lastMappingId):null;
    if(!m) return false;
    var modeToggle=e.target.closest&&e.target.closest('#habitScenarioVoiceModeToggle');
    if(modeToggle){
      e.preventDefault();
      m.voiceModeEnabled=!voiceModeEnabled(m);
      render(m);
      notifyChange();
      return true;
    }
    var engBtn=e.target.closest&&e.target.closest('[data-scenario-voice-engine]');
    if(engBtn){
      e.preventDefault();
      if(!voiceModeEnabled(m)) return true;
      var eff=readFormIntoEffective(m);
      eff.engine=engBtn.getAttribute('data-scenario-voice-engine')||'vosk';
      applyVoiceState(m,eff);
      render(m);
      notifyChange();
      return true;
    }
    return false;
  }

  function handleInput(e){
    var host=$('habitScenarioVoiceBody');
    if(!host||!host.contains(e.target)) return;
    var m=core()&&core().byId&&lastMappingId?core().byId(lastMappingId):null;
    if(!m||!voiceModeEnabled(m)) return;
    if(e.target.id==='habitScenarioVoiceWakeInput'
      ||e.target.id==='habitScenarioVoiceTargetInput'
      ||e.target.id==='habitScenarioVoiceEndZh'
      ||e.target.id==='habitScenarioVoiceEndEn'){
      commitForm(m);
    }
  }

  function bindEvents(opts){
    opts=opts||{};
    onChangeCb=opts.onChange||null;
    if(boundHost) return;
    boundHost=document;
    boundHost.addEventListener('click',function(e){
      if(handleClick(e)) e.stopPropagation();
    });
    boundHost.addEventListener('input',handleInput);
  }

  function setOnChange(fn){ onChangeCb=fn; }

  global.OneToneHabitScenarioVoiceEditor={
    render:render,
    bindEvents:bindEvents,
    setOnChange:setOnChange,
    voiceModeEnabled:voiceModeEnabled
  };
})((typeof window!=='undefined')?window:globalThis);
