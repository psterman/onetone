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

  global.OneToneVoiceUiState={
    snapshot:snapshot,
    voiceListRenderTimer:voiceListRenderTimerFn,
    setVoiceListRenderTimer:setVoiceListRenderTimer,
    applyStatusFromPoll:applyStatusFromPoll,
    patchVoskLive:patchVoskLive
  };
})((typeof window!=='undefined')?window:globalThis);
