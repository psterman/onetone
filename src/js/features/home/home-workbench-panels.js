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
    var lines=(card.lines||[]).slice(0,card.active?1:0);
    var linesHtml='';
    if(lines.length){
      linesHtml='<div class="wb-howto-card-meta">'
        +lines.map(function(ln){
          return '<div class="wb-howto-meta-row">'
            +'<span>'+esc(ln.lbl||'')+'</span>'
            +'<strong>'+esc(ln.val||'—')+'</strong>'
            +'</div>';
        }).join('')
        +'</div>';
    }
    // Summary card: inactive → switch hero; active → open channel settings.
    return '<article class="wb-howto-card'+(card.active?' is-active':'')+(kind?' is-'+kind:'')+(card.empty?' is-empty':'')+'" data-wb-howto="'+esc(kind)+'" role="button" tabindex="0" aria-pressed="'+(card.active?'true':'false')+'" title="'+esc(t('homeWbHowToOpenTip','点此切换上方预览；再点打开设置'))+'">'
      +'<div class="wb-howto-card-head">'
      +'<span class="wb-howto-card-ico" aria-hidden="true">'+icon+'</span>'
      +'<span class="wb-howto-card-title">'+esc(card.title||'')+'</span>'
      +(card.status?'<span class="wb-howto-card-status">'+esc(card.status)+'</span>':'')
      +'</div>'
      +'<div class="wb-howto-card-main">'
      +'<strong class="wb-howto-card-value">'+esc(card.value||'—')+'</strong>'
      +(art?'<span class="wb-howto-card-art" aria-hidden="true">'+art+'</span>':'')
      +'</div>'
      +linesHtml
      +'</article>';
  }

  function howToCardHtml(opts){
    // 兼容旧调用：转成摘要卡
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
    var actionsLine='';
    if(prefs){
      var bits=[];
      var tr=prefs.triggers||{};
      function shortAct(act){
        var s=String(act||'').trim();
        if(!s||s==='none') return '';
        if(s==='pressEsc'){
          var e=t('cameraPresenceActionEsc');
          return (!e||e==='cameraPresenceActionEsc')?'Esc':e;
        }
        if(s==='pressCtrlI'){
          var c=t('homeLiveVoiceTitle');
          return (!c||c==='homeLiveVoiceTitle')?'语音激活':c;
        }
        if(s==='privacyScreen'){
          var p=t('cameraPresenceActionPrivacy');
          return (!p||p==='cameraPresenceActionPrivacy')?'遮罩':p;
        }
        if(s==='resumeVoice'){
          var r=t('cameraPresenceActionResume');
          return (!r||r==='cameraPresenceActionResume')?'恢复语音':r;
        }
        if(s.indexOf('agent:')===0) return s.slice(6);
        return s;
      }
      function addAct(on,act,title){
        if(!on||!act||act==='none') return;
        var short=shortAct(act);
        if(!short) return;
        bits.push(title+'→'+short);
      }
      addAct(!!tr.shake,prefs.shakeHead,t('cameraCardShakeTitle')==='cameraCardShakeTitle'?'摇头':t('cameraCardShakeTitle'));
      addAct(!!tr.blink,prefs.deliberateBlink,'闭眼');
      addAct(!!tr.away,prefs.onAway,t('cameraPresenceOnAway')==='cameraPresenceOnAway'?'离席':t('cameraPresenceOnAway'));
      addAct(!!tr.away,prefs.onReturn,t('cameraPresenceOnReturn')==='cameraPresenceOnReturn'?'回席':t('cameraPresenceOnReturn'));
      addAct(!!tr.openPalm,prefs.openPalm,t('homeWbCameraPalmShort')==='homeWbCameraPalmShort'?'张掌':t('homeWbCameraPalmShort'));
      addAct(!!tr.okHand,prefs.okHand,t('homeWbCameraOkShort')==='homeWbCameraOkShort'?'OK':t('homeWbCameraOkShort'));
      addAct(!!tr.fist,prefs.fist,t('homeWbCameraFistShort')==='homeWbCameraFistShort'?'握拳':t('homeWbCameraFistShort'));
      addAct(!!tr.wave,prefs.wave,t('homeWbCameraWaveShort')==='homeWbCameraWaveShort'?'挥手':t('homeWbCameraWaveShort'));
      actionsLine=bits.slice(0,3).join(' · ');
    }
    var value=t('homeWbCameraOff');
    if(enabled&&actionsLine) value=actionsLine;
    else if(enabled&&running) value=t('homeWbCameraOn');
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
      actionsLine:actionsLine,
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
    // 摘要卡：展示正在使用习惯；点未激活卡切 Hero，再点激活卡开设置
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

  /** Config layer: only activeSceneId → mapping → codexMicroPad. Never read Applied. */
  function softPadActiveHabitConfigLayer(){
    var m=null;
    var id=activeSceneId();
    if(id&&global.OneToneMappingCore&&global.OneToneMappingCore.byId){
      m=global.OneToneMappingCore.byId(id);
    }
    var hub=global.OneToneSoftPadHub;
    var cfg=global.OneToneState&&global.OneToneState.state&&global.OneToneState.state.config;
    var diff=global.OneToneHabitOverrideDiff;
    var isBaseline=!!(m&&diff&&diff.isGlobalBaselineMapping
      &&diff.isGlobalBaselineMapping(m,cfg||{},global.OneToneMappingCore));
    var pad=m&&m.codexMicroPad;
    var padConfigured=!!(pad&&pad.enabled===true);
    var eligible=!!(hub&&hub.isSoftPadSchemeEligible&&hub.isSoftPadSchemeEligible(m));
    // Soft Pad is agent-app scoped; baseline / non-agent → not applicable.
    if(!m||isBaseline||(!eligible&&!pad)){
      return {
        configKind:'na',
        configLbl:t('homeWbSoftPadHabitNa','不含 Soft Pad'),
        configConfigured:false
      };
    }
    if(padConfigured){
      return {
        configKind:'configured',
        configLbl:t('homeWbSoftPadHabitConfigured','已配置'),
        configConfigured:true
      };
    }
    return {
      configKind:'unconfigured',
      configLbl:t('homeWbSoftPadHabitUnconfigured','未配置'),
      configConfigured:false
    };
  }

  function softPadControlAutoLbl(agentName){
    if(!agentName) return t('homeWbSoftPadControlNone','暂无');
    return t('homeWbSoftPadControlAuto','{name}（自动）').replace(/\{name\}/g,agentName);
  }

  /** Merge habit-config + runtime-control into one homepage Soft Pad snapshot. */
  function finalizeSoftPadSnapshot(control){
    control=control||{};
    var cfgLayer=softPadActiveHabitConfigLayer();
    var configLine=t('homeWbSoftPadHabitLine','此习惯：{state}').replace('{state}',cfgLayer.configLbl);
    var controlLbl=control.controlLbl
      ||(control.confirming
        ?t('homeWbSoftPadControlConfirming','正在确认当前控制')
        :(control.agentName?softPadControlAutoLbl(control.agentName):t('homeWbSoftPadControlNone','暂无')));
    var controlLine=t('homeWbSoftPadControlLine','当前控制：{state}').replace('{state}',controlLbl);
    var followHint=t('homeWbSoftPadFollowHint','运行时自动跟随 Agent');
    var value=configLine+' · '+controlLine;
    return Object.assign({},control,{
      configKind:cfgLayer.configKind,
      configLbl:cfgLayer.configLbl,
      configConfigured:cfgLayer.configConfigured,
      configLine:configLine,
      controlLbl:controlLbl,
      controlLine:controlLine,
      followHint:followHint,
      value:value,
      displayPrimary:controlLine,
      // Stop pressing a single「已启用」status — hero/howto use config+control lines.
      statusLbl:controlLbl,
      status:followHint,
      boundName:control.agentName||cfgLayer.configLbl,
      empty:false
    });
  }

  function softPadHowToSnapshot(){
    var hub=global.OneToneSoftPadHub;
    var entries=(hub&&hub.listSoftPadSchemes)?hub.listSoftPadSchemes():[];
    // Homepage paint: skip pin prune — it only clears an already-removed product state.
    var enabled=entries.filter(function(e){ return e&&e.padEnabled; });
    var cache=(hub&&hub.getCachedSoftPadRuntime)?hub.getCachedSoftPadRuntime():null;
    // Only poll Soft Pad runtime when that hero is active — every paint used to IPC-refresh.
    var heroSoft=false;
    try{
      heroSoft=!!(global.OneToneHomeWorkbench&&global.OneToneHomeWorkbench.getHeroMode
        &&global.OneToneHomeWorkbench.getHeroMode()==='softPad');
    }catch(_){}
    if(heroSoft&&hub&&hub.refreshSoftPadRuntimeAsync){
      var now=Date.now();
      if(!softPadHowToSnapshot._lastRefreshAt||(now-softPadHowToSnapshot._lastRefreshAt)>=2000){
        softPadHowToSnapshot._lastRefreshAt=now;
        hub.refreshSoftPadRuntimeAsync();
      }
    }

    // Prefer Rust Applied when cutover + first snapshot received.
    if(cache&&cache.receivedFirstSnapshot&&cache.snap&&cache.snap.cutover&&cache.snap.applied){
      return softPadSnapshotFromApplied(cache.snap,enabled);
    }
    if(cache&&!cache.receivedFirstSnapshot){
      return finalizeSoftPadSnapshot({
        confirming:true,
        controlLbl:t('homeWbSoftPadControlConfirming','正在确认当前控制'),
        countLbl:t('homeWbHowToSoftPadCount').replace('{n}',String(enabled.length)),
        agentName:'',
        displayReason:'',
        reason:'confirming',
        mappingId:'',
        agentOnlyHint:'',
        schemeCount:enabled.length
      });
    }
    if(cache&&cache.snap&&cache.snap.cutover&&cache.snap.health==='unavailable'){
      var unavail=t('homeWbSoftPadUnavailable','Soft Pad 暂时不可用');
      return finalizeSoftPadSnapshot({
        controlLbl:unavail,
        countLbl:t('homeWbHowToSoftPadCount').replace('{n}',String(enabled.length)),
        agentName:'',
        displayReason:'',
        reason:'unavailable',
        mappingId:'',
        agentOnlyHint:'',
        schemeCount:enabled.length
      });
    }

    // Oracle / pre-cutover display path (not "当前控制" from habit).
    var ctx=(hub&&hub.laneContextFromRuntime)?hub.laneContextFromRuntime():{};
    var result=(hub&&hub.resolvePrimaryLaneResult)
      ?hub.resolvePrimaryLaneResult(entries,ctx)
      :{entry:(hub&&hub.resolvePrimaryLane)?hub.resolvePrimaryLane(entries,ctx):null,reason:enabled.length?'fallback':'none'};
    var lane=result.entry||null;
    var reason=result.reason||(lane?'fallback':'none');
    var others=Math.max(0,enabled.length-(lane?1:0));
    if(hub&&hub.publishSoftPadLaneSnapshot){
      var laneKind=lane&&lane.kind?lane.kind:null;
      var pubKey=String(laneKind||'')+'\0'+String(reason||'')+'\0'+others;
      if(softPadHowToSnapshot._lastPubKey!==pubKey){
        softPadHowToSnapshot._lastPubKey=pubKey;
        hub.publishSoftPadLaneSnapshot({
          displayLaneKind:laneKind,
          reason:reason,
          userLaneId:ctx.userLaneId==null?null:ctx.userLaneId,
          foregroundAppId:ctx.foregroundAppId||'',
          waitingKinds:Array.isArray(ctx.waitingKinds)?ctx.waitingKinds:[],
          foregroundFresh:!!ctx.foregroundFresh,
          waitingFresh:!!ctx.waitingFresh,
          foregroundObservedAt:ctx.foregroundObservedAt==null?null:ctx.foregroundObservedAt,
          waitingObservedAt:ctx.waitingObservedAt==null?null:ctx.waitingObservedAt,
          otherEnabledCount:others,
          source:'home'
        });
      }
    }
    if(!lane){
      return finalizeSoftPadSnapshot({
        controlLbl:t('homeWbSoftPadControlNone','暂无'),
        countLbl:t('homeWbHowToSoftPadCount').replace('{n}',String(enabled.length)),
        agentName:'',
        displayReason:t('homeWbSoftPadReasonNone','还没有可用的 Agent，先准备 Codex 或 Claude'),
        reason:'none',
        mappingId:'',
        agentOnlyHint:'',
        schemeCount:enabled.length
      });
    }
    var agentName=agentTitleFromKind(lane.kind,lane.title);
    var mappingId=lane.mapping?String(lane.mapping.id||''):'';
    var displayReason=(hub&&hub.formatDisplayLaneReason)
      ?hub.formatDisplayLaneReason(reason,agentName)
      :'';
    if(others>0){
      displayReason=displayReason
        ?(displayReason+' · '+t('homeWbSoftPadOthersReady','另有 {n} 个已准备').replace('{n}',String(others)))
        :t('homeWbSoftPadOthersReady','另有 {n} 个已准备').replace('{n}',String(others));
    }
    return finalizeSoftPadSnapshot({
      countLbl:t('homeWbHowToSoftPadCount').replace('{n}',String(enabled.length)),
      agentName:agentName,
      displayReason:displayReason,
      reason:reason,
      mappingId:mappingId,
      agentOnlyHint:'',
      schemeCount:enabled.length
    });
  }

  function agentTitleFromKind(kind,fallback){
    kind=String(kind||'').toLowerCase();
    if(kind==='claude') return t('softPadHubKindClaude','Claude');
    if(kind==='codex') return t('softPadHubKindCodex','Codex');
    if(kind==='cursor') return t('softPadHubKindCursor','Cursor');
    if(kind==='workbuddy') return t('softPadHubKindWorkBuddy','WorkBuddy');
    if(kind==='trae') return t('softPadHubKindTrae','Trae');
    if(kind==='qoder') return t('softPadHubKindQoder','Qoder');
    if(kind==='minimax') return t('softPadHubKindMinimax','MiniMax');
    return fallback||String(kind||'');
  }

  function softPadSnapshotFromApplied(snap,enabled){
    enabled=Array.isArray(enabled)?enabled:[];
    var applied=snap.applied||{};
    var health=String(snap.health||'ready').toLowerCase();
    if(health==='unavailable'){
      var unavail=t('homeWbSoftPadUnavailable','Soft Pad 暂时不可用');
      return finalizeSoftPadSnapshot({
        controlLbl:unavail,
        countLbl:t('homeWbHowToSoftPadCount').replace('{n}',String(enabled.length)),
        agentName:'',
        displayReason:'',
        reason:'unavailable',
        mappingId:'',
        agentOnlyHint:'',
        schemeCount:enabled.length
      });
    }

    var reason=String(applied.reason||'none');
    if(reason==='UserPin'||reason==='user_pin') reason='userPin';
    if(reason==='Waiting') reason='waiting';
    if(reason==='Foreground') reason='foreground';
    if(reason==='Fallback') reason='fallback';
    if(reason==='None') reason='none';

    var kind=applied.laneKind;
    if(kind&&typeof kind==='object'){
      kind=kind.claude!=null?'claude':(kind.codex!=null?'codex':(kind.cursor!=null?'cursor':''));
    }
    kind=kind==null?'':String(kind).toLowerCase();
    if(kind&&['codex','claude','cursor','workbuddy','trae','qoder','minimax'].indexOf(kind)<0) kind='';

    if(!kind||reason==='none'){
      return finalizeSoftPadSnapshot({
        controlLbl:t('homeWbSoftPadControlNone','暂无'),
        countLbl:t('homeWbHowToSoftPadCount').replace('{n}',String(enabled.length)),
        agentName:'',
        displayReason:'',
        reason:'none',
        mappingId:applied.mappingId||'',
        agentOnlyHint:'',
        schemeCount:enabled.length
      });
    }

    var agentName=agentTitleFromKind(kind,'');
    var others=Math.max(0,enabled.length-1);
    var hub=global.OneToneSoftPadHub;
    var displayReason=(hub&&hub.formatDisplayLaneReason)
      ?hub.formatDisplayLaneReason(reason,agentName)
      :'';
    if(reason==='foreground'){
      displayReason=t('homeWbSoftPadReasonForegroundControl','你正在使用 {app}，Soft Pad 已自动跟随')
        .replace('{app}',agentName);
    }else if(reason==='waiting'){
      displayReason=t('homeWbSoftPadReasonWaitingControl','{name} 正在等待你，所以已切换到 {name}')
        .replace(/\{name\}/g,agentName);
    }else if(reason==='userPin'){
      displayReason=t('homeWbSoftPadReasonFallback','已使用准备好的 {name}').replace('{name}',agentName);
    }
    if(health==='degraded'&&snap.lastRecomputeError){
      displayReason=(displayReason?displayReason+' · ':'')+t('homeWbSoftPadDegraded','重算未完全成功，仍使用当前主控');
    }
    if(others>0){
      displayReason=displayReason
        ?(displayReason+' · '+t('homeWbSoftPadOthersReady','另有 {n} 个已准备').replace('{n}',String(others)))
        :t('homeWbSoftPadOthersReady','另有 {n} 个已准备').replace('{n}',String(others));
    }
    return finalizeSoftPadSnapshot({
      countLbl:t('homeWbHowToSoftPadCount').replace('{n}',String(enabled.length)),
      agentName:agentName,
      displayReason:displayReason,
      reason:reason,
      mappingId:applied.mappingId||'',
      agentOnlyHint:'',
      schemeCount:enabled.length,
      applied:true,
      health:health
    });
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

  function sceneHabitName(m){
    if(global.OneToneHabitProfile&&global.OneToneHabitProfile.habitDisplayName){
      return global.OneToneHabitProfile.habitDisplayName(m);
    }
    return global.OneToneHomeScheme?global.OneToneHomeScheme.shortName(m):'—';
  }

  function isBaselineScene(m){
    var cfg=global.OneToneState&&global.OneToneState.state?global.OneToneState.state.config:null;
    var diff=global.OneToneHabitOverrideDiff;
    return !!(diff&&diff.isGlobalBaselineMapping
      &&diff.isGlobalBaselineMapping(m,cfg||{},global.OneToneMappingCore));
  }

  function isAppScenarioScene(m){
    var diff=global.OneToneHabitOverrideDiff;
    return !!(diff&&diff.isAppScenarioMapping&&diff.isAppScenarioMapping(m));
  }

  function sceneChannelPillsHtml(m){
    var keysOn=!!(m&&String(m.triggerKey||'').trim());
    var keysLbl=keysOn
      ?t('homeWbHabitChKeysOn','按键·已设')
      :t('homeWbHabitChKeysOff','按键·未设');
    var vo=m&&m.voiceOverride?m.voiceOverride:null;
    var voiceCustom=!!(vo&&(
      (Array.isArray(vo.wakePhrases)&&vo.wakePhrases.length)||
      String(vo.engine||'').trim()||
      String(vo.modelPreset||'').trim()
    ));
    var voiceLbl;
    if(!isAppScenarioScene(m)){
      voiceLbl=t('homeWbHabitChVoiceBase','语音·通用');
    }else if(voiceCustom){
      voiceLbl=t('homeWbHabitChVoiceOn','语音·已设');
    }else{
      voiceLbl=t('homeWbHabitChVoiceInherit','语音·沿用通用');
    }
    var camOv=m&&m.cameraOverride;
    var camCustom=!!(camOv&&typeof camOv==='object'&&Object.keys(camOv).length);
    var camLbl;
    if(!isAppScenarioScene(m)){
      camLbl=t('habitHubChCamBase','摄像头·通用');
    }else if(camCustom){
      camLbl=t('habitHubChCamOn','摄像头·已设');
    }else{
      camLbl=t('habitHubChCamInherit','摄像头·沿用通用');
    }
    var hub=global.OneToneSoftPadHub;
    var padEligible=!!(hub&&hub.isSoftPadSchemeEligible&&hub.isSoftPadSchemeEligible(m));
    var padOn=!!(m&&m.codexMicroPad&&m.codexMicroPad.enabled);
    var padLbl;
    if(!padEligible){
      padLbl=t('homeWbHabitChPadNa','Soft Pad·—');
    }else if(padOn){
      padLbl=t('homeWbHabitChPadOn','Soft Pad·开');
    }else{
      padLbl=t('homeWbHabitChPadOff','Soft Pad·关');
    }
    function pill(label){
      return '<span class="wb-scene-summary-pill">'+esc(label)+'</span>';
    }
    // Order matches homepage howto quad + Hub micro-pills: keys · voice · camera · softPad.
    return '<span class="wb-scene-summary-pills" aria-hidden="true">'
      +pill(keysLbl)+pill(voiceLbl)+pill(camLbl)+pill(padLbl)
      +'</span>';
  }

  function sceneChipShortName(m){
    if(isBaselineScene(m)) return t('homeWbChipUniversal','通用');
    var full=sceneHabitName(m);
    var short=String(full||'')
      .replace(/\s*场景\s*$/,'')
      .replace(/\s*Scene\s*$/i,'')
      .trim();
    return short||full||'—';
  }

  function chipFlyoutContent(id){
    id=String(id||'').trim();
    if(!id||!global.OneToneMappingCore||!global.OneToneMappingCore.byId) return null;
    var m=global.OneToneMappingCore.byId(id);
    if(!m) return null;
    return {
      id:String(m.id),
      name:sceneHabitName(m),
      pair:sceneDesc(m),
      pillsHtml:sceneChannelPillsHtml(m),
      active:String(m.id)===String(activeSceneId()||'')
    };
  }

  function sceneChipFlyoutShellHtml(){
    return '<div id="wbSceneChipFlyout" class="wb-scene-chip-flyout" hidden role="dialog" aria-label="'+esc(t('homeWbChipFlyoutAria','习惯预览'))+'">'
      +'<div class="wb-scene-chip-flyout-name" data-flyout-name></div>'
      +'<p class="wb-scene-chip-flyout-pair" data-flyout-pair></p>'
      +'<div class="wb-scene-chip-flyout-pills" data-flyout-pills></div>'
      +'<div class="wb-scene-chip-flyout-actions">'
      +'<button type="button" class="wb-scene-summary-cta" data-flyout-use data-wb-scenario-use="">'
      +esc(t('homeWbHabitBarUse','设为正在使用'))
      +'</button>'
      +'<button type="button" class="wb-scene-summary-cta is-ghost" data-flyout-hub data-wb-habit-open-hub="">'
      +esc(t('homeWbHabitOpenHub','查看全部'))
      +'</button>'
      +'</div>'
      +'</div>';
  }

  function sceneChipHtml(m,activeId){
    var active=m.id===activeId;
    var full=sceneHabitName(m);
    var short=sceneChipShortName(m);
    var activeDot=active
      ?'<span class="wb-scene-chip-dot" title="'+esc(t('homeWbHabitActive'))+'"></span>'
      :'';
    return '<button type="button" class="wb-scene-chip'+(active?' is-active':'')+'"'
      +' data-wb-scenario-id="'+esc(m.id)+'"'
      +' data-wb-chip-id="'+esc(m.id)+'"'
      +' aria-pressed="'+(active?'true':'false')+'"'
      +' aria-haspopup="dialog"'
      +' title="'+esc(full)+'"'
      +' aria-label="'+esc(full+(active?' · '+t('homeWbHabitActive'):''))+'">'
      +sceneIconHtml(m)
      +'<span class="wb-scene-chip-name">'+esc(short)+'</span>'
      +activeDot
      +'</button>';
  }

  function renderScenarioPanel(vm){
    var host=$('wbScenarioPanel');
    if(!host) return;
    var rules=global.OneToneAppBehaviorRules;
    // Never prune+persist on paint — omitting stubs without trash fights Rust merge_save
    // and loops save/mvp_init until the UI freezes. Display filter below is enough.
    var activeId=activeSceneId();
    var items=sortedMappings().filter(function(m){
      if(!m||!m.enabled) return false;
      if(rules&&rules.isIncompleteCustomStub&&rules.isIncompleteCustomStub(m)) return false;
      return true;
    });
    // Baseline first so 「通用」anchors the chip rail for beginners.
    items.sort(function(a,b){
      var ab=isBaselineScene(a)?0:1;
      var bb=isBaselineScene(b)?0:1;
      if(ab!==bb) return ab-bb;
      return (a.order||0)-(b.order||0);
    });
    items=items.slice(0,8);
    var active=null;
    for(var i=0;i<items.length;i++){
      if(items[i].id===activeId){ active=items[i]; break; }
    }
    if(!active&&items.length) active=items[0];
    var appCount=0;
    items.forEach(function(m){ if(isAppScenarioScene(m)) appCount++; });
    var html='<div class="wb-scene-chips" role="list">';
    items.forEach(function(m){ html+=sceneChipHtml(m,active?active.id:activeId); });
    html+='<button type="button" class="wb-scene-chip wb-scene-chip--new" id="wbHabitNew"'
      +' title="'+esc(t('homeWbSceneNewHabitDesc'))+'"'
      +' aria-label="'+esc(t('homeWbSceneNewHabit')+' · '+t('homeWbSceneNewHabitDesc'))+'">'
      +'<span class="wb-scene-card-ico" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg></span>'
      +'<span class="wb-scene-chip-name">'+esc(t('homeWbSceneNewHabit'))+'</span>'
      +'</button>';
    html+='</div>';
    // No summary card under chips — hero + active chip + hover flyout already cover it.
    html+=sceneChipFlyoutShellHtml();
    if(!appCount){
      html+='<p class="wb-scene-rail-hint">'+esc(t(
        'homeWbHabitRailHint',
        '先配好通用设置即可日常使用；某个软件要不同按键时，再点 + 加应用场景。'
      ))+'</p>';
    }else{
      html+='<p class="wb-scene-rail-hint">'+esc(t(
        'homeWbHabitRailTempPick',
        '也可以临时手动选择；开启自动切换后，离开首页会继续跟随前台。'
      ))+'</p>';
    }
    host.innerHTML=html;
    var manage=$('wbHabitManage');
    if(manage){
      manage.textContent=t('homeWbHabitManage','管理');
      manage.setAttribute('data-wb-habit-open-hub',active&&active.id?String(active.id):'');
    }
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
    chipFlyoutContent:chipFlyoutContent,
    sceneChipShortName:sceneChipShortName,
    cameraHowToSnapshot:cameraHowToSnapshot,
    collectHowToSurfaceBits:collectHowToSurfaceBits,
    sceneIconHtml:sceneIconHtml,
    bindOnce:bindOnce,
    stopWave:function(){}
  };
})((typeof window!=='undefined')?window:globalThis);
