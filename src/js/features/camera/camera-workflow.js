(function(global){
  'use strict';

  /**
   * Camera settings hero workflow:
   * - three flow-node tabs (trigger / action / pro) — user labels: 规则设计 / 执行方案 / Pro
   * - Trigger: if-then rules + master toggle (no preview)
   * - Action: preview · device · calib · guardrails
   * - Pro: live preview + local enhancement (preview DOM parked here while active)
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
      title:['cameraWorkflowPreviewTitlePro','预览 · 美颜 · 画面增强']
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
    parkPreviewForTab(name);
    try{
      if(global.OneToneCameraPresenceActions&&global.OneToneCameraPresenceActions.syncUiFromPrefs){
        global.OneToneCameraPresenceActions.syncUiFromPrefs();
      }
    }catch(_){}
    syncInactiveHint();
    syncCalibTabLock();
    syncGazeMap();
    syncProStatus();
    syncProLiveHint();
    if(name==='pro'){
      // Never auto-start camera — only re-attach enhancer if already live.
      var enh=enhancerApi();
      if(isPreviewLive()&&enh&&enh.attach){
        try{ enh.attach($('cameraPreviewVideo'),$('cameraPreviewShell')); }catch(_){}
      }
      if(enh&&enh.syncFromCameraPrefs){
        try{ enh.syncFromCameraPrefs(); }catch(_){}
      }
      syncEnhancementUi();
    }
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

  function enhancerApi(){
    return global.OneToneCameraVideoEnhancer||null;
  }

  /** Park the shared preview aside into Action or Pro host (single video element). */
  function parkPreviewForTab(tab){
    var preview=$('cameraHeroPreview');
    if(!preview) return;
    var actionHost=$('cameraExecutionWorkbench');
    var proHost=$('cameraProPreviewHost');
    if(tab==='pro'&&proHost){
      if(preview.parentNode!==proHost) proHost.appendChild(preview);
      return;
    }
    // Default home: Action workbench (first column).
    if(actionHost&&preview.parentNode!==actionHost){
      var side=$('cameraExecutionSide');
      if(side&&side.parentNode===actionHost) actionHost.insertBefore(preview,side);
      else actionHost.insertBefore(preview,actionHost.firstChild);
    }
  }

  function isPreviewLive(){
    var pv=previewApi();
    return !!(pv&&pv.isRunning&&pv.isRunning());
  }

  function syncProLiveHint(){
    var hint=$('cameraProLiveHint');
    if(!hint) return;
    var onPro=currentTab==='pro';
    var live=isPreviewLive();
    hint.hidden=!onPro||live;
  }

  var moodTimer=0;
  var MOOD_MS=1500;

  var LOOK_MOOD={
    off:['cameraProMoodOff','已回到原始画面'],
    natural:['cameraProMoodNatural','自然状态已就位'],
    cream:['cameraProMoodCream','画面柔和了一点'],
    glow:['cameraProMoodGlow','肤色更通透'],
    fresh:['cameraProMoodFresh','气色提起来了']
  };

  var MASK_MOOD={
    off:['cameraProMoodMaskOff','已显示真脸'],
    solid:['cameraProMoodMaskSolid','素面遮盖已开启'],
    emoji:['cameraProMoodMaskEmoji','表情面具已开启'],
    animal:['cameraProMoodMaskAnimal','萌宠面具已开启']
  };

  function flashEl(el){
    if(!el) return;
    el.classList.remove('is-flash');
    void el.offsetWidth;
    el.classList.add('is-flash');
  }

  function showMoodStatus(msg){
    var el=$('cameraProMoodStatus');
    if(!el) return;
    el.textContent=msg||'';
    el.hidden=!msg;
    if(moodTimer) clearTimeout(moodTimer);
    moodTimer=setTimeout(function(){
      moodTimer=0;
      if(el){ el.textContent=''; el.hidden=true; }
    },MOOD_MS);
  }

  function persistEnhancement(partial,opts){
    opts=opts||{};
    var api=enhancerApi();
    var next;
    if(partial&&partial.look!=null&&api&&api.applyLook){
      next=api.applyLook(partial.look);
      // allow same-call level overrides after look defaults
      var extra={};
      ['whiten','smooth','rosy','slim','antiFlicker','displayFrameRate','brightness','contrast','saturation','faceMask'].forEach(function(k){
        if(partial[k]!=null) extra[k]=partial[k];
      });
      if(Object.keys(extra).length) next=api.setPrefs(extra);
    }else{
      next=api&&api.setPrefs?api.setPrefs(partial||{}):(partial||{});
    }
    var pv=previewApi();
    if(pv&&typeof pv.persistCameraPrefs==='function'){
      try{ pv.persistCameraPrefs({videoEnhancement:next}); }catch(_){}
    }else{
      try{
        var st=global.OneToneState&&global.OneToneState.state;
        if(st&&st.config&&st.config.cameraPrefs){
          st.config.cameraPrefs.videoEnhancement=next;
        }
        if(global.OneToneConfigPersist&&global.OneToneConfigPersist.saveCameraPrefsQuiet){
          global.OneToneConfigPersist.saveCameraPrefsQuiet();
        }
      }catch(_){}
    }
    // Do NOT auto-start camera when picking a Look — only refresh if already live.
    if(currentTab==='pro'&&isPreviewLive()){
      if(api&&api.renderOnce){ try{ api.renderOnce(); }catch(_){} }
    }
    syncEnhancementUi();
    syncProDeviceDiag();
    syncProLiveHint();
    if(opts.moodLook){
      var m=LOOK_MOOD[opts.moodLook]||LOOK_MOOD.off;
      showMoodStatus(t(m[0],m[1]));
    }else if(opts.moodText){
      showMoodStatus(opts.moodText);
    }
    return next;
  }

  function applyLook(look){
    look=String(look||'off');
    var grid=$('cameraProLookGrid');
    var card=grid?grid.querySelector('[data-enh-look="'+look+'"]'):null;
    flashEl(card);
    return persistEnhancement({look:look},{moodLook:look});
  }

  function applyFaceMask(style){
    style=String(style||'off');
    var grid=$('cameraProMaskGrid');
    var card=grid?grid.querySelector('[data-enh-mask="'+style+'"]'):null;
    flashEl(card);
    var m=MASK_MOOD[style]||MASK_MOOD.off;
    return persistEnhancement({faceMask:style},{moodText:t(m[0],m[1])});
  }

  function syncEnhancementUi(){
    var api=enhancerApi();
    var p=api&&api.getPrefs?api.getPrefs():null;
    if(!p){
      try{
        var st=global.OneToneState&&global.OneToneState.state;
        p=st&&st.config&&st.config.cameraPrefs&&st.config.cameraPrefs.videoEnhancement;
      }catch(_){ p=null; }
    }
    if(!p) return;
    var look=p.look||'off';
    var grid=$('cameraProLookGrid');
    if(grid){
      grid.querySelectorAll('[data-enh-look]').forEach(function(btn){
        btn.classList.toggle('is-active',btn.getAttribute('data-enh-look')===look);
      });
    }
    var mask=p.faceMask||'off';
    var maskGrid=$('cameraProMaskGrid');
    if(maskGrid){
      maskGrid.querySelectorAll('[data-enh-mask]').forEach(function(btn){
        btn.classList.toggle('is-active',btn.getAttribute('data-enh-mask')===mask);
      });
    }
    var rows=$('cameraProLevelRows');
    if(rows){
      ['whiten','smooth','rosy','slim'].forEach(function(key){
        var row=rows.querySelector('[data-enh-level="'+key+'"]');
        if(!row) return;
        var lv=p[key]|0;
        row.querySelectorAll('[data-level]').forEach(function(btn){
          btn.classList.toggle('is-active',(parseInt(btn.getAttribute('data-level'),10)||0)===lv);
        });
      });
    }
    function setSlider(id,valId,v){
      var el=$(id);
      var lab=$(valId);
      if(el) el.value=String(v);
      if(lab) lab.textContent=String(v);
    }
    setSlider('cameraProSliderBrightness','cameraProValBrightness',p.brightness);
    setSlider('cameraProSliderContrast','cameraProValContrast',p.contrast);
    setSlider('cameraProSliderSaturation','cameraProValSaturation',p.saturation);
    var af=$('cameraProAntiFlickerPills');
    if(af){
      af.querySelectorAll('[data-anti-flicker]').forEach(function(btn){
        btn.classList.toggle('is-active',btn.getAttribute('data-anti-flicker')===p.antiFlicker);
      });
    }
    var df=$('cameraProDisplayFpsPills');
    if(df){
      df.querySelectorAll('[data-display-fps]').forEach(function(btn){
        var v=parseInt(btn.getAttribute('data-display-fps'),10)||0;
        btn.classList.toggle('is-active',v===(p.displayFrameRate|0));
      });
    }
    var modeEl=$('cameraProEnhModeText');
    var stApi=api&&api.getRuntimeStatus?api.getRuntimeStatus():null;
    if(modeEl){
      var mode=stApi&&stApi.mode?stApi.mode:'off';
      var label=mode==='webgl'?t('cameraProEnhModeWebgl','WebGL')
        :(mode==='css'?t('cameraProEnhModeCss','柔和显示')
        :(mode==='canvas2d'?t('cameraProEnhModeCanvas','基础显示')
        :t('cameraProEnhModeOff','原片')));
      modeEl.textContent=label;
    }
    var slimRow=$('cameraProSlimStatusRow');
    if(slimRow){
      var sm=stApi&&stApi.slimMode?stApi.slimMode:'off';
      slimRow.hidden=!(p.slim>0&&sm==='simple');
    }
    var antiEl=$('cameraProEnhAntiText');
    if(antiEl) antiEl.textContent=String(p.antiFlicker||'auto');
  }

  // Compat alias
  function syncProEnhUi(){ syncEnhancementUi(); }

  function syncProStatus(){
    var helloEl=$('cameraProStatusHello');
    if(helloEl){
      helloEl.textContent=t('cameraProHelloStatusFuture','未来支持 · 需要兼容 IR / 安全摄像头');
    }
    if(currentTab==='pro'){
      var api=enhancerApi();
      if(api&&api.syncFromCameraPrefs){
        try{ api.syncFromCameraPrefs(); }catch(_){}
      }
      syncEnhancementUi();
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
      var actual='—';
      try{
        var video=$('cameraPreviewVideo');
        var track=video&&video.srcObject&&video.srcObject.getVideoTracks&&video.srcObject.getVideoTracks()[0];
        if(track&&track.getSettings){
          var settings=track.getSettings();
          if(settings&&settings.frameRate>0) actual=String(Math.round(settings.frameRate));
        }
      }catch(_){}
      fpsEl.textContent=live?actual:'—';
    }
    if(lightEl){
      lightEl.textContent=t('cameraProDeviceLightIdle','未检测');
    }
    if(sourceEl){
      sourceEl.textContent=t('cameraProDeviceSourceRaw','识别画面使用原始视频');
    }
    var antiEl=$('cameraProEnhAntiText');
    var enh=enhancerApi();
    var ep=enh&&enh.getPrefs?enh.getPrefs():null;
    if(antiEl&&ep) antiEl.textContent=String(ep.antiFlicker||'auto');
  }

  function bindEnhancementUi(){
    var grid=$('cameraProLookGrid');
    if(grid){
      grid.addEventListener('click',function(e){
        var btn=e.target&&e.target.closest?e.target.closest('[data-enh-look]'):null;
        if(!btn) return;
        e.preventDefault();
        applyLook(btn.getAttribute('data-enh-look')||'off');
      });
    }
    var maskGrid=$('cameraProMaskGrid');
    if(maskGrid){
      maskGrid.addEventListener('click',function(e){
        var btn=e.target&&e.target.closest?e.target.closest('[data-enh-mask]'):null;
        if(!btn) return;
        e.preventDefault();
        applyFaceMask(btn.getAttribute('data-enh-mask')||'off');
      });
    }
    var rows=$('cameraProLevelRows');
    if(rows){
      rows.addEventListener('click',function(e){
        var btn=e.target&&e.target.closest?e.target.closest('[data-level]'):null;
        if(!btn) return;
        var row=btn.closest('[data-enh-level]');
        if(!row) return;
        e.preventDefault();
        var key=row.getAttribute('data-enh-level');
        var lv=parseInt(btn.getAttribute('data-level'),10)||0;
        var patch={};
        patch[key]=lv;
        flashEl(row);
        persistEnhancement(patch,{
          moodText:t('cameraProMoodLevel','已更新 · ')+ (row.querySelector('.camera-pro-level-label')||{}).textContent
        });
      });
    }
    var compare=$('cameraProCompareBtn');
    if(compare){
      var setBypass=function(on){
        var api=enhancerApi();
        if(api&&api.setCompareBypass) api.setCompareBypass(!!on);
        compare.classList.toggle('is-pressed',!!on);
      };
      compare.addEventListener('pointerdown',function(e){ e.preventDefault(); setBypass(true); });
      compare.addEventListener('pointerup',function(){ setBypass(false); });
      compare.addEventListener('pointerleave',function(){ setBypass(false); });
      compare.addEventListener('pointercancel',function(){ setBypass(false); });
    }
    var af=$('cameraProAntiFlickerPills');
    if(af){
      af.addEventListener('click',function(e){
        var btn=e.target&&e.target.closest?e.target.closest('[data-anti-flicker]'):null;
        if(!btn) return;
        e.preventDefault();
        persistEnhancement({antiFlicker:btn.getAttribute('data-anti-flicker')||'auto'});
      });
    }
    var df=$('cameraProDisplayFpsPills');
    if(df){
      df.addEventListener('click',function(e){
        var btn=e.target&&e.target.closest?e.target.closest('[data-display-fps]'):null;
        if(!btn) return;
        e.preventDefault();
        var v=parseInt(btn.getAttribute('data-display-fps'),10);
        if(isNaN(v)) v=0;
        persistEnhancement({displayFrameRate:v});
      });
    }
    function bindSlider(id,key){
      var el=$(id);
      if(!el) return;
      var onInput=function(){
        var v=Number(el.value)||0;
        var lab=$(id.replace('Slider','Val'));
        if(lab) lab.textContent=String(v);
        var patch={};
        patch[key]=v;
        persistEnhancement(patch);
      };
      el.addEventListener('input',onInput);
      el.addEventListener('change',onInput);
    }
    bindSlider('cameraProSliderBrightness','brightness');
    bindSlider('cameraProSliderContrast','contrast');
    bindSlider('cameraProSliderSaturation','saturation');
  }

  function bindProEnhUi(){ bindEnhancementUi(); }

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
      if(st.lastGesture==='openPalm'&&st.pulseActive) return t('cameraPresenceGestureOpenPalm','五指');
      if((st.lastGesture==='ok'||st.lastGesture==='okHand')&&st.pulseActive) return t('cameraPresenceGestureOk','OK');
      if(st.lastGesture==='fist'&&st.pulseActive) return t('cameraPresenceGestureFist','握拳');
      if(st.lastGesture==='wave'&&st.pulseActive) return t('cameraPresenceGestureWave','挥手');
      if(st.shakeListeningLabel) return st.shakeListeningLabel;
      if(st.lastGesture==='shake') return t('cameraPresenceGestureShake','摇头');
      if(st.lastGesture==='blink') return t('cameraPresenceGestureBlink','闭眼两次确认');
      if(st.lastGesture==='openPalm') return t('cameraPresenceGestureOpenPalm','五指');
      if(st.lastGesture==='ok'||st.lastGesture==='okHand') return t('cameraPresenceGestureOk','OK');
      if(st.lastGesture==='fist') return t('cameraPresenceGestureFist','握拳');
      if(st.lastGesture==='wave') return t('cameraPresenceGestureWave','挥手');
    }
    var el=$('cameraPresenceGestureText');
    if(el&&el.textContent) return el.textContent.trim();
    return t('cameraPresenceGestureNone','无');
  }

  function syncProHandCard(){
    var statusEl=$('cameraProHandStatus');
    var kicker=$('cameraProHandKicker');
    var api=global.OneToneCameraHandGesture;
    var rs=api&&api.getRuntimeStatus?api.getRuntimeStatus():null;
    var pv=previewApi();
    var live=!!(pv&&pv.isRunning&&pv.isRunning());
    if(rs&&rs.modelFailed){
      if(kicker) kicker.textContent=t('cameraProCapGestureNeedModel','模型未就绪');
    }else if(kicker){
      kicker.textContent=t('cameraProCapGestureKicker','已接入');
    }
    if(!statusEl) return;
    if(rs&&rs.modelFailed){
      statusEl.textContent=t('cameraProHandStatusFailed','模型未就绪 · 请运行 prepare-mediapipe');
      return;
    }
    if(!live){
      statusEl.textContent=t('cameraProHandStatusIdle','尚未开启预览');
      return;
    }
    if(rs&&!rs.ready&&rs.running){
      statusEl.textContent=t('cameraProHandStatusLoading','手势模型加载中…');
      return;
    }
    if(rs&&rs.running&&rs.ready){
      var g=rs.gesture||{};
      var kind=g.kind||'none';
      var label=t('cameraProHandStatusNone','未检测到手势');
      if(kind==='openPalm') label=t('cameraPresenceGestureOpenPalm','五指');
      else if(kind==='ok') label=t('cameraPresenceGestureOk','OK');
      else if(kind==='fist') label=t('cameraPresenceGestureFist','握拳');
      else if(kind==='wave') label=t('cameraPresenceGestureWave','挥手');
      statusEl.textContent=t('cameraProHandStatusRunning','识别运行中 · {gesture}').replace('{gesture}',label);
      return;
    }
    statusEl.textContent=t('cameraProHandStatusIdle','尚未开启预览');
  }

  function openHandRulesBind(){
    activateTab('trigger');
    var pa=presenceApi();
    if(pa&&pa.showRulesSegment){
      try{ pa.showRulesSegment('pro',{scroll:true}); }catch(_){}
    }
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
    syncProLiveHint();
    syncProHandCard();
    var pa=presenceApi();
    if(pa&&pa.syncProHandRulesHint){
      try{ pa.syncProHandRulesHint(); }catch(_){}
    }
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
    bindProEnhUi();
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
    var handGoto=$('cameraProHandGotoBind');
    if(handGoto){
      handGoto.addEventListener('click',function(e){
        e.preventDefault();
        openHandRulesBind();
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
