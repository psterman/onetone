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

  // Returns true when the user entered keys panel FROM an app scenario
  // (i.e. habitScenarioReturnId points to an app-scenario mapping).
  // When false, the keys panel is showing GLOBAL mappings only.
  function isInAppScenarioContext(){
    var id=String(ui().habitScenarioReturnId||'').trim();
    if(!id) return false;
    if(!core()||!core().byId) return false;
    var m=core().byId(id);
    if(!m) return false;
    var diff=global.OneToneHabitOverrideDiff;
    return !!(diff&&diff.isAppScenarioMapping&&diff.isAppScenarioMapping(m));
  }

  /** Mapping that opened this keys panel from an app scenario (Codex etc.). */
  function appScenarioContextMapping(){
    var id=String(ui().habitScenarioReturnId||'').trim();
    if(!id||!core()||!core().byId) return null;
    var m=core().byId(id);
    var diff=global.OneToneHabitOverrideDiff;
    if(!m||!diff||!diff.isAppScenarioMapping||!diff.isAppScenarioMapping(m)) return null;
    return m;
  }

  function sameAppScenarioGroup(a, ctx){
    if(!a||!ctx) return false;
    var diff=global.OneToneHabitOverrideDiff;
    if(!diff||!diff.isAppScenarioMapping||!diff.isAppScenarioMapping(a)) return false;
    var appId=String(ctx.appTargetId||'').trim();
    var tplId=String(ctx.agentTemplateId||'').trim();
    if(appId&&String(a.appTargetId||'').trim()===appId) return true;
    if(tplId&&String(a.agentTemplateId||'').trim()===tplId) return true;
    return a.id===ctx.id;
  }

  // Filter the sorted() list to only include mappings appropriate for the
  // current context.  In global context, app-scenario mappings are hidden so
  // they cannot be accidentally selected/edited from the global keys panel.
  // In app-scenario context, only show mappings for the same app/template.
  function contextFilteredSchemes(){
    if(!core()||!core().sorted) return [];
    var all=core().sorted();
    var diff=global.OneToneHabitOverrideDiff;
    var ctx=appScenarioContextMapping();
    if(ctx){
      return all.filter(function(m){ return sameAppScenarioGroup(m, ctx); });
    }
    if(!diff||!diff.isAppScenarioMapping) return all;
    return all.filter(function(m){ return !diff.isAppScenarioMapping(m); });
  }

  /** Keep selectedMappingId aligned with the active keys-panel context. */
  function ensureContextSelection(){
    var schemes=contextFilteredSchemes();
    var ctx=appScenarioContextMapping();
    if(ctx){
      if(state().selectedMappingId!==ctx.id){
        state().selectedMappingId=ctx.id;
        var h=global.__vp_bootstrap_hooks__||global.__vp_mapping_list_ui_hooks__||{};
        if(h.syncEditorFromSelection) h.syncEditorFromSelection();
      }
      return ctx.id;
    }
    if(!schemes.length) return state().selectedMappingId;
    var selected=state().selectedMappingId;
    var selInList=schemes.some(function(m){ return m.id===selected; });
    if(!selInList){
      selected=schemes[0].id;
      state().selectedMappingId=selected;
      var hooksRef=global.__vp_bootstrap_hooks__||global.__vp_mapping_list_ui_hooks__||{};
      if(hooksRef.syncEditorFromSelection) hooksRef.syncEditorFromSelection();
    }
    return selected;
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
    var m=core()&&core().selected?core().selected():null;
    var rulesApi=appRules();
    var rule=rulesApi&&rulesApi.ruleForContext?rulesApi.ruleForContext(m,appId):null;
    var displayName=rule&&rulesApi.ruleDisplayName
      ?rulesApi.ruleDisplayName(rule)
      :(rulesApi?rulesApi.appDisplayName(appId):appId);
    var atp=global.OneToneAppTargetPresets;
    var preset=(!rulesApi||!rulesApi.isContextRuleId||!rulesApi.isContextRuleId(appId))&&atp&&atp.presetById?atp.presetById(appId):null;
    if(preset&&preset.icon){
      badge.innerHTML='<img class="app-target-card-icon" src="'+esc(preset.icon)+'" alt="" decoding="async" />';
      badge.hidden=false;
      badge.classList.add('has-icon');
      badge.setAttribute('title',displayName);
    }else if(preset){
      var isEn=global.OneToneI18n&&global.OneToneI18n.getLang&&global.OneToneI18n.getLang()==='en';
      badge.textContent=isEn?(preset.badgeEn||preset.badge):(preset.badge||'');
      badge.hidden=false;
      badge.classList.remove('has-icon');
      badge.setAttribute('title',displayName);
    }else{
      badge.hidden=false;
      badge.textContent=displayName.charAt(0).toUpperCase();
      badge.classList.remove('has-icon');
      badge.setAttribute('title',displayName);
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

  function friendlyKey(key){
    if(!key) return '—';
    if(hooks().friendlyKeyName) return hooks().friendlyKeyName(key)||key;
    return key;
  }

  function isEditorDirty(){
    var m=core()&&core().selected?core().selected():null;
    if(!m||!ed()) return false;
    var edTrig=(ed().getEditorTriggerKey()||'').trim();
    var edTgt=(ed().getEditorTargetKey()||'').trim();
    var savedTrig=String(m.triggerKey||'').trim();
    var savedTgt=String(m.targetKey||'').trim();
    return edTrig!==savedTrig||edTgt!==savedTgt;
  }

  function scopeSummaryText(m){
    if(!m) return '—';
    var ctx=appScenarioContextMapping();
    if(ctx&&m.id===ctx.id){
      var rulesCtx=appRules();
      var appOnly=String(m.appTargetId||'').trim();
      if(appOnly&&rulesCtx&&rulesCtx.appDisplayName) return rulesCtx.appDisplayName(appOnly);
    }
    var rules=appRules();
    var primary=String(m.appTargetId||'').trim();
    var names=[];
    if(primary&&rules&&rules.appDisplayName) names.push(rules.appDisplayName(primary));
    var presets=rules&&rules.behaviorPresets?rules.behaviorPresets:[];
    presets.forEach(function(p){
      if(!p||!p.id||p.id===primary) return;
      var hasRule=Array.isArray(m.appBehaviorRules)&&m.appBehaviorRules.some(function(r){ return r&&r.appId===p.id; });
      if(hasRule&&rules&&rules.appDisplayName) names.push(rules.appDisplayName(p.id));
    });
    if(rules&&rules.customRulesForMapping){
      rules.customRulesForMapping(m).forEach(function(rule){
        var label=rules.ruleDisplayName?rules.ruleDisplayName(rule):'';
        if(label&&names.indexOf(label)<0) names.push(label);
      });
    }
    if(!names.length){
      if(primary&&rules&&rules.appDisplayName) return rules.appDisplayName(primary);
      return t('keysSummaryScopeAll');
    }
    if(names.length>3) return names.slice(0,3).join(' / ')+'…';
    return names.join(' / ');
  }

  function schemeStatusTag(m){
    if(!m) return {key:'keysSchemeTagIncomplete',cls:'is-incomplete'};
    var isDraft=core().isDraft&&core().isDraft(m);
    var isIncomplete=core().isIncomplete&&core().isIncomplete(m);
    if(isDraft) return {key:'keysSchemeTagDraft',cls:'is-draft'};
    if(isIncomplete) return {key:'keysSchemeTagIncomplete',cls:'is-incomplete'};
    if(m.enabled) return {key:'keysSchemeTagActive',cls:'is-active'};
    if(core().isSaved&&core().isSaved(m)) return {key:'keysSchemeTagSaved',cls:'is-saved'};
    return {key:'keysSchemeTagIncomplete',cls:'is-incomplete'};
  }

  function recommendedTriggerKey(m){
    var imeId=m&&String(m.imePresetId||'').trim();
    if(imeId&&global.OneToneImePresets&&global.OneToneImePresets.presetById){
      var preset=global.OneToneImePresets.presetById(imeId);
      if(preset&&preset.targetKey) return preset.targetKey;
    }
    return 'RAlt';
  }

  function renderSchemeSummary(m){
    var nameEl=$('keysSummaryName');
    var statusEl=$('keysSummaryStatus');
    var trigLbl=$('keysSummaryTriggerLbl');
    var trigVal=$('keysSummaryTrigger');
    var scopeLbl=$('keysSummaryScopeLbl');
    var scopeVal=$('keysSummaryScope');
    var saveBtn=$('btnKeysSave');
    var testBtn=$('btnKeysTestTop');
    var schemeAddBtn=$('btnKeysSchemeAdd');
    var keycapHint=$('keysKeycapHint');
    var targetKeycapHint=$('keysTargetKeycapHint');
    var keycapHost=$('habitKeyMapCellTrigger');
    var targetKeycapHost=$('habitKeyMapCellTarget');
    if(trigLbl) trigLbl.textContent=t('keysSummaryTriggerLbl');
    if(scopeLbl) scopeLbl.textContent=t('keysSummaryScopeLbl');
    if(keycapHint) keycapHint.textContent=t('keysKeycapHint');
    if(targetKeycapHint) targetKeycapHint.textContent=t('keysTargetKeycapHint');
    if(saveBtn) saveBtn.textContent=t('keysSave');
    if(testBtn) testBtn.textContent=t('keysTestOnce');
    if(schemeAddBtn) schemeAddBtn.textContent='+ '+t('addKeysDraft');
    var imeHint=$('imePresetHintMapping');
    if(imeHint) imeHint.textContent=t('keysCaptureImeSource');
    var triggerFooterLbl=$('keysTriggerModeFooterLbl');
    if(triggerFooterLbl) triggerFooterLbl.textContent=t('keysWorkflowFooterTrigger');
    if(!m){
      if(nameEl) nameEl.textContent='—';
      if(statusEl){ statusEl.textContent='—'; statusEl.className='keys-scheme-summary-pill'; }
      if(trigVal) trigVal.textContent='—';
      if(scopeVal) scopeVal.textContent='—';
      if(saveBtn) saveBtn.disabled=true;
      if(testBtn) testBtn.disabled=true;
      if(keycapHost) keycapHost.removeAttribute('title');
      if(targetKeycapHost) targetKeycapHost.removeAttribute('title');
      return;
    }
    var trig=core().editorTrigger?core().editorTrigger(m):((m.triggerKey||'').trim());
    var trigLabel='';
    if(m){
      var lang=global.OneToneI18n&&global.OneToneI18n.getLang?global.OneToneI18n.getLang():'zh';
      if(global.OneToneKeyLabels&&global.OneToneKeyLabels.triggerDisplayLabel){
        trigLabel=global.OneToneKeyLabels.triggerDisplayLabel(m,lang)||'';
      }
      if(!trigLabel&&trig) trigLabel=friendlyKey(trig);
    }
    var dirty=isEditorDirty();
    var rec=global.OneToneMappingRecording;
    var recMode=rec&&rec.mode?rec.mode():'none';
    var recPending=rec&&rec.isPending?rec.isPending():false;
    var recording=recMode==='trigger'||recMode==='target'||recMode==='agentBinding';
    var capUi=global.OneToneAgentCapabilityUi;
    var codexCtx=capUi&&capUi.isCodexKeysEditing&&capUi.isCodexKeysEditing();
    if(nameEl){
      if(codexCtx) nameEl.textContent=habitName(m);
      else nameEl.textContent=habitName(m)+(trigLabel?' · '+trigLabel:(trig?friendlyKey(trig):''));
    }
    if(statusEl){
      var pillCls='keys-scheme-summary-pill';
      var pillText='';
      if(recording){
        pillText=recMode==='trigger'?t('keysStatusRecordingTrigger')
          :(recMode==='agentBinding'?t('keysStatusRecordingCap','录制能力快捷键中'):t('keysStatusRecordingTarget'));
      }else if(dirty){
        pillText=t('keysSummaryStatusDirty');
        pillCls+=' is-dirty';
      }else if(m.enabled){
        pillText=t('keysSummaryStatusActive');
        pillCls+=' is-on';
      }else if(core().isSaved&&core().isSaved(m)){
        pillText=t('keysSummaryStatusSaved');
      }else{
        pillText=t('keysSummaryStatusInactive');
        pillCls+=' is-off';
      }
      statusEl.textContent=pillText;
      statusEl.className=pillCls;
    }
    if(trigVal) trigVal.textContent=trigLabel||(trig?friendlyKey(trig):t('keysStatusUnset'));
    if(scopeVal){
      if(codexCtx&&capUi&&capUi.pushToTalkDisplay){
        var talkKey=capUi.pushToTalkDisplay(m);
        scopeVal.textContent=talkKey
          ?(t('codexSummaryTalkKey','说话键')+' '+talkKey)
          :scopeSummaryText(m);
      }else{
        scopeVal.textContent=scopeSummaryText(m);
      }
    }
    if(saveBtn){
      saveBtn.disabled=!dirty;
      saveBtn.hidden=!!codexCtx;
    }
    if(testBtn){
      var tgt=core().editorTarget?core().editorTarget(m):((m.targetKey||'').trim());
      testBtn.disabled=!trig||!tgt;
    }
    if(keycapHost){
      keycapHost.setAttribute('title',recording&&recMode==='trigger'?t('keysKeycapRecording'):t('keysKeycapHint'));
    }
    if(targetKeycapHost){
      targetKeycapHost.setAttribute('title',recording&&(recMode==='target'||recMode==='agentBinding')?t('keysKeycapRecording'):t('keysTargetKeycapHint'));
      targetKeycapHost.classList.toggle('is-record-pending',!!recPending);
      targetKeycapHost.setAttribute('aria-disabled',recPending?'true':'false');
    }
    var tgtRow=$('habitKeyMapRowTarget');
    if(tgtRow) tgtRow.classList.toggle('is-record-pending',!!recPending);
    if(keycapHint&&recording&&recMode==='trigger') keycapHint.textContent=t('keysKeycapRecording');
    else if(keycapHint) keycapHint.textContent=t('keysKeycapHint');
    if(targetKeycapHint&&recording&&recMode==='target') targetKeycapHint.textContent=t('keysKeycapRecording');
    else if(targetKeycapHint&&recPending) targetKeycapHint.textContent=t('targetKeyPickerPending');
    else if(targetKeycapHint) targetKeycapHint.textContent=t('keysTargetKeycapHint');
    if(global.OneToneAgentCapabilityUi&&global.OneToneAgentCapabilityUi.applyRecognitionOverlay){
      global.OneToneAgentCapabilityUi.applyRecognitionOverlay();
    }
    if(codexCtx&&capUi&&capUi.applyCodexStepChrome){
      var step='trigger';
      if(global.OneToneKeysPageState&&global.OneToneKeysPageState.getStep){
        step=global.OneToneKeysPageState.getStep()||'trigger';
      }
      capUi.applyCodexStepChrome(step,m);
    }
  }

  function syncKeyDisplayIcons(m){
    if(!global.OneToneKeyIcons||!global.OneToneKeyIcons.syncDisplayIcon) return;
    var trigDisp=$('triggerDisplay');
    var tgtDisp=$('targetDisplay');
    var trig=core().editorTrigger?core().editorTrigger(m):((m&&m.triggerKey)||'').trim();
    var tgt=core().editorTarget?core().editorTarget(m):((m&&m.targetKey)||'').trim();
    if(trigDisp) global.OneToneKeyIcons.syncDisplayIcon(trigDisp,trig);
  }

  function normalizeTriggerModeUi(raw){
    raw=String(raw||'tap').toLowerCase();
    if(raw==='hold'||raw==='longpress'||raw==='perpress') return 'hold';
    if(raw==='double') return 'double';
    return 'tap';
  }

  function holdGateFor(m){
    var api=global.OneToneHomeWorkbenchCompat;
    if(!api||!api.canUseHoldMode||!m){
      return {ok:false,reason:'untested',messageKey:'keysHoldGateUntested',legacy:false};
    }
    return api.canUseHoldMode(m.id,{currentMode:m.triggerMode});
  }

  function renderTriggerModeSegments(m){
    var host=$('keysTriggerModeHost');
    if(!host) return;
    if(!m){
      host.innerHTML='';
      return;
    }
    var current=normalizeTriggerModeUi(m.triggerMode);
    var gate=holdGateFor(m);
    var modes=[
      {id:'tap',label:'keysTriggerModeTap',mode:'tap'},
      {id:'double',label:'keysTriggerModeDouble',mode:'double'},
      {id:'hold',label:'keysTriggerModeHold',mode:'longpress'}
    ];
    var html='<div class="keys-trigger-modes" role="radiogroup" aria-label="'+esc(t('triggerModeTitle'))+'">';
    modes.forEach(function(opt){
      var active=current===opt.id;
      var gated=opt.id==='hold'&&!gate.ok;
      var supported=opt.id==='hold'&&gate.ok;
      var cls='keys-trigger-mode-seg'+(active?' is-active':'')+(gated?' is-gated':'')+(supported?' is-hold-supported':'');
      var title='';
      if(opt.id==='hold'){
        if(gate.ok) title=t('keysHoldGateSupported');
        else if(gate.reason==='pulse_only') title=t('keysHoldGatePulseOnly');
        else title=t('keysHoldGateUntested');
      }
      html+='<button type="button" class="'+cls+'" data-trigger-mode="'+esc(m.id)+'" data-mode="'+esc(opt.mode)+'" role="radio" aria-checked="'+(active?'true':'false')+'"'
        +(gated?' aria-disabled="true"':'')
        +(title?' title="'+esc(title)+'"':'')
        +'>'+esc(t(opt.label))+'</button>';
    });
    html+='</div>';
    if(current==='hold'&&!gate.ok){
      html+='<div class="keys-hold-risk-hint" role="status">'
        +'<p class="keys-hold-risk-text">'+esc(t('keysHoldLegacyRisk'))+'</p>'
        +'<div class="keys-hold-risk-actions">'
        +'<button type="button" class="keys-trigger-conflict-btn" data-keys-hold-switch="tap" data-mapping-id="'+esc(m.id)+'">'+esc(t('keysHoldSwitchTap'))+'</button>'
        +'<button type="button" class="keys-trigger-conflict-btn" data-keys-hold-switch="double" data-mapping-id="'+esc(m.id)+'">'+esc(t('keysHoldSwitchDouble'))+'</button>'
        +'</div></div>';
    }
    host.innerHTML=html;
  }

  function renderTriggerConflict(m){
    var box=$('keysTriggerConflict');
    if(!box) return;
    var trig=core().editorTrigger?core().editorTrigger(m):((m&&m.triggerKey)||'').trim();
    var msg=previewKeyConflict('trigger',trig);
    if(!msg&&m&&core().schemeHasConflict&&core().schemeHasConflict(m)){
      msg=t('keysRecordConflictScheme');
    }
    if(!msg){
      box.hidden=true;
      box.innerHTML='';
      return;
    }
    box.hidden=false;
    box.innerHTML='<span class="keys-trigger-conflict-text">'+esc(msg)+'</span>'
      +'<div class="keys-trigger-conflict-actions">'
      +'<button type="button" class="keys-trigger-conflict-btn" data-keys-conflict-recommend="1">'+esc(t('keysConflictRecommend'))+'</button>'
      +'<button type="button" class="keys-trigger-conflict-btn" data-keys-conflict-view="1">'+esc(t('keysConflictView'))+'</button>'
      +'</div>';
  }

  function saveCurrentScheme(){
    if(!isEditorDirty()) return;
    hooks().flushAllEditorToMappings&&hooks().flushAllEditorToMappings();
    if(hooks().save) hooks().save();
    if(hooks().render) hooks().render();
    render();
    var saveBtn=$('btnKeysSave');
    if(saveBtn){
      var prev=t('keysSave');
      saveBtn.textContent=t('keysSaveDone');
      setTimeout(function(){ if(saveBtn) saveBtn.textContent=prev; },1200);
    }
  }

  function applyRecommendedTriggerKey(){
    var m=core()&&core().selected?core().selected():null;
    if(!m||!ed()) return;
    var key=recommendedTriggerKey(m);
    ed().setEditorTriggerKey(key);
    hooks().flushAllEditorToMappings&&hooks().flushAllEditorToMappings();
    if(hooks().save) hooks().save();
    if(hooks().renderEditor) hooks().renderEditor();
    render();
  }

  function viewConflicts(){
    var banner=$('conflictBanner');
    var stash=$('keysCompatStash');
    if(stash) stash.hidden=false;
    if(banner){
      banner.classList.add('show');
      banner.scrollIntoView({behavior:'smooth',block:'nearest'});
    }
  }

  function renderTestProgress(state){
    var wrap=$('keysTestProgress');
    var text=$('keysTestProgressText');
    var trigRow=$('habitKeyMapRowTrigger');
    if(!wrap||!text) return;
    var label='';
    if(state==='sending') label=t('keysTestProgressSending');
    else if(state==='recognizing') label=t('keysTestProgressRecognizing');
    else if(state==='recording') label=t('keysTestProgressRecording');
    if(!label){
      wrap.hidden=true;
      text.textContent='';
      if(trigRow) trigRow.classList.remove('is-test-active');
      return;
    }
    wrap.hidden=false;
    text.textContent=label;
    if(trigRow) trigRow.classList.add('is-test-active');
  }


  function renderImePill(m){
    var pill=$('keysImePill');
    if(pill) pill.hidden=true;
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
      renderSchemeSummary(m);
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
      toggle.disabled=!m||recording;
      delete toggle.dataset.vpToggleBusy;
    }
    renderSchemeSummary(m);
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
    if(!keysPanelActive()){
      wrap.hidden=true;
      if(bindingStrip) bindingStrip.hidden=true;
      return;
    }
    var m=core()&&core().selected?core().selected():null;
    if(!m||!core().isSaved||!core().isSaved(m)){
      wrap.hidden=true;
      if(bindingStrip) bindingStrip.hidden=true;
      return;
    }
    wrap.hidden=false;
    if(bindingStrip) bindingStrip.hidden=false;
    var rulesApi=appRules();
    if(rulesApi&&rulesApi.renderContextChipsHtml){
      strip.innerHTML=rulesApi.renderContextChipsHtml(m,{
        variant:'chip',
        contextId:activeAppContextId()
      });
      if(rulesApi.scheduleHydrateCustomRuleIcons) rulesApi.scheduleHydrateCustomRuleIcons();
      return;
    }
    var ctxId=activeAppContextId();
    var presets=rulesApi&&rulesApi.behaviorPresets?rulesApi.behaviorPresets:[];
    if(!presets.length&&global.OneToneAppTargetPresets&&Array.isArray(global.OneToneAppTargetPresets.presets)){
      presets=global.OneToneAppTargetPresets.presets.map(function(p){ return {id:p.id}; });
    }
    var primaryId=m?String(m.appTargetId||'').trim():'';
    var noneSelected=!ctxId&&!primaryId;
    var html='<button type="button" class="keys-app-chip keys-app-chip--none'+(noneSelected?' is-selected':'')+'" data-app-chip-none="1" role="radio" aria-checked="'+(noneSelected?'true':'false')+'" title="'+esc(t('keysAppChipNoneHint'))+'"><span>'+esc(t('keysAppChipNone'))+'</span></button>';
    presets.forEach(function(p){
      var icon=presetIcon(p.id);
      var isSel=ctxId===p.id;
      var isPri=m&&String(m.appTargetId||'')===p.id;
      var name=rulesApi&&rulesApi.appDisplayName?rulesApi.appDisplayName(p.id):(function(){
        var atp=global.OneToneAppTargetPresets;
        var preset=atp&&atp.presetById?atp.presetById(p.id):null;
        return preset&&preset.nameKey?t(preset.nameKey):p.id;
      })();
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
    var schemes=contextFilteredSchemes();
    var selected=ensureContextSelection();
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

  function schemePairLine(m){
    var capUi=global.OneToneAgentCapabilityUi;
    if(capUi&&capUi.schemePairLine){
      var codexLine=capUi.schemePairLine(m);
      if(codexLine) return codexLine;
    }
    if(hooks().homeMappingPairLine) return hooks().homeMappingPairLine(m);
    var trig=core().editorTrigger?core().editorTrigger(m):((m&&m.triggerKey)||'').trim();
    var tgt=core().editorTarget?core().editorTarget(m):((m&&m.targetKey)||'').trim();
    if(!trig&&!tgt) return '';
    return friendlyKey(trig||'—')+' → '+friendlyKey(tgt||'—');
  }

  function renderKeysHubSchemeRow(m,selected){
    var isEditing=m.id===selected;
    var comp=schemeCompletion(m);
    var stepsText=comp.done+'/'+comp.total;
    var enabled=!!m.enabled;
    var tag=schemeStatusTag(m);
    var canToggle=core().isSaved&&core().isSaved(m);
    var pair=schemePairLine(m);
    return '<div class="keys-hub-scheme-row'+(isEditing?' is-editing':'')+(!enabled?' is-disabled-scheme':'')+(tag.cls==='is-draft'?' is-draft':'')+'" role="listitem" data-scheme-id="'+esc(m.id)+'">'
      +'<button type="button" class="keys-hub-scheme-main" data-scheme-select="'+esc(m.id)+'" aria-current="'+(isEditing?'true':'false')+'">'
      +'<span class="keys-hub-scheme-copy">'
      +'<span class="keys-hub-scheme-name">'+esc(habitName(m))+'</span>'
      +(pair?'<span class="keys-hub-scheme-pair">'+esc(pair)+'</span>':'')
      +'</span>'
      +'<span class="keys-hub-scheme-tag '+esc(tag.cls)+'">'+esc(t(tag.key))+'</span>'
      +'<span class="keys-hub-scheme-steps">'+esc(stepsText)+'</span>'
      +'</button>'
      +'<div class="keys-hub-scheme-actions">'
      +(isEditing?'<span class="keys-hub-scheme-editing">'+esc(t('keysWorkflowEditing'))+'</span>':'')
      +'<button type="button" class="keys-hub-scheme-rename" data-scheme-rename="'+esc(m.id)+'" aria-label="'+esc(t('keysSchemeRename'))+'" title="'+esc(t('keysSchemeRename'))+'">✎</button>'
      +(canToggle?'<button type="button" class="toggle-switch keys-hub-scheme-toggle'+(enabled?' is-on':'')+'" data-scheme-enable="'+esc(m.id)+'" role="switch" aria-checked="'+(enabled?'true':'false')+'" aria-label="'+esc(enabled?t('keysWorkflowEnabled'):t('keysWorkflowDisabled'))+'"></button>':'')
      +'<button type="button" class="keys-hub-scheme-delete" data-scheme-delete="'+esc(m.id)+'" aria-label="'+esc(t('habitHubActDelete'))+'" title="'+esc(t('habitHubActDelete'))+'">×</button>'
      +'</div></div>';
  }

  function renderKeysHub(){
    var schemeList=$('keysHubSchemeList');
    var tplList=$('keysHubTemplateList');
    var card=$('keysHubCard');
    var countEl=$('keysHubCount');
    var titleLbl=$('keysHubTitleLbl');
    var tplLbl=$('keysHubTemplatesLbl');
    var tplCountEl=$('keysHubTemplatesCount');
    var tplHint=$('keysHubTemplatesHint');
    var tplFillWrap=$('keysHubTemplatesFillWrap');
    var tplFillList=$('keysHubTemplatesFillList');
    var tplFillLbl=$('keysHubTemplatesFillLbl');
    var aside=$('keysPanelAside');
    var tplApi=global.OneToneKeysWorkflowTemplates;
    if(titleLbl) titleLbl.textContent=t('keysHubTitle');
    if(tplLbl) tplLbl.textContent=t('keysHubTemplatesLbl');
    if(tplHint) tplHint.textContent=t('keysHubTemplatesHint');
    if(tplFillLbl) tplFillLbl.textContent=t('keysTemplateFillLbl');
    var addSchemeBtn=$('btnKeysHubAddScheme');
    if(addSchemeBtn) addSchemeBtn.textContent='+ '+t('addKeysDraft');
    if(aside) aside.setAttribute('aria-label',t('keysHubTitle'));
    if(!schemeList) return;
    if(!core()||!core().sorted){
      schemeList.innerHTML='';
      if(tplList) tplList.innerHTML='';
      if(card) card.hidden=true;
      return;
    }
    var schemes=contextFilteredSchemes();
    var selected=ensureContextSelection();
    if(card) card.hidden=false;
    if(countEl) countEl.textContent=String(schemes.length);
    if(!schemes.length){
      schemeList.innerHTML='<p class="keys-hub-empty">'+esc(t('keysWorkflowOverviewEmpty'))+'</p>';
    }else{
      var sorted=schemes.slice().sort(function(a,b){
        if(a.id===selected) return -1;
        if(b.id===selected) return 1;
        var aSaved=core().isSaved&&core().isSaved(a);
        var bSaved=core().isSaved&&core().isSaved(b);
        if(aSaved!==bSaved) return aSaved?-1:1;
        return (a.order||0)-(b.order||0);
      });
      schemeList.innerHTML='<div class="keys-hub-scheme-group">'
        +sorted.map(function(m){ return renderKeysHubSchemeRow(m,selected); }).join('')
        +'</div>';
    }
    if(!tplList||!tplApi||!tplApi.list) return;
    var templates=tplApi.list();
    var m=core()&&core().selected?core().selected():null;
    var canFill=!!m;
    if(tplCountEl) tplCountEl.textContent=String(templates.length);
    if(tplFillWrap) tplFillWrap.hidden=!canFill;
    tplList.innerHTML=templates.map(function(tpl){
      var summary=tplApi.compactSummary?tplApi.compactSummary(tpl):'';
      var title=esc(t(tpl.nameKey))+(summary?' — '+esc(summary):'');
      return '<button type="button" class="keys-hub-template-chip" data-new-template="'+esc(tpl.id)+'" title="'+title+'">'
        +esc(t(tpl.nameKey))+'</button>';
    }).join('');
    if(tplFillList){
      tplFillList.innerHTML=canFill?templates.map(function(tpl){
        return '<button type="button" class="keys-hub-template-fill-chip" data-apply-template="'+esc(tpl.id)+'" title="'+esc(t(tpl.nameKey))+'">'
          +esc(t(tpl.nameKey))+'</button>';
      }).join(''):'';
    }
  }

  function renderWorkflowOverview(){
    renderKeysHub();
  }

  function renderWorkflowTemplates(){
    renderKeysHub();
  }

  function renderWorkflowTabs(){
    var tabs=$('keysWorkflowTabs');
    var tabsLbl=$('keysWorkflowTabsLbl');
    if(tabsLbl) tabsLbl.textContent=t('keysWorkflowTabsLbl');
    if(!tabs) return;
    if(!core()||!core().sorted){
      tabs.innerHTML='';
      return;
    }
    var schemes=contextFilteredSchemes();
    var selected=ensureContextSelection();
    if(!schemes.length){
      tabs.innerHTML='<p class="keys-workflow-tabs-empty">'+esc(t('mappingEmptyTitle'))+'</p>';
      return;
    }
    tabs.innerHTML=schemes.map(function(m){
      var isSel=m.id===selected;
      var enabled=!!m.enabled;
      var isDraft=core().isIncomplete&&core().isIncomplete(m);
      var isStrictDraft=core().isDraft&&core().isDraft(m);
      var draftBadge=isStrictDraft?t('homeLiveSchemeDraft'):t('keySchemeCompletenessIncomplete');
      return '<button type="button" class="keys-workflow-tab'+(isSel?' is-active':'')+(!enabled?' is-disabled-scheme':'')+(isDraft?' is-draft':'')+'" role="tab" aria-selected="'+(isSel?'true':'false')+'" id="keysWorkflowTab-'+esc(m.id)+'" data-scheme-id="'+esc(m.id)+'">'
        +'<span class="keys-workflow-tab-name">'+esc(habitName(m))+'</span>'
        +(isDraft?'<span class="keys-workflow-tab-draft">'+esc(draftBadge)+'</span>':'')
        +'</button>';
    }).join('');
  }

  function renameScheme(id){
    id=String(id||'').trim();
    if(!id||!core()) return;
    var m=core().byId?core().byId(id):null;
    if(!m) return;
    var next=prompt(t('keysSchemeRenamePrompt'),habitName(m));
    if(next===null) return;
    next=String(next).trim();
    if(!next) return;
    m.group=next;
    if(global.OneToneHabitHub&&global.OneToneHabitHub.touchUpdated) global.OneToneHabitHub.touchUpdated(m);
    if(hooks().save) hooks().save();
    if(hooks().renderMappingList) hooks().renderMappingList();
    if(global.OneToneSceneTabs) global.OneToneSceneTabs.render();
    render();
  }

  function switchActiveScheme(id){
    id=String(id||'').trim();
    if(!id||id===state().selectedMappingId) return;
    var schemes=contextFilteredSchemes();
    if(!schemes.some(function(m){ return m.id===id; })) return;
    if(isEditorDirty()){
      var modal=global.OneToneMappingConfirmModal;
      if(modal&&modal.open){
        modal.open(t('keysUnsavedSwitchPrompt')).then(function(ok){
          if(ok) switchActiveSchemeNow(id);
        });
        return;
      }
    }
    switchActiveSchemeNow(id);
  }

  function switchActiveSchemeNow(id){
    if(global.OneToneTargetKeyPicker&&global.OneToneTargetKeyPicker.close) global.OneToneTargetKeyPicker.close();
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
    var schemeList=$('keysHubSchemeList');
    var hubRow=schemeList&&schemeList.querySelector('[data-scheme-id="'+id+'"]');
    if(hubRow) hubRow.scrollIntoView({behavior:'smooth',block:'nearest'});
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
    var appId=activeAppContextId();
    var live=false;
    if(!appId){
      var nav=global.OneToneHabitLayerNav;
      if(nav&&nav.getForegroundContextRef){
        appId=nav.getForegroundContextRef(m)||'';
        live=!!appId;
      }
    }
    if(!appId){
      wrap.hidden=true;
      return;
    }
    wrap.hidden=false;
    var rules=appRules();
    var rule=rules&&rules.ruleForContext?rules.ruleForContext(m,appId):null;
    var appName=rule&&rules&&rules.ruleDisplayName
      ?rules.ruleDisplayName(rule)
      :(rules&&rules.appDisplayName?rules.appDisplayName(appId):'');
    if(val) val.textContent=appName||t('keysAppContextDefault');
    if(badge){
      var isPrimary=appId&&String(m.appTargetId||'')===appId&&!(rules&&rules.isContextRuleId&&rules.isContextRuleId(appId));
      badge.hidden=!isPrimary;
      if(isPrimary) badge.textContent=t('habitAppRulePrimaryOn');
    }
    if(hint){
      if(appId){
        hint.textContent=(live?t('keysAppContextHintLive'):t('keysAppContextHintApp')).replace('{app}',appName);
      }else{
        hint.textContent=t('keysAppContextHintDefault');
      }
    }
  }

  function normalizeTriggerKey(key){
    var fn=hooks().normalizeTriggerKey;
    if(typeof fn==='function') return fn(key);
    var ku=global.OneToneAppKeyUtils;
    if(ku&&typeof ku.normalizeTriggerKey==='function') return ku.normalizeTriggerKey(key);
    return String(key||'').trim();
  }

  function previewKeyConflict(mode,key){
    key=String(key||'').trim();
    if(!key||!core()) return '';
    var m=core().selected();
    if(!m) return '';
    var norm=normalizeTriggerKey(key);
    var mappings=(state().config&&state().config.mappings)||[];
    for(var i=0;i<mappings.length;i++){
      var other=mappings[i];
      if(!other||other.id===m.id||!other.enabled) continue;
      var otherTrig=core().editorTrigger?core().editorTrigger(other):(other.triggerKey||'');
      var otherTgt=core().editorTarget?core().editorTarget(other):(other.targetKey||'');
      if(mode==='trigger'&&otherTrig&&normalizeTriggerKey(otherTrig)===norm){
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
    var recording=mode==='trigger'||mode==='target'||mode==='agentBinding';
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
    var recording=mode==='trigger'||mode==='target'||mode==='agentBinding';
    wrap.hidden=!recording;
    wrap.classList.toggle('is-trigger',mode==='trigger');
    wrap.classList.toggle('is-target',mode==='target'||mode==='agentBinding');
    if(!recording){
      if(conflict){ conflict.hidden=true; conflict.textContent=''; }
      ['habitKeyMapRowTrigger','habitKeyMapRowTarget'].forEach(function(id){
        var row=$(id);
        if(row) row.classList.remove('is-recording-active');
      });
      syncCancelButtonHost();
      var mOff=core()&&core().selected?core().selected():null;
      renderFlowStatusBar(mOff);
      renderTriggerConflict(mOff);
      if(global.OneToneKeysPageNav&&global.OneToneKeysPageNav.renderStepHints){
        global.OneToneKeysPageNav.renderStepHints(mOff);
      }
      return;
    }
    var trigRow=$('habitKeyMapRowTrigger');
    var tgtRow=$('habitKeyMapRowTarget');
    if(trigRow) trigRow.classList.toggle('is-recording-active',mode==='trigger');
    if(tgtRow) tgtRow.classList.toggle('is-recording-active',mode==='target'||mode==='agentBinding');
    text.textContent=mode==='trigger'?t('keysRecordingTrigger')
      :(mode==='agentBinding'?t('keysStatusRecordingCap','录制能力快捷键中'):t('keysRecordingTarget'));
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
    renderTriggerConflict(m);
    if(global.OneToneKeysPageNav&&global.OneToneKeysPageNav.renderStepHints){
      global.OneToneKeysPageNav.renderStepHints(m);
    }
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
      var inKeys=keysPanelActive();
      if(inKeys) tgtBtn.setAttribute('aria-label',t('keysTargetKeycapHint'));
      else tgtBtn.removeAttribute('aria-label');
      var tgtLbl=tgt?t('btnRerecordTarget'):t('keysRecordTarget');
      if(global.OneToneMappingEditorChrome&&global.OneToneMappingEditorChrome.setRecordBtnLabel){
        global.OneToneMappingEditorChrome.setRecordBtnLabel(tgtBtn,inKeys?'':tgtLbl);
      }else if(!inKeys) tgtBtn.textContent=tgtLbl;
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
    var shortcutsCard=$('keysAppShortcutsCard');
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
      ['keysColActionLbl','keysColAction'],
      ['keysFlowNodeTriggerTag','keysFlowNodeTriggerTag'],
      ['keysFlowNodeTargetTag','keysFlowNodeTargetTag'],
      ['keysFlowNodeFinishTag','keysFlowNodeFinishTag'],
      ['keysFlowNodeTriggerTitle','keysColTrigger'],
      ['keysFlowNodeTargetTitle','keysColCapture'],
      ['keysFlowNodeFinishTitle','keysColAction'],
      ['keysAppScopeTitle','keysAppScopeTitle'],
      ['keysAppScopeDesc','keysAppScopeDesc']
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
    syncKeyDisplayIcons(m);
    renderTriggerModeSegments(m);
    renderTriggerConflict(m);
    renderSchemeSummary(m);
    syncRecordButtons();
    if(global.OneToneImePresets) global.OneToneImePresets.refresh('mapping');
    renderRecordingFeedback();
    if(global.OneToneMappingCore&&global.OneToneMappingCore.renderConflictBanner){
      global.OneToneMappingCore.renderConflictBanner();
    }
    if(global.OneToneKeysPageNav&&global.OneToneKeysPageNav.render){
      global.OneToneKeysPageNav.render(m);
    }
  }

  function render(){
    if(!keysPanelActive()) return;
    if(global.OneToneHabitScenarioContextBanner) global.OneToneHabitScenarioContextBanner.render();
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
        e.stopPropagation();
        if(appRules()&&appRules().openAppPicker) appRules().openAppPicker();
      });
    }
    var saveBtn=$('btnKeysSave');
    if(saveBtn){
      saveBtn.addEventListener('click',function(e){
        e.preventDefault();
        saveCurrentScheme();
      });
    }
    var testTop=$('btnKeysTestTop');
    if(testTop){
      testTop.addEventListener('click',function(e){
        e.preventDefault();
        var main=$('btnTestSend');
        if(main&&!main.disabled) main.click();
      });
    }
    var hubAdd=$('btnKeysHubAddScheme');
    if(hubAdd){
      hubAdd.addEventListener('click',function(e){
        e.preventDefault();
        var addBtn=$('btnAddMapping');
        if(addBtn) addBtn.click();
      });
    }
    var schemeAdd=$('btnKeysSchemeAdd');
    if(schemeAdd){
      schemeAdd.addEventListener('click',function(e){
        e.preventDefault();
        var addBtn=$('btnAddMapping');
        if(addBtn) addBtn.click();
      });
    }
    var panel=$('settingsPanelKeys');
    if(panel&&panel.dataset.keysPanelUiBound!=='1'){
      panel.dataset.keysPanelUiBound='1';
      panel.addEventListener('click',function(e){
        if(e.target.closest&&e.target.closest('[data-keys-conflict-recommend]')){
          e.preventDefault();
          applyRecommendedTriggerKey();
          return;
        }
        if(e.target.closest&&e.target.closest('[data-keys-conflict-view]')){
          e.preventDefault();
          viewConflicts();
        }
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
        var enableBtn=e.target.closest&&e.target.closest('[data-scheme-enable]');
        if(enableBtn){
          e.__vpKeysPanelHandled=true;
          e.preventDefault();
          e.stopPropagation();
          var enableId=enableBtn.getAttribute('data-scheme-enable')||'';
          var enableM=core().byId?core().byId(enableId):null;
          if(enableM&&global.OneToneMappingEditActions&&global.OneToneMappingEditActions.setMappingEnabled){
            global.OneToneMappingEditActions.setMappingEnabled(enableId,!enableM.enabled);
          }
          return;
        }
        var delBtn=e.target.closest&&e.target.closest('[data-scheme-delete]');
        if(delBtn){
          e.__vpKeysPanelHandled=true;
          e.preventDefault();
          e.stopPropagation();
          if(global.OneToneMappingTrashMenu) global.OneToneMappingTrashMenu.deleteFromMenu(delBtn.getAttribute('data-scheme-delete')||'');
          return;
        }
        var renameBtn=e.target.closest&&e.target.closest('[data-scheme-rename]');
        if(renameBtn){
          e.__vpKeysPanelHandled=true;
          e.preventDefault();
          e.stopPropagation();
          renameScheme(renameBtn.getAttribute('data-scheme-rename')||'');
          return;
        }
        var schemeSelect=e.target.closest&&e.target.closest('[data-scheme-select]');
        if(schemeSelect){
          e.__vpKeysPanelHandled=true;
          e.preventDefault();
          switchActiveScheme(schemeSelect.getAttribute('data-scheme-select')||'');
          return;
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
    renameScheme:renameScheme,
    renderWorkflowOverview:renderWorkflowOverview,
    renderWorkflowTemplates:renderWorkflowTemplates,
    switchActiveScheme:switchActiveScheme,
    renderSchemeSummary:renderSchemeSummary,
    renderTestProgress:renderTestProgress,
    isEditorDirty:isEditorDirty,
    saveCurrentScheme:saveCurrentScheme,
    keysPanelActive:keysPanelActive,
    previewKeyConflict:previewKeyConflict
  };
})((typeof window!=='undefined')?window:globalThis);
