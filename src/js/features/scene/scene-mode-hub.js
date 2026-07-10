(function(global){
  'use strict';

  var $=function(id){ return global.OneToneDom.$(id); };
  var state=function(){ return global.OneToneState.state; };
  var ui=function(){ return global.OneToneState.ui; };
  var t=function(key){ return global.OneToneI18n.t(key); };

  function esc(s){
    return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');
  }

  function cfg(){
    return state().config||{};
  }

  function core(){
    return global.OneToneMappingCore;
  }

  function hp(){
    return global.OneToneHabitProfile;
  }

  function friendlyKey(key){
    key=String(key||'').trim();
    if(!key) return t('sceneModeUnset');
    if(global.OneToneKeyLabels&&global.OneToneKeyLabels.friendlyKeyName){
      return global.OneToneKeyLabels.friendlyKeyName(key,global.OneToneI18n.getLang())||key;
    }
    return key;
  }

  function listPhrases(arr){
    if(!Array.isArray(arr)||!arr.length) return t('sceneModeUnset');
    return arr.filter(Boolean).slice(0,4).join(' / ');
  }

  function finishText(m){
    if(global.OneToneSceneFlowSummary&&global.OneToneSceneFlowSummary.finishBehaviorTextSettings){
      var fin=global.OneToneSceneFlowSummary.finishBehaviorTextSettings(m);
      if(fin&&fin.text) return fin.text;
    }
    if(m&&m.autoEnterEnabled) return t('sceneModeFinishAuto');
    return t('sceneModeFinishManual');
  }

  function collectScenarioActions(){
    var c=cfg();
    var hpMod=hp();
    if(hpMod&&hpMod.projectAll){
      return hpMod.projectAll(c).filter(function(p){ return p.isComplete; }).map(function(p){
        var m=p.mapping;
        var trig=core()&&core().editorTrigger?core().editorTrigger(m):String(m.triggerKey||'');
        var tgt=core()&&core().editorTarget?core().editorTarget(m):String(m.targetKey||'');
        var detail=t('sceneModeKeyDetail')
          .replace('{trigger}',friendlyKey(trig))
          .replace('{target}',friendlyKey(tgt))
          .replace('{finish}',finishText(m));
        return {
          id:'key:'+p.id,
          kind:'key',
          refId:p.id,
          name:p.name,
          detail:detail,
          meta:p.keyEnabled?t('sceneModeKeyOn'):t('sceneModeKeyOff'),
          active:!!p.isActive,
          keyEnabled:!!p.keyEnabled,
          editable:true,
          switchable:true
        };
      });
    }
    var maps=Array.isArray(c.mappings)?c.mappings:[];
    return maps.filter(function(m){
      return !!(String(m.triggerKey||'').trim()||String(m.targetKey||'').trim());
    }).map(function(m){
      var saved=core()&&core().isSaved?core().isSaved(m):false;
      return {
        id:'key:'+m.id,
        kind:'key',
        refId:m.id,
        name:m.group||m.label||m.id,
        detail:t('sceneModeKeyDetail')
          .replace('{trigger}',friendlyKey(m.triggerKey))
          .replace('{target}',friendlyKey(m.targetKey))
          .replace('{finish}',finishText(m)),
        meta:saved?t('sceneModeKeyOn'):t('sceneModeKeyIncomplete'),
        active:!!(c.activeSceneId&&m.id===c.activeSceneId),
        keyEnabled:!!m.enabled,
        editable:true,
        switchable:saved
      };
    });
  }

  function voiceEngineLabel(engine){
    if(engine==='sapi') return t('voiceModeLiteEngine');
    if(engine==='vosk') return t('voiceModeProEngine');
    return t('sceneModeVoice');
  }

  function collectVoiceActions(){
    var c=cfg();
    var out=[];
    var sapi=c.voiceSapi||c.voice_sapi||{};
    var vosk=c.voiceVosk||c.voice_vosk||{};
    var end=c.voiceEnd||c.voice_end||{};
    var hideLite=global.OneToneVoiceEngineReadiness&&global.OneToneVoiceEngineReadiness.isVoskOnlyUi&&global.OneToneVoiceEngineReadiness.isVoskOnlyUi();
    if(!hideLite&&(sapi.enabled||(Array.isArray(sapi.phrases)&&sapi.phrases.length))){
      out.push({
        id:'voice:sapi',
        kind:'voice',
        name:t('sceneModeVoiceWake'),
        detail:t('sceneModeVoiceWakeDetail')
          .replace('{engine}',voiceEngineLabel('sapi'))
          .replace('{phrases}',listPhrases(sapi.phrases))
          .replace('{target}',friendlyKey(sapi.targetKey||end.targetKey||'RAlt')),
        meta:sapi.enabled?t('sceneModeEnabled'):t('sceneModeDisabled'),
        active:!!sapi.enabled,
        editable:true,
        switchable:false
      });
    }
    if(vosk.enabled||(Array.isArray(vosk.phrases)&&vosk.phrases.length)){
      out.push({
        id:'voice:vosk',
        kind:'voice',
        name:t('sceneModeVoiceWakeOffline'),
        detail:t('sceneModeVoiceWakeDetail')
          .replace('{engine}',voiceEngineLabel('vosk'))
          .replace('{phrases}',listPhrases(vosk.phrases))
          .replace('{target}',friendlyKey(vosk.targetKey||end.targetKey||'RAlt')),
        meta:vosk.enabled?t('sceneModeEnabled'):t('sceneModeDisabled'),
        active:!!vosk.enabled,
        editable:true,
        switchable:false
      });
    }
    var endZh=end.phrasesZh||end.phrases_zh||[];
    var endEn=end.phrasesEn||end.phrases_en||[];
    if(end.enabled||end.autoSendEnabled||end.auto_send_enabled||endZh.length||endEn.length){
      var phrases=endZh.concat(endEn);
      out.push({
        id:'voice:end',
        kind:'voice',
        name:t('sceneModeVoiceEnd'),
        detail:t('sceneModeVoiceEndDetail')
          .replace('{phrases}',listPhrases(phrases))
          .replace('{key}',friendlyKey(end.commitKey||end.commit_key||'Enter')),
        meta:(end.autoSendEnabled||end.auto_send_enabled)?t('sceneModeVoiceAutoSend'):t('sceneModeVoiceManualSend'),
        active:!!end.enabled,
        editable:true,
        switchable:false
      });
    }
    return out;
  }

  function collectVoiceProfileActions(){
    var c=cfg();
    var hpMod=hp();
    if(!hpMod||!Array.isArray(c.mappings)) return [];
    return c.mappings.filter(function(m){
      if(!hpMod.hasVoiceParts(m,c)) return false;
      if(hpMod.hasKeyParts(m)) return false;
      return true;
    }).map(function(m){
      var p=hpMod.project(m,c);
      var ov=m.voiceOverride||{};
      var wake=listPhrases(ov.wakePhrases&&ov.wakePhrases.length?ov.wakePhrases:(p.effectiveWakePhrases||[]));
      var endZh=(ov.endPhrases&&ov.endPhrases.zh)||(p.effectiveEndPhrases&&p.effectiveEndPhrases.zh)||[];
      var endEn=(ov.endPhrases&&ov.endPhrases.en)||(p.effectiveEndPhrases&&p.effectiveEndPhrases.en)||[];
      var end=listPhrases(endZh.concat(endEn));
      var detail=t('sceneModeVoiceProfileDetail')
        .replace('{wake}',wake)
        .replace('{end}',end);
      if(m.appTargetId&&global.OneToneAppBehaviorRules){
        detail+=' · '+global.OneToneAppBehaviorRules.appDisplayName(m.appTargetId);
      }
      return {
        id:'voice-profile:'+m.id,
        kind:'voice',
        refId:m.id,
        name:p.name,
        detail:detail,
        meta:p.isActive?t('sceneModeActive'):t('sceneModeVoiceProfileMeta'),
        active:!!p.isActive,
        editable:true,
        switchable:!!p.isComplete
      };
    });
  }

  function collectItems(){
    return collectScenarioActions().concat(collectVoiceProfileActions()).concat(collectVoiceActions());
  }

  function filteredItems(items){
    var filter=ui().sceneModeFilter||'all';
    if(filter==='key') return items.filter(function(it){ return it.kind==='key'; });
    if(filter==='voice') return items.filter(function(it){ return it.kind==='voice'; });
    return items;
  }

  function renderLabels(){
    var labels={
      settingsNavScenesLabel:'settingsNavScenes',
      settingsPanelScenesTitle:'settingsPanelScenesTitle',
      settingsPanelScenesDesc:'settingsPanelScenesDesc',
      btnSceneModeNew:'sceneModeNew',
      btnSceneModeNewVoice:'sceneModeNewVoice',
      btnSceneModeManage:'sceneModeManage',
      btnSceneModeOpenKeys:'sceneModeOpenKeys',
      btnSceneModeOpenVoice:'sceneModeOpenVoice',
      sceneModeTotalLabel:'sceneModeTotalLabel',
      sceneModeKeyLabel:'sceneModeKeyLabel',
      sceneModeVoiceLabel:'sceneModeVoiceLabel',
      sceneModeFilterAll:'sceneModeFilterAll',
      sceneModeFilterKey:'sceneModeFilterKey',
      sceneModeFilterVoice:'sceneModeFilterVoice',
      sceneModeEmptyTitle:'sceneModeEmptyTitle',
      sceneModeEmptyDesc:'sceneModeEmptyDesc'
    };
    Object.keys(labels).forEach(function(id){
      var el=$(id);
      if(el) el.textContent=t(labels[id]);
    });
  }

  function renderFilters(){
    var filter=ui().sceneModeFilter||'all';
    document.querySelectorAll('[data-scene-mode-filter]').forEach(function(btn){
      var on=(btn.dataset.sceneModeFilter||'all')===filter;
      btn.classList.toggle('is-active',on);
      btn.setAttribute('aria-selected',on?'true':'false');
    });
  }

  function renderStats(items){
    var keyCount=items.filter(function(it){ return it.kind==='key'; }).length;
    var voiceCount=items.filter(function(it){ return it.kind==='voice'; }).length;
    var total=$('sceneModeTotalCount');
    var key=$('sceneModeKeyCount');
    var voice=$('sceneModeVoiceCount');
    if(total) total.textContent=String(items.length);
    if(key) key.textContent=String(keyCount);
    if(voice) voice.textContent=String(voiceCount);
  }

  function scenarioDisplayName(refId){
    var m=core()&&core().byId?core().byId(refId):null;
    var hpMod=hp();
    if(m&&hpMod&&hpMod.habitDisplayName) return hpMod.habitDisplayName(m);
    var items=collectScenarioActions();
    var hit=items.filter(function(it){ return it.refId===refId; })[0];
    return hit?hit.name:(refId||'—');
  }

  function renderVoiceSubnav(){
    var subnav=$('settingsSceneVoiceSubnav');
    var listEl=$('settingsSceneVoiceSubnavList');
    var sidebar=$('settingsSidebar')||document.querySelector('.settings-sidebar');
    var shell=$('settingsShell')||document.querySelector('.settings-shell');
    var voicePanel=$('settingsPanelVoiceWake');
    var st=ui();
    var show=st.drawerOpen&&st.settingsPanel==='voiceWake';
    if(subnav) subnav.hidden=!show;
    if(sidebar) sidebar.classList.toggle('is-voice-panel',show);
    if(shell) shell.classList.toggle('is-voice-panel',show);
    if(voicePanel) voicePanel.classList.toggle('is-voice-subnav',show);
    if(!listEl) return;
    listEl.setAttribute('aria-label',t('settingsSceneVoiceSubnavLabel'));
    if(!show){ listEl.innerHTML=''; if(global.OneToneSettingsDrawer&&global.OneToneSettingsDrawer.syncSubnavRail) global.OneToneSettingsDrawer.syncSubnavRail(); return; }
    var items=collectVoiceActions();
    if(!items.length){
      listEl.innerHTML='<p class="settings-scheme-subnav-empty">'+esc(t('sceneModeVoiceEmpty'))+'</p>';
      return;
    }
    var sel=st.selectedSceneVoiceNav;
    if(st.settingsPanel==='voiceWake'&&sel!=='voice:end'){
      var exp=global.OneToneVoiceWake&&global.OneToneVoiceWake.getExpandedMode?global.OneToneVoiceWake.getExpandedMode():'vosk';
      sel=exp==='vosk'?'voice:vosk':'voice:sapi';
      st.selectedSceneVoiceNav=sel;
    }
    if(!sel||!items.some(function(it){ return it.id===sel; })) sel=items[0].id;
    var html='';
    items.forEach(function(it){
      var selected=it.id===sel;
      html+='<button type="button" class="settings-scheme-subnav-item'+(selected?' is-selected':'')+(it.active?' is-on':'')+'" data-scene-voice-nav="'+esc(it.id)+'" role="tab" aria-selected="'+(selected?'true':'false')+'">';
      html+='<span class="settings-scheme-subnav-text">';
      html+='<span class="settings-scheme-subnav-pair">'+esc(it.name)+'</span>';
      html+='<span class="settings-scheme-subnav-status">'+esc(it.meta)+'</span>';
      html+='</span></button>';
    });
    listEl.innerHTML=html;
    if(global.OneToneSettingsDrawer&&global.OneToneSettingsDrawer.syncSubnavRail) global.OneToneSettingsDrawer.syncSubnavRail();
  }

  function cardHtml(it){
    var icon=it.kind==='voice'?'🎤':'⌨';
    var html='<article class="scene-mode-card scene-mode-card--'+esc(it.kind)+(it.active?' is-active':'')+'" data-scene-mode-card="'+esc(it.id)+'" role="listitem">';
    html+='<span class="scene-mode-icon" aria-hidden="true">'+icon+'</span>';
    html+='<div class="scene-mode-main">';
    html+='<div class="scene-mode-title-row">';
    html+='<span class="scene-mode-name">'+esc(it.name)+'</span>';
    html+='<span class="scene-mode-badge">'+esc(it.kind==='voice'?t('sceneModeVoice'):t('sceneModeKey'))+'</span>';
    if(it.active) html+='<span class="scene-mode-badge is-active">'+esc(t('sceneModeActive'))+'</span>';
    if(it.kind==='key'&&it.keyEnabled) html+='<span class="scene-mode-badge is-on">'+esc(t('sceneModeKeyOn'))+'</span>';
    html+='</div>';
    html+='<div class="scene-mode-detail">'+esc(it.detail)+'</div>';
    html+='<div class="scene-mode-meta">'+esc(it.meta)+'</div>';
    html+='</div>';
    html+='<div class="scene-mode-actions">';
    if(it.switchable) html+='<button type="button" class="scene-mode-card-btn is-primary" data-scene-mode-switch="'+esc(it.refId)+'">'+esc(t('sceneModeSwitch'))+'</button>';
    html+='<button type="button" class="scene-mode-card-btn" data-scene-mode-edit="'+esc(it.id)+'">'+esc(t('sceneModeEdit'))+'</button>';
    if(it.refId&&(it.kind==='key'||String(it.id||'').indexOf('voice-profile:')===0)){
      html+='<button type="button" class="scene-mode-card-btn" data-scene-mode-dup="'+esc(it.refId)+'">'+esc(t('sceneModeCopy'))+'</button>';
      html+='<button type="button" class="scene-mode-card-btn" data-scene-mode-rename="'+esc(it.refId)+'">'+esc(t('sceneModeRename'))+'</button>';
      html+='<button type="button" class="scene-mode-card-btn is-danger" data-scene-mode-del="'+esc(it.refId)+'">'+esc(t('sceneModeDelete'))+'</button>';
    }
    html+='</div></article>';
    return html;
  }

  function render(){
    renderLabels();
    var items=collectItems();
    renderStats(items);
    renderFilters();
    renderVoiceSubnav();
    var visible=filteredItems(items);
    var list=$('sceneModeList');
    var empty=$('sceneModeEmpty');
    if(empty) empty.hidden=visible.length>0;
    if(!list) return;
    list.hidden=!visible.length;
    list.innerHTML=visible.map(cardHtml).join('');
  }

  function openKeys(id){
    if(id){
      state().selectedMappingId=id;
      var hooks=global.__vp_bootstrap_hooks__||{};
      if(hooks.syncEditorFromSelection) hooks.syncEditorFromSelection();
    }
    if(global.OneToneSettingsDrawer) global.OneToneSettingsDrawer.setPanel('keys');
  }

  function openScenarioDetail(id){
    openKeys(id);
  }

  function openScenarioHub(){
    if(global.OneToneSettingsDrawer) global.OneToneSettingsDrawer.setPanel('scenes');
  }

  function openVoiceProfile(id){
    openKeys(id);
    ui().habitAdvancedFocus='voice';
    if(global.OneToneSceneVoiceTab) global.OneToneSceneVoiceTab.render();
    var stash=$('keysCompatStash');
    if(stash) stash.scrollIntoView({behavior:'smooth',block:'nearest'});
  }

  function defaultVoiceNavId(){
    if(global.OneToneVoiceEngineReadiness&&global.OneToneVoiceEngineReadiness.isVoskOnlyUi()) return 'voice:vosk';
    return 'voice:sapi';
  }

  function openVoiceEdit(navId){
    ui().selectedSceneVoiceNav=navId||defaultVoiceNavId();
    if(global.OneToneSettingsDrawer) global.OneToneSettingsDrawer.setPanel('voiceWake');
    if(global.OneToneSettingsDrawer&&global.OneToneSettingsDrawer.scrollToVoiceAction){
      global.OneToneSettingsDrawer.scrollToVoiceAction(ui().selectedSceneVoiceNav);
    }
  }

  function triggerNewVoiceScenario(){
    if(global.OneToneHabitHub&&global.OneToneHabitHub.createFromVoice){
      var m=global.OneToneHabitHub.createFromVoice();
      if(m&&m.id) openVoiceProfile(m.id);
      render();
      return;
    }
    openVoiceEdit(defaultVoiceNavId());
  }

  function triggerNewScenario(){
    openKeys();
    var add=$('btnAddMapping');
    if(add) add.click();
  }

  function bindEvents(){
    var panel=$('settingsPanelScenes');
    if(panel){
      panel.addEventListener('click',function(e){
        var filterBtn=e.target.closest&&e.target.closest('[data-scene-mode-filter]');
        if(filterBtn){
          e.preventDefault();
          ui().sceneModeFilter=filterBtn.dataset.sceneModeFilter||'all';
          render();
          return;
        }
        var switchBtn=e.target.closest&&e.target.closest('[data-scene-mode-switch]');
        if(switchBtn){
          e.preventDefault();
          if(global.OneToneSceneActivate) global.OneToneSceneActivate.activateScene(switchBtn.dataset.sceneModeSwitch);
          render();
          return;
        }
        var editBtn=e.target.closest&&e.target.closest('[data-scene-mode-edit]');
        if(editBtn){
          e.preventDefault();
          var id=editBtn.dataset.sceneModeEdit||'';
          if(id.indexOf('key:')===0) openScenarioDetail(id.slice(4));
          else if(id.indexOf('voice-profile:')===0) openVoiceProfile(id.slice(14));
          else openVoiceEdit(id);
          return;
        }
        var dupBtn=e.target.closest&&e.target.closest('[data-scene-mode-dup]');
        if(dupBtn){
          e.preventDefault();
          e.stopPropagation();
          if(global.OneToneMappingTrashMenu) global.OneToneMappingTrashMenu.duplicate(dupBtn.dataset.sceneModeDup);
          render();
          return;
        }
        var renameBtn=e.target.closest&&e.target.closest('[data-scene-mode-rename]');
        if(renameBtn){
          e.preventDefault();
          e.stopPropagation();
          var rid=renameBtn.dataset.sceneModeRename;
          var m=core()&&core().byId?core().byId(rid):null;
          if(!m) return;
          var next=prompt(t('sceneModeRenamePrompt'),scenarioDisplayName(rid));
          if(next===null) return;
          next=String(next).trim();
          if(!next) return;
          m.group=next;
          m.updatedAt=Date.now();
          var hooks=global.__vp_bootstrap_hooks__||{};
          if(hooks.save) hooks.save();
          render();
          if(hooks.renderSettingsSchemeSubnav) hooks.renderSettingsSchemeSubnav();
          return;
        }
        var delBtn=e.target.closest&&e.target.closest('[data-scene-mode-del]');
        if(delBtn){
          e.preventDefault();
          e.stopPropagation();
          if(global.OneToneMappingTrashMenu) global.OneToneMappingTrashMenu.deleteFromMenu(delBtn.dataset.sceneModeDel);
          render();
          var hooks=global.__vp_bootstrap_hooks__||{};
          if(hooks.renderSettingsSchemeSubnav) hooks.renderSettingsSchemeSubnav();
          return;
        }
      });
    }
    var newBtn=$('btnSceneModeNew');
    if(newBtn) newBtn.addEventListener('click',function(e){ e.preventDefault(); triggerNewScenario(); });
    var openKeysBtn=$('btnSceneModeOpenKeys');
    if(openKeysBtn) openKeysBtn.addEventListener('click',function(e){ e.preventDefault(); openKeys(); });
    var openVoiceBtn=$('btnSceneModeOpenVoice');
    if(openVoiceBtn) openVoiceBtn.addEventListener('click',function(e){ e.preventDefault(); openVoiceEdit(defaultVoiceNavId()); });
    var newVoiceBtn=$('btnSceneModeNewVoice');
    if(newVoiceBtn) newVoiceBtn.addEventListener('click',function(e){ e.preventDefault(); triggerNewVoiceScenario(); });
  }

  global.OneToneSceneModeHub={
    render:render,
    renderVoiceSubnav:renderVoiceSubnav,
    bindEvents:bindEvents,
    openScenarioDetail:openScenarioDetail,
    openScenarioHub:openScenarioHub,
    openVoiceProfile:openVoiceProfile,
    triggerNewVoiceScenario:triggerNewVoiceScenario
  };
})((typeof window!=='undefined')?window:globalThis);
