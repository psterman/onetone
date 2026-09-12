(function(global){
  'use strict';
  var $=function(id){ return global.OneToneDom.$(id); };
  var t=function(key, fallback){
    var v=global.OneToneI18n.t(key);
    return (v===key && fallback!=null)?fallback:v;
  };
  function hooks(){ return global.__vp_key_finish_flow_render_hooks__ || {}; }
  function appState(){ return global.OneToneState.state; }
  var schemeStepFocus='';
  var schemeStepHighlightTimer=0;
  var timingSaveTimer=0;

  function normalizeUiTriggerMode(raw){
    raw=(raw||'tap').toLowerCase();
    if(raw==='toggle') return 'tap';
    if(raw==='hold'||raw==='longpress') return 'perpress';
    return raw;
  }

  function renderModeAnim(opt){
    if(opt==='perpress'){
      return '<div class="mode-anim" aria-hidden="true"><div class="mode-anim-inner mode-anim-hold">'
        +'<span class="ma-chip ma-key ma-k1">1</span><span class="ma-arrow">→</span>'
        +'<span class="ma-chip ma-voice ma-v1">'+t('keyFinishFlowAnimVoice')+'</span>'
        +'</div></div>';
    }
    if(opt==='manual'){
      return '<div class="mode-anim" aria-hidden="true"><div class="mode-anim-inner mode-anim-manual">'
        +'<span class="ma-chip ma-key ma-k1">1</span><span class="ma-arrow">→</span>'
        +'<span class="ma-chip ma-voice ma-v1">'+t('keyFinishFlowAnimVoice')+'</span>'
        +'</div></div>';
    }
    return '<div class="mode-anim" aria-hidden="true"><div class="mode-anim-inner mode-anim-tap">'
      +'<span class="ma-chip ma-key ma-k1">1</span><span class="ma-arrow">→</span>'
      +'<span class="ma-chip ma-voice ma-v1">'+t('keyFinishFlowAnimVoice')+'</span>'
      +'<span class="ma-arrow">→</span><span class="ma-chip ma-key ma-k2">2</span><span class="ma-arrow ma-a1">→</span>'
      +'<span class="ma-out-stack">'
      +'<span class="ma-chip ma-esc ma-out-cancel">'+t('keyFinishFlowAnimCancel')+'</span>'
      +'<span class="ma-chip ma-enter ma-out-enter">'+t('keyFinishFlowAnimConfirm')+'</span>'
      +'</span></div></div>';
  }

  function finishModeIcon(mode){
    var c='class="habit-mode-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"';
    if(mode==='perpress') return '<svg '+c+'><path d="M22 2 11 13"/><path d="M22 2 15 22 11 13 2 9 22 2z"/></svg>';
    if(mode==='confirm') return '<svg '+c+'><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';
    return '<svg '+c+'><path d="M18 11V6a2 2 0 0 0-2-2"/><path d="M14 10V4a2 2 0 0 0-2-2"/><path d="M10 10.5V6a2 2 0 0 0-2-2"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/></svg>';
  }

  function primaryAppIdForMapping(m){
    return m&&String(m.appTargetId||'').trim()||'';
  }

  function resolveDisplayedFinishMode(m){
    var fs=global.OneToneSceneFlowSummary;
    if(!fs) return 'manual';
    var rules=global.OneToneAppBehaviorRules;
    var ctx=activeAppContextId();
    if(!ctx&&rules&&rules.resolvePreviewContext) ctx=rules.resolvePreviewContext(m)||'';
    if(ctx&&fs.resolveEffectiveFinishMode) return fs.resolveEffectiveFinishMode(m,ctx);
    var appId=primaryAppIdForMapping(m);
    if(appId&&fs.resolveEffectiveFinishMode) return fs.resolveEffectiveFinishMode(m,appId);
    return fs.resolveFinishMode?fs.resolveFinishMode(m):'manual';
  }

  function startGesture(m){
    var fs=global.OneToneSceneFlowSummary;
    if(fs&&fs.resolveStartGesture) return fs.resolveStartGesture(m);
    var raw=String(m&&m.triggerMode||'tap').toLowerCase();
    if(raw==='hold'||raw==='longpress'||raw==='perpress') return 'hold';
    if(raw==='double') return 'double';
    return 'tap';
  }

  function finishModeOptionMeta(mode,gesture){
    if(mode==='perpress'){
      return {title:'habitFinishModeAuto',desc:'habitFinishModeAutoDesc',hint:'keysFinishModeHintHold'};
    }
    if(mode==='confirm'){
      if(gesture==='double'){
        return {title:'habitFinishModeConfirmDouble',desc:'habitFinishModeConfirmDoubleDesc',hint:'keysFinishModeHintDoubleSend',recommended:true};
      }
      return {title:'habitFinishModeConfirmSend',desc:'habitFinishModeConfirmSendDesc',hint:'keysFinishModeHintTapSend',recommended:true};
    }
    if(gesture==='double'){
      return {title:'habitFinishModeManualDouble',desc:'habitFinishModeManualDoubleDesc',hint:'keysFinishModeHintDoubleManual'};
    }
    return {title:'habitFinishModeManual',desc:'habitFinishModeManualDesc',hint:'keysFinishModeHintTapManual'};
  }

  function allowedFinishModes(m){
    var fs=global.OneToneSceneFlowSummary;
    var gesture=startGesture(m);
    if(fs&&fs.finishModesForGesture) return fs.finishModesForGesture(gesture);
    return gesture==='hold'?['perpress']:['confirm','manual'];
  }

  function finishModeHintKey(mode,gesture){
    return finishModeOptionMeta(mode,gesture||'tap').hint;
  }

  function finishModeHintText(mode,gesture,m){
    var key=finishModeHintKey(mode,gesture||'tap');
    var text=t(key);
    if(mode==='confirm'&&m){
      hooks().ensureMappingTiming(m);
      var sec=((Number(m.enterDelayMs)||2000)/1000).toFixed(1);
      text=text.replace('{n}',sec);
    }
    return text;
  }

  function buildKeysFinishChromeModel(m,finishMode){
    if(arguments.length===0){
      m=hooks().selectedMapping();
      finishMode=m?resolveDisplayedFinishMode(m):'';
    }else if(arguments.length===1){
      finishMode=m?resolveDisplayedFinishMode(m):'';
    }
    var gesture=m?startGesture(m):'tap';
    var hintText='';
    var hintHidden=true;
    if(m&&finishMode){
      var allowed=allowedFinishModes(m);
      if(allowed.indexOf(finishMode)<0) finishMode=allowed[0]||'manual';
      hintText=finishModeHintText(finishMode,gesture,m);
      hintHidden=false;
    }
    // Cancel strategies (key / phrase / camera) stay visible for any finish mode; key channel self-gates.
    var moreHidden=!m;
    var previewText='—';
    var previewSaved=false;
    if(m&&global.OneToneSceneFlowSummary&&global.OneToneSceneFlowSummary.finishStrategyPreviewText){
      var rules=global.OneToneAppBehaviorRules;
      var ctx=activeAppContextId();
      if(!ctx&&rules&&rules.resolvePreviewContext) ctx=rules.resolvePreviewContext(m)||'';
      if(!ctx) ctx=primaryAppIdForMapping(m)||'';
      var preview=global.OneToneSceneFlowSummary.finishStrategyPreviewText(m,ctx);
      previewText=preview.text||'—';
      previewSaved=!!preview.saved;
    }
    var previewClass='keys-finish-strategy-preview'+(previewSaved?' is-set':' is-empty');
    var mappingId=m&&m.id?String(m.id):'';
    var delayMs=m?String(m.enterDelayMs||0):'0';
    var sig=[mappingId,finishMode||'',hintText,moreHidden?'1':'0',previewText,previewSaved?'1':'0',delayMs].join('\0');
    return {
      hintText:hintText,
      hintHidden:hintHidden,
      moreHidden:moreHidden,
      previewText:previewText,
      previewClass:previewClass,
      previewSaved:previewSaved,
      mappingId:mappingId,
      finishMode:finishMode||'',
      sig:sig
    };
  }

  function applyKeysFinishChromeHost(model){
    if(!model) model=buildKeysFinishChromeModel();
    if(global.__otKeysFinishChromeMounted&&typeof global.__otKeysFinishChromeSync==='function'){
      global.__otKeysFinishChromeSync();
      return;
    }
    var hint=$('keysFinishModeHint');
    if(hint){
      hint.textContent=model.hintText||'';
      hint.hidden=!!model.hintHidden;
    }
    var more=$('habitFlowFinishMore');
    if(more){
      more.hidden=!!model.moreHidden;
      more.open=true;
    }
    var el=$('keysFinishStrategyPreview');
    if(el){
      // Desk options card already has mode hint + delay; keep strategy line for scripts only.
      el.textContent=model.previewText||'—';
      el.className=(model.previewClass||'keys-finish-strategy-preview is-empty')+' sr-only';
      el.hidden=true;
    }
  }

  function syncKeysFinishModeChrome(m,finishMode){
    applyKeysFinishChromeHost(buildKeysFinishChromeModel(m,finishMode));
  }

  function renderKeyFinishModeSegmented(m){
    var current=resolveDisplayedFinishMode(m);
    var gesture=startGesture(m);
    var allowed=allowedFinishModes(m);
    if(allowed.indexOf(current)<0) current=allowed[0]||'manual';
    var html='<div class="keys-finish-segments" role="radiogroup" aria-label="'+t('habitFlowStepFinishLbl')+'">';
    allowed.forEach(function(mode){
      var meta=finishModeOptionMeta(mode,gesture);
      var active=current===mode;
      html+='<button type="button" class="keys-finish-segment'+(active?' is-active':'')+'" data-finish-mode="'+mode+'" role="radio" aria-checked="'+(active?'true':'false')+'">';
      html+='<span class="keys-finish-segment-label">'+t(meta.title)+'</span>';
      if(meta.desc) html+='<span class="keys-finish-segment-desc">'+t(meta.desc)+'</span>';
      html+='</button>';
    });
    html+='</div>';
    return html;
  }

  function renderKeysFinishDelayOnly(m,id){
    hooks().ensureMappingTiming(m);
    var ms=Number(m.enterDelayMs||2000);
    if(!(ms>=1000)) ms=2000;
    var seconds=(ms/1000).toFixed(1);
    var presets=[1000,2000,3000];
    var matched=null;
    for(var i=0;i<presets.length;i++){
      if(Math.abs(ms-presets[i])<50){ matched=presets[i]; break; }
    }
    var customOpen=!matched;
    var html='<div class="keys-finish-delay-inline">';
    html+='<div class="keys-finish-delay-row">';
    html+='<span class="keys-finish-delay-lbl">'+t('sendTimingTitle')+'</span>';
    html+='<div class="keys-finish-delay-chips" role="group" aria-label="'+t('sendTimingTitle')+'">';
    presets.forEach(function(p){
      var sec=String(p/1000);
      var active=matched===p;
      html+='<button type="button" class="keys-finish-delay-chip'+(active?' is-active':'')+'" data-delay-ms="'+p+'" data-timing-id="'+id+'" aria-pressed="'+(active?'true':'false')+'">'+sec+'s</button>';
    });
    html+='<button type="button" class="keys-finish-delay-chip keys-finish-delay-chip--custom'+(customOpen?' is-active':'')+'" data-delay-custom="1" data-timing-id="'+id+'" aria-pressed="'+(customOpen?'true':'false')+'">'+t('sendTimingCustom')+'</button>';
    html+='</div></div>';
    html+='<div class="voice-end-inline-range keys-finish-delay-range keys-finish-delay-controls'+(customOpen?'':' is-collapsed')+'"'+(customOpen?'':' hidden')+'>';
    html+='<input type="range" class="map-timing-range" data-timing-range="'+id+'" data-field="enterDelayMs" min="1000" max="15000" step="500" value="'+ms+'">';
    html+='<input type="number" class="keys-finish-delay-input" data-timing-range="'+id+'" data-field="enterDelayMs" min="1" max="15" step="0.5" value="'+seconds+'">';
    html+='</div></div>';
    return html;
  }

  function activeAppContextId(){
    var ed=global.OneToneMappingEditorState;
    if(ed&&ed.getEditorActiveAppContextId) return ed.getEditorActiveAppContextId()||'';
    if(global.OneToneAppBehaviorRules&&global.OneToneAppBehaviorRules.getActiveAppContextId) return global.OneToneAppBehaviorRules.getActiveAppContextId()||'';
    return '';
  }

  function renderKeysFinishStrategyPreview(m){
    if(global.__otKeysFinishChromeMounted&&typeof global.__otKeysFinishChromeSync==='function'){
      global.__otKeysFinishChromeSync();
      return;
    }
    if(!global.OneToneSceneFlowSummary||!global.OneToneSceneFlowSummary.finishStrategyPreviewText) return;
    applyKeysFinishChromeHost(buildKeysFinishChromeModel(m));
  }

  function refreshFinishModeSegment(m){
    if(!m) m=hooks().selectedMapping();
    if(!m||!hooks().isSavedMapping||!hooks().isSavedMapping(m)) return;
    var modePanel=$('voiceEndKeyModePanel');
    if(!modePanel) return;
    var current=resolveDisplayedFinishMode(m);
    if(global.__otKeysFinishModeMounted&&typeof global.__otKeysFinishModeSync==='function'){
      global.__otKeysFinishModeSync();
      syncKeysFinishModeChrome(m,current);
      renderKeysFinishStrategyPreview(m);
      return;
    }
    modePanel.querySelectorAll('[data-finish-mode]').forEach(function(btn){
      var active=btn.dataset.finishMode===current;
      btn.classList.toggle('is-active',active);
      btn.setAttribute('aria-checked',active?'true':'false');
    });
    syncKeysFinishModeChrome(m,current);
    renderKeysFinishStrategyPreview(m);
  }

  var CANCEL_GESTURE_KEYS=['shakeHead','openPalm','deliberateBlink','wave','fist','okHand'];
  var CANCEL_GESTURE_I18N={
    shakeHead:'keysCancelGestureShakeHead',
    openPalm:'keysCancelGestureOpenPalm',
    deliberateBlink:'keysCancelGestureBlink',
    wave:'keysCancelGestureWave',
    fist:'keysCancelGestureFist',
    okHand:'keysCancelGestureOk'
  };
  var CANCEL_GESTURE_FALLBACK={
    shakeHead:'摇头',
    openPalm:'五指张开',
    deliberateBlink:'故意闭眼',
    wave:'挥手',
    fist:'握拳',
    okHand:'OK'
  };

  function escHtmlLocal(s){
    if(hooks().escHtml) return hooks().escHtml(s);
    return String(s==null?'':s)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');
  }

  function isEscCancelAction(action){
    var s=String(action||'').trim().toLowerCase();
    if(!s||s==='none') return false;
    if(s==='pressesc') return true;
    if(s==='input.cancel'||s==='agent:input.cancel') return true;
    if(s==='cancel'||s==='agent:cancel') return true;
    return false;
  }

  function presenceActionsForCancelUi(){
    var cfg=appState().config||{};
    var cp=cfg.cameraPrefs||{};
    var base=cp.presenceActions&&typeof cp.presenceActions==='object'?cp.presenceActions:{};
    var m=hooks().selectedMapping();
    var ov=m&&m.cameraOverride&&typeof m.cameraOverride==='object'?m.cameraOverride:null;
    if(!ov) return base;
    var out=Object.assign({},base);
    CANCEL_GESTURE_KEYS.forEach(function(k){
      if(ov[k]!=null) out[k]=ov[k];
    });
    return out;
  }

  function listCameraCancelGestures(){
    var pa=presenceActionsForCancelUi();
    return CANCEL_GESTURE_KEYS.filter(function(k){ return isEscCancelAction(pa[k]); });
  }

  function cameraCancelChannelOn(){
    return listCameraCancelGestures().length>0;
  }

  function readCancelPhraseLists(){
    var cfg=appState().config||{};
    var end=cfg.voiceEnd||cfg.voice_end||{};
    var zh=end.cancelPhrasesZh||end.cancel_phrases_zh||[];
    var en=end.cancelPhrasesEn||end.cancel_phrases_en||[];
    if(!Array.isArray(zh)) zh=[];
    if(!Array.isArray(en)) en=[];
    return {zh:zh,en:en,enabled:!!(end.enabled||end.Enabled)};
  }

  function cancelPhraseChannelOn(){
    var lists=readCancelPhraseLists();
    return !!(lists.enabled&&(lists.zh.length||lists.en.length));
  }

  function setCameraCancelGesture(bindKey,wantOn){
    var key=String(bindKey||'').trim();
    if(CANCEL_GESTURE_KEYS.indexOf(key)<0) return Promise.resolve(false);
    var cam=global.OneToneCameraPresenceActions;
    var m=hooks().selectedMapping();
    var mid=m&&m.id?String(m.id):'';
    var token=wantOn?'pressEsc':'none';
    function afterOk(){
      if(wantOn){
        try{
          var cfg=appState().config||{};
          if(cfg.cameraPrefs&&cfg.cameraPrefs.presenceActions&&!cfg.cameraPrefs.presenceActions.enabled){
            cfg.cameraPrefs.presenceActions.enabled=true;
            cfg.cameraPrefs.enabled=true;
            var p=global.OneToneConfigPersist;
            if(p&&p.saveCameraPrefsQuiet) p.saveCameraPrefsQuiet();
            else if(p&&p.saveAsync) p.saveAsync();
          }
        }catch(_){}
      }
      return true;
    }
    function fail(err){
      if(global.OneToneApp&&global.OneToneApp.toast){
        global.OneToneApp.toast(t('keysCancelCameraFail','摄像头绑定失败'),'warn');
      }
      if(global.console&&console.warn) console.warn('[keys-cancel] camera bind',err);
      return false;
    }
    // Keys page edits the selected scene — write mapping.cameraOverride, not global prefs.
    if(mid&&cam&&typeof cam.persistBindActionMappingScoped==='function'){
      return cam.persistBindActionMappingScoped(mid,key,token).then(function(){
        // Keep gesture trigger bit on the scene so detection can fire.
        try{
          if(m){
            var trigMap={shakeHead:'shake',deliberateBlink:'blink',openPalm:'openPalm',okHand:'okHand',fist:'fist',wave:'wave'};
            var tk=trigMap[key];
            if(tk){
              if(!m.cameraOverride||typeof m.cameraOverride!=='object') m.cameraOverride={};
              if(!m.cameraOverride.triggers||typeof m.cameraOverride.triggers!=='object') m.cameraOverride.triggers={};
              if(wantOn) m.cameraOverride.triggers[tk]=true;
            }
          }
        }catch(_){}
        return afterOk();
      }).catch(fail);
    }
    if(cam&&typeof cam.persistBindAction==='function'){
      return cam.persistBindAction(mid,key,token).then(afterOk).catch(fail);
    }
    // Fallback: write prefs directly
    try{
      var cfg2=appState().config||{};
      if(!cfg2.cameraPrefs) cfg2.cameraPrefs={};
      if(!cfg2.cameraPrefs.presenceActions) cfg2.cameraPrefs.presenceActions={};
      var pa2=cfg2.cameraPrefs.presenceActions;
      pa2[key]=token;
      if(wantOn){ pa2.enabled=true; cfg2.cameraPrefs.enabled=true; }
      if(!pa2.triggers) pa2.triggers={};
      if(wantOn){
        if(key==='shakeHead') pa2.triggers.shake=true;
        else if(key==='deliberateBlink') pa2.triggers.blink=true;
        else if(key==='openPalm') pa2.triggers.openPalm=true;
        else if(key==='okHand') pa2.triggers.okHand=true;
        else if(key==='fist') pa2.triggers.fist=true;
        else if(key==='wave') pa2.triggers.wave=true;
      }
      var pers=global.OneToneConfigPersist;
      if(pers&&pers.saveCameraPrefsQuiet) pers.saveCameraPrefsQuiet();
      else if(pers&&pers.saveAsync) pers.saveAsync();
    }catch(_){}
    return Promise.resolve(afterOk());
  }

  function clearAllCameraCancelGestures(){
    var active=listCameraCancelGestures();
    var chain=Promise.resolve(true);
    active.forEach(function(k){
      chain=chain.then(function(){ return setCameraCancelGesture(k,false); });
    });
    return chain;
  }

  function renderKeysFinishCancelOnly(m,id){
    hooks().ensureMappingTiming(m);
    var finishMode=resolveDisplayedFinishMode(m);
    var keyOk=finishMode==='confirm';
    var keyOn=!!(keyOk&&m.cancelEnabled!==false);
    var phraseLists=readCancelPhraseLists();
    var phraseOn=cancelPhraseChannelOn();
    var camGestures=listCameraCancelGestures();
    var camOn=camGestures.length>0;
    var ms=Number(m.intervalMs||1200);
    if(!(ms>=200)) ms=1200;
    var winPresets=[500,1200,2000];
    var winMatched=null;
    for(var i=0;i<winPresets.length;i++){
      if(Math.abs(ms-winPresets[i])<50){ winMatched=winPresets[i]; break; }
    }

    var activePills=[];
    if(keyOn) activePills.push(t('keysCancelSummaryKey'));
    if(phraseOn) activePills.push(t('keysCancelSummaryPhrase'));
    if(camOn&&camGestures.length) activePills.push(t('keysCancelSummaryCamera'));

    var html='<div class="keys-cancel-strategy'+(keyOk?'':' is-key-gated')+'" data-keys-cancel-strategy="1">';
    html+='<div class="keys-cancel-head">';
    html+='<div class="keys-cancel-head-main">';
    html+='<p class="keys-cancel-title">'+escHtmlLocal(t('habitFlowFinishMoreSummary'))+'</p>';
    if(activePills.length){
      html+='<div class="keys-cancel-active" aria-label="'+escHtmlLocal(t('keysCancelOrShort'))+'">';
      activePills.forEach(function(label){
        html+='<span class="keys-cancel-dot"><i aria-hidden="true"></i>'+escHtmlLocal(label)+'</span>';
      });
      html+='</div>';
    }
    html+='</div>';
    html+='<p class="keys-cancel-or">'+escHtmlLocal(t('keysCancelOrShort'))+'</p>';
    html+='</div>';
    if(!keyOk){
      html+='<p class="keys-cancel-gate-note">'+escHtmlLocal(t('keysCancelKeyGated'))+'</p>';
    }

    html+='<div class="keys-cancel-list">';

    // Key row — label + optional window chips + visible switch
    html+='<div class="keys-cancel-row'+(keyOn?' is-on':'')+'" data-cancel-row="key">';
    html+='<span class="keys-cancel-lab">'+escHtmlLocal(t('keysCancelSummaryKey'))+'</span>';
    html+='<div class="keys-cancel-ctrl">';
    if(keyOn){
      winPresets.forEach(function(p){
        var sec=p===1200?'1.2':String(p/1000);
        html+='<button type="button" class="keys-cancel-chip'+(winMatched===p?' is-active':'')+'" data-cancel-win="'+p+'" data-timing-id="'+escHtmlLocal(id)+'" aria-pressed="'+(winMatched===p?'true':'false')+'">'+sec+'s</button>';
      });
      html+='<button type="button" class="keys-cancel-chip'+(winMatched?'':' is-active')+'" data-cancel-win="custom" data-timing-id="'+escHtmlLocal(id)+'">'+escHtmlLocal(t('sendTimingCustom'))+'</button>';
      if(!winMatched){
        html+='<input type="range" class="map-timing-range keys-cancel-range" data-timing-range="'+escHtmlLocal(id)+'" data-field="intervalMs" min="200" max="5000" step="100" value="'+ms+'">';
      }
    }else{
      html+='<span class="keys-cancel-meta">'+escHtmlLocal(t('keysCancelOrShort'))+'</span>';
    }
    html+='</div>';
    html+='<button type="button" class="toggle-switch'+(keyOn?' is-on':'')+'" data-timing-toggle="'+escHtmlLocal(id)+'" data-field="cancelEnabled"'+(keyOk?'':' disabled')+' role="switch" aria-checked="'+(keyOn?'true':'false')+'" aria-label="'+escHtmlLocal(t('keysCancelSummaryKey'))+'"></button>';
    html+='</div>';

    // Phrase row — inline tags (no master switch; voiceEnd has no cancel-only flag)
    html+='<div class="keys-cancel-row'+(phraseOn?' is-on':'')+'" data-cancel-row="phrase">';
    html+='<span class="keys-cancel-lab">'+escHtmlLocal(t('keysCancelSummaryPhrase'))+'</span>';
    html+='<div class="keys-cancel-ctrl">';
    if(phraseOn){
      var showPhrases=phraseLists.zh.length?phraseLists.zh.slice():phraseLists.en.slice();
      showPhrases.forEach(function(ph,idx){
        html+='<span class="keys-cancel-chip is-tag">'
          +escHtmlLocal(ph)
          +'<button type="button" class="keys-cancel-chip-x" data-cancel-phrase-remove="'+idx+'" aria-label="'+escHtmlLocal(t('keysCancelPhraseRemove','删除'))+'">×</button>'
          +'</span>';
      });
      html+='<span class="keys-cancel-add">'
        +'<input type="text" class="keys-cancel-add-input" data-cancel-phrase-input maxlength="24" placeholder="'+escHtmlLocal(t('keysCancelPhraseAddPh','新取消词'))+'" />'
        +'<button type="button" class="keys-cancel-chip is-link" data-cancel-phrase-add="1">'+escHtmlLocal(t('keysCancelPhraseAdd','添加'))+'</button>'
        +'</span>';
    }else{
      html+='<span class="keys-cancel-meta">'+escHtmlLocal(t('keysCancelPhraseOffHint','说取消词 → Esc'))+'</span>';
    }
    html+='</div>';
    if(!phraseOn){
      html+='<button type="button" class="toggle-switch" data-cancel-channel="phrase" role="switch" aria-checked="false" aria-label="'+escHtmlLocal(t('keysCancelSummaryPhrase'))+'"></button>';
    }else{
      html+='<span class="keys-cancel-switch-slot" aria-hidden="true"></span>';
    }
    html+='</div>';

    // Camera row
    html+='<div class="keys-cancel-row'+(camOn?' is-on':'')+'" data-cancel-row="camera">';
    html+='<span class="keys-cancel-lab">'+escHtmlLocal(t('keysCancelSummaryCamera'))+'</span>';
    html+='<div class="keys-cancel-ctrl">';
    if(camOn){
      CANCEL_GESTURE_KEYS.forEach(function(gk){
        var active=camGestures.indexOf(gk)>=0;
        var label=t(CANCEL_GESTURE_I18N[gk])||CANCEL_GESTURE_FALLBACK[gk];
        html+='<button type="button" class="keys-cancel-chip'+(active?' is-active':'')+'" data-cancel-gesture="'+gk+'" aria-pressed="'+(active?'true':'false')+'">'+escHtmlLocal(label)+'</button>';
      });
      if(!camGestures.length){
        html+='<span class="keys-cancel-gesture-warn">'+escHtmlLocal(t('keysCancelGestureNeedOne'))+'</span>';
      }
    }else{
      html+='<span class="keys-cancel-meta">'+escHtmlLocal(t('keysCancelCameraOffHint','手势取消'))+'</span>';
    }
    html+='</div>';
    html+='<button type="button" class="toggle-switch'+(camOn?' is-on':'')+'" data-cancel-channel="camera" role="switch" aria-checked="'+(camOn?'true':'false')+'" aria-label="'+escHtmlLocal(t('keysCancelSummaryCamera'))+'"></button>';
    html+='</div>';

    html+='</div></div>';
    return html;
  }

  function useKeysFinishSegmented(){
    return !!$('keysFinishModeHost');
  }

  function renderKeyFinishModeBlock(m){
    var current=resolveDisplayedFinishMode(m);
    var gesture=startGesture(m);
    var allowed=allowedFinishModes(m);
    if(allowed.indexOf(current)<0) current=allowed[0]||'manual';
    var html='<div class="map-trigger-mode habit-finish-modes">';
    html+='<div class="habit-finish-mode-list">';
    allowed.forEach(function(mode){
      var meta=finishModeOptionMeta(mode,gesture);
      var active=current===mode;
      html+='<button type="button" class="habit-finish-mode-option'+(active?' is-active':'')+'" data-finish-mode="'+mode+'">';
      html+=finishModeIcon(mode);
      html+='<span class="habit-finish-mode-copy"><span class="habit-finish-mode-title">'+t(meta.title)+'</span>';
      if(meta.recommended) html+='<span class="habit-finish-mode-badge">'+t('habitFinishModeRecommended')+'</span>';
      html+='<span class="habit-finish-mode-desc">'+t(meta.desc)+'</span></span>';
      if(active) html+='<svg class="habit-finish-mode-check" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>';
      html+='</button>';
    });
    html+='</div></div>';
    return html;
  }

  function renderKeyTimingCard(m,id,kind,opts){
    hooks().ensureMappingTiming(m);
    opts=opts||{};
    var onTxt=t('keyFinishFlowStatusOn');
    var offTxt=t('keyFinishFlowStatusOff');
    var isCancel=kind==='cancel';
    var compact=!!(opts.compact&&isCancel);
    var finishMode=global.OneToneSceneFlowSummary?global.OneToneSceneFlowSummary.resolveFinishMode(m):'manual';
    var active=finishMode==='confirm';
    var enabledField=isCancel?'cancelEnabled':'autoEnterEnabled';
    var rangeField=isCancel?'intervalMs':'enterDelayMs';
    var titleKey=isCancel?'cancelTimingTitle':'sendTimingTitle';
    var descKey=isCancel?'cancelTimingDesc':'sendTimingDesc';
    var rangeMin=isCancel?200:1000;
    var rangeMax=isCancel?5000:15000;
    var rangeStep=isCancel?100:500;
    var seconds=((isCancel?m.intervalMs:m.enterDelayMs)/1000).toFixed(1);
    var snap=(hooks().voiceUiSnapshot()||{}).end||{};
    var html='';
    if(active&&!isCancel&&snap.autoSendEnabled&&m.autoEnterEnabled){
      html+='<p class="map-timing-desc map-send-mode-hint">'+t('voiceEndAutoSendWarn')+'</p>';
    }
    // Compact cancel: one row (label+toggle) + one desc + slider — no third "取消窗口" title.
    if(compact){
      html+='<div class="setting-row"><div class="setting-row-main"><span class="setting-row-text">'+t('keysFinishCancelEnable')+'</span></div>';
      if(active){
        html+='<button type="button" class="toggle-switch'+(m[enabledField]?' is-on':'')+'" data-timing-toggle="'+id+'" data-field="'+enabledField+'" role="switch" aria-checked="'+(m[enabledField]?'true':'false')+'" aria-label="'+t(titleKey)+'"></button></div>';
        html+='<p class="map-timing-desc">'+t(descKey).replace('{n}',seconds)+'</p>';
        html+='<div class="voice-end-inline-range"><input type="range" class="map-timing-range" data-timing-range="'+id+'" data-field="'+rangeField+'" min="'+rangeMin+'" max="'+rangeMax+'" step="'+rangeStep+'" value="'+m[rangeField]+'"'+(m[enabledField]?'':' disabled')+'></div>';
      }else{
        html+='<button type="button" class="toggle-switch" role="switch" aria-checked="false" disabled aria-label="'+t(titleKey)+'"></button></div>';
        html+='<p class="map-timing-desc">'+t('cancelTimingUnused')+'</p>';
      }
      return html;
    }
    html+='<div class="setting-row"><div class="setting-row-main"><span class="setting-row-text">'+t(titleKey)+'</span></div>';
    if(active){
      html+='<button type="button" class="toggle-switch'+(m[enabledField]?' is-on':'')+'" data-timing-toggle="'+id+'" data-field="'+enabledField+'" role="switch" aria-checked="'+(m[enabledField]?'true':'false')+'"></button></div>';
      html+='<p class="map-timing-desc">'+(m[enabledField]?onTxt:offTxt)+' · '+t(descKey).replace('{n}',seconds)+'</p>';
      html+='<div class="voice-end-inline-range"><input type="range" class="map-timing-range" data-timing-range="'+id+'" data-field="'+rangeField+'" min="'+rangeMin+'" max="'+rangeMax+'" step="'+rangeStep+'" value="'+m[rangeField]+'"'+(m[enabledField]?'':' disabled')+'></div>';
    }else{
      html+='<button type="button" class="toggle-switch" role="switch" aria-checked="false" disabled></button></div>';
      html+='<p class="map-timing-desc">'+offTxt+' · '+t(isCancel?'cancelTimingUnused':'sendTimingUnused')+'</p>';
    }
    return html;
  }

  function focusSchemeEditStep(step,opts){
    if(!step) return;
    opts=opts||{};
    schemeStepFocus=step;
    if(global.OneToneHabitLayerNav) global.OneToneHabitLayerNav.setHabitLayer('global');
    var flowIds={trigger:'sceneFlowStepTrigger',target:'sceneFlowStepTarget',finish:'sceneFlowStepFinish'};
    var editIds={trigger:'habitKeyMapRowTrigger',target:'habitKeyMapRowTarget',finish:'keysCaptureKeyPanel',cancel:'habitKeyMapRowCancel'};
    ['trigger','target','finish','cancel'].forEach(function(s){
      var card=$(editIds[s]);
      if(card) card.classList.remove('is-focus-highlight');
    });
    var stepOpts={skipScroll:true};
    if(opts.returnPanel) stepOpts.returnPanel=opts.returnPanel;
    if(global.OneToneKeysPageState){
      if(step==='finish'||step==='cancel'){
        stepOpts.expandFinishMore=step==='cancel';
        global.OneToneKeysPageState.setStep('finish',stepOpts);
      }else{
        global.OneToneKeysPageState.setStep(step,stepOpts);
      }
    }
    var focusStep=step==='cancel'?'finish':step;
    var card=$(editIds[focusStep]);
    if(card){
      card.classList.add('is-focus-highlight');
      clearTimeout(schemeStepHighlightTimer);
      schemeStepHighlightTimer=setTimeout(function(){
        card.classList.remove('is-focus-highlight');
      },1500);
    }else if(step==='cancel'){
      var cancelCard=$('habitKeyMapRowCancel');
      if(cancelCard){
        cancelCard.classList.add('is-focus-highlight');
        clearTimeout(schemeStepHighlightTimer);
        schemeStepHighlightTimer=setTimeout(function(){
          cancelCard.classList.remove('is-focus-highlight');
        },1500);
      }
    }else{
      var flowEl=$(flowIds[step]);
      if(flowEl) flowEl.scrollIntoView({behavior:'smooth',block:'nearest'});
    }
    var nodes=$('keysFlowNodes');
    var desk=$('keysDeskPanel');
    if(nodes&&nodes.scrollIntoView) nodes.scrollIntoView({behavior:'smooth',block:'nearest'});
    if(desk&&desk.scrollIntoView) desk.scrollIntoView({behavior:'smooth',block:'nearest'});
    if(global.OneToneHabitKeyMappingTable){
      if(step==='cancel'){
        global.OneToneHabitKeyMappingTable.highlightRow('cancel');
      }else{
        global.OneToneHabitKeyMappingTable.highlightRow(step);
      }
    }
    syncKeySchemeTimeline(step==='cancel'?'finish':step);
  }

  function renderKeySchemeCardHeader(){
    hooks().ensureConfig();
    var m=hooks().selectedMapping();
    if(global.OneToneSceneTabs&&global.OneToneSceneTabs.renderHero) global.OneToneSceneTabs.renderHero();
    else if(global.OneToneSceneFlowSummary) global.OneToneSceneFlowSummary.renderLabels();
    var addBtn=$('btnKeySchemeAdd');
    var delBtn=$('btnKeySchemeDelete');
    var busy=global.OneToneMappingRecording.mode()!=='none';
    if(addBtn){
      addBtn.textContent=t('habitSwitcherNew');
      var ready=hooks().isCurrentDraftComplete();
      addBtn.disabled=!ready||busy;
      addBtn.title=(!ready&&!busy)?t('addNeedComplete'):'';
    }
    if(delBtn){
      delBtn.textContent=t('delete');
      delBtn.disabled=!m||busy;
    }
    var stepTriggerTitle=$('keySchemeStepTriggerTitle');
    var stepTargetTitle=$('keySchemeStepTargetTitle');
    var stepFinishTitle=$('keySchemeStepFinishTitle');
    if(stepTriggerTitle) stepTriggerTitle.textContent=t('keySchemeStepTriggerTitle');
    if(stepTargetTitle) stepTargetTitle.textContent=t('keySchemeStepTargetTitle');
    if(stepFinishTitle) stepFinishTitle.textContent=t('keyExecFinishTitle');
  }

  function syncKeySchemeTimeline(focusStep){
    hooks().ensureConfig();
    var m=hooks().selectedMapping();
    var activeStep=focusStep
      ||(global.OneToneMappingRecording.mode()==='trigger'?'trigger':global.OneToneMappingRecording.mode()==='target'?'target':'')
      ||schemeStepFocus;
    if(global.OneToneSceneFlowSummary){
      global.OneToneSceneFlowSummary.syncFlowSummary(m,{context:'settings',focusStep:activeStep});
    }
    var trig=hooks().selectedDisplayTriggerKey();
    var tgt=hooks().selectedDisplayTargetKey();
    var trigSummary=$('keySchemeStepTriggerSummary');
    var tgtSummary=$('keySchemeStepTargetSummary');
    var finSummary=$('keySchemeStepFinishSummary');
    if(trigSummary) trigSummary.textContent=trig?hooks().friendlyKeyName(trig):t('homeKeyMapEmptyKey');
    if(tgtSummary) tgtSummary.textContent=tgt?hooks().friendlyKeyName(tgt):t('homeKeyMapEmptyKey');
    if(finSummary){
      var rules=global.OneToneAppBehaviorRules;
      var ctx=activeAppContextId();
      if(!ctx&&rules&&rules.resolvePreviewContext) ctx=rules.resolvePreviewContext(m)||'';
      var preview=global.OneToneSceneFlowSummary&&global.OneToneSceneFlowSummary.finishStrategyPreviewText
        ?global.OneToneSceneFlowSummary.finishStrategyPreviewText(m,ctx)
        :hooks().keyFinishPreviewText(m);
      finSummary.textContent=(preview&&preview.text)||(preview&&preview.summary)||'—';
    }
    var steps=[
      {id:'keySchemeStepTrigger',step:'trigger',done:!!trig},
      {id:'keySchemeStepTarget',step:'target',done:!!tgt},
      {id:'keySchemeStepFinish',step:'finish',done:!!(m&&hooks().isSavedMapping(m))}
    ];
    steps.forEach(function(s){
      var el=$(s.id);
      if(!el) return;
      el.classList.toggle('is-complete',s.done);
      el.classList.toggle('is-pending',!s.done);
      el.classList.toggle('is-active',activeStep===s.step);
    });
  }

  function syncKeyExecFinishCard(){
    var title=$('keyExecFinishTitle');
    if(title) title.textContent=t('keyExecFinishTitle');
  }

  function syncKeyExecFinishTimingSection(m){
    var section=$('keyExecFinishTimingSection');
    if(section) section.hidden=true;
  }

  // P12b-2：Keys 分段收尾 delay/cancel 宿主单一来源（供 React 岛复用）
  function canConfigureKeyFinish(m){
    if(!m) return false;
    if(hooks().isSavedMapping&&hooks().isSavedMapping(m)) return true;
    // Trigger alone: allow「说完后」while 02 recognition is mid-edit (e.g. empty 我录的键).
    var trig='';
    try{
      if(global.OneToneMappingCore&&global.OneToneMappingCore.editorTrigger){
        trig=String(global.OneToneMappingCore.editorTrigger(m)||'').trim();
      }
    }catch(_){}
    if(!trig) trig=String(m.triggerKey||'').trim();
    return !!trig;
  }

  function buildKeysFinishTimingModel(){
    hooks().ensureConfig();
    var m=hooks().selectedMapping();
    var keysPanel=useKeysFinishSegmented();
    var empty={
      delayHtml:'',
      cancelHtml:'',
      delayHidden:true,
      cancelHidden:true,
      mappingId:'',
      finishMode:'',
      sig:'empty'
    };
    if(!canConfigureKeyFinish(m)){
      return Object.assign({},empty,{sig:'unsaved'});
    }
    var finishMode=resolveDisplayedFinishMode(m);
    var showDelay=!!(keysPanel&&finishMode==='confirm');
    var showCancel=!!keysPanel;
    var delayHtml='';
    var cancelHtml='';
    if(showDelay) delayHtml=renderKeysFinishDelayOnly(m,m.id);
    if(showCancel) cancelHtml=renderKeysFinishCancelOnly(m,m.id);
    hooks().ensureMappingTiming(m);
    var camGest=listCameraCancelGestures().join(',');
    var phraseLists=readCancelPhraseLists();
    var phraseOn=cancelPhraseChannelOn()?'1':'0';
    // Island skips re-render when sig is unchanged — include phrase text so add/remove paints.
    var phraseSig=(phraseLists.zh||[]).join('\u0001')+'\u0002'+(phraseLists.en||[]).join('\u0001');
    var sig=[
      m.id,
      finishMode,
      showDelay?'1':'0',
      showCancel?'1':'0',
      String(m.enterDelayMs||0),
      String(m.intervalMs||0),
      m.cancelEnabled?'1':'0',
      m.autoEnterEnabled?'1':'0',
      camGest,
      phraseOn,
      phraseSig
    ].join('\0');
    return {
      delayHtml:delayHtml,
      cancelHtml:cancelHtml,
      delayHidden:!showDelay,
      cancelHidden:!showCancel,
      mappingId:m.id,
      finishMode:finishMode,
      sig:sig
    };
  }

  function applyKeysFinishTimingHosts(model){
    var delayHost=$('keysFinishDelayHost');
    var cancelHost=$('keysFinishCancelHost');
    var islandOn=!!global.__otKeysFinishTimingMounted;
    if(islandOn){
      if(typeof global.__otKeysFinishTimingSync==='function') global.__otKeysFinishTimingSync();
      if(delayHost) delayHost.hidden=!!(model&&model.delayHidden);
      if(cancelHost) cancelHost.hidden=!!(model&&model.cancelHidden);
      return;
    }
    if(delayHost){
      delayHost.innerHTML=model.delayHtml||'';
      delayHost.hidden=!!model.delayHidden;
      if(model.delayHtml) syncAllTimingRanges(delayHost);
    }
    if(cancelHost){
      cancelHost.innerHTML=model.cancelHtml||'';
      cancelHost.hidden=!!model.cancelHidden;
      if(model.cancelHtml) syncAllTimingRanges(cancelHost);
    }
  }

  function buildKeysFinishModeModel(){
    var m=hooks().selectedMapping();
    var esc=hooks().escHtml;
    if(!canConfigureKeyFinish(m)){
      return {
        modeHtml:'<p class="mic-desc key-finish-empty">'+esc(t('keyFinishFlowNeedKeys'))+'</p>',
        mappingId:'',
        finishMode:'',
        variant:'empty',
        sig:'empty'
      };
    }
    var finishMode=resolveDisplayedFinishMode(m);
    var gesture=startGesture(m);
    var allowed=allowedFinishModes(m);
    if(allowed.indexOf(finishMode)<0) finishMode=allowed[0]||'manual';
    var segmented=useKeysFinishSegmented();
    var modeHtml=segmented?renderKeyFinishModeSegmented(m):renderKeyFinishModeBlock(m);
    var sig=[
      m.id,
      finishMode,
      gesture||'',
      segmented?'seg':'block',
      allowed.join(','),
      modeHtml
    ].join('\0');
    return {
      modeHtml:modeHtml,
      mappingId:m.id,
      finishMode:finishMode,
      variant:segmented?'segmented':'block',
      sig:sig
    };
  }

  function applyKeysFinishModeHost(model){
    var modePanel=$('voiceEndKeyModePanel');
    if(!modePanel) return;
    if(global.__otKeysFinishModeMounted&&typeof global.__otKeysFinishModeSync==='function'){
      global.__otKeysFinishModeSync();
      return;
    }
    modePanel.innerHTML=model.modeHtml||'';
  }

  function renderKeyFinishFlowPanel(){
    var modePanel=$('voiceEndKeyModePanel');
    var cancelCard=$('voiceEndCancelCard');
    var confirmCard=$('voiceEndConfirmCard');
    if(!modePanel||!cancelCard||!confirmCard) return;
    hooks().ensureConfig();
    var m=hooks().selectedMapping();
    var esc=hooks().escHtml;
    var timingModel=buildKeysFinishTimingModel();
    var modeModel=buildKeysFinishModeModel();
    if(!canConfigureKeyFinish(m)){
      var empty='<p class="mic-desc key-finish-empty">'+esc(t('keyFinishFlowNeedKeys'))+'</p>';
      syncKeyExecFinishCard();
      applyKeysFinishModeHost(modeModel);
      cancelCard.innerHTML='<div class="setting-row"><div class="setting-row-main"><span class="setting-row-text">'+t('cancelTimingTitle')+'</span></div></div>'+empty;
      confirmCard.innerHTML='<div class="setting-row"><div class="setting-row-main"><span class="setting-row-text">'+t('sendTimingTitle')+'</span></div></div>'+empty;
      applyKeysFinishTimingHosts(timingModel);
      syncKeysFinishModeChrome(null,'');
      renderKeysFinishStrategyPreview(null);
      syncKeyExecFinishTimingSection(null);
      renderKeySchemeCardHeader();
      syncKeySchemeTimeline(schemeStepFocus);
      hooks().renderHomeKeyFinishPreview(false);
      if(global.OneToneHabitKeyMappingTable){
        global.OneToneHabitKeyMappingTable.syncRowStatus();
      }
      if(global.OneToneHabitCompatibility) global.OneToneHabitCompatibility.render();
      return;
    }
    syncKeyExecFinishCard();
    applyKeysFinishModeHost(modeModel);
    var keysPanel=useKeysFinishSegmented();
    var finishMode=resolveDisplayedFinishMode(m);
    syncKeysFinishModeChrome(m,finishMode);
    if(keysPanel){
      cancelCard.innerHTML='';
      confirmCard.innerHTML='';
    }else{
      cancelCard.innerHTML=renderKeyTimingCard(m,m.id,'cancel');
      confirmCard.innerHTML=renderKeyTimingCard(m,m.id,'confirm');
    }
    applyKeysFinishTimingHosts(timingModel);
    if(!keysPanel){
      syncAllTimingRanges(cancelCard);
      syncAllTimingRanges(confirmCard);
    }
    syncKeyExecFinishTimingSection(m);
    renderKeySchemeCardHeader();
    syncKeySchemeTimeline(schemeStepFocus);
    hooks().renderHomeKeyFinishPreview(false);
    if(global.OneToneHabitKeyMappingTable){
      global.OneToneHabitKeyMappingTable.syncRowStatus();
    }
    if(global.OneToneHabitCompatibility) global.OneToneHabitCompatibility.render();
    renderKeysFinishStrategyPreview(m);
  }

  function handleKeyFinishFlowInput(e){
    var range=e.target.closest&&e.target.closest('[data-timing-range]');
    if(!range) return;
    e.stopPropagation();
    liveUpdateTimingRange(range);
  }

  function handleKeyFinishFlowClick(e){
    var el=e.target;
    var delayChip=el.closest&&el.closest('[data-delay-ms]');
    if(delayChip){
      var ms=Number(delayChip.getAttribute('data-delay-ms'));
      var m=hooks().selectedMapping();
      if(!m||!(ms>=1000)) return false;
      e.stopPropagation();
      m.enterDelayMs=ms;
      scheduleTimingSave();
      applyKeysFinishTimingHosts(buildKeysFinishTimingModel());
      syncKeysFinishModeChrome(m,resolveDisplayedFinishMode(m));
      renderKeysFinishStrategyPreview(m);
      return true;
    }
    var delayCustom=el.closest&&el.closest('[data-delay-custom]');
    if(delayCustom){
      var m2=hooks().selectedMapping();
      if(!m2) return false;
      e.stopPropagation();
      var card=delayCustom.closest('.keys-finish-delay-inline')||delayCustom.closest('.keys-finish-delay-card');
      var controls=card&&card.querySelector('.keys-finish-delay-controls');
      if(controls){
        controls.hidden=false;
        controls.classList.remove('is-collapsed');
      }
      card&&card.querySelectorAll('.keys-finish-delay-chip').forEach(function(btn){
        var isCustom=btn.hasAttribute('data-delay-custom');
        btn.classList.toggle('is-active',isCustom);
        btn.setAttribute('aria-pressed',isCustom?'true':'false');
      });
      return true;
    }
    var finishBtn=el.closest&&el.closest('[data-finish-mode]');
    if(finishBtn){
      if(finishBtn.closest('[data-app-rule-pill]')) return false;
      var mode=finishBtn.dataset.finishMode;
      var m=hooks().selectedMapping();
      if(!m||!mode||!global.OneToneSceneFlowSummary) return false;
      e.stopPropagation();
      var primaryApp=primaryAppIdForMapping(m);
      var abr=global.OneToneAppBehaviorRules;
      var ctx=activeAppContextId();
      if(!ctx&&abr&&abr.resolvePreviewContext) ctx=abr.resolvePreviewContext(m)||'';
      if(!ctx) ctx=primaryApp;
      if(ctx&&abr&&abr.setAppFinishMode){
        abr.setAppFinishMode(m,ctx,mode);
        if(global.OneToneKeyFinishFlowRender&&global.OneToneKeyFinishFlowRender.refreshFinishModeSegment){
          global.OneToneKeyFinishFlowRender.refreshFinishModeSegment(m);
        }
      }else{
        global.OneToneSceneFlowSummary.applyFinishMode(m,mode);
        persistGestureChange();
        refreshAfterGestureChange();
        if(global.OneToneSceneTabs&&global.OneToneSceneTabs.renderHero){
          setTimeout(function(){ global.OneToneSceneTabs.renderHero(); },0);
        }
        if(global.OneToneHabitMulti){
          setTimeout(function(){ global.OneToneHabitMulti.render(); },0);
        }
        if(global.OneToneHabitKeyMappingTable){
          setTimeout(function(){ global.OneToneHabitKeyMappingTable.syncRowStatus(); },0);
        }
      }
      return true;
    }
    var modeBtn=el.closest&&el.closest('[data-trigger-mode]');
    if(modeBtn){
      var id=modeBtn.dataset.triggerMode;
      var mode=modeBtn.dataset.mode;
      var m=appState().config.mappings.find(function(x){return x.id===id;});
      if(!m||!mode) return false;
      e.stopPropagation();
      var modeLc=String(mode||'').toLowerCase();
      if(modeLc==='longpress'||modeLc==='hold'||modeLc==='perpress'){
        var gateApi=global.OneToneHomeWorkbenchCompat;
        var gate=gateApi&&gateApi.canUseHoldMode
          ?gateApi.canUseHoldMode(m.id,{currentMode:m.triggerMode})
          :{ok:false,messageKey:'keysHoldGateUntested'};
        if(!gate.ok){
          if(global.OneToneApp&&global.OneToneApp.toast){
            global.OneToneApp.toast(t(gate.messageKey||'keysHoldGateUntested'),'warn');
          }
          return true;
        }
        mode='longpress';
      }
      var prevGesture=startGesture(m);
      m.triggerMode=mode;
      var nextGesture=startGesture(m);
      // Align finish with the new start gesture so hold vs tap/double stay consistent.
      if(global.OneToneSceneFlowSummary&&global.OneToneSceneFlowSummary.applyFinishMode){
        if(nextGesture==='hold'){
          global.OneToneSceneFlowSummary.applyFinishMode(m,'perpress');
        }else if(prevGesture==='hold'){
          global.OneToneSceneFlowSummary.applyFinishMode(m,'confirm');
        }
      }
      persistGestureChange();
      refreshAfterGestureChange();
      return true;
    }
    var holdSwitch=el.closest&&el.closest('[data-keys-hold-switch]');
    if(holdSwitch){
      var switchTo=String(holdSwitch.getAttribute('data-keys-hold-switch')||'tap').toLowerCase();
      var mid=String(holdSwitch.getAttribute('data-mapping-id')||'').trim();
      var row=mid?appState().config.mappings.find(function(x){return x.id===mid;}):hooks().selectedMapping();
      if(!row) return false;
      e.stopPropagation();
      if(switchTo!=='double') switchTo='tap';
      var prevG=startGesture(row);
      row.triggerMode=switchTo;
      if(global.OneToneSceneFlowSummary&&global.OneToneSceneFlowSummary.applyFinishMode&&prevG==='hold'){
        global.OneToneSceneFlowSummary.applyFinishMode(row,'confirm');
      }
      persistGestureChange();
      refreshAfterGestureChange();
      return true;
    }
    var timingToggle=el.closest&&el.closest('[data-timing-toggle]');
    if(timingToggle){
      if(timingToggle.disabled) return true;
      var field=timingToggle.dataset.field;
      var m=hooks().selectedMapping();
      if(!m||!field) return false;
      e.stopPropagation();
      if(field==='cancelEnabled'||field==='autoEnterEnabled'){
        var g=startGesture(m);
        if(g==='hold') m.triggerMode='tap';
        // Preserve double-click start; do not force tap.
      }
      // Name-btn / toggle: flip state. Checkbox (legacy) mirrors checked.
      if(timingToggle.type==='checkbox') m[field]=!!timingToggle.checked;
      else m[field]=!m[field];
      scheduleTimingSave();
      refreshAfterGestureChange();
      if(global.OneToneHabitKeyMappingTable){
        setTimeout(function(){ global.OneToneHabitKeyMappingTable.syncRowStatus(); },0);
      }
      return true;
    }
    var cancelWin=el.closest&&el.closest('[data-cancel-win]');
    if(cancelWin){
      var mWin=hooks().selectedMapping();
      if(!mWin) return false;
      e.stopPropagation();
      var winRaw=cancelWin.getAttribute('data-cancel-win');
      if(winRaw==='custom'){
        // Force non-preset so custom slider appears on next render
        var cur=Number(mWin.intervalMs||1200);
        if(Math.abs(cur-500)<50||Math.abs(cur-1200)<50||Math.abs(cur-2000)<50){
          mWin.intervalMs=1500;
        }
        scheduleTimingSave();
        refreshAfterGestureChange();
        return true;
      }
      var winMs=Number(winRaw);
      if(winMs>=200){
        mWin.intervalMs=winMs;
        if(mWin.cancelEnabled===false) mWin.cancelEnabled=true;
        scheduleTimingSave();
        refreshAfterGestureChange();
      }
      return true;
    }
    var cancelCh=el.closest&&el.closest('[data-cancel-channel]');
    if(cancelCh){
      e.stopPropagation();
      var ch=cancelCh.getAttribute('data-cancel-channel');
      if(ch==='phrase'){
        // Enable-only: no cancelPhrasesEnabled flag; manage phrases inline when on.
        if(cancelPhraseChannelOn()) return true;
        var lists=readCancelPhraseLists();
        var cfg=appState().config||{};
        if(!cfg.voiceEnd||typeof cfg.voiceEnd!=='object') cfg.voiceEnd={};
        cfg.voiceEnd.enabled=true;
        var zh=lists.zh.length?lists.zh.slice():['取消输入','不要了','撤掉'];
        var en=lists.en.length?lists.en.slice():['cancel input'];
        cfg.voiceEnd.cancelPhrasesZh=zh;
        cfg.voiceEnd.cancelPhrasesEn=en;
        scheduleTimingSave();
        persistKeysCancelPhrases(zh,en);
        refreshAfterGestureChange();
        return true;
      }
      if(ch==='camera'){
        if(cameraCancelChannelOn()){
          clearAllCameraCancelGestures().then(function(){ refreshAfterGestureChange(); });
        }else{
          setCameraCancelGesture('shakeHead',true).then(function(ok){
            if(ok!==false) refreshAfterGestureChange();
          });
        }
        return true;
      }
      return true;
    }
    var cancelGest=el.closest&&el.closest('[data-cancel-gesture]');
    if(cancelGest){
      e.stopPropagation();
      var gk=cancelGest.getAttribute('data-cancel-gesture');
      var on=listCameraCancelGestures().indexOf(gk)<0;
      setCameraCancelGesture(gk,on).then(function(ok){
        if(ok!==false) refreshAfterGestureChange();
      });
      return true;
    }
    var phraseRemove=el.closest&&el.closest('[data-cancel-phrase-remove]');
    if(phraseRemove){
      e.stopPropagation();
      var rmIdx=Number(phraseRemove.getAttribute('data-cancel-phrase-remove'));
      var rmLists=readCancelPhraseLists();
      var rmZh=rmLists.zh.length?rmLists.zh.slice():rmLists.en.slice();
      var useZh=!!rmLists.zh.length;
      if(!(rmIdx>=0&&rmIdx<rmZh.length)) return true;
      if(rmZh.length<=1){
        if(global.OneToneApp&&global.OneToneApp.toast){
          global.OneToneApp.toast(t('keysCancelPhraseKeepOne','至少保留一个取消词'),'info');
        }
        return true;
      }
      rmZh.splice(rmIdx,1);
      var nextZh=useZh?rmZh:rmLists.zh.slice();
      var nextEn=useZh?rmLists.en.slice():rmZh;
      var cfgRm=appState().config||{};
      if(!cfgRm.voiceEnd||typeof cfgRm.voiceEnd!=='object') cfgRm.voiceEnd={};
      cfgRm.voiceEnd.cancelPhrasesZh=nextZh;
      cfgRm.voiceEnd.cancelPhrasesEn=nextEn.length?nextEn:['cancel input'];
      persistKeysCancelPhrases(cfgRm.voiceEnd.cancelPhrasesZh,cfgRm.voiceEnd.cancelPhrasesEn);
      refreshAfterGestureChange();
      return true;
    }
    var phraseAdd=el.closest&&el.closest('[data-cancel-phrase-add]');
    if(phraseAdd){
      e.stopPropagation();
      var host=phraseAdd.closest('[data-cancel-row="phrase"]')||phraseAdd.parentElement;
      var input=host&&host.querySelector('[data-cancel-phrase-input]');
      var raw=String(input&&input.value||'').trim();
      if(!raw){
        if(input) input.focus();
        return true;
      }
      var addLists=readCancelPhraseLists();
      var isEn=/^[a-zA-Z0-9\s''-]+$/.test(raw)&&!/[\u4e00-\u9fff]/.test(raw);
      var nextZhAdd=addLists.zh.slice();
      var nextEnAdd=addLists.en.slice();
      var bucket=isEn?nextEnAdd:nextZhAdd;
      if(bucket.indexOf(raw)>=0){
        if(input) input.value='';
        return true;
      }
      bucket.push(raw);
      if(!nextZhAdd.length) nextZhAdd=['取消输入'];
      if(!nextEnAdd.length) nextEnAdd=['cancel input'];
      var cfgAdd=appState().config||{};
      if(!cfgAdd.voiceEnd||typeof cfgAdd.voiceEnd!=='object') cfgAdd.voiceEnd={};
      cfgAdd.voiceEnd.enabled=true;
      cfgAdd.voiceEnd.cancelPhrasesZh=nextZhAdd;
      cfgAdd.voiceEnd.cancelPhrasesEn=nextEnAdd;
      persistKeysCancelPhrases(nextZhAdd,nextEnAdd);
      refreshAfterGestureChange();
      return true;
    }
    return false;
  }

  function persistKeysCancelPhrases(zh,en){
    try{
      var ve=global.OneToneVoiceEnd;
      if(ve&&ve.persistCancelPhrases){
        ve.persistCancelPhrases(zh,en);
        return;
      }
      if(global.OneToneIpc&&global.OneToneIpc.invoke){
        global.OneToneIpc.invoke('cmd_voice_end_set_cancel_phrases',{phrasesZh:zh,phrasesEn:en}).catch(function(){});
      }
    }catch(_){}
  }

  function persistGestureChange(){
    // Prefer async quiet save; gesture-only changes skip mvp_init on the Rust side.
    var p=global.OneToneConfigPersist;
    if(p&&p.saveAsync) p.saveAsync();
    else if(hooks().save) hooks().save();
    else if(p&&p.save) p.save();
  }

  function refreshAfterGestureChange(){
    renderKeyFinishFlowPanel();
    var panelUi=global.OneToneKeysPanelUi;
    if(panelUi&&panelUi.renderGestureUiOnly) panelUi.renderGestureUiOnly();
    else if(panelUi&&panelUi.render) panelUi.render();
    // Defer list remount so the segment click paints first (avoids keys-panel 假死).
    setTimeout(function(){
      if(hooks().renderMappingList) hooks().renderMappingList();
    },0);
  }

  function scheduleTimingSave(){
    clearTimeout(timingSaveTimer);
    timingSaveTimer=setTimeout(function(){ persistGestureChange(); },280);
  }

  function formatTimingSec(ms){ return (Number(ms)/1000).toFixed(1); }

  function timingDescText(field,ms){
    var n=formatTimingSec(ms);
    if(field==='intervalMs') return t('cancelTimingDesc').replace('{n}',n);
    if(field==='enterDelayMs') return t('sendTimingDesc').replace('{n}',n);
    return '';
  }

  function syncTimingRangeFill(range){
    if(!range) return;
    var min=Number(range.min), max=Number(range.max), val=Number(range.value);
    var pct=max>min?((val-min)/(max-min))*100:0;
    range.style.setProperty('--range-pct', pct+'%');
  }

  function syncAllTimingRanges(root){
    (root||document).querySelectorAll('.map-timing-range').forEach(syncTimingRangeFill);
  }

  function liveUpdateTimingRange(range){
    var field=range.dataset.field;
    var val=Number(range.value);
    if(range.type==='number'&&field==='enterDelayMs') val=Math.round(val*1000);
    var m=hooks().selectedMapping();
    if(!m) return;
    m[field]=val;
    scheduleTimingSave();
    syncTimingRangeFill(range);
    var block=range.closest('.map-timing-block')||range.closest('.keys-finish-delay-inline')||range.closest('.keys-finish-delay-card');
    var desc=block&&block.querySelector('.map-timing-desc,.keys-finish-delay-desc,.keys-finish-delay-value');
    if(desc&&desc.classList.contains('keys-finish-delay-value')){
      desc.textContent=t('sendTimingDesc').replace('{n}',formatTimingSec(val));
    }else if(desc) desc.innerHTML=timingDescText(field,val);
    var valEl=block&&block.querySelector('.keys-finish-delay-value');
    if(valEl&&field==='enterDelayMs'&&valEl.classList.contains('keys-finish-delay-value')){
      valEl.textContent=t('sendTimingDesc').replace('{n}',formatTimingSec(val));
    }
    var numInput=block&&block.querySelector('.keys-finish-delay-input');
    var rangeInput=block&&block.querySelector('.map-timing-range');
    if(numInput&&rangeInput&&field==='enterDelayMs'){
      if(range.type==='range') numInput.value=formatTimingSec(val);
      else rangeInput.value=String(val);
      syncTimingRangeFill(rangeInput);
    }
    if(field==='enterDelayMs'&&block){
      var presets=[1000,2000,3000];
      var matched=null;
      for(var i=0;i<presets.length;i++){
        if(Math.abs(val-presets[i])<50){ matched=presets[i]; break; }
      }
      var controls=block.querySelector('.keys-finish-delay-controls');
      if(controls){
        if(matched){
          controls.hidden=true;
          controls.classList.add('is-collapsed');
        }else{
          controls.hidden=false;
          controls.classList.remove('is-collapsed');
        }
      }
      block.querySelectorAll('.keys-finish-delay-chip').forEach(function(btn){
        var isCustom=btn.hasAttribute('data-delay-custom');
        var chipMs=Number(btn.getAttribute('data-delay-ms')||0);
        var active=isCustom?(!matched):(matched===chipMs);
        btn.classList.toggle('is-active',active);
        btn.setAttribute('aria-pressed',active?'true':'false');
      });
      syncKeysFinishModeChrome(m,resolveDisplayedFinishMode(m));
    }
    renderKeysFinishStrategyPreview(m);
  }

  global.OneToneKeyFinishFlowRender={
    renderKeyFinishFlowPanel:renderKeyFinishFlowPanel,
    focusSchemeEditStep:focusSchemeEditStep,
    syncKeySchemeTimeline:syncKeySchemeTimeline,
    renderKeySchemeCardHeader:renderKeySchemeCardHeader,
    handleKeyFinishFlowInput:handleKeyFinishFlowInput,
    handleKeyFinishFlowClick:handleKeyFinishFlowClick,
    scheduleTimingSave:scheduleTimingSave,
    formatTimingSec:formatTimingSec,
    syncAllTimingRanges:syncAllTimingRanges,
    liveUpdateTimingRange:liveUpdateTimingRange,
    refreshFinishModeSegment:refreshFinishModeSegment,
    renderKeysFinishStrategyPreview:renderKeysFinishStrategyPreview,
    schemeStepFocus:function(){ return schemeStepFocus; },
    syncKeyExecFinishCard:syncKeyExecFinishCard,
    // P12b-2：delay/cancel 宿主模型（单一来源）
    buildKeysFinishTimingModel:buildKeysFinishTimingModel,
    // P12b-5：收尾模式分段宿主模型（单一来源）
    buildKeysFinishModeModel:buildKeysFinishModeModel,
    // P12b-7：hint / strategy preview / finish-more 显隐
    buildKeysFinishChromeModel:buildKeysFinishChromeModel,
    // Cancel strategy helpers (camera gesture linkage)
    listCameraCancelGestures:listCameraCancelGestures,
    isEscCancelAction:isEscCancelAction,
    setCameraCancelGesture:setCameraCancelGesture,
    cameraCancelChannelOn:cameraCancelChannelOn,
    cancelPhraseChannelOn:cancelPhraseChannelOn
  };

  // ponytail: assert-based self-check for Esc-cancel token classification
  try{
    if(typeof global.__ONETONE_E2E__!=='undefined'||(global.location&&/^[?&]otCancelCheck=1/.test(global.location.search||''))){
      var ok=isEscCancelAction('pressEsc')&&isEscCancelAction('input.cancel')&&isEscCancelAction('agent:cancel')&&!isEscCancelAction('none')&&!isEscCancelAction('pressCtrlI');
      if(!ok&&global.console&&console.warn) console.warn('[keys-cancel] isEscCancelAction self-check failed');
    }
  }catch(_){}
})((typeof window!=='undefined')?window:globalThis);
