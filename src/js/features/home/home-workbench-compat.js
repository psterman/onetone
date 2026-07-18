(function(global){
  'use strict';

  function emptyCompat(){
    return {
      status:'unknown',
      verdict:'',
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

  function normalizeVerdict(raw){
    var v=String(raw||'').trim().toLowerCase();
    if(v==='hold_ok') return 'hold_capable';
    if(v==='pulse_ok') return 'pulse_only';
    if(v==='hold_capable'||v==='pulse_only'||v==='unrecognized') return v;
    return v;
  }

  function isHoldMode(mode){
    var raw=String(mode||'').toLowerCase();
    return raw==='hold'||raw==='longpress'||raw==='perpress';
  }

  function normalizeCompatMsg(msg){
    var base=emptyCompat();
    if(!msg||typeof msg!=='object') return base;
    var modes=(msg.viableModes||[]).map(function(x){ return String(x||'').trim(); });
    var verdict=normalizeVerdict(msg.verdict);
    var recommended=String(msg.recommendedMode||'tap').trim();
    if(recommended!=='hold'&&recommended!=='double') recommended='tap';
    var status='unknown';
    if(msg.testing) status='testing';
    else if(verdict==='hold_capable'||verdict==='pulse_only') status='ready';
    else if(verdict==='unrecognized') status='unsupported';
    else if(verdict==='partial') status='partial';
    else if(verdict==='unsupported'||verdict==='no_match') status='unsupported';
    else if(msg.sawKeydown||msg.sawKeyup||msg.deviceLabel) status='partial';

    var supportsHold=viableHas(modes,'hold')||verdict==='hold_capable'||(!!msg.sawKeydown&&!!msg.sawKeyup&&verdict!=='pulse_only');
    if(verdict==='pulse_only') supportsHold=false;
    if(verdict==='hold_capable') supportsHold=true;
    var supportsTap=viableHas(modes,'tap')||!!msg.sawKeydown||verdict==='hold_capable'||verdict==='pulse_only';
    var supportsDouble=viableHas(modes,'double')||verdict==='hold_capable'||verdict==='pulse_only';

    var warnings=[];
    var risk=String(msg.risk||'').trim();
    if(risk==='left_mouse') warnings.push('left_mouse');
    if(risk==='scroll_wheel') warnings.push('scroll_wheel');
    if(risk==='vendor_macro') warnings.push('vendor_macro');

    return {
      status:status,
      verdict:verdict,
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

  /**
   * Gate for selecting/saving hold (longpress).
   * @param {string} mappingId
   * @param {{currentMode?:string}|null} opts
   * @returns {{ok:boolean, reason:string, messageKey:string, legacy:boolean}}
   */
  function canUseHoldMode(mappingId, opts){
    opts=opts||{};
    var legacy=isHoldMode(opts.currentMode);
    var snap=getCompatSnapshot(mappingId);
    var verdict=normalizeVerdict(snap.verdict);
    if(verdict==='hold_capable'||(snap.supportsHold&&snap.status==='ready'&&verdict!=='pulse_only')){
      return {
        ok:true,
        reason:'hold_capable',
        messageKey:'keysHoldGateSupported',
        legacy:legacy
      };
    }
    if(verdict==='pulse_only'||(snap.status==='ready'&&!snap.supportsHold&&(snap.supportsTap||snap.sawKeydown))){
      return {
        ok:false,
        reason:'pulse_only',
        messageKey:'keysHoldGatePulseOnly',
        legacy:legacy
      };
    }
    if(verdict==='unrecognized'||snap.status==='unsupported'){
      return {
        ok:false,
        reason:'unrecognized',
        messageKey:'keysHoldGateUntested',
        legacy:legacy
      };
    }
    return {
      ok:false,
      reason:'untested',
      messageKey:'keysHoldGateUntested',
      legacy:legacy
    };
  }

  global.OneToneHomeWorkbenchCompat={
    empty:emptyCompat,
    normalize:normalizeCompatMsg,
    normalizeVerdict:normalizeVerdict,
    store:storeCompatResult,
    get:getCompatSnapshot,
    markTesting:markCompatTesting,
    canUseHoldMode:canUseHoldMode,
    isHoldMode:isHoldMode
  };
})((typeof window!=='undefined')?window:globalThis);
