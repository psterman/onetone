(function(global){
  'use strict';

  var $=function(id){ return global.OneToneDom.$(id); };
  var t=function(key){ return global.OneToneI18n.t(key); };
  function state(){ return global.OneToneState.state; }
  function ui(){ return global.OneToneState.ui; }
  function core(){ return global.OneToneMappingCore; }
  function hooks(){ return global.__vp_bootstrap_hooks__ || {}; }
  function ed(){ return global.OneToneMappingEditorState; }
  function keysPanelVisible(){
    var panel=$('settingsPanelKeys');
    return !!(panel && !panel.hidden);
  }

  function keysPanelActive(){
    var drawer=global.OneToneSettingsDrawer;
    if(drawer&&drawer.isKeysPanel&&drawer.isKeysPanel()) return true;
    return keysPanelVisible();
  }

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
        delete toggle.dataset.vpToggleBusy;
      }
      return;
    }
    if(activePill) activePill.classList.remove('is-recording');
    var enabled=!!(m&&m.enabled);
    var activeOnText=t('keysStatusActiveOn');
    var activeOffText=t('keysStatusActiveOff');
    if(activeLbl){
      var nextLbl=enabled?activeOnText:activeOffText;
      if(activeLbl.textContent!==nextLbl) activeLbl.textContent=nextLbl;
    }
    if(activeDot) activeDot.hidden=!enabled;
    if(activePill) activePill.classList.toggle('is-on',enabled);
    if(toggle){
      toggle.classList.toggle('is-on',enabled);
      toggle.setAttribute('aria-checked',enabled?'true':'false');
      toggle.disabled=!m;
      delete toggle.dataset.vpToggleBusy;
    }
  }

  function renderAppContextStrip(){
    var strip=$('keysAppContextStrip');
    var wrap=$('keysAppContextStripWrap');
    var bindingStrip=$('keysAppBindingStrip');
    var bindingLbl=$('keysAppBindingLbl');
    var addBtn=$('btnKeysAppChipAdd');
    if(bindingLbl) bindingLbl.textContent=t('keysAppBindingLbl');
    if(addBtn) addBtn.textContent=t('keysAppChipAdd');
    if(!strip||!wrap) return;
    var m=core()&&core().selected?core().selected():null;
    if(!m||!core().isSaved||!core().isSaved(m)){
      wrap.hidden=true;
      if(bindingStrip) bindingStrip.hidden=true;
      return;
    }
    wrap.hidden=false;
    if(bindingStrip) bindingStrip.hidden=false;
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
      renderWorkflowTabs();
      return;
    }
    sel.disabled=false;
    sel.innerHTML=schemes.map(function(m){
      return '<option value="'+esc(m.id)+'"'+(m.id===selected?' selected':'')+'>'+esc(habitName(m))+'</option>';
    }).join('');
    renderWorkflowTabs();
  }

  function schemeCompletion(m){
    var c=core();
    if(!m||!c) return {done:0,total:3};
    var done=0;
    var trig=(c.editorTrigger?c.editorTrigger(m):'')||String(m.triggerKey||'').trim();
    var tgt=(c.editorTarget?c.editorTarget(m):'')||String(m.targetKey||'').trim();
    if(trig) done++;
    if(tgt) done++;
    if(c.isSaved&&c.isSaved(m)) done++;
    return {done:done,total:3};
  }

  function schemeAppRuleCount(m){
    if(!m||!Array.isArray(m.appBehaviorRules)) return 0;
    return m.appBehaviorRules.length;
  }

  function renderKeysHub(){
    var schemeList=$('keysHubSchemeList');
    var tplList=$('keysHubTemplateList');
    var card=$('keysHubCard');
    var countEl=$('keysHubCount');
    var titleLbl=$('keysHubTitleLbl');
    var tplLbl=$('keysHubTemplatesLbl');
    var aside=$('keysPanelAside');
    var tplApi=global.OneToneKeysWorkflowTemplates;
    if(titleLbl) titleLbl.textContent=t('keysHubTitle');
    if(tplLbl) tplLbl.textContent=t('keysHubTemplatesLbl');
    if(aside) aside.setAttribute('aria-label',t('keysHubTitle'));
    if(!schemeList) return;
    if(!core()||!core().sorted){
      schemeList.innerHTML='';
      if(tplList) tplList.innerHTML='';
      if(card) card.hidden=true;
      return;
    }
    var schemes=core().sorted();
    var selected=state().selectedMappingId;
    if(card) card.hidden=false;
    if(countEl) countEl.textContent=String(schemes.length);
    if(!schemes.length){
      schemeList.innerHTML='<p class="keys-hub-empty">'+esc(t('keysWorkflowOverviewEmpty'))+'</p>';
    }else{
      schemeList.innerHTML=schemes.map(function(m){
        var isEditing=m.id===selected;
        var comp=schemeCompletion(m);
        var stepsText=comp.done+'/'+comp.total;
        var enabled=!!m.enabled;
        return '<button type="button" class="keys-hub-scheme-row'+(isEditing?' is-editing':'')+(!enabled?' is-disabled-scheme':'')+'" role="listitem" data-scheme-id="'+esc(m.id)+'" aria-current="'+(isEditing?'true':'false')+'">'
          +'<span class="keys-hub-scheme-name">'+esc(habitName(m))+'</span>'
          +'<span class="keys-hub-scheme-meta">'
          +'<span class="keys-hub-scheme-steps">'+esc(stepsText)+'</span>'
          +'<span class="keys-hub-scheme-dot'+(enabled?' is-on':'')+'" aria-hidden="true"></span>'
          +(isEditing?'<span class="keys-hub-scheme-editing">'+esc(t('keysWorkflowEditing'))+'</span>':'')
          +'</span></button>';
      }).join('');
    }
    if(!tplList||!tplApi||!tplApi.list) return;
    var templates=tplApi.list();
    var m=core()&&core().selected?core().selected():null;
    var canFill=!!m;
    tplList.innerHTML=templates.map(function(tpl){
      var summary=tplApi.compactSummary?tplApi.compactSummary(tpl):'';
      return '<article class="keys-hub-template-row" data-template-id="'+esc(tpl.id)+'">'
        +'<div class="keys-hub-template-main"><strong class="keys-hub-template-name">'+esc(t(tpl.nameKey))+'</strong>'
        +'<span class="keys-hub-template-summary">'+esc(summary)+'</span></div>'
        +'<div class="keys-hub-template-actions">'
        +'<button type="button" class="keys-hub-template-btn" data-apply-template="'+esc(tpl.id)+'"'+(canFill?'':' disabled')+'>'+esc(t('keysTemplateApply'))+'</button>'
        +'<button type="button" class="keys-hub-template-btn is-new" data-new-template="'+esc(tpl.id)+'">'+esc(t('keysTemplateNew'))+'</button>'
        +'</div></article>';
    }).join('');
  }

  function renderWorkflowOverview(){
    renderKeysHub();
  }

  function renderWorkflowTemplates(){
    renderKeysHub();
  }

  function renderWorkflowTabs(){
    var tabs=$('keysWorkflowTabs');
    var bar=$('keysWorkflowTabsBar');
    var tabsLbl=$('keysWorkflowTabsLbl');
    if(tabsLbl) tabsLbl.textContent=t('keysWorkflowTabsLbl');
    if(!tabs) return;
    if(!core()||!core().sorted){
      tabs.innerHTML='';
      if(bar) bar.hidden=true;
      return;
    }
    var schemes=core().sorted();
    var selected=state().selectedMappingId;
    if(!schemes.length){
      tabs.innerHTML='<p class="keys-workflow-tabs-empty">'+esc(t('mappingEmptyTitle'))+'</p>';
      if(bar) bar.hidden=false;
      return;
    }
    if(bar) bar.hidden=false;
    tabs.innerHTML=schemes.map(function(m){
      var isSel=m.id===selected;
      var enabled=!!m.enabled;
      return '<button type="button" class="keys-workflow-tab'+(isSel?' is-active':'')+(!enabled?' is-disabled-scheme':'')+'" role="tab" aria-selected="'+(isSel?'true':'false')+'" id="keysWorkflowTab-'+esc(m.id)+'" data-scheme-id="'+esc(m.id)+'"><span class="keys-workflow-tab-name">'+esc(habitName(m))+'</span></button>';
    }).join('');
  }

  function switchActiveScheme(id){
    id=String(id||'').trim();
    if(!id) return;
    hooks().flushAllEditorToMappings&&hooks().flushAllEditorToMappings();
    state().selectedMappingId=id;
    var sel=$('keysHabitSwitcher');
    if(sel&&sel.value!==id) sel.value=id;
    hooks().syncEditorFromSelection&&hooks().syncEditorFromSelection();
    hooks().renderKeyFinishFlowPanel&&hooks().renderKeyFinishFlowPanel();
    hooks().renderEditor&&hooks().renderEditor();
    hooks().renderSettingsSchemeSubnav&&hooks().renderSettingsSchemeSubnav();
    if(global.OneToneSceneTabs) global.OneToneSceneTabs.render();
    if(global.OneToneSceneVoiceTab) global.OneToneSceneVoiceTab.render();
    if(hooks().render) hooks().render();
    render();
    var tab=$('keysWorkflowTab-'+id);
    if(tab) tab.scrollIntoView({behavior:'smooth',block:'nearest',inline:'nearest'});
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
    var onKeys=keysPanelActive();
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
    renderKeysHub();
    renderAppContext();
    renderFlowStatusBar(m);
    renderImePill(m);
    var countEl=$('keysAppShortcutsCount');
    if(countEl){
      var n=appRules()&&appRules().behaviorPresets?appRules().behaviorPresets.length:0;
      countEl.textContent=t('keysAppShortcutsCount').replace('{n}',String(n));
    }
    var labels={
      keysAppShortcutsTitleLbl:'habitAppShortcutsTitle'
    };
    Object.keys(labels).forEach(function(id){
      var el=$(id);
      if(el) el.textContent=t(labels[id]);
    });
    var advSummary=$('keysAdvancedSummary');
    if(advSummary) advSummary.textContent=t('keysAdvancedTitle');
    var stepLbls=[
      ['habitFlowStepTriggerLbl','keysStep1Title'],
      ['habitFlowStepTargetLbl','keysStep2Title'],
      ['habitFlowStepFinishLbl','keysStep3Title']
    ];
    stepLbls.forEach(function(pair){
      var el=$(pair[0]);
      if(el) el.textContent=t(pair[1]);
    });
    var colLbls=[
      ['keysColTriggerLbl','keysColTrigger'],
      ['keysColCaptureLbl','keysColCapture'],
      ['keysColActionLbl','keysColAction']
    ];
    colLbls.forEach(function(pair){
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
    if(global.OneToneMappingCore&&global.OneToneMappingCore.renderConflictBanner){
      global.OneToneMappingCore.renderConflictBanner();
    }
  }

  function render(){
    if(!keysPanelActive()) return;
    renderStatusChips();
    if(appRules()&&appRules().renderKeysAside) appRules().renderKeysAside();
  }

  function bindEvents(){
    var switcher=$('keysHabitSwitcher');
    if(switcher){
      switcher.addEventListener('change',function(){
        switchActiveScheme(switcher.value);
      });
    }
    var workflowTabs=$('keysWorkflowTabs');
    if(workflowTabs){
      workflowTabs.addEventListener('keydown',function(e){
        if(e.key!=='ArrowLeft'&&e.key!=='ArrowRight'&&e.key!=='Home'&&e.key!=='End') return;
        var tabs=Array.prototype.slice.call(workflowTabs.querySelectorAll('[role="tab"]'));
        if(!tabs.length) return;
        var idx=tabs.findIndex(function(btn){ return btn.getAttribute('aria-selected')==='true'; });
        if(idx<0) idx=0;
        if(e.key==='Home') idx=0;
        else if(e.key==='End') idx=tabs.length-1;
        else if(e.key==='ArrowRight') idx=Math.min(tabs.length-1,idx+1);
        else if(e.key==='ArrowLeft') idx=Math.max(0,idx-1);
        e.preventDefault();
        var next=tabs[idx];
        if(next) switchActiveScheme(next.getAttribute('data-scheme-id')||'');
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
    var addChip=$('btnKeysAppChipAdd');
    if(addChip){
      addChip.addEventListener('click',function(e){
        e.preventDefault();
        var main=$('btnKeysAddAppRule');
        if(main) main.click();
      });
    }
    var hub=$('keysHubCard');
    if(hub&&hub.dataset.keysHubBound!=='1'){
      hub.dataset.keysHubBound='1';
      hub.addEventListener('click',function(e){
        if(e.__vpKeysPanelHandled) return;
        var fillBtn=e.target.closest&&e.target.closest('[data-apply-template]');
        if(fillBtn&&!fillBtn.disabled){
          e.__vpKeysPanelHandled=true;
          e.preventDefault();
          var tplApi=global.OneToneKeysWorkflowTemplates;
          if(tplApi&&tplApi.applyTemplate) tplApi.applyTemplate(fillBtn.getAttribute('data-apply-template')||'');
          return;
        }
        var newBtn=e.target.closest&&e.target.closest('[data-new-template]');
        if(newBtn){
          e.__vpKeysPanelHandled=true;
          e.preventDefault();
          var tplApiNew=global.OneToneKeysWorkflowTemplates;
          if(tplApiNew&&tplApiNew.applyTemplateNew) tplApiNew.applyTemplateNew(newBtn.getAttribute('data-new-template')||'');
          return;
        }
        var schemeRow=e.target.closest&&e.target.closest('.keys-hub-scheme-row[data-scheme-id]');
        if(schemeRow){
          e.__vpKeysPanelHandled=true;
          e.preventDefault();
          switchActiveScheme(schemeRow.getAttribute('data-scheme-id')||'');
        }
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
    renderImePill:renderImePill,
    renderKeysHub:renderKeysHub,
    renderWorkflowOverview:renderWorkflowOverview,
    renderWorkflowTemplates:renderWorkflowTemplates,
    switchActiveScheme:switchActiveScheme
  };
})((typeof window!=='undefined')?window:globalThis);
