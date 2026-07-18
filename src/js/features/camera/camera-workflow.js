(function(global){
  'use strict';

  /**
   * Camera settings hero workflow:
   * - two primary flow-node tabs (trigger / action)
   * - advanced confirm fold for gaze (optional)
   * - left-rail metrics via lightweight polling
   * - beginner guide chips (prefs for away/shake; explain-only for zones)
   * Does not clone presence selects; those keep original IDs.
   */

  var $=function(id){
    return global.OneToneDom&&global.OneToneDom.$?global.OneToneDom.$(id):document.getElementById(id);
  };
  var t=function(key,fallback){
    if(global.OneToneI18n&&global.OneToneI18n.t){
      var v=global.OneToneI18n.t(key);
      if(v&&v!==key) return v;
    }
    return fallback!=null?fallback:key;
  };

  var TABS=['trigger','action'];
  var POLL_MS=750;
  var currentTab='trigger';
  var pollTimer=0;
  var bound=false;
  var wasCalibrating=false;

  var TAB_COPY={
    trigger:{
      kicker:['cameraWorkflowPreviewKicker','当前预览'],
      title:['cameraWorkflowPreviewTitleTrigger','等待识别动作']
    },
    action:{
      kicker:['cameraWorkflowPreviewKickerAction','识别后做什么'],
      title:['cameraWorkflowPreviewTitleAction','语义动作 → 底层映射']
    }
  };

  function presenceApi(){
    return global.OneToneCameraPresenceActions||null;
  }

  function previewApi(){
    return global.OneToneCameraPreview||null;
  }

  function calibrationApi(){
    return global.OneToneCameraGazeCalibration||null;
  }

  function panelVisible(){
    var panel=$('settingsPanelCamera');
    return !!(panel&&!panel.hidden);
  }

  function setText(id,value){
    var el=$(id);
    if(el) el.textContent=value;
  }

  function toast(msg){
    try{
      if(global.OneToneAppToast&&global.OneToneAppToast.show){
        global.OneToneAppToast.show(msg,'lite');
      }
    }catch(_){}
  }

  function isCalibrating(){
    var cal=calibrationApi();
    return !!(cal&&cal.getState&&cal.getState().running);
  }

  function hasCalibModel(){
    var cal=calibrationApi();
    if(cal&&cal.hasModel) return !!cal.hasModel();
    if(cal&&cal.getState) return !!cal.getState().hasModel;
    return false;
  }

  function openAdvancedConfirmFold(scrollToCalib){
    var fold=$('cameraAdvancedConfirmFold');
    if(fold) fold.open=true;
    if(scrollToCalib){
      var block=$('cameraCalibBlock')||$('cameraCalibLockHint');
      if(block&&block.scrollIntoView){
        try{ block.scrollIntoView({block:'nearest',behavior:'smooth'}); }catch(_){
          try{ block.scrollIntoView(true); }catch(__){}
        }
      }
    }
  }

  function activateTab(name){
    if(TABS.indexOf(name)<0) name='trigger';
    if(isCalibrating()){
      openAdvancedConfirmFold(true);
      toast(t('cameraCalibLockToast','校准进行中，请先完成或取消校准'));
      // Still allow switching between the two primary tabs is blocked below via disabled buttons;
      // keep currentTab if lock is on.
      if(currentTab&&TABS.indexOf(currentTab)>=0) name=currentTab;
    }
    currentTab=name;

    TABS.forEach(function(tab){
      var btn=$('cameraFlowNode'+tab.charAt(0).toUpperCase()+tab.slice(1));
      var panel=$('cameraPanel'+tab.charAt(0).toUpperCase()+tab.slice(1));
      var on=tab===name;
      if(btn){
        btn.classList.toggle('is-active',on);
        btn.setAttribute('aria-selected',on?'true':'false');
      }
      if(panel){
        panel.classList.toggle('is-active',on);
        panel.hidden=!on;
      }
    });

    var copy=TAB_COPY[name]||TAB_COPY.trigger;
    setText('cameraWorkflowPreviewKicker',t(copy.kicker[0],copy.kicker[1]));
    setText('cameraWorkflowPreviewTitle',t(copy.title[0],copy.title[1]));
    syncInactiveHint();
    syncCalibTabLock();
    syncGazeMap();
  }

  function syncCalibTabLock(){
    var running=isCalibrating();
    var triggerBtn=$('cameraFlowNodeTrigger');
    var actionBtn=$('cameraFlowNodeAction');
    var hint=$('cameraCalibLockHint');
    if(triggerBtn){
      triggerBtn.disabled=!!running;
      triggerBtn.setAttribute('aria-disabled',running?'true':'false');
      triggerBtn.classList.toggle('is-locked',!!running);
    }
    if(actionBtn){
      actionBtn.disabled=!!running;
      actionBtn.setAttribute('aria-disabled',running?'true':'false');
      actionBtn.classList.toggle('is-locked',!!running);
    }
    if(hint) hint.hidden=!running;
    var cancel=$('cameraGazeCalibrationCancel');
    if(cancel) cancel.disabled=false;

    if(running&&!wasCalibrating){
      openAdvancedConfirmFold(true);
    }
    wasCalibrating=!!running;
  }

  function syncGazeMap(){
    var map=$('cameraGazeMap');
    var chip=$('cameraGazeMapModeChip');
    var fine=hasCalibModel();
    if(map){
      map.classList.toggle('is-coarse',!fine);
      map.classList.toggle('is-fine',!!fine);
    }
    if(chip){
      chip.textContent=fine
        ? t('cameraGazeMapModeFine','已校准 · 更细区域')
        : t('cameraGazeMapModeCoarse','未校准 · 粗区域');
    }
  }

  function syncInactiveHint(){
    var hint=$('cameraWorkflowInactiveHint');
    var api=presenceApi();
    var enabled=!!(api&&api.isEnabled&&api.isEnabled());
    var prefs=api&&api.prefs?api.prefs():null;
    var configured=false;
    if(prefs){
      configured=prefs.onAway!=='none'||prefs.onReturn!=='none'||prefs.shakeHead!=='none'||prefs.deliberateBlink!=='none';
    }
    if(hint){
      hint.hidden=!(!enabled&&configured);
      if(!hint.getAttribute('data-click-bound')){
        hint.setAttribute('data-click-bound','1');
        hint.style.cursor='pointer';
        hint.addEventListener('click',function(){
          var pa=presenceApi();
          if(pa&&pa.persist) pa.persist({enabled:true});
          syncInactiveHint();
        });
      }
    }
    var cards=document.querySelectorAll('#cameraPanelTrigger .camera-config-card:not(.is-placeholder)');
    for(var i=0;i<cards.length;i++){
      cards[i].classList.toggle('is-inactive-config',!enabled&&configured);
    }
    var bindList=$('cameraPresenceBindList');
    if(bindList) bindList.classList.toggle('is-dimmed',!enabled);
  }

  function readGazeLabel(){
    var el=$('cameraGazeStateText');
    if(el&&el.textContent) return el.textContent.trim();
    var pv=previewApi();
    if(pv&&pv.getGazeDebugState){
      var st=pv.getGazeDebugState();
      if(st&&st.point&&st.point.state){
        if(st.point.state==='tracking') return t('cameraGazeStateTracking','估计中');
        if(st.point.state==='lost') return t('cameraGazeStateLost','未检测到稳定人脸');
        if(st.point.state==='low-confidence') return t('cameraGazeStateLowConfidence','低置信，保持最近位置');
      }
      if(st&&!st.enabled) return t('cameraGazeStateIdle','待命');
    }
    return t('cameraGazeStateIdle','待命');
  }

  function readCalibLabel(){
    var el=$('cameraGazeCalibrationStatus');
    if(el&&el.textContent) return el.textContent.trim();
    var glance=$('cameraGlanceCalib');
    if(glance&&glance.textContent) return glance.textContent.trim();
    return t('cameraGlanceCalibIdle','未开始');
  }

  function readFaceLabel(){
    var api=presenceApi();
    if(api&&api.isEnabled&&api.isEnabled()&&api.getState){
      var st=api.getState();
      if(st.presence==='present') return t('cameraPresenceStatePresent','在席');
      if(st.presence==='away') return t('cameraPresenceStateAway','离席');
      if(st.faceDetected) return t('cameraGazeStateTracking','估计中');
      return t('cameraGlanceFaceUndetected','未检测');
    }
    var glance=$('cameraGlanceFace');
    if(glance&&glance.textContent) return glance.textContent.trim();
    return t('cameraGlanceFaceUndetected','未检测');
  }

  function readGestureLabel(){
    var api=presenceApi();
    if(api&&api.getState){
      var st=api.getState();
      if(st.lastGesture==='shake'&&st.pulseActive) return t('cameraPresenceGestureShake','摇头');
      if(st.lastGesture==='blink'&&st.pulseActive) return t('cameraPresenceGestureBlink','长眨');
      if(st.shakeListeningLabel) return st.shakeListeningLabel;
      if(st.lastGesture==='shake') return t('cameraPresenceGestureShake','摇头');
      if(st.lastGesture==='blink') return t('cameraPresenceGestureBlink','长眨');
    }
    var el=$('cameraPresenceGestureText');
    if(el&&el.textContent) return el.textContent.trim();
    return t('cameraPresenceGestureNone','无');
  }

  function syncMetrics(){
    if(!panelVisible()) return;
    setText('cameraWorkflowFaceText',readFaceLabel());
    setText('cameraWorkflowGestureText',readGestureLabel());
    setText('cameraWorkflowGazeText',readGazeLabel());
    setText('cameraWorkflowCalibText',readCalibLabel());
    syncInactiveHint();
    syncAppScope();
    syncCalibTabLock();
    syncGazeMap();
    // Keep trigger-card summaries in sync; applyLang on appWorkbenchShell can wipe static placeholders.
    var pa=presenceApi();
    if(pa&&pa.syncTriggerSummaries){
      try{ pa.syncTriggerSummaries(); }catch(_){}
    }
  }

  function syncAppScope(){
    var summary=$('cameraAppScopeSummary');
    if(!summary) return;
    var st=global.OneToneState&&global.OneToneState.state?global.OneToneState.state:{};
    var cfg=st.config||{};
    var id=String(cfg.activeSceneId||st.selectedMappingId||'').trim();
    var maps=cfg.mappings||[];
    var m=null;
    for(var i=0;i<maps.length;i++){
      if(maps[i]&&maps[i].id===id){ m=maps[i]; break; }
    }
    if(!m&&maps.length) m=maps[0];
    if(!m){
      summary.textContent=t('cameraAppScopeNone','尚未选择习惯');
      return;
    }
    var label=String(m.label||'').trim()||t('cameraAppScopeUnnamed','未命名习惯');
    var appId=String(m.appTargetId||'').trim();
    if(appId){
      summary.textContent=label+' · '+appId;
    }else{
      summary.textContent=label+' · '+t('cameraAppScopeGlobal','全部应用 / 通用');
    }
  }

  function applyAwayPrivacyGuide(){
    var api=presenceApi();
    if(!(api&&api.persist)) return;
    api.persist({
      onAway:'privacyScreen',
      onReturn:'none'
    });
    activateTab('action');
    toast(t('cameraGuideAwayPrivacyToast','已设置：离席打开隐私屏'));
  }

  function applyShakeCancelGuide(){
    var api=presenceApi();
    if(!(api&&api.persist)) return;
    api.persist({
      shakeHead:'pressEsc'
    });
    activateTab('action');
    toast(t('cameraGuideShakeCancelToast','已设置：摇头取消（Esc）'));
  }

  function explainZoneConfirmGuide(){
    openAdvancedConfirmFold(false);
    toast(t('cameraGuideZoneExplainToast','本轮仅说明：看右下进入发送确认，不会直接发送'));
  }

  function startPoll(){
    stopPoll();
    syncMetrics();
    pollTimer=setInterval(syncMetrics,POLL_MS);
  }

  function stopPoll(){
    if(pollTimer){
      clearInterval(pollTimer);
      pollTimer=0;
    }
  }

  function openKeysPanel(){
    try{
      if(global.OneToneSettingsDrawer&&global.OneToneSettingsDrawer.setPanel){
        global.OneToneSettingsDrawer.setPanel('keys',{});
        return;
      }
    }catch(_){}
    var nav=document.querySelector('.settings-nav-item[data-panel="keys"]');
    if(nav) nav.click();
  }

  function bindUi(){
    if(bound) return;
    bound=true;
    var nodes=$('cameraFlowNodes');
    if(nodes){
      nodes.addEventListener('click',function(e){
        var btn=e.target&&e.target.closest?e.target.closest('.flow-node-btn'):null;
        if(!btn||btn.disabled) return;
        e.preventDefault();
        var node=btn.closest('[data-camera-node]');
        var name=node?String(node.getAttribute('data-camera-node')||''):'';
        if(!name) return;
        if(isCalibrating()){
          openAdvancedConfirmFold(true);
          toast(t('cameraCalibLockToast','校准进行中，请先完成或取消校准'));
          return;
        }
        activateTab(name);
      });
    }
    var guides=$('cameraBeginnerGuides');
    if(guides){
      guides.addEventListener('click',function(e){
        var chip=e.target&&e.target.closest?e.target.closest('[data-camera-guide]'):null;
        if(!chip) return;
        e.preventDefault();
        var kind=String(chip.getAttribute('data-camera-guide')||'');
        if(kind==='awayPrivacy') applyAwayPrivacyGuide();
        else if(kind==='shakeCancel') applyShakeCancelGuide();
        else if(kind==='zoneExplain') explainZoneConfirmGuide();
      });
    }
    var openKeys=$('btnCameraOpenKeysScope');
    if(openKeys){
      openKeys.addEventListener('click',function(e){
        e.preventDefault();
        openKeysPanel();
      });
    }
  }

  function onPanelVisible(){
    bindUi();
    if(currentTab!=='trigger'&&currentTab!=='action') currentTab='trigger';
    activateTab(currentTab||'trigger');
    startPoll();
    var pa=presenceApi();
    if(pa&&pa.syncUiFromPrefs){
      try{ pa.syncUiFromPrefs(); }catch(_){}
    }
  }

  function onPanelHidden(){
    stopPoll();
  }

  function init(){
    bindUi();
    activateTab('trigger');
    if(panelVisible()) startPoll();
  }

  global.OneToneCameraWorkflow={
    init:init,
    onPanelVisible:onPanelVisible,
    onPanelHidden:onPanelHidden,
    activateTab:activateTab,
    syncMetrics:syncMetrics,
    syncInactiveHint:syncInactiveHint,
    openAdvancedConfirmFold:openAdvancedConfirmFold,
    getTab:function(){ return currentTab; }
  };

  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',init);
  }else{
    init();
  }
})((typeof window!=='undefined')?window:globalThis);
