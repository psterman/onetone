(function(global){
  'use strict';

  var $=function(id){ return global.OneToneDom.$(id); };
  var t=function(key){ return global.OneToneI18n.t(key); };

  var onChangeCb=null;

  function state(){ return global.OneToneState.state; }
  function core(){ return global.OneToneMappingCore; }
  function diff(){ return global.OneToneHabitOverrideDiff; }
  function flow(){ return global.OneToneSceneFlowSummary; }

  function esc(s){
    return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');
  }

  function friendlyKey(key){
    key=String(key||'').trim();
    if(!key) return '—';
    if(global.OneToneKeyLabels&&global.OneToneKeyLabels.friendlyKeyName){
      return global.OneToneKeyLabels.friendlyKeyName(key,global.OneToneI18n.getLang())||key;
    }
    return key;
  }

  function engineLabel(mode){
    mode=String(mode||'').trim().toLowerCase();
    if(mode==='vosk') return 'Vosk';
    if(mode==='sapi') return t('voiceSummaryEngineSapi');
    if(mode==='kws') return t('voiceSummaryEngineKws');
    if(mode==='off'||!mode) return t('habitHubGlobalVoiceOff');
    return mode;
  }

  function statusBadgeHtml(access){
    access=access||{};
    var cls='habit-scenario-access-badge';
    if(access.status==='overridden') cls+=' is-override';
    else if(access.status==='disabled') cls+=' is-disabled';
    else cls+=' is-inherit';
    var lbl;
    if(access.status==='disabled') lbl=t('habitScenarioAccessDisabled');
    else if(access.status==='overridden') lbl=t('habitScenarioAccessOverridden').replace('{n}',String(access.overrideCount||0));
    else lbl=t('habitScenarioAccessInherited');
    return '<span class="'+cls+'">'+esc(lbl)+'</span>';
  }

  function keysSummaryText(m,access){
    access=access||{};
    var baseline=access.baseline||{};
    var trig=core()&&core().editorTrigger?core().editorTrigger(m):String(m.triggerKey||'');
    var tgt=core()&&core().editorTarget?core().editorTarget(m):String(m.targetKey||'');
    if(access.status!=='overridden'){
      trig=baseline.triggerKey||'';
      tgt=baseline.targetKey||'';
    }
    var parts=[friendlyKey(trig)+' → '+friendlyKey(tgt)];
    if(flow&&flow.finishBehaviorTextSettings){
      var fin=flow.finishBehaviorTextSettings(m).text;
      if(fin) parts.push(fin);
    }
    return parts.join(' · ');
  }

  function voiceSummaryText(m,access){
    access=access||{};
    var baseline=access.baseline||{};
    var ov=access.override||{};
    var inherited=access.status!=='overridden';
    var eng=engineLabel(inherited?(baseline.engine||'off'):(ov.engine||baseline.engine||'off'));
    var wake=inherited?(baseline.wakePhrases||[]):(ov.wakePhrases||baseline.wakePhrases||[]);
    var endZh=inherited?(baseline.endPhrases&&baseline.endPhrases.zh||[]):(ov.endPhrases&&ov.endPhrases.zh||baseline.endPhrases&&baseline.endPhrases.zh||[]);
    var wakeN=Array.isArray(wake)?wake.length:0;
    var endN=Array.isArray(endZh)?endZh.length:0;
    return eng+' · '+wakeN+' '+t('voiceColWake')+' · '+endN+' '+t('endPhrasesLabel');
  }

  function renderCard(opts){
    var title=opts.title;
    var summary=opts.summary;
    var access=opts.access;
    var restoreKind=opts.restoreKind;
    var adjustKind=opts.adjustKind;
    var disabled=!!opts.disabled;
    return ''
      +'<article class="habit-scenario-access-card'+(disabled?' is-disabled':'')+'" data-access-card="'+esc(opts.kind)+'">'
      +'<div class="habit-scenario-access-card-head">'
      +'<h5 class="habit-scenario-access-card-title">'+esc(title)+'</h5>'
      +statusBadgeHtml(access)
      +'</div>'
      +'<p class="habit-scenario-access-card-summary">'+esc(summary||'—')+'</p>'
      +'<div class="habit-scenario-access-card-actions">'
      +'<button type="button" class="habit-hub-act" data-scenario-restore="'+esc(restoreKind)+'"'
      +(disabled?' disabled':'')+'>'+esc(t(restoreKind==='voice'?'habitScenarioRestoreVoiceDefault':'habitScenarioRestoreKeysDefault'))+'</button>'
      +'<button type="button" class="habit-hub-act is-primary" data-scenario-adjust="'+esc(adjustKind)+'"'
      +(disabled?' disabled':'')+'>'+esc(t(adjustKind==='voice'?'habitScenarioAdjustVoice':'habitScenarioAdjustKeys'))+'</button>'
      +'</div></article>';
  }

  function render(m){
    var keysHost=$('habitScenarioKeysAccessCard');
    var voiceHost=$('habitScenarioVoiceAccessCard');
    if(!keysHost&&!voiceHost) return;
    if(!m){
      if(keysHost) keysHost.innerHTML='';
      if(voiceHost) voiceHost.innerHTML='';
      return;
    }
    var cfg=state().config||{};
    var keysAccess=diff()&&diff().getKeysAccessState?diff().getKeysAccessState(m,cfg,core()):{status:'inherited',overrideCount:0};
    var voiceAccess=diff()&&diff().getVoiceAccessState?diff().getVoiceAccessState(m,cfg):{status:'inherited',overrideCount:0};
    if(keysHost){
      keysHost.innerHTML=renderCard({
        kind:'keys',
        title:t('habitScenarioKeysAccessTitle'),
        summary:keysSummaryText(m,keysAccess),
        access:keysAccess,
        restoreKind:'keys',
        adjustKind:'keys',
        disabled:false
      });
    }
    if(voiceHost){
      voiceHost.innerHTML=renderCard({
        kind:'voice',
        title:t('habitScenarioVoiceAccessTitle'),
        summary:voiceSummaryText(m,voiceAccess),
        access:voiceAccess,
        restoreKind:'voice',
        adjustKind:'voice',
        disabled:false
      });
    }
  }

  function notifyChange(){
    if(typeof onChangeCb==='function') onChangeCb();
  }

  function bindEvents(opts){
    onChangeCb=opts&&opts.onChange;
    var main=$('habitScenarioMain');
    if(!main) return;
    main.addEventListener('click',function(e){
      var restoreBtn=e.target.closest&&e.target.closest('[data-scenario-restore]');
      if(restoreBtn){
        e.preventDefault();
        var kind=restoreBtn.getAttribute('data-scenario-restore')||'';
        if(kind==='keys'&&global.OneToneHabitScenarioWizard&&global.OneToneHabitScenarioWizard.restoreKeysToGlobal){
          global.OneToneHabitScenarioWizard.restoreKeysToGlobal();
        }else if(kind==='voice'&&global.OneToneHabitScenarioWizard&&global.OneToneHabitScenarioWizard.restoreVoiceToGlobal){
          global.OneToneHabitScenarioWizard.restoreVoiceToGlobal();
        }
        notifyChange();
        return;
      }
        var adjustBtn=e.target.closest&&e.target.closest('[data-scenario-adjust]');
      if(adjustBtn){
        e.preventDefault();
        var adj=adjustBtn.getAttribute('data-scenario-adjust')||'';
        var id=String(global.OneToneState.state.selectedMappingId||'').trim();
        if(!id||!core()||!core().byId||!core().byId(id)) return;
        var nav=global.OneToneHabitScenarioContextBanner;
        if(!nav) return;
        if(adj==='voice') nav.openScenarioVoiceEdit(id);
        else nav.openScenarioKeysEdit(id);
      }
    });
  }

  global.OneToneHabitScenarioAccessCards={
    render:render,
    bindEvents:bindEvents,
    keysSummaryText:keysSummaryText,
    voiceSummaryText:voiceSummaryText
  };
})((typeof window!=='undefined')?window:globalThis);
