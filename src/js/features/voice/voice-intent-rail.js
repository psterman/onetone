(function(global){
  'use strict';
  var $=function(id){ return global.OneToneDom&&global.OneToneDom.$?global.OneToneDom.$(id):document.getElementById(id); };
  var t=function(key,fallback){
    var i=global.OneToneI18n;
    var v=i&&i.t?i.t(key):'';
    return v&&v!==key?v:(fallback||key);
  };

  var INTENTS=['ime','key','prompt','cursor','softpad','gesture'];
  var PROMPT_PRESETS={
    proto:'画一个原型图，风格简洁，输出可直接落地的交互说明。',
    agent:'总结当前对话要点，并给出下一步可执行建议。',
    continue:'继续上一步，保持同样约束。'
  };
  var PROMPT_PRESET_LABELS={
    proto:'画原型图',
    agent:'Agent 总结',
    continue:'继续',
    custom:'自定义口头指令'
  };
  var promptEditId='';
  var promptForceNew=false;
  var autosaveTimer=0;
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

  function clearPresetOn(){
    var presets=$('voicePromptPresets');
    if(!presets) return;
    Array.prototype.forEach.call(presets.querySelectorAll('[data-prompt-preset]'),function(x){
      x.classList.remove('is-on');
    });
  }

  function setPresetOn(pid){
    var presets=$('voicePromptPresets');
    if(!presets) return;
    Array.prototype.forEach.call(presets.querySelectorAll('[data-prompt-preset]'),function(x){
      x.classList.toggle('is-on',x.getAttribute('data-prompt-preset')===pid);
    });
  }

  function promptLabelFromUi(){
    var presets=$('voicePromptPresets');
    if(presets){
      var on=presets.querySelector('[data-prompt-preset].is-on');
      if(on){
        var pid=on.getAttribute('data-prompt-preset');
        if(pid&&PROMPT_PRESET_LABELS[pid]) return PROMPT_PRESET_LABELS[pid];
        var txt=String(on.textContent||'').trim();
        if(txt) return txt;
      }
    }
    return '';
  }

  function findPromptPeerId(label, text){
    var anchor=selectedOrHabit();
    var appId=anchor?String(anchor.appTargetId||'').trim():'';
    if(!appId) return '';
    var picker=global.OneToneKeysChannelCommandPicker;
    var maps=global.OneToneState&&global.OneToneState.state&&global.OneToneState.state.config
      ?global.OneToneState.state.config.mappings:[];
    if(!Array.isArray(maps)) return '';
    label=String(label||'').trim();
    text=String(text||'').trim();
    var byLabel='', byText='', first='', editStill='';
    for(var i=0;i<maps.length;i++){
      var m=maps[i];
      if(!m||String(m.appTargetId||'').trim()!==appId) continue;
      if(!(picker&&picker.isPromptInjectMapping&&picker.isPromptInjectMapping(m))) continue;
      var id=String(m.id||'');
      if(!id) continue;
      if(!first) first=id;
      if(promptEditId&&id===promptEditId) editStill=id;
      if(label&&String(m.label||'').trim()===label) byLabel=id;
      var body='';
      if(picker.promptTextFromMapping) body=String(picker.promptTextFromMapping(m)||'').trim();
      if(text&&body===text) byText=id;
    }
    return byLabel||editStill||byText||first||'';
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
    var hint=$('voicePromptSaveHint');
    if(!hint) return;
    hint.textContent=ok
      ?t('voicePromptSynced','已同步到右侧列表')
      :t('voicePromptSaveHint','改文案即写入右侧列表');
    hint.classList.toggle('is-ok',!!ok);
  }

  function applyPromptMapping(mid){
    mid=String(mid||'').trim();
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
    activatePromptText(body,{skipScene:true});
    setIntent('prompt',{persist:true});
    syncPromptSaveHint(true);
    applyingPrompt=false;
  }

  function savePromptToScene(opts){
    opts=opts||{};
    var quiet=!!opts.quiet;
    var ta=$('voicePromptInjectBody');
    var text=ta?String(ta.value||'').trim():'';
    if(!text){
      if(!quiet) toast(t('voicePromptSaveNeedText','先填写要注入的 prompt'));
      return null;
    }
    var picker=global.OneToneKeysChannelCommandPicker;
    if(!picker||typeof picker.savePromptInjectMapping!=='function'){
      if(!quiet) toast(t('voicePromptSaveUnavailable','暂无法保存'));
      return null;
    }
    var label=promptLabelFromUi();
    if(!label||label===PROMPT_PRESET_LABELS.custom){
      label=text.length>16?text.slice(0,16)+'…':text;
    }
    // Same prompt text always upserts — never spawn twins via autosave/forceCreate.
    var editId=String(promptEditId||'').trim()||findPromptPeerId(label,text);
    var saved=picker.savePromptInjectMapping({
      text:text,
      label:label,
      editId:editId,
      forceCreate:false
    });
    if(!saved||!saved.id){
      if(!quiet||Date.now()-lastSaveFailToast>2500){
        lastSaveFailToast=Date.now();
        // savePromptInjectMapping already toasted a reason when possible.
      }
      syncPromptSaveHint(false);
      return null;
    }
    promptEditId=String(saved.id);
    promptForceNew=false;
    var st=global.OneToneState&&global.OneToneState.state;
    if(st&&st.config){
      if(!st.config.voiceEnd) st.config.voiceEnd={};
      st.config.voiceEnd.promptInjectText=text;
      st.config.voiceEnd.intent='prompt';
    }
    if(global.OneToneConfigPersist&&global.OneToneConfigPersist.save){
      try{ global.OneToneConfigPersist.save({source:'voice-prompt-scene'}); }catch(_){}
    }
    refreshSceneList(promptEditId);
    syncPromptSaveHint(true);
    if(!quiet) toast(t('voicePromptSaved','已保存到本场景列表'));
    return saved;
  }

  function startNewCustomPrompt(){
    applyingPrompt=true;
    promptForceNew=true;
    promptEditId='';
    clearPresetOn();
    setPresetOn('custom');
    var ta=$('voicePromptInjectBody');
    if(ta){
      ta._promptHydrated=true;
      ta.value='';
      try{ ta.focus(); }catch(_){}
    }
    var st=global.OneToneState&&global.OneToneState.state;
    if(st&&st.config){
      if(!st.config.voiceEnd) st.config.voiceEnd={};
      st.config.voiceEnd.promptInjectText='';
      st.config.voiceEnd.intent='prompt';
    }
    global.__vp_voice_intent__='prompt';
    setIntent('prompt',{persist:true});
    syncPromptUi();
    syncPromptSaveHint(false);
    applyingPrompt=false;
    toast(t('voicePromptCustomHint','写下自定义 prompt，再点「保存到本场景列表」'));
  }

  function scheduleAutosavePromptScene(delay){
    if(applyingPrompt) return;
    if(currentIntent()!=='prompt') return;
    if(autosaveTimer){
      try{ clearTimeout(autosaveTimer); }catch(_){}
      autosaveTimer=0;
    }
    var ms=delay==null?320:Number(delay)||0;
    autosaveTimer=setTimeout(function(){
      autosaveTimer=0;
      savePromptToScene({quiet:true});
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
    var phrase='';
    var tags=$('voiceWakePhraseTags');
    if(tags){
      var on=tags.querySelector('.is-on,.is-active,[aria-selected="true"]');
      var raw=on?(on.getAttribute('data-phrase')||on.textContent||''):'';
      phrase=String(raw).replace(/[「」]/g,'').trim();
    }
    // Primary wake lives outside the alias chips — fall back so 01 isn't stuck on「—」.
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
    if(!phrase) phrase='—';
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
      scheduleAutosavePromptScene(0);
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
      strip.hidden=!show;
      strip.setAttribute('aria-hidden',show?'false':'true');
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

  function syncPromptUi(){
    var ta=$('voicePromptInjectBody');
    var st=global.OneToneState&&global.OneToneState.state;
    var cfg=st&&st.config&&st.config.voiceEnd?st.config.voiceEnd:{};
    if(ta&&!ta._promptHydrated){
      ta._promptHydrated=true;
      ta.value=String(cfg.promptInjectText||PROMPT_PRESETS.proto);
    }
    var land=$('voicePromptLand');
    if(land&&ta){
      var body=(ta.value||'').trim();
      var preview=body.length>36?body.slice(0,36)+'…':body;
      land.textContent='说 01 口令 = 聚焦 → 写入'+(preview?('「'+preview+'」'):' prompt')+' → 回车发送';
    }
    syncPromptSaveHint(!!promptEditId);
  }

  function savePromptText(){
    var ta=$('voicePromptInjectBody');
    if(!ta) return;
    var st=global.OneToneState&&global.OneToneState.state;
    if(!st||!st.config) return;
    if(!st.config.voiceEnd) st.config.voiceEnd={};
    st.config.voiceEnd.promptInjectText=String(ta.value||'');
    if(global.OneToneConfigPersist&&global.OneToneConfigPersist.save){
      global.OneToneConfigPersist.save({source:'voice-prompt'});
    }
    syncPromptUi();
    scheduleAutosavePromptScene();
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
    var saveBtn=$('btnVoicePromptSaveScene');
    if(saveBtn) saveBtn.textContent=t('voicePromptSaveScene','保存到本场景列表');
    var saveHint=$('voicePromptSaveHint');
    if(saveHint&&!saveHint.classList.contains('is-ok')){
      saveHint.textContent=t('voicePromptSaveHint','点保存，或改完文案后自动写入右侧');
    }
    var customBtn=$('btnVoicePromptCustom');
    if(customBtn) customBtn.textContent=t('voicePromptCustomBtn','＋ 自定义');
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

  function ensurePromptSaveChrome(){
    var desk=$('voicePromptDesk');
    if(!desk) return;
    var presets=$('voicePromptPresets');
    if(presets&&!$('btnVoicePromptCustom')){
      var custom=document.createElement('button');
      custom.type='button';
      custom.setAttribute('data-prompt-preset','custom');
      custom.id='btnVoicePromptCustom';
      custom.textContent=t('voicePromptCustomBtn','＋ 自定义');
      presets.appendChild(custom);
    }
    if($('btnVoicePromptSaveScene')) return;
    var row=document.createElement('div');
    row.className='voice-prompt-save-row';
    row.innerHTML=
      '<button type="button" class="control-btn primary" id="btnVoicePromptSaveScene"></button>'+
      '<span class="voice-prompt-save-hint" id="voicePromptSaveHint"></span>';
    var land=$('voicePromptLand');
    if(land&&land.parentNode===desk) desk.insertBefore(row,land);
    else if(presets&&presets.parentNode===desk){
      if(presets.nextSibling) desk.insertBefore(row,presets.nextSibling);
      else desk.appendChild(row);
    }else desk.appendChild(row);
    var saveBtn=$('btnVoicePromptSaveScene');
    if(saveBtn) saveBtn.textContent=t('voicePromptSaveScene','保存到本场景列表');
    var hint=$('voicePromptSaveHint');
    if(hint) hint.textContent=t('voicePromptSaveHint','点保存，或改完文案后自动写入右侧');
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
        // Typing a custom body — keep editing current row unless user asked for new.
        if(!promptForceNew){
          var onCustom=$('btnVoicePromptCustom');
          if(onCustom&&onCustom.classList.contains('is-on')) promptForceNew=true;
        }
        savePromptText();
      });
    }
    var presets=$('voicePromptPresets');
    if(presets&&!presets._bound){
      presets._bound=true;
      presets.addEventListener('click',function(e){
        var b=e.target.closest&&e.target.closest('[data-prompt-preset]');
        if(!b) return;
        var pid=b.getAttribute('data-prompt-preset');
        if(pid==='custom'){
          e.preventDefault();
          startNewCustomPrompt();
          return;
        }
        if(!ta) return;
        ta.value=PROMPT_PRESETS[pid]||ta.value;
        setPresetOn(pid);
        promptForceNew=false;
        promptEditId=findPromptPeerId(PROMPT_PRESET_LABELS[pid]||'', String(ta.value||'').trim());
        savePromptText();
        // Preset click: save immediately and show toast so list update is obvious.
        savePromptToScene({quiet:false,forceCreate:!promptEditId});
      });
    }
    var saveBtn=$('btnVoicePromptSaveScene');
    if(saveBtn&&!saveBtn._bound){
      saveBtn._bound=true;
      saveBtn.addEventListener('click',function(e){
        e.preventDefault();
        savePromptToScene({quiet:false});
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
        &&global.document.getElementById('btnVoicePromptSaveScene')
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
    savePromptToScene:savePromptToScene,
    startNewCustomPrompt:startNewCustomPrompt
  };

  if(global.document&&global.document.readyState==='loading'){
    global.document.addEventListener('DOMContentLoaded',init);
  }else{
    setTimeout(init,0);
  }
})(typeof window!=='undefined'?window:this);
