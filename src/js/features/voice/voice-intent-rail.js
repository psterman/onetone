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
    var phrase='—';
    var tags=$('voiceWakePhraseTags');
    if(tags){
      var on=tags.querySelector('.is-on,.is-active,[aria-selected="true"]');
      var raw=on?(on.getAttribute('data-phrase')||on.textContent||''):'';
      phrase=String(raw).replace(/[「」]/g,'').trim()||phrase;
    }
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
    if(BRIDGE_MOUNT[id]) mountBridge(id);

    if((id==='key'||id==='cursor')&&global.OneToneVoiceBridgeKeys){
      if(global.OneToneVoiceBridgeKeys.setCat){
        global.OneToneVoiceBridgeKeys.setCat(id==='key'?'other':'inject');
      }else if(global.OneToneVoiceBridgeKeys.render){
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
    if(id==='prompt') syncPromptUi();

    var dictate=$('voiceWakeActionDictate');
    if(dictate){
      if(id==='prompt') dictate.textContent=t('voiceIntentPromptTitle','聚焦 · 填入 · 发送');
      else if(id==='ime') dictate.textContent=t('voiceWakeActionDictate','开始听写');
      else dictate.textContent=t('voiceIntentImeHint','匹配所选意图动作');
    }
    syncHeroVals();
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

  function bind(){
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
      ta.addEventListener('input',function(){ savePromptText(); });
    }
    var presets=$('voicePromptPresets');
    if(presets&&!presets._bound){
      presets._bound=true;
      presets.addEventListener('click',function(e){
        var b=e.target.closest&&e.target.closest('[data-prompt-preset]');
        if(!b||!ta) return;
        var pid=b.getAttribute('data-prompt-preset');
        ta.value=PROMPT_PRESETS[pid]||ta.value;
        Array.prototype.forEach.call(presets.querySelectorAll('[data-prompt-preset]'),function(x){
          x.classList.toggle('is-on',x===b);
        });
        savePromptText();
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
    syncHeroVals:syncHeroVals
  };

  if(global.document&&global.document.readyState==='loading'){
    global.document.addEventListener('DOMContentLoaded',init);
  }else{
    setTimeout(init,0);
  }
})(typeof window!=='undefined'?window:this);
