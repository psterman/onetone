/**
 * Tab2 MVP: honest follow + dual try CTAs (local IME vs Agent workflow).
 */
(function(global){
  'use strict';

  var $=function(id){ return global.OneToneDom.$(id); };
  var t=function(key,fallback){
    if(global.OneToneI18n&&global.OneToneI18n.t){
      var v=global.OneToneI18n.t(key);
      if(v&&v!==key) return v;
    }
    return fallback!=null?fallback:key;
  };

  /** @type {''|'noRelease'|'noFocus'|'badHoldKey'|'clipboard'} */
  var lastFailureHint='';
  var bound=false;
  var ADVANCED_OPEN_KEY='voiceTab2AdvancedOpened';

  var PULSE_TRIGGER_KEYS={ Volume_Down:1, Volume_Up:1, Volume_Mute:1 };

  var AGENT_ROUTES={
    'cursor-chat':{route:'Cursor',landing:'Composer'},
    'codex-chat':{route:'Codex',landing:'Composer'},
    'claude-code':{route:'Claude Code',landing:'Terminal'},
    'minimax-chat':{route:'MiniMax',landing:'Composer'},
    'workbuddy-chat':{route:'WorkBuddy',landing:'Composer'},
    'trae-work':{route:'Trae',landing:'Composer'},
    'trae-code':{route:'Trae Code',landing:'Composer'},
    'qoder-chat':{route:'Qoder',landing:'Composer'}
  };
  var AGENT_PREFER=[
    'cursor-chat','codex-chat','claude-code','qoder-chat',
    'minimax-chat','workbuddy-chat','trae-work','trae-code'
  ];

  function lang(){
    return (global.OneToneI18n&&global.OneToneI18n.lang)?global.OneToneI18n.lang():'zh';
  }

  function toast(msg,kind){
    if(global.OneToneUi&&global.OneToneUi.toast) global.OneToneUi.toast(msg,kind||'');
    else if(global.OneToneApp&&global.OneToneApp.toast) global.OneToneApp.toast(msg);
  }

  function config(){
    return global.OneToneState&&global.OneToneState.state&&global.OneToneState.state.config;
  }

  function baselineMapping(){
    var cfg=config();
    if(!cfg||!Array.isArray(cfg.mappings)) return null;
    var diff=global.OneToneHabitOverrideDiff;
    var core=global.OneToneMappingCore;
    if(diff&&diff.findGlobalBaselineMapping){
      var baseline=diff.findGlobalBaselineMapping(cfg,core);
      if(baseline) return baseline;
    }
    return cfg.mappings[0]||null;
  }

  function activeMapping(){
    return baselineMapping();
  }

  function effectiveTrigger(m,baseline){
    var v=String(m&&m.triggerKey||'').trim();
    if(v) return v;
    return String(baseline&&baseline.triggerKey||'').trim();
  }

  function triggerMappingForDisplay(){
    var m=baselineMapping();
    if(!m) return null;
    var trig=effectiveTrigger(m,m);
    return Object.assign({},m,{triggerKey:trig});
  }

  function isAutoTriggerKey(key){
    key=String(key||'').trim();
    return !key||key==='AutoTrigger';
  }

  function triggerLabel(){
    var m=triggerMappingForDisplay();
    var key=m&&m.triggerKey?String(m.triggerKey).trim():'';
    if(!key||key==='AutoTrigger'){
      var KL=global.OneToneKeyLabels;
      if(KL&&KL.autoTriggerDisplay) return KL.autoTriggerDisplay(lang(),m&&m.sourceKey);
      return t('voiceTab2SideKeyFallback','侧键');
    }
    var KL2=global.OneToneKeyLabels;
    if(KL2&&KL2.triggerDisplayLabel) return KL2.triggerDisplayLabel(m,lang());
    if(KL2&&KL2.friendlyKeyName) return KL2.friendlyKeyName(key,lang());
    return key;
  }

  function isVoiceEnabled(){
    var vmApi=global.OneToneVoiceSettingsViewModel;
    if(vmApi&&vmApi.build){
      try{ return !!vmApi.build().voiceOn; }catch(_e){}
    }
    return false;
  }

  function voiceGateNeedsVoskBanner(){
    var banner=$('voiceSetupBanner');
    if(!banner||banner.hidden) return false;
    var cfg=config();
    var strategy=String(cfg&&cfg.voiceListeningStrategy||'').trim();
    return strategy==='auto'||strategy==='resourceSaver';
  }

  function resolveTriggerHoldProfile(){
    var m=triggerMappingForDisplay();
    var key=m&&m.triggerKey?String(m.triggerKey).trim():'';
    if(isAutoTriggerKey(key)) key='Volume_Down';
    var mode=String(m&&m.triggerMode||'tap').toLowerCase();
    var holdMode=mode==='hold'||mode==='longpress'||mode==='perpress';
    var compatApi=global.OneToneHomeWorkbenchCompat;
    var snap=compatApi&&m&&m.id?compatApi.get(m.id):null;
    var pulseOnly=!!(key&&PULSE_TRIGGER_KEYS[key]);
    if(snap&&compatApi&&compatApi.normalizeVerdict){
      var verdict=compatApi.normalizeVerdict(snap.verdict);
      if(verdict==='pulse_only') pulseOnly=true;
      else if(verdict==='hold_capable') pulseOnly=false;
      else if(snap.status==='ready'&&!snap.supportsHold&&(snap.supportsTap||snap.sawKeydown)) pulseOnly=true;
    }
    var holdCapable=!pulseOnly&&!!(
      (snap&&snap.supportsHold)||
      (compatApi&&m&&m.id&&compatApi.canUseHoldMode&&compatApi.canUseHoldMode(m.id,{currentMode:mode}).ok)
    );
    var ctaStyle=(holdCapable&&holdMode)?'hold':'tap';
    return { pulseOnly:pulseOnly, holdCapable:holdCapable, holdMode:holdMode, ctaStyle:ctaStyle, triggerLabel:triggerLabel() };
  }

  function hasAnyAppScenario(){
    var cfg=config();
    if(!cfg||!Array.isArray(cfg.mappings)) return false;
    var hub=global.OneToneHabitHub;
    var diff=global.OneToneHabitOverrideDiff;
    for(var i=0;i<cfg.mappings.length;i++){
      var m=cfg.mappings[i];
      if(hub&&hub.isAppScenario&&hub.isAppScenario(m)) return true;
      if(diff&&diff.isAppScenarioMapping&&diff.isAppScenarioMapping(m)) return true;
    }
    return false;
  }

  function agentPresetId(identity){
    if(!identity) return '';
    return String(identity.matchedPresetAppId||identity.matched_preset_app_id||identity.appId||'').trim();
  }

  function isSelfForegroundIdentity(identity){
    var hub=global.OneToneHabitHub;
    if(hub&&hub.isSelfForegroundIdentity) return hub.isSelfForegroundIdentity(identity);
    if(!identity) return true;
    var exe=String(identity.exeName||identity.exe_name||'').toLowerCase();
    return exe.indexOf('onetone')>=0;
  }

  function agentRouteMeta(presetId){
    return AGENT_ROUTES[String(presetId||'').trim()]||null;
  }

  function resolveAgentActivationTarget(fg){
    var hub=global.OneToneHabitHub;
    if(!hub) return null;
    var preset=agentPresetId(fg);
    if(preset&&AGENT_ROUTES[preset]){
      var hit=hub.findAppScenarioForIdentity?hub.findAppScenarioForIdentity(fg):null;
      if(hit){
        return {
          mapping:hit,
          preset:preset,
          appName:agentRouteMeta(preset)?agentRouteMeta(preset).route:identityAppName(fg),
          fromFallback:false
        };
      }
    }
    if(fg&&!isSelfForegroundIdentity(fg)) return null;
    var i;
    for(i=0;i<AGENT_PREFER.length;i++){
      var appId=AGENT_PREFER[i];
      if(!AGENT_ROUTES[appId]) continue;
      var byId=hub.findAppScenarioByAppId?hub.findAppScenarioByAppId(appId):null;
      if(byId){
        return { mapping:byId, preset:appId, appName:AGENT_ROUTES[appId].route, fromFallback:true };
      }
    }
    var cfg=config();
    var list=cfg&&Array.isArray(cfg.mappings)?cfg.mappings:[];
    for(i=0;i<list.length;i++){
      var m=list[i];
      if(!m||!hub.isAppScenario||!hub.isAppScenario(m)) continue;
      var aid=String(m.appTargetId||'').trim();
      if(aid&&AGENT_ROUTES[aid]){
        return { mapping:m, preset:aid, appName:AGENT_ROUTES[aid].route, fromFallback:true };
      }
    }
    return null;
  }

  function canAgentTry(){
    if(!isVoiceEnabled()) return false;
    return !!resolveAgentActivationTarget(foregroundIdentity());
  }

  function identityAppName(identity){
    if(!identity) return t('voiceTab2UnknownApp','当前窗口');
    if(identity.displayName) return String(identity.displayName).trim();
    var rules=global.OneToneAppBehaviorRules;
    if(rules&&rules.identityDisplayName){
      var n=rules.identityDisplayName(identity);
      if(n) return n;
    }
    var presetId=agentPresetId(identity);
    if(presetId){
      var atp=global.OneToneAppTargetPresets;
      if(atp&&atp.presetById){
        var p=atp.presetById(String(presetId));
        if(p&&p.nameKey) return t(p.nameKey);
      }
    }
    var exe=String(identity.exeName||identity.exe_name||'').trim();
    if(exe){
      var base=exe.replace(/\.exe$/i,'');
      if(base) return base.charAt(0).toUpperCase()+base.slice(1);
    }
    var title=String(identity.windowTitle||identity.window_title||'').trim();
    if(title) return title.length>32?title.slice(0,32)+'…':title;
    return t('voiceTab2UnknownApp','当前窗口');
  }

  function formatFollowLine(opts){
    opts=opts||{};
    var trig=String(opts.triggerLabel||'').trim()||t('voiceTab2SideKeyFallback','侧键');
    var agentTarget=opts.agentTarget||null;
    if(agentTarget&&agentTarget.preset){
      return formatHonestFollowLine(trig,agentTarget);
    }
    var identity=opts.identity||null;
    var presetId=agentPresetId(identity);
    var route=AGENT_ROUTES[presetId];
    if(route){
      return formatHonestFollowLine(trig,{ preset:presetId, appName:route.route });
    }
    var app=identityAppName(identity);
    return String(t('voiceTab2FollowHonestDictation','触发：{trigger} · 系统听写 · {app}'))
      .replace('{trigger}',trig).replace('{app}',app);
  }

  function formatHonestFollowLine(trig,agentTarget){
    var triggerPart=String(t('voiceTab2FollowTrigger','触发：{trigger}')).replace('{trigger}',trig);
    var meta=agentRouteMeta(agentTarget.preset);
    if(!meta) return triggerPart;
    var targetPart=String(t('voiceTab2FollowTarget','目标：{route} · {landing}'))
      .replace('{route}',meta.route).replace('{landing}',meta.landing);
    return triggerPart+' · '+targetPart;
  }

  function foregroundIdentity(){
    var nav=global.OneToneHabitLayerNav;
    if(nav&&nav.getForegroundIdentity) return nav.getForegroundIdentity();
    return null;
  }

  function failureHintText(code,ctx){
    ctx=ctx||{};
    if(code==='noRelease') return t('voiceTab2FailNoRelease','未检测到按键释放，请重新按住');
    if(code==='noFocus'){
      var app=ctx.appName||identityAppName(foregroundIdentity());
      return String(t('voiceTab2FailNoFocus','字未进 {app}，请先点一下输入框再按住')).replace('{app}',app);
    }
    if(code==='badHoldKey'){
      var trig=ctx.triggerLabel||triggerLabel();
      return String(t('voiceTab2FailBadHoldKey','{trigger} 不适合作为按住键，请换一个普通键')).replace('{trigger}',trig);
    }
    if(code==='clipboard') return t('voiceTab2FailClipboard','已记录到剪贴板，可手动粘贴');
    return '';
  }

  function setLastFailureHint(code,ctx){
    lastFailureHint=code?String(code):'';
    renderFailHint(ctx);
  }

  function clearLastFailureHint(){
    lastFailureHint='';
    renderFailHint();
  }

  function renderFailHint(ctx){
    var el=$('voiceTab2FailHint');
    if(!el) return;
    var text=failureHintText(lastFailureHint,ctx);
    if(!text){ el.hidden=true; el.textContent=''; return; }
    el.hidden=false;
    el.textContent=text;
  }

  function renderVoiceGate(){
    var el=$('voiceTab2VoiceGate');
    var localBtn=$('voiceTab2TryLocal');
    var agentBtn=$('voiceTab2TryAgent');
    var on=isVoiceEnabled();
    if(el){
      el.hidden=on;
      el.textContent=voiceGateNeedsVoskBanner()
        ?t('voiceTab2VoiceGateVosk','自动模式需本地模型：先完成上方下载，再点底部「启用」')
        :t('voiceTab2VoiceGate','请先点底部「启用」，再试 Agent 听写');
    }
    if(localBtn) localBtn.disabled=!on;
    if(agentBtn) agentBtn.disabled=!on||!canAgentTry();
  }

  function renderHoldNote(profile){
    var el=$('voiceTab2HoldNote');
    if(!el) return;
    if(profile&&profile.pulseOnly){
      el.hidden=false;
      el.textContent=t('voiceTab2HoldUnsupported','此键不支持按住说话，请换鼠标侧键或在按键页改触发键');
    }else{
      el.hidden=true;
      el.textContent='';
    }
  }

  function renderScenarioNote(){
    var el=$('voiceTab2ScenarioNote');
    if(!el) return;
    if(hasAnyAppScenario()||resolveAgentActivationTarget(foregroundIdentity())){
      el.hidden=true;
      el.textContent='';
      return;
    }
    el.hidden=false;
    el.textContent=t('voiceTab2NoScenario','未配置 Cursor 场景 · 展开高级添加');
  }

  function renderAgentHint(agentTarget){
    var el=$('voiceTab2AgentHint');
    if(!el) return;
    if(!agentTarget){
      el.hidden=true;
      el.textContent='';
      return;
    }
    var meta=agentRouteMeta(agentTarget.preset);
    if(!meta){ el.hidden=true; el.textContent=''; return; }
    el.hidden=false;
    el.textContent=String(t('voiceTab2AgentHintReady','「在 {route} 试说」将切换至 {route} · {landing}'))
      .replace(/\{route\}/g,meta.route).replace('{landing}',meta.landing);
  }

  function renderAdvancedSummary(){
    var summary=$('voiceTab2AdvancedSummary');
    if(!summary) return;
    var badge=$('voiceTab2AdvancedBadge');
    var label=t('voiceTab2AdvancedSummary','高级 · 能跟哪些 Agent');
    var nodes=[];
    var i;
    for(i=0;i<summary.childNodes.length;i++){
      if(summary.childNodes[i]!==badge) nodes.push(summary.childNodes[i]);
    }
    for(i=0;i<nodes.length;i++) summary.removeChild(nodes[i]);
    summary.insertBefore(document.createTextNode(label),badge||null);
    if(badge&&!summary.contains(badge)) summary.appendChild(badge);
  }

  function renderAdvancedDiscoverability(){
    var details=$('voiceTab2Advanced');
    var badge=$('voiceTab2AdvancedBadge');
    var has=hasAnyAppScenario();
    if(badge){
      if(!has){ badge.hidden=false; badge.textContent=t('voiceTab2AdvancedBadge','未配置'); }
      else{ badge.hidden=true; badge.textContent=''; }
    }
    if(details&&!has){
      try{
        var ss=global.sessionStorage;
        if(!ss||!ss.getItem(ADVANCED_OPEN_KEY)){
          details.open=true;
          if(ss) ss.setItem(ADVANCED_OPEN_KEY,'1');
        }
      }catch(_e){}
    }
  }

  function openAdvancedDetails(){
    var details=$('voiceTab2Advanced');
    if(!details) return;
    details.open=true;
    if(typeof details.scrollIntoView==='function'){
      details.scrollIntoView({block:'nearest',behavior:'smooth'});
    }
  }

  function scrollToVoiceEnable(){
    var ready=$('voiceWakeHeroReady');
    if(ready&&typeof ready.scrollIntoView==='function'){
      ready.scrollIntoView({block:'nearest',behavior:'smooth'});
    }
  }

  function renderHero(){
    var followLbl=$('voiceTab2FollowLbl');
    var followText=$('voiceTab2FollowText');
    var localBtn=$('voiceTab2TryLocal');
    var agentBtn=$('voiceTab2TryAgent');
    if(followLbl) followLbl.textContent=t('voiceTab2FollowLbl','联动');
    renderAdvancedSummary();
    var trig=triggerLabel();
    var fg=foregroundIdentity();
    var agentTarget=resolveAgentActivationTarget(fg);
    if(followText){
      followText.textContent=formatFollowLine({ triggerLabel:trig, agentTarget:agentTarget, identity:fg });
    }
    var profile=resolveTriggerHoldProfile();
    if(localBtn){
      var localTpl=profile.ctaStyle==='hold'
        ?t('voiceTab2TryLocalHold','按住 {trigger} 本地试说')
        :t('voiceTab2TryLocalTap','用 {trigger} 本地试说');
      localBtn.textContent=String(localTpl).replace('{trigger}',trig);
    }
    if(agentBtn){
      var agentTpl=t('voiceTab2TryAgent','在 {route} 试说');
      var routeName=agentTarget&&agentTarget.appName
        ?agentTarget.appName
        :(agentTarget&&agentTarget.preset&&agentRouteMeta(agentTarget.preset)
          ?agentRouteMeta(agentTarget.preset).route
          :'Cursor');
      agentBtn.textContent=String(agentTpl).replace('{route}',routeName);
    }
    renderVoiceGate();
    renderHoldNote(profile);
    renderAgentHint(agentTarget);
    renderScenarioNote();
    renderAdvancedDiscoverability();
    renderFailHint({triggerLabel:trig});
  }

  function flashCoachSuccess(appName){
    appName=String(appName||'').trim()||identityAppName(foregroundIdentity());
    var msg=String(t('voiceTab2SuccessHud','已在 {app} 听写')).replace('{app}',appName);
    if(global.OneToneIpc&&global.OneToneIpc.invoke){
      global.OneToneIpc.invoke('cmd_runtime_status_protocol',{
        statusToken:'triggered',
        lastEventText:msg
      }).catch(function(){});
      global.OneToneIpc.invoke('cmd_coach_hud_flash_success',{}).catch(function(){});
    }
  }

  function onTryLocalClick(){
    clearLastFailureHint();
    if(!isVoiceEnabled()){
      toast(t('voiceTab2VoiceGateToast','请先启用语音（点底部「启用」）'),'lite');
      scrollToVoiceEnable();
      return;
    }
    var setup=global.OneToneHabitTriggerSetup;
    if(setup&&setup.openStandaloneQsVoicePractice){
      setup.openStandaloneQsVoicePractice({
        onSuccess:function(){
          flashCoachSuccess(identityAppName(foregroundIdentity()));
        }
      });
      return;
    }
    setLastFailureHint('noFocus',{appName:identityAppName(foregroundIdentity())});
  }

  function onTryAgentClick(){
    clearLastFailureHint();
    if(!isVoiceEnabled()){
      toast(t('voiceTab2VoiceGateToast','请先启用语音（点底部「启用」）'),'lite');
      scrollToVoiceEnable();
      return;
    }
    if(!canAgentTry()){
      toast(t('voiceTab2AgentNeedsTrigger','请先在高级配置 Agent 场景（如 Cursor）'),'lite');
      openAdvancedDetails();
      return;
    }
    var fg=foregroundIdentity();
    var target=resolveAgentActivationTarget(fg);
    if(!target||!target.mapping||!target.mapping.id) return;
    var send=global.OneToneMappingTestSend;
    if(!send||!send.fire) return;
    var appName=target.appName||identityAppName(fg);
    send.fire(target.mapping.id,{
      context:'habit-agent-workflow-test',
      silent:true,
      onResult:function(msg){
        if(msg&&msg.ok){
          clearLastFailureHint();
          flashCoachSuccess(appName);
        }else{
          var reason=msg&&msg.reason||'';
          if(reason==='clipboard') setLastFailureHint('clipboard');
          else if(/hold|pulse|invalid_key/i.test(reason)){
            setLastFailureHint('badHoldKey',{triggerLabel:triggerLabel()});
          }else setLastFailureHint('noFocus',{appName:appName});
        }
      }
    });
  }

  function syncFailureFromStatus(snap){
    if(!snap||String(snap.statusToken||'')!=='error') return;
    var repair=String(snap.repairText||snap.lastEventText||'');
    if(!repair) return;
    if(/释放|release/i.test(repair)) setLastFailureHint('noRelease');
    else if(/剪贴板|clipboard|paste/i.test(repair)) setLastFailureHint('clipboard');
    else if(/按住|hold|不适合/i.test(repair)) setLastFailureHint('badHoldKey',{triggerLabel:triggerLabel()});
    else setLastFailureHint('noFocus',{appName:identityAppName(foregroundIdentity())});
  }

  function bindOnce(){
    if(bound) return;
    bound=true;
    if(typeof global.addEventListener==='function'){
      global.addEventListener('ot:runtime-status',function(e){
        syncFailureFromStatus(e&&e.detail);
        renderVoiceGate();
      });
    }
    var localBtn=$('voiceTab2TryLocal');
    if(localBtn) localBtn.addEventListener('click',function(e){
      e.preventDefault();
      onTryLocalClick();
    });
    var agentBtn=$('voiceTab2TryAgent');
    if(agentBtn) agentBtn.addEventListener('click',function(e){
      e.preventDefault();
      onTryAgentClick();
    });
    var scenarioNote=$('voiceTab2ScenarioNote');
    if(scenarioNote) scenarioNote.addEventListener('click',openAdvancedDetails);
    var gate=$('voiceTab2VoiceGate');
    if(gate) gate.addEventListener('click',function(){
      scrollToVoiceEnable();
      var ready=$('voiceWakeHeroReady');
      if(ready&&ready.click) ready.click();
    });
  }

  global.OneToneVoiceTab2Mvp={
    formatFollowLine:formatFollowLine,
    formatHonestFollowLine:formatHonestFollowLine,
    identityAppName:identityAppName,
    failureHintText:failureHintText,
    setLastFailureHint:setLastFailureHint,
    clearLastFailureHint:clearLastFailureHint,
    getLastFailureHint:function(){ return lastFailureHint; },
    renderHero:renderHero,
    flashCoachSuccess:flashCoachSuccess,
    bindOnce:bindOnce,
    triggerLabel:triggerLabel,
    resolveTriggerHoldProfile:resolveTriggerHoldProfile,
    isVoiceEnabled:isVoiceEnabled,
    hasAnyAppScenario:hasAnyAppScenario,
    agentPresetId:agentPresetId,
    resolveAgentActivationTarget:resolveAgentActivationTarget,
    canAgentTry:canAgentTry,
    baselineMapping:baselineMapping,
    effectiveTrigger:effectiveTrigger,
    isAutoTriggerKey:isAutoTriggerKey
  };
})((typeof window!=='undefined')?window:globalThis);
