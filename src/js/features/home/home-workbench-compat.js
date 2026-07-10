(function(global){
  'use strict';

  function emptyCompat(){
    return {
      status:'unknown',
      deviceLabel:'',
      deviceId:'',
      sawKeydown:false,
      sawKeyup:false,
      supportsHold:false,
      supportsReleaseSend:false,
      supportsTap:false,
      supportsDouble:false,
      recommendedMode:'tap',
      warnings:[],
      updatedAt:0
    };
  }

  function viableHas(modes, mode){
    return Array.isArray(modes)&&modes.indexOf(mode)>=0;
  }

  function normalizeCompatMsg(msg){
    var base=emptyCompat();
    if(!msg||typeof msg!=='object') return base;
    var modes=(msg.viableModes||[]).map(function(x){ return String(x||'').trim(); });
    var verdict=String(msg.verdict||'').trim();
    var recommended=String(msg.recommendedMode||'tap').trim();
    if(recommended!=='hold'&&recommended!=='double') recommended='tap';
    var status='unknown';
    if(msg.testing) status='testing';
    else if(verdict==='hold_ok'||verdict==='pulse_ok') status='ready';
    else if(verdict==='partial') status='partial';
    else if(verdict==='unsupported'||verdict==='no_match') status='unsupported';
    else if(msg.sawKeydown||msg.sawKeyup||msg.deviceLabel) status='partial';

    var supportsHold=viableHas(modes,'hold')||(!!msg.sawKeydown&&!!msg.sawKeyup);
    var supportsTap=viableHas(modes,'tap')||!!msg.sawKeydown;
    var supportsDouble=viableHas(modes,'double');

    var warnings=[];
    var risk=String(msg.risk||'').trim();
    if(risk==='left_mouse') warnings.push('left_mouse');
    if(risk==='scroll_wheel') warnings.push('scroll_wheel');
    if(risk==='vendor_macro') warnings.push('vendor_macro');

    return {
      status:status,
      deviceLabel:String(msg.deviceLabel||msg.device||'').trim(),
      deviceId:String(msg.device||'').trim(),
      sawKeydown:!!msg.sawKeydown,
      sawKeyup:!!msg.sawKeyup,
      supportsHold:supportsHold,
      supportsReleaseSend:supportsHold,
      supportsTap:supportsTap,
      supportsDouble:supportsDouble,
      recommendedMode:recommended,
      warnings:warnings,
      updatedAt:Date.now()
    };
  }

  function storeCompatResult(mappingId, msg){
    var runtime=global.OneToneState&&global.OneToneState.runtime;
    if(!runtime) return null;
    if(!runtime.compatByMapping) runtime.compatByMapping={};
    var id=String(mappingId||'').trim();
    if(!id) return null;
    var normalized=normalizeCompatMsg(msg);
    runtime.compatByMapping[id]=normalized;
    return normalized;
  }

  function getCompatSnapshot(mappingId){
    var runtime=global.OneToneState&&global.OneToneState.runtime;
    var id=String(mappingId||'').trim();
    if(!runtime||!runtime.compatByMapping||!id) return emptyCompat();
    return runtime.compatByMapping[id]||emptyCompat();
  }

  function markCompatTesting(mappingId){
    var runtime=global.OneToneState&&global.OneToneState.runtime;
    if(!runtime) return;
    if(!runtime.compatByMapping) runtime.compatByMapping={};
    var snap=getCompatSnapshot(mappingId);
    snap.status='testing';
    snap.updatedAt=Date.now();
    runtime.compatByMapping[String(mappingId||'').trim()]=snap;
  }

  global.OneToneHomeWorkbenchCompat={
    empty:emptyCompat,
    normalize:normalizeCompatMsg,
    store:storeCompatResult,
    get:getCompatSnapshot,
    markTesting:markCompatTesting
  };
})((typeof window!=='undefined')?window:globalThis);
