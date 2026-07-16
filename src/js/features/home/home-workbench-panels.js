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

  function phraseIconSvg(kind){
    if(kind==='wake'){
      return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/><path d="M19 10v1a7 7 0 0 1-14 0v-1"/><line x1="12" y1="19" x2="12" y2="22"/></svg>';
    }
    if(kind==='end'){
      return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M9 12l2 2 4-4"/></svg>';
    }
    if(kind==='cancel'){
      return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M15 9l-6 6M9 9l6 6"/></svg>';
    }
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4 20-7z"/></svg>';
  }

  function phraseGroupHtml(kind,label,phrases){
    var shown=phrases.slice(0,2);
    var more=Math.max(0,phrases.length-shown.length);
    var chips=shown.length
      ?shown.map(function(p){ return '<span class="wb-howto-phrase-chip">'+esc(p)+'</span>'; }).join('')
      :'<span class="wb-howto-phrase-chip is-empty">—</span>';
    if(more>0){
      chips+='<span class="wb-howto-phrase-chip is-more" title="'+esc(phrases.slice(2).join(' · '))+'">+'+more+'</span>';
    }
    return '<div class="wb-howto-phrase-row" data-phrase-kind="'+esc(kind)+'">'
      +'<span class="wb-howto-phrase-ico" title="'+esc(label)+'" aria-label="'+esc(label)+'">'+phraseIconSvg(kind)+'</span>'
      +'<span class="wb-howto-phrase-lbl">'+esc(label)+'</span>'
      +'<div class="wb-howto-phrase-list">'+chips+'</div>'
      +'</div>';
  }

  function voicePhrasePanelHtml(vm){
    return '<div class="wb-howto-phrase-panel">'
      +phraseGroupHtml('wake',t('homeWbPhraseWake'),phraseList('wake',vm))
      +phraseGroupHtml('end',t('homeWbPhraseEnd'),phraseList('end',vm))
      +phraseGroupHtml('cancel',t('homeWbPhraseCancel'),phraseList('cancel',vm))
      +phraseGroupHtml('send',t('homeWbPhraseSend'),phraseList('send',vm))
      +'</div>';
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
      +'<button type="button" class="wb-howto-card is-voice'+(mode==='voice'?' is-active':'')+'" data-wb-howto="voice" title="'+esc(t('homeWbHowToVoiceTip'))+'">'
      +'<div class="wb-howto-card-head">'
      +'<span class="wb-howto-card-ico" aria-hidden="true">'+voiceIcon+'</span>'
      +'<span class="wb-howto-card-title">'+esc(t('homeWbHowToVoiceTitle'))+'</span>'
      +'</div>'
      +'<div class="wb-howto-card-main wb-howto-card-main--voice">'
      +'<strong class="wb-howto-card-value">'+esc(wakeMain)+'</strong>'
      +'</div>'
      +voicePhrasePanelHtml(vm)
      +'<p class="wb-howto-card-tip">'+esc(t('homeWbHowToVoiceTip'))+'</p>'
      +'</button>'
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

  function phraseList(kind,vm){
    var live=global.OneToneHomeLive;
    var cfg=global.OneToneState&&global.OneToneState.state&&global.OneToneState.state.config;
    var end=(cfg&&(cfg.voiceEnd||cfg.voice_end))||{};
    var lang=global.OneToneI18n&&global.OneToneI18n.getLang?global.OneToneI18n.getLang():'zh';
    var out=[];
    var seen={};
    function push(p){
      var clean=String(p||'').trim();
      if(!clean||seen[clean]) return;
      seen[clean]=true;
      out.push(clean);
    }
    if(kind==='wake'){
      wakePhrases(vm).forEach(push);
      if(live&&live.voiceWakePhrases) live.voiceWakePhrases().forEach(push);
      return out.slice(0,3);
    }
    if(kind==='end'){
      if(live&&live.voiceEndPhrases) live.voiceEndPhrases().forEach(push);
      if(!out.length){
        var endZh=end.phrasesZh||end.phrases_zh||[];
        var endEn=end.phrasesEn||end.phrases_en||[];
        (lang==='en'?(endEn.length?endEn:endZh):(endZh.length?endZh:endEn)).forEach(push);
      }
      return out.slice(0,2);
    }
    if(kind==='cancel'){
      var cZh=end.cancelPhrasesZh||end.cancel_phrases_zh||[];
      var cEn=end.cancelPhrasesEn||end.cancel_phrases_en||[];
      (lang==='en'?(cEn.length?cEn:cZh):(cZh.length?cZh:cEn)).forEach(push);
      return out.slice(0,2);
    }
    if(kind==='send'){
      var sZh=end.sendPhrasesZh||end.send_phrases_zh||[];
      var sEn=end.sendPhrasesEn||end.send_phrases_en||[];
      (lang==='en'?(sEn.length?sEn:sZh):(sZh.length?sZh:sEn)).forEach(push);
      return out.slice(0,2);
    }
    return out;
  }

  function renderMicCard(vm){
    var host=$('wbVoicePanel');
    if(!host||host.hidden||host.closest('[hidden]')) return;
  }

  function renderAll(vm){
    renderHowTo(vm);
    renderScenarioPanel(vm);
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
