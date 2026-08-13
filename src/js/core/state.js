(function(global){
  'use strict';
  const state={config:null,selectedMappingId:null,update:null,firstSuccess:false};
  const ui={drawerOpen:false,settingsPanel:'basic',sceneTab:'keys',habitLayer:'global',habitView:'hub',habitHubFilter:'all',habitHubSort:'manual',habitHubViewMode:'table',habitHubSearchQuery:'',habitHubPeekId:'',habitGuideMode:false,habitHubCreating:false,habitHubMigrateFrom:'',habitHubRenameId:'',habitHubConfirmDelId:'',habitHubSelectedIds:[],habitHubBatchConfirm:false,habitExperienceMode:null,habitWorkspaceChannel:'key',habitWorkspaceItemId:'key-main',habitProgramSection:'scope',habitWorkspaceReturnContext:null,habitProgrammerIntroOpen:false,habitNoviceDim:'key',habitNoviceScene:'begin',habitWorkspaceScrollTop:0,habitWorkspaceFocusSelector:'',voiceEditSchemeId:null,/** @type {'global'|'appScenario'} Camera action write path; never infer override from selectedMappingId alone. */cameraEditMode:'global',habitScenarioTab:'keys',habitScenarioReturnId:null,habitScenarioReturnPanel:null,habitScenarioReturnHub:false,habitHubEditReturn:false};
  const runtime={lastAction:'-',timerActive:false,paused:false,events:[],compatByMapping:{},appStartedAt:Date.now()};
  global.OneToneState={state:state,ui:ui,runtime:runtime};
})((typeof window!=='undefined')?window:globalThis);
