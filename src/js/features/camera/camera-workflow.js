(function(global){
  'use strict';

  /**
   * Camera settings hero workflow:
   * - three flow-node tabs (trigger / action / pro) — user labels: 规则设计 / 执行方案 / Pro
   * - Trigger: if-then rules + master toggle (no preview)
   * - Action: preview · device · calib · guardrails
   * - Pro: capability docs only (9-grid explain / future)
   * - metrics via lightweight polling (sr-only ids stay unique)
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

  var TABS=['trigger','action','pro'];
  var POLL_MS=750;
  var currentTab='trigger';
  var pollTimer=0;
  var bound=false;
  var wasCalibrating=false;

  var TAB_COPY={
    trigger:{
      kicker:['cameraWorkflowPreviewKicker','视觉识别'],
      title:['cameraWorkflowPreviewTitleTrigger','看到动作 → 执行结果']
    },
    action:{
      kicker:['cameraWorkflowPreviewKickerAction','摄像头设置'],
      title:['cameraWorkflowPreviewTitleAction','预览 · 设备 · 校准']
    },
    pro:{
      kicker:['cameraWorkflowPreviewKickerPro','Pro 视觉能力'],
      title:['cameraWorkflowPreviewTitlePro','美颜 · 手势 · 身份识别']
    }
  };

  var BOARD_MOD={
    trigger:'camera-hero-board--rules',
    action:'camera-hero-board--execution',
    pro:'camera-hero-board--pro'
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

  function scrollToEl(el){
    if(!el||!el.scrollIntoView) return;
    try{ el.scrollIntoView({block:'nearest',behavior:'smooth'}); }catch(_){
      try{ el.scrollIntoView(true); }catch(__){}
    }
  }

  /** Open calib/execution or Pro docs. Calib targets → action; docs → pro. */
  function openProPanel(target){
    var id=target==null?'cameraPanelPro'
      :(target===true?'cameraCalibBlock'
      :(target===false?'cameraPanelPro'
      :String(target||'cameraPanelPro')));
    if(id==='true') id='cameraCalibBlock';
    if(id==='false') id='cameraPanelPro';
    if(id==='cameraTriggerTools'||id==='cameraProAdvanced') id='cameraCalibBlock';
    var calibTarget=id==='cameraCalibBlock'||id==='cameraPanelAction'||id==='cameraHeroPreview';
    if(calibTarget){
      activateTab('action');
      scrollToEl($(id==='cameraPanelAction'?'cameraCalibBlock':id)||$('cameraCalibBlock')||$('cameraPanelAction'));
      return;
    }
    activateTab('pro');
    var el=$(id)||$('cameraPanelPro');
    scrollToEl(el);
  }

  /** Compat: calib targets → action; fine-map/pro-stack → pro; else rules. */
  function openTriggerTools(target){
    var id=target==null||target===true?'cameraCalibBlock':String(target||'cameraCalibBlock');
    if(id==='cameraTriggerTools'||id==='true') id='cameraCalibBlock';
    if(id==='cameraCalibBlock'){
      openProPanel('cameraCalibBlock');
      return;
    }
    if(id==='cameraFineMapFold'||id==='cameraProStack'){
      activateTab('pro');
      scrollToEl($(id)||$('cameraPanelPro'));
      return;
    }
    activateTab('trigger');
    scrollToEl($(id)||$('cameraPanelTrigger'));
  }

  /** Compat: scrollToCalib → execution calib; else Pro docs panel. */
  function openAdvancedConfirmFold(scrollToCalib){
    if(scrollToCalib) openProPanel('cameraCalibBlock');
    else openProPanel('cameraPanelPro');
  }

  function syncBoardMod(name){
    var board=$('cameraHeroBoard');
    if(!board) return;
    Object.keys(BOARD_MOD).forEach(function(tab){
      board.classList.toggle(BOARD_MOD[tab],tab===name);
    });
  }

  function showTabUi(name){
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
    syncBoardMod(name);
    var copy=TAB_COPY[name]||TAB_COPY.trigger;
    setText('cameraWorkflowPreviewKicker',t(copy.kicker[0],copy.kicker[1]));
    setText('cameraWorkflowPreviewTitle',t(copy.title[0],copy.title[1]));
  }

  function activateTab(name){
    if(TABS.indexOf(name)<0) name='trigger';
    if(isCalibrating()){
      toast(t('cameraCalibLockToast','校准进行中，请先完成或取消校准'));
      if(currentTab&&TABS.indexOf(currentTab)>=0) name=currentTab;
      else name='action';
    }
    showTabUi(name);
    try{
      if(global.OneToneCameraPresenceActions&&global.OneToneCameraPresenceActions.syncUiFromPrefs){
        global.OneToneCameraPresenceActions.syncUiFromPrefs();
      }
    }catch(_){}
    syncInactiveHint();
    syncCalibTabLock();
    syncGazeMap();
    syncProStatus();
  }

  function syncCalibTabLock(){
    var running=isCalibrating();
    TABS.forEach(function(tab){
      var btn=$('cameraFlowNode'+tab.charAt(0).toUpperCase()+tab.slice(1));
      if(!btn) return;
      btn.disabled=!!running;
      btn.setAttribute('aria-disabled',running?'true':'false');
      btn.classList.toggle('is-locked',!!running);
    });
    var hint=$('cameraCalibLockHint');
    if(hint) hint.hidden=!running;
    var cancel=$('cameraGazeCalibrationCancel');
    if(cancel) cancel.disabled=false;

    if(running&&!wasCalibrating){
      wasCalibrating=true;
      // Calib UI lives on execution — stay there without re-entering activateTab lock path.
      showTabUi('action');
      scrollToEl($('cameraCalibBlock')||$('cameraPanelAction'));
      return;
    }
    wasCalibrating=!!running;
  }

  function syncGazeMap(){
    var map=$('cameraGazeMap');
    var chip=$('cameraGazeMapModeChip');
    var cal=calibrationApi();
    var has=hasCalibModel();
    var fine=!!(cal&&cal.isFineGridModel&&cal.isFineGridModel());
    if(!fine&&cal&&cal.getState){
      var st=cal.getState();
      fine=!!(st&&st.fineGrid);
    }
    if(map){
      map.classList.toggle('is-coarse',!fine);
      map.classList.toggle('is-fine',!!fine);
    }
    if(chip){
      if(!has){
        chip.textContent=t('cameraGazeMapModeDocs','说明预览 · 不会自动发送 · 需要精细校准');
      }else if(fine){
        chip.textContent=t('cameraGazeMapModeFineReady','精细校准完成 · 更细区域')+' · '+t('cameraGazeMapWarnNoAutoSend','不会自动发送');
      }else{
        chip.textContent=t('cameraGazeMapModeFastReady','快校完成 · 粗区域')+' · '+t('cameraGazeMapWarnNoAutoSend','不会自动发送');
      }
    }
  }

  function syncProStatus(){
    var helloEl=$('cameraProStatusHello');
    if(helloEl){
      helloEl.textContent=t('cameraProHelloStatusFuture','未来支持 · 需要兼容 IR / 安全摄像头');
    }
    syncProDeviceDiag();
  }

  function syncProDeviceDiag(){
    var resEl=$('cameraProDeviceRes');
    var fpsEl=$('cameraProDeviceFps');
    var lightEl=$('cameraProDeviceLight');
    var sourceEl=$('cameraProDeviceSource');
    var pv=previewApi();
    var st=pv&&pv.getGazeDebugState?pv.getGazeDebugState():null;
    var live=!!(st&&st.previewLive);
    var sz=pv&&pv.getActualVideoSize?pv.getActualVideoSize():null;
    if(resEl){
      if(sz&&sz.width>0&&sz.height>0){
        resEl.textContent=String(Math.round(sz.width))+' × '+String(Math.round(sz.height));
      }else{
        resEl.textContent='—';
      }
    }
    if(fpsEl){
      var hint=$('cameraCapabilityHint');
      var fpsTxt='—';
      var fpsHost=$('cameraFpsPills');
      if(fpsHost){
        var active=fpsHost.querySelector('.is-active,[aria-pressed="true"],.is-selected');
        if(active) fpsTxt=String(active.textContent||'').trim()||'—';
      }
      fpsEl.textContent=live?fpsTxt:'—';
    }
    if(lightEl){
      lightEl.textContent=t('cameraProDeviceLightIdle','未检测');
    }
    if(sourceEl){
      sourceEl.textContent=t('cameraProDeviceSourceRaw','识别画面使用原始视频');
    }
  }

  function syncInactiveHint(){
    var hint=$('cameraWorkflowInactiveHint');
    if(hint) hint.hidden=true;
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
      if(st.lastGesture==='blink'&&st.pulseActive) return t('cameraPresenceGestureBlink','闭眼两次确认');
      if(st.shakeListeningLabel) return st.shakeListeningLabel;
      if(st.lastGesture==='shake') return t('cameraPresenceGestureShake','摇头');
      if(st.lastGesture==='blink') return t('cameraPresenceGestureBlink','闭眼两次确认');
    }
    var el=$('cameraPresenceGestureText');
    if(el&&el.textContent) return el.textContent.trim();
    return t('cameraPresenceGestureNone','无');
  }

  function syncMetrics(){
    if(!panelVisible()) return;
    var face=readFaceLabel();
    var gesture=readGestureLabel();
    var gaze=readGazeLabel();
    var calib=readCalibLabel();
    setText('cameraWorkflowFaceText',face);
    setText('cameraWorkflowGestureText',gesture);
    setText('cameraWorkflowGazeText',gaze);
    setText('cameraWorkflowCalibText',calib);
    setText('cameraQualityFaceText',face);
    setText('cameraQualityGestureText',gesture);
    setText('cameraQualityGazeText',gaze);
    setText('cameraQualityCalibText',calib);
    syncInactiveHint();
    syncCalibTabLock();
    syncGazeMap();
    syncProStatus();
    var pa=presenceApi();
    if(pa&&pa.syncTriggerSummaries){
      try{ pa.syncTriggerSummaries(); }catch(_){}
    }
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
          toast(t('cameraCalibLockToast','校准进行中，请先完成或取消校准'));
          openProPanel('cameraCalibBlock');
          return;
        }
        activateTab(name);
      });
    }
    var gotoPro=$('cameraGotoProFromTrigger');
    if(gotoPro){
      gotoPro.addEventListener('click',function(e){
        e.preventDefault();
        openProPanel('cameraCalibBlock');
      });
    }
    var backRules=$('cameraBackToRulesFromAction');
    if(backRules){
      backRules.addEventListener('click',function(e){
        e.preventDefault();
        activateTab('trigger');
      });
    }
    var helloCheck=$('cameraProHelloCheckBtn');
    if(helloCheck){
      helloCheck.addEventListener('click',function(e){
        e.preventDefault();
        var el=$('cameraProStatusHello');
        var msg=t('cameraProHelloCheckResult','当前环境未接入系统确认；仍显示为未来能力。');
        if(el) el.textContent=msg;
        toast(msg);
      });
    }
  }

  function onPanelVisible(){
    bindUi();
    if(TABS.indexOf(currentTab)<0) currentTab='trigger';
    activateTab(currentTab||'trigger');
    startPoll();
    var pa=presenceApi();
    if(pa&&pa.syncUiFromPrefs){
      try{ pa.syncUiFromPrefs(); }catch(_){}
    }
    try{
      if(global.OneToneAppThemePrefs&&global.OneToneAppThemePrefs.renderSoundSettingsPanel){
        global.OneToneAppThemePrefs.renderSoundSettingsPanel();
      }
    }catch(_){}
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
    syncGazeMap:syncGazeMap,
    openProPanel:openProPanel,
    openTriggerTools:openTriggerTools,
    openAdvancedConfirmFold:openAdvancedConfirmFold,
    getTab:function(){ return currentTab; }
  };

  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',init);
  }else{
    init();
  }
})((typeof window!=='undefined')?window:globalThis);
