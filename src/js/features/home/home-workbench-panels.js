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

  function currentHeroMode(){
    if(global.OneToneHomeWorkbench&&global.OneToneHomeWorkbench.getHeroMode){
      return global.OneToneHomeWorkbench.getHeroMode();
    }
    return 'voice';
  }

  function dash(v){
    var s=String(v==null?'':v).trim();
    if(!s||s==='—'||s===t('homeLiveUnset')) return '—';
    return s;
  }

  function howToCardHtml(opts){
    return '<button type="button" class="wb-howto-card'+(opts.active?' is-active':'')+(opts.kind?' is-'+opts.kind:'')+'" data-wb-howto="'+esc(opts.kind)+'" title="'+esc(opts.tip||'')+'">'
      +'<div class="wb-howto-card-head">'
      +'<span class="wb-howto-card-ico" aria-hidden="true">'+opts.icon+'</span>'
      +'<span class="wb-howto-card-title">'+esc(opts.title)+'</span>'
      +'</div>'
      +'<div class="wb-howto-card-main">'
      +'<strong class="wb-howto-card-value">'+esc(opts.value)+'</strong>'
      +'<span class="wb-howto-card-art" aria-hidden="true">'+opts.art+'</span>'
      +'</div>'
      +'<div class="wb-howto-card-meta">'
      +'<div class="wb-howto-meta-row"><span>'+esc(opts.meta1Lbl)+'</span><strong>'+esc(opts.meta1Val)+'</strong></div>'
      +'<div class="wb-howto-meta-row"><span>'+esc(opts.meta2Lbl)+'</span><strong>'+esc(opts.meta2Val)+'</strong></div>'
      +'</div>'
      +'<p class="wb-howto-card-tip">'+esc(opts.tip)+'</p>'
      +'</button>';
  }

  function engineName(vm){
    var engineRaw=String(vm&&vm.engineLine||'').trim();
    if(!engineRaw) return '—';
    var split=engineRaw.indexOf(' · ');
    return split>=0?engineRaw.slice(0,split):engineRaw;
  }

  function renderHowTo(vm){
    var host=$('wbHowTo');
    if(!host) return;
    var mode=currentHeroMode();
    var trig=dash(vm&&vm.triggerKey);
    var finish=dash(vm&&vm.finishText);
    var silence='—';
    if(vm&&vm.m&&vm.m.intervalMs!=null&&vm.cancelDelaySec){
      silence=String(vm.cancelDelaySec)+' '+t('homeWbHowToSec');
    }
    var phrases=wakePhrases(vm);
    var wakeMain=phrases.length?phrases[0]:dash(vm&&vm.wakePrimary);
    var wakeAlt=phrases.length>1?phrases.slice(1,3).join(' · '):'—';
    var endLine=dash(vm&&vm.endPhraseLine);

    var keyIcon='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M8 14h8"/></svg>';
    var voiceIcon='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/></svg>';

    host.innerHTML=
      '<div class="wb-howto-grid wb-howto-grid--duo">'
      +howToCardHtml({
        kind:'keys',
        active:mode==='keys',
        title:t('homeWbHowToKeysTitle'),
        value:trig,
        meta1Lbl:t('homeWbHowToFinish'),
        meta1Val:finish,
        meta2Lbl:t('homeWbHowToSilence'),
        meta2Val:silence,
        tip:t('homeWbHowToKeysTip'),
        icon:keyIcon,
        art:keycapArt(trig)
      })
      +howToCardHtml({
        kind:'voice',
        active:mode==='voice',
        title:t('homeWbHowToVoiceTitle'),
        value:wakeMain,
        meta1Lbl:t('homeWbHowToWakeAlt'),
        meta1Val:wakeAlt,
        meta2Lbl:t('homeWbHowToEnd'),
        meta2Val:endLine,
        tip:t('homeWbHowToVoiceTip'),
        icon:voiceIcon,
        art:'<span class="wb-howto-bubbles" aria-hidden="true"></span>'
      })
      +'</div>';
  }

  function keycapArt(trig){
    if(!trig||trig==='—') return '<span class="wb-howto-keycaps is-empty" aria-hidden="true"></span>';
    var parts=String(trig).split(/[\s+]+/).filter(Boolean).slice(0,4);
    if(!parts.length) return '<span class="wb-howto-keycaps is-empty" aria-hidden="true"></span>';
    return '<span class="wb-howto-keycaps" aria-hidden="true">'+parts.map(function(p){
      return '<i>'+esc(p)+'</i>';
    }).join('')+'</span>';
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

  function sceneDesc(m){
    if(m&&typeof m.description==='string'&&m.description.trim()) return m.description.trim();
    if(global.OneToneHomeScheme&&global.OneToneHomeScheme.pairLine){
      var pair=global.OneToneHomeScheme.pairLine(m);
      if(pair&&pair!=='—') return pair;
    }
    return '—';
  }

  function sceneCardHtml(m,activeId){
    var active=m.id===activeId;
    var name=global.OneToneHomeScheme?global.OneToneHomeScheme.shortName(m):'—';
    return '<button type="button" class="wb-scene-card'+(active?' is-active':'')+'" data-wb-scenario-id="'+esc(m.id)+'">'
      +'<span class="wb-scene-card-ico" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v4"/><path d="M12 18v4"/><path d="M4.93 4.93l2.83 2.83"/><path d="M16.24 16.24l2.83 2.83"/><path d="M2 12h4"/><path d="M18 12h4"/><path d="M4.93 19.07l2.83-2.83"/><path d="M16.24 7.76l2.83-2.83"/></svg></span>'
      +'<span class="wb-scene-card-body">'
      +'<span class="wb-scene-card-name">'+esc(name)+'</span>'
      +'<span class="wb-scene-card-desc">'+esc(sceneDesc(m))+'</span>'
      +'</span>'
      +'</button>';
  }

  function renderScenarioPanel(vm){
    var host=$('wbScenarioPanel');
    if(!host) return;
    var activeId=activeSceneId();
    var items=sortedMappings().filter(function(m){ return !!m.enabled; }).slice(0,8);
    var html='';
    items.forEach(function(m){ html+=sceneCardHtml(m,activeId); });
    html+='<button type="button" class="wb-scene-card wb-scene-card--new" id="wbHabitNew">'
      +'<span class="wb-scene-card-ico" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg></span>'
      +'<span class="wb-scene-card-body">'
      +'<span class="wb-scene-card-name">'+esc(t('homeWbSceneNewHabit'))+'</span>'
      +'<span class="wb-scene-card-desc">'+esc(t('homeWbSceneNewHabitDesc'))+'</span>'
      +'</span>'
      +'</button>';
    host.innerHTML=html;
  }

  function buildHomeMicBars(count){
    var html='';
    for(var i=0;i<(count||HOME_MIC_BAR_COUNT);i++) html+='<span></span>';
    return html;
  }

  function renderMicCard(vm){
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
    var eng=engineName(vm);

    host.innerHTML=
      '<div class="wb-panel-head">'
      +'<span class="wb-panel-title"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/></svg>'
      +'<span>'+esc(t('homeWbMicCardTitle'))+'</span></span>'
      +(listening?'<span class="wb-panel-badge is-live">'+esc(t('homeWbVoiceListening'))+'</span>':'')
      +'</div>'
      +'<div class="wb-mic-engine-row">'
      +'<span class="wb-mic-engine-lbl">'+esc(t('homeWbHowToEngineTitle'))+'</span>'
      +'<strong class="wb-mic-engine-name">'+esc(eng)+'</strong>'
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
      +'</div></div>'
      +'<div class="wb-voice-phrases wb-voice-phrases--hover">'
      +'<span class="wb-voice-phrases-lbl">'+esc(t('homeWbVoicePhrases'))+'</span>'
      +'<div class="wb-voice-phrase-list">'+phraseHtml+'</div>'
      +'</div>';
  }

  function renderAll(vm){
    renderHowTo(vm);
    renderScenarioPanel(vm);
    renderMicCard(vm);
  }

  function bindOnce(){
    if(global.__wb_panels_bound__) return;
    global.__wb_panels_bound__=true;
  }

  global.OneToneHomeWorkbenchPanels={
    renderAll:renderAll,
    renderHowTo:renderHowTo,
    renderPipeline:renderHowTo,
    renderHabitGrid:renderHabitGrid,
    renderScenarioPanel:renderScenarioPanel,
    renderVoicePanel:renderMicCard,
    renderMicCard:renderMicCard,
    bindOnce:bindOnce,
    stopWave:function(){}
  };
})((typeof window!=='undefined')?window:globalThis);
