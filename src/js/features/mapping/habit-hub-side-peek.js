(function(global){
  'use strict';

  var $=function(id){ return global.OneToneDom.$(id); };
  var t=function(key,fb){
    try{
      var v=global.OneToneI18n&&global.OneToneI18n.t?global.OneToneI18n.t(key):key;
      if(v&&v!==key) return v;
    }catch(_){}
    return fb!=null?fb:key;
  };

  function state(){ return global.OneToneState.state; }
  function ui(){ return global.OneToneState.ui; }
  function core(){ return global.OneToneMappingCore; }
  function diffApi(){ return global.OneToneHabitOverrideDiff; }

  var draft=null;
  var bound=false;

  function esc(s){
    return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');
  }

  function friendlyKey(key){
    key=String(key||'').trim();
    if(!key) return '—';
    if(global.OneToneKeyLabels&&global.OneToneKeyLabels.friendlyKeyName){
      return global.OneToneKeyLabels.friendlyKeyName(key,global.OneToneI18n.getLang())||key;
    }
    return key;
  }

  function hubName(m){
    var hub=global.OneToneHabitHub;
    if(hub&&hub.habitName) return hub.habitName(m);
    return String(m&&(m.group||m.label)||'').trim()||'—';
  }

  function scenarioProcessLine(m){
    var rulesApi=global.OneToneAppBehaviorRules;
    var customs=rulesApi&&rulesApi.customRulesForMapping?rulesApi.customRulesForMapping(m):[];
    var rule=customs&&customs[0];
    if(rule&&rule.match){
      if(rule.match.exeNames&&rule.match.exeNames[0]) return String(rule.match.exeNames[0]);
      var path=String(rule.match.fullPath||rule.match.full_path||rule.match.pathContains||'').trim();
      if(path) return path;
    }
    var appId=String(m&&m.appTargetId||'').trim();
    if(appId&&appId!=='custom'){
      if(rulesApi&&rulesApi.appDisplayName) return rulesApi.appDisplayName(appId)+' · '+appId;
      return appId;
    }
    return '';
  }

  function keyBaseline(){
    var cfg=state().config||{};
    return diffApi()&&diffApi().getGlobalKeyBaseline?diffApi().getGlobalKeyBaseline(cfg,core()):{triggerKey:'',targetKey:''};
  }

  function detectKeyMode(m){
    if(!m||m.keyModeEnabled===false) return 'disable';
    var baseline=keyBaseline();
    var d=diffApi();
    if(d&&d.countKeyOverrides&&d.countKeyOverrides(m,baseline)>0) return 'custom';
    return 'default';
  }

  function detectVoiceMode(m){
    if(!m||m.voiceModeEnabled===false) return 'off';
    var cfg=state().config||{};
    var d=diffApi();
    var baseline=d&&d.getGlobalVoiceBaseline?d.getGlobalVoiceBaseline(cfg):{};
    var ov=m.voiceOverride&&typeof m.voiceOverride==='object'?m.voiceOverride:{};
    if(!d||!d.countVoiceOverrides||d.countVoiceOverrides(ov,baseline)<=0) return 'default';
    var preset=String(ov.modelPreset||'').trim();
    if(preset==='cn-light'&&Array.isArray(ov.wakePhrases)&&ov.wakePhrases.indexOf('开始输入')>=0) return 'code';
    return 'general';
  }

  function detectCamMode(m){
    var d=diffApi();
    if(!m||!d||!d.countCameraOverrides) return 'default';
    var n=d.countCameraOverrides(m);
    if(!n) return 'default';
    var ov=m.cameraOverride&&typeof m.cameraOverride==='object'?m.cameraOverride:{};
    var tr=ov.triggers&&typeof ov.triggers==='object'?ov.triggers:{};
    var allOff=['away','shake','blink','openPalm','okHand','fist','wave'].every(function(k){ return tr[k]===false; });
    if(allOff&&n<=7) return 'off';
    return 'on';
  }

  function buildDraft(m){
    return {
      mappingId:String(m&&m.id||''),
      keyMode:detectKeyMode(m),
      voiceMode:detectVoiceMode(m),
      camMode:detectCamMode(m),
      enabled:!!(m&&m.enabled)
    };
  }

  function readDraftFromDom(){
    if(!draft) return null;
    var body=$('habitHubPeekBody');
    if(!body) return draft;
    var keySel=body.querySelector('[data-peek-key-mode]');
    var voiceSel=body.querySelector('[data-peek-voice-mode]');
    var camSel=body.querySelector('[data-peek-cam-mode]');
    var enToggle=body.querySelector('[data-peek-enabled]');
    if(keySel) draft.keyMode=String(keySel.value||'default');
    if(voiceSel) draft.voiceMode=String(voiceSel.value||'default');
    if(camSel) draft.camMode=String(camSel.value||'default');
    if(enToggle) draft.enabled=!!enToggle.checked;
    return draft;
  }

  function effectiveTrigger(m,baseline){
    var v=String(m&&m.triggerKey||'').trim();
    return v||String(baseline.triggerKey||'').trim();
  }

  function renderProps(m){
    var body=$('habitHubPeekBody');
    if(!body||!m||!draft) return;
    var baseline=keyBaseline();
    var trig=friendlyKey(effectiveTrigger(m,baseline));
    var proc=scenarioProcessLine(m);
    var keyCustomBox=draft.keyMode==='custom'
      ?'<div class="habit-hub-peek-prop-control-row"><span class="habit-hub-peek-readonly">'+esc(t('habitPeekKeyTrigger'))+': <kbd class="habit-hub-peek-keycap">'+esc(trig)+'</kbd></span>'
        +'<button type="button" class="habit-hub-peek-link" data-peek-go-keys="'+esc(m.id)+'">'+esc(t('habitPeekGoKeysRecord'))+'</button></div>'
      :'';
    var html=''
      +propRow(t('habitPeekPropProcess'),''
        +'<span class="habit-hub-peek-readonly">'+esc(proc||'—')+'</span>'
        +'<button type="button" class="habit-hub-peek-link" data-peek-change-app="'+esc(m.id)+'">'+esc(t('habitPeekChangeApp'))+'</button>')
      +propRow(t('habitPeekPropKeys'),''
        +'<select class="habit-hub-peek-select" data-peek-key-mode>'
        +opt('default',t('habitPeekKeyDefault'),draft.keyMode)
        +opt('custom',t('habitPeekKeyCustom'),draft.keyMode)
        +opt('disable',t('habitPeekKeyDisable'),draft.keyMode)
        +'</select>'+keyCustomBox)
      +propRow(t('habitPeekPropVoice'),''
        +'<select class="habit-hub-peek-select" data-peek-voice-mode>'
        +opt('default',t('habitPeekVoiceDefault'),draft.voiceMode)
        +opt('general',t('habitPeekVoiceGeneral'),draft.voiceMode)
        +opt('code',t('habitPeekVoiceCode'),draft.voiceMode)
        +opt('off',t('habitPeekVoiceOff'),draft.voiceMode)
        +'</select>')
      +propRow(t('habitPeekPropCamera'),''
        +'<select class="habit-hub-peek-select" data-peek-cam-mode>'
        +opt('default',t('habitPeekCamDefault'),draft.camMode)
        +opt('on',t('habitPeekCamOn'),draft.camMode)
        +opt('off',t('habitPeekCamOff'),draft.camMode)
        +'</select>')
      +propRow(t('habitPeekPropEnabled'),''
        +'<label class="habit-hub-peek-enable-wrap">'
        +'<input type="checkbox" data-peek-enabled'+(draft.enabled?' checked':'')+' /> '
        +esc(t('habitScenarioEnableLbl'))
        +'</label>')
      +'<div class="habit-hub-peek-advanced">'
      +'<p class="habit-hub-peek-advanced-title">'+esc(t('habitPeekAdvanced'))+'</p>'
      +'<div class="habit-hub-peek-advanced-links">'
      +advLink('data-peek-go-keys="'+esc(m.id)+'"',t('habitHubGlobalOpenKeys'))
      +advLink('data-peek-go-voice="'+esc(m.id)+'"',t('habitHubGlobalOpenVoice'))
      +advLink('data-peek-go-camera="'+esc(m.id)+'"',t('habitHubGlobalOpenCamera'))
      +'</div></div>';
    body.innerHTML=html;
  }

  function propRow(label,controlHtml){
    return '<div class="habit-hub-peek-prop"><span class="habit-hub-peek-prop-label">'+esc(label)+'</span><div class="habit-hub-peek-prop-control">'+controlHtml+'</div></div>';
  }
  function opt(val,label,cur){ return '<option value="'+esc(val)+'"'+(cur===val?' selected':'')+'>'+esc(label)+'</option>'; }
  function advLink(attr,label){ return '<button type="button" class="habit-hub-peek-link" '+attr+'>'+esc(label)+'</button>'; }

  function renderChrome(m){
    var title=$('habitHubPeekTitle');
    var sub=$('habitHubPeekSub');
    var kicker=$('habitHubPeekKicker');
    if(kicker) kicker.textContent=t('habitPeekKicker');
    if(title) title.textContent=hubName(m);
    if(sub) sub.textContent=t('habitPeekSub');
    renderProps(m);
    var actionsBtn=$('habitPeekActionsBtn');
    if(!actionsBtn){
      var body=$('habitHubPeekBody');
      if(body){
        actionsBtn=document.createElement('button');
        actionsBtn.type='button';
        actionsBtn.id='habitPeekActionsBtn';
        actionsBtn.className='habit-peek-actions-btn';
        actionsBtn.textContent=t('habitPeekActions','动作与入口');
        body.insertBefore(actionsBtn, body.firstChild);
      }
    }
    if(actionsBtn){
      actionsBtn.onclick=function(){
        close();
        if(global.OneToneState) global.OneToneState.selectedMappingId=m.id;
        if(global.OneToneHabitActionsDetail) global.OneToneHabitActionsDetail.open(m.id);
      };
    }
  }

  function showShell(on){
    var backdrop=$('habitHubPeekBackdrop');
    var peek=$('habitHubSidePeek');
    if(backdrop) backdrop.hidden=!on;
    if(peek){
      peek.classList.toggle('is-closed',!on);
      peek.setAttribute('aria-hidden',on?'false':'true');
    }
    if(!on) ui().habitHubPeekId='';
  }

  function open(id){
    id=String(id||'').trim();
    var m=core()&&core().byId?core().byId(id):null;
    if(!m) return;
    ui().habitHubPeekId=id;
    draft=buildDraft(m);
    renderChrome(m);
    showShell(true);
  }

  function close(){
    draft=null;
    showShell(false);
  }

  function applyKeyMode(m,mode){
    var d=diffApi();
    var baseline=keyBaseline();
    if(mode==='disable'){
      m.keyModeEnabled=false;
      return;
    }
    m.keyModeEnabled=true;
    if(mode==='default'){
      if(d&&d.restoreKeyFieldsToGlobal) d.restoreKeyFieldsToGlobal(m,baseline);
      else{
        m.triggerKey='';
        m.targetKey='';
      }
    }
  }

  function applyVoiceMode(m,mode){
    var cfg=state().config||{};
    var d=diffApi();
    if(mode==='off'){
      m.voiceModeEnabled=false;
      return;
    }
    m.voiceModeEnabled=true;
    if(mode==='default'){
      m.voiceOverride=null;
      return;
    }
    var edited={engine:'vosk',modelPreset:'cn-light'};
    if(mode==='code'){
      edited.wakePhrases=['开始输入'];
    }
    var normalized=d&&d.normalizeVoiceOverrideForSave?d.normalizeVoiceOverrideForSave(edited,cfg):edited;
    m.voiceOverride=Object.keys(normalized).length?normalized:null;
  }

  function applyCamMode(m,mode){
    if(mode==='default'){
      m.cameraOverride=null;
      return;
    }
    if(mode==='off'){
      m.cameraOverride={
        triggers:{away:false,shake:false,blink:false,openPalm:false,okHand:false,fist:false,wave:false}
      };
      return;
    }
    var T=global.OneToneAgentScenarioTemplate;
    if(T&&T.applyCodexPackToMapping){
      m.cameraOverride=null;
      T.applyCodexPackToMapping(m,{channels:['camera'],reset:true,cameraTarget:'override',persist:false});
      return;
    }
    m.cameraOverride={triggers:{away:true,shake:true,blink:true,openPalm:true}};
  }

  function persist(){
    if(global.OneToneConfigPersist&&global.OneToneConfigPersist.save) global.OneToneConfigPersist.save();
    else if(global.__vp_mapping_list_ui_hooks__&&global.__vp_mapping_list_ui_hooks__.save){
      global.__vp_mapping_list_ui_hooks__.save();
    }
  }

  function save(){
    readDraftFromDom();
    if(!draft) return;
    var m=core()&&core().byId?core().byId(draft.mappingId):null;
    if(!m) return;
    applyKeyMode(m,draft.keyMode);
    applyVoiceMode(m,draft.voiceMode);
    applyCamMode(m,draft.camMode);
    m.enabled=!!draft.enabled;
    if(!m.enabled){
      var cfg=state().config||{};
      if(String(cfg.activeSceneId||'')===String(m.id||'')){
        var base=global.OneToneHabitOverrideDiff&&global.OneToneHabitOverrideDiff.findGlobalBaselineMapping
          ?global.OneToneHabitOverrideDiff.findGlobalBaselineMapping(cfg,core()):null;
        var fallId=base&&base.id?String(base.id):'';
        if(fallId&&global.OneToneSceneActivate&&global.OneToneSceneActivate.activateScene){
          global.OneToneSceneActivate.activateScene(fallId);
        }else if(cfg){
          cfg.activeSceneId=fallId;
        }
      }
    }
    m.updatedAt=Date.now();
    persist();
    close();
    if(global.OneToneHabitHub&&global.OneToneHabitHub.scheduleHubPaint) global.OneToneHabitHub.scheduleHubPaint();
    else if(global.OneToneHabitHub&&global.OneToneHabitHub.render) global.OneToneHabitHub.render();
  }

  function openAdvanced(panel,id){
    id=String(id||draft&&draft.mappingId||'').trim();
    close();
    var banner=global.OneToneHabitScenarioContextBanner;
    if(!banner||!id) return;
    if(panel==='voice'&&banner.openScenarioVoiceEdit) banner.openScenarioVoiceEdit(id,{returnToHub:true});
    else if(panel==='camera'&&banner.openScenarioCameraEdit) banner.openScenarioCameraEdit(id,{returnToHub:true});
    else if(banner.openScenarioKeysEdit) banner.openScenarioKeysEdit(id,{returnToHub:true});
  }

  function bindEvents(){
    if(bound) return;
    bound=true;
    var backdrop=$('habitHubPeekBackdrop');
    if(backdrop) backdrop.addEventListener('click',close);
    var closeBtn=$('btnHabitHubPeekClose');
    var cancelBtn=$('btnHabitHubPeekCancel');
    var saveBtn=$('btnHabitHubPeekSave');
    var delBtn=$('btnHabitHubPeekDelete');
    if(closeBtn) closeBtn.addEventListener('click',close);
    if(cancelBtn) cancelBtn.addEventListener('click',close);
    if(saveBtn) saveBtn.addEventListener('click',save);
    if(delBtn) delBtn.addEventListener('click',function(){
      if(!draft) return;
      var id=draft.mappingId;
      close();
      if(global.OneToneHabitHub&&global.OneToneHabitHub.deleteHabit) global.OneToneHabitHub.deleteHabit(id);
    });
    var peek=$('habitHubSidePeek');
    if(!peek) return;
    peek.addEventListener('change',function(e){
      var keySel=e.target.closest&&e.target.closest('[data-peek-key-mode]');
      if(keySel&&draft){
        draft.keyMode=String(keySel.value||'default');
        var m=core()&&core().byId?core().byId(draft.mappingId):null;
        if(m) renderProps(m);
      }
    });
    peek.addEventListener('click',function(e){
      var goKeys=e.target.closest&&e.target.closest('[data-peek-go-keys]');
      if(goKeys){
        e.preventDefault();
        openAdvanced('keys',goKeys.getAttribute('data-peek-go-keys'));
        return;
      }
      var goVoice=e.target.closest&&e.target.closest('[data-peek-go-voice]');
      if(goVoice){
        e.preventDefault();
        openAdvanced('voice',goVoice.getAttribute('data-peek-go-voice'));
        return;
      }
      var goCam=e.target.closest&&e.target.closest('[data-peek-go-camera]');
      if(goCam){
        e.preventDefault();
        openAdvanced('camera',goCam.getAttribute('data-peek-go-camera'));
        return;
      }
      var changeApp=e.target.closest&&e.target.closest('[data-peek-change-app]');
      if(changeApp){
        e.preventDefault();
        var id=changeApp.getAttribute('data-peek-change-app')||'';
        close();
        if(global.OneToneAppBehaviorRules&&global.OneToneAppBehaviorRules.openAppPicker){
          global.OneToneAppBehaviorRules.openAppPicker({mappingId:id});
        }
      }
    });
    document.addEventListener('keydown',function(e){
      if(e.key!=='Escape') return;
      if(ui().habitHubPeekId) close();
    });
  }

  global.OneToneHabitHubSidePeek={open:open,close:close,save:save,bindEvents:bindEvents};
})((typeof window!=='undefined')?window:globalThis);
