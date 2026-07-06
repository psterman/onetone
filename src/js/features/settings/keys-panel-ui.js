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

  function activeAppId(m){
    var preview=ed()&&ed().getEditorPreviewAppId?ed().getEditorPreviewAppId():'';
    if(preview) return preview;
    if(appRules()&&appRules().getPreviewAppId) return appRules().getPreviewAppId()||'';
    return m&&String(m.appTargetId||'').trim()||'';
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
    var appId=activeAppId(m);
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
      keysAdvTimingTitle:'keysAdvTimingTitle',
      keysAdvCancelTitle:'keysAdvCancelTitle',
      keysAdvImeTitle:'habitAdvancedImeTitle',
      keysAdvPriorityTitle:'keysAdvPriorityTitle',
      keysAdvPriorityDesc:'keysAdvPriorityDesc'
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

  function renderStatusChips(){
    var m=core()&&core().selected?core().selected():null;
    renderHabitSwitcher();
    renderAppContext();
    var imeVal=$('keysStatusImeVal');
    var finishVal=$('keysStatusFinishVal');
    var tgt=m&&core().editorTarget?core().editorTarget(m):((m&&m.targetKey)||'').trim();
    if(imeVal){
      imeVal.textContent=tgt?t('keysStatusSet'):t('keysStatusUnset');
      imeVal.classList.toggle('is-set',!!tgt);
      imeVal.classList.toggle('is-unset',!tgt);
    }
    var finText='—';
    if(m&&global.OneToneSceneFlowSummary){
      var preview=activeAppId(m);
      finText=global.OneToneSceneFlowSummary.finishBehaviorTextSettings(m,preview).text||'—';
    }
    if(finishVal){
      finishVal.textContent=finText;
      finishVal.classList.toggle('is-set',finText!=='—');
    }
    var labels={
      keysStatusImeLbl:'keysStatusImeLbl',
      keysStatusFinishLbl:'keysStatusFinishLbl',
      keysAdvancedDesc:'keysAdvancedDesc',
      keysAppShortcutsTitle:'habitAppShortcutsTitle',
      keysAppShortcutsDesc:'keysAppShortcutsDesc'
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
  }

  global.OneToneKeysPanelUi={
    render:render,
    bindEvents:bindEvents,
    renderRecordingFeedback:renderRecordingFeedback,
    renderAppContext:renderAppContext
  };
})((typeof window!=='undefined')?window:globalThis);
