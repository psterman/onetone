(function(global){
  'use strict';

  var $=function(id){ return global.OneToneDom.$(id); };
  var t=function(key){ return global.OneToneI18n.t(key); };
  function state(){ return global.OneToneState.state; }
  function core(){ return global.OneToneMappingCore; }
  function flowSummary(){ return global.OneToneSceneFlowSummary; }
  function keysPanelVisible(){
    var panel=$('settingsPanelKeys');
    return !!(panel && !panel.hidden);
  }

  function keysPanelActive(){
    var drawer=global.OneToneSettingsDrawer;
    if(drawer&&drawer.isKeysPanel&&drawer.isKeysPanel()) return true;
    return keysPanelVisible();
  }

  var activeAppContextId='';
  var keysExpandedAppId='';

  function getKeysExpandedAppId(){
    var ed=global.OneToneMappingEditorState;
    if(ed&&ed.getKeysExpandedAppId) return ed.getKeysExpandedAppId();
    return keysExpandedAppId;
  }

  function setKeysExpandedAppId(appId){
    keysExpandedAppId=appId||'';
    var ed=global.OneToneMappingEditorState;
    if(ed&&ed.setKeysExpandedAppId) ed.setKeysExpandedAppId(keysExpandedAppId);
  }

  var BEHAVIOR_PRESETS=[
    {id:'cursor-chat',defaultMode:'perpress',noteKey:'habitAppRuleNoteCursor',nameKey:'habitAppRuleAppCursor'},
    {id:'codex-chat',defaultMode:'confirm',noteKey:'habitAppRuleNoteCodex',nameKey:'habitAppRuleAppCodex'},
    {id:'claude-code',defaultMode:'manual',noteKey:'habitAppRuleNoteClaude',nameKey:'habitAppRuleAppClaude'},
    {id:'minimax-chat',defaultMode:'perpress',noteKey:'habitAppRuleNoteMiniMax',nameKey:'habitAppRuleAppMiniMax'}
  ];

  var MODE_CYCLE=['perpress','confirm','manual'];

  function esc(s){
    return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');
  }

  function ensureRules(m){
    if(!m) return;
    if(!Array.isArray(m.appBehaviorRules)) m.appBehaviorRules=[];
  }

  function presetMeta(appId){
    return BEHAVIOR_PRESETS.find(function(p){ return p.id===appId; })||null;
  }

  function presetById(id){
    if(!global.OneToneAppTargetPresets) return null;
    if(global.OneToneAppTargetPresets.presetById) return global.OneToneAppTargetPresets.presetById(id);
    return (global.OneToneAppTargetPresets.presets||[]).find(function(p){ return p.id===id; })||null;
  }

  function iconForApp(appId){
    var p=presetById(appId);
    return p&&p.icon?p.icon:'';
  }

  function appDisplayName(appId){
    var meta=presetMeta(appId);
    if(meta&&meta.nameKey) return t(meta.nameKey);
    var p=presetById(appId);
    if(p&&p.nameKey) return t(p.nameKey);
    return appId||'—';
  }

  function defaultNoteForApp(appId){
    var meta=presetMeta(appId);
    return meta&&meta.noteKey?t(meta.noteKey):'';
  }

  function defaultModeForApp(appId){
    var meta=presetMeta(appId);
    return meta?meta.defaultMode:'confirm';
  }

  function finishModeLabel(mode){
    if(mode==='perpress') return t('habitFinishModeAuto');
    if(mode==='confirm') return t('habitFinishModeConfirmSend');
    if(mode==='manual') return t('habitFinishModeManual');
    return t('habitFinishModeManual');
  }

  function finishModeKbd(mode){
    if(mode==='perpress') return t('habitWorkflowAuto');
    if(mode==='confirm') return t('habitFinishModeConfirmSend');
    if(mode==='manual') return t('habitWorkflowManual');
    return t('habitWorkflowManual');
  }

  function friendlyKbd(key){
    key=String(key||'').trim();
    if(!key||key==='—') return '—';
    var hooks=global.__vp_bootstrap_hooks__||{};
    if(hooks.friendlyKeyName) return hooks.friendlyKeyName(key)||key;
    return key;
  }

  function finishModeClass(mode){
    if(mode==='perpress') return 'is-auto';
    if(mode==='confirm') return 'is-confirm';
    return 'is-manual';
  }

  function appTargetApi(){
    return global.OneToneAppTargetPresets||null;
  }

  function isPrimaryApp(m,appId){
    return !!(m&&String(m.appTargetId||'')===appId);
  }

  function hasRustWorkflow(appId){
    var atp=appTargetApi();
    return !!(atp&&atp.isWorkflowAppTarget&&atp.isWorkflowAppTarget(appId));
  }

  function appOpenShortcut(appId,m){
    var atp=appTargetApi();
    var preset=presetById(appId);
    var key='';
    if(atp&&atp.shortcutDisplayForMapping){
      key=atp.shortcutDisplayForMapping(appId);
    }
    if(!key&&preset&&preset.targetKey) key=preset.targetKey;
    if(!key&&m&&isPrimaryApp(m,appId)&&core()){
      key=core().editorTarget?core().editorTarget(m):(m.targetKey||'');
    }
    return String(key||'').trim();
  }

  function globalVoiceShortcut(){
    var st=state();
    var cfg=st&&st.config;
    if(!cfg) return '';
    var vosk=(cfg.voiceVosk||{}).targetKey||'';
    var sapi=(cfg.voiceSapi||{}).targetKey||'';
    return String(vosk||sapi||'').trim();
  }

  function formatShortcutHtml(key){
    key=String(key||'').trim();
    if(!key) return '<span class="habit-app-scenario-shortcut-empty">'+esc(t('habitAppRuleShortcutUnset'))+'</span>';
    return key.split('+').map(function(part){
      return '<kbd class="habit-kbd">'+esc(part.trim())+'</kbd>';
    }).join('<span class="habit-kbd-plus" aria-hidden="true">+</span>');
  }

  var WORKFLOW_ICON_CLASS=['step-switch','step-focus','step-voice','step-finish'];

  function workflowStepRow(num,title,desc,detail,on){
    var iconCls=WORKFLOW_ICON_CLASS[num-1]||'';
    return '<li class="habit-app-workflow-step'+(on?' is-on':' is-off')+'">'
      +'<span class="habit-app-workflow-step-num" aria-hidden="true">'+num+'</span>'
      +'<div class="habit-app-workflow-step-icon habit-app-workflow-step-icon--'+iconCls+'" aria-hidden="true"></div>'
      +'<div class="habit-app-workflow-step-body">'
      +'<strong class="habit-app-workflow-step-title">'+esc(title)+'</strong>'
      +'<span class="habit-app-workflow-step-desc">'+esc(desc)+'</span>'
      +(detail?'<span class="habit-app-workflow-step-detail">'+detail+'</span>':'')
      +'</div>'
      +'<span class="habit-app-workflow-step-status">'+(on?esc(t('habitWorkflowStepOn')):esc(t('habitWorkflowStepOff')))+'</span>'
      +'</li>';
  }

  function renderWorkflowTimeline(m,presetId,mode,opts){
    opts=opts||{};
    var openKey=appOpenShortcut(presetId,m);
    var voiceKey=globalVoiceShortcut();
    var workflow=hasRustWorkflow(presetId);
    var finishDetail='<span class="habit-app-workflow-step-kbd">'+esc(finishModeLabel(mode))+'</span>';
    var html='<div class="habit-app-workflow'+(opts.compact?' is-compact':'')+'">';
    if(!opts.compact){
      html+='<div class="habit-app-workflow-head">';
      html+='<h5 class="habit-app-workflow-title">'+esc(t('habitWorkflowTitle'))+'</h5>';
      html+='<p class="habit-app-workflow-desc">'+esc(t('habitWorkflowDesc'))+'</p>';
      html+='</div>';
    }
    html+='<ol class="habit-app-workflow-steps">';
    html+=workflowStepRow(1,t('habitWorkflowStepSwitch'),t('habitWorkflowStepSwitchDesc'),'',workflow);
    html+=workflowStepRow(2,t('habitWorkflowStepFocus'),t('habitWorkflowStepFocusDesc'),formatShortcutHtml(openKey),!!openKey);
    html+=workflowStepRow(3,t('habitWorkflowStepVoice'),t('habitWorkflowStepVoiceDesc'),formatShortcutHtml(voiceKey),!!voiceKey);
    html+=workflowStepRow(4,t('habitWorkflowStepFinish'),t('habitWorkflowStepFinishDesc'),finishDetail,true);
    html+='</ol>';
    if(!opts.compact){
      html+='<div class="habit-app-workflow-finish">';
      html+='<span class="habit-app-rule-section-label">'+esc(t('habitAppRulesPickFinish'))+'</span>';
      html+='<div class="habit-app-rule-pills" role="radiogroup" aria-label="'+esc(t('habitAppRulesPickFinish'))+'">';
      MODE_CYCLE.forEach(function(modeOpt){
        var on=mode===modeOpt;
        html+='<button type="button" class="habit-app-rule-pill'+(on?' is-active':'')+' '+finishModeClass(modeOpt)+'" data-app-rule-pill="'+esc(presetId)+'" data-finish-mode="'+modeOpt+'" role="radio" aria-checked="'+(on?'true':'false')+'">'+esc(finishModeLabel(modeOpt))+'</button>';
      });
      html+='</div></div>';
    }
    html+='<button type="button" class="habit-app-workflow-edit" data-app-workflow-edit="'+esc(presetId)+'">'+esc(t('habitWorkflowEdit'))+'</button>';
    html+='</div>';
    return html;
  }

  function renderKeysAppExpandFacts(m,presetId,mode){
    var openKey=appOpenShortcut(presetId,m);
    var html='<div class="keys-app-expand-facts">';
    if(openKey){
      html+='<p class="keys-app-expand-fact"><span class="keys-app-expand-fact-lbl">'+esc(t('keysAppExpandOpenLbl'))+'</span> <strong>'+esc(friendlyKbd(openKey))+'</strong></p>';
    }else{
      html+='<p class="keys-app-expand-fact is-muted">'+esc(t('keysAppExpandOpenUnset'))+'</p>';
    }
    html+='<p class="keys-app-expand-fact"><span class="keys-app-expand-fact-lbl">'+esc(t('keysAppExpandFinish'))+'</span> <strong>'+esc(finishModeLabel(mode))+'</strong></p>';
    html+='<p class="keys-app-expand-hint-inline">'+esc(t('keysAppPriorityHint'))+'</p>';
    html+='</div>';
    html+='<button type="button" class="keys-app-expand-edit-link habit-app-workflow-edit" data-app-workflow-edit="'+esc(presetId)+'">'+esc(t('habitWorkflowEdit'))+' →</button>';
    return html;
  }

  function renderKeysExpandableRow(m,preset){
    var isPrimary=isPrimaryApp(m,preset.id);
    var expanded=getKeysExpandedAppId()===preset.id||activeAppContextId===preset.id;
    var rule=ruleForApp(m,preset.id);
    var mode=rule?(rule.finishMode||preset.defaultMode):preset.defaultMode;
    var icon=iconForApp(preset.id);
    var openKey=appOpenShortcut(preset.id,m);
    var meta=isPrimary
      ?t('keysAppExpandMetaPrimaryFinish').replace('{finish}',finishModeLabel(mode))
      :(openKey?t('keysAppExpandMetaOpen').replace('{key}',friendlyKbd(openKey)):t('keysAppExpandMetaUnset'));
    var html='<div class="keys-app-expand-wrap'+(isPrimary?' is-primary':'')+(activeAppContextId===preset.id?' is-preview':'')+'" data-app-rule="'+esc(preset.id)+'" data-app-id="'+esc(preset.id)+'">';
    html+='<div class="keys-app-expand-head">';
    html+='<details class="keys-app-expand-row'+(expanded?' is-open':'')+'" data-app-id="'+esc(preset.id)+'"'+(expanded?' open':'')+'>';
    html+='<summary class="keys-app-expand-summary">';
    html+='<div class="keys-app-shortcut-main keys-app-expand-summary-main">';
    if(icon){
      html+='<img class="keys-app-shortcut-icon" src="'+esc(icon)+'" alt="" decoding="async" />';
    }else{
      html+='<span class="keys-app-shortcut-icon keys-app-shortcut-icon--fallback" aria-hidden="true">'+esc(appDisplayName(preset.id).charAt(0))+'</span>';
    }
    html+='<span><span class="keys-app-shortcut-name">'+esc(appDisplayName(preset.id))+'</span>';
    html+='<span class="keys-app-expand-meta">'+esc(meta)+'</span></span>';
    html+='</div>';
    html+='</summary>';
    html+='<div class="keys-app-expand-body">';
    html+='<div class="keys-workflow-expand">';
    html+=renderKeysAppExpandFacts(m,preset.id,mode);
    html+=renderSummonPhraseEditor(m,preset.id);
    html+='</div>';
    html+='</div></details>';
    html+='<button type="button" class="keys-app-rule-toggle keys-app-expand-toggle'+(isPrimary?' is-on':'')+'" data-app-rule-toggle="'+esc(preset.id)+'" data-is-on="'+(isPrimary?'true':'false')+'" role="switch" aria-checked="'+(isPrimary?'true':'false')+'" aria-label="'+esc(t('keysAppRuleToggle'))+'"></button>';
    html+='</div></div>';
    return html;
  }

  function renderCompactShortcutRow(m,preset){
    var openKey=appOpenShortcut(preset.id,m);
    var isPrimary=isPrimaryApp(m,preset.id);
    var icon=iconForApp(preset.id);
    var html='<article class="keys-app-shortcut-row'+(isPrimary?' is-primary':'')+'" data-app-rule="'+esc(preset.id)+'" data-app-id="'+esc(preset.id)+'">';
    html+='<div class="keys-app-shortcut-main">';
    if(icon){
      html+='<img class="keys-app-shortcut-icon" src="'+esc(icon)+'" alt="" decoding="async" />';
    }else{
      html+='<span class="keys-app-shortcut-icon keys-app-shortcut-icon--fallback" aria-hidden="true">'+esc(appDisplayName(preset.id).charAt(0))+'</span>';
    }
    html+='<span class="keys-app-shortcut-name">'+esc(appDisplayName(preset.id))+'</span>';
    html+='<span class="keys-app-shortcut-kbd">'+formatShortcutHtml(openKey)+'</span>';
    html+='</div><div class="keys-app-shortcut-actions">';
    if(isPrimary){
      html+='<button type="button" class="keys-app-shortcut-btn is-muted" data-app-rule-primary-clear="'+esc(preset.id)+'">'+esc(t('habitAppRulePrimaryClear'))+'</button>';
    }else if(openKey){
      html+='<button type="button" class="keys-app-shortcut-btn is-primary" data-app-rule-primary="'+esc(preset.id)+'">'+esc(t('habitAppRulePrimarySet'))+'</button>';
    }else{
      html+='<button type="button" class="keys-app-shortcut-btn" data-app-rule-edit="'+esc(preset.id)+'">'+esc(t('habitAppRuleEdit'))+'</button>';
    }
    html+='<button type="button" class="keys-app-shortcut-menu" data-app-rule-menu="'+esc(preset.id)+'" aria-label="'+esc(t('habitAppRulesPickApp'))+'">⋯</button>';
    html+='</div></article>';
    return html;
  }

  function renderKeysAside(){
    var aside=$('keysPanelAside');
    var shortcutsCard=$('keysAppShortcutsCard');
    var keysActive=keysPanelActive();
    if(aside) aside.hidden=!keysActive;
    if(shortcutsCard) shortcutsCard.hidden=true;
    if(!keysActive) return;
    var kpu=global.OneToneKeysPanelUi;
    if(kpu&&kpu.renderAppContextStrip) kpu.renderAppContextStrip();
  }

  function renderScenarioCard(m,preset){
    var rule=ruleForApp(m,preset.id);
    var active=!!rule;
    var mode=active?(rule.finishMode||preset.defaultMode):preset.defaultMode;
    var icon=iconForApp(preset.id);
    var isPrimary=isPrimaryApp(m,preset.id);
    var openKey=appOpenShortcut(preset.id,m);
    var html='<article class="habit-app-scenario-card'+(isPrimary?' is-primary':'')+(activeAppContextId===preset.id?' is-preview':'')+'" data-app-id="'+esc(preset.id)+'" data-app-rule="'+esc(preset.id)+'">';
    html+='<div class="habit-app-scenario-head">';
    if(icon){
      html+='<img class="habit-app-scenario-icon" src="'+esc(icon)+'" alt="" decoding="async" />';
    }else{
      html+='<span class="habit-app-scenario-icon habit-app-scenario-icon--fallback" aria-hidden="true">'+esc(appDisplayName(preset.id).charAt(0))+'</span>';
    }
    html+='<div class="habit-app-scenario-main">';
    html+='<div class="habit-app-scenario-name-row">';
    html+='<h4 class="habit-app-scenario-name">'+esc(appDisplayName(preset.id))+'</h4>';
    if(isPrimary) html+='<span class="habit-app-scenario-badge">'+esc(t('habitAppRulePrimaryOn'))+'</span>';
    html+='</div>';
    html+='<div class="habit-app-scenario-shortcut">'+formatShortcutHtml(openKey)+'</div>';
    html+='</div>';
    html+='<div class="habit-app-scenario-actions">';
    if(isPrimary){
      html+='<button type="button" class="habit-app-scenario-btn is-muted" data-app-rule-primary-clear="'+esc(preset.id)+'">'+esc(t('habitAppRulePrimaryClear'))+'</button>';
    }else if(openKey){
      html+='<button type="button" class="habit-app-scenario-btn is-primary" data-app-rule-primary="'+esc(preset.id)+'">'+esc(t('habitAppRulePrimarySet'))+'</button>';
    }else{
      html+='<button type="button" class="habit-app-scenario-btn" data-app-rule-edit="'+esc(preset.id)+'">'+esc(t('habitAppRuleEdit'))+'</button>';
    }
    html+='<button type="button" class="habit-app-scenario-menu" data-app-rule-menu="'+esc(preset.id)+'" aria-label="'+esc(t('habitAppRulesPickApp'))+'">⋯</button>';
    html+='</div></div>';
    if(isPrimary) html+=renderWorkflowTimeline(m,preset.id,mode);
    html+='</article>';
    return html;
  }

  function renderActiveScenarioBanner(){
    var wrap=$('habitActiveScenario');
    var nameEl=$('habitActiveScenarioName');
    var labelEl=$('habitActiveScenarioLabel');
    var hintEl=$('habitActiveScenarioHint');
    if(labelEl) labelEl.textContent=t('habitActiveScenarioLabel');
    if(hintEl) hintEl.textContent=t('habitActiveScenarioHint');
    var m=core()&&core().selected?core().selected():null;
    var appId=m&&String(m.appTargetId||'').trim();
    if(!wrap) return;
    if(!m||!core().isSaved(m)||!appId){
      wrap.hidden=true;
      if(nameEl) nameEl.textContent=t('habitActiveScenarioEmpty');
      return;
    }
    wrap.hidden=false;
    if(nameEl) nameEl.textContent=appDisplayName(appId);
  }

  function setActiveAppContextId(appId){
    activeAppContextId=appId||'';
    var ed=global.OneToneMappingEditorState;
    if(ed&&ed.setEditorActiveAppContextId) ed.setEditorActiveAppContextId(activeAppContextId);
    var m=core()&&core().selected?core().selected():null;
    var fs=flowSummary();
    if(fs&&fs.syncFlowSummary) fs.syncFlowSummary(m,{context:'settings',activeAppContextId:activeAppContextId});
    var list=$('habitAppRulesList');
    if(list){
      list.querySelectorAll('.habit-app-scenario-card').forEach(function(card){
        card.classList.toggle('is-preview',!!activeAppContextId&&card.dataset.appId===activeAppContextId);
      });
    }
    var keysList=$('keysAppRulesList');
    if(keysList){
      keysList.querySelectorAll('.keys-app-expand-row').forEach(function(row){
        row.classList.toggle('is-preview',!!activeAppContextId&&row.dataset.appId===activeAppContextId);
        if(activeAppContextId&&row.dataset.appId===activeAppContextId&&!row.open) row.open=true;
      });
    }
    if(activeAppContextId) setKeysExpandedAppId(activeAppContextId);
    var kpu=global.OneToneKeysPanelUi;
    if(kpu){
      if(kpu.renderAppContextStrip) kpu.renderAppContextStrip();
      if(kpu.renderTriggerContextBadge) kpu.renderTriggerContextBadge();
      if(kpu.renderAppContext) kpu.renderAppContext();
    }
    var kfr=global.OneToneKeyFinishFlowRender;
    if(kfr&&kfr.refreshFinishModeSegment) kfr.refreshFinishModeSegment(m);
    if(global.OneToneHabitKeyMappingTable) global.OneToneHabitKeyMappingTable.syncRowStatus();
  }

  function selectAppContext(appId){
    if(!appId) return;
    setKeysExpandedAppId(appId);
    setActiveAppContextId(appId);
    var row=document.querySelector('.keys-app-expand-row[data-app-id="'+appId+'"]');
    if(row&&!row.open) row.open=true;
  }

  function ruleForApp(m,appId){
    ensureRules(m);
    return m.appBehaviorRules.find(function(r){ return r.appId===appId; })||null;
  }

  function saveAndRefresh(){
    if(global.OneToneConfigPersist) global.OneToneConfigPersist.save();
    renderAppBehaviorRules();
    if(global.OneToneSceneTabs&&global.OneToneSceneTabs.renderHero) global.OneToneSceneTabs.renderHero();
    if(global.OneToneKeyFinishFlowRender) global.OneToneKeyFinishFlowRender.renderKeyFinishFlowPanel();
    if(global.OneToneHabitCompatibility) global.OneToneHabitCompatibility.render();
    if(global.OneToneSceneVoiceTab&&global.OneToneSceneVoiceTab.render) global.OneToneSceneVoiceTab.render();
    if(global.OneToneHomeV9&&global.OneToneHomeV9.render) global.OneToneHomeV9.render();
    if(hooks().scheduleRenderHomeLiveZone) hooks().scheduleRenderHomeLiveZone();
  }

  function seedDefaultBehaviorRules(m){
    ensureRules(m);
    if(m.appBehaviorRules.length) return false;
    BEHAVIOR_PRESETS.forEach(function(p){
      m.appBehaviorRules.push({
        appId:p.id,
        finishMode:p.defaultMode,
        note:defaultNoteForApp(p.id)
      });
    });
    return true;
  }

  function resolveGlobalFinishMode(m){
    var fs=flowSummary();
    return fs&&fs.resolveFinishMode?fs.resolveFinishMode(m):defaultModeForApp('');
  }

  function ensurePrimaryAppRule(m,appId){
    if(!m||!appId) return false;
    ensureRules(m);
    if(ruleForApp(m,appId)) return false;
    m.appBehaviorRules.push({
      appId:appId,
      finishMode:resolveGlobalFinishMode(m),
      note:defaultNoteForApp(appId)
    });
    return true;
  }

  function ensureRulesBeforeSave(m){
    if(!m) return;
    ensureRules(m);
    var primary=String(m.appTargetId||'').trim();
    if(primary) ensurePrimaryAppRule(m,primary);
    if(!m.appBehaviorRules.length) seedDefaultBehaviorRules(m);
  }

  function refreshFinishModeUi(m){
    if(global.OneToneKeyFinishFlowRender){
      if(global.OneToneKeyFinishFlowRender.refreshFinishModeSegment) global.OneToneKeyFinishFlowRender.refreshFinishModeSegment(m);
      else if(global.OneToneKeyFinishFlowRender.renderKeyFinishFlowPanel) global.OneToneKeyFinishFlowRender.renderKeyFinishFlowPanel();
    }
    renderKeysAside();
    renderActiveScenarioBanner();
    if(global.OneToneKeysPanelUi){
      if(global.OneToneKeysPanelUi.renderAppContext) global.OneToneKeysPanelUi.renderAppContext();
      if(global.OneToneKeysPanelUi.renderTriggerContextBadge) global.OneToneKeysPanelUi.renderTriggerContextBadge();
    }
    if(global.OneToneHabitKeyMappingTable) global.OneToneHabitKeyMappingTable.syncRowStatus();
  }

  function saveFinishModeChange(m){
    if(global.OneToneConfigPersist) global.OneToneConfigPersist.save();
    refreshFinishModeUi(m);
    if(global.OneToneSceneTabs&&global.OneToneSceneTabs.renderHero) global.OneToneSceneTabs.renderHero();
    if(global.OneToneHabitCompatibility) global.OneToneHabitCompatibility.render();
  }

  function upsertRule(m,appId,finishMode,note){
    ensureRules(m);
    var existing=ruleForApp(m,appId);
    if(existing){
      existing.finishMode=finishMode;
      if(note!==undefined) existing.note=note;
    }else{
      m.appBehaviorRules.push({appId:appId,finishMode:finishMode,note:note||defaultNoteForApp(appId)});
    }
    if(keysPanelActive()) saveFinishModeChange(m);
    else saveAndRefresh();
  }

  function setAppFinishMode(m,appId,mode){
    if(!m||!appId||!mode) return;
    var rule=ruleForApp(m,appId);
    upsertRule(m,appId,mode,rule&&rule.note||defaultNoteForApp(appId));
  }

  function removeRule(m,appId){
    ensureRules(m);
    m.appBehaviorRules=m.appBehaviorRules.filter(function(r){ return r.appId!==appId; });
    if(activeAppContextId===appId) setActiveAppContextId('');
    saveAndRefresh();
  }

  function cycleFinishMode(current){
    var idx=MODE_CYCLE.indexOf(current);
    if(idx<0) return MODE_CYCLE[0];
    return MODE_CYCLE[(idx+1)%MODE_CYCLE.length];
  }

  function renderAppBehaviorRules(){
    var list=$('habitAppRulesList');
    var addBtn=$('btnAddAppRule');
    if(!list) return;
    var m=core()&&core().selected?core().selected():null;
    if(!m||!core().isSaved(m)){
      list.innerHTML='<p class="habit-app-rules-empty">'+esc(t('habitAppRulesEmpty'))+'</p>';
      if(addBtn) addBtn.hidden=true;
      return;
    }
    seedDefaultBehaviorRules(m);
    ensureRules(m);
    if(addBtn){
      addBtn.hidden=false;
      addBtn.textContent='+ '+t('habitAppShortcutsAdd');
      addBtn.disabled=true;
      addBtn.title=t('habitAppRulesEmpty');
    }
    var shortcutsTitle=$('habitAppShortcutsTitle');
    var shortcutsDesc=$('habitAppShortcutsDesc');
    if(shortcutsTitle) shortcutsTitle.textContent=t('habitAppShortcutsTitle');
    if(shortcutsDesc) shortcutsDesc.textContent=t('habitAppShortcutsDesc');
    var html='';
    BEHAVIOR_PRESETS.forEach(function(preset){
      html+=renderScenarioCard(m,preset);
    });
    list.innerHTML=html;
    renderActiveScenarioBanner();
    renderKeysAside();
    renderVoiceAside();
  }

  function handleAppRulesListClick(e){
    var toggleBtn=e.target.closest&&e.target.closest('.keys-app-rule-toggle');
    if(toggleBtn){
      e.preventDefault();
      e.stopPropagation();
      var atpToggle=appTargetApi();
      var isOn=toggleBtn.dataset.isOn==='true';
      if(isOn){
        if(atpToggle&&atpToggle.clearPrimaryForMapping) atpToggle.clearPrimaryForMapping();
      }else if(atpToggle&&atpToggle.setPrimaryForMapping){
        atpToggle.setPrimaryForMapping(toggleBtn.dataset.appRuleToggle);
      }
      return true;
    }
    var summonSave=e.target.closest&&e.target.closest('[data-summon-save]');
    if(summonSave){
      e.preventDefault();
      e.stopPropagation();
      var mSummon=core()&&core().selected?core().selected():null;
      if(!mSummon) return true;
      var appIdSummon=summonSave.getAttribute('data-summon-save')||'';
      var input=summonSave.closest('[data-summon-edit]');
      input=input&&input.querySelector('[data-summon-input="'+appIdSummon+'"]');
      if(!input) input=document.querySelector('[data-summon-input="'+appIdSummon+'"]');
      saveSummonPhrase(mSummon,appIdSummon,input?input.value:'');
      return true;
    }
    var editBtn=e.target.closest&&e.target.closest('[data-app-rule-edit]');
    if(editBtn){
      e.stopPropagation();
      var atp=appTargetApi();
      if(atp&&atp.setPrimaryForMapping) atp.setPrimaryForMapping(editBtn.dataset.appRuleEdit);
      return true;
    }
    var workflowEdit=e.target.closest&&e.target.closest('[data-app-workflow-edit]');
    if(workflowEdit){
      e.stopPropagation();
      var card=workflowEdit.closest('.habit-app-scenario-card');
      var finish=card&&card.querySelector('.habit-app-workflow-finish');
      if(finish) finish.scrollIntoView({behavior:'smooth',block:'nearest'});
      return true;
    }
    var menuBtn=e.target.closest&&e.target.closest('[data-app-rule-menu]');
    if(menuBtn){
      e.stopPropagation();
      return true;
    }
    var pillBtn=e.target.closest&&e.target.closest('[data-app-rule-pill]');
    if(pillBtn){
      e.preventDefault();
      e.stopPropagation();
      var m3=core()&&core().selected?core().selected():null;
      if(!m3) return true;
      var appId3=pillBtn.dataset.appRulePill;
      var mode3=pillBtn.dataset.finishMode;
      if(!mode3) return true;
      var rule3=ruleForApp(m3,appId3);
      upsertRule(m3,appId3,mode3,rule3&&rule3.note||defaultNoteForApp(appId3));
      return true;
    }
    var primarySet=e.target.closest&&e.target.closest('[data-app-rule-primary]');
    if(primarySet){
      e.stopPropagation();
      var atp=appTargetApi();
      if(atp&&atp.setPrimaryForMapping) atp.setPrimaryForMapping(primarySet.dataset.appRulePrimary);
      return true;
    }
    var primaryClear=e.target.closest&&e.target.closest('[data-app-rule-primary-clear]');
    if(primaryClear){
      e.stopPropagation();
      var atp2=appTargetApi();
      if(atp2&&atp2.clearPrimaryForMapping) atp2.clearPrimaryForMapping();
      return true;
    }
    var card=e.target.closest&&e.target.closest('[data-app-rule]');
    if(card&&!e.target.closest('button,input,textarea,select,summary,.keys-flow-horizontal,.keys-workflow-expand,[data-summon-edit]')){
      var appId=card.dataset.appId;
      if(card.classList&&card.classList.contains('keys-app-expand-wrap')){
        var details=card.querySelector('.keys-app-expand-row');
        if(details){
          details.open=true;
          setKeysExpandedAppId(appId);
        }
      }else if(card.classList&&card.classList.contains('keys-app-expand-row')){
        setKeysExpandedAppId(appId);
      }
      setActiveAppContextId(appId);
      e.stopPropagation();
      return true;
    }
    return false;
  }

  function bindAppRulesList(list,opts){
    opts=opts||{};
    if(!list||list.dataset.appRulesBound==='1') return;
    list.dataset.appRulesBound='1';
    list.addEventListener('click',handleAppRulesListClick,true);
    if(opts.hoverPreview!==false){
      list.addEventListener('mouseenter',function(e){
        var card=e.target.closest&&e.target.closest('[data-app-rule]');
        if(card) setActiveAppContextId(card.dataset.appId);
      },true);
      list.addEventListener('mouseleave',function(e){
        if(!list.contains(e.relatedTarget)) setActiveAppContextId('');
      });
    }
  }

  function bindKeysAsideEvents(list){
    if(!list) return;
    if(list.dataset.keysAsideBound!=='1'){
      list.dataset.keysAsideBound='1';
      list.addEventListener('toggle',function(e){
        var row=e.target;
        if(!row||!row.classList||!row.classList.contains('keys-app-expand-row')) return;
        if(row.open){
          list.querySelectorAll('.keys-app-expand-row').forEach(function(other){
            if(other!==row) other.open=false;
          });
          var appId=row.dataset.appId||'';
          setKeysExpandedAppId(appId);
          setActiveAppContextId(appId);
        }else if(getKeysExpandedAppId()===(row.dataset.appId||'')){
          setKeysExpandedAppId('');
        }
      },true);
      list.addEventListener('click',function(e){
        var workflowEdit=e.target.closest&&e.target.closest('[data-app-workflow-edit]');
        if(!workflowEdit) return;
        e.preventDefault();
        e.stopPropagation();
        var more=$('habitFlowFinishMore');
        if(more) more.open=true;
        var finishRow=$('habitKeyMapRowFinish');
        if(finishRow) finishRow.scrollIntoView({behavior:'smooth',block:'nearest'});
        if(global.OneToneHabitKeyMappingTable) global.OneToneHabitKeyMappingTable.highlightRow('finish');
      });
    }
    var addBtn=$('btnKeysAddAppRule');
    if(addBtn&&!addBtn.dataset.summonBound){
      addBtn.dataset.summonBound='1';
      addBtn.addEventListener('click',function(e){
        e.preventDefault();
        var first=list.querySelector('.keys-app-expand-row');
        if(first){
          first.open=true;
          setKeysExpandedAppId(first.dataset.appId||'');
          var input=first.querySelector('[data-summon-input]');
          if(input) input.focus();
        }
        hooks().toast&&hooks().toast(t('habitAppShortcutsAddHint'));
      });
    }
  }

  var VOICE_SUMMON_PHRASE_KEYS={
    'cursor-chat':'voiceAppSummonCursor',
    'codex-chat':'voiceAppSummonCodex',
    'claude-code':'voiceAppSummonClaude',
    'minimax-chat':'voiceAppSummonMiniMax'
  };

  function voiceSummonPhrase(appId,m){
    var rule=m?ruleForApp(m,appId):null;
    if(rule&&String(rule.summonPhrase||'').trim()) return String(rule.summonPhrase).trim();
    var cfg=global.OneToneState&&global.OneToneState.state?global.OneToneState.state.config||{}:{};
    var sc=global.OneToneSceneConfig;
    var preset=sc&&sc.effectiveVoskModelPreset&&m?sc.effectiveVoskModelPreset(cfg,m):'cn-light';
    if(sc&&sc.defaultSummonPhrase) return sc.defaultSummonPhrase(appId,{preset:preset})||'';
    var key=VOICE_SUMMON_PHRASE_KEYS[appId];
    return key?t(key):'';
  }

  function voiceSummonQuote(appId,m){
    var phrase=voiceSummonPhrase(appId,m);
    var m2=phrase.match(/[「「""][^」」""]+[」」""]/);
    return m2?m2[0]:phrase;
  }

  function saveSummonPhrase(m,appId,phrase){
    if(!m||!appId) return;
    ensureRules(m);
    var rule=ruleForApp(m,appId);
    phrase=String(phrase||'').trim();
    if(rule){
      rule.summonPhrase=phrase||undefined;
    }else{
      m.appBehaviorRules.push({
        appId:appId,
        finishMode:defaultModeForApp(appId),
        note:defaultNoteForApp(appId),
        summonPhrase:phrase||undefined
      });
    }
    saveAndRefresh();
    hooks().toast&&hooks().toast(t('habitAppSummonPhraseSaved'));
  }

  function hooks(){
    return global.__vp_bootstrap_hooks__||{};
  }

  function renderSummonPhraseEditor(m,presetId){
    var rule=ruleForApp(m,presetId);
    var value=rule&&rule.summonPhrase?String(rule.summonPhrase):'';
    if(!value) value=voiceSummonPhrase(presetId,m);
    var workflow=global.OneToneSceneConfig&&global.OneToneSceneConfig.isWorkflowAppTarget
      ?global.OneToneSceneConfig.isWorkflowAppTarget(presetId):false;
    var html='<div class="keys-app-summon-edit" data-summon-edit="'+esc(presetId)+'">';
    html+='<p class="keys-app-summon-edit-lbl">'+esc(t('habitAppSummonPhraseLbl'))+'</p>';
    html+='<div class="keys-app-summon-edit-row">';
    html+='<input type="text" class="keys-app-summon-edit-input" data-summon-input="'+esc(presetId)+'" value="'+esc(value)+'" maxlength="48" placeholder="'+esc(t('habitAppSummonPhrasePlaceholder'))+'" spellcheck="false" autocomplete="off" />';
    html+='<button type="button" class="keys-app-summon-edit-save" data-summon-save="'+esc(presetId)+'">'+esc(t('habitAppSummonPhraseSave'))+'</button>';
    html+='</div>';
    html+='<p class="keys-app-summon-edit-hint'+(workflow?' sr-only':'')+'">'+esc(workflow?t('habitAppSummonPhraseHint'):t('keysAppSummonNoWorkflowHint'))+'</p>';
    html+='</div>';
    return html;
  }

  function renderVoiceAppShortcutRow(m,preset){
    var isPrimary=isPrimaryApp(m,preset.id);
    var icon=iconForApp(preset.id);
    var openKey=appOpenShortcut(preset.id,m);
    var html='<article class="voice-summon-app voice-app-shortcut-row'+(isPrimary?' is-primary':'')+'" data-app-rule="'+esc(preset.id)+'" data-app-id="'+esc(preset.id)+'">';
    if(icon){
      html+='<img class="voice-summon-app-icon voice-app-shortcut-icon" src="'+esc(icon)+'" alt="" decoding="async" />';
    }else{
      html+='<span class="voice-summon-app-icon voice-summon-app-icon--fallback voice-app-shortcut-icon--fallback" aria-hidden="true">'+esc(appDisplayName(preset.id).charAt(0))+'</span>';
    }
    html+='<div class="voice-summon-app-info voice-app-shortcut-main">';
    html+='<div class="voice-summon-app-name voice-app-shortcut-name">'+esc(appDisplayName(preset.id))+'</div>';
    html+='<div class="voice-summon-app-phrase"><span class="voice-summon-quote voice-app-shortcut-phrase">'+esc(voiceSummonQuote(preset.id,m))+'</span></div>';
    if(openKey){
      html+='<div class="voice-summon-shortcuts voice-app-shortcut-kbd">'+formatShortcutHtml(openKey)+'</div>';
    }
    html+='</div>';
    html+='<button type="button" class="voice-summon-btn voice-app-shortcut-btn'+(isPrimary?' is-on':'')+'" data-voice-app-primary="'+esc(preset.id)+'">';
    html+=esc(isPrimary?t('voiceAppShortcutActive'):t('voiceAppShortcutUse'));
    html+='</button></article>';
    return html;
  }

  function renderVoiceAside(){
    var card=$('voiceAppShortcutsDetails');
    var uiState=global.OneToneState&&global.OneToneState.ui;
    var voiceActive=uiState&&uiState.drawerOpen&&uiState.settingsPanel==='voiceWake';
    if(card) card.hidden=true;
    if(!voiceActive) return;
  }

  function bindVoiceAsideEvents(list){
    if(!list||list.dataset.voiceAsideBound==='1') return;
    list.dataset.voiceAsideBound='1';
    list.addEventListener('click',function(e){
      var btn=e.target.closest&&e.target.closest('[data-voice-app-primary]');
      if(!btn) return;
      e.stopPropagation();
      var atp=appTargetApi();
      if(!atp) return;
      var appId=btn.getAttribute('data-voice-app-primary');
      if(isPrimaryApp(core().selected(),appId)){
        if(atp.clearPrimaryForMapping) atp.clearPrimaryForMapping();
      }else if(atp.setPrimaryForMapping){
        atp.setPrimaryForMapping(appId);
      }
      renderVoiceAside();
      if(global.OneToneVoiceSettingsFlow) global.OneToneVoiceSettingsFlow.render();
    });
  }

  function bindEvents(){
    bindAppRulesList($('habitAppRulesList'));
    bindKeysAsideEvents($('keysAppRulesList'));
    bindVoiceAsideEvents($('voiceAppShortcutsList'));
  }

  function resolveEffectiveFinish(m,appId){
    if(!m||!appId) return null;
    ensureRules(m);
    var rule=m.appBehaviorRules.find(function(r){ return r.appId===appId; });
    if(rule) return {mode:rule.finishMode,appName:appDisplayName(appId)};
    if(String(m.appTargetId||'')===appId){
      return {mode:resolveGlobalFinishMode(m),appName:appDisplayName(appId)};
    }
    return null;
  }

  global.OneToneAppBehaviorRules={
    render:renderAppBehaviorRules,
    bindEvents:bindEvents,
    handleListClick:handleAppRulesListClick,
    bindKeysAsideEvents:bindKeysAsideEvents,
    renderKeysAside:renderKeysAside,
    renderVoiceAside:renderVoiceAside,
    setActiveAppContextId:setActiveAppContextId,
    selectAppContext:selectAppContext,
    setKeysExpandedAppId:setKeysExpandedAppId,
    getKeysExpandedAppId:getKeysExpandedAppId,
    getActiveAppContextId:function(){ return activeAppContextId; },
    resolveEffectiveFinish:resolveEffectiveFinish,
    setAppFinishMode:setAppFinishMode,
    ensurePrimaryAppRule:ensurePrimaryAppRule,
    ensureRulesBeforeSave:ensureRulesBeforeSave,
    finishModeLabel:finishModeLabel,
    ensureRules:ensureRules,
    behaviorPresets:BEHAVIOR_PRESETS,
    renderActiveScenarioBanner:renderActiveScenarioBanner,
    appDisplayName:appDisplayName,
    voiceSummonPhrase:voiceSummonPhrase
  };
})((typeof window!=='undefined')?window:globalThis);
