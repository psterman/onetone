(function(global){

  'use strict';

  var $=function(id){ return global.OneToneDom.$(id); };

  var t=function(key){ return global.OneToneI18n.t(key); };

  function state(){ return global.OneToneState.state; }

  function hooks(){ return global.__vp_voice_end_hooks__ || {}; }

  var voiceEndPresetSaveTimer=0;

  var voiceEndPresetSavePending=null;



  function voiceEndUiUsesLiteMode(){

    return hooks().getVoiceWakeExpandedMode()!=='vosk';

  }



  function syncVoiceEndModeUi(){

    const lite=voiceEndUiUsesLiteMode();

    const merged=$('voiceEndMergedSection');

    if(merged) merged.classList.toggle('is-lite-mode',lite);

    const liteNotice=$('voiceEndLiteNotice');

    if(liteNotice) liteNotice.hidden=!lite;

    const liteTitle=$('voiceEndLiteNoticeTitle');

    if(liteTitle) liteTitle.textContent=t('voiceEndLiteNoticeTitle');

    const liteBody=$('voiceEndLiteNoticeBody');

    if(liteBody) liteBody.textContent=t('voiceEndLiteNoticeBody');

    const liteAutoHint=$('voiceEndLiteAutoHint');

    if(liteAutoHint){

      liteAutoHint.hidden=!lite;

      liteAutoHint.textContent=t('voiceEndLiteAutoHint');

    }

    const endDesc=$('voiceEndDesc');

    if(endDesc) endDesc.textContent=lite?t('voiceEndDescLite'):t('voiceEndDesc');

    const endBtn=$('btnVoiceEnd');

    if(endBtn) endBtn.disabled=lite;

  }



  function syncVoiceEndConfigFromStatus(res){

    if(!state().config||!res) return;

    const cfg=state().config.voiceEnd||state().config.voice_end||(state().config.voiceEnd={});

    state().config.voiceEnd=cfg;

    cfg.enabled=!!res.enabled;

    cfg.autoSendEnabled=!!res.autoSendEnabled;

    if(Array.isArray(res.phrasesZh)) cfg.phrasesZh=hooks().cloneStringList(res.phrasesZh);

    if(Array.isArray(res.phrasesEn)) cfg.phrasesEn=hooks().cloneStringList(res.phrasesEn);

    if(res.commitDelayMs!=null) cfg.commitDelayMs=Number(res.commitDelayMs)||4000;

    if(res.commitKey!=null) cfg.commitKey=String(res.commitKey||'').trim();

    if(res.dictationTimeoutMs!=null) cfg.dictationTimeoutMs=Number(res.dictationTimeoutMs)||60000;

    if(res.targetKey!=null) cfg.targetKey=String(res.targetKey||'').trim();

    const sounds=state().config.sounds||(state().config.sounds={});

    if(res.recordingAudioEnabled!=null) sounds.recordingMuteEnabled=!!res.recordingAudioEnabled;

    if(res.recordingAudioStrength!=null) sounds.recordingMuteStrength=String(res.recordingAudioStrength||'balanced').trim()||'balanced';

  }



  function normalizeVoiceEndCommitKey(raw){

    const key=String(raw||'').trim();

    return /^ctrl\+enter$/i.test(key)?'Ctrl+Enter':'Enter';

  }



  function syncVoiceEndCommitKeyUi(commitKey){

    const key=normalizeVoiceEndCommitKey(commitKey);

    const enterBtn=$('btnVoiceSettingsCommitEnter');

    const ctrlBtn=$('btnVoiceSettingsCommitCtrlEnter');

    if(enterBtn) enterBtn.classList.toggle('is-active',key==='Enter');

    if(ctrlBtn) ctrlBtn.classList.toggle('is-active',key==='Ctrl+Enter');

  }



  function syncVoiceEndDelayRanges(ms,skipEl){

    ['voiceEndDelayRange','voiceSettingsDelayRange'].forEach(function(id){

      const el=$(id);

      if(!el||el===skipEl) return;

      if(document.activeElement!==el) el.value=String(ms);

      el.style.setProperty('--range-pct',((ms-1000)/9000*100)+'%');

    });

    const delayLine=$('voiceEndDelayLine');

    if(delayLine) delayLine.textContent=t('voiceEndDelay')+'：'+t('voiceEndDelayMs').replace('{n}',String(ms));

  }



  function setVoiceEndCommitKey(commitKey){

    const key=normalizeVoiceEndCommitKey(commitKey);

    syncVoiceEndCommitKeyUi(key);

    return global.OneToneIpc.invoke('cmd_voice_end_set_commit_key',{commitKey:key}).then(function(res){

      renderVoiceEndStatus(res);

      hooks().syncHomeFromVoiceSettings(null,null,res);

      return res;

    }).catch(function(err){

      loadVoiceEndStatus();

      hooks().toast(t('voiceEndFail'));

      throw err;

    });

  }



  function voiceEndStateLabel(raw){

    const labels={

      idle:t('voiceEndStateIdle'),

      dictating:t('voiceEndStateDictating'),

      stopping:t('voiceEndStateStopping'),

      committing:t('voiceEndStateCommitting'),

      sent:t('voiceEndStateSent'),

      error:t('voiceEndStateError')

    };

    return labels[raw]||raw||t('voiceEndStateIdle');

  }



  function renderVoiceEndStatus(res){

    if(!res) return;

    syncVoiceEndConfigFromStatus(res);

    syncVoiceEndToggle(!!res.enabled);

    syncVoiceEndAutoSendToggle(!!res.autoSendEnabled);

    const stateLabel=res.statusLabel||voiceEndStateLabel(res.state||'idle');

    const stateEl=$('voiceEndState');

    if(stateEl){

      stateEl.textContent=stateLabel;

    }

    const voskWarn=$('voiceEndVoskWarn');

    if(voskWarn) voskWarn.hidden=!(res.enabled&&res.voskRequired);

    const autoWarn=$('voiceEndAutoSendWarn');

    if(autoWarn){

      autoWarn.hidden=!res.autoSendEnabled;

      autoWarn.textContent=t('voiceEndAutoSendWarn');

    }

    const zh=Array.isArray(res.phrasesZh)?res.phrasesZh:[];

    const en=Array.isArray(res.phrasesEn)?res.phrasesEn:[];

    const delayMs=res.commitDelayMs!=null?res.commitDelayMs:4000;

    const phrasesLine=$('voiceEndPhrasesLine');

    if(phrasesLine) phrasesLine.textContent=t('voiceEndPhrases')+'：'+(zh.concat(en).join(' / ')||'—');

    const zhLine=$('voiceEndPhrasesZhLine');

    if(zhLine) zhLine.textContent=t('voiceEndPresetsZhLabel')+'：'+(zh.join(' / ')||'—');

    const enLine=$('voiceEndPhrasesEnLine');

    if(enLine) enLine.textContent=t('voiceEndPresetsEnLabel')+'：'+(en.join(' / ')||'—');

    const summaryEl=$('voiceEndDebugSummary');

    if(summaryEl) summaryEl.textContent='';

    const lastPhrase=$('voiceEndLastPhraseLine');

    if(lastPhrase) lastPhrase.textContent='';

    const lastAction=$('voiceEndLastActionLine');

    if(lastAction) lastAction.textContent='';

    const autoLine=$('voiceEndAutoSendLine');

    if(autoLine) autoLine.textContent=t('voiceEndAutoSend')+'：'+(res.autoSendEnabled?t('voiceEndAutoSendOn'):t('voiceEndAutoSendOff'));

    const delayLine=$('voiceEndDelayLine');

    if(delayLine) delayLine.textContent=t('voiceEndDelay')+'：'+t('voiceEndDelayMs').replace('{n}',String(delayMs));

    const audioHint=$('voiceEndAudioHint');

    if(audioHint){

      const audioEnabled=!!res.recordingAudioEnabled;

      const strength=String(res.recordingAudioStrength||'balanced').trim()||'balanced';

      const strengthKey='recordingMuteStrength'+strength.charAt(0).toUpperCase()+strength.slice(1);

      const targetScale=res.recordingAudioTargetScale!=null?Number(res.recordingAudioTargetScale):null;

      const active=res.recordingAudioActive==null?audioEnabled:!!res.recordingAudioActive;

      const strengthLabel=t(strengthKey);

      const scaleText=targetScale==null?'':(' · '+Math.round(targetScale*100)+'%');

      audioHint.textContent=audioEnabled

        ?t('voiceEndAudioDiagHintOn').replace('{strength}',strengthLabel).replace('{state}',active?t('voiceEndAudioDiagStateActive'):t('voiceEndAudioDiagStateInactive'))+scaleText

        :t('voiceEndAudioDiagHintOff');

    }

    const audioBtn=$('btnVoiceEndAudioSettings');

    if(audioBtn) audioBtn.textContent=t('voiceEndAudioDiagAction');

    const range=$('voiceEndDelayRange');

    if(range&&document.activeElement!==range){

      range.value=String(delayMs);

      range.style.setProperty('--range-pct',((delayMs-1000)/9000*100)+'%');

    }

    syncVoiceEndDelayRanges(delayMs);

    syncVoiceEndCommitKeyUi(res.commitKey);

    syncVoiceEndPresets(zh,en);

    global.OneToneVoiceDiag.updateMetric('end','state',stateLabel,t('voiceDiagLogState'));

    global.OneToneVoiceDiag.updateMetric('end','phrase',res.lastEndPhrase||'',t('voiceDiagLogPhrase'));

    global.OneToneVoiceDiag.updateMetric('end','action',res.lastAction||'',t('voiceDiagLogAction'));

    global.OneToneVoiceDiag.updateMetric('end','auto',res.autoSendEnabled?t('voiceEndAutoSendOn'):t('voiceEndAutoSendOff'),t('voiceEndAutoSend'));

    global.OneToneVoiceDiag.updateMetric('end','delay',t('voiceEndDelayMs').replace('{n}',String(delayMs)),t('voiceEndDelay'));

    global.OneToneVoiceDiag.updateMetric('end','audio',res.recordingAudioEnabled?t('voiceEndAudioDiagOn'):t('voiceEndAudioDiagOff'),t('voiceDiagLogAudioMute'));

    global.OneToneVoiceDiag.updateMetric('end','audioStrength',t('recordingMuteStrength'+String(res.recordingAudioStrength||'balanced').trim().replace(/^[a-z]/,function(ch){ return ch.toUpperCase(); })),t('voiceDiagLogAudioStrength'));

    syncVoiceEndModeUi();

    hooks().renderVoiceModeSwitch();

    hooks().renderVoiceSettingsFlow();

  }



  function loadVoiceEndStatus(){

    hooks().voiceStatusPollTick();

    return Promise.resolve(hooks().voiceUiSnapshot.end);

  }



  function syncVoiceEndToggle(enabled){

    const btn=$('btnVoiceEnd');

    if(!btn) return;

    btn.classList.toggle('is-on',!!enabled);

    btn.setAttribute('aria-checked',enabled?'true':'false');

  }



  function syncVoiceEndAutoSendToggle(enabled){

    const btn=$('btnVoiceEndAutoSend');

    if(!btn) return;

    btn.classList.toggle('is-on',!!enabled);

    btn.setAttribute('aria-checked',enabled?'true':'false');

  }



  function toggleVoiceEnd(){

    if(voiceEndUiUsesLiteMode()){

      hooks().toast(t('voiceEndVoskWarn'));

      return;

    }

    const btn=$('btnVoiceEnd');

    if(!btn) return;

    const next=!btn.classList.contains('is-on');

    syncVoiceEndToggle(next);

    global.OneToneIpc.invoke('cmd_voice_end_set_enabled',{enabled:next}).then(function(res){

      renderVoiceEndStatus(res);

      hooks().syncHomeFromVoiceSettings(null,null,res);

      hooks().loadVoiceVoskStatus();

    }).catch(function(err){

      loadVoiceEndStatus();

      hooks().toast(t('voiceEndFail'));

      console.error('voice_end',err);

    });

  }



  function toggleVoiceEndAutoSend(){

    const btn=$('btnVoiceEndAutoSend');

    if(!btn) return;

    const next=!btn.classList.contains('is-on');

    syncVoiceEndAutoSendToggle(next);

    global.OneToneIpc.invoke('cmd_voice_end_set_auto_send',{enabled:next}).then(function(res){

      renderVoiceEndStatus(res);

      hooks().syncHomeFromVoiceSettings(null,null,res);

    }).catch(function(){

      loadVoiceEndStatus();

      hooks().toast(t('voiceEndFail'));

    });

  }



  function onVoiceEndDelayInput(){

    const active=document.activeElement;

    const el=(active&&(active.id==='voiceEndDelayRange'||active.id==='voiceSettingsDelayRange'))

      ?active:($('voiceSettingsDelayRange')||$('voiceEndDelayRange'));

    if(!el) return;

    const ms=parseInt(el.value,10)||4000;

    syncVoiceEndDelayRanges(ms,el);

  }



  function onVoiceEndDelayChange(){

    const active=document.activeElement;

    const el=(active&&(active.id==='voiceEndDelayRange'||active.id==='voiceSettingsDelayRange'))

      ?active:($('voiceSettingsDelayRange')||$('voiceEndDelayRange'));

    if(!el) return;

    const ms=parseInt(el.value,10)||4000;

    onVoiceEndDelayInput();

    global.OneToneIpc.invoke('cmd_voice_end_set_commit_delay',{commitDelayMs:ms}).then(function(res){

      renderVoiceEndStatus(res);

      hooks().syncHomeFromVoiceSettings(null,null,res);

    }).catch(function(){

      loadVoiceEndStatus();

    });

  }



  function flushVoiceEndPresetSave(){

    const p=voiceEndPresetSavePending;

    voiceEndPresetSavePending=null;

    if(!p) return;

    global.OneToneIpc.invoke('cmd_voice_end_set_phrases',p).then(function(res){

      renderVoiceEndStatus(res);

      hooks().syncHomeFromVoiceSettings(null,null,res);

      hooks().toast(t('voiceEndPresetUpdated'));

    }).catch(function(){

      hooks().toast(t('voiceEndFail'));

      loadVoiceEndStatus();

    });

  }



  function addVoiceEndPreset(ev){

    const btn=ev.target.closest&&ev.target.closest('[data-phrase]');

    if(!btn) return;

    const phrase=btn.getAttribute('data-phrase')||'';

    const zhSel=[];

    const enSel=[];

    document.querySelectorAll('#voiceEndPresetsZh [data-phrase].is-selected').forEach(function(x){

      const p=x.getAttribute('data-phrase')||'';

      if(p) zhSel.push(p);

    });

    document.querySelectorAll('#voiceEndPresetsEn [data-phrase].is-selected').forEach(function(x){

      const p=x.getAttribute('data-phrase')||'';

      if(p) enSel.push(p);

    });

    const inZh=btn.closest('#voiceEndPresetsZh');

    const list=inZh?zhSel:enSel;

    const idx=list.indexOf(phrase);

    if(idx>=0 && list.length>1) list.splice(idx,1);

    else if(idx<0) list.push(phrase);

    const nextZh=inZh?(list.length?list:[phrase]):(zhSel.length?zhSel:['结束输入']);

    const nextEn=inZh?(enSel.length?enSel:['end dictation']):(list.length?list:[phrase]);

    syncVoiceEndPresets(nextZh,nextEn);

    voiceEndPresetSavePending={phrasesZh:nextZh,phrasesEn:nextEn};

    clearTimeout(voiceEndPresetSaveTimer);

    voiceEndPresetSaveTimer=setTimeout(flushVoiceEndPresetSave,280);

  }



  function syncVoiceEndPresets(zh,en){

    const zhSet=(Array.isArray(zh)?zh:[]).map(function(x){return String(x||'').trim();});

    const enSet=(Array.isArray(en)?en:[]).map(function(x){return String(x||'').trim();});

    document.querySelectorAll('#voiceEndPresetsZh [data-phrase]').forEach(function(btn){

      const phrase=btn.getAttribute('data-phrase')||'';

      btn.classList.toggle('is-selected',zhSet.includes(phrase));

    });

    document.querySelectorAll('#voiceEndPresetsEn [data-phrase]').forEach(function(btn){

      const phrase=btn.getAttribute('data-phrase')||'';

      btn.classList.toggle('is-selected',enSet.includes(phrase));

    });

  }



  function testVoiceEndStop(){

    global.OneToneIpc.invoke('cmd_voice_end_test_stop',{}).then(function(res){

      let msg=t('testFailed');

      if(res&&res.ok) msg=t('testSent')+(res.targetKey||'');

      else if(res&&res.reason==='paused') msg=t('testCheckListenFail');

      hooks().toast(msg);

      global.OneToneVoiceDiag.forceLog('end',t('voiceDiagLogTest'),msg);

    }).catch(function(){

      hooks().toast(t('testFailed'));

      global.OneToneVoiceDiag.forceLog('end',t('voiceDiagLogTest'),t('testFailed'));

    });

  }



  function testVoiceEndCommit(){

    global.OneToneIpc.invoke('cmd_voice_end_test_commit',{}).then(function(res){

      let msg=t('testFailed');

      if(res&&res.ok) msg=t('testSent')+(res.commitKey||'');

      else if(res&&res.reason==='paused') msg=t('testCheckListenFail');

      hooks().toast(msg);

      global.OneToneVoiceDiag.forceLog('end',t('voiceDiagLogTest'),msg);

    }).catch(function(){

      hooks().toast(t('testFailed'));

      global.OneToneVoiceDiag.forceLog('end',t('voiceDiagLogTest'),t('testFailed'));

    });

  }



  function voiceEndEnabledInConfig(){

    const cfg=state().config||{};

    const end=cfg.voiceEnd||cfg.voice_end;

    return !!(end&&end.enabled);

  }



  global.OneToneVoiceEnd={

    uiUsesLiteMode:voiceEndUiUsesLiteMode,

    syncModeUi:syncVoiceEndModeUi,

    syncConfigFromStatus:syncVoiceEndConfigFromStatus,

    normalizeCommitKey:normalizeVoiceEndCommitKey,

    syncCommitKeyUi:syncVoiceEndCommitKeyUi,

    syncDelayRanges:syncVoiceEndDelayRanges,

    setCommitKey:setVoiceEndCommitKey,

    enabledInConfig:voiceEndEnabledInConfig,

    stateLabel:voiceEndStateLabel,

    renderStatus:renderVoiceEndStatus,

    loadStatus:loadVoiceEndStatus,

    syncToggle:syncVoiceEndToggle,

    syncAutoSendToggle:syncVoiceEndAutoSendToggle,

    toggle:toggleVoiceEnd,

    toggleAutoSend:toggleVoiceEndAutoSend,

    onDelayInput:onVoiceEndDelayInput,

    onDelayChange:onVoiceEndDelayChange,

    addPreset:addVoiceEndPreset,

    syncPresets:syncVoiceEndPresets,

    testStop:testVoiceEndStop,

    testCommit:testVoiceEndCommit

  };

})((typeof window!=='undefined')?window:globalThis);

