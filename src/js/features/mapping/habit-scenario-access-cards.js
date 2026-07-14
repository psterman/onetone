(function(global){
  'use strict';

  var $=function(id){ return global.OneToneDom.$(id); };
  var t=function(key){ return global.OneToneI18n.t(key); };

  var onChangeCb=null;

  function state(){ return global.OneToneState.state; }
  function core(){ return global.OneToneMappingCore; }

  function render(){
    var hint=$('habitScenarioDirectHint');
    var keysBtn=$('btnHabitScenarioGoKeys');
    var voiceBtn=$('btnHabitScenarioGoVoice');
    if(hint) hint.textContent=t('habitScenarioDirectHint');
    if(keysBtn) keysBtn.textContent=t('habitScenarioGoKeysSettings');
    if(voiceBtn) voiceBtn.textContent=t('habitScenarioGoVoiceSettings');
  }

  function notifyChange(){
    if(typeof onChangeCb==='function') onChangeCb();
  }

  function bindEvents(opts){
    onChangeCb=opts&&opts.onChange;
    var main=$('habitScenarioMain');
    if(!main) return;
    main.addEventListener('click',function(e){
      var adjustBtn=e.target.closest&&e.target.closest('[data-scenario-adjust]');
      if(!adjustBtn) return;
      e.preventDefault();
      var adj=adjustBtn.getAttribute('data-scenario-adjust')||'';
      var id=String(state().selectedMappingId||'').trim();
      if(!id||!core()||!core().byId||!core().byId(id)) return;
      var nav=global.OneToneHabitScenarioContextBanner;
      if(!nav) return;
      if(adj==='voice') nav.openScenarioVoiceEdit(id,{returnToHub:true});
      else nav.openScenarioKeysEdit(id,{returnToHub:true});
    });
  }

  global.OneToneHabitScenarioAccessCards={
    render:render,
    bindEvents:bindEvents,
    keysSummaryText:function(){ return ''; },
    voiceSummaryText:function(){ return ''; }
  };
})((typeof window!=='undefined')?window:globalThis);
