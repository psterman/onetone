(function(global){
  'use strict';

  var $=function(id){ return global.OneToneDom.$(id); };
  var t=function(key){ return global.OneToneI18n.t(key); };

  var onChangeCb=null;
  var boundHost=null;
  var recordWatchTimer=0;
  var lastMappingId='';

  function state(){ return global.OneToneState.state; }
  function core(){ return global.OneToneMappingCore; }
  function ed(){ return global.OneToneMappingEditorState; }
  function diffApi(){ return global.OneToneHabitOverrideDiff; }
  function hooks(){ return global.__vp_bootstrap_hooks__||{}; }

  function esc(s){
    return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');
  }

  function friendlyKey(key){
    key=String(key||'').trim();
    if(!key) return '—';
    if(global.OneToneKeyLabels&&global.OneToneKeyLabels.friendlyKeyName){
      return global.OneToneKeyLabels.friendlyKeyName(key,global.OneToneI18n.getLang())||key;
    }
    if(hooks().friendlyKeyName) return hooks().friendlyKeyName(key)||key;
    return key;
  }

  function keyBaseline(){
    var cfg=state().config||{};
    return diffApi()&&diffApi().getGlobalKeyBaseline
      ?diffApi().getGlobalKeyBaseline(cfg,core())
      :{triggerKey:'',targetKey:'',autoEnterEnabled:true,cancelEnabled:true,triggerMode:'tap'};
  }

  function effectiveTrigger(m,baseline){
    var v=String(m&&m.triggerKey||'').trim();
    return v||String(baseline.triggerKey||'').trim();
  }

  function effectiveTarget(m,baseline){
    var v=String(m&&m.targetKey||'').trim();
    return v||String(baseline.targetKey||'').trim();
  }

  function normalizeTriggerModeUi(raw){
    raw=String(raw||'tap').toLowerCase();
    if(raw==='hold'||raw==='longpress'||raw==='perpress') return 'hold';
    if(raw==='double') return 'double';
    return 'tap';
  }

  function triggerModeStorage(modeUi){
    if(modeUi==='hold') return 'longpress';
    if(modeUi==='double') return 'double';
    return 'tap';
  }

  function fieldBadge(field,m,baseline){
    var st=diffApi()&&diffApi().fieldKeyStatus?diffApi().fieldKeyStatus(field,m,baseline):'inherited';
    var cls=st==='overridden'?'is-override':'is-inherit';
    var lbl=st==='overridden'?t('habitOverridden'):t('habitInheritGlobal');
    return '<span class="habit-scenario-field-badge '+cls+'">'+esc(lbl)+'</span>';
  }

  function keyModeEnabled(m){
    return m?m.keyModeEnabled!==false:true;
  }

  function notifyChange(){
    if(typeof onChangeCb==='function') onChangeCb();
  }

  function syncEditorFromMapping(m){
    if(!m||!ed()) return;
    var baseline=keyBaseline();
    ed().setEditorTriggerKey(m.triggerKey||'');
    ed().setEditorTargetKey(m.targetKey||'');
    if(ed().setEditorAppTargetId) ed().setEditorAppTargetId(m.appTargetId||'');
  }

  function clearRecordWatch(){
    if(recordWatchTimer){
      clearInterval(recordWatchTimer);
      recordWatchTimer=0;
    }
  }

  function watchRecordingDone(mappingId,field){
    clearRecordWatch();
    var rec=global.OneToneMappingRecording;
    if(!rec) return;
    var prevMode=rec.mode();
    recordWatchTimer=setInterval(function(){
      var mode=rec.mode();
      if(mode!=='none'&&mode!=='trigger'&&mode!=='target') return;
      if(mode==='none'&&prevMode!=='none'){
        clearRecordWatch();
        notifyChange();
      }
      prevMode=mode;
    },120);
  }

  function startRecord(mappingId,kind){
    var rec=global.OneToneMappingRecording;
    if(!rec||rec.mode()!=='none'||rec.isPending&&rec.isPending()) return;
    syncEditorFromMapping(core()&&core().byId?core().byId(mappingId):null);
    var run=kind==='target'?rec.startTarget:rec.startTrigger;
    if(!run) return;
    Promise.resolve(run(mappingId)).then(function(ok){
      if(ok) watchRecordingDone(mappingId,kind);
    });
  }

  function renderFieldRow(opts){
    var baseline=opts.baseline;
    var m=opts.mapping;
    var field=opts.field;
    var label=opts.label;
    var value=opts.value;
    var recordKind=opts.recordKind;
    var disabled=!!opts.disabled;
    return ''
      +'<div class="habit-scenario-keys-field'+(disabled?' is-disabled':'')+'" data-scenario-keys-field="'+esc(field)+'">'
      +'<div class="habit-scenario-keys-field-head">'
      +'<span class="habit-scenario-keys-field-lbl">'+esc(label)+'</span>'
      +fieldBadge(field,m,baseline)
      +'</div>'
      +'<div class="habit-scenario-keys-field-body">'
      +'<div class="habit-scenario-keys-keycap" id="habitScenarioKeys'+esc(field.charAt(0).toUpperCase()+field.slice(1))+'Disp">'+esc(friendlyKey(value))+'</div>'
      +'<button type="button" class="btn btn-ghost btn-sm habit-scenario-keys-record" data-scenario-record="'+esc(recordKind)+'"'
      +(disabled?' disabled':'')+'>'
      +esc(value?t('habitScenarioKeysRerecord'):t('habitScenarioKeysRecord'))
      +'</button>'
      +'</div>'
      +'</div>';
  }

  function renderAdvanced(m,baseline,disabled){
    var modeUi=normalizeTriggerModeUi(m.triggerMode!=null?m.triggerMode:baseline.triggerMode);
    var modes=[
      {id:'hold',label:'keysTriggerModeHold',mode:'longpress'},
      {id:'tap',label:'keysTriggerModeTap',mode:'tap'},
      {id:'double',label:'keysTriggerModeDouble',mode:'double'}
    ];
    var modeHtml='<div class="keys-trigger-modes habit-scenario-keys-modes" role="radiogroup">';
    modes.forEach(function(opt){
      var active=modeUi===opt.id;
      modeHtml+='<button type="button" class="keys-trigger-mode-seg'+(active?' is-active':'')+'"'
        +' data-scenario-trigger-mode="'+esc(opt.mode)+'" role="radio" aria-checked="'+(active?'true':'false')+'"'
        +(disabled?' disabled':'')+'>'
        +esc(t(opt.label))+'</button>';
    });
    modeHtml+='</div>';
    var autoOn=m.autoEnterEnabled!=null?!!m.autoEnterEnabled:!!baseline.autoEnterEnabled;
    var cancelOn=m.cancelEnabled!=null?!!m.cancelEnabled:!!baseline.cancelEnabled;
    return ''
      +'<details class="habit-scenario-keys-advanced">'
      +'<summary class="habit-scenario-keys-advanced-summary">'+esc(t('habitScenarioKeysAdvanced'))+'</summary>'
      +'<div class="habit-scenario-keys-advanced-body">'
      +'<div class="habit-scenario-keys-advanced-block">'
      +'<span class="habit-scenario-keys-field-lbl">'+esc(t('keysWorkflowFooterTrigger'))+'</span>'
      +fieldBadge('finish',m,baseline)
      +modeHtml
      +'</div>'
      +'<div class="habit-scenario-keys-toggle-row">'
      +'<span>'+esc(t('habitScenarioKeysAutoEnter'))+'</span>'
      +'<button type="button" class="toggle-switch habit-scenario-keys-toggle" data-scenario-keys-toggle="autoEnter"'
      +' role="switch" aria-checked="'+(autoOn?'true':'false')+'"'
      +(disabled?' disabled':'')+'></button>'
      +'</div>'
      +'<div class="habit-scenario-keys-toggle-row">'
      +'<span>'+esc(t('habitScenarioKeysCancel'))+'</span>'
      +'<button type="button" class="toggle-switch habit-scenario-keys-toggle" data-scenario-keys-toggle="cancel"'
      +' role="switch" aria-checked="'+(cancelOn?'true':'false')+'"'
      +(disabled?' disabled':'')+'></button>'
      +'</div>'
      +'</div>'
      +'</details>';
  }

  function render(m,opts){
    opts=opts||{};
    var host=$('habitScenarioKeysBody');
    if(!host) return;
    lastMappingId=m&&m.id||'';
    if(!m){
      host.innerHTML='<p class="habit-scenario-tab-body-placeholder">'+esc(t('habitScenarioMainPlaceholder'))+'</p>';
      return;
    }
    var baseline=keyBaseline();
    var disabled=!keyModeEnabled(m);
    var trig=effectiveTrigger(m,baseline);
    var tgt=effectiveTarget(m,baseline);
    var modeOn=keyModeEnabled(m);
    host.innerHTML=''
      +'<div class="habit-scenario-keys-editor">'
      +'<div class="habit-scenario-keys-mode-row">'
      +'<span class="habit-scenario-keys-mode-lbl">'+esc(t('habitScenarioEnableKeys'))+'</span>'
      +'<button type="button" class="toggle-switch habit-scenario-keys-mode-toggle" id="habitScenarioKeysModeToggle"'
      +' role="switch" aria-checked="'+(modeOn?'true':'false')+'"></button>'
      +'</div>'
      +renderFieldRow({mapping:m,baseline:baseline,field:'triggerKey',label:t('keysSummaryTriggerLbl'),value:trig,recordKind:'trigger',disabled:disabled})
      +renderFieldRow({mapping:m,baseline:baseline,field:'targetKey',label:t('habitScenarioKeysTargetLbl'),value:tgt,recordKind:'target',disabled:disabled})
      +renderAdvanced(m,baseline,disabled)
      +'</div>';
    var modeToggle=$('habitScenarioKeysModeToggle');
    if(modeToggle) modeToggle.classList.toggle('is-on',modeOn);
    host.querySelectorAll('.habit-scenario-keys-toggle').forEach(function(btn){
      var kind=btn.getAttribute('data-scenario-keys-toggle');
      var on=kind==='autoEnter'
        ?(m.autoEnterEnabled!=null?!!m.autoEnterEnabled:!!baseline.autoEnterEnabled)
        :(m.cancelEnabled!=null?!!m.cancelEnabled:!!baseline.cancelEnabled);
      btn.classList.toggle('is-on',on);
      btn.setAttribute('aria-checked',on?'true':'false');
    });
  }

  function handleClick(e){
    var host=$('habitScenarioKeysBody');
    if(!host||!host.contains(e.target)) return false;
    var m=core()&&core().byId&&lastMappingId?core().byId(lastMappingId):null;
    if(!m) return false;
    var baseline=keyBaseline();
    var modeToggle=e.target.closest&&e.target.closest('#habitScenarioKeysModeToggle');
    if(modeToggle){
      e.preventDefault();
      m.keyModeEnabled=!keyModeEnabled(m);
      modeToggle.classList.toggle('is-on',keyModeEnabled(m));
      modeToggle.setAttribute('aria-checked',keyModeEnabled(m)?'true':'false');
      render(m);
      notifyChange();
      return true;
    }
    var recBtn=e.target.closest&&e.target.closest('[data-scenario-record]');
    if(recBtn){
      e.preventDefault();
      if(!keyModeEnabled(m)) return true;
      startRecord(m.id,recBtn.getAttribute('data-scenario-record'));
      return true;
    }
    var modeBtn=e.target.closest&&e.target.closest('[data-scenario-trigger-mode]');
    if(modeBtn){
      e.preventDefault();
      if(!keyModeEnabled(m)) return true;
      var ui=normalizeTriggerModeUi(modeBtn.getAttribute('data-scenario-trigger-mode'));
      m.triggerMode=triggerModeStorage(ui);
      render(m);
      notifyChange();
      return true;
    }
    var toggleBtn=e.target.closest&&e.target.closest('[data-scenario-keys-toggle]');
    if(toggleBtn){
      e.preventDefault();
      if(!keyModeEnabled(m)) return true;
      var kind=toggleBtn.getAttribute('data-scenario-keys-toggle');
      if(kind==='autoEnter'){
        var autoBase=!!baseline.autoEnterEnabled;
        var cur=m.autoEnterEnabled!=null?!!m.autoEnterEnabled:autoBase;
        m.autoEnterEnabled=!cur;
      }else{
        var cancelBase=!!baseline.cancelEnabled;
        var curC=m.cancelEnabled!=null?!!m.cancelEnabled:cancelBase;
        m.cancelEnabled=!curC;
      }
      render(m);
      notifyChange();
      return true;
    }
    return false;
  }

  function bindEvents(opts){
    opts=opts||{};
    onChangeCb=opts.onChange||null;
    if(boundHost) return;
    boundHost=document;
    boundHost.addEventListener('click',function(e){
      if(handleClick(e)) e.stopPropagation();
    });
  }

  function setOnChange(fn){ onChangeCb=fn; }

  global.OneToneHabitScenarioKeysEditor={
    render:render,
    bindEvents:bindEvents,
    setOnChange:setOnChange,
    syncEditorFromMapping:syncEditorFromMapping,
    keyModeEnabled:keyModeEnabled
  };
})((typeof window!=='undefined')?window:globalThis);
