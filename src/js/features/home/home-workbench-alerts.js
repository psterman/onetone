(function(root, factory){
  'use strict';
  var api=factory();
  if(typeof module!=='undefined'&&module.exports){
    module.exports=api;
  }else{
    root.OneToneHomeWorkbenchAlerts=api;
  }
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';

  var SEND_FAILED_WINDOW_MS=5*60*1000;
  var HOLD_MODES={ hold:true, longpress:true, perpress:true };

  function isHoldMode(mode){
    return !!HOLD_MODES[String(mode||'').toLowerCase()];
  }

  function hasRecentSendFailed(recentEvents, nowMs){
    var cutoff=nowMs-SEND_FAILED_WINDOW_MS;
    for(var i=0;i<(recentEvents||[]).length;i++){
      var evt=recentEvents[i];
      if(!evt||String(evt.kind||'')!=='voice_send_failed') continue;
      var ts=Number(evt.tsMs||evt.ts_ms)||0;
      if(ts>=cutoff) return true;
    }
    return false;
  }

  function isHoldUnsupported(compatSnapshot, triggerMode){
    var compat=compatSnapshot||{};
    var status=String(compat.status||'');
    if(status==='partial'||status==='unsupported') return true;
    if(isHoldMode(triggerMode)&&compat.supportsHold===false) return true;
    return false;
  }

  function isRecognitionError(summary, homeStatusMode){
    var s=summary||{};
    if(s.statusMode==='error') return true;
    if(homeStatusMode==='error') return true;
    if(s.engineOffline) return true;
    return false;
  }

  /**
   * @param {object} input
   * @param {boolean} input.paused
   * @param {object} input.summary
   * @param {string} [input.summary.statusMode]
   * @param {string} [input.summary.engine]
   * @param {boolean} [input.summary.engineOffline]
   * @param {boolean} [input.summary.micUnavailable]
   * @param {object} input.compatSnapshot
   * @param {string} input.triggerMode
   * @param {Array} input.recentEvents
   * @param {string} [input.homeStatusMode]
   * @param {number} [input.nowMs]
   * @returns {null|{kind:string,textKey:string,action:object}}
   */
  function pickPrimaryAlert(input){
    input=input||{};
    var nowMs=Number(input.nowMs)||Date.now();

    if(input.paused){
      return {
        kind:'paused',
        textKey:'homeWbAlertPaused',
        action:{ type:'resumeListening' }
      };
    }

    if(isRecognitionError(input.summary, input.homeStatusMode)){
      return {
        kind:'recognition_error',
        textKey:'homeWbAlertRecogError',
        action:{ type:'openSettings', panel:'debug', debugMode:'diagnostics' }
      };
    }

    if(input.summary&&input.summary.micUnavailable){
      return {
        kind:'mic_unavailable',
        textKey:'homeWbAlertMicUnavailable',
        action:{ type:'openSettings', panel:'voiceWake', focus:'mic' }
      };
    }

    if(isHoldUnsupported(input.compatSnapshot, input.triggerMode)){
      return {
        kind:'hold_unsupported',
        textKey:'homeWbAlertHoldUnsupported',
        action:{ type:'openSettings', panel:'keys' }
      };
    }

    if(hasRecentSendFailed(input.recentEvents, nowMs)){
      return {
        kind:'send_failed',
        textKey:'homeWbAlertSendFailed',
        action:{ type:'openSettings', panel:'debug', debugMode:'diagnostics' }
      };
    }

    return null;
  }

  return {
    pickPrimaryAlert:pickPrimaryAlert,
    isHoldMode:isHoldMode,
    hasRecentSendFailed:hasRecentSendFailed
  };
});
