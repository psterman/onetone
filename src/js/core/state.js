(function(global){
  'use strict';
  const state={config:null,selectedMappingId:null,update:null,firstSuccess:false};
  const ui={drawerOpen:false,settingsPanel:'basic',sceneTab:'keys',habitLayer:'global',habitView:'hub',habitHubFilter:'all',habitHubSort:'recent',habitHubViewMode:'list'};
  const runtime={lastAction:'-',timerActive:false,paused:false,events:[]};
  global.OneToneState={state:state,ui:ui,runtime:runtime};
})((typeof window!=='undefined')?window:globalThis);
