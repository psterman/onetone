(function(global){
  'use strict';
  const state={config:null,selectedMappingId:null,update:null,firstSuccess:false};
  const ui={drawerOpen:false,settingsPanel:'basic',sceneTab:'keys',habitLayer:'global',habitView:'hub',habitHubFilter:'all',habitHubSort:'manual',habitHubViewMode:'list',habitGuideMode:false,habitHubCreating:false,habitHubMigrateFrom:'',habitHubRenameId:'',habitHubConfirmDelId:'',habitHubSelectedIds:[],habitHubBatchConfirm:false,voiceEditSchemeId:null,habitScenarioTab:'keys',habitScenarioReturnId:null,habitScenarioReturnPanel:null,habitScenarioReturnHub:false,habitHubEditReturn:false};
  const runtime={lastAction:'-',timerActive:false,paused:false,events:[],compatByMapping:{},appStartedAt:Date.now()};
  global.OneToneState={state:state,ui:ui,runtime:runtime};
})((typeof window!=='undefined')?window:globalThis);
