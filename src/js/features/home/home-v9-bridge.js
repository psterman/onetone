(function(global){
  'use strict';

  var $=function(id){ return global.OneToneDom.$(id); };
  var t=function(key){ return global.OneToneI18n.t(key); };
  var bound=false;
  var foregroundAppId='';
  var foregroundPollTimer=null;
  var lastLiveText='';
  var dictationLive={ finals:[], lastFinalKey:'', sessionKey:'' };

  function resetDictationLive(){
    dictationLive={ finals:[], lastFinalKey:'', sessionKey:'' };
  }

  function dictationSessionKey(summary){
    var end=global.OneToneVoiceUiState.snapshot().end||{};
    return String(end.mappingId||'')+'|'+String(end.state||'');
  }

  function wakeEngineResult(summary){
    var w=global.OneToneVoiceUiState.snapshot().wake||{};
    var eng=summary.engine;
    if(eng==='vosk') return w.vosk||{};
    if(eng==='sapi') return w.sapi||{};
    return {};
  }

  function isNoisePhrase(text,summary){
    text=String(text||'').trim();
    if(!text) return true;
    var phrases=(summary.wakePhrases||[]).slice();
    if(global.OneToneHomeLive&&global.OneToneHomeLive.voiceSummonPhrases){
      phrases=phrases.concat(global.OneToneHomeLive.voiceSummonPhrases());
    }
    if(global.OneToneHomeLive&&global.OneToneHomeLive.voiceEndPhrases){
      phrases=phrases.concat(global.OneToneHomeLive.voiceEndPhrases());
    }
    return phrases.some(function(p){
      p=String(p||'').trim();
      if(!p) return false;
      var norm=text.toLowerCase();
      var np=p.toLowerCase();
      return norm===np||norm.indexOf(np)>=0||np.indexOf(norm)>=0;
    });
  }

  function syncDictationFinals(summary){
    var key=dictationSessionKey(summary);
    if(!summary.dictating){
      if(dictationLive.sessionKey) resetDictationLive();
      return;
    }
    if(key!==dictationLive.sessionKey){
      dictationLive={ finals:[], lastFinalKey:'', sessionKey:key };
    }
    var res=wakeEngineResult(summary);
    var eng=summary.engine;
    var finalText='';
    if(eng==='vosk'){
      finalText=String(res.lastFinal||'').trim();
    }else if(eng==='sapi'){
      finalText=String(res.lastHeard||'').trim();
    }
    if(finalText&&finalText!==dictationLive.lastFinalKey&&!isNoisePhrase(finalText,summary)){
      dictationLive.lastFinalKey=finalText;
      dictationLive.finals.push(finalText);
    }
  }

  function dictationTextParts(summary){
    syncDictationFinals(summary);
    var res=wakeEngineResult(summary);
    var eng=summary.engine;
    var finalized=dictationLive.finals.join('');
    var partial='';
    if(eng==='vosk'){
      partial=String(res.lastPartial||'').trim();
      if(partial&&dictationLive.finals.length&&dictationLive.finals[dictationLive.finals.length-1]===partial){
        partial='';
      }
    }else if(eng==='sapi'){
      partial=String(res.lastHeard||'').trim();
      if(partial&&dictationLive.finals.length&&dictationLive.finals[dictationLive.finals.length-1]===partial){
        partial='';
      }
    }
    if(finalized||partial){
      return { finalized:finalized, pending:partial, placeholder:false };
    }
    return { finalized:'', pending:summary.statusLine||t('homeV9DictatingHint'), placeholder:false };
  }

  function hooks(){ return global.__vp_home_live_hooks__ || {}; }
  function schemeHooks(){ return global.__vp_home_scheme_hooks__ || {}; }

  function esc(s){
    if(schemeHooks().escHtml) return schemeHooks().escHtml(s);
    return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  function homeActiveMapping(){
    if(global.OneToneHabitProfile&&global.OneToneHabitProfile.projectActive){
      var p=global.OneToneHabitProfile.projectActive(global.OneToneState.state.config||{});
      if(p&&p.mapping) return p.mapping;
    }
    if(global.OneToneMappingCore&&global.OneToneMappingCore.activeScene){
      return global.OneToneMappingCore.activeScene();
    }
    return hooks().selectedMapping?hooks().selectedMapping():null;
  }

  function activeSceneId(){
    var cfg=global.OneToneState.state.config||{};
    return String(cfg.activeSceneId||'').trim();
  }

  function foregroundDisplayName(appId){
    if(!appId) return t('homeV9TargetUnknown');
    if(global.OneToneAppBehaviorRules&&global.OneToneAppBehaviorRules.behaviorPresets){
      var preset=global.OneToneAppBehaviorRules.behaviorPresets.find(function(p){ return p.id===appId; });
      if(preset&&preset.nameKey) return t(preset.nameKey);
    }
    if(global.OneToneAppTargetPresets&&global.OneToneAppTargetPresets.presetById){
      var appPreset=global.OneToneAppTargetPresets.presetById(appId);
      if(appPreset&&appPreset.nameKey) return t(appPreset.nameKey);
    }
    return appId;
  }

  function targetAppLabel(m){
    if(foregroundAppId) return foregroundDisplayName(foregroundAppId);
    if(m&&m.appTargetId) return foregroundDisplayName(String(m.appTargetId).trim());
    var cfg=global.OneToneState.state.config||{};
    if(global.OneToneHabitProfile&&global.OneToneHabitProfile.project&&m){
      var profile=global.OneToneHabitProfile.project(m,cfg);
      if(profile&&profile.appTargetId) return foregroundDisplayName(profile.appTargetId);
    }
    return t('homeV9TargetUnknown');
  }

  function modelLabel(preset){
    preset=String(preset||'cn-light').trim();
    return preset==='en-light'?'small-en-us':'small-cn';
  }

  function voskModelPreset(){
    var cfg=global.OneToneState.state.config||{};
    var voskCfg=cfg.voiceVosk||cfg.voice_vosk||{};
    var w=global.OneToneVoiceUiState.snapshot().wake||{};
    var vosk=w.vosk||{};
    var m=homeActiveMapping();
    if(m&&m.voiceOverride&&m.voiceOverride.modelPreset){
      return String(m.voiceOverride.modelPreset).trim();
    }
    if(global.OneToneSceneConfig&&m){
      var eff=global.OneToneSceneConfig.resolveEffectiveScene(cfg,{activeSceneId:m.id});
      if(eff&&eff.voskModelPreset) return String(eff.voskModelPreset).trim();
    }
    return String(vosk.modelPreset||voskCfg.modelPreset||'cn-light').trim()||'cn-light';
  }

  function latencyText(){
    var eng=global.OneToneHomeLive.voiceEngineOn();
    var voskOnly=global.OneToneVoiceEngineReadiness&&global.OneToneVoiceEngineReadiness.isVoskOnlyUi();
    var metricEl=$(voskOnly||eng==='vosk'?'voiceModeProMetric':'voiceModeLiteMetric');
    var text=metricEl?String(metricEl.textContent||'').trim():'';
    if(!text||text.indexOf('…')>=0||/reading/i.test(text)) return '—';
    return text;
  }

  function engineStatusLine(summary){
    if(summary.loading) return t('homeLiveLoading');
    if(summary.statusMode==='error') return t('homeV9EngineOffline');
    var lat=latencyText();
    if(lat==='—') return t('homeV9EngineOnline');
    return t('homeV9EngineOnlineLatency').replace('{lat}',lat);
  }

  function finishPillText(m,summary){
    var endSnap=global.OneToneVoiceUiState.snapshot().end||{};
    var endCfg=(global.OneToneState.state.config||{}).voiceEnd||(global.OneToneState.state.config||{}).voice_end||{};
    var autoSend=!!endSnap.autoSendEnabled||!!endCfg.autoSendEnabled;
    if(autoSend){
      var delay=endSnap.commitDelayMs!=null?endSnap.commitDelayMs:(endCfg.commitDelayMs!=null?endCfg.commitDelayMs:4000);
      return t('homeV9PillFinishAuto').replace('{delay}',String(delay));
    }
    if(global.OneToneSceneFlowSummary&&m){
      var fin=global.OneToneSceneFlowSummary.finishBehaviorTextHome(m);
      if(fin&&fin.text) return fin.text;
    }
    return t('homeV9PillFinishManual');
  }

  function habitTypeIcon(type){
    if(type==='voice') return '🎙';
    if(type==='app') return '🎯';
    if(type==='combo') return '⚡';
    return '⌨';
  }

  function habitCardDescription(m,cfg){
    var profile=global.OneToneHabitProfile&&global.OneToneHabitProfile.project?global.OneToneHabitProfile.project(m,cfg):null;
    var type=profile&&profile.habitType||'keys';
    if(type==='voice') return t('habitHubDescVoice');
    if(type==='app') return t('habitHubDescApp');
    if(type==='combo') return t('habitHubDescKeysShort')+' + '+t('habitHubDescVoiceShort');
    return global.OneToneHomeScheme.pairLine(m);
  }

  function mapVp9State(summary,hs){
    if(summary.statusMode==='error'||hs.statusMode==='error') return 'ERROR';
    if(summary.dictating||hs.statusMode==='active') return 'DICTATING';
    if(summary.statusMode==='listening'||summary.statusMode==='triggered') return 'LISTENING';
    if(hs.statusMode==='ready') return 'LISTENING';
    return 'IDLE';
  }

  function liveTextParts(summary,hs){
    var w=global.OneToneVoiceUiState.snapshot().wake||{};
    var eng=summary.engine;
    var res=eng==='vosk'?w.vosk:w.sapi;
    if(summary.dictating){
      return dictationTextParts(summary);
    }
    if(summary.heardLine){
      var heard=summary.heardLine.replace(/^[^：:]+[：:]/,'').trim();
      if(heard) return { finalized:'', pending:heard, placeholder:false };
    }
    if(eng==='vosk'&&res){
      var finalText=String(res.lastFinal||'').trim();
      var partialText=String(res.lastPartial||'').trim();
      if(finalText||partialText){
        return {
          finalized:finalText,
          pending:partialText&&partialText!==finalText?partialText:'',
          placeholder:false
        };
      }
    }
    if(summary.statusMode==='listening'&&res){
      var partial=res.lastPartial||res.lastHeard||'';
      if(partial) return { finalized:'', pending:partial, placeholder:false };
    }
    if(hs.triggerLabel&&hs.keyActive){
      return { finalized:'', pending:'', placeholder:true, trigger:hs.triggerLabel };
    }
    return { finalized:'', pending:'', placeholder:true, trigger:'' };
  }

  function buildViewModel(){
    var hs=global.OneToneHomeLive.computeState();
    var summary=global.OneToneVoiceHomeSummary.compute();
    var m=homeActiveMapping();
    var cfg=global.OneToneState.state.config||{};
    var vpState=mapVp9State(summary,hs);
    var preset=voskModelPreset();
    var eng=summary.engine;
    var wakePhrases=global.OneToneHomeLive.voiceWakePhrases?global.OneToneHomeLive.voiceWakePhrases():[];
    var endPhrases=global.OneToneHomeLive.voiceEndPhrases?global.OneToneHomeLive.voiceEndPhrases():[];
    var trig=hs.triggerLabel||'';
    var finish=global.OneToneSceneFlowSummary?global.OneToneSceneFlowSummary.finishBehaviorTextHome(m):{text:t('homeLiveUnset')};
    var live=liveTextParts(summary,hs);
    var charCount=(live.finalized||'').length+(live.pending||'').length;
    return {
      loading:summary.loading,
      vpState:vpState,
      summary:summary,
      hs:hs,
      m:m,
      cfg:cfg,
      targetLabel:targetAppLabel(m),
      habitName:global.OneToneHomeScheme.shortName(m),
      finishPill:finishPillText(m,summary),
      triggerKey:trig||t('homeLiveUnset'),
      finishText:finish.text||t('homeLiveUnset'),
      cancelDelaySec:m&&m.intervalMs?((m.intervalMs||1200)/1000).toFixed(1):'1.2',
      wakePrimary:wakePhrases[0]||t('homeLiveUnset'),
      wakeAlt:wakePhrases.slice(1,3).join(' · ')||'—',
      endPhraseLine:endPhrases.slice(0,2).join(' · ')||'—',
      engineLine:eng==='off'?t('homeCapVoiceOff'):(modelLabel(preset)+' · '+t('homeV9EngineLocal')),
      engineStatus:engineStatusLine(summary),
      latency:latencyText(),
      micLabel:summary.micLabel,
      live:live,
      charCount:charCount,
      preset:preset
    };
  }

  function setText(el,text){
    if(el) el.textContent=text||'';
  }

  function renderEmptyState(liveEl,trigger){
    if(!liveEl) return;
    var trig=trigger||'';
    liveEl.innerHTML='<div class="vp-empty">'+t('homeV9EmptyPrefix')+
      (trig?(' <kbd>'+esc(trig)+'</kbd> '):' ')+
      t('homeV9EmptySuffix')+'</div>';
  }

  function renderLiveText(vm){
    var liveEl=$('vp9LiveText');
    if(!liveEl) return;
    if(vm.loading){
      liveEl.innerHTML='<div class="vp-empty">'+esc(t('homeLiveLoading'))+'</div>';
      return;
    }
    if(vm.live.placeholder){
      renderEmptyState(liveEl,vm.live.trigger);
      lastLiveText='';
      return;
    }
    var combined=(vm.live.finalized||'')+(vm.live.pending||'');
    if(!vm.summary.dictating&&combined===lastLiveText) return;
    lastLiveText=combined;
    if(global.vp9&&global.vp9.setText){
      global.vp9.setText('#vp9LiveText',vm.live.finalized,vm.live.pending);
    }else{
      liveEl.textContent=combined;
    }
  }

  function renderTray(vm){
    setText($('vp9TrayKey'),vm.triggerKey);
    setText($('vp9TrayFinish'),vm.finishText);
    setText($('vp9TrayDelay'),t('homeV9TraySilence').replace('{sec}',vm.cancelDelaySec));
    setText($('vp9TrayWake'),vm.wakePrimary);
    setText($('vp9TrayWakeAlt'),vm.wakeAlt);
    setText($('vp9TrayEnd'),vm.endPhraseLine);
    setText($('vp9TrayEngine'),vm.engineLine);
    setText($('vp9TrayEngineStatus'),vm.engineStatus);
    setText($('vp9TrayMic'),vm.micLabel);
  }

  function renderPills(vm){
    setText($('vp9PillTarget'),t('homeV9PillTarget').replace('{app}',vm.targetLabel));
    var habitPill=$('vp9PillHabit');
    if(habitPill){
      habitPill.classList.toggle('live',vm.vpState==='LISTENING'||vm.vpState==='DICTATING');
      setText(habitPill,t('homeV9PillHabit').replace('{name}',vm.habitName));
    }
    setText($('vp9PillFinish'),t('homeV9PillFinishPrefix')+vm.finishPill);
  }

  function renderStatusBar(vm){
    setText($('vp9Engine'),vm.engineLine);
    setText($('vp9Lat'),vm.latency);
    setText($('vp9Chars'),vm.charCount+' chars');
    var headerTarget=$('vp9HeaderTarget');
    if(headerTarget){
      var label=headerTarget.querySelector('.vp-header-target-label');
      if(label) label.textContent=vm.targetLabel;
      headerTarget.title=t('homeV9BtnSwitch');
    }
  }

  function renderHabits(vm){
    var host=$('vp9HabitGrid');
    if(!host) return;
    if(vm.loading){
      host.innerHTML='<div class="vp-habit-card is-loading"><span>'+esc(t('homeLiveLoading'))+'</span></div>';
      return;
    }
    var schemes=schemeHooks().sortedMappings?schemeHooks().sortedMappings():[];
    var activeId=activeSceneId();
    var html='';
    schemes.forEach(function(item){
      var profile=global.OneToneHabitProfile&&global.OneToneHabitProfile.project?global.OneToneHabitProfile.project(item,vm.cfg):null;
      var type=profile&&profile.habitType||'keys';
      var sel=item.id===activeId;
      html+='<button type="button" class="vp-habit-card'+(sel?' is-selected':'')+'" data-habit-id="'+esc(item.id)+'" aria-pressed="'+(sel?'true':'false')+'">';
      html+='<span class="vp-habit-icon" aria-hidden="true">'+habitTypeIcon(type)+'</span>';
      html+='<span class="vp-habit-name">'+esc(global.OneToneHomeScheme.shortName(item))+'</span>';
      html+='<span class="vp-habit-desc">'+esc(habitCardDescription(item,vm.cfg))+'</span>';
      if(sel) html+='<span class="vp-habit-check" aria-hidden="true">✓</span>';
      html+='</button>';
    });
    html+='<button type="button" class="vp-habit-card is-more" id="vp9HabitMore" aria-label="'+esc(t('homeV9HabitMore'))+'">';
    html+='<span class="vp-habit-icon" aria-hidden="true">+</span>';
    html+='<span class="vp-habit-name">'+esc(t('homeV9HabitMore'))+'</span>';
    html+='<span class="vp-habit-desc">'+esc(t('homeV9HabitMoreDesc'))+'</span>';
    html+='</button>';
    host.innerHTML=html;
  }

  function render(){
    var vm=buildViewModel();
    if(global.vp9&&global.vp9.updateState) global.vp9.updateState(vm.vpState);
    renderLiveText(vm);
    renderPills(vm);
    renderTray(vm);
    renderStatusBar(vm);
    renderHabits(vm);
    var endBtn=$('vp9BtnEnd');
    if(endBtn) endBtn.disabled=vm.vpState!=='DICTATING'&&!vm.summary.dictating;
  }

  function pollForegroundApp(){
    if(!global.OneToneIpc||!global.OneToneIpc.invoke) return;
    global.OneToneIpc.invoke('cmd_foreground_app',{}).then(function(res){
      var next=res&&res.appId?String(res.appId):'';
      if(next!==foregroundAppId){
        foregroundAppId=next;
        render();
      }
    }).catch(function(){});
  }

  function startForegroundPoll(){
    if(foregroundPollTimer) return;
    pollForegroundApp();
    foregroundPollTimer=setInterval(pollForegroundApp,2000);
  }

  function bindOnce(){
    if(bound) return;
    bound=true;
    var openSettings=function(opts){
      if(global.OneToneSettingsDrawer) global.OneToneSettingsDrawer.open(opts||{panel:'voiceWake'});
    };
    var btnEnd=$('vp9BtnEnd');
    if(btnEnd){
      btnEnd.onclick=function(){
        var summary=global.OneToneVoiceHomeSummary.compute();
        if(summary.dictating&&global.OneToneIpc){
          global.OneToneIpc.invoke('cmd_voice_end_test_commit',{}).catch(function(){});
          return;
        }
        openSettings({panel:'voiceWake',focus:'endPhrases'});
      };
    }
    var btnSwitch=$('vp9BtnSwitch');
    if(btnSwitch){
      btnSwitch.onclick=function(){
        openSettings({panel:'scenes',focus:'appTarget'});
      };
    }
    var btnSettings=$('vp9BtnSettings');
    if(btnSettings){
      btnSettings.onclick=function(){ openSettings({panel:'voiceWake'}); };
    }
    var headerTarget=$('vp9HeaderTarget');
    if(headerTarget){
      headerTarget.onclick=function(){
        openSettings({panel:'scenes',focus:'appTarget'});
      };
    }
    var habitGrid=$('vp9HabitGrid');
    if(habitGrid){
      habitGrid.onclick=function(e){
        var more=e.target.closest&&e.target.closest('#vp9HabitMore');
        if(more){
          openSettings({panel:'scenes',focus:'mappings'});
          return;
        }
        var card=e.target.closest&&e.target.closest('[data-habit-id]');
        if(card&&card.dataset.habitId&&global.OneToneHomeScheme){
          global.OneToneHomeScheme.selectMapping(card.dataset.habitId);
        }
      };
    }
    startForegroundPoll();
  }

  function applyLang(){
    var toggle=$('vp9TrayToggle');
    if(toggle){
      var open=toggle.classList.contains('open');
      var label=t(open?'homeV9TrayToggleClose':'homeV9TrayToggleOpen');
      var textNode=Array.from(toggle.childNodes).find(function(n){ return n.nodeType===3; });
      if(textNode) textNode.textContent=label;
    }
    ['vp9BtnEnd','vp9BtnSwitch','vp9BtnSettings'].forEach(function(id){
      var el=$(id);
      if(!el) return;
      var key=el.getAttribute('data-i18n');
      if(key) el.textContent=t(key);
    });
    setText($('vp9HabitsTitle'),t('homeV9HabitsTitle'));
  }

  global.OneToneHomeV9={
    render:render,
    bindOnce:bindOnce,
    applyLang:applyLang,
    buildViewModel:buildViewModel,
    startForegroundPoll:startForegroundPoll
  };
})((typeof window!=='undefined')?window:globalThis);
