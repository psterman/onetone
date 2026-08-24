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

  function recordingUiSnapshot(){
    var rec=global.OneToneMappingRecording;
    var mode=rec&&rec.mode?rec.mode():'none';
    var ipcPhase=rec&&rec.ipcPhase?rec.ipcPhase():(global.__otRecordIpcPhase||'idle');
    var recording=false;
    if(rec&&rec.isRecordingUi) recording=!!rec.isRecordingUi();
    else{
      var life=global.OneToneRecordIpcLifecycle;
      recording=life&&life.isRecordingUi
        ?!!life.isRecordingUi(mode,ipcPhase)
        :(mode==='trigger'||mode==='target'||mode==='agentBinding');
    }
    return { mode:mode, ipcPhase:ipcPhase, recording:recording, pending:!!(rec&&rec.isPending&&rec.isPending()) };
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
    var cfg=global.OneToneState&&global.OneToneState.state?global.OneToneState.state.config:null;
    var baseline=diff.findGlobalBaselineMapping?diff.findGlobalBaselineMapping(cfg||{},core()):null;
    var baselineId=baseline&&baseline.id?String(baseline.id):'';
    return all.filter(function(m){
      if(diff.isAppScenarioMapping(m)) return false;
      if(!baselineId) return true;
      return String(m.id||'')===baselineId;
    });
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
    if(global.OneToneHabitProfile&&global.OneToneHabitProfile.habitDisplayName){
      return global.OneToneHabitProfile.habitDisplayName(m);
    }
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

  function scopeSummaryEntries(m){
    if(!m) return [];
    var rules=appRules();
    var ctx=appScenarioContextMapping();
    var out=[];
    var seen={};
    function pushApp(appId,label){
      appId=String(appId||'').trim();
      label=String(label||'').trim();
      if(!appId&&!label) return;
      var key=appId||('n:'+label);
      if(seen[key]) return;
      seen[key]=true;
      out.push({
        id:appId,
        name:label||(rules&&rules.appDisplayName?rules.appDisplayName(appId):appId),
        icon:appId?presetIcon(appId):''
      });
    }
    if(ctx&&m.id===ctx.id){
      var appOnly=String(m.appTargetId||'').trim();
      if(appOnly){
        pushApp(appOnly,rules&&rules.appDisplayName?rules.appDisplayName(appOnly):appOnly);
        return out;
      }
    }
    var primary=String(m.appTargetId||'').trim();
    if(primary) pushApp(primary,rules&&rules.appDisplayName?rules.appDisplayName(primary):primary);
    var presets=rules&&rules.behaviorPresets?rules.behaviorPresets:[];
    presets.forEach(function(p){
      if(!p||!p.id||p.id===primary) return;
      var hasRule=Array.isArray(m.appBehaviorRules)&&m.appBehaviorRules.some(function(r){ return r&&r.appId===p.id; });
      if(hasRule) pushApp(p.id,rules&&rules.appDisplayName?rules.appDisplayName(p.id):p.id);
    });
    if(rules&&rules.customRulesForMapping){
      rules.customRulesForMapping(m).forEach(function(rule){
        if(!rule) return;
        var label=rules.ruleDisplayName?rules.ruleDisplayName(rule):'';
        var rid=String(rule.ruleId||rule.appId||'').trim();
        pushApp(rid,label||rid);
      });
    }
    return out;
  }

  function scopeSummaryText(m){
    var entries=scopeSummaryEntries(m);
    if(!entries.length) return t('keysSummaryScopeAll');
    var names=entries.map(function(e){ return e.name; });
    if(names.length>3) return names.slice(0,3).join(' / ')+'…';
    return names.join(' / ');
  }

  function scopeSummaryHtml(m){
    var entries=scopeSummaryEntries(m);
    if(!entries.length){
      return '<span class="keys-scope-icon-chip keys-scope-icon-chip--none">'+esc(t('keysSummaryScopeAll'))+'</span>';
    }
    var more=entries.length>3;
    var show=more?entries.slice(0,3):entries;
    var html=show.map(function(e){
      var icon=e.icon
        ?('<img class="keys-scope-icon" src="'+esc(e.icon)+'" alt="" decoding="async" />')
        :(e.name?('<span class="keys-scope-icon keys-scope-icon--fallback" aria-hidden="true">'+esc(String(e.name).charAt(0))+'</span>'):'');
      return '<span class="keys-scope-icon-chip" title="'+esc(e.name)+'">'+icon+'<span class="keys-scope-icon-name">'+esc(e.name)+'</span></span>';
    }).join('<span class="keys-scope-sep" aria-hidden="true">/</span>');
    if(more) html+='<span class="keys-scope-more" aria-hidden="true">…</span>';
    return html;
  }

  function paintScopeSummary(scopeVal,m,opts){
    opts=opts||{};
    if(!scopeVal) return;
    var capUi=global.OneToneAgentCapabilityUi;
    var codexCtx=opts.codexCtx!=null?opts.codexCtx:(capUi&&capUi.isCodexKeysEditing&&capUi.isCodexKeysEditing());
    if(codexCtx&&capUi&&capUi.pushToTalkDisplay){
      var talkKey=capUi.pushToTalkDisplay(m);
      scopeVal.classList.remove('has-icons');
      scopeVal.textContent=talkKey
        ?(t('codexSummaryTalkKey','说话键')+' '+talkKey)
        :scopeSummaryText(m);
      return;
    }
    scopeVal.classList.add('has-icons');
    scopeVal.innerHTML=scopeSummaryHtml(m);
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

  function buildKeysStatusProps(m){
    var snap=recordingUiSnapshot();
    var rec=global.OneToneMappingRecording;
    var recMode=snap.mode;
    var recording=snap.recording;
    var capUi=global.OneToneAgentCapabilityUi;
    var codexCtx=capUi&&capUi.isCodexKeysEditing&&capUi.isCodexKeysEditing();
    var dirty=m?isEditorDirty():false;
    var trig='';
    var trigLabel='';
    if(m){
      trig=core().editorTrigger?core().editorTrigger(m):((m.triggerKey||'').trim());
      var lang=global.OneToneI18n&&global.OneToneI18n.getLang?global.OneToneI18n.getLang():'zh';
      if(global.OneToneKeyLabels&&global.OneToneKeyLabels.triggerDisplayLabel){
        trigLabel=global.OneToneKeyLabels.triggerDisplayLabel(m,lang)||'';
      }
      if(!trigLabel&&trig) trigLabel=friendlyKey(trig);
    }
    var name='—';
    var brandTitle=t('keysPageBrandTitle','按键');
    var status='—';
    var statusCls='';
    if(m){
      if(codexCtx) name=habitName(m);
      else name=habitName(m)+(trigLabel?' · '+trigLabel:(trig?friendlyKey(trig):''));
      if(recording){
        status=recMode==='trigger'?t('keysStatusRecordingTrigger')
          :(recMode==='agentBinding'?t('keysStatusRecordingCap','录制能力快捷键中'):t('keysStatusRecordingTarget'));
      }else if(dirty){
        status=t('keysSummaryStatusDirty');
        statusCls='is-dirty';
      }else if(m.enabled){
        status=t('keysSummaryStatusActive');
        statusCls='is-on';
      }else if(core().isSaved&&core().isSaved(m)){
        status=t('keysSummaryStatusSaved');
      }else{
        status=t('keysSummaryStatusInactive');
        statusCls='is-off';
      }
    }
    var scopeVal='—';
    var scopeApps=[];
    var scopeIcons=false;
    var habitStripOn=shouldShowHabitStrip();
    if(m){
      if(codexCtx&&capUi&&capUi.pushToTalkDisplay){
        var talkKey=capUi.pushToTalkDisplay(m);
        scopeVal=talkKey
          ?(t('codexSummaryTalkKey','说话键')+' '+talkKey)
          :scopeSummaryText(m);
        if(!talkKey){
          scopeApps=scopeSummaryEntries(m);
          scopeIcons=true;
        }
      }else{
        scopeVal=scopeSummaryText(m);
        scopeApps=scopeSummaryEntries(m);
        scopeIcons=true;
      }
    }
    var tgt=m?(core().editorTarget?core().editorTarget(m):((m.targetKey||'').trim())):'';
    var mappingEnabled=!!(m&&m.enabled);
    if(recording){
      mappingEnabled=rec&&rec.wasEnabledBeforeRecording?rec.wasEnabledBeforeRecording():!!(m&&m.enabled);
    }
    return {
      brandTitle:brandTitle,
      name:name,
      status:status,
      statusCls:statusCls,
      triggerLbl:t('keysSummaryTriggerLbl'),
      triggerVal:m?(trigLabel||(trig?friendlyKey(trig):t('keysStatusUnset'))):'—',
      scopeLbl:t('keysSummaryScopeLbl'),
      scopeVal:scopeVal,
      scopeApps:scopeApps,
      scopeIcons:scopeIcons,
      // Interactive chips already show 生效范围 — don't duplicate icon pills above.
      scopeHidden:!!habitStripOn,
      saveLabel:t('keysSave'),
      testLabel:t('keysTestOnce'),
      addLabel:'+ '+t('addKeysDraft'),
      saveDisabled:!dirty,
      saveHidden:!!codexCtx,
      testDisabled:!m||!trig||!tgt,
      mappingEnabled:mappingEnabled,
      toggleDisabled:!m||recording,
      hasMapping:!!m
    };
  }

  function pushKeysStatusIfMounted(m){
    if(global.__otKeysStatusMounted&&global.__otKeysStatusSync){
      global.__otKeysStatusSync(buildKeysStatusProps(m));
      return true;
    }
    return false;
  }

  function testOnceTop(){
    var main=$('btnTestSend');
    if(main&&!main.disabled) main.click();
  }

  function addScheme(){
    var addBtn=$('btnAddMapping');
    if(addBtn) addBtn.click();
  }

  function toggleMappingEnable(){
    var m=core()&&core().selected?core().selected():null;
    if(!m||!core().isSaved||!core().isSaved(m)) return;
    var edit=global.OneToneMappingEditActions;
    if(edit&&edit.setMappingEnabled) edit.setMappingEnabled(m.id,!m.enabled);
  }

  function syncKeysPageBrandTitle(){
    var brand=$('keysPageBrandTitle');
    if(brand) brand.textContent=t('keysPageBrandTitle','按键');
  }

  function renderSchemeSummary(m){
    syncKeysPageBrandTitle();
    var islandOn=pushKeysStatusIfMounted(m);
    var nameEl=islandOn?null:$('keysSummaryName');
    var statusEl=islandOn?null:$('keysSummaryStatus');
    var toggle=$('btnKeysMappingEnable');
    var keycapHint=$('keysKeycapHint');
    var keycapHost=$('habitKeyMapCellTrigger');
    var targetKeycapHost=$('habitKeyMapCellTarget');
    if(keycapHint) keycapHint.textContent=t('keysKeycapHint');
    var imeHint=$('imePresetHintMapping');
    if(imeHint) imeHint.textContent=t('keysCaptureImeSource');
    var triggerFooterLbl=$('keysTriggerModeFooterLbl');
    if(triggerFooterLbl) triggerFooterLbl.textContent=t('keysWorkflowFooterTrigger');
    if(!m){
      if(nameEl) nameEl.textContent='—';
      if(statusEl){ statusEl.textContent='—'; statusEl.className='keys-scheme-summary-pill'; }
      if(toggle){
        toggle.classList.remove('is-on');
        toggle.setAttribute('aria-checked','false');
        toggle.disabled=true;
      }
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
    var snap=recordingUiSnapshot();
    var recMode=snap.mode;
    var recPending=snap.pending;
    var recording=snap.recording;
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
    if(!global.__otKeysStatusMounted&&toggle){
      toggle.classList.toggle('is-on',!!m.enabled);
      toggle.setAttribute('aria-checked',m.enabled?'true':'false');
      toggle.disabled=!m||recording;
      delete toggle.dataset.vpToggleBusy;
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

  function buildKeysTriggerModeModel(m){
    if(arguments.length===0){
      m=core()&&core().selected?core().selected():null;
    }
    if(!m){
      return {
        modeHtml:'',
        mappingId:'',
        triggerUi:'',
        gateOk:false,
        sig:'empty'
      };
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
    var sig=[
      m.id,
      current,
      gate.ok?'1':'0',
      String(gate.reason||''),
      html
    ].join('\0');
    return {
      modeHtml:html,
      mappingId:m.id,
      triggerUi:current,
      gateOk:!!gate.ok,
      sig:sig
    };
  }

  function renderTriggerModeSegments(m){
    var host=$('keysTriggerModeHost');
    if(!host) return;
    var model=buildKeysTriggerModeModel(m);
    if(global.__otKeysTriggerModeMounted&&typeof global.__otKeysTriggerModeSync==='function'){
      global.__otKeysTriggerModeSync();
      return;
    }
    host.innerHTML=model.modeHtml||'';
  }

  function buildKeysTriggerConflictModel(m){
    if(arguments.length===0){
      m=core()&&core().selected?core().selected():null;
    }
    var trig=core().editorTrigger?core().editorTrigger(m):((m&&m.triggerKey)||'').trim();
    var msg=previewKeyConflict('trigger',trig);
    if(!msg&&m&&core().schemeHasConflict&&core().schemeHasConflict(m)){
      msg=t('keysRecordConflictScheme');
    }
    var mappingId=m&&m.id?String(m.id):'';
    if(!msg){
      return {
        html:'',
        hidden:true,
        mappingId:mappingId,
        msg:'',
        sig:'empty'
      };
    }
    var html='<span class="keys-trigger-conflict-text">'+esc(msg)+'</span>'
      +'<div class="keys-trigger-conflict-actions">'
      +'<button type="button" class="keys-trigger-conflict-btn" data-keys-conflict-recommend="1">'+esc(t('keysConflictRecommend'))+'</button>'
      +'<button type="button" class="keys-trigger-conflict-btn" data-keys-conflict-view="1">'+esc(t('keysConflictView'))+'</button>'
      +'</div>';
    return {
      html:html,
      hidden:false,
      mappingId:mappingId,
      msg:String(msg),
      sig:[mappingId,msg,html].join('\0')
    };
  }

  function renderTriggerConflict(m){
    var box=$('keysTriggerConflict');
    if(!box) return;
    var model=buildKeysTriggerConflictModel(m);
    if(global.__otKeysTriggerConflictMounted&&typeof global.__otKeysTriggerConflictSync==='function'){
      global.__otKeysTriggerConflictSync();
      return;
    }
    var prevMsg=box.dataset.otConflictMsg||'';
    var warmed=box.dataset.otConflictWarmed==='1';
    box.hidden=!!model.hidden;
    box.innerHTML=model.html||'';
    if(model.hidden){
      box.dataset.otConflictMsg='';
      box.dataset.otConflictWarmed='1';
      return;
    }
    var msg=String(model.msg||'');
    if(warmed&&msg&&msg!==prevMsg){
      var Motion=global.OneToneMotion;
      if(Motion&&typeof Motion.playOnce==='function') Motion.playOnce(box,'ot-shake');
    }
    box.dataset.otConflictMsg=msg;
    box.dataset.otConflictWarmed='1';
  }

  function persistEditorIfDirty(){
    if(!isEditorDirty()) return false;
    hooks().flushAllEditorToMappings&&hooks().flushAllEditorToMappings();
    if(hooks().save) hooks().save();
    return true;
  }

  function saveCurrentScheme(){
    if(!persistEditorIfDirty()) return;
    if(hooks().render) hooks().render();
    render();
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
    var snap=recordingUiSnapshot();
    var mode=snap.mode;
    var recording=snap.recording&&(mode==='trigger'||mode==='target'||mode==='agentBinding');
    if(recording){
      var rec=global.OneToneMappingRecording;
      var wasOn=rec&&rec.wasEnabledBeforeRecording?rec.wasEnabledBeforeRecording():!!(m&&m.enabled);
      if(activeLbl){
        activeLbl.textContent=mode==='target'?t('keysStatusRecordingTarget')
          :(mode==='agentBinding'?t('keysStatusRecordingCap','录制能力快捷键中'):t('keysStatusRecordingTrigger'));
      }
      if(activeDot) activeDot.hidden=false;
      if(activePill){
        activePill.classList.add('is-recording');
        activePill.classList.add('is-on');
      }
      if(!global.__otKeysStatusMounted&&toggle){
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
    if(!global.__otKeysStatusMounted&&toggle){
      toggle.classList.toggle('is-on',enabled);
      toggle.setAttribute('aria-checked',enabled?'true':'false');
      toggle.disabled=!m||recording;
      delete toggle.dataset.vpToggleBusy;
    }
    renderSchemeSummary(m);
  }

  function shouldHideHabitStrip(){
    if(!keysPanelActive()) return true;
    return false;
  }

  function shouldShowHabitStrip(){
    return false;
  }

  function buildKeysAppContextStripModel(){
    var m=core()&&core().selected?core().selected():null;
    var hide=!shouldShowHabitStrip();
    var selected=ensureContextSelection();
    return {
      hidden:hide,
      html:'',
      mappingId:m&&m.id?String(m.id):'',
      contextId:selected||'',
      sig:[hide?'hidden':'show',selected||'',String(contextFilteredSchemes().length)].join('\0')
    };
  }

  function applyKeysHabitStripHost(model){
    if(!model) model=buildKeysAppContextStripModel();
    var bindingStrip=$('keysAppBindingStrip');
    var wrap=$('keysHabitStripWrap');
    var bar=$('keysWorkflowTabsBar');
    if(bindingStrip) bindingStrip.hidden=!!model.hidden;
    if(wrap) wrap.hidden=!!model.hidden;
    if(bar) bar.classList.toggle('has-habit-strip',!model.hidden);
    if(global.__otKeysAppContextStripMounted&&typeof global.__otKeysAppContextStripSync==='function'){
      global.__otKeysAppContextStripSync();
    }
    if(model.hidden) return;
    renderWorkflowTabs();
    if(global.__otKeysWorkflowMounted&&typeof global.__otKeysWorkflowSync==='function'){
      try{ global.__otKeysWorkflowSync(); }catch(_){}
    }
  }

  function renderHabitStrip(){
    var lbl=$('keysHabitStripLbl');
    var addBtn=$('btnKeysHabitStripAdd');
    var tabsLbl=$('keysWorkflowTabsLbl');
    if(lbl) lbl.textContent=t('keysHabitStripLbl');
    if(addBtn) addBtn.textContent='+ '+t('addKeysDraft');
    if(tabsLbl) tabsLbl.textContent=t('keysWorkflowTabsLbl');
    applyKeysHabitStripHost(buildKeysAppContextStripModel());
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

  function schemeGroupKey(m){
    if(!m) return '';
    var g=String(m.group||'').trim();
    if(g) return g;
    var l=String(m.label||'').trim();
    if(l) return l;
    return String(m.id||'').trim();
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

  function renderKeysHubTriggerRow(m,selected){
    var isEditing=m.id===selected;
    var comp=schemeCompletion(m);
    var stepsText=comp.done+'/'+comp.total;
    var enabled=!!m.enabled;
    var tag=schemeStatusTag(m);
    var canToggle=core().isSaved&&core().isSaved(m);
    var pair=schemePairLine(m)||t('keysWorkflowOverviewEmpty');
    return '<div class="keys-hub-trigger-row-wrap'+(isEditing?' is-editing':'')+(!enabled?' is-disabled-scheme':'')+(tag.cls==='is-draft'?' is-draft':'')+'">'
      +'<button type="button" class="keys-hub-trigger-row'+(isEditing?' is-active':'')+'" data-scheme-select="'+esc(m.id)+'" aria-current="'+(isEditing?'true':'false')+'">'
      +'<span class="keys-hub-trigger-pair">'+esc(pair)+'</span>'
      +'<span class="keys-hub-trigger-meta">'+esc(stepsText)+'</span>'
      +'</button>'
      +'<div class="keys-hub-trigger-actions">'
      +(isEditing?'<span class="keys-hub-scheme-editing">'+esc(t('keysWorkflowEditing'))+'</span>':'')
      +'<span class="keys-hub-scheme-tag '+esc(tag.cls)+'">'+esc(t(tag.key))+'</span>'
      +(canToggle?'<button type="button" class="toggle-switch keys-hub-scheme-toggle'+(enabled?' is-on':'')+'" data-scheme-enable="'+esc(m.id)+'" role="switch" aria-checked="'+(enabled?'true':'false')+'" aria-label="'+esc(enabled?t('keysWorkflowEnabled'):t('keysWorkflowDisabled'))+'"></button>':'')
      +'<button type="button" class="keys-hub-scheme-delete" data-scheme-delete="'+esc(m.id)+'" aria-label="'+esc(t('habitHubActDelete'))+'" title="'+esc(t('habitHubActDelete'))+'">×</button>'
      +'</div></div>';
  }

  function renderKeysHubGroupCard(groupKey,items,selected){
    var label=habitName(items[0]);
    var isEditing=items.some(function(m){ return m.id===selected; });
    var renameId=(items[0]&&items[0].id)||'';
    return '<div class="keys-hub-scheme-group-card'+(isEditing?' is-editing':'')+'" role="listitem" data-group="'+esc(groupKey)+'">'
      +'<header class="keys-hub-group-head">'
      +'<span class="keys-hub-group-name">'+esc(label)+'</span>'
      +'<span class="keys-hub-group-count">'+esc(String(items.length))+'</span>'
      +'<button type="button" class="keys-hub-scheme-rename" data-scheme-rename="'+esc(renameId)+'" aria-label="'+esc(t('keysSchemeRename'))+'" title="'+esc(t('keysSchemeRename'))+'">✎</button>'
      +'</header>'
      +items.map(function(m){ return renderKeysHubTriggerRow(m,selected); }).join('')
      +'<button type="button" class="keys-hub-add-trigger" data-hub-add-trigger="'+esc(renameId)+'">+ '+esc(t('keysHubAddTrigger'))+'</button>'
      +'</div>';
  }

  function renderKeysHubSchemeRow(m,selected){
    return renderKeysHubGroupCard(schemeGroupKey(m),[m],selected);
  }

  function groupSchemesByKey(schemes){
    var map={};
    var order=[];
    schemes.forEach(function(m){
      var key=schemeGroupKey(m);
      if(!map[key]){
        map[key]=[];
        order.push(key);
      }
      map[key].push(m);
    });
    return order.map(function(key){
      return { key:key, items:map[key] };
    });
  }

  function addTriggerVariant(sourceId){
    sourceId=String(sourceId||'').trim();
    if(!sourceId||!global.OneToneMappingTrashMenu||!global.OneToneMappingTrashMenu.duplicate) return;
    global.OneToneMappingTrashMenu.duplicate(sourceId);
    var m=core()&&core().selected?core().selected():null;
    if(!m) return;
    m.triggerKey='';
    m.enabled=false;
    if(hooks().setEditorTriggerKey) hooks().setEditorTriggerKey('');
    if(hooks().save) hooks().save();
    if(global.OneToneKeysPageState&&global.OneToneKeysPageState.setStep){
      global.OneToneKeysPageState.setStep('trigger');
    }
    render();
  }

  function renderCodexPadMapList(selectedId){
    var host=$('keysHubCodexPadMap');
    if(!host) return;
    // Soft Pad map moved to 虚拟键盘 page — keep host empty.
    host.hidden=true;
    host.innerHTML='';
    void selectedId;
  }

  function buildKeysHubSchemeListModel(){
    return { html:'', count:0, cardHidden:true, selected:'', sig:'d-banner' };
  }

  function applyKeysHubSchemeListHost(model){
    if(!model) model=buildKeysHubSchemeListModel();
    if(global.__otKeysHubSchemeListMounted&&typeof global.__otKeysHubSchemeListSync==='function'){
      global.__otKeysHubSchemeListSync();
      return;
    }
    var schemeList=$('keysHubSchemeList');
    var card=$('keysHubCard');
    var countEl=$('keysHubCount');
    if(card) card.hidden=!!model.cardHidden;
    if(countEl) countEl.textContent=String(model.count||0);
    if(schemeList) schemeList.innerHTML=model.html||'';
  }

  function renderKeysHub(){
    var tplList=$('keysHubTemplateList');
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
    var schemeModel=buildKeysHubSchemeListModel();
    applyKeysHubSchemeListHost(schemeModel);
    if(schemeModel.cardHidden){
      if(tplList) tplList.innerHTML='';
      renderCodexPadMapList('');
      return;
    }
    renderCodexPadMapList(schemeModel.selected);
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
    if(global.__otKeysWorkflowMounted&&typeof global.__otKeysWorkflowSync==='function'){
      global.__otKeysWorkflowSync();
      return;
    }
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
      return workflowTabView(m,selected);
    }).join('');
  }

  function workflowTabView(m,selected){
    var isSel=m.id===selected;
    var enabled=!!m.enabled;
    var isDraft=core().isIncomplete&&core().isIncomplete(m);
    var isStrictDraft=core().isDraft&&core().isDraft(m);
    var draftBadge=isStrictDraft?t('homeLiveSchemeDraft'):t('keySchemeCompletenessIncomplete');
    var label=habitName(m);
    var trig=core().editorTrigger?core().editorTrigger(m):((m.triggerKey||'').trim());
    if(trig) label=label+' · '+friendlyKey(trig);
    return '<button type="button" class="keys-workflow-tab keys-habit-strip-tab'+(isSel?' is-active':'')+(!enabled?' is-disabled-scheme':'')+(isDraft?' is-draft':'')+'" role="tab" aria-selected="'+(isSel?'true':'false')+'" id="keysWorkflowTab-'+esc(m.id)+'" data-scheme-id="'+esc(m.id)+'" data-ot-tip="'+esc(t('keysHabitPillEditOnlyTip','仅切换编辑对象，不影响正在使用'))+'">'
      +'<span class="keys-workflow-tab-name">'+esc(label)+'</span>'
      +(isDraft?'<span class="keys-workflow-tab-draft">'+esc(draftBadge)+'</span>':'')
      +'</button>';
  }

  function buildKeysWorkflowTabsModel(){
    if(!core()||!core().sorted){
      return {emptyHtml:'',tabs:[]};
    }
    var schemes=contextFilteredSchemes();
    var selected=ensureContextSelection();
    if(!schemes.length){
      return {emptyHtml:t('mappingEmptyTitle'),tabs:[]};
    }
    return {
      emptyHtml:'',
      tabs:schemes.map(function(m){
        return {id:m.id,html:workflowTabView(m,selected)};
      })
    };
  }

  function renameScheme(id){
    id=String(id||'').trim();
    if(!id||!core()) return;
    var m=core().byId?core().byId(id):null;
    if(!m) return;
    var groupKey=schemeGroupKey(m);
    var next=prompt(t('keysSchemeRenamePrompt'),habitName(m));
    if(next===null) return;
    next=String(next).trim();
    if(!next) return;
    contextFilteredSchemes().forEach(function(s){
      if(schemeGroupKey(s)===groupKey){
        s.group=next;
        if(global.OneToneHabitHub&&global.OneToneHabitHub.touchUpdated) global.OneToneHabitHub.touchUpdated(s);
      }
    });
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
    if(isEditorDirty()) persistEditorIfDirty();
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
    var hubBtn=schemeList&&schemeList.querySelector('[data-scheme-select="'+id+'"]');
    if(hubBtn){
      var hubWrap=hubBtn.closest('.keys-hub-trigger-row-wrap');
      if(hubWrap) hubWrap.scrollIntoView({behavior:'smooth',block:'nearest'});
      var groupCard=hubBtn.closest('.keys-hub-scheme-group-card');
      if(groupCard) groupCard.scrollIntoView({behavior:'smooth',block:'nearest'});
    }
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
    // App-scenario keys already have the blue context banner — hide this third title strip.
    if(isInAppScenarioContext()){
      wrap.hidden=true;
      return;
    }
    var capUi=global.OneToneAgentCapabilityUi;
    if(capUi&&capUi.isCodexKeysEditing&&capUi.isCodexKeysEditing()){
      wrap.hidden=true;
      return;
    }
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

  function syncInlineCancelForCapture(){
    var table=global.OneToneHabitKeyMappingTable;
    var captureOwns=table&&table.captureOwnsLiveRecording&&table.captureOwnsLiveRecording();
    var snap=recordingUiSnapshot();
    var recording=snap.recording;
    var showInline=!!(captureOwns&&recording);
    var inline=$('btnCancelRecordInline');
    var bar=$('recordCancelBar');
    if(inline){
      inline.hidden=!showInline;
      if(showInline) inline.textContent=t('cancelRecord','取消录制');
    }
    if(bar) bar.classList.toggle('is-capture-suppressed',showInline);
  }

  function syncCancelButtonHost(){
    syncInlineCancelForCapture();
    // P12b-3：录制取消条岛拥有 #btnCancelRecord，禁止挪出 React root
    if(global.__otRecordCancelBarMounted) return;
    var btn=$('btnCancelRecord');
    var feedbackMain=$('keysRecordingFeedbackMain');
    var bar=$('recordCancelBar');
    if(!btn||!bar) return;
    var snap=recordingUiSnapshot();
    var recording=snap.recording;
    var onKeys=keysPanelActive();
    var host=(onKeys&&recording&&feedbackMain)?feedbackMain:bar;
    if(btn.parentNode!==host) host.appendChild(btn);
  }

  function buildKeysRecordingFeedbackModel(){
    var snap=recordingUiSnapshot();
    var mode=snap.mode;
    var ipcPhase=snap.ipcPhase;
    var recording=snap.recording;
    var text='';
    var previewKey='';
    var conflictMsg='';
    if(recording){
      text=mode==='trigger'?t('keysRecordingTrigger')
        :(mode==='agentBinding'?t('keysStatusRecordingCap','录制能力快捷键中'):t('keysRecordingTarget'));
      if(mode==='trigger'&&ed()) previewKey=ed().getEditorTriggerKey?ed().getEditorTriggerKey():'';
      if(mode==='target'&&ed()) previewKey=ed().getEditorTargetKey?ed().getEditorTargetKey():'';
      conflictMsg=previewKeyConflict(mode,previewKey)||'';
    }
    var sig=[mode,ipcPhase,recording?'1':'0',text,conflictMsg].join('\0');
    return {
      mode:mode,
      ipcPhase:ipcPhase,
      recording:recording,
      hidden:!recording,
      text:text,
      conflictText:conflictMsg,
      conflictHidden:!conflictMsg,
      conflictWarn:!!conflictMsg,
      sig:sig
    };
  }

  function applyRecordingHighlightHosts(model){
    if(!model) model=buildKeysRecordingFeedbackModel();
    var table=global.OneToneHabitKeyMappingTable;
    var captureOwns=table&&table.captureOwnsLiveRecording&&table.captureOwnsLiveRecording();
    var trigRow=$('habitKeyMapRowTrigger');
    var tgtRow=$('habitKeyMapRowTarget');
    var zone=$('keysCaptureKeycapZone');
    var hint=$('keysCaptureRecordHint');
    if(trigRow) trigRow.classList.toggle('is-recording-active',!captureOwns&&model.mode==='trigger');
    if(tgtRow) tgtRow.classList.toggle('is-recording-active',!captureOwns&&(model.mode==='target'||model.mode==='agentBinding'));
    if(zone){
      zone.classList.toggle(
        'is-recording-active',
        !!(captureOwns&&(model.mode==='target'||model.mode==='agentBinding'))
      );
    }
    if(hint){
      hint.textContent=captureOwns&&model.recording
        ?t('keysCaptureRecordHintWaiting','正在等待按键…')
        :t('keysCaptureRecordHint','先点上方大按钮，再按下你要设的快捷键');
    }
    syncInlineCancelForCapture();
  }

  function applyKeysRecordingFeedbackHost(model){
    if(!model) model=buildKeysRecordingFeedbackModel();
    var table=global.OneToneHabitKeyMappingTable;
    if(table&&table.syncCaptureRecordingChrome){
      try{ table.syncCaptureRecordingChrome(); }catch(_){}
    }
    applyRecordingHighlightHosts(model);
    if(global.__otKeysRecordingFeedbackMounted&&typeof global.__otKeysRecordingFeedbackSync==='function'){
      global.__otKeysRecordingFeedbackSync();
      return;
    }
    var wrap=$('keysRecordingFeedback');
    var text=$('keysRecordingFeedbackText');
    var conflict=$('keysRecordingConflict');
    if(!wrap||!text) return;
    wrap.hidden=!!model.hidden;
    wrap.classList.toggle('is-trigger',model.mode==='trigger');
    wrap.classList.toggle('is-target',model.mode==='target'||model.mode==='agentBinding');
    text.textContent=model.text||'';
    if(conflict){
      conflict.hidden=!!model.conflictHidden;
      conflict.textContent=model.conflictText||'';
      conflict.classList.toggle('is-warn',!!model.conflictWarn);
    }
  }

  function renderRecordingFeedback(){
    var model=buildKeysRecordingFeedbackModel();
    applyKeysRecordingFeedbackHost(model);
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
    var tgtAct=$('habitKeyMapActTarget');
    var capOpen=global.OneToneKeysChannelCommandPicker&&(
      global.OneToneKeysChannelCommandPicker.isCapturePopoverOpen&&global.OneToneKeysChannelCommandPicker.isCapturePopoverOpen()||
      global.OneToneKeysChannelCommandPicker.isCaptureSheetOpen&&global.OneToneKeysChannelCommandPicker.isCaptureSheetOpen()
    );
    if(tgtAct) tgtAct.hidden=!capOpen;
    if(trigBtn){
      var trigLbl=trig?t('btnRerecordTrigger'):t('keysRecordTrigger');
      if(global.OneToneMappingEditorChrome&&global.OneToneMappingEditorChrome.setRecordBtnLabel){
        global.OneToneMappingEditorChrome.setRecordBtnLabel(trigBtn,trigLbl);
      }else trigBtn.textContent=trigLbl;
      trigBtn.classList.add('keys-record-btn');
    }
    if(tgtBtn){
      var tgtLbl=tgt?t('btnRerecordTarget'):t('btnRecordTarget');
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
    var shortcutsCard=$('keysAppShortcutsCard');
    var advSummary=$('keysAdvancedSummary');
    if(advSummary) advSummary.textContent=t('keysAdvancedTitle');
    var stepLbls=[
      ['habitFlowStepTriggerLbl','keysStep1Title'],
      ['habitFlowStepTargetLbl','keysStep2Title']
    ];
    stepLbls.forEach(function(pair){
      var el=$(pair[0]);
      if(el) el.textContent=t(pair[1]);
    });
    var colLbls=[
      ['keysColTriggerLbl','keysColTrigger'],
      ['keysColCaptureLbl','keysColCapture'],
      ['keysFlowNodeTriggerTag','keysFlowNodeTriggerTag'],
      ['keysFlowNodeTargetTag','keysFlowNodeTargetTag'],
      ['keysFlowNodeTriggerTitle','keysColTrigger'],
      ['keysFlowNodeTargetTitle','keysColCapture'],
      ['keysCapturePopoverTitle','keysCaptureSheetTitle'],
      ['keysCaptureImeRecordTitle','keysCaptureImeRecordTitle'],
      ['keysCaptureKeycapTitle','keysCaptureImeRecordTitle'],
      ['keysCaptureRecordHint','keysCaptureRecordHint'],
      ['keysCaptureKeyFinishLbl','keysCaptureKeyFinishTitle'],
      ['keysHabitStripLbl','keysHabitStripLbl'],
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
    renderTriggerContextBadge();
    syncKeyDisplayIcons(m);
    renderTriggerModeSegments(m);
    renderTriggerConflict(m);
    renderSchemeSummary(m);
    renderHabitStrip();
    if(global.OneToneHabitChannelStatusStrip){
      if(global.OneToneHabitChannelStatusStrip.bindOnce) global.OneToneHabitChannelStatusStrip.bindOnce();
      if(global.OneToneHabitChannelStatusStrip.render){
        try{ global.OneToneHabitChannelStatusStrip.render(); }catch(_){}
      }
    }
    syncRecordButtons();
    if(global.OneToneImePresets) global.OneToneImePresets.refresh('mapping');
    if(global.OneToneKeysChannelCommandPicker){
      if(global.OneToneKeysChannelCommandPicker.init){
        try{ global.OneToneKeysChannelCommandPicker.init(); }catch(_){}
      }else if(global.OneToneKeysChannelCommandPicker.refresh){
        try{ global.OneToneKeysChannelCommandPicker.refresh(); }catch(_){}
      }
    }
    renderRecordingFeedback();
    if(global.OneToneMappingCore&&global.OneToneMappingCore.renderConflictBanner){
      global.OneToneMappingCore.renderConflictBanner();
    }
    if(global.OneToneKeysPageNav&&global.OneToneKeysPageNav.render){
      global.OneToneKeysPageNav.render(m);
    }
  }

  function renderGestureUiOnly(){
    if(!keysPanelActive()) return;
    var m=core()&&core().selected?core().selected():null;
    renderTriggerModeSegments(m);
    renderTriggerConflict(m);
    renderSchemeSummary(m);
    renderFlowStatusBar(m);
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
    var addChip=$('btnKeysHabitStripAdd');
    if(addChip){
      addChip.addEventListener('click',function(e){
        e.preventDefault();
        e.stopPropagation();
        addScheme();
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
        var padMapBtn=e.target.closest&&e.target.closest('[data-pad-map-key]');
        if(padMapBtn){
          e.__vpKeysPanelHandled=true;
          e.preventDefault();
          e.stopPropagation();
          var microId=padMapBtn.getAttribute('data-pad-map-key')||'';
          var Pad=global.OneToneCodexMicroPadUi;
          var mapM=core()&&core().selected?core().selected():null;
          if(microId&&mapM&&Pad&&Pad.openEditKeycap) Pad.openEditKeycap(mapM,microId);
          return;
        }
        var schemeSelect=e.target.closest&&e.target.closest('[data-scheme-select]');
        if(schemeSelect){
          e.__vpKeysPanelHandled=true;
          e.preventDefault();
          switchActiveScheme(schemeSelect.getAttribute('data-scheme-select')||'');
          return;
        }
        var addTriggerBtn=e.target.closest&&e.target.closest('[data-hub-add-trigger]');
        if(addTriggerBtn){
          e.__vpKeysPanelHandled=true;
          e.preventDefault();
          addTriggerVariant(addTriggerBtn.getAttribute('data-hub-add-trigger')||'');
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
    applyRecordingHighlightHosts:applyRecordingHighlightHosts,
    renderAppContext:renderAppContext,
    renderHabitStrip:renderHabitStrip,
    renderAppContextStrip:renderHabitStrip,
    shouldShowHabitStrip:shouldShowHabitStrip,
    renderTriggerContextBadge:renderTriggerContextBadge,
    renderImePill:renderImePill,
    renderKeysHub:renderKeysHub,
    renderGestureUiOnly:renderGestureUiOnly,
    renameScheme:renameScheme,
    renderWorkflowOverview:renderWorkflowOverview,
    renderWorkflowTemplates:renderWorkflowTemplates,
    switchActiveScheme:switchActiveScheme,
    renderSchemeSummary:renderSchemeSummary,
    renderTestProgress:renderTestProgress,
    isEditorDirty:isEditorDirty,
    saveCurrentScheme:saveCurrentScheme,
    persistEditorIfDirty:persistEditorIfDirty,
    keysPanelActive:keysPanelActive,
    previewKeyConflict:previewKeyConflict,
    testOnceTop:testOnceTop,
    addScheme:addScheme,
    addTriggerVariant:addTriggerVariant,
    toggleMappingEnable:toggleMappingEnable,
    buildKeysStatusProps:buildKeysStatusProps,
    workflowTabView:workflowTabView,
    buildKeysWorkflowTabsModel:buildKeysWorkflowTabsModel,
    // P12b-6：启动手势分段宿主模型（单一来源）
    buildKeysTriggerModeModel:buildKeysTriggerModeModel,
    // P12b-8：启动键冲突提示
    buildKeysTriggerConflictModel:buildKeysTriggerConflictModel,
    // P12c-3：录制反馈
    buildKeysRecordingFeedbackModel:buildKeysRecordingFeedbackModel,
    // P12c-4：方案列表
    buildKeysHubSchemeListModel:buildKeysHubSchemeListModel,
    // P12c-5：应用上下文 chips
    buildKeysAppContextStripModel:buildKeysAppContextStripModel
  };
  global.__otKeysStatusRead=function(){
    var m=core()&&core().selected?core().selected():null;
    return buildKeysStatusProps(m);
  };
})((typeof window!=='undefined')?window:globalThis);
