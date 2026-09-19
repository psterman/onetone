(function(global){
  'use strict';
  var $=function(id){ return global.OneToneDom&&global.OneToneDom.$?global.OneToneDom.$(id):document.getElementById(id); };
  var t=function(key,fallback){
    var i=global.OneToneI18n;
    var v=i&&i.t?i.t(key):'';
    return v&&v!==key?v:(fallback||key);
  };

  var INTENTS=['ime','key','prompt','cursor','softpad','gesture'];
  var promptEditId='';
  var autosaveTimer=0;
  var saveHintPulseTimer=0;
  var applyingPrompt=false;
  var lastSaveFailToast=0;

  function toast(msg){
    try{
      if(global.OneToneApp&&typeof global.OneToneApp.toast==='function'){
        global.OneToneApp.toast(msg);
      }
    }catch(_){}
  }

  function mappingById(id){
    id=String(id||'').trim();
    if(!id) return null;
    var maps=global.OneToneState&&global.OneToneState.state&&global.OneToneState.state.config
      ?global.OneToneState.state.config.mappings:null;
    if(!Array.isArray(maps)) return null;
    for(var i=0;i<maps.length;i++){
      if(maps[i]&&String(maps[i].id)===id) return maps[i];
    }
    return null;
  }

  function selectedOrHabit(){
    try{
      var hdr=global.OneToneVoicePageHeaderRender;
      if(hdr&&typeof hdr.resolveScopeMapping==='function'){
        var scoped=hdr.resolveScopeMapping(null);
        if(scoped) return scoped;
      }
    }catch(_){}
    var core=global.OneToneMappingCore;
    var sid='';
    try{
      if(global.OneToneState&&global.OneToneState.state){
        sid=String(global.OneToneState.state.selectedMappingId||'').trim();
      }
    }catch(_){}
    var m=sid?mappingById(sid):null;
    if(m) return m;
    try{
      if(core&&typeof core.selected==='function') return core.selected();
    }catch(_){}
    return null;
  }

  function escHtml(s){
    try{
      if(global.OneToneDom&&typeof global.OneToneDom.esc==='function') return global.OneToneDom.esc(s);
    }catch(_){}
    return String(s==null?'':s)
      .replace(/&/g,'&amp;')
      .replace(/</g,'&lt;')
      .replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;');
  }

  function promptLabelFromText(text){
    text=String(text||'').trim();
    if(!text) return t('voiceIntentPrompt','口头指令');
    return text.length>16?text.slice(0,16)+'…':text;
  }

  function readPromptTitleUi(){
    var el=$('voicePromptTitle');
    return el?String(el.value||'').trim():'';
  }

  /** Empty title field = auto from prompt body. */
  function resolvePromptLabel(text){
    var title=readPromptTitleUi();
    if(title) return title.length>32?title.slice(0,32)+'…':title;
    return promptLabelFromText(text);
  }

  function setPromptTitleUi(label, body){
    var el=$('voicePromptTitle');
    if(!el) return;
    label=String(label||'').trim();
    body=String(body||'').trim();
    var auto=promptLabelFromText(body);
    el.value=(label&&label!==auto)?label:'';
  }

  function forcePromptTitleUi(title){
    var el=$('voicePromptTitle');
    if(!el) return;
    el.value=String(title||'').trim();
  }

  /** Built-in starters for vibe coding — not a second library. */
  function promptTemplates(){
    return [
      {id:'tpl-continue',label:t('voicePromptTplContinue','继续'),text:t('voicePromptTplContinueText','继续上一步，保持同样约束。')},
      {id:'tpl-fix',label:t('voicePromptTplFix','修这个'),text:t('voicePromptTplFixText','根据当前报错修好它，改动尽量小，说明原因。')},
      {id:'tpl-summary',label:t('voicePromptTplSummary','总结改动'),text:t('voicePromptTplSummaryText','用三条要点总结刚改了什么，以及下一步建议。')},
      {id:'tpl-explain',label:t('voicePromptTplExplain','解释这段'),text:t('voicePromptTplExplainText','用白话解释当前选中/打开的代码在干什么，以及风险点。')},
      {id:'tpl-next',label:t('voicePromptTplNext','下一步'),text:t('voicePromptTplNextText','基于当前进度，给出一个可立刻执行的下一步，并直接开干。')}
    ];
  }

  function promptTplPillsHtml(){
    return promptTemplates().map(function(tpl){
      return '<button type="button" class="voice-prompt-tpl-pill" data-prompt-tpl="'+escHtml(tpl.id)+'">'+
        escHtml(tpl.label)+'</button>';
    }).join('');
  }

  function listPromptPeersForCurrentApp(){
    var anchor=selectedOrHabit();
    var appId=anchor?String(anchor.appTargetId||'').trim():'';
    var picker=global.OneToneKeysChannelCommandPicker;
    if(!(picker&&picker.listPromptPeersForApp&&appId)) return [];
    try{ return picker.listPromptPeersForApp(appId)||[]; }catch(_){ return []; }
  }

  function primaryWakePhraseDisplay(){
    var phrase='';
    var tags=$('voiceWakePhraseTags');
    if(tags){
      var on=tags.querySelector('.is-on,.is-active,[aria-selected="true"]');
      var raw=on?(on.getAttribute('data-phrase')||on.textContent||''):'';
      phrase=String(raw).replace(/[「」]/g,'').trim();
    }
    if(!phrase){
      try{
        var Wake=global.OneToneVoiceWake;
        if(Wake&&typeof Wake.primaryWakePhraseDisplay==='function'){
          phrase=String(Wake.primaryWakePhraseDisplay()||'').trim();
        }
      }catch(_w){}
    }
    if(!phrase){
      try{
        var V=global.OneToneVoiceSettingsViewModel;
        if(V&&V.build&&V.resolveDisplayWakePhrase){
          phrase=String(V.resolveDisplayWakePhrase(V.build(false)).display||'').trim();
        }
      }catch(_v){}
    }
    return phrase||'—';
  }

  function paintPromptArmed(){
    var el=$('voicePromptArmed');
    var land=$('voicePromptLand');
    var ta=$('voicePromptInjectBody');
    var body=ta?String(ta.value||'').trim():'';
    if(!body) body=currentPromptPeerBody();
    var title=readPromptTitleUi();
    if(!title){
      var peer=currentPromptPeer();
      if(peer) title=String(peer.label||'').trim();
    }
    if(!title) title=promptLabelFromText(body);
    var preview=title||(body?body.split(/\r?\n/)[0].trim():'');
    if(preview.length>28) preview=preview.slice(0,28)+'…';
    var wake=primaryWakePhraseDisplay();
    var fmt=t('voicePromptArmedFmt','说 {wake} → 写入 {preview}');
    var none=t('voicePromptArmedEmpty','（还没有）');
    var line=fmt
      .replace('{wake}',wake)
      .replace('{preview}',preview?('「'+preview+'」'):none);
    if(el){
      el.innerHTML='<span class="voice-prompt-armed__wake">'+escHtml(wake)+'</span>'+
        '<span class="voice-prompt-armed__arrow">→</span>'+
        '<span class="voice-prompt-armed__preview">'+escHtml(preview||none)+'</span>';
      el.setAttribute('title',line);
    }
    if(land){
      land.textContent=(typeof t==='function'?t('voicePromptLandFmt','说 01 口令 = 对准输入框 → 写入{preview} → 回车发送'):'说 01 口令 = 对准输入框 → 写入{preview} → 回车发送')
        .replace('{preview}',preview?('「'+preview+'」'):' prompt');
    }
  }

  function paintPromptFromTpl(hasPeers){
    var host=$('voicePromptFromTpl');
    if(!host) return;
    if(!hasPeers){
      host.hidden=true;
      host.innerHTML='';
      return;
    }
    host.hidden=false;
    host.innerHTML='<span class="voice-prompt-from-tpl__lb">'+escHtml(t('voicePromptFromTpl','从常用开始'))+
      '</span><span class="voice-prompt-from-tpl__pills">'+promptTplPillsHtml()+'</span>';
  }

  function currentPromptPeer(){
    if(promptEditId){
      var m=mappingById(promptEditId);
      if(m) return m;
    }
    return null;
  }

  function currentPromptPeerBody(){
    var picker=global.OneToneKeysChannelCommandPicker;
    var m=currentPromptPeer();
    if(!m||!(picker&&picker.promptTextFromMapping)) return '';
    return String(picker.promptTextFromMapping(m)||'').trim();
  }

  function refreshPromptSaveHint(){
    var hint=$('voicePromptSaveHint');
    var cur=hint?String(hint.getAttribute('data-save-state')||''):'';
    /* Don't clobber in-flight autosave UX (was flashing 编辑中 ↔ 输入后自动保存). */
    if(cur==='editing'||cur==='saving') return;
    var ta=$('voicePromptInjectBody');
    var text=ta?String(ta.value||'').trim():'';
    var peer=currentPromptPeer();
    var bodyOk=!!(text&&peer&&text===currentPromptPeerBody());
    syncPromptSaveHint(!!bodyOk);
  }

  function paintPromptLibrary(){
    var host=$('voicePromptLib');
    if(!host) return;
    var picker=global.OneToneKeysChannelCommandPicker;
    var peers=listPromptPeersForCurrentApp();
    var count=$('voicePromptLibCount');
    if(count) count.textContent=peers.length?String(peers.length):'';
    paintPromptFromTpl(peers.length>0);
    if(!peers.length){
      host.innerHTML='<div class="voice-prompt-lib__empty">'+
        '<p class="voice-prompt-lib__empty-lead">'+escHtml(t('voicePromptLibEmpty','还没有口头指令'))+'</p>'+
        '<p class="voice-prompt-lib__empty-hint">'+escHtml(t('voicePromptLibEmptyHint','点一个常用起步，或右侧直接写'))+'</p>'+
        '<div class="voice-prompt-lib__tpls">'+promptTplPillsHtml()+'</div></div>';
      paintPromptArmed();
      return;
    }
    host.innerHTML=peers.map(function(m){
      if(!m||!m.id) return '';
      var body='';
      try{
        if(picker&&picker.promptTextFromMapping) body=String(picker.promptTextFromMapping(m)||'').trim();
      }catch(_){}
      var empty=t('voicePromptRowEmpty','未填写 prompt');
      var stored=String(m.label||'').trim();
      var name=stored||(body?body.split(/\r?\n/)[0].trim():'');
      if(!name) name=empty;
      if(name.length>22) name=name.slice(0,22)+'…';
      var preview='';
      if(body){
        var first=body.split(/\r?\n/)[0].trim();
        if(stored&&stored!==first){
          preview=body.replace(/\s+/g,' ').trim();
          if(preview.length>28) preview=preview.slice(0,28)+'…';
        }else if(body.length>name.length){
          preview=body.replace(/\s+/g,' ').trim();
          if(preview.length>28) preview=preview.slice(0,28)+'…';
        }
      }
      var on=String(m.id)===String(promptEditId);
      var curTag=on?'<span class="voice-prompt-lib__cur">'+escHtml(t('voicePromptLibCurrent','当前'))+'</span>':'';
      return '<button type="button" class="voice-prompt-lib__chip'+(on?' is-on':'')+
        '" role="option" aria-selected="'+(on?'true':'false')+
        '" data-prompt-peer="'+escHtml(String(m.id))+'" title="'+escHtml(body||empty)+'">'+
        '<span class="voice-prompt-lib__body">'+escHtml(name)+curTag+'</span>'+
        (preview?'<span class="voice-prompt-lib__preview">'+escHtml(preview)+'</span>':'')+
        '</button>';
    }).join('');
    paintPromptArmed();
  }

  function applyPromptTemplate(tplId){
    tplId=String(tplId||'').trim();
    var tpl=null;
    var list=promptTemplates();
    for(var i=0;i<list.length;i++){
      if(list[i].id===tplId){ tpl=list[i]; break; }
    }
    if(!tpl) return;
    var picker=global.OneToneKeysChannelCommandPicker;
    var peers=listPromptPeersForCurrentApp();
    var want=String(tpl.text||'').trim();
    for(var pi=0;pi<peers.length;pi++){
      var m=peers[pi];
      var body='';
      try{
        if(picker&&picker.promptTextFromMapping) body=String(picker.promptTextFromMapping(m)||'').trim();
      }catch(_){}
      if(body===want&&m&&m.id){
        applyPromptMapping(String(m.id));
        toast(t('voicePromptTplAlready','已是当前「{label}」').replace('{label}',tpl.label));
        return;
      }
    }
    flushPromptDraftQuiet();
    applyingPrompt=true;
    promptEditId='';
    forcePromptTitleUi(tpl.label);
    activatePromptText(want,{skipScene:true});
    setIntent('prompt',{persist:true});
    applyingPrompt=false;
    var saved=savePromptToScene({quiet:true});
    if(saved&&saved.id){
      toast(t('voicePromptTplApplied','已加入指令库 · 「{label}」').replace('{label}',tpl.label));
    }
    paintPromptLibrary();
  }

  function activatePromptText(text, opts){
    opts=opts||{};
    text=String(text||'');
    var ta=$('voicePromptInjectBody');
    if(ta){
      ta._promptHydrated=true;
      ta.value=text;
    }
    var st=global.OneToneState&&global.OneToneState.state;
    if(st&&st.config){
      if(!st.config.voiceEnd) st.config.voiceEnd={};
      st.config.voiceEnd.promptInjectText=text;
      st.config.voiceEnd.intent='prompt';
    }
    global.__vp_voice_intent__='prompt';
    syncPromptUi();
    if(opts.skipScene!==true) scheduleAutosavePromptScene(0);
  }

  function refreshSceneList(mid){
    try{
      var scene=global.OneToneKeysSceneActionsPanel;
      if(!scene) return;
      var anchor=null;
      try{
        var hdr=global.OneToneVoicePageHeaderRender;
        if(hdr&&typeof hdr.resolveScopeMapping==='function'){
          anchor=hdr.resolveScopeMapping(null);
        }
      }catch(_){}
      if(!anchor) anchor=selectedOrHabit();
      var picker=global.OneToneKeysChannelCommandPicker;
      // Keep habit (or any non-prompt peer) as dock anchor so 语音输入 + 口头指令 both list.
      if(anchor&&picker&&picker.isPromptInjectMapping&&picker.isPromptInjectMapping(anchor)){
        var appId=String(anchor.appTargetId||'').trim();
        var maps=global.OneToneState&&global.OneToneState.state&&global.OneToneState.state.config
          ?global.OneToneState.state.config.mappings:[];
        if(Array.isArray(maps)){
          for(var i=0;i<maps.length;i++){
            var x=maps[i];
            if(!x||String(x.appTargetId||'').trim()!==appId) continue;
            if(picker.isPromptInjectMapping(x)) continue;
            anchor=x;
            break;
          }
        }
      }
      if(anchor&&typeof scene.render==='function') scene.render(anchor);
      else if(typeof scene.refresh==='function') scene.refresh();
      if(mid&&typeof scene.highlightMapping==='function') scene.highlightMapping(String(mid));
      try{
        var flow=global.OneToneVoiceSettingsFlow;
        if(flow&&typeof flow.scheduleVoiceSettingsRender==='function'){
          flow.scheduleVoiceSettingsRender();
        }
      }catch(_){}
    }catch(_){}
  }

  function syncPromptSaveHint(ok){
    setPromptSaveHint(ok?'ok':'idle');
  }

  /** idle | editing | saving | ok | fail — visible state machine for autosave feedback */
  function setPromptSaveHint(state, failMsg){
    var hint=$('voicePromptSaveHint');
    if(!hint) return;
    state=String(state||'idle');
    var cur=hint.getAttribute('data-save-state')||'';
    /* Same state → no-op (incl. ok). Re-applying classes flashed via CSS transition. */
    if(state===cur) return;
    if(saveHintPulseTimer){
      try{ clearTimeout(saveHintPulseTimer); }catch(_){}
      saveHintPulseTimer=0;
    }
    hint.setAttribute('data-save-state',state);
    hint.classList.remove('is-ok','is-saving','is-editing','is-pulse','is-fail');
    if(state==='ok'){
      hint.textContent=t('voicePromptSynced','已保存');
      hint.classList.add('is-ok','is-pulse');
      saveHintPulseTimer=setTimeout(function(){
        saveHintPulseTimer=0;
        var h=$('voicePromptSaveHint');
        if(h) h.classList.remove('is-pulse');
      },1200);
      return;
    }
    if(state==='saving'){
      hint.textContent=t('voicePromptSaving','保存中…');
      hint.classList.add('is-saving');
      return;
    }
    if(state==='editing'){
      hint.textContent=t('voicePromptEditing','编辑中…');
      hint.classList.add('is-editing');
      return;
    }
    if(state==='fail'){
      hint.textContent=failMsg||t('voicePromptSaveUnavailable','暂无法保存');
      hint.classList.add('is-fail');
      return;
    }
    hint.textContent=t('voicePromptSaveHint','输入后自动保存');
  }

  function promptDraftIsDirty(){
    var ta=$('voicePromptInjectBody');
    var text=ta?String(ta.value||'').trim():'';
    if(!text) return false;
    var peer=currentPromptPeer();
    if(!peer) return true;
    if(text!==currentPromptPeerBody()) return true;
    var stored=String(peer.label||'').trim();
    var effective=resolvePromptLabel(text);
    return effective!==stored;
  }

  function flushPromptDraftQuiet(){
    if(applyingPrompt) return;
    var ta=$('voicePromptInjectBody');
    var text=ta?String(ta.value||'').trim():'';
    if(!text) return;
    if(!promptDraftIsDirty()) return;
    savePromptToScene({quiet:true});
  }

  function applyPromptMapping(mid){
    mid=String(mid||'').trim();
    if(mid&&mid===String(promptEditId||'')) return;
    flushPromptDraftQuiet();
    var m=mappingById(mid);
    var picker=global.OneToneKeysChannelCommandPicker;
    if(!m||!(picker&&picker.isPromptInjectMapping&&picker.isPromptInjectMapping(m))){
      setIntent('prompt');
      return;
    }
    applyingPrompt=true;
    promptEditId=mid;
    var body='';
    if(picker.promptTextFromMapping) body=String(picker.promptTextFromMapping(m)||'');
    setPromptTitleUi(m.label,body);
    activatePromptText(body,{skipScene:true});
    setIntent('prompt',{persist:true});
    paintPromptLibrary();
    syncPromptSaveHint(true);
    applyingPrompt=false;
  }

  function savePromptToScene(opts){
    opts=opts||{};
    var quiet=!!opts.quiet;
    if(promptEditId&&!mappingById(promptEditId)){
      promptEditId='';
    }
    var ta=$('voicePromptInjectBody');
    var text=ta?String(ta.value||'').trim():'';
    try{
      if(!text){
        syncPromptSaveHint(false);
        if(!quiet) toast(t('voicePromptSaveNeedText','先填写要注入的 prompt'));
        return null;
      }
      var picker=global.OneToneKeysChannelCommandPicker;
      if(!picker||typeof picker.savePromptInjectMapping!=='function'){
        syncPromptSaveHint(false);
        if(!quiet) toast(t('voicePromptSaveUnavailable','暂无法保存'));
        return null;
      }
      var label=resolvePromptLabel(text);
      var existing=promptEditId?mappingById(promptEditId):null;
      if(existing&&!(picker.isPromptInjectMapping&&picker.isPromptInjectMapping(existing))){
        existing=null;
        promptEditId='';
      }
      var wasNew=!existing;
      var saved=picker.savePromptInjectMapping({
        text:text,
        label:label,
        editId:existing?String(existing.id):'',
        forceCreate:!existing,
        // Clear per-peer wake; routing uses scene / 01 wake only.
        wakePhrases:[],
        quiet:quiet
      });
      if(!saved||!saved.id){
        var anchor=selectedOrHabit();
        var noApp=!anchor||!String(anchor.appTargetId||'').trim();
        var failMsg=noApp
          ?t('voicePromptNeedAppScene','请先切换到某个应用场景（不要停在通用设置）')
          :t('voicePromptSaveUnavailable','暂无法保存');
        setPromptSaveHint('fail',failMsg);
        if(!quiet){
          if(Date.now()-lastSaveFailToast>2500){
            lastSaveFailToast=Date.now();
            toast(failMsg);
          }
        }
        return null;
      }
      promptEditId=String(saved.id);
      var st=global.OneToneState&&global.OneToneState.state;
      if(st&&st.config){
        if(!st.config.voiceEnd) st.config.voiceEnd={};
        st.config.voiceEnd.promptInjectText=text;
        st.config.voiceEnd.intent='prompt';
      }
      if(global.OneToneConfigPersist&&global.OneToneConfigPersist.save){
        try{ global.OneToneConfigPersist.save({source:'voice-prompt-scene'}); }catch(_){}
      }
      paintPromptLibrary();
      refreshSceneList(promptEditId);
      syncPromptSaveHint(true);
      if(!quiet) toast(t(wasNew?'voicePromptSavedNew':'voicePromptSaved','已保存口头指令'));
      return saved;
    }catch(_e){
      syncPromptSaveHint(false);
      return null;
    }
  }

  function startNewCustomPrompt(){
    // Commit current draft into the left list, then open a blank editor.
    flushPromptDraftQuiet();
    applyingPrompt=true;
    promptEditId='';
    var ta=$('voicePromptInjectBody');
    if(ta){
      ta._promptHydrated=true;
      ta.value='';
      try{ ta.focus(); }catch(_){}
    }
    forcePromptTitleUi('');
    var st=global.OneToneState&&global.OneToneState.state;
    if(st&&st.config){
      if(!st.config.voiceEnd) st.config.voiceEnd={};
      st.config.voiceEnd.promptInjectText='';
      st.config.voiceEnd.intent='prompt';
    }
    global.__vp_voice_intent__='prompt';
    setIntent('prompt',{persist:true});
    paintPromptLibrary();
    syncPromptSaveHint(false);
    applyingPrompt=false;
    toast(t('voicePromptCustomHint','已开新稿 · 输入后自动进左侧列表'));
  }

  function scheduleAutosavePromptScene(delay){
    if(applyingPrompt) return;
    if(currentIntent()!=='prompt') return;
    var ta=$('voicePromptInjectBody');
    var text=ta?String(ta.value||'').trim():'';
    if(!text){
      setPromptSaveHint('idle');
      return;
    }
    /* Already matches library — skip. Prevents save→render→autosave(0) flicker loop. */
    if(!promptDraftIsDirty()){
      setPromptSaveHint('ok');
      if(autosaveTimer){
        try{ clearTimeout(autosaveTimer); }catch(_){}
        autosaveTimer=0;
      }
      return;
    }
    if(autosaveTimer){
      try{ clearTimeout(autosaveTimer); }catch(_){}
      autosaveTimer=0;
    }
    var ms=delay==null?320:Number(delay)||0;
    /* delay 0 (post-render flush): skip「编辑中」flash, go straight to saving */
    if(ms<=0) setPromptSaveHint('saving');
    else setPromptSaveHint('editing');
    autosaveTimer=setTimeout(function(){
      autosaveTimer=0;
      if(applyingPrompt||currentIntent()!=='prompt') return;
      var live=$('voicePromptInjectBody');
      if(!(live&&String(live.value||'').trim())){
        setPromptSaveHint('idle');
        return;
      }
      if(!promptDraftIsDirty()){
        setPromptSaveHint('ok');
        return;
      }
      setPromptSaveHint('saving');
      try{
        savePromptToScene({quiet:true});
      }catch(_e){
        setPromptSaveHint('fail');
      }
    },ms);
  }
  var PANE_BY_INTENT={
    ime:'voiceIntentPaneIme',
    prompt:'voiceIntentPanePrompt',
    key:'voiceIntentPaneKeys',
    cursor:'voiceIntentPaneKeys',
    softpad:'voiceIntentPaneSoftPad',
    gesture:'voiceIntentPaneCamera'
  };
  var BRIDGE_MOUNT={
    key:{face:'voiceKeysFace',host:'voiceIntentKeysHost'},
    cursor:{face:'voiceKeysFace',host:'voiceIntentKeysHost'},
    softpad:{face:'voiceSoftPadFace',host:'voiceIntentSoftPadHost'},
    gesture:{face:'voiceCameraFace',host:'voiceIntentCameraHost'}
  };

  function currentIntent(){
    var st=global.OneToneState&&global.OneToneState.state;
    var cfg=st&&st.config&&st.config.voiceEnd?st.config.voiceEnd:null;
    var fromCfg=cfg&&cfg.intent?String(cfg.intent):'';
    return global.__vp_voice_intent__||fromCfg||'ime';
  }

  function persistIntent(id){
    var st=global.OneToneState&&global.OneToneState.state;
    if(!st||!st.config) return;
    if(!st.config.voiceEnd) st.config.voiceEnd={};
    st.config.voiceEnd.intent=id;
    if(global.OneToneConfigPersist&&global.OneToneConfigPersist.save){
      global.OneToneConfigPersist.save({source:'voice-intent'});
    }
  }

  function mountBridge(id){
    var spec=BRIDGE_MOUNT[id];
    if(!spec) return;
    var face=$(spec.face);
    var host=$(spec.host);
    if(!face||!host) return;
    if(face.parentNode!==host) host.appendChild(face);
    face.hidden=false;
    face.setAttribute('aria-hidden','false');
    face.classList.add('is-in-picker');
  }

  function parkBridges(){
    ['voiceKeysFace','voiceSoftPadFace','voiceCameraFace'].forEach(function(id){
      var el=$(id);
      if(!el) return;
      el.hidden=true;
      el.setAttribute('aria-hidden','true');
      el.classList.remove('is-in-picker');
    });
  }

  function syncHeroVals(){
    var wakeVal=$('voiceFlowNodeWakeVal');
    var finishVal=$('voiceFlowNodeFinishVal');
    var phrase=primaryWakePhraseDisplay();
    if(wakeVal) wakeVal.textContent=phrase;
    var intent=currentIntent();
    var finish='—';
    if(intent==='ime'){
      finish='听写';
    }else if(intent==='prompt') finish=t('voiceIntentPromptTitle','聚焦 · 填入 · 发送');
    else if(intent==='key') finish=t('voiceIntentKey','我录的键');
    else if(intent==='cursor') finish=t('voiceIntentCursor','软件自带');
    else if(intent==='softpad') finish=t('voiceIntentSoftPad','屏幕按钮');
    else if(intent==='gesture') finish=t('voiceIntentGesture','手势');
    if(finishVal) finishVal.textContent=finish;
    paintPromptArmed();
  }

  function setIntent(id, opts){
    id=String(id||'ime');
    if(INTENTS.indexOf(id)<0) id='ime';
    opts=opts||{};
    global.__vp_voice_intent__=id;
    if(opts.persist!==false) persistIntent(id);

    var rail=$('voiceIntentRail');
    if(rail){
      Array.prototype.forEach.call(rail.querySelectorAll('[data-voice-intent]'),function(btn){
        var on=btn.getAttribute('data-voice-intent')===id;
        btn.classList.toggle('is-on',on);
        btn.setAttribute('aria-selected',on?'true':'false');
      });
    }

    var showId=PANE_BY_INTENT[id]||'voiceIntentPaneIme';
    INTENTS.forEach(function(){});
    ['voiceIntentPaneIme','voiceIntentPanePrompt','voiceIntentPaneKeys','voiceIntentPaneSoftPad','voiceIntentPaneCamera'].forEach(function(paneId){
      var pane=$(paneId);
      if(pane) pane.hidden=paneId!==showId;
    });

    // Stay on dictate desk so F picker chrome never swaps to legacy face layout.
    var wake=global.OneToneVoiceStepWake;
    if(wake&&wake.setVoiceFace) wake.setVoiceFace('dictate');
    parkBridges();
    if(BRIDGE_MOUNT[id]){
      mountBridge(id);
      // Re-assert after setVoiceFace — later init/drawer calls must not leave face hidden.
      var mounted=$(BRIDGE_MOUNT[id].face);
      if(mounted){
        mounted.hidden=false;
        mounted.setAttribute('aria-hidden','false');
        mounted.classList.add('is-in-picker');
      }
    }

    if((id==='key'||id==='cursor')&&global.OneToneVoiceBridgeKeys){
      if(global.OneToneVoiceBridgeKeys.setMode){
        global.OneToneVoiceBridgeKeys.setMode(id==='key'?'customKey':'catalog');
      }
      if(id==='cursor'&&global.OneToneVoiceBridgeKeys.setCat){
        global.OneToneVoiceBridgeKeys.setCat('inject');
      }else if(!global.OneToneVoiceBridgeKeys.setMode&&global.OneToneVoiceBridgeKeys.render){
        global.OneToneVoiceBridgeKeys.render();
      }
    }
    if(id==='softpad'&&global.OneToneVoiceBridgeSoftPad&&global.OneToneVoiceBridgeSoftPad.render){
      global.OneToneVoiceBridgeSoftPad.render();
    }
    if(id==='gesture'&&global.OneToneVoiceBridgeCamera&&global.OneToneVoiceBridgeCamera.render){
      global.OneToneVoiceBridgeCamera.render();
    }
    if(id==='ime'&&global.OneToneImePresets&&global.OneToneImePresets.refresh){
      global.OneToneImePresets.refresh('voice');
    }
    if(id==='prompt'){
      syncPromptUi();
      /* Only flush dirty drafts — clean text must not re-enter editing/saving (flicker). */
      if(promptDraftIsDirty()) scheduleAutosavePromptScene(0);
    }

    var dictate=$('voiceWakeActionDictate');
    if(dictate){
      if(id==='prompt') dictate.textContent=t('voiceIntentPromptTitle','聚焦 · 填入 · 发送');
      else if(id==='ime') dictate.textContent=t('voiceWakeActionDictate','开始听写');
      else dictate.textContent=t('voiceIntentImeHint','匹配所选意图动作');
    }
    syncHeroVals();
    try{
      var scene=global.OneToneKeysSceneActionsPanel;
      if(scene&&typeof scene.refresh==='function') scene.refresh();
    }catch(_s){}
  }

  function syncRailVisibility(){
    var picker=$('voiceIntentPicker');
    var rail=$('voiceIntentRail');
    var strip=$('voiceSchemeStrip');
    if(!picker&&!rail&&!strip) return;
    var step=global.OneToneVoicePageState&&global.OneToneVoicePageState.getStep
      ?global.OneToneVoicePageState.getStep()
      :'wake';
    if(step==='recognize'||step==='send') step='finish';
    var show=step==='finish';
    if(picker){
      picker.hidden=!show;
      picker.setAttribute('aria-hidden',show?'false':'true');
    }
    if(strip){
      strip.hidden=false;
      strip.setAttribute('aria-hidden','false');
    }
    if(rail){
      rail.hidden=false;
      rail.setAttribute('aria-hidden',show?'false':'true');
    }
    if(show) setIntent(currentIntent(),{persist:false});
    else{
      parkBridges();
      var dictate=$('voiceWakeActionDictate');
      if(dictate) dictate.textContent=t('voiceWakeActionDictate','开始听写');
    }
    syncHeroVals();
  }

  function currentAppTargetId(){
    var m=selectedOrHabit();
    var id=m?String(m.appTargetId||'').trim():'';
    if(id) return id;
    try{
      var st=global.OneToneState&&global.OneToneState.state;
      var cfg=st&&st.config;
      var aid=cfg&&String(cfg.activeSceneId||'').trim();
      if(aid){
        var am=mappingById(aid);
        id=am?String(am.appTargetId||'').trim():'';
        if(id) return id;
      }
      var maps=cfg&&cfg.mappings;
      if(Array.isArray(maps)){
        for(var i=0;i<maps.length;i++){
          var x=maps[i];
          if(!x) continue;
          id=String(x.appTargetId||'').trim();
          if(id&&global.OneToneKeysChannelCommandPicker
            &&global.OneToneKeysChannelCommandPicker.isPromptInjectMapping
            &&global.OneToneKeysChannelCommandPicker.isPromptInjectMapping(x)){
            return id;
          }
        }
        for(var j=0;j<maps.length;j++){
          id=maps[j]?String(maps[j].appTargetId||'').trim():'';
          if(id) return id;
        }
      }
    }catch(_){}
    // Most calibrate users are on Cursor; avoid a silent no-op when scope is empty.
    return 'cursor-chat';
  }

  function aimCalLog(line){
    try{
      if(global.OneToneIpc&&typeof global.OneToneIpc.invoke==='function'){
        global.OneToneIpc.invoke('cmd_app_log',{line:String(line||'')}).catch(function(){});
      }
    }catch(_){}
  }

  function aimCalTip(msg,ok){
    var hint=document.getElementById('voicePromptAimCalHint');
    if(hint){
      hint.classList.toggle('is-ok',!!ok);
      hint.textContent=String(msg||'');
    }
    try{
      if(global.OneToneAppToast&&typeof global.OneToneAppToast.show==='function'){
        global.OneToneAppToast.show(msg);
        return;
      }
    }catch(_){}
    try{
      if(global.OneToneUiFeedback&&typeof global.OneToneUiFeedback.toast==='function'){
        global.OneToneUiFeedback.toast(msg);
        return;
      }
    }catch(_){}
    toast(msg);
  }

  function normalizeAimBank(raw){
    if(!raw||typeof raw!=='object') return {slots:[null,null],active:0};
    if(Array.isArray(raw.slots)){
      var slots=[null,null];
      for(var i=0;i<2;i++){
        var s=raw.slots[i];
        if(s&&typeof s==='object'&&s.set!==false&&isFinite(Number(s.x))&&isFinite(Number(s.y))){
          slots[i]={x:Number(s.x),y:Number(s.y)};
        }
      }
      var active=Number(raw.active);
      if(!isFinite(active)||active<0||active>1) active=slots[0]?0:(slots[1]?1:0);
      return {slots:slots,active:active|0};
    }
    if(isFinite(Number(raw.x))&&isFinite(Number(raw.y))){
      return {slots:[{x:Number(raw.x),y:Number(raw.y)},null],active:0};
    }
    return {slots:[null,null],active:0};
  }

  function bankFromStatus(status){
    if(!status||typeof status!=='object') return {slots:[null,null],active:0};
    return normalizeAimBank({
      slots:status.slots,
      active:status.active,
      x:status.x,
      y:status.y
    });
  }

  function writeAimBank(appId,bank){
    var st=global.OneToneState&&global.OneToneState.state;
    if(!st||!st.config||!appId) return;
    if(!st.config.voiceEnd) st.config.voiceEnd={};
    if(!st.config.voiceEnd.composerAnchors||typeof st.config.voiceEnd.composerAnchors!=='object'){
      st.config.voiceEnd.composerAnchors={};
    }
    bank=normalizeAimBank(bank);
    if(!bank.slots[0]&&!bank.slots[1]){
      delete st.config.voiceEnd.composerAnchors[appId];
    }else{
      st.config.voiceEnd.composerAnchors[appId]=bank;
    }
  }

  function currentAimSlot(){
    var appId=currentAppTargetId();
    var st=global.OneToneState&&global.OneToneState.state;
    var anchors=st&&st.config&&st.config.voiceEnd?st.config.voiceEnd.composerAnchors:null;
    var bank=normalizeAimBank(appId&&anchors?anchors[appId]:null);
    return bank.active|0;
  }

  function beginAimCalibrate(slotOpt){
    aimCalLog('fe aim_calibrate_click');
    var appId=currentAppTargetId()||'cursor-chat';
    var slot=isFinite(Number(slotOpt))?Number(slotOpt)|0:currentAimSlot();
    if(slot<0||slot>1) slot=0;
    aimCalTip(t('voiceAimCalStarting','正在打开校准层…'),false);
    aimCalLog('fe aim_calibrate_begin_invoke app='+appId+' slot='+slot);
    var args={appTargetId:appId,slot:slot};
    var inv=global.OneToneIpc&&typeof global.OneToneIpc.invokeTimeout==='function'
      ?global.OneToneIpc.invokeTimeout('cmd_input_aim_calibrate_begin',args,4000)
      :invokeAimCal('cmd_input_aim_calibrate_begin',args);
    inv.then(function(res){
      var ok=t('voiceAimCalStarted','已打开校准层 · 先圈住再点一下');
      aimCalTip(ok,true);
      aimCalLog('fe aim_calibrate_begin_ok app='+appId+' res='+JSON.stringify(res||{}));
      startAimCalWatch(appId);
    }).catch(function(err){
      var raw=String((err&&(err.message||err))||err||'');
      var msg;
      if(raw.indexOf('need_app_target')>=0||raw.indexOf('unknown_app')>=0){
        msg=t('voiceAimCalNeedApp','先选好目标应用，再校准');
      }else if(raw.indexOf('window_not_found')>=0){
        msg=t('voiceAimCalNoWindow','找不到目标窗口，请先打开该应用');
      }else if(raw.indexOf('ipc_unavailable')>=0||raw.indexOf('tauri invoke')>=0){
        msg=t('voiceAimCalFail','校准未能开始')+' · IPC';
      }else if(raw.indexOf('timeout')>=0){
        msg=t('voiceAimCalFail','校准未能开始')+' · 超时';
      }else{
        msg=t('voiceAimCalFail','校准未能开始')+(raw?(' · '+raw.slice(0,120)):'');
      }
      aimCalTip(msg,false);
      aimCalLog('fe aim_calibrate_begin_fail app='+appId+' err='+raw);
    });
  }

  var _aimCalWatchTimer=0;
  var _aimCalWatchUntil=0;
  function stopAimCalWatch(){
    if(_aimCalWatchTimer){
      clearInterval(_aimCalWatchTimer);
      _aimCalWatchTimer=0;
    }
    _aimCalWatchUntil=0;
  }
  function startAimCalWatch(appId){
    stopAimCalWatch();
    _aimCalWatchUntil=Date.now()+45000;
    _aimCalWatchTimer=setInterval(function(){
      if(Date.now()>_aimCalWatchUntil){
        stopAimCalWatch();
        return;
      }
      refreshAimCalStatus().then(function(res){
        if(res&&res.calibrated){
          var bank=bankFromStatus(res);
          if(bank.slots[0]||bank.slots[1]){
            stopAimCalWatch();
            aimCalTip(aimHintForBank(bank),true);
          }
        }
      });
    },700);
  }

  function aimHintForBank(bank){
    bank=normalizeAimBank(bank);
    var n=(bank.slots[0]?1:0)+(bank.slots[1]?1:0);
    var cur=(bank.active|0)+1;
    if(n===0) return t('voiceAimCalHint','点上方 1 / 2 切换查看；校准写入当前点');
    if(n===2) return t('voiceAimCalOkBoth','两个光点都已记住 · 当前查看 {n}').replace('{n}',String(cur));
    if(bank.slots[bank.active|0]){
      return t('voiceAimCalOkView','光点 {n} 已记住 · 点另一格可切换查看')
        .replace('{n}',String(cur));
    }
    return t('voiceAimCalOkSlot','光点 {n} 已记住 · 可再校准另一个')
      .replace('{n}',String(bank.slots[0]?1:2));
  }

  function syncAimSlotDots(bank){
    bank=normalizeAimBank(bank);
    var host=$('voiceAimSlots');
    if(!host) return;
    // Unset preview: one composer-ish ghost (not a second fake park beside slot 1).
    var unsetPreview={x:0.50,y:0.86};
    var active=bank.active|0;
    var spots=host.querySelectorAll('.voice-aim-spot[data-aim-slot]');
    for(var i=0;i<spots.length;i++){
      var btn=spots[i];
      var idx=Number(btn.getAttribute('data-aim-slot'))|0;
      var pt=bank.slots[idx];
      var set=!!pt;
      var on=idx===active;
      btn.hidden=!on;
      if(!on){
        btn.classList.remove('is-on');
        btn.setAttribute('aria-selected','false');
        continue;
      }
      var x=set?pt.x:unsetPreview.x;
      var y=set?pt.y:unsetPreview.y;
      if(!isFinite(x)) x=unsetPreview.x;
      if(!isFinite(y)) y=unsetPreview.y;
      x=Math.max(0.06,Math.min(0.94,x));
      y=Math.max(0.08,Math.min(0.92,y));
      btn.style.left=(x*100).toFixed(2)+'%';
      btn.style.top=(y*100).toFixed(2)+'%';
      btn.classList.toggle('is-set',set);
      btn.classList.add('is-on');
      btn.setAttribute('aria-selected','true');
      var label=t(idx===0?'voiceAimSlot1':'voiceAimSlot2',idx===0?'位置 1':'位置 2');
      btn.title=set?label:(label+' · '+t('voiceAimSlotEmpty','未校准'));
      btn.setAttribute('aria-label',btn.title);
      var num=btn.querySelector('.voice-aim-spot__n');
      if(num) num.textContent=String(idx+1);
      var demo=$('voiceAimDemo');
      if(demo){
        demo.style.setProperty('--spot-x',(x*100).toFixed(2)+'%');
        demo.style.setProperty('--spot-y',(y*100).toFixed(2)+'%');
      }
    }
    var tabs=$('voiceAimSlotTabs');
    if(tabs){
      var tabBtns=tabs.querySelectorAll('[data-aim-slot]');
      for(var ti=0;ti<tabBtns.length;ti++){
        var tab=tabBtns[ti];
        var tIdx=Number(tab.getAttribute('data-aim-slot'))|0;
        var tSet=!!bank.slots[tIdx];
        var tOn=tIdx===active;
        tab.classList.toggle('is-on',tOn);
        tab.classList.toggle('is-set',tSet);
        tab.setAttribute('aria-selected',tOn?'true':'false');
        var state=tab.querySelector('[data-aim-slot-state]');
        if(state) state.textContent=tSet?t('voiceAimSlotReady','已记住'):t('voiceAimSlotEmpty','未校准');
        var tLabel=t(tIdx===0?'voiceAimSlot1':'voiceAimSlot2',tIdx===0?'位置 1':'位置 2');
        tab.title=tOn?(tLabel+' · '+t('voiceAimSlotViewing','正在查看')):tLabel;
      }
    }
  }

  function applyAimCalEvent(msg){
    if(!msg||msg.type!=='input_aim_calibrated') return false;
    stopAimCalWatch();
    var appId=String(msg.appTargetId||currentAppTargetId()||'').trim();
    if(appId){
      var bank=bankFromStatus(msg);
      writeAimBank(appId,bank);
      syncAimCalStatus(msg);
      if(bank.slots[0]||bank.slots[1]){
        aimCalTip(aimHintForBank(bank),true);
      }else{
        aimCalTip(t('voiceAimCalCleared','已清除此位置'),false);
      }
    }else{
      refreshAimCalStatus();
    }
    aimCalLog('fe aim_calibrate_event '+JSON.stringify(msg||{}));
    return true;
  }

  function invokeAimCal(cmd,args){
    if(!global.OneToneIpc||typeof global.OneToneIpc.invoke!=='function'){
      return Promise.reject(new Error('ipc_unavailable'));
    }
    return global.OneToneIpc.invoke(cmd,args||{});
  }

  function clearActiveAimSlot(){
    var appId=currentAppTargetId()||'cursor-chat';
    var slot=currentAimSlot();
    aimCalLog('fe aim_calibrate_clear_click app='+appId+' slot='+slot);
    return invokeAimCal('cmd_input_aim_calibrate_clear',{appTargetId:appId,slot:slot}).then(function(res){
      writeAimBank(appId,bankFromStatus(res));
      syncAimCalStatus(res||{calibrated:false,appTargetId:appId,active:slot,slots:[]});
      aimCalTip(t('voiceAimCalCleared','已清除此位置'),false);
    }).catch(function(err){
      aimCalTip(t('voiceAimCalFail','校准未能开始')+' · '+String((err&&err.message)||err||'').slice(0,80),false);
    });
  }

  function setActiveAimSlot(slot){
    slot=Number(slot)|0;
    if(slot<0||slot>1) return Promise.resolve(null);
    var appId=currentAppTargetId()||'cursor-chat';
    aimCalLog('fe aim_slot_set app='+appId+' slot='+slot);
    return invokeAimCal('cmd_input_aim_calibrate_set_active',{appTargetId:appId,slot:slot}).then(function(res){
      writeAimBank(appId,bankFromStatus(res));
      syncAimCalStatus(res||null);
      return res;
    }).catch(function(err){
      // Optimistic local switch if IPC fails mid-edit
      var st=global.OneToneState&&global.OneToneState.state;
      var anchors=st&&st.config&&st.config.voiceEnd?st.config.voiceEnd.composerAnchors:null;
      var bank=normalizeAimBank(appId&&anchors?anchors[appId]:null);
      bank.active=slot;
      writeAimBank(appId,bank);
      syncAimCalStatus({
        calibrated:!!(bank.slots[0]||bank.slots[1]),
        active:slot,
        slots:bank.slots.map(function(p){return p?{set:true,x:p.x,y:p.y}:{set:false};})
      });
      aimCalLog('fe aim_slot_set_fail '+String((err&&err.message)||err||''));
      return null;
    });
  }

  // Capture-phase delegation: CSP blocks inline onclick; bind() alone can miss remounts.
  (function installAimCalClickCapture(){
    function onDocClick(e){
      var inCal=e.target&&e.target.closest?e.target.closest('#voicePromptAimCalRow'):null;
      var slotBtn=inCal&&e.target.closest?e.target.closest('[data-aim-slot]'):null;
      if(slotBtn){
        e.preventDefault();
        e.stopPropagation();
        setActiveAimSlot(slotBtn.getAttribute('data-aim-slot'));
        return;
      }
      var el=e.target&&e.target.closest?e.target.closest('#btnVoiceAimCalibrate,#btnVoiceAimCalibrateClear'):null;
      if(!el) return;
      e.preventDefault();
      e.stopPropagation();
      if(el.id==='btnVoiceAimCalibrateClear'){
        clearActiveAimSlot();
        return;
      }
      beginAimCalibrate();
    }
    function attach(){
      if(!global.document||global.document._vpAimCalCapture) return;
      global.document._vpAimCalCapture=true;
      global.document.addEventListener('click',onDocClick,true);
      aimCalLog('fe aim_calibrate_capture_bound');
    }
    if(global.document&&global.document.readyState==='loading'){
      global.document.addEventListener('DOMContentLoaded',attach);
    }else{
      attach();
    }
  })();

  function syncAimCalStatus(status){
    var hint=$('voicePromptAimCalHint');
    var clearBtn=$('btnVoiceAimCalibrateClear');
    var appId=currentAppTargetId();
    if(!appId){
      if(hint){
        hint.classList.remove('is-ok');
        hint.textContent=t('voiceAimCalNeedApp','先选好目标应用，再校准');
      }
      if(clearBtn) clearBtn.hidden=true;
      syncAimSlotDots({slots:[null,null],active:0});
      return;
    }
    var bank;
    if(status&&(status.slots||status.calibrated!=null)){
      bank=bankFromStatus(status);
    }else{
      var st=global.OneToneState&&global.OneToneState.state;
      var anchors=st&&st.config&&st.config.voiceEnd?st.config.voiceEnd.composerAnchors:null;
      bank=normalizeAimBank(anchors?anchors[appId]:null);
    }
    var calibrated=!!(bank.slots[0]||bank.slots[1]);
    var activeSet=!!bank.slots[bank.active|0];
    if(clearBtn) clearBtn.hidden=!activeSet;
    syncAimSlotDots(bank);
    if(hint){
      hint.classList.toggle('is-ok',calibrated);
      hint.textContent=aimHintForBank(bank);
    }
  }

  function refreshAimCalStatus(){
    var appId=currentAppTargetId();
    if(!appId){
      syncAimCalStatus(null);
      return Promise.resolve(null);
    }
    return invokeAimCal('cmd_input_aim_calibrate_status',{appTargetId:appId}).then(function(res){
      writeAimBank(appId,bankFromStatus(res));
      syncAimCalStatus(res||null);
      return res;
    }).catch(function(){
      syncAimCalStatus(null);
      return null;
    });
  }

  function syncPromptUi(){
    var ta=$('voicePromptInjectBody');
    var st=global.OneToneState&&global.OneToneState.state;
    var cfg=st&&st.config&&st.config.voiceEnd?st.config.voiceEnd:{};
    // Keep empty promptEditId when user started「新建」; only hydrate from newest if never chosen.
    if(promptEditId&&!mappingById(promptEditId)) promptEditId='';
    if(ta&&!ta._promptHydrated){
      ta._promptHydrated=true;
      if(!promptEditId){
        var anchor=selectedOrHabit();
        var appId=anchor?String(anchor.appTargetId||'').trim():'';
        var picker=global.OneToneKeysChannelCommandPicker;
        var one=picker&&picker.findPromptPeerForApp&&appId?picker.findPromptPeerForApp(appId):null;
        if(one){
          promptEditId=String(one.id);
        }
      }
      var seed=String(cfg.promptInjectText||'').trim();
      if(!seed) seed=currentPromptPeerBody();
      ta.value=seed;
      var peer0=promptEditId?mappingById(promptEditId):null;
      setPromptTitleUi(peer0&&peer0.label,seed);
    }
    var aimSel=$('voiceInputAimStrategy');
    if(aimSel){
      var aim=String(cfg.inputAimStrategy||cfg.input_aim_strategy||'none').trim()||'none';
      if(aim!=='auto'&&aim!=='none'&&aim!=='probe') aim='none';
      if(aimSel.value!==aim) aimSel.value=aim;
      var radios=document.querySelectorAll('input[name="voiceInputAimStrategy"]');
      for(var ri=0;ri<radios.length;ri++){
        var r=radios[ri];
        r.checked=String(r.value)===aim;
        var card=r.closest&&r.closest('.voice-prompt-aim__card');
        if(card) card.classList.toggle('is-on',r.checked);
      }
      syncAimStrategyChrome(aim);
    }
    paintPromptArmed();
    paintPromptLibrary();
    refreshPromptSaveHint();
    refreshAimCalStatus();
  }

  function savePromptText(){
    var ta=$('voicePromptInjectBody');
    if(!ta) return;
    var st=global.OneToneState&&global.OneToneState.state;
    if(!st||!st.config) return;
    if(!st.config.voiceEnd) st.config.voiceEnd={};
    st.config.voiceEnd.promptInjectText=String(ta.value||'');
    var aimSel=$('voiceInputAimStrategy');
    if(aimSel){
      var aim=String(aimSel.value||'none').trim()||'none';
      var checked=document.querySelector('input[name="voiceInputAimStrategy"]:checked');
      if(checked) aim=String(checked.value||aim).trim()||'none';
      if(aim!=='auto'&&aim!=='none'&&aim!=='probe') aim='none';
      aimSel.value=aim;
      st.config.voiceEnd.inputAimStrategy=aim;
    }
    if(global.OneToneConfigPersist&&global.OneToneConfigPersist.save){
      global.OneToneConfigPersist.save({source:'voice-prompt'});
    }
    syncPromptUi();
    scheduleAutosavePromptScene();
  }

  /** Per-keystroke path: memory + land only. Persist/scene autosave are debounced.
   *  Calling savePromptText() on every input re-ran syncPromptUi → refreshAimCalStatus IPC
   *  and made the textarea feel stuck. */
  var promptPersistTimer=0;
  function paintPromptLand(){
    paintPromptArmed();
  }
  function schedulePromptPersist(){
    if(promptPersistTimer){
      try{ clearTimeout(promptPersistTimer); }catch(_){}
      promptPersistTimer=0;
    }
    promptPersistTimer=setTimeout(function(){
      promptPersistTimer=0;
      if(global.OneToneConfigPersist&&global.OneToneConfigPersist.save){
        global.OneToneConfigPersist.save({source:'voice-prompt'});
      }
    },720);
  }
  function onPromptBodyInput(){
    var ta=$('voicePromptInjectBody');
    if(!ta) return;
    var st=global.OneToneState&&global.OneToneState.state;
    if(st&&st.config){
      if(!st.config.voiceEnd) st.config.voiceEnd={};
      st.config.voiceEnd.promptInjectText=String(ta.value||'');
    }
    paintPromptLand();
    schedulePromptPersist();
    scheduleAutosavePromptScene(640);
  }

  function syncLabels(){
    var map=[
      ['voiceIntentTabIme','voiceIntentIme','听写方式'],
      ['voiceIntentTabKey','voiceIntentKey','我录的键'],
      ['voiceIntentTabPrompt','voiceIntentPrompt','口头指令'],
      ['voiceIntentTabCursor','voiceIntentCursor','软件自带'],
      ['voiceIntentTabSoftPad','voiceIntentSoftPad','屏幕按钮'],
      ['voiceIntentTabGesture','voiceIntentGesture','手势']
    ];
    map.forEach(function(row){
      var el=$(row[0]);
      if(!el) return;
      var n=el.querySelector('.n');
      var nHtml=n?n.outerHTML:'';
      el.innerHTML=t(row[1],row[2])+nHtml;
    });
    var rail=$('voiceIntentRail');
    if(rail) rail.setAttribute('aria-label',t('voiceIntentRailLbl','意图分类'));
    [['voiceIntentPromptTitle','voiceIntentPromptTitle'],
     ['voiceIntentPromptDesc','voiceIntentPromptDesc'],
     ['voiceIntentPromptLabel','voiceIntentPromptLabel'],
     ['voiceIntentCamCancelHint','voiceIntentCamCancelHint']].forEach(function(pair){
      var el=$(pair[0]);
      if(el&&!el.querySelector('button')) el.textContent=t(pair[1]);
    });
    var saveHint=$('voicePromptSaveHint');
    if(saveHint
      &&!saveHint.classList.contains('is-ok')
      &&!saveHint.classList.contains('is-editing')
      &&!saveHint.classList.contains('is-saving')
      &&!saveHint.classList.contains('is-fail')){
      saveHint.textContent=t('voicePromptSaveHint','输入后自动保存');
    }
    var customBtn=$('btnVoicePromptCustom');
    if(customBtn) customBtn.textContent=t('voicePromptCustomBtn','＋ 新建');
    var newMain=$('btnVoicePromptNewMain');
    if(newMain){
      newMain.textContent=t('voicePromptCustomBtn','＋ 新建');
      newMain.title=t('voicePromptCustomHint','已开新稿 · 输入后自动进左侧列表');
    }
    var whatSub=$('voicePromptColWhatSub');
    if(whatSub) whatSub.textContent=t('voicePromptColWhatSub','当前口头指令 · 输入即保存');
    var titleLbl=$('voicePromptTitleLbl');
    if(titleLbl) titleLbl.textContent=t('voicePromptTitleLbl','标题（可选）');
    var titleIn=$('voicePromptTitle');
    if(titleIn) titleIn.placeholder=t('voicePromptTitlePh','缩短成列表短名，如：总结改动');
    paintPromptLibrary();
    var aimLegend=$('voiceInputAimStrategyLbl');
    if(aimLegend) aimLegend.textContent=t('voicePromptAimLegend','写入前怎么对准输入框');
    var aimLead=$('voicePromptAimLead');
    if(aimLead) aimLead.textContent=t('voicePromptAimLead','口令都会识别；差别在「要不要自动点框、没对准时写不写」。');
    var colWhat=$('voicePromptColWhatTitle');
    if(colWhat) colWhat.textContent=t('voicePromptColWhat','写什么');
    var colAim=$('voicePromptColAimTitle');
    if(colAim) colAim.textContent=t('voicePromptColAim','怎么对准');
    function setAimCard(value,titleKey,titleFb,descKey,descFb){
      var inp=document.querySelector('input[name="voiceInputAimStrategy"][value="'+value+'"]');
      if(!inp) return;
      var card=inp.closest&&inp.closest('.voice-prompt-aim__card');
      if(!card) return;
      var title=card.querySelector('.voice-prompt-aim__title');
      var desc=card.querySelector('.voice-prompt-aim__desc');
      var badge=card.querySelector('.voice-prompt-aim__badge');
      if(title) title.textContent=t(titleKey,titleFb);
      if(desc) desc.textContent=t(descKey,descFb);
      if(badge) badge.textContent=t('voicePromptAimBadge','推荐');
    }
    setAimCard('none','voicePromptAimNoneTitle','不对准，直接写入','voicePromptAimNoneDesc','假定你已点好框。最快，但焦点在哪就打到哪。');
    setAimCard('auto','voicePromptAimAutoTitle','自动对准再写入','voicePromptAimAutoDesc','说出口令后点到聊天框再填；对不上就取消。一说就要写入时用这个。');
    setAimCard('probe','voicePromptAimProbeTitle','防误写：未对准则跳过','voicePromptAimProbeDesc','聊天框没有光标时，口令触发也不写入。适合旁边开着代码、怕误唤醒写进文件。');
    var calBtn=$('btnVoiceAimCalibrate');
    if(calBtn) calBtn.textContent=t('voiceAimCalBtn','校准此位置');
    var calClear=$('btnVoiceAimCalibrateClear');
    if(calClear) calClear.textContent=t('voiceAimCalClear','清除此位置');
    syncAimCalStatus(null);
    var wakeTag=$('voiceFlowNodeWakeTag');
    if(wakeTag) wakeTag.textContent='01 / '+t('voiceFlowNodeWakeTitle','说了什么');
    var finishTag=$('voiceFlowNodeFinishTag');
    if(finishTag) finishTag.textContent='02 / '+t('voiceFlowNodeFinishTitle','意图效果');
    var wakeHint=$('voiceFlowNodeWakeHint');
    if(wakeHint&&!wakeHint.textContent) wakeHint.textContent='这句口令';
    var finishHint=$('voiceFlowNodeFinishHint');
    if(finishHint&&!finishHint.textContent) finishHint.textContent='匹配到的动作';
    syncHeroVals();
  }

  function openDrawer(panel){
    var hooks=global.OneToneHooks||{};
    if(global.OneToneSettingsDrawer&&global.OneToneSettingsDrawer.open){
      global.OneToneSettingsDrawer.open({panel:panel});
      return;
    }
    if(typeof hooks.setSettingsPanel==='function') hooks.setSettingsPanel(panel);
  }

  function restartAimDemoAnim(){
    var demo=$('voiceAimDemo');
    if(!demo) return;
    /* Toggle data-mode so every [data-mode] child animation restarts together (proto pattern). */
    var mode=demo.getAttribute('data-mode')||'auto';
    demo.removeAttribute('data-mode');
    void demo.offsetWidth;
    demo.setAttribute('data-mode',mode);
  }

  function setAimDemoOpen(open){
    var explain=$('voiceAimExplain');
    var btn=$('btnVoiceAimDemoToggle');
    var lbl=$('voiceAimDemoToggleLbl');
    open=!!open;
    if(explain){
      explain.hidden=!open;
      explain.classList.toggle('is-open',open);
    }
    if(btn) btn.setAttribute('aria-expanded',open?'true':'false');
    if(lbl) lbl.textContent=open
      ?t('voiceAimDemoToggleHide','收起对准演示')
      :t('voiceAimDemoToggleShow','看对准演示');
    if(open) restartAimDemoAnim();
  }

  function syncAimStrategyChrome(aim){
    aim=String(aim||'none');
    if(aim!=='auto'&&aim!=='none'&&aim!=='probe') aim='none';
    var row=$('voicePromptAimRow');
    if(row) row.setAttribute('data-aim',aim);
    var explain=$('voiceAimExplain');
    if(explain) explain.setAttribute('data-mode',aim);
    var demo=$('voiceAimDemo');
    var prev=demo?String(demo.getAttribute('data-mode')||''):'';
    if(demo) demo.setAttribute('data-mode',aim);
    /* Only restart when mode changes (or first paint). syncPromptUi runs often —
       restarting every time pins opacity at 0% and looks like "no animation". */
    if(explain&&!explain.hidden&&prev!==aim) restartAimDemoAnim();
    var panes=document.querySelectorAll('[data-aim-explain]');
    for(var pi=0;pi<panes.length;pi++){
      var pane=panes[pi];
      var on=pane.getAttribute('data-aim-explain')===aim;
      pane.hidden=!on;
    }
    var badge=$('voiceAimDemoBadge');
    if(badge){
      badge.className='voice-aim-demo__badge '+(aim==='auto'?'is-ok':'is-warn');
      if(aim==='auto') badge.textContent=t('voiceAimDemoBadgeAuto','已写入聊天框');
      else if(aim==='none') badge.textContent=t('voiceAimDemoBadgeNone','打进了代码区');
      else badge.textContent=t('voiceAimDemoBadgeProbe','未对准 · 已跳过');
    }
    var cal=$('voicePromptAimCalRow');
    if(cal){
      cal.hidden=aim!=='auto';
      cal.setAttribute('aria-hidden',aim==='auto'?'false':'true');
    }
  }

  function ensurePromptSaveChrome(){
    var desk=$('voicePromptDesk');
    if(!desk) return;
    var host=desk.querySelector('.voice-prompt-col--what')||desk;
    var presets=$('voicePromptPresets');
    if(presets&&!$('btnVoicePromptCustom')){
      var custom=document.createElement('button');
      custom.type='button';
      custom.id='btnVoicePromptCustom';
      custom.textContent=t('voicePromptCustomBtn','＋ 新建');
      presets.appendChild(custom);
    }
    var saveBtn=$('btnVoicePromptSaveScene');
    if(saveBtn) saveBtn.remove();
    if($('voicePromptSaveHint')) return;
    var row=document.createElement('div');
    row.className='voice-prompt-save-row';
    row.innerHTML='<span class="voice-prompt-save-hint" id="voicePromptSaveHint"></span>';
    var pane=host.querySelector('.voice-prompt-edit-pane')||host;
    pane.appendChild(row);
    var hint=$('voicePromptSaveHint');
    if(hint) hint.textContent=t('voicePromptSaveHint','输入后自动保存');
  }

  function bind(){
    ensurePromptSaveChrome();
    var rail=$('voiceIntentRail');
    if(rail&&!rail._intentBound){
      rail._intentBound=true;
      rail.addEventListener('click',function(e){
        var btn=e.target.closest&&e.target.closest('[data-voice-intent]');
        if(!btn) return;
        e.preventDefault();
        setIntent(btn.getAttribute('data-voice-intent'));
      });
    }
    function bindGo(id,fn){
      var el=$(id);
      if(!el||el._bound) return;
      el._bound=true;
      el.addEventListener('click',function(e){ e.preventDefault(); fn(); });
    }
    bindGo('btnVoiceImeGoKeys',function(){ openDrawer('keys'); });
    bindGo('btnVoiceIntentGoKeys',function(){ openDrawer('keys'); });
    bindGo('btnVoiceIntentGoPad',function(){ openDrawer('softpad'); });
    bindGo('btnVoiceIntentGoCam',function(){ openDrawer('camera'); });
    var keycap=$('voiceSettingsTargetKey');
    if(keycap&&!keycap._bound){
      keycap._bound=true;
      keycap.addEventListener('click',function(){ openDrawer('keys'); });
    }
    var goCam=$('btnVoiceDiscardGoCamera');
    if(goCam&&!goCam._bound){
      goCam._bound=true;
      goCam.addEventListener('click',function(e){
        e.preventDefault();
        setIntent('gesture');
      });
    }
    var ta=$('voicePromptInjectBody');
    if(ta&&!ta._bound){
      ta._bound=true;
      ta.addEventListener('input',function(){
        onPromptBodyInput();
        // scheduleAutosave shows 保存中… then savePromptToScene → 已保存
      });
    }
    var titleIn=$('voicePromptTitle');
    if(titleIn&&!titleIn._bound){
      titleIn._bound=true;
      titleIn.addEventListener('input',function(){
        paintPromptArmed();
        scheduleAutosavePromptScene(640);
      });
    }
    var lib=$('voicePromptLib');
    if(lib&&!lib._bound){
      lib._bound=true;
      lib.addEventListener('click',function(e){
        var tplBtn=e.target.closest&&e.target.closest('[data-prompt-tpl]');
        if(tplBtn){
          e.preventDefault();
          applyPromptTemplate(tplBtn.getAttribute('data-prompt-tpl'));
          return;
        }
        var chip=e.target.closest&&e.target.closest('[data-prompt-peer]');
        if(!chip) return;
        e.preventDefault();
        applyPromptMapping(chip.getAttribute('data-prompt-peer'));
      });
    }
    var fromTpl=$('voicePromptFromTpl');
    if(fromTpl&&!fromTpl._bound){
      fromTpl._bound=true;
      fromTpl.addEventListener('click',function(e){
        var tplBtn=e.target.closest&&e.target.closest('[data-prompt-tpl]');
        if(!tplBtn) return;
        e.preventDefault();
        applyPromptTemplate(tplBtn.getAttribute('data-prompt-tpl'));
      });
    }
    var aimSel=$('voiceInputAimStrategy');
    if(aimSel&&!aimSel._bound){
      aimSel._bound=true;
      aimSel.addEventListener('change',function(){
        savePromptText();
      });
    }
    var aimRadios=document.querySelectorAll('input[name="voiceInputAimStrategy"]');
    for(var ai=0;ai<aimRadios.length;ai++){
      var radio=aimRadios[ai];
      if(radio._bound) continue;
      radio._bound=true;
      radio.addEventListener('change',function(){
        var next=String(this.value||'auto');
        var sel=$('voiceInputAimStrategy');
        if(sel) sel.value=next;
        var cards=document.querySelectorAll('.voice-prompt-aim__card');
        for(var ci=0;ci<cards.length;ci++){
          var inp=cards[ci].querySelector('input[name="voiceInputAimStrategy"]');
          cards[ci].classList.toggle('is-on',!!(inp&&inp.checked));
        }
        syncAimStrategyChrome(next);
        savePromptText();
      });
    }
    var calRow=$('voicePromptAimCalRow');
    if(calRow&&!calRow._stopLabelToggle){
      calRow._stopLabelToggle=true;
      calRow.addEventListener('click',function(e){
        // Keep calibrate / spot clicks from flipping the parent radio label.
        e.stopPropagation();
      });
    }
    var demoToggle=$('btnVoiceAimDemoToggle');
    if(demoToggle&&!demoToggle._bound){
      demoToggle._bound=true;
      demoToggle.addEventListener('click',function(e){
        e.preventDefault();
        var explain=$('voiceAimExplain');
        setAimDemoOpen(!(explain&&!explain.hidden));
      });
    }
    setAimDemoOpen(false);
    syncAimStrategyChrome(($('voiceInputAimStrategy')&&$('voiceInputAimStrategy').value)||'none');
    var newBtns=document.querySelectorAll('[data-voice-prompt-new]');
    for(var ni=0;ni<newBtns.length;ni++){
      var nb=newBtns[ni];
      if(nb._bound) continue;
      nb._bound=true;
      nb.addEventListener('click',function(e){
        e.preventDefault();
        startNewCustomPrompt();
      });
    }
    var calBtn=$('btnVoiceAimCalibrate');
    if(calBtn&&!calBtn._bound){
      calBtn._bound=true;
      calBtn.addEventListener('click',function(e){
        e.preventDefault();
        beginAimCalibrate();
      });
    }
    var calClearBtn=$('btnVoiceAimCalibrateClear');
    if(calClearBtn&&!calClearBtn._bound){
      calClearBtn._bound=true;
      calClearBtn.addEventListener('click',function(e){
        e.preventDefault();
        clearActiveAimSlot();
      });
    }
    if(global.document&&!global.document._vpAimCalFocusBound){
      global.document._vpAimCalFocusBound=true;
      global.document.addEventListener('visibilitychange',function(){
        if(!global.document.hidden) refreshAimCalStatus();
      });
      global.window.addEventListener('focus',function(){
        refreshAimCalStatus();
      });
    }
    if(global.chrome&&global.chrome.webview&&typeof global.chrome.webview.addEventListener==='function'
      &&!global.document._vpAimCalToJsBound){
      global.document._vpAimCalToJsBound=true;
      global.chrome.webview.addEventListener('message',function(e){
        var msg=e&&e.data;
        applyAimCalEvent(msg);
      });
    }
  }

  function init(){
    bind();
    var faceTabs=$('voiceFaceTabs');
    if(faceTabs){
      faceTabs.hidden=true;
      faceTabs.setAttribute('aria-hidden','true');
    }
    syncLabels();
    syncRailVisibility();
    if(global.OneToneImePresets&&global.OneToneImePresets.refresh){
      global.OneToneImePresets.refresh('voice');
    }
    // ponytail: assert F picker hosts exist after voice page markup lands
    if(global.document&&global.document.getElementById('voiceIntentPicker')){
      var ok=!!(global.document.getElementById('voiceIntentRail')
        &&global.document.getElementById('voiceIntentPaneIme')
        &&global.document.getElementById('voiceIntentPanePrompt')
        &&global.document.getElementById('voiceIntentPaneKeys')
        &&global.document.getElementById('imePresetStripVoice')
        &&global.document.getElementById('voicePromptInjectBody')
        &&global.document.getElementById('voicePromptTitle')
        &&global.document.getElementById('voicePromptSaveHint')
        &&global.document.getElementById('btnVoicePromptCustom')
        &&global.document.getElementById('btnVoicePromptNewMain')
        &&global.document.getElementById('voicePromptArmed')
        &&global.document.getElementById('voicePromptFromTpl')
        &&global.document.getElementById('voiceWakeAliasBlock')
        &&global.document.getElementById('voiceWakeActionDictate'));
      if(!ok&&global.console&&console.warn){
        console.warn('[voice-intent-rail] markup self-check failed');
      }
    }
  }

  global.OneToneVoiceIntentRail={
    init:init,
    setIntent:setIntent,
    getIntent:currentIntent,
    syncRailVisibility:syncRailVisibility,
    syncLabels:syncLabels,
    syncHeroVals:syncHeroVals,
    applyPromptMapping:applyPromptMapping,
    applyPromptTemplate:applyPromptTemplate,
    savePromptToScene:savePromptToScene,
    startNewCustomPrompt:startNewCustomPrompt,
    beginAimCalibrate:beginAimCalibrate,
    onPromptPeerDeleted:function(mid){
      mid=String(mid||'').trim();
      if(mid&&String(promptEditId)===mid){
        promptEditId='';
        syncPromptSaveHint(false);
      }
      paintPromptLibrary();
    }
  };

  if(global.document&&global.document.readyState==='loading'){
    global.document.addEventListener('DOMContentLoaded',init);
  }else{
    setTimeout(init,0);
  }
})(typeof window!=='undefined'?window:this);
