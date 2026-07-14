(function(global){
  'use strict';

  var $=function(id){ return global.OneToneDom.$(id); };
  var t=function(key){ return global.OneToneI18n.t(key); };

  var onChangeCb=null;
  var boundHost=null;
  var lastMappingId='';
  var advancedOpen=false;
  var lastVoiceModeEnabled=null;

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

  function sanitizePhrase(s){
    s=String(s||'').trim();
    if(!s) return '';
    if(/^[\?？.\-_]+$/.test(s)) return '';
    if(s==='[unk]'||s==='[UNK]') return '';
    return s;
  }

  function sanitizePhraseList(arr){
    return cloneList(arr).map(sanitizePhrase).filter(Boolean);
  }

  function hasAcousticCommands(m){
    var list=m&&Array.isArray(m.acousticVoiceCommands)?m.acousticVoiceCommands:[];
    return list.some(function(c){ return c&&c.enabled!==false; });
  }

  function preferredScenarioEngine(baseline){
    var raw=String((baseline&&baseline.engine)||'').trim();
    if(raw==='vosk'||raw==='kws') return raw;
    // Vosk is best for scenario voice (custom Chinese phrases + PCM for acoustic).
    // SAPI has no AudioFrameBus PCM and is a poor default here.
    return 'vosk';
  }

  function mergeEffective(m,baseline){
    var ov=m&&m.voiceOverride&&typeof m.voiceOverride==='object'?m.voiceOverride:{};
    baseline=baseline||{};
    var eng=String(ov.engine||baseline.engine||'').trim()||'off';
    if(hasAcousticCommands(m)&&(eng==='off'||eng==='none'||eng==='sapi')){
      eng=preferredScenarioEngine(baseline);
    }
    var modelPreset=String(ov.modelPreset||baseline.modelPreset||'').trim();
    if(eng==='vosk'&&!modelPreset) modelPreset='cn-light';
    return {
      targetKey:String(ov.targetKey||baseline.targetKey||'').trim(),
      wakePhrases:Array.isArray(ov.wakePhrases)&&ov.wakePhrases.length
        ?sanitizePhraseList(ov.wakePhrases):sanitizePhraseList(baseline.wakePhrases),
      endPhrases:{
        zh:Array.isArray(ov.endPhrases&&ov.endPhrases.zh)&&ov.endPhrases.zh.length
          ?sanitizePhraseList(ov.endPhrases.zh):sanitizePhraseList(baseline.endPhrases&&baseline.endPhrases.zh),
        en:Array.isArray(ov.endPhrases&&ov.endPhrases.en)&&ov.endPhrases.en.length
          ?sanitizePhraseList(ov.endPhrases.en):sanitizePhraseList(baseline.endPhrases&&baseline.endPhrases.en)
      },
      engine:eng,
      modelPreset:modelPreset
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
    var st=fieldVoiceStatus(field,ov,baseline);
    var cls=st==='overridden'?'is-override':'is-inherit';
    var lbl=st==='overridden'?t('habitOverridden'):t('habitInheritGlobal');
    return '<span class="habit-scenario-field-badge '+cls+'">'+esc(lbl)+'</span>';
  }

  function fieldVoiceStatus(field,ov,baseline){
    return diffApi()&&diffApi().fieldVoiceStatus?diffApi().fieldVoiceStatus(field,ov,baseline):'inherited';
  }

  function renderWakeField(eff,ov,baseline,disabled){
    var st=fieldVoiceStatus('wakePhrases',ov,baseline);
    if(st==='inherited'){
      var chips=sanitizePhraseList(eff.wakePhrases);
      var chipHtml=chips.length
        ? chips.map(function(p){
          return '<span class="habit-scenario-voice-phrase-chip">'+esc(p)+'</span>';
        }).join('')
        : '<span class="habit-scenario-voice-inherit-empty">'+esc(t('habitInheritGlobal'))+'</span>';
      return '<div class="habit-scenario-voice-phrase-chips">'+chipHtml+'</div>'
        +'<p class="habit-scenario-voice-inherit-note">'+esc(t('habitScenarioVoiceWakeInheritNote'))+'</p>';
    }
    return '<textarea class="habit-scenario-voice-phrases" id="habitScenarioVoiceWakeInput" rows="4"'
      +' placeholder="'+esc(t('habitScenarioVoiceWakeHint'))+'"'
      +(disabled?' disabled':'')+'>'+esc(phraseLines(eff.wakePhrases))+'</textarea>';
  }

  function renderEndField(id,phrases,disabled){
    return '<textarea class="habit-scenario-voice-phrases" id="'+id+'" rows="3"'
      +(disabled?' disabled':'')+'>'+esc(phraseLines(phrases))+'</textarea>';
  }

  function parsePhraseLines(text){
    return String(text||'').split(/[\n,，、]/).map(function(s){ return s.trim(); }).filter(Boolean);
  }

  function phraseLines(phrases){
    return sanitizePhraseList(phrases).join('\n');
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
    var engHtml='<div class="keys-trigger-modes habit-scenario-voice-engines" role="radiogroup">';
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
      +'<div class="habit-scenario-voice-command-wrap'+(disabled?' is-disabled':'')+'">'
      +'<div id="habitScenarioVoiceCommandHost" class="habit-scenario-voice-command-host"></div>'
      +'</div>'
      +'<details class="habit-scenario-voice-advanced"'+(advancedOpen?' open':'')+'>'
      +'<summary class="habit-scenario-voice-advanced-summary">'+esc(t('habitScenarioVoiceAdvanced'))+'</summary>'
      +'<p class="habit-scenario-voice-advanced-hint">'+esc(t('habitScenarioVoiceAdvancedHint'))+'</p>'
      +'<div class="habit-scenario-voice-fields'+(disabled?' is-disabled':'')+'">'
      +'<div class="habit-scenario-voice-field">'
      +'<div class="habit-scenario-keys-field-head">'
      +'<span class="habit-scenario-keys-field-lbl">'+esc(t('voiceColRecognize'))+'</span>'
      +fieldBadge('engine',ov,baseline)
      +'</div>'
      +engHtml
      +'</div>'
      +'<div class="habit-scenario-voice-field habit-scenario-voice-field--wake">'
      +'<div class="habit-scenario-keys-field-head">'
      +'<span class="habit-scenario-keys-field-lbl">'+esc(t('voiceColWake'))+'</span>'
      +fieldBadge('wakePhrases',ov,baseline)
      +'</div>'
      +renderWakeField(eff,ov,baseline,disabled)
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
      +'<div class="habit-scenario-voice-field habit-scenario-voice-field--end">'
      +'<label class="habit-scenario-voice-end-lbl">'+esc(t('endPhrasesLabel'))+' (ZH)'
      +fieldBadge('endPhrases',ov,baseline)+'</label>'
      +renderEndField('habitScenarioVoiceEndZh',eff.endPhrases.zh,disabled)
      +'<label class="habit-scenario-voice-end-lbl">'+esc(t('endPhrasesLabel'))+' (EN)</label>'
      +renderEndField('habitScenarioVoiceEndEn',eff.endPhrases.en,disabled)
      +'</div>'
      +'</div>'
      +'</details>'
      +'</div>';
    var modeToggle=$('habitScenarioVoiceModeToggle');
    if(modeToggle) modeToggle.classList.toggle('is-on',modeOn);
    if(global.OneToneHabitScenarioVoiceCommand&&global.OneToneHabitScenarioVoiceCommand.render){
      global.OneToneHabitScenarioVoiceCommand.render();
    }
    var advanced=$('habitScenarioVoiceBody')&&$('habitScenarioVoiceBody').querySelector('.habit-scenario-voice-advanced');
    if(advanced&&!advanced._boundToggle){
      advanced._boundToggle=true;
      advanced.addEventListener('toggle',function(){
        advancedOpen=!!advanced.open;
      });
    }
  }

  function sync(m){
    if(!m){
      lastMappingId='';
      lastVoiceModeEnabled=null;
      render(m);
      return;
    }
    var id=m.id||'';
    var modeOn=voiceModeEnabled(m);
    var sameMapping=id===lastMappingId;
    var sameMode=lastVoiceModeEnabled===modeOn;
    lastMappingId=id;
    lastVoiceModeEnabled=modeOn;
    if(!sameMapping||!sameMode){
      render(m);
      return;
    }
    if(global.OneToneHabitScenarioVoiceCommand&&global.OneToneHabitScenarioVoiceCommand.render){
      global.OneToneHabitScenarioVoiceCommand.render();
    }
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
      if(voiceModeEnabled(m)){
        var baseline=voiceBaseline();
        var eff=mergeEffective(m,baseline);
        if(!eff.engine||eff.engine==='off'||eff.engine==='none'||eff.engine==='sapi'){
          eff.engine=preferredScenarioEngine(baseline);
          if(eff.engine==='vosk'&&!eff.modelPreset) eff.modelPreset='cn-light';
          applyVoiceState(m,eff);
        }
      }
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
    sync:sync,
    bindEvents:bindEvents,
    setOnChange:setOnChange,
    voiceModeEnabled:voiceModeEnabled
  };
})((typeof window!=='undefined')?window:globalThis);
