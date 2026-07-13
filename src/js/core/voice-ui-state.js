(function(global){
  'use strict';

  var voiceUiSnapshot={
    end:{},
    wake:{engine:'none',phrase:'',state:'off'},
    listen:{paused:false}
  };
  var voiceListRenderTimer=0;

  function snapshot(){ return voiceUiSnapshot; }

  function voiceListRenderTimerFn(){ return voiceListRenderTimer; }

  function setVoiceListRenderTimer(v){ voiceListRenderTimer=v; }

  function applyStatusFromPoll(voskRes,sapiRes,endRes,kwsRes){
    if(voskRes||sapiRes||kwsRes){
      var wake=voiceUiSnapshot.wake||{};
      voiceUiSnapshot.wake=global.OneToneVoiceWake.mergeWakeSnapshot(
        sapiRes||(wake.sapi),
        voskRes||(wake.vosk),
        kwsRes||(wake.kws)
      );
    }
    if(endRes) voiceUiSnapshot.end=Object.assign({},voiceUiSnapshot.end||{},endRes);
  }

  global.OneToneVoiceUiState={
    snapshot:snapshot,
    voiceListRenderTimer:voiceListRenderTimerFn,
    setVoiceListRenderTimer:setVoiceListRenderTimer,
    applyStatusFromPoll:applyStatusFromPoll
  };
})((typeof window!=='undefined')?window:globalThis);
