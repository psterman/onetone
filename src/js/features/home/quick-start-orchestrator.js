(function(global){
  'use strict';

  var $=function(id){ return global.OneToneDom&&global.OneToneDom.$?global.OneToneDom.$(id):document.getElementById(id); };
  var t=function(key, fallback){
    var v=global.OneToneI18n&&global.OneToneI18n.t?global.OneToneI18n.t(key):'';
    return v&&v!==key?v:(fallback||key);
  };
  var esc=function(s){
    return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');
  };

  var route={
    persona:null,
    stepId:'intent',
    tool:'codex',
    softHighlight:''
  };
  var openFlag=false;

  var VIEW_IDS={
    intent:'habitSetupIntentView',
    tool:'habitSetupToolView',
    softPad:'habitSetupSoftPadView',
    done:'habitSetupDoneView',
    activation:'habitSetupActivationView',
    trigger:'habitSetupTriggerView',
    mode:'habitSetupModeView',
    voice:'habitSetupVoiceLessonView'
  };

  function overlayEl(){ return $('habitSetupOverlay'); }
  function notifySetupInteractionActive(active){
    try{
      if(global.OneToneIpc&&global.OneToneIpc.invoke){
        global.OneToneIpc.invoke('cmd_set_setup_interaction_active',{active:!!active}).catch(function(){});
      }
    }catch(_){}
  }

  function openOverlayShell(){
    notifySetupInteractionActive(true);
    var overlay=overlayEl();
    if(overlay){
      overlay.classList.add('open');
      overlay.setAttribute('aria-hidden','false');
    }
    if(typeof document!=='undefined'){
      document.documentElement.classList.add('habit-setup-open');
    }
  }

  function closeOverlayShell(){
    notifySetupInteractionActive(false);
    var overlay=overlayEl();
    if(overlay){
      overlay.classList.remove('open');
      overlay.setAttribute('aria-hidden','true');
    }
    if(typeof document!=='undefined'){
      document.documentElement.classList.remove('habit-setup-open');
    }
  }

  function hideAllViews(){
    Object.keys(VIEW_IDS).forEach(function(k){
      var el=$(VIEW_IDS[k]);
      if(el) el.hidden=true;
    });
  }

  function showView(stepId){
    hideAllViews();
    var map={
      intent:VIEW_IDS.intent,
      tool:VIEW_IDS.tool,
      softPad:VIEW_IDS.softPad,
      done:VIEW_IDS.done
    };
    var id=map[stepId];
    if(id&&$(id)) $(id).hidden=false;
  }

  function setNav(steps, activeId){
    var host=$('habitSetupStepNav');
    if(!host) return;
    if(!steps||!steps.length){
      host.innerHTML='';
      return;
    }
    var activeIdx=-1;
    for(var i=0;i<steps.length;i++){ if(steps[i].id===activeId) activeIdx=i; }
    host.innerHTML=steps.map(function(step,idx){
      var active=step.id===activeId;
      var done=activeIdx>idx;
      var cls='habit-setup-step-tab';
      if(active) cls+=' is-active';
      if(done&&!active) cls+=' is-done';
      return '<button type="button" class="'+cls+'" disabled role="tab" aria-selected="'+(active?'true':'false')+'">'
        +'<span class="habit-setup-step-num">'+(idx+1)+'</span>'
        +'<span class="habit-setup-step-label">'+esc(t(step.labelKey, step.label||step.id))+'</span>'
        +'</button>';
    }).join('');
  }

  function vibeNavSteps(){
    return [
      { id:'tool', labelKey:'qsStepTool', label:'工具' },
      { id:'core', labelKey:'qsStepCore', label:'按键' },
      { id:'softPad', labelKey:'qsStepSoftPad', label:'Soft Pad' },
      { id:'done', labelKey:'qsStepDone', label:'完成' }
    ];
  }

  function beginnerNavSteps(){
    return [
      { id:'core', labelKey:'qsStepCore', label:'按键' },
      { id:'done', labelKey:'qsStepDone', label:'完成' }
    ];
  }

  function readSoftPadEnabled(){
    var hub=global.OneToneSoftPadHub;
    if(hub&&typeof hub.listHubEntries==='function'){
      try{
        var entries=hub.listHubEntries();
        if(Array.isArray(entries)){
          for(var i=0;i<entries.length;i++){
            if(entries[i]&&entries[i].padEnabled) return true;
          }
        }
      }catch(_){}
    }
    var st=global.OneToneState&&global.OneToneState.state;
    var maps=st&&st.config&&st.config.mappings;
    if(Array.isArray(maps)){
      for(var j=0;j<maps.length;j++){
        var pad=maps[j]&&maps[j].codexMicroPad;
        if(pad&&pad.enabled) return true;
      }
    }
    return false;
  }

  function toolLabel(){
    if(route.tool==='cursor') return 'Cursor';
    if(route.tool==='claude') return 'Claude Code';
    return 'Codex';
  }

  function openSettingsPanel(panel, opts){
    opts=opts||{};
    close();
    var drawer=global.OneToneSettingsDrawer;
    if(drawer&&drawer.open){
      var payload={ panel:panel };
      if(opts.voiceSubpage) payload.voiceSubpage=opts.voiceSubpage;
      if(opts.focus) payload.focus=opts.focus;
      drawer.open(payload);
    }
  }

  function startCore(persona){
    route.persona=persona;
    route.stepId='core';
    showView('none');
    hideAllViews();
    setNav(persona==='vibe'?vibeNavSteps():beginnerNavSteps(), 'core');
    var setup=global.OneToneHabitTriggerSetup;
    if(!setup||!setup.open){
      if(global.OneToneApp&&global.OneToneApp.toast) global.OneToneApp.toast(t('onboardTryTestUnavailable','暂时无法打开快速入门'));
      return;
    }
    setup.open({
      persona:persona,
      tool:route.tool,
      qsMode:true,
      onComplete:function(meta){
        route.persona=(meta&&meta.persona)||persona;
        route.tool=(meta&&meta.tool)||route.tool;
        if(route.persona==='vibe'){
          goSoftPad();
        }else{
          goDone();
        }
      }
    });
  }

  function renderIntent(){
    route.stepId='intent';
    route.persona=null;
    setNav([], '');
    showView('intent');
    var body=$('habitSetupIntentBody');
    if(!body) return;
    body.innerHTML=
      '<p class="habit-setup-intent-ask">'+esc(t('qsIntentAsk','你想先让 OneTone 做什么？'))+'</p>'+
      '<div class="habit-setup-intent-list">'+
        '<div class="habit-setup-intent-card is-bright">'+
          '<div class="habit-setup-intent-ico" aria-hidden="true">1</div>'+
          '<div class="habit-setup-intent-copy"><strong>'+esc(t('qsIntentBeginnerTitle','刚到新手村'))+'</strong>'+
            '<span>'+esc(t('qsIntentBeginnerDesc','按一个键，OneTone 帮你打开语音输入；说「结束听写」只结束，不自动发送。'))+'</span></div>'+
          '<button type="button" class="btn primary habit-setup-intent-cta" id="qsGoBeginner">'+esc(t('qsIntentBeginnerCta','开始 3 分钟配置'))+'</button>'+
        '</div>'+
        '<div class="habit-setup-intent-card is-mid">'+
          '<div class="habit-setup-intent-ico" aria-hidden="true">⌘</div>'+
          '<div class="habit-setup-intent-copy"><strong>'+esc(t('qsIntentVibeTitle','我是程序员'))+'</strong>'+
            '<span>'+esc(t('qsIntentVibeDesc','给 Cursor / Codex / Claude 配启动键、结束词和 Soft Pad 借用规则。'))+'</span>'+
            '<div class="habit-setup-intent-tools"><em>Cursor</em><em>Codex</em><em>Claude</em></div></div>'+
          '<button type="button" class="btn secondary habit-setup-intent-cta" id="qsGoVibe">'+esc(t('qsIntentVibeCta','配置 AI 编程'))+'</button>'+
        '</div>'+
        '<div class="habit-setup-intent-card is-quiet">'+
          '<div class="habit-setup-intent-ico" aria-hidden="true">···</div>'+
          '<div class="habit-setup-intent-copy"><strong>'+esc(t('qsIntentPickTitle','我只想配某一项'))+'</strong>'+
            '<span>'+esc(t('qsIntentPickDesc','只改按键、语音、虚拟键盘或摄像头。'))+'</span>'+
            '<div class="habit-setup-pick-list">'+
              '<button type="button" class="habit-setup-pick-row" data-qs-panel="keys"><span><b>'+esc(t('qsPickKeys','按键'))+'</b><i>'+esc(t('qsPickKeysHint','启动键与映射'))+'</i></span><em>'+esc(t('qsPickOpen','打开'))+'</em></button>'+
              '<button type="button" class="habit-setup-pick-row" data-qs-panel="voiceWake"><span><b>'+esc(t('qsPickVoice','语音'))+'</b><i>'+esc(t('qsPickVoiceHint','唤醒 / 结束词'))+'</i></span><em>'+esc(t('qsPickOpen','打开'))+'</em></button>'+
              '<button type="button" class="habit-setup-pick-row" data-qs-panel="softPad"><span><b>'+esc(t('qsPickSoftPad','虚拟键盘'))+'</b><i>'+esc(t('qsPickSoftPadHint','Soft Pad 设置'))+'</i></span><em>'+esc(t('qsPickOpen','打开'))+'</em></button>'+
              '<button type="button" class="habit-setup-pick-row" data-qs-panel="camera"><span><b>'+esc(t('qsPickCamera','摄像头'))+'</b><i>'+esc(t('qsPickCameraHint','静音 · 手势 · 隐私'))+'</i></span><em>'+esc(t('qsPickOpen','打开'))+'</em></button>'+
            '</div></div>'+
        '</div>'+
      '</div>'+
      '<p class="habit-setup-intent-meta">'+esc(t('qsIntentMeta','预计 3 分钟 · 本机保存 · 可随时跳过'))+'</p>';
    var b=$('qsGoBeginner'); if(b) b.onclick=function(){ startCore('beginner'); };
    var v=$('qsGoVibe'); if(v) v.onclick=function(){ goTool(); };
    body.querySelectorAll('[data-qs-panel]').forEach(function(el){
      el.onclick=function(){
        var p=el.getAttribute('data-qs-panel');
        if(p==='voiceWake') openSettingsPanel('voiceWake',{ voiceSubpage:'wake' });
        else openSettingsPanel(p);
      };
    });
  }

  function goTool(){
    route.persona='vibe';
    route.stepId='tool';
    if(global.OneToneHabitTriggerSetup&&global.OneToneHabitTriggerSetup.closeQuiet){
      global.OneToneHabitTriggerSetup.closeQuiet();
    }
    setNav(vibeNavSteps(),'tool');
    showView('tool');
    var body=$('habitSetupToolBody');
    if(!body) return;
    body.innerHTML=
      '<div class="habit-setup-badge">'+esc(t('qsToolBadge','程序员'))+'</div>'+
      '<h3 class="habit-setup-title habit-setup-title--left">'+esc(t('qsToolTitle','你主要用哪个？'))+'</h3>'+
      '<p class="habit-setup-desc habit-setup-desc--left">'+esc(t('qsToolDesc','Codex 可准备 scenario 与入门 Soft Pad layout。Cursor / Claude 只记目标应用与推荐热键。'))+'</p>'+
      '<div class="habit-setup-tool-grid">'+
        '<button type="button" class="habit-setup-tool'+(route.tool==='cursor'?' is-on':'')+'" data-qs-tool="cursor"><strong>Cursor</strong><span>'+esc(t('qsToolCursorHint','目标应用 + 热键建议'))+'</span></button>'+
        '<button type="button" class="habit-setup-tool'+(route.tool==='codex'?' is-on':'')+'" data-qs-tool="codex"><strong>Codex</strong><span>'+esc(t('qsToolCodexHint','scenario + Soft Pad layout'))+'</span></button>'+
        '<button type="button" class="habit-setup-tool'+(route.tool==='claude'?' is-on':'')+'" data-qs-tool="claude"><strong>Claude</strong><span>'+esc(t('qsToolClaudeHint','目标应用 + 热键建议'))+'</span></button>'+
      '</div>'+
      '<p class="habit-setup-tool-more">'+esc(t('qsToolMore','更多 · MiniMax（不进默认主路径）'))+'</p>'+
      '<div class="habit-setup-bound">'+(route.tool==='codex'
        ?esc(t('qsToolBoundCodex','将准备 Codex app scenario 与入门 Soft Pad layout（写入现有配置模块）。'))
        :esc(t('qsToolBoundOther','仅推荐映射提示。OneTone 不会声称已完成第三方工具内部配置。')))+'</div>'+
      '<div class="habit-setup-actions habit-setup-actions--footer">'+
        '<button type="button" class="btn secondary" id="qsToolBack">'+esc(t('habitSetupPrev','上一步'))+'</button>'+
        '<button type="button" class="btn primary" id="qsToolNext">'+esc(t('habitSetupNext','下一步'))+'</button>'+
      '</div>';
    body.querySelectorAll('[data-qs-tool]').forEach(function(el){
      el.onclick=function(){ route.tool=el.getAttribute('data-qs-tool'); goTool(); };
    });
    $('qsToolBack').onclick=function(){ renderIntent(); };
    $('qsToolNext').onclick=function(){ startCore('vibe'); };
  }

  function softPadDiagramHtml(hi){
    function cell(label, key){
      var on=hi===key?' is-hi':'';
      return '<button type="button" class="habit-setup-softpad-key'+on+'" data-qs-soft-key="'+key+'">'+esc(label)+'</button>';
    }
    return '<div class="habit-setup-softpad-diagram" aria-hidden="false">'+
      cell('Num','numlock')+cell('/','')+cell('*','')+cell('−','')+
      cell('7','')+cell('8','')+cell('9','')+cell('+','')+
      cell('4','')+cell('5','')+cell('6','')+cell('⏻','power')+
      cell('1','')+cell('2','')+cell('3','')+cell('↵','')+
      '<button type="button" class="habit-setup-softpad-key span2" data-qs-soft-key="">0</button>'+
      cell('.','')+cell('N','number')+
      '</div>';
  }

  function goSoftPad(){
    route.stepId='softPad';
    if(global.OneToneHabitTriggerSetup&&global.OneToneHabitTriggerSetup.closeQuiet){
      global.OneToneHabitTriggerSetup.closeQuiet();
    }
    openOverlayShell();
    setNav(vibeNavSteps(),'softPad');
    showView('softPad');
    var enabled=readSoftPadEnabled();
    var hi=route.softHighlight||'';
    var body=$('habitSetupSoftPadBody');
    if(!body) return;
    body.innerHTML=
      '<div class="habit-setup-badge">'+esc(t('qsSoftBadge','Soft Pad · 规则卡'))+'</div>'+
      '<h3 class="habit-setup-title habit-setup-title--left">'+esc(t('qsSoftTitle','为什么数字小键盘会变快捷键？'))+'</h3>'+
      '<p class="habit-setup-desc habit-setup-desc--left">'+esc(t('qsSoftDesc','虚拟键盘借用数字小键盘同一键位。点右侧规则可高亮对应键位。'))+'</p>'+
      '<div class="habit-setup-softpad-status '+(enabled?'is-on':'')+'">'+
        (enabled?esc(t('qsSoftStatusOn','Soft Pad 已开启')):esc(t('qsSoftStatusOff','Soft Pad 未开启')))+
      '</div>'+
      '<div class="habit-setup-softpad-card">'+
        softPadDiagramHtml(hi)+
        '<ul class="habit-setup-softpad-rules">'+
          '<li class="'+(hi==='number'?'is-active':'')+'" data-qs-soft-rule="number"><b>Number</b>'+esc(t('qsSoftRuleNumber','单击切换快捷 / 数字'))+'</li>'+
          '<li class="'+(hi==='numlock'?'is-active':'')+'" data-qs-soft-rule="numlock"><b>NumLock</b>'+esc(t('qsSoftRuleNumLock','切换数字输入 / 快捷输入'))+'</li>'+
          '<li class="'+(hi==='power'?'is-active':'')+'" data-qs-soft-rule="power"><b>⏻</b>'+esc(t('qsSoftRulePower','关闭 Soft Pad 或还原数字输入'))+'</li>'+
        '</ul>'+
      '</div>'+
      '<p class="habit-setup-desc habit-setup-desc--left">'+esc(t('qsSoftToolLine','目标工具：{tool} · 本页不写入配置').replace('{tool}',toolLabel()))+'</p>'+
      '<div class="habit-setup-actions habit-setup-actions--footer">'+
        '<button type="button" class="btn secondary" id="qsSoftSettings">'+esc(t('qsSoftOpenSettings','打开 Soft Pad 设置'))+'</button>'+
        '<button type="button" class="btn primary" id="qsSoftContinue">'+esc(t('qsSoftContinue','我明白了，继续'))+'</button>'+
      '</div>';
    function highlight(key){
      route.softHighlight=key;
      goSoftPad();
    }
    body.querySelectorAll('[data-qs-soft-rule]').forEach(function(el){
      el.onclick=function(){ highlight(el.getAttribute('data-qs-soft-rule')); };
    });
    body.querySelectorAll('[data-qs-soft-key]').forEach(function(el){
      el.onclick=function(){
        var k=el.getAttribute('data-qs-soft-key');
        if(k) highlight(k);
      };
    });
    $('qsSoftSettings').onclick=function(){ openSettingsPanel('softPad'); };
    $('qsSoftContinue').onclick=function(){ goDone(); };
  }

  function readTriggerSummary(){
    var st=global.OneToneState&&global.OneToneState.state;
    var id=st&&st.selectedMappingId;
    var maps=st&&st.config&&st.config.mappings;
    var m=null;
    if(Array.isArray(maps)){
      for(var i=0;i<maps.length;i++){
        if(String(maps[i].id)===String(id)){ m=maps[i]; break; }
      }
      if(!m&&maps[0]) m=maps[0];
    }
    return {
      trigger:m&&m.triggerKey?String(m.triggerKey):'—',
      target:m&&m.targetKey?String(m.targetKey):'—',
      softOn:readSoftPadEnabled()
    };
  }

  function goDone(){
    route.stepId='done';
    var vibe=route.persona==='vibe';
    if(global.OneToneHabitTriggerSetup&&global.OneToneHabitTriggerSetup.closeQuiet){
      global.OneToneHabitTriggerSetup.closeQuiet();
    }
    openOverlayShell();
    setNav(vibe?vibeNavSteps():beginnerNavSteps(),'done');
    showView('done');
    var sum=readTriggerSummary();
    var softLine=sum.softOn
      ? { tag:t('qsDoneTagOn','已开启'), text:t('qsDoneSoftOn','Soft Pad 已开启（来自设置状态）') }
      : { tag:t('qsDoneTagLearn','已了解'), text:t('qsDoneSoftLearn','已了解 Soft Pad 借用规则 · 可在设置里继续调整') };
    var body=$('habitSetupDoneBody');
    if(!body) return;
    body.innerHTML=
      '<div class="habit-setup-badge">'+esc(t('qsDoneBadge','完成'))+'</div>'+
      '<h3 class="habit-setup-title habit-setup-title--left">'+esc(vibe?t('qsDoneTitleVibe','可以开始用了'):t('qsDoneTitleBeg','通用习惯就绪'))+'</h3>'+
      '<p class="habit-setup-desc habit-setup-desc--left">'+esc(t('qsDoneDesc','摘要区分「已配置」与「建议下一步」。'))+'</p>'+
      '<ul class="habit-setup-done-list">'+
        '<li><span class="tag">'+esc(t('qsDoneTagConfigured','已配置'))+'</span><div>'+esc(t('qsDoneTrigger','启动键：{key}').replace('{key}',sum.trigger))+'</div></li>'+
        '<li><span class="tag">'+esc(t('qsDoneTagConfigured','已配置'))+'</span><div>'+esc(t('qsDoneVoice','语音快捷键 / 结束词（结束听写，不自动发送）'))+'</div></li>'+
        (vibe?'<li><span class="tag">'+esc(t('qsDoneTagTarget','目标'))+'</span><div>'+esc(t('qsDoneTool','目标工具：{tool}').replace('{tool}',toolLabel()))+'</div></li>':'')+
        (vibe?'<li><span class="tag learn">'+esc(softLine.tag)+'</span><div>'+esc(softLine.text)+'</div></li>':'')+
        (vibe?'<li><span class="tag next">'+esc(t('qsDoneTagNext','建议下一步'))+'</span><div>'+esc(t('qsDoneCamera','摄像头：离席静音等能力，需要时再配'))+'</div></li>':'')+
      '</ul>'+
      '<div class="habit-setup-actions habit-setup-actions--footer">'+
        (vibe?'<button type="button" class="btn secondary" id="qsDoneCam">'+esc(t('qsDoneCamCta','继续配置摄像头'))+'</button>':'')+
        '<button type="button" class="btn primary" id="qsDoneHome">'+esc(t('qsDoneHome','回到首页'))+'</button>'+
      '</div>';
    var cam=$('qsDoneCam'); if(cam) cam.onclick=function(){ openSettingsPanel('camera'); };
    $('qsDoneHome').onclick=function(){ close(); };
  }

  function open(opts){
    opts=opts||{};
    openFlag=true;
    route.persona=null;
    route.stepId='intent';
    route.tool=opts.tool||'codex';
    route.softHighlight='';
    if(global.OneToneHabitTriggerSetup&&global.OneToneHabitTriggerSetup.closeQuiet){
      global.OneToneHabitTriggerSetup.closeQuiet();
    }
    openOverlayShell();
    if(opts.entry==='keys'){ openSettingsPanel('keys'); return; }
    if(opts.entry==='voice'){ openSettingsPanel('voiceWake',{ voiceSubpage:'wake' }); return; }
    if(opts.entry==='softPad'){ openSettingsPanel('softPad'); return; }
    if(opts.entry==='camera'){ openSettingsPanel('camera'); return; }
    renderIntent();
  }

  function close(){
    openFlag=false;
    if(global.OneToneHabitTriggerSetup&&global.OneToneHabitTriggerSetup.close){
      try{ global.OneToneHabitTriggerSetup.close(); }catch(_){}
    }
    hideAllViews();
    setNav([],'');
    closeOverlayShell();
    route.persona=null;
    route.stepId='intent';
  }

  function handleEsc(){
    if(!openFlag) return false;
    if(global.OneToneHabitTriggerSetup&&global.OneToneHabitTriggerSetup.isOpen&&global.OneToneHabitTriggerSetup.isOpen()){
      var handled=global.OneToneHabitTriggerSetup.handleEsc?global.OneToneHabitTriggerSetup.handleEsc():false;
      if(!global.OneToneHabitTriggerSetup.isOpen()&&openFlag&&route.stepId==='core'){
        if(route.persona==='vibe') goTool();
        else renderIntent();
        return true;
      }
      return handled;
    }
    if(route.stepId==='softPad'){ goDone(); return true; }
    if(route.stepId==='tool'||route.stepId==='done'){ renderIntent(); return true; }
    close();
    return true;
  }

  function bindOnce(){
    if(bindOnce._done) return;
    bindOnce._done=true;
    var closeBtn=$('btnHabitSetupHeaderClose');
    if(closeBtn){
      closeBtn.addEventListener('click',function(){
        if(openFlag) close();
      });
    }
  }

  global.OneToneQuickStart={
    open:open,
    close:close,
    handleEsc:handleEsc,
    bindOnce:bindOnce,
    isOpen:function(){ return !!openFlag; },
    getRoute:function(){ return { persona:route.persona, stepId:route.stepId, tool:route.tool }; }
  };
})((typeof window!=='undefined')?window:globalThis);
