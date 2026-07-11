(function(global){
  'use strict';

  var $=function(id){ return global.OneToneDom.$(id); };
  var ui=function(){ return global.OneToneState.ui; };
  var state=function(){ return global.OneToneState.state; };
  function t(key){ return global.OneToneI18n.t(key); }

  var TAB_IDS=['keys','voice','advanced']; // legacy scene-tab ids; routed to habit layers

  function panelActive(){
    var drawer=global.OneToneSettingsDrawer;
    return ui().drawerOpen&&(drawer&&drawer.isHabitsPanel?drawer.isHabitsPanel():ui().settingsPanel==='habits');
  }

  function setSceneTab(tab){
    if(tab==='target') tab='keys';
    if(tab==='advanced'){
      if(global.OneToneHabitLayerNav) global.OneToneHabitLayerNav.setHabitLayer('advanced');
      return;
    }
    if(tab==='voice'){
      if(global.OneToneHabitLayerNav) global.OneToneHabitLayerNav.setHabitLayer('advanced');
      ui().habitAdvancedFocus='voice';
      if(global.OneToneSceneVoiceTab) global.OneToneSceneVoiceTab.render();
      var voicePanel=$('sceneVoicePanel');
      if(voicePanel) voicePanel.scrollIntoView({behavior:'smooth',block:'nearest'});
      return;
    }
    if(global.OneToneHabitLayerNav) global.OneToneHabitLayerNav.setHabitLayer('global');
    ui().sceneTab='keys';
    applySceneTabVisibility();
    renderSceneTabs();
  }

  function keysPanelActive(){
    var drawer=global.OneToneSettingsDrawer;
    return ui().drawerOpen&&drawer&&drawer.isKeysPanel&&drawer.isKeysPanel();
  }

  function applySceneTabVisibility(){
    var keyWakeSection=$('quickKeyWakeSection');
    if(keyWakeSection) keyWakeSection.hidden=!keysPanelActive();
    var hubView=ui().habitView==='hub';
    var statusBar=$('sceneStatusBar');
    if(statusBar) statusBar.hidden=!panelActive()||hubView;
    if(global.OneToneHabitLayerNav&&panelActive()){
      global.OneToneHabitLayerNav.onPanelVisibility();
    }
  }

  function renderSceneTabs(){
    applySceneTabVisibility();
    if(panelActive()) renderSceneHeroCard();
    if(keysPanelActive()) renderKeysPanelChrome();
    renderSceneGlobalFooter();
    if(global.OneToneHabitLayerNav) global.OneToneHabitLayerNav.render();
    if(global.OneToneHabitHub&&panelActive()&&ui().habitView==='hub') global.OneToneHabitHub.render();
  }

  function findMapping(id){
    var st=state();
    if(!st.config||!Array.isArray(st.config.mappings)||!id) return null;
    return st.config.mappings.find(function(m){ return m.id===id; })||null;
  }

  function selectedMapping(){
    return findMapping(state().selectedMappingId);
  }

  function mappingDisplayLabel(m){
    if(!m) return '—';
    if((m.label||'').trim()) return m.label.trim();
    if(m.triggerKey&&m.targetKey){
      var kl=global.OneToneKeyLabels;
      var lang=global.OneToneI18n.getLang();
      if(kl){
        return (kl.friendlyKeyName(m.triggerKey,lang)||m.triggerKey)+' → '+(kl.friendlyKeyName(m.targetKey,lang)||m.targetKey);
      }
      return m.triggerKey+' → '+m.targetKey;
    }
    if((m.group||'').trim()) return m.group.trim();
    return m.id||'—';
  }

  function formatEffectivePreview(effective, hasOverride){
    if(!effective) return '—';
    var lang=global.OneToneI18n.getLang();
    var kl=global.OneToneKeyLabels;
    var keyLabel=effective.targetKey||'—';
    if(kl) keyLabel=kl.friendlyKeyName(effective.targetKey,lang)||keyLabel;
    var wake=(effective.wakePhrases||[])[0]||'—';
    var end=((effective.endPhrases&&effective.endPhrases.zh)||[])[0]||'—';
    var body=t('scenePreviewLine')
      .replace('{wake}',wake)
      .replace('{target}',keyLabel)
      .replace('{end}',end);
    if(hasOverride) body+=' · '+t('scenePreviewHasOverride');
    return body;
  }

  function habitDisplayName(m){
    if(!m) return '—';
    if((m.group||'').trim()) return m.group.trim();
    if(global.OneToneHomeScheme&&global.OneToneHomeScheme.shortName) return global.OneToneHomeScheme.shortName(m);
    return mappingDisplayLabel(m);
  }

  function isLibraryHabit(m){
    var hp=global.OneToneHabitProfile;
    var cfg=state().config||{};
    if(hp&&hp.isLibraryHabit) return hp.isLibraryHabit(m,cfg);
    return !!(m&&global.OneToneMappingCore&&global.OneToneMappingCore.isSaved&&global.OneToneMappingCore.isSaved(m));
  }

  function resolveHabitStatus(m){
    if(!m) return {kind:'none',text:'—'};
    var hasConflict=false;
    if(global.OneToneMappingCore){
      var hooks=global.__vp_key_finish_flow_render_hooks__||{};
      if(hooks.schemeMappingHasConflict) hasConflict=hooks.schemeMappingHasConflict(m);
      else if(global.OneToneMappingCore.schemeHasConflict) hasConflict=global.OneToneMappingCore.schemeHasConflict(m);
    }
    if(hasConflict) return {kind:'needsConflict',text:t('sceneHeroStatusNeedsConflict')};
    var trig=global.OneToneMappingCore&&global.OneToneMappingCore.editorTrigger
      ?global.OneToneMappingCore.editorTrigger(m):((m.triggerKey||'').trim());
    var tgt=global.OneToneMappingCore&&global.OneToneMappingCore.editorTarget
      ?global.OneToneMappingCore.editorTarget(m):((m.targetKey||'').trim());
    if(isLibraryHabit(m)&&(!trig||!tgt)){
      return {kind:'ready',text:t('sceneHeroStatusReady')};
    }
    if(!trig||!tgt||!global.OneToneMappingCore.isSaved(m)){
      return {kind:'needsComplete',text:t('sceneHeroStatusNeedsComplete')};
    }
    return {kind:'ready',text:t('sceneHeroStatusReady')};
  }

  function habitProfile(m){
    var hp=global.OneToneHabitProfile;
    var cfg=state().config;
    return hp&&hp.project&&m?hp.project(m,cfg||{}):null;
  }

  function renderHabitSwitcher(){
    var menu=$('habitSwitcherMenu');
    var btn=$('habitSwitcherBtn');
    var btnLbl=$('habitSwitcherBtnLabel');
    if(btnLbl) btnLbl.textContent=t('habitSchemeManageLabel');
    if(!menu||!btn) return;
    var st=state();
    var selId=st.selectedMappingId;
    var activeId=st.config&&st.config.activeSceneId;
    var mappings=(st.config&&Array.isArray(st.config.mappings))?global.OneToneMappingCore.sorted():[];
    var html='';
    mappings.forEach(function(m){
      if(!isLibraryHabit(m)) return;
      var name=habitDisplayName(m);
      var isSel=m.id===selId;
      var profile=habitProfile(m);
      var isActive=profile?profile.isActive:!!(activeId&&m.id===activeId);
      html+='<button type="button" class="habit-switcher-item'+(isSel?' is-active':'')+(isActive?' is-active-scene':'')+'" role="option" data-habit-switch="'+m.id+'" aria-selected="'+(isSel?'true':'false')+'">';
      html+='<span>'+name+'</span></button>';
    });
    if(html){
      html+='<div class="habit-switcher-divider" role="separator"></div>';
    }
    html+='<button type="button" class="habit-switcher-add" id="habitSwitcherAdd">'+t('habitSwitcherNew')+'</button>';
    menu.innerHTML=html;
    btn.setAttribute('aria-expanded',menu.hidden?'false':'true');
  }

  function closeHabitSwitcher(){
    var menu=$('habitSwitcherMenu');
    var btn=$('habitSwitcherBtn');
    if(menu) menu.hidden=true;
    if(btn) btn.setAttribute('aria-expanded','false');
  }

  function toggleHabitSwitcher(){
    var menu=$('habitSwitcherMenu');
    if(!menu) return;
    menu.hidden=!menu.hidden;
    var btn=$('habitSwitcherBtn');
    if(btn) btn.setAttribute('aria-expanded',menu.hidden?'false':'true');
  }

  function escHtml(s){
    return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');
  }

  function resolveEffectiveSource(m,foregroundCtx){
    if(!m) return t('habitEffectiveSourceDefault');
    var preview=foregroundCtx||'';
    if(!preview&&global.OneToneAppBehaviorRules) preview=global.OneToneAppBehaviorRules.getActiveAppContextId()||'';
    if(!preview&&global.OneToneHabitLayerNav&&global.OneToneHabitLayerNav.getForegroundContextRef){
      preview=global.OneToneHabitLayerNav.getForegroundContextRef(m)||'';
    }else if(!preview&&global.OneToneHabitLayerNav){
      preview=global.OneToneHabitLayerNav.getForegroundAppId()||'';
    }
    if(preview&&global.OneToneAppBehaviorRules){
      var eff=global.OneToneAppBehaviorRules.resolveEffectiveFinish(m,preview);
      if(eff) return t('habitEffectiveSourceApp').replace('{app}',eff.appName);
    }
    return t('habitEffectiveSourceDefault');
  }

  function foregroundDisplayName(appId,m){
    var nav=global.OneToneHabitLayerNav;
    var identity=nav&&nav.getForegroundIdentity?nav.getForegroundIdentity():null;
    var rules=global.OneToneAppBehaviorRules;
    if(identity&&rules&&rules.identityDisplayName){
      var ctx=rules.resolveForegroundContextRef&&m?rules.resolveForegroundContextRef(m,identity):'';
      if(ctx&&rules.resolveEffectiveFinish){
        var eff=rules.resolveEffectiveFinish(m,ctx);
        if(eff&&eff.appName) return eff.appName;
      }
      var name=rules.identityDisplayName(identity);
      if(name) return name;
    }
    if(!appId) return t('habitEffectiveForegroundUnknown');
    if(rules&&rules.appDisplayName) return rules.appDisplayName(appId);
    if(rules&&rules.behaviorPresets){
      var preset=rules.behaviorPresets.find(function(p){ return p.id===appId; });
      if(preset&&preset.nameKey) return t(preset.nameKey);
    }
    return appId;
  }

  function renderEffectivePreview(){
    var wrap=$('sceneEffectivePreview');
    var metaEl=$('habitSchemeStatusMeta');
    var tab=ui().sceneTab||'keys';
    if(!panelActive()||(ui().habitLayer||'global')!=='global'){
      if(wrap) wrap.hidden=true;
      if(metaEl) metaEl.innerHTML='';
      return;
    }
    if(wrap) wrap.hidden=true;
    var m=selectedMapping();
    var st=state();
    var activeId=st.config&&st.config.activeSceneId;
    var activeM=findMapping(activeId)||m;
    var titleEl=$('sceneEffectivePreviewTitle');
    if(titleEl) titleEl.textContent=t('habitEffectivePreviewTitle');
    var fgId=global.OneToneHabitLayerNav&&global.OneToneHabitLayerNav.getForegroundContextRef
      ?global.OneToneHabitLayerNav.getForegroundContextRef(activeM)
      :(global.OneToneHabitLayerNav?global.OneToneHabitLayerNav.getForegroundAppId():'');
    var tagsEl=$('sceneEffectivePreviewTags');
    var schemeName=habitDisplayName(activeM);
    var fgName=foregroundDisplayName(fgId,activeM);
    var source=resolveEffectiveSource(activeM,fgId);
    var tagsHtml=
      '<span class="scene-effective-tag"><span class="scene-effective-tag-lbl">'+escHtml(t('habitEffectiveTagScheme'))+'</span><span class="scene-effective-tag-val">'+escHtml(schemeName)+'</span></span>'+
      '<span class="scene-effective-tag"><span class="scene-effective-tag-lbl">'+escHtml(t('habitEffectiveTagForeground'))+'</span><span class="scene-effective-tag-val">'+escHtml(fgName)+'</span></span>'+
      '<span class="scene-effective-tag"><span class="scene-effective-tag-lbl">'+escHtml(t('habitEffectiveTagSource'))+'</span><span class="scene-effective-tag-val">'+escHtml(source)+'</span></span>';
    if(tagsEl) tagsEl.innerHTML=tagsHtml;
    if(metaEl) metaEl.innerHTML=tagsHtml;
    var bodyEl=$('sceneEffectivePreviewBody');
    if(bodyEl&&activeM&&global.OneToneSceneFlowSummary){
      var preview=fgId||'';
      var fin=global.OneToneSceneFlowSummary.finishBehaviorTextSettings(activeM,preview);
      var trig=global.OneToneSceneFlowSummary.displayTriggerLabel(activeM)||'—';
      bodyEl.textContent=t('habitEffectivePreviewBody')
        .replace('{trigger}',trig)
        .replace('{finish}',fin.text||'—');
    }else if(bodyEl){
      bodyEl.textContent='—';
    }
    syncSchemeStatusCard(m);
  }

  function syncSchemeStatusCard(m){
    var status=resolveHabitStatus(m);
    var card=$('habitSchemeStatusCard');
    if(card){
      var textEl=$('habitSchemeStatusText');
      var subEl=$('habitSchemeStatusSub');
      var iconEl=$('habitSchemeStatusIcon');
      card.className='habit-scheme-status-card is-'+status.kind.replace('needs','needs-');
      if(status.kind==='ready'){
        if(textEl) textEl.textContent=t('habitSchemeStatusOk');
        if(subEl) subEl.textContent=t('habitSchemeStatusSubOk');
      }else if(status.kind==='needsComplete'){
        if(textEl) textEl.textContent=t('sceneHeroStatusNeedsComplete');
        if(subEl) subEl.textContent=t('habitSchemeStatusSubIncomplete');
      }else if(status.kind==='needsConflict'){
        if(textEl) textEl.textContent=t('sceneHeroStatusNeedsConflict');
        if(subEl) subEl.textContent=t('habitSchemeStatusSubConflict');
      }else{
        if(textEl) textEl.textContent='—';
        if(subEl) subEl.textContent='—';
      }
      if(iconEl) iconEl.classList.toggle('is-warn',status.kind!=='ready');
    }
    var pageStatus=$('habitPageStatus');
    var badgeEl=$('habitPageStatusBadge');
    var pageTextEl=$('habitPageStatusText');
    if(pageStatus){
      pageStatus.className='habit-page-status is-'+status.kind.replace('needs','needs-');
    }
    if(badgeEl){
      if(status.kind==='ready') badgeEl.textContent=t('habitSchemeStatusOk');
      else if(status.kind==='needsComplete') badgeEl.textContent=t('sceneHeroStatusNeedsComplete');
      else if(status.kind==='needsConflict') badgeEl.textContent=t('sceneHeroStatusNeedsConflict');
      else badgeEl.textContent='—';
    }
    if(pageTextEl){
      if(status.kind==='ready') pageTextEl.textContent=t('habitSchemeStatusSubOk');
      else if(status.kind==='needsComplete') pageTextEl.textContent=t('habitSchemeStatusSubIncomplete');
      else if(status.kind==='needsConflict') pageTextEl.textContent=t('habitSchemeStatusSubConflict');
      else pageTextEl.textContent='—';
    }
    var testBtn=$('btnHabitSchemeTestKeys');
    var sendBtn=$('btnTestSend');
    if(testBtn) testBtn.textContent=t('habitSchemeTestKeys');
    if(testBtn&&sendBtn) testBtn.disabled=!!sendBtn.disabled;
  }

  function renderSceneHeroCard(){
    if(!panelActive()){
      applySceneTabVisibility();
      return;
    }

    var st=state();
    var selId=st.selectedMappingId;
    var activeId=st.config&&st.config.activeSceneId;
    var selectedMappingObj=findMapping(selId);
    var isDifferent=!!(selId&&activeId&&selId!==activeId);
    var m=selectedMappingObj;

    var kickerEl=$('sceneHeroKicker');
    if(kickerEl) kickerEl.textContent=isDifferent?t('sceneHeroKickerEditing'):t('sceneHeroKickerActive');
    var nameEl=$('sceneHeroName');
    if(nameEl) nameEl.textContent=habitDisplayName(m);
    var legacyName=$('keySchemeName');
    if(legacyName) legacyName.textContent=habitDisplayName(m);
    var legacyKicker=$('keySchemeCardKicker');
    if(legacyKicker) legacyKicker.textContent=isDifferent?t('sceneEditingKicker'):t('keySchemeCardKicker');

    var actionEl=$('sceneHeroActionLine');
    if(actionEl){
      var trigLbl=m&&global.OneToneSceneFlowSummary?global.OneToneSceneFlowSummary.displayTriggerLabel(m):'';
      actionEl.textContent=trigLbl?t('sceneHeroActionLine').replace('{key}',trigLbl):t('sceneHeroActionEmpty');
    }

    var badgeEl=$('sceneHeroBadge');
    if(badgeEl){
      var status=resolveHabitStatus(m);
      badgeEl.textContent=status.text;
      badgeEl.className='scene-hero-badge key-scheme-meta-chip is-'+status.kind.replace('needs','needs-');
      if(status.kind==='ready') badgeEl.className='scene-hero-badge key-scheme-meta-chip is-ready';
      else if(status.kind==='needsComplete') badgeEl.className='scene-hero-badge key-scheme-meta-chip is-needs-complete';
      else if(status.kind==='needsConflict') badgeEl.className='scene-hero-badge key-scheme-meta-chip is-needs-conflict';
      else badgeEl.className='scene-hero-badge key-scheme-meta-chip';
    }
    var completeEl=$('keySchemeCompletenessChip');
    if(completeEl&&badgeEl) completeEl.textContent=badgeEl.textContent;

    var conflictEl=$('keySchemeConflictChip');
    if(conflictEl) conflictEl.hidden=true;

    renderHabitSwitcher();

    var btn=$('btnKeySchemeActivate');
    if(btn){
      var canActivate=!!(m&&isLibraryHabit(m));
      btn.hidden=!isDifferent||!canActivate;
      btn.disabled=!canActivate;
      btn.textContent=t('sceneActivateBtn');
    }

    var toggleEl=$('keySchemeEnabledToggle');
    var enableLbl=$('sceneHeroEnableLabel');
    if(toggleEl){
      if(m&&global.OneToneMappingCore&&global.OneToneMappingCore.isSaved(m)){
        toggleEl.hidden=false;
        toggleEl.classList.toggle('is-on',!!m.enabled);
        toggleEl.setAttribute('aria-checked',m.enabled?'true':'false');
        toggleEl.disabled=false;
        if(enableLbl) enableLbl.textContent=m.enabled?t('sceneHeroEnabled'):t('sceneHeroDisabled');
      }else{
        toggleEl.hidden=true;
        if(enableLbl) enableLbl.textContent=t('sceneHeroDisabled');
      }
    }

    if(global.OneToneSceneFlowSummary){
      global.OneToneSceneFlowSummary.renderLabels();
      var preview=global.OneToneAppBehaviorRules?global.OneToneAppBehaviorRules.getActiveAppContextId():'';
      global.OneToneSceneFlowSummary.syncFlowSummary(m,{context:'settings',focusStep:'',activeAppContextId:preview});
    }
    if(global.OneToneHabitMulti) global.OneToneHabitMulti.render();
    if(global.OneToneAppBehaviorRules) global.OneToneAppBehaviorRules.render();
    renderEffectivePreview();
    if(global.OneToneHabitCompatibility) global.OneToneHabitCompatibility.render();
    applySceneTabVisibility();
  }

  function renderKeysPanelChrome(){
    if(!keysPanelActive()) return;
    if(global.OneToneSceneFlowSummary){
      var m=selectedMapping();
      var preview=global.OneToneAppBehaviorRules?global.OneToneAppBehaviorRules.getActiveAppContextId():'';
      global.OneToneSceneFlowSummary.syncFlowSummary(m,{context:'settings',focusStep:'',activeAppContextId:preview});
    }
    if(global.OneToneHabitKeyMappingTable) global.OneToneHabitKeyMappingTable.syncRowStatus();
    renderHabitVoiceDeviceSummary();
    if(global.OneToneKeysPanelUi) global.OneToneKeysPanelUi.render();
    if(global.OneToneAppBehaviorRules) global.OneToneAppBehaviorRules.renderKeysAside();
    applySceneTabVisibility();
  }

  function syncAdvancedConflictStatus(m){
    if(global.OneToneHabitCompatibility) global.OneToneHabitCompatibility.render();
  }

  function renderSceneStatusBar(){
    renderSceneHeroCard();
  }

  function engineSummary(cfg){
    if(!cfg) return '—';
    var vosk=!!((cfg.voiceVosk||cfg.voice_vosk||{}).enabled);
    var sapi=!!((cfg.voiceSapi||cfg.voice_sapi||{}).enabled);
    if(vosk) return 'Vosk';
    if(sapi) return 'SAPI';
    return t('sceneGlobalEngineOff');
  }

  function modelPresetLabel(cfg){
    if(!cfg) return '—';
    var vosk=cfg.voiceVosk||cfg.voice_vosk||{};
    if(!vosk.enabled) return '—';
    var preset=String(vosk.modelPreset||vosk.model_preset||'cn-light').trim()||'cn-light';
    if(preset==='cn-light') return t('keysCaptureModelCnLight');
    if(preset==='en-light') return t('keysCaptureModelEnLight');
    if(preset==='cn'||preset==='cn-heavy') return t('keysCaptureModelCn');
    if(preset==='en'||preset==='en-heavy') return t('keysCaptureModelEn');
    return preset;
  }

  function getActiveMicName(){
    var hooks=global.__vp_bootstrap_hooks__||{};
    if(typeof hooks.micDevices!=='function') return '—';
    var devices=hooks.micDevices()||[];
    var activeId=hooks.activeMicId&&hooks.activeMicId();
    var dev=devices.find(function(d){ return d.id===activeId; })
      ||devices.find(function(d){ return d.isDefault; })
      ||devices[0];
    return dev&&dev.name?dev.name:'—';
  }

  function renderHabitVoiceDeviceSummary(){
    var textEl=$('habitFlowDeviceText');
    if(textEl){
      var cfg=state().config;
      textEl.textContent=t('keysCaptureVoiceSummary')
        .replace('{engine}',engineSummary(cfg))
        .replace('{model}',modelPresetLabel(cfg));
    }
    var btn=$('btnHabitFlowOpenVoice');
    if(btn) btn.textContent=t('habitFlowDeviceChange');
  }

  function renderSceneGlobalFooter(){
    var footer=$('sceneGlobalVoiceFooter');
    if(footer) footer.hidden=true;
    var cfg=state().config;
    var micEl=$('sceneGlobalMicValue');
    var engineEl=$('sceneGlobalEngineValue');
    if(engineEl) engineEl.textContent=engineSummary(cfg);
    if(micEl) micEl.textContent=getActiveMicName();
    var link=$('btnSceneOpenGlobalVoice');
    if(link) link.textContent=t('sceneGlobalFooterLink');
    var title=$('sceneGlobalFooterTitle');
    if(title) title.textContent=t('sceneGlobalFooterTitle');
    var micLbl=$('sceneGlobalMicLabel');
    if(micLbl) micLbl.textContent=t('sceneGlobalFooterMic');
    var engLbl=$('sceneGlobalEngineLabel');
    if(engLbl) engLbl.textContent=t('sceneGlobalFooterEngine');
  }

  function bindEvents(){
    var activateBtn=$('btnKeySchemeActivate');
    if(activateBtn){
      activateBtn.addEventListener('click',function(e){
        e.preventDefault();
        var id=state().selectedMappingId;
        if(id&&global.OneToneSceneActivate) global.OneToneSceneActivate.activateScene(id);
      });
    }
    var openGlobal=$('btnSceneOpenGlobalVoice');
    if(openGlobal){
      openGlobal.addEventListener('click',function(e){
        e.preventDefault();
        e.stopPropagation();
        if(global.OneToneSettingsDrawer) global.OneToneSettingsDrawer.setPanel('voiceWake');
      });
    }
    var openVoiceFlow=$('btnHabitFlowOpenVoice');
    if(openVoiceFlow){
      openVoiceFlow.addEventListener('click',function(e){
        e.preventDefault();
        e.stopPropagation();
        if(global.OneToneSettingsDrawer) global.OneToneSettingsDrawer.setPanel('voiceWake');
      });
    }
    var openKeys=$('btnHabitOpenKeys');
    if(openKeys){
      openKeys.addEventListener('click',function(e){
        e.preventDefault();
        e.stopPropagation();
        if(global.OneToneSettingsDrawer) global.OneToneSettingsDrawer.setPanel('keys');
      });
    }
    var openVoice=$('btnHabitOpenVoice');
    if(openVoice){
      openVoice.addEventListener('click',function(e){
        e.preventDefault();
        e.stopPropagation();
        if(global.OneToneSettingsDrawer) global.OneToneSettingsDrawer.setPanel('voiceWake');
      });
    }
    var switcherBtn=$('habitSwitcherBtn');
    if(switcherBtn){
      switcherBtn.addEventListener('click',function(e){
        e.stopPropagation();
        toggleHabitSwitcher();
      });
    }
    var switcherMenu=$('habitSwitcherMenu');
    if(switcherMenu){
      switcherMenu.addEventListener('click',function(e){
        var item=e.target.closest&&e.target.closest('[data-habit-switch]');
        if(item){
          e.stopPropagation();
          state().selectedMappingId=item.dataset.habitSwitch;
          closeHabitSwitcher();
          if(global.OneToneRender) global.OneToneRender.render();
          return;
        }
        if(e.target.closest('#habitSwitcherAdd')){
          e.stopPropagation();
          closeHabitSwitcher();
          var add=$('btnAddMapping');
          if(add) add.click();
        }
      });
    }
    document.addEventListener('click',function(e){
      if(!e.target.closest('#habitSwitcher')) closeHabitSwitcher();
    });
    document.addEventListener('click',function(e){
      var btn=e.target.closest&&e.target.closest('[data-scene-activate]');
      if(!btn) return;
      e.stopPropagation();
      var id=btn.dataset.sceneActivate;
      if(id&&global.OneToneSceneActivate) global.OneToneSceneActivate.activateScene(id);
    });
  }

  global.OneToneSceneTabs={
    setSceneTab:setSceneTab,
    render:renderSceneTabs,
    renderHero:renderSceneHeroCard,
    renderHabitVoiceDeviceSummary:renderHabitVoiceDeviceSummary,
    renderEffectivePreview:renderEffectivePreview,
    applyVisibility:applySceneTabVisibility,
    bindEvents:bindEvents
  };
})((typeof window!=='undefined')?window:globalThis);
