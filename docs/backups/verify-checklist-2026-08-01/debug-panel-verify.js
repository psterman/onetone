  var VERIFY_STORAGE_KEY='ot_verify_checklist_v1';
  var verifyChecklistBound=false;
  var verifyRenderTimer=0;
  if(!global.__otVerifySeen){
    global.__otVerifySeen={paused:false,resumed:false,triggered:false,errored:false,refreshedLive:false};
  }

  function verifyItemDefs(){
    return [
      {group:'proto',id:'proto1',titleKey:'debugVerifyProto1',howKey:'debugVerifyProto1How',qc:'listenPause'},
      {group:'proto',id:'proto2',titleKey:'debugVerifyProto2',howKey:'debugVerifyProto2How',qc:'listenResume'},
      {group:'proto',id:'proto3',titleKey:'debugVerifyProto3',howKey:'debugVerifyProto3How',qc:'trigger'},
      {group:'proto',id:'proto4',titleKey:'debugVerifyProto4',howKey:'debugVerifyProto4How',qc:'simulateError'},
      {group:'proto',id:'proto5',titleKey:'debugVerifyProto5',howKey:'debugVerifyProto5How',qc:'refresh'},
      {group:'gate',id:'g14',titleKey:'debugVerifyG14',howKey:'debugVerifyG14How',passKey:'debugVerifyG14Pass',panel:'keys'},
      {group:'gate',id:'g15',titleKey:'debugVerifyG15',howKey:'debugVerifyG15How',passKey:'debugVerifyG15Pass',panel:'keys'},
      {group:'gate',id:'g16',titleKey:'debugVerifyG16',howKey:'debugVerifyG16How',passKey:'debugVerifyG16Pass',panel:'keys'},
      {group:'gate',id:'g17',titleKey:'debugVerifyG17',howKey:'debugVerifyG17How',passKey:'debugVerifyG17Pass',panel:'keys'},
      {group:'gate',id:'g18',titleKey:'debugVerifyG18',howKey:'debugVerifyG18How',passKey:'debugVerifyG18Pass',panel:'keys'},
      {group:'gate',id:'g19',titleKey:'debugVerifyG19',howKey:'debugVerifyG19How',passKey:'debugVerifyG19Pass',panel:'keys'},
      {group:'gate',id:'g20',titleKey:'debugVerifyG20',howKey:'debugVerifyG20How',passKey:'debugVerifyG20Pass',panel:'softPad'},
      {group:'gate',id:'g21',titleKey:'debugVerifyG21',howKey:'debugVerifyG21How',passKey:'debugVerifyG21Pass',panel:'softPad'},
      {group:'gate',id:'g22',titleKey:'debugVerifyG22',howKey:'debugVerifyG22How',passKey:'debugVerifyG22Pass',panel:'softPad'},
      {group:'gate',id:'g23',titleKey:'debugVerifyG23',howKey:'debugVerifyG23How',passKey:'debugVerifyG23Pass',panel:'softPad'},
      {group:'gate',id:'g24',titleKey:'debugVerifyG24',howKey:'debugVerifyG24How',passKey:'debugVerifyG24Pass',panel:'softPad'},
      {group:'gate',id:'g25',titleKey:'debugVerifyG25',howKey:'debugVerifyG25How',passKey:'debugVerifyG25Pass',panel:'softPad'},
      {group:'gate',id:'g26',titleKey:'debugVerifyG26',howKey:'debugVerifyG26How',passKey:'debugVerifyG26Pass',panel:'voiceWake'},
      {group:'gate',id:'g27',titleKey:'debugVerifyG27',howKey:'debugVerifyG27How',passKey:'debugVerifyG27Pass',panel:'camera'},
      {group:'gate',id:'g28',titleKey:'debugVerifyG28',howKey:'debugVerifyG28How',passKey:'debugVerifyG28Pass',panel:'debug',debugMode:'overview'}
    ];
  }

  function loadVerifyState(){
    try{
      var raw=localStorage.getItem(VERIFY_STORAGE_KEY);
      if(!raw) return {};
      var parsed=JSON.parse(raw);
      return parsed&&typeof parsed==='object'?parsed:{};
    }catch(_){ return {}; }
  }

  function saveVerifyState(state){
    try{ localStorage.setItem(VERIFY_STORAGE_KEY,JSON.stringify(state||{})); }catch(_){}
  }

  function scheduleVerifyChecklist(){
    if(verifyRenderTimer) return;
    verifyRenderTimer=setTimeout(function(){
      verifyRenderTimer=0;
      maybeAutoMarkProtoSteps();
      renderVerifyChecklist();
    },60);
  }

  function maybeAutoMarkProtoSteps(){
    var snap=readProtocolSnap();
    var tok=String(snap.statusToken||'idle');
    var hero=readHeroStatusToken();
    var aligned=!hero||hero==='—'||hero===tok;
    var seen=global.__otVerifySeen;
    if(tok==='paused'&&(snap.canResume||runtime().paused)) seen.paused=true;
    if(seen.paused&&(tok==='listening'||tok==='idle'||tok==='dictating')&&!snap.canResume&&!runtime().paused){
      seen.resumed=true;
    }
    if((tok==='triggered'||tok==='dictating')&&String(snap.lastEventText||'').trim()){
      seen.triggered=true;
    }
    if(tok==='error'&&String(snap.repairText||'').trim()){
      seen.errored=true;
    }
    if(seen.errored&&!global.__otRuntimeStatusOverride&&tok!=='error'&&aligned){
      seen.refreshedLive=true;
    }
    var st=loadVerifyState();
    var changed=false;
    function mark(id,cond){
      if(cond&&!st[id]){ st[id]=true; changed=true; }
    }
    mark('proto1',seen.paused);
    mark('proto2',seen.resumed);
    mark('proto3',seen.triggered);
    mark('proto4',seen.errored);
    mark('proto5',seen.refreshedLive);
    if(changed){
      saveVerifyState(st);
      try{
        if(global.OneToneUi&&global.OneToneUi.toast){
          // avoid toast spam: only once per session wave
          if(!global.__otVerifyAutoToasted){
            global.__otVerifyAutoToasted=true;
            global.OneToneUi.toast(t('debugVerifyAutoMarked'));
            setTimeout(function(){ global.__otVerifyAutoToasted=false; },2500);
          }
        }
      }catch(_){}
    }
    return changed;
  }

  function firstUncheckedVerifyItem(state){
    state=state||loadVerifyState();
    var defs=verifyItemDefs();
    for(var i=0;i<defs.length;i++){
      if(!state[defs[i].id]) return defs[i];
    }
    return null;
  }

  function runVerifyNext(){
    var next=firstUncheckedVerifyItem();
    if(!next){
      if(global.OneToneUi&&global.OneToneUi.toast) global.OneToneUi.toast(t('debugVerifyAllDone'));
      return;
    }
    var el=$('debugVerifyChecklist')&&$('debugVerifyChecklist').querySelector('[data-verify-id="'+next.id+'"]');
    if(el&&el.scrollIntoView) el.scrollIntoView({block:'nearest',behavior:'smooth'});
    if(next.qc) runVerifyQc(next.qc);
    else openVerifyPanel(next);
  }

  function clickQuickCtrlAct(act){
    scheduleQuickControlPanel(true);
    var btn=$('debugQuickCtrlActions')&&$('debugQuickCtrlActions').querySelector('[data-qc-act="'+act+'"]');
    if(btn&&!btn.disabled){ btn.click(); return true; }
    return false;
  }

  function runVerifyQc(qc){
    if(qc==='listenPause'){
      var snap=readProtocolSnap();
      if(snap.canResume||runtime().paused){
        scheduleQuickControlPanel(true);
        scheduleVerifyChecklist();
        return;
      }
      clickQuickCtrlAct('listen');
      scheduleVerifyChecklist();
      return;
    }
    if(qc==='listenResume'){
      var cur=readProtocolSnap();
      if(!(cur.canResume||runtime().paused)){
        clickQuickCtrlAct('listen');
        setTimeout(function(){ clickQuickCtrlAct('listen'); scheduleVerifyChecklist(); },180);
        return;
      }
      clickQuickCtrlAct('listen');
      scheduleVerifyChecklist();
      return;
    }
    if(qc==='trigger'||qc==='simulateError'||qc==='refresh'){
      if(!clickQuickCtrlAct(qc)){
        scheduleQuickControlPanel(true);
        setTimeout(function(){ clickQuickCtrlAct(qc); scheduleVerifyChecklist(); },50);
      }else{
        scheduleVerifyChecklist();
      }
    }
  }

  function openVerifyPanel(item){
    if(!item||!item.panel) return;
    var opts={panel:item.panel};
    if(item.debugMode) opts.debugMode=item.debugMode;
    if(global.OneToneSettingsDrawer&&global.OneToneSettingsDrawer.open){
      global.OneToneSettingsDrawer.open(opts);
    }
  }

  function copyVerifyProgress(){
    var state=loadVerifyState();
    var defs=verifyItemDefs();
    var lines=defs.map(function(d){
      var ok=!!state[d.id];
      return (ok?'[x]':'[ ]')+' '+t(d.titleKey);
    });
    var text=lines.join('\n');
    function done(){
      if(global.OneToneUi&&global.OneToneUi.toast) global.OneToneUi.toast(t('debugVerifyCopied'));
      else try{ console.info(text); }catch(_){}
    }
    if(navigator.clipboard&&navigator.clipboard.writeText){
      navigator.clipboard.writeText(text).then(done).catch(function(){
        try{ console.info(text); }catch(_){}
        done();
      });
    }else{
      try{ console.info(text); }catch(_){}
      done();
    }
  }

  function renderVerifyChecklist(){
    var host=$('debugVerifyChecklist');
    var panel=$('debugVerifyChecklistPanel');
    if(!host||!panel) return;
    var section=$('debugFocusDeveloperSection');
    if(section&&section.hidden) return;

    maybeAutoMarkProtoSteps();
    var state=loadVerifyState();
    var defs=verifyItemDefs();
    var done=0;
    defs.forEach(function(d){ if(state[d.id]) done++; });
    var progress=$('debugVerifyProgress');
    if(progress){
      progress.textContent=done+'/'+defs.length;
      progress.classList.toggle('is-done',done===defs.length&&defs.length>0);
    }

    var next=firstUncheckedVerifyItem(state);
    var nextHost=$('debugVerifyNext');
    if(nextHost){
      if(next){
        nextHost.hidden=false;
        var nextAction=next.qc?t('debugVerifyDo'):t('debugVerifyOpen');
        nextHost.innerHTML=
          '<div><strong>'+esc(t('debugVerifyNextLabel'))+'：</strong> '+esc(t(next.titleKey))
          +'<div class="ot-verify-item-how" style="margin:4px 0 0">'+esc(t(next.howKey))+'</div></div>'
          +'<button type="button" class="control-btn" data-verify-act="next">'+esc(nextAction)+'</button>';
      }else{
        nextHost.hidden=false;
        nextHost.innerHTML='<div><strong>'+esc(t('debugVerifyAllDone'))+'</strong></div>';
      }
    }

    var html='';
    var lastGroup='';
    defs.forEach(function(d){
      if(d.group!==lastGroup){
        lastGroup=d.group;
        html+='<p class="ot-verify-group-title">'
          +esc(t(d.group==='proto'?'debugVerifyGroupProto':'debugVerifyGroupGate'))
          +'</p>';
      }
      var checked=!!state[d.id];
      var isCurrent=next&&next.id===d.id;
      var actionLabel=d.qc?t('debugVerifyDo'):t('debugVerifyOpen');
      var actionAttr=d.qc?('data-verify-qc="'+esc(d.qc)+'"'):('data-verify-panel="'+esc(d.panel||'')+'"');
      if(d.debugMode) actionAttr+=' data-verify-debug="'+esc(d.debugMode)+'"';
      html+='<div class="ot-verify-item'+(checked?' is-done':'')+(isCurrent?' is-current':'')+'" role="listitem" data-verify-id="'+esc(d.id)+'">'
        +'<input type="checkbox" '+(checked?'checked ':'')+'aria-label="'+esc(t(d.titleKey))+'" data-verify-check="'+esc(d.id)+'"/>'
        +'<div class="ot-verify-item-body">'
        +'<div class="ot-verify-item-title">'+esc(t(d.titleKey))+'</div>'
        +'<p class="ot-verify-item-how">'+esc(t(d.howKey))+'</p>'
        +(d.passKey?('<p class="ot-verify-item-pass"><strong>'+esc(t('debugVerifyPass'))+'：</strong>'+esc(t(d.passKey))+'</p>'):'')
        +'</div>'
        +'<button type="button" class="control-btn" '+actionAttr+'>'+esc(actionLabel)+'</button>'
        +'</div>';
    });
    host.innerHTML=html;

    if(next){
      var curEl=host.querySelector('[data-verify-id="'+next.id+'"]');
      if(curEl&&curEl.scrollIntoView){
        try{ curEl.scrollIntoView({block:'nearest'}); }catch(_){}
      }
    }

    if(!verifyChecklistBound){
      verifyChecklistBound=true;
      panel.addEventListener('change',function(e){
        var box=e.target&&e.target.closest&&e.target.closest('[data-verify-check]');
        if(!box) return;
        var id=box.getAttribute('data-verify-check');
        var st=loadVerifyState();
        if(box.checked) st[id]=true; else delete st[id];
        saveVerifyState(st);
        renderVerifyChecklist();
      });
      panel.addEventListener('click',function(e){
        var nextBtn=e.target.closest&&e.target.closest('[data-verify-act="next"]');
        if(nextBtn){
          runVerifyNext();
          return;
        }
        var reset=e.target.closest&&e.target.closest('[data-verify-act="reset"]');
        if(reset){
          saveVerifyState({});
          global.__otVerifySeen={paused:false,resumed:false,triggered:false,errored:false,refreshedLive:false};
          renderVerifyChecklist();
          return;
        }
        var copy=e.target.closest&&e.target.closest('[data-verify-act="copy"]');
        if(copy){
          copyVerifyProgress();
          return;
        }
        var qcBtn=e.target.closest&&e.target.closest('[data-verify-qc]');
        if(qcBtn){
          runVerifyQc(qcBtn.getAttribute('data-verify-qc'));
          return;
        }
        var openBtn=e.target.closest&&e.target.closest('[data-verify-panel]');
        if(openBtn){
          openVerifyPanel({
            panel:openBtn.getAttribute('data-verify-panel'),
            debugMode:openBtn.getAttribute('data-verify-debug')||null
          });
        }
      });
    }
  }
