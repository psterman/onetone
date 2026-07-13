(function(global){
  'use strict';

  var $=function(id){ return global.OneToneDom.$(id); };
  var t=function(key){ return global.OneToneI18n.t(key); };

  var wizardMode='new';
  var pickedAppId='';
  var pendingDraftId=null;
  var choosingReplacementApp=false;
  var migrateFromId=null;

  function state(){ return global.OneToneState.state; }
  function ui(){ return global.OneToneState.ui; }
  function core(){ return global.OneToneMappingCore; }
  function hooks(){ return global.__vp_bootstrap_hooks__||global.__vp_mapping_list_ui_hooks__||{}; }

  function esc(s){
    return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');
  }

  function diffApi(){ return global.OneToneHabitOverrideDiff; }
  function appRules(){ return global.OneToneAppBehaviorRules; }

  function currentMapping(){
    var id=String(state().selectedMappingId||'').trim();
    if(!id||!core()||!core().byId) return null;
    return core().byId(id)||null;
  }

  function friendlyKey(key){
    key=String(key||'').trim();
    if(!key) return t('sceneModeUnset');
    if(global.OneToneKeyLabels&&global.OneToneKeyLabels.friendlyKeyName){
      return global.OneToneKeyLabels.friendlyKeyName(key,global.OneToneI18n.getLang())||key;
    }
    return key;
  }

  function appDisplayName(appId){
    if(String(appId||'')==='custom'){
      var m=currentMapping();
      var rules=appRules();
      var custom=rules&&rules.customRulesForMapping&&m?rules.customRulesForMapping(m):[];
      if(custom&&custom[0]&&rules.ruleDisplayName) return rules.ruleDisplayName(custom[0]);
    }
    if(appRules()&&appRules().appDisplayName) return appRules().appDisplayName(appId);
    return appId||'—';
  }

  function scenarioDisplayName(m){
    if(!m) return '—';
    var hub=global.OneToneHabitHub;
    if(hub&&hub.habitName) return hub.habitName(m);
    return String(m.group||m.label||'').trim()||'—';
  }

  function defaultScenarioName(appId){
    return t('habitWizardDefaultName').replace('{app}',appDisplayName(appId));
  }

  function previewLabels(){
    return {
      chipAppSelected:t('habitScenarioChipAppSelected'),
      chipAppMissing:t('habitScenarioChipAppMissing'),
      chipNameOk:t('habitScenarioChipNameOk'),
      chipNameMissing:t('habitScenarioChipNameMissing'),
      chipKeysInherit:t('habitScenarioChipKeysInherit'),
      chipKeysOverride:t('habitScenarioChipKeysOverride'),
      chipVoiceInherit:t('habitScenarioChipVoiceInherit'),
      chipVoiceOverride:t('habitScenarioChipVoiceOverride'),
      chipSaveReady:t('habitScenarioChipSaveReady'),
      chipSaveEmpty:t('habitScenarioChipSaveEmpty'),
      chipSaveBlocked:t('habitScenarioChipSaveBlocked'),
      triggerKey:t('keysSummaryTriggerLbl'),
      targetKey:t('targetTitle'),
      finish:t('habitSummaryFinishLbl'),
      engine:t('voiceColRecognize'),
      wakePhrases:t('voiceColWake'),
      endPhrases:t('endPhrasesLabel'),
      enableScenario:t('habitScenarioEnableScenario'),
      enableKeys:t('habitScenarioEnableKeys'),
      enableVoice:t('habitScenarioEnableVoice'),
      enableOff:t('habitScenarioEnableOff')
    };
  }

  function buildPreview(){
    var m=currentMapping();
    var cfg=state().config||{};
    var nameInput=$('habitScenarioNameInput');
    var name=nameInput?String(nameInput.value||'').trim():'';
    if(!name&&m) name=scenarioDisplayName(m);
    var appId=String(m&&m.appTargetId||pickedAppId||'').trim();
    var api=diffApi();
    if(!api||!api.buildScenarioSavePreview) return null;
    return api.buildScenarioSavePreview(m,cfg,{
      pickedAppId:pickedAppId,
      name:name,
      appName:appDisplayName(appId),
      scope:t('habitScenarioAppExe').replace('{app}',appDisplayName(appId)||appId),
      mappingCore:core(),
      labels:previewLabels()
    });
  }

  function renderLabels(){
    var map={
      btnHabitWizardBackLabel:'habitHubBack',
      habitScenarioPickAppTitle:'habitScenarioPickAppTitle',
      habitScenarioPickAppDesc:'habitScenarioPickAppDesc',
      habitScenarioEditAppTitle:'habitScenarioEditAppTitle',
      habitScenarioEnableLbl:'habitScenarioEnableLbl',
      btnHabitScenarioChangeApp:'habitScenarioChangeApp',
      habitScenarioNameLbl:'habitScenarioNameLbl',
      habitScenarioTabKeys:'habitScenarioTabKeys',
      habitScenarioTabVoice:'habitScenarioTabVoice',
      habitScenarioMainPlaceholder:'habitScenarioMainPlaceholder',
      habitScenarioPreviewTitle:'habitScenarioPreviewTitle',
      habitScenarioFlowHint:'habitScenarioFlowHint',
      habitScenarioDiffTitle:'habitScenarioDiffTitle',
      habitScenarioFootHint:'habitScenarioFootHint',
      btnHabitScenarioCancel:'habitScenarioCancel',
      btnHabitScenarioSave:'habitScenarioSaveBtn',
      btnHabitScenarioSaveTop:'habitScenarioSaveBtn',
      btnHabitScenarioRestoreKeys:'habitScenarioRestoreKeys',
      btnHabitScenarioRestoreVoice:'habitScenarioRestoreVoice',
      btnHabitScenarioRestoreAll:'habitScenarioRestoreAll'
    };
    Object.keys(map).forEach(function(id){
      var el=$(id);
      if(el) el.textContent=t(map[id]);
    });
    var title=$('habitScenarioTitle');
    var desc=$('habitScenarioDesc');
    if(wizardMode==='edit'){
      var m=currentMapping();
      if(title) title.textContent=t('habitScenarioTitleEdit').replace('{name}',scenarioDisplayName(m));
    }else if(title) title.textContent=t('habitScenarioTitleNew');
    if(desc) desc.textContent=t('habitScenarioDesc');
  }

  function applyShellVisibility(){
    var hub=$('habitHubView');
    var wizard=$('habitWizardView');
    var detail=$('habitDetailView');
    var view=ui().habitView||'hub';
    if(hub){
      hub.hidden=view!=='hub';
      hub.setAttribute('aria-hidden',view==='hub'?'false':'true');
    }
    if(wizard){
      wizard.hidden=view!=='wizard';
      wizard.setAttribute('aria-hidden',view==='wizard'?'false':'true');
    }
    if(detail) detail.hidden=true;
    var appStrip=$('keysAppBindingStrip');
    if(appStrip) appStrip.hidden=true;
    var panel=$('settingsPanelHabits');
    if(panel){
      panel.classList.toggle('is-habit-hub',view==='hub');
      panel.classList.toggle('is-habit-wizard',view==='wizard');
    }
    if(global.OneToneHabitLayerNav) global.OneToneHabitLayerNav.applyVisibility();
  }

  function bindMappingContext(m){
    if(!m) return;
    state().selectedMappingId=m.id;
    ui().voiceEditSchemeId=m.id;
    var h=hooks();
    if(h.syncEditorFromSelection) h.syncEditorFromSelection();
  }

  function createDraftMapping(appId){
    if(!core()) return null;
    core().ensureConfig&&core().ensureConfig();
    var cfg=state().config;
    var id=core().newMappingId?core().newMappingId():('m-'+Date.now()+'-'+Math.random().toString(36).slice(2,7));
    var m={
      id:id,
      label:'',
      group:defaultScenarioName(appId),
      triggerKey:'',
      targetKey:'',
      enabled:true,
      order:Array.isArray(cfg.mappings)?cfg.mappings.length:0,
      triggerMode:'tap',
      intervalMs:cfg.intervalMs||1200,
      enterDelayMs:cfg.enterDelayMs||5000,
      cancelEnabled:cfg.cancelEnabled!==false,
      autoEnterEnabled:cfg.autoEnterEnabled!==false,
      switchKeys:[],
      nativeKeyRestore:false,
      imePresetId:'',
      appTargetId:String(appId||'').trim(),
      appBehaviorRules:[],
      voiceOverride:null,
      updatedAt:Date.now(),
      lastUsedAt:0,
      useCount:0
    };
    if(core().ensureMappingExtras) core().ensureMappingExtras(m);
    if(appRules()&&appRules().ensurePrimaryAppRule) appRules().ensurePrimaryAppRule(m,appId);
    cfg.mappings=Array.isArray(cfg.mappings)?cfg.mappings:[];
    cfg.mappings.push(m);
    pendingDraftId=id;
    bindMappingContext(m);
    return m;
  }

  function hasAppContext(){
    return !!(String(pickedAppId||'').trim()||(currentMapping()&&currentMapping().appTargetId));
  }

  function renderAppGrid(){
    var grid=$('habitScenarioAppGrid');
    if(!grid) return;
    var presets=[];
    if(global.OneToneAppTargetPresets&&Array.isArray(global.OneToneAppTargetPresets.presets)){
      presets=global.OneToneAppTargetPresets.presets.slice();
    }
    if(!presets.length&&appRules()&&Array.isArray(appRules().behaviorPresets)){
      presets=appRules().behaviorPresets.map(function(p){
        var id=String(p&&p.id||'').trim();
        if(!id) return null;
        var preset=global.OneToneAppTargetPresets&&global.OneToneAppTargetPresets.presetById
          ?global.OneToneAppTargetPresets.presetById(id):null;
        return {id:id,icon:preset&&preset.icon?preset.icon:''};
      }).filter(Boolean);
    }
    var html=presets.map(function(p){
      var id=String(p.id||'').trim();
      var name=appDisplayName(id);
      var icon=p.icon?'<img class="habit-wizard-app-icon" src="'+esc(p.icon)+'" alt="" decoding="async" />':'';
      var on=pickedAppId===id?' is-selected':'';
      return '<button type="button" class="habit-wizard-app-card'+on+'" data-wizard-app="'+esc(id)+'" role="listitem">'
        +icon+'<span class="habit-wizard-app-name">'+esc(name)+'</span></button>';
    }).join('');
    if(!presets.length) html='<p class="habit-wizard-empty">'+esc(t('habitWizardNoApps'))+'</p>';
    html+='<button type="button" class="habit-wizard-app-card habit-wizard-app-card--custom'+(pickedAppId==='custom'?' is-selected':'')+'" data-wizard-custom-app role="listitem">'
      +'<span class="habit-wizard-app-icon habit-wizard-app-icon--custom" aria-hidden="true">＋</span>'
      +'<span class="habit-wizard-app-name">'+esc(t('habitScenarioCustomApp'))+'</span></button>';
    grid.innerHTML=html;
  }

  function renderAside(){
    var asideNew=$('habitScenarioAsideNew');
    var asideEdit=$('habitScenarioAsideEdit');
    var isEdit=wizardMode==='edit'&&!choosingReplacementApp&&hasAppContext();
    if(asideNew) asideNew.hidden=isEdit;
    if(asideEdit) asideEdit.hidden=!isEdit;
    if(isEdit){
      var m=currentMapping();
      var appId=String(m&&m.appTargetId||pickedAppId||'').trim();
      var info=$('habitScenarioAppInfo');
      if(info){
        info.innerHTML='<div class="habit-scenario-app-info-name">'+esc(appDisplayName(appId))+'</div>'
          +'<div class="habit-scenario-app-info-scope">'+esc(t('habitScenarioScopeLine').replace('{scope}',t('habitScenarioAppExe').replace('{app}',appDisplayName(appId))))+'</div>';
      }
      var toggle=$('habitScenarioEnabledToggle');
      if(toggle&&m){
        toggle.classList.toggle('is-on',!!m.enabled);
        toggle.setAttribute('aria-checked',m.enabled?'true':'false');
      }
      var changeBtn=$('btnHabitScenarioChangeApp');
      if(changeBtn) changeBtn.hidden=false;
    }else{
      renderAppGrid();
    }
  }

  function copyMappingFields(source,target){
    if(!source||!target) return;
    ['triggerKey','targetKey','triggerMode','autoEnterEnabled','cancelEnabled','keyModeEnabled','voiceModeEnabled','enabled'].forEach(function(k){
      if(source[k]!==undefined) target[k]=source[k];
    });
    if(source.voiceOverride) target.voiceOverride=JSON.parse(JSON.stringify(source.voiceOverride));
    else target.voiceOverride=null;
    if(String(source.group||'').trim()&&!String(target.group||'').trim()) target.group=source.group;
  }

  function renderStatusSummary(preview){
    var bar=$('habitScenarioStatusBar');
    if(!bar) return;
    if(!preview||!preview.appId){
      bar.innerHTML='<span class="habit-scenario-status-text">'+esc(t('habitScenarioMainPlaceholder'))+'</span>';
      return;
    }
    var keysLbl=preview.keysOverrideCount>0
      ?t('habitScenarioStatusKeysOverride').replace('{n}',String(preview.keysOverrideCount))
      :t('habitScenarioStatusKeysInherit');
    var voiceLbl=preview.voiceOverrideCount>0
      ?t('habitScenarioStatusVoiceOverride').replace('{n}',String(preview.voiceOverrideCount))
      :t('habitScenarioStatusVoiceInherit');
    bar.innerHTML='<span class="habit-scenario-status-text">'
      +esc(t('habitScenarioStatusSummary')
        .replace('{app}',preview.appName||preview.appId)
        .replace('{keys}',keysLbl)
        .replace('{voice}',voiceLbl))
      +'</span>';
  }

  function renderPreviewPanel(preview){
    preview=preview||buildPreview();
    var card=$('habitScenarioPreviewCard');
    var states=$('habitScenarioEnableStates');
    var list=$('habitScenarioDiffList');
    var empty=$('habitScenarioDiffEmpty');
    var saveBtn=$('btnHabitScenarioSave');
    var saveTop=$('btnHabitScenarioSaveTop');
    var restoreKeys=$('btnHabitScenarioRestoreKeys');
    var restoreVoice=$('btnHabitScenarioRestoreVoice');
    var restoreAll=$('btnHabitScenarioRestoreAll');
    if(!preview){
      if(card) card.textContent='—';
      if(list) list.innerHTML='';
      if(saveBtn) saveBtn.disabled=true;
      if(saveTop) saveTop.disabled=true;
      return;
    }
    renderStatusSummary(preview);
    if(card){
      card.innerHTML='<strong>'+esc(preview.appName||'—')+'</strong>'
        +'<span class="habit-scenario-app-info-scope">'+esc(preview.scope||'')+'</span>';
    }
    if(states){
      function row(lbl,on){
        return '<div class="habit-scenario-enable-row"><span>'+esc(lbl)+'</span><span>'+esc(on?t('habitScenarioEnableOn'):t('habitScenarioEnableOff'))+'</span></div>';
      }
      states.innerHTML=row(t('habitScenarioEnableScenario'),preview.scenarioEnabled)
        +row(t('habitScenarioEnableKeys'),preview.keysModeEnabled)
        +row(t('habitScenarioEnableVoice'),preview.voiceModeEnabled);
    }
    var items=(preview.stateOverrides||[]).concat(preview.keysOverrides||[],preview.voiceOverrides||[]);
    if(list){
      list.innerHTML=items.map(function(it){
        return '<li>'+esc(it.label)+'：'+esc(it.value)+'</li>';
      }).join('');
      list.hidden=!items.length;
    }
    if(empty){
      empty.hidden=!preview.allInherited||!preview.canSave;
      if(preview.allInherited&&preview.canSave){
        empty.textContent=preview.saveKind==='empty'
          ?t('habitScenarioDiffEmpty')+' — '+t('habitScenarioDiffEmptySave')
          :t('habitScenarioDiffEmpty');
      }
    }
    if(saveBtn) saveBtn.disabled=!preview.canSave;
    if(saveTop) saveTop.disabled=!preview.canSave;
    var canRestore=preview.canSave&&preview.saveKind==='overrides';
    if(restoreKeys) restoreKeys.disabled=!canRestore||!preview.keysOverrideCount;
    if(restoreVoice) restoreVoice.disabled=!canRestore||!preview.voiceOverrideCount;
    if(restoreAll) restoreAll.disabled=!canRestore;
  }

  function setMainDisabled(disabled){
    ['habitScenarioMain','habitScenarioPreview'].forEach(function(id){
      var el=$(id);
      if(el) el.classList.toggle('is-disabled',!!disabled);
    });
    var ph=$('habitScenarioMainPlaceholder');
    if(ph) ph.hidden=!disabled;
  }

  function isEditableAppScenario(m){
    var api=diffApi();
    if(!m||!api||!api.isAppScenarioMapping||!api.isAppScenarioMapping(m)) return false;
    if(!String(m.appTargetId||'').trim()) return false;
    if(api.isGlobalBaselineMapping&&api.isGlobalBaselineMapping(m,state().config||{},core())) return false;
    return true;
  }

  function redirectNonAppScenario(m,opts){
    opts=opts||{};
    var api=diffApi();
    var isBaseline=api&&api.isGlobalBaselineMapping&&api.isGlobalBaselineMapping(m,state().config||{},core());
    var nav=global.OneToneHabitScenarioContextBanner;
    if(isBaseline&&nav){
      var voice=opts.layer==='advanced'||opts.voiceTab;
      if(voice) nav.openGlobalVoice({fromHub:true});
      else nav.openGlobalKeys({fromHub:true});
      return;
    }
    showHub();
    if(global.OneToneAppToast) global.OneToneAppToast.show(t('habitHubLegacyGlobalHint'),'scheme');
  }

  function removeNewModeDraft(){
    if(wizardMode!=='new') return;
    var cfg=state().config||{};
    if(!Array.isArray(cfg.mappings)) return;
    var id=String(pendingDraftId||state().selectedMappingId||'').trim();
    if(!id) return;
    cfg.mappings=cfg.mappings.filter(function(x){ return x&&x.id!==id; });
    if(String(state().selectedMappingId||'')===id){
      state().selectedMappingId=null;
      ui().voiceEditSchemeId=null;
    }
    pendingDraftId=null;
  }

  function renderMain(){
    var m=currentMapping();
    var ready=hasAppContext()&&!!m;
    setMainDisabled(!ready);
    var nameInput=$('habitScenarioNameInput');
    if(nameInput&&m){
      var syncId=String(m.id||'')+'|'+String(m.appTargetId||pickedAppId||'');
      if(nameInput.dataset.syncId!==syncId&&document.activeElement!==nameInput){
        nameInput.value=wizardMode==='new'?defaultScenarioName(m.appTargetId||pickedAppId):scenarioDisplayName(m);
        nameInput.dataset.syncId=syncId;
      }
    }else if(nameInput){
      nameInput.dataset.syncId='';
    }
    var access=global.OneToneHabitScenarioAccessCards;
    if(access&&access.render) access.render(ready?m:null);
    renderStatusSummary(buildPreview());
  }

  function renderScenario(){
    renderAside();
    renderMain();
    renderPreviewPanel(buildPreview());
  }

  function render(){
    renderLabels();
    applyShellVisibility();
    if((ui().habitView||'hub')!=='wizard') return;
    renderScenario();
  }

  function selectApp(appId){
    appId=String(appId||'').trim();
    if(!appId) return;
    pickedAppId=appId;
    if(wizardMode==='new'&&!choosingReplacementApp){
      removeNewModeDraft();
      createDraftMapping(appId);
      if(migrateFromId&&core()&&core().byId){
        var src=core().byId(migrateFromId);
        var draft=currentMapping();
        if(src&&draft) copyMappingFields(src,draft);
      }
      var nameInput=$('habitScenarioNameInput');
      if(nameInput){
        nameInput.value=defaultScenarioName(appId);
        nameInput.dataset.syncId=String((currentMapping()&&currentMapping().id)||'')+'|'+appId;
      }
    }else{
      var m=currentMapping();
      if(m){
        m.appTargetId=appId;
        if(appRules()&&appRules().ensurePrimaryAppRule) appRules().ensurePrimaryAppRule(m,appId);
        m.group=defaultScenarioName(appId);
        var nameInputEdit=$('habitScenarioNameInput');
        if(nameInputEdit){
          nameInputEdit.value=m.group;
          nameInputEdit.dataset.syncId=String(m.id||'')+'|'+appId;
        }
      }
      choosingReplacementApp=false;
    }
    renderScenario();
  }

  function selectCustomApp(){
    if(wizardMode==='new'&&!choosingReplacementApp){
      selectApp('custom');
    }else{
      var m=currentMapping();
      if(m){
        pickedAppId='custom';
        m.appTargetId='custom';
        choosingReplacementApp=false;
      }
    }
    if(appRules()&&appRules().openAppPicker) appRules().openAppPicker();
    renderScenario();
  }

  function openNew(opts){
    opts=opts||{};
    wizardMode='new';
    pickedAppId='';
    pendingDraftId=null;
    choosingReplacementApp=false;
    migrateFromId=String(opts.migrateFrom||'').trim()||null;
    state().selectedMappingId=null;
    ui().voiceEditSchemeId=null;
    ui().habitScenarioReturnId=null;
    ui().habitScenarioReturnPanel=null;
    ui().habitHubEditReturn=false;
    ui().habitView='wizard';
    ui().habitScenarioTab='keys';
    if(global.OneToneSettingsDrawer) global.OneToneSettingsDrawer.setPanel('habits');
    render();
  }

  function openEdit(id,opts){
    opts=opts||{};
    id=String(id||'').trim();
    if(!id||!core()||!core().byId) return;
    var m=core().byId(id);
    if(!m) return;
    if(!isEditableAppScenario(m)){
      redirectNonAppScenario(m,opts);
      return;
    }
    wizardMode='edit';
    pickedAppId=String(m.appTargetId||'').trim();
    pendingDraftId=null;
    choosingReplacementApp=false;
    ui().habitHubEditReturn=false;
    bindMappingContext(m);
    ui().habitView='wizard';
    var tab=(opts.layer==='advanced'||opts.voiceTab)?'voice':'keys';
    ui().habitScenarioTab=tab;
    if(global.OneToneSettingsDrawer) global.OneToneSettingsDrawer.setPanel('habits');
    render();
  }

  function discardPendingDraft(){
    if(!pendingDraftId||!core()) return;
    var cfg=state().config||{};
    if(!Array.isArray(cfg.mappings)) return;
    var idx=cfg.mappings.findIndex(function(x){ return x&&x.id===pendingDraftId; });
    if(idx>=0) cfg.mappings.splice(idx,1);
    if(String(state().selectedMappingId||'')===pendingDraftId){
      state().selectedMappingId=null;
      ui().voiceEditSchemeId=null;
    }
    pendingDraftId=null;
  }

  function showHub(){
    discardPendingDraft();
    ui().habitView='hub';
    pickedAppId='';
    if(global.OneToneHabitHub){
      global.OneToneHabitHub.applyShellVisibility&&global.OneToneHabitHub.applyShellVisibility();
      global.OneToneHabitHub.render();
    }else render();
  }

  function restoreKeysToGlobal(){
    var m=currentMapping();
    var cfg=state().config||{};
    if(!m||!diffApi()||!diffApi().restoreKeyFieldsToGlobal) return;
    diffApi().restoreKeyFieldsToGlobal(m,diffApi().getGlobalKeyBaseline(cfg,core()));
    m.keyModeEnabled=true;
    renderScenario();
  }

  function restoreVoiceToGlobal(){
    var m=currentMapping();
    if(!m) return;
    m.voiceOverride=null;
    m.voiceModeEnabled=true;
    renderScenario();
  }

  function restoreAllToGlobal(){
    if(!window.confirm(t('habitScenarioRestoreAllConfirm'))) return;
    var m=currentMapping();
    if(m) m.enabled=true;
    restoreKeysToGlobal();
    restoreVoiceToGlobal();
    renderScenario();
  }

  function saveScenario(){
    var preview=buildPreview();
    if(!preview||!preview.canSave) return Promise.resolve(null);
    var m=currentMapping();
    if(!m) return Promise.resolve(null);
    var nameInput=$('habitScenarioNameInput');
    var name=nameInput?String(nameInput.value||'').trim():'';
    if(!name) name=defaultScenarioName(m.appTargetId||pickedAppId);
    m.group=name;
    var cfg=state().config||{};
    if(appRules()&&appRules().ensureRulesBeforeSave) appRules().ensureRulesBeforeSave(m);
    if(diffApi()&&diffApi().normalizeKeyFieldsForSave){
      diffApi().normalizeKeyFieldsForSave(m,diffApi().getGlobalKeyBaseline(cfg,core()),true);
    }
    if(diffApi()&&diffApi().isEmptyOverride&&diffApi().isEmptyOverride(m.voiceOverride)){
      m.voiceOverride=null;
    }
    m.updatedAt=Date.now();
    if(global.OneToneHabitHub&&global.OneToneHabitHub.touchUpdated) global.OneToneHabitHub.touchUpdated(m);
    var saveFn=global.OneToneConfigPersist&&global.OneToneConfigPersist.saveAsync
      ?global.OneToneConfigPersist.saveAsync
      :null;
    var toastKey=preview.saveKind==='empty'?'habitScenarioSavedEmpty':'habitScenarioSaved';
    var legacyMigrateId=migrateFromId;
    var done=function(){
      pendingDraftId=null;
      migrateFromId=null;
      if(global.OneToneAppToast) global.OneToneAppToast.show(t(toastKey),'scheme');
      showHub();
      if(global.OneToneHabitHub) global.OneToneHabitHub.render();
      if(legacyMigrateId&&window.confirm(t('habitMigrateDeletePrompt'))){
        if(global.OneToneHabitHub&&global.OneToneHabitHub.deleteHabit){
          global.OneToneHabitHub.deleteHabit(legacyMigrateId);
        }
      }
    };
    if(saveFn) return saveFn().then(done);
    if(hooks().save) hooks().save();
    done();
    return Promise.resolve(m);
  }

  function bindEvents(){
    var shell=$('habitWizardView');
    if(shell){
      shell.addEventListener('click',function(e){
        var appBtn=e.target.closest&&e.target.closest('[data-wizard-app]');
        if(appBtn){
          e.preventDefault();
          selectApp(appBtn.dataset.wizardApp||'');
          return;
        }
        var customAppBtn=e.target.closest&&e.target.closest('[data-wizard-custom-app]');
        if(customAppBtn){
          e.preventDefault();
          selectCustomApp();
          return;
        }
        var tabBtn=e.target.closest&&e.target.closest('[data-habit-scenario-tab]');
        if(tabBtn) return;
        if(e.target.closest&&e.target.closest('#habitScenarioKeysSummary')) return;
        if(e.target.closest&&e.target.closest('#habitScenarioVoiceSummary')) return;
      });
    }
    var back=$('btnHabitWizardBack');
    if(back) back.addEventListener('click',function(e){ e.preventDefault(); showHub(); });
    var cancel=$('btnHabitScenarioCancel');
    if(cancel) cancel.addEventListener('click',function(e){ e.preventDefault(); showHub(); });
    var save=$('btnHabitScenarioSave');
    if(save) save.addEventListener('click',function(e){ e.preventDefault(); saveScenario(); });
    var saveTop=$('btnHabitScenarioSaveTop');
    if(saveTop) saveTop.addEventListener('click',function(e){ e.preventDefault(); saveScenario(); });
    var nameInput=$('habitScenarioNameInput');
    if(nameInput) nameInput.addEventListener('input',function(){ renderPreviewPanel(buildPreview()); });
    var enableToggle=$('habitScenarioEnabledToggle');
    if(enableToggle){
      enableToggle.addEventListener('click',function(){
        var m=currentMapping();
        if(!m) return;
        m.enabled=!m.enabled;
        enableToggle.classList.toggle('is-on',!!m.enabled);
        enableToggle.setAttribute('aria-checked',m.enabled?'true':'false');
        renderPreviewPanel(buildPreview());
      });
    }
    var restoreKeys=$('btnHabitScenarioRestoreKeys');
    if(restoreKeys) restoreKeys.addEventListener('click',function(e){ e.preventDefault(); restoreKeysToGlobal(); });
    var restoreVoice=$('btnHabitScenarioRestoreVoice');
    if(restoreVoice) restoreVoice.addEventListener('click',function(e){ e.preventDefault(); restoreVoiceToGlobal(); });
    var restoreAll=$('btnHabitScenarioRestoreAll');
    if(restoreAll) restoreAll.addEventListener('click',function(e){ e.preventDefault(); restoreAllToGlobal(); });
    var changeApp=$('btnHabitScenarioChangeApp');
    if(changeApp) changeApp.addEventListener('click',function(e){
      e.preventDefault();
      choosingReplacementApp=true;
      var m=currentMapping();
      pickedAppId=String(m&&m.appTargetId||'').trim();
      renderScenario();
    });
    if(global.OneToneHabitScenarioAccessCards){
      global.OneToneHabitScenarioAccessCards.bindEvents({
        onChange:function(){
          renderPreviewPanel(buildPreview());
          renderMain();
        }
      });
    }
  }

  global.OneToneHabitScenarioWizard={
    render:render,
    openNew:openNew,
    openEdit:openEdit,
    showHub:showHub,
    bindEvents:bindEvents,
    applyShellVisibility:applyShellVisibility,
    buildPreview:buildPreview,
    restoreKeysToGlobal:restoreKeysToGlobal,
    restoreVoiceToGlobal:restoreVoiceToGlobal
  };
})((typeof window!=='undefined')?window:globalThis);
