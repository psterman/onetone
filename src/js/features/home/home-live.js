(function(global){
  'use strict';
  var $=function(id){ return global.OneToneDom.$(id); };
  var t=function(key){ return global.OneToneI18n.t(key); };
  function state(){ return global.OneToneState.state; }
  function ui(){ return global.OneToneState.ui; }
  function runtime(){ return global.OneToneState.runtime; }
  function hooks(){ return global.__vp_home_live_hooks__ || {}; }
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
    const m=hooks().selectedMapping();
    const trig=hooks().editorTriggerForMapping(m);
    const tgt=hooks().editorTargetForMapping(m);
    const keyReady=!!(trig&&tgt);
    const keyEnabled=!!(m&&m.enabled);
    const keyActive=keyEnabled&&keyReady;
    const cfg=state().config||{};
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
    let statusMode='idle',statusLine='',ctaMode='config',ctaMain='',ctaSub='',ctaPanel='keyWake',ctaFocus=null;
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
        ctaSub=t('homeCtaSubKeyOrVoice').replace('{key}',hooks().friendlyKeyName(trig));
      }else if(keyActive){
        ctaSub=t('homeCtaSubKey').replace('{key}',hooks().friendlyKeyName(trig));
      }else{
        ctaSub=t('homeCtaSubVoice');
      }
      ctaPanel=keyActive?'keyWake':'voiceWake';
    }else{
      statusMode='idle';
      statusLine=t('homeStatusTapToStart');
      ctaMode='start';
      ctaMain=t('homeCtaTurnOn');
      ctaSub=t('homeCtaTurnOnSub');
      if(trig&&tgt){
        ctaPanel='keyWake';
      }else if(trig&&!tgt){
        ctaPanel='keyWake';
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
        ctaSub=t('homeCtaSubKey').replace('{key}',hooks().friendlyKeyName(trig));
        ctaPanel='keyWake';
      }else if(trig&&!tgt){
        ctaMode='config';
        ctaMain=t('homeCtaContinue');
        ctaSub=t('homeCtaSubNeedTarget');
        ctaPanel='keyWake';
        ctaFocus='target';
      }else{
        ctaMode='config';
        ctaMain=t('homeCtaContinue');
        ctaSub=t('homeCtaSubNeedTrigger');
        ctaPanel='keyWake';
        ctaFocus='trigger';
      }
    }
    let keyStatus,keyDot;
    if(keyReady){ keyStatus=hooks().friendlyKeyName(trig)+' → '+hooks().friendlyKeyName(tgt); keyDot='ready'; }
    else if(trig){ keyStatus=hooks().friendlyKeyName(trig)+' → '+t('targetPlaceholder'); keyDot='on'; }
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
    var mapLabels=window.OneToneKeyLabels?window.OneToneKeyLabels.labelsForMapping(m,global.OneToneI18n.getLang()):{triggerLabel:hooks().friendlyKeyName(trig),targetLabel:hooks().friendlyKeyName(tgt)};
    return {statusMode,statusLine,ctaMode,ctaMain,ctaSub,ctaPanel,ctaFocus,keyStatus,keyDot,voiceStatus,voiceDot,endStatus,endDot,entrySummary,entryMode,keyActive,voiceActive,triggerLabel:mapLabels.triggerLabel||hooks().friendlyKeyName(trig),targetLabel:mapLabels.targetLabel||hooks().friendlyKeyName(tgt),triggerKey:trig,targetKey:tgt,keyReady};
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
    const m=hooks().selectedMapping();
    const trig=hooks().editorTriggerForMapping(m);
    const tgt=hooks().editorTargetForMapping(m);
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
      trigEl.textContent=trig?hooks().friendlyKeyName(trig):t('homeKeyMapEmptyKey');
      trigEl.className='home-key-map-key'+(trig?' is-set':' is-empty');
      trigEl.classList.toggle('is-recording',hooks().getRecordingMode()==='trigger');
    }
    if(tgtEl){
      tgtEl.textContent=tgt?hooks().friendlyKeyName(tgt):t('homeKeyMapEmptyKey');
      tgtEl.className='home-key-map-key'+(tgt?' is-set':' is-empty');
      tgtEl.classList.toggle('is-recording',hooks().getRecordingMode()==='target');
    }
    if(trigHint) trigHint.hidden=!!trig;
    if(tgtHint) tgtHint.hidden=!!tgt;
    [triggerStep,targetStep,finishStep,finishArrow].forEach(function(el){
      if(el) el.classList.toggle('is-clickable',!loading&&!busy);
    });
  }
  function keyFinishPreviewText(m){
    const unset={
      mode:'',detail:'',summary:t('homeLiveUnset'),
      bindingLine:'',saved:false,chips:[]
    };
    if(!m||!hooks().isSavedMapping(m)) return unset;
    hooks().ensureMappingTiming(m);
    const raw=(m.triggerMode||'tap').toLowerCase();
    const mode=(raw==='toggle')?'tap':(raw==='longpress'?'hold':raw);
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
    const m=hooks().selectedMapping();
    const preview=loading?null:keyFinishPreviewText(m);
    const finishLbl=$('homeKeyMapFinishLbl');
    const finishKey=$('homeKeyMapFinishKey');
    const finishHint=$('homeKeyMapFinishHint');
    const arrowFinishText=$('homeKeyMapArrowFinishText');
    if(finishLbl) finishLbl.textContent=t('homeKeyMapFinishLbl');
    if(arrowFinishText) arrowFinishText.textContent=t('homeKeyMapArrowFinishText');
    const busy=hooks().getRecordingMode()!=='none';
    if(loading){
      if(finishKey){ finishKey.textContent=t('homeLiveLoading'); finishKey.className='home-key-map-key is-empty'; }
      if(finishHint){ finishHint.textContent=''; finishHint.hidden=true; }
      return;
    }
    const summary=preview?preview.summary:t('homeLiveUnset');
    if(finishKey){
      finishKey.textContent=summary;
      finishKey.className='home-key-map-key'+(preview&&preview.saved?' is-set':' is-empty');
    }
    if(finishHint){
      const chipsHtml=preview&&preview.chips&&preview.chips.length?renderHomeKeyFinishMetaChips(preview.chips):'';
      const detailHtml=preview&&preview.detail?('<span class="home-key-map-step-hint-plain">'+hooks().escHtml(preview.detail)+'</span>'):'';
      const html=chipsHtml||detailHtml;
      finishHint.innerHTML=html;
      finishHint.hidden=!html;
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
    const eng=homeVoiceEngineOn();
    const cfg=state().config||{};
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

  function homeVoiceEndPhrases(){
    const endSnap=hooks().voiceUiSnapshot.end||{};
    const endCfg=(state().config&&state().config.voiceEnd)||(state().config&&state().config.voice_end)||{};
    const zh=endSnap.phrasesZh||endCfg.phrasesZh||endCfg.phrases_zh||[];
    const en=endSnap.phrasesEn||endCfg.phrasesEn||endCfg.phrases_en||[];
    const zhList=hooks().cloneStringList(Array.isArray(zh)?zh:[]);
    const enList=hooks().cloneStringList(Array.isArray(en)?en:[]);
    if(global.OneToneI18n.getLang()==='en') return enList.length?enList:zhList;
    return zhList.length?zhList:enList;
  }

  function setHomeWakeHintLine(el,text,kind){
    if(!el) return;
    const value=String(text||'').trim();
    if(!value){
      el.hidden=true;
      el.textContent='';
      el.classList.remove('is-heard','is-ok','is-warn');
      return;
    }
    el.hidden=false;
    el.textContent=value;
    el.classList.toggle('is-heard',kind==='heard');
    el.classList.toggle('is-ok',kind==='ok');
    el.classList.toggle('is-warn',kind==='warn');
  }

  function renderHomeWakeStatusHint(loading){
    const heardEl=$('homeVoiceWakeHintHeard');
    const resultEl=$('homeVoiceWakeHintResult');
    if(loading){
      setHomeWakeHintLine(heardEl,'');
      setHomeWakeHintLine(resultEl,'');
      hooks().syncHomeMicPickState(true);
      return;
    }
    const eng=homeVoiceEngineOn();
    const voiceOn=eng!=='off';
    const w=hooks().voiceUiSnapshot.wake||{};
    if(!voiceOn){
      setHomeWakeHintLine(heardEl,'');
      setHomeWakeHintLine(resultEl,'');
      hooks().syncHomeMicPickState(false);
      return;
    }
    const res=eng==='vosk'?w.vosk:w.sapi;
    const raw=(res&&res.state)||'stopped';
    const trigger=(res&&res.lastTrigger)||'';
    const isTriggered=raw==='triggered'||!!trigger;
    if(isTriggered&&trigger){
      setHomeWakeHintLine(heardEl,'');
      setHomeWakeHintLine(resultEl,t('homeVoiceWakeHintResultOk').replace('{text}',trigger),'ok');
      hooks().syncHomeMicPickState(false);
      return;
    }
    if(eng==='sapi'){
      const heard=(res&&res.lastHeard)||'';
      if(heard&&(raw==='listening'||raw==='starting')){
        setHomeWakeHintLine(heardEl,t('voiceSapiHeard')+'：'+heard,'heard');
      }else{
        setHomeWakeHintLine(heardEl,'');
      }
    }else{
      const partial=(res&&res.lastPartial)||'';
      if(partial&&(raw==='listening'||raw==='starting')){
        setHomeWakeHintLine(heardEl,t('voiceVoskPartial')+'：'+partial,'heard');
      }else{
        setHomeWakeHintLine(heardEl,'');
      }
    }
    setHomeWakeHintLine(resultEl,'');
    hooks().syncHomeMicPickState(false);
  }
  function renderPhraseCloud(container,phrases,opts){
    opts=opts||{};
    if(!container) return;
    container.replaceChildren();
    container.classList.toggle('is-lite-locked',!!opts.liteLocked);
    container.classList.toggle('is-wake',opts.mode==='wake');
    const list=(phrases||[]).map(function(p){ return String(p||'').trim(); }).filter(Boolean);
    if(!list.length){
      const empty=document.createElement('span');
      empty.className='home-phrase-cloud-empty';
      empty.textContent=opts.emptyText||'—';
      container.appendChild(empty);
      return;
    }
    list.forEach(function(phrase,i){
      const chip=document.createElement('span');
      if(opts.mode==='wake'){
        chip.className='home-phrase-chip'+(i===0?' is-primary':' is-secondary');
      }else{
        chip.className='home-phrase-chip'+(i===0?' is-primary':(i<3?' is-secondary':' is-tertiary'));
      }
      chip.textContent=phrase;
      chip.title=phrase;
      container.appendChild(chip);
    });
  }

  function homeEndPhrase(){
    const end=state().config.voiceEnd||state().config.voice_end||{};
    const zh=end.phrasesZh||end.phrases_zh||[];
    const en=end.phrasesEn||end.phrases_en||[];
    const list=(global.OneToneI18n.getLang()==='en'?en.concat(zh):zh.concat(en)).filter(function(x){ return String(x||'').trim(); });
    return list[0]||t('homeEndPhraseDefault');
  }

  function homeWakeHeardLabel(){
    const w=hooks().voiceUiSnapshot.wake||{};
    const sapi=w.sapi||{};
    const vosk=w.vosk||{};
    if(w.engine==='vosk'){
      const hit=vosk.lastDetectedPhrase||vosk.lastFinal||vosk.lastPartial||'';
      if(hit) return hit;
      return vosk.enabled?(vosk.state==='listening'?t('homeLiveHeardWaiting'):t('homeLiveHeardOff')):t('homeLiveHeardOff');
    }
    if(w.engine==='sapi'||sapi.enabled){
      if(sapi.lastHeard) return sapi.lastHeard;
      return sapi.enabled?(sapi.state==='listening'?t('homeLiveHeardWaiting'):t('homeLiveHeardOff')):t('homeLiveHeardOff');
    }
    return t('homeLiveHeardOff');
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

  function syncHomeEntryToggleBtn(btn,isActive,offKey,onKey){
    if(!btn) return;
    btn.textContent=isActive?t(onKey):t(offKey);
    btn.classList.remove('is-turn-on','is-turn-off');
    btn.classList.add(isActive?'is-turn-off':'is-turn-on');
  }
  function renderHomeLiveKeyPanel(loading){
    const recordingBusy=hooks().getRecordingMode()!=='none';
    const m=hooks().selectedMapping();
    const trig=hooks().editorTriggerForMapping(m);
    const tgt=hooks().editorTargetForMapping(m);
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

  function renderHomeLiveVoicePanel(loading){
    const micDevices=hooks().micDevices;
    if(!micDevices.length&&!loading&&!hooks().uiBootstrapping()) hooks().loadMicDevices().catch(function(){});
    else{
      hooks().renderHomeMicCurrent();
      if(!loading&&!hooks().voiceCaptureActive()&&hooks().bootMicReady()) hooks().syncHomeMicMonitor().catch(function(){});
    }
    const recordingBusy=hooks().getRecordingMode()!=='none';
    const eng=homeVoiceEngineOn();
    const cfg=state().config||{};
    const voskCfg=cfg.voiceVosk||cfg.voice_vosk||{};
    const sapiCfg=cfg.voiceSapi||cfg.voice_sapi||{};
    const w=hooks().voiceUiSnapshot.wake||{};
    const voiceOn=eng!=='off';
    const running=w.state==='listening'||w.state==='triggered';
    const warming=voiceOn&&!hooks().voiceEngineBootDone()&&hooks().configLoadedFromBackend();
    setHomeLiveBadge('homeLiveVoiceBadge',loading?t('homeLiveLoading'):(eng==='off'?t('homeLiveBadgeOff'):(warming?t('homeLiveLoading'):(running?t('homeLiveBadgeOn'):t('homeLiveBadgeReady')))),loading?'':(eng==='off'?'':(running?'on':'on')));
    const wakeStep=$('homeVoiceMapWake');
    const wakeKey=$('homeVoiceMapWakeKey');
    const phraseList=homeVoiceWakePhrases();
    const phrase=phraseList[0]||'';
    const wakeCloud=$('homeVoiceWakePhraseCloud');
    if(wakeCloud){
      renderPhraseCloud(wakeCloud,loading?[]:phraseList,{
        emptyText:loading?t('homeLiveLoading'):t('homeLiveUnset'),
        mode:'wake'
      });
    }
    if(wakeKey){
      wakeKey.classList.toggle('is-set',!loading&&!!phrase);
      wakeKey.classList.toggle('is-empty',!loading&&!phrase);
    }
    if(wakeStep){
      wakeStep.classList.toggle('is-listening',!loading&&voiceOn&&running);
      wakeStep.classList.toggle('is-off',!loading&&!voiceOn);
    }
    renderHomeWakeStatusHint(loading);
    const modeSapiBtn=$('btnHomeVoiceModeSapi');
    const modeVoskBtn=$('btnHomeVoiceModeVosk');
    if(modeSapiBtn){
      modeSapiBtn.classList.toggle('is-active',eng!=='vosk');
      modeSapiBtn.disabled=recordingBusy||!!global.OneToneVoiceWake.isModeSwitchPending();
    }
    if(modeVoskBtn){
      modeVoskBtn.classList.toggle('is-active',eng==='vosk');
      modeVoskBtn.disabled=recordingBusy||!!global.OneToneVoiceWake.isModeSwitchPending();
    }
    const sapiQuick=$('homeVoiceSapiQuick');
    const conf=Number(sapiCfg.minConfidence==null?0.35:sapiCfg.minConfidence);
    if(sapiQuick) sapiQuick.hidden=true;
    const homeConf=$('homeVoiceSapiConfidence');
    const homeConfLabel=$('homeVoiceSapiConfidenceLabel');
    if(homeConf){
      if(document.activeElement!==homeConf) homeConf.value=String(conf);
      homeConf.disabled=recordingBusy;
    }
    if(homeConfLabel) homeConfLabel.textContent=t('voiceSapiSensitivity')+' '+conf.toFixed(2);
    const toggleBtn=$('btnHomeVoiceToggle');
    syncHomeEntryToggleBtn(toggleBtn,voiceOn,'homeLiveToggleWakeOff','homeLiveToggleWakeOn');
    if(toggleBtn) toggleBtn.disabled=!!global.OneToneVoiceWake.isSapiTogglePending()||!!global.OneToneVoiceWake.isVoskTogglePending()||recordingBusy;
    const voicePanel=$('homeLivePanelVoice');
    if(voicePanel) voicePanel.classList.toggle('is-entry-disabled',!loading&&!voiceOn);
    const endPhraseStep=$('homeVoiceMapEndPhrase');
    [wakeStep,endPhraseStep].forEach(function(el){
      if(!el) return;
      el.classList.toggle('is-clickable',!loading&&!recordingBusy);
    });
  }

  function renderHomeFinishZone(loading){
    const recordingBusy=hooks().getRecordingMode()!=='none';
    const cfg=state().config||{};
    const endCfg=cfg.voiceEnd||cfg.voice_end||{};
    const endSnap=hooks().voiceUiSnapshot.end||{};
    const enabled=!!endSnap.enabled||!!(endCfg&&endCfg.enabled);
    const autoOn=!!endSnap.autoSendEnabled||!!(endCfg&&endCfg.autoSendEnabled);
    const delayMs=endSnap.commitDelayMs!=null?endSnap.commitDelayMs:(endCfg&&endCfg.commitDelayMs!=null?endCfg.commitDelayMs:4000);
    const commitKey=String(endSnap.commitKey||endCfg.commitKey||endCfg.commit_key||'Enter').trim()||'Enter';
    const stateRaw=endSnap.state||'idle';
    const statusEl=$('homeFinishStatus');
    const endPhraseKey=$('homeVoiceMapEndPhraseKey');
    const endCloud=$('homeVoiceEndPhraseCloud');
    const endPhraseStep=$('homeVoiceMapEndPhrase');
    const statusLabel=loading?t('homeLiveLoading'):(endSnap.statusLabel||global.OneToneVoiceEnd.stateLabel(stateRaw));
    if(statusEl){
      statusEl.textContent=statusLabel;
      statusEl.classList.toggle('is-idle',!loading&&stateRaw==='idle');
    }
    if(!loading){
      global.OneToneVoiceEnd.syncToggle(enabled);
      global.OneToneVoiceEnd.syncAutoSendToggle(autoOn);
    }
    const endToggle=$('btnHomeEndToggle');
    const autoToggle=$('btnHomeEndAutoSend');
    if(autoToggle) autoToggle.disabled=recordingBusy||loading;
    const autoSummary=$('homeFinishAutoSummary');
    if(autoSummary) autoSummary.textContent=loading?t('homeLiveLoading'):(autoOn?t('voiceEndAutoSendOn'):t('voiceEndAutoSendOff'));
    const endSummary=$('homeFinishEndSummary');
    const endDetail=$('homeFinishEndDetail');
    const delayLine=$('homeVoiceEndDelayLine');
    if(delayLine) delayLine.textContent=t('voiceEndDelay')+'：'+t('voiceEndDelayMs').replace('{n}',String(delayMs));
    global.OneToneVoiceEnd.syncModeUi(true);
    const lite=global.OneToneVoiceEnd.uiUsesLiteMode(true);
    const liteBadge=$('homeFinishEndLiteBadge');
    if(liteBadge){
      liteBadge.hidden=!lite;
      liteBadge.textContent=t('voiceEndNeedVoskShort');
    }
    if(endToggle) endToggle.disabled=recordingBusy||loading||lite;
    const autoMeta=$('homeVoiceEndAutoMeta');
    if(autoMeta){
      if(loading) autoMeta.innerHTML='';
      else{
        const statusText=autoOn
          ?(t('voiceEndAutoSendOn')+' · '+t('voiceEndDelayMs').replace('{n}',String(delayMs))+' · '+commitKey)
          :t('voiceEndAutoSendOff');
        autoMeta.innerHTML='<div class="home-step-meta-chips">'+renderHomeStatusMetaItem(t('homeLiveEndAutoShort'),autoOn,statusText)+'</div>';
      }
    }
    if(endPhraseStep){
      endPhraseStep.classList.toggle('is-lite-locked',lite);
      endPhraseStep.classList.toggle('is-clickable',!loading&&!recordingBusy);
    }
    const phraseList=homeVoiceEndPhrases();
    const detail=phraseList.join(' / ');
    if(endCloud){
      if(loading){
        renderPhraseCloud(endCloud,[],{emptyText:t('homeLiveLoading')});
      }else if(lite){
        renderPhraseCloud(endCloud,[],{emptyText:t('homeVoiceMapEndLite'),liteLocked:true});
      }else if(enabled&&phraseList.length){
        renderPhraseCloud(endCloud,phraseList);
      }else if(enabled){
        renderPhraseCloud(endCloud,[],{emptyText:t('homeLiveEndWord')});
      }else{
        renderPhraseCloud(endCloud,phraseList.length?phraseList:[],{
          emptyText:t('homeVoiceMapEndPhraseOff')
        });
      }
    }
    if(endPhraseKey){
      endPhraseKey.classList.toggle('is-set',!loading&&!lite&&enabled&&!!phraseList.length);
      endPhraseKey.classList.toggle('is-empty',!loading&&(lite||!enabled||!phraseList.length));
    }
    if(loading){
      if(endSummary) endSummary.textContent=t('homeLiveLoading');
      if(endDetail) endDetail.textContent=t('homeLiveLoading');
    }else if(lite){
      if(endSummary) endSummary.textContent=t('homeFinishEndLiteSummary');
      if(endDetail) endDetail.textContent=t('homeFinishEndLiteDetail');
    }else{
      if(endSummary) endSummary.textContent=enabled?t('voiceEndEnabledShort'):t('voiceEndDisabledShort');
      if(endDetail) endDetail.textContent=detail||t('endPhrasesEmpty');
    }
    hooks().renderVoiceSettingsFlow(loading);
  }
  function renderHomeLiveZone(){
    try{
      const loading=!hooks().configLoadedFromBackend();
      hooks().syncGlobalMasterUi();
      renderHomeLiveKeyPanel(loading);
      renderHomeLiveVoicePanel(loading);
      renderHomeFinishZone(loading);
      hooks().refreshHomeGuideIfOpen();
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
    voiceEndPhrases:homeVoiceEndPhrases,
    voiceEngineOn:homeVoiceEngineOn,
  syncEntryToggleBtn:syncHomeEntryToggleBtn,
    renderKeyPanel:renderHomeLiveKeyPanel,
    renderVoicePanel:renderHomeLiveVoicePanel,
    renderFinishZone:renderHomeFinishZone,
    renderZone:renderHomeLiveZone,
    wakeHeardLabel:homeWakeHeardLabel
  };
})((typeof window!=='undefined')?window:globalThis);
