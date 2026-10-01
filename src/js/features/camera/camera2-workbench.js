/* Camera 2 · triad-B IA (c2-* only; Camera1 DOM untouched) */
(function(global){
  'use strict';

  var DATA_READY='camera2-triad-b-v8';
  var ROOT_ID='camera2WorkbenchRoot';
  var PREVIEW_ID='camera2WorkbenchPreview';
  var LOOK_PREVIEW_ID='camera2LookPreview';

  /* CATALOG still the runtime truth; TASKS/TRIGS kept for mapping / tests */
  var TASKS=[
    {id:'leave',label:'离开座位',rule:'离席 / 回席 / 隐私卫士 / 久坐'},
    {id:'meet',label:'开会',rule:'距离自动静音'},
    {id:'act',label:'手势',rule:'摇头 / 眨眼 / 五指 / OK / 握拳 / 挥手'},
    {id:'eye',label:'视线',rule:'鼠标追踪 · Snap 移窗 · 需先校准'}
  ];
  var TRIGS=[
    {id:'face',label:'脸',rule:'人脸在席 / 表情动作'},
    {id:'hand',label:'手',rule:'手势入画 · SoftPad 门控'},
    {id:'gaze',label:'视线',rule:'需校准'},
    {id:'always',label:'持续',rule:'开着就跑 · 不是单次触发'}
  ];
  var TASK_LABEL={leave:'离开座位',meet:'开会',act:'手势',eye:'视线'};
  var TRIG_LABEL={face:'脸',hand:'手',gaze:'视线',always:'持续'};

  /* L1 goals — home atoms auto-managed; detail atoms only in「全部细节」 */
  var GOALS=[
    {
      id:'privacy',title:'离开座位时保护隐私',
      one:'人不在时挡住画面；回来再恢复。',
      recommend:true,needCalib:false,
      home:['away','back'],detail:['guard'],
      causes:[
        {when:'你离开座位一会儿',itemId:'away'},
        {when:'你回到座位',itemId:'back'}
      ]
    },
    {
      id:'meeting',title:'开会时别吵到别人',
      one:'人退远或画面没人时，自动静音麦克风。',
      recommend:true,needCalib:false,
      home:['automute'],detail:[],
      causes:[{when:'你退远或画面无人',itemId:'automute'}]
    },
    {
      id:'gesture',title:'用手势代替按键',
      one:'摇头取消，故意眨眼开始输入。',
      recommend:false,needCalib:false,
      home:['shake','blink'],detail:['palm','ok','fist','wave'],
      causes:[
        {when:'你摇头',itemId:'shake'},
        {when:'你故意眨眼',itemId:'blink'}
      ]
    },
    {
      id:'gaze',title:'用眼睛帮忙操作',
      one:'看哪块屏幕，鼠标或窗口跟着过去。',
      recommend:false,needCalib:true,
      home:['track','snap'],detail:[],
      causes:[
        {when:'你看向某块屏',itemId:'track'},
        {when:'拖窗口时看向目标屏',itemId:'snap'}
      ]
    },
    {
      id:'wellness',title:'坐久了提醒休息',
      one:'在座过久时，提醒你看远处歇一会儿。',
      recommend:false,needCalib:false,
      home:['wellness'],detail:[],
      causes:[{when:'连续在座超过一段时间',itemId:'wellness'}]
    }
  ];

  /* Presence bindKey + triggerKey map to cameraPrefs.presenceActions */
  var CATALOG=[
    {id:'away',kind:'presence',task:'leave',trig:'face',name:'离席',desc:'人脸消失达时长 → 结果',why:'离开座位时的匹配命令。',bindKey:'onAway',trigKey:'away',defaultBind:'privacyScreen',recommend:true},
    {id:'back',kind:'presence',task:'leave',trig:'face',name:'回席',desc:'人脸回来 → 结果',why:'与离席成对。',bindKey:'onReturn',trigKey:'away',defaultBind:'resumeVoice',recommend:true},
    {id:'guard',kind:'feature',task:'leave',trig:'always',name:'隐私卫士',desc:'多人入画提醒 · RGB 视觉',why:'隐私提醒 / 自动遮罩。',feature:'guard'},
    {id:'wellness',kind:'feature',task:'leave',trig:'always',name:'久坐提醒',desc:'20-20-20 · 在席过久提示',why:'本地提醒，无医疗宣称。',feature:'wellness'},
    {id:'automute',kind:'feature',task:'meet',trig:'always',name:'开会静音',desc:'后退超距静音 · 靠近开麦',why:'人脸大小估距。',feature:'automute',recommend:true},
    {id:'shake',kind:'presence',task:'act',trig:'face',name:'摇头',desc:'左右三拍 → 结果',why:'瞬时动作，归入手势。',bindKey:'shakeHead',trigKey:'shake',defaultBind:'pressEsc',recommend:true,hubGate:false},
    {id:'blink',kind:'presence',task:'act',trig:'face',name:'故意眨眼',desc:'闭眼达阈值 → 结果',why:'需基线；可选响声后确认。',bindKey:'deliberateBlink',trigKey:'blink',defaultBind:'pressCtrlI',recommend:true},
    {id:'palm',kind:'presence',task:'act',trig:'hand',name:'五指张开',desc:'手势 → 结果',why:'可匹配其他通道。受 SoftPad 门控。',bindKey:'openPalm',trigKey:'openPalm',defaultBind:'pressCtrlI',hubGate:true},
    {id:'ok',kind:'presence',task:'act',trig:'hand',name:'OK 手势',desc:'拇食成圈 → 结果',why:'SoftPad 门控。',bindKey:'okHand',trigKey:'okHand',defaultBind:'pressCtrlI',hubGate:true},
    {id:'fist',kind:'presence',task:'act',trig:'hand',name:'握拳',desc:'收拢五指 → 结果',why:'SoftPad 门控。',bindKey:'fist',trigKey:'fist',defaultBind:'pressEsc',hubGate:true},
    {id:'wave',kind:'presence',task:'act',trig:'hand',name:'挥手',desc:'横向扫动',why:'挥手优先于五指短时互抢。',bindKey:'wave',trigKey:'wave',defaultBind:'pressEsc',hubGate:true,recommend:true},
    {id:'track',kind:'feature',task:'eye',trig:'gaze',name:'鼠标追踪',desc:'粗判看向哪块屏 · 可选移鼠',why:'需先校准。',feature:'track'},
    {id:'snap',kind:'feature',task:'eye',trig:'gaze',name:'Snap 移窗',desc:'拖标题栏 + 看向目标屏',why:'与窗口布局快照不同。',feature:'snap'}
  ];

  var LOOK_PRESETS=[
    {id:'off',label:'原图',desc:'真实无修饰'},
    {id:'natural',label:'自然',desc:'像睡饱了一点',recommend:true},
    {id:'cream',label:'奶油肌',desc:'柔和、干净'},
    {id:'glow',label:'水光感',desc:'更通透'},
    {id:'fresh',label:'元气',desc:'气色更好'}
  ];
  var MASK_PRESETS=[
    {id:'off',label:'关闭',desc:'显示真脸'},
    {id:'solid',label:'柔雾',desc:'粉紫遮盖'},
    {id:'emoji',label:'元气',desc:'软萌笑脸'},
    {id:'animal',label:'粉喵',desc:'圆耳猫脸'}
  ];
  var LEVEL_ROWS=[
    {id:'whiten',label:'美白'},
    {id:'smooth',label:'柔肤'},
    {id:'rosy',label:'气色'},
    {id:'slim',label:'轻瘦脸'}
  ];
  var LEVEL_OPTS=[
    {v:0,label:'关'},
    {v:1,label:'轻'},
    {v:2,label:'中'},
    {v:3,label:'重'}
  ];
  var ANTI_OPTS=[
    {id:'auto',label:'Auto'},
    {id:'50hz',label:'50Hz'},
    {id:'60hz',label:'60Hz'}
  ];
  var FPS_OPTS=[0,25,30,50,60];
  var SNAP_FPS=[
    {id:'left',cls:'c2-fp-left',label:'左半'},
    {id:'right',cls:'c2-fp-right',label:'右半'},
    {id:'top',cls:'c2-fp-top',label:'上半'},
    {id:'bottom',cls:'c2-fp-bot',label:'下半'},
    {id:'maximize',cls:'c2-fp-max',label:'最大化'},
    {id:'top-left',cls:'c2-fp-tl',label:'左上'},
    {id:'top-right',cls:'c2-fp-tr',label:'右上'},
    {id:'bottom-left',cls:'c2-fp-bl',label:'左下'},
    {id:'bottom-right',cls:'c2-fp-br',label:'右下'},
    {id:'third-1',cls:'c2-fp-t1',label:'左三分'},
    {id:'third-2',cls:'c2-fp-t2',label:'中三分'},
    {id:'third-3',cls:'c2-fp-t3',label:'右三分'}
  ];
  var LAYOUT_SCENES=[
    {id:'meeting',name:'会议专注',desc:'主屏会议大窗，侧栏文档。',slots:[
      {t:'会议',s:'left:4%;top:6%;width:58%;height:78%;background:#2a9cc4'},
      {t:'文档',s:'left:66%;top:6%;width:30%;height:78%;background:#3d7ea6'}
    ]},
    {id:'code',name:'写码对照',desc:'编辑器为主，终端贴底。',slots:[
      {t:'编辑器',s:'left:4%;top:6%;width:62%;height:58%;background:#2f6f8f'},
      {t:'预览',s:'left:70%;top:6%;width:26%;height:58%;background:#3d7ea6'},
      {t:'终端',s:'left:4%;top:70%;width:92%;height:22%;background:#1e4a62'}
    ]},
    {id:'focus',name:'单窗沉浸',desc:'当前前台窗铺满主区。',slots:[
      {t:'前台',s:'left:8%;top:8%;width:84%;height:80%;background:#2a9cc4'}
    ]}
  ];

  var state={
    dim:'task',
    cat:'leave',
    view:'list',
    openGoal:'privacy',
    returnView:'list',
    selectedId:null,
    hubOn:true,
    masterOn:false,
    lookId:'off',
    maskId:'off',
    lookTab:'look',
    levels:{whiten:0,smooth:0,rosy:0,slim:0},
    antiFlicker:'auto',
    displayFps:0,
    brightness:0,
    contrast:8,
    saturation:6,
    layoutId:'meeting',
    snapPick:'',
    previewLive:false,
    warn:''
  };
  var mounted=false;
  var mountEl=null;
  var els={};
  var unsubs=[];

  function $(id){ return document.getElementById(id); }
  function esc(s){
    return String(s==null?'':s)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
  function toast(msg,kind){
    try{
      if(global.OneToneAppToast&&global.OneToneAppToast.show){
        global.OneToneAppToast.show(msg,kind||'lite');
        return;
      }
      if(typeof global.showToast==='function') global.showToast(msg,kind||'info');
    }catch(_){}
  }
  function PA(){ return global.OneToneCameraPresenceActions||null; }
  function previewApi(){ return global.OneToneCameraPreview||null; }
  function muteApi(){ return global.OneToneCameraAutoMute||null; }
  function trackApi(){ return global.OneToneCameraSmartPointer||null; }
  function snapApi(){ return global.OneToneCameraSnapWindow||null; }
  function glanceApi(){ return global.OneToneCameraProGlance||null; }
  function enhanceApi(){ return global.OneToneCameraVideoEnhancer||null; }
  function gazeApi(){ return global.OneToneCameraGazeCalibration||null; }

  function catalogById(id){
    for(var i=0;i<CATALOG.length;i++) if(CATALOG[i].id===id) return CATALOG[i];
    return null;
  }

  function presencePrefs(){
    var api=PA();
    if(api&&typeof api.prefs==='function'){
      try{ return api.prefs()||{}; }catch(_){}
    }
    try{
      var st=global.OneToneState&&global.OneToneState.state;
      var cp=st&&st.config&&st.config.cameraPrefs;
      return (cp&&cp.presenceActions)||{};
    }catch(_){}
    return {};
  }

  function normAction(v){
    var api=PA();
    if(api&&typeof api.normalizeAction==='function'){
      try{ return api.normalizeAction(v); }catch(_){}
    }
    return String(v||'none');
  }

  function actionLabel(v){
    var api=PA();
    if(api&&typeof api.actionLabel==='function'){
      try{ return api.actionLabel(v); }catch(_){}
    }
    return String(v||'—');
  }

  function bindOptions(bindKey){
    var api=PA();
    var ids=[];
    if(api&&typeof api.allowedActionsForBindKey==='function'){
      try{ ids=api.allowedActionsForBindKey(bindKey)||[]; }catch(_){ ids=[]; }
    }
    if(!ids.length){
      ids=['none','privacyScreen','pauseVoice','resumeVoice','pressEsc','pressCtrlI','lowPowerMode','toggleOralListen'];
    }
    return ids.map(function(id){ return {id:id,label:actionLabel(id)}; });
  }

  function presenceOn(item){
    if(!item||item.kind!=='presence') return false;
    var p=presencePrefs();
    if(normAction(p[item.bindKey])!=='none') return true;
    var tr=p.triggers||{};
    return !!tr[item.trigKey];
  }

  function presenceBind(item){
    var p=presencePrefs();
    var v=normAction(p[item.bindKey]);
    return v==='none'?resolveBind(item,null):v;
  }

  /** Prefer explicit bind; never leave newly-added presence stuck on none. */
  function resolveBind(item,preferred){
    var cand=preferred!=null?String(preferred):'';
    if(cand&&cand!=='none') return cand;
    if(item&&item.defaultBind&&item.defaultBind!=='none') return item.defaultBind;
    var opts=bindOptions(item&&item.bindKey);
    for(var i=0;i<opts.length;i++){
      if(opts[i].id&&opts[i].id!=='none') return opts[i].id;
    }
    return 'privacyScreen';
  }

  function featureOn(item){
    if(!item||item.kind!=='feature') return false;
    try{
      if(item.feature==='automute'){
        var am=muteApi();
        return !!(am&&am.getSettings&&am.getSettings().enabled);
      }
      if(item.feature==='track'){
        var sp=trackApi();
        return !!(sp&&sp.getSettings&&sp.getSettings().enabled);
      }
      if(item.feature==='snap'){
        var sn=snapApi();
        return !!(sn&&sn.getSettings&&sn.getSettings().enabled);
      }
      if(item.feature==='wellness'||item.feature==='guard'){
        var gl=glanceApi();
        var f=gl&&gl.getProFeatures?gl.getProFeatures():null;
        if(!f) return false;
        if(item.feature==='wellness') return !!(f.wellness2020||f.wellnessBlink||f.wellnessPosture);
        return !!(f.privacyAlert||f.privacyGuard);
      }
    }catch(_){}
    return false;
  }

  function itemOn(item){
    if(!item) return false;
    return item.kind==='presence'?presenceOn(item):featureOn(item);
  }

  function itemCat(item){
    return state.dim==='trig'?item.trig:item.task;
  }

  function catDefs(){ return state.dim==='trig'?TRIGS:TASKS; }

  function countOn(catId){
    var n=0;
    for(var i=0;i<CATALOG.length;i++){
      if(itemCat(CATALOG[i])===catId&&itemOn(CATALOG[i])) n++;
    }
    return n;
  }

  function itemsInCat(catId,wantOn){
    var out=[];
    for(var i=0;i<CATALOG.length;i++){
      var it=CATALOG[i];
      if(itemCat(it)!==catId) continue;
      if(itemOn(it)===wantOn) out.push(it);
    }
    return out;
  }

  function syncFromPrefs(){
    var p=presencePrefs();
    state.masterOn=!!p.enabled;
    state.hubOn=p.requireActivationHub!==false;
    syncEnhFromPrefs();
    var pv=previewApi();
    state.previewLive=!!(pv&&pv.isRunning&&pv.isRunning());
  }

  function enhPrefs(){
    var en=enhanceApi();
    if(en&&typeof en.getPrefs==='function'){
      try{ return en.getPrefs()||{}; }catch(_){}
    }
    try{
      var st=global.OneToneState&&global.OneToneState.state;
      return (st&&st.config&&st.config.cameraPrefs&&st.config.cameraPrefs.videoEnhancement)||{};
    }catch(_){}
    return {};
  }

  function syncEnhFromPrefs(){
    var ep=enhPrefs();
    state.lookId=ep.look||'off';
    state.maskId=ep.faceMask||'off';
    state.levels={
      whiten:ep.whiten|0,
      smooth:ep.smooth|0,
      rosy:ep.rosy|0,
      slim:ep.slim|0
    };
    state.antiFlicker=ep.antiFlicker||'auto';
    state.displayFps=ep.displayFrameRate|0;
    state.brightness=ep.brightness!=null?Number(ep.brightness):0;
    state.contrast=ep.contrast!=null?Number(ep.contrast):8;
    state.saturation=ep.saturation!=null?Number(ep.saturation):6;
  }

  function persistEnh(partial,opts){
    opts=opts||{};
    var en=enhanceApi();
    var next=null;
    try{
      if(partial&&partial.look!=null&&en&&en.applyLook){
        next=en.applyLook(partial.look);
        var extra={};
        ['whiten','smooth','rosy','slim','antiFlicker','displayFrameRate','brightness','contrast','saturation','faceMask'].forEach(function(k){
          if(partial[k]!=null) extra[k]=partial[k];
        });
        if(Object.keys(extra).length&&en.setPrefs) next=en.setPrefs(extra);
      }else if(en&&en.setPrefs){
        next=en.setPrefs(partial||{});
      }else if(partial&&partial.faceMask!=null&&en&&en.applyFaceMask){
        next=en.applyFaceMask(partial.faceMask);
      }
    }catch(_){}
    var pv=previewApi();
    if(pv&&typeof pv.persistCameraPrefs==='function'&&next){
      try{ pv.persistCameraPrefs({videoEnhancement:next}); }catch(_){}
    }
    syncEnhFromPrefs();
    if(!opts.quiet) renderLookPanel();
    updateHints();
    return next;
  }

  function persistPresence(partial){
    var api=PA();
    if(api&&typeof api.persist==='function'){
      try{ api.persist(partial); return; }catch(_){}
    }
  }

  function setMaster(on){
    persistPresence({enabled:!!on});
    syncFromPrefs();
    paint();
  }

  function setHub(on){
    persistPresence({requireActivationHub:!!on});
    syncFromPrefs();
  }

  function setPresenceItem(item,on,bind){
    if(!item||item.kind!=='presence') return false;
    if(item.hubGate&&on&&!state.hubOn){
      setWarn('请先打开「手势需 SoftPad 激活窗」');
      toast('手势需 SoftPad 激活窗','warn');
      return false;
    }
    var action=on?resolveBind(item,bind):'none';
    var patch={};
    patch[item.bindKey]=action;
    var trigs={};
    if(on){
      trigs[item.trigKey]=true;
    }else if(item.trigKey==='away'){
      var p=presencePrefs();
      var other=item.bindKey==='onAway'?'onReturn':'onAway';
      var otherAct=normAction(p[other]);
      if(otherAct==='none') trigs.away=false;
    }else{
      trigs[item.trigKey]=false;
    }
    patch.triggers=trigs;
    if(on&&!state.masterOn) patch.enabled=true;
    persistPresence(patch);
    setWarn('');
    return true;
  }

  function setFeatureItem(item,on){
    if(!item||item.kind!=='feature') return false;
    var v=!!on;
    try{
      if(item.feature==='automute'){
        var am=muteApi();
        if(am&&am.writeSettings&&am.getSettings){
          am.writeSettings(Object.assign({},am.getSettings(),{enabled:v}));
          return true;
        }
      }else if(item.feature==='track'){
        var sp=trackApi();
        if(sp&&sp.writeSettings&&sp.getSettings){
          sp.writeSettings(Object.assign({},sp.getSettings(),{enabled:v}));
          return true;
        }
      }else if(item.feature==='snap'){
        var sn=snapApi();
        if(sn&&sn.writeSettings&&sn.getSettings){
          sn.writeSettings(Object.assign({},sn.getSettings(),{enabled:v}));
          return true;
        }
      }else if(item.feature==='wellness'){
        var gl=glanceApi();
        if(gl&&gl.persistProFeatures){
          gl.persistProFeatures({wellness2020:v,wellnessBlink:v,wellnessPosture:v});
          return true;
        }
      }else if(item.feature==='guard'){
        var g2=glanceApi();
        if(g2&&g2.persistProFeatures){
          g2.persistProFeatures({privacyAlert:v,privacyGuard:v});
          return true;
        }
      }
    }catch(_){}
    toast('该功能接口未就绪','warn');
    return false;
  }

  function addCatalogItem(id){
    var ait=catalogById(id);
    if(!ait) return false;
    var ok=false;
    if(ait.kind==='presence') ok=!!setPresenceItem(ait,true,ait.defaultBind);
    else ok=!!setFeatureItem(ait,true);
    if(!ok) return false;
    syncFromPrefs();
    state.selectedId=ait.id;
    state.view='sheet';
    toast('已添加 · 可改结果绑定','ok');
    paint();
    return true;
  }

  function applyRecommend(){
    /* J law: 新手只开离开保护 + 开会静音；其它目标整包关掉 */
    persistPresence({enabled:true});
    setGoalOn('privacy',true);
    setGoalOn('meeting',true);
    setGoalOn('gesture',false);
    setGoalOn('gaze',false);
    setGoalOn('wellness',false);
    afterRecommend();
  }

  function afterRecommend(failed){
    syncFromPrefs();
    state.view='list';
    state.openGoal='privacy';
    toast(failed?'推荐未完全套用':'已套用新手推荐 · 离开保护 + 开会静音',failed?'warn':'ok');
    paint();
  }

  function setWarn(msg){
    state.warn=msg||'';
    if(!els.warn) return;
    els.warn.textContent=state.warn;
    els.warn.classList.toggle('is-show',!!state.warn);
  }

  function ensureMarkup(mount){
    if(!mount) return null;
    if(mount.getAttribute('data-ready')===DATA_READY&&$(ROOT_ID)) return $(ROOT_ID);
    mount.setAttribute('data-ready',DATA_READY);
    mount.innerHTML=[
      '<div class="c2-root" id="'+ROOT_ID+'">',
      '  <div class="c2-trust">',
      '    <h1>摄像头 <span class="sub">· 我想要</span></h1>',
      '    <span class="c2-fg"><span class="dot"></span><span id="c2FgText">识别待命</span></span>',
      '    <span class="c2-chip-warn" id="c2CalibChip" hidden>注视未校准</span>',
      '    <div class="c2-master">',
      '      <span id="c2MasterLbl">识别总开关</span>',
      '      <button type="button" class="c2-toggle" id="c2Master" aria-pressed="false"></button>',
      '      <button type="button" class="c2-btn" id="c2Recommend">新手推荐</button>',
      '    </div>',
      '  </div>',
      '  <div class="c2-desk">',
      '    <div class="c2-main">',
      '      <div class="c2-head">',
      '        <div class="c2-head-row"><div class="grow">',
      '          <h2 id="c2HeadTitle">我想要…</h2>',
      '          <p id="c2HeadDesc">开目标 = 系统代管背后能力。点开看会发生什么；原子名在「全部细节」。</p>',
      '        </div></div>',
      '        <label class="c2-hub" id="c2HubWrap" hidden>',
      '          <input type="checkbox" id="c2Hub"/> 手势需 SoftPad 激活窗',
      '        </label>',
      '        <div class="c2-sound">',
      '          <span>动作提示音</span>',
      '          <button type="button" class="c2-btn" id="c2SoundPlay">试听</button>',
      '        </div>',
      '      </div>',
      '      <p class="c2-warn" id="c2Warn"></p>',
      '      <div class="c2-body">',
      '        <div class="c2-list" id="c2List"></div>',
      '        <div class="c2-empty" id="c2Empty" hidden><p>这一类还没有启用项</p>',
      '          <button type="button" class="c2-btn is-primary" id="c2EmptyAdd">添加</button></div>',
      '        <div class="c2-sheet" id="c2Sheet" hidden></div>',
      '        <div class="c2-add" id="c2Add" hidden></div>',
      '        <p class="c2-foot" id="c2Foot">目标开关 · 展开看因果</p>',
      '      </div>',
      '    </div>',
      '    <aside class="c2-right">',
      '      <p class="c2-lbl">预览</p>',
      '      <div class="c2-preview">',
      '        <span class="live" id="c2Live" hidden>LIVE</span>',
      '        <video id="'+PREVIEW_ID+'" playsinline muted></video>',
      '        <div class="face" id="c2FaceHint">人脸</div>',
      '      </div>',
      '      <button type="button" class="c2-btn" id="c2PreviewStart" style="width:100%">开启预览</button>',
      '      <p class="c2-lbl">配置</p>',
      '      <button type="button" class="c2-link" data-modal="device"><span class="t"><strong>设备与校准</strong><span id="c2DeviceHint">选择摄像头 · 注视校准</span></span><span class="chev">›</span></button>',
      '      <button type="button" class="c2-link" data-modal="look"><span class="t"><strong>画面观感</strong><span id="c2LookHint">自然</span></span><span class="chev">›</span></button>',
      '      <button type="button" class="c2-link" data-modal="layout"><span class="t"><strong>窗口布局</strong><span id="c2LayoutHint">会议专注</span></span><span class="chev">›</span></button>',
      '    </aside>',
      '  </div>',
      '</div>',
      '<div class="c2-ov" id="c2OvDevice" hidden><div class="c2-modal" role="dialog" aria-modal="true">',
      '  <div class="c2-modal-h"><h3>设备与校准</h3><button type="button" class="c2-btn" data-close="device">关闭</button>',
      '    <p class="sub">选摄像头并完成注视校准。</p></div>',
      '  <div class="c2-modal-b">',
      '    <div class="c2-field"><label>摄像头</label><select id="c2DeviceSelect"></select>',
      '      <button type="button" class="c2-btn" id="c2DeviceRefresh">刷新</button></div>',
      '    <p class="c2-quality" id="c2Quality">与摄像头 1 共用设备列表。</p>',
      '    <div><p class="c2-lbl">注视校准</p><div class="c2-calib-row">',
      '      <button type="button" class="c2-btn is-primary" id="c2CalibFast">快速校准</button>',
      '      <button type="button" class="c2-btn" id="c2CalibFine">精细校准</button>',
      '      <button type="button" class="c2-btn" id="c2CalibClear">清除校准</button>',
      '    </div></div>',
      '  </div>',
      '  <div class="c2-modal-f"><button type="button" class="c2-btn is-primary" data-close="device">完成</button></div>',
      '</div></div>',
      '<div class="c2-ov" id="c2OvLook" hidden><div class="c2-modal c2-modal-look" role="dialog" aria-modal="true">',
      '  <div class="c2-modal-h"><h3>画面观感</h3>',
      '    <button type="button" class="c2-btn" data-close="look">关闭</button>',
      '    <p class="sub">顶部预览即时反馈 · 只改你看到的画面，不影响识别</p></div>',
      '  <div class="c2-look-hero">',
      '    <div class="c2-look-preview">',
      '      <span class="live" id="c2LookLive" hidden>LIVE</span>',
      '      <video id="'+LOOK_PREVIEW_ID+'" playsinline muted></video>',
      '      <div class="face" id="c2LookFace">开启预览后看妆效</div>',
      '    </div>',
      '    <div class="c2-look-hero-actions">',
      '      <button type="button" class="c2-btn is-primary" id="c2LookPreviewStart">开启预览</button>',
      '      <button type="button" class="c2-btn" id="c2CompareBtn">按住看原图</button>',
      '      <p class="c2-mood" id="c2Mood" aria-live="polite"></p>',
      '    </div>',
      '  </div>',
      '  <div class="c2-look-tabs" id="c2LookTabs" role="tablist"></div>',
      '  <div class="c2-modal-b c2-look-body" id="c2LookPanel" role="tabpanel"></div>',
      '  <div class="c2-modal-f"><button type="button" class="c2-btn is-primary" data-close="look">完成</button></div>',
      '</div></div>',
      '<div class="c2-ov" id="c2OvLayout" hidden><div class="c2-modal wide" role="dialog" aria-modal="true">',
      '  <div class="c2-modal-h"><h3>窗口布局</h3><button type="button" class="c2-btn" data-close="layout">关闭</button>',
      '    <p class="sub">工作区快照；贴位为增强示意。</p></div>',
      '  <div class="c2-modal-b">',
      '    <div class="c2-snap-sec"><h4>快拆 · 示意</h4><div class="c2-snap-grid" id="c2SnapGrid"></div></div>',
      '    <div class="c2-snap-sec"><h4>多窗场景</h4><div class="c2-scene-list" id="c2SceneList"></div>',
      '      <div class="c2-row-actions" style="margin-top:10px">',
      '        <button type="button" class="c2-btn" id="c2LayoutSave">保存当前布局</button>',
      '        <button type="button" class="c2-btn" id="c2LayoutApply">应用已存布局</button>',
      '      </div></div>',
      '  </div>',
      '  <div class="c2-modal-f"><button type="button" class="c2-btn is-primary" data-close="layout">完成</button></div>',
      '</div></div>'
    ].join('\n');
    return $(ROOT_ID);
  }

  function cacheEls(){
    els={
      root:$(ROOT_ID),
      fgText:$('c2FgText'),
      calibChip:$('c2CalibChip'),
      master:$('c2Master'),
      masterLbl:$('c2MasterLbl'),
      recommend:$('c2Recommend'),
      headTitle:$('c2HeadTitle'),
      headDesc:$('c2HeadDesc'),
      cats:null,
      rule:null,
      hubWrap:$('c2HubWrap'),
      hub:$('c2Hub'),
      soundPlay:$('c2SoundPlay'),
      warn:$('c2Warn'),
      list:$('c2List'),
      empty:$('c2Empty'),
      emptyAdd:$('c2EmptyAdd'),
      sheet:$('c2Sheet'),
      add:$('c2Add'),
      foot:$('c2Foot'),
      live:$('c2Live'),
      faceHint:$('c2FaceHint'),
      preview:$(PREVIEW_ID),
      previewStart:$('c2PreviewStart'),
      deviceHint:$('c2DeviceHint'),
      lookHint:$('c2LookHint'),
      layoutHint:$('c2LayoutHint'),
      ovDevice:$('c2OvDevice'),
      ovLook:$('c2OvLook'),
      ovLayout:$('c2OvLayout'),
      deviceSelect:$('c2DeviceSelect'),
      quality:$('c2Quality'),
      lookPanel:$('c2LookPanel'),
      lookTabs:$('c2LookTabs'),
      lookPreview:$(LOOK_PREVIEW_ID),
      lookLive:$('c2LookLive'),
      lookFace:$('c2LookFace'),
      lookPreviewStart:$('c2LookPreviewStart'),
      compareBtn:$('c2CompareBtn'),
      mood:$('c2Mood'),
      snapGrid:$('c2SnapGrid'),
      sceneList:$('c2SceneList')
    };
  }

  function updateHints(){
    var look=LOOK_PRESETS.filter(function(p){ return p.id===state.lookId; })[0];
    var mask=MASK_PRESETS.filter(function(p){ return p.id===state.maskId; })[0];
    if(els.lookHint){
      var parts=[(look&&look.label)||state.lookId];
      if(state.maskId&&state.maskId!=='off') parts.push((mask&&mask.label)||state.maskId);
      els.lookHint.textContent=parts.join(' · ');
    }
    var sc=LAYOUT_SCENES.filter(function(s){ return s.id===state.layoutId; })[0];
    if(els.layoutHint) els.layoutHint.textContent=(sc&&sc.name)||'窗口布局';
    var sel=$('cameraDeviceSelect');
    if(els.deviceHint&&sel&&sel.selectedOptions&&sel.selectedOptions[0]){
      els.deviceHint.textContent=sel.selectedOptions[0].textContent||'选择摄像头';
    }
    var needs=false;
    try{
      var g=gazeApi();
      if(g&&typeof g.hasProfile==='function') needs=!g.hasProfile();
      else if(g&&typeof g.getState==='function'){
        var st=g.getState()||{};
        needs=!(st.hasProfile||st.calibrated);
      }
    }catch(_){}
    if(els.calibChip) els.calibChip.hidden=!needs;
  }

  function lookCardHtml(list,attr,cur){
    return list.map(function(p){
      return '<button type="button" class="c2-look-card'+(cur===p.id?' is-on':'')+(p.recommend?' is-rec':'')+'" '+attr+'="'+esc(p.id)+'">'+
        (p.recommend?'<span class="c2-look-badge">推荐</span>':'')+
        '<strong class="c2-look-name">'+esc(p.label)+'</strong>'+
        '<span class="c2-look-desc">'+esc(p.desc||'')+'</span></button>';
    }).join('');
  }

  function cloneSelectOptions(srcId){
    var src=$(srcId);
    if(!src||!src.options||!src.options.length){
      return '<option value="">开启预览后可选</option>';
    }
    return Array.prototype.map.call(src.options,function(o){
      return '<option value="'+esc(o.value)+'"'+(o.selected?' selected':'')+'>'+esc(o.textContent)+'</option>';
    }).join('');
  }

  function levelPillsHtml(key,cur){
    return LEVEL_OPTS.map(function(o){
      return '<button type="button" class="c2-pill-btn'+(cur===o.v?' is-on':'')+'" data-level="'+o.v+'">'+esc(o.label)+'</button>';
    }).join('');
  }

  function renderLookTabs(){
    if(!els.lookTabs) return;
    var tabs=[
      {id:'look',label:'妆效'},
      {id:'mask',label:'面具'},
      {id:'tune',label:'微调'},
      {id:'picture',label:'画面'}
    ];
    els.lookTabs.innerHTML=tabs.map(function(tab){
      return '<button type="button" class="c2-look-tab'+(state.lookTab===tab.id?' is-on':'')+'" role="tab" aria-selected="'+(state.lookTab===tab.id?'true':'false')+'" data-look-tab="'+tab.id+'">'+esc(tab.label)+'</button>';
    }).join('');
  }

  function renderLookPanel(){
    if(!els.lookPanel) return;
    renderLookTabs();
    var tab=state.lookTab||'look';
    var html='';
    if(tab==='look'){
      html=[
        '<p class="c2-tab-lead">今天想要的感觉 · 点选即时生效</p>',
        '<div class="c2-look-grid" id="c2LookGrid">'+lookCardHtml(LOOK_PRESETS,'data-look',state.lookId)+'</div>',
        '<p class="c2-tab-note">妆效只改预览，不进识别链路。</p>'
      ].join('');
    }else if(tab==='mask'){
      html=[
        '<p class="c2-tab-lead">隐私面具 · 遮盖预览中的人脸</p>',
        '<div class="c2-look-grid" id="c2MaskGrid">'+lookCardHtml(MASK_PRESETS,'data-mask',state.maskId)+'</div>',
        '<p class="c2-tab-note">可与妆效叠加；识别仍用原始画面。</p>'
      ].join('');
    }else if(tab==='tune'){
      var levels=LEVEL_ROWS.map(function(row){
        var cur=state.levels[row.id]|0;
        return '<div class="c2-level-row" data-enh-level="'+esc(row.id)+'">'+
          '<span class="c2-level-lab">'+esc(row.label)+'</span>'+
          '<div class="c2-pill-row">'+levelPillsHtml(row.id,cur)+'</div></div>';
      }).join('');
      html=[
        '<p class="c2-tab-lead">在当前妆效上再微调一点</p>',
        '<div class="c2-level-rows" id="c2LevelRows">'+levels+'</div>'
      ].join('');
    }else{
      var modeLabel='原片';
      try{
        var st=enhanceApi()&&enhanceApi().getRuntimeStatus&&enhanceApi().getRuntimeStatus();
        if(st&&st.mode==='webgl') modeLabel='WebGL';
        else if(st&&st.mode==='css') modeLabel='柔和显示';
        else if(st&&st.mode==='canvas2d') modeLabel='基础显示';
      }catch(_){}
      var res='—',fps='—';
      try{
        var pv=previewApi();
        var sz=pv&&pv.getActualVideoSize?pv.getActualVideoSize():null;
        if(sz&&sz.width>0) res=Math.round(sz.width)+' × '+Math.round(sz.height);
        var video=$('cameraPreviewVideo');
        var track=video&&video.srcObject&&video.srcObject.getVideoTracks&&video.srcObject.getVideoTracks()[0];
        if(track&&track.getSettings){
          var s=track.getSettings();
          if(s&&s.frameRate>0) fps=String(Math.round(s.frameRate));
        }
      }catch(_){}
      html=[
        '<p class="c2-tab-lead">采集参数 · 与摄像头共用</p>',
        '<div class="c2-field-stack">',
        '  <div class="c2-field"><label>方向</label><select id="c2ResGroup">'+cloneSelectOptions('cameraResGroupSelect')+'</select></div>',
        '  <div class="c2-field"><label>分辨率</label><select id="c2Res">'+cloneSelectOptions('cameraResSelect')+'</select></div>',
        '  <div class="c2-field"><label>采集 FPS</label><select id="c2CapFps">'+cloneSelectOptions('cameraFpsSelect')+'</select></div>',
        '</div>',
        '<ul class="c2-enh-status">',
        '  <li>画面引擎：<b id="c2EnhMode">'+esc(modeLabel)+'</b></li>',
        '  <li>实际分辨率：<b id="c2EnhRes">'+esc(res)+'</b></li>',
        '  <li>实际输出 FPS：<b id="c2EnhFps">'+esc(fps)+'</b></li>',
        '</ul>',
        '<p class="c2-lbl">抗闪烁</p>',
        '<div class="c2-pill-row" id="c2AntiRow">'+ANTI_OPTS.map(function(o){
          return '<button type="button" class="c2-pill-btn'+(state.antiFlicker===o.id?' is-on':'')+'" data-anti="'+esc(o.id)+'">'+esc(o.label)+'</button>';
        }).join('')+'</div>',
        '<p class="c2-lbl">显示 FPS</p>',
        '<div class="c2-pill-row" id="c2FpsRow">'+FPS_OPTS.map(function(v){
          return '<button type="button" class="c2-pill-btn'+(state.displayFps===v?' is-on':'')+'" data-dfps="'+v+'">'+(v===0?'Auto':String(v))+'</button>';
        }).join('')+'</div>',
        '<p class="c2-lbl">色彩</p>',
        '<div class="c2-slider-rows">',
        '  <label class="c2-slider"><span>亮度</span><input type="range" id="c2Bright" min="-50" max="50" value="'+esc(state.brightness)+'"/><b id="c2BrightVal">'+esc(state.brightness)+'</b></label>',
        '  <label class="c2-slider"><span>对比度</span><input type="range" id="c2Contrast" min="-50" max="50" value="'+esc(state.contrast)+'"/><b id="c2ContrastVal">'+esc(state.contrast)+'</b></label>',
        '  <label class="c2-slider"><span>饱和度</span><input type="range" id="c2Sat" min="-50" max="50" value="'+esc(state.saturation)+'"/><b id="c2SatVal">'+esc(state.saturation)+'</b></label>',
        '</div>'
      ].join('');
    }
    els.lookPanel.innerHTML=html;
    syncLookPreviewChrome();
  }

  function syncLookPreviewChrome(){
    var live=!!state.previewLive;
    if(els.lookLive) els.lookLive.hidden=!live;
    if(els.lookFace) els.lookFace.style.opacity=live?'0':'1';
  }

  var lookBlitRaf=0;
  function stopLookBlit(){
    if(lookBlitRaf){ cancelAnimationFrame(lookBlitRaf); lookBlitRaf=0; }
  }

  function ensureLookCanvas(){
    var box=els.lookPreview&&els.lookPreview.parentNode?els.lookPreview.parentNode:null;
    /* lookPreview is video; parent is .c2-look-preview */
    box=document.querySelector('.c2-look-preview');
    if(!box) return null;
    var c=$('c2LookCanvas');
    if(!c){
      c=document.createElement('canvas');
      c.id='c2LookCanvas';
      c.className='c2-look-canvas';
      c.setAttribute('aria-hidden','true');
      box.appendChild(c);
    }
    return c;
  }

  function startLookBlit(){
    stopLookBlit();
    var tick=function(){
      lookBlitRaf=0;
      if(!els.ovLook||!els.ovLook.classList.contains('is-on')) return;
      var canvas=ensureLookCanvas();
      var src=$('cameraEnhancedCanvas');
      var video=els.lookPreview||$('cameraPreviewVideo');
      if(canvas){
        var w=0,h=0,draw=null;
        if(src&&src.width>0){ w=src.width; h=src.height; draw=src; }
        else if(video&&video.videoWidth>0){ w=video.videoWidth; h=video.videoHeight; draw=video; }
        if(draw&&w>0&&h>0){
          if(canvas.width!==w||canvas.height!==h){ canvas.width=w; canvas.height=h; }
          try{
            var ctx=canvas.getContext('2d');
            if(ctx) ctx.drawImage(draw,0,0,w,h);
            canvas.classList.add('is-on');
            if(els.lookPreview) els.lookPreview.style.opacity='0';
          }catch(_){}
        }
      }
      lookBlitRaf=requestAnimationFrame(tick);
    };
    lookBlitRaf=requestAnimationFrame(tick);
  }

  function showMood(msg){
    var el=els.mood||$('c2Mood');
    if(!el) return;
    el.textContent=msg||'';
    if(showMood._t) clearTimeout(showMood._t);
    showMood._t=setTimeout(function(){ if(el) el.textContent=''; },1800);
  }

  function fillLookGrid(){ renderLookPanel(); }

  function fillSnapGrid(){
    if(!els.snapGrid) return;
    els.snapGrid.innerHTML=SNAP_FPS.map(function(f){
      return '<button type="button" class="c2-snap '+esc(f.cls)+(state.snapPick===f.id?' is-on':'')+'" data-snap="'+esc(f.id)+'">'+
        '<div class="mini"><i></i></div><span>'+esc(f.label)+'</span></button>';
    }).join('');
  }

  function fillSceneList(){
    if(!els.sceneList) return;
    els.sceneList.innerHTML=LAYOUT_SCENES.map(function(sc){
      var desk=sc.slots.map(function(sl){ return '<b style="'+esc(sl.s)+'">'+esc(sl.t)+'</b>'; }).join('');
      return '<button type="button" class="c2-scene'+(state.layoutId===sc.id?' is-on':'')+'" data-scene="'+esc(sc.id)+'">'+
        '<div class="c2-scene-desk">'+desk+'</div>'+
        '<div class="info"><strong>'+esc(sc.name)+'</strong><span>'+esc(sc.desc)+'</span></div>'+
        '<span class="go">应用</span></button>';
    }).join('');
  }

  function goalById(id){
    for(var i=0;i<GOALS.length;i++) if(GOALS[i].id===id) return GOALS[i];
    return null;
  }

  function goalHomeOn(g){
    if(!g||!g.home||!g.home.length) return false;
    for(var i=0;i<g.home.length;i++){
      if(!itemOn(catalogById(g.home[i]))) return false;
    }
    return true;
  }

  function goalPartial(g){
    if(!g||!g.home) return false;
    var any=false,all=true;
    for(var i=0;i<g.home.length;i++){
      var on=itemOn(catalogById(g.home[i]));
      if(on) any=true; else all=false;
    }
    return any&&!all;
  }

  function needsGazeCalib(){
    try{
      var g=gazeApi();
      if(g&&typeof g.hasProfile==='function') return !g.hasProfile();
      if(g&&typeof g.getState==='function'){
        var st=g.getState()||{};
        return !(st.hasProfile||st.calibrated);
      }
    }catch(_){}
    return false;
  }

  function setCatalogOn(id,on){
    var it=catalogById(id);
    if(!it) return false;
    if(it.kind==='presence') return !!setPresenceItem(it,!!on,it.defaultBind);
    return !!setFeatureItem(it,!!on);
  }

  function setGoalOn(goalId,on){
    var g=goalById(goalId);
    if(!g) return false;
    if(on&&g.needCalib&&needsGazeCalib()){
      setWarn('请先在右侧「设备与校准」完成注视校准');
      toast('需先完成注视校准','warn');
      openModal('device');
      return false;
    }
    var ok=true;
    for(var i=0;i<g.home.length;i++){
      if(!setCatalogOn(g.home[i],!!on)) ok=false;
    }
    if(ok&&!on){
      for(var j=0;j<(g.detail||[]).length;j++) setCatalogOn(g.detail[j],false);
    }
    syncFromPrefs();
    setWarn('');
    return ok;
  }

  function causeThenLabel(itemId){
    var it=catalogById(itemId);
    if(!it) return '—';
    if(it.kind==='presence'){
      var b=normAction(presencePrefs()[it.bindKey]);
      if(b==='none') b=it.defaultBind||'none';
      return actionLabel(b);
    }
    if(it.feature==='automute') return '自动静音麦克风';
    if(it.feature==='track') return '鼠标跟随注视';
    if(it.feature==='snap') return '窗口跟注视移屏';
    if(it.feature==='wellness') return '温和提醒';
    if(it.feature==='guard') return '隐私卫士';
    return it.name;
  }

  function renderCats(){ /* goals shell — no task/trig cats */ }

  function renderHead(){
    var n=0;
    for(var i=0;i<GOALS.length;i++) if(goalHomeOn(GOALS[i])) n++;
    if(els.headTitle) els.headTitle.textContent='我想要…';
    if(els.headDesc){
      els.headDesc.textContent=n
        ? ('已开 '+n+' 个目标 · 点开卡片看会发生什么')
        : '开目标 = 系统代管背后能力。原子名在「全部细节」。';
    }
    var showHub=state.openGoal==='gesture'||state.view==='atoms';
    if(els.hubWrap){
      els.hubWrap.hidden=!showHub;
      if(els.hub) els.hub.checked=!!state.hubOn;
    }
    if(els.master){
      els.master.classList.toggle('is-on',!!state.masterOn);
      els.master.setAttribute('aria-pressed',state.masterOn?'true':'false');
    }
    if(els.masterLbl) els.masterLbl.textContent=state.masterOn?'识别已开':'识别已关';
  }

  function cardSide(item){
    if(item.kind==='presence'){
      var b=normAction(presencePrefs()[item.bindKey]);
      if(b==='none') return '<span class="side empty">→ —</span>';
      return '<span class="side">→ '+esc(actionLabel(b))+'</span>';
    }
    return '<span class="side badge">使用中</span>';
  }

  function renderGoalsHome(){
    els.list.innerHTML=GOALS.map(function(g){
      var on=goalHomeOn(g);
      var partial=goalPartial(g);
      var open=state.openGoal===g.id;
      var badge=g.recommend&&on?'<span class="c2-goal-badge">推荐</span>':'';
      var need=g.needCalib&&needsGazeCalib()?'<span class="c2-goal-need">需先校准</span>':'';
      var causes=g.causes.map(function(c){
        return '<div class="c2-cause">'+
          '<span class="when">'+esc(c.when)+'</span>'+
          '<button type="button" class="c2-btn" data-cause="'+esc(c.itemId)+'">改结果</button>'+
          '<span class="then">→ 系统会：<b>'+esc(causeThenLabel(c.itemId))+'</b></span></div>';
      }).join('');
      return '<div class="c2-goal'+(on?' is-on':'')+(open?' is-open':'')+(partial?' is-partial':'')+'" data-goal="'+esc(g.id)+'">'+
        '<div class="c2-goal-row">'+
          '<button type="button" class="c2-goal-head" data-toggle-goal="'+esc(g.id)+'">'+
            '<span class="title">'+esc(g.title)+badge+need+'</span>'+
            '<span class="one">'+esc(g.one)+'</span>'+
            '<span class="chev">'+(open?'收起会发生什么 ▲':'看看会发生什么 ▼')+'</span>'+
          '</button>'+
          '<button type="button" class="c2-toggle'+(on?' is-on':'')+'" data-switch-goal="'+esc(g.id)+'" aria-pressed="'+(on?'true':'false')+'" aria-label="开关 '+esc(g.title)+'"></button>'+
        '</div>'+
        (open?'<div class="c2-goal-body"><div class="c2-causes">'+causes+'</div></div>':'')+
      '</div>';
    }).join('')+
      '<div class="c2-goal-doors">'+
        '<button type="button" class="c2-btn" id="c2AtomsBtn">全部细节…</button>'+
      '</div>';
    els.foot.textContent='目标代管原子 · 美颜在右侧「画面观感」';
  }

  function renderAtomsList(){
    var rows=CATALOG.map(function(it){
      var on=itemOn(it);
      var gLabel='';
      for(var i=0;i<GOALS.length;i++){
        var g=GOALS[i];
        if(g.home.indexOf(it.id)>=0||(g.detail||[]).indexOf(it.id)>=0){ gLabel=g.title; break; }
      }
      return '<button type="button" class="c2-card'+(on?' is-on':'')+'" data-id="'+esc(it.id)+'">'+
        '<span class="name">'+esc(it.name)+'</span>'+cardSide(it)+
        '<span class="desc">'+esc(it.desc)+'</span>'+
        '<span class="meta"><span class="pill">隶属 · '+esc(gLabel||'—')+'</span>'+
          (on?'<span class="pill">使用中</span>':'<span class="pill">未开</span>')+
        '</span></button>';
    }).join('');
    els.list.innerHTML=
      '<button type="button" class="c2-back" id="c2AtomsBack">← 返回目标</button>'+
      '<p class="c2-why">这里才露出系统代管的原子。改绑定会作用到对应目标。</p>'+rows;
    els.foot.textContent='全部细节 · '+CATALOG.length+' 个原子';
  }

  function renderList(){
    if(!els.list||!els.empty||!els.sheet||!els.add||!els.foot) return;
    els.sheet.hidden=state.view!=='sheet';
    els.sheet.classList.toggle('is-on',state.view==='sheet');
    els.add.hidden=state.view!=='add';
    els.add.classList.toggle('is-on',state.view==='add');
    els.list.hidden=!(state.view==='list'||state.view==='atoms');
    els.empty.hidden=true;
    els.foot.hidden=!(state.view==='list'||state.view==='atoms');

    if(state.view==='sheet'){ renderSheet(); return; }
    if(state.view==='add'){ renderAdd(); return; }
    if(state.view==='atoms'){ renderAtomsList(); return; }
    renderGoalsHome();
  }

  function renderSheet(){
    var it=catalogById(state.selectedId);
    if(!it){ state.view='list'; renderList(); return; }
    var on=itemOn(it);
    var fields='';
    if(it.kind==='presence'){
      var bind=normAction(presencePrefs()[it.bindKey]);
      if(bind==='none') bind=it.defaultBind||'none';
      var opts=bindOptions(it.bindKey).map(function(o){
        return '<option value="'+esc(o.id)+'"'+(o.id===bind?' selected':'')+'>'+esc(o.label)+'</option>';
      }).join('');
      fields='<div class="c2-field"><label>结果</label><select id="c2SheetBind">'+opts+'</select></div>';
    }
    fields+='<div class="c2-field"><label>使用中</label>'+
      '<button type="button" class="c2-toggle'+(on?' is-on':'')+'" id="c2SheetEn" aria-pressed="'+(on?'true':'false')+'"></button></div>';
    els.sheet.innerHTML=
      '<button type="button" class="c2-back" id="c2SheetBack">← 返回</button>'+
      '<div class="c2-sheet-h"><h3>'+esc(it.name)+'</h3></div>'+
      '<p class="c2-why">'+esc(it.why)+'</p>'+
      '<div class="c2-fields">'+fields+'</div>'+
      '<div class="c2-row-actions">'+
        '<button type="button" class="c2-btn is-primary" id="c2SheetSave">保存</button>'+
        (on?'<button type="button" class="c2-btn" id="c2SheetRemove">关闭此项</button>':'')+
      '</div>';
  }

  function renderAdd(){
    var offs=itemsInCat(state.cat,false);
    var body=offs.length
      ? offs.map(function(it){
          return '<button type="button" class="c2-add-opt" data-add="'+esc(it.id)+'">'+
            '<strong>'+esc(it.name)+'</strong><small>'+esc(it.desc)+'</small></button>';
        }).join('')
      : '<p class="c2-why">这一类已全部启用。</p>';
    var cur=catDefs().filter(function(d){ return d.id===state.cat; })[0];
    els.add.innerHTML=
      '<button type="button" class="c2-back" id="c2AddBack">← 返回</button>'+
      '<div class="c2-sheet-h"><h3>添加 · '+esc(cur?cur.label:'')+'</h3></div>'+body;
  }

  function paint(){
    renderCats();
    renderHead();
    renderList();
    updateHints();
    fillSnapGrid();
    fillSceneList();
    if(els.fgText){
      els.fgText.textContent=state.masterOn?(state.previewLive?'识别中':'识别待命'):'已关闭';
    }
    if(els.live) els.live.hidden=!state.previewLive;
    if(els.faceHint) els.faceHint.style.opacity=state.previewLive?'0':'1';
    syncLookPreviewChrome();
    if(els.ovLook&&els.ovLook.classList.contains('is-on')) renderLookPanel();
    setWarn(state.warn);
  }

  function attachPreviewTo(video){
    if(!video) return;
    var main=$('cameraPreviewVideo');
    try{
      if(main&&main.srcObject){
        video.srcObject=main.srcObject;
        video.play&&video.play().catch(function(){});
      }
    }catch(_){}
  }

  function mirrorPreview(){
    var main=$('cameraPreviewVideo');
    try{
      if(main&&main.srcObject){
        state.previewLive=true;
        attachPreviewTo(els.preview);
        attachPreviewTo(els.lookPreview);
      }else{
        state.previewLive=!!(previewApi()&&previewApi().isRunning&&previewApi().isRunning());
      }
    }catch(_){}
    syncLookPreviewChrome();
  }

  function startPreview(){
    var pv=previewApi();
    if(pv&&typeof pv.startPreview==='function'){
      try{
        var r=pv.startPreview({reason:'camera2'});
        if(r&&typeof r.then==='function'){
          r.then(function(){ mirrorPreview(); paint(); }).catch(function(){ toast('预览启动失败','warn'); });
          return;
        }
      }catch(_){}
    }
    mirrorPreview();
    paint();
  }

  function refreshDevices(){
    var pv=previewApi();
    if(pv&&typeof pv.refreshDevices==='function'){
      try{
        var r=pv.refreshDevices();
        if(r&&typeof r.then==='function') r.then(fillDeviceSelect).catch(fillDeviceSelect);
        else fillDeviceSelect();
        return;
      }catch(_){}
    }
    fillDeviceSelect();
  }

  function fillDeviceSelect(){
    if(!els.deviceSelect) return;
    var src=$('cameraDeviceSelect');
    if(src&&src.options&&src.options.length){
      els.deviceSelect.innerHTML=Array.prototype.map.call(src.options,function(o){
        return '<option value="'+esc(o.value)+'"'+(o.selected?' selected':'')+'>'+esc(o.textContent)+'</option>';
      }).join('');
    }else{
      els.deviceSelect.innerHTML='<option value="">打开摄像头 1 可刷新设备</option>';
    }
    updateHints();
  }

  function applyDevice(id){
    var src=$('cameraDeviceSelect');
    if(src&&id!=null){
      try{
        src.value=id;
        src.dispatchEvent(new Event('change',{bubbles:true}));
      }catch(_){}
    }
    updateHints();
  }

  function syncCam1Select(id,value){
    var src=$(id);
    if(!src) return;
    try{
      src.value=value;
      src.dispatchEvent(new Event('change',{bubbles:true}));
      toast('已切换采集参数','ok');
    }catch(_){}
  }

  function applyLook(id){
    persistEnh({look:id||'off'});
    var p=LOOK_PRESETS.filter(function(x){ return x.id===state.lookId; })[0];
    showMood(p?(p.label+' · '+p.desc):'已更新妆效');
  }

  function applyMask(id){
    persistEnh({faceMask:id||'off'});
    var p=MASK_PRESETS.filter(function(x){ return x.id===state.maskId; })[0];
    showMood(p?(p.label+' · '+p.desc):'已更新面具');
  }

  function applyLevel(key,lv){
    var patch={};
    patch[key]=lv|0;
    persistEnh(patch);
    var row=LEVEL_ROWS.filter(function(r){ return r.id===key; })[0];
    showMood((row?row.label:'')+'已更新');
  }

  function setCompareBypass(on){
    var en=enhanceApi();
    if(en&&en.setCompareBypass){
      try{ en.setCompareBypass(!!on); }catch(_){}
    }
    if(els.compareBtn) els.compareBtn.classList.toggle('is-pressed',!!on);
  }

  function openModal(name){
    var map={device:els.ovDevice,look:els.ovLook,layout:els.ovLayout};
    Object.keys(map).forEach(function(k){
      var el=map[k];
      if(!el) return;
      var on=k===name;
      el.hidden=!on;
      el.classList.toggle('is-on',on);
    });
    if(name==='device') refreshDevices();
    if(name==='look'){
      syncEnhFromPrefs();
      renderLookPanel();
      mirrorPreview();
      if(!state.previewLive) startPreview();
      startLookBlit();
    }
    if(name==='layout'){ fillSnapGrid(); fillSceneList(); }
  }

  function closeModals(){
    setCompareBypass(false);
    stopLookBlit();
    var canvas=$('c2LookCanvas');
    if(canvas) canvas.classList.remove('is-on');
    if(els.lookPreview) els.lookPreview.style.opacity='';
    [els.ovDevice,els.ovLook,els.ovLayout].forEach(function(el){
      if(!el) return;
      el.hidden=true;
      el.classList.remove('is-on');
    });
  }

  function playSound(){
    try{
      if(global.OneToneAppThemePrefs&&global.OneToneAppThemePrefs.previewSoundSlot){
        global.OneToneAppThemePrefs.previewSoundSlot('cameraAction');
        return;
      }
      if(global.OneToneAppThemePrefs&&global.OneToneAppThemePrefs.playSoundCue){
        global.OneToneAppThemePrefs.playSoundCue('camera_action');
        return;
      }
    }catch(_){}
    toast('提示音已触发','info');
  }

  function onClick(e){
    var t=e.target;
    if(!t||!mountEl||!mountEl.contains(t)) return;
    if(t.closest&&t.closest('[data-close]')){ closeModals(); return; }
    if(t.classList&&t.classList.contains('c2-ov')){ closeModals(); return; }
    var modal=t.closest&&t.closest('[data-modal]');
    if(modal){ openModal(modal.getAttribute('data-modal')); return; }
    var dim=t.closest&&t.closest('[data-dim]');
    if(dim){
      state.dim=dim.getAttribute('data-dim')==='trig'?'trig':'task';
      state.view='list';
      paint();
      return;
    }
    var cat=t.closest&&t.closest('[data-cat]');
    if(cat){
      state.cat=cat.getAttribute('data-cat')||state.cat;
      state.view='list';
      paint();
      return;
    }
    var toggleGoal=t.closest&&t.closest('[data-toggle-goal]');
    if(toggleGoal){
      var gid=toggleGoal.getAttribute('data-toggle-goal');
      state.openGoal=state.openGoal===gid?null:gid;
      paint();
      return;
    }
    var switchGoal=t.closest&&t.closest('[data-switch-goal]');
    if(switchGoal){
      var sid=switchGoal.getAttribute('data-switch-goal');
      var g=goalById(sid);
      setGoalOn(sid,!(g&&goalHomeOn(g)));
      paint();
      return;
    }
    var causeBtn=t.closest&&t.closest('[data-cause]');
    if(causeBtn){
      state.returnView=state.view==='atoms'?'atoms':'list';
      state.selectedId=causeBtn.getAttribute('data-cause');
      state.view='sheet';
      paint();
      return;
    }
    if(t.id==='c2AtomsBtn'){ state.view='atoms'; paint(); return; }
    if(t.id==='c2AtomsBack'){ state.view='list'; paint(); return; }
    if(t.id==='c2Master'||(t.closest&&t.closest('#c2Master'))){ setMaster(!state.masterOn); return; }
    if(t.id==='c2Recommend'){ applyRecommend(); return; }
    if(t.id==='c2SoundPlay'){ playSound(); return; }
    if(t.id==='c2PreviewStart'||t.id==='c2LookPreviewStart'){ startPreview(); return; }
    var lookTab=t.closest&&t.closest('[data-look-tab]');
    if(lookTab){
      state.lookTab=lookTab.getAttribute('data-look-tab')||'look';
      renderLookPanel();
      return;
    }
    if(t.id==='c2EmptyAdd'||t.id==='c2ListAdd'){ state.view='add'; paint(); return; }
    var card=t.closest&&t.closest('.c2-card[data-id]');
    if(card){
      state.returnView=state.view==='atoms'?'atoms':'list';
      state.selectedId=card.getAttribute('data-id');
      state.view='sheet';
      paint();
      return;
    }
    if(t.id==='c2SheetBack'||t.id==='c2AddBack'){
      state.view=state.returnView==='atoms'?'atoms':'list';
      state.selectedId=null;
      paint();
      return;
    }
    if(t.id==='c2SheetEn'){
      t.classList.toggle('is-on');
      t.setAttribute('aria-pressed',t.classList.contains('is-on')?'true':'false');
      return;
    }
    if(t.id==='c2SheetSave'){
      var it=catalogById(state.selectedId);
      if(!it) return;
      var enEl=$('c2SheetEn');
      var on=enEl?enEl.classList.contains('is-on'):true;
      if(it.kind==='presence'){
        var bindEl=$('c2SheetBind');
        var bind=bindEl?bindEl.value:resolveBind(it,null);
        if(on&&(!bind||bind==='none')){
          setWarn('请先选择一个结果动作');
          toast('请选择结果动作','warn');
          return;
        }
        if(!setPresenceItem(it,on,bind)) return;
      }else if(!setFeatureItem(it,on)) return;
      syncFromPrefs();
      state.view=state.returnView==='atoms'?'atoms':'list';
      toast(on?'已保存':'已关闭','ok');
      paint();
      return;
    }
    if(t.id==='c2SheetRemove'){
      var it2=catalogById(state.selectedId);
      if(!it2) return;
      if(it2.kind==='presence') setPresenceItem(it2,false);
      else setFeatureItem(it2,false);
      syncFromPrefs();
      state.view=state.returnView==='atoms'?'atoms':'list';
      paint();
      return;
    }
    var addOpt=t.closest&&t.closest('[data-add]');
    if(addOpt){
      addCatalogItem(addOpt.getAttribute('data-add'));
      return;
    }
    var look=t.closest&&t.closest('button[data-look], [data-look].c2-look-card');
    if(look){ applyLook(look.getAttribute('data-look')); return; }
    var mask=t.closest&&t.closest('button[data-mask], [data-mask].c2-look-card');
    if(mask){ applyMask(mask.getAttribute('data-mask')); return; }
    var lvl=t.closest&&t.closest('button[data-level]');
    if(lvl){
      var row=lvl.closest('[data-enh-level]');
      if(row){ applyLevel(row.getAttribute('data-enh-level'),parseInt(lvl.getAttribute('data-level'),10)||0); return; }
    }
    var anti=t.closest&&t.closest('button[data-anti]');
    if(anti){ persistEnh({antiFlicker:anti.getAttribute('data-anti')||'auto'}); return; }
    var dfps=t.closest&&t.closest('button[data-dfps]');
    if(dfps){ persistEnh({displayFrameRate:parseInt(dfps.getAttribute('data-dfps'),10)||0}); return; }
    var snap=t.closest&&t.closest('[data-snap]');
    if(snap){
      state.snapPick=snap.getAttribute('data-snap')||'';
      fillSnapGrid();
      toast('贴位示意：'+state.snapPick+'（工作区请用下方快照）','info');
      return;
    }
    var scene=t.closest&&t.closest('[data-scene]');
    if(scene){
      state.layoutId=scene.getAttribute('data-scene')||state.layoutId;
      updateHints();
      fillSceneList();
      var applyBtn=$('workspaceLayoutApplyCurrentBtn');
      if(applyBtn){ try{ applyBtn.click(); }catch(_){} }
      else toast('已选择：'+state.layoutId,'info');
      return;
    }
    if(t.id==='c2DeviceRefresh'){ refreshDevices(); return; }
    if(t.id==='c2CalibFast'||t.id==='c2CalibFine'){
      var g=gazeApi();
      if(g&&g.start){ try{ g.start(t.id==='c2CalibFine'?'fine':'fast'); toast('开始校准','info'); }catch(err){ toast(String(err&&err.message||err),'warn'); } }
      else toast('校准模块未就绪','warn');
      return;
    }
    if(t.id==='c2CalibClear'){
      var g2=gazeApi();
      if(g2&&g2.clear){ try{ g2.clear(); toast('已清除校准','ok'); updateHints(); }catch(_){} }
      return;
    }
    if(t.id==='c2LayoutSave'){
      var sb=$('workspaceLayoutSaveBtn');
      if(sb){ try{ sb.click(); toast('已保存当前布局','ok'); }catch(_){} }
      else toast('布局保存不可用','warn');
      return;
    }
    if(t.id==='c2LayoutApply'){
      var ab=$('workspaceLayoutApplyCurrentBtn');
      if(ab){ try{ ab.click(); toast('已应用布局','ok'); }catch(_){} }
      else toast('布局应用不可用','warn');
    }
  }

  function onChange(e){
    var t=e.target;
    if(!t||!mountEl||!mountEl.contains(t)) return;
    if(t.id==='c2Hub'){ setHub(!!t.checked); return; }
    if(t.id==='c2DeviceSelect'){ applyDevice(t.value); return; }
    if(t.id==='c2ResGroup'){ syncCam1Select('cameraResGroupSelect',t.value); return; }
    if(t.id==='c2Res'){ syncCam1Select('cameraResSelect',t.value); return; }
    if(t.id==='c2CapFps'){ syncCam1Select('cameraFpsSelect',t.value); return; }
    if(t.id==='c2Bright'){
      var bv=Number(t.value)||0;
      var bl=$('c2BrightVal'); if(bl) bl.textContent=String(bv);
      persistEnh({brightness:bv},{quiet:true});
      return;
    }
    if(t.id==='c2Contrast'){
      var cv=Number(t.value)||0;
      var cl=$('c2ContrastVal'); if(cl) cl.textContent=String(cv);
      persistEnh({contrast:cv},{quiet:true});
      return;
    }
    if(t.id==='c2Sat'){
      var sv=Number(t.value)||0;
      var sl=$('c2SatVal'); if(sl) sl.textContent=String(sv);
      persistEnh({saturation:sv},{quiet:true});
      return;
    }
  }

  function onPointer(e){
    var btn=e.target&&e.target.closest?e.target.closest('#c2CompareBtn'):null;
    if(!btn){
      if(e.type!=='pointerdown'&&els.compareBtn&&els.compareBtn.classList.contains('is-pressed')) setCompareBypass(false);
      return;
    }
    if(e.type==='pointerdown'){ e.preventDefault(); setCompareBypass(true); }
    else setCompareBypass(false);
  }

  function wire(){
    if(!mountEl) return;
    mountEl.addEventListener('click',onClick);
    mountEl.addEventListener('change',onChange);
    mountEl.addEventListener('input',onChange);
    mountEl.addEventListener('pointerdown',onPointer);
    mountEl.addEventListener('pointerup',onPointer);
    mountEl.addEventListener('pointerleave',onPointer);
    mountEl.addEventListener('pointercancel',onPointer);
    unsubs.push(function(){
      mountEl.removeEventListener('click',onClick);
      mountEl.removeEventListener('change',onChange);
      mountEl.removeEventListener('input',onChange);
      mountEl.removeEventListener('pointerdown',onPointer);
      mountEl.removeEventListener('pointerup',onPointer);
      mountEl.removeEventListener('pointerleave',onPointer);
      mountEl.removeEventListener('pointercancel',onPointer);
    });
  }

  function mount(){
    mountEl=$('camera2Mount');
    if(!mountEl) return false;
    if(mounted&&mountEl.getAttribute('data-ready')===DATA_READY){
      syncFromPrefs();
      mirrorPreview();
      paint();
      return true;
    }
    unmount();
    ensureMarkup(mountEl);
    cacheEls();
    syncFromPrefs();
    wire();
    mirrorPreview();
    refreshDevices();
    paint();
    mounted=true;
    return true;
  }

  function unmount(){
    unsubs.forEach(function(fn){ try{ fn(); }catch(_){} });
    unsubs=[];
    closeModals();
    mounted=false;
    els={};
  }

  function refresh(){
    if(!mounted) return;
    syncFromPrefs();
    mirrorPreview();
    paint();
  }

  global.OneToneCamera2Workbench={
    mount:mount,
    unmount:unmount,
    refresh:refresh,
    isMounted:function(){ return !!mounted; },
    _test:{
      catalog:CATALOG,
      goals:GOALS,
      dataReady:DATA_READY,
      tasks:TASKS,
      trigs:TRIGS,
      resolveBind:resolveBind,
      presenceOn:presenceOn,
      goalHomeOn:goalHomeOn,
      setGoalOn:setGoalOn,
      addCatalogItem:addCatalogItem,
      setPresenceItem:setPresenceItem,
      setFeatureItem:setFeatureItem
    }
  };
})(window);
