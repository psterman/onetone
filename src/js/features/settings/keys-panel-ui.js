(function(global){
  'use strict';

  var $=function(id){ return global.OneToneDom.$(id); };
  var t=function(key){ return global.OneToneI18n.t(key); };
  function state(){ return global.OneToneState.state; }
  function core(){ return global.OneToneMappingCore; }
  function hooks(){ return global.__vp_bootstrap_hooks__ || {}; }
  function ed(){ return global.OneToneMappingEditorState; }

  function habitName(m){
    if(!m) return '—';
    if((m.group||'').trim()) return m.group.trim();
    if(global.OneToneHomeScheme&&global.OneToneHomeScheme.shortName) return global.OneToneHomeScheme.shortName(m);
    if((m.label||'').trim()) return m.label.trim();
    return m.id||'—';
  }

  function esc(text){
    if(hooks().escHtml) return hooks().escHtml(text);
    return String(text||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  function appRules(){ return global.OneToneAppBehaviorRules; }

  function activeAppContextId(){
    var ctx=ed()&&ed().getEditorActiveAppContextId?ed().getEditorActiveAppContextId():'';
    if(ctx) return ctx;
    if(appRules()&&appRules().getActiveAppContextId) return appRules().getActiveAppContextId()||'';
    return '';
  }

  function presetIcon(appId){
    var atp=global.OneToneAppTargetPresets;
    if(!atp||!atp.presetById) return '';
    var preset=atp.presetById(appId);
    return preset&&preset.icon?preset.icon:'';
  }

  function renderTriggerContextBadge(){
    var badge=$('triggerAppBadgeMapping');
    var disp=$('triggerDisplay');
    if(!badge) return;
    var appId=activeAppContextId();
    badge.classList.toggle('is-placeholder',!appId);
    if(!appId){
      badge.hidden=false;
      badge.textContent='';
      badge.innerHTML='';
      badge.classList.remove('has-icon');
      badge.removeAttribute('title');
      if(disp) disp.classList.remove('has-app-target-badge');
      return;
    }
    var atp=global.OneToneAppTargetPresets;
    var preset=atp&&atp.presetById?atp.presetById(appId):null;
    if(preset&&preset.icon){
      badge.innerHTML='<img class="app-target-card-icon" src="'+esc(preset.icon)+'" alt="" decoding="async" />';
      badge.hidden=false;
      badge.classList.add('has-icon');
      badge.setAttribute('title',appRules().appDisplayName(appId));
    }else if(preset){
      var isEn=global.OneToneI18n&&global.OneToneI18n.getLang&&global.OneToneI18n.getLang()==='en';
      badge.textContent=isEn?(preset.badgeEn||preset.badge):(preset.badge||'');
      badge.hidden=false;
      badge.classList.remove('has-icon');
      badge.setAttribute('title',appRules().appDisplayName(appId));
    }else{
      badge.hidden=false;
      badge.textContent='';
      badge.innerHTML='';
      badge.classList.remove('has-icon');
    }
    if(disp) disp.classList.toggle('has-app-target-badge',!!appId);
  }

  function imeDisplayInfo(m){
    if(!m) return {name:t('keysStatusUnset'),icon:''};
    var imeId=String(m.imePresetId||'').trim();
    if(imeId&&global.OneToneImePresets&&global.OneToneImePresets.presetById){
      var preset=global.OneToneImePresets.presetById(imeId);
      if(preset){
        return {
          name:preset.nameKey?t(preset.nameKey):(preset.name||imeId),
          icon:preset.icon||''
        };
      }
    }
    return {name:imeStatusText(m),icon:''};
  }

  function renderImePill(m){
    var pill=$('keysImePill');
    var nameEl=$('keysImePillName');
    var iconEl=$('keysImePillIcon');
    var micEl=$('keysImePillMic');
    if(!pill||!nameEl) return;
    var info=imeDisplayInfo(m);
    nameEl.textContent=info.name;
    if(iconEl){
      if(info.icon){
        iconEl.src=info.icon;
        iconEl.hidden=false;
        if(micEl) micEl.hidden=true;
      }else{
        iconEl.hidden=true;
        iconEl.removeAttribute('src');
        if(micEl) micEl.hidden=false;
      }
    }
    pill.hidden=false;
  }

  function renderFlowStatusBar(m){
    var imePill=$('keysStatusImePill');
    var activePill=$('keysStatusActivePill');
    var activeLbl=$('keysStatusActiveLbl');
    var activeDot=$('keysStatusActiveDot');
    var toggle=$('btnKeysMappingEnable');
    var info=imeDisplayInfo(m);
    if(imePill){
      imePill.textContent=t('keysStatusImePill').replace('{val}',info.name);
      imePill.classList.toggle('is-on',info.name!==t('keysStatusUnset'));
    }
    var rec=global.OneToneMappingRecording;
    var mode=rec&&rec.mode?rec.mode():'none';
    var recording=mode==='trigger'||mode==='target';
    if(recording){
      var wasOn=rec&&rec.wasEnabledBeforeRecording?rec.wasEnabledBeforeRecording():!!(m&&m.enabled);
      if(activeLbl) activeLbl.textContent=mode==='target'?t('keysStatusRecordingTarget'):t('keysStatusRecordingTrigger');
      if(activeDot) activeDot.hidden=false;
      if(activePill){
        activePill.classList.add('is-recording');
        activePill.classList.add('is-on');
      }
      if(toggle){
        toggle.disabled=true;
        toggle.classList.toggle('is-on',wasOn);
        toggle.setAttribute('aria-checked',wasOn?'true':'false');
      }
      return;
    }
    if(activePill) activePill.classList.remove('is-recording');
    var enabled=!!(m&&m.enabled);
    if(activeLbl) activeLbl.textContent=enabled?t('keysStatusActiveOn'):t('keysStatusActiveOff');
    if(activeDot) activeDot.hidden=!enabled;
    if(activePill) activePill.classList.toggle('is-on',enabled);
    if(toggle){
      toggle.classList.toggle('is-on',enabled);
      toggle.setAttribute('aria-checked',enabled?'true':'false');
      toggle.disabled=!m;
    }
  }

  function renderAppContextStrip(){
    var strip=$('keysAppContextStrip');
    var wrap=$('keysAppContextStripWrap');
    var addBtn=$('btnKeysAppChipAdd');
    if(addBtn) addBtn.textContent=t('keysAppChipAdd');
    if(!strip||!wrap) return;
    var m=core()&&core().selected?core().selected():null;
    if(!m||!core().isSaved||!core().isSaved(m)){
      wrap.hidden=true;
      return;
    }
    wrap.hidden=false;
    var ctxId=activeAppContextId();
    var presets=appRules()&&appRules().behaviorPresets?appRules().behaviorPresets:[];
    var html='';
    presets.forEach(function(p){
      var icon=presetIcon(p.id);
      var isSel=ctxId===p.id;
      var isPri=m&&String(m.appTargetId||'')===p.id;
      var name=appRules().appDisplayName(p.id);
      html+='<button type="button" class="keys-app-chip'+(isSel?' is-selected':'')+(isPri?' is-primary':'')+'" data-app-context="'+esc(p.id)+'" role="radio" aria-checked="'+(isSel?'true':'false')+'" title="'+esc(name)+'">';
      if(icon){
        html+='<img class="keys-app-chip-icon" src="'+esc(icon)+'" alt="" decoding="async" />';
      }
      html+='<span>'+esc(name)+'</span></button>';
    });
    strip.innerHTML=html;
  }

  function renderHabitSwitcher(){
    var sel=$('keysHabitSwitcher');
    var lbl=$('keysHabitSwitcherLbl');
    if(lbl) lbl.textContent=t('keysStatusHabitLbl');
    if(!sel||!core()||!core().sorted) return;
    var schemes=core().sorted();
    var selected=state().selectedMappingId;
    if(!schemes.length){
      sel.innerHTML='<option value="">'+esc(t('mappingEmptyTitle'))+'</option>';
      sel.disabled=true;
      return;
    }
    sel.disabled=false;
    sel.innerHTML=schemes.map(function(m){
      return '<option value="'+esc(m.id)+'"'+(m.id===selected?' selected':'')+'>'+esc(habitName(m))+'</option>';
    }).join('');
  }

  function renderAppContext(){
    var wrap=$('keysAppContext');
    var val=$('keysAppContextVal');
    var lbl=$('keysAppContextLbl');
    var hint=$('keysAppContextHint');
    var badge=$('keysAppContextBadge');
    if(lbl) lbl.textContent=t('keysAppContextLbl');
    var m=core()&&core().selected?core().selected():null;
    if(!wrap) return;
    if(!m||!core().isSaved||!core().isSaved(m)){
      wrap.hidden=true;
      return;
    }
    wrap.hidden=false;
    var appId=activeAppContextId();
    var appName=appId&&appRules()&&appRules().appDisplayName?appRules().appDisplayName(appId):'';
    if(val) val.textContent=appName||t('keysAppContextDefault');
    if(badge){
      var isPrimary=appId&&String(m.appTargetId||'')===appId;
      badge.hidden=!isPrimary;
      if(isPrimary) badge.textContent=t('habitAppRulePrimaryOn');
    }
    if(hint){
      if(appId){
        hint.textContent=t('keysAppContextHintApp').replace('{app}',appName);
      }else{
        hint.textContent=t('keysAppContextHintDefault');
      }
    }
  }

  function previewKeyConflict(mode,key){
    key=String(key||'').trim();
    if(!key||!core()) return '';
    var m=core().selected();
    if(!m) return '';
    var norm=hooks().normalizeTriggerKey?hooks().normalizeTriggerKey(key):key;
    var mappings=(state().config&&state().config.mappings)||[];
    for(var i=0;i<mappings.length;i++){
      var other=mappings[i];
      if(!other||other.id===m.id||!other.enabled) continue;
      var otherTrig=core().editorTrigger?core().editorTrigger(other):(other.triggerKey||'');
      var otherTgt=core().editorTarget?core().editorTarget(other):(other.targetKey||'');
      if(mode==='trigger'&&otherTrig&&hooks().normalizeTriggerKey(otherTrig)===norm){
        return t('keysRecordConflictTrigger').replace('{habit}',habitName(other));
      }
      if(mode==='target'&&otherTgt&&String(otherTgt).trim()===key){
        return t('keysRecordConflictTarget').replace('{habit}',habitName(other));
      }
    }
    if(mode==='trigger'&&core().schemeHasConflict&&core().schemeHasConflict(m)){
      return t('keysRecordConflictScheme');
    }
    return '';
  }

  function syncCancelButtonHost(){
    var btn=$('btnCancelRecord');
    var feedbackMain=$('keysRecordingFeedbackMain');
    var bar=$('recordCancelBar');
    if(!btn||!bar) return;
    var rec=global.OneToneMappingRecording;
    var mode=rec&&rec.mode?rec.mode():'none';
    var recording=mode==='trigger'||mode==='target';
    var onKeys=global.OneToneSettingsDrawer&&global.OneToneSettingsDrawer.isKeysPanel&&global.OneToneSettingsDrawer.isKeysPanel();
    var host=(onKeys&&recording&&feedbackMain)?feedbackMain:bar;
    if(btn.parentNode!==host) host.appendChild(btn);
  }

  function renderRecordingFeedback(){
    var wrap=$('keysRecordingFeedback');
    var text=$('keysRecordingFeedbackText');
    var conflict=$('keysRecordingConflict');
    if(!wrap||!text) return;
    var rec=global.OneToneMappingRecording;
    var mode=rec&&rec.mode?rec.mode():'none';
    var recording=mode==='trigger'||mode==='target';
    wrap.hidden=!recording;
    wrap.classList.toggle('is-trigger',mode==='trigger');
    wrap.classList.toggle('is-target',mode==='target');
    if(!recording){
      if(conflict){ conflict.hidden=true; conflict.textContent=''; }
      ['habitKeyMapRowTrigger','habitKeyMapRowTarget'].forEach(function(id){
        var row=$(id);
        if(row) row.classList.remove('is-recording-active');
      });
      syncCancelButtonHost();
      var mOff=core()&&core().selected?core().selected():null;
      renderFlowStatusBar(mOff);
      return;
    }
    var trigRow=$('habitKeyMapRowTrigger');
    var tgtRow=$('habitKeyMapRowTarget');
    if(trigRow) trigRow.classList.toggle('is-recording-active',mode==='trigger');
    if(tgtRow) tgtRow.classList.toggle('is-recording-active',mode==='target');
    text.textContent=mode==='trigger'?t('keysRecordingTrigger'):t('keysRecordingTarget');
    var previewKey='';
    if(mode==='trigger'&&ed()) previewKey=ed().getEditorTriggerKey?ed().getEditorTriggerKey():'';
    if(mode==='target'&&ed()) previewKey=ed().getEditorTargetKey?ed().getEditorTargetKey():'';
    var conflictMsg=previewKeyConflict(mode,previewKey);
    if(conflict){
      conflict.hidden=!conflictMsg;
      conflict.textContent=conflictMsg||'';
      conflict.classList.toggle('is-warn',!!conflictMsg);
    }
    syncCancelButtonHost();
    var m=core()&&core().selected?core().selected():null;
    renderFlowStatusBar(m);
  }

  function syncRecordButtons(){
    if(!core()||!core().selected) return;
    var m=core().selected();
    var trig=core().editorTrigger?core().editorTrigger(m):((m&&m.triggerKey)||'').trim();
    var tgt=core().editorTarget?core().editorTarget(m):((m&&m.targetKey)||'').trim();
    var trigBtn=$('btnRecordTrigger');
    var tgtBtn=$('btnRecordTarget');
    if(trigBtn){
      var trigLbl=trig?t('btnRerecordTrigger'):t('keysRecordTrigger');
      if(global.OneToneMappingEditorChrome&&global.OneToneMappingEditorChrome.setRecordBtnLabel){
        global.OneToneMappingEditorChrome.setRecordBtnLabel(trigBtn,trigLbl);
      }else trigBtn.textContent=trigLbl;
      trigBtn.classList.add('keys-record-btn');
    }
    if(tgtBtn){
      var tgtLbl=tgt?t('btnRerecordTarget'):t('keysRecordTarget');
      if(global.OneToneMappingEditorChrome&&global.OneToneMappingEditorChrome.setRecordBtnLabel){
        global.OneToneMappingEditorChrome.setRecordBtnLabel(tgtBtn,tgtLbl);
      }else tgtBtn.textContent=tgtLbl;
      tgtBtn.classList.add('keys-record-btn');
    }
    if(global.OneToneMappingEditorChrome&&global.OneToneMappingEditorChrome.updatePrimaryCTA){
      global.OneToneMappingEditorChrome.updatePrimaryCTA();
    }
  }

  function renderAdvancedSections(){
    var when=$('keysAdvancedWhenHint');
    if(when) when.textContent=t('keysAdvancedWhenHint');
    var titles={
      keysAdvConflictTitle:'keysAdvConflictTitle',
      keysAdvMouseTitle:'keysAdvMouseTitle',
      keysAdvMouseDesc:'keysAdvMouseDesc',
      keysAdvImeTitle:'habitAdvancedImeTitle'
    };
    Object.keys(titles).forEach(function(id){
      var el=$(id);
      if(el) el.textContent=t(titles[id]);
    });
    var conflictBtn=$('btnKeysAdvancedConflict');
    if(conflictBtn) conflictBtn.textContent=t('keysAdvConflictBtn');
    if(global.OneToneHabitCompatibility&&global.OneToneHabitCompatibility.renderKeysAdvanced){
      global.OneToneHabitCompatibility.renderKeysAdvanced();
    }
    if(global.OneToneMappingCore&&global.OneToneMappingCore.renderConflictBanner){
      global.OneToneMappingCore.renderConflictBanner();
    }
  }

  function imeStatusText(m){
    if(!m) return t('keysStatusUnset');
    var imeId=String(m.imePresetId||'').trim();
    if(imeId&&global.OneToneImePresets&&global.OneToneImePresets.presetById){
      var preset=global.OneToneImePresets.presetById(imeId);
      if(preset&&preset.nameKey) return t(preset.nameKey);
    }
    var tgt=m&&core().editorTarget?core().editorTarget(m):((m&&m.targetKey)||'').trim();
    if(!tgt) return t('keysStatusUnset');
    if(hooks().friendlyKeyName) return hooks().friendlyKeyName(tgt)||tgt;
    return tgt;
  }

  function renderStatusChips(){
    var m=core()&&core().selected?core().selected():null;
    renderHabitSwitcher();
    renderAppContext();
    renderFlowStatusBar(m);
    renderImePill(m);
    var countEl=$('keysAppShortcutsCount');
    if(countEl){
      var n=appRules()&&appRules().behaviorPresets?appRules().behaviorPresets.length:0;
      countEl.textContent=t('keysAppShortcutsCount').replace('{n}',String(n));
    }
    var labels={
      keysAdvancedDesc:'keysAdvancedDesc',
      keysAppShortcutsTitleLbl:'habitAppShortcutsTitle'
    };
    Object.keys(labels).forEach(function(id){
      var el=$(id);
      if(el) el.textContent=t(labels[id]);
    });
    var advSummary=$('keysAdvancedSummary');
    if(advSummary){
      var badge=advSummary.querySelector('.keys-advanced-badge');
      advSummary.textContent='';
      if(badge) advSummary.appendChild(badge);
      advSummary.appendChild(document.createTextNode(t('keysAdvancedTitle')));
    }
    var stepLbls=[
      ['habitFlowStepTriggerLbl','keysStep1Title'],
      ['habitFlowStepTargetLbl','keysStep2Title'],
      ['habitFlowStepFinishLbl','keysStep3Title']
    ];
    stepLbls.forEach(function(pair){
      var el=$(pair[0]);
      if(el) el.textContent=t(pair[1]);
    });
    var tip=$('habitKeyMappingTip');
    if(tip) tip.textContent=t('keysPanelFootTip');
    var finishMoreHint=$('keysFinishMoreHint');
    if(finishMoreHint) finishMoreHint.textContent=t('keysFinishMoreHint');
    var desc=$('settingsPanelKeysDesc');
    if(desc) desc.textContent=t('settingsPanelKeysDesc');
    renderAppContextStrip();
    renderTriggerContextBadge();
    syncRecordButtons();
    renderRecordingFeedback();
    renderAdvancedSections();
  }

  function render(){
    var drawer=global.OneToneSettingsDrawer;
    if(!drawer||!drawer.isKeysPanel||!drawer.isKeysPanel()) return;
    renderStatusChips();
    if(appRules()&&appRules().renderKeysAside) appRules().renderKeysAside();
  }

  function bindEvents(){
    var switcher=$('keysHabitSwitcher');
    if(switcher){
      switcher.addEventListener('change',function(){
        var id=switcher.value;
        if(!id) return;
        hooks().flushAllEditorToMappings&&hooks().flushAllEditorToMappings();
        state().selectedMappingId=id;
        hooks().syncEditorFromSelection&&hooks().syncEditorFromSelection();
        hooks().renderKeyFinishFlowPanel&&hooks().renderKeyFinishFlowPanel();
        hooks().renderEditor&&hooks().renderEditor();
        hooks().renderSettingsSchemeSubnav&&hooks().renderSettingsSchemeSubnav();
        if(global.OneToneSceneTabs) global.OneToneSceneTabs.render();
        if(global.OneToneSceneVoiceTab) global.OneToneSceneVoiceTab.render();
        render();
      });
    }
    var addBtn=$('btnKeysAddAppRule');
    if(addBtn){
      addBtn.addEventListener('click',function(e){
        e.preventDefault();
        var main=$('btnAddAppRule');
        if(main) main.click();
      });
    }
    var conflictBtn=$('btnKeysAdvancedConflict');
    if(conflictBtn){
      conflictBtn.addEventListener('click',function(e){
        e.preventDefault();
        var banner=$('conflictBanner');
        if(banner) banner.scrollIntoView({behavior:'smooth',block:'nearest'});
      });
    }
    var addChip=$('btnKeysAppChipAdd');
    if(addChip){
      addChip.addEventListener('click',function(e){
        e.preventDefault();
        var main=$('btnKeysAddAppRule');
        if(main) main.click();
      });
    }
    var enableBtn=$('btnKeysMappingEnable');
    if(enableBtn){
      enableBtn.addEventListener('click',function(){
        var m=core()&&core().selected?core().selected():null;
        if(!m||!global.OneToneMappingEditActions) return;
        global.OneToneMappingEditActions.setMappingEnabled(m.id,!m.enabled);
        render();
        if(hooks().renderEditor) hooks().renderEditor();
      });
    }
    var strip=$('keysAppContextStrip');
    if(strip){
      strip.addEventListener('click',function(e){
        var btn=e.target.closest&&e.target.closest('[data-app-context]');
        if(!btn||!appRules()||!appRules().setActiveAppContextId) return;
        e.preventDefault();
        e.stopPropagation();
        appRules().setActiveAppContextId(btn.getAttribute('data-app-context')||'');
      });
    }
  }

  global.OneToneKeysPanelUi={
    render:render,
    bindEvents:bindEvents,
    renderRecordingFeedback:renderRecordingFeedback,
    syncCancelButtonHost:syncCancelButtonHost,
    renderAppContext:renderAppContext,
    renderAppContextStrip:renderAppContextStrip,
    renderTriggerContextBadge:renderTriggerContextBadge,
    renderImePill:renderImePill
  };
})((typeof window!=='undefined')?window:globalThis);
