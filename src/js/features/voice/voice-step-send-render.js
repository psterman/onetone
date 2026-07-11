(function(global){
  'use strict';
  var $=function(id){ return global.OneToneDom.$(id); };
  var t=function(key){ return global.OneToneI18n.t(key); };

  function V(){ return global.OneToneVoiceSettingsViewModel; }

  function renderOutputSummon(vm){
    const block=$('voiceOutputSummonBlock');
    const chipsEl=$('voiceOutputSummonChips');
    const appRules=global.OneToneAppBehaviorRules;
    if(!block||!chipsEl||!appRules||!vm.habitMapping){
      if(block) block.hidden=true;
      return;
    }
    const m=vm.habitMapping;
    const presets=appRules.behaviorPresets||[];
    const phrases=[];
    presets.forEach(function(p){
      if(!appRules.voiceSummonPhrase) return;
      const phrase=appRules.voiceSummonPhrase(p.id,m);
      const clean=String(phrase||'').replace(/[「」""]/g,'').trim();
      if(clean&&phrases.indexOf(clean)<0) phrases.push(clean);
    });
    if(!phrases.length){
      block.hidden=true;
      chipsEl.innerHTML='';
      return;
    }
    block.hidden=false;
    chipsEl.innerHTML=phrases.map(function(phrase){
      return '<span class="voice-output-summon-chip">'+V().escHtml(phrase)+'</span>';
    }).join('');
  }

  function renderOutputPanel(vm){
    const hint=$('voiceOutputHint');
    const params=$('voiceOutputParams');
    const delayRow=$('voiceOutputDelayRow');
    const key=V().resolveOutputModeKey(vm);
    const liteMode=vm.mode==='sapi'||vm.mode==='off';
    if(hint){
      if(vm.loading) hint.textContent=t('homeLiveLoading');
      else if(liteMode||key==='manual') hint.textContent=t('voiceOutputHintManual');
      else if(key==='auto') hint.textContent=t('voiceOutputHintAuto');
      else hint.textContent=t('voiceOutputHintConfirm');
    }
    if(params){
      params.dataset.outputMode=key;
      params.dataset.liteMode=liteMode?'true':'false';
      var showParams=!vm.loading&&!liteMode&&key!=='manual';
      params.classList.toggle('is-hidden',!showParams);
      if(delayRow) delayRow.classList.toggle('is-hidden',!showParams||key!=='auto');
    }
  }

  global.OneToneVoiceStepSend={
    render:function(vm){
      renderOutputPanel(vm);
      renderOutputSummon(vm);
    }
  };
})((typeof window!=='undefined')?window:globalThis);
