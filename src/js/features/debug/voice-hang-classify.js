/**
 * Classify voice-panel hang signals for Debug → Repair viz.
 * Priority: stall > busy > mismatch > healthy.
 */
(function(global){
  'use strict';

  var STALL_GAP_MS=2000;

  function num(v){
    var n=Number(v);
    return isFinite(n)&&n>0?n:0;
  }

  function classifyHang(snap){
    snap=snap||{};
    var localGap=num(snap.localGapMs);
    var pingAge=num(snap.pingAgeMs);
    var gap=Math.max(localGap,pingAge);
    var ipcHeld=num(snap.ipcHeldMs);
    if(gap>=STALL_GAP_MS||ipcHeld>=STALL_GAP_MS) return 'stall';

    var activateBusy=!!snap.activateBusy;
    var switchInFlight=!!snap.switchInFlight;
    var openSettling=!!snap.openSettling;
    if(activateBusy||switchInFlight||openSettling) return 'busy';

    var desired=String(snap.desiredEngine||'').trim().toLowerCase();
    var active=String(snap.activeEngine||'').trim().toLowerCase();
    if(desired&&desired!=='none'&&active!==desired) return 'mismatch';

    return 'healthy';
  }

  var api={ classifyHang:classifyHang, STALL_GAP_MS:STALL_GAP_MS };
  global.OneToneVoiceHangClassify=api;
  if(typeof module!=='undefined'&&module.exports) module.exports=api;
})(typeof window!=='undefined'?window:typeof globalThis!=='undefined'?globalThis:this);
