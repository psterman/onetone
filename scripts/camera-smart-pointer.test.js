#!/usr/bin/env node
'use strict';

var assert=require('assert');

global.document={
  readyState:'loading',
  getElementById:function(){ return null; },
  querySelector:function(){ return null; },
  querySelectorAll:function(){ return []; },
  createElement:function(){
    return {
      setAttribute:function(){},
      appendChild:function(){},
      classList:{add:function(){},remove:function(){},toggle:function(){}}
    };
  },
  addEventListener:function(){}
};
global.window=global;
global.performance={now:function(){ return Date.now(); }};
global.OneToneDom={$:function(){ return null; }};
global.OneToneState={state:{config:{cameraPrefs:{}},ui:{},runtime:{}}};
global.OneToneIpc={
  invoke:function(){ return Promise.reject(new Error('no_ipc_in_test')); }
};

require('../src/js/features/camera/camera-gaze-monitor-topology.js');
require('../src/js/features/camera/camera-gaze-monitor-assessment.js');
require('../src/js/features/camera/camera-gaze-monitor-classifier.js');
require('../src/js/features/camera/camera-smart-pointer.js');

var Topo=global.OneToneCameraGazeMonitorTopology;
var Assess=global.OneToneCameraGazeMonitorAssessment;
var Clf=global.OneToneCameraGazeMonitorClassifier;
var Sp=global.OneToneCameraSmartPointer;

assert.ok(Topo&&Assess&&Clf&&Sp,'modules export');

// --- topology ---
var topo=Topo.normalizeTopology({
  monitors:[
    {x:0,y:0,width:1920,height:1080,scaleFactor:1,primary:true,label:'Center'},
    {x:-1920,y:0,width:1920,height:1080,scaleFactor:1,label:'Left'},
    {x:1920,y:0,width:1920,height:1080,scaleFactor:1.25,label:'Right'}
  ]
},{screenCount:3});
assert.strictEqual(topo.monitors[0].id,'monitor-0');
assert.strictEqual(topo.monitors[0].x,-1920);
assert.strictEqual(topo.aliases['monitor-0'],'left');
assert.strictEqual(topo.aliases['monitor-1'],'center');
assert.strictEqual(topo.aliases['monitor-2'],'right');
assert.strictEqual(topo.virtualBounds.x,-1920);
assert.strictEqual(topo.virtualBounds.width,5760);
assert.ok(topo.fingerprint.indexOf('-1920|0|1920|1080|1.0000')>=0);
assert.strictEqual(Topo.getMonitorForPoint(topo,-100,10).id,'monitor-0');
assert.strictEqual(Topo.getMonitorForPoint(topo,100,10).id,'monitor-1');
assert.strictEqual(Topo.getAliasForMonitor(topo,'monitor-2'),'right');

var fp2=Topo.fingerprintFromMonitors([
  {x:-1920,y:0,width:1920,height:1080,scaleFactor:1.25},
  {x:0,y:0,width:1920,height:1080,scaleFactor:1}
]);
assert.notStrictEqual(topo.fingerprint,fp2,'dpi change alters fingerprint');

// --- assessment quality + stale ---
function cluster(alias, cx, n, conf){
  var out=[];
  for(var i=0;i<n;i++){
    out.push({
      alias:alias,
      feats:[cx,0.1,cx*0.5,0,cx,0.05,cx*0.2,0],
      confidence:conf
    });
  }
  return out;
}
var goodSamples=[].concat(
  cluster('left',-0.8,12,0.8),
  cluster('center',0,12,0.8),
  cluster('right',0.8,12,0.8)
);
var good=Assess.evaluateSeparability(goodSamples);
assert.strictEqual(good.quality,'good',good.reason);

var weakSamples=[].concat(
  cluster('left',0.02,10,0.5),
  cluster('center',0.0,10,0.5),
  cluster('right',0.03,10,0.5)
);
var poor=Assess.evaluateSeparability(weakSamples);
assert.strictEqual(poor.quality,'poor');

var finalized=Assess.finalizeAssessment(goodSamples, topo.fingerprint);
assert.strictEqual(finalized.status,'ready');
assert.strictEqual(finalized.topologyFingerprint,topo.fingerprint);
var stale=Assess.applyFingerprint(finalized, fp2);
assert.strictEqual(stale.status,'stale');
assert.strictEqual(stale.reason,'topology_changed');

// session confirm-per-step
var session=Assess.createSession({screenCount:3,fingerprint:topo.fingerprint,sampleMs:1500});
assert.strictEqual(Assess.currentStep(session),'center');
assert.strictEqual(session.stepConfirmPending,true);
Assess.beginStep(session,1000);
assert.strictEqual(session.running,true);
var mid=Assess.ingestPoint(session,{
  feats:[0,0,0,0,0,0,0,0],confidence:0.7,faceDetected:true,state:'tracking'
},1200);
assert.strictEqual(mid.ok,true);
assert.strictEqual(mid.stepComplete,false);

// --- classifier ---
var settings=Sp.normalizeSmartPointer({
  enabled:true,
  mode:'preview',
  screenCount:3,
  cameraPosition:'center-top',
  assessment:finalized
});
Sp.setTopology(topo);

var leftHit=Clf.classify(
  {feats:[-0.8,0.1,-0.4,0,-0.8,0.05,-0.16,0],confidence:0.8,yaw:-0.5,faceDetected:true},
  topo, finalized, settings
);
assert.strictEqual(leftHit.alias,'left');
assert.strictEqual(leftHit.source,'assessment');
assert.strictEqual(leftHit.monitorId,'monitor-0');

var heur=Clf.classify(
  {feats:[0,0,0,0,0,0,0,0],confidence:0.7,yaw:0.4,faceDetected:true},
  topo,
  Assess.emptyAssessment(),
  settings
);
// Front camera: landmark yaw+ = image-right = user's left → left monitor
assert.strictEqual(heur.alias,'left');
assert.strictEqual(heur.source,'heuristic');
assert.strictEqual(heur.lowAccuracy,true);

var heurRight=Clf.classify(
  {feats:[0,0,0,0,0,0,0,0],confidence:0.7,yaw:-0.45,faceDetected:true,x:0.35},
  topo,
  Assess.emptyAssessment(),
  settings
);
assert.strictEqual(heurRight.alias,'right','negative landmark yaw → right screen');

var heurCenter=Clf.classify(
  {feats:[0,0,0,0,0,0,0,0],confidence:0.7,yaw:0.05,faceDetected:true,x:0.5},
  topo,
  Assess.emptyAssessment(),
  settings
);
assert.strictEqual(heurCenter.alias,'center');

var stab=Clf.createStability();
stab=Clf.updateStability(stab,{monitorId:'monitor-0',confidence:0.8},1000);
assert.strictEqual(stab.stableMs,0);
stab=Clf.updateStability(stab,{monitorId:'monitor-0',confidence:0.8},1800);
assert.strictEqual(stab.stableMs,800);
// Switch requires ~180ms hold on the new id
stab=Clf.updateStability(stab,{monitorId:'monitor-1',confidence:0.8},1900);
assert.strictEqual(stab.monitorId,'monitor-0','pending switch');
stab=Clf.updateStability(stab,{monitorId:'monitor-1',confidence:0.8},2100);
assert.strictEqual(stab.monitorId,'monitor-1');
assert.strictEqual(stab.stableMs,0);

// --- smart pointer normalize + soft quality (no hard locks) ---
var d=Sp.defaultSmartPointer();
assert.strictEqual(d.enabled,false);
assert.strictEqual(d.mode,'auto');
assert.strictEqual(d.trigger,'dwell');
assert.strictEqual(d.setupConfirmed,false);

var poorSettings=Sp.normalizeSmartPointer({
  enabled:true,
  mode:'auto',
  assessment:{status:'ready',quality:'poor',centroids:{},topologyFingerprint:topo.fingerprint}
});
assert.strictEqual(poorSettings.mode,'auto','poor keeps auto');
assert.deepStrictEqual(Sp.allowedMoveModes(poorSettings),['preview','confirm','auto']);
assert.strictEqual(Sp.canUseAuto(poorSettings),true);

var okSettings=Sp.normalizeSmartPointer({
  enabled:true,
  mode:'auto',
  assessment:{status:'ready',quality:'ok',centroids:{},topologyFingerprint:topo.fingerprint}
});
assert.strictEqual(okSettings.mode,'auto','ok keeps auto');
assert.deepStrictEqual(Sp.allowedMoveModes(okSettings),['preview','confirm','auto']);

var goodSettings=Sp.normalizeSmartPointer({
  enabled:true,
  mode:'auto',
  assessment:finalized
});
assert.strictEqual(goodSettings.mode,'auto');
assert.ok(Sp.canUseAuto(goodSettings));

var staleSettings=Sp.normalizeSmartPointer({
  enabled:true,
  mode:'auto',
  assessment:stale
});
assert.strictEqual(staleSettings.mode,'auto','stale keeps auto');

// Fine-tune field normalize
var tuned=Sp.normalizeSmartPointer({
  enabled:true,
  mode:'auto',
  minConfidence:0.15,
  dwellMs:100,
  cooldownMs:50,
  landPreference:'center',
  setupConfirmed:true
});
assert.strictEqual(tuned.minConfidence,0.2);
assert.strictEqual(tuned.dwellMs,300);
assert.strictEqual(tuned.cooldownMs,400);
assert.strictEqual(tuned.setupConfirmed,true);
assert.strictEqual(tuned.landPreference,'center');
assert.strictEqual(Sp.defaultSmartPointer().landPreference,'center');
var migrated=Sp.normalizeSmartPointer({
  enabled:true,
  mode:'auto',
  landPreference:'last',
  landPrefV:0
});
assert.strictEqual(migrated.landPreference,'center','v2 migrates last→center');
assert.strictEqual(migrated.landPrefV,2);
var keepLast=Sp.normalizeSmartPointer({
  enabled:true,
  mode:'auto',
  landPreference:'last',
  landPrefV:2
});
assert.strictEqual(keepLast.landPreference,'last','explicit last kept after v2');

// shouldAttemptMove / preview never moves
assert.strictEqual(Sp.shouldAttemptMove({
  enabled:true,mode:'preview',dwellMs:700,cooldownMs:1200,minConfidence:0.5,
  assessment:finalized
},{monitorId:'monitor-0',confidence:0.9},{monitorId:'monitor-0',stableMs:900},5000,true),false);

assert.strictEqual(Sp.shouldAttemptMove({
  enabled:true,mode:'confirm',trigger:'ctrl',dwellMs:700,cooldownMs:1200,minConfidence:0.5,
  assessment:finalized
},{monitorId:'monitor-0',confidence:0.9},{monitorId:'monitor-0',stableMs:900},5000,false),false);

assert.strictEqual(Sp.shouldAttemptMove({
  enabled:true,mode:'confirm',trigger:'ctrl',dwellMs:700,cooldownMs:1200,minConfidence:0.5,
  assessment:finalized
},{monitorId:'monitor-0',confidence:0.9},{monitorId:'monitor-0',stableMs:900},5000,true),true);

assert.strictEqual(Sp.shouldAttemptMove({
  enabled:true,mode:'auto',trigger:'dwell',dwellMs:700,cooldownMs:1200,minConfidence:0.5,
  assessment:{status:'ready',quality:'poor'}
},{monitorId:'monitor-0',confidence:0.9},{monitorId:'monitor-0',stableMs:900},5000,false),true,'poor still allows auto');

// Auto gated by autoMoveEnabled only (not quality)
assert.strictEqual(Sp.isAutoMoveEnabled(),true);
assert.strictEqual(Sp.shouldAttemptMove({
  enabled:true,mode:'auto',trigger:'dwell',dwellMs:700,cooldownMs:1200,minConfidence:0.5,
  assessment:finalized
},{monitorId:'monitor-0',confidence:0.9},{monitorId:'monitor-0',stableMs:900},5000,false),true,'auto allowed');
Sp.setAutoMoveEnabled(false);
assert.strictEqual(Sp.shouldAttemptMove({
  enabled:true,mode:'auto',trigger:'dwell',dwellMs:700,cooldownMs:1200,minConfidence:0.5,
  assessment:finalized
},{monitorId:'monitor-0',confidence:0.9},{monitorId:'monitor-0',stableMs:900},5000,false),false);
Sp.setAutoMoveEnabled(true);

// onGazeFrame preview classify (no move side effects)
Sp.resetRuntime();
Sp.writeSettings({
  enabled:true,
  mode:'preview',
  screenCount:3,
  minConfidence:0.5,
  assessment:finalized
});
Sp.setTopology(topo);
var frame=Sp.onGazeFrame({
  feats:[-0.8,0.1,-0.4,0,-0.8,0.05,-0.16,0],
  confidence:0.85,
  yaw:-0.5,
  faceDetected:true,
  state:'tracking',
  blinking:false
},10000);
assert.ok(frame);
assert.strictEqual(frame.alias,'left');
assert.strictEqual(frame.monitorId,'monitor-0');
assert.strictEqual(Sp.getDebugState().lastAction,null,'preview never records move action');

// Ctrl-gated move: mock IPC
var ipcLog=[];
global.OneToneIpc.invoke=function(cmd,args){
  ipcLog.push({cmd:cmd,args:args||{}});
  if(cmd==='cmd_gaze_is_ctrl_down') return Promise.resolve({down:true});
  if(cmd==='cmd_gaze_get_cursor_position'){
    return Promise.resolve({x:100,y:200,monitorId:'monitor-1'});
  }
  if(cmd==='cmd_gaze_move_cursor_to_monitor'){
    return Promise.resolve({x:args&&args.preferred?args.preferred.x:-960,y:540});
  }
  return Promise.reject(new Error('unexpected:'+cmd));
};

Sp.resetRuntime();
Sp.writeSettings({
  enabled:true,
  mode:'confirm',
  trigger:'ctrl',
  screenCount:3,
  minConfidence:0.5,
  dwellMs:500,
  cooldownMs:100,
  assessment:finalized,
  lastPositions:{}
});
Sp.setTopology(topo);

// Build stability by feeding frames across dwell window
Sp.onGazeFrame({
  feats:[-0.8,0.1,-0.4,0,-0.8,0.05,-0.16,0],
  confidence:0.85,yaw:-0.5,faceDetected:true,state:'tracking',blinking:false
},20000);
Sp.onGazeFrame({
  feats:[-0.8,0.1,-0.4,0,-0.8,0.05,-0.16,0],
  confidence:0.85,yaw:-0.5,faceDetected:true,state:'tracking',blinking:false
},20600);

function wait(ms){
  return new Promise(function(resolve){ setTimeout(resolve,ms); });
}

wait(80).then(function(){
  var cmds=ipcLog.map(function(e){ return e.cmd; });
  assert.ok(cmds.indexOf('cmd_gaze_is_ctrl_down')>=0,'queries ctrl when ready');
  assert.ok(cmds.indexOf('cmd_gaze_get_cursor_position')>=0,'reads cursor');
  assert.ok(cmds.indexOf('cmd_gaze_move_cursor_to_monitor')>=0,'moves cursor');
  var move=ipcLog.filter(function(e){ return e.cmd==='cmd_gaze_move_cursor_to_monitor'; })[0];
  assert.strictEqual(move.args.monitorId,'monitor-0');
  assert.ok(Sp.getDebugState().lastAction,'records last action');

  // preview must not invoke move even if somehow confirm gates pass
  ipcLog.length=0;
  Sp.resetRuntime();
  Sp.writeSettings({
    enabled:true,
    mode:'preview',
    minConfidence:0.5,
    dwellMs:300,
    assessment:finalized
  });
  Sp.setTopology(topo);
  Sp.onGazeFrame({
    feats:[-0.8,0.1,-0.4,0,-0.8,0.05,-0.16,0],
    confidence:0.85,yaw:-0.5,faceDetected:true,state:'tracking',blinking:false
  },30000);
  Sp.onGazeFrame({
    feats:[-0.8,0.1,-0.4,0,-0.8,0.05,-0.16,0],
    confidence:0.85,yaw:-0.5,faceDetected:true,state:'tracking',blinking:false
  },30400);
  return wait(50);
}).then(function(){
  assert.strictEqual(ipcLog.length,0,'preview mode issues no move IPC');

  // without Ctrl, confirm must not move
  ipcLog.length=0;
  global.OneToneIpc.invoke=function(cmd,args){
    ipcLog.push({cmd:cmd,args:args||{}});
    if(cmd==='cmd_gaze_is_ctrl_down') return Promise.resolve({down:false});
    if(cmd==='cmd_gaze_get_cursor_position') return Promise.resolve({x:1,y:1,monitorId:'monitor-1'});
    if(cmd==='cmd_gaze_move_cursor_to_monitor') return Promise.resolve({x:0,y:0});
    return Promise.reject(new Error('unexpected'));
  };
  Sp.resetRuntime();
  Sp.writeSettings({
    enabled:true,
    mode:'confirm',
    trigger:'ctrl',
    minConfidence:0.5,
    dwellMs:300,
    cooldownMs:50,
    assessment:finalized
  });
  Sp.setTopology(topo);
  Sp.onGazeFrame({
    feats:[-0.8,0.1,-0.4,0,-0.8,0.05,-0.16,0],
    confidence:0.85,yaw:-0.5,faceDetected:true,state:'tracking',blinking:false
  },40000);
  Sp.onGazeFrame({
    feats:[-0.8,0.1,-0.4,0,-0.8,0.05,-0.16,0],
    confidence:0.85,yaw:-0.5,faceDetected:true,state:'tracking',blinking:false
  },40400);
  return wait(80);
}).then(function(){
  var cmds=ipcLog.map(function(e){ return e.cmd; });
  assert.ok(cmds.indexOf('cmd_gaze_is_ctrl_down')>=0,'queries ctrl when ready');
  assert.ok(cmds.indexOf('cmd_gaze_move_cursor_to_monitor')<0,'no move without Ctrl');

  // Auto mode: no Ctrl query, still moves (even with poor assessment)
  ipcLog.length=0;
  global.OneToneIpc.invoke=function(cmd,args){
    ipcLog.push({cmd:cmd,args:args||{}});
    if(cmd==='cmd_gaze_is_ctrl_down') return Promise.resolve({down:false});
    if(cmd==='cmd_gaze_get_cursor_position'){
      return Promise.resolve({x:50,y:50,monitorId:'monitor-1'});
    }
    if(cmd==='cmd_gaze_move_cursor_to_monitor'){
      return Promise.resolve({x:-960,y:540});
    }
    return Promise.reject(new Error('unexpected:'+cmd));
  };
  Sp.resetRuntime();
  Sp.setAutoMoveEnabled(true);
  Sp.writeSettings({
    enabled:true,
    mode:'auto',
    trigger:'dwell',
    minConfidence:0.5,
    dwellMs:300,
    cooldownMs:50,
    setupConfirmed:true,
    assessment:{status:'ready',quality:'poor',centroids:{},topologyFingerprint:topo.fingerprint}
  });
  assert.strictEqual(Sp.getSettings().mode,'auto');
  Sp.setTopology(topo);
  Sp.onGazeFrame({
    feats:[-0.8,0.1,-0.4,0,-0.8,0.05,-0.16,0],
    confidence:0.85,yaw:-0.5,faceDetected:true,state:'tracking',blinking:false
  },50000);
  Sp.onGazeFrame({
    feats:[-0.8,0.1,-0.4,0,-0.8,0.05,-0.16,0],
    confidence:0.85,yaw:-0.5,faceDetected:true,state:'tracking',blinking:false
  },50400);
  return wait(80);
}).then(function(){
  var cmds=ipcLog.map(function(e){ return e.cmd; });
  assert.ok(cmds.indexOf('cmd_gaze_is_ctrl_down')<0,'auto does not poll Ctrl');
  assert.ok(cmds.indexOf('cmd_gaze_move_cursor_to_monitor')>=0,'auto moves after dwell even when poor');
  var move=ipcLog.filter(function(e){ return e.cmd==='cmd_gaze_move_cursor_to_monitor'; })[0];
  assert.strictEqual(move.args.flash,false);
  assert.strictEqual(move.args.fallback,'center');

  // Stickiness: same monitor must not re-move (prevents flicker/drift)
  var movesBefore=ipcLog.filter(function(e){ return e.cmd==='cmd_gaze_move_cursor_to_monitor'; }).length;
  Sp.onGazeFrame({
    feats:[-0.8,0.1,-0.4,0,-0.8,0.05,-0.16,0],
    confidence:0.85,yaw:-0.5,faceDetected:true,state:'tracking',blinking:false
  },52000);
  Sp.onGazeFrame({
    feats:[-0.8,0.1,-0.4,0,-0.8,0.05,-0.16,0],
    confidence:0.85,yaw:-0.5,faceDetected:true,state:'tracking',blinking:false
  },52800);
  return wait(80).then(function(){
    var movesAfter=ipcLog.filter(function(e){ return e.cmd==='cmd_gaze_move_cursor_to_monitor'; }).length;
    assert.strictEqual(movesAfter,movesBefore,'no re-move while stuck on same landed monitor');

    // landPreference center passes null preferred
    ipcLog.length=0;
    Sp.resetRuntime();
    Sp.writeSettings({
      enabled:true,
      mode:'auto',
      trigger:'dwell',
      minConfidence:0.5,
      dwellMs:300,
      cooldownMs:50,
      landPreference:'center',
      setupConfirmed:true,
      lastPositions:{'monitor-0':{x:-100,y:100}},
      assessment:finalized
    });
    Sp.setTopology(topo);
    Sp.onGazeFrame({
      feats:[-0.8,0.1,-0.4,0,-0.8,0.05,-0.16,0],
      confidence:0.85,yaw:-0.5,faceDetected:true,state:'tracking',blinking:false
    },60000);
    Sp.onGazeFrame({
      feats:[-0.8,0.1,-0.4,0,-0.8,0.05,-0.16,0],
      confidence:0.85,yaw:-0.5,faceDetected:true,state:'tracking',blinking:false
    },60400);
    return wait(80);
  });
}).then(function(){
  var move=ipcLog.filter(function(e){ return e.cmd==='cmd_gaze_move_cursor_to_monitor'; })[0];
  assert.ok(move,'center land still moves');
  assert.strictEqual(move.args.preferred,null,'center preference ignores lastPositions');
  console.log('camera-smart-pointer.test.js OK');
}).catch(function(err){
  console.error(err);
  process.exit(1);
});
