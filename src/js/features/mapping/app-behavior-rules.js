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
  var activeRuleId='';

  function newRuleId(){
    return 'rule-'+Date.now()+'-'+Math.floor(Math.random()*100000);
  }

  function isPresetAppId(appId){
    return !!BEHAVIOR_PRESETS.find(function(p){ return p.id===appId; });
  }

  function isCustomRule(rule){
    return !!(rule&&String(rule.appId||'')==='custom');
  }

  function isContextRuleId(id){
    return String(id||'').indexOf('rule-')===0;
  }

  function ruleById(m,ruleId){
    ensureRules(m);
    ruleId=String(ruleId||'').trim();
    if(!ruleId) return null;
    return m.appBehaviorRules.find(function(r){ return r&&r.ruleId===ruleId; })||null;
  }

  function customRulesForMapping(m){
    ensureRules(m);
    return m.appBehaviorRules.filter(function(r){ return r&&isCustomRule(r); });
  }

  function ruleDisplayName(rule){
    if(!rule) return '—';
    var display='';
    if(rule.displayName&&String(rule.displayName).trim()) display=String(rule.displayName).trim();
    else if(isPresetAppId(rule.appId)) return appDisplayName(rule.appId);
    else if(rule.match&&Array.isArray(rule.match.exeNames)&&rule.match.exeNames[0]) display=String(rule.match.exeNames[0]);
    else display=rule.appId||'—';
    var exe=rule.match&&Array.isArray(rule.match.exeNames)&&rule.match.exeNames[0]?String(rule.match.exeNames[0]).trim():'';
    if(display&&exe){
      var stem=exe.replace(/\.exe$/i,'');
      if(stem.length>display.length&&stem.toLowerCase().indexOf(display.toLowerCase())===0) return stem;
    }
    return display;
  }

  function matchIdentityKey(identity){
    if(!identity) return '';
    var exe=String(identity.exeName||identity.exe_name||'').trim();
    var path=String(identity.fullPath||identity.full_path||'').trim();
    var pathContains='';
    if(path){
      var slash=Math.max(path.lastIndexOf('\\'),path.lastIndexOf('/'));
      pathContains=slash>=0?path.slice(0,slash):path;
    }
    return exe.toLowerCase()+'::'+pathContains.toLowerCase();
  }

  function ruleMatchKey(rule){
    if(!rule||!rule.match) return '';
    var exe=(rule.match.exeNames||[]).map(function(x){ return String(x||'').trim().toLowerCase(); }).filter(Boolean).join('|');
    var path=rule.match.pathContains!=null?String(rule.match.pathContains).trim().toLowerCase():'';
    return exe+'::'+path;
  }

  function ruleSpecificity(rule){
    if(!rule||!rule.match) return 0;
    var score=0;
    if(rule.match.pathContains&&String(rule.match.pathContains).trim()) score+=300;
    if(rule.match.exeNames&&rule.match.exeNames.some(function(n){ return String(n||'').trim(); })) score+=200;
    if(rule.match.titleContains&&String(rule.match.titleContains).trim()) score+=100;
    return score;
  }

  function ruleIsExplicitMatch(rule){
    if(!rule||!rule.match) return false;
    return !!(rule.match.exeNames&&rule.match.exeNames.length)||!!(rule.match.pathContains&&String(rule.match.pathContains).trim())||!!(rule.match.titleContains&&String(rule.match.titleContains).trim());
  }

  function ruleMatchesIdentity(rule,identity){
    if(!rule||!identity) return false;
    var match=rule.match;
    if(match){
      var exe=String(identity.exeName||identity.exe_name||'');
      var path=String(identity.fullPath||identity.full_path||'');
      var title=String(identity.windowTitle||identity.window_title||'');
      if(match.exeNames&&match.exeNames.length){
        var exeOk=match.exeNames.some(function(name){
          name=String(name||'').trim();
          return name&&exe.toLowerCase()===name.toLowerCase();
        });
        if(!exeOk) return false;
      }
      if(match.pathContains){
        var pathNeedle=String(match.pathContains).trim().toLowerCase();
        if(!pathNeedle||path.toLowerCase().indexOf(pathNeedle)<0) return false;
      }
      if(match.titleContains){
        var titleNeedle=String(match.titleContains).trim().toLowerCase();
        if(!titleNeedle||title.toLowerCase().indexOf(titleNeedle)<0) return false;
      }
      return true;
    }
    if(!isPresetAppId(rule.appId)) return false;
    var presetId=identity.matchedPresetAppId||identity.matched_preset_app_id||identity.appId||'';
    return String(presetId)===String(rule.appId);
  }

  function matchRuleForMapping(m,identity){
    if(!m||!identity) return null;
    ensureRules(m);
    var best=null;
    m.appBehaviorRules.forEach(function(rule,idx){
      if(!rule||!ruleMatchesIdentity(rule,identity)) return;
      var explicit=ruleIsExplicitMatch(rule);
      var specificity=ruleSpecificity(rule);
      var replace=!best
        ||(explicit&&!best.explicit)
        ||(explicit===best.explicit&&specificity>best.specificity)
        ||(explicit===best.explicit&&specificity===best.specificity&&idx<best.idx);
      if(replace) best={rule:rule,explicit:explicit,specificity:specificity,idx:idx};
    });
    return best?best.rule:null;
  }

  function contextRefForRule(rule){
    if(!rule) return '';
    return isCustomRule(rule)?rule.ruleId:rule.appId;
  }

  function resolvePreviewContext(m){
    var manual=activeContextRef();
    if(manual) return manual;
    var nav=global.OneToneHabitLayerNav;
    if(nav&&nav.getForegroundContextRef&&m) return nav.getForegroundContextRef(m)||'';
    return '';
  }

  function resolveForegroundContextRef(m,identity){
    if(!m||!identity) return '';
    var rule=matchRuleForMapping(m,identity);
    if(rule) return contextRefForRule(rule);
    var preset=identity.matchedPresetAppId||identity.matched_preset_app_id||identity.appId||'';
    return String(preset||'');
  }

  function identityDisplayName(identity){
    if(!identity) return '';
    var preset=identity.matchedPresetAppId||identity.matched_preset_app_id||identity.appId;
    if(preset&&isPresetAppId(String(preset))) return appDisplayName(String(preset));
    return resolveCustomRuleDisplayName(identity);
  }

  function resolveCustomRuleDisplayName(identity){
    var exe=String(identity.exeName||identity.exe_name||'').trim();
    var stem=exe.replace(/\.exe$/i,'');
    var listName=String(identity.displayName||identity.display_name||'').trim();
    var title=String(identity.windowTitle||identity.window_title||identity.windowTitleSample||identity.window_title_sample||'').trim();
    // Prefer backend program name (FileDescription / exe stem). Never use the live window title.
    if(listName&&(!title||listName!==title)) return listName;
    return stem||exe||listName;
  }

  function identityAlreadyInRules(m,identity){
    if(!m||!identity) return false;
    if(findCustomRuleForIdentity(m,identity)) return true;
    var presetId=identity.matchedPresetAppId||identity.matched_preset_app_id||identity.appId;
    if(presetId&&isPresetAppId(String(presetId))&&ruleForApp(m,String(presetId))) return true;
    return false;
  }

  function findCustomRuleForIdentity(m,identity){
    var key=matchIdentityKey(identity);
    if(!key) return null;
    var found=null;
    customRulesForMapping(m).some(function(rule){
      if(ruleMatchKey(rule)===key){ found=rule; return true; }
      return false;
    });
    return found;
  }

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

  function appDisplayName(appId,rule){
    if(rule) return ruleDisplayName(rule);
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

  function renderKeysCustomExpandFacts(m,rule,mode){
    var meta=rule.match?(function(){
      var parts=[];
      if(rule.match.exeNames&&rule.match.exeNames.length) parts.push(rule.match.exeNames.join(', '));
      if(rule.match.pathContains) parts.push(rule.match.pathContains);
      return parts.join(' · ');
    })():'';
    var html='<div class="keys-app-expand-facts">';
    if(meta){
      html+='<p class="keys-app-expand-fact"><span class="keys-app-expand-fact-lbl">'+esc(t('habitAppRuleCustomMatch'))+'</span> <strong>'+esc(meta)+'</strong></p>';
    }
    html+='<p class="keys-app-expand-fact"><span class="keys-app-expand-fact-lbl">'+esc(t('keysAppExpandFinish'))+'</span> <strong>'+esc(finishModeLabel(mode))+'</strong></p>';
    html+='<p class="keys-app-expand-hint-inline">'+esc(t('keysAppPriorityHint'))+'</p>';
    html+='</div>';
    html+='<div class="habit-app-rule-pills keys-app-custom-finish-pills" role="radiogroup" aria-label="'+esc(t('habitAppRulesPickFinish'))+'">';
    MODE_CYCLE.forEach(function(modeOpt){
      var on=mode===modeOpt;
      html+='<button type="button" class="habit-app-rule-pill'+(on?' is-active':'')+' '+finishModeClass(modeOpt)+'" data-rule-pill="'+esc(rule.ruleId)+'" data-finish-mode="'+modeOpt+'" role="radio" aria-checked="'+(on?'true':'false')+'">'+esc(finishModeLabel(modeOpt))+'</button>';
    });
    html+='</div>';
    html+='<button type="button" class="keys-app-custom-delete" data-rule-delete="'+esc(rule.ruleId)+'">'+esc(t('habitAppRuleDelete'))+'</button>';
    return html;
  }

  function renderKeysCustomExpandableRow(m,rule){
    var ruleId=rule.ruleId;
    var expanded=getKeysExpandedAppId()===ruleId||activeAppContextId===ruleId;
    var mode=rule.finishMode||'confirm';
    var name=ruleDisplayName(rule);
    var meta=rule.match&&rule.match.exeNames&&rule.match.exeNames[0]?String(rule.match.exeNames[0]):t('habitAppRuleCustomMatch');
    var html='<div class="keys-app-expand-wrap keys-app-expand-wrap--custom'+(activeAppContextId===ruleId?' is-preview':'')+'" data-app-rule="'+esc(ruleId)+'" data-rule-id="'+esc(ruleId)+'">';
    html+='<div class="keys-app-expand-head">';
    html+='<details class="keys-app-expand-row'+(expanded?' is-open':'')+'" data-rule-id="'+esc(ruleId)+'"'+(expanded?' open':'')+'>';
    html+='<summary class="keys-app-expand-summary">';
    html+='<div class="keys-app-shortcut-main keys-app-expand-summary-main">';
    html+=customRuleIconHtml(rule,'keys-app-shortcut-icon');
    html+='<span><span class="keys-app-shortcut-name">'+esc(name)+'</span>';
    html+='<span class="keys-app-expand-meta">'+esc(meta)+' · '+esc(finishModeLabel(mode))+'</span></span>';
    html+='</div></summary>';
    html+='<div class="keys-app-expand-body"><div class="keys-workflow-expand">';
    html+=renderKeysCustomExpandFacts(m,rule,mode);
    html+='</div></div></details></div></div>';
    return html;
  }

  function renderKeysAside(){
    var aside=$('keysPanelAside');
    var shortcutsCard=$('keysAppShortcutsCard');
    var keysList=$('keysAppRulesList');
    var countEl=$('keysAppShortcutsCount');
    var keysActive=keysPanelActive();
    if(aside) aside.hidden=!keysActive;
    var m=core()&&core().selected?core().selected():null;
    var custom=m?customRulesForMapping(m):[];
    if(shortcutsCard) shortcutsCard.hidden=!keysActive||!custom.length;
    if(countEl) countEl.textContent=custom.length?t('keysAppShortcutsCount').replace('{n}',String(custom.length)):'';
    if(keysList&&keysActive&&m&&core().isSaved&&core().isSaved(m)){
      keysList.innerHTML=custom.map(function(rule){ return renderKeysCustomExpandableRow(m,rule); }).join('');
    }else if(keysList){
      keysList.innerHTML='';
    }
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

  function customRuleMatchMeta(rule){
    if(!rule||!rule.match) return '';
    var parts=[];
    if(rule.match.exeNames&&rule.match.exeNames.length) parts.push(rule.match.exeNames.join(', '));
    if(rule.match.pathContains) parts.push(rule.match.pathContains);
    if(rule.match.titleContains) parts.push(rule.match.titleContains);
    return parts.join(' · ');
  }

  function renderCustomScenarioCard(m,rule){
    var ruleId=rule.ruleId;
    var mode=rule.finishMode||'confirm';
    var name=ruleDisplayName(rule);
    var meta=customRuleMatchMeta(rule)||t('habitAppRuleCustomMatch');
    var html='<article class="habit-app-scenario-card habit-app-scenario-card--custom'+(activeAppContextId===ruleId?' is-preview':'')+'" data-rule-id="'+esc(ruleId)+'" data-app-rule="'+esc(ruleId)+'">';
    html+='<div class="habit-app-scenario-head">';
    html+=customRuleIconHtml(rule,'habit-app-scenario-icon');
    html+='<div class="habit-app-scenario-main">';
    html+='<div class="habit-app-scenario-name-row">';
    html+='<h4 class="habit-app-scenario-name">'+esc(name)+'</h4>';
    html+='<span class="habit-app-scenario-badge">'+esc(t('habitAppRuleCustomBadge'))+'</span>';
    html+='</div>';
    html+='<div class="habit-app-scenario-shortcut"><span class="habit-app-scenario-shortcut-empty">'+esc(meta)+'</span></div>';
    html+='</div>';
    html+='<div class="habit-app-scenario-actions">';
    html+='<button type="button" class="habit-app-scenario-btn is-muted" data-rule-delete="'+esc(ruleId)+'">'+esc(t('habitAppRuleDelete'))+'</button>';
    html+='</div></div>';
    html+='<div class="habit-app-rule-pills habit-app-scenario-finish-pills" role="radiogroup" aria-label="'+esc(t('habitAppRulesPickFinish'))+'">';
    MODE_CYCLE.forEach(function(modeOpt){
      var on=mode===modeOpt;
      html+='<button type="button" class="habit-app-rule-pill'+(on?' is-active':'')+' '+finishModeClass(modeOpt)+'" data-rule-pill="'+esc(ruleId)+'" data-finish-mode="'+modeOpt+'" role="radio" aria-checked="'+(on?'true':'false')+'">'+esc(finishModeLabel(modeOpt))+'</button>';
    });
    html+='</div></article>';
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
    activeRuleId=isContextRuleId(activeAppContextId)?activeAppContextId:'';
    if(!isContextRuleId(activeAppContextId)) activeRuleId='';
    var ed=global.OneToneMappingEditorState;
    if(ed&&ed.setEditorActiveAppContextId) ed.setEditorActiveAppContextId(activeAppContextId);
    var m=core()&&core().selected?core().selected():null;
    var fs=flowSummary();
    if(fs&&fs.syncFlowSummary) fs.syncFlowSummary(m,{context:'settings',activeAppContextId:activeAppContextId});
    var list=$('habitAppRulesList');
    if(list){
      list.querySelectorAll('.habit-app-scenario-card').forEach(function(card){
        var match=isContextRuleId(activeAppContextId)
          ?card.dataset.ruleId===activeAppContextId
          :card.dataset.appId===activeAppContextId;
        card.classList.toggle('is-preview',!!activeAppContextId&&match);
      });
    }
    var keysList=$('keysAppRulesList');
    if(keysList){
      keysList.querySelectorAll('.keys-app-expand-row').forEach(function(row){
        var match=isContextRuleId(activeAppContextId)
          ?row.dataset.ruleId===activeAppContextId
          :row.dataset.appId===activeAppContextId;
        row.classList.toggle('is-preview',!!activeAppContextId&&match);
        if(activeAppContextId&&match&&!row.open) row.open=true;
      });
    }
    if(activeAppContextId&&!isContextRuleId(activeAppContextId)) setKeysExpandedAppId(activeAppContextId);
    var kpu=global.OneToneKeysPanelUi;
    if(kpu){
      if(kpu.renderAppContextStrip) kpu.renderAppContextStrip();
      if(kpu.renderTriggerContextBadge) kpu.renderTriggerContextBadge();
      if(kpu.renderAppContext) kpu.renderAppContext();
    }
    var kfr=global.OneToneKeyFinishFlowRender;
    if(kfr&&kfr.refreshFinishModeSegment) kfr.refreshFinishModeSegment(m);
    if(global.OneToneHabitKeyMappingTable) global.OneToneHabitKeyMappingTable.syncRowStatus();
    if(global.OneToneVoiceSettingsFlow&&global.OneToneVoiceSettingsFlow.scheduleVoiceSettingsRender){
      global.OneToneVoiceSettingsFlow.scheduleVoiceSettingsRender();
    }
  }

  function setActiveRuleContext(ruleId){
    setActiveAppContextId(ruleId||'');
  }

  function activeContextRef(){
    return activeAppContextId||'';
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

  function ruleForContext(m,ctx){
    if(!ctx) return null;
    if(isContextRuleId(ctx)) return ruleById(m,ctx);
    return ruleForApp(m,ctx);
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
    if(global.OneToneKeysPanelUi&&global.OneToneKeysPanelUi.renderAppContextStrip) global.OneToneKeysPanelUi.renderAppContextStrip();
    if(global.OneToneVoiceSettingsFlow&&global.OneToneVoiceSettingsFlow.scheduleVoiceSettingsRender){
      global.OneToneVoiceSettingsFlow.scheduleVoiceSettingsRender();
    }else if(global.OneToneVoicePageHeaderRender&&global.OneToneVoicePageHeaderRender.renderAppScope){
      var vmApi=global.OneToneVoiceSettingsViewModel;
      if(vmApi&&vmApi.build) global.OneToneVoicePageHeaderRender.renderAppScope(vmApi.build());
    }
    if(global.OneToneState&&global.OneToneState.ui&&global.OneToneState.ui.habitView==='wizard'
      &&global.OneToneHabitScenarioWizard&&global.OneToneHabitScenarioWizard.render){
      global.OneToneHabitScenarioWizard.render();
    }
    scheduleHydrateCustomRuleIcons();
  }

  function seedDefaultBehaviorRules(m){
    ensureRules(m);
    if(m.appBehaviorRules.length) return false;
    // App scenarios are sparse overrides — never dump every preset chip onto them.
    if(global.OneToneHabitOverrideDiff
      &&global.OneToneHabitOverrideDiff.isAppScenarioMapping
      &&global.OneToneHabitOverrideDiff.isAppScenarioMapping(m)){
      return false;
    }
    BEHAVIOR_PRESETS.forEach(function(p){
      m.appBehaviorRules.push({
        ruleId:newRuleId(),
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
      ruleId:newRuleId(),
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
      m.appBehaviorRules.push({ruleId:newRuleId(),appId:appId,finishMode:finishMode,note:note||defaultNoteForApp(appId)});
    }
    if(keysPanelActive()) saveFinishModeChange(m);
    else saveAndRefresh();
  }

  function setRuleFinishMode(m,ruleId,mode){
    if(!m||!ruleId||!mode) return;
    var rule=ruleById(m,ruleId);
    if(!rule) return;
    rule.finishMode=mode;
    if(keysPanelActive()) saveFinishModeChange(m);
    else saveAndRefresh();
  }

  function setAppFinishMode(m,ctx,mode){
    if(!m||!ctx||!mode) return;
    if(isContextRuleId(ctx)){
      setRuleFinishMode(m,ctx,mode);
      return;
    }
    var rule=ruleForContext(m,ctx);
    upsertRule(m,ctx,mode,rule&&rule.note||defaultNoteForApp(ctx));
  }

  function removeRule(m,appId){
    ensureRules(m);
    m.appBehaviorRules=m.appBehaviorRules.filter(function(r){ return r.appId!==appId; });
    if(activeAppContextId===appId) setActiveAppContextId('');
    saveAndRefresh();
  }

  function removeRuleById(m,ruleId){
    if(!m||!ruleId) return;
    ensureRules(m);
    m.appBehaviorRules=m.appBehaviorRules.filter(function(r){ return r.ruleId!==ruleId; });
    if(activeAppContextId===ruleId) setActiveAppContextId('');
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
      addBtn.textContent='+ '+t('habitAppRulesAdd');
      addBtn.disabled=false;
      addBtn.title=t('habitAppRulesPickApp');
      if(!addBtn.dataset.pickerBound){
        addBtn.dataset.pickerBound='1';
        addBtn.addEventListener('click',function(e){
          e.preventDefault();
          openAppPicker();
        });
      }
    }
    var shortcutsTitle=$('habitAppShortcutsTitle');
    var shortcutsDesc=$('habitAppShortcutsDesc');
    if(shortcutsTitle) shortcutsTitle.textContent=t('habitAppShortcutsTitle');
    if(shortcutsDesc) shortcutsDesc.textContent=t('habitAppShortcutsDesc');
    var html='';
    BEHAVIOR_PRESETS.forEach(function(preset){
      html+=renderScenarioCard(m,preset);
    });
    customRulesForMapping(m).forEach(function(rule){
      html+=renderCustomScenarioCard(m,rule);
    });
    list.innerHTML=html;
    renderActiveScenarioBanner();
    renderKeysAside();
    renderVoiceAside();
    scheduleHydrateCustomRuleIcons();
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
      var mSummon=resolvePickerMapping();
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
    var rulePillBtn=e.target.closest&&e.target.closest('[data-rule-pill]');
    if(rulePillBtn){
      e.preventDefault();
      e.stopPropagation();
      var mRule=core()&&core().selected?core().selected():null;
      if(!mRule) return true;
      var ruleIdPill=rulePillBtn.getAttribute('data-rule-pill')||'';
      var modeRule=rulePillBtn.getAttribute('data-finish-mode')||'';
      if(!ruleIdPill||!modeRule) return true;
      setRuleFinishMode(mRule,ruleIdPill,modeRule);
      return true;
    }
    var ruleDeleteBtn=e.target.closest&&e.target.closest('[data-rule-delete]');
    if(ruleDeleteBtn){
      e.preventDefault();
      e.stopPropagation();
      var mDel=core()&&core().selected?core().selected():null;
      if(!mDel) return true;
      var ruleIdDel=ruleDeleteBtn.getAttribute('data-rule-delete')||'';
      var runDel=function(){ removeRuleById(mDel,ruleIdDel); };
      var confirmApi=global.OneToneConfirm;
      if(confirmApi&&confirmApi.ask){
        confirmApi.ask('habitAppRuleDeleteConfirm',{
          fallback:'确定删除这条应用规则？此操作不可撤销。'
        }).then(function(ok){ if(ok) runDel(); });
        return true;
      }
      if(!window.confirm(t('habitAppRuleDeleteConfirm')||'确定删除这条应用规则？此操作不可撤销。')) return true;
      runDel();
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
      var ruleIdCard=card.dataset.ruleId;
      var appId=card.dataset.appId;
      if(ruleIdCard){
        if(card.classList&&card.classList.contains('keys-app-expand-wrap')){
          var detailsR=card.querySelector('.keys-app-expand-row');
          if(detailsR){
            detailsR.open=true;
            setKeysExpandedAppId(ruleIdCard);
          }
        }
        setActiveRuleContext(ruleIdCard);
        e.stopPropagation();
        return true;
      }
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
        if(!card) return;
        if(card.dataset.ruleId) setActiveRuleContext(card.dataset.ruleId);
        else if(card.dataset.appId) setActiveAppContextId(card.dataset.appId);
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
          var ruleId=row.dataset.ruleId||'';
          setKeysExpandedAppId(ruleId||appId);
          if(ruleId) setActiveRuleContext(ruleId);
          else setActiveAppContextId(appId);
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
        if(appRules()&&appRules().openAppPicker) appRules().openAppPicker();
      });
    }
  }

  var VOICE_SUMMON_PHRASE_KEYS={
    'cursor-chat':'voiceAppSummonCursor',
    'codex-chat':'voiceAppSummonCodex',
    'claude-code':'voiceAppSummonClaude',
    'minimax-chat':'voiceAppSummonMiniMax'
  };

  function defaultSummonPhraseForRule(rule,m){
    if(!rule) return '';
    if(String(rule.summonPhrase||'').trim()) return String(rule.summonPhrase).trim();
    if(rule.appId&&rule.appId!=='custom') return voiceSummonPhrase(rule.appId,m);
    var name=ruleDisplayName(rule);
    if(!name) return '';
    var cfg=global.OneToneState&&global.OneToneState.state?global.OneToneState.state.config||{}:{};
    var sc=global.OneToneSceneConfig;
    var preset=sc&&sc.effectiveVoskModelPreset&&m?sc.effectiveVoskModelPreset(cfg,m):'cn-light';
    if(sc&&sc.defaultSummonPhrase){
      var fromSc=sc.defaultSummonPhrase('custom',{preset:preset,displayName:name});
      if(fromSc) return fromSc;
    }
    return '打开'+name;
  }

  function ensureCustomSummonPhrase(m,rule){
    if(!m||!rule||rule.appId!=='custom') return;
    if(String(rule.summonPhrase||'').trim()) return;
    var phrase=defaultSummonPhraseForRule(rule,m);
    if(phrase) rule.summonPhrase=phrase;
  }

  function voiceSummonPhrase(appId,m,ruleId){
    if(ruleId&&isContextRuleId(ruleId)){
      var rule=ruleById(m,ruleId);
      return defaultSummonPhraseForRule(rule,m);
    }
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

  function saveSummonPhrase(m,key,phrase){
    if(!m||!key) return;
    ensureRules(m);
    phrase=String(phrase||'').trim();
    var rule=null;
    if(isContextRuleId(key)) rule=ruleById(m,key);
    else rule=ruleForApp(m,key);
    if(rule){
      rule.summonPhrase=phrase||undefined;
    }else if(!isContextRuleId(key)){
      m.appBehaviorRules.push({
        ruleId:newRuleId(),
        appId:key,
        finishMode:defaultModeForApp(key),
        note:defaultNoteForApp(key),
        summonPhrase:phrase||undefined
      });
    }
    if(global.OneToneConfigPersist) global.OneToneConfigPersist.save();
    refreshVoiceSchemeSurfaces();
    hooks().toast&&hooks().toast(t('habitAppSummonPhraseSaved'));
  }

  function refreshVoiceSchemeSurfaces(){
    if(global.OneToneVoiceSchemePersist&&global.OneToneVoiceSchemePersist.refreshVoiceSchemeSurfaces){
      global.OneToneVoiceSchemePersist.refreshVoiceSchemeSurfaces();
      return;
    }
    saveAndRefresh();
  }

  function hooks(){
    return global.__vp_bootstrap_hooks__||{};
  }

  function renderSummonPhraseEditor(m,key,opts){
    opts=opts||{};
    var rule=null;
    if(opts.ruleId&&isContextRuleId(opts.ruleId)) rule=ruleById(m,opts.ruleId);
    else if(isContextRuleId(key)) rule=ruleById(m,key);
    else rule=ruleForApp(m,key);
    var value=rule&&rule.summonPhrase?String(rule.summonPhrase):'';
    if(!value){
      if(opts.ruleId||isContextRuleId(key)) value=defaultSummonPhraseForRule(rule,m);
      else value=voiceSummonPhrase(key,m);
    }
    var presetId=rule&&rule.appId&&rule.appId!=='custom'?rule.appId:key;
    var workflow=global.OneToneSceneConfig&&global.OneToneSceneConfig.isWorkflowAppTarget
      ?global.OneToneSceneConfig.isWorkflowAppTarget(presetId):false;
    var saveKey=opts.ruleId||key;
    var html='<div class="keys-app-summon-edit" data-summon-edit="'+esc(saveKey)+'">';
    html+='<p class="keys-app-summon-edit-lbl">'+esc(t('habitAppSummonPhraseLbl'))+'</p>';
    html+='<div class="keys-app-summon-edit-row">';
    html+='<input type="text" class="keys-app-summon-edit-input" data-summon-input="'+esc(saveKey)+'" value="'+esc(value)+'" maxlength="48" placeholder="'+esc(t('habitAppSummonPhrasePlaceholder'))+'" spellcheck="false" autocomplete="off" />';
    html+='<button type="button" class="keys-app-summon-edit-save" data-summon-save="'+esc(saveKey)+'">'+esc(t('habitAppSummonPhraseSave'))+'</button>';
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
    var uiState=global.OneToneState&&global.OneToneState.ui;
    var voiceActive=uiState&&uiState.drawerOpen&&uiState.settingsPanel==='voiceWake';
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
    bindAppPickerEvents();
  }

  function resolveEffectiveFinish(m,ctx){
    if(!m||!ctx) return null;
    ensureRules(m);
    var rule=ruleForContext(m,ctx);
    if(rule) return {mode:rule.finishMode,appName:ruleDisplayName(rule)};
    if(!isContextRuleId(ctx)&&String(m.appTargetId||'')===ctx){
      return {mode:resolveGlobalFinishMode(m),appName:appDisplayName(ctx)};
    }
    return null;
  }

  function upgradeCustomRuleFromIdentity(rule,identity){
    if(!rule||!identity) return;
    var display=resolveCustomRuleDisplayName(identity);
    if(display) rule.displayName=display;
    var icon=resolveAppIconUrl(identity);
    if(icon) rule.iconDataUrl=icon;
    var path=String(identity.fullPath||identity.full_path||'').trim();
    if(path){
      if(!rule.match) rule.match={exeNames:[]};
      rule.match.fullPath=path;
    }
  }

  function addCustomRuleFromIdentity(m,identity){
    if(!m||!identity) return null;
    ensureRules(m);
    var existing=findCustomRuleForIdentity(m,identity);
    if(existing){
      upgradeCustomRuleFromIdentity(existing,identity);
      return existing;
    }
    var exe=String(identity.exeName||identity.exe_name||'').trim();
    if(!exe) return null;
    var path=String(identity.fullPath||identity.full_path||'').trim();
    var pathContains='';
    if(path){
      var slash=Math.max(path.lastIndexOf('\\'),path.lastIndexOf('/'));
      pathContains=slash>=0?path.slice(0,slash):path;
    }
    var display=resolveCustomRuleDisplayName(identity);
    var match={exeNames:[exe]};
    if(pathContains) match.pathContains=pathContains;
    if(path) match.fullPath=path;
    var iconUrl=resolveAppIconUrl(identity);
    var rule={
      ruleId:newRuleId(),
      appId:'custom',
      finishMode:resolveGlobalFinishMode(m),
      note:'',
      displayName:display,
      match:match
    };
    if(iconUrl) rule.iconDataUrl=iconUrl;
    m.appBehaviorRules.push(rule);
    return rule;
  }

  function ensurePresetRule(m,appId){
    if(!m||!appId||!isPresetAppId(appId)) return null;
    var rule=ruleForApp(m,appId);
    if(rule) return rule;
    ensureRules(m);
    rule={
      ruleId:newRuleId(),
      appId:appId,
      finishMode:defaultModeForApp(appId),
      note:defaultNoteForApp(appId)
    };
    m.appBehaviorRules.push(rule);
    return rule;
  }

  function persistPickerBind(m){
    var saveAsync=global.OneToneConfigPersist&&global.OneToneConfigPersist.saveAsync;
    var save=global.OneToneConfigPersist&&global.OneToneConfigPersist.save;
    var done=function(ok){
      if(global.OneToneHabitHub&&global.OneToneHabitHub.render) global.OneToneHabitHub.render();
      if(ok===false){
        hooks().toast&&hooks().toast(t('habitScenarioSaveFailed'));
        return;
      }
      hooks().toast&&hooks().toast(t('appPickerAdded'));
    };
    if(saveAsync){
      return saveAsync().then(function(){ done(true); }).catch(function(){ done(false); });
    }
    if(save) save();
    done(true);
    return Promise.resolve();
  }

  function pickPresetApp(m,appId){
    if(!m||!appId) return;
    appId=String(appId).trim();
    var hub=global.OneToneHabitHub;
    if(hub&&hub.findAppScenarioByAppId){
      var existing=hub.findAppScenarioByAppId(appId,m.id);
      if(existing){
        clearPickerCreateTarget();
        hooks().toast&&hooks().toast(t('habitHubAppScenarioExists'));
        return;
      }
    }
    var persist=global.OneToneVoiceSchemePersist;
    var isAppScenario=global.OneToneHabitOverrideDiff
      &&global.OneToneHabitOverrideDiff.isAppScenarioMapping
      &&global.OneToneHabitOverrideDiff.isAppScenarioMapping(m);
    ensurePresetRule(m,appId);
    m.appTargetId=appId;
    m.group=defaultScenarioNameForApp(appId);
    var scoped=false;
    if(persist&&persist.applyVoiceAppScope){
      scoped=!!persist.applyVoiceAppScope({appId:appId,mappingId:m.id});
    }
    if(!scoped){
      var presets=global.OneToneAppVoicePresets;
      if(presets&&presets.syncAppVoicePresets) presets.syncAppVoicePresets(m,appId);
      if(!isAppScenario&&presets&&presets.hydrateGlobalWakeEndFromMapping){
        presets.hydrateGlobalWakeEndFromMapping(m);
      }
      setActiveRuleContext(appId);
      saveAndRefresh();
    }
    clearPickerCreateTarget();
    persistPickerBind(m);
  }

  function defaultScenarioNameForApp(appId){
    var name=appDisplayName(appId)||appId||'—';
    return t('habitWizardDefaultName').replace('{app}',name);
  }

  function pickRunningIdentity(m,identity){
    if(!m||!identity) return;
    var hub=global.OneToneHabitHub;
    if(hub&&hub.findAppScenarioForIdentity){
      var taken=hub.findAppScenarioForIdentity(identity,m.id);
      if(taken){
        clearPickerCreateTarget();
        hooks().toast&&hooks().toast(t('habitHubAppScenarioExists'));
        return;
      }
    }
    var presetId=identity.matchedPresetAppId||identity.matched_preset_app_id;
    if(presetId&&isPresetAppId(String(presetId))){
      pickPresetApp(m,String(presetId));
      return;
    }
    var rule=addCustomRuleFromIdentity(m,identity);
    if(!rule){
      clearPickerCreateTarget();
      return;
    }
    // Keep scenario bound to custom primary + concrete rule (exe/icon/displayName).
    m.appTargetId='custom';
    if(rule.displayName){
      m.group=t('habitWizardDefaultName').replace('{app}',String(rule.displayName).trim());
    }
    var persist=global.OneToneVoiceSchemePersist;
    var isAppScenario=global.OneToneHabitOverrideDiff
      &&global.OneToneHabitOverrideDiff.isAppScenarioMapping
      &&global.OneToneHabitOverrideDiff.isAppScenarioMapping(m);
    var scoped=false;
    if(persist&&persist.applyVoiceAppScope){
      scoped=!!persist.applyVoiceAppScope({ruleId:rule.ruleId,mappingId:m.id});
    }
    if(!scoped){
      var presets=global.OneToneAppVoicePresets;
      if(presets&&presets.syncRuleVoicePresets) presets.syncRuleVoicePresets(m,rule);
      if(!isAppScenario&&presets&&presets.hydrateGlobalWakeEndFromMapping){
        presets.hydrateGlobalWakeEndFromMapping(m);
      }
      setActiveRuleContext(rule.ruleId);
      saveAndRefresh();
    }
    clearPickerCreateTarget();
    persistPickerBind(m);
  }

  function resolvePickerMapping(){
    if(pickerCreateMappingId&&core()&&core().byId){
      var pinned=core().byId(pickerCreateMappingId);
      if(pinned) return pinned;
    }
    var persist=global.OneToneVoiceSchemePersist;
    if(persist&&persist.ensureVoiceScopeMapping){
      return persist.ensureVoiceScopeMapping({allowDraft:false});
    }
    if(persist&&persist.resolveVoiceScopeMapping) return persist.resolveVoiceScopeMapping();
    var m=core()&&core().selected?core().selected():null;
    if(m&&core().isSaved&&core().isSaved(m)) return m;
    if(persist&&persist.resolveVoiceEditMapping) return persist.resolveVoiceEditMapping();
    return m;
  }

  function closeAppPicker(){
    var overlay=$('appPickerOverlay');
    if(overlay){
      overlay.classList.remove('open');
      overlay.setAttribute('aria-hidden','true');
    }
    if(pickerCreateMappingId){
      discardIncompleteCustomCreate(pickerCreateMappingId);
      clearPickerCreateTarget();
    }
  }

  function resolveAppIconUrl(app){
    if(!app) return '';
    return String(app.iconDataUrl||app.icon_data_url||'').trim();
  }

  function runningAppPickerMeta(displayName,exeName){
    var name=String(displayName||'').trim();
    var exe=String(exeName||'').trim();
    if(!exe) return '';
    var stem=exe.replace(/\.exe$/i,'');
    if(!name||name.toLowerCase()===stem.toLowerCase()||name.toLowerCase()===exe.toLowerCase()) return '';
    return exe;
  }

  function setPickerItemIcon(host,iconUrl,fallbackChar){
    if(!host) return;
    var url=String(iconUrl||'').trim();
    if(url){
      if(host.tagName==='IMG'){
        host.src=url;
        host.alt='';
        return;
      }
      var img=document.createElement('img');
      img.className=host.className.replace(/\s*app-picker-item-icon--fallback/,'');
      img.classList.add('app-picker-item-icon');
      img.src=url;
      img.alt='';
      img.decoding='async';
      host.replaceWith(img);
      return;
    }
    if(host.tagName!=='IMG'){
      host.textContent=fallbackChar||'?';
    }
  }

  function renderAppPickerItem(opts){
    opts=opts||{};
    var name=esc(opts.name||'—');
    var meta=esc(opts.meta||'');
    var html='<button type="button" class="app-picker-item" role="option"';
    if(opts.presetId) html+=' data-pick-preset="'+esc(opts.presetId)+'"';
    if(opts.pickIndex!=null) html+=' data-pick-running="'+opts.pickIndex+'"';
    html+='>';
    if(opts.icon){
      html+='<img class="app-picker-item-icon" src="'+esc(opts.icon)+'" alt="" decoding="async" />';
    }else{
      html+='<span class="app-picker-item-icon app-picker-item-icon--fallback" aria-hidden="true">'+esc((opts.name||'?').charAt(0))+'</span>';
    }
    html+='<span class="app-picker-item-main"><span class="app-picker-item-name">'+name+'</span>';
    if(meta) html+='<span class="app-picker-item-meta">'+meta+'</span>';
    html+='</span></button>';
    return html;
  }

  var pickerRunningCache=[];
  var pickerForegroundIdentity=null;
  var pickerCreateMappingId='';

  function setPickerCreateTarget(mappingId){
    pickerCreateMappingId=String(mappingId||'').trim();
  }

  function clearPickerCreateTarget(){
    pickerCreateMappingId='';
  }

  function discardIncompleteCustomCreate(mappingId){
    mappingId=String(mappingId||pickerCreateMappingId||'').trim();
    if(!mappingId||!core()||!core().byId) return;
    var m=core().byId(mappingId);
    if(!m) return;
    // Never delete a mapping that already qualifies as an app scenario (preset or
    // process-bound custom). Closing the picker after a successful pick used to race
    // and wipe Cursor/Chrome rows that had just been bound.
    if(global.OneToneHabitOverrideDiff
      &&global.OneToneHabitOverrideDiff.isAppScenarioMapping
      &&global.OneToneHabitOverrideDiff.isAppScenarioMapping(m)
      &&String(m.appTargetId||'').trim()
      &&String(m.appTargetId||'').trim()!=='custom'){
      return;
    }
    var customs=customRulesForMapping(m);
    var hasRealCustom=customs.some(function(rule){
      return !!(rule&&rule.match&&(
        (Array.isArray(rule.match.exeNames)&&rule.match.exeNames.length)||
        String(rule.match.fullPath||'').trim()||
        String(rule.match.pathContains||'').trim()
      ));
    });
    var appId=String(m.appTargetId||'').trim();
    // Incomplete stub: still on "custom" with no concrete running-app rule.
    if(appId==='custom'&&!hasRealCustom){
      var cfg=state().config||{};
      if(Array.isArray(cfg.mappings)){
        cfg.mappings=cfg.mappings.filter(function(x){ return x&&x.id!==mappingId; });
      }
      if(String(state().selectedMappingId||'')===mappingId){
        var baseline=global.OneToneHabitOverrideDiff&&global.OneToneHabitOverrideDiff.findGlobalBaselineMapping
          ?global.OneToneHabitOverrideDiff.findGlobalBaselineMapping(cfg,core())
          :null;
        state().selectedMappingId=baseline&&baseline.id||null;
      }
      if(global.OneToneConfigPersist&&global.OneToneConfigPersist.save) global.OneToneConfigPersist.save();
      if(global.OneToneHabitHub&&global.OneToneHabitHub.render) global.OneToneHabitHub.render();
    }
  }
  var ruleIconCache={};

  function ruleIconDataUrl(rule){
    return String(rule&&(rule.iconDataUrl||rule.icon_data_url)||'').trim();
  }

  function resolveRuleIconPath(rule){
    if(!rule||!rule.match) return '';
    var path=String(rule.match.fullPath||rule.match.full_path||'').trim();
    if(path) return path;
    var exe=rule.match.exeNames&&rule.match.exeNames[0];
    exe=exe?String(exe).trim():'';
    var dir=rule.match.pathContains!=null?String(rule.match.pathContains).trim():'';
    if(!exe||!dir) return '';
    var sep=dir.indexOf('/')>=0?'/':'\\';
    if(!dir.endsWith(sep)&&!dir.endsWith('/')&&!dir.endsWith('\\')) dir+=sep;
    return dir+exe;
  }

  function backfillRuleIconPath(rule){
    if(!rule||!rule.match) return;
    if(String(rule.match.fullPath||rule.match.full_path||'').trim()) return;
    var path=resolveRuleIconPath(rule);
    if(path) rule.match.fullPath=path;
  }

  function applyRuleIconToDom(ruleId,url){
    if(!ruleId||!url) return;
    document.querySelectorAll('[data-rule-context="'+ruleId+'"]').forEach(function(btn){
      var fallback=btn.querySelector('.keys-app-chip-icon--fallback');
      if(fallback) replaceChipIconFallback(fallback,url);
      var img=btn.querySelector('img.keys-app-chip-icon');
      if(img&&img.getAttribute('src')!==url) img.setAttribute('src',url);
    });
    document.querySelectorAll('.keys-app-chip-icon--fallback[data-rule-id="'+ruleId+'"]').forEach(function(el){
      replaceChipIconFallback(el,url);
    });
    document.querySelectorAll('.habit-app-badge-fallback[data-rule-id="'+ruleId+'"]').forEach(function(el){
      replaceHabitBadgeFallback(el,url);
    });
  }

  function replaceHabitBadgeFallback(el,url){
    if(!el||!url||!el.parentNode) return;
    var name=el.getAttribute('title')||'';
    var cls=String(el.className||'').replace(/\bhabit-app-badge-fallback\b/g,'').trim();
    if(cls.indexOf('has-icon')<0) cls+=' has-icon';
    var wrap=document.createElement('span');
    wrap.className=cls;
    if(name) wrap.title=name;
    var img=document.createElement('img');
    img.className='habit-app-badge-icon';
    img.src=url;
    img.alt='';
    img.decoding='async';
    wrap.appendChild(img);
    el.replaceWith(wrap);
  }

  function fetchRuleIcon(path,rule){
    if(!path||!global.OneToneIpc||!global.OneToneIpc.invoke) return;
    if(ruleIconCache[path]){
      if(rule&&!ruleIconDataUrl(rule)) rule.iconDataUrl=ruleIconCache[path];
      if(rule) applyRuleIconToDom(rule.ruleId,ruleIconCache[path]);
      return;
    }
    var pendingKey='pending:'+path;
    if(ruleIconCache[pendingKey]) return;
    ruleIconCache[pendingKey]=true;
    global.OneToneIpc.invoke('cmd_app_icon',{fullPath:path,full_path:path}).then(function(res){
      delete ruleIconCache[pendingKey];
      var url=res&&(res.iconDataUrl||res.icon_data_url)||'';
      if(!url) return;
      ruleIconCache[path]=url;
      if(rule){
        rule.iconDataUrl=url;
        backfillRuleIconPath(rule);
        applyRuleIconToDom(rule.ruleId,url);
      }
    }).catch(function(){ delete ruleIconCache[pendingKey]; });
  }

  function prefetchMappingRuleIcons(m){
    if(!m) return;
    customRulesForMapping(m).forEach(function(rule){
      if(ruleIconDataUrl(rule)) return;
      backfillRuleIconPath(rule);
      var path=resolveRuleIconPath(rule);
      if(path) fetchRuleIcon(path,rule);
    });
  }

  function replaceChipIconFallback(el,url){
    if(!el||!url||!el.parentNode) return;
    var img=document.createElement('img');
    img.className='keys-app-chip-icon';
    img.src=url;
    img.alt='';
    img.decoding='async';
    el.replaceWith(img);
  }

  function hydrateCustomRuleChipIcons(root){
    root=root||document;
    if(!global.OneToneIpc||!global.OneToneIpc.invoke) return;
    var m=core()&&core().selected?core().selected():null;
    root.querySelectorAll('.keys-app-chip-icon--fallback[data-rule-id]').forEach(function(el){
      var path=el.getAttribute('data-rule-icon-path')||'';
      var ruleId=el.getAttribute('data-rule-id')||'';
      var rule=m&&ruleId?ruleById(m,ruleId):null;
      if(!path&&rule){
        backfillRuleIconPath(rule);
        path=resolveRuleIconPath(rule);
        if(path) el.setAttribute('data-rule-icon-path',path);
      }
      if(!path) return;
      if(ruleIconCache[path]){
        if(el.isConnected) replaceChipIconFallback(el,ruleIconCache[path]);
        if(rule&&!ruleIconDataUrl(rule)) rule.iconDataUrl=ruleIconCache[path];
        return;
      }
      fetchRuleIcon(path,rule);
    });
    root.querySelectorAll('.habit-app-badge-fallback[data-rule-id]').forEach(function(el){
      var path=el.getAttribute('data-rule-icon-path')||'';
      var ruleId=el.getAttribute('data-rule-id')||'';
      var mappingId=el.getAttribute('data-habit-mapping')||'';
      var map=mappingId&&core()&&core().byId?core().byId(mappingId):m;
      var rule=map&&ruleId?ruleById(map,ruleId):null;
      if(!path&&rule){
        backfillRuleIconPath(rule);
        path=resolveRuleIconPath(rule);
        if(path) el.setAttribute('data-rule-icon-path',path);
      }
      if(!path) return;
      if(ruleIconCache[path]){
        if(el.isConnected) replaceHabitBadgeFallback(el,ruleIconCache[path]);
        if(rule&&!ruleIconDataUrl(rule)) rule.iconDataUrl=ruleIconCache[path];
        return;
      }
      fetchRuleIcon(path,rule);
    });
  }

  function scheduleHydrateCustomRuleIcons(){
    setTimeout(function(){
      var m=core()&&core().selected?core().selected():null;
      prefetchMappingRuleIcons(m);
      hydrateCustomRuleChipIcons($('keysAppContextStrip'));
      hydrateCustomRuleChipIcons($('voiceAppScopeChips'));
      hydrateCustomRuleChipIcons($('habitAppRulesList'));
      hydrateCustomRuleChipIcons($('keysAppRulesList'));
      hydrateCustomRuleChipIcons($('habitHubList'));
    },0);
  }

  function customRuleIconHtml(rule,iconClass){
    iconClass=iconClass||'keys-app-chip-icon';
    var name=ruleDisplayName(rule);
    var url=ruleIconDataUrl(rule);
    if(url) return '<img class="'+esc(iconClass)+'" src="'+esc(url)+'" alt="" decoding="async" data-rule-id="'+esc(rule.ruleId)+'" />';
    backfillRuleIconPath(rule);
    var path=resolveRuleIconPath(rule);
    var attrs=' data-rule-id="'+esc(rule.ruleId)+'"';
    if(path) attrs+=' data-rule-icon-path="'+esc(path)+'"';
    return '<span class="'+esc(iconClass)+' keys-app-chip-icon--fallback"'+attrs+' aria-hidden="true">'+esc(name.charAt(0))+'</span>';
  }

  function populateAppPickerForeground(){
    var row=$('appPickerForegroundRow');
    var nameEl=$('appPickerForegroundName');
    var metaEl=$('appPickerForegroundMeta');
    var btn=$('btnAppPickerForeground');
    if(!row||!nameEl||!metaEl||!btn) return;
    pickerForegroundIdentity=null;
    row.hidden=true;
    if(metaEl) metaEl.hidden=false;
    if(!global.OneToneIpc||!global.OneToneIpc.invoke) return;
    global.OneToneIpc.invoke('cmd_foreground_app',{}).then(function(res){
      if(!res||(!res.exeName&&!res.exe_name)) return;
      pickerForegroundIdentity=res;
      var m=resolvePickerMapping();
      if(m&&identityAlreadyInRules(m,res)) return;
      row.hidden=false;
      var name=identityDisplayName(res)||t('appPickerForeground');
      nameEl.textContent=name;
      var exe=String(res.exeName||res.exe_name||'').trim();
      var meta=runningAppPickerMeta(name,exe);
      if(meta) metaEl.textContent=meta;
      else{
        metaEl.textContent='';
        metaEl.hidden=true;
      }
      setPickerItemIcon(
        btn.querySelector('.app-picker-item-icon'),
        resolveAppIconUrl(res),
        (name||'?').charAt(0)
      );
    }).catch(function(){ row.hidden=true; });
  }

  function pickForegroundIdentity(m,identity){
    if(!m||!identity) return;
    var presetId=identity.matchedPresetAppId||identity.matched_preset_app_id||identity.appId;
    if(presetId&&isPresetAppId(String(presetId))){
      pickPresetApp(m,String(presetId));
      return;
    }
    pickRunningIdentity(m,identity);
  }

  function populateAppPicker(){
    var title=$('appPickerTitle');
    var desc=$('appPickerDesc');
    var presetsLbl=$('appPickerPresetsLbl');
    var runningLbl=$('appPickerRunningLbl');
    var presetsHost=$('appPickerPresets');
    var runningHost=$('appPickerRunning');
    var emptyEl=$('appPickerRunningEmpty');
    var cancelBtn=$('btnAppPickerCancel');
    if(title) title.textContent=t('appPickerTitle');
    if(desc) desc.textContent=t('appPickerDesc');
    if(presetsLbl) presetsLbl.textContent=t('appPickerPresets');
    if(runningLbl) runningLbl.textContent=t('appPickerRunning');
    if(cancelBtn) cancelBtn.textContent=t('homeTestPickCancel');
    populateAppPickerForeground();
    if(!presetsHost||!runningHost) return;
    var presetHtml='';
    BEHAVIOR_PRESETS.forEach(function(p){
      presetHtml+=renderAppPickerItem({
        presetId:p.id,
        name:appDisplayName(p.id),
        meta:t(p.noteKey||'habitAppRulesPickApp'),
        icon:iconForApp(p.id)
      });
    });
    presetsHost.innerHTML=presetHtml;
    runningHost.innerHTML='<p class="app-picker-empty">'+esc(t('homeLiveLoading'))+'</p>';
    if(emptyEl) emptyEl.hidden=true;
    pickerRunningCache=[];
    if(!global.OneToneIpc||!global.OneToneIpc.invoke){
      runningHost.innerHTML='';
      if(emptyEl){ emptyEl.hidden=false; emptyEl.textContent=t('appPickerRunningEmpty'); }
      return;
    }
    global.OneToneIpc.invoke('cmd_running_apps',{}).then(function(res){
      var apps=res&&Array.isArray(res.apps)?res.apps:[];
      var m=resolvePickerMapping();
      if(m){
        apps=apps.filter(function(app){ return !identityAlreadyInRules(m,app); });
      }
      pickerRunningCache=apps;
      if(!apps.length){
        runningHost.innerHTML='';
        if(emptyEl){ emptyEl.hidden=false; emptyEl.textContent=t('appPickerRunningEmpty'); }
        return;
      }
      if(emptyEl) emptyEl.hidden=true;
      runningHost.innerHTML=apps.map(function(app,idx){
        var name=String(app.displayName||app.display_name||app.exeName||app.exe_name||'—');
        var exe=String(app.exeName||app.exe_name||'');
        var meta=runningAppPickerMeta(name,exe);
        return renderAppPickerItem({
          pickIndex:idx,
          name:name,
          meta:meta,
          icon:resolveAppIconUrl(app)
        });
      }).join('');
    }).catch(function(err){
      console.error('cmd_running_apps',err);
      runningHost.innerHTML='';
      if(emptyEl){ emptyEl.hidden=false; emptyEl.textContent=t('appPickerRunningFailed'); }
    });
  }

  function openAppPicker(opts){
    opts=opts||{};
    if(opts.mappingId) setPickerCreateTarget(opts.mappingId);
    bindAppPickerEvents();
    var overlay=$('appPickerOverlay');
    if(!overlay) return;
    populateAppPicker();
    overlay.classList.add('open');
    overlay.setAttribute('aria-hidden','false');
  }

  function handleAppPickerClick(e){
    var presetBtn=e.target.closest&&e.target.closest('[data-pick-preset]');
    if(presetBtn){
      e.preventDefault();
      var m=resolvePickerMapping();
      if(!m) return;
      pickPresetApp(m,presetBtn.getAttribute('data-pick-preset')||'');
      closeAppPicker();
      if(global.OneToneVoicePageHeaderRender&&global.OneToneVoicePageHeaderRender.renderAppScope){
        var vm=global.OneToneVoiceSettingsViewModel;
        if(vm&&vm.build) global.OneToneVoicePageHeaderRender.renderAppScope(vm.build());
      }
      return;
    }
    var runBtn=e.target.closest&&e.target.closest('[data-pick-running]');
    if(runBtn){
      e.preventDefault();
      var m2=resolvePickerMapping();
      if(!m2) return;
      var idx=parseInt(runBtn.getAttribute('data-pick-running')||'',10);
      var identity=pickerRunningCache[idx];
      if(identity) pickRunningIdentity(m2,identity);
      closeAppPicker();
      if(global.OneToneVoicePageHeaderRender&&global.OneToneVoicePageHeaderRender.renderAppScope){
        var vm2=global.OneToneVoiceSettingsViewModel;
        if(vm2&&vm2.build) global.OneToneVoicePageHeaderRender.renderAppScope(vm2.build());
      }
    }
  }

  function bindAppPickerEvents(){
    var overlay=$('appPickerOverlay');
    if(!overlay||overlay.dataset.bound==='1') return;
    overlay.dataset.bound='1';
    overlay.addEventListener('click',function(e){
      if(e.target===overlay) closeAppPicker();
      handleAppPickerClick(e);
    });
    var closeBtn=$('btnAppPickerClose');
    if(closeBtn) closeBtn.addEventListener('click',function(e){ e.preventDefault(); closeAppPicker(); });
    var cancelBtn=$('btnAppPickerCancel');
    if(cancelBtn) cancelBtn.addEventListener('click',function(e){ e.preventDefault(); closeAppPicker(); });
    var fgBtn=$('btnAppPickerForeground');
    if(fgBtn){
      fgBtn.addEventListener('click',function(e){
        e.preventDefault();
        e.stopPropagation();
        var m=resolvePickerMapping();
        if(!m||!pickerForegroundIdentity) return;
        pickForegroundIdentity(m,pickerForegroundIdentity);
        closeAppPicker();
        if(global.OneToneVoicePageHeaderRender&&global.OneToneVoicePageHeaderRender.renderAppScope){
          var vm=global.OneToneVoiceSettingsViewModel;
          if(vm&&vm.build) global.OneToneVoicePageHeaderRender.renderAppScope(vm.build());
        }
      });
    }
  }

  function renderContextChipsHtml(m,opts){
    opts=opts||{};
    var variant=opts.variant==='tile'?'tile':'chip';
    var ctxId=opts.contextId!=null?opts.contextId:activeContextRef();
    var primaryId=m?String(m.appTargetId||'').trim():'';
    var noneSelected=!ctxId&&!primaryId;
    var chipAttr=opts.chipAttr||'data-app-context';
    var noneAttr=opts.noneAttr||'data-app-chip-none';
    var chipClass=variant==='tile'?'keys-app-chip keys-app-chip--tile':'keys-app-chip';
    var iconClass=variant==='tile'?'keys-app-chip-icon keys-app-chip-icon--tile':'keys-app-chip-icon';
    var html='';
    if(opts.includeNone!==false){
      html+='<button type="button" class="'+chipClass+' keys-app-chip--none'+(noneSelected?' is-selected':'')+'" '+noneAttr+'="1" role="radio" aria-checked="'+(noneSelected?'true':'false')+'" title="'+esc(t('keysAppChipNoneHint'))+'"><span>'+esc(t('keysAppChipNone'))+'</span></button>';
    }
    BEHAVIOR_PRESETS.forEach(function(p){
      var icon=presetIcon(p.id);
      var isSel=ctxId===p.id;
      var isPri=m&&primaryId===p.id;
      var isActive=isSel||isPri;
      var name=appDisplayName(p.id);
      html+='<button type="button" class="'+chipClass+(isActive?' is-selected':'')+(isPri&&!isSel?' is-primary':'')+'" '+chipAttr+'="'+esc(p.id)+'" role="radio" aria-checked="'+(isActive?'true':'false')+'" title="'+esc(name)+'">';
      if(icon) html+='<img class="'+iconClass+'" src="'+esc(icon)+'" alt="" decoding="async" />';
      html+='<span>'+esc(name)+'</span></button>';
    });
    if(m) customRulesForMapping(m).forEach(function(rule){
      var isSel=ctxId===rule.ruleId;
      var name=ruleDisplayName(rule);
      html+='<span class="keys-app-chip-wrap keys-app-chip-wrap--custom'+(variant==='tile'?' keys-app-chip-wrap--tile':'')+'">';
      html+='<button type="button" class="'+chipClass+' keys-app-chip--custom'+(isSel?' is-selected':'')+'" data-rule-context="'+esc(rule.ruleId)+'" role="radio" aria-checked="'+(isSel?'true':'false')+'" title="'+esc(name)+'">';
      html+=customRuleIconHtml(rule,iconClass);
      html+='<span>'+esc(name)+'</span></button>';
      html+='<button type="button" class="keys-app-chip-del" data-rule-delete="'+esc(rule.ruleId)+'" aria-label="'+esc(t('habitAppRuleDelete'))+'">×</button>';
      html+='</span>';
    });
    return html;
  }

  function presetIcon(appId){
    return iconForApp(appId);
  }

  global.OneToneAppBehaviorRules={
    render:renderAppBehaviorRules,
    bindEvents:bindEvents,
    handleListClick:handleAppRulesListClick,
    bindKeysAsideEvents:bindKeysAsideEvents,
    renderKeysAside:renderKeysAside,
    renderVoiceAside:renderVoiceAside,
    setActiveAppContextId:setActiveAppContextId,
    setActiveRuleContext:setActiveRuleContext,
    selectAppContext:selectAppContext,
    setKeysExpandedAppId:setKeysExpandedAppId,
    getKeysExpandedAppId:getKeysExpandedAppId,
    getActiveAppContextId:function(){ return activeAppContextId; },
    activeContextRef:activeContextRef,
    resolveEffectiveFinish:resolveEffectiveFinish,
    setAppFinishMode:setAppFinishMode,
    setRuleFinishMode:setRuleFinishMode,
    ensurePrimaryAppRule:ensurePrimaryAppRule,
    ensureRulesBeforeSave:ensureRulesBeforeSave,
    finishModeLabel:finishModeLabel,
    ensureRules:ensureRules,
    behaviorPresets:BEHAVIOR_PRESETS,
    renderActiveScenarioBanner:renderActiveScenarioBanner,
    appDisplayName:appDisplayName,
    ruleDisplayName:ruleDisplayName,
    voiceSummonPhrase:voiceSummonPhrase,
    saveSummonPhrase:saveSummonPhrase,
    renderSummonPhraseEditor:renderSummonPhraseEditor,
    ensureCustomSummonPhrase:ensureCustomSummonPhrase,
    ruleById:ruleById,
    ruleForContext:ruleForContext,
    removeRuleById:removeRuleById,
    customRulesForMapping:customRulesForMapping,
    addCustomRuleFromIdentity:addCustomRuleFromIdentity,
    openAppPicker:openAppPicker,
    ruleIconDataUrl:ruleIconDataUrl,
    setPickerCreateTarget:setPickerCreateTarget,
    clearPickerCreateTarget:clearPickerCreateTarget,
    renderContextChipsHtml:renderContextChipsHtml,
    isPresetAppId:isPresetAppId,
    isCustomRule:isCustomRule,
    isContextRuleId:isContextRuleId,
    matchRuleForMapping:matchRuleForMapping,
    resolveForegroundContextRef:resolveForegroundContextRef,
    resolvePreviewContext:resolvePreviewContext,
    identityDisplayName:identityDisplayName,
    hydrateCustomRuleChipIcons:hydrateCustomRuleChipIcons,
    scheduleHydrateCustomRuleIcons:scheduleHydrateCustomRuleIcons,
    prefetchMappingRuleIcons:prefetchMappingRuleIcons,
    backfillRuleIconPath:backfillRuleIconPath,
    resolveRuleIconPath:resolveRuleIconPath,
    ruleMatchesIdentity:ruleMatchesIdentity
  };
})((typeof window!=='undefined')?window:globalThis);
