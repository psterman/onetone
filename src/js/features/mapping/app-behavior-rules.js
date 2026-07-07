(function(global){
  'use strict';

  var $=function(id){ return global.OneToneDom.$(id); };
  var t=function(key){ return global.OneToneI18n.t(key); };
  function state(){ return global.OneToneState.state; }
  function core(){ return global.OneToneMappingCore; }
  function flowSummary(){ return global.OneToneSceneFlowSummary; }

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

  function renderFlowHorizontal(m,presetId,mode){
    var openKey=appOpenShortcut(presetId,m);
    var voiceKey=globalVoiceShortcut();
    var workflow=hasRustWorkflow(presetId);
    var steps=[
      {icon:'切',name:t('habitWorkflowHorizSwitch'),kbd:workflow?t('habitWorkflowAuto'):'—'},
      {icon:'聚',name:t('habitWorkflowHorizFocus'),kbd:friendlyKbd(openKey)},
      {icon:'麦',name:t('habitWorkflowHorizVoice'),kbd:friendlyKbd(voiceKey)},
      {icon:'发',name:t('habitWorkflowHorizFinish'),kbd:finishModeKbd(mode)}
    ];
    var html='<div class="keys-flow-horizontal" aria-label="'+esc(t('habitWorkflowTitle'))+'">';
    steps.forEach(function(step,i){
      if(i>0) html+='<span class="keys-flow-horizontal-arr" aria-hidden="true">→</span>';
      html+='<div class="keys-flow-horizontal-node">';
      html+='<span class="keys-flow-horizontal-icon" aria-hidden="true">'+esc(step.icon)+'</span>';
      html+='<span class="keys-flow-horizontal-name">'+esc(step.name)+'</span>';
      html+='<span class="keys-flow-horizontal-kbd">'+esc(String(step.kbd).replace(/<[^>]+>/g,''))+'</span>';
      html+='</div>';
    });
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
    var meta=isPrimary&&openKey
      ?t('keysAppExpandMetaSteps').replace('{n}','4')
      :t('keysAppExpandMetaUnset');
    var html='<details class="keys-app-expand-row'+(isPrimary?' is-primary':'')+(activeAppContextId===preset.id?' is-preview':'')+'" data-app-rule="'+esc(preset.id)+'" data-app-id="'+esc(preset.id)+'"'+(expanded?' open':'')+'>';
    html+='<summary class="keys-app-expand-summary">';
    html+='<div class="keys-app-shortcut-main keys-app-expand-summary-main">';
    if(icon){
      html+='<img class="keys-app-shortcut-icon" src="'+esc(icon)+'" alt="" decoding="async" />';
    }else{
      html+='<span class="keys-app-shortcut-icon keys-app-shortcut-icon--fallback" aria-hidden="true">'+esc(appDisplayName(preset.id).charAt(0))+'</span>';
    }
    html+='<span><span class="keys-app-shortcut-name">'+esc(appDisplayName(preset.id))+'</span>';
    html+='<span class="keys-app-expand-meta">'+esc(meta)+'</span></span>';
    html+='</div><div class="keys-app-shortcut-actions">';
    html+='<button type="button" class="keys-app-rule-toggle'+(isPrimary?' is-on':'')+'" data-app-rule-toggle="'+esc(preset.id)+'" data-is-on="'+(isPrimary?'true':'false')+'" role="switch" aria-checked="'+(isPrimary?'true':'false')+'" aria-label="'+esc(t('keysAppRuleToggle'))+'"></button>';
    html+='</div></summary>';
    html+='<div class="keys-app-expand-body">';
    html+='<div class="keys-workflow-expand">';
    html+='<p class="keys-workflow-chain-lbl">'+esc(t('habitWorkflowChainTitle'))+'</p>';
    html+=renderFlowHorizontal(m,preset.id,mode);
    html+='</div>';
    html+='</div></details>';
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
    var list=$('keysAppRulesList');
    var addBtn=$('btnKeysAddAppRule');
    var aside=$('keysPanelAside');
    var drawer=global.OneToneSettingsDrawer;
    var keysActive=drawer&&drawer.isKeysPanel&&drawer.isKeysPanel();
    if(aside) aside.hidden=!keysActive;
    if(!keysActive||!list) return;
    var m=core()&&core().selected?core().selected():null;
    if(!m||!core().isSaved(m)){
      list.innerHTML='<p class="habit-app-rules-empty">'+esc(t('habitAppRulesEmpty'))+'</p>';
      if(addBtn) addBtn.hidden=true;
      return;
    }
    if(seedDefaultBehaviorRules(m)){
      if(global.OneToneConfigPersist) global.OneToneConfigPersist.save();
    }
    ensureRules(m);
    var html='';
    BEHAVIOR_PRESETS.forEach(function(preset){
      html+=renderKeysExpandableRow(m,preset);
    });
    list.innerHTML=html;
    if(addBtn){
      addBtn.hidden=false;
      addBtn.textContent='+ '+t('habitAppShortcutsAdd');
      addBtn.disabled=true;
    }
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
    if(global.OneToneKeyFinishFlowRender) global.OneToneKeyFinishFlowRender.renderKeyFinishFlowPanel();
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

  function upsertRule(m,appId,finishMode,note){
    ensureRules(m);
    var existing=ruleForApp(m,appId);
    if(existing){
      existing.finishMode=finishMode;
      if(note!==undefined) existing.note=note;
    }else{
      m.appBehaviorRules.push({appId:appId,finishMode:finishMode,note:note||defaultNoteForApp(appId)});
    }
    saveAndRefresh();
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
    if(seedDefaultBehaviorRules(m)){
      if(global.OneToneConfigPersist) global.OneToneConfigPersist.save();
    }
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
    var editBtn=e.target.closest&&e.target.closest('[data-app-rule-edit]');
    if(editBtn){
      e.stopPropagation();
      var atp=appTargetApi();
      if(atp&&atp.setPrimaryForMapping) atp.setPrimaryForMapping(editBtn.dataset.appRuleEdit);
      return;
    }
    var workflowEdit=e.target.closest&&e.target.closest('[data-app-workflow-edit]');
    if(workflowEdit){
      e.stopPropagation();
      var card=workflowEdit.closest('.habit-app-scenario-card');
      var finish=card&&card.querySelector('.habit-app-workflow-finish');
      if(finish) finish.scrollIntoView({behavior:'smooth',block:'nearest'});
      return;
    }
    var menuBtn=e.target.closest&&e.target.closest('[data-app-rule-menu]');
    if(menuBtn){
      e.stopPropagation();
      return;
    }
    var toggle=e.target.closest&&e.target.closest('[data-app-rule-toggle]');
    if(toggle){
      e.preventDefault();
      e.stopPropagation();
      var atpToggle=appTargetApi();
      var isOn=toggle.dataset.isOn==='true';
      if(isOn){
        if(atpToggle&&atpToggle.clearPrimaryForMapping) atpToggle.clearPrimaryForMapping();
      }else if(atpToggle&&atpToggle.setPrimaryForMapping){
        atpToggle.setPrimaryForMapping(toggle.dataset.appRuleToggle);
      }
      return;
    }
    var pillBtn=e.target.closest&&e.target.closest('[data-app-rule-pill]');
    if(pillBtn){
      e.stopPropagation();
      var m3=core()&&core().selected?core().selected():null;
      if(!m3) return;
      var appId3=pillBtn.dataset.appRulePill;
      var mode3=pillBtn.dataset.finishMode;
      if(!mode3) return;
      var rule3=ruleForApp(m3,appId3);
      upsertRule(m3,appId3,mode3,rule3&&rule3.note||defaultNoteForApp(appId3));
      return;
    }
    var primarySet=e.target.closest&&e.target.closest('[data-app-rule-primary]');
    if(primarySet){
      e.stopPropagation();
      var atp=appTargetApi();
      if(atp&&atp.setPrimaryForMapping) atp.setPrimaryForMapping(primarySet.dataset.appRulePrimary);
      return;
    }
    var primaryClear=e.target.closest&&e.target.closest('[data-app-rule-primary-clear]');
    if(primaryClear){
      e.stopPropagation();
      var atp2=appTargetApi();
      if(atp2&&atp2.clearPrimaryForMapping) atp2.clearPrimaryForMapping();
      return;
    }
    var card=e.target.closest&&e.target.closest('[data-app-rule]');
    if(card){
      var appId=card.dataset.appId;
      if(card.classList&&card.classList.contains('keys-app-expand-row')){
        setKeysExpandedAppId(appId);
      }
      setActiveAppContextId(appId);
    }
  }

  function bindAppRulesList(list,opts){
    opts=opts||{};
    if(!list) return;
    list.addEventListener('click',handleAppRulesListClick);
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
    bindAppRulesList(list,{hoverPreview:false});
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

  var VOICE_SUMMON_PHRASE_KEYS={
    'cursor-chat':'voiceAppSummonCursor',
    'codex-chat':'voiceAppSummonCodex',
    'claude-code':'voiceAppSummonClaude',
    'minimax-chat':'voiceAppSummonMiniMax'
  };

  function voiceSummonPhrase(appId){
    var key=VOICE_SUMMON_PHRASE_KEYS[appId];
    return key?t(key):'';
  }

  function voiceSummonQuote(appId){
    var phrase=voiceSummonPhrase(appId);
    var m=phrase.match(/[「「""][^」」""]+[」」""]/);
    return m?m[0]:phrase;
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
    html+='<div class="voice-summon-app-wake"><span class="voice-summon-quote voice-app-shortcut-phrase">'+esc(voiceSummonQuote(preset.id))+'</span></div>';
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
    var list=$('voiceAppShortcutsList');
    var summaryEl=$('voiceAppShortcutsAsideSummary');
    var uiState=global.OneToneState&&global.OneToneState.ui;
    var voiceActive=uiState&&uiState.drawerOpen&&uiState.settingsPanel==='voiceWake';
    if(!voiceActive||!list) return;
    var m=core()&&core().selected?core().selected():null;
    if(!m||!core().isSaved(m)){
      list.innerHTML='<p class="habit-app-rules-empty">'+esc(t('habitAppRulesEmpty'))+'</p>';
      if(summaryEl) summaryEl.textContent=t('voiceAppShortcutsAsideEmpty');
      return;
    }
    if(seedDefaultBehaviorRules(m)){
      if(global.OneToneConfigPersist) global.OneToneConfigPersist.save();
    }
    ensureRules(m);
    var html='';
    BEHAVIOR_PRESETS.forEach(function(preset){
      html+=renderVoiceAppShortcutRow(m,preset);
    });
    list.innerHTML=html;
    if(summaryEl){
      var primary=BEHAVIOR_PRESETS.find(function(p){ return isPrimaryApp(m,p.id); });
      if(primary){
        summaryEl.textContent=appDisplayName(primary.id)+' · '+voiceSummonPhrase(primary.id);
      }else{
        summaryEl.textContent=t('voiceAppShortcutsAsideUnset');
      }
    }
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
    if(!rule) return null;
    return {mode:rule.finishMode,appName:appDisplayName(appId)};
  }

  global.OneToneAppBehaviorRules={
    render:renderAppBehaviorRules,
    bindEvents:bindEvents,
    bindKeysAsideEvents:bindKeysAsideEvents,
    renderKeysAside:renderKeysAside,
    renderVoiceAside:renderVoiceAside,
    setActiveAppContextId:setActiveAppContextId,
    selectAppContext:selectAppContext,
    setKeysExpandedAppId:setKeysExpandedAppId,
    getKeysExpandedAppId:getKeysExpandedAppId,
    getActiveAppContextId:function(){ return activeAppContextId; },
    resolveEffectiveFinish:resolveEffectiveFinish,
    finishModeLabel:finishModeLabel,
    ensureRules:ensureRules,
    behaviorPresets:BEHAVIOR_PRESETS,
    renderActiveScenarioBanner:renderActiveScenarioBanner,
    appDisplayName:appDisplayName
  };
})((typeof window!=='undefined')?window:globalThis);
