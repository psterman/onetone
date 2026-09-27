(function(global){
  'use strict';
  var $=function(id){ return global.OneToneDom.$(id); };
  function hooks(){ return global.__vp_key_finish_flow_ui_hooks__ || {}; }
  function finishApi(){ return global.OneToneKeyFinishFlowRender || null; }

  function finishClickHandler(){
    var h=hooks();
    var api=finishApi();
    return (h&&h.handleKeyFinishFlowClick)||(api&&api.handleKeyFinishFlowClick);
  }

  function finishInputHandler(){
    var h=hooks();
    var api=finishApi();
    return (h&&h.handleKeyFinishFlowInput)||(api&&api.handleKeyFinishFlowInput);
  }

  function isFinishControlTarget(el){
    return !!(el&&el.closest&&el.closest('[data-finish-mode],[data-timing-toggle],[data-trigger-mode],[data-keys-hold-switch],[data-delay-ms],[data-delay-custom],[data-cancel-win],[data-cancel-channel],[data-cancel-gesture],[data-cancel-phrase-remove],[data-cancel-phrase-add]'));
  }

  function bindPanelFallback(panel){
    if(!panel||panel.dataset.keyFinishPanelBound==='1') return;
    panel.dataset.keyFinishPanelBound='1';
    panel.addEventListener('click',function(e){
      if(e.__vpKeysPanelHandled||!isFinishControlTarget(e.target)) return;
      var handler=finishClickHandler();
      if(handler&&handler(e)){
        e.__vpKeysPanelHandled=true;
        e.preventDefault();
        e.stopPropagation();
      }
    },true);
    function onInput(e){
      if(e.__vpKeysPanelHandled) return;
      var range=e.target&&e.target.closest&&e.target.closest('[data-timing-range]');
      if(!range) return;
      var handler=finishInputHandler();
      if(handler){
        e.__vpKeysPanelHandled=true;
        handler(e);
      }
    }
    panel.addEventListener('input',onInput,true);
    panel.addEventListener('change',onInput,true);
  }

  function bindVoiceBridge(){
    var btn=$('btnKeysFinishOpenVoice');
    if(!btn||btn.dataset.voiceBridgeBound==='1') return;
    btn.dataset.voiceBridgeBound='1';
    btn.addEventListener('click',function(e){
      e.preventDefault();
      var drawer=global.OneToneSettingsDrawer;
      if(drawer&&drawer.setPanel){
        try{ drawer.setPanel('voiceWake',{subpage:'finish'}); }catch(_){ drawer.setPanel('voiceWake'); }
      }
    });
    var text=$('keysFinishVoiceBridgeText');
    if(text&&global.OneToneI18n&&global.OneToneI18n.t){
      text.textContent=global.OneToneI18n.t('keysFinishVoiceBridgeText')||text.textContent;
    }
    btn.textContent=(global.OneToneI18n&&global.OneToneI18n.t('keysFinishVoiceBridgeGo'))||btn.textContent;
  }

  function setKeysAimStrategy(strategy){
    strategy=strategy==='auto'?'auto':'none';
    var st=global.OneToneState&&global.OneToneState.state;
    if(!st||!st.config) return;
    if(!st.config.voiceEnd||typeof st.config.voiceEnd!=='object') st.config.voiceEnd={};
    st.config.voiceEnd.inputAimStrategy=strategy;
    st.config.voiceEnd.input_aim_strategy=strategy;
    var sel=$('voiceInputAimStrategy');
    if(sel) sel.value=strategy;
    var radio=document.querySelector('input[name="voiceInputAimStrategy"][value="'+strategy+'"]');
    if(radio) radio.checked=true;
    var bar=$('keysAimWritebar');
    if(bar) bar.setAttribute('data-aim',strategy);
    var cal=$('keysAimCalRow');
    if(cal) cal.hidden=strategy!=='auto';
    var api=finishApi();
    if(api&&api.syncKeysAimDemo) api.syncKeysAimDemo(strategy);
    var p=global.OneToneConfigPersist;
    if(p&&p.saveAsync) p.saveAsync();
    else if(p&&p.save) p.save();
    if(api&&api.renderKeyFinishFlowPanel) api.renderKeyFinishFlowPanel();
  }

  function enableKeysAimStrategy(){
    setKeysAimStrategy('auto');
  }

  function collapseAimDemoUi(){
    var api=finishApi();
    if(api&&api.collapseKeysAimDemo) api.collapseKeysAimDemo();
  }

  function bindAimSetup(){
    var btn=$('btnKeysAimSetup');
    if(btn&&btn.dataset.keysAimBound!=='1'){
      btn.dataset.keysAimBound='1';
      btn.addEventListener('click',function(e){
        e.preventDefault();
        enableKeysAimStrategy();
        var rail=global.OneToneVoiceIntentRail;
        if(rail&&typeof rail.beginAimCalibrate==='function'){
          rail.beginAimCalibrate();
        }else if(global.OneToneApp&&global.OneToneApp.toast){
          var t=global.OneToneI18n&&global.OneToneI18n.t;
          global.OneToneApp.toast((t&&t('keysAimCalUnavailable','校准未能开始'))||'校准未能开始','warn');
        }
        setTimeout(function(){
          var api=finishApi();
          if(api&&api.renderKeyFinishFlowPanel) api.renderKeyFinishFlowPanel();
        },1800);
      });
    }
    var sel=$('keysAimStrategy');
    if(sel&&sel.dataset.keysAimSelBound!=='1'){
      sel.dataset.keysAimSelBound='1';
      sel.addEventListener('change',function(){
        setKeysAimStrategy(sel.value);
      });
    }
    var demoBtn=$('btnKeysAimDemoToggle');
    if(demoBtn&&demoBtn.dataset.keysAimDemoBound!=='1'){
      demoBtn.dataset.keysAimDemoBound='1';
      demoBtn.addEventListener('click',function(e){
        e.preventDefault();
        var explain=$('keysAimExplain');
        if(!explain) return;
        var open=explain.hasAttribute('hidden');
        if(open){
          explain.removeAttribute('hidden');
          var api=finishApi();
          var strategy=($('keysAimStrategy')&&$('keysAimStrategy').value)||'none';
          if(api&&api.syncKeysAimDemo) api.syncKeysAimDemo(strategy);
        }else{
          explain.setAttribute('hidden','');
        }
        demoBtn.setAttribute('aria-expanded',open?'true':'false');
        var lbl=$('keysAimDemoToggleLbl');
        var t=global.OneToneI18n&&global.OneToneI18n.t;
        if(lbl){
          lbl.textContent=open
            ?(t&&t('keysAimDemoHide','收起演示'))||'收起演示'
            :(t&&t('keysAimDemoShow','看演示'))||'看演示';
        }
      });
    }
    var cancelFold=$('habitFlowFinishMore');
    if(cancelFold&&cancelFold.dataset.keysCancelAimBound!=='1'){
      cancelFold.dataset.keysCancelAimBound='1';
      cancelFold.addEventListener('toggle',function(){
        if(cancelFold.open) collapseAimDemoUi();
      });
    }
  }

  function bindEvents(){
    bindPanelFallback($('settingsPanelKeys'));
    bindPanelFallback($('keysCapturePopover'));
    bindVoiceBridge();
    bindAimSetup();
  }
  global.OneToneKeyFinishFlowUi={bindEvents:bindEvents};
})((typeof window!=='undefined')?window:globalThis);
