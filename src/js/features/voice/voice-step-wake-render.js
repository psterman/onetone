(function(global){
  'use strict';
  var $=function(id){ return global.OneToneDom.$(id); };
  var t=function(key){ return global.OneToneI18n.t(key); };

  function V(){ return global.OneToneVoiceSettingsViewModel; }

  function resolveWakePresetMode(vm){
    vm=vm||{};
    var wake=global.OneToneVoiceWake;
    if(wake&&wake.getExpandedMode){
      var expanded=wake.getExpandedMode();
      if(expanded==='vosk'||expanded==='sapi') return expanded;
    }
    var flowHooks=global.__vp_voice_settings_flow_hooks__||{};
    if(flowHooks.currentVoiceMode){
      var live=flowHooks.currentVoiceMode();
      if(live==='vosk'||live==='sapi') return live;
    }
    if(vm.mode==='vosk'||vm.mode==='sapi') return vm.mode;
    return (global.OneToneVoiceEngineReadiness&&global.OneToneVoiceEngineReadiness.isVoskOnlyUi())?'vosk':'sapi';
  }

  function resolveWakePresetLang(opts){
    opts=opts||{};
    if(opts.lang==='en'||opts.lang==='zh') return opts.lang;
    return global.__vp_voice_wake_lang__||'zh';
  }

  function syncWakePresetLangVisibility(opts){
    opts=opts||{};
    var lang=resolveWakePresetLang(opts);
    global.__vp_voice_wake_lang__=lang;
    var host=$('voiceSettingsWakeHost');
    var cn=$('voiceVoskPresetsCn');
    var en=$('voiceVoskPresetsEn');
    var cnLabel=$('voiceVoskPresetsCnLabel');
    var enLabel=$('voiceVoskPresetsEnLabel');
    var showEn=lang==='en';
    if(host) host.setAttribute('data-wake-lang',showEn?'en':'zh');
    if(cn){
      cn.hidden=showEn;
      cn.setAttribute('aria-hidden',showEn?'true':'false');
    }
    if(en){
      en.hidden=!showEn;
      en.setAttribute('aria-hidden',!showEn?'true':'false');
    }
    if(cnLabel) cnLabel.hidden=true;
    if(enLabel) enLabel.hidden=true;
    var langToggle=$('voiceWakeLangToggle');
    if(langToggle&&!langToggle.hidden){
      langToggle.querySelectorAll('.flow-lang-btn').forEach(function(b){
        b.classList.toggle('is-on',(b.getAttribute('data-lang')||'')===(showEn?'en':'zh'));
      });
    }
    if(global.OneToneVoiceWake&&global.OneToneVoiceWake.renderWakePhraseTags){
      global.OneToneVoiceWake.renderWakePhraseTags();
    }
  }

  function renderWakeHost(vm){
    vm=vm||{};
    const sapiPresets=$('voiceSapiPresets');
    const voskWrap=$('voiceSettingsVoskWakeWrap');
    const host=$('voiceSettingsWakeHost');
    if(isScenarioVoiceEdit()){
      if(host){
        host.hidden=true;
        host.setAttribute('aria-hidden','true');
      }
      if(sapiPresets) sapiPresets.hidden=true;
      if(voskWrap) voskWrap.hidden=true;
      return;
    }
    var hideLite=global.OneToneVoiceEngineReadiness&&global.OneToneVoiceEngineReadiness.isVoskOnlyUi();
    var mode=resolveWakePresetMode(vm);
    var showSapi=!hideLite&&mode==='sapi'&&!vm.loading;
    var showVosk=mode==='vosk'&&!vm.loading;
    if(host) host.setAttribute('data-wake-mode',showVosk?'vosk':(showSapi?'sapi':'off'));
    if(sapiPresets) sapiPresets.hidden=!showSapi;
    if(voskWrap) voskWrap.hidden=!showVosk;
    if(host){
      /* Catalog stays in DOM for phrase lookups; chips UI is the only visible manager. */
      host.hidden=true;
      host.setAttribute('aria-hidden','true');
    }
    if(showVosk) syncWakePresetLangVisibility({lang:global.__vp_voice_wake_lang__});
    if(global.OneToneVoiceWake&&global.OneToneVoiceWake.renderWakePhraseTags){
      global.OneToneVoiceWake.renderWakePhraseTags();
    }
  }

  function renderMicLine(vm){
    var micName=vm.wakeSourceLabel||t('homeVoiceMapMicEmpty');
    var micOk=!vm.loading&&!!vm.wakeSourceLabel&&vm.wakeSourceLabel!==t('homeVoiceMapMicEmpty');
    var stateText=vm.loading?t('homeLiveLoading'):(micOk?t('voiceMicStatusOk'):t('voiceTestChipMicWarn'));
    var legacyName=$('voiceSettingsMicName');
    if(legacyName) legacyName.textContent=micName;
    var liveName=$('voiceLiveMicName');
    var liveState=$('voiceLiveMicState');
    var liveDot=$('voiceLiveMicDot');
    if(liveName) liveName.textContent=micName;
    if(liveState) liveState.textContent=stateText;
    if(liveDot) liveDot.classList.toggle('is-warn',!vm.loading&&!micOk);
    const liveChangeBtn=$('btnVoiceLiveMicChange');
    if(liveChangeBtn) liveChangeBtn.textContent=t('voiceMicChangeBtn');
  }

  function scenarioVoiceMapping(){
    // Q41 / voice-ui-3hero: voice settings always uses phrase-hero + landing.
    // Habit acoustic recorder must not replace this page (even with habitScenarioReturnId).
    return null;
  }

  function isScenarioVoiceEdit(){
    return false;
  }

  function syncScenarioVoiceEditor(){
    var stack=$('voiceSettingsWakeBody');
    var body=$('habitScenarioVoiceBody');
    var hero=$('voiceWakeHeroCard');
    var presets=$('voiceWakePresetsPanel');
    var poolAdd=$('btnVoiceWakePoolAdd');
    var wakeHost=$('voiceSettingsWakeHost');
    if(stack) stack.classList.remove('is-scenario-voice-edit');
    if(body){
      body.hidden=true;
      body.setAttribute('aria-hidden','true');
      body.innerHTML='';
    }
    if(hero) hero.hidden=false;
    if(presets) presets.hidden=false;
    if(poolAdd) poolAdd.hidden=false;
    if(wakeHost){
      wakeHost.hidden=true;
      wakeHost.setAttribute('aria-hidden','true');
    }
    var collapse=$('voiceWakePresetCollapse');
    if(collapse){ collapse.hidden=true; collapse.setAttribute('aria-hidden','true'); }
    var optInRow=$('voiceWakeListeningOptInRow');
    if(optInRow) optInRow.hidden=false;
    var actionBar=$('voiceWakeActionBar');
    if(actionBar) actionBar.hidden=false;
    var landing=$('voiceLandingStrip');
    if(landing) landing.hidden=false;
    var adv=$('voiceWakeAdvanced');
    if(adv) adv.hidden=false;
    // Ensure proto card titles stay visible (section inside presets panel).
    var unified=$('voiceWakeCurrentSectionLbl');
    if(unified) unified.hidden=false;
    var pageSubVis=$('voiceWakePageSubVisible');
    if(pageSubVis) pageSubVis.hidden=false;
  }

  function renderCompactWake(vm){
    const zhEl=$('voiceWakeCompactZh');
    const enEl=$('voiceWakeCompactEn');
    if(vm.loading){
      if(zhEl) zhEl.textContent=t('homeLiveLoading');
      if(enEl) enEl.textContent='';
      renderMicLine(vm);
      renderWakeHost(vm);
      syncScenarioVoiceEditor();
      return;
    }
    var phrase=V().resolveDisplayWakePhrase(vm);
    var presetLang=phrase.lang||global.__vp_voice_wake_lang__||'zh';
    var showEn=presetLang==='en';
    var display=phrase.display||phrase.zh||phrase.en||'—';
    if(zhEl){
      var zhText=showEn?(phrase.en||display):(phrase.zh||display);
      zhEl.textContent='「'+zhText+'」';
      zhEl.hidden=showEn;
    }
    if(enEl){
      enEl.textContent='「'+(phrase.en||display)+'」';
      enEl.hidden=!showEn;
    }
    const langToggle=$('voiceWakeLangToggle');
    if(langToggle) langToggle.hidden=true;
    syncWakePresetLangVisibility({lang:presetLang});
    renderMicLine(vm);
    renderWakeHost(vm);
    syncScenarioVoiceEditor();
  }

  function renderCustomPhrases(vm){
    if(isScenarioVoiceEdit()){
      syncScenarioVoiceEditor();
      return;
    }
    if(global.OneToneVoiceWake&&global.OneToneVoiceWake.renderWakeCustomPhrases){
      global.OneToneVoiceWake.renderWakeCustomPhrases();
    }
    var poolAdd=$('btnVoiceWakePoolAdd');
    if(poolAdd) poolAdd.hidden=vm.loading||vm.mode==='off';
  }

  var openAppExpandedId=''; // appId currently showing inline acoustic host
  var openAppCapabilityCache={};

  function openAppHostId(appId,mappingId){
    var key=String(mappingId||appId||'').trim();
    return 'openAppAcousticHost_'+key.replace(/[^a-zA-Z0-9_-]/g,'_');
  }

  function capabilityLabel(cap){
    if(cap==='launchable') return t('voiceOpenAppCapLaunchable');
    if(cap==='focus_only') return t('voiceOpenAppCapFocusOnly');
    if(cap==='missing') return t('voiceOpenAppCapMissing');
    return '';
  }

  function ensureOpenAppCapability(appId){
    appId=String(appId||'').trim();
    if(!appId||openAppCapabilityCache[appId]) return;
    openAppCapabilityCache[appId]={ capability:'', loading:true };
    var api=global.OneToneVoiceAcousticIpc;
    if(!api||!api.appLaunchCapability){
      openAppCapabilityCache[appId]={ capability:'missing', loading:false };
      return;
    }
    api.appLaunchCapability(appId).then(function(res){
      openAppCapabilityCache[appId]={
        capability:String((res&&res.capability)||'missing'),
        loading:false
      };
      if(typeof renderOutputSummon==='function') renderOutputSummon();
    }).catch(function(){
      openAppCapabilityCache[appId]={ capability:'missing', loading:false };
    });
  }

  function acousticCountForMapping(m){
    if(!m) return 0;
    var list=Array.isArray(m.acousticVoiceCommands)?m.acousticVoiceCommands
      :(Array.isArray(m.acoustic_voice_commands)?m.acoustic_voice_commands:[]);
    var n=0;
    for(var i=0;i<list.length;i++){ if(list[i]) n++; }
    return n;
  }

  function acousticPaused(m){
    if(!m||!Array.isArray(m.acousticVoiceCommands)) return false;
    for(var i=0;i<m.acousticVoiceCommands.length;i++){
      var c=m.acousticVoiceCommands[i];
      if(c&&c.enabled===false) return true;
    }
    return false;
  }

  function summonPhraseForApp(mapping,appId){
    appId=String(appId||'').trim();
    if(!mapping||!appId) return '';
    var rules=Array.isArray(mapping.appBehaviorRules)?mapping.appBehaviorRules:[];
    for(var i=0;i<rules.length;i++){
      var r=rules[i];
      if(!r) continue;
      if(String(r.appId||r.ruleId||'')===appId){
        return String(r.summonPhrase||'').trim();
      }
    }
    return '';
  }

  function acousticDisplayNote(m){
    if(!m||!Array.isArray(m.acousticVoiceCommands)) return '';
    for(var i=0;i<m.acousticVoiceCommands.length;i++){
      var c=m.acousticVoiceCommands[i];
      if(!c) continue;
      var note=String(c.displayText||'').trim();
      if(note) return note;
    }
    return '';
  }

  /** Roster of claimed app scenarios only — catalog presets belong in the add picker. */
  function resolveOpenAppRows(){
    var rows=[];
    var seen={};
    var ab=global.OneToneAppBehaviorRules;
    var atp=global.OneToneAppTargetPresets;
    var diff=global.OneToneHabitOverrideDiff;
    var cfg=(global.OneToneState&&global.OneToneState.state&&global.OneToneState.state.config)||{};
    var list=Array.isArray(cfg.mappings)?cfg.mappings:[];

    list.forEach(function(m){
      if(!m||m.enabled===false) return;
      if(diff&&diff.isAppScenarioMapping&&!diff.isAppScenarioMapping(m)) return;
      if(ab&&ab.isIncompleteCustomStub&&ab.isIncompleteCustomStub(m)) return;
      var appId=String(m.appTargetId||'').trim();
      if(!appId) return;
      var rowKey=m.id||appId;
      if(seen[rowKey]) return;
      seen[rowKey]=true;
      var name=ab&&ab.appDisplayName?ab.appDisplayName(appId):appId;
      var icon='';
      if(atp&&atp.presetById&&appId!=='custom'){
        var p=atp.presetById(appId);
        icon=p&&p.icon?p.icon:'';
        if(p&&p.nameKey) name=t(p.nameKey)||name;
      }
      if((!name||name===appId||name==='custom')&&m.group) name=String(m.group).trim()||name;
      if(appId!=='custom') ensureOpenAppCapability(appId);
      var cap=appId==='custom'
        ?'focus_only'
        :((openAppCapabilityCache[appId]&&openAppCapabilityCache[appId].capability)||'');
      rows.push({
        appId:appId,
        mappingId:m.id,
        name:name,
        icon:icon,
        initial:(name||appId).charAt(0),
        textPhrase:summonPhraseForApp(m,appId),
        acousticCount:acousticCountForMapping(m),
        acousticPaused:acousticPaused(m),
        acousticNote:acousticDisplayNote(m),
        capability:cap
      });
    });
    return rows;
  }

  function capPill(cap){
    if(cap==='launchable') return {cls:'is-ok',text:t('voiceOpenAppCapLaunchablePill')};
    if(cap==='focus_only') return {cls:'is-warn',text:t('voiceOpenAppCapFocusOnlyPill')};
    if(cap==='missing') return {cls:'is-bad',text:t('voiceOpenAppCapMissingPill')};
    return null;
  }

  function renderOutputSummon(vm){
    const block=$('voiceOutputSummonBlock');
    const chipsEl=$('voiceOutputSummonChips');
    const hintEl=$('voiceOutputSummonHint');
    const emptyEl=$('voiceOutputSummonEmpty');
    const manageBtn=$('btnVoiceOutputSummonManage');
    const addBtn=$('btnVoiceOpenAppAdd');
    if(isScenarioVoiceEdit()){
      if(block) block.hidden=true;
      return;
    }
    if(!block||!chipsEl) return;
    block.hidden=!!vm.loading;
    var rows=resolveOpenAppRows();
    if(hintEl){
      hintEl.hidden=false;
      hintEl.textContent=t('voiceOpenAppSayHint');
    }
    var titleEl=$('voiceOutputSummonLbl');
    if(titleEl) titleEl.textContent=t('voiceOutputSummonLbl');
    if(addBtn){
      addBtn.textContent=t('voiceOpenAppAdd');
      addBtn.hidden=false;
    }
    if(manageBtn){
      manageBtn.textContent=t('voiceOutputSummonManage');
      manageBtn.hidden=false;
    }
    if(!rows.length){
      if(emptyEl){
        emptyEl.hidden=false;
        emptyEl.textContent=t('voiceOutputSummonEmptyNoApp');
      }
      var calibratingEmpty=global.OneToneHabitScenarioVoiceCommand
        &&(global.OneToneHabitScenarioVoiceCommand.isBusy
          ?global.OneToneHabitScenarioVoiceCommand.isBusy()
          :(global.OneToneHabitScenarioVoiceCommand.isCalibrating
            &&global.OneToneHabitScenarioVoiceCommand.isCalibrating()));
      if(!(calibratingEmpty&&chipsEl.querySelector('[data-open-app-acoustic-host]:not([hidden])'))){
        chipsEl.innerHTML='';
        chipsEl.hidden=true;
      }
      return;
    }
    if(emptyEl){
      emptyEl.hidden=true;
      emptyEl.textContent='';
    }
    chipsEl.hidden=false;
    var calibrating=global.OneToneHabitScenarioVoiceCommand
      &&(global.OneToneHabitScenarioVoiceCommand.isBusy
        ?global.OneToneHabitScenarioVoiceCommand.isBusy()
        :(global.OneToneHabitScenarioVoiceCommand.isCalibrating
          &&global.OneToneHabitScenarioVoiceCommand.isCalibrating()));
    // Keep expanded inline acoustic host intact while session busy (levels/UI live there).
    if(calibrating&&chipsEl.querySelector('[data-open-app-acoustic-host]:not([hidden])')){
      return;
    }
    chipsEl.innerHTML=rows.map(function(row){
      var iconHtml=row.icon
        ?'<img class="voice-wake-app-icon" src="'+V().escHtml(row.icon)+'" alt="" decoding="async" />'
        :'<span class="voice-wake-app-icon voice-wake-app-icon--fallback" aria-hidden="true">'+V().escHtml(row.initial)+'</span>';
      var acousticLine;
      if(row.acousticPaused) acousticLine=t('voiceOpenAppAcousticPaused');
      else if(row.acousticCount>0) acousticLine=String(t('voiceOpenAppAcousticReady')||'').replace('{n}',String(row.acousticCount));
      else acousticLine=t('voiceOpenAppAcousticNone');
      var phraseChip=row.textPhrase
        ?'<span class="voice-open-app-phrase-chip">'+V().escHtml(t('voiceOpenAppTextPhraseLbl'))+' '+V().escHtml(row.textPhrase)+'</span>'
        :'';
      var noteLine=row.acousticNote
        ?('<p class="voice-open-app-status-line voice-open-app-text-muted">'+V().escHtml(t('voiceOpenAppNoteLbl'))+'：'+V().escHtml(row.acousticNote)+'</p>')
        :'';
      var pill=capPill(row.capability);
      var capHtml=pill
        ?'<span class="voice-open-app-cap-pill '+pill.cls+'">'+V().escHtml(pill.text)+'</span>'
        :'';
      var expanded=openAppExpandedId===String(row.mappingId||row.appId||'');
      var hostId=openAppHostId(row.appId,row.mappingId);
      var testing=global.OneToneVoiceOpenAppUi
        &&global.OneToneVoiceOpenAppUi.isTesting
        &&global.OneToneVoiceOpenAppUi.isTesting();
      var actions='';
      if(row.acousticCount>0){
        actions+='<button type="button" class="voice-open-app-btn" data-open-app-acoustic-act="rerecord" data-app-id="'+V().escHtml(row.appId)+'" data-mapping-id="'+V().escHtml(row.mappingId||'')+'">'+V().escHtml(t('voiceOpenAppRerecord'))+'</button>';
        actions+='<button type="button" class="voice-open-app-btn is-ghost" data-open-app-acoustic-act="play" data-app-id="'+V().escHtml(row.appId)+'" data-mapping-id="'+V().escHtml(row.mappingId||'')+'"'+(testing?' disabled aria-disabled="true"':'')+'>'+V().escHtml(t('voiceOpenAppReplay'))+'</button>';
        actions+='<button type="button" class="voice-open-app-btn is-primary" data-open-app-acoustic-act="test" data-app-id="'+V().escHtml(row.appId)+'" data-mapping-id="'+V().escHtml(row.mappingId||'')+'"'+(testing?' disabled aria-disabled="true"':'')+'>'+V().escHtml(t('voiceOpenAppTest'))+'</button>';
      }else{
        actions+='<button type="button" class="voice-open-app-btn is-primary" data-open-app-acoustic-act="record" data-app-id="'+V().escHtml(row.appId)+'" data-mapping-id="'+V().escHtml(row.mappingId||'')+'">'+V().escHtml(t('voiceOpenAppRecord'))+'</button>';
      }
      return '<div class="voice-wake-app-row voice-open-app-card" data-app-id="'+V().escHtml(row.appId)+'" data-mapping-id="'+V().escHtml(row.mappingId||'')+'">'
        +'<div class="voice-open-app-card-head">'
        +'<div class="voice-wake-app-badge">'+iconHtml+'<span class="voice-wake-app-name">'+V().escHtml(row.name)+'</span></div>'
        +capHtml
        +'</div>'
        +'<p class="voice-open-app-acoustic-line">'+V().escHtml(acousticLine)+'</p>'
        +phraseChip
        +noteLine
        +'<div class="voice-open-app-card-actions">'+actions+'</div>'
        +'<div class="voice-open-app-acoustic-host habit-scenario-voice-command-host" id="'+V().escHtml(hostId)+'" data-open-app-acoustic-host="1"'+(expanded?'':' hidden')+'></div>'
        +'</div>';
    }).join('');
  }

  function setOpenAppExpanded(appId){
    openAppExpandedId=String(appId||'').trim();
  }

  function getOpenAppExpanded(){
    return openAppExpandedId;
  }

  function escHtml(s){
    return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');
  }

  function currentEditMapping(){
    var hdr=global.OneToneVoicePageHeaderRender;
    if(hdr&&hdr.resolveScopeMapping) return hdr.resolveScopeMapping(null);
    var core=global.OneToneMappingCore;
    var st=global.OneToneState&&global.OneToneState.state?global.OneToneState.state:{};
    var id=String(st.selectedMappingId||(st.config&&st.config.activeSceneId)||'').trim();
    return id&&core&&core.byId?core.byId(id):null;
  }

  function mappingDisplayName(m){
    if(!m) return '';
    return String(m.appName||m.name||m.label||m.appTargetId||'').trim();
  }

  function renderWakeActionBar(){
    var bar=$('voiceWakeActionBar');
    if(!bar||bar.hidden) return;
    var lbl=$('voiceWakeActionLbl');
    if(lbl) lbl.textContent=t('voiceWakeActionLbl')||'唤醒后';
    var dictate=$('voiceWakeActionDictate');
    if(dictate) dictate.textContent=t('voiceWakeActionDictate')||'进入听写';
    /* FORBID: never paint send_mode copy on the wake action bar */
  }

  function renderLandingStrip(){
    var strip=$('voiceLandingStrip');
    if(!strip||strip.hidden) return;
    var m=currentEditMapping();
    var appId=m?String(m.appTargetId||'').trim():'';
    var isGlobal=!appId;
    var line=$('voiceLandingLine');
    var cta=$('btnVoiceLandingKeysTarget');
    var bringRow=$('voiceWakeBringUpRow');
    var name=mappingDisplayName(m)||appId;
    if(isGlobal){
      if(line) line.innerHTML=t('voiceLandingGlobalLine')||'字会打进<strong>你正在点的地方</strong>（跟光标走）。';
      if(cta) cta.textContent=t('voiceLandingGlobalCta')||'要限定到某个应用更稳？去按键设一下 →';
      if(bringRow) bringRow.hidden=true;
      strip.classList.add('is-global');
      strip.classList.remove('is-app');
    }else{
      if(line) line.innerHTML=String(t('voiceLandingAppLine')||'字会打进 <strong>{name}</strong>。').replace('{name}',name||'—');
      if(cta) cta.textContent=t('voiceLandingAppCta')||'不对就去按键改目标 →';
      if(bringRow){
        bringRow.hidden=false;
        var bringLbl=$('voiceSchemeBringUpLbl');
        if(bringLbl) bringLbl.textContent=String(t('voiceSchemeBringUpLbl')||'错前台时自动打开 {name}').replace('{name}',name||'目标');
        var tog=$('voiceAllowBringUpTargetToggle');
        if(tog){
          var on=!!(m&&m.voiceAllowBringUpTarget);
          tog.setAttribute('aria-checked',on?'true':'false');
          tog.classList.toggle('is-on',on);
        }
      }
      strip.classList.add('is-app');
      strip.classList.remove('is-global');
    }
    var advSum=$('voiceWakeAdvancedSummary');
    if(advSum) advSum.textContent=t('voiceWakeAdvancedSummary')||'高级';
  }

  function renderWrongFgStatus(){
    var row=$('voiceWrongFgStatus');
    if(!row) return;
    var face=global.__vp_voice_face__||'dictate';
    if(face!=='dictate'){
      row.hidden=true;
      return;
    }
    var m=currentEditMapping();
    var appId=m?String(m.appTargetId||'').trim():'';
    if(!appId||(m&&m.voiceAllowBringUpTarget)){
      row.hidden=true;
      return;
    }
    var fgId='';
    var fgName='';
    try{
      var nav=global.OneToneHabitLayerNav;
      if(nav&&nav.getForegroundIdentity){
        var fg=nav.getForegroundIdentity();
        if(fg){
          fgId=String(fg.appTargetId||fg.id||fg.targetId||'').trim();
          fgName=String(fg.appName||fg.name||fgId||'').trim();
        }
      }
      if(!fgId&&nav&&nav.getForegroundAppId) fgId=String(nav.getForegroundAppId()||'').trim();
      if(!fgId&&nav&&nav.getForegroundContextRef&&m){
        fgId=String(nav.getForegroundContextRef(m)||'').trim();
      }
    }catch(_e){}
    if(fgId&&fgId===appId){
      row.hidden=true;
      return;
    }
    var targetName=mappingDisplayName(m)||appId;
    var text=$('voiceWrongFgText');
    if(text){
      text.textContent=String(t('voiceWrongFgStatus')||'现在在 {fg} · 习惯绑的是 {target} · 先切过去再说')
        .replace('{fg}',fgName||fgId||(t('voiceWrongFgUnknown')||'未知'))
        .replace('{target}',targetName);
    }
    row.hidden=false;
  }

  var VOICE_FACES=['dictate','softpad','keys','camera'];

  function setVoiceFace(face){
    face=String(face||'dictate').trim();
    if(VOICE_FACES.indexOf(face)<0) face='dictate';
    global.__vp_voice_face__=face;
    global.__vp_voice_wake_kind__='text';
    var pipeline=$('voiceWorkflowPipeline');
    if(pipeline) pipeline.setAttribute('data-voice-face',face);
    var faceBtnIds={dictate:'btnVoiceFaceDictate',softpad:'btnVoiceFaceSoftPad',keys:'btnVoiceFaceKeys',camera:'btnVoiceFaceCamera'};
    VOICE_FACES.forEach(function(f){
      var btn=$(faceBtnIds[f]);
      if(!btn) return;
      var on=f===face;
      btn.classList.toggle('is-on',on);
      btn.setAttribute('aria-selected',on?'true':'false');
    });
    var isDictate=face==='dictate';
    var flow=$('voiceFlowNodes');
    var desk=$('voiceDeskPanel');
    if(flow){
      flow.hidden=!isDictate;
      flow.setAttribute('aria-hidden',isDictate?'false':'true');
    }
    if(desk){
      desk.hidden=!isDictate;
      desk.setAttribute('aria-hidden',isDictate?'false':'true');
    }
    ['voiceSoftPadFace','voiceKeysFace','voiceCameraFace'].forEach(function(id){
      var el=$(id);
      if(!el) return;
      var pane=el.getAttribute('data-voice-face-pane');
      var show=pane===face;
      el.hidden=!show;
      el.setAttribute('aria-hidden',show?'false':'true');
    });
    if(global.OneToneVoiceStepSend&&global.OneToneVoiceStepSend.syncPhraseKindTabs){
      global.OneToneVoiceStepSend.syncPhraseKindTabs('voiceWakeKindTabs','text');
    }
    renderWrongFgStatus();
    if(face==='softpad'&&global.OneToneVoiceBridgeSoftPad&&global.OneToneVoiceBridgeSoftPad.render){
      global.OneToneVoiceBridgeSoftPad.render();
    }
    if(face==='keys'&&global.OneToneVoiceBridgeKeys&&global.OneToneVoiceBridgeKeys.render){
      global.OneToneVoiceBridgeKeys.render();
    }
    if(face==='camera'&&global.OneToneVoiceBridgeCamera&&global.OneToneVoiceBridgeCamera.render){
      global.OneToneVoiceBridgeCamera.render();
    }
  }

  function getVoiceFace(){
    return global.__vp_voice_face__||'dictate';
  }

  function renderWakeSectionLabels(){
    var unified=$('voiceWakeCurrentSectionLbl');
    if(unified) unified.textContent=t('voiceWakePageTitle')||'怎么开启打字？';
    var pageSubVis=$('voiceWakePageSubVisible');
    if(pageSubVis) pageSubVis.textContent=t('voiceWakePageSubProto')||'先会用这一句就行 · 别的等要用再打开';
    var bridge=$('voiceWakePoolBridge');
    if(bridge) bridge.textContent=t('voiceWakePoolBridge');
    var aliasHint=$('voiceWakeAliasHint');
    if(aliasHint) aliasHint.textContent=t('voiceWakeAliasHint');
    var poolAdd=$('btnVoiceWakePoolAdd');
    if(poolAdd) poolAdd.textContent=t('voiceWakePoolAddBtn');
    var popTitle=$('voiceWakePopoverTitle');
    if(popTitle) popTitle.textContent=t('voiceWakePopoverTitle');
    var popSub=$('voiceWakePopoverSub');
    if(popSub) popSub.textContent=t('voiceWakePopoverSub');
    var phraseAdd=$('btnVoiceWakePhraseAdd');
    if(phraseAdd) phraseAdd.textContent=t('voiceWakeAddBtn')||t('voicePhraseAdd');
    var popCancel=$('btnVoiceWakePopoverCancel');
    if(popCancel) popCancel.textContent=t('confirmCancel');
    var popClose=$('btnVoiceWakePopoverClose');
    if(popClose){
      popClose.title=t('confirmCancel');
      popClose.setAttribute('aria-label',t('confirmCancel'));
    }
    var faceDictate=$('btnVoiceFaceDictate');
    if(faceDictate) faceDictate.textContent=t('voiceFaceDictate')||'听写';
    var faceSp=$('btnVoiceFaceSoftPad');
    if(faceSp) faceSp.textContent=t('voiceFaceSoftPad')||'SoftPad';
    var faceKeys=$('btnVoiceFaceKeys');
    if(faceKeys) faceKeys.textContent=t('voiceFaceKeys')||'按键';
    var faceCam=$('btnVoiceFaceCamera');
    if(faceCam) faceCam.textContent=t('voiceFaceCamera')||'摄像头';
    var dockTry=$('btnVoiceDockTryMic');
    if(dockTry) dockTry.textContent=t('voiceDockTryMic')||'试麦克风';
    var actionLbl=$('voiceWakeActionLbl');
    if(actionLbl) actionLbl.textContent=t('voiceWakeActionLbl')||'说出这句';
    var dictate=$('voiceWakeActionDictate');
    if(dictate) dictate.textContent=t('voiceWakeActionDictate')||'开始听写';
    var editLink=$('btnVoiceWakePhraseEditLink');
    if(editLink) editLink.textContent=t('voiceWakePhraseEditLink')||'不对就改';
    renderLandingStrip();
    renderWrongFgStatus();
  }

  function renderInputTarget(){
    /* input target lives on Keys page; wake step no longer renders it */
  }

  function syncWakePhraseKind(){
    global.__vp_voice_wake_kind__='text';
    if(global.OneToneVoiceStepSend&&global.OneToneVoiceStepSend.syncPhraseKindTabs){
      global.OneToneVoiceStepSend.syncPhraseKindTabs('voiceWakeKindTabs','text');
    }
  }

  function syncWakeInputCount(){
    var input=$('voiceWakePhraseInput');
    var count=$('voiceWakePhraseCount');
    if(!input||!count) return;
    var max=input.maxLength>0?input.maxLength:20;
    count.textContent=String((input.value||'').length)+'/'+max;
  }

  function renderHeroNarrative(vm){
    var badge=$('voiceWakePrimaryFastBadge');
    if(badge) badge.textContent=t('voiceWakePrimaryFastBadge');
    var ready=$('voiceWakeHeroReady');
    if(ready){
      if(vm.loading){
        ready.textContent=t('homeLiveLoading');
        ready.classList.remove('is-on','is-off','is-parked');
      }else{
        var wakeSnap=global.OneToneVoiceUiState?global.OneToneVoiceUiState.snapshot().wake||{}:{};
        var voskSnap=wakeSnap.vosk||{};
        var uiState=global.OneToneState&&global.OneToneState.ui;
        var parked=!!(uiState&&uiState.drawerOpen);
        var live=global.OneToneVoiceWake&&global.OneToneVoiceWake.voskListeningOk
          &&global.OneToneVoiceWake.voskListeningOk(voskSnap);
        if(live&&!parked){
          ready.textContent=t('voiceWakeHeroReadyOn');
          ready.classList.add('is-on');
          ready.classList.remove('is-off','is-parked');
        }else if(vm.voiceOn&&parked){
          ready.textContent=t('voiceWakeHeroParkedHint');
          ready.classList.add('is-parked');
          ready.classList.remove('is-on','is-off');
        }else if(vm.voiceOn){
          ready.textContent=t('voiceWakeHeroStartingHint');
          ready.classList.add('is-off');
          ready.classList.remove('is-on','is-parked');
        }else{
          ready.textContent=t('voiceWakeHeroReadyOff');
          ready.classList.add('is-off');
          ready.classList.remove('is-on','is-parked');
        }
      }
    }
    var hint=$('voiceWakeDisplayHint');
    if(hint){
      var link=hint.querySelector('#btnVoiceWakePhraseEditLink,.voice-phrase-hint-link');
      var lead=vm.loading?t('homeLiveLoading'):(t('voiceWakeHeroHint')||'默认用这句开始听写。');
      if(link){
        hint.innerHTML='';
        hint.appendChild(document.createTextNode(lead+(vm.loading?'':' ')));
        if(!vm.loading){
          link.textContent=t('voiceWakePhraseEditLink')||'不对就改';
          hint.appendChild(link);
        }
      }else if(!link){
        hint.textContent=lead;
      }
    }
    if(ready&&!ready._wakeBadgeBound){
      ready._wakeBadgeBound=true;
      ready.onclick=function(){
        var hooks=global.__vp_bootstrap_hooks__;
        if(hooks&&hooks.homeToggleVoiceWake) hooks.homeToggleVoiceWake();
      };
    }
  }

  function renderWakePage(vm){
    renderCompactWake(vm);
    renderCustomPhrases(vm);
    /* openApp summon retired */
    if(global.OneToneVoiceTab2Mvp&&global.OneToneVoiceTab2Mvp.renderHero){
      global.OneToneVoiceTab2Mvp.renderHero();
    }
    renderInputTarget(vm);
    syncWakePhraseKind();
    syncWakeInputCount();
    renderHeroNarrative(vm);
    if(global.__vp_syncWakeListeningOptInToggle__) global.__vp_syncWakeListeningOptInToggle__();
    renderWakeSectionLabels();
    var title=$('voiceWakePageTitle');
    if(title) title.textContent=t('voiceWakePageTitle');
    var sub=$('voiceWakePageSub');
    if(sub) sub.textContent=t('voiceWakePageSub');
    var globalTitle=$('voiceEditSectionPresets');
    if(globalTitle) globalTitle.textContent=t('voiceWakeGlobalTitle');
    var heroTitle=$('voiceWakeHeroTitle');
    if(heroTitle) heroTitle.textContent=t('voiceWakePrimaryLbl');
    var activeLbl=$('voiceWakeActiveLbl');
    if(activeLbl) activeLbl.textContent=t('voiceWakeActiveLbl');
    var wakeAdd=$('btnVoiceWakePoolAdd');
    if(wakeAdd) wakeAdd.textContent=t('voiceWakePoolAddBtn');
  }

  global.OneToneVoiceStepWake={
    syncWakeInputCount:syncWakeInputCount,
    render:renderWakePage,
    renderWakePage:renderWakePage,
    syncPresetPanels:function(vm){
      if(isScenarioVoiceEdit()){
        syncScenarioVoiceEditor();
        return;
      }
      renderWakeHost(vm||{loading:true});
    },
    syncPresetLang:syncWakePresetLangVisibility,
    resolveWakePresetMode:resolveWakePresetMode,
    syncScenarioVoiceEditor:syncScenarioVoiceEditor,
    isScenarioVoiceEdit:isScenarioVoiceEdit,
    setOpenAppExpanded:setOpenAppExpanded,
    getOpenAppExpanded:getOpenAppExpanded,
    openAppHostId:openAppHostId,
    renderOutputSummon:renderOutputSummon,
    setVoiceFace:setVoiceFace,
    getVoiceFace:getVoiceFace,
    renderLandingStrip:renderLandingStrip,
    renderSchemeCard:renderLandingStrip,
    renderWrongFgStatus:renderWrongFgStatus
  };
})((typeof window!=='undefined')?window:globalThis);
