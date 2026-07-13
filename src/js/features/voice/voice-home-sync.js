(function(global){
  'use strict';

  function hooks(){ return global.__vp_voice_home_sync_hooks__ || {}; }

  function sync(voskRes,sapiRes,endRes,opts,kwsRes){
    opts=opts||{};
    var st=hooks().state&&hooks().state();
    if(st&&st.config){
      if(voskRes) global.OneToneVoiceWake.syncVoskConfigFromStatus(voskRes);
      if(sapiRes) global.OneToneVoiceWake.syncSapiConfigFromStatus(sapiRes);
      if(kwsRes) global.OneToneVoiceWake.syncKwsConfigFromStatus(kwsRes);
      if(endRes) global.OneToneVoiceEnd.syncConfigFromStatus(endRes);
    }
    if(voskRes||sapiRes||kwsRes||endRes) global.OneToneVoiceUiState.applyStatusFromPoll(voskRes,sapiRes,endRes,kwsRes);
    if(!opts.homeOnly&&!opts.lightOnly) hooks().renderMappingList();
    if(!opts.lightOnly) hooks().renderHome();
    if(opts.lightOnly&&hooks().scheduleRenderHomeLiveZone) hooks().scheduleRenderHomeLiveZone();
    else hooks().renderHomeLiveZone();
  }

  function registerHooks(deps){
    global.__vp_voice_home_sync_hooks__=deps;
  }

  global.OneToneVoiceHomeSync={
    sync:sync,
    registerHooks:registerHooks
  };
})((typeof window!=='undefined')?window:globalThis);
