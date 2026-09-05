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
    const kwsCfg=cfg.voiceKws||cfg.voice_kws;
    const endCfg=cfg.voiceEnd||cfg.voice_end;
    const w=hooks().voiceUiSnapshot.wake||{};
    const voiceOnLive=w.engine==='vosk'||w.engine==='sapi'||w.engine==='kws';
    const voiceOnCfg=!!(voskCfg&&voskCfg.enabled)||!!(sapiCfg&&sapiCfg.enabled)||!!(kwsCfg&&kwsCfg.enabled);
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
      const eng=(w.engine==='vosk'||(!w.engine&&voskCfg&&voskCfg.enabled))?t('wakeEngineVosk')
        :(w.engine==='kws'||(!w.engine&&kwsCfg&&kwsCfg.enabled))?t('wakeEngineKws')
        :t('wakeEngineSapi');
      const phrase=w.phrase||((voskCfg&&voskCfg.enabled&&voskCfg.phrases&&voskCfg.phrases[0])||(sapiCfg&&sapiCfg.enabled&&sapiCfg.phrases&&sapiCfg.phrases[0])||(kwsCfg&&kwsCfg.enabled&&kwsCfg.phrases&&kwsCfg.phrases[0])||'');
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
    // ── target action sequence (added 2026-09) ──
    // When `mapping.targetActions` is non-empty and has >1 step, show a stacked
    // list instead of the single keycap. Single Key / empty still uses the
    // original keycap so the rest of the home layout stays unchanged.
    // Home is now an editable surface: ▲▼ reorder, × remove, + add (3 types).
    // Each click calls `cmd_mapping_set_target_actions` to persist.
    var actsEl=$('homeKeyMapTargetActions');
    var acts=effectiveTargetActions(m);
    var canEdit=!!m && !loading && !busy;
    if(actsEl){
      if(acts.length>=1){
        actsEl.hidden=false;
        if(tgtEl) tgtEl.hidden=true;
        var rows=acts.map(function(a,i){ return buildActionRowHtml(a, i, acts.length, canEdit); }).join('');
        var addRow=canEdit
          ? '<div class="home-key-map-action-addrow">'
            + '<button type="button" class="home-key-map-action-add" data-add="key">'+escHtml(t('homeKeyMapActionTypeKey'))+' +</button>'
            + '<button type="button" class="home-key-map-action-add" data-add="record">⏺ '+escHtml(t('homeKeyMapActionRecord'))+' +</button>'
            + '<button type="button" class="home-key-map-action-add" data-add="text">'+escHtml(t('homeKeyMapActionTypeText'))+' +</button>'
            + '<button type="button" class="home-key-map-action-add" data-add="delay">'+escHtml(t('homeKeyMapActionTypeDelay'))+' +</button>'
            + '</div>'
          : '';
        var moreRow=acts.length>1
          ? '<div class="home-key-map-action-more">'+escHtml(t('homeKeyMapActionMore').replace('{n}',acts.length))+'</div>'
          : '';
        actsEl.innerHTML=rows+addRow+moreRow;
        if(canEdit) wireTargetActionsHandlers(actsEl, m);
      } else {
        actsEl.hidden=true;
        actsEl.innerHTML='';
        if(tgtEl) tgtEl.hidden=false;
      }
    }
    if(trigHint) trigHint.hidden=!!tgt || acts.length>0;
    if(tgtHint){
      tgtHint.hidden=!!tgt || acts.length>0;
    }
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
  // ── target action sequence helpers (added 2026-09) ──
  function effectiveTargetActions(m){
    if(!m) return [];
    if(Array.isArray(m.targetActions)&&m.targetActions.length){
      return m.targetActions.map(function(a){
        return {type:a.type||'key',value:a.value,ms:a.ms};
      });
    }
    var tk=String(m.targetKey||'').trim();
    return tk?[{type:'key',value:tk}]:[];
  }
  function escHtml(s){
    if(typeof s!=='string') return '';
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
  function syncTargetKeyFromActions(m, next){
    if(!m) return;
    m.targetActions = Array.isArray(next) ? next.slice() : [];
    var firstKey = null;
    for(var i=0;i<m.targetActions.length;i++){
      var a=m.targetActions[i];
      if(a&&a.type==='key'&&String(a.value||'').trim()){ firstKey=String(a.value).trim(); break; }
    }
    m.targetKey = firstKey || '';
  }
  // Numbered action row: type badge + readable body + always-visible ▲▼×.
  function buildActionRowHtml(a, i, total, canEdit){
    var typ = a&&a.type ? String(a.type) : '';
    var badge = '·';
    var typeLbl = '';
    var body = '';
    var editHint = '';
    if(typ==='key'){
      badge='⌨'; typeLbl=t('homeKeyMapActionTypeKey');
      body=escHtml(hooks().friendlyKeyName(a.value||''));
      editHint=' data-edit="key"';
    } else if(typ==='text'){
      badge='A'; typeLbl=t('homeKeyMapActionTypeText');
      body=escHtml(a.value||'');
      editHint=' data-edit="text"';
    } else if(typ==='delay'){
      badge='⏱'; typeLbl=t('homeKeyMapActionTypeDelay');
      body=escHtml(String(a.ms||0)+' ms');
      editHint=' data-edit="delay"';
    } else {
      typeLbl=escHtml(typ||'?');
      body='';
    }
    var upDis = !canEdit || i<=0;
    var downDis = !canEdit || i>=total-1;
    var moveUp = canEdit
      ? '<button type="button" class="home-key-map-action-btn" data-act="up" data-idx="'+i+'"'
        +(upDis?' disabled':'')
        +' title="'+escHtml(t('homeKeyMapActionUp'))+'" aria-label="'+escHtml(t('homeKeyMapActionUp'))+'">▲</button>'
      : '';
    var moveDown = canEdit
      ? '<button type="button" class="home-key-map-action-btn" data-act="down" data-idx="'+i+'"'
        +(downDis?' disabled':'')
        +' title="'+escHtml(t('homeKeyMapActionDown'))+'" aria-label="'+escHtml(t('homeKeyMapActionDown'))+'">▼</button>'
      : '';
    var del = canEdit
      ? '<button type="button" class="home-key-map-action-btn is-del" data-act="del" data-idx="'+i+'" title="'+escHtml(t('homeKeyMapActionDelete'))+'" aria-label="'+escHtml(t('homeKeyMapActionDelete'))+'">×</button>'
      : '';
    return '<div class="home-key-map-action-row is-'+escHtml(typ||'unknown')+'" data-idx="'+i+'">'
      +'<span class="home-key-map-action-idx">'+(i+1)+'</span>'
      +'<span class="home-key-map-action-type" aria-hidden="true"><span class="home-key-map-action-badge is-'+escHtml(typ||'unknown')+'">'+badge+'</span></span>'
      +'<span class="home-key-map-action-body">'
      +'<span class="home-key-map-action-kind">'+escHtml(typeLbl)+'</span>'
      +'<span class="home-key-map-action-lbl"'+editHint+(editHint?' title="'+escHtml(t('homeKeyMapActionEditHint'))+'"':'')+'>'+body+'</span>'
      +'</span>'
      +'<span class="home-key-map-action-acts">'+moveUp+moveDown+del+'</span>'
      +'</div>';
  }

  // Persist via dedicated IPC; on ACL / missing-cmd failure fall back to cmd_save
  // so the list still sticks before a rebuild picks up the new permission.
  function commitTargetActions(mappingId, actions){
    var invoke = global.OneToneIpc&&global.OneToneIpc.invoke
      ? global.OneToneIpc.invoke('cmd_mapping_set_target_actions', { id: mappingId, targetActions: actions })
      : Promise.reject(new Error('ipc unavailable'));
    return invoke.catch(function(err){
      var msg = String(err&&err.message||err||'');
      if(/ACL|not allowed|not found|unknown/i.test(msg)){
        var persist = global.OneToneConfigPersist;
        if(persist&&typeof persist.save==='function'){
          return persist.save({ source:'mapping' });
        }
      }
      return Promise.reject(err);
    });
  }

  // Optimistic UI first, then persist — ACL failures must not blank the list.
  function applyAndRefresh(m, next){
    if(!m||!m.id) return Promise.resolve(null);
    syncTargetKeyFromActions(m, next);
    if(global.OneToneState&&global.OneToneState.state&&typeof global.OneToneState.state.render==='function'){
      try{ global.OneToneState.state.render(); }catch(_){ }
    }
    var keysEl=document.getElementById('keysCaptureTargetActions');
    if(keysEl && keysEl.classList.contains('is-keys-variant')){
      try{ renderTargetActionsInto(keysEl, m, { mode:'picker', variant:'keys' }); }catch(_){ }
    }
    var picker=global.OneToneKeysChannelCommandPicker;
    if(picker&&picker.refreshKeysCustomKeyMatchList){
      try{ picker.refreshKeysCustomKeyMatchList(); }catch(_){ }
    }
    // Keep 02 recognition preview in sync with the edited match sequence.
    if(picker&&picker.applyHero){
      try{ picker.applyHero(); }catch(_){ }
    }
    if(global.OneToneKeysPageNav&&global.OneToneKeysPageNav.renderStepHints){
      try{ global.OneToneKeysPageNav.renderStepHints(); }catch(_){ }
    }
    return commitTargetActions(m.id, next).catch(function(err){
      try{ console.error('targetActions persist failed', err); }catch(_){ }
      return null;
    });
  }

  // Ask the user for a chord string.  Prefers the targetKeyPicker (with the
  // searchable chord catalog + manual record) when available; falls back to
  // a plain `prompt()` so dev / headless / pickers-missing environments still
  // work.
  function pickKeyChord(onPicked){
    var picker=global.OneToneTargetKeyPicker;
    if(picker&&picker.openWithCallback){
      picker.openWithCallback(function(chord){
        onPicked(String(chord||'').trim());
      });
      return;
    }
    var v=(global.prompt||window.prompt)(t('homeKeyMapActionPromptKey'),'Enter')||'';
    onPicked(v.trim());
  }

  // Lightweight inline key recorder for the home page.  Pops a translucent
  // modal, listens for the next non-modifier keydown, joins modifiers + key
  // into a `Ctrl+Shift+D` style chord, then fires the callback.  Esc cancels.
  // Independent from the picker so non-settings callers can record without
  // touching the settings recording state machine.
  function recordChordInline(onRecorded){
    var doc=document;
    var overlay=doc.createElement('div');
    overlay.className='home-record-overlay';
    overlay.setAttribute('role','dialog');
    overlay.setAttribute('aria-modal','true');
    overlay.innerHTML='<div class="home-record-card">'
      +'<div class="home-record-card-h">'+(global.OneToneI18n&&global.OneToneI18n.t?t('homeKeyMapActionRecordTitle'):'Record a key combo')+'</div>'
      +'<div class="home-record-card-p">'+(global.OneToneI18n&&global.OneToneI18n.t?t('homeKeyMapActionRecordHint'):'Press the key combo you want — Esc to cancel')+'</div>'
      +'<div class="home-record-card-kbd" id="homeRecordCardKbd">—</div>'
      +'</div>';
    doc.body.appendChild(overlay);
    var kbdEl=overlay.querySelector('#homeRecordCardKbd');
    var cleanup=function(){
      doc.removeEventListener('keydown',onKey,true);
      doc.removeEventListener('keyup',onKeyUp,true);
      if(overlay.parentNode) overlay.parentNode.removeChild(overlay);
    };
    var renderChord=function(parts){
      if(kbdEl) kbdEl.textContent=parts.length?parts.join('+'):'—';
    };
    var isMod=function(k){ return k==='Control'||k==='Shift'||k==='Alt'||k==='Meta'; };
    var modName=function(k){
      if(k==='Control') return 'Ctrl';
      if(k==='Meta') return 'Win';
      return k.charAt(0).toUpperCase()+k.slice(1);
    };
    var onKeyUp=function(ev){
      // Live preview: show modifier-only state when no main key yet.
      if(isMod(ev.key)) return;
    };
    var onKey=function(ev){
      if(ev.key==='Escape'){ ev.preventDefault(); cleanup(); onRecorded(''); return; }
      if(isMod(ev.key)){
        ev.preventDefault();
        var p=[];
        if(ev.ctrlKey) p.push('Ctrl');
        if(ev.altKey) p.push('Alt');
        if(ev.shiftKey) p.push('Shift');
        if(ev.metaKey) p.push('Win');
        renderChord(p);
        return;
      }
      ev.preventDefault();
      ev.stopPropagation();
      var p=[];
      if(ev.ctrlKey) p.push('Ctrl');
      if(ev.altKey) p.push('Alt');
      if(ev.shiftKey) p.push('Shift');
      if(ev.metaKey) p.push('Win');
      var main=ev.key;
      if(main===' ') main='Space';
      // Normalize single character keys to upper case so they match
      // voice-pilot's canonical `Ctrl+Enter` style chord names.
      if(main.length===1) main=main.toUpperCase();
      p.push(main);
      var chord=p.join('+');
      cleanup();
      onRecorded(chord);
    };
    doc.addEventListener('keydown',onKey,true);
    doc.addEventListener('keyup',onKeyUp,true);
  }

  function pickKeyChordViaRecord(onPicked){
    recordChordInline(function(chord){
      onPicked(String(chord||'').trim());
    });
  }

  // Wire click handlers for ▲/▼/×/+/+Key/+/Text/+/Delay buttons.  Re-renders
  // the home view on success.
  // `options.mode`:
  //   'picker' (default) — + key opens the chord catalog picker, + key
  //     dblclick edits via picker, + record opens picker+mini recorder.
  //   'prompt' — all chord input is via `prompt()` (no picker, no auto-
  //     recording).  Used by the keys panel "custom key" tab where the
  //     product wants the user to type the chord string explicitly.
  function wireTargetActionsHandlers(actsEl, m, options){
    options = options || {};
    var mode = options.mode || 'picker';
    if(!m||!m.id) return;
    var btns=actsEl.querySelectorAll('.home-key-map-action-btn, .home-key-map-action-add');
    btns.forEach(function(btn){
      if(btn.__wired) return;
      btn.__wired=true;
      btn.addEventListener('click', function(ev){
        ev.stopPropagation();
        ev.preventDefault();
        if(btn.disabled) return;
        var act=btn.getAttribute('data-act');
        var add=btn.getAttribute('data-add');
        var idx=parseInt(btn.getAttribute('data-idx')||'-1',10);
        var cur=effectiveTargetActions(m).slice();
        if(act==='up'&&idx>0){ var tmp=cur[idx-1]; cur[idx-1]=cur[idx]; cur[idx]=tmp; }
        else if(act==='down'&&idx>=0&&idx<cur.length-1){ var tmp=cur[idx+1]; cur[idx+1]=cur[idx]; cur[idx]=tmp; }
        else if(act==='del'&&idx>=0){ cur.splice(idx,1); }
        else if(add==='key'){
          if(mode==='prompt'){
            var v=(global.prompt||window.prompt)(t('homeKeyMapActionPromptKey'),'Ctrl+Enter')||'';
            v=v.trim(); if(v) cur.push({type:'key',value:v});
            applyAndRefresh(m, cur);
          } else {
            // Reuse the targetKeyPicker when available so the user gets
            // the searchable chord catalog + manual record.  Empty /
            // cancelled picks drop the operation entirely.
            pickKeyChord(function(chord){
              if(!chord) return;
              cur.push({type:'key',value:chord});
              applyAndRefresh(m, cur);
            });
          }
          return;
        }
        else if(add==='record'){
          if(mode==='prompt'){
            // Recording-style button is hidden in 'prompt' mode but the
            // defensive guard below prevents accidental click.
            return;
          }
          // Open the picker with a record-callback.  The user can either
          // tap a chord from the catalog (callback fires with the chord) or
          // tap the picker's "manual record" button which routes through
          // the home-page mini recorder.
          var picker=global.OneToneTargetKeyPicker;
          if(picker&&picker.openWithRecordCallback){
            picker.openWithRecordCallback(function(chord){
              if(!chord) return;
              cur.push({type:'key',value:chord});
              applyAndRefresh(m, cur);
            });
          } else {
            pickKeyChordViaRecord(function(chord){
              if(!chord) return;
              cur.push({type:'key',value:chord});
              applyAndRefresh(m, cur);
            });
          }
          return;
        }
        else if(add==='text'){ var v=(global.prompt||window.prompt)(t('homeKeyMapActionPromptText'),'')||''; v=v.trim(); if(v) cur.push({type:'text',value:v}); }
        else if(add==='delay'){ var v=(global.prompt||window.prompt)(t('homeKeyMapActionPromptDelay'),'200')||''; v=v.trim(); var n=parseInt(v,10); if(n>0) cur.push({type:'delay',ms:n}); }
        else { return; }
        applyAndRefresh(m, cur);
      });
    });
    // Double-click on row labels to edit that one step in place.
    var lbls=actsEl.querySelectorAll('.home-key-map-action-lbl[data-edit]');
    lbls.forEach(function(lbl){
      if(lbl.__wired) return;
      lbl.__wired=true;
      lbl.addEventListener('dblclick', function(ev){
        ev.stopPropagation();
        ev.preventDefault();
        var editKind=lbl.getAttribute('data-edit');
        var row=lbl.closest ? lbl.closest('.home-key-map-action-row') : lbl.parentElement;
        var idx=parseInt((row&&row.getAttribute('data-idx'))||'-1',10);
        if(idx<0) return;
        var cur=effectiveTargetActions(m).slice();
        var cur2=cur[idx];
        if(!cur2) return;
        var commitEdit=function(value){
          if(!value) return;
          if(editKind==='text'){ cur[idx]={type:'text',value:value}; }
          else if(editKind==='delay'){ cur[idx]={type:'delay',ms:value}; }
          applyAndRefresh(m, cur);
        };
        if(editKind==='text'){
          var v=(global.prompt||window.prompt)(t('homeKeyMapActionPromptTextEdit'), cur2.value||'')||'';
          v=v.trim();
          if(!v) return;
          commitEdit(v);
        } else if(editKind==='delay'){
          var v=(global.prompt||window.prompt)(t('homeKeyMapActionPromptDelayEdit'), String(cur2.ms||0))||'';
          v=v.trim();
          var n=parseInt(v,10);
          if(!n||n<=0) return;
          commitEdit(n);
        } else if(editKind==='key'){
          if(mode==='prompt'){
            var v=(global.prompt||window.prompt)(t('homeKeyMapActionPromptKeyEdit'), cur2.value||'')||'';
            v=v.trim();
            if(!v) return;
            cur[idx]={type:'key',value:v};
            applyAndRefresh(m, cur);
          } else {
            pickKeyChord(function(chord){
              if(!chord) return;
              cur[idx]={type:'key',value:chord};
              applyAndRefresh(m, cur);
            });
          }
        } else { return; }
      });
    });
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
    if(eng==='kws'){
      const kwsCfg=cfg.voiceKws||cfg.voice_kws||{};
      const fromSnap=Array.isArray(w.kws&&w.kws.phrases)?hooks().cloneStringList(w.kws.phrases):[];
      if(fromSnap.length) return fromSnap;
      return hooks().cloneStringList(kwsCfg.phrases||[]);
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
    if(global.OneToneVoiceWake&&global.OneToneVoiceWake.isModeSwitchPending&&global.OneToneVoiceWake.isModeSwitchPending()){
      const pending=global.OneToneVoiceWake.getExpandedMode();
      if(pending==='kws'||pending==='vosk'||pending==='sapi') return pending;
    }
    const cfg=state().config||{};
    const strategy=String(cfg.voiceListeningStrategy||cfg.voice_listening_strategy||'').trim();
    if(strategy==='off') return 'off';
    const voskCfg=cfg.voiceVosk||cfg.voice_vosk||{};
    const sapiCfg=cfg.voiceSapi||cfg.voice_sapi||{};
    const kwsCfg=cfg.voiceKws||cfg.voice_kws||{};
    const w=hooks().voiceUiSnapshot.wake||{};
    if(kwsCfg.enabled&&!voskCfg.enabled&&!sapiCfg.enabled) return 'kws';
    if(voskCfg.enabled&&!kwsCfg.enabled&&!sapiCfg.enabled) return 'vosk';
    if(sapiCfg.enabled&&!voskCfg.enabled&&!kwsCfg.enabled) return 'sapi';
    if(w.engine==='vosk'||voskCfg.enabled) return 'vosk';
    if(w.engine==='sapi'||sapiCfg.enabled) return 'sapi';
    if(w.engine==='kws'||kwsCfg.enabled) return 'kws';
    return 'off';
  }
  function homeVoiceEngineUiMode(){
    const runtimeEng=homeVoiceEngineOn();
    if(runtimeEng!=='off') return runtimeEng;
    if(global.OneToneVoiceWake){
      if(global.OneToneVoiceWake.isModeSwitchPending()){
        const pending=global.OneToneVoiceWake.getExpandedMode();
        if(pending==='vosk'||pending==='sapi'||pending==='kws') return pending;
      }
      const expanded=global.OneToneVoiceWake.getExpandedMode();
      if(expanded==='vosk'||expanded==='sapi'||expanded==='kws') return expanded;
    }
    const cfg=state().config||{};
    const voskCfg=cfg.voiceVosk||cfg.voice_vosk||{};
    if(voskCfg.enabled) return 'vosk';
    if(global.OneToneVoiceEngineReadiness&&global.OneToneVoiceEngineReadiness.isVoskOnlyUi()) return 'vosk';
    return 'vosk';
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

  // Expose the inline key recorder globally so non-settings callers (e.g. the
  // target-key-picker "manual record" button in callback mode) can reuse it
  // without going through the settings recording state machine.
  global.OneToneHomeRecordChord=recordChordInline;

  // Full target-actions editor exposed for non-home callers (e.g. the keys
  // panel "custom key" tab).  Renders a full A-list with ▲▼× buttons,
  // 4 add buttons (key / record / text / delay), double-click inline edit,
  // and IPC persistence — all into `container`.  Re-renders on every call.
  // Reuses the same pickers (targetKeyPicker.openWithCallback /
  // .openWithRecordCallback) and the home mini recorder via
  // `OneToneHomeRecordChord`.
  //
  // Options:
  //   readOnly: render read-only, no buttons
  //   mode: 'picker' (default) | 'prompt' — picker reuses targetKeyPicker +
  //         mini recorder; prompt reuses plain `prompt()` so the user types
  //         chord / text / ms themselves without any recording.
  //   variant: 'keys' — larger empty state + add tiles for Keys「自定义键」tab.
  function renderTargetActionsInto(container, mapping, options){
    options = options || {};
    if(!container) return;
    var m = mapping;
    var acts = effectiveTargetActions(m);
    var canEdit = !!m && !!m.id && !options.readOnly;
    var mode = options.mode || 'picker';
    var isKeys = options.variant === 'keys';
    var showRecordBtn = (mode === 'picker');
    container.classList.toggle('is-keys-variant', isKeys);
    var buildAddRow = function(){
      if(!canEdit) return '';
      var cls = isKeys ? 'home-key-map-action-add is-tile' : 'home-key-map-action-add';
      var parts = '';
      if(showRecordBtn){
        parts += '<button type="button" class="'+cls+'" data-add="record">'
          + (isKeys
            ? '<span class="home-key-map-action-add-ico" aria-hidden="true">⏺</span><span class="home-key-map-action-add-lbl">'+escHtml(t('keysCaptureSeqAddRecord','录制快捷键'))+'</span>'
            : '⏺ '+escHtml(t('homeKeyMapActionRecord'))+' +')
          + '</button>';
      }
      parts += '<button type="button" class="'+cls+'" data-add="key">'
        + (isKeys
          ? '<span class="home-key-map-action-add-ico" aria-hidden="true">⌨</span><span class="home-key-map-action-add-lbl">'+escHtml(t('keysCaptureSeqAddKey','选择按键'))+'</span>'
          : escHtml(t('homeKeyMapActionTypeKey'))+' +')
        + '</button>';
      parts += '<button type="button" class="'+cls+'" data-add="text">'
        + (isKeys
          ? '<span class="home-key-map-action-add-ico" aria-hidden="true">A</span><span class="home-key-map-action-add-lbl">'+escHtml(t('keysCaptureSeqAddText','填入文本'))+'</span>'
          : escHtml(t('homeKeyMapActionTypeText'))+' +')
        + '</button>';
      parts += '<button type="button" class="'+cls+'" data-add="delay">'
        + (isKeys
          ? '<span class="home-key-map-action-add-ico" aria-hidden="true">⏱</span><span class="home-key-map-action-add-lbl">'+escHtml(t('keysCaptureSeqAddDelay','延迟'))+'</span>'
          : escHtml(t('homeKeyMapActionTypeDelay'))+' +')
        + '</button>';
      return '<div class="home-key-map-action-addrow'+(isKeys?' is-tiles':'')+'">'+parts+'</div>';
    };
    if(acts.length >= 1){
      container.hidden = false;
      var rows = acts.map(function(a, i){ return buildActionRowHtml(a, i, acts.length, canEdit); }).join('');
      var moreRow = acts.length>1
        ? '<div class="home-key-map-action-more">'+escHtml(t('homeKeyMapActionMore').replace('{n}',acts.length))+'</div>'
        : '';
      container.innerHTML = '<div class="home-key-map-action-list">'+rows+'</div>'+buildAddRow()+moreRow;
      if(canEdit) wireTargetActionsHandlers(container, m, { mode: mode });
    } else {
      container.hidden = false;
      var emptyHtml = isKeys
        ? ('<div class="home-key-map-action-empty is-keys">'
          + '<b>'+escHtml(t('keysCaptureSeqEmptyTitle','还没有动作'))+'</b>'
          + '<span>'+escHtml(t('keysCaptureSeqEmptyBody','添加录制快捷键、文本或延迟；按一次启动键会依次执行。'))+'</span>'
          + '</div>')
        : ('<div class="home-key-map-action-empty">'
          + escHtml(t('homeKeyMapActionEmpty', '还没添加动作 — 下方选一个开始'))
          + '</div>');
      container.innerHTML = emptyHtml + buildAddRow();
      if(canEdit) wireTargetActionsHandlers(container, m, { mode: mode });
    }
  }

  global.OneToneHomeTargetActions = {
    render: renderTargetActionsInto,
    effective: effectiveTargetActions
  };
})((typeof window!=='undefined')?window:globalThis);
