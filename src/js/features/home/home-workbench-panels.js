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

  function howToSummaryCardHtml(card,icon,art){
    card=card||{};
    var kind=card.mode||'';
    var lines=(card.lines||[]).slice(0,2);
    var linesHtml='';
    if(lines.length){
      linesHtml='<div class="wb-howto-card-meta is-readonly">'
        +lines.map(function(ln){
          return '<div class="wb-howto-meta-row is-readonly">'
            +'<span>'+esc(ln.lbl||'')+'</span>'
            +'<strong>'+esc(ln.val||'—')+'</strong>'
            +'</div>';
        }).join('')
        +'</div>';
    }
    return '<article class="wb-howto-card is-readonly'+(card.active?' is-active':'')+(kind?' is-'+kind:'')+(card.empty?' is-empty':'')+'" data-wb-howto="'+esc(kind)+'" role="button" tabindex="0" aria-pressed="'+(card.active?'true':'false')+'">'
      +'<div class="wb-howto-card-head">'
      +'<span class="wb-howto-card-ico" aria-hidden="true">'+icon+'</span>'
      +'<span class="wb-howto-card-title">'+esc(card.title||'')+'</span>'
      +(card.status?'<span class="wb-howto-card-status">'+esc(card.status)+'</span>':'')
      +'</div>'
      +'<div class="wb-howto-card-main is-readonly">'
      +'<strong class="wb-howto-card-value">'+esc(card.value||'—')+'</strong>'
      +(art?'<span class="wb-howto-card-art" aria-hidden="true">'+art+'</span>':'')
      +'</div>'
      +linesHtml
      +'</article>';
  }

  function howToCardHtml(opts){
    // 兼容旧调用：转成只读摘要卡
    return howToSummaryCardHtml({
      mode:opts.kind,
      title:opts.title,
      value:opts.value,
      status:opts.status,
      active:opts.active,
      lines:[
        opts.meta1Lbl?{lbl:opts.meta1Lbl,val:opts.meta1Val}:null,
        opts.meta2Lbl?{lbl:opts.meta2Lbl,val:opts.meta2Val}:null
      ].filter(Boolean).slice(0,2)
    },opts.icon,opts.art);
  }

  function engineName(vm){
    var engineRaw=String(vm&&vm.engineLine||'').trim();
    if(!engineRaw) return '—';
    var split=engineRaw.indexOf(' · ');
    return split>=0?engineRaw.slice(0,split):engineRaw;
  }

  /** 采集 howto 文案位（不读 Camera/SoftPad 运行态；由 caps 层注入）。 */
  function collectHowToSurfaceBits(vm){
    var m=activeHabitMapping(vm);
    var trig=dash(vm&&vm.triggerKey);
    var keysLine=m&&global.OneToneHomeScheme&&global.OneToneHomeScheme.pairLine
      ?global.OneToneHomeScheme.pairLine(m)
      :trig;
    if(!keysLine||keysLine==='—') keysLine=trig;
    var finish=dash(vm&&vm.finishText);
    var phrasesWake=wakePhrases(vm);
    var wakeMain=phrasesWake.length?phrasesWake[0]:dash(vm&&vm.wakePrimary);
    if(m&&m.voiceOverride&&Array.isArray(m.voiceOverride.wakePhrases)&&m.voiceOverride.wakePhrases.length){
      wakeMain=String(m.voiceOverride.wakePhrases[0]||wakeMain);
    }
    var micEmpty=!vm||!vm.micLabel||vm.micLabel===t('homeLiveMicUnset')||vm.micLabel===t('homeLiveMicUnknown');
    var keysEmpty=!trig||trig==='—';
    var micLabel='';
    if(!micEmpty&&vm&&vm.micLabel){
      micLabel=String(vm.micLabel);
      var mMic=micLabel.match(/^(?:麦克风|Microphone)\s*[（(]\s*(.+?)\s*[）)]\s*$/i);
      if(mMic&&mMic[1]) micLabel=mMic[1].trim();
    }
    return {
      keysLine:keysLine,
      triggerKey:trig,
      finish:finish,
      wakeMain:wakeMain,
      micEmpty:micEmpty,
      keysEmpty:keysEmpty,
      micLabel:micLabel
    };
  }

  function cameraHowToSnapshot(){
    var api=global.OneToneCameraPresenceActions||null;
    var prefs=api&&api.prefs?api.prefs():null;
    var st=api&&api.getState?api.getState():null;
    var rs=api&&api.getRuntimeStatus?api.getRuntimeStatus():null;
    var enabled=!!(rs?rs.enabled:(api&&api.isEnabled?api.isEnabled():(prefs&&prefs.enabled)));
    var running=!!(rs?rs.running:false);
    var presence=st&&st.presence?String(st.presence):(rs&&rs.presence?String(rs.presence):'unknown');
    var bound=0;
    if(prefs){
      var tr=prefs.triggers||{};
      ['away','shake','blink'].forEach(function(k){ if(tr[k]) bound++; });
      if(!bound){
        ['onAway','onReturn','shakeHead','deliberateBlink'].forEach(function(k){
          if(prefs[k]&&prefs[k]!=='none') bound++;
        });
      }
    }
    var presenceLbl=t('homeWbCameraPresenceIdle');
    if(presence==='present') presenceLbl=t('homeWbCameraPresencePresent');
    else if(presence==='away') presenceLbl=t('homeWbCameraPresenceAway');
    var value=t('homeWbCameraOff');
    if(enabled&&running) value=t('homeWbCameraOn');
    else if(enabled){
      value=t('homeWbCameraConfiguredIdle','已配置 · 未运行');
      if(rs&&rs.lastError&&rs.lastError.message) value+=' · '+rs.lastError.message;
      else if(rs&&rs.manualStopped) value=t('homeWbCameraManualStopped','已配置 · 未运行（已手动停止）');
    }
    return {
      enabled:enabled,
      running:running,
      presenceLbl:presenceLbl,
      boundLbl:t('homeWbCameraBoundCount').replace('{n}',String(bound)),
      value:value
    };
  }

  function renderHowTo(projection){
    var host=$('wbHowTo');
    if(!host) return;
    // 只吃 projection；禁止在此再采集 Camera/SoftPad 快照
    if(!projection||!Array.isArray(projection.howtoCards)) return;
    var cards=projection.howtoCards;
    var keyIcon='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M8 14h8"/></svg>';
    var voiceIcon='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/></svg>';
    var camIcon='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
    var softIcon='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 7h.01M12 7h.01M16 7h.01M8 11h.01M12 11h.01M16 11h.01M8 15h8"/></svg>';
    var softArt='<span class="wb-howto-softpad-art" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i></span>';

    // 顺序必须与 Hero tabs 一致：voice → keys → softPad → camera
    // 只读摘要：无 data-wb-howto-channel，点卡只切模式
    var html='<div class="wb-howto-grid wb-howto-grid--quad">';
    cards.forEach(function(card){
      if(!card) return;
      var icon=voiceIcon;
      var art='';
      if(card.mode==='keys'){
        icon=keyIcon;
        art=keycapArt(card.artPayload||'');
      }else if(card.mode==='softPad'){
        icon=softIcon;
        art=softArt;
      }else if(card.mode==='camera'){
        icon=camIcon;
        art='<span class="wb-howto-cam-dot'+(card.cameraRunning?' is-on':(card.cameraEnabled?' is-configured':''))+'" aria-hidden="true"></span>';
      }
      html+=howToSummaryCardHtml(card,icon,art);
    });
    html+='</div>';
    host.innerHTML=html;
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

  function sceneIconHtml(m){
    var cfg=global.OneToneState&&global.OneToneState.state?global.OneToneState.state.config:null;
    var diff=global.OneToneHabitOverrideDiff;
    var isBaseline=!!(diff&&diff.isGlobalBaselineMapping
      &&diff.isGlobalBaselineMapping(m,cfg||{},global.OneToneMappingCore));
    var isApp=!!(diff&&diff.isAppScenarioMapping&&diff.isAppScenarioMapping(m));
    // Universal / baseline must never wear an app (e.g. Cursor) icon.
    if(!isBaseline&&isApp){
      var hub=global.OneToneHabitHub;
      if(hub&&hub.renderMappingAppIcon){
        var badge=hub.renderMappingAppIcon(m,'wb-scene-app-badge');
        if(badge) return badge;
      }
      var appId=String(m&&m.appTargetId||'').trim();
      if(appId&&appId!=='custom'&&global.OneToneAppTargetPresets&&global.OneToneAppTargetPresets.presetById){
        var preset=global.OneToneAppTargetPresets.presetById(appId);
        if(preset&&preset.icon){
          return '<span class="wb-scene-card-ico wb-scene-card-ico--app" aria-hidden="true">'
            +'<img src="'+esc(preset.icon)+'" alt="" decoding="async" />'
            +'</span>';
        }
      }
      var rules=global.OneToneAppBehaviorRules;
      if(rules&&rules.customRulesForMapping){
        var customs=rules.customRulesForMapping(m)||[];
        var rule=customs[0];
        var url=rule?String(rule.iconDataUrl||rule.icon_data_url||'').trim():'';
        if(url){
          return '<span class="wb-scene-card-ico wb-scene-card-ico--app" aria-hidden="true">'
            +'<img src="'+esc(url)+'" alt="" decoding="async" />'
            +'</span>';
        }
      }
    }
    return '<span class="wb-scene-card-ico" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v4"/><path d="M12 18v4"/><path d="M4.93 4.93l2.83 2.83"/><path d="M16.24 16.24l2.83 2.83"/><path d="M2 12h4"/><path d="M18 12h4"/><path d="M4.93 19.07l2.83-2.83"/><path d="M16.24 7.76l2.83-2.83"/></svg></span>';
  }

  function softPadSummaryLine(){
    var snap=softPadHowToSnapshot();
    return snap.value;
  }

  function softPadHowToSnapshot(){
    var hub=global.OneToneSoftPadHub;
    var entries=(hub&&hub.listSoftPadSchemes)?hub.listSoftPadSchemes():[];
    if(!entries.length){
      return {
        value:t('homeWbChannelUnset'),
        status:'',
        statusLbl:t('homeWbChannelUnset'),
        countLbl:t('homeWbHowToSoftPadCount').replace('{n}','0'),
        boundName:t('homeWbChannelUnset'),
        mappingId:''
      };
    }
    var on=entries.filter(function(e){ return e&&e.padEnabled; });
    var pick=(on.length?on:entries)[0]||null;
    var titles=(on.length?on:entries).map(function(e){ return e.title; }).filter(Boolean);
    var value=titles.length?titles.join(' · '):t('homeWbChannelUnset');
    var boundName='';
    var mappingId='';
    if(pick&&pick.mapping){
      mappingId=String(pick.mapping.id||'');
      if(global.OneToneHabitProfile&&global.OneToneHabitProfile.habitDisplayName){
        boundName=global.OneToneHabitProfile.habitDisplayName(pick.mapping);
      }else if(global.OneToneHomeScheme&&global.OneToneHomeScheme.shortName){
        boundName=global.OneToneHomeScheme.shortName(pick.mapping);
      }
    }
    if(!boundName) boundName=t('homeWbHowToSoftPadCount').replace('{n}',String(entries.length));
    return {
      value:value,
      status:on.length?t('homeWbHabitActive'):'',
      statusLbl:on.length?t('homeWbHowToSoftPadOn'):t('homeWbHowToSoftPadOff'),
      countLbl:t('homeWbHowToSoftPadCount').replace('{n}',String(entries.length)),
      boundName:boundName,
      mappingId:mappingId
    };
  }

  function activeHabitMapping(vm){
    var activeId=activeSceneId();
    var m=null;
    if(activeId&&global.OneToneMappingCore&&global.OneToneMappingCore.byId){
      m=global.OneToneMappingCore.byId(activeId);
    }
    if(!m&&vm&&vm.m) m=vm.m;
    if(!m&&global.OneToneHomeScheme&&global.OneToneHomeScheme.activeMapping){
      m=global.OneToneHomeScheme.activeMapping();
    }
    return m||null;
  }

  function renderHabitBar(vm){
    // Channel summary moved into howto cards; in-use/edit lives on the scene rail.
    // Keep host cleared if a stale shell still exists.
    var host=$('wbHabitBar');
    if(host){
      host.innerHTML='';
      host.hidden=true;
    }
  }

  function sceneCardHtml(m,activeId){
    var active=m.id===activeId;
    var name=(global.OneToneHabitProfile&&global.OneToneHabitProfile.habitDisplayName)
      ?global.OneToneHabitProfile.habitDisplayName(m)
      :(global.OneToneHomeScheme?global.OneToneHomeScheme.shortName(m):'—');
    var useLbl=active?t('homeWbHabitActive'):t('homeWbHabitBarUse');
    return '<div class="wb-scene-card'+(active?' is-active':'')+'" data-wb-scenario-id="'+esc(m.id)+'">'
      +sceneIconHtml(m)
      +'<span class="wb-scene-card-body">'
      +'<span class="wb-scene-card-name">'+esc(name)+'</span>'
      +'<span class="wb-scene-card-desc">'+esc(sceneDesc(m))+'</span>'
      +'<span class="wb-scene-card-actions">'
      +'<button type="button" class="wb-scene-card-btn" data-wb-scenario-use="'+esc(m.id)+'">'+esc(useLbl)+'</button>'
      +'<button type="button" class="wb-scene-card-btn wb-scene-card-btn--ghost" data-wb-scenario-edit="'+esc(m.id)+'">'+esc(t('homeWbHabitBarEdit'))+'</button>'
      +'</span>'
      +'</span>'
      +'</div>';
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
    var rules=global.OneToneAppBehaviorRules;
    if(rules&&rules.prefetchMappingRuleIcons){
      items.forEach(function(m){ rules.prefetchMappingRuleIcons(m); });
    }
  }

  function buildHomeMicBars(count){
    var html='';
    for(var i=0;i<(count||HOME_MIC_BAR_COUNT);i++) html+='<span></span>';
    return html;
  }

  function renderMicCard(vm){
    var host=$('wbVoicePanel');
    if(!host||host.hidden||host.closest('[hidden]')) return;
  }

  function renderAll(vm){
    renderHabitBar(vm);
    // howto 仅由 workbench.paintHeroSurfaces(projection) 驱动，避免二次 snapshot / 漂移
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
    renderHabitBar:renderHabitBar,
    renderHabitGrid:renderHabitGrid,
    renderScenarioPanel:renderScenarioPanel,
    renderVoicePanel:renderMicCard,
    renderMicCard:renderMicCard,
    softPadHowToSnapshot:softPadHowToSnapshot,
    cameraHowToSnapshot:cameraHowToSnapshot,
    collectHowToSurfaceBits:collectHowToSurfaceBits,
    bindOnce:bindOnce,
    stopWave:function(){}
  };
})((typeof window!=='undefined')?window:globalThis);
