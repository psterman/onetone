(function(global){
  'use strict';
  var $=function(id){ return global.OneToneDom.$(id); };
  function h(){ return global.__vp_bootstrap_hooks__ || {}; }
  var VOICE_EDIT_MODES=['input','phrases','finish'];
  function setVoiceSubpage(page,opts){
    if(global.OneToneVoiceSubpages&&typeof global.OneToneVoiceSubpages.setPage==='function'){
      global.OneToneVoiceSubpages.setPage(page,opts);
      return true;
    }
    return false;
  }
  function bindEvents(){
    var hooks=h();
    var t=hooks.t;
    function setRecognizeNavActive(targetId){
      if(global.OneToneVoiceSettingsFlow&&global.OneToneVoiceSettingsFlow.setRecognizeNavState){
        global.OneToneVoiceSettingsFlow.setRecognizeNavState(targetId);
      }else{
        var nav=$('voiceRecognizeNav');
        if(!nav) return;
        nav.querySelectorAll('.voice-recognize-nav-link').forEach(function(link){
          var href=link.getAttribute('href')||'';
          link.classList.toggle('is-active',href==='#'+targetId);
        });
      }
      var sec=$(targetId);
      if(sec) sec.scrollIntoView({behavior:'smooth',block:'start'});
    }
    if(hooks.bindVoiceModeCard) hooks.bindVoiceModeCard('btnVoiceModeSapi','sapi');
    var btnVoiceSapiTest=$('btnVoiceSapiTest');
    if(btnVoiceSapiTest) btnVoiceSapiTest.onclick=hooks.testVoiceSapiSend;
    var btnVoiceSapiSetup=$('btnVoiceSapiSetup');
    if(btnVoiceSapiSetup) btnVoiceSapiSetup.onclick=hooks.openVoiceSapiSetup;
    if(global.OneToneVoiceWakePresets){
      global.OneToneVoiceWakePresets.bindPresetClicks(function(e,btn){
        var mode=btn.closest('#voiceSettingsVoskWakeWrap')?'vosk':'sapi';
        if(mode==='vosk') hooks.addVoiceVoskPreset(e);
        else hooks.addVoiceSapiPreset(e);
      });
    }else{
      var voiceSapiPresets=$('voiceSapiPresets');
      if(voiceSapiPresets){
        voiceSapiPresets.onclick=function(e){
          e.stopPropagation();
          hooks.addVoiceSapiPreset(e);
        };
      }
      var voiceVoskWakeWrap=$('voiceSettingsVoskWakeWrap');
      if(voiceVoskWakeWrap) voiceVoskWakeWrap.onclick=hooks.addVoiceVoskPreset;
    }
    if(hooks.bindVoiceModeCard) hooks.bindVoiceModeCard('btnVoiceModeVosk','vosk');
    var btnVoiceVoskTest=$('btnVoiceVoskTest');
    if(btnVoiceVoskTest) btnVoiceVoskTest.onclick=hooks.testVoiceVoskSend;
    var btnVoiceKwsEnable=$('btnVoiceKwsEnable');
    if(btnVoiceKwsEnable) btnVoiceKwsEnable.onclick=function(){ if(hooks.setVoiceKwsEnabled) hooks.setVoiceKwsEnabled(true); };
    var btnVoiceKwsDisable=$('btnVoiceKwsDisable');
    if(btnVoiceKwsDisable) btnVoiceKwsDisable.onclick=function(){ if(hooks.setVoiceKwsEnabled) hooks.setVoiceKwsEnabled(false); };
    var btnVoiceKwsTestSend=$('btnVoiceKwsTestSend');
    if(btnVoiceKwsTestSend) btnVoiceKwsTestSend.onclick=hooks.testVoiceKwsSend;
    var btnVoiceKwsDownload=$('btnVoiceKwsDownload');
    if(btnVoiceKwsDownload) btnVoiceKwsDownload.onclick=function(){ if(hooks.downloadKwsModel) hooks.downloadKwsModel(); };
    var btnVoiceKwsRetry=$('btnVoiceKwsRetry');
    if(btnVoiceKwsRetry) btnVoiceKwsRetry.onclick=function(){ if(hooks.retryKwsStart) hooks.retryKwsStart(); };
    document.querySelectorAll('[data-kws-phrase]').forEach(function(btn){
      btn.onclick=function(){
        var phrase=btn.getAttribute('data-kws-phrase')||'';
        if(hooks.testVoiceKwsDetect) hooks.testVoiceKwsDetect(phrase);
      };
    });
    var btnVoskOpenResources=$('btnVoskOpenResources');
    if(btnVoskOpenResources) btnVoskOpenResources.onclick=hooks.openVoskResourcesDir;
    var btnVoskRetry=$('btnVoskRetry');
    if(btnVoskRetry) btnVoskRetry.onclick=function(e){ e.stopPropagation(); if(hooks.retryVoskStart) hooks.retryVoskStart(); else if(hooks.retryVoiceVosk) hooks.retryVoiceVosk(); };
    var btnVoiceEngineRecoveryHelp=$('btnVoiceEngineRecoveryHelp');
    if(btnVoiceEngineRecoveryHelp){
      btnVoiceEngineRecoveryHelp.onclick=function(){
        if(hooks.setSettingsPanel) hooks.setSettingsPanel('debug');
        else if(global.OneToneSettingsDrawer) global.OneToneSettingsDrawer.open({panel:'debug'});
      };
    }
    var voiceVoskModelPreset=$('voiceVoskModelPreset');
    if(voiceVoskModelPreset){
      voiceVoskModelPreset.onclick=function(ev){
        var btn=ev.target.closest&&ev.target.closest('[data-preset]');
        if(!btn||btn.disabled) return;
        ev.preventDefault();
        ev.stopPropagation();
        var preset=btn.getAttribute('data-preset');
        var endLang=(preset||'').indexOf('en')===0?'en':'zh';
        global.__vp_voice_end_lang__=endLang;
        var endToggle=$('voiceEndLangToggle');
        if(endToggle){
          endToggle.querySelectorAll('.flow-lang-btn').forEach(function(b){
            b.classList.toggle('is-on',(b.getAttribute('data-lang')||'')===endLang);
          });
        }
        if(hooks.setVoiceVoskModelPreset) hooks.setVoiceVoskModelPreset(preset);
        else if(hooks.changeVoiceVoskModelPreset) hooks.changeVoiceVoskModelPreset(preset);
        else if(global.OneToneVoiceSettingsFlow&&global.OneToneVoiceSettingsFlow.render){
          global.OneToneVoiceSettingsFlow.render();
        }
      };
    }
    var btnVoiceEnd=$('btnVoiceEnd');
    if(btnVoiceEnd) btnVoiceEnd.onclick=hooks.toggleVoiceEnd;
    var voiceEndDelayRange=$('voiceEndDelayRange');
    if(voiceEndDelayRange){
      voiceEndDelayRange.oninput=hooks.onVoiceEndDelayInput;
      voiceEndDelayRange.onchange=hooks.onVoiceEndDelayChange;
    }
    var voiceSettingsDelayRange=$('voiceSettingsDelayRange');
    if(voiceSettingsDelayRange){
      voiceSettingsDelayRange.oninput=hooks.onVoiceEndDelayInput;
      voiceSettingsDelayRange.onchange=hooks.onVoiceEndDelayChange;
    }
    var btnVoiceSettingsCommitEnter=$('btnVoiceSettingsCommitEnter');
    if(btnVoiceSettingsCommitEnter){
      btnVoiceSettingsCommitEnter.onclick=function(e){
        e.stopPropagation();
        hooks.setVoiceEndCommitKey('Enter');
      };
    }
    var btnVoiceSettingsCommitCtrlEnter=$('btnVoiceSettingsCommitCtrlEnter');
    if(btnVoiceSettingsCommitCtrlEnter){
      btnVoiceSettingsCommitCtrlEnter.onclick=function(e){
        e.stopPropagation();
        hooks.setVoiceEndCommitKey('Ctrl+Enter');
      };
    }
    var btnVoiceEndTestStop=$('btnVoiceEndTestStop');
    if(btnVoiceEndTestStop) btnVoiceEndTestStop.onclick=hooks.testVoiceEndStop;
    var btnVoiceEndTestCommit=$('btnVoiceEndTestCommit');
    if(btnVoiceEndTestCommit) btnVoiceEndTestCommit.onclick=hooks.testVoiceEndCommit;
    var voiceSapiConfidence=$('voiceSapiConfidence');
    if(voiceSapiConfidence){
      voiceSapiConfidence.oninput=function(){ hooks.updateVoiceSapiConfidence(false); };
      voiceSapiConfidence.onchange=function(){ hooks.updateVoiceSapiConfidence(true); };
    }
    document.querySelectorAll('.voice-sapi-sens-btn').forEach(function(btn){
      btn.onclick=function(e){
        e.stopPropagation();
        var idx=btn.getAttribute('data-sapi-sens');
        if(hooks.applyVoiceSapiSensLevel) hooks.applyVoiceSapiSensLevel(idx);
      };
    });
    function expandVoiceEditPanels(mode){
      if(global.OneToneVoiceWakeNavigation&&global.OneToneVoiceWakeNavigation.expandForEditMode){
        global.OneToneVoiceWakeNavigation.expandForEditMode(mode);
        return;
      }
      var map={
        input:['voiceRecognizeEngineDetails'],
        phrases:['voiceWakeCustomDetails'],
        finish:['voiceRecognizeEndDetails']
      };
      (map[mode]||[]).forEach(function(id){
        var el=$(id);
        if(el) el.open=true;
      });
    }
    function setVoiceEditMode(mode){
      if(VOICE_EDIT_MODES.indexOf(mode)<0) mode='input';
      var stepMap={input:'recognize',phrases:'wake',finish:'send'};
      if(global.OneToneVoicePageState){
        global.OneToneVoicePageState.setStep(stepMap[mode]||'wake');
      }
      var eng=global.OneToneHomeLive&&global.OneToneHomeLive.voiceEngineOn?global.OneToneHomeLive.voiceEngineOn():'off';
      var panel=$('settingsPanelVoiceWake');
      if(panel) panel.setAttribute('data-voice-engine',eng||'off');
      expandVoiceEditPanels(mode);
    }
    function closeVoiceEditMode(){
      /* v2: no overlay edit mode; step stays on OneToneVoicePageState */
    }
    function openVoicePhrasesEditor(){
      if(global.OneToneVoiceWakeNavigation&&global.OneToneVoiceWakeNavigation.openPresetsEditor){
        global.OneToneVoiceWakeNavigation.openPresetsEditor();
        return;
      }
      setVoiceEditMode('phrases');
      var target=$('voiceSettingsWakeCard');
      if(target) target.scrollIntoView({behavior:'smooth',block:'start'});
    }
    function openVoiceMicPicker(){
      if(global.OneToneVoiceWakeNavigation&&global.OneToneVoiceWakeNavigation.openMicPicker){
        global.OneToneVoiceWakeNavigation.openMicPicker();
        return;
      }
      setVoiceEditMode('phrases');
      if(hooks.focusSettingsField) hooks.focusSettingsField('mic');
    }
    function toggleVoiceMicPicker(){
      if(global.OneToneVoiceWakeNavigation&&global.OneToneVoiceWakeNavigation.toggleMicPicker){
        global.OneToneVoiceWakeNavigation.toggleMicPicker();
        return;
      }
      openVoiceMicPicker();
    }
    global.__vp_setVoiceEditMode__=setVoiceEditMode;
    global.__vp_closeVoiceEditMode__=closeVoiceEditMode;
    function bindVoiceEngineSwitch(root){
      if(!root||root.dataset.voiceEngineBound) return;
      root.dataset.voiceEngineBound='1';
      root.addEventListener('click',function(e){
        var btn=e.target.closest&&e.target.closest('[data-voice-engine-tab]');
        if(!btn||btn.disabled||btn.hidden) return;
        e.preventDefault();
        var mode=btn.getAttribute('data-voice-engine-tab');
        if(mode!=='sapi'&&mode!=='vosk'&&mode!=='kws') return;
        if(global.OneToneVoiceWake&&global.OneToneVoiceWake.isModeSwitchPending&&global.OneToneVoiceWake.isModeSwitchPending()) return;
        if(mode==='sapi'&&global.OneToneVoiceEngineReadiness&&global.OneToneVoiceEngineReadiness.isVoskOnlyUi()) return;
        if(hooks.setVoiceWakeExpandedMode) hooks.setVoiceWakeExpandedMode(mode);
        if(hooks.switchVoiceMode) hooks.switchVoiceMode(mode,{toastKind:'lite'});
      });
    }
    function bindVoiceOutputSwitch(root){
      if(!root||root.dataset.voiceOutputBound) return;
      root.dataset.voiceOutputBound='1';
      root.addEventListener('click',function(e){
        var btn=e.target.closest&&e.target.closest('[data-voice-output-mode]');
        if(!btn||btn.disabled) return;
        e.preventDefault();
        var mode=btn.getAttribute('data-voice-output-mode')||'';
        var eng=global.OneToneHomeLive&&global.OneToneHomeLive.voiceEngineOn?global.OneToneHomeLive.voiceEngineOn():'off';
        if(eng==='sapi'||eng==='off'||mode==='manual') return;
        if(global.OneToneVoiceEnd&&global.OneToneVoiceEnd.setOutputMode){
          global.OneToneVoiceEnd.setOutputMode(mode);
        }
      });
    }
    var btnVoiceLiveMicChange=$('btnVoiceLiveMicChange');
    if(btnVoiceLiveMicChange) btnVoiceLiveMicChange.onclick=openVoiceMicPicker;
    var btnVoiceLiveMicToggle=$('btnVoiceLiveMicToggle');
    if(btnVoiceLiveMicToggle) btnVoiceLiveMicToggle.onclick=toggleVoiceMicPicker;
    var btnVoiceEndDetectSwitchVosk=$('btnVoiceEndDetectSwitchVosk');
    if(btnVoiceEndDetectSwitchVosk){
      btnVoiceEndDetectSwitchVosk.onclick=function(){
        if(hooks.switchVoiceMode) hooks.switchVoiceMode('vosk');
      };
    }
    var btnVoiceSwitchHabit=$('btnVoiceSwitchHabit');
    if(btnVoiceSwitchHabit){
      btnVoiceSwitchHabit.onclick=function(){
        if(hooks.setSettingsPanel) hooks.setSettingsPanel('scenes');
      };
    }
    var btnVoiceSaveHabit=$('btnVoiceSaveHabit');
    if(btnVoiceSaveHabit){
      btnVoiceSaveHabit.onclick=function(e){
        e.preventDefault();
        e.stopPropagation();
        var saveFn=global.OneToneVoiceSchemePersist&&global.OneToneVoiceSchemePersist.saveVoiceScheme;
        var legacyFn=global.OneToneHabitHub&&global.OneToneHabitHub.createFromVoice;
        var run=saveFn||legacyFn;
        if(!run) return;
        Promise.resolve(run()).then(function(saved){
          if(saved===null&&global.OneToneAppToast){
            global.OneToneAppToast.show(t('voiceSchemeSaveCancelled'),'warn');
          }
        }).catch(function(err){
          console.error('saveVoiceScheme',err);
          if(global.OneToneAppToast) global.OneToneAppToast.show(t('voiceSchemeSaveCancelled'),'warn');
        });
      };
    }
    function runVoiceTestOnce(){
      var eng=global.OneToneHomeLive&&global.OneToneHomeLive.voiceEngineOn?global.OneToneHomeLive.voiceEngineOn():'off';
      if(eng==='vosk'&&hooks.testVoiceVoskSend) hooks.testVoiceVoskSend();
      else if(eng==='sapi'&&hooks.testVoiceSapiSend) hooks.testVoiceSapiSend();
      else openVoiceMicPicker();
    }
    var btnFbSimulateSpeak=$('voiceFbBtnSimulateSpeak');
    if(btnFbSimulateSpeak) btnFbSimulateSpeak.onclick=runVoiceTestOnce;
    var btnFbSimulateWake=$('voiceFbBtnSimulateWake');
    if(btnFbSimulateWake){
      btnFbSimulateWake.onclick=function(){
        if(global.OneToneVoiceWakeNavigation&&global.OneToneVoiceWakeNavigation.openPresetsEditor){
          global.OneToneVoiceWakeNavigation.openPresetsEditor();
        }else{
          openVoicePhrasesEditor();
        }
      };
    }
    var btnVoiceEnabled=$('btnVoiceEnabled');
    if(btnVoiceEnabled){
      btnVoiceEnabled.onclick=function(){
        if(hooks.homeToggleVoiceWake) hooks.homeToggleVoiceWake();
      };
    }
    bindVoiceEngineSwitch($('voiceRecognizeSourceGrid'));
    bindVoiceEngineSwitch($('voiceSummaryEngineSwitch'));
    var btnVoiceOutputSummonManage=$('btnVoiceOutputSummonManage');
    if(btnVoiceOutputSummonManage){
      btnVoiceOutputSummonManage.onclick=function(){
        if(hooks.setSettingsPanel) hooks.setSettingsPanel('keys');
      };
    }
    var habitNote=$('voiceSendHabitNote');
    if(habitNote&&!habitNote.dataset.habitLinkBound){
      habitNote.dataset.habitLinkBound='1';
      habitNote.addEventListener('click',function(e){
        var link=e.target.closest&&e.target.closest('#btnVoiceSendHabitLink');
        if(!link) return;
        e.preventDefault();
        e.stopPropagation();
        if(hooks.setSettingsPanel) hooks.setSettingsPanel('scenes');
      });
    }
    var voiceOutputModeSegments=$('voiceOutputModeSegments');
    if(voiceOutputModeSegments) bindVoiceOutputSwitch(voiceOutputModeSegments);
    var btnVoiceAppScopeAdd=$('btnVoiceAppScopeAdd');
    if(btnVoiceAppScopeAdd){
      btnVoiceAppScopeAdd.onclick=function(e){
        e.preventDefault();
        e.stopPropagation();
        var rules=global.OneToneAppBehaviorRules;
        if(rules&&rules.openAppPicker) rules.openAppPicker();
      };
    }
    var voiceAppScopeChips=$('voiceAppScopeChips');
    if(voiceAppScopeChips){
      voiceAppScopeChips.addEventListener('click',function(e){
        var delBtn=e.target.closest&&e.target.closest('[data-rule-delete]');
        if(delBtn){
          e.preventDefault();
          e.stopPropagation();
          var rules=global.OneToneAppBehaviorRules;
          var vmApi=global.OneToneVoiceSettingsViewModel;
          var vm=vmApi&&vmApi.build?vmApi.build():null;
          var m=null;
          if(global.OneToneVoicePageHeaderRender&&global.OneToneVoicePageHeaderRender.resolveScopeMapping){
            m=global.OneToneVoicePageHeaderRender.resolveScopeMapping(vm||{});
          }
          if(m&&rules&&rules.removeRuleById){
            rules.removeRuleById(m,delBtn.getAttribute('data-rule-delete')||'');
          }
          if(global.OneToneVoicePageHeaderRender&&global.OneToneVoicePageHeaderRender.renderAppScope&&vm){
            global.OneToneVoicePageHeaderRender.renderAppScope(vm);
          }else if(global.OneToneVoiceSettingsFlow&&global.OneToneVoiceSettingsFlow.scheduleVoiceSettingsRender){
            global.OneToneVoiceSettingsFlow.scheduleVoiceSettingsRender();
          }
          return;
        }
        var noneBtn=e.target.closest&&e.target.closest('[data-voice-scope-none]');
        var appBtn=e.target.closest&&e.target.closest('[data-voice-scope-app]');
        var ruleBtn=e.target.closest&&e.target.closest('[data-rule-context]');
        if(!noneBtn&&!appBtn&&!ruleBtn) return;
        e.preventDefault();
        e.stopPropagation();
        var rules=global.OneToneAppBehaviorRules;
        if(noneBtn){
          if(rules&&rules.setActiveAppContextId) rules.setActiveAppContextId('');
        }else if(appBtn){
          if(rules&&rules.setActiveAppContextId) rules.setActiveAppContextId(appBtn.getAttribute('data-voice-scope-app')||'');
        }else if(ruleBtn){
          if(rules&&rules.setActiveRuleContext) rules.setActiveRuleContext(ruleBtn.getAttribute('data-rule-context')||'');
        }
        if(global.OneToneVoiceSettingsFlow&&global.OneToneVoiceSettingsFlow.scheduleVoiceSettingsRender){
          global.OneToneVoiceSettingsFlow.scheduleVoiceSettingsRender();
        }
      });
    }
    function bindCustomPhraseAdd(inputId,btnId,addFn){
      var input=$(inputId);
      var btn=$(btnId);
      if(!btn||!addFn) return;
      function commit(){
        var phrase=input&&global.OneToneVoicePhraseCustom?global.OneToneVoicePhraseCustom.readInput(inputId):'';
        if(!phrase) return;
        addFn(phrase);
        if(global.OneToneVoicePhraseCustom) global.OneToneVoicePhraseCustom.clearInput(inputId);
      }
      btn.onclick=function(e){
        e.preventDefault();
        e.stopPropagation();
        commit();
      };
      if(input){
        input.addEventListener('keydown',function(e){
          if(e.key==='Enter'){
            e.preventDefault();
            commit();
          }
        });
      }
    }
    bindCustomPhraseAdd('voiceWakeCustomInput','btnVoiceWakeCustomAdd',function(phrase){
      var wake=global.OneToneVoiceWake;
      if(wake&&wake.addCustomWakePhrase) wake.addCustomWakePhrase(phrase);
    });
    bindCustomPhraseAdd('voiceEndCustomInput','btnVoiceEndCustomAdd',function(phrase){
      var end=global.OneToneVoiceEnd;
      if(end&&end.addCustomEndPhrase) end.addCustomEndPhrase(phrase);
    });
    function bindPhraseListen(btnId,inputId){
      var btn=$(btnId);
      if(!btn) return;
      btn.onclick=function(e){
        e.preventDefault();
        e.stopPropagation();
        var listen=global.OneToneVoicePhraseListen;
        if(listen&&listen.fillInputAsync) listen.fillInputAsync(inputId,btn);
        else if(listen&&listen.fillInput) listen.fillInput(inputId);
      };
    }
    bindPhraseListen('btnVoiceWakeCustomListen','voiceWakeCustomInput');
    bindPhraseListen('btnVoiceEndCustomListen','voiceEndCustomInput');
    function bindFlowLangToggle(hostId,storageKey){
      var host=$(hostId);
      if(!host) return;
      host.onclick=function(e){
        var btn=e.target.closest&&e.target.closest('[data-lang]');
        if(!btn) return;
        e.preventDefault();
        var lang=btn.getAttribute('data-lang')||'zh';
        global[storageKey]=lang;
        host.querySelectorAll('.flow-lang-btn').forEach(function(b){
          b.classList.toggle('is-on',(b.getAttribute('data-lang')||'')===lang);
        });
        if(global.OneToneVoiceSettingsFlow&&global.OneToneVoiceSettingsFlow.render){
          global.OneToneVoiceSettingsFlow.render();
        }
        if(global.OneToneVoiceStepRecognize&&global.OneToneVoiceStepRecognize.syncEndPresetLangVisibility){
          global.OneToneVoiceStepRecognize.syncEndPresetLangVisibility();
        }
      };
    }
    function bindWakeLangToggle(){
      var host=$('voiceWakeLangToggle');
      if(!host) return;
      host.onclick=function(e){
        var btn=e.target.closest&&e.target.closest('[data-lang]');
        if(!btn) return;
        e.preventDefault();
        var lang=btn.getAttribute('data-lang')||'zh';
        global.__vp_voice_wake_lang__=lang;
        global.__vp_voice_end_lang__=lang;
        global.__vp_voice_wake_lang_manual__=true;
        host.querySelectorAll('.flow-lang-btn').forEach(function(b){
          b.classList.toggle('is-on',(b.getAttribute('data-lang')||'')===lang);
        });
        var endToggle=$('voiceEndLangToggle');
        if(endToggle){
          endToggle.querySelectorAll('.flow-lang-btn').forEach(function(b){
            b.classList.toggle('is-on',(b.getAttribute('data-lang')||'')===lang);
          });
        }
        if(global.OneToneVoiceStepWake&&global.OneToneVoiceStepWake.syncPresetLang){
          global.OneToneVoiceStepWake.syncPresetLang({lang:lang});
        }
        if(global.OneToneVoiceStepRecognize&&global.OneToneVoiceStepRecognize.syncEndPresetLangVisibility){
          global.OneToneVoiceStepRecognize.syncEndPresetLangVisibility();
        }
        if(global.OneToneVoiceSettingsFlow&&global.OneToneVoiceSettingsFlow.render){
          global.OneToneVoiceSettingsFlow.render();
        }
        var eng=hooks.currentVoiceMode?hooks.currentVoiceMode():'off';
        var wakeApi=global.OneToneVoiceWake;
        if(eng==='vosk'&&wakeApi&&wakeApi.changeVoskModelPreset){
          var target=lang==='en'?'en-light':'cn-light';
          var current=wakeApi.currentVoskPreset?wakeApi.currentVoskPreset():'cn-light';
          if(target!==current){
            wakeApi.changeVoskModelPreset(target);
          }else{
            global.__vp_voice_wake_lang_manual__=false;
          }
          return;
        }
        global.__vp_voice_wake_lang_manual__=false;
      };
    }
    bindWakeLangToggle();
    bindFlowLangToggle('voiceEndLangToggle','__vp_voice_end_lang__');
    var pc=global.OneToneVoicePhraseCustom;
    var wakeApi=global.OneToneVoiceWake;
    var endApi=global.OneToneVoiceEnd;
    if(pc&&pc.bindPhraseTags){
      pc.bindPhraseTags('voiceWakePhraseTags',{
        onToggle:function(phrase,active){
          if(wakeApi&&wakeApi.toggleWakePhrase) wakeApi.toggleWakePhrase(phrase,active);
        },
        onRemove:function(phrase){
          if(wakeApi&&wakeApi.toggleWakePhrase) wakeApi.toggleWakePhrase(phrase,true);
        }
      });
      pc.bindPhraseTags('voiceWakePhraseSuggestions',{
        onToggle:function(phrase,active){
          if(wakeApi&&wakeApi.toggleWakePhrase) wakeApi.toggleWakePhrase(phrase,active);
        }
      });
      pc.bindPhraseTags('voiceEndPhraseTags',{
        onToggle:function(phrase,active){
          if(endApi&&endApi.toggleEndPhrase) endApi.toggleEndPhrase(phrase,active);
        },
        onRemove:function(phrase){
          if(endApi&&endApi.removeCustomEndPhrase) endApi.removeCustomEndPhrase(phrase);
        }
      });
    }
    var btnMicRefresh=$('btnMicRefresh');
    if(btnMicRefresh) btnMicRefresh.onclick=function(){
      btnMicRefresh.disabled=true;
      if(typeof hooks.micRecoveryTimer==='function'&&hooks.micRecoveryTimer()) hooks.clearMicRecoveryTimer();
      if(typeof hooks.clearMicBackoff==='function') hooks.clearMicBackoff();
      hooks.loadMicDevices({manual:true}).catch(function(err){
        var detail=err&&(err.message||String(err))||'';
        hooks.toast(detail?(t('micRefreshFail')+'：'+detail):t('micRefreshFail'));
      }).finally(function(){
        btnMicRefresh.disabled=false;
      });
    };
  }
  global.OneToneVoiceUiBindings={bindEvents:bindEvents};
})((typeof window!=='undefined')?window:globalThis);
