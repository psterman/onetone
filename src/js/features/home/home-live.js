(function(global){
  'use strict';
  var $=function(id){ return global.OneToneDom.$(id); };
  var t=function(key){ return global.OneToneI18n.t(key); };
  function state(){ return global.OneToneState.state; }
  function ui(){ return global.OneToneState.ui; }
  function runtime(){ return global.OneToneState.runtime; }
  function hooks(){ return global.__vp_home_live_hooks__ || {}; }
  function normalizeUiTriggerMode(raw){
    raw=(raw||'tap').toLowerCase();
    if(raw==='toggle') return 'tap';
    if(raw==='hold'||raw==='longpress') return 'perpress';
    return raw;
  }
  function homeActiveMapping(){
    if(global.OneToneHabitProfile&&global.OneToneHabitProfile.projectActive){
      var p=global.OneToneHabitProfile.projectActive(state().config||{});
      if(p&&p.mapping) return p.mapping;
    }
    if(global.OneToneMappingCore&&global.OneToneMappingCore.activeScene){
      return global.OneToneMappingCore.activeScene();
    }
    return hooks().selectedMapping();
  }
  function homeEffectiveTargetKey(m,cfg){
    if(global.OneToneHabitProfile&&global.OneToneHabitProfile.project&&m&&cfg){
      var profile=global.OneToneHabitProfile.project(m,cfg);
      if(profile&&profile.effectiveTargetKey) return String(profile.effectiveTargetKey).trim();
    }
    if(!m||!cfg||!global.OneToneSceneConfig) return '';
    var eff=global.OneToneSceneConfig.resolveEffectiveScene(cfg,{activeSceneId:m.id});
    return eff&&eff.targetKey?String(eff.targetKey).trim():'';
  }
  function homeDisplayTargetKey(m,cfg){
    var eff=homeEffectiveTargetKey(m,cfg);
    if(eff) return eff;
    return hooks().editorTargetForMapping(m)||'';
  }
  function homeEmptyKeyLabel(){
    return global.OneToneSceneFlowSummary?global.OneToneSceneFlowSummary.emptyKeyLabel():t('homeKeyMapTapToRecord');
  }
  function homeDisplayTriggerLabel(m){
    if(global.OneToneSceneFlowSummary) return global.OneToneSceneFlowSummary.displayTriggerLabel(m);
    return '';
  }
  function homeFinishBehaviorSummary(m){
    if(global.OneToneSceneFlowSummary) return global.OneToneSceneFlowSummary.finishBehaviorTextHome(m);
    return {text:homeEmptyKeyLabel(),saved:false};
  }
  function computeHomeState(){
    if(!hooks().configLoadedFromBackend()){
      return {
        statusMode:'idle',
        statusLine:t('homeStatusLoading'),
        ctaMode:'config',
        ctaMain:t('homeCtaContinue'),
        ctaSub:t('homeStatusLoading'),
        ctaPanel:'basic',
        ctaFocus:null,
        keyStatus:t('homeCapLoading'),
        keyDot:'off',
        voiceStatus:t('homeCapLoading'),
        voiceDot:'off',
        endStatus:t('homeCapLoading'),
        endDot:'off',
        entrySummary:t('homeCapLoading'),
        entryMode:'loading',
        keyActive:false,
        voiceActive:false,
        triggerLabel:'',
        targetLabel:'',
        triggerKey:'',
        targetKey:'',
        keyReady:false
      };
    }
    const m=homeActiveMapping();
    const cfg=state().config||{};
    const trig=hooks().editorTriggerForMapping(m);
    const tgt=homeDisplayTargetKey(m,cfg);
    const keyReady=!!(trig&&tgt);
    const keyEnabled=!!(m&&m.enabled);
    const keyActive=keyEnabled&&keyReady;
    const voskCfg=cfg.voiceVosk||cfg.voice_vosk;
    const sapiCfg=cfg.voiceSapi||cfg.voice_sapi;
    const endCfg=cfg.voiceEnd||cfg.voice_end;
    const w=hooks().voiceUiSnapshot.wake||{};
    const voiceOnLive=w.engine==='vosk'||w.engine==='sapi';
    const voiceOnCfg=!!(voskCfg&&voskCfg.enabled)||!!(sapiCfg&&sapiCfg.enabled);
    const voiceOn=voiceOnLive||voiceOnCfg;
    const voiceActive=voiceOn;
    const endSnap=hooks().voiceUiSnapshot.end||{};
    const endEnabled=!!endSnap.enabled||!!(endCfg&&endCfg.enabled);
    const stateRaw=endSnap.state||'idle';
    const dictating=hooks().sessionActiveState(stateRaw);
    const focusMode=hooks().isHomeFirstRunFocusMode();
    const paused=!!runtime().paused;
    let statusMode='idle',statusLine='',ctaMode='config',ctaMain='',ctaSub='',ctaPanel='keys',ctaFocus=null;
    if(dictating){
      statusMode='active';
      statusLine=endSnap.statusLabel||global.OneToneVoiceEnd.stateLabel(stateRaw);
      ctaMode='dictating';
      ctaMain=t('homeCtaEnd');
      ctaSub=t('homeCtaEndSub');
      ctaPanel='voiceWake';
      ctaFocus='endPhrases';
    }else if(stateRaw==='error'){
      statusMode='error';
      statusLine=endSnap.statusLabel||global.OneToneVoiceEnd.stateLabel(stateRaw);
      ctaMode='error';
      ctaMain=t('homeCtaError');
      ctaSub=t('homeCtaErrorSub');
      ctaPanel='debug';
    }else if(paused){
      statusMode='warn';
      statusLine=t('homeStatusPaused');
      ctaMode='paused';
      ctaMain=t('homeCtaResume');
      ctaSub=t('homeCtaResumeSub');
      ctaPanel='basic';
    }else if(keyActive||voiceActive){
      statusMode='ready';
      statusLine=t('homeStatusListening');
      ctaMode='listening';
      ctaMain=t('homeCtaListening');
      if(keyActive&&voiceActive){
        ctaSub=t('homeCtaSubKeyOrVoice').replace('{key}',homeDisplayTriggerLabel(m));
      }else if(keyActive){
        ctaSub=t('homeCtaSubKey').replace('{key}',homeDisplayTriggerLabel(m));
      }else{
        ctaSub=t('homeCtaSubVoice');
      }
      ctaPanel=keyActive?'keys':'voiceWake';
    }else{
      statusMode='idle';
      statusLine=t('homeStatusTapToStart');
      ctaMode='start';
      ctaMain=t('homeCtaTurnOn');
      ctaSub=t('homeCtaTurnOnSub');
      if(trig&&tgt){
        ctaPanel='keys';
      }else if(trig&&!tgt){
        ctaPanel='keys';
        ctaFocus='target';
      }else{
        ctaPanel='voiceWake';
      }
    }
    if(focusMode&&!dictating&&statusMode!=='error'&&statusMode!=='warn'){
      statusMode='ready';
      statusLine=t('homeStatusFocus');
      if(keyReady){
        ctaMode='start';
        ctaMain=t('homeCtaStart');
        ctaSub=t('homeCtaSubKey').replace('{key}',homeDisplayTriggerLabel(m));
        ctaPanel='keys';
      }else if(trig&&!tgt){
        ctaMode='config';
        ctaMain=t('homeCtaContinue');
        ctaSub=t('homeCtaSubNeedTarget');
        ctaPanel='keys';
        ctaFocus='target';
      }else{
        ctaMode='config';
        ctaMain=t('homeCtaContinue');
        ctaSub=t('homeCtaSubNeedTrigger');
        ctaPanel='keys';
        ctaFocus='trigger';
      }
    }
    let keyStatus,keyDot;
    var trigLbl=homeDisplayTriggerLabel(m);
    if(keyReady){ keyStatus=trigLbl+' → '+hooks().friendlyKeyName(tgt); keyDot='ready'; }
    else if(trig){ keyStatus=trigLbl+' → '+t('targetPlaceholder'); keyDot='on'; }
    else { keyStatus=t('homeCapKeyUnset'); keyDot='off'; }
    let voiceStatus,voiceDot;
    if(voiceOn){
      const eng=(w.engine==='vosk'||(!w.engine&&voskCfg&&voskCfg.enabled))?t('wakeEngineVosk'):t('wakeEngineSapi');
      const phrase=w.phrase||((voskCfg&&voskCfg.enabled&&voskCfg.phrases&&voskCfg.phrases[0])||(sapiCfg&&sapiCfg.enabled&&sapiCfg.phrases&&sapiCfg.phrases[0])||'');
      voiceStatus=phrase?(eng+' · '+phrase):eng;
      voiceDot=(w.state==='listening'||w.state==='triggered')?'on':'ready';
    }else{ voiceStatus=t('homeCapVoiceOff'); voiceDot='off'; }
    let endStatus,endDot;
    if(endEnabled){
      endStatus=t('voiceEndEnabledShort');
      if(endSnap.voskRequired) endStatus+=' · '+t('voiceEndNeedVoskShort');
      if(endSnap.autoSendEnabled||(endCfg&&endCfg.autoSendEnabled)) endStatus+=' · '+t('voiceEndAutoSendOn');
      endDot='ready';
    }else{ endStatus=t('voiceEndDisabledShort'); endDot='off'; }
    let entrySummary,entryMode;
    if(keyActive&&voiceActive){ entrySummary=t('homeEntryBoth'); entryMode='both'; }
    else if(keyActive){ entrySummary=t('homeEntryKeyOnly'); entryMode='key'; }
    else if(voiceActive){ entrySummary=t('homeEntryVoiceOnly'); entryMode='voice'; }
    else{ entrySummary=t('homeEntryNone'); entryMode='none'; }
    var mapLabels=window.OneToneKeyLabels?window.OneToneKeyLabels.labelsForMapping(m,global.OneToneI18n.getLang()):{triggerLabel:trigLbl,targetLabel:hooks().friendlyKeyName(tgt)};
    return {statusMode,statusLine,ctaMode,ctaMain,ctaSub,ctaPanel,ctaFocus,keyStatus,keyDot,voiceStatus,voiceDot,endStatus,endDot,entrySummary,entryMode,keyActive,voiceActive,triggerLabel:mapLabels.triggerLabel||trigLbl,targetLabel:mapLabels.targetLabel||hooks().friendlyKeyName(tgt),triggerKey:trig,targetKey:tgt,keyReady};
  }
  function setHomeLiveVal(id,text,kind){
    const el=$(id);
    if(!el) return;
    el.textContent=text;
    el.className='home-live-val'+(kind?' is-'+kind:'');
  }

  function setHomeLiveBadge(id,text,kind){
    const el=$(id);
    if(!el) return;
    el.textContent=text;
    el.className='home-live-badge'+(kind?' is-'+kind:'');
  }
  function renderHomeKeyMapCard(loading){
    const titleEl=$('homeKeyMapTitle');
    const schemeLbl=$('homeKeyMapSchemeLbl');
    const trigLbl=$('homeKeyMapTriggerLbl');
    const tgtLbl=$('homeKeyMapTargetLbl');
    const trigHint=$('homeKeyMapTriggerHint');
    const tgtHint=$('homeKeyMapTargetHint');
    const arrowText=$('homeKeyMapArrowText');
    const triggerStep=$('homeKeyMapTrigger');
    const targetStep=$('homeKeyMapTarget');
    const finishStep=$('homeKeyMapFinish');
    const finishArrow=$('homeKeyMapArrowFinish');
    const busy=hooks().getRecordingMode()!=='none';
    if(titleEl) titleEl.textContent=t('homeKeyMapTitle');
    if(schemeLbl) schemeLbl.textContent=t('homeKeyMapSchemeLbl');
    if(trigLbl) trigLbl.textContent=t('homeLiveTrigger');
    if(tgtLbl) tgtLbl.textContent=t('homeLiveTarget');
    if(trigHint) trigHint.textContent=t('homeKeyMapTriggerHint');
    if(tgtHint) tgtHint.textContent=t('homeKeyMapTargetHint');
    if(arrowText) arrowText.textContent=t('homeKeyMapArrowText');
    global.OneToneHomeScheme.renderSwitcher(loading);
    hooks().ensureConfig();
    const m=homeActiveMapping();
    const cfg=state().config||{};
    const trig=hooks().editorTriggerForMapping(m);
    const tgt=homeDisplayTargetKey(m,cfg);
    const emptyLbl=homeEmptyKeyLabel();
    const trigEl=$('homeKeyMapTriggerKey');
    const tgtEl=$('homeKeyMapTargetKey');
    if(loading){
      if(trigEl){ trigEl.textContent=t('homeLiveLoading'); trigEl.className='home-key-map-key is-empty'; }
      if(tgtEl){ tgtEl.textContent=t('homeLiveLoading'); tgtEl.className='home-key-map-key is-empty'; }
      if(trigHint) trigHint.hidden=true;
      if(tgtHint) tgtHint.hidden=true;
      return;
    }
    if(trigEl){
      trigEl.textContent=trig?homeDisplayTriggerLabel(m):emptyLbl;
      trigEl.className='home-key-map-key'+(trig?' is-set':' is-empty');
    }
    if(tgtEl){
      tgtEl.textContent=tgt?hooks().friendlyKeyName(tgt):emptyLbl;
      tgtEl.className='home-key-map-key'+(tgt?' is-set':' is-empty');
    }
    if(trigHint) trigHint.hidden=!!trig;
    if(tgtHint) tgtHint.hidden=!!tgt;
    [triggerStep,targetStep,finishStep,finishArrow].forEach(function(el){
      if(el) el.classList.toggle('is-clickable',!loading&&!busy);
    });
  }
  function homeEndKeyPreview(m){
    const unset={summary:t('homeLiveUnset'),saved:false,showIcon:false,preset:null};
    if(!m||!hooks().isSavedMapping(m)) return unset;
    hooks().ensureMappingExtras(m);
    const presetId=String(m.imePresetId||'').trim();
    let preset=null;
    let isAppTarget=false;
    const appTargetId=String(m.appTargetId||'').trim();
    if(presetId&&global.OneToneImePresets&&global.OneToneImePresets.presetById){
      preset=global.OneToneImePresets.presetById(presetId);
    }
    if(!preset){
      if(appTargetId&&global.OneToneAppTargetPresets&&global.OneToneAppTargetPresets.presetById){
        preset=global.OneToneAppTargetPresets.presetById(appTargetId);
        isAppTarget=!!preset;
      }
    }
    const customTarget=String(homeDisplayTargetKey(m,state().config||{})||m.targetKey||'').trim();
    const rawKey=preset
      ?String((preset.endKey||preset.targetKey)||'').trim()
      :customTarget;
    if(!rawKey) return unset;
    const summary=isAppTarget&&preset&&preset.nameKey
      ?((global.OneToneAppTargetPresets&&global.OneToneAppTargetPresets.isWorkflowAppTarget&&global.OneToneAppTargetPresets.isWorkflowAppTarget(appTargetId))
        ?t(preset.nameKey)
        :t(preset.nameKey)+' · '+hooks().friendlyKeyName(rawKey))
      :hooks().friendlyKeyName(rawKey);
    return {
      summary:summary,
      saved:true,
      showIcon:!!preset,
      preset:preset,
      isAppTarget:isAppTarget
    };
  }

  function keyFinishPreviewText(m){
    const unset={
      mode:'',detail:'',summary:t('homeLiveUnset'),
      bindingLine:'',saved:false,chips:[]
    };
    if(!m||!hooks().isSavedMapping(m)) return unset;
    hooks().ensureMappingTiming(m);
    const mode=normalizeUiTriggerMode(m.triggerMode);
    const bindingLine=t('keyFinishFlowScheme').replace('{name}',global.OneToneHomeScheme.label());
    if(mode==='tap'){
      const summary=t('keyFinishFlowConfirm');
      const chips=[
        {lbl:t('cancelTimingTitle'),on:!!m.cancelEnabled},
        {lbl:t('sendTimingTitle'),on:!!m.autoEnterEnabled}
      ];
      return {mode:summary,detail:'',summary:summary,bindingLine:bindingLine,saved:true,chips:chips};
    }
    const summary=t('keyFinishFlowInstant');
    return {
      mode:summary,detail:t('keyExecFinishPerPressDetail'),summary:summary,
      bindingLine:bindingLine,saved:true,chips:[]
    };
  }

  function renderHomeStatusMetaItem(label,on,stateText){
    const active=!!on;
    stateText=stateText!=null?stateText:(active?t('keyFinishFlowStatusOn'):t('keyFinishFlowStatusOff'));
    return '<span class="home-step-meta-item'+(active?' is-on':'')+'">'+
      '<span class="home-status-dot'+(active?' is-on':'')+'" aria-hidden="true"></span>'+
      '<span class="home-step-meta-label">'+hooks().escHtml(label)+'</span>'+
      '<span class="home-step-meta-state">'+hooks().escHtml(stateText)+'</span></span>';
  }

  function renderHomeKeyFinishMetaChips(chips){
    if(!chips||!chips.length) return '';
    return '<div class="home-step-meta-chips">'+chips.map(function(chip){
      return renderHomeStatusMetaItem(chip.lbl,!!chip.on);
    }).join('')+'</div>';
  }

  function renderHomeKeyFinishPreview(loading){
    const m=homeActiveMapping();
    const behavior=loading?null:homeFinishBehaviorSummary(m);
    const finishLbl=$('homeKeyMapFinishLbl');
    const finishKey=$('homeKeyMapFinishKey');
    const finishKeyText=$('homeKeyMapFinishKeyText');
    const finishImeIcon=$('homeKeyMapFinishImeIcon');
    const finishHint=$('homeKeyMapFinishHint');
    const arrowFinishText=$('homeKeyMapArrowFinishText');
    if(finishLbl) finishLbl.textContent=t('homeKeyMapFinishLbl');
    if(arrowFinishText) arrowFinishText.textContent=t('homeKeyMapArrowFinishText');
    const summary=behavior?behavior.text:t('homeLiveUnset');
    if(loading){
      if(finishKeyText) finishKeyText.textContent=t('homeLiveLoading');
      else if(finishKey) finishKey.textContent=t('homeLiveLoading');
      if(finishKey) finishKey.className='home-key-map-key is-empty';
      if(finishImeIcon) finishImeIcon.hidden=true;
      if(finishHint){ finishHint.textContent=''; finishHint.hidden=true; }
      return;
    }
    if(finishKeyText) finishKeyText.textContent=summary;
    else if(finishKey) finishKey.textContent=summary;
    if(finishImeIcon){
      finishImeIcon.hidden=true;
      finishImeIcon.removeAttribute('src');
    }
    if(finishKey){
      finishKey.className='home-key-map-key'+(behavior&&behavior.saved?' is-set':' is-empty');
      finishKey.classList.remove('has-ime-badge','has-app-target-badge');
    }
    if(finishHint){
      finishHint.innerHTML='';
      finishHint.hidden=true;
    }
  }
  function homeMicStatusLabel(){
    if(!hooks().configLoadedFromBackend()) return t('homeLiveLoading');
    const micDevices=hooks().micDevices;
    if(!micDevices.length) return t('homeLiveMicUnknown');
    const dev=micDevices.find(function(d){ return d.id===hooks().activeMicId(); })
      ||micDevices.find(function(d){ return d.isDefault; })
      ||micDevices[0];
    if(dev&&(dev.name||dev.label)) return dev.name||dev.label;
    if(hooks().activeMicId()) return hooks().activeMicId();
    return t('homeLiveMicUnset');
  }

  function homeVoiceWakePhrase(){
    const list=homeVoiceWakePhrases();
    return list[0]||'';
  }

  function homeVoskModelPreset(){
    const cfg=state().config||{};
    const voskCfg=cfg.voiceVosk||cfg.voice_vosk||{};
    const w=hooks().voiceUiSnapshot.wake||{};
    const vosk=w.vosk||{};
    return String(vosk.modelPreset||voskCfg.modelPreset||'cn-light').trim()||'cn-light';
  }

  function homeVoiceWakePhrases(){
    var cfg=state().config||{};
    var hp=global.OneToneHabitProfile;
    var active=hp&&hp.projectActive?hp.projectActive(cfg):null;
    if(active&&Array.isArray(active.baseWakePhrases)&&active.baseWakePhrases.length){
      return hooks().cloneStringList(active.baseWakePhrases);
    }
    const eng=homeVoiceEngineOn();
    const voskCfg=cfg.voiceVosk||cfg.voice_vosk||{};
    const sapiCfg=cfg.voiceSapi||cfg.voice_sapi||{};
    const w=hooks().voiceUiSnapshot.wake||{};
    if(eng==='vosk'){
      const enOnly=global.OneToneVoiceWake.isEnglishVoskPreset(homeVoskModelPreset());
      const cn=Array.isArray(w.vosk&&w.vosk.phrasesCn)?hooks().cloneStringList(w.vosk.phrasesCn):[];
      const en=Array.isArray(w.vosk&&w.vosk.phrasesEn)?hooks().cloneStringList(w.vosk.phrasesEn):[];
      const fromSnap=enOnly?en:cn;
      if(fromSnap.length) return fromSnap;
      return hooks().cloneStringList(voskCfg.phrases||[]);
    }
    if(eng==='sapi'){
      const fromSnap=Array.isArray(w.sapi&&w.sapi.phrases)?hooks().cloneStringList(w.sapi.phrases):[];
      if(fromSnap.length) return fromSnap;
      return hooks().cloneStringList(sapiCfg.phrases||[]);
    }
    const pref=hooks().homePreferredVoiceEngine();
    if(pref==='vosk'){
      const enOnly=global.OneToneVoiceWake.isEnglishVoskPreset(homeVoskModelPreset());
      const cn=Array.isArray(w.vosk&&w.vosk.phrasesCn)?hooks().cloneStringList(w.vosk.phrasesCn):[];
      const en=Array.isArray(w.vosk&&w.vosk.phrasesEn)?hooks().cloneStringList(w.vosk.phrasesEn):[];
      const fromSnap=enOnly?en:cn;
      if(fromSnap.length) return fromSnap;
      return hooks().cloneStringList(voskCfg.phrases||[]);
    }
    const fromSnap=Array.isArray(w.sapi&&w.sapi.phrases)?hooks().cloneStringList(w.sapi.phrases):[];
    if(fromSnap.length) return fromSnap;
    return hooks().cloneStringList(sapiCfg.phrases||[]);
  }

  function homeVoiceSummonPhrases(){
    var cfg=state().config||{};
    var hp=global.OneToneHabitProfile;
    var active=hp&&hp.projectActive?hp.projectActive(cfg):null;
    if(active&&Array.isArray(active.summonPhrases)) return hooks().cloneStringList(active.summonPhrases);
    return [];
  }

  function homeVoiceEndPhrases(){
    const endSnap=hooks().voiceUiSnapshot.end||{};
    const endCfg=(state().config&&state().config.voiceEnd)||(state().config&&state().config.voice_end)||{};
    const zhSnap=Array.isArray(endSnap.phrasesZh)?endSnap.phrasesZh:[];
    const enSnap=Array.isArray(endSnap.phrasesEn)?endSnap.phrasesEn:[];
    const zhCfg=endCfg.phrasesZh||endCfg.phrases_zh||[];
    const enCfg=endCfg.phrasesEn||endCfg.phrases_en||[];
    const zhList=hooks().cloneStringList(zhSnap.length?zhSnap:zhCfg);
    const enList=hooks().cloneStringList(enSnap.length?enSnap:enCfg);
    if(global.OneToneI18n.getLang()==='en') return enList.length?enList:zhList;
    return zhList.length?zhList:enList;
  }

  function homeVoiceEngineOn(){
    const cfg=state().config||{};
    const voskCfg=cfg.voiceVosk||cfg.voice_vosk||{};
    const sapiCfg=cfg.voiceSapi||cfg.voice_sapi||{};
    const w=hooks().voiceUiSnapshot.wake||{};
    if(w.engine==='vosk'||voskCfg.enabled) return 'vosk';
    if(w.engine==='sapi'||sapiCfg.enabled) return 'sapi';
    return 'off';
  }
  function homeVoiceEngineUiMode(){
    const runtimeEng=homeVoiceEngineOn();
    if(runtimeEng!=='off') return runtimeEng;
    if(global.OneToneVoiceWake){
      if(global.OneToneVoiceWake.isModeSwitchPending()){
        const pending=global.OneToneVoiceWake.getExpandedMode();
        if(pending==='vosk'||pending==='sapi') return pending;
      }
      const expanded=global.OneToneVoiceWake.getExpandedMode();
      if(expanded==='vosk'||expanded==='sapi') return expanded;
    }
    const cfg=state().config||{};
    const voskCfg=cfg.voiceVosk||cfg.voice_vosk||{};
    if(voskCfg.enabled) return 'vosk';
    if(global.OneToneVoiceEngineReadiness&&global.OneToneVoiceEngineReadiness.isVoskOnlyUi()) return 'vosk';
    return 'sapi';
  }

  function renderHomeVoiceSimpleLinks(linkIds){
    const host=$('homeVoiceSimpleLinks');
    if(!host) return;
    const map=global.HOME_VOICE_LINK_MAP||{};
    const labels=global.HOME_VOICE_LINK_LABEL_KEYS||{};
    if(!linkIds||!linkIds.length){ host.innerHTML=''; return; }
    host.innerHTML=linkIds.map(function(id,i){
      if(!map[id]) return '';
      var sep=i>0?'<span class="home-voice-simple-link-sep" aria-hidden="true">·</span>':'';
      return sep+'<button type="button" class="home-voice-simple-link" data-link-id="'+hooks().escHtml(id)+'">'+hooks().escHtml(t(labels[id]||id))+'</button>';
    }).join('');
  }

  function renderHomeVoiceSimpleCard(summary){
    summary=summary||global.OneToneVoiceHomeSummary.compute();
    const descEl=$('homeVoiceSimpleDesc');
    const phraseEl=$('homeVoiceSimplePhrase');
    const heardEl=$('homeVoiceSimpleHeard');
    const statusEl=$('homeVoiceSimpleStatus');
    const endLineEl=$('homeVoiceSimpleEndLine');
    const heroEl=$('homeVoiceSimpleHero');
    if(descEl) descEl.textContent=summary.dictating?t('homeVoiceSimpleDescDictating'):t('homeVoiceSimpleDesc');
    if(phraseEl){
      phraseEl.textContent=summary.loading?t('homeLiveLoading'):(summary.wakePhrase||t('homeLiveUnset'));
      phraseEl.classList.toggle('is-empty',!summary.loading&&!summary.wakePhrase);
    }
    if(heroEl){
      heroEl.classList.toggle('is-success',summary.statusMode==='triggered');
      heroEl.classList.toggle('is-dictating',summary.dictating);
    }
    if(heardEl){
      if(summary.heardLine){
        heardEl.hidden=false;
        heardEl.textContent=summary.heardLine;
      }else{
        heardEl.hidden=true;
        heardEl.textContent='';
      }
    }
    if(statusEl){
      statusEl.textContent=summary.statusLine||'';
      statusEl.className='home-voice-simple-status';
      if(summary.statusKind) statusEl.classList.add('is-'+summary.statusKind);
    }
    if(endLineEl){
      if(summary.endLine){
        endLineEl.hidden=false;
        endLineEl.textContent=summary.endLine;
      }else{
        endLineEl.hidden=true;
        endLineEl.textContent='';
      }
    }
    renderHomeVoiceSimpleLinks(summary.linkIds);
  }

  function syncHomeEntryToggleBtn(btn,isActive,offKey,onKey){
    if(!btn) return;
    btn.textContent=isActive?t(onKey):t(offKey);
    btn.classList.remove('is-turn-on','is-turn-off');
    btn.classList.add(isActive?'is-turn-off':'is-turn-on');
  }
  function renderHomeLiveKeyPanel(loading){
    const recordingBusy=hooks().getRecordingMode()!=='none';
    const m=homeActiveMapping();
    const cfg=state().config||{};
    const trig=hooks().editorTriggerForMapping(m);
    const tgt=homeDisplayTargetKey(m,cfg);
    const ready=!!(trig&&tgt);
    const enabled=!!(m&&m.enabled);
    const isDraft=m&&hooks().isDraftMapping(m);
    renderHomeKeyMapCard(loading);
    const conflictEl=$('homeLiveKeyConflict');
    const n=loading?0:hooks().countConflictPairs();
    if(conflictEl){
      if(n>0){
        conflictEl.hidden=false;
        conflictEl.textContent=t('homeLiveConflictHint').replace('{n}',String(n));
        conflictEl.classList.add('is-clickable');
        conflictEl.title=t('homeSchemeManage');
      }else{
        conflictEl.hidden=true;
        conflictEl.textContent='';
        conflictEl.classList.remove('is-clickable');
        conflictEl.removeAttribute('title');
      }
    }
    let badgeText,badgeKind;
    if(loading){ badgeText=t('homeLiveLoading'); badgeKind=''; }
    else if(isDraft){ badgeText=t('homeLiveSchemeDraft'); badgeKind='warn'; }
    else if(n>0){ badgeText=t('homeLiveBadgeWarn'); badgeKind='warn'; }
    else if(enabled&&ready){ badgeText=t('homeLiveBadgeReady'); badgeKind='on'; }
    else if(enabled&&!ready){ badgeText=t('homeLiveBadgeWarn'); badgeKind='warn'; }
    else{ badgeText=t('homeLiveBadgeOff'); badgeKind='off'; }
    setHomeLiveBadge('homeLiveKeyBadge',badgeText,badgeKind);
    syncHomeEntryToggleBtn($('btnHomeKeyToggle'),enabled,'homeLiveToggleKeyOff','homeLiveToggleKeyOn');
    const keyPanel=$('homeLivePanelKey');
    if(keyPanel) keyPanel.classList.toggle('is-entry-disabled',!loading&&!enabled);
    const toggleBtn=$('btnHomeKeyToggle');
    if(toggleBtn) toggleBtn.disabled=recordingBusy||loading||!m||isDraft;
    renderHomeKeyFinishPreview(loading);
  }

  function renderHomeLiveVoicePanel(loading,opts){
    opts=opts||{};
    const skipMic=!!opts.skipMic;
    const micDevices=hooks().micDevices;
    if(!skipMic){
      if(!micDevices.length&&!loading&&!hooks().uiBootstrapping()) hooks().loadMicDevices().catch(function(){});
      else if(!loading&&!hooks().voiceCaptureActive()&&hooks().bootMicReady()){
        const switchPending=global.OneToneVoiceWake&&global.OneToneVoiceWake.isModeSwitchPending();
        if(!switchPending) hooks().syncHomeMicMonitor().catch(function(){});
      }
    }
    const recordingBusy=hooks().getRecordingMode()!=='none';
    const summary=global.OneToneVoiceHomeSummary.compute();
    const eng=summary.engine;
    const voiceOn=summary.voiceOn;
    const w=hooks().voiceUiSnapshot.wake||{};
    const running=w.state==='listening'||w.state==='triggered';
    const voskState=(w.vosk&&w.vosk.state)||'';
    const sapiState=(w.sapi&&w.sapi.state)||'';
    const engineStarting=voskState==='starting'||sapiState==='starting';
    const warming=voiceOn&&engineStarting&&!summary.loading;
    setHomeLiveBadge('homeLiveVoiceBadge',summary.loading?t('homeLiveLoading'):(eng==='off'?t('homeLiveBadgeOff'):(warming?t('homeLiveLoading'):(running?t('homeLiveBadgeOn'):t('homeLiveBadgeReady')))),summary.loading?'':(eng==='off'?'':(running?'on':'on')));
    renderHomeVoiceSimpleCard(summary);
    const toggleBtn=$('btnHomeVoiceToggle');
    syncHomeEntryToggleBtn(toggleBtn,voiceOn,'homeLiveToggleWakeOff','homeLiveToggleWakeOn');
    if(toggleBtn) toggleBtn.disabled=!!global.OneToneVoiceWake.isSapiTogglePending()||!!global.OneToneVoiceWake.isVoskTogglePending()||recordingBusy;
    const voicePanel=$('homeLivePanelVoice');
    if(voicePanel) voicePanel.classList.toggle('is-entry-disabled',!summary.loading&&!voiceOn);
  }

  var homeLiveRenderTimer=0;
  function scheduleRenderHomeLiveZone(){
    clearTimeout(homeLiveRenderTimer);
    homeLiveRenderTimer=setTimeout(function(){
      homeLiveRenderTimer=0;
      renderHomeLiveZone();
    },100);
  }
  function renderHomeVoiceModeSwitchUi(){
    const loading=!hooks().configLoadedFromBackend();
    renderHomeLiveVoicePanel(loading,{skipMic:true});
  }
  function renderHomeLiveZone(){
    try{
      const loading=!hooks().configLoadedFromBackend();
      hooks().syncGlobalMasterUi();
      renderHomeLiveKeyPanel(loading);
      renderHomeLiveVoicePanel(loading);
      hooks().refreshHomeGuideIfOpen();
      if(global.OneToneHomeV9){
        global.OneToneHomeV9.render();
      }
    }catch(err){
      console.error('renderHomeLiveZone',err);
    }
  }

  global.OneToneHomeLive={
    computeState:computeHomeState,
    setLiveVal:setHomeLiveVal,setLiveBadge:setHomeLiveBadge,
    renderKeyMapCard:renderHomeKeyMapCard,
    keyFinishPreview:keyFinishPreviewText,
    renderKeyFinishPreview:renderHomeKeyFinishPreview,
    micStatusLabel:homeMicStatusLabel,
    voiceWakePhrase:homeVoiceWakePhrase,
    voiceWakePhrases:homeVoiceWakePhrases,
    voiceSummonPhrases:homeVoiceSummonPhrases,
    voiceEndPhrases:homeVoiceEndPhrases,
    voiceEngineOn:homeVoiceEngineOn,
    voiceEngineUiMode:homeVoiceEngineUiMode,
    syncEntryToggleBtn:syncHomeEntryToggleBtn,
    renderKeyPanel:renderHomeLiveKeyPanel,
    renderVoicePanel:renderHomeLiveVoicePanel,
    renderSimpleCard:renderHomeVoiceSimpleCard,
    renderZone:renderHomeLiveZone,
    scheduleRenderZone:scheduleRenderHomeLiveZone,
    renderVoiceModeSwitchUi:renderHomeVoiceModeSwitchUi
  };
})((typeof window!=='undefined')?window:globalThis);
