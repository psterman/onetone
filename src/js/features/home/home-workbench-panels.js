(function(global){
  'use strict';

  var $=function(id){ return global.OneToneDom.$(id); };
  var t=function(key){ return global.OneToneI18n.t(key); };

  var HOME_MIC_BAR_COUNT=28;

  function esc(s){
    return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  function schemeHooks(){
    return global.__vp_home_scheme_hooks__||{};
  }

  function sortedMappings(){
    var hooks=schemeHooks();
    if(hooks.sortedMappings) return hooks.sortedMappings();
    var cfg=global.OneToneState&&global.OneToneState.state&&global.OneToneState.state.config;
    if(!cfg||!Array.isArray(cfg.mappings)) return [];
    return cfg.mappings.slice().sort(function(a,b){ return (a.order||0)-(b.order||0); });
  }

  function activeSceneId(){
    if(global.OneToneHomeScheme){
      var cfg=global.OneToneState&&global.OneToneState.state&&global.OneToneState.state.config;
      if(global.OneToneSceneActivate&&global.OneToneSceneActivate.activeSceneId){
        return global.OneToneSceneActivate.activeSceneId();
      }
      return String(cfg&&cfg.activeSceneId||'').trim();
    }
    return '';
  }

  function habitMappings(limit){
    return sortedMappings().filter(function(m){
      return !!m.enabled&&(m.triggerKey||m.targetKey);
    }).slice(0,limit||4);
  }

  function mappingTag(m){
    if(!m) return '';
    if(m.appTargetId&&global.OneToneAppTargetPresets&&global.OneToneAppTargetPresets.presetById){
      var preset=global.OneToneAppTargetPresets.presetById(m.appTargetId);
      if(preset&&preset.nameKey) return t(preset.nameKey);
    }
    if(m.imePresetId&&global.OneToneImePresets&&global.OneToneImePresets.presetById){
      var ime=global.OneToneImePresets.presetById(m.imePresetId);
      if(ime&&ime.nameKey) return t(ime.nameKey);
    }
    if((m.group||'').trim()) return m.group.trim();
    return t('homeWbHabitDefaultTag');
  }

  function mappingDesc(m){
    if(!global.OneToneHomeScheme) return '—';
    var pair=global.OneToneHomeScheme.pairLine(m);
    var finish='';
    if(global.OneToneSceneFlowSummary&&global.OneToneSceneFlowSummary.finishBehaviorTextHome){
      finish=global.OneToneSceneFlowSummary.finishBehaviorTextHome(m).text||'';
    }
    return finish?pair+' · '+finish:pair;
  }

  function wakePhrases(vm){
    var out=[];
    var seen={};
    function push(p){
      var clean=String(p||'').trim();
      if(!clean||seen[clean]) return;
      if(/^[\?？.\-_]+$/.test(clean)) return;
      seen[clean]=true;
      out.push(clean);
    }
    var m=vm&&vm.m;
    if(m&&m.voiceOverride&&Array.isArray(m.voiceOverride.wakePhrases)){
      m.voiceOverride.wakePhrases.forEach(push);
    }
    var cfg=global.OneToneState&&global.OneToneState.state&&global.OneToneState.state.config;
    if(cfg&&Array.isArray(cfg.mappings)){
      cfg.mappings.forEach(function(map){
        if(!map||!map.enabled) return;
        if(!Array.isArray(map.acousticVoiceCommands)) return;
        map.acousticVoiceCommands.forEach(function(cmd){
          if(!cmd||cmd.enabled===false) return;
          push(cmd.displayText);
          push(cmd.label);
        });
      });
    }
    if(out.length>=6) return out.slice(0,6);
    if(!cfg) return out;
    var sapi=cfg.voiceSapi||{};
    var vosk=cfg.voiceVosk||{};
    var kws=cfg.voiceKws||cfg.voice_kws||{};
    var list=(sapi.phrases||vosk.phrases||kws.phrases||[]).slice();
    list.forEach(push);
    return out.slice(0,6);
  }

  function pipelineNode(lbl,val,extraClass){
    return '<div class="wb-pipeline-node">'
      +'<span class="wb-pipeline-node-lbl">'+esc(lbl)+'</span>'
      +'<span class="wb-pipeline-node-val'+(extraClass?' '+extraClass:'')+'">'+esc(val)+'</span>'
      +'</div>';
  }

  function renderPipeline(vm){
    var host=$('wbPipeline');
    if(!host) return;
    var m=vm&&vm.m;
    if(!m){
      host.innerHTML='';
      return;
    }
    var trig=vm.triggerKey||t('homeLiveUnset');
    var tgt=vm.targetLabel||t('homeLiveUnset');
    var finish='—';
    if(global.OneToneSceneFlowSummary&&global.OneToneSceneFlowSummary.finishBehaviorTextHome){
      finish=global.OneToneSceneFlowSummary.finishBehaviorTextHome(m).text||'—';
    }
    host.setAttribute('aria-label',t('homeWbPipelineTitle'));
    host.innerHTML=
      '<span class="wb-pipeline-title">'+esc(t('homeWbPipelineTitle'))+'</span>'
      +'<div class="wb-pipeline-row">'
      +pipelineNode(t('homeWbPipelineTrigger'),trig)
      +'<span class="wb-pipeline-arrow" aria-hidden="true">›</span>'
      +pipelineNode(t('homeWbPipelineTarget'),tgt)
      +'<span class="wb-pipeline-arrow" aria-hidden="true">›</span>'
      +pipelineNode(t('homeWbPipelineFinish'),finish,'is-finish')
      +'</div>';
  }

  function habitCardHtml(m,activeId){
    var active=m.id===activeId;
    var name=global.OneToneHomeScheme?global.OneToneHomeScheme.shortName(m):'—';
    return '<button type="button" class="wb-habit-card'+(active?' is-active':'')+'" data-wb-habit-id="'+esc(m.id)+'">'
      +'<div class="wb-habit-card-head">'
      +'<span class="wb-habit-card-tag">'+esc(mappingTag(m))+'</span>'
      +'<span class="wb-habit-card-ico" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v4"/><path d="M12 18v4"/><path d="M4.93 4.93l2.83 2.83"/><path d="M16.24 16.24l2.83 2.83"/><path d="M2 12h4"/><path d="M18 12h4"/><path d="M4.93 19.07l2.83-2.83"/><path d="M16.24 7.76l2.83-2.83"/></svg></span>'
      +'</div>'
      +'<h3 class="wb-habit-card-title">'+esc(name)+'</h3>'
      +'<p class="wb-habit-card-desc">'+esc(mappingDesc(m))+'</p>'
      +'</button>';
  }

  function renderHabitGrid(vm){
    var host=$('wbHabitGrid');
    if(!host) return;
    var activeId=activeSceneId();
    var items=habitMappings(4);
    if(!items.length){
      host.innerHTML='<div class="wb-habit-empty">'+esc(t('homeWbHabitEmpty'))+'</div>';
      return;
    }
    host.innerHTML=items.map(function(m){ return habitCardHtml(m,activeId); }).join('');
  }

  function scenarioPillHtml(m,activeId){
    var active=m.id===activeId;
    var name=global.OneToneHomeScheme?global.OneToneHomeScheme.shortName(m):'—';
    var meta=global.OneToneHomeScheme?global.OneToneHomeScheme.pairLine(m):'—';
    var status=active?t('homeWbScenarioActive'):t('homeWbScenarioSwitch');
    return '<button type="button" class="wb-scenario-pill'+(active?' is-active':'')+'" data-wb-scenario-id="'+esc(m.id)+'">'
      +'<span class="wb-scenario-pill-main">'
      +'<span class="wb-scenario-pill-ico" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M8 14h8"/></svg></span>'
      +'<span class="wb-scenario-pill-text">'
      +'<span class="wb-scenario-pill-name">'+esc(name)+'</span>'
      +'<span class="wb-scenario-pill-meta">'+esc(meta)+'</span>'
      +'</span></span>'
      +'<span class="wb-scenario-pill-status">'+esc(status)+'</span>'
      +'</button>';
  }

  function renderScenarioPanel(vm){
    var host=$('wbScenarioPanel');
    if(!host) return;
    var activeId=activeSceneId();
    var items=sortedMappings().filter(function(m){ return !!m.enabled; }).slice(0,5);
    var count=items.length;
    var html=
      '<div class="wb-panel-head">'
      +'<span class="wb-panel-title"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/></svg>'
      +'<span>'+esc(t('homeWbScenarioTitle'))+'</span></span>'
      +'<span class="wb-panel-badge">'+esc(t('homeWbScenarioCount').replace('{n}',String(count)))+'</span>'
      +'</div>'
      +'<div class="wb-scenario-list">';
    if(!items.length){
      html+='<div class="wb-habit-empty">'+esc(t('homeWbHabitEmpty'))+'</div>';
    }else{
      items.forEach(function(m){ html+=scenarioPillHtml(m,activeId); });
    }
    html+='</div>';
    host.innerHTML=html;
  }

  function buildHomeMicBars(count){
    var html='';
    for(var i=0;i<(count||HOME_MIC_BAR_COUNT);i++) html+='<span></span>';
    return html;
  }

  function renderVoicePanel(vm){
    var host=$('wbVoicePanel');
    if(!host) return;
    var listening=vm.vpState==='DICTATING'||!!(vm.summary&&vm.summary.dictating)
      ||(vm.summary&&vm.summary.statusMode==='listening');
    var phrases=wakePhrases(vm);
    var phraseHtml=phrases.length
      ?phrases.map(function(p,i){
        return '<span class="wb-voice-phrase'+(i>1?' is-muted':'')+'">'+esc(p)+'</span>';
      }).join('')
      :'<span class="wb-voice-phrase is-muted">'+esc(t('homeWbVoicePhrasesEmpty'))+'</span>';

    host.innerHTML=
      '<div class="wb-live-voice-block">'
      +'<div class="wb-voice-phrases">'
      +'<span class="wb-voice-phrases-lbl">'+esc(t('homeWbVoicePhrases'))+'</span>'
      +'<div class="wb-voice-phrase-list">'+phraseHtml+'</div>'
      +'</div>'
      +'<div class="wb-voice-mic">'
      +'<div class="wb-voice-mic-head">'
      +'<span class="wb-voice-mic-lbl">'+esc(t('homeWbVoiceMicSource'))+'</span>'
      +'<button type="button" class="wb-voice-mic-change" id="wbVoiceChangeMic">'+esc(t('homeWbVoiceChangeMic'))+'</button>'
      +'</div>'
      +'<div class="wb-voice-mic-box'+(listening?' is-live':'')+'">'
      +'<div class="wb-voice-mic-name"><span>'+esc(vm.micLabel||t('homeLiveMicUnset'))+'</span>'
      +'<span class="wb-voice-mic-default">'+esc(t('homeWbVoiceMicDefault'))+'</span></div>'
      +'<div class="mic-level-bars mic-level-bars--home" id="wbHomeMicLevel" aria-hidden="true">'+buildHomeMicBars()+'</div>'
      +'</div></div></div>';
  }

  function renderAll(vm){
    renderPipeline(vm);
    renderHabitGrid(vm);
    renderScenarioPanel(vm);
    renderVoicePanel(vm);
  }

  function bindOnce(){
    if(global.__wb_panels_bound__) return;
    global.__wb_panels_bound__=true;
  }

  global.OneToneHomeWorkbenchPanels={
    renderAll:renderAll,
    renderPipeline:renderPipeline,
    renderHabitGrid:renderHabitGrid,
    renderScenarioPanel:renderScenarioPanel,
    renderVoicePanel:renderVoicePanel,
    bindOnce:bindOnce,
    stopWave:function(){}
  };
})((typeof window!=='undefined')?window:globalThis);
