(function(global){
  'use strict';

  var voiceUiSnapshot={
    end:{},
    wake:{engine:'none',phrase:'',state:'off'},
    listen:{paused:false}
  };
  var voiceListRenderTimer=0;
  var voskLivePushedAt=0;

  function snapshot(){ return voiceUiSnapshot; }

  function voiceListRenderTimerFn(){ return voiceListRenderTimer; }

  function setVoiceListRenderTimer(v){ voiceListRenderTimer=v; }

  function patchVoskLive(kind,text){
    if(typeof text!=='string') return;
    if(!voiceUiSnapshot.wake) voiceUiSnapshot.wake={engine:'none',phrase:'',state:'off'};
    if(!voiceUiSnapshot.wake.vosk) voiceUiSnapshot.wake.vosk={};
    var vosk=voiceUiSnapshot.wake.vosk;
    if(kind==='final'){
      vosk.lastFinal=text;
      vosk.lastPartial='';
    }else{
      vosk.lastPartial=text;
    }
    voskLivePushedAt=Date.now();
  }

  function mergeVoskLiveFromPoll(voskRes){
    if(!voskRes) return voskRes;
    var prev=voiceUiSnapshot.wake&&voiceUiSnapshot.wake.vosk;
    if(!prev) return voskRes;
    var out=Object.assign({},voskRes);
    var st=String(out.state||'').trim();
    var live=st==='listening'||st==='starting'||st==='running'||st==='cooldown'||st==='triggered';
    var age=voskLivePushedAt?(Date.now()-voskLivePushedAt):999999;
    if(!live&&age>30000) return out;
    if(!String(out.lastPartial||'').trim()&&String(prev.lastPartial||'').trim()){
      out.lastPartial=prev.lastPartial;
    }
    if(!String(out.lastFinal||'').trim()&&String(prev.lastFinal||'').trim()){
      out.lastFinal=prev.lastFinal;
    }
    if(!String(out.lastTrigger||'').trim()&&String(prev.lastTrigger||'').trim()){
      out.lastTrigger=prev.lastTrigger;
    }
    return out;
  }

  function applyStatusFromPoll(voskRes,sapiRes,endRes,kwsRes){
    if(voskRes||sapiRes||kwsRes){
      var wake=voiceUiSnapshot.wake||{};
      voiceUiSnapshot.wake=global.OneToneVoiceWake.mergeWakeSnapshot(
        sapiRes||(wake.sapi),
        mergeVoskLiveFromPoll(voskRes)||(wake.vosk),
        kwsRes||(wake.kws)
      );
    }
    if(endRes) voiceUiSnapshot.end=Object.assign({},voiceUiSnapshot.end||{},endRes);
  }

  /** Single read-only projection for home / tray / voiceLab / debug. */
  function getVoiceStatusSnapshot(){
    var summary=null;
    try{
      if(global.OneToneVoiceHomeSummary&&typeof global.OneToneVoiceHomeSummary.compute==='function'){
        summary=global.OneToneVoiceHomeSummary.compute();
      }
    }catch(_){ summary=null; }
    var wake=voiceUiSnapshot.wake||{};
    var end=voiceUiSnapshot.end||{};
    var eng=summary&&summary.engine?String(summary.engine):String(wake.engine||'off');
    if(eng==='none') eng='off';
    var res=null;
    if(eng==='vosk') res=wake.vosk||null;
    else if(eng==='sapi') res=wake.sapi||null;
    else if(eng==='kws') res=wake.kws||null;
    else res=wake.vosk||wake.sapi||wake.kws||null;
    var stateRaw=String((res&&res.state)||(end&&end.state)||'').trim();
    var listening=stateRaw==='listening'||stateRaw==='starting'||stateRaw==='running'||stateRaw==='dictating'||end.state==='dictating';
    var heardText='';
    if(res){
      heardText=String(res.lastFinal||res.lastHeard||res.lastPartial||res.lastDetectedPhrase||'').trim();
    }
    if(!heardText&&summary&&summary.heardText) heardText=String(summary.heardText).trim();
    var lastTrigger=String((res&&(res.lastTrigger||res.lastDetectedPhrase))||(summary&&summary.wakePhrase)||'').trim();
    var error='';
    if(summary&&summary.statusMode==='error') error=String(summary.statusLine||summary.error||'error');
    else if(stateRaw==='error') error=String((res&&(res.lastError||res.resourceIssue))||'error');
    var supervisor=wake.supervisor||{};
    var resourceReady=!(supervisor.degraded&&!supervisor.activeEngine);
    if(res&&(res.stubMode||res.resourceIssue||res.modelMissing||res.modelExists===false||res.dllExists===false)) resourceReady=false;
    var Ready=global.OneToneVoiceEngineReadiness;
    if(Ready&&typeof Ready.isPreferredReady==='function'){
      try{ resourceReady=!!Ready.isPreferredReady()&&resourceReady; }catch(_){}
    }
    return {
      engine:eng,
      mic:summary&&summary.micLabel?String(summary.micLabel):(wake.micLabel||''),
      listening:!!listening,
      wakeState:stateRaw||(summary&&summary.statusMode)||'idle',
      heardText:heardText,
      lastTrigger:lastTrigger,
      error:error,
      resourceReady:!!resourceReady,
      statusLine:summary&&summary.statusLine?String(summary.statusLine):'',
      voiceOn:!!(summary&&summary.voiceOn),
      degraded:!!supervisor.degraded,
      degradedReason:String(supervisor.degradedReason||'')
    };
  }

  global.OneToneVoiceUiState={
    snapshot:snapshot,
    voiceListRenderTimer:voiceListRenderTimerFn,
    setVoiceListRenderTimer:setVoiceListRenderTimer,
    applyStatusFromPoll:applyStatusFromPoll,
    patchVoskLive:patchVoskLive,
    getVoiceStatusSnapshot:getVoiceStatusSnapshot
  };
})((typeof window!=='undefined')?window:globalThis);
