(function(global){

  'use strict';

  var $=function(id){ return global.OneToneDom.$(id); };

  var t=function(key){ return global.OneToneI18n.t(key); };

  function state(){ return global.OneToneState.state; }

  function hooks(){ return global.__vp_voice_end_hooks__ || {}; }

  var voiceEndPresetSaveTimer=0;

  var voiceEndPresetSavePending=null;



  function voiceEndUiUsesLiteMode(){
    const mode=hooks().getVoiceWakeExpandedMode();
    return mode!=='vosk'&&mode!=='kws';
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

    if(Array.isArray(res.cancelPhrasesZh)) cfg.cancelPhrasesZh=hooks().cloneStringList(res.cancelPhrasesZh);

    if(Array.isArray(res.cancelPhrasesEn)) cfg.cancelPhrasesEn=hooks().cloneStringList(res.cancelPhrasesEn);

    if(Array.isArray(res.sendPhrasesZh)) cfg.sendPhrasesZh=hooks().cloneStringList(res.sendPhrasesZh);

    if(Array.isArray(res.sendPhrasesEn)) cfg.sendPhrasesEn=hooks().cloneStringList(res.sendPhrasesEn);

    if(res.sendMode!=null) cfg.sendMode=normalizeSendMode(res.sendMode);

    if(res.commitDelayMs!=null) cfg.commitDelayMs=Number(res.commitDelayMs)||4000;

    if(res.commitKey!=null) cfg.commitKey=String(res.commitKey||'').trim();

    if(res.dictationTimeoutMs!=null) cfg.dictationTimeoutMs=Number(res.dictationTimeoutMs)||60000;

    if(res.targetKey!=null) cfg.targetKey=String(res.targetKey||'').trim();

    const sounds=state().config.sounds||(state().config.sounds={});

    if(res.recordingAudioEnabled!=null) sounds.recordingMuteEnabled=!!res.recordingAudioEnabled;

    if(res.recordingAudioStrength!=null) sounds.recordingMuteStrength=String(res.recordingAudioStrength||'balanced').trim()||'balanced';

  }



  function normalizeVoiceEndCommitKey(raw){
    const key=String(raw||'').trim().replace(/\s+/g,'');
    if(/^ctrl\+enter$/i.test(key)||/^control\+enter$/i.test(key)) return 'Ctrl+Enter';
    if(/^shift\+enter$/i.test(key)) return 'Shift+Enter';
    return 'Enter';
  }

  function syncVoiceEndCommitKeyUi(commitKey){
    const key=normalizeVoiceEndCommitKey(commitKey);
    const enterBtn=$('btnVoiceSettingsCommitEnter');
    const shiftBtn=$('btnVoiceSettingsCommitShiftEnter');
    const ctrlBtn=$('btnVoiceSettingsCommitCtrlEnter');
    if(enterBtn) enterBtn.classList.toggle('is-active',key==='Enter');
    if(shiftBtn) shiftBtn.classList.toggle('is-active',key==='Shift+Enter');
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

    syncCancelPresets(
      Array.isArray(res.cancelPhrasesZh)?res.cancelPhrasesZh:[],
      Array.isArray(res.cancelPhrasesEn)?res.cancelPhrasesEn:[]
    );

    syncSendPresets(
      Array.isArray(res.sendPhrasesZh)?res.sendPhrasesZh:[],
      Array.isArray(res.sendPhrasesEn)?res.sendPhrasesEn:[]
    );

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

    const snap=hooks().voiceUiSnapshot();

    const end=snap&&snap.end||{};

    const cfg=hooks().state().config||{};

    const endCfg=cfg.voiceEnd||cfg.voice_end||{};

    const current=!!end.autoSendEnabled||!!(endCfg&&endCfg.autoSendEnabled);

    return setAutoSendEnabled(!current);

  }



  function setAutoSendEnabled(enabled){

    syncVoiceEndAutoSendToggle(!!enabled);

    return global.OneToneIpc.invoke('cmd_voice_end_set_auto_send',{enabled:!!enabled}).then(function(res){

      renderVoiceEndStatus(res);

      hooks().syncHomeFromVoiceSettings(null,null,res);

      return res;

    }).catch(function(){

      loadVoiceEndStatus();

      hooks().toast(t('voiceEndFail'));

    });

  }



  function normalizeSendMode(raw){

    var key=String(raw||'').trim().toLowerCase();

    if(key==='auto'||key==='phrase'||key==='confirm') return key;

    return 'confirm';

  }



  function resolveSendModeFromConfig(){

    var endSnap=(hooks().voiceUiSnapshot().end)||{};

    var endCfg=(state().config&&(state().config.voiceEnd||state().config.voice_end))||{};

    if(endSnap.sendMode) return normalizeSendMode(endSnap.sendMode);

    if(endCfg.sendMode) return normalizeSendMode(endCfg.sendMode);

    if(endSnap.autoSendEnabled||endCfg.autoSendEnabled) return 'auto';

    return 'confirm';

  }



  function setOutputMode(key){

    key=normalizeSendMode(key);

    return global.OneToneIpc.invoke('cmd_voice_end_set_send_mode',{sendMode:key}).then(function(res){

      renderVoiceEndStatus(res);

      hooks().syncHomeFromVoiceSettings(null,null,res);

      if(global.OneToneVoiceSettingsFlow&&global.OneToneVoiceSettingsFlow.scheduleVoiceSettingsRender){

        global.OneToneVoiceSettingsFlow.scheduleVoiceSettingsRender();

      }

      return res;

    }).catch(function(){

      return setAutoSendEnabled(key==='auto');

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

    renderEndPhraseTags();

  }



  function endPresetPhraseSet(){

    var pc=global.OneToneVoicePhraseCustom;

    if(!pc||!pc.presetPhrasesIn) return [];

    return pc.presetPhrasesIn('#voiceEndPresetsZh').concat(pc.presetPhrasesIn('#voiceEndPresetsEn'));

  }



  function currentEndPhraseLists(){

    const cfg=state().config||{};

    const endCfg=cfg.voiceEnd||cfg.voice_end||{};

    const snap=(hooks().voiceUiSnapshot&&typeof hooks().voiceUiSnapshot==='function'
      ?hooks().voiceUiSnapshot()
      :hooks().voiceUiSnapshot)||{};

    const endSnap=snap.end||{};

    const zh=normalizePhraseList(endSnap.phrasesZh&&endSnap.phrasesZh.length?endSnap.phrasesZh:endCfg.phrasesZh);

    const en=normalizePhraseList(endSnap.phrasesEn&&endSnap.phrasesEn.length?endSnap.phrasesEn:endCfg.phrasesEn);

    return {zh:zh.length?zh:['结束输入'],en:en.length?en:['end dictation']};

  }



  function normalizePhraseList(list){

    return (Array.isArray(list)?list:[]).map(function(x){ return String(x||'').trim(); }).filter(Boolean);

  }



  function endCatalogForLang(lang){
    var sel=lang==='en'?'#voiceEndPresetsEn':'#voiceEndPresetsZh';
    var pc=global.OneToneVoicePhraseCustom;
    return pc&&pc.presetPhrasesIn?pc.presetPhrasesIn(sel):[];
  }

  function renderEndPhraseTags(){
    var pc=global.OneToneVoicePhraseCustom;
    if(!pc||!pc.renderPhraseTags) return;
    var lang=global.__vp_voice_end_lang__||'zh';
    var lists=currentEndPhraseLists();
    var active=lang==='en'?lists.en:lists.zh;
    var catalog=endCatalogForLang(lang);
    var model=pc.buildPhraseTagModel(catalog,active);
    pc.renderPhraseTags('voiceEndPhraseTags',model);
    var legacy=$('voiceEndCustomChips');
    if(legacy){ legacy.hidden=true; legacy.innerHTML=''; }
  }

  function toggleEndPhrase(phrase,wasActive){
    phrase=String(phrase||'').trim();
    if(!phrase) return;
    var lists=currentEndPhraseLists();
    var lang=global.__vp_voice_end_lang__||(/[\u4e00-\u9fff]/.test(phrase)?'zh':'en');
    var target=lang==='en'?lists.en.slice():lists.zh.slice();
    var idx=target.indexOf(phrase);
    if(wasActive){
      if(target.length<=1) return;
      target.splice(idx,1);
    }else if(idx<0){
      target.push(phrase);
    }
    var nextZh=lang==='zh'?target:lists.zh;
    var nextEn=lang==='en'?target:lists.en;
    voiceEndPresetSavePending={phrasesZh:nextZh,phrasesEn:nextEn};
    syncVoiceEndPresets(nextZh,nextEn);
    clearTimeout(voiceEndPresetSaveTimer);
    voiceEndPresetSaveTimer=setTimeout(flushVoiceEndPresetSave,280);
  }

  function renderEndCustomPhrases(){
    renderEndPhraseTags();
    const block=$('voiceEndCustomBlock');
    const wakeApi=global.OneToneVoiceWake;
    const mode=wakeApi&&wakeApi.currentMode?wakeApi.currentMode():'off';
    if(block) block.hidden=mode!=='vosk';
  }



  function persistEndPhrases(zh,en){

    zh=normalizePhraseList(zh);

    en=normalizePhraseList(en);

    if(!zh.length) zh=['结束输入'];

    if(!en.length) en=['end dictation'];

    syncVoiceEndPresets(zh,en);

    return global.OneToneIpc.invoke('cmd_voice_end_set_phrases',{phrasesZh:zh,phrasesEn:en}).then(function(res){

      renderVoiceEndStatus(res);

      hooks().syncHomeFromVoiceSettings(null,null,res);

      renderEndCustomPhrases();

      hooks().renderVoiceSettingsFlow();

      if(global.OneToneVoiceSchemeContext&&global.OneToneVoiceSchemeContext.mirrorGlobalToOverride){
        global.OneToneVoiceSchemeContext.mirrorGlobalToOverride();
      }

      return res;

    });

  }



  function addCustomEndPhrase(raw){

    const phrase=String(raw||'').trim();

    if(!phrase) return Promise.resolve();

    const lists=currentEndPhraseLists();

    const lang=global.__vp_voice_end_lang__||(/[\u4e00-\u9fff]/.test(phrase)?'zh':'en');

    const target=lang==='en'?lists.en.slice():lists.zh.slice();

    if(target.indexOf(phrase)>=0){

      hooks().toast(t('voicePhraseAlreadyAdded'));

      return Promise.resolve();

    }

    target.push(phrase);

    const nextZh=lang==='zh'?target:lists.zh;

    const nextEn=lang==='en'?target:lists.en;

    return persistEndPhrases(nextZh,nextEn).then(function(){

      hooks().toast(t('voicePhraseAdded'));

    }).catch(function(err){

      console.error('voice_custom_end',err);

      hooks().toast(t('voiceEndFail'));

    });

  }



  function removeCustomEndPhrase(phrase){

    phrase=String(phrase||'').trim();

    if(!phrase) return;

    const lists=currentEndPhraseLists();

    const nextZh=lists.zh.filter(function(p){ return p!==phrase; });

    const nextEn=lists.en.filter(function(p){ return p!==phrase; });

    persistEndPhrases(nextZh.length?nextZh:['结束输入'],nextEn.length?nextEn:['end dictation']);

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



  function currentCancelPhraseLists(){
    const cfg=state().config||{};
    const endCfg=cfg.voiceEnd||cfg.voice_end||{};
    const snap=(hooks().voiceUiSnapshot&&typeof hooks().voiceUiSnapshot==='function'
      ?hooks().voiceUiSnapshot()
      :hooks().voiceUiSnapshot)||{};
    const endSnap=snap.end||{};
    const zh=normalizePhraseList(endSnap.cancelPhrasesZh&&endSnap.cancelPhrasesZh.length
      ?endSnap.cancelPhrasesZh
      :(endCfg.cancelPhrasesZh||endCfg.cancel_phrases_zh));
    const en=normalizePhraseList(endSnap.cancelPhrasesEn&&endSnap.cancelPhrasesEn.length
      ?endSnap.cancelPhrasesEn
      :(endCfg.cancelPhrasesEn||endCfg.cancel_phrases_en));
    return {zh:zh.length?zh:['取消输入','不要了'],en:en.length?en:['cancel input','never mind']};
  }

  function currentSendPhraseLists(){
    const cfg=state().config||{};
    const endCfg=cfg.voiceEnd||cfg.voice_end||{};
    const snap=(hooks().voiceUiSnapshot&&typeof hooks().voiceUiSnapshot==='function'
      ?hooks().voiceUiSnapshot()
      :hooks().voiceUiSnapshot)||{};
    const endSnap=snap.end||{};
    const zh=normalizePhraseList(endSnap.sendPhrasesZh&&endSnap.sendPhrasesZh.length
      ?endSnap.sendPhrasesZh
      :(endCfg.sendPhrasesZh||endCfg.send_phrases_zh));
    const en=normalizePhraseList(endSnap.sendPhrasesEn&&endSnap.sendPhrasesEn.length
      ?endSnap.sendPhrasesEn
      :(endCfg.sendPhrasesEn||endCfg.send_phrases_en));
    return {zh:zh.length?zh:['发送','发出去','提交'],en:en.length?en:['send it','send','submit']};
  }

  function catalogForLang(zhSel,enSel,lang){
    var pc=global.OneToneVoicePhraseCustom;
    var sel=lang==='en'?enSel:zhSel;
    return pc&&pc.presetPhrasesIn?pc.presetPhrasesIn(sel):[];
  }

  function renderCancelPhraseTags(){
    var pc=global.OneToneVoicePhraseCustom;
    if(!pc||!pc.renderPhraseTags) return;
    var lang=global.__vp_voice_cancel_lang__||'zh';
    var lists=currentCancelPhraseLists();
    var active=lang==='en'?lists.en:lists.zh;
    var catalog=catalogForLang('#voiceCancelPresetsZh','#voiceCancelPresetsEn',lang);
    pc.renderPhraseTags('voiceCancelPhraseTags',pc.buildPhraseTagModel(catalog,active));
  }

  function renderSendPhraseTags(){
    var pc=global.OneToneVoicePhraseCustom;
    if(!pc||!pc.renderPhraseTags) return;
    var lang=global.__vp_voice_send_lang__||'zh';
    var lists=currentSendPhraseLists();
    var active=lang==='en'?lists.en:lists.zh;
    var catalog=catalogForLang('#voiceSendPresetsZh','#voiceSendPresetsEn',lang);
    pc.renderPhraseTags('voiceSendPhraseTags',pc.buildPhraseTagModel(catalog,active));
  }

  function syncCancelPresets(zh,en){
    var zhSet=normalizePhraseList(zh);
    var enSet=normalizePhraseList(en);
    document.querySelectorAll('#voiceCancelPresetsZh [data-phrase]').forEach(function(btn){
      btn.classList.toggle('is-selected',zhSet.indexOf(btn.getAttribute('data-phrase')||'')>=0);
    });
    document.querySelectorAll('#voiceCancelPresetsEn [data-phrase]').forEach(function(btn){
      btn.classList.toggle('is-selected',enSet.indexOf(btn.getAttribute('data-phrase')||'')>=0);
    });
    renderCancelPhraseTags();
  }

  function syncSendPresets(zh,en){
    var zhSet=normalizePhraseList(zh);
    var enSet=normalizePhraseList(en);
    document.querySelectorAll('#voiceSendPresetsZh [data-phrase]').forEach(function(btn){
      btn.classList.toggle('is-selected',zhSet.indexOf(btn.getAttribute('data-phrase')||'')>=0);
    });
    document.querySelectorAll('#voiceSendPresetsEn [data-phrase]').forEach(function(btn){
      btn.classList.toggle('is-selected',enSet.indexOf(btn.getAttribute('data-phrase')||'')>=0);
    });
    renderSendPhraseTags();
  }

  function persistCancelPhrases(zh,en){
    zh=normalizePhraseList(zh);
    en=normalizePhraseList(en);
    if(!zh.length) zh=['取消输入'];
    if(!en.length) en=['cancel input'];
    syncCancelPresets(zh,en);
    return global.OneToneIpc.invoke('cmd_voice_end_set_cancel_phrases',{phrasesZh:zh,phrasesEn:en}).then(function(res){
      renderVoiceEndStatus(res);
      hooks().syncHomeFromVoiceSettings(null,null,res);
      if(global.OneToneVoiceSchemeContext&&global.OneToneVoiceSchemeContext.mirrorGlobalToOverride){
        global.OneToneVoiceSchemeContext.mirrorGlobalToOverride();
      }
      if(hooks().renderVoiceSettingsFlow) hooks().renderVoiceSettingsFlow();
      return res;
    });
  }

  function persistSendPhrases(zh,en){
    zh=normalizePhraseList(zh);
    en=normalizePhraseList(en);
    if(!zh.length) zh=['发送'];
    if(!en.length) en=['send it'];
    syncSendPresets(zh,en);
    return global.OneToneIpc.invoke('cmd_voice_end_set_send_phrases',{phrasesZh:zh,phrasesEn:en}).then(function(res){
      renderVoiceEndStatus(res);
      hooks().syncHomeFromVoiceSettings(null,null,res);
      if(global.OneToneVoiceSchemeContext&&global.OneToneVoiceSchemeContext.mirrorGlobalToOverride){
        global.OneToneVoiceSchemeContext.mirrorGlobalToOverride();
      }
      if(hooks().renderVoiceSettingsFlow) hooks().renderVoiceSettingsFlow();
      return res;
    });
  }

  function toggleBundlePhrase(kind,phrase,wasActive){
    phrase=String(phrase||'').trim();
    if(!phrase) return;
    var lists=kind==='send'?currentSendPhraseLists():currentCancelPhraseLists();
    var langKey=kind==='send'?'__vp_voice_send_lang__':'__vp_voice_cancel_lang__';
    var lang=global[langKey]||(/[\u4e00-\u9fff]/.test(phrase)?'zh':'en');
    var target=lang==='en'?lists.en.slice():lists.zh.slice();
    var idx=target.indexOf(phrase);
    if(wasActive){
      if(target.length<=1) return;
      target.splice(idx,1);
    }else if(idx<0){
      target.push(phrase);
    }
    var nextZh=lang==='zh'?target:lists.zh;
    var nextEn=lang==='en'?target:lists.en;
    if(kind==='send') persistSendPhrases(nextZh,nextEn).catch(function(){ hooks().toast(t('voiceEndFail')); });
    else persistCancelPhrases(nextZh,nextEn).catch(function(){ hooks().toast(t('voiceEndFail')); });
  }

  function addCustomBundlePhrase(kind,raw){
    var phrase=String(raw||'').trim();
    if(!phrase) return Promise.resolve();
    var lists=kind==='send'?currentSendPhraseLists():currentCancelPhraseLists();
    var langKey=kind==='send'?'__vp_voice_send_lang__':'__vp_voice_cancel_lang__';
    var lang=global[langKey]||(/[\u4e00-\u9fff]/.test(phrase)?'zh':'en');
    var target=lang==='en'?lists.en.slice():lists.zh.slice();
    if(target.indexOf(phrase)>=0){
      hooks().toast(t('voicePhraseAlreadyAdded'));
      return Promise.resolve();
    }
    target.push(phrase);
    var nextZh=lang==='zh'?target:lists.zh;
    var nextEn=lang==='en'?target:lists.en;
    var persist=kind==='send'?persistSendPhrases:persistCancelPhrases;
    return persist(nextZh,nextEn).then(function(){
      hooks().toast(t('voicePhraseAdded'));
    }).catch(function(err){
      console.error('voice_custom_'+kind,err);
      hooks().toast(t('voiceEndFail'));
    });
  }

  function removeCustomBundlePhrase(kind,phrase){
    phrase=String(phrase||'').trim();
    if(!phrase) return;
    var lists=kind==='send'?currentSendPhraseLists():currentCancelPhraseLists();
    var nextZh=lists.zh.filter(function(p){ return p!==phrase; });
    var nextEn=lists.en.filter(function(p){ return p!==phrase; });
    if(kind==='send'){
      persistSendPhrases(nextZh.length?nextZh:['发送'],nextEn.length?nextEn:['send it']);
    }else{
      persistCancelPhrases(nextZh.length?nextZh:['取消输入'],nextEn.length?nextEn:['cancel input']);
    }
  }

  function renderCancelCustomPhrases(){
    renderCancelPhraseTags();
    var block=$('voiceCancelCustomBlock');
    var wakeApi=global.OneToneVoiceWake;
    var mode=wakeApi&&wakeApi.currentMode?wakeApi.currentMode():'off';
    if(block) block.hidden=mode!=='vosk'&&mode!=='kws';
  }

  function renderSendCustomPhrases(){
    renderSendPhraseTags();
    var block=$('voiceSendCustomBlock');
    var wakeApi=global.OneToneVoiceWake;
    var mode=wakeApi&&wakeApi.currentMode?wakeApi.currentMode():'off';
    if(block) block.hidden=mode!=='vosk'&&mode!=='kws';
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

    setAutoSendEnabled:setAutoSendEnabled,

    setOutputMode:setOutputMode,

    resolveSendMode:resolveSendModeFromConfig,

    normalizeSendMode:normalizeSendMode,

    toggle:toggleVoiceEnd,

    toggleAutoSend:toggleVoiceEndAutoSend,

    onDelayInput:onVoiceEndDelayInput,

    onDelayChange:onVoiceEndDelayChange,

    addPreset:addVoiceEndPreset,

    syncPresets:syncVoiceEndPresets,

    addCustomEndPhrase:addCustomEndPhrase,
    removeCustomEndPhrase:removeCustomEndPhrase,
    renderEndCustomPhrases:renderEndCustomPhrases,
    renderEndPhraseTags:renderEndPhraseTags,
    toggleEndPhrase:toggleEndPhrase,

    syncCancelPresets:syncCancelPresets,
    syncSendPresets:syncSendPresets,
    renderCancelPhraseTags:renderCancelPhraseTags,
    renderSendPhraseTags:renderSendPhraseTags,
    renderCancelCustomPhrases:renderCancelCustomPhrases,
    renderSendCustomPhrases:renderSendCustomPhrases,
    toggleCancelPhrase:function(phrase,wasActive){ toggleBundlePhrase('cancel',phrase,wasActive); },
    toggleSendPhrase:function(phrase,wasActive){ toggleBundlePhrase('send',phrase,wasActive); },
    addCustomCancelPhrase:function(raw){ return addCustomBundlePhrase('cancel',raw); },
    addCustomSendPhrase:function(raw){ return addCustomBundlePhrase('send',raw); },
    removeCustomCancelPhrase:function(phrase){ removeCustomBundlePhrase('cancel',phrase); },
    removeCustomSendPhrase:function(phrase){ removeCustomBundlePhrase('send',phrase); },
    persistCancelPhrases:persistCancelPhrases,
    persistSendPhrases:persistSendPhrases,
    currentCancelPhraseLists:currentCancelPhraseLists,
    currentSendPhraseLists:currentSendPhraseLists,
    currentEndPhraseLists:currentEndPhraseLists,

    testStop:testVoiceEndStop,

    testCommit:testVoiceEndCommit

  };

})((typeof window!=='undefined')?window:globalThis);

