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
    softHighlight:'number',
    softEnabledPreview:null,
    softShortcut:false,
    padFlip:false,
    softPadOpenedSettings:false
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

  function softPadPreviewEnabled(){
    if(typeof route.softEnabledPreview==='boolean') return route.softEnabledPreview;
    route.softEnabledPreview=readSoftPadEnabled();
    return route.softEnabledPreview;
  }

  function softPadCapabilities(){
    if(route.tool==='cursor'){
      return [
        { key:'Num 1', text:t('qsSoftCapCursor1','打开 Chat（Ctrl+L）') },
        { key:'Num 2', text:t('qsSoftCapCursor2','Inline Edit（Ctrl+K）') },
        { key:'Num 3', text:t('qsSoftCapCursor3','Agent（Ctrl+I）') },
        { key:'Num 4', text:t('qsSoftCapCursor4','Accept（Tab / Enter）') },
        { key:'Num 5', text:t('qsSoftCapCursor5','Reject（Esc / Backspace）') },
        { key:'Num Enter', text:t('qsSoftCapCursorEnter','强制发送 / 确认') }
      ];
    }
    if(route.tool==='claude'){
      return [
        { key:'Num 1', text:t('qsSoftCapClaude1','打开对话区 / 输入区') },
        { key:'Num 2', text:t('qsSoftCapClaude2','常用编辑动作') },
        { key:'Num 3', text:t('qsSoftCapClaude3','切回 Agent 工作流') },
        { key:'Num 4', text:t('qsSoftCapClaude4','Accept / Continue') },
        { key:'Num 5', text:t('qsSoftCapClaude5','Reject / Cancel') },
        { key:'Num Enter', text:t('qsSoftCapClaudeEnter','发送 / 确认') }
      ];
    }
    return [
      { key:'Num 1', text:t('qsSoftCapCodex1','打开 Chat / Prompt') },
      { key:'Num 2', text:t('qsSoftCapCodex2','常用编辑动作') },
      { key:'Num 3', text:t('qsSoftCapCodex3','切回 Agent / Workflow') },
      { key:'Num 4', text:t('qsSoftCapCodex4','Accept / Continue') },
      { key:'Num 5', text:t('qsSoftCapCodex5','Reject / Cancel') },
      { key:'Num Enter', text:t('qsSoftCapCodexEnter','发送 / 确认') }
    ];
  }

  function softPadCapabilitiesHtml(){
    return '<ul class="habit-setup-softpad-features">'+softPadCapabilities().map(function(item){
      return '<li><b>'+esc(item.key)+'</b><span>'+esc(item.text)+'</span></li>';
    }).join('')+'</ul>';
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

  var SOFT_PAD_POWER_ICON='<svg viewBox="0 0 24 24"><path d="M12 2v9"/><path d="M6.4 6.4a8 8 0 1 0 11.2 0"/></svg>';

  function softPadEncKeyHtml(modeOn, flip, tip){
    var cls='sk sk-enc micro-hw__key micro-hw__key--control'+
      (modeOn?' is-mode-on':' is-mode-off')+
      (flip?' is-pulse':'');
    return '<button type="button" class="'+cls+'" data-face-toggle role="switch" aria-checked="'+
      (modeOn?'true':'false')+'" title="'+esc(tip)+'" aria-label="'+esc(tip)+'">'+
      '<span class="micro-hw__icon" aria-hidden="true">'+SOFT_PAD_POWER_ICON+'</span>'+
      '</button>';
  }

  function softPadFaceHtml(face, flip){
    var tip=face==='shortcut'
      ?t('qsSoftFaceToggleBack','单击 Number：还原数字')
      :t('qsSoftFaceToggleGo','单击 Number：切换到快捷 Soft Pad');
    var cls='soft-face soft-face--'+face+(flip?' is-flip':'');
    var encKey=softPadEncKeyHtml(face==='shortcut', flip, tip);
    if(face==='numpad'){
      return '<div class="'+cls+' soft-face--numpad-grid">'+
        encKey+
        '<div class="sk">/</div><div class="sk">*</div><div class="sk">−</div>'+
        '<div class="sk">7</div><div class="sk">8</div><div class="sk">9</div>'+
        '<div class="sk" style="grid-row:span 2">+</div>'+
        '<div class="sk">4</div><div class="sk">5</div><div class="sk">6</div>'+
        '<div class="sk">1</div><div class="sk">2</div><div class="sk">3</div>'+
        '<div class="sk" style="grid-row:span 2">↵</div>'+
        '<div class="sk" style="grid-column:span 2">0</div>'+
        '<div class="sk">.</div>'+
        '</div>';
    }
    return '<div class="'+cls+'">'+
      '<div class="sk dim"></div>'+
      encKey+
      '<div class="sk">⚡</div><div class="sk">☰</div><div class="sk">✕</div>'+
      '<div class="sk dim"></div>'+
      '<div class="sk glow-g">⌘</div><div class="sk glow-y">＋</div><div class="sk glow-b">⚡</div>'+
      '<div class="sk" style="grid-row:span 2">＋</div>'+
      '<div class="sk dim"></div>'+
      '<div class="sk">⌕</div><div class="sk glow-p">↩</div><div class="sk glow-b">✕</div>'+
      '<div class="sk dim"></div>'+
      '<div class="sk">＋</div><div class="sk">↶</div><div class="sk">⌕</div>'+
      '<div class="sk" style="grid-row:span 2">⇥</div>'+
      '<div class="sk dim"></div>'+
      '<div class="sk mic" style="grid-column:span 2">🎙</div><div class="sk">·</div>'+
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
    var actualEnabled=readSoftPadEnabled();
    var masterOn=softPadPreviewEnabled();
    var face=route.softShortcut?'shortcut':'numpad';
    var cmds=softPadCapabilities();
    var body=$('habitSetupSoftPadBody');
    if(!body) return;
    body.innerHTML=
      '<div class="habit-setup-badge">'+esc(t('qsSoftBadge','Soft Pad · 规则卡'))+'</div>'+
      '<h3 class="habit-setup-title habit-setup-title--left">'+esc(t('qsSoftTitle','为什么数字小键盘会变快捷键？'))+'</h3>'+
      '<p class="habit-setup-desc habit-setup-desc--left">'+esc(t('qsSoftDesc','虚拟键盘借用数字小键盘同一键位。总开关默认关闭，避免数字键突然变成快捷键。'))+'</p>'+
      '<div class="habit-setup-softpad-status '+(actualEnabled?'is-on':'')+'">'+
        (actualEnabled?esc(t('qsSoftStatusOn','Soft Pad 已开启')):esc(t('qsSoftStatusOff','Soft Pad 未开启')))+
      '</div>'+
      '<div class="habit-setup-toggle">'+
        '<span><b>'+esc(t('qsSoftToggleTitle','启用 Soft Pad（数字键占用）'))+'</b><span class="sub">'+esc(t('qsSoftToggleDesc','默认关闭。打开后，单击 Number 才在快捷 / 数字间切换。'))+'</span></span>'+
        '<button type="button" class="sw'+(masterOn?' on':'')+'" id="qsSoftToggle" aria-pressed="'+(masterOn?'true':'false')+'"></button>'+
      '</div>'+
      '<div class="habit-setup-softpad-warn">'+
        (masterOn
          ?'<b>'+esc(t('qsSoftWarnOnTitle','总开关已开'))+'</b> '+esc(t('qsSoftWarnOn','实体数字小键盘可被 Soft Pad 占用。下面演示：单击 Number 切换状态（不是按住）。'))
          :'<b>'+esc(t('qsSoftWarnOffTitle','总开关关闭'))+'</b> '+esc(t('qsSoftWarnOff','实体数字键只输入数字。下面仍可演示切换动画，便于理解能力；打开总开关后实体键才会占用。')))+
      '</div>'+
      '<div class="habit-setup-softpad-wrap">'+
        softPadFaceHtml(face, route.padFlip)+
        '<div>'+
          '<div class="habit-setup-softpad-panel">'+
            '<h6>'+esc(t('qsSoftCurrentDemo','当前演示 · {mode}')
              .replace('{mode}',route.softShortcut?t('qsSoftModeShortcutShort','快捷 Soft Pad'):t('qsSoftModeNumpadShort','日常数字键盘')))+
            '</h6>'+
            '<p>'+esc(route.softShortcut
              ?t('qsSoftModeShortcutDesc','屏上键位对应 Soft Pad 能力（与实体小键盘位置一一对应）。')
              :t('qsSoftModeNumpadDesc','数字面：7/8/9… 为日常数字输入。'))+'</p>'+
            '<button type="button" class="btn primary" id="qsSoftNumberToggle" style="width:100%">'+esc(route.softShortcut
              ?t('qsSoftNumberBack','模拟单击 Number · 还原数字键盘')
              :t('qsSoftNumberGo','模拟单击 Number · 切换到快捷 Soft Pad'))+'</button>'+
          '</div>'+
          '<ul class="habit-setup-softpad-rules">'+
            '<li><b>Number</b>'+esc(t('qsSoftRuleNumber','单击切换快捷 / 数字（开关按钮，非按住）'))+'</li>'+
            '<li><b>NumLock</b>'+esc(t('qsSoftRuleNumLock','切换数字输入 / 快捷输入'))+'</li>'+
            '<li><b>⏻</b>'+esc(t('qsSoftRulePower','关闭 Soft Pad 或还原数字输入'))+'</li>'+
          '</ul>'+
          '<h6 class="habit-setup-softpad-benefits-title">'+esc(t('qsSoftBenefitsToolTitle','{tool} 常用能力（快捷面可用）').replace('{tool}',toolLabel()))+'</h6>'+
          '<ul class="feat-list">'+cmds.map(function(c){ return '<li><b>'+esc(c.key)+'</b>'+esc(c.text)+'</li>'; }).join('')+'</ul>'+
        '</div>'+
      '</div>'+
      '<p class="habit-setup-desc habit-setup-desc--left">'+esc(t('qsSoftToolLine','目标工具：{tool}。教学演示 ≠「已配置完成」').replace('{tool}',toolLabel()))+(masterOn?esc(t('qsSoftToolLineOn',' · 你已主动打开总开关（预览态）')):'')+'</p>'+
      '<div class="habit-setup-actions habit-setup-actions--footer">'+
        '<button type="button" class="btn secondary" id="qsSoftBack">'+esc(t('habitSetupPrev','上一步'))+'</button>'+
        '<button type="button" class="btn secondary" id="qsSoftSettings">'+esc(t('qsSoftOpenSettings','打开 Soft Pad 设置'))+'</button>'+
        '<button type="button" class="btn primary" id="qsSoftContinue">'+esc(t('qsSoftContinue','我明白了，继续'))+'</button>'+
      '</div>';
    function flipNum(){
      route.softShortcut=!route.softShortcut;
      route.padFlip=true;
      goSoftPad();
      setTimeout(function(){
        route.padFlip=false;
      },400);
    }
    $('qsSoftToggle').onclick=function(){
      route.softEnabledPreview=!masterOn;
      goSoftPad();
    };
    $('qsSoftNumberToggle').onclick=flipNum;
    body.querySelectorAll('[data-face-toggle]').forEach(function(el){ el.onclick=flipNum; });
    $('qsSoftBack').onclick=function(){ startCore('vibe'); };
    $('qsSoftSettings').onclick=function(){
      route.softPadOpenedSettings=true;
      openSettingsPanel('softPad');
    };
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
