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
    selectedKinds:[],
    inventory:null,
    softHighlight:'number',
    softEnabledPreview:null,
    softShortcut:false,
    padFlip:false,
    keyCaption:'',
    softPadOpenedSettings:false,
    prepareResults:null,
    showMoreTools:false,
    demoStatus:'idle'
  };
  var openFlag=false;
  var demoTimer=null;

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
        global.OneToneIpc.invoke('cmd_set_setup_interaction_active',{active:!!active}).catch(function(err){
          if(global.OneToneApp&&global.OneToneApp.pushLog){
            global.OneToneApp.pushLog('[qs] set_setup_interaction_active failed: '+String(err&&err.message||err));
          }
        });
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
    var AI=global.OneToneAgentInstall;
    if(AI&&AI.meta){
      var m=AI.meta(route.tool);
      if(m&&m.label) return m.label;
    }
    if(route.tool==='cursor') return 'Cursor';
    if(route.tool==='claude') return 'Claude';
    if(route.tool==='qoder') return 'Qoder';
    if(route.tool==='trae') return 'Trae';
    if(route.tool==='workbuddy') return 'WorkBuddy';
    return 'Codex';
  }

  function stopDemoTimer(){
    if(demoTimer){ clearInterval(demoTimer); demoTimer=null; }
  }

  function syncRouteToolFromSelection(){
    if(route.selectedKinds&&route.selectedKinds.length){
      route.tool=route.selectedKinds[0];
    }
  }

  function openSettingsPanel(panel, opts){
    opts=opts||{};
    close();
    var drawer=global.OneToneSettingsDrawer;
    if(drawer&&drawer.open){
      var payload={ panel:panel };
      if(opts.voiceSubpage) payload.voiceSubpage=opts.voiceSubpage;
      if(opts.focus) payload.focus=opts.focus;
      if(opts.debugMode) payload.debugMode=opts.debugMode;
      drawer.open(payload);
    }
  }

  function startCore(persona){
    route.persona=persona;
    var experiencePrefs=global.OneToneHabitExperiencePrefs;
    if(experiencePrefs){
      if(persona==='vibe'){
        experiencePrefs.setMode('quick');
        if(global.OneToneState&&global.OneToneState.ui) global.OneToneState.ui.habitWorkspaceAdvancedOpen=true;
      }else if(persona==='beginner'){
        experiencePrefs.setMode('quick');
      }
    }
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
        goDone();
      }
    });
  }

  function qsMicSvg(size){
    size=size||44;
    return '<svg class="qs-mic-svg" viewBox="0 0 24 24" width="'+size+'" height="'+size+'" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>';
  }

  function qsMicIcoHtml(size){
    return '<span class="qs-ico-mic-svg" aria-hidden="true">'+qsMicSvg(size||14)+'</span>';
  }

  /** Leading icons for maintenance pick rows — same stroke language as matrix demos. */
  function qsPickIcon(kind){
    var common='viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';
    if(kind==='status') return '<svg '+common+'><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>';
    if(kind==='repair') return '<svg '+common+'><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>';
    if(kind==='maint') return '<svg '+common+'><circle cx="12" cy="12" r="3"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>';
    return '<svg '+common+'><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/></svg>';
  }

  function qsMaintRow(debugMode, iconKind, titleKey, titleFb, hintKey, hintFb){
    return '<button type="button" class="qs-pick-row habit-setup-pick-row" data-qs-debug="'+esc(debugMode)+'">'+
      '<span class="qs-pick-row__ico" aria-hidden="true">'+qsPickIcon(iconKind)+'</span>'+
      '<span class="qs-pick-row__txt"><b>'+esc(t(titleKey, titleFb))+'</b><i>'+esc(t(hintKey, hintFb))+'</i></span>'+
      '<span class="qs-pick-row__go" aria-hidden="true"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg></span>'+
    '</button>';
  }

  function modeMatrixHtml(){
    var agentHint='<em>'+esc(t('qsIntentAgentsDefault','已检测 6 个 agent'))+'</em>';
    var codeLines=
      '<div class="qs-c-sec"><span class="qs-ln">01</span> &lt;VibeApp&gt;</div>'+
      '<div class="qs-c-em pl"><span class="qs-ln">02</span>  prompt("build dashboard")</div>'+
      '<div class="qs-c-sky pl"><span class="qs-ln">03</span>  const app = genUI();</div>'+
      '<div class="qs-c-pur pl"><span class="qs-ln">04</span>  renderComponent({</div>'+
      '<div class="qs-c-amb pl"><span class="qs-ln">05</span>    theme: "cyber",</div>'+
      '<div class="qs-c-em pl"><span class="qs-ln">06</span>    stream: true</div>'+
      '<div class="qs-c-pur pl"><span class="qs-ln">07</span>  });</div>'+
      '<div class="qs-c-sky pl"><span class="qs-ln">08</span>  deployLive();</div>'+
      '<div class="qs-c-sec"><span class="qs-ln">09</span> &lt;/VibeApp&gt;<span class="qs-cursor" aria-hidden="true"></span></div>';
    var pick=
      '<div class="qs-veteran-pick" id="qsVeteranPick">'+
        qsMaintRow('overview','status','debugFocusOverview','状态','debugFocusOverviewStatus','当前是否正常')+
        qsMaintRow('repair','repair','debugFocusRepair','诊断','debugFocusRepairStatus','识别链路排查')+
        qsMaintRow('developer','maint','debugFocusDeveloper','维护','debugFocusDeveloperStatus','备份与日志')+
        qsMaintRow('developer','log','homeWbNavLog','查看日志','qsMaintLogHint','导出与排查记录')+
      '</div>';
    var veteranFrame1=
      '<div class="qs-frame qs-frame--1">'+
        '<div class="qs-frame__screen">'+
          '<div class="qs-frame__head"><strong><i></i>FRAME #01</strong><span class="qs-frame__tag">VIBECODING</span></div>'+
          '<div class="qs-frame__body">'+
            '<div class="qs-frame__code"><div class="qs-frame__code-track">'+
              '<div class="qs-c-ter">&gt; process_user_stream()</div><div class="qs-c-sky pl">execute_pipeline(step_1)</div><div class="qs-c-em pl">sync_state() <span class="qs-cursor qs-cursor--ter"></span></div>'+
              '<div class="qs-c-ter">&gt; process_user_stream()</div><div class="qs-c-sky pl">execute_pipeline(step_1)</div><div class="qs-c-em pl">sync_state()</div>'+
            '</div></div>'+
            '<div class="qs-frame__live"><div class="qs-frame__live-bar"><i></i></div><div class="qs-frame__live-foot">LIVE BUILD</div></div>'+
          '</div>'+
        '</div>'+
        '<div class="qs-frame__cmd">'+qsMicIcoHtml(14)+'<span class="qs-frame__cmd-label qs-text-glow">“继续”</span></div>'+
      '</div>';
    return (
      '<div class="qs-mode-matrix">'+
        '<div class="qs-mode-matrix__stage">'+
          '<div id="qsModeCards" class="cards-container" role="listbox" aria-label="'+esc(t('qsIntentAsk','你想先让 OneTone 做什么？'))+'">'+

            '<div class="mode-card" data-type="newbie" role="option" tabindex="0" aria-selected="false">'+
              '<div class="mode-card__wash" aria-hidden="true"></div>'+
              '<div class="mode-card__visual">'+
                '<div class="qs-newbie-scene" aria-hidden="true">'+
                  '<div class="qs-newbie-hero">'+
                    '<div class="qs-newbie-rings" aria-hidden="true"><i></i><i></i><i></i></div>'+
                    '<div class="qs-mic-core">'+
                      '<div class="qs-mic-ico">'+qsMicSvg(40)+'</div>'+
                      '<div class="qs-newbie-bars"><i></i><i></i><i></i></div>'+
                    '</div>'+
                  '</div>'+
                  '<div class="qs-newbie-key-hint">'+esc(t('qsNewbieKeyHint','按启动键开始'))+'</div>'+
                '</div>'+
              '</div>'+
              '<div class="mode-card__copy">'+
                '<h2>'+esc(t('qsIntentBeginnerTitle','我是新手'))+'</h2>'+
                '<p>'+esc(t('qsIntentBeginnerDesc','快速设置快捷键，定制您的专属 vibecoding 方案'))+'</p>'+
              '</div>'+
              '<div class="selection-badge" aria-hidden="true">✓</div>'+
            '</div>'+

            '<div class="mode-card" data-type="vibe" role="option" tabindex="0" aria-selected="false">'+
              '<div class="mode-card__wash" aria-hidden="true"></div>'+
              '<div class="mode-card__visual">'+
                '<div class="qs-monitor-wrap">'+
                  '<div class="qs-monitor">'+
                    '<div class="qs-monitor__bar">'+
                      '<div class="qs-monitor__dots" aria-hidden="true"><i></i><i></i><i></i></div>'+
                      '<div class="qs-monitor__live"><span></span>AI VIBECODING ACTIVE</div>'+
                    '</div>'+
                    '<div class="qs-monitor__body">'+
                      '<div class="qs-code-stream"><div class="qs-code-stream__track">'+codeLines+codeLines+'</div></div>'+
                      '<div class="qs-canvas">'+
                        '<div class="qs-canvas__top"><span>CANVAS</span><i></i></div>'+
                        '<div class="qs-canvas__mid">'+
                          '<div class="qs-canvas__bar"><i></i></div>'+
                          '<div class="qs-canvas__grid"><b><i></i></b><b><i></i></b></div>'+
                        '</div>'+
                        '<div class="qs-canvas__foot">LIVE GENERATING...</div>'+
                      '</div>'+
                    '</div>'+
                  '</div>'+
                  '<div class="qs-monitor-stand" aria-hidden="true"></div>'+
                  '<div class="qs-monitor-base" aria-hidden="true"></div>'+
                '</div>'+
              '</div>'+
              '<div class="mode-card__copy">'+
                '<h2>'+esc(t('qsIntentVibeTitle','程序员'))+'</h2>'+
                '<p>'+esc(t('qsIntentVibeDesc','完整配置您的键盘、麦克风、摄像头，助力编程'))+'</p>'+
                '<div class="qs-intent-tools" id="qsIntentToolsHint">'+agentHint+'</div>'+
              '</div>'+
              '<div class="selection-badge" aria-hidden="true">✓</div>'+
            '</div>'+

            '<div class="mode-card" data-type="veteran" role="option" tabindex="0" aria-selected="false">'+
              '<div class="mode-card__wash" aria-hidden="true"></div>'+
              '<div class="mode-card__visual">'+
                '<div class="qs-quad-viewport">'+
                  '<div class="qs-quad-track" aria-hidden="true">'+
                    veteranFrame1+
                    '<div class="qs-frame qs-frame--2 qs-frame--sky">'+
                      '<div class="qs-frame__screen">'+
                        '<div class="qs-frame__head"><strong><i></i>FRAME #02</strong><span class="qs-frame__tag">VIBECODING</span></div>'+
                        '<div class="qs-frame__body">'+
                          '<div class="qs-frame__code"><div class="qs-frame__code-track">'+
                            '<div class="qs-c-sky" style="font-weight:600">&gt; update_component_ui()</div><div class="qs-c-rose pl">target: .close-button</div>'+
                            '<div class="qs-c-sky" style="font-weight:600">&gt; update_component_ui()</div><div class="qs-c-rose pl">target: .close-button</div>'+
                          '</div></div>'+
                          '<div class="qs-frame__live"><div class="qs-close-btn">✕</div></div>'+
                        '</div>'+
                      '</div>'+
                      '<div class="qs-frame__cmd"><div style="display:flex;align-items:center;gap:4px">'+qsMicIcoHtml(14)+'<div class="qs-wave"><i></i><i></i><i></i></div></div><span class="qs-frame__cmd-label qs-text-glow">“调整关闭按钮”</span></div>'+
                    '</div>'+
                    '<div class="qs-frame qs-frame--3 qs-frame--rose">'+
                      '<div class="qs-frame__screen">'+
                        '<div class="qs-frame__head"><strong><i></i>FRAME #03</strong><span class="qs-frame__tag">VIBECODING</span></div>'+
                        '<div class="qs-frame__body">'+
                          '<div class="qs-frame__code"><div class="qs-frame__code-track">'+
                            '<div class="qs-c-rose" style="font-weight:600">&gt; render_animation_key()</div><div class="qs-c-em pl">bezier: [0.16, 1, 0.3]</div>'+
                            '<div class="qs-c-rose" style="font-weight:600">&gt; render_animation_key()</div><div class="qs-c-em pl">bezier: [0.16, 1, 0.3]</div>'+
                          '</div></div>'+
                          '<div class="qs-frame__live"><div class="qs-play-wrap"><div class="qs-play-btn">▶</div><div class="qs-play-ring"></div></div></div>'+
                        '</div>'+
                      '</div>'+
                      '<div class="qs-frame__cmd">'+qsMicIcoHtml(14)+'<span class="qs-frame__cmd-label qs-text-glow">“修改动画”</span></div>'+
                    '</div>'+
                    '<div class="qs-frame qs-frame--4 qs-frame--em">'+
                      '<div class="qs-frame__screen">'+
                        '<div class="qs-frame__head"><strong><i></i>FRAME #04</strong><span class="qs-frame__tag">VIBECODING</span></div>'+
                        '<div class="qs-frame__body">'+
                          '<div class="qs-frame__code"><div class="qs-frame__code-track">'+
                            '<div class="qs-c-em" style="font-weight:600">&gt; dialog_ui_restructure()</div><div class="qs-c-amb pl">modal_type: "fast_vibe"</div>'+
                            '<div class="qs-c-em" style="font-weight:600">&gt; dialog_ui_restructure()</div><div class="qs-c-amb pl">modal_type: "fast_vibe"</div>'+
                          '</div></div>'+
                          '<div class="qs-frame__live"><div class="qs-frame__live-bar"><i></i></div></div>'+
                        '</div>'+
                      '</div>'+
                      '<div class="qs-frame__cmd"><span class="qs-palm">🖐️</span>'+qsMicIcoHtml(14)+'<span class="qs-frame__cmd-label qs-text-glow">“快速修改对话框UI”</span></div>'+
                    '</div>'+
                    veteranFrame1+
                  '</div>'+
                '</div>'+
              '</div>'+
              '<div class="mode-card__copy">'+
                '<h2>'+esc(t('qsIntentPickTitle','后台维护'))+'</h2>'+
                '<p>'+esc(t('qsIntentPickDesc','查看运行状态、诊断与备份维护。'))+'</p>'+
                pick+
              '</div>'+
              '<div class="selection-badge" aria-hidden="true">✓</div>'+
            '</div>'+

          '</div>'+
        '</div>'+
      '</div>'
    );
  }

  function bindModeMatrix(body){
    var container=$('qsModeCards')||(body&&body.querySelector('.cards-container'));
    if(!container) return;
    container.querySelectorAll('.mode-card').forEach(function(card){
      card.onclick=function(ev){
        if(ev.target.closest('button,[data-qs-debug]')) return;
        var type=card.getAttribute('data-type');
        if(type==='newbie'){ startCore('beginner'); return; }
        if(type==='vibe'){ goTool(); return; }
        if(type==='veteran'){ openSettingsPanel('debug',{ debugMode:'overview' }); }
      };
      card.onkeydown=function(ev){
        if(ev.key!=='Enter'&&ev.key!==' ') return;
        if(ev.target.closest('button,[data-qs-debug]')) return;
        ev.preventDefault();
        card.click();
      };
    });
    body.querySelectorAll('[data-qs-debug]').forEach(function(el){
      el.onclick=function(ev){
        ev.stopPropagation();
        var mode=el.getAttribute('data-qs-debug')||'overview';
        openSettingsPanel('debug',{ debugMode:mode });
      };
    });
  }

  function renderIntent(){
    route.stepId='intent';
    route.persona=null;
    stopDemoTimer();
    setNav([], '');
    showView('intent');
    var body=$('habitSetupIntentBody');
    if(!body) return;
    body.innerHTML=modeMatrixHtml();
    bindModeMatrix(body);
    var AI=global.OneToneAgentInstall;
    if(AI&&AI.fetchInventory){
      AI.fetchInventory().then(function(inv){
        var hint=$('qsIntentToolsHint');
        if(!hint||!inv) return;
        var high=(inv.agents||[]).filter(function(a){ return a.confidence==='high'; });
        var n=high.length||(inv.agents||[]).length;
        if(n>0){
          hint.innerHTML='<em class="is-hit">'+esc(t('qsIntentAgentsN','已检测 {n} 个 agent').replace('{n}', String(n)))+'</em>';
        }
      }).catch(function(){});
    }
  }

  function miniPreviewHtml(kinds, status){
    var AI=global.OneToneAgentInstall;
    status=status||'idle';
    if(!kinds||!kinds.length){
      return '<div class="qs-ai-mini is-empty">'+esc(t('qsAiMiniEmpty','勾选左侧工具，这里预览迷你栏'))+'</div>';
    }
    var chips=kinds.map(function(kind){
      var m=AI&&AI.meta?AI.meta(kind):{ label:kind, icon:'' };
      return '<span class="qs-ai-mini__agent" data-status="'+esc(status)+'" title="'+esc(m.label||kind)+'">'+
        (m.icon?'<img src="'+esc(m.icon)+'" alt="" width="16" height="16">':'')+
        '<i class="qs-ai-mini__dot" aria-hidden="true"></i></span>';
    }).join('');
    return '<div class="qs-ai-mini" id="qsAiMiniPreview">'+chips+
      '<span class="qs-ai-mini__btn" aria-hidden="true"></span>'+
      '<span class="qs-ai-mini__x" aria-hidden="true">×</span></div>';
  }

  function qsStatusLabel(st){
    if(st==='running') return t('qsAiStatusRunning','忙碌');
    if(st==='done') return t('qsAiStatusDone','完成');
    if(st==='failed'||st==='error') return t('qsAiStatusFailed','失败');
    return t('qsAiStatusIdle','空闲');
  }

  /** Real Soft Pad: brand chips sit on top of the face (above the key grid), not inside AG keys. */
  function qsAgentBarHtml(kinds, status){
    var AI=global.OneToneAgentInstall;
    status=status||'idle';
    if(!kinds||!kinds.length) return '';
    var chips=kinds.map(function(kind){
      var m=AI&&AI.meta?AI.meta(kind):{ label:kind, icon:'' };
      return '<button type="button" class="soft-pad-agent-bar__chip" data-agent="'+esc(kind)+'" data-status="'+esc(status)+'" aria-label="'+esc(m.label||kind)+'" title="'+esc(m.label||kind)+'">'+
        (m.icon?'<img src="'+esc(m.icon)+'" alt="" decoding="async" aria-hidden="true">':'')+
        '<i class="soft-pad-agent-bar__dot" aria-hidden="true"></i>'+
        '</button>';
    }).join('');
    return '<div class="soft-pad-agent-bar" id="qsAiPadAgentBar" role="toolbar" aria-label="Agent">'+chips+'</div>';
  }

  function mountQsAgentBar(host, faceMode){
    if(!host) return;
    var face=host.querySelector('.micro-hw__face');
    var grid=host.querySelector('.micro-hw__grid');
    if(!face||!grid) return;
    var old=face.querySelector('.soft-pad-agent-bar');
    if(old) old.remove();
    face.classList.remove('qs-ai-face--with-agents');
    // Real Soft Pad: agent chips live on the Soft Pad face top, never on numpad keys.
    if(faceMode!=='shortcut') return;
    var html=qsAgentBarHtml(route.selectedKinds||[], route.demoStatus||'idle');
    if(!html) return;
    var wrap=document.createElement('div');
    wrap.innerHTML=html;
    var bar=wrap.firstChild;
    if(!bar) return;
    face.insertBefore(bar, grid);
    face.classList.add('qs-ai-face--with-agents');
    var AI=global.OneToneAgentInstall;
    bar.querySelectorAll('.soft-pad-agent-bar__chip[data-agent]').forEach(function(el){
      el.onclick=function(ev){
        if(ev&&ev.stopPropagation) ev.stopPropagation();
        var kind=el.getAttribute('data-agent');
        var m=AI&&AI.meta?AI.meta(kind):{ label:kind };
        var st=el.getAttribute('data-status')||route.demoStatus||'idle';
        setQsKeyCaption(
          (m.label||kind)+' · '+qsStatusLabel(st)+' · '+
          t('qsAiAgentBarTip','顶栏状态灯与迷你栏同步：空闲 → 忙碌(蓝) → 完成(绿)')
        );
      };
    });
  }

  function syncQsAgentBarStatus(host){
    if(!host) return;
    var status=route.demoStatus||'idle';
    host.querySelectorAll('.soft-pad-agent-bar__chip[data-agent]').forEach(function(el){
      el.setAttribute('data-status', status);
    });
  }

  function qsPadUi(){
    return global.OneToneCodexMicroPadUi||null;
  }

  function qsPreviewMapping(shortcutOn){
    var Pad=qsPadUi();
    var m={
      id:'qs-preview',
      name:'QS Soft Pad Preview',
      codexMicroPad:{
        enabled:!!shortcutOn,
        skin:'vibe-light',
        showNavigationPad:true
      }
    };
    if(Pad&&Pad.ensurePad) Pad.ensurePad(m,{ persist:false });
    if(m.codexMicroPad) m.codexMicroPad.enabled=!!shortcutOn;
    return m;
  }

  function setQsKeyCaption(text){
    route.keyCaption=text||'';
    var host=$('qsAiPadHost');
    var nameEl=host&&host.querySelector('[data-soft-pad-caption] [data-cap-name]');
    var chordEl=host&&host.querySelector('[data-soft-pad-caption] [data-cap-chord]');
    if(nameEl) nameEl.textContent=route.keyCaption||t('softPadKeyCaptionIdle','悬停或点按键查看名称');
    if(chordEl){ chordEl.textContent=''; chordEl.hidden=true; }
  }

  function formatQsKeyMeta(meta){
    if(!meta) return '';
    var parts=[];
    if(meta.name) parts.push(meta.name);
    if(meta.chord) parts.push(meta.chord);
    if(meta.effect) parts.push(meta.effect);
    return parts.join(' · ');
  }

  function bindQsPadInteractions(host, mapping){
    var Pad=qsPadUi();
    if(!host||!mapping) return;
    if(Pad&&Pad.bindSoftPadPreviewCaption){
      host.__softPadCaptionBound=false;
      Pad.bindSoftPadPreviewCaption(host);
    }
    host.querySelectorAll('.micro-hw__key[data-micro-key]').forEach(function(el){
      el.onclick=function(ev){
        if(ev&&ev.preventDefault) ev.preventDefault();
        if(ev&&ev.stopPropagation) ev.stopPropagation();
        var id=el.getAttribute('data-micro-key');
        if(id==='ENC'){
          route._occupyFaceTouched=true;
          var wasShortcut=!!(mapping.codexMicroPad&&mapping.codexMicroPad.enabled);
          route.softShortcut=!wasShortcut;
          route.keyCaption=route.softShortcut
            ? t('qsAiFlippedToShortcut','已切换到快捷 Soft Pad（演示）')
            : t('qsAiFlippedToNumpad','已切换到数字面（演示）');
          route.padFlip=true;
          renderToolBody();
          setTimeout(function(){ route.padFlip=false; }, 400);
          return;
        }
        var meta=Pad&&Pad.softPadLayoutKeyMeta?Pad.softPadLayoutKeyMeta(mapping, id):null;
        var line=formatQsKeyMeta(meta);
        if(!line){
          line=(el.getAttribute('data-cap-name')||'')+
            (el.getAttribute('data-cap-chord')?' · '+el.getAttribute('data-cap-chord'):'');
        }
        setQsKeyCaption(line||t('qsAiKeyHint','点电源键切换面；点其它键查看提示'));
        el.classList.remove('is-pulse');
        void el.offsetWidth;
        el.classList.add('is-pulse');
        setTimeout(function(){ el.classList.remove('is-pulse'); }, 450);
      };
    });
  }

  function mountQsSoftPad(host, face){
    var Pad=qsPadUi();
    if(!host) return null;
    if(!Pad||!Pad.renderHardwarePad){
      host.innerHTML='<p class="qs-ai-muted">'+esc(t('qsAiPadUnavailable','Soft Pad 预览不可用'))+'</p>';
      return null;
    }
    var shortcut=face==='shortcut';
    var m=qsPreviewMapping(shortcut);
    var pad=m.codexMicroPad;
    host.innerHTML=
      '<div class="qs-ai-hw'+(route.padFlip?' is-flip':'')+'">'+
        Pad.renderHardwarePad(m, pad,{ mode:'softPad' })+
      '</div>'+
      '<div class="soft-pad-key-caption" data-soft-pad-caption aria-live="polite">'+
        '<span class="soft-pad-key-caption__name" data-cap-name>'+esc(t('softPadKeyCaptionIdle','悬停或点按键查看名称'))+'</span>'+
        '<span class="soft-pad-key-caption__chord" data-cap-chord hidden></span>'+
      '</div>';
    mountQsAgentBar(host, shortcut?'shortcut':'numpad');
    bindQsPadInteractions(host, m);
    return m;
  }

  function numpadToggleCopy(on){
    if(on){
      return {
        title:t('qsAiNumpadOnTitle','将抢占实体数字小键盘'),
        sub:t('qsAiNumpadOnSub','打开后实体 Num 键变为 Soft Pad 快捷面；可用 Number 切回数字面。关掉后实体键恢复输入数字。')
      };
    }
    return {
      title:t('qsAiNumpadOffTitle','启用 Soft Pad（数字键占用）'),
      sub:t('qsAiNumpadOffSub','默认关闭更安全。实体数字键仍输入数字；下方仅屏上预览。')
    };
  }

  function renderToolBody(){
    var AI=global.OneToneAgentInstall;
    var body=$('habitSetupToolBody');
    if(!body||!AI) return;
    var inv=route.inventory||{ agents:[], highConfidenceCount:0 };
    var agents=AI.sortAgentsForUi(inv.agents||[]);
    var high=agents.filter(function(a){ return a.confidence==='high'; });
    var rest=agents.filter(function(a){ return a.confidence!=='high'; });
    var selected=route.selectedKinds||[];
    var nHigh=high.length;

    function rowHtml(a){
      var kind=String(a.kind||'');
      var m=AI.meta(kind);
      var on=selected.indexOf(kind)>=0;
      var badge=AI.evidenceLabel(a);
      var cls='qs-ai-row'+(on?' is-on':'')+(a.confidence==='high'?' is-high':'');
      return '<label class="'+cls+'" data-qs-kind="'+esc(kind)+'">'+
        '<span class="qs-ai-check" aria-hidden="true"></span>'+
        '<input type="checkbox" class="qs-ai-check-input" '+(on?'checked':'')+' data-qs-check="'+esc(kind)+'">'+
        (m.icon?'<img class="qs-ai-row__ico" src="'+esc(m.icon)+'" alt="" width="22" height="22">':'')+
        '<span class="qs-ai-row__copy"><strong>'+esc(m.label||kind)+'</strong>'+
        '<i>'+esc(badge)+'</i></span></label>';
    }

    var leftHigh=high.map(rowHtml).join('');
    var leftRest=rest.map(rowHtml).join('');
    var title=nHigh===1
      ? t('qsAiTitleOne','已找到 {name}').replace('{name}', AI.meta(high[0].kind).label)
      : t('qsAiTitle','检测到本机 {n} 个 AI 工具').replace('{n}', String(nHigh||agents.length||0));
    var cta=selected.length===1
      ? t('qsAiCtaOne','为 {name} 启用状态灯与面板').replace('{name}', AI.meta(selected[0]).label)
      : t('qsAiCta','为已选工具启用状态灯与面板');
    var masterOn=route.softEnabledPreview===true;
    // Occupy ON → Soft Pad shortcut (fact). During demo animation follow softShortcut.
    var face;
    if(masterOn){
      if(route._occupyAnimating||route._occupyFaceTouched){
        face=route.softShortcut===false?'numpad':'shortcut';
      }else{
        face='shortcut';
      }
    }else{
      face=route.softShortcut?'shortcut':'numpad';
    }
    var togCopy=numpadToggleCopy(masterOn);
    var faceLabel=face==='shortcut'
      ? t('qsAiFaceShortcut','当前预览：快捷 Soft Pad')
      : t('qsAiFaceNumpad','当前预览：数字键盘');
    var demoNote=masterOn
      ? t('qsAiPadLiveNote','占用已勾选：实体 Num 将变成 Soft Pad（确认后生效）')
      : t('qsAiPadDemoNote','仅演示，实体数字键未占用');

    body.innerHTML=
      '<div class="qs-ai-page">'+
        '<div class="qs-ai-scroll">'+
          '<div class="habit-setup-badge">'+esc(t('qsToolBadge','程序员'))+'</div>'+
          '<h3 class="habit-setup-title habit-setup-title--left">'+esc(title)+'</h3>'+
          '<p class="habit-setup-desc habit-setup-desc--left">'+esc(t('qsAiDesc','勾选要显示状态的工具。右侧分别预览迷你栏与 Soft Pad。'))+'</p>'+
          '<div class="qs-ai-layout">'+
            '<div class="qs-ai-left">'+
              (leftHigh||'<p class="qs-ai-muted">'+esc(t('qsAiNoHigh','未高置信检测到已装工具，可从更多里勾选。'))+'</p>')+
              (rest.length
                ?('<button type="button" class="qs-ai-more-toggle" id="qsAiMoreToggle">'+(route.showMoreTools?esc(t('qsAiHideMore','收起更多工具')):esc(t('qsAiShowMore','更多工具')))+'</button>'+
                  '<div class="qs-ai-more" id="qsAiMore" '+(route.showMoreTools?'':'hidden')+'>'+leftRest+'</div>')
                :'')+
            '</div>'+
            '<div class="qs-ai-right">'+
              '<section class="qs-ai-card qs-ai-card--mini">'+
                '<div class="qs-ai-preview-label">'+esc(t('qsAiMiniLabel','迷你栏预览'))+'</div>'+
                miniPreviewHtml(selected, route.demoStatus)+
                '<p class="qs-ai-demo-hint">'+esc(t('qsAiDemoHint','连接后：空闲 → 忙碌(蓝) → 完成(绿)'))+'</p>'+
              '</section>'+
              '<section class="qs-ai-card qs-ai-card--pad">'+
                '<div class="qs-ai-preview-label">'+esc(t('qsAiPadLabel','Soft Pad 预览'))+'</div>'+
                '<p class="qs-ai-face-status" id="qsAiFaceStatus">'+esc(faceLabel)+' · '+esc(demoNote)+'</p>'+
                (masterOn
                  ?('<div class="qs-ai-danger" role="status">'+
                      '<strong>'+esc(t('qsAiDangerTitle','注意：会抢占数字小键盘'))+'</strong>'+
                      '<span>'+esc(t('qsAiDangerBody','开启后 NumLock 区数字键不再输入数字，而是触发 Soft Pad 快捷键。可随时关闭恢复。'))+'</span>'+
                    '</div>')
                  :'')+
                '<div class="qs-ai-pad'+(masterOn?' is-occupy':'')+(face==='shortcut'?' is-shortcut':' is-numpad')+'" id="qsAiPadHost"></div>'+
                '<div class="habit-setup-toggle qs-ai-numpad'+(masterOn?' is-danger':'')+'">'+
                  '<span><b id="qsAiNumpadTitle">'+esc(togCopy.title)+'</b>'+
                  '<span class="sub" id="qsAiNumpadSub">'+esc(togCopy.sub)+'</span></span>'+
                  '<button type="button" class="sw'+(masterOn?' on':'')+'" id="qsAiNumpadToggle" aria-pressed="'+(masterOn?'true':'false')+'"></button>'+
                '</div>'+
                '<p class="qs-ai-honest">'+esc(t('qsAiHonest','预览是示意；已选工具状态灯在 Soft Pad 顶部，下方按键为真实命令。'))+'</p>'+
              '</section>'+
            '</div>'+
          '</div>'+
        '</div>'+
        '<div class="habit-setup-actions habit-setup-actions--footer qs-ai-actions">'+
          '<button type="button" class="btn secondary" id="qsToolBack">'+esc(t('habitSetupPrev','上一步'))+'</button>'+
          '<button type="button" class="btn primary" id="qsToolNext" '+(selected.length?'':'disabled')+'>'+esc(cta)+'</button>'+
        '</div>'+
      '</div>';

    mountQsSoftPad($('qsAiPadHost'), face);
    if(route.keyCaption) setQsKeyCaption(route.keyCaption);

    body.querySelectorAll('[data-qs-check]').forEach(function(inp){
      inp.onchange=function(){
        var kind=inp.getAttribute('data-qs-check');
        var idx=route.selectedKinds.indexOf(kind);
        if(inp.checked&&idx<0) route.selectedKinds.push(kind);
        if(!inp.checked&&idx>=0) route.selectedKinds.splice(idx,1);
        syncRouteToolFromSelection();
        renderToolBody();
      };
    });
    var more=$('qsAiMoreToggle');
    if(more) more.onclick=function(){ route.showMoreTools=!route.showMoreTools; renderToolBody(); };

    var tog=$('qsAiNumpadToggle');
    if(tog) tog.onclick=function(ev){
      if(ev&&ev.stopPropagation) ev.stopPropagation();
      var turningOn=!route.softEnabledPreview;
      route.softEnabledPreview=turningOn;
      route._occupyFaceTouched=false;
      if(turningOn){
        route._occupyAnimating=true;
        route.softShortcut=false;
        route.padFlip=true;
        route.keyCaption=t('qsAiOccupyDemoStart','演示：占用前是数字键…');
        renderToolBody();
        setTimeout(function(){
          route.softShortcut=true;
          route.padFlip=true;
          route.keyCaption=t('qsAiOccupyDemo','占用后变成 Soft Pad 快捷面（可点电源键切换）');
          renderToolBody();
          setTimeout(function(){
            route.padFlip=false;
            route._occupyAnimating=false;
          }, 400);
        }, 550);
      }else{
        route._occupyAnimating=false;
        route.softShortcut=false;
        route.padFlip=false;
        route.keyCaption=t('qsAiOccupyOff','已关闭占用：实体数字键保持输入数字');
        renderToolBody();
      }
    };

    $('qsToolBack').onclick=function(){ stopDemoTimer(); renderIntent(); };
    $('qsToolNext').onclick=function(){
      if(!route.selectedKinds.length) return;
      var btn=$('qsToolNext');
      if(btn){ btn.disabled=true; btn.textContent=t('qsAiPreparing','正在准备…'); }
      AI.prepareKinds(route.selectedKinds,{ enableNumpad:route.softEnabledPreview===true }).then(function(res){
        route.prepareResults=res;
        var connectP = AI.connectSelectedKinds
          ? AI.connectSelectedKinds(route.selectedKinds, {})
          : Promise.resolve({ ok:true, results:[] });
        return connectP.then(function(cres){
          route.connectResults=cres;
          if(cres && cres.cancelled){
            /* user skipped hooks — Soft Pad still prepared */
          }else if(cres && cres.results && cres.results.length && global.OneToneApp&&global.OneToneApp.toast){
            var okN=cres.results.filter(function(r){return r.ok;}).length;
            if(okN){
              global.OneToneApp.toast(t('qsAiConnectDone','已接入 {n} 个工具 — 回 Agent 发一条消息点亮状态').replace('{n}',String(okN)));
            }
          }
          stopDemoTimer();
          startCore('vibe');
        });
      }).catch(function(err){
        if(global.OneToneApp&&global.OneToneApp.toast){
          global.OneToneApp.toast(t('qsAiPrepareFail','准备失败：')+String(err&&err.message||err||''));
        }
        renderToolBody();
      });
    };
  }

  function goTool(){
    route.persona='vibe';
    route.stepId='tool';
    stopDemoTimer();
    route.softEnabledPreview=false;
    route.softShortcut=false;
    route.padFlip=false;
    route._occupyFaceTouched=false;
    route._occupyAnimating=false;
    route.keyCaption='';
    if(global.OneToneHabitTriggerSetup&&global.OneToneHabitTriggerSetup.closeQuiet){
      global.OneToneHabitTriggerSetup.closeQuiet();
    }
    openOverlayShell();
    setNav(vibeNavSteps(),'tool');
    showView('tool');
    var body=$('habitSetupToolBody');
    if(!body) return;
    body.innerHTML='<p class="habit-setup-desc">'+esc(t('qsAiScanning','正在扫描本机 AI 工具…'))+'</p>';

    var AI=global.OneToneAgentInstall;
    if(!AI||!AI.fetchInventory){
      body.innerHTML='<p class="habit-setup-desc">'+esc(t('qsAiNoService','扫描服务不可用'))+'</p>';
      return;
    }
    AI.fetchInventory().then(function(inv){
      route.inventory=inv;
      if(!route.selectedKinds.length){
        route.selectedKinds=AI.defaultSelectedKinds(inv);
      }
      if(!(inv&&inv.highConfidenceCount)){
        route.showMoreTools=true;
      }
      syncRouteToolFromSelection();
      route.softEnabledPreview=false;
      route.demoStatus='idle';
      renderToolBody();
      stopDemoTimer();
      var cycle=['idle','running','done'];
      var i=0;
      demoTimer=setInterval(function(){
        i=(i+1)%cycle.length;
        route.demoStatus=cycle[i];
        var mini=$('qsAiMiniPreview');
        if(mini){
          mini.querySelectorAll('.qs-ai-mini__agent').forEach(function(el){
            el.setAttribute('data-status', route.demoStatus);
          });
        }
        syncQsAgentBarStatus($('qsAiPadHost'));
      }, 1200);
    }).catch(function(){
      route.inventory=AI.emptyInventory?AI.emptyInventory():{agents:[],highConfidenceCount:0};
      route.selectedKinds=route.selectedKinds||[];
      route.softEnabledPreview=false;
      route.demoStatus='idle';
      route.showMoreTools=true;
      renderToolBody();
    });
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
      ? { tag:t('qsDoneTagOn','已开启'), text:t('qsDoneSoftOn','Soft Pad 数字键占用已开启') }
      : { tag:t('qsDoneTagLearn','状态灯'), text:t('qsDoneSoftLearn','已准备状态灯与迷你栏 · 可在虚拟键盘里继续调整') };
    var kinds=(route.selectedKinds&&route.selectedKinds.length)?route.selectedKinds:[route.tool];
    var toolsLine=kinds.map(function(k){
      var AI=global.OneToneAgentInstall;
      return AI&&AI.meta?AI.meta(k).label:k;
    }).join(' / ');
    var body=$('habitSetupDoneBody');
    if(!body) return;
    body.innerHTML=
      '<div class="qs-ai-page">'+
        '<div class="qs-ai-scroll">'+
          '<div class="habit-setup-badge">'+esc(t('qsDoneBadge','完成'))+'</div>'+
          '<h3 class="habit-setup-title habit-setup-title--left">'+esc(vibe?t('qsDoneTitleVibe','可以开始用了'):t('qsDoneTitleBeg','通用习惯就绪'))+'</h3>'+
          '<p class="habit-setup-desc habit-setup-desc--left">'+esc(t('qsDoneDesc','摘要区分「已配置」与「建议下一步」。'))+'</p>'+
          '<ul class="habit-setup-done-list">'+
            '<li><span class="tag">'+esc(t('qsDoneTagConfigured','已配置'))+'</span><div>'+esc(t('qsDoneTrigger','启动键：{key}').replace('{key}',sum.trigger))+'</div></li>'+
            '<li><span class="tag">'+esc(t('qsDoneTagConfigured','已配置'))+'</span><div>'+esc(t('qsDoneVoice','语音快捷键 / 结束词（结束听写，不自动发送）'))+'</div></li>'+
            (vibe?'<li><span class="tag">'+esc(t('qsDoneTagTarget','目标'))+'</span><div>'+esc(t('qsDoneTool','目标工具：{tool}').replace('{tool}',toolsLine||toolLabel()))+'</div></li>':'')+
            (vibe?'<li><span class="tag learn">'+esc(softLine.tag)+'</span><div>'+esc(softLine.text)+'</div></li>':'')+
            (vibe?'<li><span class="tag next">'+esc(t('qsDoneTagNext','建议下一步'))+'</span><div>'+esc(t('qsDoneCamera','在对应 AI 工具里发一条任务，看迷你栏灯是否变色'))+'</div></li>':'')+
          '</ul>'+
        '</div>'+
        '<div class="habit-setup-actions habit-setup-actions--footer qs-ai-actions">'+
          (vibe?'<button type="button" class="btn secondary" id="qsDoneCam">'+esc(t('qsDoneCamCta','继续配置摄像头'))+'</button>':'')+
          '<button type="button" class="btn primary" id="qsDoneHome">'+esc(t('qsDoneHome','回到首页'))+'</button>'+
        '</div>'+
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
    stopDemoTimer();
    if(global.OneToneHabitTriggerSetup&&global.OneToneHabitTriggerSetup.close){
      try{ global.OneToneHabitTriggerSetup.close(); }catch(_){}
    }
    hideAllViews();
    setNav([],'');
    closeOverlayShell();
    route.persona=null;
    route.stepId='intent';
  }

  function handleHeaderBack(){
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
    if(route.stepId==='tool'||route.stepId==='done'){ renderIntent(); return true; }
    close();
    return true;
  }

  function handleEsc(){
    return handleHeaderBack();
  }

  function bindOnce(){
    if(bindOnce._done) return;
    bindOnce._done=true;
    var backBtn=$('btnHabitSetupHeaderClose');
    if(backBtn){
      backBtn.addEventListener('click',function(){
        if(openFlag){
          handleHeaderBack();
          return;
        }
        if(global.OneToneHabitTriggerSetup&&global.OneToneHabitTriggerSetup.isOpen&&global.OneToneHabitTriggerSetup.isOpen()){
          if(global.OneToneHabitTriggerSetup.handleEsc) global.OneToneHabitTriggerSetup.handleEsc();
          else if(global.OneToneHabitTriggerSetup.close) global.OneToneHabitTriggerSetup.close();
        }
      });
    }
  }

  global.OneToneQuickStart={
    open:open,
    close:close,
    handleEsc:handleEsc,
    handleHeaderBack:handleHeaderBack,
    bindOnce:bindOnce,
    isOpen:function(){ return !!openFlag; },
    getRoute:function(){ return { persona:route.persona, stepId:route.stepId, tool:route.tool }; }
  };
})((typeof window!=='undefined')?window:globalThis);
