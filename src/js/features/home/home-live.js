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
            + '<button type="button" class="home-key-map-action-add" data-add="open-file">'+escHtml(t('keysCaptureSeqAddOpenFile','文件'))+' +</button>'
            + '<button type="button" class="home-key-map-action-add" data-add="open-folder">'+escHtml(t('keysCaptureSeqAddOpenFolder','文件夹'))+' +</button>'
            + '<button type="button" class="home-key-map-action-add" data-add="open-url">'+escHtml(t('keysCaptureSeqAddOpenUrl','网址'))+' +</button>'
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
  function openKindLabel(kind){
    var k=String(kind||'file').toLowerCase();
    if(k==='folder') return t('keysCaptureSeqAddOpenFolder','文件夹');
    if(k==='url') return t('keysCaptureSeqAddOpenUrl','网址');
    return t('keysCaptureSeqAddOpenFile','文件');
  }
  function openKindPlaceholder(kind){
    var k=String(kind||'file').toLowerCase();
    if(k==='folder') return t('keysCaptureSeqOpenFolderPh','文件夹路径，如 C:\\Users');
    if(k==='url') return t('keysCaptureSeqOpenUrlPh','https://…');
    return t('keysCaptureSeqOpenFilePh','文件路径，如 C:\\a.txt');
  }
  function normalizeOpenKind(kind){
    var k=String(kind||'file').toLowerCase();
    if(k==='folder'||k==='url') return k;
    return 'file';
  }
  function effectiveTargetActions(m){
    if(!m) return [];
    if(Array.isArray(m.targetActions)&&m.targetActions.length){
      return m.targetActions.map(function(a){
        return {type:a.type||'key',value:a.value,ms:a.ms,kind:a.kind};
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
    } else if(typ==='open'){
      badge='↗';
      typeLbl=openKindLabel(a&&a.kind);
      body=escHtml(a.value||'')||escHtml(t('keysCaptureSeqOpenEmpty','未填写'));
      editHint=' data-edit="open"';
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

  var KEYS_DELAY_PRESETS = [100, 200, 500, 1000];
  var KEYS_SEQ_RECENT_LS = 'onetone.keys.seq.recentKinds';
  var keysSeqAddMenuOpen = false;

  function loadKeysSeqRecent(){
    try{
      var raw=localStorage.getItem(KEYS_SEQ_RECENT_LS);
      var arr=raw?JSON.parse(raw):[];
      return Array.isArray(arr)?arr.filter(function(id){
        return /^(key|text|delay|open-file|open-folder|open-url)$/.test(String(id));
      }).slice(0,5):[];
    }catch(_){ return []; }
  }
  function pushKeysSeqRecent(kind){
    var id=String(kind||'');
    if(!id) return;
    var arr=loadKeysSeqRecent().filter(function(x){ return x!==id; });
    arr.unshift(id);
    try{ localStorage.setItem(KEYS_SEQ_RECENT_LS, JSON.stringify(arr.slice(0,5))); }catch(_){}
  }
  function keysSeqRecentLabel(kind){
    if(kind==='key') return t('keysCaptureSeqAddKey','按键');
    if(kind==='text') return t('keysCaptureSeqAddText','文本');
    if(kind==='delay') return t('keysCaptureSeqAddDelay','延迟');
    if(kind==='open-file') return t('keysCaptureSeqAddOpenFile','文件');
    if(kind==='open-folder') return t('keysCaptureSeqAddOpenFolder','文件夹');
    if(kind==='open-url') return t('keysCaptureSeqAddOpenUrl','网址');
    return kind;
  }
  var keysInlineListen = { mappingId: '', idx: -1, onKey: null };

  function stopKeysInlineListen(){
    if(keysInlineListen.onKey){
      try{ document.removeEventListener('keydown', keysInlineListen.onKey, true); }catch(_){}
    }
    keysInlineListen.mappingId = '';
    keysInlineListen.idx = -1;
    keysInlineListen.onKey = null;
  }

  function startKeysInlineListen(m, idx){
    stopKeysInlineListen();
    if(!m||!m.id||idx<0) return;
    keysInlineListen.mappingId = String(m.id);
    keysInlineListen.idx = idx;
    var isMod=function(k){ return k==='Control'||k==='Shift'||k==='Alt'||k==='Meta'; };
    keysInlineListen.onKey=function(ev){
      if(ev.key==='Escape'){
        ev.preventDefault();
        stopKeysInlineListen();
        renderTargetActionsInto(
          document.getElementById('keysCaptureTargetActions'),
          m,
          { mode:'picker', variant:'keys' }
        );
        return;
      }
      if(isMod(ev.key)){ ev.preventDefault(); return; }
      ev.preventDefault();
      ev.stopPropagation();
      var p=[];
      if(ev.ctrlKey) p.push('Ctrl');
      if(ev.altKey) p.push('Alt');
      if(ev.shiftKey) p.push('Shift');
      if(ev.metaKey) p.push('Win');
      var main=ev.key===' '?'Space':ev.key;
      if(main.length===1) main=main.toUpperCase();
      p.push(main);
      var chord=p.join('+');
      var listenIdx=keysInlineListen.idx;
      stopKeysInlineListen();
      var cur=effectiveTargetActions(m).slice();
      if(!cur[listenIdx]) return;
      cur[listenIdx]={type:'key',value:chord};
      applyAndRefresh(m, cur);
    };
    document.addEventListener('keydown', keysInlineListen.onKey, true);
  }

  // Keys desk: row body IS the editor (no sheet / catalog).
  function buildKeysInlineRowHtml(a, i, total, canEdit, listening){
    var typ=a&&a.type?String(a.type):'';
    var kind=typ==='key'
      ? t('keysCaptureSeqAddKey','按键')
      : typ==='text'
        ? t('keysCaptureSeqAddText','文本')
        : typ==='open'
          ? openKindLabel(a&&a.kind)
          : t('keysCaptureSeqAddDelay','延迟');
    var body='';
    if(typ==='key'){
      var empty=!String(a&&a.value||'').trim();
      var label=listening
        ? t('keysCaptureSeqListening','按下组合键…')
        : empty
          ? t('keysCaptureSeqTapRecord','点此录制按键')
          : (hooks().friendlyKeyName(a.value)||a.value);
      body='<button type="button" class="keys-seq-key-chip'
        +(empty&&!listening?' is-empty':'')
        +(listening?' is-listen':'')
        +'" data-inline-rec="'+i+'">'
        +escHtml(label)
        +'</button>';
    } else if(typ==='text'){
      body='<textarea class="keys-seq-text-in" rows="1" data-inline-text="'+i+'"'
        +' placeholder="'+escHtml(t('keysActionTextSheetField','文本内容'))+'">'
        +escHtml(a&&a.value||'')
        +'</textarea>';
    } else if(typ==='open'){
      var okind=normalizeOpenKind(a&&a.kind);
      var sideBtns =
        okind === 'url'
          ? ('<button type="button" class="keys-seq-open-browse" data-inline-open-paste="'+i+'"'
            +' title="'+escHtml(t('keysCaptureSeqOpenPaste','粘贴'))+'">'
            +escHtml(t('keysCaptureSeqOpenPaste','粘贴'))
            +'</button>'
            +'<button type="button" class="keys-seq-open-browse" data-inline-open-bookmarks="'+i+'"'
            +' title="'+escHtml(t('keysCaptureSeqOpenBookmarks','收藏夹'))+'">'
            +escHtml(t('keysCaptureSeqOpenBookmarks','收藏夹'))
            +'</button>')
          : ('<button type="button" class="keys-seq-open-browse" data-inline-open-browse="'+i+'"'
            +' data-open-kind="'+escHtml(okind)+'"'
            +' title="'+escHtml(t('keysCaptureSeqOpenBrowse','浏览'))+'">'
            +escHtml(t('keysCaptureSeqOpenBrowse','浏览'))
            +'</button>');
      body='<div class="keys-seq-open-row">'
        +'<input type="text" class="keys-seq-open-in" data-inline-open="'+i+'"'
        +' data-open-kind="'+escHtml(okind)+'"'
        +' value="'+escHtml(a&&a.value||'')+'"'
        +' placeholder="'+escHtml(openKindPlaceholder(okind))+'" />'
        +sideBtns
        +'</div>';
    } else {
      var ms=Number(a&&a.ms)||200;
      var pills=KEYS_DELAY_PRESETS.map(function(preset){
        return '<button type="button" class="keys-seq-delay-pill'
          +(Math.abs(ms-preset)<1?' is-on':'')
          +'" data-inline-delay="'+i+'" data-ms="'+preset+'">'
          +(preset>=1000?(preset/1000)+'s':preset+'ms')
          +'</button>';
      }).join('');
      body='<div class="keys-seq-delay-pills">'+pills
        +'<input type="number" class="keys-seq-delay-custom" min="1" step="50" value="'+escHtml(String(ms))+'"'
        +' data-inline-delay-custom="'+i+'" aria-label="ms" />'
        +'<span class="keys-seq-delay-unit">ms</span></div>';
    }
    var upDis=!canEdit||i<=0;
    var downDis=!canEdit||i>=total-1;
    var acts=canEdit
      ? ('<button type="button" class="home-key-map-action-btn" data-act="up" data-idx="'+i+'"'
        +(upDis?' disabled':'')+' aria-label="'+escHtml(t('homeKeyMapActionUp'))+'">▲</button>'
        +'<button type="button" class="home-key-map-action-btn" data-act="down" data-idx="'+i+'"'
        +(downDis?' disabled':'')+' aria-label="'+escHtml(t('homeKeyMapActionDown'))+'">▼</button>'
        +'<button type="button" class="home-key-map-action-btn is-del" data-act="del" data-idx="'+i+'"'
        +' aria-label="'+escHtml(t('homeKeyMapActionDelete'))+'">×</button>')
      : '';
    return '<div class="home-key-map-action-row is-keys-inline is-'+escHtml(typ||'unknown')
      +(listening?' is-listen':'')
      +'" data-idx="'+i+'" role="listitem">'
      +'<span class="home-key-map-action-idx">'+(i+1)+'</span>'
      +'<span class="keys-seq-kind">'+escHtml(kind)+'</span>'
      +'<div class="keys-seq-body">'+body+'</div>'
      +'<span class="home-key-map-action-acts">'+acts+'</span>'
      +'</div>';
  }

  function wireKeysInlineHandlers(container, m){
    if(!container||!m||!m.id) return;
    container.__keysInlineMappingId = String(m.id);
    function resolveMapping(){
      var mid=String(container.__keysInlineMappingId||'');
      try{
        if(global.OneToneMappingCore&&global.OneToneMappingCore.byId){
          return global.OneToneMappingCore.byId(mid)||m;
        }
      }catch(_){}
      return m;
    }
    if(container.__keysInlineBound) return;
    container.__keysInlineBound=true;
    container.addEventListener('click', function(ev){
      if(!container.classList.contains('is-keys-inline')) return;
      var mapping=resolveMapping();
      if(!mapping||!mapping.id) return;
      var t=ev.target;
      var btn=t&&t.closest?t.closest('[data-act],[data-inline-rec],[data-inline-delay],[data-inline-open-browse],[data-inline-open-paste],[data-inline-open-bookmarks],[data-add],[data-add-toggle]'):null;
      if(!btn||!container.contains(btn)) return;
      // Let textareas / number inputs keep default focus behavior.
      if(btn.tagName==='TEXTAREA'||btn.tagName==='INPUT') return;
      ev.preventDefault();
      if(btn.getAttribute('data-add-toggle')){
        keysSeqAddMenuOpen=!keysSeqAddMenuOpen;
        renderTargetActionsInto(container, mapping, { mode:'picker', variant:'keys' });
        return;
      }
      var cur=effectiveTargetActions(mapping).slice();
      var act=btn.getAttribute('data-act');
      var idx=parseInt(btn.getAttribute('data-idx')||'-1',10);
      if(act==='up'&&idx>0){
        var tmp=cur[idx-1]; cur[idx-1]=cur[idx]; cur[idx]=tmp;
        stopKeysInlineListen();
        applyAndRefresh(mapping, cur);
        return;
      }
      if(act==='down'&&idx>=0&&idx<cur.length-1){
        var tmp2=cur[idx+1]; cur[idx+1]=cur[idx]; cur[idx]=tmp2;
        stopKeysInlineListen();
        applyAndRefresh(mapping, cur);
        return;
      }
      if(act==='del'&&idx>=0){
        cur.splice(idx,1);
        stopKeysInlineListen();
        applyAndRefresh(mapping, cur);
        return;
      }
      var rec=btn.getAttribute('data-inline-rec');
      if(rec!=null){
        var ri=parseInt(rec,10);
        startKeysInlineListen(mapping, ri);
        renderTargetActionsInto(container, mapping, { mode:'picker', variant:'keys' });
        return;
      }
      var delayBtn=btn.getAttribute('data-inline-delay');
      if(delayBtn!=null){
        var di=parseInt(delayBtn,10);
        var ms=parseInt(btn.getAttribute('data-ms')||'0',10);
        if(cur[di]&&ms>0){
          cur[di]={type:'delay',ms:ms};
          applyAndRefresh(mapping, cur);
        }
        return;
      }
      var browseBtn=btn.getAttribute('data-inline-open-browse');
      if(browseBtn!=null){
        var bi=parseInt(browseBtn,10);
        var bk=normalizeOpenKind(btn.getAttribute('data-open-kind')||(cur[bi]&&cur[bi].kind));
        if(bk==='url'||!cur[bi]) return;
        pickOpenValue(bk, String(cur[bi].value||''), function(v){
          if(!v) return;
          var next=effectiveTargetActions(mapping).slice();
          if(!next[bi]||next[bi].type!=='open') return;
          next[bi]={type:'open',kind:bk,value:v};
          applyAndRefresh(mapping, next);
        });
        return;
      }
      var pasteBtn=btn.getAttribute('data-inline-open-paste');
      if(pasteBtn!=null){
        var pi=parseInt(pasteBtn,10);
        if(!cur[pi]||cur[pi].type!=='open') return;
        readClipboardText(function(text){
          var v=String(text||'').trim();
          if(!v) return;
          var next=effectiveTargetActions(mapping).slice();
          if(!next[pi]||next[pi].type!=='open') return;
          next[pi]={type:'open',kind:'url',value:v};
          applyAndRefresh(mapping, next);
        });
        return;
      }
      var bmBtn=btn.getAttribute('data-inline-open-bookmarks');
      if(bmBtn!=null){
        var bmi=parseInt(bmBtn,10);
        if(!cur[bmi]||cur[bmi].type!=='open') return;
        pickBrowserBookmark(function(url){
          var v=String(url||'').trim();
          if(!v) return;
          var next=effectiveTargetActions(mapping).slice();
          if(!next[bmi]||next[bmi].type!=='open') return;
          next[bmi]={type:'open',kind:'url',value:v};
          applyAndRefresh(mapping, next);
        });
        return;
      }
      var add=btn.getAttribute('data-add');
      if(add==='key'){
        pushKeysSeqRecent('key');
        keysSeqAddMenuOpen=false;
        cur.push({type:'key',value:''});
        applyAndRefresh(mapping, cur).then(function(){
          startKeysInlineListen(mapping, cur.length-1);
          renderTargetActionsInto(container, mapping, { mode:'picker', variant:'keys' });
        });
        return;
      }
      if(add==='text'){
        pushKeysSeqRecent('text');
        keysSeqAddMenuOpen=false;
        cur.push({type:'text',value:''});
        applyAndRefresh(mapping, cur).then(function(){
          var ta=container.querySelector('[data-inline-text="'+(cur.length-1)+'"]');
          if(ta) ta.focus();
        });
        return;
      }
      if(add==='delay'){
        pushKeysSeqRecent('delay');
        keysSeqAddMenuOpen=false;
        cur.push({type:'delay',ms:200});
        applyAndRefresh(mapping, cur);
        return;
      }
      if(add==='open-file'||add==='open-folder'||add==='open-url'){
        pushKeysSeqRecent(add);
        keysSeqAddMenuOpen=false;
        var ok=add==='open-folder'?'folder':add==='open-url'?'url':'file';
        if(ok==='url'){
          cur.push({type:'open',kind:ok,value:''});
          applyAndRefresh(mapping, cur).then(function(){
            var inp=container.querySelector('[data-inline-open="'+(cur.length-1)+'"]');
            if(inp) inp.focus();
          });
          return;
        }
        pickOpenValue(ok, '', function(v){
          if(!v) return;
          cur.push({type:'open',kind:ok,value:v});
          applyAndRefresh(mapping, cur);
        });
        return;
      }
    });
    container.addEventListener('change', function(ev){
      if(!container.classList.contains('is-keys-inline')) return;
      var el=ev.target;
      if(!el||!el.getAttribute) return;
      var mapping=resolveMapping();
      var custom=el.getAttribute('data-inline-delay-custom');
      if(custom!=null){
        var ci=parseInt(custom,10);
        var n=parseInt(el.value,10);
        if(!(n>0)||!mapping) return;
        var cur=effectiveTargetActions(mapping).slice();
        if(!cur[ci]) return;
        cur[ci]={type:'delay',ms:n};
        applyAndRefresh(mapping, cur);
      }
    });
    container.addEventListener('input', function(ev){
      if(!container.classList.contains('is-keys-inline')) return;
      var el=ev.target;
      if(!el||el.getAttribute('data-inline-text')==null) return;
      el.style.height='auto';
      el.style.height=Math.min(120, el.scrollHeight)+'px';
    });
    container.addEventListener('focusout', function(ev){
      if(!container.classList.contains('is-keys-inline')) return;
      var el=ev.target;
      if(!el||!el.getAttribute) return;
      var mapping=resolveMapping();
      if(!mapping) return;
      var ti=el.getAttribute('data-inline-text');
      if(ti!=null){
        var tix=parseInt(ti,10);
        var cur=effectiveTargetActions(mapping).slice();
        if(!cur[tix]||cur[tix].type!=='text') return;
        var next=String(el.value||'');
        if(String(cur[tix].value||'')===next) return;
        cur[tix]={type:'text',value:next};
        applyAndRefresh(mapping, cur);
        return;
      }
      var oi=el.getAttribute('data-inline-open');
      if(oi!=null){
        var oix=parseInt(oi,10);
        var curO=effectiveTargetActions(mapping).slice();
        if(!curO[oix]||curO[oix].type!=='open') return;
        var nextO=String(el.value||'').trim();
        var kindO=normalizeOpenKind(el.getAttribute('data-open-kind')||curO[oix].kind);
        if(String(curO[oix].value||'')===nextO&&normalizeOpenKind(curO[oix].kind)===kindO) return;
        curO[oix]={type:'open',kind:kindO,value:nextO};
        applyAndRefresh(mapping, curO);
      }
    });
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

  // File/folder: native picker via cmd_pick_path; URL still prompts.
  function readClipboardText(onDone) {
    var clip = global.navigator && global.navigator.clipboard;
    if (clip && typeof clip.readText === 'function') {
      clip
        .readText()
        .then(function (text) {
          onDone(String(text || ''));
        })
        .catch(function () {
          onDone('');
        });
      return;
    }
    onDone('');
  }

  function escAttr(s) {
    return escHtml(String(s == null ? '' : s));
  }

  function pickBrowserBookmark(onPicked) {
    var invoke = global.OneToneIpc && global.OneToneIpc.invoke;
    if (typeof invoke !== 'function') {
      try {
        global.OneToneApp &&
          global.OneToneApp.toast &&
          global.OneToneApp.toast(
            t(
              'keysCaptureSeqBookmarksNeedApp',
              '需要在桌面版 OneTone 中打开（浏览器预览无法读取本机收藏夹）'
            )
          );
      } catch (_) {}
      onPicked('');
      return;
    }
    var existing = document.getElementById('keysBookmarkPickerOverlay');
    if (existing) existing.remove();

    var overlay = document.createElement('div');
    overlay.id = 'keysBookmarkPickerOverlay';
    overlay.className = 'keys-bookmark-picker-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.innerHTML =
      '<div class="keys-bookmark-picker-modal is-wide">' +
      '<div class="keys-bookmark-picker-head">' +
      '<div>' +
      '<div class="keys-bookmark-picker-title">' +
      escHtml(t('keysCaptureSeqBookmarksTitle', '从收藏夹选择')) +
      '</div>' +
      '<div class="keys-bookmark-picker-sub">' +
      escHtml(t('keysCaptureSeqBookmarksSub', '读取本机 Chrome / Edge 收藏夹')) +
      '</div>' +
      '</div>' +
      '<button type="button" class="keys-bookmark-picker-close" data-bm-close="1" aria-label="×">×</button>' +
      '</div>' +
      '<input type="search" class="keys-bookmark-picker-search" data-bm-search="1" placeholder="' +
      escAttr(t('keysCaptureSeqBookmarksSearch', '搜索标题或网址')) +
      '" />' +
      '<div class="keys-bookmark-picker-body">' +
      '<div class="keys-bookmark-picker-folders" data-bm-folders="1"></div>' +
      '<div class="keys-bookmark-picker-list" data-bm-list="1">' +
      '<div class="keys-bookmark-picker-empty">' +
      escHtml(t('keysCaptureSeqBookmarksLoading', '正在读取…')) +
      '</div>' +
      '</div>' +
      '</div>' +
      '</div>';

    var cache = [];
    var loadError = '';
    var activeFolder = '';

    function finish(url) {
      try {
        overlay.remove();
      } catch (_) {}
      onPicked(url || '');
    }

    function folderKey(it) {
      return String((it && it.folder) || '').trim() || t('keysCaptureSeqBookmarksUnfiled', '未分类');
    }

    // Sidebar: top category only (书签栏/自 → includes 书签栏/自/设计). Full paths are too many.
    function groupKey(it) {
      var parts = folderKey(it).split('/').filter(Boolean);
      if (!parts.length) return t('keysCaptureSeqBookmarksUnfiled', '未分类');
      if (parts.length === 1) return parts[0];
      return parts[0] + '/' + parts[1];
    }

    function groupLabel(key) {
      var parts = String(key || '').split('/').filter(Boolean);
      if (parts.length >= 2) return parts.slice(1).join('/');
      return key || t('keysCaptureSeqBookmarksUnfiled', '未分类');
    }

    function inActiveGroup(it) {
      if (!activeFolder) return true;
      var full = folderKey(it);
      return full === activeFolder || full.indexOf(activeFolder + '/') === 0;
    }

    function buildFolderCounts(items) {
      var map = {};
      for (var i = 0; i < items.length; i++) {
        var k = groupKey(items[i]);
        map[k] = (map[k] || 0) + 1;
      }
      return Object.keys(map)
        .sort(function (a, b) {
          return map[b] - map[a] || a.localeCompare(b, 'zh');
        })
        .map(function (k) {
          return { name: k, label: groupLabel(k), count: map[k] };
        });
    }

    function renderFolders(items) {
      var host = overlay.querySelector('[data-bm-folders]');
      if (!host) return;
      var rows = buildFolderCounts(items);
      var allLbl = t('keysCaptureSeqBookmarksAll', '全部');
      var html =
        '<button type="button" class="keys-bookmark-picker-folder' +
        (!activeFolder ? ' is-on' : '') +
        '" data-bm-folder="">' +
        escHtml(allLbl) +
        '<span class="keys-bookmark-picker-folder-n">' +
        items.length +
        '</span></button>';
      html += rows
        .map(function (row) {
          return (
            '<button type="button" class="keys-bookmark-picker-folder' +
            (activeFolder === row.name ? ' is-on' : '') +
            '" data-bm-folder="' +
            escAttr(row.name) +
            '" title="' +
            escAttr(row.name) +
            '">' +
            '<span class="keys-bookmark-picker-folder-lab">' +
            escHtml(row.label) +
            '</span>' +
            '<span class="keys-bookmark-picker-folder-n">' +
            row.count +
            '</span></button>'
          );
        })
        .join('');
      host.innerHTML = html;
    }

    function renderList(items, q) {
      var list = overlay.querySelector('[data-bm-list]');
      if (!list) return;
      var needle = String(q || '')
        .trim()
        .toLowerCase();
      var filtered = items.filter(function (it) {
        if (!inActiveGroup(it)) return false;
        if (!needle) return true;
        var hay =
          String(it.title || '').toLowerCase() +
          ' ' +
          String(it.url || '').toLowerCase() +
          ' ' +
          String(it.source || '').toLowerCase() +
          ' ' +
          String(it.folder || '').toLowerCase();
        return hay.indexOf(needle) >= 0;
      });
      if (!filtered.length) {
        var msg = loadError
          ? loadError
          : items.length
            ? t('keysCaptureSeqBookmarksNoMatch', '没有匹配的收藏')
            : t('keysCaptureSeqBookmarksEmpty', '未找到 Chrome / Edge 收藏夹');
        list.innerHTML =
          '<div class="keys-bookmark-picker-empty">' + escHtml(msg) + '</div>';
        return;
      }
      // Cap DOM nodes when browsing "全部" without search.
      var cap = needle || activeFolder ? 800 : 400;
      var shown = filtered.slice(0, cap);
      var more =
        filtered.length > shown.length
          ? '<div class="keys-bookmark-picker-more">' +
            escHtml(
              t('keysCaptureSeqBookmarksMore', '已显示 {n}/{total}，可用左侧分类或搜索缩小范围')
                .replace('{n}', String(shown.length))
                .replace('{total}', String(filtered.length))
            ) +
            '</div>'
          : '';
      list.innerHTML =
        shown
          .map(function (it) {
            return (
              '<button type="button" class="keys-bookmark-picker-item" data-bm-url="' +
              escAttr(it.url) +
              '">' +
              '<span class="keys-bookmark-picker-item-title">' +
              escHtml(it.title || it.url) +
              '</span>' +
              '<span class="keys-bookmark-picker-item-meta">' +
              escHtml(folderKey(it)) +
              ' · ' +
              escHtml(it.source || '') +
              ' · ' +
              escHtml(it.url || '') +
              '</span>' +
              '</button>'
            );
          })
          .join('') +
        more;
    }

    function refresh() {
      var search = overlay.querySelector('[data-bm-search]');
      renderFolders(cache);
      renderList(cache, search && search.value);
    }

    overlay.addEventListener('click', function (ev) {
      var el = ev.target;
      if (el === overlay || (el && el.getAttribute && el.getAttribute('data-bm-close'))) {
        finish('');
        return;
      }
      var folderBtn = el && el.closest ? el.closest('[data-bm-folder]') : null;
      if (folderBtn && overlay.contains(folderBtn)) {
        activeFolder = folderBtn.getAttribute('data-bm-folder') || '';
        refresh();
        return;
      }
      var item = el && el.closest ? el.closest('[data-bm-url]') : null;
      if (item && overlay.contains(item)) {
        finish(item.getAttribute('data-bm-url') || '');
      }
    });
    document.body.appendChild(overlay);
    var search = overlay.querySelector('[data-bm-search]');
    if (search) {
      search.addEventListener('input', function () {
        renderList(cache, search.value);
      });
      search.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') {
          e.preventDefault();
          finish('');
        }
      });
      setTimeout(function () {
        try {
          search.focus();
        } catch (_) {}
      }, 0);
    }

    invoke('cmd_list_browser_bookmarks')
      .then(function (rows) {
        loadError = '';
        cache = Array.isArray(rows) ? rows : [];
        refresh();
      })
      .catch(function () {
        loadError = t(
          'keysCaptureSeqBookmarksNeedApp',
          '需要在桌面版 OneTone 中打开（浏览器预览无法读取本机收藏夹）'
        );
        cache = [];
        refresh();
      });
  }

  function pickOpenValue(kind, seed, onPicked) {
    var k = normalizeOpenKind(kind);
    if (k === 'url') {
      var title = t('keysCaptureSeqOpenUrlPh', 'https://…');
      var v = (global.prompt || window.prompt)(title, seed || '') || '';
      onPicked(String(v).trim());
      return;
    }
    var invoke = global.OneToneIpc && global.OneToneIpc.invoke;
    if (typeof invoke === 'function') {
      invoke('cmd_pick_path', { kind: k })
        .then(function (path) {
          if (path == null || path === '') return;
          onPicked(String(path).trim());
        })
        .catch(function () {
          var fb =
            k === 'folder'
              ? t('keysCaptureSeqOpenFolderPh', '文件夹路径，如 C:\\Users')
              : t('keysCaptureSeqOpenFilePh', '文件路径，如 C:\\a.txt');
          var typed = (global.prompt || window.prompt)(fb, seed || '') || '';
          onPicked(String(typed).trim());
        });
      return;
    }
    var fallback =
      k === 'folder'
        ? t('keysCaptureSeqOpenFolderPh', '文件夹路径，如 C:\\Users')
        : t('keysCaptureSeqOpenFilePh', '文件路径，如 C:\\a.txt');
    var typed2 = (global.prompt || window.prompt)(fallback, seed || '') || '';
    onPicked(String(typed2).trim());
  }

  // Ask for inject text via in-app sheet (keys desk); fall back to prompt.
  function pickInjectText(seed, opts, onPicked) {
    opts = opts || {};
    var sheet = global.OneToneKeysActionInputSheet;
    if (sheet && sheet.openText) {
      sheet.openText(seed || '', opts).then(function (v) {
        onPicked(v == null ? '' : String(v));
      });
      return;
    }
    var key = opts.edit ? 'homeKeyMapActionPromptTextEdit' : 'homeKeyMapActionPromptText';
    var fb = opts.edit ? '编辑这段文本' : '输入要注入的文本';
    var v = (global.prompt || window.prompt)(t(key, fb), seed || '') || '';
    onPicked(String(v).trim());
  }

  // Ask for delay ms via in-app sheet; fall back to prompt.
  function pickDelayMs(seed, opts, onPicked) {
    opts = opts || {};
    var sheet = global.OneToneKeysActionInputSheet;
    if (sheet && sheet.openDelay) {
      sheet.openDelay(seed || 200, opts).then(function (n) {
        onPicked(n == null ? 0 : n);
      });
      return;
    }
    var key = opts.edit ? 'homeKeyMapActionPromptDelayEdit' : 'homeKeyMapActionPromptDelay';
    var fb = opts.edit ? '编辑延迟毫秒数' : '输入延迟毫秒数';
    var v = (global.prompt || window.prompt)(t(key, fb), String(seed || 200)) || '';
    var n = parseInt(String(v).trim(), 10);
    onPicked(n > 0 ? n : 0);
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
    var isKeys = options.variant === 'keys';
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
          } else if(isKeys){
            pickKeyChordViaRecord(function(chord){
              if(!chord) return;
              cur.push({type:'key',value:chord});
              applyAndRefresh(m, cur);
            });
          } else {
            pickKeyChord(function(chord){
              if(!chord) return;
              cur.push({type:'key',value:chord});
              applyAndRefresh(m, cur);
            });
          }
          return;
        }
        else if(add==='record'){
          if(mode==='prompt') return;
          // Keys desk: press combo only — no keyboard catalog.
          if(isKeys){
            pickKeyChordViaRecord(function(chord){
              if(!chord) return;
              cur.push({type:'key',value:chord});
              applyAndRefresh(m, cur);
            });
            return;
          }
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
        else if(add==='text'){
          pickInjectText('', {}, function(v){
            v=String(v||'').trim();
            if(!v) return;
            cur.push({type:'text',value:v});
            applyAndRefresh(m, cur);
          });
          return;
        }
        else if(add==='delay'){
          pickDelayMs(200, {}, function(n){
            if(!n||n<=0) return;
            cur.push({type:'delay',ms:n});
            applyAndRefresh(m, cur);
          });
          return;
        }
        else if(add==='open-file'||add==='open-folder'||add==='open-url'){
          var okAdd=add==='open-folder'?'folder':add==='open-url'?'url':'file';
          pickOpenValue(okAdd, '', function(v){
            if(!v) return;
            cur.push({type:'open',kind:okAdd,value:v});
            applyAndRefresh(m, cur);
          });
          return;
        }
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
          pickInjectText(cur2.value||'', { edit:true }, function(v){
            v=String(v||'').trim();
            if(!v) return;
            commitEdit(v);
          });
        } else if(editKind==='delay'){
          pickDelayMs(cur2.ms||200, { edit:true }, function(n){
            if(!n||n<=0) return;
            commitEdit(n);
          });
        } else if(editKind==='key'){
          if(mode==='prompt'){
            var v=(global.prompt||window.prompt)(t('homeKeyMapActionPromptKeyEdit'), cur2.value||'')||'';
            v=v.trim();
            if(!v) return;
            cur[idx]={type:'key',value:v};
            applyAndRefresh(m, cur);
          } else if(isKeys){
            pickKeyChordViaRecord(function(chord){
              if(!chord) return;
              cur[idx]={type:'key',value:chord};
              applyAndRefresh(m, cur);
            });
          } else {
            pickKeyChord(function(chord){
              if(!chord) return;
              cur[idx]={type:'key',value:chord};
              applyAndRefresh(m, cur);
            });
          }
        } else if(editKind==='open'){
          pickOpenValue(cur2.kind||'file', cur2.value||'', function(v){
            if(!v) return;
            cur[idx]={type:'open',kind:normalizeOpenKind(cur2.kind),value:v};
            applyAndRefresh(m, cur);
          });
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
  //   mode: 'picker' (default) | 'prompt'
  //   variant: 'keys' — inline sequence editor (no sheets / catalog)
  function renderTargetActionsInto(container, mapping, options){
    options = options || {};
    if(!container) return;
    var m = mapping;
    var acts = effectiveTargetActions(m);
    var canEdit = !!m && !!m.id && !options.readOnly;
    var mode = options.mode || 'picker';
    var isKeys = options.variant === 'keys';
    container.classList.toggle('is-keys-variant', isKeys);
    container.classList.toggle('is-keys-inline', isKeys);
    if(isKeys){
      container.__keysInlineMappingId = m && m.id ? String(m.id) : '';
      var listenIdx =
        keysInlineListen.mappingId &&
        m &&
        String(m.id) === keysInlineListen.mappingId
          ? keysInlineListen.idx
          : -1;
      var buildAddStrip = function(){
        if(!canEdit) return '';
        var recent=loadKeysSeqRecent();
        var recentHtml=recent.length
          ? ('<div class="keys-seq-recent" role="group" aria-label="'+escHtml(t('keysCaptureSeqRecent','近期'))+'">'
            +'<span class="keys-seq-recent-lab">'+escHtml(t('keysCaptureSeqRecent','近期'))+'</span>'
            +recent.map(function(id){
              return '<button type="button" class="keys-seq-recent-chip" data-add="'+escHtml(id)+'">'
                +escHtml(keysSeqRecentLabel(id))+'</button>';
            }).join('')
            +'</div>')
          : '';
        return '<div class="keys-seq-add-row">'
          +'<button type="button" class="keys-seq-add-toggle'+(keysSeqAddMenuOpen?' is-open':'')+'" data-add-toggle="1"'
          +' aria-expanded="'+(keysSeqAddMenuOpen?'true':'false')+'"'
          +' title="'+escHtml(t('keysCaptureSeqAddStrip','添加步骤'))+'">＋</button>'
          +'<div class="keys-seq-add-menu'+(keysSeqAddMenuOpen?' is-on':'')+'" role="menu"'
          +' aria-label="'+escHtml(t('keysCaptureSeqAddStrip','添加步骤'))+'">'
          +'<button type="button" role="menuitem" data-add="key">'
            +escHtml(t('keysCaptureSeqAddKey','按键'))+'</button>'
          +'<button type="button" role="menuitem" data-add="text">'
            +escHtml(t('keysCaptureSeqAddText','文本'))+'</button>'
          +'<button type="button" role="menuitem" data-add="delay">'
            +escHtml(t('keysCaptureSeqAddDelay','延迟'))+'</button>'
          +'<button type="button" role="menuitem" data-add="open-file">'
            +escHtml(t('keysCaptureSeqAddOpenFile','文件'))+'</button>'
          +'<button type="button" role="menuitem" data-add="open-folder">'
            +escHtml(t('keysCaptureSeqAddOpenFolder','文件夹'))+'</button>'
          +'<button type="button" role="menuitem" data-add="open-url">'
            +escHtml(t('keysCaptureSeqAddOpenUrl','网址'))+'</button>'
          +'</div></div>'
          +recentHtml;
      };
      container.hidden = false;
      if(acts.length >= 1){
        var rows = acts.map(function(a, i){
          return buildKeysInlineRowHtml(a, i, acts.length, canEdit, listenIdx===i);
        }).join('');
        container.innerHTML = '<div class="home-key-map-action-list is-keys-inline" role="list">'+rows+'</div>'+buildAddStrip();
      } else {
        container.innerHTML =
          '<div class="home-key-map-action-empty is-keys">'
          + '<b>'+escHtml(t('keysCaptureSeqEmptyTitle','还没有步骤'))+'</b>'
          + '<ol class="keys-seq-empty-recipe">'
          + '<li>'+escHtml(t('keysCaptureSeqEmptyStep1','点 ＋ 选择要添加的命令'))+'</li>'
          + '<li>'+escHtml(t('keysCaptureSeqEmptyStep2','按键 / 文本 / 延迟 / 文件 / 文件夹 / 网址横排可选'))+'</li>'
          + '<li>'+escHtml(t('keysCaptureSeqEmptyStep3','触发后按顺序执行'))+'</li>'
          + '</ol></div>'
          + buildAddStrip();
      }
      if(canEdit) wireKeysInlineHandlers(container, m);
      container.querySelectorAll('.keys-seq-text-in').forEach(function(ta){
        ta.style.height='auto';
        ta.style.height=Math.min(120, ta.scrollHeight)+'px';
      });
      return;
    }
    var showRecordBtn = (mode === 'picker');
    var buildAddRow = function(){
      if(!canEdit) return '';
      var parts = '';
      if(showRecordBtn){
        parts += '<button type="button" class="home-key-map-action-add" data-add="record">'
          + '⏺ '+escHtml(t('homeKeyMapActionRecord'))+' +'
          + '</button>';
      }
      parts += '<button type="button" class="home-key-map-action-add" data-add="key">'
        + escHtml(t('homeKeyMapActionTypeKey'))+' +'
        + '</button>';
      parts += '<button type="button" class="home-key-map-action-add" data-add="text">'
        + escHtml(t('homeKeyMapActionTypeText'))+' +'
        + '</button>';
      parts += '<button type="button" class="home-key-map-action-add" data-add="delay">'
        + escHtml(t('homeKeyMapActionTypeDelay'))+' +'
        + '</button>';
      parts += '<button type="button" class="home-key-map-action-add" data-add="open-file">'
        + escHtml(t('keysCaptureSeqAddOpenFile','文件'))+' +'
        + '</button>';
      parts += '<button type="button" class="home-key-map-action-add" data-add="open-folder">'
        + escHtml(t('keysCaptureSeqAddOpenFolder','文件夹'))+' +'
        + '</button>';
      parts += '<button type="button" class="home-key-map-action-add" data-add="open-url">'
        + escHtml(t('keysCaptureSeqAddOpenUrl','网址'))+' +'
        + '</button>';
      return '<div class="home-key-map-action-addrow">'+parts+'</div>';
    };
    if(acts.length >= 1){
      container.hidden = false;
      var rows2 = acts.map(function(a, i){ return buildActionRowHtml(a, i, acts.length, canEdit); }).join('');
      var moreRow = acts.length>1
        ? '<div class="home-key-map-action-more">'+escHtml(t('homeKeyMapActionMore').replace('{n}',acts.length))+'</div>'
        : '';
      container.innerHTML = '<div class="home-key-map-action-list">'+rows2+'</div>'+buildAddRow()+moreRow;
      if(canEdit) wireTargetActionsHandlers(container, m, { mode: mode });
    } else {
      container.hidden = false;
      container.innerHTML =
        '<div class="home-key-map-action-empty">'
        + escHtml(t('homeKeyMapActionEmpty', '还没添加动作 — 下方选一个开始'))
        + '</div>'
        + buildAddRow();
      if(canEdit) wireTargetActionsHandlers(container, m, { mode: mode });
    }
  }

  global.OneToneHomeTargetActions = {
    render: renderTargetActionsInto,
    effective: effectiveTargetActions
  };
})((typeof window!=='undefined')?window:globalThis);
