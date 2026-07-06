(function(global){
  'use strict';

  var $=function(id){ return global.OneToneDom.$(id); };
  var ui=function(){ return global.OneToneState.ui; };
  var state=function(){ return global.OneToneState.state; };
  function t(key){ return global.OneToneI18n.t(key); }

  var TAB_IDS=['keys','voice','advanced'];

  function panelActive(){
    return ui().drawerOpen&&ui().settingsPanel==='keyWake';
  }

  function setSceneTab(tab){
    if(tab==='target') tab='keys';
    if(TAB_IDS.indexOf(tab)<0) tab='keys';
    ui().sceneTab=tab;
    applySceneTabVisibility();
    renderSceneTabs();
    if(tab==='voice'&&global.OneToneSceneVoiceTab) global.OneToneSceneVoiceTab.render();
  }

  function applySceneTabVisibility(){
    var panel=$('settingsPanelKeyWake');
    if(!panel) return;
    var tab=ui().sceneTab||'keys';
    if(tab==='target'){
      tab='keys';
      ui().sceneTab='keys';
    }
    panel.dataset.sceneTab=tab;
    var voicePanel=$('sceneVoicePanel');
    if(voicePanel) voicePanel.hidden=(tab!=='voice');
    var mappingSection=$('keyWakeMappingSection');
    if(mappingSection) mappingSection.hidden=(tab!=='keys'&&tab!=='advanced');
    var globalFooter=$('sceneGlobalVoiceFooter');
    if(globalFooter) globalFooter.hidden=!panelActive()||tab!=='advanced';
    var statusBar=$('sceneStatusBar');
    if(statusBar) statusBar.hidden=!panelActive()||tab!=='keys';
  }

  function renderSceneTabs(){
    var bar=$('sceneTabBar');
    if(bar){
      bar.hidden=!panelActive();
      bar.querySelectorAll('[data-scene-tab]').forEach(function(btn){
        var on=btn.dataset.sceneTab===(ui().sceneTab||'keys');
        btn.classList.toggle('is-active',on);
        btn.setAttribute('aria-selected',on?'true':'false');
      });
    }
    applySceneTabVisibility();
    renderSceneHeroCard();
    renderSceneGlobalFooter();
    var tabLabels={keys:'sceneTabKeysLabel',voice:'sceneTabVoiceLabel',advanced:'sceneTabAdvancedLabel'};
    Object.keys(tabLabels).forEach(function(tab){
      var el=$(tabLabels[tab]);
      if(el) el.textContent=t('sceneTab'+tab.charAt(0).toUpperCase()+tab.slice(1));
    });
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

  function renderSceneHeroCard(){
    var statusBar=$('sceneStatusBar');
    if(!statusBar) return;
    var tab=ui().sceneTab||'keys';
    statusBar.hidden=!panelActive()||tab!=='keys';
    if(!panelActive()||tab!=='keys') return;

    var st=state();
    var selId=st.selectedMappingId;
    var activeId=st.config&&st.config.activeSceneId;
    var selectedMappingObj=findMapping(selId);
    var isDifferent=!!(selId&&activeId&&selId!==activeId);
    var m=selectedMappingObj;

    var kickerEl=$('sceneHeroKicker');
    if(kickerEl) kickerEl.textContent=isDifferent?t('sceneEditingKicker'):t('sceneHeroTitle');
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
      if(!m){
        badgeEl.textContent='—';
        badgeEl.className='scene-hero-badge key-scheme-meta-chip';
      }else if(global.OneToneMappingCore&&global.OneToneMappingCore.isDraft(m)){
        badgeEl.textContent=t('keySchemeCompletenessDraft');
        badgeEl.className='scene-hero-badge key-scheme-meta-chip is-draft';
      }else if(global.OneToneMappingCore&&global.OneToneMappingCore.isSaved(m)){
        badgeEl.textContent=t('keySchemeCompletenessDone');
        badgeEl.className='scene-hero-badge key-scheme-meta-chip is-done';
      }else{
        badgeEl.textContent=t('keySchemeCompletenessIncomplete');
        badgeEl.className='scene-hero-badge key-scheme-meta-chip is-pending';
      }
    }
    var completeEl=$('keySchemeCompletenessChip');
    if(completeEl&&badgeEl) completeEl.textContent=badgeEl.textContent;

    var conflictEl=$('keySchemeConflictChip');
    if(conflictEl){
      var hasConflict=false;
      if(m&&global.OneToneMappingCore){
        var hooks=global.__vp_key_finish_flow_render_hooks__||{};
        if(hooks.schemeMappingHasConflict) hasConflict=hooks.schemeMappingHasConflict(m);
      }
      conflictEl.hidden=!hasConflict;
      if(hasConflict) conflictEl.textContent=t('keySchemeConflict');
    }

    var btn=$('btnKeySchemeActivate');
    if(btn){
      var canActivate=!!(m&&global.OneToneMappingCore&&global.OneToneMappingCore.isSaved(m));
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
      global.OneToneSceneFlowSummary.syncFlowSummary(m,{context:'settings',focusStep:''});
    }
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

  function renderSceneGlobalFooter(){
    var footer=$('sceneGlobalVoiceFooter');
    if(!footer) return;
    var tab=ui().sceneTab||'keys';
    footer.hidden=!panelActive()||tab!=='advanced';
    var cfg=state().config;
    var micEl=$('sceneGlobalMicValue');
    var engineEl=$('sceneGlobalEngineValue');
    if(engineEl) engineEl.textContent=engineSummary(cfg);
    if(micEl){
      var hooks=global.__vp_bootstrap_hooks__||{};
      var micName='—';
      if(typeof hooks.micDevices==='function'){
        var devices=hooks.micDevices()||[];
        var activeId=hooks.activeMicId&&hooks.activeMicId();
        var dev=devices.find(function(d){ return d.id===activeId; })
          ||devices.find(function(d){ return d.isDefault; })
          ||devices[0];
        if(dev&&dev.name) micName=dev.name;
      }
      micEl.textContent=micName;
    }
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
    var bar=$('sceneTabBar');
    if(bar){
      bar.addEventListener('click',function(e){
        var btn=e.target.closest&&e.target.closest('[data-scene-tab]');
        if(!btn) return;
        setSceneTab(btn.dataset.sceneTab||'keys');
      });
    }
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
    applyVisibility:applySceneTabVisibility,
    bindEvents:bindEvents
  };
})((typeof window!=='undefined')?window:globalThis);
